"""seawall.py - derive the modular quay (海堤) textures from the corrected quayStraightA sheet.

    python3 seawall.py            (run from this folder; reads ../quayStraightA.png)

The quay pieces were drawn one at a time, wall towards the camera (front-right, se), with bollards
and a ladder on the water edge. A shelter's shore runs every way, and its quay is laid tile by tile,
so the kit needs plain pieces that repeat, plus the deck alone for a quay whose wall faces away from
the camera (from behind, the wall is hidden under the deck). Props (bollards, railings, lamps) are
placed by the game on top.

Writes, beside the other sheets:
  quayStraight.png    the section with its props painted out and no cross-joint at its ends:
                      deck + wall on the front-right (se) face
  quayDeck.png        the same deck without the wall: a quay whose wall faces away
  quayDeckSquare.png  an 8 x 8 m piece of that deck, filling a concave corner
and seawall-geometry.json: each output's deck corners (texture px; left, top, right, front).

The props are painted out by copying the same strip from further along it: the deck (u along the
long edge, v across) and the wall below it are both made of courses running along u, so a copy
shifted along u keeps the paving, the coping stones and the wall's piers in line.
"""
import json
import numpy as np
from PIL import Image

SRC = '../quayStraightA.png'

# deck corners on quayStraightA (detected from its outline, 2026-10-04): left, top, right
L = np.array([9.0, 742.0])
T = np.array([721.0, 383.0])
R = np.array([1013.0, 531.0])
F = L + R - T          # the front (lowest) corner
U = T - L              # along the long edge, u in [0, 1]
V = F - L              # across, v in [0, 1]: 0 the land-side edge, 1 the water edge

# The water face: from just above the bollard tops (h = -95 px, measured down from the front edge)
# all the way down the wall, rebuilt by repeating one clean stretch of it - a wall pier and the bay
# beside it, with the coping above - along the strip. The art's coping stones and piers are of
# uneven length, and the bollards and the ladder stand on them; the stretch between s = 154 and
# 314 px along the front edge is clear of both. The repeats are lined up on the art's last pier
# (s = 649 px), which is kept with the wall's right end.
FACE_TOP = -95.0
STRETCH = (154.0, 160.0)    # start of the clean stretch and its length, px along the front edge
REPEAT_START = 30.0         # the art's left-end corner stone and wall return are kept
REPEAT_END = 649.0          # repeats up to here; the art from here on is kept
END_BAND = 0.045       # coping across each end of the deck (a cross-joint every section)
SQUARE = (0.30, 0.70)  # the u range of the 8 m deck square (the deck is 20 x 8 m)


def uv_grid(shape):
    H, W = shape
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    M = np.array([U, V]).T
    inv = np.linalg.inv(M)
    dx, dy = xs - L[0], ys - L[1]
    u = inv[0, 0] * dx + inv[0, 1] * dy
    v = inv[1, 0] * dx + inv[1, 1] * dy
    return u, v


def shift_copy(img, mask, du):
    """img[mask] <- img at the same pixels moved du along the strip (nearest pixel)."""
    sx, sy = du * U
    ys, xs = np.nonzero(mask)
    src_x = np.clip(np.round(xs + sx).astype(int), 0, img.shape[1] - 1)
    src_y = np.clip(np.round(ys + sy).astype(int), 0, img.shape[0] - 1)
    img[ys, xs] = img[src_y, src_x]


def main():
    img = np.asarray(Image.open(SRC).convert('RGBA')).copy()
    H, W = img.shape[:2]
    u, v = uv_grid((H, W))
    ys, xs = np.mgrid[0:H, 0:W]

    # 1. the water face, repeated from its clean stretch
    sx = (xs - F[0]) / U[0]                      # along the front edge, 0..1
    h = ys - (F[1] + sx * U[1])                  # px below it (negative: above, on the deck)
    s_px = sx * U[0]
    start, length = STRETCH
    face = (s_px >= REPEAT_START) & (s_px < REPEAT_END) & (h >= FACE_TOP) & (img[..., 3] > 0)
    fy, fx = np.nonzero(face)
    phase = np.mod(s_px[fy, fx] - (REPEAT_END - length * np.ceil((REPEAT_END - start) / length)), length)
    shift = (start + phase - s_px[fy, fx]) / U[0]   # in u
    src_x = np.clip(np.round(fx + shift * U[0]).astype(int), 0, W - 1)
    src_y = np.clip(np.round(fy + shift * U[1]).astype(int), 0, H - 1)
    img[fy, fx] = img[src_y, src_x].copy()

    # 2. the cross-joints at the ends of the deck: paving copied in from further inside
    deck = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
    paving_rows = (v > 0.11) & (v < 0.84)
    shift_copy(img, deck & paving_rows & (u < END_BAND), +0.06)
    shift_copy(img, deck & paving_rows & (u > 1 - END_BAND), -0.06)

    straight = Image.fromarray(img)
    straight.save('../quayStraight.png', optimize=True)

    # 3. the deck alone
    deck_only = img.copy()
    deck_only[..., 3] = np.where(deck, deck_only[..., 3], 0)
    Image.fromarray(deck_only).save('../quayDeck.png', optimize=True)

    # 4. an 8 x 8 m square of it
    u0, u1 = SQUARE
    square = img.copy()
    square[..., 3] = np.where(deck & (u >= u0) & (u <= u1), square[..., 3], 0)
    Image.fromarray(square).save('../quayDeckSquare.png', optimize=True)

    sq_left, sq_top = L + u0 * U, L + u1 * U
    geometry = {
        'quayStraight.png': {'left': L.tolist(), 'top': T.tolist(), 'right': R.tolist(), 'front': F.tolist()},
        'quayDeck.png': {'left': L.tolist(), 'top': T.tolist(), 'right': R.tolist(), 'front': F.tolist()},
        'quayDeckSquare.png': {'left': sq_left.tolist(), 'top': sq_top.tolist(),
                               'right': (sq_top + V).tolist(), 'front': (sq_left + V).tolist()},
    }
    json.dump(geometry, open('../seawall-geometry.json', 'w'), indent=1)
    print('wrote quayStraight.png, quayDeck.png, quayDeckSquare.png, seawall-geometry.json')


if __name__ == '__main__':
    main()
