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

function updateStockMarketTick() {
  const market = city.stockMarket;
  if (!market || !Array.isArray(market.stocks) || market.stocks.length === 0) return;

  const clampOr = (value, min, max, fallback = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return clamp(numeric, min, max);
  };

  const happiness = clampOr(city.happiness, 0, 1, 0.5);
  const ruleOfLaw = clampOr(city.ruleOfLawIndex, 0, 1, 0.4);
  const demandC = clampOr(city.demandC, -1, 1, 0);
  const pollution = clampOr((Number(city.pollution ?? 0) / 120), 0, 1, 0);
  const policyTailwind = (isPolicyActive('stockExchangeAct') ? 0.002 : 0)
    + (isPolicyActive('foreignInvestmentIncentive') ? 0.0015 : 0)
    + (isPolicyActive('tourismPromotion') ? 0.001 : 0);

  const macroRaw = (demandC * 0.006) + ((happiness - 0.5) * 0.004) + ((ruleOfLaw - 0.4) * 0.003) - (pollution * 0.003) + policyTailwind;
  const macro = Number.isFinite(macroRaw) ? macroRaw : 0;

  market.stocks.forEach((stock) => {
    if (!stock.listed) return;
    const sensitivity = getStockSectorSensitivity(stock.sector);
    const volatility = getStockSectorVolatility(stock.sector);
    const noise = (Math.random() - 0.5) * (volatility * 2);
    const trend = macro * sensitivity;
    const tickChangeRaw = trend + noise;
    const tickChange = Number.isFinite(tickChangeRaw)
      ? clamp(tickChangeRaw, -volatility * 2.5, volatility * 2.7)
      : ((Math.random() - 0.5) * volatility);
    const prevPrice = Math.max(1, Number(stock.price ?? stock.basePrice ?? 1));
    const nextPriceRaw = prevPrice * (1 + tickChange);
    const nextPrice = Math.max(1, Number.isFinite(nextPriceRaw) ? nextPriceRaw : prevPrice);

    stock.prevPrice = prevPrice;
    stock.price = Number(nextPrice.toFixed(2));
    stock.changePct = tickChange;
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

