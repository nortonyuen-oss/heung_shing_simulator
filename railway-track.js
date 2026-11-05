// Six TrackBits on one fixed 512x256 isometric ground tile (the diamond fills the canvas; one game
// tile, 20 m). Track geometry is shared by the standalone pieces and every supported composite
// asset. Each bit is a double track, a line to a tile (docs/railway-track-system.md): X and Y run
// straight between opposite edge middles; UPPER, LOWER, LEFT and RIGHT are OpenTTD's diagonals,
// straight across the tile corner their two edges share (`corner`), so a line turns 45 degrees at
// a tile edge.
const RAILWAY_TRACK_TILE = Object.freeze({
  width: 512,
  height: 256,
  anchors: Object.freeze({
    A: Object.freeze([128, 64]),
    B: Object.freeze([384, 64]),
    C: Object.freeze([384, 192]),
    D: Object.freeze([128, 192]),
  }),
  corners: Object.freeze({
    N: Object.freeze([256, 0]),
    E: Object.freeze([512, 128]),
    S: Object.freeze([256, 256]),
    W: Object.freeze([0, 128]),
  }),
});

const RAILWAY_TRACK_BITS = Object.freeze({
  X: 0x01,
  Y: 0x02,
  UPPER: 0x04,
  LOWER: 0x08,
  LEFT: 0x10,
  RIGHT: 0x20,
});

const RAILWAY_TRACK_SEGMENTS = Object.freeze({
  X: Object.freeze({ bit: RAILWAY_TRACK_BITS.X, asset: 'metro_track_x', anchors: Object.freeze(['D', 'B']) }),
  Y: Object.freeze({ bit: RAILWAY_TRACK_BITS.Y, asset: 'metro_track_y', anchors: Object.freeze(['A', 'C']) }),
  UPPER: Object.freeze({ bit: RAILWAY_TRACK_BITS.UPPER, asset: 'metro_track_upper', anchors: Object.freeze(['A', 'B']), corner: 'N' }),
  LOWER: Object.freeze({ bit: RAILWAY_TRACK_BITS.LOWER, asset: 'metro_track_lower', anchors: Object.freeze(['D', 'C']), corner: 'S' }),
  LEFT: Object.freeze({ bit: RAILWAY_TRACK_BITS.LEFT, asset: 'metro_track_left', anchors: Object.freeze(['A', 'D']), corner: 'W' }),
  RIGHT: Object.freeze({ bit: RAILWAY_TRACK_BITS.RIGHT, asset: 'metro_track_right', anchors: Object.freeze(['B', 'C']), corner: 'E' }),
});

const RAILWAY_TRACK_COMPOSITES = Object.freeze([
  { mask: 0x06, asset: 'metro_track_switch_a1', kind: 'switch', tracks: ['UPPER', 'Y'], anchor: 'A' },
  { mask: 0x12, asset: 'metro_track_switch_a2', kind: 'switch', tracks: ['LEFT', 'Y'], anchor: 'A' },
  { mask: 0x05, asset: 'metro_track_switch_b1', kind: 'switch', tracks: ['UPPER', 'X'], anchor: 'B' },
  { mask: 0x21, asset: 'metro_track_switch_b2', kind: 'switch', tracks: ['RIGHT', 'X'], anchor: 'B' },
  { mask: 0x0a, asset: 'metro_track_switch_c1', kind: 'switch', tracks: ['LOWER', 'Y'], anchor: 'C' },
  { mask: 0x22, asset: 'metro_track_switch_c2', kind: 'switch', tracks: ['RIGHT', 'Y'], anchor: 'C' },
  { mask: 0x09, asset: 'metro_track_switch_d1', kind: 'switch', tracks: ['LOWER', 'X'], anchor: 'D' },
  { mask: 0x11, asset: 'metro_track_switch_d2', kind: 'switch', tracks: ['LEFT', 'X'], anchor: 'D' },
  { mask: 0x16, asset: 'metro_track_junction_a', kind: 'junction', tracks: ['UPPER', 'LEFT', 'Y'], anchor: 'A' },
  { mask: 0x25, asset: 'metro_track_junction_b', kind: 'junction', tracks: ['UPPER', 'RIGHT', 'X'], anchor: 'B' },
  { mask: 0x2a, asset: 'metro_track_junction_c', kind: 'junction', tracks: ['LOWER', 'RIGHT', 'Y'], anchor: 'C' },
  { mask: 0x19, asset: 'metro_track_junction_d', kind: 'junction', tracks: ['LOWER', 'LEFT', 'X'], anchor: 'D' },
  { mask: 0x0c, asset: 'metro_track_parallel_horizontal', kind: 'parallel', tracks: ['UPPER', 'LOWER'] },
  { mask: 0x30, asset: 'metro_track_parallel_vertical', kind: 'parallel', tracks: ['LEFT', 'RIGHT'] },
  { mask: 0x03, asset: 'metro_track_cross_xy', kind: 'crossing', tracks: ['X', 'Y'] },
].map((layout) => Object.freeze({
  ...layout,
  tracks: Object.freeze(layout.tracks),
  routes: Object.freeze(layout.tracks.map((name) => RAILWAY_TRACK_SEGMENTS[name].anchors)),
})));

const RAILWAY_TRACK_BASIC_LAYOUTS = Object.freeze(
  Object.entries(RAILWAY_TRACK_SEGMENTS).map(([name, segment]) => Object.freeze({
    mask: segment.bit,
    asset: segment.asset,
    kind: 'track',
    tracks: Object.freeze([name]),
    routes: Object.freeze([segment.anchors]),
  })),
);

const RAILWAY_TRACK_LAYOUTS = Object.freeze([
  ...RAILWAY_TRACK_BASIC_LAYOUTS,
  ...RAILWAY_TRACK_COMPOSITES,
]);

const RAILWAY_TRACK_LAYOUT_BY_MASK = new Map(RAILWAY_TRACK_LAYOUTS.map((layout) => [layout.mask, layout]));

function normalizeRailwayTrackMask(mask) {
  const value = Number(mask);
  if (!Number.isInteger(value) || value < 0 || value > 0x3f) {
    throw new RangeError('Railway TrackBit masks must be integers from 0x00 to 0x3f.');
  }
  return value;
}

function getRailwayTrackLayout(mask) {
  return RAILWAY_TRACK_LAYOUT_BY_MASK.get(normalizeRailwayTrackMask(mask)) ?? null;
}

function requireRailwayTrackLayout(mask) {
  const value = normalizeRailwayTrackMask(mask);
  const layout = RAILWAY_TRACK_LAYOUT_BY_MASK.get(value);
  if (!layout) throw new RangeError(`Unsupported railway TrackBit combination: 0x${value.toString(16).padStart(2, '0')}.`);
  return layout;
}

function getRailwayTrackAssets() {
  return RAILWAY_TRACK_LAYOUTS.map(({ asset, mask, kind }) => ({
    asset,
    mask,
    kind,
    textureKey: asset,
    path: `Models/metroTrack/${asset}.png`,
  }));
}

function getRailwayTrackCenterlines(mask) {
  const layout = requireRailwayTrackLayout(mask);
  return layout.routes.map(([from, to]) => ({
    from,
    to,
    start: [...RAILWAY_TRACK_TILE.anchors[from]],
    end: [...RAILWAY_TRACK_TILE.anchors[to]],
  }));
}

function combineRailwayTrackBits(...bits) {
  return bits.reduce((mask, bit) => {
    const value = typeof bit === 'string'
      ? RAILWAY_TRACK_BITS[bit.toUpperCase()]
      : Number(bit);
    if (!Number.isInteger(value) || value <= 0 || (value & (value - 1)) !== 0 || value > 0x20) {
      throw new RangeError(`Invalid railway TrackBit: ${String(bit)}.`);
    }
    return mask | value;
  }, 0);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RAILWAY_TRACK_TILE,
    RAILWAY_TRACK_BITS,
    RAILWAY_TRACK_SEGMENTS,
    RAILWAY_TRACK_COMPOSITES,
    RAILWAY_TRACK_LAYOUTS,
    normalizeRailwayTrackMask,
    getRailwayTrackLayout,
    requireRailwayTrackLayout,
    getRailwayTrackAssets,
    getRailwayTrackCenterlines,
    combineRailwayTrackBits,
  };
}
