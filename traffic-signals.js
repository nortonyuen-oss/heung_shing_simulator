// Junction traffic signals.
//
// Every T and cross junction gets one signal pole per approach, standing on the approach tile
// (the straight or curved road leading into the junction), at the end nearest the junction and
// on the driver's left — Hong Kong traffic keeps left, so the near-side kerb is the left one —
// with its heads facing the traffic coming towards it. Nothing here is saved: the set of poles
// is derived from the road map whenever it changes, exactly like the road tiles themselves.
//
// Directions are map-space ('n' = row-1, 'e' = col+1, 's' = row+1, 'w' = col-1), which the
// isometric view shows as NE, SE, SW and NW respectively at the default rotation; rotateDirection
// (main.js) maps them to the screen at any rotation, the same way bus stops pick their art.
//
// Pole positions are calibrated in test mode (traffic-signal-calibrator.js) and the results
// live in constants.js: TRAFFIC_SIGNAL_ANCHOR_OFFSETS (per facing, screen pixels),
// TRAFFIC_SIGNAL_SCALE and TRAFFIC_SIGNAL_LOGICAL_INSET.
//
// The lights themselves keep no state either: every junction's phase is a pure function of one
// shared visual clock (advanced at the traffic speed multiplier, so pause freezes it) plus a
// fixed per-junction offset, so an off-screen junction costs nothing and a query is a few
// dozen arithmetic operations. A pole shows its phase by swapping to a baked state texture
// (scripts/bake-traffic-signal-states.js) - one Image per pole, no extra lamp sprites - and only
// poles inside the camera view are touched, ten times a second. Ambient traffic asks
// getTrafficSignalHoldProgress whether the leg it is on ends at a red and waits at the stop
// line; see docs/traffic-signal-control-plan.md.

const TRAFFIC_SIGNAL_TEXTURE_PREFIX = 'traffic_signal_';
const TRAFFIC_SIGNAL_FACINGS = Object.freeze(['sw', 'se', 'nw', 'ne']);
// Baked state textures, one per visible lamp combination (scripts/bake-traffic-signal-states.js).
// From the camera the SW and SE poles show their vehicle heads and the SW and NW poles their
// pedestrian heads; NE shows only backs, so it has a single static texture. State suffixes:
// vehicle r / ra / g / a (red, red+amber, green, amber) and pedestrian pr / pg / px (red man,
// green man, off - the gap of a flashing green man).
const TRAFFIC_SIGNAL_STATE_SUFFIXES = Object.freeze({
  sw: ['r_pg', 'r_px', 'r_pr', 'ra_pr', 'g_pr', 'a_pr'],
  se: ['r', 'ra', 'g', 'a'],
  nw: ['pr', 'pg', 'px'],
  ne: [],
});
const TRAFFIC_SIGNAL_TEXTURE_FILES = Object.freeze(Object.fromEntries(
  TRAFFIC_SIGNAL_FACINGS.flatMap((facing) => {
    const upper = facing.toUpperCase();
    const suffixes = TRAFFIC_SIGNAL_STATE_SUFFIXES[facing];
    if (!suffixes.length) return [[`${TRAFFIC_SIGNAL_TEXTURE_PREFIX}${facing}`, `Models/trafficLight/trafficLight_${upper}.png`]];
    return suffixes.map((suffix) => [
      `${TRAFFIC_SIGNAL_TEXTURE_PREFIX}${facing}__${suffix}`,
      `Models/trafficLight/trafficLight_${upper}__${suffix}.png`,
    ]);
  }),
));
// Each baked texture is a 256x256 canvas (a power of two, so Phaser mipmaps it) with the
// pole's foot at (128, 256); the pole itself is ~246 px tall on it.
const TRAFFIC_SIGNAL_SOURCE_CANVAS = Object.freeze({ width: 256, height: 256 });
const TRAFFIC_SIGNAL_SOURCE_ANCHOR = Object.freeze({ x: 128, y: 256 });
const TRAFFIC_SIGNAL_VEHICLE_CODES = Object.freeze({ red: 'r', redAmber: 'ra', green: 'g', amber: 'a' });
const TRAFFIC_SIGNAL_PED_CODES = Object.freeze({ red: 'pr', green: 'pg', off: 'px' });
// A pole's texture updates at most this often (the flashing green man is 2 Hz).
const TRAFFIC_SIGNAL_VISUAL_INTERVAL_MS = 100;
// Night glow: a small additive halo on each lit lamp the camera can see, drawn from one shared
// pool of sprites that is re-dealt to the poles in view on every visual pass (so the pool only
// ever holds as many sprites as there are lit lamps on screen). It follows the vehicle-lamp
// night/weather strength and the View-menu building-lights toggle. Lens centres are texture
// pixels from the pole foot, as printed by scripts/bake-traffic-signal-states.js.
const TRAFFIC_SIGNAL_LAMP_ANCHORS = Object.freeze({
  sw: { red: [-36.9, -199.7], amber: [-36.1, -167.9], green: [-36.1, -134.4], pedRed: [29.4, -103.5], pedGreen: [29.7, -77.0] },
  se: { red: [39.5, -189.2], amber: [38.8, -155.9], green: [39.0, -121.4] },
  nw: { pedRed: [-33.3, -105.8], pedGreen: [-31.8, -79.6] },
  ne: {},
});
const TRAFFIC_SIGNAL_GLOW_COLOURS = Object.freeze({
  red: 0xff4a30, amber: 0xffbe3c, green: 0x5cff8a, pedRed: 0xff4a30, pedGreen: 0x5cff8a,
});
const TRAFFIC_SIGNAL_GLOW_TEXTURE_KEY = 'fx_traffic_signal_glow';
// Halo diameter relative to the pole scale: 16px texture x 0.0797 x 5.55 = ~7px at zoom 1.
const TRAFFIC_SIGNAL_GLOW_SCALE_FACTOR = 5.55;
const TRAFFIC_SIGNAL_GLOW_ALPHA = 0.85;
const TRAFFIC_SIGNAL_NO_LAMPS = Object.freeze([]);
// Signals run on the same clamped frame delta as ambient traffic so a slow frame holds both back.
const TRAFFIC_SIGNAL_MAX_DELTA_MS = 50;

// Which map-space neighbours each junction key connects to (see getRoadKey, main.js: a T is
// named after its missing side's opposite, e.g. road_t_n has no SW/'s' arm).
const TRAFFIC_SIGNAL_JUNCTION_ARMS = Object.freeze({
  road_cross: ['n', 'e', 's', 'w'],
  road_t_n: ['n', 'e', 'w'],
  road_t_e: ['n', 'e', 's'],
  road_t_s: ['e', 's', 'w'],
  road_t_w: ['n', 's', 'w'],
});
// Only a plain straight or curved road tile can host a pole: junctions have no kerb to spare,
// road ends carry no traffic, and bridges and slopes have their own art.
const TRAFFIC_SIGNAL_APPROACH_KEYS = new Set([
  'road_straight_v', 'road_straight_h',
  'road_corner_ne', 'road_corner_se', 'road_corner_sw', 'road_corner_nw',
]);
const TRAFFIC_SIGNAL_DIRECTION_DELTA = Object.freeze({
  n: { row: -1, col: 0 }, e: { row: 0, col: 1 }, s: { row: 1, col: 0 }, w: { row: 0, col: -1 },
});
const TRAFFIC_SIGNAL_OPPOSITE = Object.freeze({ n: 's', e: 'w', s: 'n', w: 'e' });
// A pole faces the traffic driving towards it, i.e. against the direction of travel. On screen
// travel 'n' heads NE, so its pole faces SW, and so on.
const TRAFFIC_SIGNAL_FACING_FOR_TRAVEL = Object.freeze({ n: 'sw', e: 'nw', s: 'ne', w: 'se' });

// The driver's left of a direction of travel (same convention as getTrafficLeftLaneOffset).
function trafficSignalLeftOf(travel) {
  const d = TRAFFIC_SIGNAL_DIRECTION_DELTA[travel];
  return { row: -d.col, col: d.row };
}

// Pure: every pole the road map calls for. `roadKeyAt(row, col)` returns the road tile key
// (getRoadKey) or a non-road key. Each placement is the approach tile plus the direction traffic
// travels along it into the junction.
function computeTrafficSignalPlacements({ mapWidth, mapHeight, roadKeyAt }) {
  const placements = [];
  for (let row = 0; row < mapHeight; row++) {
    for (let col = 0; col < mapWidth; col++) {
      const arms = TRAFFIC_SIGNAL_JUNCTION_ARMS[roadKeyAt(row, col)];
      if (!arms) continue;
      for (const arm of arms) {
        const delta = TRAFFIC_SIGNAL_DIRECTION_DELTA[arm];
        const approachRow = row + delta.row;
        const approachCol = col + delta.col;
        if (approachRow < 0 || approachRow >= mapHeight || approachCol < 0 || approachCol >= mapWidth) continue;
        const approachKey = roadKeyAt(approachRow, approachCol);
        if (!TRAFFIC_SIGNAL_APPROACH_KEYS.has(approachKey)) continue;
        placements.push({
          row: approachRow,
          col: approachCol,
          travel: TRAFFIC_SIGNAL_OPPOSITE[arm],
          junctionRow: row,
          junctionCol: col,
        });
      }
    }
  }
  return placements;
}

function trafficSignalId(placement) {
  return `${placement.row}:${placement.col}:${placement.travel}`;
}

// The map-space point the pole stands on: the approach tile's centre pushed towards the
// junction and out to the driver's-left kerb.
function trafficSignalLogicalPoint(placement, inset = TRAFFIC_SIGNAL_LOGICAL_INSET) {
  const forward = TRAFFIC_SIGNAL_DIRECTION_DELTA[placement.travel];
  const left = trafficSignalLeftOf(placement.travel);
  return {
    col: placement.col + forward.col * inset.forward + left.col * inset.left,
    row: placement.row + forward.row * inset.forward + left.row * inset.left,
  };
}

function trafficSignalFacing(placement, rotation = typeof mapRotation !== 'undefined' ? mapRotation : 0) {
  const visualTravel = typeof rotateDirection === 'function' ? rotateDirection(placement.travel, rotation) : placement.travel;
  return TRAFFIC_SIGNAL_FACING_FOR_TRAVEL[visualTravel] ?? 'sw';
}

// The texture for a facing showing a phase; NE has no visible lamps and always uses its base.
function trafficSignalTextureKey(facing, phase = null) {
  const vehicle = TRAFFIC_SIGNAL_VEHICLE_CODES[phase?.vehicle] ?? 'r';
  const ped = TRAFFIC_SIGNAL_PED_CODES[phase?.ped] ?? 'pr';
  switch (facing) {
    case 'sw': return `${TRAFFIC_SIGNAL_TEXTURE_PREFIX}sw__${vehicle}_${ped}`;
    case 'se': return `${TRAFFIC_SIGNAL_TEXTURE_PREFIX}se__${vehicle}`;
    case 'nw': return `${TRAFFIC_SIGNAL_TEXTURE_PREFIX}nw__${ped}`;
    default: return `${TRAFFIC_SIGNAL_TEXTURE_PREFIX}ne`;
  }
}

// ── Phases ──────────────────────────────────────────────────────────────────

// Static description of a signalised junction: its stage groups (which arms go together), the
// start of each stage within the cycle, and the junction's fixed offset into the shared clock.
// A cross runs {n,s} then {e,w}; a T runs its through pair then the side arm.
function describeTrafficSignalJunction(row, col, roadKey, timing = TRAFFIC_SIGNAL_TIMING) {
  const arms = TRAFFIC_SIGNAL_JUNCTION_ARMS[roadKey];
  if (!arms) return null;
  let groups;
  let greens;
  if (roadKey === 'road_cross') {
    groups = [['n', 's'], ['e', 'w']];
    greens = [timing.crossGreenMs, timing.crossGreenMs];
  } else {
    const through = arms.includes('n') && arms.includes('s') ? ['n', 's'] : ['e', 'w'];
    groups = [through, arms.filter((arm) => !through.includes(arm))];
    greens = [timing.teeThroughGreenMs, timing.teeSideGreenMs];
  }
  const stageOverheadMs = timing.redAmberMs + timing.amberMs + timing.allRedMs;
  const starts = [];
  let cycleMs = 0;
  greens.forEach((green) => {
    starts.push(cycleMs);
    cycleMs += stageOverheadMs + green;
  });
  const armGroup = {};
  groups.forEach((group, index) => group.forEach((arm) => { armGroup[arm] = index; }));
  return {
    row,
    col,
    roadKey,
    groups,
    greens,
    starts,
    cycleMs,
    offsetMs: ((row * 7 + col * 11) * timing.offsetStepMs) % cycleMs,
    armGroup,
  };
}

// The lamps a pole on `arm` shows at clock time `clockMs`:
//   vehicle: 'red' | 'redAmber' | 'green' | 'amber'
//   ped:     'red' | 'green' | 'off'   (green man while the crossing traffic has green,
//                                       flashing over its last pedFlashMs)
// Pure; the caller never has to have seen an earlier tick.
function getTrafficSignalPhase(junction, arm, clockMs, timing = TRAFFIC_SIGNAL_TIMING) {
  const groupIndex = junction?.armGroup?.[arm];
  if (groupIndex === undefined) return null;
  const cycle = junction.cycleMs;
  const t = (((clockMs + junction.offsetMs) % cycle) + cycle) % cycle;
  let active = 0;
  for (let index = 1; index < junction.starts.length; index++) {
    if (t >= junction.starts[index]) active = index;
  }
  const local = t - junction.starts[active];
  const green = junction.greens[active];
  let stage;
  if (local < timing.redAmberMs) stage = 'redAmber';
  else if (local < timing.redAmberMs + green) stage = 'green';
  else if (local < timing.redAmberMs + green + timing.amberMs) stage = 'amber';
  else stage = 'allRed';

  const vehicle = active === groupIndex && stage !== 'allRed' ? stage : 'red';
  let ped = 'red';
  if (active !== groupIndex && stage === 'green') {
    const flashLocal = local - timing.redAmberMs - (green - timing.pedFlashMs);
    if (flashLocal < 0) ped = 'green';
    else ped = Math.floor(flashLocal / timing.pedFlashPeriodMs) % 2 === 0 ? 'off' : 'green';
  }
  return { vehicle, ped, stage, active };
}

function trafficSignalJunctionKey(row, col) {
  return `${row}:${col}`;
}

function trafficSignalDirectionForDelta(deltaRow, deltaCol) {
  if (deltaRow === -1 && deltaCol === 0) return 'n';
  if (deltaRow === 0 && deltaCol === 1) return 'e';
  if (deltaRow === 1 && deltaCol === 0) return 's';
  if (deltaRow === 0 && deltaCol === -1) return 'w';
  return null;
}

// For road traffic, managed buses and ice cream trucks: the leg progress on `current` -> `next`
// must not pass right now, or null when it may drive on. Only legs ending on a signalised
// junction are ever held, only before the stop line, and never on green; on amber a vehicle
// already close to the line carries on through.
// Where a vehicle of the given length class (headwayFactor, traffic-visuals.js model registry)
// waits: a car at TRAFFIC_SIGNAL_STOP_PROGRESS, longer vehicles further back so their nose
// stays clear of the junction mouth too. A caller that does not say (managed buses, the ice
// cream van) is treated as bus-length, the safe end.
function trafficSignalStopProgressFor(headwayFactor = 1) {
  const factor = Number(headwayFactor) || 1;
  const extra = Math.max(0, factor - TRAFFIC_SIGNAL_STOP_CAR_HEADWAY_FACTOR) / (1 - TRAFFIC_SIGNAL_STOP_CAR_HEADWAY_FACTOR);
  return Math.max(TRAFFIC_SIGNAL_STOP_MIN_PROGRESS, TRAFFIC_SIGNAL_STOP_PROGRESS - TRAFFIC_SIGNAL_STOP_LONG_VEHICLE_SETBACK * extra);
}

function getTrafficSignalHoldProgress(scene, current, next, progress, headwayFactor) {
  const junctions = scene?.trafficSignalJunctions;
  if (!junctions?.size || !current || !next) return null;
  const junction = junctions.get(trafficSignalJunctionKey(next.row, next.col));
  if (!junction) return null;
  const stop = trafficSignalStopProgressFor(headwayFactor);
  if (progress > stop + 1e-6) return null;
  const arm = trafficSignalDirectionForDelta(current.row - next.row, current.col - next.col);
  const phase = getTrafficSignalPhase(junction, arm, scene.trafficSignalClockMs || 0);
  if (!phase || phase.vehicle === 'green') return null;
  if (phase.vehicle === 'amber' && stop - progress < TRAFFIC_SIGNAL_AMBER_COMMIT_TILES) return null;
  return stop;
}

// Calibrator override (traffic-signal-calibrator.js) wins over the shipped constant.
function trafficSignalOffsetFor(facing) {
  const override = typeof getTrafficSignalCalibrationOffset === 'function'
    ? getTrafficSignalCalibrationOffset(facing) : null;
  return override ?? TRAFFIC_SIGNAL_ANCHOR_OFFSETS[facing] ?? { dx: 0, dy: 0 };
}

function trafficSignalScale() {
  const override = typeof getTrafficSignalCalibrationScale === 'function'
    ? getTrafficSignalCalibrationScale() : null;
  return override ?? TRAFFIC_SIGNAL_SCALE;
}

// Screen anchor (pole foot) and depth for a placement, in the same terms vehicles use
// (getTrafficSurfacePoint / getTrafficLanePoint, traffic-visuals.js) so poles sort against
// traffic on both the approach and the junction the way the geometry says they should.
function trafficSignalAnchor(scene, placement, facing) {
  const point = trafficSignalLogicalPoint(placement);
  const geo = getTileFaceGeometry(placement.row, placement.col, scene.offsetX, scene.offsetY);
  const centre = isoToScreen(placement.col, placement.row);
  const shifted = isoToScreen(point.col, point.row);
  const offset = trafficSignalOffsetFor(facing);
  return {
    x: geo.center.x + (shifted.x - centre.x) + offset.dx,
    y: geo.center.y + (shifted.y - centre.y) + offset.dy,
    depth: getWorldDepth('object', shifted.y + TILE_HEIGHT),
  };
}

function ensureTrafficSignalSprites(scene) {
  if (scene && !scene.trafficSignalSprites) scene.trafficSignalSprites = new Map();
  return scene?.trafficSignalSprites ?? null;
}

// Every state texture is trimmed differently by the release pipeline, so the origin and scale
// that keep the foot on the anchor are re-derived for whichever texture the pole shows.
function applyTrafficSignalSpriteTexture(scene, sprite, textureKey) {
  if (!scene.textures.exists(textureKey)) return false;
  if (sprite.texture?.key !== textureKey) sprite.setTexture(textureKey);
  const texture = scene.textures.get(textureKey)?.getSourceImage?.();
  const anchorSpec = typeof getPropTextureAnchor === 'function' && texture
    ? getPropTextureAnchor(TRAFFIC_SIGNAL_TEXTURE_FILES[textureKey], TRAFFIC_SIGNAL_SOURCE_ANCHOR.x, TRAFFIC_SIGNAL_SOURCE_ANCHOR.y, texture)
    : { originX: 0.5, originY: 1, scaleMultiplier: 1 };
  sprite.setOrigin(anchorSpec.originX, anchorSpec.originY);
  sprite.setScale(trafficSignalScale() * anchorSpec.scaleMultiplier);
  return true;
}

// ── Night glow ──────────────────────────────────────────────────────────────

function ensureTrafficSignalGlowTexture(scene) {
  if (!scene?.textures?.exists || !scene?.make?.graphics) return false;
  if (scene.textures.exists(TRAFFIC_SIGNAL_GLOW_TEXTURE_KEY)) return true;
  // One white soft dot, tinted per lamp colour: faint outer bloom, brighter middle, hot core.
  const graphic = scene.make.graphics({ x: 0, y: 0, add: false });
  if (!graphic) return false;
  graphic.fillStyle(0xffffff, 0.10);
  graphic.fillCircle(8, 8, 7.5);
  graphic.fillStyle(0xffffff, 0.28);
  graphic.fillCircle(8, 8, 4.6);
  graphic.fillStyle(0xffffff, 0.7);
  graphic.fillCircle(8, 8, 2.6);
  graphic.fillStyle(0xffffff, 1);
  graphic.fillCircle(8, 8, 1.3);
  graphic.generateTexture(TRAFFIC_SIGNAL_GLOW_TEXTURE_KEY, 16, 16);
  graphic.destroy?.();
  return scene.textures.exists(TRAFFIC_SIGNAL_GLOW_TEXTURE_KEY);
}

// 0 when the halos are off (daylight, lights toggle off, attract mode saving frames), else the
// shared vehicle-lamp strength updateDynamicLighting caches on the scene.
function trafficSignalGlowStrength(scene) {
  if (typeof isBuildingLightsEnabled === 'function' && !isBuildingLightsEnabled()) return 0;
  if (typeof isAttractLightsSuppressed === 'function' && isAttractLightsSuppressed()) return 0;
  const strength = Number(scene?.trafficLightStrength);
  return Number.isFinite(strength) && strength > 0.002 ? Math.min(1, strength) : 0;
}

// The lamps lit on a facing for a phase, limited to the lamps that facing shows the camera.
function trafficSignalLitLamps(facing, phase) {
  const anchors = TRAFFIC_SIGNAL_LAMP_ANCHORS[facing];
  if (!anchors || !phase) return TRAFFIC_SIGNAL_NO_LAMPS;
  const lit = [];
  if (anchors.red) {
    if (phase.vehicle === 'red' || phase.vehicle === 'redAmber') lit.push('red');
    if (phase.vehicle === 'amber' || phase.vehicle === 'redAmber') lit.push('amber');
    if (phase.vehicle === 'green') lit.push('green');
  }
  if (anchors.pedRed) {
    if (phase.ped === 'red') lit.push('pedRed');
    else if (phase.ped === 'green') lit.push('pedGreen');
  }
  return lit;
}

function takeTrafficSignalGlow(scene, pool, index) {
  let glow = pool[index];
  if (glow) return glow;
  if (!ensureTrafficSignalGlowTexture(scene)) return null;
  glow = scene.add.image(0, 0, TRAFFIC_SIGNAL_GLOW_TEXTURE_KEY);
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, glow, 'objectLayer');
  glow.setOrigin(0.5, 0.5);
  glow.setBlendMode?.(typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 'ADD');
  if (scene.worldMask) glow.setMask(scene.worldMask);
  pool.push(glow);
  return glow;
}

function hideTrafficSignalGlowsFrom(pool, index) {
  for (let i = index; i < pool.length; i++) {
    if (pool[i].visible) pool[i].setVisible(false);
  }
}

function clearTrafficSignalGlows(scene) {
  const pool = scene?.trafficSignalGlowPool;
  if (!pool) return;
  pool.forEach((glow) => glow.destroy());
  scene.trafficSignalGlowPool = [];
}

function trafficSignalPhaseForSprite(scene, sprite) {
  const placement = sprite.trafficSignal;
  const junction = scene.trafficSignalJunctions?.get(trafficSignalJunctionKey(placement.junctionRow, placement.junctionCol));
  if (!junction) return null;
  return getTrafficSignalPhase(junction, TRAFFIC_SIGNAL_OPPOSITE[placement.travel], scene.trafficSignalClockMs || 0);
}

function positionTrafficSignalSprite(scene, sprite) {
  if (!scene || !sprite?.trafficSignal) return;
  const placement = sprite.trafficSignal;
  const facing = trafficSignalFacing(placement);
  sprite.trafficSignalFacing = facing;
  applyTrafficSignalSpriteTexture(scene, sprite, trafficSignalTextureKey(facing, trafficSignalPhaseForSprite(scene, sprite)));
  const anchor = trafficSignalAnchor(scene, placement, facing);
  sprite.setPosition(anchor.x, anchor.y);
  sprite.setDepth(anchor.depth);
}

// Advance the shared signal clock and swap the textures of the poles in view whose phase
// changed. Called from the scene update every frame; the texture pass runs ten times a second.
function updateTrafficSignalVisuals(scene, time, delta) {
  const sprites = scene?.trafficSignalSprites;
  if (!sprites?.size) {
    if (scene?.trafficSignalGlowPool?.length) hideTrafficSignalGlowsFrom(scene.trafficSignalGlowPool, 0);
    return;
  }
  const speed = typeof getVehicleVisualSpeedMultiplier === 'function'
    ? getVehicleVisualSpeedMultiplier()
    : 1;
  const step = Math.min(TRAFFIC_SIGNAL_MAX_DELTA_MS, Math.max(0, Number(delta) || 0));
  scene.trafficSignalClockMs = (scene.trafficSignalClockMs || 0) + step * Math.max(0, Number(speed) || 0);
  if (time < (scene.trafficSignalNextVisualAt || 0)) return;
  scene.trafficSignalNextVisualAt = time + TRAFFIC_SIGNAL_VISUAL_INTERVAL_MS;
  if (scene.scene?.isVisible && !scene.scene.isVisible()) return;
  const view = scene.cameras?.main?.worldView;
  const pad = typeof TILE_IMAGE_HEIGHT !== 'undefined' ? TILE_IMAGE_HEIGHT : 100;
  const glowStrength = trafficSignalGlowStrength(scene);
  const pool = scene.trafficSignalGlowPool || (scene.trafficSignalGlowPool = []);
  const unit = trafficSignalScale(); // screen px per source px at the pole's current scale
  const glowScale = unit * TRAFFIC_SIGNAL_GLOW_SCALE_FACTOR;
  const glowAlpha = glowStrength * TRAFFIC_SIGNAL_GLOW_ALPHA;
  let glowIndex = 0;
  sprites.forEach((sprite) => {
    if (!sprite.trafficSignal) return;
    if (view && (sprite.x < view.x - pad || sprite.x > view.right + pad
      || sprite.y < view.y - pad || sprite.y > view.bottom + pad)) return;
    const phase = trafficSignalPhaseForSprite(scene, sprite);
    const key = trafficSignalTextureKey(sprite.trafficSignalFacing, phase);
    if (sprite.texture?.key !== key) applyTrafficSignalSpriteTexture(scene, sprite, key);
    if (glowStrength <= 0) return;
    const lit = trafficSignalLitLamps(sprite.trafficSignalFacing, phase);
    for (let i = 0; i < lit.length; i++) {
      const glow = takeTrafficSignalGlow(scene, pool, glowIndex);
      if (!glow) return;
      glowIndex++;
      const anchor = TRAFFIC_SIGNAL_LAMP_ANCHORS[sprite.trafficSignalFacing][lit[i]];
      glow.setPosition(sprite.x + anchor[0] * unit, sprite.y + anchor[1] * unit);
      glow.setScale(glowScale);
      glow.setTint(TRAFFIC_SIGNAL_GLOW_COLOURS[lit[i]]);
      glow.setAlpha(glowAlpha);
      glow.setDepth(sprite.depth + 0.1);
      if (!glow.visible) glow.setVisible(true);
    }
  });
  hideTrafficSignalGlowsFrom(pool, glowIndex);
}

function createTrafficSignalSprite(scene, placement) {
  const facing = trafficSignalFacing(placement);
  const textureKey = trafficSignalTextureKey(facing, null);
  if (!scene.textures.exists(textureKey)) return null;
  const sprite = scene.add.image(0, 0, textureKey);
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
  if (scene.worldMask) sprite.setMask(scene.worldMask);
  sprite.trafficSignal = placement;
  sprite.mapRow = placement.row;
  sprite.mapCol = placement.col;
  positionTrafficSignalSprite(scene, sprite);
  if (typeof isTrafficSignalCalibrationActive === 'function' && isTrafficSignalCalibrationActive()
    && typeof makeTrafficSignalSpriteDraggable === 'function') {
    makeTrafficSignalSpriteDraggable(scene, sprite);
  }
  return sprite;
}

function clearTrafficSignalSprites(scene) {
  clearTrafficSignalGlows(scene);
  const sprites = scene?.trafficSignalSprites;
  if (!sprites) return;
  sprites.forEach((sprite) => sprite.destroy());
  sprites.clear();
}

// Reconcile the pole sprites with what the road map calls for now: new junctions get poles,
// removed ones lose them, everything else is repositioned (rotation, calibration, road art).
function rebuildTrafficSignalSprites(scene) {
  const sprites = ensureTrafficSignalSprites(scene);
  if (!sprites || typeof getRoadKey !== 'function' || typeof isRoadLikeTile !== 'function') return;
  const roadKeyAt = (row, col) => (isRoadLikeTile(row, col) ? getRoadKey(row, col) : null);
  const placements = computeTrafficSignalPlacements({ mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT, roadKeyAt });
  // The junction registry the phase queries read; a junction only counts once it has a pole.
  const junctions = new Map();
  placements.forEach((placement) => {
    const key = trafficSignalJunctionKey(placement.junctionRow, placement.junctionCol);
    if (junctions.has(key)) return;
    const junction = describeTrafficSignalJunction(placement.junctionRow, placement.junctionCol, roadKeyAt(placement.junctionRow, placement.junctionCol));
    if (junction) junctions.set(key, junction);
  });
  scene.trafficSignalJunctions = junctions;
  const wanted = new Map(placements.map((placement) => [trafficSignalId(placement), placement]));
  sprites.forEach((sprite, id) => {
    if (wanted.has(id)) return;
    sprite.destroy();
    sprites.delete(id);
  });
  wanted.forEach((placement, id) => {
    const existing = sprites.get(id);
    if (existing) {
      existing.trafficSignal = placement;
      positionTrafficSignalSprite(scene, existing);
      return;
    }
    const sprite = createTrafficSignalSprite(scene, placement);
    if (sprite) sprites.set(id, sprite);
  });
  if (typeof sortRenderLayer === 'function') sortRenderLayer(scene, 'objectLayer');
  scene.terrainViewportCacheKey = null;
  scene.trafficSignalRefreshPending = false;
}

// Road edits arrive one tile at a time (and drag-painting many per frame); coalesce them into
// one rebuild on the next tick.
function scheduleTrafficSignalRefresh(scene) {
  if (!scene || scene.trafficSignalRefreshPending) return;
  scene.trafficSignalRefreshPending = true;
  setTimeout(() => {
    if (!scene.trafficSignalRefreshPending) return;
    if (!scene.sys || !scene.tileSprites) { scene.trafficSignalRefreshPending = false; return; }
    rebuildTrafficSignalSprites(scene);
  }, 0);
}

function refreshAllTrafficSignalSprites(scene) {
  scene?.trafficSignalSprites?.forEach((sprite) => positionTrafficSignalSprite(scene, sprite));
  if (scene) scene.terrainViewportCacheKey = null;
}

const trafficSignalsTestApi = {
  TRAFFIC_SIGNAL_FACINGS,
  TRAFFIC_SIGNAL_JUNCTION_ARMS,
  TRAFFIC_SIGNAL_APPROACH_KEYS,
  TRAFFIC_SIGNAL_FACING_FOR_TRAVEL,
  TRAFFIC_SIGNAL_TEXTURE_FILES,
  TRAFFIC_SIGNAL_SOURCE_CANVAS,
  TRAFFIC_SIGNAL_SOURCE_ANCHOR,
  computeTrafficSignalPlacements,
  trafficSignalId,
  trafficSignalLeftOf,
  trafficSignalLogicalPoint,
  trafficSignalFacing,
  trafficSignalTextureKey,
  describeTrafficSignalJunction,
  getTrafficSignalPhase,
  getTrafficSignalHoldProgress,
  trafficSignalStopProgressFor,
  updateTrafficSignalVisuals,
  trafficSignalLitLamps,
  trafficSignalGlowStrength,
  TRAFFIC_SIGNAL_LAMP_ANCHORS,
};

if (typeof module !== 'undefined' && module.exports) module.exports = trafficSignalsTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    computeTrafficSignalPlacements,
    rebuildTrafficSignalSprites,
    scheduleTrafficSignalRefresh,
    refreshAllTrafficSignalSprites,
    positionTrafficSignalSprite,
    clearTrafficSignalSprites,
    trafficSignalFacing,
    trafficSignalId,
    trafficSignalLogicalPoint,
    trafficSignalTextureKey,
    getTrafficSignalPhase,
    getTrafficSignalHoldProgress,
    updateTrafficSignalVisuals,
    TRAFFIC_SIGNAL_FACINGS,
    TRAFFIC_SIGNAL_TEXTURE_FILES,
  });
}
