"""Embed the series feature in the existing static entry point.

Run after changing series-workbench.js or series-workbench.css.
The running workbench serves index.html directly, so updates need no new routes.
"""
from pathlib import Path

root = Path(__file__).resolve().parent
target = root / 'index.html'
text = target.read_bytes().decode('utf-8')
begin, end = '<!-- series-workbench:begin -->', '<!-- series-workbench:end -->'
css = (root / 'series-workbench.css').read_text(encoding='utf-8')
ui = (root / 'series-workbench.js').read_text(encoding='utf-8')
engine = (root / 'series-layout.js').read_text(encoding='utf-8')
bundle = begin + '\n<style id="seriesWorkbenchStyles">\n' + css + '\n</style>\n<script>\n' + engine + '\n</script>\n<script>\n' + ui + '\n</script>\n' + end
if begin in text:
    prefix, rest = text.split(begin, 1)
    _, suffix = rest.split(end, 1)
    text = prefix + bundle + suffix
else:
    anchor = '<script src="/series-layout.js"></script><script src="/series-workbench.js"></script>'
    if anchor not in text:
        raise SystemExit('Series bundle insertion point is missing; index.html was not modified.')
    text = text.replace(anchor, bundle, 1)
target.write_bytes(text.encode('utf-8'))
print('Series bundle updated in index.html.')
