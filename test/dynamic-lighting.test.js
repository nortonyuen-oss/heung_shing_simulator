const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const weatherSource = fs.readFileSync(path.join(ROOT, 'sim-weather.js'), 'utf8');
const hkoSeed = require('../data/hko-astronomy-2026.json');

function recordFor(month, day) {
  const row = hkoSeed.records.find((record) => record.month === month && record.day === day);
  return {
    sunriseMinutes: row.sunrise,
    solarTransitMinutes: row.solarTransit,
    sunsetMinutes: row.sunset,
    moonriseMinutes: row.moonrise,
    moonTransitMinutes: row.moonTransit,
    moonsetMinutes: row.moonset,
    moonPhase: row.moonPhase,
    civilTwilightMinutes: row.civilTwilight,
    nauticalTwilightMinutes: row.nauticalTwilight,
    astronomicalTwilightMinutes: row.astronomicalTwilight,
  };
}

function createWeatherContext(astronomy = recordFor(1, 1)) {
  const context = vm.createContext({
    astronomy,
    city: { weather: { condition: 'clear' } },
    getCurrentAstronomyData: () => context.astronomy,
    GAME_DAYS_PER_MONTH: 30,
    Math,
    TICKS_PER_MONTH: 4,
  });
  vm.runInContext(weatherSource, context, { filename: 'sim-weather.js' });
  return context;
}

test('HKO sunrise and three twilight boundaries own every sky keyframe', () => {
  const context = createWeatherContext();
  const colors = vm.runInContext(`(() => {
    const a = astronomy;
    return {
      midnight: getSkyBackgroundColor(0),
      astronomicalDawn: getSkyBackgroundColor(a.sunriseMinutes - a.astronomicalTwilightMinutes),
      nauticalDawn: getSkyBackgroundColor(a.sunriseMinutes - a.nauticalTwilightMinutes),
      civilDawn: getSkyBackgroundColor(a.sunriseMinutes - a.civilTwilightMinutes),
      sunrise: getSkyBackgroundColor(a.sunriseMinutes),
      noon: getSkyBackgroundColor(a.solarTransitMinutes),
      lateAfternoon: getSkyBackgroundColor(a.sunsetMinutes - 75),
      goldenHour: getSkyBackgroundColor(a.sunsetMinutes - 30),
      sunset: getSkyBackgroundColor(a.sunsetMinutes),
      civilDusk: getSkyBackgroundColor(a.sunsetMinutes + a.civilTwilightMinutes),
      nauticalDusk: getSkyBackgroundColor(a.sunsetMinutes + a.nauticalTwilightMinutes),
      astronomicalDusk: getSkyBackgroundColor(a.sunsetMinutes + a.astronomicalTwilightMinutes),
      loop: getSkyBackgroundColor(24 * 60),
    };
  })()`, context);

  assert.deepEqual({ ...colors }, {
    midnight: 0x02040a,
    astronomicalDawn: 0x02040a,
    nauticalDawn: 0x10162a,
    civilDawn: 0x4d5574,
    sunrise: 0xb8a9b6,
    noon: 0x87ceeb,
    lateAfternoon: 0x83c8e8,
    goldenHour: 0xe0b37d,
    sunset: 0xd96f4f,
    civilDusk: 0x776b8f,
    nauticalDusk: 0x0b1020,
    astronomicalDusk: 0x02040a,
    loop: 0x02040a,
  });
});

test('winter dawn is later and winter dusk earlier than summer in Hong Kong', () => {
  const winter = createWeatherContext(recordFor(1, 1));
  const summer = createWeatherContext(recordFor(7, 1));
  const winterAtSix = vm.runInContext('getNightOverlayAlpha(6 * 60)', winter);
  const summerAtSix = vm.runInContext('getNightOverlayAlpha(6 * 60)', summer);
  const winterAtEvening = vm.runInContext('getNightOverlayAlpha(18.5 * 60)', winter);
  const summerAtEvening = vm.runInContext('getNightOverlayAlpha(18.5 * 60)', summer);

  assert.ok(winterAtSix > summerAtSix, `${winterAtSix} should be darker than ${summerAtSix}`);
  assert.ok(winterAtEvening > summerAtEvening, `${winterAtEvening} should be darker than ${summerAtEvening}`);
});

test('night mask and orange sea glitter follow the actual daily sunset', () => {
  const context = createWeatherContext();
  const values = vm.runInContext(`({
    sunriseAlpha: getNightOverlayAlpha(astronomy.sunriseMinutes),
    noonAlpha: getNightOverlayAlpha(astronomy.solarTransitMinutes),
    sunsetAlpha: getNightOverlayAlpha(astronomy.sunsetMinutes),
    duskAlpha: getNightOverlayAlpha(astronomy.sunsetMinutes + astronomy.civilTwilightMinutes),
    sunset: getSunLightVisualState(astronomy.sunsetMinutes),
    civilDusk: getSunLightVisualState(astronomy.sunsetMinutes + astronomy.civilTwilightMinutes),
  })`, context);

  assert.equal(values.sunriseAlpha, 0.08);
  assert.equal(values.noonAlpha, 0);
  assert.equal(values.sunsetAlpha, 0.02);
  assert.equal(values.duskAlpha, 0.18);
  assert.equal(values.sunset.active, true);
  assert.equal(values.sunset.sunsetStrength, 1);
  assert.equal(values.civilDusk.sunsetStrength, 0.32);
  assert.equal(vm.runInContext("city.weather.condition = 'cloudy'; getSunLightVisualState(astronomy.sunsetMinutes).active", context), false);
});

test('15:51 in November stays blue and has no sunset sea glitter', () => {
  const context = createWeatherContext(recordFor(11, 15));
  const state = vm.runInContext(`({
    sky: getSkyBackgroundColor(15 * 60 + 51),
    sun: getSunLightVisualState(15 * 60 + 51),
    lateAfternoon: getDayNightVisualKeyframes().find((frame) => frame.key === 'lateAfternoon').minute,
    goldenHour: getDayNightVisualKeyframes().find((frame) => frame.key === 'goldenHour').minute,
  })`, context);
  const red = (state.sky >> 16) & 0xff;
  const blue = state.sky & 0xff;
  assert.ok(red < 150 && blue > 220, `expected blue afternoon, got #${state.sky.toString(16)}`);
  assert.equal(state.sun.sunsetStrength, 0);
  assert.equal(state.lateAfternoon, 16 * 60 + 25);
  assert.equal(state.goldenHour, 17 * 60 + 10);
});

test('stars fade at astronomical twilight and disappear under cloud', () => {
  const context = createWeatherContext();
  const states = vm.runInContext(`({
    beforeDawn: getStarFieldVisualState(astronomy.sunriseMinutes - astronomy.astronomicalTwilightMinutes - 1),
    sunrise: getStarFieldVisualState(astronomy.sunriseMinutes),
    noon: getStarFieldVisualState(astronomy.solarTransitMinutes),
    afterDusk: getStarFieldVisualState(astronomy.sunsetMinutes + astronomy.astronomicalTwilightMinutes + 1),
  })`, context);
  assert.equal(states.beforeDawn.alpha, 0.9);
  assert.equal(states.sunrise.active, false);
  assert.equal(states.noon.active, false);
  assert.equal(states.afterDusk.alpha, 0.9);
  assert.equal(vm.runInContext("city.weather.condition = 'cloudy'; getStarFieldVisualState(0).active", context), false);
});

test('moon crosses east to west over a clear cross-midnight HKO rise/set arc', () => {
  const astronomy = recordFor(1, 1);
  const context = createWeatherContext(astronomy);
  const states = vm.runInContext(`({
    evening: getMoonVisualState(20 * 60),
    beforeSet: getMoonVisualState(3 * 60),
    daytime: getMoonVisualState(10 * 60),
  })`, context);
  assert.equal(states.evening.active, true);
  assert.equal(states.beforeSet.active, true);
  assert.ok(states.beforeSet.xRatio > states.evening.xRatio);
  assert.equal(states.daytime.active, false);
  assert.equal(states.evening.phase, astronomy.moonPhase);
});

test('celestial layers stay behind terrain while weather and night masks stay above it', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.match(main, /scene\.starField\.setDepth\(-100\)/);
  assert.match(main, /scene\.moonSprite\.setDepth\(-99\)/);
  assert.match(main, /scene\.nightOverlay\.setDepth\(999997\)/);
  assert.match(main, /minimal: \{ frequency: 9000, lifespan: 30000/);
  assert.match(main, /duration: CLOUD_CLEARING_FADE_MS/);
});
