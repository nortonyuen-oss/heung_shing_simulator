// 高架路牌: overhead direction signs on gantries over the road (Norton, 2026-11-28: 仲有啲高架路牌
// 可以加 / 跟香港運輸署條例咩地方擺呢啲路牌 / 我地兩線就用得，因為我們的路比較窄).
//
// Where, after the Transport Department's Transport Planning and Design Manual, Volume 3 Chapter 3
// (Directional Signs, August 2026 edition):
// - 3.2.2.2(i): gantry signs stand above and across a carriageway and give the destinations for its
//   lanes; mainly at junctions on expressways and trunk roads, and major junctions on other roads.
// - 3.4.2.4: on non-expressways gantries are for four lanes or more - and are required for "elevated
//   roads". Our roads are narrower: two lanes will do (Norton). So: the approaches to a 天橋 or
//   懸索橋 (an elevated road), to a 海底隧道 and to a 區外連線 (the trunk road out of the district).
// - 3.2.4.6: roads of local status get no directional signs - none anywhere else.
// - 3.2.4.8: gantries no closer than 150-200 m (50-70 km/h): OVERHEAD_SIGN.minSpacingTiles at 20 m a
//   tile (docs/world-scale.md).
// - 3.2.7.4 / 3.2.7.8: blue for non-expressways; green for expressways and the roads built to their
//   standard such as the Tsing Ma Control Area's - our 青馬式懸索橋 approaches are green.
// - 3.2.7.13: every overhead sign is lit: its face keeps its light at night.
// - Lane destination signs: one panel over each lane (or lanes) of a direction, an arrow down to
//   each lane; English and Chinese on the panel. With no named district ahead, 所有目的地 / All
//   Destinations, as on Hong Kong's own gantries.
//
// The destinations are the player's districts (district-signs.js, 中英對照), the neighbour beyond a
// 區外連線 (region-connections.js), and 海底隧道 for a tunnel.

const OVERHEAD_SIGN = Object.freeze({
  minSpacingTiles: 8,
  approachTiles: [2, 3, 1, 4, 5, 6], // how far before a bridge's ramp or a tunnel's open end to stand (past a junction there: further back)
  edgeTiles: [3, 4, 2, 5],           // how far in from the map edge on a 區外連線
  aheadTiles: [6, 9, 12, 15, 18, 22], // where to look for the district a road leads to
  res: 3,                             // canvas pixels a screen pixel (sharp when zoomed in)
  clearancePx: 30,                    // the panels' underside above the road: a double-decker passes under
  panelPx: 13,
  beamPx: 3,
  postPx: 2.2,
  colours: Object.freeze({ blue: '#1d4ea3', green: '#16794a', white: '#ffffff', frame: '#8f979e', frameDark: '#6c747b', back: '#a4acb3' }),
});

const OVERHEAD_SIGN_ALL = Object.freeze({ zh: '所有目的地', en: 'All Destinations' });
const OVERHEAD_SIGN_TUNNEL = Object.freeze({ zh: '海底隧道', en: 'Harbour Tunnel' });
const OVERHEAD_SIGN_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const OVERHEAD_SIGN_OPPOSITE = Object.freeze({ n: 's', e: 'w', s: 'n', w: 'e' });

function overheadDirOf(dr, dc) {
  return Object.keys(OVERHEAD_SIGN_DIRS).find((k) => OVERHEAD_SIGN_DIRS[k][0] === Math.sign(dr) && OVERHEAD_SIGN_DIRS[k][1] === Math.sign(dc)) || null;
}

// The district a point is in, as its sign names it; null where none is named.
function overheadDistrictAt(row, col) {
  if (typeof getDistrictSignForTile !== 'function' || !isInsideMap(row, col)) return null;
  const sign = getDistrictSignForTile(row, col);
  if (!sign?.name) return null;
  return { zh: String(sign.name), en: String(sign.englishName || '') };
}

// The first named district down the road from (row, col) going `dir` that is not the one the sign
// stands in (a sign points on to somewhere else); else the one it stands in; else null.
function overheadDistrictAhead(row, col, dir) {
  const [dr, dc] = OVERHEAD_SIGN_DIRS[dir];
  const here = overheadDistrictAt(row, col);
  for (const k of OVERHEAD_SIGN.aheadTiles) {
    const r = Math.max(0, Math.min(MAP_HEIGHT - 1, row + dr * k));
    const c = Math.max(0, Math.min(MAP_WIDTH - 1, col + dc * k));
    const there = overheadDistrictAt(r, c);
    if (there && (!here || there.zh !== here.zh)) return there;
  }
  return null;
}

function isOverheadPlainRoad(row, col) {
  if (!isInsideMap(row, col) || mapData[row][col] !== ROAD) return false;
  if (typeof bridgeMap !== 'undefined' && bridgeMap.get(getTileId(row, col)) != null) return false;
  if (typeof getUnderseaTunnelTile === 'function' && getUnderseaTunnelTile(row, col)) return false;
  return true;
}

// A site for a gantry across the road `tiles` (side by side) carrying traffic along `dir`: plain road,
// the road going on a tile either way, and no road off to either side there - not at a junction,
// where its posts would stand in the cross road's lanes (Norton, 2026-11-28: 十字路口唔可以咁放龍門架).
function isOverheadClearSite(tiles, dir) {
  const [dr, dc] = OVERHEAD_SIGN_DIRS[dir];
  const across = dr ? [0, 1] : [1, 0];
  const road = (r, c) => isInsideMap(r, c) && (typeof isRoadTile === 'function' ? isRoadTile(r, c) : mapData[r][c] === ROAD);
  if (!tiles.length || !tiles.every(([r, c]) => isOverheadPlainRoad(r, c))) return false;
  const at = (t) => t[0] * across[0] + t[1] * across[1];
  const lo = tiles.reduce((m, t) => (at(t) < at(m) ? t : m));
  const hi = tiles.reduce((m, t) => (at(t) > at(m) ? t : m));
  for (const k of [-1, 0, 1]) {
    if (!tiles.every(([r, c]) => road(r + dr * k, c + dc * k))) return false;
    // beyond the road's edges, this tile and the ones either side of it along the road: no road
    if (road(lo[0] + dr * k - across[0], lo[1] + dc * k - across[1])) return false;
    if (road(hi[0] + dr * k + across[0], hi[1] + dc * k + across[1])) return false;
  }
  return true;
}

// Every gantry the city's roads call for: { id, tiles: [[r, c]...] across the road, travel: 'ns' |
// 'ew', panels: { [dir]: { zh, en, colour } } for the traffic going each way, priority }.
function computeOverheadSignPlacements() {
  const out = [];
  // (a) a 天橋's or 懸索橋's approaches, both ways: on, the district over the far end; off, the next
  // district down the road
  if (typeof bridgeMap !== 'undefined' && typeof isHighBridgeTile === 'function' && typeof highBridgeRun === 'function') {
    const seen = new Set();
    bridgeMap.forEach((_, id) => {
      const [row, col] = id.split(':').map(Number);
      if (!isHighBridgeTile(row, col)) return;
      const run = highBridgeRun(row, col);
      if (!run.tiles.length) return;
      const key = getTileId(run.tiles[0].row, run.tiles[0].col);
      if (seen.has(key)) return;
      seen.add(key);
      const [dr, dc] = run.axis === 'row' ? [0, 1] : [1, 0];
      const ends = [
        { tile: run.tiles[0], out: [-dr, -dc], far: run.tiles.at(-1), farOut: [dr, dc] },
        { tile: run.tiles.at(-1), out: [dr, dc], far: run.tiles[0], farOut: [-dr, -dc] },
      ];
      ends.forEach(({ tile, out: [or, oc], far, farOut: [fr, fc] }) => {
        const outDir = overheadDirOf(or, oc);
        const onDir = OVERHEAD_SIGN_OPPOSITE[outDir];
        for (const k of OVERHEAD_SIGN.approachTiles) {
          const r = tile.row + or * k, c = tile.col + oc * k;
          let joined = true;
          for (let j = 1; j < k && joined; j++) joined = isOverheadPlainRoad(tile.row + or * j, tile.col + oc * j);
          if (!joined || !isOverheadClearSite([[r, c]], outDir)) continue;
          const beyond = overheadDistrictAt(far.row + fr * 4, far.col + fc * 4) || overheadDistrictAhead(far.row, far.col, OVERHEAD_SIGN_OPPOSITE[outDir]);
          out.push({
            id: `bridge:${key}:${outDir}`,
            tiles: [[r, c]],
            travel: or ? 'ns' : 'ew',
            priority: 0,
            panels: {
              [onDir]: { ...(beyond || OVERHEAD_SIGN_ALL), colour: run.suspension ? 'green' : 'blue' },
              [outDir]: { ...(overheadDistrictAhead(r, c, outDir) || OVERHEAD_SIGN_ALL), colour: 'blue' },
            },
          });
          break;
        }
      });
    });
  }
  // (b) a 海底隧道's two portals: into it, 海底隧道; out of it, the district ahead
  if (typeof getUnderseaTunnels === 'function') {
    getUnderseaTunnels().forEach((tunnel) => {
      (tunnel.portals || []).forEach((portal, index) => {
        const toSea = portal.dir;
        const inland = OVERHEAD_SIGN_OPPOSITE[toSea];
        const [ir, ic] = OVERHEAD_SIGN_DIRS[inland];
        for (const k of OVERHEAD_SIGN.approachTiles) {
          const tiles = (portal.approach || []).map(([r, c]) => [r + ir * (k - 1), c + ic * (k - 1)]);
          if (!isOverheadClearSite(tiles, inland)) continue;
          tiles.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
          const [mr, mc] = tiles[Math.floor(tiles.length / 2)];
          out.push({
            id: `tunnel:${tunnel.id}:${index}`,
            tiles,
            travel: ir ? 'ns' : 'ew',
            priority: 1,
            panels: {
              [toSea]: { ...OVERHEAD_SIGN_TUNNEL, colour: 'blue' },
              [inland]: { ...(overheadDistrictAhead(mr, mc, inland) || OVERHEAD_SIGN_ALL), colour: 'blue' },
            },
          });
          break;
        }
      });
    });
  }
  // (c) a 區外連線: out, 往 the neighbour; in, the district ahead
  if (typeof detectRegionConnections === 'function') {
    const neighbours = typeof getRegionNeighbours === 'function' ? getRegionNeighbours() : {};
    detectRegionConnections().forEach((connection) => {
      const outDir = connection.side;
      const inDir = OVERHEAD_SIGN_OPPOSITE[outDir];
      const [ir, ic] = OVERHEAD_SIGN_DIRS[inDir];
      const neighbour = neighbours?.[outDir];
      const name = typeof getRegionNeighbourName === 'function'
        ? { zh: `往${getRegionNeighbourName(neighbour, 'zhHant')}`, en: `To ${getRegionNeighbourName(neighbour, 'en')}` }
        : OVERHEAD_SIGN_ALL;
      for (const k of OVERHEAD_SIGN.edgeTiles) {
        const tiles = connection.tiles.map(([r, c]) => [r + ir * k, c + ic * k]);
        if (!isOverheadClearSite(tiles, inDir)) continue;
        const [mr, mc] = tiles[Math.floor(tiles.length / 2)];
        out.push({
          id: `region:${outDir}:${connection.tiles[0].join(',')}`,
          tiles,
          travel: ir ? 'ns' : 'ew',
          priority: 2,
          panels: {
            [outDir]: { ...name, colour: 'blue' },
            [inDir]: { ...(overheadDistrictAhead(mr, mc, inDir) || OVERHEAD_SIGN_ALL), colour: 'blue' },
          },
        });
        break;
      }
    });
  }
  // gantries no closer than minSpacingTiles (the more important first)
  out.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const kept = [];
  out.forEach((g) => {
    const [r, c] = g.tiles[0];
    if (kept.some((k) => Math.max(Math.abs(k.tiles[0][0] - r), Math.abs(k.tiles[0][1] - c)) < OVERHEAD_SIGN.minSpacingTiles)) return;
    kept.push(g);
  });
  return kept;
}

// The lanes under a gantry, across it: [{ dir, from, to }] in tiles from its middle along `across`
// ([dr, dc] across the road). A two-way road: a lane each half, keep left; a one-way tile of a
// widened road or a tunnel's bore: the whole tile.
function overheadSignLanes(g) {
  const across = g.travel === 'ns' ? [0, 1] : [1, 0];
  const mid = g.tiles.reduce((s, [r, c]) => [s[0] + r / g.tiles.length, s[1] + c / g.tiles.length], [0, 0]);
  const lanes = [];
  g.tiles.forEach(([r, c]) => {
    const at = (r - mid[0]) * across[0] + (c - mid[1]) * across[1];
    const band = typeof getRoadCarriagewayBand === 'function' ? getRoadCarriagewayBand(r, c) : null;
    if (band && OVERHEAD_SIGN_DIRS[band.direction]) {
      lanes.push({ dir: band.direction, from: at - 0.5, to: at + 0.5 });
      return;
    }
    const dirs = g.travel === 'ns' ? ['n', 's'] : ['e', 'w'];
    dirs.forEach((dir) => {
      const [dr, dc] = OVERHEAD_SIGN_DIRS[dir];
      // keep left: the driver's left of (dr, dc) is (-dc, dr), as getTrafficLeftLaneOffset has it
      const left = [-dc, dr];
      const side = left[0] * across[0] + left[1] * across[1];
      lanes.push({ dir, from: side > 0 ? at : at - 0.5, to: side > 0 ? at + 0.5 : at });
    });
  });
  return lanes.sort((a, b) => a.from - b.from);
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────────

// The face the camera sees, as the map is turned: { normal: dir, right: [dr, dc] the viewer's right
// along the gantry, R: screen px a tile along it }.
function overheadSignView(g) {
  const dirs = g.travel === 'ns' ? ['n', 's'] : ['e', 'w'];
  const [r0, c0] = g.tiles[0];
  const base = isoToScreen(c0, r0);
  const toward = dirs.find((d) => { const [dr, dc] = OVERHEAD_SIGN_DIRS[d]; return isoToScreen(c0 + dc, r0 + dr).y > base.y; });
  const [nr, nc] = OVERHEAD_SIGN_DIRS[toward];
  // looking along -n, the viewer's right in (x = col, y = row): (ny, -nx) -> (row, col) = (-nc, nr)
  let right = [-nc, nr];
  let R = isoToScreen(c0 + right[1], r0 + right[0]);
  R = { x: R.x - base.x, y: R.y - base.y };
  if (R.x < 0) { right = [-right[0], -right[1]]; R = { x: -R.x, y: -R.y }; }
  return { normal: toward, right, R };
}

function overheadFitFont(ctx, text, weight, family, maxSize, maxWidth) {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 1.2 && ctx.measureText(text).width > maxWidth) {
    size -= 0.2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

const OVERHEAD_ZH_FONT = '"PingFang HK", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", sans-serif';
const OVERHEAD_EN_FONT = '"Helvetica Neue", Arial, sans-serif';

// Two canvases, one size and anchor: the steel and the panels' backs (darkened at night), and the
// faces (lit). Returns { frame, face, ox, oy } (anchor in canvas px: the gantry's middle on the road).
function drawOverheadGantry(g, view) {
  const { res, clearancePx: clear, panelPx, beamPx, postPx, colours } = OVERHEAD_SIGN;
  const lanes = overheadSignLanes(g);
  const across = g.travel === 'ns' ? [0, 1] : [1, 0];
  const flip = view.right[0] * across[0] + view.right[1] * across[1];   // +1 or -1
  const L = view.R.x;                       // screen px a tile along the gantry
  const slope = view.R.y / view.R.x;
  const half = g.tiles.length / 2 + 0.08;
  const uMin = -half * L, uMax = half * L;
  const top = clear + panelPx + beamPx + 1.5;
  const ys = [slope * uMin, slope * uMax];
  const pad = 2;
  const ox = Math.ceil((-uMin + pad) * res);
  const oy = Math.ceil((top - Math.min(...ys) + pad) * res);
  const width = Math.ceil((uMax - uMin + pad * 2) * res);
  const height = Math.ceil((top + Math.max(...ys) - Math.min(...ys) + pad * 2) * res);
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(res, res * slope, 0, res, ox, oy);
    return { canvas, ctx };
  };
  const frame = make(), face = make();
  const fc = frame.ctx;
  // posts and the beam (a box truss)
  [-1, 1].forEach((s) => {
    const u = s * (half - 0.02) * L;
    fc.fillStyle = colours.frame;
    fc.fillRect(u - postPx / 2, -top, postPx, top);
    fc.fillStyle = colours.frameDark;
    fc.fillRect(u + postPx / 2 - 0.6, -top, 0.6, top);
    fc.fillRect(u - postPx, -1.2, postPx * 2, 1.2);   // the footing
  });
  fc.fillStyle = colours.frame;
  fc.fillRect(uMin, -(clear + panelPx + beamPx), uMax - uMin, beamPx);
  fc.strokeStyle = colours.frameDark;
  fc.lineWidth = 0.35;
  for (let u = uMin; u < uMax; u += 3) {
    fc.beginPath(); fc.moveTo(u, -(clear + panelPx + beamPx)); fc.lineTo(u + 1.5, -(clear + panelPx)); fc.stroke();
  }
  // the panels: over each run of lanes one way, merged
  const groups = [];
  lanes.forEach((lane) => {
    const x0 = lane.from * L * flip, x1 = lane.to * L * flip;
    const span = { dir: lane.dir, u0: Math.min(x0, x1), u1: Math.max(x0, x1), arrows: [(x0 + x1) / 2] };
    const last = groups.at(-1);
    if (last && last.dir === span.dir && Math.abs(last.u1 - span.u0) < 0.01) { last.u1 = span.u1; last.arrows.push(...span.arrows); }
    else if (last && last.dir === span.dir && Math.abs(span.u1 - last.u0) < 0.01) { last.u0 = span.u0; last.arrows.push(...span.arrows); }
    else groups.push(span);
  });
  const readsFront = OVERHEAD_SIGN_OPPOSITE[view.normal];   // the traffic whose signs face the camera
  const y0 = -(clear + panelPx), y1 = -clear;
  groups.forEach((gr) => {
    const u0 = gr.u0 + 0.6, u1 = gr.u1 - 0.6, w = u1 - u0;
    if (w <= 2) return;
    if (gr.dir !== readsFront) {
      fc.fillStyle = colours.back;
      fc.fillRect(u0, y0, w, panelPx);
      fc.fillStyle = colours.frameDark;
      fc.fillRect(u0, y0 + panelPx * 0.45, w, 0.4);
      return;
    }
    const panel = g.panels[gr.dir] || { ...OVERHEAD_SIGN_ALL, colour: 'blue' };
    const ctx = face.ctx;
    ctx.fillStyle = colours[panel.colour] || colours.blue;
    ctx.fillRect(u0, y0, w, panelPx);
    ctx.strokeStyle = colours.white;
    ctx.lineWidth = 0.45;
    ctx.strokeRect(u0 + 0.5, y0 + 0.5, w - 1, panelPx - 1);
    ctx.fillStyle = colours.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const cx = (u0 + u1) / 2;
    // (small, as the lettering on a real gantry is from a way off - it need not be read: Norton,
    // 2026-11-28, 往鄰區三個字太大，其實唔一定需要睇到字)
    const room = Math.min(w - 3, w * 0.7);
    const zhSize = overheadFitFont(ctx, panel.zh, 700, OVERHEAD_ZH_FONT, 2.9, room);
    ctx.fillText(panel.zh, cx, y0 + 1.6 + zhSize * 0.92);
    if (panel.en) {
      const enSize = overheadFitFont(ctx, panel.en, 600, OVERHEAD_EN_FONT, 1.7, room);
      ctx.fillText(panel.en, cx, y0 + 2.3 + zhSize + enSize * 0.85);
    }
    // an arrow down to each lane
    gr.arrows.forEach((au) => {
      const ay = y1 - 1.1, h = 3, s = 1.2;
      ctx.beginPath();
      ctx.moveTo(au, ay); ctx.lineTo(au - s * 1.3, ay - h * 0.5); ctx.lineTo(au - s * 0.45, ay - h * 0.5);
      ctx.lineTo(au - s * 0.45, ay - h); ctx.lineTo(au + s * 0.45, ay - h); ctx.lineTo(au + s * 0.45, ay - h * 0.5);
      ctx.lineTo(au + s * 1.3, ay - h * 0.5); ctx.closePath(); ctx.fill();
    });
  });
  return { frame: frame.canvas, face: face.canvas, ox, oy };
}

// ── Sprites ─────────────────────────────────────────────────────────────────────────────────────────

function overheadSignAnchor(scene, g) {
  const points = g.tiles.map(([r, c]) => getTileFaceGeometry(r, c, scene.offsetX, scene.offsetY).center);
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const y = points.reduce((s, p) => s + p.y, 0) / points.length;
  // sorted by its front corner (the posts stand at the road's edges: the nearer is a tile's half in
  // front of the middle), in front of the traffic under it
  const iso = Math.max(...g.tiles.map(([r, c]) => isoToScreen(c, r).y));
  return { x, y, depth: getWorldDepth('object', iso + TILE_HEIGHT * 1.5) + 0.002 };
}

function overheadSignTextureSignature(g, view) {
  return JSON.stringify([g.tiles, g.travel, g.panels, view.normal, view.right, Math.round(view.R.x), Math.round(view.R.y)]);
}

function placeOverheadSign(scene, g) {
  const view = overheadSignView(g);
  const signature = overheadSignTextureSignature(g, view);
  let entry = scene.overheadSignSprites.get(g.id);
  if (!entry || entry.signature !== signature) {
    const drawn = drawOverheadGantry(g, view);
    const keys = { frame: `ohsign_${g.id}_${scene.__overheadSignSerial = (scene.__overheadSignSerial || 0) + 1}_f`, face: '' };
    keys.face = keys.frame.replace(/_f$/, '_s');
    scene.textures.addCanvas(keys.frame, drawn.frame);
    scene.textures.addCanvas(keys.face, drawn.face);
    const origin = { x: drawn.ox / drawn.frame.width, y: drawn.oy / drawn.frame.height };
    if (entry) destroyOverheadSign(scene, entry);
    const frame = scene.add.image(0, 0, keys.frame).setOrigin(origin.x, origin.y).setScale(1 / OVERHEAD_SIGN.res);
    const face = scene.add.image(0, 0, keys.face).setOrigin(origin.x, origin.y).setScale(1 / OVERHEAD_SIGN.res);
    [frame, face].forEach((sprite) => {
      if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
      if (scene.worldMask) sprite.setMask(scene.worldMask);
    });
    frame.__nightGround = false;
    face.__nightNone = true;   // lit (TPDM 3.2.7.13)
    entry = { frame, face, keys, signature };
    scene.overheadSignSprites.set(g.id, entry);
    scene.overheadSignFrameSprites.set(g.id, frame);
    scene.overheadSignFaceSprites.set(g.id, face);
  }
  entry.gantry = g;
  const at = overheadSignAnchor(scene, g);
  entry.frame.setPosition(at.x, at.y).setDepth(at.depth);
  entry.face.setPosition(at.x, at.y).setDepth(at.depth + 0.0005);
  if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, entry.frame);
  return entry;
}

function destroyOverheadSign(scene, entry) {
  entry.frame?.destroy();
  entry.face?.destroy();
  Object.values(entry.keys || {}).forEach((key) => { if (key && scene.textures.exists(key)) scene.textures.remove(key); });
}

function ensureOverheadSignMaps(scene) {
  if (!scene) return false;
  if (!scene.overheadSignSprites) scene.overheadSignSprites = new Map();
  if (!scene.overheadSignFrameSprites) scene.overheadSignFrameSprites = new Map();
  if (!scene.overheadSignFaceSprites) scene.overheadSignFaceSprites = new Map();
  return true;
}

function rebuildOverheadSignSprites(scene) {
  if (!ensureOverheadSignMaps(scene) || !scene.textures || typeof document === 'undefined') return;
  const wanted = new Map(computeOverheadSignPlacements().map((g) => [g.id, g]));
  scene.overheadSignSprites.forEach((entry, id) => {
    if (wanted.has(id)) return;
    destroyOverheadSign(scene, entry);
    scene.overheadSignSprites.delete(id);
    scene.overheadSignFrameSprites.delete(id);
    scene.overheadSignFaceSprites.delete(id);
  });
  wanted.forEach((g) => placeOverheadSign(scene, g));
  scene.overheadSignRefreshPending = false;
}

// Road edits come a tile at a time: one rebuild on the next tick.
function scheduleOverheadSignRefresh(scene) {
  if (!scene || scene.overheadSignRefreshPending) return;
  scene.overheadSignRefreshPending = true;
  setTimeout(() => {
    if (!scene.overheadSignRefreshPending) return;
    if (!scene.sys || !scene.tileSprites) { scene.overheadSignRefreshPending = false; return; }
    rebuildOverheadSignSprites(scene);
  }, 0);
}

// The map turned or moved: each drawn again for the face now seen, and placed.
function refreshAllOverheadSignSprites(scene) {
  scene?.overheadSignSprites?.forEach((entry) => { if (entry.gantry) placeOverheadSign(scene, entry.gantry); });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OVERHEAD_SIGN, OVERHEAD_SIGN_ALL, overheadSignLanes, computeOverheadSignPlacements, overheadDistrictAhead };
}
