// Road line marking calibrator (馬路劃線位置校正) — an in-game tool to drag lane-divider /
// arrow / crossing / box-junction sprites onto the road tiles, modelled on
// building-light-calibrator.js: a full-screen HTML canvas workbench (not Phaser game objects),
// working data saved to localStorage + a SQLite-backed API as you drag, and a "複製 JS" button
// that prints/copies a paste-able object literal for the frozen ROAD_LINE_TILE_PROFILES
// constant in road-line-markings.js. scripts/bake-road-line-textures.js reads that frozen
// constant at build time and composites the markings onto the actual road tile textures, so a
// calibration session never touches pixels itself — it only records normalized positions.
//
// Unlike building-light-calibrator's centre + rotation + scale here, each placement is FOUR
// independently draggable corners - the same interaction as a building-light-calibrator window
// panel, and for the same reason: a marking positioned by centre/rotate/scale only ever stays an
// axis-aligned rectangle turned in the screen plane, so it reads as pasted flat above the road
// instead of painted on its isometric ground plane. Dragging each corner onto where it should
// actually land - however the tile's rotation and zoom have turned it - lets a marking lean into
// real perspective. road-line-warp.js does the corner-to-corner image warp, both here (live
// preview) and in the bake, so what you drag is pixel-for-pixel what gets baked.
//
// Unlike building-light-calibrator (per-building-instance panels/lamps/beacons), the unit here
// is simpler: one road TILE TYPE (road-tile-sets.js's logical key, e.g. 'road_straight_h',
// 'road_t_n', 'road_cross' — set-independent, so the same calibration works whichever road
// tile set is active) is a small CATALOGUE of printed VARIANTS (plain/busStop/stopLine/
// parkingBay/...  — a straight road prints differently outside a bus stop than outside a
// parking building, same shape, different markings), and each (tile shape, variant) pair holds
// a list of marking placements, each one instance of a marking sprite (road-line-markings.js
// ROAD_LINE_MARKING_FILES) warped onto its own four-corner quad.

const ROAD_LINE_CALIBRATION_SCHEMA_VERSION = 1;
const ROAD_LINE_CALIBRATION_STORAGE_KEY = 'roadLineCalibration.v1';
const ROAD_LINE_CALIBRATION_API = '/api/road-line-profiles';
const ROAD_LINE_CALIBRATION_MIN_ZOOM = 0.5;
const ROAD_LINE_CALIBRATION_MAX_ZOOM = 12;
// Fallback tile set for the calibrator's workbench: the one road-line assets are authored
// against (road-tile-sets.js ROAD_TILE_SETS). Calibration coordinates are normalized (0..1
// over the tile canvas) so they carry over to any set, but the preview needs one concrete set's
// art + pixel size to show.
const ROAD_LINE_CALIBRATION_TILE_SET_ID = 'newRoadTiles';

// Every logical road tile the calibrator can target, with a short Chinese label for the
// picker. Mirrors road-tile-sets.js ROAD_TILE_LOGICAL_FILES keys exactly.
const ROAD_LINE_CALIBRATION_TILE_LABELS = Object.freeze({
  road_straight_h: '直路 · 東西向',
  road_straight_v: '直路 · 南北向',
  road_cross: '十字路口',
  road_corner_ne: '彎路 · 東北',
  road_corner_nw: '彎路 · 西北',
  road_corner_se: '彎路 · 東南',
  road_corner_sw: '彎路 · 西南',
  road_t_n: 'T字路口 · 開口向北',
  road_t_e: 'T字路口 · 開口向東',
  road_t_s: 'T字路口 · 開口向南',
  road_t_w: 'T字路口 · 開口向西',
  road_hill_n: '斜路 · 北',
  road_hill_e: '斜路 · 東',
  road_hill_s: '斜路 · 南',
  road_hill_w: '斜路 · 西',
  road_hill2_n: '斜路(高) · 北',
  road_hill2_e: '斜路(高) · 東',
  road_hill2_s: '斜路(高) · 南',
  road_hill2_w: '斜路(高) · 西',
  road_end_n: '路尾 · 北',
  road_end_e: '路尾 · 東',
  road_end_s: '路尾 · 南',
  road_end_w: '路尾 · 西',
  road_isolated: '獨立一格路',
  road_bridge_h: '橋面 · 東西向',
  road_bridge_v: '橋面 · 南北向',
});

let roadLineCalibrationActive = false;
let roadLineCalibrationScene = null;
let roadLineCalibrationDom = null;       // { modal, work, workCtx, tileSel, variantSel, markingSel, list, msg, zoom }
// Flat map, one entry per (tile shape, variant) pair - see roadLineCalibrationKey(). Kept flat
// (rather than nested {tileKey: {variantId: [...]}}) so it stores/loads exactly like
// building-light-calibrator's overrides (one row per key in road_line_profiles); only the
// export step (buildRoadLineCalibrationRecord) regroups it into the nested shape
// ROAD_LINE_TILE_PROFILES actually uses.
let roadLineCalibrationOverrides = {};   // { [`${logicalKey}::${variantId}`]: [{marking, corners: [[x,y]x4]}, ...] }
let roadLineCalibrationTileKey = 'road_straight_h';
let roadLineCalibrationVariantId = 'plain';
let roadLineCalibrationTileImg = null;   // {img, w, h, loaded} for the currently loaded tile art
let roadLineCalibrationMarkingImgs = {}; // markingKey -> {img, w, h, loaded, pixels, pw, ph} (lazy-loaded, cached)
let roadLineCalibrationSelected = -1;    // index into the current (tile, variant)'s placement list
let roadLineCalibrationSelectedCorner = null; // null (whole shape) | 0..3 (one corner), of the selected placement
let roadLineCalibrationView = { zoom: 3, panX: 0, panY: 0 };
// { type: 'corner', index, corner } | { type: 'move', index, startCorners, sx, sy } | { pan: true, sx, sy, px, py }
let roadLineCalibrationDrag = null;
let roadLineCalibrationWasPaused = false;
let roadLineCalibrationSaveTimer = null;
let roadLineCalibrationKeyHandler = null;

// The flat storage key for one (tile shape, variant) pair. 'plain' is a real key here (an
// explicit "no markings, this is the ordinary tile" record some workflow might still want to
// keep), even though the frozen ROAD_LINE_TILE_PROFILES a build reads has no 'plain' entry -
// applyRoadLineTexture already treats "no variant / no placements" as the base tile.
function roadLineCalibrationKey(tileKey, variantId) {
  return `${tileKey}::${variantId}`;
}

// A variant a user just created with "+新款" has zero placements until they add its first
// marking - it must still show up in the picker, not vanish the moment focus moves elsewhere
// (which is what requiring a non-empty placement list here used to do: create the variant,
// switch tiles to check something, switch back - and it's gone, with nothing ever having gone
// wrong loudly enough to notice). Existence of the key is what "this variant was created"
// means; emptiness is a normal, later-filled-in state, not "doesn't exist".
function roadLineCalibrationVariantIdsFor(tileKey) {
  const prefix = `${tileKey}::`;
  const ids = Object.keys(roadLineCalibrationOverrides)
    .filter((k) => k.startsWith(prefix) && Array.isArray(roadLineCalibrationOverrides[k]))
    .map((k) => k.slice(prefix.length));
  return ids.length ? ids : ['plain'];
}

// ---------------------------------------------------------------------------
// persistence — same three-layer pattern as building-light-calibrator.js:
// in-memory overrides -> localStorage (instant) -> SQLite API (debounced, durable)
// ---------------------------------------------------------------------------

function readRoadLineCalibrationLocal() {
  try {
    const raw = globalThis.localStorage?.getItem(ROAD_LINE_CALIBRATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
  } catch { return {}; }
}

function writeRoadLineCalibrationLocal() {
  try {
    globalThis.localStorage?.setItem(ROAD_LINE_CALIBRATION_STORAGE_KEY, JSON.stringify({
      schemaVersion: ROAD_LINE_CALIBRATION_SCHEMA_VERSION,
      entries: roadLineCalibrationOverrides,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* private mode etc */ }
}

// Schema migration: placements saved before this tool moved from centre+rotation+scale to four
// independent corners have no `corners` field at all, which crashed every render/list call that
// assumed one (`p.corners.map`/`.reduce` on undefined) - not a corrupt-data edge case, but
// exactly what anyone's browser storage already held from using the tool before this change.
// Reconstructs the equivalent axis-aligned-then-rotated rectangle their old x/y/rotation/scale
// described, so existing work reappears (roughly where it was) as a draggable quad instead of
// vanishing or crashing - the same non-destructive intent as building-light-calibrator.js's own
// migrateBuildingLightCalibrationData for its schema bumps.
// Every 'newRoadTiles' tile shares one pixel size (160x80 - road-tile-sets.js
// NEW_ROAD_TILE_LOGICAL_FILES), so this can reconstruct pixel-space corners without needing to
// know which specific tile shape a placement belongs to (entries are migrated in bulk, most
// belonging to a tile shape that isn't even the one currently loaded).
const ROAD_LINE_MIGRATION_TILE_SIZE = { w: 160, h: 80 };

function migrateRoadLinePlacement(p) {
  if (!p || typeof p !== 'object' || !p.marking) return null;
  if (Array.isArray(p.corners) && p.corners.length === 4) return p; // already current shape
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return null; // unrecognized, drop it

  const file = typeof getRoadLineMarkingFile === 'function' ? getRoadLineMarkingFile(p.marking) : null;
  const w = file?.w || 1;
  const h = file?.h || 1;
  const { w: tileW, h: tileH } = ROAD_LINE_MIGRATION_TILE_SIZE;
  const fitPx = Math.min(tileW, tileH) * 0.55 * (p.scale || 1);
  const scale = fitPx / Math.max(w, h);
  const hw = (w * scale) / 2;
  const hh = (h * scale) / 2;
  const rad = ((p.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = p.x * tileW;
  const cy = p.y * tileH;
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => [
    roadLineCalibrationClamp01((cx + (dx * cos - dy * sin)) / tileW),
    roadLineCalibrationClamp01((cy + (dx * sin + dy * cos)) / tileH),
  ]);
  const migrated = { marking: p.marking, corners };
  if (typeof p.opacity === 'number') migrated.opacity = p.opacity;
  return migrated;
}

function setRoadLineCalibrationOverrides(entries) {
  Object.keys(roadLineCalibrationOverrides).forEach((k) => delete roadLineCalibrationOverrides[k]);
  Object.entries(entries || {}).forEach(([k, d]) => {
    const list = Array.isArray(d) ? d : [];
    roadLineCalibrationOverrides[k] = list.map(migrateRoadLinePlacement).filter(Boolean);
  });
}

async function loadRoadLineCalibrationStore() {
  const local = readRoadLineCalibrationLocal();
  setRoadLineCalibrationOverrides(local);
  if (typeof fetch === 'function') {
    try {
      const res = await fetch(ROAD_LINE_CALIBRATION_API);
      if (res.ok) {
        const json = await res.json();
        if (json && json.entries) {
          setRoadLineCalibrationOverrides(json.entries);
          writeRoadLineCalibrationLocal();
        }
      } else if (Object.keys(local).length) {
        // seed the empty table from localStorage the first time
        await fetch(ROAD_LINE_CALIBRATION_API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: local }),
        }).catch(() => {});
      }
    } catch { /* offline */ }
  }
}

// There is no manual Save button anywhere in this tool (nor in any of the other in-game
// calibrators it's modelled on) - every edit commits immediately, the same auto-save-on-drag
// design throughout. What was actually missing was visible proof of that: this writes a
// standing status line (not the transient .rl-msg info/error line, which other actions
// overwrite) so "did my edit actually save?" has a concrete answer on screen at all times.
function setRoadLineSaveStatus(text, tone) {
  const dom = roadLineCalibrationDom;
  if (!dom?.saveStatus) return;
  dom.saveStatus.textContent = text;
  dom.saveStatus.dataset.tone = tone || 'info';
}

function saveRoadLineCalibrationEntry(key, placements) {
  roadLineCalibrationOverrides[key] = placements;
  writeRoadLineCalibrationLocal();
  setRoadLineSaveStatus('已存落瀏覽器 · 儲存緊資料庫…', 'info');
  if (roadLineCalibrationSaveTimer) clearTimeout(roadLineCalibrationSaveTimer);
  roadLineCalibrationSaveTimer = setTimeout(() => {
    if (typeof fetch !== 'function') return;
    fetch(`${ROAD_LINE_CALIBRATION_API}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: placements }),
    }).then((res) => {
      const now = new Date().toLocaleTimeString('zh-HK', { hour12: false });
      if (res.ok) setRoadLineSaveStatus(`已自動儲存 · ${now}`, 'success');
      else setRoadLineSaveStatus(`已存落瀏覽器,但資料庫儲存失敗（HTTP ${res.status}）`, 'error');
    }).catch(() => {
      setRoadLineSaveStatus('已存落瀏覽器,但連唔到資料庫（重開瀏覽器會冚,建議檢查伺服器）', 'error');
    });
  }, 350);
}

function deleteRoadLineCalibrationEntry(key) {
  delete roadLineCalibrationOverrides[key];
  writeRoadLineCalibrationLocal();
  if (typeof fetch === 'function') {
    fetch(`${ROAD_LINE_CALIBRATION_API}/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
  }
}

async function replaceRoadLineCalibrationEntries(entries) {
  const clean = {};
  Object.entries(entries || {}).forEach(([k, d]) => { clean[k] = Array.isArray(d) ? d : []; });
  setRoadLineCalibrationOverrides(clean);
  writeRoadLineCalibrationLocal();
  if (typeof fetch === 'function') {
    await fetch(ROAD_LINE_CALIBRATION_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: clean }),
    }).catch(() => {});
  }
}

function isRoadLineCalibrationActive() { return roadLineCalibrationActive; }

// ---------------------------------------------------------------------------
// current tile data
// ---------------------------------------------------------------------------

function roadLineCalibrationCurrentPlacements() {
  const key = roadLineCalibrationKey(roadLineCalibrationTileKey, roadLineCalibrationVariantId);
  if (!roadLineCalibrationOverrides[key]) roadLineCalibrationOverrides[key] = [];
  return roadLineCalibrationOverrides[key];
}

function roadLineCalibrationCommit() {
  const key = roadLineCalibrationKey(roadLineCalibrationTileKey, roadLineCalibrationVariantId);
  saveRoadLineCalibrationEntry(key, roadLineCalibrationCurrentPlacements());
}

// `extractPixels: true` also draws the loaded image into an offscreen canvas and keeps its raw
// RGBA bytes (entry.pixels/pw/ph) - road-line-warp.js's warpQuadImageOnto needs a source pixel
// buffer, not an <img>, so a marking (which gets warped) is cached with pixels; the tile
// background (drawn plain via ctx.drawImage, never warped) doesn't need them.
function loadImageCached(cache, key, src, extractPixels) {
  if (cache[key]) return cache[key];
  const img = typeof Image !== 'undefined' ? new Image() : null;
  const entry = { img, w: 0, h: 0, loaded: false, pixels: null, pw: 0, ph: 0 };
  cache[key] = entry;
  if (img) {
    img.onload = () => {
      entry.w = img.naturalWidth;
      entry.h = img.naturalHeight;
      if (extractPixels) {
        const off = document.createElement('canvas');
        off.width = entry.w;
        off.height = entry.h;
        const offCtx = off.getContext('2d');
        offCtx.drawImage(img, 0, 0);
        entry.pixels = offCtx.getImageData(0, 0, entry.w, entry.h).data;
        entry.pw = entry.w;
        entry.ph = entry.h;
      }
      entry.loaded = true;
      renderRoadLineCalibration();
    };
    img.src = src;
  }
  return entry;
}

function roadLineCalibrationLoadTile(logicalKey) {
  const path = typeof getRoadTileAssetPath === 'function'
    ? getRoadTileAssetPath(logicalKey, ROAD_LINE_CALIBRATION_TILE_SET_ID)
    : null;
  roadLineCalibrationTileImg = path ? loadImageCached({}, logicalKey, path, false) : null;
}

function roadLineCalibrationMarkingImg(markingKey) {
  const file = typeof getRoadLineMarkingFile === 'function' ? getRoadLineMarkingFile(markingKey) : null;
  if (!file) return null;
  return loadImageCached(roadLineCalibrationMarkingImgs, markingKey, file.file, true);
}

// ---------------------------------------------------------------------------
// view / coordinate helpers (tile canvas is drawn centred, at native pixel size * zoom)
// ---------------------------------------------------------------------------

function roadLineCalibrationTileRect(canvas) {
  const v = roadLineCalibrationView;
  const t = roadLineCalibrationTileImg;
  const w = (t?.w || 160) * v.zoom;
  const h = (t?.h || 80) * v.zoom;
  return { cx: canvas.width / 2 + v.panX, cy: canvas.height / 2 + v.panY, w, h };
}

// The small "clean preview" canvas has no pan/zoom of its own - just fit the tile centred in
// whatever fixed size that canvas is, with a little breathing room.
function roadLineCalibrationFitRect(canvas) {
  const t = roadLineCalibrationTileImg;
  const tileW = t?.w || 160;
  const tileH = t?.h || 80;
  const zoom = Math.min(canvas.width / tileW, canvas.height / tileH) * 0.92;
  return { cx: canvas.width / 2, cy: canvas.height / 2, w: tileW * zoom, h: tileH * zoom };
}

function roadLineCalibrationNormToRect(rect, x, y) {
  return { x: rect.cx + (x - 0.5) * rect.w, y: rect.cy + (y - 0.5) * rect.h };
}

function roadLineCalibrationNormToCanvas(canvas, x, y) {
  return roadLineCalibrationNormToRect(roadLineCalibrationTileRect(canvas), x, y);
}

function roadLineCalibrationCanvasToNorm(canvas, x, y) {
  const r = roadLineCalibrationTileRect(canvas);
  return { x: (x - r.cx) / r.w + 0.5, y: (y - r.cy) / r.h + 0.5 };
}

function roadLineCalibrationClamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

// Default corners for a freshly-added marking: a centred rectangle matching its own aspect
// ratio, sized so its longer edge spans 55% of the tile's SHORTER side (these tiles are a wide
// 2:1 diamond, so sizing off the width alone would make square markings taller than the tile).
// Same 0.55 baseline scripts/bake-road-line-textures.js's MARKING_FIT_FRACTION uses, so a fresh
// placement previews at the size it would bake at before you drag anything. Corners are
// [top-left, top-right, bottom-right, bottom-left], normalized 0..1 over the tile canvas.
function roadLineCalibrationDefaultCorners(markingKey) {
  const file = typeof getRoadLineMarkingFile === 'function' ? getRoadLineMarkingFile(markingKey) : null;
  const w = file?.w || 1;
  const h = file?.h || 1;
  const tileImg = roadLineCalibrationTileImg;
  const tileW = tileImg?.w || 160;
  const tileH = tileImg?.h || 80;
  const fitPx = Math.min(tileW, tileH) * 0.55;
  const scale = fitPx / Math.max(w, h);
  const hw = (w * scale) / 2 / tileW;
  const hh = (h * scale) / 2 / tileH;
  return [[0.5 - hw, 0.5 - hh], [0.5 + hw, 0.5 - hh], [0.5 + hw, 0.5 + hh], [0.5 - hw, 0.5 + hh]];
}

// Even-odd point-in-polygon test, for "clicked inside the quad's body (not on a corner
// handle)" - used to pick "drag the whole placement" over "drag one corner".
function pointInQuad(corners, x, y) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, yi] = corners[i];
    const [xj, yj] = corners[j];
    const intersects = (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

// Draws the tile art plus every placement's marking, warped onto it via road-line-warp.js's
// shared quad warp (the same function the bake script uses, so this is pixel-for-pixel what a
// bake produces, never an approximation of it) - no selection outline, no corner handles. Both
// the editable workbench and the clean bottom-left preview build on this; only the workbench
// draws handles on top afterwards.
function paintRoadLineCalibrationTile(ctx, canvas, rect, placements) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b1322';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const t = roadLineCalibrationTileImg;
  if (t?.loaded && t.img) {
    ctx.drawImage(t.img, rect.cx - rect.w / 2, rect.cy - rect.h / 2, rect.w, rect.h);
  } else {
    ctx.strokeStyle = 'rgba(90,127,160,0.5)';
    ctx.strokeRect(rect.cx - rect.w / 2, rect.cy - rect.h / 2, rect.w, rect.h);
  }

  const absoluteCorners = placements.map((p) => p.corners.map(([x, y]) => {
    const c = roadLineCalibrationNormToRect(rect, x, y);
    return [c.x, c.y];
  }));
  if (typeof warpQuadImageOnto === 'function' && canvas.width > 0 && canvas.height > 0) {
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    placements.forEach((p, i) => {
      const mImg = roadLineCalibrationMarkingImg(p.marking);
      if (!mImg?.loaded || !mImg.pixels) return;
      warpQuadImageOnto({
        src: mImg.pixels, srcWidth: mImg.pw, srcHeight: mImg.ph,
        dst: frame.data, dstWidth: canvas.width, dstHeight: canvas.height,
        corners: absoluteCorners[i],
        opacity: p.opacity ?? 1,
      });
    });
    ctx.putImageData(frame, 0, 0);
  }
  return absoluteCorners;
}

function renderRoadLineCalibrationWork() {
  const dom = roadLineCalibrationDom;
  if (!dom) return;
  const canvas = dom.work;
  const ctx = dom.workCtx;
  const placements = roadLineCalibrationCurrentPlacements();
  const absoluteCorners = paintRoadLineCalibrationTile(ctx, canvas, roadLineCalibrationTileRect(canvas), placements);

  // Corner handles + quad outline, drawn with ordinary 2D calls on top of the warped pixels -
  // the editable workbench only, never the clean preview.
  placements.forEach((p, i) => {
    const corners = absoluteCorners[i];
    const selected = i === roadLineCalibrationSelected;
    ctx.beginPath();
    corners.forEach(([x, y], ci) => (ci === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.lineWidth = selected ? 1.6 : 1;
    ctx.strokeStyle = selected ? 'rgba(143,214,255,0.9)' : 'rgba(255,206,147,0.5)';
    ctx.stroke();
    if (!selected) return;
    corners.forEach(([x, y], ci) => {
      const isFocused = roadLineCalibrationSelectedCorner === ci;
      ctx.beginPath();
      ctx.arc(x, y, isFocused ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isFocused ? '#8fd6ff' : '#ffce93';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(10,15,24,0.9)';
      ctx.stroke();
    });
  });
}

// The clean bottom-left "what this actually looks like" preview: same tile, same warped
// markings, fixed fit-to-canvas framing, no blue selection outline or corner handles at all -
// the effect a bake would produce, to check against while the workbench still shows the
// editing overlay.
function renderRoadLineCalibrationEffect() {
  const dom = roadLineCalibrationDom;
  if (!dom?.effect) return;
  paintRoadLineCalibrationTile(
    dom.effectCtx,
    dom.effect,
    roadLineCalibrationFitRect(dom.effect),
    roadLineCalibrationCurrentPlacements(),
  );
}

function renderRoadLineCalibration() {
  renderRoadLineCalibrationWork();
  renderRoadLineCalibrationEffect();
}

// ---------------------------------------------------------------------------
// pointer + keyboard
// ---------------------------------------------------------------------------

function roadLineCalibrationPointerPos(ev) {
  const dom = roadLineCalibrationDom;
  const rect = dom.work.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (dom.work.width / rect.width),
    y: (ev.clientY - rect.top) * (dom.work.height / rect.height),
  };
}

function onRoadLineCalibrationWorkDown(ev) {
  const dom = roadLineCalibrationDom;
  if (!dom) return;
  const { x, y } = roadLineCalibrationPointerPos(ev);
  const placements = roadLineCalibrationCurrentPlacements();

  // Corner handles first (any placement, not just the currently-selected one, so clicking a
  // corner both selects that placement and starts dragging it in one motion).
  for (let i = 0; i < placements.length; i++) {
    const corners = placements[i].corners;
    for (let c = 0; c < corners.length; c++) {
      const pos = roadLineCalibrationNormToCanvas(dom.work, corners[c][0], corners[c][1]);
      if (Math.hypot(pos.x - x, pos.y - y) <= 10) {
        roadLineCalibrationSelected = i;
        roadLineCalibrationSelectedCorner = c;
        roadLineCalibrationDrag = { type: 'corner', index: i, corner: c };
        renderRoadLineCalibrationList();
        renderRoadLineCalibration();
        ev.preventDefault();
        return;
      }
    }
  }
  // Then the quad body itself, for "move the whole placement".
  for (let i = 0; i < placements.length; i++) {
    const cornersNorm = placements[i].corners;
    const cornersCanvas = cornersNorm.map(([nx, ny]) => {
      const p = roadLineCalibrationNormToCanvas(dom.work, nx, ny);
      return [p.x, p.y];
    });
    if (pointInQuad(cornersCanvas, x, y)) {
      roadLineCalibrationSelected = i;
      roadLineCalibrationSelectedCorner = null;
      roadLineCalibrationDrag = {
        type: 'move', index: i, sx: x, sy: y, startCorners: cornersNorm.map((p) => [...p]),
      };
      renderRoadLineCalibrationList();
      renderRoadLineCalibration();
      ev.preventDefault();
      return;
    }
  }
  // Empty canvas: pan the view.
  roadLineCalibrationDrag = {
    pan: true, sx: x, sy: y, px: roadLineCalibrationView.panX, py: roadLineCalibrationView.panY,
  };
  ev.preventDefault();
}

function onRoadLineCalibrationWorkMove(ev) {
  const drag = roadLineCalibrationDrag;
  const dom = roadLineCalibrationDom;
  if (!drag || !dom) return;
  const { x, y } = roadLineCalibrationPointerPos(ev);
  if (drag.pan) {
    roadLineCalibrationView.panX = drag.px + (x - drag.sx);
    roadLineCalibrationView.panY = drag.py + (y - drag.sy);
    renderRoadLineCalibration();
    return;
  }
  const placement = roadLineCalibrationCurrentPlacements()[drag.index];
  if (!placement) return;
  if (drag.type === 'corner') {
    const n = roadLineCalibrationCanvasToNorm(dom.work, x, y);
    placement.corners[drag.corner] = [roadLineCalibrationClamp01(n.x), roadLineCalibrationClamp01(n.y)];
  } else if (drag.type === 'move') {
    const tileRect = roadLineCalibrationTileRect(dom.work);
    const dxNorm = (x - drag.sx) / tileRect.w;
    const dyNorm = (y - drag.sy) / tileRect.h;
    placement.corners = drag.startCorners.map(([cx, cy]) => [roadLineCalibrationClamp01(cx + dxNorm), roadLineCalibrationClamp01(cy + dyNorm)]);
  }
  roadLineCalibrationCommit();
  renderRoadLineCalibration();
}

function onRoadLineCalibrationWorkUp() {
  roadLineCalibrationDrag = null;
}

function onRoadLineCalibrationWheel(ev) {
  ev.preventDefault();
  const f = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  roadLineCalibrationView.zoom = Math.max(ROAD_LINE_CALIBRATION_MIN_ZOOM,
    Math.min(ROAD_LINE_CALIBRATION_MAX_ZOOM, roadLineCalibrationView.zoom * f));
  renderRoadLineCalibration();
}

// Nudges either one corner (roadLineCalibrationSelectedCorner set) or the whole placement
// (null - every corner moves together, i.e. a pure translate) by (dx, dy) normalized units.
function roadLineCalibrationNudgeSelected(dx, dy) {
  const placement = roadLineCalibrationCurrentPlacements()[roadLineCalibrationSelected];
  if (!placement) return;
  if (roadLineCalibrationSelectedCorner === null) {
    placement.corners = placement.corners.map(([x, y]) => [roadLineCalibrationClamp01(x + dx), roadLineCalibrationClamp01(y + dy)]);
  } else {
    const [x, y] = placement.corners[roadLineCalibrationSelectedCorner];
    placement.corners[roadLineCalibrationSelectedCorner] = [roadLineCalibrationClamp01(x + dx), roadLineCalibrationClamp01(y + dy)];
  }
  roadLineCalibrationCommit();
  renderRoadLineCalibrationList();
  renderRoadLineCalibration();
}

// A fresh AI-generated marking is typically flat, pure-colour, full-alpha art - it reads as a
// sticker pasted over the tile's own worn, semi-transparent paint (the bug report this fixed:
// a bus-stop text mark looking far too stark against the asphalt). Nudges the SELECTED
// PLACEMENT's opacity (not a per-corner thing, so it ignores roadLineCalibrationSelectedCorner).
function roadLineCalibrationNudgeOpacity(delta) {
  const placement = roadLineCalibrationCurrentPlacements()[roadLineCalibrationSelected];
  if (!placement) return;
  const current = placement.opacity ?? 1;
  placement.opacity = Math.max(0.1, Math.min(1, Math.round((current + delta) * 100) / 100));
  roadLineCalibrationCommit();
  renderRoadLineCalibrationList();
  renderRoadLineCalibration();
}

function roadLineCalibrationDeleteSelected() {
  const placements = roadLineCalibrationCurrentPlacements();
  if (roadLineCalibrationSelected < 0 || roadLineCalibrationSelected >= placements.length) return;
  placements.splice(roadLineCalibrationSelected, 1);
  roadLineCalibrationSelected = -1;
  roadLineCalibrationSelectedCorner = null;
  roadLineCalibrationCommit();
  renderRoadLineCalibrationList();
  renderRoadLineCalibration();
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

function setRoadLineCalibrationMessage(text, tone) {
  const dom = roadLineCalibrationDom;
  if (!dom?.msg) return;
  dom.msg.textContent = text;
  dom.msg.dataset.tone = tone || 'info';
}

// A JSON export can be thousands of characters, so save.js's showTextPromptDialog (a single-
// line, 30-char input built for short names) doesn't fit it - this is its own small dialog,
// reusing the same shared .sim-dialog/.dialog-* CSS the rest of the app's dialogs use, but with
// a <textarea>. Resolves the pasted text, or null on cancel/Escape.
function showRoadLineJsonPasteDialog(message) {
  return new Promise((resolve) => {
    let dialog = document.getElementById('rlcal-paste-dialog');
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.id = 'rlcal-paste-dialog';
      dialog.className = 'sim-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.innerHTML = `
        <div class="dialog-overlay" data-rlcal-paste-cancel></div>
        <form class="dialog-box" style="max-width:560px; width:92vw">
          <div class="dialog-title-bar">
            <span data-rlcal-paste-title></span>
            <button class="dialog-close-btn" type="button" data-rlcal-paste-cancel>✕</button>
          </div>
          <div class="dialog-body">
            <textarea class="dialog-text-input" style="width:100%;height:220px;font:12px/1.4 ui-monospace,monospace;resize:vertical" spellcheck="false"></textarea>
          </div>
          <div class="dialog-footer">
            <button class="dialog-cancel-btn" type="button" data-rlcal-paste-cancel></button>
            <button class="dialog-ok-btn" type="submit"></button>
          </div>
        </form>
      `;
      document.body.appendChild(dialog);
    }
    const titleEl = dialog.querySelector('[data-rlcal-paste-title]');
    const inputEl = dialog.querySelector('.dialog-text-input');
    const okBtn = dialog.querySelector('.dialog-ok-btn');
    const cancelBtn = dialog.querySelector('.dialog-cancel-btn');
    const formEl = dialog.querySelector('form');

    titleEl.textContent = message;
    inputEl.value = '';
    okBtn.textContent = typeof t === 'function' ? t('dialog.ok') : 'OK';
    cancelBtn.textContent = typeof t === 'function' ? t('dialog.cancel') : 'Cancel';

    let settled = false;
    const cleanup = () => {
      dialog.style.display = 'none';
      formEl.removeEventListener('submit', onSubmit);
      dialog.querySelectorAll('[data-rlcal-paste-cancel]').forEach((el) => el.removeEventListener('click', onCancel));
      document.removeEventListener('keydown', onKeyDown);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onSubmit = (e) => { e.preventDefault(); finish(inputEl.value); };
    const onCancel = () => finish(null);
    // Only this dialog's own Escape, not the calibrator's (stopPropagation keeps the whole
    // calibrator modal from also closing on the same keypress).
    const onKeyDown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(null); } };

    formEl.addEventListener('submit', onSubmit);
    dialog.querySelectorAll('[data-rlcal-paste-cancel]').forEach((el) => el.addEventListener('click', onCancel));
    document.addEventListener('keydown', onKeyDown);

    dialog.style.display = 'flex';
    window.setTimeout(() => inputEl.focus(), 0);
  });
}

function createRoadLineCalibrationDom() {
  if (roadLineCalibrationDom) return roadLineCalibrationDom;
  if (typeof document === 'undefined' || !document.body) return null;
  if (!document.getElementById('rlcal-style')) {
    const style = document.createElement('style');
    style.id = 'rlcal-style';
    style.textContent = `
      #rlcal-modal{position:fixed;inset:0;z-index:200000;background:rgba(4,8,14,.82);
        display:flex;align-items:center;justify-content:center;
        font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#eaf6ff}
      #rlcal-modal[hidden]{display:none!important}
      /* save.js's showTextPromptDialog ('.sim-dialog', z-index:300) and this file's own JSON-
         paste dialog would otherwise render behind #rlcal-modal (z-index:200000) - an id
         selector beats the shared .sim-dialog class regardless of stylesheet order, so this
         doesn't touch how either dialog stacks anywhere else in the app. */
      #text-prompt-dialog, #rlcal-paste-dialog{z-index:200001}
      #rlcal-win{width:min(1100px,96vw);height:min(760px,94vh);display:flex;gap:0;
        border:1px solid #33475f;border-radius:14px;overflow:hidden;background:#0b111b;
        box-shadow:0 30px 90px rgba(0,0,0,.6)}
      #rlcal-left{flex:1;position:relative;background:#070c15}
      #rlcal-work{width:100%;height:100%;display:block;background:#0b1322;cursor:grab}
      #rlcal-work:active{cursor:grabbing}
      #rlcal-worktools{position:absolute;top:10px;left:10px;display:flex;gap:5px;align-items:center;
        background:rgba(9,17,28,.85);border:1px solid #2a3a52;border-radius:8px;padding:5px 7px}
      #rlcal-effect-wrap{position:absolute;left:10px;bottom:10px;background:rgba(9,17,28,.9);
        border:1px solid #2a3a52;border-radius:8px;padding:6px}
      #rlcal-effect-wrap div{color:#8fb3c8;margin-bottom:4px}
      #rlcal-effect{display:block;border-radius:4px;background:#0b1322}
      #rlcal-right{width:320px;flex:0 0 320px;background:rgba(9,17,28,.98);border-left:1px solid #33475f;
        overflow-y:auto;padding:12px}
      #rlcal-right h4{font-weight:800;color:#8fd6ff;letter-spacing:.04em;margin:12px 0 6px}
      #rlcal-right h4:first-child{margin-top:0}
      #rlcal-right select{width:100%;background:#123243;color:#eaf6ff;border:1px solid #3f7f9c;border-radius:6px;padding:5px;font:inherit}
      #rlcal-modal button{border:1px solid #3f7f9c;border-radius:7px;padding:5px 8px;color:#eaf6ff;background:#123243;font:inherit;cursor:pointer}
      #rlcal-modal button:hover{background:#1a4a62}
      #rlcal-right .rl-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0}
      #rlcal-right .rl-add{display:flex;gap:6px;margin:6px 0}
      #rlcal-right .rl-add select{flex:1}
      #rlcal-right .rl-list{display:grid;gap:4px;margin:6px 0}
      #rlcal-right .rl-item{display:flex;flex-direction:column;gap:4px;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.03)}
      #rlcal-right .rl-item[data-selected="true"]{background:rgba(143,214,255,.15)}
      #rlcal-right .rl-item-main{display:flex;align-items:center;gap:5px}
      #rlcal-right .rl-item-main span{flex:1;color:#a9c6da;font-size:11px;cursor:pointer}
      #rlcal-right .rl-item button{padding:3px 6px;font-size:11px}
      #rlcal-right .rl-item-opacity{display:flex;align-items:center;gap:5px;padding-left:4px}
      #rlcal-right .rl-item-opacity span{color:#8fb3c8;font-size:10.5px;flex:1}
      #rlcal-right .rl-item-opacity button{padding:1px 8px;font-size:12px;font-weight:700}
      #rlcal-right .rl-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
      #rlcal-right .rl-msg{min-height:15px;margin-top:7px;color:#a9c6da}
      #rlcal-right .rl-msg[data-tone="success"]{color:#9be89b}
      #rlcal-right .rl-msg[data-tone="error"]{color:#ff9a9a}
      #rlcal-right .rl-savestatus{font-size:10.5px;color:#5c7691;margin:2px 0 8px;padding:3px 6px;
        border-radius:5px;background:rgba(255,255,255,.03)}
      #rlcal-right .rl-savestatus[data-tone="success"]{color:#9be89b}
      #rlcal-right .rl-savestatus[data-tone="error"]{color:#ff9a9a;background:rgba(255,60,60,.08)}
      #rlcal-right .rl-help{color:#5c7691;font-size:11px;line-height:1.6;margin-top:8px}
    `;
    document.head.appendChild(style);
  }

  const modal = document.createElement('div');
  modal.id = 'rlcal-modal';
  modal.hidden = true;
  const tileOptions = Object.entries(ROAD_LINE_CALIBRATION_TILE_LABELS)
    .map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  const markingOptions = (typeof getRoadLineMarkingKeys === 'function' ? getRoadLineMarkingKeys() : [])
    .map((k) => `<option value="${k}">${k}</option>`).join('');
  modal.innerHTML = `
    <div id="rlcal-win">
      <div id="rlcal-left">
        <canvas id="rlcal-work"></canvas>
        <div id="rlcal-worktools">
          <button type="button" class="rl-zoom-out">−</button>
          <b class="rl-zoom" style="min-width:3.5ch;text-align:center">300%</b>
          <button type="button" class="rl-zoom-in">＋</button>
          <button type="button" class="rl-fit">置中</button>
        </div>
        <div id="rlcal-effect-wrap">
          <div>乾淨預覽（冇校正框）</div>
          <canvas id="rlcal-effect" width="220" height="130"></canvas>
        </div>
      </div>
      <div id="rlcal-right">
        <h4>馬路劃線位置校正 <button type="button" class="rl-close" style="float:right">✕ 收起</button></h4>
        <div class="rl-savestatus">未有改動</div>
        <div class="rl-row"><span>路 tile</span></div>
        <select class="rl-tile">${tileOptions}</select>
        <div class="rl-row" style="margin-top:8px"><span>印刷款式（同一個 tile 形狀可以有幾款）</span></div>
        <div class="rl-add">
          <select class="rl-variant"></select>
          <button type="button" class="rl-variant-add" title="新增款式">＋新款</button>
          <button type="button" class="rl-variant-del" title="刪除呢個款式（連埋佢啲劃線一齊刪）">🗑︎</button>
        </div>
        <h4>加劃線</h4>
        <div class="rl-add">
          <select class="rl-marking">${markingOptions}</select>
          <button type="button" class="rl-add-btn">＋加</button>
        </div>
        <h4>已擺放</h4>
        <div class="rl-list"></div>
        <div class="rl-help">拖角落4個點（好似校正窗戶咁）郁單一角，或者拖圖案中間郁成塊。太突兀好似貼紙？喺下面清單度撳每行嘅 − / ＋ 淡化/加深。撳 × 刪除單一劃線。</div>
        <div class="rl-actions">
          <button type="button" class="rl-copy">複製 JS</button>
          <button type="button" class="rl-export">匯出 JSON</button>
          <button type="button" class="rl-import">匯入 JSON</button>
          <button type="button" class="rl-clear">清空劃線（保留呢個款式）</button>
        </div>
        <div class="rl-msg"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const work = modal.querySelector('#rlcal-work');
  const effect = modal.querySelector('#rlcal-effect');
  roadLineCalibrationDom = {
    modal, work, workCtx: work.getContext('2d', { willReadFrequently: true }),
    effect, effectCtx: effect.getContext('2d', { willReadFrequently: true }),
    tileSel: modal.querySelector('.rl-tile'),
    variantSel: modal.querySelector('.rl-variant'),
    markingSel: modal.querySelector('.rl-marking'),
    list: modal.querySelector('.rl-list'),
    zoom: modal.querySelector('.rl-zoom'),
    msg: modal.querySelector('.rl-msg'),
    saveStatus: modal.querySelector('.rl-savestatus'),
  };

  modal.querySelector('.rl-close').addEventListener('click', () => teardownRoadLineCalibrator());
  modal.querySelector('.rl-zoom-in').addEventListener('click', () => {
    roadLineCalibrationView.zoom = Math.min(ROAD_LINE_CALIBRATION_MAX_ZOOM, roadLineCalibrationView.zoom * 1.2);
    renderRoadLineCalibration();
  });
  modal.querySelector('.rl-zoom-out').addEventListener('click', () => {
    roadLineCalibrationView.zoom = Math.max(ROAD_LINE_CALIBRATION_MIN_ZOOM, roadLineCalibrationView.zoom / 1.2);
    renderRoadLineCalibration();
  });
  modal.querySelector('.rl-fit').addEventListener('click', () => {
    roadLineCalibrationView.panX = 0;
    roadLineCalibrationView.panY = 0;
    roadLineCalibrationView.zoom = 3;
    renderRoadLineCalibration();
  });
  roadLineCalibrationDom.tileSel.addEventListener('change', (e) => {
    roadLineCalibrationTileKey = e.target.value;
    roadLineCalibrationSelected = -1;
    const ids = roadLineCalibrationVariantIdsFor(roadLineCalibrationTileKey);
    roadLineCalibrationVariantId = ids[0];
    roadLineCalibrationLoadTile(roadLineCalibrationTileKey);
    populateRoadLineCalibrationVariantSelect();
    renderRoadLineCalibrationList();
    renderRoadLineCalibration();
  });
  roadLineCalibrationDom.variantSel.addEventListener('change', (e) => {
    roadLineCalibrationVariantId = e.target.value;
    roadLineCalibrationSelected = -1;
    renderRoadLineCalibrationList();
    renderRoadLineCalibration();
  });
  modal.querySelector('.rl-variant-add').addEventListener('click', async () => {
    // window.prompt() is not implemented by Electron/Chromium - it returns null immediately
    // with no dialog shown at all (see inspect-panel.js/main.js's own note on this).
    // showTextPromptDialog is the app's own in-page modal (save.js, already used for "Save
    // As"/building rename), which actually works.
    const name = typeof showTextPromptDialog === 'function'
      ? await showTextPromptDialog('新款式名（英文/駝峰,例如 busStop、stopLine、parkingBay）：')
      : null;
    if (name === null) return; // cancelled
    const id = name.trim();
    if (!id) return;
    roadLineCalibrationVariantId = id;
    roadLineCalibrationSelected = -1;
    roadLineCalibrationCurrentPlacements(); // materialises the (tile, variant) entry
    populateRoadLineCalibrationVariantSelect();
    renderRoadLineCalibrationList();
    renderRoadLineCalibration();
  });
  modal.querySelector('.rl-variant-del').addEventListener('click', () => {
    // window.confirm() DOES work in Electron (unlike window.prompt() - see the note on
    // showTextPromptDialog above) - safe to use directly for this one destructive step.
    const label = typeof getRoadLineVariantLabel === 'function'
      ? getRoadLineVariantLabel(roadLineCalibrationVariantId) : roadLineCalibrationVariantId;
    if (typeof confirm === 'function' && !confirm(`刪除「${label}」呢個款式？佢底下所有劃線都會一齊冇咗，冇得返轉頭。`)) return;
    const key = roadLineCalibrationKey(roadLineCalibrationTileKey, roadLineCalibrationVariantId);
    deleteRoadLineCalibrationEntry(key);
    const ids = roadLineCalibrationVariantIdsFor(roadLineCalibrationTileKey);
    roadLineCalibrationVariantId = ids[0];
    roadLineCalibrationSelected = -1;
    populateRoadLineCalibrationVariantSelect();
    renderRoadLineCalibrationList();
    renderRoadLineCalibration();
    setRoadLineCalibrationMessage(`已刪除款式「${label}」`, 'success');
  });
  modal.querySelector('.rl-add-btn').addEventListener('click', () => {
    const marking = roadLineCalibrationDom.markingSel.value;
    if (!marking) return;
    const placements = roadLineCalibrationCurrentPlacements();
    // Starts a touch faded (not full 1.0) - fresh AI marking art is typically flat/full-alpha
    // and reads as a sticker on top of the tile's own worn paint at full strength; [ ] tunes it.
    placements.push({ marking, corners: roadLineCalibrationDefaultCorners(marking), opacity: 0.85 });
    roadLineCalibrationSelected = placements.length - 1;
    roadLineCalibrationSelectedCorner = null;
    roadLineCalibrationCommit();
    renderRoadLineCalibrationList();
    renderRoadLineCalibration();
  });
  modal.querySelector('.rl-copy').addEventListener('click', () => {
    copyRoadLineCalibrationText(buildRoadLineCalibrationRecord(), 'JS 已複製 / 印落 console');
  });
  modal.querySelector('.rl-export').addEventListener('click', () => {
    copyRoadLineCalibrationText(buildRoadLineCalibrationJSON(), 'JSON 已複製 / 印落 console');
  });
  modal.querySelector('.rl-import').addEventListener('click', async () => {
    const text = await showRoadLineJsonPasteDialog('貼返之前匯出嘅 JSON：');
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      await replaceRoadLineCalibrationEntries(parsed?.entries ?? parsed);
      renderRoadLineCalibrationList();
      renderRoadLineCalibration();
      setRoadLineCalibrationMessage('匯入成功', 'success');
    } catch { setRoadLineCalibrationMessage('JSON 格式錯誤', 'error'); }
  });
  modal.querySelector('.rl-clear').addEventListener('click', () => {
    const key = roadLineCalibrationKey(roadLineCalibrationTileKey, roadLineCalibrationVariantId);
    roadLineCalibrationOverrides[key] = [];
    roadLineCalibrationSelected = -1;
    roadLineCalibrationCommit();
    renderRoadLineCalibrationList();
    renderRoadLineCalibration();
  });

  work.addEventListener('pointerdown', onRoadLineCalibrationWorkDown);
  work.addEventListener('pointermove', onRoadLineCalibrationWorkMove);
  window.addEventListener('pointerup', onRoadLineCalibrationWorkUp);
  work.addEventListener('wheel', onRoadLineCalibrationWheel, { passive: false });

  return roadLineCalibrationDom;
}

// Keeps the variant <select> in sync with whatever (tile, variant) pairs actually have
// entries in roadLineCalibrationOverrides for the current tile, always including whichever
// variant is selected right now even if it has no placements yet (a just-added blank variant).
function populateRoadLineCalibrationVariantSelect() {
  const dom = roadLineCalibrationDom;
  if (!dom) return;
  const ids = new Set(roadLineCalibrationVariantIdsFor(roadLineCalibrationTileKey));
  ids.add(roadLineCalibrationVariantId);
  dom.variantSel.replaceChildren(...[...ids].map((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = typeof getRoadLineVariantLabel === 'function' ? getRoadLineVariantLabel(id) : id;
    return opt;
  }));
  dom.variantSel.value = roadLineCalibrationVariantId;
}

function renderRoadLineCalibrationList() {
  const dom = roadLineCalibrationDom;
  if (!dom) return;
  dom.tileSel.value = roadLineCalibrationTileKey;
  populateRoadLineCalibrationVariantSelect();
  dom.zoom.textContent = `${Math.round(roadLineCalibrationView.zoom * 100)}%`;
  const placements = roadLineCalibrationCurrentPlacements();
  dom.list.replaceChildren(...placements.map((p, i) => {
    const row = document.createElement('div');
    row.className = 'rl-item';
    row.dataset.selected = String(i === roadLineCalibrationSelected);

    const main = document.createElement('div');
    main.className = 'rl-item-main';
    const span = document.createElement('span');
    const cx = p.corners.reduce((s, c) => s + c[0], 0) / 4;
    const cy = p.corners.reduce((s, c) => s + c[1], 0) / 4;
    span.textContent = `${p.marking}  中心(${cx.toFixed(2)}, ${cy.toFixed(2)})`;
    span.addEventListener('click', () => {
      roadLineCalibrationSelected = i;
      roadLineCalibrationSelectedCorner = null;
      renderRoadLineCalibrationList();
      renderRoadLineCalibration();
    });
    const del = document.createElement('button');
    del.textContent = '×';
    del.addEventListener('click', () => { roadLineCalibrationSelected = i; roadLineCalibrationDeleteSelected(); });
    main.append(span, del);

    // On-screen opacity controls - not gated on keyboard focus or selection, so it works
    // regardless of whatever's stealing this Electron window's keydown events.
    const opacityRow = document.createElement('div');
    opacityRow.className = 'rl-item-opacity';
    const opacityLabel = document.createElement('span');
    const setOpacityLabel = () => { opacityLabel.textContent = `透明度 ${Math.round((p.opacity ?? 1) * 100)}%`; };
    setOpacityLabel();
    const nudgeThisOpacity = (delta) => {
      p.opacity = Math.max(0.1, Math.min(1, Math.round(((p.opacity ?? 1) + delta) * 100) / 100));
      setOpacityLabel();
      const key = roadLineCalibrationKey(roadLineCalibrationTileKey, roadLineCalibrationVariantId);
      saveRoadLineCalibrationEntry(key, roadLineCalibrationCurrentPlacements());
      renderRoadLineCalibration();
    };
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.textContent = '−';
    minus.addEventListener('click', () => nudgeThisOpacity(-0.05));
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.textContent = '＋';
    plus.addEventListener('click', () => nudgeThisOpacity(0.05));
    opacityRow.append(opacityLabel, minus, plus);

    row.append(main, opacityRow);
    return row;
  }));
  if (!placements.length) {
    const empty = document.createElement('div');
    empty.style.color = '#5c7691';
    empty.textContent = `「${dom.variantSel.selectedOptions[0]?.textContent ?? roadLineCalibrationVariantId}」款未有劃線 — 揀一款上面加落去。`;
    dom.list.replaceChildren(empty);
  }
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

function roadLineCalibrationPlacementLiteral(p, indent) {
  const pad = ' '.repeat(indent);
  const rnd = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
  const corners = p.corners.map(([x, y]) => `[${rnd(x)}, ${rnd(y)}]`).join(', ');
  const opacity = p.opacity ?? 1;
  const opacityField = opacity < 1 ? `, opacity: ${rnd(opacity)}` : '';
  return `${pad}{ marking: '${p.marking}', corners: [${corners}]${opacityField} },`;
}

// Regroups the flat `${tileKey}::${variantId}` storage keys back into the nested
// {tileKey: {variantId: [...]}} shape ROAD_LINE_TILE_PROFILES actually uses. 'plain' variants
// (an explicit "no markings" record some workflow kept) are dropped: the frozen constant has no
// 'plain' entry, since applyRoadLineTexture already treats "no variant" as the base tile.
function buildRoadLineCalibrationRecord() {
  const byTile = {};
  Object.entries(roadLineCalibrationOverrides).forEach(([key, list]) => {
    if (!Array.isArray(list) || !list.length) return;
    const sep = key.indexOf('::');
    if (sep < 0) return;
    const tileKey = key.slice(0, sep);
    const variantId = key.slice(sep + 2);
    if (variantId === 'plain') return;
    (byTile[tileKey] ??= {})[variantId] = list;
  });
  const tileKeys = Object.keys(byTile);
  if (!tileKeys.length) return '// road-line-calibrator export — 未有任何劃線,先擺幾個再複製';
  const body = tileKeys.map((tileKey) => {
    const variantLines = Object.entries(byTile[tileKey]).map(([variantId, list]) => {
      const placementLines = list.map((p) => roadLineCalibrationPlacementLiteral(p, 6)).join('\n');
      return `    ${variantId}: [\n${placementLines}\n    ],`;
    }).join('\n');
    return `  ${tileKey}: {\n${variantLines}\n  },`;
  }).join('\n');
  return `// road-line-calibrator export · schema v${ROAD_LINE_CALIBRATION_SCHEMA_VERSION}\n`
    + `// 貼落 road-line-markings.js 嘅 ROAD_LINE_TILE_PROFILES 度（換走個 Object.freeze({...}) 入面嘅內容）\n`
    + `Object.freeze({\n${body}\n})`;
}

function buildRoadLineCalibrationJSON() {
  return JSON.stringify({
    schemaVersion: ROAD_LINE_CALIBRATION_SCHEMA_VERSION,
    kind: 'road-line-profiles',
    entries: roadLineCalibrationOverrides,
    savedAt: new Date().toISOString(),
  }, null, 2);
}

function copyRoadLineCalibrationText(text, ok) {
  const p = typeof copyVisualRouteCalibrationText === 'function'
    ? copyVisualRouteCalibrationText(text)
    : (navigator?.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject());
  p.then(() => setRoadLineCalibrationMessage(ok, 'success'))
    .catch(() => setRoadLineCalibrationMessage('複製失敗（睇 console）', 'error'));
  if (typeof console !== 'undefined') console.log(text);
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

function startRoadLineCalibrator(scene) {
  roadLineCalibrationActive = true;
  roadLineCalibrationScene = scene;
  if (scene) scene.roadLineCalibrationActive = true;

  roadLineCalibrationWasPaused = typeof isSimPaused === 'function' ? isSimPaused()
    : (typeof simPaused !== 'undefined' ? simPaused : false);
  if (typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') {
    setGameSpeed(GAME_SPEEDS.PAUSED);
  }

  createRoadLineCalibrationDom();
  roadLineCalibrationDom.modal.hidden = false;
  const canvas = roadLineCalibrationDom.work;

  // Attached FIRST, before anything that renders/loads - keyboard input must not depend on
  // every render call downstream succeeding. (A render exception here previously left the
  // modal visibly open, with mouse-drag still working since those listeners are wired in
  // createRoadLineCalibrationDom, but the keydown listener - registered after render calls -
  // never got attached at all: "keyboard does nothing" with no error shown anywhere.)
  roadLineCalibrationKeyHandler = (e) => {
    if (!roadLineCalibrationActive) return;
    if (e.key === 'Escape') { teardownRoadLineCalibrator(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { roadLineCalibrationDeleteSelected(); return; }
    if (e.key >= '1' && e.key <= '4') {
      roadLineCalibrationSelectedCorner = Number(e.key) - 1;
      renderRoadLineCalibration();
      return;
    }
    if (e.key === '0') { roadLineCalibrationSelectedCorner = null; renderRoadLineCalibration(); return; }
    const step = e.shiftKey ? 0.02 : 0.004;
    if (e.key === 'ArrowLeft') { roadLineCalibrationNudgeSelected(-step, 0); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { roadLineCalibrationNudgeSelected(step, 0); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { roadLineCalibrationNudgeSelected(0, -step); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { roadLineCalibrationNudgeSelected(0, step); e.preventDefault(); }
    else if (e.key === '[') { roadLineCalibrationNudgeOpacity(-0.05); }
    else if (e.key === ']') { roadLineCalibrationNudgeOpacity(0.05); }
  };
  window.addEventListener('keydown', roadLineCalibrationKeyHandler);

  const resize = () => {
    const box = roadLineCalibrationDom.modal.querySelector('#rlcal-left').getBoundingClientRect();
    canvas.width = Math.max(200, Math.round(box.width));
    canvas.height = Math.max(200, Math.round(box.height));
    renderRoadLineCalibration();
  };
  window.addEventListener('resize', resize);
  roadLineCalibrationDom._resizeHandler = resize;

  // Everything from here on is rendering/data-loading - wrapped so a bug in any of it (a
  // missing asset, a bad cached image, ...) can never again take the keyboard listener above
  // down with it. Logged loudly instead of swallowed, so it actually surfaces in DevTools.
  try {
    resize();
    roadLineCalibrationLoadTile(roadLineCalibrationTileKey);
    loadRoadLineCalibrationStore().then(() => {
      // Now that stored entries have arrived, point the variant picker at a real one for the
      // current tile instead of the 'plain' placeholder it started on - but only if the user
      // hasn't already picked or created a variant while this fetch was in flight (a real gap:
      // "+新款" resolves synchronously, this resolves after a network round trip, so a fast
      // "create a variant, then immediately add a marking" was liable to have this overwrite
      // that choice back to 'plain' or whatever loaded first).
      if (roadLineCalibrationVariantId === 'plain') {
        roadLineCalibrationVariantId = roadLineCalibrationVariantIdsFor(roadLineCalibrationTileKey)[0];
      }
      renderRoadLineCalibrationList();
      renderRoadLineCalibration();
    }).catch((error) => console.error('[road-line-calibrator] store load failed:', error));
    renderRoadLineCalibrationList();
    renderRoadLineCalibration();

    // Road tiles bypass the Models/ staging pipeline entirely (prepare-release-assets.js only
    // walks Models/; newRoadTiles/ is loaded at its own raw path - road-tile-sets.js). So
    // unlike building-light-calibrator there is no staged/packaged-art mismatch to warn about:
    // this workbench shows exactly the PNG scripts/bake-road-line-textures.js composites onto.
    setRoadLineCalibrationMessage('揀路 tile → 揀劃線款式 → ＋加，然後拖去啱嘅位。', 'info');
  } catch (error) {
    console.error('[road-line-calibrator] startup render failed (keyboard still works):', error);
    setRoadLineCalibrationMessage('開啟時出咗少少問題，睇下 DevTools console。', 'error');
  }
}

function teardownRoadLineCalibrator() {
  roadLineCalibrationActive = false;
  roadLineCalibrationDrag = null;
  if (roadLineCalibrationDom) {
    roadLineCalibrationDom.modal.hidden = true;
    if (roadLineCalibrationDom._resizeHandler) window.removeEventListener('resize', roadLineCalibrationDom._resizeHandler);
  }
  if (roadLineCalibrationScene) roadLineCalibrationScene.roadLineCalibrationActive = false;
  if (!roadLineCalibrationWasPaused && typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') {
    setGameSpeed(GAME_SPEEDS.NORMAL);
  }
  if (roadLineCalibrationKeyHandler) {
    window.removeEventListener('keydown', roadLineCalibrationKeyHandler);
    roadLineCalibrationKeyHandler = null;
  }
}

function toggleRoadLineCalibrator(scene) {
  if (roadLineCalibrationActive) { teardownRoadLineCalibrator(); return false; }
  if (!scene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
    || !isVisualRouteCalibrationTestModeEnabled()) return false;
  startRoadLineCalibrator(scene);
  return true;
}

// ---------------------------------------------------------------------------

const roadLineCalibratorTestApi = {
  ROAD_LINE_CALIBRATION_SCHEMA_VERSION,
  ROAD_LINE_CALIBRATION_TILE_LABELS,
  isRoadLineCalibrationActive,
  buildRoadLineCalibrationRecord,
  buildRoadLineCalibrationJSON,
  roadLineCalibrationPlacementLiteral,
  migrateRoadLinePlacement,
  setRoadLineCalibrationOverrides,
  toggleRoadLineCalibrator,
  _setEntryForTest(key, placements) { roadLineCalibrationOverrides[key] = placements; },
  _clearForTest() { Object.keys(roadLineCalibrationOverrides).forEach((k) => delete roadLineCalibrationOverrides[k]); },
};

if (typeof module !== 'undefined' && module.exports) module.exports = roadLineCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleRoadLineCalibrator,
    teardownRoadLineCalibrator,
    isRoadLineCalibrationActive,
  });
}
