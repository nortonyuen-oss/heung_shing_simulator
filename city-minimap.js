// City minimap (bottom right): the whole map drawn the way the camera sees it - the isometric
// diamond, turned with the view - with the camera's view outlined. Press or drag on it to move
// the camera there. The map-editor mode keeps its own top-down terrain map (overlay-controls.js).

const CITY_MINIMAP_REDRAW_MS = 2000;
const CITY_MINIMAP_COLLAPSED_KEY = 'cityMinimapCollapsed';
const CITY_MINIMAP_POSITION_KEY = 'cityMinimapPosition';

let cityMinimapLastDrawAt = 0;
let cityMinimapLastRotation = null;
let cityMinimapLastView = '';
let cityMinimapDragging = false;

// The canvas is a fixed 512x256 (UI/index.html) - exactly 2x a normal 256x256 map's diamond, one
// pixel per tile. 香港全境's explored area can grow far past that, so every function below works
// against a "grid" - rowStart/colStart (the explored area's own origin, getCityMinimapGrid),
// step (how many real tiles one grid cell covers; 1 for a normal map) and gridWidth/gridHeight
// (the grid's own size, always <=256 on both axes) - instead of the live MAP_WIDTH/MAP_HEIGHT
// directly. A normal map's grid is exactly { rowStart:0, colStart:0, step:1, gridWidth:MAP_WIDTH,
// gridHeight:MAP_HEIGHT }, so every formula below reduces to exactly what it was before.
function getCityMinimapGrid() {
  if (typeof isLazyWorldMap === 'function' && isLazyWorldMap()) {
    if (typeof getActiveSweepBounds !== 'function') return null;
    const bounds = getActiveSweepBounds();
    if (!bounds.rowCount || !bounds.colCount) return null; // nothing generated yet
    // Downsample so the grid never exceeds a normal map's own 256-tile budget on either axis -
    // the minimap's per-redraw cost stays the same regardless of how much territory is explored,
    // instead of growing without bound as the player wanders further (Norton: "唔好load全圖").
    const step = Math.max(1, Math.ceil(Math.max(bounds.rowCount, bounds.colCount) / 256));
    return {
      rowStart: bounds.rowStart,
      colStart: bounds.colStart,
      step,
      gridWidth: Math.ceil(bounds.colCount / step),
      gridHeight: Math.ceil(bounds.rowCount / step),
    };
  }
  return { rowStart: 0, colStart: 0, step: 1, gridWidth: MAP_WIDTH, gridHeight: MAP_HEIGHT };
}

// One canvas pixel per grid cell: a tile at grid column c and grid row r lands on
// x = c - r + gridWidth, y = floor((c + r) / 2). Tiles whose c + r is even fill the even x
// of a canvas row and the odd ones the odd x, so the diamond has no gaps.
function getCityMinimapViewCoords(gridRow, gridCol, grid) {
  if (mapRotation === 1) return { c: grid.gridHeight - 1 - gridRow, r: gridCol };
  if (mapRotation === 2) return { c: grid.gridWidth - 1 - gridCol, r: grid.gridHeight - 1 - gridRow };
  if (mapRotation === 3) return { c: gridRow, r: grid.gridWidth - 1 - gridCol };
  return { c: gridCol, r: gridRow };
}

// Inverts getCityMinimapViewCoords: a diamond (c, r) back to the grid (row, col) that painted it.
function invertCityMinimapViewCoords(c, r, grid) {
  if (mapRotation === 1) return { gridRow: grid.gridHeight - 1 - c, gridCol: r };
  if (mapRotation === 2) return { gridRow: grid.gridHeight - 1 - r, gridCol: grid.gridWidth - 1 - c };
  if (mapRotation === 3) return { gridRow: c, gridCol: grid.gridWidth - 1 - r };
  return { gridRow: r, gridCol: c };
}

function cityMinimapTileColor(row, col) {
  const tile = mapData[row]?.[col];
  if (tile === WATER) return [74, 112, 140];
  if (tile === ROAD) return [70, 72, 76];
  const zone = zoneMap[row]?.[col];
  if (zone === ZONE_RES) return [104, 170, 96];
  if (zone === ZONE_COM) return [92, 136, 196];
  if (zone === ZONE_IND) return [204, 168, 72];
  if (tile === BEACH) return [214, 201, 160];
  if (tile === DIRT) return [150, 128, 96];
  const rise = Math.min(1, Math.max(0, heightMap[row]?.[col] ?? 0) / MAX_TERRAIN_HEIGHT);
  return [118 + 34 * rise, 148 - 4 * rise, 98 + 22 * rise];
}

function drawCityMinimap() {
  const canvas = document.getElementById('city-minimap-canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx || !mapData?.length) return;
  const grid = getCityMinimapGrid();
  if (!grid) {
    // 香港全境: no chunk generated yet - nothing real to show.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const width = canvas.width;
  const image = ctx.createImageData(width, canvas.height);
  const data = image.data;
  // Takes a real (row, col) - converts to the grid cell it falls in (step-scaled, clipped to the
  // grid's own bounds) so every caller below keeps iterating real tile/building positions.
  const paint = (row, col, rgb) => {
    const gridRow = Math.floor((row - grid.rowStart) / grid.step);
    const gridCol = Math.floor((col - grid.colStart) / grid.step);
    if (gridRow < 0 || gridRow >= grid.gridHeight || gridCol < 0 || gridCol >= grid.gridWidth) return;
    const { c, r } = getCityMinimapViewCoords(gridRow, gridCol, grid);
    const idx = (((c + r) >> 1) * width + (c - r + grid.gridWidth)) * 4;
    data[idx] = rgb[0];
    data[idx + 1] = rgb[1];
    data[idx + 2] = rgb[2];
    data[idx + 3] = 255;
  };

  for (let gridRow = 0; gridRow < grid.gridHeight; gridRow++) {
    for (let gridCol = 0; gridCol < grid.gridWidth; gridCol++) {
      const row = grid.rowStart + gridRow * grid.step;
      const col = grid.colStart + gridCol * grid.step;
      paint(row, col, cityMinimapTileColor(row, col));
    }
  }
  // Buildings that are not zone growth (civic, landmarks, utilities) stand out in pale stone.
  Object.entries(buildingData).forEach(([id, record]) => {
    if (['residential', 'commercial', 'industrial'].includes(record?.type)) return;
    const [row, col] = id.split(':').map(Number);
    const rows = Math.max(1, Number(record.footprintRows) || 1);
    const cols = Math.max(1, Number(record.footprintCols) || 1);
    for (let dr = 0; dr < rows; dr++) {
      for (let dc = 0; dc < cols; dc++) {
        if (isInsideMap(row + dr, col + dc)) paint(row + dr, col + dc, [214, 208, 194]);
      }
    }
  });

  // 地鐵路軌 laid (metro-surface.js) in a dull rail tone - not the tunnels, under the ground
  const metro = typeof getTransportExpansionState === 'function' ? getTransportExpansionState()?.metro : null;
  if (metro?.tracks) {
    const elev = metro.trackElev || {};
    Object.keys(metro.tracks).forEach((key) => {
      const code = elev[key];
      if (code === 'u' || (code && code[0] === 't')) return;
      const [row, col] = key.split(':').map(Number);
      if (isInsideMap(row, col)) paint(row, col, [132, 118, 110]);
    });
  }

  ctx.putImageData(image, 0, 0);
  drawCityMinimapMetroLines(ctx, metro, grid);
  cityMinimapLastDrawAt = performance.now();
  cityMinimapLastRotation = mapRotation;
}

// The 地鐵 lines over the map, quietly (Norton, 2026-11-07: 簡單就好，不需要強調): each a thin line in
// its colour, part see-through - a surface line along its track, an underground one station to
// station - and its stations a pale dot. A point (col, row) with a tile's middle at +0.5.
function cityMinimapPointAt(col, row, grid) {
  const gridRow = (row - 0.5 - grid.rowStart) / grid.step;
  const gridCol = (col - 0.5 - grid.colStart) / grid.step;
  const { c, r } = getCityMinimapViewCoords(gridRow, gridCol, grid);
  return { x: c - r + grid.gridWidth + 0.5, y: (c + r) / 2 + 0.5 };
}

function drawCityMinimapMetroLines(ctx, metro, grid) {
  if (!metro?.lines?.length || typeof getMetroLineStations !== 'function') return;
  ctx.save();
  // (the canvas is shown at about half size: 1.5 px reads as a fine line, not a bold one)
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  metro.lines.forEach((line) => {
    const stations = getMetroLineStations(line);
    if (stations.length < 2) return;
    const geom = line.surface && typeof getSurfaceLineGeometry === 'function' ? getSurfaceLineGeometry(line) : null;
    const pts = geom?.verts?.length
      ? geom.verts.map((v) => cityMinimapPointAt(v.x, v.y, grid))
      : stations.map((s) => cityMinimapPointAt(s.col + 0.5, s.row + 0.5, grid));
    ctx.globalAlpha = line.status === 'suspended' ? 0.3 : 0.65;
    ctx.strokeStyle = line.color || '#c0392b';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  });
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#f2efe6';
  (metro.stations || []).forEach((s) => {
    const p = cityMinimapPointAt(s.col + 0.5, s.row + 0.5, grid);
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
  });
  ctx.restore();
}

// World position <-> minimap fraction, in the same grid the background paint above uses (so the
// camera-position overlay and click-to-navigate line up with whatever's actually drawn - the
// full map for a normal city, just the explored, downsampled area for 香港全境).
// screenToIso (main.js) inverts isoToScreen's rotation and projection back to the plain
// (col, row) a world position corresponds to; getCityMinimapViewCoords re-applies the same
// rotation the paint above uses, pivoted on the grid instead of the live MAP_WIDTH/MAP_HEIGHT.
function cityMinimapWorldToFraction(scene, worldX, worldY) {
  const grid = getCityMinimapGrid();
  if (!grid) return { x: 0.5, y: 0.5 }; // nothing generated yet - no frame to place meaningfully
  const iso = screenToIso(worldX - scene.offsetX, worldY - scene.offsetY);
  const gridRow = (iso.y - grid.rowStart) / grid.step;
  const gridCol = (iso.x - grid.colStart) / grid.step;
  const { c, r } = getCityMinimapViewCoords(gridRow, gridCol, grid);
  return {
    x: (c - r + grid.gridWidth) / (grid.gridWidth * 2),
    y: ((c + r) / 2) / grid.gridHeight,
  };
}

function cityMinimapFractionToWorld(scene, fx, fy) {
  const grid = getCityMinimapGrid();
  if (!grid) return { x: scene.offsetX, y: scene.offsetY };
  const cMinusR = fx * grid.gridWidth * 2 - grid.gridWidth;
  const cPlusR = fy * grid.gridHeight * 2;
  const c = (cMinusR + cPlusR) / 2;
  const r = (cPlusR - cMinusR) / 2;
  const { gridRow, gridCol } = invertCityMinimapViewCoords(c, r, grid);
  const row = grid.rowStart + gridRow * grid.step;
  const col = grid.colStart + gridCol * grid.step;
  const pos = isoToScreen(col, row);
  return { x: pos.x + scene.offsetX, y: pos.y + scene.offsetY };
}

function updateCityMinimapView() {
  const frame = document.getElementById('city-minimap-view');
  const camera = activeScene?.cameras?.main;
  if (!frame || !camera) return;
  const view = camera.worldView;
  const key = `${view.x | 0}:${view.y | 0}:${view.width | 0}:${view.height | 0}`;
  if (key === cityMinimapLastView) return;
  cityMinimapLastView = key;
  const topLeft = cityMinimapWorldToFraction(activeScene, view.x, view.y);
  const bottomRight = cityMinimapWorldToFraction(activeScene, view.right, view.bottom);
  frame.style.left = `${topLeft.x * 100}%`;
  frame.style.top = `${topLeft.y * 100}%`;
  frame.style.width = `${(bottomRight.x - topLeft.x) * 100}%`;
  frame.style.height = `${(bottomRight.y - topLeft.y) * 100}%`;
}

function isCityMinimapShown() {
  const panel = document.getElementById('city-minimap');
  if (!panel || panel.classList.contains('is-collapsed')) return false;
  if (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) return false;
  if (typeof isAttractModeActive === 'function' && isAttractModeActive()) return false;
  return document.getElementById('landing-screen')?.style.display === 'none';
}

function tickCityMinimap() {
  requestAnimationFrame(tickCityMinimap);
  if (!gameReady || !activeScene || !isCityMinimapShown()) return;
  if (mapRotation !== cityMinimapLastRotation || performance.now() - cityMinimapLastDrawAt > CITY_MINIMAP_REDRAW_MS) {
    drawCityMinimap();
    cityMinimapLastView = '';
  }
  updateCityMinimapView();
}

function moveCameraToCityMinimapPoint(event) {
  const surface = document.getElementById('city-minimap-surface');
  const camera = activeScene?.cameras?.main;
  if (!surface || !camera) return;
  const rect = surface.getBoundingClientRect();
  const fx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const fy = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const world = cityMinimapFractionToWorld(activeScene, fx, fy);
  camera.centerOn(world.x, world.y);
}

function setCityMinimapCollapsed(collapsed) {
  const panel = document.getElementById('city-minimap');
  const toggle = document.getElementById('city-minimap-toggle');
  if (!panel) return;
  panel.classList.toggle('is-collapsed', collapsed);
  if (toggle) {
    toggle.textContent = collapsed ? '+' : '−';
    const key = collapsed ? 'minimap.show' : 'minimap.hide';
    toggle.dataset.i18nTitle = key;
    toggle.title = t(key);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
  try { localStorage.setItem(CITY_MINIMAP_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch {}
  if (!collapsed) cityMinimapLastDrawAt = 0;
}

// The panel starts bottom right (CSS). Once dragged by its header it is placed by left/top,
// remembered per player, and kept inside the window.
function placeCityMinimap(panel, left, top) {
  const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
  const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
  panel.style.left = `${Math.round(Math.max(0, Math.min(maxLeft, left)))}px`;
  panel.style.top = `${Math.round(Math.max(0, Math.min(maxTop, top)))}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

function setupCityMinimapDragging(panel) {
  const header = panel.querySelector('.city-minimap-header');
  if (!header) return;
  let grab = null;

  header.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    grab = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    panel.classList.add('is-dragging');
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener('pointermove', (event) => {
    if (grab) placeCityMinimap(panel, event.clientX - grab.dx, event.clientY - grab.dy);
  });
  const endDrag = () => {
    if (!grab) return;
    grab = null;
    panel.classList.remove('is-dragging');
    try {
      localStorage.setItem(CITY_MINIMAP_POSITION_KEY, JSON.stringify({
        left: parseFloat(panel.style.left) || 0,
        top: parseFloat(panel.style.top) || 0,
      }));
    } catch {}
  };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(CITY_MINIMAP_POSITION_KEY) || 'null'); } catch {}
  if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
    // Measured once laid out; a hidden panel (title screen) has no size yet.
    requestAnimationFrame(() => placeCityMinimap(panel, saved.left, saved.top));
  }
  window.addEventListener('resize', () => {
    if (panel.style.left) placeCityMinimap(panel, parseFloat(panel.style.left), parseFloat(panel.style.top));
  });
}

function setupCityMinimap() {
  const panel = document.getElementById('city-minimap');
  const surface = document.getElementById('city-minimap-surface');
  if (!panel || !surface) return;

  // Keep presses on the minimap from reaching the map underneath (painting, selecting).
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  panel.addEventListener('wheel', (event) => event.stopPropagation());
  surface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    cityMinimapDragging = true;
    surface.setPointerCapture(event.pointerId);
    moveCameraToCityMinimapPoint(event);
  });
  surface.addEventListener('pointermove', (event) => {
    if (cityMinimapDragging) moveCameraToCityMinimapPoint(event);
  });
  const endDrag = () => { cityMinimapDragging = false; };
  surface.addEventListener('pointerup', endDrag);
  surface.addEventListener('pointercancel', endDrag);

  document.getElementById('city-minimap-toggle')?.addEventListener('click', () => {
    setCityMinimapCollapsed(!panel.classList.contains('is-collapsed'));
  });
  let collapsed = false;
  try { collapsed = localStorage.getItem(CITY_MINIMAP_COLLAPSED_KEY) === '1'; } catch {}
  setCityMinimapCollapsed(collapsed);
  setupCityMinimapDragging(panel);

  requestAnimationFrame(tickCityMinimap);
}
