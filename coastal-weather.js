// Real-time HKO bulletin, independent of the simulated city's weather.
const COASTAL_REFRESH_MS = 2 * 60 * 60 * 1000;
let coastalSessionActive = false;
let coastalSessionGeneration = 0;
let coastalRefreshTimer = null;
let coastalLastAttempt = 0;
let coastalCachedReport = null;

function coastalText(value) {
  return typeof value === 'string' ? value.trim().replace(/香港/g, '香城').replace(/北部灣/g, '東京灣') : '';
}

function coastalSentence(value) {
  const text = coastalText(value);
  return text ? text.replace(/[。．.]+$/, '') + '。' : '';
}

function coastalLocation(value) {
  const text = coastalText(value);
  return text ? text.replace(/[。．.，,]+$/, '') + '，' : '';
}

function buildCoastalBroadcast(report) {
  if (!report || !Number.isFinite(Date.parse(report.updateTime)) || !Array.isArray(report.weatherForecast?.data)) return [];
  const sections = [
    '現在播送華南海域天氣報告。'
      + (coastalText(report.warnings) ? '海域警告：' + coastalSentence(report.warnings) : '')
      + (coastalText(report.generalSituation) ? '天氣概況：' + coastalSentence(report.generalSituation) : '')
      + coastalSentence(report.tcInfo),
  ];
  report.weatherForecast.data.forEach((row, index) => {
    sections.push((index === 0 ? '以下是其後二十四小時各區天氣預測。' : '')
      + coastalLocation(row.locationName) + coastalSentence(row.windInfo)
      + coastalSentence(row.weatherDescription) + coastalSentence(row.seaSituation));
  });
  if (coastalText(report.weatherOutlook?.info)) {
    sections.push('其後四十八小時天氣展望。' + coastalSentence(report.weatherOutlook.info));
  }
  (Array.isArray(report.weatherReport?.data) ? report.weatherReport.data : []).forEach((row, index) => {
    const visibility = row.visibilityInfo;
    const hasVisibility = visibility?.value !== '' && visibility?.value != null && Number.isFinite(Number(visibility.value));
    sections.push((index === 0 ? '以下是華南沿岸各站最新天氣報告。' : '')
      + coastalLocation(row.locationName) + coastalSentence(row.windInfo) + coastalSentence(row.weatherDescription)
      + (hasVisibility ? `能見度${visibility.value}${coastalText(visibility.unit)}。` : ''));
  });
  return ['【881香城電台第一台】' + sections.map(coastalText).join('')
    + '報告完畢。資料來源：香港天文台；播報地名按遊戲設定改寫。'];
}

function coastalMonthIndex() { return Number(city.year) * 12 + Number(city.month) - 1; }

function updateCoastalWeatherPanel() {
  const panel = document.getElementById('weather-coastal-report');
  if (!panel) return;
  const text = coastalCachedReport ? buildCoastalBroadcast(coastalCachedReport)[0] : '';
  panel.textContent = text || t('weather.coastal.unavailable');
}

function hasCoastalBroadcastShelter() {
  return typeof getTyphoonShelterState === 'function'
    && getTyphoonShelterState().shelters.some(shelter => shelter.status === 'built' || shelter.status === 'operational');
}

function ensureCoastalCityState() {
  const month = coastalMonthIndex();
  const state = city.coastalWeather;
  if (!state || !Number.isSafeInteger(state.lastBroadcastMonth) || state.lastBroadcastMonth > month) {
    city.coastalWeather = { lastBroadcastMonth: month, pending: [] };
  }
  if (!Array.isArray(city.coastalWeather.pending)) city.coastalWeather.pending = [];
  city.coastalWeather.pending = city.coastalWeather.pending.filter(text => typeof text === 'string').slice(0, 30)
    .map(text => text.replace(/以下資料於現實時間[^。]*發布。/g, ''));
  // Upgrade queued bulletins from older saves to the single-paragraph format.
  if (city.coastalWeather.pending.some(text => /【(?:華南海域天氣報告|881香城電台第一台)】/.test(text))) {
    city.coastalWeather.pending = ['【881香城電台第一台】' + city.coastalWeather.pending
      .map(text => text.replace(/【(?:華南海域天氣報告|881香城電台第一台)】/g, '')).join('')];
  }
  if (!hasCoastalBroadcastShelter()) city.coastalWeather.pending = [];
  return city.coastalWeather;
}

async function refreshCoastalWeather() {
  const generation = coastalSessionGeneration;
  coastalLastAttempt = Date.now();
  try {
    const response = await fetch('/api/weather/coastal', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return;
    const payload = await response.json();
    if (!buildCoastalBroadcast(payload.report).length || generation !== coastalSessionGeneration || !coastalSessionActive) return;
    coastalCachedReport = payload.report;
    updateCoastalWeatherPanel();
    try { localStorage.setItem('hko-coastal-report-v1', JSON.stringify(payload.report)); } catch (_) { /* Storage is optional. */ }
  } catch (_) { /* Keep the last successful bulletin offline. */ }
}

function stopCoastalWeatherSession() {
  coastalSessionActive = false;
  coastalSessionGeneration += 1;
  if (coastalRefreshTimer) clearInterval(coastalRefreshTimer);
  coastalRefreshTimer = null;
}

function startCoastalWeatherSession() {
  stopCoastalWeatherSession();
  coastalSessionActive = true;
  ensureCoastalCityState();
  if (!coastalCachedReport) {
    try {
      const cached = JSON.parse(localStorage.getItem('hko-coastal-report-v1'));
      if (buildCoastalBroadcast(cached).length) coastalCachedReport = cached;
    } catch (_) { /* First launch or unavailable storage. */ }
  }
  updateCoastalWeatherPanel();
  refreshCoastalWeather();
  coastalRefreshTimer = setInterval(checkCoastalRefresh, COASTAL_REFRESH_MS);
}

function checkCoastalRefresh() {
  if (coastalSessionActive && Date.now() - coastalLastAttempt >= COASTAL_REFRESH_MS) refreshCoastalWeather();
}

function queueQuarterlyCoastalWeather() {
  if (!coastalSessionActive) return;
  const state = ensureCoastalCityState();
  const month = coastalMonthIndex();
  if (month - state.lastBroadcastMonth < 3) return;
  // Advance by complete quarters, preserving the original three-month cadence.
  state.lastBroadcastMonth += Math.floor((month - state.lastBroadcastMonth) / 3) * 3;
  state.pending = hasCoastalBroadcastShelter() && coastalCachedReport ? buildCoastalBroadcast(coastalCachedReport) : [];
}

function takePendingCoastalTickerHeadline() {
  if (!coastalSessionActive) return null;
  const text = ensureCoastalCityState().pending.shift();
  return text ? { id: 'coastal-weather', text } : null;
}

onGameClockEvent('gameclock:month', queueQuarterlyCoastalWeather);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkCoastalRefresh(); });
window.addEventListener('focus', checkCoastalRefresh);
