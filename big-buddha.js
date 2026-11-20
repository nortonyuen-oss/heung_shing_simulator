// 天壇大佛 (docs/campaign-p4-design.md §5, §14): the big Buddha (buddha_statue, its art already the
// Tian Tan Buddha) as a pilgrimage up the mountain. Built on high ground it draws more - the view,
// the climb - and its visitors come by bus: the tour coaches and a bus route stopping near it.
//
// On a hill (its lot's ground at BIG_BUDDHA_TUNING.hillLevel or higher) the statue adds hillAppeal to
// the city's attractiveness. Its pilgrims a month go by the tourism appeal, fewer on flat ground and
// fewer again with no bus route carrying anyone stopping within busRadius tiles (the coaches alone);
// none with no road at all. They spend in town (tourism takings). Nothing is saved: all of it is read
// from the city each pulse. Only ever adds to what the statue gave before.
const BIG_BUDDHA_TUNING = Object.freeze({
  hillLevel: 3,                // 〔暫定〕 the terrain level (0 the shore) its lot must stand on: 山上
  hillAppeal: 3,               // 〔暫定〕 attractiveness on a hill, on top of its own
  busRadius: 6,                // tiles from the lot to a bus stop on a route carrying anyone
  roadReach: 2,
  baseVisitors: 3000,          // 〔暫定〕 pilgrims a month at appeal 0 ...
  visitorsPerAppeal: 80,       // ... and more for each point
  flatShare: 0.6,              // on flat ground
  noBusShare: 0.5,             // with no bus route to it (the tour coaches alone)
  spend: 0.4,                  // $ tourism takings a pilgrim
});

function bigBuddhaUiT(key, fallback, vars = {}) {
  const fill = (text) => String(text).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (typeof t !== 'function') return fill(fallback);
  const out = t(key, vars);
  return out && out !== key ? out : fill(fallback);
}

// ── Pure ───────────────────────────────────────────────────────────────────────────────────────────

function isBigBuddhaHill(level, tuning = BIG_BUDDHA_TUNING) {
  return Number(level) >= tuning.hillLevel;
}

function getBigBuddhaVisitors(appeal, { road = true, onHill = false, bus = false } = {}, tuning = BIG_BUDDHA_TUNING) {
  if (!road) return 0;
  const base = tuning.baseVisitors + tuning.visitorsPerAppeal * Math.max(0, Math.min(100, Number(appeal) || 0));
  return Math.round(base * (onHill ? 1 : tuning.flatShare) * (bus ? 1 : tuning.noBusShare));
}

// ── In the game ────────────────────────────────────────────────────────────────────────────────────

function findBigBuddha() {
  if (typeof buildingData === 'undefined' || !buildingData) return null;
  const entry = Object.entries(buildingData).find(([, record]) => record?.type === 'buddha_statue');
  if (!entry) return null;
  const [id, record] = entry;
  const [row, col] = id.split(':').map(Number);
  return { id, row, col, rows: record.footprintRows || 3, cols: record.footprintCols || 3 };
}

function bigBuddhaLotGap(lot, row, col) {
  const gap = (value, from, size) => Math.max(from - value, value - (from + size - 1), 0);
  return Math.max(gap(row, lot.row, lot.rows), gap(col, lot.col, lot.cols));
}

// The lot's ground: its lowest tile (a lot stands on level ground).
function getBigBuddhaLevel(lot) {
  if (typeof getTileHeight !== 'function') return 0;
  let level = Infinity;
  for (let r = lot.row; r < lot.row + lot.rows; r++) {
    for (let c = lot.col; c < lot.col + lot.cols; c++) level = Math.min(level, Number(getTileHeight(r, c)) || 0);
  }
  return Number.isFinite(level) ? level : 0;
}

function bigBuddhaHasRoad(lot) {
  const reach = BIG_BUDDHA_TUNING.roadReach;
  const road = (r, c) => (typeof isRoadTile === 'function' ? isRoadTile(r, c) : mapData?.[r]?.[c] === ROAD);
  for (let r = lot.row - reach; r < lot.row + lot.rows + reach; r++) {
    for (let c = lot.col - reach; c < lot.col + lot.cols + reach; c++) {
      if (bigBuddhaLotGap(lot, r, c) > 0 && (typeof isInsideMap !== 'function' || isInsideMap(r, c)) && road(r, c)) return true;
    }
  }
  return false;
}

// A bus route carrying anyone, with a stop within busRadius tiles of the lot.
function bigBuddhaHasBus(lot) {
  try {
    const state = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
    if (!state) return false;
    const stops = new Map((state.stops || []).map((stop) => [stop.id, stop]));
    return (state.routes || []).some((route) => route.status !== 'suspended' && Number(route.history?.at(-1)?.passengers) > 0
      && (route.stopIds || []).some((id) => {
        const stop = stops.get(id);
        return stop && !stop.offMap && bigBuddhaLotGap(lot, stop.row, stop.col) <= BIG_BUDDHA_TUNING.busRadius;
      }));
  } catch { return false; }
}

let bigBuddhaStateCache = null;

// The statue this pulse: { lot, level, onHill, road, bus, visitors, tourism, appeal }.
function getBigBuddhaState() {
  const tick = typeof city === 'undefined' ? 0 : city.tick;
  const count = typeof buildingData === 'undefined' || !buildingData ? 0 : Object.keys(buildingData).length;
  const roads = typeof roadTileCount === 'number' ? roadTileCount : 0;
  if (bigBuddhaStateCache && bigBuddhaStateCache.tick === tick && bigBuddhaStateCache.count === count
    && bigBuddhaStateCache.roads === roads) return bigBuddhaStateCache.state;
  const lot = findBigBuddha();
  let state = { lot: null, level: 0, onHill: false, road: false, bus: false, visitors: 0, tourism: 0, appeal: 0 };
  if (lot) {
    const level = getBigBuddhaLevel(lot);
    const onHill = isBigBuddhaHill(level);
    const road = bigBuddhaHasRoad(lot);
    const bus = road && bigBuddhaHasBus(lot);
    const visitors = getBigBuddhaVisitors(typeof city === 'undefined' ? 0 : city.tourismAppeal, { road, onHill, bus });
    state = { lot, level, onHill, road, bus, visitors, tourism: Math.round(visitors * BIG_BUDDHA_TUNING.spend), appeal: onHill ? BIG_BUDDHA_TUNING.hillAppeal : 0 };
  }
  bigBuddhaStateCache = { tick, count, roads, state };
  return state;
}

// Its pilgrims and their spending (council-effects.js), and the hill's draw (the attractiveness).
function getBigBuddhaMonthlyVisitors() {
  return getBigBuddhaState().visitors;
}

function getBigBuddhaTourismRevenue() {
  return getBigBuddhaState().tourism;
}

function getBigBuddhaHillAppeal() {
  return getBigBuddhaState().appeal;
}

function buildBigBuddhaInspectHtml() {
  const state = getBigBuddhaState();
  if (!state.lot) return '';
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString();
  const rows = [
    `<div class="insp-row ${state.onHill ? 'insp-ok' : 'insp-muted'}">${state.onHill
      ? bigBuddhaUiT('bigBuddha.hill', '⛰ 起喺山上（地勢第 {level} 級）：吸引力 +{appeal}', { level: state.level, appeal: BIG_BUDDHA_TUNING.hillAppeal })
      : bigBuddhaUiT('bigBuddha.flat', '⛰ 起喺平地（地勢第 {level} 級）：第 {hill} 級或以上先算山上', { level: state.level, hill: BIG_BUDDHA_TUNING.hillLevel })}</div>`,
    !state.road
      ? `<div class="insp-row insp-warn">${bigBuddhaUiT('bigBuddha.noRoad', '未有路上山：冇善信參拜。')}</div>`
      : `<div class="insp-row ${state.bus ? 'insp-ok' : 'insp-warn'}">${state.bus
        ? bigBuddhaUiT('bigBuddha.bus', '🚌 有巴士線停大佛')
        : bigBuddhaUiT('bigBuddha.noBus', '🚌 {radius} 格內未有巴士線停：得旅遊巴，善信少一半', { radius: BIG_BUDDHA_TUNING.busRadius })}</div>`,
    `<div class="insp-row insp-muted">${bigBuddhaUiT('bigBuddha.visitors', '每月善信同遊客 {visitors} 人 · 旅遊收入 ${tourism}', { visitors: fmt(state.visitors), tourism: fmt(state.tourism) })}</div>`,
  ];
  return `<div class="insp-section">${rows.join('')}</div>`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  BIG_BUDDHA_TUNING, isBigBuddhaHill, getBigBuddhaVisitors,
};
