const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// water-effects.js against a small map: '~' water, '.' land, 'B' a 1x1 building, '=' a road.
function load(rows, rotation = 0) {
  const map = rows.map((r) => r.split(''));
  const WATER = 5;
  const context = vm.createContext({
    Math, Map, Set, Number, Object, Array, String, JSON,
    localStorage: { getItem: () => null, setItem() {} },
    TILE_WIDTH: 100, TILE_HEIGHT: 50, BUILDING_SURFACE_Y_OFFSET: 15, WATER,
    mapRotation: rotation,
    mapData: map.map((r) => r.map((ch) => (ch === '~' ? WATER : 0))),
    isInsideMap: (r, c) => r >= 0 && c >= 0 && r < map.length && c < map[0].length,
    getTileId: (r, c) => `${r}:${c}`,
    isoToScreen: (col, row) => {
      const H = map.length; const W = map[0].length;
      let vc = col; let vr = row;
      if (rotation === 1) { vc = H - 1 - row; vr = col; } else if (rotation === 2) { vc = W - 1 - col; vr = H - 1 - row; } else if (rotation === 3) { vc = row; vr = W - 1 - col; }
      return { x: (vc - vr) * 50, y: (vc + vr) * 25 };
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'water-effects.js'), 'utf8'), context);
  const buildingSprites = new Map();
  map.forEach((r, row) => r.forEach((ch, col) => {
    if (ch === 'B') buildingSprites.set(`${row}:${col}`, { active: true, mapRow: row, mapCol: col, footprintRows: 1, footprintCols: 1, displayHeight: 200 });
  }));
  return { context, scene: { buildingSprites, bridgeSprites: new Map() } };
}

test('a lit waterfront building throws its light across the street onto the water in front of it', () => {
  const { context, scene } = load([
    '.....',
    '.B...',
    '.=...',
    '~~~~~',
    '~~~~~',
  ]);
  const sites = context.collectShoreReflectionSites(scene);
  // in front (screen-down) of the building: +row across the road, and +col along the land
  assert.ok(sites.some((s) => s.waterRow === 3 && s.waterCol === 1 && s.row === 2 && s.col === 1), JSON.stringify(sites));
  assert.ok(sites.every((s) => context.mapData[s.waterRow][s.waterCol] === 5));
  assert.ok(sites.every((s) => s.run >= 1));
});

test('water behind a building (up the screen) gets no reflection, and the rotation decides which side is behind', () => {
  const rows = [
    '~~~~~',
    '~~~~~',
    '..B..',
    '.....',
  ];
  assert.equal(load(rows, 0).context.collectShoreReflectionSites(load(rows, 0).scene).length, 0);
  const turned = load(rows, 2);
  assert.ok(turned.context.collectShoreReflectionSites(turned.scene).length > 0, 'turned round, the water is in front');
});

test('a bridge over the water stops the light; a low building throws none', () => {
  const rows = ['.B...', '~~~~~', '~~~~~'];
  const { context, scene } = load(rows);
  scene.bridgeSprites.set('1:1', {});
  assert.ok(!context.collectShoreReflectionSites(scene).some((s) => s.waterRow === 1 && s.waterCol === 1));
  const low = load(rows);
  low.scene.buildingSprites.get('0:1').displayHeight = 60;
  assert.equal(low.context.collectShoreReflectionSites(low.scene).length, 0);
});

test('the night art decides how bright a reflection is; day art (no live glow) gives none', () => {
  const { context } = load(['.']);
  const light = (key, lit = false) => context.getShoreReflectionLight({ texture: { key }, scene: { buildingLightsActive: lit } });
  assert.equal(light('bl_night__tower'), 1);
  assert.equal(light('bl_night__tower__half'), vm.runInContext("SHORE_REFLECTION", context).variantAlpha.half);
  assert.equal(light('bl_night__tower__lamps'), vm.runInContext("SHORE_REFLECTION", context).variantAlpha.lamps);
  assert.equal(light('tower'), 0);
  assert.ok(light('tower', true) > 0, 'a development build lit by live glows');
});

test('a wake follows the way the boat moved, fades when it stops, and is not drawn after a jump', () => {
  const { context } = load(['~']);
  const scene = { time: { now: 0 } };
  const boat = {};
  context.trackVesselWake(scene, boat, 5, 5, 1);
  scene.time.now = 100;
  context.trackVesselWake(scene, boat, 5.5, 5, 1); // +col, 5 tiles a second
  const wake = scene.vesselWakes.get(boat);
  assert.equal(wake.du, 1);
  assert.equal(wake.dv, 0);
  assert.equal(wake.target, 1);
  assert.ok(wake.alpha > 0);
  // the clock moves it every few frames: a frame without a step is not a stop
  scene.time.now = 150;
  context.trackVesselWake(scene, boat, 5.5, 5, 1);
  assert.equal(wake.target, 1);
  scene.time.now = 1000;
  context.trackVesselWake(scene, boat, 5.5, 5, 1); // stopped
  assert.equal(wake.target, 0);
  scene.time.now = 1100;
  context.trackVesselWake(scene, boat, 20, 5, 1); // a new trip
  assert.equal(wake.alpha, 0);
  // backing out (a Star Ferry): the wake turns round with it
  scene.time.now = 1200;
  context.trackVesselWake(scene, boat, 19.8, 5, 1);
  assert.equal(wake.du, -1);
  // on a slanting leg it trails along the axis the boat is drawn on (the larger step)
  scene.time.now = 1300;
  context.trackVesselWake(scene, boat, 19.9, 5.3, 1);
  assert.deepEqual([wake.du, wake.dv], [0, 1]);
});

test('both textures draw with real colours only (a NaN alpha throws in addColorStop and froze the map)', () => {
  let bad = 0;
  let stops = 0;
  const ctx = new Proxy({}, {
    get: (_t, key) => {
      if (key === 'createRadialGradient' || key === 'createLinearGradient') {
        return () => ({ addColorStop: (offset, colour) => { stops++; if (/NaN|Infinity/.test(colour) || !(offset >= 0 && offset <= 1)) bad++; } });
      }
      if (key === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      return () => {};
    },
    set: () => true,
  });
  const { context } = load(['~']);
  context.document = { createElement: () => ({ getContext: () => ctx }) };
  const textures = new Map();
  const scene = { textures: { exists: (k) => textures.has(k), addCanvas: (k) => { const t = { add() {} }; textures.set(k, t); return t; } } };
  assert.equal(context.ensureVesselWakeTexture(scene), true);
  assert.equal(context.ensureShoreReflectionTexture(scene), true);
  assert.ok(stops > 1000);
  assert.equal(bad, 0);
});

test('a frame that throws is skipped, not the end of the game loop', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'render-performance.js'), 'utf8');
  const start = src.indexOf('function installFrameErrorGuard(');
  const end = src.indexOf('\n}\n', start) + 3;
  const ctx = vm.createContext({ console: { error() {} }, window: {}, Date, String, Set });
  vm.runInContext(src.slice(start, end), ctx);
  let calls = 0;
  const game = { loop: { callback: () => { calls++; if (calls === 2) throw new Error('boom'); } } };
  assert.equal(ctx.installFrameErrorGuard(game), true);
  game.loop.callback();
  assert.doesNotThrow(() => game.loop.callback());
  game.loop.callback();
  assert.equal(calls, 3);
  assert.equal(ctx.window.__frameErrors.length, 1);
});

test('a wake is mirrored about its stern (a negative scale), never flipped within its frame', () => {
  const { context } = load(['~~~~~~~~', '~~~~~~~~', '~~~~~~~~', '~~~~~~~~', '~~~~~~~~', '~~~~~~~~', '~~~~~~~~', '~~~~~~~~']);
  context.getWorldDepth = () => 99999;
  context.scene = null;
  const made = [];
  const scene = {
    offsetX: 0, offsetY: 0, time: { now: 0 },
    textures: { exists: () => true },
    add: { image: () => { const s = { scene: true, flipX: false, flipY: false, setOrigin() {}, setDepth() {}, setMask() {},
      setPosition(x, y) { this.x = x; this.y = y; }, setScale(x, y) { this.sx = x; this.sy = y; }, setFlip() { throw new Error('setFlip'); },
      setAlpha() {}, setVisible(v) { this.visible = v; }, setFrame() {}, frame: { name: 0 } }; made.push(s); return s; } },
  };
  const steps = { se: [0, 1], nw: [0, -1], sw: [1, 0], ne: [-1, 0] };
  for (const [name, [dr, dc]] of Object.entries(steps)) {
    const boat = {};
    scene.time.now = 0;
    context.trackVesselWake(scene, boat, 3, 3, 1);
    scene.time.now = 200;
    context.trackVesselWake(scene, boat, 3 + dc * 0.5, 3 + dr * 0.5, 1);
    context.updateVesselWakes(scene, 200);
    const sprite = scene.vesselWakes.get(boat).sprite;
    // the stern: half a length back from the boat's centre, against the way it went
    const stern = context.isoToScreen(3 + dc * 0.5 - dc * 0.5, 3 + dr * 0.5 - dr * 0.5);
    assert.equal(sprite.x, stern.x, name);
    assert.equal(sprite.y, stern.y - 15 - 25, name);
    const ahead = context.isoToScreen(3 + dc, 3 + dr);
    assert.equal(Math.sign(sprite.sx), Math.sign(ahead.x - stern.x) || 1, `${name} x`);
    assert.equal(Math.sign(sprite.sy), Math.sign(ahead.y - stern.y) || 1, `${name} y`);
  }
});

test('a wake keeps to the axis its hull is drawn on; moving sideways to it raises none', () => {
  const { context } = load(['~']);
  const scene = { time: { now: 0 } };
  const ferry = {};
  context.trackVesselWake(scene, ferry, 5, 5, 1.5, true, 'r');
  scene.time.now = 100;
  context.trackVesselWake(scene, ferry, 5.4, 5.1, 1.5, true, 'r'); // pulling off a berth: sideways
  scene.time.now = 500;
  context.trackVesselWake(scene, ferry, 5.8, 5.2, 1.5, true, 'r'); // ...and still, past a corner's frame
  const wake = scene.vesselWakes.get(ferry);
  assert.equal(wake.target, 0);
  scene.time.now = 600;
  context.trackVesselWake(scene, ferry, 5.85, 5.8, 1.5, true, 'r');
  scene.time.now = 700;
  context.trackVesselWake(scene, ferry, 5.9, 6.4, 1.5, true, 'r'); // under way along its hull
  assert.deepEqual([wake.du, wake.dv], [0, 1]);
  assert.equal(wake.target, 1);
  scene.time.now = 720;
  context.trackVesselWake(scene, ferry, 6.1, 6.45, 1.5, true, 'r'); // one frame of a turn: no dip
  assert.equal(wake.target, 1);
  scene.time.now = 800;
  context.trackVesselWake(scene, ferry, 6.15, 6.1, 1.5, true, 'r'); // backing: the wake turns round
  assert.deepEqual([wake.du, wake.dv], [0, -1]);
});
