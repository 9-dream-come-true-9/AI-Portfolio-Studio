"""Recover a product cutout and its upright placement from source pixels."""
import math
import cv2
import numpy as np


def from_mask(image,slot,result,encode):
    alpha=result['alpha'];bbox=alpha.point(lambda value:255 if value>20 else 0).getbbox()
    if not bbox:raise RuntimeError('商品轮廓为空，原图已保留。')
    cutout=image.convert('RGBA').copy();cutout.putalpha(alpha);cutout=cutout.crop(bbox)
    sourcebox={'x':bbox[0],'y':bbox[1],'w':cutout.width,'h':cutout.height}
    ys,xs=np.nonzero(np.asarray(cutout.getchannel('A'))>128)
    (cx,cy),(rw,rh),angle=cv2.minAreaRect(np.column_stack((xs,ys)).astype('float32'))
    if rw>rh:rw,rh=rh,rw;angle+=90
    angle=(angle+90)%180-90
    # A wide jar/compact is still upright. The long geometric side alone cannot
    # distinguish it from a bottle photographed sideways; packaging text can.
    from series_layout import ocr_rows
    readings=[];full_alpha=np.asarray(alpha)
    for polygon,value,confidence in ocr_rows(image):
        if confidence<.65 or len(value.strip())<3:continue
        px=round(sum(p[0] for p in polygon)/4);py=round(sum(p[1] for p in polygon)/4)
        if not 0<=px<image.width or not 0<=py<image.height or full_alpha[py,px]<128:continue
        dx=polygon[1][0]-polygon[0][0];dy=polygon[1][1]-polygon[0][1]
        reading=(math.degrees(math.atan2(dy,dx))+90)%180-90
        readings.extend([reading]*min(80,len(value.strip())))
    preferred=float(np.median(readings)) if readings else 0 if sourcebox['w']>=sourcebox['h']*.8 else None
    if preferred is not None and abs((angle-preferred+90)%180-90)>60:
        angle=preferred;theta=math.radians(angle);u=np.array([math.cos(theta),math.sin(theta)]);v=np.array([-math.sin(theta),math.cos(theta)])
        coordinates=np.column_stack((xs,ys));horizontal=coordinates@u;vertical=coordinates@v;rw=float(horizontal.max()-horizontal.min());rh=float(vertical.max()-vertical.min());center=u*(horizontal.min()+horizontal.max())/2+v*(vertical.min()+vertical.max())/2;cx,cy=center
    pose={'x':bbox[0]+cx-rw/2,'y':bbox[1]+cy-rh/2,'w':rw,'h':rh,'rotation':angle}
    return {**slot,'productSrc':encode(cutout),'sourceBox':sourcebox,'pose':pose,'geometryVersion':result['geometryVersion'],'geometryMaskRevision':result.get('geometryMaskRevision',2),'segmentationScore':result['score']}
