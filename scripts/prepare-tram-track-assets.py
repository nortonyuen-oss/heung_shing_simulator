"""電車路軌 (docs/tram-design.md §2): pictures laid over the road tiles (newRoadTiles, 512 x 256, the
tile's top face a diamond from (96, 129) to (416, 129), top corner (256, 49)), in the frame the road
is drawn in (tram.js turns the map's bits with the map, as the metro's track does: railVisualMask).

- tram_track_<bit>: a narrow road's two tracks, one in each lane (the lanes' middles 0.12 of a tile -
  2.4 m - either side of the road's), along the bit (1 X: s-n, 2 Y: w-e, 4 w-n, 8 s-e, 16 w-s, 32 n-e);
  a corner's tracks quarter circles about the tile's corner the two sides share.
- tram_res_<side>: one half of a dual carriageway's tram reservation - the inner pavement on that
  side of the tile (the band's middle on its edge) paved over in concrete, a yellow line along its
  kerb, and its track 1.6 m from the band's middle.

The rails are Hong Kong's 1,067 mm gauge, grooved into the road: a light head, a dark groove inside.
Run: .venv/bin/python -B scripts/prepare-tram-track-assets.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'Models/tramways/track'
W, H = 512, 256
TOP = (256.0, 49.0)          # the face's top corner (the tile's north corner)
HALF = 160.0                 # px across the face for a tile along one side (x)
N = 1024                     # top-down px a tile side
TILE_M = 20.0

LANE = 0.12                  # a lane's middle from the road's, tiles
GAUGE = 1.067 / TILE_M       # rail to rail, tiles
RES_TRACK = 1.6 / TILE_M     # the reservation's track from the band's middle
PAVE = 0.25                  # a pavement's width, tiles (the carriageway 0.5 across the middle)

RAIL_HEAD = np.array([178, 180, 184], np.float32)
GROOVE = np.array([34, 34, 36], np.float32)
BED = np.array([58, 58, 60], np.float32)
CONCRETE = np.array([150, 149, 144], np.float32)
YELLOW = np.array([222, 186, 52], np.float32)


def grid():
    m = (np.arange(N) + 0.5) / N
    u, v = np.meshgrid(m, m)      # u along col (east), v along row (south), 0..1
    return u, v


def to_canvas(rgba):
    """A top-down tile (N x N, u right, v down) onto the road's canvas: x = 256 + (u - v) 160,
    y = 49 + (u + v) 80."""
    ax, bx, cx = HALF / N, -HALF / N, TOP[0]
    ay, by, cy = (HALF / 2) / N, (HALF / 2) / N, TOP[1]
    inv = np.linalg.inv(np.array([[ax, bx, cx], [ay, by, cy], [0, 0, 1]]))
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA').convert('RGBa')
    return img.transform((W, H), Image.AFFINE, tuple(inv[0]) + tuple(inv[1]), resample=Image.BICUBIC).convert('RGBA')


def cover(d, half_width):
    """Coverage of a band |d| <= half_width, antialiased over a pixel."""
    px = 1.0 / N
    return np.clip(0.5 + (half_width - np.abs(d)) / px, 0, 1)


def lay(rgba, colour, alpha):
    a = alpha[..., None]
    rgba[..., :3] = rgba[..., :3] * (1 - a) + colour * a
    rgba[..., 3] = np.maximum(rgba[..., 3], alpha * 255)


def track(rgba, d, along_ok=None):
    """One track whose middle line is at signed distance d (tiles) from each pixel."""
    ok = 1.0 if along_ok is None else along_ok
    lay(rgba, BED, cover(d, GAUGE / 2 + 0.010) * 0.28 * ok)
    for side in (-1, 1):
        r = d - side * GAUGE / 2
        lay(rgba, GROOVE, cover(r + side * 0.0045, 0.0028) * 0.85 * ok)
        lay(rgba, RAIL_HEAD, cover(r - side * 0.0012, 0.0030) * ok)


# each bit: a straight (an axis, its line at 0.5) or a corner (the corner it curves about)
STRAIGHT = {1: 'u', 2: 'v'}      # X runs along v (s-n): its line u = 0.5; Y along u: v = 0.5
CORNER = {4: (0, 0), 8: (1, 1), 16: (0, 1), 32: (1, 0)}    # w-n, s-e, w-s, n-e


def narrow(bit):
    u, v = grid()
    rgba = np.zeros((N, N, 4), np.float32)
    if bit in STRAIGHT:
        d0 = (u - 0.5) if STRAIGHT[bit] == 'u' else (v - 0.5)
        for off in (-LANE, LANE):
            track(rgba, d0 - off)
    else:
        cu, cv = CORNER[bit]
        r = np.hypot(u - cu, v - cv)
        for off in (-LANE, LANE):
            track(rgba, r - (0.5 + off))
    return to_canvas(rgba)


def reservation(side):
    """The half on `side` of the tile: the band's middle along that edge."""
    u, v = grid()
    rgba = np.zeros((N, N, 4), np.float32)
    # distance in from the edge on `side`
    d = {'n': v, 's': 1 - v, 'w': u, 'e': 1 - u}[side]
    lay(rgba, CONCRETE, cover(d - PAVE / 2, PAVE / 2) * (0.92 + 0.08 * np.random.default_rng(7).random((N, N))))
    # the kerb's yellow line, a little in from the carriageway
    lay(rgba, YELLOW, cover(d - (PAVE - 0.012), 0.004))
    track(rgba, d - RES_TRACK)
    return to_canvas(rgba)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for bit in (1, 2, 4, 8, 16, 32):
        narrow(bit).save(OUT / f'tram_track_{bit}.png')
        print('tram_track', bit)
    for side in 'nesw':
        reservation(side).save(OUT / f'tram_res_{side}.png')
        print('tram_res', side)


if __name__ == '__main__':
    main()
