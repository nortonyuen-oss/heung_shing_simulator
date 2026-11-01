// 海底隧道 (docs/region-connections-design.md §8): a twin-bore road tunnel across the sea between
// two shores of the map, the way the Cross-Harbour Tunnel joins Kowloon to the island. The player
// drags from one shore to the other; a portal of 2 x 3 tiles (two roads, each into its own bore)
// goes on each shore with its mouths at the water, and the two road tiles in front of each portal's
// open end are its approach, drawn straight on into it (tile-keys.js). Traffic runs through it
// like a road (the portal and the tiles under the sea are road surface for the traffic network and
// the simulation, hidden under the water), and it takes a toll by its traffic.

const UNDERSEA_TUNNEL_COST = 30000;
const UNDERSEA_TUNNEL_COST_PER_SEA_TILE = 150;
const UNDERSEA_TUNNEL_LENGTH = 3;   // tiles along the road, approach to mouths
// Monthly toll of a tunnel at full traffic (trafficMap 1 at its portals)
const UNDERSEA_TUNNEL_TOLL_AT_FULL_TRAFFIC = 2400;
const UNDERSEA_TUNNEL_TEXTURE_PREFIX = 'undersea_tunnel_';
// Asset tiles are 320 x 160 px; the game's are 100 x 50.
const UNDERSEA_TUNNEL_TILE_SCALE = 0.3125;

// One picture per way the tunnel can run off into the view (scripts/prepare-undersea-tunnel-
// *assets.js): which view axis the road runs along and which way it goes underground. Each is
// registered to the same footprint: the ground centre of its top view tile at `anchor`.
// `rows` x `cols` is the footprint in view tiles. The pictures' two carriageways are drawn 0.8-0.92
// of a tile apart, so each is enlarged by `scale` to put them on the two road tiles: `anchor` and
// `scale` are fitted to the yellow lane edges and to where the deck ends at the open end.
// `mouthInset`: how far into the mouth tiles the road runs before the arch face (seen from the
// front) or the mouth box (from behind), in tiles; the game's road shows that far. `roofEdge`
// (seen from behind): where the mouth box's roof ends towards the road, as the along-the-road
// position of the ground right under that edge on screen - everything above it is behind the box.
const UNDERSEA_TUNNEL_VIEWS = Object.freeze({
  '-col': { path: 'Models/underseaTunnel/tunnel_NS_v1.png', anchor: [506.4, 240.8], scale: 1.107, rows: 2, cols: 3, mouthInset: 0.2 },
  '+col': { path: 'Models/underseaTunnel/tunnel_NS_rear_v1.png', anchor: [441.6, 211.0], scale: 1.249, rows: 2, cols: 3, mouthInset: 0.2, roofEdge: 1.58 },
  '-row': { path: 'Models/underseaTunnel/tunnel_EW_v1.png', anchor: [644.8, 240.2], scale: 1.088, rows: 3, cols: 2, mouthInset: 0 },
  '+row': { path: 'Models/underseaTunnel/tunnel_EW_rear_v1.png', anchor: [665.1, 226.0], scale: 1.096, rows: 3, cols: 2, mouthInset: 0.2, roofEdge: 1.18 },
});
const UNDERSEA_TUNNEL_ASSET_HALF_TILE = [160, 80];
// Each portal is drawn in three layers for the traffic to pass between, back to front
const UNDERSEA_TUNNEL_LAYERS = Object.freeze(['back', 'mid', 'front']);

const UNDERSEA_TUNNEL_DIRECTIONS = Object.freeze({
  n: [-1, 0], s: [1, 0], w: [0, -1], e: [0, 1],
});

// Saved tunnels without two portals are the old ones to the map edge: they are dropped.
function getUnderseaTunnels() {
  return Array.isArray(city?.underseaTunnels) ? city.underseaTunnels.filter((t) => Array.isArray(t?.portals)) : [];
}

// Every tile a tunnel stands on or runs under, by row * MAP_WIDTH + col: { tunnel, portal, under,
// axis, oneWay }, `portal` the index of the portal it is part of, `under` true under the sea,
// `oneWay` the way its bore carries traffic. Plus the approach tiles, kept apart since they are
// ordinary road. Rebuilt when the tunnels change.
let underseaTunnelIndexSource = null;
let underseaTunnelIndexKey = '';
let underseaTunnelIndex = { tiles: new Map(), approach: new Map() };

function getUnderseaTunnelIndex() {
  const source = city?.underseaTunnels;
  const key = Array.isArray(source) ? source.map((t) => t?.id).join(',') : '';
  if (source === underseaTunnelIndexSource && key === underseaTunnelIndexKey) return underseaTunnelIndex;
  const tiles = new Map();
  const approach = new Map();
  getUnderseaTunnels().forEach((tunnel) => {
    const oneWay = getUnderseaTunnelBoreDirection(tunnel);
    tunnel.portals.forEach((portal, index) => {
      portal.tiles.forEach(([r, c]) => tiles.set(r * MAP_WIDTH + c, { tunnel, portal: index, under: false, axis: tunnel.axis, oneWay: oneWay(r, c) }));
      portal.approach.forEach(([r, c]) => approach.set(r * MAP_WIDTH + c, { tunnel, portal: index }));
    });
    tunnel.under.forEach(([r, c]) => tiles.set(r * MAP_WIDTH + c, { tunnel, portal: null, under: true, axis: tunnel.axis, oneWay: oneWay(r, c) }));
  });
  underseaTunnelIndexSource = source;
  underseaTunnelIndexKey = key;
  underseaTunnelIndex = { tiles, approach };
  return underseaTunnelIndex;
}

// Each bore is one-way, keep-left like a dual carriageway (getCarriagewayLaneDirection,
// tile-keys.js): running north-south the west bore goes north; running east-west the north bore
// goes east.
function getUnderseaTunnelBoreDirection(tunnel) {
  if (tunnel.axis === 'col') {
    const west = Math.min(...tunnel.under.map(([, c]) => c));
    return (r, c) => (c === west ? 'n' : 's');
  }
  const north = Math.min(...tunnel.under.map(([r]) => r));
  return (r) => (r === north ? 'e' : 'w');
}

function getUnderseaTunnelTile(row, col) {
  if (!city?.underseaTunnels?.length) return null;
  return getUnderseaTunnelIndex().tiles.get(row * MAP_WIDTH + col) ?? null;
}

function findUnderseaTunnelAt(row, col) {
  return getUnderseaTunnelTile(row, col)?.tunnel ?? null;
}

// A portal or the sea above a tunnel: no road, building or bridge goes there.
function isUnderseaTunnelTile(row, col) {
  return Boolean(getUnderseaTunnelTile(row, col));
}

// The tiles traffic drives on through a tunnel: 'row' (along a row, east-west) or 'col', the
// one way its bore goes, and whether it is under the sea, where vehicles are hidden. Null elsewhere.
function getUnderseaTunnelSurface(row, col) {
  const tile = getUnderseaTunnelTile(row, col);
  return tile ? { axis: tile.axis, oneWay: tile.oneWay, hidden: tile.under } : null;
}

// The last tile under the sea before a mouth, in the bore that runs out to the land: traffic can
// start there (traffic-visuals.js), so cars come out of a portal in view as if from across the sea.
function isUnderseaTunnelExitTile(row, col) {
  const tile = getUnderseaTunnelTile(row, col);
  if (!tile?.under) return false;
  const [dr, dc] = UNDERSEA_TUNNEL_DIRECTIONS[tile.oneWay];
  const ahead = getUnderseaTunnelTile(row + dr, col + dc);
  return Boolean(ahead && !ahead.under);
}

// No turning back in front of a portal (traffic-visuals.js): a vehicle out of the tunnel may not
// cross to the other approach tile and go back in. Crossing between the two approach tiles is only
// for reaching the bore going in, from a road that meets the other one, and then into it.
// `previous` -> `current` -> `next` are tiles; true when the move to `next` would turn back.
function isUnderseaTunnelUTurn(previous, current, next) {
  if (!city?.underseaTunnels?.length || !current || !next) return false;
  const entry = getUnderseaTunnelIndex().approach.get(current.row * MAP_WIDTH + current.col);
  if (!entry) return false;
  const portal = entry.tunnel.portals[entry.portal];
  const same = (tile, [r, c]) => tile && tile.row === r && tile.col === c;
  const index = portal.approach.findIndex((tile) => same(current, tile));
  const sibling = portal.approach[1 - index];
  const onPortal = (tile) => tile && portal.tiles.some((t) => same(tile, t));
  if (same(next, sibling)) {
    // only from the lane coming out towards the lane going in, and not straight out of the tunnel
    const [or, oc] = portal.open[index];
    const goingIn = getUnderseaTunnelTile(or, oc)?.oneWay === portal.dir;
    return goingIn || onPortal(previous);
  }
  return same(previous, sibling) && !onPortal(next);
}

// A road tile in front of a portal's open end runs straight into it: the direction it heads in
// ('n', 'e', 's', 'w') or null. tile-keys.js draws it straight on.
function getUnderseaTunnelApproachSide(row, col) {
  if (!city?.underseaTunnels?.length) return null;
  const entry = getUnderseaTunnelIndex().approach.get(row * MAP_WIDTH + col);
  return entry ? entry.tunnel.portals[entry.portal].dir : null;
}

// The portal's ground is drawn as the game's own straight road (tile-keys.js), so the lanes run on
// from the approach without a seam; the picture keeps only its walls and mouths over it. The
// direction the road heads in, or null.
function getUnderseaTunnelRoadSide(row, col) {
  const tile = getUnderseaTunnelTile(row, col);
  return tile && !tile.under ? tile.tunnel.portals[tile.portal].dir : null;
}

// One portal: its mouths on `mouth` (two tiles side by side, the sea beyond them in direction
// `dir`), running back three tiles inland to its open end and the approach in front of that.
function getUnderseaTunnelPortal(mouth, dir) {
  const [dr, dc] = UNDERSEA_TUNNEL_DIRECTIONS[dir];
  const tiles = [];
  for (let k = 0; k < UNDERSEA_TUNNEL_LENGTH; k++) mouth.forEach(([r, c]) => tiles.push([r - dr * k, c - dc * k]));
  return {
    dir,
    tiles,
    mouth,
    open: mouth.map(([r, c]) => [r - dr * (UNDERSEA_TUNNEL_LENGTH - 1), c - dc * (UNDERSEA_TUNNEL_LENGTH - 1)]),
    approach: mouth.map(([r, c]) => [r - dr * UNDERSEA_TUNNEL_LENGTH, c - dc * UNDERSEA_TUNNEL_LENGTH]),
  };
}

// The tunnel a drag from `start` to `end` would build: across the stretch of sea the drag line
// crosses (followed on past either end of the drag to the shores), a portal on each shore and the
// second bore beside the line on whichever side fits. Returns { site } or { reason } (an i18n key).
function getUnderseaTunnelCrossing(start, end) {
  if (!start || !end || (start.row === end.row && start.col === end.col)) return { reason: 'tunnel.why.drag' };
  const { axis, path } = getStraightDragPath(start, end);
  const step = axis === 'row'
    ? [0, Math.sign(end.col - start.col) || 1]
    : [Math.sign(end.row - start.row) || 1, 0];
  const [sr, sc] = step;
  const isSea = (r, c) => isInsideMap(r, c) && mapData[r][c] === WATER && !isBridgeTile(r, c) && !isUnderseaTunnelTile(r, c);
  const isLand = (r, c) => isInsideMap(r, c) && [GROUND, DIRT, BEACH, ROAD].includes(mapData[r][c])
    && !isBridgeTile(r, c) && !buildingData[getTileId(r, c)] && !isUnderseaTunnelTile(r, c)
    && !(typeof isPromenadeTile === 'function' && isPromenadeTile(r, c))
    && getTileHeight(r, c) === 0 && !isSlopeTile(r, c);

  // The first stretch of water on the drag line, and the shore tiles either side of it
  const first = path.findIndex(({ row, col }) => isInsideMap(row, col) && mapData[row][col] === WATER);
  if (first < 0) return { reason: 'tunnel.why.sea' };
  let [fromRow, fromCol] = [path[first].row, path[first].col];
  while (isInsideMap(fromRow - sr, fromCol - sc) && mapData[fromRow - sr][fromCol - sc] === WATER) { fromRow -= sr; fromCol -= sc; }
  let [toRow, toCol] = [fromRow, fromCol];
  while (isInsideMap(toRow + sr, toCol + sc) && mapData[toRow + sr][toCol + sc] === WATER) { toRow += sr; toCol += sc; }
  const crossing = Math.abs(toRow - fromRow) + Math.abs(toCol - fromCol) + 1;
  if (!isInsideMap(fromRow - sr, fromCol - sc) || !isInsideMap(toRow + sr, toCol + sc)) return { reason: 'tunnel.why.otherShore' };

  const dirOf = (dr, dc) => Object.keys(UNDERSEA_TUNNEL_DIRECTIONS).find((d) => UNDERSEA_TUNNEL_DIRECTIONS[d][0] === dr && UNDERSEA_TUNNEL_DIRECTIONS[d][1] === dc);
  let reason = 'tunnel.why.shore';
  const sides = axis === 'row' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
  for (const [pr, pc] of sides) {
    const lanes = (r, c) => [[r, c], [r + pr, c + pc]];
    const under = [];
    for (let k = 0; k < crossing; k++) under.push(...lanes(fromRow + sr * k, fromCol + sc * k));
    if (!under.every(([r, c]) => isSea(r, c))) {
      reason = 'tunnel.why.island';
      continue;
    }
    const portals = [
      getUnderseaTunnelPortal(lanes(fromRow - sr, fromCol - sc), dirOf(sr, sc)),
      getUnderseaTunnelPortal(lanes(toRow + sr, toCol + sc), dirOf(-sr, -sc)),
    ];
    if (!portals.every((portal) => portal.tiles.every(([r, c]) => isLand(r, c)))) continue;
    if (!portals.every((portal) => portal.approach.every(([r, c]) => isInsideMap(r, c)))) continue;
    return {
      site: {
        axis,
        portals,
        under,
        crossing,
        cost: UNDERSEA_TUNNEL_COST + crossing * UNDERSEA_TUNNEL_COST_PER_SEA_TILE,
      },
    };
  }
  return { reason };
}

function getUnderseaTunnelPortalTiles(tunnel) {
  return tunnel.portals.flatMap((portal) => portal.tiles);
}

function placeUnderseaTunnel(scene, start, end) {
  const { site, reason } = getUnderseaTunnelCrossing(start, end);
  if (!site) {
    showToast(t(reason), 'warning');
    return false;
  }
  if (!spendBudget(site.cost)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }
  const portalTiles = site.portals.flatMap((portal) => portal.tiles);
  portalTiles.forEach(([r, c]) => {
    removeTree(scene, r, c);
    removeDebris(scene, r, c);
    removeZoneOverlay(scene, r, c);
    if (mapData[r][c] === ROAD) {
      mapData[r][c] = GROUND;
      roadTileCount = Math.max(0, roadTileCount - 1);
    }
  });
  if (!Array.isArray(city.underseaTunnels)) city.underseaTunnels = [];
  const tunnel = { id: `tunnel-${Date.now().toString(36)}`, ...site };
  delete tunnel.cost;
  city.underseaTunnels = [...getUnderseaTunnels(), tunnel];
  // The approach roads come with it, where a road can go
  const approach = site.portals.flatMap((portal) => portal.approach);
  approach.forEach(([r, c]) => {
    if (mapData[r][c] !== ROAD && mapData[r][c] !== WATER && canPlaceRoad(scene, r, c)) setTileType(scene, r, c, ROAD);
  });
  if (typeof markTrafficNetworkDirty === 'function') markTrafficNetworkDirty();
  [...portalTiles, ...approach].forEach(([r, c]) => refreshTileArea(scene, r, c));
  drawUnderseaTunnel(scene, tunnel);
  showToast(t('tunnel.built', { cost: site.cost.toLocaleString() }), 'success');
  if (typeof updateHUD === 'function') updateHUD();
  return true;
}

// The bulldozer on either portal takes the whole tunnel; the approach roads stay.
function demolishUnderseaTunnelAt(scene, row, col) {
  const tile = getUnderseaTunnelTile(row, col);
  if (!tile || tile.under) return false;
  const { tunnel } = tile;
  city.underseaTunnels = getUnderseaTunnels().filter((t) => t !== tunnel);
  tunnel.portals.forEach((_, index) => {
    destroyUnderseaTunnelSprites(scene.underseaTunnelSprites?.get(`${tunnel.id}:${index}`));
    scene.underseaTunnelSprites?.delete(`${tunnel.id}:${index}`);
  });
  if (typeof markTrafficNetworkDirty === 'function') markTrafficNetworkDirty();
  [...getUnderseaTunnelPortalTiles(tunnel), ...tunnel.portals.flatMap((portal) => portal.approach)]
    .forEach(([r, c]) => refreshTileArea(scene, r, c));
  showToast(t('tunnel.demolished'), 'info');
  return true;
}

// A vehicle on a portal is drawn between the portal's layers (placeUnderseaTunnelSprites): the far
// lane above the back wall and under the median, the near lane above the median and under the
// front wall. Seen from the front, a vehicle past the arch face goes under the back layer too,
// inside the arch. The depth to draw it at, or null off the portals.
function getUnderseaTunnelVehicleDepth(vehicle) {
  if (!city?.underseaTunnels?.length) return null;
  const scene = vehicle?.scene ?? (typeof activeScene === 'undefined' ? null : activeScene);
  if (!scene) return null;
  let entry = null;
  let mouthIsNext = null;
  [vehicle?.current, vehicle?.next].forEach((tile, index) => {
    const found = tile ? getUnderseaTunnelTile(tile.row, tile.col) : null;
    if (!found || found.under) return;
    entry = found;
    const portal = found.tunnel.portals[found.portal];
    if (portal.mouth.some(([r, c]) => r === tile.row && c === tile.col)) mouthIsNext = index === 1;
  });
  if (!entry) return null;
  const portal = entry.tunnel.portals[entry.portal];
  const { depth } = getUnderseaTunnelPortalPlacement(scene, portal);
  const back = depth - UNDERSEA_TUNNEL_LAYERS.length;
  const viewKey = getUnderseaTunnelViewKey(portal.dir);
  if (mouthIsNext !== null && viewKey.startsWith('-')) {
    // a leg runs tile centre to tile centre: the mouth tiles' edge is half way, the arch face
    // `mouthInset` beyond it
    const progress = Number(vehicle.renderedProgress ?? vehicle.progress) || 0;
    const inset = UNDERSEA_TUNNEL_VIEWS[viewKey].mouthInset;
    if (mouthIsNext ? progress > 0.5 + inset : progress < 0.5 - inset) return back - 0.5;
  }
  // the far lane is the one further up the screen
  const tile = [vehicle.current, vehicle.next].find((t) => t && getUnderseaTunnelTile(t.row, t.col) && !getUnderseaTunnelTile(t.row, t.col).under);
  const across = entry.tunnel.axis === 'col' ? ([, c]) => c : ([r]) => r;
  const lanes = portal.mouth.map(([r, c]) => ({ at: across([r, c]), y: isoToScreen(c, r).y }));
  const far = lanes[0].y < lanes[1].y ? lanes[0].at : lanes[1].at;
  return across([tile.row, tile.col]) === far ? back + 0.5 : back + 1.5;
}

// Monthly toll of all the tunnels: by the traffic at their portals.
function getUnderseaTunnelToll() {
  if (!Array.isArray(trafficMap)) return 0;
  return Math.round(getUnderseaTunnels().reduce((sum, tunnel) => {
    const load = Math.max(0, ...getUnderseaTunnelPortalTiles(tunnel).map(([r, c]) => Number(trafficMap[r]?.[c]) || 0));
    return sum + Math.min(1, load) * UNDERSEA_TUNNEL_TOLL_AT_FULL_TRAFFIC;
  }, 0));
}

// ── Drawing ───────────────────────────────────────────────────────────────

// The tunnel's direction as the camera sees it: '-col' / '+col' / '-row' / '+row'.
function getUnderseaTunnelViewKey(dir) {
  const [dr, dc] = UNDERSEA_TUNNEL_DIRECTIONS[dir];
  const view = {
    0: [dr, dc],
    1: [dc, -dr],
    2: [-dr, -dc],
    3: [-dc, dr],
  }[((mapRotation % 4) + 4) % 4];
  const [vr, vc] = view;
  if (vc) return vc < 0 ? '-col' : '+col';
  return vr < 0 ? '-row' : '+row';
}

function getUnderseaTunnelTextureKey(path) {
  return `${UNDERSEA_TUNNEL_TEXTURE_PREFIX}${path.split('/').pop().replace(/\.png$/, '')}`;
}

function loadUnderseaTunnelTextures(scene) {
  const paths = Object.values(UNDERSEA_TUNNEL_VIEWS).map((view) => view.path);
  const missing = paths.filter((p) => !scene.textures.exists(getUnderseaTunnelTextureKey(p)));
  if (!missing.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = () => {
      missing.forEach((p) => scene.load.image(getUnderseaTunnelTextureKey(p), typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(p) : p));
      scene.load.once('complete', () => resolve(true));
      scene.load.start();
    };
    if (scene.load.isLoading()) scene.load.once('complete', start); else start();
  });
}

// The pictures stand on a 15 px slab of earth (48 px in the asset) below their ground outline,
// like a lone terrain tile. Drawn over the ground in front, the slab would lift the portal a step
// above the road it meets, so it is cut away: everything below the footprint's front ground
// edges (left corner to bottom corner to right corner) is cleared, once per picture. So is the
// asphalt between the walls in front of the mouths, where the game's road tiles show through.
function getUnderseaTunnelLayerTextures(scene, viewKey) {
  const view = UNDERSEA_TUNNEL_VIEWS[viewKey];
  const key = getUnderseaTunnelTextureKey(view.path);
  if (!scene.underseaTunnelLayerTextures) scene.underseaTunnelLayerTextures = new Map();
  const cached = scene.underseaTunnelLayerTextures.get(viewKey);
  if (cached && UNDERSEA_TUNNEL_LAYERS.every((layer) => scene.textures.exists(cached[layer].key))) return cached;
  if (!scene.textures.exists(key)) return null;
  const image = scene.textures.get(key).getSourceImage();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const [ax, ay] = view.anchor;
  const [hx, hy] = UNDERSEA_TUNNEL_ASSET_HALF_TILE.map((half) => half / view.scale);
  const mapping = getModelTexturePixelMapping(view.path, image);
  const at = ([x, y]) => [x * mapping.resize + mapping.offsetX, y * mapping.resize + mapping.offsetY + 1];

  // Within 0.38 of a tile of each lane's middle: the asphalt and its shadows, the yellow edge
  // lines, and the white dashes with their grey fringes (anything light with asphalt just above
  // and just below it). The walls and the mouth boxes are lighter grey and stay; so do the wall
  // tops, which have a wall face below them, not asphalt. At the open end the deck's edge and
  // joint go whatever their colour, so the approach road runs straight on. So does the strip of
  // road in the mouth tiles up to the arch face or the mouth box (`mouthInset`); the road inside
  // the dark arches stays.
  const alongCol = viewKey.endsWith('col');
  const length = alongCol ? view.cols : view.rows;
  const mouthAt = viewKey.startsWith('-') ? 0 : length - 1;
  const openEdge = mouthAt === 0 ? length - 0.5 : -0.5;
  const { width, height } = canvas;
  // The front ground edges the slab is cut along: the open end exactly, so the deck meets the
  // road flush; out past the footprint on the mouth side and the lane side, where the enlarged
  // picture overhangs (the mouth box stands out over the water).
  const rowEdge = view.rows - 0.5 + (alongCol ? 0.05 : (mouthAt === 0 ? 0 : 0.6));
  const colEdge = view.cols - 0.5 + (alongCol ? (mouthAt === 0 ? 0 : 0.6) : 0.05);
  // What is left of the slab past those edges and round the sides: its earth and grass strip
  const isSlab = (p, r, c) => {
    if (r > -0.5 && c > -0.5 && r < view.rows - 0.8 && c < view.cols - 0.8) return false;
    const red = data[p * 4], green = data[p * 4 + 1], blue = data[p * 4 + 2];
    const earth = red > 100 && green > 50 && green < 170 && red - blue > 45;
    const grass = green > 95 && blue < 60 && Math.abs(red - green) < 35;
    return earth || grass;
  };
  const openEnd = new Uint8Array(width * height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;
  const onRoad = new Uint8Array(width * height);
  const asphalt = new Uint8Array(width * height);
  for (let py = 0; py < height; py++) {
    const v = ((py - mapping.offsetY) / mapping.resize - ay) / hy;
    for (let px = 0; px < width; px++) {
      const p = py * width + px;
      if (!data[p * 4 + 3]) continue;
      const u = ((px - mapping.offsetX) / mapping.resize - ax) / hx;
      const r = (v - u) / 2;
      const c = (v + u) / 2;
      const [lateral, along] = alongCol ? [r, c] : [c, r];
      if (isSlab(p, r, c)) {
        data[p * 4 + 3] = 0;
        continue;
      }
      if (data[p * 4 + 3] < 200) continue;
      const lane = Math.round(lateral);
      const tile = Math.round(along);
      if (lane < 0 || lane > 1 || Math.abs(lateral - lane) > 0.38) continue;
      if (Math.abs(along - openEdge) < 0.15 && Math.abs(lateral - lane) < 0.3) openEnd[p] = 1;
      else if (tile < 0 || tile >= length || (tile === mouthAt && (mouthAt === 0
        ? along < 0.5 - view.mouthInset
        : along > length - 1.5 + view.mouthInset))) continue;
      onRoad[p] = 1;
      const high = Math.max(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
      if (high < 82 && high - Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) < 18) asphalt[p] = 1;
    }
  }
  const reach = Math.max(2, Math.round(7 * mapping.resize));
  const asphaltWithin = (p, step) => {
    for (let k = 1; k <= reach; k++) {
      const q = p + step * k * width;
      if (q < 0 || q >= asphalt.length) return false;
      if (asphalt[q]) return true;
    }
    return false;
  };
  for (let p = 0; p < onRoad.length; p++) {
    if (!onRoad[p]) continue;
    const red = data[p * 4], green = data[p * 4 + 1], blue = data[p * 4 + 2];
    const yellow = red > 90 && red - blue > 40;
    const line = Math.max(red, green, blue) - Math.min(red, green, blue) < 25 && asphaltWithin(p, -1) && asphaltWithin(p, 1);
    if (openEnd[p] || asphalt[p] || yellow || line) data[p * 4 + 3] = 0;
  }
  ctx.putImageData(pixels, 0, 0);

  const ground = (r, c) => at([ax + hx * (c - r), ay + hy * (c + r)]);
  const left = ground(rowEdge, -0.5);
  const bottom = ground(rowEdge, colEdge);
  const right = ground(-0.5, colEdge);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(0, left[1] + left[0] * 0.5);
  ctx.lineTo(...left);
  ctx.lineTo(...bottom);
  ctx.lineTo(...right);
  ctx.lineTo(canvas.width, right[1] + (canvas.width - right[0]) * 0.5);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  // Split into the three layers the traffic drives between (getUnderseaTunnelVehicleDepth): by
  // where on the ground each piece stands across the road, the wall beyond the far lane
  // (lateral < 0), the median between the lanes, and the wall beside the near lane (lateral > 1).
  // Bigger lateral is nearer the camera in every view. The mouth box is behind the traffic seen
  // from the front and in front of it seen from behind. Seen from behind, the box is everything
  // from its roof's back edge down (`roofEdge`), roof and all, though the roof hangs over the
  // road; above that a pixel stands where the solid run it is part of in its column ends below
  // it - the foot of its wall (the road between them is already clear) - or right under itself
  // where that run goes on down into the box. Seen from the front the box is at the back, where
  // the walls run up into it, so there each pixel stands right under itself.
  const cut = ctx.getImageData(0, 0, width, height).data;
  const boxLayer = mouthAt === 0 ? 0 : 2;
  const layerPixels = UNDERSEA_TUNNEL_LAYERS.map(() => new ImageData(width, height));
  const bounds = UNDERSEA_TUNNEL_LAYERS.map(() => [width, height, -1, -1]);
  const footY = new Int32Array(width * height);
  for (let px = 0; px < width; px++) {
    let foot = -1;
    for (let py = height - 1; py >= 0; py--) {
      const i = py * width + px;
      if (!cut[i * 4 + 3]) { foot = -1; continue; }
      if (foot < 0) foot = py;
      footY[i] = foot;
    }
  }
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      if (!cut[i + 3]) continue;
      const u = ((px - mapping.offsetX) / mapping.resize - ax) / hx;
      const groundAt = (groundY) => {
        const v = ((groundY - mapping.offsetY) / mapping.resize - ay) / hy;
        return alongCol ? [(v - u) / 2, (v + u) / 2] : [(v + u) / 2, (v - u) / 2];
      };
      let [lateral, along] = groundAt(py);
      let inMouth;
      if (mouthAt === 0) {
        inMouth = along < 0.5;
      } else {
        inMouth = along >= view.roofEdge;
        const [footLateral, footAlong] = groundAt(footY[py * width + px]);
        if (!inMouth && footAlong <= length - 1.5) lateral = footLateral;
      }
      const layer = inMouth ? boxLayer : lateral < 0 ? 0 : lateral > 1 ? 2 : 1;
      layerPixels[layer].data.set(cut.subarray(i, i + 4), i);
      const box = bounds[layer];
      box[0] = Math.min(box[0], px); box[1] = Math.min(box[1], py);
      box[2] = Math.max(box[2], px); box[3] = Math.max(box[3], py);
    }
  }
  const [anchorX, anchorY] = [ax * mapping.resize + mapping.offsetX, ay * mapping.resize + mapping.offsetY];
  const layers = {};
  UNDERSEA_TUNNEL_LAYERS.forEach((layer, index) => {
    const [minX, minY, maxX, maxY] = maxXOrEmpty(bounds[index]);
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = maxX - minX + 1;
    layerCanvas.height = maxY - minY + 1;
    layerCanvas.getContext('2d').putImageData(layerPixels[index], -minX, -minY, minX, minY, layerCanvas.width, layerCanvas.height);
    const layerKey = `${key}__${layer}`;
    if (scene.textures.exists(layerKey)) scene.textures.remove(layerKey);
    // drawn first, then added: a canvas texture made empty and refreshed keeps empty mipmaps
    scene.textures.addCanvas(layerKey, layerCanvas);
    layers[layer] = {
      key: layerKey,
      originX: (anchorX - minX) / layerCanvas.width,
      originY: (anchorY - minY) / layerCanvas.height,
      scale: UNDERSEA_TUNNEL_TILE_SCALE * view.scale / mapping.resize,
    };
  });
  scene.underseaTunnelLayerTextures.set(viewKey, layers);
  return layers;
}

// A layer with no pixels still gets a 1 x 1 texture.
function maxXOrEmpty([minX, minY, maxX, maxY]) {
  return maxX < 0 ? [0, 0, 0, 0] : [minX, minY, maxX, maxY];
}

// Where a portal's picture is drawn: the ground centre of its top tile on screen, and its depth,
// that of its front tile on screen; its three layers sit just under that.
function getUnderseaTunnelPortalPlacement(scene, portal) {
  const screen = portal.tiles.map(([r, c]) => ({ r, c, pos: isoToScreen(c, r) }));
  const top = screen.reduce((a, b) => (b.pos.y < a.pos.y ? b : a));
  const front = screen.reduce((a, b) => (b.pos.y > a.pos.y ? b : a));
  const face = getTileFaceGeometry(top.r, top.c, scene.offsetX, scene.offsetY);
  return { x: face.center.x, y: face.center.y, depth: getObjectTileDepth(front.r, front.c, front.pos.y + 1) };
}

function placeUnderseaTunnelSprites(scene, portal, sprites) {
  const layers = getUnderseaTunnelLayerTextures(scene, getUnderseaTunnelViewKey(portal.dir));
  if (!layers) return;
  const place = getUnderseaTunnelPortalPlacement(scene, portal);
  UNDERSEA_TUNNEL_LAYERS.forEach((layer, index) => {
    const sprite = sprites[layer];
    const texture = layers[layer];
    if (sprite.texture.key !== texture.key) sprite.setTexture(texture.key);
    sprite.setOrigin(texture.originX, texture.originY);
    sprite.setScale(texture.scale);
    sprite.setPosition(place.x, place.y);
    sprite.setDepth(place.depth - UNDERSEA_TUNNEL_LAYERS.length + index);
  });
}

// Three sprites per portal (back, median, front), keyed `${tunnel.id}:${portal index}`.
function drawUnderseaTunnel(scene, tunnel) {
  if (!scene?.add) return;
  if (!scene.underseaTunnelSprites) scene.underseaTunnelSprites = new Map();
  tunnel.portals.forEach((portal, index) => {
    const key = `${tunnel.id}:${index}`;
    destroyUnderseaTunnelSprites(scene.underseaTunnelSprites.get(key));
    const sprites = {};
    UNDERSEA_TUNNEL_LAYERS.forEach((layer) => {
      sprites[layer] = scene.add.image(0, 0, '__DEFAULT');
      addToRenderLayer(scene, sprites[layer], 'objectLayer');
      sprites[layer].setMask(scene.worldMask);
    });
    scene.underseaTunnelSprites.set(key, sprites);
    loadUnderseaTunnelTextures(scene).then(() => {
      if (scene.underseaTunnelSprites?.get(key) === sprites) placeUnderseaTunnelSprites(scene, portal, sprites);
    });
  });
}

function destroyUnderseaTunnelSprites(sprites) {
  if (sprites) Object.values(sprites).forEach((sprite) => sprite.destroy());
}

function rebuildUnderseaTunnelSprites(scene) {
  if (!scene) return;
  scene.underseaTunnelSprites?.forEach(destroyUnderseaTunnelSprites);
  scene.underseaTunnelSprites = new Map();
  getUnderseaTunnels().forEach((tunnel) => drawUnderseaTunnel(scene, tunnel));
}

function repositionUnderseaTunnelSprites(scene) {
  getUnderseaTunnels().forEach((tunnel) => {
    tunnel.portals.forEach((portal, index) => {
      const sprites = scene?.underseaTunnelSprites?.get(`${tunnel.id}:${index}`);
      if (sprites) placeUnderseaTunnelSprites(scene, portal, sprites);
    });
  });
}
