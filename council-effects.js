// Temporary city modifiers, tourism/novelty indices, and scheduled council programmes.
// Gameplay outcomes are authoritative here; AI/news layers may only reword them.

function getCityMonthIndex(year = city.year, month = city.month) {
  return Math.max(0, Math.floor(Number(year) || 0) * 12 + Math.max(0, Math.floor(Number(month) || 1) - 1));
}

function councilEffectClamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function hashCouncilEffectSeed(text) {
  let hash = 2166136261;
  String(text).split('').forEach((character) => {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return (hash >>> 0) / 4294967296;
}

function getCouncilTemporaryModifier(key) {
  const monthIndex = getCityMonthIndex();
  return (Array.isArray(city.temporaryEffects) ? city.temporaryEffects : []).reduce((sum, effect) => {
    if (monthIndex < Number(effect.startMonthIndex) || monthIndex > Number(effect.endMonthIndex)) return sum;
    return sum + (Number(effect.modifiers?.[key]) || 0);
  }, 0);
}

function addCouncilTemporaryEffect(sourceId, durationMonths, modifiers, outcome = 'success') {
  normalizeCityFinanceState();
  const startMonthIndex = getCityMonthIndex();
  const duration = Math.max(1, Math.floor(Number(durationMonths) || 1));
  const id = `${sourceId}-${city.tick}-${city.temporaryEffects.length}`;
  city.temporaryEffects.push({
    id,
    sourceId,
    startMonthIndex,
    endMonthIndex: startMonthIndex + duration - 1,
    modifiers: Object.fromEntries(Object.entries(modifiers || {}).map(([key, value]) => [key, Number(value) || 0])),
    outcome,
  });
  city.temporaryEffects = city.temporaryEffects.slice(-40);
  const ridicule = Number(modifiers?.ridicule) || 0;
  if (ridicule) city.cityRidicule = councilEffectClamp(city.cityRidicule + ridicule, 0, 100);
  return city.temporaryEffects[city.temporaryEffects.length - 1];
}

function pruneExpiredCouncilEffects() {
  const monthIndex = getCityMonthIndex();
  city.temporaryEffects = (Array.isArray(city.temporaryEffects) ? city.temporaryEffects : [])
    .filter((effect) => Number(effect.endMonthIndex) >= monthIndex);
}

function updateCityAttractivenessMetrics() {
  const happiness = councilEffectClamp(city.happiness, 0, 1);
  const safety = 1 - councilEffectClamp(city.crimeRateIndex, 0, 1);
  const environment = 1 - councilEffectClamp((city.pollution || 0) / 160, 0, 1);
  const access = 1 - councilEffectClamp(city.trafficIndex, 0, 1);
  const economy = councilEffectClamp((Number(city.demandC) + 1) / 2, 0, 1);
  const culture = councilEffectClamp((getDepartmentFunding('parks') - 0.6) / 0.8, 0, 1);
  const lawBonus = isPolicyActive('arcticPenguinReserve') ? 4 : 0;
  const eventBonus = getCouncilTemporaryModifier('attractiveness');
  const ridicule = councilEffectClamp(city.cityRidicule, 0, 100);
  const memeBonus = ridicule <= 45 ? ridicule * 0.12 : Math.max(0, 5.4 - (ridicule - 45) * 0.05);
  const reputationPenalty = Math.max(0, ridicule - 65) * 0.25;
  const landmarkBonus = typeof sumSpecialBuildingEffect === 'function' ? sumSpecialBuildingEffect('attractivenessBonus') : 0;

  city.cityAttractiveness = councilEffectClamp(
    100 * (happiness * 0.25 + safety * 0.16 + environment * 0.17 + access * 0.12 + economy * 0.18 + culture * 0.12)
      + eventBonus + lawBonus + memeBonus - reputationPenalty + landmarkBonus,
    0,
    100,
  );
  city.tourismAppeal = councilEffectClamp(
    city.cityAttractiveness
      + getCouncilTemporaryModifier('tourism')
      + (isPolicyActive('tourismPromotion') ? 8 : 0)
      + (isPolicyActive('arcticPenguinReserve') ? 7 : 0),
    0,
    100,
  );
  const capacity = Math.max(200, city.commercialCount * 42 + city.population * 0.035);
  city.monthlyVisitors = Math.max(0, Math.round(capacity * (0.2 + city.tourismAppeal / 100)));
  city.tourismRevenue = Math.max(0, Math.round(city.monthlyVisitors * (0.45 + city.tourismAppeal / 220)));
}

function getCouncilResolutionUpfrontCost(resolutionId) {
  const definition = getCouncilResolutionDefinition(resolutionId);
  if (!definition) return 0;
  return Math.round(Number(definition.upfrontBase || 0) + city.population * Number(definition.costPerCitizen || 0));
}

function getCouncilResolutionReadiness(resolutionId, salt = '') {
  const definition = getCouncilResolutionDefinition(resolutionId);
  if (!definition) return 0;
  const power = councilEffectClamp(city.powerRatio ?? 1, 0, 1);
  const traffic = 1 - councilEffectClamp(city.trafficIndex, 0, 1);
  const safety = 1 - councilEffectClamp(city.crimeRateIndex, 0, 1);
  const culture = councilEffectClamp(getDepartmentFunding('parks') / 1.2, 0, 1);
  const environment = 1 - councilEffectClamp((city.pollution || 0) / 160, 0, 1);
  const affordability = city.budget >= getCouncilResolutionUpfrontCost(resolutionId) ? 1 : 0;
  const deterministic = hashCouncilEffectSeed(`${resolutionId}:${city.year}:${city.month}:${city.tick}:${salt}`) - 0.5;
  return councilEffectClamp(
    power * 0.23 + traffic * 0.16 + safety * 0.15 + culture * 0.17 + environment * 0.12
      + affordability * 0.17 + deterministic * 0.18,
    0,
    1,
  );
}

function resolveCouncilResolutionOutcome(resolutionId) {
  const definition = getCouncilResolutionDefinition(resolutionId);
  if (!definition) return null;
  if (definition.unlockBuildingType) {
    return { outcome: 'success', readiness: 1, refundCost: 0, modifiers: {} };
  }
  const readiness = getCouncilResolutionReadiness(resolutionId, 'approval');
  const outcome = readiness >= 0.56 ? 'success' : (definition.failureOutcome || 'failure');
  const modifiers = outcome === 'success' ? definition.successModifiers : definition.riskModifiers;
  if (!definition.programmeType) addCouncilTemporaryEffect(resolutionId, definition.durationMonths, modifiers, outcome);
  const refundCost = outcome !== 'success' && definition.failureRefundRate
    ? Math.round(getCouncilResolutionUpfrontCost(resolutionId) * Number(definition.failureRefundRate))
    : 0;
  if (refundCost > 0) city.budget -= refundCost;
  return { outcome, readiness, refundCost, modifiers: { ...modifiers } };
}

function findNextQuarterMonthIndex(afterMonthIndex) {
  for (let candidate = afterMonthIndex + 1; candidate <= afterMonthIndex + 12; candidate++) {
    const month = (candidate % 12) + 1;
    if ([3, 6, 9, 12].includes(month)) return candidate;
  }
  return afterMonthIndex + 3;
}

function startCouncilResolutionProgramme(resolutionId) {
  const definition = getCouncilResolutionDefinition(resolutionId);
  if (!definition?.programmeType) return null;
  const now = getCityMonthIndex();
  const program = {
    id: `${resolutionId}-${city.tick}`,
    resolutionId,
    type: definition.programmeType,
    startedMonthIndex: now,
    // Approval happens after the current tick has begun, so the first eligible
    // show is always the next quarter rather than later in the current month.
    nextShowMonthIndex: findNextQuarterMonthIndex(now),
    lastTriggeredMonthIndex: -1,
    remainingShows: Math.max(1, Number(definition.programmeShows) || 1),
    results: [],
  };
  city.council.activePrograms.push(program);
  return program;
}

function getDroneShowOutcome(program) {
  const severeWeather = ['signal8', 'signal9', 'signal10'].includes(city.weather?.typhoonStage)
    || ['red', 'black'].includes(city.weather?.rainWarning);
  const readiness = getCouncilResolutionReadiness(program.resolutionId, `show-${program.remainingShows}`);
  if (severeWeather || Number(city.powerRatio ?? 1) < 0.72) return { outcome: 'drone_crash', readiness };
  if (readiness >= 0.58) return { outcome: 'success', readiness };
  const failureRoll = hashCouncilEffectSeed(`${program.id}:${city.year}:${city.month}:failure`);
  if (failureRoll < 0.34) return { outcome: 'noise_complaints', readiness };
  if (failureRoll < 0.67) return { outcome: 'drone_crash', readiness };
  return { outcome: 'drones_wrong_city', readiness };
}

function getDroneShowFailureModifiers(definition, outcome) {
  if (outcome === 'noise_complaints') {
    return { ...definition.riskModifiers, happiness: -0.04, attractiveness: -3, ridicule: 7 };
  }
  if (outcome === 'drone_crash') {
    return { ...definition.riskModifiers, happiness: -0.035, attractiveness: -5, ridicule: 14 };
  }
  if (outcome === 'drones_wrong_city') {
    return { ...definition.riskModifiers, happiness: -0.05, tourism: -3, attractiveness: -7, ridicule: 22 };
  }
  return definition.riskModifiers;
}

function ensureDroneShowOverlay() {
  const container = document.getElementById('game-container');
  if (!container) return null;
  let overlay = document.getElementById('drone-show-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'drone-show-overlay';
  container.appendChild(overlay);
  return overlay;
}

function buildFireworkShow(overlay) {
  const bursts = [
    { x: 18, y: 42, delay: 0.15, color: '#ffcf4a', size: 0.88 },
    { x: 43, y: 27, delay: 0.72, color: '#ff5fa2', size: 1.08 },
    { x: 72, y: 39, delay: 1.22, color: '#67e8ff', size: 0.94 },
    { x: 29, y: 63, delay: 1.88, color: '#92ff77', size: 0.78 },
    { x: 59, y: 57, delay: 2.35, color: '#c27aff', size: 1.15 },
    { x: 84, y: 24, delay: 2.92, color: '#ff765e', size: 0.82 },
    { x: 48, y: 43, delay: 3.48, color: '#fff08a', size: 1.25 },
  ];
  const sparkCount = 16;
  overlay.replaceChildren(...bursts.map((burst) => {
    const firework = document.createElement('div');
    firework.className = 'firework-burst';
    firework.style.cssText = `--x:${burst.x}%;--y:${burst.y}%;--delay:${burst.delay}s;--color:${burst.color};--size:${burst.size}`;
    for (let spark = 0; spark < sparkCount; spark++) {
      const particle = document.createElement('i');
      particle.style.setProperty('--angle', `${spark * (360 / sparkCount)}deg`);
      particle.style.setProperty('--distance', `${58 + (spark % 3) * 13}px`);
      firework.appendChild(particle);
    }
    return firework;
  }));
}

function playQuarterlyDroneShow(outcome = 'success') {
  const overlay = ensureDroneShowOverlay();
  if (!overlay) return;
  buildFireworkShow(overlay);
  overlay.dataset.outcome = outcome;
  overlay.classList.remove('is-playing');
  void overlay.offsetWidth;
  overlay.classList.add('is-playing');
  window.clearTimeout(playQuarterlyDroneShow.cleanupTimer);
  playQuarterlyDroneShow.cleanupTimer = window.setTimeout(() => overlay.classList.remove('is-playing'), 5000);
}

function triggerQuarterlyDroneShow(program) {
  const definition = getCouncilResolutionDefinition(program.resolutionId);
  const result = getDroneShowOutcome(program);
  const modifiers = result.outcome === 'success'
    ? definition.successModifiers
    : getDroneShowFailureModifiers(definition, result.outcome);
  addCouncilTemporaryEffect(`${program.resolutionId}-show`, 1, modifiers, result.outcome);
  playQuarterlyDroneShow(result.outcome);
  program.results.push({
    monthIndex: getCityMonthIndex(), year: city.year, month: city.month,
    outcome: result.outcome, readiness: Number(result.readiness.toFixed(3)),
  });
  program.remainingShows--;
  program.lastTriggeredMonthIndex = getCityMonthIndex();
  program.nextShowMonthIndex = findNextQuarterMonthIndex(getCityMonthIndex());
}

function summarizeDroneShowProgramme(program) {
  const counts = {};
  program.results.forEach((result) => { counts[result.outcome] = (counts[result.outcome] || 0) + 1; });
  const failurePriority = ['drones_wrong_city', 'drone_crash', 'noise_complaints'];
  const primaryFailure = failurePriority.find((outcome) => counts[outcome] > 0) || '';
  return {
    outcome: primaryFailure || 'success',
    showCount: program.results.length,
    successCount: counts.success || 0,
    failureCount: program.results.length - (counts.success || 0),
    outcomeCounts: counts,
  };
}

function announceDueResolutionNewspapers(monthIndex) {
  if (typeof announceCouncilResolutionNews !== 'function') return;
  (city.council.resolutionHistory || []).forEach((record) => {
    if (record.completedMonthIndex != null || record.reportAnnounced) return;
    const dueMonthIndex = Number(record.reportDueMonthIndex);
    if (!Number.isFinite(dueMonthIndex) || monthIndex < dueMonthIndex) return;
    // Mark before starting the async AI request so another simulation tick cannot
    // queue a duplicate newspaper while generation is still pending.
    record.reportAnnounced = true;
    announceCouncilResolutionNews(record.resolutionId, record.outcome, {
      refundCost: Number(record.refundCost) || 0,
      approvedMonthIndex: Number(record.approvedMonthIndex),
      reportDueMonthIndex: dueMonthIndex,
    });
  });
}

function updateCouncilTimedSystems() {
  normalizeCityFinanceState();
  const monthIndex = getCityMonthIndex();
  if (city.council.lastTimedMonthIndex === monthIndex) return;
  city.council.lastTimedMonthIndex = monthIndex;
  city.cityRidicule = councilEffectClamp(city.cityRidicule - 1.5, 0, 100);
  if (isPolicyActive('arcticPenguinReserve')) city.cityRidicule = councilEffectClamp(city.cityRidicule + 2.2, 0, 100);
  if (isPolicyActive('busSeatbeltMandate') && Number(city.trafficIndex || 0) < 0.2) {
    city.cityRidicule = councilEffectClamp(city.cityRidicule + 0.35, 0, 100);
  }
  pruneExpiredCouncilEffects();
  announceDueResolutionNewspapers(monthIndex);
  if (typeof generateMonthlyForumPost === 'function') generateMonthlyForumPost(monthIndex);

  city.council.activePrograms.forEach((program) => {
    if (program.type !== 'quarterly_drone_show' || program.remainingShows <= 0) return;
    if (monthIndex > Number(program.nextShowMonthIndex)) {
      program.nextShowMonthIndex = findNextQuarterMonthIndex(monthIndex - 1);
    }
    if (monthIndex !== Number(program.nextShowMonthIndex) || program.lastTriggeredMonthIndex === monthIndex) return;
    triggerQuarterlyDroneShow(program);
  });
  const completed = city.council.activePrograms.filter((program) => program.remainingShows <= 0);
  completed.forEach((program) => {
    const summary = summarizeDroneShowProgramme(program);
    city.council.resolutionHistory.push({
      resolutionId: program.resolutionId,
      completedMonthIndex: monthIndex,
      results: program.results.slice(),
      summary,
    });
    if (typeof announceCouncilResolutionNews === 'function') {
      announceCouncilResolutionNews(program.resolutionId, summary.outcome, summary);
    }
  });
  city.council.activePrograms = city.council.activePrograms.filter((program) => program.remainingShows > 0);
  city.council.resolutionHistory = city.council.resolutionHistory.slice(-50);
  if (typeof document !== 'undefined'
    && document.getElementById('legislative-window')?.classList.contains('is-open')
    && typeof updateCouncilMeetingUi === 'function') {
    updateCouncilMeetingUi();
  }
}
