const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BUILDING_LIGHT_SCHEDULE,
  BUILDING_LIGHT_SERVICE_FLOOR,
  BUILDING_LIGHT_CLASS_DEFAULTS,
  getBuildingLightSeed,
  getBuildingLightPersonality,
  getBuildingLightBucket,
  getBuildingLightTargetRatio,
  getBuildingLightClass,
  getBuildingLightFamily,
  resolveBuildingLightProfile,
  bilerpBuildingLight,
  defaultBuildingLightPanels,
  computeLitBuildingWindows,
  computeBuildingLightStrength,
  makeBuildingLightProfile,
} = require('../building-lighting');

test('buckets walk day -> dusk -> evening -> deep night -> dawn with real sunrise/sunset', () => {
  const sr = 6 * 60 + 24;   // 06:24
  const ss = 19 * 60 + 15;  // 19:15
  assert.equal(getBuildingLightBucket(12 * 60, sr, ss), 'day');
  assert.equal(getBuildingLightBucket(ss + 10, sr, ss), 'duskRamp');
  assert.equal(getBuildingLightBucket(21 * 60, sr, ss), 'eveningPeak');
  assert.equal(getBuildingLightBucket(23 * 60, sr, ss), 'lateEvening');
  assert.equal(getBuildingLightBucket(30, sr, ss), 'lateEvening');       // 00:30
  assert.equal(getBuildingLightBucket(3 * 60, sr, ss), 'deepNight');     // 03:00
  assert.equal(getBuildingLightBucket(sr - 20, sr, ss), 'dawnFade');
  // graceful default sunrise/sunset
  assert.equal(getBuildingLightBucket(12 * 60), 'day');
});

test('target ratio follows the schedule, biased per building, floored for services', () => {
  const flat = { occupancyBias: 0 };
  assert.equal(getBuildingLightTargetRatio('eveningPeak', 'res', flat), BUILDING_LIGHT_SCHEDULE.eveningPeak.res);
  assert.equal(getBuildingLightTargetRatio('deepNight', 'off', flat), BUILDING_LIGHT_SCHEDULE.deepNight.off);
  assert.equal(getBuildingLightTargetRatio('day', 'res', flat), 0);

  // services never fall below the floor
  const svcDeep = getBuildingLightTargetRatio('deepNight', 'svc', flat);
  assert.ok(svcDeep >= BUILDING_LIGHT_SERVICE_FLOOR.deepNight - 1e-9);

  // bias shifts, clamped to [0,1]
  assert.ok(getBuildingLightTargetRatio('eveningPeak', 'off', { occupancyBias: 0.1 })
    > getBuildingLightTargetRatio('eveningPeak', 'off', { occupancyBias: -0.1 }));
  assert.equal(getBuildingLightTargetRatio('eveningPeak', 'off', { occupancyBias: -5 }), 0);
});

test('class and family derive from the building record', () => {
  assert.equal(getBuildingLightClass({ type: 'residential' }), 'res');
  assert.equal(getBuildingLightClass({ type: 'industrial' }), 'ind');
  assert.equal(getBuildingLightClass({ type: 'hospital' }), 'svc');
  assert.equal(getBuildingLightClass({ type: 'commercial' }), 'off');
  assert.equal(getBuildingLightClass({ type: 'legislative_council' }), 'off');

  assert.equal(getBuildingLightFamily({ type: 'residential', footprintCols: 2 }), 'residential2');
  assert.equal(getBuildingLightFamily({ type: 'commercial', footprintCols: 5 }), 'commercial5');
  assert.equal(getBuildingLightFamily({ type: 'hospital' }), 'hospital');
});

test('profile resolution: hero sprite key, then family, then minimal', () => {
  const { BUILDING_LIGHT_MINIMAL_PROFILE } = require('../building-lighting');
  const rec = { type: 'commercial', footprintCols: 3 };
  // uncalibrated -> the minimal "no windows, one lamp" profile
  assert.equal(resolveBuildingLightProfile(rec), BUILDING_LIGHT_MINIMAL_PROFILE);
  assert.equal(BUILDING_LIGHT_MINIMAL_PROFILE.panels.length, 0);
  assert.equal(BUILDING_LIGHT_MINIMAL_PROFILE.lamps.length, 1);

  const { BUILDING_LIGHT_PROFILES, BUILDING_LIGHT_HERO_PROFILES } = require('../building-lighting');
  BUILDING_LIGHT_PROFILES.commercial3 = makeBuildingLightProfile({
    class: 'off', panels: [{ c: [[0, 0], [1, 0], [1, 1], [0, 1]], rows: 4, cols: 4 }],
  });
  assert.equal(resolveBuildingLightProfile(rec).panels[0].rows, 4);

  BUILDING_LIGHT_HERO_PROFILES.commercial3_hero = makeBuildingLightProfile({
    class: 'off', panels: [{ c: [[0, 0], [1, 0], [1, 1], [0, 1]], rows: 9, cols: 9 }],
  });
  assert.equal(resolveBuildingLightProfile(rec, 'commercial3_hero').panels[0].rows, 9, 'hero key wins');
  assert.equal(resolveBuildingLightProfile(rec, 'not_a_hero').panels[0].rows, 4, 'falls back to family');

  delete BUILDING_LIGHT_PROFILES.commercial3;
  delete BUILDING_LIGHT_HERO_PROFILES.commercial3_hero;
});

test('the baked hero profiles are well-formed', () => {
  const { BUILDING_LIGHT_HERO_PROFILES } = require('../building-lighting');
  for (const [key, profile] of Object.entries(BUILDING_LIGHT_HERO_PROFILES)) {
    assert.ok(Array.isArray(profile.panels), `${key} has a panels array`);
    profile.panels.forEach((p) => {
      assert.equal(p.corners.length, 4, `${key} panel has 4 corners`);
      assert.ok(p.rows >= 1 && p.cols >= 1);
    });
    assert.ok(Array.isArray(profile.lamps) && Array.isArray(profile.beacons));
    // legacy ex/ey/er (kept civic overrides) migrate to one entrance lamp
    if (key === 'university_4x4') assert.equal(profile.lamps.length, 1);
    // calibrator-baked house profiles carry explicit street-lamp arrays
    if (key === 'house3x3_6') assert.ok(profile.lamps.length >= 1);
  }
});

test('makeBuildingLightProfile normalises panels (<=4), lamps, and beacons', () => {
  const p = makeBuildingLightProfile({
    class: 'off',
    panels: [{ c: [[0, 0], [1, 0], [1, 1], [0, 1]], rows: 3, cols: 3 }, {}, {}, {}, {}],
    lamps: [{ x: 0.2, y: 0.9, r: 0.05 }, { x: 0.8, y: 0.9, r: 0.05 }],
    beacons: [{ x: 0.5, y: 0.05, color: 'red', period: 1200 }, { x: 0.5, y: 0.1, color: 'nonsense' }],
  });
  assert.equal(p.panels.length, 4, 'capped at 4 panels');
  assert.equal(p.lamps.length, 2);
  assert.equal(p.beacons.length, 2);
  assert.equal(p.beacons[0].color, 'red');
  assert.equal(p.beacons[1].color, 'red', 'unknown colour falls back to red');
  assert.ok(p.beacons[1].period >= 200);

  // panels: [] means "no windows"; omitted means the class default
  assert.equal(makeBuildingLightProfile({ class: 'res', panels: [] }).panels.length, 0);
  assert.ok(makeBuildingLightProfile({ class: 'res' }).panels.length >= 1);
  // entrance: null suppresses the auto lamp
  assert.equal(makeBuildingLightProfile({ class: 'ind', entrance: null }).lamps.length, 0);
});

test('default panels are two iso parallelograms meeting at the near edge', () => {
  const panels = defaultBuildingLightPanels('off');
  assert.equal(panels.length, 2);
  // both share the near vertical edge at x = 0.5
  assert.equal(panels[0].corners[1][0], 0.5);
  assert.equal(panels[1].corners[0][0], 0.5);
  // left panel: a course (v=const) rises to the right at the 1:2 iso slope
  const l = panels[0].corners;
  const slope = (l[1][1] - l[0][1]) / (l[1][0] - l[0][0]);
  assert.ok(Math.abs(slope - 0.5) < 0.06, `iso slope ~0.5, got ${slope.toFixed(3)}`);

  // industrial shows only the left face
  const ind = defaultBuildingLightPanels('ind');
  assert.equal(ind[1].on, false);
});

test('bilinear cell centres stay inside their panel parallelogram', () => {
  const corners = [[0.2, 0.1], [0.6, 0.3], [0.6, 0.8], [0.2, 0.6]];
  const mid = bilerpBuildingLight(corners, 0.5, 0.5);
  const cx = (0.2 + 0.6 + 0.6 + 0.2) / 4;
  const cy = (0.1 + 0.3 + 0.8 + 0.6) / 4;
  assert.ok(Math.abs(mid[0] - cx) < 1e-9 && Math.abs(mid[1] - cy) < 1e-9);
  assert.deepEqual(bilerpBuildingLight(corners, 0, 0), corners[0]);
  assert.deepEqual(bilerpBuildingLight(corners, 1, 1), corners[2]);
});

test('lit windows are deterministic, corridor-forced, all-off by day, and track the target', () => {
  const profile = makeBuildingLightProfile({
    class: 'off',
    panels: [{ c: [[0.14, 0.1], [0.5, 0.28], [0.5, 0.72], [0.14, 0.55]], rows: 10, cols: 6 }],
  });
  const seed = getBuildingLightSeed(12, 34);
  const pers = getBuildingLightPersonality(seed);

  const day = computeLitBuildingWindows(profile, seed, 'day', 0, pers);
  assert.equal(day.length, 60);
  assert.ok(day.every((c) => !c.on));
  // nx/ny land inside the parallelogram's bounding box
  assert.ok(day.every((c) => c.nx >= 0.14 && c.nx <= 0.5 && c.ny >= 0.1 && c.ny <= 0.72));

  // each window is a sheared quad, not a screen-aligned rectangle: its top edge
  // rises to the right on this panel, matching the iso slope
  const w0 = day[0];
  assert.equal(w0.quad.length, 4);
  const topSlope = (w0.quad[1][1] - w0.quad[0][1]) / (w0.quad[1][0] - w0.quad[0][0]);
  assert.ok(topSlope > 0.2 && topSlope < 0.8, `window top edge follows the iso slope, got ${topSlope.toFixed(2)}`);
  // left/right edges stay vertical
  assert.ok(Math.abs(w0.quad[3][0] - w0.quad[0][0]) < 1e-9);

  const a = computeLitBuildingWindows(profile, seed, 'eveningPeak', 3, pers);
  const b = computeLitBuildingWindows(profile, seed, 'eveningPeak', 3, pers);
  assert.deepEqual(a.map((c) => c.on), b.map((c) => c.on), 'same inputs -> same pattern');

  // a corridor column is fully lit on alternate rows at night
  const litCols = {};
  a.forEach((c, i) => { if (c.on) litCols[i % 6] = (litCols[i % 6] || 0) + 1; });
  assert.ok(Object.values(litCols).some((n) => n >= 5), 'one column reads as an always-on corridor');

  const litPeak = a.filter((c) => c.on).length;
  const litDeep = computeLitBuildingWindows(profile, seed, 'deepNight', 3, pers).filter((c) => c.on).length;
  assert.ok(litPeak > litDeep, 'fewer windows lit at deep night than evening peak');
});

test('strength is a clamped smoothstep of night alpha', () => {
  assert.equal(computeBuildingLightStrength(0), 0);
  assert.equal(computeBuildingLightStrength(1), 1);
  const mid = computeBuildingLightStrength(0.16);
  assert.ok(mid > 0.3 && mid < 0.7);
  assert.ok(computeBuildingLightStrength(0.05) < computeBuildingLightStrength(0.2));
});

test('baked night variants are never listed as models', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.join(__dirname, '..');

  // The manifest carries night entries so the runtime can resolve them, but the
  // model listing API and the client sort must both drop them: they would
  // otherwise take discovery slots, and the slot index is the key that saved
  // buildings resolve by, so an existing city would silently swap models.
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /isDerivedNightVariant/);
  assert.match(server, /__night\(deep\)\?/);

  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const sortFn = main.slice(main.indexOf('function sortModelFiles('));
  assert.match(sortFn.slice(0, 2000), /__night\(deep\)\?/, 'sortModelFiles must filter night variants');
});

test('a redeveloped lot never keeps the previous model\'s night art', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.resolve(__dirname, '..');
  const growth = fs.readFileSync(path.join(ROOT, 'sim-growth.js'), 'utf8');
  const start = growth.indexOf('sprite.setTexture(newModel.key);');
  const end = growth.indexOf('record.spriteKey  = newModel.key;', start);
  assert.ok(start >= 0 && end > start);
  const swap = growth.slice(start, end);
  // Packaged art in one folder is not a uniform size (a 2x2 slim tower stages
  // to 256x512 next to 512x512 neighbours), so a stale filename hands the
  // sprite another building's night texture and it draws at the wrong size.
  assert.match(swap, /sprite\.modelSourceFileName = newModel\.sourceFileName/);
  assert.match(swap, /sprite\.__dayTextureKey = null/);
  assert.match(swap, /sprite\.skipNightTint = false/);

  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  // The record is rewritten by placement, save load and redevelopment alike,
  // so it has to win over the sprite's copy in both lookups.
  const nightKey = main.slice(main.indexOf('function getBuildingNightTextureKey('));
  assert.match(nightKey.slice(0, 600), /record\?\.sourceFileName \?\? sprite\.modelSourceFileName/);
  // placeHouseModel writes buildingData after placeSpriteBuilding returns, so
  // the placing model's own filename has to be used first.
  assert.match(main, /building\.modelSourceFileName = options\.sourceFileName/);

  const lighting = fs.readFileSync(path.join(ROOT, 'building-lighting.js'), 'utf8');
  const slug = lighting.slice(lighting.indexOf('function getBuildingLightModelSlug('));
  assert.match(slug.slice(0, 400), /record\?\.sourceFileName\s*\n?\s*\?\? sprite\?\.modelSourceFileName/);
});
