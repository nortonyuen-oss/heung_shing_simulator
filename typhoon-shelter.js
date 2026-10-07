// 避風塘規劃 (Phase 1): the planning model - basin, breakwater line, entrances, channel, berths,
// protection, cost and every legality rule. Pure functions over a map accessor, so the whole thing
// runs under node for tests; the game layer (typhoon-shelter-planning.js) supplies the accessor,
// draws the preview and stores the plans in city.typhoonShelters.
//
// Design: docs/typhoon-shelter-phase1-design.md. One tile is 20 m.
//
// A plan is { id, name, seed, basin: Set-able tile list, entrances: [{ side, along, width }],
// reservePct, status }. The player paints only the basin (water where boats lie); the breakwater
// is derived: every basin edge that faces open water gets a breakwater on the water tile just
// outside it (the ring), and edges facing land are shoreline. Entrances are gaps in the ring,
// stored by the side of the basin they face (n/e/s/w) and their position along it (`along`: the
// row for e/w sides, the column for n/s), so when the basin grows outward the entrance follows
// the side out with it.
//
// Map accessor: { width, height, kind(row, col) } where kind is
//   'water'   open water a shelter may use
//   'land'    ground, hill, road, dirt, beach - shoreline
//   'bridge'  a bridge deck over water (never part of a shelter; boats cannot pass under, for now)
//   'blocked' water occupied by something else (a container port, a building)
//   'shelter' another shelter's basin or breakwater
// and kind() outside the map returns null.

const TYPHOON_SHELTER_MIN_BASIN = Object.freeze({ short: 6, long: 8 });
const TYPHOON_SHELTER_ENTRANCE_WIDTH = 2;
const TYPHOON_SHELTER_WIDE_ENTRANCE = Object.freeze({ width: 3, minSide: 11 });
const TYPHOON_SHELTER_MIN_SHORE_RUN = 3;
const TYPHOON_SHELTER_MIN_RING_RUN = 2;
const TYPHOON_SHELTER_CHANNEL_WIDTH = 2;
const TYPHOON_SHELTER_DEFAULT_RESERVE_PCT = 20;
// Rough per-tile figures for the planning preview; the bill a plan is charged comes from its
// actual works list (typhoon-shelter-works.js), which these mirror.
const TYPHOON_SHELTER_COST = Object.freeze({
  breakwaterPerTile: 30,
  head: 200,
  demolishPerTile: 10,
  maintenancePerTile: 0.5,
});

const TS_DIRS = Object.freeze({
  n: Object.freeze([-1, 0]), e: Object.freeze([0, 1]), s: Object.freeze([1, 0]), w: Object.freeze([0, -1]),
});
const TS_SIDES = Object.freeze(['n', 'e', 's', 'w']);
const TS_OPPOSITE = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });

const TS_MESSAGES = Object.freeze({
  basinNotWater: '水域包含陸地／橋／設施',
  basinSplit: '水域分成幾塊',
  basinTooSmall: '水域最少要 6×8 格',
  noShore: '要最少一邊靠岸（連續 3 格）',
  ringBlocked: '防波堤位置被佔用',
  nearMapEdge: '太近地圖邊，建唔到堤',
  noEntrance: '冇出入口',
  oneEntrance: '建議開第二個出入口',
  entranceNearCorner: '出入口太近轉角',
  entranceTooWide: '呢邊唔夠 10 格，出入口最闊 2 格',
  entranceLost: '出入口需要重新指定',
  entranceNoSea: '出入口通唔到外海',
  ringTooShort: '防波堤有太短的轉折',
  noChannel: '出入口同塘內水路唔通',
});

// ---------------------------------------------------------------------------
// tiles and basin encoding
// ---------------------------------------------------------------------------

const tsKey = (r, c) => `${r}:${c}`;
const tsParse = (k) => k.split(':').map(Number);

// 'row:c0-c1,c2-c3;row:...' <-> Set of 'r:c' keys
function encodeTyphoonShelterBasin(basin) {
  const rows = new Map();
  [...basin].map(tsParse).forEach(([r, c]) => {
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(c);
  });
  return [...rows.keys()].sort((a, b) => a - b).map((r) => {
    const cols = rows.get(r).sort((a, b) => a - b);
    const runs = [];
    let start = cols[0];
    let prev = cols[0];
    for (let i = 1; i <= cols.length; i++) {
      if (cols[i] === prev + 1) { prev = cols[i]; continue; }
      runs.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = cols[i];
      prev = cols[i];
    }
    return `${r}:${runs.join(',')}`;
  }).join(';');
}

function decodeTyphoonShelterBasin(text) {
  const basin = new Set();
  String(text || '').split(';').filter(Boolean).forEach((part) => {
    const [rText, runsText] = part.split(':');
    const r = Number(rText);
    if (!Number.isInteger(r) || !runsText) return;
    runsText.split(',').forEach((run) => {
      const [a, b] = run.split('-').map(Number);
      const end = Number.isInteger(b) ? b : a;
      if (!Number.isInteger(a)) return;
      for (let c = a; c <= end; c++) basin.add(tsKey(r, c));
    });
  });
  return basin;
}

function typhoonShelterRectTiles(r0, c0, r1, c1) {
  const tiles = [];
  for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) tiles.push(tsKey(r, c));
  }
  return tiles;
}

// 4-connected components of a tile set.
function typhoonShelterComponents(tiles) {
  const left = new Set(tiles);
  const out = [];
  while (left.size) {
    const first = left.values().next().value;
    left.delete(first);
    const comp = [first];
    for (let i = 0; i < comp.length; i++) {
      const [r, c] = tsParse(comp[i]);
      TS_SIDES.forEach((d) => {
        const k = tsKey(r + TS_DIRS[d][0], c + TS_DIRS[d][1]);
        if (left.has(k)) { left.delete(k); comp.push(k); }
      });
    }
    out.push(comp);
  }
  return out;
}

// Smooths a basin: water notches one tile wide are filled in, and one-tile-wide strips sticking
// out are shaved off, so the breakwater never has to zigzag round a single tile.
function normalizeTyphoonShelterBasin(basin, map) {
  const out = new Set(basin);
  const has = (r, c) => out.has(tsKey(r, c));
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    // shave: a tile with no basin on both sides along one axis is part of a 1-wide strip
    [...out].forEach((k) => {
      const [r, c] = tsParse(k);
      if ((!has(r - 1, c) && !has(r + 1, c)) || (!has(r, c - 1) && !has(r, c + 1))) { out.delete(k); changed = true; }
    });
    // fill: open water with basin on both sides along one axis is a 1-wide notch
    const candidates = new Set();
    out.forEach((k) => {
      const [r, c] = tsParse(k);
      TS_SIDES.forEach((d) => candidates.add(tsKey(r + TS_DIRS[d][0], c + TS_DIRS[d][1])));
    });
    candidates.forEach((k) => {
      if (out.has(k)) return;
      const [r, c] = tsParse(k);
      if (map.kind(r, c) !== 'water') return;
      if ((has(r - 1, c) && has(r + 1, c)) || (has(r, c - 1) && has(r, c + 1))) { out.add(k); changed = true; }
    });
    if (!changed) break;
  }
  return out;
}

// Does the basin hold a full short x long rectangle, either way round?
function typhoonShelterHasRect(basin, short, long) {
  if (!basin.size) return false;
  const tiles = [...basin].map(tsParse);
  const r0 = Math.min(...tiles.map((t) => t[0]));
  const c0 = Math.min(...tiles.map((t) => t[1]));
  const H = Math.max(...tiles.map((t) => t[0])) - r0 + 1;
  const W = Math.max(...tiles.map((t) => t[1])) - c0 + 1;
  const P = new Int32Array((H + 1) * (W + 1));
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const v = basin.has(tsKey(r + r0, c + c0)) ? 1 : 0;
      P[(r + 1) * (W + 1) + c + 1] = v + P[r * (W + 1) + c + 1] + P[(r + 1) * (W + 1) + c] - P[r * (W + 1) + c];
    }
  }
  const sum = (r, c, h, w) => P[(r + h) * (W + 1) + c + w] - P[r * (W + 1) + c + w] - P[(r + h) * (W + 1) + c] + P[r * (W + 1) + c];
  for (const [h, w] of [[short, long], [long, short]]) {
    for (let r = 0; r + h <= H; r++) for (let c = 0; c + w <= W; c++) if (sum(r, c, h, w) === h * w) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// analysis
// ---------------------------------------------------------------------------

// Straight runs of keyed items: groups items with the same `line` whose `pos` values are
// consecutive. items: [{ line, pos, ... }] -> [[item, ...], ...] each sorted by pos.
function typhoonShelterRuns(items) {
  const byLine = new Map();
  items.forEach((it) => {
    if (!byLine.has(it.line)) byLine.set(it.line, []);
    byLine.get(it.line).push(it);
  });
  const runs = [];
  byLine.forEach((list) => {
    list.sort((a, b) => a.pos - b.pos);
    let run = [list[0]];
    for (let i = 1; i < list.length; i++) {
      if (list[i].pos === run[run.length - 1].pos + 1) run.push(list[i]);
      else { runs.push(run); run = [list[i]]; }
    }
    runs.push(run);
  });
  return runs;
}

// along-coordinate of a tile for a side: e/w sides run along rows, n/s along columns
const tsAlong = (side, r, c) => (side === 'e' || side === 'w' ? r : c);
const tsLine = (side, r, c) => (side === 'e' || side === 'w' ? c : r);

/**
 * Everything derived from a plan. Never saved; recomputed from basin + entrances.
 * @returns {{ basin:Set, edges, shoreEdges, openEdges, ring:Set, sideRuns, entrances, heads,
 *   channel:Set, berths, protection, cost, problems:[{code,message,tiles}], warnings, legal }}
 */
function analyzeTyphoonShelter(plan, map) {
  const basin = plan.basin instanceof Set ? new Set(plan.basin) : decodeTyphoonShelterBasin(plan.basin);
  const problems = [];
  const warnings = [];
  const problem = (code, tiles = []) => problems.push({ code, message: TS_MESSAGES[code], tiles });

  // basin tiles
  const notWater = [...basin].filter((k) => map.kind(...tsParse(k)) !== 'water');
  if (notWater.length) problem('basinNotWater', notWater);
  if (typhoonShelterComponents(basin).length > 1) problem('basinSplit');
  if (!typhoonShelterHasRect(basin, TYPHOON_SHELTER_MIN_BASIN.short, TYPHOON_SHELTER_MIN_BASIN.long)) problem('basinTooSmall');

  // edges
  const edges = [];
  basin.forEach((k) => {
    const [r, c] = tsParse(k);
    TS_SIDES.forEach((side) => {
      const nr = r + TS_DIRS[side][0];
      const nc = c + TS_DIRS[side][1];
      if (basin.has(tsKey(nr, nc))) return;
      const kind = map.kind(nr, nc);
      const type = kind === 'land' ? 'shore' : kind === null ? 'mapEdge' : 'open';
      edges.push({ r, c, side, type, out: [nr, nc], line: `${side}:${tsLine(side, nr, nc)}`, pos: tsAlong(side, r, c) });
    });
  });
  const shoreEdges = edges.filter((e) => e.type === 'shore');
  const openEdges = edges.filter((e) => e.type === 'open');
  if (edges.some((e) => e.type === 'mapEdge')) problem('nearMapEdge', edges.filter((e) => e.type === 'mapEdge').map((e) => tsKey(e.r, e.c)));
  const longestShore = typhoonShelterLongestShore(shoreEdges);
  if (longestShore < TYPHOON_SHELTER_MIN_SHORE_RUN) problem('noShore');

  // ring: the water tile outside every open edge, plus the diagonal at each convex corner
  const ring = new Set(openEdges.map((e) => tsKey(...e.out)));
  const corners = new Set();
  basin.forEach((k) => {
    const [r, c] = tsParse(k);
    const openSide = (side) => openEdges.some((e) => e.r === r && e.c === c && e.side === side);
    [['n', 'e'], ['e', 's'], ['s', 'w'], ['w', 'n']].forEach(([a, b]) => {
      if (!openSide(a) || !openSide(b)) return;
      const dr = TS_DIRS[a][0] + TS_DIRS[b][0];
      const dc = TS_DIRS[a][1] + TS_DIRS[b][1];
      const dk = tsKey(r + dr, c + dc);
      if (basin.has(dk) || map.kind(r + dr, c + dc) === 'land') return;
      ring.add(dk);
      corners.add(dk);
    });
  });
  const ringBad = [...ring].filter((k) => {
    const [r, c] = tsParse(k);
    return map.kind(r, c) !== 'water' || r <= 0 || c <= 0 || r >= map.height - 1 || c >= map.width - 1;
  });
  if (ringBad.length) {
    const nearEdge = ringBad.filter((k) => { const [r, c] = tsParse(k); return map.kind(r, c) === 'water'; });
    if (nearEdge.length && !problems.some((p) => p.code === 'nearMapEdge')) problem('nearMapEdge', nearEdge);
    const blocked = ringBad.filter((k) => !nearEdge.includes(k));
    if (blocked.length) problem('ringBlocked', blocked);
  }

  // the ring's straight runs, per side of the basin they face
  const sideRuns = typhoonShelterRuns(openEdges.map((e) => ({ ...e, tile: tsKey(...e.out) })))
    .map((run) => ({ side: run[0].side, line: tsLine(run[0].side, ...run[0].out), from: run[0].pos, to: run[run.length - 1].pos, tiles: run.map((e) => e.tile) }));
  const shortRuns = sideRuns.filter((run) => run.tiles.length < TYPHOON_SHELTER_MIN_RING_RUN);
  if (shortRuns.length) problem('ringTooShort', shortRuns.flatMap((run) => run.tiles));

  // entrances
  const entrances = (plan.entrances || []).map((ent, index) => resolveTyphoonShelterEntrance(ent, sideRuns, index));
  entrances.forEach((ent) => {
    if (ent.status === 'lost') problem('entranceLost');
    else if (ent.status === 'nearCorner') problem('entranceNearCorner', ent.tiles);
    else if (ent.status === 'tooWide') problem('entranceTooWide', ent.tiles);
  });
  const placed = entrances.filter((e) => e.tiles.length);
  if (!entrances.length) problem('noEntrance');
  else if (entrances.length === 1) warnings.push({ code: 'oneEntrance', message: TS_MESSAGES.oneEntrance });
  placed.forEach((ent) => {
    if (ent.status === 'ok' && !typhoonShelterReachesSea(map, ent, basin, ring)) {
      ent.status = 'noSea';
      problem('entranceNoSea', ent.tiles);
    }
  });
  const gap = new Set(placed.flatMap((e) => e.tiles));
  const breakwater = new Set([...ring].filter((k) => !gap.has(k)));

  // heads: corners, both sides of each entrance, and where the breakwater meets the shore
  const heads = new Set();
  corners.forEach((k) => { if (!gap.has(k)) heads.add(k); });
  placed.forEach((ent) => {
    const [first, last] = [ent.tiles[0], ent.tiles[ent.tiles.length - 1]].map(tsParse);
    const back = TS_DIRS[ent.side][0] !== 0 ? [0, 1] : [1, 0]; // along the side
    [[first[0] - back[0], first[1] - back[1]], [last[0] + back[0], last[1] + back[1]]].forEach(([r, c]) => {
      if (breakwater.has(tsKey(r, c))) heads.add(tsKey(r, c));
    });
  });
  breakwater.forEach((k) => {
    const [r, c] = tsParse(k);
    const ringNeighbours = TS_SIDES.filter((d) => ring.has(tsKey(r + TS_DIRS[d][0], c + TS_DIRS[d][1]))).length;
    const touchesLand = TS_SIDES.some((d) => map.kind(r + TS_DIRS[d][0], c + TS_DIRS[d][1]) === 'land');
    if (ringNeighbours <= 1 && touchesLand) heads.add(k);
  });

  // main channel
  const channel = typhoonShelterChannel(basin, placed, shoreEdges);
  if (placed.length && channel === null) problem('noChannel');

  // berths
  const channelSet = channel || new Set();
  const mooring = [...basin].filter((k) => !channelSet.has(k)).length;
  // lanes keep one row of water in three clear (typhoon-shelter-fleet.js); a boat takes two tiles
  const berthsTotal = Math.floor(mooring / 3);
  const reservePct = Number.isFinite(plan.reservePct) ? plan.reservePct : TYPHOON_SHELTER_DEFAULT_RESERVE_PCT;
  const reserved = Math.ceil((berthsTotal * reservePct) / 100);
  const berths = { total: berthsTotal, reserved, daily: berthsTotal - reserved, mooringTiles: mooring };

  // protection
  const exposed = typhoonShelterExposedTiles(basin, placed);
  const gapWidth = placed.reduce((sum, e) => sum + e.tiles.length, 0);
  const protectionParts = {
    shore: edges.length ? (40 * shoreEdges.length) / edges.length : 0,
    breakwater: openEdges.length ? 40 * Math.max(0, 1 - gapWidth / openEdges.length) : 40,
    exposure: basin.size ? 20 * (1 - exposed.size / basin.size) : 0,
  };
  const protection = {
    score: Math.round(protectionParts.shore + protectionParts.breakwater + protectionParts.exposure),
    parts: Object.fromEntries(Object.entries(protectionParts).map(([k, v]) => [k, Math.round(v)])),
    exposed,
  };

  const cost = {
    build: breakwater.size * TYPHOON_SHELTER_COST.breakwaterPerTile + heads.size * TYPHOON_SHELTER_COST.head,
    monthly: breakwater.size * TYPHOON_SHELTER_COST.maintenancePerTile,
  };

  return {
    basin, edges, shoreEdges, openEdges, ring, breakwater, corners, sideRuns, entrances, heads,
    channel: channelSet, berths, protection, cost,
    areaHa: Math.round((basin.size * 400) / 1000) / 10,
    longestShore,
    problems, warnings, legal: problems.length === 0,
  };
}

// The longest continuous shoreline, in edges. Shore edges are continuous when their basin tiles
// touch, diagonally included, so a staircase along a diagonal coast counts as one shore.
function typhoonShelterLongestShore(shoreEdges) {
  const byTile = new Map();
  shoreEdges.forEach((e) => {
    const k = tsKey(e.r, e.c);
    byTile.set(k, (byTile.get(k) || 0) + 1);
  });
  const left = new Set(byTile.keys());
  let best = 0;
  while (left.size) {
    const first = left.values().next().value;
    left.delete(first);
    const queue = [first];
    let edges = 0;
    for (let i = 0; i < queue.length; i++) {
      edges += byTile.get(queue[i]);
      const [r, c] = tsParse(queue[i]);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nk = tsKey(r + dr, c + dc);
          if (left.has(nk)) { left.delete(nk); queue.push(nk); }
        }
      }
    }
    best = Math.max(best, edges);
  }
  return best;
}

// An entrance's tiles on the current ring: the run on its side covering along..along+width-1;
// the outermost one if a stepped side has several.
function resolveTyphoonShelterEntrance(ent, sideRuns, index = 0) {
  const width = Math.max(1, Math.round(ent.width || TYPHOON_SHELTER_ENTRANCE_WIDTH));
  const from = Math.round(ent.along);
  const to = from + width - 1;
  const outward = TS_DIRS[ent.side];
  const runs = sideRuns.filter((run) => run.side === ent.side && run.from <= from && run.to >= to)
    .sort((a, b) => (outward[0] + outward[1] > 0 ? b.line - a.line : a.line - b.line));
  const base = { index, side: ent.side, along: from, width, tiles: [] };
  if (!runs.length) return { ...base, status: 'lost' };
  const run = runs[0];
  const tiles = run.tiles.slice(from - run.from, to - run.from + 1);
  if (from - run.from < 1 || run.to - to < 1) return { ...base, tiles, run, status: 'nearCorner' };
  const maxWidth = run.tiles.length >= TYPHOON_SHELTER_WIDE_ENTRANCE.minSide ? TYPHOON_SHELTER_WIDE_ENTRANCE.width : TYPHOON_SHELTER_ENTRANCE_WIDTH;
  if (width > maxWidth) return { ...base, tiles, run, status: 'tooWide' };
  return { ...base, tiles, run, status: 'ok' };
}

// Open sea: water reachable from the entrance's outside tiles to the map border, not through any
// shelter (this one included), bridge or blocked water.
function typhoonShelterReachesSea(map, ent, basin, ring) {
  const out = TS_DIRS[ent.side];
  const start = ent.tiles.map((k) => { const [r, c] = tsParse(k); return [r + out[0], c + out[1]]; });
  const seen = new Set();
  const queue = [];
  const passable = (r, c) => map.kind(r, c) === 'water' && !basin.has(tsKey(r, c)) && !ring.has(tsKey(r, c));
  start.forEach(([r, c]) => { if (passable(r, c)) { seen.add(tsKey(r, c)); queue.push([r, c]); } });
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    if (r === 0 || c === 0 || r === map.height - 1 || c === map.width - 1) return true;
    for (const d of TS_SIDES) {
      const nr = r + TS_DIRS[d][0];
      const nc = c + TS_DIRS[d][1];
      const k = tsKey(nr, nc);
      if (seen.has(k) || !passable(nr, nc)) continue;
      seen.add(k);
      queue.push([nr, nc]);
    }
  }
  return false;
}

// The entrance's first basin tiles inward.
function typhoonShelterEntranceInner(ent) {
  const inward = TS_DIRS[TS_OPPOSITE[ent.side]];
  return ent.tiles.map((k) => { const [r, c] = tsParse(k); return tsKey(r + inward[0], c + inward[1]); });
}

// Shortest water path between the first two entrances (or from the only entrance to the shore),
// widened to TYPHOON_SHELTER_CHANNEL_WIDTH. null when there is no path.
function typhoonShelterChannel(basin, entrances, shoreEdges) {
  if (!entrances.length) return new Set();
  const sources = typhoonShelterEntranceInner(entrances[0]).filter((k) => basin.has(k));
  const targets = new Set(entrances.length > 1
    ? typhoonShelterEntranceInner(entrances[1]).filter((k) => basin.has(k))
    : shoreEdges.map((e) => tsKey(e.r, e.c)));
  if (!sources.length || !targets.size) return null;
  const prev = new Map(sources.map((k) => [k, null]));
  const queue = [...sources];
  let hit = null;
  for (let i = 0; i < queue.length && !hit; i++) {
    const k = queue[i];
    if (targets.has(k)) { hit = k; break; }
    const [r, c] = tsParse(k);
    for (const d of TS_SIDES) {
      const nk = tsKey(r + TS_DIRS[d][0], c + TS_DIRS[d][1]);
      if (!basin.has(nk) || prev.has(nk)) continue;
      prev.set(nk, k);
      queue.push(nk);
    }
  }
  if (!hit) return null;
  const path = [];
  for (let k = hit; k !== null; k = prev.get(k)) path.push(k);
  const channel = new Set(path);
  if (TYPHOON_SHELTER_CHANNEL_WIDTH > 1) {
    // widen toward the entrance's second tile
    const widen = entrances[0].side === 'e' || entrances[0].side === 'w' ? [1, 0] : [0, 1];
    path.forEach((k) => {
      const [r, c] = tsParse(k);
      const a = tsKey(r + widen[0], c + widen[1]);
      const b = tsKey(r - widen[0], c - widen[1]);
      if (basin.has(a)) channel.add(a); else if (basin.has(b)) channel.add(b);
    });
  }
  return channel;
}

// Basin water in a straight line in through an entrance - open to waves from outside.
function typhoonShelterExposedTiles(basin, entrances) {
  const exposed = new Set();
  entrances.forEach((ent) => {
    const inward = TS_DIRS[TS_OPPOSITE[ent.side]];
    ent.tiles.forEach((k) => {
      let [r, c] = tsParse(k);
      for (;;) {
        r += inward[0];
        c += inward[1];
        if (!basin.has(tsKey(r, c))) break;
        exposed.add(tsKey(r, c));
      }
    });
  });
  return exposed;
}

// ---------------------------------------------------------------------------
// editing
// ---------------------------------------------------------------------------

// Up to two entrances for a fresh plan: on the side runs that reach the open sea, as far apart
// as possible (穿塘, like 香港仔), each centred on its run.
function suggestTyphoonShelterEntrances(plan, map) {
  const analysis = analyzeTyphoonShelter({ ...plan, entrances: [] }, map);
  const candidates = analysis.sideRuns
    .filter((run) => run.tiles.length >= TYPHOON_SHELTER_ENTRANCE_WIDTH + 2)
    .map((run) => {
      const along = Math.floor((run.from + run.to + 1) / 2) - Math.floor(TYPHOON_SHELTER_ENTRANCE_WIDTH / 2);
      const ent = { side: run.side, along, width: TYPHOON_SHELTER_ENTRANCE_WIDTH };
      const resolved = resolveTyphoonShelterEntrance(ent, analysis.sideRuns);
      const [r, c] = tsParse(resolved.tiles[0] || run.tiles[0]);
      return { ent, resolved, r, c, len: run.tiles.length };
    })
    .filter((x) => x.resolved.status === 'ok' && typhoonShelterReachesSea(map, x.resolved, analysis.basin, analysis.ring));
  if (!candidates.length) return [];
  if (candidates.length === 1) return [candidates[0].ent];
  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const d = Math.abs(candidates[i].r - candidates[j].r) + Math.abs(candidates[i].c - candidates[j].c);
      if (!best || d > best.d) best = { d, pair: [candidates[i].ent, candidates[j].ent] };
    }
  }
  return best.pair;
}

/**
 * Add or cut a rectangle. Returns { plan, analysis, diff } or { rejected: message }.
 * A cut that splits the basin, empties it, loses the shoreline or an entrance is refused.
 * diff (against the plan before): { build, keep, demolish } breakwater tiles and the net cost.
 */
function editTyphoonShelterBasin(plan, map, rect, mode = 'add') {
  const before = analyzeTyphoonShelter(plan, map);
  const tiles = typhoonShelterRectTiles(rect.r0, rect.c0, rect.r1, rect.c1);
  const next = new Set(before.basin);
  if (mode === 'add') tiles.forEach((k) => { if (map.kind(...tsParse(k)) === 'water') next.add(k); });
  else tiles.forEach((k) => next.delete(k));
  const basin = normalizeTyphoonShelterBasin(next, map);
  if (!basin.size) return { rejected: '水域會冇晒' };
  const nextPlan = { ...plan, basin: encodeTyphoonShelterBasin(basin) };
  let analysis = analyzeTyphoonShelter(nextPlan, map);
  if (mode === 'subtract') {
    const reason = analysis.problems.find((p) => ['basinSplit', 'basinTooSmall', 'noShore'].includes(p.code));
    if (reason && !before.problems.some((p) => p.code === reason.code)) return { rejected: reason.message };
  }
  // entrances follow their side; one that no longer fits moves to the nearest fit on that side
  const entrances = (plan.entrances || []).map((ent) => {
    const res = resolveTyphoonShelterEntrance(ent, analysis.sideRuns);
    if (res.status === 'ok') return ent;
    const moved = nearestTyphoonShelterEntrance(ent, analysis.sideRuns);
    return moved || ent;
  });
  if (mode === 'subtract' && entrances.some((ent) => resolveTyphoonShelterEntrance(ent, analysis.sideRuns).status === 'lost')
    && !before.entrances.some((e) => e.status === 'lost')) {
    return { rejected: TS_MESSAGES.entranceLost };
  }
  const finalPlan = { ...nextPlan, entrances };
  analysis = analyzeTyphoonShelter(finalPlan, map);
  return { plan: finalPlan, analysis, diff: diffTyphoonShelterBreakwater(before, analysis) };
}

function nearestTyphoonShelterEntrance(ent, sideRuns) {
  const width = Math.max(1, Math.round(ent.width || TYPHOON_SHELTER_ENTRANCE_WIDTH));
  let best = null;
  sideRuns.filter((run) => run.side === ent.side).forEach((run) => {
    for (let along = run.from + 1; along + width - 1 <= run.to - 1; along++) {
      const candidate = { ...ent, along, width };
      if (resolveTyphoonShelterEntrance(candidate, sideRuns).status !== 'ok') continue;
      const d = Math.abs(along - ent.along);
      if (!best || d < best.d) best = { d, candidate };
    }
  });
  return best?.candidate || null;
}

function diffTyphoonShelterBreakwater(before, after) {
  const build = [...after.breakwater].filter((k) => !before.breakwater.has(k));
  const keep = [...after.breakwater].filter((k) => before.breakwater.has(k));
  const demolish = [...before.breakwater].filter((k) => !after.breakwater.has(k));
  const newHeads = [...after.heads].filter((k) => !before.heads.has(k)).length;
  return {
    build, keep, demolish,
    cost: build.length * TYPHOON_SHELTER_COST.breakwaterPerTile + newHeads * TYPHOON_SHELTER_COST.head
      + demolish.length * TYPHOON_SHELTER_COST.demolishPerTile,
  };
}

// Toggle or widen an entrance at a ring tile. Returns the new entrance list, or { rejected }.
// Clicking a breakwater tile opens a 2-wide entrance there; clicking a tile right next to an
// existing entrance on the same side widens it to 3 (where the side allows); clicking inside an
// entrance removes it.
function toggleTyphoonShelterEntrance(plan, map, row, col) {
  const analysis = analyzeTyphoonShelter(plan, map);
  const k = tsKey(row, col);
  const current = analysis.entrances;
  const inside = current.find((e) => e.tiles.includes(k));
  if (inside) return (plan.entrances || []).filter((_, i) => i !== inside.index);
  const run = analysis.sideRuns.find((r) => r.tiles.includes(k));
  if (!run) return { rejected: '要撳喺防波堤直段上' };
  const along = tsAlong(run.side, row, col);
  const neighbour = current.find((e) => e.side === run.side && e.run === run && (along === e.along - 1 || along === e.along + e.width));
  if (neighbour) {
    const widened = { side: neighbour.side, along: Math.min(along, neighbour.along), width: neighbour.width + 1 };
    const res = resolveTyphoonShelterEntrance(widened, analysis.sideRuns);
    if (res.status !== 'ok') return { rejected: TS_MESSAGES[res.status === 'tooWide' ? 'entranceTooWide' : 'entranceNearCorner'] };
    return (plan.entrances || []).map((e, i) => (i === neighbour.index ? widened : e));
  }
  // centre the new 2-wide entrance on the click, nudged inside the run
  let start = along - Math.floor((TYPHOON_SHELTER_ENTRANCE_WIDTH - 1) / 2);
  start = Math.max(run.from + 1, Math.min(run.to - TYPHOON_SHELTER_ENTRANCE_WIDTH, start));
  const ent = { side: run.side, along: start, width: TYPHOON_SHELTER_ENTRANCE_WIDTH };
  const res = resolveTyphoonShelterEntrance(ent, analysis.sideRuns);
  if (res.status !== 'ok') return { rejected: TS_MESSAGES.entranceNearCorner };
  if (current.some((e) => e.side === ent.side && e.run === res.run && e.along <= ent.along + ent.width && ent.along <= e.along + e.width)) {
    return { rejected: '太貼近另一個出入口' };
  }
  return [...(plan.entrances || []), ent];
}

function createTyphoonShelterPlan(id, basin, map, { name, seed } = {}) {
  const normalized = normalizeTyphoonShelterBasin(basin, map);
  const plan = {
    id,
    name: name || '',
    seed: Number.isFinite(seed) ? seed : Math.floor(Math.random() * 2 ** 31),
    basin: encodeTyphoonShelterBasin(normalized),
    entrances: [],
    reservePct: TYPHOON_SHELTER_DEFAULT_RESERVE_PCT,
    status: 'planned',
  };
  plan.entrances = suggestTyphoonShelterEntrances(plan, map);
  return plan;
}

// Saved form -> clean plan (bad fields dropped).
function normalizeTyphoonShelterPlan(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.basin !== 'string' || !raw.id) return null;
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : '',
    seed: Number.isFinite(raw.seed) ? raw.seed : 0,
    basin: encodeTyphoonShelterBasin(decodeTyphoonShelterBasin(raw.basin)),
    entrances: (Array.isArray(raw.entrances) ? raw.entrances : [])
      .filter((e) => TS_SIDES.includes(e?.side) && Number.isFinite(e?.along))
      .slice(0, 6)
      .map((e) => ({ side: e.side, along: Math.round(e.along), width: Math.max(1, Math.min(3, Math.round(e.width || 2))) })),
    reservePct: Number.isFinite(raw.reservePct) ? Math.max(0, Math.min(40, Math.round(raw.reservePct))) : TYPHOON_SHELTER_DEFAULT_RESERVE_PCT,
    // planned -> built (all works up, pier not on a road yet) -> operational
    status: ['planned', 'built', 'operational'].includes(raw.status) ? raw.status : (raw.works?.approved ? 'built' : 'planned'),
    // Phase 2 construction (typhoon-shelter-works.js)
    ...(raw.works && typeof normalizeTyphoonShelterWorks === 'function' ? { works: normalizeTyphoonShelterWorks(raw.works) } : {}),
    // Phase 3 boats (typhoon-shelter-fleet.js)
    ...(raw.fleet && typeof normalizeTyphoonShelterFleet === 'function' ? { fleet: normalizeTyphoonShelterFleet(raw.fleet) } : {}),
    // Phase 5 fishery: its facilities, auto-expand switch, months short of hands (typhoon-shelter-fishery.js)
    ...(raw.fishery && typeof normalizeTyphoonShelterFishery === 'function' ? { fishery: normalizeTyphoonShelterFishery(raw.fishery) } : {}),
  };
}

function normalizeTyphoonShelterState(raw) {
  const shelters = (Array.isArray(raw?.shelters) ? raw.shelters : []).map(normalizeTyphoonShelterPlan).filter(Boolean);
  const maxId = shelters.reduce((m, s) => Math.max(m, Number(String(s.id).replace(/\D/g, '')) || 0), 0);
  // Phase 4: the city's storm (typhoon-shelter-storm.js)
  const storm = raw?.storm && typeof normalizeTyphoonShelterStorm === 'function' ? normalizeTyphoonShelterStorm(raw.storm) : null;
  return { version: 1, nextId: Math.max(Number(raw?.nextId) || 1, maxId + 1), shelters, ...(storm ? { storm } : {}) };
}

const typhoonShelterApi = {
  TYPHOON_SHELTER_MIN_BASIN,
  TYPHOON_SHELTER_ENTRANCE_WIDTH,
  TYPHOON_SHELTER_WIDE_ENTRANCE,
  TYPHOON_SHELTER_COST,
  TYPHOON_SHELTER_DEFAULT_RESERVE_PCT,
  encodeTyphoonShelterBasin,
  decodeTyphoonShelterBasin,
  normalizeTyphoonShelterBasin,
  analyzeTyphoonShelter,
  suggestTyphoonShelterEntrances,
  editTyphoonShelterBasin,
  toggleTyphoonShelterEntrance,
  createTyphoonShelterPlan,
  normalizeTyphoonShelterPlan,
  normalizeTyphoonShelterState,
  typhoonShelterRectTiles,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterApi);
