"""Square Norton's 啟德郵輪碼頭 renders to the game's 2:1 and lay them on the terminal's 6x6 lot.

  python3 scripts/source-art/cruiseTerminal/fit.py

Two views of one building (2026-11-20: the silver U-shaped roof with its garden, the radar dome):
  cruiseTerminal6-02-sea-source.png    the berth (two boarding bridges) along the lower left
  cruiseTerminal6-02-land-source.png   the same terminal turned 180 degrees - the berth behind, upper
                                       right; the entrance, the coaches and the taxis lower left
(they replace 2026-11-19's single render, whose land side was a stand-in: the same art, back to sea).

Each is squared as Norton wants AI art squared: an up-down skew about the front corner (verticals stay
vertical) so the two ground edges slope alike, then an x:y scale so they read 0.5 - fitted to the
paved lot's own bottom edges. No perspective warp.

The sea view's lot is a 1.16 : 1 oblong (its berth side the longer), which no such warp squares: the
berth side spans the 6x6 lot's whole sea edge, its front corner on the lot's.

The two renders draw the building at different sizes on their lots: the land view's is some 1.4 times
the sea view's (the radar dome 66 px against 54, the roof 1150 against 925, each times its view's fit).
Norton tried the land view shrunk to match (0.71), then chose its quay over the whole sea edge instead
(2026-11-20: 「從後面看的畫面既碼頭長度覆蓋整條地線既邊長」): LAND_VIEW_SCALE 1, a full fit, the berth
side on the lot's sea edge - so the terminal reads bigger from the land side.

Whatever of the lot a view leaves bare lies on a faint ground pad, so the sprite fit (the alpha box
over the lot, its lowest pixel on the front corner) still reads the full lot.

Four facings, by where the sea lies on screen (cruise-terminal.js CRUISE_TERMINAL_FACING_KEYS):
  cruiseTerminal6-01.png          sea to the lower right    the sea view's mirror
  cruiseTerminal6-01_m.png        sea to the lower left     the sea view as drawn
  cruiseTerminal6-01_back.png     sea to the upper left     the land view's mirror
  cruiseTerminal6-01_back_m.png   sea to the upper right    the land view as drawn
"""
import os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', 'Models', 'specialSites', '6x6')
W = 1536
LEFT, RIGHT = 8, 1528                 # the lot diamond's left and right corners
HALF = (RIGHT - LEFT) / 2             # a 6-tile edge's width on screen
TOP_MARGIN, BOTTOM_MARGIN = 8, 16
PAD_A, PAD_RGB = 36, (92, 88, 82)
DUST, SOLID = 3, 240
# of a full fit (the quay over the whole sea edge); 0.71 would match the sea view's building size
# (dome 54 x 0.8679 / (66 x 0.9933), roof 925 x 0.8679 / (1150 x 0.9933)) but leave the quay short
LAND_VIEW_SCALE = 1.0


def clean(rgba):
    a = rgba[..., 3]
    a[a <= DUST] = 0
    a[a >= SOLID] = 255
    rgba[a == 0] = 0
    return rgba


def lot_edges(alpha):
    """The paved lot's bottom edges, from the bottom silhouette: (left slope, right slope, L, F, R).
    Fitted twice, the second time without the bumps (fenders, bollards) the first fit leaves out."""
    ys, xs = np.nonzero(alpha > 128)
    x = np.arange(xs.min(), xs.max() + 1)
    y = np.array([ys[xs == k].max() if (xs == k).any() else -1 for k in x])
    keep = y >= 0
    x, y = x[keep], y[keep]
    fx = x[y.argmax()]
    lines = []
    for m in ((x > x.min() + 40) & (x < fx - 40), (x > fx + 40) & (x < x.max() - 40)):
        p = np.polyfit(x[m], y[m], 1)
        good = m & (np.abs(y - np.polyval(p, x)) < 3)
        lines.append(np.polyfit(x[good], y[good], 1))
    (a1, b1), (a2, b2) = lines
    front_x = (b2 - b1) / (a1 - a2)
    L = (float(x.min()), float(np.polyval(lines[0], x.min())))
    F = (float(front_x), float(np.polyval(lines[0], front_x)))
    R = (float(x.max()), float(np.polyval(lines[1], x.max())))
    return a1, -a2, L, F, R


def warp(rgba, view):
    """Square one view onto the lot: (image, the lot corners L F R on it, params).
    view 'sea': the berth side (L-F) spans the lot's sea edge, front corner on the lot's front corner.
    view 'land': LAND_VIEW_SCALE of a full fit, the berth side (T-R, behind) on the lot's back-right
    edge, in the middle of it."""
    x_slope, y_slope, L, F, R = lot_edges(rgba[..., 3])
    s = -(x_slope - y_slope) / 2          # the up-down skew about the front corner
    k = 0.5 / (x_slope + s)               # then the y scale to 0.5
    yb = lambda x, y: k * (y + s * (x - F[0]))
    q = lambda p: (p[0], yb(*p))          # a point squared (before the scale u)
    Lq, Fq, Rq = q(L), q(F), q(R)
    Tq = (Lq[0] + Rq[0] - Fq[0], Lq[1] + Rq[1] - Fq[1])
    # the lot, front corner at y 0 for now
    DL, DF, DR, DT = (LEFT, -HALF / 2), (LEFT + HALF, 0.0), (RIGHT, -HALF / 2), (LEFT + HALF, -HALF)
    if view == 'sea':
        u = HALF / (Fq[0] - Lq[0])
        anchor, dest = Fq, DF
    else:
        u = LAND_VIEW_SCALE * HALF / max(Fq[0] - Lq[0], Rq[0] - Fq[0])
        anchor = ((Tq[0] + Rq[0]) / 2, (Tq[1] + Rq[1]) / 2)
        dest = ((DT[0] + DR[0]) / 2, (DT[1] + DR[1]) / 2)
    ox, oy = dest[0] - u * anchor[0], dest[1] - u * anchor[1]
    ys, xs = np.nonzero(rgba[..., 3] > 0)
    top = min(min(u * yb(px, py) + oy for px, py in zip(xs[::50], ys[::50])), DT[1])
    shift = TOP_MARGIN - top
    oy += shift
    DL, DF, DR, DT = [(x, y + shift) for x, y in (DL, DF, DR, DT)]
    H = int(round(DF[1] + BOTTOM_MARGIN))
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
    fwd = lambda p: (round(u * p[0] + ox, 1), round(u * p[1] + oy, 1))
    return Image.fromarray(o), [fwd(p) for p in (Lq, Fq, Rq, Tq)], (x_slope, y_slope, s, k, u)


if __name__ == '__main__':
    for source, view, drawn, mirror in (('cruiseTerminal6-02-sea-source.png', 'sea', 'cruiseTerminal6-01_m', 'cruiseTerminal6-01'),
                                        ('cruiseTerminal6-02-land-source.png', 'land', 'cruiseTerminal6-01_back_m', 'cruiseTerminal6-01_back')):
        rgba = clean(np.asarray(Image.open(os.path.join(HERE, source)).convert('RGBA')).copy())
        im, corners, params = warp(rgba, view)
        im.save(os.path.join(OUT, drawn + '.png'), optimize=True)
        im.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(OUT, mirror + '.png'), optimize=True)
        check = lot_edges(np.asarray(im.getchannel('A')).copy())
        print(source, 'slopes in %.3f / %.3f' % params[:2], 'skew %.4f yscale %.4f u %.4f' % params[2:], 'plate L F R T', corners,
              'size', im.size, 'slopes out %.3f / %.3f' % check[:2])
