"""Norton's 社區中心 (2x2) and 濕地公園 (4x4) renders, 2026-11-21, onto their lots.

  python3 scripts/source-art/artDebt/fit_square.py

Both are drawn at the game's 2:1 already (lot edges +0.498/-0.498 and +0.500/-0.500, their two front
edges equally wide), so - like the 城寨 park - they need no skew: the alpha is cleaned and the picture
cut to its box. The sprite fit (the alpha box over the lot, its lowest pixel on the front corner) reads
the lot as drawn. The wetland render is small (768 px, its lot 513 px wide): a 4x4 lot is 400 px at
zoom 1, so it holds up to about 1.3x zoom.
"""
import os
from PIL import Image
import lotfit

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, '..', '..', '..', 'Models')
JOBS = [
    ('communityCentre2-01-source.png', os.path.join(MODELS, 'government', '2x2', 'communityCentre2-01.png')),
    ('wetlandPark4-01-source.png', os.path.join(MODELS, 'specialSites', '4x4', 'wetlandPark4-01.png')),
]

for source, out in JOBS:
    rgba = lotfit.clean(lotfit.load_rgba(os.path.join(HERE, source)))
    rgba, _ = lotfit.crop_to_alpha(rgba)
    Image.fromarray(rgba).save(out, optimize=True)
    lk, rk, L, F, R, _, _ = lotfit.bottom_edges(rgba[..., 3])
    print('wrote', os.path.relpath(out), rgba.shape[1::-1], 'slopes %.4f / %.4f' % (lk, rk), 'L', L, 'F', F, 'R', R)
