// ── HUD update (called every sim tick) ────────────────────────────────────────

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
  updateTopbarWeatherChip();
  updateBudgetWindow();
  updateLegislativeWindow();
  updateStockExchangeWindow();
  updateMetricCharts();
  if (typeof updateChartWindow === 'function') updateChartWindow();
  if (typeof updateMiniMap === 'function') updateMiniMap();
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
    const isCouncilPreviewButton = !!button.closest('.council-policy-list');
    button.hidden = isCouncilPreviewButton ? false : !(isAvailable || isActive);
    button.disabled = isCouncilPreviewButton ? false : (!isAvailable && !isActive);
    button.classList.toggle('is-locked', isCouncilPreviewButton && !isAvailable && !isActive);
    button.setAttribute('aria-disabled', String(!isAvailable && !isActive));
    button.classList.toggle('is-active', isActive);
  });

  setTextContent('budget-debt-total', formatMoney(getTotalDebt()));
  setTextContent('budget-credit-rating', city.creditRating || updateCreditRating());
  setTextContent('budget-policy-cost', `${formatMoney(city.lastPolicyCost || getPolicyMonthlyCost())}/mo`);
  setTextContent('budget-loan-cost', `${formatMoney(city.lastLoanPayment || getMonthlyLoanDue())}/mo`);
}

function isCouncilMeetingUnlocked() {
  return city.population >= 10000 || hasBuildingType('legislative_council');
}

function updateInfrastructureToolVisibility() {
  const councilButtons = document.querySelectorAll('[data-tool="legislative-council"]');
  const stockExchangeButtons = document.querySelectorAll('[data-tool="stock-exchange"]');
  const canBuildCouncil = city.population >= 10000 && !hasBuildingType('legislative_council');
  const canBuildStockExchange = city.population >= 50000 && isPolicyActive('stockExchangeAct') && hasBuildingType('legislative_council') && !hasBuildingType('stock_exchange');

  const councilOpenButton = document.getElementById('legislative-open-window');
  if (councilOpenButton) {
    const unlocked = isCouncilMeetingUnlocked();
    councilOpenButton.hidden = !unlocked;
    councilOpenButton.style.display = unlocked ? '' : 'none';
  }

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

// ── Weather chip ────────────────────────────────────────────────────────────

function getTyphoonNameForDisplay(weather) {
  if (!weather?.typhoonName) return '';
  return typeof getTyphoonDisplayName === 'function' ? getTyphoonDisplayName(weather.typhoonName) : weather.typhoonName;
}

function getActiveWeatherWarnings() {
  const weather = city.weather;
  if (!weather) return { signalId: null, rainWarning: null };
  return {
    signalId: weather.typhoonStage && weather.typhoonStage !== 'none' ? weather.typhoonStage : null,
    rainWarning: weather.rainWarning && weather.rainWarning !== 'none' ? weather.rainWarning : null,
  };
}

function updateTopbarWeatherChip() {
  const weather = city.weather;
  if (!weather || typeof weatherConditionIconSvg !== 'function') return;

  const bucket = getWeatherConditionBucket(weather);
  const icon = document.getElementById('topbar-weather-icon');
  if (icon) {
    icon.innerHTML = weatherConditionIconSvg(bucket);
    icon.title = t(`weather.condition.${bucket}`);
  }
  setTextContent('topbar-weather-temp', `${Math.round(weather.temperatureC)}°C`);
  setTextContent('topbar-weather-humidity', `${Math.round(weather.humidityPct ?? 0)}%`);

  const warnings = document.getElementById('topbar-weather-warnings');
  if (warnings) {
    const { signalId, rainWarning } = getActiveWeatherWarnings();
    const badges = [];
    if (signalId) {
      const storm = getTyphoonNameForDisplay(weather);
      const label = storm
        ? `${t(TYPHOON_SIGNAL_LABEL_KEY[signalId])} — ${storm}`
        : t(TYPHOON_SIGNAL_LABEL_KEY[signalId]);
      badges.push(`<span class="topbar-weather-badge" title="${label}">${typhoonSignalIconSvg(signalId)}</span>`);
    }
    if (rainWarning) {
      badges.push(`<span class="topbar-weather-badge" title="${t(RAINSTORM_LABEL_KEY[rainWarning])}">${rainstormWarningIconSvg(rainWarning)}</span>`);
    }
    warnings.innerHTML = badges.join('');
  }
}

function updateWeatherLegendDialog() {
  const weather = city.weather;
  const summary = document.getElementById('weather-legend-summary');
  const active = document.getElementById('weather-legend-active');
  if (!weather || !summary || !active) return;

  const bucket = getWeatherConditionBucket(weather);
  const rows = [
    t(`weather.condition.${bucket}`),
    `${Math.round(weather.temperatureC)}°C`,
    t('weather.humidity', { value: Math.round(weather.humidityPct ?? 0) }),
  ];
  if (weather.typhoonActive && weather.typhoonName) {
    rows.push(t('weather.typhoonWind', { name: getTyphoonNameForDisplay(weather), wind: Math.round(weather.windKph ?? 0) }));
  }
  summary.replaceChildren(...rows.map((text) => {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }));

  const { signalId, rainWarning } = getActiveWeatherWarnings();
  const chips = [];
  if (signalId) {
    const storm = getTyphoonNameForDisplay(weather);
    const signalLabel = storm
      ? `${t(TYPHOON_SIGNAL_LABEL_KEY[signalId])} — ${storm}`
      : t(TYPHOON_SIGNAL_LABEL_KEY[signalId]);
    chips.push({ svg: typhoonSignalIconSvg(signalId), label: signalLabel });
  }
  if (rainWarning) {
    chips.push({ svg: rainstormWarningIconSvg(rainWarning), label: t(RAINSTORM_LABEL_KEY[rainWarning]) });
  }
  active.replaceChildren(...chips.map(({ svg, label }) => {
    const chip = document.createElement('div');
    chip.className = 'weather-legend-active-chip';
    chip.innerHTML = svg;
    const text = document.createElement('span');
    text.textContent = label;
    chip.appendChild(text);
    return chip;
  }));
}

// ── Demand bars ───────────────────────────────────────────────────────────────

function updateDemandBar(id, value, positiveColor) {
  const fill = document.getElementById(id);
  if (!fill) return;

  const track = fill.parentElement;
  const isHorizontal = track?.classList.contains('demand-bar-track-horizontal');

  if (isHorizontal) {
    const trackWidth = Math.max(1, track?.clientWidth || 96);
    const half = trackWidth / 2;
    const barWidth = Math.abs(value) * half;

    fill.style.top = '0';
    fill.style.bottom = 'auto';
    fill.style.height = '100%';
    fill.style.width = `${barWidth}px`;
    fill.style.left = value >= 0 ? `${half}px` : `${half - barWidth}px`;
    fill.style.background = value >= 0 ? positiveColor : '#cc3333';
    return;
  }

  const trackHeight = Math.max(1, track?.clientHeight || 56);
  const half = trackHeight / 2;
  const barHeight = Math.abs(value) * half;

  if (value >= 0) {
    fill.style.width      = '100%';
    fill.style.height     = `${barHeight}px`;
    fill.style.top        = `${half - barHeight}px`;
    fill.style.bottom     = 'auto';
    fill.style.background = positiveColor;
  } else {
    fill.style.width      = '100%';
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

  document.getElementById('topbar-weather-chip')?.addEventListener('click', () => {
    updateWeatherLegendDialog();
    if (typeof showDialog === 'function') showDialog('weather-legend-dialog');
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
      const id = button.dataset.policyId;
      if (typeof selectCouncilPolicy === 'function') selectCouncilPolicy(id);
    });
  });

  updateHUD();
  setupHudPanelToggles();
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
  if (!win?.classList.contains('is-open')) return;

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
  setTextContent('budget-expense-health', formatMoney(current.expenses.health ?? 0));
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
  if (typeof setupCouncilMeetingUi === 'function') setupCouncilMeetingUi();

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
    if (!hasBuildingType('stock_exchange')) return;
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
  if (!isCouncilMeetingUnlocked()) return;
  document.getElementById('legislative-window')?.classList.add('is-open');
  if (typeof updateCouncilMeetingUi === 'function') updateCouncilMeetingUi();
  updateLegislativeWindow();
}

function closeLegislativeWindow() {
  document.getElementById('legislative-window')?.classList.remove('is-open');
}

function toggleLegislativeWindow(forceOpen = false) {
  const win = document.getElementById('legislative-window');
  if (!win || !isCouncilMeetingUnlocked()) return;
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
  if (!win?.classList.contains('is-open')) return;

  setTextContent('legislative-rule-of-law', `${Math.round((city.ruleOfLawIndex ?? 0) * 100)}%`);
  setTextContent('legislative-population', city.population.toLocaleString());
  const hasCouncil = hasBuildingType('legislative_council');
  setTextContent('legislative-status', hasCouncil ? t('legislative.windowReady') : t('legislative.windowLocked'));
  if (typeof updateCouncilMeetingUi === 'function') updateCouncilMeetingUi();
}

function updateStockExchangeWindow() {
  const win = document.getElementById('stock-exchange-window');
  if (!win?.classList.contains('is-open')) return;

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
  setTextContent('stock-exchange-hsi', hasExchange ? hsi.toLocaleString() : '--');
  setTextContent('stock-exchange-hsi-delta', hasExchange ? `${hsiDelta >= 0 ? '+' : ''}${hsiDelta.toLocaleString()}` : '--');
  setTextContent('stock-exchange-rule-of-law', `${Math.round((city.ruleOfLawIndex ?? 0) * 100)}%`);
  setTextContent('stock-exchange-commercial', `${Math.round((city.demandC ?? 0) * 100)}%`);
  setTextContent('stock-exchange-boost', hasExchange ? `${hsiBoostPct >= 0 ? '+' : ''}${hsiBoostPct}%` : '--');
  setTextContent('stock-exchange-act-status', isPolicyActive('stockExchangeAct') ? t('stockExchange.actActive') : t('stockExchange.actInactive'));
  setTextContent('stock-exchange-council', hasCouncil ? t('stockExchange.councilBuilt') : t('stockExchange.councilMissing'));

  const tbody = document.getElementById('stock-exchange-table-body');
  if (!tbody) return;
  const relistBtn = document.getElementById('stock-exchange-relist-btn');
  if (relistBtn) relistBtn.disabled = !hasExchange;
  if (!hasExchange) {
    tbody.innerHTML = `<tr><td colspan="7" class="stock-trend-empty">${t('stockExchange.marketLocked')}</td></tr>`;
    return;
  }

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
