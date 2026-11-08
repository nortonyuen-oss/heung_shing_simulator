// 電車 (docs/tram-design.md): tram track laid on the roads. A narrow road carries a track in each
// lane; a dual carriageway's two middle pavements become the trams' own reservation, a track each,
// as on Hennessy Road. Phase 1: the track's state, and what it takes of the road - no lamp or prop on
// the reservation (Norton, 2026-11-08: 只留電車路同之後嘅電車站).

// Track on a tile: the sides it joins, as TrackBits (railway-track.js / metro-surface.js
// RAIL_BIT_SIDES: 1 X s-n, 2 Y w-e, 4 UPPER w-n, 8 LOWER s-e, 16 LEFT w-s, 32 RIGHT n-e).
const TRAM_TRACK_MASK_LIMIT = 63;

// The tram company's part of the transport company's state (transport.tram): the track, and (phase
// 2, tram-lines.js) its stops, lines and trams.
function normalizeTramState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const tracks = {};
  Object.entries(src.tracks && typeof src.tracks === 'object' ? src.tracks : {}).forEach(([key, mask]) => {
    const m = Math.floor(Number(mask));
    if (!/^\d{1,4}:\d{1,4}$/.test(key) || !(m > 0) || m > TRAM_TRACK_MASK_LIMIT) return;
    tracks[key] = m;
  });
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const text = (v, d) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : d);
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const stops = list(src.stops).map((st) => ({
    id: String(st.id), row: Math.floor(num(st.row, -1)), col: Math.floor(num(st.col, -1)),
    axis: st.axis === 'ew' ? 'ew' : 'ns', band: Boolean(st.band), name: text(st.name, '電車站'),
    waitingByLine: {},
  })).filter((st) => st.id && st.row >= 0 && st.col >= 0);
  const stopIds = new Set(stops.map((st) => st.id));
  const lines = list(src.lines).map((l) => ({
    id: String(l.id), name: text(l.name, '電車綫'), color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#2e8b57',
    stopIds: (Array.isArray(l.stopIds) ? l.stopIds.map(String) : []).filter((id) => stopIds.has(id)),
    status: l.status === 'suspended' ? 'suspended' : 'active',
    monthToDatePassengers: Math.max(0, num(l.monthToDatePassengers)), monthToDateRevenue: Math.max(0, num(l.monthToDateRevenue)),
    history: list(l.history).slice(-24),
    ...(l.newsPending ? { newsPending: true } : {}),
  })).filter((l) => l.id && l.stopIds.length >= 2);
  const lineIds = new Set(lines.map((l) => l.id));
  const trams = list(src.trams).map((v) => ({
    id: String(v.id), lineId: String(v.lineId), phase: ((num(v.phase) % 1) + 1) % 1, aboard: Math.max(0, num(v.aboard)),
    dist: Math.max(0, num(v.dist)), dwellLeft: Math.max(0, num(v.dwellLeft)), callIndex: Math.max(0, Math.floor(num(v.callIndex))),
    livery: typeof v.livery === 'string' ? v.livery : 'green', purchasePrice: Math.max(0, num(v.purchasePrice)),
    ageMonths: Math.max(0, Math.floor(num(v.ageMonths))), tilesThisMonth: Math.max(0, num(v.tilesThisMonth)),
    monthToDateRevenue: Math.max(0, num(v.monthToDateRevenue)), lastMonthRevenue: Math.max(0, num(v.lastMonthRevenue)),
  })).filter((v) => v.id && lineIds.has(v.lineId));
  return { tracks, stops, lines, trams, nextId: Math.max(1, Math.floor(num(src.nextId, 1))) };
}

function getTramState() {
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (!transport) return normalizeTramState(null);
  if (!transport.tram) transport.tram = normalizeTramState(null);
  return transport.tram;
}

function isTramTrackTile(row, col) {
  return Boolean(getTramState().tracks[`${row}:${col}`]);
}

// The kerb of a carriageway tile that faces the band's middle, where its reservation is: the side
// toward the band's other half, on the two lanes beside the middle (an even band only - an odd one's
// middle lane is shared, no reservation). Pure: `band` from getRoadCarriagewayBand. 'n'/'e'/'s'/'w'
// or null.
function tramReservationSideOf(band) {
  if (!band || band.width % 2 !== 0) return null;
  const half = band.width / 2;
  const up = band.orientation === 'v' ? 'e' : 's';     // toward a higher index (vertical: east; horizontal: south)
  const down = band.orientation === 'v' ? 'w' : 'n';
  if (band.index === half - 1) return up;
  if (band.index === half) return down;
  return null;
}

// Whether `side` of this tile is a tram reservation: tram track here, on a dual carriageway, that
// side its middle.
function isTramReservationSide(row, col, side) {
  if (!isTramTrackTile(row, col) || typeof getRoadCarriagewayBand !== 'function') return false;
  return tramReservationSideOf(getRoadCarriagewayBand(row, col)) === side;
}

// The track changed: what it takes of the road drawn again (the lamps on a reservation).
function onTramTracksChanged(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (!scene) return;
  if (typeof scheduleStreetLampRefresh === 'function') scheduleStreetLampRefresh(scene);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
}

// A stop's two platforms (docs/tram-design.md §5b, phase 3): each a tile long, its middle this far (in
// tiles) out from the road's middle - on a dual carriageway in the reservation, outside its track; on a
// narrow road on the pavement as a bus stop is, clear of the kerb's yellow line (Norton, 2026-11-08: so
// the buses and the traffic still get by) - its boarding edge toward its track.
const TRAM_STOP_OFFSET = Object.freeze({ reservation: 0.20, kerb: 0.32 });

// ── Lights at night (docs/tram-design.md §4) ─────────────────────────────────────────────────────────

// A tram's lamps, as Hong Kong's: seen from the front one big headlamp low in the middle of the dash,
// seen from behind the two red lamps at its lower corners (Norton, 2026-11-08). The pictures show one
// end (its cab at the lower right - fall - or lower left - rise): its front when the tram runs that way
// on the screen, else its back. tram-art.js `head`, `tails`: texture px. The traffic's lamp glows
// (traffic-visuals.js), the headlamp a bus's one and a third, the reds a little smaller.
const TRAM_LAMP_SCALE = Object.freeze({ head: 1.35, tail: 0.85 });
function syncTramVehicleLamps(scene, sprite, art, frontSeen, strength) {
  const lit = strength > 0.01 && art && typeof ensureTrafficLightTextures === 'function' && ensureTrafficLightTextures(scene);
  const lamps = sprite.__tramLamps || (sprite.__tramLamps = []);
  if (!lit || !sprite.visible) { lamps.forEach((l) => l.setVisible(false)); return; }
  const spots = frontSeen ? [art.head] : art.tails;
  const key = frontSeen ? TRAFFIC_LIGHT_CONFIG.headlightTextureKey : TRAFFIC_LIGHT_CONFIG.taillightTextureKey;
  const scale = (frontSeen ? TRAM_LAMP_SCALE.head : TRAM_LAMP_SCALE.tail) * (TILE_WIDTH / 100);
  spots.forEach(([lx, ly], i) => {
    let lamp = lamps[i];
    if (!lamp) {
      lamp = scene.add.image(0, 0, key);
      if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, lamp, 'objectLayer');
      if (scene.worldMask) lamp.setMask(scene.worldMask);
      lamp.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
      lamps[i] = lamp;
    } else if (lamp.texture.key !== key) lamp.setTexture(key);
    lamp.setPosition(sprite.x + (lx - sprite.displayOriginX) * sprite.scaleX, sprite.y + (ly - sprite.displayOriginY) * sprite.scaleY);
    lamp.setScale(scale).setDepth(sprite.depth + 0.02).setAlpha(Math.min(1, strength) * (frontSeen ? 0.95 : 1)).setVisible(true);
  });
  lamps.slice(spots.length).forEach((l) => l.setVisible(false));
}

// A stop's lights (tram-art.js `stop_*.lit`: its tubes under the canopy, their glow, the light they
// throw on the platform), added over it by the buildings' light strength - the strip lights come on
// with the windows.
function syncTramStopLight(scene, sprite, art, strength = Number(scene?.buildingLightStrength) || 0) {
  const key = art?.lit?.key;
  if (!key || !scene.textures.exists(key)) return;
  let lit = sprite.__tramLit;
  if (!lit) {
    lit = scene.add.image(0, 0, key);
    if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, lit, 'objectLayer');
    if (scene.worldMask) lit.setMask(scene.worldMask);
    lit.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
    sprite.__tramLit = lit;
  }
  lit.setOrigin(sprite.originX, sprite.originY).setScale(sprite.scaleX, sprite.scaleY).setFlipX(sprite.flipX)
    .setPosition(sprite.x, sprite.y).setDepth(sprite.depth + 0.01);
  const s = Math.max(0, Math.min(1, strength));
  lit.setAlpha(s).setVisible(s > 0.01 && sprite.visible);
}

// ── Laying (the 電車路軌 tool, dragged on pointerup: tool-menu.js) ───────────────────────────────────

const TRAM_TRACK_COST = 120;          // a tile laid, from the company's cash
const TRAM_SIDE_STEP = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const TRAM_OPPOSITE = Object.freeze({ n: 's', e: 'w', s: 'n', w: 'e' });
// the bit joining two sides (as metro-surface.js RAIL_BIT_SIDES)
const TRAM_BIT_SIDES = Object.freeze({ 1: ['s', 'n'], 2: ['w', 'e'], 4: ['w', 'n'], 8: ['s', 'e'], 16: ['w', 's'], 32: ['n', 'e'] });

function tramBitFor(a, b) {
  const want = [a, b].sort().join();
  return Number(Object.keys(TRAM_BIT_SIDES).find((bit) => TRAM_BIT_SIDES[bit].slice().sort().join() === want)) || 0;
}

function tramBitsOf(mask) {
  return [1, 2, 4, 8, 16, 32].filter((b) => mask & b);
}

// The tiles from start to end: straight along the longer way, then round one corner. Pure.
function tramDragPath(start, end) {
  const path = [];
  const dr = Math.sign(end.row - start.row), dc = Math.sign(end.col - start.col);
  const rowsFirst = Math.abs(end.row - start.row) >= Math.abs(end.col - start.col);
  let r = start.row, c = start.col;
  path.push({ row: r, col: c });
  if (rowsFirst) {
    while (r !== end.row) { r += dr; path.push({ row: r, col: c }); }
    while (c !== end.col) { c += dc; path.push({ row: r, col: c }); }
  } else {
    while (c !== end.col) { c += dc; path.push({ row: r, col: c }); }
    while (r !== end.row) { r += dr; path.push({ row: r, col: c }); }
  }
  return path;
}

function tramSideBetween(a, b) {
  if (b.row < a.row) return 'n';
  if (b.row > a.row) return 's';
  return b.col > a.col ? 'e' : 'w';
}

// Where tram track may go: a road (not a bridge, a slope or a tunnel's mouth).
function canLayTramTrackAt(row, col) {
  if (typeof isInsideMap === 'function' && !isInsideMap(row, col)) return false;
  if (typeof mapData === 'undefined' || typeof ROAD === 'undefined' || mapData[row]?.[col] !== ROAD) return false;
  if (typeof isBridgeTile === 'function' && isBridgeTile(row, col)) return false;
  if (typeof isSlopeTile === 'function' && isSlopeTile(row, col)) return false;
  if (typeof isUnderseaTunnelTile === 'function' && isUnderseaTunnelTile(row, col)) return false;
  return true;
}


// A dual carriageway's band at a tile (getRoadCarriagewayBand), or none.
function tramBandAt(row, col) {
  return typeof getRoadCarriagewayBand === 'function' ? getRoadCarriagewayBand(row, col) : null;
}

/**
 * What a drag does to a tile it ends on (or starts from), coming in or going out by side `d`. Pure:
 * `mask` the tile's bits now, `joined(side)` whether the track next door that side comes on into it.
 * Returns { add, remove } (bits).
 * - Already going out that way: nothing.
 * - A line's end (one piece, joined one side): carried on to this side - turned round a corner, or
 *   straight on (a loop closed round a block this way: each end of its last drag turns in).
 * - A line passing through: a junction - a way from this side to each side it goes (a T: both curves,
 *   so a tram can turn either way).
 * - Else on into the track beside it: straight on, or round to it (both ways if both sides have it),
 *   or, with none beside, straight on.
 */
function tramEndChange(mask, d, joined) {
  const bits = tramBitsOf(mask);
  if (bits.some((b) => TRAM_BIT_SIDES[b].includes(d))) return { add: 0, remove: 0 };
  const sides = [...new Set(bits.flatMap((b) => TRAM_BIT_SIDES[b]))];
  const linked = sides.filter((s) => joined(s));
  if (bits.length === 1 && linked.length === 1) return { add: tramBitFor(linked[0], d), remove: bits[0] };
  if (linked.length >= 2) return { add: linked.reduce((m, s) => m | tramBitFor(d, s), 0), remove: 0 };
  const on = TRAM_OPPOSITE[d];
  if (joined(on)) return { add: tramBitFor(d, on), remove: 0 };
  const turns = ['n', 'e', 's', 'w'].filter((s) => s !== d && s !== on && joined(s));
  if (turns.length) return { add: turns.reduce((m, s) => m | tramBitFor(d, s), 0), remove: 0 };
  return { add: tramBitFor(d, on), remove: 0 };
}

// A drag's plan: each tile on the way the bit from the side it comes in by to the side it leaves by;
// at the ends, tramEndChange (on into the track there); on a dual carriageway, a bit along the band
// its partner across the reservation too. Pure but for the map. { ok, path, adds: [{row, col, bit}],
// removes: [{row, col, bit}], cost, bad, reason }
function planTramTrack(start, end, tracks = getTramState().tracks, canLay = canLayTramTrackAt, bandAt = tramBandAt) {
  const path = tramDragPath(start, end);
  const bad = path.find((t) => !canLay(t.row, t.col));
  if (bad) return { ok: false, path, adds: [], removes: [], cost: 0, bad: `${bad.row}:${bad.col}`, reason: 'notRoad' };
  const maskAt = (row, col) => tracks[`${row}:${col}`] || 0;
  const joinsFrom = (t) => (side) => {
    const [dr, dc] = TRAM_SIDE_STEP[side];
    return tramBitsOf(maskAt(t.row + dr, t.col + dc)).some((bit) => TRAM_BIT_SIDES[bit].includes(TRAM_OPPOSITE[side]));
  };
  const changes = new Map();
  const change = (row, col, add, remove = 0) => {
    const key = `${row}:${col}`;
    const c = changes.get(key) || { row, col, add: 0, remove: 0 };
    c.add |= add;
    c.remove |= remove;
    changes.set(key, c);
  };
  // (a dual carriageway: the reservation is the band's middle - its other half takes a bit along it too)
  const withPartner = (row, col, add, remove) => {
    change(row, col, add, remove);
    const side = tramReservationSideOf(bandAt(row, col));
    if (!side) return;
    const along = side === 'e' || side === 'w' ? 1 : 2;
    const [dr, dc] = TRAM_SIDE_STEP[side];
    if ((add | remove) & along && canLay(row + dr, col + dc)) change(row + dr, col + dc, add & along, remove & along);
  };
  path.forEach((t, i) => {
    const entry = i > 0 ? tramSideBetween(t, path[i - 1]) : null;
    const exit = i < path.length - 1 ? tramSideBetween(t, path[i + 1]) : null;
    if (entry && exit) { withPartner(t.row, t.col, tramBitFor(entry, exit), 0); return; }
    if (!entry && !exit) {
      // a click: on into the track beside it both ways, else nothing to lay
      const sides = ['n', 'e', 's', 'w'].filter(joinsFrom(t));
      if (sides.length >= 2) withPartner(t.row, t.col, tramBitFor(sides[0], sides[1]), 0);
      return;
    }
    const { add, remove } = tramEndChange(maskAt(t.row, t.col), entry || exit, joinsFrom(t));
    withPartner(t.row, t.col, add, remove);
  });
  const adds = [], removes = [];
  changes.forEach(({ row, col, add, remove }, key) => {
    const now = maskAt(row, col);
    const next = (now & ~remove) | add;
    if (next === now) return;
    if (next & ~now) adds.push({ row, col, bit: next & ~now });
    if (now & ~next) removes.push({ row, col, bit: now & ~next });
  });
  const tiles = new Set([...adds, ...removes].map((a) => `${a.row}:${a.col}`));
  const ok = tiles.size > 0;
  return { ok, path, adds, removes, cost: tiles.size * TRAM_TRACK_COST, bad: null, reason: ok ? null : 'nothing' };
}

function tramT(key, fallback, vars = {}) {
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (typeof t !== 'function') return fill(fallback);
  const out = t(key, vars);
  return out && out !== key ? out : fill(fallback);
}

function commitTramTrackDrag(scene, start, end) {
  if (scene?.bridgePreviewGraphic) scene.bridgePreviewGraphic.clear();
  if (scene?.tunnelPreviewLabel) scene.tunnelPreviewLabel.setVisible(false);
  const say = (text, kind) => { if (typeof showToast === 'function') showToast(text, kind); };
  const plan = planTramTrack(start, end);
  if (!plan.ok) {
    if (plan.reason === 'notRoad') say(tramT('tram.track.notRoad', '電車路軌要鋪喺馬路上（唔可以喺橋、斜路或者隧道口）。'), 'warning');
    return false;
  }
  if (typeof spendTransportConstruction === 'function' && !spendTransportConstruction(plan.cost)) {
    say(tramT('tram.track.funds', '公司資金唔夠鋪電車路軌（要 ${cost}）。', { cost: plan.cost.toLocaleString() }), 'warning');
    return false;
  }
  const tracks = getTramState().tracks;
  plan.removes.forEach(({ row, col, bit }) => {
    const key = `${row}:${col}`;
    tracks[key] = (tracks[key] || 0) & ~bit;
    if (!tracks[key]) delete tracks[key];
  });
  plan.adds.forEach(({ row, col, bit }) => { tracks[`${row}:${col}`] = (tracks[`${row}:${col}`] || 0) | bit; });
  tramTrackRevision += 1;
  onTramTracksChanged(scene);
  syncTramTracks(scene);
  return true;
}

function drawTramTrackDragPreview(scene, start, end) {
  const g = scene?.bridgePreviewGraphic;
  if (!g) return;
  g.clear();
  const plan = planTramTrack(start, end);
  const colour = plan.ok || plan.reason === 'nothing' ? 0x45e6c3 : 0xff4444;
  plan.path.forEach(({ row, col }) => {
    if (typeof isInsideMap === 'function' && !isInsideMap(row, col)) return;
    const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    const bad = plan.bad === `${row}:${col}`;
    g.fillStyle(bad ? 0xff4444 : colour, bad ? 0.45 : 0.22);
    g.lineStyle(2, bad ? 0xff4444 : colour, 0.9);
    g.beginPath();
    g.moveTo(geom.top.x, geom.top.y); g.lineTo(geom.right.x, geom.right.y);
    g.lineTo(geom.bottom.x, geom.bottom.y); g.lineTo(geom.left.x, geom.left.y);
    g.closePath(); g.fillPath(); g.strokePath();
  });
  if (typeof showUnderseaTunnelPreviewLabel === 'function') {
    const at = plan.path[plan.path.length - 1] || end;
    const text = plan.reason === 'notRoad' ? tramT('tram.track.notRoadShort', '只可以鋪喺馬路上')
      : plan.ok ? tramT('tram.track.cost', '電車路軌 ${cost}', { cost: plan.cost.toLocaleString() }) : tramT('tram.track.nothing', '已經有路軌');
    showUnderseaTunnelPreviewLabel(scene, at.row, at.col, text, plan.ok);
  }
}

// The bulldozer on a tile with tram track: the track comes up first (the road stays), on a dual
// carriageway with its partner across the reservation.
function demolishTramTrackAt(scene, row, col) {
  const tracks = getTramState().tracks;
  const key = `${row}:${col}`;
  if (!tracks[key]) return false;
  const side = typeof getRoadCarriagewayBand === 'function' ? tramReservationSideOf(getRoadCarriagewayBand(row, col)) : null;
  delete tracks[key];
  if (side) {
    const [dr, dc] = TRAM_SIDE_STEP[side];
    delete tracks[`${row + dr}:${col + dc}`];
  }
  tramTrackRevision += 1;
  onTramTracksChanged(scene);
  syncTramTracks(scene);
  return true;
}

// ── The track's lines (docs/tram-design.md §2.4-2.6) ─────────────────────────────────────────────────
//
// Each bit on a tile is a double track from one of its edges to another. Where it crosses an edge is
// that edge's node: on a narrow road the road's middle, the tracks 2.4 m either side (each lane's
// middle); on a dual carriageway the band's middle - the edge between its two halves - the tracks
// 1.6 m either side, in the reservation. Both halves' bits along the band are the one double track.
// Across a junction (the band's rows there are not a band) the reservation's line is carried straight
// on. Between a narrow road and a reservation the tracks shift across as the MTR's do through a
// scissors crossover (metro-surface-lines.js surfaceTrackSide: eased, over two tiles), the node
// between the two tiles half way across and at the shift's steepest. A corner is a quarter turn about
// where its two lines would meet, each track keeping its side (left-hand running: the inner track on
// the inside of the curve); a reservation's line meets a side street's half a tile from a tile corner,
// so a turn off it toward the band's far half takes in the tile beyond. The trams (phase 2) run on the
// same lines. Pure: the tracks' points are on the map (x along the columns, y along the rows).

const TRAM_GEOM = Object.freeze({
  laneHalf: 0.12,          // a narrow road's tracks off its middle, tiles (2.4 m)
  reservationHalf: 0.08,   // a reservation's off the band's middle (1.6 m: 3.2 m apart)
  bandGapTiles: 3,         // a junction across a dual carriageway this many rows long at most
  cornerReach: 0.2,        // a corner's tracks at least this far from where it turns about, else it takes in the next tile
  samples: 16,             // points a tile along a track
  tileMargin: 0.045,       // a track drawn on each tile its bed reaches (its half width, 0.037, and some)
  kappa: 0.5523,           // a quarter circle's cubic handles
});

function tramEdgeOf(row, col, side) {
  if (side === 'n') return { axis: 'H', line: row, at: col };       // a row edge: y = line, x over [at, at + 1]
  if (side === 's') return { axis: 'H', line: row + 1, at: col };
  if (side === 'w') return { axis: 'V', line: col, at: row };       // a column edge: x = line, y over [at, at + 1]
  return { axis: 'V', line: col + 1, at: row };
}

function tramEdgeKey(e) {
  return `${e.axis}${e.line}:${e.at}`;
}

// A reservation's line on a band tile: the bit along the band, the edges it crosses (H: a vertical
// band's) and where its middle is (x for H, y for V). Null off a reservation.
function tramBandLine(row, col, band) {
  const side = tramReservationSideOf(band);
  if (!side) return null;
  return band.orientation === 'v'
    ? { side, bit: 1, axis: 'H', mid: side === 'e' ? col + 1 : col }
    : { side, bit: 2, axis: 'V', mid: side === 's' ? row + 1 : row };
}

function tramHermite(p0, m0, p1, m1, s) {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

/**
 * The track's lines. Pure: `tracks` "row:col" -> bits, `bandAt(row, col)` the dual carriageway there
 * (getRoadCarriagewayBand) or null, `isRoadAt(row, col)` where a tile's drawing may go.
 * Returns { links, tracks, tiles }:
 * - links: each double track, { tile, row, col, bit, a, b (nodes), straight, from, to (the nodes its
 *   geometry runs between: a corner's may reach a tile on), consumed (a straight a corner took in) };
 * - tracks: each track of a link, { link, pts: [[x, y]] } (map points);
 * - tiles: "row:col" -> { row, col, tracks: [index], paving (the reservation's side, or null) }.
 */
function buildTramTrackGeometry(tracks, bandAt = () => null, isRoadAt = () => true) {
  const G = TRAM_GEOM;
  const tiles = new Map();
  Object.entries(tracks || {}).forEach(([key, mask]) => {
    if (!(mask > 0)) return;
    const [row, col] = key.split(':').map(Number);
    tiles.set(key, { key, row, col, mask, line: tramBandLine(row, col, bandAt(row, col)) });
  });
  const maskAt = (row, col) => tiles.get(`${row}:${col}`)?.mask || 0;

  // a reservation's edges: where its tracks cross them
  const mids = new Map();
  tiles.forEach((t) => {
    if (!t.line || !(t.mask & t.line.bit)) return;
    TRAM_BIT_SIDES[t.line.bit].forEach((s) => mids.set(tramEdgeKey(tramEdgeOf(t.row, t.col, s)), t.line.mid));
  });
  // carried across a junction: an edge between straights with a reservation's line each way, near
  const gaps = new Map();
  tiles.forEach((t) => [1, 2].forEach((bit) => {
    if (!(t.mask & bit)) return;
    TRAM_BIT_SIDES[bit].forEach((s) => {
      const e = tramEdgeOf(t.row, t.col, s);
      const key = tramEdgeKey(e);
      if (mids.has(key) || gaps.has(key)) return;
      const walk = (dir) => {
        for (let k = 1; k <= G.bandGapTiles; k++) {
          const line = e.line + dir * k;
          const across = Math.min(line, line - dir);       // the tile between this edge and the last
          const [row, col] = bit === 1 ? [across, e.at] : [e.at, across];
          if (!(maskAt(row, col) & bit)) return null;
          const m = mids.get(tramEdgeKey({ axis: e.axis, line, at: e.at }));
          if (m != null) return m;
        }
        return null;
      };
      const lo = walk(-1), hi = walk(1);
      if (lo != null && lo === hi) gaps.set(key, lo);
    });
  }));

  const nodes = new Map();
  const nodeAt = (row, col, side) => {
    const e = tramEdgeOf(row, col, side);
    const ek = tramEdgeKey(e);
    const m = mids.has(ek) ? mids.get(ek) : gaps.get(ek);
    const band = m != null;
    const key = band ? `${e.axis}${e.line}@${m}` : ek;
    let n = nodes.get(key);
    if (!n) {
      n = { key, axis: e.axis, line: e.line, pos: band ? m : e.at + 0.5, half: band ? G.reservationHalf : G.laneHalf,
        slope: 0, halfSlope: 0, band, links: [] };
      nodes.set(key, n);
    }
    return n;
  };

  // the double tracks (a band's two halves' bits along it: one)
  const links = [];
  const seen = new Set();
  tiles.forEach((t) => tramBitsOf(t.mask).forEach((bit) => {
    const sides = TRAM_BIT_SIDES[bit];
    const a = nodeAt(t.row, t.col, sides[0]), b = nodeAt(t.row, t.col, sides[1]);
    const id = [a.key, b.key].sort().join('|');
    if (seen.has(id)) return;
    seen.add(id);
    const link = { tile: t.key, row: t.row, col: t.col, bit, sides, a, b, straight: bit === 1 || bit === 2, consumed: false };
    links.push(link);
    a.links.push(link);
    b.links.push(link);
  }));

  // narrow road <-> reservation: across over two tiles, the node between them half way
  links.forEach((l) => {
    if (!l.straight || l.a.band === l.b.band) return;
    const [P, B] = l.a.band ? [l.b, l.a] : [l.a, l.b];
    if (B.links.length !== 2 || B.shifted) return;
    const l2 = B.links.find((x) => x !== l);
    if (l2.bit !== l.bit) return;
    const C = l2.a === B ? l2.b : l2.a;
    if (!C.band || C.pos !== B.pos) return;
    const span = C.line - P.line;
    B.slope = 1.5 * (C.pos - P.pos) / span;
    B.halfSlope = 1.5 * (C.half - P.half) / span;
    B.pos = (P.pos + C.pos) / 2;
    B.half = (P.half + C.half) / 2;
    B.shifted = true;
  });

  // corners: about where their lines meet
  const reach = (n, other, K, p) => (n.axis === 'H' ? (other === 'e' ? K.x - p : p - K.x) : (other === 's' ? K.y - p : p - K.y));
  const leastReach = (n, other, K) => Math.min(reach(n, other, K, n.pos - n.half), reach(n, other, K, n.pos + n.half));
  const straightBeyond = (node, side, l) => node.links.find((x) => x !== l && x.straight && x.bit === (side === 'n' || side === 's' ? 1 : 2));
  links.forEach((l) => {
    if (l.straight) { l.from = l.a; l.to = l.b; return; }
    const [sa, sb] = l.sides;
    let A = l.a, B = l.b;
    let K = { x: sa === 'e' || sb === 'e' ? l.col + 1 : l.col, y: sa === 's' || sb === 's' ? l.row + 1 : l.row };
    const takeIn = (node, side) => {
      const next = straightBeyond(node, side, l);
      if (!next) return null;
      const [dr, dc] = TRAM_SIDE_STEP[side];
      K = { x: K.x + dc, y: K.y + dr };
      if (node.links.length === 2) next.consumed = true;
      return next.a === node ? next.b : next.a;
    };
    if (leastReach(A, sb, K) < G.cornerReach) B = takeIn(B, sb) || B;
    if (leastReach(B, sa, K) < G.cornerReach) A = takeIn(A, sa) || A;
    l.from = A; l.to = B; l.corner = { K, sa, sb };
  });

  // each track's points, from the link's `from` node to its `to` (a straight's from the lower line);
  // the link keeps its two rails and the line between them, and its length, for the trams
  const out = [];
  const edgePoint = (n, p) => (n.axis === 'H' ? [p, n.line] : [n.line, p]);
  const keep = (l, rails) => {
    l.rails = rails;
    l.mid = rails[0].map((p, i) => [(p[0] + rails[1][i][0]) / 2, (p[1] + rails[1][i][1]) / 2]);
    l.length = l.mid.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - l.mid[i - 1][0], p[1] - l.mid[i - 1][1]) : 0), 0);
    rails.forEach((pts) => out.push({ link: l, pts }));
  };
  links.forEach((l) => {
    if (l.consumed) return;
    if (l.straight) {
      const [lo, hi] = l.a.line < l.b.line ? [l.a, l.b] : [l.b, l.a];
      l.from = lo; l.to = hi;
      keep(l, [-1, 1].map((sg) => {
        const pts = [];
        for (let i = 0; i <= G.samples; i++) {
          const s = i / G.samples;
          const lat = tramHermite(lo.pos + sg * lo.half, lo.slope + sg * lo.halfSlope, hi.pos + sg * hi.half, hi.slope + sg * hi.halfSlope, s);
          pts.push(lo.axis === 'H' ? [lat, lo.line + s] : [lo.line + s, lat]);
        }
        return pts;
      }));
      return;
    }
    const { K, sa, sb } = l.corner;
    const A = l.from, B = l.to;
    // each track at each end, inner first (nearer where the corner turns about)
    const ends = (n, other) => [n.pos - n.half, n.pos + n.half].sort((p, q) => reach(n, other, K, p) - reach(n, other, K, q));
    const [ai, ao] = ends(A, sb), [bi, bo] = ends(B, sa);
    const beziers = [[ai, bi], [ao, bo]].map(([pa, pb]) => {
      const P0 = edgePoint(A, pa), P3 = edgePoint(B, pb);
      const Q = A.axis === 'H' ? [P0[0], P3[1]] : [P3[0], P0[1]];
      const P1 = [P0[0] + G.kappa * (Q[0] - P0[0]), P0[1] + G.kappa * (Q[1] - P0[1])];
      const P2 = [P3[0] + G.kappa * (Q[0] - P3[0]), P3[1] + G.kappa * (Q[1] - P3[1])];
      const reachOf = Math.abs(Q[0] - P0[0]) + Math.abs(Q[1] - P0[1]) + Math.abs(Q[0] - P3[0]) + Math.abs(Q[1] - P3[1]);
      return { P0, P1, P2, P3, reachOf };
    });
    // (both tracks the same number of points: the outer's)
    const n = Math.max(G.samples, Math.ceil(G.samples * Math.max(...beziers.map((b) => b.reachOf))));
    keep(l, beziers.map(({ P0, P1, P2, P3 }) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const s = i / n, r = 1 - s;
        const w = [r * r * r, 3 * r * r * s, 3 * r * s * s, s * s * s];
        pts.push([w[0] * P0[0] + w[1] * P1[0] + w[2] * P2[0] + w[3] * P3[0], w[0] * P0[1] + w[1] * P1[1] + w[2] * P2[1] + w[3] * P3[1]]);
      }
      return pts;
    }));
  });

  // the tiles each track is drawn on, and the reservations' paving
  const cover = new Map();
  const tileOf = (row, col) => {
    const key = `${row}:${col}`;
    if (!cover.has(key)) {
      const t = tiles.get(key);
      cover.set(key, { row, col, tracks: [], paving: t?.line && (t.mask & t.line.bit) ? t.line.side : null });
    }
    return cover.get(key);
  };
  out.forEach((tr, index) => {
    // (each stretch between two points: its middle, and its bed's edges either side)
    const near = new Set();
    const m = G.tileMargin;
    for (let i = 1; i < tr.pts.length; i++) {
      const [x0, y0] = tr.pts[i - 1], [x1, y1] = tr.pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      [-m, 0, m].forEach((k) => near.add(`${Math.floor(my + ny * k)}:${Math.floor(mx + nx * k)}`));
    }
    near.forEach((key) => {
      const [row, col] = key.split(':').map(Number);
      if (isRoadAt(row, col)) tileOf(row, col).tracks.push(index);
    });
  });
  tiles.forEach((t) => { if (t.line && (t.mask & t.line.bit) && isRoadAt(t.row, t.col)) tileOf(t.row, t.col); });
  return { links, tracks: out, tiles: cover };
}

// ── Drawing (each tile's share of the lines, over its road tile in the road's frame) ─────────────────
//
// A tile's picture is drawn when first needed, 512 x 256 as the road's (its face a diamond from
// (96, 129) to (416, 129), top corner (256, 49)), and shared by every tile drawn the same: the
// reservation's paving under (scripts/prepare-tram-track-assets.py: concrete and its yellow line),
// the rails over - Hong Kong's 1,067 mm gauge grooved into the road, a light head and a dark groove
// inside each, a darker bed between.

const TRAM_RAIL_STYLE = Object.freeze({
  bed: { colour: 'rgba(58, 58, 60, 0.28)', at: 0, half: 1.067 / 40 + 0.010 },
  groove: { colour: 'rgba(34, 34, 36, 0.85)', at: 1.067 / 40 - 0.0045, half: 0.0028 },
  head: { colour: 'rgb(178, 180, 184)', at: 1.067 / 40 + 0.0012, half: 0.0030 },
});

let tramTrackRevision = 0;
const TRAM_PAVING_TEXTURES = Object.freeze(['n', 'e', 's', 'w'].map((side) => ({ key: `tram_res_${side}`, path: `Models/tramways/track/tram_res_${side}.png` })));

function loadTramTrackTextures(scene) {
  const missing = TRAM_PAVING_TEXTURES.filter((t) => !scene.textures.exists(t.key));
  if (!missing.length) return Promise.resolve();
  if (scene.__tramTrackLoading) return scene.__tramTrackLoading;
  scene.__tramTrackLoading = new Promise((ok) => {
    missing.forEach((t) => scene.load.image(t.key, typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(t.path) : t.path));
    scene.load.once('complete', () => { scene.__tramTrackLoading = null; ok(); });
    scene.load.start();
  });
  return scene.__tramTrackLoading;
}

// A map point on a tile, as drawn with the map turned: the tile's own (u, v), turned a quarter at a
// time as its sides are (rotateDirection: n to e).
function tramTileLocal(x, y, row, col, turn) {
  let u = x - col, v = y - row;
  for (let k = 0; k < ((turn % 4) + 4) % 4; k++) { const nu = 1 - v; v = u; u = nu; }
  return [u, v];
}

// A tile's picture as drawn now: its paving's side on screen and its tracks' points on it, and a
// name for it (the same for every tile drawn the same).
function tramTilePicture(geo, cell, turn) {
  const paving = cell.paving ? rotateDirection(cell.paving, turn) : null;
  const curves = cell.tracks.map((i) => geo.tracks[i].pts.map(([x, y]) => tramTileLocal(x, y, cell.row, cell.col, turn)));
  let h = 2166136261;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  mix(paving || '-');
  curves.map((pts) => pts.map(([u, v]) => `${Math.round(u * 1024)},${Math.round(v * 1024)}`).join(';')).sort().forEach(mix);
  return { key: `tram_track_tile_${(h >>> 0).toString(36)}_${curves.length}`, paving, curves };
}

function tramOffsetLine(pts, d) {
  if (!d) return pts;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
    return [p[0] - (ty / len) * d, p[1] + (tx / len) * d];
  });
}

function drawTramTrackPicture(scene, picture) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(256, 49); ctx.lineTo(416, 129); ctx.lineTo(256, 209); ctx.lineTo(96, 129);
  ctx.closePath();
  ctx.clip();
  if (picture.paving) ctx.drawImage(scene.textures.get(`tram_res_${picture.paving}`).getSourceImage(), 0, 0, 512, 256);
  // the tile's (u, v) to its face: x = 256 + (u - v) 160, y = 49 + (u + v) 80 (line widths too)
  ctx.setTransform(160, 80, -160, 80, 256, 49);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  const stroke = (pts, style) => {
    ctx.strokeStyle = style.colour;
    ctx.lineWidth = style.half * 2;
    ctx.beginPath();
    pts.forEach(([u, v], i) => (i ? ctx.lineTo(u, v) : ctx.moveTo(u, v)));
    ctx.stroke();
  };
  const { bed, groove, head } = TRAM_RAIL_STYLE;
  picture.curves.forEach((pts) => stroke(pts, bed));
  [groove, head].forEach((style) => picture.curves.forEach((pts) => [-1, 1].forEach((sg) => stroke(tramOffsetLine(pts, sg * style.at), style))));
  ctx.restore();
  // (drawn, then added: a canvas added first and drawn after keeps empty mipmaps)
  scene.textures.addCanvas(picture.key, canvas);
}

// The track's state as it stands: its revision, the roads, and which state it is (a city loaded is
// another object).
const tramStateIds = new WeakMap();
let tramStateNextId = 1;
function tramStateStamp() {
  const tracks = getTramState().tracks;
  if (!tramStateIds.has(tracks)) tramStateIds.set(tracks, tramStateNextId++);
  return `${tramStateIds.get(tracks)}|${tramTrackRevision}|${typeof roadTileCount !== 'undefined' ? roadTileCount : 0}`;
}

// The lines as laid now (kept while the track and the roads stay as they are).
let tramGeometryCache = null;
function getTramTrackGeometry() {
  const key = tramStateStamp();
  if (tramGeometryCache?.key !== key) {
    tramGeometryCache = { key, geo: buildTramTrackGeometry(getTramState().tracks, tramBandAt, canLayTramTrackAt) };
  }
  return tramGeometryCache.geo;
}

function syncTramTracks(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (!scene?.add || !scene.tileSprites) return;
  const tracks = getTramState().tracks;
  // (a road taken away under it: the track goes with it)
  let dropped = false;
  Object.keys(tracks).forEach((key) => {
    const [row, col] = key.split(':').map(Number);
    if (!canLayTramTrackAt(row, col)) { delete tracks[key]; dropped = true; }
  });
  if (dropped) tramTrackRevision += 1;
  const geo = getTramTrackGeometry();
  const needsPaving = [...geo.tiles.values()].some((c) => c.paving);
  if (needsPaving && TRAM_PAVING_TEXTURES.some((t) => !scene.textures.exists(t.key))) {
    loadTramTrackTextures(scene).then(() => syncTramTracks(scene));
    return;
  }
  if (!scene.tramTrackSprites) scene.tramTrackSprites = new Map();
  const turn = typeof mapRotation === 'number' ? mapRotation : 0;
  const used = new Set();
  geo.tiles.forEach((cell, key) => {
    const road = scene.tileSprites[cell.row]?.[cell.col];
    if (!road) return;
    const picture = tramTilePicture(geo, cell, turn);
    if (!scene.textures.exists(picture.key)) drawTramTrackPicture(scene, picture);
    used.add(picture.key);
    let sprite = scene.tramTrackSprites.get(key);
    if (!sprite) {
      sprite = scene.add.image(0, 0, picture.key);
      if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'roadLayer');
      if (scene.worldMask) sprite.setMask(scene.worldMask);
      sprite.__nightNone = false;
      scene.tramTrackSprites.set(key, sprite);
    } else if (sprite.texture.key !== picture.key) sprite.setTexture(picture.key);
    // laid on the road tile: its place, its anchor, its scale (the 512 x 256 picture at its footprint)
    sprite.setOrigin(road.originX, road.originY).setScale(road.scaleX, road.scaleY).setPosition(road.x, road.y);
    sprite.setDepth(road.depth + 0.5);
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  });
  scene.tramTrackSprites.forEach((sprite, key) => { if (!geo.tiles.has(key)) { sprite.destroy(); scene.tramTrackSprites.delete(key); } });
  // pictures no tile shows any more
  (scene.__tramTrackPictures || new Set()).forEach((k) => { if (!used.has(k) && scene.textures.exists(k)) scene.textures.remove(k); });
  scene.__tramTrackPictures = used;
  scene.__tramTrackSyncKey = tramTrackSyncKey(scene);
  // (a stop whose track went, or changed under it, goes too: tram-lines.js)
  if (typeof pruneTramStops === 'function') pruneTramStops(scene);
}

// Drawn again when the track, the roads or the map's turn change (each frame's check: updateTram).
function tramTrackSyncKey(scene) {
  return `${tramStateStamp()}|${typeof mapRotation === 'number' ? mapRotation : 0}|${scene.offsetX}|${scene.offsetY}`;
}

function updateTram(scene, delta = 16) {
  if (!scene?.add) return;
  if ((Object.keys(getTramState().tracks).length || scene.tramTrackSprites?.size)
    && scene.__tramTrackSyncKey !== tramTrackSyncKey(scene)) syncTramTracks(scene);
  // the stops, the lines' trams (tram-lines.js)
  if (typeof updateTramService === 'function') updateTramService(scene, delta);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeTramState, tramReservationSideOf, tramDragPath, planTramTrack, tramEndChange, tramBitFor,
    buildTramTrackGeometry, tramTileLocal, TRAM_GEOM,
  };
}
