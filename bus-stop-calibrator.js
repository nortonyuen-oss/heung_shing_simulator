// Bus-stop shoulder-offset calibrator (test-branch-only dev tool).
//
// Reuses the shared test-mode gate / clipboard helper from
// visual-route-calibrator.js. Unlike the airport/vessel calibrators (which
// spawn their own preview markers to drag), this makes the REAL, already-
// placed bus-stop sprites directly draggable — there's nothing to preview,
// the player's existing stops ARE the calibration target. Dragging any one
// instance of a corner (UR/UL/LL/LR) updates that corner's shared pixel
// offset (relative to its tile's centre) and immediately repositions every
// other placed stop sharing that corner, so the effect of one drag is
// visible everywhere at once.

const BUS_STOP_CALIBRATION_SCHEMA_VERSION = 1;
const BUS_STOP_CALIBRATION_CORNERS = Object.freeze(['ur', 'ul', 'll', 'lr']);
const busStopCalibrationOverrides = {}; // corner -> { dx, dy } | undefined
let busStopCalibrationActive = false;
let busStopCalibrationScene = null;
let busStopCalibrationPanel = null;
// Off by default even while the calibrator panel is open: the normal game
// tools (road, bulldoze, inspect…) still see every click until the player
// deliberately flips this on, since otherwise the currently-selected tool
// fires at the same time as the drag (e.g. bulldozing the road under a stop
// while trying to pick it up). isVisualRouteCalibrationInputCaptured
// (visual-route-calibrator.js) — the same choke point that already suppresses
// normal input during a vessel/airport calibration drag — checks this flag
// too, so every tool-input listener in main.js is covered for free.
let busStopPickerActive = false;

// Read by getBusStopAnchorPoint (main.js): once a corner has been dragged
// this session, its calibrated pixel offset wins over the shipped default
// formula. Returns null (fall through to the default) until then.
function getBusStopCalibrationOverride(corner) {
  return busStopCalibrationOverrides[corner] ?? null;
}

function isBusStopCalibrationActive() {
  return busStopCalibrationActive;
}

function isBusStopPickerActive() {
  return busStopPickerActive;
}

function setBusStopPickerActive(active) {
  busStopPickerActive = !!active;
  renderBusStopCalibrationPanel();
  return busStopPickerActive;
}

function buildBusStopCalibrationRecord() {
  const corners = {};
  BUS_STOP_CALIBRATION_CORNERS.forEach((corner) => {
    const override = busStopCalibrationOverrides[corner];
    if (!override) return;
    corners[corner] = {
      dx: visualRouteCalibrationRound(override.dx),
      dy: visualRouteCalibrationRound(override.dy),
    };
  });
  return {
    schemaVersion: BUS_STOP_CALIBRATION_SCHEMA_VERSION,
    kind: 'bus-stop-shoulder-offset',
    note: 'dx/dy are pixel offsets from the tile centre. Calibrate at the default North view (mapRotation 0) — the corner labels are screen-relative and only mean what they say there.',
    corners,
    recordedAt: new Date().toISOString(),
  };
}

function refreshAllBusStopSpritesForCalibration(scene) {
  scene?.busStopSprites?.forEach((sprite) => positionBusStopSprite(scene, sprite));
}

function makeBusStopSpriteDraggable(scene, sprite) {
  if (!scene || !sprite || sprite.__busStopCalibrationWired) return;
  sprite.__busStopCalibrationWired = true;
  sprite.setInteractive({ useHandCursor: true });
  scene.input?.setDraggable?.(sprite, true);
  sprite.on('drag', (pointer, dragX, dragY) => {
    sprite.setPosition(dragX, dragY);
    const geo = getTileFaceGeometry(sprite.mapRow, sprite.mapCol, scene.offsetX, scene.offsetY);
    const corner = getBusStopAnchorCorner(sprite.busStopRawSide);
    busStopCalibrationOverrides[corner] = { dx: dragX - geo.center.x, dy: dragY - geo.center.y };
    refreshAllBusStopSpritesForCalibration(scene);
    renderBusStopCalibrationPanel();
  });
  sprite.on('dragend', () => {
    setBusStopCalibrationMessage(`${getBusStopVisualCorner(sprite.busStopRawSide).toUpperCase()} 已記錄`, 'success');
  });
}

function enableBusStopCalibrationDrag(scene) {
  scene?.busStopSprites?.forEach((sprite) => makeBusStopSpriteDraggable(scene, sprite));
}

function disableBusStopCalibrationDrag(scene) {
  scene?.busStopSprites?.forEach((sprite) => {
    if (!sprite.__busStopCalibrationWired) return;
    sprite.__busStopCalibrationWired = false;
    sprite.off('drag');
    sprite.off('dragend');
    sprite.disableInteractive();
  });
}

function startBusStopCalibrator(scene) {
  busStopCalibrationActive = true;
  busStopCalibrationScene = scene;
  enableBusStopCalibrationDrag(scene);
  createBusStopCalibrationPanel();
  renderBusStopCalibrationPanel();
  setBusStopCalibrationMessage('拖曳任何已放置嘅巴士站', 'info');
}

function teardownBusStopCalibrator() {
  busStopCalibrationActive = false;
  busStopPickerActive = false;
  disableBusStopCalibrationDrag(busStopCalibrationScene);
  if (busStopCalibrationPanel?.root) busStopCalibrationPanel.root.hidden = true;
}

function toggleBusStopCalibrator(scene) {
  if (!scene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
    || !isVisualRouteCalibrationTestModeEnabled()) return false;
  if (busStopCalibrationActive) {
    teardownBusStopCalibrator();
    return false;
  }
  startBusStopCalibrator(scene);
  return true;
}

function resetBusStopCalibration() {
  BUS_STOP_CALIBRATION_CORNERS.forEach((corner) => { delete busStopCalibrationOverrides[corner]; });
  refreshAllBusStopSpritesForCalibration(busStopCalibrationScene);
  renderBusStopCalibrationPanel();
  setBusStopCalibrationMessage('已重設為原本位置', 'info');
}

// ── Panel ───────────────────────────────────────────────────────────────────

function createBusStopCalibrationPanel() {
  if (busStopCalibrationPanel) return busStopCalibrationPanel;
  if (typeof document === 'undefined' || !document.body) return null;
  if (!document.getElementById('bus-stop-calibrator-style')) {
    const style = document.createElement('style');
    style.id = 'bus-stop-calibrator-style';
    style.textContent = `
      #bus-stop-calibrator-panel {
        position: fixed; left: 14px; bottom: 18px; z-index: 100000;
        width: min(300px, calc(100vw - 28px)); box-sizing: border-box; padding: 12px;
        border: 1px solid rgba(90, 200, 255, 0.72); border-radius: 12px;
        color: #eaf8ff; background: rgba(6, 22, 31, 0.94);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        user-select: text; pointer-events: auto; backdrop-filter: blur(8px);
      }
      #bus-stop-calibrator-panel[hidden] { display: none !important; }
      #bus-stop-calibrator-panel .bsc-title { font-weight: 800; color: #5ac8ff; letter-spacing: .04em; margin-bottom: 6px; }
      #bus-stop-calibrator-panel .bsc-hint { color: #9fd6f0; margin-bottom: 8px; }
      #bus-stop-calibrator-panel .bsc-row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
      #bus-stop-calibrator-panel .bsc-row span:first-child { color: #9fd6f0; }
      #bus-stop-calibrator-panel .bsc-row span:last-child { color: #fff; }
      #bus-stop-calibrator-panel .bsc-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
      #bus-stop-calibrator-panel button {
        border: 1px solid #3f8fb0; border-radius: 7px; padding: 6px 7px;
        color: #eaf8ff; background: #123a4a; font: inherit; cursor: pointer;
      }
      #bus-stop-calibrator-panel button:hover { background: #1a5470; }
      #bus-stop-calibrator-panel .bsc-picker-btn { width: 100%; margin-bottom: 9px; font-weight: 700; }
      #bus-stop-calibrator-panel .bsc-picker-btn[data-active="true"] {
        background: #1f9d5c; border-color: #7ce8a8; color: #06210f;
      }
      #bus-stop-calibrator-panel .bsc-picker-btn[data-active="true"]:hover { background: #26b56a; }
      #bus-stop-calibrator-panel .bsc-message { min-height: 16px; margin-top: 7px; color: #9fd6f0; }
      #bus-stop-calibrator-panel .bsc-message[data-tone="success"] { color: #7ce8a8; }
      #bus-stop-calibrator-panel .bsc-message[data-tone="error"] { color: #ff9a9a; }
    `;
    document.head.appendChild(style);
  }
  const root = document.createElement('section');
  root.id = 'bus-stop-calibrator-panel';
  root.hidden = true;
  root.setAttribute('aria-label', 'Bus stop shoulder offset calibrator');
  root.innerHTML = `
    <div class="bsc-title">巴士站位置微調</div>
    <div class="bsc-hint">請喺預設（北）視角拖曳現有巴士站</div>
    <button type="button" class="bsc-picker-btn" data-action="toggle-picker" data-active="false">巴士站選取器：關閉</button>
    <div class="bsc-list"></div>
    <div class="bsc-actions">
      <button type="button" data-action="reset">重設</button>
      <button type="button" data-action="copy">複製 JSON</button>
    </div>
    <div class="bsc-message"></div>
  `;
  document.body.appendChild(root);
  const panel = {
    root,
    picker: root.querySelector('.bsc-picker-btn'),
    list: root.querySelector('.bsc-list'),
    message: root.querySelector('.bsc-message'),
  };
  root.querySelector('[data-action="toggle-picker"]').addEventListener('click', () => {
    const active = setBusStopPickerActive(!busStopPickerActive);
    setBusStopCalibrationMessage(
      active ? '選取器已開啟：滑鼠掣只會拖曳巴士站' : '選取器已關閉：滑鼠掣回復正常工具操作',
      'info',
    );
  });
  root.querySelector('[data-action="reset"]').addEventListener('click', () => resetBusStopCalibration());
  root.querySelector('[data-action="copy"]').addEventListener('click', () => {
    const record = buildBusStopCalibrationRecord();
    copyVisualRouteCalibrationText(JSON.stringify(record, null, 2))
      .then(() => setBusStopCalibrationMessage('JSON 已複製', 'success'))
      .catch(() => setBusStopCalibrationMessage('複製失敗', 'error'));
  });
  busStopCalibrationPanel = panel;
  return panel;
}

function setBusStopCalibrationMessage(text, tone = 'info') {
  if (!busStopCalibrationPanel) return;
  busStopCalibrationPanel.message.textContent = String(text || '');
  busStopCalibrationPanel.message.dataset.tone = tone;
}

function renderBusStopCalibrationPanel() {
  const panel = busStopCalibrationPanel;
  if (!panel) return;
  panel.root.hidden = !busStopCalibrationActive;
  if (panel.picker) {
    panel.picker.dataset.active = String(busStopPickerActive);
    panel.picker.textContent = `巴士站選取器：${busStopPickerActive ? '開啟' : '關閉'}`;
  }
  if (!busStopCalibrationActive) return;
  panel.list.replaceChildren(...BUS_STOP_CALIBRATION_CORNERS.map((corner) => {
    const override = busStopCalibrationOverrides[corner];
    const row = document.createElement('div');
    row.className = 'bsc-row';
    const name = document.createElement('span');
    name.textContent = corner.toUpperCase();
    const value = document.createElement('span');
    value.textContent = override
      ? `Δx ${visualRouteCalibrationRound(override.dx)}, Δy ${visualRouteCalibrationRound(override.dy)}`
      : '(未拖曳)';
    row.append(name, value);
    return row;
  }));
}

// ── Exports ─────────────────────────────────────────────────────────────────

const busStopCalibratorTestApi = {
  BUS_STOP_CALIBRATION_SCHEMA_VERSION,
  BUS_STOP_CALIBRATION_CORNERS,
  getBusStopCalibrationOverride,
  isBusStopCalibrationActive,
  isBusStopPickerActive,
  setBusStopPickerActive,
  buildBusStopCalibrationRecord,
  toggleBusStopCalibrator,
  makeBusStopSpriteDraggable,
};

if (typeof module !== 'undefined' && module.exports) module.exports = busStopCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleBusStopCalibrator,
    getBusStopCalibrationOverride,
    isBusStopPickerActive,
    isBusStopCalibrationActive,
    makeBusStopSpriteDraggable,
  });
}
