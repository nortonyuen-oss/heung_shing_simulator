// Public markets: local amenities and shared customers, derived from the city.
// No market counters are saved: loading an older city uses the same rules.
const PUBLIC_MARKET_RULES = Object.freeze({
  residentialRadius: 6,
  closeRadius: 2,
  commercialRadius: 3,
  ordinaryQualityBonus: 0.03,
  wealthyQualityBonus: 0.01,
  ultraRichQualityPenalty: 0.05,
  ultraRichWeightReduction: 0.50,
  landValueBonus: 0.02,
  commercialGrowthBonus: 0.05,
  residentsForFullOccupancy: 800,
  maxMonthlyRent: 100,
  monthlyUpkeep: 80,
});

function publicMarketClamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function publicMarketProximity(distance) {
  const rules = PUBLIC_MARKET_RULES;
  return publicMarketClamp((rules.residentialRadius - distance)
    / (rules.residentialRadius - rules.closeRadius));
}

function computePublicMarketState({ buildings = {}, isPowered = () => false,
  hasRoadAccess = () => false, powerRatio = 1 } = {}) {
  const markets = new Map();
  const coverage = new Map();
  const residentialTiers = new Map();
  const residences = [];
  Object.entries(buildings).forEach(([id, record]) => {
    if (!record || !['public_market', 'residential'].includes(record.type)) return;
    const [row, col] = id.split(':').map(Number);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    const rows = Math.max(1, Math.floor(Number(record.footprintRows) || (record.type === 'public_market' ? 2 : 1)));
    const cols = Math.max(1, Math.floor(Number(record.footprintCols) || (record.type === 'public_market' ? 2 : 1)));
    if (record.type === 'residential') {
      const population = Math.max(0, Number(record.population ??
        (typeof POP_PER_LEVEL !== 'undefined' ? POP_PER_LEVEL[record.level] : 0)) || 0);
      residences.push({ row, col, rows, cols, population });
      for (let r = row; r < row + rows; r++) for (let c = col; c < col + cols; c++) {
        residentialTiers.set(`${r}:${c}`, record.wealthTier || 'L');
      }
      return;
    }
    const roadConnected = !!hasRoadAccess(row, col, cols, rows);
    const powered = !!isPowered(row, col);
    const availability = roadConnected && powered ? publicMarketClamp(powerRatio) : 0;
    const market = { id, row, col, rows, cols, roadConnected, powered, availability,
      servedResidents: 0, occupancy: 0, rent: 0, upkeep: PUBLIC_MARKET_RULES.monthlyUpkeep };
    markets.set(id, market);
    const radius = PUBLIC_MARKET_RULES.residentialRadius;
    for (let r = row - radius; r < row + rows + radius; r++) {
      for (let c = col - radius; c < col + cols + radius; c++) {
        const distance = Math.max(row - r, 0, r - (row + rows - 1))
          + Math.max(col - c, 0, c - (col + cols - 1));
        if (distance >= radius) continue;
        const key = `${r}:${c}`;
        if (!coverage.has(key)) coverage.set(key, []);
        coverage.get(key).push({ market, distance, strength: publicMarketProximity(distance) * availability });
      }
    }
  });
  // Each residential tile contributes its share of the building's population
  // once. Overlapping catchments divide that same pool by proximity; a large
  // estate crossing a boundary is not counted in full by both markets.
  if (markets.size) residences.forEach(({ row, col, rows, cols, population }) => {
    if (!population) return;
    const residentsPerTile = population / (rows * cols);
    for (let r = row; r < row + rows; r++) for (let c = col; c < col + cols; c++) {
      const nearby = coverage.get(`${r}:${c}`) || [];
      const total = nearby.reduce((sum, entry) => sum + entry.strength, 0);
      if (!total) continue;
      nearby.forEach(({ market, strength }) => {
        market.servedResidents += residentsPerTile * strength / total;
      });
    }
  });
  let revenue = 0;
  markets.forEach((market) => {
    market.occupancy = publicMarketClamp(market.servedResidents / PUBLIC_MARKET_RULES.residentsForFullOccupancy);
    market.rent = PUBLIC_MARKET_RULES.maxMonthlyRent * market.occupancy * market.availability;
    market.net = market.rent - market.upkeep;
    revenue += market.rent;
  });
  return { markets, coverage, residentialTiers, revenue };
}

let publicMarketStateCache = null;

function invalidatePublicMarketState({ deferDuringPulse = false } = {}) {
  // Growth may place dozens of houses during one pulse. Reuse its customer
  // snapshot instead of rescanning the whole city after every new house.
  if (deferDuringPulse && typeof isCitySimulationPulsePending === 'function'
    && isCitySimulationPulsePending()) return;
  publicMarketStateCache = null;
}

function getPublicMarketState() {
  const buildings = typeof buildingData === 'undefined' ? {} : buildingData;
  const cityState = typeof city === 'undefined' ? null : city;
  const powers = typeof powerMap === 'undefined' ? null : powerMap;
  const tick = cityState?.tick ?? 0;
  const powerRatio = cityState?.powerRatio ?? 1;
  if (publicMarketStateCache?.buildings === buildings && publicMarketStateCache.city === cityState
    && publicMarketStateCache.powers === powers && publicMarketStateCache.tick === tick
    && publicMarketStateCache.powerRatio === powerRatio) return publicMarketStateCache.state;
  const state = computePublicMarketState({
    buildings, powerRatio,
    isPowered: (r, c) => !!powers?.[r]?.[c],
    hasRoadAccess: (row, col, cols, rows) => {
      if (typeof isRoadAccessTile !== 'function') return false;
      // A loading entrance needs an actual road on the lot's perimeter.
      for (let c = col; c < col + cols; c++) {
        if (isRoadAccessTile(row - 1, c) || isRoadAccessTile(row + rows, c)) return true;
      }
      for (let r = row; r < row + rows; r++) {
        if (isRoadAccessTile(r, col - 1) || isRoadAccessTile(r, col + cols)) return true;
      }
      return false;
    },
  });
  publicMarketStateCache = { buildings, city: cityState, powers, tick, powerRatio, state };
  return state;
}

function getPublicMarketTileLandBonus(row, col, tier = 'L', state = getPublicMarketState()) {
  let bonus = 0;
  for (const entry of state.coverage.get(`${row}:${col}`) || []) {
    if (tier === 'UH') continue;
    const wealthScale = tier === 'H' ? (entry.distance <= PUBLIC_MARKET_RULES.closeRadius ? 0 : 0.5) : 1;
    bonus = Math.max(bonus, PUBLIC_MARKET_RULES.landValueBonus * entry.strength * wealthScale);
  }
  return bonus;
}

function getPublicMarketLandValueBonus(row, col, zone, state = getPublicMarketState()) {
  if (zone !== ZONE_RES && zone !== ZONE_COM) return 0;
  return getPublicMarketTileLandBonus(row, col,
    zone === ZONE_RES ? state.residentialTiers.get(`${row}:${col}`) || 'L' : 'L', state);
}

function getPublicMarketResidentialEffect(row, col, cols = 1, rows = 1, tier = 'L', state = getPublicMarketState()) {
  let qualityBonus = 0, landValueCorrection = 0, ultraRichWeight = 0, nearby = false;
  for (let r = row; r < row + rows; r++) for (let c = col; c < col + cols; c++) {
    let tileQuality = 0, strongest = 0;
    for (const entry of state.coverage.get(`${r}:${c}`) || []) {
      nearby = true;
      strongest = Math.max(strongest, entry.strength);
      if (tier === 'UH') {
        tileQuality = Math.min(tileQuality, -PUBLIC_MARKET_RULES.ultraRichQualityPenalty * entry.strength);
      } else if (tier === 'H') {
        if (entry.distance > PUBLIC_MARKET_RULES.closeRadius) {
          tileQuality = Math.max(tileQuality, PUBLIC_MARKET_RULES.wealthyQualityBonus * entry.strength);
        }
      } else tileQuality = Math.max(tileQuality, PUBLIC_MARKET_RULES.ordinaryQualityBonus * entry.strength);
    }
    qualityBonus += tileQuality;
    // Empty lots use the district's prospective tier. Remove any ordinary
    // market premium already in the land map before evaluating a UH site.
    landValueCorrection += getPublicMarketTileLandBonus(r, c, tier, state)
      - getPublicMarketTileLandBonus(r, c, state.residentialTiers.get(`${r}:${c}`) || 'L', state);
    ultraRichWeight += 1 - strongest * PUBLIC_MARKET_RULES.ultraRichWeightReduction;
  }
  const area = Math.max(1, cols * rows);
  return { nearby, qualityBonus: qualityBonus / area, landValueCorrection: landValueCorrection / area,
    ultraRichWeight: ultraRichWeight / area };
}

function getPublicMarketCommercialGrowthMultiplier(row, col, state = getPublicMarketState()) {
  let proximity = 0;
  for (const { market, distance } of state.coverage.get(`${row}:${col}`) || []) {
    if (distance > PUBLIC_MARKET_RULES.commercialRadius) continue;
    proximity = Math.max(proximity, publicMarketClamp(
      (PUBLIC_MARKET_RULES.commercialRadius + 1 - distance) / PUBLIC_MARKET_RULES.commercialRadius,
    ) * market.availability);
  }
  return 1 + PUBLIC_MARKET_RULES.commercialGrowthBonus * proximity;
}

function getPublicMarketResidentialTier(row, col, districtTier = 'commoner') {
  const record = typeof buildingData !== 'undefined' ? buildingData[`${row}:${col}`] : null;
  return record?.type === 'residential' && record.wealthTier ? record.wealthTier
    : ({ commoner: 'L', middleClass: 'M', wealthy: 'H', ultraRich: 'UH' }[districtTier] || 'L');
}

function getPublicMarketResidentialGrowthMultiplier(row, col, districtTier = 'commoner') {
  const record = typeof buildingData !== 'undefined' ? buildingData[`${row}:${col}`] : null;
  const effect = getPublicMarketResidentialEffect(row, col,
    record?.footprintCols ?? 1, record?.footprintRows ?? 1,
    getPublicMarketResidentialTier(row, col, districtTier));
  return 1 + effect.qualityBonus;
}

function getPublicMarketMonthlyRevenue() {
  return getPublicMarketState().revenue;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  PUBLIC_MARKET_RULES, computePublicMarketState, publicMarketProximity,
  getPublicMarketResidentialEffect, getPublicMarketTileLandBonus,
  getPublicMarketCommercialGrowthMultiplier,
};
