"""Norton's 啟德郵輪 dual view (2026-11-21) squared to 2:1: four headings for cruise-terminal.js.

  python3 scripts/source-art/artDebt/fit_cruise_ship.py

The sheet holds two views of one ship: on the left its bow points to the lower right (heading se), on the
right to the upper right (ne). The hull is cut at the waterline. Each view is squared the way the
typhoon-shelter boats were (typhoonShelter/tools/correct.py, mode 'axis'): only the hull's long axis can
be measured (its waterline, from the bottom silhouette), the other ground direction follows from the
render's elevation (sin e = 0.43, as for the boats), then Y = d*y + c*(x - cx) takes both to 0.5 -
verticals stay vertical. Mirrors make the other two headings (sw, nw).

For each view it prints the hull's waterline length on screen (x extent) and the centre of its waterline,
in the output picture's pixels: cruise-terminal.js CRUISE_SHIP_VIEWS places that centre on the water
and scales the hull to the ship's length in tiles.
"""
import os
import numpy as np
from PIL import Image
import lotfit

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', 'Models', 'specialSites', 'cruiseShip')
SIN_E = 0.43
BEAM_PER_LENGTH = 1 / 8        # the prompt's 8 : 1


def waterline(alpha, sign):
    """The near side's waterline: the bottom silhouette's straight run. (slope, x0, x1, line(x))."""
    ys, xs = np.nonzero(alpha > 128)
    X = np.arange(xs.min(), xs.max() + 1)
    low = np.array([ys[xs == x].max() if (xs == x).any() else -1 for x in X])
    n = len(X)
    m = (X > X[0] + n * 0.15) & (X < X[-1] - n * 0.15) & (low >= 0)
    k, b = np.polyfit(X[m], low[m], 1)
    on = (np.abs(low - (k * X + b)) < 6) & (low >= 0)
    k, b = np.polyfit(X[on], low[on], 1)
    on = (np.abs(low - (k * X + b)) < 4) & (low >= 0)
    return k, int(X[on].min()), int(X[on].max()), (k, b)


def square(rgba, s_long, long_is_down):
    """d, c for the view (correct.py 'axis': s1 the '\\' slope, s2 the '/' slope's size)."""
    if long_is_down:
        s1 = s_long; s2 = SIN_E ** 2 / s1
    else:
        s2 = -s_long; s1 = SIN_E ** 2 / s2
    d = 1 / (s1 + s2)
    c = (s2 - s1) / (2 * (s1 + s2))
    h, w, _ = rgba.shape
    cx = w / 2
    corners = [d * y + c * (x - cx) for x in (0, w) for y in (0, h)]
    T = -min(corners) + 8
    H = int(np.ceil(max(corners) + T + 8))
    data = (1, 0, 0, -c / d, 1 / d, (c * cx - T) / d)
    img = Image.fromarray(rgba).convert('RGBa').transform((w, H), Image.AFFINE, data, resample=Image.BICUBIC).convert('RGBA')
    return np.asarray(img).copy(), d, c


def main():
    os.makedirs(OUT, exist_ok=True)
    rgba = lotfit.clean(lotfit.load_rgba(os.path.join(HERE, 'cruiseShip-source.png')))
    a = rgba[..., 3]
    cols = np.nonzero(a.max(axis=0) > 0)[0]
    gap = np.nonzero(np.diff(cols) > 5)[0][0]
    split = (cols[gap] + cols[gap + 1]) // 2
    for heading, x0, x1 in (('SE', 0, split), ('NE', split, a.shape[1])):
        view = rgba[:, x0:x1].copy()
        view, _ = lotfit.crop_to_alpha(view, margin=4)
        k, _, _, _ = waterline(view[..., 3], 0)
        view, d, c = square(view, k, heading == 'SE')
        view = lotfit.clean(view)
        view, _ = lotfit.crop_to_alpha(view, margin=2)
        k, xa, xb, (lk, lb) = waterline(view[..., 3], 0)
        # the hull's box is its length plus its beam across (8 : 1); its footprint's centre is the box's
        # middle, half a beam above the near waterline there
        w = view.shape[1]
        length = w / (1 + BEAM_PER_LENGTH)
        beam = length * BEAM_PER_LENGTH
        xc = (w - 1) / 2
        centre = (xc, lk * xc + lb - beam / 2)
        for name, pic, cen in ((heading, view, centre), ({'SE': 'SW', 'NE': 'NW'}[heading], view[:, ::-1], (w - 1 - centre[0], centre[1]))):
            Image.fromarray(np.ascontiguousarray(pic)).save(os.path.join(OUT, 'cruiseShip-%s.png' % name), optimize=True)
            print("  %s: { path: 'Models/specialSites/cruiseShip/cruiseShip-%s.png', length: %d, centreX: %.1f, centreY: %.1f },  // %dx%d, waterline %.4f, d %.3f c %.3f"
                  % (name.lower(), name, length, cen[0], cen[1], pic.shape[1], pic.shape[0], k if name == heading else -k, d, c))


if __name__ == '__main__':
    main()
