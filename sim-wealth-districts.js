// ── Residential wealth-district grid ─────────────────────────────────────────
// Divides the map into a fixed grid of cells (see WEALTH_DISTRICT_GRID_CELL_SIZE
// in constants.js) and classifies each cell into one of four named wealth
// districts (commoner/middleClass/wealthy/ultraRich) from the average land
// value of that cell's own built residential tiles. This is the sole driver
// of residential wealth-tier (L/M/H/UH) odds - see
// RESIDENTIAL_WEALTH_DISTRICT_PROBABILITIES in constants.js and
// getResidentialWealthDistrictWeights() below - replacing the old per-tile
// quality-band + minimums-checklist system entirely.
//
// Deliberately a fixed grid, not flood-filled contiguous regions: a real
// neighbourhood-detection system would need to track how regions merge/split
// as the city grows, which is a lot of failure-prone bookkeeping for a purely
// cosmetic/tuning classification. A coarse grid gives the same "the city is
// visibly divided into named districts that upgrade/downgrade over time"
// result with none of that complexity, and mirrors the existing
// computeEducationDistrictAverages() quadrant-averaging precedent in
// overlay-controls.js (just a finer grid instead of 4 quadrants).

function getWealthDistrictGridDimensions() {
  return {
    rows: Math.ceil(MAP_HEIGHT / WEALTH_DISTRICT_GRID_CELL_SIZE),
    cols: Math.ceil(MAP_WIDTH / WEALTH_DISTRICT_GRID_CELL_SIZE),
  };
}

function getWealthDistrictCellIndex(row, col) {
  return {
    cellRow: Math.floor(row / WEALTH_DISTRICT_GRID_CELL_SIZE),
    cellCol: Math.floor(col / WEALTH_DISTRICT_GRID_CELL_SIZE),
  };
}

function classifyWealthDistrictTier(avgLandValue) {
  const band = WEALTH_DISTRICT_LAND_VALUE_BANDS.find((entry) => avgLandValue <= entry.maxAvgLandValue);
  return band ? band.tier : WEALTH_DISTRICT_LAND_VALUE_BANDS[WEALTH_DISTRICT_LAND_VALUE_BANDS.length - 1].tier;
}

function getWealthDistrictCellCenter(cellRow, cellCol) {
  return {
    row: cellRow * WEALTH_DISTRICT_GRID_CELL_SIZE + WEALTH_DISTRICT_GRID_CELL_SIZE / 2,
    col: cellCol * WEALTH_DISTRICT_GRID_CELL_SIZE + WEALTH_DISTRICT_GRID_CELL_SIZE / 2,
  };
}

// One pass over buildingData for every location type the district grading
// below cares about, reused across every cell's check rather than rescanned
// per cell.
function collectWealthDistrictAmenityLocations() {
  const flagshipParks = [];
  const landmarks = [];
  const noxious = [];
  if (buildingData && typeof buildingData === 'object') {
    Object.entries(buildingData).forEach(([id, record]) => {
      if (!record) return;
      const isFlagshipPark = record.type === 'park_flagship';
      const isLandmark = WEALTH_DISTRICT_ULTRA_RICH_LANDMARK_TYPES.includes(record.type);
      const isNoxious = WEALTH_DISTRICT_NOXIOUS_FACILITY_TYPES.includes(record.type);
      if (!isFlagshipPark && !isLandmark && !isNoxious) return;
      const [row, col] = id.split(':').map(Number);
      if (!Number.isFinite(row) || !Number.isFinite(col)) return;
      const centerRow = row + ((record.footprintRows ?? 1) - 1) / 2;
      const centerCol = col + ((record.footprintCols ?? 1) - 1) / 2;
      if (isFlagshipPark) flagshipParks.push({ row: centerRow, col: centerCol });
      if (isLandmark) landmarks.push({ row: centerRow, col: centerCol });
      if (isNoxious) noxious.push({ row: centerRow, col: centerCol });
    });
  }
  return { flagshipParks, landmarks, noxious };
}

function isNearAnyLocation(row, col, locations, radius) {
  return locations.some((loc) => Math.abs(row - loc.row) + Math.abs(col - loc.col) <= radius);
}

function isNearWaterfront(row, col, radius) {
  if (typeof mapData === 'undefined' || !Array.isArray(mapData)) return false;
  const minRow = Math.max(0, Math.round(row - radius));
  const maxRow = Math.min(MAP_HEIGHT - 1, Math.round(row + radius));
  const minCol = Math.max(0, Math.round(col - radius));
  const maxCol = Math.min(MAP_WIDTH - 1, Math.round(col + radius));
  for (let rr = minRow; rr <= maxRow; rr++) {
    for (let cc = minCol; cc <= maxCol; cc++) {
      if (Math.abs(row - rr) + Math.abs(col - cc) > radius) continue;
      const terrain = mapData[rr]?.[cc];
      if (terrain === WATER || terrain === BEACH) return true;
    }
  }
  return false;
}

// Ultra-rich needs a flagship park (Victoria Park), a waterfront edge, or a
// named landmark within reach of the cell's centre - see the constants above
// for exactly which building types/radii count.
function cellQualifiesForUltraRichAmenity(cellRow, cellCol, amenities) {
  const center = getWealthDistrictCellCenter(cellRow, cellCol);
  if (isNearAnyLocation(center.row, center.col, amenities.flagshipParks, FLAGSHIP_PARK_RADIUS)) return true;
  if (isNearAnyLocation(center.row, center.col, amenities.landmarks, WEALTH_DISTRICT_ULTRA_RICH_LANDMARK_RADIUS)) return true;
  if (isNearWaterfront(center.row, center.col, WEALTH_DISTRICT_ULTRA_RICH_WATERFRONT_RADIUS)) return true;
  return false;
}

// The flip side: industrial buildings, power plants, the container port, or
// the airport nearby block wealthy/ultraRich entirely - bad views and
// constant noise don't fit either prestige tier, however high land value
// averages out.
function cellIsNearNoxiousFacility(cellRow, cellCol, amenities) {
  const center = getWealthDistrictCellCenter(cellRow, cellCol);
  return isNearAnyLocation(center.row, center.col, amenities.noxious, WEALTH_DISTRICT_NOXIOUS_RADIUS);
}

// Weights each residential building by its footprint area (a 3x3 mansion
// represents far more real development than a 1x1 house) and reads land
// value from its anchor tile - buildings are small relative to a 16-tile
// grid cell, so land value doesn't meaningfully vary across one footprint,
// and this avoids looping every individual tile of every building.
function computeWealthDistrictGridMap(landValueMap) {
  const { rows, cols } = getWealthDistrictGridDimensions();
  const sums = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const weights = Array.from({ length: rows }, () => new Array(cols).fill(0));

  if (buildingData && typeof buildingData === 'object') {
    Object.entries(buildingData).forEach(([id, record]) => {
      if (record?.type !== 'residential') return;
      const [row, col] = id.split(':').map(Number);
      if (!Number.isFinite(row) || !Number.isFinite(col)) return;
      const { cellRow, cellCol } = getWealthDistrictCellIndex(row, col);
      if (cellRow < 0 || cellRow >= rows || cellCol < 0 || cellCol >= cols) return;

      const footprintArea = Math.max(1, (record.footprintCols ?? 1) * (record.footprintRows ?? 1));
      const landValue = Array.isArray(landValueMap) ? clamp(landValueMap[row]?.[col] ?? 0, 0, 1) : 0;
      sums[cellRow][cellCol] += landValue * footprintArea;
      weights[cellRow][cellCol] += footprintArea;
    });
  }

  const amenities = collectWealthDistrictAmenityLocations();
  const grid = Array.from({ length: rows }, () => new Array(cols).fill('commoner'));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (weights[r][c] < WEALTH_DISTRICT_MIN_BUILT_TILES) continue; // stays 'commoner'
      let tier = classifyWealthDistrictTier(sums[r][c] / weights[r][c]);
      if ((tier === 'wealthy' || tier === 'ultraRich') && cellIsNearNoxiousFacility(r, c, amenities)) {
        tier = 'middleClass';
      } else if (tier === 'ultraRich' && !cellQualifiesForUltraRichAmenity(r, c, amenities)) {
        tier = 'wealthy';
      }
      grid[r][c] = tier;
    }
  }
  return grid;
}

function getResidentialWealthDistrictTier(row, col, wealthDistrictGrid) {
  if (!Array.isArray(wealthDistrictGrid)) return 'commoner';
  const { cellRow, cellCol } = getWealthDistrictCellIndex(row, col);
  return wealthDistrictGrid[cellRow]?.[cellCol] ?? 'commoner';
}

// Mirrors the fallback safety net the old getResidentialWealthWeights had:
// zero out tiers with no loaded model art, and if that leaves every tier at
// zero, guarantee whichever tier IS available so growth never silently stalls.
function getResidentialWealthDistrictWeights(districtTier, models = []) {
  const base = RESIDENTIAL_WEALTH_DISTRICT_PROBABILITIES[districtTier]
    ?? RESIDENTIAL_WEALTH_DISTRICT_PROBABILITIES.commoner;
  const availableTiers = new Set(models.map((model) => model.wealthTier).filter(Boolean));
  const weights = { ...base };
  Object.keys(weights).forEach((tier) => {
    if (!availableTiers.has(tier)) weights[tier] = 0;
  });
  if (Object.values(weights).some((weight) => weight > 0)) return weights;
  const fallbackTier = ['L', 'M', 'H', 'UH'].find((tier) => availableTiers.has(tier));
  return Object.fromEntries(Object.keys(weights).map((tier) => [tier, tier === fallbackTier ? 1 : 0]));
}

function getWealthDistrictGridSummary(wealthDistrictGrid) {
  const counts = { commoner: 0, middleClass: 0, wealthy: 0, ultraRich: 0 };
  if (!Array.isArray(wealthDistrictGrid)) return counts;
  wealthDistrictGrid.forEach((rowArr) => {
    rowArr.forEach((tier) => {
      if (counts[tier] !== undefined) counts[tier]++;
    });
  });
  return counts;
}

// ── Overlay support ───────────────────────────────────────────────────────────
// A per-tile 0-1 map for the 'neighborhood' overlay (see overlay-controls.js):
// only residential-zoned tiles get a value, bucketed into 4 evenly-spaced
// bands so overlayPixelColor can paint 4 flat district colors instead of a
// continuous gradient. Computed on demand like the other overlay maps
// (cached by overlayCache, not tied to the growth-tick quality-context cache).
const WEALTH_DISTRICT_TIER_OVERLAY_VALUES = Object.freeze({
  commoner: 0.125,
  middleClass: 0.375,
  wealthy: 0.625,
  ultraRich: 0.875,
});

function computeWealthDistrictOverlayMap() {
  const landValueMap = typeof computeLandValueMap === 'function' ? computeLandValueMap() : null;
  const grid = computeWealthDistrictGridMap(landValueMap);
  const map = createFilledMap(0);
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (zoneMap[row]?.[col] !== ZONE_RES) continue;
      const tier = getResidentialWealthDistrictTier(row, col, grid);
      map[row][col] = WEALTH_DISTRICT_TIER_OVERLAY_VALUES[tier] ?? 0;
    }
  }
  return map;
}
