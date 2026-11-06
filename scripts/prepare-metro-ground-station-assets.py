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
# up-right), 0 at the station's middle; Z_PX px a metre up
V0, U0 = 943.7, 150.0             # C 0: the far platform's edge at C -4; L 0: the platforms' middle
Z_PX = 10.0
HALF_L = 50.0                     # five tiles
FAR_EDGE_C = -4.0                 # the far platform's edge (its face down to the ballast below)
BED_C = (-3.05, 4.0)              # the track bed, from under the far platform's face to the near's edge
NEAR_PLATFORM = (4.0, 7.6, 45.0)  # the near platform: C from, to; half its length
PLATFORM_Z = 1.1
NEAR_SIDE_C = 30.0                # the forecourt cut here (the station takes one tile beside the track)

# what stands nearer than the track - drawn after the trains - besides all on the ground past the
# near platform: the footbridge's span over the tracks, the lift, the escalator, the concourse's roofs
FRONT_POLYS = {
    'footbridge': [(425, 250), (525, 222), (862, 398), (862, 505), (828, 510), (528, 425), (425, 418)],
    'lift': [(843, 352), (968, 352), (968, 598), (905, 616), (843, 596)],
    'escalator': [(436, 744), (728, 474), (842, 498), (842, 625), (668, 702), (520, 862), (436, 862)],
    'annex': [(658, 688), (1118, 548), (1192, 572), (1192, 835), (658, 835)],
    'concourse': [(958, 470), (1180, 382), (1342, 448), (1342, 705), (958, 705)],
}
FOOTBRIDGE_FRONT_V = 800          # (its columns, on the far platform, stay behind)


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


def game_bed(shape, rng):
    """The game's double track (prepare-railway-track-assets.py) along the station, its gravel all
    across the bed, drawn into S at twice the size and down."""
    k = 2
    H2, W2 = shape[0] * k, shape[1] * k
    s = track.TILE_M / track.TD
    X0, Y0 = V0 - U0, (U0 + V0) / 2
    out = {n: Image.new('RGBA', (W2, H2), (0, 0, 0, 0)) for n in ('gravel', 'sl', 'rl')}
    for j in range(-2, 3):
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
    return np.asarray(canvas.resize((shape[1], shape[0]), Image.LANCZOS))


def sample(a, box):
    x0, y0, x1, y1 = box
    px = a[y0:y1, x0:x1, :3].reshape(-1, 3)
    return np.median(px, 0).astype(np.float32)


def near_platform(shape, a, rng):
    """The near platform, as the far one: its paving, the yellow strip, the coping at its edge; its
    face to the viewer and its end."""
    c0, c1, hl = NEAR_PLATFORM
    z = PLATFORM_Z
    paving = sample(a, (1150, 250, 1190, 262))     # (the far platform's paving, in the open)
    yellow = sample(a, (300, 690, 330, 705))
    out = Image.new('RGBA', (shape[1], shape[0]), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    col = lambda c, k=1.0: tuple(int(v) for v in np.clip(c * k, 0, 255)) + (255,)
    # the face to the viewer (C = c1) and the end at -L (both towards the viewer)
    d.polygon([P(-hl, c1, z), P(hl, c1, z), P(hl, c1, 0), P(-hl, c1, 0)], fill=col(paving, 0.62))
    d.polygon([P(-hl, c0, z), P(-hl, c1, z), P(-hl, c1, 0), P(-hl, c0, 0)], fill=col(paving, 0.75))
    # the top: paving, the coping along the edge, the tactile strip
    d.polygon([P(-hl, c0, z), P(hl, c0, z), P(hl, c1, z), P(-hl, c1, z)], fill=col(paving))
    d.polygon([P(-hl, c0, z), P(hl, c0, z), P(hl, c0 + 0.3, z), P(-hl, c0 + 0.3, z)], fill=col(paving, 1.12))
    d.polygon([P(-hl + 0.6, c0 + 0.6, z), P(hl - 0.6, c0 + 0.6, z), P(hl - 0.6, c0 + 1.0, z), P(-hl + 0.6, c0 + 1.0, z)], fill=col(yellow))
    o = np.asarray(out).astype(np.float32)
    noise = rng.normal(0, 1, o.shape[:2]).astype(np.float32)
    o[..., :3] *= (1 + 0.035 * noise)[..., None]
    return np.clip(o, 0, 255).astype(np.uint8)


def over(a, b):
    al = b[..., 3:4] / 255.0
    out = a.astype(np.float32) * (1 - al) + b.astype(np.float32) * al
    out[..., 3] = np.maximum(a[..., 3], b[..., 3])
    return out.astype(np.uint8)


def layers():
    """(base, front): the station behind the trains (the far side, the track bed) and in front of them
    (the near platform, the footbridge's span, all of the near side)."""
    a = np.asarray(render_s()).copy()
    rng = np.random.default_rng(20261107)
    xx, yy, v, u = coords(a.shape)
    Cs = (v - V0) / PX_M                          # (C as on the screen: the ground's, for what is on it)
    # the cut forecourt
    a[Cs > NEAR_SIDE_C] = 0
    front_objects = np.zeros(a.shape[:2], bool)
    for name, poly in FRONT_POLYS.items():
        m = polys(a.shape, [poly])
        if name == 'footbridge':
            m &= v >= FOOTBRIDGE_FRONT_V
        front_objects |= m
    front_objects &= a[..., 3] > 0
    # base: the render with its track bed replaced by the game's, all from under the far platform's
    # face to the near platform's edge; nothing nearer
    base = a.copy()
    bed = band(a.shape, *BED_C)
    g = game_bed(a.shape, rng)
    base[bed] = g[bed]
    base[bed, 3] = 255
    base[(Cs > BED_C[1]) & ~bed] = 0
    # (the render's own track past the five tiles: off)
    L = (U0 - u) / PX_M
    base[(Cs >= BED_C[0]) & (Cs <= BED_C[1]) & (np.abs(L) > HALF_L)] = 0
    base[front_objects & ~bed] = 0
    # front: the near platform, then the render's near side over it
    front = near_platform(a.shape, a, rng)
    keep = (front_objects | (Cs > NEAR_PLATFORM[1])) & (a[..., 3] > 0)
    rend = a.copy()
    rend[~keep] = 0
    front = over(front, rend)
    return base, front


OUT = ROOT / 'Models/metroPlatform'
ART_JS = ROOT / 'metro-ground-station-art.js'
POW2_H = 1024
GUTTER = 8


def pow2(v):
    return 1 << max(0, int(v - 1).bit_length())


def strips(shape, alpha):
    """The five track tiles' upright strips, left to right as drawn: [(box, anchor)] - each a tile
    wide about its middle, the end ones taking all beyond; anchor: the tile's middle on the ground."""
    w = shape[1]
    centres = sorted(P(20.0 * j, 0.0) for j in range(-2, 3))
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
    base, front = layers()
    alpha = np.maximum(base[..., 3], front[..., 3])
    cut = strips(base.shape, alpha)
    tallest = max(y1 - y0 for (_, y0, _, y1), _ in cut)
    # (and a middle strip, a tile wide, inside 256 with its gutters)
    scale = min((POW2_H - 2 * GUTTER - 2) / tallest, (256 - 2 * GUTTER - 2) / 256)
    art = {}
    for axis, flip in (('x', False), ('y', True)):
        lay = {}
        for name, img in (('base', base), ('front', front)):
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
elif __name__ == '__main__' and '--preview' in sys.argv:
    b, f = layers()
    im = Image.new('RGBA', (b.shape[1], b.shape[0]), (110, 124, 84, 255))
    im.alpha_composite(Image.fromarray(b))
    im.alpha_composite(Image.fromarray(f))
    im.convert('RGB').save(sys.argv[-1], quality=90)
elif __name__ == '__main__':
    main()
