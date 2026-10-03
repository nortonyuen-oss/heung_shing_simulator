// 避風塘工程 (Phase 2): what gets built for an approved shelter plan, in what order, and the daily
// construction schedule with its money. Pure functions over a plan, its analysis
// (typhoon-shelter.js) and a small context, so it runs under node for tests; the game side
// (typhoon-shelter-planning.js) runs it once a game day and draws the results with the Phase 0
// sprites (typhoon-shelter-sprites.js).
//
// Layout is derived, deterministically, from the plan: the same plan always asks for the same
// works, so rotating the map or reloading a save never re-rolls it. The works themselves (what is
// queued, building, done) are stored on the plan, and reconciled against the layout whenever the
// plan changes: missing works are queued, works no longer wanted are torn down (built ones) or
// dropped (not started).
//
// Money: a work is paid in full, once, the day it starts; nothing is charged while queued. Each
// shelter has a monthly works quota the player sets; starts stop when this month's spending would
// pass it, or when the treasury cannot pay. Built works cost upkeep every month (budget line
// 「避風塘維護」).

const TYPHOON_SHELTER_WORK_KINDS = Object.freeze({
  // 基本碼頭 first - a shelter is useless without a landing
  pier: Object.freeze({ objectId: 'pierSet1', cost: 3000, days: 20, upkeep: 40, priority: 1, label: '碼頭' }),
  // breakwater heads at the entrances carry the navigation lights
  head: Object.freeze({ objectId: 'causeway2', cost: 2500, days: 15, upkeep: 30, priority: 2, label: '燈塔堤頭' }),
  breakwater: Object.freeze({ objectId: 'causeway1', cost: 900, days: 6, upkeep: 15, priority: 3, label: '防波堤' }),
  navBuoyRed: Object.freeze({ objectId: 'bout1_a', cost: 400, days: 4, upkeep: 5, priority: 4, label: '航標（紅）' }),
  navBuoyGreen: Object.freeze({ objectId: 'bout1_b', cost: 400, days: 4, upkeep: 5, priority: 4, label: '航標（綠）' }),
  floatingPier: Object.freeze({ objectId: 'floatingPier1', cost: 1500, days: 10, upkeep: 20, priority: 5, label: '浮橋' }),
  mooringBuoy: Object.freeze({ objectId: 'bout2', cost: 200, days: 3, upkeep: 2, priority: 6, label: '繫泊浮泡' }),
});
const TYPHOON_SHELTER_DEMOLISH = Object.freeze({ cost: 300, days: 4, label: '拆卸' });
const TYPHOON_SHELTER_MAX_CONCURRENT_WORKS = 3;
const TYPHOON_SHELTER_DEFAULT_QUOTA = 10000;
const TYPHOON_SHELTER_ROAD_REACH = 3;          // tiles from the pier's landing to a road
const TYPHOON_SHELTER_BERTHS_PER_FLOATING_PIER = 20;
const TYPHOON_SHELTER_MAX_FLOATING_PIERS = 3;
const TYPHOON_SHELTER_TILES_PER_MOORING_BUOY = 8;

const TW_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const TW_OPPOSITE = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });
const twKey = (r, c) => `${r}:${c}`;
const twParse = (k) => k.split(':').map(Number);

// Small deterministic hash for seeded choices.
function twHash(seed, r, c) {
  let h = (Math.imul((seed | 0) + 1, 0x9e3779b1) ^ Math.imul(r + 7, 0x85ebca6b) ^ Math.imul(c + 13, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return h >>> 0;
}

// The direction a breakwater tile's section runs along (a logical facing for the sprite).
function twRunFacing(analysis, k) {
  const [r, c] = twParse(k);
  const ring = analysis.ring;
  if (ring.has(twKey(r, c - 1)) || ring.has(twKey(r, c + 1))) return 'e';
  return 'n';
}

/**
 * The works a plan asks for: [{ key, kind, row, col, facing }].
 * @param {object} plan  the shelter plan (needs seed)
 * @param {object} analysis analyzeTyphoonShelter(plan, map)
 * @param {{ roadDistance?: (row, col) => number, isOpenWater?: (row, col) => boolean }} [ctx]
 *   roadDistance: tiles from a land tile to the nearest road (Infinity when none near) - the pier
 *   goes where the road is closest; isOpenWater: where a navigation buoy may go
 */
function layoutTyphoonShelterWorks(plan, analysis, ctx = {}) {
  const works = [];
  const used = new Set();
  const add = (kind, k, facing) => {
    const [row, col] = twParse(k);
    works.push({ key: `${kind}:${k}`, kind, row, col, facing });
    used.add(k);
  };
  const seed = Number(plan.seed) || 0;
  const roadDistance = ctx.roadDistance || (() => Infinity);

  // entrance heads: the breakwater tile either side of each entrance
  const entranceHeads = new Set();
  analysis.entrances.filter((e) => e.tiles.length && e.run).forEach((e) => {
    const run = e.run.tiles;
    const first = run.indexOf(e.tiles[0]);
    const last = run.indexOf(e.tiles[e.tiles.length - 1]);
    [run[first - 1], run[last + 1]].forEach((k) => { if (k && analysis.breakwater.has(k)) entranceHeads.add(k); });
  });
  analysis.breakwater.forEach((k) => {
    if (entranceHeads.has(k)) add('head', k, twRunFacing(analysis, k));
    else add('breakwater', k, twRunFacing(analysis, k));
  });

  // the pier: a basin tile on the shore, off the channel, nearest a road (seeded tie-break)
  const shoreTiles = new Map();
  analysis.shoreEdges.forEach((e) => {
    const k = twKey(e.r, e.c);
    if (analysis.channel.has(k)) return;
    const d = roadDistance(e.out[0], e.out[1]);
    const prev = shoreTiles.get(k);
    if (!prev || d < prev.d) shoreTiles.set(k, { k, side: e.side, d });
  });
  const shoreList = [...shoreTiles.values()].sort((a, b) => a.d - b.d || twHash(seed, ...twParse(a.k)) - twHash(seed, ...twParse(b.k)));
  const pier = shoreList[0];
  if (pier) add('pier', pier.k, TW_OPPOSITE[pier.side]);

  // floating piers along the shore, nearest the pier first
  if (pier) {
    const [pr, pc] = twParse(pier.k);
    const count = Math.min(TYPHOON_SHELTER_MAX_FLOATING_PIERS, Math.floor(analysis.berths.total / TYPHOON_SHELTER_BERTHS_PER_FLOATING_PIER));
    shoreList
      .filter((s) => !used.has(s.k))
      .map((s) => { const [r, c] = twParse(s.k); return { ...s, dist: Math.abs(r - pr) + Math.abs(c - pc) }; })
      .filter((s) => s.dist >= 2)
      .sort((a, b) => a.dist - b.dist || twHash(seed, ...twParse(a.k)) - twHash(seed, ...twParse(b.k)))
      .slice(0, count)
      .forEach((s) => add('floatingPier', s.k, TW_OPPOSITE[s.side]));
  }

  // navigation buoys outside each entrance: red on the port hand coming in, green on starboard
  // (IALA region A)
  analysis.entrances.filter((e) => e.status === 'ok').forEach((e) => {
    const out = TW_DIRS[e.side];
    const inward = TW_DIRS[TW_OPPOSITE[e.side]];
    const port = [-inward[1], inward[0]];
    const ends = [e.tiles[0], e.tiles[e.tiles.length - 1]].map(twParse);
    const along = (t) => t[0] * port[0] + t[1] * port[1];
    const [portEnd, starboardEnd] = along(ends[0]) >= along(ends[1]) ? ends : [ends[1], ends[0]];
    const outside = (t) => twKey(t[0] + out[0], t[1] + out[1]);
    [['navBuoyRed', outside(portEnd)], ['navBuoyGreen', outside(starboardEnd)]].forEach(([kind, k]) => {
      if (!ctx.isOpenWater || ctx.isOpenWater(...twParse(k))) add(kind, k, e.side);
    });
  });

  // mooring buoys spread over the berth water, never on the channel or by the shore works
  const target = Math.floor(analysis.berths.mooringTiles / TYPHOON_SHELTER_TILES_PER_MOORING_BUOY);
  const candidates = [...analysis.basin]
    .filter((k) => !analysis.channel.has(k) && !used.has(k) && !shoreTiles.has(k))
    .sort((a, b) => twHash(seed, ...twParse(a)) - twHash(seed, ...twParse(b)));
  const buoys = [];
  for (const k of candidates) {
    if (buoys.length >= target) break;
    const [r, c] = twParse(k);
    if (buoys.some(([br, bc]) => Math.abs(br - r) < 2 && Math.abs(bc - c) < 2)) continue;
    buoys.push([r, c]);
    add('mooringBuoy', k, 'e');
  }
  return works;
}

function createTyphoonShelterWorks(quota = TYPHOON_SHELTER_DEFAULT_QUOTA) {
  return { approved: false, quota, month: '', spent: 0, items: [], log: [] };
}

/**
 * Bring a plan's stored works in line with its layout. Returns a new works object.
 * Built (or building) works no longer wanted are torn down; queued ones are dropped.
 */
function reconcileTyphoonShelterWorks(works, layout) {
  const wanted = new Map(layout.map((w) => [w.key, w]));
  const items = [];
  const seen = new Set();
  (works.items || []).forEach((item) => {
    const want = wanted.get(item.key);
    seen.add(item.key);
    if (want) {
      // wanted again while being torn down: the torn-down part was already paid, it stays up
      const state = item.state === 'demolishing' ? 'done' : item.state;
      items.push({ ...item, facing: want.facing, state, progress: item.state === 'demolishing' ? 0 : item.progress });
      return;
    }
    if (item.state === 'queued') return;
    if (item.state === 'demolishing') { items.push(item); return; }
    items.push({ ...item, state: 'demolishing', progress: 0, paid: false });
  });
  layout.forEach((w) => {
    if (!seen.has(w.key)) items.push({ ...w, state: 'queued', progress: 0, paid: false });
  });
  return { ...works, items };
}

function getTyphoonShelterWorkCost(item) {
  return item.state === 'demolishing' ? TYPHOON_SHELTER_DEMOLISH.cost : TYPHOON_SHELTER_WORK_KINDS[item.kind]?.cost || 0;
}
function getTyphoonShelterWorkDays(item) {
  return item.state === 'demolishing' ? TYPHOON_SHELTER_DEMOLISH.days : TYPHOON_SHELTER_WORK_KINDS[item.kind]?.days || 1;
}

// Queue order: tear-downs first (they free the line), then by kind priority, then nearest the
// pier... simply by key for a stable order within a kind.
function twQueueOrder(a, b) {
  const pa = a.state === 'demolishing' ? 0 : TYPHOON_SHELTER_WORK_KINDS[a.kind]?.priority ?? 9;
  const pb = b.state === 'demolishing' ? 0 : TYPHOON_SHELTER_WORK_KINDS[b.kind]?.priority ?? 9;
  return pa - pb || a.key.localeCompare(b.key);
}

/**
 * One game day of construction for one shelter.
 * @param {object} works stored works (already reconciled)
 * @param {{ monthKey: string, legal: boolean, spend: (cost) => boolean }} ctx
 *   spend: try to pay from the treasury; false when it cannot
 * @returns {{ works, events: string[], blocked: string|null }}
 */
function advanceTyphoonShelterWorks(works, ctx) {
  let next = { ...works, items: works.items.map((i) => ({ ...i })) };
  const events = [];
  if (!next.approved) return { works: next, events, blocked: null };
  if (next.month !== ctx.monthKey) next = { ...next, month: ctx.monthKey, spent: 0 };

  // progress what is under way
  const finished = new Set();
  next.items.forEach((item) => {
    if (item.state !== 'building' && !(item.state === 'demolishing' && item.paid)) return;
    item.progress += 1;
    if (item.progress < getTyphoonShelterWorkDays(item)) return;
    if (item.state === 'demolishing') { finished.add(item.key); events.push(`removed:${item.key}`); return; }
    item.state = 'done';
    item.progress = getTyphoonShelterWorkDays(item);
    events.push(`done:${item.key}`);
  });
  next.items = next.items.filter((i) => !finished.has(i.key));

  if (!ctx.legal) return { works: next, events, blocked: 'illegal' };
  const active = next.items.filter((i) => i.state === 'building' || (i.state === 'demolishing' && i.paid)).length;
  if (active >= TYPHOON_SHELTER_MAX_CONCURRENT_WORKS) return { works: next, events, blocked: null };
  const waiting = next.items.filter((i) => i.state === 'queued' || (i.state === 'demolishing' && !i.paid)).sort(twQueueOrder);
  if (!waiting.length) return { works: next, events, blocked: null };
  // one start a day per shelter
  const item = waiting[0];
  const cost = getTyphoonShelterWorkCost(item);
  if (next.spent + cost > next.quota) return { works: next, events, blocked: 'quota' };
  if (!ctx.spend(cost)) return { works: next, events, blocked: 'funds' };
  next.spent += cost;
  if (item.state === 'queued') item.state = 'building';
  item.paid = true;
  item.progress = 0;
  events.push(`started:${item.key}`);
  return { works: next, events, blocked: null };
}

/**
 * Summary for the panel and the economy: counts per state, money, upkeep, and whether the shelter
 * works - its breakwater, heads and pier all built and the pier on a road.
 */
function summarizeTyphoonShelterWorks(works, analysis, { pierConnected = false } = {}) {
  const items = works?.items || [];
  const count = (pred) => items.filter(pred).length;
  const doneKinds = (kind) => items.filter((i) => i.kind === kind);
  const essential = items.filter((i) => ['breakwater', 'head', 'pier'].includes(i.kind));
  const essentialDone = essential.length > 0 && essential.every((i) => i.state === 'done');
  const pier = doneKinds('pier').find((i) => i.state === 'done');
  const operational = essentialDone && !!pier && pierConnected;
  const occupied = items.filter((i) => ['pier', 'floatingPier'].includes(i.kind) && analysis?.basin?.has(twKey(i.row, i.col))).length;
  const mooring = Math.max(0, (analysis?.berths?.mooringTiles || 0) - occupied);
  const total = Math.floor(mooring / 2);
  const reserved = Math.ceil((total * (analysis?.berths?.reserved || 0)) / Math.max(1, analysis?.berths?.total || 1));
  const remainingCost = items
    .filter((i) => i.state === 'queued' || (i.state === 'demolishing' && !i.paid))
    .reduce((sum, i) => sum + getTyphoonShelterWorkCost(i), 0);
  const upkeep = items.filter((i) => i.state === 'done').reduce((sum, i) => sum + (TYPHOON_SHELTER_WORK_KINDS[i.kind]?.upkeep || 0), 0);
  return {
    queued: count((i) => i.state === 'queued'),
    building: count((i) => i.state === 'building'),
    done: count((i) => i.state === 'done'),
    demolishing: count((i) => i.state === 'demolishing'),
    total: items.length,
    remainingCost,
    upkeep,
    operational,
    pierBuilt: !!pier,
    pierConnected,
    berths: operational ? { total, reserved, daily: total - reserved } : { total: 0, reserved: 0, daily: 0 },
  };
}

function normalizeTyphoonShelterWorks(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kinds = Object.keys(TYPHOON_SHELTER_WORK_KINDS);
  return {
    approved: !!raw.approved,
    quota: Number.isFinite(raw.quota) ? Math.max(0, Math.min(1e6, Math.round(raw.quota))) : TYPHOON_SHELTER_DEFAULT_QUOTA,
    month: typeof raw.month === 'string' ? raw.month.slice(0, 12) : '',
    spent: Number.isFinite(raw.spent) ? Math.max(0, raw.spent) : 0,
    items: (Array.isArray(raw.items) ? raw.items : [])
      .filter((i) => kinds.includes(i?.kind) && Number.isInteger(i?.row) && Number.isInteger(i?.col))
      .slice(0, 2000)
      .map((i) => ({
        key: `${i.kind}:${i.row}:${i.col}`,
        kind: i.kind,
        row: i.row,
        col: i.col,
        facing: ['n', 'e', 's', 'w'].includes(i.facing) ? i.facing : 'e',
        state: ['queued', 'building', 'done', 'demolishing'].includes(i.state) ? i.state : 'queued',
        progress: Number.isFinite(i.progress) ? Math.max(0, Math.round(i.progress)) : 0,
        paid: !!i.paid,
      })),
    log: [],
  };
}

const typhoonShelterWorksApi = {
  TYPHOON_SHELTER_WORK_KINDS,
  TYPHOON_SHELTER_DEMOLISH,
  TYPHOON_SHELTER_MAX_CONCURRENT_WORKS,
  TYPHOON_SHELTER_DEFAULT_QUOTA,
  TYPHOON_SHELTER_ROAD_REACH,
  layoutTyphoonShelterWorks,
  createTyphoonShelterWorks,
  reconcileTyphoonShelterWorks,
  advanceTyphoonShelterWorks,
  summarizeTyphoonShelterWorks,
  normalizeTyphoonShelterWorks,
  getTyphoonShelterWorkCost,
  getTyphoonShelterWorkDays,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterWorksApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterWorksApi);
