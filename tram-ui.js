// 電車 in the transport company's windows (the rules are tram-lines.js's): the tram lines in the
// routes tab - each with its stops, trams, takings and costs; a tram bought or sold, the line
// suspended, resumed, carried on or closed.

const tramUiState = { expandedLineId: '' };

function tramUiEscape(value) {
  return typeof transportEscapeHtml === 'function' ? transportEscapeHtml(value) : String(value ?? '');
}

function tramUiMoney(value, signed = false) {
  return typeof transportFormatMoney === 'function' ? transportFormatMoney(value, signed) : `$${Math.round(value)}`;
}

function getTramLineSummary(line, state = getTramState()) {
  const trams = getTramLineTrams(line, state);
  const plan = getTramLineRoute(line, state);
  const cycle = plan ? tramRoundTripMinutes(plan.route) : 0;
  return {
    trams, plan,
    stops: getTramLineStops(line, state),
    cycleMinutes: cycle,
    headwayMinutes: trams.length ? cycle / trams.length : 0,
    passengers: line.monthToDatePassengers || 0,
    revenue: line.monthToDateRevenue || 0,
    last: (line.history || []).at(-1) || null,
  };
}

function renderTramLineCard(line, state) {
  const s = getTramLineSummary(line, state);
  const id = tramUiEscape(line.id);
  const expanded = tramUiState.expandedLineId === line.id;
  const suspended = line.status === 'suspended';
  const metric = (label, value) => `<div class="transport-metric"><span>${tramUiEscape(label)}</span><strong>${tramUiEscape(value)}</strong></div>`;
  const loops = s.plan?.route?.loops || [false, false];
  const ends = [loops[0] ? tramT('tram.ui.loop', '迴圈') : tramT('tram.ui.reverse', '掉頭'), loops[1] ? tramT('tram.ui.loop', '迴圈') : tramT('tram.ui.reverse', '掉頭')];
  const metrics = [
    metric(tramT('tram.ui.headway', '班次'), s.trams.length ? tramT('tram.ui.headwayValue', '每 {n} 分鐘', { n: Math.max(1, Math.round(s.headwayMinutes)) }) : '—'),
    metric(tramT('tram.ui.roundTrip', '來回'), `${Math.round(s.cycleMinutes)} min`),
    metric(tramT('tram.ui.termini', '總站'), ends.join(' / ')),
    metric(tramT('tram.ui.passengers', '本月乘客'), Math.round(s.passengers).toLocaleString()),
    metric(tramT('tram.ui.revenue', '本月收入'), tramUiMoney(s.revenue)),
    metric(tramT('tram.ui.lastNet', '上月盈虧'), s.last ? tramUiMoney(s.last.net, true) : '—'),
  ].join('');
  const stops = !expanded ? '' : `
    <div class="transport-route-fleet">
      ${s.stops.map((stop, i) => `
        <div class="metro-station-row">
          <button class="transport-route-vehicle" type="button" data-transport-action="tram-locate-stop" data-stop-id="${tramUiEscape(stop.id)}">
            <span>${i + 1}. 🚋 ${tramUiEscape(stop.name)}</span>
            <span>👥 ${Math.round(stop.waitingByLine?.[line.id] || 0).toLocaleString()}</span>
          </button>
          <button class="transport-btn metro-station-rename" type="button" data-transport-action="tram-rename-stop" data-stop-id="${tramUiEscape(stop.id)}" title="${tramUiEscape(tramT('tram.ui.renameStop', '車站改名'))}">✎</button>
        </div>`).join('')}
    </div>`;
  const statusKey = suspended ? 'suspended' : 'active';
  const issue = typeof renderTransportIssue !== 'function' ? '' : suspended
    ? renderTransportIssue(tramT('tram.issue.suspended', '電車綫暫停中。'), `<button class="transport-btn" type="button" data-transport-action="tram-toggle" data-line-id="${id}">${tramUiEscape(t('transport.resume'))}</button>`)
    : !s.plan
      ? renderTransportIssue(tramT('tram.issue.noWay', '站與站之間嘅路軌斷咗：電車行唔到。'), '')
      : s.trams.length === 0
        ? renderTransportIssue(tramT('tram.issue.noTrams', '未有電車行走：加一架電車先有乘客。'), `<button class="transport-btn primary" type="button" data-transport-action="tram-buy" data-line-id="${id}">${tramUiEscape(tramT('tram.ui.addTram', '＋加電車'))}</button>`)
        : '';
  return `
    <article class="transport-route" style="--route-color:${tramUiEscape(line.color)}">
      <div class="transport-route-head">
        <div>
          <div class="transport-route-name">🚋 ${tramUiEscape(line.name)} · ${tramUiEscape(s.stops.map((st) => st.name).join(' – '))}</div>
          <button class="transport-route-fleet-toggle${expanded ? ' is-open' : ''}" type="button" data-transport-action="tram-toggle-stops" data-line-id="${id}">${s.stops.length} 🚏 · ${s.trams.length} 🚋 ${expanded ? '▴' : '▾'}</button>
        </div>
        ${typeof renderTransportSparkline === 'function' ? renderTransportSparkline(line.history, line.color) : ''}
        <span class="transport-status" data-status="${statusKey}">${tramUiEscape(typeof t === 'function' ? t(`transport.status.${statusKey}`) : statusKey)}</span>
      </div>
      ${stops}
      ${issue}
      <div class="transport-metrics">${metrics}</div>
      <div class="transport-actions">
        <button class="transport-btn primary" type="button" data-transport-action="tram-buy" data-line-id="${id}">${tramUiEscape(tramT('tram.ui.buy', '加電車（${price}）', { price: TRAM_SERVICE.tramPrice.toLocaleString() }))}</button>
        <button class="transport-btn" type="button" data-transport-action="tram-sell-one" data-line-id="${id}"${s.trams.length ? '' : ' disabled'}>${tramUiEscape(tramT('tram.ui.sellOne', '減電車'))}</button>
        <button class="transport-btn" type="button" data-transport-action="tram-extend" data-line-id="${id}">${tramUiEscape(tramT('tram.ui.extend', '延長'))}</button>
        <button class="transport-btn" type="button" data-transport-action="tram-rename" data-line-id="${id}">${tramUiEscape(tramT('tram.ui.rename', '改名'))}</button>
        <button class="transport-btn" type="button" data-transport-action="tram-toggle" data-line-id="${id}">${tramUiEscape(typeof t === 'function' ? t(suspended ? 'transport.resume' : 'transport.suspend') : (suspended ? 'Resume' : 'Suspend'))}</button>
        <button class="transport-btn danger" type="button" data-transport-action="tram-delete" data-line-id="${id}">${tramUiEscape(typeof t === 'function' ? t('transport.delete') : 'Delete')}</button>
      </div>
    </article>`;
}

// The routes tab's tram section.
function renderTramLinesSection() {
  if (typeof getTramState !== 'function') return '';
  const state = getTramState();
  const cards = state.lines.length
    ? state.lines.map((line) => renderTramLineCard(line, state)).join('')
    : `<div class="transport-empty">${tramUiEscape(tramT('tram.ui.empty', '未有電車綫：先鋪電車路軌，喺直路軌上起兩個電車站，再用「電車路線」工具由一個站撳去另一個站。'))}</div>`;
  const trackTiles = Object.keys(state.tracks).length;
  return `
    <div class="transport-actions">
      <button class="transport-btn primary" type="button" data-transport-action="tram-new-line">${tramUiEscape(tramT('tram.ui.newLine', '新增電車綫'))}</button>
      <button class="transport-btn" type="button" data-transport-action="tram-new-stop">${tramUiEscape(tramT('tram.ui.newStop', '起電車站（${cost}）', { cost: TRAM_SERVICE.stopCost.toLocaleString() }))}</button>
      <button class="transport-btn" type="button" data-transport-action="tram-track">${tramUiEscape(tramT('tram.ui.track', '鋪路軌'))}</button>
    </div>
    <p class="transport-depots">${tramUiEscape(tramT('tram.ui.stats', '電車站 {stops} 個 · 電車 {trams} 架 · 路軌 {tiles} 格', { stops: state.stops.length, trams: state.trams.length, tiles: trackTiles }))}</p>
    <p class="transport-depots">${tramUiEscape(tramT('tram.ui.fareHint', '車費劃一 ${fare}（叮叮咁），短途乘客多；總站有迴圈就行迴圈，冇就喺站外轉軌掉頭。', { fare: TRAM_SERVICE.fare }))}</p>
    <div class="transport-routes">${cards}</div>`;
}

function pickTramTool(tool) {
  if (typeof selectTransportModeTool === 'function') selectTransportModeTool(tool);
  else document.querySelector(`[data-tool="${tool}"]`)?.click();
}

function locateTramStop(stop) {
  if (!stop || !activeScene?.cameras?.main || typeof getTileFaceGeometry !== 'function') return;
  const face = getTileFaceGeometry(stop.row, stop.col, activeScene.offsetX, activeScene.offsetY);
  activeScene.cameras.main.centerOn(face.center.x, face.center.y);
}

// The tram actions of the transport windows: true when it was one of them.
function handleTramUiAction(action, button) {
  if (!String(action || '').startsWith('tram-')) return false;
  const toast = (text, kind = 'info') => { if (typeof showToast === 'function') showToast(text, kind); };
  const state = getTramState();
  const lineId = button.dataset.lineId;
  const line = lineId && state.lines.find((l) => l.id === lineId);
  if (action === 'tram-new-line') {
    pickTramTool('tram-line');
    tramLineDraft = { forceNew: true };
    toast(tramT('tram.toast.newLineHow', '撳一個電車站，再一個個撳落去；再撳最後一個站完成。'));
    return true;
  }
  if (action === 'tram-new-stop') { pickTramTool('tram-stop'); return true; }
  if (action === 'tram-track') { pickTramTool('tram-track'); return true; }
  if (action === 'tram-toggle-stops') {
    tramUiState.expandedLineId = tramUiState.expandedLineId === lineId ? '' : lineId;
  } else if (action === 'tram-buy' && line) {
    const result = buyTram(line.id);
    if (result.ok) toast(tramT('tram.toast.bought', '買咗一架電車（${price}）。', { price: TRAM_SERVICE.tramPrice.toLocaleString() }), 'success');
    else toast(result.code === 'full'
      ? tramT('tram.toast.full', '每條綫最多 {n} 架電車。', { n: TRAM_SERVICE.maxTramsPerLine })
      : tramT('tram.toast.funds', '公司資金唔夠買電車（要 ${price}）。', { price: TRAM_SERVICE.tramPrice.toLocaleString() }), 'warning');
  } else if (action === 'tram-sell-one' && line) {
    const value = sellOneTram(line.id);
    toast(tramT('tram.toast.sold', '賣咗一架電車，收返 ${value}。', { value: Math.round(value).toLocaleString() }));
  } else if (action === 'tram-extend' && line) {
    pickTramTool('tram-line');
    tramLineDraft = { lineId: line.id };
    const last = getTramStopById(line.stopIds.at(-1), state);
    toast(tramT('tram.line.extend', '延長「{line}」：撳下一個站；再撳「{name}」完成。', { line: line.name, name: last?.name || '' }));
    return true;
  } else if (action === 'tram-rename' && line) {
    if (typeof showTextPromptDialog === 'function') {
      showTextPromptDialog(tramT('tram.ui.renamePrompt', '電車綫名稱'), line.name || '').then((input) => {
        if (input === null) return;
        line.name = String(input).trim().slice(0, 40) || line.name;
        if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
        refreshTramUi();
      }).catch((error) => console.warn('[tram line rename]', error));
    }
    return true;
  } else if (action === 'tram-toggle' && line) {
    setTramLineSuspended(line.id, line.status !== 'suspended');
  } else if (action === 'tram-delete' && line) {
    if (typeof window !== 'undefined' && !window.confirm(tramT('tram.confirmDelete', '取消「{name}」？佢嘅電車會即刻賣出，車站留低。', { name: line.name }))) return true;
    const value = removeTramLine(line.id);
    toast(tramT('tram.toast.lineClosed', '電車綫取消咗，賣電車收返 ${value}。', { value: Math.round(value).toLocaleString() }));
  } else if (action === 'tram-rename-stop') {
    const stop = getTramStopById(button.dataset.stopId, state);
    if (stop && typeof showTextPromptDialog === 'function') {
      showTextPromptDialog(tramT('tram.ui.renameStopPrompt', '電車站名稱'), stop.name || '').then((input) => {
        if (input === null) return;
        stop.name = String(input).trim().slice(0, 40) || stop.name;
        if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
        refreshTramUi();
      }).catch((error) => console.warn('[tram stop rename]', error));
    }
    return true;
  } else if (action === 'tram-locate-stop') {
    locateTramStop(getTramStopById(button.dataset.stopId, state));
    return true;
  }
  refreshTramUi();
  return true;
}

function refreshTramUi() {
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
}
