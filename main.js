
const TILE_WIDTH = 100;
const TILE_HEIGHT = 50;
const TILE_IMAGE_HEIGHT = 65;
const TILE_PICK_Y_OFFSET = TILE_IMAGE_HEIGHT;
const BUILDING_SURFACE_Y_OFFSET = TILE_IMAGE_HEIGHT - TILE_HEIGHT;
const MAP_WIDTH = 256;
const MAP_HEIGHT = 256;
// originX shifts the grid horizontally so it is centered on the screen
const ORIGIN_X = MAP_HEIGHT * (TILE_WIDTH / 2);
const HOUSE_MODEL_SETS = {
  house: {
    label: '1x1',
    folder: 'Models/house/',
    defaultFile: 'houseGermini.png',
    preferredFiles: [
      'dingHouse.png',
      'dingHouse2.png',
      'dingHouse4.png',
      'dingHouse6.png',
      'dingHouse7.png',
      'houseGermini.png',
      'houseModified.png',
    ],
    footprintCols: 1,
    footprintRows: 1,
  },
  house2x2: {
    label: '2x2',
    folder: 'Models/house2x2/',
    defaultFile: 'ciTang.png',
    preferredFiles: [
      'ciTang.png',
      'ciTang2.png',
      'publicHousing2.png',
      'publicHousing3.png',
      'publicHousing1.png',
    ],
    footprintCols: 2,
    footprintRows: 2,
  },
  house1x4: {
    label: '1x4',
    folder: 'Models/house1x4/',
    defaultFile: 'longPublicHousing.png',
    preferredFiles: [
      'longPublicHousing.png',
    ],
    footprintCols: 4,
    footprintRows: 1,
  },
};
// Terrain tile type constants (GROUND–HILL defined here; zones defined in constants.js)
const GROUND = 1;
const ROAD = 2;
const DIRT = 3;
const BEACH = 4;
const WATER = 5;
const HILL = 6;
const MAX_TERRAIN_HEIGHT = 8;
const HEIGHT_STEP_PIXELS = 12;
const BRIDGE_DECK_VISUAL_LIFT = 15;
const BRIDGE_TOP_LAYER_CUTOFF_Y = 40;
const BRIDGE_SIDE_LAYER_START_Y = 28;
const TERRAIN_RAISE_BLOCK_RADIUS = 1;
const TERRAIN_RADIATE_BASE_RADIUS = 4;
const TOOL_TERRAIN = {
  grass: GROUND,
  road: ROAD,
  dirt: DIRT,
  beach: BEACH,
  water: WATER,
  hill: HILL,
  raise: HILL,
  lower: HILL,
  flatten: HILL,
  bulldoze: GROUND,
};
const BUILDING_KEYS = Array.from({ length: 78 }, (_, index) => (
  `building_${String(index).padStart(3, '0')}`
));
const MUSIC_TRACKS = [
  {
    key: 'music_0',
    title: 'Heart Sutra RnB Vocal Guide Loop',
    file: 'Music/heart_sutra_rnb_vocal_guide_loop.wav',
  },
  {
    key: 'music_1',
    title: 'Concrete Symphony',
    file: 'Music/Concrete_Symphony.mp3',
  },
  {
    key: 'music_2',
    title: 'Concrete Symphony 2',
    file: 'Music/Concrete Symphony 2.mp3',
  },
  {
    key: 'music_3',
    title: 'Loopside Harbor',
    file: 'Music/Loopside Harbor.mp3',
  },
  {
    key: 'music_4',
    title: 'Loopside Harbor 2',
    file: 'Music/Loopside Harbor 2.mp3',
  },
];

let selectedTool = 'road';
let isPainting = false;
let gameReady = false;
let lastEditedTile = null;
let dragStartTile  = null;   // {row,col} set on pointerdown — used for zone rect-fill
let lastPaintTile  = null;   // {row,col} updated each move — used for road Bresenham
let lastKnownTile  = null;   // {row,col} last valid tile from pointermove — zone rect end
let activeScene = null;
let currentSeed = createSeed();
let activeMusic = null;
let activeTrackIndex = 0;
let isMusicPlaying = false;
let musicLoopMode = 'all';   // 'all' = auto-advance, 'one' = loop current track
let nextBuildingIndex = 0;
let houseModelSets = {};
let selectedHouseIndices = {};
let selectedHouseSet = 'house';
let housePressTimer = null;
let didLongPressHouse = false;
let lastInspectTile = null;
let parkModelMetadata = {};
let powerPlantModelMetadata = {};
let selectedParkId = 'open_ground';
let parkPressTimer = null;
let didLongPressPark = false;

// Terrain tool state
let selectedTerrainType = 'grass';
let terrainPressTimer = null;
let didLongPressTerrain = false;
let isTerrainCreatorMode = false;
let activeTerrainProfileType = 'custom';
let terrainMiniMapRaf = null;
let currentTerrainMetadata = null;

// Zone density state (per zone type; values = DENSITY_LOW|MED|HIGH = 1|2|3)
let selectedZoneDensity = { res: 1, com: 1, ind: 1 };
let zonePressTimers = {};
let didLongPressZone = {};

// Overlay map state
let activeOverlay = null;   // 'pollution'|'crime'|'fire'|'population'|'landvalue'|null
let overlayCache  = {};     // cached computed pixel maps, invalidated each sim tick

// Overlay window — pan / zoom state
let mapViewZoom   = 1.0;
let mapViewPanX   = 0;
let mapViewPanY   = 0;

// Map rotation: 0=default, 1=90°CW, 2=180°, 3=270°CW
let mapRotation = 0;

// Terrain option definitions
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

function getBuiltInCityTerrainData(scenarioId) {
  if (builtInCityTerrainCache.has(scenarioId)) {
    return builtInCityTerrainCache.get(scenarioId);
  }

  const scenario = BUILT_IN_CITY_TERRAIN_SCENARIOS.find((entry) => entry.id === scenarioId);
  if (!scenario) return null;

  let terrainData = null;
  if (scenario.id === 'builtin:hong-kong') {
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

function listBuiltInCityTerrainPresets() {
  return BUILT_IN_CITY_TERRAIN_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    profile_type: scenario.profileType,
    seed: scenario.seed,
    terrain_data: getBuiltInCityTerrainData(scenario.id),
    isBuiltInScenario: true,
  }));
}

function createTerrainPresetOptionLabel(preset) {
  const profileLabel = t(`terrain.profile.${preset.profile_type}`);
  const profileText = profileLabel === `terrain.profile.${preset.profile_type}`
    ? preset.profile_type
    : profileLabel;
  return preset.isBuiltInScenario
    ? `${preset.name} (${profileText} · ${t('landing.cityScenarioLabel')})`
    : `${preset.name} (${profileText})`;
}

function setPresetSelectLoading(terrainPresetSelect) {
  if (!terrainPresetSelect) return;
  terrainPresetSelect.innerHTML = `<option value="">${t('landing.terrainPresetLoading')}</option>`;
}

const HONG_KONG_REAL_COASTLINE_POLYGONS = [
  [{ x: 0.696, y: 0.021 }, { x: 0.7398, y: 0.0335 }, { x: 0.7672, y: 0.0992 }, { x: 0.7808, y: 0.1351 }, { x: 0.8177, y: 0.1627 }, { x: 0.8827, y: 0.1487 }, { x: 0.6984, y: 0.2434 }, { x: 0.6734, y: 0.2998 }, { x: 0.5854, y: 0.2995 }, { x: 0.6596, y: 0.4272 }, { x: 0.7622, y: 0.3443 }, { x: 0.8009, y: 0.3565 }, { x: 0.8625, y: 0.2169 }, { x: 0.9266, y: 0.2657 }, { x: 0.9973, y: 0.3303 }, { x: 0.9654, y: 0.3745 }, { x: 0.9795, y: 0.5118 }, { x: 0.9225, y: 0.5984 }, { x: 0.8205, y: 0.4714 }, { x: 0.7649, y: 0.4795 }, { x: 0.7608, y: 0.5118 }, { x: 0.7717, y: 0.6287 }, { x: 0.8009, y: 0.7154 }, { x: 0.8205, y: 0.7416 }, { x: 0.8146, y: 0.7901 }, { x: 0.7416, y: 0.6245 }, { x: 0.7121, y: 0.7296 }, { x: 0.6279, y: 0.6851 }, { x: 0.5932, y: 0.7114 }, { x: 0.5075, y: 0.5862 }, { x: 0.3248, y: 0.5521 }, { x: 0.2364, y: 0.4572 }, { x: 0.1906, y: 0.5218 }, { x: 0.1436, y: 0.4552 }, { x: 0.1838, y: 0.3545 }, { x: 0.311, y: 0.2012 }, { x: 0.3414, y: 0.2215 }, { x: 0.3912, y: 0.1527 }, { x: 0.4961, y: 0.094 }, { x: 0.5521, y: 0.0668 }, { x: 0.613, y: 0.02 }, { x: 0.696, y: 0.021 }],
  [{ x: 0.0162, y: 0.9483 }, { x: 0.0033, y: 0.8523 }, { x: 0.0211, y: 0.8523 }, { x: 0.0235, y: 0.7941 }, { x: 0.0978, y: 0.7011 }, { x: 0.1615, y: 0.7214 }, { x: 0.2209, y: 0.6792 }, { x: 0.2472, y: 0.6872 }, { x: 0.3192, y: 0.5904 }, { x: 0.3248, y: 0.6085 }, { x: 0.3759, y: 0.5731 }, { x: 0.3775, y: 0.6307 }, { x: 0.3442, y: 0.6187 }, { x: 0.341, y: 0.659 }, { x: 0.311, y: 0.6529 }, { x: 0.311, y: 0.6872 }, { x: 0.3277, y: 0.6773 }, { x: 0.3219, y: 0.7738 }, { x: 0.2802, y: 0.7656 }, { x: 0.3013, y: 0.8061 }, { x: 0.275, y: 0.8342 }, { x: 0.315, y: 0.8707 }, { x: 0.2887, y: 0.899 }, { x: 0.2564, y: 0.9194 }, { x: 0.2541, y: 0.8444 }, { x: 0.1921, y: 0.8444 }, { x: 0.1492, y: 0.8787 }, { x: 0.1615, y: 0.9129 }, { x: 0.145, y: 0.9277 }, { x: 0.1222, y: 0.9304 }, { x: 0.0978, y: 0.8828 }, { x: 0.0162, y: 0.9483 }],
  [{ x: 0.6707, y: 0.7194 }, { x: 0.7343, y: 0.7881 }, { x: 0.7426, y: 0.9314 }, { x: 0.7205, y: 0.9374 }, { x: 0.7012, y: 0.911 }, { x: 0.6833, y: 0.8403 }, { x: 0.6639, y: 0.899 }, { x: 0.6776, y: 0.9617 }, { x: 0.6567, y: 0.9677 }, { x: 0.6596, y: 0.9212 }, { x: 0.6279, y: 0.915 }, { x: 0.6144, y: 0.8347 }, { x: 0.5808, y: 0.8687 }, { x: 0.5739, y: 0.8363 }, { x: 0.5173, y: 0.8144 }, { x: 0.488, y: 0.7559 }, { x: 0.5351, y: 0.7114 }, { x: 0.5823, y: 0.7356 }, { x: 0.6374, y: 0.7033 }, { x: 0.6707, y: 0.7194 }],
  [{ x: 0.532, y: 0.9956 }, { x: 0.485, y: 1 }, { x: 0.4776, y: 0.8482 }, { x: 0.524, y: 0.899 }, { x: 0.5114, y: 0.9272 }, { x: 0.5626, y: 0.9314 }, { x: 0.532, y: 0.9956 }],
];

function isPointInsidePolygonNormalized(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-8) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function applyHongKongRealCoastlineFlatMap(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, WATER, 0);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const x = col / (MAP_WIDTH - 1);
      const y = row / (MAP_HEIGHT - 1);
      let onLand = false;
      for (let index = 0; index < HONG_KONG_REAL_COASTLINE_POLYGONS.length; index++) {
        if (isPointInsidePolygonNormalized(x, y, HONG_KONG_REAL_COASTLINE_POLYGONS[index])) {
          onLand = true;
          break;
        }
      }
      if (onLand) {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, 0);
      }
    }
  }
}

function paintScenarioPeakOnLand(ctx, centerX, centerY, rx, ry, targetHeight) {
  const minRow = Math.max(0, Math.floor((centerY - ry - 0.02) * (MAP_HEIGHT - 1)));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil((centerY + ry + 0.02) * (MAP_HEIGHT - 1)));
  const minCol = Math.max(0, Math.floor((centerX - rx - 0.02) * (MAP_WIDTH - 1)));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil((centerX + rx + 0.02) * (MAP_WIDTH - 1)));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (ctx.map[row][col] === WATER) continue;
      const nx = ((col / (MAP_WIDTH - 1)) - centerX) / Math.max(0.01, rx);
      const ny = ((row / (MAP_HEIGHT - 1)) - centerY) / Math.max(0.01, ry);
      if (nx * nx + ny * ny <= 1) {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, targetHeight);
      }
    }
  }
}

function applyHongKongMountainRelief(ctx) {
  // Lantau massif
  paintScenarioHillRidge(ctx, [
    { x: 0.17, y: 0.76 }, { x: 0.24, y: 0.72 }, { x: 0.31, y: 0.67 }, { x: 0.38, y: 0.63 },
  ], 11, 5);
  paintScenarioPeakOnLand(ctx, 0.25, 0.72, 0.08, 0.06, 6);
  paintScenarioPeakOnLand(ctx, 0.33, 0.66, 0.07, 0.05, 5);

  // New Territories central backbone (Tai Mo Shan belt)
  paintScenarioHillRidge(ctx, [
    { x: 0.39, y: 0.48 }, { x: 0.50, y: 0.43 }, { x: 0.61, y: 0.39 }, { x: 0.73, y: 0.37 },
  ], 10, 6);
  paintScenarioPeakOnLand(ctx, 0.52, 0.42, 0.09, 0.07, 7);
  paintScenarioPeakOnLand(ctx, 0.63, 0.39, 0.08, 0.06, 6);

  // Kowloon north ridge (Fei Ngo / Lion Rock corridor)
  paintScenarioHillRidge(ctx, [
    { x: 0.47, y: 0.53 }, { x: 0.56, y: 0.50 }, { x: 0.66, y: 0.49 },
  ], 7, 4);
  paintScenarioPeakOnLand(ctx, 0.58, 0.50, 0.06, 0.04, 5);

  // Hong Kong Island central ridge
  paintScenarioHillRidge(ctx, [
    { x: 0.69, y: 0.58 }, { x: 0.75, y: 0.62 }, { x: 0.80, y: 0.68 },
  ], 7, 4);
  paintScenarioPeakOnLand(ctx, 0.74, 0.61, 0.06, 0.05, 5);
}

function applyBuiltInCityGeographyTemplate(scenarioId, terrainData, seedText = '') {
  const map = terrainData?.mapData?.map((row) => Array.from(row));
  const heights = terrainData?.heightMap?.map((row) => Array.from(row));
  if (!map || !heights) return terrainData;

  const rng = createRandom(`${seedText}:${scenarioId}:geo-v2`);
  const ctx = { map, heights, rng };
  const shapeId = scenarioId.replace(/^builtin:/, '');

  const builders = {
    'hong-kong': buildHongKongScenarioShape,
    taipei: buildTaipeiScenarioShape,
    tokyo: buildTokyoScenarioShape,
    'new-york': buildNewYorkScenarioShape,
    singapore: buildSingaporeScenarioShape,
    london: buildLondonScenarioShape,
    copenhagen: buildCopenhagenScenarioShape,
    sydney: buildSydneyScenarioShape,
  };

  const builder = builders[shapeId];
  if (!builder) return terrainData;

  builder(ctx);
  const preserveCoastline = shapeId === 'hong-kong';
  finalizeScenarioTerrain(ctx, { preserveWaterMask: preserveCoastline });

  return {
    ...terrainData,
    mapData: map,
    heightMap: heights,
    features: [...(terrainData.features ?? []), `city-template:${shapeId}`],
  };
}

function fillScenarioTerrain(map, heights, tile, height) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      map[row][col] = tile;
      heights[row][col] = height;
    }
  }
}

function setScenarioLandHeight(map, heights, row, col, targetHeight = 0) {
  if (!isInsideMap(row, col)) return;
  const safeHeight = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.round(targetHeight)));
  heights[row][col] = safeHeight;
  map[row][col] = safeHeight > 0 ? HILL : GROUND;
}

function setScenarioWater(map, heights, row, col) {
  if (!isInsideMap(row, col)) return;
  map[row][col] = WATER;
  heights[row][col] = 0;
}

function paintScenarioWaterDisc(ctx, centerRow, centerCol, radius) {
  const minRow = Math.max(0, Math.floor(centerRow - radius - 1));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil(centerRow + radius + 1));
  const minCol = Math.max(0, Math.floor(centerCol - radius - 1));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil(centerCol + radius + 1));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (Math.hypot(row - centerRow, col - centerCol) <= radius) {
        setScenarioWater(ctx.map, ctx.heights, row, col);
      }
    }
  }
}

function paintScenarioWaterPath(ctx, points, widthStart, widthEnd) {
  const mapPoints = points.map((point) => ({
    row: point.y * (MAP_HEIGHT - 1),
    col: point.x * (MAP_WIDTH - 1),
  }));
  if (mapPoints.length < 2) return;
  let traveled = 0;
  let total = 0;
  for (let i = 0; i < mapPoints.length - 1; i++) {
    total += Math.hypot(mapPoints[i + 1].row - mapPoints[i].row, mapPoints[i + 1].col - mapPoints[i].col);
  }
  total = Math.max(1, total);

  for (let i = 0; i < mapPoints.length - 1; i++) {
    const start = mapPoints[i];
    const end = mapPoints[i + 1];
    const segLen = Math.max(1, Math.hypot(end.row - start.row, end.col - start.col));
    const steps = Math.max(8, Math.ceil(segLen));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const row = lerp(start.row, end.row, t);
      const col = lerp(start.col, end.col, t);
      const globalT = (traveled + segLen * t) / total;
      const width = lerp(widthStart, widthEnd, globalT);
      paintScenarioWaterDisc(ctx, row, col, width);
    }
    traveled += segLen;
  }
}

function paintScenarioEllipse(ctx, options = {}) {
  const {
    x = 0.5,
    y = 0.5,
    rx = 0.2,
    ry = 0.2,
    rotation = 0,
    jitter = 0,
    mode = 'water',
    landHeight = 0,
  } = options;

  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const minRow = Math.max(0, Math.floor((y - ry - 0.08) * (MAP_HEIGHT - 1)));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil((y + ry + 0.08) * (MAP_HEIGHT - 1)));
  const minCol = Math.max(0, Math.floor((x - rx - 0.08) * (MAP_WIDTH - 1)));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil((x + rx + 0.08) * (MAP_WIDTH - 1)));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const nx = (col / (MAP_WIDTH - 1)) - x;
      const ny = (row / (MAP_HEIGHT - 1)) - y;
      const xr = (nx * cosR + ny * sinR) / Math.max(0.01, rx);
      const yr = (-nx * sinR + ny * cosR) / Math.max(0.01, ry);
      const noise = jitter
        ? (valueNoise(col * 0.023 + 17, row * 0.023 - 11, ctx.rng) - 0.5) * jitter
        : 0;
      if (xr * xr + yr * yr <= 1 + noise) {
        if (mode === 'water') {
          setScenarioWater(ctx.map, ctx.heights, row, col);
        } else {
          setScenarioLandHeight(ctx.map, ctx.heights, row, col, landHeight);
        }
      }
    }
  }
}

function paintScenarioHillRidge(ctx, points, width, peakHeight) {
  const ridge = points.map((point) => ({
    row: point.y * (MAP_HEIGHT - 1),
    col: point.x * (MAP_WIDTH - 1),
  }));
  for (let i = 0; i < ridge.length - 1; i++) {
    const start = ridge[i];
    const end = ridge[i + 1];
    const margin = Math.ceil(width * 2.2);
    const minRow = Math.max(0, Math.floor(Math.min(start.row, end.row) - margin));
    const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil(Math.max(start.row, end.row) + margin));
    const minCol = Math.max(0, Math.floor(Math.min(start.col, end.col) - margin));
    const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil(Math.max(start.col, end.col) + margin));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (ctx.map[row][col] === WATER) continue;
        const d = distanceToSegment(row, col, start, end);
        if (d > width * 2.1) continue;
        const lift = Math.exp(-((d / Math.max(1, width)) ** 2)) * peakHeight;
        const currentHeight = ctx.heights[row][col] ?? 0;
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, Math.max(currentHeight, Math.round(lift)));
      }
    }
  }
}

function softenScenarioLowlands(ctx, centerX, centerY, rx, ry) {
  const minRow = Math.max(0, Math.floor((centerY - ry - 0.05) * (MAP_HEIGHT - 1)));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil((centerY + ry + 0.05) * (MAP_HEIGHT - 1)));
  const minCol = Math.max(0, Math.floor((centerX - rx - 0.05) * (MAP_WIDTH - 1)));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil((centerX + rx + 0.05) * (MAP_WIDTH - 1)));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (ctx.map[row][col] === WATER) continue;
      const nx = ((col / (MAP_WIDTH - 1)) - centerX) / rx;
      const ny = ((row / (MAP_HEIGHT - 1)) - centerY) / ry;
      if (nx * nx + ny * ny > 1) continue;
      if (ctx.heights[row][col] > 1) {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, 1);
      } else {
        setScenarioLandHeight(ctx.map, ctx.heights, row, col, 0);
      }
    }
  }
}

function finalizeScenarioTerrain(ctx, options = {}) {
  const preserveWaterMask = Boolean(options.preserveWaterMask);

  // Keep pre-finalized scenario terrain within the global 1-step slope rule.
  enforceGlobalSlopeConstraints(ctx.map, ctx.heights, 1, 10);

  const next = ctx.map.map((row) => row.slice());
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    for (let col = 1; col < MAP_WIDTH - 1; col++) {
      if (ctx.map[row][col] !== GROUND || (ctx.heights[row][col] ?? 0) > 0) continue;
      let adjacentWater = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (ctx.map[row + dr][col + dc] === WATER) adjacentWater++;
        }
      }
      if (adjacentWater >= 2) next[row][col] = BEACH;
    }
  }

  if (!preserveWaterMask) {
    for (let row = 1; row < MAP_HEIGHT - 1; row++) {
      for (let col = 1; col < MAP_WIDTH - 1; col++) {
        if (ctx.map[row][col] !== WATER) continue;
        let touchingWater = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (ctx.map[row + dr][col + dc] === WATER) touchingWater++;
          }
        }
        if (touchingWater <= 1) {
          next[row][col] = GROUND;
          ctx.heights[row][col] = 0;
        }
      }
    }
  }

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      ctx.map[row][col] = next[row][col];
      if (ctx.map[row][col] === WATER || ctx.map[row][col] === BEACH) {
        ctx.heights[row][col] = 0;
      } else {
        const h = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.round(ctx.heights[row][col] ?? 0)));
        ctx.heights[row][col] = h;
        if (ctx.map[row][col] !== HILL) {
          ctx.map[row][col] = h > 0 ? HILL : GROUND;
        }
      }
    }
  }
}

function buildHongKongScenarioShape(ctx) {
  applyHongKongRealCoastlineFlatMap(ctx);
  applyHongKongMountainRelief(ctx);
}

function buildTaipeiScenarioShape(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, GROUND, 0);
  paintScenarioWaterPath(ctx, [
    { x: 0.57, y: 0.58 }, { x: 0.48, y: 0.52 }, { x: 0.37, y: 0.44 },
    { x: 0.28, y: 0.34 }, { x: 0.16, y: 0.20 }, { x: 0.04, y: 0.06 },
  ], 8, 12);
  paintScenarioWaterPath(ctx, [
    { x: 0.95, y: 0.40 }, { x: 0.82, y: 0.44 }, { x: 0.70, y: 0.50 }, { x: 0.58, y: 0.57 },
  ], 5, 8);
  paintScenarioWaterPath(ctx, [
    { x: 0.63, y: 0.95 }, { x: 0.60, y: 0.84 }, { x: 0.58, y: 0.70 }, { x: 0.57, y: 0.58 },
  ], 5, 7);
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.20, y: 0.26, rx: 0.16, ry: 0.14, landHeight: 3, jitter: 0.14 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.80, y: 0.22, rx: 0.18, ry: 0.15, landHeight: 3, jitter: 0.14 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.85, y: 0.66, rx: 0.13, ry: 0.20, landHeight: 3, jitter: 0.14 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.22, y: 0.76, rx: 0.18, ry: 0.16, landHeight: 2, jitter: 0.12 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.56, y: 0.88, rx: 0.16, ry: 0.10, landHeight: 2, jitter: 0.12 });
  softenScenarioLowlands(ctx, 0.54, 0.54, 0.26, 0.20);
}

function buildTokyoScenarioShape(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, GROUND, 0);
  paintScenarioEllipse(ctx, { mode: 'water', x: 1.13, y: 0.60, rx: 0.46, ry: 0.72, rotation: -0.08, jitter: 0.14 });
  paintScenarioEllipse(ctx, { mode: 'water', x: 0.80, y: 1.16, rx: 0.48, ry: 0.34, rotation: -0.12, jitter: 0.16 });
  paintScenarioEllipse(ctx, { mode: 'water', x: 0.82, y: 0.78, rx: 0.34, ry: 0.24, rotation: -0.20, jitter: 0.12 });
  paintScenarioWaterPath(ctx, [
    { x: 0.44, y: 0.05 }, { x: 0.50, y: 0.22 }, { x: 0.56, y: 0.40 }, { x: 0.62, y: 0.58 }, { x: 0.70, y: 0.74 },
  ], 5, 9);
  paintScenarioWaterPath(ctx, [
    { x: 0.30, y: 0.10 }, { x: 0.42, y: 0.26 }, { x: 0.50, y: 0.44 }, { x: 0.58, y: 0.64 },
  ], 4, 7);
  paintScenarioWaterPath(ctx, [
    { x: 0.24, y: 0.74 }, { x: 0.40, y: 0.75 }, { x: 0.55, y: 0.76 }, { x: 0.70, y: 0.78 },
  ], 4, 6);
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.93, y: 0.66, rx: 0.12, ry: 0.23, rotation: -0.1, landHeight: 1, jitter: 0.12 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.20, y: 0.32, rx: 0.22, ry: 0.22, landHeight: 3, jitter: 0.12 });
  paintScenarioHillRidge(ctx, [
    { x: 0.08, y: 0.18 }, { x: 0.18, y: 0.28 }, { x: 0.27, y: 0.38 }, { x: 0.34, y: 0.54 },
  ], 8, 3);
  softenScenarioLowlands(ctx, 0.50, 0.58, 0.30, 0.22);
}

function buildNewYorkScenarioShape(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, GROUND, 0);
  paintScenarioEllipse(ctx, { mode: 'water', x: 1.16, y: 0.54, rx: 0.48, ry: 0.72, rotation: -0.03, jitter: 0.13 });
  paintScenarioEllipse(ctx, { mode: 'water', x: 0.72, y: 1.18, rx: 0.54, ry: 0.34, rotation: 0.08, jitter: 0.14 });
  paintScenarioWaterPath(ctx, [
    { x: 0.36, y: -0.02 }, { x: 0.35, y: 0.18 }, { x: 0.33, y: 0.38 }, { x: 0.31, y: 0.58 }, { x: 0.30, y: 0.86 },
  ], 8, 10);
  paintScenarioWaterPath(ctx, [
    { x: 0.49, y: 0.08 }, { x: 0.50, y: 0.25 }, { x: 0.53, y: 0.45 }, { x: 0.56, y: 0.60 },
  ], 4, 7);
  paintScenarioEllipse(ctx, { mode: 'water', x: 0.48, y: 0.67, rx: 0.16, ry: 0.12, jitter: 0.10 });
  paintScenarioEllipse(ctx, { mode: 'water', x: 0.67, y: 0.76, rx: 0.13, ry: 0.10, jitter: 0.10 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.43, y: 0.44, rx: 0.05, ry: 0.26, rotation: 0.08, landHeight: 1, jitter: 0.08 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.72, y: 0.48, rx: 0.27, ry: 0.14, rotation: -0.04, landHeight: 0, jitter: 0.08 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.40, y: 0.71, rx: 0.09, ry: 0.08, landHeight: 1, jitter: 0.08 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.17, y: 0.52, rx: 0.22, ry: 0.30, landHeight: 1, jitter: 0.10 });
  paintScenarioHillRidge(ctx, [
    { x: 0.12, y: 0.22 }, { x: 0.18, y: 0.34 }, { x: 0.22, y: 0.50 },
  ], 6, 2);
}

function buildSingaporeScenarioShape(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, WATER, 0);
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.53, y: 0.52, rx: 0.34, ry: 0.19, rotation: -0.05, jitter: 0.14, landHeight: 0 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.33, y: 0.56, rx: 0.12, ry: 0.08, rotation: 0.05, jitter: 0.12, landHeight: 0 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.77, y: 0.50, rx: 0.11, ry: 0.08, rotation: -0.08, jitter: 0.12, landHeight: 0 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.58, y: 0.78, rx: 0.06, ry: 0.04, jitter: 0.10, landHeight: 0 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.66, y: 0.82, rx: 0.04, ry: 0.03, jitter: 0.10, landHeight: 0 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.49, y: 0.47, rx: 0.10, ry: 0.07, landHeight: 2, jitter: 0.12 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.59, y: 0.41, rx: 0.08, ry: 0.05, landHeight: 1, jitter: 0.10 });
  softenScenarioLowlands(ctx, 0.53, 0.52, 0.25, 0.14);
}

function buildLondonScenarioShape(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, GROUND, 0);
  paintScenarioWaterPath(ctx, [
    { x: -0.02, y: 0.54 }, { x: 0.10, y: 0.56 }, { x: 0.23, y: 0.55 }, { x: 0.38, y: 0.58 },
    { x: 0.51, y: 0.62 }, { x: 0.65, y: 0.60 }, { x: 0.80, y: 0.63 }, { x: 1.03, y: 0.66 },
  ], 7, 11);
  paintScenarioWaterPath(ctx, [
    { x: 0.78, y: 0.26 }, { x: 0.74, y: 0.38 }, { x: 0.72, y: 0.52 }, { x: 0.70, y: 0.60 },
  ], 3, 5);
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.17, y: 0.28, rx: 0.16, ry: 0.14, landHeight: 2, jitter: 0.10 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.82, y: 0.28, rx: 0.17, ry: 0.14, landHeight: 2, jitter: 0.10 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.68, y: 0.82, rx: 0.18, ry: 0.14, landHeight: 1, jitter: 0.10 });
  softenScenarioLowlands(ctx, 0.52, 0.56, 0.34, 0.20);
}

function buildCopenhagenScenarioShape(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, WATER, 0);
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.35, y: 0.48, rx: 0.34, ry: 0.27, rotation: -0.08, jitter: 0.14, landHeight: 0 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.60, y: 0.60, rx: 0.16, ry: 0.22, rotation: 0.18, jitter: 0.12, landHeight: 0 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.50, y: 0.23, rx: 0.10, ry: 0.08, jitter: 0.12, landHeight: 0 });
  paintScenarioWaterPath(ctx, [
    { x: 0.46, y: 0.18 }, { x: 0.48, y: 0.32 }, { x: 0.50, y: 0.48 }, { x: 0.53, y: 0.66 }, { x: 0.56, y: 0.84 },
  ], 4, 8);
  paintScenarioWaterPath(ctx, [
    { x: 0.30, y: 0.52 }, { x: 0.42, y: 0.56 }, { x: 0.54, y: 0.58 },
  ], 3, 5);
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.26, y: 0.28, rx: 0.13, ry: 0.10, landHeight: 1, jitter: 0.10 });
  paintScenarioEllipse(ctx, { mode: 'land', x: 0.64, y: 0.76, rx: 0.12, ry: 0.10, landHeight: 1, jitter: 0.10 });
}

function buildSydneyScenarioShape(ctx) {
  fillScenarioTerrain(ctx.map, ctx.heights, GROUND, 0);
  paintScenarioEllipse(ctx, { mode: 'water', x: 1.14, y: 0.56, rx: 0.44, ry: 0.76, rotation: -0.06, jitter: 0.12 });
  paintScenarioWaterPath(ctx, [
    { x: 1.02, y: 0.50 }, { x: 0.90, y: 0.50 }, { x: 0.80, y: 0.52 }, { x: 0.68, y: 0.54 }, { x: 0.56, y: 0.56 },
  ], 8, 13);
  paintScenarioWaterPath(ctx, [
    { x: 0.78, y: 0.53 }, { x: 0.70, y: 0.46 }, { x: 0.60, y: 0.40 }, { x: 0.52, y: 0.34 },
  ], 4, 8);
  paintScenarioWaterPath(ctx, [
    { x: 0.78, y: 0.56 }, { x: 0.70, y: 0.62 }, { x: 0.60, y: 0.70 }, { x: 0.50, y: 0.78 },
  ], 4, 8);
  paintScenarioWaterPath(ctx, [
    { x: 0.30, y: 0.52 }, { x: 0.44, y: 0.54 }, { x: 0.56, y: 0.56 },
  ], 4, 6);
  paintScenarioHillRidge(ctx, [
    { x: 0.16, y: 0.20 }, { x: 0.28, y: 0.34 }, { x: 0.38, y: 0.50 },
  ], 8, 3);
  paintScenarioHillRidge(ctx, [
    { x: 0.16, y: 0.84 }, { x: 0.26, y: 0.70 }, { x: 0.38, y: 0.60 },
  ], 8, 3);
  softenScenarioLowlands(ctx, 0.54, 0.55, 0.24, 0.18);
}

// Zone density option definitions
const ZONE_DENSITY_OPTIONS = [
  { density: 1, labelKey: 'density.low',    costNote: '×1.0' },
  { density: 2, labelKey: 'density.medium', costNote: '×1.5' },
  { density: 3, labelKey: 'density.high',   costNote: '×2.5' },
];

const PARK_OPTIONS = [
  {
    id: 'open_ground',
    type: 'park_small',
    spriteKey: 'park_small_open',
    titleKey: 'park.openGround',
    badge: '1x1',
    icon: '🌳',
    cost: COST_PARK_SMALL,
    footprintCols: 1,
    footprintRows: 1,
  },
  {
    id: 'playground',
    type: 'park_small',
    spriteKey: 'park_small_playground',
    titleKey: 'park.playground',
    badge: '1x1',
    icon: '🎠',
    cost: COST_PARK_SMALL,
    footprintCols: 1,
    footprintRows: 1,
  },
  {
    id: 'large_park',
    type: 'park_large',
    spriteKey: 'park_large',
    titleKey: 'park.largePark',
    badge: '3x3',
    icon: '🌲',
    cost: COST_PARK_LARGE,
    footprintCols: 3,
    footprintRows: 3,
  },
];

function getTerrainLabel(option) {
  return t(option.titleKey);
}

function getDensityLabel(density) {
  const key = { 1: 'density.low', 2: 'density.medium', 3: 'density.high' }[density];
  return key ? t(key) : '';
}

function getZoneLabel(type) {
  return t({ res: 'zone.residential', com: 'zone.commercial', ind: 'zone.industrial' }[type]);
}

function getParkLabel(option) {
  return t(option.titleKey);
}

function getTerrainName(tileType) {
  return t({
    [GROUND]: 'terrain.ground',
    [ROAD]: 'terrain.road',
    [DIRT]: 'terrain.dirt',
    [BEACH]: 'terrain.beach',
    [WATER]: 'terrain.water',
    [HILL]: 'terrain.hill',
  }[tileType] ?? 'terrain.unknown');
}

function getZoneName(zone) {
  if (zone === ZONE_RES) return t('zone.residential');
  if (zone === ZONE_COM) return t('zone.commercial');
  if (zone === ZONE_IND) return t('zone.industrial');
  return t('inspect.noZone');
}

function getBuildingTypeLabel(type) {
  return t({
    residential: 'building.residential',
    commercial: 'building.commercial',
    industrial: 'building.industrial',
    power_plant_coal: 'building.coalPlant',
    power_plant_solar: 'building.solarPlant',
    fire_station: 'building.fireStation',
    police_station: 'building.policeStation',
    park_small: 'building.smallPark',
    park_large: 'building.largePark',
  }[type] ?? type);
}

function getBuildingSubLabel(type, level) {
  const keys = {
    residential: { 1: 'building.house', 2: 'building.apartment', 3: 'building.highRise' },
    commercial: { 1: 'building.shop', 2: 'building.commercialBlock', 3: 'building.officeTower' },
    industrial: { 1: 'building.factory', 2: 'building.industrialComplex', 3: 'building.heavyIndustry' },
  };
  return keys[type]?.[level] ? t(keys[type][level]) : null;
}

// Map data: 1=ground, 2=road, 3=dirt, 4=beach, 5=water, 6=hill
let mapData = createFilledMap(GROUND);

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#87ceeb',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  scene: { preload, create },
};

initializeGame();

async function initializeGame() {
  houseModelSets = await discoverHouseModelSets();
  setupToolMenu();
  setupMenuBar();
  updateHouseToolUi();
  updateTerrainToolUi();
  updateZoneDensityBadges();
  updateParkToolUi();
  new Phaser.Game(config);
}

async function discoverHouseModelSets() {
  const entries = await Promise.all(Object.entries(HOUSE_MODEL_SETS).map(async ([tool, config]) => (
    [tool, await discoverHouseModels(tool, config)]
  )));

  return Object.fromEntries(entries);
}

async function discoverHouseModels(tool, config) {
  const fallbackFiles = config.preferredFiles ?? [config.defaultFile];
  const fallbackModels = createHouseModels(tool, fallbackFiles, config);

  try {
    // Ask the Express server for the actual file list — no HTML scraping needed
    const response = await fetch(`/api/models/${tool}`, { cache: 'no-store' });
    if (!response.ok) return fallbackModels;
    const files = await response.json();
    return Array.isArray(files) && files.length > 0
      ? createHouseModels(tool, sortHouseModelFiles(files, config), config)
      : fallbackModels;
  } catch {
    return fallbackModels;
  }
}

function sortHouseModelFiles(fileNames, config) {
  const preferred = config.preferredFiles ?? [];
  const rank = new Map(preferred.map((fileName, index) => [fileName, index]));

  return [...fileNames].sort((a, b) => {
    const aRank = rank.has(a) ? rank.get(a) : Number.POSITIVE_INFINITY;
    const bRank = rank.has(b) ? rank.get(b) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  });
}

function createHouseModels(tool, fileNames, config) {
  return fileNames.map((fileName, index) => ({
    key: `${tool}_${index}`,
    title: fileName.replace(/\.[^.]+$/, ''),
    path: encodeURI(`${config.folder}${fileName}`),
    footprintCols: config.footprintCols,
    footprintRows: config.footprintRows,
    metadata: null,
  }));
}

function preload() {
  const roadPath = 'kenney_isometric-roads/png/';

  MUSIC_TRACKS.forEach((track) => {
    this.load.audio(track.key, track.file);
  });
  BUILDING_KEYS.forEach((key, index) => {
    this.load.image(key, `Models/PNG/buildingTiles_${String(index).padStart(3, '0')}.png`);
  });
  Object.values(houseModelSets).flat().forEach((model) => {
    this.load.image(model.key, model.path);
  });
  this.load.image('park_small_open', 'Models/park1x1/catProblemPark.png');
  this.load.image('park_small_playground', 'Models/park1x1/smallPark2.png');
  this.load.image('park_small', 'Models/park1x1/catProblemPark.png');
  this.load.image('park_large', 'Models/park3x3/bigPark.png');
  Object.values(POWER_PLANT_MODELS).forEach((model) => {
    this.load.image(model.spriteKey, model.path);
  });

  this.load.image('ground_full', `${roadPath}grassWhole.png`);
  this.load.image('dirt_full', `${roadPath}dirtDouble.png`);
  this.load.image('road_straight_h', `${roadPath}roadNS.png`);
  this.load.image('road_straight_v', `${roadPath}roadEW.png`);
  this.load.image('road_cross', `${roadPath}crossroad.png`);
  this.load.image('road_corner_ne', `${roadPath}roadES.png`);
  this.load.image('road_corner_nw', `${roadPath}roadNE.png`);
  this.load.image('road_corner_se', `${roadPath}roadSW.png`);
  this.load.image('road_corner_sw', `${roadPath}roadNW.png`);
  this.load.image('road_t_n', `${roadPath}crossroadNES.png`);
  this.load.image('road_t_e', `${roadPath}crossroadESW.png`);
  this.load.image('road_t_s', `${roadPath}crossroadNSW.png`);
  this.load.image('road_t_w', `${roadPath}crossroadNEW.png`);
  this.load.image('road_hill_n', `${roadPath}roadHillE.png`);
  this.load.image('road_hill_e', `${roadPath}roadHillS.png`);
  this.load.image('road_hill_s', `${roadPath}roadHillW.png`);
  this.load.image('road_hill_w', `${roadPath}roadHillN.png`);
  this.load.image('road_hill2_n', `${roadPath}roadHill2E.png`);
  this.load.image('road_hill2_e', `${roadPath}roadHill2S.png`);
  this.load.image('road_hill2_s', `${roadPath}roadHill2W.png`);
  this.load.image('road_hill2_w', `${roadPath}roadHill2N.png`);
  this.load.image('road_end_n', `${roadPath}endW.png`);
  this.load.image('road_end_e', `${roadPath}endN.png`);
  this.load.image('road_end_s', `${roadPath}endE.png`);
  this.load.image('road_end_w', `${roadPath}endS.png`);
  this.load.image('road_isolated', `${roadPath}road.png`);
  this.load.image('road_bridge_h', `${roadPath}bridgeNS_iso21_shoulders_top.png`);
  this.load.image('road_bridge_v', `${roadPath}bridgeEW_iso21_shoulders_top.png`);

  this.load.image('water_full', `${roadPath}water.png`);
  this.load.image('water_edge_n', `${roadPath}waterE.png`);
  this.load.image('water_edge_e', `${roadPath}waterS.png`);
  this.load.image('water_edge_s', `${roadPath}waterW.png`);
  this.load.image('water_edge_w', `${roadPath}waterN.png`);
  this.load.image('water_corner_ne', `${roadPath}waterES.png`);
  this.load.image('water_corner_se', `${roadPath}waterSW.png`);
  this.load.image('water_corner_sw', `${roadPath}waterNW.png`);
  this.load.image('water_corner_nw', `${roadPath}waterNE.png`);
  this.load.image('water_corner_land_ne', `${roadPath}waterCornerNE.png`);
  this.load.image('water_corner_land_se', `${roadPath}waterCornerES.png`);
  this.load.image('water_corner_land_sw', `${roadPath}waterCornerSW.png`);
  this.load.image('water_corner_land_nw', `${roadPath}waterCornerNW.png`);

  this.load.image('beach_full', `${roadPath}beach.png`);
  this.load.image('beach_edge_n', `${roadPath}beachW.png`);
  this.load.image('beach_edge_e', `${roadPath}beachN.png`);
  this.load.image('beach_edge_s', `${roadPath}beachE.png`);
  this.load.image('beach_edge_w', `${roadPath}beachS.png`);
  this.load.image('beach_corner_ne', `${roadPath}beachES.png`);
  this.load.image('beach_corner_se', `${roadPath}beachSW.png`);
  this.load.image('beach_corner_sw', `${roadPath}beachNW.png`);
  this.load.image('beach_corner_nw', `${roadPath}beachNE.png`);
  this.load.image('beach_corner_water_ne', `${roadPath}beachCornerNE.png`);
  this.load.image('beach_corner_water_se', `${roadPath}beachCornerES.png`);
  this.load.image('beach_corner_water_sw', `${roadPath}beachCornerSW.png`);
  this.load.image('beach_corner_water_nw', `${roadPath}beachCornerNW.png`);

  this.load.image('hill_plateau', `${roadPath}grassWhole.png`);
  this.load.image('hill_edge_n', `${roadPath}hillE.png`);
  this.load.image('hill_edge_e', `${roadPath}hillS.png`);
  this.load.image('hill_edge_s', `${roadPath}hillW.png`);
  this.load.image('hill_edge_w', `${roadPath}hillN.png`);
  this.load.image('hill_corner_ne', `${roadPath}hillES.png`);
  this.load.image('hill_corner_se', `${roadPath}hillSW.png`);
  this.load.image('hill_corner_sw', `${roadPath}hillNW.png`);
  this.load.image('hill_corner_nw', `${roadPath}hillNE.png`);
}

function create() {
  activeScene = this;
  prepareHouseModelMetadata(this);
  prepareParkModelMetadata(this);
  preparePowerPlantModelMetadata(this);

  updateMapMetrics(this);

  // Panning state
  this.isPanning = false;
  this.panPrevX = 0;
  this.panPrevY = 0;
  this.tileSprites = [];
  this.buildingSprites = new Map();
  this.zoneOverlays    = new Map();
  this.powerLineSprites = new Map();
  this.bridgeSprites = new Map();

  const maskGraphics = this.make.graphics({ x: 0, y: 0, add: false });
  this.maskGraphics = maskGraphics;
  drawWorldMask(this);
  const worldMask = maskGraphics.createGeometryMask();
  this.worldMask = worldMask;

  // Disable browser context menu to allow right-click panning
  this.input.mouse.disableContextMenu();

  // Draw the map: select ground or the appropriate road variant and
  // position it in screen space.  Depth ordering uses the y-value
  // before applying offsets.
  for (let row = 0; row < MAP_HEIGHT; row++) {
    this.tileSprites[row] = [];

    for (let col = 0; col < MAP_WIDTH; col++) {
      const key = getTileKey(row, col);
      const pos = isoToScreen(col, row);
      const x = pos.x + this.offsetX;
      const y = pos.y + this.offsetY + getTerrainTileVisualOffset(row, col, key);
      const tile = this.add.image(x, y, key);
      tile.setOrigin(0.5, 1);
      tile.setDepth(getTerrainTileDepth(row, col, key, pos.y));
      tile.setMask(worldMask);
      applyTileVisualStyle(tile, row, col, key);
      this.tileSprites[row][col] = tile;
    }
  }

  // Pre-generate zone overlay textures (RES/COM/IND coloured diamonds)
  preGenerateZoneTextures(this);
  preGenerateParkTextures(this);

  // Initialise simulation state
  resetGameState();

  this.scale.on('resize', () => {
    updateMapMetrics(this);
    drawWorldMask(this);
    positionAllTiles(this);
  });

  // Group for future buildings
  this.buildings = this.add.group();

  // Zone drag-select preview graphic (drawn over the world during zone rect drag)
  this.zonePreviewGraphic = this.add.graphics();
  this.zonePreviewGraphic.setDepth(9998);

  // Road/bridge drag preview graphic.
  this.bridgePreviewGraphic = this.add.graphics();
  this.bridgePreviewGraphic.setDepth(9998);

  // Inspect-tool hover highlight (red diamond under the cursor)
  this.inspectHighlightGraphic = this.add.graphics();
  this.inspectHighlightGraphic.setDepth(9999);

  // Paint roads on left click; start panning on right click.
  this.input.on('pointerdown', (pointer) => {
    if (pointer.button === 0) {
      isPainting = true;
      const startTile = pointerToTile(this, pointer);
      dragStartTile = startTile ? { row: startTile.row, col: startTile.col } : null;
      lastPaintTile = startTile ? { row: startTile.row, col: startTile.col } : null;
      lastKnownTile = startTile ? { row: startTile.row, col: startTile.col } : null;
      // Roads are committed on pointerup so a drag can become a SimCity-style bridge span.
      if (selectedTool !== 'road') applySelectedTool(this, pointer);
    } else if (pointer.button === 2) {
      this.isPanning = true;
      this.panPrevX = pointer.x;
      this.panPrevY = pointer.y;
    }
  });

  this.input.on('pointerup', (pointer) => {
    if (pointer.button === 0 && selectedTool === 'inspect') {
      applySelectedTool(this, pointer);
    }

    // isPanning is a scene property — must be cleared here.
    // All other cleanup (zone fill, isPainting, dragStartTile…) is handled by
    // the window 'pointerup' listener, which fires synchronously before Phaser's
    // deferred event queue processes this callback.
    if (pointer.button === 2) this.isPanning = false;
  });

  // Adjust camera scroll during panning
  this.input.on('pointermove', (pointer) => {
    if (isPainting && pointer.isDown) {
      if (selectedTool === 'road' && dragStartTile) {
        const cur = pointerToTile(this, pointer);
        if (cur) {
          lastKnownTile = { row: cur.row, col: cur.col };
          drawRoadDragPreview(this, dragStartTile, cur);
        }
      } else if (isZoneTool()) {
        // Zone tools: update the tracked end-tile and redraw the ISO rectangle preview.
        // Actual zone fill happens in the window 'pointerup' listener.
        const cur = pointerToTile(this, pointer);
        if (cur) {
          lastKnownTile = { row: cur.row, col: cur.col };
          if (dragStartTile) drawZoneSelectionPreview(this, dragStartTile, cur);
        }
      } else {
        // Per-tile drag-paint for all other tools (bulldoze, dezone, terrain, power-line…)
        applySelectedTool(this, pointer);
      }
      return;
    }

    // Clear zone preview when not dragging
    if (this.zonePreviewGraphic) this.zonePreviewGraphic.clear();

    if (this.isPanning) {
      const camera = this.cameras.main;
      const dx = pointer.x - this.panPrevX;
      const dy = pointer.y - this.panPrevY;
      camera.scrollX -= dx / camera.zoom;
      camera.scrollY -= dy / camera.zoom;
      this.panPrevX = pointer.x;
      this.panPrevY = pointer.y;
    }

    // Inspect highlight — red diamond on hovered tile (only in ? mode)
    if (selectedTool === 'inspect') {
      const cur = pointerToTile(this, pointer);
      lastInspectTile = cur ? { row: cur.row, col: cur.col } : null;
      if (cur) drawInspectHighlight(this, cur.row, cur.col);
      else if (this.inspectHighlightGraphic) this.inspectHighlightGraphic.clear();
    } else {
      lastInspectTile = null;
      if (this.inspectHighlightGraphic) this.inspectHighlightGraphic.clear();
    }

    hideTileDebug();
  });

  // Hide tooltip when mouse leaves canvas
  this.input.on('pointerout', () => {
    const el = document.getElementById('tile-debug');
    if (el) el.style.display = 'none';
    if (this.inspectHighlightGraphic) this.inspectHighlightGraphic.clear();
  });

  // Mouse wheel zoom anchored at pointer position
  this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ, event) => {
    const camera = this.cameras.main;
    let newZoom = camera.zoom;
    if (deltaY < 0) {
      newZoom *= 1.1;
    } else if (deltaY > 0) {
      newZoom /= 1.1;
    }
    newZoom = Phaser.Math.Clamp(newZoom, 0.4, 3);
    // Save the world position under the pointer
    const worldX = camera.scrollX + pointer.x / camera.zoom;
    const worldY = camera.scrollY + pointer.y / camera.zoom;
    camera.setZoom(newZoom);
    camera.scrollX = worldX - pointer.x / camera.zoom;
    camera.scrollY = worldY - pointer.y / camera.zoom;
  });

  // Spacebar pause shortcut
  this.input.keyboard.on('keydown-SPACE', () => toggleSimPause());

  // Sim timer starts once player dismisses the landing screen
  gameReady = true;
  initBudgetPanel();
  updateHUD();
  setupLandingScreen();
}

function setupToolMenu() {
  const menu = document.getElementById('tool-menu');
  if (!menu) return;

  menu.addEventListener('pointerdown', (event) => event.stopPropagation());

  // Speed controls
  const speedControls = document.getElementById('speed-controls');
  if (speedControls) {
    speedControls.addEventListener('pointerdown', (e) => e.stopPropagation());
    speedControls.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-speed]');
      if (!btn) return;
      const speed = Number(btn.dataset.speed);
      setSimSpeed(speed);
      speedControls.querySelectorAll('.speed-btn').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
    });
  }
  setupHouseToolMenu(menu);
  setupTerrainTool(menu);
  setupZoneDensityTools(menu);
  setupParkTool(menu);

  window.addEventListener('pointerup', () => {
    const wasPainting = isPainting;
    // ── Zone rect-fill (BEFORE clearing state) ────────────────────────────────
    // Phaser defers its own pointerup event to the next update() frame, so the
    // window handler fires first.  We use this guaranteed-synchronous callback
    // to apply the rectangle fill while dragStartTile is still valid.
    if (isPainting && dragStartTile && isZoneTool() && activeScene) {
      const endTile = lastKnownTile ?? dragStartTile;
      fillZoneRect(activeScene, dragStartTile, endTile);
    }
    if (isPainting && dragStartTile && selectedTool === 'road' && activeScene) {
      const endTile = lastKnownTile ?? dragStartTile;
      commitRoadDrag(activeScene, dragStartTile, endTile);
    }
    if (activeScene?.zonePreviewGraphic)        activeScene.zonePreviewGraphic.clear();
    if (activeScene?.bridgePreviewGraphic)      activeScene.bridgePreviewGraphic.clear();
    if (activeScene?.inspectHighlightGraphic)   activeScene.inspectHighlightGraphic.clear();

    // ── Clear paint state ─────────────────────────────────────────────────────
    isPainting     = false;
    lastEditedTile = null;
    dragStartTile  = null;
    lastPaintTile  = null;
    lastKnownTile  = null;
    clearHousePressTimer();
    clearTerrainPressTimer();
    clearParkPressTimer();
    Object.keys(zonePressTimers).forEach(clearZonePressTimer);
    if (wasPainting) closeToolPopups();
  });
  window.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#tool-menu')) {
      closeToolCategoryFlyouts();
    }
    if (event.target.closest('#house-size-menu') || event.target.closest('[data-tool="house"]')) return;
    closeHouseSizeMenu();
    if (!event.target.closest('#terrain-picker') && !event.target.closest('[data-tool="terrain"]')) {
      closeTerrainPicker();
    }
    if (!event.target.closest('#zone-density-menu') && !event.target.closest('[data-zone-type]')) {
      closeZoneDensityMenu();
    }
    if (!event.target.closest('#park-picker') && !event.target.closest('[data-tool="park"]')) {
      closeParkPicker();
    }
  });

  menu.addEventListener('click', (event) => {
    const categoryButton = event.target.closest('[data-tool-category]');
    if (categoryButton) {
      toggleToolCategory(categoryButton);
      return;
    }

    const overlayButton = event.target.closest('[data-overlay]');
    if (overlayButton) {
      if (isTerrainCreatorMode) return;
      toggleOverlayMap(overlayButton.dataset.overlay);
      closeToolCategoryFlyouts();
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (actionButton?.dataset.action === 'generate') {
      generateNewTerrain();
      closeToolCategoryFlyouts();
      return;
    }
    if (actionButton?.dataset.action === 'save-terrain') {
      saveTerrainPresetFromCurrentMap();
      closeToolCategoryFlyouts();
      return;
    }
    if (actionButton?.dataset.action === 'save') {
      saveGame();
      closeToolCategoryFlyouts();
      return;
    }
    if (actionButton?.dataset.action === 'rotate') {
      if (activeScene) rotateMap(activeScene, 1);
      closeToolCategoryFlyouts();
      return;
    }

    const button = event.target.closest('[data-tool]');
    if (!button) return;

    if (isTerrainCreatorMode && button.dataset.tool !== 'terrain') {
      showToast(t('toast.terrainCreatorOnlyTerrainTools'), 'warning');
      closeToolCategoryFlyouts();
      return;
    }

    // ── House tool ────────────────────────────────────────────────────────
    if (button.dataset.tool === 'house' && didLongPressHouse) {
      didLongPressHouse = false;
      return;
    }
    if (button.dataset.tool === 'house') {
      selectedTool = 'house';
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === button);
      });
      updateToolCategoryState(menu, selectedTool);
      updateHouseToolUi();
      toggleHouseSizeMenu(button);
      closeToolCategoryFlyouts();
      return;
    }

    // ── Terrain tool ──────────────────────────────────────────────────────
    if (button.dataset.tool === 'terrain' && didLongPressTerrain) {
      didLongPressTerrain = false;
      return;
    }
    if (button.dataset.tool === 'terrain') {
      selectedTool = 'terrain';
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === button);
      });
      updateToolCategoryState(menu, selectedTool);
      updateTerrainToolUi();
      toggleTerrainPicker(button);
      closeToolCategoryFlyouts();
      return;
    }

    // ── Zone tools ────────────────────────────────────────────────────────
    const zoneType = button.dataset.zoneType;
    if (zoneType && didLongPressZone[button.dataset.tool]) {
      didLongPressZone[button.dataset.tool] = false;
      return;
    }
    if (zoneType) {
      selectedTool = button.dataset.tool;
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === button);
      });
      updateToolCategoryState(menu, selectedTool);
      updateZoneDensityBadges();
      toggleZoneDensityMenu(button.dataset.tool, button);
      closeToolCategoryFlyouts();
      return;
    }

    // ── Park tool ────────────────────────────────────────────────────────
    if (button.dataset.tool === 'park') {
      if (didLongPressPark) {
        didLongPressPark = false;
        return;
      }
      selectedTool = 'park';
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === button);
      });
      updateToolCategoryState(menu, selectedTool);
      toggleParkPicker(button);
      closeToolCategoryFlyouts();
      return;
    }

    selectedTool = button.dataset.tool;
    menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
      toolButton.classList.toggle('is-active', toolButton === button);
    });
    updateToolCategoryState(menu, selectedTool);
    updateHouseToolUi();
    closeToolPopups();

    // When switching away from inspect: clear the highlight and hide the tooltip.
    // When switching TO inspect: nothing to do — hover will show them naturally.
    if (selectedTool !== 'inspect') {
      lastInspectTile = null;
      if (activeScene?.inspectHighlightGraphic) activeScene.inspectHighlightGraphic.clear();
      const dbgEl = document.getElementById('tile-debug');
      if (dbgEl) dbgEl.style.display = 'none';
    }
  });

  setupJukebox();
  setupRotateCluster();
  setupTerrainMiniMapControls();
}

function getToolCategoryForTool(tool) {
  if (tool === 'inspect') return 'inspect';
  if (tool === 'terrain') return 'terrain';
  if (tool === 'road') return 'roads';
  if (tool === 'zone-res' || tool === 'zone-com' || tool === 'zone-ind' || tool === 'dezone') return 'zones';
  if (tool === 'power-line' || tool === 'power-coal' || tool === 'power-solar') return 'power';
  if (tool === 'fire-station' || tool === 'police-station') return 'services';
  if (tool === 'park') return 'parks';
  if (tool === 'house') return 'buildings';
  return null;
}

function updateToolCategoryState(menu = document.getElementById('tool-menu'), tool = selectedTool) {
  if (!menu) return;
  const activeCategory = getToolCategoryForTool(tool);
  menu.querySelectorAll('[data-tool-category]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.toolCategory === activeCategory);
  });
  menu.querySelectorAll('.tool-flyout [data-tool]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tool === tool);
  });
}

function toggleToolCategory(categoryButton) {
  const category = categoryButton?.dataset.toolCategory;
  const panel = category ? document.querySelector(`.tool-flyout[data-tool-panel="${category}"]`) : null;
  if (!panel) return;
  if (panel.classList.contains('is-open')) {
    closeToolCategoryFlyouts();
    return;
  }
  openToolCategory(categoryButton, panel);
}

function openToolCategory(categoryButton, panel) {
  closeToolCategoryFlyouts();
  positionToolFlyout(categoryButton, panel);
  categoryButton.classList.add('is-open');
  panel.classList.add('is-open');
}

function positionToolFlyout(categoryButton, panel) {
  const bounds = categoryButton.getBoundingClientRect();
  panel.style.top = `${Math.max(8, Math.min(bounds.top, window.innerHeight - 48))}px`;

  requestAnimationFrame(() => {
    const panelBounds = panel.getBoundingClientRect();
    const maxTop = Math.max(8, window.innerHeight - panelBounds.height - 8);
    panel.style.top = `${Math.max(8, Math.min(bounds.top, maxTop))}px`;
  });
}

function closeToolCategoryFlyouts() {
  const menu = document.getElementById('tool-menu');
  menu?.querySelectorAll('[data-tool-category].is-open').forEach((button) => {
    button.classList.remove('is-open');
  });
  document.querySelectorAll('.tool-flyout.is-open').forEach((panel) => {
    panel.classList.remove('is-open');
  });
}

function setupHouseToolMenu(menu) {
  const houseButton = menu.querySelector('[data-tool="house"]');
  const sizeMenu = document.getElementById('house-size-menu');
  if (!houseButton || !sizeMenu) return;

  houseButton.addEventListener('pointerdown', () => {
    didLongPressHouse = false;
    clearHousePressTimer();
    housePressTimer = window.setTimeout(() => {
      didLongPressHouse = true;
      selectedTool = 'house';
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === houseButton);
      });
      updateToolCategoryState(menu, selectedTool);
      openHouseSizeMenu(houseButton);
      closeToolCategoryFlyouts();
    }, 450);
  });

  houseButton.addEventListener('pointerleave', clearHousePressTimer);

  sizeMenu.addEventListener('pointerdown', (event) => event.stopPropagation());
  sizeMenu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-house-set]');
    if (!button) return;

    selectedHouseSet = button.dataset.houseSet;
    selectedTool = 'house';
    closeHouseSizeMenu();
    updateHouseToolUi();
  });
}

function clearHousePressTimer() {
  if (!housePressTimer) return;
  window.clearTimeout(housePressTimer);
  housePressTimer = null;
}

// ── Terrain tool (single button + long-press popup) ───────────────────────────

function setupTerrainTool(menu) {
  const terrainButton = menu.querySelector('[data-tool="terrain"]');
  const picker = document.getElementById('terrain-picker');
  if (!terrainButton || !picker) return;

  terrainButton.addEventListener('pointerdown', () => {
    didLongPressTerrain = false;
    clearTerrainPressTimer();
    terrainPressTimer = window.setTimeout(() => {
      didLongPressTerrain = true;
      selectedTool = 'terrain';
      menu.querySelectorAll('[data-tool]').forEach((btn) => {
        btn.classList.toggle('is-active', btn === terrainButton);
      });
      updateToolCategoryState(menu, selectedTool);
      openTerrainPicker(terrainButton);
      closeToolCategoryFlyouts();
    }, 450);
  });

  terrainButton.addEventListener('pointerleave', clearTerrainPressTimer);

  picker.addEventListener('pointerdown', (e) => e.stopPropagation());
  picker.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-terrain-key]');
    if (!btn) return;
    selectedTerrainType = btn.dataset.terrainKey;
    selectedTool = 'terrain';
    closeTerrainPicker();
    updateTerrainToolUi();
    // Activate the terrain button
    menu.querySelectorAll('[data-tool]').forEach((b) => {
      b.classList.toggle('is-active', b === terrainButton);
    });
  });
}

function clearTerrainPressTimer() {
  if (!terrainPressTimer) return;
  window.clearTimeout(terrainPressTimer);
  terrainPressTimer = null;
}

function openTerrainPicker(triggerButton = document.querySelector('[data-tool="terrain"]')) {
  const picker = document.getElementById('terrain-picker');
  if (!picker) return;

  picker.innerHTML = '';
  TERRAIN_OPTIONS.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'popup-button';
    btn.type = 'button';
    btn.dataset.terrainKey = opt.key;
    btn.classList.toggle('is-active', opt.key === selectedTerrainType);
    const labelText = getTerrainLabel(opt);
    btn.title = labelText;

    const swatch = document.createElement('span');
    swatch.className = `swatch ${opt.swatchClass}`;
    swatch.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'popup-label';
    label.textContent = labelText;

    btn.append(swatch, label);
    picker.append(btn);
  });

  const triggerBounds = triggerButton?.getBoundingClientRect();
  if (triggerBounds) picker.style.top = `${triggerBounds.top}px`;

  picker.classList.add('is-open');
}

function closeTerrainPicker() {
  document.getElementById('terrain-picker')?.classList.remove('is-open');
}

function toggleTerrainPicker(triggerButton) {
  const picker = document.getElementById('terrain-picker');
  if (picker?.classList.contains('is-open')) closeTerrainPicker();
  else openTerrainPicker(triggerButton);
}

function updateTerrainToolUi() {
  const swatch = document.getElementById('terrain-tool-swatch');
  const badge  = document.getElementById('terrain-tool-badge');
  const opt = TERRAIN_OPTIONS.find((o) => o.key === selectedTerrainType) ?? TERRAIN_OPTIONS[0];

  if (swatch) {
    swatch.className = `swatch ${opt.swatchClass}`;
  }
  if (badge) {
    badge.textContent = opt.emoji;
  }

  const btn = document.querySelector('[data-tool="terrain"]');
  if (btn) {
    btn.title = t('tool.terrain', { terrain: getTerrainLabel(opt) });
    btn.setAttribute('aria-label', btn.title);
  }
}

function setTerrainEditorUiActive(active) {
  document.body?.classList.toggle('terrain-editor-mode', !!active);
  if (active) {
    closeOverlayWindow();
    closeToolPopups();
    closeToolCategoryFlyouts();
    document.getElementById('budget-detail')?.classList.remove('is-open');
    document.getElementById('budget-window')?.classList.remove('is-open');
    document.getElementById('inspect-panel')?.style.setProperty('display', 'none');
    selectedTool = 'terrain';
    updateToolCategoryState();
    updateTerrainToolUi();
    scheduleTerrainMiniMapUpdate();
  } else {
    if (terrainMiniMapRaf !== null) {
      cancelAnimationFrame(terrainMiniMapRaf);
      terrainMiniMapRaf = null;
    }
  }
}

// ── Zone density tools (R/C/I long-press popup) ───────────────────────────────

function setupZoneDensityTools(menu) {
  const densityMenu = document.getElementById('zone-density-menu');
  if (!densityMenu) return;

  ['zone-res', 'zone-com', 'zone-ind'].forEach((toolKey) => {
    const btn = menu.querySelector(`[data-tool="${toolKey}"]`);
    if (!btn) return;

    btn.addEventListener('pointerdown', () => {
      didLongPressZone[toolKey] = false;
      clearZonePressTimer(toolKey);
      zonePressTimers[toolKey] = window.setTimeout(() => {
        didLongPressZone[toolKey] = true;
        selectedTool = toolKey;
        menu.querySelectorAll('[data-tool]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
        openZoneDensityMenu(toolKey, btn);
        updateToolCategoryState(menu, selectedTool);
        closeToolCategoryFlyouts();
      }, 450);
    });

    btn.addEventListener('pointerleave', () => clearZonePressTimer(toolKey));
  });

  densityMenu.addEventListener('pointerdown', (e) => e.stopPropagation());
  densityMenu.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-density]');
    if (!btn) return;
    const zoneType = densityMenu.dataset.currentZone; // 'res', 'com', or 'ind'
    const density  = Number(btn.dataset.density);
    if (zoneType) selectedZoneDensity[zoneType] = density;
    closeZoneDensityMenu();
    updateZoneDensityBadges();
  });
}

function clearZonePressTimer(toolKey) {
  if (!zonePressTimers[toolKey]) return;
  window.clearTimeout(zonePressTimers[toolKey]);
  zonePressTimers[toolKey] = null;
}

function openZoneDensityMenu(toolKey, triggerButton) {
  const densityMenu = document.getElementById('zone-density-menu');
  if (!densityMenu) return;

  // Determine zone letter and current density
  const zoneType = toolKey.replace('zone-', '');          // 'res', 'com', 'ind'
  const letter   = zoneType === 'res' ? 'R' : zoneType === 'com' ? 'C' : 'I';
  const colorKey = zoneType;
  const baseCost = zoneType === 'res' ? 50 : zoneType === 'com' ? 60 : 50;
  const currentDensity = selectedZoneDensity[zoneType] ?? 1;

  densityMenu.dataset.currentZone = zoneType;
  densityMenu.innerHTML = '';

  ZONE_DENSITY_OPTIONS.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'popup-button';
    btn.type = 'button';
    btn.dataset.density = opt.density;
    btn.classList.toggle('is-active', opt.density === currentDensity);

    const block = document.createElement('span');
    block.className = `zone-block ${colorKey}`;
    block.textContent = `${letter}${opt.density}`;

    const label = document.createElement('span');
    label.className = 'popup-label';
    label.textContent = t(opt.labelKey);

    const cost = document.createElement('span');
    cost.className = 'popup-cost';
    cost.textContent = `$${Math.round(baseCost * [1, 1.5, 2.5][opt.density - 1])}`;

    btn.append(block, label, cost);
    densityMenu.append(btn);
  });

  const bounds = triggerButton.getBoundingClientRect();
  densityMenu.style.top = `${bounds.top}px`;
  densityMenu.classList.add('is-open');
}

function closeZoneDensityMenu() {
  document.getElementById('zone-density-menu')?.classList.remove('is-open');
}

function toggleZoneDensityMenu(toolKey, triggerButton) {
  const densityMenu = document.getElementById('zone-density-menu');
  const zoneType = toolKey.replace('zone-', '');
  if (densityMenu?.classList.contains('is-open') && densityMenu.dataset.currentZone === zoneType) {
    closeZoneDensityMenu();
  } else {
    openZoneDensityMenu(toolKey, triggerButton);
  }
}

function updateZoneDensityBadges() {
  const ZONE_COSTS = { res: COST_ZONE_RES, com: COST_ZONE_COM, ind: COST_ZONE_IND };
  ['res', 'com', 'ind'].forEach((type) => {
    const el = document.getElementById(`zone-${type}-badge`);
    const density = selectedZoneDensity[type] ?? 1;
    const letter = type === 'res' ? 'R' : type === 'com' ? 'C' : 'I';
    if (el) el.textContent = `${letter}${density}`;

    // Update button tooltip to reflect current density + cost
    const btn = document.querySelector(`[data-tool="zone-${type}"]`);
    if (btn) {
      const cost = Math.round((ZONE_COSTS[type] ?? 50) * (DENSITY_COST_MUL[density] ?? 1));
      const zone = getZoneLabel(type);
      const densityName = getDensityLabel(density);
      const title = t('tool.zone', { zone, density: densityName, cost });
      btn.title = title;
      btn.setAttribute('aria-label', t('tool.zoneAria', { zone, density: densityName }));
    }
  });
}

// ── Park tool (single button + picker) ────────────────────────────────────────

function setupParkTool(menu) {
  const parkButton = menu.querySelector('[data-tool="park"]');
  const picker = document.getElementById('park-picker');
  if (!parkButton || !picker) return;

  parkButton.addEventListener('pointerdown', () => {
    didLongPressPark = false;
    clearParkPressTimer();
    parkPressTimer = window.setTimeout(() => {
      didLongPressPark = true;
      selectedTool = 'park';
      menu.querySelectorAll('[data-tool]').forEach((btn) => {
        btn.classList.toggle('is-active', btn === parkButton);
      });
      openParkPicker(parkButton);
      updateToolCategoryState(menu, selectedTool);
      closeToolCategoryFlyouts();
    }, 450);
  });

  parkButton.addEventListener('pointerleave', clearParkPressTimer);

  picker.addEventListener('pointerdown', (event) => event.stopPropagation());
  picker.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-park-id]');
    if (!btn) return;

    selectedParkId = btn.dataset.parkId;
    selectedTool = 'park';
    closeParkPicker();
    updateParkToolUi();
    menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
      toolButton.classList.toggle('is-active', toolButton === parkButton);
    });
  });
}

function clearParkPressTimer() {
  if (!parkPressTimer) return;
  window.clearTimeout(parkPressTimer);
  parkPressTimer = null;
}

function openParkPicker(triggerButton = document.querySelector('[data-tool="park"]')) {
  const picker = document.getElementById('park-picker');
  if (!picker) return;

  picker.innerHTML = '';
  PARK_OPTIONS.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'popup-button';
    btn.type = 'button';
    btn.dataset.parkId = opt.id;
    btn.classList.toggle('is-active', opt.id === selectedParkId);

    const icon = document.createElement('span');
    icon.className = 'park-popup-icon';
    icon.textContent = opt.icon;
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'popup-label';
    label.textContent = `${getParkLabel(opt)} ${opt.badge}`;

    const cost = document.createElement('span');
    cost.className = 'popup-cost';
    cost.textContent = `$${opt.cost}`;

    btn.append(icon, label, cost);
    picker.append(btn);
  });

  const bounds = triggerButton?.getBoundingClientRect();
  if (bounds) picker.style.top = `${bounds.top}px`;
  picker.classList.add('is-open');
}

function closeParkPicker() {
  document.getElementById('park-picker')?.classList.remove('is-open');
}

function toggleParkPicker(triggerButton) {
  const picker = document.getElementById('park-picker');
  if (picker?.classList.contains('is-open')) closeParkPicker();
  else openParkPicker(triggerButton);
}

function getSelectedParkOption() {
  return PARK_OPTIONS.find((opt) => opt.id === selectedParkId) ?? PARK_OPTIONS[0];
}

function getParkOptionBySpriteKey(spriteKey) {
  return PARK_OPTIONS.find((opt) => opt.spriteKey === spriteKey)
    ?? PARK_OPTIONS.find((opt) => opt.spriteKey === 'park_small_open');
}

function updateParkToolUi() {
  const btn = document.querySelector('[data-tool="park"]');
  const badge = document.getElementById('park-tool-badge');
  const icon = document.getElementById('park-tool-icon');
  const opt = getSelectedParkOption();
  if (!btn || !opt) return;

  if (badge) badge.textContent = opt.badge;
  if (icon) icon.textContent = opt.icon;
  btn.title = t('tool.park', { name: getParkLabel(opt), badge: opt.badge, cost: opt.cost });
  btn.setAttribute('aria-label', btn.title);
}

// ── Overlay map floating window ───────────────────────────────────────────────

const OVERLAY_TITLES = {
  pollution:   'overlay.pollution',
  crime:       'overlay.crime',
  fire:        'overlay.fire',
  population:  'overlay.population',
  landvalue:   'overlay.landvalue',
  electricity: 'overlay.electricity',
  power:       'overlay.power',
};
const OVERLAY_ICONS = {
  pollution: '🏭', crime: '🚔', fire: '🔥', population: '👥', landvalue: '💰', electricity: '🔌', power: '⚡',
};

function initOverlayControls() {
  const controls     = document.getElementById('overlay-controls');
  const modeButtons  = document.getElementById('overlay-mode-buttons');
  const win          = document.getElementById('overlay-window');
  const closeBtn     = document.getElementById('overlay-win-close');
  const titlebar     = document.getElementById('overlay-win-titlebar');
  const body         = document.getElementById('overlay-win-body');
  const zoomInBtn    = document.getElementById('overlay-zoom-in');
  const zoomOutBtn   = document.getElementById('overlay-zoom-out');
  const zoomResetBtn = document.getElementById('overlay-zoom-reset');
  const resizeHandle = document.getElementById('overlay-resize-handle');

  if (!controls || !win) return;

  // ── HUD overlay buttons ─────────────────────────────────────────────────────
  controls.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-overlay]');
    if (!btn) return;
    toggleOverlayMap(btn.dataset.overlay);
  });

  modeButtons?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-overlay]');
    if (!btn) return;
    toggleOverlayMap(btn.dataset.overlay);
  });

  modeButtons?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  // ── Close button ─────────────────────────────────────────────────────────────
  closeBtn?.addEventListener('click', () => closeOverlayWindow());

  // ── Title bar — drag to move window ──────────────────────────────────────────
  let isDraggingWin = false, winOffX = 0, winOffY = 0;

  titlebar?.addEventListener('mousedown', (e) => {
    if (e.target.closest('#overlay-win-close')) return;
    isDraggingWin = true;
    // Switch from transform-based centering to explicit position
    const rect = win.getBoundingClientRect();
    win.style.transform = 'none';
    win.style.left = `${rect.left}px`;
    win.style.top  = `${rect.top}px`;
    winOffX = e.clientX - rect.left;
    winOffY = e.clientY - rect.top;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingWin) {
      const vw = window.innerWidth, vh = window.innerHeight;
      win.style.left = `${Math.max(0, Math.min(vw - 60, e.clientX - winOffX))}px`;
      win.style.top  = `${Math.max(0, Math.min(vh - 40, e.clientY - winOffY))}px`;
    }
    if (isMapPanning) {
      mapViewPanX = e.clientX - _panStartX;
      mapViewPanY = e.clientY - _panStartY;
      _applyCanvasTransform();
    }
    if (isResizingWin) {
      const newW = Math.max(260, _resizeStartW + (e.clientX - _resizeStartMouseX));
      const newH = Math.max(220, _resizeStartH + (e.clientY - _resizeStartMouseY));
      win.style.width  = `${newW}px`;
      win.style.height = `${newH}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    isDraggingWin  = false;
    isMapPanning   = false;
    isResizingWin  = false;
    document.getElementById('overlay-win-body')?.classList.remove('is-panning');
  });

  // ── Map body — drag to pan ────────────────────────────────────────────────────
  body?.addEventListener('mousedown', (e) => {
    if (e.target.closest('#overlay-mode-buttons, #overlay-legend, #overlay-detail-panel, #overlay-power-footer, .overlay-zoom-group')) return;
    if (e.button !== 0) return;
    isMapPanning = true;
    _panStartX   = e.clientX - mapViewPanX;
    _panStartY   = e.clientY - mapViewPanY;
    body.classList.add('is-panning');
    e.preventDefault();
  });

  // ── Map body — scroll wheel to zoom ──────────────────────────────────────────
  body?.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect   = body.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    _zoomAtPoint(mouseX, mouseY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
  }, { passive: false });

  // ── Zoom buttons ─────────────────────────────────────────────────────────────
  zoomInBtn?.addEventListener('click', () => {
    const b = document.getElementById('overlay-win-body');
    if (b) _zoomAtPoint(b.clientWidth / 2, b.clientHeight / 2, 1.4);
  });
  zoomOutBtn?.addEventListener('click', () => {
    const b = document.getElementById('overlay-win-body');
    if (b) _zoomAtPoint(b.clientWidth / 2, b.clientHeight / 2, 1 / 1.4);
  });
  zoomResetBtn?.addEventListener('click', () => resetMapView());

  // ── Custom resize handle ──────────────────────────────────────────────────────
  let isResizingWin = false;
  let _resizeStartW = 0, _resizeStartH = 0, _resizeStartMouseX = 0, _resizeStartMouseY = 0;

  resizeHandle?.addEventListener('mousedown', (e) => {
    isResizingWin      = true;
    _resizeStartW      = win.offsetWidth;
    _resizeStartH      = win.offsetHeight;
    _resizeStartMouseX = e.clientX;
    _resizeStartMouseY = e.clientY;
    e.preventDefault();
    e.stopPropagation();
  });

  // ── Block game input while window is focused ──────────────────────────────────
  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('contextmenu', (e) => e.preventDefault());
}

function toggleOverlayMap(type) {
  const win = document.getElementById('overlay-window');
  if (!type || !win) return;

  if (activeOverlay === type && win.classList.contains('is-open')) {
    closeOverlayWindow();
    return;
  }

  activeOverlay = type;
  overlayCache = {};
  _syncOverlayButtons();
  openOverlayWindow();
}

// Shared drag-pan state (referenced inside mousemove above)
let isMapPanning = false, _panStartX = 0, _panStartY = 0;

function openOverlayWindow() {
  const win = document.getElementById('overlay-window');
  if (!win) return;
  win.classList.add('is-open');
  updateMiniMap();
  // Fit the full map into the viewport on first open
  requestAnimationFrame(resetMapView);
}

function closeOverlayWindow() {
  document.getElementById('overlay-window')?.classList.remove('is-open');
  activeOverlay = null;
  overlayCache  = {};
  _syncOverlayButtons();
}

function _syncOverlayButtons() {
  document.querySelectorAll('.overlay-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.overlay === activeOverlay);
  });
}

function updateMiniMap() {
  const win    = document.getElementById('overlay-window');
  const canvas = document.getElementById('mini-map-canvas');
  if (!win || !canvas || !activeOverlay || !win.classList.contains('is-open')) return;

  // Update title bar
  const titleEl = document.getElementById('overlay-win-title');
  const iconEl  = document.getElementById('overlay-win-icon');
  if (titleEl) titleEl.textContent = t(OVERLAY_TITLES[activeOverlay] ?? activeOverlay);
  if (iconEl)  iconEl.textContent  = OVERLAY_ICONS[activeOverlay]  ?? '🗺';

  overlayCache[activeOverlay] = computeOverlayMap(activeOverlay);
  drawMiniMap(canvas, activeOverlay);
  _drawLegendGradient(activeOverlay);
  updateOverlayDetailPanel(activeOverlay);
}

// Fit the entire 256×256 map inside the viewport, centred
function resetMapView() {
  const body = document.getElementById('overlay-win-body');
  if (!body) return;
  const bw = body.clientWidth  || 360;
  const bh = body.clientHeight || 360;
  mapViewZoom = Math.min(bw / 256, bh / 256);
  mapViewPanX = (bw - 256 * mapViewZoom) / 2;
  mapViewPanY = (bh - 256 * mapViewZoom) / 2;
  _applyCanvasTransform();
}

function _zoomAtPoint(mouseX, mouseY, factor) {
  const newZoom = Math.max(0.3, Math.min(12, mapViewZoom * factor));
  mapViewPanX   = mouseX - (mouseX - mapViewPanX) * (newZoom / mapViewZoom);
  mapViewPanY   = mouseY - (mouseY - mapViewPanY) * (newZoom / mapViewZoom);
  mapViewZoom   = newZoom;
  _applyCanvasTransform();
}

function _applyCanvasTransform() {
  const canvas = document.getElementById('mini-map-canvas');
  if (canvas) canvas.style.transform = `translate(${mapViewPanX}px,${mapViewPanY}px) scale(${mapViewZoom})`;
  const label = document.getElementById('overlay-zoom-label');
  if (label) label.textContent = `${Math.round(mapViewZoom * 100)}%`;
}

function _drawLegendGradient(type) {
  const canvas = document.getElementById('overlay-legend-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let x = 0; x < W; x++) {
    const val = Math.max(0.02, x / (W - 1)); // force visible even at 0
    const [r, g, b] = overlayPixelColor(type, val);
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 230;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawMiniMap(canvas, type) {
  const ctx = canvas.getContext('2d');
  const W = 256, H = 256;
  const imgData = ctx.createImageData(W, H);
  const d = imgData.data;

  // Cache the overlay values map for this type+tick
  if (!overlayCache[type]) {
    overlayCache[type] = computeOverlayMap(type);
  }
  const valMap = overlayCache[type];

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const src = getMiniMapSourceCoords(r, c);
      const idx = (r * W + c) * 4;
      // Terrain base
      const [br, bg, bb] = terrainPixelColor(mapData[src.row]?.[src.col] ?? GROUND, src.row, src.col);
      // Overlay
      const val = valMap[src.row]?.[src.col] ?? 0;
      const [or, og, ob, oa] = overlayPixelColor(type, val);
      // Alpha-blend
      const a = oa / 255;
      d[idx]     = Math.round(br * (1 - a) + or * a);
      d[idx + 1] = Math.round(bg * (1 - a) + og * a);
      d[idx + 2] = Math.round(bb * (1 - a) + ob * a);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  drawOverlayAnnotations(ctx, type);
}

function getMiniMapSourceCoords(displayRow, displayCol) {
  if (mapRotation === 1) return { row: MAP_HEIGHT - 1 - displayCol, col: displayRow };
  if (mapRotation === 2) return { row: MAP_HEIGHT - 1 - displayRow, col: MAP_WIDTH - 1 - displayCol };
  if (mapRotation === 3) return { row: displayCol, col: MAP_WIDTH - 1 - displayRow };
  return { row: displayRow, col: displayCol };
}

function getMiniMapDisplayCoords(row, col) {
  if (mapRotation === 1) return { row: col, col: MAP_HEIGHT - 1 - row };
  if (mapRotation === 2) return { row: MAP_HEIGHT - 1 - row, col: MAP_WIDTH - 1 - col };
  if (mapRotation === 3) return { row: MAP_WIDTH - 1 - col, col: row };
  return { row, col };
}

function drawOverlayAnnotations(ctx, type) {
  if (!ctx) return;
  ctx.save();

  if (type === 'crime' || type === 'fire') {
    Object.entries(buildingData).forEach(([id, rec]) => {
      const isFire = type === 'fire' && rec.type === 'fire_station';
      const isPolice = type === 'crime' && rec.type === 'police_station';
      if (!isFire && !isPolice) return;

      const radius = type === 'fire' ? FIRE_STATION_RADIUS : POLICE_STATION_RADIUS;
      const [r0, c0] = id.split(':').map(Number);
      const center = getMiniMapDisplayCoords(r0, c0);
      ctx.strokeStyle = type === 'fire' ? 'rgba(255,120,70,0.45)' : 'rgba(100,170,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(center.col + 0.5, center.row + 0.5, radius, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  if (type === 'power' || type === 'electricity') {
    Object.entries(buildingData).forEach(([id, rec]) => {
      const stats = POWER_PLANT_STATS[rec.type];
      if (!stats) return;
      const [r0, c0] = id.split(':').map(Number);
      const state = getPowerPlantState(rec);
      const topLeft = getMiniMapDisplayCoords(r0, c0);
      const fill = rec.type === 'power_plant_coal'
        ? (state === 'abandoned' ? 'rgba(170,170,170,0.92)' : state === 'degraded' ? 'rgba(245,183,95,0.92)' : 'rgba(255,200,70,0.92)')
        : (state === 'abandoned' ? 'rgba(170,170,170,0.92)' : state === 'degraded' ? 'rgba(210,230,160,0.92)' : 'rgba(255,235,120,0.92)');
      ctx.fillStyle = fill;
      ctx.strokeStyle = 'rgba(30,20,0,0.7)';
      ctx.lineWidth = 1;
      const footprintCols = rec.footprintCols ?? stats.footprintCols ?? 1;
      const footprintRows = rec.footprintRows ?? stats.footprintRows ?? 1;
      for (let dr = 0; dr < footprintRows; dr++) {
        for (let dc = 0; dc < footprintCols; dc++) {
          const tile = getMiniMapDisplayCoords(r0 + dr, c0 + dc);
          ctx.fillRect(tile.col, tile.row, 1, 1);
        }
      }
      ctx.strokeRect(topLeft.col + 0.5, topLeft.row + 0.5, footprintCols - 1, footprintRows - 1);
    });
  }

  ctx.restore();
}

function updateOverlayDetailPanel(type) {
  const title = document.getElementById('overlay-detail-title');
  const stats = document.getElementById('overlay-detail-stats');
  const note = document.getElementById('overlay-detail-note');
  const footer = document.getElementById('overlay-power-footer');
  const statusEl = document.getElementById('overlay-power-status');
  const mwEl = document.getElementById('overlay-power-mw');
  const barEl = document.getElementById('overlay-power-bar');
  const legend = document.getElementById('overlay-legend');

  if (!title || !stats || !note || !footer || !statusEl || !mwEl || !barEl || !legend) return;

  title.textContent = t(OVERLAY_TITLES[type] ?? type);
  stats.innerHTML = '';
  note.textContent = '';

  const chip = (label, value) => `<span class="overlay-detail-chip"><span class="overlay-detail-label">${label}</span><span class="overlay-detail-value">${value}</span></span>`;

  if (type === 'electricity') {
    const supply = city.totalPowerSupply ?? 0;
    const demand = city.totalPowerDemand ?? 0;
    const status = city.powerStatus ?? (supply >= demand ? 'ok' : 'overloaded');
    const load = demand > 0 ? Math.round(Math.min(100, (supply / demand) * 100)) : 100;
    stats.innerHTML = [
      chip(t('overlay.detail.powerSupply'), `${supply} MW`),
      chip(t('overlay.detail.powerDemand'), `${demand} MW`),
      chip(t('overlay.detail.powerLoad'), `${load}%`),
      chip(t('overlay.detail.status'), t(`hud.powerStatus.${status}`) || status),
    ].join('');
    note.textContent = supply >= demand
      ? t('overlay.detail.powerStable')
      : t('inspect.powerShortage', { supply, demand });
    footer.classList.add('is-visible');
    statusEl.textContent = t(`hud.powerStatus.${status}`) || status.toUpperCase();
    statusEl.className = status === 'surplus' || status === 'ok' ? 'power-status-ok' : status === 'strained' ? 'power-status-warn' : 'power-status-bad';
    mwEl.textContent = t('hud.powerMW', { supply, demand });
    barEl.style.width = `${Math.min(100, (supply / Math.max(1, demand)) * 100)}%`;
    barEl.style.background = status === 'surplus' || status === 'ok' ? '#44cc55' : status === 'strained' ? '#f1c65d' : '#cc4444';
    setOverlayLegendLabels(type);
    legend.classList.remove('is-hidden');
    return;
  }

  if (type === 'power') {
    const coal = Object.values(buildingData).filter((rec) => rec.type === 'power_plant_coal').length;
    const solar = Object.values(buildingData).filter((rec) => rec.type === 'power_plant_solar').length;
    const active = Object.values(buildingData).filter((rec) => POWER_PLANT_STATS[rec.type] && (rec.powerState ?? 'active') === 'active').length;
    const degraded = Object.values(buildingData).filter((rec) => POWER_PLANT_STATS[rec.type] && (rec.powerState ?? 'active') === 'degraded').length;
    const abandoned = Object.values(buildingData).filter((rec) => POWER_PLANT_STATS[rec.type] && (rec.powerState ?? 'active') === 'abandoned').length;
    stats.innerHTML = [
      chip(t('building.coalPlant'), coal),
      chip(t('building.solarPlant'), solar),
      chip(t('inspect.powerStateActive'), active),
      chip(t('inspect.powerStateDegraded'), degraded),
      chip(t('inspect.powerStateAbandoned'), abandoned),
    ].join('');
    note.textContent = 'Plant markers are color-coded by type and age.';
    footer.classList.add('is-visible');
    const supply = city.totalPowerSupply ?? 0;
    const demand = city.totalPowerDemand ?? 0;
    const status = city.powerStatus ?? (supply >= demand ? 'ok' : 'overloaded');
    statusEl.textContent = t(`hud.powerStatus.${status}`) || status.toUpperCase();
    statusEl.className = status === 'surplus' || status === 'ok' ? 'power-status-ok' : status === 'strained' ? 'power-status-warn' : 'power-status-bad';
    mwEl.textContent = t('hud.powerMW', { supply, demand });
    barEl.style.width = `${Math.min(100, (supply / Math.max(1, demand)) * 100)}%`;
    barEl.style.background = status === 'surplus' || status === 'ok' ? '#44cc55' : status === 'strained' ? '#f1c65d' : '#cc4444';
    setOverlayLegendLabels(type);
    legend.classList.remove('is-hidden');
    return;
  }

  footer.classList.remove('is-visible');
  legend.classList.remove('is-hidden');
  setOverlayLegendLabels(type);
  if (type === 'crime' || type === 'fire') {
    note.textContent = type === 'crime'
      ? t('overlay.detail.coveragePolice')
      : t('overlay.detail.coverageFire');
  } else if (type === 'pollution') {
    note.textContent = 'Darker areas mean higher pollution.';
  } else if (type === 'population') {
    note.textContent = 'Brighter tiles mean more population concentration.';
  } else if (type === 'landvalue') {
    note.textContent = 'Green tiles have the highest land value.';
  }
}

function setOverlayLegendLabels(type) {
  const minEl = document.getElementById('overlay-legend-min');
  const midEl = document.getElementById('overlay-legend-mid');
  const maxEl = document.getElementById('overlay-legend-max');
  if (!minEl || !midEl || !maxEl) return;

  const labels = {
    pollution: ['0%', '50%', '100%'],
    crime: ['0%', '50%', '100%'],
    fire: ['0%', '50%', '100%'],
    population: ['0%', '50%', '100%'],
    landvalue: ['0%', '50%', '100%'],
    electricity: ['Short', 'Balanced', 'Surplus'],
    power: ['Old', 'Degraded', 'Active'],
  }[type] ?? ['0%', '50%', '100%'];

  minEl.textContent = labels[0];
  midEl.textContent = labels[1];
  maxEl.textContent = labels[2];
}

function terrainPixelColor(terrain, r, c) {
  // Draw zone color on top of terrain where applicable
  const zone = zoneMap[r]?.[c] ?? ZONE_NONE;
  if (zone === ZONE_RES) return [80, 160, 60];
  if (zone === ZONE_COM) return [60, 100, 200];
  if (zone === ZONE_IND) return [160, 140, 40];
  if (isBridgeTile(r, c)) return [110, 110, 110];
  switch (terrain) {
    case ROAD:  return [110, 110, 110];
    case DIRT:  return [170, 130, 85];
    case BEACH: return [210, 195, 130];
    case WATER: return [40,  120, 200];
    case HILL:  return [90,  130, 55];
    default:    return [100, 155, 65];   // GROUND / grass
  }
}

function terrainEditorPixelColor(terrain, height = 0) {
  switch (terrain) {
    case WATER: return [44, 124, 190];
    case BEACH: return [222, 202, 135];
    case DIRT: return [158, 119, 77];
    case HILL: {
      const h = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Number(height) || 0));
      return [
        Math.max(50, 92 - h * 4),
        Math.min(205, 132 + h * 12),
        Math.max(52, 74 - h * 2),
      ];
    }
    default: return [96, 160, 88];
  }
}

function drawTerrainMiniMap() {
  const canvas = document.getElementById('terrain-minimap-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const imgData = ctx.createImageData(W, H);
  const d = imgData.data;
  let highTiles = 0;
  let waterTiles = 0;

  for (let displayRow = 0; displayRow < H; displayRow++) {
    for (let displayCol = 0; displayCol < W; displayCol++) {
      const src = getMiniMapSourceCoords(displayRow, displayCol);
      const tile = mapData[src.row]?.[src.col] ?? GROUND;
      const height = heightMap[src.row]?.[src.col] ?? 0;
      if (tile === WATER) waterTiles++;
      if (height > 0) highTiles++;

      const [r, g, b] = terrainEditorPixelColor(tile, height);
      const idx = (displayRow * W + displayCol) * 4;
      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const meta = document.getElementById('terrain-minimap-meta');
  if (meta) {
    const highPct = Math.round((highTiles / (MAP_WIDTH * MAP_HEIGHT)) * 100);
    const waterPct = Math.round((waterTiles / (MAP_WIDTH * MAP_HEIGHT)) * 100);
    meta.textContent = t('terrainEditor.mapMeta', { high: highPct, water: waterPct });
  }
}

function scheduleTerrainMiniMapUpdate() {
  if (!isTerrainCreatorMode) return;
  if (terrainMiniMapRaf !== null) return;
  terrainMiniMapRaf = requestAnimationFrame(() => {
    terrainMiniMapRaf = null;
    drawTerrainMiniMap();
  });
}

function setupTerrainMiniMapControls() {
  const panel = document.getElementById('terrain-minimap-panel');
  const canvas = document.getElementById('terrain-minimap-canvas');
  if (!panel || !canvas) return;

  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  canvas.addEventListener('click', (event) => {
    if (!activeScene) return;
    const rect = canvas.getBoundingClientRect();
    const displayCol = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(((event.clientX - rect.left) / rect.width) * MAP_WIDTH)));
    const displayRow = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(((event.clientY - rect.top) / rect.height) * MAP_HEIGHT)));
    const { row, col } = getMiniMapSourceCoords(displayRow, displayCol);
    centerCameraOnTile(activeScene, row, col);
  });
}

function centerCameraOnTile(scene, row, col) {
  const camera = scene?.cameras?.main;
  if (!camera || !isInsideMap(row, col)) return;
  const pos = isoToScreen(col, row);
  const worldX = pos.x + scene.offsetX;
  const worldY = pos.y + scene.offsetY + getTerrainTileVisualOffset(row, col, getTileKey(row, col));
  camera.scrollX = worldX - camera.width / (2 * camera.zoom);
  camera.scrollY = worldY - camera.height / (2 * camera.zoom);
}

function overlayPixelColor(type, val) {
  if (val <= 0.01) return [0, 0, 0, 0];
  const a = Math.round(Math.min(220, val * 230));
  switch (type) {
    case 'pollution':  return [80,  10,  0,   a];   // dark brownish-red
    case 'crime':      return [200, 0,   0,   a];   // red
    case 'fire':       return [220, 80,  0,   a];   // orange
    case 'population': return [20,  80,  220, a];   // blue
    case 'electricity': return [Math.round(240 * (1 - val)), Math.round(70 + 170 * val), Math.round(30 + 20 * val), a];
    case 'power':      return [Math.round(175 + 55 * val), Math.round(175 + 35 * val), Math.round(175 - 70 * val), a];
    case 'landvalue': {
      // green gradient: low=red, high=green
      return [Math.round((1 - val) * 200), Math.round(val * 200), 0, 200];
    }
    default: return [0, 0, 0, 0];
  }
}

function getTileOverlayValue(type, r, c) {
  if (!overlayCache[type]) overlayCache[type] = computeOverlayMap(type);
  return overlayCache[type]?.[r]?.[c] ?? 0;
}

function computeOverlayMap(type) {
  if (type === 'pollution')  return computePollutionMap();
  if (type === 'crime')      return computeCrimeMap();
  if (type === 'fire')       return computeFireMap();
  if (type === 'population') return computePopulationMap();
  if (type === 'landvalue')  return computeLandValueMap();
  if (type === 'electricity') return computeElectricityMap();
  if (type === 'power')      return computePowerPlantMap();
  return createFilledMap(0);
}

function computePollutionMap() {
  const map = createFilledMap(0);
  const pollutionMul = isPolicyActive('cleanAir') ? 0.70 : 1;
  Object.entries(buildingData).forEach(([id, rec]) => {
    const stats = POWER_PLANT_STATS[rec.type];
    const isInd  = rec.type === 'industrial';
    if (!stats && !isInd) return;
    const [r0, c0] = id.split(':').map(Number);
    const radius   = stats?.pollutionRadius ?? 12;
    const strength = (stats ? stats.pollutionStrength : 0.5) * pollutionMul;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (!isInsideMap(r, c)) continue;
        const dist = Math.sqrt(dr * dr + dc * dc);
        if (dist > radius) continue;
        map[r][c] = Math.min(1, map[r][c] + strength * (1 - dist / radius));
      }
    }
  });
  return map;
}

function computeCrimeMap() {
  const map = createFilledMap(0);
  const protectedRisk = isPolicyActive('publicSafety') ? 0.03 : 0.05;
  const unprotectedRisk = Math.max(0.35, 0.82 - (getDepartmentFunding('police') - 1) * 0.25);
  for (let r = 0; r < MAP_HEIGHT; r++)
    for (let c = 0; c < MAP_WIDTH; c++)
      if (zoneMap[r][c] !== ZONE_NONE)
        map[r][c] = serviceMap[r]?.[c]?.police ? protectedRisk : unprotectedRisk;
  return map;
}

function computeFireMap() {
  const map = createFilledMap(0);
  const protectedRisk = isPolicyActive('publicSafety') ? 0.03 : 0.05;
  const unprotectedRisk = Math.max(0.35, 0.80 - (getDepartmentFunding('fire') - 1) * 0.25);
  Object.entries(buildingData).forEach(([id, rec]) => {
    const stats = POWER_PLANT_STATS[rec.type];
    if (!stats) return;
    const [r0, c0] = id.split(':').map(Number);
    const radius = stats.fireRadius;
    const strength = stats.fireStrength * (isPolicyActive('publicSafety') ? 0.85 : 1);
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (!isInsideMap(r, c)) continue;
        const dist = Math.sqrt(dr * dr + dc * dc);
        if (dist > radius) continue;
        map[r][c] = Math.min(1, map[r][c] + strength * (1 - dist / radius));
      }
    }
  });
  for (let r = 0; r < MAP_HEIGHT; r++)
    for (let c = 0; c < MAP_WIDTH; c++)
      if (zoneMap[r][c] !== ZONE_NONE)
        map[r][c] = Math.max(map[r][c], serviceMap[r]?.[c]?.fire ? protectedRisk : unprotectedRisk);
  return map;
}

function computePopulationMap() {
  const map = createFilledMap(0);
  let maxPop = 1;
  Object.values(buildingData).forEach((rec) => {
    if (rec.population > maxPop) maxPop = rec.population;
  });
  Object.entries(buildingData).forEach(([id, rec]) => {
    if (!rec.population) return;
    const [r, c] = id.split(':').map(Number);
    map[r][c] = Math.min(1, rec.population / maxPop);
  });
  return map;
}

function computeLandValueMap() {
  const pollution = computePollutionMap();
  const nuisance = createFilledMap(0);
  Object.entries(buildingData).forEach(([id, rec]) => {
    const stats = POWER_PLANT_STATS[rec.type];
    if (!stats) return;
    const [r0, c0] = id.split(':').map(Number);
    const radius = stats.nuisanceRadius;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (!isInsideMap(r, c)) continue;
        const dist = Math.abs(dr) + Math.abs(dc);
        if (dist > radius) continue;
        nuisance[r][c] = Math.min(1, nuisance[r][c] + stats.nuisanceStrength * (1 - dist / Math.max(1, radius)));
      }
    }
  });
  const map = createFilledMap(0);
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (zoneMap[r][c] === ZONE_NONE) continue;
      let val = 0.35;
      if (serviceMap[r]?.[c]?.police) val += 0.22;
      if (serviceMap[r]?.[c]?.fire)   val += 0.22;
      if (zoneMap[r][c] === ZONE_RES) val += (serviceMap[r]?.[c]?.park ?? 0) * 0.12;
      if (powerMap[r]?.[c])           val += 0.10;
      val -= (pollution[r]?.[c] ?? 0) * 0.35;
      val -= (nuisance[r]?.[c] ?? 0) * 0.22;
      map[r][c] = Math.max(0, Math.min(1, val));
    }
  }
  return map;
}

function computeElectricityMap() {
  const map = createFilledMap(0);
  const powerRatio = city.powerRatio ?? 1;
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (zoneMap[r][c] === ZONE_NONE && !buildingData[getTileId(r, c)]) continue;
      map[r][c] = powerMap[r][c] ? Math.max(0.2, powerRatio) : Math.max(0, powerRatio * 0.15);
    }
  }
  return map;
}

function computePowerPlantMap() {
  const map = createFilledMap(0);
  Object.entries(buildingData).forEach(([id, rec]) => {
    if (!POWER_PLANT_STATS[rec.type]) return;
    const [r0, c0] = id.split(':').map(Number);
    const footprintCols = rec.footprintCols ?? POWER_PLANT_MODELS[rec.type]?.footprintCols ?? 1;
    const footprintRows = rec.footprintRows ?? POWER_PLANT_MODELS[rec.type]?.footprintRows ?? 1;
    const state = getPowerPlantState(rec);
    const value = state === 'abandoned' ? 0.25 : state === 'degraded' ? 0.65 : 1;
    for (let dr = 0; dr < footprintRows; dr++) {
      for (let dc = 0; dc < footprintCols; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (!isInsideMap(r, c)) continue;
        map[r][c] = Math.max(map[r][c], value);
      }
    }
  });
  return map;
}

function openHouseSizeMenu(triggerButton = document.querySelector('[data-tool="house"]')) {
  const sizeMenu = document.getElementById('house-size-menu');
  if (!sizeMenu) return;

  sizeMenu.innerHTML = '';
  Object.entries(HOUSE_MODEL_SETS).forEach(([setKey, config]) => {
    const model = getSelectedHouseModel(setKey);
    if (!model) return;

    const button = document.createElement('button');
    button.className = 'house-size-button';
    button.type = 'button';
    button.dataset.houseSet = setKey;
    button.classList.toggle('is-active', setKey === selectedHouseSet);
    button.title = `${config.label} houses`;
    button.setAttribute('aria-label', `${config.label} houses`);

    const image = document.createElement('img');
    image.src = model.path;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.textContent = config.label;

    button.append(image, label);
    sizeMenu.append(button);
  });

  const buttonBounds = triggerButton?.getBoundingClientRect();
  if (buttonBounds) {
    sizeMenu.style.top = `${buttonBounds.top}px`;
  }

  sizeMenu.classList.add('is-open');
}

function closeHouseSizeMenu() {
  document.getElementById('house-size-menu')?.classList.remove('is-open');
}

function toggleHouseSizeMenu(triggerButton) {
  const sizeMenu = document.getElementById('house-size-menu');
  if (sizeMenu?.classList.contains('is-open')) closeHouseSizeMenu();
  else openHouseSizeMenu(triggerButton);
}

function closeToolPopups() {
  closeHouseSizeMenu();
  closeTerrainPicker();
  closeZoneDensityMenu();
  closeParkPicker();
  closeToolCategoryFlyouts();
}

function cycleHouseModel() {
  const models = houseModelSets[selectedHouseSet] ?? [];
  if (models.length < 2) return;
  selectedHouseIndices[selectedHouseSet] = (getSelectedHouseIndex(selectedHouseSet) + 1) % models.length;
}

function getSelectedHouseIndex(tool) {
  return selectedHouseIndices[tool] ?? 0;
}

function getSelectedHouseModel(tool) {
  const models = houseModelSets[tool] ?? [];
  return models[getSelectedHouseIndex(tool)];
}

function updateHouseToolUi() {
  const button = document.querySelector('[data-tool="house"]');
  const image = button?.querySelector('img');
  const label = button?.querySelector('.tool-badge');
  const model = getSelectedHouseModel(selectedHouseSet);
  if (!button || !image || !model) return;

  image.src = model.path;
  if (label) {
    label.textContent = HOUSE_MODEL_SETS[selectedHouseSet]?.label ?? '';
  }
  button.title = `Add ${HOUSE_MODEL_SETS[selectedHouseSet]?.label ?? ''} ${model.title}`;
  button.setAttribute('aria-label', button.title);
}

// ── Rotate cluster (bottom-right) ────────────────────────────────────────────

function setupRotateCluster() {
  const cluster = document.getElementById('rotate-cluster');
  if (!cluster) return;

  cluster.addEventListener('pointerdown', (e) => e.stopPropagation());
  cluster.addEventListener('click', (e) => {
    const btn = e.target.closest('.rotate-btn');
    if (!btn || !activeScene) return;
    if (btn.id === 'btn-rotate-cw')  rotateMap(activeScene, 1);
    if (btn.id === 'btn-rotate-ccw') rotateMap(activeScene, -1);
  });
}

// ── Jukebox floating window ───────────────────────────────────────────────────

function setupJukebox() {
  const win    = document.getElementById('jukebox-window');
  const volume = document.getElementById('jukebox-volume');
  if (!win || !volume) return;

  // Stop game input from firing through the window
  win.addEventListener('pointerdown', (e) => e.stopPropagation());

  // Drag via title bar
  const titlebar = document.getElementById('jukebox-titlebar');
  if (titlebar) {
    let dragging = false, ox = 0, oy = 0;
    titlebar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#jukebox-close-btn')) return;
      dragging = true;
      const r = win.getBoundingClientRect();
      // Switch from bottom/right anchoring to explicit top/left
      win.style.bottom = 'auto';
      win.style.right  = 'auto';
      win.style.left   = r.left + 'px';
      win.style.top    = r.top  + 'px';
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      titlebar.setPointerCapture(e.pointerId);
    });
    titlebar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      win.style.left = (e.clientX - ox) + 'px';
      win.style.top  = (e.clientY - oy) + 'px';
    });
    titlebar.addEventListener('pointerup', () => { dragging = false; });
  }

  // Close button
  document.getElementById('jukebox-close-btn')?.addEventListener('click', closeJukebox);

  // Playback controls
  win.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-music-action]');
    if (!btn) return;
    if (btn.dataset.musicAction === 'toggle')   toggleMusic();
    if (btn.dataset.musicAction === 'previous') changeTrack(-1);
    if (btn.dataset.musicAction === 'next')     changeTrack(1);
  });

  // Loop mode buttons
  win.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-loop]');
    if (!btn) return;
    setMusicLoopMode(btn.dataset.loop);
  });

  // Volume
  volume.addEventListener('input', () => {
    if (activeMusic) activeMusic.setVolume(Number(volume.value));
  });

  updateJukeboxUi();
}

function openJukebox() {
  document.getElementById('jukebox-window')?.classList.add('is-open');
  updateJukeboxUi();
}

function closeJukebox() {
  document.getElementById('jukebox-window')?.classList.remove('is-open');
}

function toggleJukebox() {
  const win = document.getElementById('jukebox-window');
  if (!win) return;
  win.classList.toggle('is-open');
  updateJukeboxUi();
}

function setMusicLoopMode(mode) {
  musicLoopMode = mode;
  // Re-apply to the currently-playing track so it takes effect immediately
  if (activeMusic && isMusicPlaying) {
    playTrack(activeTrackIndex);
  }
  updateJukeboxUi();
}

function toggleMusic() {
  if (!activeScene) return;

  if (!activeMusic) {
    playTrack(activeTrackIndex);
    return;
  }

  if (isMusicPlaying) {
    activeMusic.pause();
    isMusicPlaying = false;
  } else {
    activeMusic.resume();
    isMusicPlaying = true;
  }

  updateJukeboxUi();
}

function changeTrack(direction) {
  activeTrackIndex = (activeTrackIndex + direction + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
  if (isMusicPlaying || activeMusic) playTrack(activeTrackIndex);
  updateJukeboxUi();
}

function playTrack(trackIndex) {
  if (!activeScene) return;

  if (activeMusic) {
    activeMusic.off('complete');   // remove old auto-advance listener
    activeMusic.stop();
    activeMusic.destroy();
  }

  const volume = Number(document.getElementById('jukebox-volume')?.value ?? 0.55);

  // 'Loop One': Phaser loops the track natively.
  // 'Loop All': play once, then advance on 'complete'.
  const loopNatively = (musicLoopMode === 'one');
  activeMusic = activeScene.sound.add(MUSIC_TRACKS[trackIndex].key, {
    loop: loopNatively,
    volume,
  });

  if (!loopNatively) {
    // Auto-advance to the next track when the current one finishes
    activeMusic.once('complete', () => {
      activeTrackIndex = (activeTrackIndex + 1) % MUSIC_TRACKS.length;
      playTrack(activeTrackIndex);
    });
  }

  activeMusic.play();
  isMusicPlaying = true;
  updateJukeboxUi();
}

function updateJukeboxUi() {
  // Track name
  const nameEl = document.getElementById('jukebox-track-name');
  if (nameEl) nameEl.textContent = MUSIC_TRACKS[activeTrackIndex]?.title ?? '—';

  // Play / pause icon
  const icon = document.getElementById('jukebox-play-icon');
  if (icon) {
    icon.innerHTML = isMusicPlaying
      ? '<path d="M10 7v18" /><path d="M22 7v18" />'
      : '<path d="M10 7v18l15-9z" />';
  }

  // Loop mode buttons
  document.querySelectorAll('[data-loop]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.loop === musicLoopMode);
  });
}

function updateMapMetrics(scene) {
  const mapWidthPx = (MAP_WIDTH + MAP_HEIGHT) * (TILE_WIDTH / 2);
  const mapHeightPx = (MAP_WIDTH + MAP_HEIGHT) * (TILE_HEIGHT / 2);

  scene.mapWidthPx = mapWidthPx;
  scene.mapHeightPx = mapHeightPx;
  scene.offsetX = (scene.cameras.main.width - mapWidthPx) / 2;
  scene.offsetY = (scene.cameras.main.height - mapHeightPx) / 2;
}

function drawWorldMask(scene) {
  // The map forms an isometric diamond.  After any rotation the same 4 logical
  // corners are still the visual extremes; we just need to find which is which.
  const corners = [
    isoToScreen(0,             0),
    isoToScreen(MAP_WIDTH - 1, 0),
    isoToScreen(MAP_WIDTH - 1, MAP_HEIGHT - 1),
    isoToScreen(0,             MAP_HEIGHT - 1),
  ];
  const topPt    = corners.reduce((a, b) => a.y < b.y ? a : b);
  const bottomPt = corners.reduce((a, b) => a.y > b.y ? a : b);
  const rightPt  = corners.reduce((a, b) => a.x > b.x ? a : b);
  const leftPt   = corners.reduce((a, b) => a.x < b.x ? a : b);

  const ox = scene.offsetX;
  const oy = scene.offsetY;
  const graphics = scene.maskGraphics;

  graphics.clear();
  graphics.fillStyle(0xffffff, 1);
  graphics.beginPath();
  const APEX_CLIP = 12;
  const RIGHT_EDGE_BLEED = 6;
  graphics.moveTo(topPt.x    + ox,                  topPt.y    + oy - TILE_IMAGE_HEIGHT + APEX_CLIP);
  graphics.lineTo(rightPt.x  + ox + TILE_WIDTH / 2 + RIGHT_EDGE_BLEED, rightPt.y  + oy - TILE_IMAGE_HEIGHT + TILE_HEIGHT / 2);
  graphics.lineTo(bottomPt.x + ox,                  bottomPt.y + oy);
  graphics.lineTo(leftPt.x   + ox - TILE_WIDTH / 2, leftPt.y   + oy - TILE_IMAGE_HEIGHT + TILE_HEIGHT / 2);
  graphics.closePath();
  graphics.fillPath();
}

function positionAllTiles(scene) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const pos = isoToScreen(col, row);
      const key = getTileKey(row, col);
      scene.tileSprites[row][col].setPosition(pos.x + scene.offsetX, pos.y + scene.offsetY + getTerrainTileVisualOffset(row, col, key));
      // Depth must be refreshed after rotation because pos.y changes completely
      scene.tileSprites[row][col].setDepth(getTerrainTileDepth(row, col, key, pos.y));
    }
  }

  scene.buildingSprites.forEach((building) => {
    positionBuilding(scene, building);
  });

  repositionBridgeSprites(scene);
  repositionOverlays(scene);
}

function prepareHouseModelMetadata(scene) {
  Object.values(houseModelSets).flat().forEach((model) => {
    const source = scene.textures.get(model.key)?.getSourceImage();
    if (!source) return;

    model.metadata = getSpriteFootprintMetadata(source, model.footprintCols, model.footprintRows);
  });
}

function prepareParkModelMetadata(scene) {
  parkModelMetadata = {
    park_small_open: getParkModelMetadata(scene, 'park_small_open', 1, 1),
    park_small_playground: getParkModelMetadata(scene, 'park_small_playground', 1, 1),
    park_small: getParkModelMetadata(scene, 'park_small', 1, 1),
    park_large: getParkModelMetadata(scene, 'park_large', 3, 3),
  };
}

function preparePowerPlantModelMetadata(scene) {
  powerPlantModelMetadata = Object.fromEntries(
    Object.entries(POWER_PLANT_MODELS).map(([type, model]) => (
      [type, getPowerPlantModelMetadata(scene, type)]
    )),
  );
}

function prepareBridgeLayerTextures(scene) {
  [
    ['road_bridge_h', 'road_bridge_h_top', 'road_bridge_h_side'],
    ['road_bridge_v', 'road_bridge_v_top', 'road_bridge_v_side'],
  ].forEach(([sourceKey, topKey, sideKey]) => {
    const source = scene.textures.get(sourceKey)?.getSourceImage();
    if (!source || scene.textures.exists(topKey)) return;
    const width = source.width;
    const height = source.height;
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext('2d');
    sourceCtx.drawImage(source, 0, 0);
    const sourceData = sourceCtx.getImageData(0, 0, width, height);
    const topCanvas = document.createElement('canvas');
    const sideCanvas = document.createElement('canvas');
    topCanvas.width = sideCanvas.width = width;
    topCanvas.height = sideCanvas.height = height;
    const topCtx = topCanvas.getContext('2d');
    const sideCtx = sideCanvas.getContext('2d');
    const topData = topCtx.createImageData(width, height);
    const sideData = sideCtx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const r = sourceData.data[index];
        const g = sourceData.data[index + 1];
        const b = sourceData.data[index + 2];
        const a = sourceData.data[index + 3];
        if (a === 0) continue;
        const roadSurface = Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r >= 70 && r <= 135;
        const bridgeUnderside = r >= 120 && r <= 210 && g >= 80 && g <= 170 && b <= 135;

        if (y <= BRIDGE_TOP_LAYER_CUTOFF_Y) {
          topData.data[index] = r;
          topData.data[index + 1] = g;
          topData.data[index + 2] = b;
          topData.data[index + 3] = a;
        }
        if (y >= BRIDGE_SIDE_LAYER_START_Y && !roadSurface && bridgeUnderside) {
          sideData.data[index] = r;
          sideData.data[index + 1] = g;
          sideData.data[index + 2] = b;
          sideData.data[index + 3] = a;
        }
      }
    }

    topCtx.putImageData(topData, 0, 0);
    sideCtx.putImageData(sideData, 0, 0);
    scene.textures.addCanvas(topKey, topCanvas);
    scene.textures.addCanvas(sideKey, sideCanvas);
  });
}

function getPowerPlantModelMetadata(scene, buildingType) {
  const model = POWER_PLANT_MODELS[buildingType];
  const base = {
    footprintCols: model?.footprintCols ?? 1,
    footprintRows: model?.footprintRows ?? 1,
  };
  if (!model) return base;

  const source = scene.textures.get(model.spriteKey)?.getSourceImage();
  if (!source) return base;

  return getSpriteFootprintMetadata(source, model.footprintCols, model.footprintRows);
}

function getParkModelMetadata(scene, key, footprintCols, footprintRows) {
  const source = scene.textures.get(key)?.getSourceImage();
  if (!source) {
    return { footprintCols, footprintRows };
  }

  return getSpriteFootprintMetadata(source, footprintCols, footprintRows);
}

function getSpriteFootprintMetadata(image, footprintCols = 1, footprintRows = 1) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = image.width;
  canvas.height = image.height;
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let maxX = -1;
  let bottomY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha === 0) continue;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      bottomY = Math.max(bottomY, y);
    }
  }

  if (bottomY < 0 || maxX < minX) {
    return {
      originX: 0.5,
      originY: 1,
      scale: 1,
    };
  }

  let bottomXTotal = 0;
  let bottomXCount = 0;
  for (let y = Math.max(0, bottomY - 3); y <= bottomY; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha === 0) continue;

      bottomXTotal += x;
      bottomXCount += 1;
    }
  }

  const bottomX = bottomXCount > 0 ? bottomXTotal / bottomXCount : (minX + maxX) / 2;

  return {
    originX: bottomX / canvas.width,
    originY: bottomY / canvas.height,
    scale: getFootprintScreenWidth(footprintCols, footprintRows) / (maxX - minX + 1),
    footprintCols,
    footprintRows,
  };
}

function placeBuilding(scene, row, col) {
  if (!canPlaceBuilding(row, col)) return;

  removeBuilding(scene, row, col);

  const key = BUILDING_KEYS[nextBuildingIndex % BUILDING_KEYS.length];
  nextBuildingIndex += 1;
  placeSpriteBuilding(scene, row, col, key);

  // Register in buildingData so the sim tracks it (treat as residential for pop)
  const zone = zoneMap[row]?.[col];
  const id   = getTileId(row, col);
  buildingData[id] = {
    type: zone === ZONE_COM ? 'commercial' : zone === ZONE_IND ? 'industrial' : 'residential',
    level: 1,
    population: zone === ZONE_COM || zone === ZONE_IND ? 0 : POP_PER_LEVEL[1],
    age: 0,
    spriteKey:    key,
    footprintCols: 1,
    footprintRows: 1,
  };
}

function placeHouse(scene, row, col) {
  placeHouseModel(scene, row, col, selectedHouseSet);
}

function placeHouseModel(scene, row, col, tool) {
  const model = getSelectedHouseModel(tool);
  if (!model || !canPlaceBuildingFootprint(row, col, model.footprintCols, model.footprintRows)) return;

  removeBuildingsInFootprint(scene, row, col, model.footprintCols, model.footprintRows);

  const opts = model.metadata ?? { footprintCols: model.footprintCols, footprintRows: model.footprintRows };
  placeSpriteBuilding(scene, row, col, model.key, opts);

  // Register anchor tile in buildingData so save/load and sim can track it
  const id = getTileId(row, col);
  buildingData[id] = {
    type: 'residential',
    level: 1,
    population: POP_PER_LEVEL[1],
    age: 0,
    spriteKey:    model.key,
    footprintCols: model.footprintCols,
    footprintRows: model.footprintRows,
    originX: opts.originX,
    originY: opts.originY,
    scale:   opts.scale,
  };
}

function placeSpriteBuilding(scene, row, col, key, options = {}) {
  options = normalizeSpriteBuildingOptions(key, options);
  const footprintCols = options.footprintCols ?? 1;
  const footprintRows = options.footprintRows ?? 1;
  const anchor = getBuildingAnchor(row, col, footprintCols, footprintRows);
  const elevOffset = getBuildingElevationOffset(row, col, footprintCols, footprintRows);
  const building = scene.add.image(
    anchor.x + scene.offsetX,
    anchor.y + scene.offsetY - BUILDING_SURFACE_Y_OFFSET + elevOffset,
    key,
  );
  building.setOrigin(options.originX ?? 0.5, options.originY ?? 1);
  if (options.scale) {
    building.setScale(options.scale);
  }
  building.setDepth(anchor.y + TILE_HEIGHT + elevOffset);
  building.setMask(scene.worldMask);
  building.mapRow = row;
  building.mapCol = col;
  building.footprintCols = footprintCols;
  building.footprintRows = footprintRows;

  getFootprintTiles(row, col, footprintCols, footprintRows).forEach(([tileRow, tileCol]) => {
    scene.buildingSprites.set(getTileId(tileRow, tileCol), building);
  });
}

function normalizeSpriteBuildingOptions(key, options = {}) {
  if (isPowerPlantSpriteKey(key)) {
    const buildingType = getPowerPlantTypeBySpriteKey(key);
    const model = POWER_PLANT_MODELS[buildingType];
    const metadata = powerPlantModelMetadata[buildingType];
    return {
      ...options,
      footprintCols: model?.footprintCols ?? metadata?.footprintCols ?? 2,
      footprintRows: model?.footprintRows ?? metadata?.footprintRows ?? 2,
      ...metadata,
    };
  }

  if (!isParkSpriteKey(key)) return options;

  const metadata = parkModelMetadata[key];
  if (metadata) return { ...options, ...metadata };

  const parkOption = getParkOptionBySpriteKey(key);
  return {
    ...options,
    footprintCols: parkOption?.footprintCols ?? (key === 'park_large' ? 3 : 1),
    footprintRows: parkOption?.footprintRows ?? (key === 'park_large' ? 3 : 1),
  };
}

function isParkSpriteKey(key) {
  return key === 'park_small'
    || key === 'park_large'
    || PARK_OPTIONS.some((opt) => opt.spriteKey === key);
}

function isPowerPlantType(type) {
  return !!POWER_PLANT_MODELS[type];
}

function isPowerPlantSpriteKey(key) {
  return Object.values(POWER_PLANT_MODELS).some((model) => model.spriteKey === key);
}

function getPowerPlantTypeBySpriteKey(key) {
  return Object.entries(POWER_PLANT_MODELS).find(([, model]) => model.spriteKey === key)?.[0];
}

function removeBuilding(scene, row, col) {
  const tileId = getTileId(row, col);
  const building = scene.buildingSprites.get(tileId);
  if (!building) return false;

  // Clean up simulation data keyed to anchor tile
  const anchorId = getTileId(building.mapRow, building.mapCol);
  const record   = buildingData[anchorId];
  if (record) {
    if (record.type === 'power_plant_coal' || record.type === 'power_plant_solar') {
      powerSources.delete(anchorId);
    }
    delete buildingData[anchorId];
  }

  building.destroy();
  getFootprintTiles(
    building.mapRow,
    building.mapCol,
    building.footprintCols ?? 1,
    building.footprintRows ?? 1,
  ).forEach(([tileRow, tileCol]) => {
    scene.buildingSprites.delete(getTileId(tileRow, tileCol));
  });
  return true;
}

function positionBuilding(scene, building) {
  const footprintCols = building.footprintCols ?? 1;
  const footprintRows = building.footprintRows ?? 1;
  const anchor = getBuildingAnchor(building.mapRow, building.mapCol, footprintCols, footprintRows);
  const elevOffset = getBuildingElevationOffset(building.mapRow, building.mapCol, footprintCols, footprintRows);
  building.setPosition(anchor.x + scene.offsetX, anchor.y + scene.offsetY - BUILDING_SURFACE_Y_OFFSET + elevOffset);
  building.setDepth(anchor.y + TILE_HEIGHT + elevOffset);
}

function canPlaceBuilding(row, col) {
  return [GROUND, DIRT, HILL].includes(mapData[row][col]);
}

function canPlaceRoad(scene, row, col) {
  if (!isInsideMap(row, col)) return false;
  if (scene?.buildingSprites?.has(getTileId(row, col))) return false;
  if (buildingData[getTileId(row, col)]) return false;
  return true;
}

function canPlaceBuildingFootprint(row, col, footprintCols = 1, footprintRows = 1) {
  return getFootprintTiles(row, col, footprintCols, footprintRows).every(([tileRow, tileCol]) => (
    isInsideMap(tileRow, tileCol)
    && canPlaceBuilding(tileRow, tileCol)
  ));
}

function removeBuildingsInFootprint(scene, row, col, footprintCols = 1, footprintRows = 1) {
  const buildings = new Set();
  getFootprintTiles(row, col, footprintCols, footprintRows).forEach(([tileRow, tileCol]) => {
    const building = scene.buildingSprites.get(getTileId(tileRow, tileCol));
    if (building) buildings.add(building);
  });

  buildings.forEach((building) => {
    removeBuilding(scene, building.mapRow, building.mapCol);
  });
}

function getFootprintTiles(row, col, footprintCols = 1, footprintRows = 1) {
  const tiles = [];
  for (let rowOffset = 0; rowOffset < footprintRows; rowOffset++) {
    for (let colOffset = 0; colOffset < footprintCols; colOffset++) {
      tiles.push([row + rowOffset, col + colOffset]);
    }
  }
  return tiles;
}

function getBuildingAnchor(row, col, footprintCols = 1, footprintRows = 1) {
  // The building sprite's origin is (0.5, 1): its base sits at the visually
  // lowest tile of the footprint (maximum screen-Y vertex of the isometric
  // diamond).  Which logical corner that is depends on the current view rotation:
  //
  //  Rotation 0 → bottom-right logical corner (row+rows-1, col+cols-1)
  //  Rotation 1 → top-right  logical corner   (row,        col+cols-1)
  //  Rotation 2 → top-left   logical corner   (row,        col       )
  //  Rotation 3 → bottom-left logical corner  (row+rows-1, col       )
  //
  // Proof: screen-Y = (vizCol + vizRow) × HH.  Maximising vizCol+vizRow for
  // each rotation formula gives the table above.
  let anchorRow, anchorCol;
  switch (mapRotation) {
    case 1:  anchorRow = row;                     anchorCol = col + footprintCols - 1; break;
    case 2:  anchorRow = row;                     anchorCol = col;                     break;
    case 3:  anchorRow = row + footprintRows - 1; anchorCol = col;                     break;
    default: anchorRow = row + footprintRows - 1; anchorCol = col + footprintCols - 1; break;
  }
  return isoToScreen(anchorCol, anchorRow);
}

function getFootprintScreenWidth(footprintCols = 1, footprintRows = 1) {
  return (footprintCols + footprintRows) * (TILE_WIDTH / 2);
}

function getTileId(row, col) {
  return `${row}:${col}`;
}

// ── Tool helpers ──────────────────────────────────────────────────────────────

function isZoneTool() {
  return selectedTool === 'zone-res' || selectedTool === 'zone-com' || selectedTool === 'zone-ind';
}

// Apply the active tool to a specific logical tile (no pointer math, no dedup).
function applyToolAt(scene, row, col, pointer = null) {
  if (!isInsideMap(row, col)) return;

  // Inspect tool — show persistent info panel, don't modify terrain
  if (selectedTool === 'inspect') { showInspectPanel(scene, row, col, pointer); return; }

  if (isTerrainCreatorMode && selectedTool !== 'terrain') {
    showToast(t('toast.terrainCreatorOnlyTerrainTools'), 'warning');
    return;
  }

  // New tools (zones, power, services, dezone) handled in tools.js
  if (handleNewTool(scene, { row, col })) return;

  if (selectedTool === 'building') { placeBuilding(scene, row, col); return; }
  if (selectedTool === 'house')    { placeHouse(scene, row, col);    return; }

  if (selectedTool === 'bulldoze') {
    spendBudget(COST_BULLDOZE);
    removeBuilding(scene, row, col);
    removeZoneOverlay(scene, row, col);
    if (!heightMap[row]) heightMap[row] = [];
    const bulldozeHeight = getTileHeight(row, col);
    if (isBridgeTile(row, col)) {
      const underlay = roadUnderlayMap[row]?.[col] ?? WATER;
      if (underlay !== ROAD) roadTileCount = Math.max(0, roadTileCount - 1);
      mapData[row][col] = underlay;
      bridgeMap[row][col] = null;
      roadUnderlayMap[row][col] = null;
      heightMap[row][col] = 0;
      refreshBridgeSprite(scene, row, col);
    } else {
      if (mapData[row][col] === ROAD) roadTileCount = Math.max(0, roadTileCount - 1);
      mapData[row][col] = bulldozeHeight > 0 ? HILL : GROUND;
    }
    reconcileSurfaceTerrainFromHeight(row, col, 2);
    refreshTileArea(scene, row, col);
    return;
  }

  if (selectedTool === 'road' && mapData[row][col] !== ROAD) {
    if (!canPlaceRoad(scene, row, col)) return;
    if (!spendBudget(COST_ROAD)) { showToast(t('toast.notEnoughFunds'), 'warning'); return; }
  }

  const terrainKey = selectedTool === 'terrain' ? selectedTerrainType : selectedTool;

  if (terrainKey === 'raise') {
    applyRaiseTerrain(scene, row, col, TERRAIN_RAISE_BLOCK_RADIUS);
    return;
  }

  if (terrainKey === 'lower') {
    applyLowerTerrain(scene, row, col, TERRAIN_RAISE_BLOCK_RADIUS);
    return;
  }

  if (terrainKey === 'flatten') {
    applyFlattenTerrain(scene, row, col, TERRAIN_RAISE_BLOCK_RADIUS);
    return;
  }

  setTileType(scene, row, col, TOOL_TERRAIN[terrainKey] ?? GROUND);
}

function getRaiseTerrainBlockers(scene, centerRow, centerCol, radius = 1) {
  const tiles = [];
  for (let row = centerRow - radius; row <= centerRow + radius; row++) {
    for (let col = centerCol - radius; col <= centerCol + radius; col++) {
      if (!isInsideMap(row, col)) continue;
      tiles.push({ row, col });
    }
  }

  return getTerrainEditBlockersForTiles(scene, tiles);
}

function getTerrainEditBlockersForTiles(scene, tiles) {
  const blockers = [];
  const visited = new Set();

  tiles.forEach(({ row, col }) => {
    if (!isInsideMap(row, col)) return;
    const key = `${row},${col}`;
    if (visited.has(key)) return;
    visited.add(key);

    if (mapData[row][col] === ROAD || isBridgeTile(row, col)) {
      blockers.push({ row, col, reason: 'road' });
      return;
    }

    const id = getTileId(row, col);
    if (scene.buildingSprites.has(id) || !!buildingData[id]) {
      blockers.push({ row, col, reason: 'building' });
    }
  });

  return blockers;
}

function buildRadiatingRaisePlan(centerRow, centerCol, targetCenterHeight, baseRadius = TERRAIN_RADIATE_BASE_RADIUS) {
  const plannedHeights = new Map();
  const makeKey = (row, col) => `${row},${col}`;

  function getHeightWithPlan(row, col) {
    const key = makeKey(row, col);
    if (plannedHeights.has(key)) return plannedHeights.get(key);
    return getTileHeight(row, col);
  }

  function stageRaise(row, col, targetHeight) {
    if (!isInsideMap(row, col)) return false;
    const nextHeight = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, targetHeight));
    const key = makeKey(row, col);
    const baseline = plannedHeights.has(key)
      ? plannedHeights.get(key)
      : getTileHeight(row, col);

    if (nextHeight <= baseline) return false;
    plannedHeights.set(key, nextHeight);
    return true;
  }

  // Seed with a Chebyshev-distance pyramid (9x9 when radius=4):
  // center gets targetCenterHeight, each outward ring is one level lower.
  for (let row = centerRow - baseRadius; row <= centerRow + baseRadius; row++) {
    for (let col = centerCol - baseRadius; col <= centerCol + baseRadius; col++) {
      if (!isInsideMap(row, col)) continue;
      const distance = Math.max(Math.abs(row - centerRow), Math.abs(col - centerCol));
      const required = targetCenterHeight - distance;
      if (required <= 0) continue;
      stageRaise(row, col, required);
    }
  }

  // Expand outward as needed so all cardinal neighbors remain within one level.
  let changed = true;
  while (changed) {
    changed = false;
    const snapshot = Array.from(plannedHeights.entries());

    for (let i = 0; i < snapshot.length; i++) {
      const [key, height] = snapshot[i];
      const [row, col] = key.split(',').map(Number);
      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ];

      for (let n = 0; n < neighbors.length; n++) {
        const [nr, nc] = neighbors[n];
        if (!isInsideMap(nr, nc)) continue;
        const minNeighborHeight = Math.max(0, height - 1);
        const neighborHeight = getHeightWithPlan(nr, nc);
        if (neighborHeight >= minNeighborHeight) continue;
        if (stageRaise(nr, nc, minNeighborHeight)) changed = true;
      }
    }
  }

  const affectedTiles = [];
  plannedHeights.forEach((plannedHeight, key) => {
    const [row, col] = key.split(',').map(Number);
    const current = getTileHeight(row, col);
    if (plannedHeight <= current) return;
    affectedTiles.push({ row, col, targetHeight: plannedHeight });
  });

  return affectedTiles;
}

function buildRadiatingLowerPlan(centerRow, centerCol, targetCenterHeight, baseRadius = TERRAIN_RADIATE_BASE_RADIUS) {
  const plannedHeights = new Map();
  const makeKey = (row, col) => `${row},${col}`;

  function getHeightWithPlan(row, col) {
    const key = makeKey(row, col);
    if (plannedHeights.has(key)) return plannedHeights.get(key);
    return getTileHeight(row, col);
  }

  function stageLower(row, col, targetHeight) {
    if (!isInsideMap(row, col)) return false;
    const nextHeight = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, targetHeight));
    const key = makeKey(row, col);
    const baseline = plannedHeights.has(key)
      ? plannedHeights.get(key)
      : getTileHeight(row, col);

    if (nextHeight >= baseline) return false; // only lower, never raise
    plannedHeights.set(key, nextHeight);
    return true;
  }

  // Seed: inverted Chebyshev pyramid — center digs deepest, each outward ring is one level shallower.
  for (let row = centerRow - baseRadius; row <= centerRow + baseRadius; row++) {
    for (let col = centerCol - baseRadius; col <= centerCol + baseRadius; col++) {
      if (!isInsideMap(row, col)) continue;
      const distance = Math.max(Math.abs(row - centerRow), Math.abs(col - centerCol));
      const maxAllowed = targetCenterHeight + distance;
      const currentH = getTileHeight(row, col);
      if (currentH > maxAllowed) {
        stageLower(row, col, maxAllowed);
      }
    }
  }

  // Expand outward: if we lowered a tile, its cardinal neighbors that are now
  // more than 1 higher must also be lowered to maintain the slope constraint.
  let changed = true;
  while (changed) {
    changed = false;
    const snapshot = Array.from(plannedHeights.entries());

    for (let i = 0; i < snapshot.length; i++) {
      const [key, height] = snapshot[i];
      const [row, col] = key.split(',').map(Number);
      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ];

      for (let n = 0; n < neighbors.length; n++) {
        const [nr, nc] = neighbors[n];
        if (!isInsideMap(nr, nc)) continue;
        const maxNeighborHeight = height + 1;
        const neighborHeight = getHeightWithPlan(nr, nc);
        if (neighborHeight <= maxNeighborHeight) continue;
        if (stageLower(nr, nc, maxNeighborHeight)) changed = true;
      }
    }
  }

  const affectedTiles = [];
  plannedHeights.forEach((plannedHeight, key) => {
    const [row, col] = key.split(',').map(Number);
    const current = getTileHeight(row, col);
    if (plannedHeight >= current) return; // skip if not actually lowering
    affectedTiles.push({ row, col, targetHeight: plannedHeight });
  });

  return affectedTiles;
}

function applyRaiseTerrain(scene, row, col, radius = 1) {
  const currentHeight = getTileHeight(row, col);
  const targetCenterHeight = Math.min(MAX_TERRAIN_HEIGHT, currentHeight + 1);
  if (targetCenterHeight <= currentHeight) {
    return false;
  }

  const baseRadius = Math.max(radius, TERRAIN_RADIATE_BASE_RADIUS);
  const affectedTiles = buildRadiatingRaisePlan(row, col, targetCenterHeight, baseRadius);
  if (affectedTiles.length === 0) {
    return false;
  }

  const blockers = getTerrainEditBlockersForTiles(scene, affectedTiles);
  if (blockers.length > 0) {
    showToast(t('toast.terrainEditBlockedByInfrastructure'), 'warning');
    return false;
  }

  let minRow = row;
  let maxRow = row;
  let minCol = col;
  let maxCol = col;

  affectedTiles.forEach(({ row: tileRow, col: tileCol, targetHeight }) => {
    if (!heightMap[tileRow]) heightMap[tileRow] = [];
    heightMap[tileRow][tileCol] = targetHeight;
    mapData[tileRow][tileCol] = HILL;

    minRow = Math.min(minRow, tileRow);
    maxRow = Math.max(maxRow, tileRow);
    minCol = Math.min(minCol, tileCol);
    maxCol = Math.max(maxCol, tileCol);
  });

  const reconcileRadius = Math.max(
    Math.abs(minRow - row),
    Math.abs(maxRow - row),
    Math.abs(minCol - col),
    Math.abs(maxCol - col),
  ) + 1;

  reconcileSurfaceTerrainFromHeight(row, col, reconcileRadius);
  affectedTiles.forEach(({ row: tileRow, col: tileCol }) => {
    refreshTileArea(scene, tileRow, tileCol);
  });
  return true;
}

function applyLowerTerrain(scene, row, col, radius = 1) {
  const currentHeight = getTileHeight(row, col);
  const targetCenterHeight = Math.max(0, currentHeight - 1);
  if (targetCenterHeight >= currentHeight) {
    return false;
  }

  const baseRadius = Math.max(radius, TERRAIN_RADIATE_BASE_RADIUS);
  const affectedTiles = buildRadiatingLowerPlan(row, col, targetCenterHeight, baseRadius);
  if (affectedTiles.length === 0) {
    return false;
  }

  const blockers = getTerrainEditBlockersForTiles(scene, affectedTiles);
  if (blockers.length > 0) {
    showToast(t('toast.terrainEditBlockedByInfrastructure'), 'warning');
    return false;
  }

  let minRow = row;
  let maxRow = row;
  let minCol = col;
  let maxCol = col;

  affectedTiles.forEach(({ row: tileRow, col: tileCol, targetHeight }) => {
    if (!heightMap[tileRow]) heightMap[tileRow] = [];
    heightMap[tileRow][tileCol] = targetHeight;
    mapData[tileRow][tileCol] = targetHeight > 0 ? HILL : GROUND;

    minRow = Math.min(minRow, tileRow);
    maxRow = Math.max(maxRow, tileRow);
    minCol = Math.min(minCol, tileCol);
    maxCol = Math.max(maxCol, tileCol);
  });

  const reconcileRadius = Math.max(
    Math.abs(minRow - row),
    Math.abs(maxRow - row),
    Math.abs(minCol - col),
    Math.abs(maxCol - col),
  ) + 1;

  reconcileSurfaceTerrainFromHeight(row, col, reconcileRadius);
  affectedTiles.forEach(({ row: tileRow, col: tileCol }) => {
    refreshTileArea(scene, tileRow, tileCol);
  });
  return true;
}

function applyFlattenTerrain(scene, row, col, radius = 1) {
  const blockers = getRaiseTerrainBlockers(scene, row, col, radius);
  if (blockers.length > 0) {
    showToast(t('toast.terrainEditBlockedByInfrastructure'), 'warning');
    return false;
  }

  const targetHeight = getTileHeight(row, col);
  const affectedTiles = [];
  for (let tileRow = row - radius; tileRow <= row + radius; tileRow++) {
    for (let tileCol = col - radius; tileCol <= col + radius; tileCol++) {
      if (!isInsideMap(tileRow, tileCol)) continue;
      affectedTiles.push({ row: tileRow, col: tileCol });
    }
  }

  affectedTiles.forEach(({ row: tileRow, col: tileCol }) => {
    if (!heightMap[tileRow]) heightMap[tileRow] = [];
    heightMap[tileRow][tileCol] = targetHeight;
    mapData[tileRow][tileCol] = targetHeight > 0 ? HILL : GROUND;
  });

  enforceLocalSlopeConstraints(row, col, radius + 2, 2, 1);
  reconcileSurfaceTerrainFromHeight(row, col, radius + 2);
  refreshTileArea(scene, row, col);
  return true;
}

function applySelectedTool(scene, pointer) {
  if (pointer.event?.target?.closest('#tool-menu, #hud, #budget-panel, #budget-window, #toast-container, #speed-controls, #top-bar, .sim-dialog, #jukebox-window, #rotate-cluster, #overlay-window, #inspect-panel, #terrain-minimap-panel')) return;

  let tile = selectedTool === 'inspect'
    ? (resolveInspectTile(scene, pointer) ?? lastInspectTile)
    : pointerToTile(scene, pointer);

  if (!tile) {
    // Inspect tool: clamp to map bounds so the proximity scan in showInspectPanel
    // can still find nearby buildings when cursor is over a tall sprite body.
    if (selectedTool === 'inspect') {
      const wp = pointer.positionToCamera(scene.cameras.main);
      tile = clampScreenPointToTile(scene, wp.x, wp.y);
    } else {
      return;
    }
  }

  // Inspect doesn't modify terrain — skip dedup so the panel always refreshes.
  if (selectedTool !== 'inspect') {
    const tileId = getTileId(tile.row, tile.col);
    if (tileId === lastEditedTile) return;
    lastEditedTile = tileId;
  }

  applyToolAt(scene, tile.row, tile.col, pointer);
}

function resolveInspectTile(scene, pointer) {
  const building = findBuildingAtPointer(scene, pointer);
  if (building) {
    return { row: building.mapRow, col: building.mapCol };
  }

  const tile = pointerToTile(scene, pointer);
  if (tile) return tile;

  const wp = pointer.positionToCamera(scene.cameras.main);
  return clampScreenPointToTile(scene, wp.x, wp.y);
}

function findBuildingAtPointer(scene, pointer) {
  const worldPoint = pointer.positionToCamera(scene.cameras.main);
  let best = null;

  new Set(scene.buildingSprites.values()).forEach((building) => {
    if (!building.getBounds().contains(worldPoint.x, worldPoint.y)) return;
    if (!best || building.depth > best.depth) best = building;
  });

  return best;
}

// Bresenham line between two grid cells — returns [{row,col}] inclusive.
function getLineTiles(r1, c1, r2, c2) {
  const tiles = [];
  let dr = Math.abs(r2 - r1), dc = Math.abs(c2 - c1);
  const sr = r1 < r2 ? 1 : -1, sc = c1 < c2 ? 1 : -1;
  let err = dr - dc, r = r1, c = c1;
  for (;;) {
    tiles.push({ row: r, col: c });
    if (r === r2 && c === c2) break;
    const e2 = 2 * err;
    if (e2 > -dc) { err -= dc; r += sr; }
    if (e2 <  dr) { err += dr; c += sc; }
  }
  return tiles;
}

function getStraightDragPath(start, end) {
  if (!start || !end) return [];
  const rowDelta = Math.abs(end.row - start.row);
  const colDelta = Math.abs(end.col - start.col);
  const path = [];

  if (colDelta >= rowDelta) {
    const step = end.col >= start.col ? 1 : -1;
    for (let col = start.col; ; col += step) {
      path.push({ row: start.row, col });
      if (col === end.col) break;
    }
    return { axis: 'row', path };
  }

  const step = end.row >= start.row ? 1 : -1;
  for (let row = start.row; ; row += step) {
    path.push({ row, col: start.col });
    if (row === end.row) break;
  }
  return { axis: 'col', path };
}

function isBridgeTile(row, col) {
  return !!bridgeMap?.[row]?.[col];
}

function isBridgeDeckTile(row, col) {
  return normalizeBridgeMapValue(bridgeMap?.[row]?.[col])?.startsWith('deck:') ?? false;
}

function isRoadLikeTile(row, col) {
  return isInsideMap(row, col) && (mapData[row][col] === ROAD || isBridgeDeckTile(row, col));
}

function analyzeBridgePath(scene, pathInfo) {
  const path = pathInfo?.path ?? [];
  const axis = pathInfo?.axis;
  const result = {
    valid: false,
    axis,
    path,
    crossesWater: false,
    reason: '',
    cost: 0,
  };
  if (path.length < 3) {
    result.reason = 'bridge-too-short';
    return result;
  }

  const start = path[0];
  const end = path[path.length - 1];
  const interior = path.slice(1, -1);
  result.crossesWater = path.some(({ row, col }) => mapData[row]?.[col] === WATER);
  if (!result.crossesWater) return result;

  if (getTileHeight(start.row, start.col) > 0 || getTileHeight(end.row, end.col) > 0) {
    result.reason = 'bridge-flat-shores';
    return result;
  }

  if (!isBridgeShoreTile(start.row, start.col) || !isBridgeShoreTile(end.row, end.col)) {
    result.reason = 'bridge-two-shores';
    return result;
  }

  for (const tile of path) {
    const id = getTileId(tile.row, tile.col);
    if (scene?.buildingSprites?.has(id) || buildingData[id]) {
      result.reason = 'bridge-blocked';
      return result;
    }
  }

  for (const tile of interior) {
    if (mapData[tile.row][tile.col] !== WATER) {
      result.reason = 'bridge-needs-water';
      return result;
    }
  }

  result.valid = true;
  result.cost = (path.length * COST_ROAD) + (interior.length * COST_BRIDGE);
  return result;
}

function isBridgeShoreTile(row, col) {
  if (!isInsideMap(row, col)) return false;
  if (mapData[row][col] === WATER) return false;
  if (isBridgeTile(row, col)) return false;
  return [GROUND, DIRT, BEACH, ROAD].includes(mapData[row][col]);
}

function commitRoadDrag(scene, start, end) {
  const pathInfo = getStraightDragPath(start, end);
  const bridge = analyzeBridgePath(scene, pathInfo);
  if (bridge.crossesWater) {
    if (!bridge.valid) {
      showToast(getBridgeErrorMessage(bridge.reason), 'warning');
      return;
    }
    buildBridgePath(scene, bridge);
    return;
  }

  buildRoadPath(scene, pathInfo.path);
}

function buildRoadPath(scene, path) {
  const uniqueTiles = dedupePath(path).filter(({ row, col }) => (
    mapData[row][col] !== ROAD && mapData[row][col] !== WATER
    && canPlaceRoad(scene, row, col)
  ));
  if (uniqueTiles.length === 0) return;

  const cost = uniqueTiles.length * COST_ROAD;
  if (!spendBudget(cost)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return;
  }

  uniqueTiles.forEach(({ row, col }) => {
    setTileType(scene, row, col, ROAD);
  });
  if (typeof updateHUD === 'function') updateHUD();
}

function buildBridgePath(scene, bridge) {
  if (!spendBudget(bridge.cost)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return;
  }

  const path = dedupePath(bridge.path);
  path.forEach(({ row, col }, index) => {
    const isInterior = index > 0 && index < path.length - 1;
    const isStart = index === 0;
    const isEnd = index === path.length - 1;
    if (isInterior) {
      const oldType = mapData[row][col];
      roadTileCount++;
      removeZoneOverlay(scene, row, col);
      bridgeMap[row][col] = `deck:${bridge.axis}`;
      roadUnderlayMap[row][col] = oldType;
      mapData[row][col] = oldType;
      heightMap[row][col] = 0;
    } else if (isStart || isEnd) {
      const oldType = mapData[row][col];
      if (oldType !== ROAD) roadTileCount++;
      removeZoneOverlay(scene, row, col);
      mapData[row][col] = ROAD;
      heightMap[row][col] = 0;
      const towardWater = isStart
        ? getDirectionBetweenTiles(path[index], path[index + 1])
        : getDirectionBetweenTiles(path[index], path[index - 1]);
      bridgeMap[row][col] = `ramp:${towardWater}`;
      roadUnderlayMap[row][col] = oldType;
    } else {
      bridgeMap[row][col] = null;
      roadUnderlayMap[row][col] = null;
    }
  });

  refreshTilesAlongPath(scene, path);
  refreshBridgeSpritesAlongPath(scene, path);
  if (typeof refreshInfrastructureEffects === 'function') refreshInfrastructureEffects(scene);
  if (typeof updateHUD === 'function') updateHUD();
}

function refreshTilesAlongPath(scene, path) {
  const touched = new Set();
  path.forEach(({ row, col }) => {
    [
      [row, col],
      [row - 1, col],
      [row, col + 1],
      [row + 1, col],
      [row, col - 1],
    ].forEach(([r, c]) => {
      if (!isInsideMap(r, c)) return;
      const key = getTileId(r, c);
      if (touched.has(key)) return;
      touched.add(key);
      refreshTileArea(scene, r, c);
    });
  });
}

function refreshBridgeSpritesAlongPath(scene, path) {
  const touched = new Set();
  path.forEach(({ row, col }) => {
    [
      [row, col],
      [row - 1, col],
      [row, col + 1],
      [row + 1, col],
      [row, col - 1],
    ].forEach(([r, c]) => {
      if (!isInsideMap(r, c)) return;
      const key = getTileId(r, c);
      if (touched.has(key)) return;
      touched.add(key);
      refreshBridgeSprite(scene, r, c);
    });
  });
}

function refreshBridgeSprite(scene, row, col) {
  if (!scene?.bridgeSprites) return;
  const id = getTileId(row, col);
  const existing = scene.bridgeSprites.get(id);
  if (!isBridgeDeckTile(row, col)) {
    if (existing) {
      destroyBridgeSpriteEntry(existing);
      scene.bridgeSprites.delete(id);
    }
    return;
  }

  const key = getRoadKey(row, col);
  const pos = isoToScreen(col, row);
  const x = pos.x + scene.offsetX;
  const y = pos.y + scene.offsetY + getBridgeDeckVisualOffset(row, col, key);
  const depth = getTerrainTileDepth(row, col, key, pos.y);

  if (existing) {
    existing.setTexture(key);
    existing.setPosition(x, y);
    existing.setDepth(depth + 0.45);
    return;
  }

  const bridge = scene.add.image(x, y, key);
  bridge.setOrigin(0.5, 1);
  bridge.setDepth(depth + 0.45);
  bridge.setMask(scene.worldMask);
  scene.bridgeSprites.set(id, bridge);
}

function refreshAllBridgeSprites(scene) {
  if (!scene?.bridgeSprites) return;
  scene.bridgeSprites.forEach(destroyBridgeSpriteEntry);
  scene.bridgeSprites.clear();
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      refreshBridgeSprite(scene, row, col);
    }
  }
}

function repositionBridgeSprites(scene) {
  if (!scene?.bridgeSprites) return;
  scene.bridgeSprites.forEach((entry, id) => {
    const [row, col] = id.split(':').map(Number);
    if (!isInsideMap(row, col) || !isBridgeDeckTile(row, col)) {
      destroyBridgeSpriteEntry(entry);
      scene.bridgeSprites.delete(id);
      return;
    }
    const key = getRoadKey(row, col);
    const pos = isoToScreen(col, row);
    const depth = getTerrainTileDepth(row, col, key, pos.y);
    entry.setTexture(key);
    entry.setPosition(pos.x + scene.offsetX, pos.y + scene.offsetY + getBridgeDeckVisualOffset(row, col, key));
    entry.setDepth(depth + 0.45);
  });
}

function destroyBridgeSpriteEntry(entry) {
  if (!entry) return;
  if (entry.destroy) {
    entry.destroy();
    return;
  }
  entry.side?.destroy();
  entry.top?.destroy();
}

function dedupePath(path) {
  const seen = new Set();
  return path.filter(({ row, col }) => {
    const key = getTileId(row, col);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getDirectionBetweenTiles(from, to) {
  if (!from || !to) return 'n';
  if (to.row < from.row) return 'n';
  if (to.col > from.col) return 'e';
  if (to.row > from.row) return 's';
  if (to.col < from.col) return 'w';
  return 'n';
}

function getOppositeDirection(direction) {
  return { n: 's', e: 'w', s: 'n', w: 'e' }[direction] ?? direction;
}

function normalizeBridgeMapValue(value) {
  if (value === 'row' || value === 'col') return `deck:${value}`;
  if (value === 'deck:row' || value === 'deck:col') return value;
  if (typeof value === 'string' && /^ramp:[nesw]$/.test(value)) return value;
  return null;
}

function getBridgeErrorMessage(reason) {
  if (reason === 'bridge-flat-shores') return t('toast.bridgeNeedsFlatShores');
  if (reason === 'bridge-two-shores') return t('toast.bridgeNeedsTwoShores');
  if (reason === 'bridge-needs-water') return t('toast.bridgeNeedsWater');
  if (reason === 'bridge-blocked') return t('toast.bridgeBlocked');
  return t('toast.bridgeInvalid');
}

// Fill the axis-aligned rectangle from startTile to endTile with the active zone tool.
function fillZoneRect(scene, startTile, endTile) {
  const r1 = Math.min(startTile.row, endTile.row);
  const r2 = Math.max(startTile.row, endTile.row);
  const c1 = Math.min(startTile.col, endTile.col);
  const c2 = Math.max(startTile.col, endTile.col);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      applyToolAt(scene, r, c);
    }
  }
}

// Draw an isometric diamond outline showing the zone rectangle selection.
// The four apexes of the selection are the outer vertices of the four corner tiles.
// ── Inspect-mode hover highlight (single red isometric diamond) ───────────────

function drawInspectHighlight(scene, row, col) {
  const g = scene.inspectHighlightGraphic;
  if (!g) return;
  g.clear();
  const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
  const top = geom.top;
  const right = geom.right;
  const bot = geom.bottom;
  const left = geom.left;
  g.fillStyle(0xff2222, 0.22);
  g.lineStyle(2, 0xff5555, 0.95);
  g.beginPath();
  g.moveTo(top.x,   top.y);
  g.lineTo(right.x, right.y);
  g.lineTo(bot.x,   bot.y);
  g.lineTo(left.x,  left.y);
  g.closePath();
  g.fillPath();
  g.strokePath();
}

// ── Zone selection preview (coloured ISO rect during drag) ────────────────────

function drawZoneSelectionPreview(scene, start, end) {
  const g = scene.zonePreviewGraphic;
  if (!g) return;
  g.clear();

  const r1 = Math.min(start.row, end.row);
  const r2 = Math.max(start.row, end.row);
  const c1 = Math.min(start.col, end.col);
  const c2 = Math.max(start.col, end.col);

  const ox = scene.offsetX, oy = scene.offsetY;
  const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
  const vertices = [];

  // Build the selection from the actual screen-space diamond vertices of every
  // selected tile. This keeps the preview aligned after map rotation.
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      vertices.push(...getTileFaceVertices(r, c, ox, oy, hw, hh));
    }
  }

  let north = vertices[0], east = vertices[0], south = vertices[0], west = vertices[0];
  vertices.forEach((pt) => {
    if (pt.y < north.y) north = pt;
    if (pt.x > east.x) east = pt;
    if (pt.y > south.y) south = pt;
    if (pt.x < west.x) west = pt;
  });

  const color = selectedTool === 'zone-res' ? 0x44ff66
              : selectedTool === 'zone-com' ? 0x4499ff
              : 0xffcc00;

  g.fillStyle(color, 0.18);
  g.lineStyle(2, color, 0.95);

  g.beginPath();
  g.moveTo(north.x, north.y);
  g.lineTo(east.x,  east.y);
  g.lineTo(south.x, south.y);
  g.lineTo(west.x,  west.y);
  g.closePath();
  g.fillPath();
  g.strokePath();
}

function drawRoadDragPreview(scene, start, end) {
  const g = scene.bridgePreviewGraphic;
  if (!g) return;
  g.clear();

  const pathInfo = getStraightDragPath(start, end);
  const path = pathInfo.path ?? [];
  if (path.length === 0) return;

  const bridge = analyzeBridgePath(scene, pathInfo);
  const invalidWaterPath = bridge.crossesWater && !bridge.valid;
  const color = invalidWaterPath ? 0xff4444 : bridge.valid ? 0x55ccff : 0xd0d0d0;

  g.fillStyle(color, bridge.valid ? 0.26 : 0.18);
  g.lineStyle(2, color, 0.92);
  path.forEach(({ row, col }) => {
    const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    g.beginPath();
    g.moveTo(geom.top.x, geom.top.y);
    g.lineTo(geom.right.x, geom.right.y);
    g.lineTo(geom.bottom.x, geom.bottom.y);
    g.lineTo(geom.left.x, geom.left.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  });
}

function getTileFaceVertices(row, col, ox, oy, hw, hh) {
  const key = getTileKey(row, col);
  const pos = isoToScreen(col, row);
  const tileY = pos.y + oy + getTerrainTileVisualOffset(row, col, key);
  const baseY = tileY - TILE_IMAGE_HEIGHT;
  return [
    { x: pos.x + ox,      y: baseY },
    { x: pos.x + ox + hw, y: baseY + hh },
    { x: pos.x + ox,      y: baseY + TILE_HEIGHT },
    { x: pos.x + ox - hw, y: baseY + hh },
  ];
}

function getTileFaceGeometry(row, col, ox, oy) {
  const hw = TILE_WIDTH / 2;
  const hh = TILE_HEIGHT / 2;
  const vertices = getTileFaceVertices(row, col, ox, oy, hw, hh);
  return {
    top: vertices[0],
    right: vertices[1],
    bottom: vertices[2],
    left: vertices[3],
    center: {
      x: vertices[0].x,
      y: vertices[0].y + hh,
    },
  };
}

function pointerToTile(scene, pointer) {
  const worldPoint = pointer.positionToCamera(scene.cameras.main);
  return screenPointToTile(scene, worldPoint.x, worldPoint.y);
}

function screenPointToTile(scene, worldX, worldY) {
  const localX = worldX - scene.offsetX;
  const localY = worldY - scene.offsetY + TILE_PICK_Y_OFFSET;
  const approx = screenToIso(localX, localY);
  const baseCol = Math.floor(approx.x);
  const baseRow = Math.floor(approx.y);

  let best = null;
  let bestDist = Infinity;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const row = baseRow + dr;
      const col = baseCol + dc;
      if (!isInsideMap(row, col)) continue;

      const verts = getTileFaceVertices(row, col, scene.offsetX, scene.offsetY, TILE_WIDTH / 2, TILE_HEIGHT / 2);
      if (!pointInConvexPolygon(worldX, worldY, verts)) continue;

      const center = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY).center;
      const cx = center.x;
      const cy = center.y;
      const dist = Math.abs(worldX - cx) + Math.abs(worldY - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { row, col };
      }
    }
  }

  if (best) return best;

  const col = baseCol;
  const row = baseRow;

  if (!isInsideMap(row, col)) return null;
  return { row, col };
}

function clampScreenPointToTile(scene, worldX, worldY) {
  const localX = worldX - scene.offsetX;
  const localY = worldY - scene.offsetY + TILE_PICK_Y_OFFSET;
  const iso = screenToIso(localX, localY);
  return {
    row: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(iso.y))),
    col: Math.max(0, Math.min(MAP_WIDTH  - 1, Math.floor(iso.x))),
  };
}

function resetBridgeLayers() {
  bridgeMap = createFilledMap(null);
  roadUnderlayMap = createFilledMap(null);
}

function pointInConvexPolygon(x, y, vertices) {
  let hasPositive = false;
  let hasNegative = false;

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross > 0) hasPositive = true;
    if (cross < 0) hasNegative = true;
    if (hasPositive && hasNegative) return false;
  }

  return true;
}

function getCameraCenterWorld(scene) {
  const camera = scene.cameras.main;
  return {
    x: camera.scrollX + camera.width / (2 * camera.zoom),
    y: camera.scrollY + camera.height / (2 * camera.zoom),
  };
}

function worldToLogicalPoint(scene, worldX, worldY) {
  return screenToIso(
    worldX - scene.offsetX,
    worldY - scene.offsetY + TILE_PICK_Y_OFFSET,
  );
}

function logicalPointToWorld(scene, logical) {
  const pos = isoToScreen(logical.x, logical.y);
  return {
    x: pos.x + scene.offsetX,
    y: pos.y + scene.offsetY - TILE_PICK_Y_OFFSET,
  };
}

function setTileType(scene, row, col, tileType) {
  const oldType = mapData[row][col];

  if (!heightMap[row]) heightMap[row] = [];
  const currentHeight = getTileHeight(row, col);

  // SimCity-style stepped terrain editing:
  // clicking hill raises by one level, clicking ground lowers by one level.
  if (tileType === HILL && currentHeight > 0) {
    heightMap[row][col] = Math.min(MAX_TERRAIN_HEIGHT, currentHeight + 1);
    mapData[row][col] = HILL;
    enforceLocalSlopeConstraints(row, col, 3, 2, 1);
    reconcileSurfaceTerrainFromHeight(row, col);
    refreshTileArea(scene, row, col);
    return;
  }

  if (tileType === GROUND && currentHeight > 0) {
    const lowered = Math.max(0, currentHeight - 1);
    heightMap[row][col] = lowered;
    mapData[row][col] = lowered > 0 ? HILL : GROUND;
    enforceLocalSlopeConstraints(row, col, 3, 2, 1);
    reconcileSurfaceTerrainFromHeight(row, col);
    refreshTileArea(scene, row, col);
    return;
  }

  if (oldType === tileType) return;

  if (isBridgeTile(row, col) && tileType !== ROAD) {
    bridgeMap[row][col] = null;
    roadUnderlayMap[row][col] = null;
  }

  if (tileType === ROAD) {
    const tileId = getTileId(row, col);
    if (scene.buildingSprites.has(tileId) || buildingData[tileId]) return;
    removeBuilding(scene, row, col);
    removeZoneOverlay(scene, row, col);
  }

  if (oldType === ROAD) roadTileCount = Math.max(0, roadTileCount - 1);
  if (tileType === ROAD) roadTileCount++;

  mapData[row][col] = tileType;

  if (tileType === HILL) {
    const neighbors = [
      getTileHeight(row - 1, col),
      getTileHeight(row + 1, col),
      getTileHeight(row, col - 1),
      getTileHeight(row, col + 1),
    ];
    const neighborMax = Math.max(0, ...neighbors);
    heightMap[row][col] = Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, neighborMax || 1));
  } else if (tileType === ROAD) {
    // Keep existing elevation so mountain roads do not snap to sea level.
    heightMap[row][col] = currentHeight;
  } else if (tileType === WATER || tileType === BEACH) {
    heightMap[row][col] = 0;
  } else if (currentHeight > 0 && tileType !== HILL) {
    heightMap[row][col] = 0;
  }

  enforceLocalSlopeConstraints(row, col, 3, 2, 1);
  reconcileSurfaceTerrainFromHeight(row, col);

  refreshTileArea(scene, row, col);

  if (tileType === ROAD && typeof refreshInfrastructureEffects === 'function') {
    refreshInfrastructureEffects(scene);
  }
}

function refreshTileArea(scene, row, col) {
  const tilesToRefresh = [
    [row, col],
    [row - 1, col],
    [row, col + 1],
    [row + 1, col],
    [row, col - 1],
    [row - 1, col + 1],
    [row + 1, col + 1],
    [row + 1, col - 1],
    [row - 1, col - 1],
  ];

  tilesToRefresh.forEach(([tileRow, tileCol]) => {
    if (!isInsideMap(tileRow, tileCol)) return;
    const key = getTileKey(tileRow, tileCol);
    const pos = isoToScreen(tileCol, tileRow);
    const sprite = scene.tileSprites[tileRow][tileCol];
    sprite.setTexture(key);
    sprite.setPosition(pos.x + scene.offsetX, pos.y + scene.offsetY + getTerrainTileVisualOffset(tileRow, tileCol, key));
    sprite.setDepth(getTerrainTileDepth(tileRow, tileCol, key, pos.y));
    applyTileVisualStyle(sprite, tileRow, tileCol, key);
    refreshBridgeSprite(scene, tileRow, tileCol);
  });

  scheduleTerrainMiniMapUpdate();
}

function refreshAllTiles(scene) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const key = getTileKey(row, col);
      const pos = isoToScreen(col, row);
      const sprite = scene.tileSprites[row][col];
      sprite.setTexture(key);
      sprite.setPosition(pos.x + scene.offsetX, pos.y + scene.offsetY + getTerrainTileVisualOffset(row, col, key));
      sprite.setDepth(getTerrainTileDepth(row, col, key, pos.y));
      applyTileVisualStyle(sprite, row, col, key);
    }
  }
  refreshAllBridgeSprites(scene);
  scheduleTerrainMiniMapUpdate();
}

function generateNewTerrain() {
  if (isTerrainCreatorMode) {
    currentSeed = createSeed();
    mapData = generateTerrainMapByProfile(activeTerrainProfileType, currentSeed);
    resetBridgeLayers();
    mapRotation = 0;
    lastEditedTile = null;

    if (activeScene) {
      fullReset(activeScene);
      refreshAllTiles(activeScene);
      stopSimTimer();
    }
    return;
  }

  let seedInput = null;
  let promptSupported = true;
  try {
    seedInput = window.prompt(t('prompt.terrainSeed'), currentSeed);
  } catch {
    promptSupported = false;
  }

  // If prompt is available, keep cancel behavior unchanged.
  // If prompt is unavailable (e.g. embedded webview), still generate terrain.
  if (promptSupported && seedInput === null) return;

  currentSeed = promptSupported
    ? (seedInput.trim() || createSeed())
    : createSeed();

  if (!promptSupported) {
    showToast(t('toast.terrainSeedPromptUnavailable'), 'info');
  }

  mapData = isTerrainCreatorMode
    ? generateTerrainMapByProfile(activeTerrainProfileType, currentSeed)
    : generateTerrainMap(currentSeed);
  resetBridgeLayers();
  mapRotation = 0;           // reset view to default orientation
  lastEditedTile = null;

  if (activeScene) {
    fullReset(activeScene);
    refreshAllTiles(activeScene);
    if (isTerrainCreatorMode) stopSimTimer();
  }
}

function clearBuildings(scene) {
  new Set(scene.buildingSprites.values()).forEach((building) => {
    building.destroy();
  });
  scene.buildingSprites.clear();
}

function createSeed() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Terrain elevation helpers ─────────────────────────────────────────────────

function getTileHeight(row, col) {
  return heightMap[row]?.[col] ?? 0;
}

function getElevationVisualOffset(row, col) {
  return -getTileHeight(row, col) * HEIGHT_STEP_PIXELS;
}

function getHillSlopeBaseHeight(row, col) {
  // A slope tile visually connects to the lower side — its base sits at the
  // maximum height of the cardinal neighbours that are LOWER than this tile.
  const thisH = getTileHeight(row, col);
  const neighbourHeights = [
    getTileHeight(row - 1, col),
    getTileHeight(row + 1, col),
    getTileHeight(row,     col - 1),
    getTileHeight(row,     col + 1),
  ].filter((h) => h < thisH);
  return neighbourHeights.length > 0 ? Math.max(...neighbourHeights) : 0;
}

function getTerrainTileVisualOffset(row, col, key = getTileKey(row, col)) {
  if (key.startsWith('hill_')) {
    if (key === 'hill_plateau') return getElevationVisualOffset(row, col) - 2;
    return -getHillSlopeBaseHeight(row, col) * HEIGHT_STEP_PIXELS;
  }
  if (key.startsWith('road_hill')) {
    return -getHillSlopeBaseHeight(row, col) * HEIGHT_STEP_PIXELS;
  }
  return getElevationVisualOffset(row, col);
}

function getBridgeDeckVisualOffset(row, col, key) {
  return getTerrainTileVisualOffset(row, col, key) - BRIDGE_DECK_VISUAL_LIFT;
}

function reconcileSurfaceTerrainFromHeight(centerRow, centerCol, radius = 2) {
  for (let row = centerRow - radius; row <= centerRow + radius; row++) {
    for (let col = centerCol - radius; col <= centerCol + radius; col++) {
      if (!isInsideMap(row, col)) continue;
      const terrain = mapData[row][col];
      if (terrain === WATER || terrain === BEACH || terrain === ROAD || terrain === DIRT) continue;
      mapData[row][col] = getTileHeight(row, col) > 0 ? HILL : GROUND;
    }
  }
}

function getTerrainTileDepth(row, col, key = getTileKey(row, col), baseY = isoToScreen(col, row).y) {
  return baseY + getTerrainTileVisualOffset(row, col, key);
}

function applyTileVisualStyle(tile, row, col, key) {
  tile.clearTint?.();
  const h = getTileHeight(row, col);
  if (h === 0 || !key.startsWith('hill_')) return;
  // Slightly darken higher terrain to give a sense of altitude
  const shade = Math.max(0, 1 - h * 0.08);
  const v = Math.round(shade * 255);
  tile.setTint(Phaser.Display.Color.GetColor(v, v, v));
}

function getBuildingElevationOffset(row, col, footprintCols = 1, footprintRows = 1) {
  const tiles = getFootprintTiles(row, col, footprintCols, footprintRows);
  const maxH  = Math.max(0, ...tiles.map(([r, c]) => getTileHeight(r, c)));
  return -maxH * HEIGHT_STEP_PIXELS;
}

// ── Terrain generation ────────────────────────────────────────────────────────

const REALISTIC_TERRAIN_PROFILES = {
  default: {
    seaLevel: 0.28, baseElevation: 0.44, relief: 0.9, ridgeCount: 2, riverCount: 2,
    coastMode: 'edgeSea', buildableBias: 0.52, dryness: 0.22, erosionPasses: 2,
  },
  island: {
    seaLevel: 0.38, baseElevation: 0.16, relief: 0.82, ridgeCount: 2, riverCount: 2,
    coastMode: 'island', buildableBias: 0.28, dryness: 0.18, erosionPasses: 2,
  },
  harbor: {
    seaLevel: 0.34, baseElevation: 0.44, relief: 0.82, ridgeCount: 2, riverCount: 2,
    coastMode: 'harbor', buildableBias: 0.42, dryness: 0.18, erosionPasses: 2, harborMouthWidth: 34,
  },
  mountain: {
    seaLevel: 0.18, baseElevation: 0.56, relief: 1.55, ridgeCount: 4, riverCount: 3,
    coastMode: 'edgeSea', buildableBias: 0.24, dryness: 0.16, erosionPasses: 3,
  },
  desert: {
    seaLevel: 0.08, baseElevation: 0.32, relief: 0.7, ridgeCount: 2, riverCount: 1,
    coastMode: 'none', buildableBias: 0.38, dryness: 0.86, erosionPasses: 1,
  },
  plain: {
    seaLevel: 0.16, baseElevation: 0.30, relief: 0.42, ridgeCount: 1, riverCount: 2,
    coastMode: 'edgeSea', buildableBias: 0.62, dryness: 0.20, erosionPasses: 1,
  },
  lake: {
    seaLevel: 0.16, baseElevation: 0.40, relief: 0.75, ridgeCount: 2, riverCount: 2,
    coastMode: 'lake', buildableBias: 0.42, dryness: 0.12, erosionPasses: 2,
  },
  river: {
    seaLevel: 0.12, baseElevation: 0.42, relief: 0.75, ridgeCount: 2, riverCount: 4,
    coastMode: 'none', buildableBias: 0.52, dryness: 0.16, erosionPasses: 2,
  },
  plateau: {
    seaLevel: 0.10, baseElevation: 0.54, relief: 1.05, ridgeCount: 2, riverCount: 2,
    coastMode: 'none', buildableBias: 0.32, dryness: 0.34, erosionPasses: 2,
  },
  basin: {
    seaLevel: 0.20, baseElevation: 0.32, relief: 1.0, ridgeCount: 3, riverCount: 2,
    coastMode: 'basin', buildableBias: 0.38, dryness: 0.18, erosionPasses: 2,
  },
  flat: {
    seaLevel: -1, baseElevation: 0, relief: 0, ridgeCount: 0, riverCount: 0,
    coastMode: 'none', buildableBias: 1, dryness: 0, erosionPasses: 0,
  },
};

mapData = generateTerrainMap(currentSeed);

function generateTerrainMap(seed) {
  return generateRealisticTerrainMap('default', seed).mapData;
}

function generateTerrainMapByProfile(profileType, seed) {
  return generateRealisticTerrainMap(profileType, seed).mapData;
}

function generateRealisticTerrainMap(profileType = 'default', seed, options = {}) {
  const requestedProfile = REALISTIC_TERRAIN_PROFILES[profileType] ? profileType : 'default';
  const config = { ...REALISTIC_TERRAIN_PROFILES[requestedProfile], ...options };
  const random = createRandom(seed);

  if (requestedProfile === 'flat') {
    const terrain = createFilledMap(GROUND);
    const heights = createFilledMap(0);
    currentTerrainMetadata = { generatorVersion: 2, profileType: requestedProfile, seed, features: ['flat'] };
    heightMap = heights;
    return {
      mapData: terrain,
      heightMap: heights,
      metadata: currentTerrainMetadata,
    };
  }

  const field = createNumericMap(0);
  const masks = createTerrainMasks();
  const metadata = {
    generatorVersion: 2,
    profileType: requestedProfile,
    seed,
    features: [],
  };

  buildBaseHeightField(field, config, requestedProfile, random);
  applyCoastModel(field, masks, config, requestedProfile, random, metadata);
  const ridges = generateRidgeNetwork(config, requestedProfile, random);
  applyRidgeNetwork(field, ridges, config, requestedProfile, metadata);
  applyProfileLandform(field, masks, config, requestedProfile, random, metadata);
  routeRiverNetwork(field, masks, config, requestedProfile, random, metadata);
  smoothWaterMasks(field, masks, config, requestedProfile);
  erodeFieldAlongDrainage(field, masks, config);

  const { terrain, heights } = classifyTerrain(field, masks, config, requestedProfile, random);
  cleanupTerrainComponents(terrain, heights, requestedProfile);
  addBeachesBySlope(terrain, heights, field, config);
  smoothHillHeights(terrain, heights, Math.min(2, config.erosionPasses + 1));
  enforceGlobalSlopeConstraints(terrain, heights, 1, 4);
  quantizeHillHeights(terrain, heights);
  normalizeUnsupportedHillTopologiesGlobal(terrain, heights, 3);
  enforceGlobalSlopeConstraints(terrain, heights, 1, 2);
  quantizeHillHeights(terrain, heights);
  flattenMapBorder(terrain, heights, 3);

  currentTerrainMetadata = metadata;
  heightMap = heights;
  return { mapData: terrain, heightMap: heights, metadata };
}

function createNumericMap(value) {
  return Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(value));
}

function createTerrainMasks() {
  return {
    water: createNumericMap(false),
    river: createNumericMap(false),
    lake: createNumericMap(false),
    beach: createNumericMap(false),
    dirt: createNumericMap(false),
  };
}

function buildBaseHeightField(field, config, profileType, random) {
  const coastEdge = Math.floor(random() * 4);
  config._coastEdge = coastEdge;

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const nx = col / (MAP_WIDTH - 1);
      const ny = row / (MAP_HEIGHT - 1);
      const broad = valueNoise(col * 0.007, row * 0.007, random);
      const medium = valueNoise(col * 0.018 + 41, row * 0.018 - 29, random);
      const detail = valueNoise(col * 0.042 + 90, row * 0.042 - 40, random);
      let gradient = 0;

      if (profileType === 'mountain') gradient = (1 - nx) * 0.45 + (1 - ny) * 0.25;
      else if (profileType === 'plain') gradient = (1 - ny) * 0.12;
      else if (profileType === 'river') gradient = (1 - nx) * 0.18 + (1 - ny) * 0.10;
      else if (profileType === 'desert') gradient = (nx - 0.5) * 0.12;
      else if (profileType === 'plateau') gradient = 0.20 + (1 - ny) * 0.12;

      field[row][col] = config.baseElevation
        + (broad - 0.5) * config.relief * 0.82
        + (medium - 0.5) * config.relief * 0.28
        + (detail - 0.5) * config.relief * 0.14
        + gradient;
    }
  }
}

function applyCoastModel(field, masks, config, profileType, random, metadata) {
  if (config.coastMode === 'none') return;

  if (config.coastMode === 'edgeSea') {
    const edge = config._coastEdge ?? 1;
    const coastLine = Array.from({ length: Math.max(MAP_WIDTH, MAP_HEIGHT) }, (_, along) => (
      20
      + valueNoise(along * 0.025, 20 + along * 0.006, random) * 36
      + Math.max(0, valueNoise(along * 0.011 + 60, along * 0.014 - 20, random) - 0.58) * 72
    ));
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const along = edge < 2 ? row : col;
        const inward = edge === 0 ? row
          : edge === 1 ? MAP_WIDTH - 1 - col
            : edge === 2 ? MAP_HEIGHT - 1 - row
              : col;
        const coast = coastLine[along];
        if (inward < coast) {
          masks.water[row][col] = true;
          field[row][col] = Math.min(field[row][col], config.seaLevel - 0.18);
        } else if (inward < coast + 14) {
          field[row][col] -= (1 - (inward - coast) / 14) * 0.18;
        }
      }
    }
    metadata.features.push('coast');
    return;
  }

  if (config.coastMode === 'island') {
    applyIslandCoast(field, masks, config, random, metadata);
    return;
  }

  if (config.coastMode === 'harbor') {
    applyHarborCoast(field, masks, config, random, metadata);
    return;
  }

  if (config.coastMode === 'lake') {
    applyLakeBasin(field, masks, config, random, metadata);
    return;
  }

  if (config.coastMode === 'basin') {
    applyBasinRim(field, masks, config, random, metadata);
  }
}

function applyIslandCoast(field, masks, config, random, metadata) {
  const spines = generateIslandSpines(random);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const warpRow = row + (valueNoise(col * 0.016 + 7, row * 0.016 - 11, random) - 0.5) * 22;
      const warpCol = col + (valueNoise(col * 0.016 - 13, row * 0.016 + 17, random) - 0.5) * 22;
      let land = -0.35;
      spines.forEach((spine, index) => {
        const d = distanceToPolyline(warpRow, warpCol, spine.points);
        const width = spine.width * (index === 0 ? 1 : 0.72);
        land = Math.max(land, 1.05 - d / width);
      });
      land += (valueNoise(col * 0.018, row * 0.018, random) - 0.5) * 0.55;
      if (land < 0) {
        masks.water[row][col] = true;
        field[row][col] = config.seaLevel - 0.25;
      } else {
        field[row][col] += land * 0.75;
      }
    }
  }
  metadata.features.push('island-chain');
}

function generateIslandSpines(random) {
  const spines = [];
  const mainStart = { row: 60 + random() * 40, col: 24 + random() * 32 };
  const mainEnd = { row: 160 + random() * 42, col: 196 + random() * 30 };
  spines.push({
    width: 46 + random() * 22,
    points: makeMeanderingPolyline(mainStart, mainEnd, random, 6, 34),
  });
  const count = 2 + Math.floor(random() * 4);
  for (let i = 0; i < count; i++) {
    const anchor = spines[0].points[1 + Math.floor(random() * (spines[0].points.length - 2))];
    const angle = random() * Math.PI * 2;
    const len = 36 + random() * 56;
    const end = {
      row: Math.max(22, Math.min(MAP_HEIGHT - 22, anchor.row + Math.sin(angle) * len)),
      col: Math.max(22, Math.min(MAP_WIDTH - 22, anchor.col + Math.cos(angle) * len)),
    };
    spines.push({
      width: 17 + random() * 18,
      points: makeMeanderingPolyline(anchor, end, random, 4, 18),
    });
  }
  return spines;
}

function applyHarborCoast(field, masks, config, random, metadata) {
  const edge = Math.floor(random() * 4);
  config._coastEdge = edge;
  const mouthCenter = 104 + random() * 48;
  const bayDepth = 108 + random() * 44;
  const mouthWidth = config.harborMouthWidth ?? 34;

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const coords = edgeRelativeCoords(row, col, edge);
      const along = coords.along;
      const inward = coords.inward;
      const bayCurve = mouthCenter
        + Math.sin(inward * 0.035) * 24
        + (valueNoise(inward * 0.025, along * 0.014, random) - 0.5) * 34;
      const widening = mouthWidth + Math.sin(Math.min(1, inward / bayDepth) * Math.PI) * 58;
      const openSea = inward < 14 + valueNoise(along * 0.03, 7, random) * 20;
      const bay = inward < bayDepth && Math.abs(along - bayCurve) < widening;
      const innerHarbor = inward > bayDepth * 0.42 && inward < bayDepth * 0.92 && Math.abs(along - bayCurve) < widening * 1.16;
      if (openSea || bay || innerHarbor) {
        masks.water[row][col] = true;
        field[row][col] = config.seaLevel - (openSea ? 0.32 : 0.20);
      } else {
        const shoreDist = Math.abs(along - bayCurve) - widening;
        if (shoreDist > 0 && shoreDist < 20 && inward < bayDepth + 28) {
          field[row][col] -= (1 - shoreDist / 20) * 0.16;
        }
      }
    }
  }

  addHarborHeadlands(field, masks, edge, mouthCenter, bayDepth, random);
  metadata.features.push('natural-harbor', 'headlands');
}

function addHarborHeadlands(field, masks, edge, mouthCenter, bayDepth, random) {
  const headlandOffsets = [-1, 1];
  headlandOffsets.forEach((side) => {
    const points = [];
    for (let i = 0; i < 5; i++) {
      const inward = 22 + i * (bayDepth / 5);
      const along = mouthCenter + side * (34 + i * 7 + random() * 14);
      points.push(edgeToMapCoords(inward, along, edge));
    }
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const d = distanceToPolyline(row, col, points);
        if (d < 18) {
          const lift = (1 - d / 18) * 0.52;
          if (!masks.water[row][col] || d < 8) {
            masks.water[row][col] = false;
            field[row][col] += lift;
          }
        }
      }
    }
  });
}

function applyLakeBasin(field, masks, config, random, metadata) {
  const center = { row: 92 + random() * 72, col: 88 + random() * 80 };
  const rx = 42 + random() * 36;
  const ry = 34 + random() * 32;
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const warpCol = col + (valueNoise(col * 0.018, row * 0.018, random) - 0.5) * 20;
      const warpRow = row + (valueNoise(col * 0.018 + 31, row * 0.018 - 7, random) - 0.5) * 20;
      const dx = (warpCol - center.col) / rx;
      const dy = (warpRow - center.row) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const shoreNoise = (fbmNoise(col * 0.03, row * 0.03, random, 3, 2, 0.5) - 0.5) * 0.22;
      if (d + shoreNoise < 1) {
        masks.water[row][col] = true;
        masks.lake[row][col] = true;
        field[row][col] = config.seaLevel - 0.22;
      } else if (d < 1.4) {
        field[row][col] -= (1.4 - d) * 0.34;
      } else if (d < 2.2) {
        field[row][col] += (2.2 - d) * 0.10;
      }
    }
  }
  metadata.features.push('lake-basin');
}

function applyBasinRim(field, masks, config, random, metadata) {
  const center = { row: 118 + random() * 28, col: 112 + random() * 34 };
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const nx = (col - center.col) / 100;
      const ny = (row - center.row) / 92;
      const d = Math.sqrt(nx * nx + ny * ny);
      const broken = (valueNoise(col * 0.025, row * 0.025, random) - 0.5) * 0.28;
      const rim = Math.max(0, 1 - Math.abs(d - 0.72 + broken) / 0.22);
      const sink = Math.max(0, 1 - d / 0.44);
      field[row][col] += rim * 0.78 - sink * 0.36;
      if (sink > 0.72 && config.seaLevel > 0.15 && random.seed % 2 === 0) {
        masks.lake[row][col] = true;
        masks.water[row][col] = true;
        field[row][col] = config.seaLevel - 0.15;
      }
    }
  }
  metadata.features.push('basin-rim');
}

function applyProfileLandform(field, masks, config, profileType, random, metadata) {
  if (profileType === 'desert') {
    applyDuneBands(field, masks, random);
    metadata.features.push('dune-fields');
  } else if (profileType === 'plateau') {
    applyPlateauMesa(field, masks, random);
    metadata.features.push('plateau-mesa');
  } else if (profileType === 'plain') {
    flattenCentralLowlands(field, masks, 0.16);
    metadata.features.push('alluvial-plain');
  } else if (profileType === 'harbor' || profileType === 'default') {
    flattenCentralLowlands(field, masks, 0.08);
  }
}

function applyDuneBands(field, masks, random) {
  const angle = random() * Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const band = Math.sin((col * cos + row * sin) * 0.09 + valueNoise(col * 0.015, row * 0.015, random) * 3);
      field[row][col] += Math.max(0, band) * 0.16;
      if (band > 0.22) masks.dirt[row][col] = true;
    }
  }
}

function applyPlateauMesa(field, masks, random) {
  const tilt = random() * Math.PI;
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const nx = (col - MAP_WIDTH / 2) / (MAP_WIDTH / 2);
      const ny = (row - MAP_HEIGHT / 2) / (MAP_HEIGHT / 2);
      const shelf = Math.max(Math.abs(nx * 0.85 + Math.cos(tilt) * 0.18), Math.abs(ny * 0.75 + Math.sin(tilt) * 0.18));
      if (shelf < 0.58 + (valueNoise(col * 0.018, row * 0.018, random) - 0.5) * 0.22) {
        field[row][col] += 0.58;
      }
      const canyon = Math.abs(Math.sin(col * 0.025 + valueNoise(row * 0.02, col * 0.01, random) * 2));
      if (canyon < 0.08) {
        field[row][col] -= 0.34;
        masks.dirt[row][col] = true;
      }
    }
  }
}

function flattenCentralLowlands(field, masks, strength) {
  for (let row = 34; row < MAP_HEIGHT - 34; row++) {
    for (let col = 34; col < MAP_WIDTH - 34; col++) {
      if (masks.water[row][col]) continue;
      const low = field[row][col] < 0.58;
      if (low) field[row][col] = lerp(field[row][col], 0.38, strength);
    }
  }
}

function generateRidgeNetwork(config, profileType, random) {
  if (config.ridgeCount <= 0) return [];
  const ridges = [];
  const count = config.ridgeCount + (random() < 0.35 ? 1 : 0);

  for (let i = 0; i < count; i++) {
    const diagonal = random() < 0.65 || profileType === 'mountain';
    const start = diagonal
      ? { row: 18 + random() * 64, col: -10 + random() * 70 }
      : { row: random() * MAP_HEIGHT, col: 18 + random() * 46 };
    const end = diagonal
      ? { row: 170 + random() * 70, col: 178 + random() * 86 }
      : { row: random() * MAP_HEIGHT, col: 190 + random() * 48 };

    const points = makeMeanderingPolyline(start, end, random, 5 + Math.floor(random() * 3), profileType === 'mountain' ? 42 : 28);
    ridges.push({
      points,
      width: (profileType === 'mountain' ? 20 : 15) + random() * 18,
      strength: (profileType === 'mountain' ? 0.78 : 0.42) + random() * 0.28,
    });

    if (random() < 0.72) {
      const anchor = points[1 + Math.floor(random() * (points.length - 2))];
      const angle = Math.atan2(end.row - start.row, end.col - start.col) + (random() < 0.5 ? 1 : -1) * (0.7 + random() * 0.7);
      const branchEnd = {
        row: anchor.row + Math.sin(angle) * (42 + random() * 64),
        col: anchor.col + Math.cos(angle) * (42 + random() * 64),
      };
      ridges.push({
        points: makeMeanderingPolyline(anchor, branchEnd, random, 4, 20),
        width: 10 + random() * 12,
        strength: (profileType === 'mountain' ? 0.42 : 0.24) + random() * 0.18,
      });
    }
  }

  return ridges;
}

function applyRidgeNetwork(field, ridges, config, profileType, metadata) {
  if (ridges.length === 0) return;
  ridges.forEach((ridge) => {
    for (let index = 0; index < ridge.points.length - 1; index++) {
      const a = ridge.points[index];
      const b = ridge.points[index + 1];
      const margin = Math.ceil(ridge.width * 3.2);
      const minRow = Math.max(0, Math.floor(Math.min(a.row, b.row) - margin));
      const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil(Math.max(a.row, b.row) + margin));
      const minCol = Math.max(0, Math.floor(Math.min(a.col, b.col) - margin));
      const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil(Math.max(a.col, b.col) + margin));

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const d = distanceToSegment(row, col, a, b);
          if (d > margin) continue;
          const ridgeLift = Math.exp(-((d / ridge.width) ** 2)) * ridge.strength;
          const shoulder = Math.exp(-((d / (ridge.width * 2.8)) ** 2)) * ridge.strength * 0.18;
          field[row][col] += ridgeLift + shoulder;
          if (profileType === 'mountain' && d > ridge.width * 1.1 && d < ridge.width * 2.0) {
            field[row][col] -= 0.06;
          }
        }
      }
    }
  });
  metadata.features.push('ridge-network');
}

function routeRiverNetwork(field, masks, config, profileType, random, metadata) {
  const count = Math.max(0, config.riverCount);
  for (let i = 0; i < count; i++) {
    const source = chooseRiverSource(field, masks, random, i);
    if (!source) continue;
    const path = routeRiver(field, source, masks, config, random, profileType);
    if (path.length > 18) {
      paintRiverPath(field, masks, path, config, i === 0 ? 1 : 0);
      metadata.features.push(i === 0 ? 'main-river' : 'tributary');
    }
  }
}

function chooseRiverSource(field, masks, random, index) {
  let best = null;
  let bestScore = -Infinity;
  for (let attempts = 0; attempts < 900; attempts++) {
    const row = 12 + Math.floor(random() * (MAP_HEIGHT - 24));
    const col = 12 + Math.floor(random() * (MAP_WIDTH - 24));
    if (masks.water[row][col]) continue;
    const edgePenalty = Math.min(row, col, MAP_HEIGHT - 1 - row, MAP_WIDTH - 1 - col) * 0.003;
    const score = field[row][col] + edgePenalty + (index === 0 ? 0 : random() * 0.15);
    if (score > bestScore) {
      bestScore = score;
      best = { row, col };
    }
  }
  return best;
}

function routeRiver(field, source, masks, config, random, profileType) {
  const path = [];
  let row = source.row;
  let col = source.col;
  let prev = { dr: 0, dc: 0 };
  const visited = new Set();
  const targetEdge = config._coastEdge ?? Math.floor(random() * 4);

  for (let step = 0; step < MAP_WIDTH + MAP_HEIGHT; step++) {
    if (!isInsideMap(row, col)) break;
    path.push({ row, col });
    if ((masks.water[row][col] && step > 8) || isNearMapEdge(row, col)) break;
    visited.add(`${row},${col}`);

    let best = null;
    let bestScore = Infinity;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (!isInsideMap(nr, nc)) continue;
        if (visited.has(`${nr},${nc}`) && random() < 0.92) continue;
        const edgeBias = distanceToPreferredDrainEdge(nr, nc, targetEdge) * 0.002;
        const isSameDirection = dr === prev.dr && dc === prev.dc;
        const isReverse = dr === -prev.dr && dc === -prev.dc && (prev.dr !== 0 || prev.dc !== 0);
        const dot = dr * prev.dr + dc * prev.dc;
        const inertia = isSameDirection ? -0.09 : 0;
        const turnPenalty = isReverse ? 0.20 : dot <= 0 && (prev.dr !== 0 || prev.dc !== 0) ? 0.07 : 0;
        const meander = valueNoise(nc * 0.045 + step * 0.01, nr * 0.045, random) * 0.08;
        const score = field[nr][nc] + edgeBias + meander + inertia + turnPenalty;
        if (score < bestScore) {
          bestScore = score;
          best = { row: nr, col: nc, dr, dc };
        }
      }
    }
    if (!best) break;

    const current = field[row][col];
    if (field[best.row][best.col] > current - 0.01) {
      field[best.row][best.col] = current - (profileType === 'plain' ? 0.006 : 0.018);
    }
    prev = { dr: best.dr, dc: best.dc };
    row = best.row;
    col = best.col;
  }

  return path;
}

function paintRiverPath(field, masks, path, config, extraWidth = 0) {
  const smoothPath = smoothRiverPath(path);
  smoothPath.forEach(({ row, col }, index) => {
    const t = index / Math.max(1, smoothPath.length - 1);
    const width = 1.15 + extraWidth + t * 2.45;
    paintSoftWaterDisc(field, masks, row, col, width, config, true);
  });
  paintRiverMouth(field, masks, smoothPath, config, extraWidth);
}

function smoothRiverPath(path) {
  if (path.length < 5) return path.map(({ row, col }) => ({ row, col }));

  const controls = [];
  const stride = Math.max(4, Math.floor(path.length / 18));
  for (let i = 0; i < path.length; i += stride) {
    controls.push(path[i]);
  }
  const last = path[path.length - 1];
  if (controls[controls.length - 1] !== last) controls.push(last);

  const samples = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(controls.length - 1, i + 2)];
    const distance = Math.hypot(p2.row - p1.row, p2.col - p1.col);
    const steps = Math.max(4, Math.ceil(distance / 2.4));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      samples.push({
        row: catmullRom(p0.row, p1.row, p2.row, p3.row, t),
        col: catmullRom(p0.col, p1.col, p2.col, p3.col, t),
      });
    }
  }
  samples.push({ row: last.row, col: last.col });
  return samples;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function paintRiverMouth(field, masks, path, config, extraWidth = 0) {
  if (path.length < 4) return;
  const end = path[path.length - 1];
  const before = path[Math.max(0, path.length - 8)];
  const dirRow = end.row - before.row;
  const dirCol = end.col - before.col;
  const length = Math.hypot(dirRow, dirCol) || 1;
  const unitRow = dirRow / length;
  const unitCol = dirCol / length;
  const normalRow = -unitCol;
  const normalCol = unitRow;

  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const centerRow = end.row + unitRow * i * 1.7;
    const centerCol = end.col + unitCol * i * 1.7;
    const spread = (2.1 + extraWidth + t * 3.4);
    for (let side = -1; side <= 1; side++) {
      const offset = side * spread * 0.45 * t;
      paintSoftWaterDisc(
        field,
        masks,
        centerRow + normalRow * offset,
        centerCol + normalCol * offset,
        spread * (side === 0 ? 1 : 0.72),
        config,
        true,
      );
    }
  }
}

function paintSoftWaterDisc(field, masks, row, col, width, config, isRiver = false) {
  const radius = width + 2.7;
  for (let rr = Math.floor(row - radius); rr <= Math.ceil(row + radius); rr++) {
    for (let cc = Math.floor(col - radius); cc <= Math.ceil(col + radius); cc++) {
      if (!isInsideMap(rr, cc)) continue;
      const dist = Math.hypot(rr - row, cc - col);
      if (dist <= width) {
        masks.water[rr][cc] = true;
        if (isRiver) masks.river[rr][cc] = true;
        field[rr][cc] = Math.min(field[rr][cc], config.seaLevel - 0.12);
      } else if (dist <= radius) {
        const falloff = 1 - (dist - width) / (radius - width);
        field[rr][cc] -= falloff * 0.11;
        masks.dirt[rr][cc] = true;
      }
    }
  }
}

function smoothWaterMasks(field, masks, config, profileType) {
  const passes = profileType === 'harbor' || profileType === 'lake' ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    const nextWater = masks.water.map((row) => row.slice());
    for (let row = 1; row < MAP_HEIGHT - 1; row++) {
      for (let col = 1; col < MAP_WIDTH - 1; col++) {
        const waterNeighbors = countWaterNeighbors(masks, row, col, true);
        const cardinalWater = countWaterNeighbors(masks, row, col, false);

        if (!masks.water[row][col]) {
          const lowEnough = field[row][col] <= config.seaLevel + (profileType === 'plain' ? 0.18 : 0.32);
          if (lowEnough && (waterNeighbors >= 5 || cardinalWater >= 3)) {
            nextWater[row][col] = true;
          }
          continue;
        }

        if (!masks.river[row][col] && !masks.lake[row][col] && waterNeighbors <= 1) {
          nextWater[row][col] = false;
        } else if (!masks.river[row][col] && waterNeighbors <= 2 && field[row][col] > config.seaLevel - 0.04) {
          nextWater[row][col] = false;
        }
      }
    }

    for (let row = 1; row < MAP_HEIGHT - 1; row++) {
      for (let col = 1; col < MAP_WIDTH - 1; col++) {
        masks.water[row][col] = nextWater[row][col];
        if (masks.water[row][col]) {
          field[row][col] = Math.min(field[row][col], config.seaLevel - 0.08);
        } else {
          masks.river[row][col] = false;
        }
      }
    }
  }
}

function countWaterNeighbors(masks, row, col, includeDiagonals = true) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (!includeDiagonals && Math.abs(dr) + Math.abs(dc) !== 1) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (isInsideMap(nr, nc) && masks.water[nr][nc]) count++;
    }
  }
  return count;
}

function erodeFieldAlongDrainage(field, masks, config) {
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    for (let col = 1; col < MAP_WIDTH - 1; col++) {
      if (!masks.river[row][col]) continue;
      for (let rr = row - 3; rr <= row + 3; rr++) {
        for (let cc = col - 3; cc <= col + 3; cc++) {
          if (!isInsideMap(rr, cc) || masks.water[rr][cc]) continue;
          const dist = Math.hypot(rr - row, cc - col);
          if (dist <= 3) field[rr][cc] -= (1 - dist / 3) * 0.06 * Math.max(1, config.erosionPasses);
        }
      }
    }
  }
}

function classifyTerrain(field, masks, config, profileType, random) {
  const terrain = createFilledMap(GROUND);
  const heights = createFilledMap(0);
  const buildableCutoff = getBuildableCutoff(config, profileType);
  const heightScale = profileType === 'mountain' ? 5.7 : profileType === 'plateau' ? 5.0 : 4.25;

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (masks.water[row][col] || field[row][col] <= config.seaLevel) {
        terrain[row][col] = WATER;
        heights[row][col] = 0;
        continue;
      }

      const relative = Math.max(0, field[row][col] - config.seaLevel);
      const slope = localFieldSlope(field, row, col);
      const dryNoise = valueNoise(col * 0.032 + 140, row * 0.032 - 75, random);
      const hillHeight = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.round((relative - buildableCutoff) * heightScale)));

      if (hillHeight > 0 && (relative > buildableCutoff || slope > 0.18)) {
        terrain[row][col] = HILL;
        heights[row][col] = Math.max(1, hillHeight);
      } else if (masks.dirt[row][col] || dryNoise < config.dryness * 0.54 || slope > 0.16) {
        terrain[row][col] = DIRT;
      } else {
        terrain[row][col] = GROUND;
      }
    }
  }

  return { terrain, heights };
}

function getBuildableCutoff(config, profileType) {
  if (profileType === 'plain') return 0.62;
  if (profileType === 'default') return 0.76;
  if (profileType === 'harbor') return 1.08;
  if (profileType === 'mountain') return 1.30;
  if (profileType === 'island') return 1.02;
  if (profileType === 'plateau') return 0.78;
  if (profileType === 'desert') return 0.56;
  if (profileType === 'river') return 1.08;
  if (profileType === 'lake') return 0.52;
  if (profileType === 'basin') return 0.84;
  return 0.50;
}

function cleanupTerrainComponents(terrain, heights, profileType) {
  removeTinyTerrainComponents(terrain, heights, WATER, profileType === 'plain' ? 2 : 6, GROUND);
  removeTinyTerrainComponents(terrain, heights, HILL, 4, GROUND);
}

function removeTinyTerrainComponents(terrain, heights, tileType, minSize, replacement) {
  const visited = createNumericMap(false);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (visited[row][col] || terrain[row][col] !== tileType) continue;
      const stack = [[row, col]];
      const cells = [];
      visited[row][col] = true;
      while (stack.length > 0) {
        const [r, c] = stack.pop();
        cells.push([r, c]);
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
          if (!isInsideMap(nr, nc) || visited[nr][nc] || terrain[nr][nc] !== tileType) return;
          visited[nr][nc] = true;
          stack.push([nr, nc]);
        });
      }
      if (cells.length < minSize) {
        cells.forEach(([r, c]) => {
          terrain[r][c] = replacement;
          heights[r][c] = 0;
        });
      }
    }
  }
}

function addBeachesBySlope(terrain, heights, field, config) {
  const beachTiles = [];
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    for (let col = 1; col < MAP_WIDTH - 1; col++) {
      if (terrain[row][col] !== GROUND && terrain[row][col] !== DIRT && !(terrain[row][col] === HILL && heights[row][col] <= 1)) continue;
      if (!hasCardinalTerrain(terrain, row, col, WATER)) continue;
      const slope = localFieldSlope(field, row, col);
      if (slope < 0.50 && field[row][col] < config.seaLevel + 1.10) {
        beachTiles.push([row, col]);
      }
    }
  }
  beachTiles.forEach(([row, col]) => {
    terrain[row][col] = BEACH;
    heights[row][col] = 0;
  });

  const cornerInfillTiles = [];
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    for (let col = 1; col < MAP_WIDTH - 1; col++) {
      if (terrain[row][col] !== GROUND && terrain[row][col] !== DIRT && !(terrain[row][col] === HILL && heights[row][col] <= 1)) continue;
      if (hasCardinalTerrain(terrain, row, col, WATER)) continue;
      const slope = localFieldSlope(field, row, col);
      if (slope >= 0.62 || field[row][col] >= config.seaLevel + 1.25) continue;
      if (!hasBeachCornerInfillPattern(terrain, row, col)) continue;
      cornerInfillTiles.push([row, col]);
    }
  }

  cornerInfillTiles.forEach(([row, col]) => {
    terrain[row][col] = BEACH;
    heights[row][col] = 0;
  });
}

function hasBeachCornerInfillPattern(terrain, row, col) {
  const nBeach = terrain[row - 1][col] === BEACH;
  const eBeach = terrain[row][col + 1] === BEACH;
  const sBeach = terrain[row + 1][col] === BEACH;
  const wBeach = terrain[row][col - 1] === BEACH;

  const neWater = terrain[row - 1][col + 1] === WATER;
  const seWater = terrain[row + 1][col + 1] === WATER;
  const swWater = terrain[row + 1][col - 1] === WATER;
  const nwWater = terrain[row - 1][col - 1] === WATER;

  if (nBeach && eBeach && neWater) return true;
  if (eBeach && sBeach && seWater) return true;
  if (sBeach && wBeach && swWater) return true;
  if (wBeach && nBeach && nwWater) return true;

  return false;
}

function fbmNoise(x, y, random, octaves = 4, lacunarity = 2, gain = 0.5) {
  let frequency = 1;
  let amplitude = 1;
  let total = 0;
  let max = 0;
  for (let octave = 0; octave < octaves; octave++) {
    total += valueNoise(x * frequency + octave * 37.7, y * frequency - octave * 19.3, random) * amplitude;
    max += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return max > 0 ? total / max : 0;
}

function domainWarpPoint(col, row, random, strength = 16) {
  const wx = (fbmNoise(col * 0.012 + 21, row * 0.012 - 17, random, 3, 2, 0.5) - 0.5) * strength;
  const wy = (fbmNoise(col * 0.012 - 43, row * 0.012 + 31, random, 3, 2, 0.5) - 0.5) * strength;
  return { col: col + wx, row: row + wy, x: col + wx, y: row + wy };
}

function makeMeanderingPolyline(start, end, random, pointCount = 5, jitter = 24) {
  const points = [];
  for (let i = 0; i < pointCount; i++) {
    const t = i / (pointCount - 1);
    const row = lerp(start.row, end.row, t);
    const col = lerp(start.col, end.col, t);
    const bend = Math.sin(t * Math.PI) * jitter;
    const angle = Math.atan2(end.row - start.row, end.col - start.col) + Math.PI / 2;
    points.push({
      row: Math.max(0, Math.min(MAP_HEIGHT - 1, row + Math.sin(angle) * (random() - 0.5) * bend * 2)),
      col: Math.max(0, Math.min(MAP_WIDTH - 1, col + Math.cos(angle) * (random() - 0.5) * bend * 2)),
    });
  }
  return points;
}

function distanceToPolyline(row, col, points) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i++) {
    best = Math.min(best, distanceToSegment(row, col, points[i], points[i + 1]));
  }
  return best;
}

function distanceToSegment(row, col, a, b) {
  const vx = b.col - a.col;
  const vy = b.row - a.row;
  const wx = col - a.col;
  const wy = row - a.row;
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const px = a.col + vx * t;
  const py = a.row + vy * t;
  return Math.hypot(col - px, row - py);
}

function edgeRelativeCoords(row, col, edge) {
  if (edge === 0) return { inward: row, along: col };
  if (edge === 1) return { inward: MAP_WIDTH - 1 - col, along: row };
  if (edge === 2) return { inward: MAP_HEIGHT - 1 - row, along: MAP_WIDTH - 1 - col };
  return { inward: col, along: MAP_HEIGHT - 1 - row };
}

function edgeToMapCoords(inward, along, edge) {
  if (edge === 0) return { row: inward, col: along };
  if (edge === 1) return { row: along, col: MAP_WIDTH - 1 - inward };
  if (edge === 2) return { row: MAP_HEIGHT - 1 - inward, col: MAP_WIDTH - 1 - along };
  return { row: MAP_HEIGHT - 1 - along, col: inward };
}

function distanceToPreferredDrainEdge(row, col, edge) {
  if (edge === 0) return row;
  if (edge === 1) return MAP_WIDTH - 1 - col;
  if (edge === 2) return MAP_HEIGHT - 1 - row;
  return col;
}

function localFieldSlope(field, row, col) {
  const center = field[row]?.[col] ?? 0;
  const samples = [
    field[row - 1]?.[col] ?? center,
    field[row + 1]?.[col] ?? center,
    field[row]?.[col - 1] ?? center,
    field[row]?.[col + 1] ?? center,
  ];
  return samples.reduce((max, value) => Math.max(max, Math.abs(center - value)), 0);
}

function smoothHillMask(terrain, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    const next = terrain.map((r) => r.slice());

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const current = terrain[row][col];
        const hillNeighbors = getTerrainAdjacentEdges(terrain, row, col, HILL).length;

        // Remove single-pixel hill noise and fill tiny cardinal gaps to keep
        // contour lines coherent for the limited hill tileset.
        if (current === HILL && hillNeighbors <= 1) {
          next[row][col] = GROUND;
        } else if (current === GROUND && hillNeighbors >= 3) {
          next[row][col] = HILL;
        }
      }
    }

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        terrain[row][col] = next[row][col];
      }
    }
  }
}

function normalizeHillTerrain(terrain, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    const next = terrain.map((r) => r.slice());
    let changed = false;

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (terrain[row][col] !== HILL) continue;

        const connected = getTerrainAdjacentEdges(terrain, row, col, HILL)
          .sort((a, b) => 'nesw'.indexOf(a) - 'nesw'.indexOf(b));
        const open = ['n', 'e', 's', 'w'].filter((d) => !connected.includes(d));

        let supported = false;
        if (open.length === 0 || open.length === 1) {
          supported = true;
        } else if (open.length === 2) {
          const pair = open.join('');
          supported = pair === 'ne' || pair === 'es' || pair === 'sw' || pair === 'nw';
        }

        if (!supported) {
          next[row][col] = GROUND;
          changed = true;
        }
      }
    }

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        terrain[row][col] = next[row][col];
      }
    }

    if (!changed) break;
  }
}

function smoothHillHeights(terrain, heights, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    const next = heights.map((r) => r.slice());
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (terrain[row][col] !== HILL) {
          next[row][col] = 0;
          continue;
        }

        const samples = [heights[row][col]];
        if (row > 0 && terrain[row - 1][col] === HILL) samples.push(heights[row - 1][col]);
        if (row < MAP_HEIGHT - 1 && terrain[row + 1][col] === HILL) samples.push(heights[row + 1][col]);
        if (col > 0 && terrain[row][col - 1] === HILL) samples.push(heights[row][col - 1]);
        if (col < MAP_WIDTH - 1 && terrain[row][col + 1] === HILL) samples.push(heights[row][col + 1]);
        const avg = samples.reduce((sum, v) => sum + v, 0) / samples.length;
        next[row][col] = Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, avg));
      }
    }

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        heights[row][col] = next[row][col];
      }
    }
  }
}

function quantizeHillHeights(terrain, heights) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (terrain[row][col] !== HILL) {
        heights[row][col] = 0;
        continue;
      }
      heights[row][col] = Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, Math.round(heights[row][col])));
    }
  }
}

function enforceGlobalSlopeConstraints(terrain, heights, maxDelta = 1, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (terrain[row][col] !== HILL) {
          heights[row][col] = 0;
          continue;
        }

        const current = heights[row][col];
        const neighbors = [
          [row - 1, col],
          [row + 1, col],
          [row, col - 1],
          [row, col + 1],
        ];

        neighbors.forEach(([nr, nc]) => {
          if (!isInsideMap(nr, nc)) return;
          const neighbor = heights[nr][nc];
          const delta = current - neighbor;
          if (delta > maxDelta) {
            heights[row][col] = neighbor + maxDelta;
            changed = true;
          }
        });

        heights[row][col] = Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, heights[row][col]));
      }
    }

    if (!changed) break;
  }
}

function enforceLocalSlopeConstraints(centerRow, centerCol, radius = 2, passes = 1, maxDelta = 1) {
  for (let pass = 0; pass < passes; pass++) {
    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        if (!isInsideMap(row, col)) continue;

        if (mapData[row][col] !== HILL) {
          if (mapData[row][col] === ROAD) continue;
          heightMap[row][col] = 0;
          continue;
        }

        const current = getTileHeight(row, col);
        const neighbors = [
          [row - 1, col],
          [row + 1, col],
          [row, col - 1],
          [row, col + 1],
        ];

        let clamped = current;
        neighbors.forEach(([nr, nc]) => {
          if (!isInsideMap(nr, nc)) return;
          if (mapData[nr][nc] !== HILL) return;
          const neighborHeight = getTileHeight(nr, nc);
          if (clamped > neighborHeight + maxDelta) {
            clamped = neighborHeight + maxDelta;
          }
        });

        heightMap[row][col] = Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, clamped));
      }
    }
  }
}

function normalizeUnsupportedHillTopologiesGlobal(terrain, heights, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (terrain[row][col] !== HILL) continue;
        const current = heights[row][col];
        if (current <= 0) continue;

        const neighbors = [
          row > 0 ? heights[row - 1][col] : 0,
          col < MAP_WIDTH - 1 ? heights[row][col + 1] : 0,
          row < MAP_HEIGHT - 1 ? heights[row + 1][col] : 0,
          col > 0 ? heights[row][col - 1] : 0,
        ];

        const lowerDirs = ['n', 'e', 's', 'w'].filter((dir, index) => neighbors[index] < current);
        const hasOppositePair = (lowerDirs.length === 2) && areOppositeDirs(lowerDirs[0], lowerDirs[1]);

        if (lowerDirs.length >= 3 || hasOppositePair) {
          // Step down gradually instead of snapping to neighbor max,
          // which tends to create large flat "table" plateaus.
          const target = Math.max(1, current - 1);
          if (target < current) {
            heights[row][col] = target;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

function normalizeUnsupportedHillTopologiesLocal(centerRow, centerCol, radius = 2, passes = 1) {
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        if (!isInsideMap(row, col)) continue;
        if (mapData[row][col] !== HILL) continue;
        const current = getTileHeight(row, col);
        if (current <= 0) continue;

        const neighbors = [
          row > 0 ? (mapData[row - 1][col] === HILL ? getTileHeight(row - 1, col) : null) : null,
          col < MAP_WIDTH - 1 ? (mapData[row][col + 1] === HILL ? getTileHeight(row, col + 1) : null) : null,
          row < MAP_HEIGHT - 1 ? (mapData[row + 1][col] === HILL ? getTileHeight(row + 1, col) : null) : null,
          col > 0 ? (mapData[row][col - 1] === HILL ? getTileHeight(row, col - 1) : null) : null,
        ];

        const lowerDirs = ['n', 'e', 's', 'w'].filter((dir, index) => neighbors[index] !== null && neighbors[index] < current);
        const hasOppositePair = (lowerDirs.length === 2) && areOppositeDirs(lowerDirs[0], lowerDirs[1]);

        if (lowerDirs.length >= 3 || hasOppositePair) {
          // Keep local editing behavior consistent with world generation:
          // reduce one level per pass to avoid abrupt flat rims.
          const target = Math.max(1, current - 1);
          if (target < current) {
            heightMap[row][col] = target;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

function getTerrainAdjacentEdges(terrain, row, col, terrainType) {
  const ne = row > 0 && terrain[row - 1][col] === terrainType;
  const se = col < MAP_WIDTH - 1 && terrain[row][col + 1] === terrainType;
  const sw = row < MAP_HEIGHT - 1 && terrain[row + 1][col] === terrainType;
  const nw = col > 0 && terrain[row][col - 1] === terrainType;

  return [
    ['n', ne],
    ['e', se],
    ['s', sw],
    ['w', nw],
  ].filter(([, matches]) => matches).map(([direction]) => direction);
}

function flattenMapBorder(terrain, heights, margin) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (row < margin || row >= MAP_HEIGHT - margin || col < margin || col >= MAP_WIDTH - margin) {
        if (terrain[row][col] === HILL) terrain[row][col] = GROUND;
        heights[row][col] = 0;
      }
    }
  }
}


function carveSeas(terrain, random) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const edgeDistance = Math.min(row, col, MAP_HEIGHT - 1 - row, MAP_WIDTH - 1 - col);
      const shoreNoise = valueNoise(col * 0.045, row * 0.045, random) * 18;
      const bayNoise = valueNoise(col * 0.018 + 60, row * 0.018 - 25, random) * 38;
      const seaDepth = 10 + shoreNoise + Math.max(0, bayNoise - 18);

      if (edgeDistance < seaDepth) {
        terrain[row][col] = WATER;
      }
    }
  }
}

function carveRivers(terrain, random) {
  const riverCount = 5 + Math.floor(random() * 4);

  for (let river = 0; river < riverCount; river++) {
    let row = 32 + Math.floor(random() * (MAP_HEIGHT - 64));
    let col = 32 + Math.floor(random() * (MAP_WIDTH - 64));
    let direction = random() * Math.PI * 2;

    for (let step = 0; step < MAP_WIDTH * 2; step++) {
      paintCircle(terrain, row, col, WATER, random() < 0.18 ? 2 : 1);

      if (isNearMapEdge(row, col)) break;

      const nearestEdgeCol = col < MAP_WIDTH / 2 ? 0 : MAP_WIDTH - 1;
      const nearestEdgeRow = row < MAP_HEIGHT / 2 ? 0 : MAP_HEIGHT - 1;
      const edgeTargetCol = Math.abs(col - nearestEdgeCol) < Math.abs(row - nearestEdgeRow) ? nearestEdgeCol : col;
      const edgeTargetRow = edgeTargetCol === col ? nearestEdgeRow : row;
      const targetAngle = Math.atan2(edgeTargetRow - row, edgeTargetCol - col);
      direction = rotateAngleToward(direction, targetAngle, 0.08);
      direction += (random() - 0.5) * 0.7;

      col += Math.round(Math.cos(direction));
      row += Math.round(Math.sin(direction));

      if (!isInsideMap(row, col)) break;
    }
  }
}

function addBeaches(terrain) {
  const beachTiles = [];

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (terrain[row][col] !== GROUND) continue;
      if (hasCardinalTerrain(terrain, row, col, WATER)) {
        beachTiles.push([row, col]);
      }
    }
  }

  beachTiles.forEach(([row, col]) => {
    terrain[row][col] = BEACH;
  });
}

function addPatches(terrain, random, tileType, patchCount, minRadius, maxRadius) {
  for (let patch = 0; patch < patchCount; patch++) {
    const centerRow = Math.floor(random() * MAP_HEIGHT);
    const centerCol = Math.floor(random() * MAP_WIDTH);
    const radiusRow = minRadius + Math.floor(random() * (maxRadius - minRadius));
    const radiusCol = minRadius + Math.floor(random() * (maxRadius - minRadius));

    for (let row = centerRow - radiusRow; row <= centerRow + radiusRow; row++) {
      for (let col = centerCol - radiusCol; col <= centerCol + radiusCol; col++) {
        if (!isInsideMap(row, col)) continue;
        if (terrain[row][col] !== GROUND) continue;

        const dy = (row - centerRow) / radiusRow;
        const dx = (col - centerCol) / radiusCol;
        if (dx * dx + dy * dy < 1 && random() > 0.15) {
          terrain[row][col] = tileType;
        }
      }
    }
  }
}

function paintCircle(terrain, row, col, tileType, radius) {
  for (let y = row - radius; y <= row + radius; y++) {
    for (let x = col - radius; x <= col + radius; x++) {
      if (!isInsideMap(y, x)) continue;
      if ((y - row) ** 2 + (x - col) ** 2 <= radius ** 2) {
        terrain[y][x] = tileType;
      }
    }
  }
}

function isNearMapEdge(row, col) {
  return row < 8 || col < 8 || row >= MAP_HEIGHT - 8 || col >= MAP_WIDTH - 8;
}

function hasCardinalTerrain(terrain, row, col, tileType) {
  return [
    [row - 1, col],
    [row, col + 1],
    [row + 1, col],
    [row, col - 1],
  ].some(([tileRow, tileCol]) => (
    isInsideMap(tileRow, tileCol) && terrain[tileRow][tileCol] === tileType
  ));
}

function valueNoise(x, y, random) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smoothStep(x - x0);
  const sy = smoothStep(y - y0);
  const n00 = hashNoise(x0, y0, random.seed);
  const n10 = hashNoise(x0 + 1, y0, random.seed);
  const n01 = hashNoise(x0, y0 + 1, random.seed);
  const n11 = hashNoise(x0 + 1, y0 + 1, random.seed);
  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function rotateAngleToward(currentAngle, targetAngle, turnRate) {
  const difference = Math.atan2(
    Math.sin(targetAngle - currentAngle),
    Math.cos(targetAngle - currentAngle),
  );
  return currentAngle + Math.max(-turnRate, Math.min(turnRate, difference));
}

function hashNoise(x, y, seed) {
  let hash = x * 374761393 + y * 668265263 + seed;
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function createRandom(seedText) {
  const seedString = String(seedText ?? '');
  let hash = 2166136261;
  for (let index = 0; index < seedString.length; index++) {
    hash ^= seedString.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let state = hash >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  random.seed = state;
  return random;
}

// ── Tile-key direction rotation ───────────────────────────────────────────────
// All tile-key functions compute adjacency from logical mapData neighbours
// (n=row-1, e=col+1, s=row+1, w=col-1) and embed those compass letters in the
// key name.  When the view is rotated those letters must be rotated too so that
// the correct texture is chosen.  One CW step maps n→e→s→w→n.

function rotateTileKey(key, steps) {
  steps = ((steps % 4) + 4) % 4;
  if (steps === 0) return key;
  // Apply one step at a time (keeps the logic simple and fast enough for 4 steps max)
  if (steps > 1) return rotateTileKey(rotateTileKey(key, 1), steps - 1);

  const rotDir = { n: 'e', e: 's', s: 'w', w: 'n' };
  const d = (c) => rotDir[c] ?? c;

  // Straight roads swap orientation each 90°
  if (key === 'road_straight_v') return 'road_straight_h';
  if (key === 'road_straight_h') return 'road_straight_v';
  if (key === 'road_bridge_v') return 'road_bridge_h';
  if (key === 'road_bridge_h') return 'road_bridge_v';

  // Patterns: PREFIX_edge_X  →  PREFIX_edge_{d(X)}
  const edgeM = key.match(/^(.+_edge)_([nesw])$/);
  if (edgeM) return `${edgeM[1]}_${d(edgeM[2])}`;

  // Patterns: PREFIX_corner_XY  →  PREFIX_corner_{canonical rotated pair}
  // Canonical names: ne (n+e→NE), se (e+s→SE), sw (s+w→SW), nw (n+w→NW)
  const cornerM = key.match(/^(.+_corner)_([nesw]{2})$/);
  if (cornerM) {
    const a = d(cornerM[2][0]);
    const b = d(cornerM[2][1]);
    const canon = { ne:'ne', es:'se', sw:'sw', nw:'nw', se:'se', en:'ne', ws:'sw', wn:'nw' };
    return `${cornerM[1]}_${canon[a + b] ?? (a + b)}`;
  }

  // Patterns: PREFIX_t_X  →  PREFIX_t_{d(X)}
  const tM = key.match(/^(.+_t)_([nesw])$/);
  if (tM) return `${tM[1]}_${d(tM[2])}`;

  // Hill-road variants use the same compass rotation rules.
  const hillM = key.match(/^(.+_hill2?)_([nesw])$/);
  if (hillM) return `${hillM[1]}_${d(hillM[2])}`;

  // Patterns: PREFIX_end_X  →  PREFIX_end_{d(X)}
  const endM = key.match(/^(.+_end)_([nesw])$/);
  if (endM) return `${endM[1]}_${d(endM[2])}`;

  // Symmetric tiles (cross, full, plateau, isolated) — unchanged
  return key;
}

function getTileKey(row, col) {
  const tileType = mapData[row][col];
  const hasHeight = getTileHeight(row, col) > 0;
  let key;
  if      (tileType === ROAD)  key = getRoadKey(row, col);
  else if (tileType === DIRT)  key = 'dirt_full';
  else if (tileType === BEACH) key = getBeachKey(row, col);
  else if (tileType === WATER) key = getWaterKey(row, col);
  else if (hasHeight)          key = getHillKey(row, col);
  else                         key = 'ground_full';
  return rotateTileKey(key, mapRotation);
}

function isInsideMap(row, col) {
  return col >= 0 && col < MAP_WIDTH && row >= 0 && row < MAP_HEIGHT;
}

// Convert isometric grid coordinates (col, row) to screen coordinates.
// Applies the current mapRotation so that the map can be viewed from
// 4 different angles (0 / 90° CW / 180° / 270° CW).
function isoToScreen(col, row) {
  let vizCol = col, vizRow = row;
  if (mapRotation === 1) {
    vizCol = MAP_HEIGHT - 1 - row;
    vizRow = col;
  } else if (mapRotation === 2) {
    vizCol = MAP_WIDTH  - 1 - col;
    vizRow = MAP_HEIGHT - 1 - row;
  } else if (mapRotation === 3) {
    vizCol = row;
    vizRow = MAP_WIDTH - 1 - col;
  }
  return {
    x: (vizCol - vizRow) * (TILE_WIDTH / 2) + ORIGIN_X,
    y: (vizCol + vizRow) * (TILE_HEIGHT / 2),
  };
}

// Convert screen coordinates back into isometric grid coordinates,
// inverting the rotation applied by isoToScreen.
function screenToIso(x, y) {
  const vizCol = ((x - ORIGIN_X) / (TILE_WIDTH / 2) + y / (TILE_HEIGHT / 2)) / 2;
  const vizRow = (y / (TILE_HEIGHT / 2) - (x - ORIGIN_X) / (TILE_WIDTH / 2)) / 2;
  if (mapRotation === 0) return { x: vizCol, y: vizRow };
  if (mapRotation === 1) return { x: vizRow,              y: MAP_HEIGHT - 1 - vizCol };
  if (mapRotation === 2) return { x: MAP_WIDTH - 1 - vizCol, y: MAP_HEIGHT - 1 - vizRow };
  /* rotation 3 */       return { x: MAP_WIDTH - 1 - vizRow, y: vizCol };
}

// Determine which road tile to use based on neighbouring roads
function getRoadKey(row, col) {
  if (isBridgeTile(row, col)) {
    const bridgeValue = normalizeBridgeMapValue(bridgeMap[row][col]);
    if (bridgeValue === 'deck:row') return 'road_bridge_h';
    if (bridgeValue === 'deck:col') return 'road_bridge_v';
    const rampMatch = bridgeValue?.match(/^ramp:([nesw])$/);
    if (rampMatch) return `road_hill2_${getOppositeDirection(rampMatch[1])}`;
  }

  const slopeKey = getRoadSlopeKey(row, col);
  if (slopeKey === 'road_slope_corner') return 'road_isolated';
  if (slopeKey) return slopeKey;

  // Determine adjacency on diagonal edges (NE, SE, SW, NW).  The 'north' tile in mapData corresponds
  // to the NE edge of the isometric tile, 'east' corresponds to SE, 'south' to SW and 'west' to NW.
  const ne = row > 0 && isRoadLikeTile(row - 1, col);
  const se = col < MAP_WIDTH - 1 && isRoadLikeTile(row, col + 1);
  const sw = row < MAP_HEIGHT - 1 && isRoadLikeTile(row + 1, col);
  const nw = col > 0 && isRoadLikeTile(row, col - 1);
  // Cross intersection (all four sides connect)
  if (ne && se && sw && nw) return 'road_cross';
  // Straight roads (two opposite sides connect)
  if (ne && sw && !se && !nw) return 'road_straight_v';
  if (se && nw && !ne && !sw) return 'road_straight_h';
  // Corner roads (two adjacent sides connect)
  if (ne && se && !sw && !nw) return 'road_corner_ne';
  if (se && sw && !nw && !ne) return 'road_corner_se';
  if (sw && nw && !ne && !se) return 'road_corner_sw';
  if (nw && ne && !se && !sw) return 'road_corner_nw';
  // T intersections (three sides connect).  Missing side dictates which T variant to use.
  if (!sw && ne && se && nw) return 'road_t_n'; // missing SW side
  if (!nw && ne && se && sw) return 'road_t_e'; // missing NW side
  if (!ne && se && sw && nw) return 'road_t_s'; // missing NE side
  if (!se && ne && sw && nw) return 'road_t_w'; // missing SE side
  if (ne) return 'road_end_s';
  if (se) return 'road_end_w';
  if (sw) return 'road_end_n';
  if (nw) return 'road_end_e';
  return 'road_isolated';
}

function getRoadSlopeKey(row, col) {
  if (getTileHeight(row, col) <= 0) return null;

  const openEdges = getHillOpenEdges(row, col);
  if (openEdges.length === 0) return null;

  const normalized = normalizeHillOpenEdges(row, col, openEdges);
  if (normalized.length === 2 && !areOppositeDirs(normalized[0], normalized[1])) {
    return 'road_slope_corner';
  }

  if (openEdges.length === 2 && areOppositeDirs(openEdges[0], openEdges[1])) {
    const axisDir = openEdges.includes('n') ? 'n' : 'e';
    return `road_hill2_${axisDir}`;
  }

  return `road_hill_${normalized[0]}`;
}

function getBeachKey(row, col) {
  return getShorelineKey(row, col);
}

function getWaterKey(row, col) {
  return getWaterPatternKey(row, col);
}

function getHillKey(row, col) {
  const openEdges = normalizeHillOpenEdges(row, col, getHillOpenEdges(row, col));
  return getEdgePatternKey(openEdges, 'hill', 'hill_plateau', 'hill_plateau');
}

function normalizeHillOpenEdges(row, col, openEdges) {
  if (openEdges.length <= 1) return openEdges;

  if (openEdges.length === 2) {
    const pair = openEdges.slice().sort((a, b) => 'nesw'.indexOf(a) - 'nesw'.indexOf(b)).join('');
    if (pair === 'ne' || pair === 'es' || pair === 'sw' || pair === 'nw') {
      return openEdges;
    }
  }

  const currentHeight = getTileHeight(row, col);
  const dropByDir = {
    n: currentHeight - (row > 0 ? getTileHeight(row - 1, col) : 0),
    e: currentHeight - (col < MAP_WIDTH - 1 ? getTileHeight(row, col + 1) : 0),
    s: currentHeight - (row < MAP_HEIGHT - 1 ? getTileHeight(row + 1, col) : 0),
    w: currentHeight - (col > 0 ? getTileHeight(row, col - 1) : 0),
  };

  const sorted = openEdges.slice().sort((a, b) => dropByDir[b] - dropByDir[a]);

  // 3/4 open-edge topologies are not representable with the current tileset.
  // Degrade to a single dominant edge to avoid random corner spikes.
  if (sorted.length >= 3) {
    return [sorted[0]];
  }

  if (sorted.length >= 2) {
    const best = sorted[0];
    const adjacent = sorted.find((dir) => dir !== best && !areOppositeDirs(best, dir));
    if (adjacent) return [best, adjacent].sort((a, b) => 'nesw'.indexOf(a) - 'nesw'.indexOf(b));
  }

  return [sorted[0]];
}

function areOppositeDirs(a, b) {
  return (a === 'n' && b === 's') || (a === 's' && b === 'n') || (a === 'e' && b === 'w') || (a === 'w' && b === 'e');
}

function getHillOpenEdges(row, col) {
  const currentHeight = getTileHeight(row, col);
  if (currentHeight <= 0) return ['n', 'e', 's', 'w'];

  const neighborHeight = {
    n: row > 0 ? getTileHeight(row - 1, col) : 0,
    e: col < MAP_WIDTH - 1 ? getTileHeight(row, col + 1) : 0,
    s: row < MAP_HEIGHT - 1 ? getTileHeight(row + 1, col) : 0,
    w: col > 0 ? getTileHeight(row, col - 1) : 0,
  };

  return ['n', 'e', 's', 'w'].filter((dir) => neighborHeight[dir] < currentHeight);
}

function getWaterPatternKey(row, col) {
  if (isOnMapEdge(row, col)) return 'water_full';
  const connectedEdges = getAdjacentEdges(row, col, WATER)
    .concat(getAdjacentEdges(row, col, BEACH));
  const openEdges = ['n', 'e', 's', 'w'].filter((direction) => !connectedEdges.includes(direction));
  return getEdgePatternKey(openEdges, 'water', 'water_full');
}

function getTerrainPatternKey(row, col, terrainType, prefix, fullKey = `${prefix}_full`) {
  const openEdges = getOpenEdges(row, col, terrainType);
  return getEdgePatternKey(openEdges, prefix, fullKey);
}

function getShorelineKey(row, col) {
  if (isOnMapEdge(row, col)) return 'beach_full';
  const waterEdges = getAdjacentEdges(row, col, WATER);
  if (waterEdges.length === 2) {
    const waterCorner = getCornerPairSuffix(waterEdges);
    if (waterCorner && isWaterDiagonalForCorner(row, col, waterCorner)) {
      return `beach_corner_water_${rotateCornerSuffixCCW(waterCorner)}`;
    }
  }
  const beachEdges = getAdjacentEdges(row, col, BEACH);
  const shorelineEdges = waterEdges.length > 0 ? waterEdges : getOppositeEdges(beachEdges);
  if (shorelineEdges.length === 2) {
    const corner = getCornerPairSuffix(shorelineEdges);
    if (corner) return `beach_corner_${rotateCornerSuffix180(corner)}`;
  }
  return getEdgePatternKey(shorelineEdges, 'beach', 'beach_full');
}

function getAdjacentEdges(row, col, terrainType) {
  const ne = row > 0 && mapData[row - 1][col] === terrainType;
  const se = col < MAP_WIDTH - 1 && mapData[row][col + 1] === terrainType;
  const sw = row < MAP_HEIGHT - 1 && mapData[row + 1][col] === terrainType;
  const nw = col > 0 && mapData[row][col - 1] === terrainType;

  return [
    ['n', ne],
    ['e', se],
    ['s', sw],
    ['w', nw],
  ].filter(([, matches]) => matches).map(([direction]) => direction);
}

function getOpenEdges(row, col, terrainType) {
  const connectedEdges = getAdjacentEdges(row, col, terrainType);
  return ['n', 'e', 's', 'w'].filter((direction) => !connectedEdges.includes(direction));
}

function getOppositeEdges(edges) {
  const opposite = { n: 's', e: 'w', s: 'n', w: 'e' };
  return edges.map((edge) => opposite[edge]);
}

function getCornerPairSuffix(edges) {
  if (!Array.isArray(edges) || edges.length !== 2) return null;
  const pair = edges
    .slice()
    .sort((a, b) => 'nesw'.indexOf(a) - 'nesw'.indexOf(b))
    .join('');
  if (pair === 'ne') return 'ne';
  if (pair === 'es') return 'se';
  if (pair === 'sw') return 'sw';
  if (pair === 'nw') return 'nw';
  return null;
}

function rotateCornerSuffixCCW(suffix) {
  if (suffix === 'ne') return 'nw';
  if (suffix === 'se') return 'ne';
  if (suffix === 'sw') return 'se';
  if (suffix === 'nw') return 'sw';
  return suffix;
}

function rotateCornerSuffix180(suffix) {
  if (suffix === 'ne') return 'sw';
  if (suffix === 'se') return 'nw';
  if (suffix === 'sw') return 'ne';
  if (suffix === 'nw') return 'se';
  return suffix;
}

function isWaterDiagonalForCorner(row, col, cornerSuffix) {
  if (cornerSuffix === 'ne') return isTerrainType(row - 1, col + 1, WATER);
  if (cornerSuffix === 'se') return isTerrainType(row + 1, col + 1, WATER);
  if (cornerSuffix === 'sw') return isTerrainType(row + 1, col - 1, WATER);
  if (cornerSuffix === 'nw') return isTerrainType(row - 1, col - 1, WATER);
  return false;
}

function isTerrainType(row, col, terrainType) {
  return isInsideMap(row, col) && mapData[row][col] === terrainType;
}

function isOnMapEdge(row, col) {
  return row === 0 || col === 0 || row === MAP_HEIGHT - 1 || col === MAP_WIDTH - 1;
}

function getMixedCornerKey(row, col, edges, prefix) {
  const candidates = [
    { suffix: 'ne', directions: ['n', 'e'], samples: [[row - 1, col], [row, col + 1], [row - 1, col + 1]] },
    { suffix: 'se', directions: ['e', 's'], samples: [[row, col + 1], [row + 1, col], [row + 1, col + 1]] },
    { suffix: 'sw', directions: ['s', 'w'], samples: [[row + 1, col], [row, col - 1], [row + 1, col - 1]] },
    { suffix: 'nw', directions: ['w', 'n'], samples: [[row, col - 1], [row - 1, col], [row - 1, col - 1]] },
  ];

  let bestSuffix = null;
  let bestScore = -1;

  candidates.forEach((candidate) => {
    if (!candidate.directions.every((direction) => edges.includes(direction))) return;

    const score = candidate.samples.reduce((total, [sampleRow, sampleCol]) => {
      if (!isInsideMap(sampleRow, sampleCol)) return total;
      const terrain = mapData[sampleRow][sampleCol];
      if (terrain === WATER || terrain === BEACH) return total + 1;
      return total;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestSuffix = candidate.suffix;
    }
  });

  return bestSuffix ? `${prefix}_${bestSuffix}` : null;
}

function getEdgePatternKey(edges, prefix, fullKey, fallbackKey = fullKey) {
  if (edges.length === 0) return fullKey;
  if (edges.length === 1) return `${prefix}_edge_${edges[0]}`;

  if (edges.length === 2) {
    const edgePair = edges.join('');
    if (edgePair === 'ne') return `${prefix}_corner_ne`;
    if (edgePair === 'es') return `${prefix}_corner_se`;
    if (edgePair === 'sw') return `${prefix}_corner_sw`;
    if (edgePair === 'nw') return `${prefix}_corner_nw`;
  }

  return fallbackKey;
}

// ── Tile debug tooltip ────────────────────────────────────────────────────────

function showTileDebug(scene, pointer) {
  const el = document.getElementById('tile-debug');
  if (!el) return;

  // The inspect tool is click-to-show only. Keep this legacy hover tooltip
  // disabled so the persistent inspect panel is the single source of truth.
  el.style.display = 'none';
  return;

  // Tile info tooltip is only active in ? (inspect) mode
  if (selectedTool !== 'inspect') { el.style.display = 'none'; return; }

  const tile = pointerToTile(scene, pointer);
  if (!tile) { el.style.display = 'none'; return; }

  const { row, col } = tile;
  const id      = getTileId(row, col);
  const terrain = mapData[row][col];
  const zone    = zoneMap[row]?.[col] ?? ZONE_NONE;
  const powered = !!powerMap[row]?.[col];
  const hasPowerLine = powerLineSet.has(id);
  const hasRoad = hasAdjacentRoad(row, col);
  const hasBldg = scene.buildingSprites.has(id);

  // ── Building-data lookup with two fallbacks ──────────────────────────────
  // 1. Exact tile (fast path)
  let bData = buildingData[id];

  // 2. Multi-tile anchor fallback: buildingData is stored at the anchor tile
  //    (sprite.mapRow / sprite.mapCol) but the sprite is registered at every
  //    footprint cell — so look up the anchor when the hovered cell is a
  //    non-anchor footprint cell.
  if (!bData && hasBldg) {
    const s = scene.buildingSprites.get(id);
    if (s) bData = buildingData[getTileId(s.mapRow, s.mapCol)];
  }

  // 3. Proximity fallback — ANY building type:
  //    Tall sprites (power plants, high-rises, fire stations…) extend 3–5 tile-heights
  //    above their logical 1×1 footprint.  When hovering over the upper body,
  //    pointerToTile returns a tile N-W of the actual base — up to ~5 Manhattan steps
  //    away for the tallest buildings.
  //    Two search paths:
  //      A) via buildingSprites (every footprint tile → sprite anchor → buildingData)
  //      B) direct buildingData lookup (catches anchors even if sprite registration differs)
  if (!bData) {
    let bestDist = Infinity, bestBd = null;
    // Buildings extend NW visually; footprint is likely SE of the cursor.
    // Scan −2..+7 to cover both directions plus rotation variants.
    for (let dr = -2; dr <= 7; dr++) {
      for (let dc = -2; dc <= 7; dc++) {
        if (!isInsideMap(row + dr, col + dc)) continue;
        const nid  = getTileId(row + dr, col + dc);
        const dist = Math.abs(dr) + Math.abs(dc);
        if (dist >= bestDist) continue;   // prune — no point reading further

        // Path A: via buildingSprites → anchor → buildingData
        const spr = scene.buildingSprites.get(nid);
        if (spr) {
          const bd = buildingData[getTileId(spr.mapRow, spr.mapCol)];
          if (bd) { bestDist = dist; bestBd = bd; continue; }
        }
        // Path B: direct buildingData at this tile (anchor tile only)
        const bd = buildingData[nid];
        if (bd) { bestDist = dist; bestBd = bd; }
      }
    }
    // Accept any building within 6 Manhattan steps — covers the tallest sprites
    if (bestBd && bestDist <= 6) bData = bestBd;
  }

  const TERRAIN_NAMES = ['?', 'Ground', 'Road', 'Dirt', 'Beach', 'Water', 'Hill'];
  const ZONE_NAMES    = { [ZONE_NONE]: null, [ZONE_RES]: 'Residential', [ZONE_COM]: 'Commercial', [ZONE_IND]: 'Industrial' };
  const ZONE_COLORS   = { [ZONE_RES]: '#66ff88', [ZONE_COM]: '#6699ff', [ZONE_IND]: '#ffcc33' };

  const density = zoneDensityMap[row]?.[col] ?? 1;

  const DENSITY_NAMES = { 1: 'Low Density', 2: 'Med Density', 3: 'High Density' };
  const DENSITY_SHORT = { 1: 'R1', 2: 'R2', 3: 'R3' };
  const zoneShort = zone === ZONE_RES ? 'R' : zone === ZONE_COM ? 'C' : 'I';

  const demand = zone === ZONE_RES ? city.demandR
               : zone === ZONE_COM ? city.demandC
               : zone === ZONE_IND ? city.demandI : 0;

  const powerMul   = powered ? 1.0 : 0.2;
  const growChance = (!hasBldg && hasRoad && demand > 0)
    ? (demand * 0.4 * powerMul * (DENSITY_GROW_MUL[density] ?? 1) * 100).toFixed(1) + '%'
    : '0%';
  const canGrow = !hasBldg && hasRoad && demand > 0;

  // Check why it can't grow
  const blockers = [];
  if (zone === ZONE_NONE) blockers.push('no zone');
  if (zone !== ZONE_NONE && hasBldg) blockers.push('already has building');
  if (zone !== ZONE_NONE && !hasRoad) blockers.push('no road within 1 tile');
  if (zone !== ZONE_NONE && demand <= 0) blockers.push(`demand ≤ 0 (${demand.toFixed(2)})`);

  const zoneColor = ZONE_COLORS[zone] ?? '#aaa';
  const zoneName  = ZONE_NAMES[zone] ?? 'None';

  // ── Building identity helpers ────────────────────────────────────────────────
  const BLDG_TYPE_LABEL = {
    residential:       'Residential Building',
    commercial:        'Commercial Building',
    industrial:        'Industrial Building',
    power_plant_coal:  'Coal Power Plant',
    power_plant_solar: 'Solar Power Plant',
    fire_station:      'Fire Station',
    police_station:    'Police Station',
    park_small:         'Small Park',
    park_large:         'Large Park',
  };
  const BLDG_SUB_LABEL = {
    residential: { 1: 'House',    2: 'Apartment',         3: 'High-Rise'    },
    commercial:  { 1: 'Shop',     2: 'Commercial Block',  3: 'Office Tower' },
    industrial:  { 1: 'Factory',  2: 'Industrial Complex',3: 'Heavy Industry'},
  };

  // Sprite texture key — prefer bData.spriteKey (set at placement time);
  // fall back to reading it from the sprite currently at this tile.
  const bSprite   = scene.buildingSprites.get(id);
  const spriteKey = bData?.spriteKey
                 ?? bSprite?.texture?.key
                 ?? null;

  // Build a human-readable label for the title line.
  // Use bData (found by ANY fallback, including proximity) — not just hasBldg.
  let titleLabel;
  if (bData) {
    const typeLabel = BLDG_TYPE_LABEL[bData.type] ?? bData.type;
    const subLabel  = BLDG_SUB_LABEL[bData.type]?.[bData.level ?? 1];
    titleLabel      = subLabel ? `${typeLabel} · ${subLabel}` : typeLabel;
  } else if (hasBldg) {
    titleLabel = 'Building';
  } else {
    titleLabel = TERRAIN_NAMES[terrain] ?? '?';
  }

  let html = `
    <div class="dbg-title">[${row}, ${col}] — ${titleLabel}</div>
    ${spriteKey && (hasBldg || bData) ? `<div class="dbg-sprite-key">${spriteKey}</div>` : ''}
    <div class="dbg-divider"></div>`;

  // ── Infrastructure building tooltip ──────────────────────────────────────────
  const INFRA_TYPES = ['power_plant_coal', 'power_plant_solar', 'fire_station', 'police_station', 'park_small', 'park_large'];
  if (bData && INFRA_TYPES.includes(bData.type)) {
    const INFRA_LABELS = {
      power_plant_coal:  '⚡ Coal Power Plant',
      power_plant_solar: '☀️ Solar Power Plant',
      fire_station:      '🚒 Fire Station',
      police_station:    '👮 Police Station',
      park_small:         '🌳 Small Park',
      park_large:         '🌲 Large Park',
    };
    const INFRA_DESCS = {
      power_plant_coal:  `Grid power source · Upkeep $${UPKEEP_COAL_PLANT}/mo · Polluting`,
      power_plant_solar: `Grid power source · Upkeep $${UPKEEP_SOLAR_PLANT}/mo · Clean`,
      fire_station:      `Fire coverage radius ${FIRE_STATION_RADIUS} tiles · Upkeep $${UPKEEP_FIRE_STATION}/mo`,
      police_station:    `Crime reduction radius ${POLICE_STATION_RADIUS} tiles · Upkeep $${UPKEEP_POLICE_STATION}/mo`,
      park_small:         `Residential happiness radius ${SMALL_PARK_RADIUS} tiles · Upkeep $${UPKEEP_PARK_SMALL}/mo`,
      park_large:         `Residential happiness radius ${LARGE_PARK_RADIUS} tiles · Upkeep $${UPKEEP_PARK_LARGE}/mo`,
    };
    const INFRA_COLORS = {
      power_plant_coal: '#ffcc44', power_plant_solar: '#ffe066',
      fire_station: '#ff7755',     police_station: '#6699ff',
      park_small: '#58d66a',        park_large: '#32b457',
    };
    html += `
      <div style="color:${INFRA_COLORS[bData.type]};font-weight:bold">${INFRA_LABELS[bData.type]}</div>
      <div class="dbg-muted">${INFRA_DESCS[bData.type]}</div>
      <div class="${powered ? 'dbg-ok' : 'dbg-warn'}">Powered : ${powered ? '✓ yes' : '✗ no — needs power source'}</div>
      <div class="dbg-muted">Age : ${POWER_PLANT_STATS[bData.type] ? formatPowerPlantAge(bData) : `${bData.age ?? 0} ticks in service`}</div>`;
    if (bData.type === 'power_plant_coal' || bData.type === 'power_plant_solar') {
      const generation = getPowerPlantGenerationSummary(bData);
      const load = getPowerPlantLoadSummary(bData);
      html += `
        <div class="dbg-muted">Generation : ${generation.output} MW / ${generation.maxOutput} MW</div>
        <div class="dbg-muted">Load : ${load.load} MW / ${load.maxLoad} MW (${Math.round(load.loadRatio * 100)}%)</div>
        <div class="dbg-muted">Maintenance : $${getPowerPlantMaintenance(bData)}/mo</div>
        <div class="dbg-muted">Remaining life : ${getPowerPlantRemainingMonths(bData)} months</div>
        <div class="dbg-muted">Total power sources : ${powerSources.size}</div>`;
    }
    html += `<div class="dbg-divider"></div>`;
  }

  if (zone !== ZONE_NONE) {
    html += `
      <div style="color:${zoneColor}">Zone: ${zoneName} — ${DENSITY_NAMES[density]} (${zoneShort}${density})</div>
      <div class="${hasRoad   ? 'dbg-ok'   : 'dbg-fail'}">Road adjacent : ${hasRoad   ? '✓ yes' : '✗ no  ← zone needs road'}</div>
      <div class="${powered   ? 'dbg-ok'   : 'dbg-warn'}">Powered       : ${powered   ? '✓ yes (100% speed)' : `✗ no  (${powerSources.size === 0 ? 'no plant!' : '20% speed'})`}</div>
      <div class="${demand > 0 ? 'dbg-ok'  : 'dbg-fail'}">Demand        : ${demand >= 0 ? '+' : ''}${demand.toFixed(3)}</div>
      <div class="${hasBldg   ? 'dbg-warn' : 'dbg-muted'}">Has building  : ${hasBldg  ? `✓ ${bData ? `(${BLDG_TYPE_LABEL[bData.type] ?? bData.type}${BLDG_SUB_LABEL[bData.type]?.[bData.level ?? 1] ? ' · ' + BLDG_SUB_LABEL[bData.type][bData.level ?? 1] : ''} lv${bData.level ?? 1})` : '(manual)'}` : '— (empty)'}</div>
      <div class="dbg-divider"></div>`;

    if (canGrow) {
      html += `<div class="dbg-grow-yes">✓ CAN GROW — ${growChance}/tick</div>`;
      if (!powered) html += `<div class="dbg-warn">  → Add power plant to grow 5× faster</div>`;
    } else {
      html += `<div class="dbg-grow-no">✗ CANNOT GROW</div>`;
      blockers.forEach((b) => { html += `<div class="dbg-fail">  → ${b}</div>`; });
    }
  } else {
    html += `<div class="dbg-muted">No zone — use R/C/I tools to zone this tile</div>`;
    if (hasPowerLine) html += `<div class="dbg-warn">Has power line ⚡</div>`;
  }

  // Global city stats summary
  html += `
    <div class="dbg-divider"></div>
    <div class="dbg-muted">Power sources: ${powerSources.size} | Power lines: ${powerLineSet.size}</div>
    <div class="dbg-muted">demandR=${city.demandR.toFixed(2)} C=${city.demandC.toFixed(2)} I=${city.demandI.toFixed(2)}</div>`;

  if (typeof activeOverlay === 'string' && activeOverlay) {
    const val = getTileOverlayValue(activeOverlay, row, col);
    const overlayLabel = { pollution: '🏭 Pollution', crime: '🚔 Crime', fire: '🔥 Fire Risk', population: '👥 Population', landvalue: '💰 Land Value', electricity: '🔌 Electricity', power: '⚡ Power Plants' };
    html += `<div class="dbg-muted">${overlayLabel[activeOverlay] ?? activeOverlay}: ${(val * 100).toFixed(0)}%</div>`;
  }

  el.innerHTML = html;
  el.style.display = 'block';

  // Position tooltip near cursor, avoid right/bottom overflow
  const pad = 16;
  const tw  = el.offsetWidth  || 220;
  const th  = el.offsetHeight || 160;
  const cx  = pointer.event?.clientX ?? pointer.x;
  const cy  = pointer.event?.clientY ?? pointer.y;
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;

  el.style.left = (cx + pad + tw > vw ? cx - tw - pad : cx + pad) + 'px';
  el.style.top  = (cy + pad + th > vh ? cy - th - pad : cy + pad) + 'px';
}

function hideTileDebug() {
  const el = document.getElementById('tile-debug');
  if (el) el.style.display = 'none';
}

// ── Inspect panel (click-to-inspect mode) ────────────────────────────────────

function showInspectPanel(scene, row, col, pointer = null) {
  lastInspectTile = { row, col };
  const panel   = document.getElementById('inspect-panel');
  const content = document.getElementById('inspect-content');
  if (!panel || !content) return;

  const id      = getTileId(row, col);
  const terrain = mapData[row][col];
  const tileHeight = getTileHeight(row, col);
  const zone    = zoneMap[row]?.[col] ?? ZONE_NONE;
  const powered = !!powerMap[row]?.[col];
  const svc     = serviceMap[row]?.[col];
  const hasBldg = scene.buildingSprites.has(id);

  let bData = buildingData[id];
  if (!bData && hasBldg) {
    const s = scene.buildingSprites.get(id);
    if (s) bData = buildingData[getTileId(s.mapRow, s.mapCol)];
  }
  // Proximity fallback — any building type, dual-path (buildingSprites + buildingData direct)
  if (!bData) {
    let best = Infinity, bd2 = null;
    for (let dr = -2; dr <= 7; dr++) {
      for (let dc = -2; dc <= 7; dc++) {
        if (!isInsideMap(row+dr, col+dc)) continue;
        const nid = getTileId(row+dr, col+dc);
        const d   = Math.abs(dr) + Math.abs(dc);
        if (d >= best) continue;
        const spr = scene.buildingSprites.get(nid);
        if (spr) {
          const bd = buildingData[getTileId(spr.mapRow, spr.mapCol)];
          if (bd) { best = d; bd2 = bd; continue; }
        }
        const bd = buildingData[nid];
        if (bd) { best = d; bd2 = bd; }
      }
    }
    if (bd2 && best <= 6) bData = bd2;
  }

  const ZONE_COLORS   = { [ZONE_RES]:'#66ff88', [ZONE_COM]:'#6699ff', [ZONE_IND]:'#ffcc33' };
  const INFRA_LABELS  = {
    power_plant_coal: `⚡ ${t('building.coalPlant')}`,
    power_plant_solar: `☀️ ${t('building.solarPlant')}`,
    fire_station: `🚒 ${t('building.fireStation')}`,
    police_station: `👮 ${t('building.policeStation')}`,
    park_small: `🌳 ${t('building.smallPark')}`,
    park_large: `🌲 ${t('building.largePark')}`,
  };
  const INFRA_DESCS   = {
    power_plant_coal: t('inspect.gridPowerSource', { upkeep: UPKEEP_COAL_PLANT, quality: t('inspect.polluting') }),
    power_plant_solar: t('inspect.gridPowerSource', { upkeep: UPKEEP_SOLAR_PLANT, quality: t('inspect.clean') }),
    fire_station: t('inspect.coverageRadius', { radius: FIRE_STATION_RADIUS, upkeep: UPKEEP_FIRE_STATION }),
    police_station: t('inspect.coverageRadius', { radius: POLICE_STATION_RADIUS, upkeep: UPKEEP_POLICE_STATION }),
    park_small: t('inspect.parkRadius', { radius: SMALL_PARK_RADIUS, upkeep: UPKEEP_PARK_SMALL }),
    park_large: t('inspect.parkRadius', { radius: LARGE_PARK_RADIUS, upkeep: UPKEEP_PARK_LARGE }),
  };
  const INFRA_COLORS  = { power_plant_coal:'#ffcc44', power_plant_solar:'#ffe066', fire_station:'#ff7755', police_station:'#6699ff', park_small:'#58d66a', park_large:'#32b457' };
  const INFRA_TYPES   = Object.keys(INFRA_LABELS);

  // Build the coord line: prefer building name over raw terrain name
  const bSpriteInsp  = scene.buildingSprites.get(id);
  const spriteKeyInsp = bData?.spriteKey ?? bSpriteInsp?.texture?.key ?? null;
  let coordTitle;
  if (bData) {
    // bData may come from proximity scan — use it for the title regardless
    const tl = getBuildingTypeLabel(bData.type);
    const sl = getBuildingSubLabel(bData.type, bData.level ?? 1);
    coordTitle = sl ? `${tl} · ${sl}` : tl;
  } else if (hasBldg) {
    coordTitle = t('building.generic');
  } else {
    coordTitle = getTerrainName(terrain);
  }

  let html = `
    <div class="insp-coord">[${row}, ${col}] — ${coordTitle}</div>
    ${spriteKeyInsp && (hasBldg || bData) ? `<div class="insp-sprite-key">${spriteKeyInsp}</div>` : ''}
    <div class="insp-row insp-muted">Terrain height: L${tileHeight} (${tileHeight * 100}m)</div>`;

  // Infrastructure building
  if (bData && INFRA_TYPES.includes(bData.type)) {
    const isPark = bData.type === 'park_small' || bData.type === 'park_large';
    html += `
      <div class="insp-section">
        <div class="insp-bldg-name" style="color:${INFRA_COLORS[bData.type]}">${INFRA_LABELS[bData.type]}</div>
        <div class="insp-row">${INFRA_DESCS[bData.type]}</div>
        ${isPark
          ? `<div class="insp-row insp-ok">${t('inspect.nearbyResidentialBoost')}</div>`
          : `<div class="insp-row ${powered ? 'insp-ok' : 'insp-warn'}">${t('inspect.power', { status: powered ? t('inspect.powerActive') : t('inspect.powerUnpowered') })}</div>`}
        <div class="insp-row insp-muted">${POWER_PLANT_STATS[bData.type] ? t('inspect.powerAge', { age: formatPowerPlantAge(bData) }) : t('inspect.age', { age: bData.age ?? 0 })}</div>
      </div>`;
    if (bData.type === 'power_plant_coal' || bData.type === 'power_plant_solar') {
      const generation = getPowerPlantGenerationSummary(bData);
      const load = getPowerPlantLoadSummary(bData);
      const powerState = getPowerPlantState(bData);
      html += `
        <div class="insp-section">
          <div class="insp-row insp-ok">${t('inspect.powerGeneration', { output: generation.output, maxOutput: generation.maxOutput })}</div>
          <div class="insp-row ${load.status === 'overloaded' ? 'insp-warn' : 'insp-ok'}">${t('inspect.powerLoad', { load: load.load, maxLoad: load.maxLoad })}</div>
          <div class="insp-row insp-muted">${t('inspect.powerState', { state: t(`inspect.powerState${powerState.charAt(0).toUpperCase()}${powerState.slice(1)}`) })}</div>
          <div class="insp-row insp-muted">${t('inspect.powerRemaining', { remaining: getPowerPlantRemainingMonths(bData) })}</div>
          ${bData.powerWarning ? `<div class="insp-row insp-warn">${t('inspect.powerWarning')}</div>` : ''}
          <div class="insp-row insp-muted">$${getPowerPlantMaintenance(bData)}/mo upkeep</div>
        </div>`;
    }
  }

  // Zone / residential building
  if (zone !== ZONE_NONE) {
    const density  = zoneDensityMap[row]?.[col] ?? 1;
    const demand   = zone === ZONE_RES ? city.demandR : zone === ZONE_COM ? city.demandC : city.demandI;
    const zColor   = ZONE_COLORS[zone] ?? '#aaa';
    const hasRoad  = hasAdjacentRoad(row, col);

    const BLDG_DISPLAY = {
      residential: { 1: t('building.smallHouse'), 2: t('building.apartmentBlock'), 3: t('building.highRiseResidential') },
      commercial:  { 1: t('building.smallShop'), 2: t('building.commercialBlockIcon'), 3: t('building.officeTowerIcon') },
      industrial:  { 1: t('building.smallFactory'), 2: t('building.industrialComplexIcon'), 3: t('building.heavyIndustryIcon') },
    };
    const BLDG_POP_LABEL = { residential: t('inspect.residents'), commercial: t('inspect.workers'), industrial: t('inspect.workers') };

    let bldgHtml = '';
    if (hasBldg && bData && BLDG_DISPLAY[bData.type]) {
      const lvl      = bData.level ?? 1;
      const dispName = BLDG_DISPLAY[bData.type][lvl] ?? `${getBuildingTypeLabel(bData.type)} ${lvl}`;
      const popLabel = BLDG_POP_LABEL[bData.type] ?? t('inspect.residents');
      bldgHtml = `
        <div class="insp-bldg-name" style="color:${zColor}">${dispName}</div>
        <div class="insp-row insp-muted">${t('inspect.levelPopulation', { level: lvl, population: (bData.population ?? 0).toLocaleString(), label: popLabel })}</div>`;
    } else {
      bldgHtml = `<div class="insp-row insp-muted">${t('inspect.emptyLot')}</div>`;
    }

    html += `
      <div class="insp-section">
        <div class="insp-zone-name" style="color:${zColor}">${getZoneName(zone)} · ${getDensityLabel(density)}</div>
        ${bldgHtml}
        <div class="insp-divider"></div>
        <div class="insp-row ${hasRoad  ? 'insp-ok' : 'insp-fail'}">${t('inspect.roadAccess', { status: hasRoad ? '✓' : t('inspect.needed') })}</div>
        <div class="insp-row ${powered  ? 'insp-ok' : 'insp-warn'}">${t('inspect.power', { status: powered ? '✓' : t('inspect.powerGrowth') })}</div>
        <div class="insp-row">${t('inspect.demand', { demand: `${demand >= 0 ? '+' : ''}${demand.toFixed(2)}` })}</div>
      </div>`;
  }

  // Service coverage
  if (svc || zone !== ZONE_NONE) {
    html += `
      <div class="insp-section">
        <div class="insp-row ${svc?.fire   ? 'insp-ok' : 'insp-muted'}">🚒 ${svc?.fire   ? t('inspect.fireProtected')  : t('inspect.noFireCover')}</div>
        <div class="insp-row ${svc?.police ? 'insp-ok' : 'insp-muted'}">👮 ${svc?.police ? t('inspect.policeCoverage') : t('inspect.noPoliceCover')}</div>
        <div class="insp-row ${svc?.park   ? 'insp-ok' : 'insp-muted'}">🌳 ${svc?.park === 2 ? t('inspect.largeParkNearby') : svc?.park === 1 ? t('inspect.smallParkNearby') : t('inspect.noParkNearby')}</div>
      </div>`;
  }

  // Power line
  if (powerLineSet.has(id)) html += `<div class="insp-row insp-warn" style="margin-top:4px">${t('inspect.powerLineOnTile')}</div>`;

  content.innerHTML = html;
  panel.style.display = 'block';
  positionInspectPanel(panel, pointer);
}

function refreshInspectPanelLanguage() {
  const panel = document.getElementById('inspect-panel');
  if (!panel || panel.style.display === 'none' || !activeScene || !lastInspectTile) return;
  showInspectPanel(activeScene, lastInspectTile.row, lastInspectTile.col);
}

function positionInspectPanel(panel, pointer) {
  if (!pointer) {
    panel.style.left = '';
    panel.style.top = '';
    panel.style.transform = '';
    return;
  }

  const pad = 14;
  const margin = 8;
  const clientX = pointer.event?.clientX ?? pointer.x;
  const clientY = pointer.event?.clientY ?? pointer.y;

  panel.style.transform = 'none';

  const width = panel.offsetWidth || 230;
  const height = panel.offsetHeight || 180;
  let left = clientX + pad;
  let top = clientY + pad;

  if (left + width + margin > window.innerWidth) {
    left = clientX - width - pad;
  }
  if (top + height + margin > window.innerHeight) {
    top = clientY - height - pad;
  }

  panel.style.left = `${Math.max(margin, left)}px`;
  panel.style.top = `${Math.max(margin, top)}px`;
}

// ── Park textures ─────────────────────────────────────────────────────────────

function preGenerateParkTextures(scene) {
  const configs = [
    { key: 'park_small', width: TILE_WIDTH, height: TILE_IMAGE_HEIGHT, faceHeight: TILE_HEIGHT, trees: [[50, 24, 11], [36, 30, 8], [64, 32, 8]] },
    { key: 'park_large', width: TILE_WIDTH * 3, height: TILE_HEIGHT * 3 + BUILDING_SURFACE_Y_OFFSET, faceHeight: TILE_HEIGHT * 3, trees: [[118, 45, 16], [154, 48, 15], [190, 58, 14], [78, 70, 12], [230, 78, 13], [115, 93, 14], [158, 102, 16], [202, 108, 13], [145, 130, 11], [188, 134, 12]] },
  ];

  configs.forEach(({ key, width, height, faceHeight, trees }) => {
    if (scene.textures.exists(key)) return;

    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x56b85b, 1);
    g.lineStyle(2, 0x2f7f37, 1);
    g.beginPath();
    g.moveTo(width / 2, 0);
    g.lineTo(width, faceHeight / 2);
    g.lineTo(width / 2, faceHeight);
    g.lineTo(0, faceHeight / 2);
    g.closePath();
    g.fillPath();
    g.strokePath();

    g.lineStyle(1, 0x79d26f, 0.55);
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      g.lineBetween(width * t, faceHeight * t / 2, width / 2 + width * t / 2, faceHeight / 2 + faceHeight * t / 2);
      g.lineBetween(width * (1 - t), faceHeight * t / 2, width / 2 - width * t / 2, faceHeight / 2 + faceHeight * t / 2);
    }

    trees.forEach(([x, y, size]) => {
      g.fillStyle(0x8b5a2b, 1);
      g.fillRect(x - 2, y + size * 0.45, 4, size * 0.9);
      g.fillStyle(0x1d7a3a, 1);
      g.fillCircle(x, y, size);
      g.fillStyle(0x38a84d, 1);
      g.fillCircle(x - size * 0.35, y - size * 0.2, size * 0.55);
      g.fillCircle(x + size * 0.35, y - size * 0.15, size * 0.55);
    });

    g.generateTexture(key, width, height);
    g.destroy();
  });
}

// ── Zone overlay textures ─────────────────────────────────────────────────────

function preGenerateZoneTextures(scene) {
  const configs = [
    { key: 'zone_overlay_res_1', color: 0x9de07a },
    { key: 'zone_overlay_res_2', color: 0x3da832 },
    { key: 'zone_overlay_res_3', color: 0x1a7020 },
    { key: 'zone_overlay_com_1', color: 0x99c0ff },
    { key: 'zone_overlay_com_2', color: 0x3366dd },
    { key: 'zone_overlay_com_3', color: 0x0d2d8a },
    { key: 'zone_overlay_ind_1', color: 0xffe580 },
    { key: 'zone_overlay_ind_2', color: 0xd4a000 },
    { key: 'zone_overlay_ind_3', color: 0x8a5e00 },
  ];

  configs.forEach(({ key, color }) => {
    // Always regenerate — removing old texture first so vertex changes take effect.
    if (scene.textures.exists(key)) scene.textures.remove(key);

    const g = scene.make.graphics({ add: false });
    g.fillStyle(color, 0.60);
    g.beginPath();
    // The overlay uses setOrigin(0.5, 1), so texture origin is at (50, TILE_IMAGE_HEIGHT).
    // The ground tile's top-face diamond spans y = 0..TILE_HEIGHT in texture space:
    //   top    vertex → (TILE_WIDTH/2 ,  0)             = (50, 0)
    //   right  vertex → (TILE_WIDTH   ,  TILE_HEIGHT/2) = (100, 25)
    //   bottom vertex → (TILE_WIDTH/2 ,  TILE_HEIGHT)   = (50, 50)
    //   left   vertex → (0            ,  TILE_HEIGHT/2) = (0, 25)
    g.moveTo(TILE_WIDTH / 2, 0);                // top
    g.lineTo(TILE_WIDTH,     TILE_HEIGHT / 2);  // right
    g.lineTo(TILE_WIDTH / 2, TILE_HEIGHT);      // bottom
    g.lineTo(0,              TILE_HEIGHT / 2);  // left
    g.closePath();
    g.fillPath();
    g.generateTexture(key, TILE_WIDTH, TILE_IMAGE_HEIGHT);
    g.destroy();
  });
}

// ── Autosave ──────────────────────────────────────────────────────────────────

// Called by simulation.js every time the in-game year increments (1 Jan).
// Uses the same save slot so it silently overwrites without prompting.
function triggerAutosave() {
  if (isTerrainCreatorMode) return;
  if (!activeScene || !gameReady) return;
  saveGame(true);   // pass silent=true so the toast says "Autosaved" instead of "City saved"
}

// ── Map rotation ──────────────────────────────────────────────────────────────

function rotateMap(scene, steps = 1) {
  const camera = scene.cameras.main;
  const centerBefore = getCameraCenterWorld(scene);
  const logicalCenter = worldToLogicalPoint(scene, centerBefore.x, centerBefore.y);

  mapRotation = ((mapRotation + steps) % 4 + 4) % 4;

  // Refresh tile textures (direction-aware keys change)
  refreshAllTiles(scene);

  // Reposition every sprite that uses isoToScreen
  positionAllTiles(scene);

  // Rebuild world mask (corners stay the same logical coords but the rotated
  // isoToScreen will place them differently — drawWorldMask reads the same
  // 4 corner tile coords, so it just needs a redraw)
  drawWorldMask(scene);

  // Keep the same logical map area under the center of the screen after the
  // coordinate system rotates.
  const centerAfter = logicalPointToWorld(scene, logicalCenter);
  camera.scrollX = centerAfter.x - camera.width / (2 * camera.zoom);
  camera.scrollY = centerAfter.y - camera.height / (2 * camera.zoom);

  // Show a brief indicator of the new view direction
  const COMPASS = ['↑ North', '← West', '↓ South', '→ East'];
  showToast(t('toast.view', { direction: COMPASS[mapRotation] }), 'info');

  if (activeOverlay) updateMiniMap();
  scheduleTerrainMiniMapUpdate();
}

// ── Full reset (new terrain generation) ──────────────────────────────────────

function fullReset(scene) {
  clearAllOverlays(scene);
  clearBuildings(scene);
  resetGameState();
  stopSimTimer();
  startSimTimer();
  updateHUD();
}

// ── Simulation timer ──────────────────────────────────────────────────────────

let simTimerId  = null;
let simPaused   = false;
let simSpeedMul = 1;

function startSimTimer() {
  if (isTerrainCreatorMode) {
    stopSimTimer();
    simPaused = true;
    return;
  }
  stopSimTimer();
  if (simPaused || simSpeedMul === 0) return;
  const interval = Math.round(SIM_TICK_MS / simSpeedMul);
  simTimerId = setInterval(() => {
    if (!simPaused) runSimTick(activeScene);
  }, interval);
}

function stopSimTimer() {
  if (simTimerId !== null) {
    clearInterval(simTimerId);
    simTimerId = null;
  }
}

function toggleSimPause() {
  if (isTerrainCreatorMode) {
    simPaused = true;
    stopSimTimer();
    if (typeof updateSpeedButtons === 'function') updateSpeedButtons();
    return;
  }
  simPaused = !simPaused;
  if (!simPaused) startSimTimer();
  if (typeof updateSpeedButtons === 'function') updateSpeedButtons();
}

function setSimSpeed(speed) {
  if (isTerrainCreatorMode) {
    simPaused = true;
    stopSimTimer();
    if (typeof updateSpeedButtons === 'function') updateSpeedButtons();
    return;
  }
  if (speed === 0) {
    simPaused = true;
    stopSimTimer();
  } else {
    simPaused   = false;
    simSpeedMul = speed;
    startSimTimer();
  }
  if (typeof updateSpeedButtons === 'function') updateSpeedButtons();
}

// ── Landing screen ────────────────────────────────────────────────────────────

// Query the save server as soon as the landing screen appears, then update the
// status line so the player knows whether their cities are available.
async function prefetchSaveStatus() {
  const el = document.getElementById('landing-load-status');
  if (!el) return;

  // Starting state — animated dots already in HTML
  // (class="loading-dots" set in the markup)

  try {
    const saves = await listSaves();   // defined in save.js
    el.classList.remove('loading-dots', 'status-error');

    if (saves.length === 0) {
      el.classList.add('status-ok');
      el.textContent = t('landing.noSaves');
    } else {
      el.classList.add('status-ok');
      const n = saves.length;
      el.textContent = t('landing.saveStatus', {
        count: n,
        label: t(n === 1 ? 'landing.citySingular' : 'landing.cityPlural'),
      });
    }
  } catch {
    el.classList.remove('loading-dots');
    el.classList.add('status-error');
    el.textContent = t('landing.serverError');
  }
}

function setupLandingScreen() {
  const screen    = document.getElementById('landing-screen');
  const menu      = document.getElementById('landing-menu');
  const nameForm  = document.getElementById('landing-name-form');
  const terrainForm = document.getElementById('landing-terrain-form');
  const btnNew    = document.getElementById('btn-new-game');
  const btnTerrainCreator = document.getElementById('btn-terrain-creator');
  const btnCont   = document.getElementById('btn-continue');
  const btnStart  = document.getElementById('btn-start-city');
  const btnBack   = document.getElementById('btn-back');
  const btnGenerateTerrain = document.getElementById('btn-generate-terrain');
  const btnTerrainBack = document.getElementById('btn-terrain-back');
  const nameInput = document.getElementById('city-name-input');
  const terrainProfileSelect = document.getElementById('terrain-profile-select');
  const terrainSourceSelect = document.getElementById('newgame-terrain-source');
  const terrainPresetSelect = document.getElementById('newgame-terrain-preset');
  const terrainPresetTitle = document.getElementById('newgame-terrain-presets-title');
  const terrainPreviewList = document.getElementById('newgame-terrain-preview-list');
  const terrainEmptyHint = document.getElementById('newgame-terrain-empty-hint');
  if (!screen) return;
  let selectedTerrainPresetId = '';
  const terrainPresetDataCache = new Map();

  function setLandingState(state) {
    if (menu) menu.style.display = state === 'menu' ? 'block' : 'none';
    if (nameForm) nameForm.style.display = state === 'name' ? 'block' : 'none';
    if (terrainForm) terrainForm.style.display = state === 'terrain' ? 'block' : 'none';
  }

  function populateTerrainProfileSelect() {
    if (!terrainProfileSelect) return;
    terrainProfileSelect.innerHTML = '';
    TERRAIN_PROFILE_OPTIONS.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.key;
      option.textContent = t(profile.titleKey);
      terrainProfileSelect.appendChild(option);
    });
  }

  function drawTerrainPreview(canvas, terrainData) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !terrainData?.mapData) return;

    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const image = ctx.createImageData(size, size);
    const mapRows = terrainData.mapData;
    const heightRows = terrainData.heightMap ?? [];

    function getColor(tile, height) {
      if (tile === WATER) return [68, 136, 198];
      if (tile === BEACH) return [224, 206, 142];
      if (tile === DIRT) return [155, 120, 82];
      if (tile === HILL) {
        const shade = 105 + Math.min(80, Math.max(0, height) * 13);
        return [78, shade, 72];
      }
      return [95, 160, 92];
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = Math.floor((y / size) * MAP_HEIGHT);
        const col = Math.floor((x / size) * MAP_WIDTH);
        const tile = Number((mapRows[row] ?? [])[col]) || GROUND;
        const h = Number((heightRows[row] ?? [])[col]) || 0;
        const [r, g, b] = getColor(tile, h);
        const idx = (y * size + x) * 4;
        image.data[idx] = r;
        image.data[idx + 1] = g;
        image.data[idx + 2] = b;
        image.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function setSelectedTerrainPreset(id) {
    selectedTerrainPresetId = id ? String(id) : '';
    if (terrainPresetSelect) {
      terrainPresetSelect.value = selectedTerrainPresetId;
    }
    if (!terrainPreviewList) return;
    terrainPreviewList.querySelectorAll('.terrain-preset-card').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.presetId === selectedTerrainPresetId);
    });
  }

  async function refreshTerrainPresetOptions() {
    if (!terrainPresetSelect || !terrainEmptyHint || !terrainPreviewList) return;

    setPresetSelectLoading(terrainPresetSelect);
    terrainPreviewList.innerHTML = `<div class="terrain-preset-loading">${t('landing.terrainPresetLoading')}</div>`;
    terrainEmptyHint.style.display = 'none';
    if (terrainPresetTitle) terrainPresetTitle.style.display = 'none';

    try {
      let savedPresets = [];
      try {
        savedPresets = await listTerrainPresets();
      } catch (error) {
        console.warn('[TerrainPreset List]', error);
      }

      const builtInPresets = listBuiltInCityTerrainPresets();
      const presets = [...builtInPresets, ...savedPresets];

      terrainPresetSelect.innerHTML = '';
      terrainPreviewList.innerHTML = '';

      if (presets.length === 0) {
        terrainPresetSelect.style.display = 'none';
        terrainPreviewList.style.display = 'none';
        terrainEmptyHint.style.display = 'block';
        return;
      }

      terrainPreviewList.style.display = 'grid';
      if (terrainPresetTitle) terrainPresetTitle.style.display = 'block';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = t('landing.terrainPresetSelect');
      terrainPresetSelect.appendChild(placeholder);

      const scenarioGroup = document.createElement('optgroup');
      scenarioGroup.label = t('landing.cityScenarioGroup');
      terrainPresetSelect.appendChild(scenarioGroup);

      const savedGroup = document.createElement('optgroup');
      savedGroup.label = t('landing.savedTerrainGroup');
      terrainPresetSelect.appendChild(savedGroup);

      presets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = String(preset.id);
        option.textContent = createTerrainPresetOptionLabel(preset);
        if (preset.isBuiltInScenario) scenarioGroup.appendChild(option);
        else savedGroup.appendChild(option);

        const card = document.createElement('div');
        card.className = 'terrain-preset-card';
        card.dataset.presetId = String(preset.id);

        const thumb = document.createElement('canvas');
        thumb.className = 'terrain-preset-thumb';
        card.appendChild(thumb);

        const name = document.createElement('div');
        name.className = 'terrain-preset-name';
        name.textContent = preset.name;
        card.appendChild(name);

        const meta = document.createElement('div');
        meta.className = 'terrain-preset-meta';
        meta.textContent = preset.isBuiltInScenario
          ? `${t(`terrain.profile.${preset.profile_type}`)} · ${t('landing.cityScenarioLabel')}`
          : t(`terrain.profile.${preset.profile_type}`);
        card.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'terrain-preset-actions';

        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'terrain-preset-btn';
        selectBtn.textContent = t('landing.terrainSelect');
        actions.appendChild(selectBtn);

        let deleteBtn = null;
        if (!preset.isBuiltInScenario) {
          deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'terrain-preset-btn delete';
          deleteBtn.textContent = t('landing.terrainDelete');
          actions.appendChild(deleteBtn);
        }

        card.appendChild(actions);

        const selectCard = () => setSelectedTerrainPreset(preset.id);
        card.addEventListener('click', selectCard);
        selectBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          selectCard();
        });

        if (deleteBtn) {
          deleteBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (!window.confirm(t('landing.terrainDeleteConfirm'))) return;
            try {
              await deleteTerrainPresetById(preset.id);
              terrainPresetDataCache.delete(String(preset.id));
              if (selectedTerrainPresetId === String(preset.id)) {
                selectedTerrainPresetId = '';
              }
              showToast(t('toast.terrainPresetDeleted'), 'info');
              refreshTerrainPresetOptions();
            } catch (error) {
              console.error('[TerrainPreset Delete]', error);
              showToast(t('toast.terrainPresetDeleteFailed'), 'danger');
            }
          });
        }

        terrainPreviewList.appendChild(card);

        const cached = terrainPresetDataCache.get(String(preset.id));
        if (cached) {
          drawTerrainPreview(thumb, cached);
        } else if (preset.terrain_data?.mapData) {
          terrainPresetDataCache.set(String(preset.id), preset.terrain_data);
          drawTerrainPreview(thumb, preset.terrain_data);
        } else {
          getTerrainPresetById(preset.id)
            .then((full) => {
              if (!full?.terrain_data) return;
              terrainPresetDataCache.set(String(preset.id), full.terrain_data);
              drawTerrainPreview(thumb, full.terrain_data);
            })
            .catch(() => {
              thumb.replaceWith(document.createTextNode(t('landing.terrainPreviewFailed')));
            });
        }
      });

      if (!presets.some((preset) => String(preset.id) === selectedTerrainPresetId)) {
        selectedTerrainPresetId = String(presets[0].id);
      }
      setSelectedTerrainPreset(selectedTerrainPresetId);
    } catch {
      terrainPresetSelect.innerHTML = '';
      terrainPresetSelect.style.display = 'none';
      terrainPreviewList.innerHTML = '';
      terrainPreviewList.style.display = 'none';
      if (terrainPresetTitle) terrainPresetTitle.style.display = 'none';
      terrainEmptyHint.style.display = 'block';
    }
  }

  function updateTerrainSourceVisibility() {
    if (!terrainSourceSelect || !terrainPresetSelect || !terrainEmptyHint || !terrainPreviewList) return;
    const usePreset = terrainSourceSelect.value === 'preset';
    terrainPresetSelect.style.display = 'none';
    terrainPreviewList.style.display = usePreset ? 'grid' : 'none';
    if (terrainPresetTitle) terrainPresetTitle.style.display = usePreset ? 'block' : 'none';
    if (!usePreset) {
      terrainEmptyHint.style.display = 'none';
    }
  }

  // "Load Saved Game" always visible — opens the save-list modal
  if (btnCont) btnCont.style.display = 'block';

  // Pre-fetch saves immediately so the player sees live feedback instead of
  // a blank button while the server wakes up.
  prefetchSaveStatus();
  populateTerrainProfileSelect();
  updateTerrainSourceVisibility();
  document.addEventListener('languagechange', () => {
    populateTerrainProfileSelect();
    refreshTerrainPresetOptions();
  });

  btnNew.addEventListener('click', () => {
    setLandingState('name');
    nameInput.value = getDefaultCityName();
    nameInput.focus();
    nameInput.select();
    refreshTerrainPresetOptions();
  });

  btnTerrainCreator?.addEventListener('click', () => {
    setLandingState('terrain');
  });

  btnCont.addEventListener('click', () => {
    openSaveListModal();
  });

  btnStart.addEventListener('click', () => {
    const name = nameInput.value.trim() || getDefaultCityName();
    startNewGame(name);
  });

  btnGenerateTerrain?.addEventListener('click', () => {
    const profile = terrainProfileSelect?.value || 'island';
    startTerrainCreatorMode(profile, createSeed());
  });

  btnBack.addEventListener('click', () => {
    setLandingState('menu');
  });

  btnTerrainBack?.addEventListener('click', () => {
    setLandingState('menu');
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const name = nameInput.value.trim() || getDefaultCityName();
      startNewGame(name);
    }
  });

  terrainSourceSelect?.addEventListener('change', () => {
    updateTerrainSourceVisibility();
    if (terrainSourceSelect.value === 'preset') {
      refreshTerrainPresetOptions();
    }
  });

  terrainPresetSelect?.addEventListener('change', () => {
    setSelectedTerrainPreset(terrainPresetSelect.value);
  });

  // Keyboard shortcuts: Ctrl+S = save, Ctrl+O = load
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (isTerrainCreatorMode) saveTerrainPresetFromCurrentMap();
      else saveGame();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      if (isTerrainCreatorMode) return;
      openSaveListModal();
    }
    if (e.key === 'F11') {
      e.preventDefault();
      if (isFullscreen()) exitFullscreen();
      else enterFullscreen();
    }
  });
}

function hideLandingScreen() {
  const screen = document.getElementById('landing-screen');
  if (screen) screen.style.display = 'none';

  // Auto-start music on game entry (respects browser autoplay policy —
  // this runs inside a user gesture so it is always allowed).
  if (!isMusicPlaying) {
    // Pick a random starting track for variety
    activeTrackIndex = Math.floor(Math.random() * MUSIC_TRACKS.length);
    playTrack(activeTrackIndex);
  }
}

function copyTerrainToWorld(mapRows, heightRows) {
  mapData = createFilledMap(GROUND);
  heightMap = createFilledMap(0);
  resetBridgeLayers();

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const tile = Number((mapRows?.[row] ?? [])[col]);
      const normalizedTile = Number.isFinite(tile) ? tile : GROUND;
      mapData[row][col] = [GROUND, ROAD, DIRT, BEACH, WATER, HILL].includes(normalizedTile)
        ? normalizedTile
        : GROUND;

      const h = Number((heightRows?.[row] ?? [])[col]);
      if (mapData[row][col] === HILL) {
        heightMap[row][col] = Number.isFinite(h)
          ? Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, Math.round(h)))
          : 1;
      } else if (mapData[row][col] === ROAD) {
        heightMap[row][col] = Number.isFinite(h)
          ? Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.round(h)))
          : 0;
      } else {
        heightMap[row][col] = 0;
      }
    }
  }

  flattenMapBorder(mapData, heightMap, 3);
}

function rebuildFreshMapSession(cityName) {
  clearAllOverlays(activeScene);
  clearBuildings(activeScene);
  resetGameState();
  city.name = cityName || getDefaultCityName();
  refreshAllTiles(activeScene);
  updateHUD();
}

function startTerrainCreatorMode(profileType, seedText) {
  if (!gameReady || !activeScene) return;

  stopSimTimer();
  simPaused = true;
  isTerrainCreatorMode = true;
  activeTerrainProfileType = profileType;
  currentSeed = seedText || createSeed();
  mapData = generateTerrainMapByProfile(profileType, currentSeed);
  rebuildFreshMapSession(getDefaultCityName());
  selectedTool = 'terrain';
  selectedTerrainType = 'raise';

  document.querySelectorAll('#tool-menu [data-tool]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tool === 'terrain');
  });
  updateTerrainToolUi();
  setTerrainEditorUiActive(true);

  hideLandingScreen();
  showToast(t('toast.terrainCreatorEntered'), 'info');
}

async function saveTerrainPresetFromCurrentMap() {
  if (!activeScene) {
    showToast(t('toast.gameNotReady'), 'warning');
    return;
  }

  if (!isTerrainCreatorMode) {
    showToast(t('toast.terrainCreatorOnlyTerrainTools'), 'warning');
    return;
  }

  const profileLabel = t(`terrain.profile.${activeTerrainProfileType}`);
  const fallbackName = profileLabel.startsWith('terrain.profile.')
    ? getDefaultCityName()
    : profileLabel;
  let presetName = fallbackName;
  try {
    const entered = window.prompt(t('prompt.terrainPresetName'), fallbackName);
    if (entered === null) return;
    presetName = entered.trim() || fallbackName;
  } catch {
    presetName = `${fallbackName}-${Date.now().toString().slice(-6)}`;
  }

  const payload = {
    name: presetName,
    profile_type: activeTerrainProfileType,
    seed: currentSeed,
    terrain_data: {
      version: 1,
      generatorVersion: currentTerrainMetadata?.generatorVersion ?? 2,
      profileType: activeTerrainProfileType,
      seed: currentSeed,
      features: currentTerrainMetadata?.features ?? [],
      mapData: mapData.map((row) => Array.from(row)),
      heightMap: heightMap.map((row) => Array.from(row)),
    },
  };

  try {
    await createTerrainPreset(payload);
    showToast(t('toast.terrainPresetSaved'), 'info');
  } catch (error) {
    console.error('[TerrainPreset Save]', error);
    showToast(t('toast.terrainPresetSaveFailed'), 'danger');
  }
}

async function startNewGame(cityName) {
  if (!gameReady) return;

  const terrainSourceSelect = document.getElementById('newgame-terrain-source');
  const terrainPresetSelect = document.getElementById('newgame-terrain-preset');
  const source = terrainSourceSelect?.value || 'random';

  stopSimTimer();
  isTerrainCreatorMode = false;
  activeTerrainProfileType = 'custom';
  setTerrainEditorUiActive(false);

  if (source === 'preset') {
    const selectedId = (terrainPresetSelect?.value || '').trim();
    if (!selectedId) {
      showToast(t('landing.terrainPresetRequired'), 'warning');
      return;
    }

    try {
      let terrain = null;
      if (selectedId.startsWith('builtin:')) {
        terrain = getBuiltInCityTerrainData(selectedId);
      } else {
        const row = await getTerrainPresetById(selectedId);
        terrain = row?.terrain_data;
      }

      if (!terrain?.mapData || !terrain?.heightMap) {
        throw new Error(`Missing terrain data for preset ${selectedId}`);
      }

      copyTerrainToWorld(terrain.mapData, terrain.heightMap);
      currentSeed = terrain?.seed || createSeed();
      currentTerrainMetadata = {
        generatorVersion: terrain?.generatorVersion ?? 2,
        profileType: terrain?.profileType ?? 'custom',
        seed: currentSeed,
        features: terrain?.features ?? [],
      };
    } catch (error) {
      console.error('[TerrainPreset Load]', error);
      showToast(t('toast.terrainPresetLoadFailed'), 'danger');
      return;
    }
  } else {
    currentSeed = createSeed();
    mapData = generateTerrainMap(currentSeed);
  }

  if (typeof currentSaveId !== 'undefined') currentSaveId = null;

  rebuildFreshMapSession(cityName || getDefaultCityName());
  simPaused = false;
  simSpeedMul = simSpeedMul || 1;
  startSimTimer();
  hideLandingScreen();
}

function renameCityPrompt() {
  const newName = window.prompt(t('prompt.cityName'), city.name || getDefaultCityName());
  if (newName !== null && newName.trim()) {
    city.name = newName.trim().slice(0, 30);
    updateHUD();
  }
}

// ── Draws a glass-like isometric building using Phaser graphics ───────────────
function drawBuilding(scene, x, y) {
  const graphics = scene.add.graphics();
  const alpha = 0.6;
  const colorTop = 0x99c7e4;
  const colorLeft = 0x77b5d9;
  const colorRight = 0x5fa3cf;
  // Top face
  graphics.fillStyle(colorTop, alpha);
  graphics.beginPath();
  graphics.moveTo(x, y);
  graphics.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
  graphics.lineTo(x, y + TILE_HEIGHT);
  graphics.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
  graphics.closePath();
  graphics.fillPath();
  // Left face
  graphics.fillStyle(colorLeft, alpha);
  graphics.beginPath();
  graphics.moveTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
  graphics.lineTo(x, y + TILE_HEIGHT);
  graphics.lineTo(x, y + TILE_HEIGHT + TILE_HEIGHT);
  graphics.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT + TILE_HEIGHT / 2);
  graphics.closePath();
  graphics.fillPath();
  // Right face
  graphics.fillStyle(colorRight, alpha);
  graphics.beginPath();
  graphics.moveTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
  graphics.lineTo(x, y + TILE_HEIGHT);
  graphics.lineTo(x, y + TILE_HEIGHT + TILE_HEIGHT);
  graphics.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT + TILE_HEIGHT / 2);
  graphics.closePath();
  graphics.fillPath();
  return graphics;
}
