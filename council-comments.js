// Rule-based, read-only council opinions. The engine chooses the fact and stance;
// UI and future AI layers may change wording but never the underlying reason.

function councilPercent(value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
}

function councilMoney(value) {
  return typeof formatMoney === 'function' ? formatMoney(Math.round(Number(value) || 0)) : `$${Math.round(Number(value) || 0)}`;
}

function makeCouncilComment(officialId, issueId, stance, severity, reasonCode, messageKey, params = {}) {
  return { officialId, issueId, stance, severity, reasonCode, messageKey, params };
}

function getCouncilCommentSignals() {
  const monthlyIncome = Number(city.monthlyIncome || 0);
  const monthlyExpenses = Number(city.monthlyExpenses || 0);
  const monthlyNet = monthlyIncome - monthlyExpenses;
  const market = city.stockMarket ?? {};
  const hsi = Number(market.hsi ?? HSI_BASE_LEVEL);
  const previousHsi = Math.max(1, Number(market.prevHsi ?? hsi));
  return {
    budget: Number(city.budget || 0),
    monthlyIncome,
    monthlyExpenses,
    monthlyNet,
    taxRate: Number(city.taxRate || 0),
    policeFunding: Number(city.departmentBudgets?.police ?? 100),
    parksFunding: Number(city.departmentBudgets?.parks ?? 100),
    happiness: Number(city.happiness ?? 0.5),
    crime: Number(city.crimeRateIndex ?? 0),
    pollution: Number(city.pollution ?? 0),
    unemployment: Number(city.unemploymentRate ?? 0),
    education: Number(city.educationAverageLevel ?? 0),
    health: Number(city.healthIndex ?? 0.5),
    ruleOfLaw: Number(city.ruleOfLawIndex ?? 0),
    commercialDemand: Number(city.demandC ?? 0),
    activePolicyCount: Object.values(city.activePolicies ?? {}).filter(Boolean).length,
    temperature: Number(city.weather?.temperatureC ?? 24),
    typhoonStage: String(city.weather?.typhoonStage ?? 'none'),
    epidemicSeverity: Number(city.epidemicSeverity ?? 0),
    hsiChange: (hsi - previousHsi) / previousHsi,
  };
}

function getChiefExecutiveComment(s) {
  if (s.happiness < 0.38) return makeCouncilComment('chief_executive', 'governance', 'concern', 3, 'public_approval_low', 'council.comment.chief.publicConcern', { value: councilPercent(s.happiness) });
  if (s.monthlyNet < 0) return makeCouncilComment('chief_executive', 'finance', 'concern', 2, 'budget_deficit', 'council.comment.chief.deficit', { net: councilMoney(s.monthlyNet) });
  if (s.crime > 0.55) return makeCouncilComment('chief_executive', 'public_safety', 'concern', 2, 'crime_high', 'council.comment.chief.crime', { value: councilPercent(s.crime) });
  return makeCouncilComment('chief_executive', 'governance', 'neutral', 0, 'government_stable', 'council.comment.chief.stable');
}

function getTreasuryComment(s) {
  if (s.budget < 0 || s.monthlyNet < -Math.max(500, s.monthlyIncome * 0.2)) return makeCouncilComment('treasury_head', 'finance', 'oppose', 3, 'deficit_severe', 'council.comment.treasury.deficit', { budget: councilMoney(s.budget), net: councilMoney(s.monthlyNet) });
  if (s.taxRate >= 0.14) return makeCouncilComment('treasury_head', 'tax', 'concern', 2, 'tax_high', 'council.comment.treasury.taxHigh', { value: councilPercent(s.taxRate) });
  if (s.monthlyNet > Math.max(500, s.monthlyIncome * 0.12)) return makeCouncilComment('treasury_head', 'finance', 'support', 1, 'surplus', 'council.comment.treasury.surplus', { net: councilMoney(s.monthlyNet) });
  return makeCouncilComment('treasury_head', 'finance', 'neutral', 0, 'budget_balanced', 'council.comment.treasury.balanced');
}

function getPoliceComment(s) {
  if (s.crime >= 0.55) return makeCouncilComment('police_head', 'public_safety', 'concern', 3, 'crime_high', 'council.comment.police.crimeHigh', { value: councilPercent(s.crime) });
  if (s.policeFunding < 80) return makeCouncilComment('police_head', 'public_safety', 'oppose', 2, 'police_underfunded', 'council.comment.police.underfunded', { value: `${Math.round(s.policeFunding)}%` });
  return makeCouncilComment('police_head', 'public_safety', 'neutral', 0, 'crime_stable', 'council.comment.police.stable', { value: councilPercent(s.crime) });
}

function getObservatoryComment(s) {
  if (s.typhoonStage !== 'none') return makeCouncilComment('observatory_head', 'disaster_readiness', 'concern', 3, 'typhoon_active', 'council.comment.observatory.typhoon');
  if (s.temperature >= 33) return makeCouncilComment('observatory_head', 'environment', 'neutral', 2, 'temperature_hot', 'council.comment.observatory.hot', { value: `${Math.round(s.temperature)}°C` });
  if (s.pollution >= 65) return makeCouncilComment('observatory_head', 'environment', 'concern', 2, 'pollution_high', 'council.comment.observatory.pollution', { value: Math.round(s.pollution) });
  return makeCouncilComment('observatory_head', 'environment', 'support', 0, 'environment_stable', 'council.comment.observatory.clear');
}

function getCultureComment(s) {
  if (s.parksFunding < 80) return makeCouncilComment('culture_head', 'parks_culture', 'oppose', 3, 'parks_underfunded', 'council.comment.culture.cuts', { value: `${Math.round(s.parksFunding)}%` });
  if (s.happiness < 0.45) return makeCouncilComment('culture_head', 'parks_culture', 'concern', 2, 'happiness_low', 'council.comment.culture.unhappy', { value: councilPercent(s.happiness) });
  if (s.parksFunding > 120) return makeCouncilComment('culture_head', 'parks_culture', 'support', 1, 'parks_well_funded', 'council.comment.culture.funded', { value: `${Math.round(s.parksFunding)}%` });
  return makeCouncilComment('culture_head', 'parks_culture', 'neutral', 0, 'culture_event_wanted', 'council.comment.culture.event');
}

function getDemocracyComment(s) {
  if (s.unemployment >= 0.1) return makeCouncilComment('councillor_democracy', 'governance', 'concern', 3, 'unemployment_high', 'council.comment.democracy.unemployment', { value: councilPercent(s.unemployment) });
  if (s.ruleOfLaw < 0.4) return makeCouncilComment('councillor_democracy', 'governance', 'concern', 2, 'rule_of_law_low', 'council.comment.democracy.ruleOfLaw', { value: councilPercent(s.ruleOfLaw) });
  if (s.education < 0.4 || s.health < 0.4) return makeCouncilComment('councillor_democracy', 'education', 'concern', 2, 'public_services_weak', 'council.comment.democracy.services');
  return makeCouncilComment('councillor_democracy', 'governance', 'neutral', 0, 'transparency_watch', 'council.comment.democracy.watch');
}

function getLibertyComment(s) {
  if (s.taxRate >= 0.13) return makeCouncilComment('councillor_liberty', 'tax', 'oppose', 3, 'tax_high', 'council.comment.liberty.taxHigh', { value: councilPercent(s.taxRate) });
  if (s.activePolicyCount >= 7) return makeCouncilComment('councillor_liberty', 'governance', 'concern', 2, 'government_too_large', 'council.comment.liberty.bureaucracy', { count: s.activePolicyCount });
  if (Number(city.scienceIndustryShare ?? 0) >= 0.15) return makeCouncilComment('councillor_liberty', 'science', 'support', 1, 'science_growth', 'council.comment.liberty.science');
  return makeCouncilComment('councillor_liberty', 'finance', 'neutral', 0, 'government_restraint', 'council.comment.liberty.restraint');
}

function getBusinessComment(s) {
  if (s.hsiChange <= -0.03) return makeCouncilComment('councillor_business', 'business', 'concern', 3, 'stock_market_fall', 'council.comment.business.marketFall', { value: `${(s.hsiChange * 100).toFixed(1)}%` });
  if (s.taxRate >= 0.13) return makeCouncilComment('councillor_business', 'tax', 'oppose', 2, 'tax_high', 'council.comment.business.taxHigh', { value: councilPercent(s.taxRate) });
  if (s.unemployment >= 0.1 || s.commercialDemand < -0.25) return makeCouncilComment('councillor_business', 'business', 'concern', 2, 'market_weak', 'council.comment.business.weak');
  return makeCouncilComment('councillor_business', 'business', 'support', 0, 'market_confidence', 'council.comment.business.confident');
}

function getTourismComment(s) {
  if (s.pollution >= 65) return makeCouncilComment('councillor_tourism', 'tourism', 'oppose', 3, 'pollution_hurts_tourism', 'council.comment.tourism.pollution', { value: Math.round(s.pollution) });
  if (isPolicyActive('tourismPromotion')) return makeCouncilComment('councillor_tourism', 'tourism', 'support', 1, 'tourism_policy_active', 'council.comment.tourism.promotion');
  if (s.happiness < 0.45) return makeCouncilComment('councillor_tourism', 'tourism', 'concern', 2, 'city_appeal_low', 'council.comment.tourism.appeal', { value: councilPercent(s.happiness) });
  return makeCouncilComment('councillor_tourism', 'tourism', 'neutral', 0, 'photo_spot_wanted', 'council.comment.tourism.landmark');
}

function getReligionComment(s) {
  if (s.epidemicSeverity >= 0.25 || ['signal8', 'signal9', 'signal10'].includes(s.typhoonStage)) return makeCouncilComment('councillor_religion', 'disaster_readiness', 'support', 3, 'community_mutual_aid', 'council.comment.religion.disaster');
  if (s.health < 0.4) return makeCouncilComment('councillor_religion', 'health', 'concern', 2, 'health_low', 'council.comment.religion.health', { value: councilPercent(s.health) });
  if (s.crime >= 0.55) return makeCouncilComment('councillor_religion', 'governance', 'concern', 2, 'violence_high', 'council.comment.religion.crime');
  return makeCouncilComment('councillor_religion', 'health', 'neutral', 0, 'community_support', 'council.comment.religion.community');
}

const COUNCIL_COMMENT_BUILDERS = {
  chief_executive: getChiefExecutiveComment,
  treasury_head: getTreasuryComment,
  police_head: getPoliceComment,
  observatory_head: getObservatoryComment,
  culture_head: getCultureComment,
  councillor_democracy: getDemocracyComment,
  councillor_liberty: getLibertyComment,
  councillor_business: getBusinessComment,
  councillor_tourism: getTourismComment,
  councillor_religion: getReligionComment,
};

function getCurrentCouncilComment(officialId) {
  const builder = COUNCIL_COMMENT_BUILDERS[officialId];
  return builder ? builder(getCouncilCommentSignals()) : null;
}

