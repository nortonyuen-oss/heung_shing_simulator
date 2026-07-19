// Parallel map layers — initialized in resetGameState(), called from create()
let zoneMap         = [];   // ZONE_NONE | ZONE_RES | ZONE_COM | ZONE_IND per cell
let zoneDensityMap  = [];   // DENSITY_LOW | DENSITY_MED | DENSITY_HIGH per cell
let heightMap       = [];   // 0 = sea/flat, each +1 step is 100m altitude
let bridgeMap       = [];   // null | 'deck:row' | 'deck:col' | 'ramp:n/e/s/w'
let roadUnderlayMap = [];   // original terrain below bridge road tiles
let powerMap        = [];   // boolean per cell (is this cell powered?)
let serviceMap      = [];   // { fire: bool, police: bool, park: 0|1|2 } | null per cell
let treeMap         = [];   // null | { species, age, variant } per cell
let trafficMap      = [];   // 0–1 traffic load per road tile (updated each sim tick)

// Simulation metadata for every placed building (player-placed or sim-spawned)
// Keyed by getTileId(anchorRow, anchorCol)
const buildingData = {};

// Infrastructure state
let powerSources  = new Set();  // tile IDs of power plant anchor tiles
let powerLineSet  = new Set();  // tile IDs of placed power line tiles
let roadTileCount = 0;          // maintained by setTileType()

function createDefaultStockMarketState() {
  let listedNonHsi = 0;
  const stocks = STOCK_MARKET_CATALOG.map((entry, index) => {
    const basePrice = 42 + index * 6;
    const isHSI = HSI_COMPONENT_SYMBOLS.includes(entry.symbol);
    const sharesOutstanding = Number.isFinite(entry.sharesOutstanding)
      ? Math.max(1, Number(entry.sharesOutstanding))
      : (120 + index * 9);
    let listed = isHSI;
    if (!listed && listedNonHsi < (STOCK_LISTING_COUNT - HSI_COMPONENT_SYMBOLS.length)) {
      listed = true;
      listedNonHsi++;
    }
    return {
      symbol: entry.symbol,
      name: entry.name,
      sector: entry.sector,
      basePrice,
      price: basePrice,
      prevPrice: basePrice,
      changePct: 0,
      sharesOutstanding,
      history: [basePrice],
      fairValue: basePrice,
      idioShock: 0,
      isHSI,
      listed,
    };
  });

  return {
    hsi: HSI_BASE_LEVEL,
    prevHsi: HSI_BASE_LEVEL,
    regime: 'range',
    regimeMonthsLeft: 0,
    lastRotationTick: 0,
    crash: {
      active: false,
      monthsLeft: 0,
      cooldownMonths: 0,
      severity: 0,
      openingHsi: HSI_BASE_LEVEL,
      closingHsi: HSI_BASE_LEVEL,
      startedYear: 0,
      startedMonth: 0,
      lastUpdateMonthIndex: -1,
      trigger: '',
      newsVariant: 0,
    },
    stocks,
  };
}

// City-wide simulation state
const city = {
  name: getDefaultCityName(),
  budget: STARTING_BUDGET,
  taxRate: 0.09,
  departmentBudgets: {
    roads: DEPARTMENT_BUDGET_DEFAULT,
    police: DEPARTMENT_BUDGET_DEFAULT,
    fire: DEPARTMENT_BUDGET_DEFAULT,
    parks: DEPARTMENT_BUDGET_DEFAULT,
  },
  activePolicies: {
    cleanAir: false,
    roadRepair: false,
    publicSafety: false,
    smallBusiness: false,
    greenParks: false,
    educationReform: false,
    scienceDevelopment: false,
    smokingBan: false,
    schoolHealthProgram: false,
    tourismPromotion: false,
    foreignInvestmentIncentive: false,
    districtCouncilElection: false,
    icac: false,
    legislativeCouncilElection: false,
    stockExchangeAct: false,
    elderlyTwoDollarFare: false,
    arcticPenguinReserve: false,
    busSeatbeltMandate: false,
  },
  council: createDefaultCouncilState(),
  loans: [],
  nextLoanId: 1,
  creditRating: 'A',
  lastPolicyCost: 0,
  lastLoanPayment: 0,
  lastBudgetSnapshot: null,
  autoReplacePowerPlants: false,
  monthlyIncome: 0,
  monthlyExpenses: 0,
  totalPowerSupply: 0,
  totalPowerDemand: 0,
  powerRatio: 1,
  population: 0,
  residentialCount: 0,
  commercialCount: 0,
  industrialCount: 0,
  demandR: 0.3,
  demandC: 0.3,
  demandI: 0.5,
  educationBasicIndex: 0,
  educationHigherIndex: 0,
  educationAverageLevel: 0,
  healthIndex: 0.5,
  lifeExpectancy: 70,
  hospitalCoverageRate: 0,
  hospitalCapacity: 0,
  hospitalUtilization: 0,
  epidemicRisk: 0,
  epidemicSeverity: 0,
  epidemicMonthsLeft: 0,
  scienceParkUnlocked: false,
  ruleOfLawIndex: 0,
  crimeRateIndex: 0,
  scienceIndustryShare: 0,
  unemploymentRate: 0,
  highEduUnemploymentRate: 0,
  stockMarket: createDefaultStockMarketState(),
  educationHistory: [],
  crimeHistory: [],
  governmentIncomeHistory: [],
  happinessHistory: [],
  landValueHistory: [],
  pollutionHistory: [],
  hsiHistory: [],
  unemploymentHistory: [],
  healthHistory: [],
  lifeExpectancyHistory: [],
  epidemicHistory: [],
  hospitalUtilizationHistory: [],
  cityAttractivenessHistory: [],
  cityRidiculeHistory: [],
  tourismAppealHistory: [],
  happiness: 0.5,
  pollution: 0,
  cityAttractiveness: 50,
  cityRidicule: 0,
  tourismAppeal: 40,
  monthlyVisitors: 0,
  tourismRevenue: 0,
  temporaryEffects: [],
  trafficIndex: 0,        // 0–1 city-wide congestion pressure (0 = free-flow, 1 = gridlock)
  trafficCoverage: 0,     // fraction of zoned tiles within road reach
  weather: {
    condition: 'clear',
    temperatureC: 24,
    humidityPct: 60,
    rainfallMm: 0,
    rainWarning: 'none',
    windKph: 10,
    conditionTicksLeft: 1,
    typhoonStage: 'none',
    typhoonActive: false,
    typhoonName: '',
    typhoonPeakWindKph: 0,
    typhoonDurationTicks: 0,
    typhoonTicksElapsed: 0,
    typhoonWindKph: 0,
    typhoonNameIndex: 0,
    signal8ReachedThisStorm: false,
  },
  citizenActivityDigest: null,
  showDistrictSigns: true,
  districtSigns: [],
  aiNews: {
    headline: '',
    model: '',
    provider: '',
    language: '',
    generatedAtTick: -1,
    lastRequestKey: '',
    pendingDisplay: false,
    history: [],
  },
  forumPosts: [],
  lastForumMonthIndex: -1,
  acknowledgedLandmarkUnlocks: [],
  landmarkRevenue: 0,
  landmarkUpkeep: 0,
  tick: 0,
  day:   1,
  month: 1,
  year: 1900,
  isBankrupt: false,
};

function resetGameState() {
  zoneMap        = createFilledMap(ZONE_NONE);
  zoneDensityMap = createFilledMap(DENSITY_LOW);
  powerMap       = createFilledMap(false);
  serviceMap     = createFilledMap(null);
  treeMap        = createFilledMap(null);
  if (typeof invalidateTreeSimulationTiles === 'function') invalidateTreeSimulationTiles();
  bridgeMap      = createFilledMap(null);
  roadUnderlayMap = createFilledMap(null);
  trafficMap     = createFilledMap(0);

  Object.keys(buildingData).forEach((k) => delete buildingData[k]);
  powerSources.clear();
  powerLineSet.clear();
  roadTileCount = 0;
  if (typeof markTrafficNetworkDirty === 'function') markTrafficNetworkDirty();

  city.budget          = STARTING_BUDGET;
  city.taxRate         = 0.09;
  city.departmentBudgets = {
    roads: DEPARTMENT_BUDGET_DEFAULT,
    police: DEPARTMENT_BUDGET_DEFAULT,
    fire: DEPARTMENT_BUDGET_DEFAULT,
    parks: DEPARTMENT_BUDGET_DEFAULT,
  };
  city.activePolicies = {
    cleanAir: false,
    roadRepair: false,
    publicSafety: false,
    smallBusiness: false,
    greenParks: false,
    educationReform: false,
    scienceDevelopment: false,
    smokingBan: false,
    schoolHealthProgram: false,
    tourismPromotion: false,
    foreignInvestmentIncentive: false,
    districtCouncilElection: false,
    icac: false,
    legislativeCouncilElection: false,
    stockExchangeAct: false,
    elderlyTwoDollarFare: false,
    arcticPenguinReserve: false,
    busSeatbeltMandate: false,
  };
  city.council = createDefaultCouncilState(city.activePolicies);
  city.loans = [];
  city.nextLoanId = 1;
  city.creditRating = 'A';
  city.lastPolicyCost = 0;
  city.lastLoanPayment = 0;
  city.lastBudgetSnapshot = null;
  city.autoReplacePowerPlants = false;
  city.monthlyIncome   = 0;
  city.monthlyExpenses = 0;
  city.totalPowerSupply = 0;
  city.totalPowerDemand = 0;
  city.powerRatio      = 1;
  city.population      = 0;
  city.residentialCount = 0;
  city.commercialCount = 0;
  city.industrialCount = 0;
  city.demandR    = 0.3;
  city.demandC    = 0.3;
  city.demandI    = 0.5;
  city.educationBasicIndex = 0;
  city.educationHigherIndex = 0;
  city.educationAverageLevel = 0;
  city.healthIndex = 0.5;
  city.lifeExpectancy = 70;
  city.hospitalCoverageRate = 0;
  city.hospitalCapacity = 0;
  city.hospitalUtilization = 0;
  city.epidemicRisk = 0;
  city.epidemicSeverity = 0;
  city.epidemicMonthsLeft = 0;
  city.scienceParkUnlocked = false;
  city.ruleOfLawIndex = 0;
  city.crimeRateIndex = 0;
  city.scienceIndustryShare = 0;
  city.unemploymentRate = 0;
  city.highEduUnemploymentRate = 0;
  city.stockMarket = createDefaultStockMarketState();
  city.educationHistory = [];
  city.crimeHistory = [];
  city.governmentIncomeHistory = [];
  city.happinessHistory = [];
  city.landValueHistory = [];
  city.pollutionHistory = [];
  city.hsiHistory = [];
  city.unemploymentHistory = [];
  city.healthHistory = [];
  city.lifeExpectancyHistory = [];
  city.epidemicHistory = [];
  city.hospitalUtilizationHistory = [];
  city.cityAttractivenessHistory = [];
  city.cityRidiculeHistory = [];
  city.tourismAppealHistory = [];
  city.happiness  = 0.5;
  city.pollution  = 0;
  city.cityAttractiveness = 50;
  city.cityRidicule = 0;
  city.tourismAppeal = 40;
  city.monthlyVisitors = 0;
  city.tourismRevenue = 0;
  city.acknowledgedLandmarkUnlocks = [];
  city.landmarkRevenue = 0;
  city.landmarkUpkeep = 0;
  city.temporaryEffects = [];
  city.trafficIndex = 0;
  city.trafficCoverage = 0;
  city.weather = {
    condition: 'clear',
    temperatureC: 24,
    humidityPct: 60,
    rainfallMm: 0,
    rainWarning: 'none',
    windKph: 10,
    conditionTicksLeft: 1,
    typhoonStage: 'none',
    typhoonActive: false,
    typhoonName: '',
    typhoonPeakWindKph: 0,
    typhoonDurationTicks: 0,
    typhoonTicksElapsed: 0,
    typhoonWindKph: 0,
    typhoonNameIndex: 0,
    signal8ReachedThisStorm: false,
  };
  city.citizenActivityDigest = null;
  city.showDistrictSigns = true;
  city.districtSigns = [];
  city.aiNews = {
    headline: '',
    model: '',
    provider: '',
    language: '',
    generatedAtTick: -1,
    lastRequestKey: '',
    pendingDisplay: false,
    history: [],
  };
  city.forumPosts = [];
  city.lastForumMonthIndex = -1;
  if (typeof resetAiNewsRuntime === 'function') resetAiNewsRuntime();
  city.tick       = 0;
  city.day        = 1;
  city.month      = 1;
  city.year       = 1900;
  city.isBankrupt = false;
}

// Deep save migration used to rebuild the council, stock market, weather and
// forum tree on every call.  This function is also called by several hot paths
// during each simulation tick, so those rebuilds generated a large amount of
// garbage and invalidated live references held by asynchronous UI work.  A
// parsed save introduces fresh object references; runtime updates mutate or
// replace them with already-valid data.  Remember which references have been
// migrated so each tree is sanitized at most once.
const _normalizedCityStateObjects = new WeakSet();
const CITY_STATE_POLICY_IDS = Object.freeze([
  'cleanAir', 'roadRepair', 'publicSafety', 'smallBusiness', 'greenParks',
  'educationReform', 'scienceDevelopment', 'smokingBan', 'schoolHealthProgram',
  'tourismPromotion', 'foreignInvestmentIncentive', 'districtCouncilElection',
  'icac', 'legislativeCouncilElection', 'stockExchangeAct', 'elderlyTwoDollarFare',
  'arcticPenguinReserve', 'busSeatbeltMandate',
]);

function isNormalizedCityStateObject(value) {
  return !!value && typeof value === 'object' && _normalizedCityStateObjects.has(value);
}

function rememberNormalizedCityStateObject(value) {
  if (value && typeof value === 'object') _normalizedCityStateObjects.add(value);
  return value;
}

function normalizeForumImagePath(value) {
  const migrated = String(value || '')
    .replace(/^UI\/News\//, 'UI/news/')
    .replace(/\.png$/i, '.webp');
  return /^UI\/news\/[a-zA-Z0-9_.-]+\.webp$/.test(migrated) ? migrated : '';
}

function normalizeCityFinanceState() {
  const toFiniteOr = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const departmentBudgets = city.departmentBudgets && typeof city.departmentBudgets === 'object'
    ? city.departmentBudgets
    : {};
  departmentBudgets.roads = clampDepartmentBudget(departmentBudgets.roads);
  departmentBudgets.police = clampDepartmentBudget(departmentBudgets.police);
  departmentBudgets.fire = clampDepartmentBudget(departmentBudgets.fire);
  departmentBudgets.parks = clampDepartmentBudget(departmentBudgets.parks);
  city.departmentBudgets = departmentBudgets;

  const activePolicies = city.activePolicies && typeof city.activePolicies === 'object'
    ? city.activePolicies
    : {};
  CITY_STATE_POLICY_IDS.forEach((policyId) => { activePolicies[policyId] = !!activePolicies[policyId]; });
  city.activePolicies = activePolicies;

  if (!isNormalizedCityStateObject(city.council)) {
    city.council = rememberNormalizedCityStateObject(normalizeCouncilState(city.council, city.activePolicies));
  }
  if (!isNormalizedCityStateObject(city.loans)) {
    city.loans = rememberNormalizedCityStateObject(
      (Array.isArray(city.loans) ? city.loans : []).filter((loan) => loan && loan.balance > 0),
    );
    city.nextLoanId = Math.max(city.nextLoanId ?? 1, ...city.loans.map((loan) => Number(loan.id ?? 0) + 1), 1);
  }
  city.lastPolicyCost = city.lastPolicyCost ?? 0;
  city.lastLoanPayment = city.lastLoanPayment ?? 0;
  city.lastBudgetSnapshot = city.lastBudgetSnapshot ?? null;
  city.autoReplacePowerPlants = !!city.autoReplacePowerPlants;
  city.totalPowerSupply = toFiniteOr(city.totalPowerSupply, 0);
  city.totalPowerDemand = toFiniteOr(city.totalPowerDemand, 0);
  city.powerRatio = toFiniteOr(city.powerRatio, 1);
  city.educationBasicIndex = toFiniteOr(city.educationBasicIndex, 0);
  city.educationHigherIndex = toFiniteOr(city.educationHigherIndex, 0);
  city.educationAverageLevel = toFiniteOr(city.educationAverageLevel, 0);
  city.healthIndex = toFiniteOr(city.healthIndex, 0.5);
  city.lifeExpectancy = toFiniteOr(city.lifeExpectancy, 70);
  city.hospitalCoverageRate = toFiniteOr(city.hospitalCoverageRate, 0);
  city.hospitalCapacity = toFiniteOr(city.hospitalCapacity, 0);
  city.hospitalUtilization = toFiniteOr(city.hospitalUtilization, 0);
  city.epidemicRisk = toFiniteOr(city.epidemicRisk, 0);
  city.epidemicSeverity = toFiniteOr(city.epidemicSeverity, 0);
  city.epidemicMonthsLeft = Math.max(0, Math.floor(toFiniteOr(city.epidemicMonthsLeft, 0)));
  city.scienceParkUnlocked = !!city.scienceParkUnlocked;
  city.ruleOfLawIndex = toFiniteOr(city.ruleOfLawIndex, 0);
  city.crimeRateIndex = toFiniteOr(city.crimeRateIndex, 0);
  city.scienceIndustryShare = toFiniteOr(city.scienceIndustryShare, 0);
  if (!isNormalizedCityStateObject(city.stockMarket)) {
    if (!city.stockMarket || !Array.isArray(city.stockMarket.stocks)) {
      city.stockMarket = createDefaultStockMarketState();
    }

    const defaultStockMarket = createDefaultStockMarketState();
    const market = city.stockMarket;
    market.hsi = toFiniteOr(market.hsi, defaultStockMarket.hsi);
    market.prevHsi = toFiniteOr(market.prevHsi, defaultStockMarket.prevHsi);
    market.regime = ['bull', 'range', 'bear'].includes(market.regime) ? market.regime : defaultStockMarket.regime;
    market.regimeMonthsLeft = Math.max(0, Math.floor(toFiniteOr(market.regimeMonthsLeft, defaultStockMarket.regimeMonthsLeft)));
    market.lastRotationTick = toFiniteOr(market.lastRotationTick, 0);
    const defaultCrash = defaultStockMarket.crash ?? { startedYear: 0, startedMonth: 0 };
    const sourceCrash = market.crash && typeof market.crash === 'object' ? market.crash : {};
    market.crash = {
      active: !!sourceCrash.active,
      monthsLeft: Math.max(0, Math.floor(toFiniteOr(sourceCrash.monthsLeft, 0))),
      cooldownMonths: Math.max(0, Math.floor(toFiniteOr(sourceCrash.cooldownMonths, 0))),
      severity: Math.max(0, Math.min(0.50, toFiniteOr(sourceCrash.severity, 0))),
      openingHsi: Math.max(1, Math.round(toFiniteOr(sourceCrash.openingHsi, market.hsi))),
      closingHsi: Math.max(1, Math.round(toFiniteOr(sourceCrash.closingHsi, market.hsi))),
      startedYear: Math.max(0, Math.floor(toFiniteOr(sourceCrash.startedYear, defaultCrash.startedYear))),
      startedMonth: Math.max(0, Math.floor(toFiniteOr(sourceCrash.startedMonth, defaultCrash.startedMonth))),
      lastUpdateMonthIndex: Math.floor(toFiniteOr(sourceCrash.lastUpdateMonthIndex, -1)),
      trigger: ['epidemic', 'pollution', 'unemployment', 'fiscal', 'bear', 'market'].includes(sourceCrash.trigger)
        ? sourceCrash.trigger
        : '',
      newsVariant: Math.max(0, Math.floor(toFiniteOr(sourceCrash.newsVariant, 0))) % 5,
    };
    if (market.crash.monthsLeft <= 0) market.crash.active = false;

    const existingMap = new Map((Array.isArray(market.stocks) ? market.stocks : [])
      .filter((stock) => stock && stock.symbol)
      .map((stock) => [stock.symbol, stock]));

    let listedNonHsi = 0;
    const normalizedStocks = defaultStockMarket.stocks.map((stock) => {
      const existing = existingMap.get(stock.symbol);
      const source = existing ?? stock;
      const price = Math.max(1, toFiniteOr(source.price, stock.price));
      const prevPrice = Math.max(1, toFiniteOr(source.prevPrice, price));
      const history = Array.isArray(source.history)
        ? source.history.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0).slice(-32)
        : [];
      let listed = !!source.listed;
      if (stock.isHSI) listed = true;
      if (!stock.isHSI && listed) listedNonHsi++;
      return {
        ...stock,
        price,
        prevPrice,
        changePct: toFiniteOr(source.changePct, 0),
        sharesOutstanding: Math.max(1, toFiniteOr(source.sharesOutstanding, stock.sharesOutstanding)),
        history: history.length > 0 ? history : [price],
        fairValue: Math.max(1, toFiniteOr(source.fairValue, price)),
        idioShock: toFiniteOr(source.idioShock, 0),
        listed,
      };
    });

    market.stocks = normalizedStocks;
    const maxNonHsiListed = Math.max(0, STOCK_LISTING_COUNT - HSI_COMPONENT_SYMBOLS.length);
    if (listedNonHsi > maxNonHsiListed) {
      const overflow = listedNonHsi - maxNonHsiListed;
      let removed = 0;
      market.stocks.forEach((stock) => {
        if (removed >= overflow) return;
        if (stock.isHSI || !stock.listed) return;
        stock.listed = false;
        removed++;
      });
    } else if (listedNonHsi < maxNonHsiListed) {
      let needed = maxNonHsiListed - listedNonHsi;
      market.stocks.forEach((stock) => {
        if (needed <= 0) return;
        if (stock.isHSI || stock.listed) return;
        stock.listed = true;
        needed--;
      });
    }
    rememberNormalizedCityStateObject(market);
  }
  city.educationHistory = Array.isArray(city.educationHistory) ? city.educationHistory : [];
  city.crimeHistory = Array.isArray(city.crimeHistory) ? city.crimeHistory : [];
  city.governmentIncomeHistory = Array.isArray(city.governmentIncomeHistory) ? city.governmentIncomeHistory : [];
  city.happinessHistory = Array.isArray(city.happinessHistory) ? city.happinessHistory : [];
  city.landValueHistory = Array.isArray(city.landValueHistory) ? city.landValueHistory : [];
  city.pollutionHistory = Array.isArray(city.pollutionHistory) ? city.pollutionHistory : [];
  city.hsiHistory = Array.isArray(city.hsiHistory) ? city.hsiHistory : [];
  city.unemploymentHistory = Array.isArray(city.unemploymentHistory) ? city.unemploymentHistory : [];
  city.healthHistory = Array.isArray(city.healthHistory) ? city.healthHistory : [];
  city.lifeExpectancyHistory = Array.isArray(city.lifeExpectancyHistory) ? city.lifeExpectancyHistory : [];
  city.epidemicHistory = Array.isArray(city.epidemicHistory) ? city.epidemicHistory : [];
  city.hospitalUtilizationHistory = Array.isArray(city.hospitalUtilizationHistory) ? city.hospitalUtilizationHistory : [];
  city.cityAttractivenessHistory = Array.isArray(city.cityAttractivenessHistory) ? city.cityAttractivenessHistory : [];
  city.cityRidiculeHistory = Array.isArray(city.cityRidiculeHistory) ? city.cityRidiculeHistory : [];
  city.tourismAppealHistory = Array.isArray(city.tourismAppealHistory) ? city.tourismAppealHistory : [];
  city.cityAttractiveness = Math.max(0, Math.min(100, toFiniteOr(city.cityAttractiveness, 50)));
  city.cityRidicule = Math.max(0, Math.min(100, toFiniteOr(city.cityRidicule, 0)));
  city.tourismAppeal = Math.max(0, Math.min(100, toFiniteOr(city.tourismAppeal, 40)));
  city.monthlyVisitors = Math.max(0, Math.round(toFiniteOr(city.monthlyVisitors, 0)));
  city.tourismRevenue = Math.max(0, Math.round(toFiniteOr(city.tourismRevenue, 0)));
  city.acknowledgedLandmarkUnlocks = Array.isArray(city.acknowledgedLandmarkUnlocks) ? city.acknowledgedLandmarkUnlocks : [];
  city.landmarkRevenue = Math.max(0, Math.round(toFiniteOr(city.landmarkRevenue, 0)));
  city.landmarkUpkeep = Math.max(0, Math.round(toFiniteOr(city.landmarkUpkeep, 0)));
  if (!isNormalizedCityStateObject(city.temporaryEffects)) {
    city.temporaryEffects = rememberNormalizedCityStateObject(
      (Array.isArray(city.temporaryEffects) ? city.temporaryEffects : [])
        .filter((effect) => effect && typeof effect === 'object' && typeof effect.id === 'string')
        .slice(-40)
        .map((effect) => ({
          id: String(effect.id).slice(0, 100),
          sourceId: String(effect.sourceId ?? '').slice(0, 80),
          startMonthIndex: Math.max(0, Math.floor(toFiniteOr(effect.startMonthIndex, 0))),
          endMonthIndex: Math.max(0, Math.floor(toFiniteOr(effect.endMonthIndex, 0))),
          modifiers: effect.modifiers && typeof effect.modifiers === 'object' ? { ...effect.modifiers } : {},
          outcome: String(effect.outcome ?? 'success').slice(0, 40),
        })),
    );
  }
  city.unemploymentRate = toFiniteOr(city.unemploymentRate, 0);
  city.highEduUnemploymentRate = toFiniteOr(city.highEduUnemploymentRate, 0);
  city.trafficIndex    = toFiniteOr(city.trafficIndex, 0);
  city.trafficCoverage = toFiniteOr(city.trafficCoverage, 0);
  if (!isNormalizedCityStateObject(city.weather)) {
    const savedWeather = city.weather && typeof city.weather === 'object' ? city.weather : {};
    const validConditions = ['clear', 'cloudy', 'showers', 'heavyRain', 'hot', 'cool', 'windy'];
    const validTyphoonStages = ['none', 'signal1', 'signal3', 'signal8', 'signal9', 'signal10'];
    const validRainWarnings = ['none', 'amber', 'red', 'black'];
    const migratedTyphoonActive = validTyphoonStages.includes(savedWeather.typhoonStage)
      ? savedWeather.typhoonStage !== 'none'
      : false;
    city.weather = rememberNormalizedCityStateObject({
      condition: validConditions.includes(savedWeather.condition) ? savedWeather.condition : 'clear',
      temperatureC: toFiniteOr(savedWeather.temperatureC, 24),
      humidityPct: Math.max(0, Math.min(100, toFiniteOr(savedWeather.humidityPct, 60))),
      rainfallMm: Math.max(0, toFiniteOr(savedWeather.rainfallMm, 0)),
      rainWarning: validRainWarnings.includes(savedWeather.rainWarning) ? savedWeather.rainWarning : 'none',
      windKph: Math.max(0, toFiniteOr(savedWeather.windKph, 10)),
      conditionTicksLeft: Math.max(0, Math.floor(toFiniteOr(savedWeather.conditionTicksLeft, 1))),
      typhoonStage: validTyphoonStages.includes(savedWeather.typhoonStage) ? savedWeather.typhoonStage : 'none',
      typhoonActive: !!savedWeather.typhoonActive || migratedTyphoonActive,
      typhoonName: typeof savedWeather.typhoonName === 'string' ? savedWeather.typhoonName.slice(0, 40) : '',
      typhoonPeakWindKph: Math.max(0, toFiniteOr(savedWeather.typhoonPeakWindKph, 0)),
      typhoonDurationTicks: Math.max(0, Math.floor(toFiniteOr(savedWeather.typhoonDurationTicks, 0))),
      typhoonTicksElapsed: Math.max(0, Math.floor(toFiniteOr(savedWeather.typhoonTicksElapsed, 0))),
      typhoonWindKph: Math.max(0, toFiniteOr(savedWeather.typhoonWindKph, 0)),
      typhoonNameIndex: Math.max(0, Math.floor(toFiniteOr(savedWeather.typhoonNameIndex, 0))) % TYPHOON_NAMES.length,
      signal8ReachedThisStorm: !!savedWeather.signal8ReachedThisStorm,
    });
  }
  city.citizenActivityDigest = city.citizenActivityDigest
    && typeof city.citizenActivityDigest.key === 'string'
    ? city.citizenActivityDigest
    : null;
  city.showDistrictSigns = city.showDistrictSigns !== false;
  if (!isNormalizedCityStateObject(city.districtSigns)) {
    const seenDistrictSignIds = new Set();
    city.districtSigns = rememberNormalizedCityStateObject((Array.isArray(city.districtSigns) ? city.districtSigns : [])
      .slice(0, 16)
      .map((sign, index) => {
      const row = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(toFiniteOr(sign?.row, -1))));
      const col = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(toFiniteOr(sign?.col, -1))));
      const name = Array.from(String(sign?.name || '').trim()).slice(0, 30).join('');
      let id = String(sign?.id || `district-loaded-${index}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
      if (!id || seenDistrictSignIds.has(id)) id = `district-loaded-${index}`;
      seenDistrictSignIds.add(id);
      const englishName = Array.from(String(sign?.englishName || `District ${index + 1}`).replace(/\s+/g, ' ').trim()).slice(0, 48).join('');
      const radius = Math.max(12, Math.min(64, Math.floor(toFiniteOr(sign?.radius, 36))));
      const createdAtTick = Math.floor(toFiniteOr(sign?.createdAtTick, -1));

      // Reuse the existing object when nothing actually needed normalizing so
      // live references held elsewhere (e.g. a drawn sign sprite mid-edit)
      // don't get silently orphaned from the array that gets saved.
      if (
        sign && typeof sign === 'object'
        && sign.id === id && sign.name === name && sign.englishName === englishName
        && sign.row === row && sign.col === col && sign.radius === radius
        && sign.createdAtTick === createdAtTick
      ) {
        return sign;
      }
        return { id, name, englishName, row, col, radius, createdAtTick };
      })
      .filter((sign) => sign.name));
  }
  if (!isNormalizedCityStateObject(city.aiNews)) {
    const savedAiNews = city.aiNews && typeof city.aiNews === 'object' ? city.aiNews : {};
    city.aiNews = rememberNormalizedCityStateObject({
    headline: String(savedAiNews.headline || '').slice(0, 220),
    model: String(savedAiNews.model || '').slice(0, 120),
    provider: ['local', 'cloud'].includes(savedAiNews.provider) ? savedAiNews.provider : '',
    language: ['en', 'zhHant', 'ja'].includes(savedAiNews.language) ? savedAiNews.language : '',
    generatedAtTick: Math.floor(toFiniteOr(savedAiNews.generatedAtTick, -1)),
    lastRequestKey: String(savedAiNews.lastRequestKey || '').slice(0, 160),
    pendingDisplay: !!savedAiNews.pendingDisplay,
    history: (Array.isArray(savedAiNews.history) ? savedAiNews.history : []).slice(-12).map((item) => ({
      headline: String(item?.headline || '').slice(0, 220),
      desk: String(item?.desk || '').slice(0, 40),
      district: String(item?.district || '').slice(0, 60),
      location: String(item?.location || '').slice(0, 60),
      angle: String(item?.angle || '').slice(0, 80),
      tick: Math.floor(toFiniteOr(item?.tick, -1)),
      year: Math.floor(toFiniteOr(item?.year, city.year)),
      month: Math.max(1, Math.min(12, Math.floor(toFiniteOr(item?.month, city.month)))),
      })).filter((item) => item.headline),
    });
  }
  if (!isNormalizedCityStateObject(city.forumPosts)) {
    city.forumPosts = rememberNormalizedCityStateObject((Array.isArray(city.forumPosts) ? city.forumPosts : []).slice(-60).map((post, index) => ({
    id: String(post?.id || `forum-loaded-${index}`).slice(0, 120),
    category: String(post?.category || '城市熱話').slice(0, 30),
    headline: String(post?.headline || '').slice(0, 220),
    image: normalizeForumImagePath(post?.image),
    body: (Array.isArray(post?.body) ? post.body : [post?.body]).slice(0, 3).map((text) => String(text || '').slice(0, 500)).filter(Boolean),
    author: String(post?.author || '香城街坊').slice(0, 40),
    officialId: String(post?.officialId || '').slice(0, 60),
    date: String(post?.date || '').slice(0, 60),
    year: Math.floor(toFiniteOr(post?.year, city.year)),
    month: Math.max(1, Math.min(12, Math.floor(toFiniteOr(post?.month, city.month)))),
    outcome: String(post?.outcome || '').slice(0, 60),
    resolutionId: String(post?.resolutionId || '').slice(0, 60),
    resolutionMonthIndex: Math.floor(toFiniteOr(post?.resolutionMonthIndex, -1)),
    source: post?.source === 'ai' ? 'ai' : 'local',
    aiCommentsStatus: post?.aiCommentsStatus === 'complete' ? 'complete' : '',
    social: {
      likes: String(post?.social?.likes || '0').slice(0, 20),
      laughs: String(post?.social?.laughs || '0').slice(0, 20),
      angry: String(post?.social?.angry || '0').slice(0, 20),
      commentCount: String(post?.social?.commentCount || '0').slice(0, 20),
      shares: String(post?.social?.shares || '0').slice(0, 20),
      comments: (Array.isArray(post?.social?.comments) ? post.social.comments : []).slice(0, 8).map((comment) => ({
        author: String(comment?.author || '香城街坊').slice(0, 40),
        text: String(comment?.text || '').slice(0, 240),
        ai: comment?.ai === true,
        official: comment?.official === true,
        officialId: String(comment?.officialId || '').slice(0, 60),
      })).filter((comment) => comment.text),
      },
    })).filter((post) => post.headline));
  }
  city.lastForumMonthIndex = Math.floor(toFiniteOr(city.lastForumMonthIndex, -1));
  city.creditRating = city.creditRating || 'A';
}

let _buildingCountCache = null;
let _powerGridDirty = true;
let _serviceCoverageDirty = true;

function invalidateBuildingCountCache() {
  _buildingCountCache = null;
}

function markPowerGridDirty() {
  _powerGridDirty = true;
}

function markServiceCoverageDirty() {
  _serviceCoverageDirty = true;
}

const SERVICE_BUILDING_TYPES = new Set([
  'fire_station', 'police_station',
  'primary_school', 'secondary_school', 'library',
  'community_college', 'university', 'hospital',
  'park_small', 'park_large',
]);

function getBuildingCount(type) {
  if (!_buildingCountCache) _buildingCountCache = {};
  if (!(type in _buildingCountCache)) {
    _buildingCountCache[type] = Object.values(buildingData).filter((r) => r.type === type).length;
  }
  return _buildingCountCache[type];
}

// Sums SPECIAL_BUILDING_EFFECTS.revenue/upkeep across every placed landmark +
// the harbour. Ocean Park ticket sales, port fees, stadium match revenue etc.
// all flow through the same flat per-building fields rather than separate
// bespoke income lines.
function computeLandmarkFinancials() {
  let revenue = 0;
  let upkeep = 0;
  Object.keys(SPECIAL_BUILDING_EFFECTS).forEach((type) => {
    const count = getBuildingCount(type);
    if (!count) return;
    const effects = SPECIAL_BUILDING_EFFECTS[type];
    revenue += count * (effects.revenue || 0);
    upkeep += count * (effects.upkeep || 0);
  });
  return { revenue, upkeep };
}

// Flat city-wide sum of a SPECIAL_BUILDING_EFFECTS numeric field across every
// placed landmark (e.g. 'attractivenessBonus', 'happinessBonus'). Used by
// council-effects.js (attractiveness/tourism) and simulation.js (happiness).
function sumSpecialBuildingEffect(field) {
  let total = 0;
  Object.keys(SPECIAL_BUILDING_EFFECTS).forEach((type) => {
    const count = getBuildingCount(type);
    if (!count) return;
    total += count * (SPECIAL_BUILDING_EFFECTS[type][field] || 0);
  });
  return total;
}

function computeBudgetSnapshot(options = {}) {
  normalizeCityFinanceState();

  const fireCount = getBuildingCount('fire_station');
  const policeCount = getBuildingCount('police_station');
  const coalCount    = getBuildingCount('power_plant_coal');
  const solarCount   = getBuildingCount('power_plant_solar');
  const nuclearCount = getBuildingCount('power_plant_nuclear');
  const primarySchoolCount = getBuildingCount('primary_school');
  const secondarySchoolCount = getBuildingCount('secondary_school');
  const libraryCount = getBuildingCount('library');
  const communityCollegeCount = getBuildingCount('community_college');
  const universityCount = getBuildingCount('university');
  const hospitalCount = getBuildingCount('hospital');
  const smallParks = getBuildingCount('park_small');
  const largeParks = getBuildingCount('park_large');
  const flagshipParks = getBuildingCount('park_flagship');
  const sportsGroundSmall = getBuildingCount('sports_ground_small');
  const sportsGroundLarge = getBuildingCount('sports_ground_large');
  const landmarkFinancials = computeLandmarkFinancials();

  const taxScale = city.taxRate / 0.09;
  const residentialTax = city.population * TAX_PER_RESIDENT * taxScale;
  const commercialTax = city.commercialCount * TAX_PER_COMMERCIAL * taxScale;
  const industrialTax = city.industrialCount * TAX_PER_INDUSTRIAL * taxScale;
  const grossIncome = residentialTax + commercialTax + industrialTax;
  const policyTaxAdjustment = isPolicyActive('smallBusiness') ? -grossIncome * 0.02 : 0;

  const roadsUpkeep = roadTileCount * UPKEEP_ROAD_PER_TILE * getDepartmentFunding('roads');
  const fireUpkeep = fireCount * UPKEEP_FIRE_STATION * getDepartmentFunding('fire');
  const policeUpkeep = policeCount * UPKEEP_POLICE_STATION * getDepartmentFunding('police');
  const powerUpkeep = coalCount * UPKEEP_COAL_PLANT + solarCount * UPKEEP_SOLAR_PLANT + nuclearCount * UPKEEP_NUCLEAR_PLANT;
  const educationUpkeep = (
    primarySchoolCount * UPKEEP_PRIMARY_SCHOOL
    + secondarySchoolCount * UPKEEP_SECONDARY_SCHOOL
    + libraryCount * UPKEEP_LIBRARY
    + communityCollegeCount * UPKEEP_COMMUNITY_COLLEGE
    + universityCount * UPKEEP_UNIVERSITY
  );
  const healthUpkeep = hospitalCount * UPKEEP_HOSPITAL;
  const parksUpkeep = (
    smallParks * UPKEEP_PARK_SMALL
    + largeParks * UPKEEP_PARK_LARGE
    + flagshipParks * UPKEEP_PARK_FLAGSHIP
    + sportsGroundSmall * UPKEEP_SPORTS_GROUND_SMALL
    + sportsGroundLarge * UPKEEP_SPORTS_GROUND_LARGE
  ) * getDepartmentFunding('parks');
  const policyCost = getPolicyMonthlyCost();
  const loanPayment = Number.isFinite(options.loanPayment)
    ? options.loanPayment
    : getMonthlyLoanDue();

  const tourismIncome = Math.max(0, Number(city.tourismRevenue || 0));
  const landmarkIncome = landmarkFinancials.revenue;
  const landmarkUpkeep = landmarkFinancials.upkeep;
  const totalIncome = Math.round(grossIncome + policyTaxAdjustment + tourismIncome + landmarkIncome);
  const totalExpenses = Math.round(
    roadsUpkeep + fireUpkeep + policeUpkeep + powerUpkeep + educationUpkeep + healthUpkeep
    + parksUpkeep + policyCost + loanPayment + landmarkUpkeep
  );
  const net = totalIncome - totalExpenses;
  city.landmarkRevenue = Math.round(landmarkIncome);
  city.landmarkUpkeep = Math.round(landmarkUpkeep);

  return {
    income: {
      residentialTax: Math.round(residentialTax),
      commercialTax: Math.round(commercialTax),
      industrialTax: Math.round(industrialTax),
      policyAdjustment: Math.round(policyTaxAdjustment),
      tourism: Math.round(tourismIncome),
      landmarks: Math.round(landmarkIncome),
    },
    expenses: {
      roads: Math.round(roadsUpkeep),
      fire: Math.round(fireUpkeep),
      police: Math.round(policeUpkeep),
      power: Math.round(powerUpkeep),
      landmarks: Math.round(landmarkUpkeep),
      education: Math.round(educationUpkeep),
      health: Math.round(healthUpkeep),
      parks: Math.round(parksUpkeep),
      policy: Math.round(policyCost),
      loans: Math.round(loanPayment),
    },
    totalIncome,
    totalExpenses,
    net,
    annualNet: net * 12,
  };
}

function clampDepartmentBudget(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEPARTMENT_BUDGET_DEFAULT;
  return Math.max(DEPARTMENT_BUDGET_MIN, Math.min(DEPARTMENT_BUDGET_MAX, Math.round(numeric)));
}

function getDepartmentFunding(key) {
  const raw = Number(city.departmentBudgets?.[key] ?? DEPARTMENT_BUDGET_DEFAULT);
  return (Number.isFinite(raw) ? raw : DEPARTMENT_BUDGET_DEFAULT) / 100;
}

function isPolicyActive(id) {
  return !!city.activePolicies[id];
}

function isCouncilResolutionApproved(id) {
  return Number(city.council?.resolutionStates?.[id]?.timesApproved || 0) > 0;
}

function hasBuildingType(type) {
  return getBuildingCount(type) > 0;
}

// ── Special building (landmark) unlock gating ──────────────────────────────
// Generic check against SPECIAL_BUILDING_UNLOCKS (constants.js), covering the
// harbour, airport, football stadium and the specialSites landmarks. Mirrors
// the unlockPopulation pattern already used by CITY_POLICY_DEFS.
function getSpecialBuildingUnlockState(type) {
  const rule = SPECIAL_BUILDING_UNLOCKS[type];
  if (!rule) return { unlocked: true, reason: '', type };
  if (rule.unlockPopulation && city.population < rule.unlockPopulation) {
    return { unlocked: false, reason: 'population', threshold: rule.unlockPopulation, type };
  }
  if (rule.unlockAttractiveness && (city.cityAttractiveness ?? 0) < rule.unlockAttractiveness) {
    return { unlocked: false, reason: 'attractiveness', threshold: rule.unlockAttractiveness, type };
  }
  if (rule.requiresBuildingType && !hasBuildingType(rule.requiresBuildingType)) {
    return { unlocked: false, reason: 'building', requires: rule.requiresBuildingType, type };
  }
  if (rule.requiresPolicy && !isPolicyActive(rule.requiresPolicy)) {
    return { unlocked: false, reason: 'policy', requires: rule.requiresPolicy, type };
  }
  if (rule.requiresResolution && !isCouncilResolutionApproved(rule.requiresResolution)) {
    return { unlocked: false, reason: 'resolution', requires: rule.requiresResolution, type };
  }
  if (rule.maxCount && getBuildingCount(type) >= rule.maxCount) {
    return { unlocked: false, reason: 'maxCount', type };
  }
  return { unlocked: true, reason: '', type };
}

function isSpecialBuildingUnlocked(type) {
  return getSpecialBuildingUnlockState(type).unlocked;
}

// Fires the ticker + forum "just unlocked" notice exactly once per building
// type per game, the first time updateHUD() observes a locked→unlocked flip
// for a building that hasn't been placed yet. Called from hud.js:updateHUD().
function checkSpecialBuildingUnlockNotices() {
  if (!Array.isArray(city.acknowledgedLandmarkUnlocks)) city.acknowledgedLandmarkUnlocks = [];
  Object.keys(SPECIAL_BUILDING_UNLOCKS).forEach((type) => {
    if (city.acknowledgedLandmarkUnlocks.includes(type)) return;
    if (hasBuildingType(type)) { city.acknowledgedLandmarkUnlocks.push(type); return; }
    if (!isSpecialBuildingUnlocked(type)) return;
    city.acknowledgedLandmarkUnlocks.push(type);
    if (typeof announceLandmarkUnlockNotice === 'function') announceLandmarkUnlockNotice(type);
  });
}

function isPolicyAvailable(id) {
  const policy = CITY_POLICY_DEFS.find((entry) => entry.id === id);
  if (!policy) return false;

  if (!hasBuildingType('legislative_council')) return false;
  if (policy.unlockPopulation && city.population < policy.unlockPopulation) return false;
  return true;
}

function getTotalDebt() {
  return Math.round(city.loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0));
}

function getMonthlyLoanDue() {
  return Math.round(city.loans.reduce((sum, loan) => sum + Number(loan.monthlyPayment || 0), 0));
}

function getPowerPlantStats(type) {
  return POWER_PLANT_STATS[type] ?? null;
}

function getBuildingPowerDemand(record) {
  if (!record) return 0;
  if (POWER_PLANT_STATS[record.type]) return 0;

  if (record.type === 'residential' || record.type === 'commercial' || record.type === 'industrial') {
    const table = BUILDING_POWER_DEMAND[record.type] ?? BUILDING_POWER_DEMAND.residential;
    return table[Math.max(1, Math.min(3, record.level ?? 1))] ?? table[1];
  }

  return BUILDING_POWER_DEMAND[record.type] ?? 0;
}

function getBuildingJobCapacity(record) {
  if (!record) return 0;
  if (record.type !== 'commercial' && record.type !== 'industrial') return 0;

  const baseJobs = record.type === 'commercial' ? JOBS_PER_COM : JOBS_PER_IND;
  const footprintArea = Math.max(1, (record.footprintCols ?? 1) * (record.footprintRows ?? 1));
  return Math.round(baseJobs * ANCHOR_RATIO * footprintArea);
}

function getZonePowerDemand(zone, density = DENSITY_LOW) {
  const level = Math.max(1, Math.min(3, density ?? DENSITY_LOW));
  const tables = {
    [ZONE_RES]: [0, 3, 6, 10],
    [ZONE_COM]: [0, 4, 8, 14],
    [ZONE_IND]: [0, 7, 12, 20],
  };
  return tables[zone]?.[level] ?? 0;
}

function getPowerPlantAgeMonths(record) {
  return Math.max(0, Number(record?.age ?? 0));
}

function getPowerPlantOutput(record) {
  const stats = getPowerPlantStats(record?.type);
  if (!stats) return 0;

  const age = getPowerPlantAgeMonths(record);
  if ((record.powerState ?? 'active') === 'abandoned' || age >= stats.maxAgeMonths) return 0;
  if (age <= stats.degradeStartMonths) return stats.generationMW;

  const wornMonths = age - stats.degradeStartMonths;
  const wearRange = Math.max(1, stats.maxAgeMonths - stats.degradeStartMonths);
  const wear = Math.min(1, wornMonths / wearRange);
  const outputRatio = 1 - wear * (1 - stats.minOutputRatio);
  return Math.round(stats.generationMW * outputRatio);
}

function getPowerPlantMaintenance(record) {
  const stats = getPowerPlantStats(record?.type);
  if (!stats) return 0;

  const age = getPowerPlantAgeMonths(record);
  const wornRatio = clamp(age / Math.max(1, stats.maxAgeMonths), 0, 1);
  const upkeepScale = 1 + wornRatio * 0.45;
  return Math.round(stats.baseUpkeep * upkeepScale);
}

function isPowerPlantNearRetirement(record) {
  const stats = getPowerPlantStats(record?.type);
  if (!stats) return false;
  const age = getPowerPlantAgeMonths(record);
  return age >= Math.max(0, stats.maxAgeMonths - stats.warningMonths) && age < stats.maxAgeMonths;
}

function getPowerPlantRemainingMonths(record) {
  const stats = getPowerPlantStats(record?.type);
  if (!stats) return 0;
  return Math.max(0, stats.maxAgeMonths - getPowerPlantAgeMonths(record));
}

function formatPowerPlantAge(record) {
  const months = getPowerPlantAgeMonths(record);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return years > 0 ? `${years}y ${remMonths}m` : `${remMonths}m`;
}

function getPowerPlantState(record) {
  const stats = getPowerPlantStats(record?.type);
  if (!stats) return 'normal';
  const age = getPowerPlantAgeMonths(record);
  if ((record.powerState ?? 'active') === 'abandoned' || age >= stats.maxAgeMonths) return 'abandoned';
  if (age >= stats.degradeStartMonths) return 'degraded';
  return 'active';
}

function getPowerPlantGenerationSummary(record) {
  const stats = getPowerPlantStats(record?.type);
  if (!stats) return { output: 0, maxOutput: 0, ratio: 0 };
  const output = getPowerPlantOutput(record);
  const ratio = stats.generationMW > 0 ? output / stats.generationMW : 0;
  return { output, maxOutput: stats.generationMW, ratio };
}

function getPowerPlantLoadSummary(record) {
  const stats = getPowerPlantStats(record?.type);
  if (!stats) return { load: 0, maxLoad: 0, loadRatio: 0, status: 'unknown' };

  const maxLoad = stats.generationMW;
  const load = Math.max(0, Number(record?.powerLoad ?? 0));
  const loadRatio = clamp(load / Math.max(1, maxLoad), 0, 1);
  let status = 'balanced';
  if ((record?.powerState ?? 'active') === 'abandoned') status = 'abandoned';
  else if (loadRatio >= 0.95) status = 'overloaded';
  else if (loadRatio >= 0.75) status = 'busy';
  else if (loadRatio < 0.25) status = 'underused';

  return { load, maxLoad, loadRatio, status };
}

function computeLoanPayment(amount, months, annualRate) {
  const monthlyRate = annualRate / 12;
  if (!monthlyRate) return Math.ceil(amount / months);
  return Math.ceil(amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
}

function takeCityLoan(optionIndex) {
  normalizeCityFinanceState();
  const option = LOAN_OPTIONS[optionIndex];
  if (!option) return null;
  const loan = {
    id: city.nextLoanId++,
    amount: option.amount,
    balance: option.amount,
    monthsLeft: option.months,
    annualRate: option.annualRate,
    monthlyPayment: computeLoanPayment(option.amount, option.months, option.annualRate),
  };
  city.loans.push(loan);
  city.budget += option.amount;
  updateCreditRating();
  return loan;
}

function getPolicyMonthlyCost() {
  normalizeCityFinanceState();
  const active = city.activePolicies;
  let cost = 0;
  CITY_POLICY_DEFS.forEach((policy) => {
    if (!active[policy.id]) return;
    cost += policy.monthlyBase;
    if (policy.id === 'cleanAir') cost += city.industrialCount * 4;
    if (policy.id === 'roadRepair') cost += roadTileCount * 0.12;
    if (policy.id === 'greenParks') cost += countPolicyParks() * 12;
    if (policy.id === 'educationReform') cost += countEducationBuildings() * 24;
    if (policy.id === 'scienceDevelopment') cost += city.industrialCount * 5;
    if (policy.id === 'smokingBan') cost += Math.ceil(city.population / 2500) * 8;
    if (policy.id === 'schoolHealthProgram') cost += countSchoolHealthProgramBuildings() * 18;
    if (policy.id === 'elderlyTwoDollarFare') cost += Math.ceil(city.population / 1000) * 9;
    if (policy.id === 'arcticPenguinReserve') cost += Math.ceil(city.population / 5000) * 6;
    if (policy.id === 'busSeatbeltMandate') cost += Math.ceil(roadTileCount / 100) * 4;
  });
  return Math.round(cost);
}

function countSchoolHealthProgramBuildings() {
  return Object.values(buildingData).filter((rec) => (
    rec.type === 'primary_school'
    || rec.type === 'secondary_school'
  )).length;
}

function countEducationBuildings() {
  return Object.values(buildingData).filter((rec) => (
    rec.type === 'primary_school'
    || rec.type === 'secondary_school'
    || rec.type === 'library'
    || rec.type === 'community_college'
    || rec.type === 'university'
  )).length;
}

function countPolicyParks() {
  return Object.values(buildingData).filter((rec) => rec.type === 'park_small' || rec.type === 'park_large').length;
}

function updateCreditRating() {
  const debt = getTotalDebt();
  const annualIncome = Math.max(12000, city.monthlyIncome * 12);
  const ratio = debt / annualIncome;
  city.creditRating = ratio < 1 ? 'A' : ratio < 2 ? 'B' : ratio < 3.5 ? 'C' : 'D';
  return city.creditRating;
}
