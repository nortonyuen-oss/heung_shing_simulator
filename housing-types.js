'use strict';

// 公屋、居屋 (docs/campaign-p4-design.md §2). Residential land can be zoned as public rental housing
// (公屋) or Home Ownership Scheme flats (居屋). Those zones grow by themselves like any residential
// zone, but only from the residential art that looks like Hong Kong public housing (tagged below).
// A building's housing type is its model's, so a tagged block that grows in a private zone - as
// they always have in the 基層 districts - counts as public housing too.

const HOUSING_TYPES = Object.freeze(['private', 'public', 'hos']);
const HOUSING_ZONE_CODES = Object.freeze({ public: 1, hos: 2 });
const HOUSING_ZONE_TYPES_BY_CODE = Object.freeze({ 1: 'public', 2: 'hos' });

// Tagged by look and by the signs painted on them: 邨 estates and the slab, Y-block and
// harmony-like towers are 公屋; 苑 courts and the block marked 居屋 HOS are 居屋.
const RESIDENTIAL_HOUSING_TYPE_BY_MODEL = Object.freeze({
  'residential2-04-L-MD': 'public', // 安樂邨, an older low block (2x2)
  'residential3-01-L-MD': 'public', // Y-shaped block (3x3)
  'residential3-02-L-MD': 'public', // green harmony-like tower (3x3)
  'residential3-06-L-MD': 'public', // old slab block (3x3)
  'residential5-03-L-HD': 'public', // 安泰邨 estate (8x8 lots)
  'residential3-07-M-MD': 'hos', // 安泰苑 (4x4 lots)
  'residential3-08-M-MD': 'hos', // cruciform court (4x4 lots)
  'residential3-14-M-MD': 'hos', // signed 居屋 HOS (3x3)
});

function normalizeHousingType(value) {
  return value === 'public' || value === 'hos' ? value : 'private';
}

// 第 1 章 has private homes only, while the player gets to know the world (Norton, 2026-11-24)
const HOUSING_TYPE_LOCKED_CHAPTERS = Object.freeze(['ch01']);

function isHousingTypeAvailable(type, run = typeof city !== 'undefined' ? city?.campaign : null) {
  if (normalizeHousingType(type) === 'private') return true;
  return !HOUSING_TYPE_LOCKED_CHAPTERS.includes(run?.chapterId);
}

// The type the zone tool zones: the one picked, or private where that one is not open yet
function getAvailableHousingType(type) {
  const normalized = normalizeHousingType(type);
  return isHousingTypeAvailable(normalized) ? normalized : 'private';
}

function getResidentialHousingTypeFromFileName(fileName) {
  const base = String(fileName ?? '').split('/').pop().replace(/\.[^.]+$/, '');
  return RESIDENTIAL_HOUSING_TYPE_BY_MODEL[base] ?? 'private';
}

// A residential record's housing type, from the art it stands on (null for anything else).
function getBuildingHousingType(record) {
  if (!record || record.type !== 'residential') return null;
  const named = record.sourceFileName || record.assetId;
  if (named) return getResidentialHousingTypeFromFileName(named);
  const model = typeof getHouseModelBySpriteKey === 'function' && record.spriteKey
    ? getHouseModelBySpriteKey(record.spriteKey) : null;
  return getResidentialHousingTypeFromFileName(model?.sourceFileName || model?.fileName);
}

// Residents by housing type. districtDensity is the 地區特色 multiplier the city's population uses.
function countHousingTypeResidents(records, districtDensity = 1) {
  const totals = { public: 0, hos: 0, private: 0 };
  Object.values(records || {}).forEach((record) => {
    const type = getBuildingHousingType(record);
    if (!type) return;
    const residents = Number(record.population) || 0;
    totals[type] += residents;
  });
  Object.keys(totals).forEach((type) => { totals[type] = Math.round(totals[type] * districtDensity); });
  totals.total = totals.public + totals.hos + totals.private;
  totals.publicShare = totals.total > 0 ? totals.public / totals.total : 0;
  totals.privateShare = totals.total > 0 ? totals.private / totals.total : 0;
  return totals;
}

// ── The zone layer: city.housingZones = { 'row:col': 1 (公屋) | 2 (居屋) }, private tiles absent ──

function normalizeHousingZones(raw, width = Infinity, height = Infinity) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.entries(raw).forEach(([id, code]) => {
    const match = /^(\d+):(\d+)$/.exec(id);
    if (!match || +match[1] >= height || +match[2] >= width) return;
    if (code === 1 || code === 2) out[id] = code;
  });
  return out;
}

function getHousingZones() {
  if (typeof city === 'undefined' || !city) return {};
  if (!city.housingZones || typeof city.housingZones !== 'object' || Array.isArray(city.housingZones)) city.housingZones = {};
  return city.housingZones;
}

// 'public' | 'hos' | 'private' for a residential zone tile; 'private' for anything else.
function getHousingZoneType(row, col) {
  if (typeof zoneMap !== 'undefined' && zoneMap[row]?.[col] !== ZONE_RES) return 'private';
  return HOUSING_ZONE_TYPES_BY_CODE[getHousingZones()[`${row}:${col}`]] ?? 'private';
}

function setHousingZoneType(row, col, type) {
  const zones = getHousingZones();
  const code = HOUSING_ZONE_CODES[normalizeHousingType(type)];
  if (code) zones[`${row}:${col}`] = code;
  else delete zones[`${row}:${col}`];
}

// The overlay texture code: res / pub / hos
function getZoneOverlayCode(zone, row, col) {
  if (zone === ZONE_COM) return 'com';
  if (zone === ZONE_IND) return 'ind';
  const type = getHousingZoneType(row, col);
  return type === 'public' ? 'pub' : type === 'hos' ? 'hos' : 'res';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HOUSING_TYPES,
    RESIDENTIAL_HOUSING_TYPE_BY_MODEL,
    normalizeHousingType,
    isHousingTypeAvailable,
    getResidentialHousingTypeFromFileName,
    getBuildingHousingType,
    countHousingTypeResidents,
    normalizeHousingZones,
  };
}
