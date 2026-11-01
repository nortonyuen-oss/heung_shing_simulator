const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function loadProfiles(cityState = {}) {
  const context = vm.createContext({ city: cityState, DENSITY_LOW: 1, DENSITY_MED: 2, DENSITY_HIGH: 3 });
  ['hk-district-maps.js', 'hk-district-info.js', 'district-profiles.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  });
  // Through JSON, so arrays and objects compare with this realm's
  return (expression) => {
    const value = vm.runInContext(expression, context);
    return value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  };
}

test('every Hong Kong district map has a profile, names and an introduction', () => {
  const run = loadProfiles();
  const mapIds = run('HK_DISTRICT_MAPS.map((d) => d.id)');
  const profileIds = run('Object.keys(DISTRICT_PROFILES)');
  assert.deepEqual([...profileIds].sort(), [...mapIds].sort());
  mapIds.forEach((id) => {
    assert.ok(run(`HK_DISTRICT_INFO[${JSON.stringify(id)}]?.intro?.zhHant`), `${id} has no introduction`);
  });
});

test('every profile keeps its steps in range and its score between 0 and +2', () => {
  const run = loadProfiles();
  const rows = run(`Object.entries(DISTRICT_PROFILES).map(([id, profile]) => ({
    id,
    steps: DISTRICT_PROFILE_AXES.map((axis) => profile[axis] ?? 0),
    unknown: Object.keys(profile).filter((key) => key !== 'heightCap' && !DISTRICT_PROFILE_AXES.includes(key)),
    heightCap: profile.heightCap,
    score: getDistrictProfileScore(profile),
  }))`);
  rows.forEach(({ id, steps, unknown, heightCap, score }) => {
    assert.deepEqual(unknown, [], `${id} has unknown axes`);
    steps.forEach((step) => assert.ok(Number.isInteger(step) && step >= -2 && step <= 2, `${id} step ${step}`));
    assert.ok(['high', 'medium', 'low'].includes(heightCap), `${id} height cap ${heightCap}`);
    assert.ok(score >= 0 && score <= 2, `${id} scores ${score}; docs/district-profiles-design.md §4 wants 0..+2`);
  });
});

test('cities without a district profile are untouched', () => {
  const run = loadProfiles({ districtProfileId: '' });
  ['demandR', 'demandC', 'taxC', 'traffic', 'tourism', 'tourismCapacity', 'wealth', 'density', 'jobs', 'cost', 'pollution']
    .forEach((key) => assert.equal(run(`getDistrictProfileEffect(${JSON.stringify(key)})`), 0, key));
  assert.equal(run('getDistrictMaxZoneDensity()'), 3);
  assert.equal(run('getDistrictZoningCost(100)'), 100);
});

test('a district profile turns its steps into effects', () => {
  const run = loadProfiles({ districtProfileId: 'lamma' });
  assert.equal(run('getDistrictMaxZoneDensity()'), 1, '南丫島 only allows low density');
  assert.ok(Math.abs(run("getDistrictProfileEffect('traffic')") - -0.06) < 1e-9, 'two steps less congestion');
  assert.ok(Math.abs(run("getDistrictProfileEffect('pollution')") - -0.30) < 1e-9, 'greener: less industrial pollution');
  const cbd = loadProfiles({ districtProfileId: 'victoria-harbour' });
  assert.equal(cbd('getDistrictZoningCost(100)'), 130, 'land price +2 steps');
});

test('difficulty runs from 1 to 5 stars, flat land setting the base', () => {
  const run = loadProfiles();
  assert.equal(run("getDistrictDifficulty(DISTRICT_PROFILES['kowloon-city'], 54)"), 1);
  assert.equal(run("getDistrictDifficulty(DISTRICT_PROFILES['lamma'], 13)"), 5);
  assert.equal(run('getDistrictDifficulty({}, 90)'), 2, 'score 0 is a star harder');
});
