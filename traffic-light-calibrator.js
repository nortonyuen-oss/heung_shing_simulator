// Traffic vehicle lamp position calibrator (test-branch-only dev tool).
//
// Same mould as bus-stop-calibrator.js / airport-route-calibrator.js: gated
// behind the shared test mode, reachable from the performance panel. It spawns a
// single magnified PREVIEW of one vehicle four-view render at a time and makes
// its lamps independently draggable, because the calibration target is the art
// itself, not any car on the road.
//
// Per view (ne/nw/se/sw) every model carries the four exterior lamps
// (headL/headR/tailL/tailR); buses additionally carry the endpoints of two
// interior fluorescent tubes (deckUpL/deckUpR + deckLoL/deckLoR). Each lamp is a
// [dx, dy] screen-pixel offset from the vehicle draw position, plus an on/off
// flag so a lamp the isometric angle hides for that view can be switched off.
// Output pastes into the matching createTrafficModel({...}) in traffic-visuals.js.
// While the tool is open, scene.trafficLightCalibrationActive forces every
// on-road lamp fully lit and every live car of the edited model snaps to the
// new offsets.

const TRAFFIC_LIGHT_CALIBRATION_SCHEMA_VERSION = 3;
const TRAFFIC_LIGHT_CALIBRATION_STORAGE_KEY = 'trafficLightCalibration.v3';
const TRAFFIC_LIGHT_CALIBRATION_VIEWS = Object.freeze(['ne', 'nw', 'se', 'sw']);
const TRAFFIC_LIGHT_CALIBRATION_EXT_LAMPS = Object.freeze(['headL', 'headR', 'tailL', 'tailR']);
const TRAFFIC_LIGHT_CALIBRATION_LAMP_LABELS = Object.freeze({
  headL: '頭燈 L', headR: '頭燈 R', tailL: '尾燈 L', tailR: '尾燈 R',
  deckUpL: '上層 L', deckUpR: '上層 R', deckLoL: '下層 L', deckLoR: '下層 R',
});
// Mirroring to the opposite view flips x and swaps the L/R lamp of each pair.
const TRAFFIC_LIGHT_CALIBRATION_MIRROR = Object.freeze({ ne: 'nw', nw: 'ne', se: 'sw', sw: 'se' });
const TRAFFIC_LIGHT_CALIBRATION_LAMP_MIRROR = Object.freeze({
  headL: 'headR', headR: 'headL', tailL: 'tailR', tailR: 'tailL',
  deckUpL: 'deckUpR', deckUpR: 'deckUpL', deckLoL: 'deckLoR', deckLoR: 'deckLoL',
});
const TRAFFIC_LIGHT_CALIBRATION_MIN_ZOOM = 2;
const TRAFFIC_LIGHT_CALIBRATION_MAX_ZOOM = 9;

// modelId -> { ne?: { headL:[x,y,on], ... }, nw?, se?, sw? }. A model key exists
// here as soon as one of its views is touched.
const trafficLightCalibrationOverrides = loadTrafficLightCalibrationOverrides();

let trafficLightCalibrationActive = false;
let trafficLightCalibrationScene = null;
let trafficLightCalibrationPanel = null;
let trafficLightCalibrationModelIndex = 0;
let trafficLightCalibrationView = 'ne';
let trafficLightCalibrationZoom = 4;
let trafficLightCalibrationSelectedLamp = 'headL';
let trafficLightCalibrationPreview = null; // { body, markers:{}, tubes:{}, worldX, worldY, textureKey }
let trafficLightCalibrationKeyHandler = null;

function trafficLightCalibrationModels() {
  return typeof TRAFFIC_MODEL_REGISTRY !== 'undefined' ? TRAFFIC_MODEL_REGISTRY : [];
}

function trafficLightCalibrationCurrentModel() {
  const models = trafficLightCalibrationModels();
  if (models.length === 0) return null;
  const index = ((trafficLightCalibrationModelIndex % models.length) + models.length) % models.length;
  return models[index];
}

function trafficLightCalibrationProfile(model) {
  return typeof getTrafficLightProfile === 'function' ? getTrafficLightProfile(model) : null;
}

function trafficLightCalibrationLampsFor(model) {
  return trafficLightCalibrationProfile(model)?.lamps || TRAFFIC_LIGHT_CALIBRATION_EXT_LAMPS;
}

function trafficLightCalibrationTubesFor(model) {
  return trafficLightCalibrationProfile(model)?.tubes || [];
}

function trafficLightCalibrationRound(value) {
  return typeof visualRouteCalibrationRound === 'function'
    ? visualRouteCalibrationRound(value, 2)
    : Math.round((Number(value) || 0) * 100) / 100;
}

function trafficLightCalibrationLampOn(value) {
  return !value ? false : (value.length < 3 || !!value[2]);
}

function trafficLightCalibrationIsHeadLamp(lamp) {
  return lamp === 'headL' || lamp === 'headR';
}

function trafficLightCalibrationIsDeckLamp(lamp) {
  return lamp.startsWith('deck');
}

// ── Persistence (a dev convenience - the real home for these numbers is the
// baked lightAnchors in traffic-visuals.js) ──────────────────────────────────

function loadTrafficLightCalibrationOverrides() {
  try {
    const raw = globalThis.localStorage?.getItem(TRAFFIC_LIGHT_CALIBRATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.models && typeof parsed.models === 'object'
      ? parsed.models
      : {};
  } catch {
    return {};
  }
}

function persistTrafficLightCalibrationOverrides() {
  try {
    globalThis.localStorage?.setItem(TRAFFIC_LIGHT_CALIBRATION_STORAGE_KEY, JSON.stringify({
      schemaVersion: TRAFFIC_LIGHT_CALIBRATION_SCHEMA_VERSION,
      models: trafficLightCalibrationOverrides,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    /* storage unavailable - session-only is fine */
  }
}

// ── Anchor resolution (read by getTrafficVehicleLightAnchors in
// traffic-visuals.js) ───────────────────────────────────────────────────────

// An already-baked model.lightAnchors is the starting point for re-calibration;
// otherwise the per-category default set.
function trafficLightCalibrationDefaultAnchors(model) {
  return model?.lightAnchors || trafficLightCalibrationProfile(model)?.anchors || null;
}

function trafficLightCalibrationLampTriple(source) {
  const on = !source ? 1 : (source.length < 3 ? 1 : (source[2] ? 1 : 0));
  return [Number(source?.[0]) || 0, Number(source?.[1]) || 0, on];
}

function trafficLightCalibrationCompleteView(defaults, custom, lampKeys) {
  const out = {};
  lampKeys.forEach((lamp) => {
    out[lamp] = trafficLightCalibrationLampTriple(custom?.[lamp] ?? defaults?.[lamp]);
  });
  return out;
}

// Returns a COMPLETE anchor set (every view, every lamp the model uses) once a
// model has been touched, filling untouched lamps from the shipped per-category
// default. Returns null for models never edited this session, and always null
// outside the shared test mode - so a half-finished calibration (or stale
// localStorage on a dev machine) never leaks into normal play.
function getTrafficLightCalibrationOverride(modelId) {
  if (typeof isVisualRouteCalibrationTestModeEnabled === 'function'
    && !isVisualRouteCalibrationTestModeEnabled()) return null;
  const edited = modelId && trafficLightCalibrationOverrides[modelId];
  if (!edited) return null;
  const model = typeof TRAFFIC_MODEL_BY_ID !== 'undefined' ? TRAFFIC_MODEL_BY_ID.get(modelId) : null;
  const defaults = trafficLightCalibrationDefaultAnchors(model) || {};
  const lampKeys = trafficLightCalibrationLampsFor(model);
  const out = {};
  TRAFFIC_LIGHT_CALIBRATION_VIEWS.forEach((view) => {
    out[view] = trafficLightCalibrationCompleteView(defaults[view], edited[view], lampKeys);
  });
  return out;
}

function isTrafficLightCalibrationActive() {
  return trafficLightCalibrationActive;
}

// The shared input choke point (visual-route-calibrator.js) suppresses every
// normal tool listener while this is true, so a drag on a lamp can't also
// bulldoze the tile it floats over.
function isTrafficLightCalibrationInputActive() {
  return trafficLightCalibrationActive;
}

// ── Effective anchor for the current model+view (override merged over default) ─

function trafficLightCalibrationEffectiveAnchor(model, view) {
  const defaults = trafficLightCalibrationDefaultAnchors(model)?.[view];
  const custom = trafficLightCalibrationOverrides[model?.id]?.[view];
  const anchor = trafficLightCalibrationCompleteView(defaults, custom, trafficLightCalibrationLampsFor(model));
  anchor.custom = !!custom;
  return anchor;
}

function trafficLightCalibrationWriteView(model, view, anchor) {
  if (!model?.id) return;
  const bucket = trafficLightCalibrationOverrides[model.id]
    || (trafficLightCalibrationOverrides[model.id] = {});
  bucket[view] = {};
  trafficLightCalibrationLampsFor(model).forEach((lamp) => {
    const v = anchor[lamp] || [0, 0, 1];
    bucket[view][lamp] = [
      trafficLightCalibrationRound(v[0]),
      trafficLightCalibrationRound(v[1]),
      v.length < 3 ? 1 : (v[2] ? 1 : 0),
    ];
  });
  persistTrafficLightCalibrationOverrides();
  refreshTrafficLightCalibrationLiveVehicles(model.id);
}

// ── Preview spawn / teardown ────────────────────────────────────────────────

function trafficLightCalibrationCameraCentre(scene) {
  const cam = scene?.cameras?.main;
  if (!cam) return { x: 0, y: 0 };
  const midX = Number.isFinite(cam.midPoint?.x) ? cam.midPoint.x : (cam.scrollX + cam.width / 2);
  const midY = Number.isFinite(cam.midPoint?.y) ? cam.midPoint.y : (cam.scrollY + cam.height / 2);
  return { x: midX, y: midY };
}

function destroyTrafficLightCalibrationPreview() {
  const preview = trafficLightCalibrationPreview;
  if (!preview) return;
  preview.body?.destroy?.();
  Object.values(preview.markers || {}).forEach((m) => m?.destroy?.());
  Object.values(preview.tubes || {}).forEach((t) => t?.destroy?.());
  trafficLightCalibrationPreview = null;
}

function trafficLightCalibrationInputDepth(offset) {
  const base = typeof VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH === 'number'
    ? VISUAL_ROUTE_CALIBRATION_INPUT_DEPTH
    : 2_000_000_000;
  return base + offset;
}

function trafficLightCalibrationMakeMarker(scene, textureKey, interactive) {
  const marker = scene.add.image(0, 0, textureKey);
  marker.setOrigin(0.5, 0.5);
  marker.setDepth(trafficLightCalibrationInputDepth(-5));
  const additive = typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD';
  marker.setBlendMode?.(additive);
  if (interactive) {
    marker.setInteractive?.({ useHandCursor: true, draggable: true });
    scene.input?.setDraggable?.(marker, true);
  }
  return marker;
}

function spawnTrafficLightCalibrationPreview() {
  const scene = trafficLightCalibrationScene;
  const model = trafficLightCalibrationCurrentModel();
  if (!scene?.add || !model) return;
  if (typeof ensureTrafficLightTextures === 'function') ensureTrafficLightTextures(scene);
  destroyTrafficLightCalibrationPreview();

  if (!trafficLightCalibrationLampsFor(model).includes(trafficLightCalibrationSelectedLamp)) {
    trafficLightCalibrationSelectedLamp = 'headL';
  }

  const view = trafficLightCalibrationView;
  const centre = trafficLightCalibrationCameraCentre(scene);
  const textureKey = `tlcal_${model.id}_${view}`;

  const finishBody = () => {
    if (!trafficLightCalibrationActive || trafficLightCalibrationCurrentModel() !== model) return;
    if (!scene.textures?.exists?.(textureKey)) return;
    const preview = trafficLightCalibrationPreview;
    if (!preview || preview.textureKey !== textureKey) return;
    const body = scene.add.image(centre.x, centre.y, textureKey);
    body.setOrigin(model.originX ?? 0.5, model.originY ?? 0.85);
    body.setDepth(trafficLightCalibrationInputDepth(-6));
    preview.body = body;
    layoutTrafficLightCalibrationPreview();
  };

  const cfg = typeof TRAFFIC_LIGHT_CONFIG !== 'undefined' ? TRAFFIC_LIGHT_CONFIG : {};
  const headKey = cfg.headlightTextureKey || 'fx_traffic_headlights';
  const tailKey = cfg.taillightTextureKey || 'fx_traffic_taillights';
  const tubeKey = cfg.deckTubeTextureKey || 'fx_traffic_decktube';

  const markers = {};
  trafficLightCalibrationLampsFor(model).forEach((lamp) => {
    const tex = trafficLightCalibrationIsHeadLamp(lamp) ? headKey
      : trafficLightCalibrationIsDeckLamp(lamp) ? headKey : tailKey;
    markers[lamp] = trafficLightCalibrationMakeMarker(scene, tex, true);
  });
  const tubes = {};
  trafficLightCalibrationTubesFor(model).forEach((desc) => {
    tubes[desc.key] = trafficLightCalibrationMakeMarker(scene, tubeKey, false);
    tubes[desc.key].setDepth(trafficLightCalibrationInputDepth(-5.5));
  });

  trafficLightCalibrationPreview = { body: null, markers, tubes, worldX: centre.x, worldY: centre.y, textureKey };
  Object.keys(markers).forEach((lamp) => wireTrafficLightCalibrationLampDrag(lamp));

  if (scene.textures?.exists?.(textureKey)) {
    finishBody();
  } else if (scene.load?.image) {
    scene.load.image(textureKey, model.directions[view].path);
    scene.load.once(`filecomplete-image-${textureKey}`, finishBody);
    scene.load.once('loaderror', () => setTrafficLightCalibrationMessage('圖載入失敗', 'error'));
    scene.load.start();
  }
  layoutTrafficLightCalibrationPreview();
  renderTrafficLightCalibrationPanel();
}

function layoutTrafficLightCalibrationPreview() {
  const preview = trafficLightCalibrationPreview;
  const scene = trafficLightCalibrationScene;
  const model = trafficLightCalibrationCurrentModel();
  if (!preview || !scene || !model) return;
  const zoom = trafficLightCalibrationZoom;
  const anchor = trafficLightCalibrationEffectiveAnchor(model, trafficLightCalibrationView);
  const profile = trafficLightCalibrationProfile(model);

  if (preview.body) preview.body.setScale((model.scale ?? 0.1) * zoom);

  const screenOf = (lamp) => ({
    x: preview.worldX + anchor[lamp][0] * zoom,
    y: preview.worldY + anchor[lamp][1] * zoom,
  });

  Object.keys(preview.markers).forEach((lamp) => {
    const marker = preview.markers[lamp];
    if (!marker) return;
    const on = trafficLightCalibrationLampOn(anchor[lamp]);
    const selected = trafficLightCalibrationSelectedLamp === lamp;
    const p = screenOf(lamp);
    const baseScale = trafficLightCalibrationIsHeadLamp(lamp) ? (profile?.headScale ?? 0.7)
      : trafficLightCalibrationIsDeckLamp(lamp) ? 0.5 : (profile?.tailScale ?? 0.7);
    marker.setPosition(p.x, p.y);
    marker.setScale(baseScale * zoom * (selected ? 1.15 : 1));
    marker.setAlpha(on ? 1 : 0.3);
    marker.setTint(
      selected ? 0x9cff9c
        : !on ? 0xff8080
          : trafficLightCalibrationIsDeckLamp(lamp) ? 0x9fd0ff : 0xffffff,
    );
  });

  trafficLightCalibrationTubesFor(model).forEach((desc) => {
    const bar = preview.tubes[desc.key];
    if (!bar) return;
    const a = screenOf(desc.a);
    const b = screenOf(desc.b);
    const on = trafficLightCalibrationLampOn(anchor[desc.a]) && trafficLightCalibrationLampOn(anchor[desc.b]);
    bar.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2);
    bar.setRotation(Math.atan2(b.y - a.y, b.x - a.x));
    const thickness = ((typeof TRAFFIC_LIGHT_CONFIG !== 'undefined' && TRAFFIC_LIGHT_CONFIG.deckTubeThickness) || 2.6) * zoom;
    bar.setDisplaySize(Math.hypot(b.x - a.x, b.y - a.y) || 1, thickness);
    bar.setAlpha(on ? 0.85 : 0.15);
  });
}

function wireTrafficLightCalibrationLampDrag(which) {
  const marker = trafficLightCalibrationPreview?.markers?.[which];
  if (!marker || marker.__tlcalWired) return;
  marker.__tlcalWired = true;
  marker.on('pointerdown', () => {
    trafficLightCalibrationSelectedLamp = which;
    layoutTrafficLightCalibrationPreview();
    renderTrafficLightCalibrationPanel();
  });
  marker.on('drag', (pointer, dragX, dragY) => {
    const model = trafficLightCalibrationCurrentModel();
    const current = trafficLightCalibrationPreview;
    if (!model || !current) return;
    trafficLightCalibrationSelectedLamp = which;
    const zoom = trafficLightCalibrationZoom || 1;
    const anchor = trafficLightCalibrationEffectiveAnchor(model, trafficLightCalibrationView);
    anchor[which] = [
      (dragX - current.worldX) / zoom,
      (dragY - current.worldY) / zoom,
      anchor[which][2] ?? 1,
    ];
    trafficLightCalibrationWriteView(model, trafficLightCalibrationView, anchor);
    layoutTrafficLightCalibrationPreview();
    renderTrafficLightCalibrationPanel();
  });
  marker.on('dragend', () => {
    setTrafficLightCalibrationMessage(
      `${trafficLightCalibrationCurrentModel()?.id} · ${trafficLightCalibrationView.toUpperCase()} `
      + `${TRAFFIC_LIGHT_CALIBRATION_LAMP_LABELS[which] || which} 已記錄`,
      'success',
    );
  });
}

function trafficLightCalibrationApplyToSelected(fn) {
  const model = trafficLightCalibrationCurrentModel();
  if (!model || !trafficLightCalibrationActive) return;
  const anchor = trafficLightCalibrationEffectiveAnchor(model, trafficLightCalibrationView);
  const which = trafficLightCalibrationSelectedLamp;
  anchor[which] = fn([...anchor[which]]);
  trafficLightCalibrationWriteView(model, trafficLightCalibrationView, anchor);
  layoutTrafficLightCalibrationPreview();
  renderTrafficLightCalibrationPanel();
}

function nudgeTrafficLightCalibrationLamp(dx, dy) {
  trafficLightCalibrationApplyToSelected((v) => [v[0] + dx, v[1] + dy, v[2] ?? 1]);
}

function toggleTrafficLightCalibrationLamp() {
  trafficLightCalibrationApplyToSelected((v) => [v[0], v[1], (v.length < 3 || v[2]) ? 0 : 1]);
  const on = trafficLightCalibrationLampOn(
    trafficLightCalibrationEffectiveAnchor(trafficLightCalibrationCurrentModel(), trafficLightCalibrationView)[
      trafficLightCalibrationSelectedLamp],
  );
  setTrafficLightCalibrationMessage(
    `${TRAFFIC_LIGHT_CALIBRATION_LAMP_LABELS[trafficLightCalibrationSelectedLamp]} ${on ? '開' : '關'}`,
    'info',
  );
}

// ── Live on-road vehicles of the edited model ───────────────────────────────

function refreshTrafficLightCalibrationLiveVehicles(modelId) {
  const scene = trafficLightCalibrationScene;
  if (!scene || typeof updateTrafficVehicleLights !== 'function') return;
  const touch = (vehicle) => {
    if (!vehicle || !vehicle.lastPosition) return;
    if (modelId && vehicle.model?.id !== modelId) return;
    updateTrafficVehicleLights(vehicle, vehicle.lastPosition, true, true);
  };
  scene.trafficVisualState?.vehicles?.forEach(touch);
  if (scene.trafficVisualState?.iceCreamEvent) touch(scene.trafficVisualState.iceCreamEvent);
  scene.transportVisualState?.vehicles?.forEach(touch);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

function startTrafficLightCalibrator(scene) {
  trafficLightCalibrationActive = true;
  trafficLightCalibrationScene = scene;
  if (scene) scene.trafficLightCalibrationActive = true;
  createTrafficLightCalibrationPanel();
  spawnTrafficLightCalibrationPreview();
  renderTrafficLightCalibrationPanel();
  setTrafficLightCalibrationMessage('揀一粒燈拖曳／方向鍵微調；X 開關該燈', 'info');

  trafficLightCalibrationKeyHandler = (event) => {
    if (!trafficLightCalibrationActive) return;
    const step = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowLeft') nudgeTrafficLightCalibrationLamp(-step, 0);
    else if (event.key === 'ArrowRight') nudgeTrafficLightCalibrationLamp(step, 0);
    else if (event.key === 'ArrowUp') nudgeTrafficLightCalibrationLamp(0, -step);
    else if (event.key === 'ArrowDown') nudgeTrafficLightCalibrationLamp(0, step);
    else if (event.key === 'x' || event.key === 'X') toggleTrafficLightCalibrationLamp();
    else return;
    event.preventDefault();
  };
  globalThis.addEventListener?.('keydown', trafficLightCalibrationKeyHandler);
}

function teardownTrafficLightCalibrator() {
  trafficLightCalibrationActive = false;
  destroyTrafficLightCalibrationPreview();
  if (trafficLightCalibrationScene) trafficLightCalibrationScene.trafficLightCalibrationActive = false;
  if (trafficLightCalibrationKeyHandler) {
    globalThis.removeEventListener?.('keydown', trafficLightCalibrationKeyHandler);
    trafficLightCalibrationKeyHandler = null;
  }
  if (trafficLightCalibrationPanel?.root) trafficLightCalibrationPanel.root.hidden = true;
}

function toggleTrafficLightCalibrator(scene) {
  if (trafficLightCalibrationActive) {
    teardownTrafficLightCalibrator();
    return false;
  }
  if (!scene || typeof isVisualRouteCalibrationTestModeEnabled !== 'function'
    || !isVisualRouteCalibrationTestModeEnabled()) return false;
  startTrafficLightCalibrator(scene);
  return true;
}

function stepTrafficLightCalibrationModel(delta) {
  const models = trafficLightCalibrationModels();
  if (models.length === 0) return;
  trafficLightCalibrationModelIndex =
    ((trafficLightCalibrationModelIndex + delta) % models.length + models.length) % models.length;
  spawnTrafficLightCalibrationPreview();
}

function setTrafficLightCalibrationView(view) {
  if (!TRAFFIC_LIGHT_CALIBRATION_VIEWS.includes(view)) return;
  trafficLightCalibrationView = view;
  spawnTrafficLightCalibrationPreview();
}

function setTrafficLightCalibrationZoom(delta) {
  trafficLightCalibrationZoom = Math.max(
    TRAFFIC_LIGHT_CALIBRATION_MIN_ZOOM,
    Math.min(TRAFFIC_LIGHT_CALIBRATION_MAX_ZOOM, trafficLightCalibrationZoom + delta),
  );
  layoutTrafficLightCalibrationPreview();
  renderTrafficLightCalibrationPanel();
}

function resetTrafficLightCalibrationView() {
  const model = trafficLightCalibrationCurrentModel();
  const bucket = trafficLightCalibrationOverrides[model?.id];
  if (bucket) {
    delete bucket[trafficLightCalibrationView];
    if (Object.keys(bucket).length === 0) delete trafficLightCalibrationOverrides[model.id];
    persistTrafficLightCalibrationOverrides();
  }
  refreshTrafficLightCalibrationLiveVehicles(model?.id);
  layoutTrafficLightCalibrationPreview();
  renderTrafficLightCalibrationPanel();
  setTrafficLightCalibrationMessage(`${trafficLightCalibrationView.toUpperCase()} 已還原預設`, 'info');
}

function mirrorTrafficLightCalibrationView() {
  const model = trafficLightCalibrationCurrentModel();
  const target = TRAFFIC_LIGHT_CALIBRATION_MIRROR[trafficLightCalibrationView];
  if (!model || !target) return;
  const source = trafficLightCalibrationEffectiveAnchor(model, trafficLightCalibrationView);
  const mirrored = {};
  trafficLightCalibrationLampsFor(model).forEach((lamp) => {
    const src = source[TRAFFIC_LIGHT_CALIBRATION_LAMP_MIRROR[lamp] || lamp];
    mirrored[lamp] = [-src[0], src[1], src[2] ?? 1];
  });
  trafficLightCalibrationWriteView(model, target, mirrored);
  setTrafficLightCalibrationMessage(
    `${trafficLightCalibrationView.toUpperCase()} → ${target.toUpperCase()} 已鏡像`,
    'success',
  );
  renderTrafficLightCalibrationPanel();
}

// ── Export ─────────────────────────────────────────────────────────────────

function trafficLightCalibrationLampLiteral(lamp, triple) {
  const on = triple.length < 3 || triple[2];
  return on
    ? `${lamp}: [${triple[0]}, ${triple[1]}]`
    : `${lamp}: [${triple[0]}, ${triple[1]}, 0]`;
}

function trafficLightCalibrationAnchorsLiteral(model, anchorSet, indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const lampKeys = trafficLightCalibrationLampsFor(model);
  const rows = TRAFFIC_LIGHT_CALIBRATION_VIEWS.map((view) => {
    const a = anchorSet[view];
    const lamps = lampKeys.map((k) => trafficLightCalibrationLampLiteral(k, a[k])).join(', ');
    return `${inner}${view}: { ${lamps} },`;
  });
  return `${pad}lightAnchors: {\n${rows.join('\n')}\n${pad}},`;
}

function trafficLightCalibrationCompleteModel(modelId) {
  const override = getTrafficLightCalibrationOverride(modelId);
  if (override) return override;
  const model = typeof TRAFFIC_MODEL_BY_ID !== 'undefined' ? TRAFFIC_MODEL_BY_ID.get(modelId) : null;
  const defaults = trafficLightCalibrationDefaultAnchors(model) || {};
  const lampKeys = trafficLightCalibrationLampsFor(model);
  const out = {};
  TRAFFIC_LIGHT_CALIBRATION_VIEWS.forEach((view) => {
    out[view] = trafficLightCalibrationCompleteView(defaults[view], null, lampKeys);
  });
  return out;
}

function buildTrafficLightCalibrationCurrentSnippet() {
  const model = trafficLightCalibrationCurrentModel();
  if (!model) return '';
  return `// ${model.id}\n${trafficLightCalibrationAnchorsLiteral(
    model, trafficLightCalibrationCompleteModel(model.id), 4,
  )}`;
}

function buildTrafficLightCalibrationRecord() {
  const models = {};
  Object.keys(trafficLightCalibrationOverrides).forEach((modelId) => {
    const complete = getTrafficLightCalibrationOverride(modelId);
    if (complete) models[modelId] = complete;
  });
  return {
    schemaVersion: TRAFFIC_LIGHT_CALIBRATION_SCHEMA_VERSION,
    kind: 'traffic-vehicle-lamp-anchors',
    note: 'Each view carries every lamp the model uses as [dx, dy] or [dx, dy, 0] (0 = off) screen-pixel offsets from the vehicle draw position. Paste each block into the matching createTrafficModel({...}) in traffic-visuals.js.',
    models,
    recordedAt: new Date().toISOString(),
  };
}

function copyTrafficLightCalibrationText(text, okMessage) {
  const copy = typeof copyVisualRouteCalibrationText === 'function'
    ? copyVisualRouteCalibrationText(text)
    : Promise.reject(new Error('clipboard helper missing'));
  copy
    .then(() => setTrafficLightCalibrationMessage(okMessage, 'success'))
    .catch(() => setTrafficLightCalibrationMessage('複製失敗', 'error'));
}

// ── Panel ──────────────────────────────────────────────────────────────────

function createTrafficLightCalibrationPanel() {
  if (trafficLightCalibrationPanel) return trafficLightCalibrationPanel;
  if (typeof document === 'undefined' || !document.body) return null;
  if (!document.getElementById('traffic-light-calibrator-style')) {
    const style = document.createElement('style');
    style.id = 'traffic-light-calibrator-style';
    style.textContent = `
      #traffic-light-calibrator-panel {
        position: fixed; right: 14px; bottom: 18px; z-index: 100000;
        width: min(320px, calc(100vw - 28px)); box-sizing: border-box; padding: 12px;
        border: 1px solid rgba(255, 209, 122, 0.72); border-radius: 12px;
        color: #fff6e6; background: rgba(28, 18, 6, 0.94);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        user-select: text; pointer-events: auto; backdrop-filter: blur(8px);
      }
      #traffic-light-calibrator-panel[hidden] { display: none !important; }
      #traffic-light-calibrator-panel .tlc-title { font-weight: 800; color: #ffd17a; letter-spacing: .04em; margin-bottom: 6px; }
      #traffic-light-calibrator-panel .tlc-hint { color: #e6c79a; margin-bottom: 8px; }
      #traffic-light-calibrator-panel .tlc-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 5px 0; }
      #traffic-light-calibrator-panel .tlc-model { font-weight: 700; color: #fff; flex: 1; text-align: center; }
      #traffic-light-calibrator-panel .tlc-views { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 6px 0; }
      #traffic-light-calibrator-panel .tlc-views button[data-active="true"] { background: #b9761c; border-color: #ffd58a; color: #1c1206; }
      #traffic-light-calibrator-panel .tlc-lamps { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 6px 0; }
      #traffic-light-calibrator-panel .tlc-lamps button[data-active="true"] { background: #2f7d34; border-color: #9cff9c; color: #06210f; }
      #traffic-light-calibrator-panel .tlc-lamps button[data-off="true"] { opacity: .55; text-decoration: line-through; }
      #traffic-light-calibrator-panel .tlc-readout { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; margin: 6px 0; }
      #traffic-light-calibrator-panel .tlc-readout span:nth-child(odd) { color: #d8b98c; }
      #traffic-light-calibrator-panel .tlc-readout span:nth-child(even) { text-align: right; color: #fff; }
      #traffic-light-calibrator-panel .tlc-readout span[data-active="true"] { color: #9be89b; font-weight: 700; }
      #traffic-light-calibrator-panel .tlc-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
      #traffic-light-calibrator-panel button {
        border: 1px solid #a5762f; border-radius: 7px; padding: 6px 7px;
        color: #fff6e6; background: #48310f; font: inherit; cursor: pointer;
      }
      #traffic-light-calibrator-panel button:hover { background: #654620; }
      #traffic-light-calibrator-panel .tlc-message { min-height: 16px; margin-top: 7px; color: #e6c79a; }
      #traffic-light-calibrator-panel .tlc-message[data-tone="success"] { color: #9be89b; }
      #traffic-light-calibrator-panel .tlc-message[data-tone="error"] { color: #ff9a9a; }
    `;
    document.head.appendChild(style);
  }
  const root = document.createElement('section');
  root.id = 'traffic-light-calibrator-panel';
  root.hidden = true;
  root.setAttribute('aria-label', 'Traffic vehicle lamp position calibrator');
  root.innerHTML = `
    <div class="tlc-title">車燈位置微調</div>
    <div class="tlc-hint">撳燈揀，再撳一次開／關；拖曳或方向鍵微調</div>
    <div class="tlc-row">
      <button type="button" data-action="model-prev">◀</button>
      <span class="tlc-model"></span>
      <button type="button" data-action="model-next">▶</button>
    </div>
    <div class="tlc-views">
      <button type="button" data-view="ne">NE</button>
      <button type="button" data-view="nw">NW</button>
      <button type="button" data-view="se">SE</button>
      <button type="button" data-view="sw">SW</button>
    </div>
    <div class="tlc-lamps"></div>
    <div class="tlc-readout"></div>
    <div class="tlc-row">
      <span>放大</span>
      <button type="button" data-action="zoom-out">−</button>
      <span class="tlc-zoom"></span>
      <button type="button" data-action="zoom-in">＋</button>
    </div>
    <div class="tlc-actions">
      <button type="button" data-action="toggle-lamp">開／關呢粒</button>
      <button type="button" data-action="mirror">鏡像對面 view</button>
      <button type="button" data-action="reset-view">還原呢個 view</button>
      <button type="button" data-action="copy-current">複製呢架 JS</button>
      <button type="button" data-action="copy-all">複製全部 JSON</button>
      <button type="button" data-action="clear-storage">清除儲存</button>
      <button type="button" data-action="close">收起</button>
    </div>
    <div class="tlc-message"></div>
  `;
  document.body.appendChild(root);

  root.querySelector('[data-action="model-prev"]').addEventListener('click', () => stepTrafficLightCalibrationModel(-1));
  root.querySelector('[data-action="model-next"]').addEventListener('click', () => stepTrafficLightCalibrationModel(1));
  root.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => setTrafficLightCalibrationView(btn.dataset.view));
  });
  root.querySelector('[data-action="toggle-lamp"]').addEventListener('click', () => toggleTrafficLightCalibrationLamp());
  root.querySelector('[data-action="zoom-out"]').addEventListener('click', () => setTrafficLightCalibrationZoom(-1));
  root.querySelector('[data-action="zoom-in"]').addEventListener('click', () => setTrafficLightCalibrationZoom(1));
  root.querySelector('[data-action="mirror"]').addEventListener('click', () => mirrorTrafficLightCalibrationView());
  root.querySelector('[data-action="reset-view"]').addEventListener('click', () => resetTrafficLightCalibrationView());
  root.querySelector('[data-action="copy-current"]').addEventListener('click', () => {
    copyTrafficLightCalibrationText(buildTrafficLightCalibrationCurrentSnippet(), '呢架 JS 已複製');
  });
  root.querySelector('[data-action="copy-all"]').addEventListener('click', () => {
    copyTrafficLightCalibrationText(JSON.stringify(buildTrafficLightCalibrationRecord(), null, 2), '全部 JSON 已複製');
  });
  root.querySelector('[data-action="clear-storage"]').addEventListener('click', () => {
    Object.keys(trafficLightCalibrationOverrides).forEach((key) => delete trafficLightCalibrationOverrides[key]);
    persistTrafficLightCalibrationOverrides();
    refreshTrafficLightCalibrationLiveVehicles(null);
    layoutTrafficLightCalibrationPreview();
    renderTrafficLightCalibrationPanel();
    setTrafficLightCalibrationMessage('已清除所有暫存校正', 'info');
  });
  root.querySelector('[data-action="close"]').addEventListener('click', () => teardownTrafficLightCalibrator());

  trafficLightCalibrationPanel = {
    root,
    model: root.querySelector('.tlc-model'),
    views: root.querySelector('.tlc-views'),
    lamps: root.querySelector('.tlc-lamps'),
    readout: root.querySelector('.tlc-readout'),
    zoom: root.querySelector('.tlc-zoom'),
    message: root.querySelector('.tlc-message'),
  };
  return trafficLightCalibrationPanel;
}

function setTrafficLightCalibrationMessage(text, tone = 'info') {
  if (!trafficLightCalibrationPanel) return;
  trafficLightCalibrationPanel.message.textContent = String(text || '');
  trafficLightCalibrationPanel.message.dataset.tone = tone;
}

function trafficLightCalibrationSelectLamp(lamp) {
  if (trafficLightCalibrationSelectedLamp === lamp) {
    toggleTrafficLightCalibrationLamp();
    return;
  }
  trafficLightCalibrationSelectedLamp = lamp;
  layoutTrafficLightCalibrationPreview();
  renderTrafficLightCalibrationPanel();
}

function renderTrafficLightCalibrationPanel() {
  const panel = trafficLightCalibrationPanel;
  if (!panel) return;
  panel.root.hidden = !trafficLightCalibrationActive;
  if (!trafficLightCalibrationActive) return;

  const models = trafficLightCalibrationModels();
  const model = trafficLightCalibrationCurrentModel();
  const index = model ? models.indexOf(model) : -1;
  panel.model.textContent = model ? `${model.id}  (${index + 1}/${models.length})` : '(無車款)';

  panel.views.querySelectorAll('[data-view]').forEach((btn) => {
    const edited = !!trafficLightCalibrationOverrides[model?.id]?.[btn.dataset.view];
    btn.dataset.active = String(btn.dataset.view === trafficLightCalibrationView);
    btn.textContent = `${btn.dataset.view.toUpperCase()}${edited ? ' ✓' : ''}`;
  });
  panel.zoom.textContent = `${trafficLightCalibrationZoom}×`;

  const lampKeys = model ? trafficLightCalibrationLampsFor(model) : TRAFFIC_LIGHT_CALIBRATION_EXT_LAMPS;
  const anchor = model
    ? trafficLightCalibrationEffectiveAnchor(model, trafficLightCalibrationView)
    : trafficLightCalibrationCompleteView(null, null, lampKeys);

  panel.lamps.replaceChildren(...lampKeys.map((lamp) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.lamp = lamp;
    btn.dataset.active = String(lamp === trafficLightCalibrationSelectedLamp);
    btn.dataset.off = String(!trafficLightCalibrationLampOn(anchor[lamp]));
    btn.textContent = TRAFFIC_LIGHT_CALIBRATION_LAMP_LABELS[lamp] || lamp;
    btn.addEventListener('click', () => trafficLightCalibrationSelectLamp(lamp));
    return btn;
  }));

  panel.readout.replaceChildren();
  const addRow = (label, value, active) => {
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = value;
    if (active) { l.dataset.active = 'true'; v.dataset.active = 'true'; }
    panel.readout.append(l, v);
  };
  addRow('狀態', anchor.custom ? '已校正' : '預設值');
  lampKeys.forEach((lamp) => {
    const on = trafficLightCalibrationLampOn(anchor[lamp]);
    addRow(
      TRAFFIC_LIGHT_CALIBRATION_LAMP_LABELS[lamp] || lamp,
      `${trafficLightCalibrationRound(anchor[lamp][0])}, ${trafficLightCalibrationRound(anchor[lamp][1])}`
      + (on ? '' : ' (關)'),
      lamp === trafficLightCalibrationSelectedLamp,
    );
  });
}

// ── Exports ────────────────────────────────────────────────────────────────

const trafficLightCalibratorTestApi = {
  TRAFFIC_LIGHT_CALIBRATION_SCHEMA_VERSION,
  TRAFFIC_LIGHT_CALIBRATION_VIEWS,
  TRAFFIC_LIGHT_CALIBRATION_EXT_LAMPS,
  getTrafficLightCalibrationOverride,
  isTrafficLightCalibrationActive,
  isTrafficLightCalibrationInputActive,
  buildTrafficLightCalibrationRecord,
  buildTrafficLightCalibrationCurrentSnippet,
  toggleTrafficLightCalibrator,
  _setOverrideForTest(modelId, view, anchor) {
    const bucket = trafficLightCalibrationOverrides[modelId] || (trafficLightCalibrationOverrides[modelId] = {});
    bucket[view] = anchor;
  },
  _clearOverridesForTest() {
    Object.keys(trafficLightCalibrationOverrides).forEach((k) => delete trafficLightCalibrationOverrides[k]);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = trafficLightCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleTrafficLightCalibrator,
    teardownTrafficLightCalibrator,
    getTrafficLightCalibrationOverride,
    isTrafficLightCalibrationActive,
    isTrafficLightCalibrationInputActive,
  });
}
