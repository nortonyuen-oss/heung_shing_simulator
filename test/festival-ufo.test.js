const assert = require('node:assert/strict');
const test = require('node:test');
const {
  UFO_SIGHTING, getScheduledUfoSighting, getUfoTimeline, getUfoPhase, getUfoSkyMinute, getUfoOffset,
  getUfoLoopOffset, getUfoTravelPoint, pickUfoRoute, isUfoWeatherClear,
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
  hits.forEach((s) => {
    assert.ok(s.startMinute >= UFO_SIGHTING.earliestMinute && s.startMinute < UFO_SIGHTING.latestMinute);
    assert.ok(s.stops >= UFO_SIGHTING.minStops && s.stops <= UFO_SIGHTING.maxStops);
  });
  assert.ok(new Set(hits.map((s) => s.stops)).size > 1, 'some nights it visits more districts than others');
  assert.deepEqual(months(120), months(120), 'deterministic');
  // gone before 04:00 whenever it comes, however many stops
  const longest = getUfoTimeline({ startMinute: UFO_SIGHTING.latestMinute, stops: UFO_SIGHTING.maxStops });
  assert.ok(longest[longest.length - 1].end <= 28 * 60, 'the latest, longest tour is over by 04:00');
});

test('the cooldown: none within 12 months of the last', () => {
  const at = 2010 * 12;
  assert.equal(getScheduledUfoSighting({ cityName: 'x', year: 2010, month: 1, monthIndex: at, lastMonthIndex: at - 3 }), null);
  // past the cooldown it is the roll again
  const free = getScheduledUfoSighting({ cityName: 'x', year: 2010, month: 1, monthIndex: at, lastMonthIndex: -1 });
  assert.deepEqual(getScheduledUfoSighting({ cityName: 'x', year: 2010, month: 1, monthIndex: at, lastMonthIndex: at - 12 }), free);
});

test('a tour: arrive, circle each stop with a trip between, leave - counted on past midnight', () => {
  const s = { startMinute: 23 * 60 + 30, stops: 3 };
  assert.deepEqual(getUfoTimeline(s).map((x) => x.phase + (x.to != null ? `${x.stop}>${x.to}` : x.stop)),
    ['arrive0', 'hover0', 'travel0>1', 'hover1', 'travel1>2', 'hover2', 'leave2']);
  assert.equal(getUfoPhase(s, 23 * 60), null);
  assert.equal(getUfoPhase(s, 23 * 60 + 40).phase, 'arrive');
  assert.deepEqual([getUfoPhase(s, 0).phase, getUfoPhase(s, 0).stop], ['hover', 0], '00:00 is circling the first stop');
  const trip = getUfoPhase(s, 25);
  assert.deepEqual([trip.phase, trip.stop, trip.to], ['travel', 0, 1]);
  assert.deepEqual([getUfoPhase(s, 40).phase, getUfoPhase(s, 40).stop], ['hover', 1]);
  assert.equal(getUfoPhase(s, 40).elapsed, 10, 'a circle counts from its own start');
  assert.equal(getUfoPhase(s, 60 + 45).phase, 'leave', '01:45: the three stops done');
  assert.equal(getUfoPhase(s, 2 * 60), null, 'gone by 01:54');
  assert.equal(getUfoPhase(s, 5 * 60), null);
  assert.equal(getUfoSkyMinute(30), 24 * 60 + 30);
  assert.equal(getUfoSkyMinute(7 * 60), 7 * 60);
});

test('the route: different districts, the best landmark in each, nearest next', () => {
  const c = (district, rank, row, col) => ({ target: { mode: 'tile', row, col }, tile: [row, col], rank, district, id: `${district}:${rank}:${row}:${col}` });
  const candidates = [
    c('a', 3, 10, 10), c('a', 0, 12, 12),          // district a: its park beats its sign
    c('b', 3, 100, 100), c('b', 1, 98, 98),
    c('c', 3, 50, 50), c('d', 2, 20, 200),
  ];
  const route = pickUfoRoute(candidates, 3, 'seed-1');
  assert.equal(route.length, 3);
  const picked = route.map((t) => candidates.find((x) => x.target === t));
  assert.equal(new Set(picked.map((x) => x.district)).size, 3, 'three different districts');
  picked.forEach((x) => {
    const best = Math.min(...candidates.filter((y) => y.district === x.district).map((y) => y.rank));
    assert.equal(x.rank, best, `${x.district}: its best landmark`);
  });
  // another night, another selection (over several seeds at least one differs)
  const sets = new Set(['s1', 's2', 's3', 's4', 's5'].map((seed) => pickUfoRoute(candidates, 3, seed).map((t) => `${t.row}`).sort().join()));
  assert.ok(sets.size > 1, 'not always the same districts');
  // a city with fewer districts than stops: other landmarks fill in
  assert.equal(pickUfoRoute(candidates.filter((x) => x.district === 'a'), 3, 'x').length, 2);
  assert.deepEqual(pickUfoRoute([], 3, 'x'), []);
});

test('the flight: in from far off, round the landmark, a hop and away', () => {
  const arriving = getUfoOffset({ phase: 'arrive', t: 0, elapsed: 0 }, 0);
  assert.ok(arriving.x < -800 && arriving.y < -400 && arriving.alpha === 0);
  const circling = [0, 3, 6, 9].map((m) => getUfoOffset({ phase: 'hover', t: 0.5, elapsed: m }, 0));
  circling.forEach((p) => assert.ok(Math.hypot(p.x, p.y) <= UFO_SIGHTING.loopRadiusPx + 8));
  assert.ok(new Set(circling.map((p) => Math.round(p.x))).size > 2, 'it moves round');
  // the arrival ends where the circling begins
  const end = getUfoOffset({ phase: 'arrive', t: 1, elapsed: UFO_SIGHTING.arriveMinutes }, 0);
  const start = getUfoOffset({ phase: 'hover', t: 0, elapsed: 0 }, 0);
  assert.ok(Math.abs(end.x - start.x) < 1 && Math.abs(end.y - start.y) < 1);
  const hop = getUfoOffset({ phase: 'leave', t: 0.15, elapsed: 0 }, 0);
  assert.ok(hop.sx > 1 && hop.sy < 1, 'squashed as it hops');
  // a trip between stops starts where the circle ended and ends where the next begins, rising between
  const A = { x: 0, y: 0 };
  const B = { x: 3000, y: 1200 };
  const out = getUfoTravelPoint(A, B, 0, 0);
  const loopEnd = getUfoLoopOffset(UFO_SIGHTING.hoverMinutes);
  assert.ok(Math.abs(out.x - loopEnd.x) < 1 && Math.abs(out.groundY - loopEnd.y) < 1 && Math.abs(out.lift) < 1);
  const arrive = getUfoTravelPoint(A, B, 1, 0);
  assert.ok(Math.abs(arrive.x - (B.x + getUfoLoopOffset(0).x)) < 1);
  assert.ok(getUfoTravelPoint(A, B, 0.5, 0).lift > UFO_SIGHTING.travelLiftPx * 0.9);
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
