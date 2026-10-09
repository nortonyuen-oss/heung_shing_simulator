// 渡輪泊位校正 (test-mode dev tool): nudges where a Star Ferry lies alongside a pier, per berth as
// drawn - which way the pier's shore side faces on screen (that picks its art) and which side of the
// pier on screen the berth is. Two numbers each, in metres: 離碼頭距離 (further off the pier's flank)
// and 前後位置 (further out to sea). A ferry lies at the chosen berth while the tool is open; the
// route ferries follow the change at once. 儲存 writes data/ferry-berths.json (server.js, dev only),
// which the game reads at start-up - so it ships with a release.

let ferryBerthCalibratorState = null; // { scene, root, pierId, side: 'left'|'right' }

function isFerryBerthCalibrationActive() {
  return !!ferryBerthCalibratorState;
}

// The berth the tool is on, for updateFerries to lay a ferry at: { pier, point } or null.
function getFerryBerthCalibrationPreview() {
  const st = ferryBerthCalibratorState;
  if (!st || typeof getFerryState !== 'function') return null;
  const pier = getFerryState().piers.find((p) => p.id === st.pierId);
  if (!pier) return null;
  const flank = getFerryBerthCalibratorFlank(pier, st.side);
  const end = ferryBerthEnds(pier, getFerryBerthOffset).find((e) => e.side === flank);
  return end ? { pier, point: { ...end.berth, state: 'alongside' } } : null;
}

// The pier's flank on the chosen side of the screen at the map's present turn.
function getFerryBerthCalibratorFlank(pier, side) {
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  return FERRY_ALONG[pier.land].find((flank) => {
    const f = getTyphoonShelterScreenFacing(flank, rotation);
    return (f === 'sw' || f === 'nw') === (side === 'left');
  });
}

function getFerryBerthCalibratorKey() {
  const st = ferryBerthCalibratorState;
  const pier = st && getFerryState().piers.find((p) => p.id === st.pierId);
  if (!pier) return null;
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  return getFerryBerthKey(pier, getFerryBerthCalibratorFlank(pier, st.side), rotation);
}

// The pier nearest the middle of the screen.
function pickFerryBerthCalibratorPier(scene) {
  const piers = getFerryState().piers;
  if (!piers.length) return null;
  const cam = scene.cameras.main;
  const cx = cam.worldView.centerX; const cy = cam.worldView.centerY;
  let best = null; let bestD = Infinity;
  piers.forEach((p) => {
    const s = isoToScreen(p.col + 0.5, p.row + 0.5);
    const d = Math.hypot(s.x + scene.offsetX - cx, s.y + scene.offsetY - cy);
    if (d < bestD) { bestD = d; best = p; }
  });
  return best;
}

const FERRY_BERTH_SCREEN_LABELS = Object.freeze({ se: '右下', sw: '左下', ne: '右上', nw: '左上' });

function renderFerryBerthCalibrator() {
  const st = ferryBerthCalibratorState;
  if (!st) return;
  const root = st.root;
  const pier = getFerryState().piers.find((p) => p.id === st.pierId);
  const key = getFerryBerthCalibratorKey();
  const value = (key && getFerryBerthCalibration()[key]) || { gapM: 0, outM: 0 };
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  root.querySelector('.fbc-pier').textContent = pier
    ? `${pier.name}・岸邊喺畫面${FERRY_BERTH_SCREEN_LABELS[getTyphoonShelterScreenFacing(pier.land, rotation)] || ''}`
    : '未有碼頭：先起一個渡輪碼頭';
  root.querySelectorAll('[data-fbc-side]').forEach((b) => { b.dataset.active = String(b.dataset.fbcSide === st.side); });
  root.querySelector('.fbc-gap').value = value.gapM;
  root.querySelector('.fbc-gap-value').textContent = `${value.gapM > 0 ? '+' : ''}${value.gapM} m`;
  root.querySelector('.fbc-out').value = value.outM;
  root.querySelector('.fbc-out-value').textContent = `${value.outM > 0 ? '+' : ''}${value.outM} m`;
  root.querySelector('.fbc-key').textContent = key ? `泊位：${key}（每個角度、每邊各自儲存）` : '';
  root.querySelector('.fbc-json').value = getFerryBerthCalibrationJson();
  root.querySelectorAll('input, [data-fbc-side], .fbc-reset').forEach((el) => { el.disabled = !pier; });
}

function setFerryBerthCalibratorValue(field, metres) {
  const key = getFerryBerthCalibratorKey();
  if (!key) return;
  const all = getFerryBerthCalibration();
  const next = { gapM: 0, outM: 0, ...(all[key] || {}), [field]: Math.round(Number(metres) * 2) / 2 };
  all[key] = next;
  setFerryBerthCalibration(all);
  ferryBerthCalibratorState.dirty = true;
  renderFerryBerthCalibrator();
  ferryBerthCalibratorState.root.querySelector('.fbc-status').textContent = '未儲存';
}

// What 儲存 writes (and 複製 JSON copies): data/ferry-berths.json.
function getFerryBerthCalibrationJson() {
  const berths = getFerryBerthCalibration();
  const sorted = Object.fromEntries(Object.keys(berths).sort().map((k) => [k, berths[k]]));
  return `${JSON.stringify({ schemaVersion: 1, berths: sorted }, null, 1)}\n`;
}

async function saveFerryBerthCalibration() {
  const status = ferryBerthCalibratorState.root.querySelector('.fbc-status');
  status.textContent = '儲存緊…';
  try {
    const res = await fetch('/api/dev/ferry-berths', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ berths: getFerryBerthCalibration() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = await res.json();
    ferryBerthCalibratorState.dirty = false;
    status.textContent = `已儲存（${out.berths} 個泊位有校正）→ data/ferry-berths.json`;
  } catch (error) {
    status.textContent = `儲存唔到：${error.message}。可以用「複製 JSON」貼畀 Claude；或者完全退出再重開遊戲（開發模式）。`;
  }
}

function openFerryBerthCalibrator(scene) {
  if (ferryBerthCalibratorState) return;
  const root = document.createElement('div');
  root.className = 'ferry-berth-calibrator';
  // bottom left, where the other calibrators open (the test panel is on the right); drag it by its title
  root.style.cssText = 'position:fixed;bottom:18px;left:14px;z-index:100000;width:290px;background:#fffaf0;border:1px solid #8f8776;'
    + 'border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.25);font:13px/1.5 system-ui,sans-serif;color:#252b2f;padding:10px 12px;';
  root.innerHTML = `
    <style>
      .ferry-berth-calibrator button { border:1px solid #8f8776; border-radius:3px; background:#f2ead8; padding:3px 8px; cursor:pointer; }
      .ferry-berth-calibrator button[data-active="true"] { background:#2f6db3; color:#fff; border-color:#2f6db3; }
      .ferry-berth-calibrator button:disabled { opacity:.5; cursor:default; }
      .ferry-berth-calibrator .row { display:flex; align-items:center; gap:8px; margin:6px 0; }
      .ferry-berth-calibrator input[type=range] { flex:1; }
      .ferry-berth-calibrator .muted { color:#6b6457; font-size:12px; }
    </style>
    <div class="row fbc-title" style="justify-content:space-between;cursor:move"><b>渡輪泊位校正</b><button type="button" class="fbc-close">✕</button></div>
    <div class="fbc-pier"></div>
    <div class="row"><button type="button" class="fbc-pick">揀畫面中間嘅碼頭</button></div>
    <div class="row">泊位：<button type="button" data-fbc-side="left">左側</button><button type="button" data-fbc-side="right">右側</button></div>
    <div class="row">離碼頭距離 <input type="range" class="fbc-gap" min="-10" max="20" step="0.5"><span class="fbc-gap-value"></span></div>
    <div class="row">前後位置 <input type="range" class="fbc-out" min="-20" max="20" step="0.5"><span class="fbc-out-value"></span></div>
    <div class="muted">距離：正數離碼頭遠啲。前後：正數向海、負數向岸。</div>
    <div class="muted fbc-key"></div>
    <div class="row"><button type="button" class="fbc-reset">重設呢個泊位</button><button type="button" class="fbc-save">儲存</button><button type="button" class="fbc-copy">複製 JSON</button></div>
    <div class="muted fbc-status"></div>
    <textarea class="fbc-json" readonly rows="4" style="width:100%;box-sizing:border-box;font:11px/1.4 ui-monospace,monospace;margin-top:4px"></textarea>`;
  document.body.appendChild(root);
  ['pointerdown', 'wheel'].forEach((type) => root.addEventListener(type, (e) => e.stopPropagation()));
  // dragged by its title bar
  root.querySelector('.fbc-title').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const box = root.getBoundingClientRect();
    const dx = e.clientX - box.left; const dy = e.clientY - box.top;
    const move = (ev) => {
      root.style.left = `${Math.max(0, Math.min(window.innerWidth - box.width, ev.clientX - dx))}px`;
      root.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy))}px`;
      root.style.bottom = 'auto';
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  const pier = pickFerryBerthCalibratorPier(scene);
  ferryBerthCalibratorState = { scene, root, pierId: pier?.id || null, side: 'right', dirty: false };
  root.querySelector('.fbc-close').addEventListener('click', () => closeFerryBerthCalibrator());
  root.querySelector('.fbc-pick').addEventListener('click', () => {
    ferryBerthCalibratorState.pierId = pickFerryBerthCalibratorPier(scene)?.id || null;
    renderFerryBerthCalibrator();
  });
  root.querySelectorAll('[data-fbc-side]').forEach((b) => b.addEventListener('click', () => {
    ferryBerthCalibratorState.side = b.dataset.fbcSide;
    renderFerryBerthCalibrator();
  }));
  root.querySelector('.fbc-gap').addEventListener('input', (e) => setFerryBerthCalibratorValue('gapM', e.target.value));
  root.querySelector('.fbc-out').addEventListener('input', (e) => setFerryBerthCalibratorValue('outM', e.target.value));
  root.querySelector('.fbc-reset').addEventListener('click', () => {
    setFerryBerthCalibratorValue('gapM', 0);
    setFerryBerthCalibratorValue('outM', 0);
  });
  root.querySelector('.fbc-save').addEventListener('click', () => saveFerryBerthCalibration());
  root.querySelector('.fbc-copy').addEventListener('click', async () => {
    const text = getFerryBerthCalibrationJson();
    const status = root.querySelector('.fbc-status');
    try {
      if (typeof copyVisualRouteCalibrationText === 'function') await copyVisualRouteCalibrationText(text);
      else await navigator.clipboard.writeText(text);
      status.textContent = '已複製 JSON（data/ferry-berths.json 嘅內容）';
    } catch {
      root.querySelector('.fbc-json').select();
      status.textContent = '複製唔到：喺下面個框自己揀晒複製';
    }
  });
  renderFerryBerthCalibrator();
}

function closeFerryBerthCalibrator() {
  const st = ferryBerthCalibratorState;
  if (!st) return;
  if (st.dirty && typeof confirm === 'function' && !confirm('有未儲存嘅校正，照樣關閉？')) return;
  st.root.remove();
  ferryBerthCalibratorState = null;
}

function toggleFerryBerthCalibrator(scene) {
  if (ferryBerthCalibratorState) closeFerryBerthCalibrator();
  else openFerryBerthCalibrator(scene);
}

// A turn of the map changes which berth is which: the panel follows.
function refreshFerryBerthCalibrator() {
  if (ferryBerthCalibratorState) renderFerryBerthCalibrator();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toggleFerryBerthCalibrator, isFerryBerthCalibrationActive, getFerryBerthCalibrationPreview };
}
