"""Lay Norton's 九龍城寨文化園區 render (2026-11-20, 「九龍城寨煙火街景」) on its 4x4 lot.

  python3 scripts/source-art/walledCity/fit.py

The render (walledCityPark4-01-source.png) is already the game's 2:1: its paved lot's edges slope
+0.4986 / -0.5006 and its left, front and right corners sit at (6, 836), (626, 1149) and (1247, 839),
so - unlike the cruise terminal or the yacht club - it needs no skew or scale. The sprite fit (the
alpha box's width over the lot, its lowest pixel on the front corner) reads the lot as drawn.

What it does need is its alpha: the body is 250-253 (a faint see-through), and anti-aliasing dust of
1-3 lies around it. The body is made opaque, the dust cleared, and the picture cut to its box.
Writes Models/specialSites/4x4/walledCityPark4-01.png (it replaces standin.py's 6x6 tenements; Norton
chose the 4x4 lot for it - 「好似4x4比例啱啲」). The sprite fit scales it to whatever lot it stands on.
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, 'walledCityPark4-01-source.png')
OUT = os.path.join(HERE, '..', '..', '..', 'Models', 'specialSites', '4x4', 'walledCityPark4-01.png')
DUST, SOLID, MARGIN = 3, 240, 2


def lot_slopes(alpha):
    """The paved lot's two front edges, from the bottom silhouette: (left slope, right slope, front x, y)."""
    ys, xs = np.nonzero(alpha > 128)
    bottom = {x: ys[xs == x].max() for x in range(xs.min(), xs.max() + 1)}
    x = np.array(sorted(bottom)); y = np.array([bottom[k] for k in x])
    front = x[y.argmax()]
    left = (x > x.min() + 30) & (x < front - 60)
    right = (x > front + 60) & (x < x.max() - 30)
    return np.polyfit(x[left], y[left], 1)[0], np.polyfit(x[right], y[right], 1)[0], int(front), int(y.max())


def main():
    rgba = np.asarray(Image.open(SOURCE).convert('RGBA')).copy()
    a = rgba[..., 3]
    a[a <= DUST] = 0
    a[a >= SOLID] = 255
    rgba[a == 0] = 0
    ys, xs = np.nonzero(a > 0)
    box = (max(0, xs.min() - MARGIN), max(0, ys.min() - MARGIN), xs.max() + 1 + MARGIN, ys.max() + 1 + MARGIN)
    out = Image.fromarray(rgba).crop(box)
    out.save(OUT, optimize=True)
    left, right, fx, fy = lot_slopes(np.asarray(out.getchannel('A')))
    print('wrote', os.path.relpath(OUT), out.size, 'lot slopes %.4f / %.4f' % (left, right), 'front corner', (fx, fy))


if __name__ == '__main__':
    main()
