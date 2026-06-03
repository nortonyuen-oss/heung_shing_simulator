let lastCommercialMergeScanTick = null;

function isBuildingHighScoreVisual(record) {
  if (!record?.spriteKey) return false;
  const model = (typeof getCommercialBuildingModelBySpriteKey === 'function'
    ? getCommercialBuildingModelBySpriteKey(record.spriteKey)
    : null)
    ?? (typeof getHouseModelBySpriteKey === 'function'
      ? getHouseModelBySpriteKey(record.spriteKey)
      : null);
  return model ? isHighScoreModel(model) : false;
}

function tryRedecoratePremiumBuilding(scene, r, c, zone) {
  const id = getTileId(r, c);
  const record = buildingData[id];
  if (!record) return;

  const fp  = record.footprintCols ?? 1;
  const fpr = record.footprintRows ?? 1;

  let candidates = [];
  if (zone === ZONE_RES) {
    const setKey = getResidentialHouseSetForFootprint(Math.max(fp, fpr));
    candidates = (houseModelSets?.[setKey] ?? []).filter(
      (m) => m.metadata && m.metadata.scale > 0.05 && isHighScoreModel(m)
    );
  } else if (zone === ZONE_COM) {
    candidates = (Array.isArray(commercialBuildingModels) ? commercialBuildingModels : []).filter(
      (m) => m.metadata && m.metadata.scale > 0.05
        && m.footprintCols === fp && m.footprintRows === fpr
        && isHighScoreModel(m)
    );
  }
  if (candidates.length === 0) return;

  const newModel = candidates[Math.floor(Math.random() * candidates.length)];
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

  // Persist updated visual metadata so save/reload renders correctly
  record.spriteKey  = newModel.key;
  record.originX    = meta.originX;
  record.originY    = meta.originY;
  record.scale      = meta.scale;
  record.scaleX     = meta.scaleX;
  record.scaleY     = meta.scaleY;
  record.offsetX    = meta.offsetX;
  record.offsetY    = meta.offsetY;
  record.anchorMode = meta.anchorMode ?? record.anchorMode;
}

function growOrShrinkZones(scene) {
  const landValueMap = typeof computeLandValueMap === 'function'
    ? computeLandValueMap()
    : null;
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
          spawnZoneBuilding(scene, r, c, zone, 1, density, { landScore });
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
          && tryMergeCommercialCluster(scene, r, c, record, landScore)
        ) {
          commercialMergeBudget--;
          continue;
        }

        if (record.level < 3 && hasRoad && demand > upgradeDemandGate && Math.random() < UPGRADE_CHANCE * powerMul * densityMul * upgradePremiumMul) {
          if (zone === ZONE_RES && tryMergeResidentialCluster(scene, r, c, record)) continue;
          upgradeZoneBuilding(scene, r, c, zone, landScore);
        } else if ((!hasRoad || demand < -0.5 || cityPower < 0.35) && Math.random() < SHRINK_CHANCE * (cityPower < 0.35 ? 1.5 : 1)) {
          shrinkOrRemoveZoneBuilding(scene, r, c);
        } else if (
          record.level >= 3
          && (zone === ZONE_RES || zone === ZONE_COM)
          && (zone !== ZONE_RES || density === DENSITY_LOW)
          && isHighScoreModelEligible(landScore)
          && (city.unemploymentRate ?? 1) < 0.12
          && (city.demandC ?? 0) > 0.10
          && !isBuildingHighScoreVisual(record)
          && Math.random() < 0.018
        ) {
          // Premium neighbourhood: gradually swap existing max-level buildings to
          // highScore visual variants without disturbing any simulation data.
          tryRedecoratePremiumBuilding(scene, r, c, zone);
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
  const landScore = clamp(optionsOverride.landScore ?? 0.5, 0, 1);
  const preferHighScore = !!(optionsOverride.preferHighScore);

  if (zone === ZONE_RES) {
    const footprintSize = chooseResidentialFootprint(scene, r, c, density, optionsOverride, landScore);
    const setKey = getResidentialHouseSetForFootprint(footprintSize);
    const model = getRandomHouseModel(setKey, landScore, preferHighScore, density);

    if (model) {
      key     = model.key;
      options = { ...model.metadata };
    } else if (footprintSize > 1) {
      // Larger models not ready yet — fall back to 1×1.
      const fallback = getRandomHouseModel('house', landScore, preferHighScore, density);
      if (fallback) {
        key     = fallback.key;
        options = { ...fallback.metadata };
      } else {
        key = BUILDING_KEYS[Math.floor(Math.random() * 20)];
      }
    } else {
      // No 1×1 house models loaded yet — use tileset sprites (indices 0–19)
      key = BUILDING_KEYS[Math.floor(Math.random() * 20)];
    }
  } else if (zone === ZONE_COM) {
    const footprintSize = chooseNonResidentialFootprint(scene, r, c, zone, density, landScore, optionsOverride);
    const model = getRandomCommercialBuildingModel(footprintSize, footprintSize, landScore, preferHighScore);
    if (!model) return false;

    key     = model.key;
    options = { ...model.metadata };
  } else {
    const footprintSize = chooseNonResidentialFootprint(scene, r, c, zone, density, landScore, optionsOverride);
    const model = getRandomIndustrialBuildingModel(footprintSize, footprintSize);
    if (model) {
      key = model.key;
      options = { ...model.metadata };
    } else {
      key = BUILDING_KEYS[39 + Math.floor(Math.random() * 39)];
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
    sourceFileName: options.sourceFileName,
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

function chooseResidentialFootprint(scene, r, c, density, optionsOverride = {}, landScore = 0.5) {
  const forcedSize = optionsOverride.forceFootprint ?? (optionsOverride.force2x2 ? 2 : null);
  if (forcedSize) {
    return canPlaceResidentialFootprint(scene, r, c, forcedSize) && getRandomHouseModel(getResidentialHouseSetForFootprint(forcedSize), landScore)
      ? forcedSize
      : 1;
  }

  const candidates = [5, 4, 3, 2];
  for (const footprintSize of candidates) {
    const chance = footprintSize === 2
      ? getResidential2x2Chance(density)
      : getResidentialLargeSpawnChance(footprintSize, density);
    const largeLotBoost = getLargeLotSpawnBoost(landScore, footprintSize);
    const adjustedChance = Math.min(0.95, chance * largeLotBoost);
    if (adjustedChance <= 0 || Math.random() >= adjustedChance) continue;
    if (!getRandomHouseModel(getResidentialHouseSetForFootprint(footprintSize), landScore)) continue;
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

function chooseNonResidentialFootprint(scene, r, c, zone, density, landScore = 0.5, optionsOverride = {}) {
  const forcedSize = optionsOverride.forceFootprint ?? null;
  if (forcedSize) {
    return hasNonResidentialBuildingModelForFootprint(zone, forcedSize, landScore)
      && canPlaceZoneBuildingFootprint(scene, r, c, zone, forcedSize, forcedSize)
      ? forcedSize
      : 1;
  }

  const candidates = zone === ZONE_COM ? [4, 3, 2] : [3, 2];
  const commercialDemandBoost = zone === ZONE_COM
    ? getCommercialProsperityBoost() * clamp(0.95 + Math.max(0, city.demandC) * 0.35 + landScore * 0.15, 0.95, 1.45)
    : 1;
  for (const footprintSize of candidates) {
    const chance = getNonResidentialLargeSpawnChance(zone, footprintSize, density);
    const largeLotBoost = getLargeLotSpawnBoost(landScore, footprintSize);
    const adjustedChance = Math.min(0.98, chance * largeLotBoost * commercialDemandBoost);
    if (adjustedChance <= 0 || Math.random() >= adjustedChance) continue;
    if (!getRandomNonResidentialModel(zone, footprintSize, landScore)) continue;
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

function getRandomNonResidentialModel(zone, footprintSize, landScore = 0.5) {
  if (zone === ZONE_COM) {
    return getRandomCommercialBuildingModel(footprintSize, footprintSize, landScore);
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

function tryMergeResidentialCluster(scene, r, c, record) {
  const density = record.density ?? (zoneDensityMap[r]?.[c] ?? DENSITY_LOW);
  for (const footprintSize of getResidentialMergeFootprintSizes(density)) {
    const anchor = findMergeableResidentialAnchor(scene, r, c, footprintSize);
    if (!anchor) continue;

    const targetLevel = Math.min(3, (record.level ?? 1) + 1);
    const mergeDensity = getDominantResidentialDensity(anchor.row, anchor.col, footprintSize, footprintSize);

    anchor.buildings.forEach(({ row, col }) => removeBuilding(scene, row, col));
    spawnZoneBuilding(scene, anchor.row, anchor.col, ZONE_RES, targetLevel, mergeDensity, { forceFootprint: footprintSize });
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
  if (!getRandomHouseModel(getResidentialHouseSetForFootprint(footprintSize))) return null;

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

function tryMergeCommercialCluster(scene, r, c, record, landScore = 0.5) {
  for (const footprintSize of [3, 2]) {
    const anchor = findMergeableCommercialAnchor(scene, r, c, footprintSize, landScore);
    if (!anchor) continue;

    const mergeDensity = getDominantResidentialDensity(anchor.row, anchor.col, footprintSize, footprintSize);
    anchor.buildings.forEach(({ row, col }) => removeBuilding(scene, row, col));
    spawnZoneBuilding(scene, anchor.row, anchor.col, ZONE_COM, 3, mergeDensity, {
      landScore,
      preferHighScore: true,
      forceFootprint: footprintSize,
    });
    return true;
  }

  return false;
}

function shouldScanCommercialMergeTile(row, col) {
  const shardCount = 8;
  return ((row * 37 + col * 17 + city.tick) % shardCount) === 0;
}

function findMergeableCommercialAnchor(scene, r, c, footprintSize, landScore = 0.5) {
  for (let row = r - footprintSize + 1; row <= r; row++) {
    for (let col = c - footprintSize + 1; col <= c; col++) {
      const buildings = getMergeableCommercialBuildingsAt(scene, row, col, footprintSize, landScore);
      if (buildings) return { row, col, buildings };
    }
  }
  return null;
}

function getMergeableCommercialBuildingsAt(scene, r, c, footprintSize, landScore = 0.5) {
  if (!isInsideMap(r, c)) return null;
  if (!hasCommercialBuildingModelForFootprint(footprintSize, landScore)) return null;

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

function hasCommercialBuildingModelForFootprint(footprintSize, landScore = 0.5) {
  const all = Array.isArray(commercialBuildingModels) ? commercialBuildingModels : [];
  return all.some((m) => (
    m.metadata
    && m.metadata.scale > 0.05
    && m.footprintCols === footprintSize
    && m.footprintRows === footprintSize
    && (!isHighScoreModel(m) || isHighScoreModelEligible(landScore))
  ));
}

function hasNonResidentialBuildingModelForFootprint(zone, footprintSize, landScore = 0.5) {
  if (zone === ZONE_COM) return hasCommercialBuildingModelForFootprint(footprintSize, landScore);
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

function upgradeZoneBuilding(scene, r, c, zone, landScore = 0.5) {
  const id      = getTileId(r, c);
  const record  = buildingData[id];
  if (!record || record.level >= 3) return;
  const density = record.density ?? (zoneDensityMap[r][c] ?? DENSITY_LOW);

  // In a economically healthy city with good land, upgrades preferentially
  // produce highScore-variant buildings (premium look for premium neighbourhoods).
  const preferHighScore = (
    landScore >= 0.65
    && (city.unemploymentRate ?? 1) < 0.12
    && (city.demandC ?? 0) > 0.10
    && (city.happiness ?? 0) >= 0.60
  );

  removeBuilding(scene, r, c);
  spawnZoneBuilding(scene, r, c, zone, record.level + 1, density, { landScore, preferHighScore });

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

function updateTrees(scene) {
  if (!scene || !treeMap?.length) return;

  const newTrees = [];

  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      const tree = treeMap[r]?.[c];
      if (!tree) continue;

      if (!isTreeTerrainEligible(r, c) || zoneMap[r]?.[c] !== ZONE_NONE || scene.buildingSprites.has(getTileId(r, c))) {
        removeTree(scene, r, c);
        continue;
      }

      if (tree.age < TREE_MATURE_AGE && Math.random() < TREE_GROW_CHANCE_PER_TICK) {
        tree.age++;
        refreshTreeSprite(scene, r, c);
      }

      if (tree.age < TREE_MATURE_AGE) continue;

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
function getRandomHouseModel(setKey = 'house', landScore = 0.5, preferHighScore = false, density = DENSITY_LOW) {
  const all = (houseModelSets && houseModelSets[setKey]) ? houseModelSets[setKey] : [];
  // Only use models whose scale was computed successfully (> 0.05 avoids near-invisible sprites)
  const valid = all.filter((m) => {
    if (!m.metadata || m.metadata.scale <= 0.05) return false;
    if (isHighScoreModel(m) && !isHighScoreModelEligible(landScore)) return false;
    if (isHighScoreModel(m) && density !== DENSITY_LOW) return false;
    return true;
  });
  if (valid.length === 0) return null;
  return pickWithHighScoreBias(valid, `house:${setKey}`, landScore, preferHighScore);
}

function getRandomCommercialBuildingModel(footprintCols = null, footprintRows = null, landScore = 0.5, preferHighScore = false) {
  const all = Array.isArray(commercialBuildingModels) ? commercialBuildingModels : [];
  const valid = all.filter((m) => {
    if (!m.metadata || m.metadata.scale <= 0.05) return false;
    if (footprintCols !== null && m.footprintCols !== footprintCols) return false;
    if (footprintRows !== null && m.footprintRows !== footprintRows) return false;
    if (isHighScoreModel(m) && !isHighScoreModelEligible(landScore)) return false;
    return true;
  });
  if (valid.length === 0) return null;
  return pickWithHighScoreBias(valid, `commercial:${footprintCols ?? 'any'}x${footprintRows ?? 'any'}`, landScore, preferHighScore);
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

function pickVariedModel(models, bucketKey) {
  if (!Array.isArray(models) || models.length === 0) return null;
  if (models.length === 1) return models[0];

  const usage = modelUsageCounts.get(bucketKey) ?? new Map();
  const recent = modelRecentHistory.get(bucketKey) ?? [];

  const weighted = models.map((model) => {
    const usedCount = usage.get(model.key) ?? 0;
    let weight = 1 / (1 + usedCount * MODEL_VARIATION_USAGE_WEIGHT);
    if (recent.includes(model.key)) weight *= MODEL_VARIATION_RECENT_PENALTY;
    return {
      model,
      weight: Math.max(MODEL_VARIATION_MIN_WEIGHT, weight),
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
