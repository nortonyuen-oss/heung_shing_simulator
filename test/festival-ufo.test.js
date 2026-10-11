const assert = require('node:assert/strict');
const test = require('node:test');
const {
  UFO_SIGHTING, getScheduledUfoSighting, getUfoPhase, getUfoSkyMinute, getUfoOffset, isUfoWeatherClear,
} = require('../festival-ufo.js');

const months = (count, lastMonthIndex = -1) => {
  const out = [];
  for (let i = 0; i < count; i++) {
    const year = 2000 + Math.floor(i / 12);
    const month = (i % 12) + 1;
    out.push(getScheduledUfoSighting({ cityName: '香城', year, month, monthIndex: year * 12 + month - 1, lastMonthIndex }));
  }
  return out;
};

test('a sighting is a fixed roll of the city and month: rare, at night, the same every time', () => {
  const all = months(1200);
  const hits = all.filter(Boolean);
  // 6% a month (with no cooldown in this count)
  assert.ok(hits.length > 1200 * 0.04 && hits.length < 1200 * 0.08, `${hits.length} sightings in 100 years`);
  hits.forEach((s) => assert.ok(s.startMinute >= UFO_SIGHTING.earliestMinute && s.startMinute < UFO_SIGHTING.latestMinute));
  assert.deepEqual(months(120), months(120), 'deterministic');
  // gone before 04:00 whenever it comes
  const last = UFO_SIGHTING.latestMinute + UFO_SIGHTING.arriveMinutes + UFO_SIGHTING.hoverMinutes + UFO_SIGHTING.leaveMinutes;
  assert.ok(last <= 28 * 60, 'the latest start is over by 04:00');
});

test('the cooldown: none within 12 months of the last', () => {
  const at = 2010 * 12;
  assert.equal(getScheduledUfoSighting({ cityName: 'x', year: 2010, month: 1, monthIndex: at, lastMonthIndex: at - 3 }), null);
  // past the cooldown it is the roll again
  const free = getScheduledUfoSighting({ cityName: 'x', year: 2010, month: 1, monthIndex: at, lastMonthIndex: -1 });
  assert.deepEqual(getScheduledUfoSighting({ cityName: 'x', year: 2010, month: 1, monthIndex: at, lastMonthIndex: at - 12 }), free);
});

test('phases: arrive, circle, leave - counted on past midnight', () => {
  const s = { startMinute: 23 * 60 + 30 };
  assert.equal(getUfoPhase(s, 23 * 60), null);
  assert.equal(getUfoPhase(s, 23 * 60 + 40).phase, 'arrive');
  assert.equal(getUfoPhase(s, 30).phase, 'hover', '00:30 is 50 minutes in');
  const leaveAt = (23 * 60 + 30 + UFO_SIGHTING.arriveMinutes + UFO_SIGHTING.hoverMinutes + 5) % 1440;
  assert.equal(getUfoPhase(s, leaveAt).phase, 'leave');
  assert.equal(getUfoPhase(s, 5 * 60), null);
  assert.equal(getUfoSkyMinute(30), 24 * 60 + 30);
  assert.equal(getUfoSkyMinute(7 * 60), 7 * 60);
});

test('the flight: in from far off, round the landmark, a hop and away', () => {
  const arriving = getUfoOffset({ phase: 'arrive', t: 0, elapsed: 0 }, 0);
  assert.ok(arriving.x < -800 && arriving.y < -400 && arriving.alpha === 0);
  const circling = [0, 4, 8, 12].map((m) => getUfoOffset({ phase: 'hover', t: 0.5, elapsed: UFO_SIGHTING.arriveMinutes + m }, 0));
  circling.forEach((p) => assert.ok(Math.hypot(p.x, p.y) <= UFO_SIGHTING.loopRadiusPx + 8));
  assert.ok(new Set(circling.map((p) => Math.round(p.x))).size > 2, 'it moves round');
  // the arrival ends where the circling begins
  const end = getUfoOffset({ phase: 'arrive', t: 1, elapsed: UFO_SIGHTING.arriveMinutes }, 0);
  const start = getUfoOffset({ phase: 'hover', t: 0, elapsed: UFO_SIGHTING.arriveMinutes }, 0);
  assert.ok(Math.abs(end.x - start.x) < 1 && Math.abs(end.y - start.y) < 1);
  const hop = getUfoOffset({ phase: 'leave', t: 0.15, elapsed: 0 }, 0);
  assert.ok(hop.sx > 1 && hop.sy < 1, 'squashed as it hops');
  const gone = getUfoOffset({ phase: 'leave', t: 0.999, elapsed: 0 }, 0);
  assert.ok(gone.x > 1000 && gone.y < -700 && gone.alpha < 0.1);
});

test('no visitor on a wet or stormy night', () => {
  assert.equal(isUfoWeatherClear({ condition: 'clear', typhoonStage: 'none', rainWarning: 'none' }), true);
  assert.equal(isUfoWeatherClear({ condition: 'cool' }), true);
  assert.equal(isUfoWeatherClear({ condition: 'showers' }), false);
  assert.equal(isUfoWeatherClear({ condition: 'clear', typhoonStage: 'signal3' }), false);
  assert.equal(isUfoWeatherClear({ condition: 'clear', rainWarning: 'amber' }), false);
});
