// ── Sim tick orchestrator ─────────────────────────────────────────────────────

const MODEL_VARIATION_USAGE_WEIGHT = 0.7;
const MODEL_VARIATION_RECENT_PENALTY = 0.18;
const MODEL_VARIATION_MIN_WEIGHT = 0.04;
const modelUsageCounts = new Map();
const modelRecentHistory = new Map();

function runSimTick(scene) {
  if (!scene) return;

  invalidateBuildingCountCache();

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
  updateEducationLevels();
  updateCrimeRateIndex();
  computeHappiness(scene);
  updateDemand();
  updateStockMarketTick();
  updateTrees(scene);

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
  runEconomy(scene);
  advanceDate();
  refreshZoneOverlayTints(scene);
  updateHUD();

  // Refresh mini-map if one is visible
  if (typeof activeOverlay === 'string' && activeOverlay) {
    overlayCache = {};          // invalidate on tick
    updateMiniMap();
  }
}

function updateEducationLevels() {
  const basicPolicyMul = isPolicyActive('educationReform') ? EDUCATION_POLICY_REFORM_MUL : 1;
  let weightedBasicSum = 0;
  let weightedHigherSum = 0;
  let weightedPop = 0;

  Object.entries(buildingData).forEach(([id, record]) => {
    if (record.type !== 'residential') return;
    const pop = Math.max(0, Number(record.population ?? 0));
    if (pop <= 0) return;

    const [r, c] = id.split(':').map(Number);
    const cell = serviceMap[r]?.[c] ?? null;
    const localBasic = clamp((cell?.eduBasic ?? 0) * basicPolicyMul, 0, 1);
    let localHigher = clamp(cell?.eduHigher ?? 0, 0, 1);
    if (isPolicyActive('scienceDevelopment')) {
      localHigher = clamp(localHigher + SCIENCE_DEVELOPMENT_HIGHER_BONUS, 0, 1);
    }

    weightedBasicSum += localBasic * pop;
    weightedHigherSum += localHigher * pop;
    weightedPop += pop;
  });

  const targetBasic = weightedPop > 0 ? clamp(weightedBasicSum / weightedPop, 0, 1) : 0;
  const targetHigher = weightedPop > 0 ? clamp(weightedHigherSum / weightedPop, 0, 1) : 0;

  if (city.tick % TICKS_PER_MONTH === 0 || city.tick <= 1) {
    city.educationBasicIndex = clamp(
      city.educationBasicIndex + EDUCATION_BASIC_SMOOTHING * (targetBasic - city.educationBasicIndex),
      0,
      1,
    );
    city.educationHigherIndex = clamp(
      city.educationHigherIndex + EDUCATION_HIGHER_SMOOTHING * (targetHigher - city.educationHigherIndex),
      0,
      1,
    );
  }

  city.educationAverageLevel = clamp(city.educationBasicIndex * 0.55 + city.educationHigherIndex * 0.45, 0, 1);
}

function getAverageEducationForBuilding(record, row, col) {
  if (!record) return 0;

  const basic = clamp(city.educationBasicIndex ?? 0, 0, 1);
  const higher = clamp(city.educationHigherIndex ?? 0, 0, 1);

  if (record.type === 'residential') {
    const cell = serviceMap[row]?.[col] ?? null;
    const localBasic = clamp((cell?.eduBasic ?? 0) * (isPolicyActive('educationReform') ? EDUCATION_POLICY_REFORM_MUL : 1), 0, 1);
    const localHigher = clamp((cell?.eduHigher ?? 0) + (isPolicyActive('scienceDevelopment') ? SCIENCE_DEVELOPMENT_HIGHER_BONUS : 0), 0, 1);
    return clamp(0.20 + localBasic * 0.55 + localHigher * 0.25, 0, 1);
  }

  if (record.type === 'commercial' || record.type === 'industrial') {
    return clamp(0.15 + basic * 0.45 + higher * 0.40, 0, 1);
  }

  return clamp(city.educationAverageLevel ?? 0, 0, 1);
}

function updateCrimeRateIndex() {
  const protectedRisk = isPolicyActive('publicSafety') ? 0.03 : 0.05;
  const unprotectedRisk = Math.max(0.35, 0.82 - (getDepartmentFunding('police') - 1) * 0.25);
  let riskSum = 0;
  let zonedCount = 0;

  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (zoneMap[r][c] === ZONE_NONE) continue;
      zonedCount++;
      riskSum += serviceMap[r]?.[c]?.police ? protectedRisk : unprotectedRisk;
    }
  }

  city.crimeRateIndex = zonedCount > 0 ? clamp(riskSum / zonedCount, 0, 1) : 0;
}

// ── Demand engine (Classic SimCity RCI model) ─────────────────────────────────

function updateDemand() {
  normalizeCityFinanceState();
  updateRuleOfLawIndex();
  const resCnt = Math.max(1, city.residentialCount);
  const comCnt = city.commercialCount;
  const indCnt = city.industrialCount;
  const total  = resCnt + comCnt + indCnt;

  const jobCapacity = comCnt * JOBS_PER_COM + indCnt * JOBS_PER_IND;
  const jobRatio    = clamp(jobCapacity / (resCnt * 4), 0, 1);

  const basicEdu = clamp(city.educationBasicIndex ?? 0, 0, 1);
  const higherEdu = clamp(city.educationHigherIndex ?? 0, 0, 1);
  const scienceShare = clamp(city.scienceIndustryShare ?? 0, 0, 1);
  const lawIndex = clamp(city.ruleOfLawIndex ?? 0, 0, 1);
  const hsiRatio = clamp(((city.stockMarket?.hsi ?? HSI_BASE_LEVEL) - HSI_BASE_LEVEL) / (HSI_BASE_LEVEL * 0.35), -1, 1);
  const stockExchangeBoost = hasBuildingType('stock_exchange') ? 0.08 : 0;
  const industrialPenaltyWeight = INDUSTRIAL_DEMAND_PENALTY_BASE
    - (INDUSTRIAL_DEMAND_PENALTY_BASE - INDUSTRIAL_DEMAND_PENALTY_MIN) * scienceShare;

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
  city.demandC = clamp(
    city.demandC
    + 0.08 * basicEdu
    + 0.22 * higherEdu
    + (isPolicyActive('educationReform') ? 0.05 : 0)
    + 0.10 * lawIndex
    + (hasBuildingType('stock_exchange') ? 0.10 * hsiRatio : 0)
    + (isPolicyActive('tourismPromotion') ? 0.04 : 0)
    + (isPolicyActive('foreignInvestmentIncentive') ? 0.05 : 0)
    + stockExchangeBoost,
    -1, 1
  );
  // Industrial: starts high, falls as city industrialises or pollutes too much.
  city.demandI = clamp(
    0.5 - (indCnt / total) * industrialPenaltyWeight + 0.2 * (1 - city.pollution / 100)
    - (isPolicyActive('cleanAir') ? 0.05 : 0)
    + 0.18 * basicEdu
    + (isPolicyActive('scienceDevelopment') ? 0.05 : 0),
    -1, 1
  );
}

// ── Zone growth / shrink ──────────────────────────────────────────────────────

function updatePopulationAndPollution() {
  normalizeCityFinanceState();
  city.population      = 0;
  city.residentialCount = 0;
  city.commercialCount = 0;
  city.industrialCount = 0;
  city.pollution       = 0;
  let industrialScienceCount = 0;

  Object.values(buildingData).forEach((rec) => {
    if (rec.type === 'residential') {
      city.residentialCount++;
      // Use stored population (accounts for multi-tile footprints) or fall back to level lookup
      city.population += rec.population ?? POP_PER_LEVEL[rec.level] ?? 0;
    } else if (rec.type === 'commercial') {
      city.commercialCount++;
    } else if (rec.type === 'industrial') {
      city.industrialCount++;
      const isSciencePark = isScienceParkIndustrialRecord(rec);
      if (isSciencePark) industrialScienceCount++;
      const baseIndustrialPollution = isSciencePark ? POLLUTION_SCIENCE_PARK_BUILDING : POLLUTION_IND_BUILDING;
      city.pollution += baseIndustrialPollution * (isPolicyActive('cleanAir') ? 0.70 : 1);
    } else if (rec.type === 'power_plant_coal') {
      city.pollution += POLLUTION_COAL_PLANT * (isPolicyActive('cleanAir') ? 0.70 : 1);
    } else if (rec.type === 'power_plant_solar') {
      city.pollution += 0;
    }
  });
  if (typeof getMatureTreeCount === 'function' && city.pollution > 0) {
    const treeReduction = Math.min(
      city.pollution * TREE_POLLUTION_REDUCTION_MAX_RATIO,
      getMatureTreeCount() * TREE_POLLUTION_REDUCTION_PER_MATURE_TREE,
    );
    city.pollution = Math.max(0, city.pollution - treeReduction);
  }
  city.pollution = Math.max(0, Number(city.pollution.toFixed(1)));
  city.scienceIndustryShare = city.industrialCount > 0
    ? clamp(industrialScienceCount / city.industrialCount, 0, 1)
    : 0;
  updateRuleOfLawIndex();
}

function updateRuleOfLawIndex() {
  const councilCount = countBuildingType('legislative_council');
  const stockExchangeCount = countBuildingType('stock_exchange');
  if (councilCount <= 0) {
    city.ruleOfLawIndex = 0;
    return city.ruleOfLawIndex;
  }

  const policyScore = (
    (isPolicyActive('districtCouncilElection') ? 1 : 0)
    + (isPolicyActive('icac') ? 1 : 0)
    + (isPolicyActive('legislativeCouncilElection') ? 1 : 0)
  ) / 3;
  const tradeScore = (
    (isPolicyActive('tourismPromotion') ? 1 : 0)
    + (isPolicyActive('foreignInvestmentIncentive') ? 1 : 0)
    + (isPolicyActive('stockExchangeAct') ? 1 : 0)
    + (stockExchangeCount > 0 ? 1 : 0)
  ) / 4;

  city.ruleOfLawIndex = clamp(0.12 + policyScore * 0.58 + tradeScore * 0.18 + Math.min(0.12, councilCount * 0.04), 0, 1);
  return city.ruleOfLawIndex;
}

// ── Economy (runs monthly) ────────────────────────────────────────────────────

function countBuildingType(type) {
  return Object.values(buildingData).filter((r) => r.type === type).length;
}

// ── Happiness & city rating ───────────────────────────────────────────────────

function computeHappiness(scene) {
  normalizeCityFinanceState();
  updateRuleOfLawIndex();
  let zoned = 0;
  let powered = 0;
  let fireCovered = 0;
  let policeCovered = 0;
  let residential = 0;
  let parkScore = 0;
  let treeScore = 0;
  let scenicScore = 0;

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
        if (typeof getTreeInfluenceValue === 'function') treeScore += getTreeInfluenceValue(r, c);
        if (typeof getScenicValue === 'function') scenicScore += getScenicValue(r, c);
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
  const treeRatio    = residential > 0 ? clamp(treeScore / residential, 0, 1) : 0;
  const scenicRatio  = residential > 0 ? clamp(scenicScore / residential, 0, 1) : 0;
  const taxPenalty   = Math.max(0, (city.taxRate - 0.09) * 3);
  const pollPenalty  = city.pollution / 200;
  const powerPenalty = Math.max(0, 1 - (city.powerRatio ?? 1)) * 0.22;
  const roadBonus = Math.min(0.08, (getDepartmentFunding('roads') - 1) * 0.08 + (isPolicyActive('roadRepair') ? 0.04 : 0));
  const policyBonus = (isPolicyActive('cleanAir') ? 0.03 : 0) + (isPolicyActive('publicSafety') ? 0.02 : 0);
  const lawBonus = Math.min(0.10, (city.ruleOfLawIndex ?? 0) * 0.10 + (hasBuildingType('stock_exchange') ? 0.02 : 0));

  city.happiness = clamp(
    0.2 + 0.42 * poweredRatio + 0.18 * fireRatio + 0.18 * policeRatio + 0.22 * parkRatio
      + TREE_HAPPINESS_BONUS_MAX * treeRatio
      + SCENIC_HAPPINESS_BONUS_MAX * scenicRatio
      + roadBonus + policyBonus + lawBonus - taxPenalty - pollPenalty - powerPenalty,
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
  // Road-accessible = any road tile within Chebyshev distance 3.
  // This allows development to sit up to three tiles away from a road.
  for (let dr = -3; dr <= 3; dr++) {
    for (let dc = -3; dc <= 3; dc++) {
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
