// Building night-lighting calibrator (test-branch-only dev tool).
//
// Same mould as traffic-light-calibrator.js / bus-stop-calibrator.js: test-mode
// gated, reached from the performance panel. Pick a placed building and a
// magnified, centred copy of its render becomes the workbench. A building's
// window area is one or two PANELS - the visible isometric wall faces - each a
// parallelogram you drag by its four corners so the grid follows the 1:2 iso
// slope. Set the grid density per panel, drop the entrance glow, pick a class
// colour, and scrub the time-of-night to watch it relight.
//
// Output is a BUILDING_LIGHT_PROFILES block keyed by model family plus optional
// per-model "hero" overrides, baked into building-lighting.js.

const BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION = 2;
const BUILDING_LIGHT_CALIBRATION_STORAGE_KEY = 'buildingLightCalibration.v2';
const BUILDING_LIGHT_CALIBRATION_BUCKETS = Object.freeze([
  ['duskRamp', '黃昏'], ['eveningPeak', '晚高峰'], ['lateEvening', '晚間'],
  ['deepNight', '深夜'], ['dawnFade', '天光'],
]);
const BUILDING_LIGHT_CALIBRATION_MIN_ZOOM = 1.5;
const BUILDING_LIGHT_CALIBRATION_MAX_ZOOM = 8;
const BUILDING_LIGHT_CALIBRATION_CORNER_IDS = Object.freeze(['c0', 'c1', 'c2', 'c3']);

// { [family]: data, ['@'+spriteKey]: data }
// data = { class, panels:[{c:[[x,y]x4], rows, cols, on}], entrance, ex, ey, er, service, hasSignage, hasFloodlight }
const buildingLightCalibrationOverrides = loadBuildingLightCalibrationOverrides();

let buildingLightCalibrationActive = false;
let buildingLightCalibrationPickerOn = false;
let buildingLightCalibrationScene = null;
let buildingLightCalibrationPanel = null;
let buildingLightCalibrationZoom = 3;
let buildingLightCalibrationBucket = 'eveningPeak';
let buildingLightCalibrationHeroMode = false;
let buildingLightCalibrationPanelIndex = 0; // which wall face is being edited
let buildingLightCalibrationTarget = null;  // { family, spriteKey, textureKey, texW, texH, record }
let buildingLightCalibrationPreview = null; // { body, gfx, handles:{}, worldX, worldY }
let buildingLightCalibrationKeyHandler = null;

// ---------------------------------------------------------------------------

function loadBuildingLightCalibrationOverrides() {
  try {
    const raw = globalThis.localStorage?.getItem(BUILDING_LIGHT_CALIBRATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object'
      ? parsed.entries : {};
  } catch { return {}; }
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
// data <-> runtime profile
// ---------------------------------------------------------------------------

function buildingLightCalibrationBaseProfile(record) {
  const cls = typeof getBuildingLightClass === 'function' ? getBuildingLightClass(record) : 'off';
  const def = (typeof BUILDING_LIGHT_CLASS_DEFAULTS !== 'undefined' && BUILDING_LIGHT_CLASS_DEFAULTS[cls])
    || (typeof makeBuildingLightProfile === 'function' ? makeBuildingLightProfile({ class: cls }) : null);
  const panels = (def?.panels || []).map((p) => ({
    c: p.corners.map((pt) => [pt[0], pt[1]]),
    rows: p.rows, cols: p.cols, on: p.on !== false,
  }));
  return {
    class: cls,
    panels: panels.length ? panels : [{ c: [[0.15, 0.1], [0.5, 0.28], [0.5, 0.72], [0.15, 0.56]], rows: 8, cols: 5, on: true }],
    entrance: !!def?.entrance,
    ex: def?.entrance?.x ?? 0.5, ey: def?.entrance?.y ?? 0.9, er: def?.entrance?.r ?? 0.1,
    service: !!def?.service, hasSignage: false, hasFloodlight: false,
  };
}

function buildingLightCalibrationCloneData(d) {
  return {
    class: d.class,
    panels: d.panels.map((p) => ({ c: p.c.map((pt) => [pt[0], pt[1]]), rows: p.rows, cols: p.cols, on: p.on !== false })),
    entrance: !!d.entrance, ex: d.ex, ey: d.ey, er: d.er,
    service: !!d.service, hasSignage: !!d.hasSignage, hasFloodlight: !!d.hasFloodlight,
  };
}

function buildingLightCalibrationCurrentData() {
  const t = buildingLightCalibrationTarget;
  if (!t) return null;
  const key = buildingLightCalibrationHeroMode ? '@' + t.spriteKey : t.family;
  const stored = buildingLightCalibrationOverrides[key];
  const data = stored
    ? buildingLightCalibrationCloneData(stored)
    : buildingLightCalibrationBaseProfile(t.record);
  data.__custom = !!stored;
  return data;
}

function buildingLightCalibrationWriteData(data) {
  const t = buildingLightCalibrationTarget;
  if (!t) return;
  const key = buildingLightCalibrationHeroMode ? '@' + t.spriteKey : t.family;
  const clean = buildingLightCalibrationCloneData(data);
  clean.panels.forEach((p) => {
    p.c = p.c.map((pt) => [buildingLightCalibrationRound(pt[0]), buildingLightCalibrationRound(pt[1])]);
    p.rows = Math.max(1, Math.round(p.rows));
    p.cols = Math.max(1, Math.round(p.cols));
  });
  ['ex', 'ey', 'er'].forEach((k) => { clean[k] = buildingLightCalibrationRound(clean[k]); });
  buildingLightCalibrationOverrides[key] = clean;
  persistBuildingLightCalibrationOverrides();
}

function buildingLightCalibrationDataToProfile(data) {
  if (typeof makeBuildingLightProfile !== 'function' || !data) return null;
  return makeBuildingLightProfile({
    class: data.class,
    panels: data.panels.map((p) => ({ corners: p.c, rows: p.rows, cols: p.cols, on: p.on !== false })),
    entrance: data.entrance ? undefined : null,
    ex: data.ex, ey: data.ey, er: data.er,
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
  return buildingLightCalibrationActive
    && (buildingLightCalibrationPickerOn || !!buildingLightCalibrationPreview);
}

// ---------------------------------------------------------------------------
// picker
// ---------------------------------------------------------------------------

function handleBuildingLightCalibrationPick(scene, sprite) {
  if (!buildingLightCalibrationActive || !buildingLightCalibrationPickerOn || !sprite) return false;
  const record = (typeof buildingData !== 'undefined' && typeof getTileId === 'function')
    ? buildingData[getTileId(sprite.mapRow, sprite.mapCol)] : null;
  if (!record) return false;
  buildingLightCalibrationTarget = {
    family: typeof getBuildingLightFamily === 'function' ? getBuildingLightFamily(record) : (record.type || 'unknown'),
    spriteKey: sprite.logicalSpriteKey || sprite.renderTextureKey || record.spriteKey || 'unknown',
    textureKey: sprite.texture?.key || sprite.renderTextureKey,
    texW: sprite.width || 64,
    texH: sprite.height || 64,
    record,
  };
  buildingLightCalibrationPickerOn = false;
  buildingLightCalibrationPanelIndex = 0;
  spawnBuildingLightCalibrationPreview(true);
  renderBuildingLightCalibrationPanel();
  setBuildingLightCalibrationMessage(`已選 ${buildingLightCalibrationTarget.family}`, 'success');
  return true;
}

// ---------------------------------------------------------------------------
// preview
// ---------------------------------------------------------------------------

function buildingLightCalibrationCameraCentre(scene) {
  const cam = scene?.cameras?.main;
  if (!cam) return { x: 0, y: 0 };
  return {
    x: Number.isFinite(cam.midPoint?.x) ? cam.midPoint.x : cam.scrollX + cam.width / 2,
    y: Number.isFinite(cam.midPoint?.y) ? cam.midPoint.y : cam.scrollY + cam.height / 2,
  };
}

function destroyBuildingLightCalibrationPreview() {
  const p = buildingLightCalibrationPreview;
  if (!p) return;
  p.body?.destroy?.();
  p.gfx?.destroy?.();
  Object.values(p.handles || {}).forEach((h) => h?.destroy?.());
  buildingLightCalibrationPreview = null;
}

function buildingLightCalibrationDepth(o) {
  const base = typeof VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH === 'number'
    ? VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH : 2_000_000_000;
  return base + o;
}

function spawnBuildingLightCalibrationPreview(refit) {
  const scene = buildingLightCalibrationScene;
  const t = buildingLightCalibrationTarget;
  if (!scene?.add || !t) return;
  destroyBuildingLightCalibrationPreview();
  const centre = buildingLightCalibrationCameraCentre(scene);

  if (refit) {
    const fit = Math.min(360 / Math.max(1, t.texW), 470 / Math.max(1, t.texH));
    buildingLightCalibrationZoom = Math.max(BUILDING_LIGHT_CALIBRATION_MIN_ZOOM,
      Math.min(BUILDING_LIGHT_CALIBRATION_MAX_ZOOM, Math.round(fit * 2) / 2 || 3));
  }

  const body = scene.textures.exists(t.textureKey)
    ? scene.add.image(centre.x, centre.y, t.textureKey)
    : null;
  if (body) {
    body.setOrigin(0.5, 0.5); // centred, so the whole building shows
    body.setDepth(buildingLightCalibrationDepth(-8));
  }
  const gfx = scene.add.graphics();
  gfx.setDepth(buildingLightCalibrationDepth(-6));

  const handles = {};
  [...BUILDING_LIGHT_CALIBRATION_CORNER_IDS, 'ent'].forEach((id) => {
    const dot = scene.add.circle(0, 0, 5.5, id === 'ent' ? 0xffce93 : 0x8fd6ff, 0.95);
    dot.setStrokeStyle(1.5, 0x0a0f18, 0.9);
    dot.setDepth(buildingLightCalibrationDepth(-4));
    dot.setInteractive({ useHandCursor: true, draggable: true });
    scene.input?.setDraggable?.(dot, true);
    dot.on('drag', (pointer, dx, dy) => onBuildingLightCalibrationHandleDrag(id, dx, dy));
    handles[id] = dot;
  });

  buildingLightCalibrationPreview = { body, gfx, handles, worldX: centre.x, worldY: centre.y };
  layoutBuildingLightCalibrationPreview();
}

// preview body drawn origin (0.5, 0.5) at (worldX, worldY), scaled by zoom.
function buildingLightCalibrationNormToWorld(nx, ny) {
  const p = buildingLightCalibrationPreview;
  const t = buildingLightCalibrationTarget;
  const z = buildingLightCalibrationZoom;
  return { x: p.worldX + (nx - 0.5) * t.texW * z, y: p.worldY + (ny - 0.5) * t.texH * z };
}
function buildingLightCalibrationWorldToNorm(wx, wy) {
  const p = buildingLightCalibrationPreview;
  const t = buildingLightCalibrationTarget;
  const z = buildingLightCalibrationZoom;
  return { nx: (wx - p.worldX) / (t.texW * z) + 0.5, ny: (wy - p.worldY) / (t.texH * z) + 0.5 };
}

function onBuildingLightCalibrationHandleDrag(id, dx, dy) {
  const data = buildingLightCalibrationCurrentData();
  if (!data) return;
  const n = buildingLightCalibrationWorldToNorm(dx, dy);
  if (id === 'ent') {
    data.ex = buildingLightCalibrationClamp01(n.nx);
    data.ey = buildingLightCalibrationClamp01(n.ny);
  } else {
    const panel = data.panels[buildingLightCalibrationPanelIndex];
    if (!panel) return;
    const idx = BUILDING_LIGHT_CALIBRATION_CORNER_IDS.indexOf(id);
    panel.c[idx] = [buildingLightCalibrationClamp01(n.nx), buildingLightCalibrationClamp01(n.ny)];
  }
  buildingLightCalibrationWriteData(data);
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
}

function layoutBuildingLightCalibrationPreview() {
  const p = buildingLightCalibrationPreview;
  const t = buildingLightCalibrationTarget;
  if (!p || !t) return;
  const z = buildingLightCalibrationZoom;
  const data = buildingLightCalibrationCurrentData();
  const profile = buildingLightCalibrationDataToProfile(data);
  if (p.body) p.body.setScale(z);

  const sp = data.panels[buildingLightCalibrationPanelIndex] || data.panels[0];

  // handles: 4 corners of the selected panel + entrance
  BUILDING_LIGHT_CALIBRATION_CORNER_IDS.forEach((id, i) => {
    const pt = sp.c[i];
    const w = buildingLightCalibrationNormToWorld(pt[0], pt[1]);
    p.handles[id]?.setPosition(w.x, w.y);
    p.handles[id]?.setVisible(true);
  });
  const ew = buildingLightCalibrationNormToWorld(data.ex, data.ey);
  p.handles.ent?.setPosition(ew.x, ew.y);
  p.handles.ent?.setVisible(!!data.entrance);

  const g = p.gfx;
  g.clear();

  // panel outlines
  data.panels.forEach((panel, pi) => {
    const sel = pi === buildingLightCalibrationPanelIndex;
    const pts = panel.c.map((c) => buildingLightCalibrationNormToWorld(c[0], c[1]));
    g.lineStyle(sel ? 1.8 : 1, sel ? 0x8fd6ff : 0x4a7f9c, panel.on ? (sel ? 0.75 : 0.4) : 0.18);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.strokePath();
  });

  // lit cells for the current bucket
  const cells = typeof computeLitBuildingWindows === 'function'
    ? computeLitBuildingWindows(profile, 1337, buildingLightCalibrationBucket, 3)
    : [];
  const warm = data.class === 'res' || data.class === 'ind';
  const col = warm ? 0xffcf87 : 0xdfe8ff;
  cells.forEach((cell) => {
    const w = buildingLightCalibrationNormToWorld(cell.nx, cell.ny);
    const cw = Math.max(2, cell.cellW * t.texW * z * 0.42);
    const ch = Math.max(2, cell.cellH * t.texH * z * 0.42);
    if (cell.on) {
      g.fillStyle(col, Math.min(0.95, cell.alpha));
      g.fillRect(w.x - cw, w.y - ch, cw * 2, ch * 2);
    } else {
      g.fillStyle(0xffffff, 0.045);
      g.fillRect(w.x - cw * 0.8, w.y - ch * 0.8, cw * 1.6, ch * 1.6);
    }
  });

  if (data.entrance) {
    g.fillStyle(0xffce93, 0.26);
    g.fillCircle(ew.x, ew.y, data.er * t.texW * z);
  }
}

// ---------------------------------------------------------------------------
// panel
// ---------------------------------------------------------------------------

function setBuildingLightCalibrationField(field, value) {
  const data = buildingLightCalibrationCurrentData();
  if (!data) return;
  data[field] = value;
  buildingLightCalibrationWriteData(data);
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
}

function stepBuildingLightCalibrationGrid(dim, delta) {
  const data = buildingLightCalibrationCurrentData();
  const panel = data?.panels?.[buildingLightCalibrationPanelIndex];
  if (!panel) return;
  panel[dim] = Math.max(1, panel[dim] + delta);
  buildingLightCalibrationWriteData(data);
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
}

function toggleBuildingLightCalibrationPanelOn() {
  const data = buildingLightCalibrationCurrentData();
  const panel = data?.panels?.[buildingLightCalibrationPanelIndex];
  if (!panel) return;
  panel.on = !panel.on;
  buildingLightCalibrationWriteData(data);
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
}

function resetBuildingLightCalibrationEntry() {
  const t = buildingLightCalibrationTarget;
  if (!t) return;
  delete buildingLightCalibrationOverrides[buildingLightCalibrationHeroMode ? '@' + t.spriteKey : t.family];
  persistBuildingLightCalibrationOverrides();
  layoutBuildingLightCalibrationPreview();
  renderBuildingLightCalibrationPanel();
  setBuildingLightCalibrationMessage('已還原預設', 'info');
}

function buildingLightCalibrationProfileLiteral(data, indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const rnd = buildingLightCalibrationRound;
  const panelLines = data.panels.map((p) => {
    const c = p.c.map((pt) => `[${rnd(pt[0])}, ${rnd(pt[1])}]`).join(', ');
    return `${inner}  { c: [${c}], rows: ${Math.round(p.rows)}, cols: ${Math.round(p.cols)}${p.on === false ? ', on: false' : ''} },`;
  });
  const parts = [`class: '${data.class}'`];
  if (data.entrance) parts.push(`ex: ${rnd(data.ex)}, ey: ${rnd(data.ey)}, er: ${rnd(data.er)}`);
  else parts.push('entrance: null');
  if (data.service) parts.push('service: true');
  if (data.hasSignage) parts.push('hasSignage: true');
  if (data.hasFloodlight) parts.push('hasFloodlight: true');
  return `makeBuildingLightProfile({\n${inner}${parts.join(', ')},\n${inner}panels: [\n${panelLines.join('\n')}\n${inner}],\n${pad}})`;
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
      + Object.entries(heroes).map(([k, v]) => `  '${k}': ${v},`).join('\n') + '\n};'
    : '// no hero overrides';
  return `// building-light-calibrator export · schema v${BUILDING_LIGHT_CALIBRATION_SCHEMA_VERSION}\n${famBlock}\n\n${heroBlock}`;
}

function copyBuildingLightCalibrationText(text, ok) {
  const p = typeof copyVisualRouteCalibrationText === 'function'
    ? copyVisualRouteCalibrationText(text) : Promise.reject();
  p.then(() => setBuildingLightCalibrationMessage(ok, 'success'))
    .catch(() => setBuildingLightCalibrationMessage('複製失敗', 'error'));
}

function createBuildingLightCalibrationPanel() {
  if (buildingLightCalibrationPanel) return buildingLightCalibrationPanel;
  if (typeof document === 'undefined' || !document.body) return null;
  if (!document.getElementById('building-light-calibrator-style')) {
    const style = document.createElement('style');
    style.id = 'building-light-calibrator-style';
    style.textContent = `
      #building-light-calibrator-panel{position:fixed;right:14px;bottom:18px;z-index:100000;
        width:min(330px,calc(100vw - 28px));box-sizing:border-box;padding:12px;
        border:1px solid rgba(143,214,255,.6);border-radius:12px;color:#eaf6ff;
        background:rgba(9,17,28,.95);box-shadow:0 14px 34px rgba(0,0,0,.5);
        font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;user-select:text;backdrop-filter:blur(8px)}
      #building-light-calibrator-panel[hidden]{display:none!important}
      #building-light-calibrator-panel .bl-title{font-weight:800;color:#8fd6ff;letter-spacing:.04em;margin-bottom:6px}
      #building-light-calibrator-panel .bl-hint{color:#a9c6da;margin-bottom:8px}
      #building-light-calibrator-panel .bl-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0}
      #building-light-calibrator-panel button{border:1px solid #3f7f9c;border-radius:7px;padding:6px 8px;
        color:#eaf6ff;background:#123243;font:inherit;cursor:pointer}
      #building-light-calibrator-panel button:hover{background:#1a4a62}
      #building-light-calibrator-panel button[data-active="true"]{background:#1f9d5c;border-color:#7ce8a8;color:#06210f}
      #building-light-calibrator-panel button[data-off="true"]{opacity:.5;text-decoration:line-through}
      #building-light-calibrator-panel .bl-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0}
      #building-light-calibrator-panel .bl-buckets{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin:6px 0}
      #building-light-calibrator-panel .bl-buckets button{padding:5px 2px;font-size:11px}
      #building-light-calibrator-panel .bl-step{display:flex;gap:4px;align-items:center}
      #building-light-calibrator-panel .bl-step b{min-width:2ch;text-align:center;color:#fff}
      #building-light-calibrator-panel select{background:#123243;color:#eaf6ff;border:1px solid #3f7f9c;border-radius:6px;padding:4px;font:inherit}
      #building-light-calibrator-panel .bl-flags label{display:flex;gap:5px;align-items:center;color:#a9c6da}
      #building-light-calibrator-panel .bl-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px}
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
    <div class="bl-title">夜間建築燈光校正</div>
    <div class="bl-hint">開選取器撳一棟樓;每個面 4 個藍角跟返 1:2 iso 斜度,橙點＝入口</div>
    <button type="button" class="bl-pick" data-action="pick">建築選取器:關</button>
    <div class="bl-row"><span class="bl-fam">(未選)</span></div>
    <div class="bl-grid2">
      <button type="button" data-mode="family">改 family 預設</button>
      <button type="button" data-mode="hero">只改呢個 model</button>
    </div>
    <div class="bl-grid2">
      <button type="button" data-face="0">左面</button>
      <button type="button" data-face="1">右面</button>
    </div>
    <div class="bl-row">
      <button type="button" data-action="panel-toggle" style="flex:1">呢個面:開</button>
    </div>
    <div class="bl-row">
      <span>類別</span>
      <select class="bl-class">
        <option value="res">住宅 (暖)</option>
        <option value="off">辦公 (冷白)</option>
        <option value="ind">工業 (暗黃)</option>
        <option value="svc">服務 (通宵)</option>
      </select>
    </div>
    <div class="bl-row">
      <span>窗格 (呢個面)</span>
      <span class="bl-step"><button data-grid="rows-">−</button><b class="bl-rows">8</b><button data-grid="rows+">+</button>
        &nbsp;行&nbsp;<button data-grid="cols-">−</button><b class="bl-cols">5</b><button data-grid="cols+">+</button>列</span>
    </div>
    <div class="bl-flags">
      <label><input type="checkbox" class="bl-ent"> 入口燈</label>
      <label><input type="checkbox" class="bl-svc"> 通宵服務 floor</label>
      <label><input type="checkbox" class="bl-sig"> 招牌 (v1.1)</label>
      <label><input type="checkbox" class="bl-flood"> 地面投光 (v1.1)</label>
    </div>
    <div class="bl-buckets">
      <button data-bucket="duskRamp">黃昏</button>
      <button data-bucket="eveningPeak">晚高峰</button>
      <button data-bucket="lateEvening">晚間</button>
      <button data-bucket="deepNight">深夜</button>
      <button data-bucket="dawnFade">天光</button>
    </div>
    <div class="bl-row"><span>放大</span><span class="bl-step">
      <button data-zoom="-1">−</button><b class="bl-zoom">3×</b><button data-zoom="1">+</button></span></div>
    <div class="bl-actions">
      <button type="button" data-action="reset">還原</button>
      <button type="button" data-action="copy">複製 JS</button>
      <button type="button" data-action="close">收起</button>
    </div>
    <div class="bl-msg"></div>
  `;
  document.body.appendChild(root);

  root.querySelector('[data-action="pick"]').addEventListener('click', () => {
    buildingLightCalibrationPickerOn = !buildingLightCalibrationPickerOn;
    renderBuildingLightCalibrationPanel();
    setBuildingLightCalibrationMessage(buildingLightCalibrationPickerOn ? '撳一棟建築' : '選取器已關', 'info');
  });
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    buildingLightCalibrationHeroMode = b.dataset.mode === 'hero';
    layoutBuildingLightCalibrationPreview();
    renderBuildingLightCalibrationPanel();
  }));
  root.querySelectorAll('[data-face]').forEach((b) => b.addEventListener('click', () => {
    buildingLightCalibrationPanelIndex = Number(b.dataset.face);
    layoutBuildingLightCalibrationPreview();
    renderBuildingLightCalibrationPanel();
  }));
  root.querySelector('[data-action="panel-toggle"]').addEventListener('click', toggleBuildingLightCalibrationPanelOn);
  root.querySelector('.bl-class').addEventListener('change', (e) => setBuildingLightCalibrationField('class', e.target.value));
  root.querySelectorAll('[data-grid]').forEach((b) => b.addEventListener('click', () => {
    const op = b.dataset.grid;
    stepBuildingLightCalibrationGrid(op.startsWith('rows') ? 'rows' : 'cols', op.endsWith('+') ? 1 : -1);
  }));
  root.querySelector('.bl-ent').addEventListener('change', (e) => setBuildingLightCalibrationField('entrance', e.target.checked));
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
  root.querySelector('[data-action="reset"]').addEventListener('click', resetBuildingLightCalibrationEntry);
  root.querySelector('[data-action="copy"]').addEventListener('click', () => {
    copyBuildingLightCalibrationText(buildBuildingLightCalibrationRecord(), '已複製 JS');
  });
  root.querySelector('[data-action="close"]').addEventListener('click', teardownBuildingLightCalibrator);

  buildingLightCalibrationPanel = {
    root, fam: root.querySelector('.bl-fam'), pick: root.querySelector('.bl-pick'),
    msg: root.querySelector('.bl-msg'),
  };
  return buildingLightCalibrationPanel;
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
  panel.pick.textContent = `建築選取器:${buildingLightCalibrationPickerOn ? '開' : '關'}`;
  panel.pick.dataset.active = String(buildingLightCalibrationPickerOn);

  const t = buildingLightCalibrationTarget;
  const data = buildingLightCalibrationCurrentData();
  panel.fam.textContent = t
    ? `${t.family} · ${buildingLightCalibrationHeroMode ? 'hero:' + t.spriteKey : 'family'} · ${data.__custom ? '已校正' : '預設'}`
    : '(未選)';
  r.querySelectorAll('[data-mode]').forEach((b) => {
    b.dataset.active = String((b.dataset.mode === 'hero') === buildingLightCalibrationHeroMode);
  });
  r.querySelectorAll('[data-face]').forEach((b) => {
    const i = Number(b.dataset.face);
    b.dataset.active = String(i === buildingLightCalibrationPanelIndex);
    b.dataset.off = String(data && data.panels[i] && data.panels[i].on === false);
  });
  r.querySelectorAll('[data-bucket]').forEach((b) => {
    b.dataset.active = String(b.dataset.bucket === buildingLightCalibrationBucket);
  });
  r.querySelector('.bl-zoom').textContent = `${buildingLightCalibrationZoom}×`;
  if (data) {
    const sp = data.panels[buildingLightCalibrationPanelIndex] || data.panels[0];
    r.querySelector('[data-action="panel-toggle"]').textContent = `呢個面:${sp.on === false ? '關' : '開'}`;
    r.querySelector('.bl-class').value = data.class;
    r.querySelector('.bl-rows').textContent = Math.round(sp.rows);
    r.querySelector('.bl-cols').textContent = Math.round(sp.cols);
    r.querySelector('.bl-ent').checked = !!data.entrance;
    r.querySelector('.bl-svc').checked = !!data.service;
    r.querySelector('.bl-sig').checked = !!data.hasSignage;
    r.querySelector('.bl-flood').checked = !!data.hasFloodlight;
  }
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

function startBuildingLightCalibrator(scene) {
  buildingLightCalibrationActive = true;
  buildingLightCalibrationScene = scene;
  if (scene) scene.buildingLightCalibrationActive = true;
  createBuildingLightCalibrationPanel();
  renderBuildingLightCalibrationPanel();
  setBuildingLightCalibrationMessage('開「選取器」再撳一棟建築', 'info');
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
      buildingLightCalibrationClamp01(pt[0] + dx),
      buildingLightCalibrationClamp01(pt[1] + dy),
    ]);
    buildingLightCalibrationWriteData(data);
    layoutBuildingLightCalibrationPreview();
    renderBuildingLightCalibrationPanel();
  };
  globalThis.addEventListener?.('keydown', buildingLightCalibrationKeyHandler);
}

function teardownBuildingLightCalibrator() {
  buildingLightCalibrationActive = false;
  buildingLightCalibrationPickerOn = false;
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
  });
}
