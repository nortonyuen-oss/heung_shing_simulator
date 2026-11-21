"""The website's box art (Norton 2026-11-21): the studio backdrop around the box cleared to transparency.

  python3 scripts/source-art/site/cut-box.py

The backdrop and the box's floor shadow are light, nearly grey pixels joined to the picture's edge; the
box is ringed by its dark maroon edges. A flood from the border through backdrop-like pixels finds the
backdrop, which is cleared with a soft rim. Writes docs/assets/site/box.webp (and a PNG beside the source).
"""
import os
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..', '..')
src = Image.open(os.path.join(HERE, 'box-art-source.png')).convert('RGB')
a = np.asarray(src).astype(int)
h, w, _ = a.shape
lo, hi = a.min(-1), a.max(-1)
backdropish = (lo > 112) & (hi - lo < 46)
seen = np.zeros((h, w), bool)
q = deque((y, x) for y in range(h) for x in (0, w - 1)) ; q.extend((y, x) for x in range(w) for y in (0, h - 1))
while q:
    y, x = q.popleft()
    if seen[y, x] or not backdropish[y, x]: continue
    seen[y, x] = True
    if y > 0: q.append((y - 1, x))
    if y < h - 1: q.append((y + 1, x))
    if x > 0: q.append((y, x - 1))
    if x < w - 1: q.append((y, x + 1))
alpha = Image.fromarray(np.where(seen, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.9))
out = src.convert('RGBA'); out.putalpha(alpha)
box = out.crop(Image.fromarray((~seen).astype(np.uint8) * 255).getbbox())
box.save(os.path.join(HERE, 'box-art.png'), optimize=True)
box.resize((720, round(box.height * 720 / box.width)), Image.LANCZOS).save(os.path.join(ROOT, 'docs', 'assets', 'site', 'box.webp'), 'WEBP', quality=86, method=6)
print('box', box.size, 'cleared', round(seen.mean(), 3))
