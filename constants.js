// Zone types
const ZONE_NONE = 0;
const ZONE_RES  = 1;
const ZONE_COM  = 2;
const ZONE_IND  = 3;

// Zone density levels
const DENSITY_LOW  = 1;
const DENSITY_MED  = 2;
const DENSITY_HIGH = 3;

// Cost multipliers per density level (applied on top of base zone cost)
const DENSITY_COST_MUL = { 1: 1.0, 2: 1.5, 3: 2.5 };

// Growth-chance multipliers — high density fills more slowly but packs more people
const DENSITY_GROW_MUL = { 1: 1.0, 2: 0.65, 3: 0.40 };

// Population multipliers per density (relative to base POP_PER_LEVEL)
const DENSITY_POP_MUL  = { 1: 1.0, 2: 2.5, 3: 6.0 };

// Simulation timing
const SIM_TICK_MS    = 5000;
const TICKS_PER_MONTH = 4;

// Tax rate bounds
const TAX_RATE_MIN = 0.04;
const TAX_RATE_MAX = 0.20;
const TAX_PER_RESIDENT = 0.5;   // $ per resident per month at 9% base
const TAX_PER_COMMERCIAL = 32;  // $ per commercial building per month at 9% base
const TAX_PER_INDUSTRIAL = 40;  // $ per industrial building per month at 9% base

// Department funding sliders: 100 = normal service, 50 = austerity, 150 = premium.
const DEPARTMENT_BUDGET_MIN = 50;
const DEPARTMENT_BUDGET_MAX = 150;
const DEPARTMENT_BUDGET_DEFAULT = 100;

// Loan options for the first city-finance pass.
const LOAN_OPTIONS = [
  { amount: 5000,  months: 36, annualRate: 0.08 },
  { amount: 10000, months: 48, annualRate: 0.10 },
  { amount: 25000, months: 60, annualRate: 0.12 },
];

// Acts/laws are presented inside the Legislative Council window.
const CITY_POLICY_DEFS = [
  { id: 'cleanAir',       titleKey: 'policy.cleanAir.title',       descKey: 'policy.cleanAir.desc',       monthlyBase: 150 },
  { id: 'roadRepair',     titleKey: 'policy.roadRepair.title',     descKey: 'policy.roadRepair.desc',     monthlyBase: 120 },
  { id: 'publicSafety',   titleKey: 'policy.publicSafety.title',   descKey: 'policy.publicSafety.desc',   monthlyBase: 200 },
  { id: 'smallBusiness',  titleKey: 'policy.smallBusiness.title',  descKey: 'policy.smallBusiness.desc',  monthlyBase: 180 },
  { id: 'greenParks',     titleKey: 'policy.greenParks.title',     descKey: 'policy.greenParks.desc',     monthlyBase: 100 },
  { id: 'educationReform', titleKey: 'policy.educationReform.title', descKey: 'policy.educationReform.desc', monthlyBase: 220 },
  { id: 'scienceDevelopment', titleKey: 'policy.scienceDevelopment.title', descKey: 'policy.scienceDevelopment.desc', monthlyBase: 260 },
  { id: 'tourismPromotion', titleKey: 'policy.tourismPromotion.title', descKey: 'policy.tourismPromotion.desc', monthlyBase: 160, unlockPopulation: 10000 },
  { id: 'foreignInvestmentIncentive', titleKey: 'policy.foreignInvestmentIncentive.title', descKey: 'policy.foreignInvestmentIncentive.desc', monthlyBase: 240, unlockPopulation: 10000 },
  { id: 'districtCouncilElection', titleKey: 'policy.districtCouncilElection.title', descKey: 'policy.districtCouncilElection.desc', monthlyBase: 140, unlockPopulation: 10000 },
  { id: 'icac', titleKey: 'policy.icac.title', descKey: 'policy.icac.desc', monthlyBase: 200, unlockPopulation: 10000 },
  { id: 'legislativeCouncilElection', titleKey: 'policy.legislativeCouncilElection.title', descKey: 'policy.legislativeCouncilElection.desc', monthlyBase: 180, unlockPopulation: 10000 },
  { id: 'stockExchangeAct', titleKey: 'policy.stockExchangeAct.title', descKey: 'policy.stockExchangeAct.desc', monthlyBase: 220, unlockPopulation: 50000 },
];

const HSI_BASE_LEVEL = 20000;
const STOCK_LISTING_COUNT = 20;
const STOCK_LISTING_ROTATE_COUNT = 2;
// Stock-market long-run tuning: HSI is derived from constituent market caps.
// Target long-run annualized growth stays near historical HSI price performance (~4-5%).
const HSI_ANNUAL_BASE_RETURN = 0.045;
const STOCK_CITY_PREMIUM_ANNUAL_MAX = 0.022;
const STOCK_MARKET_MEAN_REVERSION = 0.16;
const STOCK_IDIO_SHOCK_DECAY = 0.78;
const STOCK_IDIO_SHOCK_SCALE = 0.55;
const STOCK_MARKET_REGIME_ANNUAL_DRIFT = {
  bull: 0.14,
  range: 0.01,
  bear: -0.16,
};
const STOCK_MARKET_REGIME_VOL_MULTIPLIER = {
  bull: 0.85,
  range: 1.0,
  bear: 1.35,
};
const STOCK_MARKET_REGIME_TRANSITION = {
  bull: { bull: 0.84, range: 0.14, bear: 0.02 },
  range: { bull: 0.18, range: 0.66, bear: 0.16 },
  bear: { bull: 0.07, range: 0.28, bear: 0.65 },
};
const STOCK_MARKET_REGIME_DURATION_MONTHS = {
  bull: [4, 10],
  range: [3, 8],
  bear: [2, 6],
};
const HSI_COMPONENT_SYMBOLS = [
  'GTT', 'ALI', 'MEO', 'HBF', 'AIA',
  'BYD', 'MTR', 'HKE', 'SNO', 'LNK',
];
const STOCK_MARKET_CATALOG = [
  { symbol: 'GTT', name: '港騰互娛', sector: '科技' },
  { symbol: 'ALI', name: '阿里爸爸雲商', sector: '科技' },
  { symbol: 'MEO', name: '美味團到家', sector: '消費' },
  { symbol: 'HBF', name: '匯豐豐金服', sector: '金融' },
  { symbol: 'AIA', name: '友邦邦保險', sector: '金融' },
  { symbol: 'BYD', name: '比亞電動', sector: '工業' },
  { symbol: 'MTR', name: '港鐵通勤網', sector: '交通' },
  { symbol: 'HKE', name: '港交易廣場', sector: '金融' },
  { symbol: 'SNO', name: '信義玻璃璃', sector: '工業' },
  { symbol: 'LNK', name: '領展展業', sector: '地產' },
  { symbol: 'NWS', name: '新創世界城', sector: '地產' },
  { symbol: 'HLD', name: '恆樓置業', sector: '地產' },
  { symbol: 'SNP', name: '新鴻基地地', sector: '地產' },
  { symbol: 'CKR', name: '長實實業', sector: '地產' },
  { symbol: 'MGM', name: '煤氣街坊能源', sector: '公用' },
  { symbol: 'CLP', name: '中電好電', sector: '公用' },
  { symbol: 'HKT', name: '香通電訊', sector: '通訊' },
  { symbol: 'SMC', name: '數碼城城', sector: '科技' },
  { symbol: 'TKS', name: '騰芯半導體', sector: '科技' },
  { symbol: 'RTL', name: '日日零售聯盟', sector: '消費' },
  { symbol: 'FOD', name: '快好送餐飲', sector: '消費' },
  { symbol: 'CIN', name: '城際影院線', sector: '文娛' },
  { symbol: 'TRV', name: '遊歷旅遊網', sector: '文旅' },
  { symbol: 'AIR', name: '空運達物流', sector: '交通' },
  { symbol: 'SEA', name: '海運通航', sector: '交通' },
  { symbol: 'EDU', name: '學霸通教育', sector: '教育' },
  { symbol: 'MED', name: '仁和醫護', sector: '醫療' },
  { symbol: 'BIO', name: '生科未來', sector: '醫療' },
  { symbol: 'PET', name: '石油龍能源', sector: '能源' },
  { symbol: 'SOL', name: '曬爆太陽能', sector: '新能源' },
  { symbol: 'WND', name: '追風風電', sector: '新能源' },
  { symbol: 'BNK', name: '大灣商銀', sector: '金融' },
  { symbol: 'FNB', name: '第一市民銀行', sector: '金融' },
  { symbol: 'NET', name: '網運速遞', sector: '交通' },
  { symbol: 'PAY', name: '拍住付科技', sector: '科技' },
  { symbol: 'GME', name: '戲院宇宙互娛', sector: '文娛' },
];

// Growth probabilities per tick
const GROW_CHANCE_BASE = 0.4;
const UPGRADE_CHANCE   = 0.15;
const SHRINK_CHANCE    = 0.30;
const RES_2X2_SPAWN_CHANCE = { 1: 0.20, 2: 0.45, 3: 0.70 };
const RES_LARGE_SPAWN_CHANCE = {
  3: { 3: 0.18, 4: 0.08 },
  2: { 3: 0.08, 4: 0.00 },
  1: { 3: 0.00, 4: 0.00 },
};
const COM_LARGE_SPAWN_CHANCE = {
  3: { 2: 0.80, 3: 0.58, 4: 0.28 },
  2: { 2: 0.66, 3: 0.36, 4: 0.14 },
  1: { 2: 0.42, 3: 0.18, 4: 0.06 },
};
const IND_LARGE_SPAWN_CHANCE = {
  3: { 2: 0.65, 3: 0.30 },
  2: { 2: 0.48, 3: 0.14 },
  1: { 2: 0.24, 3: 0.00 },
};

// Population per zone level [unused, level1, level2, level3]
const POP_PER_LEVEL = [0, 4, 12, 30];

// Jobs provided per building
const JOBS_PER_COM = 8;
const JOBS_PER_IND = 12;

// Service coverage radii (Manhattan distance in tiles)
const FIRE_STATION_RADIUS   = 20;
const POLICE_STATION_RADIUS = 16;
const PRIMARY_SCHOOL_RADIUS = 14;
const SECONDARY_SCHOOL_RADIUS = 16;
const LIBRARY_RADIUS = 18;
const COMMUNITY_COLLEGE_RADIUS = 20;
const UNIVERSITY_RADIUS = 26;
const SMALL_PARK_RADIUS     = 6;
const LARGE_PARK_RADIUS     = 12;

// Education simulation tuning
const EDUCATION_BASIC_SMOOTHING = 0.10;
const EDUCATION_HIGHER_SMOOTHING = 0.07;
const EDUCATION_POLICY_REFORM_MUL = 1.25;
const SCIENCE_DEVELOPMENT_HIGHER_BONUS = 0.06;

// Placement costs (player-paid per action)
const COST_ROAD          = 10;
const COST_BRIDGE        = 75;
const COST_ZONE_RES      = 50;
const COST_ZONE_COM      = 60;
const COST_ZONE_IND      = 50;
const COST_POWER_LINE    = 5;
const COST_COAL_PLANT    = 3000;
const COST_SOLAR_PLANT   = 6000;
const COST_FIRE_STATION  = 1000;
const COST_POLICE_STATION = 800;
const COST_PRIMARY_SCHOOL = 1200;
const COST_SECONDARY_SCHOOL = 1800;
const COST_LIBRARY = 1600;
const COST_COMMUNITY_COLLEGE = 3200;
const COST_UNIVERSITY = 8000;
const COST_LEGISLATIVE_COUNCIL = 5200;
const COST_STOCK_EXCHANGE = 9800;
const COST_PARK_SMALL    = 250;
const COST_PARK_LARGE    = 900;
const COST_TREE          = 15;
const COST_BULLDOZE      = 5;

// Tree simulation
const TREE_MATURE_AGE = 6;
const TREE_INITIAL_DENSITY_GROUND = 0.035;
const TREE_INITIAL_DENSITY_HILL = 0.18;
const TREE_GROW_CHANCE_PER_TICK = 0.34;
const TREE_SPREAD_CHANCE_GROUND = 0.006;
const TREE_SPREAD_CHANCE_HILL = 0.024;
const TREE_VISUAL_OFFSET_COL_MAX = 16;
const TREE_VISUAL_OFFSET_ROW_MAX = 8;
const TREE_CANOPY_RADIUS = 5;
const TREE_POLLUTION_REDUCTION_PER_MATURE_TREE = 0.015;
const TREE_POLLUTION_REDUCTION_MAX_RATIO = 0.25;
const TREE_HAPPINESS_BONUS_MAX = 0.06;
const TREE_LAND_VALUE_BONUS_MAX = 0.14;
const TREE_FIRE_RISK_YOUNG = 0.018;
const TREE_FIRE_RISK_MATURE = 0.045;
const SCENIC_VIEW_RADIUS = 6;
const SCENIC_HAPPINESS_BONUS_MAX = 0.08;
const SCENIC_LAND_VALUE_BONUS_MAX = 0.16;

// Power plant model assets and logical footprints
const POWER_PLANT_MODELS = {
  power_plant_coal: {
    spriteKey: 'power_plant_coal_2x2',
    path: 'Models/powerPlant2x2/coalPowerPlant.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  power_plant_solar: {
    spriteKey: 'power_plant_solar_2x2',
    path: 'Models/powerPlant2x2/solarPowerPlant.png',
    footprintCols: 2,
    footprintRows: 2,
  },
};

const SERVICE_BUILDING_MODELS = {
  fire_station: {
    spriteKey: 'fire_station_2x2',
    path: 'Models/govBuildings/fireStation.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  police_station: {
    spriteKey: 'police_station_2x2',
    path: 'Models/govBuildings/policeStation.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  primary_school: {
    spriteKey: 'primary_school_2x2',
    path: 'Models/govBuildings/primarySchool2-01_fixed.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  secondary_school: {
    spriteKey: 'secondary_school_2x2',
    path: 'Models/govBuildings/secondarySchool2-02_fixed.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  library: {
    spriteKey: 'library_2x2',
    path: 'Models/govBuildings/library2-01_fixed.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  community_college: {
    spriteKey: 'community_college_2x2',
    path: 'Models/govBuildings/university2-01_fixed.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  university: {
    spriteKey: 'university_4x4',
    path: 'Models/govBuildings/university4-01_fixed.png',
    footprintCols: 4,
    footprintRows: 4,
  },
  legislative_council: {
    spriteKey: 'legislative_council_2x2',
    path: 'Models/govBuildings/legistrativeCouncil2-01_fixed.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  stock_exchange: {
    spriteKey: 'stock_exchange_4x4',
    path: 'Models/govBuildings/university4-02_fixed.png',
    footprintCols: 4,
    footprintRows: 4,
  },
};

const POWER_PLANT_STATS = {
  power_plant_coal: {
    generationMW: 600,
    baseUpkeep: 420,
    maxAgeMonths: 420,
    degradeStartMonths: 300,
    warningMonths: 60,
    minOutputRatio: 0.35,
    pollutionRadius: 24,
    pollutionStrength: 1.0,
    fireRadius: 16,
    fireStrength: 0.90,
    nuisanceRadius: 14,
    nuisanceStrength: 0.40,
  },
  power_plant_solar: {
    generationMW: 180,
    baseUpkeep: 140,
    maxAgeMonths: 300,
    degradeStartMonths: 240,
    warningMonths: 36,
    minOutputRatio: 0.45,
    pollutionRadius: 10,
    pollutionStrength: 0.18,
    fireRadius: 10,
    fireStrength: 0.12,
    nuisanceRadius: 10,
    nuisanceStrength: 0.18,
  },
};

const BUILDING_POWER_DEMAND = {
  residential: [0, 3, 6, 10],
  commercial:  [0, 4, 8, 14],
  industrial:  [0, 8, 14, 22],
  fire_station: 10,
  police_station: 8,
  primary_school: 6,
  secondary_school: 8,
  library: 7,
  community_college: 12,
  university: 30,
  park_small: 2,
  park_large: 4,
};

// Monthly upkeep costs
const UPKEEP_ROAD_PER_TILE  = 0.10;
const UPKEEP_COAL_PLANT     = POWER_PLANT_STATS.power_plant_coal.baseUpkeep;
const UPKEEP_SOLAR_PLANT    = POWER_PLANT_STATS.power_plant_solar.baseUpkeep;
const UPKEEP_FIRE_STATION   = 500;
const UPKEEP_POLICE_STATION = 400;
const UPKEEP_PRIMARY_SCHOOL = 180;
const UPKEEP_SECONDARY_SCHOOL = 260;
const UPKEEP_LIBRARY = 220;
const UPKEEP_COMMUNITY_COLLEGE = 420;
const UPKEEP_UNIVERSITY = 900;
const UPKEEP_PARK_SMALL     = 25;
const UPKEEP_PARK_LARGE     = 80;

// Starting budget
const STARTING_BUDGET = 10000;

// Pollution per building type per month
const POLLUTION_COAL_PLANT  = 20;
const POLLUTION_IND_BUILDING = 2;
const POLLUTION_SCIENCE_PARK_BUILDING = 0.2;

// Science-park progression tuning
const SCIENCE_PARK_UNLOCK_HIGHER_EDU = 0.8;
const SCIENCE_PARK_CONVERSION_CHANCE_BASE = 0.06;
const SCIENCE_PARK_CONVERSION_CHANCE_EDU_BONUS = 0.24;
const INDUSTRIAL_DEMAND_PENALTY_BASE = 3.0;
const INDUSTRIAL_DEMAND_PENALTY_MIN = 1.5;

// Month names for display
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Utility: create a 2D map array filled with a value
function createFilledMap(value) {
  return Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(value));
}
