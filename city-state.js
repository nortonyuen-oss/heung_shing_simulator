// Parallel map layers — initialized in resetGameState(), called from create()
let zoneMap         = [];   // ZONE_NONE | ZONE_RES | ZONE_COM | ZONE_IND per cell
let zoneDensityMap  = [];   // DENSITY_LOW | DENSITY_MED | DENSITY_HIGH per cell
let powerMap        = [];   // boolean per cell (is this cell powered?)
let serviceMap      = [];   // { fire: bool, police: bool, park: 0|1|2 } | null per cell

// Simulation metadata for every placed building (player-placed or sim-spawned)
// Keyed by getTileId(anchorRow, anchorCol)
const buildingData = {};

// Infrastructure state
let powerSources  = new Set();  // tile IDs of power plant anchor tiles
let powerLineSet  = new Set();  // tile IDs of placed power line tiles
let roadTileCount = 0;          // maintained by setTileType()

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
  },
  loans: [],
  nextLoanId: 1,
  creditRating: 'A',
  lastPolicyCost: 0,
  lastLoanPayment: 0,
  lastBudgetSnapshot: null,
  monthlyIncome: 0,
  monthlyExpenses: 0,
  population: 0,
  residentialCount: 0,
  commercialCount: 0,
  industrialCount: 0,
  demandR: 0.3,
  demandC: 0.3,
  demandI: 0.5,
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
  };
  city.loans = [];
  city.nextLoanId = 1;
  city.creditRating = 'A';
  city.lastPolicyCost = 0;
  city.lastLoanPayment = 0;
  city.lastBudgetSnapshot = null;
  city.monthlyIncome   = 0;
  city.monthlyExpenses = 0;
  city.population      = 0;
  city.residentialCount = 0;
  city.commercialCount = 0;
  city.industrialCount = 0;
  city.demandR    = 0.3;
  city.demandC    = 0.3;
  city.demandI    = 0.5;
  city.happiness  = 0.5;
  city.pollution  = 0;
  city.tick       = 0;
  city.day        = 1;
  city.month      = 1;
  city.year       = 1900;
  city.isBankrupt = false;
}

function normalizeCityFinanceState() {
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
  };
  city.loans = Array.isArray(city.loans) ? city.loans.filter((loan) => loan && loan.balance > 0) : [];
  city.nextLoanId = Math.max(city.nextLoanId ?? 1, ...city.loans.map((loan) => Number(loan.id ?? 0) + 1), 1);
  city.lastPolicyCost = city.lastPolicyCost ?? 0;
  city.lastLoanPayment = city.lastLoanPayment ?? 0;
  city.lastBudgetSnapshot = city.lastBudgetSnapshot ?? null;
  city.creditRating = city.creditRating || 'A';
}

function getBuildingCount(type) {
  return Object.values(buildingData).filter((record) => record.type === type).length;
}

function computeBudgetSnapshot(options = {}) {
  normalizeCityFinanceState();

  const fireCount = getBuildingCount('fire_station');
  const policeCount = getBuildingCount('police_station');
  const coalCount = getBuildingCount('power_plant_coal');
  const solarCount = getBuildingCount('power_plant_solar');
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
  const parksUpkeep = (smallParks * UPKEEP_PARK_SMALL + largeParks * UPKEEP_PARK_LARGE) * getDepartmentFunding('parks');
  const policyCost = getPolicyMonthlyCost();
  const loanPayment = Number.isFinite(options.loanPayment)
    ? options.loanPayment
    : getMonthlyLoanDue();

  const totalIncome = Math.round(grossIncome + policyTaxAdjustment);
  const totalExpenses = Math.round(
    roadsUpkeep + fireUpkeep + policeUpkeep + powerUpkeep + parksUpkeep + policyCost + loanPayment
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
  normalizeCityFinanceState();
  return (city.departmentBudgets[key] ?? DEPARTMENT_BUDGET_DEFAULT) / 100;
}

function isPolicyActive(id) {
  normalizeCityFinanceState();
  return !!city.activePolicies[id];
}

function getTotalDebt() {
  normalizeCityFinanceState();
  return Math.round(city.loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0));
}

function getMonthlyLoanDue() {
  normalizeCityFinanceState();
  return Math.round(city.loans.reduce((sum, loan) => sum + Number(loan.monthlyPayment || 0), 0));
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
  });
  return Math.round(cost);
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
