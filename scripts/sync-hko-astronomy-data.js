#!/usr/bin/env node

// Downloads the Hong Kong Observatory's official annual Sun/Moon CSV files and
// builds the deterministic offline seed consumed by db.js. Run manually when a
// new reference year is adopted; the game never needs internet access at runtime.

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_YEAR = Number(process.argv[2] || 2026);
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', `hko-astronomy-${SOURCE_YEAR}.json`);
const SUN_URL = `https://data.weather.gov.hk/weatherAPI/opendata/opendata.php?dataType=SRS&year=${SOURCE_YEAR}&rformat=csv`;
const MOON_URL = `https://data.weather.gov.hk/weatherAPI/opendata/opendata.php?dataType=MRS&year=${SOURCE_YEAR}&rformat=csv`;
const TWILIGHT_SOURCE_URL = `https://www.hko.gov.hk/en/gts/astron${SOURCE_YEAR}/files/HKO_almanac_${SOURCE_YEAR}.pdf`;

// HKO Almanac table: Duration of Twilight in Hong Kong before Sunrise and
// after Sunset for Each Month. Values are civil/nautical/astronomical minutes.
const TWILIGHT_ANCHORS = [
  [1, 1, 24, 52, 80], [1, 10, 24, 52, 79], [1, 20, 24, 51, 78],
  [2, 1, 23, 50, 77], [2, 10, 23, 50, 76], [2, 20, 23, 49, 75],
  [3, 1, 23, 49, 74], [3, 10, 22, 48, 74], [3, 20, 22, 48, 75],
  [4, 1, 22, 49, 75], [4, 10, 23, 49, 76], [4, 20, 23, 50, 77],
  [5, 1, 23, 51, 79], [5, 10, 24, 52, 81], [5, 20, 24, 53, 83],
  [6, 1, 25, 54, 85], [6, 10, 25, 55, 86], [6, 20, 25, 55, 86],
  [7, 1, 25, 55, 86], [7, 10, 25, 54, 85], [7, 20, 24, 54, 84],
  [8, 1, 24, 52, 82], [8, 10, 24, 51, 80], [8, 20, 23, 50, 78],
  [9, 1, 23, 49, 76], [9, 10, 23, 49, 75], [9, 20, 22, 48, 75],
  [10, 1, 22, 48, 74], [10, 10, 22, 48, 74], [10, 20, 23, 49, 75],
  [11, 1, 23, 50, 76], [11, 10, 23, 50, 77], [11, 20, 24, 51, 78],
  [12, 1, 24, 52, 79], [12, 10, 24, 52, 80], [12, 20, 24, 52, 80],
];

function parseTime(value) {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hour, minute] = text.split(':').map(Number);
  return hour * 60 + minute;
}

function parseCsv(text) {
  return String(text).replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, rise, transit, set] = line.split(',');
    return { date, rise: parseTime(rise), transit: parseTime(transit), set: parseTime(set) };
  });
}

function dayIndex(year, month, day) {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000);
}

function interpolateTwilight(month, day) {
  const index = dayIndex(SOURCE_YEAR, month, day);
  const anchors = TWILIGHT_ANCHORS.map(([m, d, civil, nautical, astronomical]) => ({
    index: dayIndex(SOURCE_YEAR, m, d), civil, nautical, astronomical,
  }));
  anchors.push({ index: dayIndex(SOURCE_YEAR, 12, 31) + 1, civil: 24, nautical: 52, astronomical: 80 });
  let from = anchors[0];
  let to = anchors[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (index >= anchors[i].index && index < anchors[i + 1].index) {
      from = anchors[i];
      to = anchors[i + 1];
      break;
    }
  }
  const t = (index - from.index) / Math.max(1, to.index - from.index);
  const mix = (key) => Math.round(from[key] + (to[key] - from[key]) * t);
  return { civil: mix('civil'), nautical: mix('nautical'), astronomical: mix('astronomical') };
}

function deriveMoonPhases(sunRows, moonRows) {
  const phases = moonRows.map((row, index) => row.transit === null || sunRows[index].transit === null
    ? null
    : ((row.transit - sunRows[index].transit + 1440) % 1440) / 1440);
  return phases.map((value, index) => {
    if (value !== null) return value;
    let before = index - 1;
    let after = index + 1;
    while (before >= 0 && phases[before] === null) before--;
    while (after < phases.length && phases[after] === null) after++;
    if (before < 0 && after >= phases.length) return 0;
    if (before < 0) return phases[after];
    if (after >= phases.length) return phases[before];
    const from = phases[before];
    let to = phases[after];
    // Lunar phase advances through 1→0 at new moon. Unwrap that boundary so
    // an omitted transit day interpolates along the short forward arc instead
    // of jumping half a lunation backwards.
    if (to < from) to += 1;
    const t = (index - before) / (after - before);
    return (from + (to - from) * t) % 1;
  });
}

async function download(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Heung-Shing-Simulator astronomy data sync' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function main() {
  const [sunText, moonText] = await Promise.all([download(SUN_URL), download(MOON_URL)]);
  const sunRows = parseCsv(sunText);
  const moonRows = parseCsv(moonText);
  if (sunRows.length !== moonRows.length || sunRows.length < 365) {
    throw new Error(`Unexpected HKO row counts: sun=${sunRows.length}, moon=${moonRows.length}`);
  }
  const moonPhases = deriveMoonPhases(sunRows, moonRows);
  const records = sunRows.map((sun, index) => {
    const moon = moonRows[index];
    if (sun.date !== moon.date) throw new Error(`Sun/Moon date mismatch at row ${index + 2}`);
    const [, monthText, dayText] = sun.date.split('-');
    const month = Number(monthText);
    const day = Number(dayText);
    const twilight = interpolateTwilight(month, day);
    const moonPhase = Math.round(moonPhases[index] * 10000) / 10000;
    return {
      month,
      day,
      sunrise: sun.rise,
      solarTransit: sun.transit,
      sunset: sun.set,
      moonrise: moon.rise,
      moonTransit: moon.transit,
      moonset: moon.set,
      moonPhase,
      civilTwilight: twilight.civil,
      nauticalTwilight: twilight.nautical,
      astronomicalTwilight: twilight.astronomical,
    };
  });
  const payload = {
    schemaVersion: 1,
    sourceVersion: `hko-almanac-${SOURCE_YEAR}-v1`,
    sourceYear: SOURCE_YEAR,
    timezone: 'Asia/Hong_Kong',
    latitude: 22.302028,
    longitude: 114.174333,
    sources: { sun: SUN_URL, moon: MOON_URL, twilight: TWILIGHT_SOURCE_URL },
    records,
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${records.length} HKO astronomy rows to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
