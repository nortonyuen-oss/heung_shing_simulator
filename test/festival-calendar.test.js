const assert = require('node:assert/strict');
const test = require('node:test');
const { FESTIVAL_LUNAR_DATA } = require('../festival-lunar-data.js');
const { parseYearTable, parseLunarDay, parseLunarMonth } = require('../scripts/sync-lunar-calendar.js');
const {
  getLunarFestivalDate, getFestivalDate, getFestivalMonth, getFestivalsInMonth, getFestivalYearCalendar,
} = require('../festival-calendar.js');
const {
  FESTIVAL_SWITCHABLE_IDS, createFestivalState, normalizeFestivalState, isGovernmentFestival,
  isQuietFestival, isFestivalHeldInYear,
} = require('../festivals.js');

test('the lunar table covers 1901-2100 with four dates a year', () => {
  assert.equal(FESTIVAL_LUNAR_DATA.firstYear, 1901);
  assert.equal(FESTIVAL_LUNAR_DATA.rows.length, 200);
  FESTIVAL_LUNAR_DATA.rows.forEach((row, i) => {
    const dates = row.split(' ').map((mmdd) => [Number(mmdd.slice(0, 2)), Number(mmdd.slice(2))]);
    assert.equal(dates.length, 4, `${1901 + i}`);
    const [newYear, dragonBoat, ghost, midAutumn] = dates;
    // 正月初一 21 Jan - 20 Feb; the others in their usual windows and in order
    assert.ok(newYear[0] === 1 ? newYear[1] >= 21 : newYear[0] === 2 && newYear[1] <= 20, `${1901 + i} newYear ${newYear}`);
    assert.ok(dragonBoat[0] >= 5 && dragonBoat[0] <= 6, `${1901 + i} dragonBoat ${dragonBoat}`);
    assert.ok(ghost[0] >= 8 && ghost[0] <= 9, `${1901 + i} ghost ${ghost}`);
    assert.ok(midAutumn[0] >= 9 && midAutumn[0] <= 10, `${1901 + i} midAutumn ${midAutumn}`);
  });
});

test('known festival dates', () => {
  const date = (key, year) => { const d = getLunarFestivalDate(key, year); return [d.month, d.day]; };
  assert.deepEqual(date('newYear', 2023), [1, 22]);
  assert.deepEqual(date('dragonBoat', 2023), [6, 22]);
  assert.deepEqual(date('midAutumn', 2023), [9, 29]);
  assert.deepEqual(date('newYear', 2025), [1, 29]);
  assert.deepEqual(date('dragonBoat', 2025), [5, 31]);
  assert.deepEqual(date('midAutumn', 2025), [10, 6]);
  assert.deepEqual(date('newYear', 2026), [2, 17]);
  assert.deepEqual(date('ghost', 2026), [8, 26]);
  assert.equal(getLunarFestivalDate('newYear', 2026).approximate, false);
});

test('新春 is held in the month of 除夕, the day before 正月初一', () => {
  // 2026: 正月初一 17 Feb, 除夕 16 Feb
  assert.deepEqual(getFestivalDate('lunarNewYear', 2026), { year: 2026, month: 2, day: 16, approximate: false });
  // a 正月初一 on 1 Feb would put 除夕 in January
  const year = FESTIVAL_LUNAR_DATA.rows.findIndex((row) => row.startsWith('0201')) + FESTIVAL_LUNAR_DATA.firstYear;
  assert.ok(year > 1900, 'some year has 正月初一 on 1 February');
  assert.deepEqual(getFestivalDate('lunarNewYear', year), { year, month: 1, day: 31, approximate: false });
});

test('years outside the table borrow the date from a Metonic year, and say so', () => {
  const y1900 = getLunarFestivalDate('newYear', 1900);
  const y1919 = getLunarFestivalDate('newYear', 1919);
  assert.equal(y1900.approximate, true);
  assert.deepEqual([y1900.month, y1900.day], [y1919.month, y1919.day]);
  const late = getLunarFestivalDate('midAutumn', 2150);
  assert.equal(late.approximate, true);
  assert.ok(late.month === 9 || late.month === 10);
});

test('fixed-date festivals and the month lists', () => {
  assert.equal(getFestivalMonth('june4', 1904), 6);
  assert.equal(getFestivalMonth('christmas', 1904), 12);
  assert.equal(getFestivalMonth('ufo', 1904), null, 'the UFO has no date');
  assert.equal(getFestivalMonth('nope', 1904), null);
  // 2026: 端午 19 June, so June holds both
  assert.deepEqual(getFestivalsInMonth(2026, 6), ['june4', 'dragonBoat', 'bunHill']);
  // 年初二煙花 two days after 除夕, the same month this year
  assert.deepEqual(getFestivalsInMonth(2026, 2), ['lunarNewYear', 'lnyFireworks']);
  assert.deepEqual(getFestivalsInMonth(2026, 3), []);
  assert.deepEqual(getFestivalYearCalendar(2026).map((e) => e.id), ['lunarNewYear', 'lnyFireworks', 'june4', 'dragonBoat', 'bunHill', 'yulan', 'midAutumn', 'christmas']);
});

test('the HKO table parser reads month names, days and skips leap months', () => {
  assert.equal(parseLunarDay('初一'), 1);
  assert.equal(parseLunarDay('初十'), 10);
  assert.equal(parseLunarDay('十五'), 15);
  assert.equal(parseLunarDay('二十'), 20);
  assert.equal(parseLunarDay('廿九'), 29);
  assert.equal(parseLunarDay('三十'), 30);
  assert.deepEqual(parseLunarMonth('正月'), { month: 1, leap: false });
  assert.deepEqual(parseLunarMonth('十一月'), { month: 11, leap: false });
  assert.deepEqual(parseLunarMonth('閏五月'), { month: 5, leap: true });
  assert.equal(parseLunarMonth('十五'), null);

  // a made-up year whose 五月 is followed by a 閏五月: 端午 is the first one
  const start = Date.UTC(2001, 0, 1);
  const lines = ['2001(辛巳)年公曆與農曆日期對照表', '', '公曆日期 農曆日期 星期 節氣'];
  const DAYS = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五',
    '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
  const months = ['十二月', '正月', '二月', '三月', '四月', '五月', '閏五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  let monthIndex = -1;
  let day = 20; // the year opens on the 21st of the 11th month
  for (let i = 0; i < 365; i++) {
    const d = new Date(start + i * 86400000);
    day += 1;
    if (day > 29) { day = 1; monthIndex += 1; }
    const cell = day === 1 ? months[monthIndex] : DAYS[day - 1];
    lines.push(`${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日    ${cell}    星期一`);
  }
  const found = parseYearTable(lines.join('\r\n'), 2001);
  // 正月 starts after 9 days of the 11th month's end + 29 of 十二月: day index 38 = 8 Feb
  assert.deepEqual(found.newYear, [2, 8]);
  // 五月 is month index 5: day 38 + 4 * 29 + 4 = 158 -> 8 June
  assert.deepEqual(found.dragonBoat, [6, 8]);
});

test('festival state: defaults, tiers only for government festivals, bad saves cleaned', () => {
  const fresh = createFestivalState();
  assert.equal(fresh.enabled, true);
  assert.deepEqual(Object.keys(fresh.festivals), FESTIVAL_SWITCHABLE_IDS);
  assert.equal(fresh.festivals.lunarNewYear.tier, 'standard');
  assert.equal(fresh.festivals.yulan.tier, null, 'community festivals have no tier');
  assert.equal(fresh.festivals.june4, undefined, '六四 has no switch of its own');
  assert.equal(fresh.festivals.ufo.tier, null);
  assert.equal(isGovernmentFestival('christmas'), true);
  assert.equal(isGovernmentFestival('yulan'), false);

  assert.deepEqual(normalizeFestivalState(undefined), fresh);
  const state = normalizeFestivalState({
    enabled: false,
    festivals: { christmas: { enabled: false, tier: 'grand' }, june4: { tier: 'grand' }, midAutumn: { tier: 'huge' }, bogus: {} },
    venues: { lunarNewYear: 'park-12', june4: 7 },
    history: [
      { id: 'christmas', year: 1950, outcome: 'held', attendance: 1200.7, cost: -5, income: 30 },
      { id: 'nope', year: 1950 },
      { id: 'dragonBoat', year: 'x' },
      { id: 'dragonBoat', year: 1951, outcome: 'exploded' },
    ],
    ufo: { lastMonthIndex: 640, sightings: 3 },
  });
  assert.equal(state.enabled, false);
  assert.deepEqual(state.festivals.christmas, { enabled: false, tier: 'grand' });
  assert.equal(state.festivals.june4, undefined);
  assert.equal(state.festivals.midAutumn.tier, 'standard');
  assert.equal(state.festivals.bogus, undefined);
  assert.equal(state.venues.lunarNewYear, 'park-12');
  assert.equal(state.venues.june4, '');
  assert.deepEqual(state.history, [
    { id: 'christmas', year: 1950, outcome: 'held', attendance: 1200, cost: 0, income: 30 },
    { id: 'dragonBoat', year: 1951, outcome: 'held', attendance: 0, cost: 0, income: 0 },
  ]);
  assert.deepEqual(state.ufo, { lastMonthIndex: 640, sightings: 3 });
});

test('六四 is quiet, held from 1990 and every year after, and follows only the master switch', () => {
  assert.equal(isQuietFestival('june4'), true);
  assert.equal(isQuietFestival('christmas'), false);
  assert.equal(isFestivalHeldInYear('june4', 1989), false);
  assert.equal(isFestivalHeldInYear('june4', 1990), true);
  assert.equal(isFestivalHeldInYear('june4', 2027), true);
  assert.equal(isFestivalHeldInYear('christmas', 1850), true);

  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const context = vm.createContext({ city: { festivals: null } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'festivals.js'), 'utf8'), context);
  const run = (code) => vm.runInContext(code, context);
  assert.equal(run("isFestivalEnabled('june4')"), true);
  run("setFestivalEnabled('june4', false)");
  assert.equal(run("isFestivalEnabled('june4')"), true, 'no switch of its own to turn off');
  run('setFestivalsEnabled(false)');
  assert.equal(run("isFestivalEnabled('june4')"), false);
  assert.equal(run("isFestivalEnabled('christmas')"), false);
});

test('開局年份: the new-city form offers 1850-now, and anything unknown starts in 1900', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'city-state.js'), 'utf8');
  const start = source.indexOf('const CITY_START_YEAR_OPTIONS');
  const end = source.indexOf('\n}\n', source.indexOf('function resolveCityStartYear')) + 3;
  const context = vm.createContext({});
  vm.runInContext(`${source.slice(start, end)}\nthis.api = { CITY_START_YEAR_OPTIONS, CITY_DEFAULT_START_YEAR, resolveCityStartYear };`, context);
  const { CITY_START_YEAR_OPTIONS, CITY_DEFAULT_START_YEAR, resolveCityStartYear } = context.api;
  assert.deepEqual([...CITY_START_YEAR_OPTIONS], [1850, 1900, 1950, 1980, 2000, 'now']);
  assert.equal(CITY_DEFAULT_START_YEAR, 1900);
  assert.equal(resolveCityStartYear('1850'), 1850, 'a <select> value is a string');
  assert.equal(resolveCityStartYear(1980), 1980);
  assert.equal(resolveCityStartYear('now', new Date(2026, 9, 11)), 2026);
  assert.equal(resolveCityStartYear('1066'), 1900);
  assert.equal(resolveCityStartYear(undefined), 1900);
  // 六四 shows in a city started in 1980 or later within its first decade
  assert.ok(resolveCityStartYear('1980') + 10 >= 1990);
});
