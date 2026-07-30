const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const vessels = require('../vessel-visuals.js');

function source(fileName) {
  return fs.readFileSync(path.join(ROOT, fileName), 'utf8');
}

test('vessel sound registry ships a playable horn effect', () => {
  const main = source('main.js');
  assert.match(main, /key: 'vessel_horn'.*file: 'Sounds\/vesselFlute\.m4a'/);
  const filePath = path.join(ROOT, 'Sounds/vesselFlute.m4a');
  assert.ok(fs.existsSync(filePath));
  assert.ok(fs.statSync(filePath).size > 0);
  assert.equal(vessels.VESSEL_AUDIO_CONFIG.horn.key, 'vessel_horn');
});

test('vessel horn sound uses proximity mixing and follows simulation pause', () => {
  const originalAmbient = global.getStoredAmbientVolume;
  const originalPaused = global.simPaused;
  const calls = [];
  const sound = {
    once: () => {},
    play: () => calls.push('play'),
    setVolume: (value) => calls.push(['volume', value]),
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    off: () => calls.push('off'),
    stop: () => calls.push('stop'),
    destroy: () => calls.push('destroy'),
  };
  const scene = {
    cameras: {
      main: {
        zoom: 1, width: 1000, height: 800, scrollX: 0, scrollY: 0, originX: 0.5, originY: 0.5,
      },
    },
    cache: { audio: { has: () => true } },
    sound: { locked: false, add: () => sound },
  };
  const event = { lastWorld: { x: 500, y: 400 }, sound: null };
  try {
    global.getStoredAmbientVolume = () => 0.5;
    global.simPaused = false;
    assert.equal(vessels.startVesselEventSound(scene, event, vessels.VESSEL_AUDIO_CONFIG.horn), true);
    assert.equal(calls[0], 'play');
    assert.equal(event.sound, sound);
    assert.equal(vessels.getVesselEventAudioVolume(scene, event.lastWorld, 0.44), 0.22);
    global.simPaused = true;
    vessels.updateVesselEventSound(scene, event);
    assert.ok(calls.includes('pause'));
    global.simPaused = false;
    vessels.updateVesselEventSound(scene, event);
    assert.ok(calls.includes('resume'));
    vessels.stopVesselEventSound(event);
    assert.equal(event.sound, null);
    assert.ok(calls.includes('stop'));
    assert.ok(calls.includes('destroy'));
  } finally {
    if (originalAmbient === undefined) delete global.getStoredAmbientVolume;
    else global.getStoredAmbientVolume = originalAmbient;
    if (originalPaused === undefined) delete global.simPaused;
    else global.simPaused = originalPaused;
  }
});

test('the vessel horn plays exactly when a ship enters cargo exchange', () => {
  const moduleSource = source('vessel-visuals.js');
  assert.match(
    moduleSource,
    /event\.phase = 'cargo_exchange'[\s\S]*?startVesselEventSound\(scene, event, VESSEL_AUDIO_CONFIG\.horn\)/,
  );
});

test('vessel registry has empty, half and full variants in every direction', async () => {
  assert.deepEqual(Object.keys(vessels.VESSEL_ASSET_REGISTRY), ['empty', 'half', 'full']);
  for (const cargoState of vessels.VESSEL_CARGO_STATES) {
    const directions = vessels.VESSEL_ASSET_REGISTRY[cargoState];
    assert.deepEqual(Object.keys(directions), [...vessels.VESSEL_DIRECTIONS]);
    for (const direction of vessels.VESSEL_DIRECTIONS) {
      const filePath = path.join(ROOT, directions[direction].path);
      assert.ok(fs.existsSync(filePath), directions[direction].path);
      const metadata = await sharp(filePath).metadata();
      assert.deepEqual([metadata.width, metadata.height], [256, 256]);
      assert.equal(metadata.hasAlpha, true);
    }
  }
});

test('vessel directions follow screen movement in all four quadrants', () => {
  assert.equal(vessels.getVesselTextureDirection(1, -1), 'ne');
  assert.equal(vessels.getVesselTextureDirection(-1, -1), 'nw');
  assert.equal(vessels.getVesselTextureDirection(1, 1), 'se');
  assert.equal(vessels.getVesselTextureDirection(-1, 1), 'sw');
  assert.equal(vessels.getVesselTextureDirection(0, 0, 'sw'), 'sw');
});

test('only signal 8 or above suspends new vessel activity', () => {
  ['none', 'signal1', 'signal3'].forEach((typhoonStage) => {
    assert.equal(vessels.isVesselSevereWeather({ typhoonStage }), false);
  });
  ['signal8', 'signal9', 'signal10'].forEach((typhoonStage) => {
    assert.equal(vessels.isVesselSevereWeather({ typhoonStage }), true);
  });
});

test('cargo scenarios divide the random range into three equal outcomes', () => {
  assert.equal(vessels.getCargoScenarioDefinition(0).id, 'exchange');
  assert.equal(vessels.getCargoScenarioDefinition(0.32).id, 'exchange');
  assert.equal(vessels.getCargoScenarioDefinition(0.34).id, 'offload');
  assert.equal(vessels.getCargoScenarioDefinition(0.66).id, 'offload');
  assert.equal(vessels.getCargoScenarioDefinition(0.67).id, 'export');
  assert.deepEqual(
    vessels.CARGO_SCENARIO_DEFS.map((scenario) => [...scenario.states]),
    [['full', 'half', 'full'], ['full', 'half', 'empty'], ['empty', 'half', 'full']],
  );
});

test('harbor berth follows all four water-facing sides and beach buffers', () => {
  const water = 1;
  const land = 0;
  const map = Array.from({ length: 12 }, () => Array(12).fill(land));
  for (let col = 4; col < 8; col++) { map[3][col] = water; map[8][col] = water; }
  for (let row = 4; row < 8; row++) { map[row][3] = water; map[row][8] = water; }
  assert.equal(vessels.getHarborBerthCandidates(map, 4, 4, 'n', water)[0].center.row, 3);
  assert.equal(vessels.getHarborBerthCandidates(map, 4, 4, 's', water)[0].center.row, 8);
  assert.equal(vessels.getHarborBerthCandidates(map, 4, 4, 'w', water)[0].center.col, 3);
  assert.equal(vessels.getHarborBerthCandidates(map, 4, 4, 'e', water)[0].center.col, 8);

  map[3].fill(2, 4, 8);
  map[2].fill(water, 4, 8);
  const buffered = vessels.getHarborBerthCandidates(map, 4, 4, 'n', water);
  assert.equal(buffered[0].offset, 2);
  assert.equal(buffered[0].center.row, 2);
});

// This is the fix for "bow/hull poking into the harbor's land tiles": the
// dock point must clear the harbor's own land edge (fraction 0, which would
// render the ship on top of land) by at least a full tile past the direct
// water tile used for routing (fraction 1, the pre-redesign spawn point).
// dockOffsetTiles is calibrated per side (VESSEL_DOCK_OFFSET_TILES_BY_SIDE)
// by sampling the ship sprite's actual rendered pixels against the map at
// every container port in the "九龍" save. 'n'/'s' stay at the tight 0.82
// default (no real port needed more); 'e'/'w' sit at 1.8 - a smaller value
// left a visible sliver of grass/beach at ports whose local coastline
// curves in tightly near the berth. At mapRotation 0, side 'n' displays as
// harbor_ur and side 'w' as harbor_ul, so both also pick up
// VESSEL_OCCLUSION_CLEARANCE_TILES (see the dedicated occlusion test below).
test('vessel dock point clears the harbor land edge with margin past the routed water tile', () => {
  const originalGlobals = Object.fromEntries(['mapRotation', 'rotateDirection'].map((key) => [key, global[key]]));
  global.mapRotation = 0;
  global.rotateDirection = (direction, steps) => {
    const order = ['n', 'e', 's', 'w'];
    const index = order.indexOf(direction);
    return order[(index + ((steps % 4) + 4)) % 4];
  };
  try {
    const portEntry = { row: 4, col: 4, record: { footprintCols: 4, footprintRows: 4 } };
    // 'n' -> harbor_ur at rotation 0, so this also carries the +1.0 occlusion clearance.
    const north = vessels.getVesselDockPoint(portEntry, 'n', { offset: 1, center: { row: 3, col: 5 } });
    assert.ok(north.row > 2 && north.row < 3, `expected 2 < row < 3, got ${north.row}`);
    assert.equal(north.col, 5);

    // 'w' -> harbor_ul at rotation 0, so this also carries the +1.0 occlusion clearance.
    const west = vessels.getVesselDockPoint(portEntry, 'w', { offset: 1, center: { row: 5, col: 3 } });
    assert.ok(west.col > 1 && west.col < 2, `expected 1 < col < 2, got ${west.col}`);

    // 's' -> harbor_ll at rotation 0: no occlusion clearance.
    const south = vessels.getVesselDockPoint(portEntry, 's', { offset: 1, center: { row: 8, col: 5 } });
    assert.ok(south.row > 7 && south.row < 8, `expected 7 < row < 8, got ${south.row}`);

    // 'e' -> harbor_lr at rotation 0: no occlusion clearance.
    const east = vessels.getVesselDockPoint(portEntry, 'e', { offset: 1, center: { row: 5, col: 8 } });
    assert.ok(east.col > 8 && east.col < 9, `expected 8 < col < 9, got ${east.col}`);

    // A beach-buffer berth (offset 2, one extra tile out) should push the dock
    // point out by the same extra whole tile, not collapse back toward land.
    const bufferedNorth = vessels.getVesselDockPoint(portEntry, 'n', { offset: 2, center: { row: 2, col: 5 } });
    assert.ok(bufferedNorth.row > 1 && bufferedNorth.row < 2, `expected 1 < row < 2, got ${bufferedNorth.row}`);
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

// The occlusion-clearance fix: the harbor_ul/harbor_ur artwork draws its
// crane/warehouse structure much closer to the water edge than harbor_ll/
// harbor_lr do, so a docked ship can end up visually hidden behind that
// structure even though it's fully clear of the land tiles underneath. This
// only depends on which artwork variant is on screen for the port's *fixed*
// logical side at the *current* view rotation - every side passes through
// every variant across the 4 rotations, so this cannot be baked into the
// fixed per-side table above without breaking rotation-invariance.
test('harbor visual variant follows the fixed side through every map rotation, not a static lookup', () => {
  const originalGlobals = Object.fromEntries(['mapRotation', 'rotateDirection'].map((key) => [key, global[key]]));
  global.rotateDirection = (direction, steps) => {
    const order = ['n', 'e', 's', 'w'];
    const index = order.indexOf(direction);
    return order[(index + ((steps % 4) + 4)) % 4];
  };
  try {
    // side 'e' sweeps lr -> ll -> ul -> ur as the view rotates 0..3, so it
    // passes through the occlusion-prone ul/ur pair exactly like every other
    // side does - the bug the user found wasn't specific to one logical side.
    const expectedForE = ['lr', 'll', 'ul', 'ur'];
    expectedForE.forEach((expected, rotation) => {
      global.mapRotation = rotation;
      assert.equal(vessels.getVesselHarborVisualVariant('e'), expected, `rotation ${rotation}`);
    });
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

// A docked ship must lie broadside against the pier (parallel), never
// pointed bow-first into it (perpendicular). A first version of this fix
// used a static side->direction lookup table, which was correct at the
// default view rotation but silently wrong under any other rotation, since
// isoToScreen() remaps which screen diagonal a given logical axis lands on
// once the map is rotated. getVesselDockDirection must derive the direction
// from real screen-space points (going through isoToScreen) so it rotates
// along with everything else instead of staying pinned to a fixed diagonal.
test('docked direction stays parallel to the pier at every map rotation', () => {
  const originalGlobals = Object.fromEntries([
    'isoToScreen', 'TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET', 'MAP_HEIGHT', 'MAP_WIDTH',
  ].map((key) => [key, global[key]]));
  try {
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.MAP_HEIGHT = 256;
    global.MAP_WIDTH = 256;
    const scene = { offsetX: 0, offsetY: 0 };
    const ROW_AXIS = ['ne', 'sw'];
    const COL_AXIS = ['nw', 'se'];

    // Unrotated (mapRotation 0): the real isoToScreen formula.
    global.isoToScreen = (col, row) => ({ x: (col - row) * 50, y: (col + row) * 25 });
    const southUnrotated = vessels.getVesselDockDirection(scene, 's', { row: 8.82, col: 5.5 });
    const eastUnrotated = vessels.getVesselDockDirection(scene, 'e', { row: 5.5, col: 8.82 });
    assert.ok(COL_AXIS.includes(southUnrotated), `side 's' expected nw/se, got ${southUnrotated}`);
    assert.ok(ROW_AXIS.includes(eastUnrotated), `side 'e' expected ne/sw, got ${eastUnrotated}`);

    // Rotated 90 (mapRotation 1): mirrors main.js's isoToScreen rotation
    // branch (vizCol = MAP_HEIGHT-1-row; vizRow = col). A static lookup
    // would still report the unrotated-axis direction here; the fix must not.
    global.isoToScreen = (col, row) => {
      const vizCol = global.MAP_HEIGHT - 1 - row;
      const vizRow = col;
      return { x: (vizCol - vizRow) * 50, y: (vizCol + vizRow) * 25 };
    };
    const southRotated = vessels.getVesselDockDirection(scene, 's', { row: 8.82, col: 5.5 });
    const eastRotated = vessels.getVesselDockDirection(scene, 'e', { row: 5.5, col: 8.82 });
    // After a 90 rotation, the axis that was column-aligned becomes
    // row-aligned and vice versa - the direction set each side reports
    // must swap accordingly.
    assert.ok(ROW_AXIS.includes(southRotated), `side 's' under rotation expected ne/sw, got ${southRotated}`);
    assert.ok(COL_AXIS.includes(eastRotated), `side 'e' under rotation expected nw/se, got ${eastRotated}`);
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('ocean routing reaches off-view map-edge water but rejects enclosed lakes', () => {
  const water = 1;
  const land = 0;
  const open = Array.from({ length: 9 }, () => Array(9).fill(land));
  for (let col = 0; col <= 5; col++) open[4][col] = water;
  const route = vessels.findOceanRoute(open, { row: 4, col: 5 }, water, (_row, col) => col <= 1);
  assert.ok(route);
  assert.deepEqual(route[0], { row: 4, col: 5 });
  assert.equal(route.at(-1).col <= 1, true);
  route.forEach(({ row, col }) => assert.equal(open[row][col], water));

  const enclosed = Array.from({ length: 9 }, () => Array(9).fill(land));
  for (let col = 3; col <= 5; col++) enclosed[4][col] = water;
  assert.equal(vessels.findOceanRoute(enclosed, { row: 4, col: 4 }, water, () => true), null);
});

test('track metrics preserve endpoints and detect nearby route conflicts', () => {
  const simplified = vessels.simplifyVesselTrack([
    { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 2 },
  ]);
  assert.deepEqual(simplified, [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 2 }]);
  const waterMap = Array.from({ length: 5 }, () => Array(5).fill(1));
  const rounded = vessels.roundVesselWaterTrack(simplified, waterMap, 1);
  assert.ok(rounded.length > simplified.length);
  rounded.forEach(({ row, col }) => assert.equal(waterMap[Math.round(row)]?.[Math.round(col)], 1));
  const track = vessels.buildVesselTrackMetrics(simplified);
  assert.equal(track.total, 3);
  assert.deepEqual(vessels.evaluateVesselLogicalTrack(track, 0), { row: 0, col: 0 });
  assert.deepEqual(vessels.evaluateVesselLogicalTrack(track, 3), { row: 1, col: 2 });
  assert.equal(vessels.vesselTracksConflict(
    track, vessels.buildVesselTrackMetrics([{ row: 2, col: 0 }, { row: 2, col: 2 }]), 3,
  ), true);
  assert.equal(vessels.vesselTracksConflict(
    track, vessels.buildVesselTrackMetrics([{ row: 10, col: 10 }, { row: 12, col: 10 }]), 3,
  ), false);
});

// Redesigned from the stashed prototype: that version checked points.at(-1)
// (the near-berth end) for view membership, which is unrelated to why the
// cache exists - the point that must stay off-screen is where a *new* ship
// would first appear (points[0], the open-water exit the Dijkstra search
// found), so a newly spawned ship never visibly pops in mid-screen.
test('cached port route is reused while its spawn point stays off-screen, recomputed once it scrolls into view', () => {
  const originalGlobals = Object.fromEntries([
    'isoToScreen', 'TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET',
  ].map((key) => [key, global[key]]));
  try {
    global.isoToScreen = (col, row) => ({ x: col * 70, y: row * 35 });
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    const scene = { offsetX: 0, offsetY: 0 };
    const route = { points: [{ row: 20, col: 20 }, { row: 0, col: 0 }] };
    const portState = { route };
    // A broken portEntry (null) stands in for "findVesselShipRoute got
    // called" - that function dereferences portEntry.record and throws
    // immediately, so a thrown error proves a real recompute was attempted
    // while a clean return proves the cache was reused instead.
    const offScreenRect = { x: 1000, y: 500, width: 100, height: 100 };
    const cached = vessels.getVesselPortRoute(scene, portState, null, offScreenRect);
    assert.equal(cached, route);
    assert.equal(portState.route, route);

    const onScreenRect = { x: -5000, y: -5000, width: 10000, height: 10000 };
    assert.throws(() => vessels.getVesselPortRoute(scene, portState, null, onScreenRect));
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('vessel module is wired into Phaser lifecycle and remains visual-only', () => {
  const html = source('index.html');
  const main = source('main.js');
  const moduleSource = source('vessel-visuals.js');
  assert.match(html, /traffic-visuals\.js[\s\S]*vessel-visuals\.js[\s\S]*main\.js/);
  assert.match(main, /setupVesselVisuals\(this\)/);
  assert.match(main, /updateVesselVisuals\.call\(this, time, delta\)/);
  assert.match(main, /clearVesselVisuals\(scene\)/);
  assert.match(main, /invalidateVesselVisualView\(this, true\)/);
  assert.doesNotMatch(moduleSource, /monthlyIncome|monthlyExpenses|tourismRevenue|industrialDemand|queueCityChangeAutosave/);
});

test('runtime update only starts work for a container port near the camera view', () => {
  const originalGlobals = Object.fromEntries([
    'city', 'buildingData', 'mapData', 'WATER', 'isoToScreen', 'simPaused',
    'simSpeedMul', 'isTerrainCreatorMode', 'TILE_WIDTH', 'TILE_HEIGHT',
    'TILE_IMAGE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET', 'getHarborRecordWaterSide',
  ].map((key) => [key, global[key]]));
  const createdSprites = [];
  const makeSprite = (overrides = {}) => ({
    x: 0, y: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5, depth: 200000, active: true,
    texture: { key: '' },
    setOrigin() { return this; },
    setScale(value) { this.scaleX = value; this.scaleY = value; return this; },
    setMask() { return this; },
    setDepth(value) { this.depth = value; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setTexture(key) { this.texture.key = key; return this; },
    destroy() { this.active = false; },
    ...overrides,
  });
  const makeScene = (portSprite) => ({
    offsetX: 0,
    offsetY: 0,
    worldMask: {},
    cameras: { main: { zoom: 1, width: 800, height: 600, scrollX: 0, scrollY: 0, originX: 0, originY: 0 } },
    scene: { isVisible: () => true },
    textures: { exists: () => true },
    buildingSprites: new Map([['5:5', portSprite]]),
    add: { image: (x, y, textureKey) => {
      const sprite = makeSprite({ x, y });
      sprite.texture.key = textureKey;
      createdSprites.push(sprite);
      return sprite;
    } },
  });
  try {
    global.city = { weather: { typhoonStage: 'none' } };
    global.WATER = 1;
    global.simPaused = false;
    global.simSpeedMul = 1;
    global.isTerrainCreatorMode = false;
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.isoToScreen = (col, row) => ({ x: col * 70, y: row * 35 });
    global.getHarborRecordWaterSide = (row, col, record) => record?.harborWaterSide || '';
    global.mapData = Array.from({ length: 15 }, () => Array(15).fill(0));
    for (let row = 5; row <= 8; row++) {
      for (let col = 9; col < 15; col++) global.mapData[row][col] = 1;
    }
    global.buildingData = {
      '5:5': { type: 'container_port', footprintCols: 4, footprintRows: 4, harborWaterSide: 'e' },
    };

    // Port sprite far outside the camera - nothing should be created.
    const offScreenScene = makeScene(makeSprite({ x: 50000, y: 50000 }));
    const offScreenState = vessels.setupVesselVisuals(offScreenScene);
    offScreenState.portStates.set('5:5', { cooldownMs: 0, event: null });
    vessels.updateVesselVisuals.call(offScreenScene, 0, 16);
    assert.equal(createdSprites.length, 0, 'an off-screen port must not spawn a vessel or load textures');

    // Same port, now inside the camera view - a vessel should spawn.
    const onScreenScene = makeScene(makeSprite({ x: 500, y: 300 }));
    const state = vessels.setupVesselVisuals(onScreenScene);
    state.portStates.set('5:5', { cooldownMs: 0, event: null });
    vessels.updateVesselVisuals.call(onScreenScene, 0, 16);
    assert.ok(state.portStates.get('5:5').event, 'an on-screen, off-cooldown port should spawn a vessel');
    assert.equal(createdSprites.length, 1);
    vessels.clearVesselVisuals(onScreenScene);
    assert.equal(state.portStates.size, 0);
    assert.ok(createdSprites.every((sprite) => sprite.active === false));
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('desktop release pipeline discovers vessel PNG sources without an allowlist', () => {
  const prepare = source('scripts/prepare-release-assets.js');
  const optimize = source('scripts/optimize-model-assets.js');
  assert.match(prepare, /const SOURCE_ROOT = path\.join\(ROOT, 'Models'\)/);
  assert.match(optimize, /Models', 'vessels'/);
  assert.ok(fs.existsSync(path.join(ROOT, 'Models/vessels')));
  assert.ok(fs.readdirSync(path.join(ROOT, 'Models/vessels')).some((name) => name.endsWith('.png')));
});
