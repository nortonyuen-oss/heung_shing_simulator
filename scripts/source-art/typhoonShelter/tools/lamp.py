"""lamp.py - the vintage harbourfront lamp (海濱步道街燈), cut out of the promenade render.

    python3 lamp.py          (run from this folder; reads ../original/seawall/promenadeEdge.png)

The render stands the lamp on red brick in front of a painted chequerboard. The lamp is black iron:
its pixels are the dark, unreddened ones near it; the lit glass inside the lantern lies between the
dark frame on either side, so each row is filled from its leftmost to its rightmost lamp pixel.
Writes ../promenadeLamp.png (transparent, power of two).
"""
import numpy as np
from PIL import Image

SRC = '../original/seawall/promenadeEdge.png'
BOX = (1168, 118, 1262, 452)      # the lamp, base plate included, in the render


def main():
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(int)
    x0, y0, x1, y1 = BOX
    c = a[y0:y1, x0:x1]
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    lum = (R + G + B) / 3
    dark = (lum < 125) & (R - G < 45)
    # rivets and the plate's copper rim: warm and mid-dark, low down
    copper = (R - B > 40) & (lum < 170) & (R - G < 60)
    copper[: int(c.shape[0] * 0.85)] = False
    mask = dark | copper
    # keep the lamp: within its silhouette's half width about the pole (lantern, pole, base plate;
    # the coping's dark edge passes behind the pole and must not come with it), each row filled
    # between its outermost lamp pixels (the lantern's glass)
    h = mask.shape[0]
    cols = np.nonzero(mask[h // 2])[0]
    cx = int(np.median(cols[np.abs(cols - mask.shape[1] / 2) < 20]))
    out = np.zeros_like(mask)
    for y in range(h):
        halfw = 30 if y < 85 else 48 if y > h - 45 else 10 if y < 205 else 16
        xs = np.nonzero(mask[y])[0]
        xs = xs[np.abs(xs - cx) <= halfw]
        if len(xs) >= 2:
            out[y, xs.min():xs.max() + 1] = True
        elif len(xs) == 1:
            out[y, xs[0]] = True
    alpha = (out * 255).astype(np.uint8)
    rgba = np.dstack([c.astype(np.uint8), alpha])
    w = rgba.shape[1]
    W2 = 1 << int(np.ceil(np.log2(w + 16)))
    H2 = 1 << int(np.ceil(np.log2(h + 16)))
    canvas = np.zeros((H2, W2, 4), np.uint8)
    ox, oy = (W2 - w) // 2, H2 - h - 8
    canvas[oy:oy + h, ox:ox + w] = rgba
    Image.fromarray(canvas).save('../promenadeLamp.png', optimize=True)
    print('promenadeLamp.png', (W2, H2), 'lamp px', int(out.sum()), 'rect', [ox, oy, w, h])


if __name__ == '__main__':
    main()
