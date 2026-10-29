"""Local image editor with server-owned image provider credentials and model."""
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import base64
import datetime as dt
import json
import hashlib
import ipaddress
import os
from pathlib import Path
import re
import secrets
import threading
import urllib.parse
import uuid
import image_client as image_api

ROOT = Path(__file__).resolve().parent
USER_STATE = Path(os.environ.get('WORKBENCH_DATA_DIR', str(Path.home() / '.ai-portfolio-studio' / 'image-workbench')))
image_api.RESULTS = USER_STATE / 'results'
RESULTS = image_api.RESULTS
PORT = int(os.environ.get('WORKBENCH_PORT', 8767))
VERSION = '3.6.2-open-source'
BIND_HOST = 'localhost'
ALLOWED_HOSTS = {'localhost'}
SIZES = ('1024*1024', '1024*1536', '1536*1024', '2048*2048')
MAX_REQUEST = 44 * 1024 * 1024
MAX_IMAGE = 10 * 1024 * 1024
MAX_PENDING = 3
TOKEN = secrets.token_urlsafe(32)
JOBS = {}
LOCK = threading.Lock()
QUEUE = ThreadPoolExecutor(max_workers=1, thread_name_prefix='chun-image')

JOB_STATE = Path(os.environ.get('WORKBENCH_JOB_STATE_DIR', str(USER_STATE / 'image-jobs')))


def persist_job(job):
    JOB_STATE.mkdir(parents=True, exist_ok=True)
    target = JOB_STATE / (job['id'] + '.json')
    temp = JOB_STATE / (job['id'] + '.' + uuid.uuid4().hex + '.tmp')
    temp.write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')
    os.replace(temp, target)


def stored_job(job_id):
    if job_id in JOBS:
        return JOBS[job_id]
    target = JOB_STATE / (job_id + '.json')
    if not target.is_file():
        return None
    job = json.loads(target.read_text(encoding='utf-8'))
    if job.get('id') != job_id:
        raise ValueError('任务记录不匹配。')
    if job['status'] in ('queued', 'running'):
        job.update(status='failed', user_message='服务曾中断，该任务结果尚不确定。请管理员核对后再生成，系统不会自动重复扣费。')
        persist_job(job)
    JOBS[job_id] = job
    return job


def submit_image_job(data, request_id=None):
    if request_id is not None and not re.fullmatch(r'[a-f0-9]{32}', request_id):
        raise ValueError('任务编号格式不正确。')
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
    job_id = request_id or uuid.uuid4().hex
    with LOCK:
        existing = stored_job(job_id)
        if existing:
            if existing.get('fingerprint') != fingerprint:
                raise ValueError('同一任务编号不能用于不同图片或要求。')
            return existing
        if sum(j['status'] in ('queued', 'running') for j in JOBS.values()) >= MAX_PENDING:
            return None
        completed = [k for k, j in JOBS.items() if j['status'] not in ('queued', 'running')]
        for key in completed[:-100]:
            JOBS.pop(key, None)
        job = {'id': job_id, 'status': 'queued', 'fingerprint': fingerprint}
        persist_job(job)
        JOBS[job_id] = job
    QUEUE.submit(run_job, job_id, data)
    return job


def validate_request(data):
    if not isinstance(data, dict):
        raise ValueError('请求内容必须是对象。')
    prompt = data.get('prompt')
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 16000:
        raise ValueError('请填写 1–16000 字的生成要求。')
    size = data.get('size', '1024*1024')
    legacy = {('1K', '1:1'): '1024*1024', ('1K', '2:3'): '1024*1536',
              ('1K', '3:2'): '1536*1024', ('2K', '1:1'): '2048*2048'}
    if isinstance(size, str):
        size = legacy.get((size, data.get('ratio', '1:1')), size)
    if size not in SIZES:
        raise ValueError('请选择支持的输出尺寸。')
    images = data.get('images', [])
    if not isinstance(images, list) or len(images) > 3:
        raise ValueError('最多提供 3 张参考图片。')
    for image in images:
        if not isinstance(image, str) or len(image) > 14 * 1024 * 1024:
            raise ValueError('参考图片过大，每张最多 10 MB。')
        match = re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)', image)
        if not match:
            raise ValueError('参考图片仅支持 PNG、JPG、WebP。')
        try:
            raw = base64.b64decode(match[2], validate=True)
        except ValueError:
            raise ValueError('参考图片数据损坏，请重新导入。') from None
        mime = ('png' if raw.startswith(b'\x89PNG\r\n\x1a\n') else
                'jpeg' if raw.startswith(b'\xff\xd8\xff') else
                'webp' if raw[:4] == b'RIFF' and raw[8:12] == b'WEBP' else None)
        if mime != match[1] or len(raw) > MAX_IMAGE:
            raise ValueError('参考图片格式错误或超过 10 MB。')
    # Model choice and fallback are deliberately absent from client input.
    return {'prompt': prompt.strip(), 'images': images, 'size': size}


def friendly_error(exc):
    if isinstance(exc, image_api.APIError):
        if exc.code in ('AccessDenied.Unpurchased', 'Model.AccessDenied', 'Workspace.AccessDenied', 'Endpoint.AccessDenied'):
            return '图片服务未开通或无调用权限，请管理员检查服务和模型授权。'
        if exc.status == 401 or exc.code == 'InvalidApiKey':
            return '图片服务凭据无效或已过期，请管理员更新配置。'
        if exc.status == 402:
            return '图片服务额度不足，请联系管理员。'
        if exc.code in ('DataInspectionFailed', 'ContentPolicyViolation'):
            return '请调整图片或描述后再试。'
        if exc.status == 429:
            return '当前请求较多，请稍后重试。'
        if exc.code == 'ConnectionFailed':
            return '图片服务连接中断，任务结果尚不确定，请先联系管理员确认后再试。'
        if exc.code == 'DownloadFailed':
            return '图片已返回但下载失败，请联系管理员确认结果。'
    return '本次生成未完成，请稍后重试；持续失败时请联系管理员。'


def public_job(job):
    public = {'id': job['id'], 'status': job['status']}
    if job['status'] == 'succeeded':
        record = job['result']
        public['result'] = {key: record[key] for key in ('id', 'image_url', 'created_at', 'reference_count')}
    elif job['status'] == 'failed':
        public['error'] = {'message': job['user_message']}
    return public


def run_job(job_id, data):
    attempted_model = image_api.MODEL
    with LOCK:
        JOBS[job_id]['status'] = 'running'
        persist_job(JOBS[job_id])
    try:
        RESULTS.mkdir(parents=True, exist_ok=True)
        record = image_api.generate(data['prompt'], data['images'], data['size'])
        with LOCK:
            JOBS[job_id].update(status='succeeded', result=record)
            persist_job(JOBS[job_id])
    except Exception as exc:
        with LOCK:
            JOBS[job_id].update(status='failed', user_message=friendly_error(exc))
            persist_job(JOBS[job_id])
        USER_STATE.mkdir(parents=True, exist_ok=True)
        detail = {'job_id': job_id, 'time': dt.datetime.now().astimezone().isoformat(),
                  'model': attempted_model, 'error': image_api.redact(str(exc))}
        if isinstance(exc, image_api.APIError):
            detail['provider'] = exc.as_dict()
        with (USER_STATE / 'image-errors.jsonl').open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(detail, ensure_ascii=False) + '\n')


class Handler(BaseHTTPRequestHandler):
    server_version = 'ChunImageWorkbench/3.0'

    def log_message(self, *_):
        pass

    def reply(self, body, content_type='application/json; charset=utf-8', status=200):
        self.send_response(status)
        for name, value in {
            'Content-Type': content_type, 'Content-Length': str(len(body)),
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        }.items():
            self.send_header(name, value)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def json_reply(self, value, status=200):
        self.reply(json.dumps(value, ensure_ascii=False).encode('utf-8'), status=status)

    def allowed(self):
        port = self.server.server_port
        authority = self.headers.get('Host', '').lower()
        try:
            parsed = urllib.parse.urlsplit('http://' + authority)
            valid_host = (parsed.hostname in ALLOWED_HOSTS and parsed.port == port
                          and not parsed.username and not parsed.password and not parsed.path
                          and not parsed.query and not parsed.fragment)
        except ValueError:
            valid_host = False
        if not ipaddress.ip_address(self.client_address[0]).is_loopback or not valid_host:
            self.json_reply({'error': '访问地址不被允许。'}, 403)
            return False
        origin = self.headers.get('Origin')
        if origin and origin != f'http://{authority}':
            self.json_reply({'error': '请求来源不被允许。'}, 403)
            return False
        return True

    def do_GET(self):
        if not self.allowed():
            return
        path = urllib.parse.urlparse(self.path).path
        if path in ('/', '/index.html'):
            self.reply((ROOT / 'index.html').read_bytes(), 'text/html; charset=utf-8')
        elif path in ('/image-advisor.js', '/image-advisor.css'):
            mime = 'application/javascript; charset=utf-8' if path.endswith('.js') else 'text/css; charset=utf-8'
            self.reply((ROOT / path[1:]).read_bytes(), mime)
        elif path == '/batch-workbench.js':
            self.reply((ROOT / 'batch-workbench.js').read_bytes(), 'application/javascript; charset=utf-8')
        elif path == '/gift-layout.js':
            self.reply((ROOT / 'gift-layout.js').read_bytes(), 'application/javascript; charset=utf-8')
        elif path == '/sku-layout.js':
            self.reply((ROOT / 'sku-layout.js').read_bytes(), 'application/javascript; charset=utf-8')
        elif path == '/logo-library.json':
            self.reply((ROOT / 'logo-library.json').read_bytes())
        elif re.fullmatch(r'/logo-library/[a-z0-9-]{1,80}\.png', path):
            target = ROOT / 'logo-library' / path.rsplit('/', 1)[-1]
            if target.is_file():
                self.reply(target.read_bytes(), 'image/png')
            else:
                self.json_reply({'error': '找不到标识图片。'}, 404)
        elif path == '/api/health':
            configured = image_api.configured()
            with LOCK:
                pending = sum(job['status'] in ('queued', 'running') for job in JOBS.values())
            self.json_reply({'app': 'chun-image-workbench', 'version': VERSION, 'provider': 'configurable', 'pendingJobs': pending, 'idempotentJobs': True,
                             'lanEnabled': False, 'lanUrls': [],
                             'localBackgroundRemoval': True, 'seriesLayout': True, 'configured': configured, 'token': TOKEN, 'maxImages': 3,
                             'maxImageBytes': MAX_IMAGE, 'sizes': SIZES})
        elif re.fullmatch(r'/api/series/jobs/[a-f0-9]{32}', path):
            import series_layout
            result = series_layout.get_job(path.rsplit('/', 1)[-1])
            self.json_reply(result or {'error': '找不到该母图准备任务。'}, 200 if result else 404)
        elif re.fullmatch(r'/api/jobs/[a-f0-9]{32}', path):
            with LOCK:
                job = stored_job(path.rsplit('/', 1)[-1])
                result = public_job(job) if job else None
            self.json_reply(result or {'error': '找不到该任务，请联系管理员确认结果。'}, 200 if result else 404)
        elif re.fullmatch(r'/results/[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.png', path):
            target = RESULTS / path.rsplit('/', 1)[-1]
            if target.is_file():
                self.reply(target.read_bytes(), 'image/png')
            else:
                self.json_reply({'error': '找不到生成图片。'}, 404)
        else:
            self.json_reply({'error': '页面不存在。'}, 404)

    def do_POST(self):
        if not self.allowed():
            return
        if self.path not in ('/api/jobs', '/api/remove-background', '/api/advisor', '/api/series/analyze', '/api/series/prepare', '/api/series/product-facts'):
            self.json_reply({'error': '接口不存在。'}, 404)
            return
        if not secrets.compare_digest(self.headers.get('X-Workbench-Token', ''), TOKEN):
            self.json_reply({'error': '页面会话已过期，请刷新后重试。'}, 403)
            return
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            self.json_reply({'error': '请求必须使用 JSON。'}, 415)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_REQUEST:
                self.json_reply({'error': '参考图片总大小超过限制。'}, 413)
                return
            incoming = json.loads(self.rfile.read(length))
            if self.path.startswith('/api/series/'):
                import series_layout
                try:
                    method = {'/api/series/analyze': series_layout.analyze,
                              '/api/series/prepare': series_layout.prepare,
                              '/api/series/product-facts': series_layout.product_facts}[self.path]
                    result = method(incoming)
                    self.json_reply(result, 202 if result.get('status') in ('queued', 'running') else 200)
                except RuntimeError as exc:
                    self.json_reply({'error': str(exc)}, 503)
                return
            if self.path == '/api/advisor':
                if length > 50000:
                    self.json_reply({'error': '对话内容过长。'}, 413)
                    return
                import image_advisor
                try:
                    self.json_reply({'answer': image_advisor.answer(incoming)})
                except RuntimeError:
                    self.json_reply({'error': '图片顾问文字服务暂不可用。'}, 503)
                return
            if self.path == '/api/remove-background':
                if not isinstance(incoming, dict):
                    raise ValueError('图片请求格式不正确。')
                from background_cutout import remove_background
                try:
                    image = remove_background(incoming.get('image'))
                except RuntimeError as exc:
                    self.json_reply({'error': str(exc)}, 429)
                    return
                except ImportError:
                    self.json_reply({'error': '本地抠图组件未就绪，请联系管理员检查安装。'}, 503)
                    return
                self.json_reply({'image': image})
                return
            if not image_api.configured():
                self.json_reply({'error': '图片服务尚未配置；本地编辑和导出仍可使用。'}, 503)
                return
            data = validate_request(incoming)
            job = submit_image_job(data, incoming.get('request_id'))
            if job is None:
                self.json_reply({'error': '当前任务较多，请稍后再提交。'}, 429)
                return
            self.json_reply(public_job(job), 202)
        except (ValueError, TypeError) as exc:
            self.json_reply({'error': image_api.redact(str(exc))}, 400)
        except Exception:
            self.json_reply({'error': '图片处理失败，请重试；持续失败时请联系管理员。'}, 500)


if __name__ == '__main__':
    server = ThreadingHTTPServer((BIND_HOST, PORT), Handler)
    print(f'图片工作台已启动：http://localhost:{PORT}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        QUEUE.shutdown(wait=True)
