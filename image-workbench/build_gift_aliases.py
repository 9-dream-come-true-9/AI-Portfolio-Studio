"""Generate a reviewable Chinese alias index for the local English gift brands."""
import json
import os
from pathlib import Path
import re
import urllib.request

from image_advisor import NoRedirect, settings
from gift_catalog import english_brands


OUTPUT = Path(__file__).with_name('gift-brand-aliases.json')


def ask(brands):
    base, model, key = settings()
    payload = json.dumps({
        'model': model,
        'messages': [
            {'role':'system','content':'你是美妆品牌中英文名称检索员。为每个英文品牌列出确有依据的常见中文品牌名或音译名，最多两个；不确定就用空数组。型号或商品名不要当作品牌。只输出 JSON 对象，键与输入英文名称完全相同，值为中文名字符串数组。'},
            {'role':'user','content':'英文品牌/素材前缀：\n'+'\n'.join(brands)}
        ], 'stream':False, 'max_completion_tokens':1800, 'thinking':{'type':'disabled'}
    }, ensure_ascii=False).encode()
    request = urllib.request.Request(base + '/chat/completions', data=payload,
        headers={'Content-Type':'application/json','Authorization':'Bearer '+key}, method='POST')
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=60) as response:
        text = json.load(response)['choices'][0]['message']['content']
    match = re.search(r'\{[\s\S]*\}', text)
    if not match:
        raise RuntimeError('模型未返回 JSON。')
    data = json.loads(match.group())
    result = {}
    for brand in brands:
        aliases = data.get(brand, [])
        if not isinstance(aliases, list):
            continue
        result[brand] = [alias.strip() for alias in aliases if isinstance(alias,str)
                         and 2 <= len(alias.strip()) <= 16 and re.search(r'[\u4e00-\u9fff]',alias)][:2]
    return result


def main():
    brands = english_brands()
    result = {'ALGENIST':['奥杰尼']}
    for start in range(0, len(brands), 18):
        batch = brands[start:start+18]
        try:
            result.update(ask(batch))
        except Exception as exc:
            print(f'{start+1}-{start+len(batch)}: {type(exc).__name__}', flush=True)
            continue
        print(f'{start+1}-{start+len(batch)}: {sum(bool(x) for x in result.values())} aliases', flush=True)
    result['ALGENIST'] = list(dict.fromkeys(['奥杰尼', *result.get('ALGENIST',[])]))[:2]
    OUTPUT.write_text(json.dumps({'model':os.environ.get('ADVISOR_MODEL', ''),'aliases':result}, ensure_ascii=False, indent=2),encoding='utf-8')
    print(str(OUTPUT), flush=True)


if __name__=='__main__':
    main()
