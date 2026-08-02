// Airport flight-route calibrator (test-branch-only dev tool).
//
// Vessel/harbor calibration (visual-route-calibrator.js) drags one sprite at
// a time through named "slot" variants of the same thing (which harbor
// orientation a docked ship happens to be in — auto-detected, not chosen).
// A flight route is a different shape of problem: 7 independent points that
// together define one route for one static building, placed all at once.
// This reuses the generic, non-vessel-specific pieces of
// visual-route-calibrator.js (clipboard copy, rounding, the test-mode gate,
// the shared input depth) but drives its own multi-marker drag session
// instead of the single-sprite one.

const AIRPORT_ROUTE_CALIBRATION_SCHEMA_VERSION = 1;
const AIRPORT_ROUTE_CALIBRATION_STORAGE_KEY = 'cityBuilder.airportRouteCalibration.v1';
const AIRPORT_ROUTE_POINT_DEFS = Object.freeze([
  Object.freeze({ key: 'landStart', label: '降落跑道開始點', short: 'L1' }),
  Object.freeze({ key: 'landEnd', label: '降落跑道結束點', short: 'L2' }),
  Object.freeze({ key: 'gate1', label: '第一停泊位置', short: 'G1' }),
  Object.freeze({ key: 'gate2', label: '第二停泊位置', short: 'G2' }),
  Object.freeze({ key: 'gate3', label: '第三停泊位置', short: 'G3' }),
  Object.freeze({ key: 'takeoffStart', label: '起飛跑道開始點', short: 'T1' }),
  Object.freeze({ key: 'liftoff', label: '飛機開始離地點', short: 'T2' }),
]);
const AIRPORT_ROUTE_MARKER_COLORS = Object.freeze({
  landStart: 0x4fd1ff,
  landEnd: 0x4fd1ff,
  gate1: 0xffd15a,
  gate2: 0xffd15a,
  gate3: 0xffd15a,
  takeoffStart: 0x7ce8a8,
  liftoff: 0x7ce8a8,
});
const airportRouteCalibrationSessions = new WeakMap();
// Which livery previews at each marker - purely cosmetic, doesn't affect the
// exported data. Clicking a marker (without dragging) cycles its facing
// through this order (90° clockwise each click, screen-space diagonals).
const AIRPORT_ROUTE_PREVIEW_LIVERY = 'cathy';
const AIRPORT_ROUTE_DIRECTION_CYCLE = Object.freeze(['ne', 'se', 'sw', 'nw']);
const AIRPORT_ROUTE_DEFAULT_DIRECTION = 'se';

// ── Pure logic (unit-testable without a DOM/Phaser scene) ─────────────────────

function getNextAirportMarkerDirection(direction) {
  const index = AIRPORT_ROUTE_DIRECTION_CYCLE.indexOf(direction);
  return AIRPORT_ROUTE_DIRECTION_CYCLE[(index + 1) % AIRPORT_ROUTE_DIRECTION_CYCLE.length];
}

// The real aircraft sprites (aircraft-visuals.js) load lazily on first flight
// - if a player opens this calibrator before ever seeing one, the bundle may
// not be ready yet. Markers fall back to a plain circle until it is.
function airportRouteAircraftPreviewIsReady(scene) {
  return typeof aircraftBundleIsReady === 'function' && aircraftBundleIsReady(scene);
}

function getAirportRouteAircraftTextureKey(direction) {
  return typeof getAircraftTextureKey === 'function'
    ? getAircraftTextureKey(AIRPORT_ROUTE_PREVIEW_LIVERY, direction)
    : null;
}

function getDefaultAirportRoutePoints(anchor = {}) {
  const footprintCols = Math.max(1, Number(anchor.footprintCols) || 12);
  const footprintRows = Math.max(1, Number(anchor.footprintRows) || 12);
  const colAt = (fraction) => Math.min(footprintCols - 1, Math.max(0, Math.round(fraction * (footprintCols - 1))));
  const rowAt = (fraction) => Math.min(footprintRows - 1, Math.max(0, Math.round(fraction * (footprintRows - 1))));
  // Two parallel lines (landing runway near one edge, takeoff runway near the
  // opposite edge, reversed) plus three gates in between. Just a starting
  // layout — every point gets dragged onto the real art by eye.
  return {
    landStart: { dRow: rowAt(0.1), dCol: colAt(0.1) },
    landEnd: { dRow: rowAt(0.1), dCol: colAt(0.85) },
    gate1: { dRow: rowAt(0.45), dCol: colAt(0.25) },
    gate2: { dRow: rowAt(0.45), dCol: colAt(0.5) },
    gate3: { dRow: rowAt(0.45), dCol: colAt(0.75) },
    takeoffStart: { dRow: rowAt(0.9), dCol: colAt(0.85) },
    liftoff: { dRow: rowAt(0.9), dCol: colAt(0.1) },
  };
}

// The route actually flying right now (aircraft-route-metadata.js), reached
// through the same accessor aircraft-visuals.js uses. The calibrator opens
// showing THIS, not the generic starting layout or a possibly-stale
// browser-storage draft from an earlier session - every drag should start
// from what the player is actually seeing in the game, not from whatever
// this browser profile happened to have lying around.
function getShippedAirportRoutePoints(anchor) {
  const pointsByKey = typeof getAircraftRouteMetadata === 'function' ? getAircraftRouteMetadata()?.pointsByKey : null;
  const defaults = getDefaultAirportRoutePoints(anchor);
  const points = {};
  AIRPORT_ROUTE_POINT_DEFS.forEach(({ key }) => {
    const shipped = pointsByKey?.[key];
    const dRow = Number(shipped?.dRow);
    const dCol = Number(shipped?.dCol);
    const hasShipped = Number.isFinite(dRow) && Number.isFinite(dCol);
    points[key] = {
      dRow: hasShipped ? dRow : defaults[key].dRow,
      dCol: hasShipped ? dCol : defaults[key].dCol,
      direction: AIRPORT_ROUTE_DIRECTION_CYCLE.includes(shipped?.direction)
        ? shipped.direction
        : AIRPORT_ROUTE_DEFAULT_DIRECTION,
    };
  });
  return points;
}

function buildAirportRouteCalibrationRecord(session, recordedAt = new Date().toISOString()) {
  const anchor = session?.anchor;
  const anchorRow = Number(anchor?.row);
  const anchorCol = Number(anchor?.col);
  if (!Number.isFinite(anchorRow) || !Number.isFinite(anchorCol)) return null;
  const points = {};
  AIRPORT_ROUTE_POINT_DEFS.forEach(({ key }) => {
    const point = session.points?.[key];
    const row = Number(point?.row);
    const col = Number(point?.col);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    points[key] = {
      row: visualRouteCalibrationRound(row),
      col: visualRouteCalibrationRound(col),
      dRow: visualRouteCalibrationRound(row - anchorRow),
      dCol: visualRouteCalibrationRound(col - anchorCol),
      direction: AIRPORT_ROUTE_DIRECTION_CYCLE.includes(point.direction)
        ? point.direction
        : AIRPORT_ROUTE_DEFAULT_DIRECTION,
    };
  });
  return {
    schemaVersion: AIRPORT_ROUTE_CALIBRATION_SCHEMA_VERSION,
    kind: 'airport-flight-route',
    airportAnchor: { row: anchorRow, col: anchorCol },
    footprintCols: Math.max(1, Number(anchor.footprintCols) || 12),
    footprintRows: Math.max(1, Number(anchor.footprintRows) || 12),
    mapRotation: Number.isFinite(Number(session.mapRotation)) ? Number(session.mapRotation) : 0,
    points,
    recordedAt,
  };
}

function loadAirportRouteCalibrationRecord(storage = getVisualRouteCalibrationStorage()) {
  if (!storage?.getItem) return null;
  try {
    const parsed = JSON.parse(storage.getItem(AIRPORT_ROUTE_CALIBRATION_STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistAirportRouteCalibrationRecord(record, storage = getVisualRouteCalibrationStorage()) {
  if (!record || !storage?.setItem) return false;
  try {
    storage.setItem(AIRPORT_ROUTE_CALIBRATION_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function resolveAirportRoutePointsFromRecord(anchor, record) {
  const defaults = getShippedAirportRoutePoints(anchor);
  const points = {};
  AIRPORT_ROUTE_POINT_DEFS.forEach(({ key }) => {
    const saved = record?.points?.[key];
    const offset = (saved && Number.isFinite(Number(saved.dRow)) && Number.isFinite(Number(saved.dCol)))
      ? { dRow: Number(saved.dRow), dCol: Number(saved.dCol) }
      : defaults[key];
    const direction = AIRPORT_ROUTE_DIRECTION_CYCLE.includes(saved?.direction)
      ? saved.direction
      : defaults[key].direction;
    points[key] = { row: anchor.row + offset.dRow, col: anchor.col + offset.dCol, direction };
  });
  return points;
}

// ── Scene wiring ────────────────────────────────────────────────────────────

function getAirportRouteCalibrationSession(scene) {
  if (!scene) return null;
  let session = airportRouteCalibrationSessions.get(scene);
  if (!session) {
    session = {
      scene, active: false, anchor: null, mapRotation: 0, points: {}, markers: {}, polyline: null, panel: null,
    };
    airportRouteCalibrationSessions.set(scene, session);
  }
  return session;
}

function getAirportCalibrationWorldPoint(scene, row, col) {
  const iso = isoToScreen(col, row);
  return {
    x: iso.x + (Number(scene?.offsetX) || 0),
    y: iso.y + (Number(scene?.offsetY) || 0),
  };
}

function getAirportCalibrationLogicalPoint(scene, worldX, worldY) {
  const logical = typeof worldToLogicalPoint === 'function' ? worldToLogicalPoint(scene, worldX, worldY) : null;
  const row = Number(logical?.y);
  const col = Number(logical?.x);
  return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null;
}

function resolveAirportRouteCalibrationAnchor(scene) {
  const entries = typeof getBuildingFacilityEntries === 'function' ? getBuildingFacilityEntries('airport') : [];
  const placed = entries[0];
  if (placed) {
    return {
      row: placed.row,
      col: placed.col,
      footprintCols: Math.max(1, Number(placed.record?.footprintCols) || 12),
      footprintRows: Math.max(1, Number(placed.record?.footprintRows) || 12),
    };
  }
  // No airport placed yet (e.g. Terrain Creator / a fresh test city) — anchor
  // to whatever tile is currently under the camera center instead.
  const center = getCameraCenterWorld(scene);
  const logical = getAirportCalibrationLogicalPoint(scene, center.x, center.y);
  return {
    row: Math.round(logical?.row ?? 0),
    col: Math.round(logical?.col ?? 0),
    footprintCols: 12,
    footprintRows: 12,
  };
}

function destroyAirportRouteMarkers(session) {
  Object.values(session.markers || {}).forEach(({ visual, text }) => {
    visual?.destroy?.();
    text?.destroy?.();
  });
  session.markers = {};
  session.polyline?.destroy?.();
  session.polyline = null;
}

// Real aircraft sprite when the bundle's loaded (so gate/runway placement can
// be judged against how a plane actually looks there); a plain circle
// fallback otherwise. halfHeight feeds the label's vertical offset so it
// clears whichever visual got used.
function createAirportRouteMarkerVisual(scene, world, direction, key) {
  if (airportRouteAircraftPreviewIsReady(scene)) {
    const textureKey = getAirportRouteAircraftTextureKey(direction);
    if (textureKey) {
      const image = scene.add.image(world.x, world.y, textureKey);
      const scale = Number(AIRCRAFT_VISUAL_CONFIG?.aircraftScale) || 0.30;
      image.setOrigin?.(0.5, 0.5);
      image.setScale?.(scale);
      return { visual: image, isSprite: true, halfHeight: 128 * scale };
    }
  }
  const circle = scene.add.circle(world.x, world.y, 9, AIRPORT_ROUTE_MARKER_COLORS[key] ?? 0xffffff, 0.92);
  circle.setStrokeStyle?.(2, 0x0b1118, 0.9);
  return { visual: circle, isSprite: false, halfHeight: 9 };
}

function drawAirportRouteSegment(graphics, session, fromKey, toKey) {
  const from = session.points[fromKey];
  const to = session.points[toKey];
  if (!from || !to) return;
  const a = getAirportCalibrationWorldPoint(session.scene, from.row, from.col);
  const b = getAirportCalibrationWorldPoint(session.scene, to.row, to.col);
  graphics.beginPath();
  graphics.moveTo(a.x, a.y);
  graphics.lineTo(b.x, b.y);
  graphics.strokePath();
}

function updateAirportRoutePolyline(session) {
  const scene = session.scene;
  if (!session.polyline) {
    session.polyline = scene.add.graphics().setDepth(VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH - 1);
  }
  const graphics = session.polyline;
  graphics.clear();
  graphics.lineStyle(3, AIRPORT_ROUTE_MARKER_COLORS.landStart, 0.85);
  drawAirportRouteSegment(graphics, session, 'landStart', 'landEnd');
  graphics.lineStyle(3, AIRPORT_ROUTE_MARKER_COLORS.takeoffStart, 0.85);
  drawAirportRouteSegment(graphics, session, 'takeoffStart', 'liftoff');
}

function createAirportRouteMarkers(session) {
  const scene = session.scene;
  destroyAirportRouteMarkers(session);
  if (typeof requestAircraftBundle === 'function') requestAircraftBundle(scene);
  const bundlePending = !airportRouteAircraftPreviewIsReady(scene);

  AIRPORT_ROUTE_POINT_DEFS.forEach(({ key, short }) => {
    const point = session.points[key];
    if (!AIRPORT_ROUTE_DIRECTION_CYCLE.includes(point.direction)) point.direction = AIRPORT_ROUTE_DEFAULT_DIRECTION;
    const world = getAirportCalibrationWorldPoint(scene, point.row, point.col);
    const { visual, isSprite, halfHeight } = createAirportRouteMarkerVisual(scene, world, point.direction, key);
    visual.setDepth(VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH);
    const labelOffset = halfHeight + 4;
    const text = scene.add.text(world.x, world.y - labelOffset, short, {
      fontSize: '11px',
      fontFamily: 'ui-monospace, Menlo, monospace',
      color: '#eaf8ff',
      backgroundColor: 'rgba(5,18,31,0.75)',
      padding: { x: 3, y: 1 },
    });
    text.setOrigin(0.5, 1);
    text.setDepth(VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH);

    visual.setInteractive?.({ useHandCursor: true });
    scene.input?.setDraggable?.(visual, true);
    let dragMoved = false;
    visual.on('pointerdown', () => { dragMoved = false; });
    visual.on('drag', (pointer, dragX, dragY) => {
      dragMoved = true;
      visual.setPosition(dragX, dragY);
      text.setPosition(dragX, dragY - labelOffset);
      const logical = getAirportCalibrationLogicalPoint(scene, dragX, dragY);
      if (logical) {
        logical.direction = session.points[key]?.direction || AIRPORT_ROUTE_DEFAULT_DIRECTION;
        session.points[key] = logical;
      }
      updateAirportRoutePolyline(session);
      renderAirportRouteCalibratorPanel(session);
    });
    visual.on('dragend', () => {
      persistAirportRouteCalibrationRecord(buildAirportRouteCalibrationRecord(session));
      setAirportRouteCalibratorMessage(session, `${short} 已記錄`, 'success');
    });
    // A plain click (pointerdown -> pointerup with no drag in between) cycles
    // facing instead of moving - lets you preview which way the model should
    // point without needing a separate control per marker.
    visual.on('pointerup', () => {
      if (dragMoved) return;
      const current = session.points[key];
      current.direction = getNextAirportMarkerDirection(current.direction || AIRPORT_ROUTE_DEFAULT_DIRECTION);
      if (isSprite) {
        const textureKey = getAirportRouteAircraftTextureKey(current.direction);
        if (textureKey) visual.setTexture?.(textureKey);
      }
      persistAirportRouteCalibrationRecord(buildAirportRouteCalibrationRecord(session));
      setAirportRouteCalibratorMessage(session, `${short} 已轉向 ${current.direction.toUpperCase()}`, 'success');
      renderAirportRouteCalibratorPanel(session);
    });

    session.markers[key] = { visual, text, isSprite };
  });
  updateAirportRoutePolyline(session);

  // The bundle wasn't ready yet, so these are the circle fallback - swap in
  // the real sprites the moment it finishes loading, if the tool is still open.
  if (bundlePending) {
    scene.load?.once?.('complete', () => {
      if (session.active) createAirportRouteMarkers(session);
    });
  }
}

function startAirportRouteCalibrator(session) {
  const scene = session.scene;
  session.anchor = resolveAirportRouteCalibrationAnchor(scene);
  session.mapRotation = typeof mapRotation === 'number' ? mapRotation : 0;
  // Always the currently-shipped route, not a saved browser-storage draft
  // (see getShippedAirportRoutePoints) - opening the tool should show
  // exactly what's flying right now.
  session.points = resolveAirportRoutePointsFromRecord(session.anchor, null);
  session.active = true;
  createAirportRouteMarkers(session);
  createAirportRouteCalibratorPanel(session);
  renderAirportRouteCalibratorPanel(session);
  setAirportRouteCalibratorMessage(session, '拖曳 = 移動，撳一下 = 轉向 90°', 'info');
}

function teardownAirportRouteCalibrator(session) {
  session.active = false;
  destroyAirportRouteMarkers(session);
  if (session.panel?.root) session.panel.root.hidden = true;
}

function resetAirportRouteCalibratorPoints(session) {
  const defaults = getDefaultAirportRoutePoints(session.anchor);
  session.points = {};
  AIRPORT_ROUTE_POINT_DEFS.forEach(({ key }) => {
    const offset = defaults[key];
    session.points[key] = {
      row: session.anchor.row + offset.dRow,
      col: session.anchor.col + offset.dCol,
      direction: AIRPORT_ROUTE_DEFAULT_DIRECTION,
    };
  });
  createAirportRouteMarkers(session);
  renderAirportRouteCalibratorPanel(session);
  setAirportRouteCalibratorMessage(session, '已重設為預設佈局', 'info');
}

function toggleAirportRouteCalibrator(scene) {
  if (!scene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
    || !isVisualRouteCalibrationTestModeEnabled()) return false;
  const session = getAirportRouteCalibrationSession(scene);
  if (!session) return false;
  if (session.active) {
    teardownAirportRouteCalibrator(session);
    return false;
  }
  startAirportRouteCalibrator(session);
  return true;
}

// ── Panel ───────────────────────────────────────────────────────────────────

function createAirportRouteCalibratorPanel(session) {
  if (session.panel) return session.panel;
  if (typeof document === 'undefined' || !document.body) return null;
  if (!document.getElementById('airport-route-calibrator-style')) {
    const style = document.createElement('style');
    style.id = 'airport-route-calibrator-style';
    style.textContent = `
      #airport-route-calibrator-panel {
        position: fixed; left: 14px; bottom: 18px; z-index: 100000;
        width: min(300px, calc(100vw - 28px)); box-sizing: border-box; padding: 12px;
        border: 1px solid rgba(255, 209, 90, 0.72); border-radius: 12px;
        color: #fff7e6; background: rgba(31, 22, 5, 0.94);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        user-select: text; pointer-events: auto; backdrop-filter: blur(8px);
      }
      #airport-route-calibrator-panel[hidden] { display: none !important; }
      #airport-route-calibrator-panel .arc-title { font-weight: 800; color: #ffd15a; letter-spacing: .04em; margin-bottom: 8px; }
      #airport-route-calibrator-panel .arc-row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
      #airport-route-calibrator-panel .arc-row span:first-child { color: #e0c9a0; }
      #airport-route-calibrator-panel .arc-row span:last-child { color: #fff; }
      #airport-route-calibrator-panel .arc-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
      #airport-route-calibrator-panel button {
        border: 1px solid #a8823f; border-radius: 7px; padding: 6px 7px;
        color: #fff7e6; background: #4a3312; font: inherit; cursor: pointer;
      }
      #airport-route-calibrator-panel button:hover { background: #6b4b1c; }
      #airport-route-calibrator-panel .arc-message { min-height: 16px; margin-top: 7px; color: #d8c19a; }
      #airport-route-calibrator-panel .arc-message[data-tone="success"] { color: #7ce8a8; }
      #airport-route-calibrator-panel .arc-message[data-tone="error"] { color: #ff9a9a; }
    `;
    document.head.appendChild(style);
  }
  const root = document.createElement('section');
  root.id = 'airport-route-calibrator-panel';
  root.hidden = true;
  root.setAttribute('aria-label', 'Airport flight route calibrator');
  root.innerHTML = `
    <div class="arc-title">機場航線校正 · 7 點</div>
    <div class="arc-list"></div>
    <div class="arc-actions">
      <button type="button" data-action="reset">重設位置</button>
      <button type="button" data-action="copy">複製 JSON</button>
    </div>
    <div class="arc-message"></div>
  `;
  document.body.appendChild(root);
  const panel = {
    root,
    list: root.querySelector('.arc-list'),
    message: root.querySelector('.arc-message'),
  };
  root.querySelector('[data-action="reset"]').addEventListener('click', () => {
    resetAirportRouteCalibratorPoints(session);
  });
  root.querySelector('[data-action="copy"]').addEventListener('click', () => {
    const record = buildAirportRouteCalibrationRecord(session);
    if (!record) return;
    copyVisualRouteCalibrationText(JSON.stringify(record, null, 2))
      .then(() => setAirportRouteCalibratorMessage(session, 'JSON 已複製', 'success'))
      .catch(() => setAirportRouteCalibratorMessage(session, '複製失敗', 'error'));
  });
  session.panel = panel;
  return panel;
}

function setAirportRouteCalibratorMessage(session, text, tone = 'info') {
  if (!session.panel) return;
  session.panel.message.textContent = String(text || '');
  session.panel.message.dataset.tone = tone;
}

function renderAirportRouteCalibratorPanel(session) {
  const panel = session.panel;
  if (!panel) return;
  panel.root.hidden = !session.active;
  if (!session.active) return;
  const anchor = session.anchor;
  panel.list.replaceChildren(...AIRPORT_ROUTE_POINT_DEFS.map(({ key, label }) => {
    const point = session.points[key] ?? {};
    const row = document.createElement('div');
    row.className = 'arc-row';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('span');
    const dRow = visualRouteCalibrationRound(Number(point.row) - anchor.row);
    const dCol = visualRouteCalibrationRound(Number(point.col) - anchor.col);
    const direction = AIRPORT_ROUTE_DIRECTION_CYCLE.includes(point.direction)
      ? point.direction.toUpperCase()
      : '—';
    value.textContent = `Δ${dRow}, Δ${dCol} · ${direction}`;
    row.append(name, value);
    return row;
  }));
}

// ── Exports ─────────────────────────────────────────────────────────────────

const airportRouteCalibratorTestApi = {
  AIRPORT_ROUTE_CALIBRATION_SCHEMA_VERSION,
  AIRPORT_ROUTE_CALIBRATION_STORAGE_KEY,
  AIRPORT_ROUTE_POINT_DEFS,
  AIRPORT_ROUTE_PREVIEW_LIVERY,
  AIRPORT_ROUTE_DIRECTION_CYCLE,
  AIRPORT_ROUTE_DEFAULT_DIRECTION,
  getNextAirportMarkerDirection,
  airportRouteAircraftPreviewIsReady,
  getAirportRouteAircraftTextureKey,
  getDefaultAirportRoutePoints,
  getShippedAirportRoutePoints,
  buildAirportRouteCalibrationRecord,
  loadAirportRouteCalibrationRecord,
  persistAirportRouteCalibrationRecord,
  resolveAirportRoutePointsFromRecord,
  getAirportRouteCalibrationSession,
  resolveAirportRouteCalibrationAnchor,
  toggleAirportRouteCalibrator,
};

if (typeof module !== 'undefined' && module.exports) module.exports = airportRouteCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleAirportRouteCalibrator,
  });
}
