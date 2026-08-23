// ── Managed route bus visuals ────────────────────────────────────────────────
// Each sprite here is tied to a real, individually-owned vehicle entity
// (transport-expansion.js's state.vehicles, §12) by id - fleet size and
// on-screen count come from what the player actually bought, not a formula.
// Position, passengers and revenue all come from the same persistent vehicle
// progress in transport-expansion.js. This layer only projects that state to
// a sprite; it never runs a second visual-only vehicle clock.

const TRANSPORT_VISUAL_CONFIG = Object.freeze({
  maxManagedVehicles: 48,
  zoomMin: 1.4,
  overlayRefreshMs: 200,
  // §1 restore: fraction of a stop-adjacent leg spent easing rather than at
  // cruise speed - OpenTTD-style slow-in/slow-out around a dwell, purely a
  // render-time remap of the backend's linear progress (never touches
  // advanceTransportVehiclesByGameDays's timing, so game-speed economics are
  // unaffected).
  stopEaseFraction: 0.3,
  fareFloatRiseY: 30,
  fareFloatDurationMs: 900,
});

function transportEaseInQuad(t) { return t * t; }
function transportEaseOutQuad(t) { const inv = 1 - t; return 1 - inv * inv; }

// Remaps a leg's linear 0..1 progress so a vehicle decelerates into a stop
// tile at the end of its leg and/or accelerates away from one at the start -
// whichever ends of *this specific tile hop* actually touch a route stop.
// Most hops touch neither end and pass through unchanged (current behaviour).
function getTransportLegVisualProgress(progress, departingStop, approachingStop) {
  const t = Math.min(1, Math.max(0, Number(progress) || 0));
  const ease = TRANSPORT_VISUAL_CONFIG.stopEaseFraction;
  if (departingStop && t < ease) return transportEaseInQuad(t / ease) * ease;
  if (approachingStop && t > 1 - ease) {
    const local = (t - (1 - ease)) / ease;
    return (1 - ease) + transportEaseOutQuad(local) * ease;
  }
  return t;
}

// A stop's tile only ever appears at the two ends of a leg (the tile-by-tile
// path is built stop-to-stop), so a plain row/col match against every stop on
// the route is enough to tell whether *this* hop's near/far tile is a stop -
// no need to re-derive the cycle's stop indices here.
function getTransportRouteStopTileKeySet(route) {
  const keys = new Set();
  if (!route || typeof getTransportStopById !== 'function') return keys;
  (route.stopIds || []).forEach((stopId) => {
    const stop = getTransportStopById(stopId);
    if (stop) keys.add(`${stop.row},${stop.col}`);
  });
  return keys;
}

function updateTransportVehicleLegStopFlags(vehicle) {
  const keys = getTransportRouteStopTileKeySet(vehicle.route);
  vehicle.departingStop = keys.has(`${vehicle.current.row},${vehicle.current.col}`);
  vehicle.approachingStop = keys.has(`${vehicle.next.row},${vehicle.next.col}`);
}

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

function createManagedTransportVehicle(scene, route, runtime, model, vehicleId, lineNumber) {
  const cycle = runtime.roundTripPath;
  if (!Array.isArray(cycle) || cycle.length < 2) return null;
  const backing = getTransportExpansionState().vehicles.find((entry) => entry.id === vehicleId);
  const backingPosition = typeof getTransportVehiclePathPosition === 'function'
    ? getTransportVehiclePathPosition(backing, route, runtime)
    : null;
  const currentIndex = backingPosition?.currentIndex ?? 0;
  const progress = backingPosition?.progress ?? 0;
  const previous = cycle[(currentIndex - 1 + cycle.length) % cycle.length];
  const current = cycle[currentIndex];
  const next = cycle[(currentIndex + 1) % cycle.length];
  const sprite = scene.add.image(0, 0, model.directions.ne.key);
  addToRenderLayer(scene, sprite, 'objectLayer');
  sprite.setOrigin(model.originX, model.originY);
  sprite.setScale(model.scale);
  sprite.setMask(scene.worldMask);
  sprite.setInteractive({ cursor: 'pointer' });
  sprite.on('pointerdown', (pointer) => {
    if (typeof isTransportModeActive === 'undefined' || !isTransportModeActive) return;
    if (typeof openTransportVehicleInspector === 'function') openTransportVehicleInspector(vehicleId, pointer);
  });
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
    id: `managed:${vehicleId}`,
    vehicleId,
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
    departingStop: false,
    approachingStop: false,
    lastSeenRevenueSerial: backing?.tripRevenueSerial || 0,
    renderedProgress: 0,
  };
  updateTransportVehicleLegStopFlags(vehicle);
  vehicle.renderedProgress = getTransportLegVisualProgress(progress, vehicle.departingStop, vehicle.approachingStop);
  if (typeof markVehicleTrackerDynamicObject === 'function') {
    markVehicleTrackerDynamicObject(sprite);
    markVehicleTrackerDynamicObject(badge);
  }
  setManagedTransportVehicleVisual(vehicle, evaluateTrafficLeg(vehicle.leg, vehicle.renderedProgress), true);
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

// Which real vehicles should currently have a sprite: assigned to an active
// route, and either actually moving ('active') or visibly stalled
// ('broken_down' - frozen in place, not hidden). Parked/servicing/returning
// vehicles are conceptually off-network and have no sprite.
function getTransportVisibleVehicleIds(routeEntries) {
  const ids = [];
  for (const { route, runtime } of routeEntries) {
    if (runtime.status !== 'active' || !Array.isArray(runtime.roundTripPath) || runtime.roundTripPath.length < 2) continue;
    const vehicles = typeof getTransportRouteVehicles === 'function' ? getTransportRouteVehicles(route.id) : [];
    for (const vehicle of vehicles) {
      if (vehicle.status === 'active' || vehicle.status === 'broken_down') ids.push(vehicle.id);
    }
  }
  return ids;
}

// Incremental sync, not a rebuild-on-any-change: a sprite persists across
// frames as long as its backing vehicle stays visible, only ever
// created/destroyed when a vehicle actually becomes/stops being eligible
// (bought, sold, assigned, route breaks, etc.) - promoted from the old
// formula-driven full-rebuild-on-signature-change (§13).
function syncManagedTransportVehicles(scene, state, routeEntries, vehicleById) {
  const runtimeByRoute = new Map(routeEntries.map((entry) => [entry.route.id, entry]));
  // A tracked bus keeps its real shared sprite even if it falls beyond the
  // ordinary fleet cap. Tracker cameras render this same object; they never
  // construct a private visual clone.
  const trackedIds = typeof getTrackedVehicleIds === 'function'
    ? getTrackedVehicleIds(scene, 'transport')
    : [];
  const visibleIds = new Set([
    ...trackedIds,
    ...getTransportVisibleVehicleIds(routeEntries),
  ].slice(0, TRANSPORT_VISUAL_CONFIG.maxManagedVehicles + trackedIds.length));

  for (let index = state.vehicles.length - 1; index >= 0; index--) {
    const visual = state.vehicles[index];
    if (!visibleIds.has(visual.vehicleId)) {
      destroyManagedTransportVehicle(visual);
      state.vehicles.splice(index, 1);
    }
  }

  const models = getTransportBusModels(scene);
  if (models.length === 0) return;
  const existingIds = new Set(state.vehicles.map((visual) => visual.vehicleId));
  let modelCursor = state.vehicles.length;
  for (const vehicleId of visibleIds) {
    if (existingIds.has(vehicleId)) continue;
    const vehicleEntity = vehicleById.get(vehicleId);
    const entry = vehicleEntity ? runtimeByRoute.get(vehicleEntity.routeId) : null;
    if (!entry) continue;
    const model = models[modelCursor % models.length];
    modelCursor++;
    const lineNumber = routeEntries.findIndex((candidate) => candidate.route.id === entry.route.id) + 1;
    const visual = createManagedTransportVehicle(scene, entry.route, entry.runtime, model, vehicleId, lineNumber);
    if (visual) state.vehicles.push(visual);
  }
  if (scene.trafficVisualState) scene.trafficVisualState.dirty = true;
}

// Restores minimum following distance without ever touching the backend's
// own timing: scans other bus visuals and ambient traffic sharing this exact
// tile-to-tile leg for one ahead of us, using the SAME headway rule
// traffic-visuals.js applies to ordinary vehicles (getTrafficLeaderEffectiveProgress/
// TRAFFIC_VISUAL_CONFIG.minimumHeadwayTiles), so buses and cars read as one
// shared traffic stream instead of two that ignore each other. Returns the
// furthest progress this vehicle may render at this frame, or null if clear.
// leaderBuckets groups every transport + ambient-traffic vehicle by its
// current->next leg (see traffic-visuals.js's buildTrafficLegBuckets/
// trafficLegBucketKey, shared globally) so this only ever compares against
// vehicles that could plausibly block us, instead of the full transport +
// traffic vehicle lists every frame per managed vehicle.
function findTransportVisualLeaderCeiling(scene, vehicle, leaderBuckets) {
  const current = vehicle.current;
  const next = vehicle.next;
  if (!current || !next || typeof getTrafficLeaderEffectiveProgress !== 'function') return null;
  const bucket = leaderBuckets.get(trafficLegBucketKey(current, next));
  if (!bucket) return null;
  let ceiling = null;
  for (const other of bucket) {
    if (other === vehicle) continue;
    const leaderProgress = getTrafficLeaderEffectiveProgress(other);
    if (!(leaderProgress > vehicle.renderedProgress)) continue;
    const gap = TRAFFIC_VISUAL_CONFIG.minimumHeadwayTiles * Math.max(vehicle.model.headwayFactor, other.model.headwayFactor);
    const candidate = leaderProgress - gap;
    if (ceiling === null || candidate < ceiling) ceiling = candidate;
  }
  return ceiling;
}

function syncManagedTransportVehiclePosition(scene, vehicle, backing, leaderBuckets) {
  const target = typeof getTransportVehiclePathPosition === 'function'
    ? getTransportVehiclePathPosition(backing, vehicle.route, vehicle.runtime)
    : null;
  if (!target) return;
  vehicle.cycle = target.path;
  const legChanged = vehicle.currentIndex !== target.currentIndex;
  if (legChanged) {
    vehicle.currentIndex = target.currentIndex;
    vehicle.previous = vehicle.cycle[
      (vehicle.currentIndex - 1 + vehicle.cycle.length) % vehicle.cycle.length
    ];
    vehicle.current = vehicle.cycle[vehicle.currentIndex];
    vehicle.next = vehicle.cycle[(vehicle.currentIndex + 1) % vehicle.cycle.length];
    vehicle.leg = createTrafficLeg(scene, vehicle.previous, vehicle.current, vehicle.next);
    updateTransportVehicleLegStopFlags(vehicle);
  }
  vehicle.progress = target.progress;
  const desiredProgress = getTransportLegVisualProgress(vehicle.progress, vehicle.departingStop, vehicle.approachingStop);
  if (legChanged) {
    // A fresh tile hop starts clean - lag from the previous leg's spacing
    // does not carry forward into a leg where no leader has been checked yet.
    vehicle.renderedProgress = desiredProgress;
  } else {
    const ceiling = findTransportVisualLeaderCeiling(scene, vehicle, leaderBuckets);
    let allowed = ceiling === null ? desiredProgress : Math.min(desiredProgress, ceiling);
    if (allowed < vehicle.renderedProgress) allowed = vehicle.renderedProgress;
    if (allowed > desiredProgress) allowed = desiredProgress;
    vehicle.renderedProgress = Math.min(1, Math.max(0, allowed));
  }
  setManagedTransportVehicleVisual(vehicle, evaluateTrafficLeg(vehicle.leg, vehicle.renderedProgress));
}

// §4 restore: OpenTTD-style floating fare readout - a small green "+$X" that
// rises and fades where a bus just earned money, fired once per dwell event
// (tripRevenueSerial) rather than by polling the dollar amount, so two
// dwells that happen to earn the identical amount still both show.
function spawnTransportFareFloatText(scene, x, y, amount, depth) {
  if (!scene?.add?.text || !(amount > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const text = scene.add.text(x, y, `+$${Math.round(amount)}`, {
    fontFamily: 'Arial, sans-serif',
    fontSize: '12px',
    fontStyle: 'bold',
    color: '#3ddc5a',
    stroke: '#0b2612',
    strokeThickness: 3,
  });
  addToRenderLayer(scene, text, 'effectLayer');
  text.setOrigin(0.5, 1);
  text.setDepth((Number.isFinite(depth) ? depth : 0) + 1);
  text.setMask(scene.worldMask);
  if (typeof markVehicleTrackerDynamicObject === 'function') markVehicleTrackerDynamicObject(text);
  scene.tweens?.add({
    targets: text,
    y: y - TRANSPORT_VISUAL_CONFIG.fareFloatRiseY,
    alpha: 0,
    duration: TRANSPORT_VISUAL_CONFIG.fareFloatDurationMs,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}

function checkTransportVehicleFareFloat(scene, vehicle, backing) {
  const serial = backing?.tripRevenueSerial || 0;
  if (vehicle.lastSeenRevenueSerial === undefined) {
    vehicle.lastSeenRevenueSerial = serial;
    return;
  }
  if (serial === vehicle.lastSeenRevenueSerial) return;
  vehicle.lastSeenRevenueSerial = serial;
  if (backing.tripRevenueAccrued > 0 && vehicle.sprite?.active !== false) {
    spawnTransportFareFloatText(
      scene,
      vehicle.sprite.x,
      vehicle.sprite.y,
      backing.tripRevenueAccrued,
      vehicle.badge?.depth,
    );
  }
}

function ensureTransportRouteGraphic(scene, state) {
  if (state.routeGraphic) return state.routeGraphic;
  const graphic = scene.add.graphics();
  graphic.vehicleTrackerUiOverlay = true;
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
  // Queue revision changes both at each daily arrival and at an actual bus
  // boarding, so the badge refreshes immediately instead of only at midnight.
  const queueRevision = typeof getTransportQueueRevision === 'function'
    ? getTransportQueueRevision()
    : 0;
  return `${mapRotation}:${getTransportVisualSignature(routeEntries)}:${editorStops}:${queueRevision}`;
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
  const queueLabeledStopIds = new Set();
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
      label.vehicleTrackerUiOverlay = true;
      addToRenderLayer(scene, label, 'effectLayer');
      label.setOrigin(0.5, 0.5);
      label.setDepth(getPreviewOverlayDepth(3));
      label.setMask(scene.worldMask);
      state.stopLabels.push(label);

      // §7: visible passenger queue - one badge per stop even if served by
      // several routes (queueLabeledStopIds dedupes across the outer loop).
      if (queueLabeledStopIds.has(stop.id)) return;
      queueLabeledStopIds.add(stop.id);
      const waiting = typeof getTransportStopWaitingCount === 'function'
        ? getTransportStopWaitingCount(stop.id)
        : 0;
      if (waiting <= 0) return;
      const queueLabel = scene.add.text(point.x, point.y - 13, `👤${waiting}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '9px',
        fontStyle: 'bold',
        color: '#2a2118',
        backgroundColor: '#ffe9a8',
        padding: { x: 3, y: 1 },
      });
      queueLabel.vehicleTrackerUiOverlay = true;
      addToRenderLayer(scene, queueLabel, 'effectLayer');
      queueLabel.setOrigin(0.5, 1);
      queueLabel.setDepth(getPreviewOverlayDepth(3));
      queueLabel.setMask(scene.worldMask);
      state.stopLabels.push(queueLabel);
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
    label.vehicleTrackerUiOverlay = true;
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
  const trackerNeedsSprites = typeof hasActiveVehicleTrackers === 'function'
    && hasActiveVehicleTrackers(scene, 'transport');
  const zoomReady = scene.cameras.main.zoom >= TRANSPORT_VISUAL_CONFIG.zoomMin || trackerNeedsSprites;
  const terrainMode = typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode;
  if (!visible || !zoomReady || terrainMode || routeEntries.length === 0) {
    if (state.vehicles.length > 0) clearManagedTransportVehicles(state);
    state.dirty = true;
    return;
  }
  const allVehicles = getTransportExpansionState().vehicles;
  const vehicleById = new Map(allVehicles.map((entry) => [entry.id, entry]));
  syncManagedTransportVehicles(scene, state, routeEntries, vehicleById);
  const showRouteMarkers = typeof isTransportRouteOverlayRequested === 'function'
    && isTransportRouteOverlayRequested();
  state.vehicles.forEach((vehicle) => vehicle.badge?.setVisible?.(showRouteMarkers));
  if (state.vehicles.length === 0) return;
  const leaderBuckets = buildTrafficLegBuckets([
    ...state.vehicles,
    ...(scene.trafficVisualState?.vehicles || []),
  ]);
  state.vehicles.forEach((vehicle) => {
    const backing = vehicleById.get(vehicle.vehicleId);
    if (!backing) return;
    syncManagedTransportVehiclePosition(scene, vehicle, backing, leaderBuckets);
    checkTransportVehicleFareFloat(scene, vehicle, backing);
    if (backing?.status === 'broken_down') {
      // Frozen in place (§12's lightweight breakdown model) - a stalled bus
      // doesn't advance, it just visibly sits there until it self-recovers.
      vehicle.sprite.setTint(0xd45a5a);
      return;
    }
    vehicle.sprite.clearTint();
  });
}

const transportVisualTestApi = {
  TRANSPORT_VISUAL_CONFIG,
  transportHexToNumber,
  getTransportVisualSignature,
};

if (typeof module !== 'undefined' && module.exports) module.exports = transportVisualTestApi;
