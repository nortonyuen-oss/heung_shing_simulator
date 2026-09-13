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

function handleCouncilPolicyLifecycle(policyId, motion, monthIndex = getCityMonthIndex()) {
  normalizeCityFinanceState();
  if (!Array.isArray(city.council.policyNewsSchedules)) city.council.policyNewsSchedules = [];

  if (policyId === 'industrialBuildingRevitalization' && motion === 'enact') {
    if (typeof announceIndustrialBuildingRevitalizationForum === 'function') {
      announceIndustrialBuildingRevitalizationForum(monthIndex);
    }
  }

  if (policyId !== 'strongCountryManufacturing') return;
  if (motion === 'repeal') {
    city.council.policyNewsSchedules.forEach((schedule) => {
      if (schedule.policyId !== policyId || schedule.researchAnnounced) return;
      schedule.researchCancelled = true;
    });
    return;
  }

  const enactedYear = Math.floor(Number(city.year) || 1900);
  const seed = `strong-country:${enactedYear}:${monthIndex}:${city.tick}:${city.council.policyNewsSchedules.length}`;
  const researchDelay = 1 + Math.floor(hashCouncilEffectSeed(seed) * 6);
  city.council.policyNewsSchedules.push({
    id: `strong-country-${monthIndex}-${city.tick}`,
    policyId,
    enactedYear,
    enactedMonthIndex: monthIndex,
    abuseDueMonthIndex: monthIndex + 6,
    researchDueMonthIndex: monthIndex + 6 + researchDelay,
    abuseAnnounced: false,
    researchAnnounced: false,
    researchCancelled: false,
  });
  city.council.policyNewsSchedules = city.council.policyNewsSchedules.slice(-12);
}

function announceDuePolicyForumNews(monthIndex) {
  if (!Array.isArray(city.council.policyNewsSchedules)) return;
  city.council.policyNewsSchedules.forEach((schedule) => {
    if (schedule.policyId !== 'strongCountryManufacturing') return;
    if (!schedule.abuseAnnounced && monthIndex >= Number(schedule.abuseDueMonthIndex)) {
      schedule.abuseAnnounced = true;
      city.budget -= 2000;
      city.cityRidicule = councilEffectClamp(city.cityRidicule + 10, 0, 100);
      if (typeof announceStrongCountryAbuseForum === 'function') {
        announceStrongCountryAbuseForum(schedule);
      }
    }
    if (
      !schedule.researchAnnounced
      && !schedule.researchCancelled
      && monthIndex >= Number(schedule.researchDueMonthIndex)
    ) {
      schedule.researchAnnounced = true;
      if (typeof announceStrongCountryResearchForum === 'function') {
        announceStrongCountryResearchForum(schedule);
      }
    }
  });
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

// A bill costs a floor plus N months of the city's monthly income, so the
// price scales with the city instead of running away from it. The floor on
// income keeps a brand-new city from getting a big programme for nothing.
const COUNCIL_RESOLUTION_INCOME_FLOOR = 2000;

function getCouncilResolutionUpfrontCost(resolutionId) {
  const definition = getCouncilResolutionDefinition(resolutionId);
  if (!definition) return 0;
  const monthlyIncome = Math.max(COUNCIL_RESOLUTION_INCOME_FLOOR, Number(city.monthlyIncome) || 0);
  return Math.round(
    Number(definition.upfrontBase || 0) + monthlyIncome * Number(definition.monthsOfIncome || 0),
  );
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

// 幻彩fing香城: a show every three calendar months, on the evening of that
// month's sky-day. One sky-day is one month (game-clock.js), so "the 20:00
// of that month" is a single, unambiguous moment; the show then runs for
// thirty displayed minutes - ten real seconds at 1x, and it pauses with the
// clock. Approval schedules the first show three months out.
const DRONE_SHOW_INTERVAL_MONTHS = 3;
const DRONE_SHOW_START_MINUTE = 20 * 60;
const DRONE_SHOW_DURATION_MINUTES = 30;
// Firework volleys are re-launched on this real-time cadence while the show
// is live, so the sky keeps bursting for the whole thirty displayed minutes
// whatever the game speed.
const DRONE_SHOW_VOLLEY_REAL_MS = 3200;

function startCouncilResolutionProgramme(resolutionId) {
  const definition = getCouncilResolutionDefinition(resolutionId);
  if (!definition?.programmeType) return null;
  const now = getCityMonthIndex();
  const program = {
    id: `${resolutionId}-${city.tick}`,
    resolutionId,
    type: definition.programmeType,
    startedMonthIndex: now,
    nextShowMonthIndex: now + DRONE_SHOW_INTERVAL_MONTHS,
    lastTriggeredMonthIndex: -1,
    remainingShows: Math.max(1, Number(definition.programmeShows) || 1),
    results: [],
  };
  city.council.activePrograms.push(program);
  return program;
}

// A show is due once its month has come and the sky clock has reached 20:00.
// A month missed entirely (a save loaded past it) fires at the next 20:00.
function isDroneShowDue(program, monthIndex, minuteOfDay) {
  if (!program || program.type !== 'quarterly_drone_show') return false;
  if (!(program.remainingShows > 0)) return false;
  if (monthIndex < Number(program.nextShowMonthIndex)) return false;
  if (Number(program.lastTriggeredMonthIndex) === monthIndex) return false;
  return minuteOfDay >= DRONE_SHOW_START_MINUTE;
}

// A signal 8 or above at show time cancels the evening outright - nothing
// flies, nobody is blamed, the slot is simply lost. A rainstorm warning or a
// brown-out is a different story: the show goes ahead and the drones come
// down.
function isDroneShowCancelledByTyphoon() {
  return ['signal8', 'signal9', 'signal10'].includes(city.weather?.typhoonStage);
}

function getDroneShowOutcome(program) {
  const readiness = getCouncilResolutionReadiness(program.resolutionId, `show-${program.remainingShows}`);
  if (isDroneShowCancelledByTyphoon()) return { outcome: 'typhoon_cancelled', readiness };
  const severeWeather = ['red', 'black'].includes(city.weather?.rainWarning);
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

// One volley of seven bursts. Volleys are appended rather than replacing
// each other so a burst still in flight is not cut off; a volley's nodes are
// removed once every burst in it has finished.
const DRONE_SHOW_VOLLEY_LIFETIME_MS = 5500;
const DRONE_SHOW_BURST_COLORS = ['#ffcf4a', '#ff5fa2', '#67e8ff', '#92ff77', '#c27aff', '#ff765e', '#fff08a'];

function buildFireworkShow(overlay) {
  const volley = document.createElement('div');
  volley.className = 'firework-volley';
  const sparkCount = 16;
  DRONE_SHOW_BURST_COLORS.forEach((color, index) => {
    const burst = {
      x: 12 + Math.random() * 76,
      y: 18 + Math.random() * 50,
      delay: index * 0.55 + Math.random() * 0.3,
      color,
      size: 0.75 + Math.random() * 0.55,
    };
    const firework = document.createElement('div');
    firework.className = 'firework-burst';
    firework.style.cssText = `--x:${burst.x.toFixed(1)}%;--y:${burst.y.toFixed(1)}%;--delay:${burst.delay.toFixed(2)}s;--color:${burst.color};--size:${burst.size.toFixed(2)}`;
    for (let spark = 0; spark < sparkCount; spark++) {
      const particle = document.createElement('i');
      particle.style.setProperty('--angle', `${spark * (360 / sparkCount)}deg`);
      particle.style.setProperty('--distance', `${58 + (spark % 3) * 13}px`);
      firework.appendChild(particle);
    }
    volley.appendChild(firework);
  });
  overlay.appendChild(volley);
  if (typeof window !== 'undefined') {
    window.setTimeout(() => { if (volley.parentNode === overlay) overlay.removeChild(volley); }, DRONE_SHOW_VOLLEY_LIFETIME_MS);
  }
}

const droneShowRuntime = { endsAtEnvironmentMinutes: 0, lastVolleyAt: 0, outcome: 'success' };

function isDroneShowLive() {
  if (!(droneShowRuntime.endsAtEnvironmentMinutes > 0)) return false;
  const now = typeof getEnvironmentMinutes === 'function' ? getEnvironmentMinutes() : 0;
  return now < droneShowRuntime.endsAtEnvironmentMinutes;
}

function launchDroneShowVolley(overlay) {
  buildFireworkShow(overlay);
  droneShowRuntime.lastVolleyAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function startDroneShow(outcome = 'success') {
  const now = typeof getEnvironmentMinutes === 'function' ? getEnvironmentMinutes() : 0;
  droneShowRuntime.endsAtEnvironmentMinutes = now + DRONE_SHOW_DURATION_MINUTES;
  droneShowRuntime.outcome = outcome;
  const overlay = ensureDroneShowOverlay();
  if (!overlay) return;
  overlay.dataset.outcome = outcome;
  overlay.classList.add('is-live');
  launchDroneShowVolley(overlay);
}

function stopDroneShow() {
  droneShowRuntime.endsAtEnvironmentMinutes = 0;
  const overlay = typeof document !== 'undefined' ? document.getElementById('drone-show-overlay') : null;
  if (!overlay) return;
  overlay.classList.remove('is-live');
  overlay.replaceChildren();
}

// Called on every displayed minute while a show is live: re-launch a volley
// on the real-time cadence, and end the show when its thirty displayed
// minutes are up. No events arrive while the game is paused, so the sky
// simply holds until the clock moves again.
function updateDroneShowOverlay() {
  if (!(droneShowRuntime.endsAtEnvironmentMinutes > 0)) return;
  if (!isDroneShowLive()) { stopDroneShow(); return; }
  const overlay = ensureDroneShowOverlay();
  if (!overlay) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (nowMs - droneShowRuntime.lastVolleyAt >= DRONE_SHOW_VOLLEY_REAL_MS) launchDroneShowVolley(overlay);
}

function triggerQuarterlyDroneShow(program) {
  const definition = getCouncilResolutionDefinition(program.resolutionId);
  const result = getDroneShowOutcome(program);
  if (result.outcome === 'typhoon_cancelled') {
    if (typeof showToast === 'function' && typeof t === 'function') {
      showToast(t('resolution.fantasyFingHeungShing.cancelledTyphoon'), 'warning');
    }
  } else {
    const modifiers = result.outcome === 'success'
      ? definition.successModifiers
      : getDroneShowFailureModifiers(definition, result.outcome);
    addCouncilTemporaryEffect(`${program.resolutionId}-show`, 1, modifiers, result.outcome);
    startDroneShow(result.outcome);
  }
  const monthIndex = getCityMonthIndex();
  program.results.push({
    monthIndex, year: city.year, month: city.month,
    outcome: result.outcome, readiness: Number(result.readiness.toFixed(3)),
  });
  program.remainingShows--;
  program.lastTriggeredMonthIndex = monthIndex;
  program.nextShowMonthIndex = monthIndex + DRONE_SHOW_INTERVAL_MONTHS;
}

// Programmes whose last show has played are summarised and reported.
function completeFinishedDroneShowProgrammes(monthIndex) {
  const programs = city.council?.activePrograms || [];
  const completed = programs.filter((program) => program.remainingShows <= 0);
  if (!completed.length) return;
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
  city.council.activePrograms = programs.filter((program) => program.remainingShows > 0);
  city.council.resolutionHistory = city.council.resolutionHistory.slice(-50);
}

// Sky-clock hook (gameclock:time, once per displayed minute): fire any show
// whose evening has come, and keep a live show's fireworks going.
function updateDroneShowClock(payload) {
  if (typeof city === 'undefined' || !city.council) return;
  const minuteOfDay = Number(payload?.minutes);
  if (!Number.isFinite(minuteOfDay)) return;
  const monthIndex = getCityMonthIndex();
  (city.council.activePrograms || []).forEach((program) => {
    if (isDroneShowDue(program, monthIndex, minuteOfDay)) triggerQuarterlyDroneShow(program);
  });
  completeFinishedDroneShowProgrammes(monthIndex);
  updateDroneShowOverlay();
}

function summarizeDroneShowProgramme(program) {
  const counts = {};
  program.results.forEach((result) => { counts[result.outcome] = (counts[result.outcome] || 0) + 1; });
  const failurePriority = ['drones_wrong_city', 'drone_crash', 'noise_complaints'];
  const primaryFailure = failurePriority.find((outcome) => counts[outcome] > 0) || '';
  const cancelledCount = counts.typhoon_cancelled || 0;
  return {
    // a typhoon cancellation is neither a success nor a failure
    outcome: primaryFailure || (cancelledCount === program.results.length ? 'typhoon_cancelled' : 'success'),
    showCount: program.results.length,
    successCount: counts.success || 0,
    failureCount: program.results.length - (counts.success || 0) - cancelledCount,
    cancelledCount,
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
  announceDuePolicyForumNews(monthIndex);
  if (typeof maybeAnnounceSecondarySchoolLabExplosion === 'function') {
    maybeAnnounceSecondarySchoolLabExplosion(monthIndex);
  }
  if (typeof maybeAnnounceAnnualCityFortune === 'function') {
    maybeAnnounceAnnualCityFortune(monthIndex);
  }
  if (typeof generateMonthlyForumPost === 'function') generateMonthlyForumPost(monthIndex);

  // Shows themselves fire at 20:00 on the sky clock (updateDroneShowClock);
  // the monthly tick only tidies programmes whose last show has played.
  completeFinishedDroneShowProgrammes(monthIndex);
  if (typeof document !== 'undefined'
    && document.getElementById('legislative-window')?.classList.contains('is-open')
    && typeof updateCouncilMeetingUi === 'function') {
    updateCouncilMeetingUi();
  }
}

if (typeof onGameClockEvent === 'function') {
  onGameClockEvent('gameclock:time', updateDroneShowClock);
}
