"""輕鐵 (九廣鐵路輕便鐵路第一期, Comeng LRV, 1988): the game's pictures from Norton's 8-direction atlas
(scripts/source-art/lightRail/original/HeungShing_LRV_Comeng_PhaseI_8Dir_atlas.png, kept as it is: a
4 x 2 grid of 640 x 420 cells on a clear background). Norton chose it over his first sheet
(lightRail.png - scripts/prepare-light-rail-assets-v1.py) on 2026-11-15: a longer, slimmer car, all
eight ways drawn (end on too), every lettering the right way round.

  rise_rear   row 0 col 0   the car down-left to up-right, its back (tail lamps) toward the viewer
  horiz_right row 0 col 1   side on, its cab to the right
  fall_front  row 0 col 2   down-right to up-left, its cab (元朗 615) toward the viewer
  vert_front  row 0 col 3   end on, its cab toward the viewer
  rise_front  row 1 col 0
  horiz_left  row 1 col 1
  fall_rear   row 1 col 2
  vert_rear   row 1 col 3

Its renders are not quite the game's 2:1 and not quite one another's (Norton: 修正新圖角度等問題):

- The four diagonal views are seen from a lower camera than the game's - the backs from 26-27 degrees
  up, the cabs from 21-22 - and the cabs are drawn some 10% bigger. Each is squared as the 電車 are
  (scripts/prepare-tram-assets.py, Norton-approved): column by column, the wall under the roof's near
  edge (the cant rail's highlight over the top stripe) scaled as uprights (cos 30 / cos e), the roof
  between its near and far edges laid at 0.5 each way, the pantograph and roof boxes standing on it
  upright again; nothing moves up or across but that. Then each is made the reference view's car
  (rise_rear, the camera nearest the game's): its side's and its end's x spans and its wall's height.
  The fall views are squared as rise views, flipped, and flipped back.
- The side views are true side elevations; their length is set to the reference's side ground span
  (a world diagonal across the screen is sqrt 2 times a map axis's x span), their wall to its height,
  their roof as deep as the car's width seen down the screen (the end's x span / sqrt 2).
- The end-on views are drawn from a low camera too: the roof, the car's whole length seen from above,
  is far too short. Across, the car is made the reference's width (the end's x span x sqrt 2); the
  near end's wall its height; the roof between its near and far ends the car's length seen down the
  screen (the side's x span / sqrt 2); the pantograph upright.

Size: a car's length, 20.2 m, at the world's 20 m a tile (docs/world-scale.md), then DRAW_SCALE -
Norton, 2026-11-15: by the buses' rule (1.32 times the world's) 太大; at the world's, 再細少少. The scale is
set by the side's x span (the reference's, which every diagonal view is made), so a car is drawn exactly
LIGHT_RAIL_CAR_TILES long - in the art file too: a coupled pair's second car is placed by it.

Writes the squared pictures to scripts/source-art/lightRail/squared/ (gitignored; *_check.png overlays
and contact.png to look at), the game's textures to Models/lightRail/ (power-of-two canvases, an 8-px
clear margin, colour carried out under clear pixels, at the squared pictures' own resolution) and
light-rail-art.js: each view's anchor (the footprint's middle on the ground), lamps (heads: the cab's
two headlamps; tails: the back's two red lamps - where each shows) and the scale for TILE_WIDTH 100.
Run: .venv/bin/python -B scripts/prepare-light-rail-assets.py
"""
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ATLAS = ROOT / 'scripts/source-art/lightRail/original/HeungShing_LRV_Comeng_PhaseI_8Dir_atlas.png'
OUT = ROOT / 'scripts/source-art/lightRail/squared'
GAME = ROOT / 'Models/lightRail'
ART_JS = ROOT / 'light-rail-art.js'
CELL_W, CELL_H = 640, 420
GUTTER = 8

_spec = importlib.util.spec_from_file_location('tram_assets', ROOT / 'scripts/prepare-tram-assets.py')
tram = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tram)
best_slope = tram.best_slope

# Each view: its cell (row, col), what it is, and points read off it by hand (px of the cell cropped to
# its picture; a fall view's FLIPPED to a rise view, as it is squared): the near corner's x (where the
# side meets the end), the end view's near roof edge (the top of the flat end face, under the roof's
# curved cap: just over the 元朗 615 board / the upper red lamps), the lamps.
VIEWS = {
    'rise_rear': dict(cell=(0, 0), kind='diag', corner=56, lamps={'tails': [(8.3, 136.7), (43.3, 151)]}),
    'rise_front': dict(cell=(1, 0), kind='diag', corner=66, lamps={'heads': [(12.3, 216.7), (47.7, 230)]}),
    'fall_front': dict(cell=(0, 2), kind='diag', flip=True, corner=70, lamps={'heads': [(12.3, 208.3), (51.7, 223.3)]}),
    'fall_rear': dict(cell=(1, 2), kind='diag', flip=True, corner=56, lamps={'tails': [(8.3, 136.7), (45.7, 151.7)]}),
    'horiz_right': dict(cell=(0, 1), kind='side', lamps={'heads': [(499.7, 136.7)], 'tails': [(11.7, 73.3)]}),
    'horiz_left': dict(cell=(1, 1), kind='side', lamps={'heads': [(5, 145)], 'tails': [(494.3, 77.3)]}),
    'vert_front': dict(cell=(0, 3), kind='end', near=142, lamps={'heads': [(24, 241), (81.5, 241)]}),
    'vert_rear': dict(cell=(1, 3), kind='end', near=160, lamps={'tails': [(25, 177.5), (76.5, 177.5)]}),
}
REFERENCE = 'rise_rear'
LRV_M = (20.2, 2.65)
PX_PER_M = 100 / 2 / 20          # a tile edge's x span at TILE_WIDTH 100, over its 20 m
DRAW_SCALE = 0.85
LRV_CAR_TILES = LRV_M[0] / 20 * DRAW_SCALE
TILE_X_PX = 100 / 2                # a tile edge's x span at TILE_WIDTH 100
SQRT2 = np.sqrt(2)


def cut(cell):
    r, c = cell
    im = Image.open(ATLAS).convert('RGBA').crop((c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H))
    return im.crop(im.getbbox())


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


def top_stripe(a, slope, cols):
    """The top orange stripe's top edge along `slope` over columns `cols` (lo, hi): its intercept -
    the least with a good share of edge pixels (perspective spreads it)."""
    ys, xs = np.nonzero(stripe_edges(a, top_only=True))
    m = (xs >= cols[0]) & (xs < cols[1])
    c = ys[m] - slope * xs[m]
    hist = np.bincount(np.round(c - c.min()).astype(int))
    return c.min() + int(np.nonzero(hist >= 0.3 * hist.max())[0][0])


def cant_rail(a, slope, c_top, cols):
    """How far above the top stripe the roof's near edge is: the bright highlight where the side
    turns into the roof - the brightest line along `slope` 6-30 px above the stripe."""
    lum = a[..., :3].astype(float).mean(2)
    al = a[..., 3] > 100
    best = (0.0, 18)
    for off in range(6, 31):
        vals = [lum[y, x] for x in range(int(cols[0]), int(cols[1]), 2)
                for y in [int(round(c_top + slope * x)) - off] if 0 <= y < a.shape[0] and al[y, x]]
        if vals and np.mean(vals) > best[0]:
            best = (float(np.mean(vals)), off)
    return best[1]


# ── the diagonal views (squared as rise views: the near end at the lower left) ─────────────────────
def diag_slopes(a):
    """(side, end) slopes off the orange stripes' edges: the side over the right of the picture, the
    end over its left."""
    ys, xs = np.nonzero(stripe_edges(a))
    ys, xs = ys.astype(float), xs.astype(float)
    w = a.shape[1]
    ms = (xs >= 0.35 * w) & (xs < 0.95 * w)
    me = (xs >= 0.02 * w) & (xs < 0.14 * w)
    return best_slope(ys[ms], xs[ms], -0.75, -0.2), best_slope(ys[me], xs[me], 0.1, 0.7)


def roof_geometry(a, s_side, s_end, xc):
    """The roof's near edge (side and end, meeting over the corner xc) and its far edges. The roof's
    depth is read off its outline over the side (the columns with nothing standing on the roof), and
    gives the end's width - a rounded end is wider lower down than its roof."""
    w = a.shape[1]
    c_top = top_stripe(a, s_side, (xc + 25, w - 15))
    cant = cant_rail(a, s_side, c_top, (xc + 25, w - 15))
    yc = c_top - cant + s_side * xc
    al = a[..., 3] > 100
    x1 = float(np.nonzero(al.any(0))[0].max())
    cols = np.arange(int(xc) + 5, int(xc + 0.6 * (x1 - xc)))
    depth = np.array([yc + s_side * (x - xc) - np.argmax(al[:, x]) for x in cols])
    lo = np.percentile(depth, 10)
    D = float(depth[(depth >= lo) & (depth <= lo + 10)].mean())
    x0 = xc - D / (s_end - s_side)
    return dict(s_side=s_side, s_end=s_end, xc=float(xc), yc=float(yc), x0=float(x0), x1=x1, depth=D, cant=cant)


def edges_of(g, s_side, s_end, xs):
    """The roof's near edge and far edge over each column, for slopes (s_side, s_end) about g's corner."""
    xc, yc, x0, x1 = g['xc'], g['yc'], g['x0'], g['x1']
    near = np.where(xs >= xc, yc + s_side * (xs - xc), yc + s_end * (xs - xc))
    ry = yc + s_end * (x0 - xc)                         # the end's far roof corner
    qy = yc + s_side * (x1 - xc)                        # the far end's near roof corner
    tx = x0 + (x1 - xc)                                 # the roof's far corner
    far = np.where(xs <= tx, ry + s_side * (xs - x0), qy + s_end * (xs - x1))
    return near, np.minimum(far, near)


def stretch_across(img, g, ks, ke, points=()):
    """The side's columns stretched ks times, the end's ke times, about the corner (nothing moves up
    or down): one render's car brought to another's length and width."""
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


def remap_columns(img, near, far, near_n, far_n, upright, points=()):
    """Each column moved up or down in three parts: under the roof's near edge as uprights, between its
    near and far edges from (far, near) to (far_n, near_n), above the far edge as uprights. Returns the
    picture cropped, the points carried over and the crop's (x, y) offset."""
    a = np.asarray(img).astype(np.float32) / 255.0
    h, w = a.shape[:2]

    def fwd(x, y):
        e, f, en, fn = near[x], far[x], near_n[x], far_n[x]
        if y >= e:
            return en + upright * (y - e)
        if y >= f:
            return fn + (en - fn) * (y - f) / max(e - f, 1e-6)
        return fn - upright * (f - y)

    y0 = int(np.floor(min(fwd(x, 0) for x in range(w)))) - 2
    y1 = int(np.ceil(max(fwd(x, h - 1) for x in range(w)))) + 2
    pm = a.copy()
    pm[..., :3] *= pm[..., 3:4]
    out = np.zeros((y1 - y0, w, 4), np.float32)
    yo = np.arange(y0, y1, dtype=np.float64)
    for x in range(w):
        e, f, en, fn = near[x], far[x], near_n[x], far_n[x]
        roof = max((en - fn) / max(e - f, 1e-6), 1e-6)
        yi = np.where(yo >= en, e + (yo - en) / upright, np.where(yo >= fn, f + (yo - fn) / roof, f - (fn - yo) / upright))
        ok = (yi >= 0) & (yi <= h - 1)
        for ch in range(4):
            out[ok, x, ch] = np.interp(yi[ok], np.arange(h), pm[:, x, ch])
    al = out[..., 3:4]
    out[..., :3] = np.where(al > 1e-4, out[..., :3] / np.maximum(al, 1e-4), 0)
    im = Image.fromarray((out.clip(0, 1) * 255).round().astype(np.uint8), 'RGBA')
    box = im.getbbox()
    mapped = [(px - box[0], fwd(min(w - 1, max(0, int(round(px)))), py) - y0 - box[1]) for px, py in points]
    return im.crop(box), mapped, (box[0], y0 + box[1])


def square_diag(img, g, points=(), upright=None):
    """A rise view squared: the roof's edges laid at 0.5 each way from the corner."""
    sin_e = np.sqrt(abs(g['s_side'] * g['s_end']))
    if upright is None:
        upright = np.cos(np.radians(30)) / np.sqrt(1 - sin_e ** 2)
    xs = np.arange(img.width, dtype=np.float64)
    near, far = edges_of(g, g['s_side'], g['s_end'], xs)
    near_n, far_n = edges_of(g, -0.5, 0.5, xs)
    out, mapped, (ox, oy) = remap_columns(img, near, far, near_n, far_n, upright, points)
    geo = dict(xc=g['xc'] - ox, yc=g['yc'] - oy, x0=g['x0'] - ox, x1=g['x1'] - ox, upright=upright, roof=0.5 / sin_e)
    return out, mapped, geo


def measure_diag(img, geo):
    """A squared rise view's sizes (px): the side's and the end's x span, the wall from the roof's
    near edge down to the rails - the line at 0.5 touching the wheels' bottoms all along the side
    (one column might meet a bogie in one render and the skirt between them in another)."""
    al = np.asarray(img)[..., 3] > 100
    xc, yc = geo['xc'], geo['yc']
    low = [np.nonzero(al[:, x])[0].max() + 0.5 * (x - xc) for x in range(int(xc) + 10, int(geo['x1']) - 10) if al[:, x].any()]
    return dict(side_x=geo['x1'] - xc, end_x=xc - geo['x0'], wall=float(np.percentile(low, 95) - yc))


def footprint(geo, m):
    """A squared rise view's footprint and its middle, from the geometry every diagonal view shares
    once made the reference's car: the near ground corner under the roof's near corner, a wall's height
    down (the rails), the side's and the end's x spans from it at 0.5 - not from the picture's lowest
    pixels, which at a cab end are its coupler, low and out in front (Norton, 2026-11-15: 兩卡貼圖底面要
    double check - a pair's cab and back views sat 7 px apart)."""
    x, y = geo['xc'], geo['yc'] + m['wall']
    sx, ex = m['side_x'], m['end_x']
    foot = [(x, y), (x + sx, y - 0.5 * sx), (x + sx - ex, y - 0.5 * (sx + ex)), (x - ex, y - 0.5 * ex)]
    return (x + (sx - ex) / 2, y - (sx + ex) / 4), foot


# ── the side and end-on views: rows moved in three bands ────────────────────────────────────────────
def remap_rows(img, near, far, f_wall, f_roof, fx, points=()):
    """Every column alike: x scaled by fx; under the row `near` the wall, scaled f_wall; between `far`
    and `near` the roof, f_roof; above `far` what stands on the roof, f_wall again. `near` lands at 0."""
    def fwd(y):
        if y >= near:
            return (y - near) * f_wall
        if y >= far:
            return -(near - y) * f_roof
        return -(near - far) * f_roof - (far - y) * f_wall
    W = int(round(img.width * fx))
    s = np.asarray(img.convert('RGBa').resize((W, img.height), Image.LANCZOS)).astype(np.float32) / 255.0
    top = fwd(0) - 2
    H = int(np.ceil(fwd(img.height - 1) - top)) + 3
    yo = np.arange(H) + top
    r_top = -(near - far) * f_roof
    yi = np.where(yo >= 0, near + yo / f_wall, np.where(yo >= r_top, near + yo / f_roof, far - (r_top - yo) / f_wall))
    out = np.zeros((H, W, 4), np.float32)
    ok = (yi >= 0) & (yi <= img.height - 1)
    for x in range(W):
        for ch in range(4):
            out[ok, x, ch] = np.interp(yi[ok], np.arange(img.height), s[:, x, ch])
    al = out[..., 3:4]
    out[..., :3] = np.where(al > 1e-4, out[..., :3] / np.maximum(al, 1e-4), 0)
    im = Image.fromarray((out.clip(0, 1) * 255).round().astype(np.uint8), 'RGBA')
    box = im.getbbox()
    mapped = [(px * fx - box[0], fwd(py) - top - box[1]) for px, py in points]
    return im.crop(box), mapped, lambda y: fwd(y) - top - box[1], box[0]


def square_side(img, ref, points=()):
    """A side view: its length the reference's side ground span x sqrt 2, its wall the reference's,
    its roof the car's width seen down the screen."""
    a = np.asarray(img)
    al = a[..., 3] > 100
    w = a.shape[1]
    cols = (0.15 * w, 0.85 * w)
    ys, xs = np.nonzero(stripe_edges(a))
    m = (xs >= cols[0]) & (xs < cols[1])
    slope = best_slope(ys[m].astype(float), xs[m].astype(float), -0.1, 0.1)
    c_top = top_stripe(a, slope, cols)
    near = c_top - cant_rail(a, slope, c_top, cols) + slope * w / 2
    xb = np.nonzero(al.any(0))[0]
    span = float(xb.max() - xb.min())
    mid = slice(int(0.3 * w), int(0.7 * w))
    rail = float(np.nonzero(al[:, mid].any(1))[0].max())
    tops = np.array([np.argmax(al[:, x]) for x in range(int(0.1 * w), int(0.9 * w))])
    far = float(np.percentile(tops, 85))            # (columns with nothing standing on the roof)
    fx = SQRT2 * ref['side_x'] / span
    f_wall = ref['wall'] / (rail - near)
    f_roof = ref['end_x'] / SQRT2 / (near - far)
    out, mapped, fwd, ox = remap_rows(img, near, far, f_wall, f_roof, fx, points)
    print(f'  stripes {slope:+.3f}; length x{fx:.3f}, wall x{f_wall:.3f}, roof x{f_roof:.3f}')
    x0, x1, y = xb.min() * fx - ox, xb.max() * fx - ox, fwd(rail)
    depth = ref['end_x'] / SQRT2                       # the car's width, down the screen
    foot = [(x0, y), (x1, y), (x1, y - depth), (x0, y - depth)]
    return out, mapped, ((x0 + x1) / 2, y - depth / 2), foot


def square_end(img, near, ref, points=()):
    """An end-on view: across, the reference's width (its end's x span x sqrt 2); the near end's wall
    the reference's height; the roof, from the near end to the far, the car's length seen down the
    screen (its side's x span / sqrt 2)."""
    a = np.asarray(img)
    al = a[..., 3] > 100
    w = a.shape[1]
    body = np.nonzero(al[int(near):].any(0))[0]
    width = float(body.max() - body.min())
    # the rails: the wheels' lowest at the sides (not the coupler, in the middle)
    side_cols = list(range(int(0.12 * w), int(0.3 * w))) + list(range(int(0.7 * w), int(0.88 * w)))
    rail = float(max(np.nonzero(al[:, x])[0].max() for x in side_cols))
    # the far end of the roof: its top just inside the rounded corners (the pantograph is in the middle)
    far = float(min(np.argmax(al[:, x]) for x in (int(0.2 * w), int(0.8 * w))))
    fx = SQRT2 * ref['end_x'] / width
    f_wall = ref['wall'] / (rail - near)
    f_roof = ref['side_x'] / SQRT2 / (near - far)
    out, mapped, fwd, ox = remap_rows(img, near, far, f_wall, f_roof, fx, points)
    print(f'  width x{fx:.3f}, wall x{f_wall:.3f}, roof x{f_roof:.3f} (near {near:.0f}, far {far:.0f}, rails {rail:.0f})')
    x0, x1, y = body.min() * fx - ox, body.max() * fx - ox, fwd(rail)
    length = ref['side_x'] / SQRT2                     # the car's length, down the screen
    foot = [(x0, y), (x1, y), (x1, y - length), (x0, y - length)]
    return out, mapped, ((x0 + x1) / 2, y - length / 2), foot


# ── output ──────────────────────────────────────────────────────────────────────────────────────────
# The shadow under the car (Norton, 2026-11-15: 貼圖底面好似有啲問題): the renders are clear under the
# body, between and past the bogies, so the road showed through there - its markings too - and the car
# seemed to float. Its footprint is laid dark on the ground behind it, in the same picture.
SHADOW_RGB, SHADOW_ALPHA, SHADOW_BLUR = (22, 22, 26), 0.72, 1.0


def with_shadow(img, foot, points):
    """The picture with its footprint's shadow under it (the canvas grown to hold it); the points
    moved with it."""
    xs, ys = [p[0] for p in foot], [p[1] for p in foot]
    pad = 3
    x0, y0 = min(0, int(np.floor(min(xs))) - pad), min(0, int(np.floor(min(ys))) - pad)
    x1 = max(img.width, int(np.ceil(max(xs))) + pad)
    y1 = max(img.height, int(np.ceil(max(ys))) + pad)
    mask = Image.new('L', (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(mask).polygon([(x - x0, y - y0) for x, y in foot], fill=round(255 * SHADOW_ALPHA))
    mask = mask.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    out = Image.new('RGBA', mask.size, SHADOW_RGB + (0,))
    out.putalpha(mask)
    out.alpha_composite(img, (-x0, -y0))
    return out, [(x - x0, y - y0) for x, y in points]


def game_texture(img):
    """A picture at its own size on a power-of-two canvas with an 8-px clear margin, the colour of its
    edge carried out under the clear pixels (Phaser repeats and mipmaps power-of-two textures; a clear
    pixel's colour shows at the edge when it is drawn small). Returns it and where the picture lands."""
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


def flipped(img, points):
    return img.transpose(Image.FLIP_LEFT_RIGHT), [(img.width - x, y) for x, y in points]


def check(img, lines, name, z=2):
    im = Image.new('RGBA', img.size, (128, 128, 128, 255))
    im.alpha_composite(img)
    d = ImageDraw.Draw(im)
    for pts, colour in lines:
        d.line(pts, fill=colour, width=1)
    im.resize((im.width * z, im.height * z), Image.NEAREST).save(OUT / f'{name}_check.png')


def contact(views):
    """All eight at their game size x2 round one point, as they would sit on the same spot."""
    S = 2 * views[REFERENCE]['scale']
    order = ['rise_front', 'fall_front', 'vert_front', 'horiz_left', 'rise_rear', 'fall_rear', 'vert_rear', 'horiz_right']
    cell = 260
    c = Image.new('RGBA', (cell * 4, cell * 2), (110, 110, 112, 255))
    d = ImageDraw.Draw(c)
    for i, name in enumerate(order):
        v = views[name]
        im = v['img'].convert('RGBa').resize((round(v['img'].width * S), round(v['img'].height * S)), Image.LANCZOS).convert('RGBA')
        cx, cy = (i % 4) * cell + cell // 2, (i // 4) * cell + int(cell * 0.62)
        # (the footprint's outline: 20.2 x 2.65 m at the reference's px a metre, x2)
        k = v['k'] * S
        L, W = LRV_M[0] * k, LRV_M[1] * k
        axis = {'rise': ((1, -0.5), (1, 0.5)), 'fall': ((1, 0.5), (1, -0.5)),
                'horiz': ((SQRT2, 0), (0, SQRT2 / 2)), 'vert': ((0, SQRT2 / 2), (SQRT2, 0))}[name.split('_')[0]]
        (ux, uy), (vx, vy) = axis
        pts = [(cx + sx * L / 2 * ux + sy * W / 2 * vx, cy + sx * L / 2 * uy + sy * W / 2 * vy) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        d.polygon(pts, outline=(255, 230, 0, 255))
        c.alpha_composite(im, (round(cx - v['anchor'][0] * S), round(cy - v['anchor'][1] * S)))
        d.text((cx - 40, (i // 4) * cell + 6), name, fill=(255, 255, 255, 255))
    c.save(OUT / 'contact.png')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    GAME.mkdir(parents=True, exist_ok=True)
    views = {}
    # the diagonal views: squared, then each made the reference's car
    diag = {}
    for name, cfg in VIEWS.items():
        if cfg['kind'] != 'diag':
            continue
        img = cut(cfg['cell'])
        if cfg.get('flip'):
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        a = np.asarray(img)
        s_side, s_end = diag_slopes(a)
        g = roof_geometry(a, s_side, s_end, cfg['corner'])
        xs = np.arange(img.width, dtype=float)
        near, far = edges_of(g, s_side, s_end, xs)
        check(img, [(list(zip(xs, near)), (0, 255, 255, 255)), (list(zip(xs, far)), (255, 0, 255, 255))], f'{name}_roof')
        pts = [p for v in cfg['lamps'].values() for p in v]
        out, mapped, geo = square_diag(img, g, pts)
        m = measure_diag(out, geo)
        sin_e = np.sqrt(abs(s_side * s_end))
        print(f"{name}: side {s_side:+.3f} end {s_end:+.3f} (camera {np.degrees(np.arcsin(sin_e)):.1f} deg up, long axis "
              f"{np.degrees(np.arctan(abs(s_side) / sin_e)):.0f} deg), cant rail {g['cant']} px, roof depth {g['depth']:.1f}; "
              + ', '.join(f'{k} {v:.1f}' for k, v in m.items()))
        diag[name] = dict(img=img, g=g, pts=pts, geo=geo, m=m)
    ref = diag[REFERENCE]['m']
    for name, d in diag.items():
        cfg = VIEWS[name]
        ks, ke = ref['side_x'] / d['m']['side_x'], ref['end_x'] / d['m']['end_x']
        up = d['geo']['upright'] * ref['wall'] / d['m']['wall']
        st, g2, pts2 = stretch_across(d['img'], d['g'], ks, ke, d['pts'])
        out, mapped, geo = square_diag(st, g2, pts2, upright=up)
        m = measure_diag(out, geo)
        if name != REFERENCE:
            print(f'{name} made the reference\'s car: side x{ks:.3f}, end x{ke:.3f}, wall x{up:.3f} -> '
                  + ', '.join(f'{k} {v:.1f}' for k, v in m.items()))
        anchor, foot = footprint(geo, m)
        if cfg.get('flip'):
            out, pts = flipped(out, [anchor] + foot + mapped)
            anchor, foot, mapped = pts[0], pts[1:5], pts[5:]
        views[name] = dict(img=out, anchor=anchor, pts=mapped, foot=foot)
    # the side and end-on views
    for name, cfg in VIEWS.items():
        if cfg['kind'] == 'diag':
            continue
        img = cut(cfg['cell'])
        pts = [p for v in cfg['lamps'].values() for p in v]
        print(f'{name}:')
        if cfg['kind'] == 'side':
            out, mapped, anchor, foot = square_side(img, ref, pts)
        else:
            out, mapped, anchor, foot = square_end(img, cfg['near'], ref, pts)
        views[name] = dict(img=out, anchor=anchor, pts=mapped, foot=foot)
    # textures, checks, the art file
    scale = LRV_CAR_TILES * TILE_X_PX / ref['side_x']
    views[REFERENCE]['scale'] = scale
    k_ref = ref['side_x'] / LRV_M[0]                    # px a metre along a map axis's x span (reference)
    art = {}
    for name in ('rise_front', 'rise_rear', 'fall_front', 'fall_rear', 'horiz_left', 'horiz_right', 'vert_front', 'vert_rear'):
        v = views[name]
        v['k'] = k_ref
        v['img'], moved = with_shadow(v['img'], v['foot'], [v['anchor']] + v['pts'])
        v['anchor'], v['pts'] = moved[0], moved[1:]
        lamps, i = {}, 0
        for key, pts in VIEWS[name]['lamps'].items():
            lamps[key] = v['pts'][i:i + len(pts)]
            i += len(pts)
        v['img'].save(OUT / f'{name}.png')
        tex, (ox, oy) = game_texture(v['img'])
        key = f'lrv_{name}'
        tex.save(GAME / f'{key}.png')
        ax, ay = v['anchor']
        check(tex, [([(0, ay + oy + 0.5 * (ax + ox)), (tex.width, ay + oy - 0.5 * (tex.width - ax - ox))], (0, 255, 255, 255)),
                    ([(0, ay + oy - 0.5 * (ax + ox)), (tex.width, ay + oy + 0.5 * (tex.width - ax - ox))], (0, 255, 255, 255))], key)
        art[name] = {'path': f'Models/lightRail/{key}.png', 'key': key, 'size': [tex.width, tex.height],
                     'anchor': [round(float(ax + ox), 1), round(float(ay + oy), 1)],
                     **{k: [[round(float(x + ox), 1), round(float(y + oy), 1)] for x, y in pts] for k, pts in lamps.items()},
                     'scale': round(scale, 5)}
        print(f'{name}: {v["img"].size} -> {tex.size}, anchor {art[name]["anchor"]}')
    contact(views)
    ART_JS.write_text(
        '// Generated by scripts/prepare-light-rail-assets.py - the 輕鐵 (KCR LRV, Comeng 1988), all eight ways:\n'
        '// rise_* the car down-left to up-right, fall_* down-right to up-left, horiz_* side on, vert_* end on;\n'
        "// _front / _rear the end toward the viewer (horiz: the way its cab points). anchor: the footprint's middle\n"
        "// on the ground; heads / tails: its lamps where they show; scale: to the game's size at TILE_WIDTH 100.\n"
        f'const LIGHT_RAIL_ART = Object.freeze({json.dumps(art, indent=2, ensure_ascii=False)});\n'
        '// a car\'s drawn length along the track, in tiles\n'
        f'const LIGHT_RAIL_CAR_TILES = {LRV_CAR_TILES:.4f};\n\n'
        "if (typeof module !== 'undefined' && module.exports) module.exports = { LIGHT_RAIL_ART, LIGHT_RAIL_CAR_TILES };\n", encoding='utf-8')
    print('wrote', ART_JS.relative_to(ROOT), f'(scale {scale:.4f} at TILE_WIDTH 100: a car {LRV_CAR_TILES:.3f} tiles long)')


if __name__ == '__main__':
    main()
