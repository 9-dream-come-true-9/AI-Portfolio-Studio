"""Download the optional SAM-HQ models listed in the checked manifest."""
from pathlib import Path
import hashlib
import json
import os
import urllib.request


ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / 'models'
MANIFEST = MODEL_DIR / 'series-segmentation-models.json'


def digest_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def download(item):
    target = MODEL_DIR / item['file']
    expected_size = int(item['bytes'])
    expected_hash = item['sha256']
    if target.is_file() and target.stat().st_size == expected_size and digest_file(target) == expected_hash:
        print(f"Already verified: {target.name}")
        return
    temporary = target.with_suffix(target.suffix + '.partial')
    request = urllib.request.Request(item['download'], headers={'User-Agent': 'AI-Portfolio-Studio-model-installer'})
    try:
        count = 0
        digest = hashlib.sha256()
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open('wb') as output:
            while block := response.read(4 * 1024 * 1024):
                count += len(block)
                if count > expected_size:
                    raise ValueError(f"Model exceeds expected size: {target.name}")
                digest.update(block)
                output.write(block)
        if count != expected_size or digest.hexdigest() != expected_hash:
            raise ValueError(f"Model checksum mismatch: {target.name}")
        os.replace(temporary, target)
        print(f"Downloaded and verified: {target.name}")
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for model in manifest['models']:
        download(model)
