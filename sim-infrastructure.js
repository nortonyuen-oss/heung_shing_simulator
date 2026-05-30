function isScienceParkIndustrialRecord(record) {
  if (!record || record.type !== 'industrial') return false;
  return /sciencepark/i.test(record.sourceFileName || record.spriteKey || '');
}

function updateScienceParkUnlockState() {
  const higherEdu = clamp(city.educationHigherIndex ?? 0, 0, 1);
  if (!city.scienceParkUnlocked && higherEdu >= SCIENCE_PARK_UNLOCK_HIGHER_EDU) {
    city.scienceParkUnlocked = true;
  }
}

function pickScienceParkIndustrialModel(footprintCols, footprintRows) {
  const all = Array.isArray(industrialBuildingModels) ? industrialBuildingModels : [];
  const scienceModels = all.filter((m) => (
    m.metadata
    && m.metadata.scale > 0.05
    && /sciencepark/i.test(m.sourceFileName || m.fileName || '')
    && (footprintCols === null || m.footprintCols === footprintCols)
    && (footprintRows === null || m.footprintRows === footprintRows)
  ));

  if (scienceModels.length === 0) return null;
  return pickVariedModel(scienceModels, `industrial:${footprintCols ?? 'any'}x${footprintRows ?? 'any'}:science-convert`);
}

function convertEligibleIndustrialToScienceParks(scene) {
  if (!scene || !city.scienceParkUnlocked) return 0;

  const higherEdu = clamp(city.educationHigherIndex ?? 0, 0, 1);
  const policyBonus = isPolicyActive('scienceDevelopment') ? 0.10 : 0;
  const conversionChance = clamp(
    SCIENCE_PARK_CONVERSION_CHANCE_BASE + SCIENCE_PARK_CONVERSION_CHANCE_EDU_BONUS * higherEdu + policyBonus,
    0,
    0.75,
  );

  let converted = 0;
  Object.entries(buildingData).forEach(([id, record]) => {
    if (!record || record.type !== 'industrial') return;
    if (isScienceParkIndustrialRecord(record)) return;
    if (Math.random() >= conversionChance) return;

    const [row, col] = id.split(':').map(Number);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;

    const footprintCols = record.footprintCols ?? 1;
    const footprintRows = record.footprintRows ?? 1;
    const model = pickScienceParkIndustrialModel(footprintCols, footprintRows);
    if (!model) return;

    const oldRecord = { ...record };
    if (!removeBuilding(scene, row, col)) return;

    const options = { ...(model.metadata ?? {}) };
    placeSpriteBuilding(scene, row, col, model.key, options);

    buildingData[id] = {
      ...oldRecord,
      spriteKey: model.key,
      sourceFileName: model.sourceFileName,
      footprintCols: options.footprintCols ?? model.footprintCols ?? oldRecord.footprintCols ?? 1,
      footprintRows: options.footprintRows ?? model.footprintRows ?? oldRecord.footprintRows ?? 1,
      originX: options.originX,
      originY: options.originY,
      scale: options.scale,
      scaleX: options.scaleX,
      scaleY: options.scaleY,
      offsetX: options.offsetX,
      offsetY: options.offsetY,
      anchorMode: options.anchorMode,
    };
    converted++;
  });

  return converted;
}

// ── Power grid (BFS from plants through conductors) ───────────────────────────

function updatePowerGrid(scene) {
  if (!_powerGridDirty) return;
  _powerGridDirty = false;

  for (let r = 0; r < MAP_HEIGHT; r++)
    for (let c = 0; c < MAP_WIDTH; c++)
      powerMap[r][c] = false;

  let totalSupply = 0;
  let totalDemand = 0;
  const activePlants = [];

  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      const id = getTileId(r, c);
      const record = buildingData[id];
      if (record) {
        totalDemand += getBuildingPowerDemand(record);
        if (POWER_PLANT_STATS[record.type] && (record.powerState ?? 'active') !== 'abandoned') {
          const output = getPowerPlantOutput(record);
          totalSupply += output;
          activePlants.push({ record, output });
        }
      } else if (zoneMap[r][c] !== ZONE_NONE) {
        totalDemand += getZonePowerDemand(zoneMap[r][c], zoneDensityMap[r][c] ?? DENSITY_LOW);
      }
    }
  }

  city.totalPowerSupply = Math.max(0, Math.round(totalSupply));
  city.totalPowerDemand = Math.max(0, Math.round(totalDemand));
  city.powerRatio = city.totalPowerDemand > 0
    ? clamp(city.totalPowerSupply / city.totalPowerDemand, 0, 1)
    : 1;
  city.powerStatus = city.totalPowerDemand === 0
    ? 'surplus'
    : city.totalPowerSupply >= city.totalPowerDemand
      ? (city.totalPowerSupply > city.totalPowerDemand * 1.1 ? 'surplus' : 'ok')
      : (city.totalPowerSupply >= city.totalPowerDemand * 0.75 ? 'strained' : 'overloaded');

  activePlants.forEach(({ record, output }) => {
    if (output <= 0) {
      record.powerLoad = 0;
      record.powerLoadRatio = 0;
      record.powerLoadState = 'off';
      return;
    }

    const share = totalSupply > 0 ? output / totalSupply : 0;
    const served = Math.min(output, Math.round(totalDemand * share));
    record.powerLoad = served;
    record.powerLoadRatio = clamp(served / output, 0, 1);
    record.powerLoadState = city.powerStatus === 'overloaded'
      ? 'overloaded'
      : record.powerLoadRatio >= 0.9
        ? 'busy'
        : record.powerLoadRatio >= 0.5
          ? 'balanced'
          : 'underused';
  });

  Object.entries(buildingData).forEach(([, record]) => {
    if (!POWER_PLANT_STATS[record.type]) return;
    if ((record.powerState ?? 'active') === 'abandoned') {
      record.powerLoad = 0;
      record.powerLoadRatio = 0;
      record.powerLoadState = 'abandoned';
    }
  });

  const queue = [];

  // Seed BFS from every tile occupied by a power plant
  powerSources.forEach((id) => {
    const building = scene.buildingSprites.get(id);
    if (!building) return;
    getFootprintTiles(
      building.mapRow,
      building.mapCol,
      building.footprintCols ?? 1,
      building.footprintRows ?? 1,
    ).forEach(([r, c]) => {
      if (isInsideMap(r, c) && !powerMap[r][c]) {
        powerMap[r][c] = true;
        queue.push([r, c]);
      }
    });
  });

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    for (const [nr, nc] of getCardinalNeighbors(r, c)) {
      if (!isInsideMap(nr, nc) || powerMap[nr][nc]) continue;
      const nid = getTileId(nr, nc);
      const conducts = powerLineSet.has(nid)
        || mapData[nr][nc] === ROAD
        || scene.buildingSprites.has(nid);
      if (conducts) {
        powerMap[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }

  // Second pass: empty zoned tiles are powered if adjacent to a powered tile.
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (zoneMap[r][c] === ZONE_NONE || powerMap[r][c]) continue;
      if (scene.buildingSprites.has(getTileId(r, c))) continue;
      if (getCardinalNeighbors(r, c).some(([nr, nc]) => isInsideMap(nr, nc) && powerMap[nr][nc])) {
        powerMap[r][c] = true;
      }
    }
  }
}

// ── Service coverage (BFS with radius cap) ────────────────────────────────────

function updateServiceCoverage() {
  if (!_serviceCoverageDirty) return;
  _serviceCoverageDirty = false;

  serviceMap = createFilledMap(null);

  Object.entries(buildingData).forEach(([id, record]) => {
    if (record.type === 'fire_station')   bfsService(id, 'fire',   FIRE_STATION_RADIUS);
    if (record.type === 'police_station') bfsService(id, 'police', POLICE_STATION_RADIUS);
    if (record.type === 'primary_school') bfsService(id, 'eduBasic', PRIMARY_SCHOOL_RADIUS, 0.45);
    if (record.type === 'secondary_school') bfsService(id, 'eduBasic', SECONDARY_SCHOOL_RADIUS, 0.55);
    if (record.type === 'library') bfsService(id, 'eduBasic', LIBRARY_RADIUS, 0.35);
    if (record.type === 'community_college') bfsService(id, 'eduHigher', COMMUNITY_COLLEGE_RADIUS, 0.45);
    if (record.type === 'university') bfsService(id, 'eduHigher', UNIVERSITY_RADIUS, 0.75);
    if (record.type === 'park_small')      bfsService(id, 'park',   SMALL_PARK_RADIUS, 1);
    if (record.type === 'park_large')      bfsService(id, 'park',   LARGE_PARK_RADIUS, 2);
  });
}

function ensureServiceCell(r, c) {
  if (!serviceMap[r][c]) {
    serviceMap[r][c] = {
      fire: false,
      police: false,
      park: 0,
      eduBasic: 0,
      eduHigher: 0,
    };
  }
  return serviceMap[r][c];
}

function bfsService(anchorId, key, radius, value = true) {
  const [startR, startC] = anchorId.split(':').map(Number);
  const visited = new Set([anchorId]);
  const queue = [[startR, startC, 0]];

  while (queue.length > 0) {
    const [r, c, dist] = queue.shift();
    const cell = ensureServiceCell(r, c);
    if (key === 'park') {
      cell.park = Math.max(cell.park ?? 0, value);
    } else if (key === 'eduBasic' || key === 'eduHigher') {
      cell[key] = clamp((cell[key] ?? 0) + Number(value || 0), 0, 1);
    } else {
      cell[key] = value;
    }
    if (dist >= radius) continue;
    for (const [nr, nc] of getCardinalNeighbors(r, c)) {
      if (!isInsideMap(nr, nc)) continue;
      const nid = getTileId(nr, nc);
      if (visited.has(nid)) continue;
      visited.add(nid);
      queue.push([nr, nc, dist + 1]);
    }
  }
}

