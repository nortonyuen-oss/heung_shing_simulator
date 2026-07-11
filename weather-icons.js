// Icon helpers for the topbar weather chip and legend dialog. General condition
// icons (sun/cloud/rain/spiral) are drawn inline as SVG; tropical cyclone signal
// and rainstorm warning badges use the official-style artwork in UI/weatherSignals/
// (supplied by the project, referencing Hong Kong Observatory pictograms).

function svgWrap(inner, viewBox = '0 0 40 40') {
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

// ── General condition icons (晴 / 陰 / 雨 / 颱風) ───────────────────────────

function weatherConditionIconSvg(bucket) {
  if (bucket === 'typhoon') {
    return '<span class="weather-emoji-icon">🌀</span>';
  }
  if (bucket === 'rain') {
    return svgWrap(`
      <path d="M11,22 a7,7 0 0,1 1,-13.9 a9,9 0 0,1 17,-1.6 a7,7 0 0,1 2,15.5 z" fill="#8a97a8"/>
      <path d="M15,26 l-2,5" stroke="#3f6fb0" stroke-width="2" stroke-linecap="round"/>
      <path d="M21,26 l-2,5" stroke="#3f6fb0" stroke-width="2" stroke-linecap="round"/>
      <path d="M27,26 l-2,5" stroke="#3f6fb0" stroke-width="2" stroke-linecap="round"/>
    `);
  }
  if (bucket === 'cloudy') {
    return svgWrap(`
      <path d="M10,26 a7,7 0 0,1 1,-13.9 a9,9 0 0,1 17,-1.6 a7,7 0 0,1 2,15.5 z" fill="#aab3bf"/>
    `);
  }
  // clear
  return svgWrap(`
    <circle cx="20" cy="20" r="8" fill="#ffb703"/>
    <g stroke="#ffb703" stroke-width="2.5" stroke-linecap="round">
      <line x1="20" y1="3" x2="20" y2="8"/>
      <line x1="20" y1="32" x2="20" y2="37"/>
      <line x1="3" y1="20" x2="8" y2="20"/>
      <line x1="32" y1="20" x2="37" y2="20"/>
      <line x1="7.5" y1="7.5" x2="11" y2="11"/>
      <line x1="29" y1="29" x2="32.5" y2="32.5"/>
      <line x1="7.5" y1="32.5" x2="11" y2="29"/>
      <line x1="29" y1="11" x2="32.5" y2="7.5"/>
    </g>
  `);
}

function getWeatherConditionBucket(weather) {
  if (!weather) return 'clear';
  const stage = weather.typhoonStage;
  if (stage && stage !== 'none') return 'typhoon';
  if (weather.condition === 'showers' || weather.condition === 'heavyRain') return 'rain';
  if (weather.condition === 'cloudy' || weather.condition === 'windy') return 'cloudy';
  return 'clear';
}

// ── HKO-style tropical cyclone signal badges ────────────────────────────────
// The simulation doesn't track storm bearing, so the single (non-directional)
// artwork is used for No.8 rather than the four NE/NW/SE/SW quadrant variants.

const TYPHOON_SIGNAL_ICON_SRC = {
  signal1: 'UI/weatherSignals/typhoon1.png',
  signal3: 'UI/weatherSignals/typhoon3.png',
  signal8: 'UI/weatherSignals/typhoon8NW.png',
  signal9: 'UI/weatherSignals/typhoon9.png',
  signal10: 'UI/weatherSignals/typhoon10.png',
};

const TYPHOON_SIGNAL_NUMBER = { signal1: '1', signal3: '3', signal8: '8', signal9: '9', signal10: '10' };
const TYPHOON_SIGNAL_LABEL_KEY = {
  signal1: 'weather.signal.standby',
  signal3: 'weather.signal.strongWind',
  signal8: 'weather.signal.galeStorm',
  signal9: 'weather.signal.increasingGale',
  signal10: 'weather.signal.hurricane',
};

function typhoonSignalIconSvg(signalId) {
  const src = TYPHOON_SIGNAL_ICON_SRC[signalId];
  if (!src) return '';
  return `<img src="${src}" alt="" class="weather-signal-img" />`;
}

// ── HKO-style rainstorm warning badges (Amber / Red / Black) ────────────────
// Source art includes the cloud pictogram plus a text label; the badge crops to
// the cloud only via object-fit, while the legend dialog shows the full image.

const RAINSTORM_ICON_SRC = {
  amber: 'UI/weatherSignals/yellowRainstorm.png',
  red: 'UI/weatherSignals/redRainstorm.png',
  black: 'UI/weatherSignals/blackRainstorm.png',
};
const RAINSTORM_LABEL_KEY = {
  amber: 'weather.rainstorm.amber',
  red: 'weather.rainstorm.red',
  black: 'weather.rainstorm.black',
};

function rainstormWarningIconSvg(level) {
  const src = RAINSTORM_ICON_SRC[level];
  if (!src) return '';
  return `<img src="${src}" alt="" class="weather-rainstorm-img" />`;
}
