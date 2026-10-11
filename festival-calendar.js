// 節慶年曆: which calendar month each festival falls in (docs/festival-dlc-design.md §2).
//
// One sky-day is one calendar month (game-clock.js), so a festival's own date would land at some
// hour of that month's sky-day - 4 June at 08:24, 中秋 at whatever hour the 15th of the lunar month
// happens to fall. Festivals therefore keep only their MONTH: the whole sky-day of that month is
// "the day", and its programme runs on the clock (setup by day, the peak at night).
//
// Lunar dates come from festival-lunar-data.js (the HKO conversion tables, 1901-2100). Outside
// those years the date is taken from a year a whole number of 19-year Metonic cycles away, which
// lands within a day or two of the true date - near enough to pick the month.

const FESTIVAL_METONIC_YEARS = 19;

// id -> how its key date is found. `lunar`: a key of FESTIVAL_LUNAR_DATA, `offsetDays` from it
// (新春 is held in the month of 除夕, the day before 正月初一). `fixed`: [month, day].
const FESTIVAL_CALENDAR_RULES = Object.freeze({
  lunarNewYear: Object.freeze({ lunar: 'newYear', offsetDays: -1 }),
  dragonBoat: Object.freeze({ lunar: 'dragonBoat' }),
  bunHill: Object.freeze({ lunar: 'dragonBoat' }),
  june4: Object.freeze({ fixed: Object.freeze([6, 4]) }),
  yulan: Object.freeze({ lunar: 'ghost' }),
  midAutumn: Object.freeze({ lunar: 'midAutumn' }),
  christmas: Object.freeze({ fixed: Object.freeze([12, 25]) }),
});

function getFestivalLunarTable() {
  if (typeof FESTIVAL_LUNAR_DATA !== 'undefined') return FESTIVAL_LUNAR_DATA;
  if (typeof require === 'function') return require('./festival-lunar-data.js').FESTIVAL_LUNAR_DATA;
  return null;
}

/**
 * The Gregorian date of a lunar date in a year.
 * @param {string} key 'newYear' | 'dragonBoat' | 'ghost' | 'midAutumn'
 * @param {number} year
 * @returns {{ year: number, month: number, day: number, approximate: boolean } | null}
 *   approximate: the year is outside the table and the date was borrowed from a Metonic year
 */
function getLunarFestivalDate(key, year) {
  const table = getFestivalLunarTable();
  const column = table?.keys.indexOf(key);
  const y = Math.trunc(Number(year));
  if (!table || column < 0 || !Number.isFinite(y)) return null;
  const lastYear = table.firstYear + table.rows.length - 1;
  let source = y;
  while (source < table.firstYear) source += FESTIVAL_METONIC_YEARS;
  while (source > lastYear) source -= FESTIVAL_METONIC_YEARS;
  const mmdd = table.rows[source - table.firstYear].split(' ')[column];
  return { year: y, month: Number(mmdd.slice(0, 2)), day: Number(mmdd.slice(2)), approximate: source !== y };
}

function shiftFestivalDate(date, days) {
  if (!days) return date;
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { ...date, year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/**
 * The festival's key date in a year: the date its month is picked by.
 * @param {string} id a key of FESTIVAL_CALENDAR_RULES
 * @param {number} year
 * @returns {{ year: number, month: number, day: number, approximate: boolean } | null}
 *   null for a festival with no calendar date (the UFO) or an unknown id. The year can differ
 *   from the one asked for only if a lunar offset crossed New Year, which none does today.
 */
function getFestivalDate(id, year) {
  const rule = FESTIVAL_CALENDAR_RULES[id];
  const y = Math.trunc(Number(year));
  if (!rule || !Number.isFinite(y)) return null;
  if (rule.fixed) return { year: y, month: rule.fixed[0], day: rule.fixed[1], approximate: false };
  const date = getLunarFestivalDate(rule.lunar, y);
  return date && shiftFestivalDate(date, rule.offsetDays || 0);
}

/** The calendar month (1-12) a festival is held in, or null. */
function getFestivalMonth(id, year) {
  return getFestivalDate(id, year)?.month ?? null;
}

/** Every calendar festival of a year, in date order. */
function getFestivalYearCalendar(year) {
  return Object.keys(FESTIVAL_CALENDAR_RULES)
    .map((id) => ({ id, ...getFestivalDate(id, year) }))
    .filter((entry) => Number.isFinite(entry.month))
    .sort((a, b) => a.month - b.month || a.day - b.day);
}

/** The ids of the festivals held in a month, in date order (June often has two). */
function getFestivalsInMonth(year, month) {
  const m = Math.trunc(Number(month));
  return getFestivalYearCalendar(year).filter((entry) => entry.month === m).map((entry) => entry.id);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FESTIVAL_CALENDAR_RULES,
    FESTIVAL_METONIC_YEARS,
    getLunarFestivalDate,
    getFestivalDate,
    getFestivalMonth,
    getFestivalYearCalendar,
    getFestivalsInMonth,
  };
}
