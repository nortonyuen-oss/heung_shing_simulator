const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const vesselRouteMetadata = require('../vessel-route-metadata.js');
const vessels = require('../vessel-visuals.js');

function assertClose(actual, expected, message = '') {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${message} expected ${expected}, got ${actual}`);
}

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

test('vessel dock point uses the recorded visual anchor for every quay direction', () => {
  const originalGlobals = Object.fromEntries(['mapRotation', 'rotateDirection'].map((key) => [key, global[key]]));
  global.mapRotation = 0;
  global.rotateDirection = (direction, steps) => {
    const order = ['n', 'e', 's', 'w'];
    const index = order.indexOf(direction);
    return order[(index + ((steps % 4) + 4)) % 4];
  };
  try {
    const portEntry = { row: 4, col: 4, record: { footprintCols: 4, footprintRows: 4 } };
    const north = vessels.getVesselDockPoint(portEntry, 'n', { offset: 1, center: { row: 3, col: 5 } });
    assertClose(north.row, 2.1602, 'north/ur row');
    assertClose(north.col, 4.4316, 'north/ur col');

    const west = vessels.getVesselDockPoint(portEntry, 'w', { offset: 1, center: { row: 5, col: 3 } });
    assertClose(west.row, 4.6245, 'west/ul row');
    assertClose(west.col, 2.1058, 'west/ul col');

    const south = vessels.getVesselDockPoint(portEntry, 's', { offset: 1, center: { row: 8, col: 5 } });
    assertClose(south.row, 7.266, 'south/ll row');
    assertClose(south.col, 4.6493, 'south/ll col');

    const east = vessels.getVesselDockPoint(portEntry, 'e', { offset: 1, center: { row: 5, col: 8 } });
    assertClose(east.row, 4.7927, 'east/lr row');
    assertClose(east.col, 7.1424, 'east/lr col');

    const bufferedNorth = vessels.getVesselDockPoint(portEntry, 'n', { offset: 2, center: { row: 2, col: 5 } });
    assertClose(bufferedNorth.row, 1.1602, 'buffered north row');
    assertClose(bufferedNorth.col, 4.4316, 'buffered north col');
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('route metadata preserves all four recorded quay-relative anchors exactly', () => {
  assert.equal(vesselRouteMetadata.calibrationId, 'vessel-berth-2026-08-01-v1');
  assert.deepEqual(vesselRouteMetadata.berthAnchorsByVisualVariant, {
    ll: { alongFromQuayCenterTiles: 0.8507, normalFromQuayTiles: 0.266 },
    lr: { alongFromQuayCenterTiles: -0.7073, normalFromQuayTiles: 0.1424 },
    ul: { alongFromQuayCenterTiles: 0.8755, normalFromQuayTiles: 1.8942 },
    ur: { alongFromQuayCenterTiles: -1.0684, normalFromQuayTiles: 1.8398 },
  });
});

test('final inbound and first outbound berth legs are parallel to the quay', () => {
  const dockBySide = {
    n: { row: 2, col: 8 },
    s: { row: 9, col: 8 },
    w: { row: 8, col: 2 },
    e: { row: 8, col: 9 },
  };
  Object.entries(dockBySide).forEach(([side, dock]) => {
    const approach = vessels.getVesselParallelApproachPoint(side, dock);
    if (side === 'n') {
      assert.equal(approach.row, dock.row, side);
      assert.equal(dock.col - approach.col, 1, side);
    } else if (side === 'e') {
      assert.equal(approach.col, dock.col, side);
      assert.equal(dock.row - approach.row, 1, side);
    } else if (side === 's') {
      assert.equal(approach.row, dock.row, side);
      assert.equal(approach.col - dock.col, 1, side);
    } else {
      assert.equal(approach.col, dock.col, side);
      assert.equal(approach.row - dock.row, 1, side);
    }
  });
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

test('the same harbor artwork keeps the same calibrated vessel facing on every logical side', () => {
  const keys = [
    'isoToScreen', 'mapRotation', 'TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT',
    'BUILDING_SURFACE_Y_OFFSET', 'MAP_HEIGHT', 'MAP_WIDTH',
  ];
  const originals = Object.fromEntries(keys.map((key) => [key, global[key]]));
  try {
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.MAP_HEIGHT = 256;
    global.MAP_WIDTH = 256;
    global.isoToScreen = (col, row) => {
      let visualCol = col;
      let visualRow = row;
      if (global.mapRotation === 1) {
        visualCol = global.MAP_HEIGHT - 1 - row;
        visualRow = col;
      } else if (global.mapRotation === 2) {
        visualCol = global.MAP_WIDTH - 1 - col;
        visualRow = global.MAP_HEIGHT - 1 - row;
      } else if (global.mapRotation === 3) {
        visualCol = row;
        visualRow = global.MAP_WIDTH - 1 - col;
      }
      return { x: (visualCol - visualRow) * 50, y: (visualCol + visualRow) * 25 };
    };
    const sides = ['n', 'e', 's', 'w'];
    const scene = { offsetX: 0, offsetY: 0 };
    sides.forEach((visualSide, visualIndex) => {
      const facings = sides.map((logicalSide, logicalIndex) => {
        global.mapRotation = (visualIndex - logicalIndex + 4) % 4;
        return vessels.getVesselDockDirection(scene, logicalSide, { row: 10, col: 20 });
      });
      assert.equal(new Set(facings).size, 1, `${visualSide}: ${facings.join(', ')}`);
    });
  } finally {
    Object.entries(originals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('berth calibration measures centerline and outward normal for all four quay sides', () => {
  const originalBuildingData = global.buildingData;
  global.buildingData = {
    '10:20': { type: 'container_port', footprintRows: 4, footprintCols: 4 },
  };
  try {
    const expected = {
      n: { logical: { row: 8.75, col: 21.75 }, along: 0.25, normal: 1.25 },
      s: { logical: { row: 14.25, col: 21.25 }, along: 0.25, normal: 1.25 },
      w: { logical: { row: 11.75, col: 18.5 }, along: -0.25, normal: 1.5 },
      e: { logical: { row: 11.25, col: 24.5 }, along: -0.25, normal: 1.5 },
    };
    Object.entries(expected).forEach(([side, sample]) => {
      const event = {
        portId: '10:20',
        route: { side, berth: sample.logical },
      };
      const measurement = vessels.getVesselBerthCalibrationMeasurement(event, sample.logical);
      assert.equal(measurement.quayCenterRow, 11.5, side);
      assert.equal(measurement.quayCenterCol, 21.5, side);
      assert.equal(measurement.alongFromQuayCenterTiles, sample.along, side);
      assert.equal(measurement.normalFromQuayTiles, sample.normal, side);
      assert.equal(measurement.alongDeltaTiles, 0, side);
      assert.equal(measurement.normalDeltaTiles, 0, side);
    });
  } finally {
    if (originalBuildingData === undefined) delete global.buildingData;
    else global.buildingData = originalBuildingData;
  }
});

test('vessel calibration adapter exposes the docked sprite center only while paused', () => {
  const keys = [
    'syncVisualRouteCalibrationTarget', 'simPaused', 'mapRotation', 'rotateDirection',
    'isoToScreen', 'TILE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET', 'getWorldDepth',
  ];
  const originals = Object.fromEntries(keys.map((key) => [key, global[key]]));
  let descriptor;
  try {
    global.syncVisualRouteCalibrationTarget = (_scene, target) => {
      descriptor = target;
      return target.eligible && target.paused;
    };
    global.simPaused = true;
    global.mapRotation = 0;
    global.rotateDirection = (side) => side;
    global.TILE_HEIGHT = 50;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.isoToScreen = (col, row) => ({ x: col * 50, y: row * 25 });
    global.getWorldDepth = (_kind, y) => y + 1000;
    const sprite = {
      depth: 0,
      setDepth(value) { this.depth = value; return this; },
    };
    const event = {
      id: 'vessel_9',
      portId: '10:20',
      phase: 'cargo_exchange',
      sprite,
      portSprite: { x: 500, y: 250 },
      route: { side: 'n', berth: { row: 8.5, col: 21.5 } },
    };
    const scene = { offsetX: 7, offsetY: 11 };

    assert.equal(vessels.syncVesselBerthCalibration(scene, event), true);
    assert.equal(descriptor.kind, 'vessel-berth');
    assert.equal(descriptor.slot, 'ur');
    assert.deepEqual(descriptor.slots, ['ll', 'lr', 'ul', 'ur']);
    assert.equal(descriptor.sprite, sprite);
    assert.equal(descriptor.eligible, true);
    assert.equal(descriptor.paused, true);
    assert.deepEqual(descriptor.baselineWorld, { x: 1082, y: 148.5 });

    descriptor.onMove(1100, 160, { row: 9, col: 22 });
    assert.equal(sprite.depth, 1250);
    assert.deepEqual(event.lastWorld, { x: 1100, y: 160, depthY: 250 });
    assert.deepEqual(event.lastLogical, { row: 9, col: 22 });

    global.simPaused = false;
    assert.equal(vessels.syncVesselBerthCalibration(scene, event), false);
    assert.equal(descriptor.paused, false);
  } finally {
    Object.entries(originals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('paused berth calibration owns the sprite position so the route cannot snap a drag back', () => {
  const keys = [
    'buildingData', 'syncVisualRouteCalibrationTarget', 'simPaused', 'mapRotation',
    'rotateDirection', 'isoToScreen', 'TILE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET',
  ];
  const originals = Object.fromEntries(keys.map((key) => [key, global[key]]));
  let positionWrites = 0;
  try {
    global.buildingData = { '4:5': { type: 'container_port', footprintRows: 4, footprintCols: 4 } };
    global.syncVisualRouteCalibrationTarget = () => true;
    global.simPaused = true;
    global.mapRotation = 0;
    global.rotateDirection = (side) => side;
    global.TILE_HEIGHT = 50;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.isoToScreen = (col, row) => ({ x: col * 50, y: row * 25 });
    const event = {
      id: 'vessel_10',
      portId: '4:5',
      phase: 'cargo_exchange',
      sprite: { setPosition: () => { positionWrites++; } },
      portSprite: { active: true },
      route: { side: 's', berth: { row: 8.8, col: 6.5 } },
      sound: null,
    };
    const portState = { event, cooldownMs: 0 };
    vessels.updateVesselEvent({ offsetX: 0, offsetY: 0 }, {}, portState, 0, () => 0.5);
    assert.equal(positionWrites, 0);
    assert.equal(portState.event, event);
  } finally {
    Object.entries(originals).forEach(([key, value]) => {
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
    const route = {
      routeMetadataId: vessels.getVesselRouteMetadataId(),
      points: [{ row: 20, col: 20 }, { row: 0, col: 0 }],
    };
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
  assert.match(html, /traffic-visuals\.js[\s\S]*vessel-route-metadata\.js[\s\S]*visual-route-calibrator\.js[\s\S]*vessel-visuals\.js[\s\S]*main\.js/);
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
    const spawnedRoute = state.portStates.get('5:5').event.route;
    assert.equal(spawnedRoute.routeMetadataId, vesselRouteMetadata.calibrationId);
    assert.equal(spawnedRoute.berthAnchor.calibrated, true);
    const parallelEntry = spawnedRoute.inboundTrack.points.at(-2);
    assert.equal(parallelEntry.col, spawnedRoute.berth.col);
    assert.equal(spawnedRoute.berth.row - parallelEntry.row, 1);
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
