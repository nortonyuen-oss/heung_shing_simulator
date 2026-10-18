// 平日小食墟 (docs/street-food-market-design.md): pure day/night schedule, venue discovery and a
// seeded per-venue stall/furniture/people layout. No Phaser dependency, so this half runs under
// node like typhoon-shelter-fleet.js's berths/routes/schedule; street-food-sprites.js turns its
// output into sprites each frame the way typhoon-shelter-sprites.js draws typhoon-shelter-fleet.js's.
//
// A venue never stores which stalls it has: everything here is a pure function of the venue's own
// tiles (an id + a sorted tile list is enough to reseed it identically) plus the clock, so a
// reload, a rotated map or a fast-forward all land on the same stalls without replaying anything.

function sfHash(...parts) {
  let h = 0x811c9dc5;
  parts.forEach((p) => {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  });
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function sfPick(list, seed, ...parts) {
  return list[Math.floor(sfHash(seed, ...parts) * list.length) % list.length];
}

// ── schedule (Norton 2026-10-18: 開日頭放學時候到夜晚宵夜 - after school through 宵夜,
// supersedes the design draft's 09:00-23:00 draft table) ──────────────────────────────────────
// All times are city.timeOfDayMinutes (0 = 00:00); closeFrom/closeDone read past midnight.
const STREET_FOOD_SCHEDULE = Object.freeze({
  openFrom: 15 * 60, // 15:00 放學, carts start arriving
  openFull: 15 * 60 + 30, // 15:30 fully set up
  lateNightFrom: 23 * 60 + 30, // 23:30 晚市 thins into 宵夜 - still fully set up, fewer diners
  closeFrom: 25 * 60 + 30, // 01:30 (wrapped) customers leave, stalls pack up
  closeDone: 26 * 60, // 02:00 (wrapped) lot is bare again
});

function streetFoodWrapMinute(minuteOfDay) {
  const m = Number(minuteOfDay) || 0;
  return m < 6 * 60 ? m + 24 * 60 : m; // the same cutoff festival-venues.js's June4/Yulan use
}

/**
 * The market's phase and how built-up it is (0..1, for fading stalls in/out) at a minute of day.
 * @returns {{ phase: 'empty'|'opening'|'open'|'lateNight'|'closing', presence: number, dinerShare: number }}
 */
function getStreetFoodPhase(minuteOfDay) {
  const m = streetFoodWrapMinute(minuteOfDay), s = STREET_FOOD_SCHEDULE;
  if (m < s.openFrom || m >= s.closeDone) return { phase: 'empty', presence: 0, dinerShare: 0 };
  if (m < s.openFull) return { phase: 'opening', presence: (m - s.openFrom) / (s.openFull - s.openFrom), dinerShare: 0 };
  if (m < s.lateNightFrom) return { phase: 'open', presence: 1, dinerShare: 1 };
  if (m < s.closeFrom) return { phase: 'lateNight', presence: 1, dinerShare: 0.4 };
  return { phase: 'closing', presence: 1 - (m - s.closeFrom) / (s.closeDone - s.closeFrom), dinerShare: 0.15 };
}

// ── weather (street-food-market-design.md "節慶與天氣") ───────────────────────────────────────
/** 'closed' (signal 8+ or black rain: cleared, no stalls), 'rain' (fewer diners, steam/no change
 * to the open-top carts - they have no awning to keep, per the design draft's revision) or 'clear'. */
function getStreetFoodWeatherState(weather) {
  const w = weather || {};
  if (['signal8', 'signal9', 'signal10'].includes(w.typhoonStage) || w.rainWarning === 'black') return 'closed';
  if (w.condition === 'heavyRain' || w.rainWarning === 'red' || w.rainWarning === 'amber') return 'rain';
  if (w.condition === 'showers') return 'lightRain';
  return 'clear';
}

const STREET_FOOD_WEATHER_DINER_SHARE = Object.freeze({ clear: 1, lightRain: 0.75, rain: 0.45, closed: 0 });

// ── venues: event_ground clusters not claimed by a festival right now ─────────────────────────
// `claimed(venue)` is supplied by the caller (street-food-sprites.js's glue), which is where the
// LNY/Bun Hill festival state actually lives; this module only needs the yes/no answer.
function getStreetFoodVenues(ctx, claimed = () => false) {
  const grounds = ctx.eventGrounds || (typeof getEventGroundVenueComponents === 'function'
    ? getEventGroundVenueComponents(ctx.eventGroundTiles || [], ctx.heightOf) : []);
  return grounds.filter((venue) => venue.tiles.length > 0 && !claimed(venue));
}

// Stall/seating targets by venue size (street-food-market-design.md "空地配置"): [minTiles, maxStalls].
const STREET_FOOD_VENUE_CAPACITY = Object.freeze([
  { minTiles: 1, maxTiles: 1, stalls: [3, 4], tables: [0, 1] },
  { minTiles: 2, maxTiles: 2, stalls: [5, 6], tables: [2, 3] },
  { minTiles: 3, maxTiles: 4, stalls: [8, 10], tables: [4, 6] },
  { minTiles: 5, maxTiles: Infinity, stalls: [10, 12], tables: [6, 8] },
]);

function getStreetFoodVenueCapacity(tileCount) {
  return STREET_FOOD_VENUE_CAPACITY.find((tier) => tileCount >= tier.minTiles && tileCount <= tier.maxTiles)
    || STREET_FOOD_VENUE_CAPACITY[STREET_FOOD_VENUE_CAPACITY.length - 1];
}

/**
 * The perimeter tiles of a venue's tile set, in a stable walking order (so stall slots stay put
 * as the venue is reseeded): tiles with a non-venue or off-map neighbour, ordered by angle around
 * the venue's centre so an L-shaped or odd-shaped lot still walks its own edge in one pass.
 */
function getStreetFoodVenuePerimeter(venue) {
  const cells = new Set(venue.tiles.map(([r, c]) => `${r}:${c}`));
  const cx = venue.tiles.reduce((sum, [, c]) => sum + c, 0) / venue.tiles.length;
  const cy = venue.tiles.reduce((sum, [r]) => sum + r, 0) / venue.tiles.length;
  const perimeter = venue.tiles.filter(([r, c]) => [[r - 1, c], [r, c + 1], [r + 1, c], [r, c - 1]]
    .some(([nr, nc]) => !cells.has(`${nr}:${nc}`)));
  return perimeter
    .map(([r, c]) => ({ r, c, angle: Math.atan2(r - cy, c - cx) }))
    .sort((a, b) => a.angle - b.angle);
}

/**
 * One venue's full layout at a moment: which stalls stand where (each with its cart id, whether
 * it is mirrored, and a facing into the venue), a hawker per stall, table/stool clusters where the
 * perimeter has room left, and a scatter of diners and passersby. Pure given its inputs; the
 * caller supplies the asset rosters (cart/furniture/people ids) so this module carries no art data.
 * @param {{id:string, tiles:number[][]}} venue
 * @param {{minuteOfDay:number, weather:object, seed?:string|number, carts:string[],
 *   hawkers:string[], diners:string[], passersby:string[]}} options
 */
function getStreetFoodVenueLayout(venue, options) {
  const { minuteOfDay, weather, seed = venue.id, carts, hawkers, diners, passersby } = options;
  const schedule = getStreetFoodPhase(minuteOfDay);
  const weatherState = getStreetFoodWeatherState(weather);
  const presence = weatherState === 'closed' ? 0 : schedule.presence;
  if (presence <= 0 || !carts?.length) return { phase: schedule.phase, presence: 0, stalls: [], diners: [] };

  const capacity = getStreetFoodVenueCapacity(venue.tiles.length);
  const stallCount = capacity.stalls[0] + Math.floor(sfHash(seed, 'stallCount') * (capacity.stalls[1] - capacity.stalls[0] + 1));
  const perimeter = getStreetFoodVenuePerimeter(venue);
  if (!perimeter.length) return { phase: schedule.phase, presence: 0, stalls: [], diners: [] };

  // stall slots: evenly spaced around the perimeter, so an L-shaped lot gets stalls along both
  // arms instead of bunched on whichever edge happens to sort first
  const slotCount = Math.min(stallCount, perimeter.length);
  const stalls = [];
  const usedTiles = new Set();
  for (let i = 0; i < slotCount; i++) {
    const tile = perimeter[Math.floor((i / slotCount) * perimeter.length)];
    const key = `${tile.r}:${tile.c}`;
    if (usedTiles.has(key)) continue;
    usedTiles.add(key);
    const cartId = sfPick(carts, seed, 'cart', i);
    // face into the venue: toward its centre from this perimeter tile, mirrored when that is
    // the "other" diagonal (車仔向場內開口)
    const inward = Math.atan2(venue.tiles.reduce((sum, [r]) => sum + r, 0) / venue.tiles.length - tile.r,
      venue.tiles.reduce((sum, [, c]) => sum + c, 0) / venue.tiles.length - tile.c);
    const mirrored = Math.sin(inward) < 0;
    stalls.push({
      id: `${venue.id}|stall${i}`,
      row: tile.r,
      col: tile.c,
      cartId,
      mirrored,
      hawkerId: sfPick(hawkers, seed, 'hawker', i),
      open: schedule.phase !== 'closing' || presence > 0.4,
    });
  }

  // furniture: a table+stool cluster at a share of the remaining perimeter slots, same count target
  const [tablesMin, tablesMax] = capacity.tables;
  const tableCount = Math.min(tablesMin + Math.floor(sfHash(seed, 'tableCount') * (tablesMax - tablesMin + 1)),
    Math.max(0, perimeter.length - slotCount));
  const furnitureTiles = perimeter.filter((tile) => !usedTiles.has(`${tile.r}:${tile.c}`));
  const tables = [];
  for (let i = 0; i < tableCount && i < furnitureTiles.length; i++) {
    const tile = furnitureTiles[Math.floor((i / Math.max(1, tableCount)) * furnitureTiles.length)];
    const key = `${tile.r}:${tile.c}`;
    if (usedTiles.has(key)) continue;
    usedTiles.add(key);
    const seatedShare = sfHash(seed, 'seated', i, Math.floor((minuteOfDay || 0) / 20));
    tables.push({
      id: `${venue.id}|table${i}`,
      row: tile.r,
      col: tile.c,
      occupied: seatedShare < schedule.dinerShare * (STREET_FOOD_WEATHER_DINER_SHARE[weatherState] ?? 1),
      seatedIds: Array.from({ length: 4 }, (_, seat) => sfPick(diners, seed, 'seated', i, seat)),
    });
  }

  // a light scatter of passersby near the venue, density following the diner share
  const dinerShare = schedule.dinerShare * (STREET_FOOD_WEATHER_DINER_SHARE[weatherState] ?? 1);
  const passersbyCount = Math.round(Math.min(4, venue.tiles.length) * dinerShare);
  const walkers = Array.from({ length: passersbyCount }, (_, i) => {
    const tile = perimeter[Math.floor(sfHash(seed, 'walker', i, Math.floor((minuteOfDay || 0) / 10)) * perimeter.length)];
    return { id: `${venue.id}|walker${i}`, row: tile.r, col: tile.c, personId: sfPick(passersby, seed, 'walker', i) };
  });

  return { phase: schedule.phase, presence, weatherState, stalls, tables, walkers, dinerShare };
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  sfHash, sfPick,
  STREET_FOOD_SCHEDULE, streetFoodWrapMinute, getStreetFoodPhase,
  getStreetFoodWeatherState, STREET_FOOD_WEATHER_DINER_SHARE,
  getStreetFoodVenues, STREET_FOOD_VENUE_CAPACITY, getStreetFoodVenueCapacity,
  getStreetFoodVenuePerimeter, getStreetFoodVenueLayout,
};
