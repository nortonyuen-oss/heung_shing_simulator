# Surface railway track tiles (地鐵第三期)

`railway-track.js` defines the track tile: one game tile (20 m) drawn as a 512 x 256 transparent
canvas whose diamond fills it, the six OpenTTD-style TrackBits, and the 21 supported layouts
(6 single bits, 8 turnouts, 4 three-way junctions, 2 parallel pairs, the X/Y crossing). Unsupported
masks are not inferred: resolve a mask with `getRailwayTrackLayout` and handle `null`, or use
`requireRailwayTrackLayout` when an unsupported combination is an error.

| Anchor | Edge middle | Pixel |
|---|---|---:|
| A | north-west | (128, 64) |
| B | north-east | (384, 64) |
| C | south-east | (384, 192) |
| D | south-west | (128, 192) |

## How a tile is drawn (Norton, 2026-11-04)

- **Double track, a line to a tile.** Each bit is two tracks on a grey-brown ballast bed. The two
  tracks cross every tile edge 2.25 m either side of its middle, whichever piece they are on, so
  pieces meet track to track: 4.5 m apart on a straight, 3.2 m on a diagonal.
- **X and Y** run straight between opposite edge middles (X: D to B, Y: A to C).
- **UPPER, LOWER, LEFT and RIGHT** are OpenTTD's diagonals: straight across the tile corner their two
  edges share (`RAILWAY_TRACK_SEGMENTS[...].corner`: N, S, W, E). A line turns 45 degrees at a tile
  edge, so a right angle is two 45s with one diagonal tile between, and a staircase of diagonals
  runs level or upright on screen (Norton, 2026-11-05: that turns far better than a curve; the
  quarter-circle curves and the 2 x 2 large curves tried on 2026-11-04 are gone).
- **The look** follows Norton's track sheet (`scripts/source-art/subwayStation/original/tracks.png`): brown rails with
  bright heads on chunky grey concrete sleepers, spaced about a gauge apart; the colours are
  sampled from it. Tiles are drawn top-down in metres and warped to 2:1, so straights, curves and
  crossings match; rails cast a small shadow down-screen.
- **Seamless joins.** Every track has a whole number of sleepers on its piece, with a gap at
  each tile edge, so tiles meet without a seam whichever way a line runs.
Turnouts and junctions are the two pieces laid over each other for now. Norton's sheet also has
curved turnouts and a crossover, each about two tiles long, for branch lines or a depot later.

## Rebuilding

`.venv/bin/python -B scripts/prepare-railway-track-assets.py` reads the layouts from
`railway-track.js` (through node) and writes:

- `Models/metroTrack/<asset>.png` (the 21 layouts), 512 x 256 RGBA, nothing trimmed
  (`prepare-release-assets.js` keeps `metroTrack/` at its canvas: `FIXED_GROUND_TILE_PREFIXES`).
- A labelled sheet at `docs/assets/metro-track-preview.png`.

Game code gets each texture key and source path from `getRailwayTrackAssets()` (main.js preloads
them). A tile's sprite goes at the tile face's centre, origin 0.5, scaled by TILE_WIDTH / 512.
Laying track is metro-surface.js: a tile's state is its TrackBits; a drag lays a straight, an L
(the corner a diagonal) or, dragged about as far across as down, a diagonal staircase.
