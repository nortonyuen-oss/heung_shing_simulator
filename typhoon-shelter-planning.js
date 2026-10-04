// 避風塘規劃工具 (Phase 1): the game side of typhoon-shelter.js - the map accessor, the tool
// (one row in 土木工程署, with a mode bar: 水域 / 出入口 / 檢視), the planning overlay and the
// shelter panel. Plans live in city.typhoonShelters and are saved with the city; everything else
// (breakwater line, channel, berths...) is recomputed from them. Phase 1 builds nothing and costs
// nothing - the panel only estimates. Design: docs/typhoon-shelter-phase1-design.md.

const TYPHOON_SHELTER_TOOL = 'typhoon-shelter';
const TYPHOON_SHELTER_COLORS = Object.freeze({
  basin: 0x4fc3f7,
  basinSelected: 0x81d4fa,
  channel: 0xffffff,
  shore: 0xffd23b,
  breakwater: 0xff9f43,
  demolish: 0xff3b30,
  entrance: 0x39d353,
  head: 0xffffff,
  problem: 0xff3b30,
  rect: 0x4fc3f7,
  rectCut: 0xff6b6b,
});

let typhoonShelterMode = 'basin';            // 'basin' | 'entrance' | 'inspect'
// A drag that changes a built shelter (擴建 / 削減) waits here, drawn as a preview with its price,
// until 「確定擴建」 builds it (or 「取消」 drops it): built works are rebuilt and paid for at once, so
// the change is not made on the mouse button's release.
let typhoonShelterPendingEdit = null;
let typhoonShelterSelectedId = null;
let typhoonShelterDragPreview = null;        // { result, rect, mode, targetId }
let typhoonShelterGraphics = null;
let typhoonShelterAnalysisCache = { key: '', byId: new Map() };
let typhoonShelterDom = null;

// ---------------------------------------------------------------------------
// state and map access
// ---------------------------------------------------------------------------

function getTyphoonShelterState() {
  if (!city.typhoonShelters || !Array.isArray(city.typhoonShelters.shelters)) {
    city.typhoonShelters = normalizeTyphoonShelterState(city.typhoonShelters);
  }
  return city.typhoonShelters;
}

function setTyphoonShelterState(state) {
  city.typhoonShelters = typeof rememberNormalizedCityStateObject === 'function'
    ? rememberNormalizedCityStateObject(state) : state;
  typhoonShelterAnalysisCache = { key: '', byId: new Map() };
  typhoonShelterTerrainCheck = { at: -Infinity, stamp: null };
}

// The terrain alone: water, land, bridge or occupied water.
function typhoonShelterBaseKind(r, c) {
  if (!isInsideMap(r, c)) return null;
  if (typeof isBridgeTile === 'function' && isBridgeTile(r, c)) return 'bridge';
  if (mapData[r][c] !== WATER) return 'land';
  if (buildingData?.[getTileId(r, c)]) return 'blocked';
  return 'water';
}

// Every shelter's tiles (basin + breakwater line), from the terrain alone.
// The boats ask for the analyses every frame: the terrain round the shelters is re-checked at most
// twice a second (a change there shows within half a second), the plans themselves every call.
let typhoonShelterTerrainCheck = { at: -Infinity, stamp: null };

function getTyphoonShelterAnalyses() {
  const state = getTyphoonShelterState();
  const key = state.shelters.map((s) => `${s.id}|${s.basin}|${JSON.stringify(s.entrances)}|${s.reservePct}`).join('#');
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (typhoonShelterAnalysisCache.key !== key || now - typhoonShelterTerrainCheck.at > 500) {
    typhoonShelterTerrainCheck = { at: now, stamp: typhoonShelterTerrainStamp() };
  }
  if (typhoonShelterAnalysisCache.key === key && typhoonShelterAnalysisCache.terrainStamp === typhoonShelterTerrainCheck.stamp) {
    return typhoonShelterAnalysisCache.byId;
  }
  const baseMap = { width: MAP_WIDTH, height: MAP_HEIGHT, kind: typhoonShelterBaseKind };
  const footprints = new Map(state.shelters.map((s) => {
    const a = analyzeTyphoonShelter(s, baseMap);
    return [s.id, new Set([...a.basin, ...a.ring])];
  }));
  const byId = new Map(state.shelters.map((s) => [s.id, analyzeTyphoonShelter(s, getTyphoonShelterMap(s.id, footprints))]));
  typhoonShelterAnalysisCache = { key, terrainStamp: typhoonShelterTerrainCheck.stamp, byId, footprints };
  return byId;
}

// A cheap stamp of the terrain round the shelters (each basin's bounding box plus two tiles), so
// terrain, bridge or building changes there invalidate the cached analyses.
function typhoonShelterTerrainStamp() {
  let hash = 0;
  getTyphoonShelterState().shelters.forEach((s) => {
    const rows = [...String(s.basin).matchAll(/(\d+):([\d,-]+)/g)];
    if (!rows.length) return;
    const rs = rows.map((m) => Number(m[1]));
    const cs = rows.flatMap((m) => m[2].split(/[,-]/).map(Number));
    for (let r = Math.max(0, Math.min(...rs) - 2); r <= Math.min(MAP_HEIGHT - 1, Math.max(...rs) + 2); r++) {
      for (let c = Math.max(0, Math.min(...cs) - 2); c <= Math.min(MAP_WIDTH - 1, Math.max(...cs) + 2); c++) {
        const k = typhoonShelterBaseKind(r, c);
        const v = k === 'water' ? 1 : k === 'land' ? 2 : k === 'bridge' ? 3 : 4;
        hash = (Math.imul(hash, 31) + v * (r * 7 + c * 13 + 1)) | 0;
      }
    }
  });
  return hash;
}

// The accessor a plan is analysed against: other shelters' tiles read as 'shelter'.
function getTyphoonShelterMap(excludeId = null, footprints = null) {
  const others = new Set();
  const fp = footprints || typhoonShelterAnalysisCache.footprints || new Map();
  fp.forEach((tiles, id) => { if (id !== excludeId) tiles.forEach((k) => others.add(k)); });
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    kind: (r, c) => {
      const base = typhoonShelterBaseKind(r, c);
      return base === 'water' && others.has(`${r}:${c}`) ? 'shelter' : base;
    },
  };
}

function findTyphoonShelterAt(row, col) {
  const k = `${row}:${col}`;
  for (const [id, a] of getTyphoonShelterAnalyses()) {
    if (a.basin.has(k) || a.ring.has(k)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// drag: add / cut a rectangle
// ---------------------------------------------------------------------------

// What a drag from `start` to `end` would do: edit one shelter, or start a new one.
function computeTyphoonShelterDrag(start, end, subtract) {
  getTyphoonShelterAnalyses();
  const rect = { r0: Math.min(start.row, end.row), c0: Math.min(start.col, end.col), r1: Math.max(start.row, end.row), c1: Math.max(start.col, end.col) };
  const state = getTyphoonShelterState();
  const analyses = getTyphoonShelterAnalyses();
  const touches = state.shelters.filter((s) => {
    const a = analyses.get(s.id);
    for (let r = rect.r0 - (subtract ? 0 : 1); r <= rect.r1 + (subtract ? 0 : 1); r++) {
      for (let c = rect.c0 - (subtract ? 0 : 1); c <= rect.c1 + (subtract ? 0 : 1); c++) {
        if (a.basin.has(`${r}:${c}`)) return true;
      }
    }
    return false;
  });
  if (subtract) {
    if (!touches.length) return { rect, rejected: '呢度冇避風塘水域' };
    const target = touches.find((s) => s.id === typhoonShelterSelectedId) || touches[0];
    const res = editTyphoonShelterBasin(target, getTyphoonShelterMap(target.id), rect, 'subtract');
    return priceTyphoonShelterDrag({ rect, targetId: target.id, ...res }, target);
  }
  if (touches.length > 1) return { rect, rejected: '唔可以將兩個避風塘合併' };
  if (touches.length === 1) {
    const target = touches[0];
    const res = editTyphoonShelterBasin(target, getTyphoonShelterMap(target.id), rect, 'add');
    return priceTyphoonShelterDrag({ rect, targetId: target.id, ...res }, target);
  }
  const map = getTyphoonShelterMap(null);
  const tiles = typhoonShelterRectTiles(rect.r0, rect.c0, rect.r1, rect.c1).filter((k) => map.kind(...k.split(':').map(Number)) === 'water');
  if (!tiles.length) return { rect, rejected: '要喺水面劃' };
  const plan = createTyphoonShelterPlan(`ts${state.nextId}`, new Set(tiles), map, { name: `避風塘 ${state.nextId}` });
  if (!decodeTyphoonShelterBasin(plan.basin).size) return { rect, rejected: '水域太窄' };
  return { rect, targetId: null, plan, analysis: analyzeTyphoonShelter(plan, map), diff: null };
}

// A built shelter is rebuilt at once to match an edit: the drag carries the bill (new works,
// tear-downs and their cost) so the preview can show it.
function priceTyphoonShelterDrag(result, target) {
  if (result.rejected || !target.works?.approved) return result;
  return { ...result, bill: priceTyphoonShelterChange(target, result.plan, result.analysis) };
}

function isTyphoonShelterBasinDrag() {
  return isTyphoonShelterToolActive() && typhoonShelterMode === 'basin';
}

function cancelTyphoonShelterDrag(scene) {
  if (!typhoonShelterDragPreview) return;
  typhoonShelterDragPreview = null;
  redrawTyphoonShelterPlanning(scene);
}

function drawTyphoonShelterDragPreview(scene, start, end, subtract) {
  typhoonShelterDragPreview = { ...computeTyphoonShelterDrag(start, end, subtract), subtract };
  redrawTyphoonShelterPlanning(scene);
}

function commitTyphoonShelterDrag(scene, start, end, subtract) {
  const result = computeTyphoonShelterDrag(start, end, subtract);
  typhoonShelterDragPreview = null;
  if (result.rejected) {
    if (typeof showToast === 'function') showToast(result.rejected, 'warning');
    redrawTyphoonShelterPlanning(scene);
    return false;
  }
  const target = result.targetId && getTyphoonShelterState().shelters.find((s) => s.id === result.targetId);
  if (target?.works?.approved) {
    typhoonShelterPendingEdit = { ...result, subtract: !!subtract };
    typhoonShelterSelectedId = target.id;
    redrawTyphoonShelterPlanning(scene);
    return true;
  }
  typhoonShelterPendingEdit = null;
  return commitTyphoonShelterPlan(scene, result.plan, result.analysis);
}

// 風暴期間暫停工程 (typhoon-shelter-storm.js): while the boats shelter, or visitors still lie on
// the free berths, nothing is built, rebuilt or pulled down. Says so when `tell`.
function isTyphoonShelterWorksPaused() {
  return typeof isTyphoonShelterStormFreeze === 'function' && isTyphoonShelterStormFreeze(getTyphoonShelterState().storm);
}
function typhoonShelterWorksPausedNote() {
  return tsT('typhoonShelter.storm.worksPaused', '風暴期間暫停工程：等漁船復航、外來船離開之後先可以興建、擴建或者拆除。');
}
function refuseTyphoonShelterWorksInStorm() {
  if (!isTyphoonShelterWorksPaused()) return false;
  if (typeof showToast === 'function') showToast(typhoonShelterWorksPausedNote(), 'warning');
  return true;
}

// 「確定擴建」: build the waiting change to a built shelter (charged now, refused if it cannot be paid).
function confirmTyphoonShelterPendingEdit(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  const pending = typhoonShelterPendingEdit;
  if (!pending) return false;
  if (refuseTyphoonShelterWorksInStorm()) return false;
  typhoonShelterPendingEdit = null;
  const ok = commitTyphoonShelterPlan(scene, pending.plan, pending.analysis);
  if (!ok) typhoonShelterPendingEdit = pending;
  if (ok && typeof showToast === 'function') {
    showToast(tsT('typhoonShelter.toast.expanded', `「${pending.plan.name}」已經改好。`, { name: pending.plan.name }), 'success');
  }
  redrawTyphoonShelterPlanning(scene);
  return ok;
}

function cancelTyphoonShelterPendingEdit(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (!typhoonShelterPendingEdit) return;
  typhoonShelterPendingEdit = null;
  redrawTyphoonShelterPlanning(scene);
}

// Store a new or changed plan. A built shelter is rebuilt to match at once and the bill paid
// then; the change is refused if the result would not be feasible or the treasury cannot pay.
function commitTyphoonShelterPlan(scene, nextPlan, analysis) {
  const state = getTyphoonShelterState();
  const before = state.shelters.find((s) => s.id === nextPlan.id);
  let plan = before ? { ...nextPlan, works: before.works, status: before.status } : nextPlan;
  if (before?.works?.approved) {
    if (!analysis.legal) {
      const why = analysis.problems[0]?.message || '';
      if (typeof showToast === 'function') showToast(tsT('typhoonShelter.toast.builtMustStayLegal', `已建成嘅避風塘改完之後都要可行：${why}`, { reason: why }), 'warning');
      redrawTyphoonShelterPlanning(scene);
      return false;
    }
    const bill = priceTyphoonShelterChange(before, nextPlan, analysis);
    if (!payTyphoonShelterBill(bill.cost)) {
      redrawTyphoonShelterPlanning(scene);
      return false;
    }
    plan = { ...nextPlan, works: { ...bill.works, approved: true } };
    plan.status = typhoonShelterBuiltStatus(plan, analysis);
  }
  const shelters = before
    ? state.shelters.map((s) => (s.id === plan.id ? plan : s))
    : [...state.shelters, plan];
  setTyphoonShelterState({ ...state, nextId: before ? state.nextId : state.nextId + 1, shelters });
  typhoonShelterSelectedId = plan.id;
  syncTyphoonShelterFacilitySprites(scene);
  redrawTyphoonShelterPlanning(scene);
  return true;
}

// ---------------------------------------------------------------------------
// clicks
// ---------------------------------------------------------------------------

// From applyToolAt (main.js) for the shelter tool, and from the inspect tool.
function handleTyphoonShelterToolClick(scene, row, col) {
  const id = findTyphoonShelterAt(row, col);
  if (typhoonShelterMode === 'entrance') {
    if (!id) {
      if (typeof showToast === 'function') showToast('要撳喺避風塘嘅防波堤上', 'warning');
      return true;
    }
    const state = getTyphoonShelterState();
    const plan = state.shelters.find((s) => s.id === id);
    const map = getTyphoonShelterMap(id);
    const res = toggleTyphoonShelterEntrance(plan, map, row, col);
    typhoonShelterSelectedId = id;
    if (res.rejected) {
      if (typeof showToast === 'function') showToast(res.rejected, 'warning');
      redrawTyphoonShelterPlanning(scene);
      return true;
    }
    const nextPlan = { ...plan, entrances: res };
    commitTyphoonShelterPlan(scene, nextPlan, analyzeTyphoonShelter(nextPlan, map));
    return true;
  }
  if (typhoonShelterMode === 'inspect' || id) {
    typhoonShelterSelectedId = id;
    redrawTyphoonShelterPlanning(scene);
    return true;
  }
  return true;
}

// The inspect tool opens the shelter panel when it clicks a shelter.
function inspectTyphoonShelterAt(scene, row, col) {
  const id = findTyphoonShelterAt(row, col);
  if (!id) return false;
  typhoonShelterSelectedId = id;
  showTyphoonShelterPanel(true);
  redrawTyphoonShelterPlanning(scene, { force: true });
  return true;
}

// ---------------------------------------------------------------------------
// overlay
// ---------------------------------------------------------------------------

function isTyphoonShelterToolActive() {
  return typeof selectedTool !== 'undefined' && selectedTool === TYPHOON_SHELTER_TOOL;
}

function typhoonShelterTileVertices(scene, key) {
  const [r, c] = key.split(':').map(Number);
  return getTileFaceVertices(r, c, scene.offsetX, scene.offsetY, TILE_WIDTH / 2, TILE_HEIGHT / 2);
}

function fillTyphoonShelterTiles(g, scene, tiles, color, alpha) {
  g.fillStyle(color, alpha);
  tiles.forEach((k) => g.fillPoints(typhoonShelterTileVertices(scene, k), true));
}

// The edge of basin tile (r, c) toward `side`: the two vertices of its diamond nearest that
// neighbour's centre (works in every map rotation).
function typhoonShelterEdgeSegment(scene, edge) {
  const verts = typhoonShelterTileVertices(scene, `${edge.r}:${edge.c}`);
  const n = isoToScreen(edge.out[1], edge.out[0]);
  const target = { x: n.x + scene.offsetX, y: n.y + scene.offsetY - TILE_IMAGE_HEIGHT + TILE_HEIGHT / 2 };
  return [...verts].sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y)).slice(0, 2);
}

function drawTyphoonShelterAnalysis(g, scene, a, { selected = false } = {}) {
  fillTyphoonShelterTiles(g, scene, a.basin, selected ? TYPHOON_SHELTER_COLORS.basinSelected : TYPHOON_SHELTER_COLORS.basin, selected ? 0.24 : 0.14);
  fillTyphoonShelterTiles(g, scene, a.channel, TYPHOON_SHELTER_COLORS.channel, 0.16);
  fillTyphoonShelterTiles(g, scene, a.breakwater, TYPHOON_SHELTER_COLORS.breakwater, 0.5);
  a.entrances.forEach((e) => fillTyphoonShelterTiles(g, scene, e.tiles, e.status === 'ok' ? TYPHOON_SHELTER_COLORS.entrance : TYPHOON_SHELTER_COLORS.problem, 0.55));
  g.lineStyle(3, TYPHOON_SHELTER_COLORS.shore, 0.9);
  a.shoreEdges.forEach((e) => {
    const [p, q] = typhoonShelterEdgeSegment(scene, e);
    g.lineBetween(p.x, p.y, q.x, q.y);
  });
  g.fillStyle(TYPHOON_SHELTER_COLORS.head, 0.95);
  a.heads.forEach((k) => {
    const v = typhoonShelterTileVertices(scene, k);
    g.fillCircle((v[0].x + v[2].x) / 2, (v[0].y + v[2].y) / 2, 4);
  });
  const bad = new Set(a.problems.flatMap((p) => p.tiles));
  if (bad.size) fillTyphoonShelterTiles(g, scene, bad, TYPHOON_SHELTER_COLORS.problem, 0.45);
}

function redrawTyphoonShelterPlanning(scene = typeof activeScene !== 'undefined' ? activeScene : null, { force = false } = {}) {
  if (!scene) return;
  const visible = force || isTyphoonShelterToolActive() || !!typhoonShelterDom?.panel && !typhoonShelterDom.panel.hidden;
  if (!typhoonShelterGraphics || typhoonShelterGraphics.scene !== scene) {
    typhoonShelterGraphics = scene.add.graphics();
    typhoonShelterGraphics.setDepth(typeof getPreviewOverlayDepth === 'function' ? getPreviewOverlayDepth(2) : 1e6);
  }
  const g = typhoonShelterGraphics;
  g.clear();
  if (!visible) return;
  const analyses = getTyphoonShelterAnalyses();
  const preview = typhoonShelterDragPreview || typhoonShelterPendingEdit;
  analyses.forEach((a, id) => {
    if (preview && !preview.rejected && preview.targetId === id) return;
    drawTyphoonShelterAnalysis(g, scene, a, { selected: id === typhoonShelterSelectedId });
  });
  if (preview) {
    if (!preview.rejected && preview.analysis) drawTyphoonShelterAnalysis(g, scene, preview.analysis, { selected: true });
    const r = preview.rect;
    const color = preview.rejected ? TYPHOON_SHELTER_COLORS.problem : preview.subtract ? TYPHOON_SHELTER_COLORS.rectCut : TYPHOON_SHELTER_COLORS.rect;
    g.lineStyle(2, color, 0.95);
    for (let row = r.r0; row <= r.r1; row++) {
      for (let col = r.c0; col <= r.c1; col++) {
        if (row !== r.r0 && row !== r.r1 && col !== r.c0 && col !== r.c1) continue;
        g.strokePoints(typhoonShelterTileVertices(scene, `${row}:${col}`), true);
      }
    }
    // breakwater this change would tear down, on top of everything else
    if (preview.diff?.demolish?.length) {
      fillTyphoonShelterTiles(g, scene, preview.diff.demolish, TYPHOON_SHELTER_COLORS.demolish, 0.45);
    }
  }
  renderTyphoonShelterPanel();
}

// ---------------------------------------------------------------------------
// mode bar and panel
// ---------------------------------------------------------------------------

function tsT(key, fallback, vars) {
  if (typeof t !== 'function') return fallback;
  const out = t(key, vars);
  return out && out !== key ? out : fallback;
}

function createTyphoonShelterDom() {
  if (typhoonShelterDom) return typhoonShelterDom;
  if (!document.getElementById('ts-plan-style')) {
    const style = document.createElement('style');
    style.id = 'ts-plan-style';
    style.textContent = `
      #ts-modebar{position:fixed;top:92px;left:50%;transform:translateX(-50%);z-index:900;display:flex;gap:6px;align-items:center;
        background:rgba(12,24,38,.92);border:1px solid #3f6f8c;border-radius:10px;padding:6px 10px;color:#eaf6ff;
        font:13px/1.3 system-ui,-apple-system,"PingFang HK","Noto Sans TC",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)}
      #ts-modebar[hidden],#ts-panel[hidden]{display:none!important}
      #ts-modebar button,#ts-panel button{border:1px solid #3f7f9c;border-radius:7px;padding:4px 10px;color:#eaf6ff;background:#123243;font:inherit;cursor:pointer}
      #ts-modebar button[data-active="true"]{background:#1f9d5c;border-color:#7ce8a8;color:#06210f}
      #ts-modebar button{white-space:nowrap;flex:none}
      #ts-modebar b{white-space:nowrap}
      #ts-modebar .ts-hint{color:#9bb8cc;font-size:12px;margin-left:4px;max-width:300px}
      #ts-modebar .ts-confirm{background:#1f9d5c;border-color:#7ce8a8;color:#06210f;font-weight:700;margin-left:8px}
      #ts-modebar .ts-confirm:disabled{background:#2a3a48;border-color:#3f5566;color:#8aa0b2;cursor:not-allowed}
      #ts-modebar .ts-confirm-note{color:#ffd27a;font-size:12px;max-width:320px}
      #ts-modebar .ts-cancel{margin-left:4px}
      #ts-panel .ts-expand{background:#1f6f9d;border-color:#7cc8e8;color:#eaf6ff;font-weight:700}
      #ts-modebar .ts-confirm-note.ok{color:#9be89b}
      #ts-panel{position:fixed;top:140px;right:16px;width:300px;z-index:900;background:rgba(12,24,38,.95);border:1px solid #3f6f8c;
        border-radius:12px;padding:12px 14px;color:#eaf6ff;font:13px/1.5 system-ui,-apple-system,"PingFang HK","Noto Sans TC",sans-serif;
        box-shadow:0 12px 36px rgba(0,0,0,.4)}
      #ts-panel h3{margin:0 0 6px;font-size:15px;display:flex;align-items:center;gap:6px}
      #ts-panel input[type=text]{flex:1;min-width:0;background:#0d2232;color:#eaf6ff;border:1px solid #2f5a72;border-radius:6px;padding:3px 6px;font:inherit}
      #ts-panel .ts-chip{font-size:11px;padding:1px 7px;border-radius:9px;white-space:nowrap}
      #ts-panel .ts-chip.ok{background:#1f9d5c;color:#06210f}#ts-panel .ts-chip.bad{background:#c0392b}
      #ts-panel dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:6px 0}
      #ts-panel dt{color:#9bb8cc}#ts-panel dd{margin:0;text-align:right}
      #ts-panel ul{margin:4px 0;padding-left:18px}#ts-panel li.bad{color:#ff9a9a}#ts-panel li.warn{color:#ffd27a}
      #ts-panel .ts-note{color:#7f9db3;font-size:11px}
      #ts-panel .ts-row{display:flex;gap:6px;align-items:center;margin-top:8px}
      #ts-panel .ts-works{border-top:1px solid #2a4a60;margin-top:10px;padding-top:4px}
      #ts-panel .ts-works-block{color:#ffd27a}
      #ts-panel .ts-approve{background:#1f9d5c;border-color:#7ce8a8;color:#06210f;font-weight:700}
      #ts-panel .ts-approve:disabled{background:#2a3a48;border-color:#3f5566;color:#8aa0b2;cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }
  const bar = document.createElement('div');
  bar.id = 'ts-modebar';
  bar.hidden = true;
  bar.innerHTML = `
    <b>${tsT('typhoonShelter.title', '避風塘')}</b>
    <button type="button" data-ts-mode="basin">${tsT('typhoonShelter.mode.basin', '水域')}</button>
    <button type="button" data-ts-mode="entrance">${tsT('typhoonShelter.mode.entrance', '出入口')}</button>
    <button type="button" data-ts-mode="inspect">${tsT('typhoonShelter.mode.inspect', '檢視')}</button>
    <span class="ts-hint"></span>
    <button type="button" class="ts-confirm" hidden></button>
    <button type="button" class="ts-cancel" hidden>${tsT('typhoonShelter.cancel', '取消')}</button>
    <span class="ts-confirm-note"></span>`;
  document.body.appendChild(bar);
  const panel = document.createElement('div');
  panel.id = 'ts-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <h3><input type="text" class="ts-name" maxlength="40"><span class="ts-chip"></span><button type="button" class="ts-close" title="✕">✕</button></h3>
    <dl class="ts-stats"></dl>
    <div class="ts-note ts-protection"></div>
    <ul class="ts-issues"></ul>
    <div class="ts-row"><span>${tsT('typhoonShelter.reserve', '預留避風位')}</span><input type="range" class="ts-reserve" min="0" max="40" step="5" style="flex:1"><b class="ts-reserve-value"></b></div>
    <div class="ts-works">
      <div class="ts-row"><b>${tsT('typhoonShelter.works', '設施')}</b><span class="ts-works-state" style="flex:1;text-align:right"></span></div>
      <dl class="ts-works-stats"></dl>
      <div class="ts-note ts-works-block"></div>
    </div>
    <div class="ts-row"><button type="button" class="ts-approve">${tsT('typhoonShelter.approve', '開展工程')}</button><button type="button" class="ts-expand" hidden>${tsT('typhoonShelter.expand', '擴建')}</button><button type="button" class="ts-delete">${tsT('typhoonShelter.delete', '刪除規劃')}</button></div>
    <div class="ts-note ts-stage-note"></div>`;
  document.body.appendChild(panel);
  typhoonShelterDom = { bar, panel };
  bar.querySelectorAll('[data-ts-mode]').forEach((b) => b.addEventListener('click', () => {
    typhoonShelterMode = b.dataset.tsMode;
    syncTyphoonShelterTool();
  }));
  panel.querySelector('.ts-close').addEventListener('click', () => {
    typhoonShelterSelectedId = null;
    typhoonShelterPendingEdit = null;
    redrawTyphoonShelterPlanning();
  });
  panel.querySelector('.ts-name').addEventListener('change', (e) => updateSelectedTyphoonShelter({ name: e.target.value.trim().slice(0, 40) }));
  panel.querySelector('.ts-reserve').addEventListener('input', (e) => updateSelectedTyphoonShelter({ reservePct: Number(e.target.value) }));
  panel.querySelector('.ts-delete').addEventListener('click', () => {
    const state = getTyphoonShelterState();
    const plan = state.shelters.find((s) => s.id === typhoonShelterSelectedId);
    if (!plan) return;
    const built = !!plan.works?.approved;
    if (built && refuseTyphoonShelterWorksInStorm()) return;
    const question = built
      ? tsT('typhoonShelter.confirmDeleteBuilt', `「${plan.name}」已經建成，刪除會拆走全部設施，唔會退款。繼續？`, { name: plan.name })
      : tsT('typhoonShelter.confirmDelete', `刪除「${plan.name}」嘅規劃？`, { name: plan.name });
    if (typeof confirm === 'function' && !confirm(question)) return;
    setTyphoonShelterState({ ...state, shelters: state.shelters.filter((s) => s.id !== plan.id) });
    typhoonShelterSelectedId = null;
    syncTyphoonShelterFacilitySprites();
    redrawTyphoonShelterPlanning();
  });
  panel.querySelector('.ts-approve').addEventListener('click', () => approveTyphoonShelterWorks(typhoonShelterSelectedId));
  bar.querySelector('.ts-confirm').addEventListener('click', () => {
    if (typhoonShelterPendingEdit) confirmTyphoonShelterPendingEdit();
    else approveTyphoonShelterWorks(typhoonShelterSelectedId);
  });
  bar.querySelector('.ts-cancel').addEventListener('click', () => cancelTyphoonShelterPendingEdit());
  panel.querySelector('.ts-expand').addEventListener('click', () => {
    typhoonShelterMode = 'basin';
    syncTyphoonShelterTool();
    if (typeof showToast === 'function') {
      showToast(tsT('typhoonShelter.toast.expandHow', '由避風塘水域邊向外拖曳，劃出要加嘅水域，然後撳「確定擴建」。'), 'info');
    }
  });
  ['pointerdown', 'wheel'].forEach((type) => {
    bar.addEventListener(type, (e) => e.stopPropagation());
    panel.addEventListener(type, (e) => e.stopPropagation());
  });
  return typhoonShelterDom;
}

function updateSelectedTyphoonShelter(fields) {
  const state = getTyphoonShelterState();
  setTyphoonShelterState({ ...state, shelters: state.shelters.map((s) => (s.id === typhoonShelterSelectedId ? { ...s, ...fields } : s)) });
  redrawTyphoonShelterPlanning();
}

function showTyphoonShelterPanel(show) {
  createTyphoonShelterDom();
  typhoonShelterDom.panel.hidden = !show;
}

function renderTyphoonShelterPanel() {
  if (!typhoonShelterDom) return;
  const { panel, bar } = typhoonShelterDom;
  bar.querySelectorAll('[data-ts-mode]').forEach((b) => { b.dataset.active = String(b.dataset.tsMode === typhoonShelterMode); });
  const selectedPlan = getTyphoonShelterState().shelters.find((s) => s.id === typhoonShelterSelectedId);
  bar.querySelector('.ts-hint').textContent = typhoonShelterMode === 'basin'
    ? (selectedPlan?.works?.approved
      ? tsT('typhoonShelter.hint.expand', '擴建：由避風塘水域邊向外拖曳；Shift＋拖曳削減；然後撳「確定擴建」。')
      : tsT('typhoonShelter.hint.basin', '拖曳加入水域；Shift＋拖曳削減。最少 6×8 格，一邊要靠岸。'))
    : typhoonShelterMode === 'entrance'
      ? tsT('typhoonShelter.hint.entrance', '撳防波堤開 2 格出入口；撳旁邊加闊（長過 10 格嘅邊）；撳出入口取消。')
      : tsT('typhoonShelter.hint.inspect', '撳避風塘睇資料。');
  const preview = typhoonShelterDragPreview || typhoonShelterPendingEdit;
  const state = getTyphoonShelterState();
  renderTyphoonShelterConfirm(bar, state.shelters.find((s) => s.id === typhoonShelterSelectedId), !!typhoonShelterDragPreview);
  const plan = preview?.plan || state.shelters.find((s) => s.id === typhoonShelterSelectedId);
  const a = preview?.analysis || (plan && getTyphoonShelterAnalyses().get(plan.id));
  if (!plan || !a) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const nameInput = panel.querySelector('.ts-name');
  if (document.activeElement !== nameInput) nameInput.value = plan.name || '';
  const chip = panel.querySelector('.ts-chip');
  chip.className = `ts-chip ${a.legal ? 'ok' : 'bad'}`;
  chip.textContent = a.legal ? tsT('typhoonShelter.legal', '可行') : tsT('typhoonShelter.illegal', '未可行');
  const money = (v) => `$${Math.round(v).toLocaleString()}`;
  // the estimate is the works this plan would actually order (typhoon-shelter-works.js)
  const estimate = typhoonShelterWorksEstimate(plan, a);
  const rows = [
    [tsT('typhoonShelter.area', '水域'), `${a.basin.size} 格（${a.areaHa} 公頃）`],
    [tsT('typhoonShelter.shore', '岸線'), `${a.shoreEdges.length} 格`],
    [tsT('typhoonShelter.breakwater', '防波堤'), `${a.breakwater.size} 格 · 堤頭 ${a.heads.size}`],
    [tsT('typhoonShelter.entrances', '出入口'), a.entrances.map((e) => `${e.width} 格`).join('、') || '—'],
    [tsT('typhoonShelter.berths', '泊位'), `${a.berths.daily} ＋ 預留 ${a.berths.reserved}`],
    [tsT('typhoonShelter.protection', '保護度'), `${a.protection.score} / 100`],
    [tsT('typhoonShelter.cost', '工程費（估算）'), `${money(estimate.cost)} · ${estimate.count} 項`],
    [tsT('typhoonShelter.monthly', '每月維護'), money(estimate.upkeep)],
  ];
  if (preview?.bill) {
    rows.push([tsT('typhoonShelter.change', '今次改動'), `新建 ${preview.bill.built} · 拆卸 ${preview.bill.removed} · ${money(preview.bill.cost)}（即時）`]);
  } else if (preview?.diff) {
    rows.push([tsT('typhoonShelter.change', '今次改動'), `新堤 ${preview.diff.build.length} · 拆堤 ${preview.diff.demolish.length}`]);
  }
  panel.querySelector('.ts-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const p = a.protection.parts;
  panel.querySelector('.ts-protection').textContent = `保護度 = 岸線包圍 ${p.shore} ＋ 堤線完整 ${p.breakwater} ＋ 入口直射 ${p.exposure}`;
  const issues = [
    ...(preview?.rejected ? [{ cls: 'bad', text: preview.rejected }] : []),
    ...a.problems.map((x) => ({ cls: 'bad', text: tsT(`typhoonShelter.problem.${x.code}`, x.message) })),
    ...a.warnings.map((x) => ({ cls: 'warn', text: tsT(`typhoonShelter.problem.${x.code}`, x.message) })),
  ];
  panel.querySelector('.ts-issues').innerHTML = issues.map((i) => `<li class="${i.cls}">${i.text}</li>`).join('');
  panel.querySelector('.ts-reserve').value = plan.reservePct;
  panel.querySelector('.ts-reserve-value').textContent = `${plan.reservePct}%`;
  panel.querySelector('.ts-delete').hidden = !!preview?.plan && !preview.targetId;
  const expand = panel.querySelector('.ts-expand');
  expand.hidden = !state.shelters.find((s) => s.id === plan.id)?.works?.approved || !!typhoonShelterPendingEdit;
  expand.dataset.active = String(typhoonShelterMode === 'basin');
  renderTyphoonShelterWorksPanel(panel, plan, a, !!preview);
}

// The mode bar's confirm button: build the selected plan now, for its whole bill.
function renderTyphoonShelterConfirm(bar, plan, previewing) {
  const button = bar.querySelector('.ts-confirm');
  const note = bar.querySelector('.ts-confirm-note');
  note.className = 'ts-confirm-note';
  if (!plan || previewing) {
    button.hidden = true;
    note.textContent = '';
    return;
  }
  const a = getTyphoonShelterAnalyses().get(plan.id);
  const cancel = bar.querySelector('.ts-cancel');
  cancel.hidden = true;
  const pending = typhoonShelterPendingEdit;
  if (pending && pending.targetId === plan.id && plan.works?.approved) {
    const cost = Math.max(0, Math.round(pending.bill?.cost || 0));
    const budget = typeof city !== 'undefined' ? Math.floor(Number(city.budget) || 0) : Infinity;
    const grows = pending.analysis.basin.size >= (a?.basin.size || 0) && !pending.subtract;
    const verb = grows ? tsT('typhoonShelter.confirmExpand', '確定擴建') : tsT('typhoonShelter.confirmEdit', '確定修改');
    button.hidden = false;
    cancel.hidden = false;
    button.textContent = `${verb}（$${cost.toLocaleString()}）`;
    const why = !pending.analysis.legal ? (pending.analysis.problems[0]?.message || '')
      : isTyphoonShelterWorksPaused() ? typhoonShelterWorksPausedNote()
      : cost > budget ? tsT('typhoonShelter.notEnoughFunds', `市庫唔夠錢：要 $${cost.toLocaleString()}，而家得 $${budget.toLocaleString()}`, { cost: cost.toLocaleString(), budget: budget.toLocaleString() })
        : '';
    button.disabled = !!why;
    note.textContent = why;
    return;
  }
  if (plan.works?.approved) {
    button.hidden = true;
    const sum = typhoonShelterWorkSummaries.get(plan.id) || summarizeTyphoonShelterWorks(plan.works, a, { pierConnected: typhoonShelterPierConnected(plan.works) });
    note.className = `ts-confirm-note${sum.operational ? ' ok' : ''}`;
    note.textContent = sum.operational
      ? tsT('typhoonShelter.state.operational', '已建成 · 運作中')
      : tsT('typhoonShelter.state.waitingRoad', '已建成 · 碼頭未接路（岸邊 3 格內要有路）');
    return;
  }
  const estimate = typhoonShelterWorksEstimate(plan, a);
  button.hidden = false;
  button.disabled = !a?.legal || isTyphoonShelterWorksPaused();
  if (a?.legal && isTyphoonShelterWorksPaused()) note.textContent = typhoonShelterWorksPausedNote();
  button.textContent = tsT('typhoonShelter.confirm', `確定興建（$${estimate.cost.toLocaleString()}）`, { cost: estimate.cost.toLocaleString() });
  if (!isTyphoonShelterWorksPaused() || !a?.legal) note.textContent = a?.legal ? '' : (a?.problems[0]?.message || '');
}

function renderTyphoonShelterWorksPanel(panel, plan, a, previewing) {
  const money = (v) => `$${Math.round(v).toLocaleString()}`;
  const works = plan.works;
  const approve = panel.querySelector('.ts-approve');
  approve.hidden = previewing || !!works?.approved;
  const paused = isTyphoonShelterWorksPaused();
  approve.disabled = !a.legal || paused;
  approve.textContent = tsT('typhoonShelter.approve', '確定興建');
  approve.title = !a.legal ? tsT('typhoonShelter.approveBlocked', '規劃未可行，未能興建') : paused ? typhoonShelterWorksPausedNote() : '';
  panel.querySelector('.ts-works').hidden = !works?.approved;
  panel.querySelector('.ts-stage-note').textContent = works?.approved
    ? tsT('typhoonShelter.builtNote', '擴建或削減：拖曳之後撳「確定擴建」，先會重建同收費。')
    : tsT('typhoonShelter.planningOnly', '規劃中：撳「確定興建」即時建成，一次過收費。');
  if (!works?.approved) return;
  const sum = typhoonShelterWorkSummaries.get(plan.id) || summarizeTyphoonShelterWorks(works, a, { pierConnected: typhoonShelterPierConnected(works) });
  panel.querySelector('.ts-works-state').textContent = sum.operational
    ? tsT('typhoonShelter.state.operationalShort', '運作中') : tsT('typhoonShelter.state.waitingRoadShort', '未接路');
  const rows = [
    [tsT('typhoonShelter.worksBuilt', '已建成'), `${sum.done} 項`],
    [tsT('typhoonShelter.monthlyBuilt', '維護'), `${money(sum.upkeep)}／月`],
    [tsT('typhoonShelter.berthsReal', '可用泊位'), sum.operational ? `${sum.berths.daily} ＋ 預留 ${sum.berths.reserved}` : '—'],
  ];
  if (typeof summarizeTyphoonShelterFleet === 'function' && plan.fleet) {
    const f = summarizeTyphoonShelterFleet(plan, a);
    rows.push(
      [tsT('typhoonShelter.fleet', '船隊'), `${f.boats} 艘（漁船 ${f.fishing}）`],
      [tsT('typhoonShelter.fleetNow', '而家'), `停泊 ${f.moored} · 出海 ${f.out + f.away} · 返港 ${f.home}`],
      [tsT('typhoonShelter.catchToday', '今日漁獲'), `${f.tripsToday} 船次 · 約 ${f.catchToday} 噸`],
    );
    if (f.repairing) rows.push([tsT('typhoonShelter.repairing', '維修中'), `${f.repairing} 艘（風災受損）`]);
  }
  rows.push(...typhoonShelterStormRows(plan, a));
  panel.querySelector('.ts-works-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  panel.querySelector('.ts-works-block').textContent = sum.pierConnected ? ''
    : tsT('typhoonShelter.block.road', '碼頭未接路：要喺碼頭岸邊 3 格內有道路，避風塘先可以運作。');
}

// The panel's 風暴 rows (typhoon-shelter-storm.js): the phase, this shelter's visitors and its risk.
function typhoonShelterStormRows(plan, a) {
  if (typeof getTyphoonShelterStormPhase !== 'function' || typeof city === 'undefined') return [];
  const storm = getTyphoonShelterState().storm;
  const env = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : 0;
  const phase = getTyphoonShelterStormPhase(storm, city.weather, env);
  if (phase === 'clear') return [];
  const phaseLabel = {
    standby: tsT('typhoonShelter.storm.standby', '戒備：遠航漁船唔出海'),
    recall: tsT('typhoonShelter.storm.recall', '召回：全部漁船返港'),
    shelter: tsT('typhoonShelter.storm.shelter', '避風：全部留港'),
    waiting: tsT('typhoonShelter.storm.waiting', '風勢減弱：安全兩小時後復航'),
    recovery: tsT('typhoonShelter.storm.recovery', '復航：外來船陸續離開'),
  }[phase];
  const signal = { signal1: '一號', signal3: '三號', signal8: '八號', signal9: '九號', signal10: '十號' }[city.weather?.typhoonStage];
  const rows = [[tsT('typhoonShelter.storm.title', '風暴'), `${signal ? `${signal}風球 · ` : ''}${phaseLabel}`]];
  const mine = (storm?.visitors || []).filter((v) => v.shelterId === plan.id);
  if (mine.length || storm?.turnedAway) {
    const inside = mine.filter((v) => typeof typhoonShelterVisitorState === 'function'
      && typhoonShelterVisitorState(v, 1, env).mode === 'moored').length;
    rows.push([tsT('typhoonShelter.storm.visitors', '外來船'), `已入塘 ${inside} / 分配 ${mine.length}${storm.turnedAway ? ` · 全市轉港 ${storm.turnedAway}` : ''}`]);
  }
  const p = a.protection?.score || 0;
  const exposure = (1 - p / 100) ** 2;
  const risk = exposure < 0.05 ? tsT('typhoonShelter.storm.riskLow', '低') : exposure < 0.2 ? tsT('typhoonShelter.storm.riskMid', '中') : tsT('typhoonShelter.storm.riskHigh', '高');
  rows.push([tsT('typhoonShelter.storm.risk', '風災風險'), `${risk}（保護度 ${p}）`]);
  const report = storm?.report?.shelters?.[plan.id];
  if (report && phase === 'recovery') {
    rows.push([tsT('typhoonShelter.storm.lastRepair', '上次風災'), `修復費 $${report.repair.toLocaleString()} · 受損 ${report.damagedBoats.length + report.damagedVisitors} 艘`]);
  }
  return rows;
}

// Called whenever the selected tool changes (updateToolCategoryState in tool-menu.js).
function syncTyphoonShelterTool() {
  createTyphoonShelterDom();
  const active = isTyphoonShelterToolActive();
  typhoonShelterDom.bar.hidden = !active;
  if (!active) {
    typhoonShelterDragPreview = null;
    typhoonShelterPendingEdit = null;   // leaving the tool drops an unconfirmed change
    if (!typhoonShelterSelectedId) typhoonShelterDom.panel.hidden = true;
  }
  redrawTyphoonShelterPlanning();
}

// New city / loaded save: drop the selection and redraw from the new state.
function resetTyphoonShelterPlanning() {
  typhoonShelterSelectedId = null;
  typhoonShelterDragPreview = null;
  typhoonShelterPendingEdit = null;
  typhoonShelterAnalysisCache = { key: '', byId: new Map() };
  typhoonShelterTerrainCheck = { at: -Infinity, stamp: null };
  typhoonShelterWorkSummaries.clear();
  typhoonShelterQuayTiles = new Set();
  typhoonShelterPavedTiles = new Set();
  if (typhoonShelterDom) typhoonShelterDom.panel.hidden = true;
  if (typhoonShelterGraphics && typhoonShelterGraphics.scene) typhoonShelterGraphics.clear();
  const scene = typeof activeScene !== 'undefined' ? activeScene : null;
  if (scene && typeof clearTyphoonShelterObjects === 'function') clearTyphoonShelterObjects(scene, 'works');
  if (scene && typeof clearTyphoonShelterBoats === 'function') clearTyphoonShelterBoats(scene);
}

// ---------------------------------------------------------------------------
// works (Phase 2)
// ---------------------------------------------------------------------------

const typhoonShelterWorkSummaries = new Map(); // shelter id -> summarizeTyphoonShelterWorks()

// Tiles from a land tile to the nearest road, within the pier's reach; Infinity beyond.
function typhoonShelterRoadDistance(row, col) {
  const reach = TYPHOON_SHELTER_ROAD_REACH;
  let best = Infinity;
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const d = Math.abs(dr) + Math.abs(dc);
      if (d > reach || d >= best) continue;
      const r = row + dr;
      const c = col + dc;
      if (isInsideMap(r, c) && mapData[r][c] === ROAD && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c))) best = d;
    }
  }
  return best;
}

function typhoonShelterWorksContext() {
  getTyphoonShelterAnalyses();
  const fp = typhoonShelterAnalysisCache.footprints || new Map();
  const taken = new Set();
  fp.forEach((tiles) => tiles.forEach((k) => taken.add(k)));
  return {
    roadDistance: typhoonShelterRoadDistance,
    isOpenWater: (r, c) => typhoonShelterBaseKind(r, c) === 'water' && !taken.has(`${r}:${c}`),
    isFreeBeach: (r, c) => isInsideMap(r, c) && mapData[r][c] === BEACH && !buildingData?.[getTileId(r, c)]
      && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c)),
    isLand: (r, c) => typhoonShelterBaseKind(r, c) === 'land',
    // a shore tile the quay may face: open ground or beach, no road, building or bridge on it
    isQuaySite: (r, c) => typhoonShelterBaseKind(r, c) === 'land' && mapData[r][c] !== ROAD
      && !buildingData?.[getTileId(r, c)] && !taken.has(`${r}:${c}`),
    isBeach: (r, c) => isInsideMap(r, c) && mapData[r][c] === BEACH,
  };
}

function typhoonShelterPierConnected(works) {
  const pier = (works?.items || []).find((i) => i.kind === 'pier' && i.state === 'done');
  if (!pier) return false;
  // the land behind the pier: one tile back from its seaward facing
  const back = { n: [1, 0], s: [-1, 0], e: [0, -1], w: [0, 1] }[pier.facing] || [0, 0];
  return typhoonShelterRoadDistance(pier.row + back[0], pier.col + back[1]) <= TYPHOON_SHELTER_ROAD_REACH;
}

// The bill for turning `before` (built or not) into `nextPlan`: { works, cost, built, removed }.
function priceTyphoonShelterChange(before, nextPlan, analysis) {
  const layout = layoutTyphoonShelterWorks(nextPlan, analysis, typhoonShelterWorksContext());
  return completeTyphoonShelterWorks(reconcileTyphoonShelterWorks(before.works?.approved ? before.works : createTyphoonShelterWorks(), layout));
}

function payTyphoonShelterBill(cost) {
  if (cost <= 0) return true;
  if (typeof spendBudget === 'function' && spendBudget(cost)) return true;
  if (typeof showToast === 'function') {
    showToast(tsT('typhoonShelter.toast.funds', `要 $${Math.round(cost).toLocaleString()}，市庫唔夠錢。`, { cost: Math.round(cost).toLocaleString() }), 'warning');
  }
  return false;
}

function typhoonShelterBuiltStatus(plan) {
  return typhoonShelterPierConnected(plan.works) ? 'operational' : 'built';
}

// 確定興建: build every work of a feasible plan now, paying the whole bill once.
function approveTyphoonShelterWorks(id) {
  const state = getTyphoonShelterState();
  const plan = state.shelters.find((s) => s.id === id);
  const analysis = plan && getTyphoonShelterAnalyses().get(id);
  if (!plan || !analysis?.legal || plan.works?.approved) return false;
  if (refuseTyphoonShelterWorksInStorm()) return false;
  const bill = priceTyphoonShelterChange(plan, plan, analysis);
  if (!payTyphoonShelterBill(bill.cost)) return false;
  const built = { ...plan, works: { ...bill.works, approved: true } };
  built.status = typhoonShelterBuiltStatus(built);
  setTyphoonShelterState({ ...state, shelters: state.shelters.map((s) => (s.id === id ? built : s)) });
  typhoonShelterWorkSummaries.set(id, summarizeTyphoonShelterWorks(built.works, analysis, { pierConnected: built.status === 'operational' }));
  if (typeof showToast === 'function') {
    showToast(built.status === 'operational'
      ? tsT('typhoonShelter.toast.operational', `「${plan.name}」落成啟用！`, { name: plan.name })
      : tsT('typhoonShelter.toast.builtNoRoad', `「${plan.name}」建成，碼頭接路之後就可以運作。`, { name: plan.name }), built.status === 'operational' ? 'success' : 'info');
  }
  if (typeof updateHUD === 'function') updateHUD();
  syncTyphoonShelterFacilitySprites();
  redrawTyphoonShelterPlanning();
  return true;
}

// Once a game day (simulation.js runDailySystems): a built shelter opens when its pier gets a road
// (and closes if the road goes), and an open one takes on boats toward its berths.
function runTyphoonShelterWorksDaily() {
  const state = getTyphoonShelterState();
  if (!state.shelters.some((s) => s.works?.approved)) return;
  const analyses = getTyphoonShelterAnalyses();
  let changed = false;
  let shelters = state.shelters.map((plan) => {
    if (!plan.works?.approved) return plan;
    const pierConnected = typhoonShelterPierConnected(plan.works);
    typhoonShelterWorkSummaries.set(plan.id, summarizeTyphoonShelterWorks(plan.works, analyses.get(plan.id), { pierConnected }));
    const status = pierConnected ? 'operational' : 'built';
    if (status === plan.status) return plan;
    changed = true;
    if (status === 'operational' && typeof showToast === 'function') {
      showToast(tsT('typhoonShelter.toast.operational', `「${plan.name}」落成啟用！`, { name: plan.name }), 'success');
    }
    return { ...plan, status };
  });
  if (typeof updateTyphoonShelterFleets === 'function') {
    const fleets = updateTyphoonShelterFleets({ ...state, shelters }, analyses, typhoonShelterWorkSummaries);
    if (fleets) { shelters = fleets; changed = true; }
  }
  if (!changed) return;
  setTyphoonShelterState({ ...state, shelters });
  if (typhoonShelterDom) renderTyphoonShelterPanel();
}

// Monthly upkeep of everything built (budget line 避風塘維護, city-state.js).
function getTyphoonShelterMonthlyUpkeep() {
  return getTyphoonShelterState().shelters.reduce((sum, plan) => sum + (plan.works?.items || [])
    .filter((i) => i.state === 'done')
    .reduce((s, i) => s + (TYPHOON_SHELTER_WORK_KINDS[i.kind]?.upkeep || 0), 0), 0);
}

// What the works for a plan would cost: { cost, upkeep, count }.
function typhoonShelterWorksEstimate(plan, analysis) {
  if (typeof layoutTyphoonShelterWorks !== 'function') return { cost: analysis.cost.build, upkeep: analysis.cost.monthly, count: 0 };
  const layout = layoutTyphoonShelterWorks(plan, analysis, typhoonShelterWorksContext());
  return layout.reduce((acc, w) => {
    const kind = TYPHOON_SHELTER_WORK_KINDS[w.kind];
    acc.cost += kind.cost;
    acc.upkeep += kind.upkeep;
    acc.count += 1;
    return acc;
  }, { cost: 0, upkeep: 0, count: 0 });
}

// The fittings along a promenade's sea edge, on its coping (metres in from the edge, and along it
// from the tile's middle): as the harbourfront render has them.
const QUAY_EDGE = Object.freeze({
  insetM: 0.9,
  fittings: Object.freeze([
    ['pierAssessories_bollardSmall', -7.5], ['pierAssessories_mooringRing', -2.5],
    ['pierAssessories_mooringRing', 2.5], ['pierAssessories_bollardSmall', 7.5],
  ]),
});

// How far from a head's centre the breakwater joining it reaches in (metres): over its steps, short
// of the lighthouse.
const HEAD_JOIN_INNER_M = 3;

// 海濱步道, cell by cell. Each shore tile is four 10 m cells; the two cells along a quay side, and a
// corner fill's cell, are promenade. Every promenade cell gets brick, and each of its four sides:
// nothing toward more promenade (the brick runs on), the coping - with the wall below it where that
// side faces the camera - toward the sea or a breakwater, the kerb toward the land. So corners wrap
// their wall round, the ends of a run close with a kerb, and no kerb ever crosses the brick.
const PROMENADE_CELL_SIDE = Object.freeze({ n: [[0, 0], [0, 1]], s: [[1, 0], [1, 1]], w: [[0, 0], [1, 0]], e: [[0, 1], [1, 1]] });

function layTyphoonShelterPromenade(plan, wanted, basin = null) {
  const band = new Set();
  (plan.works?.items || []).forEach((i) => {
    if (i.state !== 'done') return;
    if (i.kind === 'quay') {
      (PROMENADE_CELL_SIDE[i.facing] || []).forEach(([dr, dc]) => band.add(`${2 * i.row + dr}:${2 * i.col + dc}`));
    } else if (i.kind === 'quayFill') {
      const [v, h] = [...(i.corner || 'nw')];
      band.add(`${2 * i.row + (v === 's' ? 1 : 0)}:${2 * i.col + (h === 'e' ? 1 : 0)}`);
    }
  });
  const half = TYPHOON_SHELTER_TILE_M / 4;   // a cell's centre, out from its tile's centre
  const step = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
  band.forEach((key) => {
    const [R, C] = key.split(':').map(Number);
    const row = Math.floor(R / 2);
    const col = Math.floor(C / 2);
    const offsets = [[R % 2 ? 's' : 'n', half], [C % 2 ? 'e' : 'w', half]];
    const piece = (suffix, objectId, facing, depthBias) => wanted.set(`${plan.id}|promenade:${key}${suffix}`, {
      item: { key: `promenade:${key}`, kind: 'promenade', row, col, facing, state: 'done' },
      objectId, alpha: 1, tint: null, footprintOverride: { cols: 1, rows: 1 }, shoreAlign: false, shoreDir: null,
      offsets, sectioned: true, depthBias, alongM: 0,
    });
    piece('', 'quayDeckSquare', 'e', 0);
    Object.entries(step).forEach(([side, [dr, dc]]) => {
      const [nr, nc] = [R + dr, C + dc];
      if (band.has(`${nr}:${nc}`)) return;
      const [tr, tc] = [Math.floor(nr / 2), Math.floor(nc / 2)];
      const sea = (tr !== row || tc !== col) && mapData[tr]?.[tc] === WATER;
      piece(`#${side}`, sea ? 'promenadeEdge' : 'promenadeKerb', side, sea ? 0.04 : 0.02);
      // a railing along the open coast: the sea outside the shelter, or behind its breakwater (the
      // basin side is where boats come alongside, and keeps its bollards instead)
      if (sea && basin && !basin.has(`${tr}:${tc}`)) {
        const run = side === 'n' || side === 's' ? 'e' : 'n';
        const edge = half - PROMENADE_RAILING.insetM;
        PROMENADE_RAILING.along.forEach((along, i) => wanted.set(`${plan.id}|promenade:${key}#rail${side}${i}`, {
          item: { key: `promenade:${key}`, kind: 'promenade', row, col, facing: run, state: 'done' },
          objectId: PROMENADE_RAILING.objectId, alpha: 1, tint: null, footprintOverride: { cols: 1, rows: 1 },
          shoreAlign: false, shoreDir: null, sectioned: true, depthBias: 0.06, alongM: 0,
          offsets: [...offsets, [side, edge], [run, along]],
        }));
      }
    });
  });
  return band;
}

// The railing on the open coast: 海旁欄杆 sections (3.4 m, 1.2 m high), three to a cell side, set
// in from the sea edge onto the coping.
const PROMENADE_RAILING = Object.freeze({ objectId: 'shoreFence_straightA', insetM: 0.6, along: Object.freeze([-3.33, 0, 3.33]) });

// Gear left about the waterfront's gravel (石仔地): fishing-gear piles (2-3 m across, 2.2-2.4 m
// high) on about one cell in four, placed and turned by a hash of the cell, so they stay put.
const WATERFRONT_CLUTTER = Object.freeze(['shoreAssessories1', 'shoreAssessories3', 'shoreAssessories4']);

function typhoonShelterCellHash(r, c, salt) {
  let h = (Math.imul(r + 101, 0x9e3779b1) ^ Math.imul(c + 37, 0x85ebca6b) ^ Math.imul(salt + 7, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function layTyphoonShelterClutter(promenadeCells, wanted) {
  const half = TYPHOON_SHELTER_TILE_M / 4;
  const dirs = ['n', 'e', 's', 'w'];
  typhoonShelterPavedTiles.forEach((tile) => {
    const [row, col] = tile.split(':').map(Number);
    if (buildingData?.[getTileId(row, col)]) return;
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        const [R, C] = [2 * row + dr, 2 * col + dc];
        if (promenadeCells.has(`${R}:${C}`) || typhoonShelterCellHash(R, C, 1) > 0.25) continue;
        const objectId = WATERFRONT_CLUTTER[Math.floor(typhoonShelterCellHash(R, C, 2) * WATERFRONT_CLUTTER.length)];
        const jitter = (salt) => (typhoonShelterCellHash(R, C, salt) - 0.5) * 3;
        wanted.set(`clutter|${R}:${C}`, {
          item: { key: `clutter:${R}:${C}`, kind: 'clutter', row, col, facing: dirs[Math.floor(typhoonShelterCellHash(R, C, 3) * 4)], state: 'done' },
          objectId, alpha: 1, tint: null, footprintOverride: { cols: 1, rows: 1 }, shoreAlign: false, shoreDir: null,
          sectioned: true, depthBias: 0.1, alongM: 0, variant: Math.floor(typhoonShelterCellHash(R, C, 6) * 8),
          offsets: [[dr ? 's' : 'n', half + jitter(4)], [dc ? 'e' : 'w', half + jitter(5)]],
        });
      }
    }
  });
}

// The land tiles a built quay (海堤) stands on: terrain draws them as plain ground (not beach) and
// the water beside them without a bank (tile-keys.js).
let typhoonShelterQuayTiles = new Set();

// A landing stage against a promenade: its shore end stands this far off the seawall, in metres
// (negative: short of the shoreline), so the pontoon floats in front of the wall and only its rails
// rise past the coping (tried in game at 1.5, 0, -1.5 and -3 m, 2026-10-04).
const TYPHOON_SHELTER_PROMENADE_LANDING_OVERLAP_M = -2;

function isTyphoonShelterQuayTile(row, col) {
  return typhoonShelterQuayTiles.has(`${row}:${col}`);
}

// The open ground of the waterfront, drawn as 石仔地 (dirt_full): the quay's tiles and the flat,
// free ground beside them (no road, building or bridge) - the land a shelter's works are
// built on. Visual only: mapData keeps its terrain, so pulling a shelter down restores the grass.
let typhoonShelterPavedTiles = new Set();

function isTyphoonShelterPavedTile(row, col) {
  return typhoonShelterPavedTiles.has(`${row}:${col}`);
}

function typhoonShelterPaveable(r, c) {
  return isInsideMap(r, c) && (mapData[r][c] === GROUND || mapData[r][c] === BEACH)
    && getTileHeight(r, c) === 0 && !buildingData?.[getTileId(r, c)]
    && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c));
}

function syncTyphoonShelterQuayTerrain(scene) {
  const next = new Set();
  const strips = new Set();
  getTyphoonShelterState().shelters.forEach((plan) => (plan.works?.items || []).forEach((item) => {
    if (item.state !== 'done' || !['quay', 'quayFill', 'quayGround'].includes(item.kind)) return;
    next.add(`${item.row}:${item.col}`);
    if (item.kind !== 'quayGround') strips.add(`${item.row}:${item.col}`);
  }));
  // the gravel spreads from the promenade: its tiles, the open ground round them, and the paved-over
  // beaches that touch either (a beach patch off on its own stays plain ground)
  const paved = new Set([...strips].filter((k) => typhoonShelterPaveable(...k.split(':').map(Number))));
  strips.forEach((k) => {
    const [r, c] = k.split(':').map(Number);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      // beside the quay only open ground: a beach left there meets the sea without a wall
      if (mapData[r + dr]?.[c + dc] === GROUND && typhoonShelterPaveable(r + dr, c + dc)) paved.add(`${r + dr}:${c + dc}`);
    }
  });
  for (let grown = true; grown;) {
    grown = false;
    next.forEach((k) => {
      if (paved.has(k) || strips.has(k)) return;
      const [r, c] = k.split(':').map(Number);
      if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => paved.has(`${r + dr}:${c + dc}`)) && typhoonShelterPaveable(r, c)) {
        paved.add(k);
        grown = true;
      }
    });
  }
  const before = new Set([...typhoonShelterQuayTiles, ...typhoonShelterPavedTiles]);
  const after = new Set([...next, ...paved]);
  const changed = [...after].filter((k) => !before.has(k)).concat([...before].filter((k) => !after.has(k)));
  typhoonShelterQuayTiles = next;
  typhoonShelterPavedTiles = paved;
  if (!scene || typeof refreshTileArea !== 'function') return;
  changed.forEach((k) => {
    const [r, c] = k.split(':').map(Number);
    // the waterfront is built over the ground: no tree stands on it
    if (after.has(k) && typeof removeTree === 'function') removeTree(scene, r, c);
    refreshTileArea(scene, r, c);
  });
}

// Make the works sprites match the built works.
function syncTyphoonShelterFacilitySprites(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (!scene || typeof addTyphoonShelterObject !== 'function') return;
  // sizes (walkway sections per tile) come from the placement data: wait for it on a cold start
  if (!Object.keys(getTyphoonShelterPlacement().parts).length) {
    loadTyphoonShelterPlacement().then(() => {
      if (Object.keys(getTyphoonShelterPlacement().parts).length) syncTyphoonShelterFacilitySprites(scene);
    });
    return;
  }
  if (!scene.typhoonShelterObjects) scene.typhoonShelterObjects = new Map();
  syncTyphoonShelterQuayTerrain(scene);
  const wanted = new Map();
  // A walkway or breakwater tile is drawn as however many sections it takes, end to end at their
  // real size, to cover it without gaps (sections longer than a tile overlap their neighbours).
  const sectionsPerTile = (kind) => {
    const sectionM = getTyphoonShelterObjectMetres(TYPHOON_SHELTER_WORK_KINDS[kind].objectId)?.alongM || TYPHOON_SHELTER_TILE_M;
    return Math.max(1, Math.ceil(TYPHOON_SHELTER_TILE_M / sectionM - 0.05));
  };
  const perTile = { pontoon: sectionsPerTile('pontoon'), breakwater: sectionsPerTile('breakwater') };
  // A corner (or T) of the breakwater is drawn as one wall per arm, each from just behind the tile's
  // centre out to its edge, so the arms cross in the middle and meet square: one section along the
  // tile would stick out past the corner on one side and stop short of the other arm.
  const wallM = getTyphoonShelterObjectMetres(TYPHOON_SHELTER_WORK_KINDS.breakwater.objectId);
  const armSlides = (() => {
    const L = wallM?.alongM || TYPHOON_SHELTER_TILE_M;
    const half = (wallM?.acrossM || TYPHOON_SHELTER_TILE_M / 2) / 2;
    const reach = TYPHOON_SHELTER_TILE_M / 2 + 0.5; // a little into the next tile's wall
    const n = Math.max(1, Math.ceil((reach + half) / L - 0.05));
    const first = L / 2 - half;
    const last = Math.max(first, reach - L / 2);
    return Array.from({ length: n }, (_, i) => (n === 1 ? first : first + ((last - first) * i) / (n - 1)));
  })();
  const ARM_STEP = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
  const promenadeCells = new Set();
  getTyphoonShelterState().shelters.forEach((plan) => {
    const walls = new Set((plan.works?.items || []).filter((i) => i.state === 'done' && (i.kind === 'breakwater' || i.kind === 'head'))
      .map((i) => `${i.row}:${i.col}`));
    const armsOf = (item) => Object.keys(ARM_STEP).filter((d) => walls.has(`${item.row + ARM_STEP[d][0]}:${item.col + ARM_STEP[d][1]}`));
    const analysis = getTyphoonShelterAnalyses().get(plan.id);
    layTyphoonShelterPromenade(plan, wanted, analysis?.basin).forEach((k) => promenadeCells.add(k));
    (plan.works?.items || []).forEach((item) => {
      const workKind = TYPHOON_SHELTER_WORK_KINDS[item.kind];
      if (item.state !== 'done' || !workKind?.objectId || workKind.drawn === false) return;
      const base = {
        item,
        alpha: 1,
        tint: null,
        // breakwater and walkway sections are drawn one tile at a time, overlapping into a line
        footprintOverride: ['breakwater', 'breakwaterRoot', 'head', 'pontoon', 'quay', 'quayFill'].includes(item.kind) ? { cols: 1, rows: 1 } : null,
        // the pier on the water's edge reaches over the shoreline (one on a beach stands on the
        // sand); a walkway's landing stage always reaches up onto the shore, beach or not
        shoreAlign: item.kind === 'floatingPier' || (item.kind === 'pier' && mapData[item.row]?.[item.col] === WATER),
        shoreDir: item.kind === 'floatingPier' ? item.facing : null,
        // against a promenade the landing stage floats on the water, alongside the seawall (pushed
        // the usual 8 m onto the shore it stood on the paving)
        shoreOverlapM: item.kind === 'floatingPier'
          && isTyphoonShelterQuayTile(item.row + (ARM_STEP[item.facing]?.[0] || 0), item.col + (ARM_STEP[item.facing]?.[1] || 0))
          ? TYPHOON_SHELTER_PROMENADE_LANDING_OVERLAP_M : null,
        depthBias: item.kind === 'floatingPier' ? 1 : 0,
        alongM: 0,
      };
      // a quay section lies along its tile's water edge, the wall on the tile edge: 20 m long, its
    // deck ~8 m deep, so its middle is ~6 m out from the tile's centre; a corner fill (8 x 8 m) sits
    // in its corner of the tile, 6 m out both ways
      if (item.kind === 'quay') {
        // the promenade itself is laid cell by cell (below); a quay side carries its fittings: on the
        // coping, as on a working waterfront, bollards and mooring rings along the sea edge
        // (bollard, ring, ring, bollard each tile), and a lamp on every other tile by the land side
        const run = item.facing === 'n' || item.facing === 's' ? 'e' : 'n';
        const decor = (suffix, objectId, offsets, facing = item.facing, depthBias = 0.2) => wanted.set(
          `${plan.id}|${item.key}#${suffix}`, { ...base, objectId, item: { ...item, facing }, offsets, depthBias },
        );
        const edgeM = TYPHOON_SHELTER_TILE_M / 2 - QUAY_EDGE.insetM;
        // only where boats lie alongside - in the basin; the open coast has its railing instead
        const [fr, fc] = [item.row + ARM_STEP[item.facing][0], item.col + ARM_STEP[item.facing][1]];
        if (analysis?.basin.has(`${fr}:${fc}`)) QUAY_EDGE.fittings.forEach(([objectId, along], i) => decor(`fit${i}`, objectId, [[item.facing, edgeM], [run, along]], run));
        if ((item.row + item.col) % 2 === 0) decor('lamp', 'promenadeLamp', [[item.facing, 1.5]], item.facing, 0.3);
        return;
      }
      if (item.kind === 'quayFill') return;
    // a breakwater root reaches on toward the land, its rocks up over the shoreline: 12 m when the
      // land is straight ahead, a whole tile when it is the headland round the corner
      if (item.kind === 'breakwaterRoot') {
        const step = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] }[item.facing];
        // against a promenade the breakwater ends at its seawall (its own tile's sections reach it):
        // reaching on would cover the walkway
        if (isTyphoonShelterQuayTile(item.row + step[0], item.col + step[1])) return;
        const ahead = mapData[item.row + step[0]]?.[item.col + step[1]];
        wanted.set(`${plan.id}|${item.key}`, { ...base, alongM: ahead === WATER ? 20 : 12, depthBias: -0.5 });
        return;
      }
      // a head: the breakwater it caps runs on into its tile, over the head's side (its steps), so
      // the two read as one; sorted by where it reaches, it is behind the head when that side faces
      // away from the camera
      if (item.kind === 'head') {
        // its lantern flashes the colour of the entrance buoy on its side: red to port coming in,
        // green to starboard (layoutTyphoonShelterWorks)
        const buoy = (plan.works?.items || []).filter((i) => i.kind === 'navBuoyRed' || i.kind === 'navBuoyGreen')
          .reduce((best, i) => {
            const d = (i.row - item.row) ** 2 + (i.col - item.col) ** 2;
            return !best || d < best.d ? { d, kind: i.kind } : best;
          }, null);
        wanted.set(`${plan.id}|${item.key}`, { ...base, light: `beacon:${buoy?.kind === 'navBuoyGreen' ? 'green' : 'red'}` });
        const L = wallM?.alongM || TYPHOON_SHELTER_TILE_M;
        armsOf(item).forEach((arm) => wanted.set(`${plan.id}|${item.key}#join${arm}`, {
          ...base, objectId: TYPHOON_SHELTER_WORK_KINDS.breakwater.objectId, item: { ...item, facing: arm },
          alongM: HEAD_JOIN_INNER_M + L / 2, sectioned: true,
        }));
        return;
      }
      if (item.kind === 'breakwater') {
        const arms = armsOf(item);
        const straight = arms.length === 2 && (arms.join() === 'n,s' || arms.join() === 'e,w');
        if (arms.length >= 2 && !straight) {
          arms.forEach((arm) => armSlides.forEach((alongM, i) => {
            wanted.set(`${plan.id}|${item.key}#${arm}${i}`, { ...base, item: { ...item, facing: arm }, alongM, sectioned: true });
          }));
          return;
        }
      }
      const n = perTile[item.kind];
      if (!n || n === 1) { wanted.set(`${plan.id}|${item.key}`, base); return; }
      for (let i = 0; i < n; i++) {
        const alongM = ((i + 0.5) / n - 0.5) * TYPHOON_SHELTER_TILE_M;
        wanted.set(`${plan.id}|${item.key}#${i}`, { ...base, alongM, sectioned: true, depthBias: item.kind === 'pontoon' ? i * 0.01 : base.depthBias });
      }
    });
  });
  layTyphoonShelterClutter(promenadeCells, wanted);
  [...scene.typhoonShelterObjects.values()].forEach((rec) => {
    if (rec.tag === 'works' && !wanted.has(rec.id)) removeTyphoonShelterObject(scene, rec.id);
  });
  wanted.forEach((w, id) => {
    const rec = scene.typhoonShelterObjects.get(id);
    const objectId = w.objectId || TYPHOON_SHELTER_WORK_KINDS[w.item.kind].objectId;
    const light = getTyphoonShelterRecordLight({ objectId, light: w.light });
    if (rec) {
      const shoreOverlapM = w.shoreOverlapM ?? null;
      if (rec.alpha !== w.alpha || rec.tint !== w.tint || rec.facing !== w.item.facing || rec.light !== light
        || rec.shoreOverlapM !== shoreOverlapM) {
        Object.assign(rec, { alpha: w.alpha, tint: w.tint, facing: w.item.facing, light, shoreOverlapM });
        positionTyphoonShelterObject(scene, rec);
      }
      return;
    }
    addTyphoonShelterObject(scene, {
      id,
      objectId,
      light,
      row: w.item.row,
      col: w.item.col,
      facing: w.item.facing,
      tag: 'works',
      alpha: w.alpha,
      tint: w.tint,
      footprintOverride: w.footprintOverride,
      shoreAlign: w.shoreAlign,
      shoreDir: w.shoreDir,
      shoreOverlapM: w.shoreOverlapM,
      depthBias: w.depthBias,
      alongM: w.alongM,
      sectioned: w.sectioned,
      offsets: w.offsets,
      variant: w.variant ?? ((w.item.row * 31 + w.item.col) & 7),
    }).catch((error) => console.warn('[typhoon shelter] sprite', error?.message));
  });
}

const typhoonShelterPlanningApi = {
  TYPHOON_SHELTER_TOOL,
  getTyphoonShelterState,
  getTyphoonShelterAnalyses,
  findTyphoonShelterAt,
  computeTyphoonShelterDrag,
  isTyphoonShelterBasinDrag,
  cancelTyphoonShelterDrag,
  drawTyphoonShelterDragPreview,
  commitTyphoonShelterDrag,
  handleTyphoonShelterToolClick,
  inspectTyphoonShelterAt,
  redrawTyphoonShelterPlanning,
  syncTyphoonShelterTool,
  resetTyphoonShelterPlanning,
  isTyphoonShelterToolActive,
  approveTyphoonShelterWorks,
  confirmTyphoonShelterPendingEdit,
  cancelTyphoonShelterPendingEdit,
  runTyphoonShelterWorksDaily,
  getTyphoonShelterMonthlyUpkeep,
  syncTyphoonShelterFacilitySprites,
  isTyphoonShelterQuayTile,
  isTyphoonShelterPavedTile,
  layTyphoonShelterPromenade,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterPlanningApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterPlanningApi);
