// 遠離市區夜色校正 (test-mode dev tool, 校正工具 → 燈光): live sliders for the extra night pass in
// night-remote-darkness.js. Values are kept in localStorage and apply at once; "複製 JSON" gives
// the block to paste over NIGHT_REMOTE_DARKNESS_DEFAULTS to ship them.

const nightRemoteDarknessCalibrator = (() => {
  let panel = null;
  let scene = null;
  let readoutTimer = null;

  const SLIDERS = [
    { name: 'farBrightness', label: '遠處亮度（入夜）', step: 0.01, digits: 2, hint: '1 = 白天；市區而家係 0.38' },
    { name: 'deepFarBrightness', label: '遠處亮度（凌晨）', step: 0.01, digits: 2, hint: '市區凌晨係 0.29' },
    { name: 'litRadius', label: '市區光圈（格）', step: 0.5, digits: 1, hint: '離建築／道路幾多格內維持市區亮度' },
    { name: 'fadeTiles', label: '過渡距離（格）', step: 1, digits: 0, hint: '由市區亮度過渡到遠處亮度用幾多格' },
  ];

  function ensureStyle() {
    if (document.getElementById('night-remote-darkness-calibrator-style')) return;
    const style = document.createElement('style');
    style.id = 'night-remote-darkness-calibrator-style';
    style.textContent = `
      .night-remote-darkness-calibrator-panel {
        position: fixed; bottom: 18px; left: 14px; z-index: 100000;
        width: min(320px, calc(100vw - 28px)); box-sizing: border-box; padding: 12px;
        border: 1px solid rgba(124, 232, 168, 0.75); border-radius: 12px;
        color: #eafff2; background: rgba(8, 30, 18, 0.94);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        user-select: text; pointer-events: auto; backdrop-filter: blur(8px);
      }
      .night-remote-darkness-calibrator-panel[hidden] { display: none !important; }
      .night-remote-darkness-calibrator-panel .nrd-title { font-weight: 800; color: #7ce8a8; letter-spacing: .04em; margin-bottom: 6px; display: flex; justify-content: space-between; cursor: move; }
      .night-remote-darkness-calibrator-panel .nrd-title::after { content: '⠿'; color: #3f8f63; font-weight: 400; }
      .night-remote-darkness-calibrator-panel .nrd-hint { color: #bfe8cf; margin-bottom: 8px; }
      .night-remote-darkness-calibrator-panel .nrd-toggle { display: flex; align-items: center; gap: 6px; margin: 3px 0; cursor: pointer; }
      .night-remote-darkness-calibrator-panel .nrd-slider { margin-top: 7px; }
      .night-remote-darkness-calibrator-panel .nrd-slider-head { display: flex; justify-content: space-between; }
      .night-remote-darkness-calibrator-panel .nrd-slider-head output { color: #fff; font-weight: 700; }
      .night-remote-darkness-calibrator-panel .nrd-slider-head output[data-local="true"] { color: #ffb070; }
      .night-remote-darkness-calibrator-panel .nrd-slider input { width: 100%; margin: 2px 0 0; accent-color: #7ce8a8; }
      .night-remote-darkness-calibrator-panel .nrd-slider small { color: #8fbfa3; }
      .night-remote-darkness-calibrator-panel .nrd-readout { margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(124, 232, 168, .25); color: #bfe8cf; white-space: pre; }
      .night-remote-darkness-calibrator-panel .nrd-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
      .night-remote-darkness-calibrator-panel button {
        border: 1px solid #3f8f63; border-radius: 7px; padding: 6px 7px;
        color: #eafff2; background: #143a25; font: inherit; cursor: pointer;
      }
      .night-remote-darkness-calibrator-panel button:hover { background: #1d5234; }
      .night-remote-darkness-calibrator-panel .nrd-message { min-height: 16px; margin-top: 7px; color: #bfe8cf; }
      .night-remote-darkness-calibrator-panel .nrd-message[data-tone="success"] { color: #7ce8a8; }
      .night-remote-darkness-calibrator-panel .nrd-message[data-tone="error"] { color: #ff9a9a; }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if (panel) return panel;
    if (typeof document === 'undefined' || !document.body) return null;
    ensureStyle();
    const root = document.createElement('section');
    root.id = 'night-remote-darkness-calibrator-panel';
    root.className = 'night-remote-darkness-calibrator-panel';
    root.hidden = true;
    root.setAttribute('aria-label', 'Night darkness away from the city calibrator');
    const sliders = SLIDERS.map(({ name, label, step, hint }) => {
      const [min, max] = NIGHT_REMOTE_DARKNESS_LIMITS[name];
      return `<label class="nrd-slider"><div class="nrd-slider-head"><span>${label}</span><output data-name="${name}"></output></div>`
        + `<input type="range" data-name="${name}" min="${min}" max="${max}" step="${step}"><small>${hint}</small></label>`;
    }).join('');
    root.innerHTML = `
      <div class="nrd-title">遠離市區夜色校正</div>
      <div class="nrd-hint">離開建築同道路越遠，夜晚越暗。市區附近維持而家嘅暗度。橙色數值＝本機校正，未寫入出廠設定。</div>
      <label class="nrd-toggle"><input type="checkbox" data-toggle="enabled"> 啟用（同 View 選單同步）</label>
      <label class="nrd-toggle"><input type="checkbox" data-toggle="preview"> 預覽範圍（白天都用粉紅色顯示）</label>
      ${sliders}
      <div class="nrd-readout"></div>
      <div class="nrd-actions">
        <button type="button" data-action="reset">還原出廠</button>
        <button type="button" data-action="copy">複製 JSON</button>
      </div>
      <div class="nrd-message"></div>
    `;
    document.body.appendChild(root);
    if (typeof makeCalibratorPanelDraggable === 'function') {
      makeCalibratorPanelDraggable(root, root.querySelector('.nrd-title'), 'calibrator-panel:night-remote-darkness');
    }
    panel = {
      root,
      readout: root.querySelector('.nrd-readout'),
      message: root.querySelector('.nrd-message'),
      enabled: root.querySelector('[data-toggle="enabled"]'),
      preview: root.querySelector('[data-toggle="preview"]'),
      inputs: [...root.querySelectorAll('input[type="range"]')],
      outputs: Object.fromEntries([...root.querySelectorAll('output')].map((output) => [output.dataset.name, output])),
    };
    panel.inputs.forEach((input) => {
      input.addEventListener('input', () => {
        setNightRemoteDarknessSettings({ [input.dataset.name]: Number(input.value) }, scene);
        syncPanel();
      });
    });
    panel.enabled.addEventListener('change', () => {
      setNightRemoteDarknessEnabled(panel.enabled.checked, scene);
      if (typeof updateViewMenu === 'function') updateViewMenu();
    });
    panel.preview.addEventListener('change', () => setNightRemoteDarknessPreview(panel.preview.checked, scene));
    root.querySelector('[data-action="reset"]').addEventListener('click', () => {
      setNightRemoteDarknessSettings(null, scene);
      syncPanel();
      setMessage('已還原出廠數值');
    });
    root.querySelector('[data-action="copy"]').addEventListener('click', () => {
      const text = JSON.stringify(getNightRemoteDarknessSettings(), null, 2);
      const copy = typeof copyVisualRouteCalibrationText === 'function'
        ? copyVisualRouteCalibrationText(text)
        : Promise.reject(new Error('clipboard unavailable'));
      copy
        .then(() => setMessage('JSON 已複製，貼入 night-remote-darkness.js（NIGHT_REMOTE_DARKNESS_DEFAULTS）', 'success'))
        .catch(() => setMessage('複製失敗', 'error'));
    });
    return panel;
  }

  function setMessage(text, tone = 'info') {
    if (!panel) return;
    panel.message.textContent = String(text || '');
    panel.message.dataset.tone = tone;
  }

  function syncPanel() {
    if (!panel) return;
    const settings = getNightRemoteDarknessSettings();
    SLIDERS.forEach(({ name, digits }) => {
      const input = panel.inputs.find((element) => element.dataset.name === name);
      if (input && document.activeElement !== input) input.value = String(settings[name]);
      const output = panel.outputs[name];
      output.textContent = Number(settings[name]).toFixed(digits);
      output.dataset.local = String(settings[name] !== NIGHT_REMOTE_DARKNESS_DEFAULTS[name]);
    });
    panel.enabled.checked = isNightRemoteDarknessEnabled();
    panel.preview.checked = isNightRemoteDarknessPreviewActive();
    updateReadout();
  }

  // What the passes are doing right now, as remaining light (1 = daylight).
  function updateReadout() {
    if (!panel || !scene) return;
    const cityTotal = Number(scene.nightDarkness) || 0;
    const extra = Number(scene.nightRemoteExtraAlpha) || 0;
    panel.readout.textContent = `而家市區亮度  ${(1 - cityTotal).toFixed(2)}\n`
      + `而家遠處亮度  ${((1 - cityTotal) * (1 - extra)).toFixed(2)}\n`
      + `額外暗層 alpha ${extra.toFixed(3)}`;
  }

  function toggle(targetScene) {
    scene = targetScene || scene;
    const created = createPanel();
    if (!created) return false;
    const show = created.root.hidden;
    created.root.hidden = !show;
    clearInterval(readoutTimer);
    readoutTimer = null;
    if (show) {
      syncPanel();
      readoutTimer = setInterval(updateReadout, 500);
    } else if (isNightRemoteDarknessPreviewActive()) {
      setNightRemoteDarknessPreview(false, scene);
    }
    return show;
  }

  function teardown() {
    clearInterval(readoutTimer);
    readoutTimer = null;
    if (isNightRemoteDarknessPreviewActive()) setNightRemoteDarknessPreview(false, scene);
    panel?.root.remove();
    panel = null;
  }

  return { id: 'night-remote-darkness', toggle, teardown, isActive: () => !!panel && !panel.root.hidden };
})();

function toggleNightRemoteDarknessCalibrator(scene) {
  return nightRemoteDarknessCalibrator.toggle(scene);
}

function teardownNightRemoteDarknessCalibrator() {
  return nightRemoteDarknessCalibrator.teardown();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nightRemoteDarknessCalibrator, toggleNightRemoteDarknessCalibrator };
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { toggleNightRemoteDarknessCalibrator, teardownNightRemoteDarknessCalibrator });
}
