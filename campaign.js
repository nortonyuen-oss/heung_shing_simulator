// 《玩轉18區》 campaign runtime (Norton 2026-11-17; docs/campaign-levels-design.md).
//
// Starts a chapter (its start file UI/campaign/chNN.json when there is one - a city Norton built
// and exported with exportCampaignStart() - else a new city on the chapter's district map), keeps
// the run on the city (city.campaign, saved with it), judges it at each month's turn, and draws
// the story: the 女皇密令 letter, the dialogue box, the objectives panel with the tutorial, and
// the chapter map. The rules are in campaign-chapters.js; the player's best stars are kept in the
// player profile (key 'campaign'), across saves, as the medals are.
(function () {
  'use strict';

  const CAMPAIGN_PROFILE_API = '/api/player-profile/campaign';
  const CAMPAIGN_PANEL_REFRESH_MS = 1500;
  const CAMPAIGN_SAVE_DELAY_MS = 800;
  const CAMPAIGN_START_FILE_FORMAT = 'heung-shing-campaign-start';
  // ch05 shares the 九龍城 map: its pin sits up by the 黃大仙 temple (HK1980 grid metres)
  const CAMPAIGN_PIN_OFFSETS = { ch05: { de: -500, dn: 2200 } };

  const runtime = {
    profile: createEmptyCampaignProfile(),
    loaded: false,
    loading: null,
    saveTimer: null,
    dialogue: Promise.resolve(),
    dialogueOpen: false,
    collapsed: false,
    // the touch UI folds the objectives list to one line; a tap opens it
    objectivesOpen: false,
    highlighted: [],
    selectedChapterId: 'ch01',
    // chapters that wait for a built start city: chapterId -> whether UI/campaign/chNN.json is there
    startFileReady: {},
  };

  const language = () => (typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'zhHant');
  const say = (text) => getCampaignText(text, language());
  const L = (zhHant, en, ja) => ({ zhHant, en, ja });
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const storageRequest = (url, options) => (globalThis.HeungShingStorage
    ? globalThis.HeungShingStorage.request(url, options) : fetch(url, options));
  const monthIndexNow = () => (typeof getCityMonthIndex === 'function' ? getCityMonthIndex() : 0);

  function isCampaignPaused() {
    if (typeof city === 'undefined' || !city) return true;
    if (typeof isAttractModeActive === 'function' && isAttractModeActive()) return true;
    if (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) return true;
    return false;
  }

  // The browser build serves the art under content-hashed names. A literal path in a script is
  // rewritten when it is built - but not one under UI/news/ (kept logical for forum posts in saves),
  // so the prologue's letter (UI/news/phase0.webp) is resolved here, as every picture is.
  function campaignImageSrc(path) {
    return typeof resolveBundledAssetPath === 'function' ? resolveBundledAssetPath(path) : path;
  }

  function isTouchCampaign() {
    return typeof isTouchUiProfile === 'function' && isTouchUiProfile();
  }

  function isLandingVisible() {
    const landing = document.getElementById('landing-screen');
    return !!landing && landing.style.display !== 'none';
  }

  function getRun() {
    if (isCampaignPaused() || !city.campaign) return null;
    if (!city.campaign.schemaVersion || city.campaign.__normalized !== true) {
      const run = normalizeCampaignRun(city.campaign);
      if (!run) { city.campaign = null; return null; }
      Object.defineProperty(run, '__normalized', { value: true, enumerable: false });
      city.campaign = run;
    }
    return city.campaign;
  }

  // ── Profile (跟玩家，跨存檔) ────────────────────────────────────────────────

  function loadCampaignProfile() {
    if (runtime.loaded) return Promise.resolve(runtime.profile);
    if (runtime.loading) return runtime.loading;
    runtime.loading = (async () => {
      try {
        const response = await storageRequest(CAMPAIGN_PROFILE_API);
        if (!response?.ok) throw new Error(`HTTP ${response?.status}`);
        const body = await response.json();
        const stored = normalizeCampaignProfile(body?.data);
        // stars recorded before the load finished are kept (the best of the two)
        Object.entries(runtime.profile.chapters).forEach(([id, entry]) => {
          if ((stored.chapters[id]?.stars || 0) < entry.stars) stored.chapters[id] = entry;
        });
        stored.prologueSeen = stored.prologueSeen || runtime.profile.prologueSeen;
        stored.mayor = stored.mayor || runtime.profile.mayor;
        runtime.profile = stored;
        runtime.loaded = true;
      } catch (error) {
        // not loaded: nothing is written, so a stored profile is never overwritten by an empty one
        console.warn('[campaign] profile load failed; will retry', error);
      }
      runtime.loading = null;
      return runtime.profile;
    })();
    return runtime.loading;
  }

  function scheduleCampaignProfileSave() {
    if (!runtime.loaded) { loadCampaignProfile().then(() => { if (runtime.loaded) scheduleCampaignProfileSave(); }); return; }
    clearTimeout(runtime.saveTimer);
    runtime.saveTimer = setTimeout(async () => {
      try {
        await storageRequest(CAMPAIGN_PROFILE_API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: runtime.profile }),
        });
      } catch (error) {
        console.warn('[campaign] profile save failed', error);
      }
    }, CAMPAIGN_SAVE_DELAY_MS);
  }

  function campaignStamp() {
    return { at: new Date().toISOString(), city: String(city?.name || '') };
  }

  // ── The city as the chapters read it ──────────────────────────────────────

  // Bus routes that ran last month with riders: how many, their net between them, and how many
  // have stops in two or more district signs' areas (跨區, ch07).
  function collectBusRouteFacts() {
    const facts = { busRoutes: 0, busRoutesNet: 0, crossDistrictRoutes: 0 };
    const state = typeof isTransportExpansionActive === 'function' && isTransportExpansionActive()
      && typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
    if (!state) return facts;
    const stops = new Map((state.stops || []).map((stop) => [stop.id, stop]));
    (state.routes || []).forEach((route) => {
      const last = Array.isArray(route.history) ? route.history[route.history.length - 1] : null;
      if (route.status === 'suspended' || !last || !(Number(last.passengers) > 0)) return;
      facts.busRoutes += 1;
      facts.busRoutesNet += Number(last.net) || 0;
      // a route to a 區外站 crosses districts by going to another (docs/region-transit-design.md)
      if ((route.stopIds || []).some((id) => stops.get(id)?.offMap)) {
        facts.crossDistrictRoutes += 1;
        return;
      }
      if (typeof getDistrictKeyForTile !== 'function') return;
      const districts = new Set();
      (route.stopIds || []).forEach((id) => {
        const stop = stops.get(id);
        const key = stop ? getDistrictKeyForTile(stop.row, stop.col) : null;
        if (key) districts.add(key);
      });
      if (districts.size >= 2) facts.crossDistrictRoutes += 1;
    });
    return facts;
  }

  // The working typhoon shelters, their yachts, and the longest promenade walkable end to end
  // (tiles joined edge or corner, as a coast runs).
  function collectWaterfrontFacts() {
    const facts = { typhoonShelters: 0, yachts: 0, promenadeLongest: 0 };
    try {
      if (typeof getTyphoonShelterState === 'function') {
        facts.typhoonShelters = (getTyphoonShelterState().shelters || []).filter((plan) => plan.status === 'operational').length;
      }
      if (typeof getTyphoonShelterYachtCount === 'function') facts.yachts = getTyphoonShelterYachtCount();
    } catch { /* no shelters */ }
    const keys = typeof getPromenadeTileKeys === 'function' ? getPromenadeTileKeys() : [];
    const left = new Set(keys);
    left.forEach((first) => {
      if (!left.has(first)) return;
      let size = 0;
      const queue = [first];
      left.delete(first);
      while (queue.length) {
        const [row, col] = queue.pop().split(':').map(Number);
        size += 1;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const key = `${row + dr}:${col + dc}`;
            if (left.has(key)) { left.delete(key); queue.push(key); }
          }
        }
      }
      facts.promenadeLongest = Math.max(facts.promenadeLongest, size);
    });
    return facts;
  }

  // Each festival's latest year held, and latest year it found no venue (ch03's 《龍舟未開》). Years,
  // not counts: the festival history keeps only its latest entries, so a count can stand still.
  function collectFestivalFacts() {
    const festivalHeldYear = {};
    const festivalNoVenueYear = {};
    const history = typeof getCityFestivalState === 'function' ? getCityFestivalState()?.history || [] : [];
    history.forEach((entry) => {
      const year = Math.floor(Number(entry?.year) || 0);
      if (entry?.outcome === 'held') festivalHeldYear[entry.id] = Math.max(festivalHeldYear[entry.id] || 0, year);
      else if (entry?.outcome === 'noVenue') festivalNoVenueYear[entry.id] = Math.max(festivalNoVenueYear[entry.id] || 0, year);
    });
    return { festivalHeldYear, festivalNoVenueYear };
  }

  // 龍舟場地 (the Dragon Boat tutorial, campaign-chapters.js): the longest promenade in one piece edge
  // to edge, as the race walks it; whether its course fits the sea off it at all, and with the water
  // clear; and the race switched on. The course search at most every few seconds, or when the
  // promenade or the ferry routes change.
  const DRAGON_BOAT_FACTS_MS = 2500;
  let dragonBoatFacts = { at: -Infinity, key: '', facts: null, run: null, course: null };
  function collectDragonBoatFacts(force = false) {
    const tiles = typeof getPromenadeTileKeys === 'function' ? getPromenadeTileKeys() : [];
    const ferries = typeof getFerryState === 'function' ? getFerryState().routes.length : 0;
    const key = `${tiles.length}|${tiles.slice(0, 3).join(',')}|${tiles.slice(-3).join(',')}|${ferries}`;
    const now = Date.now();
    if (!force && dragonBoatFacts.facts && dragonBoatFacts.key === key && now - dragonBoatFacts.at < DRAGON_BOAT_FACTS_MS) return dragonBoatFacts;
    const runs = typeof orderFestivalPromenadeRuns === 'function' ? orderFestivalPromenadeRuns(tiles.map((k) => k.split(':').map(Number))) : [];
    const run = runs.reduce((best, r) => (r.length > (best?.length || 0) ? r : best), null);
    let water = false; let course = null;
    if ((run?.length || 0) >= 6 && typeof getDragonBoatContext === 'function' && typeof selectDragonBoatCourse === 'function') {
      try {
        const ctx = getDragonBoatContext(typeof activeScene !== 'undefined' ? activeScene : null);
        const preferred = typeof getCityFestivalState === 'function' ? getCityFestivalState()?.venues?.dragonBoat || '' : '';
        course = selectDragonBoatCourse(ctx, preferred);
        water = !!course || !!selectDragonBoatCourse({ ...ctx, isBlocked: null }, preferred);
      } catch (error) { console.warn('[campaign] dragon boat venue', error?.message); }
    }
    const tier = typeof getFestivalTier === 'function' ? getFestivalTier('dragonBoat') : 'standard';
    const facts = {
      dragonBoatRun: run?.length || 0,
      dragonBoatWater: water,
      dragonBoatCourse: !!course,
      dragonBoatOn: (typeof isFestivalEnabled === 'function' ? isFestivalEnabled('dragonBoat') : true) && tier !== 'skip',
    };
    dragonBoatFacts = { at: now, key, facts, run, course };
    return dragonBoatFacts;
  }

  // P3's facts (docs/campaign-levels-design.md §4C): homes by wealth, village houses, the metro's
  // surface and elevated riders, light rail - metro interchanges, business taxes, the government's
  // shares, the council's major events held, and the undersea tunnels with buses through them.
  const CAMPAIGN_MAJOR_EVENT_IDS = Object.freeze(['tourEverywhere', 'menaConcert', 'muiKinKwokMatch', 'leagueMatchday', 'fantasyFingHeungShing']);
  const lastRiders = (line) => Math.max(0, Number((line?.history || []).at(-1)?.passengers) || 0);
  function collectP3Facts() {
    const facts = {
      residentialByWealth: { L: 0, M: 0, H: 0, UH: 0 }, villageHouses: 0,
      metroSurfaceRiders: 0, metroElevatedRiders: 0, lightRailMetroInterchanges: 0,
      taxCI: 0, governmentHoldings: 0, hsi: 0, majorEvents: [], underseaTunnels: 0, tunnelBusRoutes: 0,
      educationBasic: Number(city.educationBasicIndex) || 0, educationHigher: Number(city.educationHigherIndex) || 0,
      monthIndex: monthIndexNow(),
    };
    const lowDensity = typeof DENSITY_LOW !== 'undefined' ? DENSITY_LOW : 1;
    Object.entries(typeof buildingData !== 'undefined' && buildingData ? buildingData : {}).forEach(([id, record]) => {
      if (record?.type !== 'residential') return;
      const tier = ['L', 'M', 'H', 'UH'].includes(record.wealthTier) ? record.wealthTier : 'L';
      facts.residentialByWealth[tier] += 1;
      // a village house: a one-tile home on low-density land
      const [r, c] = id.split(':').map(Number);
      if ((record.footprintRows || 1) === 1 && (record.footprintCols || 1) === 1
        && typeof zoneDensityMap !== 'undefined' && zoneDensityMap?.[r]?.[c] === lowDensity) facts.villageHouses += 1;
    });
    try {
      const metro = typeof getMetroState === 'function' && typeof getTransportExpansionState === 'function' && getTransportExpansionState() ? getMetroState() : null;
      const metroStops = [];
      (metro?.lines || []).forEach((line) => {
        if (line.status !== 'active') return;
        const riders = lastRiders(line);
        const stations = typeof getMetroLineStations === 'function' ? getMetroLineStations(line, metro) : [];
        if (line.surface) facts.metroSurfaceRiders += riders;
        if (stations.some((st) => st.elevated)) facts.metroElevatedRiders += riders;
        if (riders > 0) stations.forEach((st) => metroStops.push(st));
      });
      const lightRail = typeof getLightRailState === 'function' && typeof getTransportExpansionState === 'function' && getTransportExpansionState() ? getLightRailState() : null;
      const lrServed = new Set();
      (lightRail?.lines || []).forEach((line) => { if (line.status === 'active' && lastRiders(line) > 0) line.stationIds.forEach((id) => lrServed.add(id)); });
      (lightRail?.stations || []).forEach((st) => {
        if (!lrServed.has(st.id)) return;
        if (metroStops.some((m) => Math.max(Math.abs(m.row - st.row), Math.abs(m.col - st.col)) <= 3)) facts.lightRailMetroInterchanges += 1;
      });
    } catch { /* no railways */ }
    const income = city.lastBudgetSnapshot?.income || {};
    facts.taxCI = (Number(income.commercialTax) || 0) + (Number(income.industrialTax) || 0);
    try {
      const portfolio = typeof getGovernmentPortfolio === 'function' && city.stockMarket ? getGovernmentPortfolio(city.stockMarket) : null;
      facts.governmentHoldings = Object.values(portfolio?.positions || {}).filter((p) => Number(p?.shares) > 0).length;
    } catch { /* no market */ }
    facts.hsi = Number(city.stockMarket?.hsi) || 0;
    (city.council?.resolutionHistory || []).forEach((entry) => {
      if (!CAMPAIGN_MAJOR_EVENT_IDS.includes(entry?.resolutionId)) return;
      const outcome = entry.outcome || entry.summary?.outcome;
      if (outcome !== 'success') return;
      facts.majorEvents.push({ id: entry.resolutionId, monthIndex: Number(entry.approvedMonthIndex ?? entry.completedMonthIndex) || 0 });
    });
    try {
      facts.underseaTunnels = typeof getUnderseaTunnels === 'function' ? getUnderseaTunnels().length : 0;
      if (facts.underseaTunnels && typeof isUnderseaTunnelTile === 'function' && typeof getTransportExpansionState === 'function' && getTransportExpansionState()) {
        getTransportExpansionState().routes.forEach((route) => {
          if (route.status === 'suspended' || !(Number(route.history?.at(-1)?.passengers) > 0)) return;
          const runtime = typeof getTransportRouteRuntime === 'function' ? getTransportRouteRuntime(route.id) : null;
          if ((runtime?.roundTripPath || []).some((tile) => isUnderseaTunnelTile(tile.row, tile.col))) facts.tunnelBusRoutes += 1;
        });
      }
    } catch { /* no tunnels */ }
    return facts;
  }

  // 第 5 章 黃大仙: the public sector's share of residents (公屋 and 居屋, housing-types.js), and the
  // grand temple's 交通接駁 and fire cover - a bus stop on a route with riders, or a station of a line
  // with riders, within CAMPAIGN_TEMPLE_TRANSIT_TILES of its lot; a fire station's cover on its lot.
  const CAMPAIGN_TEMPLE_TRANSIT_TILES = 6;
  function collectHousingFacts() {
    const counts = city.housingResidents || {};
    const publicSector = (Number(counts.public) || 0) + (Number(counts.hos) || 0);
    const total = publicSector + (Number(counts.private) || 0);
    const facts = { publicSectorShare: total > 0 ? publicSector / total : 0, templeTransit: false, templeFireCover: false };
    const temples = [];
    Object.entries(typeof buildingData !== 'undefined' && buildingData ? buildingData : {}).forEach(([id, record]) => {
      if (record?.type !== 'grand_temple') return;
      const [row, col] = id.split(':').map(Number);
      temples.push({ row, col, rows: record.footprintRows || 1, cols: record.footprintCols || 1 });
    });
    if (!temples.length) return facts;
    const gap = (value, from, size) => Math.max(from - value, value - (from + size - 1), 0);
    const nearTemple = (row, col) => temples.some((t) => Math.max(gap(row, t.row, t.rows), gap(col, t.col, t.cols)) <= CAMPAIGN_TEMPLE_TRANSIT_TILES);
    try {
      const state = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
      if (state) {
        const stops = new Map((state.stops || []).map((stop) => [stop.id, stop]));
        facts.templeTransit = (state.routes || []).some((route) => route.status !== 'suspended'
          && Number(route.history?.at(-1)?.passengers) > 0
          && (route.stopIds || []).some((id) => { const stop = stops.get(id); return stop && !stop.offMap && nearTemple(stop.row, stop.col); }));
        const metro = typeof getMetroState === 'function' ? getMetroState() : null;
        if (!facts.templeTransit && metro) {
          facts.templeTransit = (metro.lines || []).some((line) => line.status === 'active' && lastRiders(line) > 0
            && (typeof getMetroLineStations === 'function' ? getMetroLineStations(line, metro) : []).some((st) => nearTemple(st.row, st.col)));
        }
      }
    } catch { /* no transport */ }
    if (typeof serviceMap !== 'undefined' && serviceMap) {
      facts.templeFireCover = temples.some((t) => {
        for (let r = t.row; r < t.row + t.rows; r++) for (let c = t.col; c < t.col + t.cols; c++) if (serviceMap.get(`${r}:${c}`)?.fire) return true;
        return false;
      });
    }
    return facts;
  }

  // 航班 (airport-routes.js, P4 第 10 章): the routes carrying anyone, the passengers a month, the daily
  // flights, the curfew and the residents under the noise
  function collectAirportFacts() {
    const facts = { airportRoutes: 0, airportPassengers: 0, airportDailyFlights: 0, airportCurfew: false, airportNoiseResidents: 0,
      airportFees: 0, airportCost: 0, airportLongHaul: 0 };
    try {
      if (typeof getAirportState === 'function') {
        const state = getAirportState();
        facts.airportRoutes = state.routesFlying;
        facts.airportPassengers = state.passengers;
        facts.airportDailyFlights = state.dailyFlights;
        facts.airportCurfew = !!state.curfew;
        facts.airportNoiseResidents = state.noiseResidents;
        facts.airportFees = state.fees;
        facts.airportCost = state.cost;
        facts.airportLongHaul = state.routes.filter((route) => route.passengers > 0 && AIRPORT_DESTINATIONS_BY_ID[route.id]?.haul === 'long').length;
      }
    } catch { /* no airport */ }
    return facts;
  }

  // 九龍城寨文化園區 (walled-city.js, P4 第 14 章): its visitors and fire cover, the films started and
  // made; 天壇大佛 (big-buddha.js, 第 10 章): on a hill, by bus, its pilgrims
  function collectLandmarkFacts() {
    const facts = { walledCityVisitors: 0, walledCityFireCover: false, walledCityShooting: false, walledCityFilms: 0, walledCityFilmsStarted: 0,
      buddhaOnHill: false, buddhaBus: false, buddhaVisitors: 0 };
    try {
      if (typeof getWalledCityState === 'function') {
        const park = getWalledCityState();
        facts.walledCityVisitors = park.visitors;
        facts.walledCityFireCover = !!park.lot && park.fireCover;
        facts.walledCityShooting = !!park.shooting;
        facts.walledCityFilms = park.made;
        facts.walledCityFilmsStarted = park.started;
      }
      if (typeof getBigBuddhaState === 'function') {
        const buddha = getBigBuddhaState();
        facts.buddhaOnHill = !!buddha.lot && buddha.onHill;
        facts.buddhaBus = !!buddha.lot && buddha.bus;
        facts.buddhaVisitors = buddha.visitors;
      }
    } catch { /* neither */ }
    return facts;
  }

  // 郵輪碼頭 (cruise-terminal.js, P4 第 14 章): last month's calls, passengers and the share of them who
  // left by public transport (the script's 上月), this month's calls, and the call-day peak on the roads
  function collectCruiseFacts() {
    const facts = { cruiseCalls: 0, cruisePassengers: 0, cruiseTransitShare: 0, cruiseCallsThisMonth: 0, cruisePeakTraffic: 0 };
    try {
      if (typeof getCruiseLastMonth === 'function') {
        const last = getCruiseLastMonth();
        facts.cruiseCalls = last.calls;
        facts.cruisePassengers = last.passengers;
        facts.cruiseTransitShare = last.transitShare;
      }
      if (typeof getCruiseState === 'function') facts.cruiseCallsThisMonth = getCruiseState().calls;
      if (typeof getCruisePeakTraffic === 'function') facts.cruisePeakTraffic = getCruisePeakTraffic();
    } catch { /* no terminal */ }
    return facts;
  }

  // 福利同舊樓 (welfare.js, P4 第 15 章): the welfare coverage and the bills that reach anyone; the
  // 危樓, the residents' average condition and the repairs made; 治安指數 = 100 - the crime rate (%)
  function collectWelfareFacts() {
    const facts = {
      welfareCoverage: 0, welfareBills: 0, dangerousBuildings: 0, buildingSafetyIndex: 100, buildingRepairs: 0, buildingRebuilds: 0,
      safetyIndex: Math.round(100 - Math.max(0, Math.min(1, Number(city.crimeRateIndex) || 0)) * 100),
    };
    try {
      const state = typeof getWelfareState === 'function' ? getWelfareState() : null;
      facts.welfareCoverage = Number(state?.coverage) || 0;
      facts.welfareBills = Number(state?.activeWithBeneficiaries) || 0;
      const homes = typeof getOldBuildingStats === 'function' ? getOldBuildingStats() : null;
      facts.dangerousBuildings = Number(homes?.dangerous) || 0;
      facts.buildingSafetyIndex = Number.isFinite(Number(homes?.safetyIndex)) ? Number(homes.safetyIndex) : 100;
      facts.buildingRepairs = Number(homes?.repaired) || 0;
      facts.buildingRebuilds = Math.max(0, Math.floor(Number(city.buildingRebuilds) || 0));
    } catch { /* no welfare yet */ }
    return facts;
  }

  function buildCampaignSnapshot() {
    const base = typeof collectMedalSnapshot === 'function' ? collectMedalSnapshot() : { buildings: {}, transit: {} };
    const buildings = base.buildings || {};
    const zoneTiles = { res: 0, com: 0, ind: 0 };
    // 第 5 章 服務覆蓋: the share of residential land each service reaches
    const homeCover = { fire: 0, police: 0, health: 0, school: 0 };
    const services = typeof serviceMap !== 'undefined' && serviceMap ? serviceMap : null;
    if (typeof zoneMap !== 'undefined' && Array.isArray(zoneMap)) {
      zoneMap.forEach((row, r) => {
        if (!row) return;
        for (let i = 0; i < row.length; i++) {
          const zone = row[i];
          if (zone === ZONE_RES) {
            zoneTiles.res++;
            const cell = services?.get(`${r}:${i}`);
            if (!cell) continue;
            if (cell.fire) homeCover.fire++;
            if (cell.police) homeCover.police++;
            if ((Number(cell.health) || 0) > 0) homeCover.health++;
            if ((Number(cell.eduBasic) || 0) > 0) homeCover.school++;
          } else if (zone === ZONE_COM) zoneTiles.com++;
          else if (zone === ZONE_IND) zoneTiles.ind++;
        }
      });
    }
    Object.keys(homeCover).forEach((key) => { homeCover[key] = zoneTiles.res > 0 ? homeCover[key] / zoneTiles.res : 0; });
    const loans = Array.isArray(city.loans) ? city.loans : [];
    return {
      ...base,
      ...collectBusRouteFacts(),
      ...collectWaterfrontFacts(),
      ...collectFestivalFacts(),
      ...collectDragonBoatFacts().facts,
      ...collectP3Facts(),
      ...collectHousingFacts(),
      ...collectWelfareFacts(),
      ...collectCruiseFacts(),
      ...collectAirportFacts(),
      ...collectLandmarkFacts(),
      crimeRate: Number(city.crimeRateIndex) || 0,
      tourismAppeal: Number(city.tourismAppeal) || 0,
      pollution: Number(city.pollution) || 0,
      funds: Number(city.budget) || 0,
      residentialCount: Number(city.residentialCount) || 0,
      powerRatio: Number(city.powerRatio) || 0,
      powerPlants: (buildings.power_plant_coal || 0) + (buildings.power_plant_solar || 0) + (buildings.power_plant_nuclear || 0),
      monthlyNet: (Number(city.monthlyIncome) || 0) - (Number(city.monthlyExpenses) || 0),
      loanBalance: loans.reduce((sum, loan) => sum + Math.max(0, Number(loan?.balance) || 0), 0),
      trafficIndex: Number(city.trafficIndex) || 0,
      // 貨櫃貨運 (port-freight.js, P4 第 11 章): TEU a month and the share of truck driving past homes
      portThroughput: Number(city.portFreight?.teu) || 0,
      portTruckResidentialShare: Number(city.portFreight?.residentialShare) || 0,
      demandR: Number(city.demandR) || 0,
      roadTiles: typeof roadTileCount !== 'undefined' ? Number(roadTileCount) || 0 : 0,
      powerLines: typeof powerLineSet !== 'undefined' && powerLineSet ? powerLineSet.size : 0,
      zoneTiles,
      homeCover,
    };
  }

  // ── Starting a chapter ────────────────────────────────────────────────────

  async function fetchCampaignStartFile(url) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return null;
      const file = await response.json();
      return file?.format === CAMPAIGN_START_FILE_FORMAT && file.save_data ? file : null;
    } catch {
      return null;
    }
  }

  // loadSaveById's steps, for a city from a file rather than a save slot (no slot is taken)
  async function loadCampaignStartFile(file) {
    if (typeof leaveAttractMode === 'function') leaveAttractMode('load');
    if (typeof isWorldGameActive === 'function' && isWorldGameActive()) {
      if (!await globalThis.__worldGameHost.save(true)) return false;
      await leaveWorldGame();
    }
    const readyScene = await waitForLoadScene(activeScene);
    if (!readyScene) return false;
    if (typeof waitForPendingSaves === 'function') await waitForPendingSaves();
    const save = decodeSaveDataForLoad(file.save_data);
    await ensureSaveBuildingTextures(readyScene, save);
    await ensureSaveNightTextures(readyScene, save);
    beginNewCitySaveSession(null);
    if (typeof isTerrainCreatorMode !== 'undefined') isTerrainCreatorMode = false;
    if (typeof setTerrainEditorUiActive === 'function') setTerrainEditorUiActive(false);
    applySaveData(readyScene, save);
    if (typeof startCoastalWeatherSession === 'function') startCoastalWeatherSession();
    if (typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') setGameSpeed(GAME_SPEEDS.SLOW);
    hideLandingScreen();
    return true;
  }

  async function startFreshCampaignCity(chapter, spec) {
    const source = (typeof listDistrictMapSources === 'function' ? listDistrictMapSources() : [])
      .find((entry) => entry.districtId === chapter.mapId);
    if (!source) return false;
    const terrain = await source.getTerrain();
    await startNewGame(say(spec.fresh.cityName), {
      terrain,
      districtProfileId: chapter.mapId,
      transportExpansion: spec.fresh.transportExpansion === true,
    });
    if (Number.isFinite(spec.fresh.budget)) city.budget = spec.fresh.budget;
    if (typeof updateHUD === 'function') updateHUD();
    return true;
  }

  function isCityInPlay() {
    return !isLandingVisible() && !isCampaignPaused();
  }

  async function startCampaignChapter(chapterId) {
    const chapter = CAMPAIGN_CHAPTERS_BY_ID[chapterId];
    const spec = CAMPAIGN_CHAPTER_SPECS[chapterId];
    if (!chapter || !spec) return false;
    if (typeof gameReady !== 'undefined' && !gameReady) {
      if (typeof showToast === 'function') showToast(t('toast.stillLoading'), 'warning');
      return false;
    }
    const file = await fetchCampaignStartFile(spec.startFile);
    if (!file && (spec.requiresStartFile || !spec.fresh)) {
      runtime.startFileReady[chapterId] = false;
      renderCampaignSelect();
      if (typeof showToast === 'function') showToast(say(L(`第 ${chapter.number} 章嘅開局城市準備中。`, `Chapter ${chapter.number}'s starting city is still being built.`, `第${chapter.number}章の開始都市は準備中です。`)), 'warning');
      return false;
    }
    if (isCityInPlay() && !window.confirm(say(L(
      '開始新章節會離開而家個城市，未儲存嘅進度會失去。繼續？',
      'Starting a chapter leaves the city you are in; anything unsaved will be lost. Continue?',
      '章を始めると今の都市を離れます。未保存の進行は失われます。続けますか？',
    )))) return false;
    closeCampaignSelect();
    const started = file ? await loadCampaignStartFile(file) : await startFreshCampaignCity(chapter, spec);
    if (!started) {
      if (typeof showToast === 'function') showToast(say(L('開唔到呢一章。', 'This chapter could not start.', 'この章を開始できませんでした。')), 'danger');
      return false;
    }
    await loadCampaignProfile();
    city.campaign = createCampaignRun(chapterId, monthIndexNow(), buildCampaignSnapshot());
    // a shared tutorial already played in an earlier chapter (the 龍舟 venue in 西貢) is not again
    if (spec.tutorialId && runtime.profile.tutorials?.[spec.tutorialId]) city.campaign.tutorial = null;
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
    renderCampaignPanel();
    if (chapter.number === 1 && !runtime.profile.prologueSeen) {
      await playCampaignPrologue();
      runtime.profile.prologueSeen = true;
      scheduleCampaignProfileSave();
    }
    // over the chapter's own scene, a cut-scene between the cities
    await playCampaignDialogue(spec.intro, { backdrop: getCampaignChapterScene(chapterId) || false, reveal: true });
    renderCampaignPanel();
    return true;
  }

  // ── Dialogue ──────────────────────────────────────────────────────────────

  // Shown and hidden by the `hidden` attribute as well as the inline display: a phone held upright lays
  // the box out as a grid with !important (it has to beat the inline display: flex), which an inline
  // display: none cannot beat - so the box stayed on screen after the last line, its listener gone and
  // the game running again (v6.0.3, Norton: 完成一個chapter，然後按不下去). The !important rules skip [hidden].
  function showDialogueBox(box, shown) {
    box.hidden = !shown;
    box.style.display = shown ? 'flex' : 'none';
  }

  function ensureDialogueBox() {
    let box = document.getElementById('campaign-dialogue');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'campaign-dialogue';
    box.setAttribute('role', 'dialog');
    showDialogueBox(box, false);
    document.body.appendChild(box);
    return box;
  }

  // The faces the 市長登記 offers: the speakers and the council's officials (getCampaignMayorFaces).
  function getMayorFaces() {
    return getCampaignMayorFaces(typeof COUNCIL_OFFICIAL_DEFS !== 'undefined' ? COUNCIL_OFFICIAL_DEFS : []);
  }

  function getMayorFace(id) {
    const faces = getMayorFaces();
    return faces.find((face) => face.id === id) || faces.find((face) => face.id === CAMPAIGN_MAYOR_DEFAULT_FACE);
  }

  function faceName(face) {
    return face?.nameKey && typeof t === 'function' ? t(face.nameKey) : say(face?.name);
  }

  // The mayor is the player: the name and the face of the 市長登記, once it is filled in.
  function getSpeaker(id) {
    const speaker = CAMPAIGN_SPEAKERS[id] || {};
    const mayor = id === 'mayor' ? runtime.profile.mayor : null;
    if (!mayor) return speaker;
    return { ...speaker, name: mayor.name, portrait: getMayorFace(mayor.portrait)?.portrait || speaker.portrait };
  }

  function renderSpeaker(id) {
    const speaker = getSpeaker(id);
    const face = speaker.portrait
      ? `<img class="cd-portrait" src="${escapeHtml(campaignImageSrc(speaker.portrait))}" alt="">`
      : `<div class="cd-portrait cd-glyph" aria-hidden="true">${escapeHtml(speaker.glyph || '💬')}</div>`;
    return { face, name: say(speaker.name) };
  }

  // A cut-scene's backdrop: the screen dimmed behind the box (over the title screen too), with a
  // picture when one is given. A click on it moves the scene on like a click on the box.
  function showDialogueBackdrop(image, onClick, position = '') {
    let layer = document.getElementById('campaign-backdrop');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'campaign-backdrop';
      document.body.appendChild(layer);
    }
    layer.style.backgroundImage = typeof image === 'string' && image
      ? `linear-gradient(rgba(8,12,18,0.15), rgba(8,12,18,0.15)), url("${encodeURI(campaignImageSrc(image))}")` : '';
    layer.style.backgroundPosition = position;
    layer.onclick = onClick;
    layer.style.display = 'block';
    return layer;
  }

  // Plays lines one at a time (a click moves on); the clock stops while it is open. A line with
  // `choices` waits for one of its buttons, and the chosen option's `lines` play next.
  // options.backdrop (true, or a picture's path) plays the lines as a cut-scene; with options.reveal the
  // picture shows alone for CAMPAIGN_SCENE_REVEAL_MS (or until a click) before the first line;
  // options.backdropPosition places a picture whose subject is off centre.
  const CAMPAIGN_SCENE_REVEAL_MS = 1600;
  function playCampaignDialogue(lines, options = {}) {
    const list = (lines || []).filter(Boolean);
    if (!list.length || typeof document === 'undefined') return runtime.dialogue;
    runtime.dialogue = runtime.dialogue.then(() => new Promise((resolve) => {
      const box = ensureDialogueBox();
      const previousSpeed = typeof getGameSpeed === 'function' ? getGameSpeed() : null;
      if (typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') setGameSpeed(GAME_SPEEDS.PAUSED);
      runtime.dialogueOpen = true;
      let index = 0;
      let backdrop = null;
      const show = () => {
        const line = list[index];
        const scene = backdrop ? ' is-scene' : '';
        if (line.card) {
          box.className = `is-card${scene}`;
          box.innerHTML = `<div class="cd-card">${escapeHtml(say(line.card))}</div>
            ${line.hint ? `<div class="cd-hint">${escapeHtml(say(line.hint))}</div>` : ''}
            <div class="cd-next">${escapeHtml(say(L('撳一下繼續 ▶', 'Click to continue ▶', 'クリックで続く ▶')))}</div>`;
        } else {
          const { face, name } = renderSpeaker(line.speaker);
          const choices = Array.isArray(line.choices)
            ? `<div class="cd-choices">${line.choices.map((choice, i) => `<button type="button" data-choice="${i}">${escapeHtml(say(choice.text))}</button>`).join('')}</div>`
            : `<div class="cd-next">${index + 1} / ${list.length} ▶</div>`;
          box.className = `${line.speaker === 'queen' ? 'is-royal' : ''}${scene}`.trim();
          box.innerHTML = `${face}<div class="cd-body"><div class="cd-name">${escapeHtml(name)}</div>
            <div class="cd-text">${escapeHtml(say(line.text))}</div>${choices}</div>`;
        }
      };
      // over a chapter's board the board shows alone first - its title banner - then the band rises
      let revealed = !(options.reveal && options.backdrop);
      let revealTimer = null;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        clearTimeout(revealTimer);
        showDialogueBox(box, true);
        box.classList.add('is-revealing');
        setTimeout(() => box.classList.remove('is-revealing'), 400);
      };
      const next = (event) => {
        if (!revealed) { reveal(); return; }
        const line = list[index];
        if (Array.isArray(line.choices)) {
          const button = event?.target?.closest?.('[data-choice]');
          if (!button) return;
          list.splice(index + 1, 0, ...((line.choices[Number(button.dataset.choice)] || {}).lines || []).filter(Boolean));
        }
        index += 1;
        if (index < list.length) { show(); return; }
        box.removeEventListener('click', next);
        showDialogueBox(box, false);
        if (backdrop) { backdrop.style.display = 'none'; backdrop.onclick = null; }
        runtime.dialogueOpen = false;
        if (previousSpeed !== null && typeof setGameSpeed === 'function') setGameSpeed(previousSpeed);
        resolve();
      };
      if (options.backdrop) backdrop = showDialogueBackdrop(options.backdrop, next, options.backdropPosition);
      box.addEventListener('click', next);
      show();
      if (revealed) showDialogueBox(box, true);
      else { showDialogueBox(box, false); revealTimer = setTimeout(reveal, CAMPAIGN_SCENE_REVEAL_MS); }
    }));
    return runtime.dialogue;
  }

  // PROLOGUE 00《女皇密令》 as a cut-scene: the letter on the desk, read out by Her Majesty; the
  // player's reply and her answer; then the arrival in North District, over the city.
  function getCampaignPrologueScene() {
    const p = CAMPAIGN_PROLOGUE;
    const ask = { speaker: 'mayor', text: p.ask, choices: p.replies.map((reply) => ({
      text: reply.text,
      lines: [{ speaker: 'mayor', text: reply.text }, { speaker: 'queen', text: reply.answer }],
    })) };
    return [...p.opening, ...p.letter, ask, p.departure];
  }

  function playCampaignPrologue() {
    playCampaignDialogue(getCampaignPrologueScene(), { backdrop: CAMPAIGN_PROLOGUE.backdrop || true, backdropPosition: CAMPAIGN_PROLOGUE.backdropPosition });
    // replayed from the title screen there is no city to arrive in: the arrival stays a cut-scene
    return playCampaignDialogue(CAMPAIGN_PROLOGUE.arrival, { backdrop: isLandingVisible() });
  }

  // ── Objectives panel and tutorial ─────────────────────────────────────────

  function ensureCampaignPanel() {
    let panel = document.getElementById('campaign-panel');
    if (panel) return panel;
    panel = document.createElement('aside');
    panel.id = 'campaign-panel';
    panel.style.display = 'none';
    panel.addEventListener('click', onCampaignPanelClick);
    document.body.appendChild(panel);
    return panel;
  }

  function onCampaignPanelClick(event) {
    const action = event.target.closest('[data-campaign-action]')?.dataset.campaignAction;
    const run = getRun();
    const spec = run ? CAMPAIGN_CHAPTER_SPECS[run.chapterId] : null;
    if (action === 'collapse') runtime.collapsed = !runtime.collapsed;
    else if (action === 'objectives') {
      runtime.objectivesOpen = !runtime.objectivesOpen;
      // folded again, the panel is short: back to its top, where the tutorial is
      if (!runtime.objectivesOpen) event.currentTarget.scrollTop = 0;
    }
    else if (action === 'skip-tutorial' && run) { skipCampaignTutorial(run); rememberCampaignTutorial(run); setTutorialHighlight([]); }
    else if (action === 'tutorial-look') { lookFromCampaignTutorial(event.target.closest('[data-look]')?.dataset.look); return; }
    else if (action === 'ack' && run && spec) {
      acknowledgeCampaignTutorialStep(run, spec);
      if (run.tutorial?.done) announceTutorialDone();
    } else if (action === 'chapters') openCampaignSelect();
    else return;
    renderCampaignPanel();
  }

  // A tutorial step's 睇長廊 / 睇賽道 / 節慶日曆 button.
  function lookFromCampaignTutorial(look) {
    const scene = typeof activeScene !== 'undefined' ? activeScene : null;
    if (look === 'festival') { if (typeof openFestivalCalendar === 'function') openFestivalCalendar(); return; }
    const { run, course } = collectDragonBoatFacts(true);
    if (look === 'run' && run?.length && scene && typeof centerCameraOnTile === 'function') {
      const [r, c] = run[Math.floor(run.length / 2)];
      centerCameraOnTile(scene, r, c);
    } else if (look === 'course' && course && scene) {
      flashDragonBoatCourse(scene, course);
    } else if (look === 'course' && typeof showToast === 'function') {
      showToast(say(L('仲未搵到合適嘅賽道。', 'No course fits yet.', 'まだコースが見つかりません。')), 'warning');
    }
  }

  // 睇賽道: the camera to the course, outlined on the water for a few seconds.
  function flashDragonBoatCourse(scene, course) {
    if (typeof dbPoint !== 'function') return;
    const len = course.distanceM / 20;
    const middle = dbPoint(course, len / 2, 1.5);
    if (typeof centerCameraOnTile === 'function') centerCameraOnTile(scene, Math.round(middle.row), Math.round(middle.col));
    if (!scene?.add || typeof isoToScreen !== 'function') return;
    scene.dragonBoatCourseFlash?.destroy();
    const g = scene.add.graphics();
    if (typeof addToRenderLayer === 'function') addToRenderLayer(scene, g, 'effectLayer');
    g.setDepth(typeof getPreviewOverlayDepth === 'function' ? getPreviewOverlayDepth(0) : 1e6);
    const surface = (typeof BUILDING_SURFACE_Y_OFFSET === 'number' ? BUILDING_SURFACE_Y_OFFSET : 15) + (typeof TILE_HEIGHT === 'number' ? TILE_HEIGHT / 2 : 16);
    const points = [[-1, -0.5], [len + 1, -0.5], [len + 1, 3.5], [-1, 3.5]].map(([along, across]) => {
      const p = dbPoint(course, along, across);
      const at = isoToScreen(p.col, p.row);
      return { x: at.x + (scene.offsetX || 0), y: at.y + (scene.offsetY || 0) - surface };
    });
    g.fillStyle(0xffd54a, 0.25);
    g.lineStyle(3, 0xc2410c, 0.95);
    g.beginPath();
    points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fillPath();
    g.strokePath();
    scene.dragonBoatCourseFlash = g;
    scene.time?.delayedCall?.(6000, () => {
      if (scene.dragonBoatCourseFlash === g) scene.dragonBoatCourseFlash = null;
      g.destroy();
    });
  }

  // The touch UI has its own buttons for a step: the 建造 tab (and, held sideways, the menu handle
  // that shows it), the same departments by category, then the tool; the budget is under 管理.
  function touchTutorialHighlight(selectors) {
    const out = new Set();
    for (const selector of selectors || []) {
      const category = /^\[data-tool-category="([\w-]+)"\]$/.exec(selector);
      const tool = /^\[data-tool="([\w-]+)"\]$/.exec(selector);
      if (category) ['#mobile-nav-toggle', '#mobile-nav [data-mobile-page="build"]', `[data-mobile-category="${category[1]}"]`].forEach((s) => out.add(s));
      else if (tool) out.add(`[data-mobile-tool="${tool[1]}"]`);
      else if (selector === '#topbar-income' || selector === '#topbar-expense') ['#mobile-nav-toggle', '#mobile-nav [data-mobile-page="manage"]', '[data-mobile-native="finance"]'].forEach((s) => out.add(s));
    }
    return [...out];
  }

  function setTutorialHighlight(selectors) {
    runtime.highlighted.forEach((el) => el.classList.remove('campaign-tutorial-highlight'));
    runtime.highlighted = [];
    (selectors || []).forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        el.classList.add('campaign-tutorial-highlight');
        runtime.highlighted.push(el);
      });
    });
  }

  // A shared tutorial (a chapter's tutorialId) the player is through - finished or skipped - is not
  // played again in a later chapter.
  function rememberCampaignTutorial(run) {
    const id = run ? CAMPAIGN_CHAPTER_SPECS[run.chapterId]?.tutorialId : null;
    if (!id || runtime.profile.tutorials?.[id]) return;
    runtime.profile.tutorials = { ...(runtime.profile.tutorials || {}), [id]: true };
    scheduleCampaignProfileSave();
  }

  function announceTutorialDone() {
    rememberCampaignTutorial(getRun());
    setTutorialHighlight([]);
    if (typeof showToast === 'function') showToast(say(L('🎓 教學完成！而家朝住一星目標進發。', '🎓 Tutorial complete! Now go for the first star.', '🎓 チュートリアル完了！一つ目の星を目指そう。')), 'info');
  }

  // The tutorial moves as the player builds, not at the month's turn.
  function stepCampaignTutorial(run, spec, snapshot) {
    if (!run?.tutorial || run.tutorial.done || run.tutorial.skipped) return;
    const { completed, finished } = advanceCampaignTutorial(run, spec, snapshot);
    completed.forEach((id) => {
      const step = spec.tutorial.find((entry) => entry.id === id);
      if (step && typeof showToast === 'function') showToast(`✓ ${say(L('完成', 'Done', '完了'))}：${say(step.text).split('：')[0].split(':')[0]}`, 'info');
    });
    if (finished) announceTutorialDone();
  }

  function renderStars(count) {
    return [1, 2, 3].map((n) => `<span class="${n <= count ? 'is-on' : ''}">${n <= count ? '★' : '☆'}</span>`).join('');
  }

  function renderCampaignPanel() {
    if (typeof document === 'undefined') return;
    const panel = ensureCampaignPanel();
    const run = getRun();
    const spec = run ? CAMPAIGN_CHAPTER_SPECS[run.chapterId] : null;
    if (!run || !spec || isLandingVisible()) {
      panel.style.display = 'none';
      setTutorialHighlight([]);
      return;
    }
    const chapter = CAMPAIGN_CHAPTERS_BY_ID[run.chapterId];
    const snapshot = buildCampaignSnapshot();
    stepCampaignTutorial(run, spec, snapshot);
    const step = getCampaignTutorialStep(run, spec);
    const touch = isTouchCampaign();
    panel.classList.toggle('is-touch', touch);
    const highlight = step && !runtime.collapsed ? step.highlight : [];
    setTutorialHighlight(touch ? touchTutorialHighlight(highlight) : highlight);

    const head = `
      <div class="cp-head">
        <span>${escapeHtml(say(L(`第 ${String(chapter.number).padStart(2, '0')} 章・`, `Chapter ${chapter.number} · `, `第${chapter.number}章・`)))}${escapeHtml(say(chapter.district))}</span>
        <span class="cp-stars">${renderStars(run.stars)}</span>
        <button type="button" data-campaign-action="collapse" title="${escapeHtml(say(L('收起／展開', 'Fold / unfold', '折りたたむ')))}">${runtime.collapsed ? '+' : '−'}</button>
      </div>`;
    if (runtime.collapsed) {
      panel.innerHTML = head;
      panel.style.display = 'block';
      return;
    }
    let tutorial = '';
    if (step) {
      const { face, name } = renderSpeaker(step.speaker);
      tutorial = `
        <div class="cp-tutorial">
          <div class="cp-section">🎓 ${escapeHtml(say(L('教學', 'Tutorial', 'チュートリアル')))} ${run.tutorial.step + 1} / ${spec.tutorial.length}</div>
          <div class="cp-tutor">${face}<div><div class="cp-tutor-name">${escapeHtml(name)}</div><div>${escapeHtml(say(touch && step.touchText ? step.touchText : step.text))}</div></div></div>
          <div class="cp-tutorial-actions">
            ${step.look ? `<button type="button" class="cp-look" data-campaign-action="tutorial-look" data-look="${escapeHtml(step.look)}">${escapeHtml(say({
              run: L('睇長廊', 'Show the promenade', '遊歩道を見る'),
              course: L('睇賽道', 'Show the course', 'コースを見る'),
              festival: L('節慶日曆', 'Festival calendar', '祭りカレンダー'),
            }[step.look] || L('睇', 'Show', '見る')))}</button>` : ''}
            ${step.ack ? `<button type="button" class="cp-ack" data-campaign-action="ack">${escapeHtml(say(L('明白', 'Got it', 'わかった')))}</button>` : ''}
            <button type="button" class="cp-skip" data-campaign-action="skip-tutorial">${escapeHtml(say(L('跳過教學', 'Skip tutorial', 'チュートリアルを飛ばす')))}</button>
          </div>
        </div>`;
    }
    const monthIndex = monthIndexNow();
    let status = '';
    if (run.freePlay) status = say(L('自由建設（本章不再計星）', 'Free building (no more stars this chapter)', '自由建設（この章の星は対象外）'));
    else if (run.failed) status = say(L('一星限期已過', 'The first star\'s time is up', '一つ目の星の期限切れ'));
    else if (run.stars === 0) status = say(L(`一星限期：剩 ${getCampaignMonthsLeft(run, monthIndex)} 個月`, `First star: ${getCampaignMonthsLeft(run, monthIndex)} months left`, `一つ目の星：残り${getCampaignMonthsLeft(run, monthIndex)}か月`));
    else if (run.stars < 3) status = say(L('二、三星不限時', 'Stars 2 and 3 have no time limit', '二つ目・三つ目の星は期限なし'));
    else status = say(L('三星完成！', 'All three stars!', '三つ星達成！'));
    let objectives = '';
    if (run.stars < spec.stars.length && !run.freePlay) {
      const star = spec.stars[run.stars];
      const result = evaluateCampaignStar(spec, run.stars, snapshot, run);
      const heading = `${'★'.repeat(run.stars + 1)} ${escapeHtml(say(star.title))}`;
      // on a phone the list is one line until tapped open, so the map stays in view
      const folded = touch && !runtime.objectivesOpen;
      objectives = touch
        ? `<button type="button" class="cp-section cp-fold" data-campaign-action="objectives" aria-expanded="${!folded}">
            <span>${heading}</span><span class="cp-count">${result.items.filter((item) => item.done).length} / ${result.items.length} ${folded ? '▸' : '▾'}</span></button>`
        : `<div class="cp-section">${heading}</div>`;
      if (!folded) objectives += `
        <ul class="cp-objectives">${result.items.map((item) => `
          <li class="${item.done ? 'is-done' : ''}"><span class="cp-tick">${item.done ? '✓' : '○'}</span>
            <span class="cp-label">${escapeHtml(say(item.label))}</span>
            ${item.progress ? `<span class="cp-progress">${escapeHtml(item.progress)}</span>` : ''}</li>`).join('')}
        </ul>`;
    }
    const foot = touch && !runtime.objectivesOpen && run.stars < spec.stars.length && !run.freePlay ? ''
      : `<div class="cp-foot"><button type="button" data-campaign-action="chapters">🗺 ${escapeHtml(say(L('章節地圖', 'Chapter map', '章マップ')))}</button></div>`;
    panel.innerHTML = `${head}
      <div class="cp-title">《${escapeHtml(say(chapter.title))}》</div>
      ${tutorial}
      <div class="cp-status">${escapeHtml(status)}</div>
      ${objectives}
      ${foot}`;
    panel.style.display = 'block';
  }

  // ── The month's turn ──────────────────────────────────────────────────────

  function postCampaignForum(entry, id) {
    if (!entry || typeof addForumPost !== 'function') return;
    const lang = language();
    const comments = (entry.comments || (entry.comment ? [entry.comment] : []))
      .map((text, i) => ({ author: say(L(`街坊${'ABCDE'[i] || ''}`, `Resident ${'ABCDE'[i] || ''}`, `住民${'ABCDE'[i] || ''}`)), text: say(text) }));
    addForumPost({
      headline: say(entry.headline),
      body: [say(entry.body)],
      source: 'local',
      social: { likes: '1,824', laughs: '3,077', angry: '214', commentCount: String(comments.length * 137), shares: '402', comments },
    }, { id, category: lang === 'en' ? 'City' : '城中熱話', author: say(L('香城討論區', 'Heung Shing Forum', '香城掲示板')) });
  }

  function onCampaignStar(run, spec, star) {
    const chapter = CAMPAIGN_CHAPTERS_BY_ID[run.chapterId];
    if (recordCampaignStars(runtime.profile, run, campaignStamp())) {
      scheduleCampaignProfileSave();
      // E01 九龍皇帝: a star in every district, judged at once (medals.js)
      if (star === 1 && typeof runMedalEvaluation === 'function') runMedalEvaluation();
    }
    if (typeof showToast === 'function') {
      showToast(say(L(`⭐ 第 ${chapter.number} 章${'一二三'[star - 1]}星：《${say(spec.stars[star - 1].title)}》`,
        `⭐ Chapter ${chapter.number}, star ${star}: "${say(spec.stars[star - 1].title)}"`,
        `⭐ 第${chapter.number}章 星${star}：「${say(spec.stars[star - 1].title)}」`)), 'medal');
    }
    if (star === 1) {
      playCampaignDialogue(spec.outro, { backdrop: spec.outroScene || false, reveal: true });
      postCampaignForum(spec.outroForum, `campaign-${run.chapterId}-star1`);
      // the next chapter, and past any still to come, the next one that can be played
      if (typeof showToast === 'function') getCampaignChaptersUnlockedBy(chapter.id).forEach((next) => {
        showToast(say(isCampaignChapterPlayable(next.id)
          ? L(`🔓 解鎖第 ${next.number} 章：${say(next.district)}`, `🔓 Chapter ${next.number} unlocked: ${say(next.district)}`, `🔓 第${next.number}章を解放：${say(next.district)}`)
          : L(`🔓 第 ${next.number} 章${say(next.district)}已解鎖（即將推出）`, `🔓 Chapter ${next.number}, ${say(next.district)}, unlocked (coming soon)`, `🔓 第${next.number}章${say(next.district)}を解放（近日公開）`)), 'info');
      });
    }
  }

  function showCampaignFailure(run, spec) {
    const months = Math.max(1, Math.floor(Number(run.deadlineMonthIndex) - Number(run.startMonthIndex)) || getCampaignDeadlineMonths(run.chapterId));
    playCampaignDialogue(spec.failure).then(() => {
      let dialog = document.getElementById('campaign-failure-dialog');
      if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'campaign-failure-dialog';
        dialog.className = 'sim-dialog';
        document.body.appendChild(dialog);
      }
      dialog.innerHTML = `
        <div class="dialog-overlay"></div>
        <div class="dialog-box" style="max-width:440px">
          <div class="dialog-title-bar"><span>${escapeHtml(say(L('限期已過', 'Time is up', '期限切れ')))}</span></div>
          <div class="dialog-body campaign-plain">${escapeHtml(say(L(`${months} 個月內未攞到一星。`, `The first star was not reached in ${months} months.`, `${months}か月以内に一つ目の星に届きませんでした。`)))}</div>
          <div class="dialog-footer">
            <button type="button" class="dialog-cancel-btn" data-choice="free">${escapeHtml(say(L('繼續自由建設', 'Keep building freely', '自由建設を続ける')))}</button>
            <button type="button" class="dialog-ok-btn" data-choice="retry">${escapeHtml(say(L('重新開始本章', 'Restart the chapter', 'この章をやり直す')))}</button>
          </div>
        </div>`;
      dialog.style.display = 'flex';
      dialog.querySelector('.dialog-footer').addEventListener('click', (event) => {
        const choice = event.target.closest('[data-choice]')?.dataset.choice;
        if (!choice) return;
        dialog.style.display = 'none';
        if (choice === 'retry') {
          city.campaign = null;
          startCampaignChapter(run.chapterId);
        } else {
          run.freePlay = true;
          renderCampaignPanel();
        }
      });
    });
  }

  function onCampaignMonthTurned() {
    const run = getRun();
    if (!run) return;
    const spec = CAMPAIGN_CHAPTER_SPECS[run.chapterId];
    if (!spec) return;
    const result = advanceCampaignRun(run, spec, buildCampaignSnapshot(), monthIndexNow());
    result.events.forEach((event) => {
      playCampaignDialogue(event.lines, { backdrop: event.scene || false, reveal: true });
      postCampaignForum(event.forum, `campaign-${run.chapterId}-${event.id}`);
    });
    result.newStars.forEach((star) => onCampaignStar(run, spec, star));
    if (result.failedNow) showCampaignFailure(run, spec);
    renderCampaignPanel();
  }

  // save.js, once a city has loaded (a chapter run comes back with its save)
  function onCampaignCityLoaded() {
    runtime.collapsed = false;
    renderCampaignPanel();
  }

  // ── Chapter map ───────────────────────────────────────────────────────────

  function getChapterPin(chapter) {
    const map = (typeof HK_DISTRICT_MAPS !== 'undefined' ? HK_DISTRICT_MAPS : []).find((entry) => entry.id === chapter.mapId);
    if (!map || typeof getDistrictOverviewBox !== 'function') return null;
    const offset = CAMPAIGN_PIN_OFFSETS[chapter.id] || {};
    return getDistrictOverviewBox({ centre: { e: map.centre.e + (offset.de || 0), n: map.centre.n + (offset.dn || 0) } });
  }

  function getChapterState(chapter) {
    const stars = runtime.profile.chapters[chapter.id]?.stars || 0;
    if (!isCampaignChapterUnlocked(runtime.profile, chapter.id)) return { key: 'locked', stars };
    if (!isCampaignChapterPlayable(chapter.id)) return { key: 'soon', stars };
    if (runtime.startFileReady[chapter.id] === false) return { key: 'preparing', stars };
    return { key: stars ? 'cleared' : 'open', stars };
  }

  // Which chapters that wait for a built start city have one yet (a HEAD request each).
  async function checkCampaignStartFiles() {
    await Promise.all(Object.entries(CAMPAIGN_CHAPTER_SPECS).filter(([, spec]) => spec.requiresStartFile).map(async ([id, spec]) => {
      try {
        const response = await fetch(spec.startFile, { method: 'HEAD', cache: 'no-store' });
        runtime.startFileReady[id] = response.ok;
      } catch {
        runtime.startFileReady[id] = false;
      }
    }));
  }

  function renderCampaignSelect() {
    const dialog = document.getElementById('campaign-select-dialog');
    if (!dialog) return;
    const pins = CAMPAIGN_CHAPTERS.map((chapter) => {
      const box = getChapterPin(chapter);
      if (!box) return '';
      const state = getChapterState(chapter);
      return `<button type="button" class="cs-pin is-${state.key}${runtime.selectedChapterId === chapter.id ? ' is-selected' : ''}"
        style="left:${box.x.toFixed(2)}%;top:${box.y.toFixed(2)}%" data-chapter="${chapter.id}"
        title="${escapeHtml(say(chapter.district))}">${String(chapter.number).padStart(2, '0')}</button>`;
    }).join('');
    // on a phone the 18 pins pile up on the small map: the chapters are a grid of buttons as well
    const chips = CAMPAIGN_CHAPTERS.map((chapter) => {
      const state = getChapterState(chapter);
      const selected = runtime.selectedChapterId === chapter.id;
      return `<button type="button" class="cs-chip is-${state.key}${selected ? ' is-selected' : ''}" data-chapter="${chapter.id}" aria-pressed="${selected}">
        <b>${String(chapter.number).padStart(2, '0')}</b><span>${escapeHtml(say(chapter.district))}</span></button>`;
    }).join('');
    const chapter = CAMPAIGN_CHAPTERS_BY_ID[runtime.selectedChapterId] || CAMPAIGN_CHAPTERS[0];
    const state = getChapterState(chapter);
    const stateText = {
      locked: L('未解鎖：上一章取得一星先開放', 'Locked: earn a star in the chapter before', '未解放：前の章で星を1つ獲得すると解放'),
      soon: L('即將推出', 'Coming soon', '近日公開'),
      preparing: L('開局城市準備中', 'Its starting city is still being built', '開始都市を準備中'),
      open: L('可以開始', 'Ready to play', 'プレイ可能'),
      cleared: L('已取得星級', 'Stars earned', '星を獲得済み'),
    }[state.key];
    const total = CAMPAIGN_CHAPTERS.reduce((sum, entry) => sum + (runtime.profile.chapters[entry.id]?.stars || 0), 0);
    const cleared = CAMPAIGN_CHAPTERS.filter((entry) => (runtime.profile.chapters[entry.id]?.stars || 0) > 0).length;
    const mayor = runtime.profile.mayor;
    const mayorRow = mayor ? `<button type="button" class="cs-mayor" data-cs-action="mayor" title="${escapeHtml(say(L('改市長資料', 'Change the mayor', '市長情報を変更')))}">
        <img src="${escapeHtml(campaignImageSrc(getMayorFace(mayor.portrait)?.portrait || ''))}" alt="">
        <span><strong>${escapeHtml(say(L(`${mayor.name} 市長`, `Mayor ${mayor.name}`, `${mayor.name} 市長`)))}</strong>
        <small>${escapeHtml(say(L(`生日 ${mayor.birthMonth} 月 ${mayor.birthDay} 日・改資料 ✎`, `Birthday ${MONTHS_EN[mayor.birthMonth - 1]} ${mayor.birthDay} · edit ✎`, `誕生日 ${mayor.birthMonth}月${mayor.birthDay}日・変更 ✎`)))}</small></span></button>` : '';
    dialog.querySelector('[data-cs-body]').innerHTML = `
      <div class="cs-top">${mayorRow}<div class="cs-summary">${escapeHtml(say(L(`主線 ${cleared}／18 區・星數 ${total}／54`, `Main story ${cleared}/18 districts · ${total}/54 stars`, `メイン ${cleared}／18区・星 ${total}／54`)))}</div></div>
      <div class="cs-map"><img src="UI/hk-district-overview.webp" alt="">${pins}</div>
      <div class="cs-grid" role="group" aria-label="${escapeHtml(say(L('章節', 'Chapters', '章')))}">${chips}</div>
      <div class="cs-detail">
        <div class="cs-detail-title">${escapeHtml(say(L(`第 ${String(chapter.number).padStart(2, '0')} 章・`, `Chapter ${chapter.number} · `, `第${chapter.number}章・`)))}${escapeHtml(say(chapter.district))}《${escapeHtml(say(chapter.title))}》</div>
        <div class="cs-detail-meta"><span class="cp-stars">${renderStars(state.stars)}</span> ${escapeHtml(say(stateText))}</div>
        <div class="cs-detail-actions">
          ${chapter.number === 1 && runtime.profile.prologueSeen ? `<button type="button" class="dialog-cancel-btn" data-cs-action="prologue">${escapeHtml(say(L('重看序幕', 'Replay the prologue', 'プロローグを再生')))}</button>` : ''}
          <button type="button" class="dialog-ok-btn" data-cs-action="start" ${state.key === 'open' || state.key === 'cleared' ? '' : 'disabled'}>${escapeHtml(say(L('開始', 'Start', '開始')))}</button>
        </div>
      </div>`;
  }

  // ── 市長登記 ──────────────────────────────────────────────────────────────
  // (Norton 2026-11-20: 參考大航海時代4) a parchment sheet in the dialogue's maroon and gold: first the
  // name and the birthday beside the chosen face, then the faces of Heung Shing to pick from. Resolves
  // true once it is filled in and kept, false when it is closed.

  const MONTHS_EN = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

  function openCampaignMayorPanel({ first = false } = {}) {
    if (typeof document === 'undefined') return Promise.resolve(false);
    document.getElementById('campaign-mayor')?.remove();
    const saved = runtime.profile.mayor;
    const draft = saved ? { ...saved } : { name: '', birthMonth: 1, birthDay: 1, portrait: CAMPAIGN_MAYOR_DEFAULT_FACE };
    let step = 'form';
    let error = '';
    const layer = document.createElement('div');
    layer.id = 'campaign-mayor';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    document.body.appendChild(layer);

    const preview = () => {
      const face = getMayorFace(draft.portrait);
      return `<div class="cm-face"><div class="cm-frame"><img src="${escapeHtml(campaignImageSrc(face?.portrait || ''))}" alt=""></div>
        <div class="cm-plate">${escapeHtml(draft.name || say(L('無名氏', 'Nameless', '名無し')))}</div>
        <div class="cm-face-caption">${escapeHtml(faceName(face))}</div></div>`;
    };
    const render = () => {
      const days = CAMPAIGN_MAYOR_DAYS_IN_MONTH[draft.birthMonth - 1];
      if (draft.birthDay > days) draft.birthDay = days;
      const monthOption = (m) => say(L(`${m} 月`, MONTHS_EN[m - 1], `${m}月`));
      const dayOption = (d) => say(L(`${d} 日`, String(d), `${d}日`));
      const body = step === 'form' ? `
        <div class="cm-title">${escapeHtml(say(L('香城市長登記', 'Mayor of Heung Shing: Registration', '香城市長 登録')))}</div>
        <div class="cm-lede">${escapeHtml(say(first
          ? L('女皇陛下嘅密令到之前，請先報上名來。', 'Before Her Majesty\'s secret order arrives, tell us who you are.', '女王陛下の密令が届く前に、名を名乗りたまえ。')
          : L('改市長嘅名、生日同樣貌。', 'Change the mayor\'s name, birthday and face.', '市長の名前・誕生日・顔を変更します。')))}</div>
        <div class="cm-body">${preview()}
          <div class="cm-form">
            <label class="cm-field"><span>${escapeHtml(say(L('姓名', 'Name', '名前')))}</span>
              <input type="text" data-cm-name maxlength="${CAMPAIGN_MAYOR_NAME_MAX * 2}" autocomplete="off" value="${escapeHtml(draft.name)}"
                placeholder="${escapeHtml(say(L('例如：陳大文', 'e.g. Chan Tai-man', '例：陳大文')))}"></label>
            <div class="cm-field"><span>${escapeHtml(say(L('生日', 'Birthday', '誕生日')))}</span>
              <div class="cm-date">
                <select data-cm-month aria-label="${escapeHtml(say(L('月', 'Month', '月')))}">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${draft.birthMonth === i + 1 ? 'selected' : ''}>${escapeHtml(monthOption(i + 1))}</option>`).join('')}</select>
                <select data-cm-day aria-label="${escapeHtml(say(L('日', 'Day', '日')))}">${Array.from({ length: days }, (_, i) => `<option value="${i + 1}" ${draft.birthDay === i + 1 ? 'selected' : ''}>${escapeHtml(dayOption(i + 1))}</option>`).join('')}</select>
              </div></div>
            <p class="cm-note">🎆 ${escapeHtml(say(L('每年生日嗰個月嘅晚上八點係「市長日」，全城會為你放煙花。', 'Every year, at eight on the evening of your birthday month, it is Mayor\'s Day: fireworks over the whole city.', '毎年、誕生月の夜8時は「市長の日」。街じゅうで花火が上がります。')))}</p>
            ${error ? `<p class="cm-error" role="alert">${escapeHtml(error)}</p>` : ''}
          </div></div>
        <div class="cm-actions">
          <button type="button" class="cm-btn" data-cm-action="close">${escapeHtml(say(L('取消', 'Cancel', 'キャンセル')))}</button>
          <button type="button" class="cm-btn is-primary" data-cm-action="faces">${escapeHtml(say(L('揀樣貌 ▶', 'Choose a face ▶', '顔を選ぶ ▶')))}</button>
        </div>` : `
        <div class="cm-title">${escapeHtml(say(L('揀選市長嘅樣貌', 'Choose the mayor\'s face', '市長の顔を選ぶ')))}</div>
        <div class="cm-body is-faces">${preview()}
          <div class="cm-grid" role="listbox" aria-label="${escapeHtml(say(L('香城人物', 'The people of Heung Shing', '香城の人々')))}">${getMayorFaces().map((face) => `
            <button type="button" class="cm-pick${face.id === draft.portrait ? ' is-on' : ''}" role="option" aria-selected="${face.id === draft.portrait}"
              data-cm-face="${escapeHtml(face.id)}" title="${escapeHtml(faceName(face))}"><img src="${escapeHtml(campaignImageSrc(face.portrait))}" alt="${escapeHtml(faceName(face))}" loading="lazy"></button>`).join('')}
          </div></div>
        <div class="cm-actions">
          <button type="button" class="cm-btn" data-cm-action="back">${escapeHtml(say(L('◀ 返回', '◀ Back', '◀ 戻る')))}</button>
          <button type="button" class="cm-btn is-primary" data-cm-action="done">${escapeHtml(say(L('就係佢！', 'That\'s me!', 'これで決まり！')))}</button>
        </div>`;
      layer.innerHTML = `<div class="cm-sheet">${body}</div>`;
    };

    return new Promise((resolve) => {
      const finish = (kept) => {
        layer.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(kept);
      };
      const toFaces = () => {
        draft.name = String(layer.querySelector('[data-cm-name]')?.value ?? draft.name);
        const mayor = normalizeCampaignMayor(draft);
        if (!mayor) {
          error = say(L('請先填市長姓名。', 'Please enter the mayor\'s name.', '市長の名前を入力してください。'));
          render();
          layer.querySelector('[data-cm-name]')?.focus();
          return;
        }
        Object.assign(draft, mayor);
        error = '';
        step = 'faces';
        render();
        layer.querySelector('.cm-pick.is-on')?.scrollIntoView?.({ block: 'nearest' });
      };
      const done = () => {
        const mayor = normalizeCampaignMayor(draft);
        if (!mayor) { step = 'form'; render(); return; }
        runtime.profile.mayor = mayor;
        scheduleCampaignProfileSave();
        if (typeof showToast === 'function') showToast(say(L(`歡迎上任，${mayor.name}市長！`, `Welcome to office, Mayor ${mayor.name}!`, `ようこそ、${mayor.name}市長！`)), 'success');
        finish(true);
      };
      const onKey = (event) => {
        if (event.key === 'Escape') { event.stopPropagation(); finish(false); }
        else if (event.key === 'Enter' && event.target.matches?.('[data-cm-name]')) { event.preventDefault(); toFaces(); }
      };
      document.addEventListener('keydown', onKey, true);
      layer.addEventListener('input', (event) => {
        if (!event.target.matches('[data-cm-name]')) return;
        draft.name = event.target.value;
        // typing answers the "enter a name" note
        if (error) { error = ''; layer.querySelector('.cm-error')?.remove(); }
        const plate = layer.querySelector('.cm-plate');
        if (plate) plate.textContent = normalizeCampaignMayor({ ...draft, name: draft.name })?.name || say(L('無名氏', 'Nameless', '名無し'));
      });
      layer.addEventListener('change', (event) => {
        if (event.target.matches('[data-cm-month]')) { draft.birthMonth = Number(event.target.value); render(); }
        else if (event.target.matches('[data-cm-day]')) draft.birthDay = Number(event.target.value);
      });
      layer.addEventListener('click', (event) => {
        const pick = event.target.closest('[data-cm-face]');
        if (pick) {
          draft.portrait = pick.dataset.cmFace;
          layer.querySelectorAll('.cm-pick').forEach((el) => { el.classList.toggle('is-on', el === pick); el.setAttribute('aria-selected', String(el === pick)); });
          layer.querySelector('.cm-face')?.replaceWith(document.createRange().createContextualFragment(preview()));
          return;
        }
        const action = event.target.closest('[data-cm-action]')?.dataset.cmAction;
        if (action === 'close') finish(false);
        else if (action === 'faces') toFaces();
        else if (action === 'back') { step = 'form'; render(); }
        else if (action === 'done') done();
      });
      render();
      if (!saved) layer.querySelector('[data-cm-name]')?.focus();
    });
  }

  function ensureCampaignSelect() {
    let dialog = document.getElementById('campaign-select-dialog');
    if (dialog) return dialog;
    dialog = document.createElement('div');
    dialog.id = 'campaign-select-dialog';
    dialog.className = 'sim-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = `
      <div class="dialog-overlay" data-cs-close></div>
      <div class="dialog-box" style="max-width:820px">
        <div class="dialog-title-bar">
          <span>${escapeHtml(say(L('香城模擬器：玩轉18區', 'Heung Shing: The 18 Districts', '香城シミュレーター：18区をめぐる')))}</span>
          <button class="dialog-close-btn" type="button" data-cs-close>✕</button>
        </div>
        <div class="dialog-body campaign-plain" data-cs-body></div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-cs-close]')) { closeCampaignSelect(); return; }
      const pin = event.target.closest('[data-chapter]');
      if (pin) { runtime.selectedChapterId = pin.dataset.chapter; renderCampaignSelect(); return; }
      const action = event.target.closest('[data-cs-action]')?.dataset.csAction;
      if (action === 'start') startCampaignChapter(runtime.selectedChapterId);
      else if (action === 'prologue') { closeCampaignSelect(); playCampaignPrologue(); }
      else if (action === 'mayor') openCampaignMayorPanel().then(renderCampaignSelect);
    });
    return dialog;
  }

  async function openCampaignSelect() {
    // the 市長登記 before anything else (a player from before it too); an unread profile asks nothing
    if (!runtime.profile.mayor) {
      await loadCampaignProfile();
      if (runtime.loaded && !runtime.profile.mayor && !(await openCampaignMayorPanel({ first: true }))) return;
    }
    const dialog = ensureCampaignSelect();
    dialog.style.display = 'flex';
    renderCampaignSelect();
    await Promise.all([loadCampaignProfile(), checkCampaignStartFiles()]);
    renderCampaignSelect();
  }

  function closeCampaignSelect() {
    const dialog = document.getElementById('campaign-select-dialog');
    if (dialog) dialog.style.display = 'none';
  }

  // ── Export a chapter's start (development only) ───────────────────────────
  // From the DevTools console in the city you built for the chapter:  exportCampaignStart('ch01')
  // Writes UI/campaign/ch01.json through the local server; packaged builds refuse the request.
  async function exportCampaignStart(chapterId) {
    if (!CAMPAIGN_CHAPTERS_BY_ID[chapterId]) throw new Error(`unknown chapter ${chapterId}`);
    const run = city.campaign;
    city.campaign = null; // a start file starts clean
    let payload;
    try { payload = buildSavePayload({ autosave: false, manualSaveId: null }); } finally { city.campaign = run; }
    const response = await fetch(`/api/dev/campaign-start/${chapterId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: CAMPAIGN_START_FILE_FORMAT, chapterId, exportedAt: new Date().toISOString(),
        cityName: payload.city_name, save_data: payload.save_data,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    console.info(`[campaign] wrote ${result.path} (${result.bytes} bytes)`);
    return result;
  }

  // ── Styles and wiring ─────────────────────────────────────────────────────

  function ensureCampaignStyles() {
    if (document.getElementById('campaign-styles')) return;
    const style = document.createElement('style');
    style.id = 'campaign-styles';
    style.textContent = `
      #campaign-panel { position: fixed; right: 16px; top: 150px; width: 280px; max-height: calc(100vh - 430px); min-height: 60px; overflow-y: auto;
        z-index: 20; background: #e4eaf1; border: 1px solid #8794a3; border-radius: 6px; box-shadow: 0 6px 16px rgba(27,40,55,0.2);
        font: 12px/1.45 Arial, sans-serif; color: #1e2427; }
      #campaign-panel .cp-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px; background: #1e5cb3; color: #fff; font-weight: 700; position: sticky; top: 0; }
      #campaign-panel .cp-head span:first-child { flex: 1; }
      #campaign-panel .cp-head button { border: none; background: rgba(255,255,255,0.18); color: #fff; width: 22px; height: 20px; border-radius: 3px; cursor: pointer; font: inherit; }
      .cp-stars span { color: #a3acb5; } .cp-stars span.is-on { color: #f2b51d; }
      #campaign-panel .cp-head .cp-stars span { color: rgba(255,255,255,0.45); } #campaign-panel .cp-head .cp-stars span.is-on { color: #ffd34d; }
      #campaign-panel .cp-title { padding: 6px 10px 0; font-size: 13px; font-weight: 700; }
      #campaign-panel .cp-section { margin: 8px 10px 4px; font-weight: 700; color: #1e5cb3; }
      #campaign-panel .cp-status { margin: 4px 10px 0; color: #8e1b5b; font-weight: 700; }
      #campaign-panel .cp-tutorial { margin: 6px 8px 0; padding: 0 0 6px; background: #fff8e1; border: 1px solid #e0c46c; border-radius: 5px; }
      #campaign-panel .cp-tutor { display: flex; gap: 8px; padding: 0 8px; }
      #campaign-panel .cp-tutor .cd-portrait { flex: 0 0 36px; width: 36px; height: 36px; font-size: 20px; }
      #campaign-panel .cp-tutor-name { font-weight: 700; }
      #campaign-panel .cp-tutorial-actions { display: flex; gap: 6px; justify-content: flex-end; padding: 6px 8px 0; }
      #campaign-panel .cp-tutorial-actions button { font: inherit; padding: 2px 8px; border-radius: 3px; border: 1px solid #8794a3; background: #f4f7fa; cursor: pointer; }
      #campaign-panel .cp-tutorial-actions .cp-ack { background: #1e5cb3; color: #fff; border-color: #1e5cb3; }
      #campaign-panel .cp-tutorial-actions .cp-look { background: #fff; color: #8a2f12; border-color: #c2410c; }
      #campaign-panel .cp-objectives { list-style: none; margin: 0 8px; padding: 0; }
      #campaign-panel .cp-objectives li { display: grid; grid-template-columns: 16px 1fr; column-gap: 4px; padding: 3px 2px; border-bottom: 1px solid #cdd5de; }
      #campaign-panel .cp-objectives li.is-done { color: #3c7a3c; }
      #campaign-panel .cp-tick { font-weight: 700; }
      #campaign-panel .cp-progress { grid-column: 2; color: #5b6570; font-size: 11px; }
      #campaign-panel .cp-foot { padding: 8px 10px; }
      #campaign-panel .cp-foot button { font: inherit; padding: 2px 8px; border-radius: 3px; border: 1px solid #8794a3; background: #f4f7fa; cursor: pointer; }
      /* the touch UI (Norton 2026-11-20: 手機玩教學擋住主畫面): docked under the ticker, not over the
         middle of the map - the screen's width upright, a column on the left held sideways (the menus
         open on the right). The chapter's title goes, the guide's face shrinks, the objectives fold
         to one line, and the buttons grow to a finger's size. */
      #campaign-panel.is-touch { top: calc(var(--mobile-top, 44px) + var(--mobile-ticker, 24px) + env(safe-area-inset-top) + 6px);
        left: max(6px, env(safe-area-inset-left)); right: auto; width: min(360px, calc(100vw - 12px - env(safe-area-inset-left) - env(safe-area-inset-right)));
        max-height: min(46dvh, calc(100dvh - var(--mobile-top, 44px) - var(--mobile-ticker, 24px) - var(--mobile-nav, 52px) - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 20px));
        min-height: 0; overscroll-behavior: contain; font-size: 12.5px; line-height: 1.4; }
      #campaign-panel.is-touch .cp-head { min-height: 34px; padding: 2px 4px 2px 10px; }
      #campaign-panel.is-touch .cp-head button { width: 40px; height: 30px; font-size: 16px; }
      #campaign-panel.is-touch .cp-title { display: none; }
      #campaign-panel.is-touch .cp-section { margin: 6px 8px 2px; }
      #campaign-panel.is-touch .cp-tutorial .cp-section { margin-top: 4px; }
      #campaign-panel.is-touch .cp-tutor { gap: 6px; }
      #campaign-panel.is-touch .cp-tutor .cd-portrait { flex-basis: 30px; width: 30px; height: 30px; font-size: 17px; }
      #campaign-panel.is-touch .cp-tutorial-actions { padding-top: 4px; }
      #campaign-panel.is-touch .cp-tutorial-actions button, #campaign-panel.is-touch .cp-foot button { min-height: 32px; padding: 2px 12px; }
      #campaign-panel.is-touch .cp-status { margin: 4px 8px 0; font-size: 11.5px; }
      #campaign-panel.is-touch .cp-fold { display: flex; gap: 6px; align-items: center; width: calc(100% - 12px); margin: 4px 6px 6px; min-height: 34px;
        padding: 2px 8px; border: 1px solid #b7c3d0; border-radius: 4px; background: #f4f7fa; font: inherit; font-weight: 700; color: #1e5cb3; text-align: left; cursor: pointer; }
      #campaign-panel.is-touch .cp-fold span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #campaign-panel.is-touch .cp-count { flex: none; color: #5b6570; font-weight: 400; }
      #campaign-panel.is-touch .cp-foot { padding: 6px 8px; }
      body:has(#mobile-ui.ticker-hidden) #campaign-panel.is-touch { --mobile-ticker: 0px; }
      @media (orientation: portrait) and (max-width: 560px) {
        #campaign-panel.is-touch { width: auto; right: max(6px, env(safe-area-inset-right)); }
      }
      /* held sideways the column is clear of the menu handle (bottom centre): it may run down the side */
      @media (orientation: landscape) {
        #campaign-panel.is-touch { max-height: calc(100dvh - var(--mobile-top, 44px) - var(--mobile-ticker, 24px) - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 16px); }
      }
      .campaign-tutorial-highlight { outline: 3px solid #f2b51d !important; outline-offset: 1px; animation: campaign-pulse 1.2s ease-in-out infinite; }
      @keyframes campaign-pulse { 0%, 100% { outline-color: #f2b51d; } 50% { outline-color: rgba(242,181,29,0.25); } }
      /* the dialogue (Norton 2026-11-20: 參考大航海時代4): a wide band along the bottom on parchment, in the
         chapter boards' maroon and gold, a big framed portrait on the left, the name on a plate, big text */
      #campaign-dialogue { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(1080px, calc(100vw - 28px));
        min-height: 236px; z-index: 250; box-sizing: border-box; display: flex; gap: 22px; align-items: center; padding: 16px 24px 14px 16px;
        cursor: pointer; color: #3b2414; background: linear-gradient(180deg, #fcf5e1 0%, #f2e4bf 100%);
        border: 3px solid #c9a227; border-radius: 6px;
        box-shadow: 0 0 0 5px #6e1a1a, 0 0 0 7px #c9a227, 0 18px 42px rgba(0,0,0,0.55), inset 0 0 28px rgba(140,96,36,0.22);
        font: 21px/1.6 "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif; }
      #campaign-dialogue::before { content: ''; position: absolute; inset: 6px; border: 1px solid rgba(160,118,30,0.5); border-radius: 3px; pointer-events: none; }
      #campaign-dialogue.is-card { flex-direction: column; justify-content: center; text-align: center; gap: 10px;
        background: linear-gradient(180deg, #7a1f1f 0%, #4f1111 100%); color: #fbf3dc; }
      #campaign-dialogue.is-card::before { border-color: rgba(246,215,122,0.55); }
      #campaign-dialogue .cd-card { font-size: 30px; font-weight: 700; color: #f6d77a; letter-spacing: 2px; }
      #campaign-dialogue .cd-hint { font-size: 18px; max-width: 860px; }
      .cd-portrait { flex: 0 0 64px; width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: #dfe6ee; border: 2px solid #8794a3; }
      .cd-glyph { display: grid; place-items: center; font-size: 34px; }
      #campaign-dialogue .cd-portrait { flex: 0 0 208px; width: 208px; height: 208px; border-radius: 4px; object-fit: cover; background: #4a2a18;
        border: 3px solid #c9a227; box-shadow: 0 0 0 3px #6e1a1a, 0 6px 14px rgba(0,0,0,0.35); }
      #campaign-dialogue .cd-glyph { font-size: 104px; }
      #campaign-dialogue .cd-body { flex: 1; min-width: 0; align-self: stretch; display: flex; flex-direction: column; }
      #campaign-dialogue .cd-name { align-self: flex-start; font-weight: 700; font-size: 19px; letter-spacing: 1px; color: #f6d77a;
        background: linear-gradient(180deg, #7a1f1f, #561313); border: 2px solid #c9a227; border-radius: 3px; padding: 1px 16px; margin-bottom: 8px; }
      #campaign-dialogue .cd-text { flex: 1; font-size: 22px; }
      #campaign-dialogue .cd-next { text-align: right; font-size: 14px; color: #7a1f1f; opacity: 0.85; animation: campaign-next 1.1s ease-in-out infinite; }
      #campaign-dialogue.is-card .cd-next { color: #f6d77a; }
      @keyframes campaign-next { 0%, 100% { opacity: 0.85; } 50% { opacity: 0.35; } }
      #campaign-dialogue .cd-choices { display: grid; gap: 8px; margin-top: 10px; }
      #campaign-dialogue .cd-choices button { font: 18px/1.4 inherit; font-family: inherit; text-align: left; padding: 8px 14px; border: 2px solid #c9a227; border-radius: 4px;
        background: #fffaf0; color: #3b2414; cursor: pointer; }
      #campaign-dialogue .cd-choices button:hover { background: #f6e3b0; }
      /* Her Majesty speaks on royal paper */
      #campaign-dialogue.is-royal { box-shadow: 0 0 0 5px #5b1240, 0 0 0 7px #c9a227, 0 18px 42px rgba(0,0,0,0.55), inset 0 0 28px rgba(140,96,36,0.22); }
      #campaign-dialogue.is-royal .cd-name { background: linear-gradient(180deg, #8e1b5b, #5b1240); }
      #campaign-dialogue.is-revealing { animation: campaign-rise 0.35s ease-out; }
      /* hidden means hidden, whatever a layout rule says (showDialogueBox) */
      #campaign-dialogue[hidden] { display: none !important; }
      @keyframes campaign-rise { from { opacity: 0; transform: translate(-50%, 24px); } to { opacity: 1; transform: translate(-50%, 0); } }
      /* phones, and any short screen (a phone held sideways) */
      @media (max-width: 700px), (max-height: 520px) {
        #campaign-dialogue { min-height: 0; gap: 12px; padding: 12px 14px 10px 12px; bottom: 12px; font-size: 16px; }
        #campaign-dialogue .cd-portrait { flex-basis: 96px; width: 96px; height: 96px; }
        #campaign-dialogue .cd-glyph { font-size: 46px; }
        #campaign-dialogue .cd-text { font-size: 16px; }
        #campaign-dialogue .cd-name { font-size: 15px; }
        #campaign-dialogue .cd-card { font-size: 22px; }
        #campaign-dialogue .cd-hint { font-size: 15px; }
      }
      /* the touch UI's bars (mobile-ui.css, z-index 1100) stay under a dialogue and a cut-scene: the clock
         is stopped while one is open */
      [data-ui-profile="touch"] #campaign-backdrop { z-index: 2000; }
      [data-ui-profile="touch"] #campaign-mayor { z-index: 2020; }
      [data-ui-profile="touch"] #campaign-dialogue, [data-ui-profile="touch"] #campaign-dialogue.is-scene { z-index: 2010; bottom: calc(12px + env(safe-area-inset-bottom)); }
      /* a phone held upright: the portrait and the name plate on one row, the words the full width below
         (the board still fills the screen: Norton 2026-11-20, 我比較鍾意放大左既轉場圖) */
      @media (max-width: 560px) and (orientation: portrait) {
        /* (!important: the box is shown by an inline display: flex - and never while [hidden]) */
        #campaign-dialogue:not(.is-card):not([hidden]) { display: grid !important; grid-template-columns: 76px 1fr; column-gap: 12px; row-gap: 6px; align-items: center; }
        #campaign-dialogue:not(.is-card) .cd-body { display: contents; }
        #campaign-dialogue .cd-portrait { grid-column: 1; grid-row: 1; width: 76px; height: 76px; }
        #campaign-dialogue .cd-glyph { font-size: 38px; }
        #campaign-dialogue .cd-name { grid-column: 2; grid-row: 1; margin-bottom: 0; justify-self: start; }
        #campaign-dialogue .cd-text, #campaign-dialogue .cd-next, #campaign-dialogue .cd-choices { grid-column: 1 / -1; }
        #campaign-dialogue .cd-text { font-size: 17px; }
      }
      /* a cut-scene: the screen dimmed behind the box (room for a picture), over the title screen too */
      #campaign-backdrop { position: fixed; inset: 0; z-index: 510; display: none; cursor: pointer;
        background: rgba(8,12,18,0.78) center / cover no-repeat; }
      #campaign-dialogue.is-scene { z-index: 520; }
      .campaign-plain.dialog-body { white-space: normal; font-family: Arial, sans-serif; line-height: 1.55; }
      /* over the title screen (z-index 400), as the save list is */
      #campaign-select-dialog, #campaign-failure-dialog { z-index: 500; }
      #campaign-select-dialog .cs-summary { margin-bottom: 8px; color: #3a4148; }
      /* the map no taller than the screen allows, so the chapter's details and 開始 stay in view */
      #campaign-select-dialog .cs-map { position: relative; width: fit-content; margin: 0 auto; }
      #campaign-select-dialog .cs-map img { display: block; max-width: 100%; max-height: 58vh; width: auto; border-radius: 4px; }
      #campaign-select-dialog .cs-pin { position: absolute; transform: translate(-50%, -50%); width: 28px; height: 28px; border-radius: 50%;
        border: 2px solid #fff; font: 700 11px Arial, sans-serif; color: #fff; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.45); padding: 0; }
      #campaign-select-dialog .cs-pin.is-open { background: #1e5cb3; }
      #campaign-select-dialog .cs-pin.is-cleared { background: #c9a227; }
      #campaign-select-dialog .cs-pin.is-soon, #campaign-select-dialog .cs-pin.is-preparing { background: #6f7f90; }
      #campaign-select-dialog .cs-pin.is-locked { background: #3d444b; opacity: 0.8; }
      #campaign-select-dialog .cs-pin.is-selected { outline: 3px solid #f2b51d; outline-offset: 1px; z-index: 2; }
      #campaign-select-dialog .cs-grid { display: none; }
      /* a phone (Norton 2026-11-21: 手機版啲數字堆埋一齊): 18 pins of 28px pile up on a map some 330px
         wide - Kowloon and the island are a heap. The map stays as an overview of small dots, the chosen
         chapter's large with its number, and the chapters are a grid of buttons under it. */
      @media (max-width: 640px), (max-height: 520px) {
        #campaign-select-dialog .cs-map img { max-height: 42vh; }
        #campaign-select-dialog .cs-pin { width: 12px; height: 12px; border-width: 1px; font-size: 0; pointer-events: none; box-shadow: 0 1px 3px rgba(0,0,0,0.45); }
        #campaign-select-dialog .cs-pin.is-selected { width: 26px; height: 26px; border-width: 2px; font-size: 10px; }
        #campaign-select-dialog .cs-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5px; margin-top: 8px; }
        #campaign-select-dialog .cs-chip { min-height: 44px; padding: 2px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
          border: 2px solid #fff; border-radius: 6px; color: #fff; font: 700 14px/1.1 Arial, sans-serif; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.35); }
        #campaign-select-dialog .cs-chip span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 10px/1.2 "PingFang TC", "Noto Sans TC", Arial, sans-serif; }
        #campaign-select-dialog .cs-chip.is-open { background: #1e5cb3; }
        #campaign-select-dialog .cs-chip.is-cleared { background: #c9a227; }
        #campaign-select-dialog .cs-chip.is-soon, #campaign-select-dialog .cs-chip.is-preparing { background: #6f7f90; }
        #campaign-select-dialog .cs-chip.is-locked { background: #3d444b; opacity: 0.8; }
        #campaign-select-dialog .cs-chip.is-selected { outline: 3px solid #f2b51d; outline-offset: 1px; }
      }
      #campaign-select-dialog .cs-detail { margin-top: 10px; }
      #campaign-select-dialog .cs-detail-title { font-size: 15px; font-weight: 700; }
      #campaign-select-dialog .cs-detail-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
      #campaign-select-dialog .cs-detail-actions button[disabled] { opacity: 0.45; cursor: default; }
      #campaign-select-dialog .cs-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
      #campaign-select-dialog .cs-top .cs-summary { margin: 0; }
      #campaign-select-dialog .cs-mayor { display: flex; align-items: center; gap: 8px; padding: 3px 10px 3px 3px; border: 2px solid #c9a227; border-radius: 4px;
        background: linear-gradient(180deg, #fcf5e1, #f2e4bf); color: #3b2414; font: inherit; text-align: left; cursor: pointer; }
      #campaign-select-dialog .cs-mayor img { width: 40px; height: 40px; object-fit: cover; border-radius: 3px; border: 1px solid #6e1a1a; background: #4a2a18; }
      #campaign-select-dialog .cs-mayor strong, #campaign-select-dialog .cs-mayor small { display: block; }
      #campaign-select-dialog .cs-mayor small { color: #7a1f1f; font-size: 11px; }
      /* 市長登記: the dialogue's parchment, maroon and gold (大航海時代4) - over the title screen and the
         chapter map; a phone stacks it and scrolls inside it */
      #campaign-mayor { position: fixed; inset: 0; z-index: 600; display: grid; place-items: center; padding: 12px;
        background: rgba(8,12,18,0.72); font: 16px/1.5 "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif; color: #3b2414; }
      #campaign-mayor .cm-sheet { position: relative; box-sizing: border-box; width: min(820px, 100%); max-height: calc(100dvh - 24px); overflow-y: auto;
        padding: 18px 24px 16px; background: linear-gradient(180deg, #fcf5e1 0%, #f2e4bf 100%); border: 3px solid #c9a227; border-radius: 6px;
        box-shadow: 0 0 0 5px #6e1a1a, 0 0 0 7px #c9a227, 0 18px 42px rgba(0,0,0,0.6), inset 0 0 28px rgba(140,96,36,0.22); }
      /* the sheet is a column: on a short screen only the faces scroll - the title, the chosen face and
         the buttons stay in view (an iPhone SE had 返回 / 就係佢！ below the fold) */
      #campaign-mayor .cm-sheet { display: flex; flex-direction: column; }
      #campaign-mayor .cm-sheet > * { flex: none; }
      #campaign-mayor .cm-body.is-faces { flex: 1 1 auto; min-height: 0; align-items: stretch; }
      #campaign-mayor .cm-body.is-faces .cm-face { align-self: flex-start; }
      #campaign-mayor .cm-title { display: table; margin: 0 auto 6px; padding: 2px 26px; font-size: 22px; font-weight: 700; letter-spacing: 3px; color: #f6d77a;
        background: linear-gradient(180deg, #7a1f1f, #561313); border: 2px solid #c9a227; border-radius: 3px; text-align: center; }
      #campaign-mayor .cm-lede { text-align: center; color: #6e1a1a; margin-bottom: 12px; }
      #campaign-mayor .cm-body { display: flex; gap: 24px; align-items: flex-start; }
      #campaign-mayor .cm-face { flex: 0 0 196px; text-align: center; }
      #campaign-mayor .cm-frame { width: 196px; height: 196px; box-sizing: border-box; border: 3px solid #c9a227; border-radius: 4px; background: #4a2a18;
        box-shadow: 0 0 0 3px #6e1a1a, 0 6px 14px rgba(0,0,0,0.35); overflow: hidden; }
      #campaign-mayor .cm-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
      #campaign-mayor .cm-plate { display: inline-block; max-width: 100%; margin-top: 12px; padding: 1px 14px; font-weight: 700; color: #f6d77a; overflow-wrap: anywhere;
        background: linear-gradient(180deg, #8e1b5b, #5b1240); border: 2px solid #c9a227; border-radius: 3px; }
      #campaign-mayor .cm-face-caption { margin-top: 4px; font-size: 13px; color: #7a5a3a; }
      #campaign-mayor .cm-form { flex: 1; min-width: 0; display: grid; gap: 14px; }
      #campaign-mayor .cm-field { display: grid; gap: 4px; }
      #campaign-mayor .cm-field > span { font-weight: 700; color: #7a1f1f; letter-spacing: 1px; }
      #campaign-mayor input, #campaign-mayor select { box-sizing: border-box; min-height: 44px; padding: 6px 10px; font: inherit; font-size: 18px; color: #3b2414;
        background: #fffaf0; border: 2px solid #c9a227; border-radius: 4px; }
      #campaign-mayor input:focus, #campaign-mayor select:focus { outline: 3px solid rgba(142,27,91,0.45); outline-offset: 1px; }
      #campaign-mayor .cm-date { display: flex; gap: 8px; }
      #campaign-mayor .cm-date select { flex: 1; }
      #campaign-mayor .cm-note { margin: 0; font-size: 14px; color: #6b4a2a; }
      #campaign-mayor .cm-error { margin: 0; color: #b3261e; font-weight: 700; }
      #campaign-mayor .cm-grid { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); grid-auto-rows: max-content; align-content: start; gap: 8px;
        max-height: min(62vh, 560px); overflow-y: auto; padding: 4px; overscroll-behavior: contain; }
      /* the picture gives the tile its height (square), so a short grid scrolls instead of squashing
         its rows (aspect-ratio on the button let them shrink) */
      #campaign-mayor .cm-pick { padding: 0; border: 2px solid #b89a5a; border-radius: 4px; background: #4a2a18; cursor: pointer; overflow: hidden; align-self: start; }
      #campaign-mayor .cm-pick img { width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; display: block; }
      #campaign-mayor .cm-pick.is-on { border-color: #f6d77a; box-shadow: 0 0 0 3px #8e1b5b, 0 0 10px rgba(246,215,122,0.8); }
      #campaign-mayor .cm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
      #campaign-mayor .cm-btn { min-height: 44px; padding: 6px 18px; font: inherit; font-weight: 700; color: #3b2414; background: #fffaf0;
        border: 2px solid #c9a227; border-radius: 4px; cursor: pointer; }
      #campaign-mayor .cm-btn.is-primary { color: #f6d77a; background: linear-gradient(180deg, #7a1f1f, #561313); }
      @media (max-width: 640px), (max-height: 520px) {
        #campaign-mayor { padding: 8px; font-size: 15px; }
        #campaign-mayor .cm-sheet { padding: 14px 14px 12px; max-height: calc(100dvh - 16px); }
        #campaign-mayor .cm-title { font-size: 18px; letter-spacing: 2px; padding: 2px 16px; }
        #campaign-mayor .cm-face { flex-basis: 112px; }
        #campaign-mayor .cm-frame { width: 112px; height: 112px; }
        #campaign-mayor .cm-plate { margin-top: 8px; padding: 1px 8px; font-size: 14px; }
        #campaign-mayor .cm-face-caption { font-size: 12px; }
        #campaign-mayor .cm-body { gap: 14px; }
        #campaign-mayor .cm-grid { grid-template-columns: repeat(auto-fill, minmax(58px, 1fr)); gap: 6px; max-height: none; }
        #campaign-mayor input, #campaign-mayor select { font-size: 16px; }
      }
      /* a phone held upright: the face above the form, the faces below the chosen one */
      @media (max-width: 560px) and (orientation: portrait) {
        #campaign-mayor .cm-body { flex-direction: column; align-items: stretch; }
        #campaign-mayor .cm-face { display: grid; grid-template-columns: 96px 1fr; column-gap: 12px; align-items: center; text-align: left; flex-basis: auto; }
        #campaign-mayor .cm-frame { width: 96px; height: 96px; grid-row: span 2; }
        #campaign-mayor .cm-plate { justify-self: start; margin-top: 0; }
        #campaign-mayor .cm-body.is-faces .cm-face { align-self: stretch; }
        #campaign-mayor .cm-body.is-faces .cm-grid { flex: 1 1 auto; min-height: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  if (typeof document !== 'undefined') {
    ensureCampaignStyles();
    const wire = () => document.getElementById('btn-campaign')?.addEventListener('click', openCampaignSelect);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
    setInterval(() => { if (!runtime.dialogueOpen) renderCampaignPanel(); }, CAMPAIGN_PANEL_REFRESH_MS);
    document.addEventListener('languagechange', () => { renderCampaignPanel(); renderCampaignSelect(); });
    document.addEventListener('uiprofilechange', () => renderCampaignPanel());
  }
  if (typeof onGameClockEvent === 'function') onGameClockEvent('gameclock:month', onCampaignMonthTurned);
  loadCampaignProfile();

  Object.assign(globalThis, {
    startCampaignChapter, openCampaignSelect, closeCampaignSelect, onCampaignCityLoaded, exportCampaignStart,
    buildCampaignSnapshot, renderCampaignPanel, playCampaignDialogue, playCampaignPrologue, getCampaignPrologueScene,
    getCampaignProfile: () => runtime.profile, openCampaignMayorPanel,
  });
})();
