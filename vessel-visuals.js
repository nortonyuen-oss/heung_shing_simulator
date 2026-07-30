// Camera-aware container-port vessel activity.
// This is a from-scratch redesign of an earlier combined airport+harbor
// "gateway visuals" prototype that was reverted after it stalled the frame
// (see git stash "gateway-visuals feature + perf fixes ... hang fixes").
// Two lessons carried forward from that attempt, kept intact here:
//   1. Never run findOceanRoute() (a Dijkstra pass over the water grid) more
//      than once per port visit - cache the route and only recompute once
//      its cached exit point scrolls back into view.
//   2. Only do ANY vessel work - spawning, routing, texture loading - for a
//      container_port whose building sprite is actually near the camera
//      view. Off-screen ports cost one Map lookup per frame, nothing more.
// What's new in this version: the previous prototype berthed ships at the
// harbor's nearest whole water tile, which - given the ~3.2-tile-long hull -
// let the bow/hull overlap the port's land tiles. Docking position is now a
// fractional-tile point tuned so the hull clears the shore with a small
// visible gap instead of sitting flush against it (see VESSEL_DOCK_OFFSET_TILES).

const VESSEL_VISUAL_CONFIG = Object.freeze({
  zoomMin: 0.75,
  viewportPaddingTiles: 3,
  initialCooldownMinMs: 20000,
  initialCooldownMaxMs: 60000,
  cooldownMinMs: 90000,
  cooldownMaxMs: 180000,
  retryCooldownMs: 10000,
  weatherRecoveryMinMs: 10000,
  weatherRecoveryMaxMs: 30000,
  cargoStepMinMs: 5000,
  cargoStepMaxMs: 7000,
  // A cardinal logical tile spans roughly 56 screen pixels in this isometric
  // projection; 0.78 makes the ~235px visible hull about 3.2 tiles long.
  vesselScale: 0.78,
  vesselSpeedTilesPerSecond: 0.52,
  routeConflictTiles: 3,
  maxDeltaMs: 1000,
  maxLoadAttempts: 2,
});

// Docking geometry, in fractional logical tiles measured outward from the
// harbor's land edge (0 = still on land, 1 = the old "one full tile out"
// spot). Verified per side against every container port in the "九龍" save
// by sampling the ship sprite's actual rendered pixels (not just its
// bounding box) against the underlying map tiles. 's'-side ports (harbor_ll)
// docked cleanly at the tight original spacing; 'e'/'w'-side ports
// (harbor_lr/harbor_ul) had at least one whose coastline curves in close
// enough to a corner of the ~3.2-tile hull's bounding box that 0.82 left a
// 1px sliver of land visible - this only pushes the berth further outward,
// not sideways, so clearing that corner needed more clearance. 'n'
// (harbor_ur) has no real test case in that save; it keeps the tight
// default rather than inheriting an unverified wider gap.
const VESSEL_DOCK_OFFSET_TILES_BY_SIDE = Object.freeze({
  n: 0.82,
  s: 0.82,
  e: 1.8,
  w: 1.8,
});

// Extra logical tiles of clearance, on top of VESSEL_DOCK_OFFSET_TILES_BY_SIDE,
// applied only when the harbor_ul/harbor_ur artwork is the one on screen (see
// getVesselHarborVisualVariant). harbor_ul/harbor_ur draw their crane and
// warehouse structure closer to the water edge than harbor_ll/harbor_lr do,
// so the same land-clearance gap that's plenty for ll/lr still visually
// tucks the hull behind that structure for ul/ur - roughly one hull beam of
// extra push clears it. Verified against real screenshots (not land-color
// sampling, since this is a screen-space occlusion problem, not a land-clip
// one) across both rotation-swept test ports in the "九龍" save.
const VESSEL_OCCLUSION_CLEARANCE_TILES = 1.0;

const VESSEL_AUDIO_CONFIG = Object.freeze({
  horn: Object.freeze({ key: 'vessel_horn', baseVolume: 0.9 }),
});

const VESSEL_DIRECTIONS = Object.freeze(['ne', 'nw', 'se', 'sw']);
const VESSEL_CARGO_STATES = Object.freeze(['empty', 'half', 'full']);
const VESSEL_CARGO_FILE_LABELS = Object.freeze({
  empty: 'Empty',
  half: 'HalfLoad',
  full: 'FullLoad',
});
const VESSEL_ASSET_REGISTRY = Object.freeze(Object.fromEntries(
  VESSEL_CARGO_STATES.map((cargoState) => [
    cargoState,
    Object.freeze(Object.fromEntries(VESSEL_DIRECTIONS.map((direction) => [
      direction,
      Object.freeze({
        key: `vessel_${cargoState}_${direction}`,
        path: `Models/vessels/cargoShip01-${VESSEL_CARGO_FILE_LABELS[cargoState]}-${direction.toUpperCase()}_fixed.png`,
      }),
    ]))),
  ]),
));

const CARGO_SCENARIO_DEFS = Object.freeze([
  Object.freeze({ id: 'exchange', states: Object.freeze(['full', 'half', 'full']) }),
  Object.freeze({ id: 'offload', states: Object.freeze(['full', 'half', 'empty']) }),
  Object.freeze({ id: 'export', states: Object.freeze(['empty', 'half', 'full']) }),
]);

function vesselClamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function vesselRandomBetween(min, max, random = Math.random) {
  return min + vesselClamp(random(), 0, 1) * (max - min);
}

function getVesselTextureDirection(dx, dy, fallback = 'ne') {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return fallback;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return fallback;
  if (dx < 0) return dy < 0 ? 'nw' : 'sw';
  return dy < 0 ? 'ne' : 'se';
}

function isVesselSevereWeather(weather) {
  return ['signal8', 'signal9', 'signal10'].includes(weather?.typhoonStage);
}

function getCargoScenarioDefinition(roll = Math.random()) {
  const index = Math.min(
    CARGO_SCENARIO_DEFS.length - 1,
    Math.floor(vesselClamp(roll, 0, 0.999999999) * CARGO_SCENARIO_DEFS.length),
  );
  return CARGO_SCENARIO_DEFS[index];
}

function vesselPointInRect(point, rect) {
  return !!point && !!rect
    && point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function getVesselCameraRect(scene, paddingTiles = 0) {
  const camera = scene?.cameras?.main;
  if (!camera) return null;
  const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
  const width = Math.max(0, Number(camera.width) || 0) / zoom;
  const height = Math.max(0, Number(camera.height) || 0) / zoom;
  const originX = Number.isFinite(camera.originX) ? camera.originX : 0.5;
  const originY = Number.isFinite(camera.originY) ? camera.originY : 0.5;
  const x = (Number(camera.scrollX) || 0) + (Number(camera.width) || 0) * originX - width * originX;
  const y = (Number(camera.scrollY) || 0) + (Number(camera.height) || 0) * originY - height * originY;
  const padX = paddingTiles * (typeof TILE_WIDTH === 'number' ? TILE_WIDTH : 100);
  const padY = paddingTiles * (typeof TILE_IMAGE_HEIGHT === 'number' ? TILE_IMAGE_HEIGHT : 100);
  return {
    x: x - padX,
    y: y - padY,
    width: width + padX * 2,
    height: height + padY * 2,
  };
}

function getVesselEventAudioVolume(scene, position, baseVolume = 0.5) {
  if (!position) return 0;
  const rect = getVesselCameraRect(scene, 0);
  const camera = scene?.cameras?.main;
  if (!rect || !camera) return 0;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const distance = Math.hypot(position.x - centerX, position.y - centerY);
  const audibleRadius = Math.max(rect.width, rect.height) * 0.9;
  const proximity = vesselClamp(1 - distance / Math.max(1, audibleRadius), 0, 1);
  const zoomFade = vesselClamp(
    (camera.zoom - 0.5) / Math.max(0.01, VESSEL_VISUAL_CONFIG.zoomMin - 0.5),
    0,
    1,
  );
  const ambientMix = typeof getStoredAmbientVolume === 'function'
    ? getStoredAmbientVolume()
    : 1;
  return vesselClamp(baseVolume * proximity * zoomFade * ambientMix, 0, 1);
}

function stopVesselEventSound(event) {
  const sound = event?.sound;
  if (!sound) return;
  sound.off?.('complete');
  sound.stop?.();
  sound.destroy?.();
  event.sound = null;
  event.soundPausedForSimulation = false;
}

function startVesselEventSound(scene, event, audioConfig) {
  stopVesselEventSound(event);
  const audioCache = scene?.cache?.audio;
  const audioIsReady = audioCache?.has?.(audioConfig.key)
    ?? audioCache?.exists?.(audioConfig.key)
    ?? true;
  if (!scene?.sound || scene.sound.locked || !audioIsReady) return false;
  const sound = scene.sound.add(audioConfig.key, {
    loop: false,
    volume: getVesselEventAudioVolume(scene, event.lastWorld, audioConfig.baseVolume),
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

function updateVesselEventSound(scene, event) {
  const sound = event?.sound;
  if (!sound) return;
  sound.setVolume?.(getVesselEventAudioVolume(scene, event.lastWorld, event.soundBaseVolume));
  const paused = typeof simPaused !== 'undefined' && simPaused;
  if (paused && !event.soundPausedForSimulation) {
    sound.pause?.();
    event.soundPausedForSimulation = true;
  } else if (!paused && event.soundPausedForSimulation) {
    sound.resume?.();
    event.soundPausedForSimulation = false;
  }
}

function getVesselVisualState(scene) {
  if (!scene) return null;
  if (!scene.vesselVisualState) {
    scene.vesselVisualState = {
      portStates: new Map(),
      bundleStatus: 'unloaded', // 'unloaded' | 'loading' | 'ready' | 'failed'
      bundleAttempts: 0,
      loaderActive: false,
      loaderWaiting: false,
      nextId: 1,
      severeWeatherActive: false,
    };
  }
  return scene.vesselVisualState;
}

function getVesselBundleAssets() {
  return VESSEL_CARGO_STATES.flatMap((cargoState) => (
    VESSEL_DIRECTIONS.map((direction) => VESSEL_ASSET_REGISTRY[cargoState][direction])
  ));
}

function vesselBundleIsReady(scene) {
  return getVesselBundleAssets().every((asset) => scene?.textures?.exists?.(asset.key));
}

function finalizeVesselBundleLoad(scene, state) {
  if (vesselBundleIsReady(scene)) {
    state.bundleStatus = 'ready';
  } else if (state.bundleAttempts < VESSEL_VISUAL_CONFIG.maxLoadAttempts) {
    state.bundleStatus = 'unloaded';
  } else {
    state.bundleStatus = 'failed';
  }
  state.loaderActive = false;
}

function pumpVesselTextureQueue(scene, state) {
  if (state.loaderActive || state.bundleStatus !== 'unloaded') return;
  if (scene.load?.isLoading?.()) {
    if (!state.loaderWaiting) {
      state.loaderWaiting = true;
      scene.load.once('complete', () => {
        state.loaderWaiting = false;
        pumpVesselTextureQueue(scene, state);
      });
    }
    return;
  }
  if (vesselBundleIsReady(scene)) {
    state.bundleStatus = 'ready';
    return;
  }
  state.bundleStatus = 'loading';
  state.bundleAttempts++;
  state.loaderActive = true;
  let queued = 0;
  getVesselBundleAssets().forEach((asset) => {
    if (scene.textures.exists(asset.key)) return;
    const resolved = typeof resolveModelAssetPath === 'function'
      ? resolveModelAssetPath(asset.path)
      : asset.path;
    const separator = resolved.includes('?') ? '&' : '?';
    scene.load.image(asset.key, `${resolved}${separator}vesselLoad=${state.bundleAttempts}`);
    queued++;
  });
  if (queued === 0) {
    finalizeVesselBundleLoad(scene, state);
    return;
  }
  scene.load.once('complete', () => finalizeVesselBundleLoad(scene, state));
  scene.load.start();
}

function requestVesselBundle(scene) {
  const state = getVesselVisualState(scene);
  if (!state || state.bundleStatus === 'failed' || state.bundleStatus === 'loading') return;
  if (vesselBundleIsReady(scene)) {
    state.bundleStatus = 'ready';
    return;
  }
  pumpVesselTextureQueue(scene, state);
}

function getVesselPortEntries() {
  if (typeof buildingData === 'undefined' || !buildingData) return [];
  return Object.entries(buildingData)
    .filter(([, record]) => record?.type === 'container_port')
    .map(([id, record]) => {
      const [row, col] = id.split(':').map(Number);
      return { id, row, col, record };
    });
}

function getVesselFacilitySprite(scene, entry) {
  return scene?.buildingSprites?.get?.(entry.id) ?? null;
}

function vesselFacilityIsNearView(scene, entry, rect) {
  const sprite = getVesselFacilitySprite(scene, entry);
  return !!sprite && vesselPointInRect({ x: sprite.x, y: sprite.y }, rect);
}

function gatewayLerp(a, b, t) {
  return a + (b - a) * t;
}

function getVesselWaterSurfacePoint(scene, row, col) {
  const iso = isoToScreen(col, row);
  const surfaceOffset = (typeof BUILDING_SURFACE_Y_OFFSET === 'number' ? BUILDING_SURFACE_Y_OFFSET : 82)
    + (typeof TILE_HEIGHT === 'number' ? TILE_HEIGHT : 50) / 2;
  return {
    x: iso.x + scene.offsetX,
    y: iso.y + scene.offsetY - surfaceOffset,
    depthY: iso.y + (typeof TILE_HEIGHT === 'number' ? TILE_HEIGHT : 50) / 2,
  };
}

// Direct water-adjacent tiles along the harbor's water-facing side, one tile
// out from the footprint edge (or two tiles out if the direct tiles are
// blocked - e.g. a beach buffer). Kept whole-tile so the A* water search
// below can route to/from it; the fractional, gap-adjusted dock point used
// for the actual rendered ship position is computed separately by
// getVesselDockPoint().
function getHarborBerthCandidates(map, row, col, side, waterValue, footprintCols = 4, footprintRows = 4) {
  if (!['n', 'e', 's', 'w'].includes(side)) return [];
  const directTiles = [];
  for (let index = 0; index < (side === 'n' || side === 's' ? footprintCols : footprintRows); index++) {
    if (side === 'n') directTiles.push([row - 1, col + index]);
    else if (side === 's') directTiles.push([row + footprintRows, col + index]);
    else if (side === 'w') directTiles.push([row + index, col - 1]);
    else directTiles.push([row + index, col + footprintCols]);
  }
  const directWater = directTiles.every(([tileRow, tileCol]) => map[tileRow]?.[tileCol] === waterValue);
  const offset = directWater ? 1 : 2;
  const tiles = directTiles.map(([tileRow, tileCol]) => {
    if (offset === 1) return [tileRow, tileCol];
    if (side === 'n') return [tileRow - 1, tileCol];
    if (side === 's') return [tileRow + 1, tileCol];
    if (side === 'w') return [tileRow, tileCol - 1];
    return [tileRow, tileCol + 1];
  });
  if (!tiles.every(([tileRow, tileCol]) => map[tileRow]?.[tileCol] === waterValue)) return [];
  const center = side === 'n' || side === 's'
    ? { row: tiles[0][0], col: col + (footprintCols - 1) / 2 }
    : { row: row + (footprintRows - 1) / 2, col: tiles[0][1] };
  return [
    { entry: { row: tiles[0][0], col: tiles[0][1] }, center, offset },
    { entry: { row: tiles.at(-1)[0], col: tiles.at(-1)[1] }, center, offset },
  ];
}

// getHarborVisualKey() in main.js picks which harbor artwork to draw by
// rotating the port's fixed logical water side through the current view
// rotation: n->harbor_ur, e->harbor_lr, s->harbor_ll, w->harbor_ul. The UL/UR
// pieces draw their crane/warehouse structure much closer to the water edge
// than LL/LR do, so a dock gap that's plenty for LL/LR still leaves the ship
// tucked visually behind that structure when UL/UR is the piece on screen.
// This only depends on the *currently displayed* artwork, so it has to be
// re-derived from live mapRotation rather than baked into the fixed side ->
// offset table above (whose whole point is staying rotation-invariant).
function getVesselHarborVisualVariant(side) {
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const visualSide = typeof rotateDirection === 'function' ? rotateDirection(side, rotation) : side;
  if (visualSide === 'n') return 'ur';
  if (visualSide === 'e') return 'lr';
  if (visualSide === 's') return 'll';
  return 'ul'; // 'w'
}

// The precise, gap-adjusted point a ship actually stops at. Interpolates
// between the harbor's own land-edge tile (fraction 0, would clip the hull
// into land) and the direct water-adjacent tile (fraction 1, the old spawn
// point) using VESSEL_DOCK_OFFSET_TILES_BY_SIDE, then carries any extra
// whole tiles the berth candidate needed (candidate.offset > 1, e.g. a beach
// buffer) on top of that fraction so it still lands in clear water. A further
// VESSEL_OCCLUSION_CLEARANCE_TILES is added on top when the currently
// displayed artwork is harbor_ul/harbor_ur, so the hull clears that piece's
// closer-to-shore crane structure instead of hiding behind it.
function getVesselDockPoint(portEntry, side, candidate) {
  const { row, col } = portEntry;
  const cols = Number(portEntry.record?.footprintCols) || HARBOR_FOOTPRINT_COLS;
  const rows = Number(portEntry.record?.footprintRows) || HARBOR_FOOTPRINT_ROWS;
  const dockOffsetTiles = VESSEL_DOCK_OFFSET_TILES_BY_SIDE[side] ?? 0.82;
  const variant = getVesselHarborVisualVariant(side);
  const occlusionClearance = (variant === 'ul' || variant === 'ur')
    ? VESSEL_OCCLUSION_CLEARANCE_TILES
    : 0;
  const effectiveOffset = (candidate.offset - 1) + dockOffsetTiles + occlusionClearance;
  if (side === 'n') return { row: row - effectiveOffset, col: candidate.center.col };
  if (side === 's') return { row: row + rows - 1 + effectiveOffset, col: candidate.center.col };
  if (side === 'w') return { row: candidate.center.row, col: col - effectiveOffset };
  return { row: candidate.center.row, col: col + cols - 1 + effectiveOffset }; // 'e'
}

// The berth's water-facing edge runs along whichever logical axis is *not*
// the approach axis for that side: n/s sides front onto the column axis,
// e/w sides front onto the row axis (mirrors the n/e/s/w -> screen-corner
// mapping in main.js's getHarborVisualKey). Deriving the parallel screen
// direction from two real points along that axis - run through the same
// isoToScreen()-backed pipeline as every other position in this file -
// keeps it correct under map rotation automatically; a static side-to-
// direction lookup table would not rotate along with the view.
function getVesselDockDirection(scene, side, dockPoint) {
  const alongRow = side === 'e' || side === 'w';
  const before = alongRow
    ? { row: dockPoint.row - 0.5, col: dockPoint.col }
    : { row: dockPoint.row, col: dockPoint.col - 0.5 };
  const after = alongRow
    ? { row: dockPoint.row + 0.5, col: dockPoint.col }
    : { row: dockPoint.row, col: dockPoint.col + 0.5 };
  const worldBefore = getVesselWaterSurfacePoint(scene, before.row, before.col);
  const worldAfter = getVesselWaterSurfacePoint(scene, after.row, after.col);
  return getVesselTextureDirection(worldAfter.x - worldBefore.x, worldAfter.y - worldBefore.y, 'se');
}

function countVesselAdjacentLand(map, row, col, waterValue) {
  return [[-1, 0], [1, 0], [0, -1], [0, 1]]
    .reduce((count, [dr, dc]) => count + (map[row + dr]?.[col + dc] === waterValue ? 0 : 1), 0);
}

class VesselMinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].cost <= item.cost) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    if (this.items.length === 0) return null;
    const root = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length && this.items[right].cost < this.items[left].cost
          ? right
          : left;
        if (this.items[child].cost >= last.cost) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return root;
  }
}

const VESSEL_ROUTE_NEIGHBOR_OFFSETS = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1]]);

// Dijkstra over the water grid, backed by typed arrays (indexed by
// row*width+col) instead of string-keyed Maps - on a 256x256 map this search
// can touch tens of thousands of cells, and string concatenation/hashing per
// cell was the single biggest cost when this ran. Callers must cache the
// result (see getVesselPortRoute) - this must never run every frame.
function findOceanRoute(map, start, waterValue, isOutsideView, maxVisited = 100000) {
  const height = map.length;
  const width = map[0]?.length ?? 0;
  if (!height || !width || map[start.row]?.[start.col] !== waterValue) return null;
  const size = height * width;
  const toIndex = (row, col) => row * width + col;
  const costs = new Float64Array(size).fill(Infinity);
  const parents = new Int32Array(size).fill(-1);
  const startIndex = toIndex(start.row, start.col);
  costs[startIndex] = 0;
  const heap = new VesselMinHeap();
  heap.push({ index: startIndex, cost: 0 });
  let targetIndex = -1;
  let visited = 0;
  while (heap.items.length && visited < maxVisited) {
    const current = heap.pop();
    if (current.cost !== costs[current.index]) continue;
    visited++;
    const row = Math.floor(current.index / width);
    const col = current.index % width;
    const atBoundary = row === 0 || col === 0 || row === height - 1 || col === width - 1;
    if (atBoundary && isOutsideView(row, col)) {
      targetIndex = current.index;
      break;
    }
    for (const [dr, dc] of VESSEL_ROUTE_NEIGHBOR_OFFSETS) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextRow >= height || nextCol < 0 || nextCol >= width) continue;
      if (map[nextRow]?.[nextCol] !== waterValue) continue;
      const nextIndex = toIndex(nextRow, nextCol);
      const nextCost = current.cost + 1 + countVesselAdjacentLand(map, nextRow, nextCol, waterValue) * 0.35;
      if (nextCost >= costs[nextIndex]) continue;
      costs[nextIndex] = nextCost;
      parents[nextIndex] = current.index;
      heap.push({ index: nextIndex, cost: nextCost });
    }
  }
  if (targetIndex < 0) return null;
  const path = [];
  let cursor = targetIndex;
  while (cursor !== -1) {
    path.push({ row: Math.floor(cursor / width), col: cursor % width });
    if (cursor === startIndex) break;
    cursor = parents[cursor];
  }
  path.reverse();
  const firstOutsideIndex = path.findIndex((point) => isOutsideView(point.row, point.col));
  if (firstOutsideIndex < 0) return null;
  return path.slice(0, firstOutsideIndex + 1);
}

function simplifyVesselTrack(points) {
  if (points.length <= 2) return points.slice();
  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = result.at(-1);
    const current = points[index];
    const next = points[index + 1];
    const firstRow = Math.sign(current.row - previous.row);
    const firstCol = Math.sign(current.col - previous.col);
    const secondRow = Math.sign(next.row - current.row);
    const secondCol = Math.sign(next.col - current.col);
    if (firstRow === secondRow && firstCol === secondCol) continue;
    result.push(current);
  }
  result.push(points.at(-1));
  return result;
}

function roundVesselWaterTrack(points, map, waterValue, lead = 0.35) {
  if (points.length <= 2) return points.slice();
  const output = [points[0]];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incomingLength = Math.hypot(current.row - previous.row, current.col - previous.col);
    const outgoingLength = Math.hypot(next.row - current.row, next.col - current.col);
    const incomingLead = Math.min(lead, incomingLength * 0.25);
    const outgoingLead = Math.min(lead, outgoingLength * 0.25);
    const before = {
      row: current.row + (previous.row - current.row) * (incomingLead / Math.max(0.0001, incomingLength)),
      col: current.col + (previous.col - current.col) * (incomingLead / Math.max(0.0001, incomingLength)),
    };
    const after = {
      row: current.row + (next.row - current.row) * (outgoingLead / Math.max(0.0001, outgoingLength)),
      col: current.col + (next.col - current.col) * (outgoingLead / Math.max(0.0001, outgoingLength)),
    };
    const samples = [before];
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const u = 1 - t;
      samples.push({
        row: u * u * before.row + 2 * u * t * current.row + t * t * after.row,
        col: u * u * before.col + 2 * u * t * current.col + t * t * after.col,
      });
    }
    const safe = samples.every((point) => (
      map[Math.round(point.row)]?.[Math.round(point.col)] === waterValue
    ));
    if (safe) output.push(...samples);
    else output.push(current);
  }
  output.push(points.at(-1));
  return output;
}

function buildVesselTrackMetrics(points) {
  const segments = [];
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.row - start.row, end.col - start.col);
    if (length <= 0) continue;
    segments.push({ start, end, startDistance: total, length });
    total += length;
  }
  return { points, segments, total };
}

function evaluateVesselLogicalTrack(track, distance) {
  if (!track?.segments?.length) return track?.points?.[0] ?? null;
  const target = vesselClamp(distance, 0, track.total);
  const segment = track.segments.find((candidate) => (
    target <= candidate.startDistance + candidate.length
  )) ?? track.segments.at(-1);
  const progress = vesselClamp((target - segment.startDistance) / segment.length, 0, 1);
  return {
    row: gatewayLerp(segment.start.row, segment.end.row, progress),
    col: gatewayLerp(segment.start.col, segment.end.col, progress),
  };
}

function findVesselShipRoute(scene, portEntry, rect) {
  const side = portEntry.record?.harborWaterSide
    || (typeof getHarborRecordWaterSide === 'function'
      ? getHarborRecordWaterSide(portEntry.row, portEntry.col, portEntry.record)
      : '');
  if (!side || typeof mapData === 'undefined') return null;
  const waterValue = typeof WATER === 'number' ? WATER : 5;
  const berthCandidates = getHarborBerthCandidates(
    mapData,
    portEntry.row,
    portEntry.col,
    side,
    waterValue,
    Number(portEntry.record?.footprintCols) || HARBOR_FOOTPRINT_COLS,
    Number(portEntry.record?.footprintRows) || HARBOR_FOOTPRINT_ROWS,
  );
  const isOutsideView = (row, col) => (
    !vesselPointInRect(getVesselWaterSurfacePoint(scene, row, col), rect)
  );
  const routes = berthCandidates.flatMap((candidate) => {
    const portToOutside = findOceanRoute(
      mapData,
      candidate.entry,
      waterValue,
      isOutsideView,
      Math.max(1000, mapData.length * (mapData[0]?.length ?? 0)),
    );
    if (!portToOutside) return [];
    const inbound = portToOutside.slice().reverse();
    inbound.push(candidate.center);
    const roundedPoints = roundVesselWaterTrack(simplifyVesselTrack(inbound), mapData, waterValue);
    const dockPoint = getVesselDockPoint(portEntry, side, candidate);
    return [{
      side,
      offset: candidate.offset,
      berth: dockPoint,
      points: [...roundedPoints, dockPoint],
    }];
  });
  if (!routes.length) return null;
  routes.sort((a, b) => a.points.length - b.points.length);
  const chosen = routes[0];
  return {
    ...chosen,
    inboundTrack: buildVesselTrackMetrics(chosen.points),
    outboundTrack: buildVesselTrackMetrics(chosen.points.slice().reverse()),
  };
}

function vesselTracksConflict(first, second, minimumDistance = VESSEL_VISUAL_CONFIG.routeConflictTiles) {
  if (!first?.points || !second?.points) return false;
  return first.points.some((a) => second.points.some((b) => (
    Math.hypot(a.row - b.row, a.col - b.col) < minimumDistance
  )));
}

function getVesselTextureKey(cargoState, direction) {
  return VESSEL_ASSET_REGISTRY[cargoState]?.[direction]?.key
    ?? VESSEL_ASSET_REGISTRY.empty.ne.key;
}

function setVesselSpriteTexture(sprite, key) {
  if (!sprite || sprite.texture?.key === key) return;
  sprite.setTexture(key);
}

function setVesselCargoState(event, cargoState) {
  event.cargoState = cargoState;
  setVesselSpriteTexture(event.sprite, getVesselTextureKey(event.cargoState, event.direction));
}


function setVesselVisual(scene, event, logicalPoint, forcedDirection = null, side = null) {
  const world = getVesselWaterSurfacePoint(scene, logicalPoint.row, logicalPoint.col);
  const previous = event.lastWorld ?? { x: world.x - 1, y: world.y };
  const direction = forcedDirection || getVesselTextureDirection(
    world.x - previous.x,
    world.y - previous.y,
    event.direction,
  );
  event.direction = direction;
  setVesselSpriteTexture(event.sprite, getVesselTextureKey(event.cargoState, direction));
  event.sprite.setPosition(world.x, world.y);
  // Plain Y-based depth - the same rule every other sprite in the scene
  // (buildings, trees) sorts by, no per-side special-casing. This only
  // looks right if the dock point stands far enough off the harbor's own
  // sprite bounds that the two don't fight over the same screen pixels in
  // the first place (see the gap comments on VESSEL_VISUAL_CONFIG.dockOffsetTiles).
  if (typeof getWorldDepth === 'function') {
    event.sprite.setDepth(getWorldDepth('object', world.depthY));
  }
  event.lastWorld = world;
  event.lastLogical = logicalPoint;
}

function destroyVesselEvent(event) {
  stopVesselEventSound(event);
  event?.sprite?.destroy?.();
}

function spawnVessel(scene, state, portState, portEntry, route, random = Math.random) {
  if (!vesselBundleIsReady(scene)) return false;
  const activeRoutes = Array.from(state.portStates.values())
    .map((candidate) => candidate.event?.route?.inboundTrack)
    .filter(Boolean);
  if (activeRoutes.some((track) => vesselTracksConflict(route.inboundTrack, track))) return false;
  const scenario = getCargoScenarioDefinition(random());
  const initialCargo = scenario.states[0];
  const start = route.inboundTrack.points[0];
  const next = route.inboundTrack.points[1] ?? route.berth;
  const startWorld = getVesselWaterSurfacePoint(scene, start.row, start.col);
  const nextWorld = getVesselWaterSurfacePoint(scene, next.row, next.col);
  const direction = getVesselTextureDirection(nextWorld.x - startWorld.x, nextWorld.y - startWorld.y);
  const sprite = scene.add.image(startWorld.x, startWorld.y, getVesselTextureKey(initialCargo, direction));
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
  sprite.setOrigin(0.5, 0.5);
  sprite.setScale(VESSEL_VISUAL_CONFIG.vesselScale);
  if (scene.worldMask) sprite.setMask(scene.worldMask);
  const event = {
    id: `vessel_${state.nextId++}`,
    portId: portEntry.id,
    portSprite: getVesselFacilitySprite(scene, portEntry),
    route,
    scenario,
    sprite,
    cargoState: initialCargo,
    direction,
    phase: 'inbound',
    distance: 0,
    cargoStepIndex: 0,
    cargoStepTimerMs: 0,
    lastWorld: null,
    lastLogical: start,
    sound: null,
    soundBaseVolume: 0,
    soundPausedForSimulation: false,
  };
  portState.event = event;
  setVesselVisual(scene, event, start, null, event.route.side);
  return true;
}

function updateVesselCargoExchange(event, scaledDelta, random = Math.random) {
  if (event.cargoStepTimerMs <= 0) {
    event.cargoStepTimerMs = event.cargoStepIndex === 0
      ? 4000
      : vesselRandomBetween(
        VESSEL_VISUAL_CONFIG.cargoStepMinMs,
        VESSEL_VISUAL_CONFIG.cargoStepMaxMs,
        random,
      );
    setVesselCargoState(event, event.scenario.states[event.cargoStepIndex]);
  }
  event.cargoStepTimerMs -= scaledDelta;
  if (event.cargoStepTimerMs > 0) return false;
  event.cargoStepIndex++;
  event.cargoStepTimerMs = 0;
  return event.cargoStepIndex >= event.scenario.states.length;
}

function updateVesselEvent(scene, state, portState, scaledDelta, random = Math.random) {
  const event = portState.event;
  if (!event) return;
  updateVesselEventSound(scene, event);
  const recordStillExists = typeof buildingData !== 'undefined'
    && buildingData[event.portId]?.type === 'container_port';
  if (!recordStillExists || !event.portSprite?.active) {
    destroyVesselEvent(event);
    portState.event = null;
    portState.cooldownMs = vesselRandomBetween(
      VESSEL_VISUAL_CONFIG.cooldownMinMs,
      VESSEL_VISUAL_CONFIG.cooldownMaxMs,
      random,
    );
    return;
  }
  if (event.phase === 'cargo_exchange') {
    setVesselVisual(scene, event, event.route.berth, getVesselDockDirection(scene, event.route.side, event.route.berth), event.route.side);
    if (updateVesselCargoExchange(event, scaledDelta, random)) {
      event.phase = 'outbound';
      event.distance = 0;
    }
    return;
  }
  const track = event.phase === 'inbound' ? event.route.inboundTrack : event.route.outboundTrack;
  event.distance += (scaledDelta / 1000) * VESSEL_VISUAL_CONFIG.vesselSpeedTilesPerSecond;
  if (event.distance >= track.total) {
    if (event.phase === 'inbound') {
      event.phase = 'cargo_exchange';
      event.distance = track.total;
      event.cargoStepIndex = 0;
      event.cargoStepTimerMs = 0;
      setVesselVisual(scene, event, event.route.berth, getVesselDockDirection(scene, event.route.side, event.route.berth), event.route.side);
      startVesselEventSound(scene, event, VESSEL_AUDIO_CONFIG.horn);
      return;
    }
    destroyVesselEvent(event);
    portState.event = null;
    portState.cooldownMs = vesselRandomBetween(
      VESSEL_VISUAL_CONFIG.cooldownMinMs,
      VESSEL_VISUAL_CONFIG.cooldownMaxMs,
      random,
    );
    return;
  }
  setVesselVisual(scene, event, evaluateVesselLogicalTrack(track, event.distance), null, event.route.side);
}

// The route to open water for a given berth almost never changes between one
// vessel visit and the next - only the camera view (does the cached exit
// point still lie off-screen?) or the underlying terrain can invalidate it.
// Reusing it skips a full-map findOceanRoute() Dijkstra pass on every spawn
// cycle, which is expensive enough on a 256x256 map to stall the frame if it
// ran on every visit instead of once.
function isVesselRouteStillOutsideView(scene, route, rect) {
  const exitPoint = route?.points?.[0];
  if (!exitPoint) return false;
  const exitWorld = getVesselWaterSurfacePoint(scene, exitPoint.row, exitPoint.col);
  return !vesselPointInRect(exitWorld, rect);
}

function getVesselPortRoute(scene, portState, entry, rect) {
  if (portState.route && isVesselRouteStillOutsideView(scene, portState.route, rect)) {
    return portState.route;
  }
  const route = findVesselShipRoute(scene, entry, rect);
  portState.route = route ?? null;
  return route;
}

function updateVesselPorts(scene, state, scaledDelta, eligiblePorts, rect, allPorts, random = Math.random) {
  const eligibleById = new Map(eligiblePorts.map((entry) => [entry.id, entry]));
  allPorts.forEach((entry) => {
    if (!state.portStates.has(entry.id)) {
      state.portStates.set(entry.id, {
        cooldownMs: vesselRandomBetween(
          VESSEL_VISUAL_CONFIG.initialCooldownMinMs,
          VESSEL_VISUAL_CONFIG.initialCooldownMaxMs,
          random,
        ),
        event: null,
        route: null,
      });
    }
  });
  for (const [portId, portState] of state.portStates) {
    if (portState.event) {
      updateVesselEvent(scene, state, portState, scaledDelta, random);
      continue;
    }
    if (typeof buildingData === 'undefined' || buildingData[portId]?.type !== 'container_port') {
      state.portStates.delete(portId);
      continue;
    }
    // The single most important gate in this file: everything past this
    // point - route caching/computation, spawning, texture loading - only
    // ever runs for a port that is actually near the current camera view.
    const entry = eligibleById.get(portId);
    if (!entry) continue;
    const weather = typeof city === 'undefined' ? null : city.weather;
    if (isVesselSevereWeather(weather)) continue;
    portState.cooldownMs = Math.max(0, portState.cooldownMs - scaledDelta);
    if (portState.cooldownMs > 0) continue;
    requestVesselBundle(scene);
    const route = getVesselPortRoute(scene, portState, entry, rect);
    if (!route || !spawnVessel(scene, state, portState, entry, route, random)) {
      portState.route = null;
      portState.cooldownMs = VESSEL_VISUAL_CONFIG.retryCooldownMs;
    }
  }
}

function setupVesselVisuals(scene) {
  return getVesselVisualState(scene);
}

function clearVesselVisuals(scene) {
  const state = scene?.vesselVisualState;
  if (!state) return;
  state.portStates.forEach((portState) => destroyVesselEvent(portState.event));
  state.portStates.clear();
}

function invalidateVesselVisualView(scene, clear = false) {
  const state = getVesselVisualState(scene);
  if (!state) return;
  if (clear) clearVesselVisuals(scene);
}

function applyVesselWeatherRecovery(state, severe, random = Math.random) {
  if (state.severeWeatherActive && !severe) {
    const recovery = vesselRandomBetween(
      VESSEL_VISUAL_CONFIG.weatherRecoveryMinMs,
      VESSEL_VISUAL_CONFIG.weatherRecoveryMaxMs,
      random,
    );
    state.portStates.forEach((portState) => {
      portState.cooldownMs = Math.max(portState.cooldownMs, recovery);
    });
  }
  state.severeWeatherActive = severe;
}

function updateVesselVisuals(time, delta) {
  const scene = this;
  const state = getVesselVisualState(scene);
  const camera = scene?.cameras?.main;
  if (!state || !camera) return;
  if (scene.scene?.isVisible && !scene.scene.isVisible()) {
    clearVesselVisuals(scene);
    return;
  }
  if (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) {
    clearVesselVisuals(scene);
    return;
  }
  const paused = typeof simPaused !== 'undefined' && simPaused;
  const speedMultiplier = paused
    ? 0
    : Math.max(0, Number(typeof simSpeedMul === 'undefined' ? 1 : simSpeedMul) || 0);
  const scaledDelta = Math.min(VESSEL_VISUAL_CONFIG.maxDeltaMs, Math.max(0, Number(delta) || 0)) * speedMultiplier;
  const severe = isVesselSevereWeather(typeof city === 'undefined' ? null : city.weather);
  applyVesselWeatherRecovery(state, severe);
  const rect = getVesselCameraRect(scene, VESSEL_VISUAL_CONFIG.viewportPaddingTiles);
  const spawnRect = getVesselCameraRect(scene, 0);
  const canStart = camera.zoom >= VESSEL_VISUAL_CONFIG.zoomMin && !paused;
  const allPorts = getVesselPortEntries();
  // No container_port anywhere in the city yet, or none of them are near the
  // camera: skip everything below, including the allPorts.forEach() port-
  // state bookkeeping in updateVesselPorts (nothing to book-keep).
  if (!allPorts.length) return;
  const eligiblePorts = canStart
    ? allPorts.filter((entry) => vesselFacilityIsNearView(scene, entry, rect))
    : [];
  if (eligiblePorts.length) requestVesselBundle(scene);
  updateVesselPorts(scene, state, scaledDelta, eligiblePorts, spawnRect, allPorts);
}

const vesselVisualTestApi = {
  VESSEL_VISUAL_CONFIG,
  VESSEL_AUDIO_CONFIG,
  VESSEL_DIRECTIONS,
  VESSEL_CARGO_STATES,
  VESSEL_ASSET_REGISTRY,
  CARGO_SCENARIO_DEFS,
  getVesselTextureDirection,
  isVesselSevereWeather,
  getCargoScenarioDefinition,
  getVesselEventAudioVolume,
  startVesselEventSound,
  updateVesselEventSound,
  stopVesselEventSound,
  getHarborBerthCandidates,
  getVesselDockPoint,
  getVesselHarborVisualVariant,
  getVesselDockDirection,
  findOceanRoute,
  findVesselShipRoute,
  isVesselRouteStillOutsideView,
  getVesselPortRoute,
  simplifyVesselTrack,
  roundVesselWaterTrack,
  buildVesselTrackMetrics,
  evaluateVesselLogicalTrack,
  vesselTracksConflict,
  setupVesselVisuals,
  updateVesselVisuals,
  clearVesselVisuals,
  invalidateVesselVisualView,
};

if (typeof module !== 'undefined' && module.exports) module.exports = vesselVisualTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    setupVesselVisuals,
    updateVesselVisuals,
    clearVesselVisuals,
    invalidateVesselVisualView,
  });
}
