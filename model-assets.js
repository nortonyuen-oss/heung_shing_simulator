// Model assets: the release asset manifest and how logical model paths resolve to the
// files actually shipped, discovering the house/commercial/industrial model sets, and the
// budgeted pool that streams zone model textures in and out. Split out of main.js.

let houseModelSets = {};
let commercialBuildingModels = [];
let industrialBuildingModels = [];
let modelAssetManifest = { version: 'development', entries: {} };
let modelAssetVersion = 'development';

const ZONE_TEXTURE_BUDGET_BYTES = 192 * 1024 * 1024;
const initialZoneTextureKeys = new Set();
const zoneTextureLastUsed = new Map();
const pendingZoneTextureLoads = new Map();

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
