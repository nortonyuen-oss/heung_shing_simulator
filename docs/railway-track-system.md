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

- **Double track, a line to a tile.** Each bit is two tracks, 2 m either side of its line (4 m
  apart, as the MTR's), on a grey-brown ballast bed about 8 m wide.
- **X and Y** run straight between opposite edge middles (X: D to B, Y: A to C).
- **UPPER, LOWER, LEFT and RIGHT** are quarter circles about the tile corner their two edges share
  (`RAILWAY_TRACK_SEGMENTS[...].corner`: N, S, W, E; radius 10 m, the tracks at 8 and 12 m). They meet
  the straights square at the edge, so a line turns a corner with the two tracks the same distance
  apart all the way round. (OpenTTD draws these bits as straight 45° chords; with two tracks to a
  tile the chords cannot meet the straights cleanly, so they are curves here. The bits and masks
  are OpenTTD's all the same.)
- **The look** follows Norton's track sheet (`scripts/source-art/subwayStation/original/tracks.png`): brown rails with
  bright heads on chunky grey concrete sleepers, spaced about a gauge apart; the colours are
  sampled from it. Tiles are drawn top-down in metres and warped to 2:1, so straights, curves and
  crossings match; rails cast a small shadow down-screen.
- **Seamless joins.** Every track has a whole number of sleepers on its piece, with a gap at
  each tile edge, so tiles meet without a seam whichever way a line runs.
- **Large curves (大彎).** The one-tile curves (10 m) are too tight for a 22.5 m car, so a line
  turns on a 2 x 2 block: a quarter circle of 1.5 tiles (30 m; the tracks at 28 and 32 m) about one
  corner of the block (`RAILWAY_TRACK_LARGE_CURVES`, corner N/E/S/W), joining the straights at the
  middles of the far edges (`ends`). The block is drawn whole and cut into its four tiles
  (`metro_track_curve_<corner>_<row><col>`); the tile by the centre corner (`inner`) carries only the
  bed's edge. Sheet: `docs/assets/metro-track-curves-preview.png`. The one-tile curves stay for
  turnouts and tight spots.

Turnouts and junctions are the two pieces laid over each other for now. Norton's sheet also has
curved turnouts and a crossover, each about two tiles long, for branch lines or a depot later.

## Rebuilding

`.venv/bin/python -B scripts/prepare-railway-track-assets.py` reads the layouts from
`railway-track.js` (through node) and writes:

- `Models/metroTrack/<asset>.png` (the 21 layouts and the 16 large-curve tiles), 512 x 256 RGBA, nothing trimmed
  (`prepare-release-assets.js` keeps `metroTrack/` at its canvas: `FIXED_GROUND_TILE_PREFIXES`).
- A labelled sheet at `docs/assets/metro-track-preview.png`.

Game code gets each texture key and source path from `getRailwayTrackAssets()` and
`getRailwayTrackCurveAssets()` (main.js preloads both). A tile's sprite goes at the tile face's centre, origin 0.5, scaled by TILE_WIDTH / 512.
There is no surface-track building or train running yet: that is the rest of phase 3.
