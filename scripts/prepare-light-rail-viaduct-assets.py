"""輕鐵 phase 1 (docs/light-rail-design.md §2.5): the light rail's viaduct and ramps, drawn by the 地鐵's
viaduct generator (scripts/prepare-metro-viaduct-assets.py) with the light rail's own sizes - Norton,
2026-11-15: 橋高兩級（約 13 米）; 程式畫，參考地鐵高架 (narrower and lighter):

- the deck two hill levels up (13.3 m, against the 地鐵's three), a little narrower past the ballast,
  a lower parapet and a thinner slab;
- ramps four tiles long for the two levels (the 地鐵's five for three);
- slimmer piers: the 地鐵's (its 高架站's) narrowed to 70%.

Writes Models/lightRailViaduct/: lrt_viaduct_<layout>_np.png (a deck piece for each track layout a deck
may hold, without piers - drawn apart, as long as the ground under each needs), lrt_ramp_<x|y>_<up><1..4>
.png and lrt_pier_<k>.png (k half levels, 1..18), and a preview sheet at
docs/assets/light-rail-viaduct-preview.png. The 地鐵's own pieces are not touched.
Run: .venv/bin/python -B scripts/prepare-light-rail-viaduct-assets.py
"""
import importlib.util
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('metro_viaduct', ROOT / 'scripts/prepare-metro-viaduct-assets.py')
mv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mv)

OUT = ROOT / 'Models/lightRailViaduct'
DECK_LEVELS = 2
RAMP_TILES = 4
PIER_NARROW = 0.7
PIER_MAX_HALF_LEVELS = 18

# the light rail's sizes, in the 地鐵 generator (its functions read these when they run)
mv.OUT = OUT
mv.DECK_M = DECK_LEVELS * mv.HILL_LEVEL_M
mv.RAMP_STEPS = RAMP_TILES
mv.DECK_WIDEN_M = 0.35
mv.PARAPET_M = 1.0
mv.SLAB_M = 1.2


def slim_pier(length):
    """The 地鐵's pier `length` px long, narrowed about its middle (its foot stays 22 px off the bottom)."""
    img, (fx, fy) = mv.station_pier(length)
    w = max(8, int(round(img.width * PIER_NARROW)))
    narrow = img.convert('RGBa').resize((w, img.height), Image.LANCZOS).convert('RGBA')
    canvas = Image.new('RGBA', img.size, (0, 0, 0, 0))
    canvas.alpha_composite(narrow, ((img.width - w) // 2, 0))
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20261115)
    script = "const t = require('./railway-track'); console.log(JSON.stringify(t.RAILWAY_TRACK_LAYOUTS))"
    layouts = {l['mask']: l for l in json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))}
    pieces = []
    for mask in (1, 2, 4, 8, 16, 32, 0x03, 0x0c, 0x30):
        name = layouts[mask]['asset'].replace('metro_track_', 'lrt_viaduct_') + '_np'
        img = mv.deck_piece(layouts[mask]['tracks'], rng, foot=mv.DECK_M - mv.SLAB_M)
        img.save(OUT / f'{name}.png')
        pieces.append((name, img))
    for axis, ups in (('X', ('n', 's')), ('Y', ('w', 'e'))):
        for up in ups:
            for step in range(1, RAMP_TILES + 1):
                name = f'lrt_ramp_{axis.lower()}_{up}{step}'
                img = mv.ramp_piece(axis, up, step, rng)
                img.save(OUT / f'{name}.png')
                pieces.append((name, img))
    for k in range(1, PIER_MAX_HALF_LEVELS + 1):
        slim_pier(k * mv.HILL_LEVEL_M / 2 * mv.Z_PX).save(OUT / f'lrt_pier_{k}.png')
    print(f'{len(pieces)} pieces, {PIER_MAX_HALF_LEVELS} piers -> {OUT.relative_to(ROOT)}')
    sheet = Image.new('RGBA', (6 * 260, 5 * 190), (96, 108, 82, 255))
    for i, (name, img) in enumerate(pieces):
        sheet.alpha_composite(img.resize((256, 176), Image.LANCZOS), ((i % 6) * 260, (i // 6) * 190))
    sheet.save(ROOT / 'docs/assets/light-rail-viaduct-preview.png')


if __name__ == '__main__':
    main()
