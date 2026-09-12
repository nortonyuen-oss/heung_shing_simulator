// Building night-lighting calibrator (test-branch-only dev tool).
//
// A self-contained modal window - NOT Phaser objects on the game canvas. When it
// opens the sim pauses and a full-screen backdrop blocks the game. Left: an HTML
// canvas workbench (the model + its editable overlay, own zoom/pan) with a
// scaled real-effect preview in the corner that renders the actual glow against
// a selectable time-of-day backdrop. Right: the settings (catalogue, class,
// window panels A-D, street lamps, blinking beacons, flags).
//
// All calibration is stored in a dedicated SQLite table via
// /api/building-light-profiles - independent of game saves, so it survives
// "new city", save deletion and schema changes. localStorage is a fallback.
// [套用] flushes to SQLite and relights the city; [匯出全部 JSON] / [匯入 JSON]
// move the whole set for baking into building-lighting.js at release.

const BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION = 3;
const BUILDING_LIGHT_CALIBRATION_STORAGE_KEY = 'buildingLightCalibration.v3';
const BUILDING_LIGHT_CALIBRATION_LEGACY_KEYS = ['buildingLightCalibration.v2'];
const BUILDING_LIGHT_CALIBRATION_API = '/api/building-light-profiles';

const BUILDING_LIGHT_CALIBRATION_BUCKETS = Object.freeze([
  ['duskRamp', '黃昏'], ['eveningPeak', '晚高峰'], ['lateEvening', '晚間'],
  ['deepNight', '深夜'], ['dawnFade', '天光'],
]);
const BUILDING_LIGHT_CALIBRATION_BUCKET_BG = Object.freeze({
  duskRamp: '#2b2438', eveningPeak: '#121b2c', lateEvening: '#0c1322',
  deepNight: '#080d18', dawnFade: '#171f34',
});
const BUILDING_LIGHT_CALIBRATION_CATEGORIES = Object.freeze([
  ['residential', '住宅'], ['commercial', '商業'], ['industrial', '工業'],
  ['government', '政府'], ['special', '地標'], ['power', '能源'], ['transport', '交通'],
  ['park', '公園'],
]);
const BUILDING_LIGHT_CALIBRATION_BEACON_ORDER = Object.freeze(['red', 'blue', 'white', 'yellow', 'green']);
const BUILDING_LIGHT_CALIBRATION_BEACON_LABEL = Object.freeze({
  red: '紅', blue: '藍', white: '白', yellow: '黃', green: '綠',
});
const BUILDING_LIGHT_CALIBRATION_BEACON_CSS = Object.freeze({
  red: '#ff3b30', blue: '#3b82ff', white: '#f4f8ff', yellow: '#ffd23b', green: '#39d353',
});
const BUILDING_LIGHT_CALIBRATION_MIN_ZOOM = 0.4;
const BUILDING_LIGHT_CALIBRATION_MAX_ZOOM = 12;

// { spriteKey: data } - the working set (mirrors the SQLite table)
const buildingLightCalibrationOverrides = {};

let buildingLightCalibrationActive = false;
let buildingLightCalibrationScene = null;
let buildingLightCalibrationDom = null;      // { modal, work, workCtx, effect, effectCtx, right, ... }
let buildingLightCalibrationCatalog = null;
let buildingLightCalibrationCategory = 'residential';
let buildingLightCalibrationWorkBucket = 'eveningPeak';
let buildingLightCalibrationEffectBucket = 'eveningPeak';
let buildingLightCalibrationPanelIndex = 0;
let buildingLightCalibrationTarget = null;   // { key, cls, zone, family, img, imgW, imgH }
let buildingLightCalibrationView = { zoom: 1, panX: 0, panY: 0 };
let buildingLightCalibrationDrag = null;     // { id } | { pan: true, ox, oy, px, py }
let buildingLightCalibrationWasPaused = false;
let buildingLightCalibrationSaveTimer = null;
let buildingLightCalibrationKeyHandler = null;

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

function migrateBuildingLightCalibrationData(d) {
  const data = { ...d };
  if (!Array.isArray(data.lamps)) {
    data.lamps = data.entrance
      ? [{ x: data.ex ?? 0.5, y: data.ey ?? 0.9, r: data.er ?? 0.1 }]
      : (data.entrance === null ? [] : [{ x: data.ex ?? 0.5, y: data.ey ?? 0.9, r: data.er ?? 0.1 }]);
  }
  if (!Array.isArray(data.beacons)) data.beacons = [];
  delete data.entrance;
  delete data.ex;
  delete data.ey;
  delete data.er;
  delete data.__custom;
  data.panels = (Array.isArray(data.panels) ? data.panels : []).map((p) => ({
    c: p.c || p.corners || [[0.15, 0.2], [0.5, 0.3], [0.5, 0.8], [0.15, 0.7]],
    rows: Math.max(1, Math.round(p.rows ?? 8)),
    cols: Math.max(1, Math.round(p.cols ?? 5)),
    on: p.on !== false,
  }));
  return data;
}

function readBuildingLightCalibrationLocal() {
  const merged = {};
  const read = (key) => {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : null;
    } catch { return null; }
  };
  [...BUILDING_LIGHT_CALIBRATION_LEGACY_KEYS, BUILDING_LIGHT_CALIBRATION_STORAGE_KEY].forEach((k) => {
    const e = read(k);
    // legacy stores prefixed hero keys with '@'; everything is per-model now
    if (e) Object.entries(e).forEach(([kk, d]) => { merged[kk.replace(/^@/, '')] = migrateBuildingLightCalibrationData(d); });
  });
  return merged;
}

function writeBuildingLightCalibrationLocal() {
  try {
    globalThis.localStorage?.setItem(BUILDING_LIGHT_CALIBRATION_STORAGE_KEY, JSON.stringify({
      schemaVersion: BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION,
      entries: buildingLightCalibrationOverrides,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* private mode etc */ }
}

function setBuildingLightCalibrationOverrides(entries) {
  Object.keys(buildingLightCalibrationOverrides).forEach((k) => delete buildingLightCalibrationOverrides[k]);
  Object.entries(entries || {}).forEach(([k, d]) => { buildingLightCalibrationOverrides[k] = d; });
}

async function loadBuildingLightCalibrationStore() {
  const local = readBuildingLightCalibrationLocal();
  setBuildingLightCalibrationOverrides(local);
  if (typeof fetch === 'function') {
    try {
      const res = await fetch(BUILDING_LIGHT_CALIBRATION_API);
      if (res.ok) {
        const json = await res.json();
        if (json && json.entries) {
          setBuildingLightCalibrationOverrides(json.entries);
          writeBuildingLightCalibrationLocal();
        }
      } else if (Object.keys(local).length) {
        // seed the empty table from localStorage the first time
        await fetch(BUILDING_LIGHT_CALIBRATION_API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: local }),
        }).catch(() => {});
      }
    } catch { /* offline */ }
  }
  pushBuildingLightCalibrationToRuntime();
}

// keep the live city in sync with the working set
function pushBuildingLightCalibrationToRuntime() {
  if (typeof loadBuildingLightDbProfiles === 'function') {
    loadBuildingLightDbProfiles(buildingLightCalibrationOverrides);
  }
  if (typeof refreshAllBuildingLightGlows === 'function' && buildingLightCalibrationScene) {
    refreshAllBuildingLightGlows(buildingLightCalibrationScene, true);
  }
}

function saveBuildingLightCalibrationEntry(key, data) {
  buildingLightCalibrationOverrides[key] = data;
  writeBuildingLightCalibrationLocal();
  if (typeof setBuildingLightDbProfile === 'function') setBuildingLightDbProfile(key, data);
  if (typeof refreshAllBuildingLightGlows === 'function' && buildingLightCalibrationScene) {
    refreshAllBuildingLightGlows(buildingLightCalibrationScene, true);
  }
  // debounced durable write to SQLite
  if (buildingLightCalibrationSaveTimer) clearTimeout(buildingLightCalibrationSaveTimer);
  buildingLightCalibrationSaveTimer = setTimeout(() => {
    if (typeof fetch !== 'function') return;
    fetch(`${BUILDING_LIGHT_CALIBRATION_API}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    }).catch(() => {});
  }, 350);
}

function deleteBuildingLightCalibrationEntry(key) {
  delete buildingLightCalibrationOverrides[key];
  writeBuildingLightCalibrationLocal();
  if (typeof setBuildingLightDbProfile === 'function') setBuildingLightDbProfile(key, null);
  if (typeof fetch === 'function') {
    fetch(`${BUILDING_LIGHT_CALIBRATION_API}/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
  }
  pushBuildingLightCalibrationToRuntime();
}

async function replaceBuildingLightCalibrationEntries(entries) {
  const clean = {};
  Object.entries(entries || {}).forEach(([k, d]) => { clean[k] = migrateBuildingLightCalibrationData(d); });
  setBuildingLightCalibrationOverrides(clean);
  writeBuildingLightCalibrationLocal();
  pushBuildingLightCalibrationToRuntime();
  if (typeof fetch === 'function') {
    await fetch(BUILDING_LIGHT_CALIBRATION_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: clean }),
    }).catch(() => {});
  }
}

// The optional in-editor live override the runtime consults first. We drive the
// city straight through the DB map instead, so this stays null.
function getBuildingLightCalibrationOverride() { return null; }

function isBuildingLightCalibrationActive() { return buildingLightCalibrationActive; }
function isBuildingLightCalibrationInputActive() { return buildingLightCalibrationActive; }

// ---------------------------------------------------------------------------
// catalogue
// ---------------------------------------------------------------------------

function buildBuildingLightCatalog() {
  const cats = {};
  BUILDING_LIGHT_CALIBRATION_CATEGORIES.forEach(([id]) => { cats[id] = []; });
  const seen = new Set();
  const add = (cat, key, pathRaw, foot, zone) => {
    if (!key || !pathRaw || seen.has(key) || !cats[cat]) return;
    seen.add(key);
    const path = typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(pathRaw) : pathRaw;
    cats[cat].push({ key, path, footprintCols: foot || 2, zone: !!zone });
  };
  const flat = (v) => (Array.isArray(v) ? v : Object.values(v || {}));

  if (typeof houseModelSets === 'object') {
    flat(houseModelSets).forEach((set) => flat(set).forEach(
      (m) => add('residential', m.key, m.path || m.logicalPath, m.footprintCols, true),
    ));
  }
  if (typeof commercialBuildingModels !== 'undefined') {
    flat(commercialBuildingModels).forEach((m) => add('commercial', m.key, m.path || m.logicalPath, m.footprintCols, true));
  }
  if (typeof industrialBuildingModels !== 'undefined') {
    flat(industrialBuildingModels).forEach((m) => add('industrial', m.key, m.path || m.logicalPath, m.footprintCols, true));
  }
  const addConst = (obj, cat) => flat(obj).forEach((m) => {
    if (Array.isArray(m)) { m.forEach((v) => add(cat, v.spriteKey, v.path, v.footprintCols, false)); return; }
    add(cat, m.spriteKey, m.path, m.footprintCols, false);
  });
  if (typeof SERVICE_BUILDING_MODELS !== 'undefined') addConst(SERVICE_BUILDING_MODELS, 'government');
  if (typeof SERVICE_BUILDING_MODEL_VARIANTS !== 'undefined') addConst(SERVICE_BUILDING_MODEL_VARIANTS, 'government');
  if (typeof SPECIAL_BUILDING_MODELS !== 'undefined') addConst(SPECIAL_BUILDING_MODELS, 'special');
  if (typeof POWER_PLANT_MODELS !== 'undefined') addConst(POWER_PLANT_MODELS, 'power');
  // The container port and bus depot come in four orientations, each its own
  // sprite key and its own art, so each is calibrated on its own.
  if (typeof HARBOR_MODELS !== 'undefined') addConst(HARBOR_MODELS, 'transport');
  if (typeof BUS_DEPOT_MODELS !== 'undefined') addConst(BUS_DEPOT_MODELS, 'transport');
  if (typeof PARK_MODELS !== 'undefined') addConst(PARK_MODELS, 'park');

  cats.special = cats.special.filter((m) => {
    if (/airport|bus_depot|ferry|pier|heliport|mtr|station/i.test(m.key)) { cats.transport.push(m); return false; }
    return true;
  });
  Object.values(cats).forEach((list) => list.sort((a, b) => a.key.localeCompare(b.key)));
  return cats;
}

function buildingLightCalibrationCatalogEntry(key) {
  for (const list of Object.values(buildingLightCalibrationCatalog || {})) {
    const hit = list.find((m) => m.key === key);
    if (hit) return hit;
  }
  return null;
}

function buildingLightCalibrationClassFor(entry, category) {
  if (category === 'residential') return 'res';
  if (category === 'industrial') return 'ind';
  if (category === 'government' || /hospital|clinic|fire|police|ambulance/i.test(entry?.key || '')) return 'svc';
  return 'off';
}
function buildingLightCalibrationFamilyFor(entry, category) {
  if (entry?.zone) {
    const kind = category === 'residential' ? 'residential' : category === 'commercial' ? 'commercial' : 'industrial';
    return `${kind}${Math.max(1, Math.min(5, entry.footprintCols || 2))}`;
  }
  return entry?.key || 'unknown';
}

// ---------------------------------------------------------------------------
// current model data
// ---------------------------------------------------------------------------

function buildingLightCalibrationDefaultPanels(cls) {
  const src = typeof defaultBuildingLightPanels === 'function'
    ? defaultBuildingLightPanels(cls)
    : [{ corners: [[0.15, 0.2], [0.5, 0.3], [0.5, 0.8], [0.15, 0.7]], rows: 8, cols: 5, on: true }];
  return src.map((p) => ({ c: p.corners.map((pt) => [pt[0], pt[1]]), rows: p.rows, cols: p.cols, on: p.on !== false }));
}

function buildingLightCalibrationBaseData(cls) {
  return {
    class: cls,
    panels: buildingLightCalibrationDefaultPanels(cls),
    lamps: [{ x: 0.5, y: 0.9, r: 0.1 }],
    beacons: [],
    service: cls === 'svc',
    hasSignage: false,
    hasFloodlight: false,
  };
}

function buildingLightCalibrationStoredFor(t) {
  if (!t) return null;
  return buildingLightCalibrationOverrides[t.key]
    || buildingLightCalibrationOverrides['@' + t.key]
    || (t.zone && t.family && buildingLightCalibrationOverrides[t.family])
    || null;
}

function buildingLightCalibrationCurrentData() {
  const t = buildingLightCalibrationTarget;
  if (!t) return null;
  const stored = buildingLightCalibrationStoredFor(t);
  return stored
    ? migrateBuildingLightCalibrationData(stored)
    : buildingLightCalibrationBaseData(t.cls);
}

function buildingLightCalibrationCommit(data) {
  const t = buildingLightCalibrationTarget;
  if (!t) return;
  const round = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
  const clean = {
    class: data.class,
    panels: data.panels.map((p) => ({
      c: p.c.map((pt) => [round(pt[0]), round(pt[1])]),
      rows: Math.max(1, Math.round(p.rows)),
      cols: Math.max(1, Math.round(p.cols)),
      on: p.on !== false,
    })),
    lamps: data.lamps.map((l) => ({ x: round(l.x), y: round(l.y), r: round(l.r) })),
    beacons: data.beacons.map((b) => ({
      x: round(b.x), y: round(b.y), color: b.color || 'red', period: Math.round(b.period || 1600),
    })),
    service: !!data.service, hasSignage: !!data.hasSignage, hasFloodlight: !!data.hasFloodlight,
  };
  saveBuildingLightCalibrationEntry(t.key, clean);
}

function buildingLightCalibrationDataToProfile(data) {
  if (typeof makeBuildingLightProfile !== 'function' || !data) return null;
  return makeBuildingLightProfile({
    class: data.class,
    panels: data.panels.map((p) => ({ corners: p.c, rows: p.rows, cols: p.cols, on: p.on !== false })),
    lamps: data.lamps,
    beacons: data.beacons,
    service: data.service, hasSignage: data.hasSignage, hasFloodlight: data.hasFloodlight,
  });
}

// ---------------------------------------------------------------------------
// model selection
// ---------------------------------------------------------------------------

function selectBuildingLightCalibrationModel(key) {
  const entry = buildingLightCalibrationCatalogEntry(key);
  if (!entry) return;
  const cls = buildingLightCalibrationClassFor(entry, buildingLightCalibrationCategory);
  const target = {
    key: entry.key, cls, zone: entry.zone,
    family: buildingLightCalibrationFamilyFor(entry, buildingLightCalibrationCategory),
    img: null, imgW: 128, imgH: 128,
  };
  buildingLightCalibrationTarget = target;
  buildingLightCalibrationPanelIndex = 0;
  const img = new Image();
  img.onload = () => {
    if (buildingLightCalibrationTarget !== target) return;
    target.img = img;
    target.imgW = img.naturalWidth || 128;
    target.imgH = img.naturalHeight || 128;
    fitBuildingLightCalibrationView();
    renderBuildingLightCalibration();
  };
  img.onerror = () => setBuildingLightCalibrationMessage('圖載入失敗: ' + entry.path, 'error');
  img.src = entry.path;
  renderBuildingLightCalibration();
}

function fitBuildingLightCalibrationView() {
  const dom = buildingLightCalibrationDom;
  const t = buildingLightCalibrationTarget;
  if (!dom || !t) return;
  const cw = dom.work.width;
  const ch = dom.work.height;
  const fit = Math.min(cw * 0.8 / Math.max(1, t.imgW), ch * 0.8 / Math.max(1, t.imgH));
  buildingLightCalibrationView = {
    zoom: Math.max(BUILDING_LIGHT_CALIBRATION_MIN_ZOOM, Math.min(BUILDING_LIGHT_CALIBRATION_MAX_ZOOM, fit || 1)),
    panX: 0, panY: 0,
  };
}

// ---------------------------------------------------------------------------
// canvas geometry
// ---------------------------------------------------------------------------

function buildingLightCalibrationModelRect(canvas) {
  const t = buildingLightCalibrationTarget;
  const v = buildingLightCalibrationView;
  const cx = canvas.width / 2 + v.panX;
  const cy = canvas.height / 2 + v.panY;
  const dw = t.imgW * v.zoom;
  const dh = t.imgH * v.zoom;
  return { cx, cy, dw, dh };
}
function buildingLightCalibrationNormToCanvas(canvas, nx, ny) {
  const r = buildingLightCalibrationModelRect(canvas);
  return { x: r.cx + (nx - 0.5) * r.dw, y: r.cy + (ny - 0.5) * r.dh };
}
function buildingLightCalibrationCanvasToNorm(canvas, x, y) {
  const r = buildingLightCalibrationModelRect(canvas);
  return { nx: (x - r.cx) / r.dw + 0.5, ny: (y - r.cy) / r.dh + 0.5 };
}
function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

function buildingLightCalibrationHandles(data) {
  const list = [];
  const sp = data.panels[buildingLightCalibrationPanelIndex];
  if (sp) sp.c.forEach((pt, i) => list.push({ id: 'p' + i, nx: pt[0], ny: pt[1], color: '#8fd6ff', r: 6 }));
  data.lamps.forEach((l, i) => list.push({ id: 'l' + i, nx: l.x, ny: l.y, color: '#ffce93', r: 7 }));
  data.beacons.forEach((b, i) => list.push({
    id: 'b' + i, nx: b.x, ny: b.y, color: BUILDING_LIGHT_CALIBRATION_BEACON_CSS[b.color] || '#ff3b30', r: 7,
  }));
  return list;
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function buildingLightCalibrationDrawGlow(ctx, canvas, data, bucket, opts) {
  const profile = buildingLightCalibrationDataToProfile(data);
  const cells = typeof computeLitBuildingWindows === 'function'
    ? computeLitBuildingWindows(profile, 1337, bucket, 3) : [];
  const warm = data.class === 'res' || data.class === 'ind';
  const winCol = warm ? '255,207,135' : '223,232,255';
  const toXY = (n) => buildingLightCalibrationNormToCanvas(canvas, n[0], n[1]);

  ctx.save();
  if (opts.additive) ctx.globalCompositeOperation = 'lighter';
  cells.forEach((cell) => {
    if (!cell.on && !opts.showGrid) return;
    const q = cell.quad.map(toXY);
    ctx.beginPath();
    ctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
    ctx.closePath();
    ctx.fillStyle = cell.on ? `rgba(${winCol},${Math.min(0.95, cell.alpha)})` : 'rgba(255,255,255,0.05)';
    ctx.fill();
  });
  (data.lamps || []).forEach((l) => {
    const p = buildingLightCalibrationNormToCanvas(canvas, l.x, l.y);
    const rad = l.r * (buildingLightCalibrationModelRect(canvas).dw);
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(2, rad));
    grad.addColorStop(0, 'rgba(255,224,180,0.6)');
    grad.addColorStop(1, 'rgba(255,224,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, rad), 0, Math.PI * 2);
    ctx.fill();
  });
  (data.beacons || []).forEach((b) => {
    const p = buildingLightCalibrationNormToCanvas(canvas, b.x, b.y);
    ctx.fillStyle = BUILDING_LIGHT_CALIBRATION_BEACON_CSS[b.color] || '#ff3b30';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function renderBuildingLightCalibrationWork() {
  const dom = buildingLightCalibrationDom;
  if (!dom) return;
  const canvas = dom.work;
  const ctx = dom.workCtx;
  const t = buildingLightCalibrationTarget;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = BUILDING_LIGHT_CALIBRATION_BUCKET_BG[buildingLightCalibrationWorkBucket] || '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!t) {
    ctx.fillStyle = '#5c7691';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText('右上角揀大類 → 揀模型', 20, 30);
    return;
  }
  const r = buildingLightCalibrationModelRect(canvas);
  if (t.img) ctx.drawImage(t.img, r.cx - r.dw / 2, r.cy - r.dh / 2, r.dw, r.dh);

  const data = buildingLightCalibrationCurrentData();

  // ground guide
  const gy = buildingLightCalibrationNormToCanvas(canvas, 0, 1).y;
  ctx.strokeStyle = 'rgba(90,127,160,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(canvas.width, gy);
  ctx.stroke();

  // panels
  data.panels.forEach((panel, pi) => {
    const sel = pi === buildingLightCalibrationPanelIndex;
    const pts = panel.c.map((c) => buildingLightCalibrationNormToCanvas(canvas, c[0], c[1]));
    ctx.strokeStyle = sel ? 'rgba(143,214,255,0.8)' : 'rgba(74,127,156,0.4)';
    if (panel.on === false) ctx.strokeStyle = 'rgba(120,140,160,0.2)';
    ctx.lineWidth = sel ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
  });

  buildingLightCalibrationDrawGlow(ctx, canvas, data, buildingLightCalibrationWorkBucket, { showGrid: true, additive: false });

  // handles
  buildingLightCalibrationHandles(data).forEach((h) => {
    const p = buildingLightCalibrationNormToCanvas(canvas, h.nx, h.ny);
    ctx.beginPath();
    ctx.arc(p.x, p.y, h.r, 0, Math.PI * 2);
    ctx.fillStyle = h.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(10,15,24,0.9)';
    ctx.stroke();
  });
}

function renderBuildingLightCalibrationEffect() {
  const dom = buildingLightCalibrationDom;
  if (!dom) return;
  const canvas = dom.effect;
  const ctx = dom.effectCtx;
  const t = buildingLightCalibrationTarget;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = BUILDING_LIGHT_CALIBRATION_BUCKET_BG[buildingLightCalibrationEffectBucket] || '#0b0f18';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!t || !t.img) return;
  const data = buildingLightCalibrationCurrentData();

  // model scaled to fit the mini canvas, drawn dark (night tint)
  const fit = Math.min(canvas.width * 0.86 / t.imgW, canvas.height * 0.86 / t.imgH);
  const dw = t.imgW * fit;
  const dh = t.imgH * fit;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(t.img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(6,10,22,0.5)';
  ctx.fillRect(cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.restore();

  // glow, in this mini space
  const toXY = (n) => ({ x: cx + (n[0] - 0.5) * dw, y: cy + (n[1] - 0.5) * dh });
  const profile = buildingLightCalibrationDataToProfile(data);
  const cells = typeof computeLitBuildingWindows === 'function'
    ? computeLitBuildingWindows(profile, 1337, buildingLightCalibrationEffectBucket, 3) : [];
  const warm = data.class === 'res' || data.class === 'ind';
  const winCol = warm ? '255,207,135' : '223,232,255';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  cells.forEach((cell) => {
    if (!cell.on) return;
    const q = cell.quad.map(toXY);
    ctx.beginPath();
    ctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
    ctx.closePath();
    ctx.fillStyle = `rgba(${winCol},${Math.min(0.95, cell.alpha)})`;
    ctx.fill();
  });
  (data.lamps || []).forEach((l) => {
    const p = toXY([l.x, l.y]);
    const rad = Math.max(2, l.r * dw);
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
    grad.addColorStop(0, 'rgba(255,224,180,0.75)');
    grad.addColorStop(1, 'rgba(255,224,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
  });
  (data.beacons || []).forEach((b) => {
    const p = toXY([b.x, b.y]);
    ctx.fillStyle = BUILDING_LIGHT_CALIBRATION_BEACON_CSS[b.color] || '#ff3b30';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function renderBuildingLightCalibration() {
  renderBuildingLightCalibrationWork();
  renderBuildingLightCalibrationEffect();
  renderBuildingLightCalibrationPanel();
}

// ---------------------------------------------------------------------------
// interaction
// ---------------------------------------------------------------------------

function onBuildingLightCalibrationWorkDown(ev) {
  const dom = buildingLightCalibrationDom;
  const t = buildingLightCalibrationTarget;
  if (!dom || !t) return;
  const rect = dom.work.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (dom.work.width / rect.width);
  const y = (ev.clientY - rect.top) * (dom.work.height / rect.height);
  const data = buildingLightCalibrationCurrentData();
  let hit = null;
  buildingLightCalibrationHandles(data).forEach((h) => {
    const p = buildingLightCalibrationNormToCanvas(dom.work, h.nx, h.ny);
    if (Math.hypot(p.x - x, p.y - y) <= h.r + 6) hit = h.id;
  });
  if (hit) {
    buildingLightCalibrationDrag = { id: hit };
    if (hit[0] === 'l' || hit[0] === 'b') {
      // selecting a lamp/beacon also focuses its panel row
    }
  } else {
    buildingLightCalibrationDrag = { pan: true, sx: x, sy: y, px: buildingLightCalibrationView.panX, py: buildingLightCalibrationView.panY };
  }
  ev.preventDefault();
}

function onBuildingLightCalibrationWorkMove(ev) {
  const drag = buildingLightCalibrationDrag;
  const dom = buildingLightCalibrationDom;
  if (!drag || !dom) return;
  const rect = dom.work.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (dom.work.width / rect.width);
  const y = (ev.clientY - rect.top) * (dom.work.height / rect.height);
  if (drag.pan) {
    buildingLightCalibrationView.panX = drag.px + (x - drag.sx);
    buildingLightCalibrationView.panY = drag.py + (y - drag.sy);
    renderBuildingLightCalibrationWork();
    return;
  }
  const data = buildingLightCalibrationCurrentData();
  const n = buildingLightCalibrationCanvasToNorm(dom.work, x, y);
  const nx = clamp01(n.nx);
  const ny = clamp01(n.ny);
  const idx = Number(drag.id.slice(1));
  if (drag.id[0] === 'p') {
    const panel = data.panels[buildingLightCalibrationPanelIndex];
    if (panel) panel.c[idx] = [nx, ny];
  } else if (drag.id[0] === 'l') {
    if (data.lamps[idx]) { data.lamps[idx].x = nx; data.lamps[idx].y = ny; }
  } else if (drag.id[0] === 'b') {
    if (data.beacons[idx]) { data.beacons[idx].x = nx; data.beacons[idx].y = ny; }
  }
  buildingLightCalibrationCommit(data);
  renderBuildingLightCalibration();
}

function onBuildingLightCalibrationWorkUp() {
  buildingLightCalibrationDrag = null;
}

function onBuildingLightCalibrationWheel(ev) {
  ev.preventDefault();
  const f = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  buildingLightCalibrationView.zoom = Math.max(BUILDING_LIGHT_CALIBRATION_MIN_ZOOM,
    Math.min(BUILDING_LIGHT_CALIBRATION_MAX_ZOOM, buildingLightCalibrationView.zoom * f));
  renderBuildingLightCalibrationWork();
}

// ---------------------------------------------------------------------------
// mutations
// ---------------------------------------------------------------------------

function mutateBuildingLightCalibration(fn) {
  const data = buildingLightCalibrationCurrentData();
  if (!data) return;
  fn(data);
  buildingLightCalibrationCommit(data);
  renderBuildingLightCalibration();
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

function createBuildingLightCalibrationDom() {
  if (buildingLightCalibrationDom) return buildingLightCalibrationDom;
  if (typeof document === 'undefined' || !document.body) return null;
  if (!document.getElementById('blcal-style')) {
    const style = document.createElement('style');
    style.id = 'blcal-style';
    style.textContent = `
      #blcal-modal{position:fixed;inset:0;z-index:200000;background:rgba(4,8,14,.82);
        display:flex;align-items:center;justify-content:center;
        font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#eaf6ff}
      #blcal-modal[hidden]{display:none!important}
      #blcal-win{width:min(1200px,96vw);height:min(820px,94vh);display:flex;gap:0;
        border:1px solid #33475f;border-radius:14px;overflow:hidden;background:#0b111b;
        box-shadow:0 30px 90px rgba(0,0,0,.6)}
      #blcal-left{flex:1;position:relative;background:#070c15;display:flex;flex-direction:column}
      #blcal-work{flex:1;width:100%;display:block;background:#0b1322;cursor:grab}
      #blcal-work:active{cursor:grabbing}
      #blcal-worktools{position:absolute;top:10px;left:10px;display:flex;gap:5px;align-items:center;
        background:rgba(9,17,28,.85);border:1px solid #2a3a52;border-radius:8px;padding:5px 7px}
      #blcal-worktools .bl-buckets{display:flex;gap:3px}
      #blcal-effect-wrap{position:absolute;left:10px;bottom:10px;background:rgba(9,17,28,.9);
        border:1px solid #2a3a52;border-radius:8px;padding:6px}
      #blcal-effect{display:block;border-radius:4px;background:#0b0f18}
      #blcal-effect-wrap .bl-buckets{display:flex;gap:3px;margin-top:5px}
      #blcal-right{width:340px;flex:0 0 340px;background:rgba(9,17,28,.98);border-left:1px solid #33475f;
        overflow-y:auto;padding:12px}
      #blcal-right h4{font-weight:800;color:#8fd6ff;letter-spacing:.04em;margin:12px 0 6px}
      #blcal-right h4:first-child{margin-top:0}
      #blcal-right .bl-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0}
      #blcal-right select{width:100%;background:#123243;color:#eaf6ff;border:1px solid #3f7f9c;border-radius:6px;padding:5px;font:inherit}
      #blcal-modal button{border:1px solid #3f7f9c;border-radius:7px;padding:5px 8px;color:#eaf6ff;background:#123243;font:inherit;cursor:pointer}
      #blcal-modal button:hover{background:#1a4a62}
      #blcal-modal button[data-active="true"]{background:#1f9d5c;border-color:#7ce8a8;color:#06210f}
      #blcal-modal button[data-off="true"]{opacity:.5;text-decoration:line-through}
      #blcal-right .bl-faces{display:flex;gap:4px;flex-wrap:wrap;margin:5px 0}
      #blcal-right .bl-2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:5px 0}
      #blcal-right .bl-step{display:flex;gap:4px;align-items:center}
      #blcal-right .bl-step b{min-width:2ch;text-align:center;color:#fff}
      #blcal-right .bl-list{display:grid;gap:4px;margin:5px 0}
      #blcal-right .bl-list .bl-item{display:flex;align-items:center;gap:6px}
      #blcal-right .bl-list .bl-item span{flex:1;color:#a9c6da}
      #blcal-right .bl-flags label{display:flex;gap:5px;align-items:center;color:#a9c6da}
      #blcal-right .bl-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
      #blcal-right .bl-apply{background:#1f9d5c;border-color:#7ce8a8;color:#06210f;font-weight:700;width:100%;margin-top:10px}
      #blcal-right .bl-msg{min-height:15px;margin-top:7px;color:#a9c6da}
      #blcal-right .bl-msg[data-tone="success"]{color:#9be89b}
      #blcal-right .bl-msg[data-tone="error"]{color:#ff9a9a}
      #blcal-modal .bl-mini{padding:4px 6px;font-size:11px}
    `;
    document.head.appendChild(style);
  }

  const bucketBtns = (cls) => BUILDING_LIGHT_CALIBRATION_BUCKETS
    .map(([id, label]) => `<button type="button" class="bl-mini" data-${cls}="${id}">${label}</button>`).join('');

  const modal = document.createElement('div');
  modal.id = 'blcal-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div id="blcal-win">
      <div id="blcal-left">
        <canvas id="blcal-work"></canvas>
        <div id="blcal-worktools">
          <button type="button" class="bl-mini" data-zoom="-1">−</button>
          <b class="bl-zoom" style="min-width:3.5ch;text-align:center">100%</b>
          <button type="button" class="bl-mini" data-zoom="1">＋</button>
          <button type="button" class="bl-mini bl-fit">置中</button>
          <span style="width:1px;height:16px;background:#2a3a52;margin:0 3px"></span>
          <span style="color:#8fb3c8">舞台</span>
          <div class="bl-buckets" data-group="work">${bucketBtns('work')}</div>
        </div>
        <div id="blcal-effect-wrap">
          <div style="color:#8fb3c8;margin-bottom:4px">實際燈光效果</div>
          <canvas id="blcal-effect" width="240" height="184"></canvas>
          <div class="bl-buckets" data-group="effect">${bucketBtns('effect')}</div>
        </div>
      </div>
      <div id="blcal-right">
        <h4>夜間建築燈光校正 <button type="button" class="bl-close bl-mini" style="float:right">✕ 收起</button></h4>
        <select class="bl-cat"></select>
        <select class="bl-model" style="margin-top:5px"></select>
        <div class="bl-row"><span class="bl-key" style="color:#a9c6da">(未揀模型)</span></div>
        <div class="bl-row"><span>類別</span>
          <select class="bl-class" style="width:auto">
            <option value="res">住宅 (暖)</option><option value="off">辦公 (冷白)</option>
            <option value="ind">工業 (暗黃)</option><option value="svc">服務 (通宵)</option>
          </select></div>

        <h4>窗面 (A–D)</h4>
        <div class="bl-faces"></div>
        <div class="bl-2"><button type="button" class="bl-face-add">＋面</button><button type="button" class="bl-face-del">－面</button></div>
        <div class="bl-row"><button type="button" class="bl-face-on" style="flex:1">呢個面:開</button></div>
        <div class="bl-row"><span>窗格</span><span class="bl-step">
          <button data-grid="rows-">−</button><b class="bl-rows">8</b><button data-grid="rows+">+</button> 行
          <button data-grid="cols-">−</button><b class="bl-cols">5</b><button data-grid="cols+">+</button> 列</span></div>

        <h4>路燈 <button type="button" class="bl-lamp-add" style="float:right">＋路燈</button></h4>
        <div class="bl-list bl-lamps"></div>
        <h4>指示燈 <button type="button" class="bl-beacon-add" style="float:right">＋指示燈</button></h4>
        <div class="bl-list bl-beacons"></div>

        <div class="bl-flags" style="margin-top:8px">
          <label><input type="checkbox" class="bl-svc"> 通宵服務 floor</label>
          <label><input type="checkbox" class="bl-sig"> 招牌 (v1.1)</label>
          <label><input type="checkbox" class="bl-flood"> 地面投光 (v1.1)</label>
        </div>

        <button type="button" class="bl-apply">套用到城市</button>
        <div class="bl-actions">
          <button type="button" class="bl-reset">還原呢個</button>
          <button type="button" class="bl-copy">複製 JS</button>
          <button type="button" class="bl-export">匯出全部 JSON</button>
          <button type="button" class="bl-import">匯入 JSON</button>
        </div>
        <div class="bl-msg"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const work = modal.querySelector('#blcal-work');
  const effect = modal.querySelector('#blcal-effect');
  const catSel = modal.querySelector('.bl-cat');
  BUILDING_LIGHT_CALIBRATION_CATEGORIES.forEach(([id, label]) => {
    const o = document.createElement('option'); o.value = id; o.textContent = label; catSel.appendChild(o);
  });

  buildingLightCalibrationDom = {
    modal, work, workCtx: work.getContext('2d'),
    effect, effectCtx: effect.getContext('2d'),
    right: modal.querySelector('#blcal-right'),
    cat: catSel,
    model: modal.querySelector('.bl-model'),
    key: modal.querySelector('.bl-key'),
    faces: modal.querySelector('.bl-faces'),
    lamps: modal.querySelector('.bl-lamps'),
    beacons: modal.querySelector('.bl-beacons'),
    zoom: modal.querySelector('.bl-zoom'),
    msg: modal.querySelector('.bl-msg'),
  };

  // wiring
  catSel.addEventListener('change', () => {
    buildingLightCalibrationCategory = catSel.value;
    populateBuildingLightCalibrationModels();
  });
  buildingLightCalibrationDom.model.addEventListener('change', (e) => {
    if (e.target.value) selectBuildingLightCalibrationModel(e.target.value);
  });
  buildingLightCalibrationDom.right.querySelector('.bl-class').addEventListener('change', (e) => {
    mutateBuildingLightCalibration((d) => { d.class = e.target.value; });
  });
  modal.querySelectorAll('[data-work]').forEach((b) => b.addEventListener('click', () => {
    buildingLightCalibrationWorkBucket = b.dataset.work;
    renderBuildingLightCalibration();
  }));
  modal.querySelectorAll('[data-effect]').forEach((b) => b.addEventListener('click', () => {
    buildingLightCalibrationEffectBucket = b.dataset.effect;
    renderBuildingLightCalibration();
  }));
  modal.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    const f = Number(b.dataset.zoom) > 0 ? 1.2 : 1 / 1.2;
    buildingLightCalibrationView.zoom = Math.max(BUILDING_LIGHT_CALIBRATION_MIN_ZOOM,
      Math.min(BUILDING_LIGHT_CALIBRATION_MAX_ZOOM, buildingLightCalibrationView.zoom * f));
    renderBuildingLightCalibration();
  }));
  modal.querySelector('.bl-fit').addEventListener('click', () => { fitBuildingLightCalibrationView(); renderBuildingLightCalibration(); });
  modal.querySelector('.bl-face-add').addEventListener('click', () => mutateBuildingLightCalibration((d) => {
    if (d.panels.length >= 4) return;
    d.panels.push({ c: [[0.35, 0.3], [0.65, 0.4], [0.65, 0.7], [0.35, 0.6]], rows: 8, cols: 4, on: true });
    buildingLightCalibrationPanelIndex = d.panels.length - 1;
  }));
  modal.querySelector('.bl-face-del').addEventListener('click', () => mutateBuildingLightCalibration((d) => {
    if (d.panels.length <= 1) return;
    d.panels.splice(buildingLightCalibrationPanelIndex, 1);
    buildingLightCalibrationPanelIndex = Math.max(0, buildingLightCalibrationPanelIndex - 1);
  }));
  modal.querySelector('.bl-face-on').addEventListener('click', () => mutateBuildingLightCalibration((d) => {
    const p = d.panels[buildingLightCalibrationPanelIndex];
    if (p) p.on = p.on === false;
  }));
  modal.querySelectorAll('[data-grid]').forEach((b) => b.addEventListener('click', () => mutateBuildingLightCalibration((d) => {
    const p = d.panels[buildingLightCalibrationPanelIndex];
    if (!p) return;
    const op = b.dataset.grid;
    if (op === 'rows+') p.rows++; else if (op === 'rows-') p.rows = Math.max(1, p.rows - 1);
    else if (op === 'cols+') p.cols++; else if (op === 'cols-') p.cols = Math.max(1, p.cols - 1);
  })));
  modal.querySelector('.bl-lamp-add').addEventListener('click', () => mutateBuildingLightCalibration((d) => d.lamps.push({ x: 0.5, y: 0.85, r: 0.09 })));
  modal.querySelector('.bl-beacon-add').addEventListener('click', () => mutateBuildingLightCalibration((d) => d.beacons.push({ x: 0.5, y: 0.08, color: 'red', period: 1600 })));
  modal.querySelector('.bl-svc').addEventListener('change', (e) => mutateBuildingLightCalibration((d) => { d.service = e.target.checked; }));
  modal.querySelector('.bl-sig').addEventListener('change', (e) => mutateBuildingLightCalibration((d) => { d.hasSignage = e.target.checked; }));
  modal.querySelector('.bl-flood').addEventListener('change', (e) => mutateBuildingLightCalibration((d) => { d.hasFloodlight = e.target.checked; }));
  modal.querySelector('.bl-apply').addEventListener('click', () => {
    const t = buildingLightCalibrationTarget;
    if (t) {
      buildingLightCalibrationCommit(buildingLightCalibrationCurrentData());
      if (typeof fetch === 'function') {
        fetch(`${BUILDING_LIGHT_CALIBRATION_API}/${encodeURIComponent(t.key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: buildingLightCalibrationOverrides[t.key] }),
        }).catch(() => {});
      }
    }
    if (typeof refreshAllBuildingLightGlows === 'function' && buildingLightCalibrationScene) {
      refreshAllBuildingLightGlows(buildingLightCalibrationScene, true);
    }
    setBuildingLightCalibrationMessage(`${t ? t.key : ''} 已套用並儲存`, 'success');
  });
  modal.querySelector('.bl-reset').addEventListener('click', () => {
    const t = buildingLightCalibrationTarget;
    if (!t) return;
    deleteBuildingLightCalibrationEntry(t.key);
    deleteBuildingLightCalibrationEntry('@' + t.key);
    if (t.zone && t.family) deleteBuildingLightCalibrationEntry(t.family);
    renderBuildingLightCalibration();
    setBuildingLightCalibrationMessage('已還原預設', 'info');
  });
  modal.querySelector('.bl-copy').addEventListener('click', () => {
    const text = buildBuildingLightCalibrationRecord();
    copyBuildingLightCalibrationText(text, '已複製 JS');
  });
  modal.querySelector('.bl-export').addEventListener('click', () => {
    copyBuildingLightCalibrationText(buildBuildingLightCalibrationJSON(), '已複製全部 JSON');
  });
  modal.querySelector('.bl-import').addEventListener('click', async () => {
    const text = globalThis.prompt?.('貼上 building-light JSON');
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      const entries = parsed && parsed.entries ? parsed.entries : parsed;
      await replaceBuildingLightCalibrationEntries(entries);
      renderBuildingLightCalibration();
      setBuildingLightCalibrationMessage(`已匯入 ${Object.keys(entries || {}).length} 個`, 'success');
    } catch { setBuildingLightCalibrationMessage('JSON 解析失敗', 'error'); }
  });
  modal.querySelector('.bl-close').addEventListener('click', teardownBuildingLightCalibrator);

  work.addEventListener('pointerdown', onBuildingLightCalibrationWorkDown);
  window.addEventListener('pointermove', onBuildingLightCalibrationWorkMove);
  window.addEventListener('pointerup', onBuildingLightCalibrationWorkUp);
  work.addEventListener('wheel', onBuildingLightCalibrationWheel, { passive: false });

  return buildingLightCalibrationDom;
}

function resizeBuildingLightCalibrationCanvas() {
  const dom = buildingLightCalibrationDom;
  if (!dom) return;
  const rect = dom.work.getBoundingClientRect();
  dom.work.width = Math.max(320, Math.round(rect.width));
  dom.work.height = Math.max(240, Math.round(rect.height));
}

function populateBuildingLightCalibrationModels() {
  const dom = buildingLightCalibrationDom;
  if (!dom) return;
  const list = (buildingLightCalibrationCatalog || {})[buildingLightCalibrationCategory] || [];
  dom.model.replaceChildren();
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = list.length ? `— 揀模型 (${list.length}) —` : '(未載入)';
  dom.model.appendChild(ph);
  list.forEach((m) => {
    const o = document.createElement('option');
    o.value = m.key;
    o.textContent = (buildingLightCalibrationOverrides[m.key] || buildingLightCalibrationOverrides['@' + m.key]) ? '✓ ' + m.key : m.key;
    dom.model.appendChild(o);
  });
}

function setBuildingLightCalibrationMessage(text, tone = 'info') {
  if (!buildingLightCalibrationDom) return;
  buildingLightCalibrationDom.msg.textContent = String(text || '');
  buildingLightCalibrationDom.msg.dataset.tone = tone;
}

function renderBuildingLightCalibrationPanel() {
  const dom = buildingLightCalibrationDom;
  if (!dom) return;
  const t = buildingLightCalibrationTarget;
  const data = buildingLightCalibrationCurrentData();
  dom.cat.value = buildingLightCalibrationCategory;
  const custom = t && (buildingLightCalibrationOverrides['@' + t.key] || buildingLightCalibrationOverrides[t.key]
    || (t.zone && buildingLightCalibrationOverrides[t.family]));
  dom.key.textContent = t ? `${t.key} · ${t.zone ? t.family : 'model'} · ${custom ? '已校正' : '預設'}` : '(未揀模型)';
  dom.zoom.textContent = `${Math.round(buildingLightCalibrationView.zoom * 100)}%`;
  dom.modal.querySelectorAll('[data-work]').forEach((b) => { b.dataset.active = String(b.dataset.work === buildingLightCalibrationWorkBucket); });
  dom.modal.querySelectorAll('[data-effect]').forEach((b) => { b.dataset.active = String(b.dataset.effect === buildingLightCalibrationEffectBucket); });
  if (!data) return;

  dom.right.querySelector('.bl-class').value = data.class;
  dom.right.querySelector('.bl-svc').checked = !!data.service;
  dom.right.querySelector('.bl-sig').checked = !!data.hasSignage;
  dom.right.querySelector('.bl-flood').checked = !!data.hasFloodlight;

  dom.faces.replaceChildren(...data.panels.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'ABCD'[i] + '面';
    b.dataset.active = String(i === buildingLightCalibrationPanelIndex);
    b.dataset.off = String(p.on === false);
    b.addEventListener('click', () => { buildingLightCalibrationPanelIndex = i; renderBuildingLightCalibration(); });
    return b;
  }));
  const sp = data.panels[buildingLightCalibrationPanelIndex] || data.panels[0];
  dom.right.querySelector('.bl-face-on').textContent = `呢個面:${sp && sp.on === false ? '關' : '開'}`;
  dom.right.querySelector('.bl-rows').textContent = sp ? Math.round(sp.rows) : '-';
  dom.right.querySelector('.bl-cols').textContent = sp ? Math.round(sp.cols) : '-';

  dom.lamps.replaceChildren(...data.lamps.map((l, i) => {
    const row = document.createElement('div');
    row.className = 'bl-item';
    const s = document.createElement('span');
    s.textContent = `路燈 ${i + 1}  (${l.x.toFixed(2)}, ${l.y.toFixed(2)}) r${l.r.toFixed(2)}`;
    const minus = document.createElement('button'); minus.textContent = 'r−';
    minus.addEventListener('click', () => mutateBuildingLightCalibration((d) => { d.lamps[i].r = Math.max(0.02, d.lamps[i].r - 0.01); }));
    const plus = document.createElement('button'); plus.textContent = 'r+';
    plus.addEventListener('click', () => mutateBuildingLightCalibration((d) => { d.lamps[i].r += 0.01; }));
    const del = document.createElement('button'); del.textContent = '×';
    del.addEventListener('click', () => mutateBuildingLightCalibration((d) => d.lamps.splice(i, 1)));
    row.append(s, minus, plus, del);
    return row;
  }));

  dom.beacons.replaceChildren(...data.beacons.map((b, i) => {
    const row = document.createElement('div');
    row.className = 'bl-item';
    const s = document.createElement('span');
    s.textContent = `指示燈 ${i + 1}  (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`;
    const colBtn = document.createElement('button');
    colBtn.textContent = BUILDING_LIGHT_CALIBRATION_BEACON_LABEL[b.color] || b.color;
    colBtn.style.color = BUILDING_LIGHT_CALIBRATION_BEACON_CSS[b.color];
    colBtn.addEventListener('click', () => mutateBuildingLightCalibration((d) => {
      const bb = d.beacons[i];
      const order = BUILDING_LIGHT_CALIBRATION_BEACON_ORDER;
      bb.color = order[(order.indexOf(bb.color) + 1) % order.length];
    }));
    const del = document.createElement('button'); del.textContent = '×';
    del.addEventListener('click', () => mutateBuildingLightCalibration((d) => d.beacons.splice(i, 1)));
    row.append(s, colBtn, del);
    return row;
  }));

  populateBuildingLightCalibrationModels();
  dom.model.value = t ? t.key : '';
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

function buildingLightCalibrationProfileLiteral(data, indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const rnd = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
  const parts = [`class: '${data.class}'`];
  if (data.service) parts.push('service: true');
  if (data.hasSignage) parts.push('hasSignage: true');
  if (data.hasFloodlight) parts.push('hasFloodlight: true');
  const panelLines = (data.panels || []).map((p) => {
    const c = (p.c || p.corners).map((pt) => `[${rnd(pt[0])}, ${rnd(pt[1])}]`).join(', ');
    return `${inner}  { c: [${c}], rows: ${Math.round(p.rows)}, cols: ${Math.round(p.cols)}${p.on === false ? ', on: false' : ''} },`;
  });
  const lampLine = `${inner}lamps: [${(data.lamps || []).map((l) => `{ x: ${rnd(l.x)}, y: ${rnd(l.y)}, r: ${rnd(l.r)} }`).join(', ')}],`;
  const beaconLine = (data.beacons && data.beacons.length)
    ? `${inner}beacons: [${data.beacons.map((b) => `{ x: ${rnd(b.x)}, y: ${rnd(b.y)}, color: '${b.color}', period: ${Math.round(b.period)} }`).join(', ')}],`
    : null;
  const lines = ['makeBuildingLightProfile({', `${inner}${parts.join(', ')},`, `${inner}panels: [`, ...panelLines, `${inner}],`, lampLine];
  if (beaconLine) lines.push(beaconLine);
  lines.push(`${pad}})`);
  return lines.join('\n');
}

function buildBuildingLightCalibrationRecord() {
  const families = {};
  const heroes = {};
  const isFamilyKey = (k) => /^(residential|commercial|industrial)[1-5]$/.test(k.replace(/^@/, ''));
  Object.entries(buildingLightCalibrationOverrides).forEach(([key, d]) => {
    const bare = key.replace(/^@/, '');
    const literal = buildingLightCalibrationProfileLiteral(migrateBuildingLightCalibrationData(d), 2);
    if (isFamilyKey(bare)) families[bare] = literal;
    else heroes[bare] = literal;
  });
  const famBlock = Object.keys(families).length
    ? 'Object.assign(BUILDING_LIGHT_PROFILES, {\n' + Object.entries(families).map(([k, v]) => `  ${k}: ${v},`).join('\n') + '\n});'
    : '// no family calibrations';
  const heroBlock = Object.keys(heroes).length
    ? 'const BUILDING_LIGHT_HERO_PROFILES = {\n' + Object.entries(heroes).map(([k, v]) => `  ${k}: ${v},`).join('\n') + '\n};'
    : '// no hero overrides';
  return `// building-light-calibrator export · schema v${BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION}\n${famBlock}\n\n${heroBlock}`;
}

function buildBuildingLightCalibrationJSON() {
  return JSON.stringify({
    schemaVersion: BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION,
    kind: 'building-light-profiles',
    entries: buildingLightCalibrationOverrides,
    savedAt: new Date().toISOString(),
  }, null, 2);
}

function importBuildingLightCalibrationJSON(text) {
  try {
    const parsed = JSON.parse(text);
    const entries = parsed && parsed.entries ? parsed.entries : parsed;
    replaceBuildingLightCalibrationEntries(entries);
    return true;
  } catch { return false; }
}

function copyBuildingLightCalibrationText(text, ok) {
  const p = typeof copyVisualRouteCalibrationText === 'function'
    ? copyVisualRouteCalibrationText(text)
    : (navigator?.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject());
  p.then(() => setBuildingLightCalibrationMessage(ok, 'success'))
    .catch(() => setBuildingLightCalibrationMessage('複製失敗（睇 console）', 'error'));
  if (typeof console !== 'undefined') console.log(text);
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

function startBuildingLightCalibrator(scene) {
  buildingLightCalibrationActive = true;
  buildingLightCalibrationScene = scene;
  if (scene) scene.buildingLightCalibrationActive = true;

  buildingLightCalibrationWasPaused = typeof isSimPaused === 'function' ? isSimPaused()
    : (typeof simPaused !== 'undefined' ? simPaused : false);
  if (typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') {
    setGameSpeed(GAME_SPEEDS.PAUSED);
  }

  buildingLightCalibrationCatalog = buildBuildingLightCatalog();
  createBuildingLightCalibrationDom();
  buildingLightCalibrationDom.modal.hidden = false;
  resizeBuildingLightCalibrationCanvas();
  populateBuildingLightCalibrationModels();
  loadBuildingLightCalibrationStore().then(() => { populateBuildingLightCalibrationModels(); renderBuildingLightCalibration(); });
  renderBuildingLightCalibration();
  // Calibration coordinates are fractions of the model texture, and the source
  // PNG places the artwork differently from the packaged (trimmed + padded)
  // one the night bake reads - up to ~10% of the texture height apart. Work
  // done against the source art therefore bakes visibly shifted, so say so
  // rather than letting it be discovered later in the baked city.
  const packagedArt = typeof isPackagedModelArtActive === 'function'
    ? isPackagedModelArtActive()
    : true;
  setBuildingLightCalibrationMessage(
    packagedArt
      ? '揀大類 → 揀模型。拖藍角＝窗面，橙點＝路燈，彩點＝指示燈。'
      : '⚠ 而家用緊原始 PNG（未打包資產）。校正座標同 bake 出嚟嘅夜景會對唔上位，請用 npm run electron:perf 重開再校正。',
    packagedArt ? 'info' : 'error',
  );

  buildingLightCalibrationKeyHandler = (e) => {
    if (!buildingLightCalibrationActive) return;
    if (e.key === 'Escape') { teardownBuildingLightCalibrator(); return; }
    if (!buildingLightCalibrationTarget) return;
    const data = buildingLightCalibrationCurrentData();
    const panel = data?.panels?.[buildingLightCalibrationPanelIndex];
    if (!panel) return;
    const step = e.shiftKey ? 0.02 : 0.005;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;
    e.preventDefault();
    panel.c = panel.c.map((pt) => [clamp01(pt[0] + dx), clamp01(pt[1] + dy)]);
    buildingLightCalibrationCommit(data);
    renderBuildingLightCalibration();
  };
  window.addEventListener('keydown', buildingLightCalibrationKeyHandler);
  window.addEventListener('resize', buildingLightCalibrationResizeHandler);
}

function buildingLightCalibrationResizeHandler() {
  if (!buildingLightCalibrationActive) return;
  resizeBuildingLightCalibrationCanvas();
  renderBuildingLightCalibration();
}

function teardownBuildingLightCalibrator() {
  buildingLightCalibrationActive = false;
  buildingLightCalibrationDrag = null;
  if (buildingLightCalibrationDom) buildingLightCalibrationDom.modal.hidden = true;
  if (buildingLightCalibrationScene) buildingLightCalibrationScene.buildingLightCalibrationActive = false;
  if (!buildingLightCalibrationWasPaused && typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') {
    setGameSpeed(GAME_SPEEDS.NORMAL);
  }
  if (buildingLightCalibrationKeyHandler) {
    window.removeEventListener('keydown', buildingLightCalibrationKeyHandler);
    buildingLightCalibrationKeyHandler = null;
  }
  window.removeEventListener('resize', buildingLightCalibrationResizeHandler);
}

function toggleBuildingLightCalibrator(scene) {
  if (buildingLightCalibrationActive) { teardownBuildingLightCalibrator(); return false; }
  if (!scene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
    || !isVisualRouteCalibrationTestModeEnabled()) return false;
  startBuildingLightCalibrator(scene);
  return true;
}

// no-op kept so the main.js frame hook stays harmless
function syncBuildingLightCalibratorStage() {}
function handleBuildingLightCalibrationPick() { return false; }

// ---------------------------------------------------------------------------

const buildingLightCalibratorTestApi = {
  BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION,
  getBuildingLightCalibrationOverride,
  isBuildingLightCalibrationActive,
  isBuildingLightCalibrationInputActive,
  buildBuildingLightCalibrationRecord,
  buildBuildingLightCalibrationJSON,
  importBuildingLightCalibrationJSON,
  migrateBuildingLightCalibrationData,
  buildingLightCalibrationProfileLiteral,
  toggleBuildingLightCalibrator,
  _setEntryForTest(key, data) {
    const norm = String(key).replace(/^@/, '');
    buildingLightCalibrationOverrides[norm] = data;
    if (typeof setBuildingLightDbProfile === 'function') {
      setBuildingLightDbProfile(norm, migrateBuildingLightCalibrationData(data));
    }
  },
  _clearForTest() {
    Object.keys(buildingLightCalibrationOverrides).forEach((k) => delete buildingLightCalibrationOverrides[k]);
    if (typeof loadBuildingLightDbProfiles === 'function') loadBuildingLightDbProfiles({});
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = buildingLightCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleBuildingLightCalibrator,
    teardownBuildingLightCalibrator,
    getBuildingLightCalibrationOverride,
    isBuildingLightCalibrationActive,
    isBuildingLightCalibrationInputActive,
    handleBuildingLightCalibrationPick,
    syncBuildingLightCalibratorStage,
  });
}
