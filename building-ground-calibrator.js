// 建築地盤校正 (test-mode dev tool): marks where a building model's lot meets the ground, so the
// game sizes and anchors it by its lot instead of by its whole picture (building-ground-fit.js,
// main.js applyBuildingGroundFit).
//
// While open it owns the mouse like the street-prop calibrators: the game's tools stand down, the
// cursor becomes a hand, and a click picks the building whose drawn pixels are under it. The picked
// building shows the footprint it stands on (white diamond) and its three ground corners (left,
// front, right; green dots joined into the lot they imply). Drag a dot onto the art's real corner -
// the building re-fits on release, and every other building of the same model with it. Keys 1/2/3
// pick a dot, arrow keys move it a source pixel (Shift: five), Esc drops the pick; right-drag pans.
//
// A model without corners keeps the default whole-width fit and shows the automatic proposal in
// yellow; 「套用偵測」 or dragging a yellow dot adopts it. Work is kept in this browser until copied:
// 「複製 JSON」 copies the whole BUILDING_GROUND_CORNERS table (shipped entries plus local edits)
// to paste into constants.js.

const BUILDING_GROUND_CALIBRATION_STORAGE_KEY = 'building-ground-calibration:v1';
const BUILDING_GROUND_CORNER_NAMES = Object.freeze(['left', 'front', 'right']);
const BUILDING_GROUND_CORNER_LABELS = Object.freeze({ left: '左角', front: '前角', right: '右角' });
const BUILDING_GROUND_HANDLE_RADIUS_PX = 7;   // screen pixels
const BUILDING_GROUND_PICK_ALPHA = 24;
const BUILDING_GROUND_COLORS = Object.freeze({
  lot: 0x7ce8a8,
  proposal: 0xffd24a,
  footprint: 0xffffff,
  hover: 0xffffff,
});

// logicalPath -> { left, front, right } (source-PNG pixels) or null (= use the default fit).
const buildingGroundCalibrationOverrides = loadBuildingGroundCalibrationOverrides();

function loadBuildingGroundCalibrationOverrides() {
  try {
    const raw = globalThis.localStorage?.getItem(BUILDING_GROUND_CALIBRATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistBuildingGroundCalibrationOverrides() {
  try {
    globalThis.localStorage?.setItem(BUILDING_GROUND_CALIBRATION_STORAGE_KEY, JSON.stringify(buildingGroundCalibrationOverrides));
  } catch { /* storage unavailable: the edits last until reload */ }
}

// undefined: no local edit for this model (the shipped table applies).
function getBuildingGroundCalibrationCorners(logicalPath) {
  return Object.prototype.hasOwnProperty.call(buildingGroundCalibrationOverrides, logicalPath)
    ? buildingGroundCalibrationOverrides[logicalPath]
    : undefined;
}

function getShippedBuildingGroundCorners(logicalPath) {
  return (typeof BUILDING_GROUND_CORNERS !== 'undefined' && BUILDING_GROUND_CORNERS[logicalPath]) || null;
}

function roundBuildingGroundPoint([x, y]) {
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

// The whole table as it would ship: shipped entries, then local edits on top (null removes one).
function buildBuildingGroundCornerTable() {
  const table = { ...(typeof BUILDING_GROUND_CORNERS !== 'undefined' ? BUILDING_GROUND_CORNERS : {}) };
  Object.entries(buildingGroundCalibrationOverrides).forEach(([path, corners]) => {
    if (corners) table[path] = corners;
    else delete table[path];
  });
  return Object.fromEntries(Object.keys(table).sort().map((path) => [path, {
    left: roundBuildingGroundPoint(table[path].left),
    front: roundBuildingGroundPoint(table[path].front),
    right: roundBuildingGroundPoint(table[path].right),
  }]));
}

const buildingGroundCalibrator = (() => {
  let active = false;
  let scene = null;
  let panel = null;
  let overlay = null;
  let inputHandlers = null;
  let keyHandler = null;
  let savedCursor = null;
  let selected = null;       // building sprite
  let hover = null;
  let activeCorner = 'front';
  let drag = null;           // { corner, transform, corners }
  let proposalCache = new Map(); // logicalPath -> corners (source px) | null

  const isLive = (sprite) => !!sprite && sprite.scene !== undefined && sprite.active !== false;
  const zoom = () => scene?.cameras?.main?.zoom || 1;

  function buildings() {
    return scene?.buildingSprites ? [...new Set(scene.buildingSprites.values())].filter(isLive) : [];
  }

  function sourceImageOf(sprite) {
    return sprite?.texture?.getSourceImage?.() ?? null;
  }

  // Sprite transform (texture pixel <-> world), captured so a drag is not disturbed by a re-fit.
  function transformOf(sprite) {
    const source = sourceImageOf(sprite);
    const mapping = typeof getModelTexturePixelMapping === 'function'
      ? getModelTexturePixelMapping(sprite.modelLogicalPath, source)
      : { resize: 1, offsetX: 0, offsetY: 0 };
    return {
      x: sprite.x,
      y: sprite.y,
      originX: sprite.displayOriginX ?? 0,
      originY: sprite.displayOriginY ?? 0,
      scaleX: sprite.scaleX || 1,
      scaleY: sprite.scaleY || 1,
      mapping,
    };
  }

  function sourceToWorld(transform, [x, y]) {
    const tx = x * transform.mapping.resize + transform.mapping.offsetX;
    const ty = y * transform.mapping.resize + transform.mapping.offsetY;
    return { x: transform.x + (tx - transform.originX) * transform.scaleX, y: transform.y + (ty - transform.originY) * transform.scaleY };
  }

  function worldToSource(transform, x, y) {
    const tx = (x - transform.x) / transform.scaleX + transform.originX;
    const ty = (y - transform.y) / transform.scaleY + transform.originY;
    return [(tx - transform.mapping.offsetX) / transform.mapping.resize, (ty - transform.mapping.offsetY) / transform.mapping.resize];
  }

  // Automatic proposal from the loaded texture's alpha, converted to source pixels.
  function proposalFor(sprite) {
    const path = sprite.modelLogicalPath;
    if (proposalCache.has(path)) return proposalCache.get(path);
    let corners = null;
    const mask = typeof getStreetPropAlphaMask === 'function' ? getStreetPropAlphaMask(scene, sprite.texture?.key) : null;
    if (mask && typeof detectBuildingGroundCorners === 'function') {
      const detected = detectBuildingGroundCorners(mask.alpha, mask.width, mask.height);
      if (detected) {
        const { mapping } = transformOf(sprite);
        const toSource = ([x, y]) => roundBuildingGroundPoint([(x - mapping.offsetX) / mapping.resize, (y - mapping.offsetY) / mapping.resize]);
        corners = { left: toSource(detected.left), front: toSource(detected.front), right: toSource(detected.right), confident: detected.confident };
      }
    }
    proposalCache.set(path, corners);
    return corners;
  }

  // What the picked model uses now, and where that came from.
  function cornersState(sprite) {
    const path = sprite?.modelLogicalPath;
    if (!path) return { corners: null, source: 'none' };
    const local = getBuildingGroundCalibrationCorners(path);
    if (local !== undefined) return { corners: local, source: local ? 'local' : 'local-default' };
    const shipped = getShippedBuildingGroundCorners(path);
    if (shipped) return { corners: shipped, source: 'shipped' };
    return { corners: null, source: 'default' };
  }

  function commit(path, corners) {
    buildingGroundCalibrationOverrides[path] = corners
      ? { left: roundBuildingGroundPoint(corners.left), front: roundBuildingGroundPoint(corners.front), right: roundBuildingGroundPoint(corners.right) }
      : null;
    persistBuildingGroundCalibrationOverrides();
    refit(path);
  }

  function refit(path) {
    const count = typeof refitBuildingSprites === 'function' ? refitBuildingSprites(scene, path) : 0;
    renderPanel();
    drawOverlay();
    return count;
  }

  // ── Picking ────────────────────────────────────────────────────────────────

  function pickBuildingAt(worldX, worldY) {
    let best = null;
    let bestDepth = -Infinity;
    buildings().forEach((sprite) => {
      if (!sprite.visible) return;
      const scaleX = Math.abs(sprite.scaleX || 1);
      const scaleY = Math.abs(sprite.scaleY || 1);
      const left = sprite.x - (sprite.displayOriginX ?? 0) * scaleX;
      const top = sprite.y - (sprite.displayOriginY ?? 0) * scaleY;
      const px = Math.floor((worldX - left) / scaleX);
      const py = Math.floor((worldY - top) / scaleY);
      if (px < 0 || py < 0 || px >= (sprite.width || 0) || py >= (sprite.height || 0)) return;
      const mask = typeof getStreetPropAlphaMask === 'function' ? getStreetPropAlphaMask(scene, sprite.texture?.key) : null;
      if (mask && mask.alpha[py * mask.width + px] < BUILDING_GROUND_PICK_ALPHA) return;
      if ((sprite.depth ?? 0) >= bestDepth) { best = sprite; bestDepth = sprite.depth ?? 0; }
    });
    return best;
  }

  function handleAt(worldX, worldY) {
    if (!selected) return null;
    const { corners } = cornersState(selected);
    const shown = corners ?? proposalFor(selected);
    if (!shown) return null;
    const transform = transformOf(selected);
    const reach = (BUILDING_GROUND_HANDLE_RADIUS_PX + 4) / zoom();
    let best = null;
    let bestDistance = reach;
    BUILDING_GROUND_CORNER_NAMES.forEach((name) => {
      const point = sourceToWorld(transform, shown[name]);
      const distance = Math.hypot(point.x - worldX, point.y - worldY);
      if (distance <= bestDistance) { best = name; bestDistance = distance; }
    });
    return best;
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  function drawOverlay() {
    if (!overlay) return;
    overlay.clear();
    if (selected && !isLive(selected)) selected = null;
    if (hover && !isLive(hover)) hover = null;
    const z = zoom();
    if (hover && hover !== selected) {
      const scaleX = Math.abs(hover.scaleX || 1);
      const scaleY = Math.abs(hover.scaleY || 1);
      overlay.lineStyle(1.5 / z, BUILDING_GROUND_COLORS.hover, 0.8);
      overlay.strokeRect(hover.x - hover.displayOriginX * scaleX, hover.y - hover.displayOriginY * scaleY, hover.width * scaleX, hover.height * scaleY);
    }
    if (!selected) return;

    // The footprint it should stand on: the sprite's anchor point is the lot's front corner.
    const cols = selected.footprintCols ?? 1;
    const rows = selected.footprintRows ?? 1;
    const width = typeof getFootprintScreenWidth === 'function' ? getFootprintScreenWidth(cols, rows) : (cols + rows) * 50;
    const fx = selected.x - (selected.spriteOffsetX ?? 0);
    const fy = selected.y - (selected.spriteOffsetY ?? 0);
    overlay.lineStyle(2 / z, BUILDING_GROUND_COLORS.footprint, 0.9);
    overlay.strokePoints([
      { x: fx, y: fy }, { x: fx - width / 2, y: fy - width / 4 }, { x: fx, y: fy - width / 2 }, { x: fx + width / 2, y: fy - width / 4 },
    ], true, true);

    const { corners } = cornersState(selected);
    const shown = drag?.corners ?? corners ?? proposalFor(selected);
    if (!shown) return;
    const isProposal = !drag && !corners;
    const color = isProposal ? BUILDING_GROUND_COLORS.proposal : BUILDING_GROUND_COLORS.lot;
    const transform = drag?.transform ?? transformOf(selected);
    const left = sourceToWorld(transform, shown.left);
    const front = sourceToWorld(transform, shown.front);
    const right = sourceToWorld(transform, shown.right);
    const back = { x: left.x + right.x - front.x, y: left.y + right.y - front.y };
    overlay.fillStyle(color, 0.12);
    overlay.fillPoints([front, left, back, right], true);
    overlay.lineStyle(2.5 / z, color, 1);
    overlay.strokePoints([front, left, back, right], true, true);
    [['left', left], ['front', front], ['right', right]].forEach(([name, point]) => {
      const radius = BUILDING_GROUND_HANDLE_RADIUS_PX / z;
      overlay.fillStyle(name === activeCorner ? color : 0x10281a, 1);
      overlay.fillCircle(point.x, point.y, radius);
      overlay.lineStyle(2 / z, name === activeCorner ? 0xffffff : color, 1);
      overlay.strokeCircle(point.x, point.y, radius);
    });
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  function select(sprite) {
    selected = sprite;
    drag = null;
    renderPanel();
    drawOverlay();
  }

  function installInput(targetScene) {
    if (inputHandlers || !targetScene?.input?.on) return;
    const depth = typeof VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH === 'number' ? VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH - 3 : 1e9;
    overlay = targetScene.add?.graphics?.()?.setDepth?.(depth) ?? null;
    inputHandlers = {
      pointerdown: (pointer) => {
        if (pointer.button !== 0) return;
        const corner = handleAt(pointer.worldX, pointer.worldY);
        if (corner) {
          activeCorner = corner;
          const { corners } = cornersState(selected);
          const start = corners ?? proposalFor(selected);
          drag = {
            corner,
            transform: transformOf(selected),
            corners: { left: [...start.left], front: [...start.front], right: [...start.right] },
            moved: false,
          };
          renderPanel();
          drawOverlay();
          return;
        }
        const hit = pickBuildingAt(pointer.worldX, pointer.worldY);
        select(hit);
        if (!hit) setMessage('冇揀中建築：點建築本身', 'info');
        else if (!hit.modelLogicalPath) setMessage('呢座建築冇模型路徑，校正唔到', 'error');
      },
      pointermove: (pointer) => {
        if (drag && !pointer.isDown) finishDrag();
        if (drag) {
          drag.corners[drag.corner] = worldToSource(drag.transform, pointer.worldX, pointer.worldY);
          drag.moved = true;
          renderPanel();
          drawOverlay();
          return;
        }
        const next = pickBuildingAt(pointer.worldX, pointer.worldY);
        if (next !== hover) {
          hover = next;
          drawOverlay();
        }
      },
      pointerup: () => finishDrag(),
    };
    Object.entries(inputHandlers).forEach(([event, handler]) => targetScene.input.on(event, handler));
    savedCursor = targetScene.input.manager?.defaultCursor ?? '';
    targetScene.input.setDefaultCursor?.('pointer');
  }

  function finishDrag() {
    if (!drag) return;
    const { moved, corners } = drag;
    drag = null;
    if (moved && selected?.modelLogicalPath) {
      commit(selected.modelLogicalPath, corners);
      setMessage(`${BUILDING_GROUND_CORNER_LABELS[activeCorner]}已記錄（方向鍵 1px，Shift 5px）`, 'success');
    } else {
      drawOverlay();
    }
  }

  function uninstallInput(targetScene) {
    if (inputHandlers && targetScene?.input?.off) {
      Object.entries(inputHandlers).forEach(([event, handler]) => targetScene.input.off(event, handler));
      targetScene.input.setDefaultCursor?.(savedCursor || '');
    }
    inputHandlers = null;
    drag = null;
    selected = null;
    hover = null;
    overlay?.destroy?.();
    overlay = null;
  }

  function nudge(dx, dy) {
    if (!selected?.modelLogicalPath) {
      setMessage('先點選一座建築', 'info');
      return;
    }
    const { corners } = cornersState(selected);
    const start = corners ?? proposalFor(selected);
    if (!start) return;
    const next = { left: [...start.left], front: [...start.front], right: [...start.right] };
    next[activeCorner] = [next[activeCorner][0] + dx, next[activeCorner][1] + dy];
    commit(selected.modelLogicalPath, next);
  }

  function handleKey(event) {
    if (!active) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (event.key === 'Escape' && selected) {
      select(null);
      return;
    }
    if (!selected) return; // leave the arrow keys to the camera
    const cornerKeys = { 1: 'left', 2: 'front', 3: 'right' };
    if (cornerKeys[event.key]) {
      activeCorner = cornerKeys[event.key];
      renderPanel();
      drawOverlay();
      return;
    }
    const step = event.shiftKey ? 5 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      nudge(...moves[event.key]);
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function applyProposal() {
    const path = selected?.modelLogicalPath;
    const proposal = selected && proposalFor(selected);
    if (!path || !proposal) {
      setMessage(selected ? '偵測唔到地盤邊：請手動拖三個點' : '先點選一座建築', 'info');
      return;
    }
    commit(path, proposal);
    setMessage(proposal.confident ? '已套用自動偵測' : '已套用自動偵測（信心低，請檢查三個點）', proposal.confident ? 'success' : 'info');
  }

  function useDefaultFit() {
    const path = selected?.modelLogicalPath;
    if (!path) return;
    commit(path, null);
    setMessage('呢個模型改返用預設（全闊度）對位', 'info');
  }

  function revertModel() {
    const path = selected?.modelLogicalPath;
    if (!path) return;
    delete buildingGroundCalibrationOverrides[path];
    persistBuildingGroundCalibrationOverrides();
    refit(path);
    setMessage(getShippedBuildingGroundCorners(path) ? '已還原為出廠校正' : '已還原：呢個模型出廠冇校正，用預設對位', 'info');
  }

  function clearAll() {
    const paths = Object.keys(buildingGroundCalibrationOverrides);
    paths.forEach((path) => { delete buildingGroundCalibrationOverrides[path]; });
    persistBuildingGroundCalibrationOverrides();
    paths.forEach((path) => refit(path));
    setMessage(`已清除 ${paths.length} 個本機校正`, 'info');
  }

  function buildRecord() {
    return {
      kind: 'building-ground-corners',
      note: 'Paste the table into constants.js as BUILDING_GROUND_CORNERS. Corners are the left, front and right points where each model\'s lot meets the ground, in source-PNG pixels.',
      localEdits: Object.keys(buildingGroundCalibrationOverrides).sort(),
      BUILDING_GROUND_CORNERS: buildBuildingGroundCornerTable(),
      recordedAt: new Date().toISOString(),
    };
  }

  // ── Panel ──────────────────────────────────────────────────────────────────

  function ensureStyle() {
    if (document.getElementById('building-ground-calibrator-style')) return;
    const style = document.createElement('style');
    style.id = 'building-ground-calibrator-style';
    style.textContent = `
      .building-ground-calibrator-panel {
        position: fixed; bottom: 18px; left: 14px; z-index: 100000;
        width: min(340px, calc(100vw - 28px)); box-sizing: border-box; padding: 12px;
        border: 1px solid rgba(124, 232, 168, 0.75); border-radius: 12px;
        color: #eafff2; background: rgba(8, 30, 18, 0.94);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        user-select: text; pointer-events: auto; backdrop-filter: blur(8px);
      }
      .building-ground-calibrator-panel[hidden] { display: none !important; }
      .building-ground-calibrator-panel .bgc-title { font-weight: 800; color: #7ce8a8; letter-spacing: .04em; margin-bottom: 6px; display: flex; justify-content: space-between; cursor: move; }
      .building-ground-calibrator-panel .bgc-title::after { content: '⠿'; color: #3f8f63; font-weight: 400; }
      .building-ground-calibrator-panel .bgc-hint { color: #bfe8cf; margin-bottom: 8px; }
      .building-ground-calibrator-panel .bgc-model { color: #fff; font-weight: 700; word-break: break-all; }
      .building-ground-calibrator-panel .bgc-status { margin: 2px 0 6px; }
      .building-ground-calibrator-panel .bgc-status[data-source="default"] { color: #ffd24a; }
      .building-ground-calibrator-panel .bgc-status[data-source="local"],
      .building-ground-calibrator-panel .bgc-status[data-source="local-default"] { color: #ffb070; }
      .building-ground-calibrator-panel .bgc-row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
      .building-ground-calibrator-panel .bgc-row[data-active="true"] { color: #7ce8a8; font-weight: 700; }
      .building-ground-calibrator-panel .bgc-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
      .building-ground-calibrator-panel button {
        border: 1px solid #3f8f63; border-radius: 7px; padding: 6px 7px;
        color: #eafff2; background: #143a25; font: inherit; cursor: pointer;
      }
      .building-ground-calibrator-panel button:hover { background: #1d5234; }
      .building-ground-calibrator-panel button:disabled { opacity: .45; cursor: default; }
      .building-ground-calibrator-panel .bgc-message { min-height: 16px; margin-top: 7px; color: #bfe8cf; }
      .building-ground-calibrator-panel .bgc-message[data-tone="success"] { color: #7ce8a8; }
      .building-ground-calibrator-panel .bgc-message[data-tone="error"] { color: #ff9a9a; }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if (panel) return panel;
    if (typeof document === 'undefined' || !document.body) return null;
    ensureStyle();
    const root = document.createElement('section');
    root.id = 'building-ground-calibrator-panel';
    root.className = 'building-ground-calibrator-panel';
    root.hidden = true;
    root.setAttribute('aria-label', 'Building ground corner calibrator');
    root.innerHTML = `
      <div class="bgc-title">建築地盤校正</div>
      <div class="bgc-hint">點選建築：白色菱形係佢應該企嘅格仔，綠點係模型地盤嘅左、前、右角。將三點拖到圖中地盤真正嘅角（前角可以喺圖外）。1/2/3 揀點、方向鍵 1px（Shift 5px）、Esc 取消；右鍵拖曳移動鏡頭。黃色＝自動偵測建議，未生效。</div>
      <div class="bgc-model"></div>
      <div class="bgc-status"></div>
      <div class="bgc-corners"></div>
      <div class="bgc-actions">
        <button type="button" data-action="apply">套用偵測</button>
        <button type="button" data-action="default">用預設對位</button>
        <button type="button" data-action="revert">還原出廠</button>
        <button type="button" data-action="copy">複製 JSON</button>
        <button type="button" data-action="clear">清除全部本機校正</button>
      </div>
      <div class="bgc-message"></div>
    `;
    document.body.appendChild(root);
    if (typeof makeCalibratorPanelDraggable === 'function') {
      makeCalibratorPanelDraggable(root, root.querySelector('.bgc-title'), 'calibrator-panel:building-ground');
    }
    panel = {
      root,
      model: root.querySelector('.bgc-model'),
      status: root.querySelector('.bgc-status'),
      corners: root.querySelector('.bgc-corners'),
      message: root.querySelector('.bgc-message'),
      buttons: Object.fromEntries([...root.querySelectorAll('[data-action]')].map((button) => [button.dataset.action, button])),
    };
    panel.buttons.apply.addEventListener('click', () => applyProposal());
    panel.buttons.default.addEventListener('click', () => useDefaultFit());
    panel.buttons.revert.addEventListener('click', () => revertModel());
    panel.buttons.clear.addEventListener('click', () => clearAll());
    panel.buttons.copy.addEventListener('click', () => {
      copyVisualRouteCalibrationText(JSON.stringify(buildRecord(), null, 2))
        .then(() => setMessage('JSON 已複製，貼入 constants.js（BUILDING_GROUND_CORNERS）', 'success'))
        .catch(() => setMessage('複製失敗', 'error'));
    });
    return panel;
  }

  function setMessage(text, tone = 'info') {
    if (!panel) return;
    panel.message.textContent = String(text || '');
    panel.message.dataset.tone = tone;
  }

  const SOURCE_LABELS = {
    shipped: '出廠校正',
    local: '本機校正（未匯出）',
    'local-default': '本機設定：用預設對位（未匯出）',
    default: '未校正：用緊預設（全闊度）對位',
    none: '',
  };

  function renderPanel() {
    if (!panel) return;
    panel.root.hidden = !active;
    if (!active) return;
    const path = selected?.modelLogicalPath ?? null;
    const localCount = Object.keys(buildingGroundCalibrationOverrides).length;
    panel.buttons.clear.textContent = `清除全部本機校正（${localCount}）`;
    ['apply', 'default', 'revert'].forEach((action) => { panel.buttons[action].disabled = !path; });
    if (!selected) {
      panel.model.textContent = `城中有 ${buildings().length} 座建築：點選一座`;
      panel.status.textContent = '';
      panel.corners.replaceChildren();
      return;
    }
    const sameModel = buildings().filter((sprite) => sprite.modelLogicalPath === path).length;
    panel.model.textContent = `${String(path ?? selected.logicalSpriteKey).split('/').pop()}（${selected.footprintCols ?? 1}×${selected.footprintRows ?? 1}，城中 ${sameModel} 座）`;
    const state = cornersState(selected);
    panel.status.dataset.source = state.source;
    panel.status.textContent = SOURCE_LABELS[state.source] ?? '';
    const shown = drag?.corners ?? state.corners ?? proposalFor(selected);
    panel.corners.replaceChildren(...BUILDING_GROUND_CORNER_NAMES.map((name) => {
      const row = document.createElement('div');
      row.className = 'bgc-row';
      row.dataset.active = String(name === activeCorner);
      const label = document.createElement('span');
      label.textContent = `${BUILDING_GROUND_CORNER_NAMES.indexOf(name) + 1} ${BUILDING_GROUND_CORNER_LABELS[name]}`;
      const value = document.createElement('span');
      value.textContent = shown ? roundBuildingGroundPoint(shown[name]).join(', ') : '—';
      row.append(label, value);
      return row;
    }));
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function start(targetScene) {
    active = true;
    scene = targetScene;
    proposalCache = new Map();
    installInput(targetScene);
    createPanel();
    renderPanel();
    if (!keyHandler && typeof document !== 'undefined') {
      keyHandler = handleKey;
      document.addEventListener('keydown', keyHandler);
    }
    setMessage('', 'info');
  }

  function teardown() {
    active = false;
    uninstallInput(scene);
    if (keyHandler && typeof document !== 'undefined') {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (panel?.root) panel.root.hidden = true;
  }

  function toggle(targetScene) {
    if (!targetScene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
      || !isVisualRouteCalibrationTestModeEnabled()) return false;
    if (active) {
      teardown();
      return false;
    }
    start(targetScene);
    return true;
  }

  return {
    id: 'building-ground',
    isActive: () => active,
    // The game's input guard (isAnyStreetPropCalibratorCapturing) asks every calibrator this.
    isPickerActive: () => active,
    toggle,
    teardown,
    pickBuildingAt: (worldX, worldY) => pickBuildingAt(worldX, worldY),
    select,
    nudge,
    applyProposal,
    useDefaultFit,
    revertModel,
    buildRecord,
    setActiveCorner: (name) => { activeCorner = name; },
  };
})();

if (typeof STREET_PROP_CALIBRATORS !== 'undefined') STREET_PROP_CALIBRATORS.push(buildingGroundCalibrator);

function toggleBuildingGroundCalibrator(scene) {
  return buildingGroundCalibrator.toggle(scene);
}

function teardownBuildingGroundCalibrator() {
  return buildingGroundCalibrator.teardown();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildingGroundCalibrator,
    getBuildingGroundCalibrationCorners,
    buildBuildingGroundCornerTable,
    buildingGroundCalibrationOverrides,
  };
}
