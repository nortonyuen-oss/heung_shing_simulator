// 建築比例量度 (test-mode dev tool): measures how big each building model is drawn, so the game's
// buildings can be put on one scale with the roads, vehicles and people (docs/world-scale.md, stage 1).
// It changes nothing on screen outside the tool: it only records.
//
// Pick a building, then drag vertically over its art across a span whose real height you know -
// a number of storeys (每層高度, 3 m by default) or a door. The span's screen height at zoom 1 over
// its metres gives the model's px a metre of height, which is compared with the people and street
// props (5 px a metre, the same rule as street-furniture.js and festival-sprites.js) and turned into
// the tile size the art implies: a true 2:1 projection draws a vertical metre 1.22 times as tall as a
// metre along a map axis is wide, so tile metres = (TILE_WIDTH / 2) * 1.22 / (px a metre of height).
// Next to the span the tool draws a 1.7 m person and a 3 m storey at the people's scale.
//
// Dragging a span end moves it; 1/2 pick an end, arrow keys move it a source pixel (Shift: five).
// Results stay in this browser until 「複製 JSON」 copies the whole table (shipped file plus local
// measurements) for data/building-scale-survey.json; scripts/building-scale-report.js summarises it.
// A measurement keeps the sprite scale it was taken at: re-measure a model after its ground corners
// (building-ground-calibrator.js) or footprint change.

const BUILDING_SCALE_SURVEY_STORAGE_KEY = 'building-scale-survey:v1';
const BUILDING_SCALE_SURVEY_URL = 'data/building-scale-survey.json';
// Screen px a metre of height at zoom 1 for people and street props (STREET_FURNITURE_PX_PER_METRE).
const BUILDING_SCALE_PEOPLE_PX_PER_M = 5;
// A vertical metre over the horizontal width of a metre along a map axis, in a true 2:1 projection
// (camera 30 degrees down): cos 30 / cos 45.
const BUILDING_SCALE_TRUE_UP_RATIO = Math.cos(Math.PI / 6) / Math.cos(Math.PI / 4);
const BUILDING_SCALE_DEFAULT_STOREY_M = 3;
const BUILDING_SCALE_PERSON_M = 1.7;
const BUILDING_SCALE_HANDLE_RADIUS_PX = 6;   // screen pixels
const BUILDING_SCALE_PICK_ALPHA = 24;
const BUILDING_SCALE_COLORS = Object.freeze({
  span: 0x5ad7ff,
  person: 0xff9f43,
  storey: 0xffffff,
  hover: 0xffffff,
});

function getBuildingScaleTileWidth() {
  return typeof TILE_WIDTH === 'number' ? TILE_WIDTH : 100;
}

// What a span of `metres` that is `sourcePx` tall in the source PNG says about the model, given how
// the game draws that PNG (screen px per source px at zoom 1: texture resize times sprite scale).
function measureBuildingScale(sourcePx, metres, screenPxPerSourcePx, tileWidth = getBuildingScaleTileWidth()) {
  const screenPx = Math.abs(sourcePx) * screenPxPerSourcePx;
  if (!(metres > 0) || !(screenPx > 0)) return null;
  const upPxPerM = screenPx / metres;
  return {
    screenPx,
    upPxPerM,
    vsPeople: upPxPerM / BUILDING_SCALE_PEOPLE_PX_PER_M,
    tileM: ((tileWidth / 2) * BUILDING_SCALE_TRUE_UP_RATIO) / upPxPerM,
  };
}

function roundBuildingScaleNumber(value, places = 3) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function roundBuildingScalePoint([x, y]) {
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

// One table entry from a span and the sprite it was measured on.
function buildBuildingScaleEntry({ a, b, storeys, storeyM, metres, footprint, screenPxPerSourcePx }) {
  const height = metres > 0 ? metres : (Number(storeys) || 1) * (Number(storeyM) || BUILDING_SCALE_DEFAULT_STOREY_M);
  const measured = measureBuildingScale(b[1] - a[1], height, screenPxPerSourcePx);
  if (!measured) return null;
  return {
    a: roundBuildingScalePoint(a),
    b: roundBuildingScalePoint(b),
    ...(metres > 0 ? { metres: roundBuildingScaleNumber(metres, 2) } : {
      storeys: Number(storeys) || 1,
      storeyM: roundBuildingScaleNumber(Number(storeyM) || BUILDING_SCALE_DEFAULT_STOREY_M, 2),
    }),
    footprint: footprint.map(Number),
    screenPxPerSourcePx: roundBuildingScaleNumber(screenPxPerSourcePx, 6),
    upPxPerM: roundBuildingScaleNumber(measured.upPxPerM),
    vsPeople: roundBuildingScaleNumber(measured.vsPeople),
    tileM: roundBuildingScaleNumber(measured.tileM, 1),
  };
}

// Sorted by tile metres, with a few landmarks of the spread.
function summarizeBuildingScaleSurvey(table) {
  const rows = Object.entries(table || {})
    .filter(([, entry]) => entry && Number.isFinite(entry.tileM))
    .map(([path, entry]) => ({ path, ...entry }))
    .sort((p, q) => p.tileM - q.tileM);
  const values = rows.map((row) => row.tileM);
  const quantile = (q) => {
    if (!values.length) return null;
    const at = (values.length - 1) * q;
    const lo = Math.floor(at);
    return values[lo] + (values[Math.min(lo + 1, values.length - 1)] - values[lo]) * (at - lo);
  };
  const buckets = [
    ['< 12 m', -Infinity, 12],
    ['12–17 m', 12, 17],
    ['17–25 m', 17, 25],
    ['25–35 m', 25, 35],
    ['≥ 35 m', 35, Infinity],
  ].map(([label, lo, hi]) => ({ label, count: values.filter((v) => v >= lo && v < hi).length }));
  return { rows, count: rows.length, median: quantile(0.5), p10: quantile(0.1), p90: quantile(0.9), buckets };
}

// path -> entry, or null (= drop the shipped one)
const buildingScaleSurveyOverrides = loadBuildingScaleSurveyOverrides();
let buildingScaleSurveyShipped = {};
let buildingScaleSurveyShippedLoad = null;

// Plain Node (the report script) has no game storage; touching its experimental localStorage warns.
function buildingScaleSurveyHasStorage() {
  return typeof window !== 'undefined' || typeof module === 'undefined';
}

function loadBuildingScaleSurveyOverrides() {
  if (!buildingScaleSurveyHasStorage()) return {};
  try {
    const raw = globalThis.localStorage?.getItem(BUILDING_SCALE_SURVEY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistBuildingScaleSurveyOverrides() {
  if (!buildingScaleSurveyHasStorage()) return;
  try {
    globalThis.localStorage?.setItem(BUILDING_SCALE_SURVEY_STORAGE_KEY, JSON.stringify(buildingScaleSurveyOverrides));
  } catch { /* storage unavailable: the measurements last until reload */ }
}

function loadBuildingScaleSurveyShipped() {
  if (buildingScaleSurveyShippedLoad) return buildingScaleSurveyShippedLoad;
  if (typeof fetch !== 'function') return (buildingScaleSurveyShippedLoad = Promise.resolve(buildingScaleSurveyShipped));
  buildingScaleSurveyShippedLoad = fetch(`${BUILDING_SCALE_SURVEY_URL}?v=${Date.now()}`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => { buildingScaleSurveyShipped = data?.measurements || {}; return buildingScaleSurveyShipped; })
    .catch(() => buildingScaleSurveyShipped);
  return buildingScaleSurveyShippedLoad;
}

function getBuildingScaleSurveyEntry(path) {
  if (Object.prototype.hasOwnProperty.call(buildingScaleSurveyOverrides, path)) return buildingScaleSurveyOverrides[path];
  return buildingScaleSurveyShipped[path] || null;
}

function buildBuildingScaleSurveyTable() {
  const table = { ...buildingScaleSurveyShipped };
  Object.entries(buildingScaleSurveyOverrides).forEach(([path, entry]) => {
    if (entry) table[path] = entry;
    else delete table[path];
  });
  return Object.fromEntries(Object.keys(table).sort().map((path) => [path, table[path]]));
}

const buildingScaleSurvey = (() => {
  let active = false;
  let scene = null;
  let panel = null;
  let overlay = null;
  let inputHandlers = null;
  let keyHandler = null;
  let savedCursor = null;
  let selected = null;       // building sprite
  let hover = null;
  let activeEnd = 'b';
  let drag = null;           // { end, transform, a, b, moved }
  let storeys = 1;
  let storeyM = BUILDING_SCALE_DEFAULT_STOREY_M;

  const isLive = (sprite) => !!sprite && sprite.scene !== undefined && sprite.active !== false;
  const zoom = () => scene?.cameras?.main?.zoom || 1;

  function buildings() {
    return scene?.buildingSprites ? [...new Set(scene.buildingSprites.values())].filter(isLive) : [];
  }

  function transformOf(sprite) {
    const source = sprite?.texture?.getSourceImage?.() ?? null;
    const mapping = typeof getModelTexturePixelMapping === 'function'
      ? getModelTexturePixelMapping(sprite.modelLogicalPath, source)
      : { resize: 1, offsetX: 0, offsetY: 0 };
    return {
      x: sprite.x,
      y: sprite.y,
      originX: sprite.displayOriginX ?? 0,
      originY: sprite.displayOriginY ?? 0,
      scaleX: sprite.scaleX || 1,
      scaleY: sprite.scaleY || 1,
      mapping,
    };
  }

  function sourceToWorld(transform, [x, y]) {
    const tx = x * transform.mapping.resize + transform.mapping.offsetX;
    const ty = y * transform.mapping.resize + transform.mapping.offsetY;
    return { x: transform.x + (tx - transform.originX) * transform.scaleX, y: transform.y + (ty - transform.originY) * transform.scaleY };
  }

  function worldToSource(transform, x, y) {
    const tx = (x - transform.x) / transform.scaleX + transform.originX;
    const ty = (y - transform.y) / transform.scaleY + transform.originY;
    return [(tx - transform.mapping.offsetX) / transform.mapping.resize, (ty - transform.mapping.offsetY) / transform.mapping.resize];
  }

  const screenPxPerSourcePx = (transform) => transform.mapping.resize * Math.abs(transform.scaleY);

  function pickBuildingAt(worldX, worldY) {
    let best = null;
    let bestDepth = -Infinity;
    buildings().forEach((sprite) => {
      if (!sprite.visible) return;
      const scaleX = Math.abs(sprite.scaleX || 1);
      const scaleY = Math.abs(sprite.scaleY || 1);
      const left = sprite.x - (sprite.displayOriginX ?? 0) * scaleX;
      const top = sprite.y - (sprite.displayOriginY ?? 0) * scaleY;
      const px = Math.floor((worldX - left) / scaleX);
      const py = Math.floor((worldY - top) / scaleY);
      if (px < 0 || py < 0 || px >= (sprite.width || 0) || py >= (sprite.height || 0)) return;
      const mask = typeof getStreetPropAlphaMask === 'function' ? getStreetPropAlphaMask(scene, sprite.texture?.key) : null;
      if (mask && mask.alpha[py * mask.width + px] < BUILDING_SCALE_PICK_ALPHA) return;
      if ((sprite.depth ?? 0) >= bestDepth) { best = sprite; bestDepth = sprite.depth ?? 0; }
    });
    return best;
  }

  // The span on show: the one being dragged, else the model's recorded one.
  function shownSpan() {
    if (drag) return { a: drag.a, b: drag.b, transform: drag.transform };
    const entry = selected?.modelLogicalPath ? getBuildingScaleSurveyEntry(selected.modelLogicalPath) : null;
    return entry ? { a: entry.a, b: entry.b, transform: transformOf(selected) } : null;
  }

  function endAt(worldX, worldY) {
    const span = shownSpan();
    if (!span) return null;
    const reach = (BUILDING_SCALE_HANDLE_RADIUS_PX + 4) / zoom();
    let best = null;
    let bestDistance = reach;
    ['a', 'b'].forEach((end) => {
      const point = sourceToWorld(span.transform, span[end]);
      const distance = Math.hypot(point.x - worldX, point.y - worldY);
      if (distance <= bestDistance) { best = end; bestDistance = distance; }
    });
    return best;
  }

  function commit(a, b, transform) {
    const path = selected?.modelLogicalPath;
    if (!path) return null;
    const entry = buildBuildingScaleEntry({
      a, b, storeys, storeyM,
      footprint: [selected.footprintCols ?? 1, selected.footprintRows ?? 1],
      screenPxPerSourcePx: screenPxPerSourcePx(transform),
    });
    if (!entry) return null;
    buildingScaleSurveyOverrides[path] = entry;
    persistBuildingScaleSurveyOverrides();
    renderPanel();
    drawOverlay();
    return entry;
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  function drawOverlay() {
    if (!overlay) return;
    overlay.clear();
    if (selected && !isLive(selected)) selected = null;
    if (hover && !isLive(hover)) hover = null;
    const z = zoom();
    [hover !== selected ? hover : null, selected].forEach((sprite) => {
      if (!sprite) return;
      const scaleX = Math.abs(sprite.scaleX || 1);
      const scaleY = Math.abs(sprite.scaleY || 1);
      overlay.lineStyle((sprite === selected ? 2 : 1.5) / z, BUILDING_SCALE_COLORS.hover, sprite === selected ? 0.9 : 0.6);
      overlay.strokeRect(sprite.x - sprite.displayOriginX * scaleX, sprite.y - sprite.displayOriginY * scaleY, sprite.width * scaleX, sprite.height * scaleY);
    });
    const span = shownSpan();
    if (!selected || !span) return;
    const a = sourceToWorld(span.transform, span.a);
    const b = sourceToWorld(span.transform, span.b);
    const bottom = Math.max(a.y, b.y);
    const top = Math.min(a.y, b.y);
    // the measured span: vertical, at the first point's x
    overlay.lineStyle(2.5 / z, BUILDING_SCALE_COLORS.span, 1);
    overlay.lineBetween(a.x, bottom, a.x, top);
    [-1, 1].forEach((side) => overlay.lineBetween(a.x - 4 / z, side < 0 ? top : bottom, a.x + 4 / z, side < 0 ? top : bottom));
    [['a', a], ['b', b]].forEach(([end, point]) => {
      const radius = BUILDING_SCALE_HANDLE_RADIUS_PX / z;
      overlay.fillStyle(end === activeEnd ? BUILDING_SCALE_COLORS.span : 0x0b2430, 1);
      overlay.fillCircle(point.x, point.y, radius);
      overlay.lineStyle(2 / z, end === activeEnd ? 0xffffff : BUILDING_SCALE_COLORS.span, 1);
      overlay.strokeCircle(point.x, point.y, radius);
    });
    // what the people's scale would draw from the same foot: a person and one storey
    const rulerX = a.x + 10 / z;
    overlay.lineStyle(3 / z, BUILDING_SCALE_COLORS.person, 1);
    overlay.lineBetween(rulerX, bottom, rulerX, bottom - BUILDING_SCALE_PERSON_M * BUILDING_SCALE_PEOPLE_PX_PER_M);
    overlay.lineStyle(1.5 / z, BUILDING_SCALE_COLORS.storey, 0.9);
    const storeyTop = bottom - (Number(storeyM) || BUILDING_SCALE_DEFAULT_STOREY_M) * BUILDING_SCALE_PEOPLE_PX_PER_M;
    overlay.lineBetween(rulerX + 5 / z, bottom, rulerX + 5 / z, storeyTop);
    overlay.lineBetween(rulerX + 2 / z, storeyTop, rulerX + 8 / z, storeyTop);
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  function select(sprite) {
    selected = sprite;
    drag = null;
    renderPanel();
    drawOverlay();
  }

  function installInput(targetScene) {
    if (inputHandlers || !targetScene?.input?.on) return;
    const depth = typeof VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH === 'number' ? VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH - 3 : 1e9;
    overlay = targetScene.add?.graphics?.()?.setDepth?.(depth) ?? null;
    inputHandlers = {
      pointerdown: (pointer) => {
        if (pointer.button !== 0) return;
        const end = endAt(pointer.worldX, pointer.worldY);
        const span = shownSpan();
        if (end && span) {
          activeEnd = end;
          drag = { end, transform: span.transform, a: [...span.a], b: [...span.b], moved: false };
          renderPanel();
          drawOverlay();
          return;
        }
        const hit = pickBuildingAt(pointer.worldX, pointer.worldY);
        if (hit && hit === selected && hit.modelLogicalPath) {
          // a new span from here
          const transform = transformOf(selected);
          const point = worldToSource(transform, pointer.worldX, pointer.worldY);
          activeEnd = 'b';
          drag = { end: 'b', transform, a: point, b: [...point], moved: false };
          return;
        }
        select(hit);
        if (!hit) setMessage('冇揀中建築：點建築本身', 'info');
        else if (!hit.modelLogicalPath) setMessage('呢座建築冇模型路徑，量度唔到', 'error');
        else setMessage('喺建築上由下向上拖一段已知高度（例如幾層樓）', 'info');
      },
      pointermove: (pointer) => {
        if (drag && !pointer.isDown) finishDrag();
        if (drag) {
          const point = worldToSource(drag.transform, pointer.worldX, pointer.worldY);
          // the span stays vertical, under its first end
          if (drag.end === 'a') drag.a = point;
          drag.b = [drag.a[0], drag.end === 'b' ? point[1] : drag.b[1]];
          drag.moved = true;
          renderPanel();
          drawOverlay();
          return;
        }
        const next = pickBuildingAt(pointer.worldX, pointer.worldY);
        if (next !== hover) {
          hover = next;
          drawOverlay();
        }
      },
      pointerup: () => finishDrag(),
    };
    Object.entries(inputHandlers).forEach(([event, handler]) => targetScene.input.on(event, handler));
    savedCursor = targetScene.input.manager?.defaultCursor ?? '';
    targetScene.input.setDefaultCursor?.('crosshair');
  }

  function finishDrag() {
    if (!drag) return;
    const { moved, a, b, transform } = drag;
    drag = null;
    if (moved && Math.abs(b[1] - a[1]) >= 2) {
      const entry = commit(a, b, transform);
      if (entry) setMessage(`已記錄：一格約 ${entry.tileM} m，係人物比例嘅 ${entry.vsPeople}×`, 'success');
    } else {
      drawOverlay();
    }
  }

  function uninstallInput(targetScene) {
    if (inputHandlers && targetScene?.input?.off) {
      Object.entries(inputHandlers).forEach(([event, handler]) => targetScene.input.off(event, handler));
      targetScene.input.setDefaultCursor?.(savedCursor || '');
    }
    inputHandlers = null;
    drag = null;
    selected = null;
    hover = null;
    overlay?.destroy?.();
    overlay = null;
  }

  function nudge(dx, dy) {
    const entry = selected?.modelLogicalPath ? getBuildingScaleSurveyEntry(selected.modelLogicalPath) : null;
    if (!entry) {
      setMessage('先揀建築同拖一段高度', 'info');
      return;
    }
    const a = [...entry.a];
    const b = [...entry.b];
    if (activeEnd === 'a') { a[0] += dx; a[1] += dy; b[0] = a[0]; } else { b[1] += dy; }
    commit(a, b, transformOf(selected));
  }

  function setStoreys(value) {
    storeys = Math.max(1, Math.round(Number(value) || 1));
    remeasure();
  }

  function setStoreyM(value) {
    storeyM = Number(value) > 0 ? Number(value) : BUILDING_SCALE_DEFAULT_STOREY_M;
    remeasure();
  }

  // The reference changed: the recorded span keeps its points, its metres follow.
  function remeasure() {
    const entry = selected?.modelLogicalPath ? getBuildingScaleSurveyEntry(selected.modelLogicalPath) : null;
    if (entry) commit(entry.a, entry.b, transformOf(selected));
    else { renderPanel(); drawOverlay(); }
  }

  function handleKey(event) {
    if (!active) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (event.key === 'Escape' && selected) {
      select(null);
      return;
    }
    if (!selected) return; // leave the arrow keys to the camera
    if (event.key === '1' || event.key === '2') {
      activeEnd = event.key === '1' ? 'a' : 'b';
      renderPanel();
      drawOverlay();
      return;
    }
    const step = event.shiftKey ? 5 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      nudge(...moves[event.key]);
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function removeModel() {
    const path = selected?.modelLogicalPath;
    if (!path) return;
    if (buildingScaleSurveyShipped[path]) buildingScaleSurveyOverrides[path] = null;
    else delete buildingScaleSurveyOverrides[path];
    persistBuildingScaleSurveyOverrides();
    renderPanel();
    drawOverlay();
    setMessage('已刪除呢個模型嘅量度', 'info');
  }

  function clearAll() {
    const count = Object.keys(buildingScaleSurveyOverrides).length;
    Object.keys(buildingScaleSurveyOverrides).forEach((path) => { delete buildingScaleSurveyOverrides[path]; });
    persistBuildingScaleSurveyOverrides();
    renderPanel();
    drawOverlay();
    setMessage(`已清除 ${count} 個本機量度`, 'info');
  }

  function buildRecord() {
    return {
      kind: 'building-scale-survey',
      version: 1,
      note: 'Save as data/building-scale-survey.json. a/b: the measured span in source-PNG pixels; '
        + 'upPxPerM: screen px a metre of height at zoom 1 when measured; vsPeople: that over the people\'s '
        + `${BUILDING_SCALE_PEOPLE_PX_PER_M} px a metre; tileM: the tile size the art implies in a true 2:1 projection.`,
      peoplePxPerM: BUILDING_SCALE_PEOPLE_PX_PER_M,
      localEdits: Object.keys(buildingScaleSurveyOverrides).sort(),
      measurements: buildBuildingScaleSurveyTable(),
      recordedAt: new Date().toISOString(),
    };
  }

  // ── Panel ──────────────────────────────────────────────────────────────────

  function ensureStyle() {
    if (document.getElementById('building-scale-survey-style')) return;
    const style = document.createElement('style');
    style.id = 'building-scale-survey-style';
    style.textContent = `
      .building-scale-survey-panel {
        position: fixed; bottom: 18px; left: 14px; z-index: 100000;
        width: min(360px, calc(100vw - 28px)); box-sizing: border-box; padding: 12px;
        border: 1px solid rgba(90, 215, 255, 0.75); border-radius: 12px;
        color: #e8f8ff; background: rgba(6, 24, 32, 0.94);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        user-select: text; pointer-events: auto; backdrop-filter: blur(8px);
      }
      .building-scale-survey-panel[hidden] { display: none !important; }
      .building-scale-survey-panel .bss-title { font-weight: 800; color: #5ad7ff; letter-spacing: .04em; margin-bottom: 6px; display: flex; justify-content: space-between; cursor: move; }
      .building-scale-survey-panel .bss-title::after { content: '⠿'; color: #2f7f99; font-weight: 400; }
      .building-scale-survey-panel .bss-hint { color: #bfe6f2; margin-bottom: 8px; }
      .building-scale-survey-panel .bss-model { color: #fff; font-weight: 700; word-break: break-all; }
      .building-scale-survey-panel .bss-ref { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
      .building-scale-survey-panel input { width: 4.5em; font: inherit; color: #e8f8ff; background: #0d3343; border: 1px solid #2f7f99; border-radius: 5px; padding: 2px 4px; }
      .building-scale-survey-panel .bss-row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
      .building-scale-survey-panel .bss-row strong { color: #5ad7ff; }
      .building-scale-survey-panel .bss-legend { color: #9cc6d4; margin-top: 4px; }
      .building-scale-survey-panel .bss-legend b.person { color: #ff9f43; }
      .building-scale-survey-panel details { margin-top: 8px; }
      .building-scale-survey-panel summary { cursor: pointer; color: #bfe6f2; }
      .building-scale-survey-panel .bss-list { max-height: 160px; overflow: auto; margin-top: 4px; }
      .building-scale-survey-panel .bss-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
      .building-scale-survey-panel button {
        border: 1px solid #2f7f99; border-radius: 7px; padding: 6px 7px;
        color: #e8f8ff; background: #0f3242; font: inherit; cursor: pointer;
      }
      .building-scale-survey-panel button:hover { background: #164a60; }
      .building-scale-survey-panel button:disabled { opacity: .45; cursor: default; }
      .building-scale-survey-panel .bss-message { min-height: 16px; margin-top: 7px; color: #bfe6f2; }
      .building-scale-survey-panel .bss-message[data-tone="success"] { color: #5ad7ff; }
      .building-scale-survey-panel .bss-message[data-tone="error"] { color: #ff9a9a; }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if (panel) return panel;
    if (typeof document === 'undefined' || !document.body) return null;
    ensureStyle();
    const root = document.createElement('section');
    root.id = 'building-scale-survey-panel';
    root.className = 'building-scale-survey-panel';
    root.hidden = true;
    root.setAttribute('aria-label', 'Building scale survey');
    root.innerHTML = `
      <div class="bss-title">建築比例量度</div>
      <div class="bss-hint">點選建築，再喺佢身上由下向上拖一段已知高度（例如一層或幾層樓）。拖端點調整；1/2 揀端點、方向鍵 1px（Shift 5px）、Esc 取消；右鍵拖曳移動鏡頭。只作記錄，唔改畫面。</div>
      <div class="bss-model"></div>
      <div class="bss-ref">
        <label>層數 <input type="number" min="1" step="1" data-field="storeys"></label>
        <label>每層高度 <input type="number" min="0.5" step="0.1" data-field="storeyM"> m</label>
      </div>
      <div class="bss-result"></div>
      <div class="bss-legend"><b class="person">橙線</b>＝1.7m 人物、白線＝一層樓，均按人物比例（${BUILDING_SCALE_PEOPLE_PX_PER_M}px/m）</div>
      <details><summary class="bss-summary"></summary><div class="bss-list"></div></details>
      <div class="bss-actions">
        <button type="button" data-action="remove">刪除此模型量度</button>
        <button type="button" data-action="copy">複製 JSON</button>
        <button type="button" data-action="clear">清除全部本機量度</button>
      </div>
      <div class="bss-message"></div>
    `;
    document.body.appendChild(root);
    if (typeof makeCalibratorPanelDraggable === 'function') {
      makeCalibratorPanelDraggable(root, root.querySelector('.bss-title'), 'calibrator-panel:building-scale');
    }
    panel = {
      root,
      model: root.querySelector('.bss-model'),
      result: root.querySelector('.bss-result'),
      summary: root.querySelector('.bss-summary'),
      list: root.querySelector('.bss-list'),
      message: root.querySelector('.bss-message'),
      storeys: root.querySelector('[data-field="storeys"]'),
      storeyM: root.querySelector('[data-field="storeyM"]'),
      buttons: Object.fromEntries([...root.querySelectorAll('[data-action]')].map((button) => [button.dataset.action, button])),
    };
    panel.storeys.addEventListener('change', () => setStoreys(panel.storeys.value));
    panel.storeyM.addEventListener('change', () => setStoreyM(panel.storeyM.value));
    panel.buttons.remove.addEventListener('click', () => removeModel());
    panel.buttons.clear.addEventListener('click', () => clearAll());
    panel.buttons.copy.addEventListener('click', () => {
      copyVisualRouteCalibrationText(JSON.stringify(buildRecord(), null, 2))
        .then(() => setMessage('JSON 已複製，存做 data/building-scale-survey.json', 'success'))
        .catch(() => setMessage('複製失敗', 'error'));
    });
    return panel;
  }

  function setMessage(text, tone = 'info') {
    if (!panel) return;
    panel.message.textContent = String(text || '');
    panel.message.dataset.tone = tone;
  }

  function row(label, value) {
    const el = document.createElement('div');
    el.className = 'bss-row';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('strong');
    v.textContent = value;
    el.append(l, v);
    return el;
  }

  function renderPanel() {
    if (!panel) return;
    panel.root.hidden = !active;
    if (!active) return;
    const path = selected?.modelLogicalPath ?? null;
    panel.buttons.remove.disabled = !path || !getBuildingScaleSurveyEntry(path);
    panel.buttons.clear.textContent = `清除全部本機量度（${Object.keys(buildingScaleSurveyOverrides).length}）`;
    const entry = path ? getBuildingScaleSurveyEntry(path) : null;
    // a model's own reference wins while it is picked
    if (entry && !drag) {
      if (entry.storeys) storeys = entry.storeys;
      if (entry.storeyM) storeyM = entry.storeyM;
    }
    if (document.activeElement !== panel.storeys) panel.storeys.value = String(storeys);
    if (document.activeElement !== panel.storeyM) panel.storeyM.value = String(storeyM);

    if (!selected) {
      panel.model.textContent = `城中有 ${buildings().length} 座建築：點選一座`;
      panel.result.replaceChildren();
    } else {
      const sameModel = buildings().filter((sprite) => sprite.modelLogicalPath === path).length;
      panel.model.textContent = `${String(path ?? selected.logicalSpriteKey).split('/').pop()}（${selected.footprintCols ?? 1}×${selected.footprintRows ?? 1}，城中 ${sameModel} 座）`;
      const live = drag?.moved
        ? buildBuildingScaleEntry({ a: drag.a, b: drag.b, storeys, storeyM, footprint: [1, 1], screenPxPerSourcePx: screenPxPerSourcePx(drag.transform) })
        : entry;
      panel.result.replaceChildren(...(live ? [
        row('畫面高度（zoom 1）', `${roundBuildingScaleNumber(Math.abs(live.b[1] - live.a[1]) * live.screenPxPerSourcePx, 1)} px`),
        row('每米高度', `${live.upPxPerM} px（人物 ${BUILDING_SCALE_PEOPLE_PX_PER_M}）`),
        row('相對人物', `${live.vsPeople}×`),
        row('即一格約', `${live.tileM} m`),
      ] : [row('未量度', '拖一段高度')]));
    }
    const summary = summarizeBuildingScaleSurvey(buildBuildingScaleSurveyTable());
    panel.summary.textContent = summary.count
      ? `已量度 ${summary.count} 個模型：一格中位數 ${roundBuildingScaleNumber(summary.median, 1)} m（10–90%：${roundBuildingScaleNumber(summary.p10, 1)}–${roundBuildingScaleNumber(summary.p90, 1)} m）`
      : '未有量度';
    panel.list.replaceChildren(...summary.rows.map((r) => row(String(r.path).split('/').pop(), `${r.tileM} m · ${r.vsPeople}×`)));
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function start(targetScene) {
    // both pick buildings with the mouse: one at a time
    if (typeof teardownBuildingGroundCalibrator === 'function') teardownBuildingGroundCalibrator();
    active = true;
    scene = targetScene;
    installInput(targetScene);
    createPanel();
    renderPanel();
    loadBuildingScaleSurveyShipped().then(() => renderPanel());
    if (!keyHandler && typeof document !== 'undefined') {
      keyHandler = handleKey;
      document.addEventListener('keydown', keyHandler);
    }
    setMessage('', 'info');
  }

  function teardown() {
    active = false;
    uninstallInput(scene);
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

  return {
    id: 'building-scale',
    isActive: () => active,
    // The game's input guard (isAnyStreetPropCalibratorCapturing) asks every calibrator this.
    isPickerActive: () => active,
    toggle,
    teardown,
    select,
    nudge,
    setStoreys,
    setStoreyM,
    removeModel,
    buildRecord,
    setActiveEnd: (end) => { activeEnd = end; },
  };
})();

if (typeof STREET_PROP_CALIBRATORS !== 'undefined') STREET_PROP_CALIBRATORS.push(buildingScaleSurvey);

function toggleBuildingScaleSurvey(scene) {
  return buildingScaleSurvey.toggle(scene);
}

function teardownBuildingScaleSurvey() {
  return buildingScaleSurvey.teardown();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    measureBuildingScale,
    buildBuildingScaleEntry,
    summarizeBuildingScaleSurvey,
    buildingScaleSurvey,
    buildingScaleSurveyOverrides,
    getBuildingScaleSurveyEntry,
    BUILDING_SCALE_PEOPLE_PX_PER_M,
    BUILDING_SCALE_TRUE_UP_RATIO,
  };
}
