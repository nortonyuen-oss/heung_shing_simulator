"""Square Norton's 啟德郵輪碼頭 render to the game's 2:1 and lay it on its 6x6 lot.

  python3 scripts/source-art/cruiseTerminal/fit.py

The render (cruiseTerminal6-01-source.png, transparent already) is drawn lower and turned a little
off 45 degrees: the building's lines slope X +0.41 / Y -0.33, its base plate's +0.495 / -0.353
(the plate steeper toward the front corner - perspective). As for the yacht club and the hotel, an
up-down skew about the front corner (verticals stay vertical) and an x:y scale, fitted to the
building's and the plate's lines alike.

The plate is a 2.1 : 1 oblong - the berth along its long side - which no such warp can square. The
long side spans a whole edge of the 6x6 lot, the berth on the sea side, and the rest of the lot (the
land side, where the coaches and taxis wait) lies on a faint ground pad, so the sprite fit still
reads the full lot (docs/campaign-p4-design.md §11).

Four facings, by where the sea lies on screen:
  cruiseTerminal6-01.png          sea to the lower right (the render as drawn)
  cruiseTerminal6-01_m.png        sea to the lower left (its mirror)
  cruiseTerminal6-01_back.png     sea to the upper left - stand-in until the land-side view is drawn:
  cruiseTerminal6-01_back_m.png   sea to the upper right    the same art, its back to the sea
"""
import numpy as np, os
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', 'Models', 'specialSites', '6x6')
X_SLOPE = (0.41 + 0.495) / 2       # building / base plate, the lines down to the right
Y_SLOPE = (0.33 + 0.353) / 2       # building / base plate (the quay), the lines up to the right
# the base plate's bottom corners (ground level, under its walls), from its bottom silhouette:
# left side y = 748 + 0.495 (x - 40), quay side y = 942 - 0.353 (x - 520)
L, F, R = (9.0, 732.7), (468.6, 960.2), (1441.0, 617.1)
W, H = 1536, 896
LEFT, RIGHT, BOTTOM = 8, 1528, 880
HALF = (RIGHT - LEFT) / 2
DL, DF, DR, DT = (LEFT, BOTTOM - HALF / 2), (LEFT + HALF, BOTTOM), (RIGHT, BOTTOM - HALF / 2), (LEFT + HALF, BOTTOM - HALF)
PAD_A, PAD_RGB = 36, (92, 88, 82)


def warp(rgba, back=False):
    s = -(X_SLOPE - Y_SLOPE) / 2
    m = X_SLOPE + s
    k = 0.5 / m
    yb = lambda x, y: k * (y + s * (x - F[0]))
    u = HALF / (R[0] - F[0])            # the berth spans the lot's whole sea-side edge
    if not back:
        ox = DF[0] - u * F[0]; oy = DF[1] - u * yb(*F)          # the plate's front corner on the lot's
    else:
        ox = DL[0] - u * L[0]; oy = DL[1] - u * yb(*L)          # its back long side on the lot's back edge
    A_, B_, C_ = 1 / u, 0, -ox / u
    D_ = -s / u; E_ = 1 / (u * k); F_ = -oy / (u * k) + s * ox / u + s * F[0]
    arr = rgba.astype(float); al = arr[..., 3:] / 255
    pre = np.concatenate([arr[..., :3] * al, arr[..., 3:]], -1).astype(np.uint8)
    o = np.asarray(Image.fromarray(pre).transform((W, H), Image.AFFINE, (A_, B_, C_, D_, E_, F_), Image.BICUBIC)).astype(float)
    a = o[..., 3:] / 255
    pad = Image.new('L', (W, H), 0); ImageDraw.Draw(pad).polygon([DL, DF, DR, DT], fill=255)
    pa = np.asarray(pad).astype(float)[..., None] / 255 * PAD_A * (1 - a)
    a2 = o[..., 3:] + pa
    rgbp = o[..., :3] + np.array(PAD_RGB, float) * pa / 255
    rgb = np.where(a2 > 0, rgbp / np.maximum(a2, 1e-6) * 255, 0)
    o = np.concatenate([np.clip(rgb, 0, 255), np.clip(a2, 0, 255)], -1).astype(np.uint8); o[o[..., 3] <= 2] = 0
    fwd = lambda p: (round(u * p[0] + ox, 1), round(u * yb(*p) + oy, 1))
    return Image.fromarray(o), [fwd(p) for p in (L, F, R)], (s, k, u)


if __name__ == '__main__':
    src = np.asarray(Image.open(os.path.join(HERE, 'cruiseTerminal6-01-source.png')).convert('RGBA'))
    for name, back in (('cruiseTerminal6-01', False), ('cruiseTerminal6-01_back', True)):
        im, corners, params = warp(src, back)
        im.save(os.path.join(OUT, name + '.png'), optimize=True)
        im.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(OUT, name + '_m.png'), optimize=True)
        print(name, 'skew %.4f yscale %.4f u %.4f' % params, 'plate L F R', corners,
              'bbox', im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
