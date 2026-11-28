// 紅的、綠的、藍的 by district (Norton, 2026-11-28), after the Transport Department's permitted
// operating areas of taxis.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const traffic = require('../traffic-visuals.js');

const { TRAFFIC_TAXI_MIX_BY_DISTRICT: MIX, pickWeightedTrafficModel, getTrafficModelSpawnWeight } = traffic;

function districtMapIds() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'hk-district-maps.js'), 'utf8').replace(/^const (HK_[A-Z_]+)/gm, 'var $1'), ctx);
  return ctx.HK_DISTRICT_MAPS.map((m) => m.id);
}

test('every district map (campaign chapters use them too) has a taxi mix that adds up', () => {
  const ids = districtMapIds();
  assert.ok(ids.length >= 18);
  for (const id of ids) {
    const mix = MIX[id];
    assert.ok(mix, `${id} has a mix`);
    const sum = ['red', 'green', 'blue'].reduce((s, c) => s + (mix[c] ?? 0), 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${id} adds to 1 (${sum})`);
  }
});

test('red alone on Hong Kong Island and in Kowloon; blue only on Lantau and at the airport; green in its New Territories', () => {
  for (const id of ['victoria-harbour', 'central-western', 'wan-chai', 'eastern', 'aberdeen', 'stanley', 'yau-tsim-mong', 'sham-shui-po', 'kowloon-city']) {
    assert.deepEqual(MIX[id], { red: 1 }, id);
  }
  for (const [id, mix] of Object.entries(MIX)) {
    if (mix.blue) assert.ok(['lantau', 'chek-lap-kok'].includes(id), `blue only on Lantau and Chek Lap Kok, not ${id}`);
  }
  for (const id of ['tuen-mun', 'yuen-long', 'tin-shui-wai', 'tai-po', 'sheung-shui', 'sai-kung']) {
    assert.ok(MIX[id].green > MIX[id].red, `${id}: green's own district`);
  }
  for (const id of ['tseung-kwan-o', 'tsuen-wan', 'tsing-yi', 'sha-tin', 'kwun-tong']) {
    assert.ok(MIX[id].green > 0 && MIX[id].green < 0.2, `${id}: green only on its routes`);
  }
  assert.ok(MIX.lantau.blue > MIX.lantau.green && MIX['chek-lap-kok'].red > MIX['chek-lap-kok'].blue);
});

test("the taxis keep their share of the traffic; a district only changes their colours", () => {
  const taxiShare = (mix) => {
    const counts = {};
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const model = pickWeightedTrafficModel(() => (i + 0.5) / n, undefined, mix);
      counts[model.id] = (counts[model.id] || 0) + 1;
    }
    const taxis = (counts.taxi_red || 0) + (counts.taxi_green || 0) + (counts.taxi_blue || 0);
    return { taxis: taxis / n, red: (counts.taxi_red || 0) / n, green: (counts.taxi_green || 0) / n, blue: (counts.taxi_blue || 0) / n };
  };
  const plain = taxiShare(null);
  const central = taxiShare(MIX['central-western']);
  const yuenLong = taxiShare(MIX['yuen-long']);
  const airport = taxiShare(MIX['chek-lap-kok']);
  assert.ok(Math.abs(central.taxis - plain.taxis) < 0.002 && Math.abs(yuenLong.taxis - plain.taxis) < 0.002);
  assert.equal(central.green + central.blue, 0, 'no green or blue taxi in 中西區');
  assert.ok(yuenLong.green > yuenLong.red * 2 && yuenLong.blue === 0);
  assert.ok(airport.blue > 0 && airport.green > 0 && airport.red > airport.green);
  // a map without a district keeps the registry's own mix
  assert.ok(plain.red > plain.green && plain.green > plain.blue && plain.blue > 0);
  assert.equal(getTrafficModelSpawnWeight({ id: 'taxi_green', category: 'taxi', weight: 3.12 }, null), 3.12);
});
