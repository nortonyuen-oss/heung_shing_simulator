"""The game's icon without the black around its rounded square (Norton 2026-11-21: 圖示周邊的黑框變透明).

  python3 scripts/make-rounded-icon.py

build/icon.png is the rounded-square artwork on a black field. The black connected to the picture's edge
is cleared (a flood fill, so dark pixels inside the artwork stay), its rim softened a pixel, and the
result cut to the square and padded square again. Writes build/icon-rounded.png, the About dialog's
UI/app-icon.webp and - through android/make-icons.py - the Android launcher icons and splash.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SOURCE = os.path.join(ROOT, 'build', 'icon.png')
OUT = os.path.join(ROOT, 'build', 'icon-rounded.png')
ABOUT = os.path.join(ROOT, 'UI', 'app-icon.webp')
DARK = 34   # a channel above this is the artwork, not the black field


def main():
    src = Image.open(SOURCE).convert('RGB')
    w, h = src.size
    rgb = np.asarray(src)
    # 255 where the pixel is (near) black; flood the black from every edge pixel to 128
    # (a copy: an image made from a numpy array shares its read-only buffer, and the fill silently does nothing)
    field = Image.fromarray(np.where(rgb.max(-1) <= DARK, 255, 0).astype(np.uint8)).copy()
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if field.getpixel((x, y)) == 255:
            ImageDraw.floodfill(field, (x, y), 128)
    outside = np.asarray(field) == 128
    alpha = Image.fromarray(np.where(outside, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = src.convert('RGBA'); rgba.putalpha(alpha)
    box = Image.fromarray((~outside).astype(np.uint8) * 255).getbbox()
    icon = rgba.crop(box)
    side = max(icon.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
    square.save(OUT, optimize=True)
    square.resize((320, 320), Image.LANCZOS).save(ABOUT, 'WEBP', quality=88, method=6)
    print('wrote', os.path.relpath(OUT, ROOT), square.size, 'crop', box, '+', os.path.relpath(ABOUT, ROOT))


if __name__ == '__main__':
    main()
