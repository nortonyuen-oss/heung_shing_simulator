
const TILE_WIDTH = 100;
const TILE_HEIGHT = 50;
const TILE_IMAGE_HEIGHT = 65;
const TILE_PICK_Y_OFFSET = TILE_IMAGE_HEIGHT;
const BUILDING_SURFACE_Y_OFFSET = TILE_IMAGE_HEIGHT - TILE_HEIGHT;
// Where a tile-centred prop (tree, debris) puts its foot, from isoToScreen's y. That y is the
// bottom of the 65 px tile image (tiles have origin 0.5,1), so the diamond's centre is 40 px
// above it; the foot goes a few px lower still so the art's small ground patch sits on the
// centre. (Trees used to be placed at +25 instead, which stood every tree and wreck on the
// tile diagonally in front of its own - you had to bulldoze the tile behind to remove it - and,
// sorted as if half a tile behind, let the house on the next tile draw over a tree in front.)
const TILE_PROP_FOOT_OFFSET_Y = -TILE_IMAGE_HEIGHT + TILE_HEIGHT / 2 + 4;
const MAP_WIDTH = 256;
const MAP_HEIGHT = 256;
// originX shifts the grid horizontally so it is centered on the screen
const ORIGIN_X = MAP_HEIGHT * (TILE_WIDTH / 2);
// Terrain tile type constants (GROUND–HILL defined here; zones defined in constants.js)
const GROUND = 1;
const ROAD = 2;
const DIRT = 3;
const BEACH = 4;
const WATER = 5;
const HILL = 6;
const MAX_TERRAIN_HEIGHT = 8;
const HEIGHT_STEP_PIXELS = 13;
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

let selectedTool = 'road';
let isPainting = false;
let gameReady = false;
let lastEditedTile = null;
let dragStartTile  = null;   // {row,col} set on pointerdown — used for zone rect-fill
let lastPaintTile  = null;   // {row,col} updated each move — used for road Bresenham
let lastKnownTile  = null;   // {row,col} last valid tile from pointermove — zone rect end
let activeScene = null;
let currentSeed = createSeed();

// Weather visual effects (rain particles + lightning) toggle — persisted so players on
// slower machines can disable the heavier bits. The sky-darkening overlay stays on
// regardless, since a single tinted rectangle costs essentially nothing to render.
const WEATHER_EFFECTS_SETTING_KEY = 'citybuilder.weatherEffects.v1';
let weatherEffectsEnabledCache = null;

function isWeatherEffectsEnabled() {
  if (weatherEffectsEnabledCache !== null) return weatherEffectsEnabledCache;
  try {
    const raw = localStorage.getItem(WEATHER_EFFECTS_SETTING_KEY);
    weatherEffectsEnabledCache = raw === null ? true : JSON.parse(raw) !== false;
  } catch {
    weatherEffectsEnabledCache = true;
  }
  return weatherEffectsEnabledCache;
}

function setWeatherEffectsEnabled(enabled) {
  weatherEffectsEnabledCache = !!enabled;
  try {
    localStorage.setItem(WEATHER_EFFECTS_SETTING_KEY, JSON.stringify(!!enabled));
  } catch {}
  if (activeScene) applyWeatherEffectsEnabledState(activeScene);
}

function applyWeatherEffectsEnabledState(scene) {
  if (!scene) return;
  if (!isWeatherEffectsEnabled()) {
    scene.rainEmitter?.stop();
    scene.currentRainTier = 'none';
    if (scene.lightningTimer) {
      scene.lightningTimer.remove();
      scene.lightningTimer = null;
    }
    scene.lightningFlash?.setAlpha(0);
  } else {
    scene.currentRainTier = null; // force re-application on the next tier check
  }
}

// Dynamic lighting (sun-angle tint on clear days + drifting cloud shadows on cloudy
// days, zoomed out below 1.2x) — persisted like the other visual toggles above.
const DYNAMIC_LIGHTING_SETTING_KEY = 'citybuilder.dynamicLighting.v1';
let dynamicLightingEnabledCache = null;

function isDynamicLightingEnabled() {
  if (dynamicLightingEnabledCache !== null) return dynamicLightingEnabledCache;
  try {
    const raw = localStorage.getItem(DYNAMIC_LIGHTING_SETTING_KEY);
    dynamicLightingEnabledCache = raw === null ? true : JSON.parse(raw) !== false;
  } catch {
    dynamicLightingEnabledCache = true;
  }
  return dynamicLightingEnabledCache;
}

function setDynamicLightingEnabled(enabled) {
  dynamicLightingEnabledCache = !!enabled;
  try {
    localStorage.setItem(DYNAMIC_LIGHTING_SETTING_KEY, JSON.stringify(!!enabled));
  } catch {}
  if (activeScene) updateDynamicLighting(activeScene);
}

// Night building lighting (lit windows, entrance and street-lamp glow after
// dark). The heaviest of the visual toggles in a large, dense city — every
// on-screen building draws a retained glow — so it gets its own opt-out,
// independent of the day/night sky and vehicle lamps above.
const BUILDING_LIGHTS_SETTING_KEY = 'citybuilder.buildingLights.v1';
let buildingLightsEnabledCache = null;

function isBuildingLightsEnabled() {
  if (buildingLightsEnabledCache !== null) return buildingLightsEnabledCache;
  try {
    const raw = localStorage.getItem(BUILDING_LIGHTS_SETTING_KEY);
    buildingLightsEnabledCache = raw === null ? true : JSON.parse(raw) !== false;
  } catch {
    buildingLightsEnabledCache = true;
  }
  return buildingLightsEnabledCache;
}

function setBuildingLightsEnabled(enabled) {
  buildingLightsEnabledCache = !!enabled;
  try {
    localStorage.setItem(BUILDING_LIGHTS_SETTING_KEY, JSON.stringify(!!enabled));
  } catch {}
  if (!buildingLightsEnabledCache && activeScene && typeof clearBuildingLights === 'function') {
    clearBuildingLights(activeScene);
  }
}

// Sea surface flow (animated shimmer on open-water tiles) — persisted like the other
// visual toggles above. Kept separate from dynamic lighting/weather effects since it
// touches terrain tile textures every tick, which is the one of these three most worth
// disabling on slower machines.
const SEA_FLOW_SETTING_KEY = 'citybuilder.seaFlow.v1';
let seaFlowEnabledCache = null;

function isSeaFlowEnabled() {
  if (seaFlowEnabledCache !== null) return seaFlowEnabledCache;
  try {
    const raw = localStorage.getItem(SEA_FLOW_SETTING_KEY);
    seaFlowEnabledCache = raw === null ? true : JSON.parse(raw) !== false;
  } catch {
    seaFlowEnabledCache = true;
  }
  return seaFlowEnabledCache;
}

function setSeaFlowEnabled(enabled) {
  seaFlowEnabledCache = !!enabled;
  try {
    localStorage.setItem(SEA_FLOW_SETTING_KEY, JSON.stringify(!!enabled));
  } catch {}
  if (activeScene) applySeaFlowEnabledState(activeScene);
}

// Turning the toggle off doesn't wait for tiles to cycle back on their own - snap any
// currently-animated water tile back to its real static texture immediately.
function applySeaFlowEnabledState(scene) {
  if (!scene || isSeaFlowEnabled() || !(scene.activeTerrainSpriteIds instanceof Set)) return;
  for (const id of scene.activeTerrainSpriteIds) {
    const row = Math.floor(id / MAP_WIDTH);
    const col = id % MAP_WIDTH;
    const tile = scene.tileSprites[row]?.[col];
    if (!tile || !tile.texture?.key?.includes('_flow_')) continue;
    tile.setTexture(resolveTileTextureKey(getTileKey(row, col)));
    applyTileTextureDisplayScale(tile);
  }
}

let selectedHouseIndices = {};
let selectedHouseSet = 'house';
let housePressTimer = null;
let didLongPressHouse = false;
let lastInspectTile = null;
let selectedParkId = 'open_ground';

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
const MAP_ZOOM_MIN = 0.4;
const MAP_ZOOM_MAX = 3;
const MAP_ZOOM_STEP = 1.1;
const MAP_KEYBOARD_PAN_SPEED = 620;
const heldMapPanKeys = new Set();
let mapKeyboardNavigationReady = false;
const PREVIEW_OVERLAY_DEPTH = 200000;
const WORLD_LAYER_DEPTHS = {
  terrain: 0,
  road: 100000,
  object: 200000,
  effect: 300000,
};
// Logical compatibility keys may outlive the asset that renders them. Resolve
// those aliases before preload/runtime lookup so Phaser decodes and uploads one
// canonical source instead of one source per legacy key.
const GLOBAL_TEXTURE_KEY_ALIASES = Object.freeze({
  hill_plateau: 'ground_full',
  park_small: 'park_small_open',
});

function resolveCanonicalTextureKey(key) {
  return GLOBAL_TEXTURE_KEY_ALIASES[key] ?? key;
}

function createWorldRenderLayers(scene) {
  if (!scene) return;
  scene.renderLayerMode = 'depth-bands';
}

function setGameWorldVisible(visible) {
  const scene = activeScene;
  if (!scene?.scene?.setVisible) return;
  const shouldShow = !!visible;
  scene.scene.setVisible(shouldShow);
  if (!shouldShow) {
    if (typeof clearTrafficVisuals === 'function') clearTrafficVisuals(scene);
    if (typeof clearTransportVisuals === 'function') clearTransportVisuals(scene);
    if (typeof clearVesselVisuals === 'function') clearVesselVisuals(scene);
    if (typeof clearAircraftVisuals === 'function') clearAircraftVisuals(scene);
    return;
  }
  updateTerrainViewportCulling(scene, true);
  if (typeof invalidateTrafficVisualView === 'function') {
    invalidateTrafficVisualView(scene, true);
  }
  if (typeof invalidateTransportVisuals === 'function') {
    invalidateTransportVisuals(scene, true);
  }
  if (typeof invalidateVesselVisualView === 'function') {
    invalidateVesselVisualView(scene, true);
  }
  if (typeof invalidateAircraftVisualView === 'function') {
    invalidateAircraftVisualView(scene, true);
  }
}

// A road-key lookup for one whole-map rebuild pass (signals, lamps, railings, furniture):
// getRoadKey runs the carriageway-band scan, and those passes ask about the same tiles many
// times over, so each tile is read once and kept in a flat array for the pass.
function createRoadKeyReader() {
  const cache = new Array(MAP_WIDTH * MAP_HEIGHT);
  return (row, col) => {
    if (row < 0 || col < 0 || row >= MAP_HEIGHT || col >= MAP_WIDTH) return null;
    const index = row * MAP_WIDTH + col;
    let key = cache[index];
    if (key === undefined) {
      key = isRoadLikeTile(row, col) ? getRoadKey(row, col) : null;
      cache[index] = key;
    }
    return key;
  };
}

function updateGameFrame(time, delta) {
  if (typeof recordVisualRoutePerformanceFrameStart === 'function') {
    recordVisualRoutePerformanceFrameStart(this);
  }
  // The raw frame delta, not Phaser's smoothed one: TimeStep averages the last
  // ten frames and, while the window is unfocused or still cooling down after
  // a load, clamps each to the 60fps target, so at 40fps the smoothed delta
  // sums to two thirds of real time and the clock crawls until the frame rate
  // recovers. The clock is wall-clock true; updateGameClock caps a single
  // frame at one second for the hidden-tab case.
  const clockDeltaMs = Number.isFinite(this.game?.loop?.rawDelta) ? this.game.loop.rawDelta : delta;
  if (typeof updateGameClock === 'function') updateGameClock(this, clockDeltaMs);
  // A calendar pulse queued by the clock runs a few steps per frame (simulation.js).
  if (typeof pumpCitySimulationPulse === 'function') pumpCitySimulationPulse();
  // At displayed 8x the full day/night cycle is one minute, so the old 500ms
  // ambient interval would visibly stair-step the sky. Ten updates/second keeps
  // colour and mask transitions smooth without redrawing the overlay every frame.
  if (typeof updateDynamicLighting === 'function' && time >= (this.nextDayNightVisualUpdateAt ?? 0)) {
    this.nextDayNightVisualUpdateAt = time + 100;
    updateDynamicLighting(this);
  }
  updateKeyboardMapPan(this, delta);
  if (typeof updateAttractCamera === 'function') updateAttractCamera(this, time);
  if (typeof beginVehicleTrackerFrame === 'function') beginVehicleTrackerFrame(this, time, delta);

  const profileSections = typeof isVisualRouteCalibrationTestModeEnabled === 'function'
    && isVisualRouteCalibrationTestModeEnabled()
    && typeof recordVisualRoutePerformanceDuration === 'function';
  let sectionStartedAt = profileSections ? performance.now() : 0;
  // Signals advance before traffic so a vehicle reads this frame's phase.
  if (typeof updateTrafficSignalVisuals === 'function') updateTrafficSignalVisuals(this, time, delta);
  if (typeof updateStreetLampVisuals === 'function') updateStreetLampVisuals(this, time);
  if (typeof advanceTransportVehicleMovement === 'function') advanceTransportVehicleMovement(this, delta);
  if (typeof updateTransportVisuals === 'function') updateTransportVisuals.call(this, time, delta);
  updateTrafficVisuals.call(this, time, delta);
  if (profileSections) {
    recordVisualRoutePerformanceDuration(this, 'traffic', performance.now() - sectionStartedAt);
    sectionStartedAt = performance.now();
  }
  updateVesselVisuals.call(this, time, delta);
  if (profileSections) {
    recordVisualRoutePerformanceDuration(this, 'vessel', performance.now() - sectionStartedAt);
    sectionStartedAt = performance.now();
  }
  updateAircraftVisuals.call(this, time, delta);
  if (profileSections) {
    recordVisualRoutePerformanceDuration(this, 'aircraft', performance.now() - sectionStartedAt);
  }
  if (typeof syncVehicleTrackerTargetsBeforeRender === 'function') {
    syncVehicleTrackerTargetsBeforeRender(this, time);
  }
  updateTerrainViewportCulling(this);
  if (typeof updateBuildingLights === 'function'
    && (typeof isBuildingLightsEnabled !== 'function' || isBuildingLightsEnabled())
    && !(typeof isAttractLightsSuppressed === 'function' && isAttractLightsSuppressed())) {
    updateBuildingLights(this, time);
  }
  if (typeof updateSeaFlowAnimation === 'function') updateSeaFlowAnimation(this, time);
  if (typeof updateRainRipples === 'function') updateRainRipples(this, time);
  if (typeof finalizeVehicleTrackerCameraCulling === 'function') {
    finalizeVehicleTrackerCameraCulling(this);
  }
  if (typeof updateVisualRoutePerformanceProfiler === 'function') {
    updateVisualRoutePerformanceProfiler(this, time, delta);
  }
}

function addToRenderLayer(scene, child, layerName) {
  if (typeof syncVehicleTrackerObjectCameraFilters === 'function') {
    syncVehicleTrackerObjectCameraFilters(scene, child);
  }
  return child;
}

function sortRenderLayer(scene, layerName) {
  if (!scene) return;
}

function sortWorldRenderLayers(scene) {
  if (!scene) return;
}

function getWorldDepth(layerName, localDepth = 0) {
  return (WORLD_LAYER_DEPTHS[layerName] ?? 0) + (Number(localDepth) || 0);
}

function getPreviewOverlayDepth(offset = 0) {
  return getWorldDepth('effect', PREVIEW_OVERLAY_DEPTH + offset);
}

function resolveTileTextureKey(logicalKey) {
  if (typeof getRoadTileTextureKey === 'function') {
    const textureKey = getRoadTileTextureKey(logicalKey);
    if (activeScene?.textures?.exists && !activeScene.textures.exists(textureKey)) {
      return resolveCanonicalTextureKey(
        getRoadTileTextureKey(logicalKey, ROAD_TILE_SET_DEFAULT_ID),
      );
    }
    return resolveCanonicalTextureKey(textureKey);
  }
  return resolveCanonicalTextureKey(logicalKey);
}

// Call after any setTexture on a terrain/road sprite: oversized road-set art is drawn back
// down to its footprint (getRoadTextureDisplayScale, road-tile-sets.js); everything else is 1.
function applyTileTextureDisplayScale(sprite) {
  if (!sprite) return;
  const scale = typeof getRoadTextureDisplayScale === 'function'
    ? getRoadTextureDisplayScale(sprite.texture)
    : 1;
  if (sprite.scaleX !== scale || sprite.scaleY !== scale) sprite.setScale(scale);
}

function ensurePreviewOverlayDepth(scene) {
  if (!scene) return;
  scene.zonePreviewGraphic?.setDepth?.(getPreviewOverlayDepth());
  scene.bridgePreviewGraphic?.setDepth?.(getPreviewOverlayDepth());
  scene.buildingGuideGraphic?.setDepth?.(getPreviewOverlayDepth());
  scene.inspectHighlightGraphic?.setDepth?.(getPreviewOverlayDepth(1));
  sortWorldRenderLayers(scene);
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
    id: 'garden_plaza',
    type: 'park_small',
    spriteKey: 'park_small_garden',
    titleKey: 'park.gardenPlaza',
    badge: '1x1',
    icon: '🏵',
    cost: COST_PARK_SMALL,
    footprintCols: 1,
    footprintRows: 1,
  },
  {
    id: 'plaza_square',
    type: 'park_small',
    spriteKey: 'park_small_plaza',
    titleKey: 'park.plazaSquare',
    badge: '1x1',
    icon: '🎪',
    cost: COST_PARK_SMALL,
    footprintCols: 1,
    footprintRows: 1,
  },
  {
    id: 'palm_court',
    type: 'park_small',
    spriteKey: 'park_small_palm',
    titleKey: 'park.palmCourt',
    badge: '2x2',
    icon: '🌴',
    cost: COST_PARK_SMALL * 2,
    footprintCols: 2,
    footprintRows: 2,
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
  {
    id: 'premium_plaza',
    type: 'park_large',
    spriteKey: 'park_large_highscore',
    titleKey: 'park.premiumPlaza',
    badge: '2x2',
    icon: '✨',
    cost: COST_PARK_LARGE,
    footprintCols: 2,
    footprintRows: 2,
  },
  {
    id: 'swimming_pool',
    type: 'park_large',
    spriteKey: 'park_large_pool',
    titleKey: 'park.swimmingPool',
    badge: '3x3',
    icon: '🏊',
    cost: COST_PARK_LARGE,
    footprintCols: 3,
    footprintRows: 3,
  },
  {
    id: 'victoria_park',
    type: 'park_flagship',
    spriteKey: 'park_flagship_victoria',
    titleKey: 'park.victoriaPark',
    badge: '4x4',
    icon: '🎡',
    cost: COST_PARK_FLAGSHIP,
    footprintCols: 4,
    footprintRows: 4,
  },
];

const SPORT_GROUND_OPTIONS = [
  {
    id: 'sports_ground_small',
    type: 'sports_ground_small',
    spriteKey: 'sports_ground_2x2',
    titleKey: 'sportsGround.small',
    badge: '2x2',
    icon: '⚽',
    cost: COST_SPORTS_GROUND_SMALL,
    footprintCols: 2,
    footprintRows: 2,
  },
  {
    id: 'sports_ground_large',
    type: 'sports_ground_large',
    spriteKey: 'sports_ground_3x3',
    titleKey: 'sportsGround.large',
    badge: '3x3',
    icon: '🏟',
    cost: COST_SPORTS_GROUND_LARGE,
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
    power_plant_coal:    'building.coalPlant',
    power_plant_solar:   'building.solarPlant',
    power_plant_nuclear: 'building.nuclearPlant',
    fire_station: 'building.fireStation',
    police_station: 'building.policeStation',
    primary_school: 'building.primarySchool',
    secondary_school: 'building.secondarySchool',
    library: 'building.library',
    community_college: 'building.communityCollege',
    university: 'building.university',
    hospital: 'building.hospital',
    legislative_council: 'building.legislativeCouncil',
    stock_exchange: 'building.stockExchange',
    park_small: 'building.smallPark',
    park_large: 'building.largePark',
    airport: 'building.airport',
    heritage_temple: 'building.heritageTemple',
    grand_temple: 'building.grandTemple',
    heritage_church: 'building.heritageChurch',
    indoor_coliseum: 'building.indoorColiseum',
  }[type] ?? type);
}

// Residential is keyed by wealthTier (L/M/H/UH) - see sim-wealth-districts.js
// - not by population-growth level like commercial/industrial still are.
function getBuildingSubLabel(type, levelOrWealthTier) {
  const keys = {
    residential: {
      L: 'building.publicEstate', M: 'building.privateResidence', H: 'building.wealthyResidence', UH: 'building.mansion',
    },
    commercial: { 1: 'building.shop', 2: 'building.commercialBlock', 3: 'building.officeTower' },
    industrial: { 1: 'building.factory', 2: 'building.industrialComplex', 3: 'building.heavyIndustry' },
  };
  return keys[type]?.[levelOrWealthTier] ? t(keys[type][levelOrWealthTier]) : null;
}

// Map data: 1=ground, 2=road, 3=dirt, 4=beach, 5=water, 6=hill
let mapData = createFilledMap(GROUND);

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#87ceeb',
  render: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  // Phaser's hard limiter compares an rAF gap with a fixed interval. On both
  // 60 Hz and variable-refresh displays that quantizes otherwise healthy frame
  // pacing to an integer divisor (the profiler observed 30-40 fps with light
  // update/render work). Let rAF follow the display; `target` still supplies
  // delta smoothing and panic thresholds without rejecting display frames.
  fps: {
    target: 60,
    limit: 0,
  },
  scene: { preload, create, update: updateGameFrame },
};

initializeGame();

async function initializeGame() {
  // The menu is plain DOM UI and must stay usable while model discovery and
  // Phaser's heavier startup work are still in flight. In particular, players
  // need to be able to leave fullscreen even if asset loading stalls.
  setupMenuBar();
  await loadModelAssetManifest();
  houseModelSets = await discoverHouseModelSets();
  commercialBuildingModels = await discoverCommercialBuildingModels();
  industrialBuildingModels = await discoverIndustrialBuildingModels();
  setupToolMenu();
  setupRoadTileSetWindow();
  applyStoredMusicVolume();
  updateHouseToolUi();
  updateTerrainToolUi();
  updateZoneDensityBadges();
  updateParkToolUi();
  new Phaser.Game(config);
}

function preload() {
  const roadPath = 'kenney_isometric-roads/png/';
  const allHouseModels = Object.values(houseModelSets).flat();
  const initialHouseModels = dedupeZoneModelsByKey([
    ...selectInitialZoneModelsForPreload(allHouseModels),
    ...selectForcedWealthTierModels(allHouseModels, ['H', 'UH']),
  ]);
  const initialCommercialModels = selectInitialZoneModelsForPreload(commercialBuildingModels);
  const initialIndustrialModels = selectInitialZoneModelsForPreload(industrialBuildingModels);
  [...initialHouseModels, ...initialCommercialModels, ...initialIndustrialModels]
    .forEach((model) => initialZoneTextureKeys.add(model.key));

  setupPreloadProgressUi(this);

  MUSIC_TRACKS.forEach((track) => {
    this.load.audio(track.key, track.file);
  });
  AMBIENT_TRACKS.forEach((track) => {
    this.load.audio(track.key, track.file);
  });
  SFX_TRACKS.forEach((track) => {
    this.load.audio(track.key, track.file);
  });
  // The legacy Models/PNG tileset is no longer shipped. Old saves are migrated
  // to the current model catalog during load, so requesting its 78 missing PNGs
  // here only delayed startup with 78 guaranteed 404 responses.
  initialHouseModels.forEach((model) => {
    this.load.image(model.key, model.path);
  });
  initialCommercialModels.forEach((model) => {
    this.load.image(model.key, model.path);
  });
  initialIndustrialModels.forEach((model) => {
    this.load.image(model.key, model.path);
  });
  // Parks: art paths live in PARK_MODELS (constants.js) so the night bake and
  // the light calibrator see the same table.
  Object.values(PARK_MODELS).forEach((model) => {
    this.load.image(model.spriteKey, resolveModelAssetPath(model.path));
  });
  // Sports grounds
  this.load.image('sports_ground_2x2',     resolveModelAssetPath('Models/parks/park2x2/sportField3-02.png'));
  this.load.image('sports_ground_3x3',     resolveModelAssetPath('Models/parks/park3x3/sportField3-01.png'));
  const fixedBuildingModels = [
    ...Object.values(POWER_PLANT_MODELS),
    ...Object.keys(SERVICE_BUILDING_MODELS).flatMap(getServiceBuildingModels),
    ...Object.keys(SPECIAL_BUILDING_MODELS).flatMap(getAllSpecialBuildingModels),
    ...Object.values(HARBOR_MODELS),
    ...Object.values(BUS_DEPOT_MODELS),
  ];
  const queuedFixedTextureKeys = new Set();
  fixedBuildingModels.forEach((model) => {
    const textureKey = getFixedBuildingTextureKey(model);
    if (!textureKey || queuedFixedTextureKeys.has(textureKey)) return;
    queuedFixedTextureKeys.add(textureKey);
    this.load.image(textureKey, getFixedBuildingModelLoadPath(model));
  });

  this.load.image('ground_full', `${roadPath}grassWhole.png`);
  this.load.image('dirt_full', `${roadPath}dirtDouble.png`);
  if (typeof getRoadTileSets === 'function') {
    getRoadTileSets().forEach((set) => {
      Object.keys(ROAD_TILE_LOGICAL_FILES).forEach((logicalKey) => {
        this.load.image(`${set.texturePrefix}_${logicalKey}`, getRoadTileAssetPath(logicalKey, set.id));
        // Baked line-marking variants (road-line-markings.js) for this (tile shape, road tile
        // set) - only whichever variants are actually calibrated for this shape, so a shape
        // with none queues nothing. Loading one that has no baked file on disk (e.g. a variant
        // calibrated for newRoadTiles but not classic) just 404s silently: applyRoadLineTexture
        // already checks scene.textures.exists() before ever using it, the same defensive check
        // applyBuildingNightTexture uses for a building's night bake.
        if (typeof getRoadLineVariantIds === 'function') {
          getRoadLineVariantIds(logicalKey).forEach((variantId) => {
            const lineKey = getRoadLineTextureKey(logicalKey, variantId, set.id);
            const lineAssetPath = getRoadLineBakedAssetPath(logicalKey, variantId, set.id);
            if (lineKey && lineAssetPath) this.load.image(lineKey, lineAssetPath);
          });
        }
      });
    });
  }

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

  this.load.image('hill_edge_n', `${roadPath}hillE.png`);
  this.load.image('hill_edge_e', `${roadPath}hillS.png`);
  this.load.image('hill_edge_s', `${roadPath}hillW.png`);
  this.load.image('hill_edge_w', `${roadPath}hillN.png`);
  this.load.image('hill_corner_ne', `${roadPath}hillES.png`);
  this.load.image('hill_corner_se', `${roadPath}hillSW.png`);
  this.load.image('hill_corner_sw', `${roadPath}hillNW.png`);
  this.load.image('hill_corner_nw', `${roadPath}hillNE.png`);

  for (let i = 1; i <= 15; i++) {
    const key = `tree${String(i).padStart(2, '0')}`;
    this.load.image(key, resolveModelAssetPath(`Models/trees/${key}.png`));
  }

  // Bare-land debris (derelict vehicles/containers scattered on dirt tiles,
  // see BARE_LAND_DEBRIS_KINDS in model-catalog.js)
  this.load.image('bareland_car',              resolveModelAssetPath('Models/bareLand/car.PNG'));
  this.load.image('bareland_car_wreck',        resolveModelAssetPath('Models/bareLand/car2.PNG'));
  this.load.image('bareland_van',              resolveModelAssetPath('Models/bareLand/miniVan.PNG'));
  this.load.image('bareland_truck',            resolveModelAssetPath('Models/bareLand/truck.PNG'));
  this.load.image('bareland_container_single', resolveModelAssetPath('Models/bareLand/container1.PNG'));
  this.load.image('bareland_container_double', resolveModelAssetPath('Models/bareLand/container2.PNG'));
  this.load.image('bareland_container_quad',   resolveModelAssetPath('Models/bareLand/container3.PNG'));
  this.load.image('bareland_container_fenced', resolveModelAssetPath('Models/bareLand/container4.PNG'));

  // Bus stop shoulder props (decorative road prop, see BUS_STOP_* constants)
  this.load.image('bus_stop_ur', resolveModelAssetPath('Models/busStop/busStop_UR.png'));
  this.load.image('bus_stop_ul', resolveModelAssetPath('Models/busStop/busStop_UL.png'));
  this.load.image('bus_stop_ll', resolveModelAssetPath('Models/busStop/busStop_LL.png'));
  this.load.image('bus_stop_lr', resolveModelAssetPath('Models/busStop/busStop_LR.png'));

  // Junction traffic signal poles: one baked texture per facing and lamp state (traffic-signals.js)
  if (typeof TRAFFIC_SIGNAL_TEXTURE_FILES !== 'undefined') {
    Object.entries(TRAFFIC_SIGNAL_TEXTURE_FILES).forEach(([key, file]) => {
      this.load.image(key, resolvePropAssetPath(file, TRAFFIC_SIGNAL_SOURCE_CANVAS));
    });
  }
  // Street lamp posts: day and baked night texture per arm direction (street-lamps.js)
  if (typeof STREET_LAMP_TEXTURE_FILES !== 'undefined') {
    Object.entries(STREET_LAMP_TEXTURE_FILES).forEach(([key, file]) => {
      this.load.image(key, resolvePropAssetPath(file, STREET_LAMP_SOURCE_CANVAS));
    });
  }
  // Bridge parapets: one segment per screen axis plus the ramp shears (bridge-parapets.js)
  if (typeof BRIDGE_PARAPET_TEXTURE_FILES !== 'undefined') {
    Object.entries(BRIDGE_PARAPET_TEXTURE_FILES).forEach(([key, file]) => {
      this.load.image(key, resolvePropAssetPath(file, BRIDGE_PARAPET_SOURCE_CANVAS));
    });
  }
  // Pedestrian railings: one run per screen axis (pedestrian-railings.js)
  if (typeof PEDESTRIAN_RAILING_TEXTURE_FILES !== 'undefined') {
    Object.entries(PEDESTRIAN_RAILING_TEXTURE_FILES).forEach(([key, file]) => {
      this.load.image(key, resolvePropAssetPath(file, PEDESTRIAN_RAILING_SOURCE_CANVAS));
    });
  }
  // Roadside furniture: bins, cabinets, posting boxes, parking meters (street-furniture.js)
  if (typeof STREET_FURNITURE_TEXTURE_FILES !== 'undefined') {
    Object.entries(STREET_FURNITURE_TEXTURE_FILES).forEach(([key, file]) => {
      this.load.image(key, resolvePropAssetPath(file, STREET_FURNITURE_SOURCE_CANVAS));
    });
  }
}

function create() {
  installVertexUploadShim(this.game?.renderer);
  installAdaptiveDepthSort(this.sys?.displayList);
  packStreetPropTextures(this);
  activeScene = this;
  if (typeof setupVisualRoutePerformanceHooks === 'function') {
    setupVisualRoutePerformanceHooks(this);
  }
  prepareHouseModelMetadata(this);
  prepareCommercialBuildingModelMetadata(this);
  prepareIndustrialBuildingModelMetadata(this);
  startZoneTexturePoolRotation(this);
  prepareParkModelMetadata(this);
  preparePowerPlantModelMetadata(this);
  prepareServiceBuildingModelMetadata(this);
  prepareSpecialBuildingModelMetadata(this);
  prepareHarborModelMetadata(this);
  prepareBusDepotModelMetadata(this);

  updateMapMetrics(this);

  // Panning state
  this.isPanning = false;
  this.panPrevX = 0;
  this.panPrevY = 0;
  this.tileSprites = [];
  this.activeTerrainSpriteIds = new Set();
  this.buildingSprites = new Map();
  this.zoneOverlays    = new Map();
  this.powerLineSprites = new Map();
  this.bridgeSprites = new Map();
  this.treeSprites = new Map();
  this.debrisSprites = new Map();
  this.busStopSprites = new Map();
  this.trafficSignalSprites = new Map();
  this.streetLampSprites = new Map();
  this.bridgeParapetSprites = new Map();
  this.pedestrianRailingSprites = new Map();
  this.streetFurnitureSprites = new Map();
  this.districtSignSprites = new Map();
  createWorldRenderLayers(this);

  const maskGraphics = this.make.graphics({ x: 0, y: 0, add: false });
  this.maskGraphics = maskGraphics;
  drawWorldMask(this);
  const worldMask = maskGraphics.createGeometryMask();
  this.worldMask = worldMask;
  setupTrafficVisuals(this);
  if (typeof setupTransportVisuals === 'function') setupTransportVisuals(this);
  setupVesselVisuals(this);
  setupAircraftVisuals(this);

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
      // The map owns 65,536 terrain Images, but only a few hundred can appear
      // in one camera view. Creating them detached avoids an O(n²) first-frame
      // pass through Phaser's Display List; viewport culling adds only the
      // camera-local subset when gameplay becomes visible.
      const tile = this.make.image({
        x,
        y,
        key: resolveTileTextureKey(key),
        add: false,
      });
      tile.vehicleTrackerTerrain = true;
      addToRenderLayer(this, tile, 'terrainLayer');
      tile.setVisible(false);
      tile.setOrigin(0.5, 1);
      tile.setDepth(getTerrainTileDepth(row, col, key, pos.y));
      tile.setMask(worldMask);
      applyTileVisualStyle(tile, row, col, key);
      applyTileTextureDisplayScale(tile);
      this.tileSprites[row][col] = tile;
    }
  }

  if (typeof generateSeaFlowTextures === 'function') generateSeaFlowTextures(this);
  if (typeof generateRippleRingTexture === 'function') generateRippleRingTexture(this);

  // Pre-generate zone overlay textures (RES/COM/IND coloured diamonds)
  preGenerateZoneTextures(this);
  preGenerateParkTextures(this);

  // Initialise simulation state
  resetGameState();
  generateInitialTrees(this);
  rebuildTreeSprites(this);
  generateInitialDebris(this);
  rebuildDebrisSprites(this);
  rebuildBusStopSprites(this);

  this.weatherOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a1428, 1);
  this.weatherOverlay.setOrigin(0, 0);
  this.weatherOverlay.setScrollFactor(0);
  this.weatherOverlay.setDepth(999999);
  this.weatherOverlay.setAlpha(0);

  setupWeatherEffects(this);
  setupDynamicLighting(this);
  if (typeof setupBuildingLights === 'function') setupBuildingLights(this);

  this.scale.on('resize', () => {
    updateMapMetrics(this);
    drawWorldMask(this);
    positionAllTiles(this);
    invalidateTrafficVisualView(this, true);
    if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(this, true);
    invalidateVesselVisualView(this, true);
    ensurePreviewOverlayDepth(this);
    syncWeatherFxToCamera(this);
    if (typeof updateDynamicLighting === 'function') updateDynamicLighting(this);
    if (typeof markVehicleTrackerLayoutDirty === 'function') markVehicleTrackerLayoutDirty();
  });

  // Group for future buildings
  this.buildings = this.add.group();

  // Zone drag-select preview graphic (drawn over the world during zone rect drag)
  this.zonePreviewGraphic = this.add.graphics();
  addToRenderLayer(this, this.zonePreviewGraphic, 'effectLayer');
  this.zonePreviewGraphic.setDepth(getPreviewOverlayDepth());

  // Road/bridge drag preview graphic.
  this.bridgePreviewGraphic = this.add.graphics();
  addToRenderLayer(this, this.bridgePreviewGraphic, 'effectLayer');
  this.bridgePreviewGraphic.setDepth(getPreviewOverlayDepth());

  // Building placement footprint guide (hover preview before committing).
  this.buildingGuideGraphic = this.add.graphics();
  addToRenderLayer(this, this.buildingGuideGraphic, 'effectLayer');
  this.buildingGuideGraphic.setDepth(getPreviewOverlayDepth());

  // Inspect-tool hover highlight (red diamond under the cursor)
  this.inspectHighlightGraphic = this.add.graphics();
  addToRenderLayer(this, this.inspectHighlightGraphic, 'effectLayer');
  this.inspectHighlightGraphic.setDepth(getPreviewOverlayDepth(1));

  // Bus-stop tool hover highlight (green/red diamond under the cursor)
  this.busStopHighlightGraphic = this.add.graphics();
  addToRenderLayer(this, this.busStopHighlightGraphic, 'effectLayer');
  this.busStopHighlightGraphic.setDepth(getPreviewOverlayDepth(1));

  // Paint roads on left click; start panning on right click.
  // While a calibrator owns the mouse (isVisualRouteCalibrationInputCaptured) the tools stand
  // down, but right-drag still pans the camera so the calibrator can be moved around the city.
  this.input.on('pointerdown', (pointer) => {
    if (typeof isVisualRouteCalibrationInputCaptured === 'function'
      && isVisualRouteCalibrationInputCaptured(this) && pointer.button !== 2) return;
    if (pointer.button === 0) {
      if (typeof isTransportRoutePicking === 'function' && isTransportRoutePicking()) {
        const routeStopTile = pointerToTile(this, pointer);
        if (routeStopTile && typeof handleTransportRouteMapClick === 'function') {
          handleTransportRouteMapClick(routeStopTile.row, routeStopTile.col);
        }
        return;
      }
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
    if (typeof isVisualRouteCalibrationInputCaptured === 'function'
      && isVisualRouteCalibrationInputCaptured(this) && pointer.button !== 2) return;
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
    if (typeof isVisualRouteCalibrationInputCaptured === 'function'
      && isVisualRouteCalibrationInputCaptured(this) && !this.isPanning) return;
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
      updateTerrainViewportCulling(this);
    }

    updateBuildingPlacementGuide(this, pointer);

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

    // Bus-stop highlight — green (placeable) / red (blocked) diamond on the
    // hovered tile, same pattern as the inspect highlight above.
    if (selectedTool === 'bus-stop') {
      const cur = pointerToTile(this, pointer);
      if (cur) drawBusStopHighlight(this, cur.row, cur.col);
      else if (this.busStopHighlightGraphic) this.busStopHighlightGraphic.clear();
    } else if (this.busStopHighlightGraphic) {
      this.busStopHighlightGraphic.clear();
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
    if (deltaY === 0) return;
    changeMapZoom(this, deltaY < 0 ? 1 : -1, pointer.x, pointer.y);
  });

  // Spacebar pause shortcut
  this.input.keyboard.on('keydown-SPACE', () => toggleSimPause());

  startAmbientSoundscape(this);

  // Sim timer starts once player dismisses the landing screen. The world stays hidden behind
  // the landing artwork until attract mode (started from setupLandingScreen) has loaded the
  // showcase city; if that is off or fails, nothing is rendered behind the menu.
  this.scene.setVisible(false);
  gameReady = true;
  if (typeof recordVisualRoutePerformanceMilestone === 'function') {
    recordVisualRoutePerformanceMilestone('gameReady');
  }
  setPreloadProgressPercent(100);
  initBudgetPanel();
  updateHUD();
  setupLandingScreen();
}

function setupPreloadProgressUi(scene) {
  populateLoadingHintTicker();
  setPreloadProgressPercent(0);
  playTitleLoadingAudio();

  // The landing bar reports the boot preload only. The same loader later runs one-file
  // passes on demand (zone textures, building night bakes, vehicle bundles...) and every
  // pass emits progress 0 then 100, so a listener left attached made the title screen's
  // "loading assets" bar flash 0% / 100% for each building the attract city dressed at dusk.
  const onProgress = (value) => {
    setPreloadProgressPercent(Math.max(0, Math.min(100, Math.round(value * 100))));
  };
  scene.load.on('progress', onProgress);

  scene.load.once('complete', () => {
    scene.load.off('progress', onProgress);
    setPreloadProgressPercent(100);
    if (!isTitleLoadingAudioPlaying()) {
      playTitleLoadingAudio();
    }
  });
}

function setPreloadProgressPercent(percent) {
  const fill = document.getElementById('landing-preload-fill');
  const percentLabel = document.getElementById('landing-preload-percent');
  if (fill) fill.style.width = `${percent}%`;
  if (percentLabel) percentLabel.textContent = `${percent}%`;
}

function setRoadTileSet(id, options = {}) {
  const { refresh = true, notify = false } = options;
  if (typeof setCurrentRoadTileSetId !== 'function') return id;

  const previousId = typeof getCurrentRoadTileSetId === 'function'
    ? getCurrentRoadTileSetId()
    : ROAD_TILE_SET_DEFAULT_ID;
  const nextId = setCurrentRoadTileSetId(id);

  if (refresh && activeScene?.tileSprites?.length) {
    refreshAllTiles(activeScene);
    sortWorldRenderLayers(activeScene);
  }

  updateRoadTileSetControls();

  if (notify && previousId !== nextId && typeof showToast === 'function') {
    const set = getRoadTileSet(nextId);
    showToast(t('toast.roadTileSetChanged', { set: t(set.labelKey) }), 'info');
  }

  return nextId;
}

function populateRoadTileSetSelect(select) {
  if (!select || typeof getRoadTileSets !== 'function') return;
  const selectedId = select.value || getCurrentRoadTileSetId();
  select.innerHTML = '';
  getRoadTileSets().forEach((set) => {
    const option = document.createElement('option');
    option.value = set.id;
    option.textContent = t(set.labelKey);
    select.appendChild(option);
  });
  select.value = normalizeRoadTileSetId(selectedId);
}

function populateRoadTileSetOptions() {
  const container = document.getElementById('road-tile-set-options');
  if (!container || typeof getRoadTileSets !== 'function') return;

  container.innerHTML = '';
  getRoadTileSets().forEach((set) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'road-tile-set-option';
    button.dataset.roadTileSetId = set.id;

    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'road-tile-set-option-name';
    name.textContent = t(set.labelKey);
    text.appendChild(name);

    const desc = document.createElement('span');
    desc.className = 'road-tile-set-option-desc';
    desc.textContent = t(set.descriptionKey);
    text.appendChild(desc);

    const preview = document.createElement('span');
    preview.className = 'road-tile-set-preview';
    getRoadTilePreviewAssets(set.id).forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      preview.appendChild(img);
    });

    button.appendChild(text);
    button.appendChild(preview);
    button.addEventListener('click', () => {
      setRoadTileSet(set.id, { refresh: true, notify: true });
    });
    container.appendChild(button);
  });

  updateRoadTileSetControls();
}

function updateRoadTileSetControls() {
  if (typeof getCurrentRoadTileSetId !== 'function') return;
  const activeId = getCurrentRoadTileSetId();
  document.querySelectorAll('[data-road-tile-set-id]').forEach((button) => {
    const active = button.dataset.roadTileSetId === activeId;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const select = document.getElementById('newgame-road-tile-set');
  if (select && select.options.length > 0) {
    select.value = activeId;
  }
}

function setupRoadTileSetWindow() {
  const win = document.getElementById('road-tile-set-window');
  const titlebar = document.getElementById('road-tile-set-window-titlebar');
  const closeBtn = document.getElementById('road-tile-set-window-close');
  const minBtn = document.getElementById('road-tile-set-window-min-btn');
  if (!win || !titlebar || !closeBtn) return;

  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('click', (e) => e.stopPropagation());

  closeBtn.addEventListener('click', closeRoadTileSetWindow);
  minBtn?.addEventListener('click', () => {
    win.classList.toggle('is-collapsed');
    minBtn.textContent = win.classList.contains('is-collapsed') ? '+' : '−';
  });

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  titlebar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#road-tile-set-window-close') || e.target.closest('#road-tile-set-window-min-btn')) return;
    dragging = true;
    const rect = win.getBoundingClientRect();
    win.style.left = `${rect.left}px`;
    win.style.top = `${rect.top}px`;
    win.style.right = 'auto';
    win.style.bottom = 'auto';
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    titlebar.setPointerCapture(e.pointerId);
  });

  titlebar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const width = win.offsetWidth;
    const height = win.offsetHeight;
    const maxX = Math.max(0, window.innerWidth - width);
    const maxY = Math.max(0, window.innerHeight - height);
    const nextLeft = Math.max(0, Math.min(maxX, e.clientX - offsetX));
    const nextTop = Math.max(0, Math.min(maxY, e.clientY - offsetY));
    win.style.left = `${nextLeft}px`;
    win.style.top = `${nextTop}px`;
  });

  titlebar.addEventListener('pointerup', () => {
    dragging = false;
  });

  document.addEventListener('languagechange', () => {
    populateRoadTileSetOptions();
    populateRoadTileSetSelect(document.getElementById('newgame-road-tile-set'));
  });

  populateRoadTileSetOptions();
}

function openRoadTileSetWindow() {
  populateRoadTileSetOptions();
  document.getElementById('road-tile-set-window')?.classList.add('is-open');
}

function closeRoadTileSetWindow() {
  document.getElementById('road-tile-set-window')?.classList.remove('is-open');
}

function getLoadingHintMessages(maxTips = 40) {
  const hints = [];
  for (let index = 1; index <= maxTips; index++) {
    const key = `tip.${index}`;
    const text = t(key);
    if (text === key) break;
    hints.push(text);
  }

  if (hints.length === 0) {
    hints.push(t('landing.tagline'));
  }

  return hints;
}

function populateLoadingHintTicker() {
  const hintInner = document.getElementById('landing-hint-inner');
  const hintTrack = document.getElementById('landing-hint-track');
  if (!hintInner) return;

  const line = getLoadingHintMessages().join('   |   ');
  hintInner.textContent = `${line}   |   ${line}`;

  if (hintTrack) {
    const chars = line.length;
    const seconds = Math.max(90, Math.min(260, Math.round(chars * 0.14)));
    hintTrack.style.animationDuration = `${seconds}s`;
  }
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
    button.title = t('tool.houseSetTitle', { label: config.label });
    button.setAttribute('aria-label', t('tool.houseSetTitle', { label: config.label }));

    const image = document.createElement('img');
    image.src = model.path;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.textContent = config.label;

    button.append(image, label);
    sizeMenu.append(button);
  });

  const selectedModels = houseModelSets[selectedHouseSet] ?? [];
  if (selectedModels.length > 1) {
    const modelRow = document.createElement('div');
    modelRow.className = 'house-model-row';

    selectedModels.forEach((model, index) => {
      const button = document.createElement('button');
      button.className = 'house-model-button';
      button.type = 'button';
      button.dataset.houseModelSet = selectedHouseSet;
      button.dataset.houseModelIndex = String(index);
      button.classList.toggle('is-active', index === getSelectedHouseIndex(selectedHouseSet));
      button.title = t('tool.houseModelTitle', { label: HOUSE_MODEL_SETS[selectedHouseSet]?.label ?? '', model: model.title });
      button.setAttribute('aria-label', button.title);

      const image = document.createElement('img');
      image.src = model.path;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');

      const badge = document.createElement('span');
      badge.textContent = String(index + 1);

      button.append(image, badge);
      modelRow.append(button);
    });

    sizeMenu.append(modelRow);
  }

  const buttonBounds = triggerButton?.getBoundingClientRect();
  if (buttonBounds) {
    sizeMenu.style.left = `${Math.round(buttonBounds.right + 8)}px`;
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

function setSelectedHouseIndex(tool, index) {
  const models = houseModelSets[tool] ?? [];
  if (models.length === 0) {
    selectedHouseIndices[tool] = 0;
    return;
  }
  const clampedIndex = Math.max(0, Math.min(index, models.length - 1));
  selectedHouseIndices[tool] = clampedIndex;
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
  button.title = t('tool.houseAddTitle', { label: HOUSE_MODEL_SETS[selectedHouseSet]?.label ?? '', model: model.title });
  button.setAttribute('aria-label', button.title);
}

// ── Rotate cluster (bottom-right) ────────────────────────────────────────────

function clampMapZoom(zoom) {
  return Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, Number(zoom) || 1));
}

function formatMapZoomLabel(zoom) {
  const rounded = Math.round(clampMapZoom(zoom) * 100) / 100;
  return `${rounded.toFixed(2).replace(/\.0+$|(?<=\.[0-9])0$/, '')}×`;
}

function updateMapNavigationControls(scene = activeScene) {
  const camera = scene?.cameras?.main;
  const currentZoom = clampMapZoom(camera?.zoom ?? 1);
  const zoomLabel = document.getElementById('map-zoom-label');
  if (zoomLabel) zoomLabel.textContent = formatMapZoomLabel(currentZoom);
  const zoomOutButton = document.getElementById('btn-map-zoom-out');
  const zoomInButton = document.getElementById('btn-map-zoom-in');
  if (zoomOutButton) zoomOutButton.disabled = !!camera && currentZoom <= MAP_ZOOM_MIN + 0.0001;
  if (zoomInButton) zoomInButton.disabled = !!camera && currentZoom >= MAP_ZOOM_MAX - 0.0001;

  const musicButton = document.getElementById('btn-map-music');
  const musicLabel = document.getElementById('map-music-label');
  const musicPlaying = isMusicPlaying || isTitleLoadingAudioPlaying();
  const labelKey = musicPlaying ? 'tool.musicOnShort' : 'tool.musicOffShort';
  const actionKey = musicPlaying ? 'tool.musicMute' : 'tool.musicUnmute';
  musicButton?.classList.toggle('is-muted', !musicPlaying);
  musicButton?.setAttribute('aria-pressed', String(!musicPlaying));
  musicButton?.setAttribute('aria-label', t(actionKey));
  musicButton?.setAttribute('title', t(actionKey));
  if (musicLabel) musicLabel.textContent = t(labelKey);
}

function setMapZoom(scene, requestedZoom, anchorScreenX, anchorScreenY) {
  const camera = scene?.cameras?.main;
  if (!camera) return null;
  const previousZoom = Math.max(0.0001, Number(camera.zoom) || 1);
  const nextZoom = clampMapZoom(requestedZoom);
  const anchorX = Number.isFinite(anchorScreenX) ? anchorScreenX : camera.width / 2;
  const anchorY = Number.isFinite(anchorScreenY) ? anchorScreenY : camera.height / 2;
  const worldX = camera.scrollX + anchorX / previousZoom;
  const worldY = camera.scrollY + anchorY / previousZoom;
  camera.setZoom(nextZoom);
  camera.scrollX = worldX - anchorX / nextZoom;
  camera.scrollY = worldY - anchorY / nextZoom;
  updateTerrainViewportCulling(scene, true);
  if (typeof invalidateTrafficVisualView === 'function') invalidateTrafficVisualView(scene);
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(scene);
  if (typeof invalidateVesselVisualView === 'function') invalidateVesselVisualView(scene);
  if (typeof invalidateAircraftVisualView === 'function') invalidateAircraftVisualView(scene);
  updateAmbientSoundscape(scene);
  syncWeatherFxToCamera(scene);
  if (typeof updateDynamicLighting === 'function') updateDynamicLighting(scene); // cloud layer's zoom<1.2 gate reacts immediately
  updateMapNavigationControls(scene);
  return nextZoom;
}

function changeMapZoom(scene, direction, anchorScreenX, anchorScreenY) {
  const currentZoom = Number(scene?.cameras?.main?.zoom) || 1;
  const factor = direction > 0 ? MAP_ZOOM_STEP : (1 / MAP_ZOOM_STEP);
  return setMapZoom(scene, currentZoom * factor, anchorScreenX, anchorScreenY);
}

function isMapKeyboardNavigationBlocked(target = document.activeElement) {
  if (!activeScene || !gameReady) return true;
  const landing = document.getElementById('landing-screen');
  if (landing && getComputedStyle(landing).display !== 'none') return true;
  if (target?.closest?.('input, textarea, select, button, [contenteditable="true"]')) return true;
  return [...document.querySelectorAll('.sim-dialog')]
    .some((dialog) => getComputedStyle(dialog).display !== 'none');
}

function setupMapKeyboardNavigation() {
  if (mapKeyboardNavigationReady) return;
  mapKeyboardNavigationReady = true;
  const arrowKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  document.addEventListener('keydown', (event) => {
    if (!arrowKeys.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isMapKeyboardNavigationBlocked(event.target)) return;
    event.preventDefault();
    heldMapPanKeys.add(event.key);
  });
  document.addEventListener('keyup', (event) => {
    if (arrowKeys.has(event.key)) heldMapPanKeys.delete(event.key);
  });
  window.addEventListener('blur', () => heldMapPanKeys.clear());
}

function updateKeyboardMapPan(scene, deltaMs) {
  if (!heldMapPanKeys.size) return false;
  if (isMapKeyboardNavigationBlocked()) {
    heldMapPanKeys.clear();
    return false;
  }
  const camera = scene?.cameras?.main;
  if (!camera) return false;
  const horizontal = Number(heldMapPanKeys.has('ArrowRight')) - Number(heldMapPanKeys.has('ArrowLeft'));
  const vertical = Number(heldMapPanKeys.has('ArrowDown')) - Number(heldMapPanKeys.has('ArrowUp'));
  if (!horizontal && !vertical) return false;
  const magnitude = Math.hypot(horizontal, vertical) || 1;
  const seconds = Math.min(50, Math.max(0, Number(deltaMs) || 0)) / 1000;
  const worldDistance = MAP_KEYBOARD_PAN_SPEED * seconds / Math.max(0.0001, camera.zoom);
  camera.scrollX += (horizontal / magnitude) * worldDistance;
  camera.scrollY += (vertical / magnitude) * worldDistance;
  return true;
}

function setupRotateCluster() {
  const cluster = document.getElementById('rotate-cluster');
  const zoomControl = document.querySelector('.map-zoom-control');

  if (cluster) {
    cluster.addEventListener('pointerdown', (e) => e.stopPropagation());
    cluster.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || !activeScene) return;
      if (btn.id === 'btn-rotate-cw')  rotateMap(activeScene, 1);
      if (btn.id === 'btn-rotate-ccw') rotateMap(activeScene, -1);
      if (btn.id === 'btn-map-music') toggleMusic();
    });
  }

  // This control used to live inside #rotate-cluster. It now sits at the top
  // right, so it needs its own listener instead of relying on event bubbling to
  // the old parent.
  if (zoomControl) {
    zoomControl.addEventListener('pointerdown', (e) => e.stopPropagation());
    zoomControl.addEventListener('click', (e) => {
      const btn = e.target.closest('.map-zoom-btn');
      if (!btn || btn.disabled || !activeScene) return;
      if (btn.id === 'btn-map-zoom-in') changeMapZoom(activeScene, 1);
      if (btn.id === 'btn-map-zoom-out') changeMapZoom(activeScene, -1);
    });
  }
  setupMapKeyboardNavigation();
  updateMapNavigationControls();
}

function updateMapMetrics(scene) {
  const mapWidthPx = (MAP_WIDTH + MAP_HEIGHT) * (TILE_WIDTH / 2);
  const mapHeightPx = (MAP_WIDTH + MAP_HEIGHT) * (TILE_HEIGHT / 2);

  scene.mapWidthPx = mapWidthPx;
  scene.mapHeightPx = mapHeightPx;
  scene.offsetX = (scene.cameras.main.width - mapWidthPx) / 2;
  scene.offsetY = (scene.cameras.main.height - mapHeightPx) / 2;
}

const WORLD_MASK_BASE_EDGE_BLEED = 220;
const WORLD_MASK_BUILDING_PADDING = 96;

function getBuildingWorldMaskBleed(building) {
  if (!building) return WORLD_MASK_BASE_EDGE_BLEED;

  const scaleX = Math.abs(Number(building.scaleX) || 1);
  const scaleY = Math.abs(Number(building.scaleY) || 1);
  const displayWidth = Math.abs(Number(building.displayWidth))
    || Math.abs(Number(building.width) || 0) * scaleX;
  const displayHeight = Math.abs(Number(building.displayHeight))
    || Math.abs(Number(building.height) || 0) * scaleY;
  const originX = Math.max(0, Math.min(1, Number.isFinite(Number(building.originX))
    ? Number(building.originX)
    : 0.5));
  const originY = Math.max(0, Math.min(1, Number.isFinite(Number(building.originY))
    ? Number(building.originY)
    : 1));

  // A sprite can overhang any side of the isometric diamond.  Use its largest
  // anchored extent, then leave room for elevated terrain and antialiased
  // pixels so tall/narrow models never meet the clipping edge exactly.
  const horizontalExtent = displayWidth * Math.max(originX, 1 - originX);
  const verticalExtent = displayHeight * Math.max(originY, 1 - originY);
  return Math.ceil(Math.max(horizontalExtent, verticalExtent) + WORLD_MASK_BUILDING_PADDING);
}

function ensureWorldMaskContainsBuilding(scene, building) {
  const requiredBleed = Math.max(
    WORLD_MASK_BASE_EDGE_BLEED,
    getBuildingWorldMaskBleed(building),
  );
  const currentBleed = scene.worldMaskRequiredBleed ?? WORLD_MASK_BASE_EDGE_BLEED;
  if (requiredBleed <= currentBleed) return;

  scene.worldMaskRequiredBleed = requiredBleed;
  if (scene.maskGraphics) drawWorldMask(scene);
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

  const top = {
    x: topPt.x + ox,
    y: topPt.y + oy - TILE_IMAGE_HEIGHT,
  };
  const right = {
    x: rightPt.x + ox + TILE_WIDTH / 2,
    y: rightPt.y + oy - TILE_IMAGE_HEIGHT + TILE_HEIGHT / 2,
  };
  const bottom = {
    x: bottomPt.x + ox,
    y: bottomPt.y + oy,
  };
  const left = {
    x: leftPt.x + ox - TILE_WIDTH / 2,
    y: leftPt.y + oy - TILE_IMAGE_HEIGHT + TILE_HEIGHT / 2,
  };

  const center = {
    x: (top.x + right.x + bottom.x + left.x) / 4,
    y: (top.y + right.y + bottom.y + left.y) / 4,
  };

  const edgeBleed = Math.max(
    WORLD_MASK_BASE_EDGE_BLEED,
    scene.worldMaskRequiredBleed ?? 0,
  );
  const BOTTOM_BLEED = 24;
  const expandFromCenter = (point, extra = 0) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const bleed = edgeBleed + extra;
    return {
      x: point.x + (dx / length) * bleed,
      y: point.y + (dy / length) * bleed,
    };
  };

  const topMask = expandFromCenter(top, 20);
  const rightMask = expandFromCenter(right, 8);
  const bottomMask = expandFromCenter(bottom, BOTTOM_BLEED);
  const leftMask = expandFromCenter(left, 8);

  graphics.clear();
  graphics.fillStyle(0xffffff, 1);
  graphics.beginPath();
  graphics.moveTo(topMask.x, topMask.y);
  graphics.lineTo(rightMask.x, rightMask.y);
  graphics.lineTo(bottomMask.x, bottomMask.y);
  graphics.lineTo(leftMask.x, leftMask.y);
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

  scene.treeSprites?.forEach((sprites) => {
    sprites.forEach((sprite) => positionTree(scene, sprite));
  });
  // Debris (bare-land rubble) used to be skipped here, so every rotation left the old pile
  // of sprites floating at their previous screen spots - over the sea, once the map turned.
  scene.debrisSprites?.forEach((sprite) => positionDebrisSprite(scene, sprite));

  scene.busStopSprites?.forEach((sprite) => positionBusStopSprite(scene, sprite));
  // Signal poles and street lamps hang off the same map offsets (window resize) and facings (rotation).
  if (typeof refreshAllTrafficSignalSprites === 'function') refreshAllTrafficSignalSprites(scene);
  if (typeof refreshAllStreetLampSprites === 'function') refreshAllStreetLampSprites(scene);
  if (typeof refreshAllBridgeParapetSprites === 'function') refreshAllBridgeParapetSprites(scene);
  if (typeof refreshAllPedestrianRailingSprites === 'function') refreshAllPedestrianRailingSprites(scene);
  if (typeof refreshAllStreetFurnitureSprites === 'function') refreshAllStreetFurnitureSprites(scene);

  if (typeof repositionDistrictSignSprites === 'function') repositionDistrictSignSprites(scene);

  repositionBridgeSprites(scene);
  repositionOverlays(scene);
  updateTerrainViewportCulling(scene, true);
  sortWorldRenderLayers(scene);
}


function canPlaceRoad(scene, row, col) {
  if (!isInsideMap(row, col)) return false;
  if (scene?.buildingSprites?.has(getTileId(row, col))) return false;
  if (buildingData[getTileId(row, col)]) return false;
  if (!isSupportedRoadSlopeTile(row, col)) return false;
  return true;
}

function isSlopeTile(row, col) {
  return getTileHeight(row, col) > 0 && getHillOpenEdges(row, col).length > 0;
}

function isSupportedRoadSlopeTile(row, col) {
  return !isSlopeTile(row, col) || !!getSupportedRoadSlopeKey(row, col);
}

function getSupportedRoadSlopeKey(row, col) {
  if (!isSlopeTile(row, col)) return null;

  const openEdges = getHillOpenEdges(row, col);
  if (openEdges.length === 1) {
    return `road_hill_${openEdges[0]}`;
  }
  if (openEdges.length === 2 && areOppositeDirs(openEdges[0], openEdges[1])) {
    const axisDir = openEdges.includes('n') ? 'n' : 'e';
    return `road_hill2_${axisDir}`;
  }

  return null;
}

// ── Tool helpers ──────────────────────────────────────────────────────────────

function isZoneTool() {
  return selectedTool === 'zone-res' || selectedTool === 'zone-com' || selectedTool === 'zone-ind';
}

function isNewToolHandledByToolsModule(tool) {
  return tool === 'zone-res'
    || tool === 'zone-com'
    || tool === 'zone-ind'
    || tool === 'dezone'
    || tool === 'power-line'
    || tool === 'power-coal'
    || tool === 'power-solar'
    || tool === 'power-nuclear'
    || tool === 'fire-station'
    || tool === 'police-station'
    || tool === 'primary-school'
    || tool === 'secondary-school'
    || tool === 'library'
    || tool === 'community-college'
    || tool === 'university'
    || tool === 'hospital'
    || tool === 'legislative-council'
    || tool === 'stock-exchange'
    || tool === 'park'
    || tool === 'park-small'
    || tool === 'park-large'
    || tool === 'sports-ground'
    || tool === 'tree'
    || tool === 'district-sign'
    || tool === 'bus-stop';
}

function getSelectedPlacementFootprint() {
  if (selectedTool === 'district-sign') return { footprintCols: 1, footprintRows: 1 };
  if (selectedTool === 'tree') return { footprintCols: 1, footprintRows: 1 };
  if (selectedTool === 'house') {
    const config = HOUSE_MODEL_SETS[selectedHouseSet] ?? HOUSE_MODEL_SETS.house;
    return {
      footprintCols: config.footprintCols ?? 1,
      footprintRows: config.footprintRows ?? 1,
    };
  }

  if (selectedTool === 'park') {
    const option = getSelectedParkOption();
    return {
      footprintCols: option.footprintCols ?? 1,
      footprintRows: option.footprintRows ?? 1,
    };
  }

  if (selectedTool === 'sports-ground') {
    const option = typeof getSelectedSportsGroundOption === 'function'
      ? getSelectedSportsGroundOption()
      : SPORT_GROUND_OPTIONS[0];
    return {
      footprintCols: option.footprintCols ?? 2,
      footprintRows: option.footprintRows ?? 2,
    };
  }

  if (selectedTool === 'park-small') return { footprintCols: 1, footprintRows: 1 };
  if (selectedTool === 'park-large') return { footprintCols: 3, footprintRows: 3 };
  if (selectedTool === 'bus-depot') return { footprintCols: BUS_DEPOT_FOOTPRINT_COLS, footprintRows: BUS_DEPOT_FOOTPRINT_ROWS };

  const infraTypeByTool = {
    'power-coal':    'power_plant_coal',
    'power-solar':   'power_plant_solar',
    'power-nuclear': 'power_plant_nuclear',
    'fire-station': 'fire_station',
    'police-station': 'police_station',
    'primary-school': 'primary_school',
    'secondary-school': 'secondary_school',
    'library': 'library',
    'community-college': 'community_college',
    'university': 'university',
    'hospital': 'hospital',
    'legislative-council': 'legislative_council',
    'stock-exchange': 'stock_exchange',
  };
  const infraType = infraTypeByTool[selectedTool];
  if (infraType) {
    const model = POWER_PLANT_MODELS[infraType] ?? SERVICE_BUILDING_MODELS[infraType];
    return {
      footprintCols: model?.footprintCols ?? 1,
      footprintRows: model?.footprintRows ?? 1,
    };
  }

  const landmarkType = typeof LANDMARK_TOOL_BUILDING_TYPES !== 'undefined'
    ? LANDMARK_TOOL_BUILDING_TYPES[selectedTool]
    : null;
  if (landmarkType === HARBOR_BUILDING_TYPE) {
    return { footprintCols: HARBOR_FOOTPRINT_COLS, footprintRows: HARBOR_FOOTPRINT_ROWS };
  }
  if (landmarkType) {
    const model = SPECIAL_BUILDING_MODELS[landmarkType];
    return {
      footprintCols: model?.footprintCols ?? 1,
      footprintRows: model?.footprintRows ?? 1,
    };
  }

  return null;
}

function shouldShowBuildingPlacementGuide(pointer) {
  if (isPainting || selectedTool === 'inspect') return false;
  if (pointer.event?.target?.closest('#tool-menu, #hud, #budget-panel, #budget-window, #road-tile-set-window, #transport-window, .vehicle-tracker-window, #toast-container, #speed-controls, #top-bar, .sim-dialog, #jukebox-window, #rotate-cluster, #overlay-window, #inspect-panel, #terrain-minimap-panel')) {
    return false;
  }
  return Boolean(getSelectedPlacementFootprint());
}

// Apply the active tool to a specific logical tile (no pointer math, no dedup).
function applyToolAt(scene, row, col, pointer = null) {
  if (!isInsideMap(row, col)) return;

  // Querying a district sign edits its bilingual label directly.
  if (selectedTool === 'inspect') {
    // Transport Mode: an inspect click on a bus-stop tile opens the stop's
    // own info window (waiting passengers, serving routes) - the mayor's
    // #inspect-panel is CSS-hidden in this mode anyway.
    if (typeof isTransportModeActive !== 'undefined' && isTransportModeActive) {
      const transportStop = typeof getTransportStopAt === 'function'
        ? getTransportStopAt(row, col, { presentOnly: true })
        : null;
      if (transportStop && typeof openTransportStopInspector === 'function') {
        openTransportStopInspector(transportStop.id, pointer);
      }
      return;
    }
    const districtSign = typeof getDistrictSigns === 'function'
      && (typeof areDistrictSignsVisible !== 'function' || areDistrictSignsVisible())
      ? getDistrictSigns().find((sign) => sign.row === row && sign.col === col)
      : null;
    if (districtSign && typeof editDistrictSign === 'function') {
      editDistrictSign(scene, districtSign).catch((error) => console.warn('[District sign edit]', error));
      return;
    }
    showInspectPanel(scene, row, col, pointer);
    return;
  }

  if (isTerrainCreatorMode && selectedTool !== 'terrain') {
    showToast(t('toast.terrainCreatorOnlyTerrainTools'), 'warning');
    return;
  }

  // New tools (zones, power, services, dezone) handled in tools.js
  if (handleNewTool(scene, { row, col })) return;
  if (isNewToolHandledByToolsModule(selectedTool)) return;

  if (selectedTool === 'house')    { placeHouse(scene, row, col);    return; }

  if (selectedTool === 'bulldoze') {
    spendBudget(COST_BULLDOZE);
    if (typeof removeDistrictSignAt === 'function') removeDistrictSignAt(scene, row, col);
    removeBuilding(scene, row, col);
    removeTree(scene, row, col);
    const clearedDebris = removeDebris(scene, row, col);
    removeBusStopsAt(scene, row, col);
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
    } else if (clearedDebris && mapData[row][col] === DIRT) {
      // Hauling away a dumped car/container is tidying up, not redeveloping
      // the lot - unlike a real demolition, leave the bare-land dirt patch
      // itself in place so clearing an eyesore doesn't also force the tile
      // back to grass for a player who's fine with the scrubland look.
      if (typeof showToast === 'function') showToast(t('toast.debrisCleared'), 'info');
    } else {
      if (mapData[row][col] === ROAD) roadTileCount = Math.max(0, roadTileCount - 1);
      mapData[row][col] = bulldozeHeight > 0 ? HILL : GROUND;
    }
    reconcileSurfaceTerrainFromHeight(row, col, 2);
    refreshTileArea(scene, row, col);
    invalidateOrphanedNeighborDebris(scene, row, col);
    if (typeof markTrafficNetworkDirty === 'function') markTrafficNetworkDirty([{ row, col }]);
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

function applySelectedTool(scene, pointer) {
  if (pointer.event?.target?.closest('#tool-menu, #hud, #budget-panel, #budget-window, #road-tile-set-window, #transport-window, .vehicle-tracker-window, #toast-container, #speed-controls, #top-bar, .sim-dialog, #jukebox-window, #rotate-cluster, #overlay-window, #inspect-panel, #terrain-minimap-panel')) return;

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
    if (!isBuildingPixelOpaque(scene, building, worldPoint.x, worldPoint.y)) return;
    if (!best || building.depth > best.depth) best = building;
  });

  return best;
}

function isBuildingPixelOpaque(scene, building, worldX, worldY) {
  const frame = building.frame;
  if (!frame) return true;

  const displayWidth = building.displayWidth || frame.width || 1;
  const displayHeight = building.displayHeight || frame.height || 1;
  const left = building.x - (building.originX ?? 0.5) * displayWidth;
  const top = building.y - (building.originY ?? 0.5) * displayHeight;
  const textureX = Math.floor(((worldX - left) / displayWidth) * frame.width);
  const textureY = Math.floor(((worldY - top) / displayHeight) * frame.height);

  if (textureX < 0 || textureY < 0 || textureX >= frame.width || textureY >= frame.height) {
    return false;
  }

  if (typeof scene.textures?.getPixelAlpha === 'function') {
    const alpha = scene.textures.getPixelAlpha(
      textureX + (frame.x ?? 0),
      textureY + (frame.y ?? 0),
      building.texture.key,
    );
    return alpha > 8;
  }

  return true;
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

function isRoadLikeTile(row, col) {
  return isInsideMap(row, col) && (mapData[row][col] === ROAD || isBridgeDeckTile(row, col));
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

  carriagewayWideRefreshSuppressed = true;
  try {
    uniqueTiles.forEach(({ row, col }) => {
      setTileType(scene, row, col, ROAD);
    });
  } finally {
    carriagewayWideRefreshSuppressed = false;
  }
  const rows = uniqueTiles.map((tile) => tile.row);
  const cols = uniqueTiles.map((tile) => tile.col);
  refreshCarriagewayBandRegion(scene, Math.min(...rows), Math.max(...rows), Math.min(...cols), Math.max(...cols));

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

// ── Bus-stop hover highlight (green = placeable, red = blocked) ───────────────

function drawBusStopHighlight(scene, row, col) {
  const g = scene.busStopHighlightGraphic;
  if (!g) return;
  g.clear();
  const canPlace = Boolean(getBusStopEligibleSides(row, col));
  const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
  const color = canPlace ? 0x22c78a : 0xff4d4d;
  g.fillStyle(color, 0.22);
  g.lineStyle(2, color, 0.95);
  g.beginPath();
  g.moveTo(geom.top.x, geom.top.y);
  g.lineTo(geom.right.x, geom.right.y);
  g.lineTo(geom.bottom.x, geom.bottom.y);
  g.lineTo(geom.left.x, geom.left.y);
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

function updateBuildingPlacementGuide(scene, pointer) {
  const g = scene.buildingGuideGraphic;
  if (!g) return;
  g.clear();

  if (!shouldShowBuildingPlacementGuide(pointer)) return;

  const tile = pointerToTile(scene, pointer);
  const footprint = getSelectedPlacementFootprint();
  if (!tile || !footprint) return;

  if (selectedTool === 'district-sign' && typeof drawDistrictRadiusGuide === 'function') {
    drawDistrictRadiusGuide(scene, tile.row, tile.col, canPlaceDistrictSign(scene, tile.row, tile.col));
    return;
  }

  const { footprintCols, footprintRows } = footprint;
  const canPlace = selectedTool === 'harbor' && typeof canPlaceHarborFootprint === 'function'
    ? canPlaceHarborFootprint(tile.row, tile.col)
    : selectedTool === 'bus-depot'
      ? canPlaceOrRotateBusDepot(scene, tile.row, tile.col)
      : selectedTool === 'tree'
        ? canPlantTreeAt(scene, tile.row, tile.col)
        : canPlaceBuildingFootprint(tile.row, tile.col, footprintCols, footprintRows);
  drawFootprintGuide(scene, tile.row, tile.col, footprintCols, footprintRows, canPlace);
}

// A hover over an already-placed depot doesn't block placement - clicking it
// rotates its orientation instead (see placeBusDepotBuilding, tools.js) - so
// the footprint guide should read as "OK" there too, not "blocked".
function canPlaceOrRotateBusDepot(scene, row, col) {
  const sprite = scene?.buildingSprites?.get(getTileId(row, col));
  if (sprite && buildingData[getTileId(sprite.mapRow, sprite.mapCol)]?.type === 'bus_depot') return true;
  return canPlaceBuildingFootprint(row, col, BUS_DEPOT_FOOTPRINT_COLS, BUS_DEPOT_FOOTPRINT_ROWS);
}

function drawFootprintGuide(scene, row, col, footprintCols = 1, footprintRows = 1, canPlace = true) {
  const g = scene.buildingGuideGraphic;
  if (!g) return;

  const color = canPlace ? 0x45e6c3 : 0xff4d4d;
  const tiles = getFootprintTiles(row, col, footprintCols, footprintRows)
    .filter(([tileRow, tileCol]) => isInsideMap(tileRow, tileCol));
  if (tiles.length === 0) return;

  g.fillStyle(color, canPlace ? 0.16 : 0.20);
  g.lineStyle(1, color, canPlace ? 0.42 : 0.55);
  tiles.forEach(([tileRow, tileCol]) => {
    const geom = getTileFaceGeometry(tileRow, tileCol, scene.offsetX, scene.offsetY);
    g.beginPath();
    g.moveTo(geom.top.x, geom.top.y);
    g.lineTo(geom.right.x, geom.right.y);
    g.lineTo(geom.bottom.x, geom.bottom.y);
    g.lineTo(geom.left.x, geom.left.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  });

  const vertices = tiles.flatMap(([tileRow, tileCol]) => (
    getTileFaceVertices(tileRow, tileCol, scene.offsetX, scene.offsetY, TILE_WIDTH / 2, TILE_HEIGHT / 2)
  ));
  let north = vertices[0], east = vertices[0], south = vertices[0], west = vertices[0];
  vertices.forEach((pt) => {
    if (pt.y < north.y) north = pt;
    if (pt.x > east.x) east = pt;
    if (pt.y > south.y) south = pt;
    if (pt.x < west.x) west = pt;
  });

  g.lineStyle(3, color, 0.95);
  g.beginPath();
  g.moveTo(north.x, north.y);
  g.lineTo(east.x,  east.y);
  g.lineTo(south.x, south.y);
  g.lineTo(west.x,  west.y);
  g.closePath();
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
  if (tileType === HILL && currentHeight > 0 && oldType !== ROAD) {
    heightMap[row][col] = Math.min(MAX_TERRAIN_HEIGHT, currentHeight + 1);
    mapData[row][col] = HILL;
    enforceLocalSlopeConstraints(row, col, 3, 2, 1);
    reconcileSurfaceTerrainFromHeight(row, col);
    refreshTileArea(scene, row, col);
    refreshTreeSprite(scene, row, col);
    if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
    return;
  }

  if (tileType === GROUND && currentHeight > 0 && oldType !== ROAD) {
    const lowered = Math.max(0, currentHeight - 1);
    heightMap[row][col] = lowered;
    mapData[row][col] = lowered > 0 ? HILL : GROUND;
    enforceLocalSlopeConstraints(row, col, 3, 2, 1);
    reconcileSurfaceTerrainFromHeight(row, col);
    refreshTileArea(scene, row, col);
    refreshTreeSprite(scene, row, col);
    if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
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
    removeTree(scene, row, col);
    removeDebris(scene, row, col);
    removeZoneOverlay(scene, row, col);
  }

  if (oldType === ROAD) roadTileCount = Math.max(0, roadTileCount - 1);
  if (tileType === ROAD) roadTileCount++;

  mapData[row][col] = tileType;
  if (tileType !== GROUND && tileType !== HILL) {
    removeTree(scene, row, col);
  }
  if (tileType !== DIRT) {
    removeDebris(scene, row, col);
  }
  invalidateOrphanedNeighborDebris(scene, row, col);

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
  refreshTreeSprite(scene, row, col);

  markPowerGridDirty();
  if (typeof markTrafficNetworkDirty === 'function') markTrafficNetworkDirty([{ row, col }]);
  if (tileType === ROAD && typeof refreshInfrastructureEffects === 'function') {
    refreshInfrastructureEffects(scene);
  }
}

// Set true by a batch placement (e.g. buildRoadPath) around its own setTileType loop, so
// each individual tile only pays for the cheap 3×3 refresh below; the batch then does ONE
// refreshCarriagewayBandRegion call over its whole footprint once every tile is down. See
// that function's comment for why the wide per-tile refresh was too slow to do N times.
let carriagewayWideRefreshSuppressed = false;

// Bus stop sides already converted to rotation-resolved corners (ur/ul/lr/ll — see
// getBusStopVisualCorner) for getRoadLineVariantAt, or null when this tile has no stop.
function getRoadLineBusStopCornersAt(row, col) {
  if (typeof getBusStopSides !== 'function' || typeof getBusStopVisualCorner !== 'function') return null;
  const sides = getBusStopSides(row, col);
  return sides ? sides.map(getBusStopVisualCorner) : null;
}

// Swaps a road tile's sprite onto its calibrated line-marking variant (busStop/arrow/
// zebraCrossing — see road-line-variants.js), or restores the plain tile when none applies.
// `key` is the tile's current (rotated) getTileKey result — only road_straight_v/h can have a
// variant, and getRoadLineVariantAt itself no-ops for anything else, so this is a cheap call
// for every other tile shape.
function applyRoadLineVariantForTile(scene, sprite, row, col, key, baseTextureKey) {
  if (typeof getRoadLineVariantAt !== 'function' || typeof applyRoadLineTexture !== 'function') return;
  const variantId = getRoadLineVariantAt(row, col, {
    roadKeyAt: getTileKey,
    baseRoadKeyAt: getBaseTileKey,
    rotation: mapRotation,
    busStopVisualCornersAt: getRoadLineBusStopCornersAt,
    carriagewayBandAt: typeof getRoadCarriagewayBand === 'function' ? getRoadCarriagewayBand : undefined,
  });
  const tileSetId = typeof getCurrentRoadTileSetId === 'function' ? getCurrentRoadTileSetId() : undefined;
  applyRoadLineTexture(scene, sprite, key, variantId, tileSetId, baseTextureKey);
}

function refreshTileSprite(scene, tileRow, tileCol) {
  const key = getTileKey(tileRow, tileCol);
  const baseTextureKey = resolveTileTextureKey(key);
  const pos = isoToScreen(tileCol, tileRow);
  const sprite = scene.tileSprites[tileRow][tileCol];
  sprite.setTexture(baseTextureKey);
  sprite.setPosition(pos.x + scene.offsetX, pos.y + scene.offsetY + getTerrainTileVisualOffset(tileRow, tileCol, key));
  sprite.setDepth(getTerrainTileDepth(tileRow, tileCol, key, pos.y));
  applyTileVisualStyle(sprite, tileRow, tileCol, key);
  applyRoadLineVariantForTile(scene, sprite, tileRow, tileCol, key, baseTextureKey);
  applyTileTextureDisplayScale(sprite);
  refreshBridgeSprite(scene, tileRow, tileCol);
  invalidateBusStopIfOrphaned(scene, tileRow, tileCol);
  if (typeof markNightRemoteDarknessDirty === 'function') markNightRemoteDarknessDirty(scene);
}

function refreshTileList(scene, tileList) {
  const refreshedTiles = new Set();
  tileList.forEach(([tileRow, tileCol]) => {
    if (!isInsideMap(tileRow, tileCol)) return;
    const dedupeKey = tileRow * MAP_WIDTH + tileCol;
    if (refreshedTiles.has(dedupeKey)) return;
    refreshedTiles.add(dedupeKey);
    refreshTileSprite(scene, tileRow, tileCol);
  });
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

  // A carriageway band's lane count/direction can depend on neighbours far beyond this
  // usual 3×3 (see getRoadCarriagewayBand, CARRIAGEWAY_MAX_BAND_WIDTH), so placing or
  // removing a road tile that touches (or used to touch) a band must re-key the whole
  // square region around it — not just its own row and column (see
  // refreshCarriagewayBandRegion's comment for why a cross-shaped refresh isn't enough).
  // Skipped when a batch placement is running its own loop (carriagewayWideRefreshSuppressed)
  // — that batch instead does this once over its whole footprint when the loop finishes,
  // which is far cheaper than paying the full square's cost on every single tile placed.
  const touchesRoad = !carriagewayWideRefreshSuppressed && (
    isRoadLikeTile(row - 1, col) || isRoadLikeTile(row + 1, col)
    || isRoadLikeTile(row, col - 1) || isRoadLikeTile(row, col + 1)
  );
  if (touchesRoad) {
    for (let dr = -CARRIAGEWAY_MAX_BAND_WIDTH; dr <= CARRIAGEWAY_MAX_BAND_WIDTH; dr++) {
      for (let dc = -CARRIAGEWAY_MAX_BAND_WIDTH; dc <= CARRIAGEWAY_MAX_BAND_WIDTH; dc++) {
        tilesToRefresh.push([row + dr, col + dc]);
      }
    }
  }

  refreshTileList(scene, tilesToRefresh);
  if (touchesRoad) {
    const w = CARRIAGEWAY_MAX_BAND_WIDTH;
    refreshRoadLineRunsLeaving(scene, row - w, row + w, col - w, col + w);
  }

  if (typeof scheduleTrafficSignalRefresh === 'function') scheduleTrafficSignalRefresh(scene);
  if (typeof scheduleStreetLampRefresh === 'function') scheduleStreetLampRefresh(scene);
  if (typeof scheduleBridgeParapetRefresh === 'function') scheduleBridgeParapetRefresh(scene);
  if (typeof schedulePedestrianRailingRefresh === 'function') schedulePedestrianRailingRefresh(scene);
  if (typeof scheduleStreetFurnitureRefresh === 'function') scheduleStreetFurnitureRefresh(scene);
  scheduleTerrainMiniMapUpdate();
}

// Zebra crossings are laid out per straight run (road-line-variants.js), so a change anywhere
// in a run can move zebras at its far end, past any fixed refresh radius. After a rectangular
// refresh, follow every straight run that crosses the rectangle's edge outward to its end:
// any run whose layout changed must pass through the refreshed rectangle.
function refreshRoadLineRunsLeaving(scene, rowMin, rowMax, colMin, colMax) {
  const rMin = Math.max(0, rowMin), rMax = Math.min(MAP_HEIGHT - 1, rowMax);
  const cMin = Math.max(0, colMin), cMax = Math.min(MAP_WIDTH - 1, colMax);
  const tiles = [];
  // road_straight_v runs along rows, road_straight_h along columns (getRoadKey).
  const walk = (row, col, dr, dc, key) => {
    for (let r = row + dr, c = col + dc; isInsideMap(r, c) && getBaseTileKey(r, c) === key; r += dr, c += dc) {
      tiles.push([r, c]);
    }
  };
  for (let r = rMin; r <= rMax; r++) {
    walk(r, cMin, 0, -1, 'road_straight_h');
    walk(r, cMax, 0, 1, 'road_straight_h');
  }
  for (let c = cMin; c <= cMax; c++) {
    walk(rMin, c, -1, 0, 'road_straight_v');
    walk(rMax, c, 1, 0, 'road_straight_v');
  }
  refreshTileList(scene, tiles);
}

// Same idea for a single tile whose plainness changed without a region refresh (a bus stop
// added/removed): re-key its whole straight run.
function refreshRoadLineRunThrough(scene, row, col) {
  const key = getBaseTileKey(row, col);
  if (key !== 'road_straight_v' && key !== 'road_straight_h') return;
  refreshRoadLineRunsLeaving(scene, row, row, col, col);
}

// Re-keys every tile in [rowMin-W, rowMax+W] × [colMin-W, colMax+W] against FINAL map
// state (W = CARRIAGEWAY_MAX_BAND_WIDTH). A batch road placement (e.g. dragging a second
// lane in tile-by-tile beside an already-finished first lane) calls this ONCE after its
// whole path is down, instead of paying refreshTileArea's per-tile wide refresh N times:
// confirmed by driving the app that doing it per-tile is correct but costs ~40ms/tile (a
// 30-tile drag blocked for over a second) — a "+"-shaped per-tile refresh isn't a cheaper
// substitute either, because each new tile's row-refresh only re-keys the row it lands on
// using whatever (incomplete) state exists at that instant, and no later placement's
// refresh ever revisits that specific earlier row again once its own moment has passed.
// One full-region pass after the whole batch settles re-keys everything against the truly
// final state exactly once.
function refreshCarriagewayBandRegion(scene, rowMin, rowMax, colMin, colMax) {
  const w = CARRIAGEWAY_MAX_BAND_WIDTH;
  const tilesToRefresh = [];
  for (let r = rowMin - w; r <= rowMax + w; r++) {
    for (let c = colMin - w; c <= colMax + w; c++) {
      tilesToRefresh.push([r, c]);
    }
  }
  refreshTileList(scene, tilesToRefresh);
  refreshRoadLineRunsLeaving(scene, rowMin - w, rowMax + w, colMin - w, colMax + w);

  if (typeof scheduleTrafficSignalRefresh === 'function') scheduleTrafficSignalRefresh(scene);
  if (typeof scheduleStreetLampRefresh === 'function') scheduleStreetLampRefresh(scene);
  if (typeof scheduleBridgeParapetRefresh === 'function') scheduleBridgeParapetRefresh(scene);
  if (typeof schedulePedestrianRailingRefresh === 'function') schedulePedestrianRailingRefresh(scene);
  if (typeof scheduleStreetFurnitureRefresh === 'function') scheduleStreetFurnitureRefresh(scene);
  scheduleTerrainMiniMapUpdate();
}

function refreshAllTiles(scene) {
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const key = getTileKey(row, col);
      const baseTextureKey = resolveTileTextureKey(key);
      const pos = isoToScreen(col, row);
      const sprite = scene.tileSprites[row][col];
      sprite.setTexture(baseTextureKey);
      sprite.setPosition(pos.x + scene.offsetX, pos.y + scene.offsetY + getTerrainTileVisualOffset(row, col, key));
      sprite.setDepth(getTerrainTileDepth(row, col, key, pos.y));
      applyTileVisualStyle(sprite, row, col, key);
      applyRoadLineVariantForTile(scene, sprite, row, col, key, baseTextureKey);
      applyTileTextureDisplayScale(sprite);
    }
  }
  refreshAllBridgeSprites(scene);
  if (typeof rebuildTrafficSignalSprites === 'function') rebuildTrafficSignalSprites(scene);
  if (typeof rebuildStreetLampSprites === 'function') rebuildStreetLampSprites(scene);
  if (typeof rebuildBridgeParapetSprites === 'function') rebuildBridgeParapetSprites(scene);
  if (typeof rebuildPedestrianRailingSprites === 'function') rebuildPedestrianRailingSprites(scene);
  if (typeof rebuildStreetFurnitureSprites === 'function') rebuildStreetFurnitureSprites(scene);
  scheduleTerrainMiniMapUpdate();
}

async function generateNewTerrain() {
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

  // window.prompt() is not implemented by Electron/Chromium (unlike
  // alert/confirm) - it returns null immediately with no dialog shown at
  // all, silently no-opping this whole feature. showTextPromptDialog is the
  // app's own in-page modal (already used for "Save As"), which actually works.
  const seedInput = await showTextPromptDialog(t('prompt.terrainSeed'), currentSeed);
  if (seedInput === null) return;
  currentSeed = seedInput.trim() || createSeed();

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
  if (!scene?.buildingSprites) return;
  if (typeof clearBuildingLights === 'function') clearBuildingLights(scene);
  new Set(scene.buildingSprites.values()).forEach((building) => {
    building.destroy();
  });
  scene.buildingSprites.clear();
  if (typeof markNightRemoteDarknessDirty === 'function') markNightRemoteDarknessDirty(scene);
  // The night-art and tint passes skip their walk while nothing has changed;
  // the sprites placed after this are new, so make the next tick look again.
  scene.__blNightTexState = null;
  scene.__nightTintStep = null;
}

function isAdjacentToRoad(row, col) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr, nc = col + dc;
      if (!isInsideMap(nr, nc)) continue;
      if (mapData[nr]?.[nc] === ROAD) return true;
      if (roadUnderlayMap[nr]?.[nc] != null) return true;
      if (bridgeMap[nr]?.[nc]) return true;
    }
  }
  return false;
}

function fract(value) {
  return value - Math.floor(value);
}

function getScenicValue(row, col) {
  if (!isInsideMap(row, col)) return 0;

  let waterView = 0;
  for (let dr = -SCENIC_VIEW_RADIUS; dr <= SCENIC_VIEW_RADIUS; dr++) {
    for (let dc = -SCENIC_VIEW_RADIUS; dc <= SCENIC_VIEW_RADIUS; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (!isInsideMap(r, c)) continue;
      const terrain = mapData[r]?.[c];
      if (terrain !== WATER && terrain !== BEACH) continue;
      const dist = Math.abs(dr) + Math.abs(dc);
      if (dist > SCENIC_VIEW_RADIUS) continue;
      waterView = Math.max(waterView, 1 - dist / Math.max(1, SCENIC_VIEW_RADIUS + 1));
    }
  }

  const height = getTileHeight(row, col);
  let slopeView = height > 0 ? Math.min(1, 0.35 + height * 0.12) : 0;
  const neighbourHeights = getCardinalNeighbors(row, col)
    .filter(([r, c]) => isInsideMap(r, c))
    .map(([r, c]) => getTileHeight(r, c));
  const heightDelta = neighbourHeights.reduce((max, h) => Math.max(max, Math.abs(height - h)), 0);
  if (heightDelta > 0) slopeView = Math.max(slopeView, Math.min(1, 0.45 + heightDelta * 0.16));

  return clamp(waterView * 0.58 + slopeView * 0.50, 0, 1);
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
  return getWorldDepth('terrain', baseY + getTerrainTileVisualOffset(row, col, key));
}

function getRoadTileDepth(row, col, key = getTileKey(row, col), baseY = isoToScreen(col, row).y) {
  return getWorldDepth('road', baseY + getTerrainTileVisualOffset(row, col, key));
}

function getObjectTileDepth(row, col, localDepth = isoToScreen(col, row).y) {
  return getWorldDepth('object', localDepth);
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

// The opening map (generateTerrainMap is in terrain-generation.js).
mapData = generateTerrainMap(currentSeed);

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

// ── Bus depot (3x3 directional garage) ─────────────────────────────────────
// Same raw-side/rotateDirection convention as the harbor and bus stops, but
// the raw side is player-chosen (see placeBusDepotBuilding, tools.js) rather
// than derived from geography.
function getBusDepotVisualCorner(rawSide) {
  const visual = rotateDirection(rawSide, mapRotation);
  return BUS_DEPOT_RAW_SIDE_TO_VISUAL_CORNER[visual] ?? 'll';
}

function getBusDepotVisualKey(rawSide) {
  return `bus_depot_${getBusDepotVisualCorner(rawSide)}`;
}

// Inverse of getBusDepotVisualCorner: which raw side currently displays as
// `corner`, given the current map rotation.
function getBusDepotRawSideForCorner(corner) {
  const compassAtCurrentRotation = BUS_DEPOT_VISUAL_CORNER_TO_RAW_SIDE[corner] ?? 's';
  return rotateDirection(compassAtCurrentRotation, -mapRotation);
}

// Shared by both refresh triggers: the map being rotated (raw side unchanged,
// displayed corner re-resolved) and the player clicking to cycle orientation
// (raw side changed directly). Mirrors refreshHarborSprites' sprite-update
// block above.
function applyBusDepotVisualKey(scene, id, record, newKey) {
  if (newKey === record.spriteKey) return false;
  record.spriteKey = newKey;
  record.assetId = BUS_DEPOT_MODELS[newKey]?.path;
  const sprite = scene?.buildingSprites?.get(id);
  if (!sprite) return true;
  sprite.setTexture(newKey);
  sprite.__dayTextureKey = null;
  sprite.skipNightTint = false;
  markBuildingNightArtDirty(scene);
  const opts = busDepotModelMetadata[newKey];
  if (opts) {
    sprite.setOrigin(opts.originX ?? 0.5, opts.originY ?? 1);
    if (opts.scaleX || opts.scaleY) sprite.setScale(opts.scaleX ?? opts.scale ?? 1, opts.scaleY ?? opts.scale ?? 1);
    else if (opts.scale) sprite.setScale(opts.scale);
    sprite.spriteOffsetX = opts.offsetX ?? 0;
    sprite.spriteOffsetY = opts.offsetY ?? 0;
    sprite.anchorMode = opts.anchorMode;
    Object.assign(record, {
      originX: opts.originX,
      originY: opts.originY,
      scale: opts.scale,
      scaleX: opts.scaleX,
      scaleY: opts.scaleY,
      offsetX: opts.offsetX,
      offsetY: opts.offsetY,
      anchorMode: opts.anchorMode,
    });
    positionBuilding(scene, sprite);
  }
  return true;
}

function refreshBusDepotSprites(scene) {
  Object.entries(buildingData).forEach(([id, record]) => {
    if (record.type !== 'bus_depot' || !record.busDepotRawSide) return;
    applyBusDepotVisualKey(scene, id, record, getBusDepotVisualKey(record.busDepotRawSide));
  });
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
    primary_school:    'Primary School',
    secondary_school:  'Secondary School',
    library:           'Library',
    community_college: 'Community College',
    university:        'University',
    hospital:          'Hospital',
    park_small:         'Small Park',
    park_large:         'Large Park',
  };
  const BLDG_SUB_LABEL = {
    residential: {
      L: 'Public Estate (L)', M: 'Private Residence (M)', H: 'Wealthy Residence (H)', UH: 'Mansion (UH)',
    },
    commercial:  { 1: 'Shop',     2: 'Commercial Block',  3: 'Office Tower' },
    industrial:  { 1: 'Factory',  2: 'Industrial Complex',3: 'Heavy Industry'},
  };
  const getBldgSubLabelKey = (record) => (record?.type === 'residential' ? (record.wealthTier ?? 'L') : (record?.level ?? 1));

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
    const subLabel  = BLDG_SUB_LABEL[bData.type]?.[getBldgSubLabelKey(bData)];
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
  const INFRA_TYPES = ['power_plant_coal', 'power_plant_solar', 'power_plant_nuclear', 'fire_station', 'police_station', 'primary_school', 'secondary_school', 'library', 'community_college', 'university', 'hospital', 'legislative_council', 'stock_exchange', 'park_small', 'park_large', 'sports_ground_small', 'sports_ground_large'];
  if (bData && INFRA_TYPES.includes(bData.type)) {
    const INFRA_LABELS = {
      power_plant_coal:    '⚡ Coal Power Plant',
      power_plant_solar:   '☀️ Solar Power Plant',
      power_plant_nuclear: '☢️ Nuclear Power Plant',
      fire_station:        '🚒 Fire Station',
      police_station:      '👮 Police Station',
      primary_school:      '🏫 Primary School',
      secondary_school:    '🏫 Secondary School',
      library:             '📚 Library',
      community_college:   '🎓 Community College',
      university:          '🎓 University',
      hospital:            '🏥 Hospital',
      park_small:          '🌳 Small Park',
      park_large:          '🌲 Large Park',
      sports_ground_small: '⚽ Sports Ground',
      sports_ground_large: '🏟 Sports Complex',
    };
    const INFRA_DESCS = {
      power_plant_coal:    `Grid power source · Upkeep $${UPKEEP_COAL_PLANT}/mo · Polluting`,
      power_plant_solar:   `Grid power source · Upkeep $${UPKEEP_SOLAR_PLANT}/mo · Clean`,
      power_plant_nuclear: `Grid power source · Upkeep $${UPKEEP_NUCLEAR_PLANT}/mo · Near-zero emissions · High NIMBY`,
      fire_station:        `Fire coverage radius ${FIRE_STATION_RADIUS} tiles · Upkeep $${UPKEEP_FIRE_STATION}/mo`,
      police_station:      `Crime reduction radius ${POLICE_STATION_RADIUS} tiles · Upkeep $${UPKEEP_POLICE_STATION}/mo`,
      primary_school:      `Basic education radius ${PRIMARY_SCHOOL_RADIUS} tiles · Upkeep $${UPKEEP_PRIMARY_SCHOOL}/mo`,
      secondary_school:    `Basic education radius ${SECONDARY_SCHOOL_RADIUS} tiles · Upkeep $${UPKEEP_SECONDARY_SCHOOL}/mo`,
      library:             `Basic education radius ${LIBRARY_RADIUS} tiles · Upkeep $${UPKEEP_LIBRARY}/mo`,
      community_college:   `Higher education radius ${COMMUNITY_COLLEGE_RADIUS} tiles · Upkeep $${UPKEEP_COMMUNITY_COLLEGE}/mo`,
      university:          `Higher education radius ${UNIVERSITY_RADIUS} tiles · Upkeep $${UPKEEP_UNIVERSITY}/mo`,
      hospital:            `Health coverage radius ${HOSPITAL_RADIUS} tiles · Upkeep $${UPKEEP_HOSPITAL}/mo`,
      park_small:          `Residential happiness radius ${SMALL_PARK_RADIUS} tiles · Upkeep $${UPKEEP_PARK_SMALL}/mo`,
      park_large:          `Residential happiness radius ${LARGE_PARK_RADIUS} tiles · Upkeep $${UPKEEP_PARK_LARGE}/mo`,
      sports_ground_small: `Recreation radius ${SPORTS_GROUND_RADIUS} tiles · Upkeep $${UPKEEP_SPORTS_GROUND_SMALL}/mo`,
      sports_ground_large: `Recreation radius ${SPORTS_GROUND_RADIUS} tiles · Upkeep $${UPKEEP_SPORTS_GROUND_LARGE}/mo`,
    };
    const INFRA_COLORS = {
      power_plant_coal:    '#ffcc44', power_plant_solar:   '#ffe066', power_plant_nuclear: '#66ffcc',
      fire_station:        '#ff7755', police_station:      '#6699ff',
      primary_school:      '#59a9ff', secondary_school:    '#2f78cc',
      library:             '#6f9cd6', community_college:   '#7a77cc',
      university:          '#5f52b4', hospital:            '#35b98f',
      park_small:          '#58d66a', park_large:          '#32b457',
      sports_ground_small: '#f0a830', sports_ground_large: '#e07b20',
    };
    html += `
      <div style="color:${INFRA_COLORS[bData.type]};font-weight:bold">${INFRA_LABELS[bData.type]}</div>
      <div class="dbg-muted">${INFRA_DESCS[bData.type]}</div>
      <div class="${powered ? 'dbg-ok' : 'dbg-warn'}">Powered : ${powered ? '✓ yes' : '✗ no — needs power source'}</div>
      <div class="dbg-muted">Age : ${POWER_PLANT_STATS[bData.type] ? formatPowerPlantAge(bData) : `${bData.age ?? 0} ticks in service`}</div>`;
    if (bData.type === 'power_plant_coal' || bData.type === 'power_plant_solar' || bData.type === 'power_plant_nuclear') {
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
      <div class="${hasBldg   ? 'dbg-warn' : 'dbg-muted'}">Has building  : ${hasBldg  ? `✓ ${bData ? `(${BLDG_TYPE_LABEL[bData.type] ?? bData.type}${BLDG_SUB_LABEL[bData.type]?.[getBldgSubLabelKey(bData)] ? ' · ' + BLDG_SUB_LABEL[bData.type][getBldgSubLabelKey(bData)] : ''} lv${bData.level ?? 1})` : '(manual)'}` : '— (empty)'}</div>
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
    const overlayLabel = { pollution: '🏭 Pollution', crime: '🚔 Crime', fire: '🔥 Fire Risk', population: '👥 Population', landvalue: '💰 Land Value', education: '🎓 Education', health: '🏥 Health', electricity: '🔌 Electricity', power: '⚡ Power Plants' };
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

function resolveBuildingRecordForInspect(scene, row, col) {
  const id = getTileId(row, col);
  const hasBldg = scene.buildingSprites.has(id);

  let bData = buildingData[id];
  let anchorRow = row;
  let anchorCol = col;

  if (!bData && hasBldg) {
    const sprite = scene.buildingSprites.get(id);
    if (sprite) {
      anchorRow = sprite.mapRow;
      anchorCol = sprite.mapCol;
      bData = buildingData[getTileId(anchorRow, anchorCol)] ?? null;
    }
  }

  return {
    bData,
    hasBldg,
    anchorRow,
    anchorCol,
    anchorId: bData ? getTileId(anchorRow, anchorCol) : null,
  };
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function getInspectIndicators(row, col) {
  const landValue = getTileOverlayValue('landvalue', row, col);
  const pollution = getTileOverlayValue('pollution', row, col);
  const svc = serviceMap[row]?.[col];
  const powered = !!powerMap[row]?.[col];
  const parkLevel = Math.min(2, svc?.park ?? 0);

  const localBase = 0.24
    + (powered ? 0.18 : 0)
    + (svc?.fire ? 0.12 : 0)
    + (svc?.police ? 0.12 : 0)
    + parkLevel * 0.06
    + landValue * 0.26
    - pollution * 0.22;

  const cityBase = city.happiness ?? 0.5;
  const happiness = clampUnit(localBase * 0.65 + cityBase * 0.35);

  return { landValue, happiness };
}

function getBuildingCustomName(record) {
  if (!record || typeof record.customName !== 'string') return '';
  return record.customName.trim();
}

function preGenerateParkTextures(scene) {
  const configs = [
    { key: 'park_small', width: TILE_WIDTH, height: TILE_IMAGE_HEIGHT, faceHeight: TILE_HEIGHT, trees: [[50, 24, 11], [36, 30, 8], [64, 32, 8]] },
    { key: 'park_large', width: TILE_WIDTH * 3, height: TILE_HEIGHT * 3 + BUILDING_SURFACE_Y_OFFSET, faceHeight: TILE_HEIGHT * 3, trees: [[118, 45, 16], [154, 48, 15], [190, 58, 14], [78, 70, 12], [230, 78, 13], [115, 93, 14], [158, 102, 16], [202, 108, 13], [145, 130, 11], [188, 134, 12]] },
  ];

  configs.forEach(({ key, width, height, faceHeight, trees }) => {
    const textureKey = resolveCanonicalTextureKey(key);
    if (scene.textures.exists(textureKey)) return;

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

    g.generateTexture(textureKey, width, height);
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
  if (typeof isAttractModeActive === 'function' && isAttractModeActive()) return;
  if (!activeScene || !gameReady) return;
  if (typeof scheduleAnnualAutosave === 'function') {
    scheduleAnnualAutosave();
  } else {
    setTimeout(() => saveGame(true), 50);
  }
}

// ── Map rotation ──────────────────────────────────────────────────────────────

function rotateMap(scene, steps = 1) {
  const camera = scene.cameras.main;
  const centerBefore = getCameraCenterWorld(scene);
  const logicalCenter = worldToLogicalPoint(scene, centerBefore.x, centerBefore.y);

  clearTrafficVisuals(scene);
  if (typeof clearTransportVisuals === 'function') clearTransportVisuals(scene);
  clearVesselVisuals(scene);
  clearAircraftVisuals(scene);
  mapRotation = ((mapRotation + steps) % 4 + 4) % 4;

  // Refresh tile textures (direction-aware keys change)
  refreshAllTiles(scene);
  refreshHarborSprites(scene);
  refreshBusDepotSprites(scene);

  // Reposition every sprite that uses isoToScreen
  positionAllTiles(scene);
  if (typeof markVehicleTrackerSpatialIndexDirty === 'function') {
    markVehicleTrackerSpatialIndexDirty(scene);
  }

  // Rebuild world mask (corners stay the same logical coords but the rotated
  // isoToScreen will place them differently — drawWorldMask reads the same
  // 4 corner tile coords, so it just needs a redraw)
  drawWorldMask(scene);
  ensurePreviewOverlayDepth(scene);

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
  if (typeof closeAllVehicleTrackingWindows === 'function') closeAllVehicleTrackingWindows();
  clearTrafficVisuals(scene);
  if (typeof clearTransportVisuals === 'function') clearTransportVisuals(scene);
  clearVesselVisuals(scene);
  clearAircraftVisuals(scene);
  clearAllOverlays(scene);
  clearBuildings(scene);
  resetGameState();
  if (!isTerrainCreatorMode) {
    generateInitialTrees(scene);
    rebuildTreeSprites(scene);
    generateInitialDebris(scene);
    rebuildDebrisSprites(scene);
  }
  rebuildBusStopSprites(scene);
  stopSimTimer();
  startSimTimer();
  updateHUD();
}

// ── Simulation timer ──────────────────────────────────────────────────────────
// Driven by GameClock (game-clock.js) from the Phaser update loop — a single
// accumulator scaled by speed, not one setInterval per speed. simPaused/
// simSpeedMul remain the canonical speed globals (read directly by topbar.js,
// traffic/vessel/aircraft-visuals.js, visual-route-calibrator.js); GameClock
// reads/writes them via getGameSpeed()/setGameSpeed() in game-clock.js.

let simPaused   = false;
let simSpeedMul = GAME_SPEEDS.SLOW; // default speed - topbar now labels this tier "1x"

function startSimTimer() {
  if (isTerrainCreatorMode) {
    stopSimTimer();
    simPaused = true;
    return;
  }
  startGameClock();
}

function stopSimTimer() {
  stopGameClock();
}

function toggleSimPause() {
  if (isTerrainCreatorMode) {
    simPaused = true;
    stopSimTimer();
    if (typeof updateSpeedButtons === 'function') updateSpeedButtons();
    return;
  }
  setGameSpeed(simPaused ? (simSpeedMul || GAME_SPEEDS.NORMAL) : GAME_SPEEDS.PAUSED);
  if (typeof updateSpeedButtons === 'function') updateSpeedButtons();
}

function setSimSpeed(speed) {
  if (isTerrainCreatorMode) {
    simPaused = true;
    stopSimTimer();
    if (typeof updateSpeedButtons === 'function') updateSpeedButtons();
    return;
  }
  setGameSpeed(speed);
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
  const maxRetries = 3;
  let attempt = 0;

  while (attempt <= maxRetries) {
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
      return;
    } catch {
      if (attempt < maxRetries) {
        el.classList.remove('status-error', 'status-ok');
        el.classList.add('loading-dots');
        el.textContent = t('landing.retryingSaveServer');
        // Backend can come up a bit later than static assets; retry briefly.
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
        attempt += 1;
        continue;
      }

      el.classList.remove('loading-dots', 'status-error');
      el.classList.add('status-ok');
      el.textContent = t('landing.serverOfflineNewGame');
      return;
    }
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
