"""correct.py params.json SRC_DIR OUT_DIR [file ...]
Per view: X = x ; Y = d*y + c*(x - cx)  (verticals stay vertical).
With measured ground-edge slopes s1 ('\\') and s2 ('/'):  d = 1/(s1+s2), c = (s2-s1)/(2(s1+s2))
which maps both edges to the 2:1 isometric slope 0.5. Round objects use {"ellipse": r}: d = 0.5/r, c = 0.
Views are re-packed left->right, bottoms aligned, then padded (bottom-centre) to power-of-two."""
import sys, json, numpy as np
from PIL import Image
from split import components
from hull import seam_split
GAP, MARGIN = 32, 8
def nextpow2(v): return 1 << int(np.ceil(np.log2(v)))
def view_masks(alpha, spec):
    if 'seam' in spec:
        lo, hi = spec['seam']; l, r, _ = seam_split(alpha > 20, lo, hi); return [l, r]
    if spec.get('whole'): return [alpha > 20]
    cs = [c[0] for c in components(alpha)]
    if 'merge' in spec:  # list of groups of component indices
        cs = [np.any([cs[i] for i in g], axis=0) for g in spec['merge']]
    return cs
def coeffs(v):
    if 'd' in v: return v['d'], v.get('c', 0.0)
    if 'ellipse' in v: return 0.5 / v['ellipse'], 0.0
    if 'line' in v:  # one ground direction only ('\\' slope); elevation assumed ~iso
        return 1.0, 0.5 - v['line']
    if 'axis' in v:  # hull long axis ('\\') + elevation sin(e) from flat round items
        s1 = v['axis']; s2 = v.get('sinE', 0.43) ** 2 / s1
    else:
        s1, s2 = v['down'], v['up']
    return 1 / (s1 + s2), (s2 - s1) / (2 * (s1 + s2))
def transform_view(img, mask, d, c):
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    arr = np.asarray(img).copy(); arr[..., 3] = np.where(mask, arr[..., 3], 0)
    crop = Image.fromarray(arr[y0:y1, x0:x1]); w, h = crop.size
    cx = w / 2
    corners_y = [d * y + c * (x - cx) for x in (0, w) for y in (0, h)]
    T = -min(corners_y) + MARGIN
    H = int(np.ceil(max(corners_y) + T + MARGIN)); W = w
    # inverse map: x = X ; y = (-c/d) X + (1/d) Y + (c*cx - T)/d
    data = (1, 0, 0, -c / d, 1 / d, (c * cx - T) / d)
    out = crop.convert('RGBa').transform((W, H), Image.AFFINE, data, resample=Image.BICUBIC).convert('RGBA')
    bb = out.getchannel('A').point(lambda a: 255 if a > 2 else 0).getbbox()
    return out.crop(bb)
ROW_MAX = 2048 - 2 * MARGIN
def pack_rows(outs):
    rows, cur, w = [], [], 0
    for o in outs:
        if cur and w + GAP + o.width > ROW_MAX: rows.append(cur); cur, w = [], 0
        w += (GAP if cur else 0) + o.width; cur.append(o)
    rows.append(cur); return rows
def layout_size(rows):
    cw = max(sum(o.width for o in r) + GAP * (len(r) - 1) for r in rows) + 2 * MARGIN
    ch = sum(max(o.height for o in r) for r in rows) + GAP * (len(rows) - 1) + 2 * MARGIN
    return cw, ch
def run(params, src, dst, files):
    for f in files:
        spec = params[f]
        img = Image.open(f'{src}/{f}').convert('RGBA'); alpha = np.asarray(img)[..., 3]
        masks = view_masks(alpha, spec)
        assert len(masks) == len(spec['views']), (f, len(masks), len(spec['views']))
        outs = []
        for m, v in zip(masks, spec['views']):
            d, c = coeffs(v); outs.append(transform_view(img, m, d, c))
        rows = pack_rows(outs)
        cw, ch = layout_size(rows)
        # content just over a power of two: shrink slightly instead of doubling the canvas
        targets = [nextpow2(v) // 2 if v <= (nextpow2(v) // 2) * 1.2 else None for v in (cw, ch)]
        if any(targets):
            src_outs = outs; k = 1.0
            while True:
                k *= 0.995 if k < 1 else min(t / v for t, v in zip(targets, (cw, ch)) if t)
                outs = [o.convert('RGBa').resize((max(1, round(o.width * k)), max(1, round(o.height * k))), Image.LANCZOS).convert('RGBA') for o in src_outs]
                rows = pack_rows(outs); cw, ch = layout_size(rows)
                if all(t is None or v <= t for t, v in zip(targets, (cw, ch))): break
        else:
            k = 1.0
        W, H = nextpow2(cw), nextpow2(ch)
        sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        base = H - MARGIN
        for row in reversed(rows):  # bottom row sits on the canvas bottom
            rw = sum(o.width for o in row) + GAP * (len(row) - 1)
            x = (W - rw) // 2; rh = max(o.height for o in row)
            for o in row:
                sheet.alpha_composite(o, (x, base - o.height)); x += o.width + GAP
            base -= rh + GAP
        sheet.save(f'{dst}/{f}', optimize=True)
        print(f, (W, H), 'content', (cw, ch), 'scale %.3f' % k, [tuple(round(t, 3) for t in coeffs(v)) for v in spec['views']])
if __name__ == '__main__':
    params = json.load(open(sys.argv[1])); files = sys.argv[4:] or sorted(params)
    run(params, sys.argv[2], sys.argv[3], files)
