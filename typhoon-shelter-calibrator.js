// 避風塘素材校準 (test-mode dev tool, Phase 0): checks and calibrates how the sea assets stand on
// the map - footprint, facing, ground fit - in all four map rotations.
//
// A side panel, so the map stays in view. 「擺代表場景」 puts the representative set on open water
// near the middle of the screen (fishing boats facing all four ways, a stone pier against the
// shore, a breakwater section and its lighthouse head); these are tool-only sprites, never saved
// with the city, and are removed when the tool closes. The overlay draws each footprint, green
// where its surface is legal and red (with the reason in the list) where not. ⟲ ⟳ turn the map.
//
// The editor shows a texture with its ground corners (left / front / right, where the object
// meets the water): drag them onto the art and the sprites on the map refit at once. Facing and
// real size (length, or height for small props; one tile is 20 m) are edited here too - the
// footprint follows from the size. 「儲存」 writes
// data/typhoon-shelter-placement.json (dev launches only).

const TYPHOON_SHELTER_CALIBRATION_API = '/api/dev/typhoon-shelter-placement';
const TYPHOON_SHELTER_CALIBRATION_GAP = 1; // free tiles kept round each sample object

let typhoonShelterCalibrationActive = false;
let typhoonShelterCalibrationScene = null;
let typhoonShelterCalibrationDom = null;
let typhoonShelterCalibrationOverlay = null;
let typhoonShelterCalibrationShowFootprints = true;
let typhoonShelterCalibrationEdit = { objectId: 'fishingBoat3', partId: 'fishingBoat3_a' };
let typhoonShelterCalibrationImage = null; // { partId, img, W, H, data }
let typhoonShelterCalibrationDrag = null;
let typhoonShelterCalibrationWasPaused = false;
let typhoonShelterCalibrationDirty = false;

const TYPHOON_SHELTER_CALIBRATION_SCENE = Object.freeze([
  { objectId: 'fishingBoat3', facings: ['e'] },
  { objectId: 'fishingBoat3', facings: ['s'] },
  { objectId: 'fishingBoat3', facings: ['w'] },
  { objectId: 'fishingBoat3', facings: ['n'] },
  { objectId: 'fishingBoat4', facings: ['e'] },
  { objectId: 'fishingBoat4', facings: ['s'] },
  { objectId: 'causeway1', facings: ['e'] },
  { objectId: 'causeway2', facings: ['e'] },
  { objectId: 'pierSet1', facings: ['e', 's', 'w', 'n'] },
  { objectId: 'sanpan1', facings: ['e'] },
  { objectId: 'sanpan2', facings: ['s'] },
]);

// ---------------------------------------------------------------------------
// representative scene
// ---------------------------------------------------------------------------

function typhoonShelterCalibrationCenterTile(scene) {
  const cam = scene.cameras.main;
  const wx = cam.scrollX + cam.width / (2 * cam.zoom) - scene.offsetX;
  const wy = cam.scrollY + cam.height / (2 * cam.zoom) - scene.offsetY + BUILDING_SURFACE_Y_OFFSET + TILE_HEIGHT / 2;
  const iso = screenToIso(wx, wy);
  return { row: Math.round(iso.y), col: Math.round(iso.x) };
}

// Placement legal, and no other sample within the gap.
function typhoonShelterCalibrationSpotFree(scene, objectId, row, col, facing) {
  if (!checkTyphoonShelterPlacement(scene, objectId, row, col, facing).ok) return false;
  const fp = getTyphoonShelterObjectFootprint(objectId, facing);
  const g = TYPHOON_SHELTER_CALIBRATION_GAP;
  for (const rec of [...(scene.typhoonShelterObjects?.values() || [])].filter((r) => r.tag === 'calibration')) {
    for (const [r, c] of rec.tiles) {
      if (r >= row - g && r < row + fp.rows + g && c >= col - g && c < col + fp.cols + g) return false;
    }
  }
  return true;
}

async function placeTyphoonShelterCalibrationScene() {
  const scene = typhoonShelterCalibrationScene;
  if (!scene) return;
  clearTyphoonShelterObjects(scene, 'calibration');
  await loadTyphoonShelterPlacement();
  const centre = typhoonShelterCalibrationCenterTile(scene);
  const radius = 28;
  // tiles nearest the centre first
  const spots = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) spots.push([centre.row + dr, centre.col + dc, dr * dr + dc * dc]);
  }
  spots.sort((a, b) => a[2] - b[2]);
  const missing = [];
  let variant = 0;
  for (const item of TYPHOON_SHELTER_CALIBRATION_SCENE) {
    let placed = false;
    for (const [row, col] of spots) {
      const facing = item.facings.find((f) => typhoonShelterCalibrationSpotFree(scene, item.objectId, row, col, f));
      if (!facing) continue;
      // eslint-disable-next-line no-await-in-loop
      await addTyphoonShelterObject(scene, { objectId: item.objectId, row, col, facing, variant: variant++, tag: 'calibration' });
      placed = true;
      break;
    }
    if (!placed) missing.push(TYPHOON_SHELTER_OBJECTS_BY_ID[item.objectId].label);
  }
  drawTyphoonShelterCalibrationOverlay();
  renderTyphoonShelterCalibrationPanel();
  setTyphoonShelterCalibrationMessage(missing.length
    ? `附近搵唔到位放：${missing.join('、')}（將鏡頭移去近岸大片海面再擺）`
    : '已擺好。用 ⟲ ⟳ 轉地圖，檢查四個方向。', missing.length ? 'error' : 'success');
}

// ---------------------------------------------------------------------------
// overlay
// ---------------------------------------------------------------------------

function drawTyphoonShelterCalibrationOverlay() {
  const scene = typhoonShelterCalibrationScene;
  if (!scene) return;
  if (!typhoonShelterCalibrationOverlay) {
    typhoonShelterCalibrationOverlay = scene.add.graphics();
    typhoonShelterCalibrationOverlay.setDepth(typeof getPreviewOverlayDepth === 'function' ? getPreviewOverlayDepth(5) : 1e6);
  }
  const g = typhoonShelterCalibrationOverlay;
  g.clear();
  if (!typhoonShelterCalibrationShowFootprints) return;
  scene.typhoonShelterObjects?.forEach((rec) => {
    if (!rec.diamond) return;
    const check = checkTyphoonShelterPlacement(scene, rec.objectId, rec.row, rec.col, rec.facing, rec.id);
    const color = check.ok ? 0x39d353 : 0xff3b30;
    const d = rec.diamond;
    const pts = [d.left, d.front, d.right, d.back].map((p) => ({ x: p[0] + scene.offsetX, y: p[1] + scene.offsetY }));
    g.lineStyle(2, color, 0.95);
    g.strokePoints(pts, true);
    g.fillStyle(color, 0.12);
    g.fillPoints(pts, true);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(pts[1].x, pts[1].y, 3);
  });
}

// ---------------------------------------------------------------------------
// editor
// ---------------------------------------------------------------------------

function typhoonShelterCalibrationPart() {
  const { partId } = typhoonShelterCalibrationEdit;
  const data = getTyphoonShelterPlacement();
  if (!data.parts[partId]) data.parts[partId] = { ground: null, facing: 'se', auto: true };
  return data.parts[partId];
}

function typhoonShelterCalibrationDetect(imageData, W, H) {
  const outline = proposeTyphoonShelterGroundCorners(imageData, W, H);
  const lot = typeof detectBuildingGroundCorners === 'function'
    ? detectBuildingGroundCorners(imageData, W, H, { channels: 4 }) : null;
  if (lot?.confident && outline && (lot.right[0] - lot.left[0]) >= 0.75 * (outline.right[0] - outline.left[0])) {
    return { left: lot.left, front: lot.front, right: lot.right };
  }
  return outline;
}

function loadTyphoonShelterCalibrationImage(partId) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    typhoonShelterCalibrationImage = {
      partId, img, W: c.width, H: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data,
    };
    renderTyphoonShelterCalibrationEditor();
  };
  img.onerror = () => setTyphoonShelterCalibrationMessage(`載入唔到 ts_${partId}.png`, 'error');
  img.src = `/api/dev/typhoon-shelter-texture/ts_${encodeURIComponent(partId)}.png?v=${Date.now()}`;
}

// Canvas view of the texture: the solid bounds fitted into the canvas.
function typhoonShelterCalibrationView() {
  const im = typhoonShelterCalibrationImage;
  const canvas = typhoonShelterCalibrationDom?.canvas;
  if (!im || !canvas) return null;
  let minX = im.W; let minY = im.H; let maxX = 0; let maxY = 0;
  for (let y = 0; y < im.H; y += 2) {
    for (let x = 0; x < im.W; x += 2) {
      if (im.data[(y * im.W + x) * 4 + 3] > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 30;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const s = Math.min(canvas.width / (maxX - minX), canvas.height / (maxY - minY));
  return { s, ox: (canvas.width - (maxX - minX) * s) / 2 - minX * s, oy: (canvas.height - (maxY - minY) * s) / 2 - minY * s };
}

function renderTyphoonShelterCalibrationEditor() {
  const dom = typhoonShelterCalibrationDom;
  const im = typhoonShelterCalibrationImage;
  if (!dom) return;
  const ctx = dom.canvas.getContext('2d');
  ctx.fillStyle = '#123049';
  ctx.fillRect(0, 0, dom.canvas.width, dom.canvas.height);
  if (!im || im.partId !== typhoonShelterCalibrationEdit.partId) return;
  const v = typhoonShelterCalibrationView();
  ctx.drawImage(im.img, v.ox, v.oy, im.W * v.s, im.H * v.s);
  const part = typhoonShelterCalibrationPart();
  if (!part.ground) return;
  const P = ([x, y]) => [v.ox + x * v.s, v.oy + y * v.s];
  const { left, front, right } = part.ground;
  const back = [left[0] + right[0] - front[0], left[1] + right[1] - front[1]];
  ctx.beginPath();
  [left, front, right, back].map(P).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,230,90,0.95)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  [['left', '#39d353'], ['front', '#ff3b30'], ['right', '#3b9dff']].forEach(([k, color]) => {
    const [x, y] = P(part.ground[k]);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  });
}

function onTyphoonShelterCalibrationCanvasDown(ev) {
  const v = typhoonShelterCalibrationView();
  const part = typhoonShelterCalibrationPart();
  if (!v || !part.ground) return;
  const rect = typhoonShelterCalibrationDom.canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (typhoonShelterCalibrationDom.canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (typhoonShelterCalibrationDom.canvas.height / rect.height);
  let hit = null;
  ['left', 'front', 'right'].forEach((k) => {
    const [px, py] = part.ground[k];
    if (Math.hypot(v.ox + px * v.s - x, v.oy + py * v.s - y) < 10) hit = k;
  });
  if (hit) { typhoonShelterCalibrationDrag = hit; ev.preventDefault(); }
}

function onTyphoonShelterCalibrationCanvasMove(ev) {
  if (!typhoonShelterCalibrationDrag) return;
  const v = typhoonShelterCalibrationView();
  const rect = typhoonShelterCalibrationDom.canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (typhoonShelterCalibrationDom.canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (typhoonShelterCalibrationDom.canvas.height / rect.height);
  const part = typhoonShelterCalibrationPart();
  part.ground = { ...part.ground, [typhoonShelterCalibrationDrag]: [Math.round((x - v.ox) / v.s * 10) / 10, Math.round((y - v.oy) / v.s * 10) / 10] };
  part.auto = false;
  typhoonShelterCalibrationChanged();
}

function onTyphoonShelterCalibrationCanvasUp() { typhoonShelterCalibrationDrag = null; }

function typhoonShelterCalibrationChanged() {
  typhoonShelterCalibrationDirty = true;
  refreshAllTyphoonShelterSprites(typhoonShelterCalibrationScene);
  drawTyphoonShelterCalibrationOverlay();
  renderTyphoonShelterCalibrationEditor();
  renderTyphoonShelterCalibrationPanel();
}

async function saveTyphoonShelterCalibration() {
  const data = getTyphoonShelterPlacement();
  try {
    const res = await fetch(TYPHOON_SHELTER_CALIBRATION_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: data.parts, objects: data.objects }),
    });
    if (!res.ok) throw new Error(String(res.status));
    typhoonShelterCalibrationDirty = false;
    setTyphoonShelterCalibrationMessage('已寫入 data/typhoon-shelter-placement.json', 'success');
  } catch {
    setTyphoonShelterCalibrationMessage('寫入失敗（只喺開發版可以儲存）', 'error');
  }
  renderTyphoonShelterCalibrationPanel();
}

// ---------------------------------------------------------------------------
// panel
// ---------------------------------------------------------------------------

function createTyphoonShelterCalibrationDom() {
  if (typhoonShelterCalibrationDom) return typhoonShelterCalibrationDom;
  if (!document.getElementById('tscal-style')) {
    const style = document.createElement('style');
    style.id = 'tscal-style';
    style.textContent = `
      #tscal-panel{position:fixed;top:64px;right:12px;bottom:12px;width:372px;z-index:190000;overflow-y:auto;
        background:rgba(9,17,28,.96);border:1px solid #33475f;border-radius:12px;padding:10px 12px;
        font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#eaf6ff;box-shadow:0 18px 50px rgba(0,0,0,.5)}
      #tscal-panel[hidden]{display:none!important}
      #tscal-panel h4{font-weight:800;color:#8fd6ff;margin:10px 0 6px}
      #tscal-panel h4:first-child{margin-top:0}
      #tscal-panel button{border:1px solid #3f7f9c;border-radius:7px;padding:4px 7px;color:#eaf6ff;background:#123243;font:inherit;cursor:pointer}
      #tscal-panel button:hover{background:#1a4a62}
      #tscal-panel button[data-active="true"]{background:#1f9d5c;border-color:#7ce8a8;color:#06210f}
      #tscal-panel select{background:#123243;color:#eaf6ff;border:1px solid #3f7f9c;border-radius:6px;padding:3px;font:inherit}
      #tscal-panel .ts-row{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin:5px 0}
      #tscal-panel .ts-list div{padding:3px 4px;border-radius:5px;cursor:pointer;color:#a9c6da}
      #tscal-panel .ts-list div:hover{background:#16324a}
      #tscal-panel .ts-list .bad{color:#ff9a9a}
      #tscal-panel canvas{width:100%;border-radius:8px;cursor:crosshair;display:block}
      #tscal-panel .ts-msg{min-height:15px;margin-top:8px;color:#a9c6da}
      #tscal-panel .ts-msg[data-tone="success"]{color:#9be89b}
      #tscal-panel .ts-msg[data-tone="error"]{color:#ff9a9a}
      #tscal-panel .ts-note{color:#6f8ea6}
    `;
    document.head.appendChild(style);
  }
  const panel = document.createElement('div');
  panel.id = 'tscal-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <h4>避風塘素材校準 · Phase 0 <button type="button" class="ts-close" style="float:right">✕</button></h4>
    <div class="ts-row">
      <button type="button" class="ts-place">擺代表場景</button>
      <button type="button" class="ts-clear">清除</button>
      <button type="button" class="ts-overlay">顯示佔地</button>
    </div>
    <div class="ts-row">地圖方向 <button type="button" class="ts-rot" data-step="-1">⟲</button>
      <button type="button" class="ts-rot" data-step="1">⟳</button> <b class="ts-compass"></b></div>
    <div class="ts-list"></div>
    <h4>編輯</h4>
    <div class="ts-row"><select class="ts-object" style="flex:1"></select></div>
    <div class="ts-row"><select class="ts-part" style="flex:1"></select>
      <span>正面</span><select class="ts-facing"><option>se</option><option>sw</option><option>nw</option><option>ne</option></select></div>
    <div class="ts-row">實際<span class="ts-size-kind"></span>
      <button type="button" data-size="-1">−</button><b class="ts-size"></b> m<button type="button" data-size="1">+</button>
      <span class="ts-note">（一格 20 m）</span></div>
    <div class="ts-row ts-note ts-metres"></div>
    <canvas class="ts-canvas" width="348" height="260"></canvas>
    <div class="ts-note">拖綠／紅／藍點去模型落水（或落地）嘅左角／前角／右角。</div>
    <div class="ts-row"><button type="button" class="ts-auto">自動建議</button><button type="button" class="ts-save">儲存</button></div>
    <div class="ts-msg"></div>`;
  document.body.appendChild(panel);
  const objectSel = panel.querySelector('.ts-object');
  TYPHOON_SHELTER_CATEGORIES.forEach(([cat, label]) => {
    const group = document.createElement('optgroup');
    group.label = label;
    TYPHOON_SHELTER_OBJECTS.filter((o) => o.category === cat).forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.verified ? '★ ' : ''}${o.label}`;
      group.appendChild(opt);
    });
    objectSel.appendChild(group);
  });
  typhoonShelterCalibrationDom = {
    panel,
    list: panel.querySelector('.ts-list'),
    object: objectSel,
    part: panel.querySelector('.ts-part'),
    facing: panel.querySelector('.ts-facing'),
    canvas: panel.querySelector('.ts-canvas'),
    msg: panel.querySelector('.ts-msg'),
  };
  panel.querySelector('.ts-close').addEventListener('click', teardownTyphoonShelterCalibrator);
  panel.querySelector('.ts-place').addEventListener('click', () => { placeTyphoonShelterCalibrationScene(); });
  panel.querySelector('.ts-clear').addEventListener('click', () => {
    clearTyphoonShelterObjects(typhoonShelterCalibrationScene, 'calibration');
    drawTyphoonShelterCalibrationOverlay();
    renderTyphoonShelterCalibrationPanel();
  });
  panel.querySelector('.ts-overlay').addEventListener('click', () => {
    typhoonShelterCalibrationShowFootprints = !typhoonShelterCalibrationShowFootprints;
    drawTyphoonShelterCalibrationOverlay();
    renderTyphoonShelterCalibrationPanel();
  });
  panel.querySelectorAll('.ts-rot').forEach((b) => b.addEventListener('click', () => {
    if (typeof rotateMap === 'function') rotateMap(typhoonShelterCalibrationScene, Number(b.dataset.step));
    drawTyphoonShelterCalibrationOverlay();
    renderTyphoonShelterCalibrationPanel();
  }));
  objectSel.addEventListener('change', () => selectTyphoonShelterCalibrationObject(objectSel.value));
  typhoonShelterCalibrationDom.part.addEventListener('change', (e) => selectTyphoonShelterCalibrationPart(e.target.value));
  typhoonShelterCalibrationDom.facing.addEventListener('change', (e) => {
    const part = typhoonShelterCalibrationPart();
    part.facing = e.target.value;
    part.auto = false;
    typhoonShelterCalibrationChanged();
  });
  panel.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
    const obj = TYPHOON_SHELTER_OBJECTS_BY_ID[typhoonShelterCalibrationEdit.objectId];
    const data = getTyphoonShelterPlacement();
    const size = getTyphoonShelterObjectSize(obj.id);
    const key = size.lengthM ? 'lengthM' : 'heightM';
    // small props step by 0.1 m, everything else by 1 m
    const step = size[key] < 3 ? 0.1 : 1;
    const next = Math.max(step, Math.round((size[key] + Number(b.dataset.size) * step) * 10) / 10);
    data.objects[obj.id] = { [key]: next };
    typhoonShelterCalibrationChanged();
  }));
  panel.querySelector('.ts-auto').addEventListener('click', () => {
    const im = typhoonShelterCalibrationImage;
    if (!im || im.partId !== typhoonShelterCalibrationEdit.partId) return;
    const part = typhoonShelterCalibrationPart();
    part.ground = typhoonShelterCalibrationDetect(im.data, im.W, im.H);
    part.auto = true;
    typhoonShelterCalibrationChanged();
  });
  panel.querySelector('.ts-save').addEventListener('click', saveTyphoonShelterCalibration);
  const canvas = typhoonShelterCalibrationDom.canvas;
  canvas.addEventListener('pointerdown', onTyphoonShelterCalibrationCanvasDown);
  window.addEventListener('pointermove', onTyphoonShelterCalibrationCanvasMove);
  window.addEventListener('pointerup', onTyphoonShelterCalibrationCanvasUp);
  return typhoonShelterCalibrationDom;
}

function selectTyphoonShelterCalibrationObject(objectId) {
  const obj = TYPHOON_SHELTER_OBJECTS_BY_ID[objectId];
  if (!obj) return;
  typhoonShelterCalibrationEdit = { objectId, partId: Object.keys(obj.parts)[0] };
  selectTyphoonShelterCalibrationPart(typhoonShelterCalibrationEdit.partId);
}

function selectTyphoonShelterCalibrationPart(partId) {
  typhoonShelterCalibrationEdit = { ...typhoonShelterCalibrationEdit, partId };
  loadTyphoonShelterCalibrationImage(partId);
  renderTyphoonShelterCalibrationPanel();
  renderTyphoonShelterCalibrationEditor();
}

function setTyphoonShelterCalibrationMessage(text, tone = 'info') {
  if (!typhoonShelterCalibrationDom) return;
  typhoonShelterCalibrationDom.msg.textContent = text;
  typhoonShelterCalibrationDom.msg.dataset.tone = tone;
}

function renderTyphoonShelterCalibrationPanel() {
  const dom = typhoonShelterCalibrationDom;
  const scene = typhoonShelterCalibrationScene;
  if (!dom || !scene) return;
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  dom.panel.querySelector('.ts-compass').textContent = ['↑ 北', '← 西', '↓ 南', '→ 東'][rotation];
  dom.panel.querySelector('.ts-overlay').dataset.active = String(typhoonShelterCalibrationShowFootprints);
  const rows = [];
  scene.typhoonShelterObjects?.forEach((rec) => {
    const obj = TYPHOON_SHELTER_OBJECTS_BY_ID[rec.objectId];
    const check = checkTyphoonShelterPlacement(scene, rec.objectId, rec.row, rec.col, rec.facing, rec.id);
    const div = document.createElement('div');
    const tex = rec.choice ? `${rec.choice.partId}${rec.choice.mirrored ? '_m' : ''}` : '—';
    const match = rec.choice?.match === 'exact' ? '' : rec.choice?.match === 'axis' ? ' ⚠反向' : ' ⚠';
    div.textContent = `${obj.label} 向${rec.facing.toUpperCase()}→${rec.screenFacing} ${rec.footprint.cols}×${rec.footprint.rows} ${tex}${match}${check.ok ? '' : ` ✗ ${check.reasons.join('、')}`}`;
    if (!check.ok) div.className = 'bad';
    div.addEventListener('click', () => {
      selectTyphoonShelterCalibrationObject(rec.objectId);
      if (rec.choice) selectTyphoonShelterCalibrationPart(rec.choice.partId);
    });
    rows.push(div);
  });
  dom.list.replaceChildren(...rows);
  const obj = TYPHOON_SHELTER_OBJECTS_BY_ID[typhoonShelterCalibrationEdit.objectId];
  dom.object.value = obj.id;
  if (dom.part.dataset.object !== obj.id) {
    dom.part.replaceChildren(...Object.keys(obj.parts).map((id) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id;
      return o;
    }));
    dom.part.dataset.object = obj.id;
  }
  dom.part.value = typhoonShelterCalibrationEdit.partId;
  const part = typhoonShelterCalibrationPart();
  dom.facing.value = part.facing || obj.parts[typhoonShelterCalibrationEdit.partId] || 'se';
  const size = getTyphoonShelterObjectSize(obj.id) || {};
  dom.panel.querySelector('.ts-size-kind').textContent = size.lengthM ? '長度' : '高度';
  dom.panel.querySelector('.ts-size').textContent = size.lengthM ?? size.heightM ?? '—';
  const metres = getTyphoonShelterObjectMetres(obj.id);
  const fp = getTyphoonShelterObjectFootprint(obj.id, 'e');
  dom.panel.querySelector('.ts-metres').textContent = metres
    ? `長 ${metres.alongM} × 闊 ${metres.acrossM} × 高 ${metres.heightM ?? '?'} m → 佔地 ${fp.depth}×${fp.width} 格`
    : '未有落水角';
  dom.panel.querySelector('.ts-save').textContent = typhoonShelterCalibrationDirty ? '儲存 *' : '儲存';
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

async function startTyphoonShelterCalibrator(scene) {
  typhoonShelterCalibrationActive = true;
  typhoonShelterCalibrationScene = scene;
  typhoonShelterCalibrationWasPaused = typeof isSimPaused === 'function' ? isSimPaused() : false;
  if (typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') setGameSpeed(GAME_SPEEDS.PAUSED);
  createTyphoonShelterCalibrationDom();
  typhoonShelterCalibrationDom.panel.hidden = false;
  await loadTyphoonShelterPlacement(true);
  selectTyphoonShelterCalibrationObject(typhoonShelterCalibrationEdit.objectId);
  setTyphoonShelterCalibrationMessage('將鏡頭對住近岸海面，撳「擺代表場景」。');
}

function teardownTyphoonShelterCalibrator() {
  typhoonShelterCalibrationActive = false;
  const scene = typhoonShelterCalibrationScene;
  if (scene) clearTyphoonShelterObjects(scene, 'calibration');
  typhoonShelterCalibrationOverlay?.destroy();
  typhoonShelterCalibrationOverlay = null;
  if (typhoonShelterCalibrationDom) typhoonShelterCalibrationDom.panel.hidden = true;
  if (!typhoonShelterCalibrationWasPaused && typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') {
    setGameSpeed(GAME_SPEEDS.NORMAL);
  }
}

function toggleTyphoonShelterCalibrator(scene) {
  if (typhoonShelterCalibrationActive) { teardownTyphoonShelterCalibrator(); return false; }
  if (!scene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
    || !isVisualRouteCalibrationTestModeEnabled()) return false;
  startTyphoonShelterCalibrator(scene);
  return true;
}

function isTyphoonShelterCalibrationActive() { return typhoonShelterCalibrationActive; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toggleTyphoonShelterCalibrator, isTyphoonShelterCalibrationActive };
}
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleTyphoonShelterCalibrator, teardownTyphoonShelterCalibrator, isTyphoonShelterCalibrationActive,
    placeTyphoonShelterCalibrationScene,
  });
}
