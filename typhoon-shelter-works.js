// 避風塘工程 (Phase 2): what gets built for an approved shelter plan, and what it costs. Pure
// functions over a plan, its analysis (typhoon-shelter.js) and a small context, so it runs under
// node for tests; the game side (typhoon-shelter-planning.js) applies the result and draws it with
// the Phase 0 sprites (typhoon-shelter-sprites.js).
//
// Layout is derived, deterministically, from the plan: the same plan always asks for the same
// works, so rotating the map or reloading a save never re-rolls it. The works themselves are
// stored on the plan and reconciled against the layout whenever the plan changes: missing works
// are added, works no longer wanted are torn down.
//
// Building is instant (Norton, 2026-10-03: nobody should wait for a shelter): approving a plan, or
// changing an approved one, builds everything it needs at once and charges the whole bill then,
// once. Prices sit with a school or a sports ground so a shelter fits an early city. Built works
// cost a little upkeep every month (budget line 「避風塘維護」).

// A middle-sized shelter (~110 tiles of water, ~30 of breakwater) comes to about $2,600 and
// $40 a month; the smallest legal one to about $1,200.
const TYPHOON_SHELTER_WORK_KINDS = Object.freeze({
  pier: Object.freeze({ objectId: 'pierSet1', cost: 400, upkeep: 6, label: '碼頭' }),
  // breakwater heads at the entrances carry the navigation lights
  head: Object.freeze({ objectId: 'causeway2', cost: 200, upkeep: 2, label: '燈塔堤頭' }),
  breakwater: Object.freeze({ objectId: 'causeway1', cost: 30, upkeep: 0.5, label: '防波堤' }),
  // the root of a breakwater where it meets the shore: one more section, drawn reaching up onto
  // the land (the shore tiles draw their own shoreline, so the line would otherwise stop short)
  breakwaterRoot: Object.freeze({ objectId: 'causeway1', cost: 30, upkeep: 0.5, label: '防波堤堤根' }),
  navBuoyRed: Object.freeze({ objectId: 'bout1_a', cost: 40, upkeep: 1, label: '航標（紅）' }),
  navBuoyGreen: Object.freeze({ objectId: 'bout1_b', cost: 40, upkeep: 1, label: '航標（綠）' }),
  // the landing stage at a walkway's shore end (steps up to the shore) and the walkway itself
  floatingPier: Object.freeze({ objectId: 'floatingPier1', cost: 100, upkeep: 1, label: '浮橋登岸位' }),
  pontoon: Object.freeze({ objectId: 'floatingPier2', cost: 40, upkeep: 0.5, label: '浮橋' }),
  mooringBuoy: Object.freeze({ objectId: 'bout2', cost: 10, upkeep: 0.2, label: '繫泊浮泡' }),
  // 海堤: the shore is faced with a quay - one section along each edge of a shore tile that meets
  // the basin, and a square of deck filling each concave corner
  quay: Object.freeze({ objectId: 'quayStraight', cost: 20, upkeep: 0.3, label: '海堤' }),
  quayFill: Object.freeze({ objectId: 'quayDeckSquare', cost: 5, upkeep: 0.1, label: '海堤轉角' }),
});
const TYPHOON_SHELTER_DEMOLISH = Object.freeze({ cost: 10, label: '拆卸' });
const TYPHOON_SHELTER_ROAD_REACH = 3;          // tiles from the pier's landing to a road
// Floating walkways (浮橋): like a fishing village's or a marina's, each runs straight out from the
// shore, a landing stage with steps up to the shore at its root, boats moored along both sides.
const TYPHOON_SHELTER_BERTHS_PER_WALKWAY = 12;
const TYPHOON_SHELTER_MAX_WALKWAYS = 4;
const TYPHOON_SHELTER_WALKWAY_MAX_TILES = 5;   // root included: up to 100 m out
const TYPHOON_SHELTER_WALKWAY_SPACING = 3;     // tiles between roots along the shore
const TYPHOON_SHELTER_TILES_PER_MOORING_BUOY = 8;

const TW_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const TW_OPPOSITE = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });
const twKey = (r, c) => `${r}:${c}`;
const TW_CORNERS = Object.freeze(['ne', 'nw', 'se', 'sw']);
// A work's key: kind and tile, and for a quay (several on one tile) its water side or corner.
const twWorkKey = (kind, row, col, facing, corner) => (kind === 'quay' ? `quay:${row}:${col}:${facing}`
  : kind === 'quayFill' ? `quayFill:${row}:${col}:${corner}` : `${kind}:${row}:${col}`);
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
 * @param {{ roadDistance?: (row, col) => number, isOpenWater?: (row, col) => boolean,
 *   isFreeBeach?: (row, col) => boolean, isLand?: (row, col) => boolean }} [ctx]
 *   roadDistance: tiles from a land tile to the nearest road (Infinity when none near) - the pier
 *   goes where the road is closest; isOpenWater: where a navigation buoy may go; isFreeBeach: an
 *   empty beach tile, where a pier on that shore stands; isLand: where a breakwater meets the shore
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
  // breakwater roots: a line's last tile, with land straight on beyond it - or the headland just
  // round the corner on the basin side - gets a root section facing that way
  if (ctx.isLand) {
    analysis.breakwater.forEach((k) => {
      if (entranceHeads.has(k)) return;
      const [r, c] = twParse(k);
      const along = Object.entries(TW_DIRS).filter(([, [dr, dc]]) => analysis.ring.has(twKey(r + dr, c + dc)));
      if (along.length !== 1) return;
      const landward = TW_OPPOSITE[along[0][0]];
      const [dr, dc] = TW_DIRS[landward];
      const basinSide = Object.values(TW_DIRS).find(([pr, pc]) => (pr !== 0) !== (dr !== 0) && analysis.basin.has(twKey(r + pr, c + pc)));
      const meetsLand = ctx.isLand(r + dr, c + dc)
        || (basinSide && ctx.isLand(r + dr + basinSide[0], c + dc + basinSide[1]));
      if (!meetsLand) return;
      works.push({ key: `breakwaterRoot:${k}`, kind: 'breakwaterRoot', row: r, col: c, facing: landward });
    });
  }

  // 海堤: a quay section along every edge where a free shore tile meets the basin, its wall on the
  // water side; where two of them meet round a concave corner, a square of deck fills the corner
  // (it lies on the land tile diagonal to the basin). The beach tiles a quay faces are no longer
  // free beach: piers and landing stages stand in the water against the quay wall instead.
  const quayTiles = new Set();
  if (ctx.isQuaySite) {
    const strips = new Set();
    analysis.shoreEdges.forEach((e) => {
      const [lr, lc] = e.out;
      if (!ctx.isQuaySite(lr, lc)) return;
      const facing = TW_OPPOSITE[e.side];
      const key = twWorkKey('quay', lr, lc, facing);
      if (strips.has(key)) return;
      strips.add(key);
      quayTiles.add(twKey(lr, lc));
      works.push({ key, kind: 'quay', row: lr, col: lc, facing });
    });
    const hasStrip = (r, c, facing) => strips.has(twWorkKey('quay', r, c, facing));
    const fills = new Set();
    analysis.basin.forEach((k) => {
      const [br, bc] = twParse(k);
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => {
        const [tr, tc] = [br + dr, bc + dc];
        // the two tiles beside the corner both face this basin tile with a quay
        const vertical = dr > 0 ? 'n' : 's';   // from them, the basin tile lies that way
        const horizontal = dc > 0 ? 'w' : 'e';
        if (!hasStrip(br + dr, bc, vertical) || !hasStrip(br, bc + dc, horizontal)) return;
        if (analysis.basin.has(twKey(tr, tc)) || !ctx.isQuaySite(tr, tc)) return;
        const corner = `${vertical}${horizontal}`;
        const key = twWorkKey('quayFill', tr, tc, null, corner);
        if (fills.has(key)) return;
        fills.add(key);
        quayTiles.add(twKey(tr, tc));
        works.push({ key, kind: 'quayFill', row: tr, col: tc, facing: vertical, corner });
      });
    });
  }

  // the pier: a basin tile on the shore, off the channel, nearest a road (seeded tie-break).
  // Where the shore is a beach, the pier stands on the beach tile instead: a beach tile is drawn
  // as sand running down into shallow water, so a pier one tile out would float clear of it.
  const shoreTiles = new Map();
  const isBeach = (r, c) => !!ctx.isFreeBeach?.(r, c) && !quayTiles.has(twKey(r, c));
  // A pier on the beach stands clear of the water, so it may face the fairway: on a diagonal coast
  // the fairway between two entrances can hug the whole shore. One in the water may not.
  analysis.shoreEdges.forEach((e) => {
    const k = twKey(e.r, e.c);
    const site = isBeach(e.out[0], e.out[1]) ? twKey(e.out[0], e.out[1]) : k;
    const onFairway = analysis.channel.has(k);
    // in the water on the fairway only against a quay, and only when nowhere else will do (sorted
    // last below): boats are unloaded there at the quay wall, and pass round it
    if (onFairway && site === k && !quayTiles.has(twKey(e.out[0], e.out[1]))) return;
    const d = roadDistance(e.out[0], e.out[1]);
    const prev = shoreTiles.get(k);
    if (!prev || d < prev.d) shoreTiles.set(k, { k, site, side: e.side, d, onFairway });
  });
  const shoreList = [...shoreTiles.values()].sort((a, b) => a.onFairway - b.onFairway || a.d - b.d
    || twHash(seed, ...twParse(a.k)) - twHash(seed, ...twParse(b.k)));
  const pier = shoreList[0];
  const sitesUsed = new Set();
  if (pier) { add('pier', pier.site, TW_OPPOSITE[pier.side]); sitesUsed.add(pier.site); }

  // floating walkways straight out from the shore, nearest the pier first, spaced apart so boats
  // can lie along both sides. Each walkway runs out from its root (the basin tile on the shore, or
  // the beach tile in front of it) over open basin water; it may reach the channel's edge but not
  // enter it, and keeps a tile of water short of the breakwater or the far shore.
  if (pier) {
    const [pr, pc] = twParse(pier.k);
    const count = Math.max(1, Math.min(TYPHOON_SHELTER_MAX_WALKWAYS, Math.floor(analysis.berths.total / TYPHOON_SHELTER_BERTHS_PER_WALKWAY)));
    const roots = [];
    // open basin water, with water (not the breakwater) on both sides for boats to lie alongside
    const free = (k, out) => {
      if (!analysis.basin.has(k) || analysis.channel.has(k) || used.has(k)) return false;
      const [r, c] = twParse(k);
      return !analysis.ring.has(twKey(r + out[1], c + out[0])) && !analysis.ring.has(twKey(r - out[1], c - out[0]));
    };
    shoreList
      .filter((s) => s.k !== pier.k && !sitesUsed.has(s.site))
      .map((s) => { const [r, c] = twParse(s.k); return { ...s, r, c, dist: Math.abs(r - pr) + Math.abs(c - pc) }; })
      .filter((s) => s.dist >= 2)
      .sort((a, b) => a.dist - b.dist || twHash(seed, a.r, a.c) - twHash(seed, b.r, b.c))
      .forEach((s) => {
        if (roots.length >= count) return;
        if (roots.some((o) => Math.abs(o.r - s.r) + Math.abs(o.c - s.c) < TYPHOON_SHELTER_WALKWAY_SPACING)) return;
        const out = TW_DIRS[TW_OPPOSITE[s.side]];
        const line = [];
        if (s.site !== s.k) line.push(s.site);           // the beach tile in front, if any
        let [r, c] = [s.r, s.c];
        while (line.length < TYPHOON_SHELTER_WALKWAY_MAX_TILES) {
          const k = twKey(r, c);
          const next = twKey(r + out[0], c + out[1]);
          // a tile of water short of the breakwater or the far shore...
          if (!free(k, out) || !analysis.basin.has(next)) break;
          line.push(k);
          // ...but right up to the fairway's edge, never into it
          if (analysis.channel.has(next)) break;
          r += out[0];
          c += out[1];
        }
        if (line.length < 2) return;
        roots.push(s);
        sitesUsed.add(s.site);
        const facing = TW_OPPOSITE[s.side];
        line.forEach((k) => add('pontoon', k, facing));
        // the landing stage faces the shore: its steps lead up onto the land
        add('floatingPier', line[0], s.side);
      });
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
  const nearWorks = (k) => { const [r, c] = twParse(k); return [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dr, dc]) => used.has(twKey(r + dr, c + dc))); };
  const candidates = [...analysis.basin]
    .filter((k) => !analysis.channel.has(k) && !used.has(k) && !shoreTiles.has(k) && !nearWorks(k))
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

function createTyphoonShelterWorks() {
  return { approved: false, items: [] };
}

/**
 * Bring a plan's stored works in line with its layout. Returns a new works object: new works are
 * 'queued', works no longer wanted are 'demolishing'. completeTyphoonShelterWorks builds them.
 */
function reconcileTyphoonShelterWorks(works, layout) {
  const wanted = new Map(layout.map((w) => [w.key, w]));
  const items = [];
  const seen = new Set();
  (works.items || []).forEach((item) => {
    const want = wanted.get(item.key);
    seen.add(item.key);
    if (want) { items.push({ ...item, facing: want.facing, state: item.state === 'demolishing' ? 'done' : item.state }); return; }
    if (item.state === 'queued') return;
    items.push({ ...item, state: 'demolishing' });
  });
  layout.forEach((w) => {
    if (!seen.has(w.key)) items.push({ ...w, state: 'queued' });
  });
  return { ...works, items };
}

// Build what is queued and remove what is being torn down, all at once: { works, cost, built,
// removed }. The cost is the whole bill, to be paid once.
function completeTyphoonShelterWorks(works) {
  let cost = 0;
  let built = 0;
  let removed = 0;
  const items = [];
  (works.items || []).forEach((item) => {
    if (item.state === 'demolishing') { cost += TYPHOON_SHELTER_DEMOLISH.cost; removed += 1; return; }
    if (item.state === 'queued') { cost += TYPHOON_SHELTER_WORK_KINDS[item.kind]?.cost || 0; built += 1; }
    items.push({ ...item, state: 'done' });
  });
  return { works: { ...works, items }, cost, built, removed };
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
  const occupied = new Set(items.filter((i) => ['pier', 'floatingPier', 'pontoon'].includes(i.kind) && analysis?.basin?.has(twKey(i.row, i.col)))
    .map((i) => twKey(i.row, i.col))).size;
  const mooring = Math.max(0, (analysis?.berths?.mooringTiles || 0) - occupied);
  const total = Math.floor(mooring / 2);
  const reserved = Math.ceil((total * (analysis?.berths?.reserved || 0)) / Math.max(1, analysis?.berths?.total || 1));
  const upkeep = items.filter((i) => i.state === 'done').reduce((sum, i) => sum + (TYPHOON_SHELTER_WORK_KINDS[i.kind]?.upkeep || 0), 0);
  return {
    done: count((i) => i.state === 'done'),
    total: items.length,
    upkeep,
    operational,
    pierBuilt: !!pier,
    pierConnected,
    berths: operational ? { total, reserved, daily: total - reserved } : { total: 0, reserved: 0, daily: 0 },
  };
}

// Saved works -> clean works. Anything a save holds is built (older saves from the scheduled
// prototype may still say queued or building; those finish on load).
function normalizeTyphoonShelterWorks(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kinds = Object.keys(TYPHOON_SHELTER_WORK_KINDS);
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((i) => kinds.includes(i?.kind) && Number.isInteger(i?.row) && Number.isInteger(i?.col) && i.state !== 'demolishing')
    .slice(0, 2000)
    .map((i) => {
      const facing = ['n', 'e', 's', 'w'].includes(i.facing) ? i.facing : 'e';
      const corner = TW_CORNERS.includes(i.corner) ? i.corner : null;
      return {
        key: twWorkKey(i.kind, i.row, i.col, facing, corner),
        kind: i.kind,
        row: i.row,
        col: i.col,
        facing,
        ...(i.kind === 'quayFill' ? { corner: corner || 'nw' } : {}),
        state: 'done',
      };
    });
  return { approved: !!raw.approved, items: raw.approved ? items : [] };
}

const typhoonShelterWorksApi = {
  TYPHOON_SHELTER_WORK_KINDS,
  TYPHOON_SHELTER_DEMOLISH,
  TYPHOON_SHELTER_ROAD_REACH,
  layoutTyphoonShelterWorks,
  createTyphoonShelterWorks,
  reconcileTyphoonShelterWorks,
  completeTyphoonShelterWorks,
  summarizeTyphoonShelterWorks,
  normalizeTyphoonShelterWorks,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterWorksApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterWorksApi);
