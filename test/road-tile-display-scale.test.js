const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const sharp = require('sharp');
const { getRoadTextureDisplayScale, NEW_ROAD_TILE_LOGICAL_FILES } = require('../road-tile-sets.js');

const texture = (key, width) => ({ key, source: [{ width }] });

test('oversized road-set art is drawn back down to the set footprint', () => {
  assert.equal(getRoadTextureDisplayScale(texture('roads_new_road_straight_v', 512)), 160 / 512);
  assert.equal(getRoadTextureDisplayScale(texture('roads_new_road_straight_v__lines_zebraCrossingNS', 512)), 160 / 512);
  assert.equal(getRoadTextureDisplayScale(texture('roads_new_road_hill_n', 160)), 1, 'footprint-sized art is untouched');
  assert.equal(getRoadTextureDisplayScale(texture('roads_classic_road_cross', 100)), 1);
  assert.equal(getRoadTextureDisplayScale(texture('ground_full', 512)), 1, 'only road-set textures are rescaled');
  assert.equal(getRoadTextureDisplayScale(null), 1);
});

// Every newRoadTiles texture must land on the 160x80 footprint once scaled, or the tile grid
// (and every lamp, bus stop and vehicle anchored to it) would drift.
test('every newRoadTiles texture keeps the 2:1 footprint aspect so the scale lands on 160x80', async () => {
  for (const file of new Set(Object.values(NEW_ROAD_TILE_LOGICAL_FILES))) {
    const { width, height } = await sharp(path.join(__dirname, '..', 'newRoadTiles', file)).metadata();
    const scale = getRoadTextureDisplayScale(texture('roads_new_x', width));
    assert.equal(width * scale, 160, `${file}: ${width}px wide`);
    assert.equal(height * scale, 80, `${file}: ${width}x${height} is not 2:1`);
  }
});
