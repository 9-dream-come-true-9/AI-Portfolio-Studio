"""Read-only gift asset catalogue and MiMo name matching."""
from difflib import SequenceMatcher
from functools import lru_cache
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

from image_advisor import NoRedirect, settings

ASSET_DIR = Path(__file__).resolve().parent / 'gift-assets'
EXAMPLE_DIR = Path(__file__).resolve().parent / 'gift-examples'
TEXT_INDEX = Path(__file__).resolve().with_name('gift-example-text.json')
ALIAS_INDEX = Path(__file__).resolve().with_name('gift-brand-aliases.json')


@lru_cache(maxsize=1)
def example_text():
    if not TEXT_INDEX.is_file():
        return {}
    data = json.loads(TEXT_INDEX.read_text(encoding='utf-8'))
    return {item['id']: item for item in data.get('items', [])}


@lru_cache(maxsize=1)
def brand_aliases():
    aliases = json.loads(ALIAS_INDEX.read_text(encoding='utf-8')).get('aliases', {}) if ALIAS_INDEX.is_file() else {}
    # These pairs are also visible in the supplied example images and OCR text.
    aliases.update({
        'ALGENIST':['奥杰尼'], 'DALTON':['德海顿','达尔顿'],
        'ANNE SEMONIN':['安赛梦'], 'ARSOA':['安露莎'],
        'Acaderm':['绿洲','阿卡德姆'], 'MyCli':['麦可莉'],
        'MY ORGANICS':['狗头'], 'SKINMEDICA':['斯美凯'],
        'DS DERMASENSA HYDRO BF':['德玛森'], 'DS DERMASENSA TRIEFFECT':['德玛森']
    })
    return aliases


@lru_cache(maxsize=1)
def catalogue():
    result = {}
    for kind, folder in [('asset', ASSET_DIR), ('example', EXAMPLE_DIR)]:
        if not folder.is_dir():
            continue
        for path in sorted([*folder.glob('*.png'), *folder.glob('*.webp')]):
            key = sha256((kind + ':' + path.name).encode()).hexdigest()[:16]
            result[key] = {'id': key, 'name': path.stem, 'kind': kind,
                           'url': f'/gift-catalog/{key}{path.suffix.lower()}', 'path': path}
    return result


def public(item):
    result = {**{key: item[key] for key in ('id', 'name', 'kind', 'url')},
            'previewUrl': f'/gift-catalog/{item["id"]}/preview.png',
            'detailUrl': f'/gift-catalog/{item["id"]}/detail.png'}
    if item['kind'] == 'example':
        result['lines'] = [line for line in example_text().get(item['id'], {}).get('lines', [])
                           if line['confidence'] >= .62 and re.search(r'[\u4e00-\u9fff]', line['text'])][:16]
    return result


def file_for(asset_id):
    item = catalogue().get(asset_id)
    return item['path'] if item else None


@lru_cache(maxsize=512)
def preview_for(asset_id, detail=False):
    item = catalogue().get(asset_id)
    if not item:
        return None
    from PIL import Image
    with Image.open(item['path']) as source:
        picture = source.convert('RGBA')
        bounds = picture.getchannel('A').getbbox()
        if bounds:
            picture = picture.crop(bounds)
        size = 1200 if detail else 360
        picture.thumbnail((size, size), Image.Resampling.LANCZOS)
        output = BytesIO()
        picture.save(output, 'PNG', optimize=True)
        return output.getvalue()


def norm(value):
    return re.sub(r'[^a-z0-9\u4e00-\u9fff]+', '', value.lower())


def score(query, name):
    q, n = norm(query), norm(name)
    if not q:
        return 0
    return (8 if q == n else 5 if q in n else 0) + 2 * SequenceMatcher(None, q, n).ratio() + sum(c in n for c in set(q)) / max(1, len(set(q)))


def examples(query='', offset=0, limit=24):
    items = [item for item in catalogue().values() if item['kind'] == 'example']
    if query:
        text = example_text()
        terms = [norm(part) for part in query.split() if norm(part)]
        def searchable(item):
            copy = ' '.join(line['text'] for line in text.get(item['id'], {}).get('lines', []))
            return norm(item['name'] + copy)
        items = [item for item in items if all(term in searchable(item) for term in terms)]
        items.sort(key=lambda item: score(query, item['name']), reverse=True)
    return {'total': len(items), 'items': [public(item) for item in items[offset:offset + limit]]}


def assets(query='', offset=0, limit=30):
    items = [item for item in catalogue().values() if item['kind'] == 'asset']
    if query:
        items = [item for item in items if norm(query) in norm(item['name'])]
    return {'total': len(items), 'items': [public(item) for item in items[offset:offset + limit]]}


def english_brands():
    names = set()
    for item in catalogue().values():
        if item['kind'] != 'asset':
            continue
        match = re.match(r'^[A-Za-z][A-Za-z0-9 ._-]*', item['name'])
        if match:
            names.add(match.group().strip())
    return sorted(names)


def mimo_order(query, candidates):
    base, model, key = settings()
    names = '\n'.join(f'{index}: {item["name"]}' for index, item in enumerate(candidates))
    payload = json.dumps({'model': model, 'messages': [
        {'role': 'system', 'content': '你是美妆赠品素材库检索员。仔细核对全部文件名，匹配商品名称及可信的中英文品牌别名（例如杜克=修丽可）、规格和品类。只返回真正相关的候选，绝不推荐无关商品。没有相关文件时只输出 NONE；有结果时只输出索引数字，以英文逗号分隔，最多12个。不要编造文件。'},
        {'role': 'user', 'content': f'用户查找：{query}\n透明PNG候选：\n{names}'}],
        'stream': False, 'max_completion_tokens': 160, 'thinking': {'type': 'disabled'}}, ensure_ascii=False).encode()
    request = urllib.request.Request(base + '/chat/completions', data=payload,
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key}, method='POST')
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
            answer = json.load(response)['choices'][0]['message']['content']
        indices = [int(part) for part in re.findall(r'\d+', answer) if int(part) < len(candidates)]
        return list(dict.fromkeys(indices))[:12]
    except (urllib.error.URLError, OSError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise RuntimeError('文字模型检索暂不可用。') from exc


def search(data):
    query = data.get('name', '') if isinstance(data, dict) else ''
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 100:
        raise ValueError('请输入 1–100 字的赠品名称。')
    query = query.strip()
    items = [item for item in catalogue().values() if item['kind'] == 'asset']
    if not items:
        return {'model': '本地文件名匹配', 'warning': '素材库为空；请在本机导入赠品图片。',
                'items': [], 'examples': examples(query, 0, 12)}
    candidates = sorted(items, key=lambda item: score(query, item['name']), reverse=True)
    warning = ''
    try:
        order = mimo_order(query, candidates)
        model = os.environ.get('ADVISOR_MODEL', '')
    except RuntimeError as exc:
        order = []
        model = '本地文件名匹配'
        warning = str(exc)
    matched_brands = [brand for brand, aliases in brand_aliases().items()
                      if any(norm(alias) in norm(query) for alias in aliases if alias)]
    alias_items = [item for item in candidates for brand in matched_brands
                   if norm(item['name']).startswith(norm(brand))]
    ranked = list(dict((item['id'], item) for item in [*alias_items, *[candidates[i] for i in order]]).values())
    if not ranked and re.search(r'[\u4e00-\u9fff]', query):
        try:
            brands = english_brands()
            matched_brands = [brands[i] for i in mimo_order(query, [{'name': brand} for brand in brands])[:4]]
            brand_items = [item for brand in matched_brands for item in candidates
                           if norm(item['name']).startswith(norm(brand))]
            ranked = list(dict((item['id'], item) for item in [*brand_items, *ranked]).values())
        except RuntimeError:
            pass
    for item in candidates:
        if norm(query) in norm(item['name']) and item not in ranked:
            ranked.append(item)
    if not ranked:
        warning = (warning + ' ' if warning else '') + '素材库中未找到明确匹配，请换用品牌别名或商品名。'
    return {'model': model, 'warning': warning, 'items': [public(item) for item in ranked[:16]],
            'examples': examples(query, 0, 12)}
