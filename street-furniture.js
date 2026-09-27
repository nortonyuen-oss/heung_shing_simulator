// Roadside furniture (路邊設施): litter bins, utility and traffic-signal cabinets, posting boxes
// and parking meters. Derived from the map every rebuild and never saved, like the lamps,
// signals and railings. Design and the Hong Kong figures behind the rates:
// docs/street-furniture-plan.md.
//
// Where things can stand: a "slot" is one half (towards `half`) of one kerb (`side`) of a
// straight road tile, on a kerb with pavement (no road across it). A slot already holding a
// railing or a lamp, or on a tile with a bus stop, is taken. Each slot holds at most one prop,
// claimed in priority order: signal cabinets, posting boxes, bins at bus stops, parking meters,
// then bins and utility cabinets by street density. All chance draws are a fixed hash of the
// tile, so a street keeps its furniture across rebuilds until its surroundings change.

const STREET_FURNITURE_TEXTURE_PREFIX = 'street_furniture_';
// Keep in step with scripts/bake-street-furniture-textures.js.
const STREET_FURNITURE_SOURCE_CANVAS = Object.freeze({ width: 256, height: 256 });
const STREET_FURNITURE_SOURCE_ANCHOR = Object.freeze({ x: 128, y: 248 });
const STREET_FURNITURE_BAKED_HEIGHT = 200;
// Screen px per metre of height at zoom 1 (a ~4 m signal pole draws ~20 px).
const STREET_FURNITURE_PX_PER_METRE = 5;
// heightM: real height; lateral: tile units from the road centre out to where it stands (the
// kerb line is ±0.25, kerb stones ±0.28-0.36, the pavement beyond).
const STREET_FURNITURE_KINDS = Object.freeze({
  bin: { heightM: 1.0, lateral: 0.38, label: '垃圾桶' },
  cabinet: { heightM: 1.4, lateral: 0.42, label: '電箱' },
  signalCabinet: { heightM: 1.4, lateral: 0.42, label: '交通燈控制箱' },
  postbox: { heightM: 1.3, lateral: 0.38, label: '郵筒' },
  parkingMeter: { heightM: 1.5, lateral: 0.33, label: '咪錶' },
});
const STREET_FURNITURE_VIEWS = Object.freeze(['sw', 'se']);
const STREET_FURNITURE_TEXTURE_FILES = Object.freeze(Object.fromEntries(
  Object.keys(STREET_FURNITURE_KINDS).flatMap((kind) => STREET_FURNITURE_VIEWS.map((view) => [
    `${STREET_FURNITURE_TEXTURE_PREFIX}${kind}_${view}`,
    `Models/roadAssessories/streetFurniture_${kind}_${view}.png`,
  ])),
));
const STREET_FURNITURE_FORWARD = 0.25; // middle of a half tile
// A rebuild costs ~25-40 ms on a large city; buildings finish continuously as the city grows, so
// their rebuilds batch up this long (road and bus-stop edits, being the player's own, run next tick).
const STREET_FURNITURE_GROWTH_REFRESH_MS = 5000;

// Rates, per straight road tile (~20 m). See docs/street-furniture-plan.md.
const STREET_FURNITURE_RATES = Object.freeze({
  binBase: 0.03,
  binDense: 0.20,          // + binDense * density^2
  binJunctionFactor: 1.5,  // tiles leading into a junction
  binAtBusStop: 0.7,       // a bin on a tile next to a bus stop
  cabinetBase: 0.01,
  cabinetDense: 0.05,      // + cabinetDense * density
  postboxAtHalfDensity: 0.4, // per residential street; scales with density
  postboxMin: 0.1,
  postboxMax: 0.6,
  meterMax: 0.85,          // at or below meterLowTraffic
  meterLowTraffic: 0.15,
  meterNoTraffic: 0.35,    // no meters at or above this traffic load
  meterMinDensity: 0.3,    // meters serve the shops and flats along the street
});

const STREET_FURNITURE_DELTA = Object.freeze({
  n: { row: -1, col: 0 }, e: { row: 0, col: 1 }, s: { row: 1, col: 0 }, w: { row: 0, col: -1 },
});
const STREET_FURNITURE_OPPOSITE = Object.freeze({ n: 's', e: 'w', s: 'n', w: 'e' });
const STREET_FURNITURE_STRAIGHTS = Object.freeze({
  road_straight_v: { kerbs: ['e', 'w'], along: ['n', 's'] },
  road_straight_h: { kerbs: ['n', 's'], along: ['e', 'w'] },
});
const STREET_FURNITURE_SCREEN_EDGE = Object.freeze({ n: 'ne', e: 'se', s: 'sw', w: 'nw' });

function isStreetFurnitureJunctionKey(key) {
  return key === 'road_cross' || (typeof key === 'string' && key.startsWith('road_t_'));
}

// Fixed pseudo-random [0, 1) per tile and purpose.
function streetFurnitureHash(row, col, salt) {
  let h = (Math.imul(row, 73856093) ^ Math.imul(col, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const STREET_FURNITURE_SALT = Object.freeze({ bin: 1, cabinet: 2, postbox: 3, meter: 4, busStopBin: 5 });

// How built-up the street is at a tile: the cells across both kerbs of it and its two
// neighbours along the road, each 0 (empty) or 0.7 / 0.85 / 1.0 for a level 1 / 2 / 3 building.
function streetFurnitureDensity(row, col, straight, frontageAt) {
  let total = 0;
  const [a, b] = straight.along;
  for (const offset of [-1, 0, 1]) {
    const step = STREET_FURNITURE_DELTA[offset < 0 ? a : b];
    const r = row + (offset === 0 ? 0 : step.row);
    const c = col + (offset === 0 ? 0 : step.col);
    for (const side of straight.kerbs) {
      const across = STREET_FURNITURE_DELTA[side];
      const building = frontageAt(r + across.row, c + across.col);
      if (building) total += 0.7 + 0.15 * (Math.max(1, Math.min(3, building.level || 1)) - 1);
    }
  }
  return total / 6;
}

// Pure: every piece of furniture the map calls for. Inputs (all map frame):
//   roadKeyAt(r, c)       getRoadKey, or null off-road
//   bandAt(r, c)          getRoadCarriagewayBand
//   frontageAt(r, c)      null, or { type, level } for a building standing on that cell
//   busStopAt(r, c)       the tile has a bus stop
//   occupiedAt(r, c, side, half)  a railing or lamp already stands in that slot
//   railingTileAt(r, c)   the tile carries railings (junction approach / zebra)
//   trafficAt(r, c)       0..1 traffic load (parking meters only)
//   signalPlacements      computeTrafficSignalPlacements output (one cabinet per junction block)
// Returns [{ kind, row, col, side, half }].
function computeStreetFurniturePlacements({
  mapWidth, mapHeight, roadKeyAt, bandAt = () => null, frontageAt: readFrontage = () => null,
  busStopAt = () => false, occupiedAt = () => false, railingTileAt = () => false,
  trafficAt = () => 0, signalPlacements = [], rates = STREET_FURNITURE_RATES,
}) {
  const inside = (r, c) => r >= 0 && c >= 0 && r < mapHeight && c < mapWidth;
  // getRoadKey runs the carriageway-band scan and every tile is asked about several times below:
  // read the whole map once into a flat array (a Map here cost more than the scan itself).
  const keys = new Array(mapWidth * mapHeight);
  const straightTiles = [];
  for (let r = 0; r < mapHeight; r++) {
    for (let c = 0; c < mapWidth; c++) {
      const key = roadKeyAt(r, c) ?? null;
      keys[r * mapWidth + c] = key;
      const straight = STREET_FURNITURE_STRAIGHTS[key];
      if (straight) straightTiles.push({ row: r, col: c, key, straight });
    }
  }
  const keyAt = (r, c) => (inside(r, c) ? keys[r * mapWidth + c] : null);
  const frontage = new Array(mapWidth * mapHeight);
  const frontageAt = (r, c) => {
    if (!inside(r, c)) return null;
    const index = r * mapWidth + c;
    if (frontage[index] === undefined) frontage[index] = readFrontage(r, c) ?? null;
    return frontage[index];
  };
  const densities = new Map();
  const densityAt = (r, c, straight) => {
    const index = r * mapWidth + c;
    if (!densities.has(index)) densities.set(index, streetFurnitureDensity(r, c, straight, frontageAt));
    return densities.get(index);
  };
  const straightAt = (r, c) => STREET_FURNITURE_STRAIGHTS[keyAt(r, c)] ?? null;
  const claimed = new Set();
  const placements = [];
  const slotKey = (r, c, side, half) => `${r}:${c}:${side}:${half}`;
  const slotFree = (r, c, side, half) => {
    const straight = straightAt(r, c);
    if (!straight || !straight.kerbs.includes(side) || !straight.along.includes(half)) return false;
    if (busStopAt(r, c) || claimed.has(slotKey(r, c, side, half))) return false;
    const across = STREET_FURNITURE_DELTA[side];
    if (keyAt(r + across.row, c + across.col)) return false; // no pavement: more road across
    return !occupiedAt(r, c, side, half);
  };
  const claim = (kind, r, c, side, half) => {
    claimed.add(slotKey(r, c, side, half));
    placements.push({ kind, row: r, col: c, side, half });
  };
  // Claim the first free slot on a tile, trying kerbs then halves in the given order.
  const claimOnTile = (kind, r, c, sides, halves) => {
    for (const side of sides) {
      for (const half of halves) {
        if (slotFree(r, c, side, half)) { claim(kind, r, c, side, half); return true; }
      }
    }
    return false;
  };
  const builtSide = (r, c, side) => {
    const across = STREET_FURNITURE_DELTA[side];
    return frontageAt(r + across.row, c + across.col);
  };
  // Kerbs in order of how built-up the frontage across them is (props serve the pavement side
  // people use), ties broken by the fixed kerb order.
  const kerbsByFrontage = (r, c, straight) => {
    const [a, b] = straight.kerbs;
    return !builtSide(r, c, a) && builtSide(r, c, b) ? [b, a] : straight.kerbs;
  };

  // 1. One traffic-signal controller cabinet per signalised junction block, on the kerb the
  //    signal pole stands on at its first approach, in the half away from the junction.
  const byBlock = new Map();
  signalPlacements.forEach((p) => {
    const block = `${p.clusterRow ?? p.junctionRow}:${p.clusterCol ?? p.junctionCol}`;
    if (!byBlock.has(block)) byBlock.set(block, []);
    byBlock.get(block).push(p);
  });
  byBlock.forEach((approaches) => {
    approaches.sort((x, y) => x.row - y.row || x.col - y.col || x.travel.localeCompare(y.travel));
    for (const p of approaches) {
      const straight = straightAt(p.row, p.col);
      if (!straight) continue;
      const poleSide = { n: 'w', e: 'n', s: 'e', w: 's' }[p.travel]; // the driver's left kerb
      const sides = straight.kerbs.includes(poleSide)
        ? [poleSide, ...straight.kerbs.filter((side) => side !== poleSide)]
        : straight.kerbs;
      if (claimOnTile('signalCabinet', p.row, p.col, sides, [STREET_FURNITURE_OPPOSITE[p.travel]])) break;
    }
  });

  // Streets: maximal runs of the same straight key along its axis.
  const streets = [];
  straightTiles.forEach(({ row, col, key, straight }) => {
    const back = STREET_FURNITURE_DELTA[straight.along[0]];
    if (keyAt(row + back.row, col + back.col) === key) return; // not the start of its run
    const forward = STREET_FURNITURE_DELTA[straight.along[1]];
    const tiles = [];
    for (let r = row, c = col; keyAt(r, c) === key; r += forward.row, c += forward.col) tiles.push({ row: r, col: c });
    streets.push({ straight, tiles });
  });

  // 2. Posting boxes: a residential street gets one with a chance that grows with its density.
  streets.forEach(({ straight, tiles }) => {
    let cells = 0; let built = 0; let residential = 0; let density = 0;
    tiles.forEach(({ row, col }) => {
      straight.kerbs.forEach((side) => {
        cells++;
        const building = builtSide(row, col, side);
        if (!building) return;
        built++;
        if (building.type === 'residential') residential++;
      });
      density += densityAt(row, col, straight);
    });
    if (!built || residential * 2 < built || built * 3 < cells) return;
    density /= tiles.length;
    const chance = Math.max(rates.postboxMin, Math.min(rates.postboxMax, rates.postboxAtHalfDensity * (0.5 + density)));
    const first = tiles[0];
    if (streetFurnitureHash(first.row, first.col, STREET_FURNITURE_SALT.postbox) >= chance) return;
    const middle = (tiles.length - 1) / 2;
    const order = tiles.map((tile, index) => ({ tile, distance: Math.abs(index - middle) }))
      .sort((x, y) => x.distance - y.distance);
    for (const { tile } of order) {
      const sides = [...straight.kerbs].sort((x, y) => {
        const res = (side) => (builtSide(tile.row, tile.col, side)?.type === 'residential' ? 1 : 0);
        return res(y) - res(x);
      });
      if (claimOnTile('postbox', tile.row, tile.col, sides, straight.along)) break;
    }
  });

  // 3. Bins at bus stops: most stops get one on the next tile along, facing kerb first.
  straightTiles.forEach(({ row, col, straight }) => {
    if (!busStopAt(row, col)) return;
    if (streetFurnitureHash(row, col, STREET_FURNITURE_SALT.busStopBin) >= rates.binAtBusStop) return;
    for (const toward of straight.along) {
      const d = STREET_FURNITURE_DELTA[toward];
      if (claimOnTile('bin', row + d.row, col + d.col, straight.kerbs, [STREET_FURNITURE_OPPOSITE[toward], toward])) break;
    }
  });

  // 4. Parking meters: kerbside of a low-traffic dual carriageway that has buildings along it
  //    (meters serve the frontage - a quiet road through empty land has no one to park for),
  //    clear of junctions, zebra crossings and bus stops, one meter per tile on a built-up kerb
  //    (Hong Kong: ~1.8 metered spaces per meter).
  straightTiles.forEach(({ row, col, straight }) => {
    const band = bandAt(row, col);
    if (!band || band.direction === 'shared' || railingTileAt(row, col)) return;
    if (densityAt(row, col, straight) < rates.meterMinDensity) return;
    const builtKerbs = straight.kerbs.filter((side) => builtSide(row, col, side));
    if (!builtKerbs.length) return;
    if (straight.along.some((toward) => {
      const d = STREET_FURNITURE_DELTA[toward];
      return busStopAt(row + d.row, col + d.col);
    })) return;
    const load = Math.max(0, Number(trafficAt(row, col)) || 0);
    const chance = load <= rates.meterLowTraffic ? rates.meterMax
      : load >= rates.meterNoTraffic ? 0
        : rates.meterMax * (rates.meterNoTraffic - load) / (rates.meterNoTraffic - rates.meterLowTraffic);
    if (streetFurnitureHash(row, col, STREET_FURNITURE_SALT.meter) >= chance) return;
    claimOnTile('parkingMeter', row, col, builtKerbs, straight.along);
  });

  // 5-6. Bins and utility cabinets by how built-up the street is.
  straightTiles.forEach(({ row, col, straight }) => {
    {
      if (busStopAt(row, col)) return;
      const density = densityAt(row, col, straight);
      const kerbs = kerbsByFrontage(row, col, straight);
      let binChance = rates.binBase + rates.binDense * density * density;
      if (straight.along.some((toward) => {
        const d = STREET_FURNITURE_DELTA[toward];
        return isStreetFurnitureJunctionKey(keyAt(row + d.row, col + d.col));
      })) binChance *= rates.binJunctionFactor;
      if (streetFurnitureHash(row, col, STREET_FURNITURE_SALT.bin) < binChance) {
        claimOnTile('bin', row, col, kerbs, straight.along);
      }
      const cabinetChance = rates.cabinetBase + rates.cabinetDense * density;
      if (streetFurnitureHash(row, col, STREET_FURNITURE_SALT.cabinet) < cabinetChance) {
        claimOnTile('cabinet', row, col, kerbs, [...straight.along].reverse());
      }
    }
  });
  return placements;
}

function streetFurnitureId(placement) {
  return `${placement.kind}:${placement.row}:${placement.col}:${placement.side}:${placement.half}`;
}

// Which baked view shows the prop's front: a kerb along a road running NW-SE on screen (NE/SW
// edge) takes the SW view, one along SW-NE (SE/NW edge) the SE view.
function streetFurnitureView(placement, rotation = typeof mapRotation !== 'undefined' ? mapRotation : 0) {
  const visualSide = typeof rotateDirection === 'function' ? rotateDirection(placement.side, rotation) : placement.side;
  const edge = STREET_FURNITURE_SCREEN_EDGE[visualSide] ?? 'sw';
  return edge === 'ne' || edge === 'sw' ? 'sw' : 'se';
}

function streetFurnitureTextureKey(kind, view) {
  return `${STREET_FURNITURE_TEXTURE_PREFIX}${kind}_${view}`;
}

// Calibration facing: one nudge per prop kind and view.
function streetFurnitureFacing(placement, rotation) {
  return `${placement.kind}_${streetFurnitureView(placement, rotation)}`;
}

function streetFurnitureOffsetFor(facing) {
  const override = typeof getStreetFurnitureCalibrationOffset === 'function' ? getStreetFurnitureCalibrationOffset(facing) : null;
  return override ?? STREET_FURNITURE_ANCHOR_OFFSETS[facing] ?? { dx: 0, dy: 0 };
}

function streetFurnitureScaleFor(kind) {
  const override = typeof getStreetFurnitureCalibrationScale === 'function' ? getStreetFurnitureCalibrationScale() : null;
  const multiplier = override ?? STREET_FURNITURE_SCALE;
  const heightM = STREET_FURNITURE_KINDS[kind]?.heightM ?? 1;
  return multiplier * (heightM * STREET_FURNITURE_PX_PER_METRE) / STREET_FURNITURE_BAKED_HEIGHT;
}

function streetFurnitureLogicalPoint(placement) {
  const across = STREET_FURNITURE_DELTA[placement.side];
  const ahead = STREET_FURNITURE_DELTA[placement.half];
  const lateral = STREET_FURNITURE_KINDS[placement.kind]?.lateral ?? 0.38;
  return {
    row: placement.row + across.row * lateral + ahead.row * STREET_FURNITURE_FORWARD,
    col: placement.col + across.col * lateral + ahead.col * STREET_FURNITURE_FORWARD,
  };
}

// Screen anchor (foot) and depth, in the same terms as the signal poles.
function streetFurnitureAnchor(scene, placement, facing) {
  const point = streetFurnitureLogicalPoint(placement);
  const geo = getTileFaceGeometry(placement.row, placement.col, scene.offsetX, scene.offsetY);
  const centre = isoToScreen(placement.col, placement.row);
  const shifted = isoToScreen(point.col, point.row);
  const offset = streetFurnitureOffsetFor(facing);
  return {
    x: geo.center.x + (shifted.x - centre.x) + offset.dx,
    y: geo.center.y + (shifted.y - centre.y) + offset.dy,
    depth: getWorldDepth('object', shifted.y + TILE_HEIGHT),
  };
}

function applyStreetFurnitureSpriteTexture(scene, sprite, kind, textureKey) {
  if (!scene.textures.exists(textureKey)) return false;
  if (sprite.texture?.key !== textureKey) sprite.setTexture(textureKey);
  const texture = scene.textures.get(textureKey)?.getSourceImage?.();
  const anchorSpec = typeof getPropTextureAnchor === 'function' && texture
    ? getPropTextureAnchor(STREET_FURNITURE_TEXTURE_FILES[textureKey], STREET_FURNITURE_SOURCE_ANCHOR.x, STREET_FURNITURE_SOURCE_ANCHOR.y, texture)
    : { originX: STREET_FURNITURE_SOURCE_ANCHOR.x / STREET_FURNITURE_SOURCE_CANVAS.width, originY: STREET_FURNITURE_SOURCE_ANCHOR.y / STREET_FURNITURE_SOURCE_CANVAS.height, scaleMultiplier: 1 };
  sprite.setOrigin(anchorSpec.originX, anchorSpec.originY);
  sprite.setScale(streetFurnitureScaleFor(kind) * anchorSpec.scaleMultiplier);
  return true;
}

function positionStreetFurnitureSprite(scene, sprite) {
  if (!scene || !sprite?.streetFurniture) return;
  const placement = sprite.streetFurniture;
  const view = streetFurnitureView(placement);
  const facing = `${placement.kind}_${view}`;
  sprite.streetFurnitureFacing = facing;
  applyStreetFurnitureSpriteTexture(scene, sprite, placement.kind, streetFurnitureTextureKey(placement.kind, view));
  const anchor = streetFurnitureAnchor(scene, placement, facing);
  sprite.setPosition(anchor.x, anchor.y);
  sprite.setDepth(anchor.depth);
}

function createStreetFurnitureSprite(scene, placement) {
  const textureKey = streetFurnitureTextureKey(placement.kind, streetFurnitureView(placement));
  if (!scene.textures.exists(textureKey)) return null;
  const sprite = scene.add.image(0, 0, textureKey);
  if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, sprite, 'objectLayer');
  if (scene.worldMask) sprite.setMask(scene.worldMask);
  sprite.streetFurniture = placement;
  sprite.mapRow = placement.row;
  sprite.mapCol = placement.col;
  positionStreetFurnitureSprite(scene, sprite);
  if (typeof isStreetFurnitureCalibrationActive === 'function' && isStreetFurnitureCalibrationActive()
    && typeof makeStreetFurnitureSpriteDraggable === 'function') {
    makeStreetFurnitureSpriteDraggable(scene, sprite);
  }
  return sprite;
}

function ensureStreetFurnitureSprites(scene) {
  if (scene && !scene.streetFurnitureSprites) scene.streetFurnitureSprites = new Map();
  return scene?.streetFurnitureSprites ?? null;
}

function clearStreetFurnitureSprites(scene) {
  const sprites = scene?.streetFurnitureSprites;
  if (!sprites) return;
  sprites.forEach((sprite) => sprite.destroy());
  sprites.clear();
}

// Reconcile the furniture sprites with the map. Railings, lamps and signals are read from their
// own sprite maps, so any of their rebuilds still pending run first. Parking meters read the
// traffic load, which moves every sim tick: the value a tile had at the last road rebuild is
// kept (scene.streetFurnitureTraffic) so a building finishing nearby doesn't make meters blink
// in and out as the load wobbles; `recomputeTraffic` re-reads it after a road change.
function rebuildStreetFurnitureSprites(scene, { recomputeTraffic = true } = {}) {
  const sprites = ensureStreetFurnitureSprites(scene);
  if (!sprites || typeof getRoadKey !== 'function' || typeof isRoadLikeTile !== 'function') return;
  if (scene.pedestrianRailingRefreshPending && typeof rebuildPedestrianRailingSprites === 'function') rebuildPedestrianRailingSprites(scene);
  if (scene.streetLampRefreshPending && typeof rebuildStreetLampSprites === 'function') rebuildStreetLampSprites(scene);
  if (scene.trafficSignalRefreshPending && typeof rebuildTrafficSignalSprites === 'function') rebuildTrafficSignalSprites(scene);

  const roadKeyAt = (row, col) => (isRoadLikeTile(row, col) ? getRoadKey(row, col) : null);
  const bandAt = typeof getRoadCarriagewayBand === 'function' ? getRoadCarriagewayBand : () => null;
  const frontageAt = (row, col) => {
    const building = scene.buildingSprites?.get(getTileId(row, col));
    if (!building) return null;
    const record = typeof buildingData !== 'undefined' ? buildingData[getTileId(building.mapRow, building.mapCol)] : null;
    return record ? { type: record.type, level: record.level } : { type: 'other', level: 1 };
  };
  const busStopAt = (row, col) => {
    const sides = typeof getBusStopSides === 'function' ? getBusStopSides(row, col) : null;
    return Array.isArray(sides) && sides.length > 0;
  };
  const occupied = new Set();
  const railingTiles = new Set();
  scene.pedestrianRailingSprites?.forEach((sprite) => {
    const p = sprite.pedestrianRailing;
    if (!p) return;
    occupied.add(`${p.row}:${p.col}:${p.side}:${p.toward}`);
    railingTiles.add(`${p.row}:${p.col}`);
  });
  scene.streetLampSprites?.forEach((sprite) => {
    const p = sprite.streetLamp;
    if (!p || p.kind !== 'straight') return;
    // A lamp on an e/w kerb stands on a n-s road, so its offset along the road is offsetRow.
    const half = p.side === 'e' || p.side === 'w'
      ? (p.offsetRow > 0 ? 's' : 'n')
      : (p.offsetCol > 0 ? 'e' : 'w');
    occupied.add(`${p.row}:${p.col}:${p.side}:${half}`);
  });
  if (recomputeTraffic || !scene.streetFurnitureTraffic) scene.streetFurnitureTraffic = new Map();
  const trafficCache = scene.streetFurnitureTraffic;
  const trafficAt = (row, col) => {
    const key = `${row}:${col}`;
    if (!trafficCache.has(key)) trafficCache.set(key, Number(typeof trafficMap !== 'undefined' ? trafficMap[row]?.[col] : 0) || 0);
    return trafficCache.get(key);
  };
  const signalPlacements = [];
  scene.trafficSignalSprites?.forEach((sprite) => { if (sprite.trafficSignal) signalPlacements.push(sprite.trafficSignal); });

  const placements = computeStreetFurniturePlacements({
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    roadKeyAt,
    bandAt,
    frontageAt,
    busStopAt,
    occupiedAt: (row, col, side, half) => occupied.has(`${row}:${col}:${side}:${half}`),
    railingTileAt: (row, col) => railingTiles.has(`${row}:${col}`),
    trafficAt,
    signalPlacements,
  });
  const wanted = new Map(placements.map((placement) => [streetFurnitureId(placement), placement]));
  sprites.forEach((sprite, id) => {
    if (wanted.has(id)) return;
    sprite.destroy();
    sprites.delete(id);
  });
  wanted.forEach((placement, id) => {
    // Same id = same kind, tile, kerb and half: already standing where it should
    // (rotation and resize reposition everything through refreshAllStreetFurnitureSprites).
    if (sprites.has(id)) return;
    const sprite = createStreetFurnitureSprite(scene, placement);
    if (sprite) sprites.set(id, sprite);
  });
  if (typeof sortRenderLayer === 'function') sortRenderLayer(scene, 'objectLayer');
  scene.streetFurnitureRefreshPending = false;
  scene.streetFurnitureRecomputeTraffic = false;
}

// Road and bus-stop edits: rebuild next tick with a fresh traffic read. Buildings finish one at a
// time as the city grows, so those rebuilds wait STREET_FURNITURE_GROWTH_REFRESH_MS and batch
// (and keep the traffic read).
function scheduleStreetFurnitureRefresh(scene, { delayMs = 0, recomputeTraffic = true } = {}) {
  if (!scene) return;
  if (recomputeTraffic) scene.streetFurnitureRecomputeTraffic = true;
  const due = Date.now() + delayMs;
  // A pending rebuild due no later than this one already covers it.
  if (scene.streetFurnitureRefreshPending && scene.streetFurnitureRefreshDue <= due) return;
  if (scene.streetFurnitureRefreshTimer) clearTimeout(scene.streetFurnitureRefreshTimer);
  scene.streetFurnitureRefreshPending = true;
  scene.streetFurnitureRefreshDue = due;
  scene.streetFurnitureRefreshTimer = setTimeout(() => {
    scene.streetFurnitureRefreshTimer = null;
    if (!scene.streetFurnitureRefreshPending) return;
    if (!scene.sys || !scene.tileSprites) { scene.streetFurnitureRefreshPending = false; return; }
    rebuildStreetFurnitureSprites(scene, { recomputeTraffic: !!scene.streetFurnitureRecomputeTraffic });
  }, delayMs);
}

function refreshAllStreetFurnitureSprites(scene) {
  scene?.streetFurnitureSprites?.forEach((sprite) => positionStreetFurnitureSprite(scene, sprite));
}

const streetFurnitureTestApi = {
  STREET_FURNITURE_KINDS,
  STREET_FURNITURE_RATES,
  STREET_FURNITURE_TEXTURE_FILES,
  STREET_FURNITURE_SOURCE_CANVAS,
  computeStreetFurniturePlacements,
  streetFurnitureDensity,
  streetFurnitureHash,
  streetFurnitureId,
  streetFurnitureView,
  streetFurnitureTextureKey,
  STREET_FURNITURE_STRAIGHTS,
};

if (typeof module !== 'undefined' && module.exports) module.exports = streetFurnitureTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    computeStreetFurniturePlacements,
    rebuildStreetFurnitureSprites,
    scheduleStreetFurnitureRefresh,
    refreshAllStreetFurnitureSprites,
    clearStreetFurnitureSprites,
    STREET_FURNITURE_TEXTURE_FILES,
    STREET_FURNITURE_SOURCE_CANVAS,
    STREET_FURNITURE_KINDS,
    STREET_FURNITURE_GROWTH_REFRESH_MS,
  });
}
