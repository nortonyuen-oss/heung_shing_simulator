// 平日小食墟 (docs/street-food-market-design.md): pure day/night schedule, venue discovery and a
// seeded per-venue stall/furniture/people layout. No Phaser dependency, so this half runs under
// node like typhoon-shelter-fleet.js's berths/routes/schedule; street-food-sprites.js turns its
// output into sprites each frame the way typhoon-shelter-sprites.js draws typhoon-shelter-fleet.js's.
//
// A venue never stores which stalls it has: everything here is a pure function of the venue's own
// tiles (an id + a sorted tile list is enough to reseed it identically) plus the clock, so a
// reload, a rotated map or a fast-forward all land on the same stalls without replaying anything.

function sfHash(...parts) {
  let h = 0x811c9dc5;
  parts.forEach((p) => {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  });
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function sfPick(list, seed, ...parts) {
  return list[Math.floor(sfHash(seed, ...parts) * list.length) % list.length];
}

// ── schedule (Norton 2026-10-18: 開日頭放學時候到夜晚宵夜 - after school through 宵夜,
// supersedes the design draft's 09:00-23:00 draft table) ──────────────────────────────────────
// All times are city.timeOfDayMinutes (0 = 00:00); closeFrom/closeDone read past midnight.
const STREET_FOOD_SCHEDULE = Object.freeze({
  openFrom: 15 * 60, // 15:00 放學, carts start arriving
  openFull: 15 * 60 + 30, // 15:30 fully set up
  lateNightFrom: 23 * 60 + 30, // 23:30 晚市 thins into 宵夜 - still fully set up, fewer diners
  closeFrom: 25 * 60 + 30, // 01:30 (wrapped) customers leave, stalls pack up
  closeDone: 26 * 60, // 02:00 (wrapped) lot is bare again
});

function streetFoodWrapMinute(minuteOfDay) {
  const m = Number(minuteOfDay) || 0;
  return m < 6 * 60 ? m + 24 * 60 : m; // the same cutoff festival-venues.js's June4/Yulan use
}

/**
 * The market's phase and how built-up it is (0..1, for fading stalls in/out) at a minute of day.
 * @returns {{ phase: 'empty'|'opening'|'open'|'lateNight'|'closing', presence: number, dinerShare: number }}
 */
function getStreetFoodPhase(minuteOfDay) {
  const m = streetFoodWrapMinute(minuteOfDay), s = STREET_FOOD_SCHEDULE;
  if (m < s.openFrom || m >= s.closeDone) return { phase: 'empty', presence: 0, dinerShare: 0 };
  if (m < s.openFull) return { phase: 'opening', presence: (m - s.openFrom) / (s.openFull - s.openFrom), dinerShare: 0 };
  if (m < s.lateNightFrom) return { phase: 'open', presence: 1, dinerShare: 1 };
  if (m < s.closeFrom) return { phase: 'lateNight', presence: 1, dinerShare: 0.4 };
  return { phase: 'closing', presence: 1 - (m - s.closeFrom) / (s.closeDone - s.closeFrom), dinerShare: 0.15 };
}

// ── weather (street-food-market-design.md "節慶與天氣") ───────────────────────────────────────
/** 'closed' (signal 8+ or black rain: cleared, no stalls), 'rain' (fewer diners, steam/no change
 * to the open-top carts - they have no awning to keep, per the design draft's revision) or 'clear'. */
function getStreetFoodWeatherState(weather) {
  const w = weather || {};
  if (['signal8', 'signal9', 'signal10'].includes(w.typhoonStage) || w.rainWarning === 'black') return 'closed';
  if (w.condition === 'heavyRain' || w.rainWarning === 'red' || w.rainWarning === 'amber') return 'rain';
  if (w.condition === 'showers') return 'lightRain';
  return 'clear';
}

const STREET_FOOD_WEATHER_DINER_SHARE = Object.freeze({ clear: 1, lightRain: 0.75, rain: 0.45, closed: 0 });

// ── venues: event_ground clusters not claimed by a festival right now ─────────────────────────
// `claimed(venue)` is supplied by the caller (street-food-sprites.js's glue), which is where the
// LNY/Bun Hill festival state actually lives; this module only needs the yes/no answer.
function getStreetFoodVenues(ctx, claimed = () => false) {
  const grounds = ctx.eventGrounds || (typeof getEventGroundVenueComponents === 'function'
    ? getEventGroundVenueComponents(ctx.eventGroundTiles || [], ctx.heightOf) : []);
  return grounds.filter((venue) => venue.tiles.length > 0 && !claimed(venue));
}

// ── layout at true size (1 tile = 20 m) ──────────────────────────────────────────────────────
// Norton 2026-10-31 (按真實尺寸重新排位): a 2.3 m cart is a ninth of a tile's edge, so the lot is
// laid out in metres - a line of carts along every open edge, each with a hawker's working strip
// behind it and a queue in front, then round tables with folding stools on a grid in the middle,
// split by aisles where the passers-by walk. Positions come out in fractional tile units
// (row/col, a tile's centre at its integer row/col, its edges at +-0.5).
const STREET_FOOD_TILE_M = 20;
const STREET_FOOD_STALL_LAYOUT = Object.freeze({
  spacingM: 4, // centre to centre along an edge: a 2.3 m cart and ~1.7 m between neighbours
  endMarginM: 3.5, // keep clear of a run's ends, so two edges meeting at a corner do not collide
  cartInsetM: 2.0, // cart footprint's centre, in from the lot's edge
  cartDepthM: 1.0, // the counter's short side, across the edge
  hawkerInsetM: 0.8, // the working strip between the cart and the lot's edge
  queueInsetM: [3.3, 3.9], // first and second customer, out in front of the counter
  queueAlongM: [0.3, -0.4],
  keepShare: 0.8, // not every pitch is taken on a given night
  minGapM: 3, // two carts' centres (at corners, where runs meet)
  maxStalls: 40,
});
const STREET_FOOD_TABLE_LAYOUT = Object.freeze({
  gridLocalM: [2, 6, 14, 18], // a 4 m grid within each tile, its 10 m centre lines left as aisles
  aisleLocalM: 10,
  minInsetM: 6, // clear of the carts' queues
  keepShare: 0.75,
  stoolOffsetM: 0.8, // a stool's centre from the 1 m table's centre
  maxTables: 24,
  walkerMinInsetM: 4.5,
  walkerTableClearM: 1.5,
});

/**
 * The open edges of a venue (where a tile has no venue neighbour), merged into straight runs.
 * Each run is a line at a fixed row (N/S, running along col) or col (W/E, running along row),
 * from..to in that axis, with `inward` the unit step back into the lot.
 * @returns {{side:'N'|'S'|'W'|'E', axis:'row'|'col', fixed:number, from:number, to:number, inward:number[]}[]}
 */
function getStreetFoodVenueEdgeRuns(venue) {
  const cells = new Set(venue.tiles.map(([r, c]) => `${r}:${c}`));
  const groups = new Map();
  const add = (side, fixed, start) => {
    const key = `${side}:${fixed}`;
    if (!groups.has(key)) groups.set(key, { side, fixed, starts: [] });
    groups.get(key).starts.push(start);
  };
  venue.tiles.forEach(([r, c]) => {
    if (!cells.has(`${r - 1}:${c}`)) add('N', r - 0.5, c - 0.5);
    if (!cells.has(`${r + 1}:${c}`)) add('S', r + 0.5, c - 0.5);
    if (!cells.has(`${r}:${c - 1}`)) add('W', c - 0.5, r - 0.5);
    if (!cells.has(`${r}:${c + 1}`)) add('E', c + 0.5, r - 0.5);
  });
  const INWARD = { N: [1, 0], S: [-1, 0], W: [0, 1], E: [0, -1] };
  const runs = [];
  [...groups.values()]
    .sort((a, b) => a.side.localeCompare(b.side) || a.fixed - b.fixed)
    .forEach(({ side, fixed, starts }) => {
      starts.sort((a, b) => a - b);
      let from = starts[0], to = starts[0] + 1;
      const flush = () => runs.push({ side, axis: side === 'N' || side === 'S' ? 'col' : 'row', fixed, from, to, inward: INWARD[side] });
      starts.slice(1).forEach((start) => {
        if (start === to) { to += 1; return; }
        flush(); from = start; to = start + 1;
      });
      flush();
    });
  return runs;
}

// A point on a run: `alongM` metres from the run's start, `insetM` metres into the lot.
function streetFoodRunPoint(run, alongM, insetM) {
  const along = run.from + alongM / STREET_FOOD_TILE_M;
  const across = run.fixed + (insetM / STREET_FOOD_TILE_M) * (run.axis === 'col' ? run.inward[0] : run.inward[1]);
  return run.axis === 'col' ? { row: across, col: along } : { row: along, col: across };
}

// Metres from a point to the nearest open edge of the venue.
function streetFoodEdgeDistanceM(runs, row, col) {
  let best = Infinity;
  runs.forEach((run) => {
    const [u, v] = run.axis === 'col' ? [col, row] : [row, col];
    const du = Math.max(run.from - u, 0, u - run.to);
    best = Math.min(best, Math.hypot(du, v - run.fixed));
  });
  return best * STREET_FOOD_TILE_M;
}

const streetFoodDistanceM = (a, b) => Math.hypot(a.row - b.row, a.col - b.col) * STREET_FOOD_TILE_M;

// Keeps a seeded `share` of `items` (at least one when any), at most `cap`, in their original order.
function streetFoodKeep(items, share, cap, seed, label) {
  if (!items.length) return [];
  const ranked = items.map((item, i) => ({ item, i, rank: sfHash(seed, label, i) }));
  const keepCount = Math.min(cap, Math.max(1, Math.round(items.length * share)));
  return ranked.sort((a, b) => a.rank - b.rank).slice(0, keepCount).sort((a, b) => a.i - b.i).map((x) => x.item);
}

/**
 * One venue's full layout at a moment: carts in a line along each open edge (their long side
 * along it, `alongAxis`), a hawker behind each and a short queue in front, round tables with four
 * folding stools on the interior grid with some diners seated, and passers-by on the aisles.
 * Pure given its inputs; the caller supplies the asset rosters so this module carries no art data.
 * @param {{id:string, tiles:number[][]}} venue
 * @param {{minuteOfDay:number, weather:object, seed?:string|number, carts:string[], hawkers:string[],
 *   queuers?:string[], diners:string[], passersby:string[], tableFurniture?:string[], stools?:string[]}} options
 */
function getStreetFoodVenueLayout(venue, options) {
  const {
    minuteOfDay, weather, seed = venue.id, carts, hawkers, queuers = [], diners, passersby,
    tableFurniture = [], stools = [],
  } = options;
  const schedule = getStreetFoodPhase(minuteOfDay);
  const weatherState = getStreetFoodWeatherState(weather);
  const presence = weatherState === 'closed' ? 0 : schedule.presence;
  const empty = { phase: schedule.phase, presence: 0, weatherState, stalls: [], tables: [], walkers: [], dinerShare: 0 };
  if (presence <= 0 || !carts?.length || !venue.tiles.length) return empty;

  const dinerShare = schedule.dinerShare * (STREET_FOOD_WEATHER_DINER_SHARE[weatherState] ?? 1);
  const crowdWindow = Math.floor((Number(minuteOfDay) || 0) / 20); // who is queuing/sitting reshuffles every 20 min
  const S = STREET_FOOD_STALL_LAYOUT, T = STREET_FOOD_TABLE_LAYOUT;
  const runs = getStreetFoodVenueEdgeRuns(venue);

  // stall pitches: evenly spaced and centred on each run, then a seeded share of them taken
  const pitches = [];
  runs.forEach((run) => {
    const lengthM = (run.to - run.from) * STREET_FOOD_TILE_M;
    const usable = lengthM - 2 * S.endMarginM;
    if (usable < 0) return;
    const count = Math.floor(usable / S.spacingM) + 1;
    const startM = (lengthM - (count - 1) * S.spacingM) / 2;
    for (let i = 0; i < count; i++) {
      const alongM = startM + i * S.spacingM;
      const point = streetFoodRunPoint(run, alongM, S.cartInsetM);
      if (pitches.some((p) => streetFoodDistanceM(p.point, point) < S.minGapM)) continue;
      pitches.push({ key: `${run.side}${run.fixed}:${Math.round(alongM * 10)}`, run, alongM, point });
    }
  });
  const stalls = streetFoodKeep(pitches, S.keepShare, S.maxStalls, seed, 'pitch').map((pitch, i) => {
    const { run, alongM, point } = pitch;
    const id = `${venue.id}|stall:${pitch.key}`;
    const queue = [];
    if (queuers.length && sfHash(seed, 'queue', pitch.key, crowdWindow) < dinerShare) {
      const queueCount = sfHash(seed, 'queue2', pitch.key, crowdWindow) < dinerShare * 0.5 ? 2 : 1;
      for (let q = 0; q < queueCount; q++) {
        queue.push({
          id: `${id}|queue${q}`,
          ...streetFoodRunPoint(run, alongM + S.queueAlongM[q], S.queueInsetM[q]),
          personId: sfPick(queuers, seed, 'queuer', pitch.key, q, crowdWindow),
        });
      }
    }
    return {
      id,
      row: point.row,
      col: point.col,
      alongAxis: run.axis,
      inward: run.inward,
      cartId: sfPick(carts, seed, 'cart', pitch.key),
      hawkerId: sfPick(hawkers, seed, 'hawker', pitch.key),
      hawker: streetFoodRunPoint(run, alongM, S.hawkerInsetM),
      queue,
      open: schedule.phase !== 'closing' || presence > 0.4,
    };
  });

  // tables: the interior 4 m grid, deep enough in to clear the queues, the tile centre lines left as aisles
  const spots = [];
  venue.tiles.forEach(([r, c]) => T.gridLocalM.forEach((ly) => T.gridLocalM.forEach((lx) => {
    const spot = { row: r - 0.5 + ly / STREET_FOOD_TILE_M, col: c - 0.5 + lx / STREET_FOOD_TILE_M, key: `${r}:${c}:${ly}:${lx}` };
    if (streetFoodEdgeDistanceM(runs, spot.row, spot.col) >= T.minInsetM) spots.push(spot);
  })));
  const tables = (tableFurniture.length ? streetFoodKeep(spots, T.keepShare, T.maxTables, seed, 'table') : []).map((spot) => {
    const id = `${venue.id}|table:${spot.key}`;
    const occupied = diners.length > 0 && sfHash(seed, 'seated', spot.key, crowdWindow) < dinerShare;
    // 1-3 of the 4 stools taken when it is in use - a full ring reads static, a gap reads real
    const seatedCount = occupied ? 1 + Math.floor(sfHash(seed, 'seatedCount', spot.key, crowdWindow) * 3) : 0;
    const firstSeat = Math.floor(sfHash(seed, 'firstSeat', spot.key, crowdWindow) * 4);
    const d = T.stoolOffsetM / STREET_FOOD_TILE_M;
    const stoolPoints = [[d, 0], [0, d], [-d, 0], [0, -d]];
    return {
      id,
      row: spot.row,
      col: spot.col,
      tableId: sfPick(tableFurniture, seed, 'table', spot.key),
      occupied,
      stools: stoolPoints.map(([dr, dc], s) => {
        const taken = ((s - firstSeat + 4) % 4) < seatedCount;
        return {
          id: `${id}|stool${s}`,
          row: spot.row + dr,
          col: spot.col + dc,
          // dr/dc point away from the table: a seated diner faces back toward it
          away: [Math.sign(dr), Math.sign(dc)],
          stoolId: stools.length ? sfPick(stools, seed, 'stool', spot.key, s) : null,
          seatedId: taken ? sfPick(diners, seed, 'seated', spot.key, s, crowdWindow) : null,
        };
      }),
    };
  });

  // passers-by drift along the aisles, re-placed every 10 min
  const aisleSpots = [];
  venue.tiles.forEach(([r, c]) => {
    for (let m = 0; m < STREET_FOOD_TILE_M; m += 2) {
      [{ row: r - 0.5 + T.aisleLocalM / STREET_FOOD_TILE_M, col: c - 0.5 + m / STREET_FOOD_TILE_M },
        { row: r - 0.5 + m / STREET_FOOD_TILE_M, col: c - 0.5 + T.aisleLocalM / STREET_FOOD_TILE_M }].forEach((spot) => {
        if (streetFoodEdgeDistanceM(runs, spot.row, spot.col) < T.walkerMinInsetM) return;
        if (tables.some((table) => streetFoodDistanceM(table, spot) < T.walkerTableClearM)) return;
        if (!aisleSpots.some((other) => streetFoodDistanceM(other, spot) < 0.5)) aisleSpots.push(spot);
      });
    }
  });
  const walkWindow = Math.floor((Number(minuteOfDay) || 0) / 10);
  const walkerCount = Math.min(aisleSpots.length, Math.round(Math.min(10, venue.tiles.length * 3) * dinerShare));
  const walkers = passersby?.length && walkerCount ? streetFoodKeep(aisleSpots, 1, walkerCount, seed, `walk${walkWindow}`)
    .map((spot, i) => ({ id: `${venue.id}|walker${i}`, row: spot.row, col: spot.col, personId: sfPick(passersby, seed, 'walker', i, walkWindow) })) : [];

  return { phase: schedule.phase, presence, weatherState, stalls, tables, walkers, dinerShare };
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  sfHash, sfPick,
  STREET_FOOD_SCHEDULE, streetFoodWrapMinute, getStreetFoodPhase,
  getStreetFoodWeatherState, STREET_FOOD_WEATHER_DINER_SHARE,
  getStreetFoodVenues, STREET_FOOD_STALL_LAYOUT, STREET_FOOD_TABLE_LAYOUT,
  getStreetFoodVenueEdgeRuns, streetFoodEdgeDistanceM, getStreetFoodVenueLayout,
};
