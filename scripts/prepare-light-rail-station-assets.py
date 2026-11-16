"""輕鐵站 (docs/light-rail-design.md §3, phase 3): the game's station pictures from Norton's render
(scripts/source-art/lightRail/original/lightRailStation.png, 豐年路: two side platforms, orange arched
canopies, stairs down at one end; kept as it is).

1. Cut out: the render's background is a painted checkerboard (243 / 254 grey) - flood-filled from the
   edges, and the patches of it enclosed by the canopies (half one grey, half the other) taken too.
2. Squared as a building is (Norton's method: a vertical skew and an x:y scale fitted to the main lines,
   never a perspective warp): the platform edges and yellow lines run at -0.303, the ends from 0.33 (the
   stairs) to 0.51 (the far end) - their mean, 0.42, taken.
3. Sized to the game's track: the render's two tracks 3.8 m apart are put on the game's 4.5 m (±2.25 m,
   railway-track.js), which makes its platforms 1.75 tiles long - a two-car set's length.
4. Split in two about the cars between the platforms: the near platform (its slab, railings, posts,
   canopy and stairs - a hand-traced outline, NEAR_TOP) drawn in front of the cars; the far platform behind
   them. The render's track bed is taken out (the game's own track shows); its stations' name boards are
   left blank (every station would read 豐年路). A level crossing for the passengers (行人平交路, Norton:
   輕鐵站獨有既就係平交路) is laid across both tracks at the stairs' feet, in the far layer (under the cars).
5. Night: the tube lights under the canopies, their glow and the light they throw, a layer each.

Writes Models/lightRail/lrt_station_<rise|fall>_<base|front>[_lit].png (power-of-two canvases) and
light-rail-station-art.js (each picture's anchor - the middle of the two tracks at the platforms' middle,
on the ground - and its scale at TILE_WIDTH 100). 'fall' is 'rise' mirrored.
Run: .venv/bin/python -B scripts/prepare-light-rail-station-assets.py
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'scripts/source-art/lightRail/original/lightRailStation.png'
OUT = ROOT / 'scripts/source-art/lightRail/squared'
GAME = ROOT / 'Models/lightRail'
ART_JS = ROOT / 'light-rail-station-art.js'

SLOPE_LONG, SLOPE_SHORT = -0.303, 0.42
# In the squared render (px): c = y + x / 2 is the same all along a line the track's way (across the
# station: c rises 1 a px of screen x), a = x - c the same across it (along the station).
RAILS_C = (784, 824, 887, 923)           # the render's four rails, measured
TRACKS_C = ((RAILS_C[0] + RAILS_C[1]) / 2, (RAILS_C[2] + RAILS_C[3]) / 2)
MID_C = (TRACKS_C[0] + TRACKS_C[1]) / 2
# the platforms' walls at the bed (ground), and along: the far one's ends, the near one's
FAR_WALL_C, NEAR_WALL_C = 745, 955
FAR_ENDS_X, NEAR_ENDS_X = (140, 925), (430, 1188)
GAME_TRACK_M = 4.5                        # the game's two tracks apart (railway-track.js: ±2.25 m)
GAME_PX_PER_M = 2.5                       # a ground metre's screen x at TILE_WIDTH 100 (a tile 50 px)
SCALE = GAME_TRACK_M * GAME_PX_PER_M / (TRACKS_C[1] - TRACKS_C[0])   # squared px -> TILE_WIDTH 100 px
RENDER_PX_PER_GAME_M = GAME_PX_PER_M / SCALE
TEX_SHRINK = 0.5                          # squared px -> texture px (still sharp at zoom 3)

# The near platform's outline's top (squared px): its stairs' handrails, its canopy's top (bay by bay),
# its right end's railings; everything under it is the near platform's or seen through it.
NEAR_TOP = [(285, 712), (330, 700), (372, 640), (385, 598), (392, 553), (410, 536), (480, 490), (526, 484),
            (586, 435), (640, 430), (700, 375), (750, 360), (790, 340), (810, 320), (945, 254), (1040, 199),
            (1072, 190), (1112, 198), (1140, 220), (1148, 252), (1152, 300), (1188, 300)]
ROOF_REACH = 14                            # roof-coloured pixels this far over the outline are the near roof's
# the name boards (squared px boxes, for the near platform's outline and the night layer)
SIGN_BOXES = [(228, 330, 395, 450), (872, 345, 1012, 455)]
# ... and each board's corners (top left, top right, bottom right, bottom left), read off the render.
# Norton, 2026-11-15: 站牌名稱應該係比較細的 - each is shrunk about its middle, its lettering with it;
# what it hid is filled in: the far board's from the next bay along (BAY: the canopy's pillar spacing,
# its beam, tube light and railing the same there), the near board's left clear (behind it is the gap
# between the platforms, where the game's own track shows).
SIGN_BOARDS = [
    dict(corners=[(227.5, 406), (385, 344), (387.5, 381), (230, 440)], fill='bay'),
    # (the near one: the gap behind it left clear, the canopy's beam and the handrail - orange, running
    # along the platform - carried across it from the columns either side, REFS)
    dict(corners=[(875, 416), (1009, 355), (1012.5, 382.5), (876, 446)], fill='clear', refs=(842, 1040)),
]
SIGN_SHRINK = 0.55
BAY = (196, -97)
# the notice boards (squared px boxes): not lit at night (Norton: 站牌不要亮燈)
NOTICE_BOXES = [(628, 172, 726, 300), (768, 448, 852, 640)]
NEAR_BOARD_BOX = (768, 448, 852, 640)        # the near platform's notice board
# the passengers' crossing: across both tracks this far from the platforms' middle toward the stairs
# (metres along; the stairs' feet are some 22-23 m out), this wide
CROSSING_ALONG_M, CROSSING_WIDTH_M = -22.5, 4.0


def cut(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    h, w = a.shape[:2]
    pale = (a.min(2) >= 234) & ((a.max(2) - a.min(2)) <= 8)
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if pale[y, x]: bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if pale[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and pale[yy, xx] and not bg[yy, xx]:
                bg[yy, xx] = True; q.append((yy, xx))
    # the checker seen through the canopies: pale patches half one grey, half the other (the tube lights,
    # all bright, stay)
    seen = bg.copy()
    for y0, x0 in zip(*np.nonzero(pale & ~bg)):
        if seen[y0, x0]: continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and pale[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; q.append((yy, xx))
        ys, xs = np.array(pts).T
        v = a[ys, xs, 0]
        if len(pts) > 150 and 0.25 < ((v >= 240) & (v <= 247)).mean() < 0.75:
            bg[ys, xs] = True
    return Image.fromarray(np.dstack([a.astype(np.uint8), np.where(bg, 0, 255).astype(np.uint8)]), 'RGBA')


def square(img):
    """A vertical skew and an x shrink: both ground ways at 0.5 (heights as drawn)."""
    s = -(SLOPE_LONG + SLOPE_SHORT) / 2
    k = 0.5 / (SLOPE_SHORT + s)
    w, h = img.size
    pad = int(abs(s) * w) + 4
    out = img.convert('RGBa').transform((int(round(w / k)), h + 2 * pad), Image.AFFINE, (k, 0, 0, -s * k, 1, -pad),
                                        resample=Image.BICUBIC).convert('RGBA')
    box = out.getbbox()
    return out.crop(box), (s, k, box)


def orange_or_teal(r, g, b):
    return ((r > 170) & (g > 60) & (g < 150) & (b < 90) & (r - b > 100)) | ((g > 110) & (b > 90) & (r < 130) & (g - r > 40))


def masks(a):
    """(near, bed): the near platform's pixels, and the render's track bed's (taken out)."""
    h, w = a.shape[:2]
    r, g, b, al = (a[..., i].astype(int) for i in range(4))
    ys, xs = np.mgrid[0:h, 0:w]
    c = ys + 0.5 * xs
    lum = (r + g + b) / 3
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    # the outline's top, each column
    px, py = zip(*NEAR_TOP)
    top = np.interp(np.arange(w), px, py, left=h + 1, right=py[-1])
    inside = ys >= top[None, :]
    orange = (r > 170) & (g > 60) & (g < 150) & (b < 90) & (r - b > 100)
    teal = (g > 110) & (b > 90) & (r < 130) & (g - r > 40)
    roofish = (orange | teal) & (ys >= top[None, :] - ROOF_REACH) & (xs >= NEAR_TOP[3][0])
    # the bed: grey stones, sleepers and rails between the platforms' walls, on the ground
    band = (c >= FAR_WALL_C - 4) & (c <= NEAR_WALL_C - 18)
    # Between the platforms, on the screen, only the near platform's own structure is kept - its canopy,
    # posts, railings (orange, teal, white tubes and highlights, and their outlines), its name board and
    # notice board; the rest there is the render's track bed (the game lays its own).
    grow = lambda m, k: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(k))) > 0
    # (the tube lights' white, not a pale stone's: very bright, and against the canopy's colours)
    tubes = (lum > 205) & (sat < 70) & grow(orange_or_teal(r, g, b), 15)
    structure = grow(orange_or_teal(r, g, b), 5) | grow(tubes, 3)
    boards = np.zeros_like(band)
    for x0, y0, x1, y1 in SIGN_BOXES + [NEAR_BOARD_BOX]:
        boards[y0:y1, x0:x1] = True
    bed = (al > 0) & band & ~((inside & structure) | (inside & boards))
    # and the specks left between the platforms (a rusty rail's bit passing for orange)
    keep = (al > 0) & inside & ~bed & band
    seen = np.zeros_like(keep)
    for y0, x0 in zip(*np.nonzero(keep)):
        if seen[y0, x0]: continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
        while q and len(pts) <= 80:
            y, x = q.popleft(); pts.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and keep[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; q.append((yy, xx))
        if len(pts) <= 80 and not q:
            ys_, xs_ = np.array(pts).T
            bed[ys_, xs_] = True
    near = (al > 0) & ((inside & ~bed) | roofish)
    return near, bed


def sign_board_mask(a, board):
    """A name board's pixels: its black panel, white lettering and red logo reached from its middle
    (within its corners grown a little), then its outline's convex hull - every pixel of it, the lip
    and shadow under its lower edge too."""
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(int)
    lum, sat = rgb.mean(2), rgb.max(2) - rgb.min(2)
    boardish = (a[..., 3] > 100) & ((rgb.max(2) < 80) | ((rgb.min(2) > 160) & (sat < 45)) | ((rgb[..., 0] > 120) & (rgb[..., 0] - rgb[..., 1] > 60)))
    near_img = Image.new('L', (w, h), 0)
    ImageDraw.Draw(near_img).polygon(board['corners'], fill=255)
    near = np.asarray(near_img.filter(ImageFilter.MaxFilter(17))) > 0
    boardish &= near
    cx = int(np.mean([p[0] for p in board['corners']])); cy = int(np.mean([p[1] for p in board['corners']]))
    seen = np.zeros((h, w), bool)
    starts = [(y, x) for y in range(cy - 6, cy + 7) for x in range(cx - 6, cx + 7) if boardish[y, x]]
    q = deque(starts)
    for y, x in starts: seen[y, x] = True
    while q:
        y, x = q.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and boardish[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True; q.append((yy, xx))
    ys, xs = np.nonzero(seen)
    pts = sorted(set(zip(xs.tolist(), ys.tolist())))
    cross = lambda o, a_, b: (a_[0] - o[0]) * (b[1] - o[1]) - (a_[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p_ in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p_) <= 0: lower.pop()
        lower.append(p_)
    for p_ in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p_) <= 0: upper.pop()
        upper.append(p_)
    hull = lower[:-1] + upper[:-1]
    mask_img = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask_img).polygon(hull, fill=255)
    return np.asarray(mask_img.filter(ImageFilter.MaxFilter(3))) > 0


def resize_signs(a):
    """Each name board shrunk about its middle (SIGN_SHRINK), its lettering with it, and what it hid
    filled in (SIGN_BOARDS)."""
    out = a.copy()
    h, w = a.shape[:2]
    for board in SIGN_BOARDS:
        mask = sign_board_mask(a, board)
        ys, xs = np.nonzero(mask)
        # the board itself, cut out
        board_px = np.zeros_like(a)
        board_px[mask] = a[mask]
        # what it hid
        if board['fill'] == 'bay':
            dx, dy = BAY
            sy, sx = ys + dy, xs + dx
            ok = (sy >= 0) & (sy < h) & (sx >= 0) & (sx < w)
            out[ys[ok], xs[ok]] = a[sy[ok], sx[ok]]
        else:
            out[ys, xs, 3] = 0
            for x, y in zip(xs, ys):
                best = None
                for xr in board.get('refs', ()):
                    yr = int(round(y + 0.5 * (x - xr)))      # along the platform (-0.5) to that column
                    if not (0 <= yr < h):
                        continue
                    r_, g_, b_, al_ = (int(v) for v in a[yr, xr])
                    if al_ > 200 and r_ > 150 and 50 < g_ < 160 and b_ < 100 and r_ - b_ > 90:
                        if best is None or abs(x - xr) < best[0]:
                            best = (abs(x - xr), a[yr, xr])
                if best is not None:
                    out[y, x] = best[1]
        # the board, smaller, about its middle
        cx, cy = np.mean([p[0] for p in board['corners']]), np.mean([p[1] for p in board['corners']])
        k = SIGN_SHRINK
        small = Image.fromarray(board_px, 'RGBA').convert('RGBa').transform(
            (w, h), Image.AFFINE, (1 / k, 0, cx - cx / k, 0, 1 / k, cy - cy / k), resample=Image.BICUBIC).convert('RGBA')
        base = Image.fromarray(out, 'RGBA')
        base.alpha_composite(small)
        out = np.asarray(base).copy()
    return out


def ground_point(along_px, c):
    """The screen point (squared px) of a ground point: `along_px` (a = x - c) and c."""
    x = along_px + c
    return x, c - 0.5 * x


def crossing(size, centre_a):
    """The passengers' level crossing: concrete boards across both tracks (as the game lays them, ±2.25 m
    either side of the middle, rails 1.435 m apart) between the platforms' walls, the rails through it,
    a yellow line along each edge."""
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = RENDER_PX_PER_GAME_M
    a0 = centre_a + CROSSING_ALONG_M * m
    half = CROSSING_WIDTH_M / 2 * m
    quad = lambda a_lo, a_hi, c_lo, c_hi: [ground_point(a_lo, c_lo), ground_point(a_hi, c_lo), ground_point(a_hi, c_hi), ground_point(a_lo, c_hi)]
    c_lo, c_hi = FAR_WALL_C, NEAR_WALL_C
    d.polygon(quad(a0 - half, a0 + half, c_lo, c_hi), fill=(176, 172, 164, 255))
    # the boards' joints
    for k in range(1, 6):
        a = a0 - half + 2 * half * k / 6
        d.line([ground_point(a, c_lo), ground_point(a, c_hi)], fill=(150, 146, 138, 255), width=2)
    # yellow lines along both edges
    for a in (a0 - half + 0.25 * m, a0 + half - 0.25 * m):
        d.line([ground_point(a, c_lo), ground_point(a, c_hi)], fill=(232, 196, 40, 255), width=3)
    # the rails through it (the game's, not the render's)
    for t in (-1, 1):
        for g_ in (-1, 1):
            rc = MID_C + (t * GAME_TRACK_M / 2 + g_ * 1.435 / 2) * m
            d.line([ground_point(a0 - half, rc), ground_point(a0 + half, rc)], fill=(96, 92, 88, 255), width=4)
            d.line([ground_point(a0 - half, rc - 1.5), ground_point(a0 + half, rc - 1.5)], fill=(196, 196, 200, 255), width=1)
    return img


def tube_light_layer(a):
    """The tube lights under the canopies lit: their pixels (bright, unsaturated, long), a glow round them
    and a pool of light below each on the platform - not the name boards' lettering nor the notice boards
    (Norton, 2026-11-15: 站牌不要亮燈)."""
    rgb = a[..., :3].astype(float)
    al = a[..., 3]
    lum = rgb.mean(2)
    sat = rgb.max(2) - rgb.min(2)
    tubes = (al > 200) & (lum > 232) & (sat < 40)
    for x0, y0, x1, y1 in SIGN_BOXES + NOTICE_BOXES:
        tubes[y0:y1, x0:x1] = False
    tube_img = Image.fromarray((tubes * 255).astype(np.uint8))
    glow = np.asarray(tube_img.filter(ImageFilter.GaussianBlur(9)), np.float32) / 255.0
    pool = np.asarray(tube_img.transform(tube_img.size, Image.AFFINE, (1, 0, 0, 0, 1, -70)).filter(ImageFilter.GaussianBlur(22)), np.float32) / 255.0
    strength = np.clip(tubes * 1.0 + glow * 2.2 + pool * 0.9, 0, 1) * (al > 30)
    layer = np.zeros(a.shape, np.float32)
    layer[..., :3] = (255, 236, 196)
    layer[..., 3] = strength * 255
    return layer.round().astype(np.uint8)


def pow2_canvas(img):
    W, H = 1, 1
    while W < img.width + 16: W *= 2
    while H < img.height + 16: H *= 2
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ox, oy = (W - img.width) // 2, (H - img.height) // 2
    canvas.paste(img, (ox, oy))
    return canvas, (ox, oy)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    GAME.mkdir(parents=True, exist_ok=True)
    sq, _ = square(cut(SRC))
    a = resize_signs(np.asarray(sq).copy())
    near, bed = masks(a)
    base = a.copy(); base[..., 3] = np.where(near | bed, 0, a[..., 3])
    front = a.copy(); front[..., 3] = np.where(near, a[..., 3], 0)
    # the platforms' middle along (a = x - c), each platform's ends at its wall
    far_a = [x - FAR_WALL_C for x in FAR_ENDS_X]
    near_a = [x - NEAR_WALL_C for x in NEAR_ENDS_X]
    centre_a = (sum(far_a) + sum(near_a)) / 4
    length_m = ((far_a[1] - far_a[0]) + (near_a[1] - near_a[0])) / 2 / RENDER_PX_PER_GAME_M
    ax, ay = ground_point(centre_a, MID_C)
    base_img = Image.fromarray(base, 'RGBA')
    cross = crossing(base_img.size, centre_a)
    cross.alpha_composite(base_img)        # (the platforms' stairs over the crossing's ends)
    base_img = cross
    front_img = Image.fromarray(front, 'RGBA')
    lit = tube_light_layer(a)
    # (each layer's light only on its own pixels: none on the render's bed, taken out - the game's track
    # shows there, and a pool of light over it read as white specks)
    base_lit = lit.copy(); base_lit[..., 3] = np.where(np.asarray(base_img)[..., 3] > 30, lit[..., 3], 0)
    front_lit = lit.copy(); front_lit[..., 3] = np.where(front[..., 3] > 30, lit[..., 3], 0)
    layers = {'base': base_img, 'front': front_img, 'base_lit': Image.fromarray(base_lit, 'RGBA'), 'front_lit': Image.fromarray(front_lit, 'RGBA')}
    # check sheet: the layers on green, the anchor, the game's track lines
    chk = Image.new('RGBA', base_img.size, (60, 120, 70, 255))
    chk.alpha_composite(base_img)
    tint = np.asarray(front_img).copy(); tint[..., 0] = np.minimum(255, tint[..., 0].astype(int) + 60).astype(np.uint8)
    chk.alpha_composite(Image.fromarray(tint, 'RGBA'))
    dd = ImageDraw.Draw(chk)
    for t in (-1, 1):
        rc = MID_C + t * GAME_TRACK_M / 2 * RENDER_PX_PER_GAME_M
        dd.line([ground_point(-900, rc), ground_point(400, rc)], fill=(0, 255, 255, 255), width=2)
    dd.ellipse([ax - 6, ay - 6, ax + 6, ay + 6], outline=(255, 0, 0, 255), width=3)
    chk.save(OUT / 'station_check.png')
    art = {}
    for view in ('rise', 'fall'):
        entry = {}
        for name, img in layers.items():
            src = img if view == 'rise' else img.transpose(Image.FLIP_LEFT_RIGHT)
            small = src.convert('RGBa').resize((round(src.width * TEX_SHRINK), round(src.height * TEX_SHRINK)), Image.LANCZOS).convert('RGBA')
            canvas, (ox, oy) = pow2_canvas(small)
            key = f'lrt_station_{view}_{name}'
            canvas.save(GAME / f'{key}.png')
            entry[name] = {'key': key, 'path': f'Models/lightRail/{key}.png'}
        sx = ax if view == 'rise' else base_img.width - ax
        entry['anchor'] = [round(sx * TEX_SHRINK + ox, 1), round(ay * TEX_SHRINK + oy, 1)]
        entry['size'] = [canvas.width, canvas.height]
        entry['scale'] = round(SCALE / TEX_SHRINK, 5)
        art[view] = entry
    art['platformTiles'] = round(length_m / 20, 3)
    art['crossingAlongTiles'] = round(CROSSING_ALONG_M / 20, 3)
    ART_JS.write_text(
        '// Generated by scripts/prepare-light-rail-station-assets.py - 輕鐵站 from Norton\'s render: each way it lies on screen\n'
        '// (rise: its track down-left to up-right; fall: the other way), its far platform and the passengers\' crossing\n'
        '// (base, drawn behind the cars), its near platform (front, in front of them), and their tube lights at night\n'
        '// (_lit). anchor: the middle of the two tracks at the platforms\' middle, on the ground; scale at TILE_WIDTH 100.\n'
        '// Its stairs and crossing are at the end lower on the screen.\n'
        f'const LIGHT_RAIL_STATION_ART = Object.freeze({json.dumps(art, indent=2)});\n\n'
        "if (typeof module !== 'undefined' && module.exports) module.exports = { LIGHT_RAIL_STATION_ART };\n", encoding='utf-8')
    print(f'scale {SCALE:.4f} (TILE_WIDTH 100), platforms {length_m:.1f} m = {length_m / 20:.2f} tiles, anchor ({ax:.0f}, {ay:.0f})')


if __name__ == '__main__':
    main()
