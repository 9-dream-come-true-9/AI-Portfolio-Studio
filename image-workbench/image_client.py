"""Server-only image provider adapter. One submission per job; no paid fallback/retry."""
from __future__ import annotations
import base64
import datetime as dt
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent
MODEL = os.environ.get('IMAGE_MODEL', '').strip()
STATE = Path(os.environ.get('WORKBENCH_DATA_DIR', str(Path.home() / '.ai-portfolio-studio' / 'image-workbench')))
RESULTS = STATE / 'results'
SIZES = {'1024*1024': ('1:1', '1K'), '1024*1536': ('2:3', '1K'),
         '1536*1024': ('3:2', '1K'), '2048*2048': ('1:1', '2K')}
MAX_IMAGE = 40 * 1024 * 1024
MAX_RESPONSE = 56 * 1024 * 1024


def redact(value):
    text = re.sub(r'(?:sk-|key-)[A-Za-z0-9_.-]+', '[REDACTED]', str(value))
    return re.sub(r'(?i)(Bearer\s+)[^\s"\'<>]+', r'\1[REDACTED]', text)


class APIError(Exception):
    def __init__(self, status, code, message, request_id=None):
        self.status, self.code = status, redact(code)
        self.message, self.request_id = redact(message), redact(request_id) if request_id else None
        super().__init__(f'{status}: {self.code}: {self.message}')

    def as_dict(self):
        return dict(status=self.status, code=self.code, message=self.message, request_id=self.request_id)


def configured():
    return bool(os.environ.get('IMAGE_API_BASE') and os.environ.get('IMAGE_API_KEY') and MODEL)


def load_key():
    key = os.environ.get('IMAGE_API_KEY', '')
    if not key:
        raise ValueError('Image provider credentials are not configured.')
    return key


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward a credential or resubmit a generation through a redirect.
        return None


def base_url():
    url = os.environ.get('IMAGE_API_BASE', '').rstrip('/')
    parts = urllib.parse.urlsplit(url)
    if (parts.scheme != 'https' or not parts.hostname or parts.username
            or parts.password or parts.path != '/v1' or parts.query or parts.fragment):
        raise ValueError('Invalid image provider configuration.')
    return url


def api_request(path, payload=None, timeout=300):
    allowed = ('/images/generations', '/images/edits') if payload is not None else ('/models',)
    if path not in allowed or (payload is not None and payload.get('model') != MODEL):
        raise ValueError('Unsupported image request; no alternate model is permitted.')
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(base_url() + path, data=body,
        headers={'Authorization': 'Bearer ' + load_key(), 'Content-Type': 'application/json'},
        method='GET' if payload is None else 'POST')
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout) as response:
            raw = response.read(MAX_RESPONSE + 1)
        if len(raw) > MAX_RESPONSE:
            raise APIError(502, 'InvalidResponse', 'Image response exceeds the size limit.')
        result = json.loads(raw)
    except urllib.error.HTTPError as exc:
        try:
            error = json.loads(exc.read(65536)).get('error', {})
            if not isinstance(error, dict):
                error = {}
        except (ValueError, AttributeError):
            error = {}
        raise APIError(exc.code, error.get('code', 'HTTPError'),
            error.get('message', 'Image provider rejected the request.'), exc.headers.get('x-request-id')) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        # A timeout may follow a charged submission. Never automatically resubmit.
        raise APIError(502, 'ConnectionFailed', 'Image service connection failed; request was not retried.') from None
    except (ValueError, UnicodeError):
        raise APIError(502, 'InvalidResponse', 'Image provider returned invalid JSON.') from None
    if not isinstance(result, dict) or result.get('error'):
        raise APIError(502, 'InvalidResponse', 'Image provider did not return a successful response.')
    return result


def check_connection():
    result = api_request('/models', timeout=30)
    selected = next((m for m in result.get('data', []) if isinstance(m, dict) and m.get('id') == MODEL), None)
    if not selected:
        raise APIError(403, 'Model.AccessDenied', 'Configured image model is unavailable to this API key.')
    return {'provider': 'configurable', 'model': MODEL, 'authenticated': True,
            'resolutions': selected.get('resolutions'), 'aspect_ratios': selected.get('aspect_ratios')}


def image_bytes(item):
    if not isinstance(item, dict):
        raise APIError(502, 'InvalidImage', 'Missing image result.')
    if item.get('b64_json'):
        try:
            raw = base64.b64decode(item['b64_json'], validate=True)
        except (ValueError, TypeError):
            raise APIError(502, 'InvalidImage', 'Invalid base64 image result.') from None
    else:
        url = item.get('url')
        if not isinstance(url, str) or not url:
            raise APIError(502, 'InvalidImage', 'Missing image download URL.')
        url = urllib.parse.urljoin(base_url() + '/', url)
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password:
            raise APIError(502, 'InvalidImage', 'Unsupported image download URL.')
        try:
            # Deliberately no Authorization, even for provider-hosted images.
            with urllib.request.urlopen(urllib.request.Request(url), timeout=120) as response:
                raw = response.read(MAX_IMAGE + 1)
        except (urllib.error.URLError, TimeoutError, OSError):
            raise APIError(502, 'DownloadFailed', 'Image download failed; generation was not repeated.') from None
    if len(raw) > MAX_IMAGE or len(raw) < 24 or not raw.startswith(b'\x89PNG\r\n\x1a\n') or raw[12:16] != b'IHDR':
        raise APIError(502, 'InvalidImage', 'Expected a PNG image within the size limit.')
    return raw


def generate(prompt, images, size):
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 16000 or size not in SIZES:
        raise ValueError('Invalid image prompt or size.')
    if not isinstance(images, list) or len(images) > 3:
        raise ValueError('At most three reference images are supported.')
    total = 0
    for image in images:
        match = re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)', image) if isinstance(image, str) else None
        if not match:
            raise ValueError('Reference images must be PNG, JPEG or WebP data URLs.')
        try:
            raw = base64.b64decode(match[2], validate=True)
        except ValueError:
            raise ValueError('Invalid reference image data.') from None
        valid = (raw.startswith(b'\x89PNG\r\n\x1a\n') if match[1] == 'png' else
                 raw.startswith(b'\xff\xd8\xff') if match[1] == 'jpeg' else
                 raw[:4] == b'RIFF' and raw[8:12] == b'WEBP')
        if not valid or len(raw) > 10 * 1024 * 1024:
            raise ValueError('Invalid reference format or reference exceeds 10 MB.')
        total += len(raw)
    if total > 30 * 1024 * 1024:
        raise ValueError('Reference images exceed 30 MB combined.')
    ratio, resolution = SIZES[size]
    payload = {'model': MODEL, 'prompt': prompt.strip(), 'aspect_ratio': ratio,
               'resolution': resolution, 'quality': 'low', 'n': 1, 'response_format': 'url'}
    if images:
        payload['images'] = [{'image_url': image} for image in images]
    result = api_request('/images/edits' if images else '/images/generations', payload)
    output = result.get('data')
    if not isinstance(output, list) or len(output) != 1:
        raise APIError(502, 'InvalidResponse', 'Expected exactly one output image; no retry was submitted.')
    raw = image_bytes(output[0])
    RESULTS.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8]
    record = {'id': stamp, 'image_url': f'/results/{stamp}.png',
              'created_at': dt.datetime.now().astimezone().isoformat(),
              'provider': 'configurable', 'model': MODEL, 'reference_count': len(images),
              'size': size, 'aspect_ratio': ratio, 'resolution': resolution}
    if isinstance(result.get('usage'), dict):
        record['usage'] = {k: v for k, v in result['usage'].items()
                           if k in ('charged', 'remaining') and isinstance(v, (int, float))}
    (RESULTS / (stamp + '.png')).write_bytes(raw)
    (RESULTS / (stamp + '.json')).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    return record


if __name__ == '__main__':
    print(json.dumps(check_connection(), ensure_ascii=False))
