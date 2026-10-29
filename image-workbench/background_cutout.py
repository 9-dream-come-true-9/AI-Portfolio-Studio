"""Local CPU foreground extraction; photos never leave the workbench server."""
import base64
from io import BytesIO
from pathlib import Path
import re
import threading

ROOT = Path(__file__).resolve().parent
_session = None
_lock = threading.Lock()


def remove_background(source):
    if not isinstance(source, str) or len(source) > 29 * 1024 * 1024:
        raise ValueError('图片过大，请使用不超过 20 MB 的图片。')
    match = re.fullmatch(r'data:image/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)', source)
    if not match:
        raise ValueError('请导入 PNG、JPG 或 WebP 图片。')
    try:
        raw = base64.b64decode(match[1], validate=True)
        if len(raw) > 20 * 1024 * 1024:
            raise ValueError('图片超过 20 MB。')
        from PIL import Image, ImageOps
        original = Image.open(BytesIO(raw))
        if original.format not in ('PNG', 'JPEG', 'WEBP') or original.width * original.height > 40_000_000:
            raise ValueError('图片格式或尺寸不受支持。')
        image = ImageOps.exif_transpose(original).convert('RGBA')
    except Exception as error:
        raise ValueError('图片无法读取，请重新导入有效图片。') from error
    # Do not erode an existing cutout when the user changes background again.
    if image.getchannel('A').getextrema()[0] < 255:
        return source
    if not _lock.acquire(blocking=False):
        raise RuntimeError('正在处理另一张图片，请稍后重试。')
    try:
        import numpy as np
        import onnxruntime as ort
        global _session
        if _session is None:
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            _session = ort.InferenceSession(str(ROOT / 'models/u2netp.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
        # U2NETP preprocessing: 320px RGB, ImageNet mean/std, NCHW float32.
        rgb = np.asarray(image.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32)
        rgb /= max(float(rgb.max()), 1e-6)
        rgb = (rgb - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
        tensor = np.transpose(rgb, (2, 0, 1))[None].astype(np.float32)
        prediction = _session.run(None, {_session.get_inputs()[0].name: tensor})[0][0, 0]
        spread = float(prediction.max() - prediction.min())
        if spread < 1e-6:
            raise ValueError('未识别到清晰商品主体，请换一张主体更清晰的图片。')
        prediction = (prediction - prediction.min()) / spread
        coverage = float(np.mean(prediction > .5))
        if coverage < .001 or coverage > .995:
            raise ValueError('无法可靠区分商品与背景，请换一张主体更清晰的图片。')
        prediction[prediction < .01] = 0
        prediction[prediction > .99] = 1
        mask = Image.fromarray((prediction * 255).astype('uint8')).resize(image.size, Image.Resampling.LANCZOS)
        image.putalpha(mask)
        output = BytesIO()
        image.save(output, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode('ascii')
    finally:
        _lock.release()
