// 避風塘船隊 (Phase 3): the boats of an operational shelter - where each one lies, and its day out
// fishing: away before dawn, home by evening, kept in by bad weather (the storm's times come from
// typhoon-shelter-storm.js).
//
// Everything a boat does is derived from the clock: its departure and return times are seeded per
// boat and per sky-day (one day-night cycle; in this game that is also one calendar month), and
// its position at any moment follows from those and its route. So the save holds only the boats
// (model, berth, a storm-damaged boat's repairUntil) and the storm's times; a save made mid-voyage
// loads mid-voyage, and nothing is re-rolled.
//
// The pure parts (berths, routes, schedule) run under node for tests; the drawing at the bottom
// only runs in the game, called every frame from main.js and once a calendar day from
// typhoon-shelter-planning.js.

const TYPHOON_SHELTER_FLEET = Object.freeze({
  // the fleet's make-up; fishing boats go out, house boats and sampans stay at their berths
  models: Object.freeze([
    // trip: how it fishes (TYPHOON_SHELTER_FLEET.trips) - read off the art: boat 1 hangs lamps
    // (燈光漁船), boat 3 has a net winch (刺網), boat 4 a stern gantry and net drum (拖網)
    Object.freeze({ objectId: 'fishingBoat1', weight: 20, fishing: true, size: 2, trip: 'light' }),
    Object.freeze({ objectId: 'fishingBoat3', weight: 25, fishing: true, size: 2, trip: 'gillnet' }),
    Object.freeze({ objectId: 'fishingBoat4', weight: 25, fishing: true, size: 2, trip: 'trawler' }),
    Object.freeze({ objectId: 'homeBoat1', weight: 8, fishing: false, size: 2 }),
    Object.freeze({ objectId: 'homeBoat2', weight: 7, fishing: false, size: 2 }),
    Object.freeze({ objectId: 'sanpan1', weight: 5, fishing: false, size: 1 }),
    Object.freeze({ objectId: 'sanpan3', weight: 5, fishing: false, size: 1 }),
    Object.freeze({ objectId: 'sanpan5', weight: 5, fishing: false, size: 1 }),
  ]),
  // Hong Kong's fishing boats work the night: out in the late afternoon and evening, alongside
  // again at 03:00-05:00 to land the catch for the wholesale market (香港仔魚類批發市場 opens at
  // 04:00, its trucks queue from 03:00). A trip day runs from 06:00 to 06:00 - the sky-day, which
  // is also the calendar month (game-clock.js) - so one night's trip falls in one month. Times are
  // sky minutes from the trip day's midnight: 27 * 60 is 03:00 the next morning.
  dayStart: 6 * 60,
  trips: Object.freeze({
    light: Object.freeze({ departFrom: 17 * 60, departSpan: 2 * 60, restShare: 0.1 }),
    gillnet: Object.freeze({ departFrom: 17 * 60, departSpan: 2 * 60, restShare: 0.25 }),
    // 休漁期: the South China Sea moratorium (from 1 May to mid-August) keeps the trawlers in
    trawler: Object.freeze({ departFrom: 15 * 60, departSpan: 2 * 60, restShare: 0, moratoriumMonths: Object.freeze([5, 6, 7, 8]) }),
  }),
  arriveFrom: 27 * 60,         // alongside at the berth, catch landed
  arriveSpan: 2 * 60,
  speedTilesPerMinute: 0.5,    // ~1.5 tiles a second on screen at 1x
  offshoreTiles: 30,           // how far out a boat is still drawn before it is "at the grounds"
  catchTonnesPerTrip: 1.5,
  arrivalsPerDayShare: 5,      // a new shelter fills in about this many calendar days
  standbyTurnBackMin: 120,     // 一號: a boat out turns for home within this many minutes
  resumeStaggerMin: 10,        // after a storm: one boat sails this many minutes after the last
});
const TYPHOON_SHELTER_MINUTES_PER_DAY = 24 * 60;

// The fleet keeps sky-clock time counted from a midnight. Environment minute 0 is the sky-day's
// 06:00 start, so the schedule's 04:00 departures would otherwise land at 10:00.
function getTyphoonShelterFleetClock() {
  const env = typeof getEnvironmentMinutes === 'function' ? getEnvironmentMinutes() : 0;
  return env + (typeof GAME_DAY_START_MINUTES === 'number' ? GAME_DAY_START_MINUTES : 6 * 60);
}

const TF_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const tfKey = (r, c) => `${r}:${c}`;
const tfParse = (k) => k.split(':').map(Number);

function tfHash(...parts) {
  let h = 0x811c9dc5;
  parts.forEach((p) => {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  });
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// berths and routes
// ---------------------------------------------------------------------------

// Tiles boats cannot lie on or pass through: piers, walkways, landing stages, buoys.
const TYPHOON_SHELTER_BOAT_BLOCKERS = Object.freeze(['pier', 'floatingPier', 'pontoon', 'mooringBuoy', 'navBuoyRed', 'navBuoyGreen']);

function typhoonShelterBlockedTiles(worksItems = []) {
  return new Set(worksItems.filter((i) => TYPHOON_SHELTER_BOAT_BLOCKERS.includes(i.kind)).map((i) => tfKey(i.row, i.col)));
}

// The berths (see planTyphoonShelterMooring).
function computeTyphoonShelterBerths(analysis, worksItems = []) {
  return planTyphoonShelterMooring(analysis, worksItems).slots;
}

/**
 * Routes out: along the lanes from every lane tile to the nearest entrance, and from each entrance
 * a run straight out to sea down the distance-to-the-map-edge gradient, clear of the shelter's own
 * works (its breakwater, its entrance buoys).
 * @param {(r, c) => boolean} isSea open sea a boat may cross (not land, not any shelter's works)
 */
function planTyphoonShelterRoutes(analysis, worksItems, isSea, { offshoreTiles = TYPHOON_SHELTER_FLEET.offshoreTiles, width, height, lanes = null } = {}) {
  const laneSet = lanes || planTyphoonShelterMooring(analysis, worksItems).lanes;
  const blocked = typhoonShelterBlockedTiles(worksItems);
  const openSea = (r, c) => isSea(r, c) && !blocked.has(tfKey(r, c));
  const parent = new Map();
  const depth = new Map();
  const exitOf = new Map();
  const queue = [];
  analysis.entrances.filter((e) => e.status === 'ok').forEach((e, i) => {
    e.tiles.forEach((k) => { parent.set(k, null); depth.set(k, 0); exitOf.set(k, i); queue.push(k); });
  });
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    const [r, c] = tfParse(k);
    Object.values(TF_DIRS).forEach(([dr, dc]) => {
      const n = tfKey(r + dr, c + dc);
      if (parent.has(n) || !laneSet.has(n)) return;
      parent.set(n, k);
      depth.set(n, depth.get(k) + 1);
      exitOf.set(n, exitOf.get(k));
      queue.push(n);
    });
  }
  // sea run from each entrance: away from the shelter, toward the nearest map edge
  const seaRuns = analysis.entrances.filter((e) => e.status === 'ok').map((e) => {
    const out = TF_DIRS[e.side];
    const mid = tfParse(e.tiles[Math.floor(e.tiles.length / 2)]);
    const run = [];
    let [r, c] = [mid[0] + out[0], mid[1] + out[1]];
    const seen = new Set();
    const edgeDist = (rr, cc) => Math.min(rr, cc, (height ?? Infinity) - 1 - rr, (width ?? Infinity) - 1 - cc);
    for (let i = 0; i < offshoreTiles && openSea(r, c) && !seen.has(tfKey(r, c)); i++) {
      run.push([r, c]);
      seen.add(tfKey(r, c));
      // keep heading out; bend toward the nearer map edge when the way ahead is blocked
      const options = Object.values(TF_DIRS)
        .map(([dr, dc]) => [r + dr, c + dc, dr, dc])
        .filter(([nr, nc]) => openSea(nr, nc) && !seen.has(tfKey(nr, nc)) && !analysis.basin.has(tfKey(nr, nc)));
      if (!options.length) break;
      options.sort((x, y) => (y[2] === out[0] && y[3] === out[1]) - (x[2] === out[0] && x[3] === out[1])
        || edgeDist(x[0], x[1]) - edgeDist(y[0], y[1]));
      [r, c] = options[0];
    }
    return run;
  });
  return { parent, depth, exitOf, seaRuns };
}

// A berth's way out: off the berth onto the lane beside it nearest an entrance, along the lanes,
// out through the entrance and away to sea.
function typhoonShelterRouteFor(routes, slot) {
  const access = (slot.access || slot.tiles).filter((k) => routes.parent.has(k))
    .sort((x, y) => routes.depth.get(x) - routes.depth.get(y) || x.localeCompare(y))[0];
  if (!access) return null;
  const path = [slot.centre];
  for (let k = access; k !== null && k !== undefined; k = routes.parent.get(k)) path.push(tfParse(k));
  const run = routes.seaRuns[routes.exitOf.get(access)] || [];
  return path.concat(run);
}

function typhoonShelterRouteLength(route) {
  let len = 0;
  for (let i = 1; i < route.length; i++) len += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  return len;
}

// Where along a route a boat is after `distance` tiles: { r, c, dir } (dir: logical heading).
function typhoonShelterPointAlong(route, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < route.length; i++) {
    const [r0, c0] = route[i - 1];
    const [r1, c1] = route[i];
    const seg = Math.hypot(r1 - r0, c1 - c0);
    if (left <= seg || i === route.length - 1) {
      const t = seg ? Math.min(1, left / seg) : 0;
      const dr = r1 - r0;
      const dc = c1 - c0;
      const dir = Math.abs(dr) >= Math.abs(dc) ? (dr >= 0 ? 's' : 'n') : (dc >= 0 ? 'e' : 'w');
      return { r: r0 + dr * t, c: c0 + dc * t, dir };
    }
    left -= seg;
  }
  const [r, c] = route[route.length - 1] || [0, 0];
  return { r, c, dir: 'e' };
}

// ---------------------------------------------------------------------------
// fleet and schedule
// ---------------------------------------------------------------------------

function createTyphoonShelterFleet() {
  return { nextId: 1, boats: [] };
}

// A model with all its art switched off in calibration is not used (no view left to draw).
function isTyphoonShelterBoatModelAvailable(objectId) {
  if (typeof getTyphoonShelterFacingOverrides !== 'function' || typeof getTyphoonShelterObjectTextures !== 'function') return true;
  return getTyphoonShelterObjectTextures(objectId, getTyphoonShelterFacingOverrides()).length > 0;
}

function pickTyphoonShelterBoatModel(seed, id, size) {
  const models = TYPHOON_SHELTER_FLEET.models.filter((m) => m.size <= size && isTyphoonShelterBoatModelAvailable(m.objectId));
  if (!models.length) return null;
  const total = models.reduce((s, m) => s + m.weight, 0);
  let x = tfHash(seed, 'model', id) * total;
  for (const m of models) { x -= m.weight; if (x < 0) return m; }
  return models[models.length - 1];
}

/**
 * Bring a fleet toward `target` boats on `slots`: boats on berths that are gone move to free ones
 * (or leave), the fleet grows by up to `arrivals` boats, and shrinks (berth-side boats first) when
 * the target drops. Returns a new fleet.
 */
function reconcileTyphoonShelterFleet(fleet, slots, target, { seed = 0, arrivals = Infinity } = {}) {
  const bySlot = new Map(slots.map((s) => [s.key, s]));
  const taken = new Set();
  const boats = [];
  (fleet.boats || []).forEach((b) => {
    const slot = bySlot.get(b.slot);
    const model = TYPHOON_SHELTER_FLEET.models.find((m) => m.objectId === b.model && isTyphoonShelterBoatModelAvailable(m.objectId));
    if (slot && model && model.size <= slot.size && !taken.has(slot.key)) { taken.add(slot.key); boats.push(b); return; }
    const free = slots.find((s) => !taken.has(s.key) && model && model.size <= s.size);
    if (free) { taken.add(free.key); boats.push({ ...b, slot: free.key }); }
  });
  while (boats.length > target) boats.pop();
  let nextId = fleet.nextId || 1;
  let added = 0;
  for (const slot of slots) {
    if (boats.length >= target || added >= arrivals) break;
    if (taken.has(slot.key)) continue;
    const model = pickTyphoonShelterBoatModel(seed, nextId, slot.size);
    if (!model) continue;
    boats.push({ id: nextId, model: model.objectId, slot: slot.key });
    taken.add(slot.key);
    nextId += 1;
    added += 1;
  }
  return { ...fleet, nextId, boats };
}

/**
 * Today's sailing order for a shelter's fishing boats: Map boatId -> { depart, back } (minutes of
 * the sky-day). Out in the morning the boats nearest the entrance go first, so no boat ever comes up
 * behind a slower start on its lane; home in the evening the boats going furthest in come first, so
 * none waits behind a boat turning into its berth. The window is shared out evenly - with all at one
 * speed, boats on a common lane stay that many minutes apart - with a little play each day.
 */
function typhoonShelterFleetSchedule(plan, routeLengthOf, day, { moratorium = false } = {}) {
  const F = TYPHOON_SHELTER_FLEET;
  const boats = (plan.fleet?.boats || []).filter((b) => isTyphoonShelterFishingModel(b.model));
  const len = (b) => routeLengthOf(b) || 0;
  const n = Math.max(1, boats.length);
  const slot = (i, count, from, span, salt, b) => from + ((i + 0.5 + (tfHash(plan.seed, salt, b.id, day) - 0.5) * 0.3) / Math.max(1, count)) * span;
  const times = new Map(boats.map((b) => [b.id, {}]));
  // out by kind, each in its own window, nearest the entrance first
  const byTrip = new Map();
  boats.forEach((b) => {
    const trip = getTyphoonShelterBoatTrip(b.model);
    if (!byTrip.has(trip)) byTrip.set(trip, []);
    byTrip.get(trip).push(b);
  });
  byTrip.forEach((list, trip) => {
    const t = F.trips[trip];
    [...list].sort((x, y) => len(x) - len(y) || x.id - y.id).forEach((b, i) => {
      Object.assign(times.get(b.id), {
        depart: slot(i, list.length, t.departFrom, t.departSpan, 'out', b),
        // a night off, or the trawlers' 休漁期
        rest: (moratorium && !!t.moratoriumMonths) || tfHash(plan.seed, 'rest', b.id, day) < t.restShare,
      });
    });
  });
  // the far half stay in under 一號 (typhoon-shelter-storm.js); after a storm they sail one by one,
  // nearest the entrance first
  const out = [...boats].sort((x, y) => len(x) - len(y) || x.id - y.id);
  const median = out.length ? len(out[Math.floor((out.length - 1) / 2)]) : 0;
  out.forEach((b, i) => Object.assign(times.get(b.id), { resumeOffset: i * F.resumeStaggerMin, longRoute: len(b) > median }));
  // home before dawn, the boats going furthest in first, so none waits behind one turning in
  [...boats].sort((x, y) => len(y) - len(x) || x.id - y.id)
    .forEach((b, i) => { times.get(b.id).arrive = slot(i, n, F.arriveFrom, F.arriveSpan, 'in', b); });
  return times;
}

// The day's schedule, worked out once per shelter, day, fleet and layout (the boats ask every frame).
const typhoonShelterScheduleCache = new Map();

function getTyphoonShelterFleetScheduleCached(plan, geometry, day, moratorium = isTyphoonShelterMoratoriumDay(day)) {
  const boats = plan.fleet?.boats || [];
  const key = `${day}|${moratorium}|${geometry.key}|${boats.map((b) => `${b.id}:${b.slot}:${b.model}`).join(',')}`;
  const hit = typhoonShelterScheduleCache.get(plan.id);
  if (hit && hit.key === key) return hit.times;
  const times = typhoonShelterFleetSchedule(plan, (b) => geometry.routeBySlot.get(b.slot)?.length, day, { moratorium });
  typhoonShelterScheduleCache.set(plan.id, { key, times });
  return times;
}

// The trip day a moment belongs to: from 06:00 to 06:00, the sky-day and calendar month.
function getTyphoonShelterTripDay(t) {
  return Math.floor((t - TYPHOON_SHELTER_FLEET.dayStart) / TYPHOON_SHELTER_MINUTES_PER_DAY);
}

function getTyphoonShelterBoatTrip(objectId) {
  return TYPHOON_SHELTER_FLEET.models.find((m) => m.objectId === objectId)?.trip || 'gillnet';
}

// Whether trip day `day` falls in the trawlers' 休漁期: the month that day is (the calendar rolls
// over with the trip day at 06:00, so it is this month, counted back or on from today).
function isTyphoonShelterMoratoriumDay(day) {
  if (typeof city === 'undefined' || !Number.isFinite(Number(city.month))) return false;
  const today = getTyphoonShelterTripDay(getTyphoonShelterFleetClock());
  const month = ((((Number(city.month) - 1 - (today - day)) % 12) + 12) % 12) + 1;
  return TYPHOON_SHELTER_FLEET.trips.trawler.moratoriumMonths.includes(month);
}

// One boat's own times, for a boat outside a schedule: sky minutes from its trip day's midnight.
function typhoonShelterBoatTimes(seed, boatId, day, objectId = 'fishingBoat3') {
  const F = TYPHOON_SHELTER_FLEET;
  const t = F.trips[getTyphoonShelterBoatTrip(objectId)];
  return {
    depart: t.departFrom + tfHash(seed, 'out', boatId, day) * t.departSpan,
    arrive: F.arriveFrom + tfHash(seed, 'in', boatId, day) * F.arriveSpan,
    resumeOffset: 0,
    longRoute: false,
    rest: false,
  };
}

/**
 * A boat's trip on trip day `day`, in fleet-clock minutes: { departAbs, backAbs, scheduledBackAbs,
 * arriveAbs } - backAbs being when it turns for home (worked back from its arrival so it is
 * alongside on time) - or null when it stays in: a night off, laid up for repairs, or held by the
 * storm. `storm` (typhoon-shelter-storm.js) holds the intervals:
 *   holds     no one sails from `from` until `until` (+ the boat's place in the line); a boat out
 *             when one starts turns for home at once
 *   standbys  一號: the far boats (longRoute) do not sail; a boat out turns for home within
 *             standbyTurnBackMin
 */
function typhoonShelterBoatTrip(boat, day, { seed = 0, storm = null, times = null, routeLength = 0 } = {}) {
  const F = TYPHOON_SHELTER_FLEET;
  const t = times || typhoonShelterBoatTimes(seed, boat.id, day, boat.model);
  if (t.rest) return null;
  const dayStart = day * TYPHOON_SHELTER_MINUTES_PER_DAY;
  const departAbs = dayStart + t.depart;
  const travel = Math.max(0, routeLength) / F.speedTilesPerMinute;
  // turn for home in time to be alongside at its hour (but not before it has reached the grounds)
  const scheduledBackAbs = Math.max(departAbs + travel, dayStart + t.arrive - travel);
  let backAbs = scheduledBackAbs;
  if (Number(boat.repairUntil) > departAbs) return null;
  for (const h of storm?.holds || []) {
    const until = h.until == null ? Infinity : h.until + (t.resumeOffset || 0);
    if (departAbs >= h.from && departAbs < until) return null;
    if (h.from > departAbs && h.from < backAbs) backAbs = h.from;
  }
  for (const w of storm?.standbys || []) {
    const until = w.until == null ? Infinity : w.until;
    if (t.longRoute && departAbs >= w.from && departAbs < until) return null;
    const turn = Math.max(departAbs, w.from) + F.standbyTurnBackMin;
    if (w.from < backAbs && departAbs < until && turn < backAbs) backAbs = turn;
  }
  const reached = Math.min(Math.max(0, routeLength), (backAbs - departAbs) * F.speedTilesPerMinute);
  return { departAbs, backAbs, scheduledBackAbs, arriveAbs: backAbs + reached / F.speedTilesPerMinute };
}

/**
 * Where a boat is at environment time `env`: { mode, distance } - mode 'moored' | 'out' (leaving)
 * | 'away' (at the fishing grounds, not drawn) | 'in' (coming home); distance in tiles along its
 * route from the berth. `storm` keeps it in or turns it back (typhoonShelterBoatTrip).
 */
function typhoonShelterBoatState(boat, routeLength, env, { seed = 0, storm = null, fishing = true, times = null } = {}) {
  if (!fishing || !(routeLength > 0)) return { mode: 'moored', distance: 0 };
  const day = getTyphoonShelterTripDay(env);
  const trip = typhoonShelterBoatTrip(boat, day, { seed, storm, times, routeLength });
  if (!trip || env < trip.departAbs) return { mode: 'moored', distance: 0 };
  const speed = TYPHOON_SHELTER_FLEET.speedTilesPerMinute;
  const { departAbs, backAbs } = trip;
  // turned for home: back the way it went
  if (env >= backAbs) {
    const reached = Math.min(routeLength, (backAbs - departAbs) * speed);
    const homeward = (env - backAbs) * speed;
    if (homeward >= reached) return { mode: 'moored', distance: 0 };
    return { mode: 'in', distance: reached - homeward };
  }
  const outFor = env - departAbs;
  if (outFor * speed < routeLength) return { mode: 'out', distance: outFor * speed };
  return { mode: 'away', distance: routeLength };
}

function isTyphoonShelterFishingModel(objectId) {
  return !!TYPHOON_SHELTER_FLEET.models.find((m) => m.objectId === objectId)?.fishing;
}

function normalizeTyphoonShelterFleet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const models = TYPHOON_SHELTER_FLEET.models.map((m) => m.objectId);
  const boats = (Array.isArray(raw.boats) ? raw.boats : [])
    .filter((b) => Number.isInteger(b?.id) && models.includes(b.model) && typeof b.slot === 'string')
    .slice(0, 500)
    .map((b) => ({ id: b.id, model: b.model, slot: b.slot.slice(0, 16), ...(Number.isFinite(b.repairUntil) ? { repairUntil: b.repairUntil } : {}) }));
  // (a Phase 3 save's one-day `hold` is dropped: the storm's times now live in the storm record)
  return { nextId: Math.max(Number(raw.nextId) || 1, ...boats.map((b) => b.id + 1), 1), boats };
}

// ---------------------------------------------------------------------------
// game side: weather, daily growth, drawing
// ---------------------------------------------------------------------------

// Boats stay in from Signal No. 3 and under the black rainstorm warning.
function isTyphoonShelterFishingWeatherBad(weather = typeof city !== 'undefined' ? city.weather : null) {
  if (!weather) return false;
  return ['signal3', 'signal8', 'signal9', 'signal10'].includes(weather.typhoonStage) || weather.rainWarning === 'black';
}

const typhoonShelterFleetCache = new Map(); // shelter id -> { key, slots, routes, lengths }

function getTyphoonShelterFleetGeometry(plan, analysis) {
  const items = plan.works?.items || [];
  // logical tiles only: rotation does not move berths or routes
  const key = `${plan.basin}|${JSON.stringify(plan.entrances)}|${items.length}`;
  const cached = typhoonShelterFleetCache.get(plan.id);
  if (cached && cached.key === key) return cached;
  const mooring = planTyphoonShelterMooring(analysis, items);
  const slots = mooring.slots;
  const taken = new Set();
  if (typeof getTyphoonShelterAnalyses === 'function') {
    getTyphoonShelterAnalyses().forEach((a) => { a.basin.forEach((k) => taken.add(k)); a.ring.forEach((k) => taken.add(k)); });
  }
  analysis.entrances.forEach((e) => e.tiles.forEach((k) => taken.delete(k)));
  const isSea = (r, c) => isInsideMap(r, c) && mapData[r][c] === WATER
    && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c)) && !taken.has(`${r}:${c}`);
  const routes = planTyphoonShelterRoutes(analysis, items, isSea, { width: MAP_WIDTH, height: MAP_HEIGHT, lanes: mooring.lanes });
  const routeBySlot = new Map(slots.map((s) => {
    const route = typhoonShelterRouteFor(routes, s);
    return [s.key, route ? { route, length: typhoonShelterRouteLength(route) } : null];
  }));
  const geometry = { key, slots, routes, routeBySlot };
  typhoonShelterFleetCache.set(plan.id, geometry);
  return geometry;
}

// Once a calendar day: operational shelters gain boats toward their berths - not while a storm
// keeps the boats in or visitors still lie on the free berths (typhoon-shelter-storm.js).
function updateTyphoonShelterFleets(state, analyses, summaries) {
  if (typeof isTyphoonShelterStormFreeze === 'function' && isTyphoonShelterStormFreeze(state.storm)) return null;
  let changed = false;
  const shelters = state.shelters.map((plan) => {
    const summary = summaries.get(plan.id);
    const analysis = analyses.get(plan.id);
    if (!analysis || !plan.works?.approved) return plan;
    const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
    const slots = geometry.slots.filter((s) => geometry.routeBySlot.get(s.key));
    // the reserved berths stay free for boats sheltering from a storm (typhoon-shelter-storm.js):
    // the summary's berth count is an estimate (mooring water / 3), the berths laid out can be fewer
    const target = summary?.operational
      ? Math.max(0, Math.min(summary.berths.daily, slots.length - summary.berths.reserved)) : 0;
    const fleet = plan.fleet || createTyphoonShelterFleet();
    const arrivals = Math.max(1, Math.ceil(target / TYPHOON_SHELTER_FLEET.arrivalsPerDayShare));
    const next = reconcileTyphoonShelterFleet(fleet, slots, target, { seed: plan.seed, arrivals });
    if (JSON.stringify(next.boats) === JSON.stringify(fleet.boats) && plan.fleet) return plan;
    changed = true;
    return { ...plan, fleet: next };
  });
  return changed ? shelters : null;
}

// Counts for the panel: { boats, fishing, out, away, home, moored, repairing, held, moratorium,
// tripsToday, catchToday } - the trips and catch of the latest night: tonight's once the first
// boats are out (15:00), last night's before. `storm`: the city's storm record
// (typhoon-shelter-storm.js).
function summarizeTyphoonShelterFleet(plan, analysis, env = getTyphoonShelterFleetClock(), storm = typeof getTyphoonShelterStorm === 'function' ? getTyphoonShelterStorm() : null) {
  const fleet = plan.fleet;
  const out = { boats: 0, fishing: 0, out: 0, away: 0, home: 0, moored: 0, repairing: 0, held: false, moratorium: false, tripsToday: 0, catchToday: 0 };
  if (!fleet || !analysis) return out;
  const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
  const day = getTyphoonShelterTripDay(env);
  out.held = !!(storm?.holds || []).find((h) => h.until == null);
  out.moratorium = isTyphoonShelterMoratoriumDay(day);
  const schedule = getTyphoonShelterFleetScheduleCached(plan, geometry, day, out.moratorium);
  const firstOut = Math.min(...Object.values(TYPHOON_SHELTER_FLEET.trips).map((t) => t.departFrom));
  const catchDay = env < day * TYPHOON_SHELTER_MINUTES_PER_DAY + firstOut ? day - 1 : day;
  const catchSchedule = catchDay === day ? schedule
    : typhoonShelterFleetSchedule(plan, (b) => geometry.routeBySlot.get(b.slot)?.length, catchDay, { moratorium: isTyphoonShelterMoratoriumDay(catchDay) });
  let catchTonnes = 0;
  fleet.boats.forEach((b) => {
    out.boats += 1;
    const fishing = isTyphoonShelterFishingModel(b.model);
    if (fishing) out.fishing += 1;
    const rl = geometry.routeBySlot.get(b.slot)?.length || 0;
    const st = typhoonShelterBoatState(b, rl, env, { seed: plan.seed, storm, fishing, times: schedule.get(b.id) });
    if (Number(b.repairUntil) > env) out.repairing += 1;
    // (a boat still inbound from last night, past 06:00, is counted moored: arrivals end by 05:00)
    if (st.mode === 'out') out.out += 1;
    else if (st.mode === 'away') out.away += 1;
    else if (st.mode === 'in') out.home += 1;
    else out.moored += 1;
    if (fishing) {
      const trip = typhoonShelterBoatTrip(b, catchDay, { seed: plan.seed, storm, times: catchSchedule.get(b.id), routeLength: rl });
      if (trip && trip.departAbs < env) {
        out.tripsToday += 1;
        // the catch is for time on the grounds: a boat turned back by the weather lands less
        const atGrounds = trip.departAbs + rl / TYPHOON_SHELTER_FLEET.speedTilesPerMinute;
        const fished = Math.max(0, trip.backAbs - atGrounds) / Math.max(1, trip.scheduledBackAbs - atGrounds);
        catchTonnes += Math.min(1, fished) * TYPHOON_SHELTER_FLEET.catchTonnesPerTrip;
      }
    }
  });
  out.catchToday = Math.round(catchTonnes * 10) / 10;
  return out;
}

/**
 * The night's landings for one shelter: [{ at, tonnes }] sorted by time - each fishing boat that
 * sailed on trip day `day`, when it comes alongside and what it brings (a boat turned back by the
 * weather lands only what it caught). For the 魚檔 (typhoon-shelter-market.js).
 */
function typhoonShelterNightLandings(plan, geometry, day, { storm = null, moratorium = false } = {}) {
  const F = TYPHOON_SHELTER_FLEET;
  const schedule = typhoonShelterFleetSchedule(plan, (b) => geometry.routeBySlot.get(b.slot)?.length, day, { moratorium });
  const out = [];
  (plan.fleet?.boats || []).forEach((b) => {
    if (!isTyphoonShelterFishingModel(b.model)) return;
    const rl = geometry.routeBySlot.get(b.slot)?.length || 0;
    if (!(rl > 0)) return;
    const trip = typhoonShelterBoatTrip(b, day, { seed: plan.seed, storm, times: schedule.get(b.id), routeLength: rl });
    if (!trip) return;
    const atGrounds = trip.departAbs + rl / F.speedTilesPerMinute;
    const fished = Math.min(1, Math.max(0, trip.backAbs - atGrounds) / Math.max(1, trip.scheduledBackAbs - atGrounds));
    out.push({ at: trip.arriveAbs, tonnes: fished * F.catchTonnesPerTrip, boat: b.id });
  });
  return out.sort((a, b) => a.at - b.at);
}

// Every frame: place each visible boat.
function updateTyphoonShelterBoats(scene) {
  if (!scene || typeof getTyphoonShelterState !== 'function') return;
  const state = getTyphoonShelterState();
  if (!scene.typhoonShelterBoats) scene.typhoonShelterBoats = new Map();
  const live = new Set();
  const env = getTyphoonShelterFleetClock();
  const storm = state.storm || null;
  const visitorsOf = new Map();
  (storm?.visitors || []).forEach((v) => { if (!visitorsOf.has(v.shelterId)) visitorsOf.set(v.shelterId, []); visitorsOf.get(v.shelterId).push(v); });
  const shelters = state.shelters.filter((p) => p.fleet?.boats?.length || visitorsOf.has(p.id));
  if (!shelters.length && !scene.typhoonShelterBoats.size) return;
  const analyses = getTyphoonShelterAnalyses();
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const facings = typeof getTyphoonShelterFacingOverrides === 'function' ? getTyphoonShelterFacingOverrides() : {};
  shelters.forEach((plan) => {
    const analysis = analyses.get(plan.id);
    if (!analysis) return;
    const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
    const slotByKey = new Map(geometry.slots.map((s) => [s.key, s]));
    const schedule = getTyphoonShelterFleetScheduleCached(plan, geometry, getTyphoonShelterTripDay(env));
    const mooredAt = (slot, seedId) => {
      // lie along the berth, bow chosen per boat
      const flip = tfHash(plan.seed, 'bow', seedId) < 0.5;
      const dir = slot.axis === 'e' ? (flip ? 'e' : 'w') : (flip ? 's' : 'n');
      return { r: slot.centre[0], c: slot.centre[1], dir };
    };
    const along = (route, mode, distance) => {
      const point = typhoonShelterPointAlong(route, distance);
      if (mode === 'in') point.dir = { n: 's', s: 'n', e: 'w', w: 'e' }[point.dir];
      return point;
    };
    (plan.fleet?.boats || []).forEach((boat) => {
      const slot = slotByKey.get(boat.slot);
      const r = geometry.routeBySlot.get(boat.slot);
      if (!slot || !r) return;
      const fishing = isTyphoonShelterFishingModel(boat.model);
      const st = typhoonShelterBoatState(boat, r.length, env, { seed: plan.seed, storm, fishing, times: schedule.get(boat.id) });
      const id = `${plan.id}|${boat.id}`;
      if (st.mode === 'away') return;
      live.add(id);
      const point = st.mode === 'moored' ? mooredAt(slot, boat.id) : along(r.route, st.mode, st.distance);
      drawTyphoonShelterBoat(scene, id, boat.model, point, rotation, facings);
    });
    // 外來避風船: in from the sea along a berth's route, out again after the storm
    (visitorsOf.get(plan.id) || []).forEach((v) => {
      const slot = slotByKey.get(v.slot);
      const r = geometry.routeBySlot.get(v.slot);
      if (!slot || !r || typeof typhoonShelterVisitorState !== 'function') return;
      const st = typhoonShelterVisitorState(v, r.length, env);
      if (st.mode === 'away' || st.mode === 'gone') return;
      const id = `${plan.id}|v${v.id}`;
      live.add(id);
      const point = st.mode === 'moored' ? mooredAt(slot, `v${v.id}`) : along(r.route, st.mode, st.distance);
      drawTyphoonShelterBoat(scene, id, v.model, point, rotation, facings);
    });
  });
  scene.typhoonShelterBoats.forEach((rec, id) => {
    if (!live.has(id)) { rec.sprite?.destroy(); scene.typhoonShelterBoats.delete(id); }
  });
  // the shelter panel's fleet counts move with the boats: refresh it about once a second
  const now = Date.now();
  if (now - (scene.typhoonShelterPanelRefreshedAt || 0) > 1000 && typeof renderTyphoonShelterPanel === 'function'
    && typeof typhoonShelterDom !== 'undefined' && typhoonShelterDom && !typhoonShelterDom.panel.hidden) {
    scene.typhoonShelterPanelRefreshedAt = now;
    renderTyphoonShelterPanel();
  }
}

const typhoonShelterBoatTexturesRequested = new Set();

function drawTyphoonShelterBoat(scene, id, objectId, point, rotation, facings) {
  const screenFacing = getTyphoonShelterScreenFacing(point.dir, rotation);
  const choice = pickTyphoonShelterTexture(objectId, screenFacing, { facings });
  if (!choice) {
    // its art was switched off in calibration: gone at once, replaced at the next daily update
    scene.typhoonShelterBoats.get(id)?.sprite?.setVisible(false);
    return;
  }
  const key = resolveTyphoonShelterTextureKey(scene, choice);
  if (!scene.textures.exists(key)) {
    if (!typhoonShelterBoatTexturesRequested.has(objectId)) {
      typhoonShelterBoatTexturesRequested.add(objectId);
      loadTyphoonShelterTextures(scene, getTyphoonShelterObjectTextures(objectId, facings).map((t) => t.texture));
    }
    return;
  }
  let rec = scene.typhoonShelterBoats.get(id);
  if (!rec) {
    rec = { sprite: scene.add.image(0, 0, key), key: null };
    // under the world mask, as the shelter's works are (see maskTyphoonShelterSprite)
    if (typeof maskTyphoonShelterSprite === 'function') maskTyphoonShelterSprite(scene, rec.sprite);
    scene.typhoonShelterBoats.set(id, rec);
  }
  const sprite = rec.sprite;
  // the fit is re-read when the texture, its warp or the calibration changes
  const stamp = `${key}|${scene.textures.get(key).typhoonShelterWarp?.version || 0}|${getTyphoonShelterPlacementRevision()}`;
  if (rec.key !== stamp) {
    sprite.setTexture(key);
    rec.key = stamp;
    const texture = typeof getTyphoonShelterTextureSize === 'function'
      ? getTyphoonShelterTextureSize(scene, key) : scene.textures.get(key).getSourceImage();
    const ground = getTyphoonShelterSpriteGround(scene, choice, key);
    const size = getTyphoonShelterObjectSize(objectId);
    const art = ground && measureTyphoonShelterArt(ground, size, ground.top);
    if (art) {
      const a = ground.front[0] - ground.left[0];
      const b = ground.right[0] - ground.front[0];
      sprite.setOrigin((ground.front[0] + (b - a) / 2) / texture.width, (ground.front[1] - (a + b) / 4) / texture.height);
      sprite.setScale(art.scale);
    }
  }
  const p = isoToScreen(point.c, point.r);
  const x = p.x + scene.offsetX;
  const y = p.y + scene.offsetY - BUILDING_SURFACE_Y_OFFSET - TILE_HEIGHT / 2;
  // riding the swell (typhoon-shelter-sprites.js): heave and a little roll
  if (rec.bobSeed === undefined) {
    rec.bobSeed = typeof getTyphoonShelterRecordSeed === 'function' ? getTyphoonShelterRecordSeed(id) : 0;
    rec.bobLengthM = (typeof getTyphoonShelterObjectMetres === 'function' && getTyphoonShelterObjectMetres(objectId)?.alongM) || 8;
  }
  const bob = typeof getTyphoonShelterBob === 'function'
    ? getTyphoonShelterBob(scene.time?.now || 0, point.r, point.c, rec.bobSeed, rec.bobLengthM) : { dy: 0, roll: 0 };
  sprite.setPosition(x, y + bob.dy);
  sprite.setRotation(bob.roll);
  // off screen it is not drawn: a boat's texture between the buildings splits the sprite batch
  sprite.setVisible(typeof isTyphoonShelterSpriteInView !== 'function' || isTyphoonShelterSpriteInView(scene, sprite));
  // darkened after dark like the other unlit props (re-read as it moves: the remote dim is per tile)
  if (sprite.visible && typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  sprite.setDepth(getBuildingSortDepth(p.y, 1, 1, 0));
}

function clearTyphoonShelterBoats(scene) {
  scene?.typhoonShelterBoats?.forEach((rec) => rec.sprite?.destroy());
  scene?.typhoonShelterBoats?.clear();
  typhoonShelterFleetCache.clear();
  typhoonShelterScheduleCache.clear();
}

const typhoonShelterFleetApi = {
  TYPHOON_SHELTER_FLEET,
  computeTyphoonShelterBerths,
  planTyphoonShelterRoutes,
  typhoonShelterRouteFor,
  typhoonShelterRouteLength,
  typhoonShelterPointAlong,
  createTyphoonShelterFleet,
  reconcileTyphoonShelterFleet,
  typhoonShelterBoatTimes,
  typhoonShelterBoatTrip,
  typhoonShelterNightLandings,
  getTyphoonShelterTripDay,
  getTyphoonShelterBoatTrip,
  isTyphoonShelterMoratoriumDay,
  typhoonShelterFleetSchedule,
  typhoonShelterBoatState,
  isTyphoonShelterFishingModel,
  normalizeTyphoonShelterFleet,
  isTyphoonShelterFishingWeatherBad,
  updateTyphoonShelterFleets,
  getTyphoonShelterFleetGeometry,
  summarizeTyphoonShelterFleet,
  updateTyphoonShelterBoats,
  clearTyphoonShelterBoats,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterFleetApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterFleetApi);
