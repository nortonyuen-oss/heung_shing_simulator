const assert = require('node:assert/strict');
const test = require('node:test');
require('../typhoon-shelter-fleet.js');
const fishery = require('../typhoon-shelter-fishery.js');

const {
  TYPHOON_SHELTER_FISHERY: F, typhoonShelterFisheryJobs, typhoonShelterMarketTonnes, typhoonShelterFleetCaps,
  typhoonShelterLandingEfficiency, settleTyphoonShelterNight, nextTyphoonShelterFacility,
  chooseTyphoonShelterFacilitySite, normalizeTyphoonShelterFishery, normalizeCityFishery,
} = fishery;

test('fishery jobs go with the fleet and the 海事處 buildings: crews by boat, the restaurant commercial', () => {
  const boats = [{ model: 'fishingBoat1' }, { model: 'fishingBoat3' }, { model: 'fishingBoat4' }, { model: 'homeBoat1' }];
  const jobs = typhoonShelterFisheryJobs({ boats, tenders: 1, buildings: { fish_market: 1, fish_loading_bay: 1, seafood_restaurant: 2 } });
  assert.equal(jobs.traditional, 6 + 4 + 8 + 0 + 1 + 30 + 10, 'crews, a boatman, the market and its bay; house boats have none');
  assert.equal(jobs.commercial, 40);
  assert.equal(jobs.crews, 6 + 4 + 8 + 1);
  assert.equal(jobs.market, 40);
  // a storm or the moratorium keeps boats in, not crews out of work: the jobs never look at the night
  assert.deepEqual(typhoonShelterFisheryJobs({ boats }), { traditional: 18, commercial: 0, crews: 18, market: 0 });
  assert.deepEqual(typhoonShelterFisheryJobs(), { traditional: 0, commercial: 0, crews: 0, market: 0 });
});

test('the markets take a night: 24 t each, 12 more with a bay, half with no road out; restaurants a tonne', () => {
  assert.equal(typhoonShelterMarketTonnes([{ bay: false, connected: true }]), 24);
  assert.equal(typhoonShelterMarketTonnes([{ bay: true, connected: true }]), 36);
  assert.equal(typhoonShelterMarketTonnes([{ bay: true, connected: false }]), 18);
  assert.equal(typhoonShelterMarketTonnes([{ bay: false }, { bay: true }], 2), 24 + 36 + 2);
  assert.equal(typhoonShelterMarketTonnes([], 0), 0);
});

test('the fleet is held to berths, hands and markets, and shrinks one boat a month at most', () => {
  const base = { berthTarget: 30, current: 10, fishingShare: 1, marketTonnes: 36, hasMarket: true, labourGap: Infinity, avgCrew: 6 };
  // a market and a bay: 36 t is 24 boats
  assert.deepEqual(typhoonShelterFleetCaps(base).caps.market, 24);
  assert.equal(typhoonShelterFleetCaps(base).target, 24);
  assert.equal(typhoonShelterFleetCaps(base).bottleneck, 'market');
  // no market: the quay takes four
  assert.equal(typhoonShelterFleetCaps({ ...base, current: 3, marketTonnes: 0, hasMarket: false }).target, 4);
  // hands: a boat joins only for a crew's worth of workers
  assert.equal(typhoonShelterFleetCaps({ ...base, labourGap: 13 }).target, 12, 'two more crews');
  assert.equal(typhoonShelterFleetCaps({ ...base, labourGap: 5 }).target, 10, 'not enough for a crew: no new boat');
  assert.equal(typhoonShelterFleetCaps({ ...base, labourGap: -50, staffedShare: 0.25 }).target, 10, 'short, but not yet for long: no boat lost');
  // a new shelter in a city short of hands still gets its fair share of the berths
  assert.equal(typhoonShelterFleetCaps({ ...base, current: 0, labourGap: -3000, staffedShare: 0.87 }).caps.labour, 26);
  assert.equal(typhoonShelterFleetCaps({ ...base, current: 0, labourGap: -3000, staffedShare: 0.87 }).target, 24, 'to the market\'s cap');
  assert.equal(typhoonShelterFleetCaps({ ...base, labourGap: 5 }).bottleneck, 'labour');
  // short for months: the berths' boats times the share of jobs the traditional trades fill, one
  // boat leaving a month, and no further - the shortage is the city's, the fishery cannot close it
  assert.equal(typhoonShelterFleetCaps({ ...base, shortage: true, staffedShare: 0.25 }).caps.labour, 7);
  assert.equal(typhoonShelterFleetCaps({ ...base, shortage: true, staffedShare: 0.25 }).target, 9);
  assert.equal(typhoonShelterFleetCaps({ ...base, shortage: true, staffedShare: 0.25, shrinkAllowed: false }).target, 10, 'this month\'s boat has gone');
  assert.equal(typhoonShelterFleetCaps({ ...base, current: 7, shortage: true, staffedShare: 0.25 }).target, 7, 'it settles');
  assert.equal(typhoonShelterFleetCaps({ ...base, shortage: true, staffedShare: 0.9 }).caps.labour, 27, 'a fleet under its share may grow to it');
  // the market pulled down: one a month, not all at once
  assert.equal(typhoonShelterFleetCaps({ ...base, current: 20, marketTonnes: 0, hasMarket: false }).target, 19);
  // fewer berths: at once (a boat cannot lie where there is no berth)
  assert.equal(typhoonShelterFleetCaps({ ...base, berthTarget: 6 }).target, 6);
  assert.equal(typhoonShelterFleetCaps({ ...base, berthTarget: 6 }).bottleneck, 'berths');
  // all boats from fishing boats: the market's 24 fishing boats are 29 with the house boats
  assert.equal(typhoonShelterFleetCaps({ ...base, berthTarget: 40, fishingShare: 0.82 }).caps.market, 29);
});

test('a month\'s money: per job nine tenths of an industrial job\'s tax, by how good the catch was', () => {
  const { typhoonShelterFisheryTaxPerJob } = fishery;
  const perJob = typhoonShelterFisheryTaxPerJob(1);
  assert.ok(Math.abs(perJob - (0.9 * 40) / 360) < 1e-12, 'a 1x1 industrial building pays $40 for 360 jobs');
  // a full night: every boat back with its 1.5 t
  const full = settleTyphoonShelterNight({ tonnes: 30, fullTonnes: 30, crews: 150, marketJobs: 40, marketTonnes: 36, hasMarket: true });
  assert.equal(full.tax, Math.round(perJob * 150));
  assert.equal(full.commission, Math.round(perJob * 40 * (30 / 36)), 'a market five-sixths busy');
  assert.equal(full.value, 2100, 'the catch\'s worth, shown, not taxed');
  // a storm night: half the catch, half the take; none at all, nothing
  assert.equal(settleTyphoonShelterNight({ tonnes: 15, fullTonnes: 30, crews: 150 }).tax, Math.round(perJob * 75));
  assert.deepEqual(settleTyphoonShelterNight({ tonnes: 0, fullTonnes: 30, crews: 150, marketJobs: 40, marketTonnes: 36, hasMarket: true }),
    { tonnes: 0, value: 0, tax: 0, commission: 0 });
  // no market: no commission; a higher tax rate, more tax
  assert.equal(settleTyphoonShelterNight({ tonnes: 30, fullTonnes: 30, crews: 150, marketJobs: 40 }).commission, 0);
  assert.equal(settleTyphoonShelterNight({ tonnes: 30, fullTonnes: 30, crews: 150, taxScale: 2 }).tax, Math.round(perJob * 2 * 150));
  // the fuel station's tenth, at most
  assert.equal(settleTyphoonShelterNight({ tonnes: 30, fullTonnes: 30, crews: 150, catchBonus: 0.5 }).tax, Math.round(perJob * 150 * 1.1));
  // the fishery pays less a job than industry, never more
  assert.ok(full.tax / 150 < 40 / 360);
});

test('a working shelter draws tourists, three times as many while 「無處不旅遊」 runs', () => {
  const { typhoonShelterTouristCapacity, getTyphoonShelterCampaignMultiplier } = fishery;
  assert.equal(typhoonShelterTouristCapacity({ shelters: 1, restaurants: 4 }), 4000);
  assert.equal(typhoonShelterTouristCapacity({ shelters: 0, restaurants: 0 }), 0);
  // a 黃金海岸酒店's guests
  assert.equal(typhoonShelterTouristCapacity({ shelters: 1, hotels: 1 }), 2000 + fishery.TYPHOON_SHELTER_TOURISM.hotelVisitors);
  const effects = [{ sourceId: 'tourEverywhere', startMonthIndex: 100, endMonthIndex: 102, outcome: 'success' }];
  assert.equal(getTyphoonShelterCampaignMultiplier(effects, 101), 3);
  assert.equal(getTyphoonShelterCampaignMultiplier(effects, 103), 1, 'over');
  assert.equal(getTyphoonShelterCampaignMultiplier([{ ...effects[0], outcome: 'failure' }], 100), 1.5);
  assert.equal(getTyphoonShelterCampaignMultiplier([], 100), 1);
  assert.equal(typhoonShelterTouristCapacity({ shelters: 1, restaurants: 4, multiplier: 3 }), 12000);
});

test('boats queue to unload when the stages are short: up to a fifth of the catch\'s value', () => {
  assert.equal(typhoonShelterLandingEfficiency(10, 10), 1);
  assert.equal(typhoonShelterLandingEfficiency(15, 10), 0.9);
  assert.equal(typhoonShelterLandingEfficiency(40, 10), 0.8);
  assert.equal(typhoonShelterLandingEfficiency(0, 0), 1);
});

test('a busy shelter adds a landing platform, then a fuel station, then a workshop', () => {
  assert.equal(nextTyphoonShelterFacility({ fishingBoats: 25, landingBoats: 20 }), 'landingPlatform');
  assert.equal(nextTyphoonShelterFacility({ fishingBoats: 11, landingBoats: 20 }), null, 'small: nothing yet');
  assert.equal(nextTyphoonShelterFacility({ fishingBoats: 12, landingBoats: 20 }), 'gasStation');
  assert.equal(nextTyphoonShelterFacility({ fishingBoats: 16, landingBoats: 20, facilities: [{ kind: 'gasStation' }] }), 'workshop');
  assert.equal(nextTyphoonShelterFacility({ fishingBoats: 16, landingBoats: 20, facilities: [{ kind: 'gasStation' }, { kind: 'workshop' }] }), null);
  assert.equal(nextTyphoonShelterFacility({ fishingBoats: 5, landingBoats: 20, damagedLastStorm: 3 }), 'workshop', 'a storm that hurt the fleet');
});

test('a facility goes on open water by a walkway or the shore - never a lane, a work or a berth with a boat', () => {
  // a 5 x 5 basin; the lane down column 2; a walkway along row 0 cols 0-1
  const basin = new Set();
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) basin.add(`${r}:${c}`);
  const lanes = new Set(['0:2', '1:2', '2:2', '3:2', '4:2']);
  const items = [{ kind: 'pontoon', row: 0, col: 0, state: 'done' }, { kind: 'pontoon', row: 0, col: 1, state: 'done' }];
  const slots = [{ key: 'a', tiles: ['1:0', '1:1'], size: 2 }, { key: 'b', tiles: ['1:3', '1:4'], size: 2 }, { key: 'c', tiles: ['3:3', '3:4'], size: 2 }];
  const site = chooseTyphoonShelterFacilitySite({ basin, channel: new Set(), lanes, slots, items, occupied: new Set(['a', 'b', 'c']), entrances: [[4, 2]] });
  assert.ok(site, 'somewhere');
  const k = `${site.row}:${site.col}`;
  assert.ok(!lanes.has(k) && !['0:0', '0:1'].includes(k), k);
  assert.ok(!slots.some((s) => s.tiles.includes(k)), 'open water first, not a berth');
  // a full basin: only a free berth, never an occupied one
  const tight = chooseTyphoonShelterFacilitySite({ basin: new Set(['1:0', '1:1', '0:2']), channel: new Set(), lanes: new Set(['0:2']),
    slots: [{ key: 'a', tiles: ['1:0', '1:1'], size: 2 }], items: [], occupied: new Set(['a']) });
  assert.equal(tight, null);
});

test('saves: the shelter\'s fishery and the city\'s months come back clean; old saves start empty', () => {
  assert.deepEqual(normalizeTyphoonShelterFishery(null), { autoExpand: true, shortageMonths: 0, facilities: [] });
  const plan = normalizeTyphoonShelterFishery({ autoExpand: false, shortageMonths: 2, facilities: [{ kind: 'gasStation', row: 3, col: 4, facing: 'e' }, { kind: 'bogus', row: 1, col: 1 }], suggest: 'workshop', noRoom: true, shrinkMonth: 24000 });
  assert.deepEqual(plan, { autoExpand: false, shortageMonths: 2, facilities: [{ kind: 'gasStation', row: 3, col: 4, facing: 'e' }], suggest: 'workshop', noRoom: true, shrinkMonth: 24000 });
  assert.deepEqual(normalizeCityFishery(undefined), { lastSettledDay: null, lastMonth: null, history: [] });
  const city = normalizeCityFishery({ lastSettledDay: 12, lastMonth: { year: 1990, month: 3, tonnes: 30.04, value: 2100, tax: 189, commission: 105, fresh: 10, byShelter: { ts1: { tonnes: 30, value: 2100, tax: 189, commission: 105 } } }, history: Array(20).fill({ tonnes: 1 }) });
  assert.equal(city.lastSettledDay, 12);
  assert.equal(city.lastMonth.tonnes, 30);
  assert.equal(city.lastMonth.byShelter.ts1.tax, 189);
  assert.equal(city.history.length, F.history);
});

test('住家艇: a household of four aboard each house boat', () => {
  const { typhoonShelterResidents, TYPHOON_SHELTER_RESIDENTS_PER_HOME } = fishery;
  const boats = [{ model: 'homeBoat1' }, { model: 'homeBoat3' }, { model: 'floatingHome' }, { model: 'fishingBoat1' }, { model: 'speedboat1' }];
  assert.equal(typhoonShelterResidents(boats), 3 * TYPHOON_SHELTER_RESIDENTS_PER_HOME);
  assert.equal(TYPHOON_SHELTER_RESIDENTS_PER_HOME, 4);
  assert.equal(typhoonShelterResidents([]), 0);
});

test('海鮮舫: a 4 x 2 of open basin under the click, clear of the channel and the works', () => {
  const { findTyphoonShelterFloatingRestaurantSite, typhoonShelterTouristCapacity, TYPHOON_SHELTER_FLOATING_RESTAURANT: F } = fishery;
  require('../typhoon-shelter-works.js');
  const basin = new Set();
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) basin.add(`${r}:${c}`);
  const channel = new Set(['5:0', '5:1', '5:2', '5:3', '5:4', '5:5', '5:6', '5:7']);
  const items = [{ kind: 'pontoon', row: 0, col: 0, state: 'done' }];
  const site = findTyphoonShelterFloatingRestaurantSite({ row: 2, col: 3, basin, channel, items });
  assert.ok(site);
  const tiles = [];
  for (let r = site.row; r < site.row + site.rows; r++) for (let c = site.col; c < site.col + site.cols; c++) tiles.push(`${r}:${c}`);
  assert.equal(tiles.length, F.cols * F.rows);
  assert.ok(tiles.includes('2:3'), 'under the click');
  assert.ok(tiles.every((k) => basin.has(k) && !channel.has(k) && k !== '0:0'));
  // land along row -1 (the top of the basin): the row of water against it is shore, and stays clear
  const shore = fishery.typhoonShelterShoreWater(basin, (r) => r < 0);
  assert.deepEqual([...shore].sort(), ['0:0', '0:1', '0:2', '0:3', '0:4', '0:5', '0:6', '0:7']);
  const off = findTyphoonShelterFloatingRestaurantSite({ row: 1, col: 3, basin, channel, items, shore });
  assert.ok(off && off.row >= 1, 'a tile off the shore');
  // the bulldozer finds it by any tile of its lot
  const moored = [{ id: 'ts1', works: { items: [{ kind: 'floatingRestaurant', row: 10, col: 20, cols: 4, rows: 3 }] } }];
  assert.equal(fishery.findTyphoonShelterFloatingRestaurantAt(moored, 12, 23)?.plan.id, 'ts1');
  assert.equal(fishery.findTyphoonShelterFloatingRestaurantAt(moored, 13, 23), null);
  assert.equal(fishery.findTyphoonShelterFloatingRestaurantAt(moored, 12, 24), null);
  // turned by a right-click: only that way round
  const long = findTyphoonShelterFloatingRestaurantSite({ row: 2, col: 3, basin, channel, items, turn: 'cols' });
  const deep = findTyphoonShelterFloatingRestaurantSite({ row: 2, col: 3, basin, channel, items, turn: 'rows' });
  assert.deepEqual([long.cols, long.rows], [F.cols, F.rows]);
  assert.deepEqual([deep.cols, deep.rows], [F.rows, F.cols]);
  // a strip too narrow either way: nowhere
  assert.equal(findTyphoonShelterFloatingRestaurantSite({ row: 0, col: 0, basin: new Set(['0:0', '0:1', '0:2']), channel: new Set(), items: [] }), null);
  // its tourists, three times over in a campaign
  assert.equal(typhoonShelterTouristCapacity({ floatingRestaurants: 1 }), 3000);
  assert.equal(typhoonShelterTouristCapacity({ floatingRestaurants: 1, multiplier: 3 }), 9000);
  // saved with its footprint
  assert.deepEqual(normalizeTyphoonShelterFishery({ facilities: [{ kind: 'floatingRestaurant', row: 2, col: 1, cols: 4, rows: 2 }] }).facilities,
    [{ kind: 'floatingRestaurant', row: 2, col: 1, facing: 'n', cols: 4, rows: 2 }]);
});
