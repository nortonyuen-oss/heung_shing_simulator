// Street lamps.
//
// Lamp posts are derived from the road map the way junction signals are (traffic-signals.js):
// nothing is saved, the set of posts follows the roads. Placement follows Hong Kong Highways
// Department practice for 8-10 m posts on two-way streets - a staggered arrangement with
// ~30 m between consecutive posts on alternate sides - approximated on the 20 m grid by a
// three-tile pattern (STREET_LAMP_SPACING_PERIOD, constants.js): tile k%3==0 carries a lamp
// on side A pulled a quarter tile back, k%3==1 one on side B pushed a quarter tile forward,
// k%3==2 none, so consecutive lamps are 1.5 tiles apart. Bends get one lamp on the outside;
// junctions (which carry the signal poles), road ends, bridges and slopes get none.
//
// Every post is one static Image, viewport-culled with the other prop maps (main.js
// updateSpriteViewportCulling). At night the post swaps to a baked texture with the lantern
// lit, a light cone and a pool of sodium-orange light on the road (scripts/
// bake-street-lamp-textures.js): one setTexture per post when the city-wide lit state flips,
// no extra sprites. The state follows the vehicle-lamp night/weather strength with hysteresis
// and the View-menu building lights toggle.

const STREET_LAMP_TEXTURE_PREFIX = 'street_lamp_';
// Facing = the direction the arm points on screen.
const STREET_LAMP_FACINGS = Object.freeze(['nw', 'ne', 'sw', 'se']);
const STREET_LAMP_TEXTURE_FILES = Object.freeze(Object.fromEntries(
  STREET_LAMP_FACINGS.flatMap((facing) => [
    [`${STREET_LAMP_TEXTURE_PREFIX}${facing}`, `Models/traffic/lightPost/lightPost_${facing.toUpperCase()}.png`],
    [`${STREET_LAMP_TEXTURE_PREFIX}${facing}__lit`, `Models/traffic/lightPost/lightPost_${facing.toUpperCase()}__lit.png`],
  ]),
));
// The baked canvases are 256x256 (a power of two, so Phaser mipmaps them) with the post's
// foot at (128, 160); the post is ~150 px tall on them.
const STREET_LAMP_SOURCE_CANVAS = Object.freeze({ width: 256, height: 256 });
const STREET_LAMP_SOURCE_ANCHOR = Object.freeze({ x: 128, y: 160 });
// The arm points across the road, i.e. against the side the post stands on; a map-space
// direction seen on screen (n = NE, e = SE, s = SW, w = NW) maps to the sheet's arm facing.
const STREET_LAMP_FACING_FOR_ARM = Object.freeze({ n: 'ne', e: 'se', s: 'sw', w: 'nw' });
const STREET_LAMP_DIRECTION_DELTA = Object.freeze({
  n: { row: -1, col: 0 }, e: { row: 0, col: 1 }, s: { row: 1, col: 0 }, w: { row: 0, col: -1 },
});
const STREET_LAMP_OPPOSITE = Object.freeze({ n: 's', e: 'w', s: 'n', w: 'e' });
// Straight runs: the axis the road runs along and the two kerb sides. Bridge decks, bridge
// ramps and hill slopes/crests are straights too - their lamps just stand on the raised
// surface (streetLampSurfaceLift).
const STREET_LAMP_STRAIGHTS = Object.freeze({
  road_straight_v: { axis: 's', sides: ['w', 'e'] },
  road_straight_h: { axis: 'e', sides: ['n', 's'] },
  road_bridge_v: { axis: 's', sides: ['w', 'e'] },
  road_bridge_h: { axis: 'e', sides: ['n', 's'] },
  road_hill_n: { axis: 's', sides: ['w', 'e'] },
  road_hill_s: { axis: 's', sides: ['w', 'e'] },
  road_hill_e: { axis: 'e', sides: ['n', 's'] },
  road_hill_w: { axis: 'e', sides: ['n', 's'] },
  road_hill2_n: { axis: 's', sides: ['w', 'e'] },
  road_hill2_s: { axis: 's', sides: ['w', 'e'] },
  road_hill2_e: { axis: 'e', sides: ['n', 's'] },
  road_hill2_w: { axis: 'e', sides: ['n', 's'] },
});
// Bends: the two connected arms; the lamp stands on the outside (the opposite corner).
const STREET_LAMP_CORNERS = Object.freeze({
  road_corner_ne: ['n', 'e'],
  road_corner_se: ['s', 'e'],
  road_corner_sw: ['s', 'w'],
  road_corner_nw: ['n', 'w'],
});
const STREET_LAMP_VISUAL_INTERVAL_MS = 100;

function streetLampLeftOf(travel) {
  const d = STREET_LAMP_DIRECTION_DELTA[travel];
  return d.row === 0 ? (d.col > 0 ? 'n' : 's') : (d.row > 0 ? 'e' : 'w');
}

// Pure: every lamp the road map calls for. `roadKeyAt(row, col)` returns the road key or a
// non-road value; `signalPlacements` (computeTrafficSignalPlacements) lets a lamp on a signal's
// approach tile move to the far half of the tile when it would share the pole's kerb end.
function computeStreetLampPlacements({ mapWidth, mapHeight, roadKeyAt, signalPlacements = [], period = STREET_LAMP_SPACING_PERIOD, inset = STREET_LAMP_LOGICAL_INSET }) {
  const signalKerbs = new Map();
  for (const signal of signalPlacements) {
    const key = `${signal.row}:${signal.col}`;
    if (!signalKerbs.has(key)) signalKerbs.set(key, []);
    signalKerbs.get(key).push({ side: streetLampLeftOf(signal.travel), forward: signal.travel });
  }
  const placements = [];
  for (let row = 0; row < mapHeight; row++) {
    for (let col = 0; col < mapWidth; col++) {
      const key = roadKeyAt(row, col);
      const straight = STREET_LAMP_STRAIGHTS[key];
      if (straight) {
        const k = straight.axis === 's' ? row : col;
        const slot = ((k % period) + period) % period;
        if (slot > 1) continue;
        const side = straight.sides[slot];
        let along = slot === 0 ? -inset.along : inset.along;
        // Keep clear of a signal pole at the junction end of this kerb.
        const kerbs = signalKerbs.get(`${row}:${col}`);
        if (kerbs) {
          const alongDir = along > 0 ? straight.axis : STREET_LAMP_OPPOSITE[straight.axis];
          if (kerbs.some((kerb) => kerb.side === side && kerb.forward === alongDir)) along = -along;
        }
        const axisDelta = STREET_LAMP_DIRECTION_DELTA[straight.axis];
        const sideDelta = STREET_LAMP_DIRECTION_DELTA[side];
        placements.push({
          row,
          col,
          kind: 'straight',
          side,
          arm: STREET_LAMP_OPPOSITE[side],
          offsetRow: sideDelta.row * inset.side + axisDelta.row * along,
          offsetCol: sideDelta.col * inset.side + axisDelta.col * along,
        });
        continue;
      }
      const arms = STREET_LAMP_CORNERS[key];
      if (arms) {
        const outer = arms.map((arm) => STREET_LAMP_OPPOSITE[arm]);
        const d0 = STREET_LAMP_DIRECTION_DELTA[outer[0]];
        const d1 = STREET_LAMP_DIRECTION_DELTA[outer[1]];
        placements.push({
          row,
          col,
          kind: 'corner',
          side: outer.join(''),
          arm: arms[0],
          offsetRow: (d0.row + d1.row) * inset.cornerOuter,
          offsetCol: (d0.col + d1.col) * inset.cornerOuter,
        });
      }
    }
  }
  return placements;
}

function streetLampId(placement) {
  return `${placement.row}:${placement.col}:${placement.side}`;
}

function streetLampFacing(placement, rotation = typeof mapRotation !== 'undefined' ? mapRotation : 0) {
  const visualArm = typeof rotateDirection === 'function' ? rotateDirection(placement.arm, rotation) : placement.arm;
  return STREET_LAMP_FACING_FOR_ARM[visualArm] ?? 'nw';
}

function streetLampTextureKey(facing, lit) {
  return `${STREET_LAMP_TEXTURE_PREFIX}${facing}${lit ? '__lit' : ''}`;
}

function streetLampOffsetFor(facing) {
  const override = typeof getStreetLampCalibrationOffset === 'function' ? getStreetLampCalibrationOffset(facing) : null;
  return override ?? STREET_LAMP_ANCHOR_OFFSETS[facing] ?? { dx: 0, dy: 0 };
}

function streetLampScale() {
  const override = typeof getStreetLampCalibrationScale === 'function' ? getStreetLampCalibrationScale() : null;
  return override ?? STREET_LAMP_SCALE;
}

// How far above the tile face (as getTileFaceGeometry draws it) the road surface sits at the
// lamp's spot: a bridge deck is lifted BRIDGE_DECK_VISUAL_LIFT, a ramp or hill slope rises
// along its axis. Uses the same surface model vehicles drive on (traffic-visuals.js), so the
// post's foot meets the deck where the wheels do. Flat roads come out at 0.
function streetLampSurfaceLift(placement) {
  if (typeof getTrafficRoadSurface !== 'function' || typeof getTrafficRuntimeLayers !== 'function') return 0;
  const surface = getTrafficRoadSurface(placement.row, placement.col, getTrafficRuntimeLayers());
  if (!surface) return 0;
  // The surface end the lamp is displaced towards (if any): interpolate centre -> that end.
  let lift = surface.centerLift;
  for (const direction of surface.directions || []) {
    const delta = STREET_LAMP_DIRECTION_DELTA[direction];
    if (!delta) continue;
    const along = delta.row * placement.offsetRow + delta.col * placement.offsetCol; // tiles towards `direction`
    const endpoint = surface.endpointLifts?.[direction];
    if (along > 1e-9 && Number.isFinite(endpoint)) {
      lift = surface.centerLift + (endpoint - surface.centerLift) * Math.min(1, along / 0.5);
      break;
    }
  }
  const alreadyDrawn = typeof getTerrainTileVisualOffset === 'function'
    ? -getTerrainTileVisualOffset(placement.row, placement.col)
    : 0;
  return lift - alreadyDrawn;
}

// Screen anchor (post foot) and depth, in the same terms as the signal poles and vehicles.
// The depth subtracts the surface lift the way a vehicle's does (traffic-visuals.js), so on
// a bridge deck a post sorts with the traffic beside it and behind the near parapet.
function streetLampAnchor(scene, placement, facing) {
  const geo = getTileFaceGeometry(placement.row, placement.col, scene.offsetX, scene.offsetY);
  const centre = isoToScreen(placement.col, placement.row);
  const shifted = isoToScreen(placement.col + placement.offsetCol, placement.row + placement.offsetRow);
  const offset = streetLampOffsetFor(facing);
  const lift = streetLampSurfaceLift(placement);
  return {
    x: geo.center.x + (shifted.x - centre.x) + offset.dx,
    y: geo.center.y + (shifted.y - centre.y) + offset.dy - lift,
    depth: getWorldDepth('object', shifted.y + TILE_HEIGHT - lift),
  };
}

// Lit when the night/weather lamp strength is past ON, dark again below OFF; off whenever the
// building lights toggle or attract mode says no lights.
function streetLampsShouldBeLit(scene) {
  if (typeof isBuildingLightsEnabled === 'function' && !isBuildingLightsEnabled()) return false;
  if (typeof isAttractLightsSuppressed === 'function' && isAttractLightsSuppressed()) return false;
  const strength = Number(scene?.trafficLightStrength);
  if (!Number.isFinite(strength)) return false;
  return scene.streetLampsLit ? strength > STREET_LAMP_NIGHT_OFF : strength > STREET_LAMP_NIGHT_ON;
}

function applyStreetLampSpriteTexture(scene, sprite, textureKey) {
  if (!scene.textures.exists(textureKey)) return false;
  if (sprite.texture?.key !== textureKey) sprite.setTexture(textureKey);
  const texture = scene.textures.get(textureKey)?.getSourceImage?.();
  const anchorSpec = typeof getPropTextureAnchor === 'function' && texture
    ? getPropTextureAnchor(STREET_LAMP_TEXTURE_FILES[textureKey], STREET_LAMP_SOURCE_ANCHOR.x, STREET_LAMP_SOURCE_ANCHOR.y, texture)
    : { originX: 0.5, originY: 1, scaleMultiplier: 1 };
  sprite.setOrigin(anchorSpec.originX, anchorSpec.originY);
  sprite.setScale(streetLampScale() * anchorSpec.scaleMultiplier);
  return true;
}

function positionStreetLampSprite(scene, sprite) {
  if (!scene || !sprite?.streetLamp) return;
  const placement = sprite.streetLamp;
  const facing = streetLampFacing(placement);
  sprite.streetLampFacing = facing;
  applyStreetLampSpriteTexture(scene, sprite, streetLampTextureKey(facing, !!scene.streetLampsLit));
  const anchor = streetLampAnchor(scene, placement, facing);
  sprite.setPosition(anchor.x, anchor.y);
  sprite.setDepth(anchor.depth);
}

function createStreetLampSprite(scene, placement) {
  const facing = streetLampFacing(placement);
  const textureKey = streetLampTextureKey(facing, !!scene.streetLampsLit);
  if (!scene.textures.exists(textureKey)) return null;
  const sprite = scene.add.image(0, 0, textureKey);
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
  if (scene.worldMask) sprite.setMask(scene.worldMask);
  sprite.streetLamp = placement;
  sprite.mapRow = placement.row;
  sprite.mapCol = placement.col;
  positionStreetLampSprite(scene, sprite);
  if (typeof isStreetLampCalibrationActive === 'function' && isStreetLampCalibrationActive()
    && typeof makeStreetLampSpriteDraggable === 'function') {
    makeStreetLampSpriteDraggable(scene, sprite);
  }
  return sprite;
}

function ensureStreetLampSprites(scene) {
  if (scene && !scene.streetLampSprites) scene.streetLampSprites = new Map();
  return scene?.streetLampSprites ?? null;
}

function clearStreetLampSprites(scene) {
  const sprites = scene?.streetLampSprites;
  if (!sprites) return;
  sprites.forEach((sprite) => sprite.destroy());
  sprites.clear();
}

// Reconcile the post sprites with what the road map calls for now.
function rebuildStreetLampSprites(scene) {
  const sprites = ensureStreetLampSprites(scene);
  if (!sprites || typeof getRoadKey !== 'function' || typeof isRoadLikeTile !== 'function') return;
  const roadKeyAt = (row, col) => (isRoadLikeTile(row, col) ? getRoadKey(row, col) : null);
  const signalPlacements = typeof computeTrafficSignalPlacements === 'function'
    ? computeTrafficSignalPlacements({ mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT, roadKeyAt })
    : [];
  const placements = computeStreetLampPlacements({ mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT, roadKeyAt, signalPlacements });
  const wanted = new Map(placements.map((placement) => [streetLampId(placement), placement]));
  sprites.forEach((sprite, id) => {
    if (wanted.has(id)) return;
    sprite.destroy();
    sprites.delete(id);
  });
  wanted.forEach((placement, id) => {
    const existing = sprites.get(id);
    if (existing) {
      existing.streetLamp = placement;
      positionStreetLampSprite(scene, existing);
      return;
    }
    const sprite = createStreetLampSprite(scene, placement);
    if (sprite) sprites.set(id, sprite);
  });
  if (typeof sortRenderLayer === 'function') sortRenderLayer(scene, 'objectLayer');
  scene.streetLampRefreshPending = false;
}

// Road edits arrive one tile at a time; coalesce them into one rebuild on the next tick.
function scheduleStreetLampRefresh(scene) {
  if (!scene || scene.streetLampRefreshPending) return;
  scene.streetLampRefreshPending = true;
  setTimeout(() => {
    if (!scene.streetLampRefreshPending) return;
    if (!scene.sys || !scene.tileSprites) { scene.streetLampRefreshPending = false; return; }
    rebuildStreetLampSprites(scene);
  }, 0);
}

function refreshAllStreetLampSprites(scene) {
  scene?.streetLampSprites?.forEach((sprite) => positionStreetLampSprite(scene, sprite));
}

// Ten times a second: decide lit/dark from the night strength. The state is city-wide (Hong
// Kong's lamps switch together), so when it flips every post swaps texture in that one pass -
// a few hundred setTexture calls twice a day - and nothing is touched in between. Off-screen
// posts are hidden by the viewport cull, so only the ones in view ever draw.
function updateStreetLampVisuals(scene, time) {
  const sprites = scene?.streetLampSprites;
  if (!sprites?.size) return;
  if (time < (scene.streetLampNextVisualAt || 0)) return;
  scene.streetLampNextVisualAt = time + STREET_LAMP_VISUAL_INTERVAL_MS;
  if (scene.scene?.isVisible && !scene.scene.isVisible()) return;
  const lit = streetLampsShouldBeLit(scene);
  if (lit === !!scene.streetLampsLit && scene.streetLampTexturesApplied) return;
  scene.streetLampsLit = lit;
  scene.streetLampTexturesApplied = true;
  sprites.forEach((sprite) => {
    if (!sprite.streetLamp) return;
    const key = streetLampTextureKey(sprite.streetLampFacing, lit);
    if (sprite.texture?.key !== key) applyStreetLampSpriteTexture(scene, sprite, key);
  });
}

const streetLampsTestApi = {
  STREET_LAMP_FACINGS,
  STREET_LAMP_TEXTURE_FILES,
  STREET_LAMP_SOURCE_CANVAS,
  STREET_LAMP_SOURCE_ANCHOR,
  STREET_LAMP_FACING_FOR_ARM,
  computeStreetLampPlacements,
  streetLampId,
  streetLampFacing,
  streetLampTextureKey,
  streetLampLeftOf,
  streetLampSurfaceLift,
  streetLampsShouldBeLit,
  updateStreetLampVisuals,
};

if (typeof module !== 'undefined' && module.exports) module.exports = streetLampsTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    computeStreetLampPlacements,
    rebuildStreetLampSprites,
    scheduleStreetLampRefresh,
    refreshAllStreetLampSprites,
    positionStreetLampSprite,
    clearStreetLampSprites,
    updateStreetLampVisuals,
    streetLampFacing,
    streetLampId,
    STREET_LAMP_FACINGS,
    STREET_LAMP_TEXTURE_FILES,
  });
}
