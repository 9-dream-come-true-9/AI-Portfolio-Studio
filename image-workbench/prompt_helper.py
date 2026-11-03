"""MiMo prompt drafting for the image workbench. Keys never reach the browser."""
import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from image_advisor import NoRedirect, settings

MODULES = {'gift': '添加赠品', 'sku': 'SKU 图制作', 'logo': '添加 LOGO',
           'background': '背景编辑', 'other': '其他需求'}
KINDS = {'request': '生成要求', 'negative': '反面提示词', 'final': '完整生图提示词'}


def draft(data):
    if not isinstance(data, dict) or data.get('module') not in MODULES or data.get('kind') not in KINDS:
        raise ValueError('提示词类型不正确。')
    current, instruction = data.get('current', ''), data.get('instruction', '')
    if not isinstance(current, str) or len(current) > 16000 or not isinstance(instruction, str) or len(instruction) > 2000:
        raise ValueError('输入内容过长。')
    images = data.get('images', [])
    if not isinstance(images, list) or len(images) > 2:
        raise ValueError('最多参考 2 张图片。')
    for image in images:
        if not isinstance(image, str) or len(image) > 8 * 1024 * 1024 or not re.fullmatch(r'data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*', image):
            raise ValueError('参考图格式错误或过大。')
        mime, encoded = image.split(';base64,', 1)
        try:
            raw = base64.b64decode(encoded, validate=True)
        except ValueError:
            raise ValueError('参考图数据损坏。') from None
        valid = ((mime == 'data:image/png' and raw.startswith(b'\x89PNG\r\n\x1a\n')) or
                 (mime == 'data:image/jpeg' and raw.startswith(b'\xff\xd8\xff')) or
                 (mime == 'data:image/webp' and raw[:4] == b'RIFF' and raw[8:12] == b'WEBP'))
        if not valid:
            raise ValueError('参考图内容与格式不匹配。')

    base, model, key = settings()
    module, kind = MODULES[data['module']], KINDS[data['kind']]
    system = ('你是美妆个护电商图片工作台的提示词编辑。只返回可直接放入输入框的中文内容，不要解释或 Markdown。'
              '以用户已有内容和参考图片为准；看不清的产品名称、规格、功效、价格、数量不可编造。'
              '图片制作应保持商品包装、商标、中文文字和数量真实准确。'
              '添加赠品须保留真实赠品及数量；SKU 图须逐项准确呈现产品与规格；'
              'LOGO 使用原始标识，不重新设计；背景编辑保持商品主体不变。'
              '反面提示词只列需要避免的具体问题，不写正向要求。')
    field_rule = ('只列出不希望出现的画面问题，不写“生成”“保持”等正面画面要求，也不要附上正面提示词。'
                  if data['kind'] == 'negative' else
                  '只写希望生成的画面和制作要求，不附上反面提示词或“不希望生成的内容”段落。')
    user = f'模块：{module}\n输入框：{kind}\n已有内容：{current.strip() or "（空）"}\n补充要求：{instruction.strip() or "（无）"}\n{field_rule}\n请只返回当前输入框可直接使用的内容。'
    content = [{'type': 'text', 'text': user}]
    content.extend({'type': 'image_url', 'image_url': {'url': image}} for image in images)
    payload = json.dumps({'model': model, 'messages': [{'role': 'system', 'content': system},
                                                      {'role': 'user', 'content': content if images else user}],
                          'stream': False, 'max_completion_tokens': 1600,
                          'thinking': {'type': 'disabled'}}, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(base + '/chat/completions', data=payload,
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key}, method='POST')
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=65) as response:
            raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise RuntimeError('模型响应过大。')
        answer = json.loads(raw)['choices'][0]['message']['content']
        if not isinstance(answer, str) or not answer.strip():
            raise RuntimeError('模型未返回提示词。')
        return {'text': answer.strip()[:16000], 'model': model, 'usedImages': len(images)}
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise RuntimeError('文字模型密钥无效或当前模型未授权。') from exc
        if exc.code == 429:
            raise RuntimeError('文字模型请求较多，请稍后重试。') from exc
        raise RuntimeError(f'文字模型暂不可用（HTTP {exc.code}）。') from exc
    except (urllib.error.URLError, OSError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise RuntimeError('文字模型暂不可用，请稍后重试。') from exc
