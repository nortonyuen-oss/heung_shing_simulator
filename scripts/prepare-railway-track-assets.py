"""地鐵第三期: the surface track tiles (Models/metroTrack/), one per railway-track.js layout.

Norton, 2026-11-04: his track sheet (Models/subwayStation/tracks.png) gives the look - brown rails
with bright heads on chunky grey concrete sleepers, spaced about a gauge apart - and the tiles are
double track, a line to a tile, on a grey-brown ballast bed. They are drawn top-down in metres
(a tile is 20 m) and warped to the game's 2:1, so the straight pieces, the curves and the crossings
all come out alike:

- X and Y run straight through the middle of the tile, the two tracks 2 m either side.
- UPPER, LOWER, LEFT and RIGHT are quarter circles about the tile corner the two edges share
  (radius 10 m, the tracks at 8 and 12), so they meet the straights square at the edges - the
  track bits are railway-track.js's; only their drawing is curved.
- Every track crosses a tile edge at the middle of a gap between sleepers, a whole number of
  sleepers on every piece, so tiles join without a seam whichever way a line runs.

Layouts come from railway-track.js (node prints them). Output: 512 x 256 RGBA per layout, the
diamond filling the canvas, nothing trimmed (prepare-release-assets.js keeps metroTrack/ as is),
and a labelled sheet at docs/assets/metro-track-preview.png.

Run with .venv/bin/python -B scripts/prepare-railway-track-assets.py
"""
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'Models/metroTrack'
PREVIEW = ROOT / 'docs/assets/metro-track-preview.png'

TILE_M = 20.0          # one tile, metres
TD = 1024              # top-down render, px a tile side
ISO_W, ISO_H = 512, 256
SS = 2                 # the iso warp at twice the size, then down

TRACK_OFFSET = 2.0     # each track's centre from the line's (4 m between the two)
RAIL_HALF_GAUGE = 0.75
RAIL_WIDTH = 0.24
RAIL_HEAD = 0.09
SLEEPER_HALF_LENGTH = 1.5
SLEEPER_SHARE = 0.42   # of the spacing, across the track's run
SLEEPER_SPACING = 1.43 # about Norton's: a gauge apart; adjusted per piece to a whole number
BED_HALF = TRACK_OFFSET + SLEEPER_HALF_LENGTH + 0.7
CURVE_RADIUS = TILE_M / 2

# colours from Norton's sheet (rails: R - B > 18; sleepers: grey), toned to the game's muted ground
RAIL_DARK = np.array([59, 44, 33], np.float32)
RAIL_BODY = np.array([106, 91, 78], np.float32)
RAIL_HEAD_RGB = np.array([196, 186, 172], np.float32)
SLEEPER = np.array([112, 109, 105], np.float32)
SLEEPER_EDGE = np.array([70, 67, 63], np.float32)
BALLAST = np.array([104, 98, 90], np.float32)

ANCHOR_M = {  # (col, row) in metres on the tile, edge middles - railway-track.js's A, B, C, D
    'A': (0.0, 10.0), 'B': (10.0, 0.0), 'C': (20.0, 10.0), 'D': (10.0, 20.0),
}
CORNERS = {  # the corner two adjacent edges share, for each curved bit
    'UPPER': (0.0, 0.0), 'LOWER': (20.0, 20.0), 'LEFT': (0.0, 20.0), 'RIGHT': (20.0, 0.0),
}


def layouts():
    script = "const t = require('./railway-track'); console.log(JSON.stringify(t.RAILWAY_TRACK_LAYOUTS))"
    return json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))


def path_coords(bit, offset, col, row):
    """(s, t, length) of each pixel for one track: s along it from one edge, t across it."""
    if bit in ('X', 'Y'):
        if bit == 'X':   # col 10, row 20 -> 0
            s, t = 20.0 - row, col - (10.0 + offset)
        else:            # row 10, col 0 -> 20
            s, t = col, row - (10.0 + offset)
        return s, t, TILE_M
    cx, cy = CORNERS[bit]
    r = CURVE_RADIUS + offset
    dx, dy = col - cx, row - cy
    dist = np.hypot(dx, dy)
    ang = np.arctan2(np.abs(dy), np.abs(dx))          # 0 along one edge, pi/2 along the other
    s = ang * r
    return s, dist - r, (np.pi / 2) * r


def draw_tile(layout, rng):
    n = TD
    grid = (np.arange(n) + 0.5) / n * TILE_M
    col, row = np.meshgrid(grid, grid)
    px_m = TILE_M / n
    aa = lambda d: np.clip(0.5 - d / px_m, 0, 1)        # coverage of an edge at signed distance d

    bed = np.zeros((n, n), np.float32)
    sleeper_a = np.zeros((n, n), np.float32); sleeper_rgb = np.zeros((n, n, 3), np.float32)
    rail_a = np.zeros((n, n), np.float32); rail_rgb = np.zeros((n, n, 3), np.float32)
    for bit in layout['tracks']:
        # the bed under the line, as far as the line runs on this tile
        s0, t0, length0 = path_coords(bit, 0.0, col, row)
        on = (s0 >= -0.01) & (s0 <= length0 + 0.01)
        bed = np.maximum(bed, aa(np.abs(t0) - BED_HALF) * on)
        for offset in (-TRACK_OFFSET, TRACK_OFFSET):
            s, t, length = path_coords(bit, offset, col, row)
            if bit not in ('X', 'Y'):
                # (a curve's s runs the other way on the inner and outer track only by angle; fine)
                pass
            on = (s >= 0) & (s <= length)
            count = max(1, round(length / SLEEPER_SPACING))
            spacing = length / count
            # sleepers centred on (i + 0.5) spacing: a gap at each edge, the same both ways
            phase = (s / spacing) % 1.0 - 0.5                 # 0 at a sleeper's middle
            half_w = SLEEPER_SHARE / 2
            along = aa((np.abs(phase) - half_w) * spacing)
            across = aa(np.abs(t) - SLEEPER_HALF_LENGTH)
            cover = along * across * on
            # each sleeper a little different, darker at its two long edges
            index = np.floor(s / spacing).astype(int)
            shade = 1.0 + (rng.random(64)[index % 64] - 0.5) * 0.12
            edge = np.clip((np.abs(phase) / half_w - 0.65) / 0.35, 0, 1)
            colour = (SLEEPER * (1 - edge[..., None] * 0.7) + SLEEPER_EDGE * edge[..., None] * 0.7) * shade[..., None]
            sleeper_rgb = np.where((cover > sleeper_a)[..., None], colour, sleeper_rgb)
            sleeper_a = np.maximum(sleeper_a, cover)
            for side in (-1, 1):
                d = np.abs(t - side * RAIL_HALF_GAUGE)
                rc = aa(d - RAIL_WIDTH / 2) * on
                head = np.clip(1 - d / RAIL_HEAD, 0, 1)
                colour = RAIL_BODY * (1 - head[..., None]) + RAIL_HEAD_RGB * head[..., None]
                rim = np.clip((d - RAIL_WIDTH * 0.35) / (RAIL_WIDTH * 0.15), 0, 1)
                colour = colour * (1 - rim[..., None]) + RAIL_DARK * rim[..., None]
                rail_rgb = np.where((rc > rail_a)[..., None], colour, rail_rgb)
                rail_a = np.maximum(rail_a, rc)

    # ballast: grey-brown gravel, speckled
    noise = rng.normal(0, 1, (n, n)).astype(np.float32)
    coarse = np.asarray(Image.fromarray(rng.normal(0, 1, (n // 16, n // 16)).astype(np.float32)).resize((n, n), Image.BICUBIC))
    gravel = BALLAST[None, None, :] * (1 + noise[..., None] * 0.07 + coarse[..., None] * 0.04)
    return {'bed': bed, 'gravel': gravel, 'sleeper_a': sleeper_a, 'sleeper_rgb': sleeper_rgb, 'rail_a': rail_a, 'rail_rgb': rail_rgb}


def to_iso(rgba):
    """Top-down (col right, row down) -> the 2:1 diamond: top corner (col 0, row 0)."""
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')
    W, H = ISO_W * SS, ISO_H * SS
    n = TD
    # screen (x, y) -> col = (x/(W/2) + (y)/(H/2)) / 2 * n - shifted so the top corner is at (W/2, 0)
    a = n / W; b = n / H
    coeffs = (a, b, -a * W / 2, -a, b, a * W / 2)
    return img.transform((W, H), Image.AFFINE, coeffs, resample=Image.BICUBIC)


def composite(layers):
    """Bed, then sleepers, then rails raised a touch over their shadows; warped to the diamond."""
    bed = layers['bed'][..., None]
    base = np.concatenate([layers['gravel'], layers['bed'][..., None] * 255], axis=2)
    sl = np.concatenate([layers['sleeper_rgb'], layers['sleeper_a'][..., None] * 255], axis=2)
    rl = np.concatenate([layers['rail_rgb'], layers['rail_a'][..., None] * 255], axis=2)
    iso_bed = to_iso(base)
    iso_sl = to_iso(sl)
    iso_rl = to_iso(rl)
    # shadows: sleepers a hair, rails more, cast down-screen; the rails lifted by as much
    def shadow(img, dy, strength):
        a = np.asarray(img)[..., 3].astype(np.float32) / 255 * strength
        a = np.roll(a, dy, axis=0)
        s = np.zeros((a.shape[0], a.shape[1], 4), np.float32)
        s[..., :3] = 25
        s[..., 3] = a * 255
        return Image.fromarray(s.astype(np.uint8), 'RGBA')
    out = Image.new('RGBA', iso_bed.size, (0, 0, 0, 0))
    out.alpha_composite(iso_bed)
    out.alpha_composite(shadow(iso_sl, 1 * SS, 0.35))
    out.alpha_composite(iso_sl)
    out.alpha_composite(shadow(iso_rl, 2 * SS, 0.5))
    lifted = Image.new('RGBA', iso_rl.size, (0, 0, 0, 0))
    lifted.alpha_composite(iso_rl, (0, -1 * SS))
    out.alpha_composite(lifted)
    # nothing outside the diamond
    mask = Image.new('L', out.size, 0)
    W, H = out.size
    ImageDraw.Draw(mask).polygon([(W / 2, 0), (W, H / 2), (W / 2, H), (0, H / 2)], fill=255)
    arr = np.asarray(out).copy()
    arr[..., 3] = (arr[..., 3].astype(np.float32) * np.asarray(mask) / 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA').resize((ISO_W, ISO_H), Image.LANCZOS)


def preview(tiles):
    cell_w, cell_h = ISO_W // 2 + 24, ISO_H // 2 + 44
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w + 16, rows * cell_h + 16), (238, 236, 230, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 14)
    except OSError:
        font = ImageFont.load_default()
    for i, (layout, img) in enumerate(tiles):
        x = 8 + (i % cols) * cell_w; y = 8 + (i // cols) * cell_h
        ground = Image.new('RGBA', (ISO_W, ISO_H), (0, 0, 0, 0))
        ImageDraw.Draw(ground).polygon([(ISO_W / 2, 0), (ISO_W, ISO_H / 2), (ISO_W / 2, ISO_H), (0, ISO_H / 2)], fill=(96, 108, 82, 255))
        ground.alpha_composite(img)
        sheet.alpha_composite(ground.resize((ISO_W // 2, ISO_H // 2), Image.LANCZOS), (x + 12, y + 30))
        draw.text((x + 6, y + 6), f"{layout['asset'].replace('metro_track_', '')} [0x{layout['mask']:02x}]", fill=(40, 40, 40, 255), font=font)
    sheet.save(PREVIEW)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20261104)
    tiles = []
    for layout in layouts():
        img = composite(draw_tile(layout, rng))
        img.save(OUT_DIR / f"{layout['asset']}.png")
        tiles.append((layout, img))
        print(layout['asset'], img.size)
    preview(tiles)
    print('preview', PREVIEW.relative_to(ROOT))


if __name__ == '__main__':
    main()
