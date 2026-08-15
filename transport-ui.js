// ── Transport Department window and map stop picker ─────────────────────────

const transportUiState = {
  root: null,
  editor: null,
  pickingStops: false,
  message: '',
  messageTone: 'info',
};

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
        <label>${transportEscapeHtml(t('transport.routeBuses'))}<input data-transport-field="buses" type="number" min="1" max="8" step="1" value="${editor.buses}" /></label>
        <label>${transportEscapeHtml(t('transport.routeFare'))}<input data-transport-field="fare" type="number" min="1" max="5" step="0.5" value="${editor.fare}" /></label>
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
  return `
    <article class="transport-route" style="--route-color:${transportEscapeHtml(route.color)}">
      <div class="transport-route-head">
        <div><div class="transport-route-name">${transportEscapeHtml(route.name)}</div><small>${route.buses} 🚌 · $${Number(route.fare).toFixed(2)}</small></div>
        <span class="transport-status" data-status="${transportEscapeHtml(status)}">${transportEscapeHtml(t(`transport.status.${status}`))}</span>
      </div>
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
  body.innerHTML = `
    <div class="transport-topline">
      <span class="transport-credit">${transportEscapeHtml(t('transport.credit', { amount: state.startupCreditRemaining.toLocaleString() }))}</span>
      ${transportUiState.editor ? '' : `<button class="transport-btn primary" type="button" data-transport-action="new-route">${transportEscapeHtml(t('transport.newRoute'))}</button>`}
    </div>
    <div class="transport-summary">${summaryCards}</div>
    <p class="transport-depots">${transportEscapeHtml(t('transport.depots', { connected: connectedDepots, total: depots.length }))}</p>
    ${transportUiState.editor ? renderTransportEditor() : `<div class="transport-routes">${routes}</div>`}
  `;
}

function openTransportWindow() {
  const root = createTransportWindow();
  if (!root) return;
  root.hidden = false;
  refreshTransportUi();
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
}

function closeTransportWindow() {
  if (!transportUiState.root) return;
  transportUiState.root.hidden = true;
  transportUiState.pickingStops = false;
  transportUiState.editor = null;
  if (typeof invalidateTransportVisuals === 'function') invalidateTransportVisuals(activeScene);
}

function resetTransportUiForCityChange() {
  transportUiState.editor = null;
  transportUiState.pickingStops = false;
  setTransportUiMessage('');
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
    buses: route?.buses ?? TRANSPORT_DEFAULT_ROUTE_BUSES,
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
      buses: editor.buses,
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
  if (field === 'buses') {
    transportUiState.editor.buses = Math.round(transportClamp(event.target.value, 1, 8));
  } else if (field === 'fare') {
    transportUiState.editor.fare = normalizeTransportFare(event.target.value);
  } else {
    transportUiState.editor[field] = event.target.value;
  }
}

function handleTransportUiClick(event) {
  const button = event.target.closest('[data-transport-action]');
  if (!button) return;
  const action = button.dataset.transportAction;
  if (action === 'close') return closeTransportWindow();
  if (action === 'enable') {
    setExpansionEnabled('transport', true);
    showToast(t('transport.toast.enabled'), 'info');
    return refreshTransportUi();
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
  if (!transportUiState.root || transportUiState.root.hidden) return;
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
