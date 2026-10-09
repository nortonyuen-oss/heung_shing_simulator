// Placement previews: the hover highlights, zone drag rectangle, building footprint guide
// and road drag preview drawn while a tool is in use. Split out of main.js.

// ── Inspect-mode hover highlight (single red isometric diamond) ───────────────

function drawInspectHighlight(scene, row, col) {
  const g = scene.inspectHighlightGraphic;
  if (!g) return;
  g.clear();
  const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
  const top = geom.top;
  const right = geom.right;
  const bot = geom.bottom;
  const left = geom.left;
  g.fillStyle(0xff2222, 0.22);
  g.lineStyle(2, 0xff5555, 0.95);
  g.beginPath();
  g.moveTo(top.x,   top.y);
  g.lineTo(right.x, right.y);
  g.lineTo(bot.x,   bot.y);
  g.lineTo(left.x,  left.y);
  g.closePath();
  g.fillPath();
  g.strokePath();
}

// ── Bus-stop hover highlight (green = placeable, red = blocked) ───────────────

function drawBusStopHighlight(scene, row, col) {
  const g = scene.busStopHighlightGraphic;
  if (!g) return;
  g.clear();
  const canPlace = Boolean(getBusStopEligibleSides(row, col));
  const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
  const color = canPlace ? 0x22c78a : 0xff4d4d;
  g.fillStyle(color, 0.22);
  g.lineStyle(2, color, 0.95);
  g.beginPath();
  g.moveTo(geom.top.x, geom.top.y);
  g.lineTo(geom.right.x, geom.right.y);
  g.lineTo(geom.bottom.x, geom.bottom.y);
  g.lineTo(geom.left.x, geom.left.y);
  g.closePath();
  g.fillPath();
  g.strokePath();
}

// ── Zone selection preview (coloured ISO rect during drag) ────────────────────

// Draw an isometric diamond outline showing the zone rectangle selection.
// The four apexes of the selection are the outer vertices of the four corner tiles.
function drawZoneSelectionPreview(scene, start, end) {
  const g = scene.zonePreviewGraphic;
  if (!g) return;
  g.clear();

  const r1 = Math.min(start.row, end.row);
  const r2 = Math.max(start.row, end.row);
  const c1 = Math.min(start.col, end.col);
  const c2 = Math.max(start.col, end.col);

  const ox = scene.offsetX, oy = scene.offsetY;
  const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
  const vertices = [];

  // Build the selection from the actual screen-space diamond vertices of every
  // selected tile. This keeps the preview aligned after map rotation.
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      vertices.push(...getTileFaceVertices(r, c, ox, oy, hw, hh));
    }
  }

  let north = vertices[0], east = vertices[0], south = vertices[0], west = vertices[0];
  vertices.forEach((pt) => {
    if (pt.y < north.y) north = pt;
    if (pt.x > east.x) east = pt;
    if (pt.y > south.y) south = pt;
    if (pt.x < west.x) west = pt;
  });

  const color = selectedTool === 'zone-res' ? 0x44ff66
              : selectedTool === 'zone-com' ? 0x4499ff
              : 0xffcc00;

  g.fillStyle(color, 0.18);
  g.lineStyle(2, color, 0.95);

  g.beginPath();
  g.moveTo(north.x, north.y);
  g.lineTo(east.x,  east.y);
  g.lineTo(south.x, south.y);
  g.lineTo(west.x,  west.y);
  g.closePath();
  g.fillPath();
  g.strokePath();
}

function updateBuildingPlacementGuide(scene, pointer) {
  const g = scene.buildingGuideGraphic;
  if (!g) return;
  g.clear();

  if (!shouldShowBuildingPlacementGuide(pointer)) return;

  const tile = pointerToTile(scene, pointer);
  const footprint = getSelectedPlacementFootprint();
  if (!tile || !footprint) return;

  if (selectedTool === 'district-sign' && typeof drawDistrictRadiusGuide === 'function') {
    drawDistrictRadiusGuide(scene, tile.row, tile.col, canPlaceDistrictSign(scene, tile.row, tile.col));
    return;
  }

  const { footprintCols, footprintRows } = footprint;
  // 海鮮舫: green on the 4 x 3 it would moor on (it fits itself round the pointer), red where it may not
  if (selectedTool === 'floating-restaurant' && typeof getTyphoonShelterFloatingRestaurantPlacement === 'function') {
    const { site } = getTyphoonShelterFloatingRestaurantPlacement(tile.row, tile.col);
    if (site) drawFootprintGuide(scene, site.row, site.col, site.cols, site.rows, true);
    else drawFootprintGuide(scene, tile.row - Math.floor(footprintRows / 2), tile.col - Math.floor(footprintCols / 2), footprintCols, footprintRows, false);
    return;
  }
  const canPlace = selectedTool === 'harbor' && typeof canPlaceHarborFootprint === 'function'
    ? canPlaceHarborFootprint(tile.row, tile.col)
    : selectedTool === 'bus-depot'
      ? canPlaceOrRotateBusDepot(scene, tile.row, tile.col)
      : selectedTool === 'ferry-pier' && typeof whyNotFerryPier === 'function'
        ? !whyNotFerryPier(tile.row, tile.col)
      : selectedTool === 'tree'
        ? canPlantTreeAt(scene, tile.row, tile.col)
        : typeof isTyphoonShelterBuildingTool === 'function' && isTyphoonShelterBuildingTool(selectedTool)
          ? !whyNotTyphoonShelterBuilding(tile.row, tile.col, footprintCols, footprintRows)
          : canPlaceBuildingFootprint(tile.row, tile.col, footprintCols, footprintRows)
            // (黃金海岸酒店: and a yacht club within reach)
            && !(selectedTool === 'gold-coast-hotel' && typeof whyNotGoldCoastHotel === 'function'
              && whyNotGoldCoastHotel(tile.row, tile.col, footprintCols, footprintRows));
  drawFootprintGuide(scene, tile.row, tile.col, footprintCols, footprintRows, canPlace);
}

// A hover over an already-placed depot doesn't block placement - clicking it
// rotates its orientation instead (see placeBusDepotBuilding, tools.js) - so
// the footprint guide should read as "OK" there too, not "blocked".
function canPlaceOrRotateBusDepot(scene, row, col) {
  const sprite = scene?.buildingSprites?.get(getTileId(row, col));
  if (sprite && buildingData[getTileId(sprite.mapRow, sprite.mapCol)]?.type === 'bus_depot') return true;
  return canPlaceBuildingFootprint(row, col, BUS_DEPOT_FOOTPRINT_COLS, BUS_DEPOT_FOOTPRINT_ROWS);
}

function drawFootprintGuide(scene, row, col, footprintCols = 1, footprintRows = 1, canPlace = true) {
  const g = scene.buildingGuideGraphic;
  if (!g) return;

  const color = canPlace ? 0x45e6c3 : 0xff4d4d;
  const tiles = getFootprintTiles(row, col, footprintCols, footprintRows)
    .filter(([tileRow, tileCol]) => isInsideMap(tileRow, tileCol));
  if (tiles.length === 0) return;

  g.fillStyle(color, canPlace ? 0.16 : 0.20);
  g.lineStyle(1, color, canPlace ? 0.42 : 0.55);
  tiles.forEach(([tileRow, tileCol]) => {
    const geom = getTileFaceGeometry(tileRow, tileCol, scene.offsetX, scene.offsetY);
    g.beginPath();
    g.moveTo(geom.top.x, geom.top.y);
    g.lineTo(geom.right.x, geom.right.y);
    g.lineTo(geom.bottom.x, geom.bottom.y);
    g.lineTo(geom.left.x, geom.left.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  });

  const vertices = tiles.flatMap(([tileRow, tileCol]) => (
    getTileFaceVertices(tileRow, tileCol, scene.offsetX, scene.offsetY, TILE_WIDTH / 2, TILE_HEIGHT / 2)
  ));
  let north = vertices[0], east = vertices[0], south = vertices[0], west = vertices[0];
  vertices.forEach((pt) => {
    if (pt.y < north.y) north = pt;
    if (pt.x > east.x) east = pt;
    if (pt.y > south.y) south = pt;
    if (pt.x < west.x) west = pt;
  });

  g.lineStyle(3, color, 0.95);
  g.beginPath();
  g.moveTo(north.x, north.y);
  g.lineTo(east.x,  east.y);
  g.lineTo(south.x, south.y);
  g.lineTo(west.x,  west.y);
  g.closePath();
  g.strokePath();
}

function drawRoadDragPreview(scene, start, end) {
  const g = scene.bridgePreviewGraphic;
  if (!g) return;
  g.clear();

  const pathInfo = getStraightDragPath(start, end);
  const path = pathInfo.path ?? [];
  if (path.length === 0) return;

  const bridge = analyzeBridgePath(scene, pathInfo);
  const invalidWaterPath = bridge.crossesWater && !bridge.valid;
  const color = invalidWaterPath ? 0xff4444 : bridge.valid ? 0x55ccff : 0xd0d0d0;

  g.fillStyle(color, bridge.valid ? 0.26 : 0.18);
  g.lineStyle(2, color, 0.92);
  path.forEach(({ row, col }) => {
    const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    g.beginPath();
    g.moveTo(geom.top.x, geom.top.y);
    g.lineTo(geom.right.x, geom.right.y);
    g.lineTo(geom.bottom.x, geom.bottom.y);
    g.lineTo(geom.left.x, geom.left.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  });
}
