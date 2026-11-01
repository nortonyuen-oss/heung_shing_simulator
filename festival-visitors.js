// 行花市: people browsing the 年宵 flower markets (Norton 2026-10-31: 花市現在沒有市民，應該要加返啲人
// 行花市). They stand in the aisles between the stalls - wherever the stalls of one market leave room -
// at the 20 m tile's true size: the street-food market's people (street-food-assets.js), drawn with its
// sprite helper (street-food-sprites.js drawStreetFoodSprite). Nothing is stored or saved: each market's
// crowd is a seeded pick of its free aisle points, shuffled every few game minutes, so a reload or a
// rotated map shows the same people. No visitors while the stalls are going up (bare tents).

const FESTIVAL_VISITOR_UPDATE_MS = 600;
const FESTIVAL_VISITOR_GRID_M = 1.5;        // candidate spots, across the market's ground
const FESTIVAL_VISITOR_STALL_CLEAR_M = 0.5; // beyond a stall's own half-diagonal
const FESTIVAL_VISITOR_AISLE_REACH_M = 4;   // no further than this from a stall: the aisles, not the open field
const FESTIVAL_VISITOR_EDGE_M = 1;          // beyond the outermost stalls' centres, no further: the market, not the lawn
const FESTIVAL_VISITOR_SHARE = 0.35;        // of the free spots
const FESTIVAL_VISITOR_PER_STALL = 1.3;     // a market's cap, by its stalls
const FESTIVAL_VISITOR_MAX = 320;           // all markets together
const FESTIVAL_VISITOR_SHUFFLE_MIN = 4;     // game minutes between reshuffles
const FESTIVAL_VISITOR_ROLES = Object.freeze(['passerby', 'diner-family', 'diner-couple', 'diner-elderly']);

function festivalVisitorHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

// Screen <-> ground metres: the isometric projection is the same on screen whatever the map's rotation,
// so the screen's own ground axes serve (a tile is 100 x 50 px and 20 m a side).
const festivalVisitorToGround = (x, y) => ({ c: (x / 50 + y / 25) * 10, r: (y / 25 - x / 50) * 10 });
const festivalVisitorToScreen = (c, r) => ({ x: (c - r) * 2.5, y: (c + r) * 1.25 });

/** The 年宵 stalls now standing, grouped into their markets: [{ key, stalls: [{ c, r, radius, x, y, depth, perY }] }]. */
function getFestivalVisitorMarkets(scene) {
  const markets = new Map();
  let anySold = false;
  (scene?.festivalSprites ? [...scene.festivalSprites.values()] : []).forEach((sprite) => {
    const placement = sprite.festivalPlacement;
    if (placement?.festival !== 'lunarNewYear' || !placement.stall || sprite.active === false) return;
    if (placement.partId !== 'lnyStallEmpty') anySold = true;
    const point = typeof getFestivalPlacementPoint === 'function' ? getFestivalPlacementPoint(scene, placement) : null;
    if (!point) return;
    const key = placement.marketVenueId || (placement.mode === 'tile'
      ? String(placement.id).split(':').slice(1, 4).join(':') : placement.buildingId);
    const foot = placement.footprintM || { width: 2, depth: 2 };
    // depth climbs with screen y at the rate its placement mode gives (festival-sprites.js
    // getFestivalPlacementPoint): a building's art pixels, or a tile's
    const building = placement.mode === 'building' ? scene.buildingSprites?.get(placement.buildingId) : null;
    const perY = 1 / (100000 * (building?.scaleY || 1));
    if (!markets.has(key)) markets.set(key, { key, stalls: [], eventGround: placement.mode === 'tile' });
    markets.get(key).stalls.push({ ...festivalVisitorToGround(point.x, point.y), x: point.x, y: point.y, depth: point.depth, perY,
      radius: Math.hypot(foot.width, foot.depth) / 2 });
  });
  return anySold ? [...markets.values()] : [];
}

/** Where a market's visitors stand: its free aisle spots, a seeded share of them. Pure given its stalls. */
function pickFestivalVisitorSpots(market, window, onGround = () => true) {
  const { stalls } = market;
  if (!stalls.length) return [];
  const edge = FESTIVAL_VISITOR_EDGE_M;
  const cs = stalls.map((s) => s.c), rs = stalls.map((s) => s.r);
  const spots = [];
  for (let c = Math.min(...cs) - edge; c <= Math.max(...cs) + edge; c += FESTIVAL_VISITOR_GRID_M) {
    for (let r = Math.min(...rs) - edge; r <= Math.max(...rs) + edge; r += FESTIVAL_VISITOR_GRID_M) {
      let near = false, clear = true;
      for (const s of stalls) {
        const d = Math.hypot(c - s.c, r - s.r);
        if (d < s.radius + FESTIVAL_VISITOR_STALL_CLEAR_M) { clear = false; break; }
        if (d < s.radius + FESTIVAL_VISITOR_AISLE_REACH_M) near = true;
      }
      if (clear && near && onGround(c, r)) spots.push({ c, r });
    }
  }
  const cap = Math.round(stalls.length * FESTIVAL_VISITOR_PER_STALL);
  const count = Math.min(cap, Math.round(spots.length * FESTIVAL_VISITOR_SHARE));
  return spots
    .map((spot, i) => ({ spot, i, rank: festivalVisitorHash(`${market.key}:${i}:${window}`) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map(({ spot, i }) => {
      // a little give either way, so they do not stand on a grid
      const jc = (festivalVisitorHash(`${market.key}:${i}:${window}:c`) - 0.5) * FESTIVAL_VISITOR_GRID_M * 0.6;
      const jr = (festivalVisitorHash(`${market.key}:${i}:${window}:r`) - 0.5) * FESTIVAL_VISITOR_GRID_M * 0.6;
      return { id: `${market.key}:${i}`, c: spot.c + jc, r: spot.r + jr };
    });
}

function clearFestivalVisitors(scene) {
  scene?.festivalVisitorSprites?.forEach((sprite) => sprite.destroy());
  scene?.festivalVisitorSprites?.clear();
}

function updateFestivalVisitors(scene, time) {
  if (!scene || time < (scene.festivalVisitorNextAt || 0)) return;
  scene.festivalVisitorNextAt = time + FESTIVAL_VISITOR_UPDATE_MS;
  const markets = getFestivalVisitorMarkets(scene);
  if (!markets.length || typeof drawStreetFoodSprite !== 'function' || typeof streetFoodPersonRecord !== 'function') {
    if (scene.festivalVisitorSprites?.size) clearFestivalVisitors(scene);
    return;
  }
  if (!(typeof getStreetFoodAssets === 'function' && getStreetFoodAssets())) {
    if (typeof loadStreetFoodAssets === 'function') loadStreetFoodAssets().catch((error) => console.warn('[festival visitors]', error?.message));
    return;
  }
  if (!scene.festivalVisitorSprites) scene.festivalVisitorSprites = new Map();
  const store = scene.festivalVisitorSprites;
  const people = FESTIVAL_VISITOR_ROLES.flatMap((role) => getStreetFoodPeopleByRole(role));
  if (!people.length) return;
  const minute = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : Number(city?.timeOfDayMinutes) || 0;
  const window = Math.floor(minute / FESTIVAL_VISITOR_SHUFFLE_MIN);
  const wanted = new Set();
  let total = 0;
  // an event-ground market's people stay on its paving (its grounds are tiles; a park's are inside its art)
  const onEventGround = (c, r) => {
    if (typeof screenPointToTile !== 'function' || typeof buildingData === 'undefined') return true;
    const at = festivalVisitorToScreen(c, r);
    const tile = screenPointToTile(scene, at.x, at.y);
    return !!tile && buildingData[`${tile.row}:${tile.col}`]?.type === 'event_ground';
  };
  markets.forEach((market) => {
    pickFestivalVisitorSpots(market, window, market.eventGround ? onEventGround : undefined).forEach((spot) => {
      if (total >= FESTIVAL_VISITOR_MAX) return;
      total += 1;
      const at = festivalVisitorToScreen(spot.c, spot.r);
      // sort among the stalls by the nearest one's own depth scheme
      const near = market.stalls.reduce((best, s) => (Math.abs(s.y - at.y) < Math.abs(best.y - at.y) ? s : best), market.stalls[0]);
      const id = `lnyVisitor:${spot.id}`;
      const personId = people[Math.floor(festivalVisitorHash(`${spot.id}:${window}:who`) * people.length)];
      wanted.add(id);
      drawStreetFoodSprite(scene, store, id, streetFoodPersonRecord(personId), { x: at.x, y: at.y, depth: near.depth + (at.y - near.y) * near.perY });
    });
  });
  store.forEach((sprite, id) => {
    if (wanted.has(id)) return;
    if (typeof releaseStreetFoodSprite === 'function') releaseStreetFoodSprite(scene, sprite); else sprite.destroy();
    store.delete(id);
  });
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  pickFestivalVisitorSpots, getFestivalVisitorMarkets, updateFestivalVisitors, clearFestivalVisitors,
  festivalVisitorToGround, festivalVisitorToScreen,
};
