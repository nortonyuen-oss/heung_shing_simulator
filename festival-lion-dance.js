// 新春街頭醒獅: connected, level road routes; a leader and two lions march, turn and
// stop beside their fixed drum stand. All geometry is in map tiles (20 m each).
const LION_DANCE_TILE_M = 20;
const LION_DANCE_SPEED_MPS = .85;
const LION_DANCE_STOP_SECONDS = 8;
const LION_DANCE_TURN_SECONDS = 4;
const LION_DANCE_MIN_ZOOM = 1;
const LION_DANCE_COUNTS = Object.freeze({ basic: 1, standard: 2, grand: 3 });
const LION_DANCE_STEPS = Object.freeze([[-1, 0], [0, 1], [1, 0], [0, -1]]);
const LION_DANCE_ACTORS = Object.freeze([
  Object.freeze({ role: 'leader', partId: 'lnyLionLeader', heightM: 1.7, offsetM: 5 }),
  Object.freeze({ role: 'red', partId: 'lnyLionRed', heightM: 1.6, offsetM: 1.2 }),
  Object.freeze({ role: 'gold', partId: 'lnyLionGold', heightM: 1.6, offsetM: -2.8 }),
  Object.freeze({ role: 'drum', partId: 'lnyDrum', heightM: 1.4, fixed: true }),
]);

function lionDanceHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const lionDanceTileKey = (p) => `${p.row}:${p.col}`;
const lionDanceEdgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
const lionDanceEase = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

// Offset the path toward one side of the road. A bend uses the two segment normals'
// bisector, so marching round it stays continuous and within the road tiles.
function makeLionDanceRoute(tiles) {
  const lane = .30;
  const points = tiles.map((p, i) => {
    const before = tiles[Math.max(0, i - 1)], after = tiles[Math.min(tiles.length - 1, i + 1)];
    const incoming = i ? [p.row - before.row, p.col - before.col] : [after.row - p.row, after.col - p.col];
    const outgoing = i + 1 < tiles.length ? [after.row - p.row, after.col - p.col] : incoming;
    const nr = -incoming[1] - outgoing[1], nc = incoming[0] + outgoing[0];
    const divisor = 1 + incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
    return { row: p.row + lane * nr / divisor, col: p.col + lane * nc / divisor };
  });
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]
    + Math.hypot(points[i].row - points[i - 1].row, points[i].col - points[i - 1].col) * LION_DANCE_TILE_M);
  const id = `${lionDanceTileKey(tiles[0])}:${Math.round(lionDanceHash(tiles.map(lionDanceTileKey).join('|')) * 0xffffffff).toString(36)}`;
  return { id, tiles, points, distances, lengthM: distances.at(-1), height: tiles[0].height || 0 };
}

/** Split the road graph at junctions, retaining bends but never crossing a height step. */
function buildLionDanceRoutes(ctx = {}) {
  const byKey = new Map();
  for (const raw of ctx.roadTiles || []) {
    const p = Array.isArray(raw) ? { row: raw[0], col: raw[1], height: raw[2] || 0 } : raw;
    if (!Number.isInteger(p?.row) || !Number.isInteger(p?.col) || p.blocked || p.bridge || p.highway
      || ctx.isWalkable?.(p.row, p.col) === false) continue;
    const height = Number(ctx.heightAt ? ctx.heightAt(p.row, p.col) : p.height || 0);
    if (Number.isFinite(height)) byKey.set(lionDanceTileKey(p), { ...p, height });
  }
  const nodes = [...byKey.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  const neighbours = new Map(nodes.map((p) => [lionDanceTileKey(p), LION_DANCE_STEPS
    .map(([dr, dc]) => byKey.get(`${p.row + dr}:${p.col + dc}`)).filter((q) => q && q.height === p.height)
    .map(lionDanceTileKey)]));
  const used = new Set(), chains = [];
  const walk = (first, second) => {
    const chain = [byKey.get(first)];
    let previous = first, current = second;
    used.add(lionDanceEdgeKey(first, second));
    while (current) {
      chain.push(byKey.get(current));
      const nexts = neighbours.get(current);
      if (nexts.length !== 2) break;
      const next = nexts.find((k) => k !== previous);
      if (used.has(lionDanceEdgeKey(current, next))) break;
      used.add(lionDanceEdgeKey(current, next));
      previous = current; current = next;
    }
    if (chain.length >= 3) chains.push(chain);
  };
  nodes.filter((p) => neighbours.get(lionDanceTileKey(p)).length !== 2).forEach((p) => {
    const key = lionDanceTileKey(p);
    neighbours.get(key).forEach((next) => { if (!used.has(lionDanceEdgeKey(key, next))) walk(key, next); });
  });
  // A closed residential block has no endpoint or junction.
  nodes.forEach((p) => {
    const key = lionDanceTileKey(p);
    neighbours.get(key).forEach((next) => { if (!used.has(lionDanceEdgeKey(key, next))) walk(key, next); });
  });
  const routes = [];
  chains.forEach((chain) => {
    const edges = chain.length - 1, chunks = Math.ceil(edges / 6);
    for (let i = 0; i < chunks; i++) {
      const part = chain.slice(Math.floor(i * edges / chunks), Math.floor((i + 1) * edges / chunks) + 1);
      if (part.length >= 3) routes.push(makeLionDanceRoute(part));
    }
  });
  return routes.sort((a, b) => a.id.localeCompare(b.id));
}

function getLionDanceRoutePoint(route, metres) {
  const d = Math.max(0, Math.min(route.lengthM, metres));
  let i = 1;
  while (i + 1 < route.distances.length && route.distances[i] < d) i++;
  const a = route.points[i - 1], b = route.points[i], length = route.distances[i] - route.distances[i - 1];
  const u = length > 0 ? (d - route.distances[i - 1]) / length : 0;
  const norm = Math.hypot(b.row - a.row, b.col - a.col) || 1;
  return { row: a.row + (b.row - a.row) * u, col: a.col + (b.col - a.col) * u,
    dRow: (b.row - a.row) / norm, dCol: (b.col - a.col) / norm };
}

// The three marchers keep their separation while turning: their formation rotates
// continuously, rather than jumping to the opposite side when the heading flips.
function getLionDanceMotion(route, seconds, seed = '') {
  const low = 8, high = Math.max(low, route.lengthM - 8), middle = (low + high) / 2;
  const leg = (high - low) / 2 / LION_DANCE_SPEED_MPS;
  const turn = LION_DANCE_TURN_SECONDS, stop = LION_DANCE_STOP_SECONDS;
  const cycle = leg * 4 + turn * 2 + stop * 2;
  let t = ((Math.max(0, Number(seconds) || 0) + lionDanceHash(`${seed}:${route.id}:phase`) * cycle) % cycle + cycle) % cycle;
  const segments = [
    [leg, middle, high, 0, 0, 'walking'], [turn, high, high, 0, Math.PI, 'turning'],
    [leg, high, middle, Math.PI, Math.PI, 'walking'], [stop, middle, middle, Math.PI, Math.PI, 'performing'],
    [leg, middle, low, Math.PI, Math.PI, 'walking'], [turn, low, low, Math.PI, 2 * Math.PI, 'turning'],
    [leg, low, middle, 2 * Math.PI, 2 * Math.PI, 'walking'], [stop, middle, middle, 2 * Math.PI, 2 * Math.PI, 'performing'],
  ];
  for (let index = 0; index < segments.length; index++) {
    const [duration, from, to, angle0, angle1, phase] = segments[index];
    if (t <= duration || index === segments.length - 1) {
      const u = duration ? Math.max(0, Math.min(1, t / duration)) : 0;
      return { distanceM: from + (to - from) * u, angle: angle0 + (angle1 - angle0) * lionDanceEase(u), phase, phaseSeconds: t };
    }
    t -= duration;
  }
  return { distanceM: middle, angle: 0, phase: 'performing', phaseSeconds: 0 };
}

/** A reproducible pose at an absolute movement-clock time, independent of frame rate. */
function getLionDancePose(route, seconds, { seed = '', offsetM = 0, fixed = false, role = 'red' } = {}) {
  const motion = getLionDanceMotion(route, seconds, seed);
  const angle = fixed ? 0 : motion.angle;
  const p = getLionDanceRoutePoint(route, fixed ? route.lengthM / 2 : motion.distanceM + offsetM * Math.cos(angle));
  // Turning spreads the formation by at most 2 m across the 6 m kerb lane:
  // every foot stays within the road even at the turn's widest point.
  const across = fixed ? 1.2 : offsetM * .4 * Math.sin(angle);
  p.row -= p.dCol * across / LION_DANCE_TILE_M;
  p.col += p.dRow * across / LION_DANCE_TILE_M;
  const dr = p.dRow, dc = p.dCol;
  p.dRow = dr * Math.cos(angle) - dc * Math.sin(angle);
  p.dCol = dc * Math.cos(angle) + dr * Math.sin(angle);
  const beat = Math.max(0, Number(seconds) || 0) * (motion.phase === 'performing' ? 5.2 : 7.2)
    + lionDanceHash(`${seed}:${role}`) * Math.PI * 2;
  const lion = role === 'red' || role === 'gold';
  return { ...p, phase: motion.phase, performing: motion.phase === 'performing',
    bobM: fixed ? 0 : (lion ? (motion.phase === 'performing' ? .13 : .045) : .035) * (1 + Math.sin(beat)) / 2,
    crouch: !fixed && lion && motion.phase === 'performing' ? .035 * (1 + Math.cos(beat * .5)) / 2 : 0 };
}

function lionDanceWeatherBad(weather = {}) {
  return ['signal3', 'signal8', 'signal9', 'signal10'].includes(weather.typhoonStage) || ['red', 'black'].includes(weather.rainWarning);
}

function getLionDanceWorldPoint(scene, point) {
  if (typeof scene?.lionDanceProject === 'function') return scene.lionDanceProject(point);
  if (typeof isoToScreen !== 'function' || typeof getTileFaceGeometry !== 'function') return null;
  const row = Math.round(point.row), col = Math.round(point.col);
  const center = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY).center;
  const a = isoToScreen(col, row), b = isoToScreen(point.col, point.row);
  return { x: center.x + b.x - a.x, y: center.y + b.y - a.y };
}

function isLionDancePointOpen(scene, point, at) {
  if (typeof isYulanPointUnderSprite !== 'function' || typeof getTileId !== 'function') return true;
  const seen = new Set(), row = Math.round(point.row), col = Math.round(point.col);
  for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
    const building = scene.buildingSprites?.get(getTileId(row + dr, col + dc));
    if (!building || seen.has(building)) continue;
    seen.add(building);
    if (isYulanPointUnderSprite(scene, building, at.x, at.y - 6)) return false;
  }
  return true;
}

function pickLionDanceViewRoutes(scene, routes, seed = '', tier = 'standard') {
  const camera = scene?.cameras?.main, count = LION_DANCE_COUNTS[tier] || 0;
  if (!camera || !(camera.zoom > LION_DANCE_MIN_ZOOM) || !camera.worldView || !count) {
    if (scene) scene.lionDanceViewPick = [];
    return [];
  }
  const v = camera.worldView, right = v.right ?? v.x + v.width, bottom = v.bottom ?? v.y + v.height;
  const visible = routes.filter((route) => {
    const p = getLionDancePose(route, (scene.lionDanceElapsedMs || 0) / 1000, { seed, role: 'red', offsetM: 1.2 });
    if (route.tiles.every((tile) => tile.open === false)) return false;
    const at = getLionDanceWorldPoint(scene, p);
    return at && at.x > v.x + 12 && at.x < right - 12 && at.y > v.y + 24 && at.y < bottom - 12
      && isLionDancePointOpen(scene, p, at);
  });
  const byId = new Map(visible.map((r) => [r.id, r])), picked = [];
  const apart = (candidate) => picked.every((r) => r.tiles.every((a) => candidate.tiles.every(
    (b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) >= 2)));
  const add = (r) => { if (r && picked.length < count && !picked.includes(r) && apart(r)) picked.push(r); };
  (scene.lionDanceViewPick || []).forEach((id) => add(byId.get(id)));
  visible.sort((a, b) => lionDanceHash(`${seed}:${a.id}`) - lionDanceHash(`${seed}:${b.id}`) || a.id.localeCompare(b.id)).forEach(add);
  scene.lionDanceViewPick = picked.map((r) => r.id);
  return picked;
}

function isLionDanceRoadTile(row, col, height = null) {
  if (typeof mapData === 'undefined' || typeof ROAD === 'undefined' || mapData[row]?.[col] !== ROAD) return false;
  if (typeof isBridgeTile === 'function' && isBridgeTile(row, col)) return false;
  if (typeof isHighwayTile === 'function' && isHighwayTile(row, col)) return false;
  if (typeof isHighway === 'function' && isHighway(row, col)) return false;
  return height == null || (typeof heightMap === 'undefined' ? 0 : heightMap[row]?.[col] || 0) === height;
}

/** Current map geometry, cached by the actual road/height signature so road edits take effect. */
function getLionDanceLayoutExtras(scene) {
  if (!scene || typeof mapData === 'undefined') return { lionRoutes: [], lionVenueAvailable: false };
  const roadTiles = [];
  let signature = 2166136261;
  for (let row = 0; row < mapData.length; row++) for (let col = 0; col < mapData[row].length; col++) {
    if (!isLionDanceRoadTile(row, col)) continue;
    const height = typeof heightMap === 'undefined' ? 0 : heightMap[row]?.[col] || 0;
    roadTiles.push({ row, col, height });
    signature = Math.imul(signature ^ (row * 65537 + col * 17 + height), 16777619) >>> 0;
  }
  const key = `${roadTiles.length}:${signature}`;
  if (scene.lionDanceRouteMap?.key !== key) scene.lionDanceRouteMap = { key, routes: buildLionDanceRoutes({ roadTiles }) };
  const seed = typeof city === 'undefined' ? '' : `${city.name}:${city.year}`;
  const tier = typeof getFestivalTier === 'function' ? getFestivalTier('lunarNewYear') : 'standard';
  return { lionRoutes: pickLionDanceViewRoutes(scene, scene.lionDanceRouteMap.routes, seed, tier),
    lionVenueAvailable: scene.lionDanceRouteMap.routes.length > 0,
    lionSeconds: (scene.lionDanceElapsedMs || 0) / 1000,
    weather: typeof city === 'undefined' ? {} : city.weather || {} };
}

function layoutLionDanceStreets(ctx = {}) {
  if (!['open', 'peak', 'after'].includes(ctx.phase) || !(LION_DANCE_COUNTS[ctx.tier || 'standard']) || lionDanceWeatherBad(ctx.weather)) return [];
  const out = [];
  for (const route of (ctx.lionRoutes || []).slice(0, LION_DANCE_COUNTS[ctx.tier || 'standard'])) {
    const troupeId = `lny:street:${route.id}`;
    for (const actor of LION_DANCE_ACTORS) {
      const pose = getLionDancePose(route, ctx.lionSeconds || 0, { ...actor, seed: ctx.seed });
      out.push({ id: `${troupeId}:${actor.role}`, festival: 'lunarNewYear', partId: actor.partId,
        mode: 'tile', row: pose.row, col: pose.col, heightM: actor.heightM,
        lionDance: { troupeId, route, role: actor.role, offsetM: actor.offsetM || 0, fixed: !!actor.fixed, seed: ctx.seed || '' } });
    }
  }
  return out;
}

function isLionDanceRuntimeActive(scene) {
  if (scene?.scene?.isVisible?.() === false || typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) return false;
  if (scene?.bunHillEventSession || typeof isFestivalGameplayLive === 'function' && !isFestivalGameplayLive()) return false;
  if (typeof city !== 'undefined' && lionDanceWeatherBad(city.weather)) return false;
  if (typeof isFestivalEnabled === 'function' && !isFestivalEnabled('lunarNewYear')) return false;
  if (typeof getFestivalTier === 'function' && getFestivalTier('lunarNewYear') === 'skip') return false;
  if (typeof getActiveFestivals === 'function' && typeof city !== 'undefined') {
    const minuteOfDay = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : city.timeOfDayMinutes || 0;
    if (!getActiveFestivals({ year: city.year, month: city.month, minuteOfDay })
      .some(({ id, phase }) => id === 'lunarNewYear' && ['open', 'peak', 'after'].includes(phase))) return false;
  }
  if (typeof getFestivalHistoryEntry === 'function' && typeof city !== 'undefined'
    && getFestivalHistoryEntry('lunarNewYear', city.year)?.outcome !== 'held') return false;
  return true;
}

// The elapsed movement clock advances by frame duration and the same visual speed as
// traffic. Pausing updates the wall-time reference, so resuming never catches up in a jump.
function updateLionDance(scene, time) {
  if (!scene) return [];
  const previous = scene.lionDanceLastUpdateAt;
  scene.lionDanceLastUpdateAt = time;
  const paused = typeof isGamePaused === 'function' ? isGamePaused() : typeof simPaused !== 'undefined' && simPaused;
  const speed = paused ? 0 : typeof getVehicleVisualSpeedMultiplier === 'function' ? getVehicleVisualSpeedMultiplier()
    : Math.max(1, typeof simSpeedMul === 'undefined' ? 1 : Number(simSpeedMul) || 0);
  const active = isLionDanceRuntimeActive(scene);
  if (active && Number.isFinite(previous)) scene.lionDanceElapsedMs = (scene.lionDanceElapsedMs || 0)
    + Math.min(250, Math.max(0, time - previous)) * Math.max(0, speed);
  const sources = new Map(), seconds = (scene.lionDanceElapsedMs || 0) / 1000;
  const camera = scene.cameras?.main;
  scene.festivalSprites?.forEach((sprite) => {
    const placement = sprite.festivalPlacement, actor = placement?.lionDance;
    if (!actor) return;
    const routeValid = typeof mapData === 'undefined' || actor.route.tiles.every((p) => isLionDanceRoadTile(p.row, p.col, actor.route.height));
    if (!active || !routeValid || camera && !(camera.zoom > LION_DANCE_MIN_ZOOM)) { sprite.setVisible(false); return; }
    const pose = getLionDancePose(actor.route, seconds, actor);
    placement.row = pose.row; placement.col = pose.col;
    const here = getLionDanceWorldPoint(scene, pose);
    const facing = getLionDanceWorldPoint(scene, { row: pose.row + pose.dRow * .1, col: pose.col + pose.dCol * .1 });
    // The original red/gold lions and leader face left; the baked mirror faces right.
    if (here && facing && !actor.fixed) placement.mirrored = facing.x > here.x;
    if (typeof positionFestivalSprite !== 'function' || positionFestivalSprite(scene, sprite) === false) return;
    sprite.setPosition(sprite.x, sprite.y - pose.bobM * 5);
    if (pose.crouch && typeof sprite.setScale === 'function') sprite.setScale(sprite.scaleX, sprite.scaleY * (1 - pose.crouch));
    sprite.festivalLionPose = pose;
    const view = camera?.worldView;
    sprite.setVisible(!view || sprite.x >= view.x - 40 && sprite.x <= (view.right ?? view.x + view.width) + 40
      && sprite.y >= view.y - 60 && sprite.y <= (view.bottom ?? view.y + view.height) + 40);
    if (!actor.fixed) {
      const source = sources.get(actor.troupeId) || { id: actor.troupeId, x: 0, y: 0, count: 0 };
      source.x += sprite.x; source.y += sprite.y; source.count++;
      sources.set(actor.troupeId, source);
    }
  });
  const audioSources = [...sources.values()].map(({ id, x, y, count }) => ({ id, x: x / count, y: y / count }));
  scene.lionDanceAudioSources = audioSources;
  if (typeof updateLionDanceAudio === 'function') updateLionDanceAudio(scene, audioSources);
  return audioSources;
}

function clearLionDance(scene) {
  if (!scene) return;
  scene.lionDanceElapsedMs = 0;
  scene.lionDanceLastUpdateAt = null;
  scene.lionDanceViewPick = [];
  scene.lionDanceRouteMap = null;
  scene.lionDanceAudioSources = [];
  if (typeof stopLionDanceAudio === 'function') stopLionDanceAudio(scene);
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  LION_DANCE_TILE_M, LION_DANCE_SPEED_MPS, LION_DANCE_STOP_SECONDS, LION_DANCE_TURN_SECONDS,
  LION_DANCE_MIN_ZOOM, LION_DANCE_COUNTS, LION_DANCE_ACTORS, buildLionDanceRoutes, getLionDanceRoutePoint,
  getLionDanceMotion, getLionDancePose, lionDanceWeatherBad, pickLionDanceViewRoutes,
  getLionDanceLayoutExtras, layoutLionDanceStreets, updateLionDance, clearLionDance,
};
