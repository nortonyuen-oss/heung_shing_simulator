"""地鐵第四期 step 2: the 高架站 (an island platform, a track either side) from Norton's render
(scripts/source-art/metroStation/original/elevatedStationIsland.png, 2026-11-05).

- The footbridge off (it reaches out over the next tiles), the pier behind it finished down to the
  ground; under the deck squashed evenly (not cut: the concourse keeps its sign and windows) so the
  track stands 17 m up, as the viaducts'; squared to 2:1 (its long lines are 0.30 steep) and scaled to
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


SQUASH = 51                       # render px out from under the deck (see measure())
SQUARE = 1 / (2 * 0.30)           # the render's long lines, 0.30 steep, to 2:1
SCALE = 90 * 12.8 / (1620 - 298)  # the platform's front edge (x 298 to 1620) to 90 m


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
V0, U0 = 1085.4 - 0.575 * 12.8, 304.2  # (the platform's corners: floor front (268.3, 995) and
X0, Y0 = V0 - U0, (U0 + V0) / 2        # (1415, 421.7), back (150, 933.3))
FLOOR_PX = 16.7                   # the platform's floor above the track
PLATFORM_NEAR_M = 4.72 + 0.575    # its near edge from the middle
PLATFORM_HALF_L = 44.8
TRACK_M = 7.03                    # each track from the middle (measured 6.45 + 0.575, 7.6 - 0.575)
DECK_HALF_M = 10.0
STATION_HALF_L = 50.0             # five tiles
DECK_PX = viaduct.DECK_M * viaduct.Z_PX    # the track above the ground (170)
ROOF_RIM_V = 958                  # below the roof's front rim: the gap where the far track shows
FAR_TRAIN_V = 1012                # ... down to the platform's far edge
# things standing in the gap, in front of the far track (boxes in S: the escalators, the signs)
GAP_THINGS = [(340, 700, 505, 895), (1040, 390, 1200, 555), (855, 530, 925, 595),
              (1245, 330, 1320, 385), (605, 655, 685, 740)]


def coords(shape):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return xx, yy, yy + 0.5 * xx, yy - 0.5 * xx


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
    return cand & (A > 0) & (~gap | thing)


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
    concrete[..., :3] = np.clip(viaduct.CONCRETE_TOP[None, None, :] * (1 + 0.12 * noise[..., None]), 0, 255).astype(np.uint8)
    concrete[..., 3] = 255
    for side in (-1, 1):
        zone = (side * Lt > PLATFORM_HALF_L + 0.2) & (side * Lt <= STATION_HALF_L)
        # (the plain deck: between the tracks and outside the far one, the far parapet standing above)
        plain = zone & (((Ct > -FAR_LANE[1] - 0.01) & (Ct < LANE[0])) | ((Ct > -DECK_HALF_M + 0.4) & (Ct <= -FAR_LANE[0])))
        out[plain] = concrete[plain]
        dl = side * LANE_FROM_L      # the source is further in: dest + (-dl along L)
        for dc, lo, hi in ((0.0, LANE[0], LANE[1]), (2 * TRACK_M, -FAR_LANE[0], -FAR_LANE[1])):
            # source at (L - dl, C + dc): screen offset from dest
            sx = PX_M * (-dl + dc)
            sy = PX_M / 2 * (dc + dl)
            src = shift(a, -sx, -sy)
            lane = zone & (Ct >= lo) & (Ct < hi)
            out[lane] = src[lane]
    return out


S_SIZE = None


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


def main():
    global S_SIZE
    s = render_s()
    S_SIZE = s.size
    a = np.asarray(s).copy()
    isl = island_mask(a)
    island = a.copy()
    island[~isl] = 0
    base = ends(a, isl)
    art = {}
    for axis, flip in (('x', False), ('y', True)):
        b = base[:, ::-1] if flip else base
        i = island[:, ::-1] if flip else island
        pieces = []
        for k, (box, anchor) in enumerate(strips(b, i, flip)):
            x0, y0, x1, y1 = box
            entry = {'anchor': list(anchor), 'size': [int(x1 - x0), int(y1 - y0)]}
            for layer, img in (('base', b), ('island', i)):
                name = f'metro_elevated_station_{axis}_{k}_{layer}'
                Image.fromarray(np.ascontiguousarray(img[y0:y1, x0:x1])).save(OUT / f'{name}.png')
                entry[layer] = {'key': name, 'path': f'Models/metroViaduct/{name}.png'}
            pieces.append(entry)
        art[axis] = pieces
    js = ('// Generated by scripts/prepare-metro-elevated-station-assets.py - the 高架站 from Norton\'s render, in\n'
          '// five upright strips left to right as drawn (x: the long way up-right; y: its mirror), each a\n'
          '// deck layer (the tracks, all under the deck) and an island layer (the platform, the roof) the\n'
          '// far track\'s trains go between; anchor: the tile\'s middle on the ground (a 512-px tile\'s scale).\n'
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
