"""Crop a gift layout to its visible content and recover editable parts on demand."""
from difflib import SequenceMatcher
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import base64
import json
import math
import os
import re
import threading

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
STATE = Path(os.environ.get('WORKBENCH_DATA_DIR', str(Path.home() / '.ai-portfolio-studio' / 'image-workbench'))) / 'gift-example-edits'
VERSION = 11
LOCK = threading.Lock()
OCR = None


def encoded(image):
    stream = BytesIO()
    image.save(stream, format='PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode('ascii')


def normalize(value):
    return re.sub(r'[^a-z0-9\u4e00-\u9fff]', '', str(value).lower())


def rectangle(points, width, height):
    left = max(0, round(min(point[0] for point in points)))
    top = max(0, round(min(point[1] for point in points)))
    right = min(width, round(max(point[0] for point in points)))
    bottom = min(height, round(max(point[1] for point in points)))
    return {'x': left, 'y': top, 'w': max(1, right-left), 'h': max(1, bottom-top)}


def ocr_lines(picture):
    global OCR
    from rapidocr_onnxruntime import RapidOCR
    if OCR is None:
        OCR = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
    background = Image.new('RGB', picture.size, 'white')
    background.paste(picture, mask=picture.getchannel('A'))
    rows, _ = OCR(np.asarray(background)[:, :, ::-1].copy())
    result = []
    for polygon, text, confidence in rows or []:
        if float(confidence) < .58 or not normalize(text):
            continue
        result.append({'text': str(text).strip()[:120], 'confidence': float(confidence),
                       'polygon': polygon, 'box': rectangle(polygon, picture.width, picture.height)})
    return result


def text_color(picture, box, suggested):
    # The model's color is often the card color. Sample the actual glyphs
    # against clean strips just outside the OCR box instead.
    rgb = np.asarray(picture.convert('RGB'))
    x, y, w, h = (box[key] for key in ('x', 'y', 'w', 'h'))
    patch = rgb[y:y+h, x:x+w]
    if not patch.size:
        return suggested.upper() if isinstance(suggested, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', suggested) else '#243B34'
    bands = [rgb[max(0, y-5):y, x:x+w], rgb[y+h:min(rgb.shape[0], y+h+5), x:x+w]]
    bands = [band.reshape(-1, 3) for band in bands if band.size]
    background = np.median(np.concatenate(bands) if bands else patch.reshape(-1, 3), axis=0)
    distance = np.max(np.abs(patch.astype(np.int16)-background), axis=2)
    foreground = patch[distance >= 45]
    if len(foreground) < 5:
        return suggested.upper() if isinstance(suggested, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', suggested) else '#243B34'
    quantized = (foreground // 24).astype(np.int16)
    buckets, counts = np.unique(quantized, axis=0, return_counts=True)
    bucket = buckets[np.argmax(counts)]
    dominant = foreground[np.all(quantized == bucket, axis=1)]
    shade = np.median(dominant, axis=0).astype(int)
    return '#' + ''.join(f'{part:02X}' for part in shade)


def text_character_colors(picture, box, value, base_color):
    """Keep red emphasis from mixed-color template lines when text is edited."""
    if not value or len(value) > 120:
        return []
    x, y, w, h = (box[key] for key in ('x', 'y', 'w', 'h'))
    rgb = np.asarray(picture.convert('RGB'))
    patch = rgb[y:y+h, x:x+w]
    bands = [rgb[max(0, y-5):y, x:x+w], rgb[y+h:min(rgb.shape[0], y+h+5), x:x+w]]
    bands = [band.reshape(-1, 3) for band in bands if band.size]
    if not patch.size or not bands:
        return []
    background = np.median(np.concatenate(bands), axis=0)
    distance = np.max(np.abs(patch.astype(np.int16)-background), axis=2)
    red = ((patch[:, :, 0].astype(np.int16)-patch[:, :, 1].astype(np.int16) >= 90)
           & (patch[:, :, 0].astype(np.int16)-patch[:, :, 2].astype(np.int16) >= 75)
           & (patch[:, :, 0] > 110) & (distance >= 45))
    if int(red.sum()) < 8 or (int(base_color[1:3], 16) > int(base_color[3:5], 16)*1.35
                                and int(base_color[1:3], 16) > int(base_color[5:7], 16)*1.2):
        return []
    accent = np.median(patch[red], axis=0).astype(int)
    accent_color = '#' + ''.join(f'{part:02X}' for part in accent)
    weights = [1 if '\u4e00' <= char <= '\u9fff' else .62 if char.isalnum() else .42 for char in value]
    boundaries = np.rint(np.cumsum([0]+weights)/sum(weights)*w).astype(int)
    colors = []
    for index in range(len(value)):
        left, right = max(0, boundaries[index]-1), min(w, boundaries[index+1]+1)
        colored = int(red[:, left:right].sum())
        dark = int(((patch[:, left:right].max(axis=2) < 115) & (distance[:, left:right] >= 45)).sum())
        colors.append(accent_color if colored >= 3 and colored > dark*.35 else base_color)
    return colors if any(color != base_color for color in colors) else []


def external_text(vision, rows, width, height):
    candidates = [slot for slot in vision if isinstance(slot, dict) and slot.get('kind') == 'text'
                  and isinstance(slot.get('text'), str) and normalize(slot['text'])]
    used, result = set(), []
    for slot in candidates:
        target = normalize(slot['text'])
        try:
            center_y = float(slot.get('y', 0)) + float(slot.get('h', 0))/2
        except (TypeError, ValueError):
            continue
        scored = []
        for index, row in enumerate(rows):
            if index in used:
                continue
            value = normalize(row['text'])
            similarity = SequenceMatcher(None, target, value).ratio()
            middle = row['box']['y'] + row['box']['h']/2
            if similarity >= .65 and abs(center_y-middle) <= max(85, height*.2):
                scored.append((similarity - abs(center_y-middle)/max(height, 1)*.15, index))
        if not scored:
            continue
        _, index = max(scored)
        used.add(index)
        row = rows[index]
        box = row['box']
        result.append({'kind': 'text', 'text': row['text'], 'box': box,
                       'color': slot.get('color'), 'confidence': round(row['confidence'], 3),
                       'polygon': row['polygon']})
        if len(result) >= 40:
            break
    return sorted(result, key=lambda line: (line['box']['y'], line['box']['x']))


def local_text(item, rows, width, height):
    """Locate the template library's known ad copy with local OCR."""
    import gift_catalog
    indexed = gift_catalog.example_text().get(item['id'], {}).get('lines', [])
    candidates = [{'kind': 'text', 'text': line['text'], 'y': float(line['y']) * height,
                   'h': 0, 'color': line.get('color')}
                  for line in indexed if line.get('confidence', 0) >= .62
                  and isinstance(line.get('text'), str) and normalize(line['text'])]
    matched = external_text(candidates, rows, width, height)
    minimum_height = max(8, height * .022)
    return [line for line in matched if line['box']['h'] >= minimum_height]


def local_product_slots(lines, width, height):
    """Find product compositions between the ad's editable text bands."""
    occupied = []
    for line in sorted(lines, key=lambda row: row['box']['y']):
        top = line['box']['y']
        bottom = top + line['box']['h']
        if occupied and top <= occupied[-1][1] + 5:
            occupied[-1][1] = max(occupied[-1][1], bottom)
        else:
            occupied.append([top, bottom])
    gaps = []
    previous = 0
    for top, bottom in occupied:
        if top - previous >= max(30, height * .18):
            gaps.append((previous, top))
        previous = max(previous, bottom)
    if height - previous >= max(30, height * .18):
        gaps.append((previous, height))
    # A tall blank header is possible, but the product is usually between or
    # below advertising copy. Keep the two largest plausible image areas.
    gaps = [(top, bottom) for top, bottom in gaps
            if top > 0 or bottom >= height * .32]
    gaps = sorted(gaps, key=lambda gap: gap[1] - gap[0], reverse=True)[:2]
    return [{'kind': 'product', 'x': 0, 'y': top + 4, 'w': width,
             'h': max(1, bottom - top - 8)} for top, bottom in sorted(gaps)]


def product_bands(vision, lines, width, height):
    products = [slot for slot in vision if isinstance(slot, dict) and slot.get('kind') == 'product']
    results = []
    for slot in products[:12]:
        try:
            center = float(slot.get('y', 0)) + float(slot.get('h', 0))/2
        except (TypeError, ValueError):
            continue
        if not 0 <= center <= height:
            continue
        above = max((line['box']['y']+line['box']['h'] for line in lines
                     if line['box']['y']+line['box']['h'] < center), default=0)
        below = min((line['box']['y'] for line in lines if line['box']['y'] > center), default=height)
        top, bottom = max(0, above+4), min(height, below-4)
        if bottom-top < 25 or bottom-top > height*.8:
            try:
                top = max(0, round(float(slot.get('y', 0))))
                bottom = min(height, round(top + float(slot.get('h', 0))))
            except (TypeError, ValueError):
                continue
        if bottom-top < 25:
            continue
        # This only locates a search band. Never use the whole band as a
        # movable product: it contains the template's background texture.
        box = {'x': 4, 'y': top, 'w': max(1, width-8), 'h': bottom-top}
        if any(abs(box['y']-other['y']) < 12 and abs(box['h']-other['h']) < 20 for other in results):
            continue
        results.append(box)
    return results


def vision_product_boxes(vision, width, height):
    boxes = []
    for slot in vision:
        if slot.get('kind') != 'product':
            continue
        try:
            x, y, w, h = (float(slot.get(key, 0)) for key in ('x', 'y', 'w', 'h'))
        except (TypeError, ValueError):
            continue
        if not all(math.isfinite(value) for value in (x, y, w, h)):
            continue
        left, top = max(0, round(x)), max(0, round(y))
        right, bottom = min(width, round(x+w)), min(height, round(y+h))
        if right-left < 12 or bottom-top < 18:
            continue
        boxes.append({'x': left, 'y': top, 'w': right-left, 'h': bottom-top, 'source':'vision'})
    return boxes[:12]


def local_product_boxes(picture, bands):
    """Suggest separate packages from strong closed edges inside text-free bands."""
    import cv2
    found = []
    rgb = np.asarray(picture.convert('RGB'))
    for band in bands:
        bx, by, bw, bh = (band[key] for key in ('x', 'y', 'w', 'h'))
        area = rgb[by:by+bh, bx:bx+bw]
        if min(area.shape[:2]) < 30:
            continue
        gray = cv2.cvtColor(area, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 40, 120)
        joined = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((5, 3), dtype=np.uint8))
        contours, _ = cv2.findContours(joined, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        pieces = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if h < max(22, bh*.16) or w < 12 or w > bw*.55 or h/w < 1.25:
                continue
            if cv2.contourArea(contour) < w*h*.2:
                continue
            pieces.append([bx+x, by+y, bx+x+w, by+y+h])
        pieces.sort(key=lambda box:(box[0], box[1]))
        groups = []
        for box in pieces:
            matches = [group for group in groups if min(group[2],box[2])-max(group[0],box[0]) >= min(group[2]-group[0],box[2]-box[0])*.6
                       and box[1] <= group[3]+max(8,bh*.04) and group[1] <= box[3]+max(8,bh*.04)]
            if matches:
                group = matches[0]
                group[:] = [min(group[0],box[0]),min(group[1],box[1]),max(group[2],box[2]),max(group[3],box[3])]
            else:
                groups.append(box[:])
        for x, y, right, bottom in groups:
            if bottom-y < bh*.42 or (right-x)*(bottom-y) > bw*bh*.5:
                continue
            found.append({'x':x,'y':y,'w':right-x,'h':bottom-y,'source':'local'})
    # Nested contours often propose the same package twice.
    found.sort(key=lambda box:box['w']*box['h'], reverse=True)
    distinct = []
    for box in found:
        if any(min(box['x']+box['w'],other['x']+other['w'])-max(box['x'],other['x']) > min(box['w'],other['w'])*.65
               and min(box['y']+box['h'],other['y']+other['h'])-max(box['y'],other['y']) > min(box['h'],other['h'])*.65 for other in distinct):
            continue
        distinct.append(box)
    return sorted(distinct[:12], key=lambda box:(box['y'],box['x']))


def cutout_products(picture, boxes):
    """Use local SAM-HQ masks; reject any mask that absorbs the card background."""
    import cv2
    import series_segmentation
    if not boxes:
        return picture, [], 0
    width, height = picture.size
    rgb = np.asarray(picture.convert('RGB'))
    scale = 1024 / max(width, height)
    scaled_width, scaled_height = round(width*scale), round(height*scale)
    accepted = []
    rejected = 0
    with series_segmentation._lock:
        encoder, decoder = series_segmentation.sessions()
        features = encoder.run(None, {'input_image': np.asarray(picture.convert('RGB').resize((scaled_width,scaled_height),Image.Resampling.LANCZOS),dtype='float32')})
        for box in boxes:
            x, y, w, h = (box[key] for key in ('x','y','w','h'))
            pad_x = max(2, round(w*.08))
            pad_y = max(3, round(h*(.06 if box.get('source')=='local' else .28)))
            left, top = max(0,x-pad_x), max(0,y-pad_y)
            right, bottom = min(width,x+w+pad_x), min(height,y+h+pad_y)
            points = np.asarray([[[left,top],[right,bottom]]],dtype='float32')*scale
            result = decoder.run(None, {'image_embeddings':features[0], 'interm_embeddings':np.stack(features[1:]),
                'point_coords':points, 'point_labels':np.array([[2,3]],dtype='float32'),
                'mask_input':np.zeros((1,1,256,256),dtype='float32'), 'has_mask_input':np.array([0],dtype='float32'),
                'orig_im_size':np.array([scaled_height,scaled_width],dtype='float32')})
            mask = (result[0][0,0]>0).astype(np.uint8)
            confidence = float(result[1][0,0])
            if confidence < .82 or not mask.any():
                rejected += 1
                continue
            count, labels, stats, _ = cv2.connectedComponentsWithStats(mask,8)
            if count > 2:
                largest = 1 + int(np.argmax(stats[1:,cv2.CC_STAT_AREA]))
                mask = (labels==largest).astype(np.uint8)
            alpha = Image.fromarray(mask*255).resize((width,height),Image.Resampling.LANCZOS)
            binary = np.asarray(alpha)>20
            ys, xs = np.nonzero(binary)
            if not len(xs):
                rejected += 1
                continue
            x0,y0,x1,y1 = int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)
            area = int(binary.sum())
            search_area = max(1,(right-left)*(bottom-top))
            outside = area-int(binary[top:bottom,left:right].sum())
            if (area < max(35,width*height*.001) or area > width*height*.36 or
                area/search_area > .82 or outside/area > .08 or
                x1-x0 > max(w*1.55,32) or y1-y0 > max(h*1.6,35)):
                rejected += 1
                continue
            padded = (max(0,x0-2),max(0,y0-2),min(width,x1+2),min(height,y1+2))
            cutout = picture.crop(padded)
            cutout.putalpha(Image.fromarray((np.asarray(alpha.crop(padded),dtype=np.uint16)*np.asarray(cutout.getchannel('A'),dtype=np.uint16)//255).astype(np.uint8)))
            accepted.append({'box':{'x':padded[0],'y':padded[1],'w':padded[2]-padded[0],'h':padded[3]-padded[1]},
                             'src':encoded(cutout),'alpha':binary})
    if not accepted:
        return picture, [], rejected
    union = np.zeros((height,width),dtype=np.uint8)
    for part in accepted:
        union[part['alpha']] = 255
    inpaint_mask = cv2.dilate(union,np.ones((5,5),dtype=np.uint8))
    cleaned_rgb = cv2.inpaint(rgb[:,:,::-1].copy(),inpaint_mask,6,cv2.INPAINT_TELEA)[:,:,::-1]
    cleaned = Image.fromarray(cleaned_rgb,'RGB').convert('RGBA')
    cleaned.putalpha(picture.getchannel('A'))
    for part in accepted:
        del part['alpha']
    return cleaned, accepted, rejected


def cover_for(picture, box, polygon=None):
    width, height = picture.size
    x, y, w, h = (box[key] for key in ('x', 'y', 'w', 'h'))
    # Large inpaint masks create diagonal wedges in a flattened layout.
    # Reconstruct the uncovered card from short clean bands immediately above
    # and below the editable content, preserving its vertical color gradient.
    pad = 8
    left, right = max(0, x-pad), min(width, x+w+pad)
    top_y = max(0, y-(4 if polygon is not None else 0))
    bottom_y = min(height, y+h+(4 if polygon is not None else 0))
    region = {'x': left, 'y': top_y, 'w': right-left, 'h': bottom_y-top_y}
    pixels = np.asarray(picture.convert('RGBA')).copy()
    above = pixels[max(0, top_y-3):top_y, left:right, :3]
    below = pixels[bottom_y:min(height, bottom_y+3), left:right, :3]
    if not above.size and not below.size:
        top = bottom = np.full(3, 255, dtype=np.float32)
    else:
        top = np.median(above if above.size else below, axis=(0, 1)).astype(np.float32)
        bottom = np.median(below if below.size else above, axis=(0, 1)).astype(np.float32)
    length, breadth = bottom_y-top_y, right-left
    seed = int.from_bytes(sha256(f'{x}:{y}:{w}:{h}'.encode()).digest()[:4], 'big')
    rng = np.random.default_rng(seed)
    speckle = rng.normal(0, 4, size=(length, breadth, 1))
    for row in range(top_y, bottom_y):
        blend = (row-top_y+1)/(length+1)
        pixels[row, left:right, :3] = np.clip(top*(1-blend)+bottom*blend+speckle[row-top_y], 0, 255).astype(np.uint8)
        pixels[row, left:right, 3] = 255
    crop = Image.fromarray(pixels[top_y:bottom_y, left:right], 'RGBA')
    return {'cover': encoded(crop), 'coverBox': region}


def original_background_cover(background, box):
    x, y, w, h = (box[key] for key in ('x','y','w','h'))
    left, top = max(0,x-4), max(0,y-4)
    right, bottom = min(background.width,x+w+4), min(background.height,y+h+4)
    region = {'x':left,'y':top,'w':right-left,'h':bottom-top}
    return {'cover':encoded(background.crop((left,top,right,bottom))),'coverBox':region}


def decompose(asset_id):
    import gift_catalog
    item = gift_catalog.catalogue().get(asset_id)
    if not item or item['kind'] != 'example':
        raise ValueError('赠品版式不存在。')
    source = item['path'].read_bytes()
    cache = STATE / f'{asset_id}-{sha256(source).hexdigest()[:12]}-v{VERSION}.json'
    with LOCK:
        if cache.is_file():
            cached = json.loads(cache.read_text(encoding='utf-8'))
            if cached.get('parts'):
                return cached
        with Image.open(BytesIO(source)) as opened:
            original = opened.convert('RGBA')
        bounds = original.getchannel('A').point(lambda alpha: 255 if alpha > 4 else 0).getbbox()
        if not bounds:
            raise ValueError('这张赠品版式没有可见内容。')
        picture = original.crop(bounds)
        width, height = picture.size
        if width < 20 or height < 20:
            raise ValueError('赠品版式内容太小，无法编辑。')
        lines = ocr_lines(picture)
        warnings = []
        try:
            import series_layout
            instruction = (f'这是一张已经裁去外部透明空白的赠品版式，尺寸 {width}×{height} 像素。' +
                '识别商品包装外的活动标题、条件、赠品说明、日期等可编辑文字。逐件识别真实商品包装，几个瓶子必须返回几个独立product槽。' +
                '返回JSON对象 {"slots":[{"kind":"text","text":"原文","x":0,"y":0,"w":100,"h":20,"color":"#000000"},{"kind":"product","label":"单件商品","x":0,"y":0,"w":30,"h":100}]}。' +
                '坐标为原图像素。商品框紧贴完整瓶身及瓶盖，不包括包装之间的空白、商品展示区背景纹理、装饰和阴影。不要将包装文字拆为text。看不清的内容不要编造。')
            reply = series_layout.vision_json(encoded(picture), instruction)
            vision = [slot for slot in reply.get('slots', []) if isinstance(slot, dict) and slot.get('kind') in ('text', 'product')] if isinstance(reply.get('slots'), list) else []
        except RuntimeError:
            vision = []
            warnings.append('版式语义识别暂不可用，已用本地识别拆解；请核对文字和商品区域。')
        texts = external_text(vision, lines, width, height)
        if not texts:
            texts = local_text(item, lines, width, height)
        bands = product_bands(vision, texts, width, height)
        if not bands:
            bands = product_bands(local_product_slots(texts, width, height), texts, width, height)
        vision_boxes = vision_product_boxes(vision, width, height)
        local_boxes = local_product_boxes(picture, bands)
        broad = len(vision_boxes)==1 and vision_boxes[0]['w'] > width*.7
        boxes = local_boxes if local_boxes and (not vision_boxes or broad or len(local_boxes)>=2 and len(vision_boxes)==1) else vision_boxes
        try:
            background, products, rejected = cutout_products(picture, boxes)
        except (ImportError, OSError, RuntimeError):
            background, products, rejected = picture, [], len(boxes)
        if rejected:
            warnings.append('部分商品轮廓未能可靠抠出，已保留模板原背景；可更换更清晰的模板。')
        if bands and not products:
            warnings.append('这张模板的商品未能可靠抠图，已保留原图，避免把背景当商品移动。')
        if not vision and not warnings:
            warnings.append('版式语义识别未返回可编辑区域，已用本地识别拆解；请核对文字和商品区域。')
        parts = []
        for index, product in enumerate(products, 1):
            box=product['box']
            parts.append({'kind': 'product', 'name': f'商品区域 {index}', 'box': box, 'src': product['src'],
                          'cutout': True, **original_background_cover(background, box)})
        for index, line in enumerate(texts, 1):
            box = line['box']
            foreground = text_color(picture, box, line['color'])
            parts.append({'kind': 'text', 'name': f'原文 {index}', 'box': box, 'text': line['text'],
                          'color': foreground, 'charColors': text_character_colors(picture, box, line['text'], foreground),
                          'fontSize': max(8, round(box['h']*.9)), 'confidence': line['confidence'],
                          **cover_for(background, box, line['polygon'])})
        result = {'version': VERSION, 'name': item['name'],
                  'sourceWidth': original.width, 'sourceHeight': original.height,
                  'bounds': {'x': bounds[0], 'y': bounds[1], 'w': width, 'h': height},
                  'background': encoded(background), 'parts': parts, 'warnings': warnings}
        if parts:
            STATE.mkdir(parents=True, exist_ok=True)
            temp = cache.with_suffix('.tmp')
            temp.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            os.replace(temp, cache)
        return result
