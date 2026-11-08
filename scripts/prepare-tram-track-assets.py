"""電車路 (docs/tram-design.md §2): the reservation's paving, laid over the road tiles (newRoadTiles,
512 x 256, the tile's top face a diamond from (96, 129) to (416, 129), top corner (256, 49)), in the
frame the road is drawn in (tram.js turns the side with the map).

- tram_res_<side>: one half of a dual carriageway's tram reservation - the inner pavement on that
  side of the tile (the band's middle on its edge) paved over in concrete, a yellow line along its kerb.

The rails themselves are drawn in the game (tram.js drawTramTrackPicture), each tile its share of the
lines - narrow roads, reservations, the shifts between them, corners and junctions (TRAM_RAIL_STYLE:
Hong Kong's 1,067 mm gauge grooved into the road, a light head, a dark groove inside).
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

PAVE = 0.25                  # a pavement's width, tiles (the carriageway 0.5 across the middle)

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


def reservation(side):
    """The half on `side` of the tile: the band's middle along that edge."""
    u, v = grid()
    rgba = np.zeros((N, N, 4), np.float32)
    # distance in from the edge on `side`
    d = {'n': v, 's': 1 - v, 'w': u, 'e': 1 - u}[side]
    lay(rgba, CONCRETE, cover(d - PAVE / 2, PAVE / 2) * (0.92 + 0.08 * np.random.default_rng(7).random((N, N))))
    # the kerb's yellow line, a little in from the carriageway
    lay(rgba, YELLOW, cover(d - (PAVE - 0.012), 0.004))
    return to_canvas(rgba)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for side in 'nesw':
        reservation(side).save(OUT / f'tram_res_{side}.png')
        print('tram_res', side)


if __name__ == '__main__':
    main()
