// Touch Phase B adapters. Preview is read-only; commit uses the existing domain writers.
const TOUCH_BUILDING_TYPES = Object.freeze({
  'power-coal': 'power_plant_coal', 'power-solar': 'power_plant_solar', 'power-nuclear': 'power_plant_nuclear',
  'fire-station': 'fire_station', 'police-station': 'police_station', hospital: 'hospital',
  'primary-school': 'primary_school', 'secondary-school': 'secondary_school',
  'community-college': 'community_college', university: 'university', library: 'library',
  'legislative-council': 'legislative_council', 'stock-exchange': 'stock_exchange',
  ...LANDMARK_TOOL_BUILDING_TYPES,
});
const TOUCH_PHASE_B_TOOLS = Object.freeze(['road', 'zone-res', 'zone-com', 'zone-ind', 'bulldoze', 'inspect', ...Object.keys(TOUCH_BUILDING_TYPES)]);
const touchObjectIds = new WeakMap();
let nextTouchObjectId = 1;
function touchObjectIdentity(record) {
  if (!record || typeof record !== 'object') return 0;
  if (!touchObjectIds.has(record)) touchObjectIds.set(record, nextTouchObjectId++);
  return touchObjectIds.get(record);
}

function getTouchToolOptions(tool) {
  const type = TOUCH_BUILDING_TYPES[tool];
  const model = type === HARBOR_BUILDING_TYPE ? HARBOR_MODELS[Object.keys(HARBOR_MODELS)[0]]
    : type ? selectInfraPlacementModel(type) : null;
  return { density: DENSITY_LOW, range: tool !== 'bulldoze', model: model ? { ...model } : null };
}

function touchRectTiles(start, end) {
  const tiles = [];
  for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
    for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col++) tiles.push({ row, col });
  }
  return tiles;
}

// Only values that affect approval go into the signature; simulation age/time is irrelevant.
function touchTileIdentity(scene, row, col) {
  const sprite = scene.buildingSprites?.get(getTileId(row, col));
  const record = buildingData[getTileId(sprite?.mapRow ?? row, sprite?.mapCol ?? col)];
  return [row, col, mapData[row]?.[col], getTileHeight(row, col), zoneMap[row]?.[col], zoneDensityMap[row]?.[col],
    sprite?.mapRow, sprite?.mapCol, touchObjectIdentity(record), record?.type, record?.spriteKey, record?.customName,
    !!scene.treeSprites?.has(getTileId(row, col)), !!scene.debrisSprites?.has(getTileId(row, col)),
    typeof getBusStopSides === 'function' ? getBusStopSides(row, col) : null,
    typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(row, col)];
}

function getTouchDemolitionPlan(scene, tiles) {
  const operations = [];
  const seen = new Set();
  const buildings = new Set();
  const affected = [];
  const summary = { buildings: 0, roads: 0, empty: 0, facilities: 0, routes: 0 };
  let reason = '';
  for (const { row, col } of tiles) {
    const id = getTileId(row, col);
    affected.push(touchTileIdentity(scene, row, col));
    const add = (kind, key, object, extra = {}) => {
      if (seen.has(`${kind}:${key}`)) return;
      seen.add(`${kind}:${key}`);
      operations.push({ kind, row, col, key, ...extra });
      affected.push([kind, key, object]);
      summary.facilities++;
    };
    const floating = findTyphoonShelterFloatingRestaurantAt(getTyphoonShelterState().shelters, row, col);
    if (floating) {
      if (isTyphoonShelterStormFreeze(getTyphoonShelterState().storm, undefined, floating.plan.id)) reason = t('mobile.stormDemolition');
      add('floating', `${floating.plan.id}:${floating.item.row}:${floating.item.col}`, floating.item);
      continue;
    }
    const pier = getFerryPierAt(row, col);
    if (pier) {
      const routes = getFerryState().routes.filter((r) => r.pierIds.includes(pier.id)).map((r) => r.id);
      if (!seen.has(`pier:${pier.id}`)) summary.routes += routes.length;
      add('pier', pier.id, [pier, routes]);
      continue;
    }
    if (isPromenadeTile(row, col)) { add('promenade', id, getPromenadeState().tiles[`${row}:${col}`], { cost: COST_BULLDOZE }); continue; }
    const tunnel = getUnderseaTunnelTile(row, col);
    if (tunnel && !tunnel.under) { add('tunnel', tunnel.tunnel.id, tunnel.tunnel); continue; }
    const station = getMetroStationAt(row, col);
    if (station) {
      if (getMetroStationLine(station, getMetroState())) reason = t('metro.station.onLine', { name: station.name });
      add('metroStation', station.id, [station.id, station.name, getMetroStationLines(station).map((line) => line.id)]);
      continue;
    }
    // Track removal can span a tunnel or prune live lines. Its complete summary belongs to C.
    if (getMetroTrackBits()[`${row}:${col}`] || getTramState().tracks[`${row}:${col}`] || getTramStopAt(row, col)) {
      reason = t('mobile.demolitionTransport');
      continue;
    }
    const sprite = scene.buildingSprites?.get(id);
    const record = buildingData[getTileId(sprite?.mapRow ?? row, sprite?.mapCol ?? col)];
    if (record) {
      const key = getTileId(sprite?.mapRow ?? row, sprite?.mapCol ?? col);
      if (!buildings.has(key)) {
        buildings.add(key);
        summary.buildings++;
        affected.push(['building', key, record.type, record.spriteKey, record.customName, record.footprintCols, record.footprintRows]);
      }
    } else if (mapData[row][col] === ROAD || isBridgeTile(row, col)) summary.roads++;
    else summary.empty++;
    operations.push({ kind: 'tile', row, col, cost: COST_BULLDOZE });
  }
  return { operations, summary, affected, reason, cost: operations.reduce((total, op) => total + (op.cost || 0), 0) };
}

function previewTouchToolAction(scene, draft) {
  const plan = { ok: false, reason: '', cost: 0, tiles: [], kind: draft.tool, signature: '' };
  if (!TOUCH_PHASE_B_TOOLS.includes(draft.tool)) return { ...plan, reason: t('mobile.phaseC') };
  if (!draft.start || !draft.end) return plan;
  if (![draft.start, draft.end].every(({ row, col }) => isInsideMap(row, col))) return { ...plan, reason: t('mobile.outside') };
  if (isTerrainCreatorMode) return { ...plan, reason: t('mobile.phaseC') };
  const { row, col } = draft.start;
  let identity = [];
  if (TOUCH_BUILDING_TYPES[draft.tool]) {
    const type = TOUCH_BUILDING_TYPES[draft.tool];
    Object.assign(plan, getInfraPlacementQuote(row, col, type, draft.options.model));
    plan.tiles = getFootprintTiles(row, col, plan.footprintCols || 1, plan.footprintRows || 1).map(([r, c]) => ({ row: r, col: c }));
    identity = plan.tiles.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'road') {
    const pathInfo = getStraightDragPath(draft.start, draft.end);
    const bridge = analyzeBridgePath(scene, pathInfo);
    plan.tiles = pathInfo.path;
    if (bridge.crossesWater) {
      const shelter = pathInfo.path.some((tile) => findTyphoonShelterAt(tile.row, tile.col));
      plan.ok = bridge.valid && !shelter;
      plan.reason = shelter ? t('toast.bridgeOverTyphoonShelter') : !bridge.valid ? getBridgeErrorMessage(bridge.reason) : '';
      plan.cost = bridge.cost || 0;
      plan.bridge = true;
    } else {
      plan.tiles = dedupePath(pathInfo.path).filter((tile) => mapData[tile.row][tile.col] !== ROAD && mapData[tile.row][tile.col] !== WATER && canPlaceRoad(scene, tile.row, tile.col));
      plan.cost = plan.tiles.length * COST_ROAD;
      plan.ok = plan.tiles.length > 0;
    }
    identity = pathInfo.path.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool.startsWith('zone-')) {
    const zone = { 'zone-res': ZONE_RES, 'zone-com': ZONE_COM, 'zone-ind': ZONE_IND }[draft.tool];
    const tiles = touchRectTiles(draft.start, draft.end);
    plan.tiles = tiles.filter((tile) => {
      const quote = getZonePlacementQuote(tile.row, tile.col, zone, draft.options.density);
      plan.cost += quote.cost;
      return quote.ok && !quote.noop;
    });
    plan.skipped = tiles.length - plan.tiles.length;
    plan.ok = plan.tiles.length > 0;
    plan.density = Math.min(draft.options.density, getDistrictMaxZoneDensity());
    identity = tiles.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'bulldoze') {
    plan.tiles = draft.options.range ? touchRectTiles(draft.start, draft.end) : [{ row, col }];
    const demolition = getTouchDemolitionPlan(scene, plan.tiles);
    Object.assign(plan, demolition);
    plan.ok = !demolition.reason && demolition.operations.length > 0;
    identity = demolition.affected;
  }
  if (!plan.ok && !plan.reason) plan.reason = t('mobile.nothing');
  if (plan.ok && city.budget < plan.cost) { plan.ok = false; plan.reason = t('toast.notEnoughFunds'); }
  plan.signature = JSON.stringify([draft.tool, draft.start, draft.end, draft.options, plan.cost, plan.tiles, identity]);
  return plan;
}

function commitTouchToolAction(scene, draft, plan) {
  let ok = true;
  const budget = city.budget;
  if (TOUCH_BUILDING_TYPES[draft.tool]) {
    const { row, col } = draft.start;
    ok = draft.tool === 'harbor' ? placeHarborBuilding(scene, row, col)
      : placeInfraBuilding(scene, row, col, TOUCH_BUILDING_TYPES[draft.tool], draft.options.model);
  } else if (draft.tool === 'road') {
    commitRoadDrag(scene, draft.start, draft.end);
  } else if (draft.tool.startsWith('zone-')) {
    const zone = { 'zone-res': ZONE_RES, 'zone-com': ZONE_COM, 'zone-ind': ZONE_IND }[draft.tool];
    for (const { row, col } of plan.tiles) ok = placeZone(scene, row, col, zone, draft.options.density) && ok;
  } else if (draft.tool === 'bulldoze') {
    const previous = selectedTool;
    selectedTool = 'bulldoze';
    try {
      for (const op of plan.operations) {
        if (op.kind === 'pier') demolishFerryPierAt(scene, op.row, op.col, { confirmed: true });
        else if (op.kind === 'floating') demolishTyphoonShelterFloatingRestaurantAt(scene, op.row, op.col, { confirmed: true });
        else if (op.kind === 'promenade') demolishPromenadeAt(scene, op.row, op.col);
        else if (op.kind === 'tunnel') demolishUnderseaTunnelAt(scene, op.row, op.col);
        else if (op.kind === 'metroStation') demolishMetroStationAt(scene, op.row, op.col);
        else applyToolAt(scene, op.row, op.col);
      }
    } finally { selectedTool = previous; }
  }
  updateHUD();
  if (ok) queueCityChangeAutosave();
  return { ok: !!ok, changed: !!ok, cost: budget - city.budget };
}
