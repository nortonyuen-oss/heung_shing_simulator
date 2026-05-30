// ── Save / Load (SQLite via REST API) ─────────────────────────────────────────
// Requires server.js to be running (npm install && node server.js)

const API_BASE = '/api/saves';
const TERRAIN_API_BASE = '/api/terrains';
const TERRAIN_LOCAL_KEY = 'citybuilder.terrainPresets';
let terrainApiAvailable = null;
let currentSaveId = null;   // tracks which DB row we are editing

// ── Build save payload ────────────────────────────────────────────────────────

function buildSavePayload() {
  return {
    city_name:  city.name || getDefaultCityName(),
    population: city.population,
    year:       city.year,
    month:      city.month,
    budget:     city.budget,
    save_data: {
      version:       7,
      seed:          currentSeed,
      city:          { ...city },
      mapData:       mapData.map((row) => Array.from(row)),
      heightMap:     heightMap.map((row) => Array.from(row)),
      bridgeMap:     bridgeMap.map((row) => Array.from(row)),
      roadUnderlayMap: roadUnderlayMap.map((row) => Array.from(row)),
      zoneMap:       zoneMap.map((row) => Array.from(row)),
      zoneDensityMap: zoneDensityMap.map((row) => Array.from(row)),
      treeMap:       treeMap.map((row) => row.map((tree) => tree ? { ...tree } : null)),
      buildingData:  JSON.parse(JSON.stringify(buildingData)),
      powerSources:  Array.from(powerSources),
      powerLineSet:  Array.from(powerLineSet),
      roadTileCount,
    },
  };
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveGame(silent = false) {
  if (!activeScene) { if (!silent) showToast(t('toast.gameNotReady'), 'warning'); return; }

  const payload = buildSavePayload();

  try {
    let res;
    if (currentSaveId) {
      // Overwrite the existing slot
      res = await fetch(`${API_BASE}/${currentSaveId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } else {
      // Create a new slot
      res = await fetch(API_BASE, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentSaveId = data.id;
    showToast(silent ? t('toast.autosaved') : t('toast.citySaved'), 'info');
  } catch (e) {
    if (!silent) showToast(t('toast.saveFailed'), 'danger');
    console.error('[Save]', e);
  }
}

// ── Save As (forces a new slot) ───────────────────────────────────────────────

async function saveAsGame() {
  if (!activeScene) { showToast(t('toast.gameNotReady'), 'warning'); return; }

  const name = window.prompt(t('prompt.saveAs'), city.name || getDefaultCityName());
  if (name === null) return;        // user cancelled
  if (name.trim()) {
    city.name = name.trim().slice(0, 30);
    updateHUD();
  }

  // Temporarily clear currentSaveId so saveGame() POSTs a new row
  const prevId  = currentSaveId;
  currentSaveId = null;
  try {
    await saveGame();
  } catch (e) {
    currentSaveId = prevId;   // restore on failure
  }
}

// ── Load by ID ────────────────────────────────────────────────────────────────

async function loadSaveById(id, scene) {
  try {
    const res = await fetch(`${API_BASE}/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const row  = await res.json();
    const save = row.save_data;

    if (typeof isTerrainCreatorMode !== 'undefined') isTerrainCreatorMode = false;
    if (typeof activeTerrainProfileType !== 'undefined') activeTerrainProfileType = 'custom';
    if (typeof setTerrainEditorUiActive === 'function') setTerrainEditorUiActive(false);
    applySaveData(scene, save);
    currentSaveId = id;

    showToast(t('toast.welcomeBack', { city: city.name }), 'info');
    return true;
  } catch (e) {
    showToast(t('toast.loadFailed'), 'danger');
    console.error('[Load]', e);
    return false;
  }
}

function normalizeBridgeMapValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;

  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  if (raw === 'deck:row' || raw === 'deck:col') return raw;
  if (/^ramp:[nesw]$/.test(raw)) return raw;

  // Backward-compatible aliases from older save formats.
  if (raw === 'deck-row' || raw === 'deck_row' || raw === 'row') return 'deck:row';
  if (raw === 'deck-col' || raw === 'deck_col' || raw === 'col' || raw === 'column') return 'deck:col';

  const rampAlias = raw.match(/^ramp[-_]?([nesw])$/);
  if (rampAlias) return `ramp:${rampAlias[1]}`;

  const namedDir = {
    north: 'n',
    east: 'e',
    south: 's',
    west: 'w',
  }[raw];
  if (namedDir) return `ramp:${namedDir}`;

  return null;
}

function normalizeSavedTreeValue(value) {
  if (!value || typeof value !== 'object') return null;

  const species = typeof value.species === 'string' && value.species.trim()
    ? value.species.trim()
    : 'pine';
  const age = Number(value.age);
  const variant = Number(value.variant);

  return {
    species,
    age: Number.isFinite(age) ? Math.max(0, Math.round(age)) : 0,
    variant: Number.isFinite(variant) ? Math.max(0, Math.round(variant)) : 0,
  };
}

function restoreOrGenerateTrees(scene, save) {
  treeMap = createFilledMap(null);

  if (Array.isArray(save?.treeMap)) {
    for (let r = 0; r < MAP_HEIGHT; r++) {
      for (let c = 0; c < MAP_WIDTH; c++) {
        treeMap[r][c] = normalizeSavedTreeValue((save.treeMap?.[r] ?? [])[c]);
      }
    }
    return;
  }

  // Legacy saves may not carry tree data. Prefer existing tree generation hooks.
  if (typeof seedTreesOnMap === 'function') {
    seedTreesOnMap(scene);
  }
}

// ── Apply save data to the running scene ──────────────────────────────────────

function applySaveData(scene, save) {
  stopSimTimer();

  // Restore terrain
  currentSeed = save.seed ?? currentSeed;
  for (let r = 0; r < MAP_HEIGHT; r++)
    for (let c = 0; c < MAP_WIDTH; c++)
      mapData[r][c] = (save.mapData[r] ?? [])[c] ?? GROUND;
  heightMap = createFilledMap(0);
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      const savedHeight = (save.heightMap?.[r] ?? [])[c];
      heightMap[r][c] = Number.isFinite(Number(savedHeight))
        ? Math.max(0, Number(savedHeight))
        : (mapData[r][c] === HILL ? 1 : 0);
    }
  }
  flattenMapBorder(mapData, heightMap, 3);

  // Clear Phaser sprites
  clearAllOverlays(scene);
  clearBuildings(scene);

  // Reset simulation state
  resetGameState();

  // Restore city state
  Object.assign(city, save.city ?? {});
  normalizeCityFinanceState();

  // Restore infrastructure metadata
  roadTileCount = save.roadTileCount ?? 0;
  bridgeMap = createFilledMap(null);
  roadUnderlayMap = createFilledMap(null);
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      const bridgeValue = (save.bridgeMap?.[r] ?? [])[c];
      bridgeMap[r][c] = normalizeBridgeMapValue(bridgeValue);
      const underlay = Number((save.roadUnderlayMap?.[r] ?? [])[c]);
      roadUnderlayMap[r][c] = [GROUND, DIRT, BEACH, WATER, HILL].includes(underlay) ? underlay : null;
      if (bridgeMap[r][c]?.startsWith('deck:') && roadUnderlayMap[r][c] !== null) {
        mapData[r][c] = roadUnderlayMap[r][c];
        heightMap[r][c] = 0;
      }
    }
  }
  (save.powerSources ?? []).forEach((id) => powerSources.add(id));
  (save.powerLineSet  ?? []).forEach((id) => powerLineSet.add(id));

  // Restore zone map
  for (let r = 0; r < MAP_HEIGHT; r++)
    for (let c = 0; c < MAP_WIDTH; c++)
      zoneMap[r][c] = (save.zoneMap[r] ?? [])[c] ?? ZONE_NONE;

  // Restore zone density map (falls back to DENSITY_LOW for older saves)
  if (save.zoneDensityMap) {
    for (let r = 0; r < MAP_HEIGHT; r++)
      for (let c = 0; c < MAP_WIDTH; c++)
        zoneDensityMap[r][c] = (save.zoneDensityMap[r] ?? [])[c] ?? DENSITY_LOW;
  }

  // Restore building data
  Object.assign(buildingData, save.buildingData ?? {});
  restoreOrGenerateTrees(scene, save);

  // Rebuild Phaser sprites
  rebuildSceneFromSave(scene, save);

  // Refresh tile textures
  refreshAllTiles(scene);

  // Re-run infrastructure passes
  updatePowerGrid(scene);
  updateServiceCoverage();
  updatePopulationAndPollution();
  computeHappiness(scene);
  updateDemand();
  refreshZoneOverlayTints(scene);

  // UI
  updateHUD();

  // Restart sim
  startSimTimer();
}

// ── Rebuild Phaser sprites from saved data ────────────────────────────────────

function rebuildSceneFromSave(scene, save) {
  if (typeof refreshAllBridgeSprites === 'function') refreshAllBridgeSprites(scene);

  // Zone overlays
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      const zone = zoneMap[r][c];
      if (zone === ZONE_NONE) continue;

      const density = (save.zoneDensityMap?.[r]?.[c]) ?? DENSITY_LOW;
      const zoneCode = zone === ZONE_RES ? 'res'
                     : zone === ZONE_COM ? 'com'
                     : 'ind';
      const textureKey = `zone_overlay_${zoneCode}_${density}`;
      const pos     = isoToScreen(c, r);
      const overlay = scene.add.image(
        pos.x + scene.offsetX,
        pos.y + scene.offsetY + getElevationVisualOffset(r, c),
        textureKey,
      );
      overlay.setOrigin(0.5, 1);
      overlay.setDepth(pos.y + 0.5);
      overlay.setAlpha(0.80);
      overlay.setMask(scene.worldMask);
      scene.zoneOverlays.set(getTileId(r, c), overlay);
    }
  }

  // Buildings (buildingData only stores anchor tiles)
  Object.entries(save.buildingData ?? {}).forEach(([id, record]) => {
    if (scene.buildingSprites.has(id)) return;

    const [r, c] = id.split(':').map(Number);
    const key    = deriveLoadedSpriteKey(record);
    const opts   = normalizeLoadedBuildingOptions(key, record);

    placeSpriteBuilding(scene, r, c, key, opts);
    Object.assign(record, opts, { spriteKey: key });
  });

  // Power-line graphics
  (save.powerLineSet ?? []).forEach((id) => {
    const [r, c] = id.split(':').map(Number);
    if (!scene.powerLineSprites.has(id)) {
      drawPowerLineSprite(scene, r, c);
    }
  });

  if (typeof rebuildTreeSprites === 'function') rebuildTreeSprites(scene);
}

// ── Fallback sprite key for saves without spriteKey ───────────────────────────

function deriveFallbackSpriteKey(record) {
  if (typeof isPowerPlantType === 'function' && isPowerPlantType(record.type)) {
    return POWER_PLANT_MODELS[record.type].spriteKey;
  }

  const infraIdx = typeof INFRA_SPRITE_INDEX !== 'undefined'
    ? INFRA_SPRITE_INDEX[record.type]
    : undefined;
  if (infraIdx !== undefined) return BUILDING_KEYS[infraIdx];
  if (record.type === 'park_small') return 'park_small_open';
  if (record.type === 'park_large') return 'park_large';
  if (record.type === 'residential') return getFallbackHouseSpriteKey() ?? BUILDING_KEYS[Math.floor(Math.random() * 20)];
  if (record.type === 'commercial')  return getFallbackCommercialSpriteKey(record) ?? BUILDING_KEYS[Math.floor(Math.random() * 39)];
  if (record.type === 'industrial')  return BUILDING_KEYS[39 + Math.floor(Math.random() * 39)];
  return BUILDING_KEYS[0];
}

function deriveLoadedSpriteKey(record) {
  if (typeof isPowerPlantType === 'function' && isPowerPlantType(record.type)) {
    return POWER_PLANT_MODELS[record.type].spriteKey;
  }
  const key = record.spriteKey ?? deriveFallbackSpriteKey(record);
  const legacy2x2Key = getLegacy2x2HouseFallbackSpriteKey(record, key);
  if (legacy2x2Key) return legacy2x2Key;
  if (record.type === 'residential' && !isLoadedTextureKey(key)) {
    return getFallbackHouseSpriteKey() ?? deriveFallbackSpriteKey(record);
  }
  const legacyCommercialKey = getLegacyCommercialFallbackSpriteKey(record, key);
  if (legacyCommercialKey) return legacyCommercialKey;
  if (record.type === 'commercial' && !isLoadedTextureKey(key)) {
    return getFallbackCommercialSpriteKey(record) ?? deriveFallbackSpriteKey(record);
  }
  return key;
}

function getLegacy2x2HouseFallbackSpriteKey(record, key) {
  if (record.type !== 'residential') return null;
  if ((record.footprintCols ?? 1) !== 2 || (record.footprintRows ?? 1) !== 2) return null;
  if (key !== 'house2x2_0' && key !== 'house2x2_1') return null;

  const publicHousing2 = (typeof houseModelSets !== 'undefined' ? houseModelSets.house2x2 : [])
    ?.find((model) => model.fileName === 'publicHousing5.png');
  return publicHousing2?.key ?? null;
}

function getFallbackHouseSpriteKey() {
  const model = typeof houseModelSets !== 'undefined'
    ? houseModelSets.house?.[0]
    : null;
  return model?.key ?? null;
}

const LEGACY_COMMERCIAL_BUILDING_FILES = {
  commercial_building_0: 'commercialBuilding01.png',
  commercial_building_1: 'commercialBuilding02.png',
  commercial_building_2: 'commercialBuilding03.png',
  commercial_building_3: 'commercialBuilding04.png',
  commercial_building_4: 'commercialBuilding05.png',
  commercial_building_5: 'commercialBuilding06.png',
  commercial_building_6: 'commercialBuilding07.png',
  commercial_building_7: 'commercialBuilding08.png',
};

function getLegacyCommercialFallbackSpriteKey(record, key) {
  if (record.type !== 'commercial') return null;
  const fileName = LEGACY_COMMERCIAL_BUILDING_FILES[key];
  if (!fileName) return null;

  const model = getCommercialModelByFileName(fileName);
  return model?.key ?? getFallbackCommercialSpriteKey(record);
}

function getFallbackCommercialSpriteKey(record) {
  const footprintCols = record.footprintCols ?? 2;
  const footprintRows = record.footprintRows ?? 2;
  const models = typeof commercialBuildingModels !== 'undefined'
    ? commercialBuildingModels
    : [];
  const matching = models.find((model) => (
    model.footprintCols === footprintCols && model.footprintRows === footprintRows
  ));
  return (matching ?? models[0])?.key ?? null;
}

function getCommercialModelByFileName(fileName) {
  const models = typeof commercialBuildingModels !== 'undefined'
    ? commercialBuildingModels
    : [];
  return models.find((model) => model.fileName === fileName || model.sourceFileName === fileName) ?? null;
}

function isLoadedTextureKey(key) {
  if (!key) return false;
  return typeof activeScene !== 'undefined' && !!activeScene?.textures?.exists(key);
}

function normalizeLoadedBuildingOptions(key, record) {
  const options = {
    footprintCols: record.footprintCols ?? 1,
    footprintRows: record.footprintRows ?? 1,
    originX: record.originX,
    originY: record.originY,
    scale: record.scale,
    scaleX: record.scaleX,
    scaleY: record.scaleY,
    offsetX: record.offsetX,
    offsetY: record.offsetY,
    anchorMode: record.anchorMode,
  };

  if (typeof isPowerPlantSpriteKey === 'function' && isPowerPlantSpriteKey(key) && typeof normalizeSpriteBuildingOptions === 'function') {
    return normalizeSpriteBuildingOptions(key, options);
  }

  if (typeof isServiceBuildingSpriteKey === 'function' && isServiceBuildingSpriteKey(key) && typeof normalizeSpriteBuildingOptions === 'function') {
    return normalizeSpriteBuildingOptions(key, options);
  }

  if (typeof isParkSpriteKey === 'function' && isParkSpriteKey(key) && typeof normalizeSpriteBuildingOptions === 'function') {
    return normalizeSpriteBuildingOptions(key, options);
  }

  if (typeof normalizeSpriteBuildingOptions === 'function') {
    return normalizeSpriteBuildingOptions(key, options);
  }

  return options;
}

// ── List / Delete ─────────────────────────────────────────────────────────────

async function listSaves() {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();   // [{id, city_name, population, year, month, budget, updated_at}, …]
}

async function deleteSaveById(id) {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ── Terrain preset API ───────────────────────────────────────────────────────

async function listTerrainPresets() {
  if (terrainApiAvailable !== false) {
    try {
      const res = await fetch(TERRAIN_API_BASE);
      if (res.ok) {
        terrainApiAvailable = true;
        return res.json();
      }
      if (res.status === 404) terrainApiAvailable = false;
      else throw new Error(`HTTP ${res.status}`);
    } catch {
      terrainApiAvailable = false;
    }
  }
  return readLocalTerrainPresets().map((row) => ({ ...row }));
}

async function getTerrainPresetById(id) {
  if (terrainApiAvailable !== false) {
    try {
      const res = await fetch(`${TERRAIN_API_BASE}/${id}`);
      if (res.ok) {
        terrainApiAvailable = true;
        return res.json();
      }
      if (res.status === 404) terrainApiAvailable = false;
      else throw new Error(`HTTP ${res.status}`);
    } catch {
      terrainApiAvailable = false;
    }
  }

  const row = readLocalTerrainPresets().find((preset) => String(preset.id) === String(id));
  if (!row) throw new Error('Terrain preset not found');
  return {
    ...row,
    terrain_data: row.terrain_data,
  };
}

async function createTerrainPreset(payload) {
  if (terrainApiAvailable !== false) {
    try {
      const res = await fetch(TERRAIN_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        terrainApiAvailable = true;
        return res.json();
      }
      if (res.status === 404) terrainApiAvailable = false;
      else throw new Error(`HTTP ${res.status}`);
    } catch {
      terrainApiAvailable = false;
    }
  }

  const rows = readLocalTerrainPresets();
  const now = new Date().toISOString();
  const id = `local-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const row = {
    id,
    name: payload.name,
    profile_type: payload.profile_type || 'custom',
    seed: payload.seed || '',
    terrain_data: payload.terrain_data,
    created_at: now,
    updated_at: now,
  };
  rows.unshift(row);
  writeLocalTerrainPresets(rows);
  return row;
}

async function deleteTerrainPresetById(id) {
  if (terrainApiAvailable !== false) {
    try {
      const res = await fetch(`${TERRAIN_API_BASE}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        terrainApiAvailable = true;
        return;
      }
      if (res.status === 404) terrainApiAvailable = false;
      else throw new Error(`HTTP ${res.status}`);
    } catch {
      terrainApiAvailable = false;
    }
  }

  const next = readLocalTerrainPresets().filter((preset) => String(preset.id) !== String(id));
  writeLocalTerrainPresets(next);
}

function readLocalTerrainPresets() {
  try {
    const raw = localStorage.getItem(TERRAIN_LOCAL_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeLocalTerrainPresets(rows) {
  try {
    localStorage.setItem(TERRAIN_LOCAL_KEY, JSON.stringify(rows));
  } catch {
    // Ignore storage write failures.
  }
}

// ── Save list modal ───────────────────────────────────────────────────────────

function openSaveListModal() {
  const modal = document.getElementById('save-list-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  refreshSaveListModal();
}

function closeSaveListModal() {
  const modal = document.getElementById('save-list-modal');
  if (modal) modal.style.display = 'none';
}

async function refreshSaveListModal() {
  const list = document.getElementById('save-list-items');
  if (!list) return;
  list.innerHTML = `<div class="save-list-loading">${t('save.loading')}</div>`;

  try {
    const saves = await listSaves();

    if (saves.length === 0) {
      list.innerHTML = `
        <div class="save-list-empty">
          ${t('save.empty')}
        </div>`;
      return;
    }

    list.innerHTML = saves.map((s) => {
      const date  = s.updated_at
        ? new Date(s.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      const month = (typeof MONTH_NAMES !== 'undefined' && MONTH_NAMES[s.month - 1])
        ? tMonth(s.month)
        : '';
      const budgetStr = `$${Number(s.budget).toLocaleString()}`;
      const detail = t('save.detail', {
        population: Number(s.population).toLocaleString(),
        month,
        year: s.year,
        budget: budgetStr,
      });
      return `
        <div class="save-list-item">
          <div class="save-list-meta">
            <span class="save-list-name">${escapeHtml(s.city_name)}</span>
            <span class="save-list-detail">
              ${detail}
            </span>
            ${date ? `<span class="save-list-date">${t('save.lastSaved', { date })}</span>` : ''}
          </div>
          <div class="save-list-actions">
            <button class="save-list-load-btn" data-id="${s.id}">${t('save.load')}</button>
            <button class="save-list-del-btn"  data-id="${s.id}" title="${t('save.deleteTitle')}">🗑</button>
          </div>
        </div>`;
    }).join('');

    // Wire Load buttons
    list.querySelectorAll('.save-list-load-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!gameReady) { showToast(t('toast.stillLoading'), 'warning'); return; }
        closeSaveListModal();
        const id = Number(btn.dataset.id);
        const ok = await loadSaveById(id, activeScene);
        if (ok) hideLandingScreen();
      });
    });

    // Wire Delete buttons
    list.querySelectorAll('.save-list-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('save.deleteConfirm'))) return;
        const id = Number(btn.dataset.id);
        try {
          await deleteSaveById(id);
          if (currentSaveId === id) currentSaveId = null;
          refreshSaveListModal();
        } catch (e) {
          showToast(t('toast.deleteFailed'), 'danger');
        }
      });
    });

  } catch (e) {
    list.innerHTML = `
      <div class="save-list-empty">
        ${t('save.connectError')}
      </div>`;
    console.error('[SaveList]', e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Kept for backward-compatibility — no longer used for primary flow
function hasSave() { return currentSaveId !== null; }
function getSaveInfo() { return null; }
