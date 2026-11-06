// 地鐵第三期 (docs/metro-phase3-design.md): surface track. The transport company lays double track
// on open ground, dragged like a road. As in OpenTTD, a tile holds TrackBits (railway-track.js):
// X and Y straight through, and the four diagonals UPPER, LOWER, LEFT and RIGHT across a corner, so
// a line turns 45 degrees at a tile edge (Norton, 2026-11-05) and may run diagonally as a staircase
// of them. Each bit joins two sides of its tile (n: row - 1, e: col + 1, s: row + 1, w: col - 1, in
// the map's frame); the state is just "row:col" -> the tile's bits, so a save and a turn of the map
// need nothing else.

const METRO_RAIL = Object.freeze({
  costPerTile: 500,           // the tunnel's is 300 a tile: land, bed and track
  monthlyUpkeepPerTile: 2,
  // 高架 (step 4, Norton 2026-11-05: its own tool, the deck 8 m up): a viaduct tile and a ramp tile
  deckCostPerTile: 2000,
  rampCostPerTile: 1200,
  // a terrain level: HEIGHT_STEP_PIXELS (13) at TILE_WIDTH 100, at 10 px a metre on a 512-px tile
  hillLevelMetres: 6.656,
  // (Norton: up from 8 m to meet his elevated station's track, 17 m, then three hill levels, so a
  // viaduct meets a level-3 hilltop flush)
  deckMetres: 3 * 6.656,
  rampTiles: 5,
  // a tunnel through a hill at the deck's height, from a viaduct (or a hilltop's track)
  hillTunnelCostPerTile: 1200,
  // 地底路軌 (phase 4 step 3): a tunnel tile, under the sea, and a tunnel portal's tile - three of
  // trough going down, then the portal itself
  tunnelCostPerTile: 800,
  seaTunnelCostPerTile: 1600,
  portalCostPerTile: 1500,
  tunnelMetres: 10,
  portalTiles: 4,
});

const RAIL_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const RAIL_OPPOSITE = Object.freeze({ n: 's', e: 'w', s: 'n', w: 'e' });
// the sides each bit joins, in the map's frame (railway-track.js: A west, B north, C east, D south)
const RAIL_BIT_SIDES = Object.freeze({
  1: ['s', 'n'],    // X: D - B
  2: ['w', 'e'],    // Y: A - C
  4: ['w', 'n'],    // UPPER: A - B
  8: ['s', 'e'],    // LOWER: D - C
  16: ['w', 's'],   // LEFT: A - D
  32: ['n', 'e'],   // RIGHT: B - C
});
// what a tile may hold: one bit, the X/Y crossing, two diagonals side by side, and (phase 4) OpenTTD's
// points - a straight and a diagonal sharing a side - and three-way junctions (railway-track.js)
const RAIL_PLAIN_MASKS = new Set([1, 2, 4, 8, 16, 32, 0x03, 0x0c, 0x30]);
const RAIL_ALLOWED_MASKS = new Set([...RAIL_PLAIN_MASKS,
  0x06, 0x12, 0x05, 0x21, 0x0a, 0x22, 0x09, 0x11, 0x16, 0x25, 0x2a, 0x19]);

function railKey(row, col) {
  return `${row}:${col}`;
}

function railBitsOf(mask) {
  return [1, 2, 4, 8, 16, 32].filter((b) => mask & b);
}

// The bit that joins two sides of a tile (any two differ: opposite is X or Y, next to each other a diagonal).
function railBitFor(a, b) {
  const want = [a, b].sort().join();
  return [1, 2, 4, 8, 16, 32].find((bit) => RAIL_BIT_SIDES[bit].slice().sort().join() === want) || 0;
}

// The side a neighbouring tile lies on.
function railSideTowards(from, to) {
  return Object.keys(RAIL_DIRS).find((d) => RAIL_DIRS[d][0] === to.row - from.row && RAIL_DIRS[d][1] === to.col - from.col) || null;
}

/**
 * The tiles a drag lays, in order. Pure. Straight along a row or column; round one corner (along
 * the start's row first, then the end's column: the corner tile a diagonal, two 45-degree turns);
 * or, when the drag runs about as far across as down (within a tile), a diagonal: a staircase,
 * a step along the row then one along the column.
 */
function railDragPath(start, end) {
  const dr = end.row - start.row, dc = end.col - start.col;
  const stepR = Math.sign(dr), stepC = Math.sign(dc);
  const path = [{ row: start.row, col: start.col }];
  if (dr && dc && Math.abs(Math.abs(dr) - Math.abs(dc)) <= 1) {
    let { row, col } = start;
    let alongRow = Math.abs(dc) >= Math.abs(dr);
    while (row !== end.row || col !== end.col) {
      if ((alongRow && col !== end.col) || row === end.row) col += stepC; else row += stepR;
      path.push({ row, col });
      alongRow = !alongRow;
    }
    return path;
  }
  for (let c = start.col; c !== end.col;) {
    c += stepC;
    path.push({ row: start.row, col: c });
  }
  for (let r = start.row; r !== end.row;) {
    r += stepR;
    path.push({ row: r, col: end.col });
  }
  return path;
}

/**
 * The bits with a path laid. Pure; a new object. Each tile on the way gets the bit joining the
 * sides it is entered and left by; an end tile already joined that way is left as it is, else it
 * gets the straight the path arrives on.
 */
function addRailPathBits(bits, path) {
  const out = { ...bits };
  for (let i = 0; i < path.length; i++) {
    const here = path[i];
    const key = railKey(here.row, here.col);
    const sides = [];
    if (i > 0) sides.push(railSideTowards(here, path[i - 1]));
    if (i < path.length - 1) sides.push(railSideTowards(here, path[i + 1]));
    let bit;
    if (sides.length === 2) bit = railBitFor(sides[0], sides[1]);
    else {
      const side = sides[0];
      if (!side) continue;
      if (railBitsOf(out[key] || 0).some((b) => RAIL_BIT_SIDES[b].includes(side))) continue;
      // the end of a line, its loose side square to the way this one comes: turn it (a diagonal
      // from its joined side to this one), as OpenTTD does when a line is carried on round a corner
      const bitsHere = railBitsOf(out[key] || 0);
      if (bitsHere.length === 1) {
        const joined = RAIL_BIT_SIDES[bitsHere[0]].filter((s) => {
          const [dr, dc] = RAIL_DIRS[s];
          const neighbour = out[railKey(here.row + dr, here.col + dc)] || 0;
          return railBitsOf(neighbour).some((b) => RAIL_BIT_SIDES[b].includes(RAIL_OPPOSITE[s]));
        });
        if (joined.length === 1 && joined[0] !== RAIL_OPPOSITE[side]) {
          out[key] = railBitFor(joined[0], side);
          continue;
        }
      }
      bit = railBitFor(side, RAIL_OPPOSITE[side]);
    }
    out[key] = (out[key] || 0) | bit;
  }
  return out;
}

// ── 高架 (step 4), 地底 and 山 (phase 4) ──────────────────────────────────────────
// A tile's level (trackElev):
// - none: ground track, on its tile's ground - the flat, a hilltop, or up a hillside a level
//   (OpenTTD's track on a slope: along it, from its foot to its top);
// - 'd' the deck three levels up (20 m), `d${n}` n levels up (a viaduct as high as the ground it
//   starts from, three levels over it); a ramp step `${step}${up}`, step 1..5 from its tile's ground
//   up three levels, `up` the side it rises towards;
// - 'u' a tunnel 10 m under the flat, a portal's tile `p${step}${down}`, step 1..4 down to it;
// - 穿山隧道 (OpenTTD's tunnel): `t${n}` inside a hill at level n, `T${n}${out}` its mouth on a
//   hillside, cut back to its foot (level n), `out` the side out of the hill.

// Up on a viaduct (deck or ramp) / down in a tunnel (tunnel or portal) / through a hill. Pure.
function railIsUp(code) {
  return Boolean(code) && (code[0] === 'd' || /^[1-9]/.test(code));
}

function railIsDown(code) {
  return Boolean(code) && (code === 'u' || code[0] === 'p');
}

function railIsHill(code) {
  return Boolean(code) && (code[0] === 't' || code[0] === 'T');
}

// A deck's level (terrain levels up), or null. Pure.
function railDeckLevel(code) {
  if (code === 'd') return 3;
  const m = /^d(\d)$/.exec(code || '');
  return m ? Number(m[1]) : null;
}

function railDeckCodeAt(level) {
  return level === 3 ? 'd' : `d${level}`;
}

// The track's height (metres above the flat) where it crosses a side of a tile; `ground` the tile's
// ground there (a hilltop's, a hillside's), where ground track and a ramp's foot lie. Pure.
function railSideHeight(code, side, ground = 0) {
  if (!code) return ground;
  const deck = railDeckLevel(code);
  if (deck != null) return deck * METRO_RAIL.hillLevelMetres;
  if (railIsHill(code)) return Number(code[1]) * METRO_RAIL.hillLevelMetres;
  if (code === 'u') return -METRO_RAIL.tunnelMetres;
  if (code[0] === 'p') {
    const step = Number(code[1]), down = code[2];
    const per = METRO_RAIL.tunnelMetres / METRO_RAIL.portalTiles;
    if (side === down) return -step * per;
    if (side === RAIL_OPPOSITE[down]) return (1 - step) * per;
    return (0.5 - step) * per;
  }
  const step = Number(code[0]), up = code[1];
  const lo = ground + ((step - 1) / METRO_RAIL.rampTiles) * METRO_RAIL.deckMetres;
  const hi = ground + (step / METRO_RAIL.rampTiles) * METRO_RAIL.deckMetres;
  if (side === up) return hi;
  if (side === RAIL_OPPOSITE[up]) return lo;
  return (lo + hi) / 2;
}

/**
 * A tile's ground at a side (null: its middle), metres above the flat, from its height in levels
 * and its open edges (the sides its neighbours are lower: a hillside has one, falling that way). A
 * hilltop is level; a hillside a level lower at its open edge. Pure.
 */
function railGroundAt(level, openEdges, side) {
  const lvl = METRO_RAIL.hillLevelMetres;
  if (level <= 0 || !openEdges.length) return level * lvl;
  if (openEdges.length === 1) {
    if (side === openEdges[0]) return (level - 1) * lvl;
    if (side === RAIL_OPPOSITE[openEdges[0]]) return level * lvl;
  }
  return (level - 0.5) * lvl;
}

/**
 * A列車で行こう's way (Norton, 2026-11-06: "比較適合香港"): one track tool, laid at a height the
 * player picks, and the game works out what carries it.
 * - 地底 ('under'): a tunnel 10 m under the flat all the way, under hills and the sea too.
 * - 高架 ('deck'): level, at the level of the viaduct it carries on from; carried off a hilltop's
 *   track over lower ground, at the hilltop's level (the hill its abutment); else three levels over
 *   the ground where it starts.
 * - 地面 ('ground'): on the ground. Between two ends at one level (the flat to the flat) it keeps
 *   that level, as A列車's track does; from one level to another it follows the ground, up and down
 *   the hillsides (OpenTTD's track on a slope).
 * At a level the ground decides: lower ground, a viaduct; ground at that level, track on it; a higher
 * hill, a tunnel, its mouths on the hillsides it meets (the drag carried on through to the far one).
 * Where the drag meets track at another height, the way between is put in at that end: a ramp (five
 * straight tiles, three levels) between the ground and a viaduct, a portal (four, on the flat)
 * between the ground and a tunnel, or both.
 * Pure with `env`: level(r, c), openEdges(r, c), inside(r, c), canGround(r, c), canDeck(r, c) and
 * groundAt(key, side). Returns { ok, reason, bad, path (carried on through a hill), assign: { key:
 * code, '' for ground track }, level, follow }.
 */
function planRailAtHeight(height, path0, bits, elev, env) {
  const lvl = METRO_RAIL.hillLevelMetres;
  const path = path0.slice();
  const assign = {};
  const out = { ok: false, reason: null, path, assign, level: null, follow: false };
  const refuse = (reason, p) => { out.reason = reason; if (p) out.bad = railKey(p.row, p.col); return out; };
  if (path.length < 2) return refuse('tooShort');
  const keyOf = (p) => railKey(p.row, p.col);
  const has = (p) => Boolean(bits[keyOf(p)]);
  const topAt = (i) => env.level(path[i].row, path[i].col);
  const flatAt = (i) => !env.openEdges(path[i].row, path[i].col).length;
  const n = path.length;

  // What each end meets: the track on it, or beyond it in line - { kind: 'under' | 'ground' |
  // 'level' (a viaduct's, a hill tunnel's), level }, or null.
  const joinAt = (i, j) => {
    const toward = railSideTowards(path[i], path[j]);
    let k = keyOf(path[i]);
    if (!bits[k]) {
      const [dr, dc] = RAIL_DIRS[RAIL_OPPOSITE[toward]];
      k = railKey(path[i].row + dr, path[i].col + dc);
      if (!railBitsOf(bits[k] || 0).some((b) => RAIL_BIT_SIDES[b].includes(toward))) return null;
    }
    const ground = env.groundAt(k, toward);
    const m = railSideHeight(elev[k], toward, ground);
    if (m < -0.01) return { kind: 'under', level: 0 };
    if (Math.abs(m - ground) < 0.01) return { kind: 'ground', level: Math.round(m / lvl) };
    return { kind: 'level', level: Math.round(m / lvl) };
  };
  const first = has(path[0]) ? 1 : 0;
  const last = has(path[n - 1]) ? n - 2 : n - 1;
  const js = joinAt(0, 1), je = joinAt(n - 1, n - 2);

  // the run's level
  let L = null;
  if (height === 'deck') {
    const levels = [js, je].filter((j) => j && j.kind === 'level').map((j) => j.level);
    if (levels.length === 2 && levels[0] !== levels[1]) return refuse('deckLevels');
    // (off a hilltop's track, over ground lower than it)
    const abuts = (j, i) => j && j.kind === 'ground' && j.level > 0 && i >= 0 && i < n
      && env.groundAt(keyOf(path[i]), null) < j.level * lvl - 0.01;
    if (levels.length) L = levels[0];
    else if (abuts(js, first)) L = js.level;
    else if (abuts(je, last)) L = je.level;
    else if (js && js.kind === 'ground') L = js.level + 3;
    else if (je && je.kind === 'ground') L = je.level + 3;
    else L = topAt(Math.min(first, n - 1)) + 3;
    if (L > 9) return refuse('deckHill');
  } else if (height === 'ground') {
    const groundOf = (j, i) => (!j ? topAt(Math.max(0, Math.min(i, n - 1))) : j.kind === 'ground' ? j.level : j.kind === 'under' ? 0 : j.level - 3);
    const a = groundOf(js, first), b = groundOf(je, last);
    if (a === b) L = a; else out.follow = true;
  }
  out.level = L;

  // the ways between at each end, from the end out to the run
  const runKind = height === 'under' ? 'under' : height === 'deck' ? 'level' : 'ground';
  const piecesFor = (j) => {
    if (!j) return [];
    if (runKind === 'under') {
      if (j.kind === 'under') return [];
      if (j.kind === 'ground') return j.level === 0 ? ['portalDown'] : { refuse: 'portalFlat' };
      return j.level === 3 ? ['rampDown', 'portalDown'] : { refuse: 'rampHeight' };
    }
    if (runKind === 'level') {
      if (j.kind === 'level') return [];
      if (j.kind === 'ground') return j.level === L ? [] : j.level + 3 === L ? ['rampUp'] : { refuse: 'rampHeight' };
      return L === 3 ? ['portalUp', 'rampUp'] : { refuse: 'rampHeight' };
    }
    if (j.kind === 'ground') return [];
    return j.kind === 'under' ? ['portalUp'] : ['rampDown'];
  };
  const taken = new Set();
  // lays `pieces` on the new tiles in `order` (path indices, out from the end); a refusal or null
  const lay = (pieces, order, j, dir) => {
    let at = 0;
    let cur = j.kind === 'under' ? 0 : j.level;
    for (const piece of pieces) {
      const ramp = piece.startsWith('ramp');
      const N = ramp ? METRO_RAIL.rampTiles : METRO_RAIL.portalTiles;
      const groundLevel = piece === 'rampUp' ? cur : piece === 'rampDown' ? cur - 3 : 0;
      for (let s = 0; s < N; s++, at++) {
        const i = order[at];
        if (i == null || taken.has(i) || has(path[i])) return { reason: ramp ? 'rampShort' : 'portalShort', p: path[order[0]] };
        const p = path[i];
        const nextP = path[i + dir], prevP = path[i - dir];
        const away = nextP ? railSideTowards(p, nextP) : RAIL_OPPOSITE[railSideTowards(p, prevP)];
        const back = RAIL_OPPOSITE[away];
        if (nextP && prevP && railSideTowards(p, prevP) !== back) return { reason: ramp ? 'rampStraight' : 'portalStraight', p };
        if (!flatAt(i) || topAt(i) !== groundLevel || !env.canGround(p.row, p.col)) return { reason: ramp ? 'rampGround' : 'portalGround', p };
        taken.add(i);
        assign[keyOf(p)] = piece === 'rampUp' ? `${s + 1}${away}` : piece === 'rampDown' ? `${N - s}${back}`
          : piece === 'portalDown' ? `p${s + 1}${away}` : `p${N - s}${back}`;
      }
      cur = piece === 'rampUp' ? cur + 3 : piece === 'rampDown' ? cur - 3 : 0;
    }
    return null;
  };
  const ups = [];
  for (let i = first; i <= last; i++) ups.push(i);
  for (const [j, order, dir] of [[js, ups, 1], [je, ups.slice().reverse(), -1]]) {
    const pieces = piecesFor(j);
    if (!Array.isArray(pieces)) return refuse(pieces.refuse, path[order[0] ?? 0]);
    const bad = pieces.length ? lay(pieces, order, j, dir) : null;
    if (bad) return refuse(bad.reason, bad.p);
  }

  // the run
  for (let i = first; i <= last; i++) {
    const p = path[i];
    if (taken.has(i) || has(p)) continue;
    let code;
    if (height === 'under') code = 'u';
    else if (out.follow) {
      if (!env.canGround(p.row, p.col)) return refuse('ground', p);
      code = '';
    } else {
      const top = topAt(i);
      if (top > L) code = 'hill';
      else if (top === L && flatAt(i)) {
        if (!env.canGround(p.row, p.col)) return refuse('ground', p);
        code = '';
      } else {
        if (L < 1 || !env.canDeck(p.row, p.col)) return refuse(L < 1 ? 'ground' : 'deckGround', p);
        code = railDeckCodeAt(L);
      }
    }
    assign[keyOf(p)] = code;
  }

  // through the hills: a mouth on the hillside each way, a level above the tunnel, facing along it
  for (let i = 0; i < path.length; i++) {
    if (assign[keyOf(path[i])] !== 'hill') continue;
    if (i === 0) return refuse('hillStart', path[0]);
    let j = i;
    while (j + 1 < path.length && assign[keyOf(path[j + 1])] === 'hill') j++;
    if (j === path.length - 1) {
      // the drag ends in the hill: carried on, straight, to its far side
      const dir = railSideTowards(path[j - 1], path[j]);
      const [dr, dc] = RAIL_DIRS[dir];
      for (let k = 0; k < 40; k++) {
        const end = path[path.length - 1];
        const q = { row: end.row + dr, col: end.col + dc };
        if (!env.inside(q.row, q.col) || env.level(q.row, q.col) <= L) break;
        if (has(q)) return refuse('hillTrack', q);
        path.push(q);
        assign[keyOf(q)] = 'hill';
      }
      j = path.length - 1;
    }
    const outIn = railSideTowards(path[i], path[i - 1]);
    const outOut = j + 1 < path.length ? railSideTowards(path[j], path[j + 1]) : railSideTowards(path[j - 1], path[j]);
    for (let k = i; k <= j; k++) {
      const inSide = railSideTowards(path[k], path[k - 1]);
      const outSide = k + 1 < path.length ? railSideTowards(path[k], path[k + 1]) : RAIL_OPPOSITE[inSide];
      if (outSide !== RAIL_OPPOSITE[inSide]) return refuse('hillStraight', path[k]);
    }
    const mouth = (k, side) => {
      const e = env.openEdges(path[k].row, path[k].col);
      return env.level(path[k].row, path[k].col) === L + 1 && e.length === 1 && e[0] === side;
    };
    if (i === j || !mouth(i, outIn)) return refuse('hillMouth', path[i]);
    if (!mouth(j, outOut)) return refuse(j === path.length - 1 && env.level(path[j].row, path[j].col) > L + 1 ? 'hillNoExit' : 'hillMouth', path[j]);
    assign[keyOf(path[i])] = `T${L}${outIn}`;
    assign[keyOf(path[j])] = `T${L}${outOut}`;
    for (let k = i + 1; k < j; k++) assign[keyOf(path[k])] = `t${L}`;
    i = j;
  }
  out.ok = true;
  return out;
}

// What a tile's code makes it, for the cost and the label: 'ground', 'deck', 'ramp', 'portal',
// 'under', 'hill' or 'mouth'. Pure.
function railCodeKind(code) {
  if (!code) return 'ground';
  if (railDeckLevel(code) != null) return 'deck';
  if (code === 'u') return 'under';
  if (code[0] === 'p') return 'portal';
  if (code[0] === 't') return 'hill';
  if (code[0] === 'T') return 'mouth';
  return 'ramp';
}
/**
 * Track joined across a tile's side at two heights (ground track run into a deck's end, say): the
 * first of `keys` so joined, or null. Pure.
 */
function railLevelMismatch(bits, elev, keys, groundAt = () => 0) {
  for (const k of keys) {
    const [r, c] = k.split(':').map(Number);
    for (const bit of railBitsOf(bits[k] || 0)) {
      for (const sideHere of RAIL_BIT_SIDES[bit]) {
        const [dr, dc] = RAIL_DIRS[sideHere];
        const nk = railKey(r + dr, c + dc);
        const back = RAIL_OPPOSITE[sideHere];
        if (!railBitsOf(bits[nk] || 0).some((b) => RAIL_BIT_SIDES[b].includes(back))) continue;
        if (Math.abs(railSideHeight(elev[k], sideHere, groundAt(k, sideHere)) - railSideHeight(elev[nk], back, groundAt(nk, back))) > 0.01) return k;
      }
    }
  }
  return null;
}

/**
 * The run a tile belongs to: it and every tile of its kind - up (viaduct) or down (tunnel) - joined
 * to it through the track. Pure. [key].
 */
function railElevatedRun(bits, elev, startKey) {
  const kind = railIsDown(elev[startKey]) ? railIsDown : railIsHill(elev[startKey]) ? railIsHill : railIsUp;
  const seen = new Set([startKey]);
  const queue = [startKey];
  while (queue.length) {
    const k = queue.shift();
    const [r, c] = k.split(':').map(Number);
    railBitsOf(bits[k] || 0).forEach((b) => RAIL_BIT_SIDES[b].forEach((s) => {
      const [dr, dc] = RAIL_DIRS[s];
      const nk = railKey(r + dr, c + dc);
      if (seen.has(nk) || !kind(elev[nk])) return;
      if (!railBitsOf(bits[nk] || 0).some((nb) => RAIL_BIT_SIDES[nb].includes(RAIL_OPPOSITE[s]))) return;
      seen.add(nk); queue.push(nk);
    }));
  }
  return [...seen];
}

/** The tiles whose bits the track cannot have (combinations with no layout): [key]. Pure. */
function railBadTiles(bits) {
  return Object.entries(bits).filter(([, mask]) => mask && !RAIL_ALLOWED_MASKS.has(mask)).map(([key]) => key);
}

// ── In the game ───────────────────────────────────────────────────────────────

function getMetroTrackBits() {
  return typeof getMetroState === 'function' ? getMetroState().tracks : {};
}

// Bumped whenever track is laid or taken up (surface lines' geometry is worked out again).
let metroTrackRevision = 0;
function metroTrackRevisionKey() {
  return metroTrackRevision;
}

// Where track may be laid: open ground - the flat, a hilltop, or a hillside falling one way (OpenTTD:
// the track up it, along it) - nothing built on it.
function canLayMetroTrackAt(row, col) {
  if (!isInsideMap(row, col)) return false;
  if (mapData[row][col] === WATER || mapData[row][col] === ROAD) return false;
  if (typeof isBridgeTile === 'function' && isBridgeTile(row, col)) return false;
  if (typeof isSlopeTile === 'function' && isSlopeTile(row, col) && getHillOpenEdges(row, col).length !== 1) return false;
  const id = getTileId(row, col);
  if (buildingData[id] || activeScene?.buildingSprites?.has(id)) return false;
  if (typeof isMetroStationTile === 'function' && isMetroStationTile(row, col)) return false;
  if (typeof isUnderseaTunnelTile === 'function' && isUnderseaTunnelTile(row, col)) return false;
  if (typeof isPromenadeTile === 'function' && isPromenadeTile(row, col)) return false;
  return true;
}

// ... and level ground, the flat or a hilltop (a ramp's tiles), or the flat (a portal's).
function canLayMetroTrackLevelAt(row, col) {
  return canLayMetroTrackAt(row, col) && !(typeof isSlopeTile === 'function' && isSlopeTile(row, col));
}

function canLayMetroTrackFlatAt(row, col) {
  return canLayMetroTrackAt(row, col) && getTileHeight(row, col) === 0;
}

// The open edges of a hill's tile (none on the flat or a hilltop).
function metroOpenEdges(row, col) {
  if (!isInsideMap(row, col) || getTileHeight(row, col) <= 0) return [];
  return typeof isSlopeTile === 'function' && isSlopeTile(row, col) ? getHillOpenEdges(row, col) : [];
}

// A tile's ground at a side (null: its middle), metres above the flat (railGroundAt).
function metroGroundMetresAt(key, side = null) {
  const [row, col] = key.split(':').map(Number);
  if (!isInsideMap(row, col)) return 0;
  return railGroundAt(getTileHeight(row, col), metroOpenEdges(row, col), side);
}

// The ground's top on a tile, levels (a hillside's: its top).
function metroGroundTopAt(row, col) {
  return isInsideMap(row, col) ? getTileHeight(row, col) : 0;
}

function isMetroTrackTile(row, col) {
  if (typeof getTransportExpansionState !== 'function') return false;
  const tracks = getTransportExpansionState()?.metro?.tracks;
  return Boolean(tracks && tracks[railKey(row, col)]);
}

// The height the track tool lays at (A列車式, Norton 2026-11-06): 'under' 地底, 'ground' 地面 or
// 'deck' 高架, picked in the metro flyout.
let metroRailHeight = 'ground';
const METRO_RAIL_HEIGHTS = Object.freeze(['under', 'ground', 'deck']);

function getMetroRailHeight() {
  return metroRailHeight;
}

function setMetroRailHeight(height) {
  if (!METRO_RAIL_HEIGHTS.includes(height)) return;
  metroRailHeight = height;
  if (typeof document !== 'undefined') {
    document.querySelectorAll('[data-metro-height]').forEach((button) => {
      const on = button.dataset.metroHeight === height;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-checked', String(on));
    });
  }
  if (typeof activeScene !== 'undefined' && activeScene) refreshMetroUndergroundView(activeScene, true);
}

function getMetroTrackElev() {
  return typeof getMetroState === 'function' ? (getMetroState().trackElev || {}) : {};
}

// Where a viaduct's pier may stand: the ground (a hill's too: the deck's level keeps it clear) or a
// road, nothing built there.
function canDeckMetroTrackAt(row, col) {
  if (!isInsideMap(row, col)) return false;
  if (mapData[row][col] === WATER) return false;
  if (typeof isBridgeTile === 'function' && isBridgeTile(row, col)) return false;
  const id = getTileId(row, col);
  if (buildingData[id] || activeScene?.buildingSprites?.has(id)) return false;
  if (typeof isMetroStationTile === 'function' && isMetroStationTile(row, col)) return false;
  if (typeof isUnderseaTunnelTile === 'function' && isUnderseaTunnelTile(row, col)) return false;
  if (typeof isPromenadeTile === 'function' && isPromenadeTile(row, col)) return false;
  return true;
}

// The map as planRailAtHeight sees it.
function metroRailEnv() {
  return {
    level: (row, col) => (isInsideMap(row, col) ? getTileHeight(row, col) : 0),
    openEdges: metroOpenEdges,
    inside: isInsideMap,
    canGround: canLayMetroTrackAt,
    canDeck: canDeckMetroTrackAt,
    groundAt: metroGroundMetresAt,
  };
}

const METRO_RAIL_KIND_COST = Object.freeze({
  ground: () => METRO_RAIL.costPerTile,
  deck: () => METRO_RAIL.deckCostPerTile,
  ramp: () => METRO_RAIL.rampCostPerTile,
  portal: () => METRO_RAIL.portalCostPerTile,
  mouth: () => METRO_RAIL.portalCostPerTile,
  hill: () => METRO_RAIL.hillTunnelCostPerTile,
  under: (sea) => (sea ? METRO_RAIL.seaTunnelCostPerTile : METRO_RAIL.tunnelCostPerTile),
});

/**
 * What a drag of the track tool at `height` would do (planRailAtHeight on the map, then the track's
 * own rules): { ok, reason, bad, path, bits, elev, cost, newTiles, clearTiles (whose ground it
 * takes), kinds: { kind: tiles } }.
 */
function planMetroTrack(start, end, height = metroRailHeight) {
  const out = { ok: false, reason: null, path: railDragPath(start, end), cost: 0, newTiles: [], clearTiles: [], kinds: {}, height };
  if (typeof isMetroUnlocked === 'function' && !isMetroUnlocked()) { out.reason = 'locked'; return out; }
  const bits = getMetroTrackBits();
  const elev = getMetroTrackElev();
  const plan = planRailAtHeight(height, out.path, bits, elev, metroRailEnv());
  out.path = plan.path;
  if (!plan.ok) { out.reason = plan.reason; out.bad = plan.bad; return out; }
  const path = plan.path;
  const next = addRailPathBits(bits, path);
  // (a platform's tiles stay one straight)
  if (typeof isMetroSurfaceStationTile === 'function'
    && path.some(({ row, col }) => isMetroSurfaceStationTile(row, col) && next[railKey(row, col)] !== bits[railKey(row, col)])) {
    out.reason = 'platform'; return out;
  }
  const nextElev = { ...elev };
  Object.entries(plan.assign).forEach(([k, code]) => { if (code) nextElev[k] = code; else delete nextElev[k]; });
  const junctions = railBadTiles(next);
  if (junctions.length) { out.reason = 'junction'; out.bad = junctions[0]; return out; }
  // a viaduct's, a ramp's, a portal's and a hill tunnel's pictures have no points (a tunnel may: it
  // is drawn as the ground track)
  const plain = Object.keys(nextElev).find((k) => next[k] && nextElev[k] !== 'u' && !RAIL_PLAIN_MASKS.has(next[k]));
  if (plain) { out.reason = railIsDown(nextElev[plain]) || railIsHill(nextElev[plain]) ? 'tunnelPoints' : 'deckPoints'; out.bad = plain; return out; }
  // (up a hillside only straight along it, as OpenTTD's track)
  const askew = path.find(({ row, col }) => {
    const k = railKey(row, col);
    const edges = metroOpenEdges(row, col);
    return !nextElev[k] && edges.length === 1 && next[k] !== (edges[0] === 'n' || edges[0] === 's' ? 1 : 2);
  });
  if (askew) { out.reason = 'slopeAxis'; out.bad = railKey(askew.row, askew.col); return out; }
  const mismatch = railLevelMismatch(next, nextElev, path.map(({ row, col }) => railKey(row, col)), metroGroundMetresAt);
  if (mismatch) { out.reason = 'levelJoin'; out.bad = mismatch; return out; }
  out.newTiles = Object.keys(plan.assign);
  out.newTiles.forEach((k) => {
    const [r, c] = k.split(':').map(Number);
    const kind = railCodeKind(plan.assign[k]);
    out.kinds[kind] = (out.kinds[kind] || 0) + 1;
    out.cost += METRO_RAIL_KIND_COST[kind](isInsideMap(r, c) && mapData[r][c] === WATER);
    // (a tunnel runs under whatever is there, and through a hill; a road runs on under a viaduct)
    if (kind === 'under' || kind === 'hill' || (kind === 'deck' && mapData[r][c] === ROAD)) return;
    out.clearTiles.push(k);
  });
  out.bits = next;
  out.elev = nextElev;
  out.level = plan.level;
  out.ok = true;
  return out;
}

const METRO_TRACK_REFUSALS = Object.freeze({
  locked: ['metro.track.locked', '城市人口要有 30,000 先可以起地鐵。'],
  tooShort: ['metro.track.tooShort', '拖長啲：路軌最少兩格。'],
  ground: ['metro.track.ground', '路軌要起喺空地上（唔可以喺水、路或者建築上面）：過馬路用高架，過海用地底。'],
  junction: ['metro.track.junction', '呢個路軌組合起唔到（例如兩條斜綫交叉、四向分叉）。'],
  deckPoints: ['metro.track.deckPoints', '高架、上落橋同隧道口唔可以有道岔：道岔要起喺地面或者地底。'],
  funds: ['metro.track.funds', '公司資金唔夠起路軌（要 ${cost}）。'],
  deckHill: ['metro.track.deckHill', '高架太高：最多九層。'],
  deckLevels: ['metro.track.deckLevels', '兩頭嘅高架唔一樣高：唔可以咁樣駁埋一齊。'],
  slopeAxis: ['metro.track.slopeAxis', '山坡上嘅路軌要沿住斜坡直上直落（唔可以打橫或者轉彎）。'],
  hillStart: ['metro.track.hillStart', '由山外面拖入去：隧道口要喺山坡度。'],
  hillMouth: ['metro.track.hillMouth', '隧道口要喺正對路軌、高一層嘅山坡（唔可以喺山角或者打橫嘅山坡）。'],
  hillNoExit: ['metro.track.hillNoExit', '座山另一邊冇同高嘅山坡做出口：隧道起唔到。'],
  hillStraight: ['metro.track.hillStraight', '穿山隧道要直：喺山外面先轉彎。'],
  hillTrack: ['metro.track.hillTrack', '隧道經過嘅地方已經有路軌。'],
  levelJoin: ['metro.track.levelJoin', '唔同高度嘅路軌唔可以喺度相交或者駁埋：換個位，或者喺路軌盡頭接駁。'],
  platform: ['metro.track.platform', '月台嗰五格要保持直路：喺月台外面分叉。'],
  rampShort: ['metro.track.rampShort', '上落橋要五格直路：拖長啲先駁到嗰頭。'],
  rampStraight: ['metro.track.rampStraight', '上落橋要五格直路：喺上落橋外面先轉彎。'],
  rampGround: ['metro.track.rampGround', '上落橋要起喺五格同一高度嘅空地上（唔可以喺山坡、路或者建築上面）。'],
  rampHeight: ['metro.track.rampHeight', '高度唔夾：上落橋一次上落三層。'],
  portalShort: ['metro.track.portalShort', '隧道口要四格直路：拖長啲先駁到嗰頭。'],
  portalStraight: ['metro.track.portalStraight', '隧道口要四格直路：喺隧道口外面先轉彎。'],
  portalGround: ['metro.track.portalGround', '隧道口要起喺平地空地上（唔可以喺山、路或者建築上面）。'],
  portalFlat: ['metro.track.portalFlat', '落地底要由平地開始：山上面嘅路軌入唔到地底。'],
  deckGround: ['metro.track.deckGround', '高架橋墩要落喺地面或者馬路上（唔可以喺水或者建築上面）。'],
  tunnelPoints: ['metro.track.tunnelPoints', '隧道口同穿山隧道唔可以有道岔：喺地面或者地底分叉。'],
});

function metroTrackRefusal(reason, vars = {}) {
  const [key, fallback] = METRO_TRACK_REFUSALS[reason] || METRO_TRACK_REFUSALS.ground;
  return metroT(key, fallback, vars);
}

// What a drag lays, for the label and the toast: 「地面 3 格、上落橋 5 格、高架 8 格」.
const METRO_RAIL_KIND_NAMES = Object.freeze({
  ground: ['metro.kind.ground', '地面'],
  deck: ['metro.kind.deck', '高架'],
  ramp: ['metro.kind.ramp', '上落橋'],
  portal: ['metro.kind.portal', '隧道口'],
  under: ['metro.kind.under', '地底'],
  hill: ['metro.kind.hill', '穿山隧道'],
  mouth: ['metro.kind.mouth', '山邊隧道口'],
});

function metroTrackSummary(kinds) {
  const sep = metroT('metro.kind.separator', '、');
  return Object.keys(METRO_RAIL_KIND_NAMES).filter((k) => kinds[k]).map((k) => {
    const [key, fallback] = METRO_RAIL_KIND_NAMES[k];
    return metroT('metro.kind.tiles', '{kind} {n} 格', { kind: metroT(key, fallback), n: kinds[k] });
  }).join(sep);
}

// The drag's end (tool-menu.js pointerup): lay it, or say why not.
function commitMetroTrackDrag(scene, start, end, height = metroRailHeight) {
  const plan = planMetroTrack(start, end, height);
  const warn = (msg) => { if (typeof showToast === 'function') showToast(msg, 'warning'); return false; };
  if (!plan.ok) return warn(metroTrackRefusal(plan.reason));
  if (plan.cost > 0 && !spendMetroFunds(plan.cost)) return warn(metroTrackRefusal('funds', { cost: plan.cost.toLocaleString() }));
  plan.clearTiles.forEach((k) => {
    const [row, col] = k.split(':').map(Number);
    if (typeof removeTree === 'function') removeTree(scene, row, col);
    if (typeof removeDebris === 'function') removeDebris(scene, row, col);
    if (typeof removeZoneOverlay === 'function') removeZoneOverlay(scene, row, col);
    if (typeof zoneMap !== 'undefined' && zoneMap[row]) zoneMap[row][col] = typeof ZONE_NONE !== 'undefined' ? ZONE_NONE : 0;
  });
  const state = getMetroState();
  state.tracks = plan.bits;
  state.trackElev = plan.elev;
  metroTrackRevision += 1;
  syncMetroTracks(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof showToast === 'function' && plan.cost > 0) {
    showToast(metroT('metro.track.builtMixed', '起好路軌：{parts}（${cost}）。', { parts: metroTrackSummary(plan.kinds), cost: plan.cost.toLocaleString() }), 'success');
  }
  return true;
}

// The bulldozer on track: that tile's track taken up (an elevated tile takes its whole viaduct,
// ramps and all, with it). True when there was track there.
function demolishMetroTrackAt(scene, row, col) {
  const bits = getMetroTrackBits();
  const key = railKey(row, col);
  if (!bits[key]) return false;
  // a tunnel lies under what is on the ground: taken up only in the 地底 view
  if ((getMetroTrackElev()[key] === 'u' || (getMetroTrackElev()[key] || '')[0] === 't') && !isMetroUndergroundView()) return false;
  // not under a platform, nor where a surface line runs (metro-surface-lines.js)
  const say = (k, fallback) => { if (typeof showToast === 'function') showToast(metroT(k, fallback), 'warning'); return true; };
  if (typeof isMetroSurfaceStationTile === 'function' && isMetroSurfaceStationTile(row, col)) {
    return say('metro.track.underStation', '路軌上面有地面站：先拆咗個站。');
  }
  const elev = getMetroTrackElev();
  const run = elev[key] ? railElevatedRun(bits, elev, key) : [key];
  // (a viaduct with a 高架站 on it stays until the station goes)
  if (typeof isMetroSurfaceStationTile === 'function' && run.some((k) => { const [r, c] = k.split(':').map(Number); return isMetroSurfaceStationTile(r, c); })) {
    return say('metro.track.underStation', '路軌上面有地面站：先拆咗個站。');
  }
  const used = typeof getMetroSurfaceLineTiles === 'function' ? getMetroSurfaceLineTiles() : new Set();
  if (run.some((k) => used.has(k))) {
    return say('metro.track.inUse', '有地面綫行緊呢段路軌：先喺運輸公司路線表移走條綫。');
  }
  const next = { ...bits };
  const nextElev = { ...elev };
  run.forEach((k) => { delete next[k]; delete nextElev[k]; });
  getMetroState().tracks = next;
  getMetroState().trackElev = nextElev;
  metroTrackRevision += 1;
  syncMetroTracks(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

// ── On the map ────────────────────────────────────────────────────────────────

// A tile's bits as drawn, the map turned as it is: each bit's two sides turned, then the bit
// joining those.
function railVisualMask(mask, turn = typeof mapRotation === 'number' ? mapRotation : 0) {
  return railBitsOf(mask).reduce((out, bit) => {
    const [a, b] = RAIL_BIT_SIDES[bit].map((side) => rotateDirection(side, turn));
    return out | railBitFor(a, b);
  }, 0);
}

function metroTrackTextureKey(mask) {
  const layout = typeof getRailwayTrackLayout === 'function' ? getRailwayTrackLayout(railVisualMask(mask)) : null;
  return layout ? layout.asset : null;
}

// The track as sprites, made, moved or dropped to match (after laying, a bulldozer, a load or a
// turn of the map: syncMetroStations calls this).
function syncMetroTracks(scene) {
  if (!scene?.add || typeof getTransportExpansionState !== 'function') return;
  if (!scene.metroTrackSprites) scene.metroTrackSprites = new Map();
  const metro = getTransportExpansionState()?.metro;
  const bits = metro?.tracks || {};
  const elev = metro?.trackElev || {};
  // the viaduct's pictures are loaded the first time there is one
  if (Object.keys(elev).length && METRO_VIADUCT_TEXTURES.some((t) => !scene.textures.exists(t.key))) {
    loadMetroViaductTextures(scene).then(() => syncMetroTracks(scene));
  }
  scene.metroTrackSprites.forEach((sprite, key) => {
    if (!bits[key] || Boolean(elev[key]) !== Boolean(sprite.__elevated)) { sprite.destroy(); scene.metroTrackSprites.delete(key); }
  });
  // an island station's tiles: its end tiles' decks spread the tracks; its own five are drawn with
  // the station (metro-surface-lines.js syncMetroPlatforms), none here
  const island = typeof getMetroIslandTileTextures === 'function' ? getMetroIslandTileTextures() : new Map();
  island.forEach((texture, key) => {
    if (texture || !scene.metroTrackSprites.has(key)) return;
    scene.metroTrackSprites.get(key).destroy();
    scene.metroTrackSprites.delete(key);
  });
  if (!scene.metroPortalFronts) scene.metroPortalFronts = new Map();
  if (!scene.metroPierSprites) scene.metroPierSprites = new Map();
  const fronts = new Set();
  const piers = new Set();
  const turn = typeof mapRotation === 'number' ? mapRotation : 0;
  Object.entries(bits).forEach(([key, mask]) => {
    const [row, col] = key.split(':').map(Number);
    const code = elev[key];
    if (island.has(key) && !island.get(key)) return;
    // a tunnel, and inside a hill, drawn only in the 地底 view (syncMetroUnderground); a portal's
    // trough before the trains, its front after them
    if (code === 'u' || (code && code[0] === 't')) return;
    if (code && code[0] === 'p') { fronts.add(key); syncMetroPortalFront(scene, key, row, col, code); }
    const deck = railDeckLevel(code);
    const edges = code ? [] : metroOpenEdges(row, col);
    const slopeUp = edges.length === 1 ? rotateDirection(RAIL_OPPOSITE[edges[0]], turn) : null;
    let texture = island.get(key);
    if (!texture) {
      if (deck != null) texture = `${metroViaductTextureKey(mask, 'd')}_np`;
      else if (code && code[0] === 'T') texture = `metro_hilltunnel_${rotateDirection(code[2], turn)}`;
      else if (code) texture = metroViaductTextureKey(mask, code);
      else texture = slopeUp ? `metro_track_slope_${slopeUp}` : metroTrackTextureKey(mask);
    }
    if (!texture || !scene.textures.exists(texture)) return;
    let sprite = scene.metroTrackSprites.get(key);
    if (!sprite) {
      sprite = scene.add.image(0, 0, texture);
      // a viaduct stands up among the buildings; ground track lies with the roads
      addToRenderLayer(scene, sprite, code ? 'objectLayer' : 'roadLayer');
      if (scene.worldMask) sprite.setMask(scene.worldMask);
      sprite.__elevated = Boolean(code);
      scene.metroTrackSprites.set(key, sprite);
    } else if (sprite.texture.key !== texture) {
      sprite.setTexture(texture);
    }
    const face = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    const viaductOrigin = () => sprite.setOrigin(METRO_VIADUCT_ART.centre[0] / METRO_VIADUCT_ART.width, METRO_VIADUCT_ART.centre[1] / METRO_VIADUCT_ART.height);
    sprite.setScale(TILE_WIDTH / (typeof RAILWAY_TRACK_TILE !== 'undefined' ? RAILWAY_TRACK_TILE.width : 512));
    sprite.setPosition(face.center.x, face.center.y);
    if (code && code[0] === 'p') {
      // down in the ground, with the roads (the trains in it after, its front after them)
      sprite.setOrigin(METRO_PORTAL_ART.centre[0] / METRO_PORTAL_ART.width, METRO_PORTAL_ART.centre[1] / METRO_PORTAL_ART.height);
      sprite.setDepth(getWorldDepth('road', face.center.y + 1));
    } else if ((code && code[0] === 'T') || slopeUp) {
      // a hill tunnel's mouth, the track up a hillside: on the hill's tile (its face at the foot)
      viaductOrigin();
      sprite.setDepth(getWorldDepth('road', face.center.y + 1));
    } else if (deck != null) {
      // a deck at its level, from the flat under it; its piers down to the ground (syncMetroPiers)
      const flat = metroFlatTileCentre(scene, row, col);
      sprite.setPosition(flat.x, flat.y - (deck - 3) * metroLevelPx());
      viaductOrigin();
      const pos = isoToScreen(col, row);
      sprite.setDepth(getBuildingSortDepth(pos.y, 1, 1, 0));
      if (!island.get(key)) syncMetroPiers(scene, key, row, col, mask, deck, sprite.depth - 0.001, piers);
    } else if (code) {
      // a ramp, from its tile's ground (a hilltop's)
      viaductOrigin();
      const pos = isoToScreen(col, row);
      sprite.setDepth(getBuildingSortDepth(pos.y, 1, 1, 0));
    } else {
      sprite.setOrigin(0.5, 0.5);
      sprite.setDepth(getWorldDepth('road', face.center.y + 1));
    }
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  });
  scene.metroPierSprites.forEach((sprite, id) => { if (!piers.has(id)) { sprite.destroy(); scene.metroPierSprites.delete(id); } });
  scene.metroPortalFronts.forEach((sprite, key) => { if (!fronts.has(key)) { sprite.destroy(); scene.metroPortalFronts.delete(key); } });
  syncMetroUnderground(scene);
}

// A portal tile's front: the paving on the trough's near side (or over the portal's tunnel), after
// the trains in it - sorted past any car on the tile (cars are sorted by their middle).
function syncMetroPortalFront(scene, key, row, col, code) {
  const texture = `${metroViaductTextureKey(0, code).replace(/_front$/, '')}_front`;
  if (!scene.textures.exists(texture)) return;
  let sprite = scene.metroPortalFronts.get(key);
  if (!sprite) {
    sprite = scene.add.image(0, 0, texture);
    addToRenderLayer(scene, sprite, 'objectLayer');
    if (scene.worldMask) sprite.setMask(scene.worldMask);
    scene.metroPortalFronts.set(key, sprite);
  } else if (sprite.texture.key !== texture) sprite.setTexture(texture);
  const face = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
  sprite.setOrigin(METRO_PORTAL_ART.centre[0] / METRO_PORTAL_ART.width, METRO_PORTAL_ART.centre[1] / METRO_PORTAL_ART.height);
  sprite.setScale(TILE_WIDTH / METRO_PORTAL_ART.width);
  sprite.setPosition(face.center.x, face.center.y);
  sprite.setDepth(getWorldDepth('object', isoToScreen(col + 0.5, row + 0.5).y + TILE_HEIGHT * 0.6));
  if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
}

// A terrain level on screen, px (HEIGHT_STEP_PIXELS at TILE_WIDTH 100).
function metroLevelPx() {
  return METRO_RAIL.hillLevelMetres * 10 * (TILE_WIDTH / 512);
}

// A deck's piers, drawn apart (its pictures have none): under the middle of each track's line on the
// tile, as drawn, from the ground there up under the deck - any length (metro_pier_{k}, k half levels).
function syncMetroPiers(scene, key, row, col, mask, deck, depth, wanted) {
  const visual = railVisualMask(mask);
  // (in the tile's frame as drawn, metres from its north corner: a straight's at its middle, a
  // diagonal's 5 m in from its corner)
  const spots = new Map();
  railBitsOf(visual).forEach((bit) => {
    const at = { 1: [10, 10], 2: [10, 10], 4: [5, 5], 8: [15, 15], 16: [5, 15], 32: [15, 5] }[bit];
    spots.set(at.join(), at);
  });
  const flat = metroFlatTileCentre(scene, row, col);
  const ground = metroGroundMetresAt(key, null);
  const half = METRO_RAIL.hillLevelMetres / 2;
  const k = Math.max(1, Math.min(24, Math.round((deck * METRO_RAIL.hillLevelMetres - ground) / half)));
  const texture = `metro_pier_${k}`;
  if (!scene.textures.exists(texture)) return;
  [...spots.values()].forEach(([c, r], i) => {
    const id = `${key}|${i}`;
    wanted.add(id);
    let sprite = scene.metroPierSprites.get(id);
    if (!sprite) {
      sprite = scene.add.image(0, 0, texture);
      addToRenderLayer(scene, sprite, 'objectLayer');
      if (scene.worldMask) sprite.setMask(scene.worldMask);
      scene.metroPierSprites.set(id, sprite);
    } else if (sprite.texture.key !== texture) sprite.setTexture(texture);
    const src = scene.textures.get(texture).getSourceImage();
    sprite.setOrigin(0.5, (src.height - 22) / src.height);
    sprite.setScale(TILE_WIDTH / 512);
    sprite.setPosition(flat.x + (c - r) * (TILE_WIDTH / 2) / 20, flat.y + (c + r - 20) * (TILE_HEIGHT / 2) / 20 - ground * 10 * (TILE_WIDTH / 512));
    sprite.setDepth(depth);
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  });
}

// A tile's centre on the flat ground under it (a hill's tile's face is raised by its height).
function metroFlatTileCentre(scene, row, col) {
  const face = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY).center;
  const lift = typeof getTerrainTileVisualOffset === 'function' ? getTerrainTileVisualOffset(row, col, getTileKey(row, col)) : 0;
  return { x: face.x, y: face.y - lift };
}

// ── 地底 view (phase 4): the ground dimmed, the tunnels and what runs in them drawn over it ─────

let metroUndergroundViewOn = false;   // the 「地底」 button (transport-ui.js)
const METRO_UNDER_DEPTH = 100000;     // over everything in the world (getWorldDepth('effect', ...))

// On with the button, and while the track tool is in hand at 地底.
function isMetroUndergroundView() {
  return metroUndergroundViewOn || (typeof selectedTool !== 'undefined' && selectedTool === 'metro-track' && metroRailHeight === 'under');
}

function toggleMetroUndergroundView(on = !metroUndergroundViewOn) {
  metroUndergroundViewOn = Boolean(on);
  refreshMetroUndergroundView(typeof activeScene !== 'undefined' ? activeScene : null, true);
}

// Each frame (updateMetroSurfaceTrains): when the view comes on or goes off, the ground dimmed or
// not and the tunnels drawn or dropped; the button lit while it is on.
function refreshMetroUndergroundView(scene, force = false) {
  const on = isMetroUndergroundView();
  if (typeof document !== 'undefined') {
    const button = document.getElementById('metro-underground-toggle');
    if (button && button.classList.contains('is-open') !== metroUndergroundViewOn) {
      button.classList.toggle('is-open', metroUndergroundViewOn);
      button.setAttribute('aria-pressed', String(metroUndergroundViewOn));
    }
  }
  if (!scene?.add || (!force && Boolean(scene.__metroUnderView) === on)) return;
  scene.__metroUnderView = on;
  syncMetroUnderground(scene);
  if (typeof syncMetroPlatforms === 'function') syncMetroPlatforms(scene);
}

// The tunnels' track (as the ground track's pictures, down at the tunnel's depth) over a dimmed world.
function syncMetroUnderground(scene) {
  if (!scene?.add) return;
  if (!scene.metroUnderSprites) scene.metroUnderSprites = new Map();
  const on = isMetroUndergroundView() && typeof getTransportExpansionState === 'function' && getTransportExpansionState()?.metro;
  if (!on) {
    scene.metroUnderSprites.forEach((sprite) => sprite.destroy());
    scene.metroUnderSprites.clear();
    if (scene.metroUnderShade) scene.metroUnderShade.setVisible(false);
    return;
  }
  // the shade over the whole map, as it is turned now
  const corners = [[0, 0], [0, MAP_WIDTH - 1], [MAP_HEIGHT - 1, MAP_WIDTH - 1], [MAP_HEIGHT - 1, 0]]
    .map(([r, c]) => getTileFaceGeometry(r, c, scene.offsetX, scene.offsetY).center);
  const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
  const pad = TILE_WIDTH * 4;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad * 2, y1 = Math.max(...ys) + pad;
  if (!scene.metroUnderShade) {
    scene.metroUnderShade = scene.add.rectangle(0, 0, 10, 10, 0x0b1016, 0.72).setOrigin(0, 0);
    addToRenderLayer(scene, scene.metroUnderShade, 'objectLayer');
  }
  scene.metroUnderShade.setPosition(x0, y0).setSize(x1 - x0, y1 - y0).setVisible(true);
  scene.metroUnderShade.setDepth(getWorldDepth('effect', METRO_UNDER_DEPTH));
  const bits = getMetroTrackBits();
  const elev = getMetroTrackElev();
  const wanted = new Set();
  const scale = TILE_WIDTH / (typeof RAILWAY_TRACK_TILE !== 'undefined' ? RAILWAY_TRACK_TILE.width : 512);
  Object.entries(bits).forEach(([key, mask]) => {
    const code = elev[key];
    if (!railIsDown(code) && !(code && code[0] === 't')) return;
    const texture = metroTrackTextureKey(mask);
    if (!texture || !scene.textures.exists(texture)) return;
    wanted.add(key);
    const [row, col] = key.split(':').map(Number);
    let sprite = scene.metroUnderSprites.get(key);
    if (!sprite) {
      sprite = scene.add.image(0, 0, texture);
      addToRenderLayer(scene, sprite, 'objectLayer');
      scene.metroUnderSprites.set(key, sprite);
    } else if (sprite.texture.key !== texture) sprite.setTexture(texture);
    const flat = metroFlatTileCentre(scene, row, col);
    const down = -railSideHeight(code, null) * 10 * (TILE_WIDTH / 512);
    sprite.setOrigin(0.5, 0.5).setScale(scale).setPosition(flat.x, flat.y + down);
    sprite.setDepth(getWorldDepth('effect', METRO_UNDER_DEPTH + 1 + isoToScreen(col + 0.5, row + 0.5).y * 0.001));
  });
  scene.metroUnderSprites.forEach((sprite, key) => { if (!wanted.has(key)) { sprite.destroy(); scene.metroUnderSprites.delete(key); } });
}

// The viaduct's pictures (scripts/prepare-metro-viaduct-assets.py): a deck for each layout a tile may
// hold, and the ramps, X and Y, rising either way, three steps.
const METRO_VIADUCT_ART = Object.freeze({ width: 512, height: 544, centre: [256, 416] });
const METRO_PORTAL_ART = Object.freeze({ width: 512, height: 640, centre: [256, 416] });
const METRO_VIADUCT_TEXTURES = (() => {
  const out = [];
  ['x', 'y', 'upper', 'lower', 'left', 'right', 'cross_xy', 'parallel_horizontal', 'parallel_vertical'].forEach((n) => {
    out.push({ key: `metro_viaduct_${n}`, path: `Models/metroViaduct/metro_viaduct_${n}.png` });
    // (a deck at any level: its picture without piers, the piers drawn apart)
    out.push({ key: `metro_viaduct_${n}_np`, path: `Models/metroViaduct/metro_viaduct_${n}_np.png` });
  });
  for (let k = 1; k <= 24; k++) out.push({ key: `metro_pier_${k}`, path: `Models/metroViaduct/metro_pier_${k}.png` });
  // the track up a hillside, and a hill tunnel's mouth (OpenTTD's), each way as drawn
  ['n', 'e', 's', 'w'].forEach((d) => {
    out.push({ key: `metro_track_slope_${d}`, path: `Models/metroViaduct/metro_track_slope_${d}.png` });
    out.push({ key: `metro_hilltunnel_${d}`, path: `Models/metroViaduct/metro_hilltunnel_${d}.png` });
  });
  [['x', ['n', 's']], ['y', ['w', 'e']]].forEach(([axis, ups]) => ups.forEach((up) => [1, 2, 3, 4, 5].forEach((step) => {
    out.push({ key: `metro_ramp_${axis}_${up}${step}`, path: `Models/metroViaduct/metro_ramp_${axis}_${up}${step}.png` });
  })));
  // the island stations' end tiles, where the tracks spread (metro-surface-lines.js
  // getMetroIslandTileTextures; the station's own five tiles are its pictures there)
  [['x', ['n', 's']], ['y', ['w', 'e']]].forEach(([axis, ends]) => ends.forEach((e) => {
    out.push({ key: `metro_island_${axis}_spread_${e}`, path: `Models/metroViaduct/metro_island_${axis}_spread_${e}.png` });
  }));
  // 隧道口: three trough tiles and the portal, each going down X (n, s) or Y (w, e), a base (not on the
  // portal) and a front drawn after the trains
  [['x', ['n', 's']], ['y', ['w', 'e']]].forEach(([axis, downs]) => downs.forEach((down) => [1, 2, 3, 4].forEach((step) => {
    const name = `metro_portal_${axis}_${down}${step}`;
    if (step < 4) out.push({ key: name, path: `Models/metroViaduct/${name}.png` });
    out.push({ key: `${name}_front`, path: `Models/metroViaduct/${name}_front.png` });
  })));
  return out;
})();

function loadMetroViaductTextures(scene) {
  const wanted = METRO_VIADUCT_TEXTURES.filter((t) => !scene.textures.exists(t.key));
  if (!wanted.length) return Promise.resolve(true);
  if (scene.__metroViaductLoading) return scene.__metroViaductLoading;
  scene.__metroViaductLoading = new Promise((resolve) => {
    const start = () => {
      wanted.forEach((t) => scene.load.image(t.key, typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(t.path) : t.path));
      scene.load.once('complete', () => { scene.__metroViaductLoading = null; resolve(true); });
      scene.load.start();
    };
    if (scene.load.isLoading()) scene.load.once('complete', start); else start();
  });
  return scene.__metroViaductLoading;
}

// An elevated tile's picture as the map is turned: the deck for its bits as drawn, or the ramp
// for its axis and rising side as drawn.
function metroViaductTextureKey(mask, code) {
  const turn = typeof mapRotation === 'number' ? mapRotation : 0;
  if (code[0] === 'p') {
    const down = rotateDirection(code[2], turn);
    const name = `metro_portal_${down === 'n' || down === 's' ? 'x' : 'y'}_${down}${code[1]}`;
    return code[1] === String(METRO_RAIL.portalTiles) ? `${name}_front` : name;
  }
  if (code === 'd') {
    const layout = typeof getRailwayTrackLayout === 'function' ? getRailwayTrackLayout(railVisualMask(mask, turn)) : null;
    return layout ? layout.asset.replace('metro_track_', 'metro_viaduct_') : null;
  }
  const up = rotateDirection(code[1], turn);
  return `metro_ramp_${up === 'n' || up === 's' ? 'x' : 'y'}_${up}${code[0]}`;
}

function clearMetroTrackSprites(scene) {
  scene?.metroTrackSprites?.forEach((sprite) => sprite.destroy());
  scene?.metroPortalFronts?.forEach((sprite) => sprite.destroy());
  scene?.metroUnderSprites?.forEach((sprite) => sprite.destroy());
  scene?.metroPierSprites?.forEach((sprite) => sprite.destroy());
  if (scene) scene.metroPierSprites = new Map();
  if (scene?.metroUnderShade) { scene.metroUnderShade.destroy(); scene.metroUnderShade = null; }
  if (scene) { scene.metroTrackSprites = new Map(); scene.metroPortalFronts = new Map(); scene.metroUnderSprites = new Map(); }
}

// While dragging: the tiles it would take, green or red, and what it lays and costs, or the reason,
// by the pointer.
function drawMetroTrackDragPreview(scene, start, end, height = metroRailHeight) {
  const g = scene.bridgePreviewGraphic;
  if (!g) return;
  g.clear();
  const plan = planMetroTrack(start, end, height);
  const color = plan.ok ? 0x45e6c3 : 0xff4444;
  plan.path.forEach(({ row, col }) => {
    if (!isInsideMap(row, col)) return;
    const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    const bad = plan.bad === railKey(row, col);
    g.fillStyle(bad ? 0xff4444 : color, bad ? 0.45 : 0.22);
    g.lineStyle(2, bad ? 0xff4444 : color, 0.9);
    g.beginPath();
    g.moveTo(geom.top.x, geom.top.y); g.lineTo(geom.right.x, geom.right.y);
    g.lineTo(geom.bottom.x, geom.bottom.y); g.lineTo(geom.left.x, geom.left.y);
    g.closePath(); g.fillPath(); g.strokePath();
  });
  if (typeof showUnderseaTunnelPreviewLabel === 'function') {
    const text = plan.ok
      ? metroT('metro.track.costMixed', '{parts} ${cost}', { parts: metroTrackSummary(plan.kinds) || metroT('metro.kind.none', '冇新路軌'), cost: plan.cost.toLocaleString() })
      : metroTrackRefusal(plan.reason);
    const at = plan.path[plan.path.length - 1] || end;
    showUnderseaTunnelPreviewLabel(scene, at.row, at.col, text, plan.ok);
  }
}

// The track's upkeep for the company's month (settleMetroMonth).
function getMetroTrackMonthlyUpkeep() {
  if (typeof getTransportExpansionState !== 'function') return 0;
  return Object.keys(getTransportExpansionState()?.metro?.tracks || {}).length * METRO_RAIL.monthlyUpkeepPerTile;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { METRO_RAIL, RAIL_BIT_SIDES, railDragPath, addRailPathBits, railBadTiles, railBitFor, railVisualMask, railSideHeight, planRailAtHeight, railCodeKind, railLevelMismatch, railDeckLevel, railGroundAt, railIsHill, railElevatedRun, railIsUp, railIsDown };
}
