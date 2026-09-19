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
    // calibrated civic profiles carry their own street-lamp arrays
    if (key === 'university_4x4' || key === 'park_large') assert.ok(profile.lamps.length > 1);
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
  // the legacy single ex/ey/er entrance point still migrates to one lamp
  assert.equal(makeBuildingLightProfile({ class: 'off', ex: 0.5, ey: 0.9, er: 0.1 }).lamps.length, 1);
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
  assert.match(server, /__night\(half\|deep\|lamps\)\?/);

  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const sortFn = main.slice(main.indexOf('function sortModelFiles('));
  assert.match(sortFn.slice(0, 2000), /__night\(half\|deep\|lamps\)\?/, 'sortModelFiles must filter night variants');

  // The release verifier pairs every night variant with its day art, so it
  // has to recognise all three suffixes too.
  const verify = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-release-assets.js'), 'utf8');
  assert.match(verify, /__night\(half\|deep\|lamps\)\?\\\.png\$\/\.test/);
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
  const nightKey = main.slice(main.indexOf('function getBuildingNightSlug('));
  assert.match(nightKey.slice(0, 1200), /record\?\.sourceFileName\s*\n?\s*\?\? sprite\.modelSourceFileName/);
  // placeHouseModel writes buildingData after placeSpriteBuilding returns, so
  // the placing model's own filename has to be used first.
  assert.match(main, /building\.modelSourceFileName = options\.sourceFileName/);

  const lighting = fs.readFileSync(path.join(ROOT, 'building-lighting.js'), 'utf8');
  const slug = lighting.slice(lighting.indexOf('function getBuildingLightModelSlug('));
  assert.match(slug.slice(0, 400), /record\?\.sourceFileName\s*\n?\s*\?\? sprite\?\.modelSourceFileName/);
});

test('a baked model keeps a beacons-only glow so its indicator lights still blink', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'building-lighting.js'), 'utf8');
  const update = src.slice(src.indexOf('function updateBuildingLights('), src.indexOf('const buildingLightingTestApi'));
  // Beacons pulse per frame, so they cannot be baked into a static texture. A
  // baked model whose profile has none gets no glow at all (the whole point of
  // the bake); one that has some gets a glow whose Graphics stays hidden.
  assert.match(update, /if \(!\(profile\.beacons \|\| \[\]\)\.length\) \{\n\s*sprite\.__blNoGlowFor = identity;\n\s*return;\n\s*\}/);
  // ... and that answer is memoised on the sprite so the per-frame walk over a
  // fully baked city never resolves the profile again (measured ~4ms a frame).
  assert.match(update, /if \(!calibrating && sprite\.__blNoGlowFor === identity\) return;/);
  assert.match(update, /glow\.beaconsOnly = true;[\s\S]*?glow\.gfx\.setVisible\(false\);/);
  // The window LOD must never flip that hidden Graphics back on.
  assert.match(update, /if \(!sp \|\| !sp\.visible \|\| glow\.beaconsOnly\) return;/);
  // And opening the calibrator rebuilds it as a full glow so edits are visible.
  assert.match(update, /\(calibrating && glow\.beaconsOnly\)/);

  const relight = src.slice(src.indexOf('function relightBuildingGlow('), src.indexOf('function updateBuildingLights('));
  assert.match(relight, /const drawStatic = !glow\.beaconsOnly;/);
  assert.match(relight, /if \(drawStatic && glow\.windowsAllowed\) \{/);
  assert.match(relight, /const lamps = drawStatic \? \(profile\.lamps \|\| \[\]\) : \[\];/);

  // The airport is the profile this exists for.
  const { BUILDING_LIGHT_HERO_PROFILES } = require('../building-lighting.js');
  assert.ok(BUILDING_LIGHT_HERO_PROFILES.airport_12x12.beacons.length >= 10);
});

test('a fixed building resolves its baked night art from the model table', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const main = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'main.js'), 'utf8');
  // Service, landmark, power, port, depot and park records carry a sprite key
  // and no filename; the bake names their night textures after the art file
  // in the model table, so that is where the runtime has to look too.
  const fn = main.slice(main.indexOf('function getBuildingNightSlug('));
  assert.match(fn.slice(0, 900), /getFixedBuildingModelBySpriteKey\(record\?\.spriteKey \?\? sprite\.logicalSpriteKey\)\?\.path\?\.split\('\/'\)\.pop\(\)/);
  const lookup = main.slice(main.indexOf('function getFixedBuildingModelBySpriteKey('));
  ['POWER_PLANT_MODELS', 'getServiceBuildingModelBySpriteKey', 'getSpecialBuildingModelBySpriteKey', 'HARBOR_MODELS', 'BUS_DEPOT_MODELS', 'PARK_MODELS']
    .forEach((table) => assert.ok(lookup.slice(0, 700).includes(table), `lookup covers ${table}`));
  // Orientation swaps replace the texture directly and must drop the night
  // bookkeeping, like the growth swap does.
  const harbor = main.slice(main.indexOf('function refreshHarborSprites('), main.indexOf('function getBusDepotVisualCorner('));
  assert.match(harbor, /sprite\.setTexture\(newKey\);[\s\S]{0,300}sprite\.__dayTextureKey = null;/);
  const depot = main.slice(main.indexOf('function applyBusDepotVisualKey('), main.indexOf('function refreshBusDepotSprites('));
  assert.match(depot, /sprite\.setTexture\(newKey\);[\s\S]{0,200}sprite\.__dayTextureKey = null;/);
});

test('each building picks its own night variant, and the city lights up and dims block by block', () => {
  const {
    getBuildingNightVariant, getBuildingNightKind, getBuildingLightSeed,
    BUILDING_NIGHT_PEAK_SHARE, BUILDING_NIGHT_LAMPS_SHARE, BUILDING_NIGHT_VARIANTS,
  } = require('../building-lighting.js');
  assert.deepEqual([...BUILDING_NIGHT_VARIANTS], ['night', 'half', 'deep', 'lamps']);
  const N = 2000;
  const SUNSET = 18 * 60;
  const seeds = Array.from({ length: N }, (_, i) => getBuildingLightSeed(i % 97, Math.floor(i / 97) * 3 + (i % 5)));
  const share = (kind, minute, variant, sunset = SUNSET) => seeds
    .filter((seed) => getBuildingNightVariant(kind, seed, minute, sunset) === variant).length / N;
  const near = (actual, expected, tol, label) => assert.ok(
    Math.abs(actual - expected) <= tol, `${label}: ${actual.toFixed(3)} vs ${expected}`,
  );
  const RES = BUILDING_NIGHT_PEAK_SHARE.residential;

  // Dusk: the street lamps come on together (every building is lamps-only at
  // the swap), then the windows fill in building by building over the next
  // two hours - the peak group through half-lit to full, the rest to deep.
  assert.equal(share('residential', SUNSET + 40, 'lamps'), 1, 'sunset+40 is lamps only');
  assert.equal(share('landmark', SUNSET + 40, 'lamps'), 1);
  near(share('residential', SUNSET + 70, 'lamps'), 0.5, 0.04, 'lamps sunset+70');
  assert.ok(share('residential', SUNSET + 70, 'half') > 0.2, 'half-lit towers by sunset+70');
  assert.ok(share('residential', SUNSET + 70, 'night') < 0.1, 'few fully lit yet at sunset+70');
  assert.equal(share('residential', SUNSET + 100, 'lamps'), 0, 'everyone past lamps by sunset+100');
  assert.ok(share('residential', SUNSET + 100, 'half') > 0.3, 'half-lit peak at sunset+100');
  assert.equal(share('residential', SUNSET + 165, 'half'), 0, 'everyone full by sunset+165');
  near(share('residential', SUNSET + 165, 'night'), RES, 0.03, 'res sunset+165');
  near(share('residential', SUNSET + 165, 'deep'), 1 - RES, 0.03, 'res deep sunset+165');
  // The ramp follows the sun, so a summer sunset lights up later.
  assert.equal(share('residential', 19 * 60 + 50, 'lamps', 19 * 60 + 10), 1, 'summer: lamps only at 19:50');
  near(share('residential', 21 * 60 + 50, 'night', 19 * 60 + 10), RES, 0.03, 'summer: full by 21:50');

  // Evening: a fixed share of each kind wears the peak texture, the rest deep.
  near(share('residential', 21 * 60, 'night'), RES, 0.03, 'res 21:00');
  near(share('commercial', 21 * 60, 'night'), BUILDING_NIGHT_PEAK_SHARE.commercial, 0.03, 'com 21:00');
  near(share('industrial', 21 * 60, 'night'), BUILDING_NIGHT_PEAK_SHARE.industrial, 0.03, 'ind 21:00');
  assert.equal(share('landmark', 21 * 60, 'night'), 1);
  assert.equal(share('residential', 21 * 60, 'lamps'), 0);
  assert.equal(share('residential', 21 * 60, 'half'), 0);
  // 23:00-01:00: the peak group steps down through half-lit to deep, one
  // building at a time; by 01:00 everyone is deep.
  near(share('residential', 0, 'night'), RES * 0.4, 0.04, 'res night 00:00');
  near(share('residential', 0, 'half'), RES * 0.2, 0.04, 'res half 00:00');
  near(share('landmark', 0, 'night'), 0.4, 0.04, 'landmark 00:00');
  assert.equal(share('residential', 60, 'night'), 0, 'nobody is still peak at 01:00');
  assert.equal(share('residential', 60, 'half'), 0, 'nobody is still half at 01:00');
  assert.equal(share('landmark', 60, 'deep'), 1);
  // 01:00-03:00: half the city goes to street lamps only, gradually.
  assert.equal(share('residential', 59, 'lamps'), 0);
  near(share('residential', 2 * 60, 'lamps'), BUILDING_NIGHT_LAMPS_SHARE / 2, 0.04, 'lamps 02:00');
  near(share('residential', 3 * 60, 'lamps'), BUILDING_NIGHT_LAMPS_SHARE, 0.03, 'lamps 03:00');
  near(share('commercial', 4 * 60, 'lamps'), BUILDING_NIGHT_LAMPS_SHARE, 0.03, 'lamps 04:00');
  near(share('residential', 5 * 60 + 30, 'lamps'), BUILDING_NIGHT_LAMPS_SHARE, 0.03, 'lamps 05:30');
  // 05:30-06:00: early risers bring the deep texture back.
  near(share('residential', 5 * 60 + 45, 'lamps'), BUILDING_NIGHT_LAMPS_SHARE / 2, 0.04, 'lamps 05:45');
  assert.equal(share('residential', 6 * 60, 'lamps'), 0);
  assert.equal(share('residential', 6 * 60, 'deep'), 1);

  // Emergency services never dim and never ramp.
  for (let m = 0; m < 1440; m += 15) {
    assert.equal(share('emergency', m, 'night'), 1, `emergency at ${m}`);
  }

  // A building's night is one forward walk through
  //   lamps -> (half -> night -> half ->) deep -> (lamps -> deep)
  // with no step taken backwards and no stage skipped.
  const allowed = {
    lamps: ['lamps', 'half', 'deep'],
    half: ['half', 'night', 'deep'],
    night: ['night', 'half'],
    deep: ['deep', 'lamps'],
  };
  seeds.slice(0, 300).forEach((seed) => {
    let prev = 'lamps';
    let seenNight = false;
    let leftPeak = false;
    let wokeUp = false;
    for (let n = SUNSET + 40; n < 24 * 60 + 6 * 60; n += 1) {
      const v = getBuildingNightVariant('residential', seed, n % 1440, SUNSET);
      assert.ok(allowed[prev].includes(v), `seed ${seed}: ${prev} -> ${v} at ${n}`);
      if (v === 'night') { assert.ok(!leftPeak, `seed ${seed} back to night at ${n}`); seenNight = true; }
      if (v === 'half' && seenNight && prev === 'night') leftPeak = true;
      if (v === 'half' && leftPeak) assert.equal(prev === 'night' || prev === 'half', true);
      if (v === 'deep' && prev === 'lamps' && n > 24 * 60) wokeUp = true;
      if (v === 'lamps' && n > 24 * 60) assert.ok(!wokeUp, `seed ${seed} lamps again after waking at ${n}`);
      prev = v;
    }
  });

  // Kind resolution: zones by type, 24h services are emergency, landmarks
  // stay peak until the fade, port / depot / power keep industrial hours,
  // everything else (schools, legco, parks) keeps office hours.
  assert.equal(getBuildingNightKind({ type: 'residential' }), 'residential');
  assert.equal(getBuildingNightKind({ type: 'commercial' }), 'commercial');
  assert.equal(getBuildingNightKind({ type: 'industrial' }), 'industrial');
  ['hospital', 'police_station', 'fire_station', 'ambulance_depot'].forEach((t) => {
    assert.equal(getBuildingNightKind({ type: t }), 'emergency', t);
  });
  ['airport', 'ocean_park', 'football_stadium', 'murray_house'].forEach((t) => {
    assert.equal(getBuildingNightKind({ type: t }), 'landmark', t);
  });
  ['container_port', 'bus_depot', 'power_plant_coal'].forEach((t) => {
    assert.equal(getBuildingNightKind({ type: t }), 'industrial', t);
  });
  ['primary_school', 'legislative_council', 'park_small_open', undefined].forEach((t) => {
    assert.equal(getBuildingNightKind({ type: t }), 'commercial', String(t));
  });

  // The runtime asks per building, once per display minute, and the bake
  // ships the third texture the 'lamps' answer resolves to.
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const sync = main.slice(main.indexOf('function syncBuildingNightTextures('), main.indexOf('// ── Night darkness split'));
  assert.match(sync, /getBuildingNightVariant\(/);
  assert.match(sync, /getBuildingLightSeed\(sprite\.mapRow, sprite\.mapCol\), minute, sunset,/);
  assert.match(sync, /const state = wantNight \? `night:\$\{minute\}` : 'day';/);
  assert.match(main, /half: '__nighthalf\.png'/);
  assert.match(main, /lamps: '__nightlamps\.png'/);
  // The swap lands on the lamps-only texture, whose facade is the deep dim.
  assert.match(main, /const BUILDING_BAKED_DIM = 0\.68;/);
  const bake = fs.readFileSync(path.join(ROOT, 'scripts', 'bake-night-textures.js'), 'utf8');
  assert.match(bake, /suffix: '__nighthalf', bucket: 'halfPeak'[^\n]*windows: true/);
  ['res', 'off', 'ind'].forEach((cls) => assert.equal(BUILDING_LIGHT_SCHEDULE.halfPeak[cls], BUILDING_LIGHT_SCHEDULE.eveningPeak[cls] / 2, cls));
  assert.match(bake, /suffix: '__nightlamps'[^\n]*windows: false/);
});

test('the small hours are darker than the evening, for the ground and the baked towers alike', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const passes = main.slice(main.indexOf('function computeNightDarknessPasses('), main.indexOf('function applyNightDarkness('));
  assert.match(passes, /deepNightDepth = 0/);
  assert.match(passes, /NIGHT_DARKNESS_PEAK \+ \(NIGHT_DARKNESS_DEEP_PEAK - NIGHT_DARKNESS_PEAK\) \* depth/);
  assert.match(main, /const deepNightDepth = typeof getDeepNightDepth === 'function' \? getDeepNightDepth\(timeMinutes\) : 0;/);
  // Baked sprites take the small-hours tint instead of opting out entirely,
  // and a texture swap on the plateau keeps it.
  const tint = main.slice(main.indexOf('function applyNightObjectTint('), main.indexOf('function updateDynamicLighting('));
  assert.match(tint, /if \(sprite\.skipNightTint\) \{[\s\S]*?sprite\.setTint\(deepTint\)/);
  assert.match(tint, /scene\.__nightBakedTint = deepK <= 0 \? null : deepTint;/);
  const swap = main.slice(main.indexOf('function applyBuildingNightTexture('), main.indexOf('function syncBuildingNightTextures('));
  assert.match(swap, /if \(scene\.__nightBakedTint\) sprite\.setTint\(scene\.__nightBakedTint\);/);
});

test('a city loaded after dark fetches its night art first, and a building built after dark is dressed on the next tick', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const save = fs.readFileSync(path.join(ROOT, 'save.js'), 'utf8');
  const growth = fs.readFileSync(path.join(ROOT, 'sim-growth.js'), 'utf8');

  // Load: the keys every saved building resolves to at the saved minute are
  // fetched before applySaveData builds the sprites, and one lighting pass
  // dresses them before the first frame renders.
  const load = save.slice(save.indexOf('async function loadSaveById('), save.indexOf('function waitForLoadScene('));
  assert.match(load, /await ensureSaveBuildingTextures\(readyScene, save\);[\s\S]*?await ensureSaveNightTextures\(readyScene, save\);[\s\S]*?applySaveData\(readyScene, save\);/);
  const ensure = save.slice(save.indexOf('async function ensureSaveNightTextures('), save.indexOf('async function loadSaveById('));
  assert.match(ensure, /getNightOverlayAlpha\(minute, forSave\) < swapAt\) return;/);
  assert.match(ensure, /collectBuildingNightTextureKeys\(save\.buildingData, minute, Number\(forSave\.sunsetMinutes\)\)/);
  const rebuild = save.slice(save.indexOf('function rebuildSceneFromSave('), save.indexOf('// ── Fallback sprite key'));
  assert.match(rebuild, /syncWeatherVisuals\(\);[\s\S]*?updateDynamicLighting\(scene\);/);
  const collect = main.slice(main.indexOf('function collectBuildingNightTextureKeys('), main.indexOf('function preloadBuildingNightTextures('));
  assert.match(collect, /getBuildingNightVariant\(\s*getBuildingNightKind\(record\), getBuildingLightSeed\(row, col\), minute, sunsetMin,?\s*\)/);

  // Placement, redevelopment and orientation swaps all flag the next tick,
  // and a sprite whose night art is still loading waits at the baked dim
  // instead of showing daylight-bright among lit neighbours.
  assert.match(main.slice(main.indexOf('function placeSpriteBuilding(')).slice(0, 4000), /markBuildingNightArtDirty\(scene\);/);
  assert.match(growth, /sprite\.skipNightTint = false;\s*\n\s*if \(typeof markBuildingNightArtDirty === 'function'\) markBuildingNightArtDirty\(scene\);/);
  const harbor = main.slice(main.indexOf('function refreshHarborSprites('), main.indexOf('function getBusDepotVisualCorner('));
  assert.match(harbor, /sprite\.skipNightTint = false;\s*markBuildingNightArtDirty\(scene\);/);
  const depot = main.slice(main.indexOf('function applyBusDepotVisualKey('), main.indexOf('function refreshBusDepotSprites('));
  assert.match(depot, /sprite\.skipNightTint = false;\s*markBuildingNightArtDirty\(scene\);/);
  const apply = main.slice(main.indexOf('function applyBuildingNightTexture('), main.indexOf('function markBuildingNightArtDirty('));
  assert.match(apply, /if \(!scene\.textures\.exists\(key\)\) \{[\s\S]*?sprite\.__nightArtPending = true;[\s\S]*?return false;/);
  const tint = main.slice(main.indexOf('function applyNightObjectTint('), main.indexOf('function updateDynamicLighting('));
  assert.match(tint, /if \(sprite\.__nightArtPending\) \{\s*if \(scene\.__nightBakedPreTint\) sprite\.setTint\(scene\.__nightBakedPreTint\);/);
});

test('live Phaser glows are off by default: an unbaked building stays dark unless the test-mode option is on', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const lighting = require('../building-lighting.js');
  assert.equal(lighting.isLiveBuildingLightsEnabled(), false, 'default off');
  // Toggling drops every glow and clears the per-sprite "nothing to draw" memo so the next tick re-decides.
  let cleared = 0;
  const sprite = { __blNoGlowFor: 'x' };
  const scene = {
    buildingLightGlows: new Map([['a', { gfx: { destroy() { cleared++; } }, beacons: [] }]]),
    buildingLightQueue: [1],
    buildingSprites: new Map([['a', sprite]]),
  };
  assert.equal(lighting.setLiveBuildingLightsEnabled(true, scene), true);
  assert.equal(scene.buildingLightGlows.size, 0);
  assert.equal(sprite.__blNoGlowFor, null);
  assert.equal(lighting.setLiveBuildingLightsEnabled(false, scene), false);

  const src = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'building-lighting.js'), 'utf8');
  const update = src.slice(src.indexOf('function updateBuildingLights('), src.indexOf('const buildingLightingTestApi'));
  assert.match(update, /if \(!baked && !calibrating && !liveBuildingLightsEnabled\) \{\n\s*\/\/[^\n]*\n\s*sprite\.__blNoGlowFor = identity;\n\s*return;\n\s*\}/,
    'no baked art + live glows off = dark, memoised');
  const panel = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'visual-route-calibrator.js'), 'utf8');
  assert.ok(panel.includes('vrp-livelights-btn') && panel.includes('setLiveBuildingLightsEnabled(!isLiveBuildingLightsEnabled(), scene)'), 'the performance panel toggles it');
  assert.ok(panel.includes('setLiveBuildingLightsEnabled(false,'), 'leaving test mode switches it back off');
});
