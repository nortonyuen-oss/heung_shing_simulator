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

// Acts/laws are presented inside the Legislative Council window, grouped by category
// and each attributed to a mover for the chamber UI (council-ui.js). moverId is purely
// the "who proposed this" narrative attribution — distinct from COUNCIL_POLICY_METADATA's
// leadOfficialIds (council-policy-preview.js), which drives fiscal/need advisor opinions
// and stays as-is.
const CITY_POLICY_CATEGORY_IDS = Object.freeze([
  'financeEconomy',
  'safetyTransport',
  'environmentPlanning',
  'educationScience',
  'socialWelfare',
  'governanceReform',
]);
const CITY_POLICY_DEFS = [
  { id: 'cleanAir',       titleKey: 'policy.cleanAir.title',       descKey: 'policy.cleanAir.desc',       monthlyBase: 150, category: 'environmentPlanning', moverId: 'observatory_head' },
  { id: 'roadRepair',     titleKey: 'policy.roadRepair.title',     descKey: 'policy.roadRepair.desc',     monthlyBase: 120, category: 'safetyTransport', moverId: 'chief_executive' },
  { id: 'publicSafety',   titleKey: 'policy.publicSafety.title',   descKey: 'policy.publicSafety.desc',   monthlyBase: 200, category: 'safetyTransport', moverId: 'police_head' },
  { id: 'smallBusiness',  titleKey: 'policy.smallBusiness.title',  descKey: 'policy.smallBusiness.desc',  monthlyBase: 180, category: 'financeEconomy', moverId: 'councillor_business' },
  { id: 'greenParks',     titleKey: 'policy.greenParks.title',     descKey: 'policy.greenParks.desc',     monthlyBase: 100, category: 'environmentPlanning', moverId: 'culture_head' },
  { id: 'educationReform', titleKey: 'policy.educationReform.title', descKey: 'policy.educationReform.desc', monthlyBase: 220, category: 'educationScience', moverId: 'councillor_democracy' },
  { id: 'scienceDevelopment', titleKey: 'policy.scienceDevelopment.title', descKey: 'policy.scienceDevelopment.desc', monthlyBase: 260, category: 'educationScience', moverId: 'councillor_liberty' },
  { id: 'smokingBan', titleKey: 'policy.smokingBan.title', descKey: 'policy.smokingBan.desc', monthlyBase: 130, unlockPopulation: 10000, category: 'safetyTransport', moverId: 'councillor_religion' },
  { id: 'schoolHealthProgram', titleKey: 'policy.schoolHealthProgram.title', descKey: 'policy.schoolHealthProgram.desc', monthlyBase: 180, unlockPopulation: 10000, category: 'socialWelfare', moverId: 'councillor_religion' },
  { id: 'tourismPromotion', titleKey: 'policy.tourismPromotion.title', descKey: 'policy.tourismPromotion.desc', monthlyBase: 160, unlockPopulation: 10000, category: 'financeEconomy', moverId: 'councillor_tourism' },
  { id: 'foreignInvestmentIncentive', titleKey: 'policy.foreignInvestmentIncentive.title', descKey: 'policy.foreignInvestmentIncentive.desc', monthlyBase: 240, unlockPopulation: 10000, category: 'financeEconomy', moverId: 'treasury_head' },
  { id: 'districtCouncilElection', titleKey: 'policy.districtCouncilElection.title', descKey: 'policy.districtCouncilElection.desc', monthlyBase: 140, unlockPopulation: 10000, category: 'governanceReform', moverId: 'councillor_democracy' },
  { id: 'icac', titleKey: 'policy.icac.title', descKey: 'policy.icac.desc', monthlyBase: 200, unlockPopulation: 10000, category: 'governanceReform', moverId: 'chief_executive' },
  { id: 'legislativeCouncilElection', titleKey: 'policy.legislativeCouncilElection.title', descKey: 'policy.legislativeCouncilElection.desc', monthlyBase: 180, unlockPopulation: 10000, category: 'governanceReform', moverId: 'councillor_democracy' },
  { id: 'stockExchangeAct', titleKey: 'policy.stockExchangeAct.title', descKey: 'policy.stockExchangeAct.desc', monthlyBase: 220, unlockPopulation: 50000, category: 'financeEconomy', moverId: 'treasury_head' },
  { id: 'elderlyTwoDollarFare', titleKey: 'policy.elderlyTwoDollarFare.title', descKey: 'policy.elderlyTwoDollarFare.desc', monthlyBase: 260, unlockPopulation: 10000, category: 'socialWelfare', moverId: 'councillor_religion' },
  { id: 'arcticPenguinReserve', titleKey: 'policy.arcticPenguinReserve.title', descKey: 'policy.arcticPenguinReserve.desc', monthlyBase: 320, unlockPopulation: 25000, category: 'environmentPlanning', moverId: 'observatory_head' },
  { id: 'busSeatbeltMandate', titleKey: 'policy.busSeatbeltMandate.title', descKey: 'policy.busSeatbeltMandate.desc', monthlyBase: 190, unlockPopulation: 10000, category: 'safetyTransport', moverId: 'police_head' },
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
const STOCK_CRASH_BASE_MONTHLY_CHANCE = 0.003;
const STOCK_CRASH_MAX_MONTHLY_CHANCE = 0.09;
const STOCK_CRASH_DROP_RANGE = Object.freeze([0.30, 0.50]);
const STOCK_CRASH_DURATION_MONTHS = Object.freeze([3, 6]);
const STOCK_CRASH_COOLDOWN_MONTHS = Object.freeze([18, 36]);
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
const PREMIUM_VISUAL_UPGRADE_CHANCE_PER_MONTH = 0.012;
const PREMIUM_VISUAL_REBALANCE_CHANCE_PER_MONTH = 0.045;
const SKYLINE_NEIGHBORHOOD_RADIUS = 6;
const SKYLINE_REPEAT_MODEL_PENALTY = 0.18;
const RES_2X2_SPAWN_CHANCE = { 1: 0.20, 2: 0.45, 3: 0.70 };
const RES_LARGE_SPAWN_CHANCE = {
  3: { 3: 0.18, 4: 0.08, 5: 0.04 },
  2: { 3: 0.08, 4: 0.00, 5: 0.00 },
  1: { 3: 0.00, 4: 0.00, 5: 0.00 },
};
const RESIDENTIAL_WEALTH_PROBABILITIES = [
  { maxQuality: 0.29, weights: { L: 0.78, M: 0.21, H: 0.01, UH: 0.00 } },
  { maxQuality: 0.44, weights: { L: 0.65, M: 0.32, H: 0.03, UH: 0.00 } },
  { maxQuality: 0.59, weights: { L: 0.52, M: 0.40, H: 0.08, UH: 0.00 } },
  { maxQuality: 0.74, weights: { L: 0.43, M: 0.38, H: 0.19, UH: 0.00 } },
  { maxQuality: 0.84, weights: { L: 0.35, M: 0.38, H: 0.24, UH: 0.03 } },
  { maxQuality: 1.00, weights: { L: 0.30, M: 0.37, H: 0.28, UH: 0.05 } },
];
const RESIDENTIAL_H_MINIMUMS = Object.freeze({
  quality: 0.55,
  landValue: 0.50,
  environment: 0.45,
  health: 0.45,
  economy: 0.45,
});
const RESIDENTIAL_UH_MINIMUMS = Object.freeze({
  quality: 0.76,
  landValue: 0.72,
  scenic: 0.55,
  environment: 0.68,
  health: 0.62,
  economy: 0.65,
  maxPollution: 0.20,
});
const RESIDENTIAL_LOW_DENSITY_3X3_CHANCE = Object.freeze({ premium: 0.06, elite: 0.12 });
const COMMERCIAL_TIER_PROBABILITIES = [
  { maxQuality: 0.29, weights: { L: 0.80, M: 0.20, H: 0.00, UH: 0.00 } },
  { maxQuality: 0.44, weights: { L: 0.66, M: 0.31, H: 0.03, UH: 0.00 } },
  { maxQuality: 0.59, weights: { L: 0.52, M: 0.40, H: 0.08, UH: 0.00 } },
  { maxQuality: 0.74, weights: { L: 0.42, M: 0.39, H: 0.19, UH: 0.00 } },
  { maxQuality: 0.84, weights: { L: 0.34, M: 0.38, H: 0.25, UH: 0.03 } },
  { maxQuality: 1.00, weights: { L: 0.28, M: 0.38, H: 0.29, UH: 0.05 } },
];
const COMMERCIAL_H_MINIMUMS = Object.freeze({
  quality: 0.56,
  landValue: 0.50,
  environment: 0.40,
  economy: 0.52,
});
const COMMERCIAL_UH_MINIMUMS = Object.freeze({
  quality: 0.78,
  landValue: 0.70,
  scenic: 0.35,
  environment: 0.55,
  economy: 0.72,
  stockExchange: 0.55,
  airport: 0.55,
  maxPollution: 0.25,
});
const COMMERCIAL_CATALYST_RADIUS = Object.freeze({ stockExchange: 28, airport: 42 });
const COM_LARGE_SPAWN_CHANCE = {
  3: { 2: 0.80, 3: 0.58, 4: 0.28, 5: 0.07 },
  2: { 2: 0.66, 3: 0.36, 4: 0.14, 5: 0.02 },
  1: { 2: 0.42, 3: 0.18, 4: 0.06, 5: 0.00 },
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
const HOSPITAL_RADIUS = 22;
const SMALL_PARK_RADIUS      = 6;
const LARGE_PARK_RADIUS      = 12;
const SPORTS_GROUND_RADIUS   = 10;

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
const COST_NUCLEAR_PLANT = 28000;
const COST_FIRE_STATION  = 1000;
const COST_POLICE_STATION = 800;
const COST_PRIMARY_SCHOOL = 1200;
const COST_SECONDARY_SCHOOL = 1800;
const COST_LIBRARY = 1600;
const COST_COMMUNITY_COLLEGE = 3200;
const COST_UNIVERSITY = 8000;
const COST_HOSPITAL = 7200;
const COST_LEGISLATIVE_COUNCIL = 5200;
const COST_STOCK_EXCHANGE = 9800;
const COST_PARK_SMALL          = 250;
const COST_PARK_LARGE          = 900;
const COST_SPORTS_GROUND_SMALL = 600;
const COST_SPORTS_GROUND_LARGE = 1400;
const COST_TREE          = 15;
const COST_BULLDOZE      = 5;

// Tree simulation
const TREE_SYSTEM_VERSION = 3;            // bump when generation algorithm changes
const TREE_MATURE_AGE = 6;
const TREE_BASE_DENSITY = 0.008;          // background (non-forest) tile density
const TREE_FOREST_COUNT_MIN = 15;
const TREE_FOREST_COUNT_MAX = 25;
const TREE_FOREST_RADIUS_MIN = 5;
const TREE_FOREST_RADIUS_MAX = 12;
const TREE_FOREST_STRENGTH_MIN = 0.45;
const TREE_FOREST_STRENGTH_MAX = 0.70;
const TREE_GROW_CHANCE_PER_TICK = 0.34;
const TREE_SPREAD_CHANCE_GROUND = 0.001;   // was 0.006 — slower spread prevents map saturation
const TREE_SPREAD_CHANCE_HILL = 0.003;     // was 0.024
const TREE_DEATH_CHANCE_PER_TICK = 0.0008; // mature trees slowly die, balancing spread
const TREE_SPREAD_NEIGHBOR_CAP = 3;        // no spread when this many cardinal neighbours already have trees
const TREE_VISUAL_OFFSET_COL_MAX = 5;
const TREE_VISUAL_OFFSET_ROW_MAX = 3;
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
// Updated model canvases have an intentional isometric base point. Anchor that
// true lowest corner to the map rather than the wider "stable" alpha row above it.
const DEFAULT_BUILDING_ANCHOR_MODE = 'effective-bottom-to-map-bottom';

const POWER_PLANT_MODELS = {
  power_plant_coal: {
    spriteKey: 'power_plant_coal_2x2',
    path: 'Models/powerStation/coalPowerPlant.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  power_plant_solar: {
    spriteKey: 'power_plant_solar_2x2',
    path: 'Models/powerStation/solarPowerPlant.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  power_plant_nuclear: {
    spriteKey: 'power_plant_nuclear_4x4',
    path: 'Models/powerStation/nuclearPower4x4.png',
    footprintCols: 4,
    footprintRows: 4,
  },
};

const SERVICE_BUILDING_MODELS = {
  fire_station: {
    spriteKey: 'fire_station_2x2',
    path: 'Models/government/2x2/fireStation2-01.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  police_station: {
    spriteKey: 'police_station_2x2',
    path: 'Models/government/2x2/policeStation2-01.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  primary_school: {
    spriteKey: 'primary_school_2x2',
    path: 'Models/government/2x2/primarySchool2-01.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  secondary_school: {
    spriteKey: 'secondary_school_2x2',
    path: 'Models/government/2x2/secondarySchool2-01.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  library: {
    spriteKey: 'library_2x2',
    path: 'Models/government/2x2/library2-01.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  community_college: {
    spriteKey: 'community_college_3x3',
    path: 'Models/government/3x3/college3-01.png',
    footprintCols: 3,
    footprintRows: 3,
  },
  university: {
    spriteKey: 'university_4x4',
    path: 'Models/government/4x4/university4-01.png',
    footprintCols: 4,
    footprintRows: 4,
  },
  hospital: {
    spriteKey: 'hospital_4x4',
    path: 'Models/government/4x4/hospital4.png',
    footprintCols: 4,
    footprintRows: 4,
  },
  legislative_council: {
    spriteKey: 'legislative_council_2x2',
    path: 'Models/government/2x2/legislativeCouncil2-02.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  stock_exchange: {
    spriteKey: 'stock_exchange_4x4',
    path: 'Models/government/4x4/stockExchange4-01.png',
    footprintCols: 4,
    footprintRows: 4,
  },
  // Sports grounds: two sizes, handled via SPORT_GROUND_OPTIONS picker
  sports_ground_small: {
    spriteKey: 'sports_ground_2x2',
    path: 'Models/parks/park2x2/sportField3-02.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  sports_ground_large: {
    spriteKey: 'sports_ground_3x3',
    path: 'Models/parks/park3x3/sportField3-01.png',
    footprintCols: 3,
    footprintRows: 3,
  },
};

// Same-service visual variants are chosen when the player constructs the
// building. The chosen sprite key is persisted, so loading a save never
// changes an existing building's appearance.
const SERVICE_BUILDING_MODEL_VARIANTS = {
  fire_station: [
    SERVICE_BUILDING_MODELS.fire_station,
    {
      spriteKey: 'fire_station_2x2_alt',
      path: 'Models/government/2x2/firestation2-02.png',
      footprintCols: 2,
      footprintRows: 2,
    },
  ],
  police_station: [
    SERVICE_BUILDING_MODELS.police_station,
    {
      spriteKey: 'police_station_2x2_alt',
      path: 'Models/government/2x2/policeStation2-02.png',
      footprintCols: 2,
      footprintRows: 2,
    },
  ],
  secondary_school: [
    SERVICE_BUILDING_MODELS.secondary_school,
    {
      spriteKey: 'secondary_school_2x2_alt',
      path: 'Models/government/2x2/secondarySchool2-02.png',
      footprintCols: 2,
      footprintRows: 2,
    },
  ],
  community_college: [
    SERVICE_BUILDING_MODELS.community_college,
    {
      spriteKey: 'community_college_3x3_alt_2',
      path: 'Models/government/3x3/college3-02.png',
      footprintCols: 3,
      footprintRows: 3,
    },
    {
      spriteKey: 'community_college_3x3_alt_3',
      path: 'Models/government/3x3/college3-03.png',
      footprintCols: 3,
      footprintRows: 3,
    },
    {
      spriteKey: 'community_college_3x3_alt_4',
      path: 'Models/government/3x3/college3-04.png',
      footprintCols: 3,
      footprintRows: 3,
    },
  ],
  university: [
    SERVICE_BUILDING_MODELS.university,
    {
      spriteKey: 'university_4x4_alt',
      path: 'Models/government/4x4/university4-02.png',
      footprintCols: 4,
      footprintRows: 4,
    },
  ],
  legislative_council: [
    SERVICE_BUILDING_MODELS.legislative_council,
    {
      spriteKey: 'legislative_council_2x2_alt',
      path: 'Models/government/2x2/legislativeCouncil2-01.png',
      footprintCols: 2,
      footprintRows: 2,
    },
  ],
};

function getServiceBuildingModels(buildingType) {
  return SERVICE_BUILDING_MODEL_VARIANTS[buildingType]
    ?? (SERVICE_BUILDING_MODELS[buildingType] ? [SERVICE_BUILDING_MODELS[buildingType]] : []);
}

// These frequently repeated civic buildings use every visual variant in a
// predictable order before starting over. Other service types retain their
// existing random selection behaviour.
const CYCLIC_SERVICE_BUILDING_TYPES = new Set([
  'fire_station',
  'police_station',
  'community_college',
  'university',
]);

function selectServiceBuildingModel(buildingType, existingCount = 0, randomValue = Math.random()) {
  const models = getServiceBuildingModels(buildingType);
  if (models.length === 0) return null;

  if (CYCLIC_SERVICE_BUILDING_TYPES.has(buildingType)) {
    const index = Math.max(0, Math.floor(Number(existingCount) || 0)) % models.length;
    return models[index];
  }

  const randomIndex = Math.min(models.length - 1, Math.floor(Math.max(0, Number(randomValue) || 0) * models.length));
  return models[randomIndex];
}

// ── Special buildings (landmarks) ──────────────────────────────────────────
// Population/policy-gated one-off buildings. Placed through the same
// placeInfraBuilding() pipeline as SERVICE_BUILDING_MODELS, but gated by
// SPECIAL_BUILDING_UNLOCKS instead of budget alone.
const SPECIAL_BUILDING_MODELS = {
  exhibition_center: {
    spriteKey: 'exhibition_center_4x4',
    path: 'Models/specialSites/4x4/exhibitionCentre4-01.png',
    footprintCols: 4,
    footprintRows: 4,
  },
  cultural_center: {
    spriteKey: 'cultural_center_4x4',
    path: 'Models/specialSites/4x4/culturalCentre4-01.png',
    footprintCols: 4,
    footprintRows: 4,
  },
  space_museum: {
    spriteKey: 'space_museum_2x2',
    path: 'Models/specialSites/2x2/spaceMuseum2-01.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  buddha_statue: {
    spriteKey: 'buddha_statue_3x3',
    path: 'Models/specialSites/3x3/buddha3-01.png',
    footprintCols: 3,
    footprintRows: 3,
  },
  heritage_temple: {
    spriteKey: 'heritage_temple_2x2',
    path: 'Models/specialSites/2x2/tample2-01.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  heritage_church: {
    spriteKey: 'heritage_church_3x3',
    path: 'Models/specialSites/3x3/church3-01.png',
    footprintCols: 3,
    footprintRows: 3,
  },
  indoor_coliseum: {
    spriteKey: 'indoor_coliseum_3x3',
    path: 'Models/specialSites/3x3/hungHomColiseum3-01_fixed.png',
    footprintCols: 3,
    footprintRows: 3,
  },
  murray_house: {
    spriteKey: 'murray_house_2x2',
    path: 'Models/specialSites/2x2/murrayHouse2-01.png',
    footprintCols: 2,
    footprintRows: 2,
  },
  ocean_park: {
    spriteKey: 'ocean_park_4x4',
    path: 'Models/specialSites/4x4/oceanPark4-01.png',
    footprintCols: 4,
    footprintRows: 4,
  },
  football_stadium: {
    spriteKey: 'football_stadium_4x4',
    path: 'Models/specialSites/4x4/footballStadium4-02.png',
    footprintCols: 4,
    footprintRows: 4,
  },
  airport: {
    spriteKey: 'airport_12x12',
    path: 'Models/airPort/6x6/airport6-01.png',
    // The source image is occasionally replaced without changing its filename.
    // Version the request URL so browsers do not retain the previous airport.
    cacheVersion: '20260719-12x12-v4',
    footprintCols: 12,
    footprintRows: 12,
  },
};

// Existing saves used the same source art as a 6x6 airport. Keep that visual
// footprint loadable so migration never claims or overwrites adjacent tiles.
const LEGACY_AIRPORT_MODEL = {
  spriteKey: 'airport_6x6_legacy',
  path: 'Models/airPort/6x6/airport6-01.png',
  cacheVersion: '20260719-12x12-v4',
  footprintCols: 6,
  footprintRows: 6,
};

const LEGACY_AIRPORT_8X8_MODEL = {
  spriteKey: 'airport_8x8_legacy',
  path: 'Models/airPort/6x6/airport6-01.png',
  cacheVersion: '20260719-12x12-v4',
  footprintCols: 8,
  footprintRows: 8,
};

const SPECIAL_BUILDING_MODEL_VARIANTS = {
  heritage_temple: [
    SPECIAL_BUILDING_MODELS.heritage_temple,
    {
      spriteKey: 'heritage_temple_2x2_alt',
      path: 'Models/specialSites/2x2/tample2-02.png',
      footprintCols: 2,
      footprintRows: 2,
    },
  ],
};

function getSpecialBuildingModels(buildingType) {
  return SPECIAL_BUILDING_MODEL_VARIANTS[buildingType]
    ?? (SPECIAL_BUILDING_MODELS[buildingType] ? [SPECIAL_BUILDING_MODELS[buildingType]] : []);
}

function getAllSpecialBuildingModels(buildingType) {
  const models = getSpecialBuildingModels(buildingType);
  return buildingType === 'airport'
    ? [...models, LEGACY_AIRPORT_MODEL, LEGACY_AIRPORT_8X8_MODEL]
    : models;
}

// Container port: footprint is fixed but the sprite is chosen per-tile from the
// coastline shape (see getHarborVisualKey in main.js), so it isn't a simple
// type→spriteKey map like the other registries.
const HARBOR_BUILDING_TYPE = 'container_port';
const HARBOR_FOOTPRINT_COLS = 4;
const HARBOR_FOOTPRINT_ROWS = 4;
const HARBOR_MODELS = {
  harbor_ll: {
    spriteKey: 'harbor_ll',
    path: 'Models/containerPort/4x4/containerPort3-LL.png',
    footprintCols: HARBOR_FOOTPRINT_COLS,
    footprintRows: HARBOR_FOOTPRINT_ROWS,
  },
  harbor_lr: {
    spriteKey: 'harbor_lr',
    path: 'Models/containerPort/4x4/containerPort3-LR.png',
    footprintCols: HARBOR_FOOTPRINT_COLS,
    footprintRows: HARBOR_FOOTPRINT_ROWS,
  },
  harbor_ul: {
    spriteKey: 'harbor_ul',
    path: 'Models/containerPort/4x4/containerPort3-UL.png',
    footprintCols: HARBOR_FOOTPRINT_COLS,
    footprintRows: HARBOR_FOOTPRINT_ROWS,
  },
  harbor_ur: {
    spriteKey: 'harbor_ur',
    path: 'Models/containerPort/4x4/containerPort3-UR.png',
    footprintCols: HARBOR_FOOTPRINT_COLS,
    footprintRows: HARBOR_FOOTPRINT_ROWS,
  },
};

// Unlock gates for special buildings + the harbour. Checked generically by
// getSpecialBuildingUnlockState() in city-state.js.
// Landmarks (specialSites) are one-off — each city gets exactly one of each.
// Harbour/airport are ordinary (repeatable) infrastructure, so they get no
// maxCount here even though they share the same unlock-gate mechanism.
const SPECIAL_BUILDING_UNLOCKS = {
  exhibition_center: { unlockPopulation: 30000, maxCount: 1 },
  cultural_center:    { unlockPopulation: 20000, maxCount: 1 },
  space_museum:       { unlockPopulation: 15000, requiresPolicy: 'scienceDevelopment', maxCount: 1 },
  buddha_statue:      { unlockPopulation: 12000, maxCount: 1 },
  heritage_temple:    { unlockPopulation: 8000, maxCount: 1 },
  heritage_church:    { unlockPopulation: 6000, maxCount: 1 },
  indoor_coliseum:    { unlockPopulation: 30000, maxCount: 1 },
  murray_house:       { unlockAttractiveness: 60, maxCount: 1 },
  ocean_park:         { unlockPopulation: 25000, maxCount: 1 },
  football_stadium:   { unlockPopulation: 40000, maxCount: 1 },
  airport:            { requiresResolution: 'roseGardenAirportProject', hideUntilApproved: true, maxCount: 1 },
  container_port:     { unlockPopulation: 15000 },
};

// Gameplay effects for each special building / the harbour. attractivenessBonus
// and happinessBonus are flat city-wide contributions (summed in
// council-effects.js / simulation.js); landValueBonus is radius-based like the
// tree/scenic bonuses in overlay-controls.js; nuisanceRadius/Strength dents
// nearby land value like POWER_PLANT_STATS; revenue/upkeep feed the monthly
// budget in city-state.js.
const SPECIAL_BUILDING_EFFECTS = {
  exhibition_center: { attractivenessBonus: 6,  landValueBonus: 0.10, landValueRadius: 10, revenue: 260, upkeep: 900 },
  cultural_center:    { attractivenessBonus: 5,  landValueBonus: 0.08, landValueRadius: 8,  happinessBonus: 0.015, upkeep: 520 },
  space_museum:       { attractivenessBonus: 4,  landValueBonus: 0.06, landValueRadius: 7,  happinessBonus: 0.010, upkeep: 380 },
  buddha_statue:      { attractivenessBonus: 5,  landValueBonus: 0.05, landValueRadius: 9,  happinessBonus: 0.015, upkeep: 150 },
  heritage_temple:    { attractivenessBonus: 3,  landValueBonus: 0.05, landValueRadius: 7,  happinessBonus: 0.010, upkeep: 120 },
  heritage_church:    { attractivenessBonus: 4,  landValueBonus: 0.06, landValueRadius: 7,  happinessBonus: 0.012, upkeep: 150 },
  indoor_coliseum:    { attractivenessBonus: 6,  landValueBonus: 0.07, landValueRadius: 8,  happinessBonus: 0.010, revenue: 300, upkeep: 650 },
  murray_house:       { attractivenessBonus: 3,  landValueBonus: 0.06, landValueRadius: 6,  upkeep: 140 },
  ocean_park:         { attractivenessBonus: 10, landValueBonus: 0.06, landValueRadius: 10, revenue: 900, upkeep: 1400 },
  football_stadium:   {
    attractivenessBonus: 6, landValueBonus: 0.08, landValueRadius: 9, happinessBonus: 0.010,
    pollutionReductionRadius: 8, pollutionReductionStrength: 0.10,
    revenue: 400, upkeep: 900,
  },
  airport:            {
    attractivenessBonus: 14, landValueBonus: 0.05, landValueRadius: 8,
    nuisanceRadius: 20, nuisanceStrength: 0.30,
    revenue: 1400, upkeep: 2600,
  },
  container_port:     {
    nuisanceRadius: 12, nuisanceStrength: 0.28,
    revenue: 500, upkeep: 700,
  },
};

const SPECIAL_BUILDING_COSTS = {
  exhibition_center: 15000,
  cultural_center:    9000,
  space_museum:       6500,
  buddha_statue:       4200,
  heritage_temple:     2600,
  heritage_church:     3200,
  indoor_coliseum:    12000,
  murray_house:        1800,
  ocean_park:         22000,
  football_stadium:   18000,
  airport:           150000,
  container_port:     12000,
};

// Flagship park tier (e.g. Victoria Park) — mechanically a bigger, pricier,
// stronger-coverage sibling of park_large, repeatable like any other park.
const COST_PARK_FLAGSHIP   = 2200;
const UPKEEP_PARK_FLAGSHIP = 180;
const FLAGSHIP_PARK_RADIUS = 16;

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
  power_plant_nuclear: {
    generationMW: 2400,
    baseUpkeep: 900,
    maxAgeMonths: 720,          // 60 years
    degradeStartMonths: 600,    // starts degrading at 50 years
    warningMonths: 60,          // 5-year decommission warning
    minOutputRatio: 0.65,       // stays efficient longer than coal
    pollutionRadius: 4,         // near-zero operational air emissions
    pollutionStrength: 0.015,   // lifecycle footprint is tiny beside coal
    fireRadius: 22,             // meltdown blast radius
    fireStrength: 0.98,         // catastrophic if ignited
    nuisanceRadius: 22,         // NIMBY radiation fear
    nuisanceStrength: 0.70,
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
  hospital: 22,
  park_small: 2,
  park_large: 4,
  park_flagship: 7,
  sports_ground_small: 4,
  sports_ground_large: 8,
  exhibition_center: 24,
  cultural_center: 14,
  space_museum: 10,
  buddha_statue: 4,
  heritage_temple: 3,
  heritage_church: 4,
  indoor_coliseum: 18,
  murray_house: 3,
  ocean_park: 32,
  football_stadium: 26,
  airport: 60,
  container_port: 20,
};

// Monthly upkeep costs
const UPKEEP_ROAD_PER_TILE  = 0.10;
const UPKEEP_COAL_PLANT     = POWER_PLANT_STATS.power_plant_coal.baseUpkeep;
const UPKEEP_SOLAR_PLANT    = POWER_PLANT_STATS.power_plant_solar.baseUpkeep;
const UPKEEP_NUCLEAR_PLANT  = POWER_PLANT_STATS.power_plant_nuclear.baseUpkeep;
const UPKEEP_FIRE_STATION   = 500;
const UPKEEP_POLICE_STATION = 400;
const UPKEEP_PRIMARY_SCHOOL = 180;
const UPKEEP_SECONDARY_SCHOOL = 260;
const UPKEEP_LIBRARY = 220;
const UPKEEP_COMMUNITY_COLLEGE = 420;
const UPKEEP_UNIVERSITY = 900;
const UPKEEP_HOSPITAL = 700;

// Health system tuning
const HOSPITAL_CAPACITY_PER_BUILDING = 12000;
const HEALTH_SMOKING_BAN_BONUS = 0.04;
const HEALTH_SCHOOL_PROGRAM_BONUS = 0.035;
const EPIDEMIC_MONTHLY_TRIGGER_BASE = 0.018;
const EPIDEMIC_RECOVERY_RATE = 0.18;
const UPKEEP_PARK_SMALL          = 25;
const UPKEEP_PARK_LARGE          = 80;
const UPKEEP_SPORTS_GROUND_SMALL = 60;
const UPKEEP_SPORTS_GROUND_LARGE = 160;

// Starting budget
const STARTING_BUDGET = 10000;

// Pollution per building type per month
const POLLUTION_COAL_PLANT    = 20;
// Nuclear lifecycle emissions are roughly 0.5% of coal per kWh. One nuclear
// plant produces 4x the electricity of coal here, so 0.4 is ~2% of a coal
// plant's total pollution contribution at four times the output. Accident risk
// and perceived nuisance remain separate in POWER_PLANT_STATS.
const POLLUTION_NUCLEAR_PLANT = 0.4;
const POLLUTION_IND_BUILDING  = 2;
const POLLUTION_SCIENCE_PARK_BUILDING = 0.2;

// Science-park progression tuning
const SCIENCE_PARK_UNLOCK_HIGHER_EDU = 0.8;
const SCIENCE_PARK_CONVERSION_CHANCE_BASE = 0.06;
const SCIENCE_PARK_CONVERSION_CHANCE_EDU_BONUS = 0.24;
const INDUSTRIAL_DEMAND_PENALTY_BASE = 3.0;
const INDUSTRIAL_DEMAND_PENALTY_MIN = 1.5;

// Labour market model
// Each job anchor (JOBS_PER_COM / JOBS_PER_IND) represents this many residents
// economically, so job capacity is anchor_count × ANCHOR_RATIO.
const ANCHOR_RATIO = 30;
// Fraction of population that is working-age labour force
const LABOUR_FORCE_RATIO = 0.60;
// Max happiness penalty when unemployment is 100%
const UNEMPLOYMENT_HAPPINESS_PENALTY = 0.25;
// Fraction of higher-edu labour force preferring commercial / science-park jobs
const HIGH_EDU_COM_PREFERENCE = 0.70;
// Fraction of non-higher-edu labour force seeking industrial jobs
const LOW_EDU_IND_PREFERENCE = 0.55;
// Unemployment rate at which crime risk starts being amplified
const UNEMPLOYMENT_CRIME_AMPLIFY_MAX = 0.50;

// Month names for display
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Utility: create a 2D map array filled with a value
function createFilledMap(value) {
  return Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(value));
}
