// 渡海小輪 in the transport company's windows (the rules are ferry.js's): the ferry routes in the
// routes tab - each with its fleet, takings and costs, a ferry bought or sold, the route suspended,
// resumed or closed - the pier and ferry windows (the transport inspector, opened by a click in
// Transport Mode), and the routes drawn over the water in Transport Mode.

const ferryUiState = { expandedRouteId: '' };

function ferryUiEscape(value) {
  return typeof transportEscapeHtml === 'function' ? transportEscapeHtml(value)
    : String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function ferryUiMoney(value, signed = false) {
  return typeof transportFormatMoney === 'function' ? transportFormatMoney(value, signed) : `$${Math.round(value)}`;
}

function getFerryPierById(id, state = getFerryState()) {
  return state.piers.find((p) => p.id === id) || null;
}

function getFerryRouteName(route, state = getFerryState()) {
  return route.pierIds.map((id) => getFerryPierById(id, state)?.name || id).join(' ⇄ ');
}

// A route at a glance: its fleet by what it is doing, how often a ferry calls (a round trip's
// minutes over the ferries on the timetable), this month so far and last month's books.
function getFerryRouteSummary(route, state = getFerryState()) {
  const fleet = getFerryRouteVessels(route, state);
  const working = fleet.filter((v) => v.status === 'active');
  const legs = getFerryRouteLegs(route);
  const cycle = legs ? ferryCycleMinutes(legs) : 0;
  const last = (route.history || []).at(-1) || null;
  return {
    fleet,
    working: working.length,
    servicing: fleet.filter((v) => v.status === 'servicing').length,
    broken: fleet.filter((v) => v.status === 'broken_down').length,
    cycleMinutes: cycle,
    headwayMinutes: working.length ? cycle / working.length : 0,
    passengers: route.monthToDatePassengers || 0,
    revenue: route.monthToDateRevenue || 0,
    last,
  };
}

function ferryVesselStatusText(v) {
  if (v.sellAtNextPier) return ferryT('ferry.vessel.status.selling', '賣出中（泊岸後）');
  return {
    active: ferryT('ferry.vessel.status.active', '航行中'),
    servicing: ferryT('ferry.vessel.status.servicing', '保養中'),
    broken_down: ferryT('ferry.vessel.status.broken', '故障'),
  }[v.status] || v.status;
}

function renderFerryRouteCard(route, state) {
  const s = getFerryRouteSummary(route, state);
  const id = ferryUiEscape(route.id);
  const expanded = ferryUiState.expandedRouteId === route.id;
  const suspended = route.status === 'suspended';
  const metric = (label, value) => `<div class="transport-metric"><span>${ferryUiEscape(label)}</span><strong>${ferryUiEscape(value)}</strong></div>`;
  const metrics = [
    metric(ferryT('ferry.route.headway', '班次'), s.working ? ferryT('ferry.route.headwayValue', '每 {n} 分鐘', { n: Math.round(s.headwayMinutes) }) : '—'),
    metric(ferryT('ferry.route.roundTrip', '來回'), `${Math.round(s.cycleMinutes)} min`),
    metric(ferryT('ferry.route.passengers', '本月乘客'), Math.round(s.passengers).toLocaleString()),
    metric(ferryT('ferry.route.revenue', '本月收入'), ferryUiMoney(s.revenue)),
    metric(ferryT('ferry.route.lastCost', '上月成本'), s.last ? ferryUiMoney(s.last.cost) : '—'),
    metric(ferryT('ferry.route.lastNet', '上月盈虧'), s.last ? ferryUiMoney(s.last.net, true) : '—'),
  ].join('');
  const rows = !expanded ? '' : `
    <div class="transport-route-fleet">
      ${s.fleet.length === 0
        ? `<div class="transport-empty">${ferryUiEscape(ferryT('ferry.route.noFerries', '未有船：撳「加船」。'))}</div>`
        : s.fleet.map((v) => `
          <button class="transport-route-vehicle" type="button" data-transport-action="ferry-inspect" data-ferry-id="${ferryUiEscape(v.id)}">
            <span>⛴ ${ferryUiEscape(v.id)}</span>
            <span>${ferryUiEscape(ferryVesselStatusText(v))}</span>
            <span>👤 ${v.aboard}</span>
            <span>${ferryUiEscape(typeof transportFormatPercent === 'function' ? transportFormatPercent(v.condition) : `${Math.round(v.condition * 100)}%`)}</span>
          </button>`).join('')}
    </div>`;
  const statusKey = suspended ? 'suspended' : 'active';
  return `
    <article class="transport-route" style="--route-color:${ferryUiEscape(route.color)}">
      <div class="transport-route-head">
        <div>
          <div class="transport-route-name">⛴ ${ferryUiEscape(getFerryRouteName(route, state))}</div>
          <button class="transport-route-fleet-toggle${expanded ? ' is-open' : ''}" type="button" data-transport-action="ferry-toggle-fleet" data-route-id="${id}">${s.fleet.length} ⛴ ${expanded ? '▴' : '▾'}</button>
        </div>
        ${typeof renderTransportSparkline === 'function' ? renderTransportSparkline(route.history, route.color) : ''}
        <span class="transport-status" data-status="${statusKey}">${ferryUiEscape(typeof t === 'function' ? t(`transport.status.${statusKey}`) : statusKey)}</span>
      </div>
      ${rows}
      ${typeof renderTransportIssue !== 'function' ? '' : suspended
        ? renderTransportIssue(ferryT('ferry.issue.suspended', '航線暫停中，船唔會開出。'), `<button class="transport-btn" type="button" data-transport-action="ferry-toggle" data-route-id="${id}">${ferryUiEscape(t('transport.resume'))}</button>`)
        : s.fleet.length === 0
          ? renderTransportIssue(ferryT('ferry.issue.noFerries', '未有船行走：加一隻船先有乘客。'), `<button class="transport-btn primary" type="button" data-transport-action="ferry-buy" data-route-id="${id}">${ferryUiEscape(ferryT('ferry.issue.addFerry', '＋加船'))}</button>`)
          : ''}
      <div class="transport-metrics">${metrics}</div>
      <div class="transport-actions">
        <button class="transport-btn primary" type="button" data-transport-action="ferry-buy" data-route-id="${id}">${ferryUiEscape(ferryT('ferry.route.buy', '加船（${price}）', { price: FERRY.vesselPrice.toLocaleString() }))}</button>
        <button class="transport-btn" type="button" data-transport-action="ferry-sell-one" data-route-id="${id}"${s.fleet.length ? '' : ' disabled'}>${ferryUiEscape(ferryT('ferry.route.sellOne', '減船'))}</button>
        <button class="transport-btn" type="button" data-transport-action="ferry-toggle" data-route-id="${id}">${ferryUiEscape(typeof t === 'function' ? t(suspended ? 'transport.resume' : 'transport.suspend') : (suspended ? 'Resume' : 'Suspend'))}</button>
        <button class="transport-btn danger" type="button" data-transport-action="ferry-delete" data-route-id="${id}">${ferryUiEscape(typeof t === 'function' ? t('transport.delete') : 'Delete')}</button>
      </div>
    </article>`;
}

// The routes tab's ferry section, under the bus routes.
function renderFerryRoutesSection() {
  if (typeof getFerryState !== 'function') return '';
  const state = getFerryState();
  const cards = state.routes.length
    ? state.routes.map((route) => renderFerryRouteCard(route, state)).join('')
    : `<div class="transport-empty">${ferryUiEscape(ferryT('ferry.routes.empty', '未有渡輪航線：先起兩個渡輪碼頭，再用「渡輪航線」工具撳兩個碼頭。'))}</div>`;
  return `
    <div class="transport-actions"><button class="transport-btn primary" type="button" data-transport-action="ferry-new-route">${ferryUiEscape(ferryT('ferry.routes.new', '新增渡輪航線'))}</button></div>
    <div class="transport-routes">${cards}</div>`;
}

// The fleet window's list tab: every ferry under the buses, one row each.
function renderFerryFleetSection() {
  if (typeof getFerryState !== 'function') return '';
  const state = getFerryState();
  if (!state.vessels.length) return '';
  const head = ['ferry.fleet.vessel', 'ferry.fleet.route', 'ferry.fleet.status', 'ferry.fleet.aboard', 'ferry.fleet.condition', 'ferry.fleet.revenue']
    .map((key, i) => `<th>${ferryUiEscape(ferryT(key, ['船', '航線', '狀態', '船上', '狀況', '本月收入'][i]))}</th>`).join('');
  const rows = state.vessels.map((v) => {
    const route = state.routes.find((r) => r.id === v.routeId);
    return `<tr>
      <td><strong>⛴ ${ferryUiEscape(v.id)}</strong></td>
      <td>${route ? `<span class="transport-line-cell"><i class="transport-line-swatch" style="--route-color:${ferryUiEscape(route.color)}"></i>${ferryUiEscape(getFerryRouteName(route, state))}</span>` : '—'}</td>
      <td>${ferryUiEscape(ferryVesselStatusText(v))}</td>
      <td>👤 ${Math.round(v.aboard || 0)}</td>
      <td>${ferryUiEscape(typeof transportFormatPercent === 'function' ? transportFormatPercent(v.condition) : `${Math.round(v.condition * 100)}%`)}</td>
      <td>${ferryUiEscape(ferryUiMoney(v.monthToDateRevenue || 0))}</td>
      <td><button class="transport-btn" type="button" data-transport-action="ferry-inspect" data-ferry-id="${ferryUiEscape(v.id)}">${ferryUiEscape(ferryT('ferry.locate', '睇位置'))}</button></td>
    </tr>`;
  }).join('');
  return `
    <h3 class="transport-section-title">⛴ ${ferryUiEscape(ferryT('ferry.fleet.title', '渡輪'))}</h3>
    <div class="transport-table-wrap"><table class="transport-table"><thead><tr>${head}<th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function ferryUiToast(text, kind = 'info') {
  if (typeof showToast === 'function') showToast(text, kind);
}

function ferryBuyToast(result) {
  if (result.ok) return ferryUiToast(ferryT('ferry.toast.bought', '買咗一艘天星小輪（${price}）。', { price: FERRY.vesselPrice.toLocaleString() }), 'success');
  const why = {
    full: ferryT('ferry.toast.full', '每條航線最多 {n} 艘船。', { n: FERRY.maxVesselsPerRoute }),
    funds: ferryT('ferry.toast.funds', '公司資金唔夠買船（要 ${price}）。', { price: FERRY.vesselPrice.toLocaleString() }),
  }[result.code] || ferryT('ferry.toast.buyFailed', '買唔到船。');
  return ferryUiToast(why, 'warning');
}

function ferrySellToast(result) {
  if (!result.ok) return;
  ferryUiToast(result.sold
    ? ferryT('ferry.toast.sold', '賣咗一艘小輪，收返 ${value}。', { value: Math.round(result.value).toLocaleString() })
    : ferryT('ferry.toast.selling', '小輪會喺下一個碼頭泊岸後賣出（約 ${value}）。', { value: Math.round(result.value).toLocaleString() }), 'info');
}

function locateFerrySprite(vesselId) {
  const rec = activeScene?.ferrySprites?.get(`ferry|${vesselId}`);
  if (rec?.sprite && activeScene?.cameras?.main) activeScene.cameras.main.centerOn(rec.sprite.x, rec.sprite.y);
}

function locateFerryPier(pier) {
  if (!pier || !activeScene?.cameras?.main || typeof isoToScreen !== 'function') return;
  const p = isoToScreen(pier.col + FERRY.pierCols / 2, pier.row + FERRY.pierRows / 2);
  activeScene.cameras.main.centerOn(p.x + activeScene.offsetX, p.y + activeScene.offsetY);
}

async function renameFerryPierPrompt(pierId) {
  const pier = getFerryPierById(pierId);
  if (!pier || typeof showTextPromptDialog !== 'function') return;
  const input = await showTextPromptDialog(ferryT('ferry.pier.renamePrompt', '碼頭名稱'), pier.name || '');
  if (input === null) return;
  pier.name = String(input).trim().slice(0, 40) || pier.name;
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  refreshFerryUi();
}

function refreshFerryUi() {
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
  if (typeof refreshTransportInspector === 'function') refreshTransportInspector();
}

// The ferry actions of the transport windows and the inspector: true when it was one of them.
function handleFerryUiAction(action, button) {
  if (!String(action || '').startsWith('ferry-')) return false;
  const state = getFerryState();
  const routeId = button.dataset.routeId;
  const route = routeId && state.routes.find((r) => r.id === routeId);
  if (action === 'ferry-new-route') {
    if (typeof selectTransportModeTool === 'function') selectTransportModeTool('ferry-route');
    else document.querySelector('[data-tool="ferry-route"]')?.click();
    ferryUiToast(ferryT('ferry.toast.newRouteHow', '撳一個渡輪碼頭，再撳另一個，就開到航線。'), 'info');
    return true;
  }
  if (action === 'ferry-toggle-fleet') {
    ferryUiState.expandedRouteId = ferryUiState.expandedRouteId === routeId ? '' : routeId;
  } else if (action === 'ferry-buy' && route) {
    ferryBuyToast(buyFerry(route.id));
  } else if (action === 'ferry-sell-one' && route) {
    // the most worn of its ferries
    const fleet = getFerryRouteVessels(route, state).filter((v) => !v.sellAtNextPier).sort((a, b) => a.condition - b.condition);
    if (!fleet.length) return true;
    if (typeof window !== 'undefined' && !window.confirm(ferryT('ferry.confirmSell', '賣出一艘小輪（{id}）？', { id: fleet[0].id }))) return true;
    ferrySellToast(sellFerry(fleet[0].id));
  } else if (action === 'ferry-toggle' && route) {
    setFerryRouteSuspended(route.id, route.status !== 'suspended');
  } else if (action === 'ferry-delete' && route) {
    if (typeof window !== 'undefined' && !window.confirm(ferryT('ferry.confirmDelete', '取消「{name}」航線？佢嘅船會即刻賣出。', { name: getFerryRouteName(route, state) }))) return true;
    const value = removeFerryRoute(route.id);
    ferryUiToast(ferryT('ferry.toast.routeClosed', '航線取消咗，賣船收返 ${value}。', { value: Math.round(value).toLocaleString() }), 'info');
  } else if (action === 'ferry-inspect') {
    openFerryInspector(button.dataset.ferryId);
    locateFerrySprite(button.dataset.ferryId);
  } else if (action === 'ferry-sell') {
    if (typeof window !== 'undefined' && !window.confirm(ferryT('ferry.confirmSell', '賣出一艘小輪（{id}）？', { id: button.dataset.ferryId }))) return true;
    ferrySellToast(sellFerry(button.dataset.ferryId));
  } else if (action === 'ferry-pier-rename') {
    renameFerryPierPrompt(button.dataset.pierId).catch((error) => console.warn('[ferry pier rename]', error));
    return true;
  } else if (action === 'ferry-locate-pier') {
    locateFerryPier(getFerryPierById(button.dataset.pierId));
    return true;
  }
  refreshFerryUi();
  return true;
}

// ── The pier and ferry windows (the transport inspector) ─────────────────────

function openFerryInspectorKind(kind, id, pointer) {
  if (typeof createTransportVehicleInspector !== 'function') return;
  const root = createTransportVehicleInspector();
  if (!root) return;
  transportInspectorState.kind = kind;
  transportInspectorState.ferryId = String(id || '');
  root.hidden = false;
  if (typeof positionTransportVehicleInspector === 'function') positionTransportVehicleInspector(root, pointer);
  refreshTransportInspector();
}

function openFerryPierInspector(pierId, pointer = null) { openFerryInspectorKind('ferry-pier', pierId, pointer); }
function openFerryInspector(vesselId, pointer = null) { openFerryInspectorKind('ferry', vesselId, pointer); }

function ferryInspectorRows(rows) {
  return rows.map(([label, value]) => `<div class="transport-inspector-row"><span>${ferryUiEscape(label)}</span><strong>${ferryUiEscape(value)}</strong></div>`).join('');
}

// The inspector's body for a pier or a ferry; false when there is nothing left to show.
function refreshFerryInspectorBody(root, kind, id) {
  const state = getFerryState();
  const title = root.querySelector('[data-transport-inspector-title]');
  const body = root.querySelector('[data-transport-inspector-body]');
  if (kind === 'ferry-pier') {
    const pier = getFerryPierById(id, state);
    if (!pier) return false;
    title.textContent = `⚓ ${pier.name || pier.id}`;
    const routes = state.routes.filter((r) => r.pierIds.includes(pier.id));
    const point = ferryPierCatchmentPoint(pier);
    const catchment = typeof getTransportStopCatchmentUnits === 'function' ? getTransportStopCatchmentUnits(point) : null;
    const daily = catchment && typeof getTransportStopDailyRiders === 'function'
      ? getTransportStopDailyRiders(point, TRANSPORT_STOP_DAILY_BOARDING_SHARE * FERRY.boardingShare) : 0;
    const chips = routes.length
      ? `<div class="transport-inspector-routes">${routes.map((r) => `<span class="transport-inspector-route-chip" style="--route-color:${ferryUiEscape(r.color)}">${ferryUiEscape(getFerryRouteName(r, state))}</span>`).join('')}</div>`
      : ferryInspectorRows([[ferryT('ferry.pier.routes', '航線'), ferryT('ferry.pier.noRoutes', '未有航線停')]]);
    body.innerHTML = ferryInspectorRows([
      [ferryT('ferry.pier.waiting', '候船'), `👤 ${Math.floor(pier.waiting || 0)}`],
      [ferryT('ferry.pier.daily', '預計每日乘客'), daily >= 0.5 ? `~${Math.round(daily).toLocaleString()}` : ferryT('transport.stopInspector.noCatchment', '範圍內冇住戶或工作地點')],
      [ferryT('ferry.pier.catchment', '範圍內居民'), Math.round(catchment?.residents || 0).toLocaleString()],
      [ferryT('ferry.pier.destinations', '範圍內職位及目的地'), Math.round(catchment?.destinationUnits || 0).toLocaleString()],
      [ferryT('ferry.pier.upkeep', '每月維修'), ferryUiMoney(FERRY.pierMonthlyUpkeep)],
    ]) + chips + `<div class="transport-inspector-actions">
      <button class="transport-btn" type="button" data-transport-action="ferry-locate-pier" data-pier-id="${ferryUiEscape(pier.id)}">${ferryUiEscape(ferryT('ferry.locate', '睇位置'))}</button>
      <button class="transport-btn" type="button" data-transport-action="ferry-pier-rename" data-pier-id="${ferryUiEscape(pier.id)}">${ferryUiEscape(ferryT('ferry.pier.rename', '改名'))}</button>
    </div>`;
    return true;
  }
  const v = state.vessels.find((x) => x.id === id);
  if (!v) return false;
  const route = state.routes.find((r) => r.id === v.routeId);
  title.textContent = `⛴ ${v.id}`;
  const serviceEvery = typeof TRANSPORT_SERVICE_INTERVAL_MINUTES === 'number' ? TRANSPORT_SERVICE_INTERVAL_MINUTES : 4 * 1440;
  const nextService = Math.max(0, serviceEvery - v.minutesSinceService) / 1440;
  const legs = route && getFerryRouteLegs(route);
  const now = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
  const point = legs && v.status === 'active' ? ferryVesselPointAt(legs, now, v.phase) : null;
  const where = !point ? '—' : point.state === 'alongside'
    ? ferryT('ferry.vessel.alongside', '泊喺「{pier}」', { pier: getFerryPierById(route.pierIds[point.pier], state)?.name || '' })
    : ferryT('ferry.vessel.sailing', '航行中');
  body.innerHTML = ferryInspectorRows([
    [ferryT('ferry.vessel.route', '航線'), route ? getFerryRouteName(route, state) : '—'],
    [ferryT('ferry.vessel.status', '狀態'), ferryVesselStatusText(v)],
    [ferryT('ferry.vessel.where', '位置'), where],
    [ferryT('ferry.vessel.aboard', '船上乘客'), `👤 ${v.aboard} / ${FERRY.capacity}`],
    [ferryT('ferry.vessel.condition', '狀況'), `${Math.round(v.condition * 100)}%`],
    [ferryT('ferry.vessel.nextService', '下次保養'), ferryT('ferry.vessel.days', '{n} 日後', { n: nextService.toFixed(1) })],
    [ferryT('ferry.vessel.age', '船齡'), ferryT('ferry.vessel.months', '{n} 個月', { n: v.ageMonths })],
    [ferryT('ferry.vessel.revenue', '本月收入'), ferryUiMoney(v.monthToDateRevenue)],
    [ferryT('ferry.vessel.lastRevenue', '上月收入'), ferryUiMoney(v.lastMonthRevenue)],
    [ferryT('ferry.vessel.resale', '賣出可得'), ferryUiMoney(ferryResaleValue(v))],
  ]) + `<div class="transport-inspector-actions">
    <button class="transport-btn danger" type="button" data-transport-action="ferry-sell" data-ferry-id="${ferryUiEscape(v.id)}"${v.sellAtNextPier ? ' disabled' : ''}>${ferryUiEscape(ferryT('ferry.vessel.sell', '賣船'))}</button>
  </div>`;
  return true;
}

// A Transport Mode click on the map: a pier's tiles, or a ferry under the pointer. True when handled.
function handleFerryMapInspect(row, col, pointer) {
  if (typeof getFerryPierAt !== 'function') return false;
  const scene = typeof activeScene !== 'undefined' ? activeScene : null;
  const x = pointer?.worldX;
  const y = pointer?.worldY;
  if (scene?.ferrySprites && Number.isFinite(x) && Number.isFinite(y)) {
    for (const rec of scene.ferrySprites.values()) {
      if (!rec.ferryVesselId || !rec.sprite?.visible) continue;
      if (rec.sprite.getBounds().contains(x, y)) { openFerryInspector(rec.ferryVesselId, pointer); return true; }
    }
  }
  const pier = getFerryPierAt(row, col);
  if (pier) { openFerryPierInspector(pier.id, pointer); return true; }
  return false;
}

// ── The routes on the map, in Transport Mode ─────────────────────────────────

// Drawn on the water - over the sea, under the ferries, piers and bridges - in each route's colour,
// redrawn when the network, the berths, the view or the routes change.
function updateFerryRouteOverlay(scene) {
  if (!scene || typeof getFerryState !== 'function') return;
  const show = typeof isTransportModeActive !== 'undefined' && isTransportModeActive;
  const state = getFerryState();
  if (!show || !state.routes.length) {
    if (scene.ferryRouteOverlay?.visible) scene.ferryRouteOverlay.setVisible(false);
    return;
  }
  if (!scene.ferryRouteOverlay) {
    const g = scene.add.graphics();
    g.setDepth(typeof getWorldDepth === 'function' ? getWorldDepth('road') - 2 : 99998);
    if (scene.worldMask) g.setMask(scene.worldMask);
    scene.ferryRouteOverlay = g;
  }
  const g = scene.ferryRouteOverlay;
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const key = [typeof ferryNetworkRevision !== 'undefined' ? ferryNetworkRevision : 0,
    typeof ferryBerthRevision !== 'undefined' ? ferryBerthRevision : 0, rotation, scene.offsetX, scene.offsetY,
    ...state.routes.map((r) => `${r.id}:${r.color}:${r.status}`)].join('|');
  g.setVisible(true);
  if (g.overlayKey === key) return;
  g.overlayKey = key;
  g.clear();
  const surface = (typeof BUILDING_SURFACE_Y_OFFSET === 'number' ? BUILDING_SURFACE_Y_OFFSET : 15) + TILE_HEIGHT / 2;
  state.routes.forEach((route) => {
    const legs = getFerryRouteLegs(route);
    if (!legs) return;
    const colour = parseInt(String(route.color).replace('#', ''), 16) || 0x1f8a5b;
    g.lineStyle(4, colour, route.status === 'suspended' ? 0.35 : 0.8);
    const pts = legs.out.points.map(([r, c]) => {
      const p = isoToScreen(c, r);
      return new Phaser.Math.Vector2(p.x + scene.offsetX, p.y + scene.offsetY - surface);
    });
    g.strokePoints(pts, false);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getFerryRouteSummary, getFerryRouteName, ferryVesselStatusText };
}
