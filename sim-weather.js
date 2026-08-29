// Fictional-city weather simulation, modelled loosely on Hong Kong Observatory practice:
// tropical cyclones are named from the real Western North Pacific/South China Sea list,
// the tropical cyclone warning signal is derived directly from simulated sustained wind
// speed (so 1→3→8→(9→10)→8→3→1 emerges naturally as wind rises and falls), and rainstorm
// warnings are derived from simulated rainfall. The Observatory Director (council-news.js)
// is the in-world voice that announces signal changes.

const WEATHER_TYPHOON_MONTHS = new Set([4, 5, 6, 7, 8, 9, 10, 11]);
// Tuned for a once-per-sim-tick genesis check (TICKS_PER_MONTH=4 evaluations/
// game month, back when weather only updated on the legacy heavy-sim tick).
// The clock refactor moved weather to a daily update (GAME_DAYS_PER_MONTH=30
// evaluations/month, ~7.5x more often) — kept unconverted, storms-per-year
// would balloon by the same ~7.5x. Re-derive the equivalent per-day hazard
// from the legacy per-evaluation chance so storm frequency stays the same.
const WEATHER_TYPHOON_GENESIS_CHANCE_LEGACY = 0.035;
const WEATHER_TYPHOON_GENESIS_CHANCE = 1 - Math.pow(
  1 - WEATHER_TYPHOON_GENESIS_CHANCE_LEGACY,
  TICKS_PER_MONTH / GAME_DAYS_PER_MONTH,
);

// Real Western North Pacific / South China Sea tropical cyclone names, cross-referenced
// against the China Meteorological Administration's official English–Chinese naming
// table (tcdata.typhoon.org.cn) and JMA's katakana readings (jma.go.jp). Entries without
// a verified Chinese translation are omitted rather than guessed; entries without a
// verified Japanese reading fall back to the English/romanized form (common practice in
// Japanese coverage of lesser-known storms).
const TYPHOON_NAME_TABLE = [
  { en: 'Damrey', zh: '達維', ja: 'ダムレイ' },
  { en: 'Kirogi', zh: '鴻雁', ja: 'キロギー' },
  { en: 'Bolaven', zh: '布拉萬', ja: 'ボラヴェン' },
  { en: 'Sanba', zh: '三巴', ja: 'サンバ' },
  { en: 'Jelawat', zh: '杰拉華', ja: 'ジェラワット' },
  { en: 'Maliksi', zh: '馬力斯', ja: 'マリクシ' },
  { en: 'Gaemi', zh: '格美', ja: 'ケーミー' },
  { en: 'Prapiroon', zh: '派比安', ja: 'プラピルーン' },
  { en: 'Maria', zh: '瑪利亞', ja: 'マリア' },
  { en: 'Son-Tinh', zh: '山神', ja: 'ソンティン' },
  { en: 'Ampil', zh: '安比' },
  { en: 'Wukong', zh: '悟空' },
  { en: 'Jongdari', zh: '雲雀' },
  { en: 'Shanshan', zh: '珊珊' },
  { en: 'Nakri', zh: '娜基莉' },
  { en: 'Fengshen', zh: '風神' },
  { en: 'Kalmaegi', zh: '海鷗' },
  { en: 'Fung-wong', zh: '鳳凰' },
  { en: 'Nuri', zh: '鸚鵡' },
  { en: 'Sinlaku', zh: '森拉克' },
  { en: 'Hagupit', zh: '黑格比' },
  { en: 'Jangmi', zh: '薔薇' },
  { en: 'Mekkhala', zh: '米克拉' },
  { en: 'Bavi', zh: '巴威' },
  { en: 'Haishen', zh: '海神' },
  { en: 'Noul', zh: '紅霞' },
  { en: 'Dolphin', zh: '白海豚' },
  { en: 'Kujira', zh: '鯨魚' },
  { en: 'Krovanh', zh: '科羅旺' },
  { en: 'Dujuan', zh: '杜鵑' },
  { en: 'Surigae', zh: '舒力基' },
  { en: 'Choi-wan', zh: '彩雲' },
  { en: 'Koguma', zh: '小熊' },
  { en: 'Champi', zh: '薔琵' },
  { en: 'In-fa', zh: '煙花' },
  { en: 'Cempaka', zh: '查帕卡' },
  { en: 'Nepartak', zh: '尼伯特' },
  { en: 'Lupit', zh: '盧碧' },
  { en: 'Mirinae', zh: '銀河' },
  { en: 'Nida', zh: '妮妲' },
  { en: 'Chanthu', zh: '燦都' },
  { en: 'Dianmu', zh: '電母' },
  { en: 'Mindulle', zh: '蒲公英' },
  { en: 'Lionrock', zh: '獅子山' },
  { en: 'Namtheun', zh: '南川' },
  { en: 'Malou', zh: '瑪瑙' },
  { en: 'Nyatoh', zh: '妮亞圖' },
  { en: 'Chaba', zh: '暹芭' },
  { en: 'Aere', zh: '艾利' },
  { en: 'Songda', zh: '桑達' },
  { en: 'Trases', zh: '翠絲' },
  { en: 'Mulan', zh: '木蘭' },
  { en: 'Meari', zh: '米雷' },
  { en: 'Tokage', zh: '蠍虎' },
  { en: 'Muifa', zh: '梅花' },
  { en: 'Merbok', zh: '苗柏' },
  { en: 'Nanmadol', zh: '南瑪都' },
  { en: 'Talas', zh: '塔拉斯' },
  { en: 'Kulap', zh: '玫瑰' },
  { en: 'Roke', zh: '洛克' },
  { en: 'Sonca', zh: '桑卡' },
  { en: 'Haitang', zh: '海棠' },
  { en: 'Banyan', zh: '榕樹' },
  { en: 'Pakhar', zh: '帕卡' },
  { en: 'Sanvu', zh: '珊瑚' },
  { en: 'Mawar', zh: '瑪娃' },
  { en: 'Guchol', zh: '古超' },
  { en: 'Talim', zh: '泰利' },
  { en: 'Khanun', zh: '卡努' },
  { en: 'Lan', zh: '蘭恩' },
  { en: 'Saola', zh: '蘇拉' },
  { en: 'Pabuk', zh: '帕布' },
  { en: 'Wutip', zh: '蝴蝶' },
  { en: 'Sepat', zh: '聖帕' },
  { en: 'Mun', zh: '木恩' },
  { en: 'Danas', zh: '丹娜絲' },
  { en: 'Nari', zh: '百合' },
  { en: 'Wipha', zh: '韋帕' },
  { en: 'Francisco', zh: '范斯高' },
  { en: 'Krosa', zh: '羅莎' },
  { en: 'Bailu', zh: '白鹿' },
  { en: 'Podul', zh: '楊柳' },
  { en: 'Lingling', zh: '玲玲' },
  { en: 'Kajiki', zh: '劍魚' },
  { en: 'Peipah', zh: '琵琶' },
  { en: 'Tapah', zh: '塔巴' },
  { en: 'Mitag', zh: '米娜' },
  { en: 'Neoguri', zh: '浣熊' },
  { en: 'Bualoi', zh: '博羅依' },
  { en: 'Matmo', zh: '麥德姆' },
  { en: 'Halong', zh: '夏浪' },
  { en: 'Leepi', zh: '麗琵' },
  { en: 'Bebinca', zh: '貝碧嘉' },
  { en: 'Chan-hom', zh: '燦鴻' },
  { en: 'Etau', zh: '艾濤' },
  { en: 'Nangka', zh: '浪卡' },
  { en: 'Saudel', zh: '沙德爾' },
  { en: 'Atsani', zh: '艾莎尼' },
  { en: 'Barijat', zh: '百里嘉' },
  { en: 'Cimaron', zh: '西馬崙' },
];
const TYPHOON_NAMES = TYPHOON_NAME_TABLE.map((entry) => entry.en);

function getTyphoonNameEntry(englishName) {
  return TYPHOON_NAME_TABLE.find((entry) => entry.en === englishName) || null;
}

// Localized display name for a storm — English list name is kept as the stable
// internal identifier (event ids, dedupe tags); this resolves the name shown to
// the player in the current UI language.
function getTyphoonDisplayName(englishName) {
  const entry = getTyphoonNameEntry(englishName);
  if (!entry) return englishName;
  const lang = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'en';
  if (lang === 'zhHant') return entry.zh || entry.en;
  if (lang === 'ja') return entry.ja || entry.en;
  return entry.en;
}

// Tropical cyclone warning signal thresholds, approximating HKO's published sustained
// (10-minute mean) wind-speed bands. Signal 9 ("increasing gale or storm force winds")
// only fires while a storm is still strengthening toward a severe peak — matching real
// practice, where No.9 is never used while a storm is weakening.
function getTyphoonStageForWind(windKph, peakWindKph, rising) {
  if (windKph >= 118) return 'signal10';
  if (windKph >= 63) {
    if (rising && peakWindKph >= 100 && windKph >= 95) return 'signal9';
    return 'signal8';
  }
  if (windKph >= 41) return 'signal3';
  if (windKph >= 30) return 'signal1';
  return 'none';
}

function weatherClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickWeightedWeather(options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = Math.random() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.value;
  }
  return options[options.length - 1].value;
}

function getSeasonalWeatherProfile(month) {
  if (month >= 6 && month <= 9) {
    return {
      baseTemperature: 29,
      conditions: [
        { value: 'hot', weight: 28 },
        { value: 'showers', weight: 27 },
        { value: 'heavyRain', weight: 14 },
        { value: 'cloudy', weight: 18 },
        { value: 'clear', weight: 13 },
      ],
    };
  }
  if (month === 12 || month <= 2) {
    return {
      baseTemperature: 17,
      conditions: [
        { value: 'cool', weight: 35 },
        { value: 'clear', weight: 30 },
        { value: 'cloudy', weight: 25 },
        { value: 'windy', weight: 10 },
      ],
    };
  }
  return {
    baseTemperature: 24,
    conditions: [
      { value: 'clear', weight: 30 },
      { value: 'cloudy', weight: 28 },
      { value: 'showers', weight: 22 },
      { value: 'windy', weight: 12 },
      { value: 'heavyRain', weight: 8 },
    ],
  };
}

// ── Tropical cyclone lifecycle ───────────────────────────────────────────────
// Each active storm is rolled a peak intensity and a lifespan (in sim ticks) at
// genesis; wind then rises to that peak around the storm's midpoint and falls
// away again, so the warning signal (a pure function of wind) naturally traces
// a realistic 1→3→8→(9→10)→8→3→1 arc instead of being scripted stage-by-stage.

function rollTyphoonGenesis() {
  const roll = Math.random();
  if (roll < 0.55) return { peakWindKph: 34 + Math.random() * 18, durationTicks: 4 };
  if (roll < 0.82) return { peakWindKph: 64 + Math.random() * 28, durationTicks: 7 };
  if (roll < 0.96) return { peakWindKph: 100 + Math.random() * 22, durationTicks: 8 };
  return { peakWindKph: 124 + Math.random() * 40, durationTicks: 9 };
}

function nextTyphoonName(weather) {
  const index = Math.floor(weather.typhoonNameIndex ?? 0) % TYPHOON_NAMES.length;
  weather.typhoonNameIndex = index + 1;
  return TYPHOON_NAMES[index];
}

function computeTyphoonWindProgress(weather) {
  const duration = Math.max(1, weather.typhoonDurationTicks);
  const progress = weatherClamp(weather.typhoonTicksElapsed / duration, 0, 1);
  const shape = progress <= 0.5 ? progress / 0.5 : Math.max(0, 1 - (progress - 0.5) / 0.5);
  const jitter = 0.9 + Math.random() * 0.2;
  return { progress, windKph: Math.max(12, 16 + weather.typhoonPeakWindKph * shape * jitter) };
}

function startTyphoonGenesis(weather) {
  const genesis = rollTyphoonGenesis();
  weather.typhoonActive = true;
  weather.typhoonName = nextTyphoonName(weather);
  weather.typhoonPeakWindKph = Math.round(genesis.peakWindKph);
  weather.typhoonDurationTicks = genesis.durationTicks;
  weather.typhoonTicksElapsed = 0;
  weather.typhoonStage = 'none';
  weather.signal8ReachedThisStorm = false;
}

function endTyphoon(weather) {
  const previousStage = weather.typhoonStage;
  const name = weather.typhoonName;
  weather.typhoonActive = false;
  weather.typhoonStage = 'none';
  weather.typhoonName = '';
  weather.typhoonPeakWindKph = 0;
  weather.typhoonDurationTicks = 0;
  weather.typhoonTicksElapsed = 0;
  weather.signal8ReachedThisStorm = false;
  if (previousStage !== 'none' && typeof announceTyphoonSignalChange === 'function') {
    announceTyphoonSignalChange(name, 'none', 0);
  }
}

function updateTyphoonState() {
  const weather = city.weather;

  if (!weather.typhoonActive) {
    if (WEATHER_TYPHOON_MONTHS.has(city.month) && Math.random() < WEATHER_TYPHOON_GENESIS_CHANCE) {
      startTyphoonGenesis(weather);
    } else {
      return;
    }
  }

  const { progress, windKph } = computeTyphoonWindProgress(weather);
  const rising = progress < 0.5;
  const stage = getTyphoonStageForWind(windKph, weather.typhoonPeakWindKph, rising);
  weather.typhoonWindKph = Math.round(windKph);

  if (stage !== weather.typhoonStage) {
    const firstSevereSignal = (stage === 'signal8' || stage === 'signal9' || stage === 'signal10')
      && !weather.signal8ReachedThisStorm;
    weather.typhoonStage = stage;
    if (firstSevereSignal) {
      weather.signal8ReachedThisStorm = true;
    }
    if (typeof announceTyphoonSignalChange === 'function') {
      announceTyphoonSignalChange(weather.typhoonName, stage, weather.typhoonWindKph);
    }
    if (firstSevereSignal && typeof announceSevereTyphoonForumNews === 'function') {
      announceSevereTyphoonForumNews(weather.typhoonName, stage, weather.typhoonWindKph);
    }
  }

  weather.typhoonTicksElapsed += 1;
  if (weather.typhoonTicksElapsed > weather.typhoonDurationTicks) {
    endTyphoon(weather);
  }
}

function applyWeatherReadings() {
  const weather = city.weather;
  const profile = getSeasonalWeatherProfile(city.month);

  if (weather.conditionTicksLeft <= 0) {
    weather.condition = pickWeightedWeather(profile.conditions);
    weather.conditionTicksLeft = 1 + Math.floor(Math.random() * 2);
  } else {
    weather.conditionTicksLeft--;
  }

  let temperature = profile.baseTemperature + (Math.random() * 5 - 2.5);
  let rainfall = 0;
  let wind = 7 + Math.random() * 15;

  if (weather.condition === 'hot') temperature += 4;
  if (weather.condition === 'cool') temperature -= 5;
  if (weather.condition === 'showers') rainfall = 4 + Math.random() * 18;
  if (weather.condition === 'heavyRain') rainfall = 28 + Math.random() * 65;
  if (weather.condition === 'windy') wind += 22;

  if (weather.typhoonActive && weather.typhoonStage !== 'none') {
    wind = weather.typhoonWindKph;
    // Rainfall scales with sustained wind, echoing how outer rainbands intensify
    // alongside the wind field; a splash of randomness keeps individual storms distinct.
    rainfall = Math.max(rainfall, wind * 0.75 + Math.random() * 20);
    weather.condition = wind >= 41 ? 'heavyRain' : 'windy';
  }

  weather.temperatureC = Math.round(temperature);
  weather.rainfallMm = Math.round(rainfall);
  weather.windKph = Math.round(wind);

  let humidity = 55 + Math.random() * 10;
  if (weather.condition === 'heavyRain') humidity = 88 + Math.random() * 8;
  else if (weather.condition === 'showers') humidity = 75 + Math.random() * 10;
  else if (weather.condition === 'hot') humidity = 65 + Math.random() * 12;
  else if (weather.condition === 'cool' || weather.condition === 'clear') humidity = 45 + Math.random() * 15;
  else if (weather.condition === 'windy') humidity = 55 + Math.random() * 10;
  weather.humidityPct = Math.round(weatherClamp(humidity, 30, 99));

  // Rainstorm warning bands approximate HKO's published rainfall-rate thresholds
  // (Amber >30mm, Red >50mm, Black >70mm in an hour).
  weather.rainWarning = weather.rainfallMm >= 70 ? 'black'
    : weather.rainfallMm >= 50 ? 'red'
      : weather.rainfallMm >= 30 ? 'amber'
        : 'none';
}

function updateWeatherSimulation() {
  if (!city.weather) normalizeCityFinanceState();
  updateTyphoonState();
  applyWeatherReadings();
}

// Target darkness (0..~0.45) for the full-screen weather overlay — the sky dims
// progressively with rain intensity and tropical cyclone severity.
function getWeatherOverlayAlpha() {
  const weather = city.weather;
  if (!weather) return 0;
  if (['signal8', 'signal9', 'signal10'].includes(weather.typhoonStage)) return 0.45;
  if (weather.typhoonStage === 'signal3') return 0.3;
  if (weather.typhoonStage === 'signal1') return 0.18;
  if (weather.rainWarning === 'black') return 0.42;
  if (weather.rainWarning === 'red') return 0.34;
  if (weather.rainWarning === 'amber') return 0.24;
  if (weather.condition === 'heavyRain') return 0.28;
  if (weather.condition === 'showers') return 0.15;
  if (weather.condition === 'cloudy') return 0.06;
  return 0;
}

function updateWeatherVisualOverlay(scene) {
  const overlay = scene?.weatherOverlay;
  if (!overlay) return;
  const target = getWeatherOverlayAlpha();
  if (overlay.getData('targetAlpha') === target) return;
  overlay.setData('targetAlpha', target);
  scene.tweens.add({ targets: overlay, alpha: target, duration: 2000, ease: 'Sine.easeInOut' });
}

// ── Dynamic lighting: one authoritative 24-hour visual timeline ─────────────
// game-clock.js owns the current minute. These keys make the topbar clock, sky,
// direct sun, sea glitter and night mask all describe the same moment instead
// of maintaining separate real-time loops that can drift apart.
const SUN_LIGHT_KEYFRAMES = {
  midnight: { color: 0x59657b, alpha: 0 },
  predawn: { color: 0x8f8799, alpha: 0 },
  dawn: { color: 0xd49a87, alpha: 0.03 },
  sunrise: { color: 0xffb066, alpha: 0.14 },
  noon: { color: 0xfff6e0, alpha: 0.03 },
  lateAfternoon: { color: 0xfff1d6, alpha: 0.04 },
  goldenHour: { color: 0xffc77a, alpha: 0.10 },
  sunset: { color: 0xff7a3d, alpha: 0.17 },
  dusk: { color: 0xc98273, alpha: 0.08 },
  night: { color: 0x657080, alpha: 0 },
};
const SKY_BACKGROUND_KEYFRAMES = {
  midnight: 0x02040a,
  predawn: 0x10162a,
  dawn: 0x4d5574,
  sunrise: 0xb8a9b6,
  noon: 0x87ceeb,
  lateAfternoon: 0x83c8e8,
  goldenHour: 0xe0b37d,
  sunset: 0xd96f4f,
  dusk: 0x776b8f,
  night: 0x0b1020,
};
const SKY_BACKGROUND_DEFAULT_COLOR = SKY_BACKGROUND_KEYFRAMES.noon;
const SUN_SHADOW_COLOR = 0x1c2a4a;
const DAY_NIGHT_VISUAL_MINUTES = 24 * 60;
const DEFAULT_ASTRONOMY_VISUAL_DAY = Object.freeze({
  sunriseMinutes: 6 * 60,
  solarTransitMinutes: 12 * 60,
  sunsetMinutes: 18 * 60,
  civilTwilightMinutes: 24,
  nauticalTwilightMinutes: 52,
  astronomicalTwilightMinutes: 80,
  moonriseMinutes: null,
  moonTransitMinutes: null,
  moonsetMinutes: null,
  moonPhase: 0.5,
});

function getAstronomyVisualDay() {
  const data = typeof getCurrentAstronomyData === 'function' ? getCurrentAstronomyData() : null;
  return { ...DEFAULT_ASTRONOMY_VISUAL_DAY, ...(data || {}) };
}

function clampVisualMinute(value, fallback) {
  const number = Number(value);
  return Math.max(0, Math.min(DAY_NIGHT_VISUAL_MINUTES, Number.isFinite(number) ? number : fallback));
}

// One schedule is rebuilt from today's HKO sunrise/sunset and twilight
// durations. The three dusk/dawn stages correspond to civil, nautical and
// astronomical twilight, so "dark" means a real Hong Kong astronomical night
// rather than a fixed hour painted onto every season.
function getDayNightVisualKeyframes(astronomy = getAstronomyVisualDay()) {
  const sunrise = clampVisualMinute(astronomy.sunriseMinutes, 6 * 60);
  const sunset = clampVisualMinute(astronomy.sunsetMinutes, 18 * 60);
  const transit = Math.max(sunrise + 1, Math.min(sunset - 1,
    clampVisualMinute(astronomy.solarTransitMinutes, (sunrise + sunset) / 2)));
  const civil = Math.max(1, Number(astronomy.civilTwilightMinutes) || 24);
  const nautical = Math.max(civil + 1, Number(astronomy.nauticalTwilightMinutes) || 52);
  const astronomical = Math.max(nautical + 1, Number(astronomy.astronomicalTwilightMinutes) || 80);
  // Keep the ordinary blue afternoon intact. Warmth begins 75 minutes before
  // sunset, reaches a pale golden hour at T-30, and only then turns orange-red.
  // Previously noon blended straight to sunset for five-plus hours, making a
  // November sky roughly 75% orange by 15:51 despite a 17:40 sunset.
  const lateAfternoon = Math.min(sunset - 2, Math.max(transit + 1, sunset - 75));
  const goldenHour = Math.min(sunset - 1, Math.max(lateAfternoon + 1, sunset - 30));
  return [
    { minute: 0, key: 'midnight', nightAlpha: 0.54, sunsetStrength: 0 },
    { minute: Math.max(1, sunrise - astronomical), key: 'midnight', nightAlpha: 0.54, sunsetStrength: 0 },
    { minute: sunrise - nautical, key: 'predawn', nightAlpha: 0.46, sunsetStrength: 0 },
    { minute: sunrise - civil, key: 'dawn', nightAlpha: 0.26, sunsetStrength: 0 },
    { minute: sunrise, key: 'sunrise', nightAlpha: 0.08, sunsetStrength: 0 },
    { minute: transit, key: 'noon', nightAlpha: 0, sunsetStrength: 0 },
    { minute: lateAfternoon, key: 'lateAfternoon', nightAlpha: 0, sunsetStrength: 0 },
    { minute: goldenHour, key: 'goldenHour', nightAlpha: 0, sunsetStrength: 0.22 },
    { minute: sunset, key: 'sunset', nightAlpha: 0.02, sunsetStrength: 1 },
    { minute: sunset + civil, key: 'dusk', nightAlpha: 0.18, sunsetStrength: 0.32 },
    { minute: sunset + nautical, key: 'night', nightAlpha: 0.42, sunsetStrength: 0 },
    { minute: Math.min(DAY_NIGHT_VISUAL_MINUTES - 1, sunset + astronomical), key: 'midnight', nightAlpha: 0.54, sunsetStrength: 0 },
    { minute: DAY_NIGHT_VISUAL_MINUTES, key: 'midnight', nightAlpha: 0.54, sunsetStrength: 0 },
  ];
}

function lerpColorChannels(colorA, colorB, t) {
  const ar = (colorA >> 16) & 0xff; const ag = (colorA >> 8) & 0xff; const ab = colorA & 0xff;
  const br = (colorB >> 16) & 0xff; const bg = (colorB >> 8) & 0xff; const bb = colorB & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | b;
}

function normalizeDayNightVisualMinutes(value) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 6 * 60;
  return ((safe % DAY_NIGHT_VISUAL_MINUTES) + DAY_NIGHT_VISUAL_MINUTES) % DAY_NIGHT_VISUAL_MINUTES;
}

function getDayNightVisualState(timeMinutes) {
  const minute = normalizeDayNightVisualMinutes(timeMinutes);
  const keyframes = getDayNightVisualKeyframes();
  let from = keyframes[0];
  let to = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const candidateFrom = keyframes[i];
    const candidateTo = keyframes[i + 1];
    if (minute >= candidateFrom.minute && minute < candidateTo.minute) {
      from = candidateFrom;
      to = candidateTo;
      break;
    }
  }
  const rawT = (minute - from.minute) / Math.max(1, to.minute - from.minute);
  const localT = rawT * rawT * (3 - 2 * rawT); // ease without a slope kink at each keyframe
  const fromSun = SUN_LIGHT_KEYFRAMES[from.key];
  const toSun = SUN_LIGHT_KEYFRAMES[to.key];
  return {
    minute,
    backgroundColor: lerpColorChannels(
      SKY_BACKGROUND_KEYFRAMES[from.key],
      SKY_BACKGROUND_KEYFRAMES[to.key],
      localT,
    ),
    nightAlpha: from.nightAlpha + (to.nightAlpha - from.nightAlpha) * localT,
    warmColor: lerpColorChannels(fromSun.color, toSun.color, localT),
    sunAlpha: fromSun.alpha + (toSun.alpha - fromSun.alpha) * localT,
    sunsetStrength: from.sunsetStrength + (to.sunsetStrength - from.sunsetStrength) * localT,
  };
}

function getSkyBackgroundColor(timeMinutes) {
  return getDayNightVisualState(timeMinutes).backgroundColor;
}

function getNightOverlayAlpha(timeMinutes) {
  return getDayNightVisualState(timeMinutes).nightAlpha;
}

function isClearSkyCondition() {
  const condition = typeof city !== 'undefined' ? city?.weather?.condition : 'clear';
  return condition === 'clear' || condition === 'hot' || condition === 'cool';
}

function smoothVisualStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function getAstronomicalNightStrength(timeMinutes, astronomy = getAstronomyVisualDay()) {
  const minute = normalizeDayNightVisualMinutes(timeMinutes);
  const sunrise = Number(astronomy.sunriseMinutes) || 6 * 60;
  const sunset = Number(astronomy.sunsetMinutes) || 18 * 60;
  const astronomical = Math.max(1, Number(astronomy.astronomicalTwilightMinutes) || 80);
  const dawnStart = sunrise - astronomical;
  const duskEnd = sunset + astronomical;
  if (minute < dawnStart || minute >= duskEnd) return 1;
  if (minute < sunrise) return 1 - smoothVisualStep((minute - dawnStart) / astronomical);
  if (minute <= sunset) return 0;
  return smoothVisualStep((minute - sunset) / astronomical);
}

function getStarFieldVisualState(timeMinutes) {
  const strength = isClearSkyCondition() ? getAstronomicalNightStrength(timeMinutes) : 0;
  return { active: strength > 0.002, alpha: strength * 0.9 };
}

function getMoonVisibleArc(timeMinutes, astronomy) {
  const minute = normalizeDayNightVisualMinutes(timeMinutes);
  const rise = astronomy.moonriseMinutes !== null && astronomy.moonriseMinutes !== undefined
    && Number.isFinite(Number(astronomy.moonriseMinutes)) ? Number(astronomy.moonriseMinutes) : null;
  const set = astronomy.moonsetMinutes !== null && astronomy.moonsetMinutes !== undefined
    && Number.isFinite(Number(astronomy.moonsetMinutes)) ? Number(astronomy.moonsetMinutes) : null;
  if (rise === null && set === null) return null;

  let start = rise;
  let end = set;
  if (start === null) start = end - 12 * 60;
  if (end === null) end = start + 12 * 60;
  if (end <= start) end += DAY_NIGHT_VISUAL_MINUTES;
  let adjustedMinute = minute;
  if (adjustedMinute < start) adjustedMinute += DAY_NIGHT_VISUAL_MINUTES;
  if (adjustedMinute < start || adjustedMinute > end) return null;
  return Math.max(0, Math.min(1, (adjustedMinute - start) / Math.max(1, end - start)));
}

function getMoonVisualState(timeMinutes) {
  const astronomy = getAstronomyVisualDay();
  const progress = getMoonVisibleArc(timeMinutes, astronomy);
  const nightAlpha = getNightOverlayAlpha(timeMinutes);
  const clearAlpha = isClearSkyCondition() ? smoothVisualStep((nightAlpha - 0.05) / 0.4) : 0;
  const altitude = progress === null ? 0 : Math.sin(Math.PI * progress);
  const horizonFade = smoothVisualStep(Math.min(1, altitude / 0.2));
  const phase = Math.max(0, Math.min(1, Number(astronomy.moonPhase) || 0));
  const alpha = progress === null ? 0 : clearAlpha * (0.35 + 0.65 * horizonFade);
  return {
    active: alpha > 0.002,
    alpha,
    phase,
    progress: progress ?? 0,
    xRatio: progress === null ? 0 : 0.08 + progress * 0.84,
    yRatio: progress === null ? 0.72 : 0.72 - altitude * 0.52,
  };
}

// warmColor/alpha describe the sunlit side's tint; sunSide moves east->west
// between 06:00 and 19:00. Direct sun is weather-gated, while the sky/night
// timeline itself remains visible under clouds and the separate storm overlay.
function getSunLightVisualState(timeMinutes) {
  const visual = getDayNightVisualState(timeMinutes);
  const astronomy = getAstronomyVisualDay();
  const sunrise = Number(astronomy.sunriseMinutes) || 6 * 60;
  const sunset = Number(astronomy.sunsetMinutes) || 18 * 60;
  const sunSide = Math.max(0, Math.min(1, (visual.minute - sunrise) / Math.max(1, sunset - sunrise)));
  return {
    active: isClearSkyCondition() && visual.sunAlpha > 0.005,
    warmColor: visual.warmColor,
    shadowColor: SUN_SHADOW_COLOR,
    alpha: visual.sunAlpha,
    sunSide,
    sunsetStrength: visual.sunsetStrength,
  };
}

// Cloud cover scales with the weather, the same way getRainEffectTier() scales
// rain: a handful of thin clouds even on a clear day, building up through
// cloudy/showers/heavy-rain, to a thick dark deck under black rainstorm
// warning or a severe typhoon signal - mirrors getRainEffectTier()'s exact
// condition/rainWarning/typhoonStage thresholds so the cloud deck, rain, sky
// darkening and lightning frequency all read as one coherent sky, not four
// independently-rolled effects.
function getCloudDensityTier() {
  const weather = city.weather;
  if (!weather) return 'minimal';
  if (['signal8', 'signal9', 'signal10'].includes(weather.typhoonStage)) return 'extreme';
  if (weather.rainWarning === 'black') return 'extreme';
  if (weather.typhoonStage === 'signal3' || weather.rainWarning === 'red') return 'heavy';
  if (weather.rainWarning === 'amber' || weather.condition === 'heavyRain') return 'heavy';
  if (weather.condition === 'showers') return 'moderate';
  if (weather.condition === 'cloudy' || weather.condition === 'windy') return 'light';
  return 'minimal'; // clear, hot, cool
}

// Rain particle intensity tier — shares the same thresholds as getWeatherOverlayAlpha()
// so the sky dimming, rainfall, and lightning frequency all read as one coherent storm.
function getRainEffectTier() {
  const weather = city.weather;
  if (!weather) return 'none';
  if (['signal8', 'signal9', 'signal10'].includes(weather.typhoonStage)) return 'extreme';
  if (weather.rainWarning === 'black') return 'extreme';
  if (weather.typhoonStage === 'signal3' || weather.rainWarning === 'red') return 'heavy';
  if (weather.rainWarning === 'amber' || weather.condition === 'heavyRain') return 'moderate';
  if (weather.condition === 'showers') return 'light';
  return 'none';
}

// Sea state (wave height/roughness) tracks wind speed directly, the same windKph the
// typhoon warning signal is derived from (getTyphoonStageForWind) - real wave height
// scales with wind speed and fetch, not rainfall, so this deliberately keys off wind
// rather than reusing getCloudDensityTier()/getRainEffectTier()'s rain-based bands.
// A calm day can still be gray and drizzly (light rain, flat sea); a dry Signal 8
// still whips up violent seas well before any rain warning fires.
function getSeaStateTier() {
  const weather = city.weather;
  if (!weather) return 'minimal';
  const wind = weather.windKph || 0;
  if (['signal8', 'signal9', 'signal10'].includes(weather.typhoonStage) || wind >= 63) return 'extreme';
  if (weather.typhoonStage === 'signal3' || wind >= 41) return 'heavy';
  if (wind >= 30) return 'moderate';
  if (wind >= 20 || weather.condition === 'windy') return 'light';
  return 'minimal';
}

// Delay range (ms) between lightning strikes, or null when conditions don't warrant
// thunder — only red rainstorm warning / Signal No.3+ and above qualify, matching how
// amber/plain heavy rain in Hong Kong is usually thunder-free.
function getLightningDelayRangeMs() {
  const weather = city.weather;
  if (!weather) return null;
  if (['signal9', 'signal10'].includes(weather.typhoonStage)) return [4000, 10000];
  if (weather.typhoonStage === 'signal8' || weather.rainWarning === 'black') return [8000, 20000];
  if (weather.typhoonStage === 'signal3' || weather.rainWarning === 'red') return [20000, 45000];
  return null;
}

function getWeatherTrafficMultiplier() {
  const weather = city.weather;
  if (!weather) return 1;
  if (weather.typhoonStage === 'signal10' || weather.typhoonStage === 'signal9') return 0.6;
  if (weather.typhoonStage === 'signal8') return 0.72;
  if (weather.condition === 'heavyRain') return 1.28;
  if (weather.condition === 'showers' || weather.condition === 'windy') return 1.1;
  return 1;
}

function getWeatherPollutionMultiplier() {
  const rainfall = Number(city.weather?.rainfallMm ?? 0);
  if (rainfall >= 60) return 0.72;
  if (rainfall >= 20) return 0.84;
  if (rainfall > 0) return 0.94;
  return 1;
}

// 0..1 disaster-readiness pressure derived from current storm intensity, used by the
// council need-scoring model (council-policy-preview.js) in place of the old stored
// typhoonStrength field.
function getTyphoonDisasterPressure() {
  const weather = city.weather;
  if (!weather?.typhoonActive) return 0;
  return weatherClamp((weather.typhoonWindKph ?? 0) / 150, 0, 1);
}

function getUrgentWeatherNews() {
  const weather = city.weather;
  if (!weather) return null;
  const cityName = city.name || getDefaultCityName();
  const name = getTyphoonDisplayName(weather.typhoonName || '');
  if (weather.typhoonStage === 'signal10') {
    return t('news.weather.typhoon10', { city: cityName, name, wind: String(weather.windKph) });
  }
  if (weather.typhoonStage === 'signal9') {
    return t('news.weather.typhoon9', { city: cityName, name, wind: String(weather.windKph) });
  }
  if (weather.typhoonStage === 'signal8') {
    return t('news.weather.typhoon8', { city: cityName, name, wind: String(weather.windKph) });
  }
  if (weather.typhoonStage === 'signal3') {
    return t('news.weather.typhoon3', { city: cityName, name });
  }
  if (weather.rainWarning === 'black') {
    return t('news.weather.rainstormBlack', { city: cityName, rain: String(weather.rainfallMm) });
  }
  if (weather.rainWarning === 'red') {
    return t('news.weather.rainstormRed', { city: cityName, rain: String(weather.rainfallMm) });
  }
  return null;
}

function buildWeatherTickerCandidates() {
  const weather = city.weather;
  if (!weather) return [];
  const cityName = city.name || getDefaultCityName();
  const shared = {
    city: cityName,
    name: getTyphoonDisplayName(weather.typhoonName || ''),
    temp: String(weather.temperatureC),
    rain: String(weather.rainfallMm),
    wind: String(weather.windKph),
  };

  if (weather.typhoonStage === 'signal1') {
    return [{ id: 'weather-typhoon-signal1', weight: 10, text: t('news.weather.typhoonApproaching', shared) }];
  }
  if (weather.typhoonStage === 'signal3') {
    return [{ id: 'weather-typhoon-signal3', weight: 10, text: t('news.weather.typhoon3', shared) }];
  }
  if (weather.typhoonStage === 'signal8' || weather.typhoonStage === 'signal9' || weather.typhoonStage === 'signal10') {
    return [{ id: `weather-typhoon-${weather.typhoonStage}`, weight: 12, text: t(`news.weather.${weather.typhoonStage === 'signal8' ? 'typhoon8' : weather.typhoonStage === 'signal9' ? 'typhoon9' : 'typhoon10'}`, shared) }];
  }
  if (weather.condition === 'heavyRain') {
    return [{ id: 'weather-heavy-rain', weight: 9, text: t('news.weather.heavyRain', shared) }];
  }
  if (weather.condition === 'hot') {
    return [{ id: 'weather-hot', weight: 7, text: t('news.weather.hot', shared) }];
  }
  if (weather.condition === 'cool') {
    return [{ id: 'weather-cool', weight: 6, text: t('news.weather.cool', shared) }];
  }
  return [{ id: `weather-${weather.condition}`, weight: 4, text: t('news.weather.general', shared) }];
}
