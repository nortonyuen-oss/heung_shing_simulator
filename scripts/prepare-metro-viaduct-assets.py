"""地鐵第三期 step 4: elevated track (Models/metroViaduct/), drawn in code like the track (Norton,
2026-11-05: a separate 高架路軌 tool; the deck 8 m up, then 17 m to meet his elevated station, then
20 m - three hill levels - to meet a hilltop).

- Deck pieces, one for each track layout a tile may hold (railway-track.js: the six bits, the X/Y
  crossing, the two pairs of diagonals): the track tile's ballast, sleepers and rails 20 m up on a
  concrete deck a little wider than the ballast, a 1.2 m parapet along each side, a square pier
  down to the ground under the middle of each track.
- Ramp pieces, for X and Y, rising either way, in five steps (0 to 20 m over five tiles): the track
  on a slope over a solid embankment with retaining walls.
- An elevated station's end tiles (the station itself: prepare-metro-elevated-station-assets.py):
  the deck narrowing from the station's and its tracks coming in from 7.03 m to the line's.

The solids are built by stacking: each top-down shape is drawn at every height from its foot to its
top, the lower layers showing as its sides, so any shape - a diagonal deck, a sloped ramp - gets
walls. 512 px a tile across like the track tiles, on a canvas 512 x 544 with the tile's diamond
from y 288 (room for the deck above), its centre on the ground at (256, 416).

Run with .venv/bin/python -B scripts/prepare-metro-viaduct-assets.py (--spread: the station's end tiles only)
"""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('track', ROOT / 'scripts/prepare-railway-track-assets.py')
track = importlib.util.module_from_spec(spec)
spec.loader.exec_module(track)

OUT = ROOT / 'Models/metroViaduct'
W, H = 512, 544
TOP = 288                # the tile diamond's top corner, y (room above for the deck, 17 m up)
N = track.TD             # top-down px a tile side (as the track's)
Z_PX = 10.0              # px a metre up (as the platforms')
HILL_LEVEL_M = 13 * (512 / 100) / 10.0   # a terrain level (HEIGHT_STEP_PIXELS 13 at TILE_WIDTH 100), 6.656 m
DECK_M = 3 * HILL_LEVEL_M  # Norton 2026-11-06: three hill levels (20 m), meeting a level-3 hilltop flush
SLAB_M = 1.5
PARAPET_M = 1.2
PIER_M = 2.4             # a pier's side
DECK_WIDEN_M = 0.8       # the deck beyond the ballast each side
RAMP_STEPS = 5           # (a ramp of five tiles for the 17 m)

CONCRETE_TOP = np.array([170, 168, 162], np.float32)
CONCRETE_SIDE = np.array([132, 130, 125], np.float32)
CONCRETE_DARK = np.array([104, 102, 98], np.float32)
PIER = np.array([148, 146, 140], np.float32)


def warp(rgba, plane=(0.0, 0.0, 0.0)):
    """A top-down image (n x n, col right, row down, one tile) to the canvas, its surface at height
    h = plane[0] + plane[1] * col_m + plane[2] * row_m metres (a plane: the mapping stays affine)."""
    n = rgba.shape[0]
    h0, hc, hr = plane
    s = n / track.TILE_M                     # top-down px a metre
    ax, bx, cx = (W / 2) / n, -(W / 2) / n, W / 2
    ay = (W / 4) / n - Z_PX * hc / s
    by = (W / 4) / n - Z_PX * hr / s
    cy = TOP - Z_PX * h0
    inv = np.linalg.inv(np.array([[ax, bx, cx], [ay, by, cy], [0, 0, 1]]))
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')
    return img.transform((W, H), Image.AFFINE, tuple(inv[0]) + tuple(inv[1]), resample=Image.BICUBIC)


SOLID_N = N // 2   # the solids' top-down px a tile side (their sides need less than the track)


def plane_heights(plane, n=SOLID_N):
    s = n / track.TILE_M
    m = (np.arange(n) + 0.5) / s
    C, R = np.meshgrid(m, m)
    return plane[0] + plane[1] * C + plane[2] * R


def extrude(canvas, mask, base, top, side, top_colour):
    """A solid on `mask` (SOLID_N square, 0..1) from the plane `base` up to the plane `top` (each
    (h0, per metre along col, per metre along row)): layers of `side` from the bottom up, a pixel
    apart, then its top face."""
    lo, hi = plane_heights(base), plane_heights(top)
    inside = mask > 0.5
    if not inside.any():
        return
    step = 1.0 / Z_PX
    z = float(lo[inside].min())
    zmax = float(hi[inside].max())
    while z < zmax - step:
        layer = mask * (lo <= z) * (hi >= z + step)
        if layer.any():
            rgba = np.zeros((SOLID_N, SOLID_N, 4), np.float32)
            rgba[..., :3] = side
            rgba[..., 3] = layer * 255
            canvas.alpha_composite(warp(rgba, (z, 0.0, 0.0)))
        z += step
    rgba = np.zeros((SOLID_N, SOLID_N, 4), np.float32)
    rgba[..., :3] = top_colour
    rgba[..., 3] = mask * 255
    canvas.alpha_composite(warp(rgba, top))


def track_layers_image(layers, plane):
    """The track's ballast, sleepers and rails (prepare-railway-track-assets.py layers) on a surface."""
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    base = np.concatenate([layers['gravel'], layers['bed'][..., None] * 255], axis=2)
    sl = np.concatenate([layers['sleeper_rgb'], layers['sleeper_a'][..., None] * 255], axis=2)
    rl = np.concatenate([layers['rail_rgb'], layers['rail_a'][..., None] * 255], axis=2)
    out.alpha_composite(warp(base, plane))
    out.alpha_composite(warp(sl, plane))
    out.alpha_composite(warp(rl, (plane[0] + 0.15, plane[1], plane[2])))
    return out


def deck_masks(bits_tracks):
    """The deck under the track and the parapet along its two sides, from each track's line: across
    it (measured along the tile edges, as the track is) the ballast's half width and a little more;
    the parapet the outermost 0.35 m. A crossing's parapets stop where the other deck runs on."""
    n = SOLID_N
    m = (np.arange(n) + 0.5) / n * track.TILE_M
    col, row = np.meshgrid(m, m)
    half = track.BED_HALF + DECK_WIDEN_M
    deck = np.zeros((n, n), bool)
    inner = np.zeros((n, n), bool)
    for bit in bits_tracks:
        diagonal = bit not in ('X', 'Y')
        squeeze = track.DIAG_ACROSS if diagonal else 1.0
        over = 3.0 if diagonal else 0.0
        s0, t0, length = track.path_coords(bit, 0.0, col, row)
        on = (s0 >= -over) & (s0 <= length + over)
        across = np.abs(t0) * squeeze
        deck |= (across <= half) & on
        inner |= (across <= half - 0.35) & on
    return deck.astype(np.float32), (deck & ~inner).astype(np.float32)


def pier_mask(bits_tracks):
    """A square pier under the middle of each track's line on the tile."""
    s = SOLID_N / track.TILE_M
    m = np.zeros((SOLID_N, SOLID_N), np.float32)
    for bit in bits_tracks:
        if bit in ('X', 'Y'):
            cx, cy = 10.0, 10.0
        else:
            ccx, ccy = track.CORNERS[bit]
            cx = ccx + (5.0 if ccx == 0 else -5.0)
            cy = ccy + (5.0 if ccy == 0 else -5.0)
        h = PIER_M / 2
        m[int((cy - h) * s):int((cy + h) * s), int((cx - h) * s):int((cx + h) * s)] = 1
    return m


def deck_piece(bits_tracks, rng, foot=0.0):
    """`foot`: the pier's foot, metres up (a low hill's ground under the deck)."""
    layers = track.draw_tile(bits_tracks, rng)
    deck, ring = deck_masks(bits_tracks)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    extrude(canvas, pier_mask(bits_tracks), (foot, 0.0, 0.0), (DECK_M - SLAB_M, 0.0, 0.0), PIER * 0.85, PIER)
    extrude(canvas, deck, (DECK_M - SLAB_M, 0.0, 0.0), (DECK_M, 0.0, 0.0), CONCRETE_SIDE, CONCRETE_TOP)
    canvas.alpha_composite(track_layers_image(layers, (DECK_M, 0.0, 0.0)))
    extrude(canvas, ring, (DECK_M, 0.0, 0.0), (DECK_M + PARAPET_M, 0.0, 0.0), CONCRETE_DARK, CONCRETE_TOP)
    return canvas


def ramp_piece(axis, up, step, rng):
    """`axis` 'X' (along row) or 'Y' (along col); `up` the side it rises towards; `step` 1..3."""
    layers = track.draw_tile([axis], rng)
    deck, ring = deck_masks([axis])
    lo, hi = (step - 1) / RAMP_STEPS * DECK_M, step / RAMP_STEPS * DECK_M
    rise = (hi - lo) / track.TILE_M           # metres a metre along
    plane = {'n': (hi, 0.0, -rise), 's': (lo, 0.0, rise), 'w': (hi, -rise, 0.0), 'e': (lo, rise, 0.0)}[up]
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # the embankment from the ground up to the slope, the track on it, the parapets on the slope
    extrude(canvas, deck, (0.0, 0.0, 0.0), plane, CONCRETE_SIDE, CONCRETE_TOP)
    canvas.alpha_composite(track_layers_image(layers, plane))
    extrude(canvas, ring, plane, (plane[0] + PARAPET_M, plane[1], plane[2]), CONCRETE_DARK, CONCRETE_TOP)
    return canvas


# ── 島式月台 (Norton, 2026-11-05: island platforms for the elevated stations) ────────────────────────
# An elevated station (Norton's render, scripts/prepare-metro-elevated-station-assets.py) has its tracks
# 7.03 m either side of the middle, its deck 10 m; a tile at each end spreads them from 2.25 m.
ISLAND_TRACK_M = 7.03
ISLAND_DECK_HALF_M = 10.0
NARROW_DECK_HALF_M = track.BED_HALF + DECK_WIDEN_M


def frame(axis, a, b):
    """(across the line, along it) in metres to (col, row): X runs along row at col 10, Y along col at row 10."""
    return (10.0 + a, b) if axis == 'X' else (b, 10.0 + a)


def band_mask(axis, half_at, b0=0.0, b1=20.0, inner_at=None):
    """Top-down: |across| <= half_at(along) (and >= inner_at(along)), along between b0 and b1."""
    n = SOLID_N
    m = (np.arange(n) + 0.5) / n * track.TILE_M
    C, R = np.meshgrid(m, m)
    a, bb = (C - 10.0, R) if axis == 'X' else (R - 10.0, C)
    out = (np.abs(a) <= half_at(bb)) & (bb >= b0) & (bb <= b1)
    if inner_at is not None:
        out &= np.abs(a) >= inner_at(bb)
    return out.astype(np.float32)


def spread_piece(axis, wide_lo, rng):
    """The tile off a station's end: the deck narrowing and the tracks coming in from the station's
    7.03 m to the line's 2.25 m (the wide end at b = 0 if wide_lo, else at b = 20)."""
    k = lambda bb: (1 - bb / 20.0) if wide_lo else (bb / 20.0)       # 1 at the wide end
    half = lambda bb: NARROW_DECK_HALF_M + (ISLAND_DECK_HALF_M - NARROW_DECK_HALF_M) * k(bb)
    t0, t1 = (ISLAND_TRACK_M, track.EDGE_OFFSET) if wide_lo else (track.EDGE_OFFSET, ISLAND_TRACK_M)
    pair = ('PAIR', (frame(axis, -t0, 0.0), frame(axis, -t1, 20.0)), (frame(axis, t0, 0.0), frame(axis, t1, 20.0)))
    layers = track.draw_tile([pair], rng)
    deck = band_mask(axis, half)
    ring = band_mask(axis, half, inner_at=lambda bb: half(bb) - 0.35)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    s_ = SOLID_N / track.TILE_M
    pier = np.zeros((SOLID_N, SOLID_N), np.float32)
    pc, pr = frame(axis, 0.0, 10.0)
    hp = PIER_M / 2
    pier[int((pr - hp) * s_):int((pr + hp) * s_), int((pc - hp) * s_):int((pc + hp) * s_)] = 1
    extrude(canvas, pier, (0.0, 0.0, 0.0), (DECK_M - SLAB_M, 0.0, 0.0), PIER * 0.85, PIER)
    extrude(canvas, deck, (DECK_M - SLAB_M, 0.0, 0.0), (DECK_M, 0.0, 0.0), CONCRETE_SIDE, CONCRETE_TOP)
    canvas.alpha_composite(track_layers_image(layers, (DECK_M, 0.0, 0.0)))
    extrude(canvas, ring, (DECK_M, 0.0, 0.0), (DECK_M + PARAPET_M, 0.0, 0.0), CONCRETE_DARK, CONCRETE_TOP)
    return canvas


def spread_pieces(rng):
    """X's ends n (b 0) / s, Y's w (b 0) / e: metro_island_{x|y}_spread_{end}, the station to that side."""
    out = []
    for axis, (lo, hi) in (('X', ('n', 's')), ('Y', ('w', 'e'))):
        for wide_lo, end in ((True, lo), (False, hi)):
            name = f'metro_island_{axis.lower()}_spread_{end}'
            img = spread_piece(axis, wide_lo, rng)
            img.save(OUT / f'{name}.png')
            out.append((name, img))
            print(name)
    return out


# 隧道口 (phase 4 step 3): three tiles of trough going down 10 m over four, then the portal, its tunnel
# roofed over. Each tile in two layers: the base (the paving round the trough, its far wall, the
# floor and track; on the last trough tile, the headwall's face where it faces the viewer) and the
# front (the near paving and wall top, drawn after the trains so they sink into the trough; on the
# portal, the paving over the tunnel and the headwall's parapet).
TUNNEL_M = 10.0
PORTAL_TILES = 4
PORTAL_H = 640                    # (taller than the viaduct's: the trough's floor is 7.5 m down)
TROUGH_HALF_M = 4.8
TROUGH_WALL_M = 0.5
PAVING = np.array([158, 156, 150], np.float32)
FLOOR = np.array([112, 110, 106], np.float32)


def to_canvas(col_m, row_m, z):
    """A point (top-down metres on the tile, z up) to the canvas, as warp() maps them."""
    x = W / 2 + (W / 2) * (col_m - row_m) / track.TILE_M
    y = TOP + (W / 4) * (col_m + row_m) / track.TILE_M - Z_PX * z
    return x, y


def diamond_clip(img, axis=None):
    """What lies outside the tile's diamond off (below the ground, the next tile hides it) - but
    for the trough's opening along `axis` (X along row, Y along col), through which its floor shows."""
    m = Image.new('L', img.size, 0)
    d = ImageDraw.Draw(m)
    d.polygon([(W / 2, TOP), (W, TOP + W / 4), (W / 2, TOP + W / 2), (0, TOP + W / 4)], fill=255)
    if axis:
        h = TROUGH_HALF_M + TROUGH_WALL_M
        pt = (lambda a, b: to_canvas(10.0 + a, b, 0.0)) if axis == 'X' else (lambda a, b: to_canvas(b, 10.0 + a, 0.0))
        d.polygon([pt(-h, -40.0), pt(-h, 60.0), pt(h, 60.0), pt(h, -40.0)], fill=255)
    a = np.asarray(img).copy()
    a[..., 3] = (a[..., 3].astype(np.float32) * (np.asarray(m) / 255.0)).astype(np.uint8)
    return Image.fromarray(a, 'RGBA')


def portal_plane(axis, down, step):
    """The floor of a portal tile: (h0, per metre along col, per metre along row), 0 at the ground."""
    hi, lo = -(step - 1) / PORTAL_TILES * TUNNEL_M, -step / PORTAL_TILES * TUNNEL_M
    fall = (hi - lo) / track.TILE_M
    return {'n': (lo, 0.0, fall), 's': (hi, 0.0, -fall), 'w': (lo, fall, 0.0), 'e': (hi, -fall, 0.0)}[down]


def portal_pieces(axis, down, step, rng):
    """(base, front) for the tile `step` (1..3 trough, 4 the portal) going down towards `down`, on a
    512 x 640 canvas, the tile's centre on the ground at (256, 416)."""
    global H
    saved, H = H, PORTAL_H
    try:
        return _portal_pieces(axis, down, step, rng)
    finally:
        H = saved


def _portal_pieces(axis, down, step, rng):
    base = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    front = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    inner = band_mask(axis, lambda bb: np.full_like(bb, TROUGH_HALF_M))
    outer = band_mask(axis, lambda bb: np.full_like(bb, TROUGH_HALF_M + TROUGH_WALL_M))
    whole = np.ones((SOLID_N, SOLID_N), np.float32)
    n = SOLID_N
    m = (np.arange(n) + 0.5) / n * track.TILE_M
    C, R = np.meshgrid(m, m)
    across = (C - 10.0) if axis == 'X' else (R - 10.0)
    near_wall = ((across > TROUGH_HALF_M) & (across <= TROUGH_HALF_M + TROUGH_WALL_M)).astype(np.float32)
    far_wall = ((across < -TROUGH_HALF_M) & (across >= -TROUGH_HALF_M - TROUGH_WALL_M)).astype(np.float32)
    paving = 1.0 - outer
    near_paving = (across > TROUGH_HALF_M + TROUGH_WALL_M).astype(np.float32)
    ground = (0.0, 0.0, 0.0)

    def flat(canvas, mask, colour, plane):
        rgba = np.zeros((SOLID_N, SOLID_N, 4), np.float32)
        rgba[..., :3] = colour
        rgba[..., 3] = mask * 255
        canvas.alpha_composite(warp(rgba, plane))

    if step < PORTAL_TILES:
        plane = portal_plane(axis, down, step)
        flat(base, inner, FLOOR, plane)
        base.alpha_composite(track_layers_image(track.draw_tile([axis], rng), plane))
        extrude(base, far_wall, plane, ground, CONCRETE_SIDE, CONCRETE_TOP)
        extrude(base, near_wall, plane, ground, CONCRETE_SIDE, CONCRETE_TOP)
        # the headwall's face at the trough's end, facing the viewer (the portal up-right or up-left)
        if step == PORTAL_TILES - 1 and down in ('n', 'w'):
            floor_z = -step / PORTAL_TILES * TUNNEL_M
            edge = 0.0
            wall = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(wall)
            pt = (lambda a, z: to_canvas(10.0 + a, edge, z)) if axis == 'X' else (lambda a, z: to_canvas(edge, 10.0 + a, z))
            half = TROUGH_HALF_M + TROUGH_WALL_M
            d.polygon([pt(-half, 0.0), pt(half, 0.0), pt(half, floor_z), pt(-half, floor_z)], fill=tuple(int(v) for v in CONCRETE_SIDE) + (255,))
            # the opening: an arch over the track, dark inside
            arch = [pt(a, floor_z + 4.2 + 1.3 * np.sqrt(max(0.0, 1 - (a / 4.0) ** 2))) for a in np.linspace(-4.0, 4.0, 17)]
            d.polygon([pt(-4.0, floor_z)] + arch + [pt(4.0, floor_z)], fill=(18, 18, 20, 255))
            base.alpha_composite(wall)
        flat(base, paving, PAVING, ground)
        base = diamond_clip(base, axis)
        flat(front, near_paving, PAVING, ground)
        rgba = np.zeros((SOLID_N, SOLID_N, 4), np.float32)
        rgba[..., :3] = CONCRETE_TOP
        rgba[..., 3] = near_wall * 255
        front.alpha_composite(warp(rgba, ground))
        front = diamond_clip(front)
    else:
        # the portal: paved over the tunnel, the headwall's parapet along the trough's end
        flat(front, whole, PAVING, ground)
        up_edge = {'n': 20.0, 's': 0.0, 'w': 20.0, 'e': 0.0}[down]
        t = 0.5
        if axis == 'X':
            par = ((np.abs(C - 10.0) <= TROUGH_HALF_M + TROUGH_WALL_M) & (np.abs(R - up_edge) <= t)).astype(np.float32)
        else:
            par = ((np.abs(R - 10.0) <= TROUGH_HALF_M + TROUGH_WALL_M) & (np.abs(C - up_edge) <= t)).astype(np.float32)
        front = diamond_clip(front)
        extrude(front, par, ground, (1.0, 0.0, 0.0), CONCRETE_SIDE, CONCRETE_TOP)
    return base, front


def portal_set(rng):
    """metro_portal_{x|y}_{down}{step} (and _front): X goes down n or s, Y w or e."""
    out = []
    for axis, downs in (('X', ('n', 's')), ('Y', ('w', 'e'))):
        for down in downs:
            for step in range(1, PORTAL_TILES + 1):
                b, f = portal_pieces(axis, down, step, rng)
                name = f'metro_portal_{axis.lower()}_{down}{step}'
                if step < PORTAL_TILES:
                    b.save(OUT / f'{name}.png')
                f.save(OUT / f'{name}_front.png')
                both = b.copy(); both.alpha_composite(f)
                out.append((name, both))
                print(name)
    return out


# A deck at any height (Norton, 2026-11-06: as high as its end - three levels over the ground it
# starts from): its pictures without piers (_np), the piers drawn apart (metro_pier_{k}, k half
# levels long) under it, down to whatever ground is there.
def deck_no_piers(layouts, rng):
    for mask in (1, 2, 4, 8, 16, 32, 0x03, 0x0c, 0x30):
        name = layouts[mask]['asset'].replace('metro_track_', 'metro_viaduct_')
        deck_piece(layouts[mask]['tracks'], rng, foot=DECK_M - SLAB_M).save(OUT / f'{name}_np.png')
        print(name, 'no piers')


PIER_IMG_W = 72


def piers():
    """metro_pier_{k}: a pier k half levels long (1..24), its foot's middle at (36, length + 18)."""
    half = PIER_M / 2
    dx, dy = 2 * half * (W / 2) / track.TILE_M, 2 * half * (W / 4) / track.TILE_M
    for k in range(1, 25):
        length = k * HILL_LEVEL_M / 2 * Z_PX
        img = Image.new('RGBA', (PIER_IMG_W, int(length + 40)), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        fx, fy = PIER_IMG_W / 2, length + 18          # the foot's middle
        left, bottom, right = (fx - dx, fy), (fx, fy + dy), (fx + dx, fy)
        up = lambda p: (p[0], p[1] - length)
        d.polygon([left, bottom, up(bottom), up(left)], fill=tuple(int(v) for v in PIER * 0.85) + (255,))
        d.polygon([bottom, right, up(right), up(bottom)], fill=tuple(int(v) for v in PIER * 0.7) + (255,))
        img.save(OUT / f'metro_pier_{k}.png')
    print('piers')


# Ground track up a hillside (OpenTTD: a tile of slope, a level up): the track on the slope's plane,
# rising towards `up` - from the ground at the tile's low edge to a level up at its high one.
def slope_tracks(rng):
    rise = HILL_LEVEL_M / track.TILE_M
    for axis, ups in (('X', ('n', 's')), ('Y', ('w', 'e'))):
        layers = track.draw_tile([axis], rng)
        for up in ups:
            plane = {'n': (HILL_LEVEL_M, 0.0, -rise), 's': (0.0, 0.0, rise), 'w': (HILL_LEVEL_M, -rise, 0.0), 'e': (0.0, rise, 0.0)}[up]
            track_layers_image(layers, plane).save(OUT / f'metro_track_slope_{up}.png')
            print('slope', up)


# 穿山隧道 (OpenTTD's tunnel): its mouth on a hillside tile - the hillside cut back to the level of
# its foot, the track running in, and the portal at the tile's edge into the hill; seen from the
# front (the hill rising away, the portal facing the viewer: out towards s or e as drawn) its
# headwall and arch; from behind (out towards n or w) only the cutting.
def hill_tunnels(rng):
    n = SOLID_N
    m = (np.arange(n) + 0.5) / n * track.TILE_M
    C, R = np.meshgrid(m, m)
    ground = (0.0, 0.0, 0.0)
    for axis, outs in (('X', ('n', 's')), ('Y', ('w', 'e'))):
        layers = track.draw_tile([axis], rng)
        for out in outs:
            canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            rgba = np.zeros((n, n, 4), np.float32)
            rgba[..., :3] = PAVING
            rgba[..., 3] = 255
            canvas.alpha_composite(warp(rgba, ground))
            canvas.alpha_composite(track_layers_image(layers, ground))
            if out in ('s', 'e'):
                # the portal at the inner edge (n, w), facing out: from the floor up past the hill's top
                top = HILL_LEVEL_M + 2.2
                if axis == 'X':
                    wall = ((R <= 0.9)).astype(np.float32)
                    pt = lambda a, z: to_canvas(10.0 + a, 0.9, z)
                else:
                    wall = ((C <= 0.9)).astype(np.float32)
                    pt = lambda a, z: to_canvas(0.9, 10.0 + a, z)
                extrude(canvas, wall, ground, (top, 0.0, 0.0), CONCRETE_SIDE, CONCRETE_TOP)
                d = ImageDraw.Draw(canvas)
                arch = [pt(a, 4.6 + 1.4 * np.sqrt(max(0.0, 1 - (a / 4.4) ** 2))) for a in np.linspace(-4.4, 4.4, 19)]
                d.polygon([pt(-4.4, 0.0)] + arch + [pt(4.4, 0.0)], fill=(18, 18, 20, 255))
            else:
                canvas, front = hill_back_mouth(axis, layers)
                front.save(OUT / f'metro_hilltunnel_{out}_front.png')
            canvas.save(OUT / f'metro_hilltunnel_{out}.png')
            print('hill tunnel', out)


# The mouth seen from behind (out n or w as drawn: the hill rising towards the viewer, its portal
# facing away; Norton, 2026-11-06: a cutting, the portal's beam and railing across its inner end).
# The tile's hillside (its terrain, drawn under it) is cut by a slot the trough's width: the base
# is what shows through the slot - the floor and track, the far retaining wall's face, darkening
# into the portal's shade - and nothing outside it, so the terrain's own slope shows round it; the
# far wall's coping stands just over the slope. The front, drawn after the trains so they go in
# under it: the near wall's coping and, along the inner edge, the headwall's top - a concrete beam
# a little over the hilltop with a railing on it.
BACK_COPING_M = 0.35
BACK_BEAM_M = 0.9          # the beam over the hilltop
BACK_BEAM_DEPTH_M = 1.0    # along the line
BACK_RAIL_M = 1.1
RAILING = (74, 78, 76, 255)


def hill_back_mouth(axis, layers):
    n = SOLID_N
    m = (np.arange(n) + 0.5) / n * track.TILE_M
    C, R = np.meshgrid(m, m)
    across, along = (C - 10.0, R) if axis == 'X' else (R - 10.0, C)
    rise = HILL_LEVEL_M / track.TILE_M
    ground = (0.0, 0.0, 0.0)
    slope = (0.0, 0.0, rise) if axis == 'X' else (0.0, rise, 0.0)
    lift = lambda plane, dz: (plane[0] + dz, plane[1], plane[2])
    half, outer = TROUGH_HALF_M, TROUGH_HALF_M + TROUGH_WALL_M
    # the portal's shade, deepening over the last 8 m to the headwall
    shade = np.clip((along - 12.0) / 8.0, 0.0, 1.0) ** 1.4 * 0.72

    base = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    rgba = np.zeros((n, n, 4), np.float32)
    rgba[..., :3] = FLOOR
    rgba[..., 3] = (np.abs(across) <= half) * 255
    base.alpha_composite(warp(rgba, ground))
    base.alpha_composite(track_layers_image(layers, ground))
    dark = np.zeros((n, n, 4), np.float32)
    dark[..., 3] = (np.abs(across) <= half) * shade * 255
    base.alpha_composite(warp(dark, lift(ground, 0.2)))
    # the far wall (across < 0: its face towards the viewer), from the floor up to the slope
    far = ((across < -half) & (across >= -outer)).astype(np.float32)
    extrude(base, far, ground, slope, CONCRETE_SIDE * (1.0 - shade)[..., None], CONCRETE_TOP)
    # only what shows through the slot in the hillside
    slot = Image.new('L', (W, H), 0)
    pt = (lambda a, b, z: to_canvas(10.0 + a, b, z)) if axis == 'X' else (lambda a, b, z: to_canvas(b, 10.0 + a, z))
    ImageDraw.Draw(slot).polygon([pt(-outer, 0.0, 0.0), pt(-outer, 20.0, HILL_LEVEL_M), pt(outer, 20.0, HILL_LEVEL_M), pt(outer, 0.0, 0.0)], fill=255)
    a = np.asarray(base).copy()
    a[..., 3] = (a[..., 3].astype(np.float32) * (np.asarray(slot) / 255.0)).astype(np.uint8)
    base = Image.fromarray(a, 'RGBA')
    below_beam = along < 20.0 - BACK_BEAM_DEPTH_M
    extrude(base, far * below_beam, slope, lift(slope, BACK_COPING_M), CONCRETE_SIDE, CONCRETE_TOP)

    front = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    near = ((across > half) & (across <= outer) & below_beam).astype(np.float32)
    extrude(front, near, slope, lift(slope, BACK_COPING_M), CONCRETE_SIDE, CONCRETE_TOP)
    beam = ((np.abs(across) <= outer + 0.3) & (along >= 20.0 - BACK_BEAM_DEPTH_M)).astype(np.float32)
    top = HILL_LEVEL_M + BACK_BEAM_M
    extrude(front, beam, (HILL_LEVEL_M - 0.3, 0.0, 0.0), (top, 0.0, 0.0), CONCRETE_SIDE, CONCRETE_TOP)
    # the railing along the beam's cutting side: posts and two rails
    d = ImageDraw.Draw(front)
    b = 20.0 - BACK_BEAM_DEPTH_M + 0.25
    span = outer + 0.1
    for z in (top + BACK_RAIL_M, top + BACK_RAIL_M * 0.5):
        d.line([pt(-span, b, z), pt(span, b, z)], fill=RAILING, width=3)
    for x in np.linspace(-span, span, 9):
        d.line([pt(x, b, top), pt(x, b, top + BACK_RAIL_M)], fill=RAILING, width=3)
    return base, front


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20261105)
    script = "const t = require('./railway-track'); console.log(JSON.stringify(t.RAILWAY_TRACK_LAYOUTS))"
    layouts = {l['mask']: l for l in json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))}
    pieces = []
    for mask in (1, 2, 4, 8, 16, 32, 0x03, 0x0c, 0x30):
        layout = layouts[mask]
        name = layout['asset'].replace('metro_track_', 'metro_viaduct_')
        img = deck_piece(layout['tracks'], rng)
        img.save(OUT / f'{name}.png')
        pieces.append((name, img))
        print(name)
    deck_no_piers(layouts, rng)
    for axis, ups in (('X', ('n', 's')), ('Y', ('w', 'e'))):
        for up in ups:
            for step in range(1, RAMP_STEPS + 1):
                name = f'metro_ramp_{axis.lower()}_{up}{step}'
                img = ramp_piece(axis, up, step, rng)
                img.save(OUT / f'{name}.png')
                pieces.append((name, img))
                print(name)
    pieces += spread_pieces(rng)
    pieces += portal_set(rng)
    sheet = Image.new('RGBA', (7 * 260, 5 * 190), (96, 108, 82, 255))
    for i, (name, img) in enumerate(pieces):
        sheet.alpha_composite(img.resize((256, 176), Image.LANCZOS), ((i % 7) * 260, (i // 7) * 190))
    sheet.save(ROOT / 'docs/assets/metro-viaduct-preview.png')


if __name__ == '__main__':
    if '--spread' in sys.argv:     # the station's end tiles only
        OUT.mkdir(parents=True, exist_ok=True)
        spread_pieces(np.random.default_rng(20261105))
    elif '--hills' in sys.argv:     # the decks without piers, the piers, the slope track, the hill tunnels
        OUT.mkdir(parents=True, exist_ok=True)
        script = "const t = require('./railway-track'); console.log(JSON.stringify(t.RAILWAY_TRACK_LAYOUTS))"
        layouts = {l['mask']: l for l in json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))}
        rng = np.random.default_rng(20261106)
        deck_no_piers(layouts, rng)
        piers()
        slope_tracks(rng)
        hill_tunnels(rng)
    elif '--portal' in sys.argv:   # the tunnel portals only
        OUT.mkdir(parents=True, exist_ok=True)
        rng = np.random.default_rng(20261106)
        made = portal_set(rng)
        sheet = Image.new('RGBA', (4 * 260, 4 * 330), (96, 108, 82, 255))
        for i, (name, img) in enumerate(made):
            sheet.alpha_composite(img.resize((256, 320), Image.LANCZOS), ((i % 4) * 260, (i // 4) * 330))
        sheet.save(ROOT / 'docs/assets/metro-portal-preview.png')
    else:
        main()
