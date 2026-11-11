// Touch input for the map canvas (touch UI profile only).
//
// One controller owns every finger that lands on the canvas: one finger pans, two or more
// fingers zoom and pan together, a short still touch is a tap. Nothing here builds, spends or
// edits the city - a tap is only announced as a 'heungshing:maptap' event for the build
// session that arrives in Phase B (docs/mobile-ui-work-plan.md).
//
// Invariants (mobile spec §7):
//  - a pointer id is tracked, never a mouse pointer mixed into a pinch;
//  - pointerup is never a commit: pointercancel, lost capture, blur, hiding the page, rotation,
//    a profile switch and a panel taking input all cancel and clear;
//  - when a pinch drops to one finger, the finger left behind is inert until every finger lifts.

const MAP_TOUCH_TAP_MAX_MOVE_PX = 8;
const MAP_TOUCH_TAP_MAX_MS = 300;

// Phaser 3.60 BaseCamera.getWorldPoint with no rotation and the camera at 0,0:
//   world = scroll + origin + (screen - origin) / zoom,  origin = camera size * originX/Y.
// (The camera zooms about its origin, which is the centre unless set otherwise.)
function mapCameraOrigin(camera) {
  const originX = Number.isFinite(camera?.originX) ? camera.originX : 0.5;
  const originY = Number.isFinite(camera?.originY) ? camera.originY : 0.5;
  return { x: (Number(camera?.width) || 0) * originX, y: (Number(camera?.height) || 0) * originY };
}

function mapCameraWorldPoint(camera, screenX, screenY, zoom = camera.zoom) {
  const origin = mapCameraOrigin(camera);
  return {
    x: camera.scrollX + origin.x + (screenX - origin.x) / zoom,
    y: camera.scrollY + origin.y + (screenY - origin.y) / zoom,
  };
}

// The scroll that puts the world point (worldX, worldY) under the screen point at this zoom.
function mapCameraScrollForAnchor(camera, zoom, screenX, screenY, worldX, worldY) {
  const origin = mapCameraOrigin(camera);
  return {
    x: worldX - origin.x - (screenX - origin.x) / zoom,
    y: worldY - origin.y - (screenY - origin.y) / zoom,
  };
}

// Centroid and spread of a set of points; for two points the spread is their distance.
function mapTouchMetrics(points) {
  const count = points.length;
  let cx = 0;
  let cy = 0;
  points.forEach((point) => { cx += point.x; cy += point.y; });
  cx /= count;
  cy /= count;
  let spread = 0;
  points.forEach((point) => { spread += Math.hypot(point.x - cx, point.y - cy); });
  return { x: cx, y: cy, distance: (spread / count) * 2 };
}

function createMapInputController(callbacks = {}, options = {}) {
  const tapMaxMovePx = options.tapMaxMovePx ?? MAP_TOUCH_TAP_MAX_MOVE_PX;
  const tapMaxMs = options.tapMaxMs ?? MAP_TOUCH_TAP_MAX_MS;
  const now = options.now ?? (() => Date.now());
  const emit = (name, payload) => { if (typeof callbacks[name] === 'function') callbacks[name](payload); };

  const pointers = new Map();
  let state = 'idle'; // idle | tapCandidate | pan | pinch | settling | uiCaptured
  let uiCaptured = false;
  let pinchBase = null; // { distance }  (re-based whenever the finger count changes)

  function allPoints() {
    return [...pointers.values()].map((pointer) => ({ x: pointer.x, y: pointer.y }));
  }

  function startPinch() {
    const metrics = mapTouchMetrics(allPoints());
    pinchBase = { distance: Math.max(1, metrics.distance) };
    state = 'pinch';
    emit('onPinchStart', { x: metrics.x, y: metrics.y });
  }

  function endActiveGesture() {
    if (state === 'pan') emit('onPanEnd');
    if (state === 'pinch') emit('onPinchEnd');
    pinchBase = null;
  }

  function pointerDown(id, x, y) {
    if (uiCaptured) return false;
    if (pointers.has(id)) return true;
    pointers.set(id, { startX: x, startY: y, x, y, startTime: now() });
    if (state === 'settling') return true; // a finger is already inert; so is the new one
    if (pointers.size === 1) {
      state = 'tapCandidate';
      return true;
    }
    // A second (or third...) finger: the touch is no longer a tap or a pan.
    if (state === 'pan') emit('onPanEnd');
    if (state === 'pinch') emit('onPinchEnd');
    startPinch();
    return true;
  }

  function pointerMove(id, x, y) {
    const pointer = pointers.get(id);
    if (!pointer || uiCaptured) return false;
    const previousX = pointer.x;
    const previousY = pointer.y;
    pointer.x = x;
    pointer.y = y;
    if (state === 'tapCandidate') {
      if (Math.hypot(x - pointer.startX, y - pointer.startY) <= tapMaxMovePx) return true;
      state = 'pan';
      emit('onPanStart', { x: pointer.startX, y: pointer.startY });
      // catch up to the finger so the map stays under it
      emit('onPan', { dx: x - pointer.startX, dy: y - pointer.startY, x, y });
      return true;
    }
    if (state === 'pan') {
      emit('onPan', { dx: x - previousX, dy: y - previousY, x, y });
      return true;
    }
    if (state === 'pinch') {
      const metrics = mapTouchMetrics(allPoints());
      emit('onPinch', { x: metrics.x, y: metrics.y, scale: metrics.distance / pinchBase.distance });
      return true;
    }
    return true; // settling: tracked, inert
  }

  function pointerUp(id, x, y) {
    const pointer = pointers.get(id);
    if (!pointer) return false;
    if (Number.isFinite(x)) pointer.x = x;
    if (Number.isFinite(y)) pointer.y = y;
    const wasState = state;
    pointers.delete(id);

    if (wasState === 'tapCandidate') {
      const moved = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
      if (moved <= tapMaxMovePx && now() - pointer.startTime <= tapMaxMs) {
        emit('onTap', { x: pointer.x, y: pointer.y });
      }
      state = 'idle';
    } else if (wasState === 'pan') {
      emit('onPanEnd');
      state = 'idle';
    } else if (wasState === 'pinch') {
      emit('onPinchEnd');
      pinchBase = null;
      if (pointers.size >= 2) startPinch();   // 3+ fingers -> still pinching: re-base, no jump
      else state = pointers.size === 1 ? 'settling' : 'idle';
    }
    if (pointers.size === 0) state = 'idle';
    return true;
  }

  // The browser took the pointer away (pointercancel / lost capture): drop the gesture and
  // wait for any other finger to lift before a new gesture can begin.
  function pointerCancel(id) {
    if (!pointers.has(id)) return false;
    const wasState = state;
    pointers.delete(id);
    if (wasState === 'pan' || wasState === 'pinch') endActiveGesture();
    state = pointers.size > 0 ? 'settling' : 'idle';
    emit('onCancel', { reason: 'pointercancel' });
    return true;
  }

  // Blur, page hidden, rotation, profile switch, panel took over: forget every finger.
  function cancelAll(reason = 'cancel') {
    const hadGesture = state !== 'idle' || pointers.size > 0;
    endActiveGesture();
    pointers.clear();
    state = 'idle';
    if (hadGesture) emit('onCancel', { reason });
  }

  function setUiCaptured(captured) {
    const next = !!captured;
    if (next === uiCaptured) return;
    uiCaptured = next;
    if (next) cancelAll('ui');
  }

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    cancelAll,
    setUiCaptured,
    getState: () => (uiCaptured ? 'uiCaptured' : state),
    getPointerCount: () => pointers.size,
  };
}

// ── Wiring to the Phaser scene ───────────────────────────────────────────────

function installMapTouchInput(scene) {
  if (scene.mapTouchInput) return scene.mapTouchInput;
  const container = document.getElementById('game-container');
  if (!container || typeof isTouchUiProfile !== 'function') return null;

  const camera = scene.cameras.main;
  const toGame = (event) => ({
    x: scene.scale.transformX(event.pageX),
    y: scene.scale.transformY(event.pageY),
  });
  const ownsEvent = (event) => isTouchUiProfile()
    && event.target?.tagName === 'CANVAS'
    && (event.pointerType === undefined || event.pointerType === 'touch');

  let pinch = null; // { zoom, worldX, worldY, pending, frame }

  function flushPinch() {
    if (!pinch) return;
    pinch.frame = 0;
    const move = pinch.pending;
    if (!move) return;
    pinch.pending = null;
    const zoom = clampMapZoom(pinch.zoom * move.scale);
    camera.setZoom(zoom);
    const scroll = mapCameraScrollForAnchor(camera, zoom, move.x, move.y, pinch.worldX, pinch.worldY);
    camera.scrollX = scroll.x;
    camera.scrollY = scroll.y;
    onMapViewChanged(scene);
  }

  function endPinch() {
    if (!pinch) return;
    if (pinch.frame) window.cancelAnimationFrame(pinch.frame);
    flushPinch();
    pinch = null;
  }

  const controller = createMapInputController({
    onPan({ dx, dy }) {
      camera.scrollX -= dx / camera.zoom;
      camera.scrollY -= dy / camera.zoom;
      updateTerrainViewportCulling(scene);
    },
    onPinchStart({ x, y }) {
      endPinch();
      const world = mapCameraWorldPoint(camera, x, y);
      pinch = { zoom: camera.zoom, worldX: world.x, worldY: world.y, pending: null, frame: 0 };
    },
    onPinch(move) {
      if (!pinch) return;
      pinch.pending = move;
      // one camera update per frame, however many move events arrive
      if (!pinch.frame) pinch.frame = window.requestAnimationFrame(flushPinch);
    },
    onPinchEnd: endPinch,
    onCancel({ reason }) {
      endPinch();
      document.dispatchEvent(new CustomEvent('heungshing:mapcancel', { detail: { reason } }));
    },
    onTap({ x, y }) {
      document.dispatchEvent(new CustomEvent('heungshing:maptap', { detail: { x, y } }));
    },
  });

  const tracked = new Set();

  container.addEventListener('pointerdown', (event) => {
    if (!ownsEvent(event)) return;
    event.preventDefault(); // also stops the browser sending compatibility mouse events
    const point = toGame(event);
    if (controller.pointerDown(event.pointerId, point.x, point.y)) {
      tracked.add(event.pointerId);
      try { event.target.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    }
  }, true);
  container.addEventListener('pointermove', (event) => {
    if (!tracked.has(event.pointerId)) return;
    const point = toGame(event);
    controller.pointerMove(event.pointerId, point.x, point.y);
  }, true);
  const finish = (event) => {
    if (!tracked.has(event.pointerId)) return;
    tracked.delete(event.pointerId);
    if (event.type === 'pointercancel') {
      controller.pointerCancel(event.pointerId);
    } else {
      const point = toGame(event);
      controller.pointerUp(event.pointerId, point.x, point.y);
    }
  };
  container.addEventListener('pointerup', finish, true);
  container.addEventListener('pointercancel', finish, true);
  container.addEventListener('lostpointercapture', (event) => {
    if (!tracked.has(event.pointerId)) return;
    tracked.delete(event.pointerId);
    controller.pointerCancel(event.pointerId);
  }, true);

  // Phaser reads touches from touch events: while the touch UI owns the canvas, keep them from
  // reaching it, so no tool, vehicle tracker or sign handler can fire from a finger.
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((type) => {
    container.addEventListener(type, (event) => {
      if (!isTouchUiProfile() || event.target?.tagName !== 'CANVAS') return;
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
    }, { capture: true, passive: false });
  });
  container.addEventListener('contextmenu', (event) => {
    if (isTouchUiProfile()) event.preventDefault();
  });

  const cancel = (reason) => () => { tracked.clear(); controller.cancelAll(reason); };
  window.addEventListener('blur', cancel('blur'));
  window.addEventListener('orientationchange', cancel('orientation'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { tracked.clear(); controller.cancelAll('hidden'); }
  });
  document.addEventListener('uiprofilechange', cancel('profile'));

  scene.mapTouchInput = { controller };
  return scene.mapTouchInput;
}
