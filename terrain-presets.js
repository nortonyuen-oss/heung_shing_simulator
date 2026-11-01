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
