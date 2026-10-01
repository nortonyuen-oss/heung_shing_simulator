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
