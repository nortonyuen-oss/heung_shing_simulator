const assert = require('node:assert/strict');
const test = require('node:test');
const fleet = require('../typhoon-shelter-fleet.js');
const storm = require('../typhoon-shelter-storm.js');

const {
  TYPHOON_SHELTER_STORM: S, classifyTyphoonShelterWeather, predictTyphoonShelterPeakStage, typhoonShelterVisitorDemand,
  allocateTyphoonShelterVisitors, typhoonShelterVisitorState, stepTyphoonShelterStorm, getTyphoonShelterStormPhase,
  isTyphoonShelterStormFreeze, normalizeTyphoonShelterStorm,
} = storm;

const weather = (typhoonStage, extra = {}) => ({
  typhoonStage, rainWarning: 'none', typhoonActive: typhoonStage !== 'none', typhoonName: '小犬', typhoonPeakWindKph: 70, ...extra,
});
const free = (n, prefix = 's') => Array.from({ length: n }, (_, i) => ({ key: `${prefix}${i}`, size: i % 4 === 3 ? 1 : 2, routeLength: 40 - i }));

test('the weather reads as the storm phases', () => {
  assert.equal(classifyTyphoonShelterWeather(weather('none')), 'clear');
  assert.equal(classifyTyphoonShelterWeather(weather('signal1')), 'standby');
  assert.equal(classifyTyphoonShelterWeather(weather('signal3')), 'recall');
  assert.equal(classifyTyphoonShelterWeather(weather('none', { rainWarning: 'black' })), 'recall');
  assert.equal(classifyTyphoonShelterWeather(weather('signal10')), 'shelter');
  // the strongest hour blows at about peak + 16 km/h (sim-weather.js)
  assert.equal(predictTyphoonShelterPeakStage(30), 'signal3');
  assert.equal(predictTyphoonShelterPeakStage(70), 'signal8');
  assert.equal(predictTyphoonShelterPeakStage(110), 'signal10');
  // (10 + 0.2 x berths) x factor: 60 berths under 八號 -> 22
  assert.equal(typhoonShelterVisitorDemand('signal8', 60), 22);
  assert.equal(typhoonShelterVisitorDemand('signal1', 60), 0);
});

test('visitors fill the free berths in proportion, the rest are turned away', () => {
  const shelters = [
    { id: 'ts1', protection: 80, free: free(10) },
    { id: 'ts2', protection: 40, free: free(5) },
  ];
  const all = allocateTyphoonShelterVisitors(9, shelters, { seed: 1, from: 1000 });
  assert.equal(all.turnedAway, 0);
  assert.equal(all.visitors.filter((v) => v.shelterId === 'ts1').length, 6, 'two-thirds and the odd one to the better protected');
  assert.equal(all.visitors.filter((v) => v.shelterId === 'ts2').length, 3);
  // never two on one berth; deepest berths first, one after another
  const ts1 = all.visitors.filter((v) => v.shelterId === 'ts1');
  assert.deepEqual(ts1.map((v) => v.slot), ['s0', 's1', 's2', 's3', 's4', 's5']);
  ts1.slice(1).forEach((v, i) => assert.ok(v.startAt - ts1[i].startAt >= S.visitorMinGap));
  assert.ok(ts1[0].startAt >= 1000 + S.visitorArriveDelay, 'after the shelter\'s own boats are in');
  assert.ok(ts1.every((v) => (v.slot === 's3' ? v.model.startsWith('sanpan') : v.model.startsWith('fishingBoat'))), 'hull to berth size');
  // more than there is room for
  const over = allocateTyphoonShelterVisitors(40, shelters, { seed: 1, from: 0 });
  assert.equal(over.visitors.length, 15);
  assert.equal(over.turnedAway, 25);
  assert.equal(allocateTyphoonShelterVisitors(5, [], {}).turnedAway, 5, 'no shelter, all turned away');
});

test('a visitor sails in, lies at its berth and leaves after the storm', () => {
  const v = { id: 1, startAt: 100, leaveAt: null };
  const L = 20;
  const speed = fleet.TYPHOON_SHELTER_FLEET.speedTilesPerMinute;
  assert.equal(typhoonShelterVisitorState(v, L, 50).mode, 'away');
  const coming = typhoonShelterVisitorState(v, L, 110);
  assert.equal(coming.mode, 'in');
  assert.equal(coming.distance, L - 10 * speed);
  assert.equal(typhoonShelterVisitorState(v, L, 100 + L / speed + 1).mode, 'moored');
  assert.equal(typhoonShelterVisitorState(v, L, 99999).mode, 'moored', 'stays until the storm is over');
  const leaving = { ...v, leaveAt: 1000 };
  assert.equal(typhoonShelterVisitorState(leaving, L, 1010).mode, 'out');
  assert.equal(typhoonShelterVisitorState(leaving, L, 1000 + L / speed + 1).mode, 'gone');
});

// Steps the storm hour by hour through a list of signals.
function run(signals, { shelters, start = 10 * 1440, totalBerths = 30, from = null } = {}) {
  let s = from;
  const log = [];
  signals.forEach((stage, i) => {
    const minute = start + i * 60;
    const out = stepTyphoonShelterStorm(s, { weather: typeof stage === 'string' ? weather(stage) : stage, minute, shelters, totalBerths, seed: 3 });
    s = out.storm;
    log.push({ minute, stage, storm: s, events: out.events });
  });
  return { storm: s, log };
}

test('a storm, hour by hour: standby, recall, visitors, shelter, two safe hours, resume, settle once', () => {
  const shelters = [{ id: 'ts1', name: 'A', protection: 50, worksValue: 100000, boats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], free: free(8) }];
  const signals = ['signal1', 'signal1', 'signal3', 'signal3', 'signal8', 'signal8', 'signal8', 'signal3', 'signal1', 'signal1', 'none', 'none'];
  const { log } = run(signals, { shelters });
  const at = (i) => log[i].storm;
  // 一號 opens a standby; no hold yet, no visitors
  assert.deepEqual(at(0).standbys, [{ from: log[0].minute, until: null }]);
  assert.equal(at(0).holds.length, 0);
  // 三號: the hold opens, visitors are given berths once
  assert.equal(at(2).holds[0].from, log[2].minute);
  assert.ok(log[2].events.some((e) => e.type === 'visitors'));
  const demand = typhoonShelterVisitorDemand('signal8', 30);
  assert.equal(at(2).demand, demand);
  assert.equal(at(2).visitors.length + at(2).turnedAway, demand);
  assert.ok(!log[3].events.some((e) => e.type === 'visitors'), 'not again next hour');
  // 八號: those not yet on their way are turned away; damage builds only from here
  const late = at(3).visitors.filter((v) => v.startAt > log[4].minute).length;
  assert.equal(at(4).visitors.length, at(3).visitors.length - late);
  assert.equal(at(4).turnedAway, at(3).turnedAway + late);
  assert.equal(at(3).damage.ts1, undefined);
  assert.ok(Math.abs(at(6).damage.ts1 - 3 * 0.25) < 1e-9, '(1 - 0.5)^2 an hour at 八號');
  // down to 一號 at hour 8: two safe hours later (hour 10) the boats may sail again
  assert.equal(at(8).holds[0].until, null);
  assert.equal(at(9).holds[0].until, null);
  assert.equal(at(10).holds[0].until, log[10].minute);
  assert.ok(log[10].events.some((e) => e.type === 'resume'));
  // the standby closes when the signals are all down
  assert.equal(at(10).standbys[0].until, log[10].minute);
  // the bill, once
  const settled = log.flatMap((l) => l.events).filter((e) => e.type === 'settled');
  assert.equal(settled.length, 1);
  const r = settled[0].report.shelters.ts1;
  assert.equal(r.repair, Math.round(100000 * Math.min(S.repairCap, S.repairPerDamage * 0.75)));
  assert.ok(r.damagedBoats.every((b) => b.repairUntil > log[10].minute));
  // visitors leave over the next hours, nearest the entrance first
  const leaving = at(10).visitors;
  assert.ok(leaving.every((v) => v.leaveAt >= log[10].minute + S.visitorLeaveDelay));
  assert.ok(leaving[0].leaveAt > leaving[leaving.length - 1].leaveAt, 'the deepest berth leaves last');
  assert.equal(getTyphoonShelterStormPhase(at(10), weather('none'), log[10].minute + 1), 'recovery');
  assert.ok(isTyphoonShelterStormFreeze(at(10), log[10].minute + 60), 'works wait until the visitors are gone');
  const lastOut = Math.max(...leaving.map((v) => v.leaveAt)) + S.visitorGoneAfter;
  assert.ok(!isTyphoonShelterStormFreeze(at(10), lastOut + 1));
  // signals down: only the shelter the visitors lie in waits; another builds while they leave
  const visited = leaving[0].shelterId;
  assert.ok(isTyphoonShelterStormFreeze(at(10), log[10].minute + 60, visited));
  assert.ok(!isTyphoonShelterStormFreeze(at(10), log[10].minute + 60, 'ts-elsewhere'));
  // but while the signals are up, every shelter waits
  assert.ok(isTyphoonShelterStormFreeze(at(9), log[9].minute, 'ts-elsewhere'));
  // stepping the same hour twice changes nothing
  const again = stepTyphoonShelterStorm(at(10), { weather: weather('none'), minute: log[10].minute, shelters, totalBerths: 30 });
  assert.equal(again.events.length, 0);
});

test('a signal that comes back within two hours restarts the count', () => {
  const shelters = [{ id: 'ts1', protection: 90, worksValue: 0, boats: [], free: [] }];
  const { log } = run(['signal3', 'signal1', 'signal3', 'signal1', 'signal1', 'none'], { shelters });
  assert.equal(log[3].storm.holds[0].until, null);
  assert.equal(log[4].storm.holds[0].until, null);
  assert.equal(log[5].storm.holds[0].until, log[5].minute, 'two safe hours from hour 3');
  assert.equal(log[5].storm.holds.length, 1, 'one hold, not one per dip');
});

test('black rain holds the boats but brings no visitors', () => {
  const shelters = [{ id: 'ts1', protection: 50, worksValue: 0, boats: [], free: free(6) }];
  const rain = { typhoonStage: 'none', rainWarning: 'black', typhoonActive: false };
  const { log } = run([rain, rain], { shelters });
  assert.equal(log[1].storm.holds.length, 1);
  assert.equal(log[1].storm.visitors.length, 0);
});

test('protection decides the bill: a fjord shrugs off a 八號, an open-sea shelter pays for a 十號', () => {
  const bill = (protection, signals) => {
    const shelters = [{ id: 'x', protection, worksValue: 1000000, boats: Array.from({ length: 20 }, (_, i) => i + 1), free: [] }];
    const { log } = run([...signals, 'none', 'none', 'none'], { shelters });
    return log.flatMap((l) => l.events).find((e) => e.type === 'settled').report.shelters.x;
  };
  const fjord = bill(85, Array(8).fill('signal8'));
  const open = bill(45, [...Array(6).fill('signal10'), ...Array(6).fill('signal8')]);
  assert.ok(fjord.repair <= 1000000 * 0.005, `fjord ${fjord.repair}`);
  assert.equal(fjord.damagedBoats.length, 0);
  assert.ok(open.repair > 1000000 * 0.1 && open.repair < 1000000 * 0.15, `open sea ${open.repair}`);
  assert.ok(open.damagedBoats.length >= 3, `${open.damagedBoats.length} boats`);
});

test('the far boats stay in under 一號 and those out come home early', () => {
  const boat = { id: 3, model: 'fishingBoat3', slot: 'x' };
  const day = 5;
  const t0 = day * 1440;
  const L = 20;
  const times = { depart: 1080, arrive: 1700, resumeOffset: 0, longRoute: true };
  const trip = (storm, t = times) => fleet.typhoonShelterBoatTrip(boat, day, { storm, times: t, routeLength: L });
  const standby = { holds: [], standbys: [{ from: t0 + 1000, until: null }] };
  assert.equal(trip(standby), null, 'a far boat does not sail');
  assert.equal(trip(standby, { ...times, longRoute: false }).backAbs, t0 + 1080 + fleet.TYPHOON_SHELTER_FLEET.standbyTurnBackMin,
    'a near one is back within two hours');
  // a boat already out when 一號 goes up turns for home within two hours of it
  assert.equal(trip({ holds: [], standbys: [{ from: t0 + 1200, until: null }] }).backAbs, t0 + 1200 + fleet.TYPHOON_SHELTER_FLEET.standbyTurnBackMin);
  // after a storm the boats sail one by one: each its own minutes after the hold closes
  const hold = { holds: [{ from: t0 - 600, until: t0 + 1070 }], standbys: [] };
  assert.ok(trip(hold, { ...times, resumeOffset: 0 }));
  assert.equal(trip(hold, { ...times, resumeOffset: 20 }), null);
});

test('the storm survives the save normaliser and an empty one is dropped', () => {
  const shelters = [{ id: 'ts1', protection: 50, worksValue: 1000, boats: [1], free: free(4) }];
  const { storm: s } = run(['signal3', 'signal8'], { shelters });
  const loaded = normalizeTyphoonShelterStorm(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(loaded.holds, s.holds);
  assert.deepEqual(loaded.visitors, s.visitors);
  assert.deepEqual(loaded.damage, s.damage);
  assert.equal(loaded.allocatedFor, s.allocatedFor);
  assert.equal(normalizeTyphoonShelterStorm({ holds: [], standbys: [], visitors: [] }), null);
  assert.equal(normalizeTyphoonShelterStorm(null), null);
  // a clear sky with nothing left to do ends the record
  const done = run(['none'], { shelters, from: { ...s, holds: [{ from: 0, until: 60 }], standbys: [], visitors: [] }, start: 20 * 1440 });
  assert.equal(done.storm, null);
});
