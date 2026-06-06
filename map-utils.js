function getTileId(row, col) {
  return `${row}:${col}`;
}

function getFootprintTiles(row, col, footprintCols = 1, footprintRows = 1) {
  const tiles = [];
  for (let rowOffset = 0; rowOffset < footprintRows; rowOffset++) {
    for (let colOffset = 0; colOffset < footprintCols; colOffset++) {
      tiles.push([row + rowOffset, col + colOffset]);
    }
  }
  return tiles;
}

function removeBuilding(scene, row, col) {
  if (!scene?.buildingSprites) return false;
  const tileId = getTileId(row, col);
  const building = scene.buildingSprites.get(tileId);
  if (!building) return false;

  // Clean up simulation data keyed to anchor tile
  const anchorId = getTileId(building.mapRow, building.mapCol);
  const record   = buildingData[anchorId];
  if (record) {
    if (record.type === 'power_plant_coal' || record.type === 'power_plant_solar') {
      powerSources.delete(anchorId);
    }
    markPowerGridDirty();
    if (SERVICE_BUILDING_TYPES.has(record.type)) markServiceCoverageDirty();
    invalidateBuildingCountCache();
    delete buildingData[anchorId];
  }

  building.destroy();
  getFootprintTiles(
    building.mapRow,
    building.mapCol,
    building.footprintCols ?? 1,
    building.footprintRows ?? 1,
  ).forEach(([tileRow, tileCol]) => {
    scene.buildingSprites.delete(getTileId(tileRow, tileCol));
  });

  if (typeof refreshInfrastructureEffects === 'function') {
    refreshInfrastructureEffects(scene);
  }
  return true;
}

function removeBuildingsInFootprint(scene, row, col, footprintCols = 1, footprintRows = 1) {
  if (!scene?.buildingSprites) return;
  const buildings = new Set();
  getFootprintTiles(row, col, footprintCols, footprintRows).forEach(([tileRow, tileCol]) => {
    const building = scene.buildingSprites.get(getTileId(tileRow, tileCol));
    if (building) buildings.add(building);
  });

  buildings.forEach((building) => {
    removeBuilding(scene, building.mapRow, building.mapCol);
  });
}
