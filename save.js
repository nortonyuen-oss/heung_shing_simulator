// ── Save / Load (SQLite via REST API) ─────────────────────────────────────────
// Requires server.js to be running (npm install && node server.js)

const API_BASE = '/api/saves';
const TERRAIN_API_BASE = '/api/terrains';
const TERRAIN_LOCAL_KEY = 'citybuilder.terrainPresets';
const COMPACT_SAVE_VERSION = 15;
const COMPACT_RLE_ENCODING = 'rle-row-major-v1';
const COMPACT_TREE_ENCODING = 'sparse-row-major-v1';
const COMPACT_TERRAIN_HEIGHT_MAX = 8;
const COMPACT_TREE_AGE_MAX = 6;
const COMPACT_BRIDGE_VALUE_PATTERN = /^(?:deck:(?:row|col)|ramp:[nesw])$/;
let terrainApiAvailable = null;
let currentSaveId = null;   // tracks which DB row we are editing
let saveOperationQueue = Promise.resolve();
let cityChangeAutosaveTimer = null;
// Loading a different city starts a new save session. Network responses from an
// older session may still arrive afterwards, but must never change the active
// manual save id of the newly loaded city.
let saveSessionGeneration = 0;
let loadRequestGeneration = 0;

function beginNewCitySaveSession(manualSaveId = null) {
  saveSessionGeneration += 1;
  loadRequestGeneration += 1;
  if (cityChangeAutosaveTimer) {
    clearTimeout(cityChangeAutosaveTimer);
    cityChangeAutosaveTimer = null;
  }
  currentSaveId = Number(manualSaveId) || null;
}

function showTextPromptDialog(message, defaultValue = '') {
  return new Promise((resolve) => {
    let dialog = document.getElementById('text-prompt-dialog');
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.id = 'text-prompt-dialog';
      dialog.className = 'sim-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.innerHTML = `
        <div class="dialog-overlay" data-prompt-cancel></div>
        <form class="dialog-box" style="max-width:420px; width:92vw">
          <div class="dialog-title-bar">
            <span data-prompt-title></span>
            <button class="dialog-close-btn" type="button" data-prompt-cancel>✕</button>
          </div>
          <div class="dialog-body">
            <input class="dialog-text-input" type="text" maxlength="30" autocomplete="off" spellcheck="false" />
          </div>
          <div class="dialog-footer">
            <button class="dialog-cancel-btn" type="button" data-prompt-cancel></button>
            <button class="dialog-ok-btn" type="submit"></button>
          </div>
        </form>
      `;
      document.body.appendChild(dialog);
    }

    const titleEl = dialog.querySelector('[data-prompt-title]');
    const inputEl = dialog.querySelector('.dialog-text-input');
    const okBtn = dialog.querySelector('.dialog-ok-btn');
    const cancelBtn = dialog.querySelector('.dialog-cancel-btn');
    const formEl = dialog.querySelector('form');

    titleEl.textContent = message;
    inputEl.value = defaultValue || '';
    okBtn.textContent = t('dialog.ok');
    cancelBtn.textContent = t('dialog.cancel');

    let settled = false;
    const cleanup = () => {
      dialog.style.display = 'none';
      formEl.removeEventListener('submit', onSubmit);
      dialog.querySelectorAll('[data-prompt-cancel]').forEach((el) => {
        el.removeEventListener('click', onCancel);
      });
      document.removeEventListener('keydown', onKeyDown);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      finish(inputEl.value);
    };
    const onCancel = () => finish(null);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') finish(null);
    };

    formEl.addEventListener('submit', onSubmit);
    dialog.querySelectorAll('[data-prompt-cancel]').forEach((el) => {
      el.addEventListener('click', onCancel);
    });
    document.addEventListener('keydown', onKeyDown);

    dialog.style.display = 'flex';
    window.setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 0);
  });
}

// ── Build save payload ────────────────────────────────────────────────────────

function createCompactSaveError(fieldName, detail) {
  const error = new Error(`Invalid compact save data (${fieldName}): ${detail}`);
  error.code = 'INVALID_COMPACT_SAVE';
  return error;
}

function getCompactMapDimensions() {
  const width = Number(MAP_WIDTH);
  const height = Number(MAP_HEIGHT);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw createCompactSaveError('dimensions', 'map dimensions are unavailable');
  }
  return { width, height, total: width * height };
}

function isValidCompactMapValue(fieldName, value) {
  if (fieldName === 'bridgeMap') {
    return value === null || (typeof value === 'string' && COMPACT_BRIDGE_VALUE_PATTERN.test(value));
  }
  if (fieldName === 'roadUnderlayMap') {
    return value === null || (Number.isInteger(value) && value >= 1 && value <= 6);
  }
  if (!Number.isInteger(value)) return false;
  if (fieldName === 'mapData') return value >= 1 && value <= 6;
  if (fieldName === 'heightMap') return value >= 0 && value <= COMPACT_TERRAIN_HEIGHT_MAX;
  if (fieldName === 'zoneMap') return value >= 0 && value <= 3;
  if (fieldName === 'zoneDensityMap') return value >= 1 && value <= 3;
  return false;
}

function assertCompactSourceMap(source, fieldName, width, height) {
  if (!Array.isArray(source) || source.length !== height) {
    throw createCompactSaveError(fieldName, `expected ${height} rows`);
  }
  source.forEach((row) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw createCompactSaveError(fieldName, `each row must contain ${width} cells`);
    }
  });
}

function encodeCompactRleMap(source, fieldName) {
  const { width, height } = getCompactMapDimensions();
  assertCompactSourceMap(source, fieldName, width, height);
  const runs = [];
  let previousValue;
  let previousCount = 0;

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const value = source[row][col];
      if (previousCount > 0 && value === previousValue) {
        previousCount += 1;
      } else {
        if (!isValidCompactMapValue(fieldName, value)) {
          throw createCompactSaveError(fieldName, `invalid value at ${row}:${col}`);
        }
        if (previousCount > 0) runs.push(previousValue, previousCount);
        previousValue = value;
        previousCount = 1;
      }
    }
  }
  if (previousCount > 0) runs.push(previousValue, previousCount);

  return { encoding: COMPACT_RLE_ENCODING, width, height, runs };
}

function decodeCompactRleMap(encoded, fieldName) {
  const { width, height, total } = getCompactMapDimensions();
  if (!encoded || typeof encoded !== 'object' || Array.isArray(encoded)) {
    throw createCompactSaveError(fieldName, 'RLE payload must be an object');
  }
  if (encoded.encoding !== COMPACT_RLE_ENCODING || encoded.width !== width || encoded.height !== height) {
    throw createCompactSaveError(fieldName, 'unsupported encoding or dimensions');
  }
  if (!Array.isArray(encoded.runs) || encoded.runs.length < 2
    || encoded.runs.length % 2 !== 0 || encoded.runs.length > total * 2) {
    throw createCompactSaveError(fieldName, 'invalid run list');
  }

  const flat = new Array(total);
  let offset = 0;
  for (let runIndex = 0; runIndex < encoded.runs.length; runIndex += 2) {
    const value = encoded.runs[runIndex];
    const count = encoded.runs[runIndex + 1];
    if (!isValidCompactMapValue(fieldName, value)) {
      throw createCompactSaveError(fieldName, `invalid value in run ${runIndex / 2}`);
    }
    if (!Number.isInteger(count) || count <= 0 || offset + count > total) {
      throw createCompactSaveError(fieldName, `invalid length in run ${runIndex / 2}`);
    }
    flat.fill(value, offset, offset + count);
    offset += count;
  }
  if (offset !== total) {
    throw createCompactSaveError(fieldName, `decoded ${offset} of ${total} cells`);
  }

  return Array.from({ length: height }, (_, row) => (
    flat.slice(row * width, (row + 1) * width)
  ));
}

function normalizeCompactTreeEntry(tree, fieldName, location) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) {
    throw createCompactSaveError(fieldName, `invalid tree at ${location}`);
  }
  const species = tree.species;
  const age = tree.age;
  const variant = tree.variant;
  const count = tree.count ?? 1;
  if (typeof species !== 'string' || !species.trim() || species.length > 40) {
    throw createCompactSaveError(fieldName, `invalid species at ${location}`);
  }
  if (!Number.isInteger(age) || age < 0 || age > COMPACT_TREE_AGE_MAX) {
    throw createCompactSaveError(fieldName, `invalid age at ${location}`);
  }
  if (!Number.isFinite(variant) || variant < 0 || variant > 1) {
    throw createCompactSaveError(fieldName, `invalid variant at ${location}`);
  }
  if (!Number.isInteger(count) || count < 1 || count > 3) {
    throw createCompactSaveError(fieldName, `invalid count at ${location}`);
  }
  return { species, age, variant, count };
}

function encodeCompactTreeMap(source) {
  const fieldName = 'treeMap';
  const { width, height } = getCompactMapDimensions();
  assertCompactSourceMap(source, fieldName, width, height);
  const entries = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (source[row][col] == null) continue;
      const index = row * width + col;
      const tree = normalizeCompactTreeEntry(source[row][col], fieldName, `${row}:${col}`);
      entries.push([index, tree.species, tree.age, tree.variant, tree.count]);
    }
  }
  return { encoding: COMPACT_TREE_ENCODING, width, height, entries };
}

function decodeCompactTreeMap(encoded) {
  const fieldName = 'treeMap';
  const { width, height, total } = getCompactMapDimensions();
  if (!encoded || typeof encoded !== 'object' || Array.isArray(encoded)) {
    throw createCompactSaveError(fieldName, 'sparse payload must be an object');
  }
  if (encoded.encoding !== COMPACT_TREE_ENCODING || encoded.width !== width || encoded.height !== height) {
    throw createCompactSaveError(fieldName, 'unsupported encoding or dimensions');
  }
  if (!Array.isArray(encoded.entries) || encoded.entries.length > total) {
    throw createCompactSaveError(fieldName, 'invalid sparse entry list');
  }

  const result = Array.from({ length: height }, () => Array(width).fill(null));
  let previousIndex = -1;
  encoded.entries.forEach((entry, entryNumber) => {
    if (!Array.isArray(entry) || entry.length !== 5) {
      throw createCompactSaveError(fieldName, `invalid entry ${entryNumber}`);
    }
    const [index, species, age, variant, count] = entry;
    if (!Number.isInteger(index) || index < 0 || index >= total || index <= previousIndex) {
      throw createCompactSaveError(fieldName, `invalid or duplicate index in entry ${entryNumber}`);
    }
    const tree = normalizeCompactTreeEntry(
      { species, age, variant, count },
      fieldName,
      `entry ${entryNumber}`,
    );
    result[Math.floor(index / width)][index % width] = tree;
    previousIndex = index;
  });
  return result;
}

function decodeSaveDataForLoad(rawSave) {
  if (!rawSave || typeof rawSave !== 'object' || Array.isArray(rawSave)) {
    throw createCompactSaveError('save', 'save payload must be an object');
  }
  const version = Number(rawSave.version);
  if (version < COMPACT_SAVE_VERSION || !Number.isFinite(version)) return rawSave;
  if (version !== COMPACT_SAVE_VERSION) {
    throw createCompactSaveError('version', `unsupported save version ${rawSave.version}`);
  }
  return {
    ...rawSave,
    mapData: decodeCompactRleMap(rawSave.mapData, 'mapData'),
    heightMap: decodeCompactRleMap(rawSave.heightMap, 'heightMap'),
    bridgeMap: decodeCompactRleMap(rawSave.bridgeMap, 'bridgeMap'),
    roadUnderlayMap: decodeCompactRleMap(rawSave.roadUnderlayMap, 'roadUnderlayMap'),
    zoneMap: decodeCompactRleMap(rawSave.zoneMap, 'zoneMap'),
    zoneDensityMap: decodeCompactRleMap(rawSave.zoneDensityMap, 'zoneDensityMap'),
    treeMap: decodeCompactTreeMap(rawSave.treeMap),
  };
}

function buildSavePayload({ autosave = false, manualSaveId = currentSaveId } = {}) {
  return {
    city_name:  city.name || getDefaultCityName(),
    population: city.population,
    year:       city.year,
    month:      city.month,
    budget:     city.budget,
    save_data: {
      version:       COMPACT_SAVE_VERSION,
      ...(autosave ? { autosave: { manualSaveId } } : {}),
      seed:          currentSeed,
      roadTileSetId: typeof getCurrentRoadTileSetId === 'function'
        ? getCurrentRoadTileSetId()
        : ROAD_TILE_SET_DEFAULT_ID,
      city:          { ...city },
      mapData:       encodeCompactRleMap(mapData, 'mapData'),
      heightMap:     encodeCompactRleMap(heightMap, 'heightMap'),
      bridgeMap:     encodeCompactRleMap(bridgeMap, 'bridgeMap'),
      roadUnderlayMap: encodeCompactRleMap(roadUnderlayMap, 'roadUnderlayMap'),
      zoneMap:       encodeCompactRleMap(zoneMap, 'zoneMap'),
      zoneDensityMap: encodeCompactRleMap(zoneDensityMap, 'zoneDensityMap'),
      treeVersion:   TREE_SYSTEM_VERSION,
      treeMap:       encodeCompactTreeMap(treeMap),
      buildingData,
      powerSources:  Array.from(powerSources),
      powerLineSet:  Array.from(powerLineSet),
      roadTileCount,
    },
  };
}

// ── Save ──────────────────────────────────────────────────────────────────────

function saveGame(silent = false) {
  if (!activeScene) {
    if (!silent) showToast(t('toast.gameNotReady'), 'warning');
    return Promise.resolve(false);
  }

  const isAutosave = silent === true;
  const targetSaveId = currentSaveId;
  const operationGeneration = saveSessionGeneration;
  // Capture the complete payload before joining the queue. Keeping only object
  // references here is not enough because nested city state can change while an
  // earlier save is in flight; serializing now gives this operation an immutable
  // snapshot of the city that was active when Save was requested.
  let requestBody;
  try {
    requestBody = JSON.stringify(buildSavePayload({
      autosave: isAutosave,
      manualSaveId: targetSaveId,
    }));
  } catch (e) {
    if (!silent) showToast(t('toast.saveFailed'), 'danger');
    console.error('[Save snapshot]', e);
    return Promise.resolve(false);
  }
  const operation = async () => {
    try {
      let res;
      if (isAutosave) {
        // Autosave has one dedicated slot and never changes the active manual slot.
        res = await fetch(`${API_BASE}/autosave`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    requestBody,
        });
      } else if (targetSaveId) {
        // Overwrite the existing slot
        res = await fetch(`${API_BASE}/${targetSaveId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    requestBody,
        });
      } else {
        // Create a new slot
        res = await fetch(API_BASE, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    requestBody,
        });
      }

      // An autosave may remember a manual slot that the player later deleted.
      // Treat that stale reference like a first save instead of trapping every
      // subsequent Ctrl+S in a permanent PUT -> 404 failure loop.
      if (!isAutosave && targetSaveId && res.status === 404
        && operationGeneration === saveSessionGeneration) {
        res = await fetch(API_BASE, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    requestBody,
        });
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isAutosave && operationGeneration === saveSessionGeneration) {
        currentSaveId = data.id;
      }
      if (operationGeneration === saveSessionGeneration) {
        showToast(silent ? t('toast.autosaved') : t('toast.citySaved'), 'info');
      }
      return true;
    } catch (e) {
      if (!silent && operationGeneration === saveSessionGeneration) {
        showToast(t('toast.saveFailed'), 'danger');
      }
      console.error('[Save]', e);
      return false;
    }
  };

  saveOperationQueue = saveOperationQueue.then(operation, operation);
  return saveOperationQueue;
}

function queueCityChangeAutosave(delayMs = 300) {
  if (!currentSaveId || !activeScene) return false;
  const scheduledSaveId = currentSaveId;
  if (cityChangeAutosaveTimer) clearTimeout(cityChangeAutosaveTimer);
  cityChangeAutosaveTimer = setTimeout(() => {
    cityChangeAutosaveTimer = null;
    if (currentSaveId !== scheduledSaveId) return;
    saveGame(true).then((saved) => {
      if (!saved) showToast(t('toast.saveFailed'), 'danger');
    });
  }, Math.max(0, Number(delayMs) || 0));
  return true;
}

// ── Save As (forces a new slot) ───────────────────────────────────────────────

async function saveAsGame() {
  if (!activeScene) { showToast(t('toast.gameNotReady'), 'warning'); return; }

  const name = await showTextPromptDialog(t('prompt.saveAs'), city.name || getDefaultCityName());
  if (name === null) return;        // user cancelled
  if (name.trim()) {
    city.name = name.trim().slice(0, 30);
    updateHUD();
  }

  // Temporarily clear currentSaveId so saveGame() POSTs a new row
  const prevId  = currentSaveId;
  const saveAsGeneration = saveSessionGeneration;
  if (cityChangeAutosaveTimer) {
    clearTimeout(cityChangeAutosaveTimer);
    cityChangeAutosaveTimer = null;
  }
  currentSaveId = null;
  const saved = await saveGame();
  if (!saved && saveAsGeneration === saveSessionGeneration) currentSaveId = prevId;
}

// ── Load by ID ────────────────────────────────────────────────────────────────

function getSaveModelCatalogByKey() {
  const houses = typeof houseModelSets !== 'undefined'
    ? Object.values(houseModelSets).flat()
    : [];
  const commercial = typeof commercialBuildingModels !== 'undefined' ? commercialBuildingModels : [];
  const industrial = typeof industrialBuildingModels !== 'undefined' ? industrialBuildingModels : [];
  return new Map([...houses, ...commercial, ...industrial].map((model) => [model.key, model]));
}

// Residential artwork was renamed when the L/M/H/UH wealth tiers were added.
// Keep old cities attached to the same visual slot instead of silently replacing
// their buildings with the first available house model.
const LEGACY_RESIDENTIAL_FILE_MIGRATIONS = Object.freeze({
  'house1-01.png': 'house1-01-L.png',
  'house1-02.png': 'house1-02-L.png',
  'house1-03.png': 'house1-03-L.png',
  'house1-05-highScore.png': 'house1-05-H.png',
  'house1-06-highScore.png': 'house1-06-H.png',
  'residential2-01.png': 'residential2-01-M.png',
  'residential2-02.png': 'residential2-02-M.png',
  'residential2-03-highScore.png': 'residential2-03-UH.png',
  'residential2-04.png': 'residential2-04-L.png',
  'residential2-05.png': 'residential2-05-L.png',
  'residential2-06.png': 'residential2-06-M.png',
  'residential2-07.png': 'residential2-07-M.png',
  'residential2-09.png': 'residential2-09-UH.png',
  'residential2-11-highScore.png': 'residential2-11-H.png',
  'residential2-12-highScore.png': 'residential2-12-UH.png',
  'residential2-13-highScore.png': 'residential2-13-UH.png',
  'residential2-14-highScore.png': 'residential2-14-UH.png',
  'residential2-15.png': 'residential2-15-H.png',
  'residential2-16.png': 'residential2-16-H.png',
  'residential2-17.png': 'residential2-17-H.png',
  'residential2-18.png': 'residential2-18-H.png',
  'residential2-19.png': 'residential2-10-H.png',
  'residential3-01.png': 'residential3-01-L.png',
  'residential3-02.png': 'residential3-02-L.png',
  'residential3-03.png': 'residential3-03-H.png',
  'residential3-04-highScore.png': 'residential3-04-H.png',
  'residential3-05-highScore.png': 'residential3-05-UH.png',
  'residential3-06.png': 'residential3-06-L.png',
  'residential3-07.png': 'residential3-07-M.png',
  'residential3-08.png': 'residential3-08-M.png',
  'residential3-12-highScore.png': 'residential3-12-H.png',
  'residential3-14.png': 'residential3-14-M.png',
  'residential4-01.png': 'residential4-01-M.png',
  'residential4-02.png': 'residential4-02-M.png',
  'residential5-01.png': 'residential5-01-H.png',
  'residential5-02.png': 'residential5-02-H.png',
  'residential5-03.png': 'residential5-03-L.png',
});

const LEGACY_COMMERCIAL_FILE_MIGRATIONS = Object.freeze({
  'commercialBuilding1-01.png': 'commercialBuilding1-01-L.png',
  'commercialBuilding1-02.png': 'commercialBuilding1-04-M.png',
  'commercialBuilding1-02-M.png': 'commercialBuilding1-04-M.png',
  'commercialBuilding1-03.png': 'commercialBuilding1-03-L.png',
  'commercialBuilding1-04.png': 'commercialBuilding1-04-M.png',
  'commercialBuilding1-05.png': 'commercialBuilding1-05-L.png',
  'commercialBuilding2-02.png': 'commercialBuilding2-02-H.png',
  'commercialBuilding2-03.png': 'commercialBuilding2-03-M.png',
  'commercialBuilding2-04.png': 'commercialBuilding2-04-M.png',
  'commercialBuilding2-05.png': 'commercialBuilding2-05-L.png',
  'commercialBuilding2-06.png': 'commercialBuilding2-06-L.png',
  'commercialBuilding2-07.png': 'commercialBuilding2-02-H.png',
  'commercialBuilding2-07-H.png': 'commercialBuilding2-02-H.png',
  'commercialBuilding2-08.png': 'commercialBuilding2-03-M.png',
  'commercialBuilding2-08-M.png': 'commercialBuilding2-03-M.png',
  'commercialBuilding3-01-highScore.png': 'commercialBuilding3-01-H.png',
  'commercialBuilding3-03.png': 'commercialBuilding3-03-M.png',
  'commercialBuilding3-04.png': 'commercialBuilding3-04-H.png',
  'commercialBuilding3-05-highScore.png': 'commercialBuilding3-05-UH.png',
  'commercialBuilding3-07.png': 'commercialBuilding3-07-M.png',
  'commercialBuilding3-08-highScore.png': 'commercialBuilding3-08-H.png',
  'commercialBuilding3-09.png': 'commercialBuilding3-09-M.png',
  'commercialBuilding3-10.png': 'commercialBuilding3-10-M.png',
  'commercialBuilding3-11.png': 'commercialBuilding3-11-H.png',
  'commercialBuilding4-01-highScore.png': 'commercialBuilding4-01-H.png',
  'commercialBuilding4-02-highScore.png': 'commercialBuilding4-02-H.png',
  'commercialBuilding4-03.png': 'commercialBuilding4-01-H.png',
  'commercialBuilding4-03-L.png': 'commercialBuilding4-01-H.png',
  'commercialBuilding4-04.png': 'commercialBuilding4-02-H.png',
  'commercialBuilding4-04-L.png': 'commercialBuilding4-02-H.png',
  'commercialBuilding5-01_fixed.png': 'commercialBuilding5-01-UH.png',
});

// sciencePark3-02 used the generated industrial_building_3x3_3 key and could
// render as Phaser's missing-texture placeholder during asynchronous science
// park conversion. Retire it and migrate saved references to the remaining
// 3x3 science-park model without changing the occupied footprint.
const RETIRED_INDUSTRIAL_MODEL_MIGRATIONS = Object.freeze({
  'sciencePark3-02': 'sciencePark3-01',
});

function getMigratedResidentialFileName(record) {
  if (record?.type !== 'residential') return null;
  const assetFileName = String(record.assetId ?? '').split('/').pop();
  const sourceFileName = record.sourceFileName || assetFileName;
  return LEGACY_RESIDENTIAL_FILE_MIGRATIONS[sourceFileName] ?? sourceFileName ?? null;
}

function getMigratedCommercialFileName(record) {
  if (record?.type !== 'commercial') return null;
  const assetFileName = String(record.assetId ?? '').split('/').pop();
  const sourceFileName = record.sourceFileName || assetFileName;
  return LEGACY_COMMERCIAL_FILE_MIGRATIONS[sourceFileName] ?? sourceFileName ?? null;
}

function getMigratedIndustrialFileName(record) {
  if (record?.type !== 'industrial') return null;
  const assetFileName = String(record.assetId ?? '').split('/').pop();
  const sourceFileName = record.sourceFileName || assetFileName;
  const baseName = String(sourceFileName ?? '').replace(/\.[^.]+$/, '');
  return RETIRED_INDUSTRIAL_MODEL_MIGRATIONS[baseName] ?? null;
}

function getSaveModelForRecord(record) {
  const models = [...getSaveModelCatalogByKey().values()];
  const migratedResidentialFileName = getMigratedResidentialFileName(record);
  if (migratedResidentialFileName) {
    const migratedModel = models.find((model) => model.sourceFileName === migratedResidentialFileName);
    if (migratedModel) {
      record.assetId = migratedModel.assetId;
      record.sourceFileName = migratedModel.sourceFileName;
      record.wealthTier = migratedModel.wealthTier;
      return migratedModel;
    }
  }
  const migratedCommercialFileName = getMigratedCommercialFileName(record);
  if (migratedCommercialFileName) {
    const migratedModel = models.find((model) => model.sourceFileName === migratedCommercialFileName);
    if (migratedModel) {
      record.assetId = migratedModel.assetId;
      record.sourceFileName = migratedModel.sourceFileName;
      record.commercialTier = migratedModel.commercialTier;
      return migratedModel;
    }
  }
  const migratedIndustrialFileName = getMigratedIndustrialFileName(record);
  if (migratedIndustrialFileName) {
    const migratedModel = models.find((model) => (
      String(model.sourceFileName ?? '').replace(/\.[^.]+$/, '') === migratedIndustrialFileName
    ));
    if (migratedModel) {
      record.assetId = migratedModel.assetId;
      record.sourceFileName = migratedModel.sourceFileName;
      return migratedModel;
    }
  }
  if (record?.assetId) {
    const byAssetId = models.find((model) => model.assetId === record.assetId);
    if (byAssetId) return byAssetId;
  }
  if (record?.sourceFileName) {
    const bySource = models.find((model) => model.sourceFileName === record.sourceFileName);
    if (bySource) return bySource;
  }
  return models.find((model) => model.key === record?.spriteKey) ?? null;
}

function waitForSceneLoader(scene) {
  if (!scene?.load?.isLoading?.()) return Promise.resolve();
  return new Promise((resolve) => scene.load.once('complete', resolve));
}

async function ensureSaveBuildingTextures(scene, save) {
  if (!scene?.load || !scene?.textures || !save?.buildingData) return;
  await waitForSceneLoader(scene);

  const missingModels = new Map();
  Object.values(save.buildingData).forEach((record) => {
    const model = getSaveModelForRecord(record);
    if (model && !scene.textures.exists(model.key)) missingModels.set(model.key, model);
  });
  if (missingModels.size === 0) return;

  // Loading happens before applySaveData mutates the active city. If any
  // texture remains unavailable after bounded retries, reject the load and
  // leave the current city untouched instead of constructing blank sprites.
  for (let attempt = 0; attempt < 3; attempt++) {
    const outstanding = [...missingModels.values()]
      .filter((model) => !scene.textures.exists(model.key));
    if (outstanding.length === 0) break;
    outstanding.forEach((model) => {
      const separator = model.path.includes('?') ? '&' : '?';
      scene.load.image(model.key, `${model.path}${separator}loadAttempt=${attempt + 1}`);
    });
    await new Promise((resolve) => {
      scene.load.once('complete', resolve);
      scene.load.start();
    });
    if (attempt < 2 && outstanding.some((model) => !scene.textures.exists(model.key))) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt)));
    }
  }
  const failed = [...missingModels.values()].filter((model) => !scene.textures.exists(model.key));
  if (failed.length > 0) {
    throw new Error(`Could not load ${failed.length} saved building texture(s)`);
  }
  if (typeof markZoneModelTextureUsed === 'function') {
    missingModels.forEach((model) => markZoneModelTextureUsed(model.key));
  }
  if (typeof prepareHouseModelMetadata === 'function') prepareHouseModelMetadata(scene);
  if (typeof prepareCommercialBuildingModelMetadata === 'function') prepareCommercialBuildingModelMetadata(scene);
  if (typeof prepareIndustrialBuildingModelMetadata === 'function') prepareIndustrialBuildingModelMetadata(scene);
}

async function loadSaveById(id, scene) {
  const loadGeneration = ++loadRequestGeneration;
  if (cityChangeAutosaveTimer) {
    clearTimeout(cityChangeAutosaveTimer);
    cityChangeAutosaveTimer = null;
  }

  try {
    // Finish every immutable snapshot queued before the load request before
    // replacing the in-memory city. This prevents old saves and the new city
    // from being interleaved on the wire.
    await saveOperationQueue;
    if (loadGeneration !== loadRequestGeneration) return false;

    const readyScene = await waitForLoadScene(scene);
    if (!readyScene) {
      showToast(t('toast.stillLoading'), 'warning');
      return false;
    }
    if (loadGeneration !== loadRequestGeneration) return false;

    const res = await fetch(`${API_BASE}/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const row  = await res.json();
    if (loadGeneration !== loadRequestGeneration) return false;
    const save = decodeSaveDataForLoad(row.save_data);
    await ensureSaveBuildingTextures(readyScene, save);
    if (loadGeneration !== loadRequestGeneration) return false;

    // Invalidate saves that may have been requested while the load fetch was in
    // flight. From this point onward, only the newly loaded city owns the active
    // save id.
    beginNewCitySaveSession();
    if (typeof isTerrainCreatorMode !== 'undefined') isTerrainCreatorMode = false;
    if (typeof activeTerrainProfileType !== 'undefined') activeTerrainProfileType = 'custom';
    if (typeof setTerrainEditorUiActive === 'function') setTerrainEditorUiActive(false);
    applySaveData(readyScene, save);
    // An autosave remembers which manual slot it came from. Loading it must not
    // make a later Ctrl+S overwrite the autosave slot itself.
    currentSaveId = row.save_type === 'autosave'
      ? (Number(save.autosave?.manualSaveId) || null)
      : id;

    showToast(t('toast.welcomeBack', { city: city.name }), 'info');
    return true;
  } catch (e) {
    showToast(t('toast.loadFailed'), 'danger');
    console.error('[Load]', e);
    return false;
  }
}

function waitForLoadScene(scene, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const poll = () => {
      const candidate = scene || (typeof activeScene !== 'undefined' ? activeScene : null);
      const isReady = !!candidate
        && !!candidate.scene
        && !!candidate.tileSprites
        && !!candidate.buildingSprites
        && !!candidate.zoneOverlays;
      if (isReady) {
        resolve(candidate);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      window.setTimeout(poll, 100);
    };
    poll();
  });
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
  const count = Number(value.count);

  return {
    species,
    age: Number.isFinite(age) ? Math.max(0, Math.round(age)) : 0,
    variant: Number.isFinite(variant) ? Math.max(0, Math.min(1, variant)) : 0,
    count: Number.isFinite(count) ? Math.max(1, Math.min(3, Math.round(count))) : 1,
  };
}

const TERRAIN_ELEVATION_REPAIR_THRESHOLD = 64;

function normalizeSavedTerrainElevation(save) {
  const sourceMap = Array.isArray(save?.mapData) ? save.mapData : [];
  const sourceHeights = Array.isArray(save?.heightMap) ? save.heightMap : [];
  const normalizedMap = createFilledMap(GROUND);
  const normalizedHeights = createFilledMap(0);
  let impossibleWaterHeight = 0;
  let zeroHeightHill = 0;
  let elevatedSurface = 0;

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const rawTile = Number((sourceMap[row] ?? [])[col]);
      const tile = [GROUND, ROAD, DIRT, BEACH, WATER, HILL].includes(rawTile) ? rawTile : GROUND;
      const rawHeight = Number((sourceHeights[row] ?? [])[col]);
      const fallbackHeight = tile === HILL ? 1 : 0;
      const height = Number.isFinite(rawHeight)
        ? Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.round(rawHeight)))
        : fallbackHeight;
      normalizedMap[row][col] = tile;
      normalizedHeights[row][col] = height;
      if ((tile === WATER || tile === BEACH) && height > 0) impossibleWaterHeight++;
      if (tile === HILL && height <= 0) zeroHeightHill++;
      if (![HILL, ROAD, WATER, BEACH].includes(tile) && height > 0) elevatedSurface++;
    }
  }

  // Elevated GROUND/DIRT is valid in older saves. Those cells carry the
  // altitude beneath developed land and mountain roads, even though their
  // surface type is no longer HILL. Only water/beach elevation and a HILL at
  // level zero are contradictory states.
  const severeMismatch = impossibleWaterHeight + zeroHeightHill >= TERRAIN_ELEVATION_REPAIR_THRESHOLD;
  let changedTiles = 0;

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const originalTile = normalizedMap[row][col];
      const originalHeight = normalizedHeights[row][col];
      let tile = originalTile;
      let height = originalHeight;

      if (tile === WATER || tile === BEACH) {
        height = 0;
      } else if (tile === HILL && height <= 0) {
        // A zero-height hill already renders as ordinary ground. Preserve the
        // elevation field and repair the stale surface classification instead
        // of inventing a new one-level plateau.
        tile = GROUND;
      }

      normalizedMap[row][col] = tile;
      normalizedHeights[row][col] = height;
      if (tile !== originalTile || height !== originalHeight) changedTiles++;
    }
  }

  return {
    mapData: normalizedMap,
    heightMap: normalizedHeights,
    repaired: changedTiles > 0,
    severeMismatch,
    diagnostics: {
      impossibleWaterHeight,
      zeroHeightHill,
      elevatedSurface,
      changedTiles,
      relaxedTiles: 0,
    },
  };
}

function restoreOrGenerateTrees(scene, save) {
  treeMap = createFilledMap(null);
  if (typeof invalidateTreeSimulationTiles === 'function') invalidateTreeSimulationTiles();

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

  const terrainElevation = normalizeSavedTerrainElevation(save);

  // Restore terrain
  currentSeed = save.seed ?? currentSeed;
  if (typeof setRoadTileSet === 'function') {
    setRoadTileSet(save.roadTileSetId ?? ROAD_TILE_SET_DEFAULT_ID, { refresh: false });
  } else if (typeof setCurrentRoadTileSetId === 'function') {
    setCurrentRoadTileSetId(save.roadTileSetId ?? ROAD_TILE_SET_DEFAULT_ID);
  }
  for (let r = 0; r < MAP_HEIGHT; r++)
    for (let c = 0; c < MAP_WIDTH; c++)
      mapData[r][c] = terrainElevation.mapData[r][c];
  heightMap = terrainElevation.heightMap.map((row) => Array.from(row));
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
      roadUnderlayMap[r][c] = [GROUND, ROAD, DIRT, BEACH, WATER, HILL].includes(underlay) ? underlay : null;
      if (bridgeMap[r][c]?.startsWith('deck:') && roadUnderlayMap[r][c] !== null && roadUnderlayMap[r][c] !== ROAD) {
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
      zoneMap[r][c] = (save.zoneMap?.[r] ?? [])[c] ?? ZONE_NONE;

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
  if (terrainElevation.repaired && typeof showToast === 'function') {
    showToast(t('toast.terrainElevationRepaired'), 'info');
  }

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
      if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, overlay, 'terrainLayer');
      overlay.setOrigin(0.5, 1);
      overlay.setDepth(getTerrainTileDepth(r, c, getTileKey(r, c), pos.y) + 0.05);
      overlay.setAlpha(0.80);
      overlay.setMask(scene.worldMask);
      scene.zoneOverlays.set(getTileId(r, c), overlay);
    }
  }
  if (typeof sortRenderLayer === 'function') sortRenderLayer(scene, 'terrainLayer');

  // Buildings (buildingData only stores anchor tiles)
  Object.entries(save.buildingData ?? {}).forEach(([id, record]) => {
    if (scene.buildingSprites.has(id)) return;

    const [r, c] = id.split(':').map(Number);
    migrateAirportBuildingRecord(record);
    const key    = record.type === HARBOR_BUILDING_TYPE
      ? getHarborVisualKey(
        r,
        c,
        record.footprintCols ?? HARBOR_FOOTPRINT_COLS,
        record.footprintRows ?? HARBOR_FOOTPRINT_ROWS,
      )
      : deriveLoadedSpriteKey(record);
    const opts   = normalizeLoadedBuildingOptions(key, record);

    placeSpriteBuilding(scene, r, c, key, opts);
    Object.assign(record, opts, { spriteKey: key });
  });
  grandfatherLegacyAirportProjectApproval();

  // Power-line graphics
  (save.powerLineSet ?? []).forEach((id) => {
    const [r, c] = id.split(':').map(Number);
    if (!scene.powerLineSprites.has(id)) {
      drawPowerLineSprite(scene, r, c);
    }
  });

  if (typeof rebuildTreeSprites === 'function') rebuildTreeSprites(scene);
  if (typeof rebuildDistrictSignSprites === 'function') rebuildDistrictSignSprites(scene);
  if (typeof sortWorldRenderLayers === 'function') sortWorldRenderLayers(scene);
}

// ── Fallback sprite key for saves without spriteKey ───────────────────────────

function deriveFallbackSpriteKey(record) {
  if (typeof isPowerPlantType === 'function' && isPowerPlantType(record.type)) {
    return POWER_PLANT_MODELS[record.type].spriteKey;
  }
  if (typeof SERVICE_BUILDING_MODELS !== 'undefined' && SERVICE_BUILDING_MODELS[record.type]) {
    return SERVICE_BUILDING_MODELS[record.type].spriteKey;
  }
  if (typeof SPECIAL_BUILDING_MODELS !== 'undefined' && SPECIAL_BUILDING_MODELS[record.type]) {
    return SPECIAL_BUILDING_MODELS[record.type].spriteKey;
  }
  if (typeof HARBOR_BUILDING_TYPE !== 'undefined' && record.type === HARBOR_BUILDING_TYPE) {
    return 'harbor_ll';
  }

  const infraIdx = typeof INFRA_SPRITE_INDEX !== 'undefined'
    ? INFRA_SPRITE_INDEX[record.type]
    : undefined;
  if (infraIdx !== undefined) return getFallbackHouseSpriteKey();
  if (record.type === 'park_small') return 'park_small_open';
  if (record.type === 'park_large') return 'park_large';
  if (record.type === 'park_flagship') return 'park_flagship_victoria';
  if (record.type === 'sports_ground_small') return 'sports_ground_2x2';
  if (record.type === 'sports_ground_large') return 'sports_ground_3x3';
  if (record.type === 'residential') return getFallbackHouseSpriteKey();
  if (record.type === 'commercial')  return getFallbackCommercialSpriteKey(record);
  if (record.type === 'industrial')  return getFallbackIndustrialSpriteKey(record);
  return getFallbackHouseSpriteKey();
}

function deriveLoadedSpriteKey(record) {
  if (typeof isPowerPlantType === 'function' && isPowerPlantType(record.type)) {
    return POWER_PLANT_MODELS[record.type].spriteKey;
  }
  if (typeof SPECIAL_BUILDING_MODELS !== 'undefined' && SPECIAL_BUILDING_MODELS[record.type]) {
    const savedKey = record.spriteKey;
    if (savedKey && typeof isSpecialBuildingSpriteKey === 'function' && isSpecialBuildingSpriteKey(savedKey)) {
      return savedKey;
    }
    return SPECIAL_BUILDING_MODELS[record.type].spriteKey;
  }
  const savedModel = getSaveModelForRecord(record);
  if (savedModel) return savedModel.key;
  let key = record.spriteKey ?? deriveFallbackSpriteKey(record);
  key = migrateServiceSpriteKey(record, key);
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
  if (record.type === 'industrial' && !isLoadedTextureKey(key)) {
    return getFallbackIndustrialSpriteKey(record) ?? deriveFallbackSpriteKey(record);
  }
  return key;
}

function migrateAirportBuildingRecord(record) {
  if (!record || record.type !== 'airport') return record;
  const model = typeof SPECIAL_BUILDING_MODELS !== 'undefined'
    ? SPECIAL_BUILDING_MODELS.airport
    : null;
  if (!model) return record;

  const legacyModel = typeof LEGACY_AIRPORT_MODEL !== 'undefined'
    ? LEGACY_AIRPORT_MODEL
    : null;
  const legacy8x8Model = typeof LEGACY_AIRPORT_8X8_MODEL !== 'undefined'
    ? LEGACY_AIRPORT_8X8_MODEL
    : null;
  const savedCols = Number(record.footprintCols ?? 6);
  const savedRows = Number(record.footprintRows ?? 6);
  const isLegacy6x6 = record.spriteKey === 'airport_6x6'
    || record.spriteKey === 'airport_6x6_legacy'
    || savedCols <= 6
    || savedRows <= 6;
  const isLegacy8x8 = !isLegacy6x6 && (
    record.spriteKey === 'airport_8x8'
    || record.spriteKey === 'airport_8x8_legacy'
    || savedCols <= 8
    || savedRows <= 8
  );
  const targetModel = isLegacy6x6 && legacyModel
    ? legacyModel
    : isLegacy8x8 && legacy8x8Model
      ? legacy8x8Model
      : model;

  // Preserve old 6x6/8x8 occupancy; only newly constructed airports use 12x12.
  record.spriteKey = targetModel.spriteKey;
  record.assetId = model.path;
  delete record.sourceFileName;
  record.footprintCols = targetModel.footprintCols;
  record.footprintRows = targetModel.footprintRows;
  return record;
}

function grandfatherLegacyAirportProjectApproval() {
  const hasSavedAirport = Object.values(buildingData ?? {}).some((record) => record?.type === 'airport');
  const state = city.council?.resolutionStates?.roseGardenAirportProject;
  if (!hasSavedAirport || !state || Number(state.timesApproved || 0) > 0) return false;
  state.timesApproved = 1;
  state.cooldownUntilMonthIndex = -1;
  return true;
}

function migrateServiceSpriteKey(record, key) {
  if (record.type === 'primary_school' && key === 'primary_school_3x3') return 'primary_school_2x2';
  if (record.type === 'secondary_school' && key === 'secondary_school_3x3') return 'secondary_school_2x2';
  if (record.type === 'stock_exchange' && key === 'stock_exchange_3x3') return 'stock_exchange_4x4';
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
  return model && isLoadedTextureKey(model.key)
    ? model.key
    : getFallbackCommercialSpriteKey(record);
}

function getFallbackCommercialSpriteKey(record) {
  const footprintCols = record.footprintCols ?? 2;
  const footprintRows = record.footprintRows ?? 2;
  const models = typeof commercialBuildingModels !== 'undefined'
    ? commercialBuildingModels
    : [];
  const matching = models.find((model) => (
    model.footprintCols === footprintCols && model.footprintRows === footprintRows
    && isLoadedTextureKey(model.key)
  ));
  const loaded = matching ?? models.find((model) => isLoadedTextureKey(model.key));
  return loaded?.key ?? null;
}

function getFallbackIndustrialSpriteKey(record) {
  const footprintCols = record.footprintCols ?? 2;
  const footprintRows = record.footprintRows ?? 2;
  const models = typeof industrialBuildingModels !== 'undefined'
    ? industrialBuildingModels
    : [];
  const matching = models.find((model) => (
    model.footprintCols === footprintCols && model.footprintRows === footprintRows
    && isLoadedTextureKey(model.key)
  ));
  const loaded = matching ?? models.find((model) => isLoadedTextureKey(model.key));
  return loaded?.key ?? null;
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
          if (currentSaveId === id) beginNewCitySaveSession();
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
