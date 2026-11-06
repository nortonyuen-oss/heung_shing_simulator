// 地鐵 in the transport company's windows (the rules are metro.js's): the metro lines in the routes
// tab - each with its stations, trains, takings and costs; a train bought or sold, the line
// suspended, resumed, carried on or closed.

const metroUiState = { expandedLineId: '' };

function metroUiEscape(value) {
  return typeof transportEscapeHtml === 'function' ? transportEscapeHtml(value)
    : String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function metroUiMoney(value, signed = false) {
  return typeof transportFormatMoney === 'function' ? transportFormatMoney(value, signed) : `$${Math.round(value)}`;
}

// A line at a glance: how often a train calls, its round trip, this month so far and last month.
function getMetroLineSummary(line, state = getMetroState()) {
  const trains = getMetroLineTrains(line, state);
  const schedule = getMetroLineSchedule(line, state);
  const cycle = schedule ? schedule.cycle : 0;
  return {
    trains,
    stations: getMetroLineStations(line, state),
    cycleMinutes: cycle,
    headwayMinutes: trains.length ? cycle / trains.length : 0,
    aboard: trains.reduce((sum, v) => sum + v.aboard, 0),
    passengers: line.monthToDatePassengers || 0,
    revenue: line.monthToDateRevenue || 0,
    last: (line.history || []).at(-1) || null,
  };
}

function renderMetroLineCard(line, state) {
  const s = getMetroLineSummary(line, state);
  const id = metroUiEscape(line.id);
  const expanded = metroUiState.expandedLineId === line.id;
  const suspended = line.status === 'suspended';
  const metric = (label, value) => `<div class="transport-metric"><span>${metroUiEscape(label)}</span><strong>${metroUiEscape(value)}</strong></div>`;
  const metrics = [
    metric(metroT('metro.ui.headway', '班次'), s.trains.length ? metroT('metro.ui.headwayValue', '每 {n} 分鐘', { n: Math.max(1, Math.round(s.headwayMinutes)) }) : '—'),
    metric(metroT('metro.ui.roundTrip', '來回'), `${Math.round(s.cycleMinutes)} min`),
    metric(metroT('metro.ui.passengers', '本月乘客'), Math.round(s.passengers).toLocaleString()),
    metric(metroT('metro.ui.revenue', '本月收入'), metroUiMoney(s.revenue)),
    metric(metroT('metro.ui.lastCost', '上月成本'), s.last ? metroUiMoney(s.last.cost) : '—'),
    metric(metroT('metro.ui.lastNet', '上月盈虧'), s.last ? metroUiMoney(s.last.net, true) : '—'),
    // a line through a 轉車站: how many came on from other lines last month
    ...(s.stations.some((st) => getMetroStationLines(st, state).length > 1)
      ? [metric(metroT('metro.ui.lastTransfers', '上月轉綫乘客'), s.last ? Math.round(s.last.transfers || 0).toLocaleString() : '—')] : []),
  ].join('');
  // each station: where it is, its queue for this line, the other lines calling (a 轉車站) in their
  // colours, last month's property income, and its name to change
  const stations = !expanded ? '' : `
    <div class="transport-route-fleet">
      ${s.stations.map((station, i) => {
        const others = getMetroStationLines(station, state).filter((l) => l.id !== line.id);
        const dots = others.map((l) => `<i class="transport-line-swatch" style="--route-color:${metroUiEscape(l.color)}" title="${metroUiEscape(l.name)}"></i>`).join('');
        const property = station.lastPropertyIncome > 0 ? ` · 🏠 ${metroUiEscape(metroUiMoney(station.lastPropertyIncome))}` : '';
        return `
        <div class="metro-station-row">
          <button class="transport-route-vehicle" type="button" data-transport-action="metro-locate-station" data-station-id="${metroUiEscape(station.id)}">
            <span>${i + 1}. Ⓜ ${metroUiEscape(station.name)} ${dots}</span>
            <span>👥 ${Math.round(station.waitingByLine?.[line.id] || 0).toLocaleString()}${property}</span>
          </button>
          <button class="transport-btn metro-station-rename" type="button" data-transport-action="metro-rename-station" data-station-id="${metroUiEscape(station.id)}" title="${metroUiEscape(metroT('metro.ui.renameStation', '車站改名'))}">✎</button>
        </div>`;
      }).join('')}
    </div>`;
  const statusKey = suspended ? 'suspended' : 'active';
  return `
    <article class="transport-route" style="--route-color:${metroUiEscape(line.color)}">
      <div class="transport-route-head">
        <div>
          <div class="transport-route-name">🚇 ${metroUiEscape(line.name)} · ${metroUiEscape(s.stations.map((st) => st.name).join(' – '))}</div>
          <button class="transport-route-fleet-toggle${expanded ? ' is-open' : ''}" type="button" data-transport-action="metro-toggle-stations" data-line-id="${id}">${s.stations.length} Ⓜ · ${s.trains.length} 🚇 ${expanded ? '▴' : '▾'}</button>
        </div>
        ${typeof renderTransportSparkline === 'function' ? renderTransportSparkline(line.history, line.color) : ''}
        <span class="transport-status" data-status="${statusKey}">${metroUiEscape(typeof t === 'function' ? t(`transport.status.${statusKey}`) : statusKey)}</span>
      </div>
      ${stations}
      ${typeof renderTransportIssue !== 'function' ? '' : suspended
        ? renderTransportIssue(metroT('metro.issue.suspended', '地鐵綫暫停中，列車唔會開出。'), `<button class="transport-btn" type="button" data-transport-action="metro-toggle" data-line-id="${id}">${metroUiEscape(t('transport.resume'))}</button>`)
        : s.trains.length === 0
          ? renderTransportIssue(metroT('metro.issue.noTrains', '未有列車行走：加一列車先有乘客。'), `<button class="transport-btn primary" type="button" data-transport-action="metro-buy" data-line-id="${id}">${metroUiEscape(metroT('metro.ui.addTrain', '＋加列車'))}</button>`)
          : ''}
      <div class="transport-metrics">${metrics}</div>
      <div class="transport-actions">
        <button class="transport-btn primary" type="button" data-transport-action="metro-buy" data-line-id="${id}">${metroUiEscape(metroT('metro.ui.buy', '加列車（${price}）', { price: METRO.trainPrice.toLocaleString() }))}</button>
        <button class="transport-btn" type="button" data-transport-action="metro-sell-one" data-line-id="${id}"${s.trains.length ? '' : ' disabled'}>${metroUiEscape(metroT('metro.ui.sellOne', '減列車'))}</button>
        <button class="transport-btn" type="button" data-transport-action="metro-extend" data-line-id="${id}">${metroUiEscape(metroT('metro.ui.extend', '延長'))}</button>
        <button class="transport-btn" type="button" data-transport-action="metro-rename" data-line-id="${id}">${metroUiEscape(metroT('metro.ui.rename', '改名'))}</button>
        ${line.surface ? `<button class="transport-btn" type="button" data-transport-action="metro-livery" data-line-id="${id}" title="${metroUiEscape(metroT('metro.ui.liveryHint', '撳一下轉車款'))}">${metroUiEscape(metroT(`metro.livery.${line.livery === 'k' ? 'k' : 'm'}`, line.livery === 'k' ? 'K-Train（黃頭）' : 'M-Train'))}</button>` : ''}
        <button class="transport-btn" type="button" data-transport-action="metro-toggle" data-line-id="${id}">${metroUiEscape(typeof t === 'function' ? t(suspended ? 'transport.resume' : 'transport.suspend') : (suspended ? 'Resume' : 'Suspend'))}</button>
        <button class="transport-btn danger" type="button" data-transport-action="metro-delete" data-line-id="${id}">${metroUiEscape(typeof t === 'function' ? t('transport.delete') : 'Delete')}</button>
      </div>
    </article>`;
}

// The routes tab's metro section.
function renderMetroLinesSection() {
  if (typeof getMetroState !== 'function') return '';
  if (!isMetroUnlocked()) {
    const population = Math.round(Number(typeof city !== 'undefined' ? city.population : 0) || 0);
    return `<div class="transport-empty">${metroUiEscape(metroT('metro.ui.locked', '城市人口要有 {need} 先可以起地鐵（而家 {now}）。', { need: METRO.unlockPopulation.toLocaleString(), now: population.toLocaleString() }))}</div>`;
  }
  const state = getMetroState();
  const cards = state.lines.length
    ? state.lines.map((line) => renderMetroLineCard(line, state)).join('')
    : `<div class="transport-empty">${metroUiEscape(metroT('metro.ui.empty', '未有地鐵綫：先喺路邊起兩個地鐵站，再用「地鐵綫」工具由一個站撳去另一個站。'))}</div>`;
  return `
    <div class="transport-actions">
      <button class="transport-btn primary" type="button" data-transport-action="metro-new-line">${metroUiEscape(metroT('metro.ui.newLine', '新增地鐵綫'))}</button>
      <button class="transport-btn" type="button" data-transport-action="metro-new-station">${metroUiEscape(metroT('metro.ui.newStation', '起地鐵站（${cost}）', { cost: METRO.stationCost.toLocaleString() }))}</button>
    </div>
    <p class="transport-depots">${metroUiEscape(metroT('metro.ui.stations', '地鐵站 {n} 個 · 列車 {trains} 列', { n: state.stations.length, trains: state.trains.length }))}</p>
    <p class="transport-depots">${metroUiEscape(state.lastPropertyIncome > 0
      ? metroT('metro.ui.property', '鐵路加物業：上月車站附近地價升值收入 ${amount}。', { amount: Math.round(state.lastPropertyIncome).toLocaleString() })
      : metroT('metro.ui.propertyHint', '鐵路加物業：有列車行走嘅站，附近住宅同商業地價升值，公司每月分一份（通車一年後到足）。'))}</p>
    <p class="transport-depots">${metroUiEscape(state.grantBalance > 0
      ? metroT('metro.ui.grant', '政府地鐵撥款餘額 ${amount}：起站、掘隧道同買列車會先用撥款。', { amount: Math.round(state.grantBalance).toLocaleString() })
      : metroT('metro.ui.grantHint', '公司資金唔夠？可以喺立法會提出「地下鐵路撥款」，由市庫注資起地鐵。'))}</p>
    <div class="transport-routes">${cards}</div>`;
}

function metroUiToast(text, kind = 'info') {
  if (typeof showToast === 'function') showToast(text, kind);
}

function locateMetroStation(station) {
  if (!station || !activeScene?.cameras?.main || typeof getTileFaceGeometry !== 'function') return;
  const face = getTileFaceGeometry(station.row, station.col, activeScene.offsetX, activeScene.offsetY);
  activeScene.cameras.main.centerOn(face.center.x, face.center.y);
}

function pickMetroTool(tool) {
  if (typeof selectTransportModeTool === 'function') selectTransportModeTool(tool);
  else document.querySelector(`[data-tool="${tool}"]`)?.click();
}

// The metro actions of the transport windows: true when it was one of them.
function handleMetroUiAction(action, button) {
  if (!String(action || '').startsWith('metro-')) return false;
  const state = getMetroState();
  const lineId = button.dataset.lineId;
  const line = lineId && state.lines.find((l) => l.id === lineId);
  if (action === 'metro-new-line') {
    pickMetroTool('metro-line');
    // the first click starts a new line, even on the end of another (a 轉車站 to start from)
    metroLineDraft = { forceNew: true };
    metroUiToast(metroT('metro.toast.newLineHow', '撳一個地鐵站，再一個個撳落去，就起到地鐵綫；再撳最後一個站完成。'), 'info');
    return true;
  }
  if (action === 'metro-new-station') {
    pickMetroTool('metro-station');
    return true;
  }
  if (action === 'metro-toggle-stations') {
    metroUiState.expandedLineId = metroUiState.expandedLineId === lineId ? '' : lineId;
  } else if (action === 'metro-buy' && line) {
    const result = buyMetroTrain(line.id);
    if (result.ok) metroUiToast(metroT('metro.toast.bought', '買咗一列列車（${price}）。', { price: METRO.trainPrice.toLocaleString() }), 'success');
    else metroUiToast(result.code === 'full'
      ? metroT('metro.toast.full', '每條綫最多 {n} 列車。', { n: METRO.maxTrainsPerLine })
      : metroT('metro.toast.funds', '公司資金唔夠買列車（要 ${price}）。', { price: METRO.trainPrice.toLocaleString() }), 'warning');
  } else if (action === 'metro-sell-one' && line) {
    if (typeof window !== 'undefined' && !window.confirm(metroT('metro.confirmSell', '賣出「{name}」一列列車？', { name: line.name }))) return true;
    const value = sellOneMetroTrain(line.id);
    metroUiToast(metroT('metro.toast.sold', '賣咗一列列車，收返 ${value}。', { value: Math.round(value).toLocaleString() }), 'info');
  } else if (action === 'metro-extend' && line) {
    pickMetroTool('metro-line');
    const ends = getMetroLineStations(line, state);
    const last = ends.at(-1);
    metroLineDraft = { lineId: line.id };
    metroUiToast(metroT('metro.line.extend', '延長「{line}」：撳下一個站；再撳「{name}」完成。', { line: line.name, name: last?.name || '' }), 'info');
    return true;
  } else if (action === 'metro-rename' && line) {
    if (typeof showTextPromptDialog === 'function') {
      showTextPromptDialog(metroT('metro.ui.renamePrompt', '地鐵綫名稱'), line.name || '').then((input) => {
        if (input === null) return;
        line.name = String(input).trim().slice(0, 40) || line.name;
        if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
        refreshMetroUi();
      }).catch((error) => console.warn('[metro line rename]', error));
    }
    return true;
  } else if (action === 'metro-livery' && line) {
    line.livery = line.livery === 'k' ? 'm' : 'k';
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  } else if (action === 'metro-toggle' && line) {
    setMetroLineSuspended(line.id, line.status !== 'suspended');
  } else if (action === 'metro-delete' && line) {
    if (typeof window !== 'undefined' && !window.confirm(metroT('metro.confirmDelete', '取消「{name}」？佢嘅列車會即刻賣出，車站留低。', { name: line.name }))) return true;
    const value = removeMetroLine(line.id);
    metroUiToast(metroT('metro.toast.lineClosed', '地鐵綫取消咗，賣列車收返 ${value}。', { value: Math.round(value).toLocaleString() }), 'info');
  } else if (action === 'metro-rename-station') {
    const station = getMetroStationById(button.dataset.stationId, state);
    if (station && typeof showTextPromptDialog === 'function') {
      showTextPromptDialog(metroT('metro.ui.renameStationPrompt', '地鐵站名稱'), station.name || '').then((input) => {
        if (input === null) return;
        station.name = String(input).trim().slice(0, 40) || station.name;
        if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
        refreshMetroUi();
      }).catch((error) => console.warn('[metro station rename]', error));
    }
    return true;
  } else if (action === 'metro-locate-station') {
    locateMetroStation(getMetroStationById(button.dataset.stationId, state));
    return true;
  }
  refreshMetroUi();
  return true;
}

function refreshMetroUi() {
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
}
