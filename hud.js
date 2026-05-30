// ── HUD update (called every sim tick) ────────────────────────────────────────

let lastMetricHistoryLabel = null;

function updateHUD() {
  const name = city.name || getDefaultCityName();
  const rating = starsDisplay(city.happiness);
  setTextContent('topbar-city-name',  name);
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
  updateInfrastructureToolVisibility();
  updateBudgetWindow();
  updateLegislativeWindow();
  updateStockExchangeWindow();
  updateMetricCharts();
  if (typeof updateChartWindow === 'function') updateChartWindow();
  if (typeof updateMiniMap === 'function') updateMiniMap();
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
  const badgeEl = document.getElementById('status-line-badge');
  const mainIconEl = document.getElementById('status-main-icon');
  if (!badgeEl) return;

  const warning = getUrgentCityNews();
  const cityName = city.name || getDefaultCityName();
  badgeEl.textContent = t('news.badge', { city: cityName });

  if (warning) {
    badgeEl.title = warning;
    if (mainIconEl) mainIconEl.textContent = '⚠';
    return;
  }

  badgeEl.title = '';
  if (mainIconEl) mainIconEl.textContent = '📰';
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
    const policyId = button.dataset.policyId;
    const isActive = isPolicyActive(policyId);
    const isAvailable = isPolicyAvailable(policyId);
    button.hidden = !(isAvailable || isActive);
    button.disabled = !isAvailable && !isActive;
    button.classList.toggle('is-active', isActive);
  });

  setTextContent('budget-debt-total', formatMoney(getTotalDebt()));
  setTextContent('budget-credit-rating', city.creditRating || updateCreditRating());
  setTextContent('budget-policy-cost', `${formatMoney(city.lastPolicyCost || getPolicyMonthlyCost())}/mo`);
  setTextContent('budget-loan-cost', `${formatMoney(city.lastLoanPayment || getMonthlyLoanDue())}/mo`);
}

function updateInfrastructureToolVisibility() {
  const councilButtons = document.querySelectorAll('[data-tool="legislative-council"]');
  const stockExchangeButtons = document.querySelectorAll('[data-tool="stock-exchange"]');
  const canBuildCouncil = city.population >= 10000 && !hasBuildingType('legislative_council');
  const canBuildStockExchange = city.population >= 50000 && isPolicyActive('stockExchangeAct') && hasBuildingType('legislative_council') && !hasBuildingType('stock_exchange');

  const syncButtonVisibility = (button, visible) => {
    button.hidden = !visible;
    button.style.display = visible ? '' : 'none';
  };

  councilButtons.forEach((button) => {
    syncButtonVisibility(button, canBuildCouncil);
    button.disabled = !canBuildCouncil;
  });

  stockExchangeButtons.forEach((button) => {
    syncButtonVisibility(button, canBuildStockExchange);
    button.disabled = !canBuildStockExchange;
  });

  const unavailableUniqueTool = (
    (selectedTool === 'legislative-council' && !canBuildCouncil)
    || (selectedTool === 'stock-exchange' && !canBuildStockExchange)
  );
  if (unavailableUniqueTool) {
    selectedTool = 'road';
    updateToolCategoryState(document.getElementById('tool-menu'), selectedTool);
    closeToolPopups?.();
  }
}

// ── Demand bars ───────────────────────────────────────────────────────────────

function updateDemandBar(id, value, positiveColor) {
  const fill = document.getElementById(id);
  if (!fill) return;

  const track = fill.parentElement;
  const trackHeight = Math.max(1, track?.clientHeight || 56);
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

  document.getElementById('legislative-open-window')?.addEventListener('click', () => {
    openLegislativeWindow();
  });

  document.getElementById('stock-exchange-open-window')?.addEventListener('click', () => {
    openStockExchangeWindow();
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
  setupLegislativeWindow();
  setupStockExchangeWindow();

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

function setupLegislativeWindow() {
  const win = document.getElementById('legislative-window');
  const titlebar = document.getElementById('legislative-window-titlebar');
  const closeBtn = document.getElementById('legislative-window-close');
  const minBtn = document.getElementById('legislative-window-min-btn');
  if (!win || !titlebar || !closeBtn) return;

  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('click', (e) => e.stopPropagation());

  closeBtn.addEventListener('click', () => closeLegislativeWindow());
  minBtn?.addEventListener('click', () => {
    win.classList.toggle('is-collapsed');
    minBtn.textContent = win.classList.contains('is-collapsed') ? '+' : '−';
  });

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  titlebar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#legislative-window-close') || e.target.closest('#legislative-window-min-btn')) return;
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

function setupStockExchangeWindow() {
  const win = document.getElementById('stock-exchange-window');
  const titlebar = document.getElementById('stock-exchange-window-titlebar');
  const closeBtn = document.getElementById('stock-exchange-window-close');
  const minBtn = document.getElementById('stock-exchange-window-min-btn');
  const relistBtn = document.getElementById('stock-exchange-relist-btn');
  if (!win || !titlebar || !closeBtn) return;

  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('click', (e) => e.stopPropagation());

  closeBtn.addEventListener('click', () => closeStockExchangeWindow());
  minBtn?.addEventListener('click', () => {
    win.classList.toggle('is-collapsed');
    minBtn.textContent = win.classList.contains('is-collapsed') ? '+' : '−';
  });

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  titlebar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#stock-exchange-window-close') || e.target.closest('#stock-exchange-window-min-btn')) return;
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

  relistBtn?.addEventListener('click', () => {
    if (typeof refreshStockListings === 'function') {
      refreshStockListings(true);
      updateStockExchangeWindow();
    }
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

function openLegislativeWindow() {
  document.getElementById('legislative-window')?.classList.add('is-open');
  updateLegislativeWindow();
}

function closeLegislativeWindow() {
  document.getElementById('legislative-window')?.classList.remove('is-open');
}

function toggleLegislativeWindow(forceOpen = false) {
  const win = document.getElementById('legislative-window');
  if (!win) return;
  if (forceOpen) {
    openLegislativeWindow();
    return;
  }
  win.classList.toggle('is-open');
  if (win.classList.contains('is-open')) updateLegislativeWindow();
}

function openStockExchangeWindow() {
  document.getElementById('stock-exchange-window')?.classList.add('is-open');
  updateStockExchangeWindow();
}

function closeStockExchangeWindow() {
  document.getElementById('stock-exchange-window')?.classList.remove('is-open');
}

function toggleStockExchangeWindow(forceOpen = false) {
  const win = document.getElementById('stock-exchange-window');
  if (!win) return;
  if (forceOpen) {
    openStockExchangeWindow();
    return;
  }
  win.classList.toggle('is-open');
  if (win.classList.contains('is-open')) updateStockExchangeWindow();
}

function updateLegislativeWindow() {
  const win = document.getElementById('legislative-window');
  if (!win) return;

  setTextContent('legislative-rule-of-law', `${Math.round((city.ruleOfLawIndex ?? 0) * 100)}%`);
  setTextContent('legislative-population', city.population.toLocaleString());
  const hasCouncil = hasBuildingType('legislative_council');
  setTextContent('legislative-status', hasCouncil ? t('legislative.windowReady') : t('legislative.windowLocked'));
}

function updateStockExchangeWindow() {
  const win = document.getElementById('stock-exchange-window');
  if (!win) return;

  const hasCouncil = hasBuildingType('legislative_council');
  const hasExchange = hasBuildingType('stock_exchange');
  const market = city.stockMarket;
  const hsi = Number(market?.hsi ?? HSI_BASE_LEVEL);
  const prevHsi = Number(market?.prevHsi ?? hsi);
  const hsiDelta = hsi - prevHsi;
  const hsiBoostPct = hasExchange
    ? Math.round(Math.max(-8, Math.min(12, ((hsi - HSI_BASE_LEVEL) / (HSI_BASE_LEVEL * 0.35)) * 10)))
    : 0;

  setTextContent('stock-exchange-status', hasExchange ? t('stockExchange.windowReady') : t('stockExchange.windowLocked'));
  setTextContent('stock-exchange-hsi', hsi.toLocaleString());
  setTextContent('stock-exchange-hsi-delta', `${hsiDelta >= 0 ? '+' : ''}${hsiDelta.toLocaleString()}`);
  setTextContent('stock-exchange-rule-of-law', `${Math.round((city.ruleOfLawIndex ?? 0) * 100)}%`);
  setTextContent('stock-exchange-commercial', `${Math.round((city.demandC ?? 0) * 100)}%`);
  setTextContent('stock-exchange-boost', `${hsiBoostPct >= 0 ? '+' : ''}${hsiBoostPct}%`);
  setTextContent('stock-exchange-act-status', isPolicyActive('stockExchangeAct') ? t('stockExchange.actActive') : t('stockExchange.actInactive'));
  setTextContent('stock-exchange-council', hasCouncil ? t('stockExchange.councilBuilt') : t('stockExchange.councilMissing'));

  const tbody = document.getElementById('stock-exchange-table-body');
  if (!tbody) return;

  const stocks = Array.isArray(market?.stocks)
    ? market.stocks.filter((stock) => stock.listed).sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
    : [];
  tbody.innerHTML = stocks.map((stock) => {
    const symbol = String(stock.symbol || '--');
    const name = String(stock.name || '--');
    const sector = String(stock.sector || '--');
    const fallbackPrice = Number(stock.basePrice ?? 1);
    const rawPrice = Number(stock.price);
    const price = Number.isFinite(rawPrice) ? rawPrice : Math.max(1, fallbackPrice);
    const rawPrevPrice = Number(stock.prevPrice);
    const prevPrice = Number.isFinite(rawPrevPrice) ? Math.max(0.0001, rawPrevPrice) : Math.max(0.0001, price);
    const changePct = (price - prevPrice) / prevPrice;
    const changeClass = changePct > 0.001 ? 'stock-change-up' : (changePct < -0.001 ? 'stock-change-down' : 'stock-change-flat');
    const changeText = `${changePct >= 0 ? '+' : ''}${(changePct * 100).toFixed(2)}%`;
    const trendSvg = buildStockTrendSparkline(stock.history);
    return `
      <tr>
        <td>${symbol}</td>
        <td class="stock-name-cell" title="${name}">${name}</td>
        <td>${sector}</td>
        <td class="stock-badge-cell">${stock.isHSI ? '<span class="stock-hsi-badge">HSI</span>' : ''}</td>
        <td class="stock-num">${price.toFixed(2)}</td>
        <td class="stock-num ${changeClass}">${changeText}</td>
        <td class="stock-trend-cell">${trendSvg}</td>
      </tr>
    `;
  }).join('');
}

function buildStockTrendSparkline(history) {
  const values = Array.isArray(history)
    ? history.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0).slice(-24)
    : [];
  if (values.length < 2) return '<span class="stock-trend-empty">--</span>';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.0001, max - min);
  const width = 86;
  const height = 20;

  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const color = values[values.length - 1] >= values[0] ? '#207245' : '#b33a3a';
  return `<svg class="stock-trend-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>`;
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

// ── Metro-style city news ticker (走馬燈) ───────────────────────────────────

const TICKER_NEWS_FALLBACK_KEYS = [
  'news.fallback.1',
  'news.fallback.2',
  'news.fallback.3',
  'news.fallback.4',
  'news.fallback.5',
];

let tickerShowNextTip = null;
let lastTickerTopicId = '';
let tickerCycleCount = 0;
let tickerAdvanceTimer = null;
let tickerTransitionEndHandler = null;

function toPercent(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric * 100)));
}

function getUrgentCityNews() {
  const cityName = city.name || getDefaultCityName();
  const powerWarning = getPowerPlantTickerWarning();
  if (powerWarning) return powerWarning;

  if (city.budget < 0 && Math.abs(city.monthlyIncome - city.monthlyExpenses) > 5000) {
    return t('news.urgent.deficit', {
      city: cityName,
      budget: formatMoney(city.budget),
    });
  }

  if ((city.crimeIndex ?? 0) >= 0.68) {
    return t('news.urgent.crime', { city: cityName });
  }

  if ((city.pollutionIndex ?? 0) >= 0.72) {
    return t('news.urgent.pollution', { city: cityName });
  }

  return null;
}

function buildHongKongFinanceTickerItems(context) {
  const {
    cityName,
    hsi,
    hsiDelta,
    net,
    demandC,
    ruleOfLaw,
    actActive,
  } = context;

  const items = [];
  const deltaText = `${hsiDelta >= 0 ? '+' : ''}${hsiDelta.toLocaleString()}`;

  if (hsiDelta >= 180) {
    items.push({
      id: 'hk-close-rally',
      weight: 12,
      text: t('news.headline.hkCloseRally', {
        city: cityName,
        hsi: hsi.toLocaleString(),
        delta: deltaText,
      }),
    });
  } else if (hsiDelta <= -180) {
    items.push({
      id: 'hk-close-drop',
      weight: 12,
      text: t('news.headline.hkCloseDrop', {
        city: cityName,
        hsi: hsi.toLocaleString(),
        delta: deltaText,
      }),
    });
  } else {
    items.push({
      id: 'hk-close-range',
      weight: 8,
      text: t('news.headline.hkCloseRange', {
        city: cityName,
        hsi: hsi.toLocaleString(),
      }),
    });
  }

  if (demandC >= 0.35 && net > 0) {
    items.push({
      id: 'hk-risk-on',
      weight: 9,
      text: t('news.headline.hkFlowRiskOn', {
        city: cityName,
        demandC: `${Math.round(demandC * 100)}%`,
        net: formatMoney(net),
      }),
    });
  } else if (demandC <= -0.15 || net < 0) {
    items.push({
      id: 'hk-risk-off',
      weight: 9,
      text: t('news.headline.hkFlowRiskOff', {
        city: cityName,
        demandC: `${Math.round(demandC * 100)}%`,
        net: formatMoney(net),
      }),
    });
  }

  if (actActive) {
    items.push({
      id: 'hk-rule-law-premium',
      weight: 7,
      text: t('news.headline.hkRuleLawPremium', {
        city: cityName,
        ruleOfLaw: `${ruleOfLaw}%`,
      }),
    });
  }

  return items;
}

function buildTickerNewsCandidates() {
  const cityName = city.name || getDefaultCityName();
  const higherEdu = toPercent(city.educationHigherIndex);
  const basicEdu = toPercent(city.educationBasicIndex);
  const scienceShare = toPercent(city.scienceIndustryShare);
  const happiness = toPercent(city.happiness);
  const roadCoverage = toPercent(city.roadCoverageIndex);
  const pollution = toPercent(city.pollutionIndex);
  const crime = toPercent(city.crimeIndex);
  const population = Math.max(0, Number(city.population) || 0);
  const net = Number(city.monthlyIncome || 0) - Number(city.monthlyExpenses || 0);
  const demandR = Number(city.demandR || 0);
  const demandC = Number(city.demandC || 0);
  const demandI = Number(city.demandI || 0);
  const hsi = Number(city.stockMarket?.hsi || HSI_BASE_LEVEL);
  const prevHsi = Number(city.stockMarket?.prevHsi || hsi);
  const hsiDelta = hsi - prevHsi;
  const ruleOfLaw = Math.round((city.ruleOfLawIndex ?? 0) * 100);
  const actActive = isPolicyActive('stockExchangeAct');

  const items = [];

  if (higherEdu >= 80) {
    items.push({
      id: 'higher-edu-global100',
      weight: 10,
      text: t('news.headline.higherEduGlobal100', { city: cityName, higherEdu: String(higherEdu) }),
    });
  }

  if (basicEdu >= 75 && higherEdu >= 60) {
    items.push({
      id: 'education-ecosystem',
      weight: 8,
      text: t('news.headline.educationEcosystem', { city: cityName }),
    });
  }

  if (scienceShare >= 45) {
    items.push({
      id: 'science-economy',
      weight: 8,
      text: t('news.headline.scienceEconomy', { city: cityName, scienceShare: String(scienceShare) }),
    });
  }

  if (net >= 20000) {
    items.push({
      id: 'fiscal-surplus-strong',
      weight: 8,
      text: t('news.headline.fiscalSurplusStrong', { city: cityName, net: formatMoney(net) }),
    });
  } else if (net < 0) {
    items.push({
      id: 'fiscal-deficit',
      weight: 9,
      text: t('news.headline.fiscalDeficit', { city: cityName, net: formatMoney(net) }),
    });
  }

  if (happiness >= 78) {
    items.push({
      id: 'livability-award',
      weight: 7,
      text: t('news.headline.livabilityAward', { city: cityName, happiness: String(happiness) }),
    });
  } else if (happiness <= 45) {
    items.push({
      id: 'livability-pressure',
      weight: 9,
      text: t('news.headline.livabilityPressure', { city: cityName, happiness: String(happiness) }),
    });
  }

  if (roadCoverage >= 72) {
    items.push({
      id: 'transport-grid',
      weight: 6,
      text: t('news.headline.transportGrid', { city: cityName, roadCoverage: String(roadCoverage) }),
    });
  }

  if (population >= 100000) {
    items.push({
      id: 'population-100k',
      weight: 7,
      text: t('news.headline.population100k', { city: cityName, population: population.toLocaleString() }),
    });
  } else if (population >= 50000) {
    items.push({
      id: 'population-50k',
      weight: 5,
      text: t('news.headline.population50k', { city: cityName, population: population.toLocaleString() }),
    });
  }

  if (pollution >= 60) {
    items.push({
      id: 'pollution-watch',
      weight: 8,
      text: t('news.headline.pollutionWatch', { city: cityName, pollution: String(pollution) }),
    });
  } else if (pollution <= 28) {
    items.push({
      id: 'green-city',
      weight: 6,
      text: t('news.headline.greenCity', { city: cityName }),
    });
  }

  if (crime >= 55) {
    items.push({
      id: 'crime-watch',
      weight: 8,
      text: t('news.headline.crimeWatch', { city: cityName, crime: String(crime) }),
    });
  } else {
    items.push({
      id: 'crime-stable',
      weight: 4,
      text: t('news.headline.crimeStable', { city: cityName }),
    });
  }

  if (demandR > 0.2 && demandC > 0 && demandI > 0) {
    items.push({
      id: 'growth-synced',
      weight: 6,
      text: t('news.headline.growthSynced', { city: cityName }),
    });
  } else if (demandR < -0.2) {
    items.push({
      id: 'housing-demand-cool',
      weight: 6,
      text: t('news.headline.housingDemandCool', { city: cityName }),
    });
  }

  if (hasBuildingType('stock_exchange')) {
    items.push(...buildHongKongFinanceTickerItems({
      cityName,
      hsi,
      hsiDelta,
      net,
      demandC,
      ruleOfLaw,
      actActive,
    }));

    if (hsiDelta >= 120) {
      items.push({
        id: 'hsi-rally',
        weight: 9,
        text: t('news.headline.hsiRally', { city: cityName, hsi: hsi.toLocaleString(), delta: `+${hsiDelta.toLocaleString()}` }),
      });
    } else if (hsiDelta <= -120) {
      items.push({
        id: 'hsi-pullback',
        weight: 9,
        text: t('news.headline.hsiPullback', { city: cityName, hsi: hsi.toLocaleString(), delta: hsiDelta.toLocaleString() }),
      });
    } else {
      items.push({
        id: 'hsi-flat',
        weight: 5,
        text: t('news.headline.hsiFlat', { city: cityName, hsi: hsi.toLocaleString() }),
      });
    }
  }

  if (!items.length) {
    return TICKER_NEWS_FALLBACK_KEYS.map((key, index) => ({
      id: `fallback-${index}`,
      weight: 1,
      text: t(key, { city: cityName }),
    }));
  }

  return items;
}

function pickTickerNewsHeadline() {
  const urgent = getUrgentCityNews();
  if (urgent && tickerCycleCount % 2 === 0) {
    return { id: 'urgent', text: t('news.breakingPrefix', { headline: urgent }) };
  }

  const pool = buildTickerNewsCandidates();
  const weighted = [];
  pool.forEach((item) => {
    const repeats = Math.max(1, Math.min(12, Math.round(item.weight || 1)));
    for (let i = 0; i < repeats; i += 1) weighted.push(item);
  });

  if (!weighted.length) {
    const cityName = city.name || getDefaultCityName();
    const key = TICKER_NEWS_FALLBACK_KEYS[tickerCycleCount % TICKER_NEWS_FALLBACK_KEYS.length];
    return { id: 'fallback', text: t(key, { city: cityName }) };
  }

  let selected = weighted[Math.floor(Math.random() * weighted.length)];
  if (selected.id === lastTickerTopicId && weighted.length > 1) {
    selected = weighted.find((item) => item.id !== lastTickerTopicId) || selected;
  }
  return selected;
}

function startTicker() {
  const track = document.getElementById('tip-ticker-track');
  const inner = document.getElementById('tip-ticker-inner');
  if (!track || !inner) return;

  if (tickerAdvanceTimer) {
    clearTimeout(tickerAdvanceTimer);
    tickerAdvanceTimer = null;
  }

  if (tickerTransitionEndHandler) {
    inner.removeEventListener('transitionend', tickerTransitionEndHandler);
    tickerTransitionEndHandler = null;
  }

  const scheduleFallbackAdvance = (delayMs) => {
    if (tickerAdvanceTimer) clearTimeout(tickerAdvanceTimer);
    tickerAdvanceTimer = setTimeout(() => {
      if (tickerShowNextTip) tickerShowNextTip();
    }, Math.max(1200, Math.round(delayMs)));
  };

  function showNextTip() {
    tickerCycleCount += 1;
    const headline = pickTickerNewsHeadline();
    lastTickerTopicId = headline.id;
    const cityName = city.name || getDefaultCityName();
    const nextText = String(headline?.text || '').trim() || t('news.fallback.1', { city: cityName });
    inner.textContent = nextText;

    // Measure actual rendered width after setting content
    const trackW   = track.offsetWidth;
    const textW    = inner.scrollWidth;
    const SPEED    = 78;
    if (trackW <= 0 || textW <= 0) {
      inner.style.transition = 'none';
      inner.style.left = '0px';
      scheduleFallbackAdvance(1200);
      return;
    }
    const duration = Math.max(6, (trackW + textW) / SPEED);

    // Snap to just off the right edge (no transition), then glide left
    inner.style.transition = 'none';
    inner.style.left = trackW + 'px';
    void inner.offsetLeft;                        // force reflow
    inner.style.transition = `left ${duration}s linear`;
    inner.style.left = `-${textW}px`;

    // Fallback for cases where transitionend is skipped (tab hidden, style recalculation, etc.)
    scheduleFallbackAdvance((duration + 0.25) * 1000);
  }

  tickerShowNextTip = showNextTip;
  showNextTip();
  tickerTransitionEndHandler = (event) => {
    if (event && event.propertyName && event.propertyName !== 'left') return;
    if (tickerAdvanceTimer) {
      clearTimeout(tickerAdvanceTimer);
      tickerAdvanceTimer = null;
    }
    showNextTip();
  };
  inner.addEventListener('transitionend', tickerTransitionEndHandler);
}

function getPowerPlantTickerWarning() {
  const cityName = city.name || getDefaultCityName();
  const plant = Object.values(buildingData).find((record) => POWER_PLANT_STATS[record.type] && isPowerPlantNearRetirement(record));
  if (plant) {
    const remaining = getPowerPlantRemainingMonths(plant);
    const label = plant.type === 'power_plant_coal' ? t('building.coalPlant') : t('building.solarPlant');
    return t('news.urgent.oldPlantStory', {
      city: cityName,
      plant: label,
      remaining: String(remaining),
    });
  }

  if ((city.totalPowerSupply ?? 0) < (city.totalPowerDemand ?? 0) && (city.totalPowerDemand ?? 0) > 0) {
    return t('news.urgent.blackoutStory', {
      city: cityName,
      supply: city.totalPowerSupply ?? 0,
      demand: city.totalPowerDemand ?? 0,
    });
  }

  return null;
}

document.addEventListener('languagechange', () => {
  updateStatusAlert();
  if (tickerShowNextTip) tickerShowNextTip();
});
