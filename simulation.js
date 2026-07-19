// ── Sim tick orchestrator ─────────────────────────────────────────────────────

const MODEL_VARIATION_USAGE_WEIGHT = 0.7;
const MODEL_VARIATION_RECENT_PENALTY = 0.18;
const MODEL_VARIATION_MIN_WEIGHT = 0.04;
const SIM_DEBUG_LOGGING = false;
const modelUsageCounts = new Map();
const modelRecentHistory = new Map();

function runSimTick(scene) {
  if (!scene) return;

  invalidateBuildingCountCache();
  updateWeatherSimulation();
  updateWeatherVisualOverlay(scene);

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
  updateTrafficMap();
  updateEducationLevels();
  updateCrimeRateIndex();
  updateHealthMetrics();
  computeHappiness(scene);
  if (typeof updateCityAttractivenessMetrics === 'function') updateCityAttractivenessMetrics();
  updateDemand();
  updateStockMarketTick();
  updateTrees(scene);
  updateCitizenActivitySimulation();
  if (typeof queueAiNewsGeneration === 'function') queueAiNewsGeneration();

  // Keep the expensive full-map diagnostics available for development without
  // charging every player for another zone/road scan once per game month.
  if (SIM_DEBUG_LOGGING && city.tick % TICKS_PER_MONTH === 0) {
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
  if (typeof updateCouncilTimedSystems === 'function') updateCouncilTimedSystems();
  refreshZoneOverlayTints(scene);
  // Invalidate before the HUD refresh so an open mini-map is recomputed once,
  // not once with stale data and then a second time immediately afterwards.
  if (typeof activeOverlay === 'string' && activeOverlay) {
    if (typeof invalidateOverlayCache === 'function') invalidateOverlayCache();
    else overlayCache = {};
  }
  updateHUD();
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
  // Unemployment amplifies crime risk in unpoliced areas (up to ×1.5 at full unemployment)
  const unemploymentCrimeMul = 1 + clamp(city.unemploymentRate ?? 0, 0, 1) * UNEMPLOYMENT_CRIME_AMPLIFY_MAX;
  const unprotectedRisk = Math.max(0.35, 0.82 - (getDepartmentFunding('police') - 1) * 0.25) * unemploymentCrimeMul;
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
  if (typeof getCouncilTemporaryModifier === 'function') {
    city.crimeRateIndex = clamp(city.crimeRateIndex + getCouncilTemporaryModifier('crime'), 0, 1);
  }
}

function updateHealthMetrics() {
  let weightedHealthSum = 0;
  let weightedCoverageSum = 0;
  let weightedPop = 0;
  const hospitalCount = countBuildingType('hospital');
  const capacity = hospitalCount * HOSPITAL_CAPACITY_PER_BUILDING;
  const pollutionSources = getHealthPollutionSources();

  Object.entries(buildingData).forEach(([id, record]) => {
    if (record.type !== 'residential') return;
    const pop = Math.max(0, Number(record.population ?? 0));
    if (pop <= 0) return;

    const [row, col] = id.split(':').map(Number);
    const localHealth = getLocalHealthScore(row, col, pollutionSources);
    const hospitalCoverage = clamp(serviceMap[row]?.[col]?.health ?? 0, 0, 1);

    weightedHealthSum += localHealth * pop;
    weightedCoverageSum += hospitalCoverage * pop;
    weightedPop += pop;
  });

  const targetHealth = weightedPop > 0 ? clamp(weightedHealthSum / weightedPop, 0, 1) : 0.5;
  const targetCoverage = weightedPop > 0 ? clamp(weightedCoverageSum / weightedPop, 0, 1) : 0;
  const smoothing = city.tick % TICKS_PER_MONTH === 0 || city.tick <= 1 ? 0.18 : 0.06;
  const medicalDemand = Math.round(weightedPop * (0.58 + (1 - targetHealth) * 0.40 + clamp(city.epidemicSeverity ?? 0, 0, 1) * 0.55));
  const utilization = capacity > 0 ? clamp(medicalDemand / capacity, 0, 1.35) : (weightedPop > 0 ? 1.35 : 0);

  city.healthIndex = clamp((city.healthIndex ?? 0.5) + smoothing * (targetHealth - (city.healthIndex ?? 0.5)), 0, 1);
  city.hospitalCoverageRate = clamp(targetCoverage, 0, 1);
  city.hospitalCapacity = capacity;
  city.hospitalUtilization = utilization;
  updateEpidemicState(targetHealth, targetCoverage, utilization, weightedPop);
  city.lifeExpectancy = Math.round((62 + city.healthIndex * 24 - clamp(city.epidemicSeverity ?? 0, 0, 1) * 7) * 10) / 10;
}

function getLocalHealthScore(row, col, pollutionSources = null) {
  const svc = serviceMap[row]?.[col] ?? null;
  const hospital = clamp(svc?.health ?? 0, 0, 1);
  const pollutionPressure = getLocalHealthPollutionPressure(row, col, pollutionSources);
  const recreation = clamp(
    Math.min(svc?.park ?? 0, 2) / 2
    + Math.min((svc?.sportsGround ?? 0) * 0.35, 0.35),
    0,
    1,
  );
  const power = powerMap[row]?.[col] ? clamp(city.powerRatio ?? 1, 0, 1) : 0.15;
  const safety = ((svc?.fire ? 1 : 0) + (svc?.police ? 1 : 0)) / 2;
  const education = clamp(city.educationAverageLevel ?? 0, 0, 1);
  const capacityPenalty = Math.max(0, clamp(city.hospitalUtilization ?? 0, 0, 1.35) - 0.88) * 0.22;
  const epidemicPenalty = clamp(city.epidemicSeverity ?? 0, 0, 1) * 0.22;
  const policyHealthBonus =
    (isPolicyActive('smokingBan') ? HEALTH_SMOKING_BAN_BONUS : 0)
    + (isPolicyActive('schoolHealthProgram') ? HEALTH_SCHOOL_PROGRAM_BONUS * (0.35 + education * 0.65) : 0);

  return clamp(
    0.18
    + hospital * 0.45
    + (1 - pollutionPressure) * 0.22
    + recreation * 0.10
    + power * 0.07
    + safety * 0.05
    + education * 0.03
    + policyHealthBonus
    - capacityPenalty
    - epidemicPenalty,
    0,
    1,
  );
}

function updateEpidemicState(targetHealth, targetCoverage, utilization, weightedPop) {
  const popPressure = clamp((weightedPop - 3000) / 45000, 0, 1);
  const pollutionPressure = clamp((city.pollution ?? 0) / 160, 0, 1);
  const capacityPressure = clamp((utilization - 0.72) / 0.58, 0, 1);
  const coverageGap = 1 - clamp(targetCoverage, 0, 1);
  const healthGap = 1 - clamp(targetHealth, 0, 1);
  const policyProtection =
    (isPolicyActive('smokingBan') ? 0.16 : 0)
    + (isPolicyActive('schoolHealthProgram') ? 0.12 : 0)
    + (isPolicyActive('cleanAir') ? 0.08 : 0);

  const risk = clamp(
    0.04
    + popPressure * 0.22
    + pollutionPressure * 0.20
    + capacityPressure * 0.24
    + coverageGap * 0.18
    + healthGap * 0.18
    - policyProtection,
    0,
    1,
  );
  city.epidemicRisk = clamp((city.epidemicRisk ?? 0) + 0.18 * (risk - (city.epidemicRisk ?? 0)), 0, 1);

  if (city.tick % TICKS_PER_MONTH !== 0) return;

  const currentSeverity = clamp(city.epidemicSeverity ?? 0, 0, 1);
  const monthsLeft = Math.max(0, Math.floor(city.epidemicMonthsLeft ?? 0));
  if (monthsLeft > 0 || currentSeverity > 0.01) {
    const treatment = clamp(targetCoverage * 0.30 + (1 - capacityPressure) * 0.28 + targetHealth * 0.24 + policyProtection, 0, 0.82);
    const nextSeverity = clamp(currentSeverity + risk * 0.08 - EPIDEMIC_RECOVERY_RATE * treatment, 0, 1);
    city.epidemicSeverity = nextSeverity;
    city.epidemicMonthsLeft = nextSeverity > 0.03 ? Math.max(0, monthsLeft - 1) : 0;
    return;
  }

  const triggerChance = clamp(EPIDEMIC_MONTHLY_TRIGGER_BASE + city.epidemicRisk * 0.085, 0, 0.18);
  if (weightedPop >= 3000 && Math.random() < triggerChance) {
    city.epidemicSeverity = clamp(0.18 + city.epidemicRisk * 0.32, 0, 0.72);
    city.epidemicMonthsLeft = 3 + Math.floor(Math.random() * 4);
    if (typeof showToast === 'function') showToast(t('toast.epidemicOutbreak'), 'warning');
  } else {
    city.epidemicSeverity = 0;
    city.epidemicMonthsLeft = 0;
  }
}

function getHealthPollutionSources() {
  const sources = [];
  Object.entries(buildingData).forEach(([id, record]) => {
    let radius = 0;
    let strength = 0;

    if (record.type === 'industrial') {
      radius = 10;
      strength = isScienceParkIndustrialRecord(record) ? 0.12 : 0.28;
    } else {
      const stats = POWER_PLANT_STATS[record.type];
      if (!stats) return;
      radius = stats.pollutionRadius ?? 12;
      strength = stats.pollutionStrength ?? 0.5;
    }

    const separator = id.indexOf(':');
    const sourceRow = Number(id.slice(0, separator));
    const sourceCol = Number(id.slice(separator + 1));
    sources.push({ row: sourceRow, col: sourceCol, radius, strength });
  });
  return sources;
}

function getLocalHealthPollutionPressure(row, col, pollutionSources = null) {
  let pressure = 0;
  const pollutionMul = (isPolicyActive('cleanAir') ? 0.70 : 1) * (isPolicyActive('smokingBan') ? 0.92 : 1);

  const sources = pollutionSources ?? getHealthPollutionSources();
  sources.forEach((source) => {
    const dist = Math.hypot(row - source.row, col - source.col);
    const { radius, strength } = source;
    if (dist > radius) return;
    pressure += strength * pollutionMul * (1 - dist / Math.max(1, radius));
  });

  if (typeof getTreeInfluenceValue === 'function') {
    pressure -= getTreeInfluenceValue(row, col) * 0.10;
  }

  return clamp(pressure, 0, 1);
}

// ── Demand engine ─────────────────────────────────────────────────────────────

function updateDemand() {
  normalizeCityFinanceState();
  updateRuleOfLawIndex();
  const resCnt    = Math.max(1, city.residentialCount);
  const comCnt    = city.commercialCount;
  const indCnt    = city.industrialCount;
  const total     = resCnt + comCnt + indCnt;
  const pop       = city.population;

  const basicEdu   = clamp(city.educationBasicIndex ?? 0, 0, 1);
  const higherEdu  = clamp(city.educationHigherIndex ?? 0, 0, 1);
  const scienceShare = clamp(city.scienceIndustryShare ?? 0, 0, 1);
  const lawIndex   = clamp(city.ruleOfLawIndex ?? 0, 0, 1);
  const hsiRatio   = clamp(((city.stockMarket?.hsi ?? HSI_BASE_LEVEL) - HSI_BASE_LEVEL) / (HSI_BASE_LEVEL * 0.35), -1, 1);
  const stockExchangeBoost = hasBuildingType('stock_exchange') ? 0.08 : 0;

  // ── Labour market ─────────────────────────────────────────────────────────
  // Job capacity scales with building footprint so merged 2x2/3x3 buildings
  // keep the capacity represented by the smaller buildings they replaced.
  const labourForce       = pop * LABOUR_FORCE_RATIO;
  let comJobCap = 0;
  let sciParkJobCap = 0;
  let regularIndJobCap = 0;
  Object.values(buildingData).forEach((record) => {
    const jobs = getBuildingJobCapacity(record);
    if (record.type === 'commercial') {
      comJobCap += jobs;
    } else if (record.type === 'industrial') {
      if (isScienceParkIndustrialRecord(record)) sciParkJobCap += jobs;
      else regularIndJobCap += jobs;
    }
  });
  const totalJobCap       = comJobCap + sciParkJobCap + regularIndJobCap;

  // High-edu workers compete for commercial AND science-park slots
  const highEduWorkers = labourForce * higherEdu * HIGH_EDU_COM_PREFERENCE;
  const highEduJobCap  = comJobCap + sciParkJobCap;
  const highEduJobGap  = highEduWorkers - highEduJobCap;

  // Low-edu workers compete for traditional industrial slots
  const lowEduWorkers    = labourForce * (1 - higherEdu) * LOW_EDU_IND_PREFERENCE;
  const lowEduJobGap     = lowEduWorkers - regularIndJobCap;

  city.unemploymentRate = labourForce > 0
    ? clamp(1 - totalJobCap / labourForce, 0, 1)
    : 0;
  city.highEduUnemploymentRate = highEduWorkers > 0
    ? clamp(highEduJobGap / highEduWorkers, 0, 1)
    : 0;

  // Legacy jobRatio kept for demandR (unchanged behaviour)
  const legacyJobCap = (comJobCap + sciParkJobCap + regularIndJobCap) / ANCHOR_RATIO;
  const jobRatio     = clamp(legacyJobCap / (resCnt * 4), 0, 1);

  // ── demandR ───────────────────────────────────────────────────────────────
  // Employment pull: surplus jobs attract residents; high unemployment repels.
  const employmentPull    = clamp(totalJobCap / Math.max(labourForce, 1) - 0.7, -0.5, 0.5);
  const unemploymentPenR  = city.unemploymentRate * 0.20;
  const epidemicDemandPenalty = clamp(city.epidemicSeverity ?? 0, 0, 1);
  const healthCapacityPenalty = Math.max(0, clamp(city.hospitalUtilization ?? 0, 0, 1.35) - 1) * 0.12;
  // Traffic congestion reduces residential desirability; penalty is non-linear —
  // mild congestion (index < 0.4) has little effect, gridlock (> 0.7) is severe.
  const congestion = clamp(city.trafficIndex ?? 0, 0, 1);
  const congestionPenR = Math.max(0, congestion - 0.4) * 0.30;
  city.demandR = clamp(
    0.3 + 0.5 * Math.max(jobRatio, 0.5 + employmentPull)
    - unemploymentPenR + 0.1 * city.happiness
    + (isPolicyActive('greenParks') ? 0.04 : 0)
    + (isPolicyActive('roadRepair') ? 0.03 : 0)
    - epidemicDemandPenalty * 0.16
    - healthCapacityPenalty
    - congestionPenR
    - 0.2 * (city.taxRate / TAX_RATE_MAX),
    -1, 1
  );

  // ── demandC ───────────────────────────────────────────────────────────────
  // A) Consumer gap: do residents have enough shops?
  const consumerTerm = clamp((resCnt - comCnt * 1.5) / resCnt, -1, 1) * 0.30;
  // B) High-edu labour gap: educated workers who need commercial / science-park jobs.
  //    Science parks absorb some of these workers, naturally easing commercial pressure.
  const highEduLabourTerm = highEduWorkers > 0
    ? clamp(highEduJobGap / highEduWorkers, -1, 1) * 0.40
    : 0;
  // C) Population-scale consumer bonus: larger cities sustain richer commercial base.
  const popBonus = pop > 0 ? clamp(Math.log10(pop / 500 + 1) * 0.20, 0, 0.25) : 0;
  // D) Policy for smallBusiness boosts effective com job capacity
  const smallBizBoost = isPolicyActive('smallBusiness') ? 0.12 : 0;
  const foreignInvBoost = isPolicyActive('foreignInvestmentIncentive') ? 0.05 : 0;

  // Severe congestion reduces customer foot traffic for commercial zones
  const congestionPenC = Math.max(0, congestion - 0.6) * 0.18;
  city.demandC = clamp(
    consumerTerm + highEduLabourTerm + popBonus
    + 0.10 * city.happiness
    + 0.08 * basicEdu + 0.15 * higherEdu
    + 0.10 * lawIndex
    + smallBizBoost
    + (isPolicyActive('roadRepair') ? 0.04 : 0)
    + (isPolicyActive('educationReform') ? 0.05 : 0)
    + (isPolicyActive('tourismPromotion') ? 0.04 : 0)
    + foreignInvBoost
    + (isPolicyActive('elderlyTwoDollarFare') ? 0.035 : 0)
    + (isPolicyActive('arcticPenguinReserve') ? 0.018 : 0)
    + (typeof getCouncilTemporaryModifier === 'function' ? getCouncilTemporaryModifier('commercialDemand') : 0)
    + (hasBuildingType('stock_exchange') ? 0.10 * hsiRatio : 0)
    + stockExchangeBoost
    - epidemicDemandPenalty * 0.08
    - congestionPenC
    - 0.05,
    -1, 1
  );

  // ── demandI (dual-track) ──────────────────────────────────────────────────
  // Traditional track: driven by low-edu labour surplus.
  const regularIndCnt = indCnt * (1 - scienceShare);
  const regularIndLabourTerm = lowEduWorkers > 0
    ? clamp(lowEduJobGap / lowEduWorkers, -1, 1) * 0.55
    : 0;
  const regularIndBase = 0.30 - clamp((regularIndCnt / Math.max(total, 1)) * 1.5, 0, 0.40);

  // Science-park track: driven by high-edu workers who cannot find commercial jobs.
  //   Higher scienceShare means industrial sector can absorb educated workers.
  const sciParkLabourTerm = highEduWorkers > 0
    ? clamp(highEduJobGap / highEduWorkers, -1, 1) * 0.60
    : 0;

  const pollutionPenalty = clamp(city.pollution / 200, 0, 0.30);

  city.demandI = clamp(
    regularIndLabourTerm * (1 - scienceShare) * 0.6
    + regularIndBase    * (1 - scienceShare)
    + sciParkLabourTerm * scienceShare * 0.8
    + 0.18 * basicEdu
    - pollutionPenalty
    - (isPolicyActive('cleanAir') ? 0.05 : 0)
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
    } else if (rec.type === 'power_plant_nuclear') {
      city.pollution += POLLUTION_NUCLEAR_PLANT;
    }
  });
  if (typeof getMatureTreeCount === 'function' && city.pollution > 0) {
    const treeReduction = Math.min(
      city.pollution * TREE_POLLUTION_REDUCTION_MAX_RATIO,
      getMatureTreeCount() * TREE_POLLUTION_REDUCTION_PER_MATURE_TREE,
    );
    city.pollution = Math.max(0, city.pollution - treeReduction);
  }
  if (typeof getWeatherPollutionMultiplier === 'function') {
    city.pollution *= getWeatherPollutionMultiplier();
  }
  if (isPolicyActive('arcticPenguinReserve')) city.pollution += 1.5;
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

  const ridiculePenalty = Math.max(0, Number(city.cityRidicule || 0) - 60) * 0.0015;
  city.ruleOfLawIndex = clamp(0.12 + policyScore * 0.58 + tradeScore * 0.18 + Math.min(0.12, councilCount * 0.04) - ridiculePenalty, 0, 1);
  return city.ruleOfLawIndex;
}

// ── Economy (runs monthly) ────────────────────────────────────────────────────

function countBuildingType(type) {
  return getBuildingCount(type);
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
        // Sports grounds contribute an additional recreation bonus (up to +0.5 park-equivalent)
        parkScore += Math.min((serviceMap[r]?.[c]?.sportsGround ?? 0) * 0.5, 1);
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
  const policyBonus = (isPolicyActive('cleanAir') ? 0.03 : 0)
    + (isPolicyActive('publicSafety') ? 0.02 : 0)
    + (isPolicyActive('elderlyTwoDollarFare') ? 0.025 : 0)
    + (isPolicyActive('arcticPenguinReserve') ? 0.008 : 0)
    - (isPolicyActive('busSeatbeltMandate') ? 0.012 : 0);
  const lawBonus = Math.min(0.10, (city.ruleOfLawIndex ?? 0) * 0.10 + (hasBuildingType('stock_exchange') ? 0.02 : 0));
  const healthBonus = (clamp(city.healthIndex ?? 0.5, 0, 1) - 0.5) * 0.08;
  const epidemicHappinessPenalty = clamp(city.epidemicSeverity ?? 0, 0, 1) * 0.16;
  const ridicule = clamp(Number(city.cityRidicule || 0), 0, 100);
  const ridiculeMemeBonus = ridicule <= 55 ? Math.min(0.035, ridicule * 0.0007) : 0.035;
  const ridiculeReputationPenalty = Math.max(0, ridicule - 70) * 0.0018;

  const unemploymentHappinessPenalty = clamp(city.unemploymentRate ?? 0, 0, 1) * UNEMPLOYMENT_HAPPINESS_PENALTY;
  const landmarkHappinessBonus = typeof sumSpecialBuildingEffect === 'function' ? sumSpecialBuildingEffect('happinessBonus') : 0;
  city.happiness = clamp(
    0.2 + 0.42 * poweredRatio + 0.18 * fireRatio + 0.18 * policeRatio + 0.22 * parkRatio
      + TREE_HAPPINESS_BONUS_MAX * treeRatio
      + SCENIC_HAPPINESS_BONUS_MAX * scenicRatio
      + roadBonus + policyBonus + lawBonus + healthBonus + landmarkHappinessBonus
      + (typeof getCouncilTemporaryModifier === 'function' ? getCouncilTemporaryModifier('happiness') : 0)
      + ridiculeMemeBonus
      - taxPenalty - pollPenalty - powerPenalty - unemploymentHappinessPenalty - epidemicHappinessPenalty
      - ridiculeReputationPenalty,
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
