// Touch adapters. Preview is read-only; commit uses the existing domain writers.
const TOUCH_BUILDING_TYPES = Object.freeze({
  'power-coal': 'power_plant_coal', 'power-solar': 'power_plant_solar', 'power-nuclear': 'power_plant_nuclear',
  'fire-station': 'fire_station', 'police-station': 'police_station', hospital: 'hospital',
  'primary-school': 'primary_school', 'secondary-school': 'secondary_school',
  'community-college': 'community_college', university: 'university', library: 'library',
  'legislative-council': 'legislative_council', 'stock-exchange': 'stock_exchange',
  ...LANDMARK_TOOL_BUILDING_TYPES,
});
const TOUCH_PHASE_B_TOOLS = Object.freeze(['road', 'zone-res', 'zone-com', 'zone-ind', 'bulldoze', 'inspect', ...Object.keys(TOUCH_BUILDING_TYPES)]);
const TOUCH_BUS_TOOLS = Object.freeze(['bus-stop', 'bus-depot']);
const TOUCH_DAILY_TOOLS = Object.freeze(['power-line', 'tree', 'dezone', 'park', 'sports-ground', 'district-sign']);
// C3: rail/ferry/tunnel point-and-drag builders, reusing the same build-session draft the P/D/T
// tools above already use; the bus-style funding display (tool-actions.js funding block below)
// widens to cover the company-funded ones.
// (輕鐵 too - Norton, 2026-11-22: 屯門沒有輕鐵，只有電車; it came after the phone's tools and was left off)
const TOUCH_RAIL_TOOLS = Object.freeze(['metro-track', 'metro-station', 'metro-surface-station', 'tram-track', 'tram-stop',
  'light-rail-track', 'light-rail-station', 'ferry-pier']);
// 海底隧道 (city budget, like road), 避風塘/地形/海濱步道 (rectangle paint) and 海鮮舫 (point placement
// with a pre-placement rotate option, same shape as the bus depot's rotate-entrance button).
const TOUCH_TERRAIN_MARINE_TOOLS = Object.freeze(['undersea-tunnel', 'typhoon-shelter', 'terrain', 'promenade', 'floating-restaurant']);
const TOUCH_SUPPORTED_TOOLS = Object.freeze([...TOUCH_PHASE_B_TOOLS, ...TOUCH_BUS_TOOLS, ...TOUCH_DAILY_TOOLS, ...TOUCH_RAIL_TOOLS, ...TOUCH_TERRAIN_MARINE_TOOLS]);
// 地鐵綫／電車綫／渡輪航線 (S: tap station after station) commit per tap on the existing desktop
// writer, like a toast-driven click - they never go through build-session (mobile-ui.js).
const MOBILE_DIRECT_TAP_TOOLS = Object.freeze(['metro-line', 'tram-line', 'light-rail-line', 'ferry-route']);
const touchObjectIds = new WeakMap();
let nextTouchObjectId = 1;
function touchObjectIdentity(record) {
  if (!record || typeof record !== 'object') return 0;
  if (!touchObjectIds.has(record)) touchObjectIds.set(record, nextTouchObjectId++);
  return touchObjectIds.get(record);
}

function getTouchToolOptions(tool) {
  if (tool === 'bus-stop') return { stopSide: 'both' };
  if (tool === 'bus-depot') return { depotSide: getBusDepotRawSideForCorner('ll') };
  if (tool === 'park' || tool === 'sports-ground') return { variant: getTouchRecreationOptions(tool)[0].id };
  if (tool === 'district-sign') return { name: '', englishName: '' };
  if (tool === 'metro-track') return { height: typeof metroRailHeight !== 'undefined' ? metroRailHeight : 'ground' };
  if (tool === 'light-rail-track') return { height: typeof lightRailHeight !== 'undefined' ? lightRailHeight : 'ground' };
  if (tool === 'road') return { bridge: typeof roadBridgeStyle !== 'undefined' ? roadBridgeStyle : 'ground' };
  if (tool === 'typhoon-shelter') return { subtract: false };
  if (tool === 'terrain') return { terrainType: typeof selectedTerrainType !== 'undefined' ? selectedTerrainType : 'grass' };
  if (tool === 'floating-restaurant') {
    return { turn: typeof typhoonShelterFloatingRestaurantTurn !== 'undefined' ? typhoonShelterFloatingRestaurantTurn : 'cols' };
  }
  const type = TOUCH_BUILDING_TYPES[tool];
  const model = type === HARBOR_BUILDING_TYPE ? HARBOR_MODELS[Object.keys(HARBOR_MODELS)[0]]
    : type ? selectInfraPlacementModel(type) : null;
  // 公屋／居屋 (housing-types.js): the residential tool starts on the type last picked, at the density it allows
  if (tool === 'zone-res') {
    const housingType = typeof getSelectedHousingType === 'function' ? getSelectedHousingType() : 'private';
    const density = typeof getHousingZoneDensity === 'function' ? getHousingZoneDensity(DENSITY_LOW, housingType) : DENSITY_LOW;
    return { density, housingType, range: true, model: null };
  }
  if (tool === 'zone-ind') return { density: selectedZoneDensity.ind ?? DENSITY_LOW, industrialType: getSelectedIndustrialType(), range: true, model: null };
  // (the bulldozer's 地底: whether it digs for 地鐵 tunnels, under what stands on the ground)
  if (tool === 'bulldoze') return { density: DENSITY_LOW, range: false, underground: false, model: null };
  return { density: DENSITY_LOW, range: true, model: model ? { ...model } : null };
}

function getTouchRecreationOptions(tool) {
  return tool === 'park' ? PARK_OPTIONS : tool === 'sports-ground' ? SPORT_GROUND_OPTIONS : [];
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
    typeof getIndustrialZoneType === 'function' ? getIndustrialZoneType(row, col) : 'regular',
    sprite?.mapRow, sprite?.mapCol, touchObjectIdentity(record), record?.type, record?.spriteKey, record?.customName,
    !!scene.treeSprites?.has(getTileId(row, col)), !!scene.debrisSprites?.has(getTileId(row, col)),
    typeof getBusStopSides === 'function' ? getBusStopSides(row, col) : null,
    typeof hasDistrictSignAt === 'function' && hasDistrictSignAt(row, col),
    typeof powerLineSet !== 'undefined' && powerLineSet.has(getTileId(row, col)),
    typeof treeMap !== 'undefined' ? touchObjectIdentity(treeMap.get(getTileId(row, col))) : 0];
}

function getTouchDemolitionPlan(scene, tiles, options = {}) {
  const operations = [];
  const seen = new Set();
  const buildings = new Set();
  const affected = [];
  const summary = { buildings: 0, roads: 0, rail: 0, empty: 0, facilities: 0, routes: 0 };
  let reason = '';
  for (const { row, col } of tiles) {
    const id = getTileId(row, col);
    affected.push(touchTileIdentity(scene, row, col));
    // (a stop or a station is a facility; track counts by its tiles)
    const add = (kind, key, object, extra = {}, tally = 'facilities', count = 1) => {
      if (seen.has(`${kind}:${key}`)) return;
      seen.add(`${kind}:${key}`);
      operations.push({ kind, row, col, key, ...extra });
      affected.push([kind, key, object]);
      summary[tally] += count;
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
    // a 天橋 / 懸索橋 tile comes down before any track under it (main.js applyToolAt does the same)
    if (typeof isHighBridgeTile === 'function' && isHighBridgeTile(row, col)) {
      summary.roads++;
      operations.push({ kind: 'tile', row, col, cost: COST_BULLDOZE });
      continue;
    }
    const station = getMetroStationAt(row, col);
    if (station) {
      if (getMetroStationLine(station, getMetroState())) reason = t('metro.station.onLine', { name: station.name });
      add('metroStation', station.id, [station.id, station.name, getMetroStationLines(station).map((line) => line.id)]);
      continue;
    }
    // Rail comes up as the desktop bulldozer takes it (main.js): one layer a pass - a stop or a station
    // before its track, the track before the road under it - and free. 地鐵路軌 goes a viaduct tile alone
    // or a portal or hill run whole, never from under a station or a surface line, and a tunnel only in
    // the 地底 view (metro-surface.js). Norton, 2026-11-22: 手機版路軌不能拆除.
    const metroTrack = typeof getMetroTrackDemolition === 'function' ? getMetroTrackDemolition(row, col, options.underground === true) : null;
    if (metroTrack) {
      if (metroTrack.code) reason = t(`metro.track.${metroTrack.code}`);
      const run = metroTrack.run.slice().sort();
      add('metroTrack', run[0], run, {}, 'rail', run.length);
      continue;
    }
    const tramStop = getTramStopAt(row, col);
    if (tramStop) { add('tramStop', tramStop.id, [tramStop.id, tramStop.row, tramStop.col]); continue; }
    if (getTramState().tracks[`${row}:${col}`]) { add('tramTrack', id, getTramState().tracks[`${row}:${col}`], {}, 'rail'); continue; }
    const lightRailStation = typeof getLightRailStationAt === 'function' ? getLightRailStationAt(row, col) : null;
    if (lightRailStation) { add('lightRailStation', lightRailStation.id, [lightRailStation.id, lightRailStation.row, lightRailStation.col]); continue; }
    const lightRailTrack = typeof getLightRailState === 'function' ? getLightRailState().tracks?.[`${row}:${col}`] : null;
    if (lightRailTrack) { add('lightRailTrack', id, lightRailTrack, {}, 'rail'); continue; }
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
  // a tram or light rail line left with fewer than two stops closes with them (tram-lines.js
  // removeTramStop, light-rail-lines.js removeLightRailStation)
  const closing = (lines, stopsOf, kind) => {
    const gone = new Set(operations.filter((op) => op.kind === kind).map((op) => op.key));
    return gone.size ? (lines || []).filter((line) => stopsOf(line).some((stop) => gone.has(stop))
      && stopsOf(line).filter((stop) => !gone.has(stop)).length < 2).length : 0;
  };
  summary.routes += closing(getTramState().lines, (line) => line.stopIds || [], 'tramStop');
  if (typeof getLightRailState === 'function') summary.routes += closing(getLightRailState().lines, (line) => line.stationIds || [], 'lightRailStation');
  return { operations, summary, affected, reason, cost: operations.reduce((total, op) => total + (op.cost || 0), 0) };
}

function previewTouchToolAction(scene, draft) {
  const plan = { ok: false, reason: '', cost: 0, tiles: [], kind: draft.tool, signature: '' };
  if (!TOUCH_SUPPORTED_TOOLS.includes(draft.tool)) return { ...plan, reason: t('mobile.phaseC') };
  if (!draft.start || !draft.end) return plan;
  if (![draft.start, draft.end].every(({ row, col }) => isInsideMap(row, col))) return { ...plan, reason: t('mobile.outside') };
  if (isTerrainCreatorMode) return { ...plan, reason: t('mobile.phaseC') };
  const { row, col } = draft.start;
  let identity = [];
  if (draft.tool === 'park' || draft.tool === 'sports-ground') {
    const option = getTouchRecreationOptions(draft.tool).find((entry) => entry.id === draft.options.variant);
    if (!option) return { ...plan, reason: t('mobile.blocked') };
    Object.assign(plan, draft.tool === 'park' ? getParkPlacementQuote(row, col, option) : getSportsGroundPlacementQuote(row, col, option));
    plan.option = { ...option };
    plan.tiles = getFootprintTiles(row, col, plan.footprintCols, plan.footprintRows).map(([r, c]) => ({ row: r, col: c }));
    identity = plan.tiles.filter((tile) => isInsideMap(tile.row, tile.col)).map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'district-sign') {
    Object.assign(plan, getDistrictSignPlacementQuote(scene, row, col, draft.options));
    plan.tiles = [{ row, col }];
    identity = [touchTileIdentity(scene, row, col), getDistrictSigns().map((sign) => [sign.id, sign.name, sign.row, sign.col])];
  } else if (['power-line', 'tree', 'dezone'].includes(draft.tool)) {
    const tiles = draft.tool === 'power-line' ? getStraightDragPath(draft.start, draft.end).path : touchRectTiles(draft.start, draft.end);
    plan.tiles = tiles.filter((tile) => {
      if (draft.tool === 'power-line') {
        const quote = getPowerLinePlacementQuote(tile.row, tile.col);
        return quote.ok && !quote.noop;
      }
      return draft.tool === 'tree' ? canPlantTreeAt(scene, tile.row, tile.col) : zoneMap[tile.row][tile.col] !== ZONE_NONE;
    });
    plan.cost = plan.tiles.length * (draft.tool === 'power-line' ? COST_POWER_LINE : draft.tool === 'tree' ? COST_TREE : 0);
    plan.ok = plan.tiles.length > 0;
    plan.skipped = tiles.length - plan.tiles.length;
    if (draft.tool === 'dezone') {
      const buildings = plan.tiles.map((tile) => scene.buildingSprites?.get(getTileId(tile.row, tile.col)))
        .filter(Boolean);
      plan.keptBuildings = new Set(buildings).size;
    }
    if (draft.tool === 'power-line') plan.clearedTrees = plan.tiles.filter((tile) => treeMap.get(getTileId(tile.row, tile.col))).length;
    identity = tiles.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'bus-stop') {
    const eligible = getBusStopEligibleSides(row, col) || [];
    const mode = draft.options.stopSide;
    if (!['first', 'second', 'both'].includes(mode)) return { ...plan, reason: t('toast.busStopBlocked') };
    const sides = mode === 'both' ? eligible : eligible.slice(mode === 'second' ? 1 : 0, mode === 'second' ? 2 : 1);
    Object.assign(plan, getBusStopPlacementQuote(row, col, sides));
    plan.tiles = [{ row, col }];
    identity = [touchTileIdentity(scene, row, col), eligible];
  } else if (draft.tool === 'bus-depot') {
    Object.assign(plan, getBusDepotPlacementQuote(scene, row, col, draft.options.depotSide));
    plan.tiles = getFootprintTiles(plan.row, plan.col, plan.footprintCols, plan.footprintRows).map(([r, c]) => ({ row: r, col: c }));
    identity = [plan.previousSide, plan.frontage, plan.fleet, ...plan.tiles.filter((tile) => isInsideMap(tile.row, tile.col)).map((tile) => touchTileIdentity(scene, tile.row, tile.col))];
  } else if (draft.tool === 'metro-station') {
    if (!isMetroUnlocked()) {
      plan.reason = metroT(...METRO_REFUSALS.locked);
    } else {
      const res = whyNotMetroStationAt(row, col, getMetroStationContext());
      if (res.code) plan.reason = metroT(...METRO_REFUSALS[res.code]);
      else { plan.ok = true; plan.cost = METRO.stationCost; plan.tiles = [{ row, col }]; }
    }
    identity = [touchTileIdentity(scene, row, col)];
  } else if (draft.tool === 'metro-surface-station') {
    const why = whyNotMetroSurfaceStation(row, col);
    if (why) {
      plan.reason = why;
    } else {
      const level = (getMetroState().trackElev || {})[`${row}:${col}`];
      plan.ok = true;
      plan.cost = level === 'u' ? METRO_SURFACE.undergroundStationCost : METRO_SURFACE.stationCost;
      plan.tiles = [{ row, col }];
    }
    identity = [touchTileIdentity(scene, row, col), getMetroTrackBits()[`${row}:${col}`], (getMetroState().trackElev || {})[`${row}:${col}`]];
  } else if (draft.tool === 'metro-track') {
    const trackPlan = planMetroTrack(draft.start, draft.end, draft.options.height);
    if (!trackPlan.ok) {
      plan.reason = metroTrackRefusal(trackPlan.reason);
    } else {
      plan.ok = true;
      plan.cost = trackPlan.cost;
      plan.tiles = trackPlan.path.map(({ row: r, col: c }) => ({ row: r, col: c }));
      plan.kinds = trackPlan.kinds;
    }
    identity = (trackPlan.path || []).map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'tram-stop') {
    const res = whyNotTramStopAt(row, col, tramStopContext());
    if (!res.code && !tramStopLinkIsPlain(getTramTrackGeometry(), res.site)) res.code = 'notStraight';
    if (res.code) {
      plan.reason = tramT(...TRAM_STOP_REFUSALS[res.code]);
    } else {
      plan.ok = true;
      plan.cost = TRAM_SERVICE.stopCost;
      plan.tiles = [{ row, col }];
    }
    identity = [touchTileIdentity(scene, row, col), res.site];
  } else if (draft.tool === 'tram-track') {
    const trackPlan = planTramTrack(draft.start, draft.end);
    if (!trackPlan.ok) {
      plan.reason = trackPlan.reason === 'notRoad' ? tramT('tram.track.notRoad', '電車路軌要鋪喺馬路上（唔可以喺橋、斜路或者隧道口）。') : t('mobile.nothing');
    } else {
      plan.ok = true;
      plan.cost = trackPlan.cost;
      plan.tiles = [...trackPlan.adds, ...trackPlan.removes].map(({ row: r, col: c }) => ({ row: r, col: c }));
    }
    identity = trackPlan.path.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'light-rail-station') {
    // (as placeLightRailStation: light-rail-lines.js)
    const res = whyNotLightRailStationAt(row, col, getLightRailState(), lightRailMapEnv());
    if (!res.code && res.site.street && !tramStopLinkIsPlain(getLightRailGeometry(), lrtStationStop(res.site))) res.code = 'notStraight';
    if (!isTransportExpansionActive()) plan.reason = lightRailTrackRefusal('company');
    else if (!isLightRailUnlocked()) plan.reason = lightRailTrackRefusal('locked');
    else if (res.code) plan.reason = lightRailT(...LIGHT_RAIL_STATION_REFUSALS[res.code]);
    else {
      plan.ok = true;
      plan.cost = LIGHT_RAIL_SERVICE.stationCost;
      plan.tiles = lightRailStationTiles(res.site).map(([r, c]) => ({ row: r, col: c }));
    }
    identity = [touchTileIdentity(scene, row, col), res.site, getLightRailState().tracks[`${row}:${col}`]];
  } else if (draft.tool === 'light-rail-track') {
    const trackPlan = planLightRailTrack(draft.start, draft.end, draft.options.height);
    if (!trackPlan.ok) {
      plan.reason = lightRailTrackRefusal(trackPlan.reason);
    } else {
      plan.ok = true;
      plan.cost = trackPlan.cost;
      plan.tiles = (trackPlan.path || []).map(({ row: r, col: c }) => ({ row: r, col: c }));
      plan.kinds = trackPlan.kinds;
    }
    identity = (trackPlan.path || []).map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'ferry-pier') {
    const res = whyNotFerryPierAt(row, col, getFerryPierContext());
    if (res.code) {
      plan.reason = ferryT(...FERRY_REFUSALS[res.code]);
    } else {
      plan.ok = true;
      plan.cost = FERRY.pierCost;
      plan.tiles = getFootprintTiles(row, col, FERRY.pierCols, FERRY.pierRows).map(([r, c]) => ({ row: r, col: c }));
    }
    identity = plan.tiles.length ? plan.tiles.map((tile) => touchTileIdentity(scene, tile.row, tile.col)) : [touchTileIdentity(scene, row, col)];
  } else if (draft.tool === 'undersea-tunnel') {
    const crossing = getUnderseaTunnelCrossing(draft.start, draft.end);
    if (!crossing.site) {
      plan.reason = t(crossing.reason);
    } else {
      plan.ok = true;
      plan.cost = crossing.site.cost;
      plan.tiles = [...crossing.site.under, ...crossing.site.portals.flatMap((p) => p.tiles)].map(([r, c]) => ({ row: r, col: c }));
    }
    identity = plan.tiles.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'typhoon-shelter') {
    const result = computeTyphoonShelterDrag(draft.start, draft.end, !!draft.options.subtract);
    if (result.rejected) {
      plan.reason = result.rejected;
    } else {
      plan.ok = true;
      plan.cost = result.bill ? result.bill.cost : 0;
      plan.tiles = typhoonShelterRectTiles(result.rect.r0, result.rect.c0, result.rect.r1, result.rect.c1)
        .map((k) => k.split(':').map(Number)).map(([r, c]) => ({ row: r, col: c }));
      plan.shelterPlan = result.plan;
      plan.shelterAnalysis = result.analysis;
    }
    identity = [result.targetId, !!draft.options.subtract, result.plan ? [...(result.plan.basin || [])] : null];
  } else if (draft.tool === 'terrain') {
    const tiles = touchRectTiles(draft.start, draft.end).filter((tile) => isInsideMap(tile.row, tile.col));
    plan.tiles = tiles;
    plan.ok = tiles.length > 0;
    plan.cost = 0;
    plan.terrainType = draft.options.terrainType;
    identity = tiles.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'promenade') {
    const tiles = touchRectTiles(draft.start, draft.end);
    const singleExisting = draft.start.row === draft.end.row && draft.start.col === draft.end.col && isPromenadeTile(row, col);
    if (singleExisting) {
      plan.ok = true;
      plan.cost = 0;
      plan.tiles = [{ row, col }];
      plan.pierToggle = true;
    } else {
      plan.tiles = tiles.filter((tile) => isInsideMap(tile.row, tile.col) && !whyNotPromenadeAt(tile.row, tile.col));
      plan.cost = plan.tiles.length * PROMENADE.cost;
      plan.ok = plan.tiles.length > 0;
      plan.skipped = tiles.length - plan.tiles.length;
    }
    identity = tiles.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'floating-restaurant') {
    if (typeof typhoonShelterFloatingRestaurantTurn !== 'undefined') typhoonShelterFloatingRestaurantTurn = draft.options.turn;
    const placement = getTyphoonShelterFloatingRestaurantPlacement(row, col);
    if (placement.why) {
      plan.reason = tsFisheryT(...placement.why);
    } else {
      plan.ok = true;
      plan.cost = TYPHOON_SHELTER_FACILITIES.floatingRestaurant.cost;
      plan.tiles = getFootprintTiles(placement.site.row, placement.site.col, placement.site.cols, placement.site.rows).map(([r, c]) => ({ row: r, col: c }));
    }
    identity = [draft.options.turn, ...plan.tiles.filter((tile) => isInsideMap(tile.row, tile.col)).map((tile) => touchTileIdentity(scene, tile.row, tile.col))];
  } else if (TOUCH_BUILDING_TYPES[draft.tool]) {
    const type = TOUCH_BUILDING_TYPES[draft.tool];
    Object.assign(plan, getInfraPlacementQuote(row, col, type, draft.options.model));
    plan.tiles = getFootprintTiles(row, col, plan.footprintCols || 1, plan.footprintRows || 1).map(([r, c]) => ({ row: r, col: c }));
    identity = plan.tiles.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool === 'road') {
    const pathInfo = getStraightDragPath(draft.start, draft.end);
    const bridge = analyzeBridgePath(scene, pathInfo);
    const style = draft.options?.bridge || 'ground';
    plan.tiles = pathInfo.path;
    if (style !== 'ground' && typeof planHighBridge === 'function') {
      // 天橋 / 懸索橋 (road-flyovers.js)
      const high = planHighBridge(scene, pathInfo, style);
      plan.ok = high.ok;
      plan.reason = high.ok ? '' : highBridgeRefusal(high.reason);
      plan.cost = high.cost || 0;
      plan.bridge = true;
    } else if (bridge.crossesWater) {
      const shelter = pathInfo.path.some((tile) => findTyphoonShelterAt(tile.row, tile.col));
      plan.ok = bridge.valid && !shelter;
      plan.reason = shelter ? t('toast.bridgeOverTyphoonShelter') : !bridge.valid ? getBridgeErrorMessage(bridge.reason) : '';
      plan.cost = bridge.cost || 0;
      plan.bridge = true;
    } else {
      plan.tiles = dedupePath(pathInfo.path).filter((tile) => mapData[tile.row][tile.col] !== ROAD && mapData[tile.row][tile.col] !== WATER && canPlaceRoad(scene, tile.row, tile.col, { acrossLightRail: true }));
      plan.cost = plan.tiles.length * COST_ROAD;
      plan.ok = plan.tiles.length > 0;
      // (over 輕鐵 track only as level crossings: light-rail.js)
      const lightRailWhy = plan.ok && typeof whyNotRoadAcrossLightRail === 'function' ? whyNotRoadAcrossLightRail(plan.tiles) : null;
      if (lightRailWhy) { plan.ok = false; plan.reason = lightRailWhy; }
    }
    identity = pathInfo.path.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
  } else if (draft.tool.startsWith('zone-')) {
    const zone = { 'zone-res': ZONE_RES, 'zone-com': ZONE_COM, 'zone-ind': ZONE_IND }[draft.tool];
    const tiles = touchRectTiles(draft.start, draft.end);
    plan.tiles = tiles.filter((tile) => {
      const quote = getZonePlacementQuote(tile.row, tile.col, zone, draft.options.density, draft.options.housingType, draft.options.industrialType);
      plan.cost += quote.cost;
      return quote.ok && !quote.noop;
    });
    plan.skipped = tiles.length - plan.tiles.length;
    plan.ok = plan.tiles.length > 0;
    plan.density = Math.min(draft.options.density, getDistrictMaxZoneDensity());
    identity = tiles.map((tile) => touchTileIdentity(scene, tile.row, tile.col));
    // 公屋／居屋: the estate it would plan, in a line (housing-estates.js)
    const housingType = draft.tool === 'zone-res' && typeof getAvailableHousingType === 'function' ? getAvailableHousingType(draft.options.housingType) : 'private';
    if (plan.ok && housingType !== 'private' && typeof housingEstateSummaryForRect === 'function') {
      const estate = housingEstateSummaryForRect(draft.start.row, draft.start.col, draft.end.row, draft.end.col, housingType,
        getHousingZoneDensity(draft.options.density, housingType));
      plan.estateSummary = estate.hint ? `${estate.text} ${estate.hint}` : estate.text;
    }
  } else if (draft.tool === 'bulldoze') {
    plan.tiles = draft.options.range ? touchRectTiles(draft.start, draft.end) : [{ row, col }];
    const demolition = getTouchDemolitionPlan(scene, plan.tiles, draft.options);
    Object.assign(plan, demolition);
    plan.ok = !demolition.reason && demolition.operations.length > 0;
    identity = demolition.affected;
  }
  if (!plan.ok && !plan.reason) plan.reason = t('mobile.nothing');
  if (TOUCH_BUS_TOOLS.includes(draft.tool) || draft.tool === 'ferry-pier') plan.funding = getTransportConstructionFunds();
  if (['metro-track', 'metro-station', 'metro-surface-station'].includes(draft.tool)) {
    const base = getTransportConstructionFunds();
    plan.funding = { payer: base.payer, balance: getMetroState().grantBalance + base.balance };
  }
  // (the council's light rail grant first, then the company: light-rail.js spendLightRailFunds)
  if (['light-rail-track', 'light-rail-station'].includes(draft.tool)) {
    const base = getTransportConstructionFunds();
    plan.funding = { payer: base.payer, balance: getLightRailState().grantBalance + base.balance };
  }
  if (['tram-track', 'tram-stop'].includes(draft.tool)) {
    plan.funding = { payer: 'company', balance: getTransportExpansionState().company.cash };
    if (plan.ok && !isTransportExpansionActive()) {
      plan.ok = false;
      plan.reason = tramT('tram.companyClosed', '要先開辦運輸公司，電車由公司出錢起。');
    }
  }
  if (plan.ok && plan.cost > 0 && (plan.funding?.balance ?? city.budget) < plan.cost) {
    plan.ok = false;
    plan.reason = plan.funding?.payer === 'company' ? t('mobile.companyFundsLow') : t('toast.notEnoughFunds');
  }
  if (plan.ok && typeof isWorldGameActive === 'function' && isWorldGameActive() && plan.tiles.some(({row,col})=>(!shouldRenderWorldTile(row,col) || !globalThis.__worldGameHost.hasTerrainTile(row,col)))) { plan.ok=false;plan.reason=t('toast.stillLoading'); }
  plan.signature = JSON.stringify([draft.tool, draft.start, draft.end, draft.options, plan.cost, plan.tiles, plan.funding?.payer, plan.spriteKey, identity]);
  return plan;
}

function commitTouchToolAction(scene, draft, plan) {
  if (typeof isWorldGameActive === 'function' && isWorldGameActive() && plan.tiles.some(({row,col})=>(!shouldRenderWorldTile(row,col) || !globalThis.__worldGameHost.hasTerrainTile(row,col)))) return {ok:false,changed:false,cost:0,reason:'loading'};
  let ok = true;
  const budget = plan.funding ? getTransportConstructionFunds().balance : city.budget;
  if (draft.tool === 'park' || draft.tool === 'sports-ground') {
    ok = draft.tool === 'park' ? placePark(scene, draft.start.row, draft.start.col, plan.option)
      : placeSportsGround(scene, draft.start.row, draft.start.col, plan.option);
  } else if (draft.tool === 'district-sign') {
    ok = placeDistrictSignWithNames(scene, draft.start.row, draft.start.col, plan);
  } else if (['power-line', 'tree', 'dezone'].includes(draft.tool)) {
    for (const { row, col } of plan.tiles) ok = (draft.tool === 'power-line' ? placePowerLine(scene, row, col)
      : draft.tool === 'tree' ? plantTreeWithTool(scene, row, col) : dezoneAt(scene, row, col)) && ok;
    if (draft.tool === 'power-line' && typeof updatePowerGrid === 'function') updatePowerGrid(scene);
  } else if (draft.tool === 'bus-stop') {
    ok = placeBusStop(scene, draft.start.row, draft.start.col, { sides: plan.sides });
  } else if (draft.tool === 'bus-depot') {
    ok = placeBusDepotBuilding(scene, draft.start.row, draft.start.col, { rawSide: plan.rawSide });
  } else if (draft.tool === 'metro-station') {
    ok = placeMetroStation(scene, draft.start.row, draft.start.col);
  } else if (draft.tool === 'metro-surface-station') {
    ok = placeMetroSurfaceStation(scene, draft.start.row, draft.start.col);
  } else if (draft.tool === 'metro-track') {
    ok = commitMetroTrackDrag(scene, draft.start, draft.end, draft.options.height);
  } else if (draft.tool === 'tram-stop') {
    ok = !!placeTramStop(scene, draft.start.row, draft.start.col);
  } else if (draft.tool === 'tram-track') {
    ok = commitTramTrackDrag(scene, draft.start, draft.end);
  } else if (draft.tool === 'light-rail-track') {
    ok = commitLightRailTrackDrag(scene, draft.start, draft.end, draft.options.height);
  } else if (draft.tool === 'light-rail-station') {
    ok = placeLightRailStation(scene, draft.start.row, draft.start.col);
  } else if (draft.tool === 'ferry-pier') {
    ok = placeFerryPier(scene, draft.start.row, draft.start.col);
  } else if (draft.tool === 'undersea-tunnel') {
    ok = placeUnderseaTunnel(scene, draft.start, draft.end);
  } else if (draft.tool === 'typhoon-shelter') {
    ok = commitTyphoonShelterPlan(scene, plan.shelterPlan, plan.shelterAnalysis);
    // a basin only plans the shelter: its panel (開展工程, 擴建, 刪除) follows, as it does on the desktop -
    // the touch UI never opened it, so a phone could plan a shelter but never build one (v6.0.3,
    // Norton: 手機版個避風頭確認唔到)
    if (ok && typeof document !== 'undefined' && typeof showTyphoonShelterPanel === 'function') {
      showTyphoonShelterPanel(true);
      if (typeof redrawTyphoonShelterPlanning === 'function') redrawTyphoonShelterPlanning(scene, { force: true });
    }
  } else if (draft.tool === 'terrain') {
    for (const { row, col } of plan.tiles) {
      if (plan.terrainType === 'raise') applyRaiseTerrain(scene, row, col, TERRAIN_RAISE_BLOCK_RADIUS);
      else if (plan.terrainType === 'lower') applyLowerTerrain(scene, row, col, TERRAIN_RAISE_BLOCK_RADIUS);
      else if (plan.terrainType === 'flatten') applyFlattenTerrain(scene, row, col, TERRAIN_RAISE_BLOCK_RADIUS);
      else setTileType(scene, row, col, TOOL_TERRAIN[plan.terrainType]);
    }
  } else if (draft.tool === 'promenade') {
    ok = plan.pierToggle ? togglePromenadePierAt(scene, draft.start.row, draft.start.col)
      : plan.tiles.reduce((all, { row, col }) => placePromenade(scene, row, col, { quiet: true }) && all, true);
  } else if (draft.tool === 'floating-restaurant') {
    if (typeof typhoonShelterFloatingRestaurantTurn !== 'undefined') typhoonShelterFloatingRestaurantTurn = draft.options.turn;
    ok = placeTyphoonShelterFloatingRestaurant(scene, draft.start.row, draft.start.col);
  } else if (TOUCH_BUILDING_TYPES[draft.tool]) {
    const { row, col } = draft.start;
    ok = draft.tool === 'harbor' ? placeHarborBuilding(scene, row, col)
      : placeInfraBuilding(scene, row, col, TOUCH_BUILDING_TYPES[draft.tool], draft.options.model);
  } else if (draft.tool === 'road') {
    commitRoadDrag(scene, draft.start, draft.end, draft.options?.bridge || 'ground');
  } else if (draft.tool.startsWith('zone-')) {
    const zone = { 'zone-res': ZONE_RES, 'zone-com': ZONE_COM, 'zone-ind': ZONE_IND }[draft.tool];
    for (const { row, col } of plan.tiles) ok = placeZone(scene, row, col, zone, draft.options.density, draft.options.housingType, draft.options.industrialType) && ok;
    // 公屋／居屋: the rectangle just zoned is one estate, planned whole (housing-estates.js)
    const housingType = draft.tool === 'zone-res' && typeof getAvailableHousingType === 'function' ? getAvailableHousingType(draft.options.housingType) : 'private';
    if (housingType !== 'private' && typeof createHousingEstateFromZoning === 'function') {
      createHousingEstateFromZoning(scene, draft.start.row, draft.start.col, draft.end.row, draft.end.col, housingType);
    }
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
        // (each by its own call: a track already gone - a tram's partner across the reservation, a run
        // taken whole from another of its tiles - is no excuse to knock down the road under it)
        else if (op.kind === 'metroTrack') demolishMetroTrackAt(scene, op.row, op.col, { underground: draft.options.underground === true });
        else if (op.kind === 'tramStop') demolishTramStopAt(scene, op.row, op.col);
        else if (op.kind === 'tramTrack') demolishTramTrackAt(scene, op.row, op.col);
        else if (op.kind === 'lightRailStation') demolishLightRailStationAt(scene, op.row, op.col);
        else if (op.kind === 'lightRailTrack') demolishLightRailTrackAt(scene, op.row, op.col);
        else applyToolAt(scene, op.row, op.col);
      }
    } finally { selectedTool = previous; }
  }
  updateHUD();
  if (ok) queueCityChangeAutosave();
  return { ok: !!ok, changed: !!ok, cost: budget - (plan.funding ? getTransportConstructionFunds().balance : city.budget) };
}
