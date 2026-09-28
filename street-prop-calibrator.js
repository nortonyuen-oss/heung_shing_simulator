// Generic position calibrator for road-side props that come in a few screen facings
// (junction traffic signals, street lamps). Each prop family instantiates one calibrator
// (traffic-signal-calibrator.js, street-lamp-calibrator.js); the family's own module reads
// getOffset(facing) / getScale() while the calibrator is open.
//
// Workflow: the real sprites already standing in the city are the targets. While a calibrator is
// open it owns the mouse: the game's tools stand down (isVisualRouteCalibrationInputCaptured), the
// cursor becomes a hand, the prop under it is outlined, and a click picks the prop whose drawn
// pixels are under the pointer (not its padded canvas). The picked prop is highlighted, with a
// fainter outline on every other prop of the same facing, since they all move together.
// Dragging records that facing's pixel nudge relative to its geometric anchor; arrow keys nudge
// the picked facing by a pixel (Shift: five), Esc drops the pick, [ and ] resize. Right-drag
// still pans the camera. "複製 JSON" copies the values to paste into constants.js. Calibrate at
// the default North view: facings are screen-relative.

const STREET_PROP_CALIBRATION_SCHEMA_VERSION = 1;
// Every calibrator made here, so the game's input guard can ask whether any of them is open.
const STREET_PROP_CALIBRATORS = [];
const STREET_PROP_PICK_ALPHA = 24;       // a texture pixel this opaque counts as the prop
const STREET_PROP_PICK_TOLERANCE_PX = 4; // screen pixels of slack around a thin prop
const STREET_PROP_HIGHLIGHT = 0x7ce8a8;

function isAnyStreetPropCalibratorCapturing() {
  return STREET_PROP_CALIBRATORS.some((calibrator) => calibrator.isPickerActive());
}

// Alpha mask and drawn bounds of a prop texture, read once per texture key from its source image.
const streetPropAlphaMasks = new Map();
function getStreetPropAlphaMask(scene, textureKey) {
  if (streetPropAlphaMasks.has(textureKey)) return streetPropAlphaMasks.get(textureKey);
  let mask = null;
  try {
    const source = scene?.textures?.get?.(textureKey)?.getSourceImage?.();
    if (source && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(source, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const alpha = new Uint8Array(canvas.width * canvas.height);
      let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const a = pixels[(y * canvas.width + x) * 4 + 3];
          alpha[y * canvas.width + x] = a;
          if (a < STREET_PROP_PICK_ALPHA) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      mask = { width: canvas.width, height: canvas.height, alpha, bbox: maxX >= 0 ? { minX, minY, maxX, maxY } : null };
    }
  } catch { mask = null; }
  streetPropAlphaMasks.set(textureKey, mask);
  return mask;
}

function createStreetPropCalibrator(options) {
  const {
    id,                 // e.g. 'traffic-signal' (panel element id, record kind)
    title,              // panel title
    facings,            // ['sw', 'se', 'nw', 'ne']
    facingLabels = {},  // { sw: '...' }
    facingOf,           // (sprite) => facing
    sprites,            // (scene) => Map of sprites
    shippedOffsets,     // () => { facing: { dx, dy } }
    shippedScale,       // () => number, or (group) => number with scaleGroupOf
    // Optional: facing => group key. Each group then keeps its own size (e.g. one per prop
    // kind), adjusted through whichever facing was last dragged; without it there is one size.
    scaleGroupOf = null,
    scaleGroupLabels = {},
    refresh,            // (scene) => reposition every sprite
    note = '',          // sentence for the copied JSON
    extraRecord = () => ({}),
    scaleStep = 0.002,
    minScale = 0.005,
    maxScale = 0.5,
    panelLeftPx = 14,
  } = options;

  const offsets = {}; // facing -> { dx, dy }
  let scale = null;   // null = shipped (single-size calibrators)
  const groupScales = {}; // group -> size (scaleGroupOf calibrators)
  let active = false;
  let scene = null;
  let panel = null;
  let pickerActive = false;
  let selectedFacing = null;
  let keyHandler = null;
  // The in-city selector (installed while open).
  let selectedSprite = null;
  let hoverSprite = null;
  let drag = null;
  let overlay = null;
  let inputHandlers = null;
  let savedCursor = null;

  const round = (value) => Math.round(value * 1000) / 1000;
  const shippedOffset = (facing) => shippedOffsets()[facing] ?? { dx: 0, dy: 0 };

  function getOffset(facing) {
    return offsets[facing] ?? null;
  }

  function getScale(group) {
    if (scaleGroupOf) return groupScales[group] ?? null;
    return scale;
  }

  const scaleGroups = () => (scaleGroupOf ? [...new Set(facings.map(scaleGroupOf))] : []);
  const selectedGroup = () => (scaleGroupOf && selectedFacing ? scaleGroupOf(selectedFacing) : null);

  function isActive() {
    return active;
  }

  // While the picker is on, every normal-tool input listener guarded by
  // isVisualRouteCalibrationInputCaptured (visual-route-calibrator.js) is suppressed, so a drag
  // on a sprite can't also bulldoze the road under it.
  // Open = owns the mouse. (setPickerActive remains for callers that capture without opening.)
  function isPickerActive() {
    return active || pickerActive;
  }

  function setPickerActive(value) {
    pickerActive = !!value;
    renderPanel();
    return pickerActive;
  }

  function doRefresh() {
    if (scene) refresh(scene);
  }

  function buildRecord() {
    const facingsOut = {};
    facings.forEach((facing) => {
      const override = offsets[facing];
      facingsOut[facing] = override
        ? { dx: round(override.dx), dy: round(override.dy) }
        : { ...shippedOffset(facing) };
    });
    return {
      schemaVersion: STREET_PROP_CALIBRATION_SCHEMA_VERSION,
      kind: `${id}-anchor-offset`,
      note,
      ...extraRecord(),
      ...(scaleGroupOf
        ? { scales: Object.fromEntries(scaleGroups().map((group) => [group, round(groupScales[group] ?? shippedScale(group))])) }
        : { scale: round(scale ?? shippedScale()) }),
      facings: facingsOut,
      recordedAt: new Date().toISOString(),
    };
  }

  // The sprite's anchor without any nudge: current position minus the nudge in force.
  function geometricAnchor(sprite) {
    const facing = facingOf(sprite);
    const offset = offsets[facing] ?? shippedOffset(facing);
    return { x: sprite.x - offset.dx, y: sprite.y - offset.dy };
  }

  function makeSpriteDraggable(targetScene, sprite) {
    // The in-city selector handles picking and dragging for every sprite while it is installed.
    if (inputHandlers) return;
    if (!targetScene || !sprite || sprite.__streetPropCalibrationWired) return;
    sprite.__streetPropCalibrationWired = true;
    sprite.setInteractive({ useHandCursor: true });
    targetScene.input?.setDraggable?.(sprite, true);
    sprite.on('dragstart', () => {
      selectedFacing = facingOf(sprite);
      sprite.__streetPropDragBase = geometricAnchor(sprite);
    });
    sprite.on('drag', (pointer, dragX, dragY) => {
      const base = sprite.__streetPropDragBase || geometricAnchor(sprite);
      offsets[facingOf(sprite)] = { dx: dragX - base.x, dy: dragY - base.y };
      doRefresh();
      renderPanel();
    });
    sprite.on('dragend', () => {
      setMessage(`${String(facingOf(sprite)).toUpperCase()} 已記錄（方向鍵可微調 1px，Shift 5px）`, 'success');
    });
  }

  function disableDrag(targetScene) {
    sprites(targetScene)?.forEach((sprite) => {
      if (!sprite.__streetPropCalibrationWired) return;
      sprite.__streetPropCalibrationWired = false;
      sprite.off('dragstart');
      sprite.off('drag');
      sprite.off('dragend');
      sprite.disableInteractive();
    });
  }

  function nudge(dx, dy) {
    if (!selectedFacing) {
      setMessage('先點選一件，再用方向鍵微調', 'info');
      return;
    }
    const current = offsets[selectedFacing] ?? shippedOffset(selectedFacing);
    offsets[selectedFacing] = { dx: current.dx + dx, dy: current.dy + dy };
    doRefresh();
    renderPanel();
    drawOverlay();
  }

  // ── In-city selector ─────────────────────────────────────────────────────

  const isLive = (sprite) => !!sprite && sprite.scene !== undefined && sprite.active !== false;

  // Where a sprite's drawn pixels sit in world space (its canvas minus transparent padding).
  function drawnBounds(sprite) {
    const scaleX = Math.abs(sprite.scaleX || 1);
    const scaleY = Math.abs(sprite.scaleY || 1);
    const left = sprite.x - (sprite.displayOriginX ?? 0) * scaleX;
    const top = sprite.y - (sprite.displayOriginY ?? 0) * scaleY;
    const bbox = getStreetPropAlphaMask(scene, sprite.texture?.key)?.bbox;
    if (!bbox) return { x: left, y: top, width: (sprite.width || 0) * scaleX, height: (sprite.height || 0) * scaleY, left, top, scaleX, scaleY };
    return {
      x: left + bbox.minX * scaleX,
      y: top + bbox.minY * scaleY,
      width: (bbox.maxX - bbox.minX + 1) * scaleX,
      height: (bbox.maxY - bbox.minY + 1) * scaleY,
      left, top, scaleX, scaleY,
    };
  }

  // The prop under a world point: the highest-drawn one whose opaque pixels are within a few
  // screen pixels of it, else the nearest one whose drawn bounds are that close.
  function pickSpriteAt(worldX, worldY) {
    const zoom = scene?.cameras?.main?.zoom || 1;
    const slack = STREET_PROP_PICK_TOLERANCE_PX / zoom;
    let best = null;
    let bestDepth = -Infinity;
    let nearest = null;
    let nearestDistance = Infinity;
    sprites(scene)?.forEach((sprite) => {
      if (!isLive(sprite) || !sprite.visible) return;
      const bounds = drawnBounds(sprite);
      if (worldX < bounds.x - slack || worldX > bounds.x + bounds.width + slack
        || worldY < bounds.y - slack || worldY > bounds.y + bounds.height + slack) return;
      const dx = Math.max(bounds.x - worldX, 0, worldX - (bounds.x + bounds.width));
      const dy = Math.max(bounds.y - worldY, 0, worldY - (bounds.y + bounds.height));
      const distance = Math.hypot(dx, dy);
      if (distance < nearestDistance) { nearest = sprite; nearestDistance = distance; }
      const mask = getStreetPropAlphaMask(scene, sprite.texture?.key);
      if (!mask) return;
      const px = (worldX - bounds.left) / bounds.scaleX;
      const py = (worldY - bounds.top) / bounds.scaleY;
      const tol = slack / bounds.scaleX;
      let hit = false;
      for (const oy of [-tol, 0, tol]) {
        for (const ox of [-tol, 0, tol]) {
          const ix = Math.floor(px + ox);
          const iy = Math.floor(py + oy);
          if (ix < 0 || iy < 0 || ix >= mask.width || iy >= mask.height) continue;
          if (mask.alpha[iy * mask.width + ix] >= STREET_PROP_PICK_ALPHA) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit && (sprite.depth ?? 0) >= bestDepth) { best = sprite; bestDepth = sprite.depth ?? 0; }
    });
    return best ?? nearest;
  }

  function drawOverlay() {
    if (!overlay) return;
    overlay.clear();
    if (selectedSprite && !isLive(selectedSprite)) selectedSprite = null;
    if (hoverSprite && !isLive(hoverSprite)) hoverSprite = null;
    const camera = scene?.cameras?.main;
    const zoom = camera?.zoom || 1;
    const view = camera?.worldView;
    const pad = 2 / zoom;
    const outline = (sprite, width, color, alpha, fillAlpha = 0) => {
      const b = drawnBounds(sprite);
      if (fillAlpha > 0) {
        overlay.fillStyle(color, fillAlpha);
        overlay.fillRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
      }
      overlay.lineStyle(width / zoom, color, alpha);
      overlay.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    };
    if (selectedSprite) {
      const facing = facingOf(selectedSprite);
      sprites(scene)?.forEach((sprite) => {
        if (sprite === selectedSprite || !isLive(sprite) || !sprite.visible || facingOf(sprite) !== facing) return;
        if (view && (sprite.x < view.x || sprite.x > view.right || sprite.y < view.y || sprite.y > view.bottom)) return;
        outline(sprite, 1, STREET_PROP_HIGHLIGHT, 0.45);
      });
      outline(selectedSprite, 2.5, STREET_PROP_HIGHLIGHT, 1, 0.2);
    }
    if (hoverSprite && hoverSprite !== selectedSprite) outline(hoverSprite, 1.5, 0xffffff, 0.9);
  }

  function select(sprite) {
    selectedSprite = sprite;
    selectedFacing = sprite ? facingOf(sprite) : null;
    renderPanel();
    drawOverlay();
  }

  function installSelector(targetScene) {
    if (inputHandlers || !targetScene?.input?.on) return;
    const depth = typeof VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH === 'number' ? VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH - 3 : 1e9;
    overlay = targetScene.add?.graphics?.()?.setDepth?.(depth) ?? null;
    inputHandlers = {
      pointerdown: (pointer) => {
        if (pointer.button !== 0) return;
        const hit = pickSpriteAt(pointer.worldX, pointer.worldY);
        if (!hit) {
          select(null);
          setMessage('冇揀中：點道具本身（放大睇會易揀啲）', 'info');
          return;
        }
        select(hit);
        drag = { sprite: hit, startX: pointer.worldX, startY: pointer.worldY, spriteX: hit.x, spriteY: hit.y, base: geometricAnchor(hit) };
        setMessage(`已選：${facingLabels[selectedFacing] ?? selectedFacing}（同類嘅會一齊移）`, 'info');
      },
      pointermove: (pointer) => {
        if (drag && !pointer.isDown) drag = null; // released outside the canvas
        if (drag) {
          const facing = facingOf(drag.sprite);
          offsets[facing] = {
            dx: drag.spriteX + (pointer.worldX - drag.startX) - drag.base.x,
            dy: drag.spriteY + (pointer.worldY - drag.startY) - drag.base.y,
          };
          doRefresh();
          renderPanel();
          drawOverlay();
          return;
        }
        const hover = pickSpriteAt(pointer.worldX, pointer.worldY);
        if (hover !== hoverSprite) {
          hoverSprite = hover;
          drawOverlay();
        }
      },
      pointerup: () => {
        if (!drag) return;
        drag = null;
        setMessage(`${facingLabels[selectedFacing] ?? selectedFacing} 已記錄（方向鍵 1px，Shift 5px）`, 'success');
      },
    };
    Object.entries(inputHandlers).forEach(([event, handler]) => targetScene.input.on(event, handler));
    savedCursor = targetScene.input.manager?.defaultCursor ?? '';
    targetScene.input.setDefaultCursor?.('pointer');
  }

  function uninstallSelector(targetScene) {
    if (inputHandlers && targetScene?.input?.off) {
      Object.entries(inputHandlers).forEach(([event, handler]) => targetScene.input.off(event, handler));
      targetScene.input.setDefaultCursor?.(savedCursor || '');
    }
    inputHandlers = null;
    drag = null;
    selectedSprite = null;
    hoverSprite = null;
    overlay?.destroy?.();
    overlay = null;
  }

  function adjustScale(delta) {
    if (scaleGroupOf) {
      const group = selectedGroup();
      if (!group) {
        setMessage('先點選一件，再調嗰種嘅大小', 'info');
        return;
      }
      const current = groupScales[group] ?? shippedScale(group);
      groupScales[group] = Math.max(minScale, Math.min(maxScale, current + delta));
    } else {
      const current = scale ?? shippedScale();
      scale = Math.max(minScale, Math.min(maxScale, current + delta));
    }
    doRefresh();
    renderPanel();
    drawOverlay();
  }

  function handleKey(event) {
    if (!isPickerActive()) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const step = event.shiftKey ? 5 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (event.key === 'Escape' && selectedFacing) {
      select(null);
      return;
    }
    // Nothing picked: leave the arrow keys to the camera.
    if (moves[event.key] && selectedFacing) {
      event.preventDefault();
      nudge(...moves[event.key]);
    } else if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      adjustScale(event.key === ']' ? scaleStep : -scaleStep);
    }
  }

  function start(targetScene) {
    active = true;
    scene = targetScene;
    installSelector(targetScene);
    // Props the viewport culling hides when zoomed out come back while being calibrated.
    targetScene.terrainViewportCacheKey = null;
    createPanel();
    renderPanel();
    if (!keyHandler && typeof document !== 'undefined') {
      keyHandler = handleKey;
      document.addEventListener('keydown', keyHandler);
    }
    const count = sprites(targetScene)?.size ?? 0;
    setMessage(count ? `城中有 ${count} 件：點選一件嚟調整` : '城中未有呢種道具：先起啲路', 'info');
  }

  function teardown() {
    active = false;
    pickerActive = false;
    uninstallSelector(scene);
    disableDrag(scene);
    if (scene) scene.terrainViewportCacheKey = null;
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

  function reset() {
    facings.forEach((facing) => { delete offsets[facing]; });
    scale = null;
    Object.keys(groupScales).forEach((group) => { delete groupScales[group]; });
    doRefresh();
    renderPanel();
    drawOverlay();
    setMessage('已重設為原本位置同大小', 'info');
  }

  // ── Panel ─────────────────────────────────────────────────────────────────

  function ensureStyle() {
    if (document.getElementById('street-prop-calibrator-style')) return;
    const style = document.createElement('style');
    style.id = 'street-prop-calibrator-style';
    style.textContent = `
      .street-prop-calibrator-panel {
        position: fixed; bottom: 18px; z-index: 100000;
        width: min(330px, calc(100vw - 28px)); box-sizing: border-box; padding: 12px;
        border: 1px solid rgba(255, 196, 90, 0.75); border-radius: 12px;
        color: #fff4df; background: rgba(34, 22, 6, 0.94);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        user-select: text; pointer-events: auto; backdrop-filter: blur(8px);
      }
      .street-prop-calibrator-panel[hidden] { display: none !important; }
      .street-prop-calibrator-panel .spc-title { font-weight: 800; color: #ffc45a; letter-spacing: .04em; margin-bottom: 6px; display: flex; justify-content: space-between; }
      .street-prop-calibrator-panel .spc-title::after { content: '⠿'; color: #b07a2a; font-weight: 400; }
      .street-prop-calibrator-panel .spc-list { max-height: 34vh; overflow-y: auto; padding-right: 4px; }
      .street-prop-calibrator-panel .spc-hint { color: #f0d6a8; margin-bottom: 8px; }
      .street-prop-calibrator-panel .spc-row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
      .street-prop-calibrator-panel .spc-row[data-selected="true"] { color: #ffe3a3; font-weight: 700; }
      .street-prop-calibrator-panel .spc-row span:first-child { color: #f0d6a8; }
      .street-prop-calibrator-panel .spc-row[data-selected="true"] span:first-child { color: #ffc45a; }
      .street-prop-calibrator-panel .spc-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
      .street-prop-calibrator-panel button {
        border: 1px solid #b07a2a; border-radius: 7px; padding: 6px 7px;
        color: #fff4df; background: #4a3212; font: inherit; cursor: pointer;
      }
      .street-prop-calibrator-panel button:hover { background: #6a4718; }
      .street-prop-calibrator-panel .spc-picker-btn { width: 100%; margin-bottom: 9px; font-weight: 700; }
      .street-prop-calibrator-panel .spc-picker-btn[data-active="true"] { background: #1f9d5c; border-color: #7ce8a8; color: #06210f; }
      .street-prop-calibrator-panel .spc-picker-btn[data-active="true"]:hover { background: #26b56a; }
      .street-prop-calibrator-panel .spc-scale { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 8px; }
      .street-prop-calibrator-panel .spc-scale button { padding: 4px 9px; }
      .street-prop-calibrator-panel .spc-message { min-height: 16px; margin-top: 7px; color: #f0d6a8; }
      .street-prop-calibrator-panel .spc-message[data-tone="success"] { color: #7ce8a8; }
      .street-prop-calibrator-panel .spc-message[data-tone="error"] { color: #ff9a9a; }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if (panel) return panel;
    if (typeof document === 'undefined' || !document.body) return null;
    ensureStyle();
    const root = document.createElement('section');
    root.id = `${id}-calibrator-panel`;
    root.className = 'street-prop-calibrator-panel';
    root.style.left = `${panelLeftPx}px`;
    root.hidden = true;
    root.setAttribute('aria-label', `${title} calibrator`);
    root.innerHTML = `
      <div class="spc-title">${title}</div>
      <div class="spc-hint">預設（北）視角。遊戲工具已暫停：點選道具（綠框）後拖曳，同類嘅會一齊移（淡綠框）；方向鍵 1px、Shift 5px、Esc 取消選取；[ ] 縮放；右鍵拖曳移動鏡頭</div>
      <div class="spc-list"></div>
      <div class="spc-scale"><span>大小</span><span class="spc-scale-value"></span><span><button type="button" data-action="scale-down">−</button> <button type="button" data-action="scale-up">＋</button></span></div>
      <div class="spc-actions">
        <button type="button" data-action="reset">重設</button>
        <button type="button" data-action="copy">複製 JSON</button>
      </div>
      <div class="spc-message"></div>
    `;
    document.body.appendChild(root);
    if (typeof makeCalibratorPanelDraggable === 'function') {
      makeCalibratorPanelDraggable(root, root.querySelector('.spc-title'), `calibrator-panel:${id}`);
    }
    panel = {
      root,
      picker: null,
      list: root.querySelector('.spc-list'),
      scaleValue: root.querySelector('.spc-scale-value'),
      message: root.querySelector('.spc-message'),
    };
    root.querySelector('[data-action="scale-down"]').addEventListener('click', () => adjustScale(-scaleStep));
    root.querySelector('[data-action="scale-up"]').addEventListener('click', () => adjustScale(scaleStep));
    root.querySelector('[data-action="reset"]').addEventListener('click', () => reset());
    root.querySelector('[data-action="copy"]').addEventListener('click', () => {
      copyVisualRouteCalibrationText(JSON.stringify(buildRecord(), null, 2))
        .then(() => setMessage('JSON 已複製，貼入 constants.js', 'success'))
        .catch(() => setMessage('複製失敗', 'error'));
    });
    return panel;
  }

  function setMessage(text, tone = 'info') {
    if (!panel) return;
    panel.message.textContent = String(text || '');
    panel.message.dataset.tone = tone;
  }

  function renderPanel() {
    if (!panel) return;
    panel.root.hidden = !active;
    if (panel.picker) {
      panel.picker.dataset.active = String(pickerActive);
      panel.picker.textContent = `選取器：${pickerActive ? '開啟' : '關閉'}`;
    }
    if (!active) return;
    const counts = {};
    sprites(scene)?.forEach((sprite) => {
      const facing = facingOf(sprite);
      counts[facing] = (counts[facing] || 0) + 1;
    });
    // A long list (e.g. roadside furniture: kind x kerb edge) only shows facings the city has, or
    // that already carry a nudge, so the panel stays short.
    const listed = facings.length > 8
      ? facings.filter((facing) => counts[facing] || offsets[facing] || facing === selectedFacing)
      : facings;
    panel.list.replaceChildren(...listed.map((facing) => {
      const override = offsets[facing];
      const row = document.createElement('div');
      row.className = 'spc-row';
      row.dataset.selected = String(facing === selectedFacing);
      const name = document.createElement('span');
      name.textContent = `${facingLabels[facing] ?? facing} ×${counts[facing] || 0}`;
      const value = document.createElement('span');
      const shown = override ?? shippedOffset(facing);
      value.textContent = `Δx ${round(shown.dx)}, Δy ${round(shown.dy)}${override ? '' : '（原值）'}`;
      row.append(name, value);
      return row;
    }));
    if (scaleGroupOf) {
      const group = selectedGroup();
      panel.scaleValue.textContent = group
        ? `${scaleGroupLabels[group] ?? group} ${round(groupScales[group] ?? shippedScale(group))}${groupScales[group] === undefined ? '（原值）' : ''}`
        : '先拖曳一件';
    } else {
      panel.scaleValue.textContent = round(scale ?? shippedScale()) + (scale === null ? '（原值）' : '');
    }
  }

  const calibrator = {
    id,
    getOffset,
    getScale,
    isActive,
    isPickerActive,
    setPickerActive,
    makeSpriteDraggable,
    toggle,
    teardown,
    reset,
    nudge,
    adjustScale,
    buildRecord,
    pickSpriteAt: (worldX, worldY) => pickSpriteAt(worldX, worldY),
  };
  STREET_PROP_CALIBRATORS.push(calibrator);
  return calibrator;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createStreetPropCalibrator, isAnyStreetPropCalibratorCapturing, STREET_PROP_CALIBRATION_SCHEMA_VERSION };
}
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { createStreetPropCalibrator, isAnyStreetPropCalibratorCapturing });
}
