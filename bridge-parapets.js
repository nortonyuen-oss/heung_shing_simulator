// Bridge parapets (行車天橋護欄).
//
// Every bridge deck and ramp tile carries a concrete-and-rail barrier along both of its long
// edges. Like the signals and lamps the set is derived from the map (here the bridge map) and
// never saved. Each barrier is one static Image, one texture segment per tile edge, anchored
// at the midpoint of that edge on the raised deck surface and viewport-culled with the other
// prop maps (main.js updateSpriteViewportCulling).
//
// The art (scripts/bake-bridge-parapet-textures.js) comes in the two screen axes - parapet_h
// along NW-SE for the NE and SW edges, parapet_v along SW-NE for the SE and NW edges - plus a
// sheared variant per ramp direction so a ramp's barrier follows its slope. Which axis a tile
// needs is decided from its map-space edge after rotation, so the map can turn freely.
//
// Depth: a barrier bounds everything standing on its deck - a near edge sorts as the lowest
// point of the surface along it, a far edge as the highest - so posts and traffic on the deck
// draw in front of the far barrier and behind the near one (bridgeParapetAnchor).

const BRIDGE_PARAPET_TEXTURE_PREFIX = 'bridge_parapet_';
const BRIDGE_PARAPET_TEXTURE_FILES = Object.freeze({
  bridge_parapet_h: 'Models/roadAssessories/parapet_h.png',
  bridge_parapet_h_high_se: 'Models/roadAssessories/parapet_h_high_se.png',
  bridge_parapet_h_high_nw: 'Models/roadAssessories/parapet_h_high_nw.png',
  bridge_parapet_v: 'Models/roadAssessories/parapet_v.png',
  bridge_parapet_v_high_ne: 'Models/roadAssessories/parapet_v_high_ne.png',
  bridge_parapet_v_high_sw: 'Models/roadAssessories/parapet_v_high_sw.png',
});
// The baked canvases are 700x600 with the base-line midpoint at (350, 360).
const BRIDGE_PARAPET_SOURCE_ANCHOR = Object.freeze({ x: 350, y: 360 });
// Facing = the screen edge the segment stands on.
const BRIDGE_PARAPET_FACINGS = Object.freeze(['ne', 'se', 'sw', 'nw']);
// A map-space edge seen on screen at the default view: n = NE, e = SE, s = SW, w = NW.
const BRIDGE_PARAPET_SCREEN_EDGE = Object.freeze({ n: 'ne', e: 'se', s: 'sw', w: 'nw' });
const BRIDGE_PARAPET_EDGE_DELTA = Object.freeze({
  n: { row: -0.5, col: 0 }, e: { row: 0, col: 0.5 }, s: { row: 0.5, col: 0 }, w: { row: 0, col: -0.5 },
});
// The long edges of a bridge tile: a deck along a row (e-w) or a ramp climbing e/w is edged
// on n and s; one along a column (n-s) or climbing n/s on e and w.
const BRIDGE_PARAPET_SIDES_FOR_AXIS = Object.freeze({ row: ['n', 's'], col: ['e', 'w'] });

// Pure: every parapet segment the bridge map calls for. `bridgeValueAt(row, col)` returns the
// normalised bridge value ('deck:row', 'deck:col', 'ramp:n'...) or null.
function computeBridgeParapetPlacements({ mapWidth, mapHeight, bridgeValueAt }) {
  const placements = [];
  for (let row = 0; row < mapHeight; row++) {
    for (let col = 0; col < mapWidth; col++) {
      const value = bridgeValueAt(row, col);
      if (!value) continue;
      let axis = null;
      let high = null;
      if (value === 'deck:row') axis = 'row';
      else if (value === 'deck:col') axis = 'col';
      else {
        const ramp = /^ramp:([nesw])$/.exec(value);
        if (!ramp) continue;
        high = ramp[1];
        axis = high === 'e' || high === 'w' ? 'row' : 'col';
      }
      for (const side of BRIDGE_PARAPET_SIDES_FOR_AXIS[axis]) {
        placements.push({ row, col, side, high });
      }
    }
  }
  return placements;
}

function bridgeParapetId(placement) {
  return `${placement.row}:${placement.col}:${placement.side}`;
}

function bridgeParapetFacing(placement, rotation = typeof mapRotation !== 'undefined' ? mapRotation : 0) {
  const visualSide = typeof rotateDirection === 'function' ? rotateDirection(placement.side, rotation) : placement.side;
  return BRIDGE_PARAPET_SCREEN_EDGE[visualSide] ?? 'ne';
}

// The texture for a segment on `facing`; a ramp's segment climbs towards `visualHigh` (the
// ramp's high end as a map direction after rotation).
function bridgeParapetTextureKey(facing, visualHigh = null) {
  const axis = facing === 'ne' || facing === 'sw' ? 'h' : 'v';
  if (!visualHigh) return `${BRIDGE_PARAPET_TEXTURE_PREFIX}${axis}`;
  const highEdge = BRIDGE_PARAPET_SCREEN_EDGE[visualHigh];
  const key = `${BRIDGE_PARAPET_TEXTURE_PREFIX}${axis}_high_${highEdge}`;
  return BRIDGE_PARAPET_TEXTURE_FILES[key] ? key : `${BRIDGE_PARAPET_TEXTURE_PREFIX}${axis}`;
}

function bridgeParapetOffsetFor(facing) {
  const override = typeof getBridgeParapetCalibrationOffset === 'function' ? getBridgeParapetCalibrationOffset(facing) : null;
  return override ?? BRIDGE_PARAPET_ANCHOR_OFFSETS[facing] ?? { dx: 0, dy: 0 };
}

function bridgeParapetScale() {
  const override = typeof getBridgeParapetCalibrationScale === 'function' ? getBridgeParapetCalibrationScale() : null;
  return override ?? BRIDGE_PARAPET_SCALE;
}

// How far above the tile face the deck surface sits at the tile centre (the edge midpoint is
// level with it along the road): the full deck lift on a deck, half of it on a ramp. Shares
// the lamps' surface model so the barrier's base meets the deck where the posts' feet do.
function bridgeParapetSurfaceLift(placement) {
  if (typeof streetLampSurfaceLift !== 'function') return 0;
  return streetLampSurfaceLift({ row: placement.row, col: placement.col, offsetRow: 0, offsetCol: 0 });
}

// The two ends of a segment's edge: screen y and surface lift at each, in the lamps' terms
// (lift above the drawn tile face). A deck is level; a ramp's ends sit at its foot and top.
function bridgeParapetEdgeEnds(placement) {
  const centreLift = bridgeParapetSurfaceLift(placement);
  const delta = BRIDGE_PARAPET_EDGE_DELTA[placement.side];
  // The edge runs along the road axis: perpendicular to the side's own direction.
  const axis = delta.row === 0 ? { row: 0.5, col: 0 } : { row: 0, col: 0.5 };
  const surface = typeof getTrafficRoadSurface === 'function' && typeof getTrafficRuntimeLayers === 'function'
    ? getTrafficRoadSurface(placement.row, placement.col, getTrafficRuntimeLayers())
    : null;
  return [1, -1].map((sign) => {
    const row = placement.row + delta.row + axis.row * sign;
    const col = placement.col + delta.col + axis.col * sign;
    // Which map direction this end lies towards, for the surface's endpoint lift.
    const towards = axis.row ? (sign > 0 ? 's' : 'n') : (sign > 0 ? 'e' : 'w');
    const endpoint = surface?.endpointLifts?.[towards];
    const lift = Number.isFinite(endpoint) && Number.isFinite(surface?.centerLift)
      ? centreLift + (endpoint - surface.centerLift)
      : centreLift;
    return { y: isoToScreen(col, row).y, lift };
  });
}

// Screen anchor (base-line midpoint on the edge) and depth, in the lamps' and vehicles' terms.
// Everything on the deck (posts, traffic) sorts by its own screen y minus the lift under it,
// and a barrier is a long thin thing along the road, so one mid-point depth would let a post
// or a car near either end of the tile cross it. The barrier therefore takes the depth of its
// farthest end when it is a far (NW/NE) edge and of its nearest end when it is a near (SE/SW)
// edge: whatever stands on the deck draws in front of the far barrier and behind the near one.
function bridgeParapetAnchor(scene, placement, facing) {
  const geo = getTileFaceGeometry(placement.row, placement.col, scene.offsetX, scene.offsetY);
  const centre = isoToScreen(placement.col, placement.row);
  const delta = BRIDGE_PARAPET_EDGE_DELTA[placement.side];
  const edge = isoToScreen(placement.col + delta.col, placement.row + delta.row);
  const offset = bridgeParapetOffsetFor(facing);
  const lift = bridgeParapetSurfaceLift(placement);
  const near = facing === 'se' || facing === 'sw';
  const endDepths = bridgeParapetEdgeEnds(placement).map((end) => end.y + TILE_HEIGHT - end.lift);
  return {
    x: geo.center.x + (edge.x - centre.x) + offset.dx,
    y: geo.center.y + (edge.y - centre.y) + offset.dy - lift,
    depth: getWorldDepth('object', near ? Math.max(...endDepths) : Math.min(...endDepths)),
  };
}

function applyBridgeParapetSpriteTexture(scene, sprite, textureKey) {
  if (!scene.textures.exists(textureKey)) return false;
  if (sprite.texture?.key !== textureKey) sprite.setTexture(textureKey);
  const texture = scene.textures.get(textureKey)?.getSourceImage?.();
  const anchorSpec = typeof getPropTextureAnchor === 'function' && texture
    ? getPropTextureAnchor(BRIDGE_PARAPET_TEXTURE_FILES[textureKey], BRIDGE_PARAPET_SOURCE_ANCHOR.x, BRIDGE_PARAPET_SOURCE_ANCHOR.y, texture)
    : { originX: 0.5, originY: 0.6, scaleMultiplier: 1 };
  sprite.setOrigin(anchorSpec.originX, anchorSpec.originY);
  sprite.setScale(bridgeParapetScale() * anchorSpec.scaleMultiplier);
  return true;
}

function positionBridgeParapetSprite(scene, sprite) {
  if (!scene || !sprite?.bridgeParapet) return;
  const placement = sprite.bridgeParapet;
  const facing = bridgeParapetFacing(placement);
  sprite.bridgeParapetFacing = facing;
  const visualHigh = placement.high && typeof rotateDirection === 'function'
    ? rotateDirection(placement.high, typeof mapRotation !== 'undefined' ? mapRotation : 0)
    : placement.high;
  applyBridgeParapetSpriteTexture(scene, sprite, bridgeParapetTextureKey(facing, visualHigh));
  const anchor = bridgeParapetAnchor(scene, placement, facing);
  sprite.setPosition(anchor.x, anchor.y);
  sprite.setDepth(anchor.depth);
}

function createBridgeParapetSprite(scene, placement) {
  const textureKey = bridgeParapetTextureKey(bridgeParapetFacing(placement), placement.high);
  if (!scene.textures.exists(textureKey)) return null;
  const sprite = scene.add.image(0, 0, textureKey);
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
  if (scene.worldMask) sprite.setMask(scene.worldMask);
  sprite.bridgeParapet = placement;
  sprite.mapRow = placement.row;
  sprite.mapCol = placement.col;
  positionBridgeParapetSprite(scene, sprite);
  if (typeof isBridgeParapetCalibrationActive === 'function' && isBridgeParapetCalibrationActive()
    && typeof makeBridgeParapetSpriteDraggable === 'function') {
    makeBridgeParapetSpriteDraggable(scene, sprite);
  }
  return sprite;
}

function ensureBridgeParapetSprites(scene) {
  if (scene && !scene.bridgeParapetSprites) scene.bridgeParapetSprites = new Map();
  return scene?.bridgeParapetSprites ?? null;
}

function clearBridgeParapetSprites(scene) {
  const sprites = scene?.bridgeParapetSprites;
  if (!sprites) return;
  sprites.forEach((sprite) => sprite.destroy());
  sprites.clear();
}

// Reconcile the barrier sprites with what the bridge map calls for now.
function rebuildBridgeParapetSprites(scene) {
  const sprites = ensureBridgeParapetSprites(scene);
  if (!sprites || typeof normalizeBridgeMapValue !== 'function' || typeof bridgeMap === 'undefined') return;
  const bridgeValueAt = (row, col) => normalizeBridgeMapValue(bridgeMap?.[row]?.[col]);
  const placements = computeBridgeParapetPlacements({ mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT, bridgeValueAt });
  const wanted = new Map(placements.map((placement) => [bridgeParapetId(placement), placement]));
  sprites.forEach((sprite, id) => {
    if (wanted.has(id)) return;
    sprite.destroy();
    sprites.delete(id);
  });
  wanted.forEach((placement, id) => {
    const existing = sprites.get(id);
    if (existing) {
      existing.bridgeParapet = placement;
      positionBridgeParapetSprite(scene, existing);
      return;
    }
    const sprite = createBridgeParapetSprite(scene, placement);
    if (sprite) sprites.set(id, sprite);
  });
  if (typeof sortRenderLayer === 'function') sortRenderLayer(scene, 'objectLayer');
  scene.bridgeParapetRefreshPending = false;
}

// Bridge edits arrive one tile at a time; coalesce them into one rebuild on the next tick.
function scheduleBridgeParapetRefresh(scene) {
  if (!scene || scene.bridgeParapetRefreshPending) return;
  scene.bridgeParapetRefreshPending = true;
  setTimeout(() => {
    if (!scene.bridgeParapetRefreshPending) return;
    if (!scene.sys || !scene.tileSprites) { scene.bridgeParapetRefreshPending = false; return; }
    rebuildBridgeParapetSprites(scene);
  }, 0);
}

function refreshAllBridgeParapetSprites(scene) {
  scene?.bridgeParapetSprites?.forEach((sprite) => positionBridgeParapetSprite(scene, sprite));
}

const bridgeParapetsTestApi = {
  BRIDGE_PARAPET_FACINGS,
  BRIDGE_PARAPET_TEXTURE_FILES,
  BRIDGE_PARAPET_SOURCE_ANCHOR,
  BRIDGE_PARAPET_SCREEN_EDGE,
  computeBridgeParapetPlacements,
  bridgeParapetId,
  bridgeParapetFacing,
  bridgeParapetTextureKey,
  bridgeParapetSurfaceLift,
  bridgeParapetEdgeEnds,
  bridgeParapetAnchor,
};

if (typeof module !== 'undefined' && module.exports) module.exports = bridgeParapetsTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    computeBridgeParapetPlacements,
    rebuildBridgeParapetSprites,
    scheduleBridgeParapetRefresh,
    refreshAllBridgeParapetSprites,
    positionBridgeParapetSprite,
    clearBridgeParapetSprites,
    bridgeParapetFacing,
    bridgeParapetId,
    BRIDGE_PARAPET_FACINGS,
    BRIDGE_PARAPET_TEXTURE_FILES,
  });
}
