// Bridges: deck and ramp placement over water, the bridge sprites and their layered ramp
// textures, and the bridge map values saves carry. Split out of main.js.

const BRIDGE_DECK_VISUAL_LIFT = 15;
const BRIDGE_SPRITE_DEPTH_BOOST = 64;
const BRIDGE_RAMP_BODY_DEPTH_OFFSET = 0.45;
const BRIDGE_TOP_LAYER_CUTOFF_Y = 40;
const BRIDGE_SIDE_LAYER_START_Y = 28;

function prepareBridgeLayerTextures(scene) {
  [
    ['road_bridge_h', 'road_bridge_h_top', 'road_bridge_h_side'],
    ['road_bridge_v', 'road_bridge_v_top', 'road_bridge_v_side'],
  ].forEach(([sourceKey, topKey, sideKey]) => {
    const source = scene.textures.get(sourceKey)?.getSourceImage();
    if (!source || scene.textures.exists(topKey)) return;
    const width = source.width;
    const height = source.height;
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext('2d');
    sourceCtx.drawImage(source, 0, 0);
    const sourceData = sourceCtx.getImageData(0, 0, width, height);
    const topCanvas = document.createElement('canvas');
    const sideCanvas = document.createElement('canvas');
    topCanvas.width = sideCanvas.width = width;
    topCanvas.height = sideCanvas.height = height;
    const topCtx = topCanvas.getContext('2d');
    const sideCtx = sideCanvas.getContext('2d');
    const topData = topCtx.createImageData(width, height);
    const sideData = sideCtx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const r = sourceData.data[index];
        const g = sourceData.data[index + 1];
        const b = sourceData.data[index + 2];
        const a = sourceData.data[index + 3];
        if (a === 0) continue;
        const roadSurface = Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r >= 70 && r <= 135;
        const bridgeUnderside = r >= 120 && r <= 210 && g >= 80 && g <= 170 && b <= 135;

        if (y <= BRIDGE_TOP_LAYER_CUTOFF_Y) {
          topData.data[index] = r;
          topData.data[index + 1] = g;
          topData.data[index + 2] = b;
          topData.data[index + 3] = a;
        }
        if (y >= BRIDGE_SIDE_LAYER_START_Y && !roadSurface && bridgeUnderside) {
          sideData.data[index] = r;
          sideData.data[index + 1] = g;
          sideData.data[index + 2] = b;
          sideData.data[index + 3] = a;
        }
      }
    }

    topCtx.putImageData(topData, 0, 0);
    sideCtx.putImageData(sideData, 0, 0);
    scene.textures.addCanvas(topKey, topCanvas);
    scene.textures.addCanvas(sideKey, sideCanvas);
  });
}

function getBridgeRampSurfaceTextureKey(scene, key, visualDirection) {
  const sourceKey = resolveTileTextureKey(key);
  const surfaceKey = `${sourceKey}_bridge_ramp_surface_${visualDirection}`;
  if (scene.textures.exists(surfaceKey)) return surfaceKey;

  const source = scene.textures.get(sourceKey)?.getSourceImage();
  if (!source) return sourceKey;

  const width = source.width;
  const height = source.height;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  sourceCtx.drawImage(source, 0, 0);
  const sourceData = sourceCtx.getImageData(0, 0, width, height);
  const surfaceCanvas = document.createElement('canvas');
  surfaceCanvas.width = width;
  surfaceCanvas.height = height;
  const surfaceCtx = surfaceCanvas.getContext('2d');
  const surfaceData = surfaceCtx.createImageData(width, height);
  const bounds = getAlphaBounds(sourceData, width, height);

  if (!bounds) {
    scene.textures.addCanvas(surfaceKey, surfaceCanvas);
    return surfaceKey;
  }

  const surfaceMask = createBridgeRampSurfaceMask(sourceData, width, height, bounds, visualDirection);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      if (!surfaceMask[y * width + x]) continue;
      surfaceData.data[index] = sourceData.data[index];
      surfaceData.data[index + 1] = sourceData.data[index + 1];
      surfaceData.data[index + 2] = sourceData.data[index + 2];
      surfaceData.data[index + 3] = sourceData.data[index + 3];
    }
  }

  surfaceCtx.putImageData(surfaceData, 0, 0);
  scene.textures.addCanvas(surfaceKey, surfaceCanvas);
  return surfaceKey;
}

function getAlphaBounds(imageData, width, height) {
  const bounds = { minX: width, minY: height, maxX: -1, maxY: -1 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = imageData.data[((y * width + x) * 4) + 3];
      if (alpha <= 0) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY ? bounds : null;
}

// The part of a ramp that must draw in front of the deck it climbs to. The ramp body sits in the
// terrain band (so its earth base stays under the neighbouring ground tiles), but the deck is in
// the road band and its end and side faces would otherwise cover the ramp's shoulders and
// retaining walls at the joint - the road looked broken where it met the bridge. The overlay
// therefore carries every opaque pixel of the ramp's deck-side half except earth and grass, not
// just the asphalt band it used to: shoulders, kerbs and walls included.
function createBridgeRampSurfaceMask(imageData, width, height, bounds, visualDirection) {
  const surfaceMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4;
      const a = imageData.data[pixelIndex + 3];
      if (a < 16) continue;
      const r = imageData.data[pixelIndex];
      const g = imageData.data[pixelIndex + 1];
      const b = imageData.data[pixelIndex + 2];
      if (isBridgeRampEarthPixel(r, g, b)) continue;
      if (!isInsideBridgeRampDeckHalf(x, y, bounds, visualDirection)) continue;
      surfaceMask[y * width + x] = 1;
    }
  }
  return surfaceMask;
}

// Grass or the brown earth base of a ramp: never part of the structure that fronts the deck.
// Earth in the road art is a muted brown with a fairly high blue channel (e.g. 160,120,88);
// the yellow kerb paint is the other warm colour and has very little blue (216,176,64), so
// the blue floor keeps the paint on the structure side.
function isBridgeRampEarthPixel(r, g, b) {
  const greenTerrain = g > r + 18 && g > b + 8;
  const brownEarth = r > g + 24 && g > b + 16 && g - b <= 56 && b >= 76 && r >= 120 && r <= 220;
  return greenTerrain || brownEarth;
}

// The half of the ramp's art nearest the deck it climbs to (the same axis test the old
// asphalt-only cap used, without its cross-axis band).
function isInsideBridgeRampDeckHalf(x, y, bounds, visualDirection) {
  const halfWidth = Math.max(1, (bounds.maxX - bounds.minX + 1) / 2);
  const halfHeight = Math.max(1, (bounds.maxY - bounds.minY + 1) / 2);
  const xNorm = (x - (bounds.minX + bounds.maxX) / 2) / halfWidth;
  const yNorm = (y - (bounds.minY + bounds.maxY) / 2) / halfHeight;
  let bridgeScore = xNorm - yNorm;
  if (visualDirection === 'e') bridgeScore = xNorm + yNorm;
  else if (visualDirection === 's') bridgeScore = -xNorm + yNorm;
  else if (visualDirection === 'w') bridgeScore = -xNorm - yNorm;
  return bridgeScore >= -0.05;
}

function isBridgeTile(row, col) {
  return !!bridgeMap?.[row]?.[col];
}

function isBridgeDeckTile(row, col) {
  return normalizeBridgeMapValue(bridgeMap?.[row]?.[col])?.startsWith('deck:') ?? false;
}

function isBridgeRampTile(row, col) {
  return normalizeBridgeMapValue(bridgeMap?.[row]?.[col])?.startsWith('ramp:') ?? false;
}

function analyzeBridgePath(scene, pathInfo) {
  const path = pathInfo?.path ?? [];
  const axis = pathInfo?.axis;
  const result = {
    valid: false,
    axis,
    path,
    crossesWater: false,
    reason: '',
    cost: 0,
  };
  if (path.length < 3) {
    result.reason = 'bridge-too-short';
    return result;
  }

  const start = path[0];
  const end = path[path.length - 1];
  const interior = path.slice(1, -1);
  result.crossesWater = path.some(({ row, col }) => mapData[row]?.[col] === WATER);
  if (!result.crossesWater) return result;

  if (getTileHeight(start.row, start.col) > 0 || getTileHeight(end.row, end.col) > 0) {
    result.reason = 'bridge-flat-shores';
    return result;
  }

  if (!isBridgeShoreTile(start.row, start.col) || !isBridgeShoreTile(end.row, end.col)) {
    result.reason = 'bridge-two-shores';
    return result;
  }

  for (const tile of path) {
    const id = getTileId(tile.row, tile.col);
    if (scene?.buildingSprites?.has(id) || buildingData[id]) {
      result.reason = 'bridge-blocked';
      return result;
    }
  }

  for (const tile of interior) {
    if (mapData[tile.row][tile.col] !== WATER) {
      result.reason = 'bridge-needs-water';
      return result;
    }
  }

  result.valid = true;
  result.cost = (path.length * COST_ROAD) + (interior.length * COST_BRIDGE);
  return result;
}

function isBridgeShoreTile(row, col) {
  if (!isInsideMap(row, col)) return false;
  if (mapData[row][col] === WATER) return false;
  if (isBridgeTile(row, col)) return false;
  return [GROUND, DIRT, BEACH, ROAD].includes(mapData[row][col]);
}

function buildBridgePath(scene, bridge) {
  if (!spendBudget(bridge.cost)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return;
  }

  const path = dedupePath(bridge.path);
  path.forEach(({ row, col }, index) => {
    const isInterior = index > 0 && index < path.length - 1;
    const isStart = index === 0;
    const isEnd = index === path.length - 1;
    if (isInterior) {
      const oldType = mapData[row][col];
      roadTileCount++;
      removeTree(scene, row, col);
      removeDebris(scene, row, col);
      removeZoneOverlay(scene, row, col);
      bridgeMap[row][col] = `deck:${bridge.axis}`;
      roadUnderlayMap[row][col] = oldType;
      mapData[row][col] = oldType;
      heightMap[row][col] = 0;
    } else if (isStart || isEnd) {
      const oldType = mapData[row][col];
      if (oldType !== ROAD) roadTileCount++;
      removeTree(scene, row, col);
      removeDebris(scene, row, col);
      removeZoneOverlay(scene, row, col);
      mapData[row][col] = ROAD;
      heightMap[row][col] = 0;
      const towardWater = isStart
        ? getDirectionBetweenTiles(path[index], path[index + 1])
        : getDirectionBetweenTiles(path[index], path[index - 1]);
      bridgeMap[row][col] = `ramp:${towardWater}`;
      roadUnderlayMap[row][col] = oldType;
    } else {
      bridgeMap[row][col] = null;
      roadUnderlayMap[row][col] = null;
    }
  });

  refreshTilesAlongPath(scene, path);
  refreshBridgeSpritesAlongPath(scene, path);
  if (typeof markTrafficNetworkDirty === 'function') markTrafficNetworkDirty(path);
  if (typeof refreshInfrastructureEffects === 'function') refreshInfrastructureEffects(scene);
  if (typeof updateHUD === 'function') updateHUD();
}

function refreshBridgeSpritesAlongPath(scene, path) {
  const touched = new Set();
  path.forEach(({ row, col }) => {
    [
      [row, col],
      [row - 1, col],
      [row, col + 1],
      [row + 1, col],
      [row, col - 1],
    ].forEach(([r, c]) => {
      if (!isInsideMap(r, c)) return;
      const key = getTileId(r, c);
      if (touched.has(key)) return;
      touched.add(key);
      refreshBridgeSprite(scene, r, c);
    });
  });
}

function refreshBridgeSprite(scene, row, col) {
  if (!scene?.bridgeSprites) return;
  const id = getTileId(row, col);
  let existing = scene.bridgeSprites.get(id);
  if (!isBridgeTile(row, col)) {
    if (existing) {
      destroyBridgeSpriteEntry(existing);
      scene.bridgeSprites.delete(id);
    }
    return;
  }

  const key = getBridgeSpriteKey(row, col);
  const pos = isoToScreen(col, row);
  const x = pos.x + scene.offsetX;
  const y = pos.y + scene.offsetY + getBridgeSpriteVisualOffset(row, col, key);
  const depth = getBridgeSpriteDepth(row, col, key, pos.y);

  if (isBridgeRampTile(row, col)) {
    existing = upsertBridgeRampSprite(scene, existing, row, col, key, x, y, pos.y);
    scene.bridgeSprites.set(id, existing);
    sortRenderLayer(scene, 'roadLayer');
    return;
  }

  if (existing && !existing.destroy) {
    destroyBridgeSpriteEntry(existing);
    existing = null;
  }

  if (existing) {
    existing.setTexture(resolveTileTextureKey(key));
    applyTileTextureDisplayScale(existing);
    existing.setPosition(x, y);
    existing.setDepth(depth);
    sortRenderLayer(scene, 'roadLayer');
    return;
  }

  const bridge = scene.add.image(x, y, resolveTileTextureKey(key));
  applyTileTextureDisplayScale(bridge);
  addToRenderLayer(scene, bridge, 'roadLayer');
  bridge.setOrigin(0.5, 1);
  bridge.setDepth(depth);
  bridge.setMask(scene.worldMask);
  scene.bridgeSprites.set(id, bridge);
  sortRenderLayer(scene, 'roadLayer');
}

function refreshAllBridgeSprites(scene) {
  if (!scene?.bridgeSprites) return;
  scene.bridgeSprites.forEach(destroyBridgeSpriteEntry);
  scene.bridgeSprites.clear();
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      refreshBridgeSprite(scene, row, col);
    }
  }
}

function repositionBridgeSprites(scene) {
  if (!scene?.bridgeSprites) return;
  scene.bridgeSprites.forEach((entry, id) => {
    const [row, col] = id.split(':').map(Number);
    if (!isInsideMap(row, col) || !isBridgeTile(row, col)) {
      destroyBridgeSpriteEntry(entry);
      scene.bridgeSprites.delete(id);
      return;
    }
    const key = getBridgeSpriteKey(row, col);
    const pos = isoToScreen(col, row);
    const depth = getBridgeSpriteDepth(row, col, key, pos.y);
    const x = pos.x + scene.offsetX;
    const y = pos.y + scene.offsetY + getBridgeSpriteVisualOffset(row, col, key);
    if (isBridgeRampTile(row, col)) {
      scene.bridgeSprites.set(id, upsertBridgeRampSprite(scene, entry, row, col, key, x, y, pos.y));
      return;
    }
    if (entry && !entry.destroy) {
      destroyBridgeSpriteEntry(entry);
      refreshBridgeSprite(scene, row, col);
      return;
    }
    entry.setTexture(resolveTileTextureKey(key));
    applyTileTextureDisplayScale(entry);
    entry.setPosition(x, y);
    entry.setDepth(depth);
  });
  sortRenderLayer(scene, 'roadLayer');
}

function upsertBridgeRampSprite(scene, existing, row, col, key, x, y, baseY) {
  const sourceKey = resolveTileTextureKey(key);
  const visualDirection = getBridgeRampVisualDirection(row, col);
  const shouldUseSurface = shouldBridgeRampUseSurfaceOverlay(row, col);
  const surfaceKey = shouldUseSurface
    ? getBridgeRampSurfaceTextureKey(scene, key, visualDirection)
    : null;
  const bodyDepth = getBridgeRampBodyDepth(row, col, key, baseY);
  const surfaceDepth = getBridgeSpriteDepth(row, col, key, baseY);

  if (existing?.body) {
    existing.body.setTexture(sourceKey);
    applyTileTextureDisplayScale(existing.body);
    existing.body.setPosition(x, y);
    existing.body.setDepth(bodyDepth);
    if (surfaceKey) {
      if (!existing.top) {
        existing.top = scene.add.image(x, y, surfaceKey);
        addToRenderLayer(scene, existing.top, 'roadLayer');
        existing.top.setOrigin(0.5, 1);
        existing.top.setMask(scene.worldMask);
      }
      existing.top.setTexture(surfaceKey);
      applyTileTextureDisplayScale(existing.top);
      existing.top.setPosition(x, y);
      existing.top.setDepth(surfaceDepth);
    } else if (existing.top) {
      existing.top.destroy();
      existing.top = null;
    }
    return existing;
  }

  if (existing) destroyBridgeSpriteEntry(existing);

  const body = scene.add.image(x, y, sourceKey);
  applyTileTextureDisplayScale(body);
  addToRenderLayer(scene, body, 'terrainLayer');
  body.setOrigin(0.5, 1);
  body.setDepth(bodyDepth);
  body.setMask(scene.worldMask);

  let top = null;
  if (surfaceKey) {
    top = scene.add.image(x, y, surfaceKey);
    applyTileTextureDisplayScale(top);
    addToRenderLayer(scene, top, 'roadLayer');
    top.setOrigin(0.5, 1);
    top.setDepth(surfaceDepth);
    top.setMask(scene.worldMask);
  }

  return { body, top };
}

function getBridgeSpriteKey(row, col) {
  return rotateTileKey(getRoadKey(row, col), mapRotation);
}

function getBridgeRampDirection(row, col) {
  return normalizeBridgeMapValue(bridgeMap?.[row]?.[col])?.match(/^ramp:([nesw])$/)?.[1] ?? null;
}

function getBridgeRampVisualDirection(row, col) {
  const direction = getBridgeRampDirection(row, col);
  return direction ? rotateDirection(direction, mapRotation) : 'n';
}

function shouldBridgeRampUseSurfaceOverlay(row, col) {
  const direction = getBridgeRampDirection(row, col);
  if (!direction) return false;
  const deckTile = getNeighborTileInDirection(row, col, direction);
  if (!deckTile || !isBridgeDeckTile(deckTile.row, deckTile.col)) return false;
  const rampPos = isoToScreen(col, row);
  const deckPos = isoToScreen(deckTile.col, deckTile.row);
  return rampPos.y > deckPos.y;
}

function getNeighborTileInDirection(row, col, direction) {
  if (direction === 'n') return { row: row - 1, col };
  if (direction === 'e') return { row, col: col + 1 };
  if (direction === 's') return { row: row + 1, col };
  if (direction === 'w') return { row, col: col - 1 };
  return null;
}

function getBridgeSpriteVisualOffset(row, col, key) {
  if (isBridgeDeckTile(row, col)) return getBridgeDeckVisualOffset(row, col, key);
  return getTerrainTileVisualOffset(row, col, key);
}

function getBridgeSpriteDepth(row, col, key, baseY = isoToScreen(col, row).y) {
  return getRoadTileDepth(row, col, key, baseY) + BRIDGE_SPRITE_DEPTH_BOOST;
}

function getBridgeRampBodyDepth(row, col, key, baseY = isoToScreen(col, row).y) {
  return getTerrainTileDepth(row, col, key, baseY) + BRIDGE_RAMP_BODY_DEPTH_OFFSET;
}

function destroyBridgeSpriteEntry(entry) {
  if (!entry) return;
  if (entry.destroy) {
    entry.destroy();
    return;
  }
  entry.body?.destroy();
  entry.side?.destroy();
  entry.top?.destroy();
}

// Runs per tile on hot paths, so it only accepts canonical values; older save
// spellings are folded in once at load by normalizeSavedBridgeMapValue (save.js).
function normalizeBridgeMapValue(value) {
  if (value === 'row' || value === 'col') return `deck:${value}`;
  if (value === 'deck:row' || value === 'deck:col') return value;
  if (typeof value === 'string' && /^ramp:[nesw]$/.test(value)) return value;
  return null;
}

function getBridgeErrorMessage(reason) {
  if (reason === 'bridge-flat-shores') return t('toast.bridgeNeedsFlatShores');
  if (reason === 'bridge-two-shores') return t('toast.bridgeNeedsTwoShores');
  if (reason === 'bridge-needs-water') return t('toast.bridgeNeedsWater');
  if (reason === 'bridge-blocked') return t('toast.bridgeBlocked');
  return t('toast.bridgeInvalid');
}

function resetBridgeLayers() {
  bridgeMap = createFilledMap(null);
  roadUnderlayMap = createFilledMap(null);
}

function getBridgeDeckVisualOffset(row, col, key) {
  return getTerrainTileVisualOffset(row, col, key) - BRIDGE_DECK_VISUAL_LIFT;
}

function getBridgeUnderlayTileType(row, col) {
  const underlay = roadUnderlayMap?.[row]?.[col];
  if ([GROUND, DIRT, BEACH, WATER, HILL].includes(underlay)) return underlay;
  if (underlay === ROAD) return getTileHeight(row, col) > 0 ? HILL : GROUND;
  return isBridgeDeckTile(row, col) ? WATER : GROUND;
}
