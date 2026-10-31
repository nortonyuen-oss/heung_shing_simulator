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
// a cart's ground footprint, in tiles (20 m): its 2.3 m counter long side along the lot's edge,
// ~1 m across it (street-food-market.js's STREET_FOOD_STALL_LAYOUT places its centre)
const STREET_FOOD_CART_LONG_TILES = 2.3 / 20;
const STREET_FOOD_CART_DEPTH_TILES = 1.0 / 20;
// 公園燈柱: the 海濱步道's black heritage lamp (typhoon-shelter-assets.js promenadeLamp, 4.2 m), at
// the same true vertical rate as everything else here. Its art: 128 x 256, foot (64, 214), lamp top
// at row 52; the glow canvas typhoon-shelter-sprites.js draws for it is laid on that same grid.
const STREET_FOOD_PARK_LAMP = Object.freeze({
  path: 'Models/typhoonShelter/ts_promenadeLamp_a.png',
  size: [128, 256],
  groundAnchor: [64, 214],
  scale: (4.2 * STREET_FOOD_PEOPLE_PX_PER_METRE_UP) / (214 - 52),
});

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
  // feet on the ground for every pose; a seated diner stands on their stool's point, drawn over it
  const shownM = person.role === 'seated' ? person.heightM * STREET_FOOD_SEATED_HEIGHT_RATIO : person.heightM;
  const figurePx = person.figureHeightPx || person.size[1];
  return { path: person.path, size: person.size, groundAnchor: person.footAnchor, scale: (shownM * STREET_FOOD_PEOPLE_PX_PER_METRE_UP) / figurePx };
}

// 節慶實際預留 > 平日小食墟 (docs/street-food-market-design.md): which event-ground venues a
// festival has actually claimed right now. LNY turns every event ground into a flower market at
// once (layoutLunarNewYear's own gate: a tier, and not its street-only 'after' phase); Bun Hill
// claims the venue of this year's edition for its whole day - before its 18:00 setup (the lot it is
// about to pick; the market opens at 15:00), while it runs, and through the awards, leaving and
// teardown after its 00:15 result, when its run is 'held' but its set still stands until 02:00
// (Norton 2026-10-31: 搶包山活動係咪被大排檔override). The 建議地圖排練 test-mode session
// suspends the real festival update entirely (main.js) and owns every event ground.
const STREET_FOOD_BUN_HILL_PREDICT_MS = 2000;

function getStreetFoodBunHillVenueId(scene) {
  const bunHill = typeof getCityFestivalState === 'function' ? getCityFestivalState()?.bunHill : null;
  const thisEdition = bunHill && bunHill.year === city.year && bunHill.month === city.month;
  if (thisEdition) return ['running', 'held'].includes(bunHill.status) ? bunHill.venue?.id ?? null : null;
  // its day, before it has started: keep clear the lot it will choose
  if (typeof getFestivalMonth !== 'function' || city.month !== getFestivalMonth('bunHill', city.year)) return null;
  if (typeof isFestivalEnabled === 'function' && !isFestivalEnabled('bunHill')) return null;
  if (typeof getFestivalTier === 'function' && getFestivalTier('bunHill') === 'skip') return null;
  if (typeof getFestivalHistoryEntry === 'function' && getFestivalHistoryEntry('bunHill', city.year)?.outcome === 'held') return null;
  if (typeof selectBunHillVenue !== 'function' || typeof getBunHillMapVenueContext !== 'function') return null;
  const now = scene?.time?.now ?? 0;
  const cache = scene?.streetFoodBunHillPrediction;
  if (cache && cache.month === city.month && cache.year === city.year && now < cache.until) return cache.id;
  const state = getCityFestivalState?.();
  const id = selectBunHillVenue(getBunHillMapVenueContext(scene), state?.venues?.bunHill || '')?.id ?? null;
  if (scene) scene.streetFoodBunHillPrediction = { year: city.year, month: city.month, until: now + STREET_FOOD_BUN_HILL_PREDICT_MS, id };
  return id;
}

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
  const bunHillVenueId = getStreetFoodBunHillVenueId(scene);
  return (venue) => venue.id === bunHillVenueId;
}

// A fractional (row, col)'s screen point and sort depth: the tile it falls in gives the ground face
// (and its elevation), the fraction slides along it, the same way festival-sprites.js's fractional
// placements do. Depth sorts on the point itself, so a hawker behind a counter or a diner across
// a table lands behind or in front of it by where it actually stands.
function getStreetFoodTilePoint(scene, row, col) {
  const baseRow = Math.round(row), baseCol = Math.round(col);
  const geo = getTileFaceGeometry(baseRow, baseCol, scene.offsetX, scene.offsetY);
  const centre = isoToScreen(baseCol, baseRow), shifted = isoToScreen(col, row);
  return {
    x: geo.center.x + shifted.x - centre.x,
    y: geo.center.y + shifted.y - centre.y,
    depth: getBuildingSortDepth(shifted.y, 1, 1, 0),
  };
}

// Which screen diagonal a step along the map axis runs on under the current rotation: 'down'
// (toward the lower right, +0.5) or 'up' (toward the upper right, -0.5).
function getStreetFoodScreenDiagonal(axis) {
  const a = isoToScreen(0, 0), b = axis === 'col' ? isoToScreen(1, 0) : isoToScreen(0, 1);
  return (b.x - a.x) * (b.y - a.y) > 0 ? 'down' : 'up';
}

// A cart's sprite anchor is its lowest pixel - the counter's front corner, not its middle - so the
// footprint's screen-lowest corner is where it goes; and the art (or its mirror) is chosen so the
// counter's long side runs along the lot's edge.
function getStreetFoodCartPlacement(cart, stall) {
  const half = { row: 0, col: 0 };
  half[stall.alongAxis] = STREET_FOOD_CART_LONG_TILES / 2;
  half[stall.alongAxis === 'col' ? 'row' : 'col'] = STREET_FOOD_CART_DEPTH_TILES / 2;
  let front = null;
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sr, sc]) => {
    const corner = { row: stall.row + sr * half.row, col: stall.col + sc * half.col };
    const y = isoToScreen(corner.col, corner.row).y;
    if (!front || y > front.y) front = { ...corner, y };
  });
  const mirrored = Boolean(cart.mirrorPath) && getStreetFoodScreenDiagonal(stall.alongAxis) !== (cart.longLine || 'up');
  return { row: front.row, col: front.col, mirrored };
}

// Places one sprite from a street-food art record {path, size:[w,h], groundAnchor:[x,y], scale}.
// `record` null/undefined (asset not yet resolved, or this slot has nothing to show) removes it.
// `record.textureKey` draws a texture the game already loaded (a roadside prop) by its own key,
// `record.path` still naming its logical file for the staged-copy pixel mapping. `options.lit`
// marks a light source: drawn untinted by night instead of taking the night prop tint.
function drawStreetFoodSprite(scene, store, id, record, point, depthBump = 0, options = {}) {
  if (!record) { store.get(id)?.destroy(); store.delete(id); return null; }
  const key = record.textureKey || getStreetFoodSpriteTextureKey(record.path);
  if (!scene.textures.exists(key)) {
    if (!record.textureKey) requestStreetFoodTextures(scene, [record.path]);
    return store.get(id) ?? null;
  }
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
  if (options.lit) sprite.clearTint();
  else if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprite);
  return sprite;
}

// Whether the lot's lamps and string lights are on: with the street lamps (street-lamps.js) - the
// same night/weather threshold, hysteresis and View-menu lights toggle.
function areStreetFoodLightsLit(scene) {
  return typeof streetLampsShouldBeLit === 'function' && streetLampsShouldBeLit(scene);
}

// A park lamp post, with its warm glow over it by night: the glow canvas the 海濱步道 lamps use
// (typhoon-shelter-sprites.js), placed on the lamp art's own grid the same way.
function drawStreetFoodLamp(scene, store, lamp, lit, wanted) {
  const point = getStreetFoodTilePoint(scene, lamp.row, lamp.col);
  wanted.add(lamp.id);
  const sprite = drawStreetFoodSprite(scene, store, lamp.id, STREET_FOOD_PARK_LAMP, point);
  const glowId = `${lamp.id}|glow`;
  const glowKey = lit && sprite && typeof ensureTyphoonShelterLampGlowTexture === 'function' ? ensureTyphoonShelterLampGlowTexture(scene) : null;
  if (!glowKey) { store.get(glowId)?.destroy(); store.delete(glowId); return; }
  wanted.add(glowId);
  let glow = store.get(glowId);
  if (!glow) {
    glow = scene.add.image(0, 0, glowKey);
    if (scene.worldMask && typeof glow.setMask === 'function') glow.setMask(scene.worldMask);
    store.set(glowId, glow);
  }
  const glass = TYPHOON_SHELTER_LAMP_GLASS, pad = TYPHOON_SHELTER_LAMP_GLOW_PAD, k = STREET_FOOD_PARK_LAMP.scale;
  const [footX, footY] = STREET_FOOD_PARK_LAMP.groundAnchor;
  glow.setOrigin((glass.x + pad) / glow.frame.width, glass.y / glow.frame.height);
  glow.setScale(k);
  glow.setPosition(point.x + (glass.x - footX) * k, point.y + (glass.y - footY) * k);
  glow.setDepth(point.depth + 0.01);
  glow.setVisible(true);
}

// 電箱: the roadside utility cabinet (street-furniture.js) at its own roadside size and view, so a
// box in the lot matches one at the kerb outside it; the lot's edge stands in for the kerb.
function drawStreetFoodCabinet(scene, store, cabinet, wanted) {
  if (typeof streetFurnitureView !== 'function' || typeof STREET_FURNITURE_TEXTURE_FILES === 'undefined') return;
  const textureKey = streetFurnitureTextureKey('cabinet', streetFurnitureView({ side: cabinet.side }));
  wanted.add(cabinet.id);
  drawStreetFoodSprite(scene, store, cabinet.id, {
    textureKey,
    path: STREET_FURNITURE_TEXTURE_FILES[textureKey],
    groundAnchor: [STREET_FURNITURE_SOURCE_ANCHOR.x, STREET_FURNITURE_SOURCE_ANCHOR.y],
    scale: streetFurnitureScaleFor('cabinet'),
  }, getStreetFoodTilePoint(scene, cabinet.row, cabinet.col));
}

// 排檔燈串: one two-pole span, the art (or its mirror) whose pole line runs on the same screen
// diagonal as the span, its left-hand pole's foot on the span's left-hand end. By night it wears
// the lit bulbs over their baked pool of light, as a street lamp wears its __lit bake.
function drawStreetFoodString(scene, store, span, lit, wanted) {
  const dir = getStreetFoodScreenDiagonal(span.axis);
  const art = typeof getStreetFoodLighting === 'function'
    ? (lit && getStreetFoodLighting('glow', dir)) || getStreetFoodLighting('day', dir) : null;
  if (!art?.scale) return;
  const ends = [span.a, span.b].map((end) => ({ end, x: isoToScreen(end.col, end.row).x }));
  const left = ends[0].x <= ends[1].x ? ends[0].end : ends[1].end;
  const anchor = art.groundAnchors[0][0] <= art.groundAnchors[1][0] ? art.groundAnchors[0] : art.groundAnchors[1];
  const mid = { row: (span.a.row + span.b.row) / 2, col: (span.a.col + span.b.col) / 2 };
  const point = { ...getStreetFoodTilePoint(scene, left.row, left.col), depth: getStreetFoodTilePoint(scene, mid.row, mid.col).depth };
  wanted.add(span.id);
  drawStreetFoodSprite(scene, store, span.id, { path: art.path, groundAnchor: anchor, scale: art.scale }, point, 0, { lit: lit && art.path.includes('__glow') });
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
  const lit = areStreetFoodLightsLit(scene);

  (layout.lamps || []).forEach((lamp) => drawStreetFoodLamp(scene, store, lamp, lit, wanted));
  (layout.cabinets || []).forEach((cabinet) => drawStreetFoodCabinet(scene, store, cabinet, wanted));
  (layout.strings || []).forEach((span) => drawStreetFoodString(scene, store, span, lit, wanted));

  (layout.stalls || []).forEach((stall) => {
    const cart = typeof getStreetFoodCart === 'function' ? getStreetFoodCart(stall.cartId) : null;
    wanted.add(stall.id);
    if (cart) {
      const placement = getStreetFoodCartPlacement(cart, stall);
      const record = placement.mirrored ? { ...cart, path: cart.mirrorPath, groundAnchor: cart.mirrorGroundAnchor } : cart;
      // drawn from its front corner but sorted on its footprint's centre: a hawker just outside a
      // near-side edge's cart stands in front of it, though not past its long side's front corner
      const point = { ...getStreetFoodTilePoint(scene, placement.row, placement.col), depth: getStreetFoodTilePoint(scene, stall.row, stall.col).depth };
      drawStreetFoodSprite(scene, store, stall.id, record, point);
    }
    const hawkerId = `${stall.id}|hawker`;
    wanted.add(hawkerId);
    drawStreetFoodSprite(scene, store, hawkerId, streetFoodPersonRecord(stall.hawkerId),
      getStreetFoodTilePoint(scene, stall.hawker.row, stall.hawker.col));
    (stall.queue || []).forEach((person) => {
      wanted.add(person.id);
      drawStreetFoodSprite(scene, store, person.id, streetFoodPersonRecord(person.personId), getStreetFoodTilePoint(scene, person.row, person.col));
    });
  });

  (layout.tables || []).forEach((table) => {
    const furniture = typeof getStreetFoodFurniture === 'function' ? getStreetFoodFurniture(table.tableId) : null;
    wanted.add(table.id);
    drawStreetFoodSprite(scene, store, table.id, furniture, getStreetFoodTilePoint(scene, table.row, table.col));
    (table.stools || []).forEach((stool) => {
      const stoolPoint = getStreetFoodTilePoint(scene, stool.row, stool.col);
      const stoolArt = stool.stoolId && typeof getStreetFoodFurniture === 'function' ? getStreetFoodFurniture(stool.stoolId) : null;
      if (stoolArt) {
        wanted.add(stool.id);
        drawStreetFoodSprite(scene, store, stool.id, stoolArt, stoolPoint);
      }
      if (stool.seatedId) {
        // the sitter sorts just over their own stool, wherever it is around the table
        const seatId = `${stool.id}|seated`;
        wanted.add(seatId);
        drawStreetFoodSprite(scene, store, seatId, streetFoodPersonRecord(stool.seatedId), stoolPoint, 0.001);
      }
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

// ── 空地資料面板: per-lot 自動／停用 ───────────────────────────────────────────────────────
// A player can keep the market off one lot (it keeps its lamp posts and boxes). The choice is a
// field on each of the lot's event_ground building records (saved with them, like a customName);
// a lot is off if any of its tiles is, so a tile added to an off lot stays off with it.
function isStreetFoodVenueDisabled(venue) {
  if (typeof buildingData === 'undefined') return false;
  return venue.tiles.some(([r, c]) => buildingData[`${r}:${c}`]?.streetFood === 'off');
}

function findStreetFoodVenueAt(scene, row, col) {
  const ctx = typeof getFestivalVenueContext === 'function' ? getFestivalVenueContext(scene) : { eventGrounds: [] };
  return (ctx.eventGrounds || []).find((venue) => venue.tiles.some(([r, c]) => r === row && c === col)) || null;
}

/**
 * What the inspect panel says about the market on the lot holding (row, col): whether it is on
 * at all and why not, plus a typical evening's size. null when the tile is not an event ground.
 */
function getStreetFoodVenueStatus(scene, row, col) {
  const venue = findStreetFoodVenueAt(scene, row, col);
  if (!venue) return null;
  const disabled = isStreetFoodVenueDisabled(venue);
  const act = typeof isPolicyActive === 'function' && isPolicyActive('nightBazaarWeekend');
  const minuteOfDay = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : Number(city?.timeOfDayMinutes) || 0;
  let status;
  if (!act) status = 'noAct';
  else if (disabled) status = 'off';
  else if (getStreetFoodClaimedPredicate(scene)(venue)) status = 'festival';
  else if (getStreetFoodWeatherState(city?.weather) === 'closed') status = 'weather';
  else {
    const phase = getStreetFoodPhase(minuteOfDay).phase;
    status = phase === 'empty' ? 'waiting' : phase;
  }
  // a typical 19:00 on this lot, whatever the hour now
  const typical = getStreetFoodVenueLayout(venue, {
    minuteOfDay: 19 * 60, weather: { condition: 'clear' }, seed: venue.id, ...getStreetFoodRoster(),
  });
  return { venue, disabled, status, tiles: venue.tiles.length, stalls: typical.stalls.length, tables: typical.tables.length };
}

function setStreetFoodVenueDisabled(scene, venue, disabled) {
  venue.tiles.forEach(([r, c]) => {
    const record = buildingData[`${r}:${c}`];
    if (!record) return;
    if (disabled) record.streetFood = 'off';
    else delete record.streetFood;
  });
  if (scene) scene.streetFoodNextUpdateAt = 0; // redraw on the next frame, not in 400 ms
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
}

// The inspect panel's button: flip the lot under the inspected tile, then redraw the panel.
function toggleInspectedStreetFoodVenue() {
  if (typeof activeScene === 'undefined' || !activeScene || typeof lastInspectTile === 'undefined' || !lastInspectTile) return;
  const { row, col } = lastInspectTile;
  const venue = findStreetFoodVenueAt(activeScene, row, col);
  if (!venue) return;
  setStreetFoodVenueDisabled(activeScene, venue, !isStreetFoodVenueDisabled(venue));
  if (typeof showInspectPanel === 'function') showInspectPanel(activeScene, row, col);
}

function buildStreetFoodInspectHtml(scene, row, col) {
  const info = getStreetFoodVenueStatus(scene, row, col);
  if (!info) return '';
  const warn = ['noAct', 'off', 'weather'].includes(info.status);
  return `
    <div class="insp-row insp-bldg-name">🏮 ${t('streetFood.inspectTitle')}</div>
    <div class="insp-row ${warn ? 'insp-warn' : 'insp-ok'}">${t(`streetFood.status.${info.status}`)}</div>
    <div class="insp-row insp-muted">${t('streetFood.size', { tiles: info.tiles, stalls: info.stalls, tables: info.tables })}</div>
    <div class="insp-row">${t('streetFood.mode', { mode: t(info.disabled ? 'streetFood.modeOff' : 'streetFood.modeAuto') })}</div>
    <button class="insp-action-btn" type="button" onclick="toggleInspectedStreetFoodVenue()">${t(info.disabled ? 'streetFood.enable' : 'streetFood.disable')}</button>`;
}

function getStreetFoodRoster() {
  return {
    carts: typeof getStreetFoodCartIds === 'function' ? getStreetFoodCartIds() : [],
    hawkers: typeof getStreetFoodPeopleByRole === 'function' ? getStreetFoodPeopleByRole('hawker') : [],
    queuers: typeof getStreetFoodPeopleByRole === 'function'
      ? ['diner-family', 'diner-couple', 'diner-elderly'].flatMap((role) => getStreetFoodPeopleByRole(role)) : [],
    diners: typeof getStreetFoodPeopleByRole === 'function' ? getStreetFoodPeopleByRole('seated') : [],
    passersby: typeof getStreetFoodPeopleByRole === 'function' ? getStreetFoodPeopleByRole('passerby') : [],
    tableFurniture: getStreetFoodTableFurnitureIds(),
    stools: ['foldingStoolRed', 'foldingStoolGreen'].filter((id) => typeof getStreetFoodFurniture === 'function' && getStreetFoodFurniture(id)),
    stringSpanM: (typeof getStreetFoodLighting === 'function' && getStreetFoodLighting('day', 'down')?.spanM) || undefined,
  };
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
  // 香城夜繽週: no act, no market (the lots keep their lamp posts and boxes)
  const enabled = typeof isPolicyActive === 'function' && isPolicyActive('nightBazaarWeekend');
  const roster = getStreetFoodRoster();

  const wantedIds = new Set();
  const activeVenueIds = new Set(venues.map((v) => v.id));
  venues.forEach((venue) => {
    const layout = getStreetFoodVenueLayout(venue, { minuteOfDay, enabled: enabled && !isStreetFoodVenueDisabled(venue), weather: city.weather, seed: venue.id, ...roster });
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
  getStreetFoodSpriteTextureKey, getStreetFoodClaimedPredicate, getStreetFoodBunHillVenueId, getStreetFoodTilePoint,
  updateStreetFoodMarkets, clearAllStreetFoodSprites, getStreetFoodTableFurnitureIds,
  isStreetFoodVenueDisabled, setStreetFoodVenueDisabled, getStreetFoodVenueStatus, buildStreetFoodInspectHtml,
};
