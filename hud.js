// ── HUD update (called every sim tick) ────────────────────────────────────────

function updateHUD() {
  const name = city.name || getDefaultCityName();
  setTextContent('hud-city-name',     name);
  setTextContent('topbar-city-name',  name);   // centred top bar label
  setTextContent('hud-money',  formatMoney(city.budget));
  setTextContent('hud-pop',    t('hud.pop', { population: city.population.toLocaleString() }));
  setTextContent('hud-date',   formatCityDate(city.day, city.month, city.year));
  setTextContent('hud-stars',  starsDisplay(city.happiness));
  setTextContent('hud-income',         `+${formatMoney(city.monthlyIncome)}`);
  setTextContent('hud-expense',        `-${formatMoney(city.monthlyExpenses)}`);
  setTextContent('hud-income-detail',  `+${formatMoney(city.monthlyIncome)}`);
  setTextContent('hud-expense-detail', `-${formatMoney(city.monthlyExpenses)}`);

  updateDemandBar('bar-r', city.demandR, '#44cc55');
  updateDemandBar('bar-c', city.demandC, '#4488ff');
  updateDemandBar('bar-i', city.demandI, '#ffcc00');

  updateBudgetStrip();
  updateTaxDisplay();
  updateBudgetControls();
  updateBudgetWindow();
  if (typeof updateMiniMap === 'function') updateMiniMap();

  // Highlight budget in red when near-bankrupt
  const moneyEl = document.getElementById('hud-money');
  if (moneyEl) {
    moneyEl.classList.toggle('hud-danger', city.budget < 0);
    moneyEl.classList.toggle('hud-warning', city.budget >= 0 && city.budget < 1000);
  }
}

// ── Budget strip (bottom bar) ─────────────────────────────────────────────────

function updateBudgetStrip() {
  const el = document.getElementById('budget-strip-balance');
  if (el) el.textContent = formatMoney(city.budget);
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
  const strip = document.getElementById('budget-strip');
  const slider = document.getElementById('tax-slider');

  if (panel) {
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.addEventListener('click', (e) => e.stopPropagation());
  }

  if (strip) {
    strip.addEventListener('click', () => {
      const detail = document.getElementById('budget-detail');
      if (detail) detail.classList.toggle('is-open');
    });
  }

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
  if (!win || !titlebar || !closeBtn) return;

  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('click', (e) => e.stopPropagation());

  closeBtn.addEventListener('click', () => closeBudgetWindow());

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  titlebar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#budget-window-close')) return;
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
