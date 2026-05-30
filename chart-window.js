const CHART_SERIES_DEFS = {
  education: {
    labelKey: 'chart.education',
    color: '#2a9fd6',
    historyKey: 'educationHistory',
    formatter: (v) => `${Math.round((Number(v) || 0) * 100)}%`,
  },
  crime: {
    labelKey: 'chart.crime',
    color: '#c24646',
    historyKey: 'crimeHistory',
    formatter: (v) => `${Math.round((Number(v) || 0) * 100)}%`,
  },
  governmentIncome: {
    labelKey: 'chart.governmentIncome',
    color: '#2e8b57',
    historyKey: 'governmentIncomeHistory',
    formatter: (v) => `${Math.round(Number(v) || 0).toLocaleString()}`,
  },
  happiness: {
    labelKey: 'chart.happiness',
    color: '#d68f1d',
    historyKey: 'happinessHistory',
    formatter: (v) => `${Math.round((Number(v) || 0) * 100)}%`,
  },
  landValue: {
    labelKey: 'chart.landValue',
    color: '#6b8e23',
    historyKey: 'landValueHistory',
    formatter: (v) => `${Math.round((Number(v) || 0) * 100)}%`,
  },
  pollution: {
    labelKey: 'chart.pollution',
    color: '#6d4c41',
    historyKey: 'pollutionHistory',
    formatter: (v) => `${Math.round(Number(v) || 0).toLocaleString()}`,
  },
  hsi: {
    labelKey: 'chart.hsi',
    color: '#1e5cb3',
    historyKey: 'hsiHistory',
    formatter: (v) => `${Math.round(Number(v) || 0).toLocaleString()}`,
  },
  unemployment: {
    labelKey: 'chart.unemployment',
    color: '#e07b39',
    historyKey: 'unemploymentHistory',
    formatter: (v) => `${Math.round((Number(v) || 0) * 100)}%`,
  },
};

let chartWindowLastRenderedLabel = null;

function initOverlayControls() {
  const controls     = document.getElementById('overlay-controls');
  const modeButtons  = document.getElementById('overlay-mode-buttons');
  const win          = document.getElementById('overlay-window');
  const closeBtn     = document.getElementById('overlay-win-close');
  const minBtn       = document.getElementById('overlay-win-min');
  const titlebar     = document.getElementById('overlay-win-titlebar');
  const body         = document.getElementById('overlay-win-body');
  const zoomInBtn    = document.getElementById('overlay-zoom-in');
  const zoomOutBtn   = document.getElementById('overlay-zoom-out');
  const zoomResetBtn = document.getElementById('overlay-zoom-reset');
  const resizeHandle = document.getElementById('overlay-resize-handle');

  if (!win) return;

  // ── HUD overlay buttons ─────────────────────────────────────────────────────
  controls?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-overlay]');
    if (!btn) return;
    toggleOverlayMap(btn.dataset.overlay);
  });

  modeButtons?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-overlay]');
    if (!btn) return;
    toggleOverlayMap(btn.dataset.overlay);
  });

  modeButtons?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  // ── Close button ─────────────────────────────────────────────────────────────
  closeBtn?.addEventListener('click', () => closeOverlayWindow());
  minBtn?.addEventListener('click', () => {
    win.classList.toggle('is-collapsed');
    minBtn.textContent = win.classList.contains('is-collapsed') ? '+' : '−';
  });

  // ── Title bar — drag to move window ──────────────────────────────────────────
  let isDraggingWin = false, winOffX = 0, winOffY = 0;

  titlebar?.addEventListener('mousedown', (e) => {
    if (e.target.closest('#overlay-win-close') || e.target.closest('#overlay-win-min')) return;
    isDraggingWin = true;
    // Switch from transform-based centering to explicit position
    const rect = win.getBoundingClientRect();
    win.style.transform = 'none';
    win.style.left = `${rect.left}px`;
    win.style.top  = `${rect.top}px`;
    winOffX = e.clientX - rect.left;
    winOffY = e.clientY - rect.top;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingWin) {
      const vw = window.innerWidth, vh = window.innerHeight;
      win.style.left = `${Math.max(0, Math.min(vw - 60, e.clientX - winOffX))}px`;
      win.style.top  = `${Math.max(0, Math.min(vh - 40, e.clientY - winOffY))}px`;
    }
    if (isMapPanning) {
      mapViewPanX = e.clientX - _panStartX;
      mapViewPanY = e.clientY - _panStartY;
      _applyCanvasTransform();
    }
    if (isResizingWin) {
      const newW = Math.max(260, _resizeStartW + (e.clientX - _resizeStartMouseX));
      const newH = Math.max(220, _resizeStartH + (e.clientY - _resizeStartMouseY));
      win.style.width  = `${newW}px`;
      win.style.height = `${newH}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    isDraggingWin  = false;
    isMapPanning   = false;
    isResizingWin  = false;
    document.getElementById('overlay-win-body')?.classList.remove('is-panning');
  });

  // ── Map body — drag to pan ────────────────────────────────────────────────────
  body?.addEventListener('mousedown', (e) => {
    if (e.target.closest('#overlay-mode-buttons, #overlay-legend, #overlay-detail-panel, #overlay-power-footer, .overlay-zoom-group')) return;
    if (e.button !== 0) return;
    isMapPanning = true;
    _panStartX   = e.clientX - mapViewPanX;
    _panStartY   = e.clientY - mapViewPanY;
    body.classList.add('is-panning');
    e.preventDefault();
  });

  // ── Map body — scroll wheel to zoom ──────────────────────────────────────────
  body?.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect   = body.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    _zoomAtPoint(mouseX, mouseY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
  }, { passive: false });

  // ── Zoom buttons ─────────────────────────────────────────────────────────────
  zoomInBtn?.addEventListener('click', () => {
    const b = document.getElementById('overlay-win-body');
    if (b) _zoomAtPoint(b.clientWidth / 2, b.clientHeight / 2, 1.4);
  });
  zoomOutBtn?.addEventListener('click', () => {
    const b = document.getElementById('overlay-win-body');
    if (b) _zoomAtPoint(b.clientWidth / 2, b.clientHeight / 2, 1 / 1.4);
  });
  zoomResetBtn?.addEventListener('click', () => resetMapView());

  // ── Custom resize handle ──────────────────────────────────────────────────────
  let isResizingWin = false;
  let _resizeStartW = 0, _resizeStartH = 0, _resizeStartMouseX = 0, _resizeStartMouseY = 0;

  resizeHandle?.addEventListener('mousedown', (e) => {
    isResizingWin      = true;
    _resizeStartW      = win.offsetWidth;
    _resizeStartH      = win.offsetHeight;
    _resizeStartMouseX = e.clientX;
    _resizeStartMouseY = e.clientY;
    e.preventDefault();
    e.stopPropagation();
  });

  // ── Block game input while window is focused ──────────────────────────────────
  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('contextmenu', (e) => e.preventDefault());
}

function initChartControls() {
  const win = document.getElementById('chart-window');
  const closeBtn = document.getElementById('chart-win-close');
  const minBtn = document.getElementById('chart-win-min');
  const titlebar = document.getElementById('chart-win-titlebar');
  const controls = document.getElementById('chart-controls');
  if (!win) return;

  closeBtn?.addEventListener('click', () => closeChartWindow());
  minBtn?.addEventListener('click', () => {
    win.classList.toggle('is-collapsed');
    minBtn.textContent = win.classList.contains('is-collapsed') ? '+' : '−';
  });
  controls?.addEventListener('change', (event) => {
    if (!event.target.closest('[data-chart-series]')) return;
    chartWindowLastRenderedLabel = null;
    updateChartWindow(true);
  });

  let dragging = false;
  let offX = 0;
  let offY = 0;

  titlebar?.addEventListener('mousedown', (event) => {
    if (event.target.closest('#chart-win-close') || event.target.closest('#chart-win-min')) return;
    dragging = true;
    const rect = win.getBoundingClientRect();
    win.style.transform = 'none';
    win.style.left = `${rect.left}px`;
    win.style.top = `${rect.top}px`;
    offX = event.clientX - rect.left;
    offY = event.clientY - rect.top;
    event.preventDefault();
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    win.style.left = `${Math.max(0, Math.min(vw - 120, event.clientX - offX))}px`;
    win.style.top = `${Math.max(0, Math.min(vh - 48, event.clientY - offY))}px`;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });

  win.addEventListener('pointerdown', (event) => event.stopPropagation());
}

function openChartWindow() {
  const win = document.getElementById('chart-window');
  if (!win) return;
  win.classList.add('is-open');
  chartWindowLastRenderedLabel = null;
  updateChartWindow(true);
}

function closeChartWindow() {
  document.getElementById('chart-window')?.classList.remove('is-open');
}

function toggleChartWindow() {
  const win = document.getElementById('chart-window');
  if (!win) return;
  if (win.classList.contains('is-open')) {
    closeChartWindow();
    return;
  }
  openChartWindow();
}

function getSelectedChartSeriesKeys() {
  const selected = [...document.querySelectorAll('#chart-controls [data-chart-series]:checked')]
    .map((input) => input.dataset.chartSeries)
    .filter((key) => CHART_SERIES_DEFS[key]);
  return selected;
}

function updateChartWindow(force = false) {
  const win = document.getElementById('chart-window');
  if (!win || !win.classList.contains('is-open')) return;

  const currentLabel = `${city.year}-${String(city.month).padStart(2, '0')}`;
  if (!force && currentLabel === chartWindowLastRenderedLabel) return;
  chartWindowLastRenderedLabel = currentLabel;

  updateChartWindowMetrics();
  renderCityTrendChart();
}

function updateChartWindowMetrics() {
  const basic = Math.round((Number(city.educationBasicIndex ?? 0) || 0) * 100);
  const higher = Math.round((Number(city.educationHigherIndex ?? 0) || 0) * 100);
  const science = Math.round((Number(city.scienceIndustryShare ?? 0) || 0) * 100);

  const setMetric = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${Math.max(0, Math.min(100, value))}%`;
  };

  setMetric('chart-metric-basic', basic);
  setMetric('chart-metric-higher', higher);
  setMetric('chart-metric-science', science);
}

function renderCityTrendChart() {
  const canvas = document.getElementById('city-chart-canvas');
  const legend = document.getElementById('chart-legend');
  if (!canvas || !legend) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const wrap = document.getElementById('chart-canvas-wrap');
  if (wrap) {
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(360, Math.round(rect.width));
    const height = Math.max(180, Math.round(rect.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f0ecdc';
  ctx.fillRect(0, 0, width, height);

  drawChartGrid(ctx, width, height);

  const selectedKeys = getSelectedChartSeriesKeys();
  if (selectedKeys.length === 0) {
    legend.innerHTML = `<span class="chart-legend-item">${t('chart.selectPrompt')}</span>`;
    return;
  }

  const seriesData = selectedKeys.map((key) => {
    const def = CHART_SERIES_DEFS[key];
    const history = Array.isArray(city[def.historyKey]) ? city[def.historyKey].slice(-120) : [];
    return { key, def, history };
  });

  const maxPoints = Math.max(2, ...seriesData.map((entry) => entry.history.length));
  const leftPad = 32;
  const rightPad = 12;
  const topPad = 12;
  const bottomPad = 22;
  const plotW = width - leftPad - rightPad;
  const plotH = height - topPad - bottomPad;

  seriesData.forEach(({ def, history }) => {
    if (!history.length) return;
    const rawValues = history.map((entry) => Number(entry?.value ?? 0));
    const minVal = Math.min(...rawValues);
    const maxVal = Math.max(...rawValues);
    const range = Math.max(1e-6, maxVal - minVal);

    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    rawValues.forEach((value, index) => {
      const x = leftPad + (index / Math.max(1, maxPoints - 1)) * plotW;
      const normalized = (value - minVal) / range;
      const y = topPad + (1 - normalized) * plotH;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  const latestMonth = city.month;
  const latestYear = city.year;
  ctx.fillStyle = '#5a5648';
  ctx.font = '11px Arial';
  ctx.fillText(`${latestYear}/${String(latestMonth).padStart(2, '0')}`, leftPad, height - 6);

  legend.innerHTML = seriesData.map(({ def, history }) => {
    const latest = history[history.length - 1];
    const latestText = latest ? def.formatter(latest.value) : '--';
    return `<span class="chart-legend-item"><span class="chart-legend-swatch" style="background:${def.color}"></span>${t(def.labelKey)}: ${latestText}</span>`;
  }).join('');
}

function drawChartGrid(ctx, width, height) {
  ctx.strokeStyle = 'rgba(110,105,90,0.34)';
  ctx.lineWidth = 1;
  const vertical = 6;
  const horizontal = 4;
  for (let i = 0; i <= vertical; i++) {
    const x = 32 + (i / vertical) * (width - 44);
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x, height - 22);
    ctx.stroke();
  }
  for (let i = 0; i <= horizontal; i++) {
    const y = 12 + (i / horizontal) * (height - 34);
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(width - 12, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#6f6b60';
  ctx.strokeRect(32.5, 12.5, width - 44, height - 34);
}
