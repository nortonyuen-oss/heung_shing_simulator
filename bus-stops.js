// Bus stops: the decorative shelters on road shoulders - which side of a road tile they
// sit on, their sprites, and how they follow view rotation. Split out of main.js.

// ── Bus stops (decorative road-shoulder prop; no simulation effect) ───────────
// Orientation logic mirrors getHarborVisualKey/getBridgeRampVisualDirection:
// a bus stop is stored against the *raw* (rotation-invariant) mapData edge
// ('n'|'e'|'s'|'w') it sits on, not the screen corner. At render time the raw
// edge is rotated through rotateDirection(rawSide, mapRotation) into the
// current screen corner (n→UR, e→LR, s→LL, w→UL — same convention as
// getHarborVisualKey), so a placed stop stays on the correct physical road
// shoulder no matter how the player has rotated the view.
const BUS_STOP_ROAD_ORIENTATIONS = {
  road_straight_v: ['n', 's'], // UR/LL diagonal at the current rotation
  road_straight_h: ['w', 'e'], // UL/LR diagonal at the current rotation
};

// Uses the *unrotated* base key, not getTileKey() — eligibility and which raw
// side a click resolves to must depend only on the tile's true grid
// connectivity, never on what the camera's rotation happened to be at click
// time (getTileKey's road_straight_v/h swap with mapRotation; getBaseTileKey
// doesn't). Storing a rotation-dependent raw side was why placement went
// inconsistent after rotating the view — same mistake getHarborWaterSides
// avoids by reading raw mapData neighbours before any rotateDirection call.
function getBusStopEligibleSides(row, col) {
  return BUS_STOP_ROAD_ORIENTATIONS[getBaseTileKey(row, col)] ?? null;
}

function getBusStopVisualCorner(rawSide) {
  const visual = rotateDirection(rawSide, mapRotation);
  return BUS_STOP_RAW_SIDE_TO_VISUAL_CORNER[visual] ?? 'ur';
}

// The texture corner (above) picks which of the 4 fixed images to show, per
// the N-S->UR/LL, E-W->UL/LR convention. But that corner's edge is the
// *lengthwise* one — where the road continues into the next tile — not where
// the sidewalk actually is. The sidewalk runs along the perpendicular pair of
// edges instead, so positioning uses a different corner from the one that
// picked the texture: flip only the vertical half (U<->L) and keep the
// horizontal half (L/R) fixed, which maps each texture corner to its
// perpendicular neighbour (ur<->ul, ll<->lr).
const BUS_STOP_ANCHOR_CORNER_FROM_TEXTURE_CORNER = { ur: 'ul', ul: 'ur', ll: 'lr', lr: 'll' };

function getBusStopAnchorCorner(rawSide) {
  const textureCorner = getBusStopVisualCorner(rawSide);
  return BUS_STOP_ANCHOR_CORNER_FROM_TEXTURE_CORNER[textureCorner] ?? textureCorner;
}

function getBusStopSpriteId(row, col, rawSide) {
  return `${getTileId(row, col)}:${rawSide}`;
}

function getBusStopSides(row, col) {
  return busStopMap[row]?.[col] ?? null;
}

// Anchors a corner ('ur'|'lr'|'ll'|'ul') toward that edge of the tile's
// actual rendered face — the same polygon pointerToTile()/
// getTileFaceVertices() hit-test against — rather than re-deriving screen
// position from isoToScreen()+TILE_HEIGHT/2 by hand. That hand-rolled version
// used a different vertical reference point than the terrain sprite's own
// (which subtracts TILE_IMAGE_HEIGHT to find the face's top vertex) and ended
// up tens of pixels off, landing the prop on a neighbouring tile.
//
// The point is a fixed per-corner pixel offset from the tile centre (see
// BUS_STOP_ANCHOR_OFFSETS, constants.js), hand-tuned via the bus-stop
// calibrator so the sprite sits on the pavement shoulder rather than the
// driveway or a neighbouring tile.
function getBusStopAnchorPoint(row, col, corner, offsetX, offsetY) {
  const geo = getTileFaceGeometry(row, col, offsetX, offsetY);
  // bus-stop-calibrator.js (test-mode dev tool): a corner dragged this
  // session overrides the shipped default below entirely.
  const override = typeof getBusStopCalibrationOverride === 'function'
    ? getBusStopCalibrationOverride(corner)
    : null;
  const offset = override ?? BUS_STOP_ANCHOR_OFFSETS[corner] ?? BUS_STOP_ANCHOR_OFFSETS.ur;
  return { x: geo.center.x + offset.dx, y: geo.center.y + offset.dy };
}

// Depth-sorts a bus stop exactly like a 1x1-footprint building (footprintCols/
// Rows = 1, so getBuildingSortDepth's footprintDepthBias is 0) rather than
// getObjectTileDepth's plain tile-Y. getBusStopAnchorPoint's edge-midpoint
// already subtracts TILE_IMAGE_HEIGHT (for correct on-screen positioning),
// which getObjectTileDepth doesn't know about and buildings' own +TILE_HEIGHT
// bump doesn't either — using it for depth too under-ranked bus stops by
// roughly TILE_IMAGE_HEIGHT + TILE_HEIGHT versus a building at the same tile,
// so a nearby large building would render in front of and cover it.
function getBusStopSortDepth(row, col, corner) {
  const rawY = isoToScreen(col, row).y;
  const baseDepth = getBuildingSortDepth(rawY, 1, 1, getElevationVisualOffset(row, col));
  const margin = BUS_STOP_DEPTH_PRIORITY_MARGIN_TILES * TILE_HEIGHT;
  // UR/LR: vehicle always wins (push the stop behind). UL/LL: the stop always
  // wins (push it in front). See BUS_STOP_VEHICLE_WINS_CORNERS, constants.js.
  return baseDepth + (BUS_STOP_VEHICLE_WINS_CORNERS.has(corner) ? -margin : margin);
}

function placeBusStopSprite(scene, row, col, rawSide) {
  if (!scene?.add || !scene.busStopSprites) return null;
  const corner = getBusStopVisualCorner(rawSide);
  const anchorCorner = getBusStopAnchorCorner(rawSide);
  const anchor = getBusStopAnchorPoint(row, col, anchorCorner, scene.offsetX, scene.offsetY);
  const sprite = scene.add.image(anchor.x, anchor.y, `bus_stop_${corner}`);
  addToRenderLayer(scene, sprite, 'objectLayer');
  applyBusStopTextureAnchor(scene, sprite, corner);
  sprite.setDepth(getBusStopSortDepth(row, col, corner));
  sprite.setMask(scene.worldMask);
  sprite.mapRow = row;
  sprite.mapCol = col;
  sprite.busStopRawSide = rawSide;
  scene.busStopSprites.set(getBusStopSpriteId(row, col, rawSide), sprite);
  sortRenderLayer(scene, 'objectLayer');
  // bus-stop-calibrator.js: a stop placed while the calibrator is open should
  // be draggable immediately too, not just the ones that existed when it opened.
  if (typeof isBusStopCalibrationActive === 'function' && isBusStopCalibrationActive()
    && typeof makeBusStopSpriteDraggable === 'function') {
    makeBusStopSpriteDraggable(scene, sprite);
  }
  return sprite;
}

function positionBusStopSprite(scene, sprite) {
  if (!sprite) return;
  const row = sprite.mapRow;
  const col = sprite.mapCol;
  const corner = getBusStopVisualCorner(sprite.busStopRawSide);
  const textureKey = `bus_stop_${corner}`;
  if (sprite.texture?.key !== textureKey) sprite.setTexture(textureKey);
  const anchorCorner = getBusStopAnchorCorner(sprite.busStopRawSide);
  const anchor = getBusStopAnchorPoint(row, col, anchorCorner, scene.offsetX, scene.offsetY);
  applyBusStopTextureAnchor(scene, sprite, corner);
  sprite.setPosition(anchor.x, anchor.y);
  sprite.setDepth(getBusStopSortDepth(row, col, corner));
}

// BUS_STOP_SCALE and the shoulder offsets were calibrated against the 1024px source art with
// the origin at its bottom centre; getPropTextureAnchor keeps that true for the release
// pipeline's resized and trimmed WebP too (which used to draw stops at half size, off their
// anchor).
const BUS_STOP_SOURCE_PATHS = { ur: 'Models/busStop/busStop_UR.png', ul: 'Models/busStop/busStop_UL.png', ll: 'Models/busStop/busStop_LL.png', lr: 'Models/busStop/busStop_LR.png' };

function applyBusStopTextureAnchor(scene, sprite, corner) {
  // The base frame, not the source image: the texture may be a frame of the prop atlas.
  const texture = scene?.textures?.get?.(`bus_stop_${corner}`)?.get?.();
  const spec = texture
    ? getPropTextureAnchor(BUS_STOP_SOURCE_PATHS[corner], 512, 1024, texture)
    : { originX: 0.5, originY: 1, scaleMultiplier: 1 };
  sprite.setOrigin(spec.originX, spec.originY);
  sprite.setScale(BUS_STOP_SCALE * spec.scaleMultiplier);
}

function refreshBusStopSpriteAt(scene, row, col) {
  ['n', 'e', 's', 'w'].forEach((side) => {
    const key = getBusStopSpriteId(row, col, side);
    const existing = scene?.busStopSprites?.get(key);
    if (existing) {
      existing.destroy();
      scene.busStopSprites.delete(key);
    }
  });
  // The road tile itself shows a busStop line-marking variant that overrides everything else
  // (getRoadLineVariantAt) - re-key it every time a stop is added or removed here, or the
  // marking would only update on some unrelated later refresh (a nearby road edit, a rotation).
  if (scene?.tileSprites?.[row]?.[col]) {
    refreshTileSprite(scene, row, col);
    refreshRoadLineRunThrough(scene, row, col);
    if (typeof schedulePedestrianRailingRefresh === 'function') schedulePedestrianRailingRefresh(scene);
    if (typeof scheduleStreetFurnitureRefresh === 'function') scheduleStreetFurnitureRefresh(scene);
  }
  const sides = getBusStopSides(row, col);
  if (!sides || !scene) return;
  sides.forEach((side) => placeBusStopSprite(scene, row, col, side));
}

// Replaces a tile's full shoulder set — used by placeBusStop's (tools.js)
// none->left->right->both->none click cycle. Pass [] to clear.
function setBusStopSides(row, col, sides) {
  if (!busStopMap[row]) busStopMap[row] = [];
  busStopMap[row][col] = sides.length ? sides : null;
  if (typeof markTransportStopsDirty === 'function') markTransportStopsDirty([{ row, col }]);
}

function removeBusStopsAt(scene, row, col) {
  if (!isInsideMap(row, col) || !busStopMap[row]?.[col]) return false;
  busStopMap[row][col] = null;
  ['n', 'e', 's', 'w'].forEach((side) => {
    const key = getBusStopSpriteId(row, col, side);
    const sprite = scene?.busStopSprites?.get(key);
    if (sprite) {
      sprite.destroy();
      scene.busStopSprites.delete(key);
    }
  });
  if (typeof markTransportStopsDirty === 'function') markTransportStopsDirty([{ row, col }]);
  return true;
}

// Called from refreshTileArea for every tile whose road shape may just have
// changed (new/removed neighbouring road, bulldoze, terrain edit). A bus stop
// only makes sense on a straight road shoulder — if the tile no longer
// qualifies, drop it rather than leave it floating on a corner/T/cross tile.
function invalidateBusStopIfOrphaned(scene, row, col) {
  if (!busStopMap[row]?.[col]) return;
  if (getBusStopEligibleSides(row, col)) return;
  removeBusStopsAt(scene, row, col);
}

function clearBusStopSprites(scene) {
  scene?.busStopSprites?.forEach((sprite) => sprite.destroy());
  scene?.busStopSprites?.clear();
}

function rebuildBusStopSprites(scene) {
  clearBusStopSprites(scene);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (busStopMap[row]?.[col]) refreshBusStopSpriteAt(scene, row, col);
    }
  }
}
