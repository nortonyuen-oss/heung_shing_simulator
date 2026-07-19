// Deterministic council sessions. AI never decides votes or gameplay outcomes.

function getCouncilItemDefinition(itemType, itemId) {
  return itemType === 'resolution'
    ? getCouncilResolutionDefinition(itemId)
    : getCouncilPolicyDefinition(itemId);
}

function getCouncilItemMetadata(itemType, itemId) {
  return itemType === 'resolution'
    ? getCouncilResolutionDefinition(itemId)
    : COUNCIL_POLICY_METADATA[itemId];
}

function getCouncilItemTitleKey(itemType, itemId) {
  const definition = getCouncilItemDefinition(itemType, itemId);
  return definition?.titleKey || '';
}

function getCouncilMotionCost(itemType, itemId, motion) {
  if (itemType === 'resolution') return getCouncilResolutionUpfrontCost(itemId);
  const cost = getCouncilPolicyEstimatedMonthlyCost(itemId);
  return motion === 'repeal' ? -cost : cost;
}

function getCouncilMotionAvailability(itemType, itemId, motion) {
  normalizeCityFinanceState();
  const monthIndex = getCityMonthIndex();
  if (!hasBuildingType('legislative_council')) return { available: false, reason: 'needsCouncil' };
  if (city.council.activeSession) return { available: false, reason: 'sessionActive' };
  if (itemType === 'resolution') {
    const definition = getCouncilResolutionDefinition(itemId);
    if (!definition) return { available: false, reason: 'unknown' };
    const state = city.council.resolutionStates[itemId];
    if (definition.oneTime && Number(state?.timesApproved || 0) > 0) {
      return { available: false, reason: 'alreadyApproved' };
    }
    if (definition.requiresBuildingType && !hasBuildingType(definition.requiresBuildingType)) return { available: false, reason: 'needsBuilding' };
    if (definition.unlockPopulation && city.population < definition.unlockPopulation) {
      return { available: false, reason: 'population', threshold: definition.unlockPopulation, current: city.population };
    }
    if (definition.minimumMonthlyIncome && Number(city.monthlyIncome || 0) < definition.minimumMonthlyIncome) {
      return { available: false, reason: 'monthlyIncome', threshold: definition.minimumMonthlyIncome, current: Number(city.monthlyIncome || 0) };
    }
    const monthlySurplus = Number(city.monthlyIncome || 0) - Number(city.monthlyExpenses || 0);
    if (definition.minimumMonthlySurplus && monthlySurplus < definition.minimumMonthlySurplus) {
      return { available: false, reason: 'monthlySurplus', threshold: definition.minimumMonthlySurplus, current: monthlySurplus };
    }
    const economyIndex = typeof getCityEconomyIndex === 'function' ? getCityEconomyIndex() : 0;
    if (definition.minimumEconomyIndex && economyIndex < definition.minimumEconomyIndex) {
      return { available: false, reason: 'economy', threshold: definition.minimumEconomyIndex, current: economyIndex };
    }
    if (monthIndex < Number(state?.cooldownUntilMonthIndex ?? -1)) return { available: false, reason: 'cooldown' };
    if (city.council.activePrograms.some((program) => program.resolutionId === itemId)) return { available: false, reason: 'programActive' };
    if (city.budget < getCouncilResolutionUpfrontCost(itemId)) return { available: false, reason: 'insufficientFunds' };
    return { available: true, reason: 'available' };
  }
  const definition = getCouncilPolicyDefinition(itemId);
  if (!definition) return { available: false, reason: 'unknown' };
  if (definition.unlockPopulation && city.population < definition.unlockPopulation) return { available: false, reason: 'population' };
  const isActive = isPolicyActive(itemId);
  if (motion === 'repeal' && !isActive) return { available: false, reason: 'notActive' };
  if (motion === 'enact' && isActive) return { available: false, reason: 'alreadyActive' };
  const state = city.council.policyStates[itemId];
  if (monthIndex < Number(state?.cooldownUntilMonthIndex ?? -1)) return { available: false, reason: 'cooldown' };
  return { available: true, reason: 'available' };
}

function getCouncilTagAffinity(official, tags) {
  const likes = new Set(official.likes || []);
  const dislikes = new Set(official.dislikes || []);
  return (tags || []).reduce((score, tag) => score + (likes.has(tag) ? 1.15 : 0) - (dislikes.has(tag) ? 1.15 : 0), 0);
}

function getCouncilDeterministicVariance(seed, officialId) {
  return (hashCouncilEffectSeed(`${seed}:${officialId}`) - 0.5) * 0.5;
}

function getCouncilMotionPosition(itemType, itemId, motion, officialId, seed = 'preview') {
  const official = getCouncilOfficialDefinition(officialId);
  const metadata = getCouncilItemMetadata(itemType, itemId);
  if (!official || !metadata) return null;
  let ideology = Object.entries(metadata.issues || {}).reduce(
    (sum, [issueId, effect]) => sum + Number(official.issueWeights?.[issueId] || 0) * Number(effect || 0),
    0,
  );
  ideology += getCouncilTagAffinity(official, metadata.tags);

  let need = 0;
  let totalNeedWeight = 0;
  Object.entries(metadata.issues || {}).forEach(([issueId, effect]) => {
    if (Number(effect) <= 0) return;
    need += getCouncilIssueNeed(issueId) * Number(effect);
    totalNeedWeight += Number(effect);
  });
  need = totalNeedWeight > 0 ? (need / totalNeedWeight) * 2.2 : 0;

  const cost = Math.abs(getCouncilMotionCost(itemType, itemId, motion));
  let fiscal = 0;
  if (itemType === 'resolution') {
    const pressure = cost / Math.max(1, Math.max(city.budget, city.monthlyIncome * 12, 100000));
    fiscal = -Math.min(2.5, pressure * 5) * ({ austerity: 1.35, balanced: 1, spending: 0.65 }[official.fiscalPreference] || 1);
  } else {
    fiscal = getCouncilPolicyFiscalScore(official, cost);
  }

  let coreScore = ideology + need + fiscal;
  if (motion === 'repeal') coreScore *= -1;
  const trust = ((Number(city.council?.trust?.[officialId] ?? 50) - 50) / 50);
  const leads = metadata.leadOfficialIds || [];
  const relationship = leads.length > 0
    ? leads.reduce((sum, leadId) => sum + Number(city.council?.relationships?.[officialId]?.[leadId] || 0), 0) / leads.length / 100 * 0.75
    : 0;
  const variance = getCouncilDeterministicVariance(seed, officialId);
  const stubbornnessMultiplier = { 1: 1, 2: 0.85, 3: 0.65, 4: 0.45, 5: 0.25 }[official.stubbornness] || 0.65;
  const persuadable = (trust + relationship + variance) * stubbornnessMultiplier;
  const score = coreScore + persuadable;
  const stance = score >= 1 ? 'support' : (score <= -1 ? 'oppose' : 'reserve');
  const reasonCode = Math.abs(fiscal) >= Math.abs(ideology) && fiscal < -0.5
    ? 'fiscal'
    : Math.abs(ideology) >= 1 ? 'values' : need >= 1 ? 'need' : 'uncertain';
  return {
    officialId, itemType, itemId, motion, stance, score,
    confidence: Math.min(1, Math.abs(score) / 4), reasonCode,
    components: { ideology, need, fiscal, trust, relationship, variance, persuadable },
  };
}

function buildCouncilMotionPreview(itemType, itemId, motion, seed = 'preview') {
  const metadata = getCouncilItemMetadata(itemType, itemId);
  if (!metadata) return null;
  const positions = COUNCIL_VOTING_OFFICIAL_IDS
    .map((officialId) => getCouncilMotionPosition(itemType, itemId, motion, officialId, seed))
    .filter(Boolean);
  const certainYes = positions.filter((position) => position.score >= 1).length;
  const possibleYes = positions.filter((position) => position.score > -1).length;
  return {
    itemType, itemId, motion,
    definition: getCouncilItemDefinition(itemType, itemId),
    metadata,
    cost: getCouncilMotionCost(itemType, itemId, motion),
    positions,
    predictedYesMin: certainYes,
    predictedYesMax: possibleYes,
    advisors: (metadata.leadOfficialIds || []).slice(0, 2),
  };
}

function createCouncilSession(itemType, itemId, motion) {
  const availability = getCouncilMotionAvailability(itemType, itemId, motion);
  if (!availability.available) return { ok: false, reason: availability.reason };
  const seed = `${itemType}:${itemId}:${motion}:${city.tick}:${city.year}:${city.month}`;
  const preview = buildCouncilMotionPreview(itemType, itemId, motion, seed);
  city.council.activeSession = {
    id: `session-${city.tick}-${itemId}`,
    itemType, itemId, motion, stage: 'draft', seed,
    createdTick: city.tick, year: city.year, month: city.month,
    preview,
    voteSnapshot: null,
  };
  if (itemType === 'policy') {
    city.council.policyStates[itemId].status = motion === 'repeal' ? 'repeal_draft' : 'draft';
  }
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return { ok: true, session: city.council.activeSession };
}

function castCouncilVote(position, sessionSeed) {
  let choice;
  if (position.score >= 1) choice = 'yes';
  else if (position.score <= -1) choice = 'no';
  else choice = hashCouncilEffectSeed(`${sessionSeed}:vote:${position.officialId}`) < (position.score + 1) / 2 ? 'yes' : 'no';
  return {
    officialId: position.officialId,
    choice,
    score: Number(position.score.toFixed(4)),
    reasonCodes: [position.reasonCode],
    components: Object.fromEntries(Object.entries(position.components).map(([key, value]) => [key, Number(value.toFixed(4))])),
  };
}

function startCouncilSessionVote() {
  const session = city.council.activeSession;
  if (!session || session.stage !== 'draft') return false;
  const preview = buildCouncilMotionPreview(session.itemType, session.itemId, session.motion, session.seed);
  const votes = preview.positions.map((position) => castCouncilVote(position, session.seed));
  const yesCount = votes.filter((vote) => vote.choice === 'yes').length;
  const noCount = votes.length - yesCount;
  session.voteSnapshot = {
    id: `vote-${session.id}`,
    itemType: session.itemType, itemId: session.itemId, policyId: session.itemType === 'policy' ? session.itemId : null,
    motion: session.motion, year: city.year, month: city.month, tick: city.tick,
    seed: session.seed, cost: preview.cost, votes, yesCount, noCount, abstainCount: 0,
    councilResult: yesCount >= 3 ? 'passed' : 'rejected',
    executiveDecision: null, result: yesCount >= 3 ? 'awaiting_executive' : 'rejected',
    citySnapshot: {
      budget: city.budget, monthlyIncome: city.monthlyIncome, monthlyExpenses: city.monthlyExpenses,
      happiness: city.happiness, pollution: city.pollution, crime: city.crimeRateIndex,
      traffic: city.trafficIndex, attractiveness: city.cityAttractiveness, ridicule: city.cityRidicule,
    },
  };
  session.stage = session.voteSnapshot.councilResult === 'passed' ? 'executive' : 'result';
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

function resetCouncilPolicySessionStatus(session) {
  if (session?.itemType !== 'policy') return;
  const state = city.council.policyStates[session.itemId];
  state.status = isPolicyActive(session.itemId) ? 'active' : 'inactive';
}

function recordAndClearCouncilSession() {
  const session = city.council.activeSession;
  if (!session?.voteSnapshot) return false;
  city.council.voteHistory.push(JSON.parse(JSON.stringify(session.voteSnapshot)));
  city.council.voteHistory = city.council.voteHistory.slice(-50);
  resetCouncilPolicySessionStatus(session);
  city.council.activeSession = null;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

function decideCouncilSession(approve) {
  const session = city.council.activeSession;
  const vote = session?.voteSnapshot;
  if (!session || !vote || vote.councilResult !== 'passed' || session.stage !== 'executive') return false;
  const monthIndex = getCityMonthIndex();
  vote.executiveDecision = approve ? 'approved' : 'vetoed';
  vote.result = approve ? 'approved' : 'vetoed';

  if (!approve) {
    vote.votes.filter((item) => item.choice === 'yes').forEach((item) => {
      city.council.trust[item.officialId] = Math.max(0, Number(city.council.trust[item.officialId] || 50) - 2);
    });
    if (session.itemType === 'policy') city.council.policyStates[session.itemId].cooldownUntilMonthIndex = monthIndex + 3;
    else city.council.resolutionStates[session.itemId].cooldownUntilMonthIndex = monthIndex + 3;
    return recordAndClearCouncilSession();
  }

  if (session.itemType === 'policy') {
    city.activePolicies[session.itemId] = session.motion === 'enact';
    city.council.policyStates[session.itemId] = {
      ...city.council.policyStates[session.itemId],
      status: city.activePolicies[session.itemId] ? 'active' : 'inactive',
      lastChangedTick: city.tick,
    };
    if (typeof announceCouncilPolicyNews === 'function') announceCouncilPolicyNews(session.itemId, session.motion);
  } else {
    const definition = getCouncilResolutionDefinition(session.itemId);
    const cost = getCouncilResolutionUpfrontCost(session.itemId);
    city.budget -= cost;
    const state = city.council.resolutionStates[session.itemId];
    state.timesApproved++;
    state.cooldownUntilMonthIndex = monthIndex + definition.cooldownMonths;
    let resolutionResult;
    if (definition.programmeType) {
      startCouncilResolutionProgramme(session.itemId);
      resolutionResult = { outcome: 'scheduled', readiness: getCouncilResolutionReadiness(session.itemId, 'programme') };
    } else {
      resolutionResult = resolveCouncilResolutionOutcome(session.itemId);
      city.council.resolutionHistory.push({
        resolutionId: session.itemId, approvedMonthIndex: monthIndex, cost,
        outcome: resolutionResult.outcome, readiness: resolutionResult.readiness,
        refundCost: resolutionResult.refundCost || 0,
        reportDueMonthIndex: monthIndex + 3,
        reportAnnounced: false,
      });
    }
    vote.gameplayOutcome = { resolutionId: session.itemId, cost, ...resolutionResult };
  }

  vote.votes.filter((item) => item.choice === 'yes').forEach((item) => {
    city.council.trust[item.officialId] = Math.min(100, Number(city.council.trust[item.officialId] || 50) + 1);
  });
  if (typeof computeHappiness === 'function') computeHappiness(activeScene);
  if (typeof updateCityAttractivenessMetrics === 'function') updateCityAttractivenessMetrics();
  if (typeof updateDemand === 'function') updateDemand();
  if (typeof updateHUD === 'function') updateHUD();
  return recordAndClearCouncilSession();
}

function finishRejectedCouncilSession() {
  const session = city.council.activeSession;
  if (!session?.voteSnapshot || session.voteSnapshot.councilResult !== 'rejected') return false;
  return recordAndClearCouncilSession();
}

function cancelCouncilSession() {
  const session = city.council.activeSession;
  if (!session || session.voteSnapshot) return false;
  resetCouncilPolicySessionStatus(session);
  city.council.activeSession = null;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}
