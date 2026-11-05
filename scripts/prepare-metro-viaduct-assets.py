"""地鐵第三期 step 4: elevated track (Models/metroViaduct/), drawn in code like the track (Norton,
2026-11-05: a separate 高架路軌 tool; the deck 8 m up).

- Deck pieces, one for each track layout a tile may hold (railway-track.js: the six bits, the X/Y
  crossing, the two pairs of diagonals): the track tile's ballast, sleepers and rails 8 m up on a
  concrete deck a little wider than the ballast, a 1.2 m parapet along each side, a square pier
  down to the ground under the middle of each track.
- Ramp pieces, for X and Y, rising either way, in three steps (0 to 8 m over three tiles): the track
  on a slope over a solid embankment with retaining walls.

The solids are built by stacking: each top-down shape is drawn at every height from its foot to its
top, the lower layers showing as its sides, so any shape - a diagonal deck, a sloped ramp - gets
walls. 512 px a tile across like the track tiles, on a canvas 512 x 352 with the tile's diamond
from y 96 (room for the deck above), its centre on the ground at (256, 224).

Run with .venv/bin/python -B scripts/prepare-metro-viaduct-assets.py
"""
import importlib.util
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('track', ROOT / 'scripts/prepare-railway-track-assets.py')
track = importlib.util.module_from_spec(spec)
spec.loader.exec_module(track)

OUT = ROOT / 'Models/metroViaduct'
W, H = 512, 352
TOP = 96                 # the tile diamond's top corner, y
N = track.TD             # top-down px a tile side (as the track's)
Z_PX = 10.0              # px a metre up (as the platforms')
DECK_M = 8.0
SLAB_M = 1.5
PARAPET_M = 1.2
PIER_M = 2.4             # a pier's side
DECK_WIDEN_M = 0.8       # the deck beyond the ballast each side
RAMP_STEPS = 3

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


def deck_piece(bits_tracks, rng):
    layers = track.draw_tile(bits_tracks, rng)
    deck, ring = deck_masks(bits_tracks)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    extrude(canvas, pier_mask(bits_tracks), (0.0, 0.0, 0.0), (DECK_M - SLAB_M, 0.0, 0.0), PIER * 0.85, PIER)
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
    for axis, ups in (('X', ('n', 's')), ('Y', ('w', 'e'))):
        for up in ups:
            for step in range(1, RAMP_STEPS + 1):
                name = f'metro_ramp_{axis.lower()}_{up}{step}'
                img = ramp_piece(axis, up, step, rng)
                img.save(OUT / f'{name}.png')
                pieces.append((name, img))
                print(name)
    sheet = Image.new('RGBA', (7 * 260, 3 * 190), (96, 108, 82, 255))
    for i, (name, img) in enumerate(pieces):
        sheet.alpha_composite(img.resize((256, 176), Image.LANCZOS), ((i % 7) * 260, (i // 7) * 190))
    sheet.save(ROOT / 'docs/assets/metro-viaduct-preview.png')


if __name__ == '__main__':
    main()
