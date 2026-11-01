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

// One canvas pixel per tile: a tile at view column c and view row r lands on
// x = c - r + MAP_WIDTH, y = floor((c + r) / 2). Tiles whose c + r is even fill the even x
// of a canvas row and the odd ones the odd x, so the diamond has no gaps.
function getCityMinimapViewCoords(row, col) {
  if (mapRotation === 1) return { c: MAP_HEIGHT - 1 - row, r: col };
  if (mapRotation === 2) return { c: MAP_WIDTH - 1 - col, r: MAP_HEIGHT - 1 - row };
  if (mapRotation === 3) return { c: row, r: MAP_WIDTH - 1 - col };
  return { c: col, r: row };
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

  const width = canvas.width;
  const image = ctx.createImageData(width, canvas.height);
  const data = image.data;
  const paint = (row, col, rgb) => {
    const { c, r } = getCityMinimapViewCoords(row, col);
    const idx = (((c + r) >> 1) * width + (c - r + MAP_WIDTH)) * 4;
    data[idx] = rgb[0];
    data[idx + 1] = rgb[1];
    data[idx + 2] = rgb[2];
    data[idx + 3] = 255;
  };

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) paint(row, col, cityMinimapTileColor(row, col));
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

  ctx.putImageData(image, 0, 0);
  cityMinimapLastDrawAt = performance.now();
  cityMinimapLastRotation = mapRotation;
}

// World position <-> minimap fraction. Tile centres sit at isoToScreen + the scene offset, and
// the minimap x/y above are those positions divided by half a tile.
function cityMinimapWorldToFraction(scene, worldX, worldY) {
  return {
    x: ((worldX - ORIGIN_X - scene.offsetX) / (TILE_WIDTH / 2) + MAP_WIDTH) / (MAP_WIDTH * 2),
    y: ((worldY - scene.offsetY) / TILE_HEIGHT) / MAP_HEIGHT,
  };
}

function cityMinimapFractionToWorld(scene, fx, fy) {
  return {
    x: (fx * MAP_WIDTH * 2 - MAP_WIDTH) * (TILE_WIDTH / 2) + ORIGIN_X + scene.offsetX,
    y: fy * MAP_HEIGHT * TILE_HEIGHT + scene.offsetY,
  };
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
