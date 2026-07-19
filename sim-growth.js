let lastCommercialMergeScanTick = null;

function isBuildingHighScoreVisual(record) {
  if (!record?.spriteKey) return false;
  if (record.type === 'residential' && ['H', 'UH'].includes(record.wealthTier)) return true;
  if (record.type === 'commercial' && ['H', 'UH'].includes(record.commercialTier)) return true;
  const model = (typeof getCommercialBuildingModelBySpriteKey === 'function'
    ? getCommercialBuildingModelBySpriteKey(record.spriteKey)
    : null)
    ?? (typeof getHouseModelBySpriteKey === 'function'
      ? getHouseModelBySpriteKey(record.spriteKey)
      : null);
  if (!model) return false;
  if (record.type === 'residential') return model.wealthTier === 'H' || model.wealthTier === 'UH';
  if (record.type === 'commercial') return model.commercialTier === 'H' || model.commercialTier === 'UH';
  return isHighScoreModel(model);
}

function tryRedecoratePremiumBuilding(
  scene,
  r,
  c,
  zone,
  residentialQualityContext = null,
  commercialQualityContext = null,
) {
  const id = getTileId(r, c);
  const record = buildingData[id];
  if (!record) return;

  const fp  = record.footprintCols ?? 1;
  const fpr = record.footprintRows ?? 1;

  let newModel = null;
  if (zone === ZONE_RES) {
    const setKey = getResidentialHouseSetForFootprint(Math.max(fp, fpr));
    const density = record.density ?? (zoneDensityMap[r]?.[c] ?? DENSITY_LOW);
    const context = residentialQualityContext ?? createResidentialQualityContext();
    const factors = getResidentialSiteFactors(r, c, Math.max(fp, fpr), context);
    newModel = getRandomHouseModel(setKey, factors.quality, true, density, factors);
  } else if (zone === ZONE_COM) {
    const density = record.density ?? (zoneDensityMap[r]?.[c] ?? DENSITY_LOW);
    const context = commercialQualityContext ?? createCommercialQualityContext();
    const factors = getCommercialSiteFactors(r, c, Math.max(fp, fpr), context);
    newModel = getRandomCommercialBuildingModel(fp, fpr, factors.quality, true, density, factors);
  }
  if (!newModel || newModel.key === record.spriteKey) return;
  if (!scene.textures.exists(newModel.key)) return;

  const sprite = scene.buildingSprites.get(id);
  if (!sprite) return;

  const meta = newModel.metadata ?? {};

  // Swap texture and sync ALL visual geometry to the new model's metadata.
  // Without this, Phaser keeps the old scale/origin while displaying the new
  // texture's pixel dimensions, producing an incorrect apparent size.
  sprite.setTexture(newModel.key);
  sprite.setOrigin(meta.originX ?? 0.5, meta.originY ?? 1);
  if (meta.scaleX || meta.scaleY) {
    sprite.setScale(meta.scaleX ?? meta.scale ?? 1, meta.scaleY ?? meta.scale ?? 1);
  } else if (meta.scale) {
    sprite.setScale(meta.scale);
  }
  // Adjust position if offsetX/offsetY differs from the original model
  const dOffX = (meta.offsetX ?? 0) - (record.offsetX ?? 0);
  const dOffY = (meta.offsetY ?? 0) - (record.offsetY ?? 0);
  if (dOffX !== 0) sprite.x += dOffX;
  if (dOffY !== 0) sprite.y += dOffY;
  if (typeof ensureWorldMaskContainsBuilding === 'function') {
    ensureWorldMaskContainsBuilding(scene, sprite);
  }

  // Persist updated visual metadata so save/reload renders correctly
  record.spriteKey  = newModel.key;
  record.assetId = newModel.assetId;
  record.sourceFileName = newModel.sourceFileName;
  record.originX    = meta.originX;
  record.originY    = meta.originY;
  record.scale      = meta.scale;
  record.scaleX     = meta.scaleX;
  record.scaleY     = meta.scaleY;
  record.offsetX    = meta.offsetX;
  record.offsetY    = meta.offsetY;
  record.anchorMode = meta.anchorMode ?? record.anchorMode;
  if (newModel.wealthTier) record.wealthTier = newModel.wealthTier;
  if (newModel.commercialTier) record.commercialTier = newModel.commercialTier;
}

function growOrShrinkZones(scene) {
  const landValueMap = typeof computeLandValueMap === 'function'
    ? computeLandValueMap()
    : null;
  const residentialQualityContext = createResidentialQualityContext(landValueMap);
  const commercialQualityContext = createCommercialQualityContext(landValueMap);
  const tickGap = lastCommercialMergeScanTick === null ? Infinity : Math.abs(city.tick - lastCommercialMergeScanTick);
  const runCommercialMerge = tickGap <= TICKS_PER_MONTH * 2
    && city.tick > TICKS_PER_MONTH
    && city.tick % TICKS_PER_MONTH === 0;
  lastCommercialMergeScanTick = city.tick;
  let commercialMergeBudget = runCommercialMerge ? 4 : 0;

  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      const zone = zoneMap[r][c];
      if (zone === ZONE_NONE) continue;

      const id      = getTileId(r, c);
      const hasBldg = scene.buildingSprites.has(id);
      const powered = !!powerMap[r][c];
      const hasRoad = hasAdjacentRoad(r, c);
      const demand  = zone === ZONE_RES ? city.demandR
                    : zone === ZONE_COM ? city.demandC
                    : city.demandI;

      // Power multiplies growth speed. A citywide shortage slows all powered
      // tiles; unpowered tiles remain mostly stagnant.
      const cityPower = city.powerRatio ?? 1;
      const powerMul   = powered
        ? Math.max(0.06, Math.min(1, 0.08 + cityPower * 0.92))
        : 0.03;
      const density    = zoneDensityMap[r][c] ?? DENSITY_LOW;
      const densityMul = DENSITY_GROW_MUL[density] ?? 1.0;
      const landScore = getZoneGrowthLandScore(r, c, zone, landValueMap);
      const growthLandMul = 0.72 + landScore * 0.85;

      if (!hasBldg) {
        // Grow a new building
        if (hasRoad && demand > 0 && Math.random() < demand * GROW_CHANCE_BASE * powerMul * densityMul * growthLandMul) {
          spawnZoneBuilding(scene, r, c, zone, 1, density, {
            landScore,
            residentialQualityContext,
            commercialQualityContext,
          });
        }
      } else {
        const record = buildingData[id];
        if (!record || !['residential', 'commercial', 'industrial'].includes(record.type)) continue;

        const footprintArea = (record.footprintCols ?? 1) * (record.footprintRows ?? 1);
        const footprintTier = Math.max(0, Math.sqrt(footprintArea) - 1);
        // Commercial upgrade gate is land-score-driven (not demand-gated) so that
        // buildings level up based on neighbourhood quality even when overall commercial
        // supply exceeds demand. Residential and industrial keep the original demand gate.
        const upgradeDemandGate = zone === ZONE_COM
          ? Math.max(-0.15, 0.10 - landScore * 0.25)
          : Math.max(0.3, 0.5 - landScore * 0.2);
        const upgradePremiumMul = 0.72 + landScore * 1.05 + footprintTier * 0.20;

        if (
          commercialMergeBudget > 0
          && zone === ZONE_COM
          && record.level >= 3
          && shouldScanCommercialMergeTile(r, c)
          && tryMergeCommercialCluster(scene, r, c, record, landScore, commercialQualityContext)
        ) {
          commercialMergeBudget--;
          continue;
        }

        if (record.level < 3 && hasRoad && demand > upgradeDemandGate && Math.random() < UPGRADE_CHANCE * powerMul * densityMul * upgradePremiumMul) {
          if (zone === ZONE_RES && tryMergeResidentialCluster(scene, r, c, record, residentialQualityContext)) continue;
          upgradeZoneBuilding(scene, r, c, zone, landScore, residentialQualityContext, commercialQualityContext);
        } else if ((!hasRoad || demand < -0.5 || cityPower < 0.35) && Math.random() < SHRINK_CHANCE * (cityPower < 0.35 ? 1.5 : 1)) {
          shrinkOrRemoveZoneBuilding(scene, r, c);
        } else if (
          record.level >= 3
          && (zone === ZONE_RES || zone === ZONE_COM)
          && city.tick % TICKS_PER_MONTH === 0
          && isBuildingHighScoreVisual(record)
          && Math.random() < PREMIUM_VISUAL_REBALANCE_CHANCE_PER_MONTH
        ) {
          // Mature skylines are periodically re-evaluated. This lets old saves
          // shed excess towers gradually when local H/UH density is saturated.
          tryRedecoratePremiumBuilding(
            scene,
            r,
            c,
            zone,
            residentialQualityContext,
            commercialQualityContext,
          );
        } else if (
          record.level >= 3
          && (zone === ZONE_RES || zone === ZONE_COM)
          && city.tick % TICKS_PER_MONTH === 0
          && isHighScoreModelEligible(landScore)
          && (city.unemploymentRate ?? 1) < 0.12
          && (city.demandC ?? 0) > 0.10
          && !isBuildingHighScoreVisual(record)
          && Math.random() < PREMIUM_VISUAL_UPGRADE_CHANCE_PER_MONTH
        ) {
          // Premium upgrades are checked monthly instead of every simulation
          // tick, preventing H/UH visuals from accumulating across the map.
          tryRedecoratePremiumBuilding(
            scene,
            r,
            c,
            zone,
            residentialQualityContext,
            commercialQualityContext,
          );
        } else if (
          zone === ZONE_IND
          && !isScienceParkIndustrialRecord(record)
          && city.scienceParkUnlocked
          && (record.footprintCols ?? 1) >= 2
        ) {
          // Per-tick science-park conversion — probability scales with higher
          // education level and science-development policy.
          const higherEdu = clamp(city.educationHigherIndex ?? 0, 0, 1);
          const policyBonus = isPolicyActive('scienceDevelopment') ? 0.005 : 0;
          const tickChance = clamp(0.003 + 0.012 * higherEdu + policyBonus, 0, 0.025);
          if (Math.random() < tickChance) {
            tryConvertSingleIndustrialToSciencePark(scene, r, c, record);
          }
        }
      }
    }
  }
}

function spawnZoneBuilding(scene, r, c, zone, level, density = DENSITY_LOW, optionsOverride = {}) {
  let key;
  let options = {};
  let selectedModel = null;
  const landScore = clamp(optionsOverride.landScore ?? 0.5, 0, 1);
  const preferHighScore = !!(optionsOverride.preferHighScore);

  if (zone === ZONE_RES) {
    const residentialQualityContext = optionsOverride.residentialQualityContext
      ?? createResidentialQualityContext(optionsOverride.landValueMap ?? null);
    const anchorFactors = getResidentialSiteFactors(r, c, 1, residentialQualityContext);
    const footprintSize = chooseResidentialFootprint(scene, r, c, density, optionsOverride, anchorFactors);
    const setKey = getResidentialHouseSetForFootprint(footprintSize);
    const siteFactors = getResidentialSiteFactors(r, c, footprintSize, residentialQualityContext);
    const model = getRandomHouseModel(setKey, siteFactors.quality, preferHighScore, density, siteFactors);

    if (model) {
      selectedModel = model;
      key     = model.key;
      options = { ...model.metadata };
    } else if (footprintSize > 1) {
      // Larger models not ready yet — fall back to 1×1.
      const fallback = getRandomHouseModel('house', siteFactors.quality, preferHighScore, density, siteFactors);
      if (fallback) {
        selectedModel = fallback;
        key     = fallback.key;
        options = { ...fallback.metadata };
      } else {
        return false;
      }
    } else {
      // Model loading is asynchronous; retry growth on a later tick.
      return false;
    }
  } else if (zone === ZONE_COM) {
    const commercialQualityContext = optionsOverride.commercialQualityContext
      ?? createCommercialQualityContext(optionsOverride.landValueMap ?? null);
    const anchorFactors = getCommercialSiteFactors(r, c, 1, commercialQualityContext);
    const footprintSize = chooseNonResidentialFootprint(
      scene,
      r,
      c,
      zone,
      density,
      anchorFactors.quality,
      optionsOverride,
      anchorFactors,
    );
    const siteFactors = getCommercialSiteFactors(r, c, footprintSize, commercialQualityContext);
    const model = getRandomCommercialBuildingModel(
      footprintSize,
      footprintSize,
      siteFactors.quality,
      preferHighScore,
      density,
      siteFactors,
    );
    if (!model) return false;

    key     = model.key;
    options = { ...model.metadata };
  } else {
    const footprintSize = chooseNonResidentialFootprint(scene, r, c, zone, density, landScore, optionsOverride);
    const model = getRandomIndustrialBuildingModel(footprintSize, footprintSize);
    if (model) {
      selectedModel = model;
      key = model.key;
      options = { ...model.metadata };
    } else {
      return false;
    }
  }

  const fp  = options.footprintCols ?? 1;
  const fpr = options.footprintRows ?? 1;
  if (!canPlaceBuildingFootprint(r, c, fp, fpr)) return false;

  placeSpriteBuilding(scene, r, c, key, options);

  // 2×2 (or larger) buildings house proportionally more residents;
  // high-density zones multiply population further.
  const basePop  = zone === ZONE_RES ? (POP_PER_LEVEL[level] || 0) : 0;
  const popMul   = DENSITY_POP_MUL[density] ?? 1.0;

  buildingData[getTileId(r, c)] = {
    type: zone === ZONE_RES ? 'residential' : zone === ZONE_COM ? 'commercial' : 'industrial',
    level,
    density,
    population: Math.round(basePop * fp * fpr * popMul),
    age: 0,
    spriteKey:    key,
    footprintCols: fp,
    footprintRows: fpr,
    originX: options.originX,
    originY: options.originY,
    scale:   options.scale,
    scaleX:  options.scaleX,
    scaleY:  options.scaleY,
    offsetX: options.offsetX,
    offsetY: options.offsetY,
    anchorMode: options.anchorMode,
    assetId: options.assetId ?? selectedModel?.assetId,
    sourceFileName: options.sourceFileName,
    wealthTier: zone === ZONE_RES
      ? (options.wealthTier ?? selectedModel?.wealthTier ?? 'L')
      : undefined,
    commercialTier: zone === ZONE_COM
      ? (options.commercialTier ?? selectedModel?.commercialTier ?? 'L')
      : undefined,
  };
  markPowerGridDirty();
  invalidateBuildingCountCache();
  return true;
}

function getResidential2x2Chance(density) {
  return RES_2X2_SPAWN_CHANCE[density] ?? RES_2X2_SPAWN_CHANCE[DENSITY_LOW];
}

function getResidentialLargeSpawnChance(footprintSize, density) {
  return RES_LARGE_SPAWN_CHANCE[density]?.[footprintSize]
    ?? RES_LARGE_SPAWN_CHANCE[DENSITY_LOW]?.[footprintSize]
    ?? 0;
}

function getResidentialHouseSetForFootprint(footprintSize) {
  if (footprintSize === 5) return 'house5x5';
  if (footprintSize === 4) return 'house4x4';
  if (footprintSize === 3) return 'house3x3';
  if (footprintSize === 2) return 'house2x2';
  return 'house';
}

function chooseResidentialFootprint(scene, r, c, density, optionsOverride = {}, siteFactors = null) {
  const forcedSize = optionsOverride.forceFootprint ?? (optionsOverride.force2x2 ? 2 : null);
  if (forcedSize) {
    return canPlaceResidentialFootprint(scene, r, c, forcedSize) && hasResidentialModelForFootprint(forcedSize)
      ? forcedSize
      : 1;
  }

  const candidates = [5, 4, 3, 2];
  for (const footprintSize of candidates) {
    let chance = footprintSize === 2
      ? getResidential2x2Chance(density)
      : getResidentialLargeSpawnChance(footprintSize, density);
    if (density === DENSITY_LOW && footprintSize === 3 && isUltraHighWealthEligible(siteFactors, density)) {
      chance = siteFactors.quality >= 0.85
        ? RESIDENTIAL_LOW_DENSITY_3X3_CHANCE.elite
        : RESIDENTIAL_LOW_DENSITY_3X3_CHANCE.premium;
    }
    const largeLotBoost = getLargeLotSpawnBoost(siteFactors?.quality ?? 0.5, footprintSize);
    const adjustedChance = Math.min(0.95, chance * largeLotBoost);
    if (adjustedChance <= 0 || Math.random() >= adjustedChance) continue;
    if (!hasResidentialModelForFootprint(footprintSize)) continue;
    if (canPlaceResidentialFootprint(scene, r, c, footprintSize)) return footprintSize;
  }

  return 1;
}

// Returns true when a block anchored at (r, c) is fully clear and zoned RES.
function canPlaceResidentialFootprint(scene, r, c, footprintSize) {
  return canPlaceZoneBuildingFootprint(scene, r, c, ZONE_RES, footprintSize, footprintSize);
}

function canPlace2x2Residential(scene, r, c) {
  return canPlaceResidentialFootprint(scene, r, c, 2);
}

// Multi-tile zone buildings need every footprint tile to match the same zone,
// be empty, buildable, and sit on the same height plane.
function canPlace2x2ZoneBuilding(scene, r, c, zoneType) {
  return canPlaceZoneBuildingFootprint(scene, r, c, zoneType, 2, 2);
}

function chooseNonResidentialFootprint(
  scene,
  r,
  c,
  zone,
  density,
  landScore = 0.5,
  optionsOverride = {},
  siteFactors = null,
) {
  const forcedSize = optionsOverride.forceFootprint ?? null;
  if (forcedSize) {
    const forcedFactors = zone === ZONE_COM && optionsOverride.commercialQualityContext
      ? getCommercialSiteFactors(r, c, forcedSize, optionsOverride.commercialQualityContext)
      : siteFactors;
    return hasNonResidentialBuildingModelForFootprint(zone, forcedSize, landScore, density, forcedFactors)
      && canPlaceZoneBuildingFootprint(scene, r, c, zone, forcedSize, forcedSize)
      ? forcedSize
      : 1;
  }

  const candidates = zone === ZONE_COM ? [5, 4, 3, 2] : [3, 2];
  const commercialDemandBoost = zone === ZONE_COM
    ? getCommercialProsperityBoost() * clamp(0.95 + Math.max(0, city.demandC) * 0.35 + landScore * 0.15, 0.95, 1.45)
    : 1;
  for (const footprintSize of candidates) {
    const candidateFactors = zone === ZONE_COM && optionsOverride.commercialQualityContext
      ? getCommercialSiteFactors(r, c, footprintSize, optionsOverride.commercialQualityContext)
      : siteFactors;
    const chance = getNonResidentialLargeSpawnChance(zone, footprintSize, density);
    const largeLotBoost = getLargeLotSpawnBoost(landScore, footprintSize);
    const adjustedChance = Math.min(0.98, chance * largeLotBoost * commercialDemandBoost);
    if (adjustedChance <= 0 || Math.random() >= adjustedChance) continue;
    if (!hasNonResidentialBuildingModelForFootprint(
      zone,
      footprintSize,
      landScore,
      density,
      candidateFactors,
    )) continue;
    if (canPlaceZoneBuildingFootprint(scene, r, c, zone, footprintSize, footprintSize)) {
      return footprintSize;
    }
  }
  return 1;
}

function getNonResidentialLargeSpawnChance(zone, footprintSize, density) {
  const table = zone === ZONE_COM ? COM_LARGE_SPAWN_CHANCE : IND_LARGE_SPAWN_CHANCE;
  return table?.[density]?.[footprintSize] ?? 0;
}

function getRandomNonResidentialModel(zone, footprintSize, landScore = 0.5, density = DENSITY_LOW, siteFactors = null) {
  if (zone === ZONE_COM) {
    return getRandomCommercialBuildingModel(footprintSize, footprintSize, landScore, false, density, siteFactors);
  }
  return getRandomIndustrialBuildingModel(footprintSize, footprintSize);
}

function canPlaceZoneBuildingFootprint(scene, r, c, zoneType, footprintCols, footprintRows) {
  if (!isInsideMap(r, c)) return false;
  const baseHeight = getTileHeight(r, c);
  for (let dr = 0; dr < footprintRows; dr++) {
    for (let dc = 0; dc < footprintCols; dc++) {
      const rr = r + dr, cc = c + dc;
      if (!isInsideMap(rr, cc))                        return false;
      if (zoneMap[rr][cc] !== zoneType)                return false;
      if (scene.buildingSprites.has(getTileId(rr, cc))) return false;
      if (!canPlaceBuilding(rr, cc)) return false;
      if (getTileHeight(rr, cc) !== baseHeight) return false;
    }
  }
  return true;
}

function tryMergeResidentialCluster(scene, r, c, record, residentialQualityContext = null) {
  const density = record.density ?? (zoneDensityMap[r]?.[c] ?? DENSITY_LOW);
  for (const footprintSize of getResidentialMergeFootprintSizes(density)) {
    const anchor = findMergeableResidentialAnchor(scene, r, c, footprintSize);
    if (!anchor) continue;

    const targetLevel = Math.min(3, (record.level ?? 1) + 1);
    const mergeDensity = getDominantResidentialDensity(anchor.row, anchor.col, footprintSize, footprintSize);

    anchor.buildings.forEach(({ row, col }) => removeBuilding(scene, row, col));
    spawnZoneBuilding(scene, anchor.row, anchor.col, ZONE_RES, targetLevel, mergeDensity, {
      forceFootprint: footprintSize,
      residentialQualityContext,
    });
    if (city.population > 0) showToast(t('toast.populationGain'));
    return true;
  }

  return false;
}

function getResidentialMergeFootprintSizes(density) {
  if (density >= DENSITY_HIGH) return [4, 3, 2];
  if (density >= DENSITY_MED) return [3, 2];
  return [2];
}

function findMergeableResidentialAnchor(scene, r, c, footprintSize) {
  for (let row = r - footprintSize + 1; row <= r; row++) {
    for (let col = c - footprintSize + 1; col <= c; col++) {
      const buildings = getMergeableResidentialBuildingsAt(scene, row, col, footprintSize);
      if (buildings) return { row, col, buildings };
    }
  }
  return null;
}

function getMergeableResidentialBuildingsAt(scene, r, c, footprintSize) {
  if (!isInsideMap(r, c)) return null;
  if (!hasResidentialModelForFootprint(footprintSize)) return null;

  const baseHeight = getTileHeight(r, c);
  const anchors = new Map();

  for (let dr = 0; dr < footprintSize; dr++) {
    for (let dc = 0; dc < footprintSize; dc++) {
      const rr = r + dr, cc = c + dc;
      if (!isInsideMap(rr, cc)) return null;
      if (zoneMap[rr][cc] !== ZONE_RES) return null;
      if (!canPlaceBuilding(rr, cc)) return null;
      if (getTileHeight(rr, cc) !== baseHeight) return null;

      const id = getTileId(rr, cc);
      const sprite = scene.buildingSprites.get(id);
      const rec = sprite ? buildingData[getTileId(sprite.mapRow, sprite.mapCol)] : null;
      if (!sprite || !rec) return null;
      if (rec.type !== 'residential') return null;
      if (!isBuildingInsideFootprint(sprite.mapRow, sprite.mapCol, rec, r, c, footprintSize, footprintSize)) return null;

      anchors.set(getTileId(sprite.mapRow, sprite.mapCol), { row: sprite.mapRow, col: sprite.mapCol });
    }
  }

  return anchors.size >= 2 ? [...anchors.values()] : null;
}

function tryMergeCommercialCluster(scene, r, c, record, landScore = 0.5, commercialQualityContext = null) {
  for (const footprintSize of [3, 2]) {
    const anchor = findMergeableCommercialAnchor(
      scene,
      r,
      c,
      footprintSize,
      landScore,
      commercialQualityContext,
    );
    if (!anchor) continue;

    const mergeDensity = getDominantResidentialDensity(anchor.row, anchor.col, footprintSize, footprintSize);
    anchor.buildings.forEach(({ row, col }) => removeBuilding(scene, row, col));
    spawnZoneBuilding(scene, anchor.row, anchor.col, ZONE_COM, 3, mergeDensity, {
      landScore,
      preferHighScore: true,
      forceFootprint: footprintSize,
      commercialQualityContext,
    });
    return true;
  }

  return false;
}

function shouldScanCommercialMergeTile(row, col) {
  const shardCount = 8;
  return ((row * 37 + col * 17 + city.tick) % shardCount) === 0;
}

function findMergeableCommercialAnchor(
  scene,
  r,
  c,
  footprintSize,
  landScore = 0.5,
  commercialQualityContext = null,
) {
  for (let row = r - footprintSize + 1; row <= r; row++) {
    for (let col = c - footprintSize + 1; col <= c; col++) {
      const buildings = getMergeableCommercialBuildingsAt(
        scene,
        row,
        col,
        footprintSize,
        landScore,
        commercialQualityContext,
      );
      if (buildings) return { row, col, buildings };
    }
  }
  return null;
}

function getMergeableCommercialBuildingsAt(
  scene,
  r,
  c,
  footprintSize,
  landScore = 0.5,
  commercialQualityContext = null,
) {
  if (!isInsideMap(r, c)) return null;
  const density = getDominantResidentialDensity(r, c, footprintSize, footprintSize);
  const context = commercialQualityContext ?? createCommercialQualityContext();
  const factors = getCommercialSiteFactors(r, c, footprintSize, context);
  if (!hasCommercialBuildingModelForFootprint(footprintSize, landScore, density, factors)) return null;

  const baseHeight = getTileHeight(r, c);
  const anchors = new Map();
  const requireOneByOne = footprintSize === 2;

  for (let dr = 0; dr < footprintSize; dr++) {
    for (let dc = 0; dc < footprintSize; dc++) {
      const rr = r + dr, cc = c + dc;
      if (!isInsideMap(rr, cc)) return null;
      if (zoneMap[rr][cc] !== ZONE_COM) return null;
      if (!canPlaceBuilding(rr, cc)) return null;
      if (getTileHeight(rr, cc) !== baseHeight) return null;

      const id = getTileId(rr, cc);
      const sprite = scene.buildingSprites.get(id);
      const rec = sprite ? buildingData[getTileId(sprite.mapRow, sprite.mapCol)] : null;
      if (!sprite || !rec) return null;
      if (rec.type !== 'commercial') return null;
      if ((rec.level ?? 1) < 3) return null;
      if (requireOneByOne && ((rec.footprintCols ?? 1) !== 1 || (rec.footprintRows ?? 1) !== 1)) return null;
      if (!isBuildingInsideFootprint(sprite.mapRow, sprite.mapCol, rec, r, c, footprintSize, footprintSize)) return null;

      anchors.set(getTileId(sprite.mapRow, sprite.mapCol), { row: sprite.mapRow, col: sprite.mapCol });
    }
  }

  return anchors.size >= 2 ? [...anchors.values()] : null;
}

function hasCommercialBuildingModelForFootprint(
  footprintSize,
  landScore = 0.5,
  density = DENSITY_LOW,
  siteFactors = null,
) {
  const all = Array.isArray(commercialBuildingModels) ? commercialBuildingModels : [];
  const valid = all.filter((m) => (
    m.metadata
    && m.metadata.scale > 0.05
    && m.footprintCols === footprintSize
    && m.footprintRows === footprintSize
  ));
  if (valid.length === 0) return false;
  const factors = siteFactors ?? createFallbackCommercialFactors(landScore);
  const weights = getCommercialTierWeights(factors, density, valid);
  return Object.values(weights).some((weight) => weight > 0);
}

function hasResidentialModelForFootprint(footprintSize) {
  const setKey = getResidentialHouseSetForFootprint(footprintSize);
  return (houseModelSets?.[setKey] ?? []).some((model) => (
    model.metadata
    && model.metadata.scale > 0.05
    && model.footprintCols === footprintSize
    && model.footprintRows === footprintSize
  ));
}

function hasNonResidentialBuildingModelForFootprint(
  zone,
  footprintSize,
  landScore = 0.5,
  density = DENSITY_LOW,
  siteFactors = null,
) {
  if (zone === ZONE_COM) {
    return hasCommercialBuildingModelForFootprint(footprintSize, landScore, density, siteFactors);
  }
  const all = Array.isArray(industrialBuildingModels) ? industrialBuildingModels : [];
  return all.some((m) => (
    m.metadata
    && m.metadata.scale > 0.05
    && m.footprintCols === footprintSize
    && m.footprintRows === footprintSize
  ));
}

function isBuildingInsideFootprint(row, col, record, targetRow, targetCol, footprintCols, footprintRows) {
  const cols = record.footprintCols ?? 1;
  const rows = record.footprintRows ?? 1;
  return row >= targetRow
    && col >= targetCol
    && row + rows <= targetRow + footprintRows
    && col + cols <= targetCol + footprintCols;
}

function getDominantResidentialDensity(r, c, footprintCols = 2, footprintRows = 2) {
  const counts = new Map();
  for (let dr = 0; dr < footprintRows; dr++) {
    for (let dc = 0; dc < footprintCols; dc++) {
      const density = zoneDensityMap[r + dr]?.[c + dc] ?? DENSITY_LOW;
      counts.set(density, (counts.get(density) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? DENSITY_LOW;
}

function upgradeZoneBuilding(
  scene,
  r,
  c,
  zone,
  landScore = 0.5,
  residentialQualityContext = null,
  commercialQualityContext = null,
) {
  const id      = getTileId(r, c);
  const record  = buildingData[id];
  if (!record || record.level >= 3) return;
  const density = record.density ?? (zoneDensityMap[r][c] ?? DENSITY_LOW);

  // In an economically healthy city with good land, commercial upgrades favour
  // highScore art. Residential upgrades use the full wealth-quality calculation.
  const preferHighScore = (
    landScore >= 0.65
    && (city.unemploymentRate ?? 1) < 0.12
    && (city.demandC ?? 0) > 0.10
    && (city.happiness ?? 0) >= 0.60
  );

  removeBuilding(scene, r, c);
  spawnZoneBuilding(scene, r, c, zone, record.level + 1, density, {
    landScore,
    preferHighScore,
    residentialQualityContext,
    commercialQualityContext,
  });

  if (city.population > 0) showToast(t('toast.populationGain'));
}

function shrinkOrRemoveZoneBuilding(scene, r, c) {
  const id     = getTileId(r, c);
  const record = buildingData[id];
  if (!record) return;

  if (record.level > 1) {
    const zone    = zoneMap[r][c];
    const density = record.density ?? (zoneDensityMap[r][c] ?? DENSITY_LOW);
    removeBuilding(scene, r, c);
    spawnZoneBuilding(scene, r, c, zone, record.level - 1, density);
  } else {
    removeBuilding(scene, r, c);
  }
}

// ── Tree growth and natural spread ───────────────────────────────────────────

let treeSimulationTilesCache = null;

function invalidateTreeSimulationTiles() {
  treeSimulationTilesCache = null;
}

function getTreeSimulationTiles(scene) {
  if (treeSimulationTilesCache) return treeSimulationTilesCache;

  // Parsing and sorting sprite-map string keys wins for a fresh sparse city,
  // but becomes slower than one row-major array scan once there are a few
  // thousand trees. Keep the sparse path bounded for mature/dense saves.
  const denseTreeThreshold = Math.min(4096, MAP_WIDTH * MAP_HEIGHT * 0.0625);
  if (scene?.treeSprites instanceof Map && scene.treeSprites.size <= denseTreeThreshold) {
    const tiles = [];
    scene.treeSprites.forEach((sprites, id) => {
      const separator = id.indexOf(':');
      const row = Number(id.slice(0, separator));
      const col = Number(id.slice(separator + 1));
      if (treeMap[row]?.[col]) tiles.push([row, col]);
    });
    // The former full-map scan was row-major. Preserve that order so the random
    // number sequence (and therefore tree growth/death outcomes) stays identical.
    tiles.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    treeSimulationTilesCache = tiles;
    return treeSimulationTilesCache;
  }

  const tiles = [];
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (treeMap[row]?.[col]) tiles.push([row, col]);
    }
  }
  treeSimulationTilesCache = tiles;
  return treeSimulationTilesCache;
}

function updateTrees(scene) {
  if (!scene || !treeMap?.length) return;

  const newTrees = [];

  for (const [r, c] of getTreeSimulationTiles(scene)) {
    const tree = treeMap[r]?.[c];
    if (!tree) continue;

    if (!isTreeTerrainEligible(r, c) || zoneMap[r]?.[c] !== ZONE_NONE || scene.buildingSprites.has(getTileId(r, c))
        || mapData[r]?.[c] === ROAD || roadUnderlayMap[r]?.[c] != null || bridgeMap[r]?.[c]
        || isAdjacentToRoad(r, c)) {
      removeTree(scene, r, c);
      continue;
    }

    if (tree.age < TREE_MATURE_AGE && Math.random() < TREE_GROW_CHANCE_PER_TICK) {
      tree.age++;
      refreshTreeSprite(scene, r, c);
    }

    if (tree.age < TREE_MATURE_AGE) continue;

    // Natural senescence: mature trees have a small chance to die each tick.
    // This balances spread and prevents unlimited map saturation.
    if (Math.random() < TREE_DEATH_CHANCE_PER_TICK) {
      removeTree(scene, r, c);
      continue;
    }

    // Density cap: a tree surrounded by 3+ tree neighbours is in a dense
    // interior — it stops spreading outward so forests reach natural equilibrium.
    const treeNeighbours = getCardinalNeighbors(r, c)
      .filter(([nr, nc]) => treeMap[nr]?.[nc]).length;
    if (treeNeighbours >= TREE_SPREAD_NEIGHBOR_CAP) continue;

    const spreadChance = mapData[r][c] === HILL ? TREE_SPREAD_CHANCE_HILL : TREE_SPREAD_CHANCE_GROUND;
    if (Math.random() >= spreadChance) continue;

    const candidates = getCardinalNeighbors(r, c)
      .filter(([nr, nc]) => canTreeGrowAt(scene, nr, nc));
    if (candidates.length === 0) continue;

    const [nr, nc] = candidates[Math.floor(Math.random() * candidates.length)];
    newTrees.push({
      row: nr,
      col: nc,
      species: tree.species,
    });
  }

  newTrees.forEach(({ row, col, species }) => {
    if (treeMap[row]?.[col] || !canTreeGrowAt(scene, row, col)) return;
    placeTree(scene, row, col, { species, age: 0, spend: false });
  });
}

function isHighScoreModelEligible(landScore) {
  return landScore >= 0.70 && (city.happiness ?? 0.5) >= 0.65;
}

function isHighScoreModel(m) {
  return /highScore/i.test(m.fileName || m.sourceFileName || '');
}

function getResidentialEconomyScore() {
  const employment = 1 - clamp(city.unemploymentRate ?? 0.25, 0, 1);
  const business = clamp(((city.demandC ?? 0) + 1) / 2, 0, 1);
  const credit = { A: 1, B: 0.78, C: 0.52, D: 0.25 }[city.creditRating] ?? 0.52;
  const income = Math.max(0, Number(city.monthlyIncome ?? 0));
  const expenses = Math.max(0, Number(city.monthlyExpenses ?? 0));
  const fiscalRatio = (income - expenses) / Math.max(1000, income + expenses);
  const fiscal = clamp(0.5 + fiscalRatio * 1.5, 0, 1);
  return clamp(employment * 0.40 + business * 0.25 + credit * 0.20 + fiscal * 0.15, 0, 1);
}

function createResidentialQualityContext(landValueMap = null) {
  return {
    landValueMap: Array.isArray(landValueMap)
      ? landValueMap
      : (typeof computeLandValueMap === 'function' ? computeLandValueMap() : null),
    pollutionSources: typeof getHealthPollutionSources === 'function'
      ? getHealthPollutionSources()
      : null,
    economy: getResidentialEconomyScore(),
    stockExchanges: getCommercialCatalystLocations('stock_exchange'),
    majorTransport: [
      ...getCommercialCatalystLocations('airport'),
      ...getCommercialCatalystLocations('container_port'),
    ],
    skylineRecords: createSkylineRecordIndex('residential'),
    tileFactors: new Map(),
  };
}

function getRoadIntensity(row, col, radius = 3) {
  const terrain = typeof mapData !== 'undefined' ? mapData : [];
  const underlay = typeof roadUnderlayMap !== 'undefined' ? roadUnderlayMap : [];
  const bridges = typeof bridgeMap !== 'undefined' ? bridgeMap : [];
  const roadTile = typeof ROAD !== 'undefined' ? ROAD : 2;
  let roadTiles = 0;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (Math.abs(dr) + Math.abs(dc) > radius) continue;
      const rr = Math.round(row + dr);
      const cc = Math.round(col + dc);
      if (terrain[rr]?.[cc] === roadTile || underlay[rr]?.[cc] != null || bridges[rr]?.[cc] != null) {
        roadTiles++;
      }
    }
  }
  return clamp(roadTiles / 12, 0, 1);
}

function getLocalCatalystProximity(row, col, locations, radius) {
  if (!Array.isArray(locations) || locations.length === 0) return 0;
  const closestDistance = locations.reduce((closest, location) => (
    Math.min(closest, Math.abs(row - location.row) + Math.abs(col - location.col))
  ), Infinity);
  return clamp(1 - closestDistance / Math.max(1, radius), 0, 1);
}

function getBuildingRecordTier(record) {
  if (record?.type === 'residential') return record.wealthTier ?? null;
  if (record?.type === 'commercial') return record.commercialTier ?? null;
  return null;
}

function createSkylineRecordIndex(buildingType) {
  if (typeof buildingData === 'undefined' || !buildingData) return [];
  return Object.entries(buildingData).flatMap(([id, record]) => {
    if (record?.type !== buildingType) return [];
    const [buildingRow, buildingCol] = id.split(':').map(Number);
    if (!Number.isFinite(buildingRow) || !Number.isFinite(buildingCol)) return [];
    return [{
      row: buildingRow + ((record.footprintRows ?? 1) - 1) / 2,
      col: buildingCol + ((record.footprintCols ?? 1) - 1) / 2,
      tier: getBuildingRecordTier(record),
      spriteKey: record.spriteKey,
    }];
  });
}

function getNearbySkylineStats(
  row,
  col,
  buildingType,
  radius = SKYLINE_NEIGHBORHOOD_RADIUS,
  indexedRecords = null,
) {
  const stats = { total: 0, highRiseCount: 0, highRiseRatio: 0, modelCounts: {} };
  const records = Array.isArray(indexedRecords)
    ? indexedRecords
    : createSkylineRecordIndex(buildingType);

  records.forEach((record) => {
    if (record.row === row && record.col === col) return;
    if (Math.abs(row - record.row) + Math.abs(col - record.col) > radius) return;

    stats.total++;
    if (record.tier === 'H' || record.tier === 'UH') stats.highRiseCount++;
    if (record.spriteKey) {
      stats.modelCounts[record.spriteKey] = (stats.modelCounts[record.spriteKey] ?? 0) + 1;
    }
  });
  stats.highRiseRatio = stats.highRiseCount / Math.max(4, stats.total);
  return stats;
}

function getUrbanCoreFactor(row, col, landValue, stockExchanges = [], majorTransport = []) {
  const roadIntensity = getRoadIntensity(row, col);
  const stockExchangeProximity = getLocalCatalystProximity(row, col, stockExchanges, 18);
  const transportProximity = getLocalCatalystProximity(row, col, majorTransport, 24);
  return clamp(
    clamp(landValue, 0, 1) * 0.45
    + roadIntensity * 0.25
    + stockExchangeProximity * 0.18
    + transportProximity * 0.12,
    0,
    1,
  );
}

function getResidentialTileFactors(row, col, context) {
  const cacheKey = `${row}:${col}`;
  const cached = context.tileFactors.get(cacheKey);
  if (cached) return cached;

  const landValue = Array.isArray(context.landValueMap)
    ? clamp(context.landValueMap[row]?.[col] ?? 0, 0, 1)
    : getZoneGrowthLandScore(row, col, ZONE_RES, null);
  const scenic = typeof getScenicValue === 'function' ? clamp(getScenicValue(row, col), 0, 1) : 0;
  const pollution = typeof getLocalHealthPollutionPressure === 'function'
    ? clamp(getLocalHealthPollutionPressure(row, col, context.pollutionSources), 0, 1)
    : clamp((city.pollution ?? 0) / 160, 0, 1);
  const canopy = typeof getTreeInfluenceValue === 'function'
    ? clamp(getTreeInfluenceValue(row, col), 0, 1)
    : 0;
  const park = clamp(Math.min(serviceMap[row]?.[col]?.park ?? 0, 2) / 2, 0, 1);
  const environment = clamp((1 - pollution) * 0.55 + canopy * 0.25 + park * 0.20, 0, 1);
  const health = typeof getLocalHealthScore === 'function'
    ? clamp(getLocalHealthScore(row, col, context.pollutionSources), 0, 1)
    : clamp(city.healthIndex ?? 0.5, 0, 1);
  const factors = { landValue, scenic, pollution, environment, health };
  context.tileFactors.set(cacheKey, factors);
  return factors;
}

function getResidentialSiteFactors(row, col, footprintSize = 1, context = createResidentialQualityContext()) {
  const totals = { landValue: 0, scenic: 0, pollution: 0, environment: 0, health: 0 };
  let count = 0;
  for (let dr = 0; dr < footprintSize; dr++) {
    for (let dc = 0; dc < footprintSize; dc++) {
      const rr = row + dr;
      const cc = col + dc;
      if (!isInsideMap(rr, cc)) continue;
      const tile = getResidentialTileFactors(rr, cc, context);
      Object.keys(totals).forEach((key) => { totals[key] += tile[key]; });
      count++;
    }
  }
  const divisor = Math.max(1, count);
  Object.keys(totals).forEach((key) => { totals[key] /= divisor; });
  const economy = clamp(context.economy, 0, 1);
  const centerRow = row + (footprintSize - 1) / 2;
  const centerCol = col + (footprintSize - 1) / 2;
  const urbanCore = getUrbanCoreFactor(
    centerRow,
    centerCol,
    totals.landValue,
    context.stockExchanges,
    context.majorTransport,
  );
  const skylineStats = getNearbySkylineStats(
    centerRow,
    centerCol,
    'residential',
    SKYLINE_NEIGHBORHOOD_RADIUS,
    context.skylineRecords,
  );
  const quality = clamp(
    totals.landValue * 0.30
    + totals.scenic * 0.15
    + totals.environment * 0.20
    + economy * 0.20
    + totals.health * 0.15,
    0,
    1,
  );
  return { ...totals, economy, quality, urbanCore, skylineStats, row: centerRow, col: centerCol };
}

function getCommercialEconomyScore() {
  const demand = clamp(((city.demandC ?? 0) + 1) / 2, 0, 1);
  const employment = 1 - clamp(city.unemploymentRate ?? 0.25, 0, 1);
  const credit = { A: 1, B: 0.78, C: 0.52, D: 0.25 }[city.creditRating] ?? 0.52;
  const income = Math.max(0, Number(city.monthlyIncome ?? 0));
  const expenses = Math.max(0, Number(city.monthlyExpenses ?? 0));
  const fiscalRatio = (income - expenses) / Math.max(1000, income + expenses);
  const fiscal = clamp(0.5 + fiscalRatio * 1.5, 0, 1);
  const higherEducation = clamp(city.educationHigherIndex ?? 0.5, 0, 1);
  return clamp(
    demand * 0.30
    + employment * 0.20
    + credit * 0.20
    + fiscal * 0.20
    + higherEducation * 0.10,
    0,
    1,
  );
}

function getCommercialCatalystLocations(buildingType) {
  if (typeof buildingData === 'undefined' || !buildingData) return [];
  return Object.entries(buildingData).flatMap(([id, record]) => {
    if (record?.type !== buildingType) return [];
    const [row, col] = id.split(':').map(Number);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return [];
    return [{
      row: row + ((record.footprintRows ?? 1) - 1) / 2,
      col: col + ((record.footprintCols ?? 1) - 1) / 2,
    }];
  });
}

function createCommercialQualityContext(landValueMap = null) {
  return {
    landValueMap: Array.isArray(landValueMap)
      ? landValueMap
      : (typeof computeLandValueMap === 'function' ? computeLandValueMap() : null),
    pollutionSources: typeof getHealthPollutionSources === 'function'
      ? getHealthPollutionSources()
      : null,
    economy: getCommercialEconomyScore(),
    stockExchanges: getCommercialCatalystLocations('stock_exchange'),
    airports: getCommercialCatalystLocations('airport'),
    harbors: getCommercialCatalystLocations('container_port'),
    skylineRecords: createSkylineRecordIndex('commercial'),
    tileFactors: new Map(),
  };
}

function getCommercialTileFactors(row, col, context) {
  const cacheKey = `${row}:${col}`;
  const cached = context.tileFactors.get(cacheKey);
  if (cached) return cached;

  const landValue = Array.isArray(context.landValueMap)
    ? clamp(context.landValueMap[row]?.[col] ?? 0, 0, 1)
    : getZoneGrowthLandScore(row, col, ZONE_COM, null);
  const scenic = typeof getScenicValue === 'function' ? clamp(getScenicValue(row, col), 0, 1) : 0;
  const pollution = typeof getLocalHealthPollutionPressure === 'function'
    ? clamp(getLocalHealthPollutionPressure(row, col, context.pollutionSources), 0, 1)
    : clamp((city.pollution ?? 0) / 160, 0, 1);
  const canopy = typeof getTreeInfluenceValue === 'function'
    ? clamp(getTreeInfluenceValue(row, col), 0, 1)
    : 0;
  const park = clamp(Math.min(serviceMap[row]?.[col]?.park ?? 0, 2) / 2, 0, 1);
  const environment = clamp((1 - pollution) * 0.60 + canopy * 0.20 + park * 0.20, 0, 1);
  const factors = { landValue, scenic, pollution, environment };
  context.tileFactors.set(cacheKey, factors);
  return factors;
}

function getCommercialCatalystFactor(row, col, locations, radius) {
  if (!Array.isArray(locations) || locations.length === 0) return 0;
  const closestDistance = locations.reduce((closest, location) => (
    Math.min(closest, Math.abs(row - location.row) + Math.abs(col - location.col))
  ), Infinity);
  const proximity = clamp(1 - closestDistance / Math.max(1, radius), 0, 1);
  // Having the infrastructure is a citywide signal; proximity supplies the
  // remaining premium for CBD and airport-business-district locations.
  return 0.60 + proximity * 0.40;
}

function getCommercialSiteFactors(row, col, footprintSize = 1, context = createCommercialQualityContext()) {
  const totals = { landValue: 0, scenic: 0, pollution: 0, environment: 0 };
  let count = 0;
  for (let dr = 0; dr < footprintSize; dr++) {
    for (let dc = 0; dc < footprintSize; dc++) {
      const rr = row + dr;
      const cc = col + dc;
      if (!isInsideMap(rr, cc)) continue;
      const tile = getCommercialTileFactors(rr, cc, context);
      Object.keys(totals).forEach((key) => { totals[key] += tile[key]; });
      count++;
    }
  }
  const divisor = Math.max(1, count);
  Object.keys(totals).forEach((key) => { totals[key] /= divisor; });
  const centerRow = row + (footprintSize - 1) / 2;
  const centerCol = col + (footprintSize - 1) / 2;
  const economy = clamp(context.economy, 0, 1);
  const stockExchange = getCommercialCatalystFactor(
    centerRow,
    centerCol,
    context.stockExchanges,
    COMMERCIAL_CATALYST_RADIUS.stockExchange,
  );
  const airport = getCommercialCatalystFactor(
    centerRow,
    centerCol,
    context.airports,
    COMMERCIAL_CATALYST_RADIUS.airport,
  );
  const urbanCore = getUrbanCoreFactor(
    centerRow,
    centerCol,
    totals.landValue,
    context.stockExchanges,
    [...(context.airports ?? []), ...(context.harbors ?? [])],
  );
  const skylineStats = getNearbySkylineStats(
    centerRow,
    centerCol,
    'commercial',
    SKYLINE_NEIGHBORHOOD_RADIUS,
    context.skylineRecords,
  );
  const quality = clamp(
    totals.landValue * 0.25
    + totals.scenic * 0.10
    + totals.environment * 0.10
    + economy * 0.25
    + stockExchange * 0.15
    + airport * 0.15,
    0,
    1,
  );
  return {
    ...totals,
    economy,
    stockExchange,
    airport,
    quality,
    urbanCore,
    skylineStats,
    row: centerRow,
    col: centerCol,
  };
}

function createFallbackCommercialFactors(landScore = 0.5) {
  const normalizedLand = clamp(landScore, 0, 1);
  return {
    quality: normalizedLand,
    landValue: normalizedLand,
    scenic: 0,
    pollution: 1,
    environment: 0,
    economy: getCommercialEconomyScore(),
    stockExchange: 0,
    airport: 0,
    urbanCore: 0.35,
    skylineStats: { total: 0, highRiseCount: 0, highRiseRatio: 0, modelCounts: {} },
  };
}

function isHighCommercialTierEligible(factors) {
  return meetsResidentialMinimums(factors, COMMERCIAL_H_MINIMUMS);
}

function isUltraHighCommercialTierEligible(factors, density) {
  return density === DENSITY_HIGH
    && meetsResidentialMinimums(factors, COMMERCIAL_UH_MINIMUMS);
}

function applySkylineTierPressure(weights, factors, density, buildingType) {
  const adjusted = { ...weights };
  const treatAsTower = buildingType === 'commercial' || density >= DENSITY_MED;
  if (!treatAsTower) return adjusted;

  // High-rises remain possible citywide, but become substantially more likely
  // around valuable, road-rich CBD/transport nodes than in ordinary blocks.
  const urbanCore = clamp(factors?.urbanCore ?? 0.5, 0, 1);
  const coreStrength = clamp((urbanCore - 0.18) / 0.62, 0.12, 1);
  adjusted.H *= coreStrength;
  adjusted.UH *= coreStrength * coreStrength;

  const stats = factors?.skylineStats ?? {};
  const highRiseCount = Number(stats.highRiseCount) || 0;
  const highRiseRatio = Number(stats.highRiseRatio) || 0;
  if (highRiseCount >= 3 && highRiseRatio >= 0.30) {
    adjusted.H = 0;
    adjusted.UH = 0;
  } else if (highRiseCount >= 2 && highRiseRatio >= 0.25) {
    adjusted.H *= 0.45;
    adjusted.UH *= 0.12;
  }
  return adjusted;
}

function isLocalSkylineSaturated(factors, density, buildingType) {
  if (buildingType === 'residential' && density < DENSITY_MED) return false;
  const stats = factors?.skylineStats ?? {};
  return (Number(stats.highRiseCount) || 0) >= 3
    && (Number(stats.highRiseRatio) || 0) >= 0.30;
}

function getCommercialTierWeights(factors, density, models = []) {
  const quality = clamp(factors?.quality ?? 0.5, 0, 1);
  const band = COMMERCIAL_TIER_PROBABILITIES.find((entry) => quality <= entry.maxQuality)
    ?? COMMERCIAL_TIER_PROBABILITIES[COMMERCIAL_TIER_PROBABILITIES.length - 1];
  const availableTiers = new Set(models.map((model) => model.commercialTier).filter(Boolean));
  const weights = applySkylineTierPressure(band.weights, factors, density, 'commercial');
  if (!isHighCommercialTierEligible(factors)) weights.H = 0;
  if (!isUltraHighCommercialTierEligible(factors, density)) weights.UH = 0;
  Object.keys(weights).forEach((tier) => {
    if (!availableTiers.has(tier)) weights[tier] = 0;
  });

  if (Object.values(weights).some((weight) => weight > 0)) return weights;
  const eligibleFallbacks = ['L', 'M', 'H', 'UH'].filter((tier) => (
    availableTiers.has(tier)
    && (tier !== 'H' || isHighCommercialTierEligible(factors))
    && (tier !== 'UH' || isUltraHighCommercialTierEligible(factors, density))
    && (!isLocalSkylineSaturated(factors, density, 'commercial') || (tier !== 'H' && tier !== 'UH'))
  ));
  const fallbackTier = eligibleFallbacks[0];
  return Object.fromEntries(Object.keys(weights).map((tier) => [tier, tier === fallbackTier ? 1 : 0]));
}

function meetsResidentialMinimums(factors, minimums) {
  if (!factors) return false;
  return Object.entries(minimums).every(([key, value]) => (
    key === 'maxPollution' ? factors.pollution <= value : factors[key] >= value
  ));
}

function isHighWealthEligible(factors) {
  return meetsResidentialMinimums(factors, RESIDENTIAL_H_MINIMUMS);
}

function isUltraHighWealthEligible(factors, density) {
  return density === DENSITY_LOW
    && meetsResidentialMinimums(factors, RESIDENTIAL_UH_MINIMUMS);
}

function getResidentialWealthWeights(factors, density, models = []) {
  const quality = clamp(factors?.quality ?? 0.5, 0, 1);
  const band = RESIDENTIAL_WEALTH_PROBABILITIES.find((entry) => quality <= entry.maxQuality)
    ?? RESIDENTIAL_WEALTH_PROBABILITIES[RESIDENTIAL_WEALTH_PROBABILITIES.length - 1];
  const availableTiers = new Set(models.map((model) => model.wealthTier).filter(Boolean));
  const weights = applySkylineTierPressure(band.weights, factors, density, 'residential');
  if (!isHighWealthEligible(factors)) weights.H = 0;
  if (!isUltraHighWealthEligible(factors, density)) weights.UH = 0;
  Object.keys(weights).forEach((tier) => {
    if (!availableTiers.has(tier)) weights[tier] = 0;
  });

  if (Object.values(weights).some((weight) => weight > 0)) return weights;
  const fallbackTier = ['L', 'M', 'H', 'UH'].find((tier) => (
    availableTiers.has(tier)
    && (tier !== 'H' || isHighWealthEligible(factors))
    && (tier !== 'UH' || isUltraHighWealthEligible(factors, density))
    && (!isLocalSkylineSaturated(factors, density, 'residential') || (tier !== 'H' && tier !== 'UH'))
  ));
  return Object.fromEntries(Object.keys(weights).map((tier) => [tier, tier === fallbackTier ? 1 : 0]));
}

function pickResidentialWealthTier(weights, randomValue = Math.random()) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = clamp(Number(randomValue) || 0, 0, 0.999999) * total;
  for (const [tier, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return tier;
  }
  return entries[entries.length - 1][0];
}

function pickWithHighScoreBias(valid, cacheKey, landScore, preferHighScore) {
  if (preferHighScore && isHighScoreModelEligible(landScore)) {
    const highPool = valid.filter(isHighScoreModel);
    if (highPool.length > 0 && Math.random() < 0.75) {
      return pickVariedModel(highPool, `${cacheKey}:highScore`);
    }
  }
  return pickVariedModel(valid, cacheKey);
}

// Returns a random house model from the given set that has valid computed metadata.
// setKey = 'house' (1×1) | 'house2x2' (2×2) | 'house1x4' (1×4)
function getRandomHouseModel(
  setKey = 'house',
  landScore = 0.5,
  preferHighScore = false,
  density = DENSITY_LOW,
  siteFactors = null,
) {
  const all = (houseModelSets && houseModelSets[setKey]) ? houseModelSets[setKey] : [];
  // Only use models whose scale was computed successfully (> 0.05 avoids near-invisible sprites)
  const valid = all.filter((m) => m.metadata && m.metadata.scale > 0.05 && m.wealthTier);
  if (valid.length === 0) return null;
  const factors = siteFactors ?? {
    quality: clamp(landScore, 0, 1),
    landValue: clamp(landScore, 0, 1),
    scenic: 0,
    pollution: 1,
    environment: 0,
    health: clamp(city.healthIndex ?? 0.5, 0, 1),
    economy: getResidentialEconomyScore(),
  };
  const weights = getResidentialWealthWeights(factors, density, valid);
  const selectedTier = pickResidentialWealthTier(weights);
  const tierModels = valid.filter((model) => model.wealthTier === selectedTier);
  return pickVariedModel(tierModels, `house:${setKey}:wealth:${selectedTier}`, factors);
}

function getRandomCommercialBuildingModel(
  footprintCols = null,
  footprintRows = null,
  landScore = 0.5,
  preferHighScore = false,
  density = DENSITY_LOW,
  siteFactors = null,
) {
  const all = Array.isArray(commercialBuildingModels) ? commercialBuildingModels : [];
  const valid = all.filter((m) => {
    if (!m.metadata || m.metadata.scale <= 0.05) return false;
    if (footprintCols !== null && m.footprintCols !== footprintCols) return false;
    if (footprintRows !== null && m.footprintRows !== footprintRows) return false;
    return !!m.commercialTier;
  });
  if (valid.length === 0) return null;
  const factors = siteFactors ?? createFallbackCommercialFactors(landScore);
  const weights = getCommercialTierWeights(factors, density, valid);
  const selectedTier = pickResidentialWealthTier(weights);
  if (!selectedTier) return null;
  const tierModels = valid.filter((model) => model.commercialTier === selectedTier);
  return pickVariedModel(
    tierModels,
    `commercial:${footprintCols ?? 'any'}x${footprintRows ?? 'any'}:tier:${selectedTier}`,
    factors,
  );
}

function getRandomIndustrialBuildingModel(footprintCols = null, footprintRows = null) {
  const all = Array.isArray(industrialBuildingModels) ? industrialBuildingModels : [];
  const valid = all.filter((m) => (
    m.metadata
    && m.metadata.scale > 0.05
    && (footprintCols === null || m.footprintCols === footprintCols)
    && (footprintRows === null || m.footprintRows === footprintRows)
  ));
  if (valid.length === 0) return null;

  const allowScienceBias = footprintCols >= 2 && footprintRows >= 2;
  if (!allowScienceBias) {
    return pickVariedModel(valid, `industrial:${footprintCols ?? 'any'}x${footprintRows ?? 'any'}`);
  }

  const scienceModels = valid.filter((m) => /sciencepark/i.test(m.sourceFileName || m.fileName || ''));
  const regularModels = valid.filter((m) => !/sciencepark/i.test(m.sourceFileName || m.fileName || ''));
  if (scienceModels.length === 0 || regularModels.length === 0) {
    return pickVariedModel(valid, `industrial:${footprintCols ?? 'any'}x${footprintRows ?? 'any'}`);
  }

  if (!city.scienceParkUnlocked) {
    return pickVariedModel(regularModels, `industrial:${footprintCols ?? 'any'}x${footprintRows ?? 'any'}:regular-locked`);
  }

  const higherEdu = clamp(city.educationHigherIndex ?? 0, 0, 1);
  const sciencePolicyBonus = isPolicyActive('scienceDevelopment') ? 0.20 : 0;
  const scienceChance = clamp(0.05 + 0.35 * higherEdu + sciencePolicyBonus, 0, 0.85);
  const chosenPool = Math.random() < scienceChance ? scienceModels : regularModels;
  return pickVariedModel(chosenPool, `industrial:${footprintCols ?? 'any'}x${footprintRows ?? 'any'}:${chosenPool === scienceModels ? 'science' : 'regular'}`);
}

function getZoneGrowthLandScore(row, col, zone, landValueMap = null) {
  if (Array.isArray(landValueMap)) {
    const value = landValueMap[row]?.[col];
    if (Number.isFinite(value)) return clamp(value, 0, 1);
  }

  let score = 0.35;
  if (serviceMap[row]?.[col]?.police) score += 0.22;
  if (serviceMap[row]?.[col]?.fire) score += 0.22;
  if (zone === ZONE_RES) score += (serviceMap[row]?.[col]?.park ?? 0) * 0.12;
  if (powerMap[row]?.[col]) score += 0.10;
  if (zone === ZONE_RES) {
    if (typeof getTreeInfluenceValue === 'function') {
      score += clamp(getTreeInfluenceValue(row, col), 0, 1) * TREE_LAND_VALUE_BONUS_MAX;
    }
    if (typeof getScenicValue === 'function') {
      score += clamp(getScenicValue(row, col), 0, 1) * SCENIC_LAND_VALUE_BONUS_MAX;
    }
  }

  const pollutionPenalty = clamp(city.pollution / 220, 0, 0.35);
  const basicEdu = clamp(city.educationBasicIndex ?? 0, 0, 1);
  const higherEdu = clamp(city.educationHigherIndex ?? 0, 0, 1);
  const educationBonus = zone === ZONE_IND ? (0.04 * basicEdu + 0.08 * higherEdu) : (0.10 * basicEdu + 0.20 * higherEdu);
  return clamp(score + educationBonus - pollutionPenalty, 0, 1);
}

function getLargeLotSpawnBoost(landScore, footprintSize) {
  const normalizedScore = clamp(landScore, 0, 1);
  const tierWeight = footprintSize >= 4 ? 1.2 : footprintSize >= 3 ? 0.95 : 0.6;
  return 0.75 + normalizedScore * tierWeight;
}

function getCommercialProsperityBoost() {
  const ratingBoost = {
    A: 1.22,
    B: 1.08,
    C: 0.96,
    D: 0.82,
  }[city.creditRating] ?? 1;
  const netMonthly = Math.max(-20000, Number(city.monthlyIncome ?? 0) - Number(city.monthlyExpenses ?? 0));
  const netBoost = clamp(0.88 + netMonthly / 50000, 0.76, 1.22);
  const budgetBoost = city.isBankrupt ? 0.78 : clamp(0.92 + Math.max(0, Number(city.budget ?? 0)) / 5000000, 0.92, 1.12);
  return ratingBoost * netBoost * budgetBoost;
}

function getSpatialModelWeight(model, siteFactors = null) {
  const nearbyUses = Number(siteFactors?.skylineStats?.modelCounts?.[model?.key]) || 0;
  return Math.pow(SKYLINE_REPEAT_MODEL_PENALTY, nearbyUses);
}

function pickVariedModel(models, bucketKey, siteFactors = null) {
  if (!Array.isArray(models) || models.length === 0) return null;
  if (models.length === 1) return models[0];

  const usage = modelUsageCounts.get(bucketKey) ?? new Map();
  const recent = modelRecentHistory.get(bucketKey) ?? [];

  const weighted = models.map((model) => {
    const usedCount = usage.get(model.key) ?? 0;
    let weight = 1 / (1 + usedCount * MODEL_VARIATION_USAGE_WEIGHT);
    if (recent.includes(model.key)) weight *= MODEL_VARIATION_RECENT_PENALTY;
    weight *= getSpatialModelWeight(model, siteFactors);
    return {
      model,
      weight: Math.max(MODEL_VARIATION_MIN_WEIGHT * 0.25, weight),
    };
  });

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosen = weighted[weighted.length - 1].model;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      chosen = entry.model;
      break;
    }
  }

  usage.set(chosen.key, (usage.get(chosen.key) ?? 0) + 1);
  modelUsageCounts.set(bucketKey, usage);

  const nextRecent = [...recent, chosen.key];
  const maxRecentWindow = Math.max(2, Math.min(6, models.length - 1));
  while (nextRecent.length > maxRecentWindow) nextRecent.shift();
  modelRecentHistory.set(bucketKey, nextRecent);

  return chosen;
}

// ── Population & pollution counters ──────────────────────────────────────────
