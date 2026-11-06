"""地鐵第三期: a surface station's platforms and canopies (Models/metroPlatform/), drawn in code like the
track (Norton, 2026-11-05).

A surface station stands on five straight track tiles. Each tile has a platform each side of the
double track (from 4 to 9 m off the line's centre, 1.1 m high: grey paving, a yellow line along
the edge by the track) and a glass canopy over each on steel posts. So a train at the platform is
drawn between them, each tile's art is three pictures:

- `platform`: both platforms (on the ground, drawn under the trains);
- `canopy_far`: the canopy over the platform behind the track on screen (drawn before the trains);
- `canopy_near`: the one in front (drawn after them).

For X (the track running up-right on screen) and Y (down-right), a middle piece and an end piece
each way (the platform stops 5 m short of the tile's end edge). 512 px a tile across, like the track
tiles, on a canvas 512 x 512: the tile's diamond from y 256 (room above for the canopies), its centre
at (256, 384).

Run with .venv/bin/python -B scripts/prepare-metro-platform-assets.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'Models/metroPlatform'
W, H = 512, 512           # a power of two each way (Norton, 2026-11-06)
TOP = 256                   # the tile diamond's top corner, y
SS = 2                      # drawn at twice the size, then down
PX_M = 12.8                 # screen px a metre along an axis, half across (512 / 2 / 20)
Z_PX = 10.0                 # px a metre up

PLATFORM_IN, PLATFORM_OUT = 4.0, 9.0    # metres off the line's centre
PLATFORM_H = 1.1
CANOPY_Z0, CANOPY_Z1 = 8.2, 8.5   # over the trains, whose cars stand taller than life (the game exaggerates height)
END_SHORT = 5.0             # an end piece stops this far from its end edge

PAVING = (150, 148, 142)
PAVING_DARK = (128, 126, 121)
EDGE_YELLOW = (206, 172, 52)
FACE_LIGHT = (124, 121, 116)
FACE_DARK = (98, 96, 92)
POST = (88, 92, 98)
GLASS = (176, 205, 214, 120)
GLASS_EDGE = (120, 130, 138, 230)


def iso(col, row, z=0.0):
    """Metres on the tile (col right, row down; 0..20) to the canvas at SS."""
    return ((W / 2 + (col - row) * PX_M) * SS, (TOP + (col + row) * PX_M / 2 - z * Z_PX) * SS)


def box_faces(c0, c1, r0, r1, z0, z1):
    """The three faces of a box a viewer sees: top, +col (down-right), +row (down-left)."""
    top = [iso(c0, r0, z1), iso(c1, r0, z1), iso(c1, r1, z1), iso(c0, r1, z1)]
    right = [iso(c1, r0, z1), iso(c1, r1, z1), iso(c1, r1, z0), iso(c1, r0, z0)]
    left = [iso(c0, r1, z1), iso(c1, r1, z1), iso(c1, r1, z0), iso(c0, r1, z0)]
    return top, right, left


def to_tile_frame(axis, a0, a1, b0, b1):
    """A rectangle `a` across the line (metres off its centre) by `b` along it (0..20) into (col, row)."""
    if axis == 'X':       # the line runs along row at col 10: across is col
        return 10 + a0, 10 + a1, b0, b1
    return b0, b1, 10 + a0, 10 + a1   # Y: along col at row 10: across is row


def draw_platform(d, axis, side, b0, b1):
    """One platform: `side` -1 (the -col / -row side) or +1, along the line from b0 to b1."""
    a0, a1 = (PLATFORM_IN, PLATFORM_OUT) if side > 0 else (-PLATFORM_OUT, -PLATFORM_IN)
    c0, c1, r0, r1 = to_tile_frame(axis, a0, a1, b0, b1)
    top, right, left = box_faces(c0, c1, r0, r1, 0, PLATFORM_H)
    d.polygon(right, fill=FACE_LIGHT)
    d.polygon(left, fill=FACE_DARK)
    d.polygon(top, fill=PAVING)
    # paving joints, a metre apart along
    for b in np.arange(np.ceil(b0), b1, 1.0):
        p, q = to_tile_frame(axis, a0, a1, b, b)[0:2], to_tile_frame(axis, a0, a1, b, b)[2:4]
        cc0, cc1, rr0, rr1 = to_tile_frame(axis, a0, a1, b, b)
        d.line([iso(cc0, rr0, PLATFORM_H), iso(cc1, rr1, PLATFORM_H)], fill=PAVING_DARK, width=SS)
    # the yellow line, 0.3 m in from the edge by the track
    edge = PLATFORM_IN if side > 0 else -PLATFORM_IN
    y0, y1 = (edge + 0.25, edge + 0.55) if side > 0 else (edge - 0.55, edge - 0.25)
    cc0, cc1, rr0, rr1 = to_tile_frame(axis, y0, y1, b0, b1)
    d.polygon([iso(cc0, rr0, PLATFORM_H), iso(cc1, rr0, PLATFORM_H), iso(cc1, rr1, PLATFORM_H), iso(cc0, rr1, PLATFORM_H)], fill=EDGE_YELLOW)


def draw_canopy(d, axis, side, b0, b1):
    a0, a1 = (PLATFORM_IN + 0.3, PLATFORM_OUT - 0.3) if side > 0 else (-PLATFORM_OUT + 0.3, -PLATFORM_IN - 0.3)
    mid = (a0 + a1) / 2
    # posts down the middle of the platform, 5 m apart, from the platform up to the roof
    for b in np.arange(b0 + 2.5, b1, 5.0):
        cc, _, rr, _ = to_tile_frame(axis, mid, mid, b, b)
        x0, y0 = iso(cc, rr, PLATFORM_H)
        x1, y1 = iso(cc, rr, CANOPY_Z0)
        d.line([(x0, y0), (x1, y1)], fill=POST, width=4 * SS)
    c0, c1, r0, r1 = to_tile_frame(axis, a0, a1, b0, b1)
    top, right, left = box_faces(c0, c1, r0, r1, CANOPY_Z0, CANOPY_Z1)
    d.polygon(right, fill=(110, 118, 126, 235))
    d.polygon(left, fill=(96, 104, 112, 235))
    d.polygon(top, fill=GLASS, outline=GLASS_EDGE)
    # the glazing bars across the roof, 2.5 m apart
    for b in np.arange(b0 + 1.25, b1, 2.5):
        cc0, cc1, rr0, rr1 = to_tile_frame(axis, a0, a1, b, b)
        d.line([iso(cc0, rr0, CANOPY_Z1), iso(cc1, rr1, CANOPY_Z1)], fill=GLASS_EDGE, width=SS)


def far_side(axis):
    """The platform behind the track on screen: X runs up-right, its -col side is up-left (far);
    Y runs down-right, its -row side is up-right (far)."""
    return -1


def piece(axis, end):
    """end: None (middle), or the end the platform stops short of: 'lo' (b = 0 side) or 'hi'."""
    b0, b1 = 0.0, 20.0
    if end == 'lo':
        b0 = END_SHORT
    if end == 'hi':
        b1 = 20.0 - END_SHORT
    out = {}
    for name in ('platform', 'canopy_far', 'canopy_near'):
        img = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(img, 'RGBA')
        far = far_side(axis)
        if name == 'platform':
            draw_platform(d, axis, far, b0, b1)
            draw_platform(d, axis, -far, b0, b1)
        elif name == 'canopy_far':
            draw_canopy(d, axis, far, b0, b1)
        else:
            draw_canopy(d, axis, -far, b0, b1)
        out[name] = img.resize((W, H), Image.LANCZOS)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # along: X's b is the row (0 at its n edge), Y's the col (0 at its w edge)
    ends = {'X': {'mid': None, 'end_n': 'lo', 'end_s': 'hi'}, 'Y': {'mid': None, 'end_w': 'lo', 'end_e': 'hi'}}
    sheet = Image.new('RGBA', (6 * 260, 3 * 190), (96, 108, 82, 255))
    i = 0
    for axis, kinds in ends.items():
        for kind, end in kinds.items():
            pics = piece(axis, end)
            for j, (name, img) in enumerate(pics.items()):
                img.save(OUT / f'metro_{name}_{axis.lower()}_{kind}.png')
                sheet.alpha_composite(img.resize((256, 176), Image.LANCZOS), (i * 260, j * 190))
            i += 1
    sheet.save(ROOT / 'docs/assets/metro-platform-preview.png')
    print('wrote', len(list(OUT.glob('*.png'))), 'pictures')


if __name__ == '__main__':
    main()
