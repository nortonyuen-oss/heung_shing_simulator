const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const clockSource = fs.readFileSync(path.join(ROOT, 'game-clock.js'), 'utf8');
const attract = require('../attract-mode.js');

function createClockContext(overrides = {}) {
  const calls = { daily: 0, pulse: 0, weather: 0, transport: 0 };
  const city = { timeOfDayMinutes: 6 * 60, environmentMinutes: 0, day: 1, month: 1, year: 1900 };
  const sandbox = {
    city,
    simPaused: false,
    simSpeedMul: 0.15,
    TICKS_PER_MONTH: 4,
    console,
    runDailySystems: () => { calls.daily++; },
    runLegacyCitySimulationPulse: () => { calls.pulse++; },
    advanceWeatherClock: () => { calls.weather++; },
    advanceTransportClock: () => { calls.transport++; },
    ...overrides,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(clockSource, context, { filename: 'game-clock.js' });
  vm.runInContext('startGameClock()', context);
  return { context, city, calls };
}

test('attract mode moves the sky and the buses but never the calendar or the simulation', () => {
  const { context, city, calls } = createClockContext({ isAttractModeActive: () => true });
  // Ten real minutes at the slowest tier is more than a full sky day.
  for (let i = 0; i < 600; i++) vm.runInContext('updateGameClock(null, 1000)', context);
  assert.notEqual(city.timeOfDayMinutes, 6 * 60, 'the sky advanced');
  assert.ok(city.environmentMinutes > 24 * 60, 'environmental minutes kept counting');
  assert.deepEqual([city.day, city.month, city.year], [1, 1, 1900], 'calendar untouched');
  assert.equal(calls.daily, 0);
  assert.equal(calls.pulse, 0);
  assert.ok(calls.transport > 0, 'bus company clock still runs so buses keep moving');
  assert.ok(calls.weather > 0, 'simulated weather still rolls while the Observatory is not pinned');
});

test('the same clock advances the calendar once attract mode is over', () => {
  let active = true;
  const { context, city, calls } = createClockContext({ isAttractModeActive: () => active });
  for (let i = 0; i < 600; i++) vm.runInContext('updateGameClock(null, 1000)', context);
  assert.equal(calls.daily, 0);
  active = false;
  for (let i = 0; i < 600; i++) vm.runInContext('updateGameClock(null, 1000)', context);
  assert.ok(calls.daily > 0, 'daily systems resume');
  assert.ok(city.day > 1 || city.month > 1, 'calendar moves again');
});

test('Observatory readings pin the weather so the seasonal roller stays quiet', () => {
  const { context, calls } = createClockContext({ isAttractModeActive: () => true, isAttractWeatherPinned: () => true });
  for (let i = 0; i < 120; i++) vm.runInContext('updateGameClock(null, 1000)', context);
  assert.equal(calls.weather, 0);
  assert.ok(calls.transport > 0);
});

test('Observatory icons and warnings map onto the game weather vocabulary', () => {
  const { observatoryIconToCondition: cond, observatoryWarningsToState: warn, buildObservatoryWeather } = attract;
  assert.equal(cond(50, 27), 'clear');
  assert.equal(cond(51, 33), 'hot');
  assert.equal(cond(71, 12), 'cool');
  assert.equal(cond(76, 20), 'cloudy');
  assert.equal(cond(53, 25), 'showers');
  assert.equal(cond(63, 25), 'showers');
  assert.equal(cond(64, 25), 'heavyRain');
  assert.equal(cond(65, 25), 'heavyRain');
  assert.equal(cond(80, 25), 'windy');
  assert.equal(cond(83, 25), 'cloudy');
  assert.equal(cond(90, 25), 'hot');
  assert.equal(cond(93, 25), 'cool');
  assert.equal(cond(undefined, undefined), 'clear');
  assert.deepEqual(warn({}), { rainWarning: 'none', typhoonStage: 'none' });
  assert.deepEqual(warn({ WRAIN: { code: 'WRAINR' }, WTCSGNL: { code: 'TC8SE' } }), { rainWarning: 'red', typhoonStage: 'signal8' });
  assert.deepEqual(warn({ WRAIN: { code: 'WRAINB' }, WTCSGNL: { code: 'TC10' } }), { rainWarning: 'black', typhoonStage: 'signal10' });

  const readings = {
    updateTime: '2026-09-16T22:02:00+08:00',
    icon: [71],
    temperature: { data: [{ place: 'King\'s Park', value: 27 }, { place: 'Hong Kong Observatory', value: 28 }] },
    humidity: { data: [{ place: 'Hong Kong Observatory', value: 79 }] },
    rainfall: { data: [{ place: 'Central & Western District', max: 0 }, { place: 'Yau Tsim Mong', max: 2 }] },
  };
  const calm = buildObservatoryWeather(readings, {});
  assert.equal(calm.condition, 'clear');
  assert.equal(calm.temperatureC, 28);
  assert.equal(calm.humidityPct, 79);
  assert.equal(calm.rainfallMm, 2);
  assert.equal(calm.typhoonActive, false);
  assert.equal(calm.observatoryUpdatedAt, readings.updateTime);

  const storm = buildObservatoryWeather({ ...readings, icon: [61] }, { WTCSGNL: { code: 'TC8NE' } });
  assert.equal(storm.typhoonStage, 'signal8');
  assert.equal(storm.typhoonActive, true);
  assert.equal(storm.condition, 'heavyRain');
  assert.ok(storm.windKph >= 80);

  const amber = buildObservatoryWeather({ ...readings, icon: [60] }, { WRAIN: { code: 'WRAINA' } });
  assert.equal(amber.condition, 'showers');
  assert.equal(amber.rainWarning, 'amber');
});

test('the clock is synced to the local wall clock at attract start', () => {
  assert.equal(attract.localTimeOfDayMinutes(new Date(2026, 8, 16, 23, 30, 0)), 23 * 60 + 30);
  assert.equal(attract.localTimeOfDayMinutes(new Date(2026, 8, 16, 0, 0, 30)), 0.5);
});

test('the bundled showcase city decodes with the current save format', () => {
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'UI', 'attract-city.json'), 'utf8'));
  assert.equal(file.format, 'heung-shing-attract-city');
  assert.ok(file.cityName, 'carries the showcase city name');
  const saveSource = fs.readFileSync(path.join(ROOT, 'save.js'), 'utf8');
  const version = Number(saveSource.match(/const COMPACT_SAVE_VERSION = (\d+)/)[1]);
  assert.equal(file.save_data.version, version, 'export the showcase again after a save-format bump (exportAttractCity() in the DevTools console)');
  const context = vm.createContext({
    AbortController, Array, console, JSON, Math, Number, Object, Promise, Set, String,
    MAP_HEIGHT: 256, MAP_WIDTH: 256, ROAD_TILE_SET_DEFAULT_ID: 'default', TREE_SYSTEM_VERSION: 1, BARE_LAND_VERSION: 1,
    fetch: async () => { throw new Error('Unexpected fetch'); }, clearTimeout, setTimeout,
  });
  vm.runInContext(saveSource, context, { filename: 'save.js' });
  context.raw = file.save_data;
  const decoded = vm.runInContext('decodeSaveDataForLoad(raw)', context);
  assert.equal(decoded.mapData.length, 256);
  assert.equal(decoded.mapData[0].length, 256);
  assert.ok(decoded.viewpoint && Number.isFinite(decoded.viewpoint.zoom), 'viewpoint travels with the showcase');
  assert.ok(Object.keys(decoded.buildingData || {}).length > 1000, 'a real city, not an empty map');
  assert.equal(file.save_data.autosave, undefined, 'never tagged as an autosave');
});

test('every gate that keeps the showcase inert is wired', () => {
  const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(read('game-clock.js'), /isAttractModeActive\(\)\) return;\n  advanceCalendarForEnvironmentMinutes/);
  assert.match(read('main.js'), /function triggerAutosave\(\) \{[\s\S]{0,200}isAttractModeActive/);
  assert.match(read('main.js'), /function updateAmbientSoundscape\(scene\) \{[\s\S]{0,200}isAttractModeActive/);
  assert.match(read('hud.js'), /function showToast\([^)]*\) \{\n  if \(typeof isAttractModeActive/);
  assert.match(read('save.js'), /function saveGame\([^)]*\) \{[\s\S]{0,200}isAttractModeActive/);
  assert.match(read('save.js'), /function scheduleAnnualAutosave\(\) \{\n  if \(typeof isAttractModeActive/);
  assert.match(read('save.js'), /async function loadSaveById\([^)]*\) \{\n  if \(typeof leaveAttractMode/);
  assert.match(read('landing-screen.js'), /function rebuildFreshMapSession\([^)]*\) \{\n  if \(typeof leaveAttractMode/);
  assert.match(read('landing-screen.js'), /function startTerrainCreatorMode\([^)]*\) \{\n  if \(typeof leaveAttractMode/);
  assert.match(read('landing-screen.js'), /function hideLandingScreen\(\) \{\n  if \(typeof leaveAttractMode/);
  assert.match(read('index.html'), /<script src="attract-mode\.js"><\/script>/);
  assert.match(read('index.html'), /body\.attract-live > :not\(#game-container\):not\(#landing-screen\)/);
  assert.match(read('server.js'), /allowDevExports/);
  assert.match(read('electron-main.js'), /allowDevExports: !app\.isPackaged/);
});
