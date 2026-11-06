"""地鐵站出入口 at night (Norton, 2026-11-06): as the 高架站 - the lamps themselves are not what is
seen, what they light is. Under the canopy - the stairwell, the escalator, the walls inside, seen
through the open front or the glass sides - as by day, and the red MTR logo's lightbox; the glass
roof, the frame, the railings outside and the paving darken with the night.

Reads Models/subwayStation/subwayStation{,Back}.png, writes *_lit.png beside them (the same size,
1024 x 1024: drawn over the entrance at night by the buildings' light strength, metro.js).

Run with .venv/bin/python -B scripts/prepare-subway-station-night.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'Models/subwayStation'

# the inside, as seen (px on the 1024 pictures), and the lightboxes
INSIDE = {
    'subwayStation': [
        # the open front: the stairwell and the escalator, from the canopy's front beam to the top step
        [(292, 560), (575, 614), (575, 772), (470, 800), (300, 748)],
        # the glass side's inside, right of the sign column
        [(630, 598), (735, 552), (735, 680), (630, 730)],
    ],
    'subwayStationBack': [
        # through the glass walls, from under the canopy's beam to the floor
        [(262, 538), (498, 624), (498, 780), (262, 690)],
        [(502, 624), (735, 550), (735, 680), (502, 780)],
    ],
}
LIGHTBOX = {
    'subwayStation': [[(577, 515), (612, 505), (612, 560), (577, 572)]],
    'subwayStationBack': [],
}


def polys(size, ps):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for p in ps:
        d.polygon(p, fill=255)
    return np.asarray(m) > 0


def main():
    for name in INSIDE:
        im = Image.open(DIR / f'{name}.png').convert('RGBA')
        a = np.asarray(im).astype(np.float32)
        rgb, al = a[..., :3], a[..., 3]
        lum = rgb.mean(2)
        inside = polys(im.size, INSIDE[name])
        # (not the bright steel of the frame and railings in front of the inside)
        steel = (lum > 175) & ((rgb.max(2) - rgb.min(2)) < 25)
        m = (inside & ~steel) | polys(im.size, LIGHTBOX[name])
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
        out = np.zeros_like(a)
        out[..., :3] = rgb
        out[..., 3] = m * al
        Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA').save(DIR / f'{name}_lit.png')
        print(name)


if __name__ == '__main__':
    main()
