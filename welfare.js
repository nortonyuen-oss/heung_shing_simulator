'use strict';

// 福利同舊樓 (docs/campaign-p4-design.md §3). Two measures kept apart on purpose (劇本第 15 章): who
// the welfare system reaches, and how safe the homes are. Neither feeds crime.
//
// 福利: five council bills, each reaching a group of residents; 社區中心 reach the people in need
// around them. 福利覆蓋率 = the people in need reached by at least one / the people in need, where in
// need = elderly, in a low-income home, or out of work (one person counted once).
//
// 舊樓: each home keeps the month it was built and a condition (0-100) that falls a little every
// month, faster for older blocks, poorer owners and no fire cover. Below 30 it is 危樓. A repair
// brings it back to 80; a rebuild clears the lot, which grows again new.

const WELFARE_TUNING = Object.freeze({
  elderlyShare: 0.18,             // of residents 〔暫定〕
  communityCentreRadius: 8,       // tiles from a 社區中心's lot 〔暫定〕
  youthEmploymentCut: 0.15,       // of the unemployment rate
  happiness: Object.freeze({ elderlyLivingAllowance: 0.02, lowIncomeFamilySubsidy: 0.03, publicHousingRentSupport: 0.025 }),
  communityHealthBonus: 0.04,     // to the city's target health
  communityHealthProtection: 0.08, // against epidemics
});

// monthly cost: a base, and so much per thousand people reached (per hundred for the unemployed)
const WELFARE_POLICIES = Object.freeze([
  { id: 'elderlyLivingAllowance', group: 'elderly', monthlyBase: 200, perThousand: 15 },
  { id: 'lowIncomeFamilySubsidy', group: 'lowIncome', monthlyBase: 180, perThousand: 8 },
  { id: 'publicHousingRentSupport', group: 'publicHousing', monthlyBase: 120, perThousand: 6 },
  { id: 'communityHealthSubsidy', group: 'hospitalCovered', monthlyBase: 200, perThousand: 5 },
  { id: 'youthEmploymentScheme', group: 'unemployed', monthlyBase: 160, perHundred: 12 },
]);
const WELFARE_POLICY_IDS = Object.freeze(WELFARE_POLICIES.map((policy) => policy.id));

const OLD_BUILDING_TUNING = Object.freeze({
  dangerousBelow: 30,
  repairTo: 80,
  repairCostPerTileSide: 1500,    // $1,500 a 1x1, $3,000 a 2x2, $12,000 an 8x8 estate 〔暫定〕
  rebuildLandPremiumPerTile: 400, // 地價 when a block is cleared for redevelopment
  // condition points lost a year: base, + age in years / ageYears, + by the owners' means, + no fire cover
  decayBase: 1.5,
  ageYears: 25,
  wealthDecay: Object.freeze({ L: 1.2, M: 0.6, H: 0.3, UH: 0.1 }),
  noFireCover: 0.7,
  maxHappinessPenalty: 0.05,
});

const welfareClamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));

// The people each bill reaches, and the coverage of those in need. inputs: residents, lowIncome
// (in L homes), publicHousing (in 公屋, a part of lowIncome), hospitalCovered, centreReached (within a
// 社區中心's radius), unemploymentRate. active: the bills in force.
function computeWelfareState(inputs = {}, active = new Set(), tuning = WELFARE_TUNING) {
  const residents = Math.max(0, Number(inputs.residents) || 0);
  const empty = { residents, needy: 0, reached: 0, coverage: 0, bills: {}, activeWithBeneficiaries: 0 };
  WELFARE_POLICY_IDS.forEach((id) => { empty.bills[id] = { active: active.has(id), beneficiaries: 0 }; });
  if (residents <= 0) return empty;
  const e = welfareClamp(tuning.elderlyShare);
  const l = welfareClamp((Number(inputs.lowIncome) || 0) / residents);
  const p = Math.min(l, welfareClamp((Number(inputs.publicHousing) || 0) / residents));
  const u = welfareClamp(inputs.unemploymentRate);
  const h = welfareClamp((Number(inputs.hospitalCovered) || 0) / residents);
  const c = welfareClamp((Number(inputs.centreReached) || 0) / residents);
  const on = (id) => (active.has(id) ? 1 : 0);
  const groups = {
    elderly: residents * e,
    lowIncome: residents * l,
    publicHousing: residents * p,
    hospitalCovered: residents * h,
    unemployed: residents * u,
  };
  const bills = {};
  WELFARE_POLICIES.forEach(({ id, group }) => { bills[id] = { active: !!on(id), beneficiaries: on(id) ? Math.round(groups[group]) : 0 }; });
  // a low-income resident is reached by the family subsidy, or - living in 公屋 - by the rent support
  const lowIncomeReach = on('lowIncomeFamilySubsidy') ? 1 : on('publicHousingRentSupport') * (l > 0 ? p / l : 0);
  // everyone near a 社區中心, or covered by a hospital under the health subsidy, is reached anyway
  const reachedByAll = 1 - (1 - c) * (1 - on('communityHealthSubsidy') * h);
  let needy = 0;
  let reached = 0;
  // the three groups taken as independent, each person counted once
  for (const elderly of [0, 1]) for (const low of [0, 1]) for (const unemployed of [0, 1]) {
    if (!elderly && !low && !unemployed) continue;
    const share = (elderly ? e : 1 - e) * (low ? l : 1 - l) * (unemployed ? u : 1 - u);
    const missed = (1 - elderly * on('elderlyLivingAllowance')) * (1 - low * lowIncomeReach)
      * (1 - unemployed * on('youthEmploymentScheme')) * (1 - reachedByAll);
    needy += share;
    reached += share * (1 - missed);
  }
  return {
    residents,
    needy: Math.round(needy * residents),
    reached: Math.round(reached * residents),
    coverage: needy > 0 ? reached / needy : 0,
    bills,
    activeWithBeneficiaries: Object.values(bills).filter((bill) => bill.active && bill.beneficiaries > 0).length,
  };
}

function getWelfarePolicyMonthlyCost(policyId, state) {
  const policy = WELFARE_POLICIES.find((entry) => entry.id === policyId);
  if (!policy) return 0;
  const reached = Number(state?.groups?.[policy.group]) || 0;
  const extra = policy.perHundred ? Math.ceil(reached / 100) * policy.perHundred : Math.ceil(reached / 1000) * policy.perThousand;
  return policy.monthlyBase + extra;
}

// condition points a home loses in a year
function getOldBuildingYearlyDecay(record, ageYears, fireCovered, tuning = OLD_BUILDING_TUNING) {
  return tuning.decayBase + Math.max(0, ageYears) / tuning.ageYears
    + (tuning.wealthDecay[record?.wealthTier] ?? tuning.wealthDecay.L)
    + (fireCovered ? 0 : tuning.noFireCover);
}

function getOldBuildingCondition(record) {
  const value = Number(record?.condition);
  return Number.isFinite(value) ? welfareClamp(value, 0, 100) : 100;
}

function getOldBuildingRepairCost(record, tuning = OLD_BUILDING_TUNING) {
  const side = Math.max(1, Number(record?.footprintCols) || 1, Number(record?.footprintRows) || 1);
  return tuning.repairCostPerTileSide * side;
}

// Residents in 危樓 and the 舊樓安全指數 (the residents' average condition) of a set of records.
function summarizeOldBuildings(records, tuning = OLD_BUILDING_TUNING) {
  let homes = 0; let residents = 0; let dangerous = 0; let dangerousResidents = 0; let weighted = 0;
  Object.values(records || {}).forEach((record) => {
    if (record?.type !== 'residential') return;
    const people = Math.max(0, Number(record.population) || 0);
    const condition = getOldBuildingCondition(record);
    homes += 1;
    residents += people;
    weighted += condition * people;
    if (condition < tuning.dangerousBelow) { dangerous += 1; dangerousResidents += people; }
  });
  return {
    homes, dangerous, dangerousResidents,
    dangerousShare: residents > 0 ? dangerousResidents / residents : 0,
    safetyIndex: residents > 0 ? Math.round(weighted / residents) : 100,
  };
}

// ── The game ──────────────────────────────────────────────────────────────────

let welfareStateCache = { key: '', state: null };

function getWelfareActivePolicies() {
  const active = new Set();
  WELFARE_POLICY_IDS.forEach((id) => { if (typeof isPolicyActive === 'function' && isPolicyActive(id)) active.add(id); });
  return active;
}

function collectWelfareInputs() {
  const records = typeof buildingData !== 'undefined' && buildingData ? buildingData : {};
  const centres = [];
  Object.entries(records).forEach(([id, record]) => {
    if (record?.type !== 'community_centre') return;
    const [row, col] = id.split(':').map(Number);
    centres.push({ row, col, rows: record.footprintRows || 2, cols: record.footprintCols || 2 });
  });
  const radius = WELFARE_TUNING.communityCentreRadius;
  const gap = (value, from, size) => Math.max(from - value, value - (from + size - 1), 0);
  let residents = 0; let lowIncome = 0; let publicHousing = 0; let hospitalCovered = 0; let centreReached = 0;
  Object.entries(records).forEach(([id, record]) => {
    if (record?.type !== 'residential') return;
    const people = Math.max(0, Number(record.population) || 0);
    if (!people) return;
    const [row, col] = id.split(':').map(Number);
    residents += people;
    if ((record.wealthTier || 'L') === 'L') lowIncome += people;
    if (typeof getBuildingHousingType === 'function' && getBuildingHousingType(record) === 'public') publicHousing += people;
    if ((Number(serviceMap?.get?.(`${row}:${col}`)?.health) || 0) > 0) hospitalCovered += people;
    if (centres.some((centre) => Math.max(gap(row, centre.row, centre.rows), gap(col, centre.col, centre.cols)) <= radius)) centreReached += people;
  });
  return { residents, lowIncome, publicHousing, hospitalCovered, centreReached, unemploymentRate: Number(city.unemploymentRate) || 0 };
}

// derived, cached per simulation tick, the buildings and the bills in force
function getWelfareState() {
  const active = getWelfareActivePolicies();
  const records = typeof buildingData !== 'undefined' && buildingData ? buildingData : {};
  const key = `${city.tick}|${Object.keys(records).length}|${[...active].join(',')}|${Math.round((city.unemploymentRate || 0) * 1000)}`;
  if (welfareStateCache.key === key && welfareStateCache.state) return welfareStateCache.state;
  const inputs = collectWelfareInputs();
  const districtDensity = 1 + (typeof getDistrictProfileEffect === 'function' ? getDistrictProfileEffect('density') : 0);
  const state = computeWelfareState({ ...inputs, residents: inputs.residents }, active);
  const scale = (value) => Math.round(value * districtDensity);
  state.needy = scale(state.needy);
  state.reached = scale(state.reached);
  Object.values(state.bills).forEach((bill) => { bill.beneficiaries = scale(bill.beneficiaries); });
  state.groups = {
    elderly: scale(inputs.residents * WELFARE_TUNING.elderlyShare),
    lowIncome: scale(inputs.lowIncome),
    publicHousing: scale(inputs.publicHousing),
    hospitalCovered: scale(inputs.hospitalCovered),
    unemployed: scale(inputs.residents * inputs.unemploymentRate),
  };
  state.centreReached = scale(inputs.centreReached);
  welfareStateCache = { key, state };
  return state;
}

function invalidateWelfareState() {
  welfareStateCache = { key: '', state: null };
}

function getWelfareHappinessBonus() {
  const active = getWelfareActivePolicies();
  if (!active.size) return 0;
  const state = getWelfareState();
  const residents = Math.max(1, state.residents);
  const share = (group) => welfareClamp((Number(state.groups?.[group]) || 0) / residents);
  const bonus = WELFARE_TUNING.happiness;
  return (active.has('elderlyLivingAllowance') ? bonus.elderlyLivingAllowance : 0)
    + (active.has('lowIncomeFamilySubsidy') ? bonus.lowIncomeFamilySubsidy * share('lowIncome') : 0)
    + (active.has('publicHousingRentSupport') ? bonus.publicHousingRentSupport * share('publicHousing') : 0);
}

function getWelfareMonthlyCost(policyId) {
  return getWelfarePolicyMonthlyCost(policyId, getWelfareState());
}

function isWelfarePolicy(policyId) {
  return WELFARE_POLICY_IDS.includes(policyId);
}

// ── 舊樓 ──────────────────────────────────────────────────────────────────────

function welfareMonthIndex() {
  return typeof getCityMonthIndex === 'function' ? getCityMonthIndex() : 0;
}

// A home without a record of its age (built before 舊樓 existed) starts the clock now, as new: an
// older city does not wake up to a street of 危樓. Start towns that are old say so in their file.
function ensureOldBuildingRecord(record, monthIndex = welfareMonthIndex()) {
  if (!record || record.type !== 'residential') return record;
  if (!Number.isFinite(Number(record.builtMonthIndex))) record.builtMonthIndex = monthIndex;
  if (!Number.isFinite(Number(record.condition))) record.condition = 100;
  return record;
}

function ageOldBuildingsMonth() {
  const records = typeof buildingData !== 'undefined' && buildingData ? buildingData : {};
  const now = welfareMonthIndex();
  Object.entries(records).forEach(([id, record]) => {
    if (record?.type !== 'residential') return;
    ensureOldBuildingRecord(record, now);
    const ageYears = (now - Number(record.builtMonthIndex)) / 12;
    const [row, col] = id.split(':').map(Number);
    const fireCovered = !!serviceMap?.get?.(`${row}:${col}`)?.fire;
    const decay = getOldBuildingYearlyDecay(record, ageYears, fireCovered) / 12;
    record.condition = Math.round(Math.max(0, getOldBuildingCondition(record) - decay) * 100) / 100;
  });
}

function getOldBuildingStats() {
  const records = typeof buildingData !== 'undefined' && buildingData ? buildingData : {};
  return {
    ...summarizeOldBuildings(records),
    repaired: Math.max(0, Math.floor(Number(city.buildingRepairs) || 0)),
    rebuilt: Math.max(0, Math.floor(Number(city.buildingRebuilds) || 0)),
  };
}

function getOldBuildingHappinessPenalty() {
  const stats = getOldBuildingStats();
  return Math.min(OLD_BUILDING_TUNING.maxHappinessPenalty, stats.dangerousShare * 0.12);
}

function repairOldBuilding(id) {
  const record = typeof buildingData !== 'undefined' ? buildingData[id] : null;
  if (!record || record.type !== 'residential') return false;
  if (getOldBuildingCondition(record) >= OLD_BUILDING_TUNING.repairTo) return false;
  const cost = getOldBuildingRepairCost(record);
  if (typeof spendBudget === 'function' ? !spendBudget(cost) : (city.budget < cost)) {
    if (typeof showToast === 'function') showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }
  if (typeof spendBudget !== 'function') city.budget -= cost;
  record.condition = OLD_BUILDING_TUNING.repairTo;
  record.repairedMonthIndex = welfareMonthIndex();
  city.buildingRepairs = Math.max(0, Math.floor(Number(city.buildingRepairs) || 0)) + 1;
  if (typeof showToast === 'function') showToast(t('oldBuilding.repaired', { cost: cost.toLocaleString() }), 'success');
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  refreshOldBuildingInspect();
  return true;
}

// 重建: the block comes down and the lot grows again new; the land brings in a premium
function redevelopOldBuilding(id) {
  const record = typeof buildingData !== 'undefined' ? buildingData[id] : null;
  if (!record || record.type !== 'residential' || typeof activeScene === 'undefined' || !activeScene) return false;
  const [row, col] = id.split(':').map(Number);
  const tiles = Math.max(1, (record.footprintCols || 1) * (record.footprintRows || 1));
  if (typeof removeBuilding !== 'function' || !removeBuilding(activeScene, row, col)) return false;
  const premium = tiles * OLD_BUILDING_TUNING.rebuildLandPremiumPerTile;
  city.budget += premium;
  city.buildingRebuilds = Math.max(0, Math.floor(Number(city.buildingRebuilds) || 0)) + 1;
  if (typeof showToast === 'function') showToast(t('oldBuilding.rebuilt', { premium: premium.toLocaleString() }), 'info');
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  refreshOldBuildingInspect();
  return true;
}

function refreshOldBuildingInspect() {
  if (typeof showInspectPanel === 'function' && typeof activeScene !== 'undefined' && activeScene && typeof lastInspectTile !== 'undefined' && lastInspectTile) {
    showInspectPanel(activeScene, lastInspectTile.row, lastInspectTile.col);
  }
}

if (typeof onGameClockEvent === 'function') onGameClockEvent('gameclock:month', ageOldBuildingsMonth);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WELFARE_TUNING, WELFARE_POLICIES, WELFARE_POLICY_IDS, OLD_BUILDING_TUNING,
    computeWelfareState, getWelfarePolicyMonthlyCost, getOldBuildingYearlyDecay,
    getOldBuildingCondition, getOldBuildingRepairCost, summarizeOldBuildings, ensureOldBuildingRecord,
  };
}
