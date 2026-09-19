// Generic position calibrator for road-side props that come in a few screen facings
// (junction traffic signals, street lamps). Each prop family instantiates one calibrator
// (traffic-signal-calibrator.js, street-lamp-calibrator.js); the family's own module reads
// getOffset(facing) / getScale() while the calibrator is open.
//
// Workflow: the real sprites already standing in the city are the targets. Dragging any
// sprite of a facing records that facing's pixel nudge relative to its geometric anchor and
// immediately moves every other sprite of the same facing; arrow keys nudge the last-touched
// facing by a pixel (Shift: five); [ and ] shrink or grow every sprite. "複製 JSON" copies the
// values to paste into constants.js. Calibrate at the default North view: facings are
// screen-relative.

const STREET_PROP_CALIBRATION_SCHEMA_VERSION = 1;

function createStreetPropCalibrator(options) {
  const {
    id,                 // e.g. 'traffic-signal' (panel element id, record kind)
    title,              // panel title
    facings,            // ['sw', 'se', 'nw', 'ne']
    facingLabels,       // { sw: '...' }
    facingOf,           // (sprite) => facing
    sprites,            // (scene) => Map of sprites
    shippedOffsets,     // () => { facing: { dx, dy } }
    shippedScale,       // () => number
    refresh,            // (scene) => reposition every sprite
    note = '',          // sentence for the copied JSON
    extraRecord = () => ({}),
    scaleStep = 0.002,
    minScale = 0.005,
    maxScale = 0.5,
    panelLeftPx = 14,
  } = options;

  const offsets = {}; // facing -> { dx, dy }
  let scale = null;   // null = shipped
  let active = false;
  let scene = null;
  let panel = null;
  let pickerActive = false;
  let selectedFacing = null;
  let keyHandler = null;

  const round = (value) => Math.round(value * 1000) / 1000;
  const shippedOffset = (facing) => shippedOffsets()[facing] ?? { dx: 0, dy: 0 };

  function getOffset(facing) {
    return offsets[facing] ?? null;
  }

  function getScale() {
    return scale;
  }

  function isActive() {
    return active;
  }

  // While the picker is on, every normal-tool input listener guarded by
  // isVisualRouteCalibrationInputCaptured (visual-route-calibrator.js) is suppressed, so a drag
  // on a sprite can't also bulldoze the road under it.
  function isPickerActive() {
    return pickerActive;
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
      scale: round(scale ?? shippedScale()),
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

  function enableDrag(targetScene) {
    sprites(targetScene)?.forEach((sprite) => makeSpriteDraggable(targetScene, sprite));
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
      setMessage('先拖曳一支，再用方向鍵微調', 'info');
      return;
    }
    const current = offsets[selectedFacing] ?? shippedOffset(selectedFacing);
    offsets[selectedFacing] = { dx: current.dx + dx, dy: current.dy + dy };
    doRefresh();
    renderPanel();
  }

  function adjustScale(delta) {
    const current = scale ?? shippedScale();
    scale = Math.max(minScale, Math.min(maxScale, current + delta));
    doRefresh();
    renderPanel();
  }

  function handleKey(event) {
    if (!active || !pickerActive) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const step = event.shiftKey ? 5 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
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
    enableDrag(targetScene);
    createPanel();
    renderPanel();
    if (!keyHandler && typeof document !== 'undefined') {
      keyHandler = handleKey;
      document.addEventListener('keydown', keyHandler);
    }
    const count = sprites(targetScene)?.size ?? 0;
    setMessage(count ? `城中有 ${count} 支，拖曳任何一支` : '城中未有呢種道具：先起啲路', 'info');
  }

  function teardown() {
    active = false;
    pickerActive = false;
    disableDrag(scene);
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
    doRefresh();
    renderPanel();
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
      .street-prop-calibrator-panel .spc-title { font-weight: 800; color: #ffc45a; letter-spacing: .04em; margin-bottom: 6px; }
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
      <div class="spc-hint">預設（北）視角：拖曳任何一支；方向鍵 1px、Shift 5px；[ ] 縮放</div>
      <button type="button" class="spc-picker-btn" data-action="toggle-picker" data-active="false">選取器：關閉</button>
      <div class="spc-list"></div>
      <div class="spc-scale"><span>大小</span><span class="spc-scale-value"></span><span><button type="button" data-action="scale-down">−</button> <button type="button" data-action="scale-up">＋</button></span></div>
      <div class="spc-actions">
        <button type="button" data-action="reset">重設</button>
        <button type="button" data-action="copy">複製 JSON</button>
      </div>
      <div class="spc-message"></div>
    `;
    document.body.appendChild(root);
    panel = {
      root,
      picker: root.querySelector('.spc-picker-btn'),
      list: root.querySelector('.spc-list'),
      scaleValue: root.querySelector('.spc-scale-value'),
      message: root.querySelector('.spc-message'),
    };
    root.querySelector('[data-action="toggle-picker"]').addEventListener('click', () => {
      const on = setPickerActive(!pickerActive);
      setMessage(on ? '選取器已開啟：滑鼠掣只會拖曳道具，鍵盤微調生效' : '選取器已關閉：滑鼠掣回復正常工具操作', 'info');
    });
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
    panel.list.replaceChildren(...facings.map((facing) => {
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
    panel.scaleValue.textContent = round(scale ?? shippedScale()) + (scale === null ? '（原值）' : '');
  }

  return {
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
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createStreetPropCalibrator, STREET_PROP_CALIBRATION_SCHEMA_VERSION };
}
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { createStreetPropCalibrator });
}
