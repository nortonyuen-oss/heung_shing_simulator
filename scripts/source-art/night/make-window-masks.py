"""Window masks for the night bake (2026-11-22): which pixels of a model are windows, one id per window.

  python3 scripts/source-art/night/make-window-masks.py [slug ...]      # all, or just these
  NIGHT_PREVIEW=/some/dir python3 ...                                    # also write overlay previews

The renders added in v6.0 (the community centre, the 城寨 park, the wetland park, the cruise terminal, the
racecourse) are too irregular for the light calibrator's four-panel window grid: ribbon windows that
change slope from one face to the next, hundreds of tenement panes, curved glass. So each is traced
here, in the art's own pixels, as a set of rules over hand-drawn regions:

  face   a region of one wall face. The slope that makes its floors horizontal is found (or given),
         the wall is sheared flat, and its dark blocks (glass and frames, darker than the tiles) are
         the windows; a long ribbon is cut into rooms `cell` pixels wide. Only the dark pixels of a
         window are kept, so an air-conditioner or a ledge over it stays unlit.
  key    a region where a colour picks the windows out: 'glass' (cool glass panes, the 城寨) or 'warm'
         (lamplight already painted behind the glass, the terminal). Each connected pane is a window.
  poly   a window drawn by hand (a glass door, a shop front); `cells` cuts it into rooms along its
         top edge.

The output is <slug>-windows.png beside this script: RGB holds the window's id (1..), alpha 255 on a
window. A mirrored view is the drawn one flipped (the art's mirrors are exact flips). The bake
(scripts/bake-night-textures.js, a profile's windowMask) maps it onto the packaged texture and lights a
share of the windows for each night variant. Lamps are not here: they are in the profile, also in the
art's pixels (building-lighting.js, sourcePixels).
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))

# ── the models ─────────────────────────────────────────────────────────────────────────────────────
MODELS = {
    # 社區中心: three office floors on two faces (ribbon windows), the hall's three tall windows, the
    # glass entrance under the canopy, the ground floor's windows and the narrow end windows
    'communityCentre2-01': {
        'src': 'Models/government/2x2/communityCentre2-01.png',
        'rules': [
            {'face': [(305, 296), (634, 207), (634, 505), (305, 562)], 'cell': 30},
            {'face': [(198, 268), (284, 300), (284, 562), (198, 522)], 'cell': 26},
            {'face': [(730, 215), (945, 205), (945, 455), (730, 468)], 'cell': 60, 'minh': 40},
            {'face': [(100, 230), (134, 240), (134, 560), (100, 550)], 'cell': 40, 'minh': 20},
            {'poly': [(378, 585), (600, 545), (600, 640), (378, 680)], 'cells': 6},
            {'poly': [(205, 575), (282, 600), (282, 650), (205, 625)], 'cells': 2},
        ],
    },
}

MODELS.update({
    # 九龍城寨文化園區: the tenements' glass panes, every one a window (the colour picks them out cleanly;
    # the roofs, laundry and pipes are not glass)
    'walledCityPark4-01': {
        'src': 'Models/specialSites/4x4/walledCityPark4-01.png',
        'rules': [
            {'region': [(0, 0), (1250, 0), (1250, 700), (560, 905), (0, 700)], 'key': 'glass', 'grow': 1, 'min': 10},
        ],
    },
    # 啟德郵輪碼頭, the sea side (as drawn: the berth lower left): the two glazed floors along the berth, the
    # boarding bridges' windows, and the two floors round the end - each band traced by its two ends, the
    # glass (and the lamplight painted behind it) picked out by colour
    'cruiseTerminal6-01_m': {
        'src': 'Models/specialSites/6x6/cruiseTerminal6-01_m.png',
        'rules': [
            {'region': [(292, 308), (872, 546), (872, 604), (292, 376)], 'key': 'glasswarm', 'grow': 2, 'min': 10},
            {'region': [(298, 372), (872, 612), (872, 658), (298, 426)], 'key': 'glasswarm', 'grow': 2, 'min': 10},
            {'region': [(878, 526), (1182, 462), (1182, 510), (878, 572)], 'key': 'glasswarm', 'grow': 2, 'min': 10},
            {'region': [(878, 572), (1182, 510), (1182, 558), (878, 620)], 'key': 'glasswarm', 'grow': 2, 'min': 10},
        ],
    },
    # and the land side (as drawn: the entrance and the coach bays lower left): the upper floor's glass, the
    # shop fronts under the entrance canopy (lamplight only, so the canopy's own glass roof stays dark),
    # and the great curved window over the corner
    'cruiseTerminal6-01_back_m': {
        'src': 'Models/specialSites/6x6/cruiseTerminal6-01_back_m.png',
        'rules': [
            {'region': [(160, 312), (1000, 590), (1000, 648), (160, 356)], 'key': 'glasswarm', 'grow': 2, 'min': 10},
            {'region': [(160, 372), (1000, 655), (1000, 728), (160, 442)], 'key': 'warm', 'grow': 2, 'min': 10},
            {'region': [(1000, 572), (1322, 538), (1322, 645), (1000, 690)], 'key': 'glasswarm', 'grow': 2, 'min': 10, 'split': 40},
            {'region': [(1000, 690), (1330, 625), (1330, 695), (1000, 748)], 'key': 'glasswarm', 'grow': 2, 'min': 10},
        ],
    },
    # 濕地公園: the visitor centre's glass under its green roof (the park itself is lamps)
    'wetlandPark4-01': {
        'src': 'Models/specialSites/4x4/wetlandPark4-01.png',
        'rules': [
            {'region': [(138, 48), (334, 40), (342, 76), (138, 82)], 'key': 'glasswarm', 'grow': 1, 'min': 4},
        ],
    },
    # 沙田馬場, the front half (the grandstand's end tower and its west stands): the glazed boxes under the
    # roof, the covered seating (lit as a whole stand on race nights) and the tower's windows
    'racecourse6-01a': {
        'src': 'Models/specialSites/6x6/racecourse6-01a.png',
        'rules': [
            {'region': [(232, 150), (468, 74), (468, 112), (232, 190)], 'key': 'glasswarm', 'grow': 1, 'min': 6},
            {'poly': [(205, 228), (468, 165), (468, 240), (205, 322)], 'cells': 6},
            {'region': [(92, 226), (176, 250), (176, 378), (92, 352)], 'key': 'glass', 'grow': 1, 'min': 6},
        ],
    },
    # and the back half (the rest of the grandstand)
    'racecourse6-01b': {
        'src': 'Models/specialSites/6x6/racecourse6-01b.png',
        'rules': [
            {'region': [(180, 118), (440, 66), (440, 110), (180, 180)], 'key': 'glasswarm', 'grow': 1, 'min': 6},
            {'poly': [(0, 238), (276, 166), (276, 288), (0, 372)], 'cells': 6},
        ],
    },
})

# mirrored views: the drawn one flipped left to right
MIRRORS = {
    'cruiseTerminal6-01': 'cruiseTerminal6-01_m',
    'cruiseTerminal6-01_back': 'cruiseTerminal6-01_back_m',
    'racecourse6-01a_m': 'racecourse6-01a',
    'racecourse6-01b_m': 'racecourse6-01b',
}


# ── the rules ──────────────────────────────────────────────────────────────────────────────────────
def lum_alpha(path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    return a, 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2], a[..., 3]


def polymask(shape, poly):
    m = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in poly], fill=255)
    return np.asarray(m) > 0


def row_profile(lum, region, s):
    ys, xs = np.nonzero(region)
    v = np.round(ys - s * xs).astype(int)
    vmin = v.min()
    sums = np.bincount(v - vmin, weights=lum[ys, xs])
    cnt = np.bincount(v - vmin)
    return np.where(cnt > 0, sums / np.maximum(cnt, 1), np.nan), cnt


def best_slope(lum, region):
    best = None
    for s in np.linspace(-0.65, 0.65, 131):
        prof, cnt = row_profile(lum, region, s)
        ok = cnt > cnt.max() * 0.3
        var = np.nanvar(prof[ok])
        if best is None or var > best[0]:
            best = (var, s)
    return float(best[1])


def label(binary):
    """4-connected components of a boolean image: (labels, count)."""
    h, w = binary.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    ys, xs = np.nonzero(binary)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        lab[y0, x0] = n
        while stack:
            y, x = stack.pop()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and binary[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n
                    stack.append((ny, nx))
    return lab, n


def morph(binary, grow, shrink):
    img = Image.fromarray((binary * 255).astype(np.uint8))
    if grow:
        img = img.filter(ImageFilter.MaxFilter(2 * grow + 1))
    if shrink:
        img = img.filter(ImageFilter.MinFilter(2 * shrink + 1))
    return np.asarray(img) > 127


def face_windows(lum, alpha, rule):
    """[(cell polygon, keep-mask)] for one wall face."""
    region = polymask(lum.shape, rule['face']) & (alpha > 200)
    s = rule.get('slope')
    if s is None:
        s = best_slope(lum, region)
    ys, xs = np.nonzero(region)
    vals = lum[ys, xs]
    t = rule.get('thresh') or (np.percentile(vals, 25) + np.percentile(vals, 85)) / 2
    xmin, xmax = xs.min(), xs.max()
    v = np.round(ys - s * xs).astype(int)
    vmin, vmax = v.min(), v.max()
    W, H = xmax - xmin + 1, vmax - vmin + 1
    dark = np.zeros((H, W), bool)
    dark[v - vmin, xs - xmin] = vals < t
    # panes of one window merge across their thin frames; specks go
    dark = morph(morph(dark, 2, 2), 0, 1)
    dark = morph(dark, 1, 0)
    lab, n = label(dark)
    out = []
    minh, minw, cell = rule.get('minh', 12), rule.get('minw', 8), rule.get('cell', 30)
    for k in range(1, n + 1):
        vv, uu = np.nonzero(lab == k)
        u0, u1, v0, v1 = uu.min(), uu.max(), vv.min(), vv.max()
        if v1 - v0 + 1 < minh or u1 - u0 + 1 < minw or len(vv) < minh * minw * 0.4:
            continue
        pieces = max(1, int(round((u1 - u0 + 1) / cell)))
        for p in range(pieces):
            a = u0 + (u1 - u0 + 1) * p / pieces
            b = u0 + (u1 - u0 + 1) * (p + 1) / pieces - 1
            corners = [(a, v0), (b, v0), (b, v1), (a, v1)]
            poly = [(u + xmin, vq + vmin + s * (u + xmin)) for u, vq in corners]
            out.append(poly)
    keep = lum < t + 12          # only what is darker than the tiles: no air-conditioner, no ledge
    return out, keep, s, t, n


def key_windows(arr, lum, alpha, rule):
    region = polymask(lum.shape, rule['region']) & (alpha > 200)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    if rule['key'] == 'glass':
        m = (b > r + 12) & (g > r + 4) & (lum > 45) & (lum < 215)
    elif rule['key'] == 'warm':
        m = (r > 175) & (g > 125) & (b < 150) & ((r - b) > 80)
    elif rule['key'] == 'glasswarm':
        m = ((b > r + 10) & (g > r + 2) & (lum > 40) & (lum < 185)) | ((r > 170) & (g > 120) & (b < 150) & ((r - b) > 70))
    else:
        raise ValueError(rule['key'])
    m &= region
    m = morph(m, rule.get('grow', 1), rule.get('grow', 1))
    lab, n = label(m & region)
    return lab, n


def build(slug):
    spec = MODELS[slug]
    arr, lum, alpha = lum_alpha(os.path.join(ROOT, spec['src']))
    H, W = lum.shape
    ids = np.zeros((H, W), np.int32)
    nid = 0
    report = []
    for rule in spec['rules']:
        if 'face' in rule:
            polys, keep, s, t, n = face_windows(lum, alpha, rule)
            for poly in polys:
                nid += 1
                m = polymask(lum.shape, poly) & keep & (alpha > 200) & (ids == 0)
                ids[m] = nid
            report.append(f"face slope {s:+.2f} thresh {t:.0f}: {len(polys)} windows")
        elif 'key' in rule:
            lab, n = key_windows(arr, lum, alpha, rule)
            sizes = np.bincount(lab.ravel())
            kept = 0
            split = rule.get('split')
            for k in range(1, n + 1):
                if sizes[k] < rule.get('min', 6):
                    continue
                comp = (lab == k) & (ids == 0)
                xs = np.nonzero(comp.any(axis=0))[0]
                if split and xs.max() - xs.min() + 1 > split:
                    cols = np.arange(W)
                    for x0 in range(xs.min(), xs.max() + 1, split):
                        part = comp & (cols[None, :] >= x0) & (cols[None, :] < x0 + split)
                        if part.sum() >= rule.get('min', 6):
                            nid += 1
                            kept += 1
                            ids[part] = nid
                    continue
                nid += 1
                kept += 1
                ids[comp] = nid
            report.append(f"key {rule['key']}: {kept} windows")
        elif 'poly' in rule:
            poly = rule['poly']
            cells = rule.get('cells', 1)
            (x0, y0), (x1, y1), (x2, y2), (x3, y3) = poly
            for c in range(cells):
                a, b = c / cells, (c + 1) / cells
                lerp = lambda p, q, f: (p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f)
                cellpoly = [lerp((x0, y0), (x1, y1), a), lerp((x0, y0), (x1, y1), b),
                            lerp((x3, y3), (x2, y2), b), lerp((x3, y3), (x2, y2), a)]
                nid += 1
                m = polymask(lum.shape, cellpoly) & (alpha > 200) & (ids == 0)
                if rule.get('dark'):
                    m &= lum < rule['dark']
                ids[m] = nid
            report.append(f"poly: {cells} windows")
    return ids, nid, report


def write(slug, ids, flip=False):
    if flip:
        ids = ids[:, ::-1]
    H, W = ids.shape
    out = np.zeros((H, W, 4), np.uint8)
    out[..., 0] = (ids >> 16) & 0xff
    out[..., 1] = (ids >> 8) & 0xff
    out[..., 2] = ids & 0xff
    out[..., 3] = np.where(ids > 0, 255, 0)
    path = os.path.join(HERE, f'{slug}-windows.png')
    Image.fromarray(out).save(path, optimize=True)
    return path


def preview(slug, src, ids, directory):
    base = Image.open(os.path.join(ROOT, src)).convert('RGBA')
    a = np.asarray(base).astype(float).copy()
    rng = np.random.default_rng(7)
    colours = rng.integers(80, 256, size=(ids.max() + 1, 3))
    m = ids > 0
    a[m, :3] = a[m, :3] * 0.25 + colours[ids[m]] * 0.75
    bg = Image.new('RGBA', base.size, (30, 30, 36, 255))
    bg.alpha_composite(Image.fromarray(a.astype(np.uint8)))
    bg.convert('RGB').save(os.path.join(directory, f'{slug}-windows-preview.png'))


def main():
    wanted = sys.argv[1:] or list(MODELS) + list(MIRRORS)
    directory = os.environ.get('NIGHT_PREVIEW')
    built = {}
    for slug in wanted:
        if slug in MODELS:
            ids, n, report = build(slug)
            built[slug] = ids
            print(write(slug, ids), n, 'windows;', '; '.join(report))
            if directory:
                preview(slug, MODELS[slug]['src'], ids, directory)
    for slug, of in MIRRORS.items():
        if slug not in wanted:
            continue
        ids = built.get(of)
        if ids is None:
            ids, _, _ = build(of)
        print(write(slug, ids, flip=True), 'mirror of', of)


if __name__ == '__main__':
    main()
