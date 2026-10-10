const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { createCoastalWeatherService } = require('../coastal-weather-service');

function report() {
  return {
    updateTime: '2026-10-09T09:45:00+08:00', warnings: '全部區域吹強風。',
    generalSituation: '東北季候風影響香港。', tcInfo: '',
    weatherForecast: { data: [
      { locationName: '香港鄰近海域', windInfo: '吹東北風4至5級。', weatherDescription: '', seaSituation: '海有中浪。' },
      { locationName: '北部灣以南', windInfo: '吹東風6級。', weatherDescription: '有驟雨。', seaSituation: '海有大浪。' },
    ] },
    weatherReport: { data: [{ locationName: '澳門', windInfo: '吹東風2級', visibilityInfo: { value: '', unit: '' } }] },
  };
}

function renderer() {
  let now = 1000;
  const calls = { fetch: 0, intervals: [], events: {}, windowEvents: {}, clock: {} };
  class FakeDate extends Date { static now() { return now; } }
  const city = { year: 1900, month: 1 };
  const context = vm.createContext({
    city, Date: FakeDate, Intl, AbortSignal,
    getTyphoonShelterState: () => ({ shelters: [{ status: 'operational' }] }),
    fetch: async () => { calls.fetch++; return { ok: true, json: async () => ({ report: report() }) }; },
    localStorage: { getItem: () => null, setItem: () => {} },
    setInterval: fn => { calls.intervals.push(fn); return calls.intervals.length; }, clearInterval: () => {},
    onGameClockEvent: (name, fn) => { calls.clock[name] = fn; },
    document: { hidden: false, getElementById: () => null, addEventListener: (name, fn) => { calls.events[name] = fn; } },
    window: { addEventListener: (name, fn) => { calls.windowEvents[name] = fn; } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../coastal-weather.js'), 'utf8'), context);
  return { city, calls, context, run: code => vm.runInContext(code, context), setNow: value => { now = value; } };
}

test('broadcast preserves forecast facts, rewrites both place names, omits blank visibility and credits HKO', () => {
  const r = renderer();
  r.context.input = report();
  const text = r.run('buildCoastalBroadcast(input).join(" ")');
  assert.equal(r.run('buildCoastalBroadcast(input).length'), 1);
  assert.equal((text.match(/【881香城電台第一台】/g) || []).length, 1);
  assert.ok(text.startsWith('【881香城電台第一台】現在播送華南海域天氣報告。'));
  assert.match(text, /香城鄰近海域，吹東北風/);
  assert.doesNotMatch(text, /【華南海域天氣報告】|\n/);
  assert.match(text, /香城鄰近海域/);
  assert.match(text, /東京灣以南/);
  assert.match(text, /東北風4至5級/);
  assert.doesNotMatch(text, /以下資料於|現實時間|2026|UTC/);
  assert.match(text, /資料來源：香港天文台/);
  assert.doesNotMatch(text, /北部灣|香港鄰近|能見度|undefined/);
});

test('loads refresh once; game months enqueue from cache, survive reload and replace missed quarters', async () => {
  const r = renderer();
  r.run('startCoastalWeatherSession()');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(r.calls.fetch, 1);
  r.city.month = 3; r.calls.clock['gameclock:month']();
  assert.equal(r.city.coastalWeather.pending.length, 0);
  r.city.month = 4; r.calls.clock['gameclock:month']();
  assert.equal(r.city.coastalWeather.pending.length, 1);
  assert.equal(r.calls.fetch, 1);
  r.run('takePendingCoastalTickerHeadline()');
  const remaining = r.city.coastalWeather.pending.length;
  r.run('startCoastalWeatherSession()');
  r.calls.clock['gameclock:month']();
  assert.equal(r.city.coastalWeather.pending.length, remaining);
  assert.equal(r.calls.fetch, 2);
  r.city.month = 11; r.calls.clock['gameclock:month']();
  assert.equal(r.city.coastalWeather.lastBroadcastMonth, 1900 * 12 + 9);
  assert.equal(r.city.coastalWeather.pending.length, remaining + 1);
});

test('wall clock refresh catches up once after sleep and stops on session reset', async () => {
  const r = renderer();
  r.run('startCoastalWeatherSession()');
  await new Promise(resolve => setImmediate(resolve));
  r.setNow(1000 + 7200000 - 1); r.calls.windowEvents.focus();
  assert.equal(r.calls.fetch, 1);
  r.setNow(1000 + 7200000 * 3); r.calls.events.visibilitychange();
  r.calls.windowEvents.focus();
  assert.equal(r.calls.fetch, 2);
  r.run('stopCoastalWeatherSession()');
  r.setNow(1000 + 7200000 * 4); r.calls.intervals[0]();
  assert.equal(r.calls.fetch, 2);
});

test('missing report skips quarterly broadcast without network requests', () => {
  const r = renderer();
  r.run('coastalSessionActive = true; ensureCoastalCityState()');
  r.city.month = 4; r.calls.clock['gameclock:month']();
  assert.equal(r.city.coastalWeather.pending.length, 0);
  assert.equal(r.calls.fetch, 0);
});

test('weather panel shows cached report without a shelter, updates after refresh and handles unavailable data', async () => {
  const r = renderer();
  const panel = { textContent: '' };
  r.context.document.getElementById = id => id === 'weather-coastal-report' ? panel : null;
  r.context.t = () => '暫時未有華南海域天氣報告。';
  r.context.getTyphoonShelterState = () => ({ shelters: [] });
  r.run('updateCoastalWeatherPanel()');
  assert.equal(panel.textContent, '暫時未有華南海域天氣報告。');
  r.run('startCoastalWeatherSession()');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(panel.textContent, /^【881香城電台第一台】/);
  assert.match(panel.textContent, /東京灣以南/);
  assert.doesNotMatch(panel.textContent, /現實時間/);
  assert.equal(r.calls.fetch, 1);
  r.run('updateCoastalWeatherPanel()');
  assert.equal(r.calls.fetch, 1);
});

test('broadcast requires a built shelter and clears queued reports when the last shelter is removed', async () => {
  const r = renderer();
  let shelters = [];
  r.context.getTyphoonShelterState = () => ({ shelters });
  r.run('startCoastalWeatherSession()');
  await new Promise(resolve => setImmediate(resolve));
  for (const status of [null, 'planned', 'construction']) {
    shelters = status ? [{ status }] : [];
    r.city.month += 3;
    r.calls.clock['gameclock:month']();
    assert.equal(r.city.coastalWeather.pending.length, 0);
  }
  shelters = [{ status: 'operational' }];
  r.city.year++; r.city.month = 1;
  r.calls.clock['gameclock:month']();
  assert.equal(r.city.coastalWeather.pending.length, 1);
  shelters = [{ status: 'built' }];
  assert.equal(r.run('hasCoastalBroadcastShelter()'), true);
  shelters = [];
  assert.equal(r.run('takePendingCoastalTickerHeadline()'), null);
  assert.equal(r.city.coastalWeather.pending.length, 0);
  r.city.coastalWeather.pending = ['【華南海域天氣報告】saved bulletin'];
  r.run('startCoastalWeatherSession()');
  assert.equal(r.city.coastalWeather.pending.length, 0);
  assert.equal(r.calls.fetch, 2);
});

test('ticker lets emergencies interrupt and then resumes the same bulletin before ads', () => {
  const r = renderer();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../hud-ticker.js'), 'utf8'), r.context);
  r.context.t = (_key, values) => values.headline;
  r.run('coastalSessionActive = true; ensureCoastalCityState(); city.coastalWeather.pending = ["segment one", "segment two"]; getUrgentCityNews = () => "warning"; tickerCycleCount = 2');
  assert.equal(r.run('pickTickerNewsHeadline().text'), 'warning');
  assert.equal(r.city.coastalWeather.pending.length, 2);
  r.run('tickerCycleCount = 3');
  assert.equal(r.run('pickTickerNewsHeadline().text'), 'segment one');
  r.run('getUrgentCityNews = () => null; tickerCycleCount = 4');
  assert.equal(r.run('pickTickerNewsHeadline().text'), 'segment two');
});

test('service shares in-flight requests and returns previous bulletin on outage or invalid response', async () => {
  let count = 0;
  const service = createCoastalWeatherService(async () => {
    count++;
    if (count === 2) throw new Error('offline');
    return { ok: true, json: async () => count === 3 ? {} : report() };
  });
  const [a, b] = await Promise.all([service.refresh(), service.refresh()]);
  assert.equal(count, 1);
  assert.equal(a, b);
  assert.equal((await service.refresh()).stale, true);
  assert.equal((await service.refresh()).report.updateTime, a.report.updateTime);
  const empty = createCoastalWeatherService(async () => { throw new Error('offline'); });
  await assert.rejects(empty.refresh(), /offline/);
});
