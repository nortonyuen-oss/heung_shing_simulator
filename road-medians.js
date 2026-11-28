// 中央分隔帶: the central reservation of a 雙線來回 road (Norton, 2026-11-28: 雙線來回道路，如果冇電車
// 或者輕鐵，中間可以係欄杆/綠化帶/樹加雙頭T型街燈 / 按地區自動揀 / 舊路都加 / 迴轉不要被綠化帶擋住 /
// 轉輕鐵電車路軌既時候要還原 / 中間欄杆用現在放路邊果type欄杆; his photos: a raised kerb planted with a
// low hedge, palms down 金鐘道, a rounded nose short of the junction).
//
// Derived from the road map like the lamps and railings - nothing saved: wherever a widened road
// (tile-keys.js getRoadCarriagewayBand) of an even width runs straight, its two halves (one way and
// the other) are parted down the middle. The reservation stops a tile short of every end, junction,
// zebra crossing and bridge, with a rounded nose, so traffic turns and turns back clear of it; it is
// not there at all where tram or light rail track runs on either side (it comes back if the track
// is taken up).
//
// Its kind is picked by what stands along it (roadMedianStyleFor):
//   'palms'  - Norton's palm planters: offices and shops (金鐘道)
//   'rail'   - a narrow kerb with the pavements' 行人路欄杆: a busy high-rise residential street
//   'trees'  - Norton's flower beds with broadleaf trees in them: green, open, low-rise
//   'hedge'  - the flower beds only: anywhere else
// (the beds and planters from road-median-art.js, scripts/bake-median-planter-textures.js; a drawn
// hedge strip until their art has loaded)
// and its lamps are double-headed T posts on it (street-lamps.js), the kerbside ones on those tiles
// standing down.

const ROAD_MEDIAN = Object.freeze({
  halfWidth: { hedge: 0.09, trees: 0.09, palms: 0.09, rail: 0.045 },  // tiles across, each side
  kerbLiftPx: 2.2,
  hedgePx: 3.2,
  res: 2,
  treeKeys: Object.freeze({ trees: 'tree05', palms: 'road_median_palm' }),   // (a palm drawn here: no palm art)
  treeScale: 0.17,
  minRunTiles: 2,
  window: 3,               // tiles either side looked at for the street's character
  palmsShare: 0.1,         // of the lots along it shops and offices (medium or high density): palms
  // The planter sets (road-median-art.js) and how a run is laid with them: `first` at one end, `last`
  // at the other, `bodies` (longest first) between, `single` alone on a run too short for both ends.
  // palms: their nose at the run's lower end on screen; flowers: laid from the run's map start (a turn
  // of the map keeps the same beds in the same places), the bodies a mix of lengths by the run.
  planterSets: Object.freeze({
    palms: Object.freeze({ first: 'nose', last: 'island', single: 'island', bodies: Object.freeze(['quad', 'triple', 'double']), gap: 0.06 }),
    flowers: Object.freeze({ first: 'oval', last: 'oval', single: 'oval', bodies: Object.freeze(['longest', 'longer', 'long', 'medium', 'short']), gap: 0.04, mixed: true, fromMapStart: true }),
  }),
  styleSets: Object.freeze({ palms: 'palms', trees: 'flowers', hedge: 'flowers' }),
  colours: Object.freeze({
    kerbTop: '#c9c6bd', kerbFace: '#9d9a92', kerbFaceDark: '#85827b',
    soil: '#5d5a3d', hedge: '#4f7a36', hedgeLight: '#6d9a47', hedgeDark: '#3b5f29',
  }),
});

const ROAD_MEDIAN_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });

// Pure. Every run of reservation the map calls for: { orientation 'v' (a north-south road: the
// boundary between columns `line` and `line + 1`, along rows) or 'h' (east-west: between rows `line`
// and `line + 1`, along columns), from, to (the tiles along it, inclusive) }.
//   roadKeyAt(r, c): the tile's road key (getRoadKey) or null
//   bandAt(r, c): getRoadCarriagewayBand or null
//   blockedAt(r, c): tram / light rail track, a bridge, a tunnel, a zebra crossing on the tile
function computeRoadMedianRuns({ rowStart = 0, colStart = 0, mapWidth, mapHeight, roadKeyAt, bandAt, blockedAt = () => false }) {
  const inside = (r, c) => r >= rowStart && c >= colStart && r < rowStart + mapHeight && c < colStart + mapWidth;
  // the first tile of the two either side of the middle (the west / north one), or null
  const pairAt = (r, c, orientation) => {
    if (!inside(r, c)) return false;
    const [dr, dc] = orientation === 'v' ? [0, 1] : [1, 0];
    const straight = orientation === 'v' ? 'road_straight_v' : 'road_straight_h';
    const a = bandAt(r, c);
    const b = inside(r + dr, c + dc) ? bandAt(r + dr, c + dc) : null;
    if (!a || !b || a.orientation !== orientation || b.orientation !== orientation) return false;
    if (a.width % 2 || a.width !== b.width || a.index !== a.width / 2 - 1 || b.index !== a.width / 2) return false;
    if (roadKeyAt(r, c) !== straight || roadKeyAt(r + dr, c + dc) !== straight) return false;
    if (blockedAt(r, c) || blockedAt(r + dr, c + dc)) return false;
    return true;
  };
  const runs = [];
  ['v', 'h'].forEach((orientation) => {
    const valid = new Set();
    for (let r = rowStart; r < rowStart + mapHeight; r++) {
      for (let c = colStart; c < colStart + mapWidth; c++) if (pairAt(r, c, orientation)) valid.add(`${r}:${c}`);
    }
    // a tile short of either end: its neighbours along must be pairs too
    const [ar, ac] = orientation === 'v' ? [1, 0] : [0, 1];
    const kept = [...valid].filter((k) => {
      const [r, c] = k.split(':').map(Number);
      return valid.has(`${r - ar}:${c - ac}`) && valid.has(`${r + ar}:${c + ac}`);
    }).map((k) => k.split(':').map(Number));
    // runs along each line
    const lines = new Map();
    kept.forEach(([r, c]) => {
      const line = orientation === 'v' ? c : r;
      const along = orientation === 'v' ? r : c;
      if (!lines.has(line)) lines.set(line, []);
      lines.get(line).push(along);
    });
    lines.forEach((alongs, line) => {
      alongs.sort((x, y) => x - y);
      let from = alongs[0], prev = alongs[0];
      const flush = (to) => { if (to - from + 1 >= ROAD_MEDIAN.minRunTiles) runs.push({ orientation, line, from, to }); };
      alongs.slice(1).forEach((a) => {
        if (a === prev + 1) { prev = a; return; }
        flush(prev);
        from = a; prev = a;
      });
      flush(prev);
    });
  });
  return runs;
}

// The two tiles either side of the middle at step `along` of a run: [[r, c] first half, [r, c] second].
function roadMedianPair(run, along) {
  return run.orientation === 'v' ? [[along, run.line], [along, run.line + 1]] : [[run.line, along], [run.line + 1, along]];
}

// Pure: the kind of reservation from what stands along the road. `stats`: { tiles (looked at),
// built (with a building), commercialHigh, residentialHigh (high-density, any use), green (trees, parks) }.
function roadMedianStyleFor(stats) {
  const share = (n) => (stats.tiles > 0 ? n / stats.tiles : 0);
  if (share(stats.commercialHigh) >= ROAD_MEDIAN.palmsShare) return 'palms';
  if (share(stats.residentialHigh) >= 0.22) return 'rail';
  if (share(stats.green) >= 0.15 || share(stats.built) < 0.12) return 'trees';
  return 'hedge';
}

// What stands within ROAD_MEDIAN.window tiles of a run, off the road.
function roadMedianSurroundings(scene, run) {
  const stats = { tiles: 0, built: 0, commercialHigh: 0, residentialHigh: 0, green: 0 };
  const w = ROAD_MEDIAN.window;
  const seen = new Set();
  for (let a = run.from; a <= run.to; a++) {
    for (let d = -w; d <= w + 1; d++) {
      const [r, c] = run.orientation === 'v' ? [a, run.line + d] : [run.line + d, a];
      const id = getTileId(r, c);
      if (seen.has(id) || !isInsideMap(r, c) || mapData[r][c] === ROAD || mapData[r][c] === WATER) continue;
      seen.add(id);
      stats.tiles++;
      if (scene?.treeSprites?.has(id)) stats.green++;
      const building = scene?.buildingSprites?.get(id);
      if (!building) continue;
      const record = buildingData[getTileId(building.mapRow, building.mapCol)];
      if (!record) continue;
      stats.built++;
      const type = record.type;
      if (/park|garden|sports_ground/.test(type)) { stats.green++; continue; }
      const density = Number(record.density) || 0, level = Number(record.level) || 0;
      const high = density >= 3 || level >= 3;
      // shops and offices from medium density (Norton, 2026-11-28: 調低門檻 - the palms were rare)
      if (type === 'commercial' && (density >= 2 || level >= 2 || ['H', 'UH'].includes(record.commercialTier))) stats.commercialHigh++;
      if (high && (type === 'residential' || type === 'commercial')) stats.residentialHigh++;
    }
  }
  return stats;
}

// Tram or light rail track, a bridge, a tunnel or a zebra crossing on a tile: no reservation there.
function isRoadMedianBlockedAt(scene, row, col) {
  const id = getTileId(row, col);
  const tram = typeof getTramState === 'function' ? getTramState()?.tracks : null;
  if (tram && tram[`${row}:${col}`]) return true;
  const lrt = typeof getTransportExpansionState === 'function' ? getTransportExpansionState()?.lightRail?.tracks : null;
  if (lrt && lrt[`${row}:${col}`]) return true;
  if (typeof bridgeMap !== 'undefined' && bridgeMap.get(id) != null) return true;
  if (typeof getUnderseaTunnelTile === 'function' && getUnderseaTunnelTile(row, col)) return true;
  if (scene && typeof getTileSprite === 'function' && /__lines_zebra/.test(getTileSprite(scene, row, col)?.texture?.key ?? '')) return true;
  return false;
}

function computeSceneRoadMedianRuns(scene) {
  if (typeof getRoadCarriagewayBand !== 'function' || typeof getRoadKey !== 'function') return [];
  const roadKeyAt = typeof createRoadKeyReader === 'function'
    ? createRoadKeyReader()
    : (row, col) => (isRoadLikeTile(row, col) ? getRoadKey(row, col) : null);
  const bounds = typeof getActiveSweepBounds === 'function' ? getActiveSweepBounds() : { rowStart: 0, colStart: 0, rowCount: MAP_HEIGHT, colCount: MAP_WIDTH };
  const runs = computeRoadMedianRuns({
    rowStart: bounds.rowStart, colStart: bounds.colStart, mapWidth: bounds.colCount, mapHeight: bounds.rowCount,
    roadKeyAt,
    bandAt: (r, c) => (mapData[r]?.[c] === ROAD ? getRoadCarriagewayBand(r, c) : null),
    blockedAt: (r, c) => isRoadMedianBlockedAt(scene, r, c),
  });
  runs.forEach((run) => { run.style = roadMedianStyleFor(roadMedianSurroundings(scene, run)); });
  return runs;
}

// The tiles a run covers, both halves: 'r:c' -> run (street-lamps.js stands its kerbside lamps down)
function roadMedianTileIndex(runs) {
  const index = new Map();
  runs.forEach((run) => {
    for (let a = run.from; a <= run.to; a++) roadMedianPair(run, a).forEach(([r, c]) => index.set(`${r}:${c}`, run));
  });
  return index;
}

// The lamps on a run: Norton's double-headed T posts on the line, the arm across the road, a head
// over each carriageway (street-lamps.js placements, textures lightPost_T_*). Every 1.5 tiles, as the
// kerbside lamps (a tile k%3 0 a quarter back, 1 a quarter on, 2 none).
function roadMedianLampPlacements(runs, period = 3, inset = 0.25) {
  const out = [];
  runs.forEach((run) => {
    for (let a = run.from; a <= run.to; a++) {
      const slot = ((a % period) + period) % period;
      if (slot > 1) continue;
      const along = slot === 0 ? -inset : inset;
      const [[r0, c0]] = roadMedianPair(run, a);
      out.push(run.orientation === 'v'
        ? { row: r0, col: c0, kind: 'median', side: 'm', arm: 'e', offsetRow: along, offsetCol: 0.5 }
        : { row: r0, col: c0, kind: 'median', side: 'm', arm: 's', offsetRow: 0.5, offsetCol: along });
    }
  });
  return out;
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────────

// A point on the middle line of a run at `along` (tiles, fractional) and `across` (tiles off it,
// toward the second half), in screen terms with the map offsets.
function roadMedianPoint(scene, run, along, across = 0) {
  const [r, c] = run.orientation === 'v' ? [along, run.line + 0.5 + across] : [run.line + 0.5 + across, along];
  const p = isoToScreen(c, r);
  return { x: p.x + scene.offsetX, y: p.y + scene.offsetY - BUILDING_SURFACE_Y_OFFSET - TILE_HEIGHT / 2, iso: p.y };
}

// One tile of reservation as the camera sees it: shared canvases by the screen way of the line,
// the kind, and the nose (rounded end) at its start, its end, or neither.
function roadMedianPieceKey(scene, run, style, cap) {
  const a = roadMedianPoint(scene, run, 0), b = roadMedianPoint(scene, run, 1);
  const slope = (b.x - a.x) * (b.y - a.y) > 0 ? 'down' : 'up';
  return `road_median_${slope}_${style}_${cap}`;
}

function ensureRoadMedianPieceTexture(scene, run, style, cap) {
  const key = roadMedianPieceKey(scene, run, style, cap);
  if (scene.textures.exists(key)) return key;
  const { res, kerbLiftPx, hedgePx, colours } = ROAD_MEDIAN;
  const half = ROAD_MEDIAN.halfWidth[style] ?? 0.09;
  const o = roadMedianPoint(scene, run, 0);
  const u = roadMedianPoint(scene, run, 1); const v = roadMedianPoint(scene, run, 0, 1);
  // screen px per tile along (A) and across (B)
  const A = { x: u.x - o.x, y: u.y - o.y }, B = { x: v.x - o.x, y: v.y - o.y };
  // the outline in (along, across) tiles: a tile long, rounded at a nose
  const outline = [];
  const steps = 10;
  const noseLen = Math.min(0.45, half * 2.2);
  const edge = (t, sign) => {
    // across half-width at along t (-0.5..0.5), narrowing round a nose
    let w = half;
    if (cap === 'start' && t < -0.5 + noseLen) w = half * Math.sqrt(Math.max(0, 1 - ((-0.5 + noseLen - t) / noseLen) ** 2));
    if (cap === 'end' && t > 0.5 - noseLen) w = half * Math.sqrt(Math.max(0, 1 - ((t - (0.5 - noseLen)) / noseLen) ** 2));
    return sign * w;
  };
  for (let i = 0; i <= steps * 2; i++) { const t = -0.5 + i / (steps * 2); outline.push([t, edge(t, -1)]); }
  for (let i = steps * 2; i >= 0; i--) { const t = -0.5 + i / (steps * 2); outline.push([t, edge(t, 1)]); }
  const toScreen = ([t, s], lift = 0) => ({ x: A.x * t + B.x * s, y: A.y * t + B.y * s - lift });
  const pts = outline.map((p) => toScreen(p));
  const minX = Math.min(...pts.map((p) => p.x)) - 3, maxX = Math.max(...pts.map((p) => p.x)) + 3;
  const minY = Math.min(...pts.map((p) => p.y)) - kerbLiftPx - hedgePx - 4, maxY = Math.max(...pts.map((p) => p.y)) + 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxX - minX) * res);
  canvas.height = Math.ceil((maxY - minY) * res);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(res, 0, 0, res, -minX * res, -minY * res);
  const path = (list) => { ctx.beginPath(); list.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };
  // the kerb's faces (seen below the top), then its top
  ctx.fillStyle = colours.kerbFace;
  path(pts.map((p) => ({ x: p.x, y: p.y })));
  ctx.fill();
  const top = outline.map((p) => toScreen(p, kerbLiftPx));
  // faces: the top shifted down to the road, drawn as the band between the two outlines
  ctx.fillStyle = colours.kerbFaceDark;
  for (let i = 0; i < pts.length - 1; i++) {
    const q = [pts[i], pts[i + 1], top[i + 1], top[i]];
    path(q);
    ctx.fill();
  }
  ctx.fillStyle = style === 'rail' ? colours.kerbTop : colours.kerbTop;
  path(top);
  ctx.fill();
  if (style !== 'rail') {
    // soil inside the kerb, and the hedge on it
    const inner = outline.map(([t, s]) => [t * 0.97, s * 0.72]).map((p) => toScreen(p, kerbLiftPx));
    ctx.fillStyle = colours.soil;
    path(inner);
    ctx.fill();
    const hedgeTop = outline.map(([t, s]) => [t * 0.95, s * 0.66]).map((p) => toScreen(p, kerbLiftPx + hedgePx));
    ctx.fillStyle = colours.hedgeDark;
    for (let i = 0; i < inner.length - 1; i++) { path([inner[i], inner[i + 1], hedgeTop[i + 1], hedgeTop[i]]); ctx.fill(); }
    ctx.fillStyle = colours.hedge;
    path(hedgeTop);
    ctx.fill();
    // leaves: a few lighter tufts along the top
    ctx.fillStyle = colours.hedgeLight;
    for (let k = 0; k < 9; k++) {
      const t = -0.42 + k * 0.105;
      if ((cap === 'start' && t < -0.5 + noseLen * 0.8) || (cap === 'end' && t > 0.5 - noseLen * 0.8)) continue;
      const p = toScreen([t, ((k * 37) % 7 - 3) / 3 * half * 0.35], kerbLiftPx + hedgePx + 0.4);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.1, 1.2, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  scene.textures.addCanvas(key, canvas);
  if (!scene.roadMedianTextureOrigins) scene.roadMedianTextureOrigins = new Map();
  scene.roadMedianTextureOrigins.set(key, { x: -minX / (maxX - minX), y: -minY / (maxY - minY) });
  return key;
}

function ensureRoadMedianMaps(scene) {
  if (!scene) return false;
  ['roadMedianStripSprites', 'roadMedianRailSprites', 'roadMedianTreeSprites'].forEach((name) => { if (!scene[name]) scene[name] = new Map(); });
  return true;
}

function clearRoadMedianSprites(scene) {
  ['roadMedianStripSprites', 'roadMedianRailSprites', 'roadMedianTreeSprites', 'roadMedianPlanterSprites'].forEach((name) => {
    scene?.[name]?.forEach((sprite) => sprite.destroy());
    scene?.[name]?.clear();
  });
}

// The railings: the pavements' 行人路欄杆 (pedestrian-railings.js art), half a tile each, on the line.
// Sorted between the two carriageways: in front of the traffic on the far one, behind the near one's.
function placeRoadMedianRail(scene, run, along, key) {
  const side = run.orientation === 'v' ? 'e' : 's';
  const facing = typeof pedestrianRailingFacing === 'function' ? pedestrianRailingFacing({ side }) : 'se';
  const textureKey = typeof pedestrianRailingTextureKey === 'function' ? pedestrianRailingTextureKey(facing, 1) : 'pedestrian_railing_v';
  if (!scene.textures.exists(textureKey)) return null;
  let sprite = scene.roadMedianRailSprites.get(key);
  if (!sprite) {
    sprite = scene.add.image(0, 0, textureKey);
    sprite.setVisible(false);
    if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
    if (scene.worldMask) sprite.setMask(scene.worldMask);
    scene.roadMedianRailSprites.set(key, sprite);
  }
  if (typeof applyPedestrianRailingSpriteTexture === 'function') applyPedestrianRailingSpriteTexture(scene, sprite, textureKey, 1);
  const p = roadMedianPoint(scene, run, along);
  const offset = typeof pedestrianRailingOffsetFor === 'function' ? pedestrianRailingOffsetFor(facing) : { dx: 0, dy: 0 };
  sprite.setPosition(p.x + offset.dx, p.y + offset.dy);
  // its depth: the nearer carriageway's side of the line, at the piece's far end
  const ends = [along - 0.25, along + 0.25];
  const nearSide = roadMedianPoint(scene, run, along, 0.5).iso > roadMedianPoint(scene, run, along, -0.5).iso ? 1 : -1;
  const depthY = Math.min(...ends.map((a) => roadMedianPoint(scene, run, a, 0.12 * nearSide).iso));
  sprite.setDepth(getWorldDepth('object', depthY + TILE_HEIGHT));
  sprite.__nightTintDirty = 'prop';
  return sprite;
}

// A Washingtonia-like palm (金鐘道's): a tall grey trunk and a crown of drooping fronds - drawn
// once, shared. Its foot at (32, 118) of 64 x 120 (canvas px; 1/3 scale on screen).
function ensureRoadMedianPalmTexture(scene) {
  const key = 'road_median_palm';
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 120;
  const ctx = canvas.getContext('2d');
  // shadow, trunk (a slight lean), its rings
  ctx.fillStyle = 'rgba(40, 50, 30, 0.35)';
  ctx.beginPath(); ctx.ellipse(32, 117, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
  const trunk = (t) => ({ x: 32 + Math.sin(t * 1.4) * 3, y: 118 - t * 82 });
  for (let t = 0; t < 1; t += 0.02) {
    const p = trunk(t), w = 3.4 - t * 1.2;
    ctx.fillStyle = t % 0.1 < 0.02 ? '#7d776c' : '#9a9387';
    ctx.fillRect(p.x - w, p.y - 2, w * 2, 2.2);
    ctx.fillStyle = 'rgba(60, 55, 48, 0.35)';
    ctx.fillRect(p.x + w * 0.35, p.y - 2, w * 0.65, 2.2);
  }
  const top = trunk(1);
  // fronds: arcs out and down from the crown, darker behind, lighter in front
  const frond = (angle, length, droop, colour, width) => {
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(top.x, top.y);
    const ex = top.x + Math.cos(angle) * length, ey = top.y + Math.sin(angle) * length * 0.55 + droop;
    ctx.quadraticCurveTo(top.x + Math.cos(angle) * length * 0.55, top.y - 6 + Math.sin(angle) * length * 0.3, ex, ey);
    ctx.stroke();
    // leaflets
    ctx.lineWidth = 1;
    for (let k = 0.3; k < 1; k += 0.12) {
      const px = top.x + (ex - top.x) * k, py = top.y + (ey - top.y) * k - 4 * Math.sin(k * Math.PI);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(angle + 1.2) * 4, py + 4); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(angle - 1.2) * 4, py + 4); ctx.stroke();
    }
  };
  for (let i = 0; i < 9; i++) frond(Math.PI + (i / 8) * Math.PI * 1.0 - 0.0, 26, 12 + (i % 3) * 2, '#2f5a25', 2.6);
  for (let i = 0; i < 8; i++) frond((i / 7) * Math.PI, 24, 15 + (i % 2) * 3, '#4b7d33', 2.4);
  ctx.fillStyle = '#5a4a32';
  ctx.beginPath(); ctx.ellipse(top.x, top.y + 1, 3, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  scene.textures.addCanvas(key, canvas);
  return key;
}

function placeRoadMedianTree(scene, run, along, style, key) {
  if (style === 'palms') ensureRoadMedianPalmTexture(scene);
  const textureKey = ROAD_MEDIAN.treeKeys[style];
  if (!textureKey || !scene.textures.exists(textureKey)) return null;
  let sprite = scene.roadMedianTreeSprites.get(key);
  if (!sprite) {
    sprite = scene.add.image(0, 0, textureKey).setOrigin(0.5, 1);
    sprite.setVisible(false);
    if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
    if (scene.worldMask) sprite.setMask(scene.worldMask);
    scene.roadMedianTreeSprites.set(key, sprite);
  } else if (sprite.texture.key !== textureKey) sprite.setTexture(textureKey);
  const p = roadMedianPoint(scene, run, along);
  if (style === 'palms') sprite.setOrigin(0.5, 118 / 120);
  sprite.setScale(style === 'palms' ? 0.36 : ROAD_MEDIAN.treeScale).setPosition(p.x, p.y - ROAD_MEDIAN.kerbLiftPx);
  sprite.setDepth(getWorldDepth('object', p.iso + TILE_HEIGHT));
  sprite.__nightTintDirty = 'prop';
  return sprite;
}

// ── Norton's planters and flower beds (road-median-art.js, scripts/bake-median-planter-textures.js) ─

function roadMedianPlanterArt(setName) {
  const art = typeof ROAD_MEDIAN_PLANTERS !== 'undefined' ? ROAD_MEDIAN_PLANTERS : null;
  return art?.[setName] ?? null;
}

// A run's own number, for its mix of beds (the same every time it is laid).
function roadMedianRunSeed(run) {
  let h = 2166136261;
  `${run.orientation}:${run.line}:${run.from}:${run.to}`.split('').forEach((ch) => { h = Math.imul(h ^ ch.charCodeAt(0), 16777619); });
  return h >>> 0;
}

// Pure: the pieces of a set down a run `length` tiles long: `first` at the start, `last` at the end,
// bodies between (a mixed set's by the seed, a longer one likelier; otherwise the longest that fits),
// the gaps shared out. [{ piece, at }] with `at` the piece's start, tiles from the run's start.
function layRoadMedianPlanters(length, setName = 'palms', seed = 0, art = roadMedianPlanterArt(setName)) {
  const set = ROAD_MEDIAN.planterSets[setName];
  if (!set || !art?.[set.first] || !art?.[set.last] || !art?.[set.single]) return [];
  const len = (name) => art[name].lengthTiles;
  const { gap } = set;
  if (length < len(set.first) + len(set.last) + gap) {
    return length >= len(set.single) ? [{ piece: set.single, at: +((length - len(set.single)) / 2).toFixed(4) }] : [];
  }
  let state = seed >>> 0;
  const random = () => {   // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const middle = [];
  let room = length - len(set.first) - len(set.last) - gap * 2;
  const bodies = set.bodies.filter((name) => art[name]);
  for (;;) {
    const fits = bodies.filter((name) => len(name) + gap <= room);
    if (!fits.length) break;
    // a mixed set's: any that fits, a longer one likelier (by its length)
    let pick = fits[0];
    if (set.mixed) {
      let r = random() * fits.reduce((sum, name) => sum + len(name), 0);
      pick = fits.find((name) => (r -= len(name)) < 0) ?? fits[fits.length - 1];
    }
    middle.push(pick);
    room -= len(pick) + gap;
  }
  const order = [set.first, ...middle, set.last];
  const spare = room / (order.length - 1);
  const out = [];
  let at = 0;
  order.forEach((piece) => {
    out.push({ piece, at: +at.toFixed(4) });
    at += len(piece) + gap + spare;
  });
  return out;
}

function roadMedianPlanterKey(setName, piece, variant) {
  return `median_${setName}_${piece}_${variant}`;
}

// A set's textures, loaded the first time a run wants them; the runs are laid again when they come.
function ensureRoadMedianPlanterTextures(scene, setName) {
  const art = roadMedianPlanterArt(setName);
  if (!art || !scene?.load) return false;
  const missing = [];
  Object.entries(art).forEach(([piece, pieceArt]) => ['A', 'B'].forEach((variant) => {
    const key = roadMedianPlanterKey(setName, piece, variant);
    if (!scene.textures.exists(key)) missing.push([key, pieceArt.files[variant], pieceArt.canvas]);
  }));
  if (!missing.length) return true;
  if (!scene.__roadMedianPlantersLoading) scene.__roadMedianPlantersLoading = new Set();
  if (scene.__roadMedianPlantersLoading.has(setName)) return false;
  scene.__roadMedianPlantersLoading.add(setName);
  missing.forEach(([key, file, canvas]) => scene.load.image(key, typeof resolvePropAssetPath === 'function' ? resolvePropAssetPath(file, canvas) : file));
  scene.load.once('complete', () => {
    scene.__roadMedianPlantersLoading.delete(setName);
    if (scene.roadMedianRuns) rebuildRoadMedianSprites(scene, scene.roadMedianRuns);
  });
  scene.load.start();
  return false;
}

// One piece on a run: in upright strips a third of a tile along, each sorted between the two
// carriageways at its own place (the traffic on the far one behind it, the near one's in front) - a
// planter a tile long sorted as one would be in front of the far side's cars at one end and behind
// the near side's at the other. `lay.at` is its near end, tiles from the run's lower end on screen.
function placeRoadMedianPlanter(scene, run, setName, lay, low, dir, variant, keyBase, wanted) {
  const art = roadMedianPlanterArt(setName)[lay.piece];
  const key = roadMedianPlanterKey(setName, lay.piece, variant);
  if (!scene.textures.exists(key)) return;
  const texture = scene.textures.get(key);
  const frame = texture.get();
  const file = art.files[variant];
  const ax = variant === 'A' ? art.anchor.x : art.canvas.width - art.anchor.x;
  const spec = typeof getPropTextureAnchor === 'function'
    ? getPropTextureAnchor(file, ax, art.anchor.y, frame)
    : { originX: ax / frame.width, originY: art.anchor.y / frame.height, scaleMultiplier: 1 };
  const scale = spec.scaleMultiplier / art.res;
  // the piece's near end on the line, and the screen px a tile along it (from the run's lower end)
  const nearAlong = low + dir * lay.at;
  const p = roadMedianPoint(scene, run, nearAlong);
  const ahead = roadMedianPoint(scene, run, nearAlong + dir);
  const tilePxX = ahead.x - p.x;                    // + for A (the far end to the right), - for B
  const nearSide = roadMedianPoint(scene, run, nearAlong, 0.5).iso > roadMedianPoint(scene, run, nearAlong, -0.5).iso ? 1 : -1;
  const stripPx = Math.max(8, Math.round(Math.abs(tilePxX) / 3 / scale));   // texture px a strip
  const originX = spec.originX * frame.width;
  for (let x0 = 0, i = 0; x0 < frame.width; x0 += stripPx, i++) {
    const w = Math.min(stripPx, frame.width - x0);
    const spriteKey = `${keyBase}:${i}`;
    let sprite = scene.roadMedianPlanterSprites.get(spriteKey);
    if (!sprite) {
      sprite = scene.add.image(0, 0, key);
      sprite.setVisible(false);
      if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
      if (scene.worldMask) sprite.setMask(scene.worldMask);
      scene.roadMedianPlanterSprites.set(spriteKey, sprite);
    } else if (sprite.texture.key !== key) sprite.setTexture(key);
    sprite.setOrigin(spec.originX, spec.originY).setScale(scale).setPosition(p.x, p.y);
    sprite.setCrop(x0, 0, w, frame.height);
    // the strip's place along the piece (tiles from its near end), held within the piece
    const t0 = ((x0 - originX) * scale) / tilePxX, t1 = ((x0 + w - originX) * scale) / tilePxX;
    const ends = [t0, t1].map((t) => Math.min(art.lengthTiles, Math.max(0, t)));
    const depthY = Math.min(...ends.map((t) => roadMedianPoint(scene, run, nearAlong + dir * t, 0.12 * nearSide).iso));
    sprite.setDepth(getWorldDepth('object', depthY + TILE_HEIGHT));
    // (culled by its strip's own place)
    const mid = roadMedianPoint(scene, run, nearAlong + dir * Math.min(art.lengthTiles, Math.max(0, (t0 + t1) / 2)));
    sprite.__cullX = mid.x; sprite.__cullY = mid.y;
    sprite.mapRow = run.orientation === 'v' ? Math.round(nearAlong) : run.line;
    sprite.mapCol = run.orientation === 'v' ? run.line : Math.round(nearAlong);
    sprite.__nightTintDirty = 'prop';
    wanted.add(spriteKey);
  }
}

// A run laid with a set. Returns the pieces as laid, in map terms along the run ([{ piece, from, to }],
// fractional rows or columns), or null while the set's art loads.
function placeRoadMedianPlanters(scene, run, setName, wanted) {
  if (!ensureRoadMedianPlanterTextures(scene, setName)) return null;
  const set = ROAD_MEDIAN.planterSets[setName];
  const art = roadMedianPlanterArt(setName);
  // along the line from the end lower on screen
  const start = roadMedianPoint(scene, run, run.from - 0.5), end = roadMedianPoint(scene, run, run.to + 0.5);
  const fromLow = start.y >= end.y;
  const low = fromLow ? run.from - 0.5 : run.to + 0.5;
  const dir = fromLow ? 1 : -1;
  const other = fromLow ? end : start;
  const lowPoint = fromLow ? start : end;
  const variant = other.x >= lowPoint.x ? 'A' : 'B';
  const length = run.to - run.from + 1;
  let lays = layRoadMedianPlanters(length, setName, roadMedianRunSeed(run));
  // laid from the map start: its pieces turned round to count from the lower end
  if (set.fromMapStart && !fromLow) lays = lays.map(({ piece, at }) => ({ piece, at: +(length - at - art[piece].lengthTiles).toFixed(4) }));
  lays.forEach((lay, index) => {
    placeRoadMedianPlanter(scene, run, setName, lay, low, dir, variant, `${run.orientation}:${run.line}:${run.from}:${index}`, wanted);
  });
  return lays.map(({ piece, at }) => {
    const a = low + dir * at, b = low + dir * (at + art[piece].lengthTiles);
    return { piece, from: Math.min(a, b), to: Math.max(a, b) };
  });
}

// Pure: where a tree stands on a run laid with beds - at `along` (a tile's middle), moved into the
// bed nearest it if it falls in a gap or by a bed's end; null with no bed.
function roadMedianTreeSpot(along, beds, margin = 0.1) {
  let best = null;
  beds.forEach((bed) => {
    const lo = bed.from + Math.min(margin, (bed.to - bed.from) / 2), hi = bed.to - Math.min(margin, (bed.to - bed.from) / 2);
    const spot = Math.min(hi, Math.max(lo, along));
    if (!best || Math.abs(spot - along) < Math.abs(best - along)) best = spot;
  });
  return best;
}

// Reconcile the reservation's pieces with `runs` (from street-lamps.js's rebuild, or worked out here).
function rebuildRoadMedianSprites(scene, runs = null) {
  if (!ensureRoadMedianMaps(scene) || !scene.textures || typeof document === 'undefined') return;
  const list = runs ?? computeSceneRoadMedianRuns(scene);
  scene.roadMedianRuns = list;
  if (!scene.roadMedianPlanterSprites) scene.roadMedianPlanterSprites = new Map();
  const wanted = { strip: new Set(), rail: new Set(), tree: new Set(), planter: new Set() };
  list.forEach((run) => {
    const style = run.style || 'hedge';
    // Norton's planters and beds, kerbs and all (a drawn strip below while they load)
    const setName = ROAD_MEDIAN.styleSets[style];
    if (setName && roadMedianPlanterArt(setName)) {
      const beds = placeRoadMedianPlanters(scene, run, setName, wanted.planter);
      if (beds) {
        // trees in the beds, between the lamps (the tiles k%3 == 2, short of the ends)
        if (style === 'trees') {
          for (let a = run.from + 1; a < run.to; a++) {
            if (((a % 3) + 3) % 3 !== 2) continue;
            const spot = roadMedianTreeSpot(a, beds);
            if (spot == null) continue;
            const treeKey = `${run.orientation}:${run.line}:${a}`;
            const sprite = placeRoadMedianTree(scene, run, spot, style, treeKey);
            if (sprite) {
              sprite.mapRow = run.orientation === 'v' ? a : run.line;
              sprite.mapCol = run.orientation === 'v' ? run.line : a;
              wanted.tree.add(treeKey);
            }
          }
        }
        return;
      }
    }
    for (let a = run.from; a <= run.to; a++) {
      const cap = a === run.from ? 'start' : a === run.to ? 'end' : 'none';
      const pieceKey = `${run.orientation}:${run.line}:${a}`;
      const textureKey = ensureRoadMedianPieceTexture(scene, run, style, cap);
      let piece = scene.roadMedianStripSprites.get(pieceKey);
      if (!piece) {
        piece = scene.add.image(0, 0, textureKey);
        piece.setVisible(false);
        if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, piece, 'roadLayer');
        if (scene.worldMask) piece.setMask(scene.worldMask);
        piece.__nightGround = true;
        scene.roadMedianStripSprites.set(pieceKey, piece);
      } else if (piece.texture.key !== textureKey) piece.setTexture(textureKey);
      const origin = scene.roadMedianTextureOrigins.get(textureKey);
      const p = roadMedianPoint(scene, run, a);
      piece.setOrigin(origin.x, origin.y).setScale(1 / ROAD_MEDIAN.res).setPosition(p.x, p.y);
      // over the road's tiles and markings, under everything standing (traffic, lamps, trees)
      piece.setDepth(getWorldDepth('road', p.iso + TILE_HEIGHT * 0.75));
      piece.mapRow = run.orientation === 'v' ? a : run.line;
      piece.mapCol = run.orientation === 'v' ? run.line : a;
      piece.__nightTintDirty = 'prop';
      wanted.strip.add(pieceKey);
      if (style === 'rail') {
        [a - 0.25, a + 0.25].forEach((at, i) => {
          if ((cap === 'start' && i === 0) || (cap === 'end' && i === 1)) return;
          const railKey = `${pieceKey}:${i}`;
          const sprite = placeRoadMedianRail(scene, run, at, railKey);
          if (sprite) { sprite.mapRow = piece.mapRow; sprite.mapCol = piece.mapCol; wanted.rail.add(railKey); }
        });
      }
      // trees between the lamps (the tiles k%3 == 2, at their middles)
      if ((style === 'trees' || style === 'palms') && ((a % 3) + 3) % 3 === 2 && cap === 'none') {
        const sprite = placeRoadMedianTree(scene, run, a, style, pieceKey);
        if (sprite) { sprite.mapRow = piece.mapRow; sprite.mapCol = piece.mapCol; wanted.tree.add(pieceKey); }
      }
    }
  });
  [['roadMedianStripSprites', wanted.strip], ['roadMedianRailSprites', wanted.rail], ['roadMedianTreeSprites', wanted.tree], ['roadMedianPlanterSprites', wanted.planter]].forEach(([name, keep]) => {
    scene[name].forEach((sprite, key) => {
      if (keep.has(key)) return;
      sprite.destroy();
      scene[name].delete(key);
    });
  });
  if (typeof applyNightPropTint === 'function') {
    ['roadMedianStripSprites', 'roadMedianRailSprites', 'roadMedianTreeSprites', 'roadMedianPlanterSprites'].forEach((name) => scene[name].forEach((sprite) => applyNightPropTint(scene, sprite)));
  }
  scene.terrainViewportCacheKey = null; // re-cull so the new pieces show
}

// The map moved or turned: placed again (and drawn for the way the line now runs on screen).
function refreshAllRoadMedianSprites(scene) {
  if (scene?.roadMedianRuns) rebuildRoadMedianSprites(scene, scene.roadMedianRuns);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ROAD_MEDIAN, computeRoadMedianRuns, roadMedianStyleFor, roadMedianLampPlacements, roadMedianTileIndex, roadMedianPair, layRoadMedianPlanters, roadMedianTreeSpot, roadMedianRunSeed };
}
