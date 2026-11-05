"""地鐵第三期: the train cars (Models/metroTrain/) from Norton's renders.

Norton's seven renders (scripts/source-art/subwayStation/original/MTrains/) are all cab cars, a cab
at one end and a gangway at the other, from eight ways round. From them, for each of the four ways
a car lies on screen - `fall` (long axis down-right), `rise` (up-right), `horiz`, `vert`:

- cabNear / cabFar (cabR / cabL for horiz): a cab car, its cab at the near (down-screen) or far end;
- mid: a middle car, gangways at both ends, spliced from the gangway halves of the two cab cars.

The renders' iso is not quite the game's 2:1: the falling ones are sheared until the red stripe along
the side runs at exactly 0.5 (not by the bogies' line: that overshoots and the cars step); `rise` is
`fall` mirrored. Each is sized to a 22.5 m MTR car on a 512-px tile (one game tile, 20 m). The side
and end-on views stand a little taller than the diagonal ones; squashing them to match looked worse
(Norton, 2026-11-05), so they keep their height. The narrower of the two end-on renders is widened
to the other's width so their halves splice; nothing is made smaller.

Writes Models/metroTrain/car_<name>.png and metro-train-art.js (each picture's path and the anchor:
where the car's middle sits on the rails, in the picture's pixels). A car's sprite is scaled by
TILE_WIDTH / 512 like the track tiles.

Run with .venv/bin/python -B scripts/prepare-metro-train-assets.py
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'scripts/source-art/subwayStation/original/MTrains'
OUT = ROOT / 'Models/metroTrain'
ART_JS = ROOT / 'metro-train-art.js'

PX_M_AXIS = np.hypot(256, 128) / 20     # px a metre along a map axis (a tile edge, 20 m, on a 512 tile)
PX_M_DIAG_H = 512 / (20 * np.sqrt(2))   # along a world diagonal drawn across the screen
PX_M_DIAG_V = 256 / (20 * np.sqrt(2))   # along a world diagonal drawn down the screen
CAR_M, WIDTH_M = 22.5, 3.1

RAW = {
    'fall_cabNear': 'image-gen-5(20261104-124827).png',
    'fall_cabFar': 'image-gen-8(20261104-124843).png',
    'horiz_cabR': 'image-gen-2(20261104-124815).png',
    'horiz_cabL': 'image-gen-6(20261104-124831).png',
    'vert_cabNear': 'image-gen-4(20261104-124823).png',
    'vert_cabFar': 'image-gen-7(20261104-124839).png',
}


def crop_alpha(im):
    a = np.asarray(im)
    ys, xs = np.nonzero(a[..., 3] > 100)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def stripe_slope(im):
    a = np.asarray(im).astype(np.float32)
    red = (a[..., 3] > 200) & (a[..., 0] > 150) & (a[..., 1] < 90) & (a[..., 2] < 90)
    ys, xs = np.nonzero(red)
    k, c = np.polyfit(xs, ys, 1)
    res = ys - (k * xs + c)
    keep = np.abs(res) < 3 * np.median(np.abs(res)) + 1
    return np.polyfit(xs[keep], ys[keep], 1)[0]


def shear_to(im, target):
    sh = target - stripe_slope(im)
    w, h = im.size
    pad = int(abs(sh) * w / 2) + 2
    canvas = Image.new('RGBA', (w, h + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (0, pad))
    return crop_alpha(canvas.transform(canvas.size, Image.AFFINE, (1, 0, 0, -sh, 1, sh * w / 2), resample=Image.BICUBIC))


def anchor_y(im, kind):
    """Where the car's middle sits on the rails: up from the bottom of its middle column."""
    a = np.asarray(im)
    col = a[:, im.size[0] // 2, 3] > 128
    bottom = np.nonzero(col)[0].max()
    if kind == 'fall':
        return bottom - WIDTH_M / 2 * PX_M_AXIS / np.sqrt(5)
    if kind == 'horiz':
        return bottom - WIDTH_M / 2 * PX_M_DIAG_V
    return bottom - CAR_M * PX_M_DIAG_V / 2


def load_cars():
    raw = {}
    for name, file in RAW.items():
        im = crop_alpha(Image.open(SRC / file).convert('RGBA'))
        kind = name.split('_')[0]
        if kind == 'fall':
            im = shear_to(im, 0.5)
        raw[name] = (im, kind)
    # sizes: a diagonal car spans its length along one axis plus its width along the other; a side
    # view its length across the screen; an end-on view as tall as the side view's body plus its length
    side_im = raw['horiz_cabR'][0]
    side_scale = CAR_M * PX_M_DIAG_H / side_im.size[0]
    side_body = side_im.size[1] * side_scale - WIDTH_M * PX_M_DIAG_V
    length_down = CAR_M * PX_M_DIAG_V
    cars = {}
    for name, (im, kind) in raw.items():
        if kind == 'fall':
            scale = (CAR_M + WIDTH_M) * PX_M_AXIS * 2 / np.sqrt(5) / im.size[0]
        elif kind == 'horiz':
            scale = CAR_M * PX_M_DIAG_H / im.size[0]
        else:
            scale = (side_body + length_down) / im.size[1]
        im = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.LANCZOS)
        cars[name] = {'img': im, 'kind': kind}
    # the two end-on renders came out of different widths: the narrower widened to the wider
    vert_w = max(cars[n]['img'].size[0] for n in ('vert_cabNear', 'vert_cabFar'))
    for name, car in cars.items():
        im = car['img']
        if car['kind'] == 'vert' and im.size[0] != vert_w:
            im = im.resize((vert_w, im.size[1]), Image.LANCZOS)
        car['img'] = im
        car['ax'] = im.size[0] / 2
        car['ay'] = anchor_y(im, car['kind'])
    return cars, side_body, length_down


def place(size, origin, car):
    c = Image.new('RGBA', size, (0, 0, 0, 0))
    c.alpha_composite(car['img'], (int(round(origin[0] - car['ax'])), int(round(origin[1] - car['ay']))))
    return np.asarray(c).astype(np.float32)


def splice(cars, a_name, b_name, near_fn):
    """A middle car: B where near_fn says (the near / right / bottom half), A elsewhere."""
    A, B = cars[a_name], cars[b_name]
    W = int(max(A['img'].size[0], B['img'].size[0]) + 40)
    H = int(max(A['img'].size[1], B['img'].size[1]) + 40)
    origin = (W / 2, max(A['ay'], B['ay']) + 20)
    pa, pb = place((W, H), origin, A), place((W, H), origin, B)
    Y, X = np.mgrid[0:H, 0:W]
    out = np.where(near_fn(X, Y, origin, pa)[..., None], pb, pa).astype(np.uint8)
    ys, xs = np.nonzero(out[..., 3] > 100)
    img = Image.fromarray(out, 'RGBA').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return {'img': img, 'kind': A['kind'], 'ax': origin[0] - xs.min(), 'ay': origin[1] - ys.min()}


def fall_near(X, Y, origin, pa):
    """The plane across the car's middle: upright on the near side face, along the width on the roof."""
    off = WIDTH_M / 2 * PX_M_AXIS
    xs = origin[0] - off * 2 / np.sqrt(5)
    y = int(origin[1] + off / np.sqrt(5))
    lum = pa[:, int(round(xs)), :3].mean(axis=1)
    alpha = pa[:, int(round(xs)), 3]
    while y > 0 and not (alpha[y] > 200 and lum[y] < 110 and lum[max(0, y - 3)] < 110):
        y -= 1
    lower = (Y >= y) & (X >= xs)
    upper = (Y < y) & ((X - xs) + 2 * (Y - y) >= 0)
    return lower | upper


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cars, side_body, length_down = load_cars()
    cars['fall_mid'] = splice(cars, 'fall_cabNear', 'fall_cabFar', fall_near)
    cars['horiz_mid'] = splice(cars, 'horiz_cabR', 'horiz_cabL', lambda X, Y, o, pa: X >= o[0])
    cars['vert_mid'] = splice(cars, 'vert_cabNear', 'vert_cabFar', lambda X, Y, o, pa: Y >= o[1] - side_body * 0.6)
    for k in ['cabNear', 'cabFar', 'mid']:
        c = cars['fall_' + k]
        cars['rise_' + k] = {'img': c['img'].transpose(Image.FLIP_LEFT_RIGHT), 'kind': 'rise', 'ax': c['img'].size[0] - c['ax'], 'ay': c['ay']}
    art = {}
    for name in sorted(cars):
        c = cars[name]
        path = f'Models/metroTrain/car_{name}.png'
        c['img'].save(ROOT / path)
        art[name] = {'path': path, 'key': f'metro_car_{name}', 'anchor': [round(float(c['ax']), 1), round(float(c['ay']), 1)]}
        print(name, c['img'].size, art[name]['anchor'])
    ART_JS.write_text(
        '// Generated by scripts/prepare-metro-train-assets.py - the 地鐵 train cars: each picture and the\n'
        '// pixel where the car\'s middle sits on the rails (a 512-px tile\'s scale; draw at TILE_WIDTH / 512).\n'
        f'const METRO_TRAIN_ART = Object.freeze({json.dumps(art, indent=2, ensure_ascii=False)});\n\n'
        "if (typeof module !== 'undefined' && module.exports) module.exports = { METRO_TRAIN_ART };\n",
        encoding='utf-8')
    print('wrote', ART_JS.relative_to(ROOT))


if __name__ == '__main__':
    main()
