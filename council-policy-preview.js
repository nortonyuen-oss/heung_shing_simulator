const COUNCIL_POLICY_METADATA = Object.freeze({
  cleanAir: { issues: { environment: 2, business: -0.5 }, leadOfficialIds: ['observatory_head', 'treasury_head'] },
  roadRepair: { issues: { roads: 2, business: 1 }, leadOfficialIds: ['chief_executive', 'treasury_head'] },
  publicSafety: { issues: { public_safety: 2, governance: 0.5 }, leadOfficialIds: ['police_head', 'treasury_head'] },
  smallBusiness: { issues: { business: 2, tax: 1 }, leadOfficialIds: ['treasury_head', 'chief_executive'] },
  greenParks: { issues: { parks_culture: 2, environment: 1 }, leadOfficialIds: ['culture_head', 'treasury_head'] },
  educationReform: { issues: { education: 2, business: 0.5 }, leadOfficialIds: ['chief_executive', 'treasury_head'] },
  scienceDevelopment: { issues: { science: 2, education: 1, business: 1 }, leadOfficialIds: ['chief_executive', 'treasury_head'] },
  smokingBan: { issues: { health: 2, governance: 1, business: -0.25 }, leadOfficialIds: ['chief_executive', 'police_head'] },
  schoolHealthProgram: { issues: { health: 1.5, education: 1.5 }, leadOfficialIds: ['chief_executive', 'treasury_head'] },
  tourismPromotion: { issues: { tourism: 2, parks_culture: 0.5, business: 1 }, leadOfficialIds: ['culture_head', 'treasury_head'] },
  foreignInvestmentIncentive: { issues: { business: 2, finance: 1, tax: 0.5 }, leadOfficialIds: ['treasury_head', 'chief_executive'] },
  districtCouncilElection: { issues: { governance: 2 }, leadOfficialIds: ['chief_executive', 'treasury_head'] },
  icac: { issues: { governance: 2, business: 0.5 }, leadOfficialIds: ['chief_executive', 'police_head'] },
  legislativeCouncilElection: { issues: { governance: 3 }, leadOfficialIds: ['chief_executive', 'treasury_head'] },
  stockExchangeAct: { issues: { business: 2, finance: 1 }, leadOfficialIds: ['treasury_head', 'chief_executive'] },
});

const COUNCIL_VOTING_OFFICIAL_IDS = Object.freeze(
  COUNCIL_OFFICIAL_DEFS.filter((official) => official.role === 'councillor').map((official) => official.id),
);

function getCouncilPolicyDefinition(policyId) {
  return CITY_POLICY_DEFS.find((policy) => policy.id === policyId) ?? null;
}

function getCouncilPolicyEstimatedMonthlyCost(policyId) {
  const policy = getCouncilPolicyDefinition(policyId);
  if (!policy) return 0;
  let cost = Number(policy.monthlyBase || 0);
  if (policyId === 'cleanAir') cost += city.industrialCount * 4;
  if (policyId === 'roadRepair') cost += roadTileCount * 0.12;
  if (policyId === 'greenParks') cost += countPolicyParks() * 12;
  if (policyId === 'educationReform') cost += countEducationBuildings() * 24;
  if (policyId === 'scienceDevelopment') cost += city.industrialCount * 5;
  if (policyId === 'smokingBan') cost += Math.ceil(city.population / 2500) * 8;
  if (policyId === 'schoolHealthProgram') cost += countSchoolHealthProgramBuildings() * 18;
  return Math.round(cost);
}

function getCouncilIssueNeed(issueId) {
  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  if (issueId === 'finance') return city.budget < 0 ? 1 : clamp01(1 - city.budget / Math.max(10000, city.monthlyExpenses * 6));
  if (issueId === 'tax') return clamp01((Number(city.taxRate || 0.09) - 0.07) / 0.09);
  if (issueId === 'roads') return clamp01((city.trafficIndex ?? 0) * 1.4);
  if (issueId === 'public_safety') return clamp01((city.crimeRateIndex ?? 0) * 1.5);
  if (issueId === 'environment') return clamp01((city.pollution ?? 0) / 80);
  if (issueId === 'parks_culture') return clamp01((1 - (city.happiness ?? 0.5)) * 0.8 + (1 - getDepartmentFunding('parks')) * 0.5);
  if (issueId === 'education') return clamp01(1 - (city.educationAverageLevel ?? 0));
  if (issueId === 'health') return clamp01(Math.max(1 - (city.healthIndex ?? 0.5), city.epidemicSeverity ?? 0));
  if (issueId === 'business') return clamp01(Math.max((city.unemploymentRate ?? 0) * 4, -(city.demandC ?? 0)));
  if (issueId === 'tourism') return clamp01((city.pollution ?? 0) / 120 + (1 - (city.happiness ?? 0.5)) * 0.5);
  if (issueId === 'governance') return clamp01(1 - (city.ruleOfLawIndex ?? 0));
  if (issueId === 'science') return clamp01(1 - (city.scienceIndustryShare ?? 0));
  if (issueId === 'disaster_readiness') return clamp01(Math.max(city.epidemicSeverity ?? 0, typeof getTyphoonDisasterPressure === 'function' ? getTyphoonDisasterPressure() : 0));
  return 0.25;
}

function getCouncilPolicyNeedScore(policyId) {
  const metadata = COUNCIL_POLICY_METADATA[policyId];
  if (!metadata) return 0;
  let weightedNeed = 0;
  let totalWeight = 0;
  Object.entries(metadata.issues).forEach(([issueId, effect]) => {
    if (effect <= 0) return;
    weightedNeed += getCouncilIssueNeed(issueId) * effect;
    totalWeight += effect;
  });
  return totalWeight > 0 ? weightedNeed / totalWeight : 0;
}

function getCouncilPolicyFiscalScore(official, policyCost) {
  const netBefore = Number(city.monthlyIncome || 0) - Number(city.monthlyExpenses || 0);
  const projectedNet = netBefore - policyCost;
  const pressure = projectedNet >= 0 ? 0 : Math.min(2, Math.abs(projectedNet) / Math.max(250, city.monthlyIncome * 0.15));
  const multipliers = { austerity: 1.35, balanced: 1, spending: 0.65 };
  return -pressure * (multipliers[official.fiscalPreference] ?? 1);
}

function getCouncilPolicyPosition(policyId, officialId) {
  const policy = getCouncilPolicyDefinition(policyId);
  const metadata = COUNCIL_POLICY_METADATA[policyId];
  const official = getCouncilOfficialDefinition(officialId);
  if (!policy || !metadata || !official) return null;
  const ideology = Object.entries(metadata.issues).reduce(
    (sum, [issueId, effect]) => sum + Number(official.issueWeights?.[issueId] ?? 0) * effect,
    0,
  );
  const need = getCouncilPolicyNeedScore(policyId) * 2;
  const cost = getCouncilPolicyEstimatedMonthlyCost(policyId);
  const fiscal = getCouncilPolicyFiscalScore(official, cost);
  const score = ideology + need + fiscal;
  const stance = score >= 1.5 ? 'support' : (score <= -1 ? 'oppose' : 'reserve');
  const strongestReason = fiscal <= -1 && Math.abs(fiscal) >= Math.abs(ideology)
    ? 'fiscal'
    : (ideology >= 1.5 ? 'values' : (need >= 1.2 ? 'need' : 'uncertain'));
  return {
    officialId,
    policyId,
    stance,
    score,
    confidence: Math.min(1, Math.abs(score) / 5 * (0.6 + official.stubbornness * 0.1)),
    reasonCode: strongestReason,
    components: { ideology, need, fiscal },
  };
}

function getCouncilPolicyAdvisorOpinion(policyId, officialId) {
  const official = getCouncilOfficialDefinition(officialId);
  if (!official) return null;
  const cost = getCouncilPolicyEstimatedMonthlyCost(policyId);
  const need = getCouncilPolicyNeedScore(policyId);
  const fiscal = getCouncilPolicyFiscalScore(official, cost);
  const stance = officialId === 'treasury_head'
    ? (fiscal <= -1 ? 'concern' : 'support')
    : (need >= 0.45 ? 'support' : 'concern');
  return {
    officialId,
    stance,
    messageKey: `council.advice.${officialId}.${stance}`,
    params: { cost: councilMoney(cost), policy: t(`policy.${policyId}.title`) },
  };
}

function getCouncilPolicyPreview(policyId) {
  const policy = getCouncilPolicyDefinition(policyId);
  const metadata = COUNCIL_POLICY_METADATA[policyId];
  if (!policy || !metadata) return null;
  const cost = getCouncilPolicyEstimatedMonthlyCost(policyId);
  return {
    policy,
    metadata,
    cost,
    currentNet: Number(city.monthlyIncome || 0) - Number(city.monthlyExpenses || 0),
    projectedNet: Number(city.monthlyIncome || 0) - Number(city.monthlyExpenses || 0) - (isPolicyActive(policyId) ? 0 : cost),
    active: isPolicyActive(policyId),
    available: isPolicyAvailable(policyId),
    advisors: metadata.leadOfficialIds.map((id) => getCouncilPolicyAdvisorOpinion(policyId, id)).filter(Boolean),
    positions: COUNCIL_VOTING_OFFICIAL_IDS.map((id) => getCouncilPolicyPosition(policyId, id)).filter(Boolean),
  };
}
