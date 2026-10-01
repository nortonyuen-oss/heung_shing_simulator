
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
const TITLE_MUSIC_TRACK_KEY = 'music_title';
let titleLoadingAudio = null;

// ── Ambient city soundscape (density + weather driven, fades with camera zoom) ─
const AMBIENT_TRACKS = [
  { key: 'amb_urban',       file: 'Sounds/urban.m4a' },
  { key: 'amb_residential', file: 'Sounds/residential.m4a' },
  { key: 'amb_rain',        file: 'Sounds/rainyDay.m4a' },
  { key: 'amb_typhoon',     file: 'Sounds/typhoon.m4a' },
];
const SFX_TRACKS = [
  { key: 'sfx_thunder', file: 'Sounds/thunder.mp3' },
  { key: 'event_ice_cream_truck', file: 'Sounds/iceCreamTruck.m4a' },
  { key: 'vessel_horn', file: 'Sounds/vesselFlute.m4a' },
  { key: 'aircraft_landing', file: 'Sounds/aircraftLanding.m4a' },
  { key: 'aircraft_takeoff', file: 'Sounds/aircraftTakeoff.m4a' },
];

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

// Music volume — persisted so the level a player left it at carries into their next
// session instead of resetting to the slider's hardcoded HTML default every launch.
const MUSIC_VOLUME_SETTING_KEY = 'citybuilder.musicVolume.v1';
let musicVolumeCache = null;

function getStoredMusicVolume() {
  if (musicVolumeCache !== null) return musicVolumeCache;
  try {
    const raw = localStorage.getItem(MUSIC_VOLUME_SETTING_KEY);
    const value = raw === null ? 0.55 : Number(JSON.parse(raw));
    musicVolumeCache = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.55;
  } catch {
    musicVolumeCache = 0.55;
  }
  return musicVolumeCache;
}

function setStoredMusicVolume(value) {
  const clamped = Math.max(0, Math.min(1, Number(value)));
  musicVolumeCache = Number.isFinite(clamped) ? clamped : 0.55;
  try {
    localStorage.setItem(MUSIC_VOLUME_SETTING_KEY, JSON.stringify(musicVolumeCache));
  } catch {}
}

// Applies the stored volume to both volume sliders (Sound menu + Jukebox window, kept
// in sync) and the currently playing track, if any. Safe to call before either slider
// exists in the DOM.
function applyStoredMusicVolume() {
  const volume = getStoredMusicVolume();
  const jukeboxVol = document.getElementById('jukebox-volume');
  const menuVol = document.getElementById('menu-volume-slider');
  if (jukeboxVol) jukeboxVol.value = volume;
  if (menuVol) menuVol.value = volume;
  if (activeMusic) activeMusic.setVolume(volume);
  if (titleLoadingAudio) titleLoadingAudio.volume = volume;
}

// City ambience (background soundscape) volume — a separate mix knob from music, so
// players can turn down traffic/rain/typhoon noise without touching the music level.
// Read fresh every updateAmbientSoundscape() tick, so no imperative push is needed when
// it changes — the existing fade-toward-target loop picks it up within one tick.
const AMBIENT_VOLUME_SETTING_KEY = 'citybuilder.ambientVolume.v1';
let ambientVolumeCache = null;

function getStoredAmbientVolume() {
  if (ambientVolumeCache !== null) return ambientVolumeCache;
  try {
    const raw = localStorage.getItem(AMBIENT_VOLUME_SETTING_KEY);
    const value = raw === null ? 1 : Number(JSON.parse(raw));
    ambientVolumeCache = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  } catch {
    ambientVolumeCache = 1;
  }
  return ambientVolumeCache;
}

function setStoredAmbientVolume(value) {
  const clamped = Math.max(0, Math.min(1, Number(value)));
  ambientVolumeCache = Number.isFinite(clamped) ? clamped : 1;
  try {
    localStorage.setItem(AMBIENT_VOLUME_SETTING_KEY, JSON.stringify(ambientVolumeCache));
  } catch {}
}

function applyStoredAmbientVolume() {
  const slider = document.getElementById('menu-ambient-volume-slider');
  if (slider) slider.value = getStoredAmbientVolume();
}
const AMBIENT_ZOOM_MIN = 0.5;   // camera.zoom at/below this → ambience is silent
const AMBIENT_ZOOM_MAX = 1.8;   // camera.zoom at/above this → ambience is at full volume
const AMBIENT_SAMPLE_GRID = 6;  // NxN screen-space sample grid used to gauge on-screen building density
const AMBIENT_FADE_RATE = 0.12; // per-update volume smoothing (lower = smoother/slower fades)
const AMBIENT_UPDATE_MS = 500;
const AMBIENT_BASE_VOLUME = {
  urban: 0.55,
  residential: 0.4,
  rain: 0.5,
  typhoon: 0.7,
};
let houseModelSets = {};
let commercialBuildingModels = [];
let industrialBuildingModels = [];
let modelAssetManifest = { version: 'development', entries: {} };
let modelAssetVersion = 'development';
let modelMetadataCacheStore = loadModelMetadataCacheStore();
const ZONE_TEXTURE_BUDGET_BYTES = 192 * 1024 * 1024;
const initialZoneTextureKeys = new Set();
const zoneTextureLastUsed = new Map();
const pendingZoneTextureLoads = new Map();
let selectedHouseIndices = {};
let selectedHouseSet = 'house';
let housePressTimer = null;
let didLongPressHouse = false;
let lastInspectTile = null;
let parkModelMetadata = {};
let powerPlantModelMetadata = {};
let serviceBuildingModelMetadata = {};
let specialBuildingModelMetadata = {};
let harborModelMetadata = {};
let busDepotModelMetadata = {};
// Fallback development builds may not have a release manifest. Cache the
// expensive alpha scan by decoded image + threshold so several footprint
// profiles sharing one texture (notably legacy airports) reuse its geometry.
const spriteFootprintGeometryCache = new WeakMap();
const spriteMetadataProfileStats = {
  manifestHits: 0,
  alphaScans: 0,
  geometryCacheHits: 0,
};
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

function getCameraWorldViewRect(camera) {
  const zoom = Math.max(0.0001, Number(camera?.zoom) || 1);
  const width = Math.max(0, Number(camera?.width) || 0) / zoom;
  const height = Math.max(0, Number(camera?.height) || 0) / zoom;
  const originX = Number.isFinite(camera?.originX) ? camera.originX : 0.5;
  const originY = Number.isFinite(camera?.originY) ? camera.originY : 0.5;
  return {
    x: (Number(camera?.scrollX) || 0) + (Number(camera?.width) || 0) * originX - width * originX,
    y: (Number(camera?.scrollY) || 0) + (Number(camera?.height) || 0) * originY - height * originY,
    width,
    height,
  };
}

function setTerrainSpriteViewportActive(tile, active, scene = null) {
  if (!tile) return;
  if (active) {
    if (!tile.displayList && typeof tile.addToDisplayList === 'function') {
      tile.addToDisplayList();
    }
    tile.setVisible?.(true);
    if (scene && typeof syncVehicleTrackerObjectCameraFilters === 'function') {
      syncVehicleTrackerObjectCameraFilters(scene, tile);
    }
    return;
  }
  tile.setVisible?.(false);
  if (tile.displayList && typeof tile.removeFromDisplayList === 'function') {
    tile.removeFromDisplayList();
  }
}

function getTerrainViewportLogicalRange(scene, bounds) {
  const corners = [
    worldToLogicalPoint(scene, bounds.minX, bounds.minY),
    worldToLogicalPoint(scene, bounds.maxX, bounds.minY),
    worldToLogicalPoint(scene, bounds.minX, bounds.maxY),
    worldToLogicalPoint(scene, bounds.maxX, bounds.maxY),
  ];
  const cols = corners.map((point) => Number(point?.x)).filter(Number.isFinite);
  const rows = corners.map((point) => Number(point?.y)).filter(Number.isFinite);
  if (!cols.length || !rows.length) {
    return { minRow: 0, maxRow: MAP_HEIGHT - 1, minCol: 0, maxCol: MAP_WIDTH - 1 };
  }
  // The corner conversion encloses tile anchors. Keep a small logical margin
  // for tall hill faces and antialiased edges before applying the exact world
  // bounds test below.
  const margin = 3;
  return {
    minRow: Math.max(0, Math.floor(Math.min(...rows)) - margin),
    maxRow: Math.min(MAP_HEIGHT - 1, Math.ceil(Math.max(...rows)) + margin),
    minCol: Math.max(0, Math.floor(Math.min(...cols)) - margin),
    maxCol: Math.min(MAP_WIDTH - 1, Math.ceil(Math.max(...cols)) + margin),
  };
}

function getActiveWorldViewportCameras(scene) {
  const cameras = [scene?.cameras?.main];
  if (typeof getVehicleTrackerCullCameras === 'function') {
    cameras.push(...getVehicleTrackerCullCameras(scene));
  }
  return cameras.filter((camera, index, list) => camera && list.indexOf(camera) === index);
}

function getPaddedWorldViewportBounds(camera, padX, padY) {
  const view = getCameraWorldViewRect(camera);
  return {
    view,
    minX: view.x - padX,
    maxX: view.x + view.width + padX,
    minY: view.y - padY,
    maxY: view.y + view.height + padY,
  };
}

function updateTerrainViewportCulling(scene, force = false) {
  const camera = scene?.cameras?.main;
  if (
    !camera
    || !scene?.tileSprites?.length
    || (scene.scene?.isVisible && !scene.scene.isVisible())
  ) {
    return;
  }

  // Phaser's cached camera.worldView can lag behind direct scrollX/scrollY
  // changes until pre-render. Derive views from live camera properties. The
  // active set is a union of small per-camera regions, never one giant box
  // spanning the (possibly distant) main and tracker cameras.
  const viewportCameras = getActiveWorldViewportCameras(scene);
  const views = viewportCameras.map(getCameraWorldViewRect);
  const cacheKey = views.map((view) => [
    Math.floor(view.x / TILE_WIDTH),
    Math.floor(view.y / TILE_IMAGE_HEIGHT),
    Math.ceil((view.x + view.width) / TILE_WIDTH),
    Math.ceil((view.y + view.height) / TILE_IMAGE_HEIGHT),
  ].join(':')).join('|');
  if (!force && scene.terrainViewportCacheKey === cacheKey) return;
  scene.terrainViewportCacheKey = cacheKey;
  const cullStartedAt = performance.now();

  const padX = TILE_WIDTH * 2;
  const padY = TILE_IMAGE_HEIGHT + MAX_TERRAIN_HEIGHT * HEIGHT_STEP_PIXELS + TILE_HEIGHT;
  const terrainBounds = viewportCameras.map((entry) => (
    getPaddedWorldViewportBounds(entry, padX, padY)
  ));

  if (!(scene.activeTerrainSpriteIds instanceof Set)) {
    scene.activeTerrainSpriteIds = new Set();
    // One initialization pass removes the full 256x256 terrain grid from the
    // Scene Display List. Later frames only add the small camera-local set, so
    // Phaser no longer traverses tens of thousands of invisible Images.
    for (const row of scene.tileSprites) {
      for (const tile of row) setTerrainSpriteViewportActive(tile, false, scene);
    }
  }

  const nextActiveTerrainIds = new Set();
  let terrainCandidates = 0;
  const seenTerrainCandidates = new Set();
  for (const bounds of terrainBounds) {
    const logicalRange = getTerrainViewportLogicalRange(scene, bounds);
    for (let row = logicalRange.minRow; row <= logicalRange.maxRow; row++) {
      for (let col = logicalRange.minCol; col <= logicalRange.maxCol; col++) {
        const id = row * MAP_WIDTH + col;
        if (!seenTerrainCandidates.has(id)) {
          seenTerrainCandidates.add(id);
          terrainCandidates++;
        }
        const tile = scene.tileSprites[row]?.[col];
        if (!tile) continue;
        if (
          tile.x >= bounds.minX
          && tile.x <= bounds.maxX
          && tile.y >= bounds.minY
          && tile.y <= bounds.maxY
        ) {
          nextActiveTerrainIds.add(id);
        }
      }
    }
  }

  let terrainEntered = 0;
  let terrainExited = 0;
  const mainTerrainBounds = terrainBounds[0];
  for (const id of nextActiveTerrainIds) {
    const row = Math.floor(id / MAP_WIDTH);
    const col = id % MAP_WIDTH;
    const tile = scene.tileSprites[row]?.[col];
    if (!tile || !mainTerrainBounds) continue;
    if (isPointWithinCullBounds(tile.x, tile.y, mainTerrainBounds)) {
      tile.cameraFilter &= ~camera.id;
    } else {
      tile.cameraFilter |= camera.id;
    }
  }
  for (const id of scene.activeTerrainSpriteIds) {
    if (nextActiveTerrainIds.has(id)) continue;
    const row = Math.floor(id / MAP_WIDTH);
    const col = id % MAP_WIDTH;
    setTerrainSpriteViewportActive(scene.tileSprites[row]?.[col], false, scene);
    terrainExited++;
  }
  for (const id of nextActiveTerrainIds) {
    if (scene.activeTerrainSpriteIds.has(id)) continue;
    const row = Math.floor(id / MAP_WIDTH);
    const col = id % MAP_WIDTH;
    setTerrainSpriteViewportActive(scene.tileSprites[row]?.[col], true, scene);
    terrainEntered++;
  }
  scene.activeTerrainSpriteIds = nextActiveTerrainIds;
  if (terrainEntered > 0) scene.children?.queueDepthSort?.();

  // Buildings/trees/overlays get a much more generous pad than terrain tiles:
  // a building's Map entry is keyed by its anchor tile only, but footprints up
  // to 5x5 (see model-catalog.js) and multi-story sprites can still paint well
  // inside the viewport even when their anchor sits just outside it.
  const spritePadX = TILE_WIDTH * 6;
  const spritePadY = TILE_IMAGE_HEIGHT * 6 + MAX_TERRAIN_HEIGHT * HEIGHT_STEP_PIXELS + TILE_HEIGHT * 4;
  const spriteBounds = viewportCameras.map((entry) => (
    getPaddedWorldViewportBounds(entry, spritePadX, spritePadY)
  ));
  const spriteStats = updateSpriteViewportCulling(scene, spriteBounds);
  scene.viewportCullStats = {
    passes: (scene.viewportCullStats?.passes ?? 0) + 1,
    lastDurationMs: performance.now() - cullStartedAt,
    terrainCandidates,
    activeTerrain: nextActiveTerrainIds.size,
    terrainEntered,
    terrainExited,
    spriteCandidates: spriteStats.candidates,
    visibleSprites: spriteStats.visible,
  };
}

function isPointWithinCullBounds(x, y, bounds) {
  const allBounds = Array.isArray(bounds) ? bounds : [bounds];
  return allBounds.some((entry) => (
    x >= entry.minX && x <= entry.maxX && y >= entry.minY && y <= entry.maxY
  ));
}

function cullSpriteMapEntries(map, bounds, seen = null, mainCamera = null, mainBounds = null) {
  const stats = { candidates: 0, visible: 0 };
  if (!map || !map.size) return stats;
  const apply = (sprite) => {
    if (!sprite || (seen && seen.has(sprite))) return;
    if (seen) seen.add(sprite);
    if (typeof sprite.setVisible !== 'function') return;
    stats.candidates++;
    const visible = isPointWithinCullBounds(sprite.x, sprite.y, bounds);
    sprite.setVisible(visible);
    if (visible) {
      stats.visible++;
      if (sprite.__nightTintDirty && typeof applyDeferredNightTint === 'function') applyDeferredNightTint(sprite);
      if (mainCamera && mainBounds) {
        if (isPointWithinCullBounds(sprite.x, sprite.y, mainBounds)) {
          sprite.cameraFilter &= ~mainCamera.id;
        } else {
          sprite.cameraFilter |= mainCamera.id;
        }
      }
    }
  };
  for (const value of map.values()) {
    if (!value) continue;
    if (Array.isArray(value)) {
      // treeSprites stores one entry per tile as an array of sub-sprites.
      for (const sprite of value) apply(sprite);
    } else if (typeof value.setVisible === 'function') {
      apply(value);
    } else if (value.body || value.top) {
      // Bridge ramp entries are a plain { body, top } pair of images rather
      // than a single game object (see upsertBridgeRampSprite).
      apply(value.body);
      apply(value.side);
      apply(value.top);
    }
  }
  return stats;
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

function updateSpriteViewportCulling(scene, bounds) {
  // A multi-tile building is registered under buildingSprites once per
  // footprint tile it occupies, all pointing at the same sprite object -
  // dedupe so a 5x5 landmark isn't visibility-tested 25 times per pass.
  const seen = new Set();
  const totals = { candidates: 0, visible: 0 };
  const collect = (stats) => {
    totals.candidates += stats.candidates;
    totals.visible += stats.visible;
  };
  const mainCamera = scene?.cameras?.main;
  const mainBounds = Array.isArray(bounds) ? bounds[0] : bounds;
  collect(cullSpriteMapEntries(scene.buildingSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.treeSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.debrisSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.busStopSprites, bounds, seen, mainCamera, mainBounds));
  // Lamp posts and signal poles: hidden in daylight when zoomed far out (ROAD_POLE_MIN_ZOOM),
  // kept after dark and while either calibrator is open.
  const polesShown = (Number(mainCamera?.zoom) || 1) >= (typeof ROAD_POLE_MIN_ZOOM === 'number' ? ROAD_POLE_MIN_ZOOM : 0.7)
    || !!scene.streetLampsLit
    || (typeof isStreetLampCalibrationActive === 'function' && isStreetLampCalibrationActive())
    || (typeof isTrafficSignalCalibrationActive === 'function' && isTrafficSignalCalibrationActive());
  [scene.trafficSignalSprites, scene.streetLampSprites].forEach((map) => {
    if (polesShown) {
      collect(cullSpriteMapEntries(map, bounds, seen, mainCamera, mainBounds));
      return;
    }
    map?.forEach((sprite) => {
      if (sprite?.visible && typeof sprite.setVisible === 'function') sprite.setVisible(false);
    });
  });
  collect(cullSpriteMapEntries(scene.bridgeParapetSprites, bounds, seen, mainCamera, mainBounds));
  // Small street props only draw once zoomed in far enough to read (SMALL_STREET_PROP_MIN_ZOOM).
  const smallPropMinZoom = typeof SMALL_STREET_PROP_MIN_ZOOM === 'number' ? SMALL_STREET_PROP_MIN_ZOOM : 1.2;
  // ...or while their calibrator is open, so they can be picked at any zoom.
  const smallPropsShown = (Number(mainCamera?.zoom) || 1) >= smallPropMinZoom
    || (typeof isPedestrianRailingCalibrationActive === 'function' && isPedestrianRailingCalibrationActive())
    || (typeof isStreetFurnitureCalibrationActive === 'function' && isStreetFurnitureCalibrationActive());
  [scene.pedestrianRailingSprites, scene.streetFurnitureSprites].forEach((map) => {
    if (smallPropsShown) {
      collect(cullSpriteMapEntries(map, bounds, seen, mainCamera, mainBounds));
      return;
    }
    map?.forEach((sprite) => {
      if (sprite?.visible && typeof sprite.setVisible === 'function') sprite.setVisible(false);
    });
  });
  collect(cullSpriteMapEntries(scene.zoneOverlays, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.powerLineSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.bridgeSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.districtSignSprites, bounds, seen, mainCamera, mainBounds));
  return totals;
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

// Phaser 3.60 uploads every render batch with gl.bufferSubData into the one vertex buffer it
// owns. On Chromium's ANGLE-over-Metal (every Mac) that write lands on a buffer the GPU is
// still reading, so the driver stalls the GPU process until the previous draw has finished:
// ~150 uploads a frame in a dense city cost ~0.35ms each, and 旺角 sat at 14 fps with the
// JavaScript side idle. Replacing that upload with gl.bufferData (a fresh, driver-streamed
// allocation of just the used bytes) measured 14 -> 59 fps on an Intel Iris Plus 655 with the
// same scene, so the shim rewrites exactly that call: ARRAY_BUFFER, offset 0, a typed-array
// view. Phaser's only other partial upload (GameObjects.Shader) has the same shape and is
// equally happy. Installed once per WebGL context, before the first frame renders.
function installVertexUploadShim(renderer) {
  const gl = renderer?.gl;
  if (!gl || gl.__vertexUploadShim || typeof gl.bufferSubData !== 'function') return false;
  const arrayBuffer = gl.ARRAY_BUFFER;
  const dynamicDraw = gl.DYNAMIC_DRAW;
  const original = gl.bufferSubData;
  gl.bufferSubData = function shimmedBufferSubData(target, offset, data, ...rest) {
    if (target === arrayBuffer && offset === 0 && rest.length === 0 && ArrayBuffer.isView(data)) {
      return gl.bufferData(target, data, dynamicDraw);
    }
    return original.call(gl, target, offset, data, ...rest);
  };
  gl.__vertexUploadShim = true;
  return true;
}

// Phaser 3.60 re-sorts the scene's whole display list (a merge sort, StableSort) on the next
// render after ANY child's depth is set - even to the value it already had. Every object in
// the city lives in that one list (~10,600 on 太子), and moving vehicles and their lamps set
// their depth every frame, so the full sort ran every frame: 5.5 ms a frame on average at
// zoom 1, 127 ms at worst, more than Phaser's own render pass.
//
// Only ~100 objects actually change depth in a few seconds, so the sort now works on those
// alone. The depth setter of every class in the list is wrapped to record which objects
// changed (and to ignore a set to the same value), as is the list's add. At sort time the
// recorded objects are pulled out in one pass - the rest of the list is still sorted - and
// put back by binary search. Even a scan of the whole list is slow here: reading _depth off
// ~10,000 objects of a dozen classes is a megamorphic load each, ~3 ms a scan under load.
// Anything else (too many moved objects, a sort queued for a reason not seen) falls back to
// an insertion sort over the list, and past ADAPTIVE_DEPTH_SORT_MAX_DESCENTS out-of-order
// neighbours (a view rotation, a rebuild) to Phaser's own merge sort.
const ADAPTIVE_DEPTH_SORT_MAX_DESCENTS = 128;
const ADAPTIVE_DEPTH_SORT_MAX_MOVED = 256;
const ADAPTIVE_DEPTH_SORT_SEARCH_MOVED = 24;

// `items` is sorted by _depth except for the objects in `moved`: pull those out, then put each
// back after every object of a lower or equal depth. Objects of equal depth keep their order
// except that a moved one lands after the unmoved ones of its depth.
function reinsertMovedByDepth(items, moved) {
  let pulled;
  if (moved.size <= ADAPTIVE_DEPTH_SORT_SEARCH_MOVED) {
    // A handful (usually one or two objects a frame): find each with the native indexOf, which
    // compares references only - far cheaper than a JS pass over ~10,000 objects.
    const found = [];
    moved.forEach((item) => {
      const index = items.indexOf(item);
      if (index >= 0) found.push([item, index]);
    });
    found.sort((a, b) => b[1] - a[1]); // from the back, so the earlier indices stay valid
    found.forEach(([, index]) => items.splice(index, 1));
    pulled = found.reverse().map(([item]) => item); // back in their old order
  } else {
    pulled = [];
    let write = 0;
    for (let read = 0; read < items.length; read++) {
      const item = items[read];
      if (moved.has(item)) pulled.push(item);
      else items[write++] = item;
    }
    items.length = write;
  }
  if (pulled.length > 1) {
    const order = new Map(pulled.map((item, index) => [item, index]));
    pulled.sort((a, b) => (a._depth - b._depth) || (order.get(a) - order.get(b)));
  }
  for (const item of pulled) {
    const depth = item._depth;
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (items[mid]._depth <= depth) lo = mid + 1;
      else hi = mid;
    }
    items.splice(lo, 0, item);
  }
  return pulled.length;
}

// Sorts `items` by _depth in place, keeping the order of equal depths, and returns true - or
// returns false without touching them when they are too far from sorted for it to pay.
function sortNearlySortedByDepth(items, maxDescents = ADAPTIVE_DEPTH_SORT_MAX_DESCENTS) {
  const count = items.length;
  let descents = 0;
  for (let i = 1; i < count; i++) {
    if (items[i - 1]._depth > items[i]._depth && ++descents > maxDescents) return false;
  }
  if (descents === 0) return true;
  for (let i = 1; i < count; i++) {
    const item = items[i];
    const depth = item._depth;
    if (items[i - 1]._depth <= depth) continue;
    let j = i - 1;
    while (j >= 0 && items[j]._depth > depth) {
      items[j + 1] = items[j];
      j--;
    }
    items[j + 1] = item;
  }
  return true;
}

function installAdaptiveDepthSort(displayList) {
  if (!displayList || displayList.__adaptiveDepthSort || typeof displayList.depthSort !== 'function') return false;
  const fullSort = displayList.depthSort;
  const moved = new Set();
  const wrappedPrototypes = new WeakSet();
  let tracking = true; // false once a class's depth setter could not be wrapped
  displayList.__depthMoved = moved;

  // Wrap the depth setter of the class `gameObject` belongs to (once per class).
  const track = (gameObject) => {
    let proto = gameObject ? Object.getPrototypeOf(gameObject) : null;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, 'depth')) proto = Object.getPrototypeOf(proto);
    if (!proto || wrappedPrototypes.has(proto)) return;
    wrappedPrototypes.add(proto);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'depth');
    if (!descriptor || typeof descriptor.set !== 'function' || descriptor.configurable === false) {
      tracking = false;
      return;
    }
    Object.defineProperty(proto, 'depth', {
      ...descriptor,
      set(value) {
        if (value === this._depth) return; // Phaser would queue a full sort for this
        const list = this.displayList;
        if (list && list.__depthMoved) list.__depthMoved.add(this);
        descriptor.set.call(this, value);
      },
    });
  };
  displayList.list.forEach((item) => { track(item); moved.add(item); });
  ['add', 'addAt'].forEach((method) => {
    const original = displayList[method];
    if (typeof original !== 'function') return;
    displayList[method] = function trackedAdd(child, ...rest) {
      (Array.isArray(child) ? child : [child]).forEach((item) => {
        if (!item) return;
        track(item);
        moved.add(item);
      });
      return original.call(this, child, ...rest);
    };
  });

  displayList.depthSort = function adaptiveDepthSort() {
    if (!this.sortChildrenFlag) return;
    if (tracking && moved.size > 0 && moved.size <= ADAPTIVE_DEPTH_SORT_MAX_MOVED) {
      reinsertMovedByDepth(this.list, moved);
      moved.clear();
      this.sortChildrenFlag = false;
      return;
    }
    moved.clear();
    if (sortNearlySortedByDepth(this.list)) {
      this.sortChildrenFlag = false;
      return;
    }
    fullSort.call(this);
  };
  displayList.__adaptiveDepthSort = true;
  return true;
}

// Roadside props (furniture, railings, lamp posts, signal poles, bridge parapets, bus stops) are
// ~60 small textures scattered through the depth order among the buildings, and Phaser's batch
// breaks whenever it runs out of its 16 texture units: hiding them alone took a zoom-1 frame
// from 57 to 38 draw calls (62 -> 29 at zoom 1.5), each draw one more vertex upload - the cost
// the ANGLE/Metal shim above is about. Once they have loaded, they are copied into one atlas
// canvas and every prop key is rebuilt as a frame of it, so they share a single GPU texture
// and batch together. The keys stay: code keeps calling setTexture(key), and reads a prop's
// size off its base frame (texture.get()), never its source image. Keys must not be removed
// afterwards - their textures share the atlas source.
const PROP_ATLAS_KEY = '__street_prop_atlas';
const PROP_ATLAS_WIDTH = 2048;
const PROP_ATLAS_PADDING = 4; // transparent px around each frame, so mip levels do not bleed

function getStreetPropAtlasKeys() {
  const groups = [
    typeof STREET_FURNITURE_TEXTURE_FILES !== 'undefined' ? STREET_FURNITURE_TEXTURE_FILES : null,
    typeof PEDESTRIAN_RAILING_TEXTURE_FILES !== 'undefined' ? PEDESTRIAN_RAILING_TEXTURE_FILES : null,
    typeof STREET_LAMP_TEXTURE_FILES !== 'undefined' ? STREET_LAMP_TEXTURE_FILES : null,
    typeof TRAFFIC_SIGNAL_TEXTURE_FILES !== 'undefined' ? TRAFFIC_SIGNAL_TEXTURE_FILES : null,
    typeof BRIDGE_PARAPET_TEXTURE_FILES !== 'undefined' ? BRIDGE_PARAPET_TEXTURE_FILES : null,
  ];
  const keys = groups.flatMap((files) => (files ? Object.keys(files) : []));
  ['ul', 'ur', 'll', 'lr'].forEach((corner) => keys.push(`bus_stop_${corner}`));
  return keys;
}

// Shelf-packs rectangles (tallest first) into a fixed width; returns positions and the
// power-of-two height the atlas needs, or null if one does not fit the width.
function layoutPropAtlas(items, width = PROP_ATLAS_WIDTH, padding = PROP_ATLAS_PADDING) {
  const order = [...items].sort((a, b) => (b.height - a.height) || (b.width - a.width));
  const placed = new Map();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const item of order) {
    const w = item.width + padding * 2;
    const h = item.height + padding * 2;
    if (w > width) return null;
    if (x + w > width) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    placed.set(item.key, { x: x + padding, y: y + padding });
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  const used = y + rowHeight;
  let height = 1;
  while (height < used) height *= 2;
  return { placed, width, height };
}

function packStreetPropTextures(scene) {
  const manager = scene?.textures;
  if (!manager || manager.exists(PROP_ATLAS_KEY) || typeof document === 'undefined'
    || typeof Phaser === 'undefined' || !Phaser.Textures?.Texture) return 0;
  const items = [];
  getStreetPropAtlasKeys().forEach((key) => {
    if (!manager.exists(key)) return;
    const texture = manager.get(key);
    // Only plain single-image textures: one source, just the base frame.
    if (texture.source?.length !== 1 || texture.frameTotal > 1) return;
    const image = texture.getSourceImage?.();
    if (!image?.width || !image?.height) return;
    items.push({ key, image, width: image.width, height: image.height });
  });
  if (items.length < 2) return 0;
  const layout = layoutPropAtlas(items);
  const maxSize = scene.game?.renderer?.gl?.getParameter?.(scene.game.renderer.gl.MAX_TEXTURE_SIZE) || 4096;
  if (!layout || layout.height > maxSize) return 0;
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d');
  items.forEach((item) => {
    const at = layout.placed.get(item.key);
    context.drawImage(item.image, at.x, at.y);
  });
  const atlas = manager.addCanvas(PROP_ATLAS_KEY, canvas);
  const sharedSource = atlas?.source?.[0];
  if (!sharedSource) return 0;
  items.forEach((item) => {
    const at = layout.placed.get(item.key);
    manager.remove(item.key); // frees the prop's own GPU texture
    const texture = new Phaser.Textures.Texture(manager, item.key, []);
    texture.source.push(sharedSource);
    texture.add('__BASE', 0, at.x, at.y, item.width, item.height);
    manager.list[item.key] = texture;
  });
  return items.length;
}

async function loadModelAssetManifest() {
  try {
    const response = await fetch('/api/model-assets', { cache: 'no-store' });
    if (!response.ok) return;
    const manifest = await response.json();
    if (!manifest?.entries || typeof manifest.entries !== 'object') return;
    modelAssetManifest = manifest;
    modelAssetVersion = String(manifest.version || 'development');
    modelMetadataCacheStore = loadModelMetadataCacheStore();
    if (!Object.keys(manifest.entries).length) {
      console.info('[models] no staged manifest: serving source PNGs, so night art falls back to live glows '
        + '(much slower than a release build). Run `npm run prepare:release-assets` once and relaunch '
        + 'to render with the baked night textures.');
    }
  } catch {
    // Development server without a release manifest uses source PNG paths.
  }
}

function normalizeModelLogicalPath(value) {
  const withoutQuery = String(value ?? '').split('?')[0].replace(/^\/+/, '');
  try {
    return decodeURI(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

function resolveModelAssetPath(logicalPath) {
  const normalized = normalizeModelLogicalPath(logicalPath);
  const entry = modelAssetManifest.entries?.[normalized];
  if (!entry?.packagedPath) return logicalPath;
  return `${encodeURI(entry.packagedPath)}?asset=${encodeURIComponent(String(entry.hash || modelAssetVersion).slice(0, 16))}`;
}

// A baked prop (signal pole, lamp post, parapet) is authored on a canvas its module knows
// (TRAFFIC_SIGNAL_SOURCE_CANVAS and friends) and its anchor is a pixel of that canvas. When
// the staged tree was built from an earlier bake with a different canvas, the manifest's
// source size disagrees with the code and getPropTextureAnchor would map the anchor and the
// scale through the wrong geometry - every pole the wrong size in the wrong place, as a dev
// launch in the window between changing a bake and re-staging showed. Such a stale entry is
// skipped and the source PNG loaded instead, exactly what a not-yet-staged prop gets.
function resolvePropAssetPath(logicalPath, canvas) {
  const entry = modelAssetManifest.entries?.[normalizeModelLogicalPath(logicalPath)];
  if (entry && canvas && (Number(entry.sourceWidth) !== canvas.width || Number(entry.sourceHeight) !== canvas.height)) {
    return logicalPath;
  }
  return resolveModelAssetPath(logicalPath);
}

// True when the game is serving the packaged (trimmed + padded) model art
// rather than the source PNGs. Building-light calibration is stored as
// fractions of the model texture, and those two images do NOT place the
// artwork identically - the packaged one is trimmed to its alpha bounds and
// re-padded bottom-centre - so a profile calibrated against one is wrong
// against the other, by as much as 10% of the texture height. The night bake
// reads the packaged art, which makes it the authoritative space.
function isPackagedModelArtActive() {
  return Object.keys(modelAssetManifest.entries ?? {}).length > 0;
}

// Props such as bus stops and traffic signals are authored at a fixed on-screen scale against
// their source PNG, with their anchor at a known source pixel. The release pipeline
// (scripts/prepare-release-assets.js) ships those same images resized to fit maxDimension,
// alpha-trimmed and padded to a power of two, so the loaded texture is a different size with
// the anchor in a different place. This maps a source-pixel anchor onto whichever texture is
// actually loaded and returns the sprite origin plus the scale multiplier that keep the prop at
// the same on-screen size and position in a dev launch and in a release build alike.
function getPropTextureAnchor(logicalPath, sourceAnchorX, sourceAnchorY, texture) {
  const width = Number(texture?.width) || 0;
  const height = Number(texture?.height) || 0;
  const mapping = getModelTexturePixelMapping(logicalPath, texture);
  if (!mapping.staged) {
    return {
      originX: width ? sourceAnchorX / width : 0.5,
      originY: height ? sourceAnchorY / height : 1,
      scaleMultiplier: 1,
    };
  }
  return {
    originX: (sourceAnchorX * mapping.resize + mapping.offsetX) / width,
    originY: (sourceAnchorY * mapping.resize + mapping.offsetY) / height,
    scaleMultiplier: 1 / mapping.resize,
  };
}

// How a source-PNG pixel lands in the loaded texture: texture = source * resize + offset. Identity
// unless the loaded image is the staged (resized, trimmed, padded) copy the manifest describes.
function getModelTexturePixelMapping(logicalPath, texture) {
  const width = Number(texture?.width) || 0;
  const height = Number(texture?.height) || 0;
  const entry = modelAssetManifest.entries?.[normalizeModelLogicalPath(logicalPath)];
  const staged = entry && entry.trim && entry.padding && Number(entry.sourceWidth) > 0
    && Number(entry.outputWidth) > 0 && Number(entry.outputHeight) > 0
    && width === Number(entry.outputWidth) && height === Number(entry.outputHeight);
  if (!staged) return { staged: false, resize: 1, offsetX: 0, offsetY: 0 };
  const longest = Math.max(Number(entry.sourceWidth), Number(entry.sourceHeight) || 0);
  const maxDimension = Number(entry.maxDimension) || longest;
  return {
    staged: true,
    resize: longest > maxDimension ? maxDimension / longest : 1,
    offsetX: entry.padding.left - entry.trim.left,
    offsetY: entry.padding.top - entry.trim.top,
  };
}

// ── Ground-corner fit (building-ground-fit.js) ──────────────────────────────
// A building model listed in BUILDING_GROUND_CORNERS (or being calibrated in the 建築地盤校正
// tool) is sized and anchored by where its lot meets the ground rather than by its whole visible
// width, so signs and off-centre art no longer push it over the kerb.

function getBuildingModelLogicalPath(key) {
  if (!key) return null;
  const zoneModel = getHouseModelBySpriteKey(key)
    ?? getCommercialBuildingModelBySpriteKey(key)
    ?? getIndustrialBuildingModelBySpriteKey(key);
  const path = zoneModel?.logicalPath ?? getFixedBuildingModelBySpriteKey(key)?.path ?? null;
  return path ? normalizeModelLogicalPath(path) : null;
}

function getBuildingGroundCorners(logicalPath) {
  if (!logicalPath) return null;
  // The calibrator's value wins while it has one; null there means "use the default fit".
  const calibrated = typeof getBuildingGroundCalibrationCorners === 'function'
    ? getBuildingGroundCalibrationCorners(logicalPath)
    : undefined;
  if (calibrated !== undefined) return calibrated;
  return (typeof BUILDING_GROUND_CORNERS !== 'undefined' && BUILDING_GROUND_CORNERS[logicalPath]) || null;
}

function applyBuildingGroundFit(scene, key, options) {
  const footprintCols = options.footprintCols ?? 1;
  const footprintRows = options.footprintRows ?? 1;
  // The fit centres the lot between its side corners, which is the front corner only for a
  // square footprint.
  if (footprintCols !== footprintRows || typeof fitBuildingToGroundCorners !== 'function') return options;
  const logicalPath = getBuildingModelLogicalPath(key);
  const corners = getBuildingGroundCorners(logicalPath);
  if (!corners) return options;
  const textureKey = getSpriteBuildingTextureKey(key);
  if (!scene?.textures?.exists?.(textureKey)) return options;
  const source = scene.textures.get(textureKey)?.getSourceImage?.();
  if (!source?.width || !source?.height) return options;
  const mapping = getModelTexturePixelMapping(logicalPath, source);
  const toTexture = ([x, y]) => [x * mapping.resize + mapping.offsetX, y * mapping.resize + mapping.offsetY];
  const fit = fitBuildingToGroundCorners({
    left: toTexture(corners.left),
    front: toTexture(corners.front),
    right: toTexture(corners.right),
  }, getFootprintScreenWidth(footprintCols, footprintRows));
  if (!fit) return options;
  const baseScale = options.scale || 1;
  return {
    ...options,
    originX: fit.originX / source.width,
    originY: fit.originY / source.height,
    scale: fit.scale,
    scaleX: fit.scale * ((options.scaleX ?? baseScale) / baseScale),
    scaleY: fit.scale * ((options.scaleY ?? baseScale) / baseScale),
    groundFit: true,
  };
}

// Re-applies size and anchor to every standing building of one model (or all of them), after its
// ground corners changed in the calibrator.
function refitBuildingSprites(scene, logicalPath = null) {
  if (!scene?.buildingSprites) return 0;
  let count = 0;
  new Set(scene.buildingSprites.values()).forEach((building) => {
    if (!building?.active || !building.logicalSpriteKey) return;
    if (logicalPath && building.modelLogicalPath !== logicalPath) return;
    const key = building.logicalSpriteKey;
    const options = applyBuildingGroundFit(scene, key, normalizeSpriteBuildingOptions(key, {
      footprintCols: building.footprintCols,
      footprintRows: building.footprintRows,
    }));
    building.setOrigin(options.originX ?? 0.5, options.originY ?? 1);
    building.setScale(options.scaleX ?? options.scale ?? 1, options.scaleY ?? options.scale ?? 1);
    building.spriteOffsetX = options.offsetX ?? 0;
    building.spriteOffsetY = options.offsetY ?? 0;
    positionBuilding(scene, building);
    ensureWorldMaskContainsBuilding(scene, building);
    // Window glows were laid out on the old origin; the lighting tick rebuilds them.
    if (typeof releaseBuildingLightGlow === 'function') releaseBuildingLightGlow(scene, building);
    count++;
  });
  return count;
}

function getManifestZoneModelMetadata(model) {
  const logicalPath = normalizeModelLogicalPath(model.logicalPath);
  const entry = modelAssetManifest.entries?.[logicalPath];
  const geometry = entry?.geometry;
  const width = Number(entry?.outputWidth);
  const height = Number(entry?.outputHeight);
  if (!geometry || !width || !height || geometry.maxX < geometry.minX) return null;
  const scale = (getFootprintScreenWidth(model.footprintCols, model.footprintRows)
    / (geometry.maxX - geometry.minX + 1)) * (model.scaleMultiplier ?? 1);
  return finalizeZoneModelMetadata(model, {
    originX: geometry.bottomX / width,
    originY: geometry.stableBaseY / height,
    leftBaseOriginX: geometry.leftBaseX / width,
    lowestCornerOriginX: geometry.lowestCornerX / width,
    lowestCornerOriginY: geometry.bottomY / height,
    scale,
    scaleX: scale * (model.scaleXMultiplier ?? 1),
    scaleY: scale * (model.scaleYMultiplier ?? 1),
    footprintCols: model.footprintCols,
    footprintRows: model.footprintRows,
    offsetX: model.offsetX ?? 0,
    offsetY: model.offsetY ?? 0,
    assetId: model.assetId,
    sourceFileName: model.sourceFileName,
    wealthTier: model.wealthTier,
    massingTier: model.massingTier,
    commercialTier: model.commercialTier,
  });
}

function getManifestFixedBuildingModelMetadata(model) {
  const logicalPath = normalizeModelLogicalPath(model?.path);
  const entry = modelAssetManifest.entries?.[logicalPath];
  const geometry = entry?.geometry;
  const width = Number(entry?.outputWidth);
  const height = Number(entry?.outputHeight);
  if (!model || !geometry || !width || !height || geometry.maxX < geometry.minX) return null;
  spriteMetadataProfileStats.manifestHits++;
  const effectivePixelWidth = geometry.maxX - geometry.minX + 1;
  const scale = (getFootprintScreenWidth(model.footprintCols, model.footprintRows)
    / effectivePixelWidth) * (model.scaleMultiplier ?? 1);
  return applySpriteAnchorMode({
    originX: geometry.bottomX / width,
    originY: geometry.stableBaseY / height,
    leftBaseOriginX: geometry.leftBaseX / width,
    lowestCornerOriginX: geometry.lowestCornerX / width,
    lowestCornerOriginY: geometry.bottomY / height,
    scale,
    scaleX: scale * (model.scaleXMultiplier ?? 1),
    scaleY: scale * (model.scaleYMultiplier ?? 1),
    footprintCols: model.footprintCols,
    footprintRows: model.footprintRows,
    offsetX: model.offsetX ?? 0,
    offsetY: model.offsetY ?? 0,
  }, model.anchorMode ?? DEFAULT_BUILDING_ANCHOR_MODE);
}

async function discoverHouseModelSets() {
  const entries = await Promise.all(Object.entries(HOUSE_MODEL_SETS).map(async ([tool, config]) => (
    [tool, await discoverHouseModels(tool, config)]
  )));

  return Object.fromEntries(entries);
}

async function discoverCommercialBuildingModels() {
  const sets = await Promise.all(COMMERCIAL_BUILDING_MODEL_SETS.map((config) => (
    discoverModelFiles(config.keyPrefix, config.apiFolder, config)
  )));
  return sets.flat();
}

async function discoverIndustrialBuildingModels() {
  const sets = await Promise.all(INDUSTRIAL_BUILDING_MODEL_SETS.map((config) => (
    discoverModelFiles(config.keyPrefix, config.apiFolder, config)
  )));
  return sets.flat();
}

async function discoverHouseModels(tool, config) {
  return discoverModelFiles(tool, config.apiFolder ?? tool, config);
}

async function reloadHouse4x4Models() {
  const setKey = 'house4x4';
  const config = HOUSE_MODEL_SETS[setKey];
  if (!config) return 0;

  const previousModels = houseModelSets[setKey] ?? [];
  const nextModels = await discoverHouseModels(setKey, config);
  houseModelSets[setKey] = nextModels;

  const maxIndex = Math.max(0, nextModels.length - 1);
  selectedHouseIndices[setKey] = Math.min(getSelectedHouseIndex(setKey), maxIndex);

  if (activeScene) {
    const missingModels = nextModels.filter((model) => !activeScene.textures.exists(model.key));
    missingModels.forEach((model) => {
      const separator = model.path.includes('?') ? '&' : '?';
      activeScene.load.image(model.key, `${model.path}${separator}v=${Date.now()}`);
    });
    if (missingModels.length > 0) {
      await new Promise((resolve) => {
        activeScene.load.once('complete', resolve);
        activeScene.load.start();
      });
    }
    prepareHouseModelMetadata(activeScene);
  }

  updateHouseToolUi();
  return nextModels.length;
}

window.reloadHouse4x4Models = reloadHouse4x4Models;

async function discoverModelFiles(keyPrefix, apiFolder, config) {
  const fallbackFiles = (config.fallbackSourceFiles?.length
    ? config.fallbackSourceFiles
    : (config.preferredFiles?.length ? config.preferredFiles : [config.defaultFile]))
    .filter((fileName) => typeof fileName === 'string' && fileName.trim().length > 0);
  const fallbackModels = createModelEntries(keyPrefix, fallbackFiles, config);

  try {
    // Ask the Express server for the actual file list — no HTML scraping needed
    const response = await fetch(`/api/models/${apiFolder}`, { cache: 'no-store' });
    if (!response.ok) return fallbackModels;
    const files = await response.json();
    return Array.isArray(files) && files.length > 0
      ? createModelEntries(keyPrefix, sortModelFiles(files, config), config)
      : fallbackModels;
  } catch {
    return fallbackModels;
  }
}

function sortModelFiles(fileNames, config) {
  const extensionPriority = new Map([
    ['.webp', 0],
    ['.png', 1],
    ['.jpg', 2],
    ['.jpeg', 3],
  ]);
  const getExt = (fileName) => {
    const lower = fileName.toLowerCase();
    const dot = lower.lastIndexOf('.');
    return dot >= 0 ? lower.slice(dot) : '';
  };
  const stripExt = (fileName) => fileName.replace(/\.[^.]+$/, '');
  const preferred = config.preferredFiles ?? [];
  const rank = new Map(preferred.map((fileName, index) => [stripExt(fileName), index]));
  const aliases = config.fileAliases ?? {};
  const dedupedByBaseName = new Map();

  const safeFileNames = (Array.isArray(fileNames) ? fileNames : [])
    .filter((fileName) => typeof fileName === 'string' && fileName.trim().length > 0)
    // Defence in depth against baked night art being treated as a model: these
    // are derived from a model's day texture and must never take a discovery
    // slot, because the slot index is the key saved buildings resolve by.
    .filter((fileName) => !/__night(half|deep|lamps)?\.[^.]+$/.test(fileName));

  safeFileNames.filter((fileName) => !isDisabledModelFile(fileName, config.disabledFiles)).forEach((fileName) => {
    const canonicalFileName = getModelFileAlias(fileName, aliases);
    const baseName = stripExt(canonicalFileName);
    const existing = dedupedByBaseName.get(baseName);
    if (!existing) {
      dedupedByBaseName.set(baseName, { fileName: canonicalFileName, sourceFileName: fileName });
      return;
    }

    const existingRank = extensionPriority.get(getExt(existing.sourceFileName)) ?? Number.POSITIVE_INFINITY;
    const candidateRank = extensionPriority.get(getExt(fileName)) ?? Number.POSITIVE_INFINITY;
    const existingLegacyPenalty = /_fixed/i.test(existing.sourceFileName) ? 1 : 0;
    const candidateLegacyPenalty = /_fixed/i.test(fileName) ? 1 : 0;
    if (
      candidateLegacyPenalty < existingLegacyPenalty
      || (candidateLegacyPenalty === existingLegacyPenalty && candidateRank < existingRank)
      || (
        candidateLegacyPenalty === existingLegacyPenalty
        && candidateRank === existingRank
        && fileName.localeCompare(existing.sourceFileName) < 0
      )
    ) {
      dedupedByBaseName.set(baseName, { fileName: canonicalFileName, sourceFileName: fileName });
    }
  });

  return [...dedupedByBaseName.values()].sort((a, b) => {
    const aRank = rank.has(stripExt(a.fileName)) ? rank.get(stripExt(a.fileName)) : Number.POSITIVE_INFINITY;
    const bRank = rank.has(stripExt(b.fileName)) ? rank.get(stripExt(b.fileName)) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return a.fileName.localeCompare(b.fileName);
  });
}

function createModelEntries(keyPrefix, fileNames, config) {
  const safeFileEntries = (Array.isArray(fileNames) ? fileNames : [])
    .map((entry) => {
      if (typeof entry === 'string') {
        return {
          fileName: getModelFileAlias(entry, config.fileAliases),
          sourceFileName: entry,
        };
      }
      if (entry && typeof entry === 'object' && typeof entry.fileName === 'string' && entry.fileName.trim().length > 0) {
        return {
          fileName: entry.fileName,
          sourceFileName: entry.sourceFileName ?? config.fileAliases?.[entry.fileName] ?? entry.fileName,
        };
      }
      return null;
    })
    .filter((entry) => entry && !isDisabledModelFile(entry.sourceFileName, config.disabledFiles));

  return safeFileEntries.map((entry, index) => {
    const { fileName, sourceFileName } = entry;
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const overrides = config.fileOverrides?.[fileName]
      ?? config.fileOverrides?.[baseName]
      ?? config.fileOverrides?.[`${baseName}.png`]
      ?? config.fileOverrides?.[`${baseName}.webp`]
      ?? {};
    const model = {
      key: `${keyPrefix}_${index}`,
      assetId: `zone:${config.apiFolder ?? keyPrefix}/${sourceFileName}`,
      title: fileName.replace(/\.[^.]+$/, ''),
      fileName,
      sourceFileName,
      wealthTier: config.modelKind === 'residential'
        ? getResidentialWealthTierFromFileName(sourceFileName || fileName)
        : null,
      massingTier: config.modelKind === 'residential'
        ? getResidentialMassingTierFromFileName(sourceFileName || fileName)
        : null,
      commercialTier: config.modelKind === 'commercial'
        ? getCommercialTierFromFileName(sourceFileName || fileName)
        : null,
      logicalPath: `${config.folder}${sourceFileName}`,
      path: resolveModelAssetPath(`${config.folder}${sourceFileName}`),
      footprintCols: config.footprintCols,
      footprintRows: config.footprintRows,
      scaleMultiplier: (config.scaleMultiplier ?? 1) * (overrides.scaleMultiplier ?? 1),
      scaleXMultiplier: (config.scaleXMultiplier ?? 1) * (overrides.scaleXMultiplier ?? 1),
      scaleYMultiplier: (config.scaleYMultiplier ?? 1) * (overrides.scaleYMultiplier ?? 1),
      offsetX: overrides.offsetX ?? config.offsetX ?? 0,
      offsetY: overrides.offsetY ?? config.offsetY ?? 0,
      anchorMode: overrides.anchorMode ?? config.anchorMode ?? DEFAULT_BUILDING_ANCHOR_MODE,
      alphaThreshold: overrides.alphaThreshold ?? config.alphaThreshold,
      spawnWeight: Number.isFinite(overrides.spawnWeight)
        ? overrides.spawnWeight
        : (Number.isFinite(config.spawnWeight) ? config.spawnWeight : 1),
      metadata: null,
    };
    model.metadata = getManifestZoneModelMetadata(model);
    return model;
  });
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

function getTitleMusicTrack() {
  return MUSIC_TRACKS.find((track) => track.key === TITLE_MUSIC_TRACK_KEY) ?? MUSIC_TRACKS[0] ?? null;
}

function getCurrentMusicVolume() {
  return Number(document.getElementById('jukebox-volume')?.value ?? 0.55);
}

function ensureTitleLoadingAudio() {
  const titleTrack = getTitleMusicTrack();
  if (!titleTrack) return null;

  activeTrackIndex = getTitleMusicTrackIndex();

  if (!titleLoadingAudio) {
    titleLoadingAudio = new Audio(titleTrack.file);
    titleLoadingAudio.preload = 'auto';
    titleLoadingAudio.loop = true;
  }

  titleLoadingAudio.volume = getCurrentMusicVolume();
  return titleLoadingAudio;
}

function playTitleLoadingAudio() {
  const audio = ensureTitleLoadingAudio();
  if (!audio) return;

  const maybePromise = audio.play();
  if (maybePromise && typeof maybePromise.catch === 'function') {
    maybePromise.catch(() => {});
  }
}

function stopTitleLoadingAudio() {
  if (!titleLoadingAudio) return;
  titleLoadingAudio.pause();
  titleLoadingAudio.currentTime = 0;
}

function isTitleLoadingAudioPlaying() {
  return !!titleLoadingAudio && !titleLoadingAudio.paused;
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

function selectInitialZoneModelsForPreload(models, perFootprint = INITIAL_ZONE_MODELS_PER_FOOTPRINT) {
  const groups = new Map();
  models.forEach((model) => {
    const tier = model.wealthTier ?? model.commercialTier ?? 'standard';
    const key = `${model.footprintCols}x${model.footprintRows}:${tier}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(model);
  });

  return [...groups.values()].flatMap((group) => group.slice(0, perFootprint));
}

// getRandomHouseModel only ever picks from models whose texture is already
// loaded (isSelectableZoneModelTexture) - anything not preloaded here relies
// on rotateZoneTexturePool's 30-second, uniformly-random-across-every-unloaded-
// asset drip feed to ever become selectable, and isn't protected from LRU
// eviction once it does load. That's fine for L/M, which accumulate variety
// quickly just from sheer building count, but H/UH are no longer rare accents
// under the wealth-district system - an ultraRich district is expected to be
// ~70% UH, so its whole model roster needs to be available from the start or
// every UH building in a district ends up using the single seeded model.
function selectForcedWealthTierModels(models, tiers) {
  return models.filter((model) => tiers.includes(model.wealthTier ?? model.commercialTier));
}

function dedupeZoneModelsByKey(models) {
  const seen = new Map();
  models.forEach((model) => { if (!seen.has(model.key)) seen.set(model.key, model); });
  return [...seen.values()];
}

function getAllZoneModels() {
  return [...Object.values(houseModelSets).flat(), ...commercialBuildingModels, ...industrialBuildingModels];
}

function isZoneModelTextureLoaded(key) {
  return !!activeScene?.textures?.exists(key);
}

function markZoneModelTextureUsed(key) {
  if (key) zoneTextureLastUsed.set(key, Date.now());
}

function prepareZoneMetadataForLoadedTextures(scene) {
  prepareHouseModelMetadata(scene);
  prepareCommercialBuildingModelMetadata(scene);
  prepareIndustrialBuildingModelMetadata(scene);
}

function requestZoneModelTexture(scene, model, callback = null) {
  if (!scene || !model) return false;
  if (scene.textures.exists(model.key)) {
    markZoneModelTextureUsed(model.key);
    callback?.(true);
    return true;
  }
  const queued = pendingZoneTextureLoads.get(model.key);
  if (queued) {
    if (callback) queued.callbacks.push(callback);
    return false;
  }
  pendingZoneTextureLoads.set(model.key, {
    model,
    callbacks: callback ? [callback] : [],
    attempts: 0,
    delayed: false,
  });
  pumpZoneTextureLoadQueue(scene);
  return false;
}

function pumpZoneTextureLoadQueue(scene) {
  if (!scene || scene.zoneTextureLoadActive || pendingZoneTextureLoads.size === 0) return;
  if (scene.load.isLoading()) {
    scene.load.once('complete', () => pumpZoneTextureLoadQueue(scene));
    return;
  }
  const nextRequest = [...pendingZoneTextureLoads.entries()]
    .find(([, request]) => !request.delayed);
  if (!nextRequest) return;
  const [key, request] = nextRequest;
  pendingZoneTextureLoads.delete(key);
  scene.zoneTextureLoadActive = true;
  const separator = request.model.path.includes('?') ? '&' : '?';
  scene.load.image(
    request.model.key,
    `${request.model.path}${separator}loadAttempt=${request.attempts + 1}`,
  );
  scene.load.once('complete', () => {
    scene.zoneTextureLoadActive = false;
    const loaded = scene.textures.exists(request.model.key);
    if (loaded) {
      markZoneModelTextureUsed(request.model.key);
      prepareZoneMetadataForLoadedTextures(scene);
    }
    if (!loaded && request.attempts < 2) {
      request.attempts += 1;
      request.delayed = true;
      pendingZoneTextureLoads.set(key, request);
      setTimeout(() => {
        const delayedRequest = pendingZoneTextureLoads.get(key);
        if (!delayedRequest) return;
        delayedRequest.delayed = false;
        pumpZoneTextureLoadQueue(scene);
      }, 150 * (2 ** (request.attempts - 1)));
    } else {
      request.callbacks.forEach((listener) => listener(loaded));
      // Placement callbacks commit their buildingData reference first. The LRU
      // can then distinguish an in-use texture from a rotation-only texture.
      if (loaded) evictUnusedZoneTextures(scene);
    }
    pumpZoneTextureLoadQueue(scene);
  });
  scene.load.start();
}

function evictUnusedZoneTextures(scene) {
  if (!scene?.textures) return;
  const models = getAllZoneModels();
  const loaded = models.flatMap((model) => {
    const source = getLoadedZoneModelSource(scene, model);
    if (!source) return [];
    const isPowerOfTwo = (value) => value > 0 && (value & (value - 1)) === 0;
    const mipmapMultiplier = isPowerOfTwo(source.width) && isPowerOfTwo(source.height)
      ? 4 / 3
      : 1;
    return [{
      model,
      // RGBA textures occupy four bytes per pixel in GPU memory. A complete
      // mip chain adds one third more storage, so include it in the soft
      // budget now that packaged model textures deliberately restore mipmaps.
      bytes: Math.ceil(source.width * source.height * 4 * mipmapMultiplier),
    }];
  });
  let totalBytes = loaded.reduce((sum, entry) => sum + entry.bytes, 0);
  if (totalBytes <= ZONE_TEXTURE_BUDGET_BYTES) return;
  const referenced = new Set(Object.values(buildingData ?? {}).map((record) => record?.spriteKey).filter(Boolean));
  const candidates = loaded
    .filter(({ model }) => !referenced.has(model.key) && !initialZoneTextureKeys.has(model.key))
    .sort((a, b) => (zoneTextureLastUsed.get(a.model.key) ?? 0) - (zoneTextureLastUsed.get(b.model.key) ?? 0));
  for (const entry of candidates) {
    if (totalBytes <= ZONE_TEXTURE_BUDGET_BYTES) break;
    scene.textures.remove(entry.model.key);
    zoneTextureLastUsed.delete(entry.model.key);
    totalBytes -= entry.bytes;
  }
}

function rotateZoneTexturePool(scene) {
  // The landing screen deliberately hides the Phaser world. Do not decode
  // background building textures while no city session is being rendered.
  if (scene?.scene?.isVisible && !scene.scene.isVisible()) return;
  const candidates = getAllZoneModels().filter((model) => !scene.textures.exists(model.key));
  if (candidates.length === 0) return;
  const model = candidates[Math.floor(Math.random() * candidates.length)];
  requestZoneModelTexture(scene, model);
}

function startZoneTexturePoolRotation(scene) {
  getAllZoneModels().filter((model) => scene.textures.exists(model.key))
    .forEach((model) => markZoneModelTextureUsed(model.key));
  scene.time.addEvent({
    delay: 30000,
    loop: true,
    callback: () => rotateZoneTexturePool(scene),
  });
}

function loadModelMetadataCacheStore() {
  try {
    const raw = globalThis?.localStorage?.getItem(`${MODEL_METADATA_CACHE_KEY}:${modelAssetVersion}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

function persistModelMetadataCacheStore() {
  try {
    globalThis?.localStorage?.setItem(`${MODEL_METADATA_CACHE_KEY}:${modelAssetVersion}`, JSON.stringify(modelMetadataCacheStore));
  } catch {
    // Ignore storage quota/private-mode errors.
  }
}

function getModelMetadataCacheId(model) {
  return [
    model.path,
    model.footprintCols,
    model.footprintRows,
    model.scaleMultiplier ?? 1,
    model.scaleXMultiplier ?? 1,
    model.scaleYMultiplier ?? 1,
    model.alphaThreshold ?? EFFECTIVE_PIXEL_ALPHA_THRESHOLD,
    model.anchorMode ?? DEFAULT_BUILDING_ANCHOR_MODE,
  ].join('|');
}

function getCachedModelMetadata(model, source) {
  const entry = modelMetadataCacheStore[getModelMetadataCacheId(model)];
  if (!entry) return null;
  if (entry.width !== source.width || entry.height !== source.height) return null;
  return entry.metadata ?? null;
}

function setCachedModelMetadata(model, source, metadata) {
  modelMetadataCacheStore[getModelMetadataCacheId(model)] = {
    width: source.width,
    height: source.height,
    metadata,
  };
  persistModelMetadataCacheStore();
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

// ── Jukebox floating window ───────────────────────────────────────────────────

function setupJukebox() {
  const win    = document.getElementById('jukebox-window');
  const volume = document.getElementById('jukebox-volume');
  const minBtn = document.getElementById('jukebox-min-btn');
  if (!win || !volume) return;

  // Stop game input from firing through the window
  win.addEventListener('pointerdown', (e) => e.stopPropagation());

  // Drag via title bar
  const titlebar = document.getElementById('jukebox-titlebar');
  if (titlebar) {
    let dragging = false, ox = 0, oy = 0;
    titlebar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#jukebox-close-btn') || e.target.closest('#jukebox-min-btn')) return;
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
  minBtn?.addEventListener('click', () => {
    win.classList.toggle('is-collapsed');
    minBtn.textContent = win.classList.contains('is-collapsed') ? '+' : '−';
  });

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
    const value = Number(volume.value);
    setStoredMusicVolume(value);
    const menuVol = document.getElementById('menu-volume-slider');
    if (menuVol) menuVol.value = value;
    if (activeMusic) activeMusic.setVolume(value);
    if (titleLoadingAudio) titleLoadingAudio.volume = value;
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

function getTitleMusicTrackIndex() {
  const index = MUSIC_TRACKS.findIndex((track) => track.key === TITLE_MUSIC_TRACK_KEY);
  return index >= 0 ? index : 0;
}

function getFirstGameplayMusicTrackIndex() {
  const index = MUSIC_TRACKS.findIndex((track) => track.key !== TITLE_MUSIC_TRACK_KEY);
  return index >= 0 ? index : getTitleMusicTrackIndex();
}

function ensureTitleMusic(options = {}) {
  const { useLoadingAudio = false } = options;
  if (MUSIC_TRACKS.length === 0) return;

  if (useLoadingAudio) {
    playTitleLoadingAudio();
    updateJukeboxUi();
    return;
  }

  if (!activeScene) return;

  const titleTrackIndex = getTitleMusicTrackIndex();
  const currentTrackKey = MUSIC_TRACKS[activeTrackIndex]?.key;
  activeTrackIndex = titleTrackIndex;

  stopTitleLoadingAudio();

  if (!isMusicPlaying) {
    playTrack(activeTrackIndex);
    return;
  }

  if (currentTrackKey !== TITLE_MUSIC_TRACK_KEY) {
    playTrack(activeTrackIndex);
    return;
  }

  updateJukeboxUi();
}

function enterGameplayAudioMode() {
  stopTitleLoadingAudio();

  if (!activeScene || MUSIC_TRACKS.length === 0) {
    updateJukeboxUi();
    return;
  }

  if (MUSIC_TRACKS[activeTrackIndex]?.key === TITLE_MUSIC_TRACK_KEY) {
    activeTrackIndex = getFirstGameplayMusicTrackIndex();
  }

  playTrack(activeTrackIndex);
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
  if (typeof updateSoundMenu === 'function') updateSoundMenu();
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

function finalizeZoneModelMetadata(model, metadata) {
  const finalized = applySpriteAnchorMode(
    { ...metadata },
    model.anchorMode ?? DEFAULT_BUILDING_ANCHOR_MODE,
  );
  finalized.offsetX = model.offsetX ?? 0;
  finalized.offsetY = model.offsetY ?? 0;
  finalized.assetId = model.assetId;
  finalized.sourceFileName = model.sourceFileName;
  if (model.wealthTier) finalized.wealthTier = model.wealthTier;
  if (model.massingTier) finalized.massingTier = model.massingTier;
  if (model.commercialTier) finalized.commercialTier = model.commercialTier;

  if (
    finalized.anchorMode !== 'left-bottom'
    && model.footprintCols >= 3
    && model.footprintCols === model.footprintRows
    && (finalized.originX < 0.35 || finalized.originX > 0.65)
  ) {
    finalized.originX = 0.5;
  }
  return finalized;
}

function getLoadedZoneModelSource(scene, model) {
  // Zone art is deliberately lazy-loaded. Phaser's TextureManager#get logs a
  // "No texture found" warning when a key is merely not resident yet, so an
  // existence check is part of the normal control flow rather than an error
  // condition. It also prevents metadata/LRU scans from receiving the shared
  // missing-texture placeholder as though it were the requested model.
  if (!model?.key || !scene?.textures?.exists?.(model.key)) return null;
  return scene.textures.get(model.key)?.getSourceImage?.() ?? null;
}

function prepareHouseModelMetadata(scene) {
  Object.values(houseModelSets).flat().forEach((model) => {
    const source = getLoadedZoneModelSource(scene, model);
    if (!source) return;

    const cached = getCachedModelMetadata(model, source);
    if (cached) {
      model.metadata = finalizeZoneModelMetadata(model, cached);
      return;
    }

    model.metadata = getSpriteFootprintMetadata(
      source,
      model.footprintCols,
      model.footprintRows,
      model.scaleMultiplier ?? 1,
      model.scaleXMultiplier ?? 1,
      model.scaleYMultiplier ?? 1,
      model.alphaThreshold,
    );
    model.metadata = finalizeZoneModelMetadata(model, model.metadata);

    setCachedModelMetadata(model, source, model.metadata);
  });
}

function prepareCommercialBuildingModelMetadata(scene) {
  commercialBuildingModels.forEach((model) => {
    const source = getLoadedZoneModelSource(scene, model);
    if (!source) return;

    const cached = getCachedModelMetadata(model, source);
    if (cached) {
      model.metadata = finalizeZoneModelMetadata(model, cached);
      return;
    }

    model.metadata = getSpriteFootprintMetadata(
      source,
      model.footprintCols,
      model.footprintRows,
      model.scaleMultiplier ?? 1,
      model.scaleXMultiplier ?? 1,
      model.scaleYMultiplier ?? 1,
    );
    model.metadata = finalizeZoneModelMetadata(model, model.metadata);

    setCachedModelMetadata(model, source, model.metadata);
  });
}

function prepareIndustrialBuildingModelMetadata(scene) {
  industrialBuildingModels.forEach((model) => {
    const source = getLoadedZoneModelSource(scene, model);
    if (!source) return;

    const cached = getCachedModelMetadata(model, source);
    if (cached) {
      model.metadata = finalizeZoneModelMetadata(model, cached);
      return;
    }

    model.metadata = getSpriteFootprintMetadata(
      source,
      model.footprintCols,
      model.footprintRows,
      model.scaleMultiplier ?? 1,
      model.scaleXMultiplier ?? 1,
      model.scaleYMultiplier ?? 1,
    );
    model.metadata = finalizeZoneModelMetadata(model, model.metadata);

    setCachedModelMetadata(model, source, model.metadata);
  });
}

function prepareParkModelMetadata(scene) {
  parkModelMetadata = {
    park_small_open:       getParkModelMetadata(scene, 'park_small_open',       1, 1),
    park_small_playground: getParkModelMetadata(scene, 'park_small_playground', 1, 1),
    park_small_garden:     getParkModelMetadata(scene, 'park_small_garden',     1, 1),
    park_small_plaza:      getParkModelMetadata(scene, 'park_small_plaza',      1, 1),
    park_small_palm:       getParkModelMetadata(scene, 'park_small_palm',       2, 2),
    park_large_highscore:  getParkModelMetadata(scene, 'park_large_highscore',  2, 2),
    park_small:            getParkModelMetadata(scene, 'park_small_open',       1, 1),
    park_large:            getParkModelMetadata(scene, 'park_large',            3, 3),
    park_large_pool:       getParkModelMetadata(scene, 'park_large_pool',       3, 3),
    park_flagship_victoria: getParkModelMetadata(scene, 'park_flagship_victoria', 4, 4),
    sports_ground_2x2:     getParkModelMetadata(scene, 'sports_ground_2x2',    2, 2),
    sports_ground_3x3:     getParkModelMetadata(scene, 'sports_ground_3x3',    3, 3),
  };
}

function preparePowerPlantModelMetadata(scene) {
  powerPlantModelMetadata = Object.fromEntries(
    Object.entries(POWER_PLANT_MODELS).map(([type, model]) => (
      [type, getPowerPlantModelMetadata(scene, type)]
    )),
  );
}

function getFixedBuildingModelLoadPath(model) {
  const resolvedPath = resolveModelAssetPath(model?.path);
  if (!model?.cacheVersion) return resolvedPath;
  const separator = resolvedPath.includes('?') ? '&' : '?';
  return `${resolvedPath}${separator}v=${encodeURIComponent(model.cacheVersion)}`;
}

function prepareServiceBuildingModelMetadata(scene) {
  serviceBuildingModelMetadata = Object.fromEntries(
    Object.keys(SERVICE_BUILDING_MODELS).flatMap((type) => getServiceBuildingModels(type)).map((model) => (
      [model.spriteKey, getServiceBuildingModelMetadata(scene, model)]
    )),
  );
}

function prepareSpecialBuildingModelMetadata(scene) {
  specialBuildingModelMetadata = Object.fromEntries(
    Object.keys(SPECIAL_BUILDING_MODELS).flatMap((type) => getAllSpecialBuildingModels(type)).map((model) => (
      [model.spriteKey, getSpecialBuildingModelMetadata(scene, model)]
    )),
  );
}

function prepareHarborModelMetadata(scene) {
  harborModelMetadata = Object.fromEntries(
    Object.keys(HARBOR_MODELS).map((spriteKey) => (
      [spriteKey, getParkModelMetadata(scene, spriteKey, HARBOR_FOOTPRINT_COLS, HARBOR_FOOTPRINT_ROWS)]
    )),
  );
}

function prepareBusDepotModelMetadata(scene) {
  busDepotModelMetadata = Object.fromEntries(
    Object.keys(BUS_DEPOT_MODELS).map((spriteKey) => (
      [spriteKey, getParkModelMetadata(scene, spriteKey, BUS_DEPOT_FOOTPRINT_COLS, BUS_DEPOT_FOOTPRINT_ROWS)]
    )),
  );
}


function getPowerPlantModelMetadata(scene, buildingType) {
  const model = POWER_PLANT_MODELS[buildingType];
  const base = {
    footprintCols: model?.footprintCols ?? 1,
    footprintRows: model?.footprintRows ?? 1,
  };
  if (!model) return base;

  const manifestMetadata = getManifestFixedBuildingModelMetadata(model);
  if (manifestMetadata) return manifestMetadata;

  const source = scene.textures.get(getFixedBuildingTextureKey(model))?.getSourceImage();
  if (!source) return base;

  return applySpriteAnchorMode(
    getSpriteFootprintMetadata(source, model.footprintCols, model.footprintRows),
    model.anchorMode ?? DEFAULT_BUILDING_ANCHOR_MODE,
  );
}

function getServiceBuildingModelMetadata(scene, model) {
  const base = {
    footprintCols: model?.footprintCols ?? 1,
    footprintRows: model?.footprintRows ?? 1,
  };
  if (!model) return base;

  const manifestMetadata = getManifestFixedBuildingModelMetadata(model);
  if (manifestMetadata) return manifestMetadata;

  const source = scene.textures.get(getFixedBuildingTextureKey(model))?.getSourceImage();
  if (!source) return base;

  return applySpriteAnchorMode(
    getSpriteFootprintMetadata(
      source,
      model.footprintCols,
      model.footprintRows,
      model.scaleMultiplier ?? 1,
      model.scaleXMultiplier ?? 1,
      model.scaleYMultiplier ?? 1,
    ),
    model.anchorMode ?? DEFAULT_BUILDING_ANCHOR_MODE,
  );
}

function getSpecialBuildingModelMetadata(scene, model) {
  const base = {
    footprintCols: model?.footprintCols ?? 1,
    footprintRows: model?.footprintRows ?? 1,
  };
  if (!model) return base;

  const manifestMetadata = getManifestFixedBuildingModelMetadata(model);
  if (manifestMetadata) return manifestMetadata;

  const source = scene.textures.get(getFixedBuildingTextureKey(model))?.getSourceImage();
  if (!source) return base;

  return applySpriteAnchorMode(
    getSpriteFootprintMetadata(
      source,
      model.footprintCols,
      model.footprintRows,
      model.scaleMultiplier ?? 1,
      model.scaleXMultiplier ?? 1,
      model.scaleYMultiplier ?? 1,
    ),
    model.anchorMode ?? DEFAULT_BUILDING_ANCHOR_MODE,
  );
}

function getParkModelMetadata(
  scene,
  key,
  footprintCols,
  footprintRows,
  anchorMode = DEFAULT_BUILDING_ANCHOR_MODE,
) {
  const source = scene.textures.get(resolveCanonicalTextureKey(key))?.getSourceImage();
  if (!source) {
    return { footprintCols, footprintRows };
  }

  return applySpriteAnchorMode(
    getSpriteFootprintMetadata(source, footprintCols, footprintRows),
    anchorMode,
  );
}

function getSpriteFootprintMetadata(
  image,
  footprintCols = 1,
  footprintRows = 1,
  scaleMultiplier = 1,
  scaleXMultiplier = 1,
  scaleYMultiplier = 1,
  alphaThreshold = EFFECTIVE_PIXEL_ALPHA_THRESHOLD,
) {
  const cachedByThreshold = spriteFootprintGeometryCache.get(image);
  const cachedGeometry = cachedByThreshold?.get(alphaThreshold);
  if (cachedGeometry) {
    spriteMetadataProfileStats.geometryCacheHits++;
    return buildSpriteFootprintMetadataFromGeometry(
      cachedGeometry,
      footprintCols,
      footprintRows,
      scaleMultiplier,
      scaleXMultiplier,
      scaleYMultiplier,
    );
  }
  spriteMetadataProfileStats.alphaScans++;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = image.width;
  canvas.height = image.height;
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let maxX = -1;
  let bottomY = -1;
  const alphaRows = [];

  for (let y = 0; y < canvas.height; y++) {
    let rowAlphaCount = 0;
    let rowXTotal = 0;
    let rowMinX = canvas.width;
    let rowMaxX = -1;
    for (let x = 0; x < canvas.width; x++) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      bottomY = Math.max(bottomY, y);
      rowAlphaCount += 1;
      rowXTotal += x;
      rowMinX = Math.min(rowMinX, x);
      rowMaxX = Math.max(rowMaxX, x);
    }
    if (rowAlphaCount > 0) {
      alphaRows.push({
        y,
        count: rowAlphaCount,
        xTotal: rowXTotal,
        minX: rowMinX,
        maxX: rowMaxX,
      });
    }
  }

  if (bottomY < 0 || maxX < minX) {
    const emptyGeometry = { empty: true };
    const thresholdCache = cachedByThreshold ?? new Map();
    thresholdCache.set(alphaThreshold, emptyGeometry);
    if (!cachedByThreshold) spriteFootprintGeometryCache.set(image, thresholdCache);
    return buildSpriteFootprintMetadataFromGeometry(
      emptyGeometry,
      footprintCols,
      footprintRows,
      scaleMultiplier,
      scaleXMultiplier,
      scaleYMultiplier,
    );
  }

  const maxRowAlphaCount = Math.max(...alphaRows.map((row) => row.count));
  const baseRowThreshold = Math.max(6, Math.floor(maxRowAlphaCount * 0.08));
  const stableBaseY = alphaRows
    .filter((row) => row.count >= baseRowThreshold)
    .at(-1)?.y ?? bottomY;
  const baseRows = alphaRows.filter((row) => (
    row.y >= stableBaseY - 3
    && row.y <= stableBaseY
    && row.count >= baseRowThreshold
  ));
  const bottomXTotal = baseRows.reduce((sum, row) => sum + row.xTotal, 0);
  const bottomXCount = baseRows.reduce((sum, row) => sum + row.count, 0);
  const bottomX = bottomXCount > 0 ? bottomXTotal / bottomXCount : (minX + maxX) / 2;
  const leftBaseX = baseRows.reduce((leftMost, row) => Math.min(leftMost, row.minX), canvas.width);
  const lowestRows = alphaRows.filter((row) => row.y === bottomY);
  const lowestXTotal = lowestRows.reduce((sum, row) => sum + row.xTotal, 0);
  const lowestXCount = lowestRows.reduce((sum, row) => sum + row.count, 0);
  const lowestCornerX = lowestXCount > 0 ? lowestXTotal / lowestXCount : bottomX;

  const geometry = {
    originX: bottomX / canvas.width,
    originY: stableBaseY / canvas.height,
    leftBaseOriginX: leftBaseX < canvas.width ? leftBaseX / canvas.width : minX / canvas.width,
    lowestCornerOriginX: lowestCornerX / canvas.width,
    lowestCornerOriginY: bottomY / canvas.height,
    effectivePixelWidth: maxX - minX + 1,
  };
  const thresholdCache = cachedByThreshold ?? new Map();
  thresholdCache.set(alphaThreshold, geometry);
  if (!cachedByThreshold) spriteFootprintGeometryCache.set(image, thresholdCache);
  return buildSpriteFootprintMetadataFromGeometry(
    geometry,
    footprintCols,
    footprintRows,
    scaleMultiplier,
    scaleXMultiplier,
    scaleYMultiplier,
  );
}

function buildSpriteFootprintMetadataFromGeometry(
  geometry,
  footprintCols,
  footprintRows,
  scaleMultiplier = 1,
  scaleXMultiplier = 1,
  scaleYMultiplier = 1,
) {
  if (geometry?.empty) {
    return {
      originX: 0.5,
      originY: 1,
      scale: scaleMultiplier,
      scaleX: scaleMultiplier * scaleXMultiplier,
      scaleY: scaleMultiplier * scaleYMultiplier,
      footprintCols,
      footprintRows,
    };
  }
  const effectivePixelWidth = Math.max(1, Number(geometry?.effectivePixelWidth) || 1);
  const scale = (getFootprintScreenWidth(footprintCols, footprintRows) / effectivePixelWidth) * scaleMultiplier;
  return {
    ...geometry,
    scale,
    scaleX: scale * scaleXMultiplier,
    scaleY: scale * scaleYMultiplier,
    footprintCols,
    footprintRows,
  };
}

function getSpriteMetadataProfileStats() {
  return { ...spriteMetadataProfileStats };
}

function applySpriteAnchorMode(metadata, anchorMode = DEFAULT_BUILDING_ANCHOR_MODE) {
  const anchored = { ...metadata, anchorMode };
  if (anchorMode === 'effective-bottom-to-map-bottom') {
    anchored.originX = anchored.lowestCornerOriginX ?? anchored.originX ?? 0.5;
    anchored.originY = anchored.lowestCornerOriginY ?? anchored.originY ?? 1;
  } else if (anchorMode === 'left-bottom') {
    anchored.originX = anchored.leftBaseOriginX ?? anchored.originX ?? 0.5;
  }
  return anchored;
}

function placeHouse(scene, row, col) {
  placeHouseModel(scene, row, col, selectedHouseSet);
}

function placeHouseModel(scene, row, col, tool, requestedModelKey = null) {
  const model = requestedModelKey
    ? (houseModelSets?.[tool] ?? []).find((candidate) => candidate.key === requestedModelKey)
    : getSelectedHouseModel(tool);
  if (!model || !canPlaceBuildingFootprint(row, col, model.footprintCols, model.footprintRows)) return;

  // Manual placement may select a model outside the small startup pool. Load
  // the exact texture first and re-check the footprint before committing any
  // map mutation, so a failed request can never create an invisible building.
  if (!scene.textures.exists(model.key)) {
    requestZoneModelTexture(scene, model, (loaded) => {
      if (loaded) placeHouseModel(scene, row, col, tool, model.key);
    });
    return;
  }
  markZoneModelTextureUsed(model.key);

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
    assetId: model.assetId,
    sourceFileName: model.sourceFileName,
    footprintCols: model.footprintCols,
    footprintRows: model.footprintRows,
    originX: opts.originX,
    originY: opts.originY,
    scale:   opts.scale,
    scaleX:  opts.scaleX,
    scaleY:  opts.scaleY,
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
    anchorMode: opts.anchorMode,
  };
}

function placeSpriteBuilding(scene, row, col, key, options = {}) {
  options = applyBuildingGroundFit(scene, key, normalizeSpriteBuildingOptions(key, options));
  // Roadside furniture follows how built-up each street is (street-furniture.js).
  if (typeof scheduleStreetFurnitureRefresh === 'function') scheduleStreetFurnitureRefresh(scene, { delayMs: STREET_FURNITURE_GROWTH_REFRESH_MS, recomputeTraffic: false });
  const textureKey = getSpriteBuildingTextureKey(key);
  const footprintCols = options.footprintCols ?? 1;
  const footprintRows = options.footprintRows ?? 1;
  removeTreesInFootprint(scene, row, col, footprintCols, footprintRows);
  removeDebrisInFootprint(scene, row, col, footprintCols, footprintRows);
  const anchor = getBuildingAnchor(row, col, footprintCols, footprintRows, options.anchorMode);
  const elevOffset = getBuildingElevationOffset(row, col, footprintCols, footprintRows);
  const building = scene.add.image(
    anchor.x + scene.offsetX + (options.offsetX ?? 0),
    anchor.y + scene.offsetY - BUILDING_SURFACE_Y_OFFSET + elevOffset + (options.offsetY ?? 0),
    textureKey,
  );
  addToRenderLayer(scene, building, 'objectLayer');
  building.setOrigin(options.originX ?? 0.5, options.originY ?? 1);
  if (options.scaleX || options.scaleY) {
    building.setScale(options.scaleX ?? options.scale ?? 1, options.scaleY ?? options.scale ?? 1);
  } else if (options.scale) {
    building.setScale(options.scale);
  }
  building.setDepth(getBuildingSortDepth(anchor.y, footprintCols, footprintRows, elevOffset));
  sortRenderLayer(scene, 'objectLayer');
  building.setMask(scene.worldMask);
  ensureWorldMaskContainsBuilding(scene, building);
  building.mapRow = row;
  building.mapCol = col;
  building.logicalSpriteKey = key;
  building.modelLogicalPath = getBuildingModelLogicalPath(key);
  // Stable per-model identity for anything that must survive the model list
  // changing - `key` is a discovery-order index and shifts when files are
  // added or removed (see BUILDING_LIGHT_HERO_PROFILES). It must come from the
  // model being placed: placeHouseModel writes buildingData AFTER this call, so
  // reading the record here returns nothing on a fresh lot and the PREVIOUS
  // model's file when a lot redevelops.
  building.modelSourceFileName = options.sourceFileName
    ?? buildingData[getTileId(row, col)]?.sourceFileName
    ?? null;
  // Built after dark: wear the night art on the next lighting tick.
  markBuildingNightArtDirty(scene);
  building.renderTextureKey = textureKey;
  building.footprintCols = footprintCols;
  building.footprintRows = footprintRows;
  building.spriteOffsetX = options.offsetX ?? 0;
  building.spriteOffsetY = options.offsetY ?? 0;
  building.anchorMode = options.anchorMode;
  building.setInteractive({ useHandCursor: true });
  building.on('pointerdown', (pointer) => {
    if (typeof handleBuildingLightCalibrationPick === 'function'
      && handleBuildingLightCalibrationPick(scene, building)) {
      pointer.event?.stopPropagation();
      return;
    }
    if (typeof isVisualRouteCalibrationInputCaptured === 'function'
      && isVisualRouteCalibrationInputCaptured(scene)) return;
    // §10: in Transport Mode, clicking a depot opens its Depot window with
    // any tool active - except the bus-depot tool itself, whose click still
    // means "rotate this depot".
    if (
      typeof isTransportModeActive !== 'undefined' && isTransportModeActive
      && selectedTool !== 'bus-depot'
      && buildingData[getTileId(building.mapRow, building.mapCol)]?.type === 'bus_depot'
      && typeof openTransportDepotWindowFor === 'function'
    ) {
      pointer.event?.stopPropagation();
      openTransportDepotWindowFor(getTileId(building.mapRow, building.mapCol));
      return;
    }
    if (selectedTool !== 'inspect') return;
    const record = buildingData[getTileId(building.mapRow, building.mapCol)];
    if (record?.type === 'legislative_council' && typeof openLegislativeWindow === 'function') {
      pointer.event?.stopPropagation();
      openLegislativeWindow();
    } else if (record?.type === 'stock_exchange' && typeof openStockExchangeWindow === 'function') {
      pointer.event?.stopPropagation();
      openStockExchangeWindow();
    }
  });

  getFootprintTiles(row, col, footprintCols, footprintRows).forEach(([tileRow, tileCol]) => {
    if (typeof destroyZoneOverlaySprite === 'function') {
      destroyZoneOverlaySprite(scene, tileRow, tileCol);
    }
    scene.buildingSprites.set(getTileId(tileRow, tileCol), building);
  });
  if (typeof markNightRemoteDarknessDirty === 'function') markNightRemoteDarknessDirty(scene);
  invalidateBuildingCountCache();
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
}

function normalizeSpriteBuildingOptions(key, options = {}) {
  const houseModel = getHouseModelBySpriteKey(key);
  if (houseModel?.metadata) {
    return {
      ...options,
      footprintCols: houseModel.footprintCols ?? houseModel.metadata.footprintCols ?? options.footprintCols ?? 1,
      footprintRows: houseModel.footprintRows ?? houseModel.metadata.footprintRows ?? options.footprintRows ?? 1,
      ...houseModel.metadata,
    };
  }

  const commercialModel = getCommercialBuildingModelBySpriteKey(key);
  if (commercialModel?.metadata) {
    return {
      ...options,
      footprintCols: commercialModel.footprintCols ?? commercialModel.metadata.footprintCols ?? options.footprintCols ?? 1,
      footprintRows: commercialModel.footprintRows ?? commercialModel.metadata.footprintRows ?? options.footprintRows ?? 1,
      ...commercialModel.metadata,
    };
  }

  const industrialModel = getIndustrialBuildingModelBySpriteKey(key);
  if (industrialModel?.metadata) {
    return {
      ...options,
      footprintCols: industrialModel.footprintCols ?? industrialModel.metadata.footprintCols ?? options.footprintCols ?? 1,
      footprintRows: industrialModel.footprintRows ?? industrialModel.metadata.footprintRows ?? options.footprintRows ?? 1,
      ...industrialModel.metadata,
    };
  }

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

  if (isServiceBuildingSpriteKey(key)) {
    const buildingType = getServiceBuildingTypeBySpriteKey(key);
    const model = getServiceBuildingModelBySpriteKey(key) ?? SERVICE_BUILDING_MODELS[buildingType];
    const metadata = serviceBuildingModelMetadata[key];
    return {
      ...options,
      footprintCols: model?.footprintCols ?? metadata?.footprintCols ?? 2,
      footprintRows: model?.footprintRows ?? metadata?.footprintRows ?? 2,
      ...metadata,
    };
  }

  if (isSpecialBuildingSpriteKey(key)) {
    const buildingType = getSpecialBuildingTypeBySpriteKey(key);
    const model = getSpecialBuildingModelBySpriteKey(key) ?? SPECIAL_BUILDING_MODELS[buildingType];
    const metadata = specialBuildingModelMetadata[key];
    return {
      ...options,
      footprintCols: model?.footprintCols ?? metadata?.footprintCols ?? 1,
      footprintRows: model?.footprintRows ?? metadata?.footprintRows ?? 1,
      ...metadata,
    };
  }

  if (HARBOR_MODELS[key]) {
    return {
      ...options,
      footprintCols: HARBOR_FOOTPRINT_COLS,
      footprintRows: HARBOR_FOOTPRINT_ROWS,
      ...(harborModelMetadata[key] ?? {}),
    };
  }

  if (BUS_DEPOT_MODELS[key]) {
    return {
      ...options,
      footprintCols: BUS_DEPOT_FOOTPRINT_COLS,
      footprintRows: BUS_DEPOT_FOOTPRINT_ROWS,
      ...(busDepotModelMetadata[key] ?? {}),
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

function getHouseModelBySpriteKey(key) {
  return Object.values(houseModelSets).flat().find((model) => model.key === key) ?? null;
}

function getCommercialBuildingModelBySpriteKey(key) {
  return commercialBuildingModels.find((model) => model.key === key) ?? null;
}

function getIndustrialBuildingModelBySpriteKey(key) {
  return industrialBuildingModels.find((model) => model.key === key) ?? null;
}

function isParkSpriteKey(key) {
  return key === 'park_small'
    || key === 'park_large'
    || PARK_OPTIONS.some((opt) => opt.spriteKey === key);
}

function isSportsGroundSpriteKey(key) {
  return SPORT_GROUND_OPTIONS.some((opt) => opt.spriteKey === key);
}

function isSportsGroundType(type) {
  return type === 'sports_ground_small' || type === 'sports_ground_large';
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

function isSpecialBuildingSpriteKey(key) {
  return Object.keys(SPECIAL_BUILDING_MODELS)
    .flatMap(getAllSpecialBuildingModels)
    .some((model) => model.spriteKey === key);
}

function getSpecialBuildingTypeBySpriteKey(key) {
  return Object.keys(SPECIAL_BUILDING_MODELS)
    .find((type) => getAllSpecialBuildingModels(type).some((model) => model.spriteKey === key));
}

function getSpecialBuildingModelBySpriteKey(key) {
  return Object.keys(SPECIAL_BUILDING_MODELS)
    .flatMap(getAllSpecialBuildingModels)
    .find((model) => model.spriteKey === key) ?? null;
}

// Every fixed (non-zone) model keyed by its hand-authored sprite key, with the
// art path the night bake names its textures after.
function getFixedBuildingModelBySpriteKey(key) {
  if (!key) return null;
  return Object.values(POWER_PLANT_MODELS).find((model) => model.spriteKey === key)
    ?? getServiceBuildingModelBySpriteKey(key)
    ?? getSpecialBuildingModelBySpriteKey(key)
    ?? HARBOR_MODELS[key]
    ?? (typeof BUS_DEPOT_MODELS !== 'undefined' ? BUS_DEPOT_MODELS[key] : null)
    ?? (typeof PARK_MODELS !== 'undefined' ? PARK_MODELS[key] : null)
    ?? null;
}

function getSpriteBuildingTextureKey(key) {
  const powerModel = Object.values(POWER_PLANT_MODELS).find((model) => model.spriteKey === key);
  if (powerModel) return getFixedBuildingTextureKey(powerModel);

  const serviceModel = getServiceBuildingModelBySpriteKey(key);
  if (serviceModel) return getFixedBuildingTextureKey(serviceModel);

  const specialModel = getSpecialBuildingModelBySpriteKey(key);
  if (specialModel) return getFixedBuildingTextureKey(specialModel);

  const harborModel = HARBOR_MODELS[key];
  return resolveCanonicalTextureKey(
    harborModel ? getFixedBuildingTextureKey(harborModel) : key,
  );
}

function isServiceBuildingSpriteKey(key) {
  return Object.keys(SERVICE_BUILDING_MODELS)
    .flatMap(getServiceBuildingModels)
    .some((model) => model.spriteKey === key);
}

function getServiceBuildingTypeBySpriteKey(key) {
  return Object.keys(SERVICE_BUILDING_MODELS)
    .find((type) => getServiceBuildingModels(type).some((model) => model.spriteKey === key));
}

function getServiceBuildingModelBySpriteKey(key) {
  return Object.keys(SERVICE_BUILDING_MODELS)
    .flatMap(getServiceBuildingModels)
    .find((model) => model.spriteKey === key) ?? null;
}

function removeBuilding(scene, row, col, options = {}) {
  const tileId = getTileId(row, col);
  const building = scene.buildingSprites.get(tileId);
  if (!building) return false;
  if (typeof markNightRemoteDarknessDirty === 'function') markNightRemoteDarknessDirty(scene);
  if (typeof scheduleStreetFurnitureRefresh === 'function') scheduleStreetFurnitureRefresh(scene, { delayMs: STREET_FURNITURE_GROWTH_REFRESH_MS, recomputeTraffic: false });

  // Clean up simulation data keyed to anchor tile
  const anchorId = getTileId(building.mapRow, building.mapCol);
  const record   = buildingData[anchorId];
  const removedHarborSide = record?.type === HARBOR_BUILDING_TYPE
    ? getHarborRecordWaterSide(building.mapRow, building.mapCol, record)
    : '';
  if (record) {
    if (record.type === 'power_plant_coal' || record.type === 'power_plant_solar' || record.type === 'power_plant_nuclear') {
      powerSources.delete(anchorId);
    }
    delete buildingData[anchorId];
    markPowerGridDirty();
    if (SERVICE_BUILDING_TYPES.has(record.type)) markServiceCoverageDirty();
    invalidateBuildingCountCache();
    if (record.type === 'bus_depot' && typeof markTransportNetworkDirty === 'function') {
      markTransportNetworkDirty();
    } else if (typeof markTransportDemandDirty === 'function') {
      markTransportDemandDirty();
    }
  }
  if (removedHarborSide) rebuildHarborFrontageTileCache();

  if (typeof releaseBuildingLightGlow === 'function') releaseBuildingLightGlow(scene, building);
  building.destroy();
  getFootprintTiles(
    building.mapRow,
    building.mapCol,
    building.footprintCols ?? 1,
    building.footprintRows ?? 1,
  ).forEach(([tileRow, tileCol]) => {
    scene.buildingSprites.delete(getTileId(tileRow, tileCol));
  });

  if (options.refreshInfrastructure !== false && typeof refreshInfrastructureEffects === 'function') {
    refreshInfrastructureEffects(scene);
  }
  if (removedHarborSide) {
    refreshHarborCoastTiles(scene, building.mapRow, building.mapCol, removedHarborSide);
  }
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
  return true;
}

function positionBuilding(scene, building) {
  const footprintCols = building.footprintCols ?? 1;
  const footprintRows = building.footprintRows ?? 1;
  const anchor = getBuildingAnchor(
    building.mapRow,
    building.mapCol,
    footprintCols,
    footprintRows,
    building.anchorMode,
  );
  const elevOffset = getBuildingElevationOffset(building.mapRow, building.mapCol, footprintCols, footprintRows);
  building.setPosition(
    anchor.x + scene.offsetX + (building.spriteOffsetX ?? 0),
    anchor.y + scene.offsetY - BUILDING_SURFACE_Y_OFFSET + elevOffset + (building.spriteOffsetY ?? 0),
  );
  building.setDepth(getBuildingSortDepth(anchor.y, footprintCols, footprintRows, elevOffset));
}

function canPlaceBuilding(row, col) {
  return [GROUND, DIRT, HILL].includes(mapData[row][col]) && !isSlopeTile(row, col);
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

function canPlaceBuildingFootprint(row, col, footprintCols = 1, footprintRows = 1) {
  return getFootprintTiles(row, col, footprintCols, footprintRows).every(([tileRow, tileCol]) => (
    isInsideMap(tileRow, tileCol)
    && canPlaceBuilding(tileRow, tileCol)
    && mapData[tileRow][tileCol] !== ROAD
    && !isBridgeTile(tileRow, tileCol)
    && !activeScene?.buildingSprites?.has(getTileId(tileRow, tileCol))
    && !buildingData[getTileId(tileRow, tileCol)]
    && !(typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(tileRow, tileCol))
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

function getBuildingAnchor(row, col, footprintCols = 1, footprintRows = 1, anchorMode = 'bottom') {
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

function getBuildingSortDepth(anchorY, footprintCols = 1, footprintRows = 1, elevOffset = 0) {
  const footprintDepthBias = Math.max(0, (footprintCols + footprintRows - 2) * (TILE_HEIGHT / 4));
  return getWorldDepth('object', anchorY + TILE_HEIGHT + elevOffset - footprintDepthBias);
}

function getFootprintScreenWidth(footprintCols = 1, footprintRows = 1) {
  return (footprintCols + footprintRows) * (TILE_WIDTH / 2);
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
    if (scene.buildingSprites.has(id) || !!buildingData[id] || (typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(row, col))) {
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
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
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
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
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
  if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
  return true;
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

// ── Ambient city soundscape ────────────────────────────────────────────────────
// Four looping beds (urban / residential / rain / typhoon) are always playing at
// volume 0 and are continuously faded toward a target mix so transitions are
// smooth instead of hard cuts. The mix is driven by:
//  - how densely built the on-screen area is (sampled buildingData), which
//    crossfades between the "urban" and "residential" beds
//  - the current weather/typhoon state, which layers rain/typhoon on top
//  - the camera zoom level, which scales everything toward silence when zoomed out
function startAmbientSoundscape(scene) {
  if (!scene || scene.ambientSounds) return;
  if (scene.sound.locked) {
    scene.sound.once('unlocked', () => startAmbientSoundscape(scene));
    return;
  }

  scene.ambientSounds = {};
  scene.ambientVolumes = {};
  AMBIENT_TRACKS.forEach((track) => {
    const channel = track.key.replace(/^amb_/, '');
    const sound = scene.sound.add(track.key, { loop: true, volume: 0 });
    sound.play();
    scene.ambientSounds[channel] = sound;
    scene.ambientVolumes[channel] = 0;
  });

  updateAmbientSoundscape(scene);
  if (!scene.ambientIntervalId) {
    scene.ambientIntervalId = setInterval(() => {
      if (scene.scene?.isVisible && !scene.scene.isVisible()) return;
      updateAmbientSoundscape(scene);
      updateWeatherEffectsTier(scene);
    }, AMBIENT_UPDATE_MS);
  }
}

// Samples a grid of on-screen points and looks up the actual building at each
// one, so "urban" reflects what's visually packed into view right now rather
// than the zoning intent of off-screen tiles.
function sampleOnScreenBuildingDensity(scene) {
  const camera = scene.cameras.main;
  let sampleCount = 0;
  let weightedDensity = 0;

  for (let i = 0; i < AMBIENT_SAMPLE_GRID; i++) {
    for (let j = 0; j < AMBIENT_SAMPLE_GRID; j++) {
      const screenX = camera.width * (i + 0.5) / AMBIENT_SAMPLE_GRID;
      const screenY = camera.height * (j + 0.5) / AMBIENT_SAMPLE_GRID;
      const worldX = camera.scrollX + screenX / camera.zoom;
      const worldY = camera.scrollY + screenY / camera.zoom;
      const logical = worldToLogicalPoint(scene, worldX, worldY);
      const row = Math.floor(logical.y);
      const col = Math.floor(logical.x);
      if (!isInsideMap(row, col)) continue;

      sampleCount++;
      const record = buildingData[getTileId(row, col)];
      if (!record) continue;

      const density = record.density ?? zoneDensityMap[row]?.[col] ?? DENSITY_LOW;
      let weight = density === DENSITY_HIGH ? 1 : density === DENSITY_MED ? 0.6 : 0.3;
      if (record.type === 'commercial' || record.type === 'industrial') weight = Math.min(1, weight + 0.15);
      weightedDensity += weight;
    }
  }

  if (sampleCount === 0) return 0;
  return Phaser.Math.Clamp(weightedDensity / sampleCount, 0, 1);
}

function updateAmbientSoundscape(scene) {
  // Title music owns the speakers while the showcase city plays behind the menu.
  if (typeof isAttractModeActive === 'function' && isAttractModeActive()) return;
  if (!scene?.ambientSounds || !scene.cameras?.main) return;
  const camera = scene.cameras.main;

  const zoomFade = Phaser.Math.Clamp(
    (camera.zoom - AMBIENT_ZOOM_MIN) / (AMBIENT_ZOOM_MAX - AMBIENT_ZOOM_MIN),
    0, 1,
  );
  const urbanScore = zoomFade > 0 ? sampleOnScreenBuildingDensity(scene) : 0;

  const weather = city?.weather ?? {};
  const isTyphoon = ['signal3', 'signal8', 'signal9', 'signal10'].includes(weather.typhoonStage);
  const isApproachingTyphoon = weather.typhoonStage === 'signal1';
  const isRaining = !isTyphoon && (weather.condition === 'showers' || weather.condition === 'heavyRain');
  const ambientMix = getStoredAmbientVolume();

  const targets = {
    urban: zoomFade * urbanScore * AMBIENT_BASE_VOLUME.urban * ambientMix,
    residential: zoomFade * (1 - urbanScore * 0.85) * AMBIENT_BASE_VOLUME.residential * ambientMix,
    rain: zoomFade * (isRaining ? 1 : 0) * AMBIENT_BASE_VOLUME.rain * ambientMix,
    typhoon: zoomFade * (isTyphoon ? 1 : isApproachingTyphoon ? 0.45 : 0) * AMBIENT_BASE_VOLUME.typhoon * ambientMix,
  };

  Object.keys(targets).forEach((channel) => {
    const sound = scene.ambientSounds[channel];
    if (!sound) return;
    const current = scene.ambientVolumes[channel] ?? 0;
    const next = current + (targets[channel] - current) * AMBIENT_FADE_RATE;
    scene.ambientVolumes[channel] = next;
    sound.setVolume(Math.max(0, next));
  });
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
