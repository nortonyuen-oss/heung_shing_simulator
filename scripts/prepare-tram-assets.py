"""電車 renders squared to the game's 2:1 isometric (Norton, 2026-11-08: 以車窗為基礎修正 isometric 比例;
用上層窗框（氣窗架）做 reference; 唔好 squeezed).

The renders are seen from a lower camera than the game's (their ground lines slope about 0.34, the
game's 0.5: about 20 degrees up against 30). Raising the camera changes things on the ground plane and
upright things differently - horizontal positions not at all, a horizontal surface (the roof) seen
deeper by 0.5 / 0.34, an upright face shorter by cos 30 / cos 20 - so one skew and one x:y scale for
the whole picture (as for a building) stretched the sides 1.47 times taller and squeezed the tram.

So, column by column about the roof's near edge (the line the sides meet the roof along): below it
(the sides, the cab's end) scaled by the uprights' factor, above it (the roof) by the roof's, the edge
itself laid at 0.5 each way from the corner; nothing moves across. The slopes are the upper deck's
window frames (the 氣窗架, Norton's reference) on each face; the near roof edge is found where the
roof's grey meets the body's colour, set at those slopes.

Reads scripts/source-art/tramways/original/ (Norton's renders, kept as they are), writes the squared
pictures at full size to scripts/source-art/tramways/squared/ (to look at) and the game's textures to
Models/tramways/: each a power-of-two canvas (512) with an 8-px clear margin and the colour carried
out under its clear pixels - Phaser repeats a power-of-two texture at its edges and mipmaps it, and a
clear pixel's colour is blended in at the edge when it is drawn small (Norton: 2 嘅次方，唔係會起白邊).
Run: .venv/bin/python -B scripts/prepare-tram-assets.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'scripts/source-art/tramways/original'
OUT = ROOT / 'scripts/source-art/tramways/squared'
GAME = ROOT / 'Models/tramways'
TEX = 512
GUTTER = 8
# which way each render's long side runs: 'fall' its cab at the lower right, 'rise' at the lower left
VIEWS = {'tramOrigin1': 'fall', 'tramStyle01': 'fall', 'tramOrigin2': 'rise', 'tramStyle02': 'rise', 'tramStyle03': 'rise'}
END_SHARE = 0.17          # the cab end's share of the tram's width as drawn
PERSPECTIVE = 0.008       # half the usual upper/lower deck difference


def cream_edges(a):
    """The window frames (cream) and their top and bottom edges."""
    rgb = a[..., :3].astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cream = (r > 175) & (g > 160) & (b > 120) & (r - b > 15) & (r - b < 80) & (np.abs(r - g) < 35) & (a[..., 3] > 200)
    up = np.zeros_like(cream); up[1:] = cream[1:] & ~cream[:-1]
    dn = np.zeros_like(cream); dn[:-1] = cream[:-1] & ~cream[1:]
    return cream, up | dn


def best_slope(ys, xs, lo, hi, step=0.001):
    """The slope that lines the most edge pixels up (their intercepts the most bunched)."""
    best = (0.0, None)
    for s in np.arange(lo, hi, step):
        c = ys - s * xs
        h = np.bincount(np.round(c - c.min()).astype(int)).astype(np.float64)
        score = float((h ** 2).sum())
        if score > best[0]:
            best = (score, s)
    return float(best[1])


def slopes(a, view):
    """(long side, cab end) slopes, y down a px across."""
    _, edge = cream_edges(a)
    ys, xs = np.nonzero(edge)
    ys, xs = ys.astype(np.float64), xs.astype(np.float64)
    x0, x1 = xs.min(), xs.max()
    w = x1 - x0
    sign = 1 if view == 'fall' else -1
    side_rng = (0.08, 0.85) if sign > 0 else (-0.85, -0.08)
    end_rng = (-0.85, -0.05) if sign > 0 else (0.05, 0.85)
    if sign > 0:
        side = (xs > x0 + 0.05 * w) & (xs < x1 - (END_SHARE + 0.02) * w)
        end = xs >= x1 - END_SHARE * w
    else:
        side = (xs < x1 - 0.05 * w) & (xs > x0 + (END_SHARE + 0.02) * w)
        end = xs <= x0 + END_SHARE * w
    mid = np.median(ys[side])
    up, lo = side & (ys < mid), side & (ys >= mid)
    s_up, s_lo = best_slope(ys[up], xs[up], *side_rng), best_slope(ys[lo], xs[lo], *side_rng)
    s_side = (s_up + s_lo) / 2 if abs(s_up - s_lo) < 0.03 else s_up - sign * PERSPECTIVE
    s_end = best_slope(ys[end], xs[end], *end_rng)
    return s_side, s_end, (s_up, s_lo)


def roof_edge_points(a):
    """Each column: from the top of the tram down, past the roof (unsaturated), the first of three
    saturated pixels in a row - the body's colour under the roof's near edge."""
    rgb = a[..., :3].astype(np.float32)
    al = a[..., 3] > 200
    sat = rgb.max(2) - rgb.min(2)
    h, w = al.shape
    pts = []
    for x in range(w):
        col = al[:, x]
        if not col.any():
            continue
        y, roof = int(col.argmax()), 0
        while y < h - 3 and al[y, x]:
            if sat[y, x] < 24:
                roof += 1
            elif roof >= 10 and min(sat[y, x], sat[y + 1, x], sat[y + 2, x]) >= 30:
                pts.append((x, y))
                break
            y += 1
    return np.array(pts, float)


def face_columns(a, view):
    """The long side's columns and the cab end's, as drawn."""
    cream, _ = cream_edges(a)
    xs = np.nonzero(cream.any(0))[0]
    x0, x1 = xs.min(), xs.max()
    w = x1 - x0
    if view == 'fall':
        return (x0 + 0.1 * w, x1 - 0.3 * w), (x1 - 0.12 * w, x1 - 0.02 * w)
    return (x0 + 0.3 * w, x1 - 0.1 * w), (x0 + 0.02 * w, x0 + 0.12 * w)


def geometry(a, view):
    """The upper deck's window frames' slopes (side, end) and the roof's near edge at those slopes:
    its intercepts and the corner."""
    _, edge = cream_edges(a)
    edge_pts = roof_edge_points(a)
    (sa, sb), (ea, eb) = face_columns(a, view)
    sign = 1 if view == 'fall' else -1

    def intercept(xs, ys, s):
        c = ys - s * xs
        med = np.median(c)
        return float(np.median(c[np.abs(c - med) < 6]))

    def frames_slope(lo, hi, rng):
        # the frames just under the roof's edge (the upper deck's window heads and 氣窗架)
        ex, ey = edge_pts[:, 0], edge_pts[:, 1]
        m = (ex >= lo) & (ex < hi)
        roof_c = intercept(ex[m], ey[m], (rng[0] + rng[1]) / 2)
        ys, xs = np.nonzero(edge)
        ys, xs = ys.astype(np.float64), xs.astype(np.float64)
        mid = (rng[0] + rng[1]) / 2
        band = (xs >= lo) & (xs < hi) & (ys - mid * xs > roof_c + 8) & (ys - mid * xs < roof_c + 95)
        return best_slope(ys[band], xs[band], *rng)

    s_side = frames_slope(sa, sb, (0.25, 0.45) if sign > 0 else (-0.45, -0.25))
    s_end = frames_slope(ea, eb, (-0.5, -0.2) if sign > 0 else (0.2, 0.5))
    ex, ey = edge_pts[:, 0], edge_pts[:, 1]
    ms, me = (ex >= sa) & (ex < sb), (ex >= ea) & (ex < eb)
    c_side, c_end = intercept(ex[ms], ey[ms], s_side), intercept(ex[me], ey[me], s_end)
    xc = (c_end - c_side) / (s_side - s_end)
    return dict(s_side=s_side, s_end=s_end, c_side=c_side, c_end=c_end, xc=xc, yc=c_side + s_side * xc, view=view)


def square(img, g, points=()):
    """Column by column about the roof's near edge: the sides scaled as uprights, the roof as a
    level surface, the edge laid at 0.5 each way from the corner; nothing moves across."""
    a = np.asarray(img).astype(np.float32) / 255.0
    h, w = a.shape[:2]
    m = (abs(g['s_side']) + abs(g['s_end'])) / 2           # the render's ground slope (sin of its camera's angle up)
    upright = np.cos(np.arcsin(0.5)) / np.cos(np.arcsin(m))
    level = 0.5 / m
    xs = np.arange(w, dtype=np.float64)
    fall = g['view'] == 'fall'
    # the near edge as drawn and as it is to be
    side_x = xs <= g['xc'] if fall else xs >= g['xc']
    edge = np.where(side_x, g['c_side'] + g['s_side'] * xs, g['c_end'] + g['s_end'] * xs)
    # (the corner the edge's lowest point, rising 0.5 each way from it, either view)
    edge_new = g['yc'] - 0.5 * np.abs(xs - g['xc'])
    # (where each column's picture lands: its top over the edge by `level`, its foot under by `upright`)
    top_new = edge_new - level * edge
    bot_new = edge_new + upright * (h - edge)
    y0, y1 = int(np.floor(top_new.min())) - 2, int(np.ceil(bot_new.max())) + 2
    H = y1 - y0
    pm = a.copy()
    pm[..., :3] *= pm[..., 3:4]                               # (premultiplied, so edges blend clean)
    out = np.zeros((H, w, 4), np.float32)
    yo = np.arange(y0, y1, dtype=np.float64)
    for x in range(w):
        e, en = edge[x], edge_new[x]
        yi = np.where(yo >= en, e + (yo - en) / upright, e - (en - yo) / level)
        ok = (yi >= 0) & (yi <= h - 1)
        if not ok.any():
            continue
        for ch in range(4):
            out[ok, x, ch] = np.interp(yi[ok], np.arange(h), pm[:, x, ch])
    alpha = out[..., 3:4]
    out[..., :3] = np.where(alpha > 1e-4, out[..., :3] / np.maximum(alpha, 1e-4), 0)
    im = Image.fromarray((out.clip(0, 1) * 255).round().astype(np.uint8), 'RGBA')
    box = im.getbbox()
    # (points of the picture carried the same way: down its column from the roof's edge)
    mapped = []
    for px, py in points:
        x = int(round(px))
        yo = edge_new[x] + (upright * (py - edge[x]) if py >= edge[x] else -level * (edge[x] - py))
        mapped.append((px - box[0], yo - y0 - box[1]))
    return im.crop(box), upright, level, mapped


# The lamps (Norton, 2026-11-08: 晚上一個大車頭燈，由後面望兩邊兩個紅燈 - as Hong Kong's trams: one round
# headlamp low in the middle of the dash, a red lamp at each lower corner), read off the renders (source
# px): the headlamp's middle and the two red lamps'. tramOrigin2 is tramOrigin1 mirrored (1536 wide).
TRAM_LAMPS = {
    'tramOrigin1': {'head': (1149, 864), 'tails': [(1064, 912), (1206, 862)]},
    'tramOrigin2': {'head': (1535 - 1149, 864), 'tails': [(1535 - 1064, 912), (1535 - 1206, 862)]},
    'tramStyle01': {'head': (1145, 942), 'tails': [(1051, 981), (1206, 922)]},
    'tramStyle02': {'head': (287, 952), 'tails': [(222, 949), (381, 1009)]},
    'tramStyle03': {'head': (384, 861), 'tails': [(326, 861), (471, 915)]},
}
LAMPS_SQUARED = {}


# Each livery both ways (Norton, 2026-11-08: 廣告車身另一個方向先用鏡像): 'fall' the cab at the lower
# right, 'rise' at the lower left; a livery drawn one way only is mirrored for the other (its words read
# backwards).
LIVERIES = {
    'green': {'fall': 'tramOrigin1', 'rise': 'tramOrigin2'},
    'hss': {'fall': 'tramStyle01'},
    'lan': {'rise': 'tramStyle02'},
    'nightday': {'rise': 'tramStyle03'},
}
# The game's size: a tram's footprint as wide on screen as a bus's picture (bus 12 m, 45 px), then
# 80% (Norton, 2026-11-08: 太大, 縮到 80%).
TRAM_SCREEN_PX = 48 * 0.8
ART_JS = ROOT / 'tram-art.js'


def ground_anchor(img, view):
    """The middle of the tram's footprint on the ground, in the picture's px: the near ground corner is
    where the lowest points along the long side (the wheels) and along the cab end (the bumper) meet,
    at 0.5 each way; the footprint runs from it to the body's two outermost columns. Also the
    footprint's width on screen."""
    a = np.asarray(img)
    al = a[..., 3] > 128
    g = geometry(a, view)
    h, w = al.shape
    # (the body: the rows under the roof's near corner - not the trolley pole)
    rows = al[int(g['yc']):, :]
    cols = np.nonzero(rows.any(0))[0]
    x0, x1 = float(cols.min()), float(cols.max())
    low = np.array([h - 1 - np.argmax(al[::-1, x]) if al[:, x].any() else -1 for x in range(w)], float)
    xs = np.arange(w, dtype=float)
    fall = view == 'fall'
    xc = g['xc']
    side = (xs < xc - 8) & (xs > x0) if fall else (xs > xc + 8) & (xs < x1)
    end = (xs > xc + 4) & (xs < x1) if fall else (xs < xc - 4) & (xs > x0)
    s_side, s_end = (-0.5, 0.5) if fall else (0.5, -0.5)   # going away from the corner, up the screen
    # the lines at 0.5 touching the lowest points from below
    c_side = float(np.max(low[side] - s_side * xs[side]))
    c_end = float(np.max(low[end] - s_end * xs[end]))
    xg = (c_end - c_side) / (s_side - s_end)
    yg = c_side + s_side * xg
    side_dx = (xg - x0) if fall else (x1 - xg)
    end_dx = (x1 - xg) if fall else (xg - x0)
    cx = xg + ((-side_dx + end_dx) / 2 if fall else (side_dx - end_dx) / 2)
    cy = yg - 0.5 * (side_dx + end_dx) / 2
    return (cx, cy), x1 - x0


def stop_light_layer(out, canopy_px):
    """The stop at night (Norton, 2026-11-08: 車站嘅燈好似光管): the light fittings under the canopy (the
    bright warm-white bars), lit - their own pixels, a soft glow round them, and a pool of light on the
    platform under each (the canopy's height below it, long along the stop). Added over the stop by the
    night's strength. Returns the layer and the tubes found."""
    a = np.asarray(out).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    lum = rgb.mean(2)
    sat = rgb.max(2) - rgb.min(2)
    # (warm white, red well over blue - the canopy's own highlights are cool, red and blue alike)
    bright = (al > 200) & (lum > 228) & (sat < 70) & (rgb[..., 0] - rgb[..., 2] > 18)
    # the tubes: bright blobs longer than they are tall, of some size
    h, w = bright.shape
    seen = np.zeros_like(bright)
    tubes = []
    for y0, x0 in zip(*np.nonzero(bright)):
        if seen[y0, x0]:
            continue
        stack, comp = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and bright[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stack.append((yy, xx))
        ys, xs = np.array(comp).T
        if 120 <= len(comp) <= 2500 and (xs.max() - xs.min()) > 1.3 * (ys.max() - ys.min()):
            tubes.append((xs.mean(), ys.mean(), xs.min(), xs.max(), comp))
    # (they hang in a row along the stop: a bright thing off that line - the sign's panel - is not one)
    if tubes:
        c = np.array([cy - 0.5 * cx for cx, cy, *_ in tubes])
        tubes = [tb for tb, ci in zip(tubes, c) if abs(ci - np.median(c)) < 40]
    tube_mask = np.zeros((h, w), bool)
    for *_, comp in tubes:
        ys, xs = np.array(comp).T
        tube_mask[ys, xs] = True
    from PIL import ImageFilter
    tube_img = Image.fromarray((tube_mask * 255).astype(np.uint8))
    glow = np.asarray(tube_img.filter(ImageFilter.GaussianBlur(10)), np.float32) / 255.0
    # the pools: on the floor under each tube, as a long soft ellipse on the ground (2:1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    pool = np.zeros((h, w), np.float32)
    for cx, cy, x0, x1, comp in tubes:
        fx, fy = cx, cy + canopy_px
        dx, dy = xx - fx, yy - fy
        u = (dx + 2 * dy) / 2          # along the stop (the fall axis), ground px
        v = (-dx + 2 * dy) / 2         # across it
        pool += np.exp(-(u / (0.9 * (x1 - x0))) ** 2 - (v / 26.0) ** 2)
    pool = np.clip(pool, 0, 1) * (al > 30)
    warm = np.array([255, 236, 196], np.float32)
    layer = np.zeros((h, w, 4), np.float32)
    strength = np.clip(tube_mask * 1.0 + glow * 1.6 + pool * 0.4, 0, 1)
    layer[..., :3] = warm
    layer[..., 3] = strength * 255
    return Image.fromarray(layer.round().astype(np.uint8), 'RGBA'), [(round(cx, 1), round(cy, 1)) for cx, cy, *_ in tubes]


def game_texture(img):
    """A picture on a power-of-two canvas TEX wide: scaled to fit inside an 8-px clear margin
    (premultiplied, so the edges do not darken), the colour of its edge carried out under the clear
    pixels. Returns the texture, its scale and where the picture's corner lands."""
    # (the picture's own extent, not its clear border)
    bx0, by0, bx1, by1 = Image.fromarray((np.asarray(img)[..., 3] > 8).astype(np.uint8) * 255).getbbox()
    img = img.crop((bx0, by0, bx1, by1))
    f = min((TEX - 2 * GUTTER) / img.width, (TEX - 2 * GUTTER) / img.height)
    w, h = max(1, round(img.width * f)), max(1, round(img.height * f))
    small = img.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
    H = 1
    while H < h + 2 * GUTTER:
        H *= 2
    canvas = Image.new('RGBA', (TEX, H), (0, 0, 0, 0))
    ox, oy = (TEX - w) // 2, (H - h) // 2
    canvas.paste(small, (ox, oy))
    a = np.asarray(canvas).astype(np.float32)
    # (seeded from the pixels at least an eighth solid: a nearly clear one's colour is lost in rounding)
    solid = a[..., 3] >= 32
    known = solid.copy()
    rgb = a[..., :3] * known[..., None]
    # (every clear pixel: the mipmaps average wide areas when the texture is drawn small)
    while not known.all():
        acc = np.zeros_like(rgb); cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(rgb * known[..., None], dy, 0), dx, 1)
            cnt += np.roll(np.roll(known, dy, 0), dx, 1)
        new = ~known & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        known |= new
    a[..., :3] = np.where(solid[..., None], a[..., :3], rgb)
    return Image.fromarray(a.clip(0, 255).round().astype(np.uint8), 'RGBA'), f, (ox - bx0 * f, oy - by0 * f)


def write_art():
    art = {}
    for livery, views in LIVERIES.items():
        for view in ('fall', 'rise'):
            other = 'rise' if view == 'fall' else 'fall'
            src = views.get(view)
            img = Image.open(OUT / f'{src or views[other]}.png').convert('RGBA')
            (ax, ay), body = ground_anchor(img, view if src else other)
            lamps = LAMPS_SQUARED[src or views[other]]
            head, tails = lamps['head'], list(lamps['tails'])
            if not src:
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
                ax = img.width - ax
                head = (img.width - head[0], head[1])
                tails = [(img.width - x, y) for x, y in tails]
            name = f'tram_{livery}_{view}'
            tex, f, (ox, oy) = game_texture(img)
            tex.save(GAME / f'{name}.png')
            art[f'{livery}_{view}'] = {
                'path': f'Models/tramways/{name}.png', 'key': name,
                'anchor': [round(ax * f + ox, 1), round(ay * f + oy, 1)], 'size': [tex.width, tex.height],
                # (the lamps at night: the headlamp seen from the front, the two red seen from behind)
                'head': [round(head[0] * f + ox, 1), round(head[1] * f + oy, 1)],
                'tails': [[round(x * f + ox, 1), round(y * f + oy, 1)] for x, y in tails],
                # (on screen: the footprint TRAM_SCREEN_PX across at TILE_WIDTH 100)
                'scale': round(TRAM_SCREEN_PX / (body * f), 5),
            }
            print(name, img.size, 'anchor', art[f'{livery}_{view}']['anchor'], 'body', round(body))
    import json
    ART_JS.write_text(
        '// Generated by scripts/prepare-tram-assets.py - the 電車: each livery both ways (fall: the cab at the\n'
        '// lower right; rise: the lower left), the pixel where the footprint\'s middle sits on the ground, and\n'
        '// the scale that draws it at the game\'s size (TILE_WIDTH 100).\n'
        f'const TRAM_ART = Object.freeze({json.dumps(art, indent=2)});\n\n'
        "if (typeof module !== 'undefined' && module.exports) module.exports = { TRAM_ART };\n",
        encoding='utf-8')
    print('wrote', ART_JS.relative_to(ROOT))
    return art


# ── 電車站 (Norton's renders, Models/tramways/tramStop: Front - the boarding side toward the viewer, the
# railing at the back; Back - the railing in front) ───────────────────────────────────────────────────
# Seen from a lower camera than the game's (about 20 degrees up against 30, the long way turned 41-44
# degrees against 45), with upright things - posts, railing, sign - standing on a level platform under
# a level canopy. One warp for the whole picture would stand the posts 1.4 times too tall or squeeze it
# narrow, so each part is moved as what it is: a level surface (the platform, the canopy) as that plane
# seen from the game's camera; an upright thing kept upright, at the place its foot moves to, its height
# by cos 30 / cos 20. Each move is affine (none bends anything).
STOP_VIEWS = {
    # s_long: the railing's rails / the yellow edge; s_short: the drain grates (front), the back's
    # from the same camera angle; foot: the railing's foot line (y at x0, slope s_long); sign: its box
    'tramStopFront': dict(s_long=0.308, s_short=-0.39, foot=(500, 420), rail_px=None, sign=(160, 30, 300, 395), panel_bottom=185, canopy=(285, 1420),
                          order=('platform', 'railing', 'posts', 'canopy', 'sign')),
    'tramStopBack': dict(s_long=0.280, s_short=-0.43, foot=(300, 517.5), rail_px=110, sign=(1428, 300, 1625, 795), panel_bottom=485, canopy=(95, 1455), board=(568, 495, 728, 650),
                         order=('platform', 'posts', 'canopy', 'railing', 'sign')),
}
STOP_ALPHA_CUT = 110          # the generator's faint halo
STOP_SCREEN_PX = 50 * (1 + 0.112)   # a tile long (its 2.24 m width 0.112 of that) across the screen
STOP_ART_SPAN = 1578                # the front stop's squared width, px (both views' platforms the same)
# The two renders are not the same platform: the back's is 4-5 times as wide as the front's (Norton,
# 2026-11-08: keep the thinner one). The back is narrowed to the front's width across the platform -
# its ground (platform, canopy, the posts' places) scaled across the stop about the railing's line, so
# the railing stays; heights as they are.
STOP_WIDTH_FROM = {'tramStopBack': 'tramStopFront'}


def yellow_v(name):
    """The ground distance across the stop from the railing's foot line to the yellow edge line, in the
    render's ground units (its camera's: inverse of `camera`)."""
    cfg = STOP_VIEWS[name]
    a = np.asarray(Image.open(SRC / 'tramStop' / f'{name}.png').convert('RGBA')).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    yel = (al > 200) & (r > 170) & (g > 130) & (b < 90) & (r - b > 110)
    ys, xs = np.nonzero(yel)
    ground_r, _ = camera(cfg['s_long'], cfg['s_short'])
    inv = np.linalg.inv(ground_r)
    fx, fy = cfg['foot']
    v_rail = (inv @ np.array([fx, fy]))[1]
    v_yellow = np.median((inv @ np.vstack([xs, ys]))[1])
    return float(v_yellow - v_rail), float(v_rail)


def camera(s_long, s_short):
    sin_e = np.sqrt(-s_long * s_short)
    theta = np.arctan(s_long / sin_e)
    return np.array([[np.cos(theta), np.sin(theta)], [np.sin(theta) * sin_e, -np.cos(theta) * sin_e]]), np.sqrt(1 - sin_e ** 2)


GAME_GROUND = np.array([[np.cos(np.pi / 4), np.sin(np.pi / 4)], [0.5 * np.sin(np.pi / 4), -0.5 * np.cos(np.pi / 4)]])
GAME_COS_E = np.cos(np.pi / 6)


def grow(mask, px):
    """A mask grown by px each way."""
    from PIL import ImageFilter
    im = Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(2 * px + 1))
    return np.asarray(im) > 0


def stop_layers(a, cfg):
    """The picture's pixels by what they are: platform, railing, posts (each with its foot), canopy, sign."""
    h, w = a.shape[:2]
    al = a[..., 3] > STOP_ALPHA_CUT
    r, g, b = a[..., 0].astype(np.float32), a[..., 1].astype(np.float32), a[..., 2].astype(np.float32)
    green = al & (g > r + 18) & (g > b + 2)
    sx0, sy0, sx1, sy1 = cfg['sign']
    # the sign: its panel, and its pole - the green below the panel and the picture right beside it
    box = np.zeros_like(al)
    box[sy0:sy1, sx0:sx1] = True
    pole = green & box
    pole_cols = np.nonzero(pole[cfg['panel_bottom']:].any(0))[0]
    sign = box & al & (np.arange(h)[:, None] < cfg['panel_bottom'])
    if len(pole_cols):
        below = np.zeros_like(al)
        below[cfg['panel_bottom']:sy1] = True
        sign |= grow(pole & below, 3) & al & box & below
    # the canopy: each column's first run of picture from the top, down to a gap or a post's green
    canopy = np.zeros_like(al)
    c0, c1 = cfg['canopy']
    fx, fy = cfg['foot']
    # (no lower than the posts' tops, along the stop: a post's dark edge is not green, and the run
    # would carry on down it to the platform)
    pg0 = green & ~sign
    gcols0 = np.nonzero(pg0.sum(0) > 40)[0]
    # (only where the posts stand in front of the railing - in the back view the canopy's beam hangs
    # below the posts' tops)
    if len(gcols0) and cfg['rail_px'] is None:
        gtops = np.array([np.nonzero(pg0[:, x])[0][0] for x in gcols0], float)
        g_c = float(np.median(gtops - cfg['s_long'] * gcols0))
    else:
        g_c = None
    for x in range(c0, c1):
        col = al[:, x] & ~sign[:, x]
        ys = np.nonzero(col)[0]
        # (the canopy's top is well above the railing's foot - else this column's top is the platform)
        if not len(ys) or ys[0] > fy + cfg['s_long'] * (x - fx) - 150:
            continue
        y = ys[0]
        stop = h if g_c is None else int(g_c + cfg['s_long'] * x) + 12
        while y < min(h, stop) and (col[y] or col[min(h - 1, y + 1)] or col[min(h - 1, y + 2)]) and not green[y, x]:
            canopy[y, x] = col[y]
            y += 1
    # the posts: the green below the canopy, outside the sign, grouped by column; their feet the lowest green
    pg = green & ~canopy & ~sign
    cols = np.nonzero(pg.sum(0) > 6)[0]
    posts = []
    if len(cols):
        groups = np.split(cols, np.nonzero(np.diff(cols) > 4)[0] + 1)
        for gcols in groups:
            x0, x1 = int(gcols[0]) - 3, int(gcols[-1]) + 4
            m = np.zeros_like(al)
            m[:, x0:x1] = pg[:, x0:x1]
            ys = np.nonzero(m.any(1))[0]
            if ys[-1] - ys[0] < 120:      # (a green patch on the timetable board, not a post)
                continue
            # (the post's own outline: picture right beside its green - not the railing across it - and
            # its dark edges and base)
            near = grow(m, 4) & al & ~canopy & ~sign
            dark = grow(m, 9) & al & ~canopy & ~sign & (a[..., :3].astype(np.float32).mean(2) < 75)
            m = near | dark
            if cfg['rail_px'] is None:
                # (in front of the railing: all its columns, its top to its foot)
                cx0, cx1 = int(gcols[0]) - 4, int(gcols[-1]) + 5
                m[ys[0]:ys[-1] + 3, cx0:cx1] |= al[ys[0]:ys[-1] + 3, cx0:cx1] & ~canopy[ys[0]:ys[-1] + 3, cx0:cx1] & ~sign[ys[0]:ys[-1] + 3, cx0:cx1]
            posts.append((m, ((gcols[0] + gcols[-1]) / 2, float(ys[-1]))))
    post_any = np.zeros_like(al)
    for m, _ in posts:
        post_any |= m
    rest = al & ~canopy & ~sign & ~post_any
    fx, fy = cfg['foot']
    xs = np.arange(w)[None, :]
    ys = np.arange(h)[:, None]
    foot = fy + cfg['s_long'] * (xs - fx)
    if cfg['rail_px'] is None:
        # the railing at the back: all above its foot line
        railing = rest & (ys < foot - 1)
    else:
        # the railing in front: in its band, its metal (bluish grey, highlights, shadows), its board
        band = (ys <= foot + 3) & (ys >= foot - cfg['rail_px'])
        metal = (b >= r - 6) | ((r + g + b) / 3 < 75) | ((r + g + b) / 3 > 215)
        railing = rest & band & metal
        # (its timetable board and poster: upright on it)
        if cfg.get('board'):
            bx0, by0, bx1, by1 = cfg['board']
            railing[by0:by1, bx0:bx1] |= rest[by0:by1, bx0:bx1]
    platform = rest & ~railing
    return dict(platform=platform, railing=railing, canopy=canopy, sign=sign, posts=posts)


def fill_platform(a, layers, slope):
    """The platform's paving behind the railing, posts and sign, made up from the paving round it: once
    those move apart from the platform, what they hid shows. The platform is convex as drawn, so it is
    each column's span of its own pixels; the hidden pixels there take the mean of their known
    neighbours, a ring at a time."""
    plat = layers['platform']
    h, w = plat.shape
    span = np.zeros_like(plat)
    cols = np.nonzero(plat.sum(0) > 3)[0]
    top = np.full(w, np.nan); bot = np.full(w, np.nan)
    for x in cols:
        ys = np.nonzero(plat[:, x])[0]
        top[x], bot[x] = ys[0], ys[-1]
    # (a column the posts hide from top to bottom: its edges from the columns either side)
    xs = np.arange(w)
    ok = ~np.isnan(top)
    # (the far edge, where the canopy hides it: a straight line along the platform, at the least
    # intercept the seen columns give - hiding only ever pushes a column's top down; not near the
    # rounded ends)
    s_l = slope
    c = top[ok] - s_l * xs[ok]
    # (the most common intercept among the least: the edge where it shows, not a stray pixel above it)
    h_c = np.bincount(np.round(c - c.min()).astype(int))
    peak = h_c.max()
    first = int(np.nonzero(h_c >= 0.25 * peak)[0][0])
    far = c.min() + first + s_l * xs
    mid = ok & (xs > cols.min() + 120) & (xs < cols.max() - 120)
    top[mid] = np.minimum(top[mid], far[mid])
    inner = (xs >= cols.min()) & (xs <= cols.max())
    top[inner & ~ok] = np.interp(xs[inner & ~ok], xs[ok], top[ok])
    bot[inner & ~ok] = np.interp(xs[inner & ~ok], xs[ok], bot[ok])
    for x in xs[inner]:
        span[int(top[x]):int(bot[x]) + 1, x] = True
    # the hidden paving from the nearest seen paving along the platform's length (its yellow line and
    # joints run that way), the nearer side weighted more
    rgb = a[..., :3].astype(np.float32)
    todo = span & ~plat
    ty, tx = np.nonzero(todo)
    # (the median of the first few seen along each way: a shadow line or a joint is one of them, not
    # carried along)
    picks = []
    for sign_ in (1, -1):
        found = [np.full((len(ty), 3), np.nan, np.float32) for _ in range(4)]
        count = np.zeros(len(ty), int)
        for k in range(1, 600):
            if (count >= 4).all():
                break
            xx = tx + sign_ * k
            yy = np.round(ty + sign_ * k * s_l).astype(int)
            inside = (xx >= 0) & (xx < w) & (yy >= 0) & (yy < h)
            hit = (count < 4) & inside
            hit[hit] = plat[yy[hit], xx[hit]]
            for n in range(4):
                sel = hit & (count == n)
                found[n][sel] = rgb[yy[sel], xx[sel]]
            count += hit
            # (every 3rd pixel along, so the four are spread out)
        picks += found
    fill = np.nanmedian(np.stack(picks, 0), axis=0)
    fill = np.where(np.isnan(fill), rgb[ty, tx], fill)
    rgb[ty, tx] = fill
    out = a.copy()
    filled = span & ~plat
    out[filled, :3] = rgb[filled].clip(0, 255).astype(np.uint8)
    out[filled, 3] = 255
    return out, plat | span


def affine_out(img_rgba, mask, inv, size):
    """The masked part of the picture through an affine map (inv: output -> input), premultiplied."""
    a = np.asarray(img_rgba).copy()
    a[..., 3] = np.where(mask, a[..., 3], 0)
    im = Image.fromarray(a, 'RGBA').convert('RGBa')
    return im.transform(size, Image.AFFINE, tuple(inv[0]) + tuple(inv[1]), resample=Image.BICUBIC).convert('RGBA')


def square_stop(name):
    cfg = STOP_VIEWS[name]
    img = Image.open(SRC / 'tramStop' / f'{name}.png').convert('RGBA')
    a = np.asarray(img).copy()
    a[..., 3] = np.where(a[..., 3] > STOP_ALPHA_CUT, a[..., 3], 0)
    img = Image.fromarray(a, 'RGBA')
    layers = stop_layers(a, cfg)
    ground_r, cos_r = camera(cfg['s_long'], cfg['s_short'])
    # (narrowed across to another view's width: the ground's v scaled about the railing's line)
    S, shift = np.eye(2), np.zeros(2)
    if name in STOP_WIDTH_FROM:
        mine, v_rail = yellow_v(name)
        theirs, _ = yellow_v(STOP_WIDTH_FROM[name])
        k = abs(theirs) / abs(mine)
        S = np.diag([1.0, k])
        shift = GAME_GROUND @ np.array([0.0, v_rail * (1 - k)])
        print(f'{name}: narrowed to {STOP_WIDTH_FROM[name]} - across x{k:.3f}')
    M = GAME_GROUND @ S @ np.linalg.inv(ground_r)      # the ground, render px -> game px (+ shift)
    v = GAME_COS_E / cos_r                              # upright px -> game px
    # the canopy's height: the posts' tops to their feet (the canopy's underside), in render px
    tops = [np.nonzero(m.any(1))[0][0] for m, _ in layers['posts']]
    feet = [f[1] for _, f in layers['posts']]
    H = float(np.median([fy - ty for fy, ty in zip(feet, tops)])) if feet else 200.0
    # each part's forward map (render -> game) as a 2x3 affine
    def plane(hr):
        # r = G - (0, hr); t = M G + shift - (0, v hr)
        return np.hstack([M, (M @ np.array([0.0, hr]) + shift - np.array([0.0, v * hr]))[:, None]])
    def upright_at(px, py):
        mx, my = M @ np.array([px, py]) + shift
        # x_t = x_r + (mx - px); y_t = my - v (py - y_r)
        return np.array([[1.0, 0.0, mx - px], [0.0, v, my - v * py]])
    fx, fy = cfg['foot']; s_l = cfg['s_long']
    f0 = fy - s_l * fx                                  # foot line: y = f0 + s_l x
    rail_fwd = np.array([[M[0, 0] + M[0, 1] * s_l, 0.0, M[0, 1] * f0 + shift[0]],
                         [M[1, 0] + M[1, 1] * s_l - v * s_l, v, M[1, 1] * f0 - v * f0 + shift[1]]])
    parts = {'platform': [(layers['platform'], plane(0.0))], 'canopy': [(layers['canopy'], plane(H))],
             'railing': [(layers['railing'], rail_fwd)], 'posts': [(m, upright_at(*f)) for m, f in layers['posts']]}
    # the sign: upright, its foot the lowest green of its pole
    sg = layers['sign']
    gy, gx = np.nonzero(sg & (a[..., 1].astype(int) > a[..., 0].astype(int) + 18))
    sfoot = (float(np.median(gx[gy >= gy.max() - 6])), float(gy.max())) if len(gy) else (0.0, 0.0)
    parts['sign'] = [(sg, upright_at(*sfoot))]
    # the output's bounds: every part's picture corners carried over
    pts = []
    for key, items in parts.items():
        for m, F in items:
            ys, xs = np.nonzero(m)
            if not len(xs):
                continue
            for x, y in ((xs.min(), ys.min()), (xs.max(), ys.min()), (xs.min(), ys.max()), (xs.max(), ys.max())):
                pts.append(F @ np.array([x, y, 1.0]))
    pts = np.array(pts)
    ox, oy = pts[:, 0].min() - 4, pts[:, 1].min() - 4
    size = (int(np.ceil(pts[:, 0].max() - ox + 8)), int(np.ceil(pts[:, 1].max() - oy + 8)))
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    filled, plat_full = fill_platform(np.asarray(img), layers, cfg['s_long'])
    parts['platform'] = [(plat_full, parts['platform'][0][1])]
    for key in cfg['order']:
        for m, F in parts[key]:
            src = Image.fromarray(filled, 'RGBA') if key == 'platform' else img
            Fo = F.copy(); Fo[0, 2] -= ox; Fo[1, 2] -= oy
            full = np.vstack([Fo, [0, 0, 1]])
            inv = np.linalg.inv(full)[:2]
            out.alpha_composite(affine_out(src, m, inv, size))
    # (the platform's middle on the ground: its pixels' mean, carried over by the platform's map)
    py, px = np.nonzero(plat_full)
    Fp = parts['platform'][0][1]
    mid = Fp @ np.array([px.mean(), py.mean(), 1.0]) - np.array([ox, oy])
    box = out.getbbox()
    out = out.crop(box)
    out.info['ground_mid'] = (float(mid[0] - box[0]), float(mid[1] - box[1]))
    STOP_OUT = OUT / 'tramStop'
    STOP_OUT.mkdir(parents=True, exist_ok=True)
    out.save(STOP_OUT / f'{name}.png')
    out.info['ground_mid'] = (float(mid[0] - box[0]), float(mid[1] - box[1]))
    print(f"{name}: camera {np.degrees(np.arcsin(np.sqrt(-cfg['s_long'] * cfg['s_short']))):.1f} deg up, canopy {H:.0f} px, "
          f"{len(layers['posts'])} posts, uprights x{v:.3f} -> {out.size}")
    return out, layers


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, view in VIEWS.items():
        img = Image.open(SRC / f'{name}.png').convert('RGBA')
        g = geometry(np.asarray(img), view)
        L = TRAM_LAMPS[name]
        out, upright, level, pts = square(img, g, [L['head'], *L['tails']])
        LAMPS_SQUARED[name] = {'head': pts[0], 'tails': pts[1:], 'width': out.width}
        out.save(OUT / f'{name}.png')
        c = geometry(np.asarray(out), view)
        print(f"{name} ({view}): frames {g['s_side']:+.3f} {g['s_end']:+.3f}, corner ({g['xc']:.0f}, {g['yc']:.0f}) "
              f"-> sides x{upright:.3f}, roof x{level:.3f} -> frames {c['s_side']:+.3f} {c['s_end']:+.3f}  {img.size} -> {out.size}")
    art = write_art()
    # the stops: each view's game texture, its anchor for now the middle of the platform's foot (the
    # stop's place is set when the stops are placed, phase 3)
    GAME.mkdir(parents=True, exist_ok=True)
    for name in STOP_VIEWS:
        out, _ = square_stop(name)
        tex, f, (ox, oy) = game_texture(out)
        key = 'tram_stop_' + ('front' if name.endswith('Front') else 'back')
        tex.save(GAME / f'{key}.png')
        gx, gy = out.info['ground_mid']
        # its lights: a layer the same size and place
        canopy_px = {'tramStopFront': 241, 'tramStopBack': 299}[name] * GAME_COS_E / camera(STOP_VIEWS[name]['s_long'], STOP_VIEWS[name]['s_short'])[1]
        lit, tubes = stop_light_layer(out, canopy_px)
        lit_tex = lit.crop((0, 0, out.width, out.height))
        sx0, sy0, sx1, sy1 = Image.fromarray((np.asarray(out)[..., 3] > 8).astype(np.uint8) * 255).getbbox()
        lit_c = lit_tex.crop((sx0, sy0, sx1, sy1)).convert('RGBa').resize((round((sx1 - sx0) * f), round((sy1 - sy0) * f)), Image.LANCZOS).convert('RGBA')
        canvas = Image.new('RGBA', tex.size, (0, 0, 0, 0))
        canvas.paste(lit_c, (int(round(ox + sx0 * f)), int(round(oy + sy0 * f))))
        canvas.save(GAME / f'{key}_lit.png')
        print(name, 'tubes', tubes)
        art['stop_' + key[10:]] = {'path': f'Models/tramways/{key}.png', 'key': key,
                                   # the platform's middle on the ground; a tile long (20 m: the platform's
                                   # length and width across the screen, 50 px a tile at TILE_WIDTH 100)
                                   'anchor': [round(gx * f + ox, 1), round(gy * f + oy, 1)], 'size': [tex.width, tex.height],
                                   'scale': round(STOP_SCREEN_PX / (STOP_ART_SPAN * f), 5),
                                   'lit': {'path': f'Models/tramways/{key}_lit.png', 'key': f'{key}_lit'}}
    import json
    text = ART_JS.read_text(encoding='utf-8')
    head = text[:text.index('const TRAM_ART')]
    ART_JS.write_text(head + f'const TRAM_ART = Object.freeze({json.dumps(art, indent=2)});\n\n'
                      "if (typeof module !== 'undefined' && module.exports) module.exports = { TRAM_ART };\n", encoding='utf-8')


if __name__ == '__main__':
    main()
