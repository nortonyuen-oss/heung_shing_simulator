// Audio: the music jukebox and title track, the city ambience that follows on-screen
// density, weather and zoom, sound-effect tracks, and the persisted volume knobs.
// Split out of main.js.

let activeMusic = null;
let activeTrackIndex = 0;
let isMusicPlaying = false;
let musicLoopMode = 'all';   // 'all' = auto-advance, 'one' = loop current track
const TITLE_MUSIC_TRACK_KEY = 'music_title';
let titleLoadingAudio = null;

// ── Ambient city soundscape (density + weather driven, fades with camera zoom) ─
const AMBIENT_TRACKS = [
  { key: 'amb_urban',       file: 'Sounds/urban.m4a' },
  { key: 'amb_residential', file: 'Sounds/residential.m4a' },
  { key: 'amb_rain',        file: 'Sounds/rainyDay.m4a' },
  { key: 'amb_typhoon',     file: 'Sounds/typhoon.m4a' },
];
const SFX_TRACKS = [
  { key: 'sfx_thunder', file: 'Sounds/thunder.mp3' },
  { key: 'event_ice_cream_truck', file: 'Sounds/iceCreamTruck.m4a' },
  { key: 'db_opening', file: 'Sounds/hk_chinesedrums.mp3' },
  { key: 'db_music', file: 'Sounds/racingdragonboat.mp3' },
  { key: 'db_cheers', file: 'Sounds/dragon-boat-team-physch-up-75297.mp3' },
  { key: 'db_paddles', file: 'Sounds/18834__wim__rowing-boat.wav' },
  { key: 'vessel_horn', file: 'Sounds/vesselFlute.m4a' },
  { key: 'aircraft_landing', file: 'Sounds/aircraftLanding.m4a' },
  { key: 'aircraft_takeoff', file: 'Sounds/aircraftTakeoff.m4a' },
];

// Music volume — persisted so the level a player left it at carries into their next
// session instead of resetting to the slider's hardcoded HTML default every launch.
const MUSIC_VOLUME_SETTING_KEY = 'citybuilder.musicVolume.v1';
const MUSIC_OUTPUT_GAIN = 0.3;
function getMusicOutputVolume(value) {
  return Math.max(0, Math.min(1, Number(value) || 0)) * MUSIC_OUTPUT_GAIN;
}
let musicVolumeCache = null;

function getStoredMusicVolume() {
  if (musicVolumeCache !== null) return musicVolumeCache;
  try {
    const raw = localStorage.getItem(MUSIC_VOLUME_SETTING_KEY);
    const value = raw === null ? 0.55 : Number(JSON.parse(raw));
    musicVolumeCache = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.55;
  } catch {
    musicVolumeCache = 0.55;
  }
  return musicVolumeCache;
}

function setStoredMusicVolume(value) {
  const clamped = Math.max(0, Math.min(1, Number(value)));
  musicVolumeCache = Number.isFinite(clamped) ? clamped : 0.55;
  try {
    localStorage.setItem(MUSIC_VOLUME_SETTING_KEY, JSON.stringify(musicVolumeCache));
  } catch {}
}

// Applies the stored volume to both volume sliders (Sound menu + Jukebox window, kept
// in sync) and the currently playing track, if any. Safe to call before either slider
// exists in the DOM.
function applyStoredMusicVolume() {
  const volume = getStoredMusicVolume();
  const jukeboxVol = document.getElementById('jukebox-volume');
  const menuVol = document.getElementById('menu-volume-slider');
  if (jukeboxVol) jukeboxVol.value = volume;
  if (menuVol) menuVol.value = volume;
  if (activeMusic) activeMusic.setVolume(getMusicOutputVolume(volume));
  if (titleLoadingAudio) titleLoadingAudio.volume = getMusicOutputVolume(volume);
}

// City ambience (background soundscape) volume — a separate mix knob from music, so
// players can turn down traffic/rain/typhoon noise without touching the music level.
// Read fresh every updateAmbientSoundscape() tick, so no imperative push is needed when
// it changes — the existing fade-toward-target loop picks it up within one tick.
const AMBIENT_VOLUME_SETTING_KEY = 'citybuilder.ambientVolume.v1';
let ambientVolumeCache = null;

function getStoredAmbientVolume() {
  if (ambientVolumeCache !== null) return ambientVolumeCache;
  try {
    const raw = localStorage.getItem(AMBIENT_VOLUME_SETTING_KEY);
    const value = raw === null ? 1 : Number(JSON.parse(raw));
    ambientVolumeCache = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  } catch {
    ambientVolumeCache = 1;
  }
  return ambientVolumeCache;
}

function setStoredAmbientVolume(value) {
  const clamped = Math.max(0, Math.min(1, Number(value)));
  ambientVolumeCache = Number.isFinite(clamped) ? clamped : 1;
  try {
    localStorage.setItem(AMBIENT_VOLUME_SETTING_KEY, JSON.stringify(ambientVolumeCache));
  } catch {}
}

function applyStoredAmbientVolume() {
  const slider = document.getElementById('menu-ambient-volume-slider');
  if (slider) slider.value = getStoredAmbientVolume();
}
const AMBIENT_ZOOM_MIN = 0.5;   // camera.zoom at/below this → ambience is silent
const AMBIENT_ZOOM_MAX = 1.8;   // camera.zoom at/above this → ambience is at full volume
const AMBIENT_SAMPLE_GRID = 6;  // NxN screen-space sample grid used to gauge on-screen building density
const AMBIENT_FADE_RATE = 0.12; // per-update volume smoothing (lower = smoother/slower fades)
const AMBIENT_UPDATE_MS = 500;
const AMBIENT_BASE_VOLUME = {
  urban: 0.55,
  residential: 0.4,
  rain: 0.5,
  typhoon: 0.7,
};

function getTitleMusicTrack() {
  return MUSIC_TRACKS.find((track) => track.key === TITLE_MUSIC_TRACK_KEY) ?? MUSIC_TRACKS[0] ?? null;
}

function getCurrentMusicVolume() {
  return Number(document.getElementById('jukebox-volume')?.value ?? 0.55);
}

function ensureTitleLoadingAudio() {
  const titleTrack = getTitleMusicTrack();
  if (!titleTrack) return null;

  activeTrackIndex = getTitleMusicTrackIndex();

  if (!titleLoadingAudio) {
    titleLoadingAudio = new Audio(titleTrack.file);
    titleLoadingAudio.preload = 'auto';
    titleLoadingAudio.loop = true;
  }

  titleLoadingAudio.volume = getMusicOutputVolume(getCurrentMusicVolume());
  return titleLoadingAudio;
}

function playTitleLoadingAudio() {
  const audio = ensureTitleLoadingAudio();
  if (!audio) return;

  const maybePromise = audio.play();
  if (maybePromise && typeof maybePromise.catch === 'function') {
    maybePromise.catch(() => {});
  }
}

function stopTitleLoadingAudio() {
  if (!titleLoadingAudio) return;
  titleLoadingAudio.pause();
  titleLoadingAudio.currentTime = 0;
}

function isTitleLoadingAudioPlaying() {
  return !!titleLoadingAudio && !titleLoadingAudio.paused;
}

// ── Jukebox floating window ───────────────────────────────────────────────────

function setupJukebox() {
  const win    = document.getElementById('jukebox-window');
  const volume = document.getElementById('jukebox-volume');
  const minBtn = document.getElementById('jukebox-min-btn');
  if (!win || !volume) return;

  // Stop game input from firing through the window
  win.addEventListener('pointerdown', (e) => e.stopPropagation());

  // Drag via title bar
  const titlebar = document.getElementById('jukebox-titlebar');
  if (titlebar) {
    let dragging = false, ox = 0, oy = 0;
    titlebar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#jukebox-close-btn') || e.target.closest('#jukebox-min-btn')) return;
      dragging = true;
      const r = win.getBoundingClientRect();
      // Switch from bottom/right anchoring to explicit top/left
      win.style.bottom = 'auto';
      win.style.right  = 'auto';
      win.style.left   = r.left + 'px';
      win.style.top    = r.top  + 'px';
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      titlebar.setPointerCapture(e.pointerId);
    });
    titlebar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      win.style.left = (e.clientX - ox) + 'px';
      win.style.top  = (e.clientY - oy) + 'px';
    });
    titlebar.addEventListener('pointerup', () => { dragging = false; });
  }

  // Close button
  document.getElementById('jukebox-close-btn')?.addEventListener('click', closeJukebox);
  minBtn?.addEventListener('click', () => {
    win.classList.toggle('is-collapsed');
    minBtn.textContent = win.classList.contains('is-collapsed') ? '+' : '−';
  });

  // Playback controls
  win.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-music-action]');
    if (!btn) return;
    if (btn.dataset.musicAction === 'toggle')   toggleMusic();
    if (btn.dataset.musicAction === 'previous') changeTrack(-1);
    if (btn.dataset.musicAction === 'next')     changeTrack(1);
  });

  // Loop mode buttons
  win.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-loop]');
    if (!btn) return;
    setMusicLoopMode(btn.dataset.loop);
  });

  // Volume
  volume.addEventListener('input', () => {
    const value = Number(volume.value);
    setStoredMusicVolume(value);
    const menuVol = document.getElementById('menu-volume-slider');
    if (menuVol) menuVol.value = value;
    if (activeMusic) activeMusic.setVolume(getMusicOutputVolume(value));
    if (titleLoadingAudio) titleLoadingAudio.volume = getMusicOutputVolume(value);
  });

  updateJukeboxUi();
}

function openJukebox() {
  document.getElementById('jukebox-window')?.classList.add('is-open');
  updateJukeboxUi();
}

function closeJukebox() {
  document.getElementById('jukebox-window')?.classList.remove('is-open');
}

function toggleJukebox() {
  const win = document.getElementById('jukebox-window');
  if (!win) return;
  win.classList.toggle('is-open');
  updateJukeboxUi();
}

function getTitleMusicTrackIndex() {
  const index = MUSIC_TRACKS.findIndex((track) => track.key === TITLE_MUSIC_TRACK_KEY);
  return index >= 0 ? index : 0;
}

function getFirstGameplayMusicTrackIndex() {
  const index = MUSIC_TRACKS.findIndex((track) => track.key !== TITLE_MUSIC_TRACK_KEY);
  return index >= 0 ? index : getTitleMusicTrackIndex();
}

function ensureTitleMusic(options = {}) {
  const { useLoadingAudio = false } = options;
  if (MUSIC_TRACKS.length === 0) return;

  if (useLoadingAudio) {
    playTitleLoadingAudio();
    updateJukeboxUi();
    return;
  }

  if (!activeScene) return;

  const titleTrackIndex = getTitleMusicTrackIndex();
  const currentTrackKey = MUSIC_TRACKS[activeTrackIndex]?.key;
  activeTrackIndex = titleTrackIndex;

  stopTitleLoadingAudio();

  if (!isMusicPlaying) {
    playTrack(activeTrackIndex);
    return;
  }

  if (currentTrackKey !== TITLE_MUSIC_TRACK_KEY) {
    playTrack(activeTrackIndex);
    return;
  }

  updateJukeboxUi();
}

function enterGameplayAudioMode() {
  stopTitleLoadingAudio();

  if (!activeScene || MUSIC_TRACKS.length === 0) {
    updateJukeboxUi();
    return;
  }

  if (MUSIC_TRACKS[activeTrackIndex]?.key === TITLE_MUSIC_TRACK_KEY) {
    activeTrackIndex = getFirstGameplayMusicTrackIndex();
  }

  playTrack(activeTrackIndex);
}

function setMusicLoopMode(mode) {
  musicLoopMode = mode;
  // Re-apply to the currently-playing track so it takes effect immediately
  if (activeMusic && isMusicPlaying) {
    playTrack(activeTrackIndex);
  }
  updateJukeboxUi();
}

function toggleMusic() {
  if (!activeScene) return;

  if (!activeMusic) {
    playTrack(activeTrackIndex);
    return;
  }

  if (isMusicPlaying) {
    activeMusic.pause();
    isMusicPlaying = false;
  } else {
    activeMusic.resume();
    isMusicPlaying = true;
  }

  updateJukeboxUi();
}

function changeTrack(direction) {
  activeTrackIndex = (activeTrackIndex + direction + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
  if (isMusicPlaying || activeMusic) playTrack(activeTrackIndex);
  updateJukeboxUi();
}

function playTrack(trackIndex) {
  if (!activeScene) return;

  if (activeMusic) {
    activeMusic.off('complete');   // remove old auto-advance listener
    activeMusic.stop();
    activeMusic.destroy();
  }

  const volume = getMusicOutputVolume(getCurrentMusicVolume());

  // 'Loop One': Phaser loops the track natively.
  // 'Loop All': play once, then advance on 'complete'.
  const loopNatively = (musicLoopMode === 'one');
  activeMusic = activeScene.sound.add(MUSIC_TRACKS[trackIndex].key, {
    loop: loopNatively,
    volume,
  });

  if (!loopNatively) {
    // Auto-advance to the next track when the current one finishes
    activeMusic.once('complete', () => {
      activeTrackIndex = (activeTrackIndex + 1) % MUSIC_TRACKS.length;
      playTrack(activeTrackIndex);
    });
  }

  activeMusic.play();
  isMusicPlaying = true;
  updateJukeboxUi();
}

function updateJukeboxUi() {
  // Track name
  const nameEl = document.getElementById('jukebox-track-name');
  if (nameEl) nameEl.textContent = MUSIC_TRACKS[activeTrackIndex]?.title ?? '—';

  // Play / pause icon
  const icon = document.getElementById('jukebox-play-icon');
  if (icon) {
    icon.innerHTML = isMusicPlaying
      ? '<path d="M10 7v18" /><path d="M22 7v18" />'
      : '<path d="M10 7v18l15-9z" />';
  }

  // Loop mode buttons
  document.querySelectorAll('[data-loop]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.loop === musicLoopMode);
  });
  if (typeof updateSoundMenu === 'function') updateSoundMenu();
  updateMapNavigationControls();
}

// ── Ambient city soundscape ────────────────────────────────────────────────────
// Four looping beds (urban / residential / rain / typhoon) are always playing at
// volume 0 and are continuously faded toward a target mix so transitions are
// smooth instead of hard cuts. The mix is driven by:
//  - how densely built the on-screen area is (sampled buildingData), which
//    crossfades between the "urban" and "residential" beds
//  - the current weather/typhoon state, which layers rain/typhoon on top
//  - the camera zoom level, which scales everything toward silence when zoomed out
function startAmbientSoundscape(scene) {
  if (!scene || scene.ambientSounds) return;
  if (scene.sound.locked) {
    scene.sound.once('unlocked', () => startAmbientSoundscape(scene));
    return;
  }

  scene.ambientSounds = {};
  scene.ambientVolumes = {};
  AMBIENT_TRACKS.forEach((track) => {
    const channel = track.key.replace(/^amb_/, '');
    const sound = scene.sound.add(track.key, { loop: true, volume: 0 });
    sound.play();
    scene.ambientSounds[channel] = sound;
    scene.ambientVolumes[channel] = 0;
  });

  updateAmbientSoundscape(scene);
  if (!scene.ambientIntervalId) {
    scene.ambientIntervalId = setInterval(() => {
      if (scene.scene?.isVisible && !scene.scene.isVisible()) return;
      updateAmbientSoundscape(scene);
      updateWeatherEffectsTier(scene);
    }, AMBIENT_UPDATE_MS);
  }
}

// Samples a grid of on-screen points and looks up the actual building at each
// one, so "urban" reflects what's visually packed into view right now rather
// than the zoning intent of off-screen tiles.
function sampleOnScreenBuildingDensity(scene) {
  const camera = scene.cameras.main;
  let sampleCount = 0;
  let weightedDensity = 0;

  for (let i = 0; i < AMBIENT_SAMPLE_GRID; i++) {
    for (let j = 0; j < AMBIENT_SAMPLE_GRID; j++) {
      const screenX = camera.width * (i + 0.5) / AMBIENT_SAMPLE_GRID;
      const screenY = camera.height * (j + 0.5) / AMBIENT_SAMPLE_GRID;
      const worldX = camera.scrollX + screenX / camera.zoom;
      const worldY = camera.scrollY + screenY / camera.zoom;
      const logical = worldToLogicalPoint(scene, worldX, worldY);
      const row = Math.floor(logical.y);
      const col = Math.floor(logical.x);
      if (!isInsideMap(row, col)) continue;

      sampleCount++;
      const record = buildingData[getTileId(row, col)];
      if (!record) continue;

      const density = record.density ?? zoneDensityMap[row]?.[col] ?? DENSITY_LOW;
      let weight = density === DENSITY_HIGH ? 1 : density === DENSITY_MED ? 0.6 : 0.3;
      if (record.type === 'commercial' || record.type === 'industrial') weight = Math.min(1, weight + 0.15);
      weightedDensity += weight;
    }
  }

  if (sampleCount === 0) return 0;
  return Phaser.Math.Clamp(weightedDensity / sampleCount, 0, 1);
}

function updateAmbientSoundscape(scene) {
  // Title music owns the speakers while the showcase city plays behind the menu.
  if (typeof isAttractModeActive === 'function' && isAttractModeActive()) return;
  if (!scene?.ambientSounds || !scene.cameras?.main) return;
  const camera = scene.cameras.main;

  const zoomFade = Phaser.Math.Clamp(
    (camera.zoom - AMBIENT_ZOOM_MIN) / (AMBIENT_ZOOM_MAX - AMBIENT_ZOOM_MIN),
    0, 1,
  );
  const urbanScore = zoomFade > 0 ? sampleOnScreenBuildingDensity(scene) : 0;

  const weather = city?.weather ?? {};
  const isTyphoon = ['signal3', 'signal8', 'signal9', 'signal10'].includes(weather.typhoonStage);
  const isApproachingTyphoon = weather.typhoonStage === 'signal1';
  const isRaining = !isTyphoon && (weather.condition === 'showers' || weather.condition === 'heavyRain');
  const ambientMix = getStoredAmbientVolume();

  const targets = {
    urban: zoomFade * urbanScore * AMBIENT_BASE_VOLUME.urban * ambientMix,
    residential: zoomFade * (1 - urbanScore * 0.85) * AMBIENT_BASE_VOLUME.residential * ambientMix,
    rain: zoomFade * (isRaining ? 1 : 0) * AMBIENT_BASE_VOLUME.rain * ambientMix,
    typhoon: zoomFade * (isTyphoon ? 1 : isApproachingTyphoon ? 0.45 : 0) * AMBIENT_BASE_VOLUME.typhoon * ambientMix,
  };

  Object.keys(targets).forEach((channel) => {
    const sound = scene.ambientSounds[channel];
    if (!sound) return;
    const current = scene.ambientVolumes[channel] ?? 0;
    const next = current + (targets[channel] - current) * AMBIENT_FADE_RATE;
    scene.ambientVolumes[channel] = next;
    sound.setVolume(Math.max(0, next));
  });
}

// Festival audio uses the same local, ambient-volume mix as the ice cream van.
// One shared paddle bed represents six crews; it must not multiply the volume by six.
function dragonBoatAudioPlan(run, minute) {
  if (!run?.course || !['running','held'].includes(run.status) || minute < 480 || minute >= 1080) return [];
  const phase = dragonBoatPhase(minute, run.delayed);
  if (minute < 540) return ['opening'];
  const plan = minute >= (run.delayed ? 675 : 555) ? ['music'] : [];
  if (phase.kind === 'race') {
    if (phase.minute < 15) plan.push('cheers');
    else if (phase.minute < 45) plan.push('paddles');
  }
  return plan;
}

function stopDragonBoatAudio(scene) {
  const sounds=new Set(Object.values(scene?.dragonBoatAudio?.sounds || {}));
  scene?.sound?.getAll?.('db_music').forEach(sound=>sounds.add(sound));
  sounds.forEach(sound => {
    sound.stop();sound.destroy();
  });
  if (scene) scene.dragonBoatAudio = null;
}

function getDragonBoatAudioVolume(scene, run, minute, channel) {
  const camera = scene.cameras.main, rect = getTrafficCameraRect(scene);
  if (!rect) return 0;
  const centre = {x:rect.x + rect.width / 2, y:rect.y + rect.height / 2};
  const places = channel === 'paddles'
    ? run.teams.map(team => dragonBoatPose(run, team, minute))
    : [dbPoint(run.course, run.course.distanceM / 40, -0.075)];
  const distance = Math.min(...places.map(p => {
    const at = getFestivalPlacementPoint(scene, {mode:'tile', row:p.row, col:p.col});
    return Math.hypot(at.x - centre.x, at.y - centre.y);
  }));
  const proximity = Math.max(0, 1 - distance / Math.max(1, Math.max(rect.width, rect.height) * .8));
  const zoomFade = Math.max(0, Math.min(1, (camera.zoom - .5) / (TRAFFIC_VISUAL_CONFIG.zoomMin - .5)));
  const base = {opening:.55, cheers:.5, music:.42, paddles:.45}[channel];
  return base * proximity * zoomFade * getStoredAmbientVolume();
}

function updateDragonBoatAudio(scene) {
  const run = typeof city !== 'undefined' ? city.festivals?.dragonBoat : null;
  const live = scene?.cameras?.main && isFestivalGameplayLive() && isFestivalEnabled('dragonBoat')
    && getFestivalTier('dragonBoat') !== 'skip' && run?.year === city.year && run?.month === city.month
    && !dragonBoatWeatherBad(city.weather) && (!scene.scene?.isVisible || scene.scene.isVisible());
  const minute = live ? getGameTimeOfDayMinutes() : 0;
  const plan = live ? dragonBoatAudioPlan(run, minute) : [];
  if (!plan.length) {stopDragonBoatAudio(scene);return;}
  const id = `${run.year}:${run.month}:${run.seed}:${run.course.id}`;
  if (scene.dragonBoatAudio?.id !== id) {
    stopDragonBoatAudio(scene);
    scene.dragonBoatAudio = {id, sounds:{}};
  }
  const sounds = scene.dragonBoatAudio.sounds;
  Object.keys(sounds).forEach(channel => {
    if (!plan.includes(channel)) {sounds[channel].stop();sounds[channel].destroy();delete sounds[channel];}
  });
  if (!scene.sound || scene.sound.locked) return;
  plan.forEach(channel => {
    const key = 'db_' + channel;
    if(channel==='music') {
      const matches=(scene.sound.getAll?.(key)||[]).filter(s=>!s.pendingRemove);
      const existing=matches.find(s=>s.isPlaying||s.isPaused)||sounds[channel];
      if(existing)sounds[channel]=existing;
      matches.forEach(s=>{if(s!==existing){s.stop();s.destroy();}});
    }
    if (!sounds[channel] && !simPaused && scene.cache.audio.exists(key)) {
      sounds[channel] = scene.sound.add(key, {loop:true, volume:0});
      sounds[channel].play();
    }
    const sound = sounds[channel];
    if (!sound) return;
    if(channel==='music'&&!simPaused&&!sound.isPlaying&&!sound.isPaused)sound.play();
    sound.setVolume(getDragonBoatAudioVolume(scene, run, minute, channel));
    if (simPaused && sound.isPlaying) sound.pause();
    else if (!simPaused && sound.isPaused) sound.resume();
  });
}
