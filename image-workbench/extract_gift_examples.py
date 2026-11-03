"""Read text and approximate text colors from the supplied flattened gift layouts."""
import json
from pathlib import Path
import time

import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

import gift_catalog


OUTPUT = Path(__file__).with_name('gift-example-text.json')


def foreground_color(image, points):
    width, height = image.size
    x0 = max(0, int(min(point[0] for point in points)))
    y0 = max(0, int(min(point[1] for point in points)))
    x1 = min(width, int(max(point[0] for point in points)) + 1)
    y1 = min(height, int(max(point[1] for point in points)) + 1)
    if x1 <= x0 or y1 <= y0:
        return '#243B34'
    pixels = np.asarray(image.crop((x0, y0, x1, y1)).convert('RGB'), dtype=np.int16)
    border = np.concatenate([pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]])
    background = np.median(border, axis=0)
    contrast = np.max(np.abs(pixels - background), axis=2)
    foreground = pixels[contrast > 50]
    if len(foreground) < 8:
        return '#243B34'
    # Ignore antialiasing and retain the most frequent solid foreground shade.
    quantized = (foreground // 24).clip(0, 10)
    codes, counts = np.unique(quantized, axis=0, return_counts=True)
    shade = codes[counts.argmax()]
    cluster = foreground[np.all(quantized == shade, axis=1)]
    rgb = np.median(cluster, axis=0).astype(int)
    return '#' + ''.join(f'{part:02X}' for part in rgb)


def extract(item, engine):
    with Image.open(item['path']) as source:
        picture = source.convert('RGBA')
        bounds = picture.getchannel('A').getbbox()
        if not bounds:
            return {'id': item['id'], 'name': item['name'], 'lines': []}
        picture = picture.crop(bounds)
        factor = min(3.0, 1100 / max(picture.size))
        if factor > 1:
            picture = picture.resize((int(picture.width * factor), int(picture.height * factor)), Image.Resampling.LANCZOS)
        background = Image.new('RGB', picture.size, 'white')
        background.paste(picture, mask=picture.getchannel('A'))
        results, _ = engine(np.asarray(background))
        lines = []
        for points, text, confidence in results or []:
            text = str(text).strip()
            if len(text) < 2 or float(confidence) < .50:
                continue
            y = min(point[1] for point in points)
            lines.append({'text': text[:120], 'confidence': round(float(confidence), 3),
                          'color': foreground_color(background, points),
                          'y': round(y / background.height, 3)})
        return {'id': item['id'], 'name': item['name'], 'lines': lines}


def main():
    items = [item for item in gift_catalog.catalogue().values() if item['kind'] == 'example']
    engine = RapidOCR()
    results = []
    start = time.monotonic()
    for index, item in enumerate(items, 1):
        try:
            results.append(extract(item, engine))
        except Exception as exc:
            results.append({'id': item['id'], 'name': item['name'], 'lines': [], 'error': type(exc).__name__})
        if index % 25 == 0 or index == len(items):
            print(f'{index}/{len(items)} {time.monotonic() - start:.1f}s', flush=True)
    OUTPUT.write_text(json.dumps({'version': 1, 'items': results}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(str(OUTPUT), flush=True)


if __name__ == '__main__':
    main()
