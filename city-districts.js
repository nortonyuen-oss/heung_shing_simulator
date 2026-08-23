// ── Map District Naming ─────────────────────────────────────────────────────
//
// Every tile belongs to a "district" used purely for naming (bus stops today,
// possibly other place-labels later). A district sign (district-signs.js)
// always wins where its radius covers the tile - it's the player's explicit
// say on what that ground is called. Everywhere else, the tile falls back to
// one of Hong Kong's 18 real district-council districts, scattered across the
// map as Voronoi seed points (nearest seed wins) and shuffled onto those
// points once per city seed, so every city gets a different arrangement of
// the same 18 names. Nothing here is persisted: both the seed points and the
// shuffle are pure functions of `currentSeed`, recomputed on demand and
// cached only for the lifetime of that seed (same pattern as the `${currentSeed}:trees`
// style seeding already used for terrain generation in main.js).

const HK_DISTRICTS = [
  { zh: '中西區', en: 'Central and Western' },
  { zh: '灣仔區', en: 'Wan Chai' },
  { zh: '東區', en: 'Eastern' },
  { zh: '南區', en: 'Southern' },
  { zh: '油尖旺區', en: 'Yau Tsim Mong' },
  { zh: '深水埗區', en: 'Sham Shui Po' },
  { zh: '九龍城區', en: 'Kowloon City' },
  { zh: '黃大仙區', en: 'Wong Tai Sin' },
  { zh: '觀塘區', en: 'Kwun Tong' },
  { zh: '葵青區', en: 'Kwai Tsing' },
  { zh: '荃灣區', en: 'Tsuen Wan' },
  { zh: '屯門區', en: 'Tuen Mun' },
  { zh: '元朗區', en: 'Yuen Long' },
  { zh: '北區', en: 'North' },
  { zh: '大埔區', en: 'Tai Po' },
  { zh: '沙田區', en: 'Sha Tin' },
  { zh: '西貢區', en: 'Sai Kung' },
  { zh: '離島區', en: 'Islands' },
];

let baseCityDistrictsCache = null;
let baseCityDistrictsCacheSeedKey = null;

function getBaseCityDistrictSeedKey() {
  return typeof currentSeed !== 'undefined' && currentSeed ? String(currentSeed) : 'default';
}

function buildBaseCityDistricts(seedKey) {
  const random = typeof createRandom === 'function' ? createRandom(`${seedKey}:hk-districts`) : Math.random;
  const shuffled = HK_DISTRICTS.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const width = typeof MAP_WIDTH === 'number' ? MAP_WIDTH : 256;
  const height = typeof MAP_HEIGHT === 'number' ? MAP_HEIGHT : 256;
  const margin = 0.08;
  return shuffled.map((district) => ({
    zh: district.zh,
    en: district.en,
    zhRoot: district.zh.replace(/區$/, ''),
    row: Math.round((margin + random() * (1 - margin * 2)) * height),
    col: Math.round((margin + random() * (1 - margin * 2)) * width),
  }));
}

function getBaseCityDistricts() {
  const seedKey = getBaseCityDistrictSeedKey();
  if (!baseCityDistrictsCache || baseCityDistrictsCacheSeedKey !== seedKey) {
    baseCityDistrictsCache = buildBaseCityDistricts(seedKey);
    baseCityDistrictsCacheSeedKey = seedKey;
  }
  return baseCityDistrictsCache;
}

function getNearestBaseCityDistrict(row, col) {
  const districts = getBaseCityDistricts();
  let nearest = districts[0];
  let nearestDistance = Infinity;
  districts.forEach((district) => {
    const distance = Math.hypot(district.row - row, district.col - col);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = district;
    }
  });
  return nearest;
}

// Single source of truth for "what is this tile called" - district signs
// override, the 18-district Voronoi layer fills in everywhere else.
function getDistrictNameForTile(row, col) {
  const sign = typeof getDistrictSignForTile === 'function' ? getDistrictSignForTile(row, col) : null;
  if (sign) {
    return {
      zh: sign.name,
      en: sign.englishName || sign.name,
      zhRoot: sign.name,
      center: { row: Number(sign.row), col: Number(sign.col) },
      sourceId: `sign:${sign.id}`,
    };
  }
  const base = getNearestBaseCityDistrict(row, col);
  return {
    zh: base.zh,
    en: base.en,
    zhRoot: base.zhRoot,
    center: { row: base.row, col: base.col },
    sourceId: `base:${base.zh}`,
  };
}
