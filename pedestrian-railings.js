// Pedestrian railings (行人路方柱欄杆).
//
// Hong Kong fences the pavement where people must not step out into traffic: on the approach to
// a junction and either side of a zebra crossing, so they cross at the crossing itself. Here the
// straight tile leading into a yellow-box junction (road_cross / road_t_*) and the straight
// tiles immediately before and after a zebra crossing each get a run of railing along both
// kerbs, over the half of the tile nearest the junction or crossing - two ~5 m sets, 10 m, half
// a tile. The zebra tile itself is fenced too, over the half its stripes are not painted on
// (PEDESTRIAN_RAILING_ZEBRA_FAR_SIDE). A kerb whose neighbour across it is road (the other carriageway of a dual
// carriageway, a parallel street) has no pavement to fence, and a tile with a bus stop keeps
// its kerb open. Like the signals and lamps the set is derived from the map and never saved.
//
// Each run is one static Image (scripts/bake-pedestrian-railing-textures.js): _h along screen
// NW-SE for the NE and SW kerbs, _v along SW-NE for the SE and NW kerbs, anchored at the run's
// base-line midpoint. Depth follows the bridge parapets: a run along a near (SE/SW) kerb sorts
// at its nearest end and one along a far (NE/NW) kerb at its farthest, so traffic draws in
// front of the far railing and behind the near one.

const PEDESTRIAN_RAILING_TEXTURE_FILES = Object.freeze({
  pedestrian_railing_h: 'Models/roadAssessories/pedestrianRailing_h.png',
  pedestrian_railing_v: 'Models/roadAssessories/pedestrianRailing_v.png',
});
// Keep in step with scripts/bake-pedestrian-railing-textures.js.
const PEDESTRIAN_RAILING_SOURCE_CANVAS = Object.freeze({ width: 512, height: 512 });
const PEDESTRIAN_RAILING_SOURCE_ANCHOR = Object.freeze({ x: 256, y: 300 });
const PEDESTRIAN_RAILING_FACINGS = Object.freeze(['ne', 'se', 'sw', 'nw']);
// A map-space kerb side seen on screen at the default view: n = NE, e = SE, s = SW, w = NW.
const PEDESTRIAN_RAILING_SCREEN_EDGE = Object.freeze({ n: 'ne', e: 'se', s: 'sw', w: 'nw' });
const PEDESTRIAN_RAILING_DELTA = Object.freeze({
  n: { row: -1, col: 0 }, e: { row: 0, col: 1 }, s: { row: 1, col: 0 }, w: { row: 0, col: -1 },
});
// A straight road's kerbs and the two directions along it.
const PEDESTRIAN_RAILING_STRAIGHTS = Object.freeze({
  road_straight_v: { kerbs: ['e', 'w'], along: ['n', 's'] },
  road_straight_h: { kerbs: ['n', 's'], along: ['e', 'w'] },
});

// Which half of a zebra tile is clear of the stripes, as an ON-SCREEN direction per rendered
// tile axis: the calibrated chevronCorridor_crossing art (road-line-markings.js) paints them on
// the NE half of a SW-NE (road_straight_v) tile and the NW half of a NW-SE (road_straight_h)
// one. Recalibrating that marking to the other half means flipping these.
const PEDESTRIAN_RAILING_ZEBRA_FAR_SIDE = Object.freeze({ v: 's', h: 'e' });

function isPedestrianRailingJunctionKey(key) {
  return key === 'road_cross' || (typeof key === 'string' && key.startsWith('road_t_'));
}

// Pure: every run the map calls for. `roadKeyAt(row, col)` is getRoadKey (map frame) or null
// off-road; `zebraFarSideAt(row, col)` is null unless the tile shows a zebra crossing, then the
// map direction of its half clear of the stripes; `hasBusStopAt(row, col)` says it has a bus
// stop. Each placement is a tile, the kerb `side` it stands on and the direction `toward` the
// half of the tile it covers (towards the junction or crossing it guards).
function computePedestrianRailingPlacements({ mapWidth, mapHeight, roadKeyAt, zebraFarSideAt = () => null, hasBusStopAt = () => false }) {
  const inside = (row, col) => row >= 0 && col >= 0 && row < mapHeight && col < mapWidth;
  const keyAt = (row, col) => (inside(row, col) ? roadKeyAt(row, col) : null);
  const placements = [];
  for (let row = 0; row < mapHeight; row++) {
    for (let col = 0; col < mapWidth; col++) {
      const straight = PEDESTRIAN_RAILING_STRAIGHTS[keyAt(row, col)];
      if (!straight || hasBusStopAt(row, col)) continue;
      const towards = straight.along.filter((toward) => {
        const ahead = PEDESTRIAN_RAILING_DELTA[toward];
        const aheadRow = row + ahead.row;
        const aheadCol = col + ahead.col;
        return isPedestrianRailingJunctionKey(keyAt(aheadRow, aheadCol))
          || (inside(aheadRow, aheadCol) && zebraFarSideAt(aheadRow, aheadCol) !== null);
      });
      const farSide = zebraFarSideAt(row, col);
      if (straight.along.includes(farSide) && !towards.includes(farSide)) towards.push(farSide);
      for (const toward of towards) {
        for (const side of straight.kerbs) {
          const across = PEDESTRIAN_RAILING_DELTA[side];
          if (keyAt(row + across.row, col + across.col)) continue;
          placements.push({ row, col, side, toward });
        }
      }
    }
  }
  return placements;
}

function pedestrianRailingId(placement) {
  return `${placement.row}:${placement.col}:${placement.side}:${placement.toward}`;
}

function pedestrianRailingFacing(placement, rotation = typeof mapRotation !== 'undefined' ? mapRotation : 0) {
  const visualSide = typeof rotateDirection === 'function' ? rotateDirection(placement.side, rotation) : placement.side;
  return PEDESTRIAN_RAILING_SCREEN_EDGE[visualSide] ?? 'ne';
}

function pedestrianRailingTextureKey(facing) {
  return facing === 'ne' || facing === 'sw' ? 'pedestrian_railing_h' : 'pedestrian_railing_v';
}

function pedestrianRailingOffsetFor(facing) {
  const override = typeof getPedestrianRailingCalibrationOffset === 'function' ? getPedestrianRailingCalibrationOffset(facing) : null;
  return override ?? PEDESTRIAN_RAILING_ANCHOR_OFFSETS[facing] ?? { dx: 0, dy: 0 };
}

function pedestrianRailingScale() {
  const override = typeof getPedestrianRailingCalibrationScale === 'function' ? getPedestrianRailingCalibrationScale() : null;
  return override ?? PEDESTRIAN_RAILING_SCALE;
}

// Map-space point of a run at `forward` tiles along it towards the junction/crossing, on its kerb.
function pedestrianRailingLogicalPoint(placement, forward, inset = PEDESTRIAN_RAILING_LOGICAL_INSET) {
  const across = PEDESTRIAN_RAILING_DELTA[placement.side];
  const ahead = PEDESTRIAN_RAILING_DELTA[placement.toward];
  return {
    row: placement.row + across.row * inset.lateral + ahead.row * forward,
    col: placement.col + across.col * inset.lateral + ahead.col * forward,
  };
}

// Screen anchor (the run's base-line midpoint) and depth, in the same terms as the parapets.
function pedestrianRailingAnchor(scene, placement, facing) {
  const inset = PEDESTRIAN_RAILING_LOGICAL_INSET;
  const geo = getTileFaceGeometry(placement.row, placement.col, scene.offsetX, scene.offsetY);
  const centre = isoToScreen(placement.col, placement.row);
  const middle = pedestrianRailingLogicalPoint(placement, inset.forward);
  const point = isoToScreen(middle.col, middle.row);
  const offset = pedestrianRailingOffsetFor(facing);
  const near = facing === 'se' || facing === 'sw';
  const endDepths = [inset.forward - 0.25, inset.forward + 0.25].map((forward) => {
    const end = pedestrianRailingLogicalPoint(placement, forward);
    return isoToScreen(end.col, end.row).y + TILE_HEIGHT;
  });
  return {
    x: geo.center.x + (point.x - centre.x) + offset.dx,
    y: geo.center.y + (point.y - centre.y) + offset.dy,
    depth: getWorldDepth('object', near ? Math.max(...endDepths) : Math.min(...endDepths)),
  };
}

function applyPedestrianRailingSpriteTexture(scene, sprite, textureKey) {
  if (!scene.textures.exists(textureKey)) return false;
  if (sprite.texture?.key !== textureKey) sprite.setTexture(textureKey);
  const texture = scene.textures.get(textureKey)?.getSourceImage?.();
  const anchorSpec = typeof getPropTextureAnchor === 'function' && texture
    ? getPropTextureAnchor(PEDESTRIAN_RAILING_TEXTURE_FILES[textureKey], PEDESTRIAN_RAILING_SOURCE_ANCHOR.x, PEDESTRIAN_RAILING_SOURCE_ANCHOR.y, texture)
    : { originX: PEDESTRIAN_RAILING_SOURCE_ANCHOR.x / PEDESTRIAN_RAILING_SOURCE_CANVAS.width, originY: PEDESTRIAN_RAILING_SOURCE_ANCHOR.y / PEDESTRIAN_RAILING_SOURCE_CANVAS.height, scaleMultiplier: 1 };
  sprite.setOrigin(anchorSpec.originX, anchorSpec.originY);
  sprite.setScale(pedestrianRailingScale() * anchorSpec.scaleMultiplier);
  return true;
}

function positionPedestrianRailingSprite(scene, sprite) {
  if (!scene || !sprite?.pedestrianRailing) return;
  const placement = sprite.pedestrianRailing;
  const facing = pedestrianRailingFacing(placement);
  sprite.pedestrianRailingFacing = facing;
  applyPedestrianRailingSpriteTexture(scene, sprite, pedestrianRailingTextureKey(facing));
  const anchor = pedestrianRailingAnchor(scene, placement, facing);
  sprite.setPosition(anchor.x, anchor.y);
  sprite.setDepth(anchor.depth);
}

function createPedestrianRailingSprite(scene, placement) {
  const textureKey = pedestrianRailingTextureKey(pedestrianRailingFacing(placement));
  if (!scene.textures.exists(textureKey)) return null;
  const sprite = scene.add.image(0, 0, textureKey);
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
  if (scene.worldMask) sprite.setMask(scene.worldMask);
  sprite.pedestrianRailing = placement;
  sprite.mapRow = placement.row;
  sprite.mapCol = placement.col;
  positionPedestrianRailingSprite(scene, sprite);
  if (typeof isPedestrianRailingCalibrationActive === 'function' && isPedestrianRailingCalibrationActive()
    && typeof makePedestrianRailingSpriteDraggable === 'function') {
    makePedestrianRailingSpriteDraggable(scene, sprite);
  }
  return sprite;
}

function ensurePedestrianRailingSprites(scene) {
  if (scene && !scene.pedestrianRailingSprites) scene.pedestrianRailingSprites = new Map();
  return scene?.pedestrianRailingSprites ?? null;
}

function clearPedestrianRailingSprites(scene) {
  const sprites = scene?.pedestrianRailingSprites;
  if (!sprites) return;
  sprites.forEach((sprite) => sprite.destroy());
  sprites.clear();
}

// Reconcile the railing sprites with what the map calls for now. A zebra crossing is read off
// the tile's rendered texture: railings go where a crossing is actually painted (a tile set
// without baked zebra art gets none), and road-line refreshes run before this rebuild.
function rebuildPedestrianRailingSprites(scene) {
  const sprites = ensurePedestrianRailingSprites(scene);
  if (!sprites || typeof getRoadKey !== 'function' || typeof isRoadLikeTile !== 'function') return;
  const roadKeyAt = (row, col) => (isRoadLikeTile(row, col) ? getRoadKey(row, col) : null);
  const rotation = typeof mapRotation !== 'undefined' ? mapRotation : 0;
  const zebraFarSideAt = (row, col) => {
    const match = /road_straight_([vh])__lines_zebra/.exec(scene.tileSprites?.[row]?.[col]?.texture?.key ?? '');
    if (!match) return null;
    const screenSide = PEDESTRIAN_RAILING_ZEBRA_FAR_SIDE[match[1]];
    return typeof rotateDirection === 'function' ? rotateDirection(screenSide, -rotation) : screenSide;
  };
  const hasBusStopAt = (row, col) => {
    const sides = typeof getBusStopSides === 'function' ? getBusStopSides(row, col) : null;
    return Array.isArray(sides) && sides.length > 0;
  };
  const placements = computePedestrianRailingPlacements({ mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT, roadKeyAt, zebraFarSideAt, hasBusStopAt });
  const wanted = new Map(placements.map((placement) => [pedestrianRailingId(placement), placement]));
  sprites.forEach((sprite, id) => {
    if (wanted.has(id)) return;
    sprite.destroy();
    sprites.delete(id);
  });
  wanted.forEach((placement, id) => {
    const existing = sprites.get(id);
    if (existing) {
      existing.pedestrianRailing = placement;
      positionPedestrianRailingSprite(scene, existing);
      return;
    }
    const sprite = createPedestrianRailingSprite(scene, placement);
    if (sprite) sprites.set(id, sprite);
  });
  if (typeof sortRenderLayer === 'function') sortRenderLayer(scene, 'objectLayer');
  scene.pedestrianRailingRefreshPending = false;
}

// Road and bus-stop edits arrive one tile at a time; coalesce them into one rebuild next tick.
function schedulePedestrianRailingRefresh(scene) {
  if (!scene || scene.pedestrianRailingRefreshPending) return;
  scene.pedestrianRailingRefreshPending = true;
  setTimeout(() => {
    if (!scene.pedestrianRailingRefreshPending) return;
    if (!scene.sys || !scene.tileSprites) { scene.pedestrianRailingRefreshPending = false; return; }
    rebuildPedestrianRailingSprites(scene);
  }, 0);
}

function refreshAllPedestrianRailingSprites(scene) {
  scene?.pedestrianRailingSprites?.forEach((sprite) => positionPedestrianRailingSprite(scene, sprite));
}

const pedestrianRailingsTestApi = {
  PEDESTRIAN_RAILING_FACINGS,
  PEDESTRIAN_RAILING_TEXTURE_FILES,
  PEDESTRIAN_RAILING_SOURCE_CANVAS,
  PEDESTRIAN_RAILING_SOURCE_ANCHOR,
  PEDESTRIAN_RAILING_ZEBRA_FAR_SIDE,
  computePedestrianRailingPlacements,
  pedestrianRailingId,
  pedestrianRailingFacing,
  pedestrianRailingTextureKey,
  pedestrianRailingLogicalPoint,
};

if (typeof module !== 'undefined' && module.exports) module.exports = pedestrianRailingsTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    computePedestrianRailingPlacements,
    rebuildPedestrianRailingSprites,
    schedulePedestrianRailingRefresh,
    refreshAllPedestrianRailingSprites,
    positionPedestrianRailingSprite,
    clearPedestrianRailingSprites,
    pedestrianRailingFacing,
    PEDESTRIAN_RAILING_FACINGS,
    PEDESTRIAN_RAILING_TEXTURE_FILES,
    PEDESTRIAN_RAILING_SOURCE_CANVAS,
  });
}
