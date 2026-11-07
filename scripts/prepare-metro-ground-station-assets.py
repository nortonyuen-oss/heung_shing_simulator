"""地鐵 地面站 (Norton, 2026-11-06): the ground station from Norton's render
(scripts/source-art/metroStation/original/groundStation.png), made as the 高架站 was.

The render: a platform on the far side of the tracks (two halves, staggered), a footbridge over the
tracks to a lift tower, the concourse on the near side with stairs and an escalator up to the
footbridge, a forecourt and a road. Made into the game's station (5 tiles of double track, left-hand
running), Norton's choices 2026-11-06:
- the road cut off;
- a platform on the near side too (the near half - concourse, escalator, lift, forecourt - moved out
  a platform's width, the footbridge drawn on over it), so each track has its platform;
- it takes the tiles beside the track it stands over.

This step: the render cleaned and squared (S), and its frame. Run with
.venv/bin/python -B scripts/prepare-metro-ground-station-assets.py [--s out.png]
"""
import importlib.util
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('track', ROOT / 'scripts/prepare-railway-track-assets.py')
track = importlib.util.module_from_spec(spec)
spec.loader.exec_module(track)
SRC = ROOT / 'scripts/source-art/metroStation/original/groundStation2.png'

# The render's axes are not alike: along the line (its platforms' edges, the yellow lines) 0.374
# steep, across it (its base's ends) 0.415 - each brought to 2:1 by a vertical scale and a shear:
# y' = SY y + SHX x + Y_OFF
SLOPE_L, SLOPE_C = 0.395, 0.415
SY = 1.0 / (SLOPE_L + SLOPE_C)
SHX = 0.5 - SY * SLOPE_C
SQUARE = SY
PX_M = 12.8                       # S px a metre along a map axis (a 512-px tile: 20 m)

# the road and its kerb at the bottom right (render px): off
ROAD = []


def clean(a):
    a = a.copy()
    if ROAD:
        m = Image.new('L', (a.shape[1], a.shape[0]), 0)
        ImageDraw.Draw(m).polygon(ROAD, fill=255)
        a[np.asarray(m) > 0] = 0
    return a


def render_s():
    a = np.asarray(Image.open(SRC).convert('RGBA'))
    im = Image.fromarray(clean(a), 'RGBA')
    w, h = im.size
    off = max(0.0, -SHX * w) + 2
    H = int(np.ceil(h * SY + abs(SHX) * w)) + 4
    # (output (x, y') from the input (x, (y' - off - SHX x) / SY)), at twice the size and down
    k = 2
    big = im.resize((w * k, h * k), Image.BICUBIC)
    coeffs = (1.0, 0.0, 0.0, -SHX / SY, k / SY / k * 1.0, -off * k / SY / k * 1.0)
    out = big.transform((w * k, H * k), Image.AFFINE, (1.0, 0.0, 0.0, -SHX / SY, 1.0 / SY, -off * k / SY), resample=Image.BICUBIC)
    return out.resize((w, H), Image.LANCZOS)


def coords(shape):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return xx, yy, yy + 0.5 * xx, yy - 0.5 * xx


# --- the frame (S px), measured on S: C across the line (m, towards the viewer), L along it (m,
# up-right), 0 at the station's middle - between its two tracks, the middle of its platforms;
# Z_PX px a metre up. (The render's platforms are 102 m: it is used at its own scale.)
V0, U0 = 1059.5, 193.0
Z_PX = 10.0
HALF_L = 50.0                     # five tiles
BED_V = (1012, 1106)              # the track bed on the ground, v: from the far platform's foot to the near's

# what stands nearer than the track, drawn after the trains (S px): the near platform's canopy (left
# of the stairs; right of them all is past the bed), the stairs up to the footbridge, the lift tower,
# the footbridge (only where it is over the tracks does it meet a train on screen); and all on the
# ground nearer than the bed
FRONT_POLYS = {
    'near_canopy': [(330, 955), (340, 932), (455, 865), (790, 704), (800, 718), (800, 1140), (330, 1140)],
    'stairs': [(625, 1070), (725, 860), (850, 645), (955, 672), (955, 760), (860, 850), (760, 1100)],
    'lift': [(870, 518), (1052, 518), (1052, 792), (870, 792)],
    'footbridge': [(527, 300), (610, 295), (1052, 515), (1052, 585), (870, 655), (610, 525), (527, 480)],
}


def P(L, C, z=0.0):
    v = V0 + PX_M * C
    u = U0 - PX_M * L
    return (v - u, (u + v) / 2 - Z_PX * z)


def polys(shape, ps):
    m = Image.new('L', (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(m)
    for p in ps:
        d.polygon(p, fill=255)
    return np.asarray(m) > 0


def band(shape, c0, c1, l0=-HALF_L, l1=HALF_L, z=0.0):
    xx, yy, v, u = coords(shape)
    v = v + Z_PX * z
    u = u + Z_PX * z
    C = (v - V0) / PX_M
    L = (U0 - u) / PX_M
    return (C >= c0) & (C <= c1) & (L >= l0) & (L <= l1)


def game_bed(shape, rng, v0=V0, u0=U0, js=range(-4, 5)):
    """The game's double track (prepare-railway-track-assets.py) along the line through (v0, u0), its
    gravel all across the bed, drawn at twice the size and down; tiles js (on past the five tiles,
    to the render's ends). (composite, gravel)"""
    k = 2
    H2, W2 = shape[0] * k, shape[1] * k
    s = track.TILE_M / track.TD
    X0, Y0 = v0 - u0, (u0 + v0) / 2
    out = {n: Image.new('RGBA', (W2, H2), (0, 0, 0, 0)) for n in ('gravel', 'sl', 'rl')}
    for j in js:
        layers = track.draw_tile(['X'], rng)
        Lc = 20.0 * j
        ones = np.ones_like(layers['bed'])
        for name, rgb, alpha, z in (('gravel', layers['gravel'], ones, 0.0),
                                    ('sl', layers['sleeper_rgb'], layers['sleeper_a'], 0.0),
                                    ('rl', layers['rail_rgb'], layers['rail_a'], 0.15)):
            M = np.array([[PX_M * s, -PX_M * s, X0 + PX_M * Lc],
                          [PX_M / 2 * s, PX_M / 2 * s, Y0 - Z_PX * z - PX_M / 2 * (20.0 + Lc)],
                          [0, 0, 1]]) * np.array([[k], [k], [1]])
            inv = np.linalg.inv(M)
            img = Image.fromarray(np.clip(np.concatenate([rgb, alpha[..., None] * 255], axis=2), 0, 255).astype(np.uint8), 'RGBA')
            out[name].alpha_composite(img.transform((W2, H2), Image.AFFINE, tuple(inv[0]) + tuple(inv[1]), resample=Image.BICUBIC))

    def shadow(img, dy, strength):
        a = np.asarray(img)[..., 3].astype(np.float32) / 255 * strength
        sh = np.zeros(a.shape + (4,), np.float32)
        sh[..., :3] = 25
        sh[..., 3] = np.roll(a, dy, axis=0) * 255
        return Image.fromarray(sh.astype(np.uint8), 'RGBA')
    canvas = out['gravel'].copy()
    canvas.alpha_composite(shadow(out['sl'], k, 0.35))
    canvas.alpha_composite(out['sl'])
    canvas.alpha_composite(shadow(out['rl'], 2 * k, 0.5))
    canvas.alpha_composite(out['rl'], (0, -k))
    down = lambda im: np.asarray(im.resize((shape[1], shape[0]), Image.LANCZOS))
    return down(canvas), down(out['gravel'])


def sample(a, box):
    x0, y0, x1, y1 = box
    px = a[y0:y1, x0:x1, :3].reshape(-1, 3)
    return np.median(px, 0).astype(np.float32)


def over(a, b):
    al = b[..., 3:4] / 255.0
    out = a.astype(np.float32) * (1 - al) + b.astype(np.float32) * al
    out[..., 3] = np.maximum(a[..., 3], b[..., 3])
    return out.astype(np.uint8)


def layers(want_open=False):
    """(base, front): the station behind the trains (the far platform and all beyond, the track bed -
    the game's track, as on the line) and in front of them (the near platform and all nearer, the
    stairs, the lift, the footbridge)."""
    a = np.asarray(render_s()).copy()
    rng = np.random.default_rng(20261107)
    xx, yy, v, u = coords(a.shape)
    front = (polys(a.shape, FRONT_POLYS.values()) | (v > BED_V[1])) & (a[..., 3] > 0)
    bed = (v >= BED_V[0]) & (v <= BED_V[1]) & (a[..., 3] > 0)
    base = a.copy()
    base[front] = 0
    g, gravel = game_bed(a.shape, rng)
    # past the near platform's end (L < -48) the render's ballast runs on nearer than the bed, to the
    # slab's edge: the game's gravel there, the canopy's end and its railing still in front
    L = (U0 - u) / PX_M
    rgb = a[..., :3].astype(np.int32)
    lum = rgb.mean(2)
    ballast = (rgb[..., 0] - rgb[..., 2] >= 10) & (rgb[..., 0] - rgb[..., 2] <= 75) & (lum < 135) & (rgb[..., 2] < rgb[..., 0])
    open_end = (v > BED_V[1]) & (v <= 1215) & (L < -48) & (a[..., 3] > 0) & (gravel[..., 3] > 200)
    open_end &= ~polys(a.shape, FRONT_POLYS.values()) | ballast
    base[open_end] = gravel[open_end]
    front &= ~open_end
    fr = a.copy()
    fr[~front] = 0
    if want_open:
        return base, fr, open_end
    return base, fr


# Night (Norton, 2026-11-06, as the 高架站 and the entrances: only the light it gives is seen): the
# platforms under their canopies and the concourse inside as by day - not the canopies' roofs, the
# columns, the stairs, the walls - laid over the darkened station at night (metro-surface-lines.js).
FAR_PLATFORM_V = (860, 1002)      # the far platform's paving, v, to its edge
NEAR_PLATFORM_V = (1106, 1352)    # the near platform's, from its edge to its front (the near-left canopy's floor runs deeper)
CONCOURSE_INSIDE = [
    [(940, 958), (1100, 878), (1100, 992), (940, 1072)],     # the gate hall, its open front
    [(1205, 822), (1402, 724), (1402, 830), (1205, 928)],    # the big windows
]
FAR_STAIRS = [(430, 470), (545, 452), (590, 500), (500, 715), (452, 715), (430, 690)]   # (the flight, as it slants)
NEAR_ROOFS = [
    [(335, 935), (800, 705), (800, 790), (470, 1015), (335, 1000)],
    [(1045, 585), (1586, 335), (1586, 455), (1045, 705)],
]


def lit_mask(a):
    xx, yy, v, u = coords(a.shape)
    L = (U0 - u) / PX_M
    rgb = a[..., :3].astype(np.int32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = rgb.mean(2)
    roof = (b - r >= 3) & (lum > 95)                 # the canopies' grey-blue roofs and the columns
    blue = (b - r > 30)
    wall = (lum > 150) & (np.abs(r - b) < 45) & (r - b < 40)
    far = (v >= FAR_PLATFORM_V[0]) & (v <= FAR_PLATFORM_V[1])
    near = (v >= NEAR_PLATFORM_V[0]) & (v <= NEAR_PLATFORM_V[1]) & (L >= -48)    # (not the gravel past its end)
    platforms = (far | near) & (np.abs(L) <= HALF_L + 2) & ~roof & ~blue
    platforms &= ~polys(a.shape, [FAR_STAIRS, FRONT_POLYS['stairs'], FRONT_POLYS['lift'], FRONT_POLYS['footbridge']] + NEAR_ROOFS)
    inside = polys(a.shape, CONCOURSE_INSIDE) & ~wall
    m = (platforms | inside) & (a[..., 3] > 0)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
    return m


def lit_of(layer, m):
    out = layer.astype(np.float32).copy()
    out[..., 3] = m * out[..., 3]
    return out.clip(0, 255).astype(np.uint8)


# --- the final picture (Norton, 2026-11-07: 1 格 20 米 - the render's things are some twice their size:
# a bench 4.7 m, a door 11 m): the station halved, and its platforms drawn out again to five tiles
# by repeating a plain stretch of both canopies (right of the concourse) four times. Its two tracks
# are the game's 4.5 m apart, the render's bed now a track wide: the bed is the far track (its middle
# 2.25 m from the line's), the near track under the near platform - its trains hidden there
# (metro-surface-lines.js).
K = 0.5
SLICE_L = (26.0, 36.0)            # the far side's plain stretch (S m, as on screen), repeated...
REPEATS = 10                      # ...this many times
MID_L_S = (-51.0 + 51.0 + REPEATS * (SLICE_L[1] - SLICE_L[0])) / 2   # the platforms' middle, lengthened (S m)


NEAR_SLICE_L = (-44.4, -34.6)     # the near platform's stretch to repeat (S m, as on screen): after the electrical box, a column's span - roof, lamps, fence, a column (none cut: one's top and the next one's foot do not overlap on screen)
NEAR_SLICE_V = (1050, 1400)       # (its roof to its floor's front, S v; the stairs in front taken out)


NEAR_SLICE_X = (480, 623)         # the near-left canopy's repeat, x on S: after its end column, to after the next
NEAR_CAP_V = 1350                 # the near platform's copies cut here (S v: under the cabinets)...
EDGE_TOP_V = 1300                 # ...the front edge under them from here (S v)
NEAR_ROOF_V = 1262                # the near canopy's roof: above its lamps (S v)
NEAR_ROOF_SHIFT = 2.0             # (its stretch this much further along, past the end arch)
EDGE_V = (1588, 1660)             # ...and under them the station's front edge, taken from here (S v)
EDGE_L = (-18.0, -8.0)            # (a plain stretch of it, S m)


def lengthen(img, kind='base', kind_front_main=True):
    """The picture drawn out along the line by REPEATS x SLICE_L; `pad` px added on top. The far side
    and the track bed ('base') repeat SLICE_L. The near side ('front'): the render's near-right
    canopy stands some 10 m nearer than its near-left one, its floor cut off by the render's edge -
    it is dropped, and the near-left canopy's NEAR_SLICE_L repeated from there to the far end, under
    all else on the near side (the concourse, the stairs, the lift)."""
    Ls = SLICE_L[1] - SLICE_L[0]
    total = REPEATS * Ls
    dx, dy = PX_M * total, PX_M / 2 * total
    pad = int(np.ceil(dy)) + 2
    h, w = img.shape[:2]
    out = Image.new('RGBA', (w + int(np.ceil(dx)) + 2, h + pad), (0, 0, 0, 0))
    xx, yy, v, u = coords(img.shape)
    L = (U0 - u) / PX_M

    def part(mask, shift_m):
        a = img.copy()
        a[~mask] = 0
        out.alpha_composite(Image.fromarray(a), (int(round(PX_M * shift_m)), pad - int(round(PX_M / 2 * shift_m))))
    if kind == 'front':
        near_right = (L > 14) & (v > 1075) & (xx > 1035)
        # the near-left canopy from its end column to the next column, past the electrical box (Norton,
        # 2026-11-07: 重複呢段到電箱為止), cut upright on screen so no column, cabinet or roof is sliced
        # through; each copy a column's spacing on along the line
        x0, x1 = NEAR_SLICE_X
        dxp = x1 - x0
        n = dxp / PX_M
        nl = (xx >= x0) & (xx < x1) & (v >= NEAR_SLICE_V[0]) & (v <= NEAR_CAP_V)
        # (the render's near platform edge is not along the line: each copy cut straight at NEAR_CAP_V;
        # under them, drawn first, the station's own front edge - the paving, the kerb, its face at the
        # bottom right, along the line; Norton: 用右下角的路邊收邊)
        edge = (v >= EDGE_V[0]) & (v <= EDGE_V[1]) & (L > EDGE_L[0]) & (L <= EDGE_L[1])
        lift_px = EDGE_TOP_V - EDGE_V[0]
        end_l = 51.0 + total
        en = EDGE_L[1] - EDGE_L[0]
        e = img.copy()
        e[~edge] = 0
        k = 0
        while (U0 - (EDGE_TOP_V - 0.5 * (x1 + PX_M * en * k))) / PX_M < end_l + en:
            shift = (x1 - x0) / PX_M + (EDGE_L[1] - EDGE_L[0]) * k - 30.0
            out.alpha_composite(Image.fromarray(e), (int(round(PX_M * shift + lift_px)), pad - int(round(PX_M / 2 * shift)) + int(round(lift_px / 2))))
            k += 1
            if k > 40: break
        k = 1
        while True:
            shift = n * k
            m = nl & (L + shift <= end_l)
            if not m.any():
                break
            part(m, shift)
            k += 1
        part(~near_right, 0)
        return np.asarray(out), pad
    part(L <= SLICE_L[0], 0)
    for k in range(REPEATS + 1):
        part((L > SLICE_L[0]) & (L <= SLICE_L[1]), Ls * k)
    part(L > SLICE_L[1], total)
    return np.asarray(out), pad


def shrink(img):
    h, w = img.shape[:2]
    return np.asarray(Image.fromarray(np.ascontiguousarray(img)).resize((round(w * K), round(h * K)), Image.LANCZOS))


def final_layers():
    """{base, front, base_lit, front_lit} at the final size, and the frame there: (v0, u0) the track
    tile's middle on the ground (12.8 px a game metre, as everywhere)."""
    base, front, open_end = layers(want_open=True)
    m = lit_mask(np.asarray(render_s()))
    op = np.zeros(base.shape, np.uint8)
    op[..., 3] = open_end * 255
    out = {'base': base, 'front': front, 'base_lit': lit_of(base, m), 'front_lit': lit_of(front, m), 'open': op}
    for name in out:
        out[name], pad = lengthen(out[name], 'front' if name.startswith('front') else 'base', name == 'front')
        out[name] = shrink(out[name])
    v0 = K * (V0 + pad) + PX_M * 2.25
    u0 = K * (U0 + pad - PX_M * MID_L_S)
    # the bed: the game's track (its far track along the render's bed), on the base where it has the bed
    b = out['base'].copy()
    xx, yy, v, u = coords(b.shape)
    g, _ = game_bed(b.shape, np.random.default_rng(20261107), v0, u0, range(-4, 5))
    bed = (v >= K * (BED_V[0] + pad)) & (v <= K * (BED_V[1] + pad)) & (b[..., 3] > 0) & (g[..., 3] > 200)
    # and past the near platform's end, the near track on its way in under it (Norton: 路軌斷格)
    bed |= (out.pop('open')[..., 3] > 128) & (b[..., 3] > 0) & (g[..., 3] > 200)
    b[bed] = g[bed]
    out['base'] = b
    return out, (v0, u0)


OUT = ROOT / 'Models/metroPlatform'
ART_JS = ROOT / 'metro-ground-station-art.js'
POW2_H = 1024
GUTTER = 8


def pow2(v):
    return 1 << max(0, int(v - 1).bit_length())


def strips(shape, alpha, frame):
    """The five track tiles' upright strips, left to right as drawn: [(box, anchor)] - each a tile
    wide about its middle, the end ones taking all beyond; anchor: the tile's middle on the ground."""
    w = shape[1]
    v0, u0 = frame
    at = lambda L: ((v0) - (u0 - PX_M * L), ((u0 - PX_M * L) + v0) / 2)
    centres = sorted(at(20.0 * j) for j in range(-2, 3))
    out = []
    for k, (cx, cy) in enumerate(centres):
        x0 = 0 if k == 0 else int(round(cx - 128))
        x1 = w if k == 4 else int(round(cx + 128))
        ys, xs = np.nonzero(alpha[:, x0:x1] > 0)
        y0, y1 = ys.min(), ys.max() + 1
        xa, xb = x0 + xs.min(), x0 + xs.max() + 1
        out.append(((int(xa), int(y0), int(xb), int(y1)), (float(cx), float(cy))))
    return out


def main():
    import json
    out, frame = final_layers()
    base, front, base_lit, front_lit = out['base'], out['front'], out['base_lit'], out['front_lit']
    alpha = np.maximum(base[..., 3], front[..., 3])
    cut = strips(base.shape, alpha, frame)
    tallest = max(y1 - y0 for (_, y0, _, y1), _ in cut)
    # (and a middle strip, a tile wide, inside 256 with its gutters)
    scale = min((POW2_H - 2 * GUTTER - 2) / tallest, (256 - 2 * GUTTER - 2) / 256)
    art = {}
    for axis, flip in (('x', False), ('y', True)):
        lay = {}
        for name, img in (('base', base), ('front', front), ('base_lit', base_lit), ('front_lit', front_lit)):
            img = img[:, ::-1] if flip else img
            H0, W0 = img.shape[:2]
            lay[name] = np.asarray(Image.fromarray(np.ascontiguousarray(img)).resize((round(W0 * scale), round(H0 * scale)), Image.LANCZOS))
        boxes = cut
        if flip:
            W = base.shape[1]
            boxes = sorted(((W - x1, y0, W - x0, y1), (W - cx, cy)) for (x0, y0, x1, y1), (cx, cy) in cut)
        pieces = []
        for k, ((x0, y0, x1, y1), (cx, cy)) in enumerate(boxes):
            X0, X1 = round(x0 * scale), round(x1 * scale)
            Y0, Y1 = int(np.floor(y0 * scale)), int(np.ceil(y1 * scale))
            w, h = X1 - X0, Y1 - Y0
            cw, ch = pow2(w + 2 * GUTTER), pow2(h + 2 * GUTTER)
            px, py = (cw - w) // 2, ch - h - GUTTER
            entry = {'anchor': [round(cx * scale - X0 + px, 1), round(cy * scale - Y0 + py, 1)], 'size': [cw, ch], 'scale': round(scale, 6)}
            for name, img in lay.items():
                key = f'metro_ground_station_{axis}_{k}_{name}'
                canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
                canvas.paste(Image.fromarray(np.ascontiguousarray(img[Y0:Y1, X0:X1])), (px, py))
                canvas.save(OUT / f'{key}.png')
                entry[name] = {'key': key, 'path': f'Models/metroPlatform/{key}.png'}
            pieces.append(entry)
        art[axis] = pieces
    ART_JS.write_text(
        '// Generated by scripts/prepare-metro-ground-station-assets.py - the 地面站 from Norton\'s render, in\n'
        '// five upright strips left to right as drawn (x: the line up-right; y: its mirror), each a base\n'
        '// layer (the far side and the track bed, before the trains) and a front layer (the near platform,\n'
        '// the footbridge\'s span, the concourse: after them); anchor: the track tile\'s middle on the\n'
        '// ground; each a power of two each way, drawn at `scale` of a 512-px tile.\n'
        f'const METRO_GROUND_STATION_ART = Object.freeze({json.dumps(art, indent=2, ensure_ascii=False)});\n'
        "if (typeof module !== 'undefined') module.exports = { METRO_GROUND_STATION_ART };\n", encoding='utf-8')
    print('done', base.shape, 'scale', round(scale, 4))


if __name__ == '__main__' and '--s' in sys.argv:
    render_s().save(sys.argv[-1])
elif __name__ == '__main__' and '--night' in sys.argv:
    b, f = layers()
    m = lit_mask(np.asarray(render_s()))
    im = np.zeros(b.shape, np.float32); im[..., :3] = (14, 20, 22); im[..., 3] = 255
    for l in (b, f):
        d = l.astype(np.float32); d[..., :3] *= 0.42
        al = d[..., 3:4] / 255; im[..., :3] = im[..., :3] * (1 - al) + d[..., :3] * al
        lt = lit_of(l, m).astype(np.float32); la = lt[..., 3:4] / 255
        im[..., :3] = im[..., :3] * (1 - la) + lt[..., :3] * la
    Image.fromarray(im.clip(0, 255).astype(np.uint8)).convert('RGB').save(sys.argv[-1], quality=90)
elif __name__ == '__main__' and '--final' in sys.argv:
    out, frame = final_layers()
    for name, layer_list, bgc in (('', ('base', 'front'), (110, 124, 84, 255)), ('-front', ('front',), (255, 0, 255, 255))):
        im = Image.new('RGBA', (out['base'].shape[1], out['base'].shape[0]), bgc)
        for l in layer_list:
            im.alpha_composite(Image.fromarray(out[l]))
        im.convert('RGB').save(sys.argv[-1].replace('.jpg', f'{name}.jpg'), quality=90)
    print('frame', frame, out['base'].shape)
elif __name__ == '__main__' and '--preview' in sys.argv:
    b, f = layers()
    out = sys.argv[-1]
    for name, layer_list in (('', (b, f)), ('-base', (b,)), ('-front', (f,))):
        im = Image.new('RGBA', (b.shape[1], b.shape[0]), (255, 0, 255, 255) if name else (110, 124, 84, 255))
        for l in layer_list:
            im.alpha_composite(Image.fromarray(l))
        im.convert('RGB').save(out.replace('.jpg', f'{name}.jpg'), quality=90)
elif __name__ == '__main__':
    main()
