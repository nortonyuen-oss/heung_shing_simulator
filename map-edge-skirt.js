// Map edge skirt. Terrain may run high right up to the map edge (the Hong Kong district maps
// cut through hillsides), so along the two edges nearest the camera each raised tile gets a
// rock face from the bottom of its art down to sea level - a cross-section instead of a slab
// floating over the background. The renderer treats ground outside the map as level with the
// edge tile (tile-keys.js), so edge tiles never slope down into nothing.

// Lit (left, facing the sun from the north-west) and shaded (right) faces.
const MAP_EDGE_SKIRT_COLORS = { left: 0x7b6b56, right: 0x5c5043 };
const MAP_EDGE_SKIRT_DEPTH = -100000; // below every terrain tile in the terrain band

let mapEdgeSkirtRaf = null;

function drawMapEdgeSkirt(scene) {
  if (!scene?.add || !scene.tileSprites?.length) return;
  if (!scene.mapEdgeSkirt) {
    scene.mapEdgeSkirt = scene.add.graphics();
    scene.mapEdgeSkirt.setDepth(getWorldDepth('terrain', MAP_EDGE_SKIRT_DEPTH));
    addToRenderLayer(scene, scene.mapEdgeSkirt, 'terrainLayer');
  }
  const graphics = scene.mapEdgeSkirt;
  graphics.clear();

  const halfW = TILE_WIDTH / 2;
  const face = (color, points) => {
    graphics.fillStyle(color, 1);
    graphics.fillPoints(points, true);
  };

  // A tile's art ends at its base (sprite origin is bottom centre), the side faces running
  // half a tile up from the base to the left and right corners; the skirt continues those
  // faces down to where a sea-level tile's base would be.
  const drawTile = (row, col) => {
    if (getTileHeight(row, col) <= 0 || mapData[row]?.[col] === WATER) return;
    const pos = isoToScreen(col, row);
    const x = pos.x + scene.offsetX;
    const ground = pos.y + scene.offsetY;
    const base = ground + getTerrainTileVisualOffset(row, col, getTileKey(row, col));
    if (base >= ground) return;
    // View column/row of this tile: the near edges are view column MAP_WIDTH - 1 (faces down
    // right) and view row MAP_HEIGHT - 1 (faces down left), whatever the rotation.
    const u = (pos.x - ORIGIN_X) / halfW;
    const v = pos.y / (TILE_HEIGHT / 2);
    const viewCol = Math.round((u + v) / 2);
    const viewRow = Math.round((v - u) / 2);
    if (viewCol === MAP_WIDTH - 1) {
      face(MAP_EDGE_SKIRT_COLORS.right, [
        { x: x + halfW, y: base - TILE_HEIGHT / 2 }, { x, y: base },
        { x, y: ground }, { x: x + halfW, y: ground - TILE_HEIGHT / 2 },
      ]);
    }
    if (viewRow === MAP_HEIGHT - 1) {
      face(MAP_EDGE_SKIRT_COLORS.left, [
        { x: x - halfW, y: base - TILE_HEIGHT / 2 }, { x, y: base },
        { x, y: ground }, { x: x - halfW, y: ground - TILE_HEIGHT / 2 },
      ]);
    }
  };

  for (let i = 0; i < MAP_WIDTH; i++) {
    drawTile(0, i);
    drawTile(MAP_HEIGHT - 1, i);
  }
  for (let i = 1; i < MAP_HEIGHT - 1; i++) {
    drawTile(i, 0);
    drawTile(i, MAP_WIDTH - 1);
  }
}

// Edits reach here tile by tile; coalesce them into one redraw a frame.
function scheduleMapEdgeSkirtRedraw(scene = activeScene) {
  if (mapEdgeSkirtRaf !== null || !scene) return;
  mapEdgeSkirtRaf = requestAnimationFrame(() => {
    mapEdgeSkirtRaf = null;
    drawMapEdgeSkirt(scene);
  });
}
