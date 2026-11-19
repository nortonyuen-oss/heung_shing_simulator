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
    const facts = { airportRoutes: 0, airportPassengers: 0, airportDailyFlights: 0, airportCurfew: false, airportNoiseResidents: 0 };
    try {
      if (typeof getAirportState === 'function') {
        const state = getAirportState();
        facts.airportRoutes = state.routesFlying;
        facts.airportPassengers = state.passengers;
        facts.airportDailyFlights = state.dailyFlights;
        facts.airportCurfew = !!state.curfew;
        facts.airportNoiseResidents = state.noiseResidents;
      }
    } catch { /* no airport */ }
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
      welfareCoverage: 0, welfareBills: 0, dangerousBuildings: 0, buildingSafetyIndex: 100, buildingRepairs: 0,
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

  function ensureDialogueBox() {
    let box = document.getElementById('campaign-dialogue');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'campaign-dialogue';
    box.setAttribute('role', 'dialog');
    box.style.display = 'none';
    document.body.appendChild(box);
    return box;
  }

  function renderSpeaker(id) {
    const speaker = CAMPAIGN_SPEAKERS[id] || {};
    const face = speaker.portrait
      ? `<img class="cd-portrait" src="${escapeHtml(speaker.portrait)}" alt="">`
      : `<div class="cd-portrait cd-glyph" aria-hidden="true">${escapeHtml(speaker.glyph || '💬')}</div>`;
    return { face, name: say(speaker.name) };
  }

  // A cut-scene's backdrop: the screen dimmed behind the box (over the title screen too), with a
  // picture when one is given. A click on it moves the scene on like a click on the box.
  function showDialogueBackdrop(image, onClick) {
    let layer = document.getElementById('campaign-backdrop');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'campaign-backdrop';
      document.body.appendChild(layer);
    }
    layer.style.backgroundImage = typeof image === 'string' && image
      ? `linear-gradient(rgba(8,12,18,0.15), rgba(8,12,18,0.15)), url("${encodeURI(image)}")` : '';
    layer.onclick = onClick;
    layer.style.display = 'block';
    return layer;
  }

  // Plays lines one at a time (a click moves on); the clock stops while it is open. A line with
  // `choices` waits for one of its buttons, and the chosen option's `lines` play next.
  // options.backdrop (true, or a picture's path) plays the lines as a cut-scene; with options.reveal the
  // picture shows alone for CAMPAIGN_SCENE_REVEAL_MS (or until a click) before the first line.
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
        box.style.display = 'flex';
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
        box.style.display = 'none';
        if (backdrop) { backdrop.style.display = 'none'; backdrop.onclick = null; }
        runtime.dialogueOpen = false;
        if (previousSpeed !== null && typeof setGameSpeed === 'function') setGameSpeed(previousSpeed);
        resolve();
      };
      if (options.backdrop) backdrop = showDialogueBackdrop(options.backdrop, next);
      box.addEventListener('click', next);
      show();
      if (revealed) box.style.display = 'flex';
      else { box.style.display = 'none'; revealTimer = setTimeout(reveal, CAMPAIGN_SCENE_REVEAL_MS); }
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
    playCampaignDialogue(getCampaignPrologueScene(), { backdrop: CAMPAIGN_PROLOGUE.backdrop || true });
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
    setTutorialHighlight(step && !runtime.collapsed ? step.highlight : []);

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
          <div class="cp-tutor">${face}<div><div class="cp-tutor-name">${escapeHtml(name)}</div><div>${escapeHtml(say(step.text))}</div></div></div>
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
      objectives = `
        <div class="cp-section">${'★'.repeat(run.stars + 1)} ${escapeHtml(say(star.title))}</div>
        <ul class="cp-objectives">${result.items.map((item) => `
          <li class="${item.done ? 'is-done' : ''}"><span class="cp-tick">${item.done ? '✓' : '○'}</span>
            <span class="cp-label">${escapeHtml(say(item.label))}</span>
            ${item.progress ? `<span class="cp-progress">${escapeHtml(item.progress)}</span>` : ''}</li>`).join('')}
        </ul>`;
    }
    panel.innerHTML = `${head}
      <div class="cp-title">《${escapeHtml(say(chapter.title))}》</div>
      ${tutorial}
      <div class="cp-status">${escapeHtml(status)}</div>
      ${objectives}
      <div class="cp-foot"><button type="button" data-campaign-action="chapters">🗺 ${escapeHtml(say(L('章節地圖', 'Chapter map', '章マップ')))}</button></div>`;
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
    if (recordCampaignStars(runtime.profile, run, campaignStamp())) scheduleCampaignProfileSave();
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
    dialog.querySelector('[data-cs-body]').innerHTML = `
      <div class="cs-summary">${escapeHtml(say(L(`主線 ${cleared}／18 區・星數 ${total}／54`, `Main story ${cleared}/18 districts · ${total}/54 stars`, `メイン ${cleared}／18区・星 ${total}／54`)))}</div>
      <div class="cs-map"><img src="UI/hk-district-overview.webp" alt="">${pins}</div>
      <div class="cs-detail">
        <div class="cs-detail-title">${escapeHtml(say(L(`第 ${String(chapter.number).padStart(2, '0')} 章・`, `Chapter ${chapter.number} · `, `第${chapter.number}章・`)))}${escapeHtml(say(chapter.district))}《${escapeHtml(say(chapter.title))}》</div>
        <div class="cs-detail-meta"><span class="cp-stars">${renderStars(state.stars)}</span> ${escapeHtml(say(stateText))}</div>
        <div class="cs-detail-actions">
          ${chapter.number === 1 && runtime.profile.prologueSeen ? `<button type="button" class="dialog-cancel-btn" data-cs-action="prologue">${escapeHtml(say(L('重看序幕', 'Replay the prologue', 'プロローグを再生')))}</button>` : ''}
          <button type="button" class="dialog-ok-btn" data-cs-action="start" ${state.key === 'open' || state.key === 'cleared' ? '' : 'disabled'}>${escapeHtml(say(L('開始', 'Start', '開始')))}</button>
        </div>
      </div>`;
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
    });
    return dialog;
  }

  async function openCampaignSelect() {
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
      [data-ui-profile="touch"] #campaign-dialogue, [data-ui-profile="touch"] #campaign-dialogue.is-scene { z-index: 2010; bottom: calc(12px + env(safe-area-inset-bottom)); }
      /* a phone held upright: the portrait and the name plate on one row, the words the full width below
         (the board still fills the screen: Norton 2026-11-20, 我比較鍾意放大左既轉場圖) */
      @media (max-width: 560px) and (orientation: portrait) {
        /* (!important: the box is shown by an inline display: flex) */
        #campaign-dialogue:not(.is-card) { display: grid !important; grid-template-columns: 76px 1fr; column-gap: 12px; row-gap: 6px; align-items: center; }
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
      #campaign-select-dialog .cs-pin.is-selected { outline: 3px solid #f2b51d; outline-offset: 1px; }
      #campaign-select-dialog .cs-detail { margin-top: 10px; }
      #campaign-select-dialog .cs-detail-title { font-size: 15px; font-weight: 700; }
      #campaign-select-dialog .cs-detail-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
      #campaign-select-dialog .cs-detail-actions button[disabled] { opacity: 0.45; cursor: default; }
    `;
    document.head.appendChild(style);
  }

  if (typeof document !== 'undefined') {
    ensureCampaignStyles();
    const wire = () => document.getElementById('btn-campaign')?.addEventListener('click', openCampaignSelect);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
    setInterval(() => { if (!runtime.dialogueOpen) renderCampaignPanel(); }, CAMPAIGN_PANEL_REFRESH_MS);
    document.addEventListener('languagechange', () => { renderCampaignPanel(); renderCampaignSelect(); });
  }
  if (typeof onGameClockEvent === 'function') onGameClockEvent('gameclock:month', onCampaignMonthTurned);
  loadCampaignProfile();

  Object.assign(globalThis, {
    startCampaignChapter, openCampaignSelect, closeCampaignSelect, onCampaignCityLoaded, exportCampaignStart,
    buildCampaignSnapshot, renderCampaignPanel, playCampaignDialogue, playCampaignPrologue, getCampaignPrologueScene,
    getCampaignProfile: () => runtime.profile,
  });
})();
