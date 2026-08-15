// ── Managed route bus visuals ────────────────────────────────────────────────
// Passenger and financial simulation remains aggregate in
// transport-expansion.js. These sprites are a bounded visual projection of
// that state: they are never persisted and never drive gameplay results.

const TRANSPORT_VISUAL_CONFIG = Object.freeze({
  maxManagedVehicles: 16,
  zoomMin: 1.4,
  speedFactor: 0.95,
  dwellMs: 1800,
  dwellProgress: 1,
  overlayRefreshMs: 200,
});

function getTransportVisualState(scene) {
  if (!scene) return null;
  if (!scene.transportVisualState) {
    scene.transportVisualState = {
      vehicles: [],
      signature: '',
      dirty: true,
      routeGraphic: null,
      stopLabels: [],
      lastOverlayRefresh: -Infinity,
      lastOverlaySignature: '',
    };
  }
  return scene.transportVisualState;
}

function setupTransportVisuals(scene) {
  return getTransportVisualState(scene);
}

function destroyManagedTransportVehicle(vehicle) {
  vehicle?.sprite?.destroy?.();
  vehicle?.badge?.destroy?.();
}

function clearManagedTransportVehicles(state) {
  state?.vehicles?.forEach(destroyManagedTransportVehicle);
  if (state?.vehicles) state.vehicles.length = 0;
  if (state) state.signature = '';
}

function clearTransportStopLabels(state) {
  state?.stopLabels?.forEach((label) => label?.destroy?.());
  if (state?.stopLabels) state.stopLabels.length = 0;
}

function clearTransportVisuals(scene, options = {}) {
  const state = scene?.transportVisualState;
  if (!state) return;
  clearManagedTransportVehicles(state);
  if (options.keepOverlay !== true && state.routeGraphic) {
    state.routeGraphic.destroy?.();
    state.routeGraphic = null;
  } else {
    state.routeGraphic?.clear?.();
  }
  clearTransportStopLabels(state);
  state.dirty = true;
  state.lastOverlaySignature = '';
}

function invalidateTransportVisuals(scene, clear = false) {
  const state = getTransportVisualState(scene);
  if (!state) return;
  if (clear) {
    clearManagedTransportVehicles(state);
    state.routeGraphic?.clear?.();
    clearTransportStopLabels(state);
  }
  state.dirty = true;
  state.lastOverlaySignature = '';
}

function getManagedTransportVehicleCount(scene) {
  return scene?.transportVisualState?.vehicles?.length ?? 0;
}

function transportHexToNumber(value) {
  const parsed = Number.parseInt(String(value || '#1e88e5').replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : 0x1e88e5;
}

function getTransportVisualSignature(routeEntries) {
  return routeEntries.map(({ route, runtime }) => (
    `${route.id}:${route.color}:${runtime.effectiveBuses}:`
    + runtime.roundTripPath.map((tile) => `${tile.row},${tile.col}`).join(';')
  )).join('|');
}

function getTransportBusModels(scene) {
  const candidates = ['bus_kmb', 'bus_citybus']
    .map((id) => typeof TRAFFIC_MODEL_BY_ID !== 'undefined' ? TRAFFIC_MODEL_BY_ID.get(id) : null)
    .filter(Boolean);
  const ready = candidates.filter((model) => trafficModelTexturesAreReady(scene, model));
  if (ready.length < candidates.length && typeof requestTrafficModels === 'function') {
    requestTrafficModels(scene, candidates.filter((model) => !ready.includes(model)));
  }
  return ready;
}

function createManagedTransportVehicle(scene, route, runtime, model, ordinal, count, lineNumber) {
  const cycle = runtime.roundTripPath;
  if (!Array.isArray(cycle) || cycle.length < 2) return null;
  const positionAlongCycle = ordinal * cycle.length / Math.max(1, count);
  const currentIndex = Math.floor(positionAlongCycle) % cycle.length;
  const progress = positionAlongCycle - Math.floor(positionAlongCycle);
  const previous = cycle[(currentIndex - 1 + cycle.length) % cycle.length];
  const current = cycle[currentIndex];
  const next = cycle[(currentIndex + 1) % cycle.length];
  const sprite = scene.add.image(0, 0, model.directions.ne.key);
  addToRenderLayer(scene, sprite, 'objectLayer');
  sprite.setOrigin(model.originX, model.originY);
  sprite.setScale(model.scale);
  sprite.setMask(scene.worldMask);
  const badge = scene.add.text(0, 0, String(lineNumber), {
    fontFamily: 'Arial, sans-serif',
    fontSize: '8px',
    fontStyle: 'bold',
    color: '#ffffff',
    backgroundColor: route.color,
    padding: { x: 2, y: 1 },
  });
  addToRenderLayer(scene, badge, 'effectLayer');
  badge.setOrigin(0.5, 0.5);
  badge.setMask(scene.worldMask);
  const vehicle = {
    id: `managed:${route.id}:${ordinal}`,
    routeId: route.id,
    route,
    runtime,
    cycle,
    model,
    sprite,
    badge,
    currentIndex,
    previous,
    current,
    next,
    progress,
    textureDirection: 'ne',
    leg: createTrafficLeg(scene, previous, current, next),
    lastPosition: null,
    dwellRemainingMs: 0,
    dwellHandled: false,
    stopKeys: new Set(route.stopIds.map(getTransportStopById).filter(Boolean)
      .map((stop) => `${stop.row}:${stop.col}`)),
  };
  setManagedTransportVehicleVisual(vehicle, evaluateTrafficLeg(vehicle.leg, progress), true);
  return vehicle;
}

function setManagedTransportVehicleVisual(vehicle, position, forceDepth = false) {
  const direction = getTrafficTextureDirection(
    position.dx,
    position.dy,
    vehicle.textureDirection,
  );
  vehicle.textureDirection = direction;
  const key = vehicle.model.directions[direction].key;
  if (vehicle.sprite.texture?.key !== key) vehicle.sprite.setTexture(key);
  vehicle.sprite.setPosition(position.x, position.y);
  vehicle.badge.setPosition(position.x, position.y - 13);
  vehicle.lastPosition = position;
  const depth = getWorldDepth('object', position.depthY + TILE_HEIGHT / 2);
  vehicle.sprite.setDepth(depth);
  vehicle.badge.setDepth(getWorldDepth('effect', position.depthY + TILE_HEIGHT / 2));
}

function rebuildManagedTransportVehicles(scene, state, routeEntries) {
  const signature = getTransportVisualSignature(routeEntries);
  if (!state.dirty && state.signature === signature) return;
  clearManagedTransportVehicles(state);
  const models = getTransportBusModels(scene);
  if (models.length === 0) {
    state.dirty = true;
    return;
  }
  let remaining = TRANSPORT_VISUAL_CONFIG.maxManagedVehicles;
  for (let routeIndex = 0; routeIndex < routeEntries.length && remaining > 0; routeIndex++) {
    const { route, runtime } = routeEntries[routeIndex];
    const count = Math.min(runtime.effectiveBuses, remaining);
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const model = models[(routeIndex + ordinal) % models.length];
      const vehicle = createManagedTransportVehicle(
        scene, route, runtime, model, ordinal, count, routeIndex + 1,
      );
      if (vehicle) state.vehicles.push(vehicle);
    }
    remaining -= count;
  }
  state.signature = signature;
  state.dirty = false;
  if (scene.trafficVisualState) scene.trafficVisualState.dirty = true;
}

function advanceManagedTransportVehicle(scene, vehicle, amount) {
  vehicle.progress += amount;
  let transitions = 0;
  while (vehicle.progress >= 1 && transitions++ < TRAFFIC_VISUAL_CONFIG.maxLegTransitionsPerFrame) {
    vehicle.progress -= 1;
    vehicle.currentIndex = (vehicle.currentIndex + 1) % vehicle.cycle.length;
    vehicle.previous = vehicle.cycle[(vehicle.currentIndex - 1 + vehicle.cycle.length) % vehicle.cycle.length];
    vehicle.current = vehicle.cycle[vehicle.currentIndex];
    vehicle.next = vehicle.cycle[(vehicle.currentIndex + 1) % vehicle.cycle.length];
    vehicle.leg = createTrafficLeg(scene, vehicle.previous, vehicle.current, vehicle.next);
    vehicle.dwellHandled = false;
  }
  if (vehicle.progress >= 1) vehicle.progress = 0;
  setManagedTransportVehicleVisual(vehicle, evaluateTrafficLeg(vehicle.leg, vehicle.progress));
}

function updateManagedTransportVehicle(scene, vehicle, delta, speedMultiplier) {
  if (vehicle.dwellRemainingMs > 0) {
    vehicle.dwellRemainingMs -= delta * speedMultiplier;
    if (vehicle.dwellRemainingMs > 0) {
      setManagedTransportVehicleVisual(vehicle, evaluateTrafficLeg(vehicle.leg, vehicle.progress));
      return;
    }
    vehicle.dwellRemainingMs = 0;
  }
  const amount = computeTrafficProgressAmount(
    delta,
    false,
    speedMultiplier,
    TRAFFIC_VISUAL_CONFIG,
    vehicle.model.speedFactor * TRANSPORT_VISUAL_CONFIG.speedFactor * getTrafficLegSpeedFactor(vehicle.leg),
  );
  if (
    !vehicle.dwellHandled
    && vehicle.stopKeys.has(`${vehicle.next.row}:${vehicle.next.col}`)
    && vehicle.progress < TRANSPORT_VISUAL_CONFIG.dwellProgress
    && vehicle.progress + amount >= TRANSPORT_VISUAL_CONFIG.dwellProgress
  ) {
    vehicle.dwellHandled = true;
    vehicle.progress = TRANSPORT_VISUAL_CONFIG.dwellProgress;
    vehicle.dwellRemainingMs = TRANSPORT_VISUAL_CONFIG.dwellMs;
    setManagedTransportVehicleVisual(vehicle, evaluateTrafficLeg(vehicle.leg, vehicle.progress));
    return;
  }
  advanceManagedTransportVehicle(scene, vehicle, amount);
}

function ensureTransportRouteGraphic(scene, state) {
  if (state.routeGraphic) return state.routeGraphic;
  const graphic = scene.add.graphics();
  addToRenderLayer(scene, graphic, 'effectLayer');
  graphic.setDepth(getPreviewOverlayDepth(2));
  graphic.setMask(scene.worldMask);
  state.routeGraphic = graphic;
  return graphic;
}

function getTransportOverlaySignature(routeEntries) {
  const editorStops = typeof getTransportRouteEditorStopIds === 'function'
    ? getTransportRouteEditorStopIds().join(',')
    : '';
  return `${mapRotation}:${getTransportVisualSignature(routeEntries)}:${editorStops}`;
}

function drawTransportRouteOverlay(scene, state, routeEntries, time) {
  const requested = typeof isTransportRouteOverlayRequested === 'function'
    && isTransportRouteOverlayRequested();
  if (!requested) {
    state.routeGraphic?.clear?.();
    clearTransportStopLabels(state);
    state.lastOverlaySignature = '';
    return;
  }
  const signature = getTransportOverlaySignature(routeEntries);
  if (signature === state.lastOverlaySignature) return;
  const graphic = ensureTransportRouteGraphic(scene, state);
  graphic.clear();
  clearTransportStopLabels(state);
  for (const { route, runtime } of routeEntries) {
    const path = runtime.path;
    if (!Array.isArray(path) || path.length < 2) continue;
    graphic.lineStyle(4, transportHexToNumber(route.color), 0.78);
    const first = getTrafficSurfacePoint(scene, path[0].row, path[0].col);
    graphic.beginPath();
    graphic.moveTo(first.x, first.y);
    for (let index = 1; index < path.length; index++) {
      const point = getTrafficSurfacePoint(scene, path[index].row, path[index].col);
      graphic.lineTo(point.x, point.y);
    }
    graphic.strokePath();
    route.stopIds.map(getTransportStopById).filter(Boolean).forEach((stop, index) => {
      const point = getTrafficSurfacePoint(scene, stop.row, stop.col);
      graphic.fillStyle(transportHexToNumber(route.color), 0.98);
      graphic.fillCircle(point.x, point.y, 5);
      graphic.lineStyle(1.5, 0xffffff, 1);
      graphic.strokeCircle(point.x, point.y, 5);
      const label = scene.add.text(point.x, point.y, String(index + 1), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '8px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: route.color,
        padding: { x: 2, y: 1 },
      });
      addToRenderLayer(scene, label, 'effectLayer');
      label.setOrigin(0.5, 0.5);
      label.setDepth(getPreviewOverlayDepth(3));
      label.setMask(scene.worldMask);
      state.stopLabels.push(label);
    });
  }
  const editorStopIds = typeof getTransportRouteEditorStopIds === 'function'
    ? getTransportRouteEditorStopIds()
    : [];
  editorStopIds.map(getTransportStopById).filter(Boolean).forEach((stop, index) => {
    const point = getTrafficSurfacePoint(scene, stop.row, stop.col);
    graphic.fillStyle(0xffd54f, 0.98);
    graphic.fillCircle(point.x, point.y, 7);
    graphic.lineStyle(2, 0x1d2930, 1);
    graphic.strokeCircle(point.x, point.y, 7);
    const label = scene.add.text(point.x, point.y, String(index + 1), {
      fontFamily: 'Arial, sans-serif',
      fontSize: '9px',
      fontStyle: 'bold',
      color: '#1d2930',
      backgroundColor: '#ffd54f',
      padding: { x: 2, y: 1 },
    });
    addToRenderLayer(scene, label, 'effectLayer');
    label.setOrigin(0.5, 0.5);
    label.setDepth(getPreviewOverlayDepth(4));
    label.setMask(scene.worldMask);
    state.stopLabels.push(label);
  });
  state.lastOverlaySignature = signature;
  state.lastOverlayRefresh = time;
}

function updateTransportVisuals(time, delta) {
  const scene = this;
  const state = getTransportVisualState(scene);
  if (!state || !scene?.cameras?.main) return;
  const routeEntries = typeof getTransportRoutesForVisuals === 'function'
    ? getTransportRoutesForVisuals()
    : [];
  drawTransportRouteOverlay(scene, state, routeEntries, time);

  const visible = !(scene.scene?.isVisible && !scene.scene.isVisible());
  const zoomReady = scene.cameras.main.zoom >= TRANSPORT_VISUAL_CONFIG.zoomMin;
  const terrainMode = typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode;
  if (!visible || !zoomReady || terrainMode || routeEntries.length === 0) {
    if (state.vehicles.length > 0) clearManagedTransportVehicles(state);
    state.dirty = true;
    return;
  }
  rebuildManagedTransportVehicles(scene, state, routeEntries);
  const showRouteMarkers = typeof isTransportRouteOverlayRequested === 'function'
    && isTransportRouteOverlayRequested();
  state.vehicles.forEach((vehicle) => vehicle.badge?.setVisible?.(showRouteMarkers));
  const paused = typeof simPaused !== 'undefined' && simPaused;
  if (paused || state.vehicles.length === 0) return;
  const speedMultiplier = typeof getVehicleVisualSpeedMultiplier === 'function'
    ? getVehicleVisualSpeedMultiplier()
    : Math.max(1, Number(typeof simSpeedMul === 'undefined' ? 1 : simSpeedMul) || 1);
  state.vehicles.forEach((vehicle) => updateManagedTransportVehicle(scene, vehicle, delta, speedMultiplier));
}

const transportVisualTestApi = {
  TRANSPORT_VISUAL_CONFIG,
  transportHexToNumber,
  getTransportVisualSignature,
};

if (typeof module !== 'undefined' && module.exports) module.exports = transportVisualTestApi;
