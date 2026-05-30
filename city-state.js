// Parallel map layers — initialized in resetGameState(), called from create()
let zoneMap         = [];   // ZONE_NONE | ZONE_RES | ZONE_COM | ZONE_IND per cell
let zoneDensityMap  = [];   // DENSITY_LOW | DENSITY_MED | DENSITY_HIGH per cell
let heightMap       = [];   // 0 = sea/flat, each +1 step is 100m altitude
let bridgeMap       = [];   // null | 'deck:row' | 'deck:col' | 'ramp:n/e/s/w'
let roadUnderlayMap = [];   // original terrain below bridge road tiles
let powerMap        = [];   // boolean per cell (is this cell powered?)
let serviceMap      = [];   // { fire: bool, police: bool, park: 0|1|2 } | null per cell
let treeMap         = [];   // null | { species, age, variant } per cell

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
      isHSI,
      listed,
    };
  });

  return {
    hsi: HSI_BASE_LEVEL,
    prevHsi: HSI_BASE_LEVEL,
    lastRotationTick: 0,
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
    tourismPromotion: false,
    foreignInvestmentIncentive: false,
    districtCouncilElection: false,
    icac: false,
    legislativeCouncilElection: false,
    stockExchangeAct: false,
  },
  loans: [],
  nextLoanId: 1,
  creditRating: 'A',
  lastPolicyCost: 0,
  lastLoanPayment: 0,
  lastBudgetSnapshot: null,
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
  scienceParkUnlocked: false,
  ruleOfLawIndex: 0,
  crimeRateIndex: 0,
  scienceIndustryShare: 0,
  stockMarket: createDefaultStockMarketState(),
  educationHistory: [],
  crimeHistory: [],
  governmentIncomeHistory: [],
  happinessHistory: [],
  landValueHistory: [],
  pollutionHistory: [],
  hsiHistory: [],
  happiness: 0.5,
  pollution: 0,
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
  bridgeMap      = createFilledMap(null);
  roadUnderlayMap = createFilledMap(null);

  Object.keys(buildingData).forEach((k) => delete buildingData[k]);
  powerSources.clear();
  powerLineSet.clear();
  roadTileCount = 0;

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
    tourismPromotion: false,
    foreignInvestmentIncentive: false,
    districtCouncilElection: false,
    icac: false,
    legislativeCouncilElection: false,
    stockExchangeAct: false,
  };
  city.loans = [];
  city.nextLoanId = 1;
  city.creditRating = 'A';
  city.lastPolicyCost = 0;
  city.lastLoanPayment = 0;
  city.lastBudgetSnapshot = null;
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
  city.scienceParkUnlocked = false;
  city.ruleOfLawIndex = 0;
  city.crimeRateIndex = 0;
  city.scienceIndustryShare = 0;
  city.stockMarket = createDefaultStockMarketState();
  city.educationHistory = [];
  city.crimeHistory = [];
  city.governmentIncomeHistory = [];
  city.happinessHistory = [];
  city.landValueHistory = [];
  city.pollutionHistory = [];
  city.hsiHistory = [];
  city.happiness  = 0.5;
  city.pollution  = 0;
  city.tick       = 0;
  city.day        = 1;
  city.month      = 1;
  city.year       = 1900;
  city.isBankrupt = false;
}

function normalizeCityFinanceState() {
  const toFiniteOr = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  city.departmentBudgets = {
    roads: clampDepartmentBudget(city.departmentBudgets?.roads),
    police: clampDepartmentBudget(city.departmentBudgets?.police),
    fire: clampDepartmentBudget(city.departmentBudgets?.fire),
    parks: clampDepartmentBudget(city.departmentBudgets?.parks),
  };
  city.activePolicies = {
    cleanAir: !!city.activePolicies?.cleanAir,
    roadRepair: !!city.activePolicies?.roadRepair,
    publicSafety: !!city.activePolicies?.publicSafety,
    smallBusiness: !!city.activePolicies?.smallBusiness,
    greenParks: !!city.activePolicies?.greenParks,
    educationReform: !!city.activePolicies?.educationReform,
    scienceDevelopment: !!city.activePolicies?.scienceDevelopment,
    tourismPromotion: !!city.activePolicies?.tourismPromotion,
    foreignInvestmentIncentive: !!city.activePolicies?.foreignInvestmentIncentive,
    districtCouncilElection: !!city.activePolicies?.districtCouncilElection,
    icac: !!city.activePolicies?.icac,
    legislativeCouncilElection: !!city.activePolicies?.legislativeCouncilElection,
    stockExchangeAct: !!city.activePolicies?.stockExchangeAct,
  };
  city.loans = Array.isArray(city.loans) ? city.loans.filter((loan) => loan && loan.balance > 0) : [];
  city.nextLoanId = Math.max(city.nextLoanId ?? 1, ...city.loans.map((loan) => Number(loan.id ?? 0) + 1), 1);
  city.lastPolicyCost = city.lastPolicyCost ?? 0;
  city.lastLoanPayment = city.lastLoanPayment ?? 0;
  city.lastBudgetSnapshot = city.lastBudgetSnapshot ?? null;
  city.totalPowerSupply = toFiniteOr(city.totalPowerSupply, 0);
  city.totalPowerDemand = toFiniteOr(city.totalPowerDemand, 0);
  city.powerRatio = toFiniteOr(city.powerRatio, 1);
  city.educationBasicIndex = toFiniteOr(city.educationBasicIndex, 0);
  city.educationHigherIndex = toFiniteOr(city.educationHigherIndex, 0);
  city.educationAverageLevel = toFiniteOr(city.educationAverageLevel, 0);
  city.scienceParkUnlocked = !!city.scienceParkUnlocked;
  city.ruleOfLawIndex = toFiniteOr(city.ruleOfLawIndex, 0);
  city.crimeRateIndex = toFiniteOr(city.crimeRateIndex, 0);
  city.scienceIndustryShare = toFiniteOr(city.scienceIndustryShare, 0);
  if (!city.stockMarket || !Array.isArray(city.stockMarket.stocks)) {
    city.stockMarket = createDefaultStockMarketState();
  }

  const defaultStockMarket = createDefaultStockMarketState();
  const market = city.stockMarket;
  market.hsi = toFiniteOr(market.hsi, defaultStockMarket.hsi);
  market.prevHsi = toFiniteOr(market.prevHsi, defaultStockMarket.prevHsi);
  market.lastRotationTick = toFiniteOr(market.lastRotationTick, 0);

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
      listed,
    };
  });

  market.stocks = normalizedStocks;
  const maxNonHsiListed = Math.max(0, STOCK_LISTING_COUNT - HSI_COMPONENT_SYMBOLS.length);
  if (listedNonHsi > maxNonHsiListed) {
    const overflow = listedNonHsi - maxNonHsiListed;
    let removed = 0;
    city.stockMarket.stocks.forEach((stock) => {
      if (removed >= overflow) return;
      if (stock.isHSI || !stock.listed) return;
      stock.listed = false;
      removed++;
    });
  } else if (listedNonHsi < maxNonHsiListed) {
    let needed = maxNonHsiListed - listedNonHsi;
    city.stockMarket.stocks.forEach((stock) => {
      if (needed <= 0) return;
      if (stock.isHSI || stock.listed) return;
      stock.listed = true;
      needed--;
    });
  }
  city.educationHistory = Array.isArray(city.educationHistory) ? city.educationHistory : [];
  city.crimeHistory = Array.isArray(city.crimeHistory) ? city.crimeHistory : [];
  city.governmentIncomeHistory = Array.isArray(city.governmentIncomeHistory) ? city.governmentIncomeHistory : [];
  city.happinessHistory = Array.isArray(city.happinessHistory) ? city.happinessHistory : [];
  city.landValueHistory = Array.isArray(city.landValueHistory) ? city.landValueHistory : [];
  city.pollutionHistory = Array.isArray(city.pollutionHistory) ? city.pollutionHistory : [];
  city.hsiHistory = Array.isArray(city.hsiHistory) ? city.hsiHistory : [];
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
  'community_college', 'university',
  'park_small', 'park_large',
]);

function getBuildingCount(type) {
  if (!_buildingCountCache) _buildingCountCache = {};
  if (!(type in _buildingCountCache)) {
    _buildingCountCache[type] = Object.values(buildingData).filter((r) => r.type === type).length;
  }
  return _buildingCountCache[type];
}

function computeBudgetSnapshot(options = {}) {
  normalizeCityFinanceState();

  const fireCount = getBuildingCount('fire_station');
  const policeCount = getBuildingCount('police_station');
  const coalCount = getBuildingCount('power_plant_coal');
  const solarCount = getBuildingCount('power_plant_solar');
  const primarySchoolCount = getBuildingCount('primary_school');
  const secondarySchoolCount = getBuildingCount('secondary_school');
  const libraryCount = getBuildingCount('library');
  const communityCollegeCount = getBuildingCount('community_college');
  const universityCount = getBuildingCount('university');
  const smallParks = getBuildingCount('park_small');
  const largeParks = getBuildingCount('park_large');

  const taxScale = city.taxRate / 0.09;
  const residentialTax = city.population * TAX_PER_RESIDENT * taxScale;
  const commercialTax = city.commercialCount * TAX_PER_COMMERCIAL * taxScale;
  const industrialTax = city.industrialCount * TAX_PER_INDUSTRIAL * taxScale;
  const grossIncome = residentialTax + commercialTax + industrialTax;
  const policyTaxAdjustment = isPolicyActive('smallBusiness') ? -grossIncome * 0.02 : 0;

  const roadsUpkeep = roadTileCount * UPKEEP_ROAD_PER_TILE * getDepartmentFunding('roads');
  const fireUpkeep = fireCount * UPKEEP_FIRE_STATION * getDepartmentFunding('fire');
  const policeUpkeep = policeCount * UPKEEP_POLICE_STATION * getDepartmentFunding('police');
  const powerUpkeep = coalCount * UPKEEP_COAL_PLANT + solarCount * UPKEEP_SOLAR_PLANT;
  const educationUpkeep = (
    primarySchoolCount * UPKEEP_PRIMARY_SCHOOL
    + secondarySchoolCount * UPKEEP_SECONDARY_SCHOOL
    + libraryCount * UPKEEP_LIBRARY
    + communityCollegeCount * UPKEEP_COMMUNITY_COLLEGE
    + universityCount * UPKEEP_UNIVERSITY
  );
  const parksUpkeep = (smallParks * UPKEEP_PARK_SMALL + largeParks * UPKEEP_PARK_LARGE) * getDepartmentFunding('parks');
  const policyCost = getPolicyMonthlyCost();
  const loanPayment = Number.isFinite(options.loanPayment)
    ? options.loanPayment
    : getMonthlyLoanDue();

  const totalIncome = Math.round(grossIncome + policyTaxAdjustment);
  const totalExpenses = Math.round(
    roadsUpkeep + fireUpkeep + policeUpkeep + powerUpkeep + educationUpkeep + parksUpkeep + policyCost + loanPayment
  );
  const net = totalIncome - totalExpenses;

  return {
    income: {
      residentialTax: Math.round(residentialTax),
      commercialTax: Math.round(commercialTax),
      industrialTax: Math.round(industrialTax),
      policyAdjustment: Math.round(policyTaxAdjustment),
    },
    expenses: {
      roads: Math.round(roadsUpkeep),
      fire: Math.round(fireUpkeep),
      police: Math.round(policeUpkeep),
      power: Math.round(powerUpkeep),
      education: Math.round(educationUpkeep),
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

function hasBuildingType(type) {
  return getBuildingCount(type) > 0;
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
  });
  return Math.round(cost);
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
