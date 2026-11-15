"""SUPERSEDED (2026-11-15) by scripts/prepare-light-rail-assets.py, made from Norton's 8Dir atlas instead -
kept for reference only. It writes to scripts/source-art/lightRail/squared/v1/ and never touches the game's
files.

輕鐵 (九廣鐵路輕便鐵路第一期, Comeng LRV, 1988): game pictures from Norton's first 8-way sprite sheet
(scripts/source-art/lightRail/original/lightRail.png, kept as it is).

The sheet's eight renders are not one set: each is drawn from its own camera, and three of its eight
"directions" are one view again. Norton (2026-11-15): 唔符合既圖唔要，用符合既圖鏡像反轉，等整套模型比例
符合要求. So only the renders nearest the game's 2:1 view are kept, and the other way along each axis
is a kept one mirrored - each pair is then one car, the same size and shape both ways:

  rise_front  sheet cell 6 ("S")   the cab end with the 元朗 615 board toward the viewer, at the lower left
  rise_rear   sheet cell 2 ("N")   the back end (tail lamps) toward the viewer, at the lower left
  fall_front  cell 6 mirrored      lower right
  fall_rear   cell 2 mirrored      lower right
  horiz_left  sheet cell 7 ("SW")  side on, heading left (its back end to the right)
  horiz_right cell 7 mirrored

Dropped: cells 1 and 4 (cells 2 and 6 again, from a camera further off the game's), 8 (a rear view
the other way - 2 mirrored replaces it so both rear views match), 3 (its long side at 13 degrees,
neither diagonal nor side on) and 5 (meant end on, drawn three-quarter: the car turned 70 degrees).
There is no end-on (vert) view: 45-degree track as the metro's would need two more renders.

Lettering on a mirrored picture reads backwards; the 元朗 615 board, the 1013 fleet number and the
KCR plates are put back the right way round - each taken from the unmirrored picture, sheared to the
mirrored face's slope (an upright face's lines only change slope) and laid over its place.

Squaring (as the 電車's, scripts/prepare-tram-assets.py, Norton-approved): the renders' camera is lower
than the game's (25-30 degrees up against 30), so a column's upright parts and its roof are scaled
apart - the wall (below the roof's near edge) by cos 30 / cos e, the roof (between its near and far
edges) as a level surface, so its edges run at 0.5; the pantograph and roof boxes above the roof's
far edge stand upright again. Nothing moves across. The slopes are the orange stripes' (side) and the
cab end's lines; the roof's near edge is the bright cant-rail highlight just above the top stripe.

The side view (cell 7) is levelled (its stripes run at 0.078), then sized from the squared front
view: its length the side's ground span (a world diagonal across the screen is sqrt 2 times a map
axis's x span), its wall the same height, its roof as deep as the car's width seen down the screen.

Size: a car's footprint across the screen as the game's vehicles are drawn - a 12 m bus is 48 px
(TILE_WIDTH 100), the tram 80% of it by the same length + width rule; the LRV is 20.2 x 2.65 m.

Writes the squared pictures to scripts/source-art/lightRail/squared/ (gitignored; with *_check.png
overlays), the game's textures to Models/lightRail/ (power-of-two canvases, an 8-px clear margin,
colour carried out under clear pixels, at the squared pictures' own resolution - the renders are
small) and light-rail-art.js (each view's anchor - the footprint's middle on the ground - its lamps
and the scale for TILE_WIDTH 100). Not used by the game yet.
Run: .venv/bin/python -B scripts/prepare-light-rail-assets-v1.py
"""
import importlib.util
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / 'scripts/source-art/lightRail/original/lightRail.png'
OUT = ROOT / 'scripts/source-art/lightRail/squared/v1'
GAME = OUT / 'game'
ART_JS = OUT / 'light-rail-art.js'
GUTTER = 8

_spec = importlib.util.spec_from_file_location('tram_assets', ROOT / 'scripts/prepare-tram-assets.py')
tram = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tram)
best_slope = tram.best_slope

# Each render's box on the sheet (above its direction label).
CELLS = {
    1: (0, 92, 375, 397), 2: (375, 92, 750, 397), 3: (750, 92, 1170, 397), 4: (1170, 92, 1536, 397),
    5: (0, 452, 330, 759), 6: (330, 452, 745, 759), 7: (745, 452, 1165, 759), 8: (1165, 452, 1536, 759),
}
# What each render shows, and the columns (share of its width) its long side and its end are measured
# in: (side columns, side slope range, end columns, end slope range).
SURVEY = {
    1: ('rear near, lower left', (0.35, 0.95), (-0.75, -0.2), (0.02, 0.14), (0.1, 0.7)),
    2: ('rear near, lower left', (0.35, 0.95), (-0.75, -0.2), (0.02, 0.14), (0.1, 0.7)),
    3: ('rear near, side at 13 deg', (0.30, 0.95), (-0.5, -0.05), (0.02, 0.12), (0.1, 0.9)),
    4: ('front near, lower left', (0.35, 0.95), (-0.75, -0.2), (0.02, 0.14), (0.1, 0.7)),
    5: ('front near, turned 70 deg', (0.75, 0.98), (-3.0, -0.8), (0.05, 0.6), (-0.3, 0.3)),
    6: ('front near, lower left', (0.35, 0.95), (-0.75, -0.2), (0.02, 0.14), (0.1, 0.7)),
    7: ('side on, rear end right', (0.08, 0.85), (-0.15, 0.15), None, None),
    8: ('rear near, lower right', (0.05, 0.65), (0.2, 0.75), (0.86, 0.98), (-0.7, -0.1)),
}
KEEP = {'front': 6, 'rear': 2, 'side': 7}
# The near vertical corner (side meets cab end), read off the renders (cell px).
CORNER_X = {6: 64, 2: 68}
SIDE_CORNER_X = 327     # cell 7: where the side meets the back end showing past it
# The roof's near edge: the cant rail's highlight, this far above the top orange stripe's top edge.
CANT_RAIL_PX = 18
# The lamps, read off the renders (cell px): the front's two headlamps, the back's two red tail lamps.
LAMPS = {
    6: {'heads': [(11, 223), (44.5, 235)]},
    2: {'tails': [(11, 164), (49, 177.5)]},
    7: {'tails': [(332.5, 115), (352.5, 95)]},
}
# Lettering to put back the right way round on the mirrored pictures (cell px): the search box, which
# pixels are the letters, and the slope of the face they are on.
LETTERING = {
    6: [dict(box=(8, 132, 64, 172), ink='yellow', slope=0.384, margin=1),     # 元朗 615 board
        dict(box=(15, 214, 42, 238), ink='white', slope=0.40, margin=2),      # 1013
        dict(box=(131, 176, 174, 206), ink='logo', slope=-0.44, margin=2)],   # R KCR plate
    2: [dict(box=(137, 175, 178, 208), ink='logo', slope=-0.56, margin=2)],
    7: [dict(box=(128, 160, 180, 181), ink='logo', slope=0.078, margin=2)],
}
LRV_M = (20.2, 2.65)
BUS_SCREEN_PX, BUS_M = 48.0, (12.0, 2.5)
LRV_SCREEN_PX = BUS_SCREEN_PX * sum(LRV_M) / sum(BUS_M)


# ── cutting out ─────────────────────────────────────────────────────────────────────────────────────
def cut(k, thr=6):
    """A render off the black sheet: the black reached from the box's edge is the background (the
    renders' own black outline and shadows are kept)."""
    x0, y0, x1, y1 = CELLS[k]
    a = np.asarray(Image.open(SHEET).convert('RGB'))[y0:y1, x0:x1]
    h, w = a.shape[:2]
    dark = a.max(2) <= thr
    bg = np.zeros((h, w), bool)
    q = deque((y, x) for y in range(h) for x in (0, w - 1) if dark[y, x])
    q.extend((y, x) for x in range(w) for y in (0, h - 1) if dark[y, x])
    for y, x in q:
        bg[y, x] = True
    while q:
        y, x = q.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and dark[yy, xx] and not bg[yy, xx]:
                bg[yy, xx] = True
                q.append((yy, xx))
    img = Image.fromarray(np.dstack([a, np.where(bg, 0, 255).astype(np.uint8)]), 'RGBA')
    return img.crop(img.getbbox())


def orange(a):
    r, g, b = (a[..., i].astype(int) for i in range(3))
    return (a[..., 3] > 0) & (r > 190) & (g > 60) & (g < 160) & (b < 90)


def stripe_edges(a, top_only=False):
    o = orange(a)
    up = np.zeros_like(o); up[1:] = o[1:] & ~o[:-1]
    if top_only:
        return up
    dn = np.zeros_like(o); dn[:-1] = o[:-1] & ~o[1:]
    return up | dn


def survey():
    """Every render's side and end slopes, and the camera they imply (up from level; the long axis
    turned from the screen's x)."""
    rows = {}
    for k, (what, sc, sr, ec, er) in SURVEY.items():
        a = np.asarray(cut(k))
        ys, xs = np.nonzero(stripe_edges(a))
        ys, xs = ys.astype(float), xs.astype(float)
        w = a.shape[1]
        ms = (xs >= sc[0] * w) & (xs < sc[1] * w)
        s_side = best_slope(ys[ms], xs[ms], *sr)
        line = f'cell {k} ({what}): side {s_side:+.3f}'
        s_end = None
        if ec:
            me = (xs >= ec[0] * w) & (xs < ec[1] * w)
            s_end = best_slope(ys[me], xs[me], *er)
            sin_e = np.sqrt(abs(s_side * s_end))
            turn = np.degrees(np.arctan(abs(s_side) / sin_e)) if abs(s_side) < 0.9 else 90 - np.degrees(np.arctan(sin_e / abs(s_side)))
            line += f' end {s_end:+.3f}  camera {np.degrees(np.arcsin(sin_e)):.1f} deg up, long axis {turn:.0f} deg (game 30, 45)'
        rows[k] = (s_side, s_end)
        print(line, '  kept' if k in KEEP.values() else '  dropped')
    return rows


# ── lettering on mirrored pictures ──────────────────────────────────────────────────────────────────
def ink_mask(a, kind):
    r, g, b = (a[..., i].astype(int) for i in range(3))
    lum = (r + g + b) / 3
    if kind == 'yellow':
        return (r > 160) & (g > 130) & (b < 120) & (r - b > 60)
    if kind == 'white':
        return (lum > 195) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 60)
    # the KCR plate: the red R and the navy letters
    return ((r > 130) & (g < 75) & (b < 110)) | ((b > r + 15) & (lum < 140) & (b > 60))


def unmirror_lettering(mirrored, original, items):
    """Each item's letters, taken from the unmirrored picture the right way round and sheared to the
    mirrored face's slope, laid over their mirrored place."""
    src = np.asarray(original).astype(np.float32)
    out = np.asarray(mirrored).astype(np.float32).copy()
    h, w = src.shape[:2]
    for it in items:
        x0, y0, x1, y1 = it['box']
        s, mg = it['slope'], it['margin']
        ink = np.zeros((h, w), bool)
        ink[y0:y1, x0:x1] = ink_mask(src[y0:y1, x0:x1], it['ink'])
        ys, xs = np.nonzero(ink)
        a, b = xs.min() - mg, xs.max() + mg
        v = ys - s * (xs - a)                       # height up the face
        T, H = v.min() - mg, v.max() - v.min() + 2 * mg
        # (the parallelogram on the mirrored picture: the original's, mirrored)
        a2 = w - 1 - b
        for xd in range(int(a2), int(a2 + (b - a)) + 1):
            du = xd - a2
            top_d = T + s * (b - a) - s * du         # the mirrored face's slope is -s
            xs_ = a + du
            for yd in range(int(np.ceil(top_d)), int(np.floor(top_d + H)) + 1):
                ysrc = yd + 2 * s * du - s * (b - a)
                y_lo = int(np.floor(ysrc)); f = ysrc - y_lo
                if 0 <= y_lo < h - 1 and 0 <= xs_ < w and 0 <= yd < h:
                    out[yd, xd] = (1 - f) * src[y_lo, int(xs_)] + f * src[y_lo + 1, int(xs_)]
    return Image.fromarray(out.clip(0, 255).round().astype(np.uint8), 'RGBA')


def mirror(img, k):
    flipped = img.transpose(Image.FLIP_LEFT_RIGHT)
    return unmirror_lettering(flipped, img, LETTERING.get(k, []))


# ── squaring the diagonal views ─────────────────────────────────────────────────────────────────────
def roof_geometry(a, s_side, s_end, xc):
    """For a rise view (the near end at the lower left): the roof's near edge (side and end, meeting
    over the corner xc) and its far edges. The near edge is the cant rail over the top stripe; the
    roof's depth is read off its outline over the side (the columns with nothing standing on the
    roof), and gives the end's width - a rounded end is wider lower down than its roof."""
    ys, xs = np.nonzero(stripe_edges(a, top_only=True))
    w = a.shape[1]
    m = (xs > xc + 25) & (xs < w - 15)
    c = ys[m] - s_side * xs[m]
    hist = np.bincount(np.round(c - c.min()).astype(int))
    # (the top stripe: the least intercept with a good share of edge pixels - perspective spreads it)
    c_top = c.min() + int(np.nonzero(hist >= 0.3 * hist.max())[0][0])
    c_side = c_top - CANT_RAIL_PX
    yc = c_side + s_side * xc
    al = np.asarray(a)[..., 3] > 100
    x1 = float(np.nonzero(al.any(0))[0].max())         # the far end
    cols = np.arange(int(xc) + 5, int(xc + 0.6 * (x1 - xc)))
    depth = np.array([yc + s_side * (x - xc) - np.argmax(al[:, x]) for x in cols])
    lo = np.percentile(depth, 10)
    D = float(depth[(depth >= lo) & (depth <= lo + 10)].mean())
    x0 = xc - D / (s_end - s_side)                      # the cab end's far roof corner
    return dict(s_side=s_side, s_end=s_end, xc=float(xc), yc=float(yc), x0=float(x0), x1=x1, depth=D)


def edges_of(g, s_side, s_end, xs):
    """The roof's near edge and far edge over each column, for slopes (s_side, s_end) about g's corner."""
    xc, yc, x0, x1 = g['xc'], g['yc'], g['x0'], g['x1']
    near = np.where(xs >= xc, yc + s_side * (xs - xc), yc + s_end * (xs - xc))
    ry = yc + s_end * (x0 - xc)                         # the cab end's far roof corner
    qy = yc + s_side * (x1 - xc)                        # the far end's near roof corner
    tx = x0 + (x1 - xc)                                 # the roof's far corner
    far = np.where(xs <= tx, ry + s_side * (xs - x0), qy + s_end * (xs - x1))
    return near, np.minimum(far, near)


def stretch_across(img, g, ks, ke, points=()):
    """The side's columns stretched ks times, the end's ke times, about the corner - a render whose car
    is turned off 45 degrees, or drawn stubbier than another, brought to the other's length and width
    (nothing moves up or down). Returns the picture, its geometry and the points carried over."""
    if abs(ks - 1) < 1e-3 and abs(ke - 1) < 1e-3:
        return img, dict(g), list(points)
    a = np.asarray(img.convert('RGBa')).astype(np.float32)
    h, w = a.shape[:2]
    xc = g['xc']
    lo, hi = xc - xc * ke, xc + (w - 1 - xc) * ks
    W = int(np.ceil(hi - lo)) + 1
    xo = np.arange(W) + lo
    xi = np.where(xo >= xc, xc + (xo - xc) / ks, xc + (xo - xc) / ke)
    out = np.zeros((h, W, 4), np.float32)
    for y in range(h):
        for ch in range(4):
            out[y, :, ch] = np.interp(xi, np.arange(w), a[y, :, ch], left=0, right=0)
    im = Image.fromarray(out.clip(0, 255).round().astype(np.uint8), 'RGBa').convert('RGBA')
    fx = lambda x: (xc + (x - xc) * (ks if x >= xc else ke)) - lo
    g2 = dict(g, s_side=g['s_side'] / ks, s_end=g['s_end'] / ke, xc=xc - lo, x0=fx(g['x0']), x1=fx(g['x1']))
    return im, g2, [(fx(x), y) for x, y in points]


def square(img, g, points=(), upright=None):
    """Column by column: the wall under the roof's near edge scaled as uprights, the roof between its
    near and far edges laid at 0.5 each way, what stands on the roof upright again. upright: the
    camera's (cos 30 / cos e) unless given."""
    a = np.asarray(img).astype(np.float32) / 255.0
    h, w = a.shape[:2]
    sin_e = np.sqrt(abs(g['s_side'] * g['s_end']))
    if upright is None:
        upright = np.cos(np.radians(30)) / np.sqrt(1 - sin_e ** 2)
    xs = np.arange(w, dtype=np.float64)
    near, far = edges_of(g, g['s_side'], g['s_end'], xs)
    near_n, far_n = edges_of(g, -0.5, 0.5, xs)

    def fwd(x, y):
        e, f, en, fn = near[x], far[x], near_n[x], far_n[x]
        if y >= e:
            return en + upright * (y - e)
        if y >= f:
            return fn + (en - fn) * (y - f) / max(e - f, 1e-6)
        return fn - upright * (f - y)

    tops = [fwd(x, 0) for x in range(w)]
    bots = [fwd(x, h - 1) for x in range(w)]
    y0, y1 = int(np.floor(min(tops))) - 2, int(np.ceil(max(bots))) + 2
    pm = a.copy()
    pm[..., :3] *= pm[..., 3:4]
    out = np.zeros((y1 - y0, w, 4), np.float32)
    yo = np.arange(y0, y1, dtype=np.float64)
    for x in range(w):
        e, f, en, fn = near[x], far[x], near_n[x], far_n[x]
        roof = (en - fn) / max(e - f, 1e-6)
        yi = np.where(yo >= en, e + (yo - en) / upright,
                      np.where(yo >= fn, f + (yo - fn) / max(roof, 1e-6), f - (fn - yo) / upright))
        ok = (yi >= 0) & (yi <= h - 1)
        for ch in range(4):
            out[ok, x, ch] = np.interp(yi[ok], np.arange(h), pm[:, x, ch])
    al = out[..., 3:4]
    out[..., :3] = np.where(al > 1e-4, out[..., :3] / np.maximum(al, 1e-4), 0)
    im = Image.fromarray((out.clip(0, 1) * 255).round().astype(np.uint8), 'RGBA')
    box = im.getbbox()
    mapped = [(px - box[0], fwd(int(round(px)), py) - y0 - box[1]) for px, py in points]
    geo = dict(xc=g['xc'] - box[0], yc=g['yc'] - y0 - box[1], x0=g['x0'] - box[0], x1=g['x1'] - box[0],
               upright=upright, roof=0.5 / sin_e)
    return im.crop(box), mapped, geo


def measure(img, geo):
    """A squared rise view's sizes (px): the side's and the end's x span, the wall from the roof's
    near edge to the rails (mid side), the footprint's width."""
    al = np.asarray(img)[..., 3] > 100
    xm = int((geo['xc'] + geo['x1']) / 2)
    near = geo['yc'] - 0.5 * (xm - geo['xc'])
    col = np.nonzero(al[:, xm - 3:xm + 4].any(1))[0]
    body = al[int(geo['yc']):, :]
    cols = np.nonzero(body.any(0))[0]
    return dict(side_x=geo['x1'] - geo['xc'], end_x=geo['xc'] - geo['x0'], wall=float(col.max() - near),
                foot_w=float(cols.max() - cols.min()))


def ground_anchor(img, xc, view):
    """The middle of the footprint on the ground (the tram's rule): the near ground corner where the
    lowest points along the long side and along the end meet at 0.5 each way; the footprint runs
    from it to the body's outermost columns."""
    a = np.asarray(img)
    al = a[..., 3] > 128
    h, w = al.shape
    cols = np.nonzero(al.any(0))[0]
    x0, x1 = float(cols.min()), float(cols.max())
    low = np.array([h - 1 - np.argmax(al[::-1, x]) if al[:, x].any() else -1 for x in range(w)], float)
    xs = np.arange(w, dtype=float)
    fall = view == 'fall'
    side = (xs < xc - 8) & (xs > x0) if fall else (xs > xc + 8) & (xs < x1)
    end = (xs > xc + 4) & (xs < x1) if fall else (xs < xc - 4) & (xs > x0)
    s_side, s_end = (-0.5, 0.5) if fall else (0.5, -0.5)
    c_side = float(np.max(low[side] - s_side * xs[side]))
    c_end = float(np.max(low[end] - s_end * xs[end]))
    xg = (c_end - c_side) / (s_side - s_end)
    yg = c_side + s_side * xg
    side_dx = (xg - x0) if fall else (x1 - xg)
    end_dx = (x1 - xg) if fall else (xg - x0)
    cx = xg + ((-side_dx + end_dx) / 2 if fall else (side_dx - end_dx) / 2)
    cy = yg - 0.5 * (side_dx + end_dx) / 2
    return (cx, cy), x1 - x0


# ── the side view ───────────────────────────────────────────────────────────────────────────────────
def square_side(img, s_side, ref, points=(), quiet=False):
    """Levelled (a shear down the columns: its stripes run at s_side), then sized to the squared front
    view: length its side's ground span x sqrt 2, the wall its height, the roof the car's width seen
    down the screen (its end's x span / sqrt 2), what stands on the roof upright as the wall."""
    w, h = img.size
    pad = int(np.ceil(abs(s_side) * w / 2)) + 2
    lev = img.convert('RGBa').transform((w, h + 2 * pad), Image.AFFINE, (1, 0, 0, s_side, 1, -s_side * w / 2 - pad),
                                        resample=Image.BICUBIC).convert('RGBA')
    a = np.asarray(lev)
    al = a[..., 3] > 100
    ys, xs = np.nonzero(stripe_edges(a, top_only=True))
    hist = np.bincount(ys[(xs > 30) & (xs < SIDE_CORNER_X - 20)])
    near = int(np.nonzero(hist >= 0.3 * hist.max())[0][0]) - CANT_RAIL_PX
    x_left, x_corner = float(np.nonzero(al.any(0))[0].min()), float(SIDE_CORNER_X)
    span = x_corner - x_left
    mid = slice(int(x_left + 0.3 * span), int(x_left + 0.7 * span))
    rail = float(np.nonzero(al[:, mid].any(1))[0].max())
    tops = np.array([np.argmax(al[:, x]) for x in range(int(x_left) + 20, int(x_corner) - 20)])
    roof_top = float(np.percentile(tops, 85))          # (columns with nothing standing on the roof)
    fx = np.sqrt(2) * ref['side_x'] / span
    fw = ref['wall'] / (rail - near)
    fr = ref['end_x'] / np.sqrt(2) / (near - roof_top)

    def fwd(y):
        if y >= near:
            return (y - near) * fw
        if y >= roof_top:
            return -(near - y) * fr
        return -(near - roof_top) * fr - (roof_top - y) * fw

    top = fwd(0) - 2
    H = int(np.ceil(fwd(a.shape[0] - 1) - top)) + 2
    W = int(round(w * fx))
    yo = np.arange(H) + top
    r_top = -(near - roof_top) * fr
    yi = np.where(yo >= 0, near + yo / fw, np.where(yo >= r_top, near + yo / fr, roof_top - (r_top - yo) / fw))
    s = np.asarray(lev.convert('RGBa').resize((W, a.shape[0]), Image.LANCZOS)).astype(np.float32) / 255.0
    out = np.zeros((H, W, 4), np.float32)
    ok = (yi >= 0) & (yi <= a.shape[0] - 1)
    for x in range(W):
        for ch in range(4):
            out[ok, x, ch] = np.interp(yi[ok], np.arange(a.shape[0]), s[:, x, ch])
    al2 = out[..., 3:4]
    out[..., :3] = np.where(al2 > 1e-4, out[..., :3] / np.maximum(al2, 1e-4), 0)
    im = Image.fromarray((out.clip(0, 1) * 255).round().astype(np.uint8), 'RGBA')
    box = im.getbbox()
    mapped = [(px * fx - box[0], fwd(py + s_side * (px - w / 2) + pad) - top - box[1]) for px, py in points]
    geo = dict(x_left=x_left * fx - box[0], x_corner=x_corner * fx - box[0], near=fwd(near) - top - box[1],
               rail=fwd(rail) - top - box[1], fx=fx, fw=fw, fr=fr)
    quiet or print(f'side: levelled {s_side:+.3f}, length x{fx:.3f}, wall x{fw:.3f}, roof x{fr:.3f}')
    return im.crop(box), mapped, geo


# ── game textures ───────────────────────────────────────────────────────────────────────────────────
def game_texture(img):
    """A picture at its own size on a power-of-two canvas with an 8-px clear margin, the colour of its
    edge carried out under the clear pixels (Phaser repeats and mipmaps power-of-two textures; a clear
    pixel's colour shows at the edge when it is drawn small). Returns it and where the picture's
    corner lands."""
    W, H = 1, 1
    while W < img.width + 2 * GUTTER:
        W *= 2
    while H < img.height + 2 * GUTTER:
        H *= 2
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ox, oy = (W - img.width) // 2, (H - img.height) // 2
    canvas.paste(img, (ox, oy))
    a = np.asarray(canvas).astype(np.float32)
    solid = a[..., 3] >= 32
    known = solid.copy()
    rgb = a[..., :3] * known[..., None]
    while not known.all():
        acc = np.zeros_like(rgb); cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(rgb * known[..., None], dy, 0), dx, 1)
            cnt += np.roll(np.roll(known, dy, 0), dx, 1)
        new = ~known & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        known |= new
    a[..., :3] = np.where(solid[..., None], a[..., :3], rgb)
    return Image.fromarray(a.clip(0, 255).round().astype(np.uint8), 'RGBA'), (ox, oy)


def scaled(img, f, points):
    if abs(f - 1) < 1e-3:
        return img, points
    out = img.convert('RGBa').resize((round(img.width * f), round(img.height * f)), Image.LANCZOS).convert('RGBA')
    return out, [(x * f, y * f) for x, y in points]


def flipped(img, points):
    return img.transpose(Image.FLIP_LEFT_RIGHT), [(img.width - x, y) for x, y in points]


def mirror_written(img, k):
    """The picture as it is, its lettering mirror-written - flipped after squaring, it reads right."""
    return flipped(unmirror_lettering(img.transpose(Image.FLIP_LEFT_RIGHT), img, LETTERING.get(k, [])), [])[0]


def check(img, lines, name):
    """The picture on grey with lines drawn over it (to look at)."""
    im = Image.new('RGBA', img.size, (128, 128, 128, 255))
    im.alpha_composite(img)
    d = ImageDraw.Draw(im)
    for pts, colour in lines:
        d.line(pts, fill=colour, width=1)
    im.resize((im.width * 2, im.height * 2), Image.NEAREST).save(OUT / f'{name}_check.png')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    GAME.mkdir(parents=True, exist_ok=True)
    slopes = survey()
    views = {}          # name -> (picture, lamps {heads, tails}, anchor, kind)

    # the diagonal views: front and rear, squared; the rear then made the front's car - its side and
    # end stretched to the front's x spans, its wall to the front's height
    sq = {}
    for role in ('front', 'rear'):
        k = KEEP[role]
        img = cut(k)
        img.save(OUT / f'cell{k}_cut.png')
        s_side, s_end = slopes[k]
        g = roof_geometry(np.asarray(img), s_side, s_end, CORNER_X[k])
        xs = np.arange(img.width, dtype=float)
        near, far = edges_of(g, s_side, s_end, xs)
        check(img, [(list(zip(xs, near)), (0, 255, 255, 255)), (list(zip(xs, far)), (255, 0, 255, 255))], f'cell{k}_roof')
        lamp_keys = list(LAMPS[k])
        pts = [p for key in lamp_keys for p in LAMPS[k][key]]
        out, mapped, geo = square(img, g, pts)
        m = measure(out, geo)
        print(f"{role} (cell {k}): corner x {g['xc']:.0f}, roof depth {g['depth']:.1f}, wall x{geo['upright']:.3f}, "
              f"roof x{geo['roof']:.3f}, {img.size} -> {out.size}; " + ', '.join(f'{a} {b:.1f}' for a, b in m.items()))
        sq[role] = dict(k=k, src=img, g=g, pts=pts, keys=lamp_keys, geo=geo, m=m, img=out, mapped=mapped)
    ref = sq['front']['m']
    for role, d in sq.items():
        ks, ke = ref['side_x'] / d['m']['side_x'], ref['end_x'] / d['m']['end_x']
        up = d['geo']['upright'] * ref['wall'] / d['m']['wall']
        if role == 'front':
            ks = ke = 1.0
            up = d['geo']['upright']
        st, g2, pts2 = stretch_across(d['src'], d['g'], ks, ke, d['pts'])
        d['img'], d['mapped'], d['geo'] = square(st, g2, pts2, upright=up)
        st_m, _, _ = stretch_across(mirror_written(d['src'], d['k']), d['g'], ks, ke)
        d['img_m'], _, _ = square(st_m, g2, upright=up)
        d['m'] = measure(d['img'], d['geo'])
        d['pts'] = d['mapped']
        if role != 'front':
            print(f'{role} made the front\'s car: side x{ks:.3f}, end x{ke:.3f}, wall x{up:.3f} -> '
                  + ', '.join(f'{a} {b:.1f}' for a, b in d['m'].items()))
    for role, d in sq.items():
        anchor, _ = ground_anchor(d['img'], d['geo']['xc'], 'rise')
        lamps = {}
        i = 0
        for key in d['keys']:
            n = len(LAMPS[d['k']][key])
            lamps[key] = d['pts'][i:i + n]
            i += n
        views[f'rise_{role}'] = (d['img'], lamps, anchor)
        m_img, m_pts = flipped(d['img_m'], [anchor] + [p for v in lamps.values() for p in v])
        m_lamps, i = {}, 1
        for key, v in lamps.items():
            m_lamps[key] = m_pts[i:i + len(v)]
            i += len(v)
        views[f'fall_{role}'] = (m_img, m_lamps, m_pts[0])

    # the side view, and it mirrored
    k = KEEP['side']
    img = cut(k)
    img.save(OUT / f'cell{k}_cut.png')
    out, mapped, geo = square_side(img, slopes[k][0], ref, LAMPS[k]['tails'])
    out_m, _, _ = square_side(mirror_written(img, k), slopes[k][0], ref, quiet=True)
    # (the footprint's middle: half the car's width behind the near side's rails, down the screen)
    k_m = ref['side_x'] / LRV_M[0]
    anchor = ((geo['x_left'] + geo['x_corner']) / 2, geo['rail'] - LRV_M[1] / 2 * k_m / np.sqrt(2))
    views['horiz_left'] = (out, {'tails': mapped}, anchor)
    m_img, m_pts = flipped(out_m, [anchor] + mapped)
    views['horiz_right'] = (m_img, {'tails': m_pts[1:]}, m_pts[0])

    # textures, and the art file
    scale = LRV_SCREEN_PX / ref['foot_w']
    art = {}
    for name, (img, lamps, (ax, ay)) in views.items():
        img.save(OUT / f'{name}.png')
        tex, (ox, oy) = game_texture(img)
        key = f'lrv_{name}'
        tex.save(GAME / f'{key}.png')
        lines = [([(0, ay + oy + 0.5 * (ax + ox)), (tex.width, ay + oy - 0.5 * (tex.width - ax - ox))], (0, 255, 255, 255)),
                 ([(0, ay + oy - 0.5 * (ax + ox)), (tex.width, ay + oy + 0.5 * (tex.width - ax - ox))], (0, 255, 255, 255))]
        check(tex, lines, key)
        art[name] = {'path': f'Models/lightRail/{key}.png', 'key': key, 'size': [tex.width, tex.height],
                     'anchor': [round(float(ax + ox), 1), round(float(ay + oy), 1)],
                     **{k_: [[round(float(x + ox), 1), round(float(y + oy), 1)] for x, y in v] for k_, v in lamps.items()},
                     'scale': round(scale, 5)}
        print(name, img.size, '->', tex.size, 'anchor', art[name]['anchor'])
    ART_JS.write_text(
        '// Generated by scripts/prepare-light-rail-assets.py - the 輕鐵 (KCR LRV, Comeng 1988), each way it can lie:\n'
        '// rise_* the car down-left to up-right, fall_* down-right to up-left, horiz_* side on; _front / _rear the end\n'
        "// nearer the viewer (horiz: heading left or right). anchor: the footprint's middle on the ground; heads / tails:\n"
        '// the lamps; scale: to the game\'s size at TILE_WIDTH 100. No end-on (vert) view yet. Not used by the game yet.\n'
        f'const LIGHT_RAIL_ART = Object.freeze({json.dumps(art, indent=2, ensure_ascii=False)});\n\n'
        "if (typeof module !== 'undefined' && module.exports) module.exports = { LIGHT_RAIL_ART };\n", encoding='utf-8')
    print('wrote', ART_JS.relative_to(ROOT), f'(footprint {LRV_SCREEN_PX:.1f} px across at TILE_WIDTH 100)')


if __name__ == '__main__':
    main()
