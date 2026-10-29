"""Optional text-only advisor. Credentials remain on the server."""
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

KNOWLEDGE = (Path(__file__).resolve().parent / 'advisor-knowledge.md').read_text(encoding='utf-8')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def answer(data):
    base = os.environ.get('ADVISOR_API_BASE', '').rstrip('/')
    model = os.environ.get('ADVISOR_MODEL', '')
    key = os.environ.get('ADVISOR_API_KEY', '')
    if not (base and model and key):
        raise RuntimeError('文字模型尚未配置')
    url = urllib.parse.urlsplit(base)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise RuntimeError('文字模型地址配置无效')
    messages = data.get('messages') if isinstance(data, dict) else None
    if not isinstance(messages, list) or not 1 <= len(messages) <= 12:
        raise ValueError('对话格式不正确')
    clean = []
    for item in messages:
        if not isinstance(item, dict) or item.get('role') not in ('user', 'assistant') or not isinstance(item.get('content'), str) or not 1 <= len(item['content']) <= 3000:
            raise ValueError('对话内容不正确')
        clean.append({'role': item['role'], 'content': item['content']})
    if clean[-1]['role'] != 'user':
        raise ValueError('请先输入问题')
    payload = json.dumps({'model': model, 'messages': [{'role': 'system', 'content': KNOWLEDGE}] + clean, 'stream': False, 'max_completion_tokens': 2048, 'thinking': {'type': 'disabled'}}, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(base + '/chat/completions', data=payload, headers={'Content-Type':'application/json', 'Authorization':'Bearer '+key}, method='POST')
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
            raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise RuntimeError('文字模型响应过大')
        content = json.loads(raw)['choices'][0]['message']['content']
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError('文字模型未返回回答')
        return content[:12000]
    except (urllib.error.URLError, KeyError, IndexError, TypeError, ValueError, OSError) as exc:
        raise RuntimeError('文字模型暂时不可用') from exc
