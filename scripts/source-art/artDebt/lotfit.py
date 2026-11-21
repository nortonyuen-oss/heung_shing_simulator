"""Shared steps for laying Norton's isometric renders on the game's lots (2026-11-21 art debt).

Norton's rule for squaring AI art (see walledCity/fit.py, cruiseTerminal/fit.py): an up-down skew about
the front corner so the two ground edges slope alike (verticals stay vertical), then an x:y scale so
they read 0.5. Never a perspective warp.
"""
from collections import deque
import numpy as np
from PIL import Image

DUST, SOLID = 3, 240


def load_rgba(path, black_background=False, dark=28):
    """The render as RGBA. A render on black (no alpha) has its background flood-filled away from the
    border through near-black pixels, so dark parts inside the picture stay."""
    im = Image.open(path)
    if not black_background:
        return np.asarray(im.convert('RGBA')).copy()
    rgb = np.asarray(im.convert('RGB')).astype(int)
    h, w, _ = rgb.shape
    isdark = rgb.max(axis=2) < dark
    bg = np.zeros((h, w), bool)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if isdark[y, x] and not bg[y, x]:
                bg[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if isdark[y, x] and not bg[y, x]:
                bg[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and isdark[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                queue.append((ny, nx))
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(bg, 0, 255)
    return rgba


def clean(rgba):
    a = rgba[..., 3]
    a[a <= DUST] = 0
    a[a >= SOLID] = 255
    rgba[a == 0] = 0
    return rgba


def bottom_edges(alpha, skip=30, near=60):
    """The lot's two front edges from the bottom silhouette: (left slope, right slope, L, F, R) with
    L/F/R the left, front and right extreme points. Fitted twice, the second time without the bumps."""
    ys, xs = np.nonzero(alpha > 128)
    x0, x1 = xs.min(), xs.max()
    cols = np.arange(x0, x1 + 1)
    low = np.array([ys[xs == x].max() if (xs == x).any() else -1 for x in cols])
    fi = low.argmax()
    front = (int(cols[fi]), int(low[fi]))
    left = (int(x0), int(ys[xs == x0].mean()))
    right = (int(x1), int(ys[xs == x1].mean()))

    def fit(mask):
        k, b = np.polyfit(cols[mask], low[mask], 1)
        keep = mask & (np.abs(low - (k * cols + b)) < 4)
        return np.polyfit(cols[keep], low[keep], 1)

    lmask = (cols > x0 + skip) & (cols < front[0] - near) & (low >= 0)
    rmask = (cols > front[0] + near) & (cols < x1 - skip) & (low >= 0)
    lk, lb = fit(lmask)
    rk, rb = fit(rmask)
    return lk, rk, left, front, right, (lk, lb), (rk, rb)


def skew_scale(rgba, left_slope, right_slope, about_x):
    """y' = e*y + d*(x - about_x): both ground edges to +/-0.5. x is untouched."""
    e = 1.0 / ((left_slope - right_slope) / 1.0)  # (0.5 - -0.5) / (l - r)
    d = 0.5 - e * left_slope
    h, w, _ = rgba.shape
    # the output height: where the corners go
    ys = np.array([0, h - 1])
    xs = np.array([0, w - 1])
    corners = [e * y + d * (x - about_x) for y in ys for x in xs]
    top, bottom = min(corners), max(corners)
    oh = int(np.ceil(bottom - top)) + 2
    # inverse map: y = (y' + top - d*(x - about_x)) / e
    img = Image.fromarray(rgba)
    out = np.zeros((oh, w, 4), np.uint8)
    for x in range(w):
        col = np.asarray(img.crop((x, 0, x + 1, h)))[:, 0, :].astype(float)
        yo = np.arange(oh)
        ysrc = (yo + top - d * (x - about_x)) / e
        y0 = np.floor(ysrc).astype(int)
        t = (ysrc - y0)[:, None]
        valid = (y0 >= 0) & (y0 + 1 < h)
        y0c = np.clip(y0, 0, h - 2)
        a = col[y0c]
        b = col[y0c + 1]
        # premultiplied blend so the edges stay clean
        pa = a[:, 3:4] / 255.0
        pb = b[:, 3:4] / 255.0
        alpha = pa * (1 - t) + pb * t
        rgb = (a[:, :3] * pa * (1 - t) + b[:, :3] * pb * t) / np.maximum(alpha, 1e-6)
        px = np.concatenate([rgb, alpha * 255], axis=1)
        px[~valid] = 0
        out[:, x] = np.clip(px, 0, 255).astype(np.uint8)
    return out, e, d, top


def crop_to_alpha(rgba, margin=2):
    ys, xs = np.nonzero(rgba[..., 3] > 0)
    box = (max(0, xs.min() - margin), max(0, ys.min() - margin),
           min(rgba.shape[1], xs.max() + 1 + margin), min(rgba.shape[0], ys.max() + 1 + margin))
    return rgba[box[1]:box[3], box[0]:box[2]].copy(), box
