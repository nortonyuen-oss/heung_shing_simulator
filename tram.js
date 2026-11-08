// 電車 (docs/tram-design.md): tram track laid on the roads. A narrow road carries a track in each
// lane; a dual carriageway's two middle pavements become the trams' own reservation, a track each,
// as on Hennessy Road. Phase 1: the track's state, and what it takes of the road - no lamp or prop on
// the reservation (Norton, 2026-11-08: 只留電車路同之後嘅電車站).

// Track on a tile: the sides it joins, as TrackBits (railway-track.js / metro-surface.js
// RAIL_BIT_SIDES: 1 X s-n, 2 Y w-e, 4 UPPER w-n, 8 LOWER s-e, 16 LEFT w-s, 32 RIGHT n-e).
const TRAM_TRACK_MASK_LIMIT = 63;

function normalizeTramState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const tracks = {};
  Object.entries(src.tracks && typeof src.tracks === 'object' ? src.tracks : {}).forEach(([key, mask]) => {
    const m = Math.floor(Number(mask));
    if (!/^\d{1,4}:\d{1,4}$/.test(key) || !(m > 0) || m > TRAM_TRACK_MASK_LIMIT) return;
    tracks[key] = m;
  });
  return { tracks };
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

// A drag's plan: each tile's bit (from the side it comes in by to the side it leaves by; at the ends,
// on into track already there, else straight on), on a dual carriageway its partner across the
// reservation too. Pure but for the map. { ok, path, adds: [{row, col, bit}], cost, bad }
function planTramTrack(start, end, tracks = getTramState().tracks, canLay = canLayTramTrackAt) {
  const path = tramDragPath(start, end);
  const bad = path.find((t) => !canLay(t.row, t.col));
  if (bad) return { ok: false, path, adds: [], cost: 0, bad: `${bad.row}:${bad.col}`, reason: 'notRoad' };
  const joins = (t, side) => {
    const [dr, dc] = TRAM_SIDE_STEP[side];
    const mask = tracks[`${t.row + dr}:${t.col + dc}`] || 0;
    return tramBitsOf(mask).some((bit) => TRAM_BIT_SIDES[bit].includes(TRAM_OPPOSITE[side]));
  };
  const adds = [];
  path.forEach((t, i) => {
    let entry = i > 0 ? tramSideBetween(t, path[i - 1]) : null;
    let exit = i < path.length - 1 ? tramSideBetween(t, path[i + 1]) : null;
    if (!entry && !exit) {
      // a click: on into the track beside it, else nothing to lay
      const sides = ['n', 'e', 's', 'w'].filter((side) => joins(t, side));
      if (sides.length < 2) return;
      [entry, exit] = sides;
    } else if (!entry) {
      const back = ['n', 'e', 's', 'w'].find((side) => side !== exit && joins(t, side));
      entry = back || TRAM_OPPOSITE[exit];
    } else if (!exit) {
      const on = ['n', 'e', 's', 'w'].find((side) => side !== entry && joins(t, side));
      exit = on || TRAM_OPPOSITE[entry];
    }
    const bit = tramBitFor(entry, exit);
    if (!bit) return;
    adds.push({ row: t.row, col: t.col, bit });
    // (a dual carriageway: the reservation is the band's middle - its other half takes the track too)
    const side = typeof getRoadCarriagewayBand === 'function' ? tramReservationSideOf(getRoadCarriagewayBand(t.row, t.col)) : null;
    if (side && (bit === 1 || bit === 2)) {
      const [dr, dc] = TRAM_SIDE_STEP[side];
      if (canLay(t.row + dr, t.col + dc)) adds.push({ row: t.row + dr, col: t.col + dc, bit });
    }
  });
  const fresh = adds.filter((a) => !((tracks[`${a.row}:${a.col}`] || 0) & a.bit));
  const tiles = new Set(fresh.map((a) => `${a.row}:${a.col}`));
  return { ok: fresh.length > 0, path, adds: fresh, cost: tiles.size * TRAM_TRACK_COST, bad: null, reason: fresh.length ? null : 'nothing' };
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

// ── Drawing (over the road tiles, in their frame: scripts/prepare-tram-track-assets.py) ─────────────

let tramTrackRevision = 0;
const TRAM_TRACK_TEXTURES = Object.freeze([
  ...[1, 2, 4, 8, 16, 32].map((bit) => ({ key: `tram_track_${bit}`, path: `Models/tramways/track/tram_track_${bit}.png` })),
  ...['n', 'e', 's', 'w'].map((side) => ({ key: `tram_res_${side}`, path: `Models/tramways/track/tram_res_${side}.png` })),
]);

function loadTramTrackTextures(scene) {
  const missing = TRAM_TRACK_TEXTURES.filter((t) => !scene.textures.exists(t.key));
  if (!missing.length) return Promise.resolve();
  if (scene.__tramTrackLoading) return scene.__tramTrackLoading;
  scene.__tramTrackLoading = new Promise((ok) => {
    missing.forEach((t) => scene.load.image(t.key, typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(t.path) : t.path));
    scene.load.once('complete', () => { scene.__tramTrackLoading = null; ok(); });
    scene.load.start();
  });
  return scene.__tramTrackLoading;
}

// A track tile's pictures, as drawn now: its bits turned with the map; a dual carriageway's bit along
// the band as its half of the reservation.
function tramTrackPieces(row, col, mask, turn = typeof mapRotation === 'number' ? mapRotation : 0) {
  const side = typeof getRoadCarriagewayBand === 'function' ? tramReservationSideOf(getRoadCarriagewayBand(row, col)) : null;
  return tramBitsOf(mask).map((bit) => {
    if (side && (bit === 1 || bit === 2)) return `tram_res_${rotateDirection(side, turn)}`;
    const [a, b] = TRAM_BIT_SIDES[bit].map((s) => rotateDirection(s, turn));
    return `tram_track_${tramBitFor(a, b)}`;
  });
}

function syncTramTracks(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (!scene?.add || !scene.tileSprites) return;
  const tracks = getTramState().tracks;
  if (Object.keys(tracks).length && TRAM_TRACK_TEXTURES.some((t) => !scene.textures.exists(t.key))) {
    loadTramTrackTextures(scene).then(() => syncTramTracks(scene));
  }
  if (!scene.tramTrackSprites) scene.tramTrackSprites = new Map();
  const wanted = new Set();
  Object.entries(tracks).forEach(([key, mask]) => {
    const [row, col] = key.split(':').map(Number);
    // (a road taken away under it: the track goes with it)
    if (!canLayTramTrackAt(row, col)) { delete tracks[key]; return; }
    const road = scene.tileSprites[row]?.[col];
    if (!road) return;
    tramTrackPieces(row, col, mask).forEach((texture, i) => {
      if (!scene.textures.exists(texture)) return;
      const id = `${key}|${i}`;
      wanted.add(id);
      let sprite = scene.tramTrackSprites.get(id);
      if (!sprite) {
        sprite = scene.add.image(0, 0, texture);
        if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'roadLayer');
        if (scene.worldMask) sprite.setMask(scene.worldMask);
        sprite.__nightNone = false;
        scene.tramTrackSprites.set(id, sprite);
      } else if (sprite.texture.key !== texture) sprite.setTexture(texture);
      // laid on the road tile: its place, its anchor, its scale (the 512 x 256 art at its footprint)
      sprite.setOrigin(road.originX, road.originY).setScale(road.scaleX, road.scaleY).setPosition(road.x, road.y);
      sprite.setDepth(road.depth + 0.5);
      if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
    });
  });
  scene.tramTrackSprites.forEach((sprite, id) => { if (!wanted.has(id)) { sprite.destroy(); scene.tramTrackSprites.delete(id); } });
  scene.__tramTrackSyncKey = tramTrackSyncKey(scene);
}

// Drawn again when the track, the roads or the map's turn change (each frame's check: updateTram).
function tramTrackSyncKey(scene) {
  return `${tramTrackRevision}|${typeof roadTileCount !== 'undefined' ? roadTileCount : 0}|${typeof mapRotation === 'number' ? mapRotation : 0}|${scene.offsetX}|${scene.offsetY}`;
}

function updateTram(scene) {
  if (!scene?.add) return;
  if (!Object.keys(getTramState().tracks).length && !scene.tramTrackSprites?.size) return;
  if (scene.__tramTrackSyncKey !== tramTrackSyncKey(scene)) syncTramTracks(scene);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeTramState, tramReservationSideOf, tramDragPath, planTramTrack, tramBitFor, tramTrackPieces };
}
