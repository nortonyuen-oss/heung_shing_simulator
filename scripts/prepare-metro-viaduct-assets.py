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
walls. 512 px a tile across like the track tiles, on a canvas 512 x 512 (a power of two) with the tile's diamond
from y 256 (room for the deck above), its centre on the ground at (256, 384).

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
W, H = 512, 512           # a power of two each way (Norton, 2026-11-06)
TOP = 256                # the tile diamond's top corner, y (room above for the deck, 20 m up)
N = track.TD             # top-down px a tile side (as the track's)
Z_PX = 10.0              # px a metre up (as the platforms')
HILL_LEVEL_M = 13 * (512 / 100) / 10.0   # a terrain level (HEIGHT_STEP_PIXELS 13 at TILE_WIDTH 100), 6.656 m
DECK_M = 3 * HILL_LEVEL_M  # Norton 2026-11-06: three hill levels (20 m), meeting a level-3 hilltop flush
SLAB_M = 1.5
PARAPET_M = 1.2
PIER_M = 2.4             # a pier's side
DECK_WIDEN_M = 0.8       # the deck beyond the ballast each side
RAMP_STEPS = 5           # (a ramp of five tiles for the 17 m)

# The station's concrete (Norton, 2026-11-06: 純灰色好醜 - the viaducts, ramps and portals as the 高架站
# render's warm off-white, textured by extrude()); sampled from the render, a shade down for the
# sides out of the sun.
CONCRETE_TOP = np.array([206, 192, 182], np.float32)
CONCRETE_SIDE = np.array([176, 161, 150], np.float32)
CONCRETE_DARK = np.array([152, 139, 130], np.float32)
PIER = np.array([183, 167, 156], np.float32)

# Concrete faces as built (as MTR viaducts' and ramps' retaining walls): precast panels with a joint
# every PANEL_H up and PANEL_W along, a lighter coping along the top, weathering streaks run down
# from it, dirt near the foot, and a fine mottle all over.
PANEL_H = 1.5
PANEL_W = 3.0
COPING_M = 0.3
_TEX_RNG = np.random.default_rng(20261107)
_MOTTLE = None


def _mottle():
    global _MOTTLE
    if _MOTTLE is None:
        n = SOLID_N
        fine = _TEX_RNG.normal(0, 1, (n, n)).astype(np.float32)
        coarse = np.asarray(Image.fromarray(_TEX_RNG.normal(0, 1, (n // 16, n // 16)).astype(np.float32)).resize((n, n), Image.BICUBIC))
        streak = np.asarray(Image.fromarray(_TEX_RNG.random((1, n // 4)).astype(np.float32)).resize((n, 1), Image.BICUBIC))[0]
        _MOTTLE = (fine, coarse, streak)
    return _MOTTLE


def concrete_layer(colour, z, lo, hi):
    """The colour of a solid's layer at height z (n x n x 3): `lo`, `hi` its foot and top there. (A
    face's pixel column is one top-down pixel at every height, so the mottle is shifted with z - else it
    runs down the face in stripes.)"""
    n = SOLID_N
    fine, coarse, streak = _mottle()
    m = (np.arange(n) + 0.5) / n * track.TILE_M
    C, R = np.meshgrid(m, m)
    along = C + R                                  # along whichever face shows (+col or +row)
    zi = int(round(z * Z_PX))
    grain = np.roll(fine, (zi * 7919) % n, axis=1)
    # each panel a shade of its own; the joints between them
    pa, pz = np.floor(along / PANEL_W), np.floor(z / PANEL_H)
    tone = (np.sin(pa * 12.9898 + pz * 78.233) * 43758.5453) % 1.0
    shade = (1 + 0.04 * grain + 0.04 * coarse) * (0.95 + 0.10 * tone)
    shade *= np.where((z % PANEL_H) < 0.18, 0.80, 1.0)
    shade *= np.where((along % PANEL_W) < 0.2, 0.82, 1.0)
    below = np.clip((hi - z) / 6.0, 0, 1)          # streaks, darkening down from the coping
    shade *= 1 - 0.05 * below * np.interp(along % track.TILE_M, np.linspace(0, track.TILE_M, streak.size), streak)
    shade *= np.where(z - lo < 0.6, 0.86 + 0.14 * np.clip((z - lo) / 0.6, 0, 1), 1.0)   # dirt at the foot
    rgb = np.asarray(colour, np.float32)[None, None, :] * shade[..., None] if np.ndim(colour) == 1 else colour * shade[..., None]
    coping = (hi - z) < COPING_M
    rgb = np.where(coping[..., None], CONCRETE_TOP * 0.97 * (1 + 0.03 * grain[..., None]), rgb)
    return rgb


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


def extrude(canvas, mask, base, top, side, top_colour, texture=True):
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
    fine = _mottle()[0]
    while z < zmax - step:
        layer = mask * (lo <= z) * (hi >= z + step)
        if layer.any():
            rgba = np.zeros((SOLID_N, SOLID_N, 4), np.float32)
            rgba[..., :3] = concrete_layer(side, z, lo, hi) if texture else side
            rgba[..., 3] = layer * 255
            canvas.alpha_composite(warp(rgba, (z, 0.0, 0.0)))
        z += step
    rgba = np.zeros((SOLID_N, SOLID_N, 4), np.float32)
    rgba[..., :3] = np.asarray(top_colour, np.float32) * ((1 + 0.03 * fine)[..., None] if texture else 1)
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
    if foot < DECK_M - SLAB_M - 0.01:
        # the station's pier under the middle of each track's line (as pier_mask places them)
        for bit in bits_tracks:
            if bit in ('X', 'Y'):
                cx, cy = 10.0, 10.0
            else:
                ccx, ccy = track.CORNERS[bit]
                cx, cy = ccx + (5.0 if ccx == 0 else -5.0), ccy + (5.0 if ccy == 0 else -5.0)
            img, (fx, fy) = station_pier((DECK_M - SLAB_M - foot) * Z_PX)
            gx, gy = to_canvas(cx, cy, foot)
            canvas.alpha_composite(img, (int(round(gx - fx)), int(round(gy - fy))))
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


# The station's own concrete and railing (sampled from Norton's render), for the spread tiles: they are
# the station's structure, not the line's (Norton, 2026-11-06: the plain grey deck 太不真實).
STATION_TOP = np.array([212, 197, 189], np.float32)
STATION_SIDE = np.array([186, 170, 160], np.float32)
STATION_PIER = np.array([183, 167, 156], np.float32)
STATION_UPSTAND_M = 0.5
STATION_RAIL_M = 1.15
GLASS = (150, 156, 162, 120)
POST = (96, 98, 104, 255)


def spread_piece(axis, wide_lo, rng):
    """The tile off a station's end: the deck narrowing and the tracks coming in from the station's
    7.03 m to the line's 2.25 m (the wide end at b = 0 if wide_lo, else at b = 20) - the station's
    beige concrete, ballast all across between the parapets, a glass railing on a low upstand."""
    k = lambda bb: (1 - bb / 20.0) if wide_lo else (bb / 20.0)       # 1 at the wide end
    half = lambda bb: NARROW_DECK_HALF_M + (ISLAND_DECK_HALF_M - NARROW_DECK_HALF_M) * k(bb)
    t0, t1 = (ISLAND_TRACK_M, track.EDGE_OFFSET) if wide_lo else (track.EDGE_OFFSET, ISLAND_TRACK_M)
    pair = ('PAIR', (frame(axis, -t0, 0.0), frame(axis, -t1, 20.0)), (frame(axis, t0, 0.0), frame(axis, t1, 20.0)))
    layers = track.draw_tile([pair], rng)
    deck = band_mask(axis, half)
    ring_w = 0.35
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    s_ = SOLID_N / track.TILE_M
    pier = np.zeros((SOLID_N, SOLID_N), np.float32)
    pc, pr = frame(axis, 0.0, 10.0)
    hp = PIER_M / 2
    pier[int((pr - hp) * s_):int((pr + hp) * s_), int((pc - hp) * s_):int((pc + hp) * s_)] = 1
    top = (DECK_M, 0.0, 0.0)
    img, (fx, fy) = station_pier((DECK_M - SLAB_M) * Z_PX)
    gx, gy = to_canvas(pc, pr, 0.0)
    canvas.alpha_composite(img, (int(round(gx - fx)), int(round(gy - fy))))
    extrude(canvas, deck, (DECK_M - SLAB_M, 0.0, 0.0), top, STATION_SIDE, STATION_TOP)
    # ballast over the whole deck between the parapets (the track's own gravel, so its bed runs on)
    n = track.TD
    m = (np.arange(n) + 0.5) / n * track.TILE_M
    C, R = np.meshgrid(m, m)
    across, along = (C - 10.0, R) if axis == 'X' else (R - 10.0, C)
    inside = (np.abs(across) <= half(along) - ring_w).astype(np.float32)
    canvas.alpha_composite(warp(np.concatenate([layers['gravel'], inside[..., None] * 255], axis=2), top))
    canvas.alpha_composite(track_layers_image(layers, top))
    # the parapets: the far one, then the near (across > 0 is towards the viewer either way)
    pt = (lambda a, bb, z: to_canvas(10.0 + a, bb, z)) if axis == 'X' else (lambda a, bb, z: to_canvas(bb, 10.0 + a, z))
    for side in (-1, 1):
        ring = band_mask(axis, half, inner_at=lambda bb: half(bb) - ring_w)
        n2 = SOLID_N
        m2 = (np.arange(n2) + 0.5) / n2 * track.TILE_M
        C2, R2 = np.meshgrid(m2, m2)
        a2 = (C2 - 10.0) if axis == 'X' else (R2 - 10.0)
        ring = ring * ((a2 * side) > 0)
        extrude(canvas, ring, top, (DECK_M + STATION_UPSTAND_M, 0.0, 0.0), STATION_SIDE * 0.92, STATION_TOP)
        rail = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(rail)
        z0, z1 = DECK_M + STATION_UPSTAND_M, DECK_M + STATION_UPSTAND_M + STATION_RAIL_M
        bs = np.linspace(0.0, 20.0, 41)
        edge = lambda bb: side * (half(bb) - ring_w / 2)
        for b0, b1 in zip(bs[:-1], bs[1:]):
            d.polygon([pt(edge(b0), b0, z0), pt(edge(b1), b1, z0), pt(edge(b1), b1, z1), pt(edge(b0), b0, z1)], fill=GLASS)
        for bb in np.arange(0.4, 20.0, 1.6):
            d.line([pt(edge(bb), bb, z0), pt(edge(bb), bb, z1)], fill=POST, width=3)
        d.line([pt(edge(bb), bb, z1) for bb in bs], fill=POST, width=3)
        canvas.alpha_composite(rail)
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
TUNNEL_M = 14.0      # as metro-surface.js METRO_RAIL.tunnelMetres (the trains drawn 2.4 times their height)
PORTAL_TILES = 4
PORTAL_H = 512                    # (a power of two: the diamond higher up, the trough's floor 7.5 m down)
PORTAL_TOP = 224
TROUGH_HALF_M = 4.8
TROUGH_WALL_M = 0.5
PAVING = np.array([168, 163, 155], np.float32)
FLOOR = np.array([118, 112, 106], np.float32)


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


STRIP_M = 1.2          # the maintenance strip along a trough's walls
OPENING_M = 10.0       # the box opening's height (the trains drawn some 9.3 m tall)
HEADWALL_T = 0.6       # the headwall's thickness
HEADWALL_TOP_M = 1.2   # ... and its top over the ground
KERB_M = 0.4           # its walls over the ground
FENCE_M = 1.2
FENCE = (78, 86, 82, 255)


def fence_line(canvas, bottom, top, length_m):
    """A steel fence between two lines (canvas points, foot and top): posts every 2 m, two rails."""
    d = ImageDraw.Draw(canvas)
    posts = max(2, int(round(length_m / 2.0)) + 1)
    for i in range(posts):
        t = i / (posts - 1)
        lerp = lambda pa, pb: (pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t)
        d.line([lerp(*bottom), lerp(*top)], fill=FENCE, width=2)
    d.line(top, fill=FENCE, width=2)
    mid = [((bt[0] + tp[0]) / 2, (bt[1] + tp[1]) / 2) for bt, tp in zip(bottom, top)]
    d.line(mid, fill=FENCE, width=1)


def fence(canvas, pt, a, z0):
    """A fence along a trough wall's top (across `a`), the tile's length."""
    fence_line(canvas, [pt(a, 0.0, z0), pt(a, 20.0, z0)], [pt(a, 0.0, z0 + FENCE_M), pt(a, 20.0, z0 + FENCE_M)], 20.0)


def textured_polygon(canvas, poly, colour, z_foot):
    """A concrete face (an upright polygon, canvas points) in the extruded faces' look: mottled,
    a panel joint every PANEL_H up from `z_foot`."""
    mask = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    h, w = canvas.size[1], canvas.size[0]
    rng = np.random.default_rng(20261108)
    shade = 1 + 0.035 * rng.normal(0, 1, (h, w)) + 0.05 * np.asarray(Image.fromarray(rng.normal(0, 1, (h // 16 + 1, w // 16 + 1)).astype(np.float32)).resize((w, h), Image.BICUBIC))
    ys = np.arange(h)[:, None]
    top_y = min(pp[1] for pp in poly)
    foot_y = max(pp[1] for pp in poly)
    shade = shade * np.where(((foot_y - ys) % (PANEL_H * Z_PX)) < 1.0, 0.84, 1.0)
    shade = shade * np.where((ys - top_y) < COPING_M * Z_PX, 1.12, 1.0)
    rgba = np.zeros((h, w, 4), np.float32)
    rgba[..., :3] = np.clip(np.asarray(colour, np.float32)[None, None, :] * shade[..., None], 0, 255)
    rgba[..., 3] = np.asarray(mask, np.float32)
    canvas.alpha_composite(Image.fromarray(rgba.astype(np.uint8), 'RGBA'))


def opening_clip(img, axis, b_lo=-40.0, b_hi=60.0):
    """Only what lies within the trough's opening (its walls' outer faces, along `axis`, from `b_lo`
    to `b_hi`: not past the portal, where the tunnel's roof is under the ground) at the ground."""
    m = Image.new('L', img.size, 0)
    h = TROUGH_HALF_M + TROUGH_WALL_M
    pt = (lambda a, b: to_canvas(10.0 + a, b, 0.0)) if axis == 'X' else (lambda a, b: to_canvas(b, 10.0 + a, 0.0))
    ImageDraw.Draw(m).polygon([pt(-h, b_lo), pt(-h, b_hi), pt(h, b_hi), pt(h, b_lo)], fill=255)
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
    512 x 512 canvas, the tile's centre on the ground at (256, 352)."""
    global H, TOP
    saved, H = H, PORTAL_H
    saved_top, TOP = TOP, PORTAL_TOP
    try:
        return _portal_pieces(axis, down, step, rng)
    finally:
        H = saved
        TOP = saved_top


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
    # (no paving all over: a maintenance strip along each wall, the terrain's ground beyond)
    edge_out = TROUGH_HALF_M + TROUGH_WALL_M
    paving = ((np.abs(across) > edge_out) & (np.abs(across) <= edge_out + STRIP_M)).astype(np.float32)
    near_paving = ((across > edge_out) & (across <= edge_out + STRIP_M)).astype(np.float32)
    ground = (0.0, 0.0, 0.0)
    kerb = (KERB_M, 0.0, 0.0)
    pt_l = (lambda a, b, z: to_canvas(10.0 + a, b, z)) if axis == 'X' else (lambda a, b, z: to_canvas(b, 10.0 + a, z))

    def flat(canvas, mask, colour, plane):
        rgba = np.zeros((SOLID_N, SOLID_N, 4), np.float32)
        rgba[..., :3] = colour
        rgba[..., 3] = mask * 255
        canvas.alpha_composite(warp(rgba, plane))

    # All four tiles are trough; the portal at the last one's far edge, 10 m down (Norton,
    # 2026-11-06: 列車比 portal 高 - the trains are drawn some 9.3 m tall, so the box opens 9.5 m,
    # from the floor to just under the ground).
    plane = portal_plane(axis, down, step)
    flat(base, inner, FLOOR, plane)
    base.alpha_composite(track_layers_image(track.draw_tile([axis], rng), plane))
    extrude(base, far_wall, plane, ground, CONCRETE_SIDE, CONCRETE_TOP)
    far_edge = 0.0 if down in ('n', 'w') else track.TILE_M
    pt = (lambda a, z: to_canvas(10.0 + a, far_edge, z)) if axis == 'X' else (lambda a, z: to_canvas(far_edge, 10.0 + a, z))
    last = step == PORTAL_TILES
    if last and down in ('n', 'w'):
        # the headwall's face below the ground, facing the viewer, and the box's opening in it
        floor_z = -TUNNEL_M
        wall = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        textured_polygon(wall, [pt(-edge_out, 0.0), pt(edge_out, 0.0), pt(edge_out, floor_z), pt(-edge_out, floor_z)], CONCRETE_SIDE, floor_z)
        d = ImageDraw.Draw(wall)
        bw, top, ch = 4.3, floor_z + OPENING_M, 0.8
        d.polygon([pt(-bw, floor_z), pt(-bw, top - ch), pt(-bw + ch, top), pt(bw - ch, top), pt(bw, top - ch), pt(bw, floor_z)], fill=(22, 21, 22, 255))
        d.polygon([pt(-bw, top - ch), pt(-bw + ch, top), pt(bw - ch, top), pt(bw, top - ch), pt(bw, top - 2.5), pt(-bw, top - 2.5)], fill=(10, 10, 12, 255))
        # the line's name plate over the opening
        d.polygon([pt(-2.0, top + 0.9), pt(2.0, top + 0.9), pt(2.0, top + 2.1), pt(-2.0, top + 2.1)], fill=(40, 52, 96, 255))
        base.alpha_composite(wall)
    # what is under the ground shows only through the trough's opening (the ground beside it is the
    # terrain's, in front of it), not past the portal (the tunnel's roof, under the ground); then what
    # stands on the ground
    to_portal = (PORTAL_TILES - step) * track.TILE_M
    if down in ('n', 'w'):
        base = opening_clip(base, axis, b_lo=-to_portal)
    else:
        base = opening_clip(base, axis, b_hi=track.TILE_M + to_portal)
    flat(base, paving, PAVING, ground)
    extrude(base, far_wall, ground, kerb, CONCRETE_SIDE, CONCRETE_TOP)
    fence(base, pt_l, -(edge_out - TROUGH_WALL_M / 2), KERB_M)
    if last:
        # the headwall over the ground across the trough's end: behind the trains where the portal
        # faces the viewer, its name plate on it; in front of them (its back) where it faces away
        lo_b, hi_b = (0.0, HEADWALL_T) if down in ('n', 'w') else (track.TILE_M - HEADWALL_T, track.TILE_M)
        along = R if axis == 'X' else C
        head = ((np.abs(across) <= edge_out + 0.3) & (along >= lo_b) & (along <= hi_b)).astype(np.float32)
        target = base if down in ('n', 'w') else front
        if down in ('s', 'e'):
            target = diamond_clip(target)
        extrude(target, head, ground, (HEADWALL_TOP_M, 0.0, 0.0), CONCRETE_SIDE, CONCRETE_TOP)
    flat(front, near_paving, PAVING, ground)
    front = diamond_clip(front)
    extrude(front, near_wall, ground, kerb, CONCRETE_SIDE, CONCRETE_TOP)
    fence(front, pt_l, edge_out - TROUGH_WALL_M / 2, KERB_M)
    return base, front


def portal_set(rng):
    """metro_portal_{x|y}_{down}{step} (and _front): X goes down n or s, Y w or e."""
    out = []
    for axis, downs in (('X', ('n', 's')), ('Y', ('w', 'e'))):
        for down in downs:
            for step in range(1, PORTAL_TILES + 1):
                b, f = portal_pieces(axis, down, step, rng)
                name = f'metro_portal_{axis.lower()}_{down}{step}'
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


PIER_IMG_W = 128
# The line's piers are the 高架站's (Norton, 2026-11-06: 橋腳可以沿用高架地鐵站的橋腳): the render's
# middle pier (scripts/prepare-metro-elevated-station-assets.py, its feet mended) - its plinth at the
# foot, its shaft run on up as long as the pier is, a block of it at a time, every other one flipped
# so no seam shows.
STATION_PIER_SHAFT = (295, 365, 1150, 1234)     # x0, x1, y0, y1 in the station's render (S px)
STATION_PIER_PLINTH = (288, 371, 1234, 1280)
_STATION_PIER = None


def station_pier_parts():
    global _STATION_PIER
    if _STATION_PIER is None:
        spec = importlib.util.spec_from_file_location('station', ROOT / 'scripts/prepare-metro-elevated-station-assets.py')
        st = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(st)
        a = st.fix_piers(np.asarray(st.render_s()).copy())
        x0, x1, y0, y1 = STATION_PIER_SHAFT
        shaft = a[y0:y1, x0:x1].copy()
        px0, px1, py0, py1 = STATION_PIER_PLINTH
        plinth = a[py0:py1, px0:px1].copy()
        # the foot: the plinth's lowest point, up by a quarter of its width (the middle of its square)
        al = plinth[..., 3] > 40
        vy = int(np.nonzero(al.any(1))[0].max())
        vx = float(np.nonzero(al[vy])[0].mean())
        foot = (vx, vy - (px1 - px0) / 4.0)
        _STATION_PIER = (shaft, plinth, foot, (x0 + x1) / 2 - px0)
    return _STATION_PIER


def station_pier(length):
    """A pier `length` px from its foot's middle up; (image, (foot x, foot y)) - the foot 22 px off the
    bottom, in the middle."""
    shaft, plinth, (fx, fy), shaft_cx = station_pier_parts()
    h = 1 << int(length + 40 - 1).bit_length()
    img = np.zeros((h, PIER_IMG_W, 4), np.uint8)
    foot_x, foot_y = PIER_IMG_W / 2, h - 22
    ox = int(round(foot_x - fx))                    # the plinth's left in the image
    oy = int(round(foot_y - fy))                    # its top
    top = int(round(foot_y - length))
    sx = int(round(ox + shaft_cx - shaft.shape[1] / 2))
    B = shaft.shape[0]
    for y in range(min(oy, h) - 1, max(top, 0) - 1, -1):
        k, r = divmod(oy - 1 - y, B)
        src = B - 1 - r if k % 2 == 0 else r       # up the block, then back down it
        img[y, sx:sx + shaft.shape[1]] = shaft[src]
    pl = Image.fromarray(plinth)
    canvas = Image.fromarray(img)
    canvas.alpha_composite(pl, (ox, oy))
    return canvas, (foot_x, foot_y)


def piers():
    """metro_pier_{k}: a pier k half levels long (1..24), its foot's middle 22 px off the bottom, in the middle."""
    for k in range(1, 25):
        img, _ = station_pier(k * HILL_LEVEL_M / 2 * Z_PX)
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
