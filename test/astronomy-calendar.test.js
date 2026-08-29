const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const { openGameDatabase } = require('../db');

test('bundled HKO calendar seeds versioned SQLite rows and supports 30-day February', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heung-shing-astronomy-'));
  const store = openGameDatabase(path.join(tempDir, 'astronomy.sqlite'));
  try {
    const metadata = store.getAstronomyMetadata();
    assert.equal(metadata.sourceVersion, 'hko-almanac-2026-v1');
    assert.equal(metadata.sourceYear, 2026);
    assert.equal(metadata.timezone, 'Asia/Hong_Kong');
    assert.match(metadata.sources.sun, /dataType=SRS/);
    assert.match(metadata.sources.moon, /dataType=MRS/);

    const winter = store.getAstronomyDay(1, 1);
    const summer = store.getAstronomyDay(7, 1);
    assert.equal(winter.sunriseMinutes, 423);
    assert.equal(winter.sunsetMinutes, 1071);
    assert.equal(summer.sunriseMinutes, 343);
    assert.equal(summer.sunsetMinutes, 1151);
    assert.equal(store.getAstronomyDay(2, 30).day, 28);
  } finally {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('renderer astronomy client coalesces requests and caches once per game date', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'astronomy-calendar.js'), 'utf8');
  const listeners = {};
  let fetchCount = 0;
  const context = vm.createContext({
    city: { month: 1, day: 1 },
    console: { warn() {} },
    fetch: async (url) => {
      fetchCount++;
      const [, month, day] = url.match(/\/(\d+)\/(\d+)$/);
      return {
        ok: true,
        json: async () => ({
          month: Number(month),
          day: Number(day),
          sunriseMinutes: 423,
          solarTransitMinutes: 747,
          sunsetMinutes: 1071,
          moonriseMinutes: 928,
          moonTransitMinutes: 1354,
          moonsetMinutes: 273,
          moonPhase: 0.4215,
          civilTwilightMinutes: 24,
          nauticalTwilightMinutes: 52,
          astronomicalTwilightMinutes: 80,
        }),
      };
    },
    onGameClockEvent: (name, callback) => { listeners[name] = callback; },
  });
  vm.runInContext(source, context, { filename: 'astronomy-calendar.js' });

  await Promise.all([
    vm.runInContext('ensureAstronomyForDate(1, 1)', context),
    vm.runInContext('ensureAstronomyForDate(1, 1)', context),
  ]);
  assert.equal(fetchCount, 1);
  assert.equal(vm.runInContext('getCurrentAstronomyData().sunriseMinutes', context), 423);

  context.city.day = 2;
  await listeners['gameclock:day']({ month: 1, day: 2 });
  await vm.runInContext('ensureAstronomyForDate(1, 2)', context);
  assert.equal(fetchCount, 2);
});

test('date rollover holds the previous HKO row instead of flashing to the seasonal fallback', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'astronomy-calendar.js'), 'utf8');
  let resolveSecond;
  let fetchCount = 0;
  const astronomyResponse = (day, sunsetMinutes) => ({
    ok: true,
    json: async () => ({
      month: 11,
      day,
      sunriseMinutes: 395,
      solarTransitMinutes: 728,
      sunsetMinutes,
      moonriseMinutes: null,
      moonTransitMinutes: null,
      moonsetMinutes: null,
      moonPhase: 0.2,
      civilTwilightMinutes: 24,
      nauticalTwilightMinutes: 51,
      astronomicalTwilightMinutes: 78,
    }),
  });
  const context = vm.createContext({
    city: { month: 11, day: 15 },
    console: { warn() {} },
    fetch: async () => {
      fetchCount++;
      if (fetchCount === 1) return astronomyResponse(15, 1060);
      return new Promise((resolve) => { resolveSecond = resolve; });
    },
  });
  vm.runInContext(source, context, { filename: 'astronomy-calendar.js' });
  await vm.runInContext('ensureAstronomyForDate(11, 15)', context);

  context.city.day = 16;
  const heldSunset = vm.runInContext('getCurrentAstronomyData().sunsetMinutes', context);
  assert.equal(heldSunset, 1060);
  assert.notEqual(heldSunset, 1155, 'must not fall back to the March sunset during rollover');
  resolveSecond(astronomyResponse(16, 1059));
  await vm.runInContext('ensureAstronomyForDate(11, 16)', context);
  assert.equal(vm.runInContext('getCurrentAstronomyData().sunsetMinutes', context), 1059);
});

test('astronomy client is loaded after city state and before weather visuals', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cityIndex = html.indexOf('<script src="city-state.js"></script>');
  const astronomyIndex = html.indexOf('<script src="astronomy-calendar.js"></script>');
  const weatherIndex = html.indexOf('<script src="sim-weather.js"></script>');
  assert.ok(cityIndex >= 0 && astronomyIndex > cityIndex && weatherIndex > astronomyIndex);
});
