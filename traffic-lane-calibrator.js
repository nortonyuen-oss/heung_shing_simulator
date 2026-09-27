// Vehicle lane position calibrator (test-mode dev tool): tunes where cars actually drive across a
// road tile - TRAFFIC_LANE_OFFSETS in traffic-visuals.js - separately for a two-way road's
// keep-left lane and a widened road's kerb and centre-line lanes, per screen direction of travel.
//
// Workflow: pick a lane kind; the overlay draws that kind's travel lines on every road in view
// (computed by getTrafficLanePoint itself, so the line IS where the cars go), coloured by screen
// direction with a dot at the end of each leg. Nudge a direction's value with − / ＋ (Shift:
// ×5) or type it; cars already driving are re-plotted at once. Values are a distance in tiles to
// the driver's left of the tile centre (negative = right of centre). Session-only, like the
// other street-prop calibrators: "複製 JS" copies the literal to paste over TRAFFIC_LANE_OFFSETS.

const TRAFFIC_LANE_CALIBRATION_STEP = 0.005;
const TRAFFIC_LANE_CALIBRATION_LIMIT = 0.45;
const TRAFFIC_LANE_CALIBRATION_MAX_TILES = 6000;
const TRAFFIC_LANE_CALIBRATION_REDRAW_MS = 250;
const TRAFFIC_LANE_KIND_LABELS = Object.freeze({
  single: '單線（一來一回）',
  dualOuter: '雙線・外線（近行人路）',
  dualInner: '雙線・內線（近中線）',
});
const TRAFFIC_LANE_DIRECTION_LABELS = Object.freeze({
  ne: '↗ 往東北（畫面右上）',
  se: '↘ 往東南（畫面右下）',
  sw: '↙ 往西南（畫面左下）',
  nw: '↖ 往西北（畫面左上）',
});
const TRAFFIC_LANE_DIRECTION_COLOURS = Object.freeze({
  ne: 0xff5a5a, se: 0xffc83c, sw: 0x4ad2ff, nw: 0x8cff5a,
});

const trafficLaneCalibration = {
  overrides: {}, // kind -> { direction: value }
  kind: 'single',
  showAll: false,
  active: false,
  scene: null,
  panel: null,
  graphics: null,
  timer: null,
  viewKey: '',
};

function trafficLaneShippedOffset(kind, direction) {
  return typeof TRAFFIC_LANE_OFFSETS !== 'undefined' ? TRAFFIC_LANE_OFFSETS[kind]?.[direction] ?? 0 : 0;
}

// Read by getTrafficLaneOffsetAmount (traffic-visuals.js): a value set this session wins.
function getTrafficLaneCalibrationOffset(kind, direction) {
  const value = trafficLaneCalibration.overrides[kind]?.[direction];
  return Number.isFinite(value) ? value : null;
}

function getTrafficLaneCalibrationValue(kind, direction) {
  return getTrafficLaneCalibrationOffset(kind, direction) ?? trafficLaneShippedOffset(kind, direction);
}

function roundTrafficLaneValue(value) {
  return Math.round(value * 1000) / 1000;
}

function setTrafficLaneCalibrationValue(kind, direction, value) {
  if (!Number.isFinite(value)) return getTrafficLaneCalibrationValue(kind, direction);
  const clamped = roundTrafficLaneValue(Math.max(-TRAFFIC_LANE_CALIBRATION_LIMIT, Math.min(TRAFFIC_LANE_CALIBRATION_LIMIT, value)));
  if (!trafficLaneCalibration.overrides[kind]) trafficLaneCalibration.overrides[kind] = {};
  if (clamped === trafficLaneShippedOffset(kind, direction)) delete trafficLaneCalibration.overrides[kind][direction];
  else trafficLaneCalibration.overrides[kind][direction] = clamped;
  applyTrafficLaneCalibration();
  return clamped;
}

function resetTrafficLaneCalibration(kind = null) {
  if (kind) delete trafficLaneCalibration.overrides[kind];
  else trafficLaneCalibration.overrides = {};
  applyTrafficLaneCalibration();
}

function applyTrafficLaneCalibration() {
  const scene = trafficLaneCalibration.scene;
  if (scene && typeof rebuildTrafficVehicleLegs === 'function') rebuildTrafficVehicleLegs(scene);
  renderTrafficLaneCalibrationPanel();
  drawTrafficLaneCalibrationOverlay(true);
}

// The full table (shipped values with this session's changes), as a paste-ready literal.
function buildTrafficLaneCalibrationSource() {
  const kinds = typeof TRAFFIC_LANE_KINDS !== 'undefined' ? TRAFFIC_LANE_KINDS : Object.keys(TRAFFIC_LANE_KIND_LABELS);
  const directions = typeof TRAFFIC_LANE_SCREEN_DIRECTIONS !== 'undefined' ? TRAFFIC_LANE_SCREEN_DIRECTIONS : ['ne', 'se', 'sw', 'nw'];
  const rows = kinds.map((kind) => {
    const values = directions.map((direction) => `${direction}: ${getTrafficLaneCalibrationValue(kind, direction)}`).join(', ');
    return `  ${kind}: Object.freeze({ ${values} }),`;
  });
  return `const TRAFFIC_LANE_OFFSETS = Object.freeze({\n${rows.join('\n')}\n});`;
}

function hasTrafficLaneCalibrationChanges() {
  return Object.values(trafficLaneCalibration.overrides).some((values) => Object.keys(values || {}).length > 0);
}

// ── Overlay ──────────────────────────────────────────────────────────────────

function trafficLaneCalibrationViewKey(scene) {
  const camera = scene?.cameras?.main;
  if (!camera) return '';
  const view = camera.worldView;
  return `${Math.round(view.x)}:${Math.round(view.y)}:${Math.round(view.width)}:${Math.round(view.height)}:${typeof mapRotation !== 'undefined' ? mapRotation : 0}`;
}

function drawTrafficLaneCalibrationOverlay(force = false) {
  const state = trafficLaneCalibration;
  const scene = state.scene;
  if (!state.active || !scene?.add || typeof getTrafficLanePoint !== 'function') return;
  const viewKey = trafficLaneCalibrationViewKey(scene);
  if (!force && viewKey === state.viewKey) return;
  state.viewKey = viewKey;
  if (!state.graphics) {
    const depth = typeof VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH === 'number' ? VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH - 2 : 1e9;
    state.graphics = scene.add.graphics().setDepth(depth);
  }
  const graphics = state.graphics;
  graphics.clear();
  const bounds = typeof getTrafficLogicalBounds === 'function' ? getTrafficLogicalBounds(scene, scene.cameras.main.worldView) : null;
  if (!bounds) return;
  const tileCount = (bounds.maxRow - bounds.minRow + 1) * (bounds.maxCol - bounds.minCol + 1);
  if (tileCount > TRAFFIC_LANE_CALIBRATION_MAX_TILES) {
    setTrafficLaneCalibrationMessage('範圍太大：放大（zoom in）先會畫行車線', 'info');
    return;
  }
  let legs = 0;
  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      const tile = { row, col };
      const neighbours = typeof getTrafficRoadNeighbours === 'function' ? getTrafficRoadNeighbours(row, col) : [];
      for (const next of neighbours) {
        const deltaRow = next.row - row;
        const deltaCol = next.col - col;
        const outerKind = getTrafficLaneKind(tile, deltaRow, deltaCol, 'outer');
        const lanes = outerKind === 'single' ? ['outer'] : ['outer', 'inner'];
        for (const lane of lanes) {
          const kind = getTrafficLaneKind(tile, deltaRow, deltaCol, lane);
          const selected = kind === state.kind;
          if (!selected && !state.showAll) continue;
          const start = getTrafficLanePoint(scene, tile, deltaRow, deltaCol, lane);
          const end = getTrafficLanePoint(scene, next, deltaRow, deltaCol, lane);
          const centre = isoToScreen(col, row);
          const ahead = isoToScreen(col + deltaCol, row + deltaRow);
          const direction = getTrafficLaneScreenDirection(ahead.x - centre.x, ahead.y - centre.y);
          const colour = TRAFFIC_LANE_DIRECTION_COLOURS[direction];
          graphics.lineStyle(selected ? 2.5 : 1, colour, selected ? 0.95 : 0.35);
          graphics.lineBetween(start.x, start.y, end.x, end.y);
          if (selected) {
            graphics.fillStyle(colour, 0.95);
            graphics.fillCircle(end.x, end.y, 2.6);
          }
          legs++;
        }
      }
    }
  }
  setTrafficLaneCalibrationMessage(legs ? `畫面內 ${legs} 段行車線` : '畫面內冇呢類行車線：移去有路嘅位置');
}

// ── Panel ────────────────────────────────────────────────────────────────────

function ensureTrafficLaneCalibrationStyle() {
  if (document.getElementById('traffic-lane-calibrator-style')) return;
  const style = document.createElement('style');
  style.id = 'traffic-lane-calibrator-style';
  style.textContent = `
    #traffic-lane-calibrator-panel {
      position: fixed; left: 14px; bottom: 18px; z-index: 100000;
      width: min(360px, calc(100vw - 28px)); box-sizing: border-box; padding: 12px;
      border: 1px solid rgba(255, 196, 90, 0.75); border-radius: 12px;
      color: #fff4df; background: rgba(34, 22, 6, 0.94);
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      user-select: text; pointer-events: auto;
    }
    #traffic-lane-calibrator-panel[hidden] { display: none !important; }
    #traffic-lane-calibrator-panel .tlc-title { font-weight: 800; color: #ffc45a; letter-spacing: .04em; margin-bottom: 6px; }
    #traffic-lane-calibrator-panel .tlc-hint { color: #f0d6a8; margin-bottom: 8px; }
    #traffic-lane-calibrator-panel .tlc-kinds { display: grid; gap: 4px; margin-bottom: 8px; }
    #traffic-lane-calibrator-panel .tlc-kinds button[data-selected="true"] { background: #1f9d5c; border-color: #7ce8a8; color: #06210f; font-weight: 700; }
    #traffic-lane-calibrator-panel .tlc-row { display: grid; grid-template-columns: 12px 1fr auto 62px auto; align-items: center; gap: 6px; padding: 2px 0; }
    #traffic-lane-calibrator-panel .tlc-swatch { width: 10px; height: 10px; border-radius: 50%; }
    #traffic-lane-calibrator-panel .tlc-row[data-changed="true"] .tlc-label { color: #ffe3a3; font-weight: 700; }
    #traffic-lane-calibrator-panel input { width: 100%; box-sizing: border-box; padding: 3px 4px; border: 1px solid #b07a2a; border-radius: 5px; color: #fff4df; background: #2a1c08; font: inherit; }
    #traffic-lane-calibrator-panel button {
      border: 1px solid #b07a2a; border-radius: 7px; padding: 4px 8px;
      color: #fff4df; background: #4a3212; font: inherit; cursor: pointer;
    }
    #traffic-lane-calibrator-panel button:hover { background: #6a4718; }
    #traffic-lane-calibrator-panel .tlc-toggle { display: flex; align-items: center; gap: 6px; margin-top: 8px; color: #f0d6a8; }
    #traffic-lane-calibrator-panel .tlc-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 9px; }
    #traffic-lane-calibrator-panel .tlc-message { min-height: 16px; margin-top: 7px; color: #f0d6a8; }
    #traffic-lane-calibrator-panel .tlc-message[data-tone="success"] { color: #7ce8a8; }
    #traffic-lane-calibrator-panel .tlc-message[data-tone="error"] { color: #ff9a9a; }
  `;
  document.head.appendChild(style);
}

function createTrafficLaneCalibrationPanel() {
  const state = trafficLaneCalibration;
  if (state.panel) return state.panel;
  if (typeof document === 'undefined' || !document.body) return null;
  ensureTrafficLaneCalibrationStyle();
  const root = document.createElement('section');
  root.id = 'traffic-lane-calibrator-panel';
  root.hidden = true;
  root.setAttribute('aria-label', '行車線位置校正');
  const kindButtons = Object.entries(TRAFFIC_LANE_KIND_LABELS)
    .map(([kind, label]) => `<button type="button" data-kind="${kind}">${label}</button>`).join('');
  const rows = Object.entries(TRAFFIC_LANE_DIRECTION_LABELS).map(([direction, label]) => {
    const colour = `#${TRAFFIC_LANE_DIRECTION_COLOURS[direction].toString(16).padStart(6, '0')}`;
    return `<div class="tlc-row" data-direction="${direction}">`
      + `<span class="tlc-swatch" style="background:${colour}"></span>`
      + `<span class="tlc-label">${label}</span>`
      + `<button type="button" data-step="-1" data-direction="${direction}">−</button>`
      + `<input type="number" step="${TRAFFIC_LANE_CALIBRATION_STEP}" data-direction="${direction}">`
      + `<button type="button" data-step="1" data-direction="${direction}">＋</button>`
      + '</div>';
  }).join('');
  root.innerHTML = `
    <div class="tlc-title">行車線位置校正</div>
    <div class="tlc-hint">線 = 車實際行嘅位置，圓點 = 行車方向。數值 = 司機左手邊距離路中心幾多格（負數 = 右邊）。− / ＋ 每下 ${TRAFFIC_LANE_CALIBRATION_STEP}，Shift ×5。</div>
    <div class="tlc-kinds">${kindButtons}</div>
    <div class="tlc-rows">${rows}</div>
    <label class="tlc-toggle"><input type="checkbox" class="tlc-show-all" style="width:auto"> 淡色顯示其他類型嘅線</label>
    <div class="tlc-actions">
      <button type="button" data-action="reset-kind">重設此類</button>
      <button type="button" data-action="reset-all">全部重設</button>
      <button type="button" data-action="copy">複製 JS</button>
    </div>
    <div class="tlc-message"></div>
  `;
  document.body.appendChild(root);
  state.panel = { root, message: root.querySelector('.tlc-message') };
  root.querySelectorAll('[data-kind]').forEach((button) => button.addEventListener('click', () => {
    state.kind = button.dataset.kind;
    renderTrafficLaneCalibrationPanel();
    drawTrafficLaneCalibrationOverlay(true);
  }));
  root.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', (event) => {
    const direction = button.dataset.direction;
    const step = Number(button.dataset.step) * TRAFFIC_LANE_CALIBRATION_STEP * (event.shiftKey ? 5 : 1);
    setTrafficLaneCalibrationValue(state.kind, direction, getTrafficLaneCalibrationValue(state.kind, direction) + step);
  }));
  root.querySelectorAll('input[type="number"]').forEach((input) => input.addEventListener('change', () => {
    setTrafficLaneCalibrationValue(state.kind, input.dataset.direction, Number(input.value));
  }));
  root.querySelector('.tlc-show-all').addEventListener('change', (event) => {
    state.showAll = event.currentTarget.checked;
    drawTrafficLaneCalibrationOverlay(true);
  });
  root.querySelector('[data-action="reset-kind"]').addEventListener('click', () => {
    resetTrafficLaneCalibration(state.kind);
    setTrafficLaneCalibrationMessage(`${TRAFFIC_LANE_KIND_LABELS[state.kind]} 已重設`, 'info');
  });
  root.querySelector('[data-action="reset-all"]').addEventListener('click', () => {
    resetTrafficLaneCalibration();
    setTrafficLaneCalibrationMessage('全部已重設為原本數值', 'info');
  });
  root.querySelector('[data-action="copy"]').addEventListener('click', () => {
    const copy = typeof copyVisualRouteCalibrationText === 'function'
      ? copyVisualRouteCalibrationText(buildTrafficLaneCalibrationSource())
      : Promise.reject(new Error('no clipboard helper'));
    copy.then(() => setTrafficLaneCalibrationMessage('已複製：貼返畀 Claude，或者貼落 traffic-visuals.js 嘅 TRAFFIC_LANE_OFFSETS', 'success'))
      .catch(() => setTrafficLaneCalibrationMessage('複製失敗', 'error'));
  });
  return state.panel;
}

function renderTrafficLaneCalibrationPanel() {
  const state = trafficLaneCalibration;
  const root = state.panel?.root;
  if (!root) return;
  root.querySelectorAll('[data-kind]').forEach((button) => {
    button.dataset.selected = String(button.dataset.kind === state.kind);
  });
  root.querySelectorAll('.tlc-row').forEach((row) => {
    const direction = row.dataset.direction;
    const value = getTrafficLaneCalibrationValue(state.kind, direction);
    const input = row.querySelector('input');
    if (input && document.activeElement !== input) input.value = value.toFixed(3);
    row.dataset.changed = String(getTrafficLaneCalibrationOffset(state.kind, direction) !== null);
    row.title = `原本 ${trafficLaneShippedOffset(state.kind, direction).toFixed(3)}`;
  });
}

function setTrafficLaneCalibrationMessage(text, tone = 'info') {
  const message = trafficLaneCalibration.panel?.message;
  if (!message) return;
  message.textContent = hasTrafficLaneCalibrationChanges() && tone === 'info'
    ? `${text} · 有改動未寫入程式（記得複製 JS）`
    : text;
  message.dataset.tone = tone;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

function teardownTrafficLaneCalibrator() {
  const state = trafficLaneCalibration;
  state.active = false;
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  if (state.graphics) { state.graphics.destroy(); state.graphics = null; }
  state.viewKey = '';
  if (state.panel?.root) state.panel.root.hidden = true;
}

function toggleTrafficLaneCalibrator(scene) {
  if (!scene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
    || !isVisualRouteCalibrationTestModeEnabled()) return false;
  const state = trafficLaneCalibration;
  if (state.active) {
    teardownTrafficLaneCalibrator();
    return false;
  }
  state.scene = scene;
  state.active = true;
  const panel = createTrafficLaneCalibrationPanel();
  if (panel) panel.root.hidden = false;
  renderTrafficLaneCalibrationPanel();
  drawTrafficLaneCalibrationOverlay(true);
  state.timer = setInterval(() => drawTrafficLaneCalibrationOverlay(false), TRAFFIC_LANE_CALIBRATION_REDRAW_MS);
  return true;
}

function isTrafficLaneCalibrationActive() {
  return trafficLaneCalibration.active;
}

const trafficLaneCalibratorTestApi = {
  state: trafficLaneCalibration,
  getTrafficLaneCalibrationOffset,
  getTrafficLaneCalibrationValue,
  setTrafficLaneCalibrationValue,
  resetTrafficLaneCalibration,
  buildTrafficLaneCalibrationSource,
  hasTrafficLaneCalibrationChanges,
  toggleTrafficLaneCalibrator,
  teardownTrafficLaneCalibrator,
  isTrafficLaneCalibrationActive,
};

if (typeof module !== 'undefined' && module.exports) module.exports = trafficLaneCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    getTrafficLaneCalibrationOffset,
    toggleTrafficLaneCalibrator,
    teardownTrafficLaneCalibrator,
    isTrafficLaneCalibrationActive,
  });
}
