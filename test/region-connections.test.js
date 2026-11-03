const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// region-connections.js with a small stand-in world: roads is a Set of "row,col".
function pickFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end);
}

// A stand-in carriageway: two or more adjacent parallel roads form a band.
const BAND_SOURCE = `
  const getRoadCarriagewayBand = (r, c) => {
    const isRoad = (rr, cc) => roads.has(rr + ',' + cc);
    if (isRoad(r, c - 1) || isRoad(r, c + 1)) {
      if ((isRoad(r + 1, c) || isRoad(r - 1, c)) && (isRoad(r + 1, c - 1) || isRoad(r + 1, c + 1) || isRoad(r - 1, c - 1) || isRoad(r - 1, c + 1))) return { orientation: 'v' };
    }
    return null;
  };`;

function loadRegion({ roads = new Set(), buildings = new Set(), neighbours = null } = {}) {
  const source = `
    const MAP_WIDTH = 256, MAP_HEIGHT = 256;
    const city = { regionNeighbours: neighbours };
    const t = (key, params = {}) => key + JSON.stringify(params);
    const isInsideMap = (r, c) => r >= 0 && c >= 0 && r < 256 && c < 256;
    const isRoadTile = (r, c) => roads.has(r + ',' + c);
    const isRoadLikeTile = isRoadTile;
    ${BAND_SOURCE}
    ${pickFunction(read('tile-keys.js'), 'getRoadEdgeExitSide')}
    const hasBuildingType = (type) => buildings.has(type);
    ${read('hk-district-maps.js')}
    ${read('hk-terrain-tiles.js')}
    ${read('hk-district-info.js')}
    ${read('region-connections.js')}
    return { computeRegionNeighbours, detectRegionConnections, computeRegionFlows };
  `;
  return new Function('roads', 'buildings', 'neighbours', 'document', source)(roads, buildings, neighbours, undefined);
}

function roadColumn(col, fromRow, toRow) {
  const roads = new Set();
  for (let row = fromRow; row <= toRow; row++) roads.add(`${row},${col}`);
  return roads;
}

test('a Hong Kong district gets its real neighbours on each side', () => {
  const { computeRegionNeighbours } = loadRegion();
  const kowloonCity = computeRegionNeighbours({ districtId: 'kowloon-city' });
  assert.equal(kowloonCity.n, 'sha-tin');
  assert.equal(kowloonCity.e, 'kwun-tong');
  assert.equal(kowloonCity.w, 'yau-tsim-mong');
  assert.deepEqual(computeRegionNeighbours({}), { n: null, e: null, s: null, w: null }, 'no map, neutral sides');
});

test('only an edge road that joins the network is a connection; parallel roads add lanes', () => {
  const stub = loadRegion({ roads: new Set(['0,50']) });
  assert.equal(stub.detectRegionConnections().length, 0, 'a lone edge tile is not a connection');

  const roads = roadColumn(100, 0, 20);
  roadColumn(101, 0, 20).forEach((tile) => roads.add(tile));
  const [connection, ...rest] = loadRegion({ roads }).detectRegionConnections();
  assert.equal(rest.length, 0);
  assert.equal(connection.side, 'n');
  assert.equal(connection.lanes, 2);
});

test('the unemployed commute out, spare jobs draw workers in, both capped by the lanes', () => {
  const { computeRegionFlows } = loadRegion({ roads: roadColumn(100, 0, 20) });
  const jobless = computeRegionFlows({ labourForce: 1000, jobs: 600, industrialCount: 3 });
  assert.equal(jobless.capacity, 1200);
  assert.equal(jobless.out, 240, '60% of 400 unemployed');
  assert.equal(jobless.into, 0);
  assert.ok(jobless.demandR > 0.05);
  assert.equal(jobless.goodsRoute, 'road');

  const busy = computeRegionFlows({ labourForce: 1000, jobs: 6000, industrialCount: 3 });
  assert.equal(busy.into, 1200, 'capped at one lane');
  assert.equal(busy.utilisation, 1);
  assert.ok(busy.demandC > 0 && busy.demandI > 0);
});

test('industry with no road out and no port loses some demand; a port is a way out', () => {
  const landlocked = loadRegion().computeRegionFlows({ labourForce: 100, jobs: 100, industrialCount: 5 });
  assert.equal(landlocked.goodsRoute, 'none');
  assert.ok(landlocked.demandI < 0);
  const port = loadRegion({ buildings: new Set(['container_port']) }).computeRegionFlows({ labourForce: 100, jobs: 100, industrialCount: 5 });
  assert.equal(port.goodsRoute, 'port');
  assert.ok(port.demandI >= 0);
  const airport = loadRegion({ buildings: new Set(['airport']) }).computeRegionFlows({ labourForce: 100, jobs: 100 });
  assert.ok(airport.visitors > 0, 'an airport brings visitors without a road connection');
});

test('a road at the map edge draws straight on into the neighbouring district, not as a dead end', () => {
  const source = read('tile-keys.js');
  const start = source.indexOf('function getRoadKey(');
  const end = source.indexOf('\nfunction ', start + 1);
  // a road heading north off the map, one heading east, and one running along the south edge
  const roads = new Set(['0,10', '1,10', '2,10', '128,255', '128,254', '255,40', '255,41', '255,42', '254,41']);
  const getRoadKey = new Function('roads', `
    const MAP_WIDTH = 256, MAP_HEIGHT = 256;
    const isBridgeTile = () => false;
    const getRoadSlopeKey = () => null;
    const getRoadCarriagewayBand = () => null;
    const isInsideMap = (r, c) => r >= 0 && c >= 0 && r < 256 && c < 256;
    const isRoadLikeTile = (r, c) => roads.has(r + ',' + c);
    ${source.slice(start, end)}
    ${pickFunction(source, 'getRoadEdgeExitSide')}
    return getRoadKey;
  `)(roads);
  assert.equal(getRoadKey(0, 10), 'road_straight_v', 'north edge: carries on off the map');
  assert.equal(getRoadKey(2, 10), 'road_end_s', 'the inner end is still a dead end');
  assert.equal(getRoadKey(128, 255), 'road_straight_h', 'east edge');
  assert.equal(getRoadKey(255, 40), 'road_end_w', 'a road along the edge keeps its own end');
  assert.equal(getRoadKey(255, 41), 'road_t_n', 'a junction on the edge does not open onto the edge (no SW arm)');
});

test('a carriageway reaching the edge goes straight out on every lane, not round in a U-turn', () => {
  const source = read('tile-keys.js');
  const start = source.indexOf('function getRoadKey(');
  const end = source.indexOf('\nfunction ', start + 1);
  const roads = new Set();
  for (let row = 0; row <= 20; row++) { roads.add(`${row},100`); roads.add(`${row},101`); }
  const getRoadKey = new Function('roads', `
    const MAP_WIDTH = 256, MAP_HEIGHT = 256;
    const isBridgeTile = () => false;
    const getRoadSlopeKey = () => null;
    const getRoadCarriagewayBand = () => null; // the band's end tile is not recognised as one
    const isInsideMap = (r, c) => r >= 0 && c >= 0 && r < 256 && c < 256;
    const isRoadLikeTile = (r, c) => roads.has(r + ',' + c);
    ${source.slice(start, end)}
    ${pickFunction(source, 'getRoadEdgeExitSide')}
    return getRoadKey;
  `)(roads);
  assert.equal(getRoadKey(0, 100), 'road_straight_v', 'each lane carries straight on north');
  assert.equal(getRoadKey(0, 101), 'road_straight_v', 'no U-turn corner');
});

test('a road running along the map edge is not a connection', () => {
  const roads = new Set();
  for (let col = 30; col <= 60; col++) roads.add(`255,${col}`);
  roads.add('254,45');
  assert.equal(loadRegion({ roads }).detectRegionConnections().length, 0);
});

test('looking past the map edge finds nothing instead of throwing (a straight edge road looks along itself)', () => {
  const source = read('tile-keys.js');
  const getBaseTileKey = new Function(`
    const MAP_WIDTH = 256, MAP_HEIGHT = 256;
    const mapData = Array.from({ length: 256 }, () => new Array(256).fill(1));
    const isInsideMap = (r, c) => r >= 0 && c >= 0 && r < 256 && c < 256;
    ${pickFunction(source, 'getBaseTileKey')}
    return getBaseTileKey;
  `)();
  assert.equal(getBaseTileKey(256, 60), null);
  assert.equal(getBaseTileKey(-1, 60), null);
});

test('full roads out of the city make the forum (no picture), then not again for six months', () => {
  const posts = [];
  const source = `
    const MAP_WIDTH = 256, MAP_HEIGHT = 256;
    const city = { name: '測試城', forumPosts: posts, regionFlows: null };
    const t = (key) => key;
    const addCityNews = () => {};
    const addForumPost = (article, meta) => { const post = { id: meta.id, ...article }; posts.push(post); return post; };
    ${read('hk-district-info.js')}
    ${read('region-connections.js')}
    return { city, maybeAnnounceRegionCongestion };
  `;
  const { city, maybeAnnounceRegionCongestion } = new Function('posts', 'document', source)(posts, undefined);
  const flows = (utilisation) => ({ utilisation, out: 2000, into: 300, connections: [{ side: 'n', lanes: 2, neighbour: 'sha-tin' }] });

  city.regionFlows = flows(0.7);
  assert.equal(maybeAnnounceRegionCongestion(100), null, 'not full yet');
  city.regionFlows = flows(0.95);
  const post = maybeAnnounceRegionCongestion(101);
  assert.ok(post?.headline.includes('沙田'), 'names the district the road leads to');
  assert.ok(!post.image, 'no news picture yet');
  assert.ok(post.body.length <= 3, 'within what a saved post keeps');
  assert.equal(maybeAnnounceRegionCongestion(104), null, 'not again within six months');
  assert.ok(maybeAnnounceRegionCongestion(107), 'again after six months');
  assert.equal(posts.length, 2);
});
