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

// The ground as the game reads it: fitTyphoonShelterGround and measureTyphoonShelterArt use only
// the front corner and the side corners' x, the sides lying on the 2:1 isometric lines through the
// front. The editor shows and stores exactly that, so a side point dragged up or down slides along
// its line instead of moving to a place the game would ignore.
function typhoonShelterCalibrationIsoGround(ground) {
  if (!ground) return null;
  const [fx, fy] = ground.front;
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    left: [ground.left[0], r1(fy - (fx - ground.left[0]) / 2)],
    front: [fx, fy],
    right: [ground.right[0], r1(fy - (ground.right[0] - fx) / 2)],
  };
}

// The art as the game draws it: the day texture through the part's warp (x:y and shear about the
// ground's front corner), on an offscreen canvas. Ground corners are stored in the unwarped
// texture's pixels; toDisplay / toBase convert. Cached per part, warp and front corner.
function typhoonShelterCalibrationDisplay() {
  const im = typhoonShelterCalibrationImage;
  const part = typhoonShelterCalibrationPart();
  if (!im || im.partId !== typhoonShelterCalibrationEdit.partId) return null;
  const warp = normalizeTyphoonShelterWarp(part.warp);
  const front = part.ground?.front || [im.W / 2, im.H];
  const stamp = `${warp.k}|${warp.s}|${warp.h}|${front.join(',')}`;
  if (im.display?.stamp === stamp) return im.display;
  let canvas = im.img;
  let box = { dx: 0, dy: 0, width: im.W, height: im.H };
  let solid = typhoonShelterCalibrationSolidBounds();
  if (!isTyphoonShelterWarpIdentity(warp)) {
    box = getTyphoonShelterWarpCanvas(im.W, im.H, front, warp);
    canvas = document.createElement('canvas');
    canvas.width = box.width;
    canvas.height = box.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(...getTyphoonShelterWarpTransform(front, warp, box));
    ctx.drawImage(im.img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    solid = typhoonShelterCalibrationBounds(ctx.getImageData(0, 0, box.width, box.height).data, box.width, box.height);
  }
  im.display = {
    stamp, canvas, W: box.width, H: box.height, solid, warp, front,
    toDisplay: (pt) => { const [x, y] = warpTyphoonShelterPoint(pt, front, warp); return [x + box.dx, y + box.dy]; },
    toBase: ([x, y]) => unwarpTyphoonShelterPoint([x - box.dx, y - box.dy], front, warp),
  };
  return im.display;
}

// The ground and top as drawn: warped, then the sides put on the isometric lines.
function typhoonShelterCalibrationDisplayGround(display, part) {
  if (!display || !part.ground) return null;
  const g = part.ground;
  const ground = typhoonShelterCalibrationIsoGround({
    left: display.toDisplay(g.left), front: display.toDisplay(g.front), right: display.toDisplay(g.right),
  });
  if (Number.isFinite(part.top)) ground.top = display.toDisplay([g.front[0], part.top])[1];
  return ground;
}

// Canvas view of the drawn art: its solid bounds fitted into the canvas.
function typhoonShelterCalibrationView() {
  const display = typhoonShelterCalibrationDisplay();
  const canvas = typhoonShelterCalibrationDom?.canvas;
  if (!display || !canvas) return null;
  const pad = 30;
  const minX = display.solid.minX - pad; const minY = display.solid.minY - pad;
  const maxX = display.solid.maxX + pad; const maxY = display.solid.maxY + pad;
  const s = Math.min(canvas.width / (maxX - minX), canvas.height / (maxY - minY));
  return { s, ox: (canvas.width - (maxX - minX) * s) / 2 - minX * s, oy: (canvas.height - (maxY - minY) * s) / 2 - minY * s };
}

function renderTyphoonShelterCalibrationEditor() {
  const dom = typhoonShelterCalibrationDom;
  if (!dom) return;
  const ctx = dom.canvas.getContext('2d');
  ctx.fillStyle = '#123049';
  ctx.fillRect(0, 0, dom.canvas.width, dom.canvas.height);
  renderTyphoonShelterCalibrationPreview();
  const display = typhoonShelterCalibrationDisplay();
  if (!display) return;
  const v = typhoonShelterCalibrationView();
  ctx.drawImage(display.canvas, v.ox, v.oy, display.W * v.s, display.H * v.s);
  const part = typhoonShelterCalibrationPart();
  if (part.disabled) {
    ctx.fillStyle = 'rgba(10,18,28,0.62)';
    ctx.fillRect(0, 0, dom.canvas.width, dom.canvas.height);
    ctx.fillStyle = '#ff9a9a';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('已停用：遊戲唔會用呢張圖', dom.canvas.width / 2, dom.canvas.height / 2);
    ctx.textAlign = 'start';
    return;
  }
  const P = ([x, y]) => [v.ox + x * v.s, v.oy + y * v.s];
  const ground = typhoonShelterCalibrationDisplayGround(display, part);
  // isometric guides (2:1 both ways) through the front corner: line the hull and deck up on them
  const [gx, gy] = P(ground ? ground.front : [display.W / 2, display.solid.maxY]);
  const span = dom.canvas.width + dom.canvas.height * 2;
  const step = 24;
  ctx.lineWidth = 1;
  for (let i = -40; i <= 40; i++) {
    const off = i * step;
    ctx.strokeStyle = i === 0 ? 'rgba(255,230,90,0.55)' : 'rgba(255,230,90,0.16)';
    ctx.beginPath(); ctx.moveTo(gx - span, gy + off - span / 2); ctx.lineTo(gx + span, gy + off + span / 2); ctx.stroke();
    ctx.strokeStyle = i === 0 ? 'rgba(120,230,255,0.55)' : 'rgba(120,230,255,0.16)';
    ctx.beginPath(); ctx.moveTo(gx - span, gy + off + span / 2); ctx.lineTo(gx + span, gy + off - span / 2); ctx.stroke();
  }
  if (!ground) return;
  const { left, front, right } = ground;
  const back = [left[0] + right[0] - front[0], left[1] + right[1] - front[1]];
  ctx.beginPath();
  [left, front, right, back].map(P).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,230,90,0.95)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  [['left', '#39d353'], ['front', '#ff3b30'], ['right', '#3b9dff']].forEach(([k, color]) => {
    const [x, y] = P(ground[k]);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  });
}

// The part as the game draws it: on a patch of isometric tiles (map rotation 0), its footprint
// from its real size and facing, the art scaled to real size and fitted by its ground corners -
// the same measureTyphoonShelterArt / fitTyphoonShelterGround the map sprites use.
const TYPHOON_SHELTER_CALIBRATION_LOGICAL_OF_SCREEN = Object.freeze({ ne: 'n', se: 'e', sw: 's', nw: 'w' });

function renderTyphoonShelterCalibrationPreview() {
  const dom = typhoonShelterCalibrationDom;
  if (!dom?.preview) return;
  const canvas = dom.preview;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1d4a63';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  dom.previewInfo.textContent = '';
  const { objectId } = typhoonShelterCalibrationEdit;
  const part = typhoonShelterCalibrationPart();
  const display = typhoonShelterCalibrationDisplay();
  const g = typhoonShelterCalibrationDisplayGround(display, part);
  if (!g) return;
  const logical = TYPHOON_SHELTER_CALIBRATION_LOGICAL_OF_SCREEN[part.facing] || 'e';
  const fp = getTyphoonShelterObjectFootprint(objectId, logical);
  const halfW = TILE_WIDTH / 2;
  const halfH = TILE_HEIGHT / 2;
  const centre = (r, c) => [(c - r) * halfW, (c + r) * halfH];
  const diamondOf = (r, c) => {
    const [x, y] = centre(r, c);
    return [[x - halfW, y], [x, y + halfH], [x + halfW, y], [x, y - halfH]];
  };
  // the footprint's corners, as getTyphoonShelterFootprintDiamond finds them on the map
  let left = null; let front = null; let right = null;
  [[0, 0], [0, fp.cols - 1], [fp.rows - 1, 0], [fp.rows - 1, fp.cols - 1]].forEach(([r, c]) => diamondOf(r, c).forEach((v) => {
    if (!left || v[0] < left[0]) left = v;
    if (!right || v[0] > right[0]) right = v;
    if (!front || v[1] > front[1]) front = v;
  }));
  const art = measureTyphoonShelterArt(g, getTyphoonShelterObjectSize(objectId), g.top);
  const fit = fitTyphoonShelterGround(g, { left, front, right }, art?.scale);
  if (!fit) return;
  const toWorld = ([x, y]) => [fit.x + (x - fit.originX) * fit.scale, fit.y + (y - fit.originY) * fit.scale];
  // frame the art's solid pixels and the footprint, with room round them; the grid fills the rest
  const solid = display.solid;
  const pts = [toWorld([solid.minX, solid.minY]), toWorld([solid.maxX, solid.maxY]), left, front, right,
    [left[0] + right[0] - front[0], left[1] + right[1] - front[1]]];
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const k = Math.min(canvas.width / ((maxX - minX) * 1.35), canvas.height / ((maxY - minY) * 1.35));
  const ox = (canvas.width - (maxX - minX) * k) / 2 - minX * k;
  const oy = (canvas.height - (maxY - minY) * k) / 2 - minY * k;
  const P = ([x, y]) => [ox + x * k, oy + y * k];
  // tiles covering the canvas: c - r = x / halfW, c + r = y / halfH at its corners
  const corners = [[0, 0], [canvas.width, 0], [0, canvas.height], [canvas.width, canvas.height]]
    .map(([x, y]) => [(x - ox) / k, (y - oy) / k]);
  const us = corners.map(([x]) => x / halfW); const vs = corners.map(([, y]) => y / halfH);
  const R0 = Math.floor((Math.min(...vs) - Math.max(...us)) / 2) - 1;
  const R1 = Math.ceil((Math.max(...vs) - Math.min(...us)) / 2) + 1;
  const C0 = Math.floor((Math.min(...vs) + Math.min(...us)) / 2) - 1;
  const C1 = Math.ceil((Math.max(...vs) + Math.max(...us)) / 2) + 1;
  const poly = (verts) => {
    ctx.beginPath();
    verts.map(P).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const inFootprint = (r, c) => r >= 0 && c >= 0 && r < fp.rows && c < fp.cols;
  // the tile grid, footprint shaded, under the art
  for (let r = R0; r <= R1; r++) {
    for (let c = C0; c <= C1; c++) {
      poly(diamondOf(r, c));
      if (inFootprint(r, c)) { ctx.fillStyle = 'rgba(80,220,120,0.22)'; ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  const [ix, iy] = P(toWorld([0, 0]));
  ctx.drawImage(display.canvas, ix, iy, display.W * fit.scale * k, display.H * fit.scale * k);
  // over the art: the footprint outline, and where the ground corners land
  ctx.setLineDash([5, 4]);
  poly([left, front, right, [left[0] + right[0] - front[0], left[1] + right[1] - front[1]]]);
  ctx.strokeStyle = 'rgba(110,240,150,0.95)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  poly([g.left, g.front, g.right, [g.left[0] + g.right[0] - g.front[0], g.left[1] + g.right[1] - g.front[1]]].map(toWorld));
  ctx.strokeStyle = 'rgba(255,230,90,0.95)';
  ctx.stroke();
  [['left', '#39d353'], ['front', '#ff3b30'], ['right', '#3b9dff']].forEach(([key, color]) => {
    const [x, y] = P(toWorld(g[key]));
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
  dom.previewInfo.textContent = `${fp.cols}×${fp.rows} 格`
    + (art ? ` · 落水線 ${art.seM}×${art.swM} m` : '') + ` · 向 ${part.facing}`;
}

// Opaque bounds of RGBA pixels (sampled every other pixel).
function typhoonShelterCalibrationBounds(data, W, H) {
  let minX = W; let minY = H; let maxX = 0; let maxY = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return maxX >= minX ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: W, maxY: H };
}

// The unwarped texture's opaque bounds, cached per loaded image.
function typhoonShelterCalibrationSolidBounds() {
  const im = typhoonShelterCalibrationImage;
  if (!im.solid) im.solid = typhoonShelterCalibrationBounds(im.data, im.W, im.H);
  return im.solid;
}

function typhoonShelterCalibrationPointer(ev) {
  const rect = typhoonShelterCalibrationDom.canvas.getBoundingClientRect();
  return [
    (ev.clientX - rect.left) * (typhoonShelterCalibrationDom.canvas.width / rect.width),
    (ev.clientY - rect.top) * (typhoonShelterCalibrationDom.canvas.height / rect.height),
  ];
}

function onTyphoonShelterCalibrationCanvasDown(ev) {
  const v = typhoonShelterCalibrationView();
  const part = typhoonShelterCalibrationPart();
  const ground = typhoonShelterCalibrationDisplayGround(typhoonShelterCalibrationDisplay(), part);
  if (!v || !ground) return;
  const [x, y] = typhoonShelterCalibrationPointer(ev);
  let hit = null;
  ['left', 'front', 'right'].forEach((k) => {
    const [px, py] = ground[k];
    if (Math.hypot(v.ox + px * v.s - x, v.oy + py * v.s - y) < 10) hit = k;
  });
  if (hit) { typhoonShelterCalibrationDrag = hit; ev.preventDefault(); }
}

function onTyphoonShelterCalibrationCanvasMove(ev) {
  if (!typhoonShelterCalibrationDrag) return;
  const v = typhoonShelterCalibrationView();
  const display = typhoonShelterCalibrationDisplay();
  const part = typhoonShelterCalibrationPart();
  const ground = typhoonShelterCalibrationDisplayGround(display, part);
  if (!v || !ground) return;
  const [x, y] = typhoonShelterCalibrationPointer(ev);
  // dragged in the drawn (warped) art, on the isometric lines there; stored unwarped
  const next = typhoonShelterCalibrationIsoGround({ ...ground, [typhoonShelterCalibrationDrag]: [(x - v.ox) / v.s, (y - v.oy) / v.s] });
  // (a moved front corner moves the warp's fixed point, which only shifts the whole drawing)
  const r1 = ([px, py]) => [Math.round(px * 10) / 10, Math.round(py * 10) / 10];
  part.ground = { left: r1(display.toBase(next.left)), front: r1(display.toBase(next.front)), right: r1(display.toBase(next.right)) };
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
      #tscal-panel .ts-disable[data-active="true"]{background:#7a1f1f;border-color:#ff8a8a;color:#ffe9e9}
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
    <div class="ts-row"><button type="button" class="ts-disable"></button><span class="ts-note ts-disable-note"></span></div>
    <div class="ts-row">實際<span class="ts-size-kind"></span>
      <button type="button" data-size="-1">−</button><b class="ts-size"></b> m<button type="button" data-size="1">+</button>
      <span class="ts-note">（一格 20 m）</span></div>
    <div class="ts-row ts-note ts-metres"></div>
    <div class="ts-warp"></div>
    <canvas class="ts-canvas" width="348" height="260"></canvas>
    <div class="ts-note">黃線（↘）同藍線（↗）係 isometric 參考線。先用上下伸縮、上下斜、左右斜，令船身同甲板嘅直線貼住參考線、桅杆企直，再拖紅點去最前（最低）嗰個落水角，最後左右拖綠／藍點去左角／右角。</div>
    <h4>地圖預覽 <span class="ts-note ts-preview-info" style="font-weight:400"></span></h4>
    <canvas class="ts-preview" width="348" height="260" style="cursor:default"></canvas>
    <div class="ts-note">照遊戲嘅擺法畫喺 isometric 格上（一格 20 m）：綠框係佔地，黃線係你拖嘅落水線。</div>
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
    preview: panel.querySelector('.ts-preview'),
    previewInfo: panel.querySelector('.ts-preview-info'),
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
  buildTyphoonShelterCalibrationWarpControls(panel.querySelector('.ts-warp'));
  // switch a badly proportioned view off: the game then draws the object with its other views,
  // and leaves out an object with none left (see getTyphoonShelterFacingOverrides)
  panel.querySelector('.ts-disable').addEventListener('click', () => {
    const part = typhoonShelterCalibrationPart();
    if (part.disabled) delete part.disabled;
    else part.disabled = true;
    part.auto = false;
    typhoonShelterCalibrationChanged();
  });
  panel.querySelector('.ts-save').addEventListener('click', saveTyphoonShelterCalibration);
  const canvas = typhoonShelterCalibrationDom.canvas;
  canvas.addEventListener('pointerdown', onTyphoonShelterCalibrationCanvasDown);
  window.addEventListener('pointermove', onTyphoonShelterCalibrationCanvasMove);
  window.addEventListener('pointerup', onTyphoonShelterCalibrationCanvasUp);
  return typhoonShelterCalibrationDom;
}

// Art warp controls (see normalizeTyphoonShelterWarp): x:y, up-down and left-right skew, each a
// slider with -/+ steps of 0.01 for the last touch. All about the ground's front corner.
const TYPHOON_SHELTER_CALIBRATION_WARP_CONTROLS = Object.freeze([
  { key: 'k', label: '上下伸縮', hint: 'x:y，細過 1 = 壓扁', min: 0.5, max: 1.5, rest: 1 },
  { key: 's', label: '上下斜', hint: '＋ = 右邊落、左邊升', min: -0.6, max: 0.6, rest: 0 },
  { key: 'h', label: '左右斜', hint: '＋ = 頂部向右', min: -0.6, max: 0.6, rest: 0 },
]);

function setTyphoonShelterCalibrationWarp(fields) {
  const part = typhoonShelterCalibrationPart();
  const warp = { ...normalizeTyphoonShelterWarp(part.warp), ...fields };
  const r2 = (v) => Math.round(v * 100) / 100;
  if (isTyphoonShelterWarpIdentity(warp)) delete part.warp;
  else part.warp = { k: r2(warp.k), s: r2(warp.s), h: r2(warp.h) };
  part.auto = false;
  typhoonShelterCalibrationChanged();
}

function buildTyphoonShelterCalibrationWarpControls(container) {
  container.replaceChildren();
  TYPHOON_SHELTER_CALIBRATION_WARP_CONTROLS.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'ts-row';
    row.title = c.hint;
    row.innerHTML = `<span style="width:58px">${c.label}</span><button type="button" data-step="-1">−</button>`
      + `<input type="range" min="${c.min}" max="${c.max}" step="0.01" style="flex:1;min-width:60px">`
      + `<button type="button" data-step="1">＋</button><b style="width:40px;text-align:right"></b>`;
    const range = row.querySelector('input');
    range.dataset.warp = c.key;
    range.addEventListener('input', () => setTyphoonShelterCalibrationWarp({ [c.key]: Number(range.value) }));
    row.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const now = normalizeTyphoonShelterWarp(typhoonShelterCalibrationPart().warp)[c.key];
      const next = Math.min(c.max, Math.max(c.min, Math.round((now + Number(b.dataset.step) * 0.01) * 100) / 100));
      setTyphoonShelterCalibrationWarp({ [c.key]: next });
    }));
    container.appendChild(row);
  });
  const foot = document.createElement('div');
  foot.className = 'ts-row ts-note';
  foot.innerHTML = '<span style="flex:1">全部以紅點（前角）為中心變形</span><button type="button">重設</button>';
  foot.querySelector('button').addEventListener('click', () => setTyphoonShelterCalibrationWarp({ k: 1, s: 0, h: 0 }));
  container.appendChild(foot);
}

function syncTyphoonShelterCalibrationWarpControls(panel, part) {
  const warp = normalizeTyphoonShelterWarp(part.warp);
  panel.querySelectorAll('.ts-warp input[data-warp]').forEach((range) => {
    const v = warp[range.dataset.warp];
    range.value = String(v);
    const shown = range.dataset.warp === 'k' ? v.toFixed(2) : (v >= 0 ? '+' : '') + v.toFixed(2);
    range.parentElement.querySelector('b').textContent = shown;
  });
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
  [...dom.part.options].forEach((o) => {
    o.textContent = getTyphoonShelterPlacement().parts[o.value]?.disabled ? `${o.value}（已停用）` : o.value;
  });
  dom.part.value = typhoonShelterCalibrationEdit.partId;
  const part = typhoonShelterCalibrationPart();
  const left = getTyphoonShelterObjectTextures(obj.id, getTyphoonShelterFacingOverrides()).length;
  const disableBtn = dom.panel.querySelector('.ts-disable');
  disableBtn.textContent = part.disabled ? '已停用：撳一下恢復' : '比例唔啱：停用呢張圖';
  disableBtn.dataset.active = String(!!part.disabled);
  dom.panel.querySelector('.ts-disable-note').textContent = !left
    ? `「${obj.label}」已經冇圖可用，遊戲唔會再擺佢`
    : part.disabled ? '遊戲會改用呢件嘢其他角度嘅圖' : '';
  dom.facing.value = part.facing || obj.parts[typhoonShelterCalibrationEdit.partId] || 'se';
  const size = getTyphoonShelterObjectSize(obj.id) || {};
  dom.panel.querySelector('.ts-size-kind').textContent = size.lengthM ? '長度' : '高度';
  dom.panel.querySelector('.ts-size').textContent = size.lengthM ?? size.heightM ?? '—';
  const metres = getTyphoonShelterObjectMetres(obj.id);
  const fp = getTyphoonShelterObjectFootprint(obj.id, 'e');
  dom.panel.querySelector('.ts-metres').textContent = metres
    ? `長 ${metres.alongM} × 闊 ${metres.acrossM} × 高 ${metres.heightM ?? '?'} m → 佔地 ${fp.depth}×${fp.width} 格`
    : '未有落水角';
  syncTyphoonShelterCalibrationWarpControls(dom.panel, part);
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
  // fresh from disk, unless there are unsaved edits from an earlier session of the tool
  await loadTyphoonShelterPlacement(!typhoonShelterCalibrationDirty);
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
