function runEconomy(scene) {
  if (city.tick % TICKS_PER_MONTH !== 0) return;
  normalizeCityFinanceState();
  updateScienceParkUnlockState();
  const convertedScienceParks = convertEligibleIndustrialToScienceParks(scene);
  if (convertedScienceParks > 0) {
    updatePopulationAndPollution();
    computeHappiness(scene);
    updateDemand();
  }
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

  recordCityMetricHistory();
}

function getStockSectorSensitivity(sector) {
  const table = {
    地產: 0.85,
    消費: 0.75,
    科技: 1.00,
    公用: 0.35,
    教育: 0.60,
    金融: 0.90,
    能源: 0.70,
    新能源: 0.82,
    交通: 0.65,
    文娛: 0.68,
    文旅: 0.62,
    醫療: 0.58,
    工業: 0.72,
    通訊: 0.55,
  };
  return table[sector] ?? 0.60;
}

function getStockSectorVolatility(sector) {
  const table = {
    科技: 0.020,
    文娛: 0.018,
    文旅: 0.015,
    消費: 0.013,
    工業: 0.012,
    地產: 0.011,
    金融: 0.010,
    交通: 0.009,
    能源: 0.010,
    新能源: 0.016,
    醫療: 0.009,
    通訊: 0.008,
    公用: 0.006,
    教育: 0.010,
  };
  return table[sector] ?? 0.010;
}

function pickRandomStocks(pool, count) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, count));
}

function refreshStockListings(force = false) {
  const market = city.stockMarket;
  if (!market || !Array.isArray(market.stocks) || market.stocks.length === 0) return;

  const shouldRotate = force || (city.tick % TICKS_PER_MONTH === 0 && market.lastRotationTick !== city.tick);
  if (!shouldRotate) return;

  const nonHsiListed = market.stocks.filter((stock) => !stock.isHSI && stock.listed);
  const unlisted = market.stocks.filter((stock) => !stock.isHSI && !stock.listed);
  const rotateCount = Math.min(STOCK_LISTING_ROTATE_COUNT, nonHsiListed.length, unlisted.length);
  if (rotateCount <= 0) {
    market.lastRotationTick = city.tick;
    return;
  }

  const delistTargets = [...nonHsiListed]
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
    .slice(0, rotateCount);
  const addTargets = pickRandomStocks(unlisted, rotateCount);

  delistTargets.forEach((stock) => { stock.listed = false; });
  addTargets.forEach((stock) => {
    stock.listed = true;
    stock.prevPrice = stock.price;
    stock.changePct = 0;
  });

  market.lastRotationTick = city.tick;
}

function annualToMonthlyReturn(annualReturn) {
  const safeAnnual = clamp(Number(annualReturn) || 0, -0.85, 1.2);
  return Math.pow(1 + safeAnnual, 1 / 12) - 1;
}

function monthlyToTickReturn(monthlyReturn) {
  const safeMonthly = clamp(Number(monthlyReturn) || 0, -0.75, 0.75);
  const ticks = Math.max(1, Number(TICKS_PER_MONTH) || 1);
  return Math.pow(1 + safeMonthly, 1 / ticks) - 1;
}

function monthlyDecayToTickDecay(monthlyDecay) {
  const safeDecay = clamp(Number(monthlyDecay) || 0, 0, 0.999);
  const ticks = Math.max(1, Number(TICKS_PER_MONTH) || 1);
  return Math.pow(safeDecay, 1 / ticks);
}

function getCityStockGrowthPremiumAnnual() {
  const clampOr = (value, min, max, fallback = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return clamp(numeric, min, max);
  };

  const happiness = clampOr(city.happiness, 0, 1, 0.5);
  const ruleOfLaw = clampOr(city.ruleOfLawIndex, 0, 1, 0.4);
  const demandC = clampOr(city.demandC, -1, 1, 0);
  const pollution = clampOr((Number(city.pollution ?? 0) / 150), 0, 1, 0);
  const net = Number(city.monthlyIncome ?? 0) - Number(city.monthlyExpenses ?? 0);
  const treasuryScore = clamp(net / 22000, -1, 1);

  const rawStrength =
    demandC * 0.34
    + (happiness - 0.5) * 0.36
    + (ruleOfLaw - 0.45) * 0.26
    + treasuryScore * 0.20
    - pollution * 0.28;

  const normalizedStrength = clamp(rawStrength, -1, 1);
  return normalizedStrength * STOCK_CITY_PREMIUM_ANNUAL_MAX;
}

function pickNextStockMarketRegime(currentRegime = 'range') {
  const transition = STOCK_MARKET_REGIME_TRANSITION[currentRegime] ?? STOCK_MARKET_REGIME_TRANSITION.range;
  const roll = Math.random();
  let acc = 0;
  for (const regime of ['bull', 'range', 'bear']) {
    acc += Number(transition?.[regime] ?? 0);
    if (roll <= acc) return regime;
  }
  return 'range';
}

function getRegimeDurationMonths(regime = 'range') {
  const range = STOCK_MARKET_REGIME_DURATION_MONTHS[regime] ?? STOCK_MARKET_REGIME_DURATION_MONTHS.range;
  const min = Math.max(1, Math.floor(range?.[0] ?? 3));
  const max = Math.max(min, Math.floor(range?.[1] ?? min));
  return min + Math.floor(Math.random() * (max - min + 1));
}

function refreshStockMarketRegime() {
  const market = city.stockMarket;
  if (!market) return;

  if (!['bull', 'range', 'bear'].includes(market.regime)) {
    market.regime = 'range';
  }
  if (!Number.isFinite(Number(market.regimeMonthsLeft)) || market.regimeMonthsLeft <= 0) {
    market.regimeMonthsLeft = getRegimeDurationMonths(market.regime);
    return;
  }

  if (city.tick % TICKS_PER_MONTH !== 0) return;

  market.regimeMonthsLeft = Math.max(0, market.regimeMonthsLeft - 1);
  if (market.regimeMonthsLeft <= 0) {
    market.regime = pickNextStockMarketRegime(market.regime);
    market.regimeMonthsLeft = getRegimeDurationMonths(market.regime);
  }
}

function updateStockMarketTick() {
  const market = city.stockMarket;
  if (!market || !Array.isArray(market.stocks) || market.stocks.length === 0) return;

  const clampOr = (value, min, max, fallback = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return clamp(numeric, min, max);
  };

  refreshStockMarketRegime();

  const regime = ['bull', 'range', 'bear'].includes(market.regime) ? market.regime : 'range';
  const regimeAnnualDrift = STOCK_MARKET_REGIME_ANNUAL_DRIFT[regime] ?? STOCK_MARKET_REGIME_ANNUAL_DRIFT.range;
  const regimeVolMultiplier = STOCK_MARKET_REGIME_VOL_MULTIPLIER[regime] ?? STOCK_MARKET_REGIME_VOL_MULTIPLIER.range;
  const ticksPerMonth = Math.max(1, Number(TICKS_PER_MONTH) || 1);
  const tickVolScale = 1 / Math.sqrt(ticksPerMonth);
  const tickShockDecay = monthlyDecayToTickDecay(STOCK_IDIO_SHOCK_DECAY);
  const cityPremiumAnnual = getCityStockGrowthPremiumAnnual();
  const policyPremiumAnnual =
    (isPolicyActive('stockExchangeAct') ? 0.006 : 0)
    + (isPolicyActive('foreignInvestmentIncentive') ? 0.004 : 0)
    + (isPolicyActive('tourismPromotion') ? 0.002 : 0);
  const fairGrowthMonthly = annualToMonthlyReturn(HSI_ANNUAL_BASE_RETURN + cityPremiumAnnual * 0.7);
  const fairGrowthTick = monthlyToTickReturn(fairGrowthMonthly);

  market.stocks.forEach((stock) => {
    if (!stock.listed) return;
    const sensitivity = getStockSectorSensitivity(stock.sector);
    const volatility = getStockSectorVolatility(stock.sector);
    const prevPrice = Math.max(1, Number(stock.price ?? stock.basePrice ?? 1));

    const fairValue = Math.max(1, Number(stock.fairValue ?? prevPrice));
    const nextFairValue = Math.max(1, fairValue * (1 + fairGrowthTick));
    stock.fairValue = Number(nextFairValue.toFixed(4));

    const stockDriftAnnual = regimeAnnualDrift + (cityPremiumAnnual + policyPremiumAnnual) * sensitivity;
    const stockDriftMonthly = annualToMonthlyReturn(stockDriftAnnual);
    const stockDriftTick = monthlyToTickReturn(stockDriftMonthly);
    const valuationGap = (prevPrice - nextFairValue) / nextFairValue;
    const meanReversion = -valuationGap * (STOCK_MARKET_MEAN_REVERSION / ticksPerMonth) * (stock.isHSI ? 1.12 : 1);

    const prevIdioShock = clampOr(stock.idioShock, -0.5, 0.5, 0);
    const shockKick = ((Math.random() - 0.5) * 2) * volatility * STOCK_IDIO_SHOCK_SCALE * tickVolScale;
    const nextIdioShock = prevIdioShock * tickShockDecay + shockKick;
    stock.idioShock = clamp(nextIdioShock, -0.28, 0.28);

    const noise = ((Math.random() - 0.5) * 2) * volatility * regimeVolMultiplier * tickVolScale;
    const tickChangeRaw = stockDriftTick + meanReversion + stock.idioShock + noise;
    const tickChange = Number.isFinite(tickChangeRaw)
      ? clamp(tickChangeRaw, -volatility * 3.5 * regimeVolMultiplier, volatility * 3.3 * regimeVolMultiplier)
      : ((Math.random() - 0.5) * volatility);

    const nextPriceRaw = prevPrice * (1 + tickChange);
    const nextPrice = Math.max(1, Number.isFinite(nextPriceRaw) ? nextPriceRaw : prevPrice);

    stock.prevPrice = prevPrice;
    stock.price = Number(nextPrice.toFixed(2));
    stock.changePct = (stock.price - prevPrice) / prevPrice;
    if (!Array.isArray(stock.history)) stock.history = [stock.prevPrice];
    stock.history.push(stock.price);
    if (stock.history.length > 32) stock.history.shift();
  });

  const componentStocks = market.stocks.filter((stock) => stock.isHSI && stock.listed);
  if (componentStocks.length > 0) {
    const currentCap = componentStocks.reduce((sum, stock) => {
      const shares = Math.max(1, Number(stock.sharesOutstanding ?? 1));
      return sum + Math.max(1, Number(stock.price ?? 1)) * shares;
    }, 0);
    const baseCap = componentStocks.reduce((sum, stock) => {
      const shares = Math.max(1, Number(stock.sharesOutstanding ?? 1));
      return sum + Math.max(1, Number(stock.basePrice ?? stock.price ?? 1)) * shares;
    }, 0);
    market.prevHsi = Number.isFinite(market.hsi) ? market.hsi : HSI_BASE_LEVEL;
    market.hsi = baseCap > 0
      ? Math.round(HSI_BASE_LEVEL * (currentCap / baseCap))
      : HSI_BASE_LEVEL;
  }

  refreshStockListings(false);
}

function recordCityMetricHistory() {
  const label = `${city.year}-${String(city.month).padStart(2, '0')}`;
  const pushPoint = (arr, value) => {
    if (!Array.isArray(arr)) return;
    if (arr.length && arr[arr.length - 1]?.label === label) {
      arr[arr.length - 1].value = value;
      return;
    }
    arr.push({ label, value });
    if (arr.length > 120) arr.shift();
  };

  let avgLandValue = 0;
  if (typeof computeLandValueMap === 'function') {
    avgLandValue = computeAverageLandValueFromMap(computeLandValueMap());
  }

  pushPoint(city.educationHistory, clamp(city.educationAverageLevel ?? 0, 0, 1));
  pushPoint(city.crimeHistory, clamp(city.crimeRateIndex ?? 0, 0, 1));
  pushPoint(city.governmentIncomeHistory, Number(city.monthlyIncome ?? 0));
  pushPoint(city.happinessHistory, clamp(city.happiness ?? 0, 0, 1));
  pushPoint(city.landValueHistory, clamp(avgLandValue, 0, 1));
  pushPoint(city.pollutionHistory, Number(city.pollution ?? 0));
  pushPoint(city.hsiHistory, Number(city.stockMarket?.hsi ?? HSI_BASE_LEVEL));
}

function computeAverageLandValueFromMap(landValueMap) {
  if (!Array.isArray(landValueMap)) return 0;
  let sum = 0;
  let count = 0;
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (zoneMap[r][c] === ZONE_NONE) continue;
      const value = landValueMap[r]?.[c];
      if (!Number.isFinite(value)) continue;
      sum += value;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
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

