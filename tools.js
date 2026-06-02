// Specific building sprite indices for infrastructure
const INFRA_SPRITE_INDEX = {
  power_plant_coal:  60,
  power_plant_solar: 48,
  fire_station:      72,
  police_station:    66,
  legislative_council: 74,
  stock_exchange:      76,
};

const INFRA_COSTS = {
  power_plant_coal:  COST_COAL_PLANT,
  power_plant_solar: COST_SOLAR_PLANT,
  fire_station:      COST_FIRE_STATION,
  police_station:    COST_POLICE_STATION,
  primary_school:    COST_PRIMARY_SCHOOL,
  secondary_school:  COST_SECONDARY_SCHOOL,
  library:           COST_LIBRARY,
  community_college: COST_COMMUNITY_COLLEGE,
  university:        COST_UNIVERSITY,
  legislative_council: COST_LEGISLATIVE_COUNCIL,
  stock_exchange:    COST_STOCK_EXCHANGE,
  park_small:           COST_PARK_SMALL,
  park_large:           COST_PARK_LARGE,
  sports_ground_small:  COST_SPORTS_GROUND_SMALL,
  sports_ground_large:  COST_SPORTS_GROUND_LARGE,
};

// ── Main dispatch (called from applySelectedTool in main.js) ──────────────────
// Returns true if the tool was handled here

function handleNewTool(scene, tile) {
  const { row, col } = tile;

  if (selectedTool === 'zone-res')      return placeZone(scene, row, col, ZONE_RES, selectedZoneDensity.res);
  if (selectedTool === 'zone-com')      return placeZone(scene, row, col, ZONE_COM, selectedZoneDensity.com);
  if (selectedTool === 'zone-ind')      return placeZone(scene, row, col, ZONE_IND, selectedZoneDensity.ind);
  if (selectedTool === 'dezone')        return dezoneAt(scene, row, col);
  if (selectedTool === 'power-line')    return placePowerLine(scene, row, col);
  if (selectedTool === 'power-coal')    return placeInfraBuilding(scene, row, col, 'power_plant_coal');
  if (selectedTool === 'power-solar')   return placeInfraBuilding(scene, row, col, 'power_plant_solar');
  if (selectedTool === 'fire-station')  return placeInfraBuilding(scene, row, col, 'fire_station');
  if (selectedTool === 'police-station') return placeInfraBuilding(scene, row, col, 'police_station');
  if (selectedTool === 'primary-school') return placeInfraBuilding(scene, row, col, 'primary_school');
  if (selectedTool === 'secondary-school') return placeInfraBuilding(scene, row, col, 'secondary_school');
  if (selectedTool === 'library') return placeInfraBuilding(scene, row, col, 'library');
  if (selectedTool === 'community-college') return placeInfraBuilding(scene, row, col, 'community_college');
  if (selectedTool === 'university') return placeInfraBuilding(scene, row, col, 'university');
  if (selectedTool === 'legislative-council') return placeInfraBuilding(scene, row, col, 'legislative_council');
  if (selectedTool === 'stock-exchange') return placeInfraBuilding(scene, row, col, 'stock_exchange');
  if (selectedTool === 'park')           return placeSelectedPark(scene, row, col);
  if (selectedTool === 'park-small')     return placePark(scene, row, col, { type: 'park_small', spriteKey: 'park_small_open', footprintCols: 1, footprintRows: 1 });
  if (selectedTool === 'park-large')     return placePark(scene, row, col, { type: 'park_large', spriteKey: 'park_large', footprintCols: 3, footprintRows: 3 });
  if (selectedTool === 'sports-ground')  return placeSelectedSportsGround(scene, row, col);
  if (selectedTool === 'tree')           return placeTree(scene, row, col);

  return false;
}

// ── De-zone ───────────────────────────────────────────────────────────────────

function dezoneAt(scene, row, col) {
  if (!isInsideMap(row, col)) return false;
  if (zoneMap[row][col] === ZONE_NONE) return false;   // nothing to remove
  removeZoneOverlay(scene, row, col);                  // clears zoneMap entry & destroys overlay sprite
  // Leave any building standing — player uses bulldoze to clear buildings.
  return true;
}

// ── Budget ─────────────────────────────────────────────────────────────────────

function spendBudget(amount) {
  if (city.budget < amount) return false;
  city.budget -= amount;
  return true;
}

// ── Zone placement ─────────────────────────────────────────────────────────────

function placeZone(scene, row, col, zoneType, density = DENSITY_LOW) {
  if (!isInsideMap(row, col)) return false;

  const terrain = mapData[row][col];
  if (terrain === WATER || terrain === BEACH) return false;
  if (terrain === ROAD) {
    removeZoneOverlay(scene, row, col);
    return false;
  }
  if (!canPlaceBuilding(row, col)) return false;
  // No-op if exactly the same zone+density already applied
  if (zoneMap[row][col] === zoneType && zoneDensityMap[row][col] === density) return true;

  const baseCost = zoneType === ZONE_RES ? COST_ZONE_RES
                 : zoneType === ZONE_COM ? COST_ZONE_COM
                 : COST_ZONE_IND;
  const cost = Math.round(baseCost * (DENSITY_COST_MUL[density] ?? 1));

  if (!spendBudget(cost)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }

  // Remove old overlay for this tile if re-zoning
  // (removeZoneOverlay clears zoneMap, so set zoneType AFTER it)
  removeTree(scene, row, col);
  removeZoneOverlay(scene, row, col);
  zoneMap[row][col] = zoneType;
  zoneDensityMap[row][col] = density;

  // Create overlay sprite
  const zoneCode = zoneType === ZONE_RES ? 'res'
                 : zoneType === ZONE_COM ? 'com'
                 : 'ind';
  const textureKey = `zone_overlay_${zoneCode}_${density}`;

  const pos     = isoToScreen(col, row);
  const overlay = scene.add.image(
    pos.x + scene.offsetX,
    pos.y + scene.offsetY + getElevationVisualOffset(row, col),
    textureKey,
  );
  overlay.setOrigin(0.5, 1);
  overlay.setDepth(pos.y + 0.5);
  overlay.setAlpha(0.80);
  overlay.setMask(scene.worldMask);
  scene.zoneOverlays.set(getTileId(row, col), overlay);

  return true;
}

function removeZoneOverlay(scene, row, col) {
  const id = getTileId(row, col);
  const existing = scene.zoneOverlays.get(id);
  if (existing) {
    existing.destroy();
    scene.zoneOverlays.delete(id);
  }
  zoneMap[row][col] = ZONE_NONE;
}

function destroyZoneOverlaySprite(scene, row, col) {
  const id = getTileId(row, col);
  const existing = scene.zoneOverlays.get(id);
  if (!existing) return;
  existing.destroy();
  scene.zoneOverlays.delete(id);
}

// ── Power line placement ───────────────────────────────────────────────────────

function placePowerLine(scene, row, col) {
  if (!isInsideMap(row, col)) return false;
  if (mapData[row][col] === WATER) return false;

  const id = getTileId(row, col);
  if (powerLineSet.has(id)) return true;

  if (!spendBudget(COST_POWER_LINE)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }

  removeTree(scene, row, col);
  powerLineSet.add(id);
  drawPowerLineSprite(scene, row, col);

  return true;
}

function drawPowerLineSprite(scene, row, col) {
  const id  = getTileId(row, col);
  const pos = isoToScreen(col, row);

  const g = scene.add.graphics();
  g.lineStyle(2, 0xffdd00, 0.95);
  // Draw X wire pattern centered at (0,0); positioned via g.setPosition
  const hw = TILE_WIDTH / 4;
  const hh = TILE_HEIGHT / 4;
  g.lineBetween(-hw, -hh, hw,  hh);
  g.lineBetween( hw, -hh, -hw, hh);
  g.fillStyle(0xffdd00, 0.95);
  g.fillCircle(0, 0, 3);

  const cx = pos.x + scene.offsetX;
  const cy = pos.y + scene.offsetY - TILE_HEIGHT / 2;
  g.setPosition(cx, cy + getElevationVisualOffset(row, col));
  g.setDepth(pos.y + 2);
  g.setMask(scene.worldMask);
  scene.powerLineSprites.set(id, g);
}

// ── Infrastructure building placement ─────────────────────────────────────────

function placeInfraBuilding(scene, row, col, buildingType) {
  if (!isInsideMap(row, col)) return false;

  if (buildingType === 'legislative_council') {
    if (city.population < 10000 || hasBuildingType('legislative_council')) return false;
  } else if (buildingType === 'stock_exchange') {
    if (!hasBuildingType('legislative_council') || !isPolicyActive('stockExchangeAct') || hasBuildingType('stock_exchange')) return false;
  }

  const buildingModel = POWER_PLANT_MODELS[buildingType] ?? SERVICE_BUILDING_MODELS[buildingType];
  const footprintCols = buildingModel?.footprintCols ?? 1;
  const footprintRows = buildingModel?.footprintRows ?? 1;
  if (!canPlaceBuildingFootprint(row, col, footprintCols, footprintRows)) return false;

  const cost = INFRA_COSTS[buildingType];
  if (!spendBudget(cost)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }

  removeBuildingsInFootprint(scene, row, col, footprintCols, footprintRows);

  const key = buildingModel?.spriteKey ?? BUILDING_KEYS[INFRA_SPRITE_INDEX[buildingType]];
  const opts = POWER_PLANT_MODELS[buildingType]
    ? (powerPlantModelMetadata[buildingType] ?? buildingModel)
    : SERVICE_BUILDING_MODELS[buildingType]
      ? (serviceBuildingModelMetadata[buildingType] ?? buildingModel)
      : {};
  placeSpriteBuilding(scene, row, col, key, opts);

  const id = getTileId(row, col);
  buildingData[id] = {
    type: buildingType,
    level: 1,
    population: 0,
    age: 0,
    spriteKey:    key,
    footprintCols,
    footprintRows,
    originX: opts.originX,
    originY: opts.originY,
    scale: opts.scale,
    scaleX: opts.scaleX,
    scaleY: opts.scaleY,
  };

  if (buildingType === 'power_plant_coal' || buildingType === 'power_plant_solar') {
    powerSources.add(id);
  }
  refreshInfrastructureEffects(scene);

  return true;
}

function placeSelectedPark(scene, row, col) {
  const option = typeof getSelectedParkOption === 'function'
    ? getSelectedParkOption()
    : { type: 'park_small', spriteKey: 'park_small_open', footprintCols: 1, footprintRows: 1 };
  return placePark(scene, row, col, option);
}

function placePark(scene, row, col, parkOption) {
  if (!isInsideMap(row, col)) return false;

  const parkType = parkOption.type;
  const spriteKey = parkOption.spriteKey ?? parkType;
  const footprintCols = parkOption.footprintCols ?? (parkType === 'park_large' ? 3 : 1);
  const footprintRows = parkOption.footprintRows ?? (parkType === 'park_large' ? 3 : 1);
  if (!canPlaceBuildingFootprint(row, col, footprintCols, footprintRows)) return false;

  const cost = INFRA_COSTS[parkType];
  if (!spendBudget(cost)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }

  removeBuildingsInFootprint(scene, row, col, footprintCols, footprintRows);

  const key = spriteKey;
  const opts = getParkSpriteOptions(key, parkOption);
  placeSpriteBuilding(scene, row, col, key, opts);

  const id = getTileId(row, col);
  buildingData[id] = {
    type: parkType,
    parkVariant: parkOption.id,
    level: 1,
    population: 0,
    age: 0,
    spriteKey: key,
    footprintCols,
    footprintRows,
    originX: opts.originX,
    originY: opts.originY,
    scale: opts.scale,
  };
  refreshInfrastructureEffects(scene);

  return true;
}

function placeSelectedSportsGround(scene, row, col) {
  const option = typeof getSelectedSportsGroundOption === 'function'
    ? getSelectedSportsGroundOption()
    : SPORT_GROUND_OPTIONS[0];
  return placeSportsGround(scene, row, col, option);
}

function placeSportsGround(scene, row, col, option) {
  if (!isInsideMap(row, col)) return false;

  const { type, spriteKey, footprintCols = 2, footprintRows = 2 } = option;
  if (!canPlaceBuildingFootprint(row, col, footprintCols, footprintRows)) return false;

  const cost = INFRA_COSTS[type];
  if (!spendBudget(cost)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }

  removeBuildingsInFootprint(scene, row, col, footprintCols, footprintRows);

  const opts = getParkSpriteOptions(spriteKey, option);
  placeSpriteBuilding(scene, row, col, spriteKey, opts);

  buildingData[getTileId(row, col)] = {
    type,
    level: 1,
    population: 0,
    age: 0,
    spriteKey,
    footprintCols,
    footprintRows,
    originX: opts.originX,
    originY: opts.originY,
    scale: opts.scale,
  };
  refreshInfrastructureEffects(scene);
  return true;
}

function refreshInfrastructureEffects(scene) {
  markPowerGridDirty();
  markServiceCoverageDirty();
  if (typeof updateServiceCoverage === 'function') updateServiceCoverage();
  if (typeof updatePowerGrid === 'function') updatePowerGrid(scene);
  if (typeof computeHappiness === 'function') computeHappiness(scene);
  if (typeof updateHUD === 'function') updateHUD();
}

function getParkSpriteOptions(spriteKey, parkOption = {}) {
  const metadata = typeof parkModelMetadata !== 'undefined'
    ? parkModelMetadata[spriteKey]
    : null;
  if (metadata) return metadata;

  if (parkOption.type === 'park_large' || spriteKey === 'park_large') {
    return {
      footprintCols: 3,
      footprintRows: 3,
      originX: 0.5,
      originY: 150 / 165,
    };
  }

  return {
    footprintCols: 1,
    footprintRows: 1,
    originX: 0.5,
    originY: 50 / 65,
  };
}

// ── Clear all overlays (called from fullReset) ────────────────────────────────

function clearAllOverlays(scene) {
  scene.zoneOverlays.forEach((overlay) => overlay.destroy());
  scene.zoneOverlays.clear();

  scene.powerLineSprites.forEach((g) => g.destroy());
  scene.powerLineSprites.clear();

  scene.bridgeSprites?.forEach((entry) => {
    if (typeof destroyBridgeSpriteEntry === 'function') destroyBridgeSpriteEntry(entry);
    else entry?.destroy?.();
  });
  scene.bridgeSprites?.clear();

  if (typeof clearTreeSprites === 'function') clearTreeSprites(scene);
}

// ── Reposition overlays on resize ─────────────────────────────────────────────

function repositionOverlays(scene) {
  scene.zoneOverlays.forEach((overlay, id) => {
    const [r, c] = id.split(':').map(Number);
    const pos = isoToScreen(c, r);
    overlay.setPosition(pos.x + scene.offsetX, pos.y + scene.offsetY + getElevationVisualOffset(r, c));
    overlay.setDepth(pos.y + 0.5);
  });

  scene.powerLineSprites.forEach((g, id) => {
    const [r, c] = id.split(':').map(Number);
    const pos = isoToScreen(c, r);
    g.setPosition(pos.x + scene.offsetX, pos.y + scene.offsetY - TILE_HEIGHT / 2 + getElevationVisualOffset(r, c));
    g.setDepth(pos.y + 2);
  });

  if (typeof repositionBridgeSprites === 'function') repositionBridgeSprites(scene);
}
