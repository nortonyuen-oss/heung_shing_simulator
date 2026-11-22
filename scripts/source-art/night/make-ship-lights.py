"""The cruise ship's night lights (2026-11-22): a light layer for each heading, drawn over the ship after dark.

  python3 scripts/source-art/night/make-ship-lights.py

For each of Norton's two drawn views (cruiseShip-SE: bow lower right; cruiseShip-NE: bow upper right) and
their mirrors (SW, NW), writes Models/specialSites/cruiseShip/cruiseShip-<H>_lit.png, the same size as the
ship: its cabin glass glowing warm (most cabins lit, some dark) and its navigation lights -
  a white masthead light on the radar mast, a white stern light, and the sidelight on the side we see:
  green (starboard) when the bow points right, red (port) when the bow points left (the mirrors).
cruise-terminal.js draws it additively over the ship, at the building lights' strength.
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SHIPS = os.path.join(HERE, '..', '..', '..', 'Models', 'specialSites', 'cruiseShip')

# in the drawn views' own pixels: (x, y) of each light
VIEWS = {
    'SE': {'masthead': (719, 198), 'side': (843, 378), 'stern': (40, 112)},
    'NE': {'masthead': (781, 18), 'side': (890, 128), 'stern': (34, 588)},
}
MIRRORS = {'SW': 'SE', 'NW': 'NE'}
WINDOW_GLOW = (255, 206, 138)
WHITE, GREEN, RED = (255, 250, 236), (90, 255, 140), (255, 70, 60)
LIT_SHARE = 0.78


def label(binary):
    h, w = binary.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for y0, x0 in zip(*np.nonzero(binary)):
        if lab[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        lab[y0, x0] = n
        while stack:
            y, x = stack.pop()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and binary[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n
                    stack.append((ny, nx))
    return lab, n


def windows(arr):
    """Cabin glass: cool, darker than the white superstructure, not the navy waterline or the pools."""
    r, g, b, a = (arr[..., i].astype(float) for i in range(4))
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return (a > 200) & (b > r + 12) & (g > r + 2) & (b - g < 60) & (lum > 45) & (lum < 160)


def light(out, x, y, colour, core=3.0, glow=13.0, strength=1.0):
    h, w = out.shape[:2]
    x0, x1 = max(0, int(x - glow * 3)), min(w, int(x + glow * 3) + 1)
    y0, y1 = max(0, int(y - glow * 3)), min(h, int(y + glow * 3) + 1)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d2 = (xx - x) ** 2 + (yy - y) ** 2
    f = np.clip((np.exp(-d2 / (core * core)) + 0.55 * np.exp(-d2 / (glow * glow))) * strength, 0, 1)
    patch = out[y0:y1, x0:x1]
    for c in range(3):
        patch[..., c] = np.maximum(patch[..., c], colour[c] * f)
    patch[..., 3] = np.maximum(patch[..., 3], 255 * f)


def build(heading):
    src = np.asarray(Image.open(os.path.join(SHIPS, f'cruiseShip-{heading}.png')).convert('RGBA'))
    h, w = src.shape[:2]
    out = np.zeros((h, w, 4), float)
    glass = windows(src)
    lab, n = label(glass)
    rng = np.random.default_rng(22)
    lit = rng.random(n + 1) < LIT_SHARE
    for k in range(1, n + 1):
        if not lit[k]:
            continue
        m = lab == k
        level = 0.7 + 0.3 * rng.random()
        for c in range(3):
            out[..., c][m] = WINDOW_GLOW[c] * level
        out[..., 3][m] = 235 * level
    spots = VIEWS[heading]
    light(out, *spots['masthead'], WHITE)
    light(out, *spots['stern'], WHITE)
    light(out, *spots['side'], GREEN, glow=15)
    return out.clip(0, 255).astype(np.uint8), n


def main():
    for heading in VIEWS:
        img, n = build(heading)
        Image.fromarray(img).save(os.path.join(SHIPS, f'cruiseShip-{heading}_lit.png'), optimize=True)
        print(f'cruiseShip-{heading}_lit.png: {n} cabin windows')
    for mirror, of in MIRRORS.items():
        img = np.asarray(Image.open(os.path.join(SHIPS, f'cruiseShip-{of}_lit.png'))).copy()
        # the mirror shows the other side: the sidelight turns from green to red
        w = img.shape[1]
        side = VIEWS[of]['side']
        sx, sy = w - 1 - side[0], side[1]
        img = img[:, ::-1].copy()
        r = 46
        patch = img[max(0, sy - r):sy + r, max(0, sx - r):sx + r].astype(float)
        greenish = (patch[..., 1] > patch[..., 0] + 40) & (patch[..., 3] > 0)
        patch[greenish] = np.stack([patch[greenish][:, 1] * RED[0] / 255, patch[greenish][:, 1] * RED[1] / 255,
                                    patch[greenish][:, 1] * RED[2] / 255, patch[greenish][:, 3]], axis=-1)
        img[max(0, sy - r):sy + r, max(0, sx - r):sx + r] = patch.clip(0, 255).astype(np.uint8)
        Image.fromarray(img).save(os.path.join(SHIPS, f'cruiseShip-{mirror}_lit.png'), optimize=True)
        print(f'cruiseShip-{mirror}_lit.png: mirror of {of}, sidelight red')


if __name__ == '__main__':
    main()
