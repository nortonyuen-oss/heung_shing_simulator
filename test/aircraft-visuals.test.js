const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const vessels = require('../vessel-visuals.js');
const aircraftRouteMetadata = require('../aircraft-route-metadata.js');

// aircraft-visuals.js deliberately reuses a handful of vessel-visuals.js
// helpers that are generic camera/track math despite their name (see the
// plan's rationale) rather than duplicating them. In the browser this works
// for free - every script shares one global scope - but a plain `require()`
// here gives each file its own module scope, so the reused names have to be
// installed as globals first, exactly like aircraft-visuals.js finds them at
// runtime via <script> tags.
['getVesselCameraRect', 'vesselPointInRect', 'buildVesselTrackMetrics', 'evaluateVesselLogicalTrack', 'getVesselTextureDirection']
  .forEach((name) => { global[name] = vessels[name]; });

const aircraft = require('../aircraft-visuals.js');

function source(fileName) {
  return fs.readFileSync(path.join(ROOT, fileName), 'utf8');
}

test('aircraft sound registry ships playable landing and takeoff effects', () => {
  const main = source('main.js');
  assert.match(main, /key: 'aircraft_landing'.*file: 'Sounds\/aircraftLanding\.m4a'/);
  assert.match(main, /key: 'aircraft_takeoff'.*file: 'Sounds\/aircraftTakeoff\.m4a'/);
  ['Sounds/aircraftLanding.m4a', 'Sounds/aircraftTakeoff.m4a'].forEach((file) => {
    const filePath = path.join(ROOT, file);
    assert.ok(fs.existsSync(filePath), file);
    assert.ok(fs.statSync(filePath).size > 0, file);
  });
  assert.equal(aircraft.AIRCRAFT_AUDIO_CONFIG.landing.key, 'aircraft_landing');
  assert.equal(aircraft.AIRCRAFT_AUDIO_CONFIG.takeoff.key, 'aircraft_takeoff');
});

test('landing/takeoff sounds fire exactly at the two roll phase transitions', () => {
  const moduleSource = source('aircraft-visuals.js');
  assert.match(
    moduleSource,
    /phase = 'landingRoll'[\s\S]*?startAircraftEventSound\(scene, event, AIRCRAFT_AUDIO_CONFIG\.landing\)/,
  );
  assert.match(
    moduleSource,
    /phase = 'takeoff'[\s\S]*?startAircraftEventSound\(scene, event, AIRCRAFT_AUDIO_CONFIG\.takeoff\)/,
  );
});

test('aircraft sound uses proximity mixing and follows simulation pause', () => {
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
      main: { zoom: 1, width: 1000, height: 800, scrollX: 0, scrollY: 0, originX: 0.5, originY: 0.5 },
    },
    cache: { audio: { has: () => true } },
    sound: { locked: false, add: () => sound },
  };
  const event = { lastWorld: { x: 500, y: 400 }, sound: null };
  try {
    global.getStoredAmbientVolume = () => 0.5;
    global.simPaused = false;
    assert.equal(aircraft.startAircraftEventSound(scene, event, aircraft.AIRCRAFT_AUDIO_CONFIG.landing), true);
    assert.equal(calls[0], 'play');
    assert.equal(aircraft.getAircraftEventAudioVolume(scene, event.lastWorld, 0.55), 0.275);
    global.simPaused = true;
    aircraft.updateAircraftEventSound(scene, event);
    assert.ok(calls.includes('pause'));
    global.simPaused = false;
    aircraft.updateAircraftEventSound(scene, event);
    assert.ok(calls.includes('resume'));
    aircraft.stopAircraftEventSound(event);
    assert.equal(event.sound, null);
    assert.ok(calls.includes('stop') && calls.includes('destroy'));
  } finally {
    if (originalAmbient === undefined) delete global.getStoredAmbientVolume;
    else global.getStoredAmbientVolume = originalAmbient;
    if (originalPaused === undefined) delete global.simPaused;
    else global.simPaused = originalPaused;
  }
});

test('aircraft registry has both liveries in every direction, 256x256 with alpha', async () => {
  assert.deepEqual(Object.keys(aircraft.AIRCRAFT_ASSET_REGISTRY), ['UO', 'cathy']);
  for (const livery of aircraft.AIRCRAFT_LIVERIES) {
    const directions = aircraft.AIRCRAFT_ASSET_REGISTRY[livery];
    assert.deepEqual(Object.keys(directions), [...aircraft.AIRCRAFT_DIRECTIONS]);
    for (const direction of aircraft.AIRCRAFT_DIRECTIONS) {
      const filePath = path.join(ROOT, directions[direction].path);
      assert.ok(fs.existsSync(filePath), directions[direction].path);
      const metadata = await sharp(filePath).metadata();
      assert.deepEqual([metadata.width, metadata.height], [256, 256]);
      assert.equal(metadata.hasAlpha, true);
    }
  }
});

test('aircraft texture loads are cache-busted so replaced source art is never served stale', () => {
  // Norton periodically re-exports the aircraft PNGs in place (same
  // filename, new pixels) - see the airport model's own cacheVersion in
  // constants.js for the identical concern. Without a version query param, a
  // cached file:// hit could keep showing the previous artwork after such an
  // update.
  const calls = [];
  const scene = {
    textures: { exists: () => false },
    load: {
      isLoading: () => false,
      image: (key, url) => calls.push({ key, url }),
      once: () => {},
      start: () => {},
    },
  };
  aircraft.requestAircraftBundle(scene);
  assert.equal(calls.length, 8, 'both liveries, all 4 directions');
  calls.forEach(({ url }) => {
    assert.match(url, new RegExp(`[?&]v=${aircraft.AIRCRAFT_ASSET_CACHE_VERSION}(&|$)`));
  });
});

test('only signal 8 or above suspends new aircraft activity', () => {
  ['none', 'signal1', 'signal3'].forEach((typhoonStage) => {
    assert.equal(aircraft.isAircraftSevereWeather({ typhoonStage }), false);
  });
  ['signal8', 'signal9', 'signal10'].forEach((typhoonStage) => {
    assert.equal(aircraft.isAircraftSevereWeather({ typhoonStage }), true);
  });
});

test('parked aircraft face the gate direction chosen in the calibrator, not whichever way they arrived', () => {
  assert.equal(aircraft.getAircraftGateFacingDirection('gate2', 'sw'), aircraftRouteMetadata.pointsByKey.gate2.direction);
  // An unknown gate key (or a metadata build with no calibrated facing) must
  // fall back to whatever direction the caller passes, not throw or return
  // an invalid value.
  assert.equal(aircraft.getAircraftGateFacingDirection('not-a-real-gate', 'sw'), 'sw');
});

test('a calibrated point tracks the airport\'s CURRENT screen position, offset by a fixed-rotation pixel delta', () => {
  const originalGlobals = Object.fromEntries(['isoToScreen', 'TILE_WIDTH', 'TILE_HEIGHT'].map((key) => [key, global[key]]));
  try {
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    const anchor = { row: 197, col: 110 };
    const scene = { offsetX: 0, offsetY: 0 };

    // The anchor's own ground point must always land exactly on wherever
    // isoToScreen currently reports the airport tile - zero offset, whatever
    // the live position turns out to be, since dRow/dCol are both 0.
    global.isoToScreen = (col, row) => ({ x: col * 91 + 17, y: row * 43 - 5 });
    const anchorScreen = global.isoToScreen(anchor.col, anchor.row);
    const anchorPoint = aircraft.getAircraftGroundPoint(scene, anchor, anchor.row, anchor.col);
    assertClose(anchorPoint.x - scene.offsetX, anchorScreen.x);

    // A non-anchor point's OFFSET from the anchor must be identical
    // regardless of where isoToScreen says the anchor itself now lives -
    // that's what "glued to the unrotated art" means. Simulate two very
    // different live positions (standing in for two different live
    // mapRotation values) and confirm the delta doesn't change.
    const target = { row: anchor.row + 3, col: anchor.col + 5 };
    global.isoToScreen = (col, row) => ({ x: col * 50 - row * 50, y: col * 25 + row * 25 });
    const anchorA = aircraft.getAircraftGroundPoint(scene, anchor, anchor.row, anchor.col);
    const pointA = aircraft.getAircraftGroundPoint(scene, anchor, target.row, target.col);
    global.isoToScreen = (col, row) => ({ x: col * 50 - row * 50 + 9999, y: col * 25 + row * 25 - 4321 });
    const anchorB = aircraft.getAircraftGroundPoint(scene, anchor, anchor.row, anchor.col);
    const pointB = aircraft.getAircraftGroundPoint(scene, anchor, target.row, target.col);
    assertClose(pointA.x - anchorA.x, pointB.x - anchorB.x, 'offset from anchor must not depend on the anchor\'s live position');
    assertClose(pointA.y - anchorA.y, pointB.y - anchorB.y, 'offset from anchor must not depend on the anchor\'s live position');

    // And that offset genuinely comes from the calibration's fixed rotation
    // (not a no-op) - different fixed rotations give different deltas for
    // the very same (dRow, dCol).
    assert.notDeepEqual(aircraft.getAircraftLocalOffset(3, 5, 0), aircraft.getAircraftLocalOffset(3, 5, 3));
    // ...but it never depends on the anchor's absolute row/col, only the offset.
    assert.deepEqual(aircraft.getAircraftLocalOffset(3, 5, 1), aircraft.getAircraftLocalOffset(3, 5, 1));
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('a calibrated point tracks the REAL multi-tile building anchor (getBuildingAnchor\'s rotation-dependent corner), not the stored top-left tile, at every live rotation', () => {
  // Regression test: 一旋轉地圖所有飛機都亂曬，只有calibration rotation
  // (East)正常 - getBuildingAnchor (main.js) does NOT pin a multi-tile
  // building sprite to its stored top-left tile. It picks whichever
  // footprint corner is visually lowest, and WHICH corner depends on live
  // rotation (rot0->bottom-right, rot1->top-right, rot2->top-left,
  // rot3->bottom-left - see that function's own comment). The old formula
  // assumed "the anchor" meant literally (anchor.row, anchor.col) at every
  // rotation, which only coincidentally matches getBuildingAnchor's own
  // choice at rotation 2, and (by construction of the fixed/live
  // self-cancelling math - see the test above) always LOOKED right AT the
  // calibration rotation regardless of this bug - masking it completely
  // until the player actually rotated away from East.
  const originalGlobals = Object.fromEntries(
    ['isoToScreen', 'getBuildingAnchor', 'TILE_WIDTH', 'TILE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET', 'ORIGIN_X']
      .map((key) => [key, global[key]]),
  );
  const originalMetadata = global.AIRCRAFT_ROUTE_METADATA;
  try {
    const MAP_WIDTH = 256;
    const MAP_HEIGHT = 256;
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.BUILDING_SURFACE_Y_OFFSET = 32;
    global.ORIGIN_X = 12800;
    let liveRotation = 3;
    const realIsoToScreen = (col, row, rotation) => {
      let vizCol = col;
      let vizRow = row;
      if (rotation === 1) { vizCol = MAP_HEIGHT - 1 - row; vizRow = col; }
      else if (rotation === 2) { vizCol = MAP_WIDTH - 1 - col; vizRow = MAP_HEIGHT - 1 - row; }
      else if (rotation === 3) { vizCol = row; vizRow = MAP_WIDTH - 1 - col; }
      return { x: (vizCol - vizRow) * 50 + 12800, y: (vizCol + vizRow) * 25 };
    };
    global.isoToScreen = (col, row) => realIsoToScreen(col, row, liveRotation);
    // getBuildingAnchor's exact corner-selection logic (main.js).
    global.getBuildingAnchor = (row, col, footprintCols, footprintRows) => {
      let anchorRow;
      let anchorCol;
      switch (liveRotation) {
        case 1: anchorRow = row; anchorCol = col + footprintCols - 1; break;
        case 2: anchorRow = row; anchorCol = col; break;
        case 3: anchorRow = row + footprintRows - 1; anchorCol = col; break;
        default: anchorRow = row + footprintRows - 1; anchorCol = col + footprintCols - 1; break;
      }
      return realIsoToScreen(anchorCol, anchorRow, liveRotation);
    };
    global.AIRCRAFT_ROUTE_METADATA = { calibratedMapRotation: 3, pointsByKey: {} };

    const scene = { offsetX: 0, offsetY: 0 };
    const anchor = { row: 197, col: 110, footprintCols: 12, footprintRows: 12 };
    const surfaceOffset = 32 + 50 / 2;
    // The point at the calibration rotation's (3) own selected corner
    // (bottom-left: row+rows-1, col) has zero delta from that corner by
    // construction - its ground point must equal the REAL sprite anchor at
    // every live rotation, not just at rotation 3.
    const calibCornerRow = anchor.row + anchor.footprintRows - 1;
    const calibCornerCol = anchor.col;
    [0, 1, 2, 3].forEach((rotation) => {
      liveRotation = rotation;
      const realSpritePos = global.getBuildingAnchor(anchor.row, anchor.col, anchor.footprintCols, anchor.footprintRows);
      const ground = aircraft.getAircraftGroundPoint(scene, anchor, calibCornerRow, calibCornerCol);
      assertClose(ground.x, realSpritePos.x, `rotation ${rotation} x`);
      assertClose(ground.y, realSpritePos.y - surfaceOffset, `rotation ${rotation} y`);
    });
  } finally {
    global.AIRCRAFT_ROUTE_METADATA = originalMetadata;
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('rotating the map between flights keeps the next flight glued to the airport\'s new on-screen position', () => {
  // Regression test: 轉左角orientation就沒有飛機了 - after rotating, later
  // flights kept rendering at the airport's PRE-rotation screen spot (the
  // old isoToScreenAtFixedRotation re-derived a position assuming the
  // airport sprite never moved), landing them off in the wrong part of the
  // map or off-camera entirely - which read as "no more aircraft".
  const originalGlobals = Object.fromEntries([
    'isoToScreen', 'TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET',
    'buildingData', 'getWorldDepth', 'addToRenderLayer',
  ].map((key) => [key, global[key]]));
  try {
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.getWorldDepth = (layer, localDepth) => (layer === 'effect' ? 300000 : 200000) + (Number(localDepth) || 0);
    global.addToRenderLayer = (scene, child) => child;
    global.buildingData = { '197:110': { type: 'airport', footprintCols: 12, footprintRows: 12 } };

    const entry = { id: '197:110', row: 197, col: 110 };
    const scene = {
      offsetX: 0,
      offsetY: 0,
      worldMask: {},
      buildingSprites: new Map([[entry.id, { active: true }]]),
      textures: { exists: () => true },
      add: {
        image: (x, y) => ({
          x, y, texture: { key: '' },
          setOrigin() { return this; },
          setScale() { return this; },
          setMask() { return this; },
          setDepth(value) { this.depth = value; return this; },
          setPosition(px, py) { this.x = px; this.y = py; return this; },
          setTexture(key) { this.texture.key = key; return this; },
          destroy() { this.active = false; },
        }),
      },
    };
    const state = aircraft.getAircraftVisualState(scene);
    const airportState = { cooldownMs: 0, events: [] };
    const random = () => 0;

    global.isoToScreen = (col, row) => ({ x: (col - row) * 50, y: (col + row) * 25 });
    assert.equal(aircraft.spawnAircraft(scene, state, airportState, entry, 'gate1', random), true);
    const firstFlightGroundX = airportState.events[0].sprite.x;
    flyAircraftEventToDespawn(airportState.events[0], (event, ms) => aircraft.updateAircraftEvent(scene, event, ms, false, random));
    airportState.events.length = 0;

    // The player rotates the map: main.js's positionAllTiles now reports a
    // very different live screen position for the same logical airport tile.
    global.isoToScreen = (col, row) => ({ x: (col - row) * 50 + 5000, y: (col + row) * 25 - 3000 });
    assert.equal(aircraft.spawnAircraft(scene, state, airportState, entry, 'gate1', random), true);
    const secondFlightGroundX = airportState.events[0].sprite.x;

    assert.ok(
      Math.abs((secondFlightGroundX - firstFlightGroundX) - 5000) < 1,
      `expected the second flight to track the airport's new position (shift ~5000px), got a shift of ${secondFlightGroundX - firstFlightGroundX}`,
    );
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('the aircraft always renders in front of the (much larger) airport sprite, in every phase', () => {
  const originalGlobals = Object.fromEntries([
    'isoToScreen', 'TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET', 'getWorldDepth',
  ].map((key) => [key, global[key]]));
  try {
    global.isoToScreen = (col, row) => ({ x: col * 70, y: row * 35 });
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    // A deliberately huge 'object'-layer depth, like a real 12x12 airport
    // sprite anchored deep in the map would have - if setAircraftVisual ever
    // falls back to plain world-Y sorting on the ground, this depth would
    // beat it and reproduce the reported bug (plane tucked under the sprite).
    global.getWorldDepth = (layer, localDepth) => (layer === 'effect' ? 300000 : 200000) + (Number(localDepth) || 0);
    const scene = { offsetX: 0, offsetY: 0 };
    const airportSprite = { depth: 5_000_000 };
    const makeEvent = () => ({
      airportSprite,
      anchor: { row: 197, col: 110 },
      direction: 'ne',
      sprite: {
        texture: { key: '' },
        setTexture(key) { this.texture.key = key; },
        setPosition() {},
        setDepth(value) { this.depth = value; },
      },
      lastWorld: null,
      lastLogical: null,
    });

    const grounded = makeEvent();
    aircraft.setAircraftVisual(scene, grounded, { row: 200, col: 110 }, 0);
    assert.ok(grounded.sprite.depth > airportSprite.depth, 'grounded (taxi/roll/parked) must render in front of the airport sprite');

    const flying = makeEvent();
    aircraft.setAircraftVisual(scene, flying, { row: 200, col: 110 }, 150);
    assert.ok(flying.sprite.depth > airportSprite.depth, 'airborne must also render in front of the airport sprite');
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('a sudden altitude change never flips the sprite\'s heading - heading follows the ground track only, not the altitude offset', () => {
  // Regression test: "點解T0方向OK，但係T1開始轉左90度" - the departing
  // phase's altitude now rises steepest right at T1/liftoff (the new
  // mountain-slope easing). setAircraftVisual used to derive heading from
  // the altitude-inclusive screen position, so that sudden vertical pull
  // could dominate the delta and snap the sprite to the wrong diagonal for
  // a moment, reading as an unexpected 90° turn right at liftoff.
  const originalGlobals = Object.fromEntries([
    'isoToScreen', 'TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET', 'getWorldDepth',
  ].map((key) => [key, global[key]]));
  try {
    global.isoToScreen = (col, row) => ({ x: col * 70, y: row * 35 });
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.getWorldDepth = () => 0;
    const scene = { offsetX: 0, offsetY: 0 };
    const event = {
      anchor: { row: 0, col: 0 },
      direction: null,
      sprite: {
        texture: { key: '' },
        setTexture(key) { this.texture.key = key; },
        setPosition() {},
        setDepth() {},
      },
      lastWorld: null,
      lastGround: null,
      lastLogical: null,
    };
    // Consistent ground-track direction of travel (row and col both
    // increasing each step) - altitude 0 establishes the baseline heading.
    aircraft.setAircraftVisual(scene, event, { row: 100, col: 110 }, 0);
    const baselineDirection = event.direction;
    assert.ok(baselineDirection, 'a heading must be established on the first call');
    // Same next ground step, but altitude jumps sharply - simulating the
    // steepest instant of the new near-liftoff climb curve.
    aircraft.setAircraftVisual(scene, event, { row: 101, col: 111 }, 150);
    assert.equal(event.direction, baselineDirection, 'a big altitude jump must not change the computed heading');
    aircraft.setAircraftVisual(scene, event, { row: 102, col: 112 }, 0);
    assert.equal(event.direction, baselineDirection, 'heading must stay consistent once back near the ground too');
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('the calibrated route metadata carries all 14 named points and drives the calibration id', () => {
  const keys = Object.keys(aircraftRouteMetadata.pointsByKey);
  assert.deepEqual(
    [...keys].sort(),
    [
      'approachSpawn', 'approachCurve', 'landStart', 'landEnd',
      'gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6',
      'takeoffStart', 'liftoff', 'departCurve', 'departureDespawn',
    ].sort(),
  );
  keys.forEach((key) => {
    assert.ok(Number.isFinite(aircraftRouteMetadata.pointsByKey[key].dRow), key);
    assert.ok(Number.isFinite(aircraftRouteMetadata.pointsByKey[key].dCol), key);
  });
  assert.equal(aircraft.getAircraftRouteMetadataId(), aircraftRouteMetadata.calibrationId);
});

test('altitude eases toward 0 at the ground and toward the peak away from it', () => {
  const peak = aircraft.AIRCRAFT_VISUAL_CONFIG.altitudePeakPixels;
  assert.equal(aircraft.evaluateAircraftAltitude(0, 'descend'), peak);
  assert.equal(aircraft.evaluateAircraftAltitude(1, 'descend'), 0);
  assert.equal(aircraft.evaluateAircraftAltitude(0, 'climb'), 0);
  assert.equal(aircraft.evaluateAircraftAltitude(1, 'climb'), peak);
  // Monotonic in both directions - no mid-flight bump/dip.
  let previous = aircraft.evaluateAircraftAltitude(0, 'descend');
  for (let t = 0.1; t <= 1; t += 0.1) {
    const value = aircraft.evaluateAircraftAltitude(t, 'descend');
    assert.ok(value <= previous + 1e-9, `descend altitude must not rise at t=${t}`);
    previous = value;
  }
});

test('altitude changes fastest near the ground and levels off far from it, like one side of a mountain slope', () => {
  // Norton's ask: reference y=1/tan(x)'s steep-near-zero/flat-elsewhere
  // shape ("類似山坡上升和下降") instead of a symmetric ease - climb should
  // be steepest right at liftoff (t=0, T1) and level off toward stable
  // altitude (t=1, T3); descend should be flattest far out (t=0, L0) and
  // steepen into the final dive toward touchdown (t=1, L2).
  const step = 0.001;
  const climbRateNearGround = aircraft.evaluateAircraftAltitude(step, 'climb') - aircraft.evaluateAircraftAltitude(0, 'climb');
  const climbRateFarFromGround = aircraft.evaluateAircraftAltitude(1, 'climb') - aircraft.evaluateAircraftAltitude(1 - step, 'climb');
  assert.ok(climbRateNearGround > climbRateFarFromGround, 'climb must gain altitude fastest right after liftoff, not right before leveling off');

  const descendRateFarFromGround = aircraft.evaluateAircraftAltitude(0, 'descend') - aircraft.evaluateAircraftAltitude(step, 'descend');
  const descendRateNearGround = aircraft.evaluateAircraftAltitude(1 - step, 'descend') - aircraft.evaluateAircraftAltitude(1, 'descend');
  assert.ok(descendRateNearGround > descendRateFarFromGround, 'descend must lose altitude fastest right before touchdown, not right after spawning');
});

test('the quadratic Bezier passes through its endpoints and only actually bends when the control point is off the line', () => {
  const p0 = { row: 0, col: 0 };
  const p1 = { row: 10, col: 0 };
  assert.deepEqual(aircraft.evaluateQuadraticBezierPoint(p0, { row: 3, col: 7 }, p1, 0), p0);
  assert.deepEqual(aircraft.evaluateQuadraticBezierPoint(p0, { row: 3, col: 7 }, p1, 1), p1);

  // A control point exactly on the p0-p1 line degrades to a straight line -
  // this is the "unmodified" default every calibrated route ships with
  // until someone drags the control point off-line.
  const onLineMidpoint = aircraft.evaluateQuadraticBezierPoint(p0, { row: 5, col: 0 }, p1, 0.5);
  assert.deepEqual(onLineMidpoint, { row: 5, col: 0 });

  // Once dragged off-line, the curve genuinely bends away from the straight
  // path - the midpoint is no longer the straight-line midpoint.
  const bentMidpoint = aircraft.evaluateQuadraticBezierPoint(p0, { row: 5, col: 8 }, p1, 0.5);
  assert.notEqual(bentMidpoint.col, 0, 'an off-line control point must actually curve the path');
});

test('the curve genuinely passes through the calibrated point at its midpoint, MS-Paint-curve-tool style', () => {
  // Regression test: the calibrated point used to be fed straight in as the
  // raw Bezier control point, which only pulls the curve HALFWAY toward
  // itself - dragging the marker somewhere and having the actual flight
  // path visibly undershoot it is what "弧線既設定不正確" was about.
  const p0 = { row: 0, col: 0 };
  const p1 = { row: 10, col: 0 };
  const desiredMidpoint = { row: 5, col: 8 }; // well off the straight p0-p1 line
  const points = aircraft.buildAircraftCurvePoints(p0, desiredMidpoint, p1, 16);
  const middleSample = points[8]; // t = 8/16 = 0.5
  assertClose(middleSample.row, desiredMidpoint.row);
  assertClose(middleSample.col, desiredMidpoint.col);

  // The raw control point is a different, overshot value - not the
  // calibrated point itself - which is exactly what makes the curve land on
  // the calibrated point instead of merely leaning toward it.
  const rawControl = aircraft.getAircraftBezierControlFromMidpoint(p0, desiredMidpoint, p1);
  assert.notDeepEqual(rawControl, desiredMidpoint);
});

test('a sampled curve is a dense polyline that still starts and ends exactly on the real endpoints', () => {
  const p0 = { row: 0, col: 0 };
  const control = { row: 5, col: 12 };
  const p1 = { row: 10, col: 0 };
  const points = aircraft.buildAircraftCurvePoints(p0, control, p1, 16);
  assert.equal(points.length, 17);
  assert.deepEqual(points[0], p0);
  assert.deepEqual(points.at(-1), p1);
});

test('the calibrated approachCurve/departCurve genuinely bend the flight path into a curve, not a straight line', () => {
  const entry = { row: 197, col: 110 };
  const route = aircraft.buildAircraftRoute(entry, 'gate1');
  // The shipped metadata's approachCurve/departCurve are off the straight
  // line by design (see aircraft-route-metadata.js) - the sampled track
  // should have far more than 1 segment.
  assert.ok(route.approachTrack.segments.length > 1, 'a curved approach must be sampled into multiple segments');
  assert.ok(route.departureTrack.segments.length > 1, 'a curved departure must be sampled into multiple segments');
});

test('every point in the L0-L3/T0-T3 arc is required - a route missing any one of them fails cleanly instead of guessing', () => {
  const entry = { row: 197, col: 110 };
  const originalMetadata = global.AIRCRAFT_ROUTE_METADATA;
  try {
    ['approachSpawn', 'approachCurve', 'landStart', 'landEnd', 'takeoffStart', 'liftoff', 'departCurve', 'departureDespawn'].forEach((missingKey) => {
      const incomplete = JSON.parse(JSON.stringify(originalMetadata));
      delete incomplete.pointsByKey[missingKey];
      global.AIRCRAFT_ROUTE_METADATA = incomplete;
      assert.equal(aircraft.buildAircraftRoute(entry, 'gate1'), null, `missing ${missingKey} must fail cleanly, not throw or guess a position`);
    });
  } finally {
    global.AIRCRAFT_ROUTE_METADATA = originalMetadata;
  }
});

test('the ground track visits landStart, landEnd, the chosen gate, takeoffStart and liftoff in order', () => {
  const entry = { row: 197, col: 110 };
  const points = aircraft.getAircraftAbsolutePoints(entry);
  const route = aircraft.buildAircraftRoute(entry, 'gate2');
  assert.equal(route.gateKey, 'gate2');
  assert.deepEqual(route.groundTrack.points, [
    points.landStart, points.landEnd, points.gate2, points.takeoffStart, points.liftoff,
  ]);
  assertClose(route.landingRollDistance, route.groundTrack.segments[0].length);
  assertClose(route.taxiInDistance, route.landingRollDistance + route.groundTrack.segments[1].length);
  assertClose(route.taxiOutDistance, route.taxiInDistance + route.groundTrack.segments[2].length);
  assert.ok(route.taxiOutDistance < route.groundTrack.total);
});

function assertClose(actual, expected, message = '') {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message} expected ${expected}, got ${actual}`);
}

// Repeatedly steps a single event (via the caller's update closure, which
// pins in whatever runwayBusy/scene/random this test needs) until it
// despawns (step returns false), recording the phase sequence seen along
// the way. Throws if it never despawns, so a stuck state machine fails loud.
function flyAircraftEventToDespawn(event, step, ms = 500, maxTicks = 200000) {
  const phases = [event.phase];
  for (let i = 0; i < maxTicks; i++) {
    const keepAlive = step(event, ms);
    if (!keepAlive) return phases;
    if (phases.at(-1) !== event.phase) phases.push(event.phase);
  }
  throw new Error(`aircraft event did not despawn within ${maxTicks} ticks (stuck in phase '${event.phase}')`);
}

// Deterministic xorshift32 PRNG so a many-tick stochastic test is still
// reproducible - varies gate/livery/cooldown picks across spawns without
// relying on Math.random (which would make a failure unreproducible).
function makeSeededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s % 1_000_000) / 1_000_000;
  };
}

test('an aircraft event walks inbound -> landingRoll -> taxiIn -> parked -> taxiOut -> takeoff -> departing in order', () => {
  const originalGlobals = Object.fromEntries([
    'isoToScreen', 'TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET',
    'buildingData', 'getWorldDepth', 'addToRenderLayer',
  ].map((key) => [key, global[key]]));
  try {
    global.isoToScreen = (col, row) => ({ x: col * 70, y: row * 35 });
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.getWorldDepth = (layer, localDepth) => (layer === 'effect' ? 300000 : 200000) + (Number(localDepth) || 0);
    global.addToRenderLayer = (scene, child) => child;
    global.buildingData = { '197:110': { type: 'airport', footprintCols: 12, footprintRows: 12 } };

    const entry = { id: '197:110', row: 197, col: 110 };
    const scene = {
      offsetX: 0,
      offsetY: 0,
      worldMask: {},
      buildingSprites: new Map([[entry.id, { active: true }]]),
      add: {
        image: (x, y) => ({
          x, y, texture: { key: '' },
          setOrigin() { return this; },
          setScale() { return this; },
          setMask() { return this; },
          setDepth(value) { this.depth = value; return this; },
          setPosition(px, py) { this.x = px; this.y = py; return this; },
          setTexture(key) { this.texture.key = key; return this; },
          destroy() { this.active = false; },
        }),
      },
    };
    const state = aircraft.getAircraftVisualState(scene);
    const airportState = { cooldownMs: 0, events: [] };
    const random = () => 0; // always picks livery UO - deterministic

    // Bundle not loaded yet - spawn must fail cleanly, not throw.
    assert.equal(aircraft.spawnAircraft(scene, state, airportState, entry, 'gate1', random), false);

    scene.textures = { exists: () => true }; // fake the bundle being ready
    assert.equal(aircraft.spawnAircraft(scene, state, airportState, entry, 'gate1', random), true);
    const event = airportState.events[0];
    assert.equal(event.phase, 'inbound');

    // Alone at the airport, so the runway is never busy on account of any
    // OTHER event - this single event is the only thing that could occupy it.
    const seenPhases = flyAircraftEventToDespawn(
      event,
      (activeEvent, ms) => aircraft.updateAircraftEvent(scene, activeEvent, ms, false, random),
    );
    assert.deepEqual(seenPhases, [
      'inbound', 'landingRoll', 'taxiIn', 'parked', 'taxiOut', 'takeoff', 'departing',
    ]);
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('aircraft module is wired into Phaser lifecycle and remains visual-only', () => {
  const html = source('index.html');
  const main = source('main.js');
  const moduleSource = source('aircraft-visuals.js');
  assert.match(html, /vessel-visuals\.js[\s\S]*?aircraft-route-metadata\.js[\s\S]*?aircraft-visuals\.js[\s\S]*?main\.js/);
  assert.match(main, /setupAircraftVisuals\(this\)/);
  assert.match(main, /updateAircraftVisuals\.call\(this, time, delta\)/);
  assert.match(main, /clearAircraftVisuals\(scene\)/);
  assert.match(main, /invalidateAircraftVisualView\(scene, true\)/);
  assert.doesNotMatch(moduleSource, /monthlyIncome|monthlyExpenses|tourismRevenue|city\.budget/);
});

test('runtime update only starts work for an airport near the camera view', () => {
  const originalGlobals = Object.fromEntries([
    'city', 'buildingData', 'simPaused', 'simSpeedMul', 'isTerrainCreatorMode',
    'isoToScreen', 'TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET',
    'getWorldDepth', 'addToRenderLayer', 'getBuildingFacilityEntries',
  ].map((key) => [key, global[key]]));
  const createdSprites = [];
  const makeSprite = (overrides = {}) => ({
    x: 0, y: 0, active: true, texture: { key: '' },
    setOrigin() { return this; },
    setScale() { return this; },
    setMask() { return this; },
    setDepth(value) { this.depth = value; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setTexture(key) { this.texture.key = key; return this; },
    destroy() { this.active = false; },
    ...overrides,
  });
  const makeScene = (airportSprite) => ({
    offsetX: 0,
    offsetY: 0,
    worldMask: {},
    cameras: { main: { zoom: 1, width: 800, height: 600, scrollX: 0, scrollY: 0, originX: 0, originY: 0 } },
    scene: { isVisible: () => true },
    textures: { exists: () => true },
    buildingSprites: new Map([['197:110', airportSprite]]),
    add: { image: (x, y, textureKey) => {
      const sprite = makeSprite({ x, y });
      sprite.texture.key = textureKey;
      createdSprites.push(sprite);
      return sprite;
    } },
  });
  try {
    global.city = { weather: { typhoonStage: 'none' } };
    global.simPaused = false;
    global.simSpeedMul = 1;
    global.isTerrainCreatorMode = false;
    global.isoToScreen = (col, row) => ({ x: col * 70, y: row * 35 });
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.getWorldDepth = (layer, localDepth) => (layer === 'effect' ? 300000 : 200000) + (Number(localDepth) || 0);
    global.addToRenderLayer = (scene, child) => child;
    global.buildingData = { '197:110': { type: 'airport', footprintCols: 12, footprintRows: 12 } };
    global.getBuildingFacilityEntries = (type) => (
      type === 'airport' ? [{ id: '197:110', type: 'airport', row: 197, col: 110, record: global.buildingData['197:110'] }] : []
    );

    const offScreenScene = makeScene(makeSprite({ x: 50000, y: 50000 }));
    const offScreenState = aircraft.setupAircraftVisuals(offScreenScene);
    offScreenState.airportStates.set('197:110', { cooldownMs: 0, events: [] });
    aircraft.updateAircraftVisuals.call(offScreenScene, 0, 16);
    assert.equal(createdSprites.length, 0, 'an off-screen airport must not spawn an aircraft or load textures');

    const onScreenScene = makeScene(makeSprite({ x: 500, y: 300 }));
    const state = aircraft.setupAircraftVisuals(onScreenScene);
    state.airportStates.set('197:110', { cooldownMs: 0, events: [] });
    aircraft.updateAircraftVisuals.call(onScreenScene, 0, 16);
    assert.equal(state.airportStates.get('197:110').events.length, 1, 'an on-screen, off-cooldown airport should spawn an aircraft');
    assert.equal(createdSprites.length, 1);

    aircraft.clearAircraftVisuals(onScreenScene);
    assert.equal(state.airportStates.size, 0);
    assert.ok(createdSprites.every((sprite) => sprite.active === false));
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});

test('a parked aircraft waits for the runway to clear before taxiing out, even with an expired dwell timer', () => {
  const originalBuildingData = global.buildingData;
  try {
    global.buildingData = { x: { type: 'airport' } };
    const scene = { offsetX: 0, offsetY: 0 };
    const event = {
      phase: 'parked',
      dwellMs: -100, // already expired
      route: { gateKey: 'gate1' },
      direction: 'ne',
      anchor: { row: 0, col: 0 },
      lastLogical: { row: 1, col: 1 },
      lastWorld: null,
      airportId: 'x',
      airportSprite: { active: true },
      sound: null,
      sprite: { texture: { key: '' }, setTexture() {}, setPosition() {}, setDepth() {} },
    };

    const keptAliveWhileBusy = aircraft.updateAircraftEvent(scene, event, 500, true, () => 0);
    assert.equal(keptAliveWhileBusy, true);
    assert.equal(event.phase, 'parked', 'must not taxi out while another aircraft holds the runway');

    const keptAliveOnceFree = aircraft.updateAircraftEvent(scene, event, 500, false, () => 0);
    assert.equal(keptAliveOnceFree, true);
    assert.equal(event.phase, 'taxiOut', 'the same expired dwell should release it the moment the runway frees up');
  } finally {
    if (originalBuildingData === undefined) delete global.buildingData;
    else global.buildingData = originalBuildingData;
  }
});

test('a busy airport keeps at least two aircraft on the apron almost always, but never two on the runway or the same gate', () => {
  const originalGlobals = Object.fromEntries([
    'isoToScreen', 'TILE_WIDTH', 'TILE_HEIGHT', 'TILE_IMAGE_HEIGHT', 'BUILDING_SURFACE_Y_OFFSET',
    'buildingData', 'getWorldDepth', 'addToRenderLayer',
  ].map((key) => [key, global[key]]));
  try {
    global.isoToScreen = (col, row) => ({ x: col * 70, y: row * 35 });
    global.TILE_WIDTH = 100;
    global.TILE_HEIGHT = 50;
    global.TILE_IMAGE_HEIGHT = 100;
    global.BUILDING_SURFACE_Y_OFFSET = 50;
    global.getWorldDepth = (layer, localDepth) => (layer === 'effect' ? 300000 : 200000) + (Number(localDepth) || 0);
    global.addToRenderLayer = (scene, child) => child;
    global.buildingData = { '197:110': { type: 'airport', footprintCols: 12, footprintRows: 12 } };

    const entry = { id: '197:110', row: 197, col: 110 };
    const scene = {
      offsetX: 0,
      offsetY: 0,
      worldMask: {},
      buildingSprites: new Map([[entry.id, { active: true }]]),
      textures: { exists: () => true },
      add: {
        image: (x, y) => ({
          x, y, texture: { key: '' },
          setOrigin() { return this; },
          setScale() { return this; },
          setMask() { return this; },
          setDepth(value) { this.depth = value; return this; },
          setPosition(px, py) { this.x = px; this.y = py; return this; },
          setTexture(key) { this.texture.key = key; return this; },
          destroy() { this.active = false; },
        }),
      },
    };
    const state = aircraft.getAircraftVisualState(scene);
    state.airportStates.set(entry.id, { cooldownMs: 0, events: [] });
    const random = makeSeededRandom(12345);

    let maxConcurrent = 0;
    let ticksAtOrAboveTwo = 0;
    let measuredTicks = 0;
    const capacityErrors = [];
    const gateConflictErrors = [];
    const runwayConflictErrors = [];
    const rampUpTicks = 120; // ~60s - enough for the first couple of gates to fill from a cold start
    const totalTicks = 4000; // ~2000 simulated seconds
    for (let tick = 0; tick < totalTicks; tick++) {
      aircraft.updateAircraftAirports(scene, state, 500, [entry], [entry], random);
      const { events } = state.airportStates.get(entry.id);
      maxConcurrent = Math.max(maxConcurrent, events.length);
      if (events.length > aircraft.AIRCRAFT_GATE_KEYS.length) {
        capacityErrors.push(`tick ${tick}: ${events.length} concurrent aircraft, more than ${aircraft.AIRCRAFT_GATE_KEYS.length} gates`);
      }
      const gateKeys = events.map((event) => event.route.gateKey);
      if (new Set(gateKeys).size !== gateKeys.length) {
        gateConflictErrors.push(`tick ${tick}: duplicate gate assignment among ${JSON.stringify(gateKeys)}`);
      }
      const nonParked = events.filter((event) => event.phase !== 'parked');
      if (nonParked.length > 1) {
        runwayConflictErrors.push(`tick ${tick}: ${nonParked.length} aircraft on the runway at once (${nonParked.map((e) => e.phase)})`);
      }
      if (tick >= rampUpTicks) {
        measuredTicks++;
        if (events.length >= 2) ticksAtOrAboveTwo++;
      }
    }

    assert.deepEqual(capacityErrors, []);
    assert.deepEqual(gateConflictErrors, []);
    assert.deepEqual(runwayConflictErrors, []);
    assert.ok(
      maxConcurrent > 1,
      `expected to see more than one aircraft at the airport at once over the run (busier-airport goal); max observed was ${maxConcurrent}`,
    );
    // Norton wants at least two aircraft on the apron essentially always,
    // not just occasionally - spawning is unthrottled below gate capacity
    // (see updateAircraftAirports), so once past the initial ramp-up this
    // should hold the vast majority of the time, with brief dips only while
    // a refill is still taxiing in after the other gate emptied out.
    const twoOrMoreRatio = ticksAtOrAboveTwo / measuredTicks;
    assert.ok(
      twoOrMoreRatio >= 0.9,
      `expected at least 2 concurrent aircraft on >=90% of post-ramp-up ticks, got ${(twoOrMoreRatio * 100).toFixed(1)}%`,
    );
  } finally {
    Object.entries(originalGlobals).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
});
