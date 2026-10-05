// 海事處: the waterfront buildings of the typhoon shelters - wholesale fish markets (魚類批發市場),
// seafood restaurants (海鮮酒家) and loading bays (卸貨區) - and the night's catch and the trucks
// that take it away.
//
// Hong Kong's boats come alongside at 03:00-05:00 and the wholesale fish market (香港仔魚類批發
// 市場) opens at 04:00; from 03:00 the fish trucks queue at its gate and by 05:00-06:00 the catch
// is on its way to the wet markets. Here the player builds a fish market on a shelter's waterfront
// gravel (石仔地), beside a road; the shelter's boats land their catch there. A loading bay built
// next to the market takes the trucks inside and the catch is piled up on it - a bay holds a couple
// of dozen piles; without one the trucks queue at the curb and the catch stays in the market.
//
// The stock, like the boats, is derived from the clock (typhoon-shelter-fleet.js): landed so far
// minus hauled so far, for the night in question. Nothing but the buildings themselves is saved
// (they are ordinary buildingData records, placed through placeInfraBuilding in tools.js).

const TYPHOON_SHELTER_MARKET = Object.freeze({
  pileTonnes: 1,                 // one crate pile in the loading bay
  truckTonnes: 6,                // one truck load
  maxTrucks: 8,
  // the trucks queue from 03:00 but load from 04:00, when the market opens: the catch of the first
  // hour piles up first, then goes off a load at a time
  haulFrom: 28 * 60,             // sky minutes from the trip day's midnight
  truckSpacing: 25,              // minutes between two trucks loading, at the least
  lastAfterLanding: 30,          // the last truck waits this long after the last boat is in
  loadMinutes: 12,               // a truck stands at the market this long
  gridM: 5,                      // a tile (20 m) is laid out on a 4 x 4 grid of 5 m cells
  pileObjects: Object.freeze(['shoreAssessories1', 'shoreAssessories3', 'shoreAssessories4']),
  maxBayPiles: 24,
  shelterReach: 4,               // a market serves the shelter whose waterfront is nearest, this close
  bayReach: 2,                   // a loading bay belongs to a market this close (tiles between them)
  bayInsideTiles: 1,             // a truck in a bay stands this far in from the middle of the road
  // monthly upkeep, on the typhoon shelters' budget line (getTyphoonShelterMonthlyUpkeep)
  upkeep: Object.freeze({ fish_market: 90, seafood_restaurant: 60, fish_loading_bay: 30 }),
});

const TYPHOON_SHELTER_BUILDING_TYPES = Object.freeze(['fish_market', 'seafood_restaurant', 'fish_loading_bay']);
const TS_MARKET_DIRS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const TS_MARKET_ACROSS = Object.freeze({ n: 'e', s: 'e', e: 's', w: 's' });

function isTyphoonShelterBuildingType(type) {
  return TYPHOON_SHELTER_BUILDING_TYPES.includes(type);
}

function isTyphoonShelterBuildingTool(tool) {
  return typeof LANDMARK_TOOL_BUILDING_TYPES !== 'undefined' && isTyphoonShelterBuildingType(LANDMARK_TOOL_BUILDING_TYPES[tool]);
}

function tsMarketFootprint(row, col, cols = 1, rows = 1) {
  const tiles = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles.push([row + r, col + c]);
  return tiles;
}

/**
 * The road along a footprint: { side, road: { row, col }, through } - the side of the footprint
 * the road is on, the road tile, and how many ways the road runs on along that side (0-2). A truck
 * keeps left, pulls up with the building on its left and drives on, so it needs a through road (2).
 */
function chooseTyphoonShelterRoadSide(tiles, isRoad) {
  const inside = new Set(tiles.map(([r, c]) => `${r}:${c}`));
  let best = null;
  tiles.forEach(([row, col]) => Object.keys(TS_MARKET_DIRS).forEach((side) => {
    const [dr, dc] = TS_MARKET_DIRS[side];
    const [rr, rc] = [row + dr, col + dc];
    if (inside.has(`${rr}:${rc}`) || !isRoad(rr, rc)) return;
    const [ar, ac] = TS_MARKET_DIRS[TS_MARKET_ACROSS[side]];
    const through = (isRoad(rr + ar, rc + ac) ? 1 : 0) + (isRoad(rr - ar, rc - ac) ? 1 : 0);
    if (!best || through > best.through) best = { side, road: { row: rr, col: rc }, through };
  }));
  return best;
}

/**
 * Why a 海事處 building may not go here, or null: each tile on a shelter's waterfront gravel (its
 * paved tiles, the promenade's among them), flat, free and not a road; and a road beside it.
 * ctx: { isInside, isRoad, isWaterfront, isFree, isFlat }.
 */
function whyNotTyphoonShelterBuildingAt(tiles, ctx) {
  for (const [r, c] of tiles) {
    if (!ctx.isInside(r, c)) return 'outside';
    if (!ctx.isWaterfront(r, c)) return 'notWaterfront';
    if (ctx.isRoad(r, c) || !ctx.isFree(r, c)) return 'occupied';
    if (!ctx.isFlat(r, c)) return 'notFlat';
  }
  return chooseTyphoonShelterRoadSide(tiles, ctx.isRoad) ? null : 'noRoad';
}

/**
 * Which market serves which shelter, and which loading bay is whose. Pure.
 *   markets: [{ id, row, col }]; bays: [{ id, row, col }] (2 x 2);
 *   shelters: [{ id, tiles: [{ row, col }] }] - the tiles of its waterfront (quays and pier)
 * Returns [{ id, row, col, shelterId, road, bay: { id, row, col, road } | null }] - a market with
 * no shelter in reach has shelterId null; a bay goes to the nearest market in reach, one bay each.
 */
function assignTyphoonShelterMarkets({ markets, bays, shelters }, isRoad) {
  const M = TYPHOON_SHELTER_MARKET;
  const taken = new Set();
  return [...markets].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((m) => {
    let shelterId = null;
    let bestD = Infinity;
    shelters.forEach((s) => (s.tiles || []).forEach((t) => {
      const d = Math.abs(t.row - m.row) + Math.abs(t.col - m.col);
      if (d <= M.shelterReach && d < bestD) { bestD = d; shelterId = s.id; }
    }));
    let bay = null;
    let bayD = Infinity;
    bays.forEach((b) => {
      if (taken.has(b.id)) return;
      // tiles between the market and the 2 x 2 bay
      const gapR = Math.max(0, b.row - m.row - 1, m.row - (b.row + 1) - 1);
      const gapC = Math.max(0, b.col - m.col - 1, m.col - (b.col + 1) - 1);
      const gap = Math.max(gapR, gapC);
      const road = chooseTyphoonShelterRoadSide(tsMarketFootprint(b.row, b.col, 2, 2), isRoad);
      if (gap <= M.bayReach && road && gap < bayD) { bayD = gap; bay = { id: b.id, row: b.row, col: b.col, road }; }
    });
    if (bay) taken.add(bay.id);
    return { id: m.id, row: m.row, col: m.col, shelterId, road: chooseTyphoonShelterRoadSide([[m.row, m.col]], isRoad), bay };
  });
}

/**
 * Where the crate piles stand in a loading bay: [{ row, col, offsets }] - on the two tiles away
 * from the road (the trucks stand on the two by it), the cells nearest the trucks first.
 */
function layoutTyphoonShelterBayPiles(bay) {
  const g = TYPHOON_SHELTER_MARKET.gridM;
  const toward = bay.road.side;
  const across = TS_MARKET_ACROSS[toward];
  const [dr, dc] = TS_MARKET_DIRS[toward];
  const tiles = tsMarketFootprint(bay.row, bay.col, 2, 2);
  // the back pair: tiles whose neighbour toward the road is inside the bay
  const back = tiles.filter(([r, c]) => tiles.some(([r2, c2]) => r2 === r + dr && c2 === c + dc));
  const steps = [1.5, 0.5, -0.5, -1.5].map((k) => k * g);
  const cells = [];
  back.forEach(([row, col]) => steps.forEach((a) => steps.forEach((b) => {
    cells.push({ row, col, a, b, offsets: [[toward, a], [across, b]] });
  })));
  cells.sort((x, y) => y.a - x.a || (x.row * 1000 + x.col) - (y.row * 1000 + y.col) || x.b - y.b);
  return cells.slice(0, TYPHOON_SHELTER_MARKET.maxBayPiles).map(({ row, col, offsets }) => ({ row, col, offsets }));
}

/**
 * The trucks for one night: [{ at, tonnes }] - when each loads at the market and what it takes.
 * landings: [{ at, tonnes }] (fleet-clock minutes); day: the trip day the night belongs to.
 */
function planTyphoonShelterHaul(landings, day) {
  const M = TYPHOON_SHELTER_MARKET;
  const total = landings.reduce((s, l) => s + l.tonnes, 0);
  if (!(total > 0)) return [];
  const n = Math.min(M.maxTrucks, Math.ceil(total / M.truckTonnes));
  const first = day * 1440 + M.haulFrom;
  const lastLanding = Math.max(...landings.map((l) => l.at));
  const last = Math.max(first + (n - 1) * M.truckSpacing, lastLanding + M.lastAfterLanding);
  const each = total / n;
  return Array.from({ length: n }, (_, k) => ({
    at: Math.round(n === 1 ? Math.max(first, last) : first + ((last - first) * k) / (n - 1)),
    tonnes: each,
  }));
}

// Tonnes at the market at `t`: landed so far, less what the trucks that have loaded took (a truck
// never takes more than is there).
function typhoonShelterMarketStock(landings, haul, t) {
  let landed = 0;
  landings.forEach((l) => { if (l.at <= t) landed += l.tonnes; });
  let hauled = 0;
  haul.forEach((h) => { if (h.at <= t) hauled += h.tonnes; });
  return Math.max(0, landed - Math.min(landed, hauled));
}

function typhoonShelterMarketPiles(stock, slots) {
  return Math.max(0, Math.min(slots, Math.ceil(stock / TYPHOON_SHELTER_MARKET.pileTonnes - 1e-9)));
}

// The night a moment reports on: tonight's once the first boats are out, else last night's.
function getTyphoonShelterMarketNight(t) {
  const day = getTyphoonShelterTripDay(t);
  const firstOut = Math.min(...Object.values(TYPHOON_SHELTER_FLEET.trips).map((x) => x.departFrom));
  return t < day * 1440 + firstOut ? day - 1 : day;
}

// A shelter's landings shared out between its markets: each boat lands at one of them.
function splitTyphoonShelterLandings(landings, marketIndex, marketCount) {
  if (marketCount <= 1) return landings;
  return landings.filter((l) => ((Number(l.boat) || 0) % marketCount) === marketIndex);
}

// ---------------------------------------------------------------------------
// the trucks
// ---------------------------------------------------------------------------
// Each night's trucks drive in and queue - in the loading bay, or at the curb by the market - load
// in turn from 04:00 (the pile goes down as each one loads: typhoonShelterMarketStock) and drive
// off. They are drawn only while the market is in view, driven by the ice-cream van's machinery
// (traffic-visuals.js); the stock keeps to the clock either way.

const TYPHOON_SHELTER_TRUCKS = Object.freeze({
  arriveFrom: 27 * 60,           // 03:00: the first truck in its place
  arriveGap: 8,                  // minutes between two arriving
  earliestBeforeLoad: 10,        // a truck is in its place at least this long before it loads
  slotTiles: 0.55,               // the curb queue: one truck length behind the one in front
  // A truck drives in at traffic speed from beyond the edge of the view, stopping at the lights:
  // 20-40 s, which is several environment hours at any game speed (an hour of sky is ~5 s at 1x).
  // It sets off this long before its place in the queue is due, so the queue stands before the
  // market opens; one there early waits its turn.
  travelLead: 420,
  minStandMs: 4000,              // and stands at the market at least this long (real time), even late
});

// [{ k, arriveAt, loadAt, leaveAt }] for a night's haul.
function planTyphoonShelterFishTrucks(haul, night) {
  const T = TYPHOON_SHELTER_TRUCKS;
  return haul.map((h, k) => ({
    k,
    arriveAt: Math.min(night * 1440 + T.arriveFrom + k * T.arriveGap, h.at - T.earliestBeforeLoad),
    loadAt: h.at,
    leaveAt: h.at + TYPHOON_SHELTER_MARKET.loadMinutes,
  }));
}

// The curb spot `back` truck lengths behind `road`, the building on the `buildingSide`; arrival:
// the way the trucks drive along it (they keep left); inset: how far further in toward the
// building. Null where the road runs out.
function tsCurbSpot(road, buildingSide, arrival, back, isParkingRoad, inset = 0) {
  const j = Math.round(back);
  const tile = { row: road.row - arrival.row * j, col: road.col - arrival.col * j };
  if (!isParkingRoad(tile.row, tile.col)) return null;
  return {
    road: tile,
    buildingSide,
    shift: {
      row: (-arrival.row * (back - j) + buildingSide.row * inset) || 0,
      col: (-arrival.col * (back - j) + buildingSide.col * inset) || 0,
    },
    arrival,
  };
}

/**
 * Where the k-th truck stands: { road, buildingSide, shift, arrival, departure } or null. With a
 * loading bay the first two drive into it (the further one first, so the second need not pass it)
 * and the rest wait at the curb behind; without one they queue at the curb by the market.
 * A truck keeps left - it comes with the building on its left and drives on - but up a dead end it
 * comes the only way it can and turns round to leave; `flip` brings it the other way, for a road
 * the keep-left way has no route to.
 */
function getTyphoonShelterTruckParking(market, k, isParkingRoad, flip = false) {
  const side = market.bay ? market.bay.road : market.road;
  if (!side) return null;
  const [dr, dc] = TS_MARKET_DIRS[side.side];
  const buildingSide = { row: -dr || 0, col: -dc || 0 };
  const kept = getIceCreamArrivalDirectionForBuildingSide(buildingSide);
  if (!kept) return null;
  const road = side.road;
  const behind = (dir) => isParkingRoad(road.row - dir.row, road.col - dir.col);
  const flipped = { row: -kept.row || 0, col: -kept.col || 0 };
  // the other way round when the way it should come has no road to come by (flip: the caller
  // found no route that way)
  const chosen = behind(kept) || !behind(flipped) ? kept : flipped;
  const arrival = flip ? { row: -chosen.row || 0, col: -chosen.col || 0 } : chosen;
  const spot = tsTruckSpot(market, k, isParkingRoad, buildingSide, arrival, dr, dc);
  if (!spot) return null;
  const onward = isParkingRoad(spot.road.row + arrival.row, spot.road.col + arrival.col);
  return { ...spot, departure: onward ? arrival : { row: -arrival.row || 0, col: -arrival.col || 0 } };
}

function tsTruckSpot(market, k, isParkingRoad, buildingSide, arrival, dr, dc) {
  const T = TYPHOON_SHELTER_TRUCKS;
  const side = market.bay ? market.bay.road : market.road;
  if (!market.bay) return tsCurbSpot(side.road, buildingSide, arrival, k * T.slotTiles, isParkingRoad);
  // the bay's road tiles along its front, the one further along the way the trucks drive first
  const footprint = tsMarketFootprint(market.bay.row, market.bay.col, 2, 2);
  const front = footprint
    .map(([r, c]) => ({ row: r + dr, col: c + dc }))
    .filter((t) => !footprint.some(([r, c]) => r === t.row && c === t.col) && isParkingRoad(t.row, t.col))
    .sort((a, b) => (b.row * arrival.row + b.col * arrival.col) - (a.row * arrival.row + a.col * arrival.col));
  if (!front.length) return null;
  const inset = TYPHOON_SHELTER_MARKET.bayInsideTiles - ICE_CREAM_EVENT_CONFIG.parkingOffsetTiles;
  if (k < front.length) return tsCurbSpot(front[k], buildingSide, arrival, 0, isParkingRoad, inset);
  return tsCurbSpot(front[front.length - 1], buildingSide, arrival, (k - front.length + 1) * T.slotTiles, isParkingRoad);
}

function parkTyphoonShelterFishTruck(scene, truck) {
  truck.parkedAt = scene.time?.now || 0;
  truck.phase = 'parked';
  truck.current = null;
  truck.next = null;
}

function spawnTyphoonShelterFishTruck(scene, state, market, plan, key) {
  const model = TRAFFIC_MODEL_BY_ID.get('truck_fish');
  if (!model) return false;
  if (!trafficModelTexturesAreReady(scene, model)) {
    requestTrafficModels(scene, [model]);
    return false;
  }
  // the keep-left way first, then the other way round if no road leads in that way
  let spot = null;
  let parking = null;
  let route = null;
  let departure = null;
  for (const flip of [false, true]) {
    spot = getTyphoonShelterTruckParking(market, plan.k, isRuntimeIceCreamParkingRoad, flip);
    if (!spot) continue;
    parking = { road: spot.road, buildingSide: spot.buildingSide, shift: spot.shift };
    route = getRuntimeIceCreamRouteOutsideView(scene, parking, { row: -spot.arrival.row, col: -spot.arrival.col }, getTrafficRoadIncomingNeighbours);
    // out ahead, or turned round when the road ahead leads nowhere
    const back = { row: -spot.departure.row || 0, col: -spot.departure.col || 0 };
    departure = route && getRuntimeIceCreamRouteOutsideView(scene, parking, spot.departure);
    if (route && !departure) {
      departure = getRuntimeIceCreamRouteOutsideView(scene, parking, back);
      if (departure) spot = { ...spot, departure: back };
    }
    if (route && departure) break;
  }
  if (!route || !departure) {
    const entry = typhoonShelterMarketSites.get(market.id);
    if (entry) entry.noRoute = true;  // the panel says so
    return false;
  }
  const arrivalDirection = spot.arrival;
  const movementLegs = createIceCreamArrivalLegs(scene, route.path, route.outside, parking);
  if (!movementLegs.length) return false;
  const sprite = scene.add.image(0, 0, model.directions.ne.key);
  addToRenderLayer(scene, sprite, 'objectLayer');
  sprite.setOrigin(model.originX, model.originY);
  sprite.setScale(model.scale);
  sprite.setMask(scene.worldMask);
  const truck = {
    id: `fishtruck_${state.nextVehicleId++}`,
    model,
    sprite,
    parking,
    // (read by beginIceCreamDeparture for the way out: on a dead end, back the way it came)
    arrivalDirection: spot.departure || arrivalDirection,
    arrivalPath: route.path,
    outside: route.outside,
    departurePath: departure.targetToOutside,
    departureOutside: departure.outside,
    phase: 'entering',
    movementLegs,
    movementIndex: 0,
    progress: 0,
    current: null,
    next: route.path[0],
    textureDirection: 'ne',
    lastPosition: null,
    sound: null,
    leaveAt: plan.leaveAt,
  };
  createTrafficVehicleLights(scene, truck);
  setIceCreamTruckPosition(truck, evaluateTrafficLeg(movementLegs[0].leg, 0));
  state.fishTrucks.set(key, truck);
  return true;
}

// ---------------------------------------------------------------------------
// the game
// ---------------------------------------------------------------------------

const typhoonShelterMarketSites = new Map();  // market (building) id -> assigned market
const typhoonShelterMarketNights = new Map(); // shelter id -> { key, landings }

function isTyphoonShelterMarketRoad(r, c) {
  return isInsideMap(r, c) && mapData[r][c] === ROAD && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c));
}

const TS_BUILDING_REFUSALS = Object.freeze({
  outside: ['typhoonShelter.building.outside', '超出地圖範圍。'],
  notWaterfront: ['typhoonShelter.building.notWaterfront', '要起喺避風塘旁邊嘅石仔地（海濱）上面。'],
  occupied: ['typhoonShelter.building.occupied', '呢度已經有嘢，揀過另一格。'],
  notFlat: ['typhoonShelter.building.notFlat', '地面要平坦先起得。'],
  noRoad: ['typhoonShelter.building.noRoad', '旁邊要有馬路連接先可以起。'],
});

// Why a 海事處 building may not stand at (row, col), as a sentence for the player; null when it may.
function whyNotTyphoonShelterBuilding(row, col, cols = 1, rows = 1) {
  const code = whyNotTyphoonShelterBuildingAt(tsMarketFootprint(row, col, cols, rows), {
    isInside: (r, c) => isInsideMap(r, c),
    isRoad: isTyphoonShelterMarketRoad,
    isWaterfront: (r, c) => (typeof isTyphoonShelterPavedTile === 'function' && isTyphoonShelterPavedTile(r, c))
      || (typeof isTyphoonShelterQuayTile === 'function' && isTyphoonShelterQuayTile(r, c)),
    isFree: (r, c) => !buildingData[getTileId(r, c)] && !activeScene?.buildingSprites?.has(getTileId(r, c))
      && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c))
      && !(typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(r, c)),
    isFlat: (r, c) => [GROUND, DIRT, BEACH].includes(mapData[r][c]) && !(typeof isSlopeTile === 'function' && isSlopeTile(r, c))
      && getTileHeight(r, c) === 0,
  });
  if (!code) return null;
  const [key, fallback] = TS_BUILDING_REFUSALS[code];
  return typeof tsT === 'function' ? tsT(key, fallback) : fallback;
}

// A building placed or pulled down: the waterfront is laid again round it.
function onTyphoonShelterBuildingsChanged(scene) {
  if (typeof syncTyphoonShelterFacilitySprites === 'function') syncTyphoonShelterFacilitySprites(scene);
  if (typeof renderTyphoonShelterPanel === 'function' && typeof typhoonShelterDom !== 'undefined' && typhoonShelterDom && !typhoonShelterDom.panel.hidden) {
    renderTyphoonShelterPanel();
  }
}

function getTyphoonShelterBuildingsUpkeep() {
  if (typeof buildingData === 'undefined') return 0;
  return Object.values(buildingData).reduce((sum, rec) => sum + (TYPHOON_SHELTER_MARKET.upkeep[rec?.type] || 0), 0);
}

function collectTyphoonShelterBuildings(type) {
  return Object.entries(buildingData || {}).filter(([, rec]) => rec?.type === type)
    .map(([id]) => { const [row, col] = id.split(':').map(Number); return { id, row, col }; });
}

// The 海事處 building standing on a tile, by its anchor (a loading bay covers four tiles).
function getTyphoonShelterBuildingTypeAt(row, col) {
  const rec = buildingData?.[getTileId(row, col)];
  if (rec) return rec.type;
  const sprite = typeof activeScene !== 'undefined' ? activeScene?.buildingSprites?.get(getTileId(row, col)) : null;
  return sprite ? buildingData?.[getTileId(sprite.mapRow, sprite.mapCol)]?.type : null;
}

/**
 * Called by syncTyphoonShelterFacilitySprites: assigns the markets and their bays, and puts each
 * bay's crate piles (hidden until there is catch) into `wanted`. Also strips the promenade off the
 * tiles a 海事處 building stands on - its paving, kerbs and lamps; the seawall, bollards and
 * railing along the sea stay.
 */
function layTyphoonShelterMarkets(wanted) {
  typhoonShelterMarketSites.clear();
  const UNDER_BUILDING = new Set(['quayDeckSquare', 'promenadeKerb', 'promenadeLamp']);
  wanted.forEach((w, id) => {
    if (UNDER_BUILDING.has(w.objectId) && isTyphoonShelterBuildingType(getTyphoonShelterBuildingTypeAt(w.item.row, w.item.col))) wanted.delete(id);
  });
  const shelters = getTyphoonShelterState().shelters.filter((p) => p.status === 'operational').map((p) => ({
    id: p.id,
    tiles: (p.works?.items || []).filter((i) => i.state === 'done' && ['pier', 'quay', 'quayFill', 'quayGround'].includes(i.kind))
      .map((i) => ({ row: i.row, col: i.col })),
  }));
  const markets = assignTyphoonShelterMarkets({
    markets: collectTyphoonShelterBuildings('fish_market'),
    bays: collectTyphoonShelterBuildings('fish_loading_bay'),
    shelters,
  }, isTyphoonShelterMarketRoad);
  markets.forEach((m) => {
    const piles = m.bay ? layoutTyphoonShelterBayPiles(m.bay) : [];
    typhoonShelterMarketSites.set(m.id, { ...m, slots: piles.length });
    piles.forEach((pile, i) => {
      const hash = (salt) => tsMarketHash(m.id, salt, i);
      wanted.set(`${m.id}|pile${i}`, {
        item: { key: `marketPile:${m.id}:${i}`, kind: 'marketPile', row: pile.row, col: pile.col,
          facing: ['n', 'e', 's', 'w'][Math.floor(hash('face') * 4)], state: 'done' },
        objectId: TYPHOON_SHELTER_MARKET.pileObjects[Math.floor(hash('kind') * TYPHOON_SHELTER_MARKET.pileObjects.length)],
        alpha: 1, tint: null, footprintOverride: { cols: 1, rows: 1 }, shoreAlign: false, shoreDir: null,
        sectioned: true, alongM: 0, depthBias: 0.1, offsets: pile.offsets,
        variant: Math.floor(hash('variant') * 8), hidden: true,
        // over the bay's own sprite, which sorts by its front tile
        aboveFootprint: { row: m.bay.row, col: m.bay.col, cols: 2, rows: 2 },
      });
    });
  });
}

function tsMarketHash(seed, salt, i) {
  let h = 2166136261;
  const s = `${seed}|${salt}|${i}`;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

// A shelter's landings for a night, worked out once per night, fleet, layout and storm.
function getTyphoonShelterNightLandings(plan, night) {
  const analysis = getTyphoonShelterAnalyses().get(plan.id);
  if (!analysis || !plan.fleet) return [];
  const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
  const storm = typeof getTyphoonShelterStorm === 'function' ? getTyphoonShelterStorm() : null;
  const key = `${night}|${geometry.key}|${plan.fleet.boats.map((b) => `${b.id}:${b.slot}:${b.model}:${b.repairUntil || 0}`).join(',')}|${JSON.stringify(storm?.holds || [])}|${JSON.stringify(storm?.standbys || [])}`;
  const hit = typhoonShelterMarketNights.get(plan.id);
  if (hit && hit.key === key) return hit.landings;
  const landings = typhoonShelterNightLandings(plan, geometry, night, { storm, moratorium: isTyphoonShelterMoratoriumDay(night) });
  typhoonShelterMarketNights.set(plan.id, { key, landings });
  return landings;
}

// Every working market with its night: [{ id, shelterId, road, bay, slots, night, landings, haul, stock }].
function getTyphoonShelterMarkets(t = getTyphoonShelterFleetClock()) {
  const night = getTyphoonShelterMarketNight(t);
  const out = [];
  const byShelter = new Map();
  typhoonShelterMarketSites.forEach((m) => {
    if (!m.shelterId) return;
    if (!byShelter.has(m.shelterId)) byShelter.set(m.shelterId, []);
    byShelter.get(m.shelterId).push(m);
  });
  const plans = new Map(getTyphoonShelterState().shelters.map((p) => [p.id, p]));
  byShelter.forEach((list, shelterId) => {
    const plan = plans.get(shelterId);
    if (!plan) return;
    const all = getTyphoonShelterNightLandings(plan, night);
    list.forEach((m, i) => {
      const landings = splitTyphoonShelterLandings(all, i, list.length);
      const haul = planTyphoonShelterHaul(landings, night);
      out.push({ ...m, night, landings, haul, stock: typhoonShelterMarketStock(landings, haul, t) });
    });
  });
  return out;
}

// A few times a second: show as many crate piles in each bay as there is catch at the market.
function updateTyphoonShelterMarkets(scene, time) {
  if (!scene?.typhoonShelterObjects || !typhoonShelterMarketSites.size) return;
  if (time < (scene.typhoonShelterMarketNextAt || 0)) return;
  scene.typhoonShelterMarketNextAt = time + 250;
  getTyphoonShelterMarkets().forEach((m) => {
    if (!m.slots) return;
    const shown = typhoonShelterMarketPiles(m.stock, m.slots);
    for (let i = 0; i < m.slots; i++) {
      const rec = scene.typhoonShelterObjects.get(`${m.id}|pile${i}`);
      if (!rec) continue;
      const hidden = i >= shown;
      if (rec.hidden === hidden) continue;
      rec.hidden = hidden;
      if (rec.sprite) rec.sprite.setVisible(!hidden && rec.drawable !== false && isTyphoonShelterSpriteInView(scene, rec.sprite));
    }
  });
}

// The shelter panel's 魚市場 rows (typhoon-shelter-planning.js).
function typhoonShelterMarketRows(planId) {
  const mine = [...typhoonShelterMarketSites.values()].filter((m) => m.shelterId === planId);
  const say = (key, fallback, vars) => (typeof tsT === 'function' ? tsT(key, fallback, vars) : fallback);
  if (!mine.length) {
    return [[say('typhoonShelter.market', '魚市場'), say('typhoonShelter.marketNone', '未有：喺海事處起魚類批發市場，漁船先有地方卸魚')]];
  }
  const now = getTyphoonShelterMarkets().filter((m) => m.shelterId === planId);
  const stock = now.reduce((s, m) => s + m.stock, 0);
  const bays = mine.filter((m) => m.bay).length;
  const noThrough = mine.some((m) => m.noRoute || !((m.bay ? m.bay.road : m.road)?.through > 0));
  return [
    [say('typhoonShelter.market', '魚市場'), `${mine.length} 個 · 卸貨區 ${bays} 個 · 魚貨 ${Math.round(stock * 10) / 10} 噸`],
    ...(noThrough ? [[say('typhoonShelter.marketRoad', '貨車'), say('typhoonShelter.marketRoadNote', '門口條路未接通其他馬路，貨車駛唔埋')]] : []),
  ];
}

function isTyphoonShelterFishTruckModelNeeded() {
  return typhoonShelterMarketSites.size > 0;
}

// Every frame, from the traffic update (traffic-visuals.js).
function updateTyphoonShelterFishTrucks(scene, state, delta, paused, speedMultiplier) {
  if (!state.fishTrucks) state.fishTrucks = new Map();
  if (!state.fishTrucksSeen) state.fishTrucksSeen = new Set();
  const env = getTyphoonShelterFleetClock();
  state.fishTrucks.forEach((truck, key) => {
    if (!paused) {
      if (truck.phase === 'entering' || truck.phase === 'drivingToTarget' || truck.phase === 'leaving') {
        advanceIceCreamMovement(scene, state, truck, delta, speedMultiplier, parkTyphoonShelterFishTruck);
      } else if (truck.phase === 'parked' && env >= truck.leaveAt
        && (scene.time?.now || 0) - (truck.parkedAt || 0) >= TYPHOON_SHELTER_TRUCKS.minStandMs) {
        beginIceCreamDeparture(scene, truck);
      }
    }
    if (truck.phase === 'finished') {
      destroyTrafficVehicle(truck);
      state.fishTrucks.delete(key);
    }
  });
  if (paused || !typhoonShelterMarketSites.size || scene.cameras.main.zoom < TRAFFIC_VISUAL_CONFIG.zoomMin) return;
  const now = scene.time?.now || 0;
  if (now < (state.fishTruckNextCheckAt || 0)) return;
  state.fishTruckNextCheckAt = now + 400;
  // loaded ahead of time, so the first truck is not held up by its textures
  const model = TRAFFIC_MODEL_BY_ID.get('truck_fish');
  if (model && !trafficModelTexturesAreReady(scene, model)) { requestTrafficModels(scene, [model]); return; }
  getTyphoonShelterMarkets(env).forEach((market) => {
    planTyphoonShelterFishTrucks(market.haul, market.night).forEach((plan) => {
      const key = `${market.id}|${market.night}|${plan.k}`;
      // each truck comes once, and not once its turn to load has passed
      if (state.fishTrucks.has(key) || state.fishTrucksSeen.has(key)) return;
      if (env < plan.arriveAt - TYPHOON_SHELTER_TRUCKS.travelLead || env >= plan.loadAt) return;
      if (spawnTyphoonShelterFishTruck(scene, state, market, plan, key)) state.fishTrucksSeen.add(key);
    });
  });
  if (state.fishTrucksSeen.size > 200) state.fishTrucksSeen.clear();
}

const typhoonShelterMarketApi = {
  TYPHOON_SHELTER_MARKET,
  TYPHOON_SHELTER_BUILDING_TYPES,
  isTyphoonShelterBuildingType,
  isTyphoonShelterBuildingTool,
  chooseTyphoonShelterRoadSide,
  whyNotTyphoonShelterBuildingAt,
  assignTyphoonShelterMarkets,
  layoutTyphoonShelterBayPiles,
  planTyphoonShelterHaul,
  typhoonShelterMarketStock,
  typhoonShelterMarketPiles,
  getTyphoonShelterMarketNight,
  splitTyphoonShelterLandings,
  TYPHOON_SHELTER_TRUCKS,
  planTyphoonShelterFishTrucks,
  getTyphoonShelterTruckParking,
  whyNotTyphoonShelterBuilding,
  onTyphoonShelterBuildingsChanged,
  getTyphoonShelterBuildingsUpkeep,
  layTyphoonShelterMarkets,
  getTyphoonShelterMarkets,
  updateTyphoonShelterMarkets,
  typhoonShelterMarketRows,
  updateTyphoonShelterFishTrucks,
  isTyphoonShelterFishTruckModelNeeded,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterMarketApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterMarketApi);
