// 輕鐵 in the transport company's windows (the rules are light-rail-lines.js's): the light rail lines in
// the routes tab's 輕鐵綫 section - each with its stations and cars; a car bought or sold, a pair
// coupled or uncoupled, the line renamed, suspended, resumed, carried on or closed.

const lightRailUiState = { expandedLineId: '' };

function lrtUiEscape(value) {
  return typeof transportEscapeHtml === 'function' ? transportEscapeHtml(value) : String(value ?? '');
}

function lrtUiMoney(value, signed = false) {
  return typeof transportFormatMoney === 'function' ? transportFormatMoney(value, signed) : `$${Math.round(value)}`;
}

function renderLightRailLineCard(line, state) {
  const sets = getLightRailLineSets(line, state);
  const stations = getLightRailLineStations(line, state);
  const plan = getLightRailLineRoute(line, state);
  const cycle = plan ? lightRailRoundTripMinutes(plan.route) : 0;
  const id = lrtUiEscape(line.id);
  const expanded = lightRailUiState.expandedLineId === line.id;
  const suspended = line.status === 'suspended';
  const pairs = sets.filter((v) => v.cars === 2).length;
  const metric = (label, value) => `<div class="transport-metric"><span>${lrtUiEscape(label)}</span><strong>${lrtUiEscape(value)}</strong></div>`;
  const loops = plan?.route?.loops || [false, false];
  const end = (loop) => (loop ? lightRailT('lightRail.ui.loop', '迴圈') : lightRailT('lightRail.ui.reverse', '掉頭'));
  const metrics = [
    metric(lightRailT('lightRail.ui.headway', '班次'), sets.length && cycle ? lightRailT('lightRail.ui.headwayValue', '每 {n} 分鐘', { n: Math.max(1, Math.round(cycle / sets.length)) }) : '—'),
    metric(lightRailT('lightRail.ui.roundTrip', '來回'), `${Math.round(cycle)} min`),
    metric(lightRailT('lightRail.ui.termini', '總站'), `${end(loops[0])} / ${end(loops[1])}`),
    metric(lightRailT('lightRail.ui.cars', '車卡'), lightRailT('lightRail.ui.carsValue', '{sets} 班（兩卡 {pairs}）', { sets: sets.length, pairs })),
    metric(lightRailT('lightRail.ui.passengers', '本月乘客'), Math.round(line.monthToDatePassengers || 0).toLocaleString()),
    metric(lightRailT('lightRail.ui.revenue', '本月收入'), lrtUiMoney(line.monthToDateRevenue || 0)),
    metric(lightRailT('lightRail.ui.lastNet', '上月盈虧'), (line.history || []).length ? lrtUiMoney(line.history.at(-1).net, true) : '—'),
  ].join('');
  const list = !expanded ? '' : `
    <div class="transport-route-fleet">
      ${stations.map((st, i) => `
        <div class="metro-station-row">
          <button class="transport-route-vehicle" type="button" data-transport-action="lrt-locate-station" data-station-id="${lrtUiEscape(st.id)}">
            <span>${i + 1}. 🚉 ${lrtUiEscape(st.name)}</span>
            <span>👥 ${Math.round(st.waitingByLine?.[line.id] || 0).toLocaleString()}</span>
          </button>
          <button class="transport-btn metro-station-rename" type="button" data-transport-action="lrt-rename-station" data-station-id="${lrtUiEscape(st.id)}" title="${lrtUiEscape(lightRailT('lightRail.ui.renameStation', '車站改名'))}">✎</button>
        </div>`).join('')}
      ${sets.map((v) => `
        <button class="transport-route-vehicle" type="button" data-transport-action="lrt-watch" data-vehicle-id="${lrtUiEscape(v.id)}" title="${lrtUiEscape(lightRailT('lightRail.ui.watchHint', '實時監控'))}">
          <span>📹 🚈 ${lrtUiEscape(v.id)}${v.cars === 2 ? ' ×2' : ''}</span>
          <span>👤 ${Math.round(v.aboard || 0)} / ${LIGHT_RAIL_SERVICE.carCapacity * v.cars}</span>
          <span>${lrtUiEscape(lrtUiMoney(v.monthToDateRevenue || 0))}</span>
        </button>`).join('')}
    </div>`;
  const issue = typeof renderTransportIssue !== 'function' ? '' : suspended
    ? renderTransportIssue(lightRailT('lightRail.issue.suspended', '輕鐵綫暫停中。'), `<button class="transport-btn" type="button" data-transport-action="lrt-toggle" data-line-id="${id}">${lrtUiEscape(t('transport.resume'))}</button>`)
    : !plan
      ? renderTransportIssue(lightRailT('lightRail.issue.noWay', '站與站之間嘅路軌斷咗：輕鐵行唔到。'), '')
      : sets.length === 0
        ? renderTransportIssue(lightRailT('lightRail.issue.noCars', '未有輕鐵行走：加一架輕鐵先有乘客。'), `<button class="transport-btn primary" type="button" data-transport-action="lrt-buy" data-line-id="${id}">${lrtUiEscape(lightRailT('lightRail.ui.addCar', '＋加輕鐵'))}</button>`)
        : '';
  const price = LIGHT_RAIL_SERVICE.carPrice.toLocaleString();
  return `
    <article class="transport-route" style="--route-color:${lrtUiEscape(line.color)}">
      <div class="transport-route-head">
        <div>
          <div class="transport-route-name">🚈 ${lrtUiEscape(line.name)} · ${lrtUiEscape(stations.map((st) => st.name).join(' – '))}</div>
          <button class="transport-route-fleet-toggle${expanded ? ' is-open' : ''}" type="button" data-transport-action="lrt-toggle-stations" data-line-id="${id}">${stations.length} 🚉 · ${sets.length} 🚈 ${expanded ? '▴' : '▾'}</button>
        </div>
        <span class="transport-status" data-status="${suspended ? 'suspended' : 'active'}">${lrtUiEscape(typeof t === 'function' ? t(`transport.status.${suspended ? 'suspended' : 'active'}`) : '')}</span>
      </div>
      ${list}
      ${issue}
      <div class="transport-metrics">${metrics}</div>
      <div class="transport-actions">
        <button class="transport-btn primary" type="button" data-transport-action="lrt-buy" data-line-id="${id}">${lrtUiEscape(lightRailT('lightRail.ui.buy', '加輕鐵（${price}）', { price }))}</button>
        <button class="transport-btn" type="button" data-transport-action="lrt-sell-one" data-line-id="${id}"${sets.length ? '' : ' disabled'}>${lrtUiEscape(lightRailT('lightRail.ui.sellOne', '減輕鐵'))}</button>
        <button class="transport-btn" type="button" data-transport-action="lrt-couple" data-line-id="${id}"${sets.length ? '' : ' disabled'} title="${lrtUiEscape(lightRailT('lightRail.ui.coupleHint', '撳一下多一班掛成兩卡（${price}）；全部兩卡之後再撳就全部變返單卡', { price }))}">${lrtUiEscape(lightRailT('lightRail.ui.couple', '兩卡 {n}/{total}', { n: pairs, total: sets.length }))}</button>
        <button class="transport-btn" type="button" data-transport-action="lrt-extend" data-line-id="${id}">${lrtUiEscape(lightRailT('lightRail.ui.extend', '延長'))}</button>
        <button class="transport-btn" type="button" data-transport-action="lrt-rename" data-line-id="${id}">${lrtUiEscape(lightRailT('lightRail.ui.rename', '改名'))}</button>
        <button class="transport-btn" type="button" data-transport-action="lrt-toggle" data-line-id="${id}">${lrtUiEscape(typeof t === 'function' ? t(suspended ? 'transport.resume' : 'transport.suspend') : '')}</button>
        <button class="transport-btn danger" type="button" data-transport-action="lrt-delete" data-line-id="${id}">${lrtUiEscape(typeof t === 'function' ? t('transport.delete') : 'Delete')}</button>
      </div>
    </article>`;
}

// The routes tab's light rail section.
function renderLightRailLinesSection() {
  if (typeof getLightRailState !== 'function') return '';
  const state = getLightRailState();
  const cards = state.lines.length
    ? state.lines.map((line) => renderLightRailLineCard(line, state)).join('')
    : `<div class="transport-empty">${lrtUiEscape(lightRailT('lightRail.ui.empty', '未有輕鐵綫：先鋪輕鐵路軌，喺空地直路軌上起兩個輕鐵站，再用「輕鐵路線」工具由一個站撳去另一個站。'))}</div>`;
  return `
    <div class="transport-actions">
      <button class="transport-btn primary" type="button" data-transport-action="lrt-new-line">${lrtUiEscape(lightRailT('lightRail.ui.newLine', '新增輕鐵綫'))}</button>
      <button class="transport-btn" type="button" data-transport-action="lrt-new-station">${lrtUiEscape(lightRailT('lightRail.ui.newStation', '起輕鐵站（${cost}）', { cost: LIGHT_RAIL_SERVICE.stationCost.toLocaleString() }))}</button>
      <button class="transport-btn" type="button" data-transport-action="lrt-track">${lrtUiEscape(lightRailT('lightRail.ui.track', '鋪路軌'))}</button>
    </div>
    <p class="transport-depots">${lrtUiEscape(lightRailT('lightRail.ui.stats', '輕鐵站 {stations} 個 · 輕鐵 {sets} 班 · 路軌 {tiles} 格', { stations: state.stations.length, sets: state.cars.length, tiles: Object.keys(state.tracks).length }))}</p>
    <p class="transport-depots">${lrtUiEscape(lightRailT('lightRail.ui.fareHint', '車費劃一 ${fare}；兩卡車載客多一倍。總站有迴圈就行迴圈，冇就喺站外轉軌掉頭。', { fare: LIGHT_RAIL_SERVICE.fare }))}</p>
    <div class="transport-routes">${cards}</div>`;
}

function pickLightRailTool(tool) {
  if (typeof isTouchUiProfile === 'function' && isTouchUiProfile() && typeof mobileSelectTool === 'function') { mobileSelectTool(tool); return; }
  if (typeof selectTransportModeTool === 'function') selectTransportModeTool(tool);
  else document.querySelector(`[data-tool="${tool}"]`)?.click();
}

function refreshLightRailUi() {
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
}

function handleLightRailUiAction(action, button) {
  if (!String(action || '').startsWith('lrt-')) return false;
  const toast = (text, kind = 'info') => { if (typeof showToast === 'function') showToast(text, kind); };
  const state = getLightRailState();
  const lineId = button.dataset.lineId;
  const line = lineId && state.lines.find((l) => l.id === lineId);
  const price = LIGHT_RAIL_SERVICE.carPrice.toLocaleString();
  if (action === 'lrt-new-line') {
    pickLightRailTool('light-rail-line');
    lightRailLineDraft = { forceNew: true };
    toast(lightRailT('lightRail.toast.newLineHow', '撳一個輕鐵站，再一個個撳落去；再撳最後一個站完成。'));
    return true;
  }
  if (action === 'lrt-new-station') { pickLightRailTool('light-rail-station'); return true; }
  if (action === 'lrt-track') { pickLightRailTool('light-rail-track'); return true; }
  if (action === 'lrt-toggle-stations') {
    lightRailUiState.expandedLineId = lightRailUiState.expandedLineId === lineId ? '' : lineId;
  } else if (action === 'lrt-buy' && line) {
    const result = buyLightRailCar(line.id);
    if (result.ok) toast(lightRailT('lightRail.toast.bought', '買咗一架輕鐵（${price}）。', { price }), 'success');
    else toast(result.code === 'full'
      ? lightRailT('lightRail.toast.full', '每條綫最多 {n} 班輕鐵。', { n: LIGHT_RAIL_SERVICE.maxSetsPerLine })
      : lightRailT('lightRail.toast.funds', '公司資金唔夠買輕鐵（要 ${price}）。', { price }), 'warning');
  } else if (action === 'lrt-sell-one' && line) {
    const value = sellOneLightRailCar(line.id);
    toast(lightRailT('lightRail.toast.sold', '賣咗一班輕鐵，收返 ${value}。', { value: Math.round(value).toLocaleString() }));
  } else if (action === 'lrt-couple' && line) {
    const result = coupleLightRailCars(line.id);
    if (!result.ok && result.code === 'funds') toast(lightRailT('lightRail.toast.funds', '公司資金唔夠買輕鐵（要 ${price}）。', { price }), 'warning');
  } else if (action === 'lrt-extend' && line) {
    pickLightRailTool('light-rail-line');
    lightRailLineDraft = { lineId: line.id };
    const last = getLightRailStationById(line.stationIds.at(-1), state);
    toast(lightRailT('lightRail.line.extend', '延長「{line}」：撳下一個站；再撳「{name}」完成。', { line: line.name, name: last?.name || '' }));
    return true;
  } else if (action === 'lrt-rename' && line) {
    if (typeof showTextPromptDialog === 'function') {
      showTextPromptDialog(lightRailT('lightRail.ui.renamePrompt', '輕鐵綫名稱'), line.name || '').then((input) => {
        if (input === null) return;
        line.name = String(input).trim().slice(0, 40) || line.name;
        if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
        refreshLightRailUi();
      }).catch((error) => console.warn('[light rail line rename]', error));
    }
    return true;
  } else if (action === 'lrt-toggle' && line) {
    setLightRailLineSuspended(line.id, line.status !== 'suspended');
  } else if (action === 'lrt-delete' && line) {
    if (typeof window !== 'undefined' && !window.confirm(lightRailT('lightRail.confirmDelete', '取消「{name}」？佢嘅輕鐵會即刻賣出，車站留低。', { name: line.name }))) return true;
    const value = removeLightRailLine(line.id);
    toast(lightRailT('lightRail.toast.lineClosed', '輕鐵綫取消咗，賣輕鐵收返 ${value}。', { value: Math.round(value).toLocaleString() }));
  } else if (action === 'lrt-rename-station') {
    const station = getLightRailStationById(button.dataset.stationId, state);
    if (station && typeof showTextPromptDialog === 'function') {
      showTextPromptDialog(lightRailT('lightRail.ui.renameStationPrompt', '輕鐵站名稱'), station.name || '').then((input) => {
        if (input === null) return;
        station.name = String(input).trim().slice(0, 40) || station.name;
        if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
        refreshLightRailUi();
      }).catch((error) => console.warn('[light rail station rename]', error));
    }
    return true;
  } else if (action === 'lrt-watch') {
    if (typeof openVehicleTrackingWindow === 'function') openVehicleTrackingWindow('lightrail', button.dataset.vehicleId);
    return true;
  } else if (action === 'lrt-locate-station') {
    const station = getLightRailStationById(button.dataset.stationId, state);
    if (station && activeScene?.cameras?.main) {
      const face = getTileFaceGeometry(station.row, station.col, activeScene.offsetX, activeScene.offsetY);
      activeScene.cameras.main.centerOn(face.center.x, face.center.y);
    }
    return true;
  }
  refreshLightRailUi();
  return true;
}
