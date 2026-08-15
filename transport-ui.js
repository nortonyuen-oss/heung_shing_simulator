// ── Transport Department window and map stop picker ─────────────────────────

const transportUiState = {
  root: null,
  editor: null,
  pickingStops: false,
  message: '',
  messageTone: 'info',
  activeTab: 'routes',
  selectedDepotId: '',
  expandedRouteId: '',
};

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

function createTransportWindow() {
  if (transportUiState.root || typeof document === 'undefined') return transportUiState.root;
  if (!document.getElementById('transport-window-style')) {
    const style = document.createElement('style');
    style.id = 'transport-window-style';
    style.textContent = `
      #transport-window {
        position: fixed; z-index: 360; top: 92px; right: 22px; width: min(620px, calc(100vw - 44px));
        max-height: calc(100vh - 120px); display: flex; flex-direction: column;
        color: #20252a; background: #ece7d8; border: 2px solid #313b43; border-radius: 8px;
        box-shadow: 0 14px 38px rgba(0,0,0,.42); font: 12px/1.35 Arial, sans-serif;
      }
      #transport-window[hidden] { display: none !important; }
      #transport-window .transport-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 10px; background:#263a48; color:#fff; font-weight:800; }
      #transport-window .transport-close { border:0; background:transparent; color:#fff; font-size:18px; cursor:pointer; }
      #transport-window .transport-body { overflow:auto; padding:12px; }
      #transport-window .transport-gate { text-align:center; padding:28px 18px; }
      #transport-window .transport-gate h3 { margin:0 0 8px; font-size:18px; }
      #transport-window .transport-gate p { margin:0 auto 14px; max-width:430px; color:#58616a; }
      #transport-window button { font:inherit; }
      #transport-window .transport-btn { border:1px solid #52636f; border-radius:5px; padding:6px 9px; background:#f7f3e8; color:#26323a; cursor:pointer; }
      #transport-window .transport-btn:hover { background:#fff; }
      #transport-window .transport-btn.primary { color:#fff; background:#236c91; border-color:#164f6e; font-weight:700; }
      #transport-window .transport-btn.danger { color:#8b1f1f; border-color:#a75a5a; }
      #transport-window .transport-topline { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
      #transport-window .transport-credit { color:#176a43; font-weight:700; }
      #transport-window .transport-summary { display:grid; grid-template-columns:repeat(5, minmax(86px,1fr)); gap:6px; margin-bottom:10px; }
      #transport-window .transport-summary-card { padding:7px; background:#faf7ed; border:1px solid #c8c0ad; border-radius:5px; }
      #transport-window .transport-summary-card span { display:block; color:#6a665c; font-size:10px; }
      #transport-window .transport-summary-card strong { display:block; margin-top:2px; font-size:14px; }
      #transport-window .transport-depots { margin:0 0 10px; color:#4f5960; }
      #transport-window .transport-routes { display:grid; gap:7px; }
      #transport-window .transport-empty { padding:18px; text-align:center; border:1px dashed #a69d89; border-radius:6px; color:#686155; }
      #transport-window .transport-route { border:1px solid #aaa18e; border-left:7px solid var(--route-color); border-radius:6px; padding:8px; background:#f8f4e8; }
      #transport-window .transport-route-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
      #transport-window .transport-route-name { font-weight:800; font-size:14px; }
      #transport-window .transport-status { border-radius:12px; padding:2px 7px; background:#dce7dd; color:#285d35; white-space:nowrap; }
      #transport-window .transport-status[data-status="broken"] { background:#f3d6d2; color:#8d2924; }
      #transport-window .transport-status[data-status="suspended"], #transport-window .transport-status[data-status="weather"] { background:#ece3c9; color:#765d1c; }
      #transport-window .transport-route-stops { margin:5px 0; color:#5d5a53; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #transport-window .transport-route-fleet-toggle { border:0; background:transparent; padding:0; margin-top:2px; color:#4f5960; font:inherit; font-size:11px; cursor:pointer; }
      #transport-window .transport-route-fleet-toggle:hover, #transport-window .transport-route-fleet-toggle.is-open { color:#164f6e; font-weight:700; }
      #transport-window .transport-route-fleet { display:grid; gap:4px; margin:6px 0; }
      #transport-window .transport-route-vehicle { display:grid; grid-template-columns:1fr auto auto auto; gap:8px; align-items:center; text-align:left; padding:5px 7px; border:1px solid #b3ab98; border-radius:5px; background:#fffaf0; font:inherit; cursor:pointer; }
      #transport-window .transport-route-vehicle:hover { background:#fff; border-color:#164f6e; }
      #transport-window .transport-route-vehicle span:first-child { font-weight:700; }
      #transport-window .transport-route-error { margin:4px 0; color:#992f2a; font-weight:700; }
      #transport-window .transport-metrics { display:grid; grid-template-columns:repeat(4,minmax(70px,1fr)); gap:4px; margin:7px 0; }
      #transport-window .transport-metric { background:#ebe5d5; border-radius:4px; padding:4px; }
      #transport-window .transport-metric span { display:block; color:#777064; font-size:9px; }
      #transport-window .transport-metric strong { font-size:11px; }
      #transport-window .transport-actions { display:flex; gap:5px; justify-content:flex-end; flex-wrap:wrap; }
      #transport-window .transport-editor { border:1px solid #9d9584; border-radius:7px; padding:10px; background:#f9f6ec; }
      #transport-window .transport-editor h3 { margin:0 0 9px; }
      #transport-window .transport-fields { display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:7px; }
      #transport-window label { display:grid; gap:3px; color:#5e5a50; }
      #transport-window input { min-width:0; border:1px solid #9d9584; border-radius:4px; padding:5px; background:#fff; color:#222; }
      #transport-window input[type="color"] { width:100%; min-height:29px; padding:2px; }
      #transport-window .transport-stop-picker { display:flex; justify-content:space-between; align-items:center; gap:8px; margin:10px 0 6px; }
      #transport-window .transport-picker-hint { margin:0 0 7px; color:#236c91; }
      #transport-window .transport-stop-list { display:grid; gap:4px; min-height:42px; }
      #transport-window .transport-stop-row { display:grid; grid-template-columns:28px 1fr auto auto auto; align-items:center; gap:4px; padding:4px; background:#ebe5d5; border-radius:4px; }
      #transport-window .transport-stop-row strong { text-align:center; }
      #transport-window .transport-icon-btn { border:1px solid #a49b87; border-radius:4px; background:#fffaf0; cursor:pointer; min-width:25px; min-height:24px; }
      #transport-window .transport-editor-actions { display:flex; justify-content:flex-end; gap:7px; margin-top:10px; }
      #transport-window .transport-message { min-height:17px; margin-top:7px; color:#4f6270; }
      #transport-window .transport-message[data-tone="error"] { color:#9b2929; }
      #transport-window .transport-message[data-tone="success"] { color:#1b7045; }
      #transport-window .transport-tabs { display:flex; gap:4px; margin-bottom:10px; border-bottom:1px solid #c8c0ad; }
      #transport-window .transport-tab { border:0; border-bottom:3px solid transparent; border-radius:0; background:transparent; padding:6px 10px; color:#5e5a50; cursor:pointer; font-weight:700; }
      #transport-window .transport-tab.is-active { color:#164f6e; border-bottom-color:#236c91; }
      #transport-window .transport-company-form { display:grid; gap:9px; max-width:380px; }
      #transport-window .transport-company-meta { display:flex; justify-content:space-between; gap:8px; color:#5e5a50; margin-top:2px; }
      #transport-window .transport-depot-select { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; margin-bottom:10px; }
      #transport-window .transport-depot-select label { flex:1; }
      #transport-window .transport-depot-select select { width:100%; border:1px solid #9d9584; border-radius:4px; padding:5px; background:#fff; }
      #transport-window h4 { margin:12px 0 6px; color:#3c4650; }
      #transport-window .transport-vehicle-classes, #transport-window .transport-vehicle-list { display:grid; gap:6px; }
      #transport-window .transport-vehicle-class-row, #transport-window .transport-vehicle-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 8px; background:#f8f4e8; border:1px solid #aaa18e; border-radius:6px; }
      #transport-window .transport-vehicle-row select { border:1px solid #9d9584; border-radius:4px; padding:4px; background:#fff; min-width:120px; }
      #transport-window .transport-vehicle-class-row small, #transport-window .transport-vehicle-row small { display:block; color:#6a665c; }
      @media (max-width:720px) {
        #transport-window { right:8px; top:76px; width:calc(100vw - 16px); }
        #transport-window .transport-summary { grid-template-columns:repeat(2,1fr); }
        #transport-window .transport-fields { grid-template-columns:1fr 1fr; }
        #transport-window .transport-metrics { grid-template-columns:repeat(3,1fr); }
      }
    `;
    document.head.appendChild(style);
  }

  const root = document.createElement('section');
  root.id = 'transport-window';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.innerHTML = `
    <div class="transport-head">
      <span data-transport-title></span>
      <button class="transport-close" type="button" data-transport-action="close" aria-label="Close">×</button>
    </div>
    <div class="transport-body" data-transport-body></div>
  `;
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  root.addEventListener('click', handleTransportUiClick);
  root.addEventListener('input', handleTransportUiInput);
  root.addEventListener('change', handleTransportUiChange);
  document.body.appendChild(root);
  transportUiState.root = root;
  return root;
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
      </div>
      <div class="transport-stop-picker">
        <strong>${transportEscapeHtml(t('transport.routeStops'))} (${stops.length})</strong>
        <button class="transport-btn ${transportUiState.pickingStops ? 'primary' : ''}" type="button" data-transport-action="pick-stops">${transportEscapeHtml(t(transportUiState.pickingStops ? 'transport.stopPickerActive' : 'transport.pickStops'))}</button>
      </div>
      ${transportUiState.pickingStops ? `<p class="transport-picker-hint">${transportEscapeHtml(t('transport.stopPickerHint'))}</p>` : ''}
      <div class="transport-stop-list">${stopRows}</div>
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
          <button class="transport-route-fleet-toggle${expanded ? ' is-open' : ''}" type="button" data-transport-action="toggle-route-vehicles" data-route-id="${transportEscapeHtml(route.id)}" title="${transportEscapeHtml(t('transport.routeFleet.toggle'))}">${routeVehicles.length} 🚌 · $${Number(route.fare).toFixed(2)} ${expanded ? '▴' : '▾'}</button>
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
        <button class="transport-btn" type="button" data-transport-action="edit-route" data-route-id="${transportEscapeHtml(route.id)}">${transportEscapeHtml(t('transport.edit'))}</button>
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

function refreshTransportUi(options = {}) {
  const root = transportUiState.root;
  if (!root) return;
  root.querySelector('[data-transport-title]').textContent = t('transport.title');
  root.querySelector('[data-transport-action="close"]')?.setAttribute('aria-label', t('transport.close'));
  if (root.hidden) return;
  if (options?.passive === true && transportUiState.editor) return;
  const body = root.querySelector('[data-transport-body]');
  const state = getTransportExpansionState();
  if (renderTransportGate(body, state)) return;
  const tabs = [
    ['routes', t('transport.tab.routes')],
    ['depot', t('transport.tab.depot')],
    ['company', t('transport.tab.company')],
  ].map(([id, label]) => (
    `<button class="transport-tab${transportUiState.activeTab === id ? ' is-active' : ''}" type="button" data-transport-tab="${id}">${transportEscapeHtml(label)}</button>`
  )).join('');
  let tabBody = '';
  if (transportUiState.activeTab === 'depot') tabBody = renderTransportDepotTab(state);
  else if (transportUiState.activeTab === 'company') tabBody = renderTransportCompanyTab(state);
  else tabBody = renderTransportRoutesTab(state);
  body.innerHTML = `
    <div class="transport-topline">
      <span class="transport-credit">${transportEscapeHtml(state.company.name || t('transport.defaultCompanyName'))} · ${transportEscapeHtml(transportFormatMoney(state.company.cash))}</span>
    </div>
    <div class="transport-tabs">${tabs}</div>
    <div class="transport-tab-body">${tabBody}</div>
  `;
  refreshTransportHud();
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
    <div class="transport-vehicle-class-row">
      <div>
        <strong>${transportEscapeHtml(t(`transport.vehicleClass.${vehicleClass.id}`))}</strong>
        <small>${transportEscapeHtml(t('transport.depot.stats', {
          capacity: vehicleClass.capacity, price: transportFormatMoney(vehicleClass.purchasePrice),
        }))}</small>
      </div>
      <button class="transport-btn primary" type="button" data-transport-action="buy-vehicle" data-depot-id="${transportEscapeHtml(depotId)}" data-class-id="${transportEscapeHtml(vehicleClass.id)}">${transportEscapeHtml(t('transport.depot.buy'))}</button>
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
        <button class="transport-btn danger" type="button" data-transport-action="sell-vehicle" data-vehicle-id="${transportEscapeHtml(vehicle.id)}" ${canSell ? '' : 'disabled'}>${transportEscapeHtml(t('transport.depot.sell'))}</button>
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
    <h4>${transportEscapeHtml(t('transport.depot.buyTitle'))}</h4>
    <div class="transport-vehicle-classes">${buyRows}</div>
    <h4>${transportEscapeHtml(t('transport.depot.fleetTitle'))}</h4>
    <div class="transport-vehicle-list">${fleetRows}</div>
  `;
}

function openTransportWindow() {
  const root = createTransportWindow();
  if (!root) return;
  root.hidden = false;
  refreshTransportUi();
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
}

// §10: map click on a depot building (main.js's building pointerdown) lands
// here - jump straight to that depot's Depot tab.
function openTransportDepotWindowFor(depotId) {
  transportUiState.activeTab = 'depot';
  transportUiState.selectedDepotId = String(depotId || '');
  openTransportWindow();
}

// Closing the network window no longer exits the mode - like OpenTTD,
// windows come and go freely while the play mode itself is toggled only via
// the CITY GUIDE header (setTransportModeActive).
function closeTransportWindow() {
  if (!transportUiState.root) return;
  transportUiState.root.hidden = true;
  transportUiState.pickingStops = false;
  transportUiState.editor = null;
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
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
    openTransportWindow();
    refreshTransportHud();
  } else {
    closeTransportWindow();
    closeTransportInspector();
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

function ensureTransportHud() {
  if (typeof document === 'undefined') return null;
  let hud = document.getElementById('transport-hud');
  if (hud) return hud;
  hud = document.createElement('div');
  hud.id = 'transport-hud';
  hud.innerHTML = `
    <div class="transport-hud-name" data-transport-hud-name></div>
    <div class="transport-hud-cash" data-transport-hud-cash></div>
  `;
  document.body.appendChild(hud);
  return hud;
}

function refreshTransportHud() {
  if (!isTransportModeActive) return;
  const hud = ensureTransportHud();
  if (!hud) return;
  const state = getTransportExpansionState();
  const nameEl = hud.querySelector('[data-transport-hud-name]');
  const cashEl = hud.querySelector('[data-transport-hud-cash]');
  if (nameEl) nameEl.textContent = state.company.name || t('transport.defaultCompanyName');
  if (cashEl) {
    cashEl.textContent = transportFormatMoney(state.company.cash);
    cashEl.dataset.negative = state.company.cash < 0 ? 'true' : 'false';
  }
}

// §6/§7 inspector: one small click-to-inspect window serving both kinds of
// map object - a vehicle (with OpenTTD-style camera follow) or a bus stop
// (waiting passengers + serving routes). Positioned near the pointer like
// inspect-panel.js's showInspectPanel, but deliberately a separate
// lightweight DOM node rather than reusing #inspect-panel (which Transport
// Mode's CSS hides outright - it shows mayor's-tool tile info, not company
// info).
const transportInspectorState = { root: null, kind: '', vehicleId: '', stopId: '', follow: false };

function createTransportVehicleInspector() {
  if (transportInspectorState.root || typeof document === 'undefined') return transportInspectorState.root;
  if (!document.getElementById('transport-inspector-style')) {
    const style = document.createElement('style');
    style.id = 'transport-inspector-style';
    style.textContent = `
      #transport-vehicle-inspector { position: fixed; z-index: 370; width: 250px; color:#20252a; background:#ece7d8; border:2px solid #313b43; border-radius:8px; box-shadow:0 10px 26px rgba(0,0,0,.4); font:12px/1.4 Arial, sans-serif; }
      #transport-vehicle-inspector[hidden] { display:none !important; }
      #transport-vehicle-inspector .transport-inspector-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 9px; background:#263a48; color:#fff; font-weight:800; }
      #transport-vehicle-inspector .transport-inspector-close { border:0; background:transparent; color:#fff; font-size:16px; cursor:pointer; }
      #transport-vehicle-inspector .transport-inspector-body { padding:9px; display:grid; gap:5px; }
      #transport-vehicle-inspector .transport-inspector-row { display:flex; justify-content:space-between; gap:8px; }
      #transport-vehicle-inspector .transport-inspector-row span:first-child { color:#6a665c; }
      #transport-vehicle-inspector .transport-inspector-routes { display:flex; flex-wrap:wrap; gap:4px; }
      #transport-vehicle-inspector .transport-inspector-route-chip { border-left:5px solid var(--route-color); border-radius:3px; padding:1px 6px; background:#f8f4e8; font-weight:700; }
      #transport-vehicle-inspector .transport-inspector-actions { display:flex; justify-content:flex-end; margin-top:4px; }
      #transport-vehicle-inspector .transport-btn { border:1px solid #52636f; border-radius:5px; padding:4px 8px; background:#f7f3e8; color:#26323a; cursor:pointer; font:inherit; }
      #transport-vehicle-inspector .transport-btn.primary { color:#fff; background:#236c91; border-color:#164f6e; font-weight:700; }
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
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-transport-inspector-follow]')) {
      transportInspectorState.follow = !transportInspectorState.follow;
      refreshTransportInspector();
    }
  });
  document.body.appendChild(root);
  transportInspectorState.root = root;
  return root;
}

function positionTransportVehicleInspector(root, pointer) {
  const x = pointer?.event?.clientX ?? window.innerWidth / 2;
  const y = pointer?.event?.clientY ?? window.innerHeight / 2;
  const offset = 14;
  const width = 250;
  const height = root.offsetHeight || 220;
  let left = x + offset;
  let top = y + offset;
  if (left + width > window.innerWidth) left = x - offset - width;
  if (top + height > window.innerHeight) top = y - offset - height;
  root.style.left = `${Math.max(6, left)}px`;
  root.style.top = `${Math.max(6, top)}px`;
}

// options.follow starts the window with camera-follow already on - used by
// the route fleet list (OpenTTD's vehicle window follows immediately);
// clicking the sprite on the map keeps it off since you're already there.
function openTransportVehicleInspector(vehicleId, pointer = null, options = {}) {
  const root = createTransportVehicleInspector();
  if (!root) return;
  transportInspectorState.kind = 'vehicle';
  transportInspectorState.vehicleId = vehicleId;
  transportInspectorState.stopId = '';
  transportInspectorState.follow = options.follow === true;
  root.hidden = false;
  if (pointer) positionTransportVehicleInspector(root, pointer);
  refreshTransportInspector();
}

// §7: click a bus stop while in Transport Mode - waiting passengers plus
// which routes serve it, live-updated like the vehicle window.
function openTransportStopInspector(stopId, pointer = null) {
  const root = createTransportVehicleInspector();
  if (!root) return;
  transportInspectorState.kind = 'stop';
  transportInspectorState.stopId = String(stopId || '');
  transportInspectorState.vehicleId = '';
  transportInspectorState.follow = false;
  root.hidden = false;
  if (pointer) positionTransportVehicleInspector(root, pointer);
  refreshTransportInspector();
}

function closeTransportInspector() {
  if (!transportInspectorState.root) return;
  transportInspectorState.root.hidden = true;
  transportInspectorState.kind = '';
  transportInspectorState.vehicleId = '';
  transportInspectorState.stopId = '';
  transportInspectorState.follow = false;
}

// Read by transport-visuals.js's frame loop to keep the camera glued to the
// followed vehicle's sprite, OpenTTD-style.
function getTransportFollowVehicleId() {
  return transportInspectorState.follow && transportInspectorState.kind === 'vehicle'
    ? transportInspectorState.vehicleId
    : '';
}

function refreshTransportInspector() {
  const root = transportInspectorState.root;
  if (!root || root.hidden) return;
  if (transportInspectorState.kind === 'stop') {
    refreshTransportStopInspectorBody(root);
    return;
  }
  const vehicle = getTransportExpansionState().vehicles.find((entry) => entry.id === transportInspectorState.vehicleId);
  if (!vehicle) { closeTransportInspector(); return; }
  const route = getTransportExpansionState().routes.find((entry) => entry.id === vehicle.routeId);
  const vehicleClass = getTransportVehicleClass(vehicle.classId);
  root.querySelector('[data-transport-inspector-title]').textContent = t('transport.inspector.title', { id: vehicle.id });
  // Position comes from the on-screen sprite (the thing the player is
  // actually watching), not the daily-cadence backend order index.
  const visual = typeof activeScene !== 'undefined'
    ? activeScene?.transportVisualState?.vehicles?.find((entry) => entry.vehicleId === vehicle.id)
    : null;
  const rows = [
    [t('transport.inspector.class'), t(`transport.vehicleClass.${vehicle.classId}`)],
    [t('transport.inspector.status'), t(`transport.vehicleStatus.${vehicle.status}`)],
    [t('transport.inspector.route'), route ? route.name : t('transport.depot.unassigned')],
    [t('transport.inspector.position'), visual?.current ? `(${visual.current.row}, ${visual.current.col})` : '—'],
    [t('transport.inspector.passengers'), `${vehicle.passengersAboard} / ${vehicleClass.capacity}`],
    [t('transport.inspector.condition'), transportFormatPercent(vehicle.condition)],
    [t('transport.inspector.age'), `${vehicle.ageMonths}mo`],
    [t('transport.inspector.odometer'), Math.round(vehicle.odometerTiles).toLocaleString()],
    [t('transport.inspector.lastRevenue'), transportFormatMoney(vehicle.tripRevenueAccrued)],
  ].map(([label, value]) => (
    `<div class="transport-inspector-row"><span>${transportEscapeHtml(label)}</span><strong>${transportEscapeHtml(value)}</strong></div>`
  )).join('');
  const followButton = visual
    ? `<div class="transport-inspector-actions"><button class="transport-btn ${transportInspectorState.follow ? 'primary' : ''}" type="button" data-transport-inspector-follow>${transportEscapeHtml(t(transportInspectorState.follow ? 'transport.inspector.following' : 'transport.inspector.follow'))}</button></div>`
    : '';
  root.querySelector('[data-transport-inspector-body]').innerHTML = rows + followButton;
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
  root.querySelector('[data-transport-inspector-body]').innerHTML = rows + routesLabel + routeChips;
}

function resetTransportUiForCityChange() {
  transportUiState.editor = null;
  transportUiState.pickingStops = false;
  transportUiState.activeTab = 'routes';
  transportUiState.selectedDepotId = '';
  transportUiState.expandedRouteId = '';
  setTransportUiMessage('');
  if (isTransportModeActive) setTransportModeActive(false);
  if (transportUiState.root && !transportUiState.root.hidden) refreshTransportUi();
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
  if (transportUiState.root && !transportUiState.root.hidden) refreshTransportUi();
}

function beginTransportRouteEditor(route = null) {
  const state = getTransportExpansionState();
  const routeIndex = route ? state.routes.indexOf(route) : state.routes.length;
  transportUiState.editor = {
    routeId: route?.id || '',
    name: route?.name || getDefaultTransportRouteName(state.nextRouteId),
    color: route?.color || TRANSPORT_ROUTE_COLORS[routeIndex % TRANSPORT_ROUTE_COLORS.length],
    fare: route?.fare ?? TRANSPORT_DEFAULT_FARE,
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
  if (selectedStops.some((stop) => {
    const eligible = getBusStopEligibleSides(stop.row, stop.col);
    return !Array.isArray(eligible) || eligible.length !== 2;
  })) {
    setTransportUiMessage(t('transport.error.unpairedStop'), 'error');
    refreshTransportUi();
    return;
  }
  const pairingCost = getTransportStopPairingCost(editor.stopIds);
  if (pairingCost > 0 && !window.confirm(t('transport.confirmPairStops', { amount: pairingCost.toLocaleString() }))) return;
  if (!ensureTransportStopPairs(editor.stopIds, activeScene)) {
    setTransportUiMessage(t('transport.error.notEnoughFunds'), 'error');
    refreshTransportUi();
    return;
  }
  try {
    const draft = {
      name: editor.name,
      color: editor.color,
      fare: editor.fare,
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
  } else {
    transportUiState.editor[field] = event.target.value;
  }
}

function handleTransportUiChange(event) {
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
  const tabButton = event.target.closest('[data-transport-tab]');
  if (tabButton) {
    transportUiState.activeTab = tabButton.dataset.transportTab;
    return refreshTransportUi();
  }
  const button = event.target.closest('[data-transport-action]');
  if (!button) return;
  const action = button.dataset.transportAction;
  if (action === 'close') return closeTransportWindow();
  if (action === 'enable') {
    setExpansionEnabled('transport', true);
    showToast(t('transport.toast.enabled'), 'info');
    return refreshTransportUi();
  }
  if (action === 'save-company') {
    const root = transportUiState.root;
    const name = root?.querySelector('[data-transport-field="companyName"]')?.value ?? '';
    const presidentName = root?.querySelector('[data-transport-field="presidentName"]')?.value ?? '';
    const state = getTransportExpansionState();
    state.company.name = String(name).trim().slice(0, 60);
    state.company.presidentName = String(presidentName).trim().slice(0, 40);
    showToast(t('transport.company.saved'), 'info');
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
    return refreshTransportUi();
  }
  if (action === 'buy-vehicle') {
    try {
      buyTransportVehicle(button.dataset.depotId, button.dataset.classId);
      showToast(t('transport.toast.vehicleBought'), 'info');
    } catch (error) {
      showToast(transportRouteErrorMessage(error), 'warning');
    }
    return refreshTransportUi();
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
  const windowOpen = !!transportUiState.root && !transportUiState.root.hidden;
  const trafficOverlay = typeof activeOverlay === 'string' && activeOverlay === 'traffic';
  return isTransportExpansionActive() && (windowOpen || trafficOverlay || isTransportRoutePicking());
}

function getTransportRouteEditorStopIds() {
  return Array.from(transportUiState.editor?.stopIds || []);
}

function handleTransportUiKeydown(event) {
  if (event.key === 'Escape' && transportInspectorState.root && !transportInspectorState.root.hidden) {
    event.preventDefault();
    closeTransportInspector();
    return;
  }
  if (!transportUiState.root || transportUiState.root.hidden) {
    // Escape with no transport windows left open steps back out to city
    // building, mirroring how the mode was entered from the guide header.
    if (event.key === 'Escape' && isTransportModeActive) {
      event.preventDefault();
      setTransportModeActive(false);
    }
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (transportUiState.editor) cancelTransportRouteEditor();
    else closeTransportWindow();
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && transportUiState.editor) {
    event.preventDefault();
    saveTransportRouteEditor();
  }
}

function setupTransportUi() {
  createTransportWindow();
  document.addEventListener('languagechange', refreshTransportUi);
  document.addEventListener('keydown', handleTransportUiKeydown);
}

if (typeof document !== 'undefined') setupTransportUi();
