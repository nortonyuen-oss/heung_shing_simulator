// ── Transport Department window and map stop picker ─────────────────────────

const transportUiState = {
  editor: null,
  pickingStops: false,
  message: '',
  messageTone: 'info',
  selectedDepotId: '',
  expandedRouteId: '',
  fleetSort: 'number',
};

// §5/§10/§11: six independent, freely-movable operation windows (OpenTTD-
// style toolbar windows), not tabs sharing one big panel. Each is created
// lazily on first open and lives in this map keyed by id; transportUiState
// above holds cross-window state (the route editor, fleet sort, etc.) that
// doesn't belong to any single window.
const TRANSPORT_PANEL_IDS = ['routes', 'fleet', 'demand', 'depot', 'finances', 'company'];
const TRANSPORT_PANEL_META = {
  routes: { icon: '🗺', labelKey: 'transport.tab.routes', width: '760px' },
  fleet: { icon: '🚌', labelKey: 'transport.tab.fleet', width: '760px' },
  demand: { icon: '👥', labelKey: 'transport.tab.demand', width: '760px' },
  depot: { icon: '🏭', labelKey: 'transport.tab.depot', width: '460px' },
  finances: { icon: '📈', labelKey: 'transport.tab.finances', width: '760px' },
  company: { icon: '🏢', labelKey: 'transport.tab.company', width: '420px' },
};
const transportPanels = new Map();
let transportPanelCascade = 0;
let transportPanelZCounter = 0;
let transportFocusedPanelId = '';

// "Is the UI layer currently open" - orthogonal to isTransportExpansionActive()
// (the gameplay-effects gate, transport-expansion.js), per TRANSPORT_TTD_SPEC.md
// §13: a player can have routes running with the expansion active while never
// opening Transport Mode this session.
let isTransportModeActive = false;

function transportEscapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function transportFormatMoney(value, signed = false) {
  const amount = Math.round(Number(value) || 0);
  const sign = signed && amount > 0 ? '+' : '';
  return `${sign}$${amount.toLocaleString()}`;
}

function transportFormatPercent(value) {
  return `${Math.round(Math.max(0, Number(value) || 0) * 100)}%`;
}

function ensureTransportPanelStyle() {
  if (typeof document === 'undefined' || document.getElementById('transport-window-style')) return;
  const style = document.createElement('style');
  style.id = 'transport-window-style';
  style.textContent = `
    .transport-panel-window {
      position: fixed; z-index: 360; max-height: calc(100vh - 120px); display: flex; flex-direction: column;
      color: #20252a; background: #ece7d8; border: 2px solid #313b43; border-radius: 8px;
      box-shadow: 0 14px 38px rgba(0,0,0,.42); font: 12px/1.35 Arial, sans-serif;
    }
    .transport-panel-window[hidden] { display: none !important; }
    .transport-panel-window.is-focused { border-color:#123f58; box-shadow:0 16px 42px rgba(0,0,0,.5); }
    .transport-panel-head { display:flex; align-items:center; gap:8px; padding:8px 10px; background:#263a48; color:#fff; font-weight:800; cursor:move; user-select:none; }
    .transport-panel-icon { font-size:16px; line-height:1; }
    .transport-panel-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .transport-panel-close { border:0; background:transparent; color:#fff; font-size:18px; line-height:1; padding:0 2px; cursor:pointer; }
    .transport-panel-close:hover { color:#ffb4b4; }
    .transport-panel-body { overflow:auto; padding:12px; }
    .transport-panel-window .transport-gate { text-align:center; padding:28px 18px; }
    .transport-panel-window .transport-gate h3 { margin:0 0 8px; font-size:18px; }
    .transport-panel-window .transport-gate p { margin:0 auto 14px; max-width:430px; color:#58616a; }
    .transport-panel-window button { font:inherit; }
    .transport-panel-window .transport-btn { border:1px solid #52636f; border-radius:5px; padding:6px 9px; background:#f7f3e8; color:#26323a; cursor:pointer; }
    .transport-panel-window .transport-btn:hover { background:#fff; }
    .transport-panel-window .transport-btn.primary { color:#fff; background:#236c91; border-color:#164f6e; font-weight:700; }
    .transport-panel-window .transport-btn.danger { color:#8b1f1f; border-color:#a75a5a; }
    .transport-panel-window .transport-summary { display:grid; grid-template-columns:repeat(5, minmax(86px,1fr)); gap:6px; margin-bottom:10px; }
    .transport-panel-window .transport-summary-card { padding:7px; background:#faf7ed; border:1px solid #c8c0ad; border-radius:5px; }
    .transport-panel-window .transport-summary-card span { display:block; color:#6a665c; font-size:10px; }
    .transport-panel-window .transport-summary-card strong { display:block; margin-top:2px; font-size:14px; }
    .transport-panel-window .transport-depots { margin:0 0 10px; color:#4f5960; }
    .transport-panel-window .transport-routes { display:grid; gap:7px; }
    .transport-panel-window .transport-empty { padding:18px; text-align:center; border:1px dashed #a69d89; border-radius:6px; color:#686155; }
    .transport-panel-window .transport-route { border:1px solid #aaa18e; border-left:7px solid var(--route-color); border-radius:6px; padding:8px; background:#f8f4e8; }
    .transport-panel-window .transport-route-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
    .transport-panel-window .transport-route-name { font-weight:800; font-size:14px; }
    .transport-panel-window .transport-status { border-radius:12px; padding:2px 7px; background:#dce7dd; color:#285d35; white-space:nowrap; }
    .transport-panel-window .transport-status[data-status="broken"] { background:#f3d6d2; color:#8d2924; }
    .transport-panel-window .transport-status[data-status="suspended"], .transport-panel-window .transport-status[data-status="weather"] { background:#ece3c9; color:#765d1c; }
    .transport-panel-window .transport-route-stops { margin:5px 0; color:#5d5a53; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .transport-panel-window .transport-route-fleet-toggle { border:0; background:transparent; padding:0; margin-top:2px; color:#4f5960; font:inherit; font-size:11px; cursor:pointer; }
    .transport-panel-window .transport-route-fleet-toggle:hover, .transport-panel-window .transport-route-fleet-toggle.is-open { color:#164f6e; font-weight:700; }
    .transport-panel-window .transport-route-fleet { display:grid; gap:4px; margin:6px 0; }
    .transport-panel-window .transport-route-vehicle { display:grid; grid-template-columns:1fr auto auto auto; gap:8px; align-items:center; text-align:left; padding:5px 7px; border:1px solid #b3ab98; border-radius:5px; background:#fffaf0; font:inherit; cursor:pointer; }
    .transport-panel-window .transport-route-vehicle:hover { background:#fff; border-color:#164f6e; }
    .transport-panel-window .transport-route-vehicle span:first-child { font-weight:700; }
    .transport-panel-window .transport-route-error { margin:4px 0; color:#992f2a; font-weight:700; }
    .transport-panel-window .transport-metrics { display:grid; grid-template-columns:repeat(4,minmax(70px,1fr)); gap:4px; margin:7px 0; }
    .transport-panel-window .transport-metric { background:#ebe5d5; border-radius:4px; padding:4px; }
    .transport-panel-window .transport-metric span { display:block; color:#777064; font-size:9px; }
    .transport-panel-window .transport-metric strong { font-size:11px; }
    .transport-panel-window .transport-actions { display:flex; gap:5px; justify-content:flex-end; flex-wrap:wrap; }
    .transport-panel-window .transport-editor { border:1px solid #9d9584; border-radius:7px; padding:10px; background:#f9f6ec; }
    .transport-panel-window .transport-editor h3 { margin:0 0 9px; }
    .transport-panel-window .transport-fields { display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:7px; }
    .transport-panel-window label { display:grid; gap:3px; color:#5e5a50; }
    .transport-panel-window .transport-checkbox-field { grid-column:1 / -1; display:flex; flex-direction:row; align-items:center; gap:6px; }
    .transport-panel-window .transport-checkbox-field input { width:auto; }
    .transport-panel-window input { min-width:0; border:1px solid #9d9584; border-radius:4px; padding:5px; background:#fff; color:#222; }
    .transport-panel-window input[type="color"] { width:100%; min-height:29px; padding:2px; }
    .transport-panel-window .transport-stop-picker { display:flex; justify-content:space-between; align-items:center; gap:8px; margin:10px 0 6px; }
    .transport-panel-window .transport-picker-hint { margin:0 0 7px; color:#236c91; }
    .transport-panel-window .transport-stop-list { display:grid; gap:4px; min-height:42px; }
    .transport-panel-window .transport-stop-row { display:grid; grid-template-columns:28px 1fr auto auto auto; align-items:center; gap:4px; padding:4px; background:#ebe5d5; border-radius:4px; }
    .transport-panel-window .transport-stop-row strong { text-align:center; }
    .transport-panel-window .transport-icon-btn { border:1px solid #a49b87; border-radius:4px; background:#fffaf0; cursor:pointer; min-width:25px; min-height:24px; }
    .transport-panel-window .transport-editor-actions { display:flex; justify-content:flex-end; gap:7px; margin-top:10px; }
    .transport-panel-window .transport-message { min-height:17px; margin-top:7px; color:#4f6270; }
    .transport-panel-window .transport-message[data-tone="error"] { color:#9b2929; }
    .transport-panel-window .transport-message[data-tone="success"] { color:#1b7045; }
    .transport-panel-window .transport-company-form { display:grid; gap:9px; max-width:380px; }
    .transport-panel-window .transport-company-meta { display:flex; justify-content:space-between; gap:8px; color:#5e5a50; margin-top:2px; }
    .transport-panel-window .transport-depot-select { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; margin-bottom:10px; }
    .transport-panel-window .transport-depot-select label { flex:1; }
    .transport-panel-window .transport-depot-select select { width:100%; border:1px solid #9d9584; border-radius:4px; padding:5px; background:#fff; }
    .transport-panel-window h4 { margin:12px 0 6px; color:#3c4650; }
    .transport-panel-window .transport-vehicle-classes, .transport-panel-window .transport-vehicle-list { display:grid; gap:6px; }
    .transport-panel-window .transport-vehicle-class-row, .transport-panel-window .transport-vehicle-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 8px; background:#f8f4e8; border:1px solid #aaa18e; border-radius:6px; }
    .transport-panel-window .transport-vehicle-row select { border:1px solid #9d9584; border-radius:4px; padding:4px; background:#fff; min-width:120px; }
    .transport-panel-window .transport-vehicle-class-row small, .transport-panel-window .transport-vehicle-row small { display:block; color:#6a665c; }
    .transport-panel-window .transport-section-head { display:flex; justify-content:space-between; align-items:flex-end; gap:10px; margin:0 0 8px; }
    .transport-panel-window .transport-section-head h3 { margin:0; font-size:15px; }
    .transport-panel-window .transport-section-head p { margin:2px 0 0; color:#6a665c; }
    .transport-panel-window .transport-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px; }
    .transport-panel-window .transport-toolbar select { border:1px solid #8f8776; border-radius:3px; padding:5px 7px; background:#fffaf0; color:#252b2f; }
    .transport-panel-window .transport-table-wrap { overflow:auto; border:1px solid #9e9685; background:#fffaf0; }
    .transport-panel-window .transport-table { width:100%; border-collapse:collapse; font-size:11px; }
    .transport-panel-window .transport-table th { position:sticky; top:0; z-index:1; padding:6px; text-align:left; white-space:nowrap; color:#fff; background:#3c535f; }
    .transport-panel-window .transport-table td { padding:6px; border-top:1px solid #d4ccbc; vertical-align:middle; }
    .transport-panel-window .transport-table tbody tr:nth-child(even) { background:#f1ebdc; }
    .transport-panel-window .transport-table tbody tr:hover { background:#fff; }
    .transport-panel-window .transport-table .is-positive { color:#176a43; font-weight:800; }
    .transport-panel-window .transport-table .is-negative { color:#a22c2c; font-weight:800; }
    .transport-panel-window .transport-line-cell { display:flex; align-items:center; gap:6px; min-width:120px; }
    .transport-panel-window .transport-line-swatch { width:7px; height:22px; border:1px solid rgba(0,0,0,.25); background:var(--route-color); flex:0 0 auto; }
    .transport-panel-window .transport-usage { min-width:82px; }
    .transport-panel-window .transport-bar { position:relative; height:8px; margin-top:3px; overflow:hidden; border:1px solid #817969; background:#d8d1c3; }
    .transport-panel-window .transport-bar > i { display:block; height:100%; width:var(--value); background:#2b8a57; }
    .transport-panel-window .transport-bar.demand > i { background:#d28b22; }
    .transport-panel-window .transport-demand-badge { display:inline-block; min-width:54px; border-radius:10px; padding:2px 6px; text-align:center; color:#fff; background:#78838a; font-weight:800; }
    .transport-panel-window .transport-demand-badge[data-level="high"] { background:#b84732; }
    .transport-panel-window .transport-demand-badge[data-level="medium"] { background:#ce8a22; }
    .transport-panel-window .transport-demand-badge[data-level="low"] { background:#40865a; }
    .transport-panel-window .transport-buy-catalog { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
    .transport-panel-window .transport-buy-card { display:grid; grid-template-columns:40px 1fr auto; align-items:center; gap:9px; padding:9px; border:1px solid #99917f; background:#f8f4e8; }
    .transport-panel-window .transport-buy-icon { display:grid; place-items:center; width:36px; height:36px; border:1px solid #a49b87; background:#e8e1d2; font-size:21px; }
    .transport-panel-window .transport-buy-stats { color:#6a665c; font-size:10px; }
    .transport-panel-window .transport-finance-total td { border-top:2px solid #6b6355; font-weight:800; }
    .transport-panel-window .transport-note { padding:7px 9px; border-left:4px solid #236c91; background:#e3edf0; color:#3f515a; }
    @media (max-width:720px) {
      .transport-panel-window { width:calc(100vw - 16px) !important; }
      .transport-panel-window .transport-summary { grid-template-columns:repeat(2,1fr); }
      .transport-panel-window .transport-fields { grid-template-columns:1fr 1fr; }
      .transport-panel-window .transport-metrics { grid-template-columns:repeat(3,1fr); }
      .transport-panel-window .transport-buy-catalog { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
}

// §5/§10/§11: brings a window to the front and marks it visually focused -
// mirrors vehicle-tracker.js's focusVehicleTrackingWindow so both window
// families behave the same way (click/drag raises, Escape targets the
// front-most one).
function focusTransportPanel(id) {
  const panel = transportPanels.get(id);
  if (!panel) return;
  transportFocusedPanelId = id;
  transportPanelZCounter += 1;
  panel.root.style.zIndex = String(360 + transportPanelZCounter);
  transportPanels.forEach((entry, key) => entry.root.classList.toggle('is-focused', key === id));
}

function beginTransportPanelDrag(event, panel) {
  if (event.button !== 0 || event.target.closest('button')) return;
  event.preventDefault();
  focusTransportPanel(panel.id);
  const rect = panel.root.getBoundingClientRect();
  panel.dragOffsetX = event.clientX - rect.left;
  panel.dragOffsetY = event.clientY - rect.top;
  panel.dragPointerId = event.pointerId;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function moveTransportPanelDrag(event, panel) {
  if (panel.dragPointerId !== event.pointerId) return;
  event.preventDefault();
  const width = panel.root.offsetWidth;
  const height = panel.root.offsetHeight;
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);
  panel.root.style.left = `${Math.max(0, Math.min(maxX, event.clientX - panel.dragOffsetX))}px`;
  panel.root.style.top = `${Math.max(0, Math.min(maxY, event.clientY - panel.dragOffsetY))}px`;
  panel.root.style.right = 'auto';
}

function endTransportPanelDrag(event, panel) {
  if (panel.dragPointerId !== event.pointerId) return;
  panel.dragPointerId = null;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
}

// Lazily builds one independent window for the given tab id (routes/fleet/
// demand/depot/finances/company). Each is its own free-floating, draggable
// #transport-panel-window - OpenTTD's toolbar-launched windows, not tabs
// sharing one big panel that used to eat most of the screen.
function createTransportPanel(id) {
  if (transportPanels.has(id) || typeof document === 'undefined') return transportPanels.get(id);
  ensureTransportPanelStyle();
  const meta = TRANSPORT_PANEL_META[id];
  const root = document.createElement('section');
  root.className = 'transport-panel-window';
  root.dataset.transportPanel = id;
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.style.width = `min(${meta.width}, calc(100vw - 44px))`;
  const cascade = (transportPanelCascade++ % 8) * 26;
  root.style.top = `${92 + cascade}px`;
  root.style.left = `${Math.max(12, window.innerWidth - 780 - cascade)}px`;
  root.innerHTML = `
    <div class="transport-panel-head" data-transport-panel-head>
      <span class="transport-panel-icon" aria-hidden="true">${meta.icon}</span>
      <span class="transport-panel-title" data-transport-panel-title></span>
      <button class="transport-panel-close" type="button" data-transport-panel-close aria-label="Close">×</button>
    </div>
    <div class="transport-panel-body" data-transport-panel-body></div>
  `;
  document.body.appendChild(root);
  const panel = {
    id,
    root,
    body: root.querySelector('[data-transport-panel-body]'),
    titleEl: root.querySelector('[data-transport-panel-title]'),
    dragOffsetX: 0,
    dragOffsetY: 0,
    dragPointerId: null,
  };
  transportPanels.set(id, panel);
  const head = root.querySelector('[data-transport-panel-head]');
  root.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    focusTransportPanel(id);
  });
  root.addEventListener('click', handleTransportUiClick);
  root.addEventListener('input', handleTransportUiInput);
  root.addEventListener('change', handleTransportUiChange);
  root.querySelector('[data-transport-panel-close]').addEventListener('click', () => closeTransportPanel(id));
  head.addEventListener('pointerdown', (event) => beginTransportPanelDrag(event, panel));
  head.addEventListener('pointermove', (event) => moveTransportPanelDrag(event, panel));
  head.addEventListener('pointerup', (event) => endTransportPanelDrag(event, panel));
  return panel;
}

function openTransportPanel(id) {
  if (!TRANSPORT_PANEL_META[id]) return;
  const panel = createTransportPanel(id);
  if (!panel) return;
  panel.root.hidden = false;
  focusTransportPanel(id);
  refreshTransportPanel(id);
  updateTransportTopbarPanelButtonStates();
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
}

function closeTransportPanel(id) {
  const panel = transportPanels.get(id);
  if (!panel || panel.root.hidden) return;
  panel.root.hidden = true;
  if (id === 'routes') {
    transportUiState.pickingStops = false;
    transportUiState.editor = null;
  }
  updateTransportTopbarPanelButtonStates();
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
}

function toggleTransportPanel(id) {
  const panel = transportPanels.get(id);
  if (panel && !panel.root.hidden) closeTransportPanel(id);
  else openTransportPanel(id);
}

function closeAllTransportPanels() {
  transportPanels.forEach((panel, id) => {
    if (!panel.root.hidden) closeTransportPanel(id);
  });
}

function isAnyTransportPanelOpen() {
  for (const panel of transportPanels.values()) {
    if (!panel.root.hidden) return true;
  }
  return false;
}

function updateTransportTopbarPanelButtonStates() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('#transport-topbar-tools [data-transport-topbar-panel]').forEach((button) => {
    const panel = transportPanels.get(button.dataset.transportTopbarPanel);
    button.classList.toggle('is-open', !!panel && !panel.root.hidden);
  });
}

function setTransportUiMessage(message, tone = 'info') {
  transportUiState.message = String(message || '');
  transportUiState.messageTone = tone;
}

function getTransportRouteStatus(route) {
  const runtime = typeof getTransportRouteRuntime === 'function'
    ? getTransportRouteRuntime(route.id)
    : null;
  if (runtime?.status === 'active' && typeof isTransportSevereWeather === 'function' && isTransportSevereWeather()) {
    return 'weather';
  }
  return runtime?.status ?? route.status ?? 'broken';
}

function renderTransportGate(body, state) {
  if (!isExpansionAvailable('transport')) {
    body.innerHTML = `
      <div class="transport-gate">
        <h3>${transportEscapeHtml(t('transport.unavailableTitle'))}</h3>
        <p>${transportEscapeHtml(t('transport.unavailableDesc'))}</p>
      </div>`;
    return true;
  }
  if (!state.enabled) {
    body.innerHTML = `
      <div class="transport-gate">
        <h3>${transportEscapeHtml(t('transport.enableTitle'))}</h3>
        <p>${transportEscapeHtml(t('transport.enableDesc'))}</p>
        <button class="transport-btn primary" type="button" data-transport-action="enable">${transportEscapeHtml(t('transport.enableButton'))}</button>
      </div>`;
    return true;
  }
  if (!state.unlocked) {
    body.innerHTML = `
      <div class="transport-gate">
        <h3>${transportEscapeHtml(t('transport.lockedTitle'))}</h3>
        <p>${transportEscapeHtml(t('transport.lockedDesc'))}</p>
        <strong>${transportEscapeHtml(t('transport.unlockProgress', { population: Math.round(city.population || 0).toLocaleString() }))}</strong>
      </div>`;
    return true;
  }
  return false;
}

function renderTransportEditor() {
  const editor = transportUiState.editor;
  if (!editor) return '';
  const stops = editor.stopIds.map(getTransportStopById).filter(Boolean);
  const stopRows = stops.length > 0 ? stops.map((stop, index) => `
    <div class="transport-stop-row">
      <strong>${index + 1}</strong>
      <span>${transportEscapeHtml(getTransportStopDisplayName(stop, index))} <small>(${stop.row}, ${stop.col})</small></span>
      <button class="transport-icon-btn" type="button" data-transport-action="stop-up" data-index="${index}" title="${transportEscapeHtml(t('transport.moveUp'))}" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button class="transport-icon-btn" type="button" data-transport-action="stop-down" data-index="${index}" title="${transportEscapeHtml(t('transport.moveDown'))}" ${index === stops.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="transport-icon-btn" type="button" data-transport-action="stop-remove" data-index="${index}" title="${transportEscapeHtml(t('transport.removeStop'))}">×</button>
    </div>`).join('') : `<div class="transport-empty">${transportEscapeHtml(t('transport.error.needsStops'))}</div>`;
  return `
    <div class="transport-editor">
      <h3>${transportEscapeHtml(t(editor.routeId ? 'transport.editRoute' : 'transport.newRoute'))}</h3>
      <div class="transport-fields">
        <label>${transportEscapeHtml(t('transport.routeName'))}<input data-transport-field="name" maxlength="60" value="${transportEscapeHtml(editor.name)}" /></label>
        <label>${transportEscapeHtml(t('transport.routeColor'))}<input data-transport-field="color" type="color" value="${transportEscapeHtml(editor.color)}" /></label>
        <label>${transportEscapeHtml(t('transport.routeFare'))}<input data-transport-field="fare" type="number" min="15" max="60" step="5" value="${editor.fare}" /></label>
        <label class="transport-checkbox-field"><input data-transport-field="pickupPassthroughStops" type="checkbox" ${editor.pickupPassthroughStops ? 'checked' : ''} /> ${transportEscapeHtml(t('transport.routePickupPassthroughStops'))}</label>
      </div>
      <div class="transport-stop-picker">
        <strong>${transportEscapeHtml(t('transport.routeStops'))} (${stops.length})</strong>
        <button class="transport-btn ${transportUiState.pickingStops ? 'primary' : ''}" type="button" data-transport-action="pick-stops">${transportEscapeHtml(t(transportUiState.pickingStops ? 'transport.stopPickerActive' : 'transport.pickStops'))}</button>
      </div>
      ${transportUiState.pickingStops ? `<p class="transport-picker-hint">${transportEscapeHtml(t('transport.stopPickerHint'))}</p>` : ''}
      <div class="transport-stop-list">${stopRows}</div>
      <p class="transport-note">${transportEscapeHtml(t('transport.orders.shared'))}</p>
      <div class="transport-editor-actions">
        <button class="transport-btn" type="button" data-transport-action="cancel-editor">${transportEscapeHtml(t('transport.cancel'))}</button>
        <button class="transport-btn primary" type="button" data-transport-action="save-route">${transportEscapeHtml(t('transport.saveRoute'))}</button>
      </div>
      <div class="transport-message" data-tone="${transportEscapeHtml(transportUiState.messageTone)}">${transportEscapeHtml(transportUiState.message)}</div>
    </div>`;
}

function renderTransportRouteCard(route, index) {
  const status = getTransportRouteStatus(route);
  const runtime = typeof getTransportRouteRuntime === 'function'
    ? getTransportRouteRuntime(route.id)
    : null;
  const stats = route.lastStats || {};
  const stops = route.stopIds.map(getTransportStopById).filter(Boolean);
  const stopText = stops.map((stop, stopIndex) => getTransportStopDisplayName(stop, stopIndex)).join(' → ');
  const metrics = [
    [t('transport.metric.headway'), `${Math.round(stats.headwayMinutes || 0)} min`],
    [t('transport.metric.wait'), `${Math.round(stats.waitMinutes || 0)} min`],
    [t('transport.metric.passengers'), Math.round(stats.monthlyPassengers || 0).toLocaleString()],
    [t('transport.metric.load'), transportFormatPercent(stats.loadFactor || 0)],
    [t('transport.metric.reliability'), transportFormatPercent(stats.reliability || 0)],
    [t('transport.metric.fareDistance'), t('transport.metric.fareDistanceValue', {
      tiles: Number(stats.averageFareDistanceTiles || 0).toFixed(1),
    })],
    [t('transport.metric.revenue'), transportFormatMoney(stats.revenue || 0)],
    [t('transport.metric.cost'), transportFormatMoney(stats.cost || 0)],
    [t('transport.metric.net'), transportFormatMoney(stats.net || 0, true)],
  ].map(([label, value]) => `<div class="transport-metric"><span>${transportEscapeHtml(label)}</span><strong>${transportEscapeHtml(value)}</strong></div>`).join('');
  const routeVehicles = typeof getTransportRouteVehicles === 'function'
    ? getTransportRouteVehicles(route.id)
    : [];
  const expanded = transportUiState.expandedRouteId === route.id;
  // OpenTTD-style vehicle list: the bus-count chip expands this route's
  // fleet; each row opens the tracking window with camera-follow on.
  const vehicleRows = !expanded ? '' : `
    <div class="transport-route-fleet">
      ${routeVehicles.length === 0
        ? `<div class="transport-empty">${transportEscapeHtml(t('transport.routeFleet.empty'))}</div>`
        : routeVehicles.map((vehicle) => `
          <button class="transport-route-vehicle" type="button" data-transport-action="track-vehicle" data-vehicle-id="${transportEscapeHtml(vehicle.id)}" title="${transportEscapeHtml(t('transport.routeFleet.track'))}">
            <span>🚌 ${transportEscapeHtml(vehicle.id)}</span>
            <span>${transportEscapeHtml(t(`transport.vehicleStatus.${vehicle.status}`))}</span>
            <span>👤 ${vehicle.passengersAboard}</span>
            <span>${transportEscapeHtml(transportFormatPercent(vehicle.condition))}</span>
          </button>`).join('')}
    </div>`;
  return `
    <article class="transport-route" style="--route-color:${transportEscapeHtml(route.color)}">
      <div class="transport-route-head">
        <div>
          <div class="transport-route-name">${transportEscapeHtml(route.name)}</div>
          <button class="transport-route-fleet-toggle${expanded ? ' is-open' : ''}" type="button" data-transport-action="toggle-route-vehicles" data-route-id="${transportEscapeHtml(route.id)}" title="${transportEscapeHtml(t('transport.routeFleet.toggle'))}">${routeVehicles.length} 🚌 · ${transportEscapeHtml(t('transport.farePerTileShort', { fare: Number(route.fare).toFixed(0) }))} ${expanded ? '▴' : '▾'}</button>
        </div>
        <span class="transport-status" data-status="${transportEscapeHtml(status)}">${transportEscapeHtml(t(`transport.status.${status}`))}</span>
      </div>
      ${vehicleRows}
      <div class="transport-route-stops" title="${transportEscapeHtml(stopText)}">${transportEscapeHtml(stopText)}</div>
      ${status === 'broken' && runtime?.brokenReason
        ? `<div class="transport-route-error">${transportEscapeHtml(transportRouteErrorMessage({ code: runtime.brokenReason }))}</div>`
        : ''}
      ${status === 'broken' && runtime?.brokenPoint
        ? `<div class="transport-route-error">${transportEscapeHtml(t('transport.breakpoint', runtime.brokenPoint))}</div>`
        : ''}
      <div class="transport-metrics">${metrics}</div>
      <div class="transport-actions">
        <button class="transport-btn" type="button" data-transport-action="edit-route" data-route-id="${transportEscapeHtml(route.id)}">${transportEscapeHtml(t('transport.orders.edit'))}</button>
        <button class="transport-btn" type="button" data-transport-action="toggle-route" data-route-id="${transportEscapeHtml(route.id)}">${transportEscapeHtml(t(route.status === 'suspended' ? 'transport.resume' : 'transport.suspend'))}</button>
        <button class="transport-btn danger" type="button" data-transport-action="delete-route" data-route-id="${transportEscapeHtml(route.id)}">${transportEscapeHtml(t('transport.delete'))}</button>
      </div>
    </article>`;
}

function renderTransportRoutesTab(state) {
  const summary = getTransportSummary();
  const financials = getTransportFinancials();
  const depots = listTransportDepots();
  const connectedDepots = depots.filter((depot) => depot.connected).length;
  const summaryCards = [
    [t('transport.summary.routes'), `${summary.activeRoutes} / ${summary.totalRoutes}`],
    [t('transport.summary.passengers'), Math.round(summary.monthlyPassengers).toLocaleString()],
    [t('transport.summary.coverage'), transportFormatPercent(summary.residentialCoverage)],
    [t('transport.summary.fleet'), `${summary.fleetAllocated} / ${summary.fleetCapacity}`],
    [t('transport.summary.finance'), transportFormatMoney(financials.net, true)],
  ].map(([label, value]) => `<div class="transport-summary-card"><span>${transportEscapeHtml(label)}</span><strong>${transportEscapeHtml(value)}</strong></div>`).join('');
  const routes = state.routes.length > 0
    ? state.routes.map(renderTransportRouteCard).join('')
    : `<div class="transport-empty">${transportEscapeHtml(t('transport.noRoutes'))}</div>`;
  return `
    ${transportUiState.editor ? '' : `<div class="transport-actions"><button class="transport-btn primary" type="button" data-transport-action="new-route">${transportEscapeHtml(t('transport.newRoute'))}</button></div>`}
    <div class="transport-summary">${summaryCards}</div>
    <p class="transport-depots">${transportEscapeHtml(t('transport.depots', { connected: connectedDepots, total: depots.length }))}</p>
    ${transportUiState.editor ? renderTransportEditor() : `<div class="transport-routes">${routes}</div>`}
  `;
}

function transportProfitClass(value) {
  const amount = Number(value) || 0;
  if (amount > 0) return 'is-positive';
  if (amount < 0) return 'is-negative';
  return '';
}

function getTransportVehicleEstimatedProfit(vehicle, state) {
  if (!vehicle.routeId) return 0;
  const route = state.routes.find((entry) => entry.id === vehicle.routeId);
  if (!route) return 0;
  const assigned = Math.max(1, getTransportRouteVehicles(route.id).length);
  return Math.round((Number(route.lastStats?.net) || 0) / assigned);
}

function renderTransportFleetTab(state) {
  const routesById = new Map(state.routes.map((route) => [route.id, route]));
  const vehicles = Array.from(state.vehicles);
  const sorters = {
    number: (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }),
    route: (a, b) => String(routesById.get(a.routeId)?.name || '').localeCompare(String(routesById.get(b.routeId)?.name || '')),
    age: (a, b) => b.ageMonths - a.ageMonths,
    condition: (a, b) => a.condition - b.condition,
    load: (a, b) => {
      const aClass = getTransportVehicleClass(a.classId);
      const bClass = getTransportVehicleClass(b.classId);
      return (b.passengersAboard / bClass.capacity) - (a.passengersAboard / aClass.capacity);
    },
    profit: (a, b) => getTransportVehicleEstimatedProfit(b, state) - getTransportVehicleEstimatedProfit(a, state),
  };
  vehicles.sort(sorters[transportUiState.fleetSort] || sorters.number);
  const capacity = vehicles.reduce((sum, vehicle) => sum + getTransportVehicleClass(vehicle.classId).capacity, 0);
  const aboard = vehicles.reduce((sum, vehicle) => sum + vehicle.passengersAboard, 0);
  const usage = capacity > 0 ? aboard / capacity : 0;
  const sortOptions = ['number', 'route', 'age', 'condition', 'load', 'profit'].map((id) => (
    `<option value="${id}" ${transportUiState.fleetSort === id ? 'selected' : ''}>${transportEscapeHtml(t(`transport.fleet.sort.${id}`))}</option>`
  )).join('');
  const rows = vehicles.map((vehicle) => {
    const vehicleClass = getTransportVehicleClass(vehicle.classId);
    const route = routesById.get(vehicle.routeId);
    const load = vehicleClass.capacity > 0 ? vehicle.passengersAboard / vehicleClass.capacity : 0;
    const estimatedProfit = getTransportVehicleEstimatedProfit(vehicle, state);
    const routeOptions = [`<option value="">${transportEscapeHtml(t('transport.depot.unassigned'))}</option>`]
      .concat(state.routes.map((entry) => (
        `<option value="${transportEscapeHtml(entry.id)}" ${entry.id === vehicle.routeId ? 'selected' : ''}>${transportEscapeHtml(entry.name)}</option>`
      )))
      .join('');
    const orders = vehicle.status === 'depot'
      ? `<select data-transport-assign-vehicle="${transportEscapeHtml(vehicle.id)}">${routeOptions}</select>`
      : (route
        ? `<span class="transport-line-cell"><i class="transport-line-swatch" style="--route-color:${transportEscapeHtml(route.color)}"></i>${transportEscapeHtml(route.name)}</span>`
        : transportEscapeHtml(t('transport.depot.unassigned')));
    const sendButton = ['active', 'returning_for_service', 'broken_down'].includes(vehicle.status)
      ? `<button class="transport-btn" type="button" data-transport-action="send-vehicle-depot" data-vehicle-id="${transportEscapeHtml(vehicle.id)}">${transportEscapeHtml(t('transport.fleet.sendDepot'))}</button>`
      : '';
    const sellButton = vehicle.status === 'depot'
      ? `<button class="transport-btn danger" type="button" data-transport-action="sell-vehicle" data-vehicle-id="${transportEscapeHtml(vehicle.id)}">${transportEscapeHtml(t('transport.depot.sell'))}</button>`
      : '';
    return `
      <tr>
        <td><strong>🚌 ${transportEscapeHtml(vehicle.id)}</strong><br><small>${transportEscapeHtml(t(`transport.vehicleClass.${vehicle.classId}`))}</small></td>
        <td>${transportEscapeHtml(t(`transport.vehicleStatus.${vehicle.status}`))}</td>
        <td>${orders}</td>
        <td class="transport-usage"><strong>${vehicle.passengersAboard} / ${vehicleClass.capacity}</strong><div class="transport-bar" style="--value:${Math.round(Math.min(1, load) * 100)}%"><i></i></div></td>
        <td class="transport-usage"><strong>${transportEscapeHtml(transportFormatPercent(vehicle.condition))}</strong><div class="transport-bar" style="--value:${Math.round(vehicle.condition * 100)}%"><i></i></div></td>
        <td>${transportEscapeHtml(t('transport.depot.age', { months: vehicle.ageMonths }))}</td>
        <td class="${transportProfitClass(estimatedProfit)}">${transportEscapeHtml(transportFormatMoney(estimatedProfit, true))}</td>
        <td><div class="transport-actions"><button class="transport-btn primary" type="button" data-transport-action="track-vehicle" data-vehicle-id="${transportEscapeHtml(vehicle.id)}">${transportEscapeHtml(t('transport.routeFleet.track'))}</button>${sendButton}${sellButton}</div></td>
      </tr>`;
  }).join('');
  return `
    <div class="transport-section-head">
      <div><h3>${transportEscapeHtml(t('transport.fleet.title'))}</h3><p>${transportEscapeHtml(t('transport.fleet.subtitle'))}</p></div>
    </div>
    <div class="transport-toolbar">
      <label>${transportEscapeHtml(t('transport.fleet.sort'))}<select data-transport-fleet-sort>${sortOptions}</select></label>
      <strong>${transportEscapeHtml(t('transport.fleet.usage', { percent: transportFormatPercent(usage), aboard, capacity }))}</strong>
    </div>
    ${vehicles.length === 0
      ? `<div class="transport-empty">${transportEscapeHtml(t('transport.depot.fleetEmpty'))}</div>`
      : `<div class="transport-table-wrap"><table class="transport-table">
          <thead><tr><th>${transportEscapeHtml(t('transport.fleet.vehicle'))}</th><th>${transportEscapeHtml(t('transport.fleet.status'))}</th><th>${transportEscapeHtml(t('transport.fleet.orders'))}</th><th>${transportEscapeHtml(t('transport.fleet.load'))}</th><th>${transportEscapeHtml(t('transport.fleet.condition'))}</th><th>${transportEscapeHtml(t('transport.fleet.age'))}</th><th>${transportEscapeHtml(t('transport.fleet.profit'))}</th><th>${transportEscapeHtml(t('transport.fleet.actions'))}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`}
  `;
}

function renderTransportDemandTab(state) {
  const allStops = listTransportStopSites();
  const stopRows = allStops.map((stop) => {
    const index = state.stops.indexOf(stop);
    const catchment = getTransportStopCatchmentUnits(stop);
    const waiting = getTransportStopWaitingCount(stop.id);
    const dailyDemand = Math.max(waiting, Math.round(catchment.originUnits * TRANSPORT_STOP_DAILY_BOARDING_SHARE));
    const servingRoutes = state.routes.filter((route) => route.stopIds.includes(stop.id));
    const activeServingRoutes = servingRoutes.filter((route) => getTransportRouteStatus(route) === 'active');
    let level = 'none';
    if (dailyDemand >= 50) level = 'high';
    else if (dailyDemand >= 20) level = 'medium';
    else if (dailyDemand > 0) level = 'low';
    return { stop, index, catchment, waiting, dailyDemand, servingRoutes, activeServingRoutes, level };
  }).sort((a, b) => b.dailyDemand - a.dailyDemand || b.waiting - a.waiting);
  const waitingTotal = stopRows.reduce((sum, entry) => sum + entry.waiting, 0);
  const servedStops = stopRows.filter((entry) => entry.activeServingRoutes.length > 0).length;
  const unservedDemand = stopRows
    .filter((entry) => entry.activeServingRoutes.length === 0)
    .reduce((sum, entry) => sum + entry.dailyDemand, 0);
  const summary = getTransportSummary();
  const cards = [
    [t('transport.demand.waitingTotal'), waitingTotal.toLocaleString()],
    [t('transport.demand.servedStops'), `${servedStops} / ${stopRows.length}`],
    [t('transport.demand.unserved'), unservedDemand.toLocaleString()],
    [t('transport.summary.coverage'), transportFormatPercent(summary.residentialCoverage)],
    [t('transport.demand.monthlyPassengers'), Math.round(summary.monthlyPassengers).toLocaleString()],
  ].map(([label, value]) => `<div class="transport-summary-card"><span>${transportEscapeHtml(label)}</span><strong>${transportEscapeHtml(value)}</strong></div>`).join('');
  const rows = stopRows.map((entry) => {
    const routeNames = entry.servingRoutes.length > 0
      ? entry.servingRoutes.map((route) => route.name).join(', ')
      : t('transport.stopInspector.noRoutes');
    return `
      <tr>
        <td><strong>${transportEscapeHtml(getTransportStopDisplayName(entry.stop, entry.index))}</strong><br><small>(${entry.stop.row}, ${entry.stop.col})</small></td>
        <td><span class="transport-demand-badge" data-level="${entry.level}">${transportEscapeHtml(t(`transport.demand.level.${entry.level}`))}</span></td>
        <td><strong>👤 ${entry.waiting}</strong><br><small>${transportEscapeHtml(t('transport.demand.daily', { value: entry.dailyDemand }))}</small></td>
        <td>${Math.round(entry.catchment.originUnits).toLocaleString()}</td>
        <td>${Math.round(entry.catchment.destinationUnits).toLocaleString()}</td>
        <td>${transportEscapeHtml(routeNames)}</td>
        <td><button class="transport-btn" type="button" data-transport-action="locate-stop" data-stop-id="${transportEscapeHtml(entry.stop.id)}">${transportEscapeHtml(t('transport.demand.locate'))}</button></td>
      </tr>`;
  }).join('');
  return `
    <div class="transport-section-head"><div><h3>${transportEscapeHtml(t('transport.demand.title'))}</h3><p>${transportEscapeHtml(t('transport.demand.subtitle'))}</p></div></div>
    <div class="transport-summary">${cards}</div>
    ${stopRows.length === 0
      ? `<div class="transport-empty">${transportEscapeHtml(t('transport.demand.empty'))}</div>`
      : `<div class="transport-table-wrap"><table class="transport-table">
          <thead><tr><th>${transportEscapeHtml(t('transport.demand.stop'))}</th><th>${transportEscapeHtml(t('transport.demand.level'))}</th><th>${transportEscapeHtml(t('transport.demand.waiting'))}</th><th>${transportEscapeHtml(t('transport.demand.origins'))}</th><th>${transportEscapeHtml(t('transport.demand.destinations'))}</th><th>${transportEscapeHtml(t('transport.demand.routes'))}</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`}
  `;
}

function getTransportFinanceHistoryRows(state) {
  if (Array.isArray(state.financeHistory) && state.financeHistory.length > 0) {
    return state.financeHistory.slice(-12).reverse();
  }
  const byPeriod = new Map();
  for (const route of state.routes) {
    for (const entry of route.history || []) {
      const key = `${entry.year}:${entry.month}`;
      const row = byPeriod.get(key) || {
        year: entry.year, month: entry.month, passengers: 0, revenue: 0,
        routeOperations: 0, depotUpkeep: 0, cost: 0, net: 0, closingCash: null,
      };
      row.passengers += Number(entry.passengers) || 0;
      row.revenue += Number(entry.revenue) || 0;
      row.routeOperations += Number(entry.cost) || 0;
      row.cost += Number(entry.cost) || 0;
      row.net += Number(entry.net) || 0;
      byPeriod.set(key, row);
    }
  }
  return Array.from(byPeriod.values())
    .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))
    .slice(0, 12);
}

function renderTransportFinancesTab(state) {
  const dayFraction = typeof getTransportMonthDayFraction === 'function' ? getTransportMonthDayFraction() : 1;
  const revenue = state.routes.reduce((sum, route) => sum + (Number(route.lastStats?.revenue) || 0), 0);
  const routeOperations = state.routes.reduce((sum, route) => sum + (Number(route.lastStats?.cost) || 0), 0);
  const depotUpkeep = Math.round(getConnectedCommissionedTransportDepots().length * TRANSPORT_DEPOT_MONTHLY_UPKEEP * dayFraction);
  const cost = routeOperations + depotUpkeep;
  const net = revenue - cost;
  const cards = [
    [t('transport.finance.companyCash'), transportFormatMoney(state.company.cash)],
    [t('transport.finance.currentRevenue'), transportFormatMoney(revenue)],
    [t('transport.finance.currentCost'), transportFormatMoney(cost)],
    [t('transport.finance.currentNet'), transportFormatMoney(net, true)],
    [t('transport.finance.depotUpkeep'), transportFormatMoney(depotUpkeep)],
  ].map(([label, value]) => `<div class="transport-summary-card"><span>${transportEscapeHtml(label)}</span><strong class="${label === t('transport.finance.currentNet') ? transportProfitClass(net) : ''}">${transportEscapeHtml(value)}</strong></div>`).join('');
  const historyRows = getTransportFinanceHistoryRows(state);
  const history = historyRows.map((entry) => `
    <tr>
      <td>${transportEscapeHtml(t('transport.finance.period', { year: entry.year, month: entry.month }))}</td>
      <td>${Math.round(entry.passengers || 0).toLocaleString()}</td>
      <td>${transportEscapeHtml(transportFormatMoney(entry.revenue))}</td>
      <td>${transportEscapeHtml(transportFormatMoney(entry.routeOperations))}</td>
      <td>${transportEscapeHtml(transportFormatMoney(entry.depotUpkeep))}</td>
      <td>${transportEscapeHtml(transportFormatMoney(entry.cost))}</td>
      <td class="${transportProfitClass(entry.net)}">${transportEscapeHtml(transportFormatMoney(entry.net, true))}</td>
      <td>${entry.closingCash == null ? '—' : transportEscapeHtml(transportFormatMoney(entry.closingCash))}</td>
    </tr>`).join('');
  const routeRows = state.routes.map((route) => {
    const stats = route.lastStats || {};
    return `
      <tr>
        <td><span class="transport-line-cell"><i class="transport-line-swatch" style="--route-color:${transportEscapeHtml(route.color)}"></i><strong>${transportEscapeHtml(route.name)}</strong></span></td>
        <td>${getTransportRouteVehicles(route.id).length}</td>
        <td>${Math.round(stats.monthlyPassengers || 0).toLocaleString()}</td>
        <td>${transportEscapeHtml(t('transport.metric.fareDistanceValue', { tiles: Number(stats.averageFareDistanceTiles || 0).toFixed(1) }))}</td>
        <td>${transportEscapeHtml(transportFormatMoney(stats.revenue || 0))}</td>
        <td>${transportEscapeHtml(transportFormatMoney(stats.cost || 0))}</td>
        <td class="${transportProfitClass(stats.net)}">${transportEscapeHtml(transportFormatMoney(stats.net || 0, true))}</td>
        <td>${transportEscapeHtml(transportFormatPercent(stats.loadFactor || 0))}</td>
      </tr>`;
  }).join('');
  return `
    <div class="transport-section-head"><div><h3>${transportEscapeHtml(t('transport.finance.title'))}</h3><p>${transportEscapeHtml(t('transport.finance.subtitle'))}</p></div></div>
    <div class="transport-summary">${cards}</div>
    <h4>${transportEscapeHtml(t('transport.finance.byRoute'))}</h4>
    ${state.routes.length === 0
      ? `<div class="transport-empty">${transportEscapeHtml(t('transport.noRoutes'))}</div>`
      : `<div class="transport-table-wrap"><table class="transport-table"><thead><tr><th>${transportEscapeHtml(t('transport.finance.route'))}</th><th>${transportEscapeHtml(t('transport.finance.vehicles'))}</th><th>${transportEscapeHtml(t('transport.metric.passengers'))}</th><th>${transportEscapeHtml(t('transport.metric.fareDistance'))}</th><th>${transportEscapeHtml(t('transport.metric.revenue'))}</th><th>${transportEscapeHtml(t('transport.metric.cost'))}</th><th>${transportEscapeHtml(t('transport.metric.net'))}</th><th>${transportEscapeHtml(t('transport.metric.load'))}</th></tr></thead><tbody>${routeRows}</tbody></table></div>`}
    <h4>${transportEscapeHtml(t('transport.finance.history'))}</h4>
    ${historyRows.length === 0
      ? `<div class="transport-empty">${transportEscapeHtml(t('transport.finance.noHistory'))}</div>`
      : `<div class="transport-table-wrap"><table class="transport-table"><thead><tr><th>${transportEscapeHtml(t('transport.finance.month'))}</th><th>${transportEscapeHtml(t('transport.metric.passengers'))}</th><th>${transportEscapeHtml(t('transport.finance.revenue'))}</th><th>${transportEscapeHtml(t('transport.finance.routeOperations'))}</th><th>${transportEscapeHtml(t('transport.finance.depotUpkeep'))}</th><th>${transportEscapeHtml(t('transport.finance.totalCost'))}</th><th>${transportEscapeHtml(t('transport.metric.net'))}</th><th>${transportEscapeHtml(t('transport.finance.closingCash'))}</th></tr></thead><tbody>${history}</tbody></table></div>`}
  `;
}

// Renders one specific panel's content (gate screen, or its tab body).
// `options.passive` is the once-a-tick HUD refresh (hud.js's updateHUD) -
// it must never blow away the routes panel's in-progress route-name/fare
// inputs mid-keystroke, so that one panel is skipped while the editor is
// open; every other open panel still refreshes normally.
function refreshTransportPanel(id, options = {}) {
  const panel = transportPanels.get(id);
  if (!panel || panel.root.hidden) return;
  if (options?.passive === true && id === 'routes' && transportUiState.editor) return;
  panel.titleEl.textContent = t(TRANSPORT_PANEL_META[id].labelKey);
  const state = getTransportExpansionState();
  if (renderTransportGate(panel.body, state)) return;
  let html = '';
  if (id === 'fleet') html = renderTransportFleetTab(state);
  else if (id === 'demand') html = renderTransportDemandTab(state);
  else if (id === 'depot') html = renderTransportDepotTab(state);
  else if (id === 'finances') html = renderTransportFinancesTab(state);
  else if (id === 'company') html = renderTransportCompanyTab(state);
  else html = renderTransportRoutesTab(state);
  panel.body.innerHTML = html;
}

function refreshTransportUi(options = {}) {
  for (const id of TRANSPORT_PANEL_IDS) refreshTransportPanel(id, options);
  updateTransportTopbarPanelButtonStates();
  updateTransportTopbarKpis();
  refreshTransportInspector();
}

function renderTransportCompanyTab(state) {
  const founded = state.company.foundedYear > 0
    ? t('transport.company.founded', { year: state.company.foundedYear, month: state.company.foundedMonth })
    : '';
  return `
    <div class="transport-company-form">
      <label>${transportEscapeHtml(t('transport.company.name'))}
        <input data-transport-field="companyName" maxlength="60" value="${transportEscapeHtml(state.company.name)}" placeholder="${transportEscapeHtml(t('transport.defaultCompanyName'))}" />
      </label>
      <label>${transportEscapeHtml(t('transport.company.president'))}
        <input data-transport-field="presidentName" maxlength="40" value="${transportEscapeHtml(state.company.presidentName)}" placeholder="${transportEscapeHtml(t('transport.defaultPresidentName'))}" />
      </label>
      <div class="transport-company-meta">
        <span>${transportEscapeHtml(t('transport.company.cash'))}: <strong>${transportEscapeHtml(transportFormatMoney(state.company.cash))}</strong></span>
        ${founded ? `<span>${transportEscapeHtml(founded)}</span>` : ''}
      </div>
      <div class="transport-editor-actions">
        <button class="transport-btn primary" type="button" data-transport-action="save-company">${transportEscapeHtml(t('transport.company.save'))}</button>
      </div>
    </div>
  `;
}

function renderTransportDepotTab(state) {
  commissionAllConnectedTransportDepots();
  const depots = listTransportDepots({ connectedOnly: true })
    .filter((depot) => state.commissionedDepotIds.includes(depot.id));
  if (depots.length === 0) {
    return `<div class="transport-empty">${transportEscapeHtml(t('transport.depot.noDepots'))}</div>`;
  }
  if (!transportUiState.selectedDepotId || !depots.some((depot) => depot.id === transportUiState.selectedDepotId)) {
    transportUiState.selectedDepotId = depots[0].id;
  }
  const depotId = transportUiState.selectedDepotId;
  const depotOptions = depots.map((depot) => (
    `<option value="${transportEscapeHtml(depot.id)}" ${depot.id === depotId ? 'selected' : ''}>${transportEscapeHtml(depot.id)}</option>`
  )).join('');
  const vehicleCount = getTransportDepotVehicleCount(depotId);
  const buyRows = listTransportVehicleClasses().map((vehicleClass) => `
    <div class="transport-buy-card">
      <div class="transport-buy-icon" aria-hidden="true">🚌</div>
      <div>
        <strong>${transportEscapeHtml(t(`transport.vehicleClass.${vehicleClass.id}`))}</strong>
        <div class="transport-buy-stats">${transportEscapeHtml(t('transport.depot.catalogStats', {
          capacity: vehicleClass.capacity,
          speed: Math.round(vehicleClass.speedFactor * 100),
          upkeep: transportFormatMoney(vehicleClass.monthlyUpkeep),
        }))}</div>
        <small>${transportEscapeHtml(t(`transport.vehicleClass.${vehicleClass.id}.desc`))}</small>
      </div>
      <div>
        <strong>${transportEscapeHtml(transportFormatMoney(vehicleClass.purchasePrice))}</strong>
        <button class="transport-btn primary" type="button" data-transport-action="buy-vehicle" data-depot-id="${transportEscapeHtml(depotId)}" data-class-id="${transportEscapeHtml(vehicleClass.id)}">${transportEscapeHtml(t('transport.depot.buy'))}</button>
      </div>
    </div>
  `).join('');
  const fleet = state.vehicles.filter((vehicle) => vehicle.depotId === depotId);
  const fleetRows = fleet.length > 0 ? fleet.map((vehicle) => {
    const canSell = vehicle.status === 'depot';
    const routeOptions = [`<option value="">${transportEscapeHtml(t('transport.depot.unassigned'))}</option>`]
      .concat(state.routes.map((entry) => (
        `<option value="${transportEscapeHtml(entry.id)}" ${entry.id === vehicle.routeId ? 'selected' : ''}>${transportEscapeHtml(entry.name)}</option>`
      )))
      .join('');
    return `
      <div class="transport-vehicle-row">
        <div>
          <strong>${transportEscapeHtml(vehicle.id)}</strong>
          <small>${transportEscapeHtml(t(`transport.vehicleClass.${vehicle.classId}`))} · ${transportEscapeHtml(t(`transport.vehicleStatus.${vehicle.status}`))}</small>
          <small>${transportEscapeHtml(t('transport.depot.age', { months: vehicle.ageMonths }))} · ${transportEscapeHtml(t('transport.depot.condition', { percent: transportFormatPercent(vehicle.condition) }))}</small>
        </div>
        <select data-transport-assign-vehicle="${transportEscapeHtml(vehicle.id)}" ${vehicle.status !== 'depot' ? 'disabled' : ''}>${routeOptions}</select>
        <button class="transport-btn" type="button" data-transport-action="inspect-vehicle" data-vehicle-id="${transportEscapeHtml(vehicle.id)}">${transportEscapeHtml(t('transport.inspector.open'))}</button>
        ${canSell
          ? `<button class="transport-btn danger" type="button" data-transport-action="sell-vehicle" data-vehicle-id="${transportEscapeHtml(vehicle.id)}">${transportEscapeHtml(t('transport.depot.sell'))}</button>`
          : (['active', 'returning_for_service', 'broken_down'].includes(vehicle.status)
            ? `<button class="transport-btn" type="button" data-transport-action="send-vehicle-depot" data-vehicle-id="${transportEscapeHtml(vehicle.id)}">${transportEscapeHtml(t('transport.fleet.sendDepot'))}</button>`
            : '')}
      </div>
    `;
  }).join('') : `<div class="transport-empty">${transportEscapeHtml(t('transport.depot.fleetEmpty'))}</div>`;

  return `
    <div class="transport-depot-select">
      <label>${transportEscapeHtml(t('transport.depot.select'))}
        <select data-transport-select-depot>${depotOptions}</select>
      </label>
      <span>${transportEscapeHtml(t('transport.depot.capacityLabel', { used: vehicleCount, capacity: TRANSPORT_DEPOT_CAPACITY }))}</span>
    </div>
    <div class="transport-note">${transportEscapeHtml(t('transport.depot.purchaseFlow'))}</div>
    <h4>${transportEscapeHtml(t('transport.depot.buyTitle'))}</h4>
    <div class="transport-buy-catalog">${buyRows}</div>
    <h4>${transportEscapeHtml(t('transport.depot.fleetTitle'))}</h4>
    <div class="transport-vehicle-list">${fleetRows}</div>
  `;
}

// Back-compat entry point (vehicle-tracker.js's "jump to route" action, and
// any other caller that just wants "the transport UI open somewhere") -
// opens the Routes window specifically, the most useful default.
function openTransportWindow() {
  openTransportPanel('routes');
}

function openTransportWindowTab(tabId) {
  if (typeof setTransportModeActive === 'function') setTransportModeActive(true);
  openTransportPanel(TRANSPORT_PANEL_META[tabId] ? tabId : 'routes');
}

// §10: map click on a depot building (main.js's building pointerdown) lands
// here - jump straight to that depot's window with it preselected.
function openTransportDepotWindowFor(depotId) {
  transportUiState.selectedDepotId = String(depotId || '');
  openTransportPanel('depot');
}

// Closing an operation window no longer exits the mode - like OpenTTD,
// windows come and go freely while the play mode itself is toggled only via
// the CITY GUIDE header (setTransportModeActive). Kept as a "close
// everything" fallback for setTransportModeActive's exit path.
function closeTransportWindow() {
  closeAllTransportPanels();
}

// The mayor's tool selection, parked while Transport Mode is open and
// restored on exit - the two modes keep fully separate toolsets.
let transportModeSavedTool = '';

function refreshTransportModeHeader() {
  const title = document.querySelector('#tool-guide-text strong');
  const subtitle = document.querySelector('#tool-guide-text span');
  if (!title || !subtitle) return;
  title.dataset.i18n = isTransportModeActive ? 'tool.transportGuideTitle' : 'tool.guideTitle';
  subtitle.dataset.i18n = isTransportModeActive ? 'tool.transportGuideSubtitle' : 'tool.guideSubtitle';
  title.textContent = t(title.dataset.i18n);
  subtitle.textContent = t(subtitle.dataset.i18n);
  const rail = document.getElementById('tool-guide-rail');
  if (rail) rail.textContent = isTransportModeActive ? '🏙' : '🚆';
}

// §5: Transport Mode is a tool-menu/HUD swap, not a separate scene - the
// map/camera and city simulation are untouched (unlike terrain-editor-mode,
// nothing here pauses the sim or stops the clock). Mirrors
// setTerrainEditorUiActive()'s body-class + window-cleanup shape.
function setTransportModeActive(active) {
  const next = !!active;
  if (isTransportModeActive === next) return;
  isTransportModeActive = next;
  if (typeof document === 'undefined') return;
  document.body?.classList.toggle('transport-mode', next);
  if (next) {
    if (typeof closeOverlayWindow === 'function') closeOverlayWindow();
    if (typeof closeChartWindow === 'function') closeChartWindow();
    document.getElementById('budget-detail')?.classList.remove('is-open');
    document.getElementById('budget-window')?.classList.remove('is-open');
    document.getElementById('inspect-panel')?.style.setProperty('display', 'none');
    closeTransportInspector();
    // Park the mayor's tool; default to inspect so plain map clicks read as
    // "what is this?" (vehicles/stops/depots all have click-to-inspect) and
    // never invisibly build with a hidden city tool.
    transportModeSavedTool = typeof selectedTool === 'string' ? selectedTool : '';
    if (typeof selectedTool !== 'undefined') selectedTool = 'inspect';
    openTransportPanel('routes');
    updateTransportTopbarKpis();
  } else {
    closeAllTransportPanels();
    closeTransportInspector();
    restoreCityTopbarKpiLabels();
    if (typeof selectedTool !== 'undefined' && transportModeSavedTool) {
      selectedTool = transportModeSavedTool;
    }
    transportModeSavedTool = '';
  }
  const menu = document.getElementById('tool-menu');
  if (menu && typeof updateToolCategoryState === 'function') {
    updateToolCategoryState(menu, typeof selectedTool === 'string' ? selectedTool : '');
  }
  if (typeof closeToolCategoryFlyouts === 'function') closeToolCategoryFlyouts();
  refreshTransportModeHeader();
}

// §5: while Transport Mode is open, the mayor's funds strip has nothing to
// show (city.budget doesn't move here, §4) - the same five slots are
// repurposed for the company ledger instead of a separate floating box
// that used to sit on top of the tool menu.
const TRANSPORT_TOPBAR_KPI_CITY_LABELS = {
  'topbar-funds': 'topbar.kpi.funds',
  'topbar-income': 'topbar.kpi.income',
  'topbar-expense': 'topbar.kpi.expenses',
  'topbar-population': 'topbar.kpi.population',
  'topbar-rating': 'topbar.kpi.rating',
};

function setTransportTopbarKpi(valueId, labelKey, value) {
  const valueEl = document.getElementById(valueId);
  if (!valueEl) return;
  valueEl.textContent = value;
  const labelSpan = valueEl.closest('.kpi-card')?.querySelector('.kpi-label span');
  if (!labelSpan) return;
  labelSpan.dataset.i18n = labelKey;
  labelSpan.textContent = t(labelKey);
}

function updateTransportTopbarKpis() {
  if (typeof document === 'undefined' || !isTransportModeActive) return;
  const state = getTransportExpansionState();
  const financials = typeof getTransportFinancials === 'function'
    ? getTransportFinancials()
    : { revenue: 0, cost: 0 };
  const summary = typeof getTransportSummary === 'function'
    ? getTransportSummary()
    : { monthlyPassengers: 0, averageReliability: 0 };
  setTransportTopbarKpi('topbar-funds', 'transport.kpi.cash', transportFormatMoney(state.company.cash));
  setTransportTopbarKpi('topbar-income', 'transport.kpi.revenue', `+${transportFormatMoney(financials.revenue)}`);
  setTransportTopbarKpi('topbar-expense', 'transport.kpi.cost', `-${transportFormatMoney(financials.cost)}`);
  setTransportTopbarKpi('topbar-population', 'transport.kpi.passengers', Math.round(summary.monthlyPassengers).toLocaleString());
  setTransportTopbarKpi('topbar-rating', 'transport.kpi.reliability', transportFormatPercent(summary.averageReliability));
}

function restoreCityTopbarKpiLabels() {
  if (typeof document === 'undefined') return;
  for (const [valueId, labelKey] of Object.entries(TRANSPORT_TOPBAR_KPI_CITY_LABELS)) {
    const labelSpan = document.getElementById(valueId)?.closest('.kpi-card')?.querySelector('.kpi-label span');
    if (!labelSpan) continue;
    labelSpan.dataset.i18n = labelKey;
    labelSpan.textContent = t(labelKey);
  }
}

// Bus stops retain a compact information inspector. Vehicles use the shared
// live Phaser-camera windows in vehicle-tracker.js instead.
const transportInspectorState = { root: null, kind: '', stopId: '' };

function createTransportVehicleInspector() {
  if (transportInspectorState.root || typeof document === 'undefined') return transportInspectorState.root;
  if (!document.getElementById('transport-inspector-style')) {
    const style = document.createElement('style');
    style.id = 'transport-inspector-style';
    style.textContent = `
      #transport-vehicle-inspector { position: fixed; z-index:370; width:280px; color:#20252a; background:#ece7d8; border:2px solid #313b43; border-radius:5px; box-shadow:0 10px 26px rgba(0,0,0,.4); font:12px/1.4 Arial, sans-serif; }
      #transport-vehicle-inspector[hidden] { display:none !important; }
      #transport-vehicle-inspector .transport-inspector-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 9px; background:#263a48; color:#fff; font-weight:800; }
      #transport-vehicle-inspector .transport-inspector-close { border:0; background:transparent; color:#fff; font-size:16px; cursor:pointer; }
      #transport-vehicle-inspector .transport-inspector-body { padding:9px; display:grid; gap:5px; }
      #transport-vehicle-inspector .transport-inspector-row { display:flex; justify-content:space-between; gap:8px; }
      #transport-vehicle-inspector .transport-inspector-row span:first-child { color:#6a665c; }
      #transport-vehicle-inspector .transport-inspector-routes { display:flex; flex-wrap:wrap; gap:4px; }
      #transport-vehicle-inspector .transport-inspector-route-chip { border-left:5px solid var(--route-color); border-radius:3px; padding:1px 6px; background:#f8f4e8; font-weight:700; }
      #transport-vehicle-inspector .transport-inspector-actions { display:flex; justify-content:flex-end; gap:4px; flex-wrap:wrap; margin-top:4px; padding-top:6px; border-top:1px solid #c8c0ad; }
      #transport-vehicle-inspector .transport-btn { border:1px solid #52636f; border-radius:5px; padding:4px 8px; background:#f7f3e8; color:#26323a; cursor:pointer; font:inherit; }
      #transport-vehicle-inspector .transport-btn.primary { color:#fff; background:#236c91; border-color:#164f6e; font-weight:700; }
      #transport-vehicle-inspector .transport-btn.danger { color:#8b1f1f; border-color:#a75a5a; }
      #transport-vehicle-inspector .transport-inspector-route { border:0; padding:0; color:#155f86; background:transparent; cursor:pointer; font:inherit; font-weight:800; }
      #transport-vehicle-inspector .transport-inspector-meter { height:9px; overflow:hidden; border:1px solid #817969; background:#d8d1c3; }
      #transport-vehicle-inspector .transport-inspector-meter i { display:block; height:100%; width:var(--value); background:#2b8a57; }
    `;
    document.head.appendChild(style);
  }
  const root = document.createElement('section');
  root.id = 'transport-vehicle-inspector';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.innerHTML = `
    <div class="transport-inspector-head">
      <span data-transport-inspector-title></span>
      <button class="transport-inspector-close" type="button" data-transport-inspector-close aria-label="Close">×</button>
    </div>
    <div class="transport-inspector-body" data-transport-inspector-body></div>
  `;
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  root.querySelector('[data-transport-inspector-close]').addEventListener('click', closeTransportInspector);
  // This popup is its own DOM root (appended straight to <body>, not inside
  // any transport panel), so it never receives the data-transport-action
  // delegate wired in createTransportPanel - handle its one action directly.
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-transport-action="rename-stop"]');
    if (!button) return;
    renameTransportStopPrompt(button.dataset.stopId).catch((error) => console.warn('[Transport stop rename]', error));
  });
  document.body.appendChild(root);
  transportInspectorState.root = root;
  return root;
}

function positionTransportVehicleInspector(root, pointer) {
  const x = pointer?.event?.clientX ?? window.innerWidth / 2;
  const y = pointer?.event?.clientY ?? window.innerHeight / 2;
  const offset = 14;
  const width = 280;
  const height = root.offsetHeight || 220;
  let left = x + offset;
  let top = y + offset;
  if (left + width > window.innerWidth) left = x - offset - width;
  if (top + height > window.innerHeight) top = y - offset - height;
  root.style.left = `${Math.max(6, left)}px`;
  root.style.top = `${Math.max(6, top)}px`;
}

function openTransportVehicleInspector(vehicleId, pointer = null, options = {}) {
  if (typeof openVehicleTrackingWindow !== 'function') return null;
  return openVehicleTrackingWindow('transport', vehicleId, pointer, options);
}

// §7: click a bus stop while in Transport Mode - waiting passengers plus
// which routes serve it, live-updated like the vehicle window.
function openTransportStopInspector(stopId, pointer = null) {
  const root = createTransportVehicleInspector();
  if (!root) return;
  transportInspectorState.kind = 'stop';
  transportInspectorState.stopId = String(stopId || '');
  root.hidden = false;
  positionTransportVehicleInspector(root, pointer);
  refreshTransportInspector();
}

function closeTransportInspector() {
  if (!transportInspectorState.root) return;
  transportInspectorState.root.hidden = true;
  transportInspectorState.kind = '';
  transportInspectorState.stopId = '';
}

function refreshTransportInspector() {
  const root = transportInspectorState.root;
  if (!root || root.hidden) return;
  if (transportInspectorState.kind === 'stop') {
    refreshTransportStopInspectorBody(root);
    return;
  }
  closeTransportInspector();
}

function refreshTransportStopInspectorBody(root) {
  const state = getTransportExpansionState();
  const stop = typeof getTransportStopById === 'function'
    ? getTransportStopById(transportInspectorState.stopId)
    : null;
  if (!stop) { closeTransportInspector(); return; }
  const stopIndex = state.stops.indexOf(stop);
  root.querySelector('[data-transport-inspector-title]').textContent = getTransportStopDisplayName(stop, Math.max(0, stopIndex));
  const waiting = typeof getTransportStopWaitingCount === 'function'
    ? getTransportStopWaitingCount(stop.id)
    : 0;
  const servingRoutes = state.routes.filter((route) => route.stopIds.includes(stop.id));
  const routeChips = servingRoutes.length > 0
    ? `<div class="transport-inspector-routes">${servingRoutes.map((route) => (
      `<span class="transport-inspector-route-chip" style="--route-color:${transportEscapeHtml(route.color)}">${transportEscapeHtml(route.name)}</span>`
    )).join('')}</div>`
    : `<div class="transport-inspector-row"><span>${transportEscapeHtml(t('transport.stopInspector.routes'))}</span><strong>${transportEscapeHtml(t('transport.stopInspector.noRoutes'))}</strong></div>`;
  const rows = [
    [t('transport.stopInspector.waiting'), `👤 ${waiting}`],
    [t('transport.inspector.position'), `(${stop.row}, ${stop.col})`],
  ].map(([label, value]) => (
    `<div class="transport-inspector-row"><span>${transportEscapeHtml(label)}</span><strong>${transportEscapeHtml(value)}</strong></div>`
  )).join('');
  const routesLabel = servingRoutes.length > 0
    ? `<div class="transport-inspector-row"><span>${transportEscapeHtml(t('transport.stopInspector.routes'))}</span></div>`
    : '';
  const actions = `<div class="transport-inspector-actions"><button class="transport-btn" type="button" data-transport-action="rename-stop" data-stop-id="${transportEscapeHtml(stop.id)}">${transportEscapeHtml(t('transport.stopInspector.rename'))}</button></div>`;
  root.querySelector('[data-transport-inspector-body]').innerHTML = rows + routesLabel + routeChips + actions;
}

async function renameTransportStopPrompt(stopId) {
  const stop = typeof getTransportStopById === 'function' ? getTransportStopById(stopId) : null;
  if (!stop) return;
  const input = await showTextPromptDialog(t('transport.stopInspector.renamePrompt'), stop.name || '');
  if (input === null) return;
  renameTransportStop(stopId, input);
  refreshTransportInspector();
  refreshTransportUi();
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
}

function resetTransportUiForCityChange() {
  if (typeof closeAllVehicleTrackingWindows === 'function') closeAllVehicleTrackingWindows();
  closeAllTransportPanels();
  transportUiState.editor = null;
  transportUiState.pickingStops = false;
  transportUiState.selectedDepotId = '';
  transportUiState.expandedRouteId = '';
  transportUiState.fleetSort = 'number';
  setTransportUiMessage('');
  if (isTransportModeActive) setTransportModeActive(false);
}

function toggleTransportExpansionForCity() {
  if (!isExpansionAvailable('transport')) {
    showToast(t('transport.toast.unavailable'), 'warning');
    return;
  }
  const enabled = isExpansionEnabled('transport');
  if (enabled && !window.confirm(t('transport.confirmDisable'))) return;
  setExpansionEnabled('transport', !enabled);
  showToast(t(enabled ? 'transport.toast.disabled' : 'transport.toast.enabled'), 'info');
  if (isAnyTransportPanelOpen()) refreshTransportUi();
}

function beginTransportRouteEditor(route = null) {
  const state = getTransportExpansionState();
  const routeIndex = route ? state.routes.indexOf(route) : state.routes.length;
  transportUiState.editor = {
    routeId: route?.id || '',
    name: route?.name || getDefaultTransportRouteName(state.nextRouteId),
    color: route?.color || TRANSPORT_ROUTE_COLORS[routeIndex % TRANSPORT_ROUTE_COLORS.length],
    fare: route?.fare ?? TRANSPORT_DEFAULT_FARE,
    pickupPassthroughStops: route?.pickupPassthroughStops === true,
    stopIds: Array.from(route?.stopIds || []),
  };
  transportUiState.pickingStops = false;
  setTransportUiMessage('');
  refreshTransportUi();
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
}

function cancelTransportRouteEditor() {
  transportUiState.editor = null;
  transportUiState.pickingStops = false;
  setTransportUiMessage('');
  refreshTransportUi();
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
}

function transportRouteErrorMessage(error) {
  const code = error?.code || 'noPath';
  const key = `transport.error.${code}`;
  const translated = t(key);
  return translated === key ? String(error?.message || code) : translated;
}

function saveTransportRouteEditor() {
  const editor = transportUiState.editor;
  if (!editor) return;
  if (editor.stopIds.length < 2) {
    setTransportUiMessage(t('transport.error.needsStops'), 'error');
    refreshTransportUi();
    return;
  }
  const selectedStops = editor.stopIds.map(getTransportStopById);
  if (selectedStops.some((stop) => !stop || !isTransportStopPresent(stop))) {
    setTransportUiMessage(t('transport.error.missingStop'), 'error');
    refreshTransportUi();
    return;
  }
  try {
    const draft = {
      name: editor.name,
      color: editor.color,
      fare: editor.fare,
      pickupPassthroughStops: editor.pickupPassthroughStops === true,
      stopIds: editor.stopIds,
    };
    if (editor.routeId) updateTransportRoute(editor.routeId, draft);
    else createTransportRoute(draft);
    transportUiState.editor = null;
    transportUiState.pickingStops = false;
    setTransportUiMessage('');
    showToast(t('transport.toast.routeSaved'), 'info');
    refreshTransportUi();
  } catch (error) {
    setTransportUiMessage(transportRouteErrorMessage(error), 'error');
    refreshTransportUi();
  }
}

function handleTransportUiInput(event) {
  const field = event.target?.dataset?.transportField;
  if (!field || !transportUiState.editor) return;
  if (field === 'fare') {
    transportUiState.editor.fare = normalizeTransportFare(event.target.value);
  } else if (event.target.type === 'checkbox') {
    transportUiState.editor[field] = event.target.checked;
  } else {
    transportUiState.editor[field] = event.target.value;
  }
}

function handleTransportUiChange(event) {
  const fleetSort = event.target.closest('[data-transport-fleet-sort]');
  if (fleetSort) {
    transportUiState.fleetSort = fleetSort.value;
    return refreshTransportUi();
  }
  const depotSelect = event.target.closest('[data-transport-select-depot]');
  if (depotSelect) {
    transportUiState.selectedDepotId = depotSelect.value;
    return refreshTransportUi();
  }
  const assignSelect = event.target.closest('[data-transport-assign-vehicle]');
  if (assignSelect) {
    const vehicleId = assignSelect.dataset.transportAssignVehicle;
    const routeId = assignSelect.value || null;
    try {
      assignTransportVehicleToRoute(vehicleId, routeId);
      showToast(t(routeId ? 'transport.toast.vehicleAssigned' : 'transport.toast.vehicleUnassigned'), 'info');
    } catch (error) {
      showToast(transportRouteErrorMessage(error), 'warning');
    }
    return refreshTransportUi();
  }
}

function handleTransportUiClick(event) {
  const button = event.target.closest('[data-transport-action]');
  if (!button) return;
  const action = button.dataset.transportAction;
  if (action === 'enable') {
    setExpansionEnabled('transport', true);
    showToast(t('transport.toast.enabled'), 'info');
    return refreshTransportUi();
  }
  if (action === 'save-company') {
    const panelRoot = button.closest('.transport-panel-window');
    const name = panelRoot?.querySelector('[data-transport-field="companyName"]')?.value ?? '';
    const presidentName = panelRoot?.querySelector('[data-transport-field="presidentName"]')?.value ?? '';
    const state = getTransportExpansionState();
    state.company.name = String(name).trim().slice(0, 60);
    state.company.presidentName = String(presidentName).trim().slice(0, 40);
    showToast(t('transport.company.saved'), 'info');
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
    return refreshTransportUi();
  }
  if (action === 'buy-vehicle') {
    try {
      const vehicle = buyTransportVehicle(button.dataset.depotId, button.dataset.classId);
      showToast(t('transport.toast.vehicleBought'), 'info');
      openTransportVehicleInspector(vehicle.id);
    } catch (error) {
      showToast(transportRouteErrorMessage(error), 'warning');
    }
    return refreshTransportUi();
  }
  if (action === 'send-vehicle-depot') {
    const sent = sendTransportVehicleToDepot(button.dataset.vehicleId);
    showToast(t(sent ? 'transport.toast.vehicleSentDepot' : 'transport.error.vehicleNotAvailable'), sent ? 'info' : 'warning');
    return refreshTransportUi();
  }
  if (action === 'locate-stop') {
    const stop = getTransportStopById(button.dataset.stopId);
    if (!stop) return;
    if (typeof centerCameraOnTile === 'function') centerCameraOnTile(activeScene, stop.row, stop.col);
    else if (activeScene?.cameras?.main && typeof isoToScreen === 'function') {
      const point = isoToScreen(stop.col, stop.row);
      activeScene.cameras.main.centerOn(point.x, point.y);
    }
    openTransportStopInspector(stop.id);
    return;
  }
  if (action === 'sell-vehicle') {
    if (!window.confirm(t('transport.depot.confirmSell'))) return;
    const sold = sellTransportVehicle(button.dataset.vehicleId);
    showToast(t(sold ? 'transport.toast.vehicleSold' : 'transport.vehicleStatus.delivering_to_depot'), sold ? 'info' : 'warning');
    return refreshTransportUi();
  }
  if (action === 'inspect-vehicle') {
    openTransportVehicleInspector(button.dataset.vehicleId);
    return;
  }
  if (action === 'toggle-route-vehicles') {
    transportUiState.expandedRouteId = transportUiState.expandedRouteId === button.dataset.routeId
      ? ''
      : button.dataset.routeId;
    return refreshTransportUi();
  }
  if (action === 'track-vehicle') {
    openTransportVehicleInspector(button.dataset.vehicleId, null, { follow: true });
    return;
  }
  if (action === 'new-route') return beginTransportRouteEditor();
  if (action === 'cancel-editor') return cancelTransportRouteEditor();
  if (action === 'pick-stops') {
    transportUiState.pickingStops = !transportUiState.pickingStops;
    refreshTransportUi();
    if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
    return;
  }
  if (action === 'save-route') return saveTransportRouteEditor();
  const routeId = button.dataset.routeId;
  if (action === 'edit-route') {
    const route = getTransportExpansionState().routes.find((entry) => entry.id === routeId);
    if (route) beginTransportRouteEditor(route);
    return;
  }
  if (action === 'toggle-route') {
    const route = getTransportExpansionState().routes.find((entry) => entry.id === routeId);
    if (route) setTransportRouteSuspended(routeId, route.status !== 'suspended');
    return refreshTransportUi();
  }
  if (action === 'delete-route') {
    if (window.confirm(t('transport.confirmDelete'))) deleteTransportRoute(routeId);
    return refreshTransportUi();
  }
  const index = Number(button.dataset.index);
  const stopIds = transportUiState.editor?.stopIds;
  if (!Array.isArray(stopIds) || !Number.isInteger(index) || index < 0 || index >= stopIds.length) return;
  if (action === 'stop-up' && index > 0) {
    [stopIds[index - 1], stopIds[index]] = [stopIds[index], stopIds[index - 1]];
  } else if (action === 'stop-down' && index < stopIds.length - 1) {
    [stopIds[index + 1], stopIds[index]] = [stopIds[index], stopIds[index + 1]];
  } else if (action === 'stop-remove') {
    stopIds.splice(index, 1);
  }
  refreshTransportUi();
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
}

function isTransportRoutePicking() {
  return !!transportUiState.editor && transportUiState.pickingStops;
}

function handleTransportRouteMapClick(row, col) {
  if (!isTransportRoutePicking()) return false;
  const stop = getTransportStopAt(row, col, { presentOnly: true });
  if (!stop) {
    setTransportUiMessage(t('transport.error.missingStop'), 'error');
    refreshTransportUi();
    return true;
  }
  const stopIds = transportUiState.editor.stopIds;
  const existingIndex = stopIds.indexOf(stop.id);
  if (existingIndex >= 0) {
    stopIds.splice(existingIndex, 1);
    setTransportUiMessage(t('transport.toast.stopRemoved'), 'info');
  } else {
    stopIds.push(stop.id);
    setTransportUiMessage(t('transport.toast.stopAdded'), 'success');
  }
  refreshTransportUi();
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
  return true;
}

function isTransportRouteOverlayRequested() {
  const trafficOverlay = typeof activeOverlay === 'string' && activeOverlay === 'traffic';
  return isTransportExpansionActive() && (isAnyTransportPanelOpen() || trafficOverlay || isTransportRoutePicking());
}

function getTransportRouteEditorStopIds() {
  return Array.from(transportUiState.editor?.stopIds || []);
}

// Escape targets whichever operation window was interacted with last
// (transportFocusedPanelId, set by focusTransportPanel on open/click/drag) -
// same "closest window wins" precedence as the vehicle tracker windows,
// checked first since those float above everything else.
function handleTransportUiKeydown(event) {
  if (event.key === 'Escape' && typeof closeFocusedVehicleTrackingWindow === 'function'
    && closeFocusedVehicleTrackingWindow()) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && transportInspectorState.root && !transportInspectorState.root.hidden) {
    event.preventDefault();
    closeTransportInspector();
    return;
  }
  const focusedPanel = transportPanels.get(transportFocusedPanelId);
  if (event.key === 'Escape' && focusedPanel && !focusedPanel.root.hidden) {
    event.preventDefault();
    if (transportFocusedPanelId === 'routes' && transportUiState.editor) cancelTransportRouteEditor();
    else closeTransportPanel(transportFocusedPanelId);
    return;
  }
  if (event.key === 'Escape' && isAnyTransportPanelOpen()) {
    // The previously-focused window was closed some other way (its own ×,
    // a topbar toggle) and another is still open - rather than guess which
    // one Escape should target next, just step out of the mode.
    event.preventDefault();
    setTransportModeActive(false);
    return;
  }
  if (event.key === 'Escape' && isTransportModeActive) {
    // No transport windows left open - step back out to city building,
    // mirroring how the mode was entered from the guide header.
    event.preventDefault();
    setTransportModeActive(false);
    return;
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && transportUiState.editor) {
    event.preventDefault();
    saveTransportRouteEditor();
  }
}

function setupTransportUi() {
  document.addEventListener('languagechange', refreshTransportUi);
  document.addEventListener('keydown', handleTransportUiKeydown);
  document.getElementById('transport-topbar-tools')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-transport-topbar-panel]');
    if (!button) return;
    toggleTransportPanel(button.dataset.transportTopbarPanel);
  });
}

if (typeof document !== 'undefined') setupTransportUi();
