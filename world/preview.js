/* global Phaser, createMapInputController, mapCameraWorldPoint, mapCameraScrollForAnchor */
(async function () {
  'use strict';
  const api = globalThis.HeungShingWorld, status = document.getElementById('status');
  const root = new URL('../data/world-terrain/', location.href);
  const state = globalThis.__worldStreamingPreview = { ready: false, errors: [], events: [], manifest: null, storageError: false };
  const diagnostics = new api.WorldDiagnostics();
  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function event(entry) {
    diagnostics.event(entry); state.events.push(entry); if (state.events.length > 200) state.events.shift();
    if (entry.type === 'CHUNK_ERROR') message(`區域讀取失敗，會自動重試；低細節地形仍然保留。${entry.error}`, true);
  }
  try {
    const response = await fetch(new URL('manifest.json', root));
    if (!response.ok) throw new Error('請先執行 npm run prepare:world-terrain，然後重新載入。');
    const manifest = state.manifest = await response.json();
    const provider = new api.WorldTerrainProvider(manifest, { onEvent: event, fetchBytes: async url => {
      const response = await fetch(new URL(url, root));
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    } });
    if (!/^[a-f0-9]{64}$/.test(manifest.adapterSha256)) throw new Error('地形 Adapter 版本不一致，請重新建立地形資料。');
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = new URL('legacy-terrain-adapter.js', root);
      script.integrity = `sha256-${btoa(String.fromCharCode(...manifest.adapterSha256.match(/../g).map(hex => parseInt(hex, 16))))}`;
      script.onload = resolve; script.onerror = () => reject(new Error('地形 Adapter 未能載入')); document.head.appendChild(script);
    });
    const world = provider.world, region = { col: 0, row: 0, width: world.width, height: world.height };
    const adapter = new api.WorldModeAdapter(world, api.createLegacyWorldProjection(world), region);
    const visuals = api.createLegacyTerrainVisuals(world);
    let manager, renderer, entityRenderer, trafficRenderer, simulationUi, buildUi, minimap, lod, scene, lastStatsAt = 0, pinch = null, jumpSide = false;
    let desktop = false;
    const storageChoice = new URLSearchParams(location.search).get('storage');
    if (storageChoice !== 'browser') {
      try { const info = await fetch('/api/app-info'); desktop = info.ok && !!(await info.json()).version; } catch {}
    }
    if (storageChoice === 'desktop' && !desktop) throw new Error('本機儲存服務未啟動，請用 npm start 開啟預覽。');
    globalThis.HEUNG_SHING_CONFIG = Object.freeze({ platform: desktop ? 'desktop' : 'web' });
    await HeungShingStorage.initialize();
    const delta = new api.WorldDeltaStore(world), data = new api.WorldDataAccess(provider, delta);
    let saveId = 'world-trial-v1'; try { saveId = localStorage.getItem('heung-shing.world-trial.active') || saveId; } catch {}
    const session = new api.WorldSaveSession({ delta, storage: HeungShingStorage, id: saveId, onStatus(entry) {
      const labels = { dirty: '有未儲存修改', saving: '儲存中…', saved: '已儲存', loaded: '已載入', error: '未能儲存 · 可匯出備份' };
      document.getElementById('save-status').textContent = `${desktop ? '此電腦' : '此瀏覽器'} · ${labels[entry.kind] || ''}`;
      if (entry.kind === 'error') { state.storageError = true; message(entry.error, true); }
      if (['saved', 'loaded'].includes(entry.kind)) { state.storageError = false; message(''); }
    }, captureView: () => state.ready ? { ...adapter.cameraFocus(scene.cameras.main), rotation: adapter.rotation, zoom: scene.cameras.main.zoom } : null });
    await session.load();
    const construction = new api.WorldConstruction({ world, region, data, delta });
    const network = new api.WorldTransportNetwork(delta);
    const simulation = new api.WorldSimulation({ delta, network, writable: () => HeungShingStorage.writable });
    delta.subscribe(entry => { if (entry.all) manager?.invalidate(); else if (entry.terrainTiles?.length) manager?.invalidateTiles(entry.terrainTiles); });
    const centre = { col: manifest.trial.startCol, row: manifest.trial.startRow };
    const fetchFailure = file => { state.errors.push(`Asset failed: ${file.src}`); message('地形圖像載入失敗，請重新建立地形資料。', true); };
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'world-canvas', backgroundColor: '#15232c',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      render: { antialias: true, roundPixels: false }, fps: { target: 60, limit: 0 },
      scene: { preload() {
        this.load.on('loaderror', fetchFailure);
        this.load.atlas('world-terrain', new URL(manifest.art.image, root).href, new URL(manifest.art.atlas, root).href);
        manifest.lod.forEach((view, rotation) => this.load.image(`world-lod-${rotation}`, new URL(view.url, root).href));
        if (!manifest.construction) { message('請先執行 npm run prepare:world-terrain 更新建設素材。', true); return; }
        for (const model of Object.values(api.WORLD_BUILDINGS)) this.load.image(model.texture, new URL(manifest.construction[model.id].url, root).href);
        for (const [key, file] of Object.entries(ROAD_TILE_LOGICAL_FILES)) this.load.image(`world-${key}`, new URL(`../kenney_isometric-roads/png/${file}`, location.href).href);
        for (const [key, file] of [['x', 'metro_track_x'], ['y', 'metro_track_y'], ['cross', 'metro_track_cross_xy']]) this.load.image(`world-rail-${key}`, new URL(`../Models/metroTrack/${file}.png`, location.href).href);
      }, create() {
        scene = this;
        lod = new api.WorldLod(scene, manifest.lod);
        renderer = new api.WorldChunkRenderer({ scene, adapter, visuals });
        manager = new api.WorldChunkManager({ world, region, provider: data, renderer, onEvent: event });
        entityRenderer = new api.WorldEntityRenderer({ scene, adapter, delta, visuals, fitGround: fitBuildingToGroundCorners,
          sampleForTile: (col, row) => manager.records.get(`r:${Math.floor(col / 32)}:${Math.floor(row / 32)}`)?.job?.data?.sample });
        scene.cameras.main.setZoom(.8); adapter.centreCamera(scene.cameras.main, centre.col, centre.row);
        installInput(game.canvas);
        buildUi = new api.WorldConstructionUi({ scene, adapter, construction, delta, session, simulation, message, restoreView });
        const navigate = (col, row) => { buildUi.cancel(); setFocus(col, row); };
        minimap = new api.WorldMinimap({ scene, adapter, delta, simulation, manifest, rootUrl: root, navigate });
        trafficRenderer = new api.WorldTrafficRenderer({ scene, adapter, simulation });
        simulationUi = new api.WorldSimulationUi({ simulation, navigate, message });
        state.ready = true;
        Object.assign(state, { scene, provider, manager, renderer, adapter, game, setFocus, rotate, delta, data, construction, entityRenderer, session, buildUi, minimap, network, simulation, trafficRenderer,
          stats: () => ({ ...manager.snapshot(), ...diagnostics.snapshot(), focus: adapter.cameraFocus(scene.cameras.main),
            rotation: adapter.rotation, zoom: scene.cameras.main.zoom, atlasRgbaBytes: manifest.art.rgbaBytes, minimap: minimap.snapshot(),
            simulation: simulation.snapshot(), traffic: trafficRenderer.snapshot(),
            construction: { revision: delta.revision, dirtyChunks: delta.dirtyChunks.size, entities: delta.entities.size, visuals: entityRenderer.snapshot(), storageRevision: session.storageRevision } }) });
        restoreView(delta.header);
        const tick = () => { if (buildUi?.busy) return; try { simulation.tick(); } catch (error) { message(error.message, true); } };
        tick(); const timer = setInterval(tick, 1000); scene.events.once('shutdown', () => clearInterval(timer));
      }, update(_time, delta) {
        if (!state.ready) return;
        diagnostics.frame(delta);
        const camera = scene.cameras.main, raw = adapter.cameraFocus(camera), focus = adapter.clamp(raw.col, raw.row);
        if (Math.abs(raw.col - focus.col) > .001 || Math.abs(raw.row - focus.row) > .001) adapter.centreCamera(camera, focus.col, focus.row);
        manager.setFocus(focus.col, focus.row); manager.pump(); renderer.cull(camera);
        entityRenderer.sync(manager.snapshot().activeIds);
        trafficRenderer.sync(manager.snapshot().activeIds);
        minimap.update();
        if (performance.now() - lastStatsAt > 250) { renderStats(focus); lastStatsAt = performance.now(); }
      } },
    });
    function setFocus(col, row) {
      const point = adapter.clamp(col, row); adapter.centreCamera(scene.cameras.main, point.col, point.row);
      manager.setFocus(point.col, point.row);
    }
    function rotate() {
      if (!state.ready) return;
      const focus = adapter.cameraFocus(scene.cameras.main);
      buildUi?.cancel(); adapter.setRotation(adapter.rotation + 1); lod.setRotation(adapter.rotation); manager.invalidate(); setFocus(focus.col, focus.row);
    }
    function restoreView(snapshot) {
      buildUi?.cancel(); manager?.invalidate();
      if (snapshot.viewpoint) { adapter.setRotation(snapshot.viewpoint.rotation); lod.setRotation(adapter.rotation); scene.cameras.main.setZoom(snapshot.viewpoint.zoom); setFocus(snapshot.viewpoint.col, snapshot.viewpoint.row); }
    }
    function zoomTo(value, x = scene.cameras.main.width / 2, y = scene.cameras.main.height / 2) {
      const camera = scene.cameras.main, anchor = mapCameraWorldPoint(camera, x, y);
      camera.setZoom(Math.max(.4, Math.min(3, value)));
      const scroll = mapCameraScrollForAnchor(camera, camera.zoom, x, y, anchor.x, anchor.y);
      camera.setScroll(scroll.x, scroll.y);
    }
    function renderStats(focus) {
      const stats = state.stats(), mib = bytes => (bytes / 1048576).toFixed(2), ms = value => value == null ? '—' : value.toFixed(2);
      document.getElementById('zoom').textContent = `${Math.round(stats.zoom * 100)}%`;
      simulationUi.update();
      document.getElementById('diagnostics').textContent = [
        `World  ${world.width} × ${world.height} · 20m/tile`,
        `Navigation  全港 · ${region.width} × ${region.height}`,
        `Camera (${focus.col.toFixed(1)},${focus.row.toFixed(1)}) R${stats.rotation}`,
        `Detail ${stats.states.ACTIVE || 0} active / ${stats.states.MOUNTING || 0} mounting / ${stats.states.DECODING || 0} reading`,
        `Objects ${stats.renderer.gameObjects} · tiles ${stats.renderer.terrainTiles}`,
        `Destroyed ${stats.renderer.destroyedObjects} · cache ${mib(stats.terrain.decodedBytes)} MiB`,
        `Pack cache ${mib(stats.terrain.packBytes)} MiB · read ${mib(stats.terrain.networkBytes)} MiB`,
        `Frame p95/p99 ${ms(stats.frameP95Ms)} / ${ms(stats.frameP99Ms)} ms`,
        `Mount p95 ${ms(stats.mountP95Ms)} ms · errors ${stats.errors}`,
        `Built ${delta.entities.size} · unsaved chunks ${delta.dirtyChunks.size}`,
        `Minimap cache ${mib(stats.minimap.cache.bytes)} MiB · ${stats.minimap.cache.pending} loading`,
        `Network ${stats.simulation.network.roadNodes} road / ${stats.simulation.network.railNodes} rail · vehicles ${stats.traffic.vehicles}`,
      ].join('\n');
      if (!stats.states.ERROR && stats.states.ACTIVE === stats.wanted && !state.errors.length && !state.storageError) message('');
    }
    function installInput(canvas) {
      const camera = scene.cameras.main;
      const input = createMapInputController({
        onTap({ x, y }) { buildUi?.tap(x, y); },
        onPan({ dx, dy }) { camera.scrollX -= dx / camera.zoom; camera.scrollY -= dy / camera.zoom; },
        onPinchStart({ x, y }) { pinch = { zoom: camera.zoom, anchor: mapCameraWorldPoint(camera, x, y) }; },
        onPinch({ x, y, scale }) {
          if (!pinch) return;
          camera.setZoom(Math.max(.4, Math.min(3, pinch.zoom * scale)));
          const scroll = mapCameraScrollForAnchor(camera, camera.zoom, x, y, pinch.anchor.x, pinch.anchor.y); camera.setScroll(scroll.x, scroll.y);
        }, onPinchEnd() { pinch = null; },
      });
      function point(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
      canvas.addEventListener('pointerdown', event => { event.preventDefault(); canvas.setPointerCapture(event.pointerId); const p = point(event); input.pointerDown(event.pointerId, p.x, p.y); });
      canvas.addEventListener('pointermove', event => { const p = point(event); input.pointerMove(event.pointerId, p.x, p.y); });
      canvas.addEventListener('pointerup', event => { const p = point(event); input.pointerUp(event.pointerId, p.x, p.y); });
      canvas.addEventListener('pointercancel', event => input.pointerCancel(event.pointerId));
      canvas.addEventListener('lostpointercapture', event => input.pointerCancel(event.pointerId));
      canvas.addEventListener('contextmenu', event => event.preventDefault());
      canvas.addEventListener('wheel', event => { event.preventDefault(); const p = point(event); zoomTo(camera.zoom * Math.exp(-event.deltaY * .001), p.x, p.y); }, { passive: false });
      window.addEventListener('blur', () => input.cancelAll('blur'));
      document.addEventListener('visibilitychange', () => { if (document.hidden) input.cancelAll('hidden'); });
      window.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.target.closest('input,select,textarea,[contenteditable="true"]')) rotate(); });
      document.getElementById('rotate').onclick = rotate;
      document.getElementById('zoom-in').onclick = () => zoomTo(camera.zoom * 1.25);
      document.getElementById('zoom-out').onclick = () => zoomTo(camera.zoom / 1.25);
      document.getElementById('home').onclick = () => { buildUi?.cancel(); setFocus(centre.col, centre.row); };
      document.getElementById('jump').onclick = () => { buildUi?.cancel(); jumpSide = !jumpSide; setFocus(jumpSide ? 2864 : centre.col, jumpSide ? 336 : centre.row); };
      scene.events.once('shutdown', () => { session.destroy(); buildUi?.destroy(); simulationUi?.destroy(); minimap?.destroy(); trafficRenderer?.destroy(); simulation.destroy(); network.destroy(); entityRenderer.destroy(); manager.destroy(); renderer.destroy(); lod.destroy(); provider.destroy(); });
    }
  } catch (error) { state.errors.push(String(error.message || error)); message(String(error.message || error), true); }
})();
