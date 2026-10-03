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
function getTyphoonShelterAnalyses() {
  const state = getTyphoonShelterState();
  const key = state.shelters.map((s) => `${s.id}|${s.basin}|${JSON.stringify(s.entrances)}|${s.reservePct}`).join('#');
  if (typhoonShelterAnalysisCache.key === key && typhoonShelterAnalysisCache.terrainStamp === typhoonShelterTerrainStamp()) {
    return typhoonShelterAnalysisCache.byId;
  }
  const baseMap = { width: MAP_WIDTH, height: MAP_HEIGHT, kind: typhoonShelterBaseKind };
  const footprints = new Map(state.shelters.map((s) => {
    const a = analyzeTyphoonShelter(s, baseMap);
    return [s.id, new Set([...a.basin, ...a.ring])];
  }));
  const byId = new Map(state.shelters.map((s) => [s.id, analyzeTyphoonShelter(s, getTyphoonShelterMap(s.id, footprints))]));
  typhoonShelterAnalysisCache = { key, terrainStamp: typhoonShelterTerrainStamp(), byId, footprints };
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
    return { rect, targetId: target.id, ...res };
  }
  if (touches.length > 1) return { rect, rejected: '唔可以將兩個避風塘合併' };
  if (touches.length === 1) {
    const target = touches[0];
    const res = editTyphoonShelterBasin(target, getTyphoonShelterMap(target.id), rect, 'add');
    return { rect, targetId: target.id, ...res };
  }
  const map = getTyphoonShelterMap(null);
  const tiles = typhoonShelterRectTiles(rect.r0, rect.c0, rect.r1, rect.c1).filter((k) => map.kind(...k.split(':').map(Number)) === 'water');
  if (!tiles.length) return { rect, rejected: '要喺水面劃' };
  const plan = createTyphoonShelterPlan(`ts${state.nextId}`, new Set(tiles), map, { name: `避風塘 ${state.nextId}` });
  if (!decodeTyphoonShelterBasin(plan.basin).size) return { rect, rejected: '水域太窄' };
  return { rect, targetId: null, plan, analysis: analyzeTyphoonShelter(plan, map), diff: null };
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
  const state = getTyphoonShelterState();
  let shelters;
  let nextId = state.nextId;
  if (result.targetId) {
    const before = state.shelters.find((s) => s.id === result.targetId);
    const edited = before?.works ? { ...result.plan, works: before.works, status: before.status } : result.plan;
    shelters = state.shelters.map((s) => (s.id === result.targetId ? edited : s));
    typhoonShelterSelectedId = result.targetId;
  } else {
    shelters = [...state.shelters, result.plan];
    typhoonShelterSelectedId = result.plan.id;
    nextId += 1;
  }
  setTyphoonShelterState({ ...state, nextId, shelters });
  afterTyphoonShelterPlanEdit(scene, typhoonShelterSelectedId);
  return true;
}

// An approved plan that changes re-plans its works at once (new line queued, old line marked
// for tear-down), so the overlay and the panel show the consequence straight away.
function afterTyphoonShelterPlanEdit(scene, id) {
  const state = getTyphoonShelterState();
  const plan = state.shelters.find((s) => s.id === id);
  if (plan?.works?.approved) {
    const reconciled = reconcileTyphoonShelterPlanWorks(plan);
    setTyphoonShelterState({ ...state, shelters: state.shelters.map((s) => (s.id === id ? reconciled : s)) });
    syncTyphoonShelterFacilitySprites(scene);
  }
  redrawTyphoonShelterPlanning(scene);
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
    const res = toggleTyphoonShelterEntrance(plan, getTyphoonShelterMap(id), row, col);
    if (res.rejected) {
      if (typeof showToast === 'function') showToast(res.rejected, 'warning');
    } else {
      setTyphoonShelterState({ ...state, shelters: state.shelters.map((s) => (s.id === id ? { ...s, entrances: res } : s)) });
    }
    typhoonShelterSelectedId = id;
    afterTyphoonShelterPlanEdit(scene, id);
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
  const preview = typhoonShelterDragPreview;
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
      #ts-modebar .ts-hint{color:#9bb8cc;font-size:12px;margin-left:4px}
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
      #ts-panel .ts-bar{height:6px;background:#0d2232;border-radius:3px;overflow:hidden;margin-top:6px}
      #ts-panel .ts-bar-fill{height:100%;background:#39d353;width:0}
      #ts-panel input[type=number]{background:#0d2232;color:#eaf6ff;border:1px solid #2f5a72;border-radius:6px;padding:2px 5px;font:inherit}
      #ts-panel .ts-works-block{color:#ffd27a}
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
    <span class="ts-hint"></span>`;
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
      <div class="ts-row"><b>${tsT('typhoonShelter.works', '工程')}</b><span class="ts-works-state" style="flex:1;text-align:right"></span></div>
      <div class="ts-bar"><div class="ts-bar-fill"></div></div>
      <dl class="ts-works-stats"></dl>
      <div class="ts-row"><span>${tsT('typhoonShelter.quota', '每月工程額度')}</span><input type="number" class="ts-quota" min="0" step="1000" style="width:90px"></div>
      <div class="ts-note ts-works-block"></div>
    </div>
    <div class="ts-row"><button type="button" class="ts-approve">${tsT('typhoonShelter.approve', '開展工程')}</button><button type="button" class="ts-delete">${tsT('typhoonShelter.delete', '刪除規劃')}</button></div>
    <div class="ts-note ts-stage-note"></div>`;
  document.body.appendChild(panel);
  typhoonShelterDom = { bar, panel };
  bar.querySelectorAll('[data-ts-mode]').forEach((b) => b.addEventListener('click', () => {
    typhoonShelterMode = b.dataset.tsMode;
    syncTyphoonShelterTool();
  }));
  panel.querySelector('.ts-close').addEventListener('click', () => {
    typhoonShelterSelectedId = null;
    redrawTyphoonShelterPlanning();
  });
  panel.querySelector('.ts-name').addEventListener('change', (e) => updateSelectedTyphoonShelter({ name: e.target.value.trim().slice(0, 40) }));
  panel.querySelector('.ts-reserve').addEventListener('input', (e) => updateSelectedTyphoonShelter({ reservePct: Number(e.target.value) }));
  panel.querySelector('.ts-delete').addEventListener('click', () => {
    const state = getTyphoonShelterState();
    const plan = state.shelters.find((s) => s.id === typhoonShelterSelectedId);
    if (!plan) return;
    const built = (plan.works?.items || []).some((i) => i.state !== 'queued');
    const question = built
      ? tsT('typhoonShelter.confirmDeleteBuilt', `「${plan.name}」已經有工程，刪除會拆走全部設施，唔會退款。繼續？`, { name: plan.name })
      : tsT('typhoonShelter.confirmDelete', `刪除「${plan.name}」嘅規劃？`, { name: plan.name });
    if (typeof confirm === 'function' && !confirm(question)) return;
    setTyphoonShelterState({ ...state, shelters: state.shelters.filter((s) => s.id !== plan.id) });
    typhoonShelterSelectedId = null;
    syncTyphoonShelterFacilitySprites();
    redrawTyphoonShelterPlanning();
  });
  panel.querySelector('.ts-approve').addEventListener('click', () => approveTyphoonShelterWorks(typhoonShelterSelectedId));
  panel.querySelector('.ts-quota').addEventListener('change', (e) => {
    const state = getTyphoonShelterState();
    const quota = Math.max(0, Math.round(Number(e.target.value) || 0));
    setTyphoonShelterState({ ...state, shelters: state.shelters.map((s) => (s.id === typhoonShelterSelectedId && s.works ? { ...s, works: { ...s.works, quota } } : s)) });
    redrawTyphoonShelterPlanning();
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
  bar.querySelector('.ts-hint').textContent = typhoonShelterMode === 'basin'
    ? tsT('typhoonShelter.hint.basin', '拖曳加入水域；Shift＋拖曳削減。最少 6×8 格，一邊要靠岸。')
    : typhoonShelterMode === 'entrance'
      ? tsT('typhoonShelter.hint.entrance', '撳防波堤開 2 格出入口；撳旁邊加闊（長過 10 格嘅邊）；撳出入口取消。')
      : tsT('typhoonShelter.hint.inspect', '撳避風塘睇資料。');
  const preview = typhoonShelterDragPreview;
  const state = getTyphoonShelterState();
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
  if (preview?.diff) {
    rows.push([tsT('typhoonShelter.change', '今次改動'), `新堤 ${preview.diff.build.length} · 拆堤 ${preview.diff.demolish.length} · ${money(preview.diff.cost)}`]);
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
  renderTyphoonShelterWorksPanel(panel, plan, a, !!preview);
}

function renderTyphoonShelterWorksPanel(panel, plan, a, previewing) {
  const money = (v) => `$${Math.round(v).toLocaleString()}`;
  const works = plan.works;
  const approve = panel.querySelector('.ts-approve');
  approve.hidden = previewing || !!works?.approved;
  approve.disabled = !a.legal;
  approve.title = a.legal ? '' : tsT('typhoonShelter.approveBlocked', '規劃未可行，未能開展工程');
  panel.querySelector('.ts-works').hidden = !works?.approved;
  panel.querySelector('.ts-stage-note').textContent = works?.approved
    ? tsT('typhoonShelter.worksNote', '工程開工當日一次過扣款；每月額度用完就等下個月。')
    : tsT('typhoonShelter.planningOnly', '規劃階段：未施工，費用只係估算。');
  if (!works?.approved) return;
  const sum = typhoonShelterWorkSummaries.get(plan.id) || summarizeTyphoonShelterWorks(works, a, {});
  const state = sum.operational ? tsT('typhoonShelter.state.operational', '運作中')
    : sum.total && sum.done === sum.total ? tsT('typhoonShelter.state.waitingRoad', '完工，未接路')
      : tsT('typhoonShelter.state.building', '施工中');
  panel.querySelector('.ts-works-state').textContent = `${state} · ${sum.done}/${sum.total}`;
  panel.querySelector('.ts-bar-fill').style.width = `${sum.total ? Math.round((100 * sum.done) / sum.total) : 0}%`;
  const rows = [
    [tsT('typhoonShelter.worksBuilding', '施工中'), `${sum.building}${sum.demolishing ? ` · 拆卸 ${sum.demolishing}` : ''}`],
    [tsT('typhoonShelter.worksQueued', '排隊'), `${sum.queued}`],
    [tsT('typhoonShelter.worksRemaining', '尚餘工程費'), money(sum.remainingCost)],
    [tsT('typhoonShelter.worksMonth', '本月已用'), `${money(works.month === typhoonShelterMonthKey() ? works.spent : 0)} / ${money(works.quota)}`],
    [tsT('typhoonShelter.monthlyBuilt', '已建成維護'), `${money(sum.upkeep)}／月`],
    [tsT('typhoonShelter.berthsReal', '可用泊位'), sum.operational ? `${sum.berths.daily} ＋ 預留 ${sum.berths.reserved}` : '—'],
  ];
  panel.querySelector('.ts-works-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const quota = panel.querySelector('.ts-quota');
  if (document.activeElement !== quota) quota.value = works.quota;
  const blocked = typhoonShelterWorkBlocks.get(plan.id);
  const reasons = {
    quota: tsT('typhoonShelter.block.quota', '本月工程額度已用完，下個月繼續。'),
    funds: tsT('typhoonShelter.block.funds', '市庫唔夠錢開工。'),
    illegal: tsT('typhoonShelter.block.illegal', '規劃而家未可行，工程暫停。'),
  };
  const notes = [];
  if (blocked) notes.push(reasons[blocked]);
  if (sum.pierBuilt && !sum.pierConnected) notes.push(tsT('typhoonShelter.block.road', '碼頭未接路：要喺碼頭岸邊 3 格內有道路，避風塘先可以運作。'));
  panel.querySelector('.ts-works-block').textContent = notes.join(' ');
}

// Called whenever the selected tool changes (updateToolCategoryState in tool-menu.js).
function syncTyphoonShelterTool() {
  createTyphoonShelterDom();
  const active = isTyphoonShelterToolActive();
  typhoonShelterDom.bar.hidden = !active;
  if (!active) {
    typhoonShelterDragPreview = null;
    if (!typhoonShelterSelectedId) typhoonShelterDom.panel.hidden = true;
  }
  redrawTyphoonShelterPlanning();
}

// New city / loaded save: drop the selection and redraw from the new state.
function resetTyphoonShelterPlanning() {
  typhoonShelterSelectedId = null;
  typhoonShelterDragPreview = null;
  typhoonShelterAnalysisCache = { key: '', byId: new Map() };
  typhoonShelterWorkSummaries.clear();
  typhoonShelterWorkBlocks.clear();
  if (typhoonShelterDom) typhoonShelterDom.panel.hidden = true;
  if (typhoonShelterGraphics && typhoonShelterGraphics.scene) typhoonShelterGraphics.clear();
  const scene = typeof activeScene !== 'undefined' ? activeScene : null;
  if (scene && typeof clearTyphoonShelterObjects === 'function') clearTyphoonShelterObjects(scene, 'works');
}

// ---------------------------------------------------------------------------
// works (Phase 2)
// ---------------------------------------------------------------------------

const typhoonShelterWorkSummaries = new Map(); // shelter id -> summarizeTyphoonShelterWorks()
const typhoonShelterWorkBlocks = new Map();    // shelter id -> 'quota' | 'funds' | 'illegal'

function typhoonShelterMonthKey() {
  return `${city.year}-${city.month}`;
}

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
  };
}

function typhoonShelterPierConnected(works) {
  const pier = (works?.items || []).find((i) => i.kind === 'pier' && i.state === 'done');
  if (!pier) return false;
  // the land behind the pier: one tile back from its seaward facing
  const back = { n: [1, 0], s: [-1, 0], e: [0, -1], w: [0, 1] }[pier.facing] || [0, 0];
  return typhoonShelterRoadDistance(pier.row + back[0], pier.col + back[1]) <= TYPHOON_SHELTER_ROAD_REACH;
}

// Reconcile one approved plan's works with its current layout (after any plan edit).
function reconcileTyphoonShelterPlanWorks(plan) {
  if (!plan.works?.approved) return plan;
  const analysis = getTyphoonShelterAnalyses().get(plan.id);
  if (!analysis) return plan;
  const layout = layoutTyphoonShelterWorks(plan, analysis, typhoonShelterWorksContext());
  return { ...plan, works: reconcileTyphoonShelterWorks(plan.works, layout) };
}

function approveTyphoonShelterWorks(id) {
  const state = getTyphoonShelterState();
  const plan = state.shelters.find((s) => s.id === id);
  const analysis = plan && getTyphoonShelterAnalyses().get(id);
  if (!plan || !analysis?.legal) return false;
  const approved = reconcileTyphoonShelterPlanWorks({
    ...plan,
    status: 'building',
    works: { ...(plan.works || createTyphoonShelterWorks()), approved: true },
  });
  setTyphoonShelterState({ ...state, shelters: state.shelters.map((s) => (s.id === id ? approved : s)) });
  if (typeof showToast === 'function') showToast(tsT('typhoonShelter.toast.approved', `「${plan.name}」開展工程。`, { name: plan.name }), 'info');
  redrawTyphoonShelterPlanning();
  return true;
}

// One game day of construction for every approved shelter (simulation.js runDailySystems).
function runTyphoonShelterWorksDaily(scene) {
  const state = getTyphoonShelterState();
  if (!state.shelters.some((s) => s.works?.approved)) return;
  const analyses = getTyphoonShelterAnalyses();
  const monthKey = typhoonShelterMonthKey();
  let changed = false;
  const shelters = state.shelters.map((raw) => {
    if (!raw.works?.approved) return raw;
    const plan = reconcileTyphoonShelterPlanWorks(raw);
    const analysis = analyses.get(plan.id);
    const res = advanceTyphoonShelterWorks(plan.works, {
      monthKey,
      legal: !!analysis?.legal,
      spend: (cost) => (typeof spendBudget === 'function' ? spendBudget(cost) : false),
    });
    if (res.blocked) typhoonShelterWorkBlocks.set(plan.id, res.blocked); else typhoonShelterWorkBlocks.delete(plan.id);
    const summary = summarizeTyphoonShelterWorks(res.works, analysis, { pierConnected: typhoonShelterPierConnected(res.works) });
    typhoonShelterWorkSummaries.set(plan.id, summary);
    const status = summary.operational ? 'operational' : 'building';
    if (status === 'operational' && plan.status !== 'operational' && typeof showToast === 'function') {
      showToast(tsT('typhoonShelter.toast.operational', `「${plan.name}」落成啟用！`, { name: plan.name }), 'success');
    }
    // progress moves every day something is under way, not only on starts and completions
    const underWay = res.works.items.some((i) => i.state === 'building' || (i.state === 'demolishing' && i.paid));
    if (underWay || res.events.length || status !== plan.status || res.works.month !== plan.works.month
      || res.works.items.length !== raw.works.items.length) changed = true;
    return { ...plan, status, works: res.works };
  });
  if (!changed) return;
  setTyphoonShelterState({ ...state, shelters });
  syncTyphoonShelterFacilitySprites(scene);
  if (typhoonShelterDom && !typhoonShelterDom.panel.hidden) renderTyphoonShelterPanel();
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

// Make the works sprites match the works: building ones translucent, rising as they progress;
// tear-downs tinted red; queued ones not drawn yet.
function syncTyphoonShelterFacilitySprites(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (!scene || typeof addTyphoonShelterObject !== 'function') return;
  if (!scene.typhoonShelterObjects) scene.typhoonShelterObjects = new Map();
  const wanted = new Map();
  getTyphoonShelterState().shelters.forEach((plan) => (plan.works?.items || []).forEach((item) => {
    if (item.state === 'queued') return;
    const days = getTyphoonShelterWorkDays(item);
    const alpha = item.state === 'done' ? 1
      : item.state === 'demolishing' ? 0.55
        : 0.35 + 0.5 * Math.min(1, item.progress / Math.max(1, days));
    wanted.set(`${plan.id}|${item.key}`, {
      item,
      alpha,
      tint: item.state === 'demolishing' ? 0xff8a80 : null,
      footprintOverride: item.kind === 'breakwater' || item.kind === 'head' ? { cols: 1, rows: 1 } : null,
    });
  }));
  [...scene.typhoonShelterObjects.values()].forEach((rec) => {
    if (rec.tag === 'works' && !wanted.has(rec.id)) removeTyphoonShelterObject(scene, rec.id);
  });
  wanted.forEach((w, id) => {
    const rec = scene.typhoonShelterObjects.get(id);
    if (rec) {
      if (rec.alpha !== w.alpha || rec.tint !== w.tint || rec.facing !== w.item.facing) {
        Object.assign(rec, { alpha: w.alpha, tint: w.tint, facing: w.item.facing });
        positionTyphoonShelterObject(scene, rec);
      }
      return;
    }
    addTyphoonShelterObject(scene, {
      id,
      objectId: TYPHOON_SHELTER_WORK_KINDS[w.item.kind].objectId,
      row: w.item.row,
      col: w.item.col,
      facing: w.item.facing,
      tag: 'works',
      alpha: w.alpha,
      tint: w.tint,
      footprintOverride: w.footprintOverride,
      variant: (w.item.row * 31 + w.item.col) & 7,
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
  runTyphoonShelterWorksDaily,
  getTyphoonShelterMonthlyUpkeep,
  syncTyphoonShelterFacilitySprites,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterPlanningApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterPlanningApi);
