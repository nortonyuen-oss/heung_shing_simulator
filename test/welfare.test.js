'use strict';

// 福利同舊樓 (docs/campaign-p4-design.md §3): five welfare bills, the coverage of the people in
// need, 社區中心, and old homes' condition, repair and redevelopment. Welfare and crime stay apart.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const welfare = require('../welfare.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const E = welfare.WELFARE_TUNING.elderlyShare;
// 100,000 residents: 40% in low-income homes, half of them in 公屋; 8% out of work; hospitals cover 30%
const city = { residents: 100000, lowIncome: 40000, publicHousing: 20000, hospitalCovered: 30000, centreReached: 0, unemploymentRate: 0.08 };
const needyShare = 1 - (1 - E) * (1 - 0.4) * (1 - 0.08);

test('welfare: nobody is reached without a bill or a centre; the needy are counted once', () => {
  const s = welfare.computeWelfareState(city, new Set());
  assert.equal(s.needy, Math.round(needyShare * 100000));
  assert.equal(s.reached, 0);
  assert.equal(s.coverage, 0);
  assert.equal(s.activeWithBeneficiaries, 0);
  Object.values(s.bills).forEach((bill) => assert.equal(bill.beneficiaries, 0));
});

test('welfare: one bill per group reaches all in need; each bill reaches its own group', () => {
  const all = welfare.computeWelfareState(city, new Set(['elderlyLivingAllowance', 'lowIncomeFamilySubsidy', 'youthEmploymentScheme']));
  assert.ok(Math.abs(all.coverage - 1) < 1e-9, `${all.coverage}`);
  assert.equal(all.activeWithBeneficiaries, 3);
  assert.equal(all.bills.elderlyLivingAllowance.beneficiaries, Math.round(100000 * E));
  assert.equal(all.bills.lowIncomeFamilySubsidy.beneficiaries, 40000);
  assert.equal(all.bills.youthEmploymentScheme.beneficiaries, 8000);
  // the elderly alone: the elderly among those in need
  const elderly = welfare.computeWelfareState(city, new Set(['elderlyLivingAllowance']));
  assert.ok(Math.abs(elderly.coverage - E / needyShare) < 1e-9);
  // rent support reaches the 公屋 half of the low-income homes only
  const rent = welfare.computeWelfareState(city, new Set(['publicHousingRentSupport']));
  const family = welfare.computeWelfareState(city, new Set(['lowIncomeFamilySubsidy']));
  assert.equal(rent.bills.publicHousingRentSupport.beneficiaries, 20000);
  assert.ok(rent.coverage > 0 && rent.coverage < family.coverage);
  // the health subsidy reaches whoever a hospital covers, in need or not
  const health = welfare.computeWelfareState(city, new Set(['communityHealthSubsidy']));
  assert.ok(Math.abs(health.coverage - 0.3) < 1e-9);
  assert.equal(health.bills.communityHealthSubsidy.beneficiaries, 30000);
});

test('welfare: three bills with nobody to reach do not count; a 社區中心 reaches all in need around it', () => {
  const noPublic = welfare.computeWelfareState({ ...city, publicHousing: 0, unemploymentRate: 0 },
    new Set(['publicHousingRentSupport', 'youthEmploymentScheme', 'elderlyLivingAllowance']));
  assert.equal(noPublic.activeWithBeneficiaries, 1, 'no 公屋 tenants and nobody out of work');
  const centres = welfare.computeWelfareState({ ...city, centreReached: 50000 }, new Set());
  assert.ok(Math.abs(centres.coverage - 0.5) < 1e-9);
  assert.deepEqual(welfare.computeWelfareState({ residents: 0 }, new Set()).coverage, 0);
});

test('welfare bills cost a base and so much per people reached', () => {
  const groups = { elderly: 18000, lowIncome: 40000, publicHousing: 20000, hospitalCovered: 30000, unemployed: 8000 };
  assert.equal(welfare.getWelfarePolicyMonthlyCost('elderlyLivingAllowance', { groups }), 200 + 18 * 15);
  assert.equal(welfare.getWelfarePolicyMonthlyCost('lowIncomeFamilySubsidy', { groups }), 180 + 40 * 8);
  assert.equal(welfare.getWelfarePolicyMonthlyCost('youthEmploymentScheme', { groups }), 160 + 80 * 12);
  assert.equal(welfare.getWelfarePolicyMonthlyCost('cleanAir', { groups }), 0);
});

test('舊樓: a home decays faster old, poor and without fire cover; 危樓 below 30; repairs cost by lot size', () => {
  const T = welfare.OLD_BUILDING_TUNING;
  const poorOld = welfare.getOldBuildingYearlyDecay({ wealthTier: 'L' }, 40, false);
  const richNew = welfare.getOldBuildingYearlyDecay({ wealthTier: 'UH' }, 0, true);
  assert.equal(poorOld, T.decayBase + 40 / T.ageYears + T.wealthDecay.L + T.noFireCover);
  assert.equal(richNew, T.decayBase + T.wealthDecay.UH);
  assert.ok(poorOld > richNew * 2);
  // a home built before 舊樓 starts the clock now, as new - an old save wakes to no 危樓
  const old = welfare.ensureOldBuildingRecord({ type: 'residential' }, 500);
  assert.deepEqual([old.builtMonthIndex, old.condition], [500, 100]);
  assert.equal(welfare.ensureOldBuildingRecord({ type: 'commercial' }, 500).condition, undefined);
  assert.equal(welfare.getOldBuildingRepairCost({ footprintCols: 1, footprintRows: 1 }), 1500);
  assert.equal(welfare.getOldBuildingRepairCost({ footprintCols: 8, footprintRows: 8 }), 12000);
  const homes = {
    a: { type: 'residential', population: 300, condition: 20 },
    b: { type: 'residential', population: 700, condition: 90 },
    c: { type: 'industrial', population: 999, condition: 0 },
  };
  const summary = welfare.summarizeOldBuildings(homes);
  assert.deepEqual([summary.homes, summary.dangerous, summary.dangerousResidents], [2, 1, 300]);
  assert.equal(summary.safetyIndex, Math.round((20 * 300 + 90 * 700) / 1000));
  assert.equal(welfare.getOldBuildingCondition({}), 100);
});

test('welfare and 舊樓 in the game: bills, centre, costs, effects, panel and campaign facts are wired', () => {
  const html = source('index.html');
  assert.ok(html.indexOf('src="port-freight.js"') < html.indexOf('src="welfare.js"'));
  assert.ok(html.indexOf('src="welfare.js"') < html.indexOf('src="inspect-panel.js"'));
  assert.match(html, /data-tool="community-centre"/);
  const constants = source('constants.js');
  const cityState = source('city-state.js');
  const preview = source('council-policy-preview.js');
  const i18n = source('i18n.js');
  welfare.WELFARE_POLICY_IDS.forEach((id) => {
    assert.match(constants, new RegExp(`id: '${id}'.*category: 'socialWelfare'`), `${id} is a welfare bill`);
    assert.equal(cityState.split(`${id}: false`).length - 1, 2, `${id} defaults off`);
    assert.match(cityState, new RegExp(`'${id}'`), `${id} is a known policy`);
    assert.match(preview, new RegExp(`${id}: \\{ issues`), `${id} has council issues`);
    ['title', 'desc'].forEach((part) => assert.equal(i18n.split(`'policy.${id}.${part}':`).length - 1, 3, `${id}.${part} in three languages`));
  });
  assert.match(cityState, /isWelfarePolicy\(policy\.id\)\) cost \+= getWelfareMonthlyCost/);
  assert.match(preview, /isWelfarePolicy\(policyId\)\) cost \+= getWelfareMonthlyCost/);
  assert.match(constants, /community_centre: \{\s*spriteKey: 'community_centre_2x2',\s*path: 'Models\/government\/2x2\/library2-01\.png'/);
  assert.match(source('tools.js'), /'community-centre':\s+'community_centre'/);
  const sim = source('simulation.js');
  assert.match(sim, /WELFARE_TUNING\.youthEmploymentCut/);
  assert.match(sim, /WELFARE_TUNING\.communityHealthBonus/);
  assert.match(sim, /WELFARE_TUNING\.communityHealthProtection/);
  assert.match(sim, /\+ welfareBonus/);
  assert.match(sim, /- oldBuildingPenalty/);
  assert.match(source('sim-growth.js'), /builtMonthIndex: zone === ZONE_RES/);
  assert.match(source('inspect-panel.js'), /buildWelfareInspectHtml\(\)/);
  assert.match(source('inspect-panel.js'), /repairOldBuilding\('/);
  assert.match(source('campaign.js'), /\.\.\.collectWelfareFacts\(\)/);
  // 劇本第 15 章: welfare never feeds the crime rate
  assert.doesNotMatch(source('welfare.js'), /crimeRate/);
  ['building.communityCentre', 'toolRow.communityCentre', 'inspect.communityCentre', 'welfare.coverage', 'oldBuilding.state',
    'oldBuilding.repair', 'oldBuilding.rebuild', 'oldBuilding.repaired', 'oldBuilding.rebuilt']
    .forEach((key) => assert.equal(i18n.split(`'${key}':`).length - 1, 3, `${key} in three languages`));
});
