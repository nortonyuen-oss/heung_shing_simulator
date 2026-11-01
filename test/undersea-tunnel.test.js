const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function pickFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end);
}

// undersea-tunnel.js on a stand-in map: `sea(row, col)` says which tiles are water; land is flat.
function loadTunnels(sea) {
  return new Function('sea', `
    const MAP_WIDTH = 256, MAP_HEIGHT = 256;
    const GROUND = 1, ROAD = 2, DIRT = 3, BEACH = 4, WATER = 5, HILL = 6;
    const mapData = Array.from({ length: 256 }, (_, r) => Array.from({ length: 256 }, (_, c) => (sea(r, c) ? WATER : GROUND)));
    const city = { underseaTunnels: [] };
    const buildingData = {};
    const isInsideMap = (r, c) => r >= 0 && c >= 0 && r < 256 && c < 256;
    const isBridgeTile = () => false;
    const getTileId = (r, c) => r + ':' + c;
    const getTileHeight = () => 0;
    const isSlopeTile = () => false;
    let mapRotation = 0;
    ${pickFunction(read('main.js'), 'getStraightDragPath')}
    ${read('undersea-tunnel.js')}
    return {
      getUnderseaTunnelCrossing, getUnderseaTunnelViewKey, getUnderseaTunnelRoadSide, getUnderseaTunnelSurface,
      getUnderseaTunnelApproachSide, isUnderseaTunnelTile, isUnderseaTunnelUTurn, isUnderseaTunnelExitTile,
      add: (site) => { city.underseaTunnels = [...city.underseaTunnels, { id: 't' + city.underseaTunnels.length, ...site }]; },
      setRotation: (r) => { mapRotation = r; },
    };
  `)(sea);
}

// a channel ten tiles wide, columns 100 to 109, with land on both sides
const channel = (r, c) => c >= 100 && c < 110;

test('a drag across the sea puts a portal on each shore, facing each other over the water', () => {
  const { getUnderseaTunnelCrossing } = loadTunnels(channel);
  const { site } = getUnderseaTunnelCrossing({ row: 50, col: 97 }, { row: 50, col: 112 });
  assert.ok(site);
  assert.equal(site.axis, 'row');
  assert.equal(site.crossing, 10);
  assert.equal(site.under.length, 20, 'two bores under ten sea tiles');
  const [west, east] = site.portals;
  assert.equal(west.dir, 'e');
  assert.ok(west.mouth.every(([, c]) => c === 99));
  assert.ok(west.approach.every(([, c]) => c === 96));
  assert.equal(east.dir, 'w');
  assert.ok(east.mouth.every(([, c]) => c === 110));
  assert.ok(east.approach.every(([, c]) => c === 113));
  assert.equal(site.cost, 30000 + 10 * 150);
});

test('the drag only has to reach the water: the tunnel follows the line on to the far shore', () => {
  const { getUnderseaTunnelCrossing } = loadTunnels(channel);
  const { site } = getUnderseaTunnelCrossing({ row: 50, col: 98 }, { row: 50, col: 103 });
  assert.equal(site?.crossing, 10);
});

test('no water, sea off the map, or land in the way: no tunnel, and the reason why', () => {
  assert.equal(loadTunnels(() => false).getUnderseaTunnelCrossing({ row: 50, col: 90 }, { row: 50, col: 120 }).reason, 'tunnel.why.sea');
  assert.equal(loadTunnels((r, c) => c < 100).getUnderseaTunnelCrossing({ row: 50, col: 105 }, { row: 50, col: 90 }).reason, 'tunnel.why.otherShore');
  // rocks either side of the line, in the way of the second bore whichever side it goes
  const islet = (r, c) => channel(r, c) && !(c === 105 && (r === 49 || r === 51));
  assert.equal(loadTunnels(islet).getUnderseaTunnelCrossing({ row: 50, col: 97 }, { row: 50, col: 112 }).reason, 'tunnel.why.island');
});

test('the portals stand on road heading into the tunnel, and its bores run one way each, keep-left', () => {
  const tunnels = loadTunnels(channel);
  const { site } = tunnels.getUnderseaTunnelCrossing({ row: 50, col: 97 }, { row: 50, col: 112 });
  tunnels.add(site);
  assert.ok(site.portals[0].tiles.every(([r, c]) => tunnels.getUnderseaTunnelRoadSide(r, c) === 'e'));
  assert.ok(site.portals[1].tiles.every(([r, c]) => tunnels.getUnderseaTunnelRoadSide(r, c) === 'w'));
  assert.ok(site.portals[1].approach.every(([r, c]) => tunnels.getUnderseaTunnelApproachSide(r, c) === 'w'));
  assert.equal(tunnels.getUnderseaTunnelRoadSide(...site.under[0]), null, 'no road drawn on the sea');
  assert.ok(site.under.every(([r, c]) => tunnels.getUnderseaTunnelSurface(r, c).hidden));
  assert.ok(site.portals[0].tiles.every(([r, c]) => !tunnels.getUnderseaTunnelSurface(r, c).hidden));
  const rows = [...new Set(site.under.map(([r]) => r))].sort((a, b) => a - b);
  assert.equal(tunnels.getUnderseaTunnelSurface(rows[0], 104).oneWay, 'e', 'the north bore goes east');
  assert.equal(tunnels.getUnderseaTunnelSurface(rows[1], 104).oneWay, 'w');
  assert.ok(tunnels.isUnderseaTunnelTile(rows[0], 104), 'nothing is built on the sea above it');
  assert.ok(!tunnels.isUnderseaTunnelTile(...site.portals[0].approach[0]), 'the approach is ordinary road');
});

test('each rotation shows the portal from the matching side', () => {
  const { getUnderseaTunnelViewKey, setRotation } = loadTunnels(() => false);
  const views = [0, 1, 2, 3].map((rotation) => { setRotation(rotation); return getUnderseaTunnelViewKey('w'); });
  assert.deepEqual(views, ['-col', '-row', '+col', '+row'], 'a tunnel heading west turns through all four views');
});

test('no turning back in front of a portal, but a road meeting either approach tile still gets in', () => {
  const tunnels = loadTunnels(channel);
  const { site } = tunnels.getUnderseaTunnelCrossing({ row: 50, col: 97 }, { row: 50, col: 112 });
  tunnels.add(site);
  // the west portal heads east into the sea; its north bore goes in (east), its south bore out
  const west = site.portals[0];
  const tile = ([row, col]) => ({ row, col });
  const [north, south] = [...west.approach].sort((a, b) => a[0] - b[0]).map(tile);
  const openOf = (lane) => tile(west.open.find(([r]) => r === lane.row));
  const road = (lane) => ({ row: lane.row, col: lane.col - 1 });
  assert.ok(tunnels.isUnderseaTunnelUTurn(openOf(south), south, north), 'out of the tunnel, not across and back in');
  assert.ok(!tunnels.isUnderseaTunnelUTurn(road(south), south, north), 'from a road on the outgoing lane, across to the bore going in');
  assert.ok(tunnels.isUnderseaTunnelUTurn(road(north), north, south), 'never across from the lane going in');
  assert.ok(tunnels.isUnderseaTunnelUTurn(south, north, road(north)), 'once across, into the tunnel, not back out');
  assert.ok(!tunnels.isUnderseaTunnelUTurn(south, north, openOf(north)));
  assert.ok(!tunnels.isUnderseaTunnelUTurn(openOf(south), south, road(south)), 'straight on out is fine');
});

test('cars come out of a portal from the last tile under the sea in the bore heading out', () => {
  const tunnels = loadTunnels(channel);
  const { site } = tunnels.getUnderseaTunnelCrossing({ row: 50, col: 97 }, { row: 50, col: 112 });
  tunnels.add(site);
  const exits = site.under.filter(([r, c]) => tunnels.isUnderseaTunnelExitTile(r, c));
  assert.equal(exits.length, 2, 'one at each end');
  const rows = [...new Set(site.under.map(([r]) => r))].sort((a, b) => a - b);
  // the south bore heads west, out at the west portal; the north bore heads east, out at the east one
  assert.deepEqual(exits.map(([r, c]) => [r, c]).sort((a, b) => a[1] - b[1]), [[rows[1], 100], [rows[0], 109]]);
});
