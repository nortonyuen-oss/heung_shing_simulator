"""Stand the squared 地鐵站 art, shrunk, on a paved plinth that fills its 1x1 tile.

Norton, 2026-11-04: the station read too big at a whole tile; do as the primary school (its art
shrunk onto a plinth paved like its forecourt). Input: scripts/source-art/subwayStation/squared/
(the renders squared on their paving, see README). Output: Models/subwayStation/, 1024 x 1024.
The plinth's paving is drawn here (the render's tiles are not a regular grid, so it is not
copied): square tiles in the render's own colours and grain, joints of its grout colour, and a
kerb on the two faces toward the viewer in the colours of the render's own kerb.

Run with .venv/bin/python -B scripts/prepare-subway-station-assets.py; it prints the anchor
(plinth centre) and paving width for metro.js METRO_STATION_ART.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'scripts/source-art/subwayStation/squared'
OUT = ROOT / 'Models/subwayStation'

SIZE = 1024
STATION_SHARE = 0.68     # station paving width / plinth width
PLINTH_WIDTH = 1000.0    # the plinth's top face, corner to corner, in the 1024 output
KERB = 7                 # kerb height in output px
OVERSAMPLE = 2
TILE_TD = 29.0           # one paving tile in the render's top-down space (1024 = its paving)
GROUT = 2.6              # joint width in the same space
SEED = 20261104

# each view: file, paving centre and paving width in the squared art, and the clean paving
# (top-down boxes, X0, Y0, X1, Y1 in the render's 1024 top-down) the tiles are sampled from
VIEWS = {
    'subwayStation.png': ((511.3, 656.2), 948.4, [(885, 30, 1005, 600), (120, 950, 820, 990)]),
    'subwayStationBack.png': ((513.4, 667.6), 972.3, [(955, 120, 1010, 560), (40, 950, 700, 1000)]),
}


def to_topdown(im, centre, width, n=1024):
    cx, cy = centre
    hw, hh = width / 2, width / 4
    return im.transform((n, n), Image.AFFINE, (hw / n, -hw / n, cx, hh / n, hh / n, cy - hh),
                        resample=Image.BICUBIC)


def sample_paving(td, boxes):
    """Tile colours (means of grout-free windows), their grain, and the grout colour."""
    a = np.asarray(td.convert('RGBA'), dtype=np.float32)
    colours, grains, dark = [], [], []
    for x0, y0, x1, y1 in boxes:
        region = a[y0:y1, x0:x1]
        dark.append(region[..., :3][region[..., 3] > 250].reshape(-1, 3))
        for y in range(0, region.shape[0] - 14, 7):
            for x in range(0, region.shape[1] - 14, 7):
                w = region[y:y + 14, x:x + 14]
                if w[..., 3].min() < 250:
                    continue
                rgb = w[..., :3]
                lum = rgb.mean(axis=2)
                if lum.std() > 9 or lum.mean() < 125:
                    continue
                mean = rgb.reshape(-1, 3).mean(axis=0)
                colours.append(mean)
                grains.append(lum - lum.mean())
    dark = np.concatenate(dark)
    lum = dark.mean(axis=1)
    grout = dark[lum <= np.percentile(lum, 6)].mean(axis=0)
    colours = np.array(colours)
    # the render's joints are fine lines, half lost at this size: halfway to the tiles
    grout = grout * 0.55 + colours.mean(axis=0) * 0.45
    return colours, grains, grout


def paving_topdown(m, colours, grains, grout, rng):
    """m x m top-down paving, tiles TILE_TD apart."""
    img = np.zeros((m, m, 3), dtype=np.float32)
    mean = colours.mean(axis=0)
    count = int(np.ceil(m / TILE_TD))
    edges = np.round(np.arange(count + 1) * TILE_TD).astype(int)
    for j in range(count):
        for i in range(count):
            y0, y1 = edges[j], min(edges[j + 1], m)
            x0, x1 = edges[i], min(edges[i + 1], m)
            if y0 >= m or x0 >= m:
                continue
            # the render's own tiles, a little calmer and lighter: its paving is lit, the plinth is open ground
            colour = mean + (colours[rng.integers(len(colours))] - mean) * 0.7 + 5
            # grain: four sampled 14x14 patches, flipped at random, over the tile
            grain = np.zeros((28, 28), dtype=np.float32)
            for gy in (0, 14):
                for gx in (0, 14):
                    g = grains[rng.integers(len(grains))]
                    if rng.random() < 0.5:
                        g = g[:, ::-1]
                    if rng.random() < 0.5:
                        g = g[::-1, :]
                    grain[gy:gy + 14, gx:gx + 14] = g
            grain = np.asarray(Image.fromarray(grain).resize((x1 - x0, y1 - y0), Image.BILINEAR))
            img[y0:y1, x0:x1] = colour + grain[..., None] * 0.9
    # joints: grout lines at each tile edge, a lighter lip on the far side of each (the render's bevel)
    g = int(round(GROUT))
    for e in edges:
        img[max(0, e - g // 2):e + (g - g // 2), :] = grout
        img[:, max(0, e - g // 2):e + (g - g // 2)] = grout
        lip = e + (g - g // 2)
        if lip < m:
            img[lip:lip + 1, :] = np.minimum(img[lip:lip + 1, :] * 1.06, 255)
            img[:, lip:lip + 1] = np.minimum(img[:, lip:lip + 1] * 1.06, 255)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')


def kerb_colours(art, centre, width):
    """Mean colours of the render's two kerb faces (dark band under its front edges)."""
    a = np.asarray(art, dtype=np.float32)
    cx, cy = centre
    hw, hh = width / 2, width / 4
    faces = {'left': [], 'right': []}
    for t in np.linspace(0.15, 0.85, 15):
        for side, sign in (('left', -1), ('right', 1)):
            x = int(round(cx + sign * hw * (1 - t)))
            col = a[:, x]
            edge = cy + hh * t
            ys = [y for y in range(int(edge) - 6, int(edge) + 14) if col[y, 3] > 200 and col[y, :3].mean() < 118]
            faces[side].extend(col[y, :3] for y in ys)
    return {k: np.mean(v, axis=0) if v else np.array([96, 84, 80], np.float32) for k, v in faces.items()}


def station_cutout(art, centre, width):
    """The station without its kerb: clip each column just under its paving's top face."""
    a = np.asarray(art).copy()
    cx, cy = centre
    hw, hh = width / 2, width / 4
    lum = a[..., :3].astype(np.float32).mean(axis=2)
    cuts = []
    for x in range(int(cx - hw * 0.97), int(cx + hw * 0.97)):
        t = 1 - abs(x - cx) / hw
        edge = cy + hh * t
        y = int(edge) + 12
        while y > edge - 14 and (a[y, x, 3] < 200 or lum[y, x] < 120):
            y -= 1
        cuts.append((x, y))
    # fit a line each side so one dark pixel does not notch the edge
    xs = np.array([c[0] for c in cuts], np.float32)
    ys = np.array([c[1] for c in cuts], np.float32)
    for side in (xs < cx, xs >= cx):
        k, b = np.polyfit(xs[side], ys[side], 1)
        resid = ys[side] - (k * xs[side] + b)
        keep = np.abs(resid) < 3
        k, b = np.polyfit(xs[side][keep], ys[side][keep], 1)
        for x in xs[side].astype(int):
            limit = k * x + b + 0.5
            a[int(np.ceil(limit)) + 1:, x, 3] = 0
            frac = limit - np.floor(limit)
            a[int(np.ceil(limit)), x, 3] = (a[int(np.ceil(limit)), x, 3] * frac).astype(np.uint8)
    # outside the paving's side corners nothing of the paving remains
    a[:, :int(cx - hw * 0.97)][..., 3] = np.where(np.arange(a.shape[0])[:, None] > cy - 2, 0, a[:, :int(cx - hw * 0.97), 3])
    a[:, int(cx + hw * 0.97):][..., 3] = np.where(np.arange(a.shape[0])[:, None] > cy - 2, 0, a[:, int(cx + hw * 0.97):, 3])
    return Image.fromarray(a, 'RGBA')


def pooled_paving():
    pools = [sample_paving(to_topdown(Image.open(SRC / n).convert('RGBA'), c, w), b) for n, (c, w, b) in VIEWS.items()]
    colours = np.concatenate([p[0] for p in pools])
    grains = [g for p in pools for g in p[1]]
    grout = np.mean([p[2] for p in pools], axis=0)
    return colours, grains, grout


def build(name, centre, width, paving, rng):
    art = Image.open(SRC / name).convert('RGBA')
    colours, grains, grout = paving
    kerb = kerb_colours(art, centre, width)

    os_ = OVERSAMPLE
    size = SIZE * os_
    pw = PLINTH_WIDTH * os_
    hw, hh = pw / 2, pw / 4
    kerb_h = KERB * os_
    ax = size / 2
    ay = size - hh - kerb_h - 6 * os_
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    # plinth top: the paving in top-down space, the plinth's size in the render's own units
    m = int(round(1024 / STATION_SHARE))
    td = paving_topdown(m, colours, grains, grout, rng)
    tx, ty = ax, ay - hh
    coeffs = (m / (2 * hw), m / (2 * hh), -m / 2 * (tx / hw + ty / hh),
              -m / (2 * hw), m / (2 * hh), m / 2 * (tx / hw - ty / hh))
    top = td.transform((size, size), Image.AFFINE, coeffs, resample=Image.BICUBIC).convert('RGBA')
    mask = Image.new('L', (size, size), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).polygon([(ax, ay - hh), (ax + hw, ay), (ax, ay + hh), (ax - hw, ay)], fill=255)
    canvas.paste(top, (0, 0), mask)

    # kerb faces toward the viewer, with a light rim along the top edge as in the render
    draw = ImageDraw.Draw(canvas)
    left = [(ax - hw, ay), (ax, ay + hh), (ax, ay + hh + kerb_h), (ax - hw, ay + kerb_h)]
    right = [(ax, ay + hh), (ax + hw, ay), (ax + hw, ay + kerb_h), (ax, ay + hh + kerb_h)]
    draw.polygon(left, fill=tuple(int(c) for c in kerb['left']) + (255,))
    draw.polygon(right, fill=tuple(int(c) for c in kerb['right']) + (255,))
    rim = tuple(int(min(255, c * 1.12)) for c in colours.mean(axis=0)) + (255,)
    draw.line([(ax - hw, ay), (ax, ay + hh), (ax + hw, ay)], fill=rim, width=os_)

    # the station on its own paving, its kerb cut off, centred on the plinth
    station = station_cutout(art, centre, width)
    scale = PLINTH_WIDTH * STATION_SHARE * os_ / width
    small = station.resize((round(station.width * scale), round(station.height * scale)), Image.LANCZOS)
    ox = round(ax - centre[0] * scale)
    oy = round(ay - centre[1] * scale)
    # a faint contact shadow round the station's paving, so it sits in the pavement
    shadow = Image.new('L', (size, size), 0)
    sw, sh = hw * STATION_SHARE, hh * STATION_SHARE
    ImageDraw.Draw(shadow).polygon([(ax, ay - sh), (ax + sw, ay), (ax, ay + sh), (ax - sw, ay)], fill=60)
    shadow = shadow.filter(ImageFilter.GaussianBlur(3 * os_))
    shade = Image.new('RGBA', (size, size), (40, 30, 30, 255))
    shade.putalpha(Image.fromarray((np.asarray(shadow) * (np.asarray(mask) > 0)).astype(np.uint8)))
    canvas.alpha_composite(shade)
    canvas.alpha_composite(small, (ox, oy))

    out = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(OUT / name)
    print(f"{name}: anchor [{ax / os_:.1f}, {ay / os_:.1f}], pavingWidth {PLINTH_WIDTH:.1f}")


def main():
    rng = np.random.default_rng(SEED)
    paving = pooled_paving()
    print('tiles sampled', len(paving[0]), 'mean', paving[0].mean(axis=0).round(1), 'grout', paving[2].round(1))
    for name, (centre, width, _) in VIEWS.items():
        build(name, centre, width, paving, rng)


if __name__ == '__main__':
    main()
