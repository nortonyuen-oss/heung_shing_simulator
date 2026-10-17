const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const lion = require('../festival-lion-dance');

const line = (row = 10, start = 10, count = 6, height = 0) => Array.from({ length: count }, (_, i) => ({ row, col: start + i, height }));
const tileKey = (p) => `${Math.round(p.row)}:${Math.round(p.col)}`;
const route = () => lion.buildLionDanceRoutes({ roadTiles: line() })[0];

test('routes retain connected road bends and split at junctions and height changes', () => {
  const bend = [...line(10, 10, 4), ...Array.from({ length: 3 }, (_, i) => ({ row: 11 + i, col: 13, height: 0 }))];
  const routes = lion.buildLionDanceRoutes({ roadTiles: bend });
  assert.equal(routes.length, 1);
  assert.ok(new Set(routes[0].tiles.map((p) => p.row)).size > 1);
  assert.ok(new Set(routes[0].tiles.map((p) => p.col)).size > 1);
  const split = lion.buildLionDanceRoutes({ roadTiles: [...line(10, 10, 3), ...line(10, 13, 3, 1)] });
  assert.equal(split.length, 2);
  for (const r of split) assert.ok(r.tiles.every((p) => p.height === r.height));
  const blocked = lion.buildLionDanceRoutes({ roadTiles: line().map((p, i) => ({ ...p, bridge: i === 2, highway: i === 3 })) });
  assert.equal(blocked.length, 0, 'a two-tile fragment cannot hold a marching troupe');
  assert.equal(lion.buildLionDanceRoutes({ roadTiles: line(), isWalkable: () => false }).length, 0);
  assert.deepEqual(lion.buildLionDanceRoutes({ roadTiles: [...bend].reverse() }), routes, 'independent of input enumeration');
});

test('all four actors stay on the connected road through bends, turns and performances', () => {
  const tiles = [...line(10, 10, 4), ...Array.from({ length: 3 }, (_, i) => ({ row: 11 + i, col: 13, height: 0 }))];
  const r = lion.buildLionDanceRoutes({ roadTiles: tiles })[0], allowed = new Set(tiles.map(tileKey));
  const phases = new Set();
  for (let t = 0; t < 500; t += .125) for (const actor of lion.LION_DANCE_ACTORS) {
    const pose = lion.getLionDancePose(r, t, { ...actor, seed: 'test' });
    assert.ok(allowed.has(tileKey(pose)), `${actor.role} left the road at ${t}: ${pose.row},${pose.col}`);
    assert.ok(pose.bobM >= 0 && pose.bobM <= .13);
    phases.add(pose.phase);
    const later = lion.getLionDancePose(r, t + .0001, { ...actor, seed: 'test' });
    assert.ok(Math.hypot(pose.row - later.row, pose.col - later.col) * 20 < .002, 'no jump at a turn or phase boundary');
  }
  assert.deepEqual([...phases].sort(), ['performing', 'turning', 'walking']);
});

test('road containment holds at left and right bends in every map orientation', () => {
  for (const sign of [-1, 1]) for (let rotation = 0; rotation < 4; rotation++) {
    const raw = [...line(0, 0, 4), ...Array.from({ length: 3 }, (_, i) => ({ row: sign * (i + 1), col: 3, height: 0 }))];
    const tiles = raw.map((p) => {
      let row = p.row, col = p.col;
      for (let turn = 0; turn < rotation; turn++) [row, col] = [col, -row];
      return { row: row + 30, col: col + 30, height: 0 };
    });
    const r = lion.buildLionDanceRoutes({ roadTiles: tiles })[0], allowed = new Set(tiles.map(tileKey));
    for (let t = 0; t < 400; t += .5) for (const actor of lion.LION_DANCE_ACTORS)
      assert.ok(allowed.has(tileKey(lion.getLionDancePose(r, t, actor))), `left/right turn ${sign}/${rotation} ${actor.role}/${t}`);
  }
});

test('the drum stays at its street station while both lions travel and stop near it', () => {
  const r = route(), drum = lion.LION_DANCE_ACTORS.find((a) => a.fixed);
  const first = lion.getLionDancePose(r, 0, drum);
  let min = Infinity, max = -Infinity, performed = false;
  for (let t = 0; t < 400; t += .25) {
    const stand = lion.getLionDancePose(r, t, drum), p = lion.getLionDancePose(r, t, { role: 'red', offsetM: 1.2 });
    assert.equal(stand.row, first.row); assert.equal(stand.col, first.col); assert.equal(stand.bobM, 0);
    min = Math.min(min, p.col); max = Math.max(max, p.col);
    if (p.performing) { performed = true; assert.ok(Math.hypot(p.row - stand.row, p.col - stand.col) * 20 < 8); }
  }
  assert.ok(max - min > 3, 'the lions march more than 60 m');
  assert.ok(performed);
});

test('view selection retains visible troupes, respects tier and zoom, and separates routes', () => {
  const routes = lion.buildLionDanceRoutes({ roadTiles: [10, 14, 18, 22].flatMap((r) => line(r)) });
  const scene = { cameras: { main: { zoom: 2, worldView: { x: 0, y: 0, right: 1000, bottom: 1000 } } },
    lionDanceProject: (p) => ({ x: p.col * 20, y: p.row * 20 }) };
  const standard = lion.pickLionDanceViewRoutes(scene, routes, 'year', 'standard');
  assert.equal(standard.length, 2);
  assert.deepEqual(lion.pickLionDanceViewRoutes(scene, [...routes].reverse(), 'year', 'standard'), standard);
  assert.equal(lion.pickLionDanceViewRoutes(scene, routes, 'year', 'grand').length, 3);
  assert.equal(lion.pickLionDanceViewRoutes(scene, routes, 'year', 'basic').length, 1);
  scene.cameras.main.zoom = 1;
  assert.deepEqual(lion.pickLionDanceViewRoutes(scene, routes, 'year', 'grand'), []);
  scene.cameras.main.zoom = 2; scene.cameras.main.worldView.x = 2000;
  assert.deepEqual(lion.pickLionDanceViewRoutes(scene, routes, 'year', 'grand'), []);
});

test('layout emits stable, measured street actors only during funded active phases and safe weather', () => {
  const ctx = { lionRoutes: [route()], seed: 'test', tier: 'standard', phase: 'open' };
  const placements = lion.layoutLionDanceStreets(ctx);
  assert.deepEqual(placements.map((p) => p.partId), ['lnyLionLeader', 'lnyLionRed', 'lnyLionGold', 'lnyDrum']);
  assert.deepEqual(placements.map((p) => p.heightM), [1.7, 1.6, 1.6, 1.4]);
  assert.equal(new Set(placements.map((p) => p.id)).size, 4);
  assert.deepEqual(lion.layoutLionDanceStreets(ctx).map((p) => p.id), placements.map((p) => p.id));
  for (const phase of ['setup', 'closed', '']) assert.deepEqual(lion.layoutLionDanceStreets({ ...ctx, phase }), []);
  for (const phase of ['open', 'peak', 'after']) assert.equal(lion.layoutLionDanceStreets({ ...ctx, phase }).length, 4);
  assert.deepEqual(lion.layoutLionDanceStreets({ ...ctx, tier: 'skip' }), []);
  assert.deepEqual(lion.layoutLionDanceStreets({ ...ctx, weather: { rainWarning: 'red' } }), []);
  assert.deepEqual(lion.layoutLionDanceStreets({ ...ctx, weather: { typhoonStage: 'signal3' } }), []);
  assert.equal(lion.layoutLionDanceStreets({ ...ctx, weather: { rainWarning: 'yellow', typhoonStage: 'signal1' } }).length, 4);
});

function runtime() {
  const sprites = new Map(lion.layoutLionDanceStreets({ lionRoutes: [route()], phase: 'open', tier: 'standard', seed: 'test' }).map((p) => [p.id, {
    festivalPlacement: p, x: 0, y: 0, scaleX: 1, scaleY: 1, visible: true,
    setPosition(x, y) { this.x = x; this.y = y; }, setVisible(v) { this.visible = v; },
    setScale(x, y = x) { this.scaleX = x; this.scaleY = y; },
  }]));
  const context = vm.createContext({ console, Math, Map, Set, simPaused: false, simSpeedMul: 1,
    city: { weather: {} }, scene: { festivalSprites: sprites, lionDanceProject: (p) => ({ x: p.col * 50 - p.row * 50, y: p.col * 25 + p.row * 25 }) },
    positionFestivalSprite(scene, sprite) { const p = sprite.festivalPlacement; sprite.setScale(1); const at = scene.lionDanceProject(p); sprite.setPosition(at.x, at.y); return true; },
    updateLionDanceAudio(scene, sources) { scene.audioSources = sources; }, stopLionDanceAudio(scene) { scene.audioStopped = true; },
  });
  vm.runInContext(fs.readFileSync('festival-lion-dance.js', 'utf8'), context);
  const update = (t) => { context.time = t; return vm.runInContext('updateLionDance(scene,time)', context); };
  return { context, scene: context.scene, update };
}

test('the animation clock freezes every pose on pause, resumes without catchup, and scales with speed', () => {
  const { context, scene, update } = runtime();
  update(0); update(100); update(200);
  assert.equal(scene.lionDanceElapsedMs, 200);
  const before = [...scene.festivalSprites.values()].map((s) => [s.x, s.y, s.scaleY]);
  context.simPaused = true; update(250); update(10000);
  assert.equal(scene.lionDanceElapsedMs, 200);
  assert.deepEqual([...scene.festivalSprites.values()].map((s) => [s.x, s.y, s.scaleY]), before);
  context.simPaused = false; context.simSpeedMul = 2; update(10100);
  assert.equal(scene.lionDanceElapsedMs, 400);
  assert.equal(scene.audioSources.length, 1, 'one spatial audio source per troupe');
  vm.runInContext('clearLionDance(scene)', context);
  assert.equal(scene.lionDanceElapsedMs, 0); assert.equal(scene.audioStopped, true);
});

test('frame-rate changes do not change a pose and unsafe weather immediately silences and hides it', () => {
  const fine = runtime(), coarse = runtime();
  for (let t = 0; t <= 1000; t += 10) fine.update(t);
  for (let t = 0; t <= 1000; t += 100) coarse.update(t);
  assert.equal(fine.scene.lionDanceElapsedMs, coarse.scene.lionDanceElapsedMs);
  assert.deepEqual([...fine.scene.festivalSprites.values()].map((s) => [s.x, s.y]), [...coarse.scene.festivalSprites.values()].map((s) => [s.x, s.y]));
  fine.context.city.weather.rainWarning = 'black'; fine.update(1100);
  assert.equal(fine.scene.audioSources.length, 0);
  assert.ok([...fine.scene.festivalSprites.values()].every((s) => !s.visible));
});

test('removing or raising a road tile prevents a running troupe from walking through it', () => {
  const { context, scene, update } = runtime();
  context.ROAD = 2; context.mapData = Array.from({ length: 30 }, () => Array(30).fill(1));
  context.heightMap = Array.from({ length: 30 }, () => Array(30).fill(0));
  for (const p of route().tiles) context.mapData[p.row][p.col] = 2;
  update(0); assert.equal(scene.audioSources.length, 1);
  context.heightMap[10][12] = 1; update(100);
  assert.ok([...scene.festivalSprites.values()].every((s) => !s.visible)); assert.equal(scene.audioSources.length, 0);
  context.heightMap[10][12] = 0; context.mapData[10][12] = 5; update(200);
  assert.ok([...scene.festivalSprites.values()].every((s) => !s.visible));
});

test('calendar phases, funding, settings, hidden scenes and rehearsal all gate both actors and audio', () => {
  const { context, scene, update } = runtime();
  context.isFestivalGameplayLive = () => context.live;
  context.live = true; context.isFestivalEnabled = () => context.enabled;
  context.enabled = true; context.getFestivalTier = () => context.tier;
  context.tier = 'standard'; context.getFestivalHistoryEntry = () => ({ outcome: context.outcome });
  context.outcome = 'held'; context.getActiveFestivals = () => [{ id: 'lunarNewYear', phase: context.phase }];
  context.phase = 'open'; context.isTerrainCreatorMode = false;
  let time = 0;
  const check = (visible) => {
    update(time += 100);
    assert.equal(scene.audioSources.length, visible ? 1 : 0);
    assert.ok([...scene.festivalSprites.values()].every((s) => s.visible === visible));
  };
  for (const phase of ['open', 'peak', 'after']) { context.phase = phase; check(true); }
  for (const phase of ['setup', '', 'closed']) { context.phase = phase; check(false); }
  context.phase = 'open'; context.enabled = false; check(false);
  context.enabled = true; context.tier = 'skip'; check(false);
  context.tier = 'standard'; context.outcome = 'noVenue'; check(false);
  context.outcome = 'held'; context.live = false; check(false);
  context.live = true; context.isTerrainCreatorMode = true; check(false);
  context.isTerrainCreatorMode = false; scene.bunHillEventSession = {}; check(false);
  scene.bunHillEventSession = null; scene.scene = { isVisible: () => false }; check(false);
  scene.scene.isVisible = () => true; check(true);
});

test('map cache changes when a street is removed, raised or converted to a bridge', () => {
  const { context, scene } = runtime();
  context.ROAD = 2; context.mapData = Array.from({ length: 30 }, () => Array(30).fill(1));
  context.heightMap = Array.from({ length: 30 }, () => Array(30).fill(0));
  for (const p of route().tiles) context.mapData[p.row][p.col] = 2;
  scene.cameras = { main: { zoom: 2, worldView: { x: -1000, y: -1000, right: 1000, bottom: 1000 } } };
  const extras = () => vm.runInContext('getLionDanceLayoutExtras(scene)', context);
  assert.equal(extras().lionRoutes.length, 1);
  assert.equal(extras().lionVenueAvailable, true);
  scene.cameras.main.zoom = 1;
  assert.equal(extras().lionRoutes.length, 0);
  assert.equal(extras().lionVenueAvailable, true, 'venue eligibility does not depend on camera zoom');
  scene.cameras.main.zoom = 2;
  const cached = scene.lionDanceRouteMap; extras(); assert.equal(scene.lionDanceRouteMap, cached);
  context.isBridgeTile = (r, c) => r === 10 && c === 12;
  extras(); assert.notEqual(scene.lionDanceRouteMap, cached);
  assert.ok(scene.lionDanceRouteMap.routes.every((r) => r.tiles.every((p) => p.col !== 12)));
  context.isBridgeTile = () => false; context.heightMap[10][12] = 1;
  extras(); assert.ok(scene.lionDanceRouteMap.routes.every((r) => r.tiles.every((p) => p.height === r.height)));
  context.mapData[10][12] = 5;
  extras(); assert.ok(scene.lionDanceRouteMap.routes.every((r) => r.tiles.every((p) => p.col !== 12)));
  context.mapData = Array.from({ length: 30 }, () => Array(30).fill(1));
  assert.equal(extras().lionVenueAvailable, false);
  assert.equal(extras().lionRoutes.length, 0);
});
