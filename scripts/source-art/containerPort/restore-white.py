"""Give the 貨櫃碼頭 back its whites. The original background removal took white for background:
white roofs, crane machinery houses, tanks and road markings came out part or wholly transparent,
their colours unmixed from white (alpha = how far from white). Laying such a pixel back over white
and making it opaque restores it: rgb' = a rgb + (1 - a) 255.

Inside the yard's diamond every pixel is restored (but a few px in from its edge, which stays
antialiased). Above it, where the cranes rise against the sky, only holes in the opaque art are,
and only holes with some colour in them: a gap between beams is fully clear (mean alpha < MIN_HOLE_A)
and stays so.

  python3 scripts/source-art/containerPort/restore-white.py
LR and UR are the mirrors of LL and UL and are written as such."""
import os, numpy as np
from collections import deque
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'before-white-fix')
OUT = os.path.join(HERE, '..', '..', '..', 'Models', 'containerPort', '4x4')
EDGE_PX, MIN_HOLE_A = 4, 40

def regions(mask):
    H, W = mask.shape; seen = np.zeros_like(mask)
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]: continue
        q = deque([(y0, x0)]); seen[y0, x0] = 1; reg = []
        while q:
            y, x = q.popleft(); reg.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]: seen[ny, nx] = 1; q.append((ny, nx))
        yield reg

def restore(path):
    im = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    a = im[..., 3]; H, W = a.shape
    solid = a > 200; ys, xs = np.nonzero(solid)
    L = (xs.min(), ys[xs == xs.min()].mean()); R = (xs.max(), ys[xs == xs.max()].mean()); B = (xs[ys == ys.max()].mean(), ys.max())
    T = (L[0] + R[0] - B[0], L[1] + R[1] - B[1])
    poly = Image.new('L', (W, H), 0); ImageDraw.Draw(poly).polygon([L, B, R, T], fill=255)
    yard = np.asarray(poly.filter(ImageFilter.MinFilter(2 * EDGE_PX + 1))) > 0
    fix = yard & (a < 255)
    # above the yard: holes in the opaque art (not reached from the border without crossing it)
    opaque = a >= 250
    outside = ~opaque
    reached = np.zeros_like(outside); q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if outside[y, x]: reached[y, x] = 1; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if outside[y, x] and not reached[y, x]: reached[y, x] = 1; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and outside[ny, nx] and not reached[ny, nx]: reached[ny, nx] = 1; q.append((ny, nx))
    holes = outside & ~reached & ~yard
    kept_gaps = 0
    for reg in regions(holes):
        ys_, xs_ = map(list, zip(*reg))
        if a[ys_, xs_].mean() >= MIN_HOLE_A: fix[ys_, xs_] = 1
        else: kept_gaps += 1
    al = a[..., None] / 255
    rgb = np.where(fix[..., None], al * im[..., :3] + (1 - al) * 255, im[..., :3])
    out = np.concatenate([rgb, np.where(fix, 255, a)[..., None]], -1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)), int(fix.sum()), kept_gaps

for name, mirror in (('LL', 'LR'), ('UL', 'UR')):
    img, n, gaps = restore(os.path.join(SRC, f'containerPort4-{name}.png'))
    img.save(os.path.join(OUT, f'containerPort4-{name}.png'), optimize=True)
    img.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(OUT, f'containerPort4-{mirror}.png'), optimize=True)
    print(name, '+', mirror, 'restored', n, 'px; gaps between beams kept', gaps)
