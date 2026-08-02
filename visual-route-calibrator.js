// Test-branch-only visual route calibrator.
//
// The controller deliberately knows nothing about ships, aircraft, harbors or
// runways. A visual system supplies an adapter descriptor containing a sprite,
// a stable reference sprite, a world->logical converter and optional
// domain-specific measurements. This keeps one pause/drag/record workflow
// reusable for vessel berths now and aircraft taxi/landing nodes later.

const VISUAL_ROUTE_CALIBRATION_SCHEMA_VERSION = 1;
const VISUAL_ROUTE_CALIBRATION_DEFAULT_SLOTS = Object.freeze(['default']);
const VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH = 2_000_000_000;
const VISUAL_ROUTE_CALIBRATION_UNLOCK_CLICKS = 5;
const VISUAL_ROUTE_CALIBRATION_UNLOCK_WINDOW_MS = 2500;
const VISUAL_ROUTE_PERFORMANCE_SAMPLE_COUNT = 120;
const VISUAL_ROUTE_PERFORMANCE_REFRESH_MS = 500;
const VISUAL_ROUTE_TEXTURE_CENSUS_REFRESH_MS = 5000;
const visualRouteCalibrationStates = new WeakMap();
const visualRouteCalibrationLiveStates = new Set();
const visualRoutePerformanceStates = new WeakMap();
let visualRouteCalibrationTestModeEnabled = false;
let visualRouteCalibrationUnlockCount = 0;
let visualRouteCalibrationLastUnlockClickAt = -Infinity;

function updateVisualRouteCalibrationTestModeIndicator() {
  if (typeof document === 'undefined') return;
  const indicator = document.getElementById('visual-route-calibration-test-mode-label');
  if (indicator) indicator.hidden = !visualRouteCalibrationTestModeEnabled;
  const icon = document.getElementById('about-app-icon');
  icon?.setAttribute?.('aria-pressed', String(visualRouteCalibrationTestModeEnabled));
  const performancePanel = document.getElementById('visual-route-performance-panel');
  if (performancePanel) performancePanel.hidden = !visualRouteCalibrationTestModeEnabled;
}

function isVisualRouteCalibrationTestModeEnabled() {
  return visualRouteCalibrationTestModeEnabled;
}

function setVisualRouteCalibrationTestModeEnabled(enabled) {
  visualRouteCalibrationTestModeEnabled = !!enabled;
  visualRouteCalibrationUnlockCount = 0;
  visualRouteCalibrationLastUnlockClickAt = -Infinity;
  if (!visualRouteCalibrationTestModeEnabled) {
    visualRouteCalibrationLiveStates.forEach((state) => {
      clearVisualRouteCalibrationTarget(state.scene);
    });
  }
  updateVisualRouteCalibrationTestModeIndicator();
  return visualRouteCalibrationTestModeEnabled;
}

function handleVisualRouteCalibrationUnlockClick(now = Date.now()) {
  if (visualRouteCalibrationTestModeEnabled) {
    return setVisualRouteCalibrationTestModeEnabled(false);
  }
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)
    || timestamp - visualRouteCalibrationLastUnlockClickAt > VISUAL_ROUTE_CALIBRATION_UNLOCK_WINDOW_MS) {
    visualRouteCalibrationUnlockCount = 0;
  }
  visualRouteCalibrationLastUnlockClickAt = Number.isFinite(timestamp) ? timestamp : Date.now();
  visualRouteCalibrationUnlockCount++;
  if (visualRouteCalibrationUnlockCount >= VISUAL_ROUTE_CALIBRATION_UNLOCK_CLICKS) {
    return setVisualRouteCalibrationTestModeEnabled(true);
  }
  return false;
}

function setupVisualRouteCalibrationTestModeUnlock() {
  if (typeof document === 'undefined') return false;
  const icon = document.getElementById('about-app-icon');
  if (!icon) return false;
  if (icon.dataset.visualRouteCalibrationUnlock !== 'ready') {
    icon.dataset.visualRouteCalibrationUnlock = 'ready';
    icon.addEventListener('click', () => handleVisualRouteCalibrationUnlockClick());
  }
  updateVisualRouteCalibrationTestModeIndicator();
  return true;
}

function visualRouteCalibrationRound(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function getVisualRouteCalibrationRecordKey(targetKind, slot) {
  return `${String(targetKind || 'unknown')}:${String(slot || 'default').toLowerCase()}`;
}

function getVisualRouteCalibrationLogical(target, worldX, worldY) {
  const logical = target?.worldToLogical?.(worldX, worldY);
  const row = Number(logical?.row);
  const col = Number(logical?.col);
  return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null;
}

function normalizeVisualRouteCalibrationMeasurement(measurement) {
  if (!measurement || typeof measurement !== 'object' || Array.isArray(measurement)) return {};
  return Object.fromEntries(Object.entries(measurement).flatMap(([key, value]) => {
    if (typeof value === 'number') {
      const rounded = visualRouteCalibrationRound(value);
      return rounded === null ? [] : [[key, rounded]];
    }
    if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
      return [[key, value]];
    }
    return [];
  }));
}

function buildVisualRouteCalibrationRecord(target, recordedAt = new Date().toISOString()) {
  const spriteX = Number(target?.sprite?.x);
  const spriteY = Number(target?.sprite?.y);
  if (!target || !Number.isFinite(spriteX) || !Number.isFinite(spriteY)) return null;
  const referenceX = Number(target.referenceSprite?.x);
  const referenceY = Number(target.referenceSprite?.y);
  const baselineX = Number(target.baselineWorld?.x);
  const baselineY = Number(target.baselineWorld?.y);
  const logical = getVisualRouteCalibrationLogical(target, spriteX, spriteY);
  const originalRow = Number(target.originalLogical?.row);
  const originalCol = Number(target.originalLogical?.col);
  const measurement = normalizeVisualRouteCalibrationMeasurement(
    target.measure?.(logical, { x: spriteX, y: spriteY }),
  );
  return {
    schemaVersion: VISUAL_ROUTE_CALIBRATION_SCHEMA_VERSION,
    targetKind: String(target.kind || 'unknown'),
    slot: String(target.slot || 'default').toLowerCase(),
    subjectId: String(target.id || ''),
    label: String(target.label || target.kind || ''),
    visualVariant: String(target.visualVariant || target.slot || ''),
    logicalSide: String(target.logicalSide || ''),
    mapRotation: Number.isFinite(Number(target.rotation)) ? Number(target.rotation) : null,
    worldX: visualRouteCalibrationRound(spriteX),
    worldY: visualRouteCalibrationRound(spriteY),
    referenceWorldX: Number.isFinite(referenceX) ? visualRouteCalibrationRound(referenceX) : null,
    referenceWorldY: Number.isFinite(referenceY) ? visualRouteCalibrationRound(referenceY) : null,
    baselineWorldX: Number.isFinite(baselineX) ? visualRouteCalibrationRound(baselineX) : null,
    baselineWorldY: Number.isFinite(baselineY) ? visualRouteCalibrationRound(baselineY) : null,
    routeOffsetX: Number.isFinite(baselineX)
      ? visualRouteCalibrationRound(spriteX - baselineX)
      : null,
    routeOffsetY: Number.isFinite(baselineY)
      ? visualRouteCalibrationRound(spriteY - baselineY)
      : null,
    renderOffsetX: Number.isFinite(referenceX)
      ? visualRouteCalibrationRound(spriteX - referenceX)
      : null,
    renderOffsetY: Number.isFinite(referenceY)
      ? visualRouteCalibrationRound(spriteY - referenceY)
      : null,
    logicalRow: logical ? visualRouteCalibrationRound(logical.row) : null,
    logicalCol: logical ? visualRouteCalibrationRound(logical.col) : null,
    originalLogicalRow: Number.isFinite(originalRow)
      ? visualRouteCalibrationRound(originalRow)
      : null,
    originalLogicalCol: Number.isFinite(originalCol)
      ? visualRouteCalibrationRound(originalCol)
      : null,
    ...measurement,
    recordedAt,
  };
}

function getVisualRouteCalibrationCollection(state, target) {
  const kind = String(target?.kind || 'unknown');
  const slots = Array.from(target?.slots || VISUAL_ROUTE_CALIBRATION_DEFAULT_SLOTS)
    .map((slot) => String(slot).toLowerCase());
  const records = {};
  slots.forEach((slot) => {
    const record = state.records[getVisualRouteCalibrationRecordKey(kind, slot)];
    if (record) records[slot] = record;
  });
  return {
    schemaVersion: VISUAL_ROUTE_CALIBRATION_SCHEMA_VERSION,
    targetKind: kind,
    records,
  };
}

function setVisualRouteCalibrationMessage(state, text, tone = 'info') {
  state.message = { text: String(text || ''), tone };
  const node = state.panel?.message;
  if (!node) return;
  node.textContent = state.message.text;
  node.dataset.tone = tone;
}

async function copyVisualRouteCalibrationText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy') === true;
  textarea.remove();
  return copied;
}

// Kept only in-memory for this session (state.records, not localStorage) -
// calibration is meant to end up baked into the relevant *-route-metadata.js
// file, never left living solely in browser storage where a fresh install
// (or even just clearing site data) would silently lose it. The "複製 JSON"
// button is the actual handoff point; this only feeds the live panel.
function saveVisualRouteCalibrationCurrent(state) {
  const target = state.activeTarget;
  const record = buildVisualRouteCalibrationRecord(target);
  if (!record) return null;
  state.records[getVisualRouteCalibrationRecordKey(record.targetKind, record.slot)] = record;
  setVisualRouteCalibrationMessage(state, `${record.slot.toUpperCase()} 位置已記錄`, 'success');
  renderVisualRouteCalibrationPanel(state);
  return record;
}

function resetVisualRouteCalibrationPosition(state) {
  const target = state.activeTarget;
  const baselineX = Number(target?.baselineWorld?.x);
  const baselineY = Number(target?.baselineWorld?.y);
  if (!target?.sprite || !Number.isFinite(baselineX) || !Number.isFinite(baselineY)) return;
  target.sprite.setPosition?.(baselineX, baselineY);
  target.onMove?.(baselineX, baselineY, getVisualRouteCalibrationLogical(target, baselineX, baselineY));
  target.sprite.setDepth?.(VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH);
  setVisualRouteCalibrationMessage(state, '已回復原本航線位置', 'info');
  renderVisualRouteCalibrationPanel(state);
}

function createVisualRouteCalibrationPanel(state) {
  if (typeof document === 'undefined' || !document.body) return null;
  let style = document.getElementById('visual-route-calibrator-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'visual-route-calibrator-style';
    style.textContent = `
      #visual-route-calibrator-panel {
        position: fixed; right: 88px; bottom: 18px; z-index: 100000;
        width: min(330px, calc(100vw - 112px)); box-sizing: border-box;
        padding: 12px; border: 1px solid rgba(115, 210, 255, 0.72);
        border-radius: 12px; color: #eaf8ff; background: rgba(5, 18, 31, 0.94);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42); font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
        user-select: text; pointer-events: auto; backdrop-filter: blur(8px);
      }
      #visual-route-calibrator-panel[hidden] { display: none !important; }
      #visual-route-calibrator-panel .vrc-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 8px; }
      #visual-route-calibrator-panel .vrc-title { font-weight: 800; color: #7fdbff; letter-spacing: .04em; }
      #visual-route-calibrator-panel .vrc-test { color: #07131e; background: #ffd15a; border-radius: 5px; padding: 2px 6px; font-weight: 800; }
      #visual-route-calibrator-panel .vrc-status { margin: 6px 0 9px; color: #d8ecf8; }
      #visual-route-calibrator-panel .vrc-grid { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; }
      #visual-route-calibrator-panel .vrc-grid span:nth-child(odd) { color: #8fb3c8; }
      #visual-route-calibrator-panel .vrc-grid span:nth-child(even) { text-align: right; color: #fff; }
      #visual-route-calibrator-panel .vrc-measure { margin-top: 8px; color: #a8e8bd; overflow-wrap: anywhere; }
      #visual-route-calibrator-panel .vrc-slots { display: flex; gap: 5px; flex-wrap: wrap; margin: 10px 0 8px; }
      #visual-route-calibrator-panel .vrc-slot { border: 1px solid #496476; border-radius: 6px; padding: 2px 6px; color: #8da9ba; }
      #visual-route-calibrator-panel .vrc-slot[data-saved="true"] { color: #09160e; border-color: #70dda0; background: #70dda0; }
      #visual-route-calibrator-panel .vrc-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      #visual-route-calibrator-panel button { border: 1px solid #527b96; border-radius: 7px; padding: 6px 7px; color: #eaf8ff; background: #173449; font: inherit; cursor: pointer; }
      #visual-route-calibrator-panel button:hover { background: #23506d; }
      #visual-route-calibrator-panel .vrc-message { min-height: 16px; margin-top: 7px; color: #a9c4d4; }
      #visual-route-calibrator-panel .vrc-message[data-tone="success"] { color: #7ce8a8; }
      #visual-route-calibrator-panel .vrc-message[data-tone="error"] { color: #ff9a9a; }
    `;
    document.head.appendChild(style);
  }
  const root = document.createElement('section');
  root.id = 'visual-route-calibrator-panel';
  root.hidden = true;
  root.setAttribute('aria-label', 'Visual route calibrator test panel');
  root.innerHTML = `
    <div class="vrc-head"><span class="vrc-title">ROUTE CALIBRATOR</span><span class="vrc-test">TEST</span></div>
    <div class="vrc-status"></div>
    <div class="vrc-grid"></div>
    <div class="vrc-measure"></div>
    <div class="vrc-slots"></div>
    <div class="vrc-actions">
      <button type="button" data-action="save">儲存位置</button>
      <button type="button" data-action="reset">重設位置</button>
      <button type="button" data-action="copy-current">複製目前 JSON</button>
      <button type="button" data-action="copy-all">複製全部方向</button>
    </div>
    <div class="vrc-message"></div>
  `;
  document.body.appendChild(root);
  const panel = {
    root,
    status: root.querySelector('.vrc-status'),
    grid: root.querySelector('.vrc-grid'),
    measure: root.querySelector('.vrc-measure'),
    slots: root.querySelector('.vrc-slots'),
    message: root.querySelector('.vrc-message'),
  };
  root.querySelector('[data-action="save"]').addEventListener('click', () => {
    saveVisualRouteCalibrationCurrent(state);
  });
  root.querySelector('[data-action="reset"]').addEventListener('click', () => {
    resetVisualRouteCalibrationPosition(state);
  });
  root.querySelector('[data-action="copy-current"]').addEventListener('click', () => {
    const record = buildVisualRouteCalibrationRecord(state.activeTarget);
    if (!record) return;
    copyVisualRouteCalibrationText(JSON.stringify(record, null, 2))
      .then(() => setVisualRouteCalibrationMessage(state, '目前 JSON 已複製', 'success'))
      .catch(() => setVisualRouteCalibrationMessage(state, '複製失敗', 'error'));
  });
  root.querySelector('[data-action="copy-all"]').addEventListener('click', () => {
    const collection = getVisualRouteCalibrationCollection(state, state.activeTarget);
    copyVisualRouteCalibrationText(JSON.stringify(collection, null, 2))
      .then(() => setVisualRouteCalibrationMessage(state, '全部方向 JSON 已複製', 'success'))
      .catch(() => setVisualRouteCalibrationMessage(state, '複製失敗', 'error'));
  });
  return panel;
}

function renderVisualRouteCalibrationPanel(state) {
  const panel = state.panel;
  const target = state.activeTarget;
  if (!panel) return;
  panel.root.hidden = !visualRouteCalibrationTestModeEnabled || !target?.eligible || !target?.paused;
  if (panel.root.hidden) return;
  const record = buildVisualRouteCalibrationRecord(target, 'preview');
  panel.status.textContent = `${record.label} · 已暫停 · 可直接拖曳模型`;
  const rows = [
    ['slot / side', `${record.slot.toUpperCase()} / ${record.logicalSide || '—'}`],
    ['rotation', record.mapRotation ?? '—'],
    ['world x, y', `${record.worldX}, ${record.worldY}`],
    ['route Δx, Δy', `${record.routeOffsetX}, ${record.routeOffsetY}`],
    ['anchor Δx, Δy', `${record.renderOffsetX}, ${record.renderOffsetY}`],
    ['logical row, col', `${record.logicalRow}, ${record.logicalCol}`],
  ];
  panel.grid.replaceChildren(...rows.flatMap(([label, value]) => {
    const key = document.createElement('span');
    const text = document.createElement('span');
    key.textContent = label;
    text.textContent = String(value);
    return [key, text];
  }));
  const standardKeys = new Set([
    'schemaVersion', 'targetKind', 'slot', 'subjectId', 'label', 'visualVariant',
    'logicalSide', 'mapRotation', 'worldX', 'worldY', 'referenceWorldX',
    'referenceWorldY', 'baselineWorldX', 'baselineWorldY', 'routeOffsetX',
    'routeOffsetY', 'renderOffsetX', 'renderOffsetY', 'logicalRow', 'logicalCol',
    'originalLogicalRow', 'originalLogicalCol', 'recordedAt',
  ]);
  const measurement = Object.fromEntries(
    Object.entries(record).filter(([key]) => !standardKeys.has(key)),
  );
  panel.measure.textContent = Object.entries(measurement)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
  const slots = Array.from(target.slots || VISUAL_ROUTE_CALIBRATION_DEFAULT_SLOTS)
    .map((slot) => String(slot).toLowerCase());
  panel.slots.replaceChildren(...slots.map((slot) => {
    const node = document.createElement('span');
    node.className = 'vrc-slot';
    node.dataset.saved = String(!!state.records[getVisualRouteCalibrationRecordKey(target.kind, slot)]);
    node.textContent = slot.toUpperCase();
    return node;
  }));
  setVisualRouteCalibrationMessage(state, state.message.text, state.message.tone);
}

function getVisualRouteCalibrationState(scene) {
  if (!scene) return null;
  let state = visualRouteCalibrationStates.get(scene);
  if (!state) {
    state = {
      scene,
      activeTarget: null,
      dragSprite: null,
      dragHandlers: null,
      dragHadInput: false,
      dragOriginalDepth: null,
      records: {},
      panel: null,
      message: { text: '', tone: 'info' },
    };
    state.panel = createVisualRouteCalibrationPanel(state);
    visualRouteCalibrationStates.set(scene, state);
    visualRouteCalibrationLiveStates.add(state);
  }
  return state;
}

function detachVisualRouteCalibrationDrag(state) {
  const sprite = state.dragSprite;
  const handlers = state.dragHandlers;
  if (!sprite || !handlers) return;
  sprite.off?.('pointerdown', handlers.pointerdown);
  sprite.off?.('pointerup', handlers.pointerup);
  sprite.off?.('dragstart', handlers.dragstart);
  sprite.off?.('drag', handlers.drag);
  sprite.off?.('dragend', handlers.dragend);
  state.scene?.input?.setDraggable?.(sprite, false);
  if (Number.isFinite(state.dragOriginalDepth)) {
    sprite.setDepth?.(state.dragOriginalDepth);
  }
  if (!state.dragHadInput) sprite.disableInteractive?.();
  state.dragSprite = null;
  state.dragHandlers = null;
  state.dragHadInput = false;
  state.dragOriginalDepth = null;
}

function attachVisualRouteCalibrationDrag(state) {
  const target = state.activeTarget;
  const sprite = target?.sprite;
  if (!sprite) return;
  if (state.dragSprite === sprite) {
    sprite.setDepth?.(VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH);
    return;
  }
  detachVisualRouteCalibrationDrag(state);
  state.dragHadInput = !!sprite.input;
  state.dragOriginalDepth = Number.isFinite(Number(sprite.depth)) ? Number(sprite.depth) : null;
  if (!state.dragHadInput) sprite.setInteractive?.({ useHandCursor: true });
  sprite.setDepth?.(VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH);
  state.scene?.input?.setDraggable?.(sprite, true);
  const stopPointerPropagation = (pointer, localX, localY, event) => {
    event?.stopPropagation?.();
  };
  const handlers = {
    pointerdown: stopPointerPropagation,
    pointerup: stopPointerPropagation,
    dragstart: () => setVisualRouteCalibrationMessage(state, '拖曳中…', 'info'),
    drag: (pointer, dragX, dragY) => {
      if (!state.activeTarget?.paused) return;
      const x = Number.isFinite(Number(dragX)) ? Number(dragX) : Number(sprite.x);
      const y = Number.isFinite(Number(dragY)) ? Number(dragY) : Number(sprite.y);
      sprite.setPosition?.(x, y);
      const logical = getVisualRouteCalibrationLogical(state.activeTarget, x, y);
      state.activeTarget.onMove?.(x, y, logical);
      sprite.setDepth?.(VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH);
      renderVisualRouteCalibrationPanel(state);
    },
    dragend: () => saveVisualRouteCalibrationCurrent(state),
  };
  sprite.on?.('pointerdown', handlers.pointerdown);
  sprite.on?.('pointerup', handlers.pointerup);
  sprite.on?.('dragstart', handlers.dragstart);
  sprite.on?.('drag', handlers.drag);
  sprite.on?.('dragend', handlers.dragend);
  state.dragSprite = sprite;
  state.dragHandlers = handlers;
}

function isVisualRouteCalibrationInputCaptured(scene) {
  const target = visualRouteCalibrationStates.get(scene)?.activeTarget;
  return visualRouteCalibrationTestModeEnabled && !!target?.eligible && !!target?.paused;
}

function clearVisualRouteCalibrationTarget(scene, targetId = '') {
  const state = visualRouteCalibrationStates.get(scene);
  if (!state || (targetId && state.activeTarget?.id !== targetId)) return;
  detachVisualRouteCalibrationDrag(state);
  state.activeTarget = null;
  if (state.panel) state.panel.root.hidden = true;
}

function clearVisualRouteCalibrationScene(scene) {
  const state = visualRouteCalibrationStates.get(scene);
  if (!state) return;
  clearVisualRouteCalibrationTarget(scene);
  state.panel?.root?.remove?.();
  visualRouteCalibrationLiveStates.delete(state);
  visualRouteCalibrationStates.delete(scene);
}

// Returns true only when the calibrator owns the paused model position. The
// caller should skip its normal position write for that frame, otherwise the
// drag would be snapped back to the route point by the simulation update.
function syncVisualRouteCalibrationTarget(scene, target) {
  if (!visualRouteCalibrationTestModeEnabled) {
    const existingState = visualRouteCalibrationStates.get(scene);
    if (existingState?.activeTarget) clearVisualRouteCalibrationTarget(scene);
    return false;
  }
  const state = getVisualRouteCalibrationState(scene);
  if (!state || !target?.id) return false;
  if (!target.eligible) {
    clearVisualRouteCalibrationTarget(scene, target.id);
    return false;
  }
  if (state.activeTarget && state.activeTarget.id !== target.id) return false;
  state.activeTarget = target;
  if (target.paused) attachVisualRouteCalibrationDrag(state);
  else detachVisualRouteCalibrationDrag(state);
  renderVisualRouteCalibrationPanel(state);
  return !!target.paused;
}

function summarizeVisualRoutePerformanceSamples(samples) {
  const values = Array.from(samples ?? [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) {
    return { currentMs: 0, averageMs: 0, p95Ms: 0, maxMs: 0, fps: 0, longFrames: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const averageMs = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    currentMs: values.at(-1),
    averageMs,
    p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
    maxMs: sorted.at(-1),
    fps: averageMs > 0 ? 1000 / averageMs : 0,
    longFrames: values.filter((value) => value > 33.34).length,
  };
}

function visualRoutePerformanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function createVisualRoutePerformanceRing() {
  return {
    samples: new Float64Array(VISUAL_ROUTE_PERFORMANCE_SAMPLE_COUNT),
    sampleCount: 0,
    sampleIndex: 0,
  };
}

function pushVisualRoutePerformanceSample(ring, value) {
  const numeric = Number(value);
  if (!ring || !Number.isFinite(numeric) || numeric < 0) return false;
  ring.samples[ring.sampleIndex] = numeric;
  ring.sampleIndex = (ring.sampleIndex + 1) % ring.samples.length;
  ring.sampleCount = Math.min(ring.samples.length, ring.sampleCount + 1);
  return true;
}

function getVisualRoutePerformanceRingValues(ring) {
  if (!ring?.sampleCount) return [];
  const values = [];
  for (let offset = ring.sampleCount - 1; offset >= 0; offset--) {
    const index = (ring.sampleIndex - 1 - offset + ring.samples.length) % ring.samples.length;
    values.push(ring.samples[index]);
  }
  return values;
}

function getVisualRoutePerformanceState(scene) {
  if (!scene) return null;
  let state = visualRoutePerformanceStates.get(scene);
  if (!state) {
    state = {
      rawFrame: createVisualRoutePerformanceRing(),
      phaserDelta: createVisualRoutePerformanceRing(),
      sections: new Map(),
      lastRawFrameAt: null,
      lastRefreshAt: -Infinity,
      lastTextureCensusAt: -Infinity,
      textureSnapshot: null,
      hooksInstalled: false,
      updateStartedAt: null,
      renderStartedAt: null,
    };
    visualRoutePerformanceStates.set(scene, state);
  }
  return state;
}

function recordVisualRoutePerformanceFrameStart(scene, now = visualRoutePerformanceNow()) {
  if (!visualRouteCalibrationTestModeEnabled) return false;
  const state = getVisualRoutePerformanceState(scene);
  const timestamp = Number(now);
  if (!state || !Number.isFinite(timestamp)) return false;
  if (Number.isFinite(state.lastRawFrameAt)) {
    pushVisualRoutePerformanceSample(state.rawFrame, timestamp - state.lastRawFrameAt);
  }
  state.lastRawFrameAt = timestamp;
  return true;
}

function recordVisualRoutePerformanceDuration(scene, section, durationMs) {
  if (!visualRouteCalibrationTestModeEnabled) return false;
  const state = getVisualRoutePerformanceState(scene);
  if (!state) return false;
  const key = String(section || 'other');
  let ring = state.sections.get(key);
  if (!ring) {
    ring = createVisualRoutePerformanceRing();
    state.sections.set(key, ring);
  }
  return pushVisualRoutePerformanceSample(ring, durationMs);
}

function setupVisualRoutePerformanceHooks(scene) {
  const state = getVisualRoutePerformanceState(scene);
  if (!state || state.hooksInstalled) return !!state;
  state.hooksInstalled = true;
  const now = () => visualRoutePerformanceNow();
  scene.events?.on?.('preupdate', () => {
    if (!visualRouteCalibrationTestModeEnabled) return;
    state.updateStartedAt = now();
  });
  scene.events?.on?.('postupdate', () => {
    if (!visualRouteCalibrationTestModeEnabled || !Number.isFinite(state.updateStartedAt)) return;
    recordVisualRoutePerformanceDuration(scene, 'update', now() - state.updateStartedAt);
    state.updateStartedAt = null;
  });
  scene.game?.events?.on?.('prerender', () => {
    if (!visualRouteCalibrationTestModeEnabled) return;
    state.renderStartedAt = now();
  });
  scene.game?.events?.on?.('postrender', () => {
    if (!visualRouteCalibrationTestModeEnabled || !Number.isFinite(state.renderStartedAt)) return;
    recordVisualRoutePerformanceDuration(scene, 'render', now() - state.renderStartedAt);
    state.renderStartedAt = null;
  });
  return true;
}

function visualRouteBytesToMiB(bytes) {
  const value = Number(bytes);
  return Number.isFinite(value) && value >= 0 ? value / (1024 * 1024) : null;
}

function visualRouteIsPowerOfTwo(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && (number & (number - 1)) === 0;
}

function getVisualRouteTextureMemoryStats(scene) {
  const textures = Object.values(scene?.textures?.list ?? {}).filter(Boolean);
  const sourceObjects = new Set();
  const sourceUrls = new Map();
  let estimatedBytes = 0;
  textures.forEach((texture) => {
    let sources = Array.isArray(texture.source) ? texture.source : [];
    if (sources.length === 0) {
      const image = texture.getSourceImage?.();
      if (image) sources = [image];
    }
    sources.forEach((source) => {
      const image = source?.image ?? source;
      const identity = image || source;
      if (!identity || sourceObjects.has(identity)) return;
      sourceObjects.add(identity);
      const width = Number(source?.width ?? image?.width) || 0;
      const height = Number(source?.height ?? image?.height) || 0;
      if (width <= 0 || height <= 0) return;
      const mipmapMultiplier = visualRouteIsPowerOfTwo(width) && visualRouteIsPowerOfTwo(height)
        ? 4 / 3
        : 1;
      const bytes = width * height * 4 * mipmapMultiplier;
      estimatedBytes += bytes;
      const url = String(image?.currentSrc || image?.src || '').split('?')[0];
      if (url) {
        const entry = sourceUrls.get(url) ?? { count: 0, bytes: 0 };
        entry.count++;
        entry.bytes += bytes;
        sourceUrls.set(url, entry);
      }
    });
  });
  const airportKeys = ['airport_12x12', 'airport_8x8_legacy', 'airport_6x6_legacy'];
  const duplicateUrlEntries = [...sourceUrls.values()].filter((entry) => entry.count > 1);
  return {
    textureCount: textures.length,
    sourceCount: sourceObjects.size,
    estimatedBytes,
    duplicateSourceUrls: duplicateUrlEntries.length,
    duplicateUrlSources: duplicateUrlEntries.reduce((total, entry) => total + entry.count - 1, 0),
    duplicateEstimatedBytes: duplicateUrlEntries.reduce((total, entry) => (
      total + entry.bytes * ((entry.count - 1) / entry.count)
    ), 0),
    airportTextureCount: airportKeys.filter((key) => scene?.textures?.exists?.(key)).length,
  };
}

function getVisualRoutePerformanceSnapshot(scene) {
  const state = getVisualRoutePerformanceState(scene);
  if (!state) return null;
  const frameValues = getVisualRoutePerformanceRingValues(
    state.rawFrame.sampleCount ? state.rawFrame : state.phaserDelta,
  );
  const sections = Object.fromEntries([...state.sections.entries()].map(([key, ring]) => (
    [key, summarizeVisualRoutePerformanceSamples(getVisualRoutePerformanceRingValues(ring))]
  )));
  const displayList = scene?.children?.list ?? scene?.sys?.displayList?.list ?? [];
  const renderList = scene?.cameras?.main?.renderList ?? [];
  const cull = scene?.viewportCullStats ?? null;
  return {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    frame: summarizeVisualRoutePerformanceSamples(frameValues),
    sections,
    objects: {
      displayList: Number(displayList.length) || 0,
      rendered: Number(renderList.length) || 0,
      activeTerrain: Number(cull?.activeTerrain) || 0,
      terrainCandidates: Number(cull?.terrainCandidates) || 0,
    },
    culling: cull ? { ...cull } : null,
    textures: state.textureSnapshot ? { ...state.textureSnapshot } : getVisualRouteTextureMemoryStats(scene),
  };
}

function createVisualRoutePerformancePanel(scene) {
  if (typeof document === 'undefined' || !document.body) return null;
  const existing = document.getElementById('visual-route-performance-panel');
  if (existing) return existing;
  if (!document.getElementById('visual-route-performance-style')) {
    const style = document.createElement('style');
    style.id = 'visual-route-performance-style';
    style.textContent = `
      #visual-route-performance-panel {
        position: fixed; right: 14px; top: 126px; z-index: 99999;
        min-width: 250px; box-sizing: border-box; padding: 10px 12px;
        border: 1px solid rgba(112, 221, 160, .72); border-radius: 10px;
        color: #eafff2; background: rgba(5, 24, 25, .91);
        box-shadow: 0 10px 28px rgba(0, 0, 0, .32);
        font: 11px/1.48 ui-monospace, SFMono-Regular, Menlo, monospace;
        pointer-events: auto; user-select: text; backdrop-filter: blur(7px);
      }
      #visual-route-performance-panel[hidden] { display: none !important; }
      #visual-route-performance-panel .vrp-title { color: #70dda0; font-weight: 800; letter-spacing: .08em; }
      #visual-route-performance-panel pre { margin: 6px 0 0; color: #d9f7e5; white-space: pre-wrap; }
      #visual-route-performance-panel button {
        width: 100%; margin-top: 7px; border: 1px solid rgba(112, 221, 160, .62);
        border-radius: 6px; padding: 4px 7px; color: #d9f7e5; background: #123b33;
        font: inherit; cursor: pointer;
      }
      #visual-route-performance-panel button:hover { background: #1a5145; }
      #visual-route-performance-panel .vrp-close-btn {
        position: absolute; top: 8px; right: 8px; width: 20px; height: 20px;
        margin-top: 0; padding: 0; display: flex; align-items: center; justify-content: center;
        border-radius: 5px; line-height: 1;
      }
    `;
    document.head.appendChild(style);
  }
  const root = document.createElement('aside');
  root.id = 'visual-route-performance-panel';
  root.hidden = !visualRouteCalibrationTestModeEnabled;
  root.setAttribute('aria-label', 'Test mode performance metrics');
  root.innerHTML = '<button type="button" class="vrp-close-btn" aria-label="Close performance panel" title="Close">✕</button>'
    + '<div class="vrp-title">PERFORMANCE · TEST</div><pre></pre>'
    + '<button type="button" class="vrp-copy-btn">複製 profiling JSON</button>'
    + '<button type="button" class="vrp-airport-btn">機場路線校正</button>';
  root.querySelector('.vrp-close-btn')?.addEventListener?.('click', () => {
    setVisualRouteCalibrationTestModeEnabled(false);
  });
  root.querySelector('.vrp-copy-btn')?.addEventListener?.('click', () => {
    const snapshot = getVisualRoutePerformanceSnapshot(scene);
    if (!snapshot) return;
    copyVisualRouteCalibrationText(JSON.stringify(snapshot, null, 2)).catch(() => {});
  });
  root.querySelector('.vrp-airport-btn')?.addEventListener?.('click', () => {
    if (typeof toggleAirportRouteCalibrator === 'function') toggleAirportRouteCalibrator(scene);
  });
  document.body.appendChild(root);
  return root;
}

function updateVisualRoutePerformanceProfiler(scene, time, delta) {
  if (!visualRouteCalibrationTestModeEnabled || !scene) return false;
  const state = getVisualRoutePerformanceState(scene);
  const frameMs = Number(delta);
  if (Number.isFinite(frameMs) && frameMs > 0) pushVisualRoutePerformanceSample(state.phaserDelta, frameMs);
  const now = visualRoutePerformanceNow();
  if (now - state.lastRefreshAt < VISUAL_ROUTE_PERFORMANCE_REFRESH_MS) return true;
  state.lastRefreshAt = now;

  const frameRing = state.rawFrame.sampleCount ? state.rawFrame : state.phaserDelta;
  const frame = summarizeVisualRoutePerformanceSamples(getVisualRoutePerformanceRingValues(frameRing));
  const update = summarizeVisualRoutePerformanceSamples(
    getVisualRoutePerformanceRingValues(state.sections.get('update')),
  );
  const render = summarizeVisualRoutePerformanceSamples(
    getVisualRoutePerformanceRingValues(state.sections.get('render')),
  );
  const traffic = summarizeVisualRoutePerformanceSamples(
    getVisualRoutePerformanceRingValues(state.sections.get('traffic')),
  );
  const vessel = summarizeVisualRoutePerformanceSamples(
    getVisualRoutePerformanceRingValues(state.sections.get('vessel')),
  );
  const simulation = summarizeVisualRoutePerformanceSamples(
    getVisualRoutePerformanceRingValues(state.sections.get('simulation')),
  );
  const simulationGrowth = summarizeVisualRoutePerformanceSamples(
    getVisualRoutePerformanceRingValues(state.sections.get('sim.growth')),
  );
  const simulationTraffic = summarizeVisualRoutePerformanceSamples(
    getVisualRoutePerformanceRingValues(state.sections.get('sim.traffic')),
  );
  const memory = globalThis.performance?.memory;
  const heapUsed = visualRouteBytesToMiB(memory?.usedJSHeapSize);
  const heapTotal = visualRouteBytesToMiB(memory?.totalJSHeapSize);
  if (!state.textureSnapshot || now - state.lastTextureCensusAt >= VISUAL_ROUTE_TEXTURE_CENSUS_REFRESH_MS) {
    state.textureSnapshot = getVisualRouteTextureMemoryStats(scene);
    state.lastTextureCensusAt = now;
  }
  const texture = state.textureSnapshot;
  const textureMiB = visualRouteBytesToMiB(texture.estimatedBytes) ?? 0;
  const airports = typeof getBuildingFacilityEntries === 'function'
    ? getBuildingFacilityEntries('airport')
    : [];
  const facility = typeof getBuildingFacilityCacheStats === 'function'
    ? getBuildingFacilityCacheStats()
    : null;
  const metadata = typeof getSpriteMetadataProfileStats === 'function'
    ? getSpriteMetadataProfileStats()
    : null;
  const growthCache = typeof getZoneGrowthQualityContextCacheStats === 'function'
    ? getZoneGrowthQualityContextCacheStats()
    : null;
  const root = createVisualRoutePerformancePanel(scene);
  const output = root?.querySelector?.('pre');
  if (!root || !output) return false;
  root.hidden = false;
  const heapText = heapUsed === null
    ? 'RAM (JS heap)   n/a'
    : `RAM (JS heap)   ${heapUsed.toFixed(1)} / ${heapTotal?.toFixed(1) ?? '?'} MiB`;
  const facilityText = facility
    ? `${facility.valid ? 'hot' : 'cold'} · airport ${airports.length} · H/M ${facility.hits}/${facility.misses}`
    : `n/a · airport ${airports.length}`;
  const displayList = scene?.children?.list ?? scene?.sys?.displayList?.list ?? [];
  const renderList = scene?.cameras?.main?.renderList ?? [];
  const cull = scene?.viewportCullStats;
  output.textContent = [
    `frame raw avg/p95 ${frame.averageMs.toFixed(2)} / ${frame.p95Ms.toFixed(2)} ms`,
    `fps / >33ms       ${frame.fps.toFixed(1)} / ${frame.longFrames}`,
    `CPU update/render ${update.averageMs.toFixed(2)} / ${render.averageMs.toFixed(2)} ms`,
    `traffic/vessel    ${traffic.averageMs.toFixed(2)} / ${vessel.averageMs.toFixed(2)} ms`,
    `simulation p95    ${simulation.p95Ms.toFixed(2)} ms`,
    `sim growth/traffic ${simulationGrowth.p95Ms.toFixed(2)} / ${simulationTraffic.p95Ms.toFixed(2)} ms p95`,
    `objects list/draw ${displayList.length} / ${renderList.length}`,
    cull
      ? `cull ${Number(cull.lastDurationMs || 0).toFixed(2)} ms · terrain ${cull.activeTerrain || 0}/${cull.terrainCandidates || 0}`
      : 'cull              n/a',
    heapText,
    `GPU tex est.   ${textureMiB.toFixed(1)} MiB · ${texture.sourceCount} src`,
    `texture URL dup ${texture.duplicateUrlSources || 0} src · ${visualRouteBytesToMiB(texture.duplicateEstimatedBytes || 0).toFixed(1)} MiB`,
    `airport tex    ${texture.airportTextureCount} canonical key(s)`,
    metadata
      ? `metadata       manifest ${metadata.manifestHits} · scan ${metadata.alphaScans} · reuse ${metadata.geometryCacheHits}`
      : 'metadata       n/a',
    growthCache
      ? `growth cache   ${growthCache.valid ? 'hot' : 'cold'} · H/M ${growthCache.hits}/${growthCache.misses} · ${Number(growthCache.lastBuildMs || 0).toFixed(1)} ms`
      : 'growth cache   n/a',
    `facility cache ${facilityText}`,
  ].join('\n');
  return true;
}

const visualRouteCalibrationTestApi = {
  VISUAL_ROUTE_CALIBRATION_SCHEMA_VERSION,
  VISUAL_ROUTE_CALIBRATION_DEFAULT_SLOTS,
  VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH,
  VISUAL_ROUTE_CALIBRATION_UNLOCK_CLICKS,
  VISUAL_ROUTE_CALIBRATION_UNLOCK_WINDOW_MS,
  visualRouteCalibrationRound,
  getVisualRouteCalibrationRecordKey,
  buildVisualRouteCalibrationRecord,
  getVisualRouteCalibrationCollection,
  getVisualRouteCalibrationState,
  isVisualRouteCalibrationTestModeEnabled,
  setVisualRouteCalibrationTestModeEnabled,
  handleVisualRouteCalibrationUnlockClick,
  setupVisualRouteCalibrationTestModeUnlock,
  saveVisualRouteCalibrationCurrent,
  isVisualRouteCalibrationInputCaptured,
  syncVisualRouteCalibrationTarget,
  clearVisualRouteCalibrationTarget,
  clearVisualRouteCalibrationScene,
  summarizeVisualRoutePerformanceSamples,
  getVisualRouteTextureMemoryStats,
  getVisualRoutePerformanceSnapshot,
  getVisualRoutePerformanceState,
  pushVisualRoutePerformanceSample,
  getVisualRoutePerformanceRingValues,
  recordVisualRoutePerformanceFrameStart,
  recordVisualRoutePerformanceDuration,
  setupVisualRoutePerformanceHooks,
  updateVisualRoutePerformanceProfiler,
};

if (typeof module !== 'undefined' && module.exports) module.exports = visualRouteCalibrationTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    syncVisualRouteCalibrationTarget,
    isVisualRouteCalibrationInputCaptured,
    isVisualRouteCalibrationTestModeEnabled,
    setVisualRouteCalibrationTestModeEnabled,
    setupVisualRouteCalibrationTestModeUnlock,
    clearVisualRouteCalibrationTarget,
    clearVisualRouteCalibrationScene,
    recordVisualRoutePerformanceFrameStart,
    recordVisualRoutePerformanceDuration,
    setupVisualRoutePerformanceHooks,
    updateVisualRoutePerformanceProfiler,
  });
}
