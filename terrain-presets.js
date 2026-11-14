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

// 香港全境: the whole territory (HK_TERRAIN_TILES) as one playable map, generated lazily one
// 256x256 chunk at a time - the first time a tile inside it is actually needed
// (ensureTileSprite, main.js), not up front. Generating the whole 3187x2400 territory in one
// call was measured at ~58s (finishHkTerrain is several O(area) flood-fill/slope passes); one
// chunk measures 300-800ms. Chunk size matches HK_TERRAIN_WINDOWS.size and every district map,
// so this reuses the exact decode -> hkTerrainCodesToMaps -> finishHkTerrain pipeline above,
// just windowed to a chunk's rectangle instead of a whole district or a catalogue sample.
const TERRITORY_CHUNK_SIZE = 256;

function getTerritoryChunkId(chunkRow, chunkCol) {
  return `${chunkRow}:${chunkCol}`;
}

// The default starting view for a new 香港全境 city: the geometric centre of the territory's
// tile grid (not any particular district - just somewhere with land nearby for v1).
function getHkTerritoryDefaultStart() {
  const tiles = typeof HK_TERRAIN_TILES !== 'undefined' ? HK_TERRAIN_TILES : null;
  if (!tiles) return { startRow: 0, startCol: 0 };
  return {
    startRow: Math.floor(tiles.height / 2),
    startCol: Math.floor(tiles.width / 2),
  };
}

// Idempotent: a chunk already in territoryGeneratedChunkIds is left untouched. finishHkTerrain
// is a stabilizing pass, not a no-op on already-settled data - re-running it after the player
// has terraformed that chunk would reapply slope/topology constraints over their own edits.
function ensureTerritoryChunkGenerated(scene, row, col) {
  const tiles = typeof HK_TERRAIN_TILES !== 'undefined' ? HK_TERRAIN_TILES : null;
  if (!tiles) return;
  const chunkRow = Math.floor(row / TERRITORY_CHUNK_SIZE);
  const chunkCol = Math.floor(col / TERRITORY_CHUNK_SIZE);
  const chunkId = getTerritoryChunkId(chunkRow, chunkCol);
  if (territoryGeneratedChunkIds.has(chunkId)) return;
  territoryGeneratedChunkIds.add(chunkId); // before generating: guards re-entrant calls

  const rowStart = chunkRow * TERRITORY_CHUNK_SIZE;
  const colStart = chunkCol * TERRITORY_CHUNK_SIZE;
  const rowCount = Math.min(TERRITORY_CHUNK_SIZE, tiles.height - rowStart);
  const colCount = Math.min(TERRITORY_CHUNK_SIZE, tiles.width - colStart);
  if (rowCount <= 0 || colCount <= 0) return;

  // decodeHkTerrainRow/hkTerrainCodesToMaps/finishHkTerrain all read the MAP_WIDTH/MAP_HEIGHT
  // globals rather than taking dimensions as parameters - narrow them to the chunk's own size
  // for this chunk-local, transient decode, then restore the real (territory) dimensions before
  // writing into the live mapData/heightMap, which stay sized to the whole territory throughout.
  const savedWidth = MAP_WIDTH;
  const savedHeight = MAP_HEIGHT;
  setMapDimensions(colCount, rowCount);
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    rows.push(decodeHkTerrainRow(tiles.rows[rowStart + r], colStart, colCount));
  }
  const { mapRows, heightRows } = hkTerrainCodesToMaps((r, c) => rows[r][c]);
  finishHkTerrain(mapRows, heightRows);
  setMapDimensions(savedWidth, savedHeight);

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      mapData[rowStart + r][colStart + c] = mapRows[r][c];
      heightMap[rowStart + r][colStart + c] = heightRows[r][c];
    }
  }

  const range = { rowStart, colStart, rowCount, colCount };
  if (typeof generateInitialTrees === 'function') {
    generateInitialTrees(scene, null, { ...range, seed: `${currentSeed}:trees:${chunkId}` });
  }
  if (typeof generateInitialDebris === 'function') {
    generateInitialDebris(scene, null, { ...range, seed: `${currentSeed}:debris:${chunkId}` });
  }
  // generateInitialTrees/generateInitialDebris only populate treeMap/debrisMap (data); every
  // other map source pairs that with a full rebuildTreeSprites/rebuildDebrisSprites call - the
  // equivalent here is bounded to just this chunk's tiles (placeTreeSprite/placeDebrisSprite
  // already no-op on a tile with nothing there, so this is the same shape of scan a normal
  // 256x256 map's rebuild already does, just once per chunk instead of once per game).
  if (scene) {
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        const row = rowStart + r;
        const col = colStart + c;
        if (typeof placeTreeSprite === 'function') placeTreeSprite(scene, row, col);
        if (typeof placeDebrisSprite === 'function') placeDebrisSprite(scene, row, col);
      }
    }
  }
}

// Lightweight descriptor for map-sources.js - no mapData/heightMap yet (there isn't one until
// chunks generate), just enough for the landing screen and startNewGame/startTerrainCreatorMode
// to recognise this as a chunked source and route around copyTerrainToWorld.
function getHkFullTerritoryTerrainDescriptor() {
  const tiles = typeof HK_TERRAIN_TILES !== 'undefined' ? HK_TERRAIN_TILES : null;
  if (!tiles) return null;
  return {
    version: 1,
    generatorVersion: 3,
    profileType: 'territory',
    chunked: true,
    seed: 'hk-territory:v1',
    features: ['lands-department-dtm', 'hk-territory'],
    width: tiles.width,
    height: tiles.height,
    ...getHkTerritoryDefaultStart(),
    mapData: null,
    heightMap: null,
  };
}
