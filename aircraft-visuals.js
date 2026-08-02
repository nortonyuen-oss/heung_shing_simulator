// Camera-aware airport aircraft activity.
// A from-scratch build following vessel-visuals.js's own precedent: an
// earlier combined airport+harbor "gateway visuals" prototype stalled the
// frame and was reverted (see git stash "gateway-visuals feature + perf
// fixes ... hang fixes"). Same two lessons carried forward here:
//   1. Build each visit's route once at spawn time, never per frame.
//   2. Only do ANY work - spawning, texture loading - for an airport whose
//      building sprite is actually near the camera view.
// Aircraft are simpler than vessels in one big way: no pathfinding. A ship
// has to search open water to a coastline-dependent exit; a plane just flies
// a fixed, pre-calibrated route relative to its one airport, so picking a
// route is a handful of Math.hypot calls rather than a Dijkstra pass - there
// is no expensive-search result worth caching across visits here.

const AIRCRAFT_VISUAL_CONFIG = Object.freeze({
  zoomMin: 0.75,
  viewportPaddingTiles: 3,
  // Spawning itself is no longer cooldown-paced (see updateAircraftAirports)
  // - every gate refills as soon as it's physically free, so occupancy stays
  // at the gate count whenever possible. retryCooldownMs/weatherRecovery*
  // are the only remaining uses of a per-airport cooldown: a backoff after a
  // genuine failure, and a grace period right after severe weather clears.
  retryCooldownMs: 10000,
  weatherRecoveryMinMs: 10000,
  weatherRecoveryMaxMs: 30000,
  // Tuned empirically (see the "busy airport" stochastic test) so the
  // runway mutex's own throughput ceiling settles at an average of ~3-4
  // concurrent aircraft rather than ~2 - the mutex, not the gate count
  // (AIRCRAFT_GATE_KEYS.length, 6), is the actual bottleneck on how many
  // planes accumulate before one is ready to leave.
  parkedDwellMinMs: 65000,
  parkedDwellMaxMs: 95000,
  aircraftScale: 0.30,
  // Landing roll (L2->L3) and takeoff roll (T0->T1) - 2.2x the original 0.62.
  groundSpeedTilesPerSecond: 1.364,
  // Gate taxiing (L3<->gate, gate<->T0) - 2x the original 0.30.
  taxiSpeedTilesPerSecond: 0.60,
  // Airborne legs only (inbound descent L0->L2 / departure climb T1->T3) -
  // taxi and ground roll speeds have their own separate multipliers above.
  airSpeedTilesPerSecond: 2.2,
  // The approach (L0->L1->L2) and departure (T1->T2->T3) legs fly a curve,
  // not a straight line - this many samples of the quadratic Bezier become a
  // dense-enough polyline to look smooth while reusing
  // buildVesselTrackMetrics/evaluateVesselLogicalTrack unchanged.
  curveSamples: 16,
  altitudePeakPixels: 150,
  // >1 = altitude changes fastest near the ground (see evaluateAircraftAltitude).
  altitudeEaseExponent: 3,
  maxDeltaMs: 1000,
  maxLoadAttempts: 2,
});

const AIRCRAFT_AUDIO_CONFIG = Object.freeze({
  landing: Object.freeze({ key: 'aircraft_landing', baseVolume: 0.55 }),
  takeoff: Object.freeze({ key: 'aircraft_takeoff', baseVolume: 0.60 }),
});

const AIRCRAFT_DIRECTIONS = Object.freeze(['ne', 'nw', 'se', 'sw']);
const AIRCRAFT_LIVERIES = Object.freeze(['UO', 'cathy']);
// The source PNGs are occasionally replaced without changing their filename
// (see the airport model's own cacheVersion in constants.js for the same
// reason). Bump this whenever the aircraft art changes so a stale file://
// cache hit can't keep serving the previous artwork after an update.
const AIRCRAFT_ASSET_CACHE_VERSION = '20260802-realign-v1';
const AIRCRAFT_ASSET_REGISTRY = Object.freeze(Object.fromEntries(
  AIRCRAFT_LIVERIES.map((livery) => [
    livery,
    Object.freeze(Object.fromEntries(AIRCRAFT_DIRECTIONS.map((direction) => [
      direction,
      Object.freeze({
        key: `aircraft_${livery}_${direction}`,
        path: `Models/aircraft/${livery}-${direction.toUpperCase()}_fixed.png`,
      }),
    ]))),
  ]),
));

const AIRCRAFT_GATE_KEYS = Object.freeze(['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6']);

function aircraftClamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function aircraftRandomBetween(min, max, random = Math.random) {
  return min + aircraftClamp(random(), 0, 1) * (max - min);
}

function isAircraftSevereWeather(weather) {
  return ['signal8', 'signal9', 'signal10'].includes(weather?.typhoonStage);
}

function getAircraftRouteMetadata() {
  return typeof AIRCRAFT_ROUTE_METADATA === 'undefined' ? null : AIRCRAFT_ROUTE_METADATA;
}

function getAircraftRouteMetadataId() {
  return String(getAircraftRouteMetadata()?.calibrationId || 'legacy-aircraft-route');
}

// The calibrator lets you choose a facing per point (click a marker to cycle
// it), but only the parked phase actually uses the stored value - the four
// runway points derive their facing from the direction of travel instead,
// which is correct for a moving plane in every case a fixed value can't be.
function getAircraftGateFacingDirection(gateKey, fallback) {
  const direction = getAircraftRouteMetadata()?.pointsByKey?.[gateKey]?.direction;
  return AIRCRAFT_DIRECTIONS.includes(direction) ? direction : fallback;
}

// ── Audio ───────────────────────────────────────────────────────────────────

function getAircraftEventAudioVolume(scene, position, baseVolume = 0.5) {
  if (!position) return 0;
  const rect = getVesselCameraRect(scene, 0);
  const camera = scene?.cameras?.main;
  if (!rect || !camera) return 0;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const distance = Math.hypot(position.x - centerX, position.y - centerY);
  const audibleRadius = Math.max(rect.width, rect.height) * 0.9;
  const proximity = aircraftClamp(1 - distance / Math.max(1, audibleRadius), 0, 1);
  const zoomFade = aircraftClamp(
    (camera.zoom - 0.5) / Math.max(0.01, AIRCRAFT_VISUAL_CONFIG.zoomMin - 0.5),
    0,
    1,
  );
  const ambientMix = typeof getStoredAmbientVolume === 'function' ? getStoredAmbientVolume() : 1;
  return aircraftClamp(baseVolume * proximity * zoomFade * ambientMix, 0, 1);
}

function stopAircraftEventSound(event) {
  const sound = event?.sound;
  if (!sound) return;
  sound.off?.('complete');
  sound.stop?.();
  sound.destroy?.();
  event.sound = null;
  event.soundPausedForSimulation = false;
}

function startAircraftEventSound(scene, event, audioConfig) {
  stopAircraftEventSound(event);
  const audioCache = scene?.cache?.audio;
  const audioIsReady = audioCache?.has?.(audioConfig.key)
    ?? audioCache?.exists?.(audioConfig.key)
    ?? true;
  if (!scene?.sound || scene.sound.locked || !audioIsReady) return false;
  const sound = scene.sound.add(audioConfig.key, {
    loop: false,
    volume: getAircraftEventAudioVolume(scene, event.lastWorld, audioConfig.baseVolume),
  });
  sound.once?.('complete', () => {
    if (event.sound !== sound) return;
    sound.destroy?.();
    event.sound = null;
    event.soundPausedForSimulation = false;
  });
  sound.play?.();
  event.sound = sound;
  event.soundBaseVolume = audioConfig.baseVolume;
  event.soundPausedForSimulation = false;
  return true;
}

function updateAircraftEventSound(scene, event) {
  const sound = event?.sound;
  if (!sound) return;
  sound.setVolume?.(getAircraftEventAudioVolume(scene, event.lastWorld, event.soundBaseVolume));
  const paused = typeof simPaused !== 'undefined' && simPaused;
  if (paused && !event.soundPausedForSimulation) {
    sound.pause?.();
    event.soundPausedForSimulation = true;
  } else if (!paused && event.soundPausedForSimulation) {
    sound.resume?.();
    event.soundPausedForSimulation = false;
  }
}

// ── Scene state + texture bundle loading ───────────────────────────────────────

function getAircraftVisualState(scene) {
  if (!scene) return null;
  if (!scene.aircraftVisualState) {
    scene.aircraftVisualState = {
      airportStates: new Map(),
      bundleStatus: 'unloaded', // 'unloaded' | 'loading' | 'ready' | 'failed'
      bundleAttempts: 0,
      loaderActive: false,
      loaderWaiting: false,
      nextId: 1,
      severeWeatherActive: false,
    };
  }
  return scene.aircraftVisualState;
}

function getAircraftBundleAssets() {
  return AIRCRAFT_LIVERIES.flatMap((livery) => (
    AIRCRAFT_DIRECTIONS.map((direction) => AIRCRAFT_ASSET_REGISTRY[livery][direction])
  ));
}

function aircraftBundleIsReady(scene) {
  return getAircraftBundleAssets().every((asset) => scene?.textures?.exists?.(asset.key));
}

function finalizeAircraftBundleLoad(scene, state) {
  if (aircraftBundleIsReady(scene)) {
    state.bundleStatus = 'ready';
  } else if (state.bundleAttempts < AIRCRAFT_VISUAL_CONFIG.maxLoadAttempts) {
    state.bundleStatus = 'unloaded';
  } else {
    state.bundleStatus = 'failed';
  }
  state.loaderActive = false;
}

function pumpAircraftTextureQueue(scene, state) {
  if (state.loaderActive || state.bundleStatus !== 'unloaded') return;
  if (scene.load?.isLoading?.()) {
    if (!state.loaderWaiting) {
      state.loaderWaiting = true;
      scene.load.once('complete', () => {
        state.loaderWaiting = false;
        pumpAircraftTextureQueue(scene, state);
      });
    }
    return;
  }
  if (aircraftBundleIsReady(scene)) {
    state.bundleStatus = 'ready';
    return;
  }
  state.bundleStatus = 'loading';
  state.bundleAttempts++;
  state.loaderActive = true;
  let queued = 0;
  getAircraftBundleAssets().forEach((asset) => {
    if (scene.textures.exists(asset.key)) return;
    const resolved = typeof resolveModelAssetPath === 'function'
      ? resolveModelAssetPath(asset.path)
      : asset.path;
    const separator = resolved.includes('?') ? '&' : '?';
    scene.load.image(asset.key, `${resolved}${separator}aircraftLoad=${state.bundleAttempts}&v=${AIRCRAFT_ASSET_CACHE_VERSION}`);
    queued++;
  });
  if (queued === 0) {
    finalizeAircraftBundleLoad(scene, state);
    return;
  }
  scene.load.once('complete', () => finalizeAircraftBundleLoad(scene, state));
  scene.load.start();
}

function requestAircraftBundle(scene) {
  const state = getAircraftVisualState(scene);
  if (!state || state.bundleStatus === 'failed' || state.bundleStatus === 'loading') return;
  if (aircraftBundleIsReady(scene)) {
    state.bundleStatus = 'ready';
    return;
  }
  pumpAircraftTextureQueue(scene, state);
}

// ── Airport lookup + route geometry ─────────────────────────────────────────────

function getAircraftAirportEntries() {
  return typeof getBuildingFacilityEntries === 'function' ? getBuildingFacilityEntries('airport') : [];
}

function getAircraftFacilitySprite(scene, entry) {
  return scene?.buildingSprites?.get?.(entry.id) ?? null;
}

function aircraftFacilityIsNearView(scene, entry, rect) {
  const sprite = getAircraftFacilitySprite(scene, entry);
  return !!sprite && vesselPointInRect({ x: sprite.x, y: sprite.y }, rect);
}

// The airport sprite is a single static image - unlike the container port's
// four harbor_ll/lr/ul/ur art variants, it never redraws to face a different
// way when the map rotates (see aircraft-route-metadata.js). But rotating
// still REPOSITIONS the sprite on screen exactly like any other building
// (positionAllTiles, called from rotateMap in main.js) - only its painted
// content stays fixed. So a calibrated point's on-screen position isn't "the
// anchor tile projected through the calibration rotation" (that assumes the
// airport sprite never moved, which is wrong the moment the player rotates)
// - it's "wherever the anchor tile is RIGHT NOW" plus a screen-pixel delta
// computed at the fixed calibration rotation, since that delta is what stays
// glued to the unrotated artwork no matter where the sprite has since moved.
//
// The underlying isoToScreen formula is linear in row/col for any one fixed
// rotation branch, so this delta depends only on (dRow, dCol) - never on the
// anchor's own absolute position - which is what makes "translate, don't
// re-derive" work here.
function getAircraftLocalOffset(dRow, dCol, rotation) {
  let dVizCol = dCol;
  let dVizRow = dRow;
  if (rotation === 1) {
    dVizCol = -dRow;
    dVizRow = dCol;
  } else if (rotation === 2) {
    dVizCol = -dCol;
    dVizRow = -dRow;
  } else if (rotation === 3) {
    dVizCol = dRow;
    dVizRow = -dCol;
  }
  const tileWidth = typeof TILE_WIDTH === 'number' ? TILE_WIDTH : 100;
  const tileHeight = typeof TILE_HEIGHT === 'number' ? TILE_HEIGHT : 50;
  return {
    dx: (dVizCol - dVizRow) * (tileWidth / 2),
    dy: (dVizCol + dVizRow) * (tileHeight / 2),
  };
}

// getBuildingAnchor (main.js) does NOT anchor a multi-tile building sprite to
// its stored top-left tile - it picks whichever footprint corner is
// currently the visually-lowest point of the diamond, and WHICH corner that
// is depends on live rotation (see that function's own comment for the
// derivation: rot0->bottom-right, rot1->top-right, rot2->top-left,
// rot3->bottom-left). getAircraftLocalOffset's delta was calibrated
// relative to the stored top-left tile (dRow/dCol in aircraft-route-metadata
// are anchor-row/col-relative), not whichever corner the sprite happens to
// pivot on - so the delta has to be re-based onto that corner (at the FIXED
// calibration rotation, matching the fixed-rotation delta itself) before
// it's added to the sprite's real live anchor, or the two disagree about
// what "the anchor" even means the moment live rotation isn't the
// calibration rotation.
function getAircraftBuildingAnchorCornerOffset(footprintCols, footprintRows, rotation) {
  if (rotation === 1) return { dRow: 0, dCol: footprintCols - 1 };
  if (rotation === 2) return { dRow: 0, dCol: 0 };
  if (rotation === 3) return { dRow: footprintRows - 1, dCol: 0 };
  return { dRow: footprintRows - 1, dCol: footprintCols - 1 };
}

function getAircraftGroundPoint(scene, anchor, row, col) {
  const fixedRotation = Number(getAircraftRouteMetadata()?.calibratedMapRotation) || 0;
  const footprintCols = Number(anchor.footprintCols) || 1;
  const footprintRows = Number(anchor.footprintRows) || 1;
  const liveAnchor = typeof getBuildingAnchor === 'function'
    ? getBuildingAnchor(anchor.row, anchor.col, footprintCols, footprintRows)
    : (typeof isoToScreen === 'function' ? isoToScreen(anchor.col, anchor.row) : { x: 0, y: 0 });
  const corner = getAircraftBuildingAnchorCornerOffset(footprintCols, footprintRows, fixedRotation);
  const offset = getAircraftLocalOffset(row - anchor.row - corner.dRow, col - anchor.col - corner.dCol, fixedRotation);
  const x = liveAnchor.x + offset.dx;
  const y = liveAnchor.y + offset.dy;
  const surfaceOffset = (typeof BUILDING_SURFACE_Y_OFFSET === 'number' ? BUILDING_SURFACE_Y_OFFSET : 82)
    + (typeof TILE_HEIGHT === 'number' ? TILE_HEIGHT : 50) / 2;
  return {
    x: x + scene.offsetX,
    y: y + scene.offsetY - surfaceOffset,
    depthY: y + (typeof TILE_HEIGHT === 'number' ? TILE_HEIGHT : 50) / 2,
  };
}

// Absolute logical row/col for every calibrated point, relative to one
// airport's anchor tile. Recomputed on demand rather than persisted - it's 7
// additions, not a search result worth caching.
function getAircraftAbsolutePoints(entry) {
  const pointsByKey = getAircraftRouteMetadata()?.pointsByKey;
  if (!pointsByKey || !entry) return null;
  const points = {};
  Object.keys(pointsByKey).forEach((key) => {
    const offset = pointsByKey[key];
    const dRow = Number(offset?.dRow);
    const dCol = Number(offset?.dCol);
    if (!Number.isFinite(dRow) || !Number.isFinite(dCol)) return;
    points[key] = { row: entry.row + dRow, col: entry.col + dCol };
  });
  return points;
}

// Converts a "the curve should visibly pass through here" point - the
// intuitive thing to calibrate, and how a familiar curve tool (e.g. MS
// Paint's) behaves: you drag the curve where you want it to go, and it goes
// there - into the raw quadratic-Bezier control point that actually
// produces that result. A raw control point only pulls the curve HALFWAY
// toward itself at t=0.5 (B(0.5) = 0.5*control + 0.25*(p0+p1)), which reads
// as the curve visibly undershooting wherever it was dragged to; this
// inverts that relationship so the calibrated point IS where the curve ends
// up, not just something it leans toward.
function getAircraftBezierControlFromMidpoint(p0, midpoint, p1) {
  return {
    row: 2 * midpoint.row - (p0.row + p1.row) / 2,
    col: 2 * midpoint.col - (p0.col + p1.col) / 2,
  };
}

function evaluateQuadraticBezierPoint(p0, control, p1, t) {
  const mt = 1 - t;
  return {
    row: mt * mt * p0.row + 2 * mt * t * control.row + t * t * p1.row,
    col: mt * mt * p0.col + 2 * mt * t * control.col + t * t * p1.col,
  };
}

// Approximates a smooth arc as a dense polyline instead of evaluating the
// Bezier live during flight - lets the approach/departure legs reuse
// buildVesselTrackMetrics/evaluateVesselLogicalTrack completely unchanged
// (arc-length distance + progress lerp over N tiny straight segments looks
// exactly as smooth as a true curve at this scale) rather than building a
// second, curve-native progress system just for these two legs.
// midpoint is where the finished curve should visibly pass through at its
// halfway point (see getAircraftBezierControlFromMidpoint) - not a raw
// Bezier control point.
function buildAircraftCurvePoints(p0, midpoint, p1, samples) {
  const control = getAircraftBezierControlFromMidpoint(p0, midpoint, p1);
  const points = [];
  for (let i = 0; i <= samples; i++) {
    points.push(evaluateQuadraticBezierPoint(p0, control, p1, i / samples));
  }
  return points;
}

// Builds one visit's full route: a single ground track (L2 touchdown -> L3
// end of roll -> gate -> T0 start of roll -> T1 liftoff) plus two curved
// airborne tracks - approach (L0 spawn -> L1 curve point -> L2 touchdown)
// and departure (T1 liftoff -> T2 curve point -> T3 stable altitude). Every
// point is directly calibrated (airport-route-calibrator.js) - nothing here
// is extrapolated. gateKey is chosen by the caller (updateAircraftAirports),
// which is the only place that knows which gates are already occupied by
// other concurrent visits.
function buildAircraftRoute(entry, gateKey) {
  const points = getAircraftAbsolutePoints(entry);
  const required = [
    'approachSpawn', 'approachCurve', 'landStart', 'landEnd', gateKey,
    'takeoffStart', 'liftoff', 'departCurve', 'departureDespawn',
  ];
  if (!points || required.some((key) => !points[key])) return null;
  const gate = points[gateKey];
  const groundPoints = [points.landStart, points.landEnd, gate, points.takeoffStart, points.liftoff];
  const groundTrack = buildVesselTrackMetrics(groundPoints);
  if (groundTrack.segments.length < 4) return null;
  const approachPath = buildAircraftCurvePoints(
    points.approachSpawn, points.approachCurve, points.landStart, AIRCRAFT_VISUAL_CONFIG.curveSamples,
  );
  const departurePath = buildAircraftCurvePoints(
    points.liftoff, points.departCurve, points.departureDespawn, AIRCRAFT_VISUAL_CONFIG.curveSamples,
  );
  const approachTrack = buildVesselTrackMetrics(approachPath);
  const departureTrack = buildVesselTrackMetrics(departurePath);
  if (!approachTrack.segments.length || !departureTrack.segments.length) return null;
  return {
    routeMetadataId: getAircraftRouteMetadataId(),
    gateKey,
    groundTrack,
    approachTrack,
    departureTrack,
    landingRollDistance: groundTrack.segments[0].length,
    taxiInDistance: groundTrack.segments[0].length + groundTrack.segments[1].length,
    taxiOutDistance: groundTrack.segments[0].length + groundTrack.segments[1].length + groundTrack.segments[2].length,
  };
}

// Asymmetric, not a symmetric ease: altitude changes FAST near the ground
// (right after liftoff / right before touchdown) and levels off far from
// it, like one side of a mountain slope (a bounded, well-behaved stand-in
// for y=cot(x)'s steep-near-zero/flat-near-pi/2 shape) rather than
// bulging evenly across the whole leg. 'climb' is steepest at t=0
// (liftoff/T1) and flattens toward t=1 (T3, stable altitude); 'descend' is
// flattest at t=0 (L0, spawn) and steepens into the final dive toward t=1
// (L2, touchdown). Altitude is a pure screen-Y offset layered on top of the
// normal isoToScreen position.
function evaluateAircraftAltitude(progress, direction) {
  const t = aircraftClamp(progress, 0, 1);
  const exponent = AIRCRAFT_VISUAL_CONFIG.altitudeEaseExponent;
  const eased = direction === 'descend'
    ? 1 - Math.pow(t, exponent)
    : 1 - Math.pow(1 - t, exponent);
  return AIRCRAFT_VISUAL_CONFIG.altitudePeakPixels * eased;
}

function getAircraftTextureKey(livery, direction) {
  return AIRCRAFT_ASSET_REGISTRY[livery]?.[direction]?.key
    ?? AIRCRAFT_ASSET_REGISTRY[AIRCRAFT_LIVERIES[0]].ne.key;
}

function setAircraftSpriteTexture(sprite, key) {
  if (!sprite || sprite.texture?.key === key) return;
  sprite.setTexture(key);
}

// A plane actively airborne (altitude > 0) renders on the 'effect' layer -
// always above every building/vessel - since ground world-Y depth sorting
// does not make sense for something flying over the city. Ground phases sort
// normally alongside every other object.
function setAircraftVisual(scene, event, logicalPoint, altitudePixels, forcedDirection = null) {
  const ground = getAircraftGroundPoint(scene, event.anchor, logicalPoint.row, logicalPoint.col);
  const world = { x: ground.x, y: ground.y - altitudePixels, depthY: ground.depthY };
  // Heading is a ground-plane property (which way the compass-relative
  // flight path points) - it must not react to how fast altitude happens to
  // be changing right now. Deriving it from `world` (which bakes altitude
  // into y) let the steep-near-liftoff/near-touchdown altitude curve
  // dominate the delta right at T1/L2, snapping the sprite to the wrong
  // diagonal for a moment (looked like a sudden 90° turn). Tracked
  // separately from lastWorld, which stays altitude-inclusive since sound
  // proximity (getAircraftEventAudioVolume) should follow the visual position.
  const previousGround = event.lastGround ?? { x: ground.x - 1, y: ground.y };
  const direction = forcedDirection || getVesselTextureDirection(
    ground.x - previousGround.x,
    ground.y - previousGround.y,
    event.direction,
  );
  event.direction = direction;
  setAircraftSpriteTexture(event.sprite, getAircraftTextureKey(event.livery, direction));
  event.sprite.setPosition(world.x, world.y);
  if (typeof getWorldDepth === 'function') {
    const baseDepth = altitudePixels > 0.01
      ? getWorldDepth('effect', ground.depthY)
      : getWorldDepth('object', ground.depthY);
    // The airport is one big sprite covering the whole 12x12 footprint, so
    // ordinary world-Y depth sorting against its single anchor-based depth
    // is wrong for most of the runway/apron - the plane must always render
    // in front of it, for the whole visit, not just while airborne (mirrors
    // vessel-visuals.js's front-of-port handling for the same reason, at a
    // much larger scale here since the airport sprite is far bigger than a
    // harbor piece).
    const airportDepth = Number(event.airportSprite?.depth);
    const depth = Number.isFinite(airportDepth) ? Math.max(baseDepth, airportDepth + 1) : baseDepth;
    event.sprite.setDepth(depth);
  }
  event.lastWorld = world;
  event.lastGround = ground;
  event.lastLogical = logicalPoint;
}

function destroyAircraftEvent(scene, event) {
  stopAircraftEventSound(event);
  event?.sprite?.destroy?.();
}

function spawnAircraft(scene, state, airportState, entry, gateKey, random = Math.random) {
  if (!aircraftBundleIsReady(scene)) return false;
  const route = buildAircraftRoute(entry, gateKey);
  if (!route) return false;
  const livery = AIRCRAFT_LIVERIES[
    Math.min(AIRCRAFT_LIVERIES.length - 1, Math.floor(aircraftClamp(random(), 0, 0.999999) * AIRCRAFT_LIVERIES.length))
  ];
  const anchor = {
    row: entry.row,
    col: entry.col,
    footprintCols: Number(entry.record?.footprintCols) || 1,
    footprintRows: Number(entry.record?.footprintRows) || 1,
  };
  const start = route.approachTrack.points[0];
  const next = route.approachTrack.points[1];
  const startGround = getAircraftGroundPoint(scene, anchor, start.row, start.col);
  const nextGround = getAircraftGroundPoint(scene, anchor, next.row, next.col);
  const direction = getVesselTextureDirection(nextGround.x - startGround.x, nextGround.y - startGround.y);
  const sprite = scene.add.image(
    startGround.x,
    startGround.y - AIRCRAFT_VISUAL_CONFIG.altitudePeakPixels,
    getAircraftTextureKey(livery, direction),
  );
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
  sprite.setOrigin(0.5, 0.5);
  sprite.setScale(AIRCRAFT_VISUAL_CONFIG.aircraftScale);
  if (scene.worldMask) sprite.setMask(scene.worldMask);
  const event = {
    id: `aircraft_${state.nextId++}`,
    airportId: entry.id,
    airportSprite: getAircraftFacilitySprite(scene, entry),
    anchor,
    route,
    livery,
    sprite,
    direction,
    phase: 'inbound',
    distance: 0,
    dwellMs: 0,
    lastWorld: null,
    lastLogical: start,
    sound: null,
    soundBaseVolume: 0,
    soundPausedForSimulation: false,
  };
  airportState.events.push(event);
  setAircraftVisual(scene, event, start, AIRCRAFT_VISUAL_CONFIG.altitudePeakPixels);
  return true;
}

// A pure per-event step: mutates the event in place and returns whether it
// should stay in airportState.events (true) or be removed (false, meaning
// it's despawned - the caller owns destroying it and rolling the airport's
// cooldown, since airportState-level bookkeeping is the orchestrator's job,
// not an individual event's). runwayBusy reflects whether some OTHER event
// at this airport currently holds the shared runway (see the concurrency
// comment above updateAircraftAirports); severeWeather reflects a signal8+
// typhoon grounding all departures. Both are read only by 'parked', deciding
// whether it's clear to taxi out yet - every other phase is already
// airborne/rolling and is left to finish its current leg naturally rather
// than being interrupted mid-motion.
function updateAircraftEvent(scene, event, scaledDelta, runwayBusy, severeWeather, random = Math.random) {
  updateAircraftEventSound(scene, event);
  const recordStillExists = typeof buildingData !== 'undefined' && buildingData[event.airportId]?.type === 'airport';
  if (!recordStillExists || !event.airportSprite?.active) {
    destroyAircraftEvent(scene, event);
    return false;
  }

  if (event.phase === 'inbound') {
    const track = event.route.approachTrack;
    event.distance += (scaledDelta / 1000) * AIRCRAFT_VISUAL_CONFIG.airSpeedTilesPerSecond;
    if (event.distance >= track.total) {
      event.phase = 'landingRoll';
      event.distance = 0;
      startAircraftEventSound(scene, event, AIRCRAFT_AUDIO_CONFIG.landing);
      setAircraftVisual(scene, event, event.route.groundTrack.points[0], 0);
      return true;
    }
    const progress = track.total > 0 ? event.distance / track.total : 1;
    setAircraftVisual(
      scene,
      event,
      evaluateVesselLogicalTrack(track, event.distance),
      evaluateAircraftAltitude(progress, 'descend'),
    );
    return true;
  }

  if (event.phase === 'parked') {
    const facing = getAircraftGateFacingDirection(event.route.gateKey, event.direction);
    setAircraftVisual(scene, event, event.lastLogical, 0, facing);
    event.dwellMs -= scaledDelta;
    // Ready to leave, but either another aircraft is still using the runway
    // or a signal8+ typhoon has grounded all departures - hold at the gate
    // and re-check next tick rather than taxiing out. The dwell countdown
    // keeps running either way (it's not "paused" by the storm), so a plane
    // whose dwell already lapsed during severe weather taxis out the instant
    // conditions clear, rather than waiting out a fresh dwell on top of it.
    if (event.dwellMs > 0 || runwayBusy || severeWeather) return true;
    event.phase = 'taxiOut';
    return true;
  }

  if (event.phase === 'departing') {
    const track = event.route.departureTrack;
    event.distance += (scaledDelta / 1000) * AIRCRAFT_VISUAL_CONFIG.airSpeedTilesPerSecond;
    if (event.distance >= track.total) {
      destroyAircraftEvent(scene, event);
      return false;
    }
    const progress = track.total > 0 ? event.distance / track.total : 1;
    setAircraftVisual(
      scene,
      event,
      evaluateVesselLogicalTrack(track, event.distance),
      evaluateAircraftAltitude(progress, 'climb'),
    );
    return true;
  }

  // landingRoll / taxiIn / taxiOut / takeoff all move along the one shared
  // ground track; only the speed and the distance window differ.
  const ground = event.route.groundTrack;
  const speed = (event.phase === 'landingRoll' || event.phase === 'takeoff')
    ? AIRCRAFT_VISUAL_CONFIG.groundSpeedTilesPerSecond
    : AIRCRAFT_VISUAL_CONFIG.taxiSpeedTilesPerSecond;
  event.distance += (scaledDelta / 1000) * speed;

  if (event.phase === 'landingRoll' && event.distance >= event.route.landingRollDistance) {
    event.distance = event.route.landingRollDistance;
    event.phase = 'taxiIn';
  } else if (event.phase === 'taxiIn' && event.distance >= event.route.taxiInDistance) {
    event.distance = event.route.taxiInDistance;
    event.phase = 'parked';
    event.dwellMs = aircraftRandomBetween(
      AIRCRAFT_VISUAL_CONFIG.parkedDwellMinMs,
      AIRCRAFT_VISUAL_CONFIG.parkedDwellMaxMs,
      random,
    );
  } else if (event.phase === 'taxiOut' && event.distance >= event.route.taxiOutDistance) {
    event.distance = event.route.taxiOutDistance;
    event.phase = 'takeoff';
    startAircraftEventSound(scene, event, AIRCRAFT_AUDIO_CONFIG.takeoff);
  } else if (event.phase === 'takeoff' && event.distance >= ground.total) {
    event.phase = 'departing';
    event.distance = 0;
    setAircraftVisual(scene, event, event.route.departureTrack.points[0], 0);
    return true;
  }
  setAircraftVisual(scene, event, evaluateVesselLogicalTrack(ground, event.distance), 0);
  return true;
}

// Multiple aircraft can be in play per airport at once - up to one per gate
// (AIRCRAFT_GATE_KEYS.length, currently 6), each holding its gate reserved
// from spawn until it fully departs. But only ONE may ever be using the
// shared runway/taxiway corridor (any phase except 'parked') at a time -
// planes converging on the same strip of tarmac would just overlap on
// screen. That single rule is enough to reproduce a believably busy airport
// with the simple ordering Norton described (land+park, land+park, take off,
// land...) without needing an actual taxiway graph: a parked plane whose
// dwell timer expires simply waits for the runway to clear (see 'parked' in
// updateAircraftEvent), and a new arrival only spawns once both a gate and
// the runway are free.
//
// Spawning is deliberately NOT cooldown-throttled beyond that: every free
// gate is refilled the instant it's physically possible (runway clear, gate
// open), so occupancy climbs as high as the runway mutex's own throughput
// allows rather than "maybe one plane, eventually". In practice the mutex
// (not AIRCRAFT_GATE_KEYS.length, 6) ends up the binding constraint - with
// parkedDwellMinMs/MaxMs tuned per Norton's "average 3-4 busier" ask, an
// empirical long-run simulation (see the "busy airport" stochastic test)
// settles around 3-4 parked at once, occasionally bursting toward the
// 6-gate ceiling rather than sitting there permanently. A per-airport
// cooldownMs field still exists, but only for a genuine spawn-failure
// backoff (retryCooldownMs) and the post-severe-weather grace period
// (weatherRecoveryMinMs/MaxMs) - it no longer paces the healthy steady state.
function updateAircraftAirports(scene, state, scaledDelta, eligibleAirports, allAirports, random = Math.random) {
  const eligibleById = new Map(eligibleAirports.map((entry) => [entry.id, entry]));
  // Computed once for every airport, not just eligible/near-view ones - an
  // off-screen airport's already-parked planes must stay grounded through a
  // typhoon exactly like an on-screen one's, even though (per the existing
  // camera-gating below) an off-screen airport was never going to spawn
  // anything new regardless of weather.
  const weather = typeof city === 'undefined' ? null : city.weather;
  const severeWeather = isAircraftSevereWeather(weather);
  allAirports.forEach((entry) => {
    if (!state.airportStates.has(entry.id)) {
      state.airportStates.set(entry.id, { cooldownMs: 0, events: [] });
    }
  });
  for (const [airportId, airportState] of state.airportStates) {
    if (typeof buildingData === 'undefined' || buildingData[airportId]?.type !== 'airport') {
      airportState.events.forEach((event) => destroyAircraftEvent(scene, event));
      state.airportStates.delete(airportId);
      continue;
    }

    // Recomputed fresh for EACH event, not snapshotted once for the whole
    // tick: if two parked events both have expired dwell timers this same
    // tick, processing the first must be visible to the second, or both
    // would see "runway free" and both taxi out together. events is at most
    // gate-count long, so re-scanning it per event is cheap.
    for (let i = airportState.events.length - 1; i >= 0; i--) {
      const event = airportState.events[i];
      const runwayBusy = airportState.events.some((other) => other !== event && other.phase !== 'parked');
      const keepAlive = updateAircraftEvent(scene, event, scaledDelta, runwayBusy, severeWeather, random);
      if (!keepAlive) airportState.events.splice(i, 1);
    }

    // Everything past this point - route building, spawning, texture
    // loading - only ever runs for an airport actually near the camera view.
    const entry = eligibleById.get(airportId);
    if (!entry) continue;
    if (severeWeather) continue;
    airportState.cooldownMs = Math.max(0, airportState.cooldownMs - scaledDelta);
    if (airportState.cooldownMs > 0) continue;
    // Re-check fresh (not the tick-start snapshot): a parked event above may
    // have just taken the runway this same tick, and that must block a new
    // arrival from also claiming it.
    if (airportState.events.some((event) => event.phase !== 'parked')) continue;
    const usedGateKeys = new Set(airportState.events.map((event) => event.route.gateKey));
    const freeGateKeys = AIRCRAFT_GATE_KEYS.filter((key) => !usedGateKeys.has(key));
    if (!freeGateKeys.length) continue;
    requestAircraftBundle(scene);
    const gateKey = freeGateKeys[
      Math.min(freeGateKeys.length - 1, Math.floor(aircraftClamp(random(), 0, 0.999999) * freeGateKeys.length))
    ];
    if (!spawnAircraft(scene, state, airportState, entry, gateKey, random)) {
      airportState.cooldownMs = AIRCRAFT_VISUAL_CONFIG.retryCooldownMs;
    }
  }
}

function setupAircraftVisuals(scene) {
  return getAircraftVisualState(scene);
}

function clearAircraftVisuals(scene) {
  const state = scene?.aircraftVisualState;
  if (!state) return;
  state.airportStates.forEach((airportState) => {
    airportState.events.forEach((event) => destroyAircraftEvent(scene, event));
  });
  state.airportStates.clear();
}

function invalidateAircraftVisualView(scene, clear = false) {
  const state = getAircraftVisualState(scene);
  if (!state) return;
  if (clear) clearAircraftVisuals(scene);
}

function applyAircraftWeatherRecovery(state, severe, random = Math.random) {
  if (state.severeWeatherActive && !severe) {
    const recovery = aircraftRandomBetween(
      AIRCRAFT_VISUAL_CONFIG.weatherRecoveryMinMs,
      AIRCRAFT_VISUAL_CONFIG.weatherRecoveryMaxMs,
      random,
    );
    state.airportStates.forEach((airportState) => {
      airportState.cooldownMs = Math.max(airportState.cooldownMs, recovery);
    });
  }
  state.severeWeatherActive = severe;
}

function updateAircraftVisuals(time, delta) {
  const scene = this;
  const state = getAircraftVisualState(scene);
  const camera = scene?.cameras?.main;
  if (!state || !camera) return;
  if (scene.scene?.isVisible && !scene.scene.isVisible()) {
    clearAircraftVisuals(scene);
    return;
  }
  if (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) {
    clearAircraftVisuals(scene);
    return;
  }
  const paused = typeof simPaused !== 'undefined' && simPaused;
  const speedMultiplier = paused
    ? 0
    : Math.max(0, Number(typeof simSpeedMul === 'undefined' ? 1 : simSpeedMul) || 0);
  const scaledDelta = Math.min(AIRCRAFT_VISUAL_CONFIG.maxDeltaMs, Math.max(0, Number(delta) || 0)) * speedMultiplier;
  const severe = isAircraftSevereWeather(typeof city === 'undefined' ? null : city.weather);
  applyAircraftWeatherRecovery(state, severe);
  const rect = getVesselCameraRect(scene, AIRCRAFT_VISUAL_CONFIG.viewportPaddingTiles);
  const canStart = camera.zoom >= AIRCRAFT_VISUAL_CONFIG.zoomMin && !paused;
  const allAirports = getAircraftAirportEntries();
  // No airport anywhere in the city yet, or none near the camera: skip
  // everything below, including per-airport state bookkeeping.
  if (!allAirports.length) return;
  const eligibleAirports = canStart
    ? allAirports.filter((entry) => aircraftFacilityIsNearView(scene, entry, rect))
    : [];
  if (eligibleAirports.length) requestAircraftBundle(scene);
  updateAircraftAirports(scene, state, scaledDelta, eligibleAirports, allAirports);
}

const aircraftVisualTestApi = {
  AIRCRAFT_VISUAL_CONFIG,
  AIRCRAFT_AUDIO_CONFIG,
  AIRCRAFT_DIRECTIONS,
  AIRCRAFT_LIVERIES,
  AIRCRAFT_ASSET_REGISTRY,
  AIRCRAFT_ASSET_CACHE_VERSION,
  AIRCRAFT_GATE_KEYS,
  isAircraftSevereWeather,
  getAircraftRouteMetadata,
  getAircraftRouteMetadataId,
  getAircraftGateFacingDirection,
  getAircraftEventAudioVolume,
  startAircraftEventSound,
  updateAircraftEventSound,
  stopAircraftEventSound,
  getAircraftAbsolutePoints,
  getAircraftBezierControlFromMidpoint,
  evaluateQuadraticBezierPoint,
  buildAircraftCurvePoints,
  buildAircraftRoute,
  evaluateAircraftAltitude,
  getAircraftTextureKey,
  getAircraftLocalOffset,
  getAircraftBuildingAnchorCornerOffset,
  getAircraftGroundPoint,
  setAircraftVisual,
  spawnAircraft,
  destroyAircraftEvent,
  updateAircraftEvent,
  updateAircraftAirports,
  getAircraftVisualState,
  aircraftBundleIsReady,
  requestAircraftBundle,
  setupAircraftVisuals,
  updateAircraftVisuals,
  clearAircraftVisuals,
  invalidateAircraftVisualView,
};

if (typeof module !== 'undefined' && module.exports) module.exports = aircraftVisualTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    setupAircraftVisuals,
    updateAircraftVisuals,
    clearAircraftVisuals,
    invalidateAircraftVisualView,
  });
}
