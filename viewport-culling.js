// Viewport culling: which terrain tiles and sprites are inside the padded camera view,
// so a dense city only keeps on-screen objects active. Split out of main.js.

function getCameraWorldViewRect(camera) {
  const zoom = Math.max(0.0001, Number(camera?.zoom) || 1);
  const width = Math.max(0, Number(camera?.width) || 0) / zoom;
  const height = Math.max(0, Number(camera?.height) || 0) / zoom;
  const originX = Number.isFinite(camera?.originX) ? camera.originX : 0.5;
  const originY = Number.isFinite(camera?.originY) ? camera.originY : 0.5;
  return {
    x: (Number(camera?.scrollX) || 0) + (Number(camera?.width) || 0) * originX - width * originX,
    y: (Number(camera?.scrollY) || 0) + (Number(camera?.height) || 0) * originY - height * originY,
    width,
    height,
  };
}

function setTerrainSpriteViewportActive(tile, active, scene = null) {
  if (!tile) return;
  if (active) {
    if (!tile.displayList && typeof tile.addToDisplayList === 'function') {
      tile.addToDisplayList();
    }
    tile.setVisible?.(true);
    if (scene && typeof syncVehicleTrackerObjectCameraFilters === 'function') {
      syncVehicleTrackerObjectCameraFilters(scene, tile);
    }
    return;
  }
  tile.setVisible?.(false);
  if (tile.displayList && typeof tile.removeFromDisplayList === 'function') {
    tile.removeFromDisplayList();
  }
}

function getTerrainViewportLogicalRange(scene, bounds) {
  const corners = [
    worldToLogicalPoint(scene, bounds.minX, bounds.minY),
    worldToLogicalPoint(scene, bounds.maxX, bounds.minY),
    worldToLogicalPoint(scene, bounds.minX, bounds.maxY),
    worldToLogicalPoint(scene, bounds.maxX, bounds.maxY),
  ];
  const cols = corners.map((point) => Number(point?.x)).filter(Number.isFinite);
  const rows = corners.map((point) => Number(point?.y)).filter(Number.isFinite);
  if (!cols.length || !rows.length) {
    return { minRow: 0, maxRow: MAP_HEIGHT - 1, minCol: 0, maxCol: MAP_WIDTH - 1 };
  }
  // The corner conversion encloses tile anchors. Keep a small logical margin
  // for tall hill faces and antialiased edges before applying the exact world
  // bounds test below.
  const margin = 3;
  return {
    minRow: Math.max(0, Math.floor(Math.min(...rows)) - margin),
    maxRow: Math.min(MAP_HEIGHT - 1, Math.ceil(Math.max(...rows)) + margin),
    minCol: Math.max(0, Math.floor(Math.min(...cols)) - margin),
    maxCol: Math.min(MAP_WIDTH - 1, Math.ceil(Math.max(...cols)) + margin),
  };
}

function getActiveWorldViewportCameras(scene) {
  const cameras = [scene?.cameras?.main];
  if (typeof getVehicleTrackerCullCameras === 'function') {
    cameras.push(...getVehicleTrackerCullCameras(scene));
  }
  return cameras.filter((camera, index, list) => camera && list.indexOf(camera) === index);
}

function getPaddedWorldViewportBounds(camera, padX, padY) {
  const view = getCameraWorldViewRect(camera);
  return {
    view,
    minX: view.x - padX,
    maxX: view.x + view.width + padX,
    minY: view.y - padY,
    maxY: view.y + view.height + padY,
  };
}

function updateTerrainViewportCulling(scene, force = false) {
  const camera = scene?.cameras?.main;
  if (
    !camera
    || !scene?.tileSprites?.length
    || (scene.scene?.isVisible && !scene.scene.isVisible())
  ) {
    return;
  }

  // Phaser's cached camera.worldView can lag behind direct scrollX/scrollY
  // changes until pre-render. Derive views from live camera properties. The
  // active set is a union of small per-camera regions, never one giant box
  // spanning the (possibly distant) main and tracker cameras.
  const viewportCameras = getActiveWorldViewportCameras(scene);
  const views = viewportCameras.map(getCameraWorldViewRect);
  const cacheKey = views.map((view) => [
    Math.floor(view.x / TILE_WIDTH),
    Math.floor(view.y / TILE_IMAGE_HEIGHT),
    Math.ceil((view.x + view.width) / TILE_WIDTH),
    Math.ceil((view.y + view.height) / TILE_IMAGE_HEIGHT),
  ].join(':')).join('|');
  if (!force && scene.terrainViewportCacheKey === cacheKey) return;
  scene.terrainViewportCacheKey = cacheKey;
  const cullStartedAt = performance.now();

  const padX = TILE_WIDTH * 2;
  const padY = TILE_IMAGE_HEIGHT + MAX_TERRAIN_HEIGHT * HEIGHT_STEP_PIXELS + TILE_HEIGHT;
  const terrainBounds = viewportCameras.map((entry) => (
    getPaddedWorldViewportBounds(entry, padX, padY)
  ));

  if (!(scene.activeTerrainSpriteIds instanceof Set)) {
    scene.activeTerrainSpriteIds = new Set();
    // One initialization pass removes the full 256x256 terrain grid from the
    // Scene Display List. Later frames only add the small camera-local set, so
    // Phaser no longer traverses tens of thousands of invisible Images.
    for (const row of scene.tileSprites) {
      for (const tile of row) setTerrainSpriteViewportActive(tile, false, scene);
    }
  }

  const nextActiveTerrainIds = new Set();
  let terrainCandidates = 0;
  const seenTerrainCandidates = new Set();
  for (const bounds of terrainBounds) {
    const logicalRange = getTerrainViewportLogicalRange(scene, bounds);
    for (let row = logicalRange.minRow; row <= logicalRange.maxRow; row++) {
      for (let col = logicalRange.minCol; col <= logicalRange.maxCol; col++) {
        const id = row * MAP_WIDTH + col;
        if (!seenTerrainCandidates.has(id)) {
          seenTerrainCandidates.add(id);
          terrainCandidates++;
        }
        const tile = scene.tileSprites[row]?.[col];
        if (!tile) continue;
        if (
          tile.x >= bounds.minX
          && tile.x <= bounds.maxX
          && tile.y >= bounds.minY
          && tile.y <= bounds.maxY
        ) {
          nextActiveTerrainIds.add(id);
        }
      }
    }
  }

  let terrainEntered = 0;
  let terrainExited = 0;
  const mainTerrainBounds = terrainBounds[0];
  for (const id of nextActiveTerrainIds) {
    const row = Math.floor(id / MAP_WIDTH);
    const col = id % MAP_WIDTH;
    const tile = scene.tileSprites[row]?.[col];
    if (!tile || !mainTerrainBounds) continue;
    if (isPointWithinCullBounds(tile.x, tile.y, mainTerrainBounds)) {
      tile.cameraFilter &= ~camera.id;
    } else {
      tile.cameraFilter |= camera.id;
    }
  }
  for (const id of scene.activeTerrainSpriteIds) {
    if (nextActiveTerrainIds.has(id)) continue;
    const row = Math.floor(id / MAP_WIDTH);
    const col = id % MAP_WIDTH;
    setTerrainSpriteViewportActive(scene.tileSprites[row]?.[col], false, scene);
    terrainExited++;
  }
  for (const id of nextActiveTerrainIds) {
    if (scene.activeTerrainSpriteIds.has(id)) continue;
    const row = Math.floor(id / MAP_WIDTH);
    const col = id % MAP_WIDTH;
    setTerrainSpriteViewportActive(scene.tileSprites[row]?.[col], true, scene);
    terrainEntered++;
  }
  scene.activeTerrainSpriteIds = nextActiveTerrainIds;
  if (terrainEntered > 0) scene.children?.queueDepthSort?.();

  // Buildings/trees/overlays get a much more generous pad than terrain tiles:
  // a building's Map entry is keyed by its anchor tile only, but footprints up
  // to 5x5 (see model-catalog.js) and multi-story sprites can still paint well
  // inside the viewport even when their anchor sits just outside it.
  const spritePadX = TILE_WIDTH * 6;
  const spritePadY = TILE_IMAGE_HEIGHT * 6 + MAX_TERRAIN_HEIGHT * HEIGHT_STEP_PIXELS + TILE_HEIGHT * 4;
  const spriteBounds = viewportCameras.map((entry) => (
    getPaddedWorldViewportBounds(entry, spritePadX, spritePadY)
  ));
  const spriteStats = updateSpriteViewportCulling(scene, spriteBounds);
  scene.viewportCullStats = {
    passes: (scene.viewportCullStats?.passes ?? 0) + 1,
    lastDurationMs: performance.now() - cullStartedAt,
    terrainCandidates,
    activeTerrain: nextActiveTerrainIds.size,
    terrainEntered,
    terrainExited,
    spriteCandidates: spriteStats.candidates,
    visibleSprites: spriteStats.visible,
  };
}

function isPointWithinCullBounds(x, y, bounds) {
  const allBounds = Array.isArray(bounds) ? bounds : [bounds];
  return allBounds.some((entry) => (
    x >= entry.minX && x <= entry.maxX && y >= entry.minY && y <= entry.maxY
  ));
}

function cullSpriteMapEntries(map, bounds, seen = null, mainCamera = null, mainBounds = null) {
  const stats = { candidates: 0, visible: 0 };
  if (!map || !map.size) return stats;
  const apply = (sprite) => {
    if (!sprite || (seen && seen.has(sprite))) return;
    if (seen) seen.add(sprite);
    if (typeof sprite.setVisible !== 'function') return;
    stats.candidates++;
    const visible = isPointWithinCullBounds(sprite.x, sprite.y, bounds);
    sprite.setVisible(visible);
    if (visible) {
      stats.visible++;
      if (sprite.__nightTintDirty && typeof applyDeferredNightTint === 'function') applyDeferredNightTint(sprite);
      if (mainCamera && mainBounds) {
        if (isPointWithinCullBounds(sprite.x, sprite.y, mainBounds)) {
          sprite.cameraFilter &= ~mainCamera.id;
        } else {
          sprite.cameraFilter |= mainCamera.id;
        }
      }
    }
  };
  for (const value of map.values()) {
    if (!value) continue;
    if (Array.isArray(value)) {
      // treeSprites stores one entry per tile as an array of sub-sprites.
      for (const sprite of value) apply(sprite);
    } else if (typeof value.setVisible === 'function') {
      apply(value);
    } else if (value.sprite && typeof value.sprite.setVisible === 'function') {
      // a typhoon shelter record ({ sprite, drawable }): culled only once it can be drawn
      // (a hidden one - a 魚檔's crate pile while the quay is empty - stays out of sight)
      if (value.hidden) { if (value.sprite.visible) value.sprite.setVisible(false); } else if (value.drawable !== false) apply(value.sprite);
    } else if (value.body || value.top) {
      // Bridge ramp entries are a plain { body, top } pair of images rather
      // than a single game object (see upsertBridgeRampSprite).
      apply(value.body);
      apply(value.side);
      apply(value.top);
    }
  }
  return stats;
}

function updateSpriteViewportCulling(scene, bounds) {
  // A multi-tile building is registered under buildingSprites once per
  // footprint tile it occupies, all pointing at the same sprite object -
  // dedupe so a 5x5 landmark isn't visibility-tested 25 times per pass.
  const seen = new Set();
  const totals = { candidates: 0, visible: 0 };
  const collect = (stats) => {
    totals.candidates += stats.candidates;
    totals.visible += stats.visible;
  };
  const mainCamera = scene?.cameras?.main;
  const mainBounds = Array.isArray(bounds) ? bounds[0] : bounds;
  collect(cullSpriteMapEntries(scene.buildingSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.treeSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.debrisSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.busStopSprites, bounds, seen, mainCamera, mainBounds));
  // Lamp posts and signal poles: hidden in daylight when zoomed far out (ROAD_POLE_MIN_ZOOM),
  // kept after dark and while either calibrator is open.
  const polesShown = (Number(mainCamera?.zoom) || 1) >= (typeof ROAD_POLE_MIN_ZOOM === 'number' ? ROAD_POLE_MIN_ZOOM : 0.7)
    || !!scene.streetLampsLit
    || (typeof isStreetLampCalibrationActive === 'function' && isStreetLampCalibrationActive())
    || (typeof isTrafficSignalCalibrationActive === 'function' && isTrafficSignalCalibrationActive());
  [scene.trafficSignalSprites, scene.streetLampSprites].forEach((map) => {
    if (polesShown) {
      collect(cullSpriteMapEntries(map, bounds, seen, mainCamera, mainBounds));
      return;
    }
    map?.forEach((sprite) => {
      if (sprite?.visible && typeof sprite.setVisible === 'function') sprite.setVisible(false);
    });
  });
  collect(cullSpriteMapEntries(scene.bridgeParapetSprites, bounds, seen, mainCamera, mainBounds));
  // Small street props only draw once zoomed in far enough to read (SMALL_STREET_PROP_MIN_ZOOM).
  const smallPropMinZoom = typeof SMALL_STREET_PROP_MIN_ZOOM === 'number' ? SMALL_STREET_PROP_MIN_ZOOM : 1.2;
  // ...or while their calibrator is open, so they can be picked at any zoom.
  const smallPropsShown = (Number(mainCamera?.zoom) || 1) >= smallPropMinZoom
    || (typeof isPedestrianRailingCalibrationActive === 'function' && isPedestrianRailingCalibrationActive())
    || (typeof isStreetFurnitureCalibrationActive === 'function' && isStreetFurnitureCalibrationActive());
  [scene.pedestrianRailingSprites, scene.streetFurnitureSprites].forEach((map) => {
    if (smallPropsShown) {
      collect(cullSpriteMapEntries(map, bounds, seen, mainCamera, mainBounds));
      return;
    }
    map?.forEach((sprite) => {
      if (sprite?.visible && typeof sprite.setVisible === 'function') sprite.setVisible(false);
    });
  });
  collect(cullSpriteMapEntries(scene.zoneOverlays, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.powerLineSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.bridgeSprites, bounds, seen, mainCamera, mainBounds));
  collect(cullSpriteMapEntries(scene.districtSignSprites, bounds, seen, mainCamera, mainBounds));
  // 避風塘 works and props: each is a texture of its own between the buildings, so drawing one off
  // screen still splits the sprite batch (and on ANGLE/Metal each split stalls) - cull them like
  // the buildings. The boats move every frame and cull themselves (typhoon-shelter-fleet.js).
  collect(cullSpriteMapEntries(scene.typhoonShelterObjects, bounds, seen, mainCamera, mainBounds));
  return totals;
}
