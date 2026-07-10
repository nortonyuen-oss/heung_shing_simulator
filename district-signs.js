const DISTRICT_SIGN_RADIUS = 36;
const DISTRICT_SIGN_MAX_COUNT = 16;
const DISTRICT_SIGN_COST = 250;

let districtSignPlacementPending = false;
let districtSignEditPending = false;
let districtMetricsCache = new Map();

function getDistrictSigns() {
  return Array.isArray(city.districtSigns) ? city.districtSigns : [];
}

function areDistrictSignsVisible() {
  return city.showDistrictSigns !== false;
}

function applyDistrictSignVisibility(scene = null) {
  const targetScene = scene || (typeof activeScene !== 'undefined' ? activeScene : null);
  const visible = areDistrictSignsVisible();
  targetScene?.districtSignSprites?.forEach((sprite) => {
    sprite.setVisible(visible);
    if (sprite.input) sprite.input.enabled = visible;
  });
}

function setDistrictSignsVisible(visible) {
  city.showDistrictSigns = visible !== false;
  applyDistrictSignVisibility();
}

function invalidateDistrictMetrics() {
  districtMetricsCache = new Map();
}

function getDistrictSignForTile(row, col) {
  let nearest = null;
  let nearestDistance = Infinity;
  getDistrictSigns().forEach((sign) => {
    const distance = Math.hypot(Number(sign.row) - row, Number(sign.col) - col);
    const radius = Number(sign.radius) || DISTRICT_SIGN_RADIUS;
    if (distance <= radius && distance < nearestDistance) {
      nearest = sign;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function getDistrictKeyForTile(row, col) {
  const sign = getDistrictSignForTile(row, col);
  if (sign) return `sign:${sign.id}`;
  const vertical = row < MAP_HEIGHT / 2 ? 'n' : 's';
  const horizontal = col < MAP_WIDTH / 2 ? 'w' : 'e';
  return `${vertical}${horizontal}`;
}

function getDistrictSignByKey(key) {
  if (!String(key).startsWith('sign:')) return null;
  const id = String(key).slice(5);
  return getDistrictSigns().find((sign) => sign.id === id) || null;
}

function hasDistrictSignAt(row, col) {
  return getDistrictSigns().some((sign) => sign.row === row && sign.col === col);
}

function canPlaceDistrictSign(scene, row, col) {
  if (!isInsideMap(row, col) || isBridgeTile(row, col)) return false;
  if ([WATER, BEACH].includes(mapData[row][col]) || isSlopeTile(row, col)) return false;
  if (zoneMap[row][col] !== ZONE_NONE || powerLineSet.has(getTileId(row, col))) return false;
  if (scene?.buildingSprites?.has(getTileId(row, col)) || buildingData[getTileId(row, col)]) return false;
  return !hasDistrictSignAt(row, col);
}

function trimDistrictName(value) {
  return Array.from(String(value || '').trim()).slice(0, 30).join('');
}

function trimDistrictEnglishName(value) {
  return Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, 48).join('');
}

async function placeDistrictSign(scene, row, col) {
  if (districtSignPlacementPending) return false;
  if (!canPlaceDistrictSign(scene, row, col)) {
    showToast(t('toast.districtSignBlocked'), 'warning');
    return false;
  }
  if (getDistrictSigns().length >= DISTRICT_SIGN_MAX_COUNT) {
    showToast(t('toast.districtSignLimit', { count: DISTRICT_SIGN_MAX_COUNT }), 'warning');
    return false;
  }

  districtSignPlacementPending = true;
  try {
    const suggestedName = t('districtSign.defaultName', { count: getDistrictSigns().length + 1 });
    const input = await showTextPromptDialog(t('districtSign.namePrompt'), suggestedName);
    const name = trimDistrictName(input);
    if (!name) return false;
    const suggestedEnglishName = t('districtSign.defaultEnglishName', { count: getDistrictSigns().length + 1 });
    const englishInput = await showTextPromptDialog(t('districtSign.englishNamePrompt'), suggestedEnglishName);
    const englishName = trimDistrictEnglishName(englishInput);
    if (!englishName) return false;
    if (getDistrictSigns().some((sign) => sign.name === name)) {
      showToast(t('toast.districtSignDuplicate'), 'warning');
      return false;
    }
    if (!canPlaceDistrictSign(scene, row, col)) return false;
    if (!spendBudget(DISTRICT_SIGN_COST)) {
      showToast(t('toast.notEnoughFunds'), 'warning');
      return false;
    }

    removeTree(scene, row, col);
    const sign = {
      id: `district-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      englishName,
      row,
      col,
      radius: DISTRICT_SIGN_RADIUS,
      createdAtTick: city.tick,
    };
    city.districtSigns.push(sign);
    drawDistrictSignSprite(scene, sign);
    invalidateDistrictMetrics();
    showToast(t('toast.districtSignPlaced', { name, radius: DISTRICT_SIGN_RADIUS }), 'info');
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
    return true;
  } finally {
    districtSignPlacementPending = false;
  }
}

async function editDistrictSign(scene, sign) {
  if (!sign || districtSignEditPending || districtSignPlacementPending) return false;
  districtSignEditPending = true;
  try {
    const nameInput = await showTextPromptDialog(t('districtSign.editNamePrompt'), sign.name);
    if (nameInput === null) return false;
    const name = trimDistrictName(nameInput);
    if (!name) return false;
    const englishInput = await showTextPromptDialog(t('districtSign.editEnglishNamePrompt'), sign.englishName || '');
    if (englishInput === null) return false;
    const englishName = trimDistrictEnglishName(englishInput);
    if (!englishName) return false;
    if (getDistrictSigns().some((item) => item.id !== sign.id && item.name === name)) {
      showToast(t('toast.districtSignDuplicate'), 'warning');
      return false;
    }

    sign.name = name;
    sign.englishName = englishName;
    drawDistrictSignSprite(scene, sign);
    invalidateDistrictMetrics();
    showToast(t('toast.districtSignUpdated', { name }), 'info');
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
    return true;
  } finally {
    districtSignEditPending = false;
  }
}

function removeDistrictSignAt(scene, row, col) {
  const sign = getDistrictSigns().find((item) => item.row === row && item.col === col);
  if (!sign) return false;
  city.districtSigns = getDistrictSigns().filter((item) => item.id !== sign.id);
  const sprite = scene?.districtSignSprites?.get(sign.id);
  sprite?.destroy?.(true);
  scene?.districtSignSprites?.delete(sign.id);
  invalidateDistrictMetrics();
  showToast(t('toast.districtSignRemoved', { name: sign.name }), 'info');
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

function getDistrictSignVisualName(name) {
  const chars = Array.from(String(name || ''));
  return chars.length > 10 ? `${chars.slice(0, 9).join('')}...` : chars.join('');
}

function getDistrictSignVisualEnglishName(name) {
  const chars = Array.from(String(name || ''));
  return chars.length > 24 ? `${chars.slice(0, 23).join('')}...` : chars.join('');
}

function drawDistrictSignSprite(scene, sign) {
  if (!scene?.add || !sign) return null;
  if (!scene.districtSignSprites) scene.districtSignSprites = new Map();
  scene.districtSignSprites.get(sign.id)?.destroy?.(true);

  const displayName = getDistrictSignVisualName(sign.name);
  const displayEnglishName = getDistrictSignVisualEnglishName(sign.englishName || '');
  const plateWidth = Math.max(
    112,
    Math.min(224, Math.max(Array.from(displayName).length * 22, Array.from(displayEnglishName).length * 9) + 30),
  );
  const plateHeight = 66;
  const container = scene.add.container(0, 0);
  const graphic = scene.add.graphics();
  graphic.fillStyle(0x1268ad, 1);
  graphic.fillRoundedRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 5);
  graphic.lineStyle(3, 0xf5f4ea, 1);
  graphic.strokeRoundedRect(-plateWidth / 2 + 2, -plateHeight / 2 + 2, plateWidth - 4, plateHeight - 4, 4);
  graphic.fillStyle(0xd9d9d2, 0.9);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([xDir, yDir]) => {
    graphic.fillCircle(xDir * (plateWidth / 2 - 8), yDir * (plateHeight / 2 - 8), 1.6);
  });
  const englishLabel = scene.add.text(0, -14, displayEnglishName, {
    color: '#ffffff',
    fontFamily: 'Arial Narrow, Helvetica Neue, Arial, sans-serif',
    fontSize: '15px',
    fontStyle: 'bold',
    resolution: 2,
  }).setOrigin(0.5, 0.5);
  const chineseLabel = scene.add.text(0, 13, displayName, {
    color: '#ffffff',
    fontFamily: 'PingFang HK, LiHei Pro, Microsoft JhengHei, Noto Sans TC, sans-serif',
    fontSize: '22px',
    fontStyle: 'bold',
    resolution: 2,
  }).setOrigin(0.5, 0.5);
  chineseLabel.setAngle(-0.25);
  container.add([graphic, englishLabel, chineseLabel]);
  container.setMask(scene.worldMask);
  container.districtSignId = sign.id;
  container.setSize(plateWidth, plateHeight);
  container.setInteractive(
    new Phaser.Geom.Rectangle(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight),
    Phaser.Geom.Rectangle.Contains,
  );
  container.input.cursor = 'pointer';
  container.on('pointerdown', (pointer, localX, localY, event) => {
    if (selectedTool !== 'inspect') return;
    event?.stopPropagation?.();
    pointer.event?.stopPropagation?.();
    editDistrictSign(scene, sign).catch((error) => console.warn('[District sign edit]', error));
  });
  scene.districtSignSprites.set(sign.id, container);
  positionDistrictSignSprite(scene, sign, container);
  container.setVisible(areDistrictSignsVisible());
  if (container.input) container.input.enabled = areDistrictSignsVisible();
  return container;
}

function positionDistrictSignSprite(scene, sign, sprite = null) {
  const container = sprite || scene?.districtSignSprites?.get(sign.id);
  if (!container) return;
  const pos = isoToScreen(sign.col, sign.row);
  const elevation = getElevationVisualOffset(sign.row, sign.col);
  container.setPosition(
    pos.x + scene.offsetX,
    pos.y + scene.offsetY - TILE_HEIGHT / 2 + elevation - 54,
  );
  const signIndex = Math.max(0, getDistrictSigns().findIndex((item) => item.id === sign.id));
  container.setDepth(getPreviewOverlayDepth(100 + signIndex));
}

function repositionDistrictSignSprites(scene) {
  getDistrictSigns().forEach((sign) => positionDistrictSignSprite(scene, sign));
}

function clearDistrictSignSprites(scene) {
  scene?.districtSignSprites?.forEach((sprite) => sprite.destroy?.(true));
  scene?.districtSignSprites?.clear();
}

function rebuildDistrictSignSprites(scene) {
  clearDistrictSignSprites(scene);
  getDistrictSigns().forEach((sign) => drawDistrictSignSprite(scene, sign));
  applyDistrictSignVisibility(scene);
}

function drawDistrictRadiusGuide(scene, row, col, canPlace = true) {
  const graphic = scene?.buildingGuideGraphic;
  if (!graphic) return;
  const color = canPlace ? 0x22c78a : 0xff4d4d;
  const points = [];
  for (let step = 0; step <= 48; step++) {
    const angle = (step / 48) * Math.PI * 2;
    const point = isoToScreen(
      col + Math.cos(angle) * DISTRICT_SIGN_RADIUS,
      row + Math.sin(angle) * DISTRICT_SIGN_RADIUS,
    );
    points.push({ x: point.x + scene.offsetX, y: point.y + scene.offsetY });
  }
  graphic.fillStyle(color, 0.055);
  graphic.lineStyle(2, color, 0.8);
  graphic.beginPath();
  graphic.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => graphic.lineTo(point.x, point.y));
  graphic.closePath();
  graphic.fillPath();
  graphic.strokePath();
  drawFootprintGuide(scene, row, col, 1, 1, canPlace);
}

function getDistrictMetrics(districtKey) {
  const sign = getDistrictSignByKey(districtKey);
  if (!sign) return {
    population: city.population,
    trafficPct: Math.round((city.trafficIndex ?? 0) * 100),
    educationPct: Math.round((city.educationAverageLevel ?? 0) * 100),
    healthPct: Math.round((city.healthIndex ?? 0.5) * 100),
    pollutionPct: Math.round(city.pollution ?? 0),
    landValuePct: Math.round((city.landValueHistory?.at?.(-1) ?? 0.35) * 100),
    poweredPct: Math.round((city.powerRatio ?? 1) * 100),
    schools: Object.values(buildingData).filter((rec) => ['primary_school', 'secondary_school', 'library', 'community_college', 'university'].includes(rec.type)).length,
    hospitals: Object.values(buildingData).filter((rec) => rec.type === 'hospital').length,
    zonedTiles: 0,
  };

  const cacheKey = `${city.tick}:${districtKey}`;
  if (districtMetricsCache.has(cacheKey)) return districtMetricsCache.get(cacheKey);
  const pollutionMap = typeof computePollutionMap === 'function' ? computePollutionMap() : null;
  const radius = Number(sign.radius) || DISTRICT_SIGN_RADIUS;
  const minRow = Math.max(0, Math.floor(sign.row - radius));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.ceil(sign.row + radius));
  const minCol = Math.max(0, Math.floor(sign.col - radius));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.ceil(sign.col + radius));
  let zonedTiles = 0;
  let trafficTiles = 0;
  let trafficSum = 0;
  let educationSum = 0;
  let healthSum = 0;
  let pollutionSum = 0;
  let landValueSum = 0;
  let poweredTiles = 0;

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (getDistrictKeyForTile(row, col) !== districtKey) continue;
      if (mapData[row][col] === ROAD) {
        trafficSum += Number(trafficMap[row]?.[col] || 0);
        trafficTiles++;
      }
      if (zoneMap[row][col] === ZONE_NONE) continue;
      zonedTiles++;
      const service = serviceMap[row]?.[col] || {};
      const education = Math.max(0, Math.min(1, (service.eduBasic || 0) * 0.55 + (service.eduHigher || 0) * 0.45));
      const health = typeof getLocalHealthScore === 'function'
        ? getLocalHealthScore(row, col)
        : Math.max(0, Math.min(1, service.health || 0));
      const pollution = Math.max(0, Math.min(1, pollutionMap?.[row]?.[col] || 0));
      let landValue = 0.35 + (service.police ? 0.22 : 0) + (service.fire ? 0.22 : 0) + (powerMap[row]?.[col] ? 0.1 : 0);
      if (zoneMap[row][col] === ZONE_RES) landValue += Math.min(2, service.park || 0) * 0.12;
      landValue = Math.max(0, Math.min(1, landValue - pollution * 0.35));
      educationSum += education;
      healthSum += health;
      pollutionSum += pollution;
      landValueSum += landValue;
      if (powerMap[row]?.[col]) poweredTiles++;
    }
  }

  const localBuildings = Object.entries(buildingData).filter(([id]) => {
    const [row, col] = id.split(':').map(Number);
    return getDistrictKeyForTile(row, col) === districtKey;
  });
  const metrics = {
    population: localBuildings.reduce((sum, [, rec]) => sum + Math.max(0, Number(rec.population || 0)), 0),
    trafficPct: Math.round((trafficTiles ? trafficSum / trafficTiles : 0) * 100),
    educationPct: Math.round((zonedTiles ? educationSum / zonedTiles : 0) * 100),
    healthPct: Math.round((zonedTiles ? healthSum / zonedTiles : 0.5) * 100),
    pollutionPct: Math.round((zonedTiles ? pollutionSum / zonedTiles : 0) * 100),
    landValuePct: Math.round((zonedTiles ? landValueSum / zonedTiles : 0.35) * 100),
    poweredPct: Math.round((zonedTiles ? poweredTiles / zonedTiles : 0) * 100),
    schools: localBuildings.filter(([, rec]) => ['primary_school', 'secondary_school', 'library', 'community_college', 'university'].includes(rec.type)).length,
    hospitals: localBuildings.filter(([, rec]) => rec.type === 'hospital').length,
    zonedTiles,
  };
  districtMetricsCache.set(cacheKey, metrics);
  return metrics;
}
