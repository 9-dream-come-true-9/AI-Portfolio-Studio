"""Local replacement patches. Pixels outside an edited object's mask never change."""
from io import BytesIO
import base64
import math
import re

import numpy as np
import cv2
from PIL import Image, ImageFilter


def encode(image):
    out = BytesIO()
    image.save(out, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(out.getvalue()).decode('ascii')


def decode_asset(source):
    if not isinstance(source,str) or len(source)>14*1024*1024 or not re.fullmatch(r'data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*',source):
        raise ValueError('替换区域的抠图数据无效。')
    image=Image.open(BytesIO(base64.b64decode(source.split(',',1)[1],validate=True)))
    if image.width*image.height>25_000_000:raise ValueError('抠图尺寸过大。')
    return image.convert('RGBA')


def bounds(slot, size, pad=0):
    return (max(0, math.floor(slot['x']-pad)), max(0, math.floor(slot['y']-pad)),
            min(size[0], math.ceil(slot['x']+slot['w']+pad)), min(size[1], math.ceil(slot['y']+slot['h']+pad)))


def smooth_background(source, inner):
    """Fit a local colour surface using only the ring outside the OCR ink box."""
    h,w=source.shape[:2];yy,xx=np.mgrid[-1:1:complex(h),-1:1:complex(w)]
    design=np.stack((np.ones((h,w)),xx,yy,xx*xx,xx*yy,yy*yy),axis=-1)
    ring=np.ones((h,w),bool);x,y,right,bottom=inner;ring[y:bottom,x:right]=False
    sample=ring.copy();values=source.astype('float32')
    if sample.sum()<40:return None
    for _ in range(4):
        coefficients=np.linalg.lstsq(design[sample],values[sample],rcond=None)[0]
        predicted=design@coefficients
        error=np.linalg.norm(predicted-values,axis=2)
        cutoff=max(10,float(np.percentile(error[sample],75))*1.5)
        sample=ring&(error<cutoff)
        if sample.sum()<40:return None
    if float(np.percentile(error[sample],80))>20:return None
    return np.clip(predicted,0,255).astype('uint8')


def product_footprint(original, cleaned, slot, slots, radius):
    """Include connected shadows/reflections, while protecting other content."""
    target=slot['sourceBox'];tx,ty,tr,tb=bounds(target,original.size)
    alpha=decode_asset(slot['productSrc']).getchannel('A').resize((tr-tx,tb-ty),Image.Resampling.LANCZOS)
    full=Image.new('L',original.size);full.paste(alpha,(tx,ty))
    base=cv2.dilate((np.asarray(full)>12).astype('uint8')*255,np.ones((radius*2+1,radius*2+1),'uint8'))
    # Only consider differences touching the original product near its support.
    # This excludes unrelated changes the image model made elsewhere in the ad.
    reach=np.zeros(base.shape,'uint8');h=tb-ty;w=tr-tx
    left=max(0,tx-round(w*.25));right=min(original.width,tr+round(w*.25))
    top=max(0,ty+round(h*.85));bottom=min(original.height,tb+round(h*.3))
    reach[top:bottom,left:right]=1
    difference=np.linalg.norm(np.asarray(original.convert('RGB')).astype('float32')-np.asarray(cleaned.convert('RGB')).astype('float32'),axis=2)
    candidate=((difference>32)&(reach>0)).astype('uint8')
    candidate=cv2.morphologyEx(candidate,cv2.MORPH_CLOSE,np.ones((9,9),'uint8'))
    count,labels=cv2.connectedComponents(candidate);extra=np.zeros(base.shape,'uint8')
    for label in range(1,count):
        component=labels==label
        if np.any(component&(base>0)):extra[component]=255
    extra=cv2.dilate(extra,np.ones((9,9),'uint8'))
    # Other products, captions, badges and photos are independently editable.
    # Never erase their original pixels while replacing this product.
    for other in slots:
        if other['id']==slot['id']:continue
        x,y,r,b=bounds(other.get('sourceBox') or other,original.size,3)
        extra[y:b,x:r]=0
    hard=np.maximum(base,extra)
    mask=np.asarray(Image.fromarray(hard).filter(ImageFilter.GaussianBlur(5))).copy()
    # Preserve a fully cleared core; the outer transition blends the clean plate.
    mask[cv2.erode(hard,np.ones((7,7),'uint8'))>0]=255
    return Image.fromarray(mask)


def build(original, cleaned, slots, decode):
    if cleaned.size != original.size:
        raise ValueError('母图清理结果的尺寸不匹配。')
    patches = []
    rgb = np.asarray(original.convert('RGB'))
    for slot in slots:
        protected=None
        product_radius=max(3,min(24,round(min(original.size)*.01))) if slot['kind']=='product' else 0
        product_feather=max(1,min(4,product_radius/3)) if product_radius else .45
        pad=max(22,round(float(slot.get('fontSize',24))*.5)) if slot['kind']=='text' else product_radius+math.ceil(product_feather*3)+3 if product_radius else 5
        footprint=product_footprint(original,cleaned,slot,slots,product_radius) if slot['kind']=='product' else None
        box = footprint.getbbox() if footprint is not None else bounds(slot.get('sourceBox') or slot, original.size, pad)
        left, top, right, bottom = box
        source = rgb[top:bottom, left:right].copy()
        mask = np.zeros(source.shape[:2], dtype='uint8')
        sx, sy, ex, ey = bounds(slot, original.size)
        if slot['kind'] == 'text':
            # OCR bounds constrain the operation; colour identifies the glyphs.
            # The inpainted pixels are only revealed when this exact slot changes.
            color = np.array([int(slot.get('color','#222222')[i:i+2],16) for i in (1,3,5)])
            region = source[sy-top:ey-top, sx-left:ex-left]
            fitted=smooth_background(source,(sx-left,sy-top,ex-left,ey-top))
            if fitted is not None:
                expected=fitted[sy-top:ey-top,sx-left:ex-left]
                distance=np.linalg.norm(region.astype('float32')-expected,axis=2)
                foreground_distance=np.linalg.norm(region.astype('float32')-color,axis=2)
                selected=((distance>30)&(foreground_distance<distance*.9)).astype('uint8')*255
            else:
                distance = np.linalg.norm(region.astype('float32')-color,axis=2)
                selected = (distance < 85).astype('uint8')*255
            if not .003 < float((selected>0).mean()) < .8:
                gray = cv2.cvtColor(region,cv2.COLOR_RGB2GRAY)
                _, selected = cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
                if float((selected>0).mean())>.5:selected=255-selected
            mask[sy-top:ey-top,sx-left:ex-left] = selected
            margin=max(2,min(8,round(float(slot.get('fontSize',24))*.08)))
            if fitted is not None:
                # A smooth surface should be filled continuously, not glyph by
                # glyph: isolated fills otherwise leave embossed letter shapes.
                shadow_margin=max(4,min(12,round(float(slot.get('fontSize',24))*.16)))
                near_glyph=cv2.dilate(mask,np.ones((shadow_margin*2+1,shadow_margin*2+1),'uint8'))>0
                mask[:]=0
                cv2.rectangle(mask,(max(0,sx-left-8),max(0,sy-top-8)),(min(mask.shape[1]-1,ex-left+7),min(mask.shape[0]-1,ey-top+7)),255,-1)
                bg_distance=np.linalg.norm(source.astype('float32')-fitted,axis=2)
                fg_distance=np.linalg.norm(source.astype('float32')-color,axis=2)
                decoration=(bg_distance>30)&~near_glyph
                # Keep badge outlines, separator rules and nearby artwork.
                mask[decoration]=0
                protected=decoration
                clean=fitted
            else:
                mask = cv2.dilate(mask,np.ones((margin*2+1,margin*2+1),'uint8'))
                clean=cv2.inpaint(source,mask,6,cv2.INPAINT_TELEA)
        else:
            src = slot.get('productSrc') if slot['kind']=='product' else slot.get('imageSrc')
            if not src:
                raise ValueError('“'+str(slot.get('label',slot['id']))+'”缺少可用抠图，不能安全替换。')
            extracted = decode_asset(src)
            target = slot.get('sourceBox') if slot['kind']=='product' else None
            target = target or slot
            tx,ty,tr,tb=bounds(target,original.size)
            alpha=extracted.getchannel('A').resize((tr-tx,tb-ty),Image.Resampling.LANCZOS)
            full=Image.new('L',original.size)
            full.paste(alpha,(tx,ty))
            mask=np.asarray(full.crop(box)).copy()
            if slot['kind']=='product':
                mask=np.asarray(footprint.crop(box)).copy()
                clean=np.asarray(cleaned.convert('RGB').crop(box)).copy()
            else:
                mask=cv2.dilate((mask>12).astype('uint8')*255,np.ones((3,3),'uint8'))
                clean=cv2.inpaint(source,mask,4,cv2.INPAINT_TELEA)
        # A one-pixel soft edge blends antialiasing without a rectangular crop.
        alpha=Image.fromarray(mask) if footprint is not None else Image.fromarray(mask).filter(ImageFilter.GaussianBlur(3.5 if protected is not None else product_feather))
        if protected is not None:
            values=np.asarray(alpha).copy();values[protected]=0;alpha=Image.fromarray(values)
        patch=Image.fromarray(clean).convert('RGBA');patch.putalpha(alpha)
        patches.append({'id':slot['id'],'box':{'x':left,'y':top,'w':right-left,'h':bottom-top},'src':encode(patch)})
    return {'version':1,'patches':patches}
