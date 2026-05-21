// ── Sim tick orchestrator ─────────────────────────────────────────────────────

function runSimTick(scene) {
  if (!scene) return;

  // Order matters:
  // 1. Infrastructure state (power, services)
  // 2. Population/pollution counts (needed for happiness)
  // 3. Happiness (needed for demand)
  // 4. Demand (needs fresh happiness)
  // 5. Zone growth (needs fresh demand)
  // 6. Economy, date, display
  updatePowerGrid(scene);
  updateServiceCoverage();
  updatePopulationAndPollution();
  computeHappiness(scene);
  updateDemand();

  // Debug: log state every 4 ticks (once per month)
  if (city.tick % 4 === 0) {
    let zonedCount = 0, roadAdjacentZoned = 0, poweredZoned = 0;
    for (let r = 0; r < MAP_HEIGHT; r++)
      for (let c = 0; c < MAP_WIDTH; c++)
        if (zoneMap[r][c] !== ZONE_NONE) {
          zonedCount++;
          if (hasAdjacentRoad(r, c)) roadAdjacentZoned++;
          if (powerMap[r][c]) poweredZoned++;
        }
    console.log(
      `[Sim] tick=${city.tick} zones=${zonedCount} roadAdj=${roadAdjacentZoned}` +
      ` powered=${poweredZoned} demandR=${city.demandR.toFixed(2)}` +
      ` demandC=${city.demandC.toFixed(2)} demandI=${city.demandI.toFixed(2)}` +
      ` powerSources=${powerSources.size} budget=$${city.budget}`
    );
  }

  growOrShrinkZones(scene);
  runEconomy();
  advanceDate();
  refreshZoneOverlayTints(scene);
  updateHUD();

  // Refresh mini-map if one is visible
  if (typeof activeOverlay === 'string' && activeOverlay) {
    overlayCache = {};          // invalidate on tick
    updateMiniMap();
  }
}

// ── Power grid (BFS from plants through conductors) ───────────────────────────

function updatePowerGrid(scene) {
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
  serviceMap = createFilledMap(null);

  Object.entries(buildingData).forEach(([id, record]) => {
    if (record.type === 'fire_station')   bfsService(id, 'fire',   FIRE_STATION_RADIUS);
    if (record.type === 'police_station') bfsService(id, 'police', POLICE_STATION_RADIUS);
    if (record.type === 'park_small')      bfsService(id, 'park',   SMALL_PARK_RADIUS, 1);
    if (record.type === 'park_large')      bfsService(id, 'park',   LARGE_PARK_RADIUS, 2);
  });
}

function bfsService(anchorId, key, radius, value = true) {
  const [startR, startC] = anchorId.split(':').map(Number);
  const visited = new Set([anchorId]);
  const queue = [[startR, startC, 0]];

  while (queue.length > 0) {
    const [r, c, dist] = queue.shift();
    if (!serviceMap[r][c]) serviceMap[r][c] = { fire: false, police: false, park: 0 };
    if (key === 'park') {
      serviceMap[r][c].park = Math.max(serviceMap[r][c].park ?? 0, value);
    } else {
      serviceMap[r][c][key] = value;
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

// ── Demand engine (Classic SimCity RCI model) ─────────────────────────────────

function updateDemand() {
  normalizeCityFinanceState();
  const resCnt = Math.max(1, city.residentialCount);
  const comCnt = city.commercialCount;
  const indCnt = city.industrialCount;
  const total  = resCnt + comCnt + indCnt;

  const jobCapacity = comCnt * JOBS_PER_COM + indCnt * JOBS_PER_IND;
  const jobRatio    = clamp(jobCapacity / (resCnt * 4), 0, 1);

  // Residential: base +0.3 attractiveness so people want to move into an empty city.
  // Scales up with jobs (C/I) and down with high taxes.
  city.demandR = clamp(
    0.3 + 0.5 * jobRatio + 0.1 * city.happiness
    + (isPolicyActive('greenParks') ? 0.04 : 0)
    + (isPolicyActive('roadRepair') ? 0.03 : 0)
    - 0.2 * (city.taxRate / TAX_RATE_MAX),
    -1, 1
  );
  // Commercial: needs residents (customers), falls if over-supplied.
  city.demandC = clamp(
    (resCnt / total) - (comCnt / total) * 2 + 0.2 * city.happiness - 0.05
    + (isPolicyActive('smallBusiness') ? 0.12 : 0)
    + (isPolicyActive('roadRepair') ? 0.04 : 0),
    -1, 1
  );
  // Industrial: starts high, falls as city industrialises or pollutes too much.
  city.demandI = clamp(
    0.5 - (indCnt / total) * 3 + 0.2 * (1 - city.pollution / 100)
    - (isPolicyActive('cleanAir') ? 0.05 : 0),
    -1, 1
  );
}

// ── Zone growth / shrink ──────────────────────────────────────────────────────

function growOrShrinkZones(scene) {
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

      if (!hasBldg) {
        // Grow a new building
        if (hasRoad && demand > 0 && Math.random() < demand * GROW_CHANCE_BASE * powerMul * densityMul) {
          spawnZoneBuilding(scene, r, c, zone, 1, density);
        }
      } else {
        const record = buildingData[id];
        if (!record || !['residential', 'commercial', 'industrial'].includes(record.type)) continue;

        if (record.level < 3 && hasRoad && demand > 0.5 && Math.random() < UPGRADE_CHANCE * powerMul * densityMul) {
          if (zone === ZONE_RES && tryMergeResidentialCluster(scene, r, c, record)) continue;
          upgradeZoneBuilding(scene, r, c, zone);
        } else if ((!hasRoad || demand < -0.5 || cityPower < 0.35) && Math.random() < SHRINK_CHANCE * (cityPower < 0.35 ? 1.5 : 1)) {
          shrinkOrRemoveZoneBuilding(scene, r, c);
        }
      }
    }
  }
}

function spawnZoneBuilding(scene, r, c, zone, level, density = DENSITY_LOW, optionsOverride = {}) {
  let key;
  let options = {};

  if (zone === ZONE_RES) {
    // Larger homes are more likely in denser residential zones if a clear 2×2 block is available.
    const try2x2 = optionsOverride.force2x2
      ? canPlace2x2Residential(scene, r, c)
      : Math.random() < getResidential2x2Chance(density) && canPlace2x2Residential(scene, r, c);
    const setKey  = try2x2 ? 'house2x2' : 'house';
    const model   = getRandomHouseModel(setKey);

    if (model) {
      key     = model.key;
      options = { ...model.metadata };
    } else if (try2x2) {
      // 2×2 models not ready yet — fall back to 1×1
      const fallback = getRandomHouseModel('house');
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
    key = BUILDING_KEYS[Math.floor(Math.random() * 39)];
  } else {
    key = BUILDING_KEYS[39 + Math.floor(Math.random() * 39)];
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
  };
  return true;
}

function getResidential2x2Chance(density) {
  return RES_2X2_SPAWN_CHANCE[density] ?? RES_2X2_SPAWN_CHANCE[DENSITY_LOW];
}

// Returns true when a 2×2 block anchored at (r, c) is fully clear and zoned RES.
function canPlace2x2Residential(scene, r, c) {
  const baseHeight = getTileHeight(r, c);
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (!isInsideMap(rr, cc))                        return false;
      if (zoneMap[rr][cc] !== ZONE_RES)                return false;
      if (scene.buildingSprites.has(getTileId(rr, cc))) return false;
      if (!canPlaceBuilding(rr, cc)) return false;
      if (getTileHeight(rr, cc) !== baseHeight) return false;
    }
  }
  return true;
}

function tryMergeResidentialCluster(scene, r, c, record) {
  const anchor = findMergeableResidential2x2Anchor(scene, r, c);
  if (!anchor) return false;

  const targetLevel = Math.min(3, (record.level ?? 1) + 1);
  const density = getDominantResidentialDensity(anchor.row, anchor.col);

  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      removeBuilding(scene, anchor.row + dr, anchor.col + dc);
    }
  }

  spawnZoneBuilding(scene, anchor.row, anchor.col, ZONE_RES, targetLevel, density, { force2x2: true });
  if (city.population > 0) showToast(t('toast.populationGain'));
  return true;
}

function findMergeableResidential2x2Anchor(scene, r, c) {
  const candidates = [
    { row: r,     col: c },
    { row: r - 1, col: c },
    { row: r,     col: c - 1 },
    { row: r - 1, col: c - 1 },
  ];

  return candidates.find(({ row, col }) => canMergeResidential2x2At(scene, row, col)) ?? null;
}

function canMergeResidential2x2At(scene, r, c) {
  const baseHeight = getTileHeight(r, c);
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (!isInsideMap(rr, cc)) return false;
      if (zoneMap[rr][cc] !== ZONE_RES) return false;
      if (!canPlaceBuilding(rr, cc)) return false;
      if (getTileHeight(rr, cc) !== baseHeight) return false;

      const id = getTileId(rr, cc);
      const sprite = scene.buildingSprites.get(id);
      const rec = buildingData[id];
      if (!sprite || !rec) return false;
      if (sprite.mapRow !== rr || sprite.mapCol !== cc) return false;
      if (rec.type !== 'residential') return false;
      if ((rec.footprintCols ?? 1) !== 1 || (rec.footprintRows ?? 1) !== 1) return false;
    }
  }

  return getRandomHouseModel('house2x2') !== null;
}

function getDominantResidentialDensity(r, c) {
  const counts = new Map();
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      const density = zoneDensityMap[r + dr]?.[c + dc] ?? DENSITY_LOW;
      counts.set(density, (counts.get(density) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? DENSITY_LOW;
}

function upgradeZoneBuilding(scene, r, c, zone) {
  const id      = getTileId(r, c);
  const record  = buildingData[id];
  if (!record || record.level >= 3) return;
  const density = record.density ?? (zoneDensityMap[r][c] ?? DENSITY_LOW);
  removeBuilding(scene, r, c);
  spawnZoneBuilding(scene, r, c, zone, record.level + 1, density);

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

// Returns a random house model from the given set that has valid computed metadata.
// setKey = 'house' (1×1) | 'house2x2' (2×2) | 'house1x4' (1×4)
function getRandomHouseModel(setKey = 'house') {
  const all = (houseModelSets && houseModelSets[setKey]) ? houseModelSets[setKey] : [];
  // Only use models whose scale was computed successfully (> 0.05 avoids near-invisible sprites)
  const valid = all.filter((m) => m.metadata && m.metadata.scale > 0.05);
  if (valid.length === 0) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

// ── Population & pollution counters ──────────────────────────────────────────

function updatePopulationAndPollution() {
  normalizeCityFinanceState();
  city.population      = 0;
  city.residentialCount = 0;
  city.commercialCount = 0;
  city.industrialCount = 0;
  city.pollution       = 0;

  Object.values(buildingData).forEach((rec) => {
    if (rec.type === 'residential') {
      city.residentialCount++;
      // Use stored population (accounts for multi-tile footprints) or fall back to level lookup
      city.population += rec.population ?? POP_PER_LEVEL[rec.level] ?? 0;
    } else if (rec.type === 'commercial') {
      city.commercialCount++;
    } else if (rec.type === 'industrial') {
      city.industrialCount++;
      city.pollution += POLLUTION_IND_BUILDING * (isPolicyActive('cleanAir') ? 0.70 : 1);
    } else if (rec.type === 'power_plant_coal') {
      city.pollution += POLLUTION_COAL_PLANT * (isPolicyActive('cleanAir') ? 0.70 : 1);
    } else if (rec.type === 'power_plant_solar') {
      city.pollution += Math.max(1, Math.round(POLLUTION_COAL_PLANT * 0.08));
    }
  });
  city.pollution = Math.round(city.pollution);
}

// ── Economy (runs monthly) ────────────────────────────────────────────────────

function runEconomy(scene) {
  if (city.tick % TICKS_PER_MONTH !== 0) return;
  normalizeCityFinanceState();
  const loanPayment = applyMonthlyLoanPayments();

  agePowerPlants(scene);

  const snapshot = computeBudgetSnapshot({ loanPayment });
  city.monthlyIncome = snapshot.totalIncome;
  city.monthlyExpenses = snapshot.totalExpenses;
  city.lastPolicyCost = snapshot.expenses.policy;
  city.lastLoanPayment = snapshot.expenses.loans;
  city.lastBudgetSnapshot = snapshot;
  updateCreditRating();

  const net = city.monthlyIncome - city.monthlyExpenses;
  city.budget += net;

  if (net < 0 && city.tick > TICKS_PER_MONTH) {
    showToast(t('toast.monthlyLoss', { amount: Math.abs(net) }), 'warning');
  }

  if (city.budget < 0 && !city.isBankrupt) {
    city.isBankrupt = true;
    showToast(t('toast.bankruptcy'), 'danger');
  } else if (city.budget >= 0 && city.isBankrupt) {
    city.isBankrupt = false;
  }
}

function agePowerPlants(scene) {
  Object.entries(buildingData).forEach(([id, record]) => {
    if (!POWER_PLANT_STATS[record.type]) return;

    record.age = Math.max(0, Number(record.age ?? 0) + 1);
    const remaining = getPowerPlantRemainingMonths(record);
    const state = getPowerPlantState(record);
    const building = scene?.buildingSprites.get(id);

    if (remaining <= 0) {
      record.powerState = 'abandoned';
      record.powerOutput = 0;
    } else if (state === 'degraded') {
      record.powerState = 'degraded';
      record.powerOutput = getPowerPlantOutput(record);
    } else {
      record.powerState = 'active';
      record.powerOutput = getPowerPlantOutput(record);
    }

    record.powerRemainingMonths = remaining;
    record.powerWarning = isPowerPlantNearRetirement(record);
  record.powerMaintenance = getPowerPlantMaintenance(record);

    if (!building) return;
    if (record.powerState === 'abandoned') {
      building.setAlpha(0.55);
      building.setTint(0x9a9a9a);
    } else if (record.powerState === 'degraded') {
      building.setAlpha(0.86);
      building.setTint(record.type === 'power_plant_coal' ? 0xd9b873 : 0xf0dc98);
    } else {
      building.clearTint();
      building.setAlpha(1);
    }
  });
}

function applyMonthlyLoanPayments() {
  if (!city.loans.length) return 0;
  let total = 0;
  city.loans.forEach((loan) => {
    const monthlyRate = (loan.annualRate ?? 0) / 12;
    const interest = loan.balance * monthlyRate;
    const payment = Math.min(loan.balance + interest, loan.monthlyPayment ?? 0);
    loan.balance = Math.max(0, loan.balance + interest - payment);
    loan.monthsLeft = Math.max(0, (loan.monthsLeft ?? 1) - 1);
    total += payment;
  });
  city.loans = city.loans.filter((loan) => loan.balance > 1 && loan.monthsLeft > 0);
  return Math.round(total);
}

function countBuildingType(type) {
  return Object.values(buildingData).filter((r) => r.type === type).length;
}

// ── Happiness & city rating ───────────────────────────────────────────────────

function computeHappiness(scene) {
  normalizeCityFinanceState();
  let zoned = 0;
  let powered = 0;
  let fireCovered = 0;
  let policeCovered = 0;
  let residential = 0;
  let parkScore = 0;

  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (zoneMap[r][c] === ZONE_NONE) continue;
      zoned++;
      if (powerMap[r][c]) powered++;
      if (serviceMap[r]?.[c]?.fire) fireCovered++;
      if (serviceMap[r]?.[c]?.police) policeCovered++;
      if (zoneMap[r][c] === ZONE_RES) {
        residential++;
        parkScore += Math.min(serviceMap[r]?.[c]?.park ?? 0, 2);
      }
    }
  }

  // No zones yet → city is empty and optimistic; keep baseline happiness.
  // Happiness only starts reflecting infrastructure quality once zones exist.
  if (zoned === 0) {
    city.happiness = 0.5;
    return;
  }

  const poweredRatio = powered  / zoned;
  const safetyBoost = isPolicyActive('publicSafety') ? 1.2 : 1;
  const fireRatio    = clamp((fireCovered / zoned) * getDepartmentFunding('fire') * safetyBoost, 0, 1);
  const policeRatio  = clamp((policeCovered / zoned) * getDepartmentFunding('police') * safetyBoost, 0, 1);
  const parkPolicyBoost = isPolicyActive('greenParks') ? 1.2 : 1;
  const parkRatio    = residential > 0
    ? clamp((parkScore / (residential * 2)) * getDepartmentFunding('parks') * parkPolicyBoost, 0, 1)
    : 0;
  const taxPenalty   = Math.max(0, (city.taxRate - 0.09) * 3);
  const pollPenalty  = city.pollution / 200;
  const powerPenalty = Math.max(0, 1 - (city.powerRatio ?? 1)) * 0.22;
  const roadBonus = Math.min(0.08, (getDepartmentFunding('roads') - 1) * 0.08 + (isPolicyActive('roadRepair') ? 0.04 : 0));
  const policyBonus = (isPolicyActive('cleanAir') ? 0.03 : 0) + (isPolicyActive('publicSafety') ? 0.02 : 0);

  city.happiness = clamp(
    0.2 + 0.42 * poweredRatio + 0.18 * fireRatio + 0.18 * policeRatio + 0.22 * parkRatio
      + roadBonus + policyBonus - taxPenalty - pollPenalty - powerPenalty,
    0, 1
  );
}

// ── Date advancement ──────────────────────────────────────────────────────────

// Days shown at each tick within a month (TICKS_PER_MONTH = 4 → 1 / 8 / 15 / 22)
const TICK_DAY_OFFSETS = Array.from(
  { length: TICKS_PER_MONTH },
  (_, i) => 1 + i * Math.floor(30 / TICKS_PER_MONTH),
);

function advanceDate() {
  city.tick++;

  // Update the displayed day (cosmetic — does not drive game logic)
  city.day = TICK_DAY_OFFSETS[city.tick % TICKS_PER_MONTH] ?? 1;

  if (city.tick % TICKS_PER_MONTH === 0) {
    city.month++;
    city.day = 1;     // first day of the new month
    if (city.month > 12) {
      city.month = 1;
      city.year++;
      // Autosave at the start of each new year (January)
      if (typeof triggerAutosave === 'function') triggerAutosave();
    }
  }
}

// ── Zone overlay tinting (powered = brighter) ─────────────────────────────────

function refreshZoneOverlayTints(scene) {
  if (!scene.zoneOverlays) return;
  // Density is now encoded in texture color; alpha only encodes power state.
  scene.zoneOverlays.forEach((overlay, id) => {
    const [r, c] = id.split(':').map(Number);
    overlay.setAlpha(powerMap[r]?.[c] ? 0.80 : 0.45);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCardinalNeighbors(r, c) {
  return [[r - 1, c], [r, c + 1], [r + 1, c], [r, c - 1]];
}

function hasAdjacentRoad(row, col) {
  // Road-accessible = any road tile within Chebyshev distance 2.
  // This covers: directly adjacent (distance 1) AND one plot further away (distance 2),
  // matching the SimCity rule that buildings can be set back one tile from a road.
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const r = row + dr, c = col + dc;
      if (isInsideMap(r, c) && (
        mapData[r][c] === ROAD
        || (typeof isBridgeDeckTile === 'function' && isBridgeDeckTile(r, c))
      )) return true;
    }
  }
  return false;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
