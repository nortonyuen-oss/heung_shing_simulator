// ── Live tracking windows for the ferries, trams and metro trains ──────────────────────────────
//
// The buses' tracker (vehicle-tracker.js) for the company's other vehicles (Norton, 2026-11-09:
// 輪船，電車，地鐵，請參考巴士咁，可以做一個實時監控既視窗): the same window - a second camera on
// the one scene, following the vehicle - with the same three tabs (passengers, condition, route) and
// buttons. Opened by clicking the vehicle in Transport Mode (or with the inspect tool), or from its
// line's card in the routes window. A metro train underground, or in a tunnel, is followed over the
// ground above it, the window saying so.

const TRANSIT_TRACKER_TYPES = Object.freeze(['ferry', 'tram', 'metro']);

function isTransitTrackerType(type) {
  return TRANSIT_TRACKER_TYPES.includes(type);
}

function transitTrackerT(key, fallback, vars = {}) {
  const fill = (text) => String(text).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (typeof t === 'function') {
    const out = t(key, vars);
    if (out && out !== key) return out;
  }
  return fill(fallback);
}

function transitTrackerMoney(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function transitSkyClock() {
  return typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
}

// A map point (col, row: fractional) on the screen, on the ground there.
function transitWorldPoint(scene, col, row) {
  if (!scene || !Number.isFinite(col) || !Number.isFinite(row)) return null;
  if (typeof metroSurfaceScreenAt === 'function') return metroSurfaceScreenAt(scene, col, row);
  const p = isoToScreen(col, row);
  return { x: p.x + scene.offsetX, y: p.y + scene.offsetY };
}

function transitTrackerBase(fields) {
  return {
    available: false,
    exists: true,
    sprite: null,
    leg: '—',
    passengers: '—',
    position: null,
    banner: '',
    actions: [],
    ...fields,
  };
}

// ── 渡輪 ────────────────────────────────────────────────────────────────────────────────────────

function resolveFerryTrackerTarget(scene, id) {
  if (typeof getFerryState !== 'function') return null;
  const state = getFerryState();
  const v = state.vessels.find((x) => String(x.id) === String(id));
  if (!v) return null;
  const route = state.routes.find((r) => r.id === v.routeId);
  const routeName = route && typeof getFerryRouteName === 'function' ? getFerryRouteName(route, state) : '—';
  const legs = route && typeof getFerryRouteLegs === 'function' ? getFerryRouteLegs(route) : null;
  const now = transitSkyClock();
  const point = !legs ? null
    : v.status === 'active' ? ferryVesselPointAt(legs, now, v.phase)
      : (v.status === 'laid_up' || v.status === 'broken_down') ? ferryVesselPointAt(legs, v.downStartedAt, v.phase) : null;
  const pierName = (i) => (typeof getFerryPierById === 'function' ? getFerryPierById(route?.pierIds?.[i], state)?.name : '') || '';
  const where = !point ? '—' : point.state === 'alongside'
    ? transitTrackerT('ferry.vessel.alongside', '泊喺「{pier}」', { pier: pierName(point.pier) })
    : transitTrackerT('ferry.vessel.sailing', '航行中');
  // its picture where it is drawn (drawn only from a zoom up); else the water it is on
  const rec = scene?.ferrySprites?.get(`ferry|${v.id}`);
  const drawn = rec?.sprite && rec.sprite.active !== false && rec.sprite.visible && Number.isFinite(rec.sprite.x);
  const world = drawn ? { x: rec.sprite.x, y: rec.sprite.y } : point ? transitWorldPoint(scene, point.c, point.r) : null;
  const status = typeof ferryVesselStatusText === 'function' ? ferryVesselStatusText(v) : v.status;
  const serviceEvery = typeof TRANSPORT_SERVICE_INTERVAL_MINUTES === 'number' ? TRANSPORT_SERVICE_INTERVAL_MINUTES : 4 * 1440;
  const nextService = Math.max(0, serviceEvery - (Number(v.minutesSinceService) || 0)) / 1440;
  const passengers = `${Math.round(v.aboard || 0)} / ${FERRY.capacity}`;
  const resale = typeof ferryResaleValue === 'function' ? ferryResaleValue(v) : 0;
  return transitTrackerBase({
    available: !!world && v.status !== 'servicing',
    x: world?.x,
    y: world?.y,
    sprite: drawn ? rec.sprite : null,
    title: `⛴ ${v.id}`,
    status,
    route: routeName,
    leg: where,
    passengers,
    position: point ? { row: point.r, col: point.c } : null,
    unavailableText: v.status === 'servicing'
      ? transitTrackerT('transit.tracker.inYard', '入咗船廠保養')
      : transitTrackerT('transport.tracker.unavailable', '睇唔到呢架車'),
    tabRows: {
      passengers: [
        [transitTrackerT('ferry.vessel.aboard', '船上乘客'), `👤 ${passengers}`],
        [transitTrackerT('ferry.vessel.route', '航線'), routeName],
        [transitTrackerT('ferry.vessel.where', '位置'), where],
      ],
      condition: [
        [transitTrackerT('ferry.vessel.status', '狀態'), status],
        [transitTrackerT('ferry.vessel.condition', '狀況'), `${Math.round((Number(v.condition) || 0) * 100)}%`],
        [transitTrackerT('ferry.vessel.nextService', '下次保養'), transitTrackerT('ferry.vessel.days', '{n} 日後', { n: nextService.toFixed(1) })],
        [transitTrackerT('ferry.vessel.age', '船齡'), transitTrackerT('ferry.vessel.months', '{n} 個月', { n: v.ageMonths || 0 })],
        [transitTrackerT('ferry.vessel.revenue', '本月收入'), transitTrackerMoney(v.monthToDateRevenue)],
        [transitTrackerT('ferry.vessel.lastRevenue', '上月收入'), transitTrackerMoney(v.lastMonthRevenue)],
      ],
      route: [
        [transitTrackerT('ferry.vessel.route', '航線'), routeName],
        [transitTrackerT('ferry.vessel.where', '位置'), where],
        [transitTrackerT('ferry.vessel.resale', '賣出可得'), transitTrackerMoney(resale)],
      ],
    },
    actions: [
      route && { id: 'route', label: transitTrackerT('transport.inspector.route', '路線') },
      world && { id: 'main', label: transitTrackerT('transport.tracker.locateMain', '主畫面') },
      !v.sellAtNextPier && { id: 'sell', label: transitTrackerT('ferry.vessel.sell', '賣船'), danger: true },
    ].filter(Boolean),
    entity: v,
  });
}

// ── 電車 ────────────────────────────────────────────────────────────────────────────────────────

function resolveTramTrackerTarget(scene, id) {
  if (typeof getTramState !== 'function') return null;
  const state = getTramState();
  const v = state.trams.find((x) => String(x.id) === String(id));
  if (!v) return null;
  const line = state.lines.find((l) => l.id === v.lineId);
  const plan = line && typeof getTramLineRoute === 'function' ? getTramLineRoute(line, state) : null;
  const stops = line ? getTramLineStops(line, state) : [];
  const running = typeof isTramRunning === 'function' ? isTramRunning(transitSkyClock()) : true;
  const at = plan ? tramRoutePointAt(plan.route, Number(v.dist) || 0) : null;
  const sprite = scene?.tramSprites?.get(v.id);
  const drawn = sprite && sprite.active !== false && sprite.visible && Number.isFinite(sprite.x);
  const world = drawn ? { x: sprite.x, y: sprite.y } : at ? transitWorldPoint(scene, at.pos[0], at.pos[1]) : null;
  // its last call and its next (the calls round the trip, by the stops in the line's order)
  const calls = plan?.route?.calls || [];
  const nextCall = calls.length ? calls[(Number(v.callIndex) || 0) % calls.length] : null;
  const lastCall = calls.length ? calls[((Number(v.callIndex) || 0) - 1 + calls.length) % calls.length] : null;
  const stopName = (call) => stops[call?.stop]?.name || '—';
  const dwelling = Number(v.dwellLeft) > 0;
  const status = line?.status === 'suspended' ? transitTrackerT('transit.status.suspended', '暫停服務')
    : !running ? transitTrackerT('transit.status.tramNight', '收咗車（06:00 開出）')
      : !plan ? transitTrackerT('transit.status.noWay', '路軌斷咗，行唔到')
        : dwelling ? transitTrackerT('transit.status.atStop', '停站上落客：{stop}', { stop: stopName(lastCall) })
          : transitTrackerT('transit.status.running', '行駛中');
  const leg = nextCall ? `${stopName(lastCall)} → ${stopName(nextCall)}` : '—';
  const passengers = `${Math.round(v.aboard || 0)} / ${TRAM_SERVICE.tramCapacity}`;
  const liveries = { green: '綠色', hss: '廣告車', lan: '廣告車', nightday: '廣告車' };
  return transitTrackerBase({
    available: !!world && running && line?.status !== 'suspended',
    x: world?.x,
    y: world?.y,
    sprite: drawn ? sprite : null,
    title: `🚋 ${line?.name || ''} · ${v.id}`,
    status,
    route: line?.name || '—',
    leg,
    passengers,
    position: at ? { row: at.pos[1], col: at.pos[0] } : null,
    unavailableText: status,
    tabRows: {
      passengers: [
        [transitTrackerT('transport.inspector.passengers', '乘客'), `👤 ${passengers}`],
        [transitTrackerT('transit.tracker.nextStop', '下一站'), stopName(nextCall)],
        [transitTrackerT('transit.tracker.fare', '車費'), transitTrackerMoney(TRAM_SERVICE.fare)],
      ],
      condition: [
        [transitTrackerT('transport.inspector.status', '狀態'), status],
        [transitTrackerT('transit.tracker.livery', '車身'), transitTrackerT(`tram.livery.${v.livery}`, liveries[v.livery] || v.livery || '—')],
        [transitTrackerT('transport.inspector.age', '車齡（月）'), String(Math.floor(Number(v.ageMonths) || 0))],
        [transitTrackerT('transit.tracker.tilesThisMonth', '本月行駛（格）'), String(Math.round(Number(v.tilesThisMonth) || 0))],
        [transitTrackerT('transit.tracker.revenue', '本月收入'), transitTrackerMoney(v.monthToDateRevenue)],
        [transitTrackerT('transit.tracker.lastRevenue', '上月收入'), transitTrackerMoney(v.lastMonthRevenue)],
      ],
      route: [
        [transitTrackerT('transit.tracker.tramLine', '電車綫'), line?.name || '—'],
        [transitTrackerT('transport.inspector.currentLeg', '現時路段'), leg],
        [transitTrackerT('transit.tracker.stops', '車站'), String(stops.length)],
      ],
    },
    actions: [
      line && { id: 'route', label: transitTrackerT('transport.inspector.route', '路線') },
      world && { id: 'main', label: transitTrackerT('transport.tracker.locateMain', '主畫面') },
      { id: 'sell', label: transitTrackerT('transit.tracker.sellTram', '賣電車'), danger: true },
    ].filter(Boolean),
    entity: v,
  });
}

// ── 地鐵 ────────────────────────────────────────────────────────────────────────────────────────

function resolveMetroTrackerTarget(scene, id) {
  if (typeof getMetroState !== 'function') return null;
  const state = getMetroState();
  const v = state.trains.find((x) => String(x.id) === String(id));
  if (!v) return null;
  const line = state.lines.find((l) => l.id === v.lineId);
  const stations = line ? getMetroLineStations(line, state) : [];
  const schedule = line ? getMetroLineSchedule(line, state) : null;
  const sky = transitSkyClock();
  const running = typeof isMetroRunning === 'function' ? isMetroRunning(sky) : true;
  const p = schedule ? metroTrainPointAt(schedule, sky, v.phase) : null;
  // a surface line's train is drawn car by car: its middle car; an underground line's is not drawn -
  // over the ground above it, between its stations
  const cars = scene?.metroTrainSprites?.get(v.id);
  const middle = cars?.length ? cars[Math.floor(cars.length / 2)] : null;
  const hasCar = middle && middle.active !== false && Number.isFinite(middle.x);
  const world = hasCar ? { x: middle.x, y: middle.y } : p ? transitWorldPoint(scene, p.c + 0.5, p.r + 0.5) : null;
  const underView = typeof isMetroUndergroundView === 'function' && isMetroUndergroundView();
  const banner = !line ? '' : !line.surface
    ? transitTrackerT('transit.tracker.underground', '🚇 地底行駛中（畫面係上面嘅街道）')
    : hasCar && !middle.visible && !underView ? transitTrackerT('transit.tracker.tunnel', '🚇 隧道中') : '';
  const name = (i) => stations[i]?.name || '—';
  const status = line?.status === 'suspended' ? transitTrackerT('transit.status.suspended', '暫停服務')
    : !running ? transitTrackerT('transit.status.metroNight', '收咗車（06:00 開出）')
      : !p ? transitTrackerT('transit.status.noWay', '路軌斷咗，行唔到')
        : p.state === 'atStation' ? transitTrackerT('transit.status.atStation', '停站：{station}', { station: name(p.station) })
          : transitTrackerT('transit.status.running', '行駛中');
  const leg = p?.leg ? `${name(p.leg.fromIndex)} → ${name(p.leg.toIndex)}` : '—';
  const passengers = `${Math.round(v.aboard || 0)} / ${METRO.trainCapacity}`;
  const resale = typeof metroTrainResaleValue === 'function' ? metroTrainResaleValue(v) : 0;
  return transitTrackerBase({
    available: !!world && running && line?.status !== 'suspended',
    x: world?.x,
    y: world?.y,
    sprite: hasCar && middle.visible ? middle : null,
    title: `🚇 ${line?.name || ''} · ${v.id}`,
    status,
    route: line?.name || '—',
    leg,
    passengers,
    position: p ? { row: p.r, col: p.c } : null,
    banner,
    unavailableText: status,
    tabRows: {
      passengers: [
        [transitTrackerT('transport.inspector.passengers', '乘客'), `👤 ${passengers}`],
        [transitTrackerT('transport.inspector.currentLeg', '現時路段'), leg],
        [transitTrackerT('transit.tracker.cars', '車卡'), String(typeof METRO_SURFACE !== 'undefined' ? METRO_SURFACE.cars : '—')],
      ],
      condition: [
        [transitTrackerT('transport.inspector.status', '狀態'), status],
        [transitTrackerT('transport.inspector.age', '車齡（月）'), String(Math.floor(Number(v.ageMonths) || 0))],
        [transitTrackerT('transit.tracker.revenue', '本月收入'), transitTrackerMoney(v.monthToDateRevenue)],
        [transitTrackerT('transit.tracker.lastRevenue', '上月收入'), transitTrackerMoney(v.lastMonthRevenue)],
        [transitTrackerT('transit.tracker.resale', '賣出可得'), transitTrackerMoney(resale)],
      ],
      route: [
        [transitTrackerT('transit.tracker.metroLine', '地鐵綫'), line?.name || '—'],
        [transitTrackerT('transport.inspector.currentLeg', '現時路段'), leg],
        [transitTrackerT('transit.tracker.level', '行駛位置'), line?.surface ? transitTrackerT('transit.tracker.surface', '地面／高架') : transitTrackerT('transit.tracker.below', '地底')],
      ],
    },
    actions: [
      line && { id: 'route', label: transitTrackerT('transport.inspector.route', '路線') },
      world && { id: 'main', label: transitTrackerT('transport.tracker.locateMain', '主畫面') },
      { id: 'sell', label: transitTrackerT('transit.tracker.sellTrain', '賣列車'), danger: true },
    ].filter(Boolean),
    entity: v,
  });
}

function resolveTransitTrackerTarget(scene, type, id) {
  if (type === 'ferry') return resolveFerryTrackerTarget(scene, id);
  if (type === 'tram') return resolveTramTrackerTarget(scene, id);
  if (type === 'metro') return resolveMetroTrackerTarget(scene, id);
  return null;
}

// A tracker window's buttons for these (vehicle-tracker.js handleVehicleTrackerAction).
function handleTransitTrackerAction(tracker, action, info) {
  const v = info?.entity;
  if (!v) return;
  const toast = (text, kind = 'info') => { if (typeof showToast === 'function') showToast(text, kind); };
  if (action === 'route') {
    if (typeof openTransportPanel === 'function') openTransportPanel('routes', tracker.type);
    return;
  }
  if (action !== 'sell') return;
  if (tracker.type === 'ferry') {
    if (!window.confirm(transitTrackerT('ferry.confirmSell', '賣出一艘小輪（{id}）？', { id: v.id }))) return;
    const result = sellFerry(v.id);
    if (typeof ferrySellToast === 'function') ferrySellToast(result);
    if (result.ok && result.sold) closeVehicleTrackingWindow(tracker.key);
    if (typeof refreshFerryUi === 'function') refreshFerryUi();
    return;
  }
  if (tracker.type === 'tram') {
    if (!window.confirm(transitTrackerT('transit.confirmSellTram', '賣出呢架電車（{id}）？', { id: v.id }))) return;
    const value = sellTramNow(getTramState(), v);
    toast(transitTrackerT('tram.toast.sold', '賣咗一架電車，收返 ${value}。', { value: Math.round(value).toLocaleString() }));
    closeVehicleTrackingWindow(tracker.key);
    if (typeof refreshTramUi === 'function') refreshTramUi();
    return;
  }
  if (tracker.type === 'metro') {
    if (!window.confirm(transitTrackerT('transit.confirmSellTrain', '賣出呢列車（{id}）？', { id: v.id }))) return;
    const value = sellMetroTrainNow(getMetroState(), v);
    toast(transitTrackerT('transit.toast.trainSold', '賣咗一列車，收返 ${value}。', { value: Math.round(value).toLocaleString() }));
    closeVehicleTrackingWindow(tracker.key);
    if (typeof refreshMetroUi === 'function') refreshMetroUi();
  }
}

// The sprites these vehicles are drawn with, for the trackers' cameras (each frame): every piece a
// tram or a car is drawn in, their lamps and lit windows, and the ferries.
function forEachTransitTrackerObject(scene, visit) {
  scene?.tramSprites?.forEach((sprite) => {
    visit(sprite);
    (sprite.__tramPieces || []).forEach(visit);
    (sprite.__tramLamps || []).forEach(visit);
  });
  scene?.metroTrainSprites?.forEach((cars) => cars.forEach((car) => {
    visit(car);
    if (car.__lit) visit(car.__lit);
    (car.__lamps || []).forEach(visit);
    (car.__pieces || []).forEach((piece) => { visit(piece); if (piece.__lit) visit(piece.__lit); });
  }));
  scene?.ferrySprites?.forEach((rec) => {
    if (!rec?.ferryVesselId) return;
    if (rec.sprite) visit(rec.sprite);
    const wake = scene.vesselWakes?.get(rec)?.sprite;
    if (wake) visit(wake);
  });
}

// Which of these is under a click (world point): the nearest drawn one whose picture holds it.
function findTransitVehicleAt(scene, x, y) {
  if (!scene || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  let best = null;
  const consider = (type, id, sprite) => {
    if (!sprite?.visible || sprite.active === false || !sprite.getBounds) return;
    const b = sprite.getBounds();
    if (!b.contains(x, y)) return;
    const d = Math.hypot(b.centerX - x, b.centerY - y);
    if (!best || d < best.d) best = { type, id, d };
  };
  scene.tramSprites?.forEach((sprite, id) => {
    // (its first slice is cropped: the whole picture's bounds)
    const w = sprite.frame?.realWidth * sprite.scaleX, h = sprite.frame?.realHeight * sprite.scaleY;
    const left = sprite.x - sprite.displayOriginX * sprite.scaleX, top = sprite.y - sprite.displayOriginY * sprite.scaleY;
    if (sprite.visible && x >= left && x <= left + w && y >= top && y <= top + h) {
      const d = Math.hypot(left + w / 2 - x, top + h / 2 - y);
      if (!best || d < best.d) best = { type: 'tram', id, d };
    }
  });
  scene.metroTrainSprites?.forEach((cars, id) => cars.forEach((car) => {
    const w = car.frame?.realWidth * car.scaleX, h = car.frame?.realHeight * car.scaleY;
    const left = car.x - car.displayOriginX * car.scaleX, top = car.y - car.displayOriginY * car.scaleY;
    const shown = car.visible || (car.__pieces || []).some((p) => p.visible);
    if (shown && x >= left && x <= left + w && y >= top && y <= top + h) {
      const d = Math.hypot(left + w / 2 - x, top + h / 2 - y);
      if (!best || d < best.d) best = { type: 'metro', id, d };
    }
  }));
  scene.ferrySprites?.forEach((rec) => { if (rec?.ferryVesselId) consider('ferry', rec.ferryVesselId, rec.sprite); });
  return best;
}

// A Transport Mode (or inspect tool) click on the map: a ferry, a tram or a metro train under the
// pointer opens its tracking window. True when it did.
function handleTransitVehicleMapInspect(pointer) {
  const scene = typeof activeScene !== 'undefined' ? activeScene : null;
  if (!scene || typeof openVehicleTrackingWindow !== 'function') return false;
  const hit = findTransitVehicleAt(scene, pointer?.worldX, pointer?.worldY);
  if (!hit) return false;
  openVehicleTrackingWindow(hit.type, hit.id, pointer);
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isTransitTrackerType, TRANSIT_TRACKER_TYPES };
}
