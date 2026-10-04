"""promenade.py - the 海濱步道 (harbourfront promenade) kit from Norton's waterfront render.

    python3 promenade.py [--paving grey|weathered|render]
                                  (run from this folder; reads ../original/seawall/promenadeEdge.png)

The render (2026-10-04) is a whole waterfront: sea behind, a strip of coping, red brick paving and
kerb along it, the road in front; on an opaque, painted chequerboard. It is the promenade seen with
the sea beyond it (the wall hidden under the coping). This takes one 20 m section from the middle
of the strip and writes, beside the other sheets:

  promenadeDeck.png   the section, sea side at the back: for a promenade whose sea faces away
                      from the camera
  promenadeFront.png  the same paving turned round, the coping on the near edge, with the wall
                      below it (built from the render's own end face): the sea faces the camera
  promenadeFill.png   a square of the brick paving, filling a concave corner
and promenade-geometry.json: each output's deck corners (left, front, right) in texture px.

The coping is rebuilt from the kerb (the same stone, mirrored across the strip), which drops the
bollards and mooring rings standing on it - the game places its own along the edge - and the cut
leaves out the sea, the road and the chequerboard.

The render's brick is a flat, saturated red (Norton, 2026-10-04: "太鮮艷"). The fill's paving is
toned (tone_paving): 'grey' (the default, Norton's pick) concrete pavers, 'weathered' a dull,
brownish brick like the park paths, 'render' the render's own colour. Each is mottled and grimed with
noise that repeats exactly across the cell, so neighbouring cells meet without a seam. (The whole
strip pieces, promenadeDeck / promenadeFront, are no longer drawn and keep the render's colour.)

Steps: the render is brought to 2:1 isometric (X = x, Y = d y + c (x - cx)), the strip is located
by its two long edges (water/coping and kerb, fitted on the render) and cut as a parallelogram.
"""
import json
import numpy as np
from PIL import Image

SRC = '../original/seawall/promenadeEdge.png'

# measured on the render: the long edges' slopes ('/'), and the short (end) edges' ('\')
UP, DOWN = 0.60, 0.62
D = 1 / (UP + DOWN)
C = (UP - DOWN) / (2 * (UP + DOWN))
# the water/coping edge and the kerb's outer edge on the render: y = m x + b
LINE_A = (-0.5895, 899.1)
LINE_B = (-0.6111, 1266.1)
SECTION_X = (340.0, 955.0)    # along the water edge: clear of the left end face, the lamp and the last ring
COPING_V = 0.18               # the coping band, as a fraction of the strip's depth (measured)
KERB_V = 0.875                # where the kerb band starts (measured, 0.863-0.888 along it)
END_FACE_X = 264.0            # the strip's left end (its face is the wall texture)
FILL_U = (0.30, 0.30)         # where the fill square's brick is taken from (u start; size set below)
# the paving tone: how much of the render's colour is kept, the colour it is pulled toward
# (multiplied by each pixel's luminance, so the mortar lines and shading stay), and a brightness
PAVING_STYLES = {
    'render': None,
    'weathered': {'keep': 0.28, 'tint': (1.16, 0.93, 0.80), 'gain': 0.95},
    'grey': {'keep': 0.0, 'tint': (1.02, 1.0, 0.95), 'gain': 1.12},
}


def tone_paving(pix, u, v, style, seed=7):
    """pix (..., 3) at cell coordinates u, v in [0, 1]: toned to `style`. The noise is a sum of
    whole-period waves in u and v, so the cell's opposite edges agree."""
    spec = PAVING_STYLES[style]
    if spec is None:
        return pix
    rgb = pix.astype(float)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    rng = np.random.default_rng(seed)
    def waves(freqs, amp):
        n = np.zeros_like(u)
        for f in freqs:
            for _ in range(3):
                i, j = rng.integers(-f, f + 1, 2)
                if i == 0 and j == 0:
                    continue
                n += np.cos(2 * np.pi * (i * u + j * v) + rng.uniform(0, 2 * np.pi))
        return amp * n / np.sqrt(max(1, 3 * len(freqs)))
    # weathering patches (large), mottling about a paver across (small), and a fine grain
    shade = 1 + waves([1, 2, 3], 0.035) + waves([9, 12, 15], 0.03) + rng.normal(0, 0.025, u.shape)
    toned = lum[..., None] * np.array(spec['tint']) * (1 - spec['keep']) + rgb * spec['keep']
    toned *= spec['gain'] * shade[..., None]
    # grime settles a little warmer and darker in the low patches
    dirt = np.clip(-waves([2, 4], 0.6), 0, 1)[..., None] * np.array([0.0, 2.0, 5.0])
    return np.clip(toned - dirt, 0, 255)


def correct(img):
    """The render through the isometric correction; returns the image and the point map."""
    W, H = img.size
    cx = W / 2
    ys = [D * y + C * (x - cx) for x in (0, W) for y in (0, H)]
    T = -min(ys)
    H2 = int(np.ceil(max(ys) + T))
    # inverse: x = X ; y = (Y - T - C (X - cx)) / D
    data = (1, 0, 0, -C / D, 1 / D, (C * cx - T) / D)
    out = img.transform((W, H2), Image.AFFINE, data, resample=Image.BICUBIC)
    return out, (lambda x, y: (x, D * y + C * (x - cx) + T))


def main(paving='grey'):
    src = Image.open(SRC).convert('RGB')
    img, P = correct(src)
    a = np.asarray(img).astype(np.int32)
    Hh, Ww = a.shape[:2]

    # the strip in corrected space: the water edge through two points of line A, the kerb edge
    # parallel to it (the depth averaged over the section)
    (mA, bA), (mB, bB) = LINE_A, LINE_B
    x0, x1 = SECTION_X
    A0 = np.array(P(x0, mA * x0 + bA)); A1 = np.array(P(x1, mA * x1 + bA))
    depth = np.mean([P(x, mB * x + bB)[1] - P(x, mA * x + bA)[1] for x in (x0, x1)])
    U = A1 - A0                       # along the strip (slope -0.5 after correction)
    V = np.array([depth, depth / 2])  # across it, water edge -> kerb edge (slope +0.5)
    M = np.linalg.inv(np.array([U, V]).T)
    ys, xs = np.mgrid[0:Hh, 0:Ww].astype(float)
    rel = np.stack([xs - A0[0], ys - A0[1]])
    u = M[0, 0] * rel[0] + M[0, 1] * rel[1]
    v = M[1, 0] * rel[0] + M[1, 1] * rel[1]
    deck = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)

    # 1. the coping, rebuilt as the kerb mirrored across the strip: the same stone, without the
    # bollards and rings standing on it (the game places its own along the edge). The kerb band is a
    # little narrower than the coping, so it is stretched to fit.
    coping = deck & (v <= COPING_V + 0.005)
    cy, cx = np.nonzero(coping)
    v_src = 1 - v[cy, cx] * ((1 - KERB_V) / COPING_V)
    sx = np.clip(np.round(A0[0] + u[cy, cx] * U[0] + v_src * V[0]).astype(int), 0, Ww - 1)
    sy = np.clip(np.round(A0[1] + u[cy, cx] * U[1] + v_src * V[1]).astype(int), 0, Hh - 1)
    a[cy, cx] = a[sy, sx]

    # 2. the deck: the section only
    def rgba(mask, pix):
        out = np.zeros((Hh, Ww, 4), np.uint8)
        out[..., :3] = np.clip(pix, 0, 255)
        out[..., 3] = np.where(mask, 255, 0)
        return out
    deck_img = rgba(deck, a)

    # 3. the front piece: the deck turned round its centre, the wall hung below its near edge
    ctr = A0 + U / 2 + V / 2
    rx = np.clip(np.round(2 * ctr[0] - xs).astype(int), 0, Ww - 1)
    ry = np.clip(np.round(2 * ctr[1] - ys).astype(int), 0, Hh - 1)
    front_pix = a[ry, rx]
    # the near (front-right) edge after turning: from A0 + V to A1 + V; the wall texture is the
    # render's left end face, under its end edge from the water corner W to W + V
    W0 = np.array(P(END_FACE_X, mA * END_FACE_X + bA))
    lum = a.sum(axis=2) / 3
    heights = []
    for s in np.linspace(0.2, 0.8, 7):            # how far the dark face reaches down: the median,
        px, py = W0 + s * V                       # as a highlight on the stone reads as background
        col = lum[int(py):, int(round(px))]
        dark = np.nonzero(col < 110)[0]            # the coping's face, then the dark wall...
        if not len(dark):
            continue
        below = np.nonzero(col[dark[0]:] > 175)[0]  # ...down to the background
        heights.append(dark[0] + (below[0] if len(below) else 0) - 3)
    face_h = np.median(heights)
    face_h = int(face_h)
    f_s = ((xs - (A0 + V)[0]) / U[0])                 # 0..1 along the front edge
    f_h = ys - ((A0 + V)[1] + f_s * U[1])              # px below it
    wall = (f_s >= 0) & (f_s <= 1) & (f_h > 0) & (f_h < face_h)
    # the middle 70% of the end face (clear of its corners) repeats along the edge
    seg = 0.15 + np.mod(f_s * U[0], 0.7 * depth) / depth
    tx = np.clip(np.round(W0[0] + (1 - seg) * V[0]).astype(int), 0, Ww - 1)
    ty = np.clip(np.round(W0[1] + (1 - seg) * V[1] + f_h).astype(int), 0, Hh - 1)
    front_pix = np.where(wall[..., None], a[ty, tx], front_pix)
    front_img = rgba(deck | wall, front_pix)

    # 4. the fill: a square of the strip's depth, all brick (the brick band repeated across it)
    side = depth / U[0]                               # the square's length, in u
    fu0 = FILL_U[0]
    fill_mask = (u >= fu0) & (u <= fu0 + side) & (v >= 0) & (v <= 1)
    band = KERB_V - COPING_V
    v_src = COPING_V + 0.05 + np.mod(v, band - 0.10)
    sxp = A0[0] + u * U[0] + v_src * V[0]
    syp = A0[1] + u * U[1] + v_src * V[1]
    fill_pix = a[np.clip(np.round(syp).astype(int), 0, Hh - 1), np.clip(np.round(sxp).astype(int), 0, Ww - 1)]
    fill_pix = tone_paving(fill_pix, (u - fu0) / side, v, paving)
    fill_img = rgba(fill_mask, fill_pix)

    # 5. the modular kit: 10 x 10 m cells of the strip, each holding one layer, so the game can lay
    # a promenade of any shape cell by cell - brick everywhere (the fill), and on each cell side the
    # coping where it meets the sea or the kerb where it meets the land. Every piece is the same
    # cell, its layer on the cell's front-right (se) side or back-left (nw) side:
    #   promenadeEdgeFront  coping and the wall below it (the sea side, facing the camera)
    #   promenadeEdgeBack   coping only (the sea side facing away: the wall is out of sight)
    #   promenadeKerbFront / promenadeKerbBack  the kerb, on the land side
    # The front image has the strip turned round: its coping is on the near side (v near 1), its
    # kerb on the far side; the deck has them the other way.
    cu0 = fu0
    cell = (u >= cu0) & (u <= cu0 + side) & (v >= 0) & (v <= 1)
    kerb_d = 1 - KERB_V
    pieces = {
        'promenadeEdgeFront.png': rgba((cell & (v >= 1 - COPING_V - 0.005))
                                       | (wall & (f_s >= cu0) & (f_s <= cu0 + side)), front_pix),
        'promenadeEdgeBack.png': rgba(cell & (v <= COPING_V + 0.005), a),
        'promenadeKerbFront.png': rgba(cell & (v >= KERB_V - 0.005), a),
        'promenadeKerbBack.png': rgba(cell & (v <= kerb_d + 0.005), front_pix),
    }
    cell_corners = (A0 + cu0 * U, A0 + cu0 * U + V, A0 + (cu0 + side) * U + V, A0 + (cu0 + side) * U)

    corners = {
        **{name: (*cell_corners, pix) for name, pix in pieces.items()},
        'promenadeDeck.png': (A0, A0 + V, A1 + V, A1, deck_img),
        'promenadeFront.png': (A0, A0 + V, A1 + V, A1, front_img),
        'promenadeFill.png': (A0 + fu0 * U, A0 + fu0 * U + V, A0 + (fu0 + side) * U + V, A0 + (fu0 + side) * U, fill_img),
    }
    geometry = {}
    for name, (left, front, right, top, pix) in corners.items():
        alpha = pix[..., 3] > 0
        yy, xx = np.nonzero(alpha)
        x_lo, x_hi, y_lo, y_hi = xx.min() - 8, xx.max() + 9, yy.min() - 8, yy.max() + 9
        crop = pix[max(0, y_lo):y_hi, max(0, x_lo):x_hi]
        h, w = crop.shape[:2]
        W2 = 1 << int(np.ceil(np.log2(w)))
        H2 = 1 << int(np.ceil(np.log2(h)))
        canvas = np.zeros((H2, W2, 4), np.uint8)
        ox, oy = (W2 - w) // 2, H2 - h            # bottom-centred, like the other sheets
        canvas[oy:oy + h, ox:ox + w] = crop
        Image.fromarray(canvas).save(f'../{name}', optimize=True)
        shift = np.array([ox - max(0, x_lo), oy - max(0, y_lo)])
        geometry[name] = {k: (p + shift).round(1).tolist() for k, p in
                          (('left', left), ('front', front), ('right', right), ('top', top))}
        print(name, (W2, H2), geometry[name])
    json.dump(geometry, open('../promenade-geometry.json', 'w'), indent=1)
    print('depth/length', round(depth / U[0], 3), 'wall face px', face_h)


if __name__ == '__main__':
    import sys
    style = sys.argv[sys.argv.index('--paving') + 1] if '--paving' in sys.argv else 'grey'
    if style not in PAVING_STYLES:
        sys.exit(f'--paving: one of {", ".join(PAVING_STYLES)}')
    main(style)
