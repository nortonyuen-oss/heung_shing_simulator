// ── Shared multi-vehicle tracking viewports ──────────────────────────────────────
//
// A tracker is another Phaser Camera in the existing Scene. It renders the
// existing Display List into a viewport under transparent DOM chrome: there
// is no second world, second vehicle simulation, screenshot, iframe, canvas,
// rAF, or asset cache. beginVehicleTrackerFrame() is called by the one Phaser
// update loop and schedules their heavier status/culling maintenance. Tracker
// cameras stay composited on every display frame: the main camera repaints the
// shared canvas, so hiding a tracker between scheduled updates would expose the
// main view beneath its transparent DOM viewport and visibly flash.

const VEHICLE_TRACKER_CONFIG = Object.freeze({
  viewportWidth: 320,
  viewportHeight: 180,
  zoom: 1.6,
  budgetMs: 4,
  statusRefreshMs: 250,
  focusedRenderEstimateMs: 0.75,
});

// §5 restore: the info card sits collapsed by default; these left-rail icons
// toggle which slice of it shows, instead of dumping every field at once.
const VEHICLE_TRACKER_TABS = Object.freeze([
  { id: 'passengers', icon: '👤', labelKey: 'transport.tracker.tabPassengers', labelFallback: 'Passengers' },
  { id: 'condition', icon: '🔧', labelKey: 'transport.tracker.tabCondition', labelFallback: 'Condition' },
  { id: 'route', icon: '🛣', labelKey: 'transport.tracker.tabRoute', labelFallback: 'Route' },
]);

const vehicleTrackerManager = {
  scene: null,
  trackers: new Map(),
  nextWindowId: 1,
  focusSerial: 0,
  focusedKey: '',
  roundRobinCursor: 0,
  lastFrameTime: 0,
  spatialScene: null,
  spatialBuckets: new Map(),
  spatialObjectKeys: new Map(),
  fixedObjects: new Set(),
  spatialDirty: true,
  debug: {
    renderCount: 0,
    renderMs: 0,
    cullMs: 0,
    deferredFrames: 0,
    recentRenderTimes: [],
    startedAt: 0,
  },
};

function vehicleTrackerText(key, params, fallback) {
  if (typeof t === 'function') {
    const translated = t(key, params || {});
    if (translated !== key) return translated;
  }
  return fallback;
}

function getVehicleTrackerTargetKey(type, id) {
  return `${String(type || 'vehicle')}:${String(id ?? '')}`;
}

function getVehicleTrackerTargetFps(visibleCount) {
  const count = Math.max(0, Math.floor(Number(visibleCount) || 0));
  if (count <= 4) return 15;
  return Math.max(5, Math.min(12, Math.floor(60 / count)));
}

function getVehicleTrackerRenderInterval(visibleCount) {
  return 1000 / getVehicleTrackerTargetFps(visibleCount);
}

function getVehicleTrackerRenderEstimate(tracker) {
  const render = tracker?.averageRenderMs > 0
    ? tracker.averageRenderMs
    : VEHICLE_TRACKER_CONFIG.focusedRenderEstimateMs;
  const cull = tracker?.averageCullMs > 0 ? tracker.averageCullMs : 0.25;
  return render + cull;
}

function ensureVehicleTrackerStyle() {
  if (typeof document === 'undefined' || document.getElementById('vehicle-tracker-style')) return;
  const style = document.createElement('style');
  style.id = 'vehicle-tracker-style';
  style.textContent = `
    .vehicle-tracker-window {
      position:fixed; z-index:380; width:354px; color:#20252a; border:2px solid #313b43;
      border-radius:5px; box-shadow:0 10px 26px rgba(0,0,0,.46); font:12px/1.35 Arial,sans-serif;
      overflow:hidden; background:transparent; user-select:none;
    }
    .vehicle-tracker-window.is-focused { border-color:#173f57; box-shadow:0 12px 30px rgba(0,0,0,.55); }
    .vehicle-tracker-head { display:flex; align-items:center; gap:7px; min-height:31px; padding:5px 6px 5px 8px; background:#263a48; color:#fff; cursor:move; }
    .vehicle-tracker-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:800; }
    .vehicle-tracker-head button { width:24px; height:22px; border:1px solid rgba(255,255,255,.32); border-radius:3px; padding:0; background:rgba(255,255,255,.08); color:#fff; cursor:pointer; font:bold 14px/18px Arial,sans-serif; }
    .vehicle-tracker-head button:hover { background:rgba(255,255,255,.22); }
    .vehicle-tracker-body { display:flex; align-items:stretch; }
    .vehicle-tracker-tabs { display:flex; flex-direction:column; flex:0 0 30px; width:30px; background:#1b242b; border-right:1px solid #313b43; }
    .vehicle-tracker-tabs button { width:30px; height:30px; border:0; border-bottom:1px solid rgba(255,255,255,.1); background:transparent; color:#cfd8dc; cursor:pointer; font-size:14px; line-height:1; padding:0; display:flex; align-items:center; justify-content:center; }
    .vehicle-tracker-tabs button:hover { background:rgba(255,255,255,.1); }
    .vehicle-tracker-tabs button.is-active { background:#2f5a76; color:#fff; }
    .vehicle-tracker-viewport { position:relative; width:320px; height:180px; background:#161d21; pointer-events:none; overflow:hidden; flex:0 0 320px; }
    .vehicle-tracker-surface { position:absolute; inset:0; z-index:0; display:block; width:320px; height:180px; background:#161d21; }
    .vehicle-tracker-unavailable { position:absolute; inset:0; z-index:1; display:grid; place-items:center; padding:20px; text-align:center; color:#fff; background:rgba(31,42,49,.86); font-weight:800; }
    .vehicle-tracker-unavailable[hidden] { display:none !important; }
    .vehicle-tracker-panel { display:grid; gap:4px; padding:7px 8px; background:#ece7d8; border-top:1px solid #777064; }
    .vehicle-tracker-panel[hidden] { display:none !important; }
    .vehicle-tracker-status-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:9px; align-items:center; }
    .vehicle-tracker-status-row span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#6a665c; }
    .vehicle-tracker-status-row strong { max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; }
    .vehicle-tracker-actions { display:flex; justify-content:flex-end; gap:4px; flex-wrap:wrap; padding:5px 8px; border-top:1px solid #c8c0ad; background:#ece7d8; }
    .vehicle-tracker-actions:empty { display:none; }
    .vehicle-tracker-actions button { border:1px solid #52636f; border-radius:4px; padding:3px 7px; background:#f7f3e8; color:#26323a; cursor:pointer; font:inherit; }
    .vehicle-tracker-actions button.danger { color:#8b1f1f; border-color:#a75a5a; }
    .vehicle-tracker-window.is-minimized { width:250px; }
    .vehicle-tracker-window.is-minimized .vehicle-tracker-body,
    .vehicle-tracker-window.is-minimized .vehicle-tracker-panel,
    .vehicle-tracker-window.is-minimized .vehicle-tracker-actions { display:none; }
  `;
  document.head.appendChild(style);
}

function getVehicleTrackerTransportLeg(vehicle, route) {
  if (!route || typeof getTransportRouteCycleStops !== 'function') return '—';
  const cycleStops = getTransportRouteCycleStops(route);
  if (!cycleStops.length) return '—';
  const currentOrder = ((vehicle.orderIndex % cycleStops.length) + cycleStops.length) % cycleStops.length;
  const fromStop = cycleStops[currentOrder];
  const toStop = cycleStops[(currentOrder + 1) % cycleStops.length];
  if (!fromStop || !toStop || typeof getTransportStopDisplayName !== 'function') return '—';
  const state = getTransportExpansionState();
  return `${getTransportStopDisplayName(fromStop, state.stops.indexOf(fromStop))} → ${getTransportStopDisplayName(toStop, state.stops.indexOf(toStop))}`;
}

function getTransportTrackerWorldPoint(scene, vehicle, route) {
  const visual = scene?.transportVisualState?.vehicles?.find((entry) => entry.vehicleId === vehicle.id);
  if (visual?.sprite?.active !== false && Number.isFinite(visual?.sprite?.x) && Number.isFinite(visual?.sprite?.y)) {
    return { x: visual.sprite.x, y: visual.sprite.y, sprite: visual.sprite };
  }
  if (route && typeof getTransportVehiclePathPosition === 'function') {
    const position = getTransportVehiclePathPosition(vehicle, route);
    const path = position?.path;
    if (Array.isArray(path) && path.length > 1 && typeof createTrafficLeg === 'function' && typeof evaluateTrafficLeg === 'function') {
      const index = position.currentIndex;
      const previous = path[(index - 1 + path.length) % path.length];
      const current = path[index];
      const next = path[(index + 1) % path.length];
      const evaluated = evaluateTrafficLeg(createTrafficLeg(scene, previous, current, next), position.progress);
      if (Number.isFinite(evaluated?.x) && Number.isFinite(evaluated?.y)) return evaluated;
    }
  }
  const tile = typeof getTransportVehicleApproximateTile === 'function'
    ? getTransportVehicleApproximateTile(vehicle.id)
    : null;
  if (tile && typeof getTrafficSurfacePoint === 'function') {
    return getTrafficSurfacePoint(scene, tile.row, tile.col);
  }
  return null;
}

function resolveTransportTrackerTarget(scene, id) {
  if (typeof getTransportExpansionState !== 'function') return null;
  const state = getTransportExpansionState();
  const vehicle = state.vehicles.find((entry) => String(entry.id) === String(id));
  if (!vehicle) return null;
  const route = state.routes.find((entry) => entry.id === vehicle.routeId);
  const vehicleClass = typeof getTransportVehicleClass === 'function'
    ? getTransportVehicleClass(vehicle.classId)
    : null;
  const severeWeather = typeof isTransportSevereWeather === 'function' && isTransportSevereWeather();
  const world = severeWeather ? null : getTransportTrackerWorldPoint(scene, vehicle, route);
  return {
    available: !!world,
    exists: true,
    x: world?.x,
    y: world?.y,
    sprite: world?.sprite || null,
    title: vehicleTrackerText('transport.tracker.title', { id: vehicle.id }, `Vehicle ${vehicle.id}`),
    status: vehicleTrackerText(`transport.vehicleStatus.${vehicle.status}`, {}, vehicle.status),
    route: route?.name || vehicleTrackerText('transport.depot.unassigned', {}, 'Unassigned'),
    leg: getVehicleTrackerTransportLeg(vehicle, route),
    passengers: `${Math.max(0, Number(vehicle.passengersAboard) || 0)} / ${Math.max(0, Number(vehicleClass?.capacity) || 0)}`,
    position: world && typeof getTransportVehicleApproximateTile === 'function'
      ? getTransportVehicleApproximateTile(vehicle.id)
      : null,
    vehicle,
    vehicleClass,
    routeEntity: route || null,
    unavailableText: severeWeather
      ? vehicleTrackerText('transport.tracker.weatherUnavailable', {}, 'Service suspended by severe weather')
      : vehicleTrackerText('transport.tracker.unavailable', {}, 'Vehicle unavailable'),
  };
}

function findVehicleTrackerVisualEvent(scene, type, id) {
  const targetId = String(id);
  if (type === 'traffic') {
    const vehicles = scene?.trafficVisualState?.iceCreamEvent
      ? [...(scene.trafficVisualState.vehicles || []), scene.trafficVisualState.iceCreamEvent]
      : (scene?.trafficVisualState?.vehicles || []);
    return vehicles.find((entry) => String(entry?.id) === targetId) || null;
  }
  if (type === 'vessel') {
    for (const portState of scene?.vesselVisualState?.portStates?.values?.() || []) {
      if (String(portState?.event?.id) === targetId) return portState.event;
    }
    return null;
  }
  if (type === 'aircraft') {
    for (const airportState of scene?.aircraftVisualState?.airportStates?.values?.() || []) {
      const event = airportState?.events?.find((entry) => String(entry?.id) === targetId);
      if (event) return event;
    }
  }
  return null;
}

function resolveVisualTrackerTarget(scene, type, id) {
  const event = findVehicleTrackerVisualEvent(scene, type, id);
  if (!event) return null;
  const sprite = event.sprite;
  const x = Number.isFinite(sprite?.x) ? sprite.x : event.lastWorld?.x;
  const y = Number.isFinite(sprite?.y) ? sprite.y : event.lastWorld?.y;
  const labels = {
    traffic: vehicleTrackerText('transport.tracker.roadVehicle', {}, 'Road vehicle'),
    vessel: vehicleTrackerText('transport.tracker.vessel', {}, 'Vessel'),
    aircraft: vehicleTrackerText('transport.tracker.aircraft', {}, 'Aircraft'),
  };
  return {
    available: Number.isFinite(x) && Number.isFinite(y),
    exists: true,
    x,
    y,
    sprite: sprite || null,
    title: `${labels[type] || 'Vehicle'} ${id}`,
    status: String(event.phase || (event.busDwellRemainingMs > 0 ? 'stopped' : 'moving')),
    route: String(event.model?.label || event.model?.id || event.livery || event.cargoState || '—'),
    leg: '—',
    passengers: '—',
    position: event.lastLogical || event.current || null,
    unavailableText: vehicleTrackerText('transport.tracker.unavailable', {}, 'Vehicle unavailable'),
  };
}

function resolveVehicleTrackerTarget(scene, type, id) {
  if (type === 'transport') return resolveTransportTrackerTarget(scene, id);
  if (['traffic', 'vessel', 'aircraft'].includes(type)) return resolveVisualTrackerTarget(scene, type, id);
  return null;
}

function getVehicleTrackerCanvasRect(scene, viewportElement) {
  const canvas = scene?.game?.canvas;
  if (!canvas || !viewportElement?.getBoundingClientRect) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const viewportRect = viewportElement.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0 || viewportRect.width <= 0 || viewportRect.height <= 0) return null;
  const scaleX = (Number(scene.scale?.width) || canvasRect.width) / canvasRect.width;
  const scaleY = (Number(scene.scale?.height) || canvasRect.height) / canvasRect.height;
  return {
    x: Math.round((viewportRect.left - canvasRect.left) * scaleX),
    y: Math.round((viewportRect.top - canvasRect.top) * scaleY),
    width: Math.max(1, Math.round(viewportRect.width * scaleX)),
    height: Math.max(1, Math.round(viewportRect.height * scaleY)),
  };
}

function setVehicleTrackerCameraVisible(tracker, visible) {
  if (tracker?.camera) tracker.camera.visible = !!visible;
}

function presentVehicleTrackerSurface(scene, tracker) {
  const camera = tracker?.camera;
  const surface = tracker?.surfaceElement;
  const sourceCanvas = scene?.game?.canvas;
  if (!camera?.visible || tracker.minimized || !surface || !sourceCanvas) return;
  let context = tracker.surfaceContext || surface.getContext?.('2d', { alpha: false });
  if (!context) return;
  tracker.surfaceContext = context;

  const renderScale = Math.min(
    Math.max(1, Number(typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1),
    1.5,
  );
  const targetWidth = Math.max(1, Math.round(VEHICLE_TRACKER_CONFIG.viewportWidth * renderScale));
  const targetHeight = Math.max(1, Math.round(VEHICLE_TRACKER_CONFIG.viewportHeight * renderScale));
  if (surface.width !== targetWidth || surface.height !== targetHeight) {
    surface.width = targetWidth;
    surface.height = targetHeight;
    context = surface.getContext?.('2d', { alpha: false }) || context;
    tracker.surfaceContext = context;
  }

  // Copy this independently rendered tracker Camera rectangle, never the main
  // Camera view. The foreground surface keeps live pixels above DOM menus when
  // a draggable tracker overlaps them without creating another game renderer.
  scene.game.renderer?.gl?.flush?.();
  const gameWidth = Math.max(1, Number(scene.scale?.width) || sourceCanvas.width);
  const gameHeight = Math.max(1, Number(scene.scale?.height) || sourceCanvas.height);
  const sourceScaleX = sourceCanvas.width / gameWidth;
  const sourceScaleY = sourceCanvas.height / gameHeight;
  const sourceX = Math.max(0, Math.round(camera.x * sourceScaleX));
  const sourceY = Math.max(0, Math.round(camera.y * sourceScaleY));
  const sourceWidth = Math.max(1, Math.min(sourceCanvas.width - sourceX, Math.round(camera.width * sourceScaleX)));
  const sourceHeight = Math.max(1, Math.min(sourceCanvas.height - sourceY, Math.round(camera.height * sourceScaleY)));
  context.imageSmoothingEnabled = true;
  context.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    surface.width,
    surface.height,
  );
}

function recordVehicleTrackerRenderStart(tracker) {
  tracker.renderStartedAt = performance.now();
}

function recordVehicleTrackerRenderEnd(tracker) {
  const duration = Math.max(0, performance.now() - (tracker.renderStartedAt || performance.now()));
  tracker.lastRenderMs = duration;
  tracker.averageRenderMs = tracker.renderCount > 0
    ? tracker.averageRenderMs * 0.8 + duration * 0.2
    : duration;
  tracker.renderCount++;
  tracker.lastRenderedAt = performance.now();
  vehicleTrackerManager.debug.renderCount++;
  vehicleTrackerManager.debug.renderMs += duration;
  vehicleTrackerManager.debug.recentRenderTimes.push(duration);
  if (vehicleTrackerManager.debug.recentRenderTimes.length > 120) {
    vehicleTrackerManager.debug.recentRenderTimes.shift();
  }
}

function ensureVehicleTrackerCamera(scene, tracker) {
  if (tracker.camera && tracker.camera.scene === scene) return tracker.camera;
  if (!scene?.cameras?.add) return null;
  const rect = getVehicleTrackerCanvasRect(scene, tracker.viewportElement);
  if (!rect) return null;
  const camera = scene.cameras.add(rect.x, rect.y, rect.width, rect.height, false, `vehicle-tracker-${tracker.windowId}`);
  if (!camera) return null;
  camera.setZoom?.(VEHICLE_TRACKER_CONFIG.zoom);
  camera.setBackgroundColor?.('#87ceeb');
  camera.roundPixels = false;
  camera.visible = false;
  // CameraFilter is inclusion-by-bit. Seed this new bit once, then the
  // spatial query below only clears it for nearby objects on later moves.
  for (const object of scene?.children?.list || []) object.cameraFilter |= camera.id;
  const events = typeof Phaser !== 'undefined' ? Phaser.Cameras?.Scene2D?.Events : null;
  camera.on?.(events?.PRE_RENDER || 'cameraprerender', () => recordVehicleTrackerRenderStart(tracker));
  camera.on?.(events?.POST_RENDER || 'camerapostrender', () => {
    presentVehicleTrackerSurface(scene, tracker);
    recordVehicleTrackerRenderEnd(tracker);
  });
  tracker.camera = camera;
  tracker.layoutDirty = false;
  if (vehicleTrackerManager.focusedKey === tracker.key) scene.cameras.bringToTop?.(camera);
  return camera;
}

function syncVehicleTrackerCameraLayout(scene, tracker) {
  const camera = ensureVehicleTrackerCamera(scene, tracker);
  if (!camera || !tracker.layoutDirty) return camera;
  const rect = getVehicleTrackerCanvasRect(scene, tracker.viewportElement);
  if (!rect) return camera;
  camera.setViewport?.(rect.x, rect.y, rect.width, rect.height);
  tracker.layoutDirty = false;
  return camera;
}

function vehicleTrackerObjectIsUiOverlay(scene, object) {
  if (!object) return true;
  if (object.vehicleTrackerUiOverlay) return true;
  if ([
    scene?.zonePreviewGraphic,
    scene?.bridgePreviewGraphic,
    scene?.buildingGuideGraphic,
    scene?.inspectHighlightGraphic,
    scene?.busStopHighlightGraphic,
    scene?.transportVisualState?.routeGraphic,
  ].includes(object)) return true;
  return scene?.transportVisualState?.stopLabels?.includes?.(object) === true;
}

function getVehicleTrackerObjectBounds(object) {
  const x = Number(object?.x);
  const y = Number(object?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const width = Math.max(0, Number(object.displayWidth) || Number(object.width) || 0);
  const height = Math.max(0, Number(object.displayHeight) || Number(object.height) || 0);
  const originX = Number.isFinite(object.originX) ? object.originX : 0.5;
  const originY = Number.isFinite(object.originY) ? object.originY : 0.5;
  return {
    left: x - width * originX,
    right: x + width * (1 - originX),
    top: y - height * originY,
    bottom: y + height * (1 - originY),
  };
}

function vehicleTrackerObjectIntersectsView(scene, object, camera) {
  if (!object || object.active === false || object.visible === false) return false;
  if (vehicleTrackerObjectIsUiOverlay(scene, object)) return false;
  // Weather darkness and screen-space particles use scroll factor zero. They
  // are part of the shared world presentation and should cover each camera.
  if (object.scrollFactorX === 0 && object.scrollFactorY === 0) return true;
  const bounds = getVehicleTrackerObjectBounds(object);
  if (!bounds) return true;
  const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
  const viewWidth = Math.max(1, Number(camera.width) || VEHICLE_TRACKER_CONFIG.viewportWidth) / zoom;
  const viewHeight = Math.max(1, Number(camera.height) || VEHICLE_TRACKER_CONFIG.viewportHeight) / zoom;
  const viewX = Number(camera.scrollX) || 0;
  const viewY = Number(camera.scrollY) || 0;
  const padX = typeof TILE_WIDTH === 'number' ? TILE_WIDTH * 2 : 200;
  const padY = typeof TILE_IMAGE_HEIGHT === 'number' ? TILE_IMAGE_HEIGHT * 2 : 200;
  return bounds.right >= viewX - padX
    && bounds.left <= viewX + viewWidth + padX
    && bounds.bottom >= viewY - padY
    && bounds.top <= viewY + viewHeight + padY;
}

function applyVehicleTrackerObjectCameraFilter(scene, tracker, object) {
  const camera = tracker?.camera;
  if (!camera || !object) return false;
  const included = vehicleTrackerObjectIntersectsView(scene, object, camera);
  if (included) object.cameraFilter &= ~camera.id;
  else object.cameraFilter |= camera.id;
  return included;
}

// Called by the shared render-list insertion paths. A newly activated terrain
// tile or newly created sprite gets the right bits immediately, so stationary
// trackers do not need to rescan the whole Display List every render.
function syncVehicleTrackerObjectCameraFilters(scene, object) {
  if (!scene || vehicleTrackerManager.scene !== scene || !object) return;
  registerVehicleTrackerSpatialObject(scene, object);
  vehicleTrackerManager.trackers.forEach((tracker) => {
    if (tracker.camera && !tracker.minimized) {
      const included = applyVehicleTrackerObjectCameraFilter(scene, tracker, object);
      if (!object.vehicleTrackerDynamic && tracker.includedStaticObjects) {
        if (included) tracker.includedStaticObjects.add(object);
        else tracker.includedStaticObjects.delete(object);
      }
    }
  });
}

function getVehicleTrackerSpatialChunkSize() {
  return {
    width: (typeof TILE_WIDTH === 'number' ? TILE_WIDTH : 200) * 4,
    height: (typeof TILE_IMAGE_HEIGHT === 'number' ? TILE_IMAGE_HEIGHT : 100) * 4,
  };
}

function getVehicleTrackerSpatialKeys(bounds) {
  if (!bounds) return [];
  const chunk = getVehicleTrackerSpatialChunkSize();
  const minCol = Math.floor(bounds.left / chunk.width);
  const maxCol = Math.floor(bounds.right / chunk.width);
  const minRow = Math.floor(bounds.top / chunk.height);
  const maxRow = Math.floor(bounds.bottom / chunk.height);
  const keys = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) keys.push(`${col}:${row}`);
  }
  return keys;
}

function unregisterVehicleTrackerSpatialObject(object) {
  const previousKeys = vehicleTrackerManager.spatialObjectKeys.get(object);
  if (previousKeys) {
    for (const key of previousKeys) {
      const bucket = vehicleTrackerManager.spatialBuckets.get(key);
      bucket?.delete(object);
      if (bucket?.size === 0) vehicleTrackerManager.spatialBuckets.delete(key);
    }
    vehicleTrackerManager.spatialObjectKeys.delete(object);
  }
  vehicleTrackerManager.fixedObjects.delete(object);
}

function registerVehicleTrackerSpatialObject(scene, object) {
  if (!scene || vehicleTrackerManager.spatialScene !== scene || !object) return;
  unregisterVehicleTrackerSpatialObject(object);
  if (object.vehicleTrackerTerrain || object.vehicleTrackerDynamic || vehicleTrackerObjectIsUiOverlay(scene, object)) return;
  if (object.scrollFactorX === 0 && object.scrollFactorY === 0) {
    vehicleTrackerManager.fixedObjects.add(object);
    return;
  }
  const keys = getVehicleTrackerSpatialKeys(getVehicleTrackerObjectBounds(object));
  if (!keys.length) return;
  vehicleTrackerManager.spatialObjectKeys.set(object, keys);
  for (const key of keys) {
    if (!vehicleTrackerManager.spatialBuckets.has(key)) vehicleTrackerManager.spatialBuckets.set(key, new Set());
    vehicleTrackerManager.spatialBuckets.get(key).add(object);
  }
}

function rebuildVehicleTrackerSpatialIndex(scene) {
  vehicleTrackerManager.spatialScene = scene;
  vehicleTrackerManager.spatialBuckets.clear();
  vehicleTrackerManager.spatialObjectKeys.clear();
  vehicleTrackerManager.fixedObjects.clear();
  for (const object of scene?.children?.list || []) registerVehicleTrackerSpatialObject(scene, object);
  vehicleTrackerManager.spatialDirty = false;
}

function markVehicleTrackerSpatialIndexDirty(scene = null) {
  if (!scene || vehicleTrackerManager.spatialScene === scene) vehicleTrackerManager.spatialDirty = true;
  vehicleTrackerManager.trackers.forEach((tracker) => { tracker.objectCullKey = ''; });
}

function ensureVehicleTrackerSpatialIndex(scene) {
  if (vehicleTrackerManager.spatialScene !== scene || vehicleTrackerManager.spatialDirty) {
    rebuildVehicleTrackerSpatialIndex(scene);
  }
}

function markVehicleTrackerDynamicObject(object) {
  if (!object) return;
  object.vehicleTrackerDynamic = true;
  unregisterVehicleTrackerSpatialObject(object);
}

function forEachVehicleTrackerDynamicObject(scene, visit) {
  scene?.transportVisualState?.vehicles?.forEach((vehicle) => {
    if (vehicle.sprite) visit(vehicle.sprite);
    if (vehicle.badge) visit(vehicle.badge);
    if (vehicle.headlightSprite) visit(vehicle.headlightSprite);
    if (vehicle.taillightSprite) visit(vehicle.taillightSprite);
  });
  const traffic = scene?.trafficVisualState;
  traffic?.vehicles?.forEach((vehicle) => {
    if (vehicle.sprite) visit(vehicle.sprite);
    if (vehicle.headlightSprite) visit(vehicle.headlightSprite);
    if (vehicle.taillightSprite) visit(vehicle.taillightSprite);
  });
  if (traffic?.iceCreamEvent) {
    if (traffic.iceCreamEvent.sprite) visit(traffic.iceCreamEvent.sprite);
    if (traffic.iceCreamEvent.headlightSprite) visit(traffic.iceCreamEvent.headlightSprite);
    if (traffic.iceCreamEvent.taillightSprite) visit(traffic.iceCreamEvent.taillightSprite);
  }
  scene?.vesselVisualState?.portStates?.forEach?.((portState) => {
    if (portState?.event?.sprite) visit(portState.event.sprite);
  });
  scene?.aircraftVisualState?.airportStates?.forEach?.((airportState) => {
    airportState?.events?.forEach((event) => { if (event?.sprite) visit(event.sprite); });
  });
}

function getVehicleTrackerObjectCullKey(camera) {
  const stepX = typeof TILE_WIDTH === 'number' ? TILE_WIDTH : 100;
  const stepY = typeof TILE_HEIGHT === 'number' ? TILE_HEIGHT : 50;
  const zoom = Math.max(0.0001, Number(camera?.zoom) || 1);
  const centerX = (Number(camera?.scrollX) || 0) + (Number(camera?.width) || 0) / (2 * zoom);
  const centerY = (Number(camera?.scrollY) || 0) + (Number(camera?.height) || 0) / (2 * zoom);
  return `${Math.floor(centerX / stepX)}:${Math.floor(centerY / stepY)}:${camera?.width}:${camera?.height}:${zoom}`;
}

function recordVehicleTrackerCullDuration(tracker, startedAt) {
  const duration = Math.max(0, performance.now() - startedAt);
  tracker.lastCullMs = duration;
  tracker.averageCullMs = tracker.cullCount > 0
    ? tracker.averageCullMs * 0.8 + duration * 0.2
    : duration;
  tracker.cullCount++;
  vehicleTrackerManager.debug.cullMs += duration;
}

function collectVehicleTrackerSpatialCandidates(camera, target) {
  const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
  const padX = typeof TILE_WIDTH === 'number' ? TILE_WIDTH * 2 : 200;
  const padY = typeof TILE_IMAGE_HEIGHT === 'number' ? TILE_IMAGE_HEIGHT * 2 : 200;
  const bounds = {
    left: (Number(camera.scrollX) || 0) - padX,
    right: (Number(camera.scrollX) || 0) + (Number(camera.width) || 0) / zoom + padX,
    top: (Number(camera.scrollY) || 0) - padY,
    bottom: (Number(camera.scrollY) || 0) + (Number(camera.height) || 0) / zoom + padY,
  };
  for (const key of getVehicleTrackerSpatialKeys(bounds)) {
    const bucket = vehicleTrackerManager.spatialBuckets.get(key);
    if (!bucket) continue;
    for (const object of bucket) target.add(object);
  }
}

function collectVehicleTrackerTerrainCandidates(scene, camera, target) {
  if (typeof getTerrainViewportLogicalRange !== 'function') return;
  const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
  const padX = typeof TILE_WIDTH === 'number' ? TILE_WIDTH * 2 : 200;
  const padY = typeof TILE_IMAGE_HEIGHT === 'number' ? TILE_IMAGE_HEIGHT * 2 : 200;
  const bounds = {
    minX: (Number(camera.scrollX) || 0) - padX,
    maxX: (Number(camera.scrollX) || 0) + (Number(camera.width) || 0) / zoom + padX,
    minY: (Number(camera.scrollY) || 0) - padY,
    maxY: (Number(camera.scrollY) || 0) + (Number(camera.height) || 0) / zoom + padY,
  };
  const range = getTerrainViewportLogicalRange(scene, bounds);
  for (let row = range.minRow; row <= range.maxRow; row++) {
    for (let col = range.minCol; col <= range.maxCol; col++) {
      const tile = scene.tileSprites?.[row]?.[col];
      if (tile?.displayList) target.add(tile);
    }
  }
}

function updateVehicleTrackerCameraObjectCulling(scene, tracker) {
  const camera = tracker?.camera;
  const objects = scene?.children?.list;
  if (!camera || !Array.isArray(objects)) return;
  const startedAt = performance.now();
  const cullKey = getVehicleTrackerObjectCullKey(camera);
  if (tracker.objectCullKey === cullKey) {
    forEachVehicleTrackerDynamicObject(scene, (object) => {
      applyVehicleTrackerObjectCameraFilter(scene, tracker, object);
    });
    recordVehicleTrackerCullDuration(tracker, startedAt);
    return;
  }
  ensureVehicleTrackerSpatialIndex(scene);
  if (!tracker.includedStaticObjects) tracker.includedStaticObjects = new Set();
  for (const object of tracker.includedStaticObjects) object.cameraFilter |= camera.id;
  tracker.includedStaticObjects.clear();
  if (!tracker.spatialCandidates) tracker.spatialCandidates = new Set();
  tracker.spatialCandidates.clear();
  collectVehicleTrackerSpatialCandidates(camera, tracker.spatialCandidates);
  collectVehicleTrackerTerrainCandidates(scene, camera, tracker.spatialCandidates);
  for (const object of vehicleTrackerManager.fixedObjects) tracker.spatialCandidates.add(object);
  let visibleEntities = 0;
  let visibleTiles = 0;
  for (const object of tracker.spatialCandidates) {
    const included = applyVehicleTrackerObjectCameraFilter(scene, tracker, object);
    if (included) {
      tracker.includedStaticObjects.add(object);
      visibleEntities++;
      if (typeof WORLD_LAYER_DEPTHS !== 'undefined' && Number(object.depth) < WORLD_LAYER_DEPTHS.road) {
        visibleTiles++;
      }
    }
  }
  tracker.visibleEntities = visibleEntities;
  tracker.visibleTiles = visibleTiles;
  tracker.objectCullKey = cullKey;
  recordVehicleTrackerCullDuration(tracker, startedAt);
}

function updateVehicleTrackerDynamicObjectCulling(scene, tracker) {
  if (!tracker?.camera) return;
  const startedAt = performance.now();
  forEachVehicleTrackerDynamicObject(scene, (object) => {
    applyVehicleTrackerObjectCameraFilter(scene, tracker, object);
  });
  recordVehicleTrackerCullDuration(tracker, startedAt);
}

function clearVehicleTrackerCameraObjectCulling(scene, camera) {
  if (!camera || !Array.isArray(scene?.children?.list)) return;
  for (const object of scene.children.list) object.cameraFilter &= ~camera.id;
}

function focusVehicleTrackingWindow(tracker) {
  if (!tracker?.root) return;
  vehicleTrackerManager.focusedKey = tracker.key;
  vehicleTrackerManager.focusSerial++;
  tracker.root.style.zIndex = String(380 + vehicleTrackerManager.focusSerial);
  tracker.scene?.cameras?.bringToTop?.(tracker.camera);
  vehicleTrackerManager.trackers.forEach((entry) => entry.root?.classList.toggle('is-focused', entry === tracker));
}

function clampVehicleTrackingWindowPosition(tracker, left, top) {
  const width = tracker.root?.offsetWidth || 324;
  const height = tracker.root?.offsetHeight || 275;
  return {
    left: Math.max(4, Math.min(window.innerWidth - Math.min(width, window.innerWidth) - 4, left)),
    top: Math.max(4, Math.min(window.innerHeight - Math.min(height, window.innerHeight) - 4, top)),
  };
}

function setVehicleTrackingWindowPosition(tracker, left, top) {
  const next = clampVehicleTrackingWindowPosition(tracker, left, top);
  tracker.root.style.left = `${next.left}px`;
  tracker.root.style.top = `${next.top}px`;
  tracker.layoutDirty = true;
  tracker.renderDirty = true;
}

function beginVehicleTrackerDrag(event, tracker) {
  if (event.button !== 0 || event.target.closest('button')) return;
  event.preventDefault();
  event.stopPropagation();
  focusVehicleTrackingWindow(tracker);
  const rootRect = tracker.root.getBoundingClientRect();
  tracker.dragOffsetX = event.clientX - rootRect.left;
  tracker.dragOffsetY = event.clientY - rootRect.top;
  tracker.dragPointerId = event.pointerId;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function moveVehicleTrackerDrag(event, tracker) {
  if (tracker.dragPointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  setVehicleTrackingWindowPosition(
    tracker,
    event.clientX - tracker.dragOffsetX,
    event.clientY - tracker.dragOffsetY,
  );
}

function endVehicleTrackerDrag(event, tracker) {
  if (tracker.dragPointerId !== event.pointerId) return;
  tracker.dragPointerId = null;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
}

function setVehicleTrackingWindowMinimized(tracker, minimized) {
  if (!tracker) return;
  tracker.minimized = !!minimized;
  tracker.root?.classList.toggle('is-minimized', tracker.minimized);
  tracker.root?.querySelector('[data-vehicle-tracker-minimize]')?.setAttribute(
    'aria-label',
    vehicleTrackerText(
      tracker.minimized ? 'transport.tracker.restore' : 'transport.tracker.minimize',
      {},
      tracker.minimized ? 'Restore' : 'Minimize',
    ),
  );
  const button = tracker.root?.querySelector('[data-vehicle-tracker-minimize]');
  if (button) button.textContent = tracker.minimized ? '□' : '−';
  tracker.layoutDirty = true;
  tracker.renderDirty = !tracker.minimized;
  setVehicleTrackerCameraVisible(tracker, false);
  focusVehicleTrackingWindow(tracker);
}

function removeVehicleTrackerCamera(tracker) {
  const scene = tracker?.scene || vehicleTrackerManager.scene;
  if (tracker?.camera && scene?.cameras?.remove) {
    clearVehicleTrackerCameraObjectCulling(scene, tracker.camera);
    scene.cameras.remove(tracker.camera, true);
  }
  if (tracker) tracker.camera = null;
}

function closeVehicleTrackingWindow(targetOrKey, id = undefined) {
  const key = id === undefined
    ? String(targetOrKey || '')
    : getVehicleTrackerTargetKey(targetOrKey, id);
  const tracker = vehicleTrackerManager.trackers.get(key);
  if (!tracker) return false;
  removeVehicleTrackerCamera(tracker);
  tracker.root?.remove?.();
  tracker.surfaceContext = null;
  tracker.surfaceElement = null;
  vehicleTrackerManager.trackers.delete(key);
  if (vehicleTrackerManager.focusedKey === key) vehicleTrackerManager.focusedKey = '';
  if (vehicleTrackerManager.scene) vehicleTrackerManager.scene.terrainViewportCacheKey = '';
  return true;
}

function closeAllVehicleTrackingWindows() {
  Array.from(vehicleTrackerManager.trackers.keys()).forEach((key) => closeVehicleTrackingWindow(key));
  vehicleTrackerManager.roundRobinCursor = 0;
  vehicleTrackerManager.focusedKey = '';
  vehicleTrackerManager.spatialScene = null;
  vehicleTrackerManager.spatialBuckets.clear();
  vehicleTrackerManager.spatialObjectKeys.clear();
  vehicleTrackerManager.fixedObjects.clear();
  vehicleTrackerManager.spatialDirty = true;
}

function closeFocusedVehicleTrackingWindow() {
  if (!vehicleTrackerManager.focusedKey) return false;
  return closeVehicleTrackingWindow(vehicleTrackerManager.focusedKey);
}

function hasOpenVehicleTrackingWindows() {
  return vehicleTrackerManager.trackers.size > 0;
}

function handleVehicleTrackerAction(event, tracker) {
  event.preventDefault();
  event.stopPropagation();
  if (event.currentTarget.hasAttribute('data-vehicle-tracker-minimize')) {
    setVehicleTrackingWindowMinimized(tracker, !tracker.minimized);
    return;
  }
  if (event.currentTarget.hasAttribute('data-vehicle-tracker-close')) {
    closeVehicleTrackingWindow(tracker.key);
    return;
  }
  const action = event.currentTarget.dataset.vehicleTrackerAction;
  if (!action || tracker.type !== 'transport') return;
  const info = resolveTransportTrackerTarget(tracker.scene || vehicleTrackerManager.scene, tracker.targetId);
  if (!info?.vehicle) return;
  if (action === 'route' && info.routeEntity) {
    if (typeof openTransportWindow === 'function') openTransportWindow();
    if (typeof beginTransportRouteEditor === 'function') beginTransportRouteEditor(info.routeEntity);
    return;
  }
  if (action === 'main') {
    const camera = tracker.scene?.cameras?.main;
    if (camera && Number.isFinite(info.x) && Number.isFinite(info.y)) camera.centerOn(info.x, info.y);
    return;
  }
  if (action === 'depot' && typeof sendTransportVehicleToDepot === 'function') {
    if (sendTransportVehicleToDepot(tracker.targetId) && typeof showToast === 'function') {
      showToast(t('transport.toast.vehicleSentDepot'), 'info');
    }
    tracker.renderDirty = true;
    if (typeof refreshTransportUi === 'function') refreshTransportUi();
    return;
  }
  if (action === 'sell' && typeof sellTransportVehicle === 'function') {
    if (!window.confirm(t('transport.depot.confirmSell'))) return;
    if (sellTransportVehicle(tracker.targetId)) {
      if (typeof showToast === 'function') showToast(t('transport.toast.vehicleSold'), 'info');
      closeVehicleTrackingWindow(tracker.key);
    }
    if (typeof refreshTransportUi === 'function') refreshTransportUi();
  }
}

function createVehicleTrackingWindow(type, id, pointer = null) {
  ensureVehicleTrackerStyle();
  if (vehicleTrackerManager.trackers.size === 0) {
    vehicleTrackerManager.debug.renderCount = 0;
    vehicleTrackerManager.debug.renderMs = 0;
    vehicleTrackerManager.debug.cullMs = 0;
    vehicleTrackerManager.debug.deferredFrames = 0;
    vehicleTrackerManager.debug.recentRenderTimes.length = 0;
    vehicleTrackerManager.debug.startedAt = performance.now();
  }
  const key = getVehicleTrackerTargetKey(type, id);
  const root = document.createElement('section');
  root.className = 'vehicle-tracker-window';
  root.dataset.vehicleTrackerKey = key;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  const tabDefs = type === 'transport' ? VEHICLE_TRACKER_TABS : [];
  root.innerHTML = `
    <div class="vehicle-tracker-head" data-vehicle-tracker-drag>
      <span class="vehicle-tracker-title" data-vehicle-tracker-title></span>
      <button type="button" data-vehicle-tracker-minimize aria-label="${vehicleTrackerText('transport.tracker.minimize', {}, 'Minimize')}">−</button>
      <button type="button" data-vehicle-tracker-close aria-label="${vehicleTrackerText('transport.tracker.close', {}, 'Close')}">×</button>
    </div>
    <div class="vehicle-tracker-body">
      ${tabDefs.length ? `<div class="vehicle-tracker-tabs" data-vehicle-tracker-tabs>${tabDefs.map((tab) => (
        `<button type="button" data-vehicle-tracker-tab="${tab.id}" title="${vehicleTrackerText(tab.labelKey, {}, tab.labelFallback)}" aria-label="${vehicleTrackerText(tab.labelKey, {}, tab.labelFallback)}">${tab.icon}</button>`
      )).join('')}</div>` : ''}
      <div class="vehicle-tracker-viewport" data-vehicle-tracker-viewport>
        <canvas class="vehicle-tracker-surface" data-vehicle-tracker-surface width="320" height="180" aria-hidden="true"></canvas>
        <div class="vehicle-tracker-unavailable" data-vehicle-tracker-unavailable hidden></div>
      </div>
    </div>
    <div class="vehicle-tracker-panel" data-vehicle-tracker-panel hidden></div>
    <div class="vehicle-tracker-actions" data-vehicle-tracker-actions></div>
  `;
  if (!tabDefs.length) root.style.width = '324px';
  document.body.appendChild(root);
  const tracker = {
    key,
    type,
    targetId: String(id),
    windowId: vehicleTrackerManager.nextWindowId++,
    root,
    viewportElement: root.querySelector('[data-vehicle-tracker-viewport]'),
    surfaceElement: root.querySelector('[data-vehicle-tracker-surface]'),
    surfaceContext: null,
    camera: null,
    scene: vehicleTrackerManager.scene,
    minimized: false,
    unavailable: false,
    layoutDirty: true,
    renderDirty: true,
    dragPointerId: null,
    activeTab: null,
    lastRenderedAt: -Infinity,
    lastScheduledAt: -Infinity,
    lastStatusAt: -Infinity,
    lastStatusSignature: '',
    lastActionsSignature: '',
    renderCount: 0,
    lastRenderMs: 0,
    averageRenderMs: 0,
    cullCount: 0,
    lastCullMs: 0,
    averageCullMs: 0,
    deferredFrames: 0,
    visibleEntities: 0,
    visibleTiles: 0,
    objectCullKey: '',
    maintenanceDue: true,
    includedStaticObjects: new Set(),
    spatialCandidates: new Set(),
  };
  vehicleTrackerManager.trackers.set(key, tracker);
  const head = root.querySelector('[data-vehicle-tracker-drag]');
  head.addEventListener('pointerdown', (event) => beginVehicleTrackerDrag(event, tracker));
  head.addEventListener('pointermove', (event) => moveVehicleTrackerDrag(event, tracker));
  head.addEventListener('pointerup', (event) => endVehicleTrackerDrag(event, tracker));
  head.addEventListener('pointercancel', (event) => endVehicleTrackerDrag(event, tracker));
  root.querySelector('[data-vehicle-tracker-minimize]').addEventListener('click', (event) => handleVehicleTrackerAction(event, tracker));
  root.querySelector('[data-vehicle-tracker-close]').addEventListener('click', (event) => handleVehicleTrackerAction(event, tracker));
  root.querySelectorAll('[data-vehicle-tracker-tab]').forEach((button) => {
    button.addEventListener('click', (event) => handleVehicleTrackerTabClick(event, tracker));
  });
  ['pointerdown', 'pointerup', 'click', 'dblclick', 'wheel', 'contextmenu'].forEach((eventName) => {
    root.addEventListener(eventName, (event) => event.stopPropagation());
  });
  root.addEventListener('pointerdown', () => focusVehicleTrackingWindow(tracker));
  const x = pointer?.event?.clientX ?? Math.min(window.innerWidth - 370, 24 + ((tracker.windowId - 1) % 6) * 28);
  const y = pointer?.event?.clientY ?? Math.min(window.innerHeight - 290, 112 + ((tracker.windowId - 1) % 6) * 24);
  setVehicleTrackingWindowPosition(tracker, x + (pointer ? 14 : 0), y + (pointer ? 14 : 0));
  focusVehicleTrackingWindow(tracker);
  return tracker;
}

function openVehicleTrackingWindow(type, id, pointer = null, options = {}) {
  if (typeof document === 'undefined' || id === undefined || id === null) return null;
  const key = getVehicleTrackerTargetKey(type, id);
  let tracker = vehicleTrackerManager.trackers.get(key);
  if (tracker) {
    setVehicleTrackingWindowMinimized(tracker, false);
    focusVehicleTrackingWindow(tracker);
    tracker.renderDirty = true;
    return tracker;
  }
  tracker = createVehicleTrackingWindow(String(type || 'vehicle'), String(id), pointer);
  tracker.scene = typeof activeScene === 'undefined' ? null : activeScene;
  vehicleTrackerManager.scene = tracker.scene;
  if (options.minimized === true) setVehicleTrackingWindowMinimized(tracker, true);
  refreshVehicleTrackingWindow(tracker, performance.now(), true);
  return tracker;
}

function renderVehicleTrackerActions(tracker, info) {
  if (tracker.type !== 'transport' || !info?.vehicle) return '';
  const route = info.routeEntity
    ? `<button type="button" data-vehicle-tracker-action="route">${vehicleTrackerText('transport.inspector.route', {}, 'Route')}</button>`
    : '';
  const main = info.available
    ? `<button type="button" data-vehicle-tracker-action="main">${vehicleTrackerText('transport.tracker.locateMain', {}, 'Main view')}</button>`
    : '';
  const depot = ['active', 'returning_for_service', 'broken_down'].includes(info.vehicle.status)
    ? `<button type="button" data-vehicle-tracker-action="depot">${vehicleTrackerText('transport.fleet.sendDepot', {}, 'Send to depot')}</button>`
    : '';
  const sell = info.vehicle.status === 'depot'
    ? `<button class="danger" type="button" data-vehicle-tracker-action="sell">${vehicleTrackerText('transport.depot.sell', {}, 'Sell')}</button>`
    : '';
  return route + main + depot + sell;
}

function bindVehicleTrackerActionButtons(tracker) {
  tracker.root.querySelectorAll('[data-vehicle-tracker-action]').forEach((button) => {
    button.addEventListener('click', (event) => handleVehicleTrackerAction(event, tracker));
  });
}

function handleVehicleTrackerTabClick(event, tracker) {
  event.preventDefault();
  event.stopPropagation();
  const tabId = event.currentTarget.dataset.vehicleTrackerTab;
  tracker.activeTab = tracker.activeTab === tabId ? null : tabId;
  tracker.lastStatusSignature = '';
  tracker.layoutDirty = true;
  tracker.renderDirty = true;
  refreshVehicleTrackingWindow(tracker, performance.now(), true);
}

function renderVehicleTrackerRows(rows) {
  return rows.map(([label, value]) => (
    `<div class="vehicle-tracker-status-row"><span>${typeof transportEscapeHtml === 'function' ? transportEscapeHtml(label) : label}</span><strong>${typeof transportEscapeHtml === 'function' ? transportEscapeHtml(value) : value}</strong></div>`
  )).join('');
}

function getVehicleTrackerConditionRows(info) {
  const vehicle = info?.vehicle;
  const vehicleClass = info?.vehicleClass;
  const conditionPct = vehicle ? `${Math.round(Math.max(0, Math.min(1, Number(vehicle.condition ?? 1))) * 100)}%` : '—';
  const rows = [
    [vehicleTrackerText('transport.inspector.status', {}, 'Status'), info?.status || '—'],
    [vehicleTrackerText('transport.inspector.class', {}, 'Class'), vehicleClass?.label || vehicleClass?.name || vehicleClass?.id || '—'],
    [vehicleTrackerText('transport.inspector.condition', {}, 'Condition'), conditionPct],
    [vehicleTrackerText('transport.inspector.age', {}, 'Age'), vehicle ? `${Math.max(0, Math.floor(Number(vehicle.ageMonths) || 0))}` : '—'],
    [vehicleTrackerText('transport.inspector.odometer', {}, 'Odometer'), vehicle ? `${Math.max(0, Math.floor(Number(vehicle.odometerTiles) || 0))}` : '—'],
  ];
  if (vehicle?.status === 'servicing' && vehicle.serviceDaysRemaining > 0) {
    rows.push([vehicleTrackerText('transport.tracker.serviceDaysRemaining', {}, 'Service ends in'), `${vehicle.serviceDaysRemaining}`]);
  }
  if (vehicle?.status === 'broken_down' && vehicle.brokenDaysRemaining > 0) {
    rows.push([vehicleTrackerText('transport.tracker.brokenDaysRemaining', {}, 'Back on road in'), `${vehicle.brokenDaysRemaining}`]);
  }
  return rows;
}

function renderVehicleTrackerPanel(tracker, info, position, status) {
  const panel = tracker.root.querySelector('[data-vehicle-tracker-panel]');
  if (!panel) return;
  // Only the transport tracker has left-rail tabs and collapses by default;
  // traffic/vessel/aircraft trackers have no tabs to reopen it with, so their
  // one status card stays shown, same as before this restore.
  if (tracker.type !== 'transport') {
    panel.hidden = false;
    panel.innerHTML = renderVehicleTrackerRows([
      [vehicleTrackerText('transport.inspector.status', {}, 'Status'), status || '—'],
      [vehicleTrackerText('transport.inspector.route', {}, 'Route'), info?.route || '—'],
      [vehicleTrackerText('transport.inspector.currentLeg', {}, 'Current leg'), info?.leg || '—'],
      [vehicleTrackerText('transport.inspector.passengers', {}, 'Passengers'), info?.passengers || '—'],
      [vehicleTrackerText('transport.inspector.position', {}, 'Position'), position],
    ]);
    return;
  }
  panel.hidden = !tracker.activeTab;
  if (!tracker.activeTab) return;
  let rows;
  if (tracker.activeTab === 'condition') {
    rows = getVehicleTrackerConditionRows(info);
  } else if (tracker.activeTab === 'route') {
    rows = [
      [vehicleTrackerText('transport.inspector.route', {}, 'Route'), info?.route || '—'],
      [vehicleTrackerText('transport.inspector.currentLeg', {}, 'Current leg'), info?.leg || '—'],
      [vehicleTrackerText('transport.inspector.position', {}, 'Position'), position],
    ];
  } else {
    rows = [
      [vehicleTrackerText('transport.inspector.passengers', {}, 'Passengers'), info?.passengers || '—'],
      [vehicleTrackerText('transport.inspector.route', {}, 'Route'), info?.route || '—'],
      [vehicleTrackerText('transport.inspector.currentLeg', {}, 'Current leg'), info?.leg || '—'],
    ];
  }
  panel.innerHTML = renderVehicleTrackerRows(rows);
}

function refreshVehicleTrackingWindow(tracker, now, force = false, resolvedInfo = undefined) {
  if (!tracker?.root || tracker.minimized) return;
  if (!force && now - tracker.lastStatusAt < VEHICLE_TRACKER_CONFIG.statusRefreshMs) return;
  const info = resolvedInfo === undefined
    ? resolveVehicleTrackerTarget(tracker.scene || vehicleTrackerManager.scene, tracker.type, tracker.targetId)
    : resolvedInfo;
  const unavailable = !info?.available;
  tracker.unavailable = unavailable;
  const title = info?.title || `${tracker.type} ${tracker.targetId}`;
  const status = info?.status || vehicleTrackerText('transport.tracker.unavailable', {}, 'Vehicle unavailable');
  const position = info?.position && Number.isFinite(info.position.row) && Number.isFinite(info.position.col)
    ? `(${Math.round(info.position.row)}, ${Math.round(info.position.col)})`
    : '—';
  const signature = [title, status, info?.route, info?.leg, info?.passengers, position, unavailable, info?.vehicle?.status, info?.vehicle?.condition, tracker.activeTab].join('|');
  tracker.root.querySelector('[data-vehicle-tracker-title]').textContent = title;
  const unavailableElement = tracker.root.querySelector('[data-vehicle-tracker-unavailable]');
  unavailableElement.hidden = !unavailable;
  unavailableElement.textContent = info?.unavailableText
    || vehicleTrackerText('transport.tracker.unavailable', {}, 'Vehicle unavailable');
  tracker.root.querySelectorAll('[data-vehicle-tracker-tab]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.vehicleTrackerTab === tracker.activeTab);
  });
  if (force || signature !== tracker.lastStatusSignature) {
    renderVehicleTrackerPanel(tracker, info, position, status);
    tracker.lastStatusSignature = signature;
    tracker.layoutDirty = true;
  }
  const actionsSignature = [info?.available, info?.routeEntity?.id, info?.vehicle?.status].join('|');
  if (force || actionsSignature !== tracker.lastActionsSignature) {
    const actionsElement = tracker.root.querySelector('[data-vehicle-tracker-actions]');
    if (actionsElement) actionsElement.innerHTML = renderVehicleTrackerActions(tracker, info);
    bindVehicleTrackerActionButtons(tracker);
    tracker.lastActionsSignature = actionsSignature;
    tracker.layoutDirty = true;
  }
  tracker.lastStatusAt = now;
}

function getVehicleTrackerCullCameras(scene) {
  if (!scene || vehicleTrackerManager.scene !== scene) return [];
  return Array.from(vehicleTrackerManager.trackers.values())
    .filter((tracker) => !tracker.minimized && !tracker.unavailable && tracker.camera)
    .map((tracker) => tracker.camera);
}

function hasActiveVehicleTrackers(scene, type = '') {
  if (!scene || vehicleTrackerManager.scene !== scene) return false;
  return Array.from(vehicleTrackerManager.trackers.values()).some((tracker) => (
    !tracker.minimized && (!type || tracker.type === type)
  ));
}

function getTrackedVehicleIds(scene, type) {
  if (!scene || vehicleTrackerManager.scene !== scene) return [];
  return Array.from(vehicleTrackerManager.trackers.values())
    .filter((tracker) => !tracker.minimized && tracker.type === type)
    .map((tracker) => tracker.targetId);
}

function isVehicleTrackerTarget(scene, type, id) {
  return getTrackedVehicleIds(scene, type).includes(String(id));
}

function getDueVehicleTrackers(trackers, now, interval) {
  if (!trackers.length) return [];
  const focused = vehicleTrackerManager.trackers.get(vehicleTrackerManager.focusedKey);
  // Main-loop samples land near 16.67 ms boundaries, so a strict 66.67 ms
  // comparison can quantise nominal 15 FPS maintenance down to 12 FPS on a
  // 60 Hz display. Half-frame tolerance keeps the intended cadence.
  const cadenceToleranceMs = Math.min(8, interval * 0.12);
  const due = trackers.filter((tracker) => (
    tracker.renderDirty || now - tracker.lastScheduledAt >= interval - cadenceToleranceMs
  ));
  if (!due.length) return [];
  const dueSet = new Set(due);
  const ordered = [];
  if (focused && dueSet.delete(focused)) ordered.push(focused);
  const start = vehicleTrackerManager.roundRobinCursor % trackers.length;
  for (let offset = 0; offset < trackers.length; offset++) {
    const tracker = trackers[(start + offset) % trackers.length];
    if (dueSet.delete(tracker)) ordered.push(tracker);
  }
  vehicleTrackerManager.roundRobinCursor = (start + 1) % trackers.length;
  return ordered;
}

function beginVehicleTrackerFrame(scene, time) {
  if (!scene) return;
  // Phaser's `time` argument is a smoothed game-loop clock. Camera POST_RENDER
  // measurements use DOMHighResTimeStamp, so cadence must use the same clock
  // or the two slowly drift and a requested 15 FPS can quantise near 10 FPS.
  const now = performance.now();
  if (vehicleTrackerManager.scene && vehicleTrackerManager.scene !== scene) closeAllVehicleTrackingWindows();
  vehicleTrackerManager.scene = scene;
  vehicleTrackerManager.lastFrameTime = now;
  vehicleTrackerManager.trackers.forEach((tracker) => {
    tracker.scene = scene;
    if (tracker.minimized) setVehicleTrackerCameraVisible(tracker, false);
  });
  if (typeof document !== 'undefined' && document.hidden) return;
  const visible = Array.from(vehicleTrackerManager.trackers.values()).filter((tracker) => !tracker.minimized);
  if (!visible.length) return;
  if (!vehicleTrackerManager.debug.startedAt) vehicleTrackerManager.debug.startedAt = performance.now();
  const paused = typeof simPaused !== 'undefined' && simPaused;
  const interval = getVehicleTrackerRenderInterval(visible.length);
  const due = getDueVehicleTrackers(visible, now, interval).filter((tracker) => !paused || tracker.renderDirty);
  let reservedMs = 0;
  for (const tracker of due) {
    const info = resolveVehicleTrackerTarget(scene, tracker.type, tracker.targetId);
    refreshVehicleTrackingWindow(tracker, now, tracker.renderDirty, info);
    const camera = syncVehicleTrackerCameraLayout(scene, tracker);
    if (!info?.available || !camera) {
      setVehicleTrackerCameraVisible(tracker, false);
      tracker.lastScheduledAt = now;
      tracker.maintenanceDue = false;
      tracker.renderDirty = false;
      continue;
    }
    const estimate = getVehicleTrackerRenderEstimate(tracker);
    if (reservedMs > 0 && reservedMs + estimate > VEHICLE_TRACKER_CONFIG.budgetMs) {
      tracker.deferredFrames++;
      vehicleTrackerManager.debug.deferredFrames++;
      continue;
    }
    camera.centerOn(info.x, info.y);
    camera.setZoom?.(VEHICLE_TRACKER_CONFIG.zoom);
    camera.visible = true;
    tracker.lastScheduledAt = now;
    tracker.maintenanceDue = true;
    tracker.renderDirty = false;
    reservedMs += estimate;
  }
  // Keep status current without introducing a timer. Minimized trackers are
  // intentionally skipped: they contribute neither camera nor periodic DOM work.
  visible.forEach((tracker) => refreshVehicleTrackingWindow(tracker, now));
}

function syncVehicleTrackerTargetsBeforeRender(scene, time) {
  if (!scene || vehicleTrackerManager.scene !== scene) return;
  vehicleTrackerManager.trackers.forEach((tracker) => {
    if (tracker.minimized || !tracker.camera?.visible) return;
    const info = resolveVehicleTrackerTarget(scene, tracker.type, tracker.targetId);
    if (!info?.available) {
      setVehicleTrackerCameraVisible(tracker, false);
      refreshVehicleTrackingWindow(tracker, time, true, info);
      return;
    }
    tracker.camera.centerOn(info.x, info.y);
  });
}

function finalizeVehicleTrackerCameraCulling(scene) {
  if (!scene || vehicleTrackerManager.scene !== scene) return;
  vehicleTrackerManager.trackers.forEach((tracker) => {
    if (!tracker.minimized && tracker.camera?.visible) {
      if (tracker.maintenanceDue) {
        updateVehicleTrackerCameraObjectCulling(scene, tracker);
        tracker.maintenanceDue = false;
      } else {
        updateVehicleTrackerDynamicObjectCulling(scene, tracker);
      }
    }
  });
}

function markVehicleTrackerLayoutDirty() {
  vehicleTrackerManager.trackers.forEach((tracker) => {
    tracker.layoutDirty = true;
    tracker.renderDirty = true;
  });
}

function getVehicleTrackerDebugSnapshot(scene = vehicleTrackerManager.scene) {
  const trackers = Array.from(vehicleTrackerManager.trackers.values());
  const recent = vehicleTrackerManager.debug.recentRenderTimes;
  const average = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : 0;
  const resolution = Math.min(1.5, Math.max(1, Number(scene?.game?.config?.resolution) || 1));
  const elapsedSeconds = Math.max(0.001, (performance.now() - vehicleTrackerManager.debug.startedAt) / 1000);
  return {
    active: trackers.length,
    visible: trackers.filter((tracker) => !tracker.minimized).length,
    renderCount: vehicleTrackerManager.debug.renderCount,
    rendersPerSecond: vehicleTrackerManager.debug.renderCount / elapsedSeconds,
    renderMs: vehicleTrackerManager.debug.renderMs,
    renderMsPerSecond: (vehicleTrackerManager.debug.renderMs + vehicleTrackerManager.debug.cullMs) / elapsedSeconds,
    cullMs: vehicleTrackerManager.debug.cullMs,
    lastRenderMs: recent.at(-1) || 0,
    averageRenderMs: average,
    deferredFrames: vehicleTrackerManager.debug.deferredFrames,
    budgetMs: VEHICLE_TRACKER_CONFIG.budgetMs,
    renderScale: resolution,
    trackers: trackers.map((tracker) => ({
      key: tracker.key,
      minimized: tracker.minimized,
      unavailable: tracker.unavailable,
      renders: tracker.renderCount,
      lastRenderMs: tracker.lastRenderMs,
      averageRenderMs: tracker.averageRenderMs,
      lastCullMs: tracker.lastCullMs,
      averageCullMs: tracker.averageCullMs,
      deferredFrames: tracker.deferredFrames,
      viewport: tracker.camera ? { width: tracker.camera.width, height: tracker.camera.height, zoom: tracker.camera.zoom } : null,
      renderedEntities: tracker.camera?.renderList?.length || 0,
      culledVisibleEntities: tracker.visibleEntities,
      visibleTiles: tracker.visibleTiles,
    })),
  };
}

function registerVehicleTrackingSprite(entity, type, options = {}) {
  const sprite = entity?.sprite;
  if (!sprite?.setInteractive || entity.vehicleTrackerRegistered) return false;
  markVehicleTrackerDynamicObject(sprite);
  sprite.setInteractive({ cursor: 'pointer' });
  sprite.on('pointerdown', (pointer) => {
    const inspectActive = typeof selectedTool !== 'undefined' && selectedTool === 'inspect';
    const transportActive = typeof isTransportModeActive !== 'undefined' && isTransportModeActive;
    if (!inspectActive && !transportActive && options.always !== true) return;
    pointer?.event?.stopPropagation?.();
    openVehicleTrackingWindow(type, entity.id, pointer);
  });
  entity.vehicleTrackerRegistered = true;
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', markVehicleTrackerLayoutDirty);
}

const vehicleTrackerTestApi = {
  VEHICLE_TRACKER_CONFIG,
  getVehicleTrackerTargetKey,
  getVehicleTrackerTargetFps,
  getVehicleTrackerRenderInterval,
};

if (typeof module !== 'undefined' && module.exports) module.exports = vehicleTrackerTestApi;
