// 平日小食墟 drawing: turns street-food-market.js's per-venue layout into Phaser sprites. Same
// split as typhoon-shelter-fleet.js (pure) / typhoon-shelter-sprites.js (drawing) - this file owns
// Phaser, scene state and the festival-claim check; street-food-market.js stays pure.

const STREET_FOOD_UPDATE_MS = 400; // a market's layout does not need redoing every frame
// People are sized on the same tile-true basis as the carts (人既比例也一樣 - Norton 2026-10-18):
// their real height at the TRUE vertical rate of a 20 m tile, ALONG 2.5 px/m x cos30/cos45 =
// 3.06 px/m (BUILDING_SCALE_TRUE_UP_RATIO), not festival-sprites.js's exaggerated 5 px/m.
const STREET_FOOD_PEOPLE_PX_PER_METRE_UP = 2.5 * (Math.cos(Math.PI / 6) / Math.cos(Math.PI / 4));
// A seated diner's head sits at about 0.75 of standing stature (a ~0.45 m stool, then a hunched
// sitting height). heightM in street-food-people.json is the standing figure's.
const STREET_FOOD_SEATED_HEIGHT_RATIO = 0.75;
// people around a cart/table, in tiles (20 m): a hawker ~1 m behind the counter, a diner ~0.8 m out
// from the table's centre (a 1 m table, a stool's depth beyond its rim)
const STREET_FOOD_HAWKER_BACK_TILES = 1 / 20 / Math.SQRT2;
const STREET_FOOD_SEAT_OFFSET_TILES = 0.8 / 20;

function getStreetFoodSpriteTextureKey(path) { return `street-food:${path}`; }

function requestStreetFoodTextures(scene, paths) {
  const missing = [...new Set(paths.filter(Boolean))].filter((p) => !scene.textures.exists(getStreetFoodSpriteTextureKey(p)));
  if (!missing.length) return;
  missing.forEach((p) => scene.load.image(getStreetFoodSpriteTextureKey(p),
    typeof resolveModelAssetPath === 'function' ? resolveModelAssetPath(p) : p));
  if (!scene.load.isLoading()) scene.load.start();
}

function streetFoodPersonRecord(id) {
  const person = typeof getStreetFoodPerson === 'function' ? getStreetFoodPerson(id) : null;
  if (!person) return null;
  // feet on the ground for every pose: no stool is drawn under a seated diner yet, so its seat
  // point has nothing to rest on
  const shownM = person.role === 'seated' ? person.heightM * STREET_FOOD_SEATED_HEIGHT_RATIO : person.heightM;
  const figurePx = person.figureHeightPx || person.size[1];
  return { path: person.path, size: person.size, groundAnchor: person.footAnchor, scale: (shownM * STREET_FOOD_PEOPLE_PX_PER_METRE_UP) / figurePx };
}

// 節慶實際預留 > 平日小食墟 (docs/street-food-market-design.md): which event-ground venues a
// festival has actually claimed right now. LNY turns every event ground into a flower market at
// once (layoutLunarNewYear's own gate: a tier, and not its street-only 'after' phase); Bun Hill
// claims only the one venue its live run picked (festivals.js's city.festivals state, not the
// 建議地圖排練 test-mode session, which suspends the real festival update entirely - main.js).
function getStreetFoodClaimedPredicate(scene) {
  if (typeof city === 'undefined') return () => false;
  if (scene?.bunHillEventSession) return () => true; // the map rehearsal owns every event ground
  const minuteOfDay = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : Number(city.timeOfDayMinutes) || 0;
  const active = typeof getActiveFestivals === 'function'
    ? getActiveFestivals({ year: city.year, month: city.month, minuteOfDay }) : [];
  const lny = active.find((f) => f.id === 'lunarNewYear');
  if (lny && lny.phase !== 'after' && typeof getFestivalTier === 'function' && getFestivalTier('lunarNewYear') !== 'skip') {
    return () => true;
  }
  const bunHill = typeof getCityFestivalState === 'function' ? getCityFestivalState()?.bunHill : null;
  const bunHillVenueId = bunHill?.status === 'running' ? bunHill.venue?.id ?? null : null;
  return (venue) => venue.id === bunHillVenueId;
}

// A tile's screen point and sort depth, the same convention festival ground placements use
// (festival-sprites.js's getFestivalPlacementPoint, mode:'tile'). dRow/dCol nudge the point a
// fraction of a tile within it, the same way a festival placement's fractional row/col does.
function getStreetFoodTilePoint(scene, row, col, dRow = 0, dCol = 0) {
  const geo = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY);
  let x = geo.center.x, y = geo.center.y;
  if (dRow || dCol) {
    const centre = isoToScreen(col, row), shifted = isoToScreen(col + dCol, row + dRow);
    x += shifted.x - centre.x; y += shifted.y - centre.y;
  }
  return { x, y, depth: getBuildingSortDepth(getBuildingAnchor(row, col, 1, 1).y, 1, 1, 0) };
}

// Places one sprite from a street-food art record {path, size:[w,h], groundAnchor:[x,y], scale}.
// `record` null/undefined (asset not yet resolved, or this slot has nothing to show) removes it.
function drawStreetFoodSprite(scene, store, id, record, point, depthBump = 0) {
  if (!record) { store.get(id)?.destroy(); store.delete(id); return; }
  const key = getStreetFoodSpriteTextureKey(record.path);
  if (!scene.textures.exists(key)) { requestStreetFoodTextures(scene, [record.path]); return; }
  let sprite = store.get(id);
  if (!sprite) {
    sprite = scene.add.image(0, 0, key);
    if (scene.worldMask && typeof sprite.setMask === 'function') sprite.setMask(scene.worldMask);
    store.set(id, sprite);
  }
  if (sprite.texture.key !== key) sprite.setTexture(key);
  const frame = sprite.frame;
  const mapping = typeof getModelTexturePixelMapping === 'function'
    ? getModelTexturePixelMapping(record.path, { width: frame.width, height: frame.height })
    : { resize: 1, offsetX: 0, offsetY: 0 };
  const ax = record.groundAnchor[0] * mapping.resize + mapping.offsetX;
  const ay = record.groundAnchor[1] * mapping.resize + mapping.offsetY;
  sprite.setOrigin(ax / frame.width, ay / frame.height);
  sprite.setScale(record.scale / mapping.resize);
  sprite.setPosition(point.x, point.y);
  sprite.setDepth(point.depth + depthBump);
  sprite.setVisible(true);
  if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
}

/**
 * Draws (or removes) every stall, hawker, table, seated diner and passerby the layout wants on
 * one venue, keyed by the ids street-food-market.js already gave them (stable across a reload/a
 * rotated map/a fast-forward, since they come from the venue's own tiles and the clock - nothing
 * here is ever read back from a save). Returns the set of ids it drew, for the caller's sweep.
 */
function syncStreetFoodVenue(scene, layout) {
  if (!scene.streetFoodSprites) scene.streetFoodSprites = new Map();
  const store = scene.streetFoodSprites;
  const wanted = new Set();

  (layout.stalls || []).forEach((stall) => {
    const cart = typeof getStreetFoodCart === 'function' ? getStreetFoodCart(stall.cartId) : null;
    const record = cart && stall.mirrored && cart.mirrorPath
      ? { ...cart, path: cart.mirrorPath, groundAnchor: cart.mirrorGroundAnchor }
      : cart;
    const point = getStreetFoodTilePoint(scene, stall.row, stall.col);
    wanted.add(stall.id);
    drawStreetFoodSprite(scene, store, stall.id, record, point);
    // the hawker works from behind the counter, the opposite side from the venue it faces into:
    // about a metre back (offsets are in tiles - 20 m each)
    const hawkerSide = stall.mirrored ? 1 : -1;
    const hawkerPoint = getStreetFoodTilePoint(scene, stall.row, stall.col,
      -STREET_FOOD_HAWKER_BACK_TILES * hawkerSide, STREET_FOOD_HAWKER_BACK_TILES * hawkerSide);
    const hawkerId = `${stall.id}|hawker`;
    wanted.add(hawkerId);
    drawStreetFoodSprite(scene, store, hawkerId, streetFoodPersonRecord(stall.hawkerId), hawkerPoint, 0.001);
  });

  // a seat around the table at each of 4 compass points, ~0.8 m from the 1 m table's centre
  const d = STREET_FOOD_SEAT_OFFSET_TILES;
  const STREET_FOOD_SEAT_OFFSETS = [[d, 0], [0, d], [-d, 0], [0, -d]];
  (layout.tables || []).forEach((table) => {
    const furniture = typeof getStreetFoodFurniture === 'function' ? getStreetFoodFurniture(table.tableId) : null;
    const point = getStreetFoodTilePoint(scene, table.row, table.col);
    wanted.add(table.id);
    drawStreetFoodSprite(scene, store, table.id, furniture, point);
    table.seatedIds.forEach((personId, seat) => {
      const [dRow, dCol] = STREET_FOOD_SEAT_OFFSETS[seat % STREET_FOOD_SEAT_OFFSETS.length];
      const seatPoint = getStreetFoodTilePoint(scene, table.row, table.col, dRow, dCol);
      const seatId = `${table.id}|seat${seat}`;
      wanted.add(seatId);
      drawStreetFoodSprite(scene, store, seatId, streetFoodPersonRecord(personId), seatPoint, 0.0005);
    });
  });

  (layout.walkers || []).forEach((walker) => {
    const point = getStreetFoodTilePoint(scene, walker.row, walker.col);
    wanted.add(walker.id);
    drawStreetFoodSprite(scene, store, walker.id, streetFoodPersonRecord(walker.personId), point);
  });

  return wanted;
}

function clearStreetFoodVenue(scene, venuePrefix) {
  if (!scene.streetFoodSprites) return;
  scene.streetFoodSprites.forEach((sprite, id) => {
    if (id.startsWith(venuePrefix)) { sprite.destroy(); scene.streetFoodSprites.delete(id); }
  });
}

function getStreetFoodTableFurnitureIds() {
  const assets = typeof getStreetFoodAssets === 'function' ? getStreetFoodAssets() : null;
  if (!assets) return [];
  // the open (not folded) round tables - stools/packed stacks are decorative clutter, not yet
  // placed of their own accord
  return [...assets.furniture.keys()].filter((id) => id.startsWith('roundTable') && id !== 'roundTableFolded');
}

function updateStreetFoodMarkets(scene, time) {
  if (!scene || typeof city === 'undefined') return;
  if (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) return;
  if (time < (scene.streetFoodNextUpdateAt || 0)) return;
  scene.streetFoodNextUpdateAt = time + STREET_FOOD_UPDATE_MS;

  if (!(typeof getStreetFoodAssets === 'function' && getStreetFoodAssets())) {
    if (typeof loadStreetFoodAssets === 'function') loadStreetFoodAssets().catch((error) => console.warn('[street-food] assets', error?.message));
    return;
  }

  const ctx = typeof getFestivalVenueContext === 'function' ? getFestivalVenueContext(scene) : { eventGrounds: [] };
  const claimed = getStreetFoodClaimedPredicate(scene);
  const venues = typeof getStreetFoodVenues === 'function' ? getStreetFoodVenues(ctx, claimed) : [];
  const minuteOfDay = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : Number(city.timeOfDayMinutes) || 0;
  const roster = {
    carts: typeof getStreetFoodCartIds === 'function' ? getStreetFoodCartIds() : [],
    hawkers: typeof getStreetFoodPeopleByRole === 'function' ? getStreetFoodPeopleByRole('hawker') : [],
    diners: typeof getStreetFoodPeopleByRole === 'function' ? getStreetFoodPeopleByRole('seated') : [],
    passersby: typeof getStreetFoodPeopleByRole === 'function' ? getStreetFoodPeopleByRole('passerby') : [],
    tableFurniture: getStreetFoodTableFurnitureIds(),
  };

  const wantedIds = new Set();
  const activeVenueIds = new Set(venues.map((v) => v.id));
  venues.forEach((venue) => {
    const layout = getStreetFoodVenueLayout(venue, { minuteOfDay, weather: city.weather, seed: venue.id, ...roster });
    syncStreetFoodVenue(scene, layout).forEach((id) => wantedIds.add(id));
  });
  // every event_ground venue not currently wanted (claimed by a festival, or emptied by the
  // schedule/weather) loses its sprites at once, so a festival taking the lot - or the player
  // demolishing it - clears the stalls without waiting for them to individually age out
  (ctx.eventGrounds || []).forEach((venue) => { if (!activeVenueIds.has(venue.id)) clearStreetFoodVenue(scene, `${venue.id}|`); });
  scene.streetFoodSprites?.forEach((sprite, id) => {
    if (!wantedIds.has(id)) { sprite.destroy(); scene.streetFoodSprites.delete(id); }
  });
}

function clearAllStreetFoodSprites(scene) {
  scene?.streetFoodSprites?.forEach((sprite) => sprite.destroy());
  scene?.streetFoodSprites?.clear();
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  getStreetFoodSpriteTextureKey, getStreetFoodClaimedPredicate, getStreetFoodTilePoint,
  updateStreetFoodMarkets, clearAllStreetFoodSprites, getStreetFoodTableFurnitureIds,
};
