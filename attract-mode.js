// Attract mode: the title screen's live background.
//
// Once assets have loaded, the bundled showcase city (UI/attract-city.json) is loaded into the
// one game scene and shown behind the landing menu. Only the sky clock runs — the calendar never
// advances (see updateGameClock), so the economy, council, autosave and news never tick. The
// clock is synced to local time and, when online, the weather follows the Hong Kong Observatory's
// current readings. Whatever the player picks on the menu replaces this city through the normal
// load / new-game paths; any failure simply leaves the static artwork in place.
//
// See docs/attract-mode-plan.md for the design.

const ATTRACT_CITY_URL = 'UI/attract-city.json';
const ATTRACT_CITY_FORMAT = 'heung-shing-attract-city';
const ATTRACT_SETTING_KEY = 'citybuilder.attractMode.v1';
const ATTRACT_LOAD_TIMEOUT_MS = 8000;
// Camera drifts back and forth along one isometric axis: a 240px sweep at 5px/s is a 96s round
// trip, slow enough that culling only needs refreshing a few times a second.
const ATTRACT_DRIFT_RANGE_PX = 240;
const ATTRACT_DRIFT_SPEED_PX_PER_S = 5;
const ATTRACT_DRIFT_AXIS = Object.freeze({ x: 0.894, y: 0.447 });
const ATTRACT_CULL_INTERVAL_MS = 400;
// The frame rate is judged over five seconds once the city has settled: the first seconds after
// applySaveData are spent uploading textures and are not representative. The response is
// graded — night building lights cost more than half the frame on an integrated GPU (measured
// 20 vs 45+ fps on an Intel Iris Plus 655), so they are the first thing to go, then the camera
// stops drifting, and only a frame rate that is still poor after that brings the artwork back.
const ATTRACT_FPS_WARMUP_MS = 3000;
const ATTRACT_FPS_SAMPLE_MS = 4000;
const ATTRACT_FPS_LIGHTS_OFF_BELOW = 30;
const ATTRACT_FPS_FREEZE_CAMERA_BELOW = 24;
const ATTRACT_FPS_FALLBACK_BELOW = 15;
// Below this the window is almost certainly occluded or unfocused (Chromium throttles rAF to
// ~1fps), not slow: sample again rather than judge.
const ATTRACT_FPS_THROTTLED_BELOW = 5;
const ATTRACT_FPS_MAX_ATTEMPTS = 3;
const OBSERVATORY_READINGS_URL = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en';
const OBSERVATORY_WARNINGS_URL = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';
const OBSERVATORY_REFRESH_MS = 10 * 60 * 1000;
const OBSERVATORY_TIMEOUT_MS = 15000;
const OBSERVATORY_RETRY_MS = 30000;
const OBSERVATORY_TYPHOON_WIND_KPH = Object.freeze({ signal1: 40, signal3: 55, signal8: 80, signal9: 100, signal10: 125 });

let attractState = 'idle'; // idle | loading | running | off
let attractEnabledCache = null;
let attractDrift = null;
let attractFpsSample = null;
let attractWeatherTimer = null;
let attractWeatherPinned = false;
let attractKeyboardWasEnabled = true;
let attractPreviousSpeed = null;
let attractLightsSuppressed = false;

function isAttractModeEnabled() {
  if (attractEnabledCache !== null) return attractEnabledCache;
  try {
    const raw = localStorage.getItem(ATTRACT_SETTING_KEY);
    attractEnabledCache = raw === null ? true : JSON.parse(raw) !== false;
  } catch {
    attractEnabledCache = true;
  }
  return attractEnabledCache;
}

function setAttractModeEnabled(enabled) {
  attractEnabledCache = !!enabled;
  try {
    localStorage.setItem(ATTRACT_SETTING_KEY, JSON.stringify(!!enabled));
  } catch {}
  if (!attractEnabledCache) leaveAttractMode('disabled');
}

// True from the moment the showcase city starts loading until the player leaves the menu, so the
// gates in the clock, autosave, toasts and audio also cover applySaveData's own side effects.
function isAttractModeActive() {
  return attractState === 'loading' || attractState === 'running';
}

function isAttractModeRunning() {
  return attractState === 'running';
}

// Building lights switched off for the showcase only (the player's own setting is untouched).
function isAttractLightsSuppressed() {
  return attractState === 'running' && attractLightsSuppressed;
}

// While the Observatory's readings are applied, the game's seasonal weather roller stays off.
function isAttractWeatherPinned() {
  return isAttractModeActive() && attractWeatherPinned;
}

function isPerformanceProfileLaunch() {
  try {
    return new URLSearchParams(window.location.search).get('performance') === '1';
  } catch {
    return false;
  }
}

function setLandingArtworkLive(live) {
  document.getElementById('landing-screen')?.classList.toggle('attract-live', !!live);
  document.body?.classList.toggle('attract-live', !!live);
}

function localTimeOfDayMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Loading ──────────────────────────────────────────────────────────────────

async function startAttractMode(scene) {
  if (attractState !== 'idle') return false;
  if (!isAttractModeEnabled() || isPerformanceProfileLaunch()) {
    attractState = 'off';
    return false;
  }
  if (typeof beginLoadRequest !== 'function' || typeof applySaveData !== 'function') {
    attractState = 'off';
    return false;
  }
  attractState = 'loading';
  const generation = beginLoadRequest();
  const current = () => attractState === 'loading' && isLoadRequestCurrent(generation);
  const startedAt = performance.now();
  const timings = {};
  let stepStartedAt = startedAt;
  const lap = (name) => { timings[name] = Math.round(performance.now() - stepStartedAt); stepStartedAt = performance.now(); };
  try {
    const file = await fetchJsonWithTimeout(ATTRACT_CITY_URL, ATTRACT_LOAD_TIMEOUT_MS);
    if (!current()) return false;
    if (file?.format !== ATTRACT_CITY_FORMAT || !file.save_data) throw new Error('not an attract city file');
    const save = decodeSaveDataForLoad(file.save_data);
    lap('fetchDecode');
    const readyScene = await waitForLoadScene(scene);
    if (!readyScene || !current()) return false;
    await ensureSaveBuildingTextures(readyScene, save);
    if (!current()) return false;
    await ensureSaveNightTextures(readyScene, save);
    if (!current()) return false;
    lap('textures');

    // Committed from here: everything below is synchronous. No save slot belongs to this city, so
    // a stray save would be a prompt, never an overwrite. (beginNewCitySaveSession bumps the load
    // generation itself, which is why `current()` is not consulted again.)
    beginNewCitySaveSession(null);
    if (typeof isTerrainCreatorMode !== 'undefined') isTerrainCreatorMode = false;
    if (typeof setTerrainEditorUiActive === 'function') setTerrainEditorUiActive(false);
    applySaveData(readyScene, save);
    lap('apply');

    // The showcase may have been exported while paused; the sky must move — at the game's
    // slowest tier (the one the top bar labels 1x): a full day every eight real minutes.
    if (typeof getGameSpeed === 'function') attractPreviousSpeed = getGameSpeed();
    if (typeof simPaused !== 'undefined') simPaused = false;
    if (typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') setGameSpeed(GAME_SPEEDS.SLOW);
    if (typeof city !== 'undefined') city.timeOfDayMinutes = localTimeOfDayMinutes();
    if (typeof updateDynamicLighting === 'function') updateDynamicLighting(readyScene);
    // Per-city state, discarded with the showcase: the title screen has no use for signposts.
    if (typeof setDistrictSignsVisible === 'function') setDistrictSignsVisible(false);

    const keyboard = readyScene.input?.keyboard;
    if (keyboard) {
      attractKeyboardWasEnabled = keyboard.enabled;
      keyboard.enabled = false;
    }
    attractState = 'running';
    beginAttractCameraDrift(readyScene);
    attractFpsSample = { startedAt: performance.now() + ATTRACT_FPS_WARMUP_MS, frames: 0, evaluated: false, attempts: 0 };
    if (typeof setGameWorldVisible === 'function') setGameWorldVisible(true);
    setLandingArtworkLive(true);
    if (typeof recordVisualRoutePerformanceMilestone === 'function') {
      recordVisualRoutePerformanceMilestone('attractVisible');
    }
    console.info(`[attract] showcase city on screen after ${Math.round(performance.now() - startedAt)}ms`, timings);
    scheduleAttractWeatherSync(0);
    attractWeatherTimer = setInterval(() => scheduleAttractWeatherSync(0), OBSERVATORY_REFRESH_MS);
    return true;
  } catch (error) {
    if (attractState === 'loading') {
      console.warn('[attract] showcase city unavailable, keeping the static title artwork:', error?.message || error);
    }
    return false;
  } finally {
    // Superseded by a menu choice, timed out, or failed: never stay in 'loading'.
    if (attractState === 'loading') attractState = 'off';
  }
}

// Called by every path that replaces the world (load, new city, terrain creator) and by the
// setting toggle. `restoreArtwork` puts the static image back for the cases where nothing else
// is about to take over the screen.
function leaveAttractMode(reason = 'player') {
  if (attractState !== 'loading' && attractState !== 'running') return;
  const wasRunning = attractState === 'running';
  attractState = 'off';
  attractDrift = null;
  attractFpsSample = null;
  attractWeatherPinned = false;
  attractLightsSuppressed = false;
  if (attractWeatherTimer) {
    clearInterval(attractWeatherTimer);
    attractWeatherTimer = null;
  }
  if (attractWeatherRetryTimer) {
    clearTimeout(attractWeatherRetryTimer);
    attractWeatherRetryTimer = null;
  }
  const scene = typeof activeScene !== 'undefined' ? activeScene : null;
  const keyboard = scene?.input?.keyboard;
  if (keyboard) keyboard.enabled = attractKeyboardWasEnabled;
  if (wasRunning && attractPreviousSpeed !== null && typeof setGameSpeed === 'function') {
    // Never hand the next city a paused clock.
    setGameSpeed(attractPreviousSpeed || (typeof GAME_SPEEDS !== 'undefined' ? GAME_SPEEDS.SLOW : attractPreviousSpeed));
    attractPreviousSpeed = null;
  }
  const restoreArtwork = reason === 'disabled' || reason === 'degraded' || reason === 'failed';
  document.body?.classList.remove('attract-live');
  if (restoreArtwork) {
    setLandingArtworkLive(false);
    if (wasRunning && typeof setGameWorldVisible === 'function') setGameWorldVisible(false);
  }
}

// ── Camera drift and frame-rate watchdog ─────────────────────────────────────

function beginAttractCameraDrift(scene) {
  const camera = scene?.cameras?.main;
  if (!camera) return;
  attractDrift = {
    originX: camera.scrollX,
    originY: camera.scrollY,
    startedAt: performance.now(),
    nextCullAt: 0,
    frozen: false,
  };
}

function refreshAttractViewport(scene) {
  if (typeof updateTerrainViewportCulling === 'function') updateTerrainViewportCulling(scene, true);
  if (typeof invalidateTrafficVisualView === 'function') invalidateTrafficVisualView(scene, true);
  if (typeof invalidateVesselVisualView === 'function') invalidateVesselVisualView(scene, true);
  if (typeof invalidateAircraftVisualView === 'function') invalidateAircraftVisualView(scene, true);
  if (typeof syncWeatherFxToCamera === 'function') syncWeatherFxToCamera(scene);
}

// Per frame from updateGameFrame.
function updateAttractCamera(scene, time) {
  if (attractState !== 'running') return;
  const now = performance.now();

  const sample = attractFpsSample;
  if (sample && !sample.evaluated && now >= sample.startedAt) {
    sample.frames += 1;
    const elapsed = now - sample.startedAt;
    if (elapsed >= ATTRACT_FPS_SAMPLE_MS) {
      const fps = sample.frames / (elapsed / 1000);
      sample.attempts += 1;
      const resample = () => { sample.startedAt = now + ATTRACT_FPS_WARMUP_MS; sample.frames = 0; };
      if (fps < ATTRACT_FPS_THROTTLED_BELOW && sample.attempts < ATTRACT_FPS_MAX_ATTEMPTS) {
        resample();
        return;
      }
      const lightsOn = !attractLightsSuppressed
        && (typeof isBuildingLightsEnabled !== 'function' || isBuildingLightsEnabled());
      if (fps < ATTRACT_FPS_LIGHTS_OFF_BELOW && lightsOn) {
        console.info(`[attract] ${fps.toFixed(1)} fps with building lights; showing the showcase without them`);
        attractLightsSuppressed = true;
        if (typeof clearBuildingLights === 'function') clearBuildingLights(scene);
        resample();
        return;
      }
      sample.evaluated = true;
      if (fps < ATTRACT_FPS_FALLBACK_BELOW) {
        console.warn(`[attract] ${fps.toFixed(1)} fps on the title screen, falling back to the static artwork`);
        leaveAttractMode('degraded');
        return;
      }
      if (fps < ATTRACT_FPS_FREEZE_CAMERA_BELOW && attractDrift) {
        console.info(`[attract] ${fps.toFixed(1)} fps, holding the camera still`);
        attractDrift.frozen = true;
      }
    }
  }

  const drift = attractDrift;
  const camera = scene?.cameras?.main;
  if (!drift || drift.frozen || !camera) return;
  const period = (2 * ATTRACT_DRIFT_RANGE_PX) / ATTRACT_DRIFT_SPEED_PX_PER_S;
  const phase = ((now - drift.startedAt) / 1000 / period) * Math.PI * 2;
  const offset = (ATTRACT_DRIFT_RANGE_PX / 2) * Math.sin(phase);
  camera.scrollX = drift.originX + offset * ATTRACT_DRIFT_AXIS.x;
  camera.scrollY = drift.originY + offset * ATTRACT_DRIFT_AXIS.y;
  if (time >= drift.nextCullAt) {
    drift.nextCullAt = time + ATTRACT_CULL_INTERVAL_MS;
    refreshAttractViewport(scene);
  }
}

// ── Hong Kong Observatory weather ────────────────────────────────────────────

// rhrread icon codes → the game's condition vocabulary (sim-weather.js).
function observatoryIconToCondition(icon, temperatureC) {
  const code = Number(icon);
  if ([53, 54, 62, 63].includes(code)) return 'showers';
  if ([64, 65].includes(code)) return 'heavyRain';
  if ([60, 61, 76, 82, 83, 84, 85].includes(code)) return 'cloudy';
  if (code === 80) return 'windy';
  if (code === 90) return 'hot';
  if ([92, 93].includes(code)) return 'cool';
  // 50–52 sunny, 70–75 / 77 fine nights, 81 dry, 91 warm, anything unknown
  if (Number.isFinite(temperatureC) && temperatureC >= 31) return 'hot';
  if (Number.isFinite(temperatureC) && temperatureC <= 15) return 'cool';
  return 'clear';
}

function observatoryWarningsToState(warnings) {
  const rainCode = String(warnings?.WRAIN?.code || '');
  const rainWarning = rainCode.startsWith('WRAINB') ? 'black'
    : rainCode.startsWith('WRAINR') ? 'red'
      : rainCode.startsWith('WRAINA') ? 'amber' : 'none';
  const tcCode = String(warnings?.WTCSGNL?.code || '');
  const typhoonStage = tcCode === 'TC10' ? 'signal10'
    : tcCode === 'TC9' ? 'signal9'
      : tcCode.startsWith('TC8') ? 'signal8'
        : tcCode === 'TC3' ? 'signal3'
          : tcCode === 'TC1' ? 'signal1' : 'none';
  return { rainWarning, typhoonStage };
}

function observatoryStationValue(series, preferredPlace) {
  const rows = Array.isArray(series?.data) ? series.data : [];
  const preferred = rows.find((row) => String(row?.place || '').includes(preferredPlace)) || rows[0];
  const value = Number(preferred?.value ?? preferred?.max);
  return Number.isFinite(value) ? value : null;
}

// Pure: turns the two Observatory payloads into the fields written onto city.weather.
function buildObservatoryWeather(readings, warnings) {
  const temperatureC = observatoryStationValue(readings?.temperature, 'Hong Kong Observatory');
  const humidityPct = observatoryStationValue(readings?.humidity, 'Hong Kong Observatory');
  const rainfallMm = observatoryStationValue(readings?.rainfall, 'Yau Tsim Mong');
  const icon = Array.isArray(readings?.icon) ? readings.icon[0] : readings?.icon;
  const { rainWarning, typhoonStage } = observatoryWarningsToState(warnings);
  let condition = observatoryIconToCondition(icon, temperatureC);
  if (rainWarning !== 'none' && condition !== 'heavyRain') condition = rainWarning === 'amber' ? 'showers' : 'heavyRain';
  const typhoonActive = typhoonStage !== 'none';
  const typhoonWindKph = typhoonActive ? OBSERVATORY_TYPHOON_WIND_KPH[typhoonStage] : 0;
  if (typhoonActive && typhoonWindKph >= 80) condition = 'heavyRain';
  else if (typhoonActive && condition === 'clear') condition = 'windy';
  return {
    condition,
    conditionIntensity: condition === 'heavyRain' ? 0.85 : condition === 'showers' ? 0.55 : 0.5,
    rainWarning,
    typhoonStage,
    typhoonActive,
    typhoonWindKph,
    ...(temperatureC !== null ? { temperatureC } : {}),
    ...(humidityPct !== null ? { humidityPct } : {}),
    ...(rainfallMm !== null ? { rainfallMm } : {}),
    ...(typhoonActive ? { windKph: typhoonWindKph } : {}),
    observatoryUpdatedAt: readings?.updateTime || '',
  };
}

let attractWeatherRetryTimer = null;

function scheduleAttractWeatherSync(delayMs) {
  if (attractWeatherRetryTimer) clearTimeout(attractWeatherRetryTimer);
  attractWeatherRetryTimer = setTimeout(async () => {
    attractWeatherRetryTimer = null;
    const ok = await syncAttractWeatherFromObservatory();
    // One retry: the first attempt often runs while the main thread is still busy settling the city.
    if (!ok && attractState === 'running' && delayMs === 0) scheduleAttractWeatherSync(OBSERVATORY_RETRY_MS);
  }, delayMs);
}

async function syncAttractWeatherFromObservatory() {
  if (attractState !== 'running' || typeof city === 'undefined' || !city.weather) return false;
  try {
    const [readings, warnings] = await Promise.all([
      fetchJsonWithTimeout(OBSERVATORY_READINGS_URL, OBSERVATORY_TIMEOUT_MS),
      fetchJsonWithTimeout(OBSERVATORY_WARNINGS_URL, OBSERVATORY_TIMEOUT_MS).catch(() => ({})),
    ]);
    if (attractState !== 'running') return false;
    Object.assign(city.weather, buildObservatoryWeather(readings, warnings));
    attractWeatherPinned = true;
    if (typeof syncWeatherVisuals === 'function') syncWeatherVisuals();
    return true;
  } catch (error) {
    // Offline or blocked: the game's own seasonal weather keeps rolling.
    attractWeatherPinned = false;
    console.info('[attract] Observatory weather unavailable, using simulated weather:', error?.message || error);
    return false;
  }
}

// ── Showcase export (development only) ───────────────────────────────────────
// From the DevTools console while looking at the composition you want:
//   exportAttractCity()
// Writes UI/attract-city.json through the local server; packaged builds refuse the request.

async function exportAttractCity() {
  if (typeof buildSavePayload !== 'function') throw new Error('save.js not loaded');
  const payload = buildSavePayload({ autosave: false, manualSaveId: null });
  const body = {
    format: ATTRACT_CITY_FORMAT,
    exportedAt: new Date().toISOString(),
    cityName: payload.city_name,
    save_data: payload.save_data,
  };
  const response = await fetch('/api/dev/attract-city', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  console.info(`[attract] wrote ${result.path} (${result.bytes} bytes)`);
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    observatoryIconToCondition,
    observatoryWarningsToState,
    buildObservatoryWeather,
    localTimeOfDayMinutes,
  };
}
