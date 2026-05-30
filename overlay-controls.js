function toggleOverlayMap(type) {
  const win = document.getElementById('overlay-window');
  if (!type || !win) return;

  if (activeOverlay === type && win.classList.contains('is-open')) {
    closeOverlayWindow();
    return;
  }

  activeOverlay = type;
  overlayCache = {};
  _syncOverlayButtons();
  openOverlayWindow();
}

// Shared drag-pan state (referenced inside mousemove above)
let isMapPanning = false, _panStartX = 0, _panStartY = 0;

function openOverlayWindow() {
  const win = document.getElementById('overlay-window');
  if (!win) return;
  win.classList.add('is-open');
  updateMiniMap();
  // Fit the full map into the viewport on first open
  requestAnimationFrame(resetMapView);
}

function closeOverlayWindow() {
  document.getElementById('overlay-window')?.classList.remove('is-open');
  activeOverlay = null;
  overlayCache  = {};
  _syncOverlayButtons();
}

function _syncOverlayButtons() {
  document.querySelectorAll('.overlay-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.overlay === activeOverlay);
  });
}

function updateMiniMap() {
  const win    = document.getElementById('overlay-window');
  const canvas = document.getElementById('mini-map-canvas');
  if (!win || !canvas || !activeOverlay || !win.classList.contains('is-open')) return;

  // Update title bar
  const titleEl = document.getElementById('overlay-win-title');
  const iconEl  = document.getElementById('overlay-win-icon');
  if (titleEl) titleEl.textContent = t(OVERLAY_TITLES[activeOverlay] ?? activeOverlay);
  if (iconEl)  iconEl.textContent  = OVERLAY_ICONS[activeOverlay]  ?? '🗺';

  overlayCache[activeOverlay] = computeOverlayMap(activeOverlay);
  drawMiniMap(canvas, activeOverlay);
  _drawLegendGradient(activeOverlay);
  updateOverlayDetailPanel(activeOverlay);
}

// Fit the entire 256×256 map inside the viewport, centred
function resetMapView() {
  const body = document.getElementById('overlay-win-body');
  if (!body) return;
  const bw = body.clientWidth  || 360;
  const bh = body.clientHeight || 360;
  mapViewZoom = Math.min(bw / 256, bh / 256);
  mapViewPanX = (bw - 256 * mapViewZoom) / 2;
  mapViewPanY = (bh - 256 * mapViewZoom) / 2;
  _applyCanvasTransform();
}

function _zoomAtPoint(mouseX, mouseY, factor) {
  const newZoom = Math.max(0.3, Math.min(12, mapViewZoom * factor));
  mapViewPanX   = mouseX - (mouseX - mapViewPanX) * (newZoom / mapViewZoom);
  mapViewPanY   = mouseY - (mouseY - mapViewPanY) * (newZoom / mapViewZoom);
  mapViewZoom   = newZoom;
  _applyCanvasTransform();
}

function _applyCanvasTransform() {
  const canvas = document.getElementById('mini-map-canvas');
  if (canvas) canvas.style.transform = `translate(${mapViewPanX}px,${mapViewPanY}px) scale(${mapViewZoom})`;
  const label = document.getElementById('overlay-zoom-label');
  if (label) label.textContent = `${Math.round(mapViewZoom * 100)}%`;
}

function _drawLegendGradient(type) {
  const canvas = document.getElementById('overlay-legend-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let x = 0; x < W; x++) {
    const val = Math.max(0.02, x / (W - 1)); // force visible even at 0
    const [r, g, b] = overlayPixelColor(type, val);
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 230;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawMiniMap(canvas, type) {
  const ctx = canvas.getContext('2d');
  const W = 256, H = 256;
  const imgData = ctx.createImageData(W, H);
  const d = imgData.data;

  // Cache the overlay values map for this type+tick
  if (!overlayCache[type]) {
    overlayCache[type] = computeOverlayMap(type);
  }
  const valMap = overlayCache[type];

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const src = getMiniMapSourceCoords(r, c);
      const idx = (r * W + c) * 4;
      // Terrain base
      const [br, bg, bb] = terrainPixelColor(mapData[src.row]?.[src.col] ?? GROUND, src.row, src.col);
      // Overlay
      const val = valMap[src.row]?.[src.col] ?? 0;
      const [or, og, ob, oa] = overlayPixelColor(type, val);
      // Alpha-blend
      const a = oa / 255;
      d[idx]     = Math.round(br * (1 - a) + or * a);
      d[idx + 1] = Math.round(bg * (1 - a) + og * a);
      d[idx + 2] = Math.round(bb * (1 - a) + ob * a);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  drawOverlayAnnotations(ctx, type);
}

function getMiniMapSourceCoords(displayRow, displayCol) {
  if (mapRotation === 1) return { row: MAP_HEIGHT - 1 - displayCol, col: displayRow };
  if (mapRotation === 2) return { row: MAP_HEIGHT - 1 - displayRow, col: MAP_WIDTH - 1 - displayCol };
  if (mapRotation === 3) return { row: displayCol, col: MAP_WIDTH - 1 - displayRow };
  return { row: displayRow, col: displayCol };
}

function getMiniMapDisplayCoords(row, col) {
  if (mapRotation === 1) return { row: col, col: MAP_HEIGHT - 1 - row };
  if (mapRotation === 2) return { row: MAP_HEIGHT - 1 - row, col: MAP_WIDTH - 1 - col };
  if (mapRotation === 3) return { row: MAP_WIDTH - 1 - col, col: row };
  return { row, col };
}

function drawOverlayAnnotations(ctx, type) {
  if (!ctx) return;
  ctx.save();

  if (type === 'crime' || type === 'fire') {
    Object.entries(buildingData).forEach(([id, rec]) => {
      const isFire = type === 'fire' && rec.type === 'fire_station';
      const isPolice = type === 'crime' && rec.type === 'police_station';
      if (!isFire && !isPolice) return;

      const radius = type === 'fire' ? FIRE_STATION_RADIUS : POLICE_STATION_RADIUS;
      const [r0, c0] = id.split(':').map(Number);
      const center = getMiniMapDisplayCoords(r0, c0);
      ctx.strokeStyle = type === 'fire' ? 'rgba(255,120,70,0.45)' : 'rgba(100,170,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(center.col + 0.5, center.row + 0.5, radius, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  if (type === 'power' || type === 'electricity') {
    Object.entries(buildingData).forEach(([id, rec]) => {
      const stats = POWER_PLANT_STATS[rec.type];
      if (!stats) return;
      const [r0, c0] = id.split(':').map(Number);
      const state = getPowerPlantState(rec);
      const topLeft = getMiniMapDisplayCoords(r0, c0);
      const fill = rec.type === 'power_plant_coal'
        ? (state === 'abandoned' ? 'rgba(170,170,170,0.92)' : state === 'degraded' ? 'rgba(245,183,95,0.92)' : 'rgba(255,200,70,0.92)')
        : (state === 'abandoned' ? 'rgba(170,170,170,0.92)' : state === 'degraded' ? 'rgba(210,230,160,0.92)' : 'rgba(255,235,120,0.92)');
      ctx.fillStyle = fill;
      ctx.strokeStyle = 'rgba(30,20,0,0.7)';
      ctx.lineWidth = 1;
      const footprintCols = rec.footprintCols ?? stats.footprintCols ?? 1;
      const footprintRows = rec.footprintRows ?? stats.footprintRows ?? 1;
      for (let dr = 0; dr < footprintRows; dr++) {
        for (let dc = 0; dc < footprintCols; dc++) {
          const tile = getMiniMapDisplayCoords(r0 + dr, c0 + dc);
          ctx.fillRect(tile.col, tile.row, 1, 1);
        }
      }
      ctx.strokeRect(topLeft.col + 0.5, topLeft.row + 0.5, footprintCols - 1, footprintRows - 1);
    });
  }

  if (type === 'education') {
    Object.entries(buildingData).forEach(([id, rec]) => {
      if (!['primary_school', 'secondary_school', 'library', 'community_college', 'university'].includes(rec.type)) return;

      const [r0, c0] = id.split(':').map(Number);
      const center = getMiniMapDisplayCoords(r0, c0);
      const isHigher = rec.type === 'community_college' || rec.type === 'university';
      const radius = rec.type === 'primary_school' ? PRIMARY_SCHOOL_RADIUS
        : rec.type === 'secondary_school' ? SECONDARY_SCHOOL_RADIUS
          : rec.type === 'library' ? LIBRARY_RADIUS
            : rec.type === 'community_college' ? COMMUNITY_COLLEGE_RADIUS
              : UNIVERSITY_RADIUS;

      ctx.strokeStyle = isHigher ? 'rgba(130,90,255,0.40)' : 'rgba(70,170,255,0.40)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(center.col + 0.5, center.row + 0.5, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isHigher ? 'rgba(120,70,240,0.95)' : 'rgba(35,140,230,0.95)';
      ctx.fillRect(center.col, center.row, 1, 1);
    });
  }

  ctx.restore();
}

function updateOverlayDetailPanel(type) {
  const title = document.getElementById('overlay-detail-title');
  const stats = document.getElementById('overlay-detail-stats');
  const note = document.getElementById('overlay-detail-note');
  const footer = document.getElementById('overlay-power-footer');
  const statusEl = document.getElementById('overlay-power-status');
  const mwEl = document.getElementById('overlay-power-mw');
  const barEl = document.getElementById('overlay-power-bar');
  const legend = document.getElementById('overlay-legend');

  if (!title || !stats || !note || !footer || !statusEl || !mwEl || !barEl || !legend) return;

  title.textContent = t(OVERLAY_TITLES[type] ?? type);
  stats.innerHTML = '';
  note.textContent = '';

  const chip = (label, value) => `<span class="overlay-detail-chip"><span class="overlay-detail-label">${label}</span><span class="overlay-detail-value">${value}</span></span>`;

  if (type === 'electricity') {
    const supply = city.totalPowerSupply ?? 0;
    const demand = city.totalPowerDemand ?? 0;
    const status = city.powerStatus ?? (supply >= demand ? 'ok' : 'overloaded');
    const load = demand > 0 ? Math.round(Math.min(100, (supply / demand) * 100)) : 100;
    stats.innerHTML = [
      chip(t('overlay.detail.powerSupply'), `${supply} MW`),
      chip(t('overlay.detail.powerDemand'), `${demand} MW`),
      chip(t('overlay.detail.powerLoad'), `${load}%`),
      chip(t('overlay.detail.status'), t(`hud.powerStatus.${status}`) || status),
    ].join('');
    note.textContent = supply >= demand
      ? t('overlay.detail.powerStable')
      : t('inspect.powerShortage', { supply, demand });
    footer.classList.add('is-visible');
    statusEl.textContent = t(`hud.powerStatus.${status}`) || status.toUpperCase();
    statusEl.className = status === 'surplus' || status === 'ok' ? 'power-status-ok' : status === 'strained' ? 'power-status-warn' : 'power-status-bad';
    mwEl.textContent = t('hud.powerMW', { supply, demand });
    barEl.style.width = `${Math.min(100, (supply / Math.max(1, demand)) * 100)}%`;
    barEl.style.background = status === 'surplus' || status === 'ok' ? '#44cc55' : status === 'strained' ? '#f1c65d' : '#cc4444';
    setOverlayLegendLabels(type);
    legend.classList.remove('is-hidden');
    return;
  }

  if (type === 'power') {
    const coal = Object.values(buildingData).filter((rec) => rec.type === 'power_plant_coal').length;
    const solar = Object.values(buildingData).filter((rec) => rec.type === 'power_plant_solar').length;
    const active = Object.values(buildingData).filter((rec) => POWER_PLANT_STATS[rec.type] && (rec.powerState ?? 'active') === 'active').length;
    const degraded = Object.values(buildingData).filter((rec) => POWER_PLANT_STATS[rec.type] && (rec.powerState ?? 'active') === 'degraded').length;
    const abandoned = Object.values(buildingData).filter((rec) => POWER_PLANT_STATS[rec.type] && (rec.powerState ?? 'active') === 'abandoned').length;
    stats.innerHTML = [
      chip(t('building.coalPlant'), coal),
      chip(t('building.solarPlant'), solar),
      chip(t('inspect.powerStateActive'), active),
      chip(t('inspect.powerStateDegraded'), degraded),
      chip(t('inspect.powerStateAbandoned'), abandoned),
    ].join('');
    note.textContent = t('overlay.detail.powerPlantLegend');
    footer.classList.add('is-visible');
    const supply = city.totalPowerSupply ?? 0;
    const demand = city.totalPowerDemand ?? 0;
    const status = city.powerStatus ?? (supply >= demand ? 'ok' : 'overloaded');
    statusEl.textContent = t(`hud.powerStatus.${status}`) || status.toUpperCase();
    statusEl.className = status === 'surplus' || status === 'ok' ? 'power-status-ok' : status === 'strained' ? 'power-status-warn' : 'power-status-bad';
    mwEl.textContent = t('hud.powerMW', { supply, demand });
    barEl.style.width = `${Math.min(100, (supply / Math.max(1, demand)) * 100)}%`;
    barEl.style.background = status === 'surplus' || status === 'ok' ? '#44cc55' : status === 'strained' ? '#f1c65d' : '#cc4444';
    setOverlayLegendLabels(type);
    legend.classList.remove('is-hidden');
    return;
  }

  if (type === 'education') {
    const districtAverages = computeEducationDistrictAverages();
    const schoolCount = Object.values(buildingData).filter((rec) => (
      rec.type === 'primary_school'
      || rec.type === 'secondary_school'
      || rec.type === 'library'
      || rec.type === 'community_college'
      || rec.type === 'university'
    )).length;
    const districtLabel = (key) => t(`overlay.district.${key}`);
    const pct = (value) => `${Math.round(clamp(value, 0, 1) * 100)}%`;

    stats.innerHTML = [
      chip(t('overlay.detail.average'), pct(city.educationAverageLevel ?? 0)),
      chip(t('overlay.detail.schools'), schoolCount),
      chip(districtLabel('nw'), pct(districtAverages.nw)),
      chip(districtLabel('ne'), pct(districtAverages.ne)),
      chip(districtLabel('sw'), pct(districtAverages.sw)),
      chip(districtLabel('se'), pct(districtAverages.se)),
    ].join('');
    note.textContent = t('overlay.detail.educationCoverage');
    footer.classList.remove('is-visible');
    legend.classList.remove('is-hidden');
    setOverlayLegendLabels(type);
    return;
  }

  footer.classList.remove('is-visible');
  legend.classList.remove('is-hidden');
  setOverlayLegendLabels(type);
  if (type === 'crime' || type === 'fire') {
    note.textContent = type === 'crime'
      ? t('overlay.detail.coveragePolice')
      : t('overlay.detail.coverageFire');
  } else if (type === 'pollution') {
    note.textContent = t('overlay.detail.pollutionHint');
  } else if (type === 'population') {
    note.textContent = t('overlay.detail.populationHint');
  } else if (type === 'landvalue') {
    note.textContent = t('overlay.detail.landvalueHint');
  }
}

function setOverlayLegendLabels(type) {
  const minEl = document.getElementById('overlay-legend-min');
  const midEl = document.getElementById('overlay-legend-mid');
  const maxEl = document.getElementById('overlay-legend-max');
  if (!minEl || !midEl || !maxEl) return;

  const labels = {
    pollution: ['0%', '50%', '100%'],
    crime: ['0%', '50%', '100%'],
    fire: ['0%', '50%', '100%'],
    population: ['0%', '50%', '100%'],
    landvalue: ['0%', '50%', '100%'],
    education: ['0%', '50%', '100%'],
    electricity: [t('overlay.legend.short'), t('overlay.legend.balanced'), t('overlay.legend.surplus')],
    power: [t('overlay.legend.old'), t('overlay.legend.degraded'), t('overlay.legend.active')],
  }[type] ?? ['0%', '50%', '100%'];

  minEl.textContent = labels[0];
  midEl.textContent = labels[1];
  maxEl.textContent = labels[2];
}

function terrainPixelColor(terrain, r, c) {
  // Draw zone color on top of terrain where applicable
  const zone = zoneMap[r]?.[c] ?? ZONE_NONE;
  if (zone === ZONE_RES) return [80, 160, 60];
  if (zone === ZONE_COM) return [60, 100, 200];
  if (zone === ZONE_IND) return [160, 140, 40];
  if (treeMap[r]?.[c]) return [38, 115, 45];
  if (isBridgeTile(r, c)) return [110, 110, 110];
  switch (terrain) {
    case ROAD:  return [110, 110, 110];
    case DIRT:  return [170, 130, 85];
    case BEACH: return [210, 195, 130];
    case WATER: return [40,  120, 200];
    case HILL:  return [90,  130, 55];
    default:    return [100, 155, 65];   // GROUND / grass
  }
}

function terrainEditorPixelColor(terrain, height = 0) {
  switch (terrain) {
    case WATER: return [44, 124, 190];
    case BEACH: return [222, 202, 135];
    case DIRT: return [158, 119, 77];
    case HILL: {
      const h = Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Number(height) || 0));
      return [
        Math.max(50, 92 - h * 4),
        Math.min(205, 132 + h * 12),
        Math.max(52, 74 - h * 2),
      ];
    }
    default: return [96, 160, 88];
  }
}

function drawTerrainMiniMap() {
  const canvas = document.getElementById('terrain-minimap-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const imgData = ctx.createImageData(W, H);
  const d = imgData.data;
  let highTiles = 0;
  let waterTiles = 0;

  for (let displayRow = 0; displayRow < H; displayRow++) {
    for (let displayCol = 0; displayCol < W; displayCol++) {
      const src = getMiniMapSourceCoords(displayRow, displayCol);
      const tile = mapData[src.row]?.[src.col] ?? GROUND;
      const height = heightMap[src.row]?.[src.col] ?? 0;
      if (tile === WATER) waterTiles++;
      if (height > 0) highTiles++;

      const [r, g, b] = terrainEditorPixelColor(tile, height);
      const idx = (displayRow * W + displayCol) * 4;
      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const meta = document.getElementById('terrain-minimap-meta');
  if (meta) {
    const highPct = Math.round((highTiles / (MAP_WIDTH * MAP_HEIGHT)) * 100);
    const waterPct = Math.round((waterTiles / (MAP_WIDTH * MAP_HEIGHT)) * 100);
    meta.textContent = t('terrainEditor.mapMeta', { high: highPct, water: waterPct });
  }
}

function scheduleTerrainMiniMapUpdate() {
  if (!isTerrainCreatorMode) return;
  if (terrainMiniMapRaf !== null) return;
  terrainMiniMapRaf = requestAnimationFrame(() => {
    terrainMiniMapRaf = null;
    drawTerrainMiniMap();
  });
}

function setupTerrainMiniMapControls() {
  const panel = document.getElementById('terrain-minimap-panel');
  const canvas = document.getElementById('terrain-minimap-canvas');
  if (!panel || !canvas) return;

  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  canvas.addEventListener('click', (event) => {
    if (!activeScene) return;
    const rect = canvas.getBoundingClientRect();
    const displayCol = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(((event.clientX - rect.left) / rect.width) * MAP_WIDTH)));
    const displayRow = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(((event.clientY - rect.top) / rect.height) * MAP_HEIGHT)));
    const { row, col } = getMiniMapSourceCoords(displayRow, displayCol);
    centerCameraOnTile(activeScene, row, col);
  });
}

function centerCameraOnTile(scene, row, col) {
  const camera = scene?.cameras?.main;
  if (!camera || !isInsideMap(row, col)) return;
  const pos = isoToScreen(col, row);
  const worldX = pos.x + scene.offsetX;
  const worldY = pos.y + scene.offsetY + getTerrainTileVisualOffset(row, col, getTileKey(row, col));
  camera.scrollX = worldX - camera.width / (2 * camera.zoom);
  camera.scrollY = worldY - camera.height / (2 * camera.zoom);
}

function overlayPixelColor(type, val) {
  if (val <= 0.01) return [0, 0, 0, 0];
  const a = Math.round(Math.min(220, val * 230));
  switch (type) {
    case 'pollution':  return [80,  10,  0,   a];   // dark brownish-red
    case 'crime':      return [200, 0,   0,   a];   // red
    case 'fire':       return [220, 80,  0,   a];   // orange
    case 'population': return [20,  80,  220, a];   // blue
    case 'education':  return [25, Math.round(80 + val * 145), Math.round(170 + val * 70), a];
    case 'electricity': return [Math.round(240 * (1 - val)), Math.round(70 + 170 * val), Math.round(30 + 20 * val), a];
    case 'power':      return [Math.round(175 + 55 * val), Math.round(175 + 35 * val), Math.round(175 - 70 * val), a];
    case 'landvalue': {
      // green gradient: low=red, high=green
      return [Math.round((1 - val) * 200), Math.round(val * 200), 0, 200];
    }
    default: return [0, 0, 0, 0];
  }
}

function getTileOverlayValue(type, r, c) {
  if (!overlayCache[type]) overlayCache[type] = computeOverlayMap(type);
  return overlayCache[type]?.[r]?.[c] ?? 0;
}

function computeOverlayMap(type) {
  if (type === 'pollution')  return computePollutionMap();
  if (type === 'crime')      return computeCrimeMap();
  if (type === 'fire')       return computeFireMap();
  if (type === 'population') return computePopulationMap();
  if (type === 'landvalue')  return computeLandValueMap();
  if (type === 'education')  return computeEducationMap();
  if (type === 'electricity') return computeElectricityMap();
  if (type === 'power')      return computePowerPlantMap();
  return createFilledMap(0);
}

function computeEducationMap() {
  const map = createFilledMap(0);
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (zoneMap[r][c] === ZONE_NONE && !buildingData[getTileId(r, c)]) continue;
      const cell = serviceMap[r]?.[c] ?? null;
      const basic = clamp(cell?.eduBasic ?? 0, 0, 1);
      const higher = clamp(cell?.eduHigher ?? 0, 0, 1);
      map[r][c] = clamp(basic * 0.55 + higher * 0.45, 0, 1);
    }
  }
  return map;
}

function computeEducationDistrictAverages() {
  const districts = {
    nw: { sum: 0, pop: 0 },
    ne: { sum: 0, pop: 0 },
    sw: { sum: 0, pop: 0 },
    se: { sum: 0, pop: 0 },
  };
  const splitRow = Math.floor(MAP_HEIGHT / 2);
  const splitCol = Math.floor(MAP_WIDTH / 2);

  Object.entries(buildingData).forEach(([id, rec]) => {
    if (rec.type !== 'residential') return;
    const pop = Math.max(0, Number(rec.population ?? 0));
    if (pop <= 0) return;

    const [r, c] = id.split(':').map(Number);
    const cell = serviceMap[r]?.[c] ?? null;
    const localEdu = clamp((cell?.eduBasic ?? 0) * 0.55 + (cell?.eduHigher ?? 0) * 0.45, 0, 1);
    const key = r < splitRow
      ? (c < splitCol ? 'nw' : 'ne')
      : (c < splitCol ? 'sw' : 'se');

    districts[key].sum += localEdu * pop;
    districts[key].pop += pop;
  });

  return {
    nw: districts.nw.pop > 0 ? districts.nw.sum / districts.nw.pop : 0,
    ne: districts.ne.pop > 0 ? districts.ne.sum / districts.ne.pop : 0,
    sw: districts.sw.pop > 0 ? districts.sw.sum / districts.sw.pop : 0,
    se: districts.se.pop > 0 ? districts.se.sum / districts.se.pop : 0,
  };
}

function computePollutionMap() {
  const map = createFilledMap(0);
  const pollutionMul = isPolicyActive('cleanAir') ? 0.70 : 1;
  Object.entries(buildingData).forEach(([id, rec]) => {
    const stats = POWER_PLANT_STATS[rec.type];
    const isInd  = rec.type === 'industrial';
    if (!stats && !isInd) return;
    const [r0, c0] = id.split(':').map(Number);
    const radius   = stats?.pollutionRadius ?? 12;
    const strength = (stats ? stats.pollutionStrength : 0.5) * pollutionMul;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (!isInsideMap(r, c)) continue;
        const dist = Math.sqrt(dr * dr + dc * dc);
        if (dist > radius) continue;
        map[r][c] = Math.min(1, map[r][c] + strength * (1 - dist / radius));
      }
    }
  });
  const canopy = computeTreeCanopyMap();
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (canopy[r][c] <= 0) continue;
      map[r][c] = Math.max(0, map[r][c] - canopy[r][c] * 0.22);
    }
  }
  return map;
}

function computeCrimeMap() {
  const map = createFilledMap(0);
  const protectedRisk = isPolicyActive('publicSafety') ? 0.03 : 0.05;
  const unprotectedRisk = Math.max(0.35, 0.82 - (getDepartmentFunding('police') - 1) * 0.25);
  for (let r = 0; r < MAP_HEIGHT; r++)
    for (let c = 0; c < MAP_WIDTH; c++)
      if (zoneMap[r][c] !== ZONE_NONE)
        map[r][c] = serviceMap[r]?.[c]?.police ? protectedRisk : unprotectedRisk;
  return map;
}

function computeFireMap() {
  const map = createFilledMap(0);
  const protectedRisk = isPolicyActive('publicSafety') ? 0.03 : 0.05;
  const unprotectedRisk = Math.max(0.35, 0.80 - (getDepartmentFunding('fire') - 1) * 0.25);
  Object.entries(buildingData).forEach(([id, rec]) => {
    const stats = POWER_PLANT_STATS[rec.type];
    if (!stats) return;
    const [r0, c0] = id.split(':').map(Number);
    const radius = stats.fireRadius;
    const strength = stats.fireStrength * (isPolicyActive('publicSafety') ? 0.85 : 1);
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (!isInsideMap(r, c)) continue;
        const dist = Math.sqrt(dr * dr + dc * dc);
        if (dist > radius) continue;
        map[r][c] = Math.min(1, map[r][c] + strength * (1 - dist / radius));
      }
    }
  });
  addTreeFireRisk(map);
  for (let r = 0; r < MAP_HEIGHT; r++)
    for (let c = 0; c < MAP_WIDTH; c++)
      if (zoneMap[r][c] !== ZONE_NONE)
        map[r][c] = Math.max(map[r][c], serviceMap[r]?.[c]?.fire ? protectedRisk : unprotectedRisk);
  return map;
}

function addTreeFireRisk(map) {
  const radius = 2;
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const tree = treeMap[row]?.[col];
      if (!tree) continue;
      const baseRisk = isMatureTree(tree) ? TREE_FIRE_RISK_MATURE : TREE_FIRE_RISK_YOUNG;
      const risk = serviceMap[row]?.[col]?.fire ? baseRisk * 0.55 : baseRisk;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (!isInsideMap(r, c)) continue;
          const dist = Math.abs(dr) + Math.abs(dc);
          if (dist > radius) continue;
          map[r][c] = Math.min(1, map[r][c] + risk * (1 - dist / Math.max(1, radius + 1)));
        }
      }
    }
  }
}

function computePopulationMap() {
  const map = createFilledMap(0);
  let maxPop = 1;
  Object.values(buildingData).forEach((rec) => {
    if (rec.population > maxPop) maxPop = rec.population;
  });
  Object.entries(buildingData).forEach(([id, rec]) => {
    if (!rec.population) return;
    const [r, c] = id.split(':').map(Number);
    map[r][c] = Math.min(1, rec.population / maxPop);
  });
  return map;
}

function computeLandValueMap() {
  const pollution = computePollutionMap();
  const canopy = computeTreeCanopyMap();
  const nuisance = createFilledMap(0);
  Object.entries(buildingData).forEach(([id, rec]) => {
    const stats = POWER_PLANT_STATS[rec.type];
    if (!stats) return;
    const [r0, c0] = id.split(':').map(Number);
    const radius = stats.nuisanceRadius;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (!isInsideMap(r, c)) continue;
        const dist = Math.abs(dr) + Math.abs(dc);
        if (dist > radius) continue;
        nuisance[r][c] = Math.min(1, nuisance[r][c] + stats.nuisanceStrength * (1 - dist / Math.max(1, radius)));
      }
    }
  });
  const map = createFilledMap(0);
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (zoneMap[r][c] === ZONE_NONE) continue;
      let val = 0.35;
      if (serviceMap[r]?.[c]?.police) val += 0.22;
      if (serviceMap[r]?.[c]?.fire)   val += 0.22;
      if (zoneMap[r][c] === ZONE_RES) val += (serviceMap[r]?.[c]?.park ?? 0) * 0.12;
      if (powerMap[r]?.[c])           val += 0.10;
      if (zoneMap[r][c] === ZONE_RES) {
        val += (canopy[r]?.[c] ?? 0) * TREE_LAND_VALUE_BONUS_MAX;
        val += getScenicValue(r, c) * SCENIC_LAND_VALUE_BONUS_MAX;
      }
      val -= (pollution[r]?.[c] ?? 0) * 0.35;
      val -= (nuisance[r]?.[c] ?? 0) * 0.22;
      map[r][c] = Math.max(0, Math.min(1, val));
    }
  }
  return map;
}

function computeElectricityMap() {
  const map = createFilledMap(0);
  const powerRatio = city.powerRatio ?? 1;
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (zoneMap[r][c] === ZONE_NONE && !buildingData[getTileId(r, c)]) continue;
      map[r][c] = powerMap[r][c] ? Math.max(0.2, powerRatio) : Math.max(0, powerRatio * 0.15);
    }
  }
  return map;
}

function computePowerPlantMap() {
  const map = createFilledMap(0);
  Object.entries(buildingData).forEach(([id, rec]) => {
    if (!POWER_PLANT_STATS[rec.type]) return;
    const [r0, c0] = id.split(':').map(Number);
    const footprintCols = rec.footprintCols ?? POWER_PLANT_MODELS[rec.type]?.footprintCols ?? 1;
    const footprintRows = rec.footprintRows ?? POWER_PLANT_MODELS[rec.type]?.footprintRows ?? 1;
    const state = getPowerPlantState(rec);
    const value = state === 'abandoned' ? 0.25 : state === 'degraded' ? 0.65 : 1;
    for (let dr = 0; dr < footprintRows; dr++) {
      for (let dc = 0; dc < footprintCols; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (!isInsideMap(r, c)) continue;
        map[r][c] = Math.max(map[r][c], value);
      }
    }
  });
  return map;
}

