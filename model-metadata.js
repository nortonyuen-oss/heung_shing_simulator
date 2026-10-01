// Model metadata: each model's footprint, anchor and alpha-scanned geometry - read from
// the release manifest when it has them, measured from the texture otherwise - and the
// per-version cache that saves re-measuring. Split out of main.js.

let modelMetadataCacheStore = loadModelMetadataCacheStore();

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
