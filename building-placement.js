// Building placement: placing, positioning and removing building sprites of every family,
// the sprite-key lookups that tell those families apart, footprint checks and anchoring, and
// the ground-corner fit that seats a model on its lot. Split out of main.js.

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
