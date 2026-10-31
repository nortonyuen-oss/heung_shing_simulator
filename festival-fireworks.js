// 年初二煙花匯演 (Norton 2026-10-31): the New Year fireworks over the city on the evening of 正月初二,
// 20:00 to 20:30 on the sky clock (festivals.js FESTIVAL_PROGRAMMES.lnyFireworks). Drawn as 幻彩 fing
// 香城's are - the same screen overlay and bursts (council-effects.js buildFireworkShow) - in New Year
// red and gold, more often for a bigger budget, and quicker in the last five minutes for the finale.
// A typhoon signal 3 or above, or a red or black rainstorm, calls the evening off. Nothing is saved:
// whether it is on is the clock, the calendar and the year's settled outcome.

const LNY_FIREWORKS_COLORS = Object.freeze(['#ff3b30', '#ffd34a', '#ff8a3d', '#fff3b0', '#ff3b30', '#ffd34a', '#ff5fa2', '#67e8ff']);
// real ms between volleys, by funding tier; halved in the finale
const LNY_FIREWORKS_VOLLEY_MS = Object.freeze({ basic: 4200, standard: 2800, grand: 2000 });
const LNY_FIREWORKS_FINALE_MINUTES = 5;

const lnyFireworksRuntime = { live: false, lastVolleyAt: 0, cancelledKey: '', noticeKey: '' };

function lnyFireworksWeatherBad(weather = {}) {
  return ['signal3', 'signal8', 'signal9', 'signal10'].includes(weather.typhoonStage) || ['red', 'black'].includes(weather.rainWarning);
}

/**
 * Whether the show is on now, and how: null when not.
 * @returns {{ tier: string, finale: boolean, cancelled: boolean } | null}
 */
function getLnyFireworksState({ year, month, minuteOfDay, weather, held, tier = 'standard', isEnabled } = {}) {
  if (typeof getActiveFestivals !== 'function') return null;
  const on = getActiveFestivals({ year, month, minuteOfDay, ...(isEnabled ? { isEnabled } : {}) })
    .some(({ id, phase }) => id === 'lnyFireworks' && phase);
  if (!on || !held || tier === 'skip') return null;
  const close = FESTIVAL_PROGRAMMES.lnyFireworks.close;
  return { tier, finale: Number(minuteOfDay) >= close - LNY_FIREWORKS_FINALE_MINUTES, cancelled: lnyFireworksWeatherBad(weather) };
}

function stopLnyFireworks() {
  lnyFireworksRuntime.live = false;
  const overlay = typeof document !== 'undefined' ? document.getElementById('drone-show-overlay') : null;
  // the overlay is 幻彩 fing 香城's too: leave it to a council show that is on
  if (!overlay || (typeof isDroneShowLive === 'function' && isDroneShowLive())) return;
  overlay.classList.remove('is-live');
  overlay.replaceChildren();
}

function updateLnyFireworks(scene, time) {
  if (typeof city === 'undefined' || typeof ensureDroneShowOverlay !== 'function' || typeof buildFireworkShow !== 'function') return;
  const live = typeof isFestivalGameplayLive !== 'function' || isFestivalGameplayLive();
  const minuteOfDay = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : Number(city.timeOfDayMinutes) || 0;
  const state = live ? getLnyFireworksState({
    year: city.year, month: city.month, minuteOfDay, weather: city.weather || {},
    held: getFestivalHistoryEntry('lnyFireworks', city.year)?.outcome === 'held',
    tier: getFestivalTier('lnyFireworks'),
  }) : null;
  const key = `${city.name}|${city.year}`;
  // the weather is judged once, as the evening starts: called off stays off
  if (state && state.cancelled && lnyFireworksRuntime.noticeKey !== key) lnyFireworksRuntime.cancelledKey = key;
  if (!state || lnyFireworksRuntime.cancelledKey === key) {
    if (state && lnyFireworksRuntime.noticeKey !== key) {
      lnyFireworksRuntime.noticeKey = key;
      if (typeof showToast === 'function' && typeof t === 'function') showToast(t('festival.toast.cancelled.lnyFireworks'), 'warning');
    }
    if (lnyFireworksRuntime.live) stopLnyFireworks();
    return;
  }
  const overlay = ensureDroneShowOverlay();
  if (!overlay) return;
  if (!lnyFireworksRuntime.live) {
    lnyFireworksRuntime.live = true;
    lnyFireworksRuntime.lastVolleyAt = 0;
    overlay.dataset.outcome = 'success';
    overlay.classList.add('is-live');
    if (lnyFireworksRuntime.noticeKey !== key) {
      lnyFireworksRuntime.noticeKey = key;
      if (typeof showFestivalNotice === 'function' && typeof t === 'function') showFestivalNotice(t('festival.notice.lnyFireworks'), null);
    }
  }
  // the sky holds while the game is paused
  const paused = typeof isGamePaused === 'function' ? isGamePaused() : typeof simPaused !== 'undefined' && simPaused;
  if (paused) return;
  const every = (LNY_FIREWORKS_VOLLEY_MS[state.tier] || LNY_FIREWORKS_VOLLEY_MS.standard) / (state.finale ? 2 : 1);
  if (time - lnyFireworksRuntime.lastVolleyAt < every) return;
  lnyFireworksRuntime.lastVolleyAt = time;
  buildFireworkShow(overlay, { colors: LNY_FIREWORKS_COLORS, spacing: state.finale ? 0.25 : 0.45, size: state.finale ? 1.25 : 1.1 });
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  LNY_FIREWORKS_VOLLEY_MS, LNY_FIREWORKS_FINALE_MINUTES, lnyFireworksWeatherBad, getLnyFireworksState,
};
