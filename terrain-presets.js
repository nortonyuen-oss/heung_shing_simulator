const TERRAIN_OPTIONS = [
  { key: 'grass',  emoji: '🌿', titleKey: 'terrain.grass',  swatchClass: 'grass' },
  { key: 'dirt',   emoji: '🟫', titleKey: 'terrain.dirt',   swatchClass: 'dirt' },
  { key: 'beach',  emoji: '🏖️', titleKey: 'terrain.beach',  swatchClass: 'beach' },
  { key: 'water',  emoji: '🌊', titleKey: 'terrain.water',  swatchClass: 'water' },
  { key: 'hill',   emoji: '⛰️', titleKey: 'terrain.hill',   swatchClass: 'hill' },
  { key: 'raise',  emoji: '⬆️', titleKey: 'terrain.raise',  swatchClass: 'hill' },
  { key: 'lower',  emoji: '⬇️', titleKey: 'terrain.lower',  swatchClass: 'hill' },
  { key: 'flatten',emoji: '🟰', titleKey: 'terrain.flatten',swatchClass: 'hill' },
];

const TERRAIN_PROFILE_OPTIONS = [
  { key: 'island', titleKey: 'terrain.profile.island' },
  { key: 'harbor', titleKey: 'terrain.profile.harbor' },
  { key: 'mountain', titleKey: 'terrain.profile.mountain' },
  { key: 'desert', titleKey: 'terrain.profile.desert' },
  { key: 'plain', titleKey: 'terrain.profile.plain' },
  { key: 'lake', titleKey: 'terrain.profile.lake' },
  { key: 'river', titleKey: 'terrain.profile.river' },
  { key: 'plateau', titleKey: 'terrain.profile.plateau' },
  { key: 'basin', titleKey: 'terrain.profile.basin' },
  { key: 'flat', titleKey: 'terrain.profile.flat' },
];

const BUILT_IN_CITY_TERRAIN_SCENARIOS = [
  {
    id: 'builtin:hong-kong',
    name: '香港 Hong Kong',
    nameKey: 'scenario.hongKong',
    profileType: 'harbor',
    seed: 'city-scenario:hong-kong:v1',
    options: {
      seaLevel: 0.36, baseElevation: 0.46, relief: 1.28,
      ridgeCount: 4, riverCount: 2, coastMode: 'harbor',
      harborMouthWidth: 26, buildableBias: 0.26, dryness: 0.12, erosionPasses: 3,
    },
  },
  {
    id: 'builtin:taipei',
    name: '台北 Taipei',
    nameKey: 'scenario.taipei',
    profileType: 'basin',
    seed: 'city-scenario:taipei:v1',
    options: {
      seaLevel: 0.18, baseElevation: 0.40, relief: 1.12,
      ridgeCount: 3, riverCount: 3, coastMode: 'basin',
      buildableBias: 0.44, dryness: 0.14, erosionPasses: 2,
    },
  },
  {
    id: 'builtin:tokyo',
    name: '東京 Tokyo',
    nameKey: 'scenario.tokyo',
    profileType: 'harbor',
    seed: 'city-scenario:tokyo:v1',
    options: {
      seaLevel: 0.30, baseElevation: 0.36, relief: 0.68,
      ridgeCount: 1, riverCount: 3, coastMode: 'harbor',
      harborMouthWidth: 44, buildableBias: 0.62, dryness: 0.18, erosionPasses: 2,
    },
  },
  {
    id: 'builtin:new-york',
    name: '紐約 New York',
    nameKey: 'scenario.newYork',
    profileType: 'harbor',
    seed: 'city-scenario:new-york:v1',
    options: {
      seaLevel: 0.33, baseElevation: 0.40, relief: 0.78,
      ridgeCount: 2, riverCount: 2, coastMode: 'harbor',
      harborMouthWidth: 36, buildableBias: 0.55, dryness: 0.20, erosionPasses: 2,
    },
  },
  {
    id: 'builtin:singapore',
    name: '新加坡 Singapore',
    nameKey: 'scenario.singapore',
    profileType: 'island',
    seed: 'city-scenario:singapore:v1',
    options: {
      seaLevel: 0.44, baseElevation: 0.18, relief: 0.52,
      ridgeCount: 1, riverCount: 1, coastMode: 'island',
      buildableBias: 0.52, dryness: 0.22, erosionPasses: 1,
    },
  },
  {
    id: 'builtin:london',
    name: '倫敦 London',
    nameKey: 'scenario.london',
    profileType: 'river',
    seed: 'city-scenario:london:v1',
    options: {
      seaLevel: 0.12, baseElevation: 0.30, relief: 0.40,
      ridgeCount: 1, riverCount: 4, coastMode: 'none',
      buildableBias: 0.70, dryness: 0.18, erosionPasses: 2,
    },
  },
  {
    id: 'builtin:copenhagen',
    name: '哥本哈根 Copenhagen',
    nameKey: 'scenario.copenhagen',
    profileType: 'island',
    seed: 'city-scenario:copenhagen:v1',
    options: {
      seaLevel: 0.40, baseElevation: 0.22, relief: 0.46,
      ridgeCount: 1, riverCount: 1, coastMode: 'island',
      buildableBias: 0.58, dryness: 0.20, erosionPasses: 1,
    },
  },
  {
    id: 'builtin:sydney',
    name: '悉尼 Sydney',
    nameKey: 'scenario.sydney',
    profileType: 'harbor',
    seed: 'city-scenario:sydney:v1',
    options: {
      seaLevel: 0.32, baseElevation: 0.44, relief: 0.96,
      ridgeCount: 2, riverCount: 2, coastMode: 'harbor',
      harborMouthWidth: 26, buildableBias: 0.46, dryness: 0.20, erosionPasses: 2,
    },
  },
];

const builtInCityTerrainCache = new Map();
const REAL_FLAT_COASTLINE_SCENARIO_IDS = new Set([
  'builtin:hong-kong',
  'builtin:tokyo',
  'builtin:new-york',
  'builtin:singapore',
  'builtin:london',
  'builtin:copenhagen',
  'builtin:sydney',
]);

function getBuiltInCityTerrainData(scenarioId) {
  if (builtInCityTerrainCache.has(scenarioId)) {
    return builtInCityTerrainCache.get(scenarioId);
  }

  const scenario = BUILT_IN_CITY_TERRAIN_SCENARIOS.find((entry) => entry.id === scenarioId);
  if (!scenario) return null;

  let terrainData = null;
  if (REAL_FLAT_COASTLINE_SCENARIO_IDS.has(scenario.id)) {
    terrainData = {
      version: 1,
      generatorVersion: 3,
      profileType: scenario.profileType,
      seed: scenario.seed,
      features: ['real-coastline-source', `city-scenario:${scenario.id}`],
      mapData: createFilledMap(WATER),
      heightMap: createFilledMap(0),
    };
  } else {
    const generated = generateRealisticTerrainMap(scenario.profileType, scenario.seed, scenario.options);
    terrainData = {
      version: 1,
      generatorVersion: generated.metadata?.generatorVersion ?? 2,
      profileType: scenario.profileType,
      seed: scenario.seed,
      features: [...(generated.metadata?.features ?? []), `city-scenario:${scenario.id}`],
      mapData: generated.mapData.map((row) => Array.from(row)),
      heightMap: generated.heightMap.map((row) => Array.from(row)),
    };
  }

  const templatedTerrainData = applyBuiltInCityGeographyTemplate(scenario.id, terrainData, scenario.seed);

  builtInCityTerrainCache.set(scenarioId, templatedTerrainData);
  return templatedTerrainData;
}

// Hong Kong district maps (hk-district-maps.js, built from the Lands Department DTM). The data
// holds water, beach and a height level per tile; the generator's own slope and hill-shape rules
// finish it here so every hill has art. The border keeps its real height: a district cuts
// through hillsides, and map-edge-skirt.js draws the cut.
const hkDistrictTerrainCache = new Map();

// One run-length coded row (W water, B beach, a-i land at level 0-8, then the run length) as an
// array of codes; only columns [fromCol, fromCol + width) are kept.
function decodeHkTerrainRow(encoded, fromCol = 0, width = MAP_WIDTH) {
  const out = new Array(width);
  const pattern = /([WBa-i])(\d*)/g;
  let col = 0;
  let match;
  while ((match = pattern.exec(encoded)) && col < fromCol + width) {
    const run = match[2] ? Number(match[2]) : 1;
    const start = Math.max(col, fromCol);
    const end = Math.min(col + run, fromCol + width);
    for (let c = start; c < end; c++) out[c - fromCol] = match[1];
    col += run;
  }
  return out;
}

function hkTerrainCodesToMaps(codeAt) {
  const mapRows = createFilledMap(WATER);
  const heightRows = createFilledMap(0);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const code = codeAt(row, col);
      if (!code || code === 'W') continue;
      if (code === 'B') {
        mapRows[row][col] = BEACH;
        continue;
      }
      const level = code.charCodeAt(0) - 97;
      mapRows[row][col] = level > 0 ? HILL : GROUND;
      heightRows[row][col] = level;
    }
  }
  return { mapRows, heightRows };
}

function finishHkTerrain(mapRows, heightRows) {
  removeTinyTerrainComponents(mapRows, heightRows, WATER, 6, GROUND);
  removeTinyTerrainComponents(mapRows, heightRows, HILL, 4, GROUND);
  enforceGlobalSlopeConstraints(mapRows, heightRows, 1, 24);
  normalizeUnsupportedHillTopologiesGlobal(mapRows, heightRows, 3);
  enforceGlobalSlopeConstraints(mapRows, heightRows, 1, 4);
  quantizeHillHeights(mapRows, heightRows);
}

function getHkDistrictTerrainData(districtId) {
  if (hkDistrictTerrainCache.has(districtId)) return hkDistrictTerrainCache.get(districtId);
  const district = (typeof HK_DISTRICT_MAPS !== 'undefined' ? HK_DISTRICT_MAPS : [])
    .find((entry) => entry.id === districtId);
  if (!district) return null;

  const rows = district.rows.map((encoded) => decodeHkTerrainRow(encoded));
  const { mapRows, heightRows } = hkTerrainCodesToMaps((row, col) => rows[row][col]);
  finishHkTerrain(mapRows, heightRows);

  const terrainData = {
    version: 1,
    generatorVersion: 3,
    profileType: 'district',
    seed: `hk-district:${district.id}:v1`,
    features: ['lands-department-dtm', `hk-district:${district.id}`],
    mapData: mapRows,
    heightMap: heightRows,
  };
  hkDistrictTerrainCache.set(districtId, terrainData);
  return terrainData;
}

// 香港實景 random maps: a 5.12 km window of the real territory (hk-terrain-tiles.js), chosen by
// the seed from the windows that fit the landform, nudged within its catalogue step and turned
// or mirrored one of 8 ways. The filters read each window's water, flat (level 0), high (level
// 3+) and border-land percentages; retune them here, no rebuild needed.
const HK_TERRAIN_LANDFORMS = Object.freeze({
  'hk-any': (w) => w.water <= 75,
  'hk-harbour': (w) => w.water >= 25 && w.water <= 60 && w.borderLand >= 35 && w.borderLand <= 80,
  'hk-peninsula': (w) => w.water >= 40 && w.water <= 75 && w.borderLand >= 12 && w.borderLand <= 40,
  'hk-islands': (w) => w.water >= 50 && w.water <= 80 && w.borderLand <= 25,
  'hk-valley': (w) => w.flat >= 18 && w.high >= 20 && w.water <= 35,
  'hk-hillside': (w) => w.high >= 40 && w.water <= 40,
  'hk-plain': (w) => w.flat >= 35 && w.water <= 30,
});

function isHkTerrainLandform(landform) {
  return Object.prototype.hasOwnProperty.call(HK_TERRAIN_LANDFORMS, landform);
}

function listHkTerrainWindows(landform) {
  const catalogue = typeof HK_TERRAIN_WINDOWS !== 'undefined' ? HK_TERRAIN_WINDOWS : null;
  const fits = HK_TERRAIN_LANDFORMS[landform];
  if (!catalogue || !fits) return [];
  const windows = [];
  const list = catalogue.list;
  for (let i = 0; i + 5 < list.length; i += catalogue.fields) {
    const window = { col: list[i], row: list[i + 1], water: list[i + 2], flat: list[i + 3], high: list[i + 4], borderLand: list[i + 5] };
    if (fits(window)) windows.push(window);
  }
  return windows;
}

// The district whose map centre is nearest a window centre, within 4 km: 「近沙田」.
function findNearestHkDistrictId(centreE, centreN) {
  let best = null;
  let bestDistance = 4000;
  (typeof HK_DISTRICT_MAPS !== 'undefined' ? HK_DISTRICT_MAPS : []).forEach((district) => {
    const distance = Math.hypot(district.centre.e - centreE, district.centre.n - centreN);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = district.id;
    }
  });
  return best;
}

function sampleHkTerrain(landform, seed) {
  const tiles = typeof HK_TERRAIN_TILES !== 'undefined' ? HK_TERRAIN_TILES : null;
  const windows = listHkTerrainWindows(landform);
  if (!tiles || windows.length === 0) return null;

  const random = createRandom(`${seed}:hk-terrain:${landform}`);
  const window = windows[Math.floor(random() * windows.length)];
  const step = HK_TERRAIN_WINDOWS.step;
  const col0 = Math.min(tiles.width - MAP_WIDTH, window.col + Math.floor(random() * step));
  const row0 = Math.min(tiles.height - MAP_HEIGHT, window.row + Math.floor(random() * step));
  const turns = Math.floor(random() * 4);
  const mirror = random() < 0.5;

  const rows = [];
  for (let r = 0; r < MAP_HEIGHT; r++) rows.push(decodeHkTerrainRow(tiles.rows[row0 + r], col0, MAP_WIDTH));
  const last = MAP_WIDTH - 1;
  const { mapRows, heightRows } = hkTerrainCodesToMaps((row, col) => {
    const c = mirror ? last - col : col;
    if (turns === 1) return rows[c][last - row];
    if (turns === 2) return rows[last - row][last - c];
    if (turns === 3) return rows[last - c][row];
    return rows[row][c];
  });
  finishHkTerrain(mapRows, heightRows);

  const centreE = tiles.westE + (col0 + MAP_WIDTH / 2) * tiles.tileMetres;
  const centreN = tiles.northN - (row0 + MAP_HEIGHT / 2) * tiles.tileMetres;
  return {
    version: 1,
    generatorVersion: 3,
    profileType: landform,
    seed,
    features: ['lands-department-dtm', `hk-sample:${col0},${row0},${turns}${mirror ? 'm' : ''}`],
    nearDistrictId: findNearestHkDistrictId(centreE, centreN),
    mapData: mapRows,
    heightMap: heightRows,
  };
}
