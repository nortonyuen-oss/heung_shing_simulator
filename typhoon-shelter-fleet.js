// 避風塘船隊 (Phase 3): the boats of an operational shelter - where each one lies, and its day out
// fishing: away before dawn, home by evening, kept in by bad weather.
//
// Everything a boat does is derived from the clock: its departure and return times are seeded per
// boat and per sky-day (one day-night cycle; in this game that is also one calendar month), and
// its position at any moment follows from those and its route. So the save holds only the boats
// (model and berth) and today's weather hold; a save made mid-voyage loads mid-voyage, and
// nothing is re-rolled.
//
// The pure parts (berths, routes, schedule) run under node for tests; the drawing at the bottom
// only runs in the game, called every frame from main.js and once a calendar day from
// typhoon-shelter-planning.js.

const TYPHOON_SHELTER_FLEET = Object.freeze({
  // the fleet's make-up; fishing boats go out, house boats and sampans stay at their berths
  models: Object.freeze([
    Object.freeze({ objectId: 'fishingBoat1', weight: 20, fishing: true, size: 2 }),
    Object.freeze({ objectId: 'fishingBoat3', weight: 25, fishing: true, size: 2 }),
    Object.freeze({ objectId: 'fishingBoat4', weight: 25, fishing: true, size: 2 }),
    Object.freeze({ objectId: 'homeBoat1', weight: 8, fishing: false, size: 2 }),
    Object.freeze({ objectId: 'homeBoat2', weight: 7, fishing: false, size: 2 }),
    Object.freeze({ objectId: 'sanpan1', weight: 5, fishing: false, size: 1 }),
    Object.freeze({ objectId: 'sanpan3', weight: 5, fishing: false, size: 1 }),
    Object.freeze({ objectId: 'sanpan5', weight: 5, fishing: false, size: 1 }),
  ]),
  departFrom: 4 * 60,          // sky-time window boats leave in (minutes after midnight)
  departSpan: 4 * 60,
  returnFrom: 15 * 60,         // and come home in
  returnSpan: 6 * 60,
  speedTilesPerMinute: 0.5,    // ~1.5 tiles a second on screen at 1x
  offshoreTiles: 30,           // how far out a boat is still drawn before it is "at the grounds"
  catchTonnesPerTrip: 1.5,
  arrivalsPerDayShare: 5,      // a new shelter fills in about this many calendar days
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

// Tiles boats cannot lie on or pass through: piers, walkways, landing stages.
function typhoonShelterBlockedTiles(worksItems = []) {
  return new Set(worksItems.filter((i) => ['pier', 'floatingPier', 'pontoon'].includes(i.kind)).map((i) => tfKey(i.row, i.col)));
}

/**
 * Berths: the mooring water (basin, off the channel and the walkways) cut into slots - two tiles
 * end to end for a fishing boat, one for a sampan - nearest the walkways and the pier first, so a
 * small fleet lies along the walkways like a marina. Returns [{ key, tiles, size, axis, centre }].
 */
function computeTyphoonShelterBerths(analysis, worksItems = []) {
  const blocked = typhoonShelterBlockedTiles(worksItems);
  const free = new Set([...analysis.basin].filter((k) => !analysis.channel.has(k) && !blocked.has(k)));
  const landings = [...blocked].map(tfParse);
  const near = (k) => {
    const [r, c] = tfParse(k);
    return landings.length ? Math.min(...landings.map(([lr, lc]) => Math.abs(lr - r) + Math.abs(lc - c))) : 0;
  };
  // walk the tiles nearest the works first, pairing each with a free neighbour
  const order = [...free].sort((a, b) => near(a) - near(b) || a.localeCompare(b));
  const used = new Set();
  const slots = [];
  order.forEach((k) => {
    if (used.has(k)) return;
    const [r, c] = tfParse(k);
    // lie parallel to a neighbouring walkway when there is one
    const alongWalk = blocked.has(tfKey(r - 1, c)) || blocked.has(tfKey(r + 1, c)) ? ['e', 's'] : ['s', 'e'];
    let pair = null;
    for (const axis of alongWalk) {
      const [dr, dc] = TF_DIRS[axis];
      const other = tfKey(r + dr, c + dc);
      if (free.has(other) && !used.has(other)) { pair = { other, axis }; break; }
    }
    used.add(k);
    if (pair) {
      used.add(pair.other);
      const [r2, c2] = tfParse(pair.other);
      slots.push({ key: k, tiles: [k, pair.other], size: 2, axis: pair.axis, centre: [(r + r2) / 2, (c + c2) / 2] });
    } else {
      slots.push({ key: k, tiles: [k], size: 1, axis: 'e', centre: [r, c] });
    }
  });
  return slots;
}

/**
 * Routes out: for every basin tile, the way to the nearest entrance through open basin water, and
 * from each entrance a run straight out to sea down the distance-to-the-map-edge gradient.
 * @param {(r, c) => boolean} isSea open sea a boat may cross (not land, not any shelter's works)
 */
function planTyphoonShelterRoutes(analysis, worksItems, isSea, { offshoreTiles = TYPHOON_SHELTER_FLEET.offshoreTiles, width, height } = {}) {
  const blocked = typhoonShelterBlockedTiles(worksItems);
  const passable = (k) => analysis.basin.has(k) && !blocked.has(k);
  const parent = new Map();
  const exitOf = new Map();
  const queue = [];
  analysis.entrances.filter((e) => e.status === 'ok').forEach((e, i) => {
    e.tiles.forEach((k) => { parent.set(k, null); exitOf.set(k, i); queue.push(k); });
  });
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    const [r, c] = tfParse(k);
    Object.values(TF_DIRS).forEach(([dr, dc]) => {
      const n = tfKey(r + dr, c + dc);
      if (parent.has(n) || !passable(n)) return;
      parent.set(n, k);
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
    for (let i = 0; i < offshoreTiles && isSea(r, c) && !seen.has(tfKey(r, c)); i++) {
      run.push([r, c]);
      seen.add(tfKey(r, c));
      // keep heading out; bend toward the nearer map edge when the way ahead is blocked
      const options = Object.values(TF_DIRS)
        .map(([dr, dc]) => [r + dr, c + dc, dr, dc])
        .filter(([nr, nc]) => isSea(nr, nc) && !seen.has(tfKey(nr, nc)) && !analysis.basin.has(tfKey(nr, nc)));
      if (!options.length) break;
      options.sort((a, b) => (b[2] === out[0] && b[3] === out[1]) - (a[2] === out[0] && a[3] === out[1])
        || edgeDist(a[0], a[1]) - edgeDist(b[0], b[1]));
      [r, c] = options[0];
    }
    return run;
  });
  return { parent, exitOf, seaRuns };
}

// A boat's whole route out, as tile centres: berth -> entrance -> open sea.
function typhoonShelterRouteFor(routes, slot) {
  const start = slot.tiles[0];
  if (!routes.parent.has(start)) return null;
  const path = [slot.centre];
  for (let k = routes.parent.get(start); k !== null && k !== undefined; k = routes.parent.get(k)) path.push(tfParse(k));
  const run = routes.seaRuns[routes.exitOf.get(start)] || [];
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
  return { nextId: 1, boats: [], hold: null };
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

// Today's times for one boat: { depart, back } in minutes of the sky-day.
function typhoonShelterBoatTimes(seed, boatId, day) {
  const F = TYPHOON_SHELTER_FLEET;
  return {
    depart: F.departFrom + tfHash(seed, 'out', boatId, day) * F.departSpan,
    back: F.returnFrom + tfHash(seed, 'in', boatId, day) * F.returnSpan,
  };
}

/**
 * Where a boat is at environment time `env`: { mode, distance } - mode 'moored' | 'out' (leaving)
 * | 'away' (at the fishing grounds, not drawn) | 'in' (coming home); distance in tiles along its
 * route from the berth. `hold` ({ day, from }) keeps boats in from that minute of that day: no one
 * leaves after it, and anyone out turns for home at it.
 */
function typhoonShelterBoatState(boat, routeLength, env, { seed = 0, hold = null, fishing = true } = {}) {
  if (!fishing || !(routeLength > 0)) return { mode: 'moored', distance: 0 };
  const day = Math.floor(env / TYPHOON_SHELTER_MINUTES_PER_DAY);
  const minute = env - day * TYPHOON_SHELTER_MINUTES_PER_DAY;
  const { depart, back: scheduledBack } = typhoonShelterBoatTimes(seed, boat.id, day);
  const held = hold && hold.day === day ? hold.from : Infinity;
  if (depart >= held) return { mode: 'moored', distance: 0 };
  const travel = routeLength / TYPHOON_SHELTER_FLEET.speedTilesPerMinute;
  const back = Math.min(scheduledBack, Math.max(held, depart));
  if (minute < depart) return { mode: 'moored', distance: 0 };
  const outFor = minute - depart;
  // turned back before reaching the grounds: home along the way it went
  if (minute >= back) {
    const reached = Math.min(routeLength, (back - depart) * TYPHOON_SHELTER_FLEET.speedTilesPerMinute);
    const homeward = (minute - back) * TYPHOON_SHELTER_FLEET.speedTilesPerMinute;
    if (homeward >= reached) return { mode: 'moored', distance: 0 };
    return { mode: 'in', distance: reached - homeward };
  }
  if (outFor < travel) return { mode: 'out', distance: outFor * TYPHOON_SHELTER_FLEET.speedTilesPerMinute };
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
    .map((b) => ({ id: b.id, model: b.model, slot: b.slot.slice(0, 16) }));
  const hold = raw.hold && Number.isFinite(raw.hold.day) && Number.isFinite(raw.hold.from)
    ? { day: Math.floor(raw.hold.day), from: Math.max(0, Math.min(TYPHOON_SHELTER_MINUTES_PER_DAY, raw.hold.from)) } : null;
  return { nextId: Math.max(Number(raw.nextId) || 1, ...boats.map((b) => b.id + 1), 1), boats, hold };
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
  const slots = computeTyphoonShelterBerths(analysis, items);
  const taken = new Set();
  if (typeof getTyphoonShelterAnalyses === 'function') {
    getTyphoonShelterAnalyses().forEach((a) => { a.basin.forEach((k) => taken.add(k)); a.ring.forEach((k) => taken.add(k)); });
  }
  analysis.entrances.forEach((e) => e.tiles.forEach((k) => taken.delete(k)));
  const isSea = (r, c) => isInsideMap(r, c) && mapData[r][c] === WATER
    && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c)) && !taken.has(`${r}:${c}`);
  const routes = planTyphoonShelterRoutes(analysis, items, isSea, { width: MAP_WIDTH, height: MAP_HEIGHT });
  const routeBySlot = new Map(slots.map((s) => {
    const route = typhoonShelterRouteFor(routes, s);
    return [s.key, route ? { route, length: typhoonShelterRouteLength(route) } : null];
  }));
  const geometry = { key, slots, routes, routeBySlot };
  typhoonShelterFleetCache.set(plan.id, geometry);
  return geometry;
}

// Once a calendar day: operational shelters gain boats toward their berths.
function updateTyphoonShelterFleets(state, analyses, summaries) {
  let changed = false;
  const shelters = state.shelters.map((plan) => {
    const summary = summaries.get(plan.id);
    const analysis = analyses.get(plan.id);
    if (!analysis || !plan.works?.approved) return plan;
    const target = summary?.operational ? summary.berths.daily : 0;
    const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
    const slots = geometry.slots.filter((s) => geometry.routeBySlot.get(s.key));
    const fleet = plan.fleet || createTyphoonShelterFleet();
    const arrivals = Math.max(1, Math.ceil(target / TYPHOON_SHELTER_FLEET.arrivalsPerDayShare));
    const next = reconcileTyphoonShelterFleet(fleet, slots, target, { seed: plan.seed, arrivals });
    if (JSON.stringify(next.boats) === JSON.stringify(fleet.boats) && plan.fleet) return plan;
    changed = true;
    return { ...plan, fleet: next };
  });
  return changed ? shelters : null;
}

// Today's weather hold: the first minute of today the weather turned bad (kept with the save).
function noteTyphoonShelterWeatherHold(plan, env) {
  if (!plan.fleet || !isTyphoonShelterFishingWeatherBad()) return;
  const day = Math.floor(env / TYPHOON_SHELTER_MINUTES_PER_DAY);
  if (plan.fleet.hold?.day === day) return;
  plan.fleet.hold = { day, from: env - day * TYPHOON_SHELTER_MINUTES_PER_DAY };
}

// Counts for the panel: { boats, fishing, out, away, home, moored, held, tripsToday, catchToday }.
function summarizeTyphoonShelterFleet(plan, analysis, env = getTyphoonShelterFleetClock()) {
  const fleet = plan.fleet;
  const out = { boats: 0, fishing: 0, out: 0, away: 0, home: 0, moored: 0, held: false, tripsToday: 0, catchToday: 0 };
  if (!fleet || !analysis) return out;
  const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
  const day = Math.floor(env / TYPHOON_SHELTER_MINUTES_PER_DAY);
  const minute = env - day * TYPHOON_SHELTER_MINUTES_PER_DAY;
  out.held = !!(fleet.hold && fleet.hold.day === day);
  let catchTonnes = 0;
  fleet.boats.forEach((b) => {
    out.boats += 1;
    const fishing = isTyphoonShelterFishingModel(b.model);
    if (fishing) out.fishing += 1;
    const rl = geometry.routeBySlot.get(b.slot)?.length || 0;
    const st = typhoonShelterBoatState(b, rl, env, { seed: plan.seed, hold: fleet.hold, fishing });
    if (st.mode === 'out') out.out += 1;
    else if (st.mode === 'away') out.away += 1;
    else if (st.mode === 'in') out.home += 1;
    else out.moored += 1;
    if (fishing) {
      const { depart, back } = typhoonShelterBoatTimes(plan.seed, b.id, day);
      const held = out.held ? fleet.hold.from : Infinity;
      if (depart < minute && depart < held) {
        out.tripsToday += 1;
        // the catch is for time on the grounds: a boat turned back by the weather lands less
        const atGrounds = depart + rl / TYPHOON_SHELTER_FLEET.speedTilesPerMinute;
        const fished = Math.max(0, Math.min(back, held) - atGrounds) / Math.max(1, back - atGrounds);
        catchTonnes += Math.min(1, fished) * TYPHOON_SHELTER_FLEET.catchTonnesPerTrip;
      }
    }
  });
  out.catchToday = Math.round(catchTonnes * 10) / 10;
  return out;
}

// Every frame: place each visible boat.
function updateTyphoonShelterBoats(scene) {
  if (!scene || typeof getTyphoonShelterState !== 'function') return;
  const state = getTyphoonShelterState();
  if (!scene.typhoonShelterBoats) scene.typhoonShelterBoats = new Map();
  const live = new Set();
  const env = getTyphoonShelterFleetClock();
  const shelters = state.shelters.filter((p) => p.fleet?.boats?.length);
  if (!shelters.length && !scene.typhoonShelterBoats.size) return;
  const analyses = getTyphoonShelterAnalyses();
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const facings = typeof getTyphoonShelterFacingOverrides === 'function' ? getTyphoonShelterFacingOverrides() : {};
  shelters.forEach((plan) => {
    const analysis = analyses.get(plan.id);
    if (!analysis) return;
    noteTyphoonShelterWeatherHold(plan, env);
    const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
    const slotByKey = new Map(geometry.slots.map((s) => [s.key, s]));
    plan.fleet.boats.forEach((boat) => {
      const slot = slotByKey.get(boat.slot);
      const r = geometry.routeBySlot.get(boat.slot);
      if (!slot || !r) return;
      const fishing = isTyphoonShelterFishingModel(boat.model);
      const st = typhoonShelterBoatState(boat, r.length, env, { seed: plan.seed, hold: plan.fleet.hold, fishing });
      const id = `${plan.id}|${boat.id}`;
      if (st.mode === 'away') return;
      live.add(id);
      let point;
      if (st.mode === 'moored') {
        // lie along the berth, bow chosen per boat
        const flip = tfHash(plan.seed, 'bow', boat.id) < 0.5;
        const dir = slot.axis === 'e' ? (flip ? 'e' : 'w') : (flip ? 's' : 'n');
        point = { r: slot.centre[0], c: slot.centre[1], dir };
      } else {
        point = typhoonShelterPointAlong(r.route, st.distance);
        if (st.mode === 'in') point.dir = { n: 's', s: 'n', e: 'w', w: 'e' }[point.dir];
      }
      drawTyphoonShelterBoat(scene, id, boat.model, point, rotation, facings);
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
    scene.typhoonShelterBoats.set(id, rec);
  }
  const sprite = rec.sprite;
  // the fit is re-read when the texture, its warp or the calibration changes
  const stamp = `${key}|${scene.textures.get(key).typhoonShelterWarp?.version || 0}|${getTyphoonShelterPlacementRevision()}`;
  if (rec.key !== stamp) {
    sprite.setTexture(key);
    rec.key = stamp;
    const texture = scene.textures.get(key).getSourceImage();
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
  sprite.setVisible(true);
  sprite.setPosition(x, y);
  sprite.setDepth(getBuildingSortDepth(p.y, 1, 1, 0));
}

function clearTyphoonShelterBoats(scene) {
  scene?.typhoonShelterBoats?.forEach((rec) => rec.sprite?.destroy());
  scene?.typhoonShelterBoats?.clear();
  typhoonShelterFleetCache.clear();
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
  typhoonShelterBoatState,
  isTyphoonShelterFishingModel,
  normalizeTyphoonShelterFleet,
  isTyphoonShelterFishingWeatherBad,
  updateTyphoonShelterFleets,
  summarizeTyphoonShelterFleet,
  updateTyphoonShelterBoats,
  clearTyphoonShelterBoats,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterFleetApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterFleetApi);
