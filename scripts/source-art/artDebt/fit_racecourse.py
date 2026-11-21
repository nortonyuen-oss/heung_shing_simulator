"""Norton's 沙田馬場 render (2026-11-21) on a 6x12 lot: cut in two 6x6 halves, each with its mirror.

  python3 scripts/source-art/artDebt/fit_racecourse.py

Norton: 「馬場我想用6*12，把我給妳的你從中間剪開兩份6*6，然後在遊戲組合」, 「join要睇方向，唔好兩邊拼唔埋」,
「切開兩半之後都要做鏡像」.

The render (on black) is a 6x12 lot seen with its long side running up-right: the grandstand along the
back long edge, the track and the garden in front. Its edges slope +0.494 / -0.503, squared to 0.5 by an
up-down skew and a y scale about the front corner (Norton's rule: verticals stay vertical, never a
perspective warp). Its long side is 1.96 times its short side, not 2 - no such warp can change that.

The game draws each half as a 6x6 building, fitting its sprite by the alpha box's width (over the lot's
600 px) and putting its lowest pixel on the lot's front corner. The halves join only if both come out at
one scale and the back half's lowest pixel is exactly six tiles up the long side from the front half's,
in the picture's own pixels. So:
  W   = twice the short side (the front corner to the left corner), each half's alpha box width;
  Q   = F + (W/2, -W/4), the back half's front corner, on the front edge;
  the cut runs from Q up the short-side direction to the back edge, and whatever stands above it
  belongs to the half whose ground it stands on (left of the cut's top: the front half).
Faint marker pixels (alpha 24, over the fit's threshold of 20, invisible) pin each box to exactly W and
the back half's lowest pixel to Q. The short side is exact; the far end falls ~17 px of the picture
(~11 px at zoom 1) short of the lot's far corner - the 1.96 ratio.

  racecourse6-01a.png     the front half (the lot's front corner)  long side running up-right
  racecourse6-01b.png     the back half                            long side running up-right
  racecourse6-01a_m.png   the front half, mirrored                 long side running up-left
  racecourse6-01b_m.png   the back half, mirrored                  long side running up-left
racecourse.js picks two of them by where each half falls on screen, so the halves join at every turn of
the map. A check sheet of both joins is written to the temp folder (racecourse-check.png).
"""
import json
import os
import tempfile
import numpy as np
from PIL import Image
import lotfit

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', 'Models', 'specialSites', '6x6')
MARK_A = 24          # over EFFECTIVE_PIXEL_ALPHA_THRESHOLD (20)
GAME_HALF = 600      # a 6x6 lot's width on screen: (6 + 6) * TILE_WIDTH / 2


def main():
    rgba = lotfit.clean(lotfit.load_rgba(os.path.join(HERE, 'racecourse-source.png'), black_background=True))
    # the black background's fringe: a 1 px dark rim where the render was anti-aliased onto black
    a = rgba[..., 3]
    rim = (a > 0) & (np.roll(a, 1, 0) == 0) | (a > 0) & (np.roll(a, -1, 0) == 0) \
        | (a > 0) & (np.roll(a, 1, 1) == 0) | (a > 0) & (np.roll(a, -1, 1) == 0)
    rim &= rgba[..., :3].max(axis=2) < 70
    a[rim] = 0
    lk, rk, L, F, R, _, _ = lotfit.bottom_edges(a)
    rgba, e, d, top = lotfit.skew_scale(rgba, lk, rk, F[0])
    rgba = lotfit.clean(rgba)
    rgba, _ = lotfit.crop_to_alpha(rgba, margin=24)
    alpha = rgba[..., 3]
    lk, rk, L, F, R, _, _ = lotfit.bottom_edges(alpha)
    print('squared: slopes %.4f / %.4f' % (lk, rk), 'L', L, 'F', F, 'R', R,
          'short %d long %d (%.3f)' % (F[0] - L[0], R[0] - F[0], (R[0] - F[0]) / (F[0] - L[0])))

    W = 2 * (F[0] - L[0])
    Q = (F[0] + W // 2, F[1] - W // 4)
    J = (Q[0] - W // 2, Q[1] - W // 4)              # the cut's back end
    h, w = alpha.shape
    ys, xs = np.mgrid[0:h, 0:w]
    line = Q[1] + (xs - Q[0]) * 0.5                   # the cut: slope +0.5 through Q
    front = (xs < J[0]) | ((xs <= Q[0]) & (ys > line))
    halves = {}
    for name, mask in (('a', front), ('b', ~front)):
        part = rgba.copy()
        part[~mask] = 0
        halves[name] = part
    # pin the boxes: the front half spans [L.x, L.x + W] and its lowest pixel is F (as drawn);
    # the back half spans [Q.x - W/2, Q.x + W/2] and its lowest pixel is Q
    def mark(img, x, y):
        if img[y, x, 3] == 0:
            img[y, x] = (90, 140, 70, MARK_A)
    mark(halves['a'], L[0] + W, Q[1] - 1)
    mark(halves['b'], Q[0] - W // 2, J[1] - 1)
    mark(halves['b'], Q[0] + W // 2, J[1] + 1)
    mark(halves['b'], Q[0], Q[1])
    halves['b'][Q[1] + 1:, :] = 0                     # nothing of the back half below its corner

    outputs = {}
    boxes = {}
    for name, img in halves.items():
        cropped, box = lotfit.crop_to_alpha(img, margin=1)
        boxes[name] = box
        for suffix, pic in (('', cropped), ('_m', cropped[:, ::-1])):
            path = os.path.join(OUT, 'racecourse6-01%s%s.png' % (name, suffix))
            Image.fromarray(pic).save(path, optimize=True)
            outputs[name + suffix] = pic
        # report what the game's fit will read
        al = cropped[..., 3] > 20
        yy, xx = np.nonzero(al)
        low = yy.max()
        print('half %s: %s, fit box %d px, lowest row %d at x %.1f (picture %s)' % (
            name, cropped.shape[1::-1], xx.max() - xx.min() + 1, low, xx[yy == low].mean() + box[0],
            'F' if name == 'a' else 'Q'))
    print('W', W, 'Q', Q, 'F', F)
    # where the back half's picture sat against the front half's in the one picture, plain and mirrored
    # (test/racecourse.test.js checks the game's placement puts them back there)
    a, b = boxes['a'], boxes['b']
    join = {'plain': {'dx': int(b[0] - a[0]), 'dy': int(b[1] - a[1])}, 'mirror': {'dx': int(a[2] - b[2]), 'dy': int(b[1] - a[1])}}
    with open(os.path.join(HERE, 'racecourse-join.json'), 'w') as handle:
        json.dump(join, handle, indent=1)
    print('join', join)
    check_sheet(outputs, W)


def fit(pic):
    al = pic[..., 3] > 20
    yy, xx = np.nonzero(al)
    low = yy.max()
    return xx.max() - xx.min() + 1, xx[yy == low].mean(), low


def check_sheet(pics, W):
    """Both joins as the game draws them: each half scaled by its own fit, its lowest pixel on its corner."""
    sheet = Image.new('RGBA', (1500, 1360), (60, 110, 60, 255))
    for row, (front, back, step) in enumerate((('a', 'b', (300, -150)), ('a_m', 'b_m', (-300, -150)))):
        base = (450 if step[0] > 0 else 1050, 640 + row * 660)
        for key, offset in ((back, step), (front, (0, 0))):
            pic = pics[key]
            width, ox, oy = fit(pic)
            s = GAME_HALF / width
            img = Image.fromarray(pic).resize((round(pic.shape[1] * s), round(pic.shape[0] * s)), Image.LANCZOS)
            x = base[0] + offset[0] - ox * s
            y = base[1] + offset[1] - oy * s
            sheet.alpha_composite(img, (round(x), round(y)))
    out = os.path.join(tempfile.gettempdir(), 'racecourse-check.png')
    sheet.save(out)
    print('check sheet', out)


if __name__ == '__main__':
    main()
