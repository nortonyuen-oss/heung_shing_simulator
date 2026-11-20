"""The 九龍城寨文化園區's stand-in (P4 第 7 期), until Norton draws the park: nine of the game's old
low-income tenements packed three by three on its 6x6 lot, back to front, a little greyed with age.

  python3 scripts/source-art/walledCity/standin.py

Each 2x2 tenement is scaled so its width spans its own 2x2 diamond and its lowest pixel sits on that
diamond's front corner (as the game fits a model), and the lot under them gets a faint stone pad, so
the sprite fit reads the whole 6x6 lot. Writes Models/specialSites/6x6/walledCityPark6-01.png.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..', '..')
OUT = os.path.join(ROOT, 'Models', 'specialSites', '6x6', 'walledCityPark6-01.png')
SOURCES = [os.path.join(ROOT, 'Models', 'residential', 'house2x2', name)
           for name in ('residential2-04-L-MD.png', 'residential2-05-L-MD.png')]
W, H = 1536, 1080
TILE_W, TILE_H = 256, 128                 # a tile's diamond on this canvas
TOP = (W / 2, 300)                        # the lot's back corner
PAD_A, PAD_RGB = 60, (104, 98, 90)


def point(r, c):
    """Screen point of the lot's grid corner (r, c), 0..6 each way."""
    return TOP[0] + (c - r) * TILE_W / 2, TOP[1] + (c + r) * TILE_H / 2


def fit(src):
    """Crop a tenement to its pixels, scaled to a 2x2 diamond: (image, front-corner x, y in it)."""
    a = np.asarray(src.getchannel('A'))
    ys, xs = np.nonzero(a > 16)
    x0, x1, y1 = xs.min(), xs.max() + 1, ys.max()
    front_x = xs[ys >= y1 - 1].mean()
    scale = 2 * TILE_W / (x1 - x0)
    im = src.crop((x0, 0, x1, y1 + 1))
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    return im, (front_x - x0) * scale, y1 * scale


def aged(im):
    rgb = ImageEnhance.Brightness(ImageEnhance.Color(im.convert('RGB')).enhance(0.72)).enhance(0.9)
    out = rgb.convert('RGBA')
    out.putalpha(im.getchannel('A'))
    return out


def main():
    tenements = []
    for path in SOURCES:
        src = Image.open(path).convert('RGBA')
        tenements += [src, ImageOps.mirror(src)]
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    pad = Image.new('L', (W, H), 0)
    ImageDraw.Draw(pad).polygon([point(0, 0), point(0, 6), point(6, 6), point(6, 0)], fill=PAD_A)
    canvas.paste(Image.new('RGBA', (W, H), PAD_RGB + (255,)), (0, 0), pad)
    # back to front: blocks (i, j) on rows 2i..2i+1 and columns 2j..2j+1, by i + j
    blocks = sorted(((i, j) for i in range(3) for j in range(3)), key=lambda b: (b[0] + b[1], b[1]))
    for n, (i, j) in enumerate(blocks):
        im, fx, fy = fit(aged(tenements[(i * 3 + j * 2 + n) % len(tenements)]))
        x, y = point(2 * i + 2, 2 * j + 2)
        canvas.alpha_composite(im, (round(x - fx), round(y - fy)))
    bbox = canvas.getchannel('A').getbbox()
    print('bbox', bbox, 'lot L F R', point(6, 0), point(6, 6), point(0, 6))
    canvas.save(OUT, optimize=True)


if __name__ == '__main__':
    main()
