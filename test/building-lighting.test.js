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
  buildingLightCorridorSet,
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

test('profile resolution: family override, else class default', () => {
  const rec = { type: 'commercial', footprintCols: 3 };
  assert.equal(resolveBuildingLightProfile(rec), BUILDING_LIGHT_CLASS_DEFAULTS.off);

  const { BUILDING_LIGHT_PROFILES } = require('../building-lighting'); // live object
  BUILDING_LIGHT_PROFILES.commercial3 = makeBuildingLightProfile({ class: 'off', rows: 4, cols: 4 });
  assert.equal(resolveBuildingLightProfile(rec).rows, 4);
  delete BUILDING_LIGHT_PROFILES.commercial3;
});

test('lit windows are deterministic, corridor-forced, all-off by day, and track the target', () => {
  const profile = makeBuildingLightProfile({ class: 'off', rows: 10, cols: 8, x: 0.1, y: 0.05, w: 0.8, h: 0.7 });
  const seed = getBuildingLightSeed(12, 34);
  const pers = getBuildingLightPersonality(seed);

  const day = computeLitBuildingWindows(profile, seed, 'day', 0, pers);
  assert.equal(day.length, 80);
  assert.ok(day.every((c) => !c.on));
  // nx/ny are inside the band
  assert.ok(day.every((c) => c.nx > 0.1 && c.nx < 0.9 && c.ny > 0.05 && c.ny < 0.75));

  const a = computeLitBuildingWindows(profile, seed, 'eveningPeak', 3, pers);
  const b = computeLitBuildingWindows(profile, seed, 'eveningPeak', 3, pers);
  assert.deepEqual(a.map((c) => c.on), b.map((c) => c.on), 'same inputs -> same pattern');

  const corridor = buildingLightCorridorSet(seed, profile.cols, profile.rows, pers);
  corridor.forEach((i) => assert.equal(a[i].on, true, 'corridor window is always lit at night'));

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
