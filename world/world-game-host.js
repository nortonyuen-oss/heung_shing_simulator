/* The territory is a map backend of the original game, in the original Phaser Scene.
 * Original domain writers, calendar, economy, public services and transport remain canonical.
 * Immutable terrain is streamed; mutable original-game layers own only written cells.
 */
function isWorldGameActive() { return globalThis.__worldGameHost?.enabled === true; }
function shouldRenderWorldTile(row, col) {
  if (!isWorldGameActive()) return true;
  const host = globalThis.__worldGameHost; if (!host.manager) return false;
  return host.manager.records.get(`r:${Math.floor(col / 32)}:${Math.floor(row / 32)}`)?.state === 'ACTIVE';
}
function createWorldGameGrid(value) { return HeungShingWorld.createSparseGameGrid(MAP_WIDTH, MAP_HEIGHT, value); }
function* iterateGameTiles(bounds = null, extra = null) {
  if (isWorldGameActive()) {
    yield* globalThis.__worldGameHost.simulationTiles(extra); return;
  }
  const b = bounds || { rowStart: 0, colStart: 0, rowCount: MAP_HEIGHT, colCount: MAP_WIDTH };
  for (let row = b.rowStart; row < b.rowStart + b.rowCount; row++)
    for (let col = b.colStart; col < b.colStart + b.colCount; col++) yield { row, col };
}

class WorldGameBuildingSprites extends Map {
  constructor(host) { super(); this.host = host; }
  has(id) { return super.has(id) || this.host.buildingAt(id) != null; }
  get(id) {
    let sprite = super.get(id);
    if (!sprite && this.host.enabled && !this.host.mountingBuilding) {
      const anchor = this.host.buildingAt(id);
      if (anchor) { const [row,col]=anchor.split(':').map(Number); if(shouldRenderWorldTile(row,col))this.host.mountBuilding(anchor); }
      sprite = super.get(id);
    }
    return sprite;
  }
}

class WorldGameHost {
  constructor(scene) {
    this.chunkTable = new HeungShingWorld.WorldChunkSummaryTable(); this.diagnostics = new HeungShingWorld.WorldDiagnostics();
    this.scene = scene; this.enabled = false; this.ready = false; this.buildingVersion = 0;
    this.indexVersion = -1; this.footprints = new Map(); this.buildingChunks = new Map();
    this.stateVersion = 0; this.roadVersion = 0; this.roadIndexVersion = -1; this.roadChunks = new Map();
    this.modifiedStorageChunks = new Set(); this.pendingTerrain = new Map(); this.lastVisualKey = ''; this.lastAutosave = performance.now();
  }
  asset(file) {
    const url = new URL(file, new URL('/data/world-terrain/', location.href));
    return globalThis.HEUNG_SHING_WORLD_ASSETS?.[url.pathname] || url.href;
  }
  async prepare(launch) {
    const api = HeungShingWorld, response = await fetch(this.asset('manifest.json'));
    if (!response.ok) throw new Error('未能載入香港全境地形。');
    this.launch = launch;
    this.manifest = await response.json(); this.world = api.createWorldConfig(this.manifest.world);
    this.provider = new api.WorldTerrainProvider(this.manifest, { fetchBytes: async file => {
      const response = await fetch(this.asset(file)); if (!response.ok) throw new Error(`地形讀取失敗 (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    } });
    this.delta = new api.WorldDeltaStore(this.world);
    this.session = new api.WorldSaveSession({ delta: this.delta, storage: HeungShingStorage, id: launch.slot,
      captureView: () => this.ready ? this.viewpoint() : null,
      onStatus: status => { if (status.kind === 'error') showToast(status.error, 'danger'); } });
    await this.session.load();
    if (!launch.fresh && !this.session.storageRevision) throw new Error('找不到這份香港全境存檔。');
    if (launch.fresh && !this.session.storageRevision) {
      this.delta.header.city = { name: launch.name, budget: STARTING_BUDGET, startYear: launch.startYear };
    }
    const scene = this.scene;
    if (!scene.textures.exists('world-terrain')) scene.load.atlas('world-terrain', this.asset(this.manifest.art.image), this.asset(this.manifest.art.atlas));
    this.manifest.lod.forEach((view, index) => { if (!scene.textures.exists(`world-lod-${index}`)) scene.load.image(`world-lod-${index}`, this.asset(view.url)); });
    // The compiled adapter is verified with the immutable manifest on release builds.
    if (!api.createLegacyTerrainVisuals) await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = this.asset('legacy-terrain-adapter.js');
      script.integrity = `sha256-${btoa(String.fromCharCode(...this.manifest.adapterSha256.match(/../g).map(hex => parseInt(hex, 16))))}`;
      script.onload = resolve; script.onerror = () => reject(new Error('地形版本未能載入。')); document.head.appendChild(script);
    });
    if (scene.load.list.size || scene.load.isLoading()) await new Promise((resolve, reject) => {
      const fail = file => { scene.load.off('complete', done); reject(new Error(`未能載入地圖素材：${file.key}`)); };
      const done = () => { scene.load.off('loaderror', fail); resolve(); };
      scene.load.once('complete', done); scene.load.once('loaderror', fail); if (!scene.load.isLoading()) scene.load.start();
    });
  }
  activate() {
    const scene = this.scene, api = HeungShingWorld, saved = this.delta.header.game;
    leaveAttractMode('newgame'); stopSimTimer(); flushCitySimulationPulses();
    clearTrafficVisuals(scene); clearTransportVisuals(scene); clearVesselVisuals(scene); clearAircraftVisuals(scene);
    clearAllOverlays(scene); clearBuildings(scene);
    scene.tileSprites.forEach(sprite => sprite.destroy()); scene.tileSprites.clear();
    this.enabled = true; globalThis.__worldGameHost = this;
    setMapDimensions(this.world.width, this.world.height); resetGameState();
    isTerrainCreatorMode = false; setTerrainEditorUiActive(false);
    currentTerrainMetadata = { profileType: 'hong-kong-full', seed: this.world.id, features: [] };
    currentSeed = saved?.seed || this.world.id;
    mapData = api.createSparseGameGrid(MAP_WIDTH, MAP_HEIGHT, (row, col) => this.baseTile(row, col).terrainType, (row, col) => { this.rememberSurface(row,col); this.roadVersion++; this.invalidate(row, col); });
    heightMap = api.createSparseGameGrid(MAP_WIDTH, MAP_HEIGHT, (row, col) => this.baseTile(row, col).height, (row, col) => this.invalidate(row, col));
    zoneMap = api.createSparseGameGrid(MAP_WIDTH, MAP_HEIGHT, ZONE_NONE, (row, col) => { this.rememberSurface(row, col); this.stateVersion++; this.lastVisualKey = ''; this.queueAutosave(); });
    scene.buildingSprites = new WorldGameBuildingSprites(this);
    if (saved) this.restoreGame(saved); else this.migratePrototype();
    city.name = saved?.city.name || this.delta.header.city.name;
    if (!saved) { city.nameEn = ''; city.plateColor = 0; city.budget = this.delta.header.city.budget; city.year = this.delta.header.city.startYear || 1900; setRoadTileSet(this.launch.roadTileSetId || ROAD_TILE_SET_DEFAULT_ID, { refresh: false }); setExpansionEnabled('transport', this.launch.transportExpansion === true, { notify: false, autosave: false }); }
    normalizeCityFinanceState();
    updateMapMetrics(scene); drawWorldMask(scene);
    this.adapter = new api.WorldModeAdapter(this.world, api.createLegacyWorldProjection(this.world));
    this.visuals = api.createLegacyTerrainVisuals(this.world);
    this.adapter.setRotation(mapRotation);
    this.renderer = new api.WorldChunkRenderer({ scene, adapter: this.adapter, visuals: this.visuals });
    const provider = { getRenderChunk: async id => {
      const data = await this.provider.getRenderChunk(id);
      const bounds=data.bounds;let modified=false;
      for(let y=Math.max(0,Math.floor((bounds.row-1)/64));y<=Math.floor(Math.min(MAP_HEIGHT-1,bounds.row+bounds.height)/64);y++)
        for(let x=Math.max(0,Math.floor((bounds.col-1)/64));x<=Math.floor(Math.min(MAP_WIDTH-1,bounds.col+bounds.width)/64);x++)
          if(this.modifiedStorageChunks.has(`s:${x}:${y}`)||this.delta.chunks.has(`s:${x}:${y}`))modified=true;
      if(!modified)return data;
      const terrainCells=mapData.sparseCells,heightCells=heightMap.sparseCells,hasOldDelta=this.delta.chunks.size>0;
      return { ...data, sample: (col, row) => {
        const base = (hasOldDelta&&this.delta.terrainAt(col,row)) || data.sample(col, row);
        const id = `${row}:${col}`;
        const type = terrainCells.get(id), height = heightCells.get(id) ?? base.height;
        // Roads and buildings draw with the original game renderer above the base.
        return { ...base, height, terrainType: type === ROAD || type === undefined ? base.terrainType : type };
      } };
    } };
    this.manager = new api.WorldChunkManager({ world: this.world, provider, renderer: this.renderer,
      region: { col: 0, row: 0, width: MAP_WIDTH, height: MAP_HEIGHT },
      onEvent: event => { this.diagnostics.event(event); if (event.type === 'CHUNK_ERROR') console.warn('[World]', event); } });
    this.lod = new api.WorldLod(scene, this.manifest.lod); this.lod.image.setDepth(-1); this.lod.setRotation(mapRotation);
    this.regionalLod = new api.WorldRegionalLod({ scene, adapter: this.adapter,
      lod: this.manifest.regionalLod || this.manifest.localLod, resolveAsset: file => this.asset(file) });
    this.ready = true;
    const view = this.initialViewpoint();
    mapRotation = view.rotation; this.rotate(mapRotation); drawWorldMask(scene);
    scene.cameras.main.setZoom(view.zoom); this.adapter.centreCamera(scene.cameras.main, view.col, view.row);
    invalidateZoneGrowthTileCache(); markPowerGridDirty(); markServiceCoverageDirty(); markTrafficNetworkDirty();
    beginNewCitySaveSession(); updateHUD(); updateMapNavigationControls();
    resetGameClockAccumulator(); setGameSpeed(GAME_SPEEDS.SLOW); startSimTimer(); hideLandingScreen();
    this.update(performance.now(), 0); drawCityMinimap();
    this.timer = setInterval(() => { if (this.enabled && !isAttractModeActive()) this.save(true); }, 15000);
    history.replaceState(null, '', `/?world=1&slot=${encodeURIComponent(this.session.id)}`);
  }
  initialViewpoint() {
    // Opening the full territory must show the same geography as the original
    // game, rather than silently moving the camera to the streaming trial area.
    const start = getHkTerritoryDefaultStart();
    return this.delta.header.viewpoint || { col: start.startCol, row: start.startRow, rotation: 0, zoom: .8 };
  }
  baseTile(row, col) {
    const edit = this.delta.terrainAt(col, row); if (edit) return edit;
    const id = `s:${Math.floor(col / 64)}:${Math.floor(row / 64)}`, bytes = this.provider.cache.get(id);
    if (bytes) { const entry = this.manifest.chunks[id], at = ((row % 64) * entry.width + col % 64) * 3; return { terrainType: bytes[at + 1], height: bytes[at + 2] }; }
    // Unloaded land is unavailable to input. Offscreen developed cells retain their
    // original terrain/height in sparse layers, so gameplay never depends on an Image.
    return { terrainType: 0, height: 0 };
  }
  hasTerrainTile(row,col) { const id=`${row}:${col}`;return this.baseTile(row,col).terrainType>0 || (mapData.sparseCells?.get(id)>0 && heightMap.sparseCells?.has(id)); }
  restoreGame(game) {
    const api = HeungShingWorld;
    Object.assign(city, game.city);
    for (const [name, grid] of Object.entries({ mapData, heightMap, zoneMap, zoneDensityMap })) api.restoreSparseGameGrid(grid, game.layers[name]);
    for (const [id, value] of Object.entries(game.buildingData)) buildingData[id] = value;
    bridgeMap = new Map(game.bridgeMap); roadUnderlayMap = new Map(game.roadUnderlayMap);
    treeMap = new Map(game.treeMap); debrisMap = new Map(game.debrisMap); busStopMap = new Map(game.busStopMap);
    powerSources = new Set(game.powerSources); powerLineSet = new Set(game.powerLineSet); lowDensityLockSet = new Set(game.lowDensityLockSet);
    roadTileCount = game.roadTileCount || 0; restoreExpansionState(game.expansions);
    if (game.roadTileSetId) setRoadTileSet(game.roadTileSetId, { refresh: false });
  }
  migratePrototype() {
    for (const chunk of this.delta.chunks.values()) {
      for (const value of chunk.terrain.values()) { mapData[value.row][value.col] = value.terrainType; heightMap[value.row][value.col] = value.height; }
      for (const value of chunk.roads.values()) { mapData[value.row][value.col] = ROAD; heightMap[value.row][value.col] = value.height || 0; roadTileCount++; }
      for (const value of chunk.zones.values()) { zoneMap[value.row][value.col] = value.type; zoneDensityMap[value.row][value.col] = value.density; }
    }
    // Preserve the Phase 2–5 building models using their original catalog records.
    for (const entity of this.delta.entities.values()) {
      if (entity.kind === 'building') {
        const type = entity.modelId === 'market2' ? 'public_market' : 'park_large';
        const catalog = typeof SPECIAL_BUILDING_MODELS !== 'undefined' ? SPECIAL_BUILDING_MODELS[type] : null;
        const model = catalog || (type === 'park_large' ? PARK_MODELS.park_flagship_victoria : null);
        buildingData[getTileId(entity.row, entity.col)] = { type, population: 0, level: 1, age: 0,
          footprintCols: entity.width, footprintRows: entity.height,
          ...(model || {}), spriteKey: model?.spriteKey || (entity.modelId === 'market2' ? 'public_market' : 'park_large') };
      } else if (entity.kind === 'rail') {
        const metro = getMetroState(); metro.tracks = addRailPathBits(metro.tracks || {}, entity.cells);
        for (const cell of entity.cells) { this.rememberSurface(cell.row, cell.col); if (entity.elevation > 0) { metro.trackElev ||= {}; metro.trackElev[getTileId(cell.row, cell.col)] = String(entity.elevation); } }
      } else if (entity.kind === 'bridge') for (const cell of entity.cells) {
        const id = getTileId(cell.row, cell.col); mapData[cell.row][cell.col] = ROAD;
        roadUnderlayMap.set(id, WATER); bridgeMap.set(id, `deck:${entity.cells.length > 1 && entity.cells[0].row === entity.cells[1].row ? 'col' : 'row'}`); heightMap[cell.row][cell.col] = entity.elevation; roadTileCount++;
      }
    }
    // The prototype's custom route/ledger data remain in the snapshot for rollback/export.
  }
  rememberSurface(row, col) {
    if (!this.enabled || !mapData?.sparseCells) return;
    this.modifiedStorageChunks.add(HeungShingWorld.WorldSaveFormat.storageId(col,row));
    const id = `${row}:${col}`, base = this.baseTile(row, col);
    if (base.terrainType && !mapData.sparseCells.has(id)) mapData.sparseCells.set(id, base.terrainType);
    if (base.terrainType && !heightMap.sparseCells.has(id)) heightMap.sparseCells.set(id, base.height);
  }
  buildingChanged() {
    this.buildingVersion++; this.stateVersion++; this.lastVisualKey = ''; this.queueAutosave();
  }
  indexBuildings() {
    if (this.indexVersion === this.buildingVersion) return;
    this.footprints.clear(); this.buildingChunks.clear();
    for (const [id, record] of Object.entries(buildingData)) {
      const [row, col] = id.split(':').map(Number), w = record.footprintCols || 1, h = record.footprintRows || 1;
      for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) { this.footprints.set(`${r}:${c}`, id); this.rememberSurface(r, c); }
      // An overhang halo keeps tall models visible across chunk boundaries.
      for (let r = Math.max(0, Math.floor((row - 16) / 32)); r <= Math.floor((row + h + 16) / 32); r++)
        for (let c = Math.max(0, Math.floor((col - 16) / 32)); c <= Math.floor((col + w + 16) / 32); c++) {
          const key = `r:${c}:${r}`; if (!this.buildingChunks.has(key)) this.buildingChunks.set(key, new Set()); this.buildingChunks.get(key).add(id);
        }
    }
    this.indexVersion = this.buildingVersion;
  }
  buildingAt(id) { this.indexBuildings(); return this.footprints.get(id); }
  mountBuilding(id) {
    if (Map.prototype.has.call(this.scene.buildingSprites, id)) return;
    const record = buildingData[id]; if (!record) return;
    const [row, col] = id.split(':').map(Number); this.mountingBuilding = true;
    try { const key = deriveLoadedSpriteKey(record); placeSpriteBuilding(this.scene, row, col, key, normalizeLoadedBuildingOptions(key, record)); }
    finally { this.mountingBuilding = false; }
  }
  *visibleRoadTiles() {
    if (this.roadIndexVersion !== this.roadVersion) {
      this.roadChunks.clear();
      for (const [id, type] of mapData.sparseCells) {
        if(type!==ROAD)continue; const [row,col]=id.split(':').map(Number), key=`r:${Math.floor(col/32)}:${Math.floor(row/32)}`;
        if(!this.roadChunks.has(key))this.roadChunks.set(key,[]);this.roadChunks.get(key).push({row,col});
      }
      this.roadIndexVersion=this.roadVersion;
    }
    for(const id of this.manager?.snapshot().activeIds||[]) yield* this.roadChunks.get(id)||[];
  }
  visualAreaKey() { const b=this.activeBounds();return `${b.rowStart}:${b.colStart}:${mapRotation}`; }
  yulanRuralTiles(scene) {
    const view=getCameraWorldViewRect(scene.cameras.main), bounds=getTerrainViewportLogicalRange(scene,{minX:view.x,maxX:view.x+view.width,minY:view.y,maxY:view.y+view.height});
    const tiles=[],radius=YULAN_WANDER_CLEAR;
    for(let row=bounds.minRow;row<=bounds.maxRow;row++) for(let col=bounds.minCol;col<=bounds.maxCol;col++) {
      if(!shouldRenderWorldTile(row,col)||![GROUND,DIRT,HILL].includes(mapData[row][col]))continue;
      let blocked=false;
      for(let r=row-radius;r<=row+radius&&!blocked;r++)for(let c=col-radius;c<=col+radius;c++) {
        if(!isInsideMap(r,c)||mapData[r][c]===ROAD||zoneMap[r][c]!==ZONE_NONE||this.buildingAt(getTileId(r,c))) {blocked=true;break;}
      }
      if(!blocked)tiles.push({row,col,open:isYulanTileOpen(scene,row,col)});
    }
    return tiles;
  }
  *simulationTiles(extra) {
    this.indexBuildings(); const ids = new Set();
    for (const grid of [mapData, heightMap, zoneMap, extra]) for (const id of grid?.sparseCells?.keys() || []) ids.add(id);
    for (const id of this.footprints.keys()) ids.add(id);
    for (const source of [treeMap, debrisMap, bridgeMap, roadUnderlayMap, busStopMap, serviceMap, powerLineSet]) for (const id of source.keys()) ids.add(id);
    for (const id of ids) { const [row, col] = id.split(':').map(Number); yield { row, col }; }
  }
  activeBounds() {
    if (!this.adapter) return { rowStart: 0, colStart: 0, rowCount: 0, colCount: 0 };
    const raw = this.adapter.cameraFocus(this.scene.cameras.main), focus = this.adapter.clamp(raw.col, raw.row);
    const rowStart = Math.max(0, (Math.floor(focus.row / 32) - 1) * 32), colStart = Math.max(0, (Math.floor(focus.col / 32) - 1) * 32);
    return { rowStart, colStart, rowCount: Math.min(96, MAP_HEIGHT - rowStart), colCount: Math.min(96, MAP_WIDTH - colStart) };
  }
  invalidate(row, col) { this.stateVersion++;this.modifiedStorageChunks.add(HeungShingWorld.WorldSaveFormat.storageId(col,row)); if (Number.isInteger(row) && Number.isInteger(col)) this.pendingTerrain.set(`${row}:${col}`, { row, col }); this.lastVisualKey = ''; this.queueAutosave(); }
  queueAutosave() { if(!this.ready||!this.enabled)return;clearTimeout(this.buildSaveTimer);this.buildSaveTimer=setTimeout(()=>this.save(true),1200); }
  rotate(rotation) {
    if (!this.adapter) return;
    this.adapter.setRotation(rotation); this.lod?.setRotation(rotation); this.manager?.invalidate(); this.lastVisualKey = '';
  }
  viewpoint() { const raw = this.adapter.cameraFocus(this.scene.cameras.main), focus = this.adapter.clamp(raw.col, raw.row); return { ...focus, rotation: mapRotation, zoom: Math.max(.4, Math.min(3, this.scene.cameras.main.zoom)) }; }
  update(time, delta) {
    if (!this.ready) return;
    if(delta>0)this.diagnostics.frame(this.scene.game.loop.rawDelta||delta);
    const camera = this.scene.cameras.main, focus = this.adapter.cameraFocus(camera), clamped = this.adapter.clamp(focus.col, focus.row);
    if (focus.col !== clamped.col || focus.row !== clamped.row) this.adapter.centreCamera(camera, clamped.col, clamped.row);
    this.manager.setFocus(clamped.col, clamped.row);
    if (this.pendingTerrain.size) { this.manager.invalidateTiles([...this.pendingTerrain.values()]); this.pendingTerrain.clear(); }
    this.manager.pump(); this.renderer.cull(camera); this.regionalLod?.update(camera, mapRotation);
    this.indexBuildings(); const ids = this.manager.snapshot().activeIds, wanted = new Set();
    for (const id of ids) for (const anchor of this.buildingChunks.get(id) || []) wanted.add(anchor);
    // Actual Phaser sprites may leave. Logical footprint records stay in buildingData.
    const leaving = new Set();
    for (const sprite of this.scene.buildingSprites.values()) if (!wanted.has(getTileId(sprite.mapRow, sprite.mapCol))) leaving.add(sprite);
    for (const [id, sprite] of this.scene.buildingSprites) if (leaving.has(sprite)) Map.prototype.delete.call(this.scene.buildingSprites, id);
    for (const sprite of leaving) sprite.destroy();
    for (const anchor of wanted) this.mountBuilding(anchor);
    const visualKey = ids.join(',') + ':' + mapRotation;
    if ((this.visualKey !== visualKey || this.lastVisualKey === '') && (time - (this.lastVisualAt || 0) > 150 || this.lastVisualKey === '')) {
      this.syncLocalVisuals(new Set(ids)); this.visualKey = ids.join(',') + ':' + mapRotation; this.lastVisualKey = 'valid'; this.lastVisualAt = time;
    }
  }
  syncLocalVisuals(active) {
    const contains = (row, col) => active.has(`r:${Math.floor(col / 32)}:${Math.floor(row / 32)}`);
    for (const [id, sprite] of this.scene.tileSprites) {
      const row = Math.floor(id / MAP_WIDTH), col = id % MAP_WIDTH;
      if (!contains(row, col) || mapData[row][col] !== ROAD) { sprite.destroy(); this.scene.tileSprites.delete(id); }
    }
    for (const [id, value] of mapData.sparseCells) {
      if (value !== ROAD) continue; const [row, col] = id.split(':').map(Number);
      if (contains(row, col)) { refreshTileSprite(this.scene, row, col); const sprite = this.scene.tileSprites.get(row * MAP_WIDTH + col); setTerrainSpriteViewportActive(sprite, true, this.scene); }
    }
    for (const [id, sprite] of this.scene.zoneOverlays) {
      const [r,c] = id.split(':').map(Number); if (!contains(r,c) || !zoneMap[r][c]) { sprite.destroy(); this.scene.zoneOverlays.delete(id); }
    }
    for (const [id, zone] of zoneMap.sparseCells) {
      if (!zone) continue; const [row,col] = id.split(':').map(Number); if (!contains(row,col) || this.scene.zoneOverlays.has(id)) continue;
      const point = isoToScreen(col,row), code = zone === ZONE_RES ? 'res' : zone === ZONE_COM ? 'com' : 'ind';
      const overlay = this.scene.add.image(point.x, point.y + getElevationVisualOffset(row,col), `zone_overlay_${code}_${zoneDensityMap[row][col]}`).setOrigin(.5,1).setAlpha(.8);
      addToRenderLayer(this.scene, overlay, 'terrainLayer'); overlay.setDepth(getTerrainTileDepth(row,col,getTileKey(row,col),point.y)+.05); overlay.setMask(this.scene.worldMask);
      this.scene.zoneOverlays.set(id, overlay);
    }
    rebuildBusStopSprites(this.scene);
    for (const [id, sprite] of this.scene.powerLineSprites) { const [r,c] = id.split(':').map(Number); if (!contains(r,c) || !powerLineSet.has(id)) { sprite.destroy(); this.scene.powerLineSprites.delete(id); } }
    for (const id of powerLineSet) { const [r,c] = id.split(':').map(Number); if (contains(r,c) && !this.scene.powerLineSprites.has(id)) drawPowerLineSprite(this.scene,r,c); }
    refreshAllBridgeSprites(this.scene);
    syncMetroStations(this.scene);
    if(!this.visibleRoadTiles().next().done){rebuildTrafficSignalSprites(this.scene);rebuildStreetLampSprites(this.scene);}
    else {
      for(const map of [this.scene.trafficSignalSprites,this.scene.streetLampSprites]){map?.forEach(sprite=>sprite.destroy());map?.clear();}
      this.scene.trafficSignalPlacements=[];this.scene.trafficSignalJunctions?.clear();
    }
    // Existing original-game renderers handle the art and gameplay of these objects.
    for (const [map, sprites, mount] of [
      [treeMap, this.scene.treeSprites, (r, c) => placeTreeSprite(this.scene, r, c)],
      [debrisMap, this.scene.debrisSprites, (r, c) => placeDebrisSprite(this.scene, r, c)],
    ]) {
      if (!sprites) continue;
      for (const [id, objects] of sprites) {
        const [r, c] = id.split(':').map(Number);
        if (!contains(r, c)) { for (const sprite of Array.isArray(objects) ? objects : [objects]) sprite?.destroy(); sprites.delete(id); }
      }
      for (const id of map.keys()) { const [r, c] = id.split(':').map(Number); if (contains(r, c) && !sprites.has(id)) mount(r, c); }
    }
  }
  refreshChunkSummaryTable() {
    this.indexBuildings();
    const rows=new Map(), add=(row,col,values={})=>{
      const chunkId=HeungShingWorld.WorldSaveFormat.storageId(col,row);
      if(!rows.has(chunkId))rows.set(chunkId,{chunkId,developed:true,population:0,powerSupply:0,powerDemand:0,taxIncome:0,expenses:0});
      const entry=rows.get(chunkId);for(const [key,value]of Object.entries(values))entry[key]+=(Number(value)||0);
    };
    const taxScale=(city.taxRate||0)/.09, density=1+getDistrictProfileEffect('density');
    const taxMultiplier=key=>1+getDistrictProfileEffect(key);
    const maintenance={fire_station:UPKEEP_FIRE_STATION,police_station:UPKEEP_POLICE_STATION,primary_school:UPKEEP_PRIMARY_SCHOOL,secondary_school:UPKEEP_SECONDARY_SCHOOL,
      library:UPKEEP_LIBRARY,community_college:UPKEEP_COMMUNITY_COLLEGE,university:UPKEEP_UNIVERSITY,hospital:UPKEEP_HOSPITAL,event_ground:UPKEEP_EVENT_GROUND,
      park_small:UPKEEP_PARK_SMALL,park_large:UPKEEP_PARK_LARGE,park_flagship:UPKEEP_PARK_FLAGSHIP,sports_ground_small:UPKEEP_SPORTS_GROUND_SMALL,sports_ground_large:UPKEEP_SPORTS_GROUND_LARGE};
    for(const [id,type]of mapData.sparseCells){const [r,c]=id.split(':').map(Number);add(r,c,type===ROAD?{expenses:UPKEEP_ROAD_PER_TILE*getDepartmentFunding('roads')}:{ });}
    for(const [id,zone]of zoneMap.sparseCells){if(!zone)continue;const [r,c]=id.split(':').map(Number);add(r,c,{powerDemand:this.buildingAt(id)?0:getZonePowerDemand(zone,zoneDensityMap[r][c])});}
    for(const [id,record]of Object.entries(buildingData)){
      const [r,c]=id.split(':').map(Number), type=record.type;
      const population=type==='residential'?Math.round((record.population??POP_PER_LEVEL[record.level]??0)*density):0;
      let taxIncome=population*TAX_PER_RESIDENT*taxScale*taxMultiplier('taxR');
      if(type==='commercial'||type==='seafood_restaurant')taxIncome+=TAX_PER_COMMERCIAL*taxScale*taxMultiplier('taxC');
      if(type==='industrial')taxIncome+=TAX_PER_INDUSTRIAL*taxScale*taxMultiplier('taxI')*(isPolicyActive('industrialBuildingRevitalization')?1.1:1);
      if(isPolicyActive('smallBusiness'))taxIncome*=.98;
      let expenses=maintenance[type]||SPECIAL_BUILDING_EFFECTS[type]?.upkeep||0;
      if(type==='power_plant_coal')expenses=UPKEEP_COAL_PLANT;else if(type==='power_plant_solar')expenses=UPKEEP_SOLAR_PLANT;else if(type==='power_plant_nuclear')expenses=getPowerPlantStats(record)?.baseUpkeep??UPKEEP_NUCLEAR_PLANT;
      if(type==='fire_station')expenses*=getDepartmentFunding('fire');else if(type==='police_station')expenses*=getDepartmentFunding('police');else if(/^(park_|sports_ground|event_ground)/.test(type))expenses*=getDepartmentFunding('parks');
      add(r,c,{population,powerSupply:getPowerPlantOutput(record),powerDemand:getBuildingPowerDemand(record),taxIncome,expenses});
    }
    for(const id of powerLineSet){const [r,c]=id.split(':').map(Number);add(r,c);}
    for(const [id,tree]of treeMap)if(tree.planted){const [r,c]=id.split(':').map(Number);add(r,c);}
    const transport=getTransportExpansionState();
    for(const id of Object.keys(transport.metro?.tracks||{})){const [r,c]=id.split(':').map(Number);add(r,c);}
    for(const point of [...(transport.metro?.stations||[]),...(transport.ferry?.piers||[])])if(Number.isInteger(point.row)&&Number.isInteger(point.col))add(point.row,point.col);
    this.chunkTable.replace(rows.values(),city);
  }
  stats() {
    const activeStorage=new Set(this.manager.snapshot().activeIds.map(id=>{const [,x,y]=id.split(':').map(Number);return `s:${Math.floor(x/2)}:${Math.floor(y/2)}`;}));
    return {...this.manager.snapshot(),...this.diagnostics.snapshot(),terrain:this.provider.snapshot(),regionalLod:this.regionalLod?.snapshot(),summaryRecords:this.chunkTable.rows.size,
      unloadedSummaryRecords:[...this.chunkTable.rows.keys()].filter(id=>!activeStorage.has(id)).length,save:this.session.diagnostics()};
  }
  capture() {
    flushCitySimulationPulses();
    this.refreshChunkSummaryTable();
    const api = HeungShingWorld, layers = {};
    for (const [name, grid] of Object.entries({ mapData, heightMap, zoneMap, zoneDensityMap })) layers[name] = api.serializeSparseGameGrid(grid);
    const game = JSON.parse(JSON.stringify({ version: 1, city, chunkTable: this.chunkTable.serialize(), seed: currentSeed, roadTileSetId: getCurrentRoadTileSetId(), layers, buildingData,
      bridgeMap: [...bridgeMap], roadUnderlayMap: [...roadUnderlayMap], treeMap: [...treeMap], debrisMap: [...debrisMap], busStopMap: [...busStopMap],
      powerSources: [...powerSources], powerLineSet: [...powerLineSet], lowDensityLockSet: [...lowDensityLockSet], roadTileCount, expansions: getExpansionSaveState() }));
    api.validateGameState(game, this.world, api.WorldSaveFormat.check);
    this.delta.header.game = game;
    this.delta.header.city = { ...this.delta.header.city, name: city.name, budget: city.budget };
    this.delta.header.viewpoint = this.viewpoint(); this.delta.header.revision++; this.delta.metaDirty = true;
    return this.delta.snapshot();
  }
  async save(silent = false) {
    if(this.buildSaveTimer)clearTimeout(this.buildSaveTimer);
    // Share one writer. Two callers must never each keep capturing a newer revision
    // while awaiting the same older flush (an endless autosave/manual-save race).
    if(this.savePromise)return this.savePromise;
    this.savePromise=(async()=>{
      try { let captured; do { captured=this.stateVersion; this.capture(); await this.session.flush(); } while(this.delta.dirty||captured!==this.stateVersion); if (!silent) showToast(t('toast.citySaved'), 'info'); return true; }
      catch(error){console.error('[World save]',error);showToast(error.message,'danger');return false;}
    })();
    try{return await this.savePromise;}finally{this.savePromise=null;}
  }
  async saveAs() {
    const name = await showTextPromptDialog(t('prompt.saveAs'), city.name); if (name === null) return;
    if (!await this.save(true)) return false;
    const old = this.session, delta = new HeungShingWorld.WorldDeltaStore(this.world);
    delta.replace(this.delta.snapshot(), { dirty: true });
    city.name = name.trim().slice(0, 30) || city.name;
    // A new storage revision owns the same immutable base and all sparse state.
    this.session = new HeungShingWorld.WorldSaveSession({ delta, storage: HeungShingStorage, id: `world-${HeungShingWorld.worldUuid()}`, captureView: () => this.viewpoint() });
    this.delta = delta; const ok = await this.save(); if (!ok) { this.session.destroy(); this.session = old; this.delta = old.delta; } if (ok) { old.destroy(); history.replaceState(null, '', `/?world=1&slot=${this.session.id}`); }
    return ok;
  }
  overlayTerrainColor(row, col) {
    if (this.overlayRaster?.rotation !== mapRotation) {
      const source = this.scene.textures.get(`world-lod-${mapRotation}`).getSourceImage(), canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height; const context = canvas.getContext('2d'); context.drawImage(source,0,0);
      this.overlayRaster = { rotation: mapRotation, width: canvas.width, height: canvas.height, data: context.getImageData(0,0,canvas.width,canvas.height).data };
    }
    const raster = this.overlayRaster, view = this.manifest.lod[mapRotation], point = this.adapter.project(col,row);
    const x = Math.max(0,Math.min(raster.width-1,Math.round((point.x-view.x)/view.width*raster.width))), y = Math.max(0,Math.min(raster.height-1,Math.round((point.y-40-view.y)/view.height*raster.height)));
    const index = (y*raster.width+x)*4; return [raster.data[index],raster.data[index+1],raster.data[index+2]];
  }
  paintMinimap(ctx, grid, paint) {
    const source = this.scene.textures.get(`world-lod-${mapRotation}`).getSourceImage(), view = this.manifest.lod[mapRotation];
    const scale = 1 / (grid.step * 50), x = view.x * scale - MAP_HEIGHT / grid.step + grid.gridWidth;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(source, x, view.y * scale, view.width * scale, view.height * scale);
    // Match the original minimap's one-pixel-per-cell projection.
    for (const [id, value] of mapData.sparseCells) { const [r, c] = id.split(':').map(Number); paint(r, c, value === ROAD ? [70,72,76] : cityMinimapTileColor(r,c)); }
    // paint writes the caller's ImageData; draw developed cells directly over the LOD.
    for (const { row, col } of this.simulationTiles()) {
      if (!zoneMap[row]?.[col] && !buildingData[getTileId(row, col)] && mapData[row]?.[col] !== ROAD) continue;
      const point = cityMinimapPointAt(col, row, grid), rgb = cityMinimapTileColor(row, col); ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fillRect(point.x, point.y, 2, 1);
    }
  }
  destroy() {
    clearInterval(this.timer); clearTimeout(this.buildSaveTimer); this.ready = false; this.session?.destroy(); this.manager?.destroy(); this.renderer?.destroy(); this.regionalLod?.destroy(); this.lod?.destroy(); this.provider?.destroy();
    stopSimTimer(); clearAllOverlays(this.scene); clearBuildings(this.scene);
    this.scene.debrisSprites?.forEach(sprite=>sprite.destroy()); this.scene.debrisSprites?.clear();
    clearBusStopSprites(this.scene); clearTransportVisuals(this.scene);
    this.enabled = false;
    // Restore the normal city's terrain ownership as well as dimensions. Reusing
    // the few streamed road Images leaves a same-size 256 city with no terrain.
    this.scene.buildingSprites = new Map();
    setMapDimensions(256,256); mapData=createFilledMap(GROUND); heightMap=createFilledTypedMap(Uint8Array,0); resetGameState();
    updateMapMetrics(this.scene); resetTileSpritesForNewMap(this.scene); drawWorldMask(this.scene); history.replaceState(null,'','/');
  }
}

async function leaveWorldGame() { const host = globalThis.__worldGameHost; if (!host) return; host.destroy(); globalThis.__worldGameHost = null; }
async function startWorldGame(launch) {
  if (!gameReady) throw new Error('遊戲仍在載入中。');
  if (!HeungShingStorage.writable) throw new Error('請先關閉另一個正在編輯城市嘅分頁。');
  const candidate = new WorldGameHost(activeScene);
  try {
    await candidate.prepare(launch);
    if (isWorldGameActive()) { if (!await globalThis.__worldGameHost.save(true)) throw new Error('未能儲存目前城市。'); await leaveWorldGame(); }
    candidate.activate(); await candidate.save(true); return candidate;
  } catch (error) { if (candidate.enabled) candidate.destroy(); else { candidate.session?.destroy(); candidate.provider?.destroy(); } throw error; }
}
async function listWorldGameSaves() {
  const response = await HeungShingStorage.worldRequest('/api/world-saves'); if (!response.ok) throw new Error('未能讀取全境存檔。'); return response.json();
}
function appendWorldGameSaves(list, rows) {
  for (const row of rows) {
    const element = document.createElement('div'); element.className = 'save-list-item';
    const meta = document.createElement('div'); meta.className = 'save-list-meta';
    const name = document.createElement('span'); name.className = 'save-list-name'; name.textContent = row.city.name;
    const detail = document.createElement('span'); detail.className = 'save-list-detail'; detail.textContent = `香港全境 · $${Number(row.city.budget).toLocaleString()}`;
    meta.append(name, detail); const actions = document.createElement('div'); actions.className = 'save-list-actions';
    const load = document.createElement('button'); load.className = 'save-list-load-btn'; load.dataset.worldSlot = row.id; load.textContent = t('save.load');
    load.onclick = async () => { load.disabled = true; try { await startWorldGame({ slot: row.id, fresh: false }); closeSaveListModal(); } catch (error) { showToast(error.message, 'danger'); } finally { load.disabled = false; } };
    const download = document.createElement('button'); download.className = 'save-list-load-btn'; download.textContent = platformText('export');
    download.onclick = async () => { try { const response = await HeungShingStorage.worldRequest(`/api/world-saves/${row.id}`); if (!response.ok) throw new Error('存檔讀取失敗'); downloadWorldGameSave(HeungShingWorld.WorldSaveFormat.exportWorldSave((await response.json()).snapshot)); } catch (error) { showToast(error.message, 'danger'); } };
    const previous = document.createElement('button'); previous.className = 'save-list-load-btn'; previous.textContent = '下載上一版';
    previous.onclick = async () => { try { const response = await HeungShingStorage.worldRequest(`/api/world-saves/${row.id}/backup`); if (!response.ok) throw new Error('沒有上一版備份。'); downloadWorldGameSave(HeungShingWorld.WorldSaveFormat.exportWorldSave(await response.json())); } catch(error) { showToast(error.message,'warning'); } };
    actions.append(load, download, previous); element.append(meta, actions); list.append(element);
  }
}
function downloadWorldGameSave(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = `${isWorldGameActive() ? city.name : '香港全境'}.heungshing`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
