// 海上燈光校正 (test-mode dev tool): places the night lights on the 避風塘 models - 漁火閃閃.
//
// The sea counterpart of the building light calibrator, without the window grids: a model gets
// lamps (a point light that lights the deck around it and, optionally, throws a rippling
// reflection on the water) and lit areas (a polygon of the art - a cabin, a shop counter, a
// sign - brightened toward the light colour). A self-contained modal: the sim pauses, the left
// canvas shows the model with the lights drawn by sea-lighting.js - the code the bake uses, so
// what you see is the baked texture - and the right panel edits the lamps and areas.
//
// Lights are calibrated per view, on the baked day texture (Models/typhoonShelter/ts_<id>.png);
// the mirrored texture reuses them flipped. Work is saved to
// scripts/source-art/typhoonShelter/sea-lights.json through /api/dev/sea-light-profiles (dev
// launches only; localStorage otherwise). Run `npm run bake:typhoon-shelter` to bake it into the
// __lit textures.

const SEA_LIGHT_CALIBRATION_API = '/api/dev/sea-light-profiles';
const SEA_LIGHT_CALIBRATION_STORAGE_KEY = 'seaLightCalibration.v1';
const SEA_LIGHT_CALIBRATION_MIN_ZOOM = 0.25;
const SEA_LIGHT_CALIBRATION_MAX_ZOOM = 8;
const SEA_LIGHT_CALIBRATION_TWINKLE_MS = 420;
const SEA_LIGHT_CALIBRATION_WATER = '#0d2236';

// { partId: profile } - the working set (mirrors sea-lights.json)
const seaLightCalibrationEntries = {};

let seaLightCalibrationActive = false;
let seaLightCalibrationScene = null;
let seaLightCalibrationDom = null;
let seaLightCalibrationCategory = 'boat';
let seaLightCalibrationTarget = null;   // { id, img, W, H, day: ImageData-like data, frames: [canvas, canvas] | null }
let seaLightCalibrationSelection = null; // { kind: 'lamp' | 'area', index }
let seaLightCalibrationView = { zoom: 1, panX: 0, panY: 0 };
let seaLightCalibrationDrag = null;
let seaLightCalibrationShowNight = true;
let seaLightCalibrationTwinkle = true;
let seaLightCalibrationFrameIndex = 0;
let seaLightCalibrationTimer = null;
let seaLightCalibrationRenderQueued = false;
let seaLightCalibrationSaveTimer = null;
let seaLightCalibrationServerOk = false;
let seaLightCalibrationWasPaused = false;
let seaLightCalibrationKeyHandler = null;

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

function setSeaLightCalibrationEntries(entries) {
  Object.keys(seaLightCalibrationEntries).forEach((k) => delete seaLightCalibrationEntries[k]);
  Object.entries(entries || {}).forEach(([k, d]) => {
    const profile = normalizeSeaLightProfile(d);
    if (!isSeaLightProfileEmpty(profile)) seaLightCalibrationEntries[k] = profile;
  });
}

function writeSeaLightCalibrationLocal() {
  try {
    globalThis.localStorage?.setItem(SEA_LIGHT_CALIBRATION_STORAGE_KEY, JSON.stringify({
      schemaVersion: SEA_LIGHT_SCHEMA_VERSION, entries: seaLightCalibrationEntries,
    }));
  } catch { /* storage unavailable */ }
}

async function loadSeaLightCalibrationStore() {
  let local = {};
  try {
    const raw = globalThis.localStorage?.getItem(SEA_LIGHT_CALIBRATION_STORAGE_KEY);
    local = raw ? (JSON.parse(raw)?.entries || {}) : {};
  } catch { local = {}; }
  setSeaLightCalibrationEntries(local);
  seaLightCalibrationServerOk = false;
  if (typeof fetch !== 'function') return;
  try {
    const res = await fetch(SEA_LIGHT_CALIBRATION_API, { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    seaLightCalibrationServerOk = true;
    // the checked-in file is the source of truth; local-only work (made while the server
    // was unreachable) is merged in for parts the file does not have yet
    const merged = { ...local, ...(json.entries || {}) };
    setSeaLightCalibrationEntries(merged);
    writeSeaLightCalibrationLocal();
    if (Object.keys(merged).length !== Object.keys(json.entries || {}).length) scheduleSeaLightCalibrationSave();
  } catch { /* offline */ }
}

function scheduleSeaLightCalibrationSave() {
  writeSeaLightCalibrationLocal();
  if (seaLightCalibrationSaveTimer) clearTimeout(seaLightCalibrationSaveTimer);
  seaLightCalibrationSaveTimer = setTimeout(async () => {
    seaLightCalibrationSaveTimer = null;
    if (typeof fetch !== 'function') return;
    try {
      const res = await fetch(SEA_LIGHT_CALIBRATION_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: seaLightCalibrationEntries }),
      });
      seaLightCalibrationServerOk = res.ok;
      setSeaLightCalibrationMessage(res.ok
        ? '已寫入 sea-lights.json · 跑 npm run bake:typhoon-shelter 先會 bake 入貼圖'
        : '未能寫入 sea-lights.json（只存咗喺呢個瀏覽器）', res.ok ? 'success' : 'error');
    } catch {
      seaLightCalibrationServerOk = false;
      setSeaLightCalibrationMessage('未能寫入 sea-lights.json（只存咗喺呢個瀏覽器）', 'error');
    }
  }, 400);
}

function seaLightCalibrationCurrentProfile() {
  const t = seaLightCalibrationTarget;
  if (!t) return null;
  return normalizeSeaLightProfile(seaLightCalibrationEntries[t.id] || {});
}

function commitSeaLightCalibrationProfile(profile) {
  const t = seaLightCalibrationTarget;
  if (!t) return;
  const clean = normalizeSeaLightProfile(profile);
  if (isSeaLightProfileEmpty(clean)) delete seaLightCalibrationEntries[t.id];
  else seaLightCalibrationEntries[t.id] = clean;
  t.frames = null;
  scheduleSeaLightCalibrationSave();
}

function mutateSeaLightCalibration(fn) {
  const profile = seaLightCalibrationCurrentProfile();
  if (!profile) return;
  fn(profile);
  commitSeaLightCalibrationProfile(profile);
  renderSeaLightCalibration();
}

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------

function seaLightCalibrationTexturePath(id) {
  const file = typeof getTyphoonShelterTexturePath === 'function'
    ? getTyphoonShelterTexturePath(id).split('/').pop()
    : `ts_${id}.png`;
  return `/api/dev/typhoon-shelter-texture/${encodeURIComponent(file)}`;
}

function selectSeaLightCalibrationPart(id) {
  const partDef = TYPHOON_SHELTER_PARTS_BY_ID[id];
  if (!partDef) return;
  const target = { id, partDef, img: null, W: 0, H: 0, day: null, frames: null };
  seaLightCalibrationTarget = target;
  seaLightCalibrationSelection = null;
  const img = new Image();
  img.onload = () => {
    if (seaLightCalibrationTarget !== target) return;
    target.img = img;
    target.W = img.naturalWidth;
    target.H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = target.W;
    c.height = target.H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    target.day = ctx.getImageData(0, 0, target.W, target.H).data;
    fitSeaLightCalibrationView();
    renderSeaLightCalibration();
  };
  img.onerror = () => setSeaLightCalibrationMessage(`載入唔到 ts_${id}.png - 未 bake？先跑 npm run bake:typhoon-shelter`, 'error');
  img.src = `${seaLightCalibrationTexturePath(id)}?v=${Date.now()}`;
  renderSeaLightCalibration();
}

// A baked night frame (0 or 1 - the twinkle pair), drawn by the bake's own code into a canvas.
// Each frame is rendered the first time it is shown after a change.
function seaLightCalibrationFrame(frame) {
  const t = seaLightCalibrationTarget;
  if (!t || !t.day) return null;
  if (!t.frames) t.frames = [null, null];
  if (!t.frames[frame]) {
    const px = renderSeaNightPixels(t.day, t.W, t.H, seaLightCalibrationCurrentProfile(), { frame });
    const c = document.createElement('canvas');
    c.width = t.W;
    c.height = t.H;
    c.getContext('2d').putImageData(new ImageData(px, t.W, t.H), 0, 0);
    t.frames[frame] = c;
  }
  return t.frames[frame];
}

function fitSeaLightCalibrationView() {
  const dom = seaLightCalibrationDom;
  const t = seaLightCalibrationTarget;
  if (!dom || !t || !t.W) return;
  const fit = Math.min(dom.work.width * 0.92 / t.W, dom.work.height * 0.92 / t.H);
  seaLightCalibrationView = {
    zoom: Math.max(SEA_LIGHT_CALIBRATION_MIN_ZOOM, Math.min(SEA_LIGHT_CALIBRATION_MAX_ZOOM, fit || 1)),
    panX: 0,
    panY: 0,
  };
}

function seaLightCalibrationNormToCanvas(nx, ny) {
  const dom = seaLightCalibrationDom;
  const t = seaLightCalibrationTarget;
  const v = seaLightCalibrationView;
  return {
    x: dom.work.width / 2 + v.panX + (nx - 0.5) * t.W * v.zoom,
    y: dom.work.height / 2 + v.panY + (ny - 0.5) * t.H * v.zoom,
  };
}

function seaLightCalibrationCanvasToNorm(x, y) {
  const dom = seaLightCalibrationDom;
  const t = seaLightCalibrationTarget;
  const v = seaLightCalibrationView;
  return {
    nx: (x - dom.work.width / 2 - v.panX) / (t.W * v.zoom) + 0.5,
    ny: (y - dom.work.height / 2 - v.panY) / (t.H * v.zoom) + 0.5,
  };
}

function seaLightCalibrationHandles(profile) {
  const list = [];
  profile.lamps.forEach((l, i) => list.push({ kind: 'lamp', index: i, nx: l.x, ny: l.y, color: SEA_LIGHT_COLORS[l.color].rgb }));
  profile.areas.forEach((a, i) => a.c.forEach((pt, k) => list.push({
    kind: 'area', index: i, corner: k, nx: pt[0], ny: pt[1], color: SEA_LIGHT_COLORS[a.color].rgb,
  })));
  return list;
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function renderSeaLightCalibration() {
  if (seaLightCalibrationRenderQueued) return;
  seaLightCalibrationRenderQueued = true;
  const run = () => {
    seaLightCalibrationRenderQueued = false;
    renderSeaLightCalibrationWork();
    renderSeaLightCalibrationPanel();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
}

function renderSeaLightCalibrationWork() {
  const dom = seaLightCalibrationDom;
  if (!dom) return;
  const ctx = dom.workCtx;
  const canvas = dom.work;
  ctx.fillStyle = SEA_LIGHT_CALIBRATION_WATER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const t = seaLightCalibrationTarget;
  if (!t || !t.img) {
    ctx.fillStyle = '#7fa6c4';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(t ? '載入緊…' : '右邊揀類別 → 揀模型', 20, 30);
    return;
  }
  const v = seaLightCalibrationView;
  const tl = seaLightCalibrationNormToCanvas(0, 0);
  const source = seaLightCalibrationShowNight ? (seaLightCalibrationFrame(seaLightCalibrationFrameIndex) || t.img) : t.img;
  ctx.imageSmoothingEnabled = v.zoom < 2;
  ctx.drawImage(source, tl.x, tl.y, t.W * v.zoom, t.H * v.zoom);

  // texture bounds and the anchor line (bottom of the object, where it meets the water)
  ctx.strokeStyle = 'rgba(120,170,210,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(tl.x, tl.y, t.W * v.zoom, t.H * v.zoom);

  const profile = seaLightCalibrationCurrentProfile();
  const sel = seaLightCalibrationSelection;
  profile.areas.forEach((a, i) => {
    const pts = a.c.map((pt) => seaLightCalibrationNormToCanvas(pt[0], pt[1]));
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    const active = sel?.kind === 'area' && sel.index === i;
    ctx.strokeStyle = active ? 'rgba(255,230,150,0.95)' : 'rgba(255,230,150,0.35)';
    ctx.setLineDash(active ? [] : [4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  profile.lamps.forEach((l, i) => {
    const p = seaLightCalibrationNormToCanvas(l.x, l.y);
    const active = sel?.kind === 'lamp' && sel.index === i;
    ctx.beginPath();
    ctx.arc(p.x, p.y, l.r * t.W * v.zoom, 0, Math.PI * 2);
    ctx.strokeStyle = active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)';
    ctx.stroke();
  });
  seaLightCalibrationHandles(profile).forEach((h) => {
    const p = seaLightCalibrationNormToCanvas(h.nx, h.ny);
    const active = sel && sel.kind === h.kind && sel.index === h.index;
    if (h.kind === 'area' && !active) return; // corners only on the selected area
    ctx.beginPath();
    if (h.kind === 'lamp') ctx.arc(p.x, p.y, active ? 7 : 6, 0, Math.PI * 2);
    else ctx.rect(p.x - 5, p.y - 5, 10, 10);
    ctx.fillStyle = `rgb(${h.color.join(',')})`;
    ctx.fill();
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.strokeStyle = active ? '#ffffff' : 'rgba(5,10,18,0.9)';
    ctx.stroke();
  });
}

// ---------------------------------------------------------------------------
// interaction
// ---------------------------------------------------------------------------

function seaLightCalibrationEventPoint(ev) {
  const rect = seaLightCalibrationDom.work.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (seaLightCalibrationDom.work.width / rect.width),
    y: (ev.clientY - rect.top) * (seaLightCalibrationDom.work.height / rect.height),
  };
}

function onSeaLightCalibrationDown(ev) {
  const t = seaLightCalibrationTarget;
  if (!t || !t.img) return;
  const { x, y } = seaLightCalibrationEventPoint(ev);
  const profile = seaLightCalibrationCurrentProfile();
  const sel = seaLightCalibrationSelection;
  let hit = null;
  seaLightCalibrationHandles(profile).forEach((h) => {
    if (h.kind === 'area' && !(sel?.kind === 'area' && sel.index === h.index)) return;
    const p = seaLightCalibrationNormToCanvas(h.nx, h.ny);
    if (Math.hypot(p.x - x, p.y - y) <= 10) hit = h;
  });
  if (!hit) {
    // a click inside an area polygon selects it
    const n = seaLightCalibrationCanvasToNorm(x, y);
    profile.areas.forEach((a, i) => {
      let inside = false;
      for (let k = 0, j = a.c.length - 1; k < a.c.length; j = k++) {
        const [xi, yi] = a.c[k];
        const [xj, yj] = a.c[j];
        if ((yi > n.ny) !== (yj > n.ny) && n.nx < ((xj - xi) * (n.ny - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) hit = { kind: 'area', index: i, corner: null, move: true, start: n, orig: a.c.map((pt) => [...pt]) };
    });
  }
  if (hit) {
    seaLightCalibrationSelection = { kind: hit.kind, index: hit.index };
    seaLightCalibrationDrag = hit;
  } else {
    seaLightCalibrationDrag = { pan: true, sx: x, sy: y, px: seaLightCalibrationView.panX, py: seaLightCalibrationView.panY };
  }
  renderSeaLightCalibration();
  ev.preventDefault();
}

function onSeaLightCalibrationMove(ev) {
  const drag = seaLightCalibrationDrag;
  if (!drag || !seaLightCalibrationDom) return;
  const { x, y } = seaLightCalibrationEventPoint(ev);
  if (drag.pan) {
    seaLightCalibrationView.panX = drag.px + (x - drag.sx);
    seaLightCalibrationView.panY = drag.py + (y - drag.sy);
    renderSeaLightCalibration();
    return;
  }
  const n = seaLightCalibrationCanvasToNorm(x, y);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  // light the result only on release: re-baking the frames on every mouse move is ~50 ms
  const profile = seaLightCalibrationCurrentProfile();
  if (drag.kind === 'lamp') {
    profile.lamps[drag.index].x = clamp(n.nx);
    profile.lamps[drag.index].y = clamp(n.ny);
  } else if (drag.move) {
    const dx = n.nx - drag.start.nx;
    const dy = n.ny - drag.start.ny;
    profile.areas[drag.index].c = drag.orig.map((pt) => [clamp(pt[0] + dx), clamp(pt[1] + dy)]);
  } else {
    profile.areas[drag.index].c[drag.corner] = [clamp(n.nx), clamp(n.ny)];
  }
  const t = seaLightCalibrationTarget;
  const frames = t.frames;
  commitSeaLightCalibrationProfile(profile);
  t.frames = frames; // keep showing the last bake while dragging
  drag.moved = true;
  renderSeaLightCalibration();
}

function onSeaLightCalibrationUp() {
  const drag = seaLightCalibrationDrag;
  seaLightCalibrationDrag = null;
  if (drag?.moved && seaLightCalibrationTarget) {
    seaLightCalibrationTarget.frames = null;
    renderSeaLightCalibration();
  }
}

function onSeaLightCalibrationWheel(ev) {
  ev.preventDefault();
  const f = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  seaLightCalibrationView.zoom = Math.max(SEA_LIGHT_CALIBRATION_MIN_ZOOM,
    Math.min(SEA_LIGHT_CALIBRATION_MAX_ZOOM, seaLightCalibrationView.zoom * f));
  renderSeaLightCalibration();
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

function seaLightCalibrationColorSelect(value, onChange) {
  const s = document.createElement('select');
  Object.entries(SEA_LIGHT_COLORS).forEach(([key, def]) => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = def.label;
    s.appendChild(o);
  });
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function seaLightCalibrationButton(text, onClick, title) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function createSeaLightCalibrationDom() {
  if (seaLightCalibrationDom) return seaLightCalibrationDom;
  if (typeof document === 'undefined' || !document.body) return null;
  if (!document.getElementById('slcal-style')) {
    const style = document.createElement('style');
    style.id = 'slcal-style';
    style.textContent = `
      #slcal-modal{position:fixed;inset:0;z-index:200000;background:rgba(4,8,14,.82);display:flex;
        align-items:center;justify-content:center;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#eaf6ff}
      #slcal-modal[hidden]{display:none!important}
      #slcal-win{width:min(1200px,96vw);height:min(820px,94vh);display:flex;border:1px solid #33475f;
        border-radius:14px;overflow:hidden;background:#0b111b;box-shadow:0 30px 90px rgba(0,0,0,.6)}
      #slcal-left{flex:1;position:relative;display:flex}
      #slcal-work{flex:1;width:100%;height:100%;display:block;cursor:grab}
      #slcal-work:active{cursor:grabbing}
      #slcal-tools{position:absolute;top:10px;left:10px;display:flex;gap:5px;align-items:center;
        background:rgba(9,17,28,.85);border:1px solid #2a3a52;border-radius:8px;padding:5px 7px}
      #slcal-right{width:350px;flex:0 0 350px;background:rgba(9,17,28,.98);border-left:1px solid #33475f;overflow-y:auto;padding:12px}
      #slcal-right h4{font-weight:800;color:#8fd6ff;letter-spacing:.04em;margin:12px 0 6px}
      #slcal-right h4:first-child{margin-top:0}
      #slcal-modal select{background:#123243;color:#eaf6ff;border:1px solid #3f7f9c;border-radius:6px;padding:4px;font:inherit}
      #slcal-right > select{width:100%;margin-bottom:5px}
      #slcal-modal button{border:1px solid #3f7f9c;border-radius:7px;padding:4px 7px;color:#eaf6ff;background:#123243;font:inherit;cursor:pointer}
      #slcal-modal button:hover{background:#1a4a62}
      #slcal-modal button[data-active="true"]{background:#1f9d5c;border-color:#7ce8a8;color:#06210f}
      #slcal-right .sl-item{display:flex;align-items:center;gap:4px;margin:4px 0;padding:3px;border-radius:6px}
      #slcal-right .sl-item[data-active="true"]{background:#16324a}
      #slcal-right .sl-item span{flex:1;min-width:6ch;color:#a9c6da;cursor:pointer;white-space:nowrap}
      #slcal-right .sl-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
      #slcal-right .sl-msg{min-height:15px;margin-top:8px;color:#a9c6da}
      #slcal-right .sl-msg[data-tone="success"]{color:#9be89b}
      #slcal-right .sl-msg[data-tone="error"]{color:#ff9a9a}
      #slcal-right .sl-note{color:#6f8ea6;margin:4px 0}
    `;
    document.head.appendChild(style);
  }
  const modal = document.createElement('div');
  modal.id = 'slcal-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div id="slcal-win">
      <div id="slcal-left">
        <canvas id="slcal-work"></canvas>
        <div id="slcal-tools">
          <button type="button" data-zoom="-1">−</button>
          <b class="sl-zoom" style="min-width:4ch;text-align:center">100%</b>
          <button type="button" data-zoom="1">＋</button>
          <button type="button" class="sl-fit">置中</button>
          <button type="button" class="sl-night">夜晚</button>
          <button type="button" class="sl-twinkle">閃爍</button>
        </div>
      </div>
      <div id="slcal-right">
        <h4>海上燈光校正 · 漁火 <button type="button" class="sl-close" style="float:right">✕ 收起</button></h4>
        <select class="sl-cat"></select>
        <select class="sl-part"></select>
        <div class="sl-note sl-key">(未揀模型)</div>
        <h4>燈 <button type="button" class="sl-lamp-add" style="float:right">＋燈</button></h4>
        <div class="sl-lamps"></div>
        <div class="sl-note">拖圓點移位；r 係光暈大小；「倒影」= 水面漁火倒影。</div>
        <h4>發光範圍 <button type="button" class="sl-area-add" style="float:right">＋範圍</button></h4>
        <div class="sl-areas"></div>
        <div class="sl-note">撳範圍入面揀佢，拖方角改形，拖中間成塊移。用嚟整船艙、檔口、招牌發光。</div>
        <div class="sl-actions">
          <button type="button" class="sl-reset">清除呢個</button>
          <button type="button" class="sl-copy-other">複製去另一視角</button>
          <button type="button" class="sl-export">匯出全部 JSON</button>
          <button type="button" class="sl-import">匯入 JSON</button>
        </div>
        <div class="sl-msg"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const work = modal.querySelector('#slcal-work');
  const cat = modal.querySelector('.sl-cat');
  TYPHOON_SHELTER_CATEGORIES.forEach(([id, label]) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = label;
    cat.appendChild(o);
  });
  seaLightCalibrationDom = {
    modal,
    work,
    workCtx: work.getContext('2d'),
    right: modal.querySelector('#slcal-right'),
    cat,
    part: modal.querySelector('.sl-part'),
    key: modal.querySelector('.sl-key'),
    lamps: modal.querySelector('.sl-lamps'),
    areas: modal.querySelector('.sl-areas'),
    zoom: modal.querySelector('.sl-zoom'),
    msg: modal.querySelector('.sl-msg'),
  };

  cat.addEventListener('change', () => { seaLightCalibrationCategory = cat.value; populateSeaLightCalibrationParts(); });
  seaLightCalibrationDom.part.addEventListener('change', (e) => { if (e.target.value) selectSeaLightCalibrationPart(e.target.value); });
  modal.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    const f = Number(b.dataset.zoom) > 0 ? 1.2 : 1 / 1.2;
    seaLightCalibrationView.zoom = Math.max(SEA_LIGHT_CALIBRATION_MIN_ZOOM, Math.min(SEA_LIGHT_CALIBRATION_MAX_ZOOM, seaLightCalibrationView.zoom * f));
    renderSeaLightCalibration();
  }));
  modal.querySelector('.sl-fit').addEventListener('click', () => { fitSeaLightCalibrationView(); renderSeaLightCalibration(); });
  modal.querySelector('.sl-night').addEventListener('click', () => { seaLightCalibrationShowNight = !seaLightCalibrationShowNight; renderSeaLightCalibration(); });
  modal.querySelector('.sl-twinkle').addEventListener('click', () => { seaLightCalibrationTwinkle = !seaLightCalibrationTwinkle; seaLightCalibrationFrameIndex = 0; renderSeaLightCalibration(); });
  modal.querySelector('.sl-lamp-add').addEventListener('click', () => mutateSeaLightCalibration((p) => {
    p.lamps.push({ x: 0.5, y: 0.6, r: 0.06, color: 'fishing', reflect: true });
    seaLightCalibrationSelection = { kind: 'lamp', index: p.lamps.length - 1 };
  }));
  modal.querySelector('.sl-area-add').addEventListener('click', () => mutateSeaLightCalibration((p) => {
    p.areas.push({ c: [[0.42, 0.6], [0.58, 0.6], [0.58, 0.7], [0.42, 0.7]], color: 'warm', strength: 0.85 });
    seaLightCalibrationSelection = { kind: 'area', index: p.areas.length - 1 };
  }));
  modal.querySelector('.sl-reset').addEventListener('click', () => {
    if (!seaLightCalibrationTarget) return;
    commitSeaLightCalibrationProfile({ lamps: [], areas: [] });
    seaLightCalibrationSelection = null;
    renderSeaLightCalibration();
    setSeaLightCalibrationMessage('已清除', 'info');
  });
  // The other view of the same object, mirrored: a head start, since the two renders roughly
  // swap sides. Positions still need a nudge - the views are different drawings.
  modal.querySelector('.sl-copy-other').addEventListener('click', () => {
    const t = seaLightCalibrationTarget;
    if (!t) return;
    const other = TYPHOON_SHELTER_PARTS.find((p) => p.sheet === t.partDef.sheet && p.id !== t.id);
    if (!other) { setSeaLightCalibrationMessage('呢個模型冇另一個視角', 'error'); return; }
    seaLightCalibrationEntries[other.id] = mirrorSeaLightProfile(seaLightCalibrationCurrentProfile());
    scheduleSeaLightCalibrationSave();
    selectSeaLightCalibrationPart(other.id);
    setSeaLightCalibrationMessage(`已鏡像複製去 ${other.id}，記得逐粒燈對返位`, 'success');
  });
  modal.querySelector('.sl-export').addEventListener('click', () => {
    const text = JSON.stringify({ schemaVersion: SEA_LIGHT_SCHEMA_VERSION, entries: seaLightCalibrationEntries }, null, 1);
    const done = () => setSeaLightCalibrationMessage('已複製全部 JSON', 'success');
    const p = typeof copyVisualRouteCalibrationText === 'function' ? copyVisualRouteCalibrationText(text)
      : (navigator?.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject());
    p.then(done).catch(() => setSeaLightCalibrationMessage('複製失敗（睇 console）', 'error'));
    if (typeof console !== 'undefined') console.log(text);
  });
  modal.querySelector('.sl-import').addEventListener('click', () => {
    const text = globalThis.prompt?.('貼上 sea-lights JSON');
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      setSeaLightCalibrationEntries(parsed?.entries || parsed);
      if (seaLightCalibrationTarget) seaLightCalibrationTarget.frames = null;
      scheduleSeaLightCalibrationSave();
      renderSeaLightCalibration();
      setSeaLightCalibrationMessage(`已匯入 ${Object.keys(seaLightCalibrationEntries).length} 個`, 'success');
    } catch { setSeaLightCalibrationMessage('JSON 解析失敗', 'error'); }
  });
  modal.querySelector('.sl-close').addEventListener('click', teardownSeaLightCalibrator);
  work.addEventListener('pointerdown', onSeaLightCalibrationDown);
  window.addEventListener('pointermove', onSeaLightCalibrationMove);
  window.addEventListener('pointerup', onSeaLightCalibrationUp);
  work.addEventListener('wheel', onSeaLightCalibrationWheel, { passive: false });
  return seaLightCalibrationDom;
}

function resizeSeaLightCalibrationCanvas() {
  const dom = seaLightCalibrationDom;
  if (!dom) return;
  const rect = dom.work.getBoundingClientRect();
  dom.work.width = Math.max(320, Math.round(rect.width));
  dom.work.height = Math.max(240, Math.round(rect.height));
}

function populateSeaLightCalibrationParts() {
  const dom = seaLightCalibrationDom;
  if (!dom) return;
  const list = TYPHOON_SHELTER_PARTS.filter((p) => p.category === seaLightCalibrationCategory);
  dom.part.replaceChildren();
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = `— 揀模型 (${list.length}) —`;
  dom.part.appendChild(ph);
  list.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = `${seaLightCalibrationEntries[p.id] ? '✓ ' : ''}${p.label}`;
    dom.part.appendChild(o);
  });
  dom.part.value = seaLightCalibrationTarget && list.some((p) => p.id === seaLightCalibrationTarget.id) ? seaLightCalibrationTarget.id : '';
}

function setSeaLightCalibrationMessage(text, tone = 'info') {
  if (!seaLightCalibrationDom) return;
  seaLightCalibrationDom.msg.textContent = String(text || '');
  seaLightCalibrationDom.msg.dataset.tone = tone;
}

function renderSeaLightCalibrationPanel() {
  const dom = seaLightCalibrationDom;
  if (!dom) return;
  const t = seaLightCalibrationTarget;
  dom.cat.value = seaLightCalibrationCategory;
  dom.zoom.textContent = `${Math.round(seaLightCalibrationView.zoom * 100)}%`;
  dom.modal.querySelector('.sl-night').dataset.active = String(seaLightCalibrationShowNight);
  dom.modal.querySelector('.sl-twinkle').dataset.active = String(seaLightCalibrationTwinkle);
  populateSeaLightCalibrationParts();
  if (!t) {
    dom.key.textContent = '(未揀模型)';
    dom.lamps.replaceChildren();
    dom.areas.replaceChildren();
    return;
  }
  const profile = seaLightCalibrationCurrentProfile();
  const facing = t.partDef.facing ? ` · 船頭向 ${t.partDef.facing.toUpperCase()}` : '';
  dom.key.textContent = `ts_${t.id}${t.W ? ` · ${t.W}×${t.H}` : ''}${facing}${t.partDef.mirror ? ' · 有鏡像' : ''}`;
  const sel = seaLightCalibrationSelection;
  dom.lamps.replaceChildren(...profile.lamps.map((l, i) => {
    const row = document.createElement('div');
    row.className = 'sl-item';
    row.dataset.active = String(sel?.kind === 'lamp' && sel.index === i);
    const label = document.createElement('span');
    label.textContent = `${i + 1}. r${l.r.toFixed(2)}`;
    label.addEventListener('click', () => { seaLightCalibrationSelection = { kind: 'lamp', index: i }; renderSeaLightCalibration(); });
    row.append(
      label,
      seaLightCalibrationColorSelect(l.color, (v) => mutateSeaLightCalibration((p) => { p.lamps[i].color = v; })),
      seaLightCalibrationButton('r−', () => mutateSeaLightCalibration((p) => { p.lamps[i].r = Math.max(0.01, p.lamps[i].r - 0.01); })),
      seaLightCalibrationButton('r+', () => mutateSeaLightCalibration((p) => { p.lamps[i].r += 0.01; })),
      seaLightCalibrationButton('倒影', () => mutateSeaLightCalibration((p) => { p.lamps[i].reflect = !p.lamps[i].reflect; }), '水面倒影'),
      seaLightCalibrationButton('×', () => mutateSeaLightCalibration((p) => { p.lamps.splice(i, 1); seaLightCalibrationSelection = null; })),
    );
    row.querySelectorAll('button')[2].dataset.active = String(l.reflect);
    return row;
  }));
  dom.areas.replaceChildren(...profile.areas.map((a, i) => {
    const row = document.createElement('div');
    row.className = 'sl-item';
    row.dataset.active = String(sel?.kind === 'area' && sel.index === i);
    const label = document.createElement('span');
    label.textContent = `${'ABCDEFGH'[i] || i + 1} 光度 ${Math.round(a.strength * 100)}%`;
    label.addEventListener('click', () => { seaLightCalibrationSelection = { kind: 'area', index: i }; renderSeaLightCalibration(); });
    row.append(
      label,
      seaLightCalibrationColorSelect(a.color, (v) => mutateSeaLightCalibration((p) => { p.areas[i].color = v; })),
      seaLightCalibrationButton('−', () => mutateSeaLightCalibration((p) => { p.areas[i].strength = Math.max(0.1, p.areas[i].strength - 0.1); })),
      seaLightCalibrationButton('+', () => mutateSeaLightCalibration((p) => { p.areas[i].strength = Math.min(1, p.areas[i].strength + 0.1); })),
      seaLightCalibrationButton('×', () => mutateSeaLightCalibration((p) => { p.areas.splice(i, 1); seaLightCalibrationSelection = null; })),
    );
    return row;
  }));
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

function startSeaLightCalibrator(scene) {
  seaLightCalibrationActive = true;
  seaLightCalibrationScene = scene;
  seaLightCalibrationWasPaused = typeof isSimPaused === 'function' ? isSimPaused()
    : (typeof simPaused !== 'undefined' ? simPaused : false);
  if (typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') setGameSpeed(GAME_SPEEDS.PAUSED);
  createSeaLightCalibrationDom();
  seaLightCalibrationDom.modal.hidden = false;
  resizeSeaLightCalibrationCanvas();
  setSeaLightCalibrationMessage('揀類別 → 揀模型。＋燈 放漁火／燈籠，＋範圍 令船艙、檔口發光。');
  loadSeaLightCalibrationStore().then(() => {
    if (!seaLightCalibrationServerOk) setSeaLightCalibrationMessage('⚠ 連唔到 /api/dev/sea-light-profiles（只喺開發版有）：改動只會存喺呢個瀏覽器。', 'error');
    renderSeaLightCalibration();
  });
  renderSeaLightCalibration();
  seaLightCalibrationTimer = setInterval(() => {
    if (!seaLightCalibrationTwinkle || !seaLightCalibrationShowNight || seaLightCalibrationDrag) return;
    seaLightCalibrationFrameIndex = 1 - seaLightCalibrationFrameIndex;
    renderSeaLightCalibrationWork();
  }, SEA_LIGHT_CALIBRATION_TWINKLE_MS);
  seaLightCalibrationKeyHandler = (e) => {
    if (!seaLightCalibrationActive) return;
    if (e.key === 'Escape') { teardownSeaLightCalibrator(); return; }
    const sel = seaLightCalibrationSelection;
    const t = seaLightCalibrationTarget;
    if (!sel || !t || !t.W) return;
    const step = (e.shiftKey ? 5 : 1);
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    // arrow keys move the selection by texture pixels
    mutateSeaLightCalibration((p) => {
      const dx = d[0] / t.W;
      const dy = d[1] / t.H;
      if (sel.kind === 'lamp' && p.lamps[sel.index]) {
        p.lamps[sel.index].x += dx;
        p.lamps[sel.index].y += dy;
      } else if (sel.kind === 'area' && p.areas[sel.index]) {
        p.areas[sel.index].c = p.areas[sel.index].c.map((pt) => [pt[0] + dx, pt[1] + dy]);
      }
    });
  };
  window.addEventListener('keydown', seaLightCalibrationKeyHandler);
  window.addEventListener('resize', seaLightCalibrationResizeHandler);
}

function seaLightCalibrationResizeHandler() {
  if (!seaLightCalibrationActive) return;
  resizeSeaLightCalibrationCanvas();
  renderSeaLightCalibration();
}

function teardownSeaLightCalibrator() {
  seaLightCalibrationActive = false;
  seaLightCalibrationDrag = null;
  if (seaLightCalibrationDom) seaLightCalibrationDom.modal.hidden = true;
  if (seaLightCalibrationTimer) { clearInterval(seaLightCalibrationTimer); seaLightCalibrationTimer = null; }
  if (!seaLightCalibrationWasPaused && typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') {
    setGameSpeed(GAME_SPEEDS.NORMAL);
  }
  if (seaLightCalibrationKeyHandler) {
    window.removeEventListener('keydown', seaLightCalibrationKeyHandler);
    seaLightCalibrationKeyHandler = null;
  }
  window.removeEventListener('resize', seaLightCalibrationResizeHandler);
}

function toggleSeaLightCalibrator(scene) {
  if (seaLightCalibrationActive) { teardownSeaLightCalibrator(); return false; }
  if (!scene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
    || !isVisualRouteCalibrationTestModeEnabled()) return false;
  startSeaLightCalibrator(scene);
  return true;
}

function isSeaLightCalibrationActive() { return seaLightCalibrationActive; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toggleSeaLightCalibrator, isSeaLightCalibrationActive };
}
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { toggleSeaLightCalibrator, teardownSeaLightCalibrator, isSeaLightCalibrationActive });
}
