const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { computePublicMarketState, getPublicMarketResidentialEffect: effect,
  getPublicMarketTileLandBonus: landBonus, getPublicMarketCommercialGrowthMultiplier: commerce,
} = require('../public-market.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const market = () => ({ type: 'public_market', footprintCols: 2, footprintRows: 2 });
const home = (population = 800, wealthTier = 'L', size = 1) => ({
  type: 'residential', population, wealthTier, footprintCols: size, footprintRows: size,
});
const state = (buildings, options = {}) => computePublicMarketState({
  buildings, isPowered: () => true, hasRoadAccess: () => true, ...options,
});
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function fn(file, name) {
  const s = read(file), a = s.indexOf(`function ${name}(`), b = s.indexOf('\n}\n', a) + 3;
  assert.ok(a >= 0 && b > a, name);
  return s.slice(a, b);
}

test('ordinary households gain three quality points; wealthy neighbours gain none; UH loses five', () => {
  const s = state({ '10:10': market() });
  for (const tier of ['L', 'M']) {
    approx(effect(10, 12, 1, 1, tier, s).qualityBonus, .03);
    approx(landBonus(10, 12, tier, s), .02);
  }
  approx(effect(10, 12, 1, 1, 'H', s).qualityBonus, 0);
  approx(landBonus(10, 12, 'H', s), 0);
  approx(effect(10, 12, 1, 1, 'UH', s).qualityBonus, -.05);
  approx(landBonus(10, 12, 'UH', s), 0);
  approx(effect(10, 12, 1, 1, 'UH', s).ultraRichWeight, .5);
});

test('distance is measured from the lot edge; nuisance fades out and wealthy households benefit farther away', () => {
  const s = state({ '10:10': market() });
  approx(effect(10, 13, 1, 1, 'UH', s).qualityBonus, -.05); // two tiles from the right edge
  approx(effect(10, 14, 1, 1, 'UH', s).qualityBonus, -.0375);
  approx(effect(10, 14, 1, 1, 'H', s).qualityBonus, .0075);
  approx(effect(10, 17, 1, 1, 'UH', s).qualityBonus, 0);
  approx(effect(10, 17, 1, 1, 'L', s).qualityBonus, 0);
  approx(effect(10, 17, 1, 1, 'UH', s).ultraRichWeight, 1);
});

test('overlapping markets cap quality, land premium and commercial growth rather than stacking', () => {
  const s = state({ '10:8': market(), '10:11': market() });
  approx(effect(10, 10, 1, 1, 'L', s).qualityBonus, .03);
  approx(effect(10, 10, 1, 1, 'UH', s).qualityBonus, -.05);
  approx(landBonus(10, 10, 'L', s), .02);
  approx(commerce(10, 10, s), 1.05);
  approx(commerce(10, 5, s), 1 + .05 / 3);
  approx(commerce(10, 4, s), 1);
});

test('800 residents support $100 rent and $20 net; vacant markets still cost $80', () => {
  const s = state({ '10:10': market(), '10:12': home() });
  const m = s.markets.get('10:10');
  approx(m.servedResidents, 800); approx(m.occupancy, 1);
  approx(m.rent, 100); approx(m.upkeep, 80); approx(m.net, 20);
  const vacant = state({ '10:10': market(), '10:12': home(0) }).markets.get('10:10');
  approx(vacant.rent, 0); approx(vacant.net, -80);
  approx(state({ '10:10': market(), '10:12': home(5000) }).revenue, 100);
});

test('two markets divide one population pool; record insertion order does not create extra customers or rent', () => {
  const buildings = { '10:8': market(), '10:11': market(), '10:10': home() };
  for (const b of [buildings, Object.fromEntries(Object.entries(buildings).reverse())]) {
    const s = state(b);
    for (const m of s.markets.values()) {
      approx(m.servedResidents, 400); approx(m.rent, 50); approx(m.net, -30);
    }
    approx(s.revenue, 100);
  }
});

test('multi-tile residents are apportioned across their footprint and never counted more than once', () => {
  const s = state({ '10:8': market(), '10:14': market(), '10:10': home(800, 'M', 3) });
  approx([...s.markets.values()].reduce((n, m) => n + m.servedResidents, 0), 800);
  const partial = state({ '10:8': market(), '10:10': home(800, 'M', 9) });
  const served = partial.markets.get('10:8').servedResidents;
  assert.ok(served > 0 && served < 800);
});

test('unpowered or disconnected markets earn nothing and supply no amenity or nuisance effects', () => {
  for (const options of [{ isPowered: () => false }, { hasRoadAccess: () => false }, { powerRatio: 0 }]) {
    const s = state({ '10:10': market(), '10:12': home() }, options);
    const m = s.markets.get('10:10');
    approx(m.rent, 0); approx(m.net, -80);
    approx(effect(10, 12, 1, 1, 'UH', s).qualityBonus, 0);
    approx(effect(10, 12, 1, 1, 'L', s).qualityBonus, 0);
    approx(landBonus(10, 12, 'L', s), 0);
    approx(commerce(10, 12, s), 1);
  }
});

test('partial power scales rent and local effects; a closed competitor does not capture customers', () => {
  const s = state({ '10:8': market(), '10:11': market(), '10:10': home() }, {
    powerRatio: .5, isPowered: (_r, c) => c === 8,
  });
  approx(s.markets.get('10:8').servedResidents, 800);
  approx(s.markets.get('10:8').rent, 50);
  approx(s.markets.get('10:11').servedResidents, 0);
  approx(effect(10, 10, 1, 1, 'UH', s).qualityBonus, -.025);
  approx(commerce(10, 10, s), 1.025);
});

function runtime(buildings = { '10:10': market(), '10:12': home() }) {
  const c = vm.createContext({ console, buildingData: buildings, city: { tick: 1, powerRatio: 1 },
    powerMap: Array.from({ length: 30 }, () => Array(30).fill(true)),
    roads: new Set(['9:10']), isRoadAccessTile: (r, col) => c.roads.has(`${r}:${col}`),
  });
  vm.runInContext(read('constants.js'), c);
  vm.runInContext(read('public-market.js'), c);
  return c;
}

test('runtime requires a road touching the perimeter; cache reacts to power, building changes and city switches', () => {
  const c = runtime();
  approx(c.getPublicMarketMonthlyRevenue(), 100);
  c.roads = new Set(['8:10']); c.invalidatePublicMarketState();
  approx(c.getPublicMarketMonthlyRevenue(), 0);
  c.roads.add('9:10'); c.invalidatePublicMarketState();
  approx(c.getPublicMarketMonthlyRevenue(), 100);
  c.powerMap[10][10] = false; c.invalidatePublicMarketState();
  approx(c.getPublicMarketMonthlyRevenue(), 0);
  c.powerMap[10][10] = true; c.invalidatePublicMarketState();
  approx(c.getPublicMarketMonthlyRevenue(), 100);
  c.buildingData = {}; c.city = { tick: 1, powerRatio: 1 };
  approx(c.getPublicMarketMonthlyRevenue(), 0);
});

test('market rent enters the existing city budget once, while normal maintenance stays charged', () => {
  const c = runtime();
  c.getBuildingCount = type => type === 'public_market' ? 1 : 0;
  vm.runInContext(fn('city-state.js', 'computeLandmarkFinancials'), c);
  const finance = c.computeLandmarkFinancials();
  approx(finance.revenue, 100); approx(finance.upkeep, 80);
  assert.equal(c.buildingData['10:10'].type, 'public_market', 'no extra commercial tax building is created');
});

test('growth reuses one customer snapshot per pulse; month-end can force a fresh settlement', () => {
  const c = runtime();
  const initial = c.getPublicMarketState();
  c.isCitySimulationPulsePending = () => true;
  c.buildingData['10:12'].population = 400;
  for (let i = 0; i < 100; i++) c.invalidatePublicMarketState({ deferDuringPulse: true });
  assert.equal(c.getPublicMarketState(), initial, 'new houses must not trigger repeated full-city scans within a pulse');
  c.invalidatePublicMarketState();
  assert.notEqual(c.getPublicMarketState(), initial);
  approx(c.getPublicMarketMonthlyRevenue(), 50);
  c.city.tick++;
  c.buildingData['10:12'].population = 800;
  approx(c.getPublicMarketMonthlyRevenue(), 100, 'the next pulse refreshes population automatically');
});

test('land map gives existing UH neighbours no market premium, including non-anchor footprint tiles', () => {
  const c = runtime({ '10:10': market(), '10:12': home(100, 'UH', 2) });
  const s = c.getPublicMarketState();
  const res = vm.runInContext('ZONE_RES', c), com = vm.runInContext('ZONE_COM', c);
  approx(c.getPublicMarketLandValueBonus(10, 12, res, s), 0);
  approx(c.getPublicMarketLandValueBonus(11, 13, res, s), 0);
  approx(c.getPublicMarketLandValueBonus(12, 10, res, s), .02);
  approx(c.getPublicMarketLandValueBonus(10, 12, com, s), .02);
});

test('residential quality and actual mansion selection both respond to the market', () => {
  const c = runtime({ '10:10': market() });
  Object.assign(c, {
    houseModelSets: { house: ['H', 'UH'].map(wealthTier => ({ spriteKey: wealthTier, wealthTier, metadata: { scale: 1 } })) },
    serviceMap: [], getScenicValue: () => 0, getLocalHealthPollutionPressure: () => 0,
    getTreeInfluenceValue: () => 0, getLocalHealthScore: () => .5,
    modelUsageCounts: new Map(), modelRecentHistory: new Map(),
    isInsideMap: () => true, getResidentialWealthDistrictTier: () => 'ultraRich',
    Math: Object.assign(Object.create(Math), { random: () => .4 }),
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  });
  vm.runInContext(read('sim-growth.js'), c);
  vm.runInContext(read('sim-wealth-districts.js'), c);
  c.getResidentialWealthDistrictTier = () => 'ultraRich';
  c.isSelectableZoneModelTexture = () => true;
  c.pickVariedModel = pool => pool[0];
  c.rememberSelectedZoneModel = model => model;
  const context = { landValueMap: Array.from({ length: 30 }, () => Array(30).fill(.52)),
    tileFactors: new Map(), economy: .5, skylineRecords: [], stockExchanges: [], majorTransport: [] };
  const near = c.getResidentialSiteFactors(10, 12, 1, context);
  const far = c.getResidentialSiteFactors(20, 20, 1, context);
  approx(near.marketQualityBonus, -.05);
  approx(near.landValue, .50); // remove an ordinary premium from the prospective UH site
  assert.ok(near.quality < far.quality);
  // At random=.4, the old 70% UH district picks UH; reduced UH weight picks H.
  assert.equal(c.getRandomHouseModel('house', .5, false, 1, near).wealthTier, 'H');
  assert.equal(c.getRandomHouseModel('house', .5, false, 1, far).wealthTier, 'UH');
  approx(c.getPublicMarketResidentialGrowthMultiplier(10, 12, 'ultraRich'), .95);
  approx(c.getPublicMarketResidentialGrowthMultiplier(10, 12, 'commoner'), 1.03);
});

test('actual zone growth rolls receive the local commercial boost and residential wealth preference', () => {
  const c = runtime({ '10:10': market() });
  vm.runInContext(read('sim-growth.js'), c);
  const res = vm.runInContext('ZONE_RES', c), com = vm.runInContext('ZONE_COM', c);
  const density = vm.runInContext('DENSITY_LOW', c);
  const baseChance = vm.runInContext('GROW_CHANCE_BASE * DENSITY_GROW_MUL[DENSITY_LOW] * (0.72 + 0.5 * 0.85)', c);
  let spawned = 0, district = 'commoner';
  Object.assign(c, {
    zoneMap: Array.from({ length: 30 }, () => Array(30).fill(0)),
    zoneDensityMap: Array.from({ length: 30 }, () => Array(30).fill(density)),
    hasAdjacentRoad: () => true, getZoneGrowthLandScore: () => .5,
    getResidentialWealthDistrictTier: () => district,
    spawnZoneBuilding: () => spawned++, isEstateLotHeld: () => false,
    Math: Object.assign(Object.create(Math), { random: () => baseChance * 1.02 }),
  });
  Object.assign(c.city, { demandR: 1, demandC: 1 });
  const scene = { buildingSprites: new Map() }, ctx = { residentialQualityContext: {}, commercialMergeBudget: 0 };
  const roll = (row, col, zone) => {
    c.zoneMap[row][col] = zone;
    spawned = 0;
    c.growZoneTile(scene, { row, col, id: `${row}:${col}` }, ctx);
    return spawned;
  };
  assert.equal(roll(10, 12, com), 1, 'nearby commerce passes a roll just above its old threshold');
  assert.equal(roll(20, 20, com), 0, 'distant commerce gets no bonus');
  assert.equal(roll(10, 12, res), 1, 'ordinary households receive the convenience bonus');
  district = 'ultraRich';
  assert.equal(roll(10, 12, res), 0, 'UH residential appeal is reduced at the same site');
});
