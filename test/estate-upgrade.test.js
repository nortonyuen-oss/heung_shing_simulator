const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const growthSource = fs.readFileSync(path.join(ROOT, 'sim-growth.js'), 'utf8');

function createEstateUpgradeContext({
  tick = 0,
  randomValue = 0,
  eligibleTiles = null,
  hasFootprint3 = true,
} = {}) {
  const zoneMap = [];
  const zoneDensityMap = [];
  const buildingData = {};
  for (let row = 0; row < 3; row++) {
    zoneMap[row] = [];
    zoneDensityMap[row] = [];
    for (let col = 0; col < 3; col++) {
      zoneMap[row][col] = 1; // ZONE_RES
      zoneDensityMap[row][col] = 1; // DENSITY_LOW
      buildingData[`${row}:${col}`] = {
        type: 'residential',
        footprintCols: 1,
        footprintRows: 1,
      };
    }
  }

  const removed = [];
  const spawned = [];
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => randomValue;

  const context = vm.createContext({
    Math: deterministicMath,
    Number,
    Object,
    TICKS_PER_MONTH: 4,
    ZONE_RES: 1,
    DENSITY_LOW: 1,
    city: { tick },
    zoneMap,
    zoneDensityMap,
    buildingData,
    getZoneGrowthTiles: () => [{ row: 0, col: 0, id: '0:0' }],
    getTileId: (row, col) => `${row}:${col}`,
    isInsideMap: (row, col) => row >= 0 && row < 3 && col >= 0 && col < 3,
    hasResidentialModelForFootprint: (size) => (size === 3 ? hasFootprint3 : true),
    getResidentialSiteFactors: (row, col) => ({ row, col }),
    isUltraHighWealthEligible: (factors) => (
      eligibleTiles ? eligibleTiles.has(`${factors.row}:${factors.col}`) : true
    ),
    removeBuilding: (_scene, row, col, options) => {
      removed.push({ row, col, options });
    },
    spawnZoneBuilding: (_scene, row, col, zone, size, density, options) => {
      spawned.push({ row, col, zone, size, density, options });
    },
  });

  const start = growthSource.indexOf('const LOW_DENSITY_ESTATE_UPGRADE_CHANCE');
  const end = growthSource.indexOf('function growOrShrinkZones');
  assert.ok(start >= 0 && end > start, 'estate upgrade scan must remain extractable');
  vm.runInContext(growthSource.slice(start, end), context, { filename: 'estate-upgrade.js' });

  context.removed = removed;
  context.spawned = spawned;
  return context;
}

test('a fully UH-eligible 3x3 block of low-density houses redevelops into one mansion on a winning roll', () => {
  const context = createEstateUpgradeContext({ randomValue: 0 });
  vm.runInContext('scanForLowDensityEstateUpgrades({}, { residential: {} })', context);

  assert.equal(context.removed.length, 9);
  const removedKeys = new Set(context.removed.map(({ row, col }) => `${row}:${col}`));
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) assert.ok(removedKeys.has(`${row}:${col}`));
  }
  context.removed.forEach(({ options }) => assert.equal(options.refreshInfrastructure, false));

  assert.equal(context.spawned.length, 1);
  assert.deepEqual(
    { row: context.spawned[0].row, col: context.spawned[0].col, size: context.spawned[0].size, density: context.spawned[0].density },
    { row: 0, col: 0, size: 3, density: 1 },
  );
  assert.equal(context.spawned[0].options.forceFootprint, 3);
  assert.equal(context.spawned[0].options.forceWealthTier, 'UH');
});

test('does not redevelop when any of the 9 buildings fails the UH eligibility bar', () => {
  const eligibleTiles = new Set();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (row === 2 && col === 2) continue; // one hold-out tile
      eligibleTiles.add(`${row}:${col}`);
    }
  }
  const context = createEstateUpgradeContext({ randomValue: 0, eligibleTiles });
  vm.runInContext('scanForLowDensityEstateUpgrades({}, { residential: {} })', context);

  assert.equal(context.removed.length, 0);
  assert.equal(context.spawned.length, 0);
});

test('a losing roll leaves a fully-eligible block untouched', () => {
  const context = createEstateUpgradeContext({ randomValue: 0.99 });
  vm.runInContext('scanForLowDensityEstateUpgrades({}, { residential: {} })', context);

  assert.equal(context.removed.length, 0);
  assert.equal(context.spawned.length, 0);
});

test('skips scanning outside the monthly cadence', () => {
  const context = createEstateUpgradeContext({ randomValue: 0, tick: 1 });
  vm.runInContext('scanForLowDensityEstateUpgrades({}, { residential: {} })', context);

  assert.equal(context.removed.length, 0);
  assert.equal(context.spawned.length, 0);
});

test('skips scanning when no 3x3 model exists for the estate footprint', () => {
  const context = createEstateUpgradeContext({ randomValue: 0, hasFootprint3: false });
  vm.runInContext('scanForLowDensityEstateUpgrades({}, { residential: {} })', context);

  assert.equal(context.removed.length, 0);
  assert.equal(context.spawned.length, 0);
});

// Regression test for a real bug: the scan only ever runs on ticks that are
// multiples of TICKS_PER_MONTH, so sharding on the raw tick (instead of a
// counter that advances once per scan) meant `tick % SHARD_COUNT` could only
// ever land on 2 of the 8 buckets, forever - 75% of anchor tiles were
// permanently unreachable no matter how many in-game months passed. This
// caused a real save file's low-density blocks to never redevelop even after
// years of play. Sharding must be keyed on a per-scan counter so every anchor
// is eventually reachable.
test('every shard eventually gets scanned across a full monthly cycle', () => {
  const TICKS_PER_MONTH = 4;
  const zoneMap = [];
  const zoneDensityMap = [];
  const buildingData = {};
  const anchors = [];
  for (let row = 0; row < 8; row++) {
    zoneMap[row] = [1]; // ZONE_RES
    zoneDensityMap[row] = [1]; // DENSITY_LOW
    buildingData[`${row}:0`] = { type: 'residential', footprintCols: 1, footprintRows: 1 };
    anchors.push({ row, col: 0, id: `${row}:0` });
  }

  const visited = new Set();
  const context = vm.createContext({
    Math,
    Number,
    Object,
    TICKS_PER_MONTH,
    ZONE_RES: 1,
    DENSITY_LOW: 1,
    city: { tick: 0 },
    zoneMap,
    zoneDensityMap,
    buildingData,
    getZoneGrowthTiles: () => anchors,
    getTileId: (row, col) => `${row}:${col}`,
    isInsideMap: () => true,
    hasResidentialModelForFootprint: () => true,
    getResidentialSiteFactors: (row, col) => {
      visited.add(`${row}:${col}`);
      return { row, col };
    },
    isUltraHighWealthEligible: () => false,
    removeBuilding: () => {},
    spawnZoneBuilding: () => {},
  });

  const start = growthSource.indexOf('const LOW_DENSITY_ESTATE_UPGRADE_CHANCE');
  const end = growthSource.indexOf('function growOrShrinkZones');
  vm.runInContext(growthSource.slice(start, end), context, { filename: 'estate-upgrade.js' });

  for (let month = 1; month <= 8; month++) {
    context.city.tick = month * TICKS_PER_MONTH;
    vm.runInContext('scanForLowDensityEstateUpgrades({}, { residential: {} })', context);
  }

  assert.equal(visited.size, 8, `expected all 8 anchors to be reached at least once, got: ${[...visited].sort().join(', ')}`);
});
