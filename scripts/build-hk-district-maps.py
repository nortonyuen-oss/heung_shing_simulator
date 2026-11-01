"""Build the Hong Kong district maps (hk-district-maps.js) from the Lands Department's 5 m
Digital Terrain Model.

  python3 scripts/build-hk-district-maps.py <Whole_HK_DTM_5m.asc or .npy> [--preview-dir DIR]

Writes hk-district-maps.js, the whole-territory picture the New City screen marks the districts
on (UI/hk-district-overview.webp), and hk-terrain-tiles.js: the territory at 20 m plus a catalogue
of windows, for 香港實景 random maps.

Source: Digital Terrain Model (DTM), Lands Department, HKSAR Government, on DATA.GOV.HK
(https://data.gov.hk/en-data/dataset/hk-landsd-openmap-5m-grid-dtm), download
https://www.landsd.gov.hk/landsd_psi_data/SMO/data/Whole_HK_DTM_5m.zip. It is an ESRI ASCII
grid in HK1980 Grid metres with heights in metres above Hong Kong Principal Datum; the sea, and
everything outside Hong Kong (Shenzhen included), is exactly 0. The first run caches the parsed
grid as a .npy beside the .asc.

Each map is 256 x 256 tiles at 20 m a tile (5.12 km square), north up, centred on the
district. Per tile it stores water, beach, or a land height level 0-8; the game finishes the
terrain at load (slope and hill-shape rules, terrain-presets.js) so the art rules live in one
place.
"""
import argparse
import json
import math
import os
import sys
import warnings

import numpy as np

CELL_M = 5
TILE_M = 20
MAP_TILES = 256
CELLS_PER_TILE = TILE_M // CELL_M
CROP_CELLS = MAP_TILES * CELLS_PER_TILE

# Height level = number of these thresholds (metres above HKPD) the tile's ground reaches.
# Below 30 m is flat, buildable level 0 (most of the urban harbour front); the steps widen with
# height so the territory's 958 m fits the game's 8 levels.
LEVEL_THRESHOLDS_M = [30, 70, 120, 180, 260, 360, 480, 640]

# Land narrower than this is a bridge or an elevated road crossing water (the DTM keeps them).
BRIDGE_REMOVAL_CELLS = 13  # 65 m: the widest bridge decks (Stonecutters, Tsing Ma) are ~50 m
# A coastal tile whose ground is this low is a natural beach or flat; reclaimed land and
# seawalls stand 4-6 m above HKPD.
BEACH_MAX_M = 3.5

# (id, centre lat, centre lon). Names and introductions are in hk-district-info.js. Centres are
# WGS84 degrees, converted to HK1980 Grid with
# the official projection (to_hk1980_grid); a few hundred metres either way does not matter for
# framing a 5 km square.
DISTRICTS = [
    ('victoria-harbour', 22.288, 114.165),
    ('aberdeen', 22.243, 114.158),
    ('central-western', 22.280, 114.150),
    ('eastern', 22.280, 114.225),
    ('sai-kung', 22.380, 114.280),
    ('stanley', 22.220, 114.212),
    ('wan-chai', 22.275, 114.183),
    ('yau-tsim-mong', 22.308, 114.170),
    ('sham-shui-po', 22.333, 114.160),
    ('kowloon-city', 22.322, 114.198),
    ('kwun-tong', 22.318, 114.228),
    ('tseung-kwan-o', 22.307, 114.258),
    ('tsuen-wan', 22.372, 114.112),
    ('sha-tin', 22.385, 114.198),
    ('tai-po', 22.447, 114.175),
    ('sheung-shui', 22.495, 114.125),
    ('yuen-long', 22.443, 114.030),
    ('tin-shui-wai', 22.452, 114.000),
    ('lantau', 22.276, 113.930),
    ('lamma', 22.215, 114.123),
    ('tuen-mun', 22.388, 113.975),
    ('tsing-yi', 22.350, 114.102),
    ('clear-water-bay', 22.285, 114.290),
]


def to_hk1980_grid(lat, lon):
    """WGS84 degrees -> HK1980 Grid metres (Lands Department explanatory notes, approximate
    datum shift then the HK1980 transverse Mercator)."""
    # WGS84 -> HK1980 geodetic: shift of -5.5" latitude, +8.8" longitude.
    phi = math.radians(lat + 5.5 / 3600)
    lam = math.radians(lon - 8.8 / 3600)
    phi0 = math.radians(22 + 18 / 60 + 43.68 / 3600)
    lam0 = math.radians(114 + 10 / 60 + 42.80 / 3600)
    n0, e0, m0 = 819069.80, 836694.05, 1.0
    a = 6378388.0  # International 1924
    e2 = 6.722670022e-3

    def meridian(p):
        a0 = 1 - e2 / 4 - 3 * e2 ** 2 / 64
        a2 = 3 / 8 * (e2 + e2 ** 2 / 4)
        a4 = 15 / 256 * e2 ** 2
        return a * (a0 * p - a2 * math.sin(2 * p) + a4 * math.sin(4 * p))

    nu = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    rho = a * (1 - e2) / (1 - e2 * math.sin(phi) ** 2) ** 1.5
    psi = nu / rho
    t = math.tan(phi)
    dl = lam - lam0
    c = math.cos(phi)
    easting = e0 + m0 * (nu * dl * c + nu * dl ** 3 / 6 * c ** 3 * (psi - t ** 2))
    northing = n0 + m0 * ((meridian(phi) - meridian(phi0)) + nu * math.sin(phi) * dl ** 2 / 2 * c)
    return easting, northing


def load_dtm(path):
    if path.endswith('.npy'):
        grid = np.load(path)
    else:
        cache = os.path.splitext(path)[0] + '.npy'
        if os.path.exists(cache):
            grid = np.load(cache)
        else:
            with open(path) as handle:
                header = dict(handle.readline().split() for _ in range(6))
                rows, cols = int(header['nrows']), int(header['ncols'])
                grid = np.empty((rows, cols), dtype=np.float32)
                for r in range(rows):
                    grid[r] = np.array(handle.readline().split(), dtype=np.float32)
            np.save(cache, grid)
    # Lower-left cell centre is (800000, 800000); row 0 is the north edge.
    return grid, 800000.0, 800000.0 + (grid.shape[0] - 1) * CELL_M


def box_filter_count(mask, size):
    """Number of True cells in each size x size window (centred, edges padded False)."""
    pad = size // 2
    padded = np.pad(mask.astype(np.int32), pad)
    integral = np.pad(padded.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    h, w = mask.shape
    return (integral[size:size + h, size:size + w] - integral[:h, size:size + w]
            - integral[size:size + h, :w] + integral[:h, :w])


def open_mask(mask, size):
    eroded = box_filter_count(mask, size) == size * size
    return box_filter_count(eroded, size) > 0


def build_district(grid, west_e, north_n, lat, lon):
    centre_e, centre_n = to_hk1980_grid(lat, lon)
    col0 = int(round((centre_e - west_e) / CELL_M)) - CROP_CELLS // 2
    row0 = int(round((north_n - centre_n) / CELL_M)) - CROP_CELLS // 2
    if row0 < 0 or col0 < 0 or row0 + CROP_CELLS > grid.shape[0] or col0 + CROP_CELLS > grid.shape[1]:
        raise ValueError(f'crop at {lat},{lon} leaves the DTM')
    cells = grid[row0:row0 + CROP_CELLS, col0:col0 + CROP_CELLS]
    codes = cells_to_codes(cells)
    peak = float(np.max(cells))
    return codes, peak, (round(centre_e), round(centre_n))


def cells_to_codes(cells):
    """5 m DTM cells (a multiple of 4 each way) -> one code per 20 m tile: W water, B beach,
    a-i land at height level 0-8."""
    tile_rows, tile_cols = cells.shape[0] // CELLS_PER_TILE, cells.shape[1] // CELLS_PER_TILE
    land_cells = open_mask(cells != 0, BRIDGE_REMOVAL_CELLS)
    blocks = lambda a: a.reshape(tile_rows, CELLS_PER_TILE, tile_cols, CELLS_PER_TILE).swapaxes(1, 2).reshape(tile_rows, tile_cols, -1)
    land_fraction = blocks(land_cells).mean(-1)
    heights = np.where(blocks(land_cells), blocks(cells), np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)  # all-water tiles
        # Median, so an elevated road through a tile does not lift it.
        ground = np.nanmedian(heights, axis=-1)
    land = land_fraction >= 0.5
    ground = np.where(land, np.nan_to_num(ground, nan=0.0), 0.0)
    levels = np.zeros((tile_rows, tile_cols), dtype=np.int32)
    for threshold in LEVEL_THRESHOLDS_M:
        levels += (ground >= threshold).astype(np.int32)

    water = ~land
    near_water = np.zeros_like(water)
    near_water[1:, :] |= water[:-1, :]
    near_water[:-1, :] |= water[1:, :]
    near_water[:, 1:] |= water[:, :-1]
    near_water[:, :-1] |= water[:, 1:]
    beach = land & near_water & (ground < BEACH_MAX_M)

    codes = np.full((tile_rows, tile_cols), '', dtype='<U1')
    codes[land] = np.array(list('abcdefghi'))[levels[land]]
    codes[beach] = 'B'
    codes[water] = 'W'
    return codes


def encode_rows(codes):
    rows = []
    for row in codes:
        parts = []
        run_code, run_len = row[0], 0
        for code in row:
            if code == run_code:
                run_len += 1
                continue
            parts.append(f'{run_code}{run_len if run_len > 1 else ""}')
            run_code, run_len = code, 1
        parts.append(f'{run_code}{run_len if run_len > 1 else ""}')
        rows.append(''.join(parts))
    return rows


def save_preview(codes, path):
    from PIL import Image
    palette = {'W': (82, 122, 150), 'B': (214, 201, 160)}
    for index, code in enumerate('abcdefghi'):
        t = index / 8
        palette[code] = (int(122 + 50 * t), int(152 - 10 * t), int(102 + 40 * t))
    rgb = np.array([[palette[c] for c in row] for row in codes], dtype=np.uint8)
    Image.fromarray(rgb).resize((512, 512), Image.NEAREST).save(path)


# ── 香港實景 random maps: the whole territory at 20 m, and a catalogue of 5.12 km windows ──

TERRITORY_JS = 'hk-terrain-tiles.js'
TERRITORY_STRIP_TILES = 256  # processed in strips to keep memory modest
TERRITORY_STRIP_PAD = 4      # tiles of overlap so bridge removal and beaches match across strips
WINDOW_STEP = 32             # catalogue a window every 640 m
# Everything outside Hong Kong (Shenzhen) is stored as 0 m, i.e. sea; windows stay south of this.
WINDOW_NORTH_LIMIT_N = 841000
WINDOW_MIN_LAND = 10         # percent


def build_territory(grid):
    rows, cols = grid.shape[0] // CELLS_PER_TILE, grid.shape[1] // CELLS_PER_TILE
    cells = grid[:rows * CELLS_PER_TILE, :cols * CELLS_PER_TILE]
    codes = np.full((rows, cols), 'W', dtype='<U1')
    for top in range(0, rows, TERRITORY_STRIP_TILES):
        start = max(0, top - TERRITORY_STRIP_PAD)
        end = min(rows, top + TERRITORY_STRIP_TILES + TERRITORY_STRIP_PAD)
        part = cells_to_codes(cells[start * CELLS_PER_TILE:end * CELLS_PER_TILE])
        count = min(TERRITORY_STRIP_TILES, rows - top)
        codes[top:top + count] = part[top - start:top - start + count]
    return codes


def build_window_catalogue(codes, north_edge_n):
    """Every WINDOW_STEP tiles, a 256-tile window's water, flat (level-0 land), high (level 3+)
    and border-land percentages - what the game's landform filters read."""
    water = codes == 'W'
    land = ~water
    flat = land & np.isin(codes, ['a', 'B'])
    high = land & np.isin(codes, list('defghi'))

    def window_sums(mask):
        integral = np.pad(mask.astype(np.int64).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        return lambda r, c: (integral[r + MAP_TILES, c + MAP_TILES] - integral[r, c + MAP_TILES]
                             - integral[r + MAP_TILES, c] + integral[r, c])

    land_sum, flat_sum, high_sum = window_sums(land), window_sums(flat), window_sums(high)
    area = MAP_TILES * MAP_TILES
    first_row = int(math.ceil((north_edge_n - WINDOW_NORTH_LIMIT_N) / TILE_M))
    entries = []
    for r in range(first_row, codes.shape[0] - MAP_TILES + 1, WINDOW_STEP):
        for c in range(0, codes.shape[1] - MAP_TILES + 1, WINDOW_STEP):
            land_pct = land_sum(r, c) * 100 // area
            if land_pct < WINDOW_MIN_LAND:
                continue
            border = np.concatenate([land[r, c:c + MAP_TILES], land[r + MAP_TILES - 1, c:c + MAP_TILES],
                                     land[r:r + MAP_TILES, c], land[r:r + MAP_TILES, c + MAP_TILES - 1]])
            entries += [c, r, 100 - land_pct, flat_sum(r, c) * 100 // area,
                        high_sum(r, c) * 100 // area, int(border.mean() * 100)]
    return [int(v) for v in entries]


def write_territory(codes, catalogue, path, west_e, north_edge_n):
    rows = encode_rows(codes)
    with open(path, 'w', encoding='utf-8') as handle:
        handle.write(
            '// The whole of Hong Kong at 20 m a tile, for 香港實景 random maps (map-sources.js), and a\n'
            '// catalogue of 256-tile windows to pick them from. Generated by scripts/build-hk-district-maps.py\n'
            '// from the Digital Terrain Model (DTM), Lands Department, HKSAR Government (DATA.GOV.HK).\n'
            '// Do not edit by hand. Rows are run-length coded like hk-district-maps.js; windows list\n'
            '// col, row, water %, flat %, high % (level 3+) and border-land % for each window.\n'
            f'const HK_TERRAIN_TILES = {json.dumps({"width": int(codes.shape[1]), "height": int(codes.shape[0]), "westE": west_e, "northN": north_edge_n, "tileMetres": TILE_M})};\n'
            f'HK_TERRAIN_TILES.rows = {json.dumps(rows, separators=(",", ":"))};\n'
            f'const HK_TERRAIN_WINDOWS = {json.dumps({"size": MAP_TILES, "step": WINDOW_STEP, "fields": 6, "list": catalogue}, separators=(",", ":"))};\n'
        )


OVERVIEW_PATH = 'UI/hk-district-overview.webp'
OVERVIEW_STEP = 12  # DTM cells per overview pixel: 60 m, about 1060 x 800 for the territory


def save_overview(grid, path):
    """The whole territory in the New City preview's palette, lit from the north-west."""
    from PIL import Image
    step = OVERVIEW_STEP
    rows, cols = grid.shape[0] // step, grid.shape[1] // step
    cells = grid[:rows * step, :cols * step].reshape(rows, step, cols, step)
    height = cells.max(axis=(1, 3))
    land = (cells != 0).mean(axis=(1, 3)) >= 0.5
    rise = np.clip(height / 640.0, 0, 1)[..., None]
    low = np.array([122, 152, 102], dtype=np.float32)
    high = np.array([150, 146, 118], dtype=np.float32)
    rgb = low + (high - low) * rise
    shade = np.zeros_like(height)
    shade[1:, 1:] = height[1:, 1:] - height[:-1, :-1]
    rgb += np.clip(shade * 0.35, -40, 40)[..., None]
    rgb[~land] = (82, 122, 150)
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(path, quality=82, method=6)
    # Extent of the picture in HK1980 Grid metres (cell edges, not centres).
    return {
        'image': OVERVIEW_PATH,
        'westE': 800000 - CELL_M / 2,
        'eastE': 800000 - CELL_M / 2 + cols * step * CELL_M,
        'northN': 800000 + (grid.shape[0] - 0.5) * CELL_M,
        'southN': 800000 + (grid.shape[0] - 0.5) * CELL_M - rows * step * CELL_M,
        'tileMetres': TILE_M,
        'mapTiles': MAP_TILES,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('dtm')
    parser.add_argument('--preview-dir')
    parser.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'hk-district-maps.js'))
    args = parser.parse_args()

    grid, west_e, north_n = load_dtm(args.dtm)
    root = os.path.join(os.path.dirname(__file__), '..')
    overview = save_overview(grid, os.path.join(root, OVERVIEW_PATH))

    territory = build_territory(grid)
    # Top edge of tile row 0 (cell edges sit half a cell outside the cell centres).
    north_edge_n = north_n + CELL_M / 2
    catalogue = build_window_catalogue(territory, north_edge_n)
    write_territory(territory, catalogue, os.path.join(root, TERRITORY_JS), west_e - CELL_M / 2, north_edge_n)
    print(f'territory {territory.shape[1]} x {territory.shape[0]} tiles, {len(catalogue) // 6} windows', file=sys.stderr)
    entries = []
    for district_id, lat, lon in DISTRICTS:
        codes, peak, (centre_e, centre_n) = build_district(grid, west_e, north_n, lat, lon)
        if args.preview_dir:
            os.makedirs(args.preview_dir, exist_ok=True)
            save_preview(codes, os.path.join(args.preview_dir, f'{district_id}.png'))
        entries.append({
            'id': district_id,
            'centre': {'lat': lat, 'lon': lon, 'e': centre_e, 'n': centre_n},
            'peakMetres': round(peak),
            'rows': encode_rows(codes),
        })
        land = (codes != 'W').mean() * 100
        print(f'{district_id:16s} land {land:5.1f}%  peak {peak:5.0f} m', file=sys.stderr)

    body = ',\n'.join('  ' + json.dumps(entry, ensure_ascii=False, separators=(',', ':')) for entry in entries)
    with open(args.out, 'w', encoding='utf-8') as handle:
        handle.write(
            '// Hong Kong district maps, 256 x 256 tiles at 20 m a tile, north up. Generated by\n'
            '// scripts/build-hk-district-maps.py from the Digital Terrain Model (DTM), Lands Department,\n'
            '// HKSAR Government (DATA.GOV.HK). Do not edit by hand.\n'
            '// Each row is run-length coded: W water, B beach, a-i land at height level 0-8, then the\n'
            '// run length (omitted when 1).\n'
            f'const HK_DISTRICT_OVERVIEW = {json.dumps(overview)};\n'
            f'const HK_DISTRICT_MAPS = [\n{body},\n];\n'
        )


if __name__ == '__main__':
    main()
