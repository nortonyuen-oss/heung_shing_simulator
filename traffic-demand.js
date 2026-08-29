// ── Time-of-day road traffic demand ─────────────────────────────────────────
// trafficMap stores the city's time-neutral road demand. This smooth Hong Kong
// daily profile is applied when deriving live congestion and ambient vehicles,
// avoiding an expensive full 256x256 road-network rebuild every game minute.

const TRAFFIC_TIME_OF_DAY_KEYFRAMES = Object.freeze([
  { minute: 0, multiplier: 0.22 },      // midnight: taxis and essential traffic
  { minute: 2 * 60, multiplier: 0.11 },
  { minute: 4.5 * 60, multiplier: 0.10 }, // quietest pre-dawn period
  { minute: 5.5 * 60, multiplier: 0.16 },
  { minute: 6.5 * 60, multiplier: 0.45 },
  { minute: 7.5 * 60, multiplier: 1.10 },
  { minute: 8.5 * 60, multiplier: 1.35 }, // morning commute peak
  { minute: 9.5 * 60, multiplier: 1.08 },
  { minute: 11.5 * 60, multiplier: 0.92 },
  { minute: 13 * 60, multiplier: 1.00 },  // lunch/delivery activity
  { minute: 15.5 * 60, multiplier: 0.90 },
  { minute: 17 * 60, multiplier: 1.08 },
  { minute: 18 * 60, multiplier: 1.35 },  // evening commute peak
  { minute: 19.5 * 60, multiplier: 1.15 },
  { minute: 21 * 60, multiplier: 0.78 },
  { minute: 23 * 60, multiplier: 0.42 },
  { minute: 24 * 60, multiplier: 0.22 },
]);

function clampTrafficDemand(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTrafficTimeMinutes(value) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : 12 * 60;
  return ((safe % (24 * 60)) + (24 * 60)) % (24 * 60);
}

function getTrafficTimeOfDayMultiplier(
  timeMinutes = typeof getGameTimeOfDayMinutes === 'function'
    ? getGameTimeOfDayMinutes()
    : 12 * 60,
) {
  const minute = normalizeTrafficTimeMinutes(timeMinutes);
  let from = TRAFFIC_TIME_OF_DAY_KEYFRAMES[0];
  let to = TRAFFIC_TIME_OF_DAY_KEYFRAMES[1];
  for (let index = 0; index < TRAFFIC_TIME_OF_DAY_KEYFRAMES.length - 1; index++) {
    const candidateFrom = TRAFFIC_TIME_OF_DAY_KEYFRAMES[index];
    const candidateTo = TRAFFIC_TIME_OF_DAY_KEYFRAMES[index + 1];
    if (minute >= candidateFrom.minute && minute < candidateTo.minute) {
      from = candidateFrom;
      to = candidateTo;
      break;
    }
  }
  const rawT = (minute - from.minute) / Math.max(1, to.minute - from.minute);
  const easedT = rawT * rawT * (3 - 2 * rawT);
  return from.multiplier + (to.multiplier - from.multiplier) * easedT;
}

function applyTrafficTimeOfDayMultiplier(baseLoad, multiplier) {
  const load = Math.max(0, Number(baseLoad) || 0);
  const demandMultiplier = Math.max(0, Number(multiplier) || 0);
  return clampTrafficDemand(load * demandMultiplier, 0, 1);
}

function getTimeAdjustedTrafficLoad(baseLoad, timeMinutes) {
  return applyTrafficTimeOfDayMultiplier(baseLoad, getTrafficTimeOfDayMultiplier(timeMinutes));
}

function getTrafficIndexPolicyOffset() {
  const councilTraffic = typeof getCouncilTemporaryModifier === 'function'
    ? getCouncilTemporaryModifier('traffic')
    : 0;
  const seatbelt = typeof isPolicyActive === 'function' && isPolicyActive('busSeatbeltMandate') ? 0.025 : 0;
  const elderlyFare = typeof isPolicyActive === 'function' && isPolicyActive('elderlyTwoDollarFare') ? 0.012 : 0;
  return councilTraffic + seatbelt - elderlyFare;
}

function updateTrafficIndexForTimeOfDay(timeMinutes) {
  if (typeof city === 'undefined') return 0;
  const baseline = clampTrafficDemand(Number(city.trafficBaseIndex) || 0, 0, 1);
  const multiplier = getTrafficTimeOfDayMultiplier(timeMinutes);
  city.trafficTimeMultiplier = multiplier;
  city.trafficIndex = clampTrafficDemand(
    baseline * multiplier + getTrafficIndexPolicyOffset(),
    0,
    1,
  );
  return city.trafficIndex;
}

if (typeof onGameClockEvent === 'function') {
  onGameClockEvent('gameclock:time', ({ minutes }) => {
    updateTrafficIndexForTimeOfDay(minutes);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRAFFIC_TIME_OF_DAY_KEYFRAMES,
    normalizeTrafficTimeMinutes,
    getTrafficTimeOfDayMultiplier,
    applyTrafficTimeOfDayMultiplier,
    getTimeAdjustedTrafficLoad,
    updateTrafficIndexForTimeOfDay,
  };
}
