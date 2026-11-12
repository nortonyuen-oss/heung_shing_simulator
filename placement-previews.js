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

// ── Bus-stop walking range (transport mode) ──────────────────────────────────

// The tiles within TRANSPORT_STOP_CATCHMENT_RADIUS steps of the hovered tile, washed in
// blue on the same graphic as the stop highlight: where its riders would come from.
function drawTransportCatchmentPreview(scene, row, col) {
  const g = scene.busStopHighlightGraphic;
  if (!g || typeof TRANSPORT_STOP_CATCHMENT_RADIUS === 'undefined') return;
  const radius = TRANSPORT_STOP_CATCHMENT_RADIUS;
  g.fillStyle(0x4fb3ff, 0.24);
  for (let dr = -radius; dr <= radius; dr++) {
    const span = radius - Math.abs(dr);
    for (let dc = -span; dc <= span; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (typeof isInsideMap === 'function' && !isInsideMap(r, c)) continue;
      const geom = getTileFaceGeometry(r, c, scene.offsetX, scene.offsetY);
      g.beginPath();
      g.moveTo(geom.top.x, geom.top.y);
      g.lineTo(geom.right.x, geom.right.y);
      g.lineTo(geom.bottom.x, geom.bottom.y);
      g.lineTo(geom.left.x, geom.left.y);
      g.closePath();
      g.fillPath();
    }
  }
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
  // 海底隧道: dragged from shore to shore (drawUnderseaTunnelDragPreview); before the drag, the
  // tile it would start from, green on land at sea level
  if (selectedTool === 'undersea-tunnel') {
    const land = isInsideMap(tile.row, tile.col) && mapData[tile.row][tile.col] !== WATER && getTileHeight(tile.row, tile.col) === 0;
    drawFootprintGuide(scene, tile.row, tile.col, 1, 1, land);
    return;
  }
  // 地面站: the five track tiles it would take, green, or the tile red (metro-surface-lines.js)
  if (selectedTool === 'metro-surface-station' && typeof whyNotSurfaceStationAt === 'function') {
    const res = whyNotSurfaceStationAt(tile.row, tile.col, getMetroState().tracks, (r, c) => isMetroSurfaceStationTile(r, c));
    if (res.axis === 'ns') drawFootprintGuide(scene, tile.row - 2, tile.col, 1, 5, true);
    else if (res.axis === 'we') drawFootprintGuide(scene, tile.row, tile.col - 2, 5, 1, true);
    else drawFootprintGuide(scene, tile.row, tile.col, 1, 1, false);
    return;
  }
  // 地鐵路軌: before the drag, the tile it would start from at the height picked - track to carry on
  // from, or ground the height may be laid on (anywhere, 地底) (metro-surface.js)
  if (selectedTool === 'metro-track' && typeof canLayMetroTrackAt === 'function') {
    const height = typeof getMetroRailHeight === 'function' ? getMetroRailHeight() : 'ground';
    const ok = isMetroTrackTile(tile.row, tile.col)
      || (height === 'under' ? isInsideMap(tile.row, tile.col)
        : height === 'deck' ? canDeckMetroTrackAt(tile.row, tile.col) : canLayMetroTrackAt(tile.row, tile.col));
    drawFootprintGuide(scene, tile.row, tile.col, 1, 1, ok);
    return;
  }
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
      : selectedTool === 'promenade' && typeof whyNotPromenadeAt === 'function'
        ? !whyNotPromenadeAt(tile.row, tile.col)
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

// The label at the end of a 海底隧道 drag: its cost, or why it cannot go there. Kept the same size
// on screen at any zoom; hidden on pointerup (tool-menu.js).
function showUnderseaTunnelPreviewLabel(scene, row, col, text, ok) {
  if (!scene.tunnelPreviewLabel) {
    scene.tunnelPreviewLabel = scene.add.text(0, 0, '', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', padding: { x: 7, y: 4 },
    }).setOrigin(0.5, 1).setResolution(2);
    addToRenderLayer(scene, scene.tunnelPreviewLabel, 'effectLayer');
    scene.tunnelPreviewLabel.setDepth(getPreviewOverlayDepth(2));
  }
  const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
  scene.tunnelPreviewLabel
    .setText(text)
    .setBackgroundColor(ok ? 'rgba(18, 70, 60, 0.9)' : 'rgba(110, 24, 24, 0.9)')
    .setPosition(geom.center.x, geom.top.y - 6)
    .setScale(1 / (scene.cameras.main.zoom || 1))
    .setVisible(true);
}

// 海底隧道 drag (undersea-tunnel.js): both portals it would build, green, and its two bores under the
// sea; red along the drag line where it cannot go, with the reason by the pointer.
function drawUnderseaTunnelDragPreview(scene, start, end) {
  const g = scene.bridgePreviewGraphic;
  if (!g) return;
  g.clear();
  const { site, reason } = getUnderseaTunnelCrossing(start, end);
  const diamond = (row, col, color, alpha) => {
    const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    g.fillStyle(color, alpha);
    g.lineStyle(2, color, 0.92);
    g.beginPath();
    g.moveTo(geom.top.x, geom.top.y);
    g.lineTo(geom.right.x, geom.right.y);
    g.lineTo(geom.bottom.x, geom.bottom.y);
    g.lineTo(geom.left.x, geom.left.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  };
  if (!site) {
    (getStraightDragPath(start, end).path ?? []).forEach(({ row, col }) => diamond(row, col, 0xff4444, 0.18));
    showUnderseaTunnelPreviewLabel(scene, end.row, end.col, t(reason), false);
    return;
  }
  site.portals.forEach((portal) => portal.tiles.forEach(([row, col]) => diamond(row, col, 0x45e6c3, 0.3)));
  g.fillStyle(0x45e6c3, 0.6);
  site.under.forEach(([row, col], index) => {
    if (Math.floor(index / 2) % 2) return;
    const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    g.fillCircle(geom.center.x, geom.center.y, 3);
  });
  showUnderseaTunnelPreviewLabel(scene, end.row, end.col, t('tunnel.cost', { cost: site.cost.toLocaleString(), tiles: site.crossing }), true);
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

// Touch drafts supply logical tiles and a validated plan; no synthetic Phaser pointer.
function clearTouchPlacementPreview(scene) {
  scene?.buildingGuideGraphic?.clear();
  scene?.busStopHighlightGraphic?.clear();
  scene?.mobileEndpointLabels?.forEach((label) => label.setVisible(false));
  scene?.mobileBusPlacementLabels?.forEach((label) => label.setVisible(false));
}

function drawTouchBusPlacementPreview(scene, draft) {
  const plan = draft.plan;
  if (!scene.mobileBusPlacementLabels) {
    scene.mobileBusPlacementLabels = [0, 1].map(() => {
      const label = scene.add.text(0, 0, '', { fontSize: '14px', fontStyle: 'bold', color: '#ffffff', padding: { x: 5, y: 3 } }).setOrigin(0.5, 1).setResolution(2);
      addToRenderLayer(scene, label, 'effectLayer');
      return label;
    });
  }
  const labelAt = (index, point, text, selected) => scene.mobileBusPlacementLabels[index]
    .setPosition(point.x, point.y).setText(text).setBackgroundColor(selected ? '#166b37' : '#8a5308')
    .setScale(1 / scene.cameras.main.zoom).setDepth(getPreviewOverlayDepth(3)).setVisible(true);
  if (draft.tool === 'bus-stop') {
    const { row, col } = draft.start;
    drawBusStopHighlight(scene, row, col);
    if (plan.eligibleSides?.length) drawTransportCatchmentPreview(scene, row, col);
    (plan.eligibleSides || []).forEach((side, index) => {
      const point = getBusStopAnchorPoint(row, col, getBusStopAnchorCorner(side), scene.offsetX, scene.offsetY);
      labelAt(index, point, index ? 'B' : 'A', plan.sides.includes(side));
    });
  } else {
    const g = scene.buildingGuideGraphic;
    (plan.frontage || []).forEach((tile, index) => {
      if (!isInsideMap(tile.row, tile.col)) return;
      const geom = getTileFaceGeometry(tile.row, tile.col, scene.offsetX, scene.offsetY);
      const color = tile.road ? 0x45e6c3 : 0xf4a62a;
      g.lineStyle(3, color, 0.95).beginPath();
      [geom.top, geom.right, geom.bottom, geom.left].forEach((point, i) => i ? g.lineTo(point.x, point.y) : g.moveTo(point.x, point.y));
      g.closePath().strokePath();
      if (index === 1) labelAt(0, geom.center, t('mobile.depotEntrance'), plan.connected);
    });
  }
}

function drawTouchPlacementPreview(scene, draft) {
  clearTouchPlacementPreview(scene);
  if (!draft?.start || !draft.plan) return;
  const g = scene.buildingGuideGraphic;
  const plan = draft.plan;
  const tiles = plan.tiles.length ? plan.tiles : [draft.start];
  const color = !plan.ok || draft.tool === 'bulldoze' ? 0xe04b49
    : draft.tool === 'zone-res' ? 0x35c06f : draft.tool === 'zone-com' ? 0x4499ff
      : draft.tool === 'zone-ind' ? 0xffcc00 : 0x45e6c3;
  tiles.forEach(({ row, col }) => {
    if (!isInsideMap(row, col)) return;
    const geom = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
    g.fillStyle(color, 0.28).lineStyle(2, color, 0.95).beginPath();
    [geom.top, geom.right, geom.bottom, geom.left].forEach((point, index) => index ? g.lineTo(point.x, point.y) : g.moveTo(point.x, point.y));
    g.closePath().fillPath().strokePath();
  });
  if (draft.tool === 'bus-stop' || draft.tool === 'bus-depot') drawTouchBusPlacementPreview(scene, draft);
  if (isTouchRangeDraft(draft)) {
    if (!scene.mobileEndpointLabels) {
      scene.mobileEndpointLabels = ['A', 'B'].map((text) => {
        const label = scene.add.text(0, 0, text, { fontSize: '16px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#1f5fa8', padding: { x: 7, y: 4 } }).setOrigin(0.5, 1).setResolution(2);
        addToRenderLayer(scene, label, 'effectLayer');
        return label;
      });
    }
    [draft.start, draft.end].forEach((tile, index) => {
      const geom = getTileFaceGeometry(tile.row, tile.col, scene.offsetX, scene.offsetY);
      scene.mobileEndpointLabels[index].setPosition(geom.center.x, geom.top.y - 3)
        .setScale(1 / scene.cameras.main.zoom).setDepth(getPreviewOverlayDepth(2))
        .setVisible(index === 0 || draft.ready);
    });
  }
}
