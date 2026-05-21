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

// Five starter acts/laws. Effects are applied in simulation.js.
const CITY_POLICY_DEFS = [
  { id: 'cleanAir',       titleKey: 'policy.cleanAir.title',       descKey: 'policy.cleanAir.desc',       monthlyBase: 150 },
  { id: 'roadRepair',     titleKey: 'policy.roadRepair.title',     descKey: 'policy.roadRepair.desc',     monthlyBase: 120 },
  { id: 'publicSafety',   titleKey: 'policy.publicSafety.title',   descKey: 'policy.publicSafety.desc',   monthlyBase: 200 },
  { id: 'smallBusiness',  titleKey: 'policy.smallBusiness.title',  descKey: 'policy.smallBusiness.desc',  monthlyBase: 180 },
  { id: 'greenParks',     titleKey: 'policy.greenParks.title',     descKey: 'policy.greenParks.desc',     monthlyBase: 100 },
];

// Growth probabilities per tick
const GROW_CHANCE_BASE = 0.4;
const UPGRADE_CHANCE   = 0.15;
const SHRINK_CHANCE    = 0.30;
const RES_2X2_SPAWN_CHANCE = { 1: 0.20, 2: 0.45, 3: 0.70 };

// Population per zone level [unused, level1, level2, level3]
const POP_PER_LEVEL = [0, 4, 12, 30];

// Jobs provided per building
const JOBS_PER_COM = 8;
const JOBS_PER_IND = 12;

// Service coverage radii (Manhattan distance in tiles)
const FIRE_STATION_RADIUS   = 20;
const POLICE_STATION_RADIUS = 16;
const SMALL_PARK_RADIUS     = 6;
const LARGE_PARK_RADIUS     = 12;

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
const COST_PARK_SMALL    = 250;
const COST_PARK_LARGE    = 900;
const COST_BULLDOZE      = 5;

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
  park_small: 2,
  park_large: 4,
};

// Monthly upkeep costs
const UPKEEP_ROAD_PER_TILE  = 0.10;
const UPKEEP_COAL_PLANT     = POWER_PLANT_STATS.power_plant_coal.baseUpkeep;
const UPKEEP_SOLAR_PLANT    = POWER_PLANT_STATS.power_plant_solar.baseUpkeep;
const UPKEEP_FIRE_STATION   = 500;
const UPKEEP_POLICE_STATION = 400;
const UPKEEP_PARK_SMALL     = 25;
const UPKEEP_PARK_LARGE     = 80;

// Starting budget
const STARTING_BUDGET = 10000;

// Pollution per building type per month
const POLLUTION_COAL_PLANT  = 20;
const POLLUTION_IND_BUILDING = 2;

// Month names for display
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Utility: create a 2D map array filled with a value
function createFilledMap(value) {
  return Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(value));
}
