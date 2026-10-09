"""Cut the 黃金海岸酒店 renders out of their backgrounds and square them to the 4x4 lot.

  python3 scripts/source-art/goldCoastHotel/fit.py

The day render is on white, the night one on a navy gradient; each background is flood-filled from
the border and the edge pixels are unmixed from it. Then, as for the yacht club, an up-down skew
about the front corner (verticals stay vertical) and an x:y scale. The art has a little
perspective - its lines steepen toward the ground (tower X +0.51, podium +0.54, base +0.57; tower Y
-0.485, base -0.545) - so the fit takes the building's and the base plate's slopes alike, which
leaves every one of them within 0.035 of 2:1 (fitting the tower alone would tip the base 10% off
the lot). The base plate is not square either (its front-left side 11% the longer), which no warp
that keeps verticals upright can change: as for the yacht club, the long side spans a whole edge of
the lot, the plate's back flush with the lot's back, and the strip left open in front lies on a
faint ground pad over the whole 4x4, so the sprite fit still reads the full lot."""
import numpy as np, os
from collections import deque
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', 'Models', 'specialSites', '4x4')
X_SLOPE = (0.525 + 0.57) / 2       # building (tower 0.51, podium 0.54) and base plate
Y_SLOPE = (0.485 + 0.545) / 2      # tower's right face and base plate (magnitudes)
L, F, R = (13, 804.6), (659.1, 1172.9), (1240, 856.5)   # the base plate's bottom corners
CANVAS, LEFT, RIGHT, BOTTOM = 1024, 7, 1017, 1016
HALF = (RIGHT - LEFT) / 2
DL, DF, DR, DT = (LEFT, BOTTOM - HALF / 2), (LEFT + HALF, BOTTOM), (RIGHT, BOTTOM - HALF / 2), (LEFT + HALF, BOTTOM - HALF)
PAD_A, PAD_RGB = 36, (92, 88, 82)

def flood(cand):
    H, W = cand.shape; bg = np.zeros((H, W), bool); q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if cand[y, x] and not bg[y, x]: bg[y, x] = 1; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if cand[y, x] and not bg[y, x]: bg[y, x] = 1; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and cand[ny, nx] and not bg[ny, nx]: bg[ny, nx] = 1; q.append((ny, nx))
    return bg

def enclaves(mask, min_px):
    """The 4-connected regions of `mask` at least `min_px` big."""
    H, W = mask.shape; seen = np.zeros_like(mask); out = np.zeros_like(mask)
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]: continue
        q = deque([(y0, x0)]); seen[y0, x0] = 1; region = []
        while q:
            y, x = q.popleft(); region.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]: seen[ny, nx] = 1; q.append((ny, nx))
        if len(region) >= min_px:
            ys, xs = zip(*region); out[list(ys), list(xs)] = 1
    return out

def box(img, r):
    p = np.pad(img, r + 1, mode='edge').cumsum(0).cumsum(1)
    n = 2 * r + 1
    return (p[n:, n:] - p[:-n, n:] - p[n:, :-n] + p[:-n, :-n])[:img.shape[0], :img.shape[1]] / (n * n)

def cut(rgb, bg):
    """Soft alpha one pixel into the object, the background unmixed from the edge colours."""
    fg = Image.fromarray((~bg * 255).astype(np.uint8))
    hard = np.asarray(fg.filter(ImageFilter.MinFilter(3))) > 127          # one pixel in
    soft = np.asarray(fg.filter(ImageFilter.GaussianBlur(0.8))).astype(float) / 255
    a = np.where(hard, 1.0, np.where(bg, 0.0, soft))
    # the local background colour: blurred from background pixels only
    w = bg.astype(float)
    den = box(w, 6)
    bgc = np.stack([box(rgb[..., c] * w, 6) / np.maximum(den, 1e-3) for c in range(3)], -1)
    am = a[..., None]
    un = np.where(am > 0.02, (rgb - (1 - am) * bgc) / np.maximum(am, 1e-3), 0)
    out = np.concatenate([np.clip(np.where(am >= 1, rgb, un), 0, 255), a[..., None] * 255], -1)
    return out.astype(np.uint8)

def warp(rgba):
    s = -(X_SLOPE - Y_SLOPE) / 2; m = X_SLOPE + s; k = 0.5 / m
    yb = lambda x, y: k * (y + s * (x - F[0]))
    u = HALF / max(F[0] - L[0], R[0] - F[0])        # the long side spans a whole edge of the lot
    ox = RIGHT - u * R[0]; oy = DR[1] - u * yb(*R)  # the plate's right corner on the lot's
    # forward: X = u x + ox ; Y = u k (y + s (x - Fx)) + oy  ->  inverse for PIL
    A_, B_, C_ = 1 / u, 0, -ox / u
    D_ = -s / u; E_ = 1 / (u * k); F_ = -oy / (u * k) + s * ox / u + s * F[0]
    arr = rgba.astype(float); al = arr[..., 3:] / 255
    pre = np.concatenate([arr[..., :3] * al, arr[..., 3:]], -1).astype(np.uint8)
    o = np.asarray(Image.fromarray(pre).transform((CANVAS, CANVAS), Image.AFFINE, (A_, B_, C_, D_, E_, F_), Image.BICUBIC)).astype(float)
    a = o[..., 3:] / 255; rgb = np.where(a > 0, o[..., :3] / np.maximum(a, 1e-6), 0)
    # the faint ground pad over the whole lot, under the art (premultiplied)
    from PIL import ImageDraw
    pad = Image.new('L', (CANVAS, CANVAS), 0); ImageDraw.Draw(pad).polygon([DL, DF, DR, DT], fill=255)
    pa = np.asarray(pad).astype(float)[..., None] / 255 * PAD_A * (1 - a)
    a2 = o[..., 3:] + pa
    rgbp = o[..., :3] + np.array(PAD_RGB, float) * pa / 255
    rgb = np.where(a2 > 0, rgbp / np.maximum(a2, 1e-6) * 255, 0)
    o = np.concatenate([np.clip(rgb, 0, 255), np.clip(a2, 0, 255)], -1).astype(np.uint8); o[o[..., 3] <= 2] = 0
    fwd = lambda p: (u * p[0] + ox, u * yb(*p) + oy)
    return Image.fromarray(o), [tuple(round(v, 1) for v in fwd(p)) for p in (L, F, R)], (s, k, u)

if __name__ == '__main__':
    day = np.asarray(Image.open(os.path.join(HERE, 'goldCoastHotel4-01_day-source.png')).convert('RGB')).astype(float)
    night = np.asarray(Image.open(os.path.join(HERE, 'goldCoastHotel4-01-source.png')).convert('RGB')).astype(float)
    cand_day = np.abs(255 - day).max(-1) < 26
    bg_day = flood(cand_day)
    # the background also shows through between palm fronds, cut off from the border: white pockets
    # of a few pixels or more (the beige building and the pools are never near white)
    pockets = enclaves(cand_day & ~bg_day, 12)
    bg_day |= pockets
    r, g, b = night[..., 0], night[..., 1], night[..., 2]
    cand_night = (b > r + 25) & (b > g + 12) & (r < 70)
    # at night only where the day render has a pocket too, so the lit pools stay
    near = np.asarray(Image.fromarray((pockets * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    bg_night = flood(cand_night) | (cand_night & near)
    for name, rgb, bg in (('goldCoastHotel4-01_day', day, bg_day), ('goldCoastHotel4-01', night, bg_night)):
        im, corners, params = warp(cut(rgb, bg))
        im.save(os.path.join(OUT, name + '.png'), optimize=True)
        print(name, 'skew %.4f yscale %.4f u %.4f' % params, 'base L F R', corners, 'bbox', im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
