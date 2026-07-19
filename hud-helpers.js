let lastMetricHistoryLabel = null;

function updateCityDevelopmentIndex() {
  const livability = clampIndex(Math.round((city.happiness ?? 0) * 100));

  const economy = getCityEconomyIndex();

  const pollutionRatio = Math.max(0, Math.min(1, Number(city.pollution ?? 0) / 200));
  const environment = clampIndex(Math.round(52 + ((city.educationBasicIndex ?? 0) * 28) - (pollutionRatio * 24)));
  // Transport score: road coverage lifts the base; congestion drags it down
  const roadCov   = city.trafficCoverage ?? 0.2;
  const congestion = city.trafficIndex ?? 0;
  const transport = clampIndex(Math.round(58 + roadCov * 34 - congestion * 22));
  const overall = clampIndex(Math.round((livability + economy + environment + transport) / 4));

  setIndexValue('hud-index-livability', livability);
  setIndexValue('hud-index-economy', economy);
  setIndexValue('hud-index-environment', environment);
  setIndexValue('hud-index-transport', transport);
  setIndexValue('hud-index-overall', overall);
}

function getCityEconomyIndex() {

  const net = Number(city.monthlyIncome ?? 0) - Number(city.monthlyExpenses ?? 0);
  const unemp = city.unemploymentRate ?? 0;
  const demandC = city.demandC ?? 0;
  const creditBonus = ({ A: 6, B: 3, C: 0, D: -5 })[city.creditRating] ?? 0;
  return clampIndex(Math.round(
    45
    + Math.min(40, net / 3000)            // fiscal surplus: up to +40
    + (0.5 - unemp) * 30                  // employment: −15 (high unemp) to +15 (full employ)
    + Math.max(0, demandC) * 10           // commercial demand health: 0 to +10
    + creditBonus,                        // credit rating: −5 to +6
  ));
}

function clampIndex(value) {
  return Math.max(0, Math.min(99, Number.isFinite(value) ? value : 0));
}

function setIndexValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = String(value);
  el.classList.remove('warn', 'bad');
  if (value < 40) el.classList.add('bad');
  else if (value < 60) el.classList.add('warn');
}

function updateBudgetStrip() {
  const el = document.getElementById('budget-strip-balance');
  if (el) el.textContent = formatMoney(city.budget);
}

function setupHudPanelToggles() {
  document.querySelectorAll('[data-hud-toggle]').forEach((button) => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const panel = button.closest('.hud-panel');
      if (!panel) return;
      panel.classList.toggle('is-collapsed');
      button.textContent = panel.classList.contains('is-collapsed') ? '+' : '−';
    });
  });
}

function formatTopbarDateZh(year, month, day) {
  const weekday = getWeekdayIndex(year, month, day);
  const weekdayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${year}年${month}月${day}日 ${weekdayNames[weekday]}`;
}

function formatTopbarDateEn(year, month, day) {
  const weekday = getWeekdayIndex(year, month, day);
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${monthNames[Math.max(1, Math.min(12, month)) - 1]} ${year} ${weekdayNames[weekday]}`;
}

function getWeekdayIndex(year, month, day) {
  const d = new Date(year, Math.max(0, month - 1), day);
  return Number.isNaN(d.getTime()) ? 0 : d.getDay();
}

function getPseudoClockTime(year, month, day) {
  const hour = (day * 3 + month * 2 + year) % 24;
  const minute = (day * 11 + month * 7) % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function initMetricCharts() {
  drawTrendChart('hud-chart-education', city.educationHistory, '#2a9fd6');
  drawTrendChart('hud-chart-crime', city.crimeHistory, '#c24646');
}

function updateMetricCharts() {
  const label = `${city.year}-${String(city.month).padStart(2, '0')}`;
  if (label !== lastMetricHistoryLabel) {
    lastMetricHistoryLabel = label;
    drawTrendChart('hud-chart-education', city.educationHistory, '#2a9fd6');
    drawTrendChart('hud-chart-crime', city.crimeHistory, '#c24646');
  }
}

function drawTrendChart(canvasId, series = [], lineColor = '#2a9fd6') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f7f9fc';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#ccd5df';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const values = Array.isArray(series) ? series.filter((value) => Number.isFinite(Number(value))).map(Number) : [];
  if (!values.length) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  ctx.beginPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  values.forEach((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 12) + 6;
    const normalized = (value - min) / range;
    const y = (height - 8) - normalized * (height - 16) + 4;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const lastValue = values[values.length - 1];
  ctx.fillStyle = lineColor;
  const lx = values.length === 1 ? width / 2 : ((values.length - 1) / (values.length - 1)) * (width - 12) + 6;
  const ly = (height - 8) - ((lastValue - min) / range) * (height - 16) + 4;
  ctx.beginPath();
  ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
  ctx.fill();
}
