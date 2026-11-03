"""One-time semantic point selection plus local SAM-HQ object segmentation."""
from pathlib import Path
import threading
import os
import re
import json
import numpy as np
import cv2
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent
_sessions=None
_lock=threading.RLock()
GRID=12
VERSION=5
MULTI_VERSION=4

class PointPromptError(RuntimeError):
    pass


def sessions():
    global _sessions
    if _sessions is None:
        options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
        paths=[ROOT/'models'/name for name in ['sam_hq_vit_b_encoder.onnx','sam_hq_vit_b_decoder.onnx']]
        if not all(path.is_file() for path in paths):raise RuntimeError('商品轮廓模型尚未安装，原图已保留。')
        _sessions=tuple(ort.InferenceSession(str(path),options,providers=['CPUExecutionProvider']) for path in paths)
    return _sessions


def point_grid(image):
    overlay=image.convert('RGB').copy();draw=ImageDraw.Draw(overlay)
    font_size=max(12,round(min(image.size)/78))
    try:
        font=ImageFont.truetype('DejaVuSans.ttf',font_size)
    except OSError:
        font=ImageFont.load_default(size=font_size)
    points={}
    columns=max(3,round(GRID*image.width/max(image.size)));rows=max(3,round(GRID*image.height/max(image.size)))
    for row in range(rows):
        for col in range(columns):
            identity=row*columns+col+1;x=(col+.5)*image.width/columns;y=(row+.5)*image.height/rows;points[identity]=[x,y]
            radius=max(10,round(min(image.size)/100));draw.ellipse((x-radius*1.4,y-radius,x+radius*1.4,y+radius),fill='white',outline='black',width=1)
            draw.text((x,y),str(identity),fill='black',font=font,anchor='mm')
    return overlay,points


def normalize_points(reply,products,points):
    """Validate point semantics; extra valid samples are not a model failure."""
    items=reply.get('products') if isinstance(reply,dict) else None
    if not isinstance(items,list) or not items or any(not isinstance(item,dict) for item in items):
        raise PointPromptError('商品定位回复格式无效，原图已保留。')
    result={}
    for item in items:
        identity=item.get('id')
        if not isinstance(identity,str) or identity in result:
            raise PointPromptError('商品定位回复的商品编号无效，原图已保留。')
        result[identity]=dict(item)
    if len(products)==1 and len(result)==1 and products[0]['id'] not in result:result={products[0]['id']:next(iter(result.values()))}
    for slot in products:
        item=result.get(slot['id'])
        if item is None:raise PointPromptError('商品定位回复遗漏了商品，原图已保留。')
        for key in ('foreground','background'):
            raw=item.get(key)
            if not isinstance(raw,list):raise PointPromptError('商品定位点格式无效，原图已保留。')
            ids=[]
            for value in raw:
                if isinstance(value,str) and re.fullmatch(r'[0-9]{1,4}',value):value=int(value)
                elif type(value) is float and value.is_integer():value=int(value)
                if type(value) is not int or value not in points:
                    raise PointPromptError('商品定位点编号超出图片范围，原图已保留。')
                if value not in ids:ids.append(value)
            if len(ids)<2:raise PointPromptError('商品有效定位点不足，原图已保留。')
            item[key]=ids
        if set(item['foreground'])&set(item['background']):raise PointPromptError('商品前景与背景定位点冲突，原图已保留。')
    return {slot['id']:result[slot['id']] for slot in products}


def select_points(image,products,vision,encode):
    grid,points=point_grid(image)
    description=[{key:slot[key] for key in ('id','label','x','y','w','h')} for slot in products]
    instruction=f'''图上覆盖了1到{max(points)}号采样点，白色数字圆点仅用于定位。只能返回图上实际存在的编号，禁止超出1到{max(points)}。要逐件抠出真实商品，包含完整包装、盖子和泵头。不要包含乳霜涂抹、植物、花朵、背景、容量角标、投影或倒影。商品信息：{description}。粗框可能偏移，按实际商品判断。
只返回JSON {{"products":[{{"id":"product-1","foreground":[采样点编号],"background":[采样点编号]}}]}}。每个foreground选3到8个点，圆点中心必须在这一件商品内；瓶身和盖子/泵头都至少1点，并覆盖真实瓶底。斜放软管覆盖封口、管身和盖子。background选4到10点，要落在紧贴商品左右及上下的背景、乳霜、花朵、倒影上，尤其排除与商品相连的装饰物；若下方有倒影，必须至少选1个倒影内的点作为background，真实瓶底与倒影分开。不要只选最远处的背景。不要将包装字母或其他数字当采样点编号。'''
    validate=lambda value:normalize_points(value,products,points)
    validated=getattr(vision,'validated',None)
    reply=validated(encode(grid),instruction,validate) if validated else vision(encode(grid),instruction)
    return validate(reply),points


def trim_reflection(image,alpha,vision,encode):
    """A touching reflection can fool SAM into including a second bottle base."""
    box=alpha.point(lambda value:255 if value>20 else 0).getbbox()
    if not box:return alpha
    x,y,right,bottom=box;w=right-x;h=bottom-y
    if h<w*1.4 or h<image.height*.2:return alpha
    rgb=np.asarray(image.convert('RGB')).astype('float32')
    left=max(0,round(x+w*.1));end=min(image.width,round(right-w*.1));scores=[]
    for plane in range(round(y+h*.55),min(image.height-30,bottom-3),2):
        depth=min(image.height-plane,round(h*.25),plane)
        if depth<30:continue
        a=rgb[plane-depth:plane,left:end][::-1];b=rgb[plane:plane+depth,left:end]
        ah=a-cv2.GaussianBlur(a,(0,0),3);bh=b-cv2.GaussianBlur(b,(0,0),3)
        if min(float(ah.std()),float(bh.std()))<.5:continue
        high=float(np.corrcoef(ah.ravel(),bh.ravel())[0,1]);raw=float(np.corrcoef(a.ravel(),b.ravel())[0,1])
        if np.isfinite(high) and np.isfinite(raw):scores.append((high,raw,plane))
    if not scores or not any(high>.18 and raw>.7 for high,raw,_ in scores):return alpha
    cropbox=(max(0,x-round(w*.4)),y+round(h*.6),min(image.width,right+round(w*.4)),min(image.height,bottom+round(h*.15)))
    crop=image.crop(cropbox)
    answer=vision(encode(crop),'这是商品下半部分及其接触面。区分真实包装与下面的镜面倒影，保留真实包装底部装饰环，但不包含倒影。找出真实商品最底部与倒影接触的水平线。坐标y从裁剪图顶部0到底部1000。返回JSON {"hasReflection":true或false,"supportY":0到1000的整数,"confidence":0到1}。没有倒影时supportY为null。不要把瓶底装饰环当作倒影。')
    value=answer.get('supportY');confidence=answer.get('confidence',0)
    if answer.get('hasReflection') is not True or type(value) not in (int,float) or not 0<=value<=1000 or not isinstance(confidence,(int,float)) or confidence<.85:return alpha
    support=cropbox[1]+value/1000*crop.height
    if not y+h*.5<support<bottom-3:return alpha
    nearby=[entry for entry in scores if abs(entry[2]-support)<=max(12,crop.height*.05) and entry[0]>.18 and entry[1]>.7]
    if nearby:support=max(nearby,key=lambda entry:entry[0])[2]
    values=np.asarray(alpha).copy();cut=min(image.height,round(support)+2);values[cut:]=0
    if cut>0:values[cut-1]=(values[cut-1].astype('uint16')//2).astype('uint8')
    return Image.fromarray(values)


def exclude_attached_props(alpha):
    """Prune a thin, outlying prop attached to an otherwise straight package."""
    box=alpha.point(lambda value:255 if value>128 else 0).getbbox()
    if not box:return alpha
    x,y,right,bottom=box;w=right-x;h=bottom-y
    if h<w*1.5:return alpha
    values=np.asarray(alpha).copy();binary=values>128;rows=[]
    for row in range(y+round(h*.3),y+round(h*.7)):
        positions=np.flatnonzero(binary[row])
        if len(positions):rows.append((positions[0],positions[-1]))
    if len(rows)<20:return alpha
    profile=np.asarray(rows);left,edge=np.median(profile,axis=0);width=edge-left+1
    # Curved/angled tubes, jars, handles and tapered packs do not satisfy this
    # gate. Only a stable body with a large lower-side branch is constrained.
    if width<30 or np.max(np.median(np.abs(profile-[left,edge]),axis=0))>width*.035:return alpha
    lower=binary[y+round(h*.7):bottom];ys,xs=np.nonzero(lower)
    if not len(xs) or xs.max()-xs.min()+1<width*1.25:return alpha
    margin=max(2,round(width*.012));a=max(0,round(left)-margin);b=min(values.shape[1],round(edge)+margin+1);start=y+round(h*.7)
    values[start:,:a]=0;values[start:,b:]=0
    coverage=(values[start:bottom,a:b]>128).sum(axis=1)
    solid=np.flatnonzero(coverage>width*.55)
    if len(solid):values[min(bottom,start+int(solid[-1])+max(3,round(width*.02))):]=0
    return Image.fromarray(values)


def contours_agree(coarse,refined):
    """A bad crop point must not invalidate two corroborating object contours.

    This never accepts an unverified mask. The caller may retain an already
    validated whole-image result only when the independently prompted close view
    agrees on its area and full extent. Large missing caps, props and reflections
    still fail this gate.
    """
    a=np.asarray(coarse)>0;b=np.asarray(refined)>0
    if a.shape!=b.shape or a.ndim!=2 or not a.any() or not b.any():return False
    if float((a&b).sum())/int((a|b).sum())<.97:return False
    ax,ay,aw,ah=cv2.boundingRect(a.astype('uint8'));bx,by,bw,bh=cv2.boundingRect(b.astype('uint8'))
    dx=max(3,aw*.025);dy=max(3,ah*.025)
    return abs(ax-bx)<=dx and abs(ax+aw-bx-bw)<=dx and abs(ay-by)<=dy and abs(ay+ah-by-bh)<=dy


def segment(image,products,vision,encode):
    """All output RGB pixels come from the source. The model only supplies alpha."""
    try:prompts,coordinates=select_points(image,products,vision,encode)
    except PointPromptError:prompts={};coordinates={}
    with _lock:
        encoder,decoder=sessions();scale=1024/max(image.size);width=round(image.width*scale);height=round(image.height*scale)
        features=encoder.run(None,{'input_image':np.asarray(image.convert('RGB').resize((width,height),Image.Resampling.LANCZOS),dtype='float32')})
        def predict(coords,labels):
            result=decoder.run(None,{'image_embeddings':features[0],'interm_embeddings':np.stack(features[1:]),'point_coords':np.array([coords],dtype='float32')*scale,'point_labels':np.array([labels],dtype='float32'),'mask_input':np.zeros((1,1,256,256),dtype='float32'),'has_mask_input':np.array([0],dtype='float32'),'orig_im_size':np.array([height,width],dtype='float32')})
            return result[0][0,0]>0,float(result[1][0,0])
        output={}
        for slot in products:
            prompt=prompts.get(slot['id']);foreground=[coordinates[i] for i in prompt['foreground']] if prompt else [];background=[coordinates[i] for i in prompt['background']] if prompt else []
            direct,direct_score=predict(foreground+background,[1]*len(foreground)+[0]*len(background)) if prompt else (None,0)
            candidates=[]
            for factor in sorted(set([1,image.width/1000])):
                pad=slot['w']*.1;x=max(0,(slot['x']-pad)*factor);y=max(0,(slot['y']-pad)*factor);right=min(image.width,(slot['x']+slot['w']+pad)*factor);bottom=min(image.height,(slot['y']+slot['h']+pad)*factor)
                if right<=x or bottom<=y:continue
                mask,score=predict([[x,y],[right,bottom]],[2,3])
                if not .001<float(mask.mean())<.85:continue
                hits=sum(mask[min(height-1,int(py*scale)),min(width-1,int(px*scale))] for px,py in foreground)
                candidates.append((hits/max(1,len(foreground))*2+score,mask,score))
            if not candidates:raise RuntimeError('无法验证商品轮廓范围。')
            boundary=max(candidates,key=lambda candidate:candidate[0])[1]
            # The semantic pass excludes attached props; the box pass protects
            # against unrelated objects admitted by an overly broad point mask.
            def fill_mask(direct,boundary):
                mask=(direct&cv2.dilate(boundary.astype('uint8'),np.ones((5,5),'uint8')).astype(bool)).astype('uint8')*255 if direct is not None else np.zeros((height,width),'uint8')
                contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);filled=np.zeros_like(mask)
                # A slot represents one physical package. Detached petals, dots
                # and props must not expand its placement bounds or follow it.
                if contours:
                    contour=max(contours,key=cv2.contourArea)
                    if cv2.contourArea(contour)>max(30,width*height*.0005):cv2.drawContours(filled,[contour],-1,255,-1)
                return filled
            filled=fill_mask(direct,boundary)
            def valid():
                # Grid points near a cap/base can fall a few source pixels past
                # the contour. Check a bounded edge tolerance, not exact pixels.
                distance=cv2.distanceTransform((filled==0).astype('uint8'),cv2.DIST_L2,3)
                tolerance=max(2,min(12,min(width,height)/64))
                hits=sum(distance[min(height-1,int(py*scale)),min(width-1,int(px*scale))]<=tolerance for px,py in foreground)
                return bool(foreground) and hits/len(foreground)>=.8 and .002<float((filled>0).mean())<.85
            coarse=filled.copy();coarse_valid=valid();coarse_score=direct_score
            # A closer view checks the packaging edge even when the coarse mask
            # passed: a touching reflection can otherwise look like a valid body.
            best=max(candidates,key=lambda candidate:candidate[2])[1];ys,xs=np.nonzero(best)
            if not len(xs):raise RuntimeError('商品轮廓为空，原图已保留。')
            pad=max(20,round(min(xs.max()-xs.min()+1,ys.max()-ys.min()+1)/scale*.2))
            left=max(0,round(xs.min()/scale)-pad);top=max(0,round(ys.min()/scale)-pad);right=min(image.width,round((xs.max()+1)/scale)+pad);bottom=min(image.height,round((ys.max()+1)/scale)+pad)
            crop=image.crop((left,top,right,bottom));crop_slot={**slot,'x':pad,'y':pad,'w':max(1,crop.width-pad*2),'h':max(1,crop.height-pad*2)}
            debug=os.environ.get('WORKBENCH_SEGMENT_DEBUG_DIR')
            if debug:
                folder=Path(debug);folder.mkdir(parents=True,exist_ok=True);identity=re.sub(r'[^a-zA-Z0-9_-]','_',slot['id'])[:60];crop.convert('RGB').save(folder/(identity+'-crop.jpg'))
            refined,points=select_points(crop,[crop_slot],vision,encode);prompt=refined[slot['id']]
            foreground=[[points[i][0]+left,points[i][1]+top] for i in prompt['foreground']];background=[[points[i][0]+left,points[i][1]+top] for i in prompt['background']]
            direct,direct_score=predict(foreground+background,[1]*len(foreground)+[0]*len(background))
            crop_boundary,_=predict([[left,top],[right,bottom]],[2,3]);filled=fill_mask(direct,crop_boundary);refined_candidate=filled.copy()
            if len(products)==1 and coarse_valid:
                _,_,cw,ch=cv2.boundingRect(coarse);_,_,fw,fh=cv2.boundingRect(filled)
                if fw>cw*1.12 or fh>ch*1.12:
                    # A closer view must not silently attach a neighbouring prop
                    # the whole-image semantic pass explicitly excluded.
                    allowed=cv2.dilate(coarse,np.ones((7,7),'uint8'));refined_mask=filled
                    filled=cv2.bitwise_and(filled,allowed)
                    if not valid():filled=refined_mask
            mask_prompt=prompt;validation='close-view'
            if not valid() and coarse_valid and contours_agree(coarse,refined_candidate):
                # The close-view model can put its first/last foreground point
                # above a crimp seal or below a silver cap. SAM correctly rejects
                # those points. Keep the verified whole-image contour, rather
                # than weakening the foreground check or using the crop mask.
                filled=coarse;direct_score=coarse_score;mask_prompt=prompts[slot['id']];validation='whole-image-and-close-view'
            elif not valid():
                debug=os.environ.get('WORKBENCH_SEGMENT_DEBUG_DIR')
                if debug:
                    folder=Path(debug);folder.mkdir(parents=True,exist_ok=True);identity=re.sub(r'[^a-zA-Z0-9_-]','_',slot['id'])[:60]
                    Image.fromarray(filled).save(folder/(identity+'-failed-mask.png'));(folder/(identity+'-failed.json')).write_text(json.dumps({'slot':slot['id'],'foreground':foreground,'background':background,'coverage':float((filled>0).mean())}),encoding='utf8')
                raise RuntimeError('商品轮廓完整性未通过检查，原图已保留。')
            alpha=Image.fromarray(filled).resize(image.size,Image.Resampling.LANCZOS)
            alpha=exclude_attached_props(alpha)
            alpha=trim_reflection(image,alpha,vision,encode)
            output[slot['id']]={'alpha':alpha,'prompts':mask_prompt,'score':direct_score,'geometryVersion':MULTI_VERSION if len(products)>1 else VERSION,'geometryMaskRevision':2,'contourValidation':validation}
        return output
