// ── HUD update (called every sim tick) ────────────────────────────────────────

let lastMetricHistoryLabel = null;

function updateHUD() {
  const name = city.name || getDefaultCityName();
  const rating = starsDisplay(city.happiness);
  setTextContent('hud-city-name',     name);
  setTextContent('topbar-city-name',  name);
  setTextContent('hud-money',  formatMoney(city.budget));
  setTextContent('hud-pop',    t('hud.pop', { population: city.population.toLocaleString() }));
  setTextContent('hud-date',   formatCityDate(city.day, city.month, city.year));
  setTextContent('topbar-date-zh', formatTopbarDateZh(city.year, city.month, city.day));
  setTextContent('topbar-date-en', formatTopbarDateEn(city.year, city.month, city.day));
  setTextContent('topbar-time', getPseudoClockTime(city.year, city.month, city.day));
  setTextContent('topbar-funds', formatMoney(city.budget));
  setTextContent('topbar-income', `+${formatMoney(city.monthlyIncome)}`);
  setTextContent('topbar-expense', `-${formatMoney(city.monthlyExpenses)}`);
  setTextContent('topbar-population', city.population.toLocaleString());
  setTextContent('topbar-rating', rating);
  setTextContent('hud-education-basic', t('hud.educationBasic', { value: `${Math.round((city.educationBasicIndex ?? 0) * 100)}%` }));
  setTextContent('hud-education-higher', t('hud.educationHigher', { value: `${Math.round((city.educationHigherIndex ?? 0) * 100)}%` }));
  setTextContent('hud-science-share', t('hud.scienceIndustry', { value: `${Math.round((city.scienceIndustryShare ?? 0) * 100)}%` }));
  setTextContent('hud-stars',  rating);
  setTextContent('hud-income',         `+${formatMoney(city.monthlyIncome)}`);
  setTextContent('hud-expense',        `-${formatMoney(city.monthlyExpenses)}`);
  setTextContent('hud-income-detail',  `+${formatMoney(city.monthlyIncome)}`);
  setTextContent('hud-expense-detail', `-${formatMoney(city.monthlyExpenses)}`);
  updateCityDevelopmentIndex();

  updateDemandBar('bar-r', city.demandR, '#44cc55');
  updateDemandBar('bar-c', city.demandC, '#4488ff');
  updateDemandBar('bar-i', city.demandI, '#ffcc00');

  updateBudgetStrip();
  updateStatusAlert();
  updateTaxDisplay();
  updateBudgetControls();
  updateBudgetWindow();
  updateMetricCharts();
  if (typeof updateChartWindow === 'function') updateChartWindow();
  if (typeof updateMiniMap === 'function') updateMiniMap();

  // Highlight budget in red when near-bankrupt
  const moneyEl = document.getElementById('hud-money');
  if (moneyEl) {
    moneyEl.classList.toggle('hud-danger', city.budget < 0);
    moneyEl.classList.toggle('hud-warning', city.budget >= 0 && city.budget < 1000);
  }
}

function updateCityDevelopmentIndex() {
  const livability = clampIndex(Math.round((city.happiness ?? 0) * 100));
  const economy = clampIndex(Math.round(45 + Math.min(55, (city.monthlyIncome - city.monthlyExpenses) / 3000)));
  const environment = clampIndex(Math.round(52 + ((city.educationBasicIndex ?? 0) * 28) - ((city.pollutionIndex ?? 0.1) * 24)));
  const transport = clampIndex(Math.round(58 + ((city.roadCoverageIndex ?? 0.2) * 34)));
  const overall = clampIndex(Math.round((livability + economy + environment + transport) / 4));

  setIndexValue('hud-index-livability', livability);
  setIndexValue('hud-index-economy', economy);
  setIndexValue('hud-index-environment', environment);
  setIndexValue('hud-index-transport', transport);
  setIndexValue('hud-index-overall', overall);
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

  ctx.fillStyle = '#f0ecdc';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(110,105,90,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  if (!Array.isArray(series) || series.length === 0) return;

  const points = series.slice(-60).map((entry) => Math.max(0, Math.min(1, Number(entry?.value ?? 0))));
  if (points.length < 2) {
    const y = Math.round((1 - points[0]) * (height - 10)) + 5;
    ctx.fillStyle = lineColor;
    ctx.fillRect(width - 4, y - 1, 3, 3);
    return;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(0.08, max - min);
  const normalize = (v) => (v - min) / range;

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((value, index) => {
    const x = 4 + (index / (points.length - 1)) * (width - 8);
    const y = 4 + (1 - normalize(value)) * (height - 8);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// ── Budget strip (bottom bar) ─────────────────────────────────────────────────

function updateBudgetStrip() {
  const el = document.getElementById('budget-strip-balance');
  if (el) el.textContent = formatMoney(city.budget);
}

function updateStatusAlert() {
  const alertEl = document.getElementById('status-alert-text');
  const iconEl = document.getElementById('status-alert-icon');
  const mainIconEl = document.getElementById('status-main-icon');
  if (!alertEl) return;

  const warning = getPowerPlantTickerWarning();
  if (warning) {
    alertEl.textContent = warning;
    if (iconEl) iconEl.textContent = '⚠';
    if (mainIconEl) mainIconEl.textContent = '📉';
    return;
  }

  alertEl.textContent = t('tip.1');
  if (iconEl) iconEl.textContent = '✓';
  if (mainIconEl) mainIconEl.textContent = '📈';
}

function updateTaxDisplay() {
  const el = document.getElementById('tax-rate-display');
  if (el) el.textContent = `${Math.round(city.taxRate * 100)}%`;
}

function updateBudgetControls() {
  normalizeCityFinanceState();
  Object.entries(city.departmentBudgets).forEach(([key, value]) => {
    const slider = document.querySelector(`[data-budget-key="${key}"]`);
    const output = document.getElementById(`budget-${key}-value`);
    if (slider && document.activeElement !== slider) slider.value = String(value);
    if (output) output.textContent = `${value}%`;
  });

  document.querySelectorAll('[data-policy-id]').forEach((button) => {
    button.classList.toggle('is-active', isPolicyActive(button.dataset.policyId));
  });

  setTextContent('budget-debt-total', formatMoney(getTotalDebt()));
  setTextContent('budget-credit-rating', city.creditRating || updateCreditRating());
  setTextContent('budget-policy-cost', `${formatMoney(city.lastPolicyCost || getPolicyMonthlyCost())}/mo`);
  setTextContent('budget-loan-cost', `${formatMoney(city.lastLoanPayment || getMonthlyLoanDue())}/mo`);
}

// ── Demand bars ───────────────────────────────────────────────────────────────

function updateDemandBar(id, value, positiveColor) {
  const fill = document.getElementById(id);
  if (!fill) return;

  const trackHeight = 56; // px — matches CSS .demand-bar-track height
  const half = trackHeight / 2;
  const barHeight = Math.abs(value) * half;

  if (value >= 0) {
    fill.style.height     = `${barHeight}px`;
    fill.style.top        = `${half - barHeight}px`;
    fill.style.bottom     = 'auto';
    fill.style.background = positiveColor;
  } else {
    fill.style.height     = `${barHeight}px`;
    fill.style.top        = `${half}px`;
    fill.style.bottom     = 'auto';
    fill.style.background = '#cc3333';
  }
}

// ── Star rating ───────────────────────────────────────────────────────────────

function starsDisplay(happiness) {
  const full    = Math.round(happiness * 5);
  const clamped = Math.max(1, Math.min(5, full));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}

// ── City news feed ────────────────────────────────────────────────────────────

const cityNewsFeed = [];
const NEWS_MAX = 25;

function addCityNews(text) {
  const day   = (city && city.day)   ? city.day   : 1;
  const month = (city && city.month) ? city.month : 1;
  const year  = (city && city.year)  ? city.year  : 1900;
  cityNewsFeed.unshift({ text, date: formatCityDate(day, month, year) });
  if (cityNewsFeed.length > NEWS_MAX) cityNewsFeed.pop();
}

// ── Toast notifications ───────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  addCityNews(message);

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Fade out and remove after 2.8s
  setTimeout(() => toast.classList.add('toast-fade'), 2300);
  setTimeout(() => toast.remove(), 2800);
}

// ── Budget panel init (one-time setup) ───────────────────────────────────────

function initBudgetPanel() {
  const panel = document.getElementById('budget-panel');
  const statusMoreBtn = document.getElementById('status-more-btn');
  const statusPillBtn = document.getElementById('status-pill');
  const slider = document.getElementById('tax-slider');

  if (panel) {
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.addEventListener('click', (e) => e.stopPropagation());
  }

  const toggleBudgetDetail = () => {
    const detail = document.getElementById('budget-detail');
    if (detail) detail.classList.toggle('is-open');
  };

  statusMoreBtn?.addEventListener('click', toggleBudgetDetail);
  statusPillBtn?.addEventListener('click', toggleBudgetDetail);

  document.getElementById('budget-open-window')?.addEventListener('click', () => {
    openBudgetWindow();
  });

  if (slider) {
    slider.value = String(Math.round(city.taxRate * 100));
    slider.addEventListener('input', () => {
      city.taxRate = Math.max(TAX_RATE_MIN, Math.min(TAX_RATE_MAX, Number(slider.value) / 100));
      updateDemand();
      updateTaxDisplay();
    });
  }

  document.querySelectorAll('[data-budget-key]').forEach((budgetSlider) => {
    budgetSlider.addEventListener('input', () => {
      normalizeCityFinanceState();
      const key = budgetSlider.dataset.budgetKey;
      city.departmentBudgets[key] = clampDepartmentBudget(budgetSlider.value);
      computeHappiness(activeScene);
      updateDemand();
      updateBudgetControls();
    });
  });

  document.querySelectorAll('[data-loan-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const loan = takeCityLoan(Number(button.dataset.loanOption));
      if (!loan) return;
      showToast(t('toast.loanTaken', { amount: formatMoney(loan.amount) }), 'info');
      updateHUD();
    });
  });

  document.querySelectorAll('[data-policy-id]').forEach((button) => {
    button.addEventListener('click', () => {
      normalizeCityFinanceState();
      const id = button.dataset.policyId;
      city.activePolicies[id] = !city.activePolicies[id];
      computeHappiness(activeScene);
      updateDemand();
      showToast(t(city.activePolicies[id] ? 'toast.policyEnabled' : 'toast.policyDisabled', {
        policy: t(`policy.${id}.title`),
      }), 'info');
      updateHUD();
    });
  });

  updateHUD();
  initMetricCharts();
  setupHudPanelToggles();
  startTicker();
  setupBudgetWindow();

  // Wire overlay map buttons
  if (typeof initOverlayControls === 'function') initOverlayControls();
}

function getBudgetWindowSnapshots() {
  const currentLoan = city.lastLoanPayment || getMonthlyLoanDue();
  const current = city.lastBudgetSnapshot || computeBudgetSnapshot({ loanPayment: currentLoan });
  const projected = computeBudgetSnapshot({ loanPayment: getMonthlyLoanDue() });
  return {
    current,
    projected,
    estimatedTreasury: city.budget + projected.annualNet,
  };
}

function updateBudgetWindow() {
  const win = document.getElementById('budget-window');
  if (!win) return;

  const { current, projected, estimatedTreasury } = getBudgetWindowSnapshots();

  setTextContent('budget-income-residential', formatMoney(current.income.residentialTax));
  setTextContent('budget-income-commercial', formatMoney(current.income.commercialTax));
  setTextContent('budget-income-industrial', formatMoney(current.income.industrialTax));
  setTextContent('budget-income-policy-adjust', formatMoney(current.income.policyAdjustment));
  setTextContent('budget-income-total', formatMoney(current.totalIncome));

  setTextContent('budget-expense-roads', formatMoney(current.expenses.roads));
  setTextContent('budget-expense-fire', formatMoney(current.expenses.fire));
  setTextContent('budget-expense-police', formatMoney(current.expenses.police));
  setTextContent('budget-expense-power', formatMoney(current.expenses.power));
  setTextContent('budget-expense-education', formatMoney(current.expenses.education ?? 0));
  setTextContent('budget-expense-parks', formatMoney(current.expenses.parks));
  setTextContent('budget-expense-policy', formatMoney(current.expenses.policy));
  setTextContent('budget-expense-loans', formatMoney(current.expenses.loans));
  setTextContent('budget-expense-total', formatMoney(current.totalExpenses));

  setTextContent('budget-net-monthly', formatMoney(current.net));
  setTextContent('budget-net-projected', formatMoney(projected.net));
  setTextContent('budget-net-annual', formatMoney(projected.annualNet));
  setTextContent('budget-estimated-treasury', formatMoney(estimatedTreasury));

  const netEl = document.getElementById('budget-net-monthly');
  const projectedEl = document.getElementById('budget-net-projected');
  [netEl, projectedEl].forEach((el) => {
    if (!el) return;
    el.classList.toggle('budget-positive', Number(el.textContent?.replace(/[^0-9-]/g, '')) >= 0);
    el.classList.toggle('budget-negative', Number(el.textContent?.replace(/[^0-9-]/g, '')) < 0);
  });
}

function setupBudgetWindow() {
  const win = document.getElementById('budget-window');
  const titlebar = document.getElementById('budget-window-titlebar');
  const closeBtn = document.getElementById('budget-window-close');
  const minBtn = document.getElementById('budget-window-min-btn');
  if (!win || !titlebar || !closeBtn) return;

  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('click', (e) => e.stopPropagation());

  closeBtn.addEventListener('click', () => closeBudgetWindow());
  minBtn?.addEventListener('click', () => {
    win.classList.toggle('is-collapsed');
    minBtn.textContent = win.classList.contains('is-collapsed') ? '+' : '−';
  });

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  titlebar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#budget-window-close') || e.target.closest('#budget-window-min-btn')) return;
    dragging = true;
    const rect = win.getBoundingClientRect();
    win.style.left = `${rect.left}px`;
    win.style.top = `${rect.top}px`;
    win.style.right = 'auto';
    win.style.bottom = 'auto';
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    titlebar.setPointerCapture(e.pointerId);
  });

  titlebar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const width = win.offsetWidth;
    const height = win.offsetHeight;
    const maxX = Math.max(0, window.innerWidth - width);
    const maxY = Math.max(0, window.innerHeight - height);
    const nextLeft = Math.max(0, Math.min(maxX, e.clientX - offsetX));
    const nextTop = Math.max(0, Math.min(maxY, e.clientY - offsetY));
    win.style.left = `${nextLeft}px`;
    win.style.top = `${nextTop}px`;
  });

  titlebar.addEventListener('pointerup', () => {
    dragging = false;
  });
}

function openBudgetWindow() {
  document.getElementById('budget-window')?.classList.add('is-open');
  updateBudgetWindow();
}

function closeBudgetWindow() {
  document.getElementById('budget-window')?.classList.remove('is-open');
}

function toggleBudgetWindow(forceOpen = false) {
  const win = document.getElementById('budget-window');
  if (!win) return;
  if (forceOpen) {
    openBudgetWindow();
    return;
  }
  win.classList.toggle('is-open');
  if (win.classList.contains('is-open')) updateBudgetWindow();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoney(amount) {
  const abs = Math.abs(Math.round(amount));
  return `${amount < 0 ? '-' : ''}$${abs.toLocaleString()}`;
}

function setTextContent(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatCityDate(day, month, year) {
  const safeDay = Number.isFinite(Number(day)) ? Number(day) : 1;
  const safeMonth = Number.isFinite(Number(month)) ? Number(month) : 1;
  const safeYear = Number.isFinite(Number(year)) ? Number(year) : 1900;
  return t('hud.dateFormat', {
    day: String(safeDay),
    month: tMonth(safeMonth),
    year: String(safeYear),
  });
}

// ── Scrolling tips ticker (走馬燈) ─────────────────────────────────────────

const GAMEPLAY_TIP_KEYS = Array.from({ length: 23 }, (_, index) => `tip.${index + 1}`);
let tickerShowNextTip = null;

function startTicker() {
  const track = document.getElementById('tip-ticker-track');
  const inner = document.getElementById('tip-ticker-inner');
  if (!track || !inner) return;

  // Shuffle once so order varies each session
  const tips = [...GAMEPLAY_TIP_KEYS].sort(() => Math.random() - 0.5);
  let idx = 0;

  function showNextTip() {
    const warning = getPowerPlantTickerWarning();
    const text = warning ?? t(tips[idx++ % tips.length]);
    inner.textContent = text;

    // Measure actual rendered width after setting content
    const trackW   = track.offsetWidth;
    const textW    = inner.scrollWidth;
    const SPEED    = 72;                          // px/s — 60 % of original 120 px/s
    const duration = (trackW + textW) / SPEED;

    // Snap to just off the right edge (no transition), then glide left
    inner.style.transition = 'none';
    inner.style.left = trackW + 'px';
    void inner.offsetLeft;                        // force reflow
    inner.style.transition = `left ${duration}s linear`;
    inner.style.left = `-${textW}px`;
  }

  tickerShowNextTip = showNextTip;
  showNextTip();
  inner.addEventListener('transitionend', showNextTip);
}

function getPowerPlantTickerWarning() {
  const plant = Object.values(buildingData).find((record) => POWER_PLANT_STATS[record.type] && isPowerPlantNearRetirement(record));
  if (plant) {
    const remaining = getPowerPlantRemainingMonths(plant);
    const label = plant.type === 'power_plant_coal' ? t('building.coalPlant') : t('building.solarPlant');
    return `${label} · ${t('inspect.powerWarning')} · ${t('inspect.powerRemaining', { remaining })}`;
  }

  if ((city.totalPowerSupply ?? 0) < (city.totalPowerDemand ?? 0) && (city.totalPowerDemand ?? 0) > 0) {
    return t('inspect.powerShortage', {
      supply: city.totalPowerSupply ?? 0,
      demand: city.totalPowerDemand ?? 0,
    });
  }

  return null;
}

document.addEventListener('languagechange', () => {
  if (tickerShowNextTip) tickerShowNextTip();
});
