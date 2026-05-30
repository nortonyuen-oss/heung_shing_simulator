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

function listBuiltInCityTerrainPresets() {
  return BUILT_IN_CITY_TERRAIN_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    name: (() => {
      if (!scenario.nameKey) return scenario.name;
      const localized = t(scenario.nameKey);
      return localized === scenario.nameKey ? scenario.name : localized;
    })(),
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
