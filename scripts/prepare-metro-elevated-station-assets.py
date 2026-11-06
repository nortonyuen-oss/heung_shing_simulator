"""地鐵第四期 step 2: the 高架站 (an island platform, a track either side) from Norton's render
(scripts/source-art/metroStation/original/elevatedStationIsland.png, 2026-11-05).

- The footbridge off (it reaches out over the next tiles), the pier behind it finished down to the
  ground; under the deck squashed evenly (not cut: the concourse keeps its sign and windows) so the
  track stands as high as the viaducts' deck (20 m, three hill levels); squared to 2:1 (its long lines are 0.30 steep) and scaled to
  the 512-px tile, the platform about 90 m (four cars).
- Two layers, so the trains run between them: the deck (the tracks, the parapets and all under the
  deck), then the island (the platform, all on it and the roof); the far track's trains go between
  the two, the near track's after both (passing in front of the near parapet, as on any viaduct).
- Cut into the five tiles in upright strips a tile wide (the end ones taking all beyond them), X as
  drawn, Y its mirror.

Run with .venv/bin/python -B scripts/prepare-metro-elevated-station-assets.py
"""
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('viaduct', ROOT / 'scripts/prepare-metro-viaduct-assets.py')
viaduct = importlib.util.module_from_spec(spec)
spec.loader.exec_module(viaduct)
track = viaduct.track
SRC = ROOT / 'scripts/source-art/metroStation/original/elevatedStationIsland.png'
OUT = ROOT / 'Models/metroViaduct'

# --- the render, cleaned and squashed (render px) -------------------------------------------------
FOOTBRIDGE = [(1351, 434), (1480, 466), (1600, 498), (1614, 498), (1614, 525), (1774, 525), (1774, 887), (1351, 887)]
KEEP = [(1489, 400, 1550, 476),     # the pier behind the footbridge
        (1340, 628, 1374, 700)]     # the railing at the lift tower's foot
MID_PIER = (1490, 1546, 476, 541, 566)     # x0, x1, shaft seen to y, plinth from y, foot y
MID_PIER_ROW = 450                         # a row of its shaft, to carry on down
RIGHT_PIER_PLINTH = (1615, 1702, 497, 524)


# Under the deck squashed between two lines along the station (0.30 steep, as its long lines): the
# same all along, so the concourse's lines stay straight and upright (Norton, 2026-11-06: lines
# not along the station had it squashed more at one end - 歪歪斜斜).
def deck_underside(x):            # under the deck's face: above this, moved down whole
    return 830 - 0.30 * x


def ground_line(x):               # below all under the deck
    return 1120 - 0.30 * x


SQUARE = 1 / (2 * 0.30)           # the render's long lines, 0.30 steep, to 2:1
SCALE = 90 * 12.8 / (1620 - 298)  # the platform's front edge (x 298 to 1620) to 90 m
# Squashed so the track stands as high as the viaducts' deck: unsquashed it is 244.07 S px up (170
# with 51 render px out, the 17 m deck this was first measured at); each render px out takes
# SQUARE * SCALE S px off.
SQUASH_MEASURED = 51              # (the squash the S-space measurements below were taken at)
TRACK_UNSQUASHED_S = 170 + SQUASH_MEASURED * SQUARE * SCALE
SQUASH = (TRACK_UNSQUASHED_S - viaduct.DECK_M * viaduct.Z_PX) / (SQUARE * SCALE)
SHIFT_S = (SQUASH - SQUASH_MEASURED) * SQUARE * SCALE   # all on the deck, down by this more


def clean(a):
    a = a.copy()
    h, w = a.shape[:2]
    mask = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.polygon(FOOTBRIDGE, fill=255)
    for box in KEEP:
        d.rectangle(box, fill=0)
    a[np.asarray(mask) > 0] = 0
    # the pier the footbridge hid: its shaft on down, a plinth as the next pier's
    x0, x1, seen, plinth, foot = MID_PIER
    a[seen:foot + 6, x0 - 6:x1 + 6] = 0
    a[seen:plinth, x0:x1] = a[MID_PIER_ROW:MID_PIER_ROW + 1, x0:x1]
    px0, px1, py0, py1 = RIGHT_PIER_PLINTH
    src = Image.fromarray(a[py0:py1, px0:px1]).resize((x1 - x0 + 8, foot - plinth), Image.LANCZOS)
    s = np.asarray(src)
    region = a[plinth:foot, x0 - 4:x1 + 4]
    on = s[..., 3:4] / 255.0
    region[...] = (s * on + region * (1 - on)).astype(np.uint8)
    return a


def squash(a, amount=SQUASH):
    """Each column: above the deck's underside down by `amount`, from there to the ground line
    squashed by it, below the ground as it was."""
    h, w = a.shape[:2]
    out = np.zeros_like(a)
    ys = np.arange(h, dtype=np.float32)
    for x in range(w):
        u, g = deck_underside(x), ground_line(x)
        f = (g - u - amount) / (g - u)
        # the source row for each output row (inverse map)
        src = np.where(ys < u + amount, ys - amount,
                       np.where(ys < g, u + (ys - u - amount) / f, ys))
        ok = src >= 0
        lo = np.clip(np.floor(src).astype(int), 0, h - 1)
        hi = np.clip(lo + 1, 0, h - 1)
        t = (src - np.floor(src))[:, None]
        col = a[:, x].astype(np.float32)
        out[ok, x] = (col[lo] * (1 - t) + col[hi] * t)[ok].astype(np.uint8)
    return out


def render_s(amount=SQUASH):
    a = np.asarray(Image.open(SRC).convert('RGBA'))
    a = squash(clean(a), amount)
    im = Image.fromarray(a, 'RGBA')
    return im.resize((round(im.width * SCALE), round(im.height * SQUARE * SCALE)), Image.LANCZOS)


# --- the station's frame in S (measured on it) -----------------------------------------------------
# along L (up-right), across C (toward the viewer) in metres, z px up from the track: v = y + x/2
# runs across (12.8 px a metre of C), u = y - x/2 along (-12.8 a metre of L).
PX_M = 12.8
# The middle is halfway between the tracks (the render's far track is 1.15 m further out than its
# near one: the platform's middle, v 1085.4 on the track, is 0.58 m toward the near track).
# (measured at SQUASH_MEASURED: the platform's corners, floor front (268.3, 995) and (1415, 421.7),
# back (150, 933.3); with another squash, all on the deck moved down SHIFT_S more)
V0, U0 = 1085.4 - 0.575 * 12.8 + SHIFT_S, 304.2 + SHIFT_S
X0, Y0 = V0 - U0, (U0 + V0) / 2
FLOOR_PX = 16.7                   # the platform's floor above the track
PLATFORM_NEAR_M = 4.72 + 0.575    # its near edge from the middle
PLATFORM_HALF_L = 44.8
TRACK_M = 7.03                    # each track from the middle (measured 6.45 + 0.575, 7.6 - 0.575)
DECK_HALF_M = 10.0
STATION_HALF_L = 50.0             # five tiles
DECK_PX = viaduct.DECK_M * viaduct.Z_PX    # the track above the ground
ROOF_RIM_V = 958 + SHIFT_S        # below the roof's front rim: the gap where the far track shows
FAR_TRAIN_V = 1012 + SHIFT_S      # ... down to the platform's far edge
# things standing in the gap, in front of the far track (boxes in S: the escalators, the signs)
GAP_THINGS = [(x0, round(y0 + SHIFT_S), x1, round(y1 + SHIFT_S)) for x0, y0, x1, y1 in
              [(340, 700, 505, 895), (1040, 390, 1200, 555), (855, 530, 925, 595),
               (1245, 330, 1320, 385), (605, 655, 685, 740)]]


def coords(shape):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return xx, yy, yy + 0.5 * xx, yy - 0.5 * xx


FAR_RAIL_C = (-14.0, -8.6)        # the far railing, across (its foot at -9.6, its top drawn up to -13.4)
FAR_RAIL_BEFORE_L = -27.5         # ... from the station's end to where the roof's end meets it


def island_mask(a):
    """The island - the platform, all on it, the roof - as against the far track behind it."""
    xx, yy, v, u = coords(a.shape)
    R, G, B, A = (a[..., i].astype(int) for i in range(4))
    lum = (R + G + B) / 3
    Lt = (U0 - u) / PX_M                     # L, were the pixel on the track
    cand = v <= V0 + PX_M * PLATFORM_NEAR_M + 1
    cand &= ((Lt >= -PLATFORM_HALF_L - 0.3) & (Lt <= PLATFORM_HALF_L + 0.3)) | (v < ROOF_RIM_V)
    gap = (v > ROOF_RIM_V) & (v <= FAR_TRAIN_V)
    blue = (B - R > 25) & (B > 70)                  # the columns
    light = (R > 215) & (G > 180)                   # the lamps
    rail = (R - B > 40) & (R < 200) & (lum < 150)
    boxes = np.zeros(a.shape[:2], bool)
    for x0, y0, x1, y1 in GAP_THINGS:
        boxes[y0:y1, x0:x1] = True
    thing = blue | light | (boxes & ~rail)
    # (specks off: a thing is more than a few px)
    t = Image.fromarray((thing * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    thing = np.asarray(t) > 0
    # the far parapet's railing past the roof's end (it is behind the far track: under the roof the
    # roof hides it) - not the island's, or it is drawn over the far track's trains (Norton,
    # 2026-11-06: 欄杆和列車穿模); the platform's blue columns standing in front of it kept
    Ct = (v - V0) / PX_M
    far_rail = (Ct > FAR_RAIL_C[0]) & (Ct < FAR_RAIL_C[1]) & (Lt < FAR_RAIL_BEFORE_L) & ~blue
    return cand & (A > 0) & (~gap | thing) & ~far_rail


END_SHIFT_M = 5.0                 # the render's deck ends at L -55: its end (face and pier) moved in to -50
LANE = (5.5, 8.2)                 # the near track's lane, across: copied along for the ends' tracks
FAR_LANE = (8.4, 5.6)             # the far one's (its outer, inner edge), copied across from the near
LANE_FROM_L = 15.0                # ... from this much further in


def end_bounds():
    return (X0 + PX_M * (-STATION_HALF_L - DECK_HALF_M), X0 + PX_M * (-STATION_HALF_L + DECK_HALF_M),
            X0 + PX_M * (STATION_HALF_L - DECK_HALF_M), X0 + PX_M * (STATION_HALF_L + DECK_HALF_M))


def beyond(shape):
    """The pixels past the five tiles (L -50 to 50): the render's deck runs on past them."""
    xx, yy, v, u = coords(shape)
    Lt = (U0 - u) / PX_M
    x_bl, x_fl, x_br, x_fr = end_bounds()
    left = (xx < x_bl) | ((xx < x_fl) & (Lt < -STATION_HALF_L))
    right = (xx > x_fr) | ((xx > x_br) & (Lt > STATION_HALF_L))
    return left, right


def shift(a, dx, dy):
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    dx, dy = int(round(dx)), int(round(dy))
    ys, yd = (slice(max(0, -dy), h - max(0, dy)), slice(max(0, dy), h - max(0, -dy)))
    xs, xd = (slice(max(0, -dx), w - max(0, dx)), slice(max(0, dx), w - max(0, -dx)))
    out[yd, xd] = a[ys, xs]
    return out


def over(a, b):
    """b over a (both RGBA uint8)."""
    al = b[..., 3:4] / 255.0
    out = a.astype(np.float32) * (1 - al) + b.astype(np.float32) * al
    out[..., 3] = np.maximum(a[..., 3], b[..., 3])
    return out.astype(np.uint8)


def ends(a, keep):
    """The deck to the five tiles. The left end (its face to the viewer) is the render's own end, moved
    in; past the platform's ends, where the render's tracks wander, the deck's top made again: the
    two tracks (copied along from the near one, the far one across too) 6.45 m out as the spread tiles
    take them on, plain deck between as theirs."""
    left, right = beyond(a.shape)
    left &= ~keep
    right &= ~keep
    piece = a.copy()
    piece[~left] = 0
    out = a.copy()
    out[left | right] = 0
    out = over(out, shift(piece, PX_M * END_SHIFT_M, -PX_M / 2 * END_SHIFT_M))
    xx, yy, v, u = coords(a.shape)
    Lt = (U0 - u) / PX_M
    Ct = (v - V0) / PX_M
    # plain deck: the viaducts' concrete, a little mottled
    rng = np.random.default_rng(20261106)
    noise = Image.fromarray((rng.random((a.shape[0] // 4 + 1, a.shape[1] // 4 + 1)) * 255).astype(np.uint8))
    noise = np.asarray(noise.resize((a.shape[1], a.shape[0]), Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.5)), np.float32) / 255 - 0.5
    concrete = np.zeros_like(a)
    concrete[..., :3] = np.clip(viaduct.STATION_TOP[None, None, :] * (1 + 0.10 * noise[..., None]), 0, 255).astype(np.uint8)
    concrete[..., 3] = 255
    # between the tracks, ballast as on the spread tiles (Norton, 2026-11-06: no plain grey slab):
    # the track's gravel colour, speckled pixel by pixel
    grain = rng.random(a.shape[:2]).astype(np.float32) - 0.5
    ballast = np.zeros_like(a)
    ballast[..., :3] = np.clip(track.BALLAST[None, None, :] * (1 + 0.16 * grain[..., None] + 0.08 * noise[..., None]), 0, 255).astype(np.uint8)
    ballast[..., 3] = 255
    for side in (-1, 1):
        zone = (side * Lt > PLATFORM_HALF_L + 0.2) & (side * Lt <= STATION_HALF_L)
        # (the plain deck: between the tracks and outside the far one, the far parapet standing above)
        between = zone & (Ct > -FAR_LANE[1] - 0.01) & (Ct < LANE[0])
        outside = zone & (Ct > -DECK_HALF_M + 0.4) & (Ct <= -FAR_LANE[0])
        out[between] = (GAME_GRAVEL if GAME_GRAVEL is not None else ballast)[between]
        out[outside] = concrete[outside]
        dl = side * LANE_FROM_L      # the source is further in: dest + (-dl along L)
        for dc, lo, hi in ((0.0, LANE[0], LANE[1]), (2 * TRACK_M, -FAR_LANE[0], -FAR_LANE[1])):
            # source at (L - dl, C + dc): screen offset from dest
            sx = PX_M * (-dl + dc)
            sy = PX_M / 2 * (dc + dl)
            src = shift(a, -sx, -sy)
            lane = zone & (Ct >= lo) & (Ct < hi)
            out[lane] = src[lane]
    return out


# The render's own tracks replaced by the game's (Norton, 2026-11-06: 置換原貼圖內的路軌 - the
# station's track as the line's, prepare-railway-track-assets.py): a track tile each 20 m of the
# five, the two tracks 7.03 m either side of the middle, warped onto the deck as the render lies (L
# up-right, C down-right, 12.8 px a metre); over the render's track lanes only, not the island.
REPLACE_NEAR = (5.45, 8.95)       # the near track's lane, across (the parapet's railing from 9.1)
REPLACE_FAR = (-9.0, -5.55)


def game_tracks(shape, rng):
    k = 2                                         # drawn at twice the size, then down
    H2, W2 = shape[0] * k, shape[1] * k
    n = track.TD
    s = track.TILE_M / n
    out = {name: Image.new('RGBA', (W2, H2), (0, 0, 0, 0)) for name in ('bed', 'sl', 'rl', 'gravel')}
    pair = ('PAIR', ((10.0 - TRACK_M, 0.0), (10.0 - TRACK_M, 20.0)), ((10.0 + TRACK_M, 0.0), (10.0 + TRACK_M, 20.0)))
    for j in range(-2, 3):
        layers = track.draw_tile([pair], rng)
        Lc = 20.0 * j
        for name, rgb, alpha, z in (('gravel', layers['gravel'], np.ones_like(layers['bed']), 0.0),
                                    ('bed', layers['gravel'], layers['bed'], 0.0),
                                    ('sl', layers['sleeper_rgb'], layers['sleeper_a'], 0.0),
                                    ('rl', layers['rail_rgb'], layers['rail_a'], 0.15)):
            # top-down px (i col, j row) -> S: C = col - 10, L = Lc - (row - 10)
            M = np.array([[PX_M * s, -PX_M * s, X0 + PX_M * Lc],
                          [PX_M / 2 * s, PX_M / 2 * s, Y0 - viaduct.Z_PX * z - PX_M / 2 * (20.0 + Lc)],
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
    canvas = out['bed'].copy()
    canvas.alpha_composite(shadow(out['sl'], k, 0.35))
    canvas.alpha_composite(out['sl'])
    canvas.alpha_composite(shadow(out['rl'], 2 * k, 0.5))
    canvas.alpha_composite(out['rl'], (0, -k))
    global GAME_GRAVEL
    # (the bed's gravel all across the deck, for the plain deck past the platforms' ends: ends())
    GAME_GRAVEL = np.asarray(out['gravel'].resize((shape[1], shape[0]), Image.LANCZOS))
    return np.asarray(canvas.resize((shape[1], shape[0]), Image.LANCZOS))


GAME_GRAVEL = None


# The piers' feet (Norton, 2026-11-06: 橋腳被平切了, 不像真): the render's left end pier runs off its
# bottom edge, and the two at the right end stand cut flat on a scrap of the render's paving (the one
# rebuilt where the footbridge was, its shaft one row drawn on down). The canvas is made taller, and
# each of those three gets the middle pier's plinth (its V of a foot), scaled to its shaft; the
# rebuilt shaft gets the real one's texture from above it.
PIER_PAD = 64                     # px more canvas under the render
GOOD_PIER = (330, 1210)           # (x, y) on the middle pier's shaft, a little above its plinth
CUT_PIERS = [(140, 1240), (1322, 780), (1440, 725)]
STREAKED_SHAFT = (1299, 1347, 722, 808)    # x0, x1, from y, to its plinth


def fix_piers(a):
    a = np.concatenate([a, np.zeros((PIER_PAD,) + a.shape[1:], a.dtype)], 0)
    x0, x1, y0, y1 = STREAKED_SHAFT
    a[y0:y1, x0:x1 + 1] = a[2 * y0 - y1:y0, x0:x1 + 1]
    al = a[..., 3] > 40

    def run_at(y, x):
        if not al[y, x]:
            return None
        lo = hi = x
        while lo > 0 and al[y, lo - 1]:
            lo -= 1
        while hi + 1 < a.shape[1] and al[y, hi + 1]:
            hi += 1
        return lo, hi

    def shaft(x, y):
        """the shaft's edges at (x, y), and its plinth's top (where it widens)"""
        s0, s1 = run_at(y, x)
        while True:
            r = run_at(y, (s0 + s1) // 2)
            if r is None or r[1] - r[0] > s1 - s0 + 6:
                return s0, s1, y
            y += 1

    m0, m1, mtop = shaft(*GOOD_PIER)
    g0, g1 = run_at(mtop + 2, (m0 + m1) // 2)
    gy = mtop
    while gy + 1 < a.shape[0] and al[gy + 1, g0:g1 + 1].any():
        gy += 1
    good = Image.fromarray(a[mtop:gy + 1, g0:g1 + 1].copy())
    out = a.copy()
    for x, y in CUT_PIERS:
        s0, s1, top = shaft(x, y)
        k = (s1 - s0) / (m1 - m0)
        w, h = round(good.width * k), round(good.height * k)
        xl = int(round((s0 + s1) / 2 - ((m0 + m1) / 2 - g0) * k))
        out[top:top + h + 40, xl - 12:xl + w + 12] = 0          # the old foot and the paving under it
        g = np.asarray(good.resize((w, h), Image.LANCZOS)).astype(np.float32)
        on = g[..., 3:4] / 255.0
        region = out[top:top + h, xl:xl + w].astype(np.float32)
        mixed = g * on + region * (1 - on)
        mixed[..., 3] = np.maximum(region[..., 3], g[..., 3])
        out[top:top + h, xl:xl + w] = mixed.astype(np.uint8)
    return out


def replace_tracks(a, isl, rng):
    g = game_tracks(a.shape, rng)
    xx, yy, v, u = coords(a.shape)
    Lt = (U0 - u) / PX_M
    Ct = (v - V0) / PX_M
    lane = (((Ct >= REPLACE_NEAR[0]) & (Ct <= REPLACE_NEAR[1])) | ((Ct >= REPLACE_FAR[0]) & (Ct <= REPLACE_FAR[1])))
    lane &= (np.abs(Lt) <= STATION_HALF_L) & ~isl & (a[..., 3] > 0) & (g[..., 3] > 0)
    out = a.copy()
    out[lane] = over(a, g)[lane]
    return out


S_SIZE = None


POW2_H = 1024
GUTTER = 8      # transparent px kept off every edge of a strip's canvas


def pow2(v):
    return 1 << max(0, int(v - 1).bit_length())


def strips(base, island, flip):
    """The five tiles' strips: [(box, anchor)] left to right as drawn."""
    w = base.shape[1]
    centres = []
    for j in range(-2, 3):
        cx, cy = X0 + 256 * j, Y0 + DECK_PX - 128 * j
        centres.append((w - cx if flip else cx, cy))
    centres.sort()
    alpha = np.maximum(base[..., 3], island[..., 3])
    out = []
    for k, (cx, cy) in enumerate(centres):
        x0 = 0 if k == 0 else int(round(cx - 128))
        x1 = w if k == 4 else int(round(cx + 128))
        cols = alpha[:, x0:x1]
        ys, xs = np.nonzero(cols > 0)
        y0, y1 = ys.min(), ys.max() + 1
        xa, xb = x0 + xs.min(), x0 + xs.max() + 1
        out.append(((int(xa), int(y0), int(xb), int(y1)), (round(float(cx - xa), 1), round(float(cy - y0), 1))))
    return out


# Night (Norton, 2026-11-06: 地鐵站燈光 - only the station's indirect light is seen): the platform
# under the roof (its things, the tracks either side as far as the far railing) and the concourse
# inside as by day; the roof, the walls outside, the stairs and the escalators' lamps not lit - laid
# over the darkened station at night by the buildings' light strength. The concourse's insides, on
# the render (S px): the gate hall and the windows by it as they are; behind the outside stairs
# only its warm-lit rooms (so not the stairs in front of them).
CONCOURSE_INSIDE = [
    [(722, 1030), (860, 980), (860, 1080), (722, 1132)],     # the gate hall: its open front, the gates
    [(620, 968), (860, 858), (860, 905), (620, 1010)],       # the band of windows over the sign (from its frame's top)
    [(620, 1065), (697, 1040), (697, 1125), (620, 1155)],    # the window left of the gates
]
CONCOURSE_BEHIND_STAIRS = [
    [(888, 940), (1000, 900), (1000, 1010), (888, 1052)],
]


def station_lit(layer):
    a = layer.astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    xx, yy, v, u = coords(layer.shape)
    Lt = (U0 - u) / PX_M
    Ct = (v - V0) / PX_M
    under_roof = (v >= ROOF_RIM_V - 4) & (Ct <= PLATFORM_NEAR_M + 0.3) & (Ct >= -10.0) & (np.abs(Lt) <= PLATFORM_HALF_L + 1)

    def polys(ps):
        m = Image.new('L', (layer.shape[1], layer.shape[0]), 0)
        for poly in ps:
            ImageDraw.Draw(m).polygon(poly, fill=255)
        return np.asarray(m) > 0
    lum = rgb.mean(2)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    warm_room = (b > 70) & (lum > 90) & (r - b > 45) & (g - b > 20)
    # (in the concourse's boxes only what is inside - the glass and what shows through it, the lit
    # rooms - not the wall round the windows: Norton, 2026-11-06, the boxes caught the wall above)
    wall = (lum > 150) & (np.abs(r - b) < 45) & (r - b < 40)
    inside = (polys(CONCOURSE_INSIDE) & ~wall) | (polys(CONCOURSE_BEHIND_STAIRS) & warm_room)
    inside = np.asarray(Image.fromarray((inside * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))) > 0
    m = (under_roof | inside) & (al > 0)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
    out = np.zeros_like(a)
    out[..., :3] = rgb
    out[..., 3] = m * al
    return out.clip(0, 255).astype(np.uint8)


def main():
    global S_SIZE
    s = render_s()
    a = fix_piers(np.asarray(s).copy())
    S_SIZE = (a.shape[1], a.shape[0])
    isl = island_mask(a)
    a = replace_tracks(a, isl, np.random.default_rng(20261106))
    island = a.copy()
    island[~isl] = 0
    base = ends(a, isl)
    base_lit, island_lit = station_lit(base), station_lit(island)
    art = {}
    cut = {axis: strips(base[:, ::-1] if flip else base, island[:, ::-1] if flip else island, flip)
           for axis, flip in (('x', False), ('y', True))}
    # power-of-two canvases (Norton, 2026-11-06), for mipmaps and the release pipeline: the whole
    # station scaled alike so the tallest strip fits, then cut into its strips (each layer scaled
    # once, whole: the strips' edges meet exactly - none fades against its padding, none reaches
    # into its neighbour, where its island was drawn over the trains: Norton's spikes at the joins),
    # each padded up to a power of two each way. Phaser wraps a power-of-two texture (REPEAT), so
    # the content keeps GUTTER transparent px off every edge (else an edge's pixels show at the
    # opposite one). `scale`: the strips' px per 512-px tile px.
    tallest = max(y1 - y0 for boxes in cut.values() for (_, y0, _, y1), _ in boxes)
    scale = min(1.0, (POW2_H - 2 * GUTTER - 2) / tallest)
    for axis, flip in (('x', False), ('y', True)):
        layers = {}
        for layer, img in (('base', base), ('island', island), ('base_lit', base_lit), ('island_lit', island_lit)):
            img = img[:, ::-1] if flip else img
            H0, W0 = img.shape[:2]
            layers[layer] = np.asarray(Image.fromarray(np.ascontiguousarray(img)).resize((round(W0 * scale), round(H0 * scale)), Image.LANCZOS))
        pieces = []
        for k, (box, anchor) in enumerate(cut[axis]):
            x0, y0, x1, y1 = box
            X0, X1 = round(x0 * scale), round(x1 * scale)
            Y0, Y1 = int(np.floor(y0 * scale)), int(np.ceil(y1 * scale))
            w, h = X1 - X0, Y1 - Y0
            cw, ch = pow2(w + 2 * GUTTER), pow2(h + 2 * GUTTER)
            px, py = (cw - w) // 2, ch - h - GUTTER
            entry = {'anchor': [round((x0 + anchor[0]) * scale - X0 + px, 1), round((y0 + anchor[1]) * scale - Y0 + py, 1)],
                     'size': [cw, ch], 'scale': round(scale, 6)}
            for layer, img in layers.items():
                name = f'metro_elevated_station_{axis}_{k}_{layer}'
                canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
                canvas.paste(Image.fromarray(np.ascontiguousarray(img[Y0:Y1, X0:X1])), (px, py))
                canvas.save(OUT / f'{name}.png')
                entry[layer] = {'key': name, 'path': f'Models/metroViaduct/{name}.png'}
            pieces.append(entry)
        art[axis] = pieces
    js = ('// Generated by scripts/prepare-metro-elevated-station-assets.py - the 高架站 from Norton\'s render, in\n'
          '// five upright strips left to right as drawn (x: the long way up-right; y: its mirror), each a\n'
          '// deck layer (the tracks, all under the deck) and an island layer (the platform, the roof) the\n'
          '// far track\'s trains go between; anchor: the tile\'s middle on the ground; each a power of two\n'
          '// each way, drawn at `scale` of a 512-px tile.\n'
          f'const METRO_ELEVATED_STATION_ART = Object.freeze({json.dumps(art, indent=2, ensure_ascii=False)});\n'
          "if (typeof module !== 'undefined') module.exports = { METRO_ELEVATED_STATION_ART };\n")
    (ROOT / 'metro-station-art.js').write_text(js)
    # a preview: the strips put back together, a train's place on the far track in red
    prev = Image.new('RGBA', S_SIZE, (96, 108, 82, 255))
    prev.alpha_composite(Image.fromarray(base))
    prev.alpha_composite(Image.fromarray(island))
    prev.convert('RGB').resize((S_SIZE[0] // 2, S_SIZE[1] // 2), Image.LANCZOS).save(ROOT / 'docs/assets/metro-elevated-station-preview.jpg', quality=85)
    print('done', S_SIZE)


if __name__ == '__main__' and '--s' in sys.argv:
    render_s().save(sys.argv[-1])
elif __name__ == '__main__':
    main()
