"""quad.py quad-correction.json SRC_DIR OUT_DIR [file ...]
Four-corner squaring (Norton 2026-10-13, for flat things lying on the ground such as the 六四 candle
patches): the ground's left, top, right and bottom corners, picked on the render, are pulled onto a 2:1
isometric diamond (a perspective warp of the whole image). Spec per file:
  {"L": [x, y], "T": [x, y], "R": [x, y], "B": [x, y]}    source pixels
The diamond keeps the width L..R; the output is padded to a power-of-two canvas, diamond bottom-centred."""
import sys, json, numpy as np
from PIL import Image
MARGIN = 8
def nextpow2(v): return 1 << int(np.ceil(np.log2(v)))
def homography(src, dst):
    # the 3x3 H with H @ src ~ dst, for four point pairs
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.array(A, float))
    return (vt[-1] / vt[-1][-1]).reshape(3, 3)
def run(spec, src_path, out_path):
    img = Image.open(src_path).convert('RGBA')
    L, T, R, B = (np.array(spec[k], float) for k in ('L', 'T', 'R', 'B'))
    w = R[0] - L[0]; h = w / 2
    # the diamond in output space, with room above for what stands on the ground
    head = max(0.0, (L[1] + R[1]) / 2 - img.getbbox()[1]) * 1.15 + MARGIN
    dl, dt, dr, db = (MARGIN, head + h / 2), (MARGIN + w / 2, head), (MARGIN + w, head + h / 2), (MARGIN + w / 2, head + h)
    Hinv = homography([dl, dt, dr, db], [tuple(L), tuple(T), tuple(R), tuple(B)])   # output -> source
    W, Hh = int(np.ceil(w + 2 * MARGIN)), int(np.ceil(head + h + MARGIN))
    out = img.convert('RGBa').transform((W, Hh), Image.PERSPECTIVE, Hinv.flatten()[:8], resample=Image.BICUBIC).convert('RGBA')
    bb = out.getchannel('A').point(lambda a: 255 if a > 2 else 0).getbbox()
    out = out.crop(bb)
    CW, CH = nextpow2(out.width + 2 * MARGIN), nextpow2(out.height + 2 * MARGIN)
    sheet = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    sheet.alpha_composite(out, ((CW - out.width) // 2, CH - MARGIN - out.height))
    sheet.save(out_path, optimize=True)
    print(src_path.split('/')[-1], (CW, CH), 'diamond', (round(w), round(h)))
if __name__ == '__main__':
    params = json.load(open(sys.argv[1])); files = sys.argv[4:] or sorted(params)
    for f in files: run(params[f], f'{sys.argv[2]}/{f}', f'{sys.argv[3]}/{f}')
