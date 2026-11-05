const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { test } = require('node:test');
const {
  RAILWAY_TRACK_BITS,
  RAILWAY_TRACK_TILE,
  RAILWAY_TRACK_LAYOUTS,
  RAILWAY_TRACK_SEGMENTS,
  getRailwayTrackAssets,
  getRailwayTrackCenterlines,
  getRailwayTrackLayout,
  requireRailwayTrackLayout,
  combineRailwayTrackBits,
} = require('../railway-track');

const ROOT = path.resolve(__dirname, '..');

test('basic TrackBits use the required anchors and exact bit values', () => {
  assert.deepEqual(RAILWAY_TRACK_BITS, {
    X: 0x01, Y: 0x02, UPPER: 0x04, LOWER: 0x08, LEFT: 0x10, RIGHT: 0x20,
  });
  assert.deepEqual(RAILWAY_TRACK_TILE.anchors, {
    A: [128, 64], B: [384, 64], C: [384, 192], D: [128, 192],
  });
  const expected = {
    X: ['D', 'B'], Y: ['A', 'C'], UPPER: ['A', 'B'],
    LOWER: ['D', 'C'], LEFT: ['A', 'D'], RIGHT: ['B', 'C'],
  };
  Object.entries(expected).forEach(([name, anchors]) => {
    const line = getRailwayTrackCenterlines(RAILWAY_TRACK_SEGMENTS[name].bit)[0];
    assert.deepEqual([line.from, line.to], anchors);
    assert.deepEqual(line.start, RAILWAY_TRACK_TILE.anchors[anchors[0]]);
    assert.deepEqual(line.end, RAILWAY_TRACK_TILE.anchors[anchors[1]]);
  });
});

test('only the specified track, turnout, junction, parallel and crossing masks resolve', () => {
  assert.equal(RAILWAY_TRACK_LAYOUTS.length, 21);
  assert.equal(requireRailwayTrackLayout(0x06).kind, 'switch');
  assert.equal(requireRailwayTrackLayout(0x16).kind, 'junction');
  assert.equal(requireRailwayTrackLayout(0x0c).kind, 'parallel');
  assert.equal(requireRailwayTrackLayout(0x03).kind, 'crossing');
  [0, 0x07, 0x14, 0x3f].forEach((mask) => assert.equal(getRailwayTrackLayout(mask), null));
  assert.throws(() => requireRailwayTrackLayout(0x07), /Unsupported railway TrackBit/);
  assert.throws(() => requireRailwayTrackLayout(0x40), /integers from 0x00 to 0x3f/);
});

test('switches and junctions have the required masks and shared anchor', () => {
  const shared = {
    0x06: 'A', 0x12: 'A', 0x05: 'B', 0x21: 'B',
    0x0a: 'C', 0x22: 'C', 0x09: 'D', 0x11: 'D',
    0x16: 'A', 0x25: 'B', 0x2a: 'C', 0x19: 'D',
  };
  Object.entries(shared).forEach(([mask, anchor]) => {
    assert.equal(requireRailwayTrackLayout(Number(mask)).anchor, anchor);
  });
  RAILWAY_TRACK_LAYOUTS.forEach((layout) => {
    const composedMask = layout.tracks.reduce((mask, name) => mask | RAILWAY_TRACK_BITS[name], 0);
    assert.equal(composedMask, layout.mask, layout.asset);
  });
});

test('bit composition accepts only one-bit names or values', () => {
  assert.equal(combineRailwayTrackBits('UPPER', 'Y'), 0x06);
  assert.equal(combineRailwayTrackBits(RAILWAY_TRACK_BITS.X, RAILWAY_TRACK_BITS.Y), 0x03);
  assert.throws(() => combineRailwayTrackBits('NOT_A_TRACK'), /Invalid railway TrackBit/);
  assert.throws(() => combineRailwayTrackBits(0x03), /Invalid railway TrackBit/);
});

test('generated production sprites preserve their shared transparent tile canvas', async () => {
  const assets = getRailwayTrackAssets();
  assert.equal(assets.length, 21);
  for (const asset of assets) {
    const file = path.join(ROOT, asset.path);
    assert.ok(fs.existsSync(file), `${asset.path} exists`);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, RAILWAY_TRACK_TILE.width, asset.asset);
    assert.equal(metadata.height, RAILWAY_TRACK_TILE.height, asset.asset);
    assert.equal(metadata.hasAlpha, true, asset.asset);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(data[3], 0, `${asset.asset} retains transparent padding at the origin`);
    assert.equal(info.channels, 4, asset.asset);
  }
});

test('the diagonals cut across the tile corner their two edges share', () => {
  const expected = { UPPER: 'N', LOWER: 'S', LEFT: 'W', RIGHT: 'E' };
  Object.entries(expected).forEach(([name, corner]) => {
    const segment = RAILWAY_TRACK_SEGMENTS[name];
    assert.equal(segment.corner, corner, name);
    const [cx, cy] = RAILWAY_TRACK_TILE.corners[corner];
    // both ends are half an edge from that corner
    const [a, b] = segment.anchors.map((k) => RAILWAY_TRACK_TILE.anchors[k]);
    assert.equal(Math.hypot(a[0] - cx, a[1] - cy), Math.hypot(b[0] - cx, b[1] - cy), name);
  });
  assert.equal(RAILWAY_TRACK_SEGMENTS.X.corner, undefined);
});

