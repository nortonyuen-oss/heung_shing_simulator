"""地鐵第三期: the train cars (Models/metroTrain/) from Norton's renders.

Norton's seven renders (scripts/source-art/subwayStation/original/MTrains/) are all cab cars, a cab
at one end and a gangway at the other, from eight ways round. From them, for each of the four ways
a car lies on screen - `fall` (long axis down-right), `rise` (up-right), `horiz`, `vert`:

- cabNear / cabFar (cabR / cabL for horiz): a cab car, its cab at the near (down-screen) or far end;
- mid: a middle car, gangways at both ends, spliced from the gangway halves of the two cab cars.

The renders' iso is not quite the game's 2:1: the falling ones are sheared until the red stripe along
the side runs at exactly 0.5 (not by the bogies' line: that overshoots and the cars step); `rise` is
`fall` mirrored. Each is sized to a 22.5 m MTR car on a 512-px tile (one game tile, 20 m). The side
and end-on views stand a little taller than the diagonal ones; squashing them to match looked worse
(Norton, 2026-11-05), so they keep their height. The narrower of the two end-on renders is widened
to the other's width so their halves splice; nothing is made smaller.

Five doors a side (Norton, 2026-11-06): the renders' cars have three, a car 22.5 m long but some 9 m
tall. Each side and falling view is relaid along the car - the ends and doors kept, two more door
bays put in, the window bays narrowed - to STRETCH times its length, then the whole picture scaled
by 1 / STRETCH: a car still covers 22.5 m, a 1.3 times lower and narrower one with an MTR car's
five doors. (The falling views laid level first, the car's side columns upright, and sheared back.)
The end-on views have no doors to show: scaled by 1 / STRETCH, their roofs drawn out again to the
car's length.

Writes Models/metroTrain/car_<name>.png and metro-train-art.js (each picture's path and the anchor:
where the car's middle sits on the rails, in the picture's pixels). A car's sprite is scaled by
TILE_WIDTH / 512 like the track tiles.

Run with .venv/bin/python -B scripts/prepare-metro-train-assets.py
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'scripts/source-art/subwayStation/original/MTrains'
OUT = ROOT / 'Models/metroTrain'
ART_JS = ROOT / 'metro-train-art.js'

PX_M_AXIS = np.hypot(256, 128) / 20     # px a metre along a map axis (a tile edge, 20 m, on a 512 tile)
PX_M_DIAG_H = 512 / (20 * np.sqrt(2))   # along a world diagonal drawn across the screen
PX_M_DIAG_V = 256 / (20 * np.sqrt(2))   # along a world diagonal drawn down the screen
CAR_M, WIDTH_M = 22.5, 3.1

RAW = {
    'fall_cabNear': 'image-gen-5(20261104-124827).png',
    'fall_cabFar': 'image-gen-8(20261104-124843).png',
    'horiz_cabR': 'image-gen-2(20261104-124815).png',
    'horiz_cabL': 'image-gen-6(20261104-124831).png',
    'vert_cabNear': 'image-gen-4(20261104-124823).png',
    'vert_cabFar': 'image-gen-7(20261104-124839).png',
}


def crop_alpha(im):
    a = np.asarray(im)
    ys, xs = np.nonzero(a[..., 3] > 100)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def stripe_slope(im):
    a = np.asarray(im).astype(np.float32)
    red = (a[..., 3] > 200) & (a[..., 0] > 150) & (a[..., 1] < 90) & (a[..., 2] < 90)
    ys, xs = np.nonzero(red)
    k, c = np.polyfit(xs, ys, 1)
    res = ys - (k * xs + c)
    keep = np.abs(res) < 3 * np.median(np.abs(res)) + 1
    return np.polyfit(xs[keep], ys[keep], 1)[0]


def shear_to(im, target):
    sh = target - stripe_slope(im)
    w, h = im.size
    pad = int(abs(sh) * w / 2) + 2
    canvas = Image.new('RGBA', (w, h + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (0, pad))
    return crop_alpha(canvas.transform(canvas.size, Image.AFFINE, (1, 0, 0, -sh, 1, sh * w / 2), resample=Image.BICUBIC))


def anchor_y(im, kind, width=WIDTH_M):
    """Where the car's middle sits on the rails: up from the bottom of its middle column."""
    a = np.asarray(im)
    col = a[:, im.size[0] // 2, 3] > 128
    bottom = np.nonzero(col)[0].max()
    if kind == 'fall':
        return bottom - width / 2 * PX_M_AXIS / np.sqrt(5)
    if kind == 'horiz':
        return bottom - width / 2 * PX_M_DIAG_V
    return bottom - CAR_M * PX_M_DIAG_V / 2


def load_cars():
    raw = {}
    for name, file in RAW.items():
        im = crop_alpha(Image.open(SRC / file).convert('RGBA'))
        kind = name.split('_')[0]
        if kind == 'fall':
            im = shear_to(im, 0.5)
        raw[name] = (im, kind)
    # sizes: a diagonal car spans its length along one axis plus its width along the other; a side
    # view its length across the screen; an end-on view as tall as the side view's body plus its length
    side_im = raw['horiz_cabR'][0]
    side_scale = CAR_M * PX_M_DIAG_H / side_im.size[0]
    side_body = side_im.size[1] * side_scale - WIDTH_M * PX_M_DIAG_V
    length_down = CAR_M * PX_M_DIAG_V
    cars = {}
    for name, (im, kind) in raw.items():
        if kind == 'fall':
            scale = (CAR_M + WIDTH_M) * PX_M_AXIS * 2 / np.sqrt(5) / im.size[0]
        elif kind == 'horiz':
            scale = CAR_M * PX_M_DIAG_H / im.size[0]
        else:
            scale = (side_body + length_down) / im.size[1]
        im = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.LANCZOS)
        cars[name] = {'img': im, 'kind': kind}
    # the two end-on renders came out of different widths: the narrower widened to the wider
    vert_w = max(cars[n]['img'].size[0] for n in ('vert_cabNear', 'vert_cabFar'))
    for name, car in cars.items():
        im = car['img']
        if car['kind'] == 'vert' and im.size[0] != vert_w:
            im = im.resize((vert_w, im.size[1]), Image.LANCZOS)
        car['img'] = im
        car['ax'] = im.size[0] / 2
        car['ay'] = anchor_y(im, car['kind'])
    return cars, side_body, length_down


def place(size, origin, car):
    c = Image.new('RGBA', size, (0, 0, 0, 0))
    c.alpha_composite(car['img'], (int(round(origin[0] - car['ax'])), int(round(origin[1] - car['ay']))))
    return np.asarray(c).astype(np.float32)


def splice(cars, a_name, b_name, near_fn):
    """A middle car: B where near_fn says (the near / right / bottom half), A elsewhere."""
    A, B = cars[a_name], cars[b_name]
    W = int(max(A['img'].size[0], B['img'].size[0]) + 40)
    H = int(max(A['img'].size[1], B['img'].size[1]) + 40)
    origin = (W / 2, max(A['ay'], B['ay']) + 20)
    pa, pb = place((W, H), origin, A), place((W, H), origin, B)
    Y, X = np.mgrid[0:H, 0:W]
    out = np.where(near_fn(X, Y, origin, pa)[..., None], pb, pa).astype(np.uint8)
    ys, xs = np.nonzero(out[..., 3] > 100)
    img = Image.fromarray(out, 'RGBA').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return {'img': img, 'kind': A['kind'], 'ax': origin[0] - xs.min(), 'ay': origin[1] - ys.min()}


def fall_near(X, Y, origin, pa):
    """The plane across the car's middle: upright on the near side face, along the width on the roof."""
    off = WIDTH_M / 2 * PX_M_AXIS
    xs = origin[0] - off * 2 / np.sqrt(5)
    y = int(origin[1] + off / np.sqrt(5))
    lum = pa[:, int(round(xs)), :3].mean(axis=1)
    alpha = pa[:, int(round(xs)), 3]
    while y > 0 and not (alpha[y] > 200 and lum[y] < 110 and lum[max(0, y - 3)] < 110):
        y -= 1
    lower = (Y >= y) & (X >= xs)
    upper = (Y < y) & ((X - xs) + 2 * (Y - y) >= 0)
    return lower | upper


STRETCH = 1.3
# the door bands on the side views (car_horiz_*, 407 px), by the matching car: the cab at the right
# (cabR / a falling cabNear), the middle car, the cab at the left (cabL / cabFar)
SIDE_DOORS = {
    'cabR': [(56, 93), (175, 215), (296, 333)],
    'mid': [(56, 93), (175, 223), (306, 344)],
    'cabL': [(64, 100), (185, 223), (306, 344)],
}
# the underframe kept as it is before and after these (the two bogies), of the side's length
BOGIE_KEEP = (0.30, 0.65)
SIDE_OF = {'horiz_cabR': 'cabR', 'horiz_mid': 'mid', 'horiz_cabL': 'cabL',
           'fall_cabNear': 'cabR', 'fall_mid': 'mid', 'fall_cabFar': 'cabL'}


def red_extent(a, axis=0):
    red = (a[..., 3] > 200) & (a[..., 0] > 150) & (a[..., 1] < 90) & (a[..., 2] < 90)
    idx = np.nonzero(red.any(axis))[0]
    return idx.min(), idx.max()


def door_fractions(side_img, side):
    x0, x1 = red_extent(np.asarray(side_img))
    return [((d0 - x0) / (x1 - x0), (d1 - x0) / (x1 - x0)) for d0, d1 in SIDE_DOORS[side]]


def relayout(a, fracs):
    """The car's columns rebuilt: all before the first door and after the last kept, five doors (the
    two put in copies of the first, which has no splice in it), four window bays narrowed so the
    whole is STRETCH times as long."""
    x0, x1 = red_extent(a)
    L = x1 - x0
    d = [(int(round(x0 + f0 * L)), int(round(x0 + f1 * L))) for f0, f1 in fracs]
    head, tail = a[:, :d[0][0]], a[:, d[2][1]:]
    door, last = a[:, d[0][0]:d[0][1]], a[:, d[2][0]:d[2][1]]
    win = a[:, d[0][1]:d[1][0]]
    target = int(round(a.shape[1] * STRETCH))
    wn = max(8, (target - head.shape[1] - tail.shape[1] - 4 * door.shape[1] - last.shape[1]) // 4)
    winn = np.asarray(Image.fromarray(win).resize((wn, a.shape[0]), Image.LANCZOS))
    parts = [head, door, winn, door, winn, door, winn, door, winn, last, tail]
    body = np.concatenate(parts, 1)
    # the underframe (below the silver side) not with them: two bogies, one at each end, kept, the
    # equipment between them drawn out (Norton, 2026-11-06: 底面全部都有問題 - a bogie came with
    # every bay)
    lum = a[..., :3].astype(np.float32).mean(axis=2)
    silver = (a[..., 3] > 200) & (lum > 150)
    lows = [np.nonzero(silver[:, x])[0].max() for x in range(x0 + L // 10, x1 - L // 10) if silver[:, x].any()]
    cut = int(np.median(lows)) + 1
    ua, ub = int(round(x0 + BOGIE_KEEP[0] * L)), int(round(x0 + BOGIE_KEEP[1] * L))
    mid_w = body.shape[1] - ua - (a.shape[1] - ub)
    under_mid = np.asarray(Image.fromarray(np.ascontiguousarray(a[cut:, ua:ub])).resize((max(1, mid_w), a.shape[0] - cut), Image.LANCZOS))
    under = np.concatenate([a[cut:, :ua], under_mid, a[cut:, ub:]], 1)
    body = body.copy()
    body[cut:] = 0
    body[cut:, :under.shape[1]] = under[:, :body.shape[1]]
    return body


def lengthen(img, kind, fracs):
    if kind == 'fall':
        # laid level (the side's columns upright), relaid, sheared back
        k = 0.5
        w, h = img.size
        pad = int(k * w) + 2
        level = img.transform((w, h + pad), Image.AFFINE, (1, 0, 0, k, 1, -pad), resample=Image.BICUBIC)
        b = Image.fromarray(relayout(np.asarray(level), fracs))
        extra = int(k * b.size[0]) + 2
        tall = Image.new('RGBA', (b.size[0], b.size[1] + extra), (0, 0, 0, 0))
        tall.paste(b, (0, 0))
        out = tall.transform(tall.size, Image.AFFINE, (1, 0, 0, -k, 1, 0), resample=Image.BICUBIC)
    else:
        out = Image.fromarray(relayout(np.asarray(img), fracs))
    out = crop_alpha(out)
    return out.resize((max(1, round(out.size[0] / STRETCH)), max(1, round(out.size[1] / STRETCH))), Image.LANCZOS)


def shrink_end_on(img, length_down):
    """An end-on car 1 / STRETCH the size, its roof's middle band drawn out so it is as long again."""
    small = img.resize((max(1, round(img.size[0] / STRETCH)), max(1, round(img.size[1] / STRETCH))), Image.LANCZOS)
    add = int(round(length_down * (1 - 1 / STRETCH)))
    a = np.asarray(small)
    h = a.shape[0]
    b0, b1 = int(h * 0.35), int(h * 0.6)        # (the roof, between the two end faces)
    band = np.asarray(Image.fromarray(a[b0:b1]).resize((a.shape[1], b1 - b0 + add), Image.LANCZOS))
    return Image.fromarray(np.concatenate([a[:b0], band, a[b1:]], 0))


# On a slope (Norton, 2026-11-06: a level car on a ramp steps, one end in the track): the diagonal
# views sheared upright about the car's middle - its right end up (`_up`) or down (`_dn`) by the grade
# - for a ramp's (three levels over five tiles) and a hillside's (a level a tile).
GRADES = {'1': 3 * 13 * 0.512 / 100.0, '2': 13 * 0.512 / 20.0}
Z_PX = 10.0                       # px a metre up, on a 512-px tile


def sheared(car, grade, sign):
    """The car with its right end raised (sign 1) or lowered (-1) by `grade` metres a metre."""
    k = sign * grade * Z_PX / (PX_M_AXIS * 2 / np.sqrt(5))     # px up a px across the screen
    im = car['img']
    w, h = im.size
    pad = int(np.ceil(abs(k) * w)) + 2
    # output (x, y) takes input (x, y - pad + k (x - ax)): the right end up for k > 0
    out = im.transform((w, h + 2 * pad), Image.AFFINE, (1, 0, 0, k, 1, -pad - k * car['ax']), resample=Image.BICUBIC)
    a = np.asarray(out)
    ys, xs = np.nonzero(a[..., 3] > 0)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return {'img': out.crop(box), 'kind': car['kind'], 'ax': car['ax'] - box[0], 'ay': car['ay'] + pad - box[1]}


# Through a crossover (Norton, 2026-11-07: 割過鉸剪位既時候列車稍微傾斜): a car turns a few degrees off
# the line (4.5 m across over the crossover's 40 m; an island's tracks spread 4.8 m in a tile) - each
# straight diagonal view turned YAW_DEG either way: its side's slope and length on screen as a car
# turned that much (a ground line's (cos -/+ sin, cos +/- sin) across the 2:1 grid), upright lines
# kept upright (sheared, about the car's middle). `_ys` steeper and shorter, `_yf` flatter and longer.
YAW_DEG = 8.0


def yawed(car, steep):
    t = np.radians(YAW_DEG)
    c, s = np.cos(t), np.sin(t)
    s0 = 0.5 if car['kind'] == 'fall' else -0.5           # the side's slope as drawn (rise: mirrored)
    if steep:
        sx, s1 = c - s, np.sign(s0) * 0.5 * (c + s) / (c - s)
    else:
        sx, s1 = c + s, np.sign(s0) * 0.5 * (c - s) / (c + s)
    k = s1 - s0 / sx                                      # y px more a px across, after the stretch
    im = car['img']
    w, h = im.size
    W = int(np.ceil(w * sx)) + 4
    pad = int(np.ceil(abs(k) * W)) + 2
    axo, ayo = car['ax'] * sx + 2, car['ay'] + pad
    # output (x, y) takes input (ax + (x - axo) / sx, y - pad - k (x - axo))
    out = im.transform((W, h + 2 * pad), Image.AFFINE,
                       (1 / sx, 0, car['ax'] - axo / sx, -k, 1, -pad + k * axo), resample=Image.BICUBIC)
    a = np.asarray(out)
    ys, xs = np.nonzero(a[..., 3] > 0)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return {'img': out.crop(box), 'kind': car['kind'], 'ax': axo - box[0], 'ay': ayo - box[1]}


# Two liveries (Norton, 2026-11-06, from photos): M (the urban lines' M-Train: bare stainless sides,
# a broad red band across a white cab front) and K (the 東鐵 黃頭: a yellow cab front, the red stripe
# along the sides). The renders have both a stripe along the side and a thin one across the cab; each
# livery is made from them. The cab's nose, as a share of each picture (x0, x1, y0, y1).
NOSE = {
    'horiz_cabR': (0.94, 1.0, 0.0, 1.0), 'horiz_cabL': (0.0, 0.06, 0.0, 1.0),
    'fall_cabNear': (0.853, 1.0, 0.0, 1.0), 'fall_cabFar': (0.0, 0.04, 0.0, 1.0),
    'vert_cabNear': (0.0, 1.0, 0.77, 1.0), 'vert_cabFar': (0.0, 1.0, 0.0, 0.04),
}
YELLOW = np.array([238, 196, 40], np.float32)


def nose_mask(shape, name):
    m = np.zeros(shape[:2], bool)
    if name in NOSE:
        x0, x1, y0, y1 = NOSE[name]
        h, w = shape[:2]
        m[int(y0 * h):int(np.ceil(y1 * h)), int(x0 * w):int(np.ceil(x1 * w))] = True
    return m


def red_of(a):
    return (a[..., 3] > 100) & (a[..., 0] > 150) & (a[..., 1] < 110) & (a[..., 2] < 110) & (a[..., 0] - a[..., 1] > 70)


# The windscreen's middle pane (Norton, 2026-11-06, from photos: the M-Train's cab is white between
# its two windows - the emergency door - the 黃頭's black, a yellow pillar each side of it): found on
# the cab fronts that face the viewer (windscreen()), between its two mullions - as shares of its width.
PANE_SHARE = (0.315, 0.72)
PANE_VIEWS = ('fall_cabNear', 'vert_cabNear')


def windscreen(a, name):
    """The cab's windscreen on a front facing the viewer: the largest run of dark glass in its nose,
    above the red line across it (4-connected). A bool mask, empty if none."""
    out = np.zeros(a.shape[:2], bool)
    if name not in NOSE:
        return out
    nose = nose_mask(a.shape, name)
    lum = a[..., :3].astype(np.float32).mean(2)
    red = red_of(a) & nose
    dark = nose & (a[..., 3] > 200) & (lum < 75)
    for x in range(a.shape[1]):
        ry = np.nonzero(red[:, x])[0]
        if len(ry):
            dark[ry.min():, x] = False
        else:
            dark[:, x] = False
    seen = np.zeros_like(dark)
    best = []
    for y0, x0 in zip(*np.nonzero(dark)):
        if seen[y0, x0]:
            continue
        stack, comp = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < dark.shape[0] and 0 <= xx < dark.shape[1] and dark[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stack.append((yy, xx))
        if len(comp) > len(best):
            best = comp
    for y, x in best:
        out[y, x] = True
    return out


PANE_GROW = 2      # px the M-Train's white is carried up and down over the windscreen's frame


def pane_geometry(a, name):
    """The middle pane's columns (pa, pb) and the windscreen's top and bottom edge at any column, lines
    fitted along the two side windows (no destination sign over them), so the pane follows the glass's
    slant. None where there is no windscreen."""
    if name not in PANE_VIEWS:
        return None
    ws = windscreen(a, name)
    if not ws.any():
        return None
    ys, xs = np.nonzero(ws)
    x0, x1 = xs.min(), xs.max()
    pa, pb = int(round(x0 + PANE_SHARE[0] * (x1 - x0))), int(round(x0 + PANE_SHARE[1] * (x1 - x0)))
    cols, tops, bots = [], [], []
    for x in list(range(x0 + 1, pa - 1)) + list(range(pb + 2, x1)):
        col = np.nonzero(ws[:, x])[0]
        if len(col):
            cols.append(x); tops.append(col.min()); bots.append(col.max())
    if len(cols) < 4:
        return None
    kt, ct = np.polyfit(cols, tops, 1)
    kb, cb = np.polyfit(cols, bots, 1)
    return pa, pb, (lambda x: kt * x + ct), (lambda x: kb * x + cb)


def centre_pane(a, name, grow=0):
    """The middle pane, between its top and bottom edges (carried `grow` px up and down)."""
    m = np.zeros(a.shape[:2], bool)
    g = pane_geometry(a, name)
    if not g:
        return m
    pa, pb, top, bot = g
    for x in range(pa, pb + 1):
        m[max(0, int(round(top(x))) - grow):int(round(bot(x))) + 1 + grow, x] = True
    return m


def livery_m(img, name):
    """No stripe along the sides (each red pixel the silver above and below it); across the cab's
    nose the thin red line made a broad band, up over the white."""
    a = np.asarray(img).copy()
    nose = nose_mask(a.shape, name)
    red = red_of(a)
    side = np.asarray(Image.fromarray((red & ~nose).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
    side &= (a[..., 3] > 100) & ~nose
    h = a.shape[0]
    for x in np.nonzero(side.any(0))[0]:
        col = side[:, x]
        y = 0
        while y < h:
            if not col[y]:
                y += 1
                continue
            y0 = y
            while y < h and col[y]:
                y += 1
            up, dn = max(0, y0 - 1), min(h - 1, y)
            for yy in range(y0, y):
                t = (yy - up) / max(1, dn - up)
                a[yy, x, :3] = (a[up, x, :3] * (1 - t) + a[dn, x, :3] * t).astype(np.uint8)
    lum = a[..., :3].astype(np.float32).mean(2)
    light = (a[..., 3] > 100) & (lum > 125)
    # the middle pane white, as the cab's front (a shade under it, the door's edge drawn round)
    # the front white rather than silver
    lum0 = a[..., :3].astype(np.float32).mean(2)
    sat0 = a[..., :3].max(2).astype(np.int32) - a[..., :3].min(2)
    whiten = nose & (a[..., 3] > 100) & (lum0 > 140) & (sat0 < 30)
    a[whiten, :3] = np.clip(a[whiten, :3].astype(np.float32) * 1.07 + 6, 0, 255).astype(np.uint8)
    # the middle pane the front's own white (its colour beside the windscreen), over the frame above
    # and below it so it is one with the cab, the glass's light and shade kept faintly, a door seam
    # down each side (Norton: a flat white block looked stuck on)
    pane = centre_pane(a, name, grow=PANE_GROW)
    if pane.any():
        ys, xs = np.nonzero(pane)
        front = a[whiten][:, :3].astype(np.float32)
        base = np.median(front, axis=0) * 0.96 if len(front) else np.array([205, 205, 200], np.float32)
        glass = lum0[pane]
        shade = 1 + 0.10 * (glass - glass.mean()) / max(1.0, glass.std()) * 0.35
        shade *= 1 - 0.07 * (ys - ys.min()) / max(1, ys.max() - ys.min())
        a[pane, :3] = np.clip(base[None, :] * shade[:, None], 0, 255).astype(np.uint8)
        for y in np.unique(ys):
            row = xs[ys == y]
            for x in (row.min(), row.max()):
                a[y, x, :3] = (a[y, x, :3].astype(np.float32) * 0.72).astype(np.uint8)
    nred = red_of(a) & nose
    for x in np.nonzero(nred.any(0))[0]:
        ys = np.nonzero(nred[:, x])[0]
        top = max(0, ys.min() - 2 * (ys.max() - ys.min() + 1))
        band = np.arange(top, ys.min())
        band = band[light[band, x]]
        a[band, x, :3] = (np.array([206, 32, 38], np.float32) * (lum[band, x] / 215.0)[:, None]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(a)


def livery_k(img, name):
    """The cab's nose yellow (its light panels; glass, lamps and the red line kept), the stripe along
    the sides as it is."""
    a = np.asarray(img).astype(np.float32).copy()
    lum = a[..., :3].mean(2)
    sat = a[..., :3].max(2) - a[..., :3].min(2)
    m = nose_mask(a.shape, name) & (a[..., 3] > 100) & (lum > 120) & (sat < 40)
    a[m, :3] = YELLOW * (lum[m] / 210.0)[:, None]
    # the middle pane black: the two windows and it one black band across the cab
    pane = centre_pane(np.asarray(img), name)
    a[pane, :3] = np.clip(a[pane, :3] * 0.45, 0, 255)
    # a yellow pillar each side of it, between it and the two windows, the glass's height there
    g = pane_geometry(np.asarray(img), name)
    if g:
        pa, pb, top, bot = g
        for x in (pa - 1, pa, pb, pb + 1):
            a[int(round(top(x))):int(round(bot(x))) + 1, x, :3] = YELLOW * 0.82
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


# Night (Norton, 2026-11-06: 車廂燈光): each picture's light - its windows, the saloon lit behind them,
# warm white where the glass is, nothing else - drawn over the car at night (ADD, by the lamps'
# strength) as the buses' deck tubes are. The windows: in each column, between the side's top and
# bottom silver, the glass and the seats behind it (not the door seams: a thin line is opened away;
# not the 黃頭's black middle pane: darker than any glass).
LIT_RGB = np.array([255, 236, 196], np.float32)


def drop_roof_shade(win, rgb, al):
    """Not the roof (Norton, 2026-11-07: 車頭多左一塊夜光): at the far cab end the roof's shaded
    slope is as dark as glass. A window sits in the side's middle (0.38-0.60 of the car's height in
    its column) and shows the seats' warm tone; that slope sits high (~0.22) and is cool grey - a
    patch both high and no warmer than blue is dropped."""
    solid = al > 200
    h, w = win.shape
    has = solid.any(0)
    top = np.where(has, solid.argmax(0), 0)
    bot = np.where(has, h - 1 - solid[::-1].argmax(0), 0)
    span = np.maximum(1, bot - top)
    seen = np.zeros_like(win)
    out = win.copy()
    for y0, x0 in zip(*np.nonzero(win)):
        if seen[y0, x0]:
            continue
        stack, comp = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and win[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stack.append((yy, xx))
        ys, xs = np.array(comp).T
        rel = float(np.mean((ys - top[xs]) / span[xs]))
        c = rgb[ys, xs].mean(0)
        if rel < 0.30 and c[2] >= c[0]:
            out[ys, xs] = False
    return out


def side_only(win, al, name):
    """The roof is never lit (Norton, 2026-11-07: 車頂是不用配燈的). Seen end-on (vert) the car is
    mostly roof: its sides' windows show only as a strip down each edge, each 16% of the car's width
    in its row - only there, and the cab's windscreen on a front that faces the viewer (cabNear's
    last 14%)."""
    if name.replace('k_', '', 1).split('_')[0] != 'vert':
        return win
    solid = al > 200
    h, w = win.shape
    out = np.zeros_like(win)
    for y in range(h):
        xs = np.nonzero(solid[y])[0]
        if not len(xs):
            continue
        l, r = xs.min(), xs.max()
        band = max(2, int(round(0.16 * (r - l + 1))))
        out[y, l:l + band] = win[y, l:l + band]
        out[y, r - band + 1:r + 1] = win[y, r - band + 1:r + 1]
    if 'cabNear' in name:
        y0 = int(h * 0.86)
        out[y0:] = win[y0:]
    return out


def lit_of(img, name=''):
    a = np.asarray(img).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    lum = rgb.mean(2)
    sat = rgb.max(2) - rgb.min(2)
    silver = (al > 200) & (lum > 140) & (sat < 35)
    win = np.zeros(al.shape, bool)
    for x in np.nonzero(silver.any(0))[0]:
        ys = np.nonzero(silver[:, x])[0]
        y0, y1 = ys.min(), ys.max()
        y0 += int(0.18 * (y1 - y0))            # (not the roof's vents along the side's top)
        col = slice(y0, y1 + 1)
        r, g, b = rgb[col, x, 0], rgb[col, x, 1], rgb[col, x, 2]
        seats = (r - b > 25) & (g > 90) & (r - g < 60) & (lum[col, x] < 175)   # (beige, not the red stripe)
        win[col, x] = (al[col, x] > 200) & (lum[col, x] > 30) & ((lum[col, x] < 120) & (r - g < 40) | seats)
    win = drop_roof_shade(win, rgb, al)
    win = side_only(win, al, name)
    m = Image.fromarray(win.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    m = np.asarray(m.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255.0
    out = np.zeros(a.shape, np.float32)
    # (the seats' own colour shows warm through it)
    out[..., :3] = LIT_RGB * 0.75 + rgb * 0.25
    out[..., 3] = np.clip(m * (al / 255.0), 0, 1) * 235
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


# The cab's lamps (Norton, 2026-11-06: 車頭燈 as the buses'): where a picture shows them, the warm
# bright spots on the front (lit: a headlamp glow over them on the leading car, a tail lamp's on the
# trailing one). Up to two, each its middle in the picture's px.
def lamps_of(img):
    a = np.asarray(img).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    lum = rgb.mean(2)
    m = (al > 200) & (lum > 200) & (rgb[..., 0] - rgb[..., 2] > 35) & (rgb[..., 1] > 180)
    seen = np.zeros_like(m)
    blobs = []
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]:
            continue
        stack, comp = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stack.append((yy, xx))
        if len(comp) >= 2:
            ys, xs = zip(*comp)
            blobs.append((len(comp), float(np.mean(xs)), float(np.mean(ys))))
    blobs.sort(reverse=True)
    return [[round(x, 1), round(y, 1)] for _, x, y in blobs[:2]]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cars, side_body, length_down = load_cars()
    cars['fall_mid'] = splice(cars, 'fall_cabNear', 'fall_cabFar', fall_near)
    cars['horiz_mid'] = splice(cars, 'horiz_cabR', 'horiz_cabL', lambda X, Y, o, pa: X >= o[0])
    cars['vert_mid'] = splice(cars, 'vert_cabNear', 'vert_cabFar', lambda X, Y, o, pa: Y >= o[1] - side_body * 0.6)
    # five doors a side, 1 / STRETCH the size (the side views measured before they change)
    fracs = {name: door_fractions(cars['horiz_' + side]['img'], side) for name, side in SIDE_OF.items()}
    for name, car in cars.items():
        if car['kind'] in ('fall', 'horiz'):
            car['img'] = lengthen(car['img'], car['kind'], fracs[name])
        elif car['kind'] == 'vert':
            car['img'] = shrink_end_on(car['img'], length_down)
        car['ax'] = car['img'].size[0] / 2
        car['ay'] = anchor_y(car['img'], car['kind'], WIDTH_M / STRETCH)
    # the liveries: M as the pictures' own names, K as k_<name>
    for name in list(cars):
        car = cars[name]
        cars['k_' + name] = {**car, 'img': livery_k(car['img'], name)}
        car['img'] = livery_m(car['img'], name)
    for pre in ('', 'k_'):
        for k in ['cabNear', 'cabFar', 'mid']:
            c = cars[pre + 'fall_' + k]
            cars[pre + 'rise_' + k] = {'img': c['img'].transpose(Image.FLIP_LEFT_RIGHT), 'kind': 'rise', 'ax': c['img'].size[0] - c['ax'], 'ay': c['ay']}
    for name in [n for n in cars if n.replace('k_', '', 1).split('_')[0] in ('fall', 'rise')]:
        for g, grade in GRADES.items():
            cars[f'{name}_up{g}'] = sheared(cars[name], grade, 1)
            cars[f'{name}_dn{g}'] = sheared(cars[name], grade, -1)
        cars[f'{name}_ys'] = yawed(cars[name], True)
        cars[f'{name}_yf'] = yawed(cars[name], False)
    art = {}
    for name in sorted(cars):
        c = cars[name]
        path = f'Models/metroTrain/car_{name}.png'
        c['img'].save(ROOT / path)
        lit_path = f'Models/metroTrain/car_{name}_lit.png'
        lit_of(c['img'], name).save(ROOT / lit_path)
        art[name] = {'path': path, 'key': f'metro_car_{name}', 'anchor': [round(float(c['ax']), 1), round(float(c['ay']), 1)],
                     'lit': {'path': lit_path, 'key': f'metro_car_{name}_lit'}}
        if 'cab' in name and 'cabFar' not in name:   # (a cab facing away shows no lamps)
            lamps = lamps_of(c['img'])
            if lamps:
                art[name]['lamps'] = lamps
        print(name, c['img'].size, art[name]['anchor'])
    ART_JS.write_text(
        '// Generated by scripts/prepare-metro-train-assets.py - the 地鐵 train cars: each picture and the\n'
        '// pixel where the car\'s middle sits on the rails (a 512-px tile\'s scale; draw at TILE_WIDTH / 512).\n'
        f'const METRO_TRAIN_ART = Object.freeze({json.dumps(art, indent=2, ensure_ascii=False)});\n\n'
        "if (typeof module !== 'undefined' && module.exports) module.exports = { METRO_TRAIN_ART };\n",
        encoding='utf-8')
    print('wrote', ART_JS.relative_to(ROOT))


if __name__ == '__main__':
    main()
