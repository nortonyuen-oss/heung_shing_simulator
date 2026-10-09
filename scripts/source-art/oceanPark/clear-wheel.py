"""Clear the white left inside the 海洋公園 Ferris wheel by the original background removal (the
rim closed it off from the border). Inside the wheel's circle, outside its hub: near-white patches
go transparent; pixels round them fade by how near white they are, so the beige spokes stay solid.

  python3 scripts/source-art/oceanPark/clear-wheel.py"""
import os, numpy as np
from collections import deque
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'oceanPark4-01-before-wheel-fix.png')
OUT = os.path.join(HERE, '..', '..', '..', 'Models', 'specialSites', '4x4', 'oceanPark4-01.png')
CX, CY, R, HUB = 247.5, 542.5, 68, 15      # the wheel on the 1024 texture, and its hub (kept)
WHITE_MIN, WHITE_SAT, SPOKE_MIN = 215, 28, 200

im = np.asarray(Image.open(SRC).convert('RGBA')).astype(float)
H, W, _ = im.shape
yy, xx = np.mgrid[0:H, 0:W]; d = np.hypot(xx - CX, yy - CY)
zone = (d <= R) & (d > HUB)
rgb = im[..., :3]; mn = rgb.min(-1); sat = rgb.max(-1) - mn
white = zone & (mn >= WHITE_MIN) & (sat <= WHITE_SAT) & (im[..., 3] > 0)
seen = np.zeros_like(white); patch = np.zeros_like(white)
for y0, x0 in zip(*np.nonzero(white)):
    if seen[y0, x0]: continue
    q = deque([(y0, x0)]); seen[y0, x0] = 1; reg = []
    while q:
        y, x = q.popleft(); reg.append((y, x))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and white[ny, nx] and not seen[ny, nx]: seen[ny, nx] = 1; q.append((ny, nx))
    if len(reg) >= 4:
        ys, xs = zip(*reg); patch[list(ys), list(xs)] = 1
ring = (np.asarray(Image.fromarray((patch * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0) & zone & ~patch
a = im[..., 3] / 255
edge_a = np.clip((255 - mn) / (255 - SPOKE_MIN), 0, 1)        # a spoke (min channel <= 200) stays solid
new_a = np.where(patch, 0, np.where(ring, np.minimum(a, edge_a), a))
na = new_a[..., None]
unmixed = np.clip((rgb - 255 * (1 - na)) / np.maximum(na, 1e-3), 0, 255)
out_rgb = np.where((ring & (new_a < a))[..., None], unmixed, rgb)
out = np.concatenate([out_rgb, na * 255], -1).astype(np.uint8); out[out[..., 3] <= 2] = 0
Image.fromarray(out).save(OUT, optimize=True)
print('cleared', int(patch.sum()), 'px, softened', int((ring & (new_a < a)).sum()))
