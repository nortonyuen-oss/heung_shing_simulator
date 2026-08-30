// Building night-lighting calibrator (test-branch-only dev tool).
//
// Fixed panel driven by a model catalog (category -> model), no longer a
// click-on-the-map picker (that stays as a fallback). A magnified, centred copy
// of the chosen model is the workbench:
//   - up to 4 window PANELS (A/B/C/D), each a parallelogram dragged by its four
//     corners so the grid follows the 1:2 iso slope;
//   - any number of street/public LAMPS (soft warm pools);
//   - any number of blinking BEACONS (airport nav / rooftop warning), each a
//     colour from red / blue / white / yellow / green.
// [套用] pushes the edit onto the live city; every edit is persisted to
// localStorage so it survives a restart. [匯出全部 JSON] / [匯入 JSON] move the
// whole calibration set in and out for baking into building-lighting.js.

const BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION = 3;
const BUILDING_LIGHT_CALIBRATION_STORAGE_KEY = 'buildingLightCalibration.v3';
const BUILDING_LIGHT_CALIBRATION_LEGACY_KEYS = ['buildingLightCalibration.v2'];
const BUILDING_LIGHT_CALIBRATION_BUCKETS = Object.freeze([
  ['duskRamp', '黃昏'], ['eveningPeak', '晚高峰'], ['lateEvening', '晚間'],
  ['deepNight', '深夜'], ['dawnFade', '天光'],
]);
const BUILDING_LIGHT_CALIBRATION_CLASS_LABEL = Object.freeze({
  res: '住宅 (暖)', off: '辦公 (冷白)', ind: '工業 (暗黃)', svc: '服務 (通宵)',
});
const BUILDING_LIGHT_CALIBRATION_CATEGORIES = Object.freeze([
  ['residential', '住宅'], ['commercial', '商業'], ['industrial', '工業'],
  ['government', '政府'], ['special', '地標'], ['power', '能源'], ['transport', '交通'],
]);
const BUILDING_LIGHT_CALIBRATION_BEACON_ORDER = Object.freeze(['red', 'blue', 'white', 'yellow', 'green']);
const BUILDING_LIGHT_CALIBRATION_BEACON_LABEL = Object.freeze({
  red: '紅', blue: '藍', white: '白', yellow: '黃', green: '綠',
});
const BUILDING_LIGHT_CALIBRATION_MIN_ZOOM = 1.5;
const BUILDING_LIGHT_CALIBRATION_MAX_ZOOM = 8;

// { [family]: data, ['@'+spriteKey]: data }
// data = { class, panels:[{c,rows,cols,on}], lamps:[{x,y,r}],
//          beacons:[{x,y,color,period}], service, hasSignage, hasFloodlight }
const buildingLightCalibrationOverrides = loadBuildingLightCalibrationOverrides();

let buildingLightCalibrationActive = false;
let buildingLightCalibrationScene = null;
let buildingLightCalibrationPanel = null;
let buildingLightCalibrationCatalog = null;
let buildingLightCalibrationCategory = 'residential';
let buildingLightCalibrationZoom = 3;
let buildingLightCalibrationBucket = 'eveningPeak';
let buildingLightCalibrationPanelIndex = 0;
let buildingLightCalibrationTarget = null;   // { key, path, texW, texH, zone, family, foot, cls }
let buildingLightCalibrationPreview = null;  // { body, gfx, handles:{}, worldX, worldY }
let buildingLightCalibrationKeyHandler = null;
let buildingLightCalibrationMapPick = false;

// ---------------------------------------------------------------------------

function loadBuildingLightCalibrationOverrides() {
  const read = (key) => {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : null;
    } catch { return null; }
  };
  // Merge every store, oldest first, so a v2 entry is never lost just because a
  // v3 store already exists. Current (v3) wins per key; the merged set is
  // re-persisted under v3 so this only has to happen once.
  const merged = {};
  BUILDING_LIGHT_CALIBRATION_LEGACY_KEYS.forEach((legacy) => {
    const old = read(legacy);
    if (old) Object.entries(old).forEach(([k, d]) => { merged[k] = migrateBuildingLightCalibrationData(d); });
  });
  const current = read(BUILDING_LIGHT_CALIBRATION_STORAGE_KEY);
  if (current) Object.entries(current).forEach(([k, d]) => { merged[k] = migrateBuildingLightCalibrationData(d); });
  return merged;
}

function migrateBuildingLightCalibrationData(d) {
  const data = { ...d };
  if (!Array.isArray(data.lamps)) {
    data.lamps = data.entrance
      ? [{ x: data.ex ?? 0.5, y: data.ey ?? 0.9, r: data.er ?? 0.1 }]
      : [];
  }
  if (!Array.isArray(data.beacons)) data.beacons = [];
  delete data.entrance;
  delete data.ex;
  delete data.ey;
  delete data.er;
  data.panels = (Array.isArray(data.panels) ? data.panels : []).map((p) => ({
    c: p.c || p.corners, rows: p.rows, cols: p.cols, on: p.on !== false,
  }));
  return data;
}

function persistBuildingLightCalibrationOverrides() {
  try {
    globalThis.localStorage?.setItem(BUILDING_LIGHT_CALIBRATION_STORAGE_KEY, JSON.stringify({
      schemaVersion: BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION,
      entries: buildingLightCalibrationOverrides,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* session only */ }
}

function buildingLightCalibrationRound(v) {
  return typeof visualRouteCalibrationRound === 'function'
    ? visualRouteCalibrationRound(v, 3)
    : Math.round((Number(v) || 0) * 1000) / 1000;
}
function buildingLightCalibrationClamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

// ---------------------------------------------------------------------------
// catalog
// ---------------------------------------------------------------------------

function buildBuildingLightCatalog() {
  const cats = {};
  BUILDING_LIGHT_CALIBRATION_CATEGORIES.forEach(([id]) => { cats[id] = []; });
  const seen = new Set();
  const add = (cat, key, path, foot, zone) => {
    if (!key || !path || seen.has(key) || !cats[cat]) return;
    seen.add(key);
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

  // move airport-ish keys into transport
  ['special'].forEach((from) => {
    cats[from] = cats[from].filter((m) => {
      if (/airport|bus_depot|ferry|pier|heliport|mtr|station/i.test(m.key)) { cats.transport.push(m); return false; }
      return true;
    });
  });
  Object.values(cats).forEach((list) => list.sort((a, b) => a.key.localeCompare(b.key)));
  return cats;
}

function buildingLightCalibrationCatalogEntry(key) {
  const cats = buildingLightCalibrationCatalog || {};
  for (const list of Object.values(cats)) {
    const hit = list.find((m) => m.key === key);
    if (hit) return hit;
  }
  return null;
}

function buildingLightCalibrationFamilyFor(entry, category) {
  if (!entry) return 'unknown';
  if (entry.zone) {
    const kind = category === 'residential' ? 'residential'
      : category === 'commercial' ? 'commercial' : 'industrial';
    return `${kind}${Math.max(1, Math.min(5, entry.footprintCols || 2))}`;
  }
  return entry.key; // one model per non-zone family
}

function buildingLightCalibrationClassFor(entry, category) {
  if (category === 'residential') return 'res';
  if (category === 'industrial') return 'ind';
  if (category === 'government' || /hospital|clinic|fire|police|ambulance/i.test(entry?.key || '')) return 'svc';
  return 'off';
}

// ---------------------------------------------------------------------------
// data <-> runtime profile
// ---------------------------------------------------------------------------

function buildingLightCalibrationDefaultPanels(cls) {
  const src = typeof defaultBuildingLightPanels === 'function'
    ? defaultBuildingLightPanels(cls)
    : [{ corners: [[0.15, 0.2], [0.5, 0.3], [0.5, 0.8], [0.15, 0.7]], rows: 8, cols: 5, on: true }];
  return src.map((p) => ({
    c: p.corners.map((pt) => [pt[0], pt[1]]), rows: p.rows, cols: p.cols, on: p.on !== false,
  }));
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

function buildingLightCalibrationCloneData(d) {
  return {
    class: d.class,
    panels: (d.panels || []).map((p) => ({
      c: (p.c || p.corners || []).map((pt) => [pt[0], pt[1]]),
      rows: p.rows, cols: p.cols, on: p.on !== false,
    })),
    lamps: (d.lamps || []).map((l) => ({ x: l.x, y: l.y, r: l.r })),
    beacons: (d.beacons || []).map((b) => ({ x: b.x, y: b.y, color: b.color, period: b.period })),
    service: !!d.service, hasSignage: !!d.hasSignage, hasFloodlight: !!d.hasFloodlight,
  };
}

// Every calibration is per-model, keyed by the model's sprite key. (A baked
// per-family default still exists in building-lighting.js; the tool just doesn't
// write one, so there's no mode toggle to fat-finger.)
function buildingLightCalibrationStoreKey() {
  const t = buildingLightCalibrationTarget;
  return t ? '@' + t.key : null;
}

function buildingLightCalibrationCurrentData() {
  const t = buildingLightCalibrationTarget;
  if (!t) return null;
  // per-model entry first; then a pre-existing per-family entry (from before the
  // mode toggle was dropped) so those aren't lost; else the class base.
  const stored = buildingLightCalibrationOverrides['@' + t.key]
    || (t.zone && t.family && buildingLightCalibrationOverrides[t.family]);
  const data = stored
    ? buildingLightCalibrationCloneData(stored)
    : buildingLightCalibrationBaseData(t.cls);
  data.__custom = !!stored;
  return data;
}

function buildingLightCalibrationWriteData(data) {
  const key = buildingLightCalibrationStoreKey();
  if (!key) return;
  const clean = buildingLightCalibrationCloneData(data);
  clean.panels.forEach((p) => {
    p.c = p.c.map((pt) => [buildingLightCalibrationRound(pt[0]), buildingLightCalibrationRound(pt[1])]);
    p.rows = Math.max(1, Math.round(p.rows));
    p.cols = Math.max(1, Math.round(p.cols));
  });
  clean.lamps.forEach((l) => {
    l.x = buildingLightCalibrationRound(l.x);
    l.y = buildingLightCalibrationRound(l.y);
    l.r = buildingLightCalibrationRound(l.r);
  });
  clean.beacons.forEach((b) => {
    b.x = buildingLightCalibrationRound(b.x);
    b.y = buildingLightCalibrationRound(b.y);
  });
  buildingLightCalibrationOverrides[key] = clean;
  persistBuildingLightCalibrationOverrides();
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

// Read by resolveBuildingLightProfile in building-lighting.js.
function getBuildingLightCalibrationOverride(spriteKey, family) {
  if (typeof isVisualRouteCalibrationTestModeEnabled === 'function'
    && !isVisualRouteCalibrationTestModeEnabled()) return null;
  const hero = spriteKey && buildingLightCalibrationOverrides['@' + spriteKey];
  if (hero) return buildingLightCalibrationDataToProfile(hero);
  const fam = family && buildingLightCalibrationOverrides[family];
  if (fam) return buildingLightCalibrationDataToProfile(fam);
  return null;
}

function isBuildingLightCalibrationActive() { return buildingLightCalibrationActive; }
function isBuildingLightCalibrationInputActive() {
  return buildingLightCalibrationActive && (buildingLightCalibrationMapPick || !!buildingLightCalibrationPreview);
}

// ---------------------------------------------------------------------------
// select a model (catalog or map click)
// ---------------------------------------------------------------------------

function selectBuildingLightCalibrationModel(key, category) {
  const entry = buildingLightCalibrationCatalogEntry(key);
  if (!entry) return;
  const cls = buildingLightCalibrationClassFor(entry, category);
  buildingLightCalibrationTarget = {
    key: entry.key,
    path: typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(entry.path) : entry.path,
    texW: 128, texH: 128,
    zone: entry.zone,
    family: buildingLightCalibrationFamilyFor(entry, category),
    foot: entry.footprintCols,
    cls,
  };
  buildingLightCalibrationPanelIndex = 0;
  loadBuildingLightCalibrationTexture(() => spawnBuildingLightCalibrationPreview(true));
  renderBuildingLightCalibrationPanel();
}

function handleBuildingLightCalibrationPick(scene, sprite) {
  if (!buildingLightCalibrationActive || !buildingLightCalibrationMapPick || !sprite) return false;
  const record = (typeof buildingData !== 'undefined' && typeof getTileId === 'function')
    ? buildingData[getTileId(sprite.mapRow, sprite.mapCol)] : null;
  const key = sprite.logicalSpriteKey || sprite.renderTextureKey || record?.spriteKey;
  if (!key) return false;
  buildingLightCalibrationTarget = {
    key,
    path: null,
    texW: sprite.width || 96,
    texH: sprite.height || 96,
    zone: record?.type === 'residential' || record?.type === 'commercial' || record?.type === 'industrial',
    family: typeof getBuildingLightFamily === 'function' ? getBuildingLightFamily(record) : (record?.type || key),
    foot: record?.footprintCols || 2,
    cls: typeof getBuildingLightClass === 'function' ? getBuildingLightClass(record) : 'off',
    textureKey: sprite.texture?.key,
  };
  buildingLightCalibrationMapPick = false;
  buildingLightCalibrationPanelIndex = 0;
  spawnBuildingLightCalibrationPreview(true);
  renderBuildingLightCalibrationPanel();
  setBuildingLightCalibrationMessage(`已選 ${key}`, 'success');
  return true;
}

function loadBuildingLightCalibrationTexture(done) {
  const scene = buildingLightCalibrationScene;
  const t = buildingLightCalibrationTarget;
  if (!scene || !t) return;
  const cacheKey = `blcal_${t.key}`;
  t.textureKey = cacheKey;
  if (scene.textures.exists(cacheKey)) { done(); return; }
  if (!t.path || !scene.load?.image) { done(); return; }
  scene.load.image(cacheKey, t.path);
  scene.load.once(`filecomplete-image-${cacheKey}`, () => {
    const src = scene.textures.get(cacheKey)?.getSourceImage?.();
    if (src) { t.texW = src.width; t.texH = src.height; }
    done();
  });
  scene.load.once('loaderror', () => { setBuildingLightCalibrationMessage('圖載入失敗', 'error'); done(); });
  scene.load.start();
}

// ---------------------------------------------------------------------------
// preview - a dedicated STAGE pinned to the viewport, not the city itself.
// Objects live in world space (so drag input Just Works) but the stage geometry
// is recomputed from the camera every frame - screen size / (1/zoom), centred on
// the world point under the viewport - so panning or zooming the map never
// drifts or rescales it. The backdrop shows the ambient of the scrubbed
// condition so the glow reads against the right darkness.
// ---------------------------------------------------------------------------

const BUILDING_LIGHT_CALIBRATION_STAGE = Object.freeze({ w: 520, h: 560, inset: 0.82 });
const BUILDING_LIGHT_CALIBRATION_BUCKET_BG = Object.freeze({
  duskRamp: 0x2b2438, eveningPeak: 0x121b2c, lateEvening: 0x0c1322,
  deepNight: 0x080d18, dawnFade: 0x171f34,
});
let buildingLightCalibrationRain = false;
let buildingLightCalibrationCamKey = '';

function buildingLightCalibrationDepth(o) {
  const base = typeof VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH === 'number'
    ? VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH : 2_000_000_000;
  return base + o;
}

// { cx, cy: world centre of the stage; w, h: world size; s: screen->world scale }
function buildingLightCalibrationStageGeom(scene) {
  const cam = scene?.cameras?.main;
  const zoom = (cam && cam.zoom) || 1;
  const s = 1 / zoom;
  const screenW = (cam && cam.width) || scene?.scale?.width || 1280;
  const screenH = (cam && cam.height) || scene?.scale?.height || 720;
  const sw = Math.min(BUILDING_LIGHT_CALIBRATION_STAGE.w, Math.max(300, screenW - 380));
  const sh = Math.min(BUILDING_LIGHT_CALIBRATION_STAGE.h, screenH - 36);
  const scx = Math.max(sw / 2 + 14, (screenW - 356) / 2);
  const scy = screenH / 2;
  const wc = cam?.getWorldPoint ? cam.getWorldPoint(scx, scy) : { x: scx, y: scy };
  return { cx: wc.x, cy: wc.y, w: sw * s, h: sh * s, s, zoom };
}

function buildingLightCalibrationCameraSignature(scene) {
  const cam = scene?.cameras?.main;
  if (!cam) return '';
  return `${Math.round(cam.scrollX)},${Math.round(cam.scrollY)},${(cam.zoom || 1).toFixed(3)},${cam.width}x${cam.height}`;
}

function buildingLightCalibrationStageBg() {
  let bg = BUILDING_LIGHT_CALIBRATION_BUCKET_BG[buildingLightCalibrationBucket]
    ?? BUILDING_LIGHT_CALIBRATION_BUCKET_BG.eveningPeak;
  if (buildingLightCalibrationRain) {
    const r = ((bg >> 16) & 0xff) * 0.55;
    const g = ((bg >> 8) & 0xff) * 0.6;
    const b = Math.min(255, (bg & 0xff) * 0.9 + 10);
    bg = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }
  return bg;
}

function destroyBuildingLightCalibrationPreview() {
  const p = buildingLightCalibrationPreview;
  if (!p) return;
  p.stage?.destroy?.();
  p.stageGfx?.destroy?.();
  p.body?.destroy?.();
  p.gfx?.destroy?.();
  Object.values(p.handles || {}).forEach((h) => h?.destroy?.());
  buildingLightCalibrationPreview = null;
}

function spawnBuildingLightCalibrationPreview(refit) {
  const scene = buildingLightCalibrationScene;
  const t = buildingLightCalibrationTarget;
  if (!scene?.add || !t) return;
  destroyBuildingLightCalibrationPreview();
  const geom = buildingLightCalibrationStageGeom(scene);

  if (refit || !buildingLightCalibrationZoom) {
    // screen px the model should fill
    const screenFit = Math.min(
      geom.w / geom.s * BUILDING_LIGHT_CALIBRATION_STAGE.inset / Math.max(1, t.texW),
      geom.h / geom.s * BUILDING_LIGHT_CALIBRATION_STAGE.inset / Math.max(1, t.texH),
    );
    buildingLightCalibrationZoom = Math.max(BUILDING_LIGHT_CALIBRATION_MIN_ZOOM,
      Math.min(BUILDING_LIGHT_CALIBRATION_MAX_ZOOM, Math.round((screenFit || 3) * 4) / 4 || 3));
  }

  const stage = scene.add.rectangle(geom.cx, geom.cy, geom.w, geom.h, buildingLightCalibrationStageBg(), 1);
  stage.setStrokeStyle(geom.s, 0x3a516b, 0.95);
  stage.setDepth(buildingLightCalibrationDepth(-12));

  const stageGfx = scene.add.graphics();
  stageGfx.setDepth(buildingLightCalibrationDepth(-11));

  const body = t.textureKey && scene.textures.exists(t.textureKey)
    ? scene.add.image(geom.cx, geom.cy, t.textureKey)
    : null;
  if (body) {
    body.setOrigin(0.5, 0.5);
    body.setDepth(buildingLightCalibrationDepth(-8));
    if (!t.texW || t.texW === 128) {
      const src = body.texture?.getSourceImage?.();
      if (src) { t.texW = src.width; t.texH = src.height; }
    }
  }
  const gfx = scene.add.graphics();
  gfx.setDepth(buildingLightCalibrationDepth(-6));

  buildingLightCalibrationPreview = { stage, stageGfx, body, gfx, handles: {}, geom };
  buildingLightCalibrationCamKey = buildingLightCalibrationCameraSignature(scene);
  refreshBuildingLightCalibrationHandles();
  layoutBuildingLightCalibrationPreview();
}

// Called every frame from the game loop: keep the stage pinned when the map moves.
function syncBuildingLightCalibratorStage(scene) {
  if (!buildingLightCalibrationActive || !buildingLightCalibrationPreview) return;
  const sig = buildingLightCalibrationCameraSignature(scene);
  if (sig === buildingLightCalibrationCamKey) return;
  buildingLightCalibrationCamKey = sig;
  layoutBuildingLightCalibrationPreview();
}

function buildingLightCalibrationNormToWorld(nx, ny) {
  const p = buildingLightCalibrationPreview;
  const t = buildingLightCalibrationTarget;
  const g = p.geom;
  const scale = buildingLightCalibrationZoom * g.s;
  return { x: g.cx + (nx - 0.5) * t.texW * scale, y: g.cy + (ny - 0.5) * t.texH * scale };
}
function buildingLightCalibrationWorldToNorm(sx, sy) {
  const p = buildingLightCalibrationPreview;
  const t = buildingLightCalibrationTarget;
  const g = p.geom;
  const cam = buildingLightCalibrationScene?.cameras?.main;
  const w = cam?.getWorldPoint ? cam.getWorldPoint(sx, sy) : { x: sx, y: sy };
  const scale = buildingLightCalibrationZoom * g.s;
  return { nx: (w.x - g.cx) / (t.texW * scale) + 0.5, ny: (w.y - g.cy) / (t.texH * scale) + 0.5 };
}

function refreshBuildingLightCalibrationHandles() {
  const p = buildingLightCalibrationPreview;
  const scene = buildingLightCalibrationScene;
  const data = buildingLightCalibrationCurrentData();
  if (!p || !scene || !data) return;
  const want = new Set();
  for (let i = 0; i < 4; i++) want.add('p' + i);
  data.lamps.forEach((_, i) => want.add('l' + i));
  data.beacons.forEach((_, i) => want.add('b' + i));

  Object.keys(p.handles).forEach((id) => {
    if (!want.has(id)) { p.handles[id].destroy(); delete p.handles[id]; }
  });
  const beaconHex = (c) => (typeof BUILDING_LIGHT_BEACON_COLORS !== 'undefined'
    && BUILDING_LIGHT_BEACON_COLORS[c]) || 0xff3b30;
  want.forEach((id) => {
    if (p.handles[id]) {
      if (id[0] === 'b') {
        const idx = Number(id.slice(1));
        p.handles[id].setFillStyle?.(beaconHex(data.beacons[idx]?.color), 1);
      }
      return;
    }
    const color = id[0] === 'p' ? 0x8fd6ff
      : id[0] === 'l' ? 0xffce93
        : beaconHex(data.beacons[Number(id.slice(1))]?.color);
    const dot = scene.add.circle(0, 0, id[0] === 'p' ? 5.5 : 6, color, 0.95);
    dot.setStrokeStyle(1.5, 0x0a0f18, 0.9);
    dot.setDepth(buildingLightCalibrationDepth(-4));
    dot.setInteractive({ useHandCursor: true, draggable: true });
    scene.input?.setDraggable?.(dot, true);
    // drag by raw screen pointer; WorldToNorm maps it through the camera
    dot.on('drag', (pointer) => onBuildingLightCalibrationHandleDrag(id, pointer.x, pointer.y));
    p.handles[id] = dot;
  });
}

function onBuildingLightCalibrationHandleDrag(id, dx, dy) {
  const data = buildingLightCalibrationCurrentData();
  if (!data) return;
  const n = buildingLightCalibrationWorldToNorm(dx, dy);
  const nx = buildingLightCalibrationClamp01(n.nx);
  const ny = buildingLightCalibrationClamp01(n.ny);
  if (id[0] === 'p') {
    const panel = data.panels[buildingLightCalibrationPanelIndex];
    if (panel) panel.c[Number(id.slice(1))] = [nx, ny];
  } else if (id[0] === 'l') {
    const lamp = data.lamps[Number(id.slice(1))];
    if (lamp) { lamp.x = nx; lamp.y = ny; }
  } else if (id[0] === 'b') {
    const beacon = data.beacons[Number(id.slice(1))];
    if (beacon) { beacon.x = nx; beacon.y = ny; }
  }
  buildingLightCalibrationWriteData(data);
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
}

function layoutBuildingLightCalibrationPreview() {
  const p = buildingLightCalibrationPreview;
  const t = buildingLightCalibrationTarget;
  const scene = buildingLightCalibrationScene;
  if (!p || !t) return;
  const data = buildingLightCalibrationCurrentData();
  const profile = buildingLightCalibrationDataToProfile(data);

  // re-pin the stage to the current camera
  const geom = buildingLightCalibrationStageGeom(scene);
  p.geom = geom;
  const modelScale = buildingLightCalibrationZoom * geom.s;
  const lw = geom.s; // 1 screen px in world units

  p.stage?.setPosition?.(geom.cx, geom.cy);
  p.stage?.setSize?.(geom.w, geom.h);
  p.stage?.setStrokeStyle?.(lw, 0x3a516b, 0.95);
  p.stage?.setFillStyle?.(buildingLightCalibrationStageBg(), 1);
  if (p.body) { p.body.setPosition(geom.cx, geom.cy); p.body.setScale(modelScale); }

  const left = geom.cx - geom.w / 2;
  const right = geom.cx + geom.w / 2;
  const sg = p.stageGfx;
  if (sg) {
    sg.clear();
    const groundY = buildingLightCalibrationNormToWorld(0, 1).y;
    sg.lineStyle(lw, 0x5a7fa0, 0.35);
    sg.lineBetween(left, groundY, right, groundY);
    if (buildingLightCalibrationRain) {
      sg.lineStyle(lw, 0xaecbe6, 0.16);
      for (let i = 0; i < 46; i++) {
        const rx = left + ((i * 97) % geom.w);
        const ry = geom.cy - geom.h / 2 + ((i * 53) % geom.h);
        sg.lineBetween(rx, ry, rx - 4 * lw, ry + 13 * lw);
      }
    }
  }

  Object.values(p.handles).forEach((dot) => dot.setScale(geom.s));
  const sp = data.panels[buildingLightCalibrationPanelIndex] || data.panels[0];
  for (let i = 0; i < 4; i++) {
    const has = sp && sp.c[i];
    const w = has ? buildingLightCalibrationNormToWorld(sp.c[i][0], sp.c[i][1]) : null;
    p.handles['p' + i]?.setVisible(!!has);
    if (w) p.handles['p' + i].setPosition(w.x, w.y);
  }
  data.lamps.forEach((l, i) => {
    const w = buildingLightCalibrationNormToWorld(l.x, l.y);
    p.handles['l' + i]?.setPosition(w.x, w.y);
  });
  data.beacons.forEach((b, i) => {
    const w = buildingLightCalibrationNormToWorld(b.x, b.y);
    p.handles['b' + i]?.setPosition(w.x, w.y);
  });

  const g = p.gfx;
  g.clear();

  (data.panels || []).forEach((panel, pi) => {
    const sel = pi === buildingLightCalibrationPanelIndex;
    const pts = panel.c.map((c) => buildingLightCalibrationNormToWorld(c[0], c[1]));
    g.lineStyle((sel ? 1.8 : 1) * lw, sel ? 0x8fd6ff : 0x4a7f9c, panel.on === false ? 0.16 : (sel ? 0.75 : 0.38));
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.strokePath();
  });

  const cells = typeof computeLitBuildingWindows === 'function'
    ? computeLitBuildingWindows(profile, 1337, buildingLightCalibrationBucket, 3) : [];
  const warm = data.class === 'res' || data.class === 'ind';
  const col = warm ? 0xffcf87 : 0xdfe8ff;
  cells.forEach((cell) => {
    const pts = cell.quad.map((c) => {
      const w = buildingLightCalibrationNormToWorld(c[0], c[1]);
      return { x: w.x, y: w.y };
    });
    g.fillStyle(cell.on ? col : 0xffffff, cell.on ? Math.min(0.95, cell.alpha) : 0.05);
    g.fillPoints(pts, true);
  });

  data.lamps.forEach((l) => {
    const w = buildingLightCalibrationNormToWorld(l.x, l.y);
    g.fillStyle(0xffdca8, 0.22);
    g.fillCircle(w.x, w.y, l.r * t.texW * modelScale);
  });
}

// ---------------------------------------------------------------------------
// panel actions
// ---------------------------------------------------------------------------

function setBuildingLightCalibrationField(field, value) {
  const data = buildingLightCalibrationCurrentData();
  if (!data) return;
  data[field] = value;
  buildingLightCalibrationWriteData(data);
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
}

function mutateBuildingLightCalibrationData(fn) {
  const data = buildingLightCalibrationCurrentData();
  if (!data) return;
  fn(data);
  buildingLightCalibrationWriteData(data);
  refreshBuildingLightCalibrationHandles();
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
}

function addBuildingLightCalibrationPanel() {
  mutateBuildingLightCalibrationData((data) => {
    if (data.panels.length >= (typeof BUILDING_LIGHT_MAX_PANELS === 'number' ? BUILDING_LIGHT_MAX_PANELS : 4)) return;
    data.panels.push({ c: [[0.35, 0.3], [0.65, 0.4], [0.65, 0.7], [0.35, 0.6]], rows: 8, cols: 4, on: true });
    buildingLightCalibrationPanelIndex = data.panels.length - 1;
  });
}
function removeBuildingLightCalibrationPanel() {
  mutateBuildingLightCalibrationData((data) => {
    if (data.panels.length <= 1) return;
    data.panels.splice(buildingLightCalibrationPanelIndex, 1);
    buildingLightCalibrationPanelIndex = Math.max(0, buildingLightCalibrationPanelIndex - 1);
  });
}
function stepBuildingLightCalibrationGrid(dim, delta) {
  mutateBuildingLightCalibrationData((data) => {
    const panel = data.panels[buildingLightCalibrationPanelIndex];
    if (panel) panel[dim] = Math.max(1, panel[dim] + delta);
  });
}
function toggleBuildingLightCalibrationPanelOn() {
  mutateBuildingLightCalibrationData((data) => {
    const panel = data.panels[buildingLightCalibrationPanelIndex];
    if (panel) panel.on = panel.on === false;
  });
}
function addBuildingLightCalibrationLamp() {
  mutateBuildingLightCalibrationData((data) => data.lamps.push({ x: 0.5, y: 0.85, r: 0.09 }));
}
function removeBuildingLightCalibrationLamp(i) {
  mutateBuildingLightCalibrationData((data) => data.lamps.splice(i, 1));
}
function addBuildingLightCalibrationBeacon() {
  mutateBuildingLightCalibrationData((data) => data.beacons.push({
    x: 0.5, y: 0.08, color: 'red',
    period: typeof BUILDING_LIGHT_BEACON_COLORS === 'undefined' ? 1600 : 1600,
  }));
}
function removeBuildingLightCalibrationBeacon(i) {
  mutateBuildingLightCalibrationData((data) => data.beacons.splice(i, 1));
}
function cycleBuildingLightCalibrationBeaconColor(i) {
  mutateBuildingLightCalibrationData((data) => {
    const b = data.beacons[i];
    if (!b) return;
    const order = BUILDING_LIGHT_CALIBRATION_BEACON_ORDER;
    b.color = order[(order.indexOf(b.color) + 1) % order.length];
  });
}

function resetBuildingLightCalibrationEntry() {
  const t = buildingLightCalibrationTarget;
  if (t) {
    delete buildingLightCalibrationOverrides['@' + t.key];
    if (t.zone && t.family) delete buildingLightCalibrationOverrides[t.family];
    persistBuildingLightCalibrationOverrides();
    if (typeof refreshAllBuildingLightGlows === 'function' && buildingLightCalibrationScene) {
      refreshAllBuildingLightGlows(buildingLightCalibrationScene, true);
    }
  }
  refreshBuildingLightCalibrationHandles();
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
  setBuildingLightCalibrationMessage('已還原預設', 'info');
}

function applyBuildingLightCalibration() {
  const scene = buildingLightCalibrationScene;
  const key = buildingLightCalibrationStoreKey();
  if (!scene || !key) return;
  // already persisted on every edit; just push it live
  if (typeof refreshAllBuildingLightGlows === 'function') refreshAllBuildingLightGlows(scene, true);
  setBuildingLightCalibrationMessage(`${key} 已套用到城市`, 'success');
}

// ---------------------------------------------------------------------------
// export / import
// ---------------------------------------------------------------------------

function buildingLightCalibrationProfileLiteral(data, indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const rnd = buildingLightCalibrationRound;
  const parts = [`class: '${data.class}'`];
  if (data.service) parts.push('service: true');
  if (data.hasSignage) parts.push('hasSignage: true');
  if (data.hasFloodlight) parts.push('hasFloodlight: true');
  const panelLines = (data.panels || []).map((p) => {
    const c = p.c.map((pt) => `[${rnd(pt[0])}, ${rnd(pt[1])}]`).join(', ');
    return `${inner}  { c: [${c}], rows: ${Math.round(p.rows)}, cols: ${Math.round(p.cols)}${p.on === false ? ', on: false' : ''} },`;
  });
  const lampLine = `${inner}lamps: [${(data.lamps || []).map((l) => `{ x: ${rnd(l.x)}, y: ${rnd(l.y)}, r: ${rnd(l.r)} }`).join(', ')}],`;
  const beaconLine = (data.beacons && data.beacons.length)
    ? `${inner}beacons: [${data.beacons.map((b) => `{ x: ${rnd(b.x)}, y: ${rnd(b.y)}, color: '${b.color}', period: ${Math.round(b.period)} }`).join(', ')}],`
    : null;
  const lines = [
    `makeBuildingLightProfile({`,
    `${inner}${parts.join(', ')},`,
    `${inner}panels: [`,
    ...panelLines,
    `${inner}],`,
    lampLine,
  ];
  if (beaconLine) lines.push(beaconLine);
  lines.push(`${pad}})`);
  return lines.join('\n');
}

function buildBuildingLightCalibrationRecord() {
  const families = {};
  const heroes = {};
  Object.keys(buildingLightCalibrationOverrides).forEach((key) => {
    const literal = buildingLightCalibrationProfileLiteral(buildingLightCalibrationOverrides[key], 2);
    if (key.startsWith('@')) heroes[key.slice(1)] = literal;
    else families[key] = literal;
  });
  const famBlock = Object.keys(families).length
    ? 'Object.assign(BUILDING_LIGHT_PROFILES, {\n'
      + Object.entries(families).map(([k, v]) => `  ${k}: ${v},`).join('\n') + '\n});'
    : '// no family calibrations';
  const heroBlock = Object.keys(heroes).length
    ? 'const BUILDING_LIGHT_HERO_PROFILES = {\n'
      + Object.entries(heroes).map(([k, v]) => `  ${k}: ${v},`).join('\n') + '\n};'
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
  let parsed;
  try { parsed = JSON.parse(text); } catch { setBuildingLightCalibrationMessage('JSON 解析失敗', 'error'); return; }
  const entries = parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : null;
  if (!entries) { setBuildingLightCalibrationMessage('JSON 冇 entries', 'error'); return; }
  Object.keys(buildingLightCalibrationOverrides).forEach((k) => delete buildingLightCalibrationOverrides[k]);
  Object.entries(entries).forEach(([k, d]) => { buildingLightCalibrationOverrides[k] = migrateBuildingLightCalibrationData(d); });
  persistBuildingLightCalibrationOverrides();
  if (typeof refreshAllBuildingLightGlows === 'function' && buildingLightCalibrationScene) {
    refreshAllBuildingLightGlows(buildingLightCalibrationScene, true);
  }
  refreshBuildingLightCalibrationHandles();
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
  setBuildingLightCalibrationMessage(`已匯入 ${Object.keys(entries).length} 個模型`, 'success');
}

function copyBuildingLightCalibrationText(text, ok) {
  const p = typeof copyVisualRouteCalibrationText === 'function'
    ? copyVisualRouteCalibrationText(text) : Promise.reject();
  p.then(() => setBuildingLightCalibrationMessage(ok, 'success'))
    .catch(() => setBuildingLightCalibrationMessage('複製失敗', 'error'));
}

// ---------------------------------------------------------------------------
// panel DOM
// ---------------------------------------------------------------------------

function createBuildingLightCalibrationPanel() {
  if (buildingLightCalibrationPanel) return buildingLightCalibrationPanel;
  if (typeof document === 'undefined' || !document.body) return null;
  if (!document.getElementById('building-light-calibrator-style')) {
    const style = document.createElement('style');
    style.id = 'building-light-calibrator-style';
    style.textContent = `
      #building-light-calibrator-panel{position:fixed;right:14px;top:14px;bottom:14px;z-index:100000;
        width:min(340px,calc(100vw - 28px));box-sizing:border-box;padding:12px;overflow-y:auto;
        border:1px solid rgba(143,214,255,.6);border-radius:12px;color:#eaf6ff;
        background:rgba(9,17,28,.96);box-shadow:0 14px 34px rgba(0,0,0,.5);
        font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;user-select:text;backdrop-filter:blur(8px)}
      #building-light-calibrator-panel[hidden]{display:none!important}
      #building-light-calibrator-panel h4{font-weight:800;color:#8fd6ff;letter-spacing:.04em;margin:12px 0 6px}
      #building-light-calibrator-panel h4:first-child{margin-top:0}
      #building-light-calibrator-panel .bl-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0}
      #building-light-calibrator-panel button{border:1px solid #3f7f9c;border-radius:7px;padding:5px 8px;
        color:#eaf6ff;background:#123243;font:inherit;cursor:pointer}
      #building-light-calibrator-panel button:hover{background:#1a4a62}
      #building-light-calibrator-panel button[data-active="true"]{background:#1f9d5c;border-color:#7ce8a8;color:#06210f}
      #building-light-calibrator-panel button[data-off="true"]{opacity:.5;text-decoration:line-through}
      #building-light-calibrator-panel select{width:100%;background:#123243;color:#eaf6ff;border:1px solid #3f7f9c;border-radius:6px;padding:5px;font:inherit}
      #building-light-calibrator-panel .bl-2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:5px 0}
      #building-light-calibrator-panel .bl-faces{display:flex;gap:4px;flex-wrap:wrap;margin:5px 0}
      #building-light-calibrator-panel .bl-faces button{min-width:34px}
      #building-light-calibrator-panel .bl-step{display:flex;gap:4px;align-items:center}
      #building-light-calibrator-panel .bl-step b{min-width:2ch;text-align:center;color:#fff}
      #building-light-calibrator-panel .bl-list{display:grid;gap:4px;margin:5px 0}
      #building-light-calibrator-panel .bl-list .bl-item{display:flex;align-items:center;gap:6px}
      #building-light-calibrator-panel .bl-list .bl-item span{flex:1;color:#a9c6da}
      #building-light-calibrator-panel .bl-flags label{display:flex;gap:5px;align-items:center;color:#a9c6da}
      #building-light-calibrator-panel .bl-buckets{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin:5px 0}
      #building-light-calibrator-panel .bl-buckets button{padding:5px 2px;font-size:11px}
      #building-light-calibrator-panel .bl-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
      #building-light-calibrator-panel .bl-apply{background:#1f9d5c;border-color:#7ce8a8;color:#06210f;font-weight:700}
      #building-light-calibrator-panel .bl-msg{min-height:15px;margin-top:7px;color:#a9c6da}
      #building-light-calibrator-panel .bl-msg[data-tone="success"]{color:#9be89b}
      #building-light-calibrator-panel .bl-msg[data-tone="error"]{color:#ff9a9a}
    `;
    document.head.appendChild(style);
  }
  const root = document.createElement('section');
  root.id = 'building-light-calibrator-panel';
  root.hidden = true;
  root.innerHTML = `
    <h4>夜間建築燈光校正</h4>
    <select class="bl-cat"></select>
    <select class="bl-model" style="margin-top:5px"></select>
    <div class="bl-row"><button type="button" class="bl-mappick">或：從地圖選取</button>
      <span class="bl-key"></span></div>

    <div class="bl-row"><span>類別</span>
      <select class="bl-class" style="width:auto">
        <option value="res">住宅 (暖)</option><option value="off">辦公 (冷白)</option>
        <option value="ind">工業 (暗黃)</option><option value="svc">服務 (通宵)</option>
      </select></div>

    <h4>窗面 (A–D)</h4>
    <div class="bl-faces"></div>
    <div class="bl-2"><button type="button" class="bl-face-add">＋面</button>
      <button type="button" class="bl-face-del">－面</button></div>
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

    <h4>預覽舞台</h4>
    <div class="bl-buckets">
      <button data-bucket="duskRamp">黃昏</button><button data-bucket="eveningPeak">晚高峰</button>
      <button data-bucket="lateEvening">晚間</button><button data-bucket="deepNight">深夜</button>
      <button data-bucket="dawnFade">天光</button>
    </div>
    <div class="bl-2" style="margin-top:5px">
      <button type="button" class="bl-rain">☔ 大雨背景:關</button>
      <button type="button" class="bl-recenter">重設檢視</button>
    </div>
    <div class="bl-row"><span>放大</span><span class="bl-step">
      <button data-zoom="-1">−</button><b class="bl-zoom">3×</b><button data-zoom="1">+</button></span></div>

    <button type="button" class="bl-apply" style="width:100%;margin-top:8px">套用到城市</button>
    <div class="bl-actions">
      <button type="button" class="bl-reset">還原呢個</button>
      <button type="button" class="bl-copy">複製 JS</button>
      <button type="button" class="bl-export">匯出全部 JSON</button>
      <button type="button" class="bl-import">匯入 JSON</button>
      <button type="button" class="bl-close" style="grid-column:1/-1">收起</button>
    </div>
    <div class="bl-msg"></div>
  `;
  document.body.appendChild(root);

  const catSel = root.querySelector('.bl-cat');
  BUILDING_LIGHT_CALIBRATION_CATEGORIES.forEach(([id, label]) => {
    const o = document.createElement('option'); o.value = id; o.textContent = label; catSel.appendChild(o);
  });
  catSel.addEventListener('change', () => {
    buildingLightCalibrationCategory = catSel.value;
    populateBuildingLightCalibrationModelSelect();
  });
  root.querySelector('.bl-model').addEventListener('change', (e) => {
    if (e.target.value) selectBuildingLightCalibrationModel(e.target.value, buildingLightCalibrationCategory);
  });
  root.querySelector('.bl-mappick').addEventListener('click', () => {
    buildingLightCalibrationMapPick = !buildingLightCalibrationMapPick;
    renderBuildingLightCalibrationPanel();
    setBuildingLightCalibrationMessage(buildingLightCalibrationMapPick ? '撳地圖上一棟建築' : '已關', 'info');
  });
  root.querySelector('.bl-class').addEventListener('change', (e) => setBuildingLightCalibrationField('class', e.target.value));
  root.querySelector('.bl-face-add').addEventListener('click', addBuildingLightCalibrationPanel);
  root.querySelector('.bl-face-del').addEventListener('click', removeBuildingLightCalibrationPanel);
  root.querySelector('.bl-face-on').addEventListener('click', toggleBuildingLightCalibrationPanelOn);
  root.querySelectorAll('[data-grid]').forEach((b) => b.addEventListener('click', () => {
    const op = b.dataset.grid;
    stepBuildingLightCalibrationGrid(op.startsWith('rows') ? 'rows' : 'cols', op.endsWith('+') ? 1 : -1);
  }));
  root.querySelector('.bl-lamp-add').addEventListener('click', addBuildingLightCalibrationLamp);
  root.querySelector('.bl-beacon-add').addEventListener('click', addBuildingLightCalibrationBeacon);
  root.querySelector('.bl-svc').addEventListener('change', (e) => setBuildingLightCalibrationField('service', e.target.checked));
  root.querySelector('.bl-sig').addEventListener('change', (e) => setBuildingLightCalibrationField('hasSignage', e.target.checked));
  root.querySelector('.bl-flood').addEventListener('change', (e) => setBuildingLightCalibrationField('hasFloodlight', e.target.checked));
  root.querySelectorAll('[data-bucket]').forEach((b) => b.addEventListener('click', () => {
    buildingLightCalibrationBucket = b.dataset.bucket;
    layoutBuildingLightCalibrationPreview();
    renderBuildingLightCalibrationPanel();
  }));
  root.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    buildingLightCalibrationZoom = Math.max(BUILDING_LIGHT_CALIBRATION_MIN_ZOOM,
      Math.min(BUILDING_LIGHT_CALIBRATION_MAX_ZOOM, buildingLightCalibrationZoom + Number(b.dataset.zoom) * 0.5));
    layoutBuildingLightCalibrationPreview();
    renderBuildingLightCalibrationPanel();
  }));
  root.querySelector('.bl-rain').addEventListener('click', () => {
    buildingLightCalibrationRain = !buildingLightCalibrationRain;
    layoutBuildingLightCalibrationPreview();
    renderBuildingLightCalibrationPanel();
  });
  root.querySelector('.bl-recenter').addEventListener('click', () => {
    if (buildingLightCalibrationTarget) spawnBuildingLightCalibrationPreview(true);
  });
  root.querySelector('.bl-apply').addEventListener('click', applyBuildingLightCalibration);
  root.querySelector('.bl-reset').addEventListener('click', resetBuildingLightCalibrationEntry);
  root.querySelector('.bl-copy').addEventListener('click', () => copyBuildingLightCalibrationText(buildBuildingLightCalibrationRecord(), '已複製 JS'));
  root.querySelector('.bl-export').addEventListener('click', () => copyBuildingLightCalibrationText(buildBuildingLightCalibrationJSON(), '已複製全部 JSON'));
  root.querySelector('.bl-import').addEventListener('click', () => {
    const text = globalThis.prompt?.('貼上 building-light JSON');
    if (text) importBuildingLightCalibrationJSON(text);
  });
  root.querySelector('.bl-close').addEventListener('click', teardownBuildingLightCalibrator);

  buildingLightCalibrationPanel = {
    root,
    cat: catSel,
    model: root.querySelector('.bl-model'),
    key: root.querySelector('.bl-key'),
    faces: root.querySelector('.bl-faces'),
    lamps: root.querySelector('.bl-lamps'),
    beacons: root.querySelector('.bl-beacons'),
    msg: root.querySelector('.bl-msg'),
  };
  populateBuildingLightCalibrationModelSelect();
  return buildingLightCalibrationPanel;
}

function populateBuildingLightCalibrationModelSelect() {
  const panel = buildingLightCalibrationPanel;
  if (!panel) return;
  const list = (buildingLightCalibrationCatalog || {})[buildingLightCalibrationCategory] || [];
  panel.model.replaceChildren();
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = list.length ? `— 揀模型 (${list.length}) —` : '(未載入)';
  panel.model.appendChild(ph);
  list.forEach((m) => {
    const o = document.createElement('option');
    o.value = m.key; o.textContent = m.key;
    panel.model.appendChild(o);
  });
}

function setBuildingLightCalibrationMessage(text, tone = 'info') {
  if (!buildingLightCalibrationPanel) return;
  buildingLightCalibrationPanel.msg.textContent = String(text || '');
  buildingLightCalibrationPanel.msg.dataset.tone = tone;
}

function renderBuildingLightCalibrationPanel() {
  const panel = buildingLightCalibrationPanel;
  if (!panel) return;
  panel.root.hidden = !buildingLightCalibrationActive;
  if (!buildingLightCalibrationActive) return;
  const r = panel.root;
  const t = buildingLightCalibrationTarget;
  const data = buildingLightCalibrationCurrentData();
  panel.cat.value = buildingLightCalibrationCategory;
  panel.key.textContent = t
    ? `${t.key} · ${data?.__custom ? '已校正' : '預設'}`
    : '(未揀模型)';
  r.querySelector('.bl-mappick').dataset.active = String(buildingLightCalibrationMapPick);
  r.querySelectorAll('[data-bucket]').forEach((b) => {
    b.dataset.active = String(b.dataset.bucket === buildingLightCalibrationBucket);
  });
  r.querySelector('.bl-zoom').textContent = `${buildingLightCalibrationZoom}×`;
  const rainBtn = r.querySelector('.bl-rain');
  rainBtn.textContent = `☔ 大雨背景:${buildingLightCalibrationRain ? '開' : '關'}`;
  rainBtn.dataset.active = String(buildingLightCalibrationRain);
  if (!data) return;

  r.querySelector('.bl-class').value = data.class;
  r.querySelector('.bl-svc').checked = !!data.service;
  r.querySelector('.bl-sig').checked = !!data.hasSignage;
  r.querySelector('.bl-flood').checked = !!data.hasFloodlight;

  panel.faces.replaceChildren(...data.panels.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = (typeof BUILDING_LIGHT_PANEL_LABELS !== 'undefined' ? BUILDING_LIGHT_PANEL_LABELS[i] : 'ABCD'[i]) + '面';
    b.dataset.active = String(i === buildingLightCalibrationPanelIndex);
    b.dataset.off = String(p.on === false);
    b.addEventListener('click', () => {
      buildingLightCalibrationPanelIndex = i;
      layoutBuildingLightCalibrationPreview();
      renderBuildingLightCalibrationPanel();
    });
    return b;
  }));
  const sp = data.panels[buildingLightCalibrationPanelIndex] || data.panels[0];
  r.querySelector('.bl-face-on').textContent = `呢個面:${sp && sp.on === false ? '關' : '開'}`;
  r.querySelector('.bl-rows').textContent = sp ? Math.round(sp.rows) : '-';
  r.querySelector('.bl-cols').textContent = sp ? Math.round(sp.cols) : '-';

  panel.lamps.replaceChildren(...data.lamps.map((l, i) => {
    const row = document.createElement('div');
    row.className = 'bl-item';
    const s = document.createElement('span');
    s.textContent = `路燈 ${i + 1}  (${buildingLightCalibrationRound(l.x)}, ${buildingLightCalibrationRound(l.y)}) r${buildingLightCalibrationRound(l.r)}`;
    const minus = document.createElement('button'); minus.textContent = 'r−';
    minus.addEventListener('click', () => mutateBuildingLightCalibrationData((d) => { d.lamps[i].r = Math.max(0.02, d.lamps[i].r - 0.01); }));
    const plus = document.createElement('button'); plus.textContent = 'r+';
    plus.addEventListener('click', () => mutateBuildingLightCalibrationData((d) => { d.lamps[i].r += 0.01; }));
    const del = document.createElement('button'); del.textContent = '×';
    del.addEventListener('click', () => removeBuildingLightCalibrationLamp(i));
    row.append(s, minus, plus, del);
    return row;
  }));

  panel.beacons.replaceChildren(...data.beacons.map((b, i) => {
    const row = document.createElement('div');
    row.className = 'bl-item';
    const s = document.createElement('span');
    s.textContent = `指示燈 ${i + 1}  (${buildingLightCalibrationRound(b.x)}, ${buildingLightCalibrationRound(b.y)})`;
    const colBtn = document.createElement('button');
    colBtn.textContent = BUILDING_LIGHT_CALIBRATION_BEACON_LABEL[b.color] || b.color;
    colBtn.addEventListener('click', () => cycleBuildingLightCalibrationBeaconColor(i));
    const del = document.createElement('button'); del.textContent = '×';
    del.addEventListener('click', () => removeBuildingLightCalibrationBeacon(i));
    row.append(s, colBtn, del);
    return row;
  }));
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

function startBuildingLightCalibrator(scene) {
  buildingLightCalibrationActive = true;
  buildingLightCalibrationScene = scene;
  if (scene) scene.buildingLightCalibrationActive = true;
  // one-time: write the merged (v2 + v3) set back so nothing is lost later
  persistBuildingLightCalibrationOverrides();
  buildingLightCalibrationCatalog = buildBuildingLightCatalog();
  createBuildingLightCalibrationPanel();
  populateBuildingLightCalibrationModelSelect();
  renderBuildingLightCalibrationPanel();
  setBuildingLightCalibrationMessage('揀大類 → 揀模型，或從地圖選取', 'info');

  buildingLightCalibrationKeyHandler = (e) => {
    if (!buildingLightCalibrationActive || !buildingLightCalibrationTarget) return;
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
    panel.c = panel.c.map((pt) => [
      buildingLightCalibrationClamp01(pt[0] + dx), buildingLightCalibrationClamp01(pt[1] + dy),
    ]);
    buildingLightCalibrationWriteData(data);
    layoutBuildingLightCalibrationPreview();
    renderBuildingLightCalibrationPanel();
  };
  globalThis.addEventListener?.('keydown', buildingLightCalibrationKeyHandler);
}

function teardownBuildingLightCalibrator() {
  buildingLightCalibrationActive = false;
  buildingLightCalibrationMapPick = false;
  destroyBuildingLightCalibrationPreview();
  if (buildingLightCalibrationScene) buildingLightCalibrationScene.buildingLightCalibrationActive = false;
  if (buildingLightCalibrationKeyHandler) {
    globalThis.removeEventListener?.('keydown', buildingLightCalibrationKeyHandler);
    buildingLightCalibrationKeyHandler = null;
  }
  if (buildingLightCalibrationPanel?.root) buildingLightCalibrationPanel.root.hidden = true;
}

function toggleBuildingLightCalibrator(scene) {
  if (buildingLightCalibrationActive) { teardownBuildingLightCalibrator(); return false; }
  if (!scene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
    || !isVisualRouteCalibrationTestModeEnabled()) return false;
  startBuildingLightCalibrator(scene);
  return true;
}

// ---------------------------------------------------------------------------

const buildingLightCalibratorTestApi = {
  BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION,
  getBuildingLightCalibrationOverride,
  isBuildingLightCalibrationActive,
  isBuildingLightCalibrationInputActive,
  handleBuildingLightCalibrationPick,
  buildBuildingLightCalibrationRecord,
  buildBuildingLightCalibrationJSON,
  importBuildingLightCalibrationJSON,
  migrateBuildingLightCalibrationData,
  buildingLightCalibrationProfileLiteral,
  toggleBuildingLightCalibrator,
  _setEntryForTest(key, data) { buildingLightCalibrationOverrides[key] = data; },
  _clearForTest() { Object.keys(buildingLightCalibrationOverrides).forEach((k) => delete buildingLightCalibrationOverrides[k]); },
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
