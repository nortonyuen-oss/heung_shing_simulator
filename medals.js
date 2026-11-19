// 香城洋紫荊勳章 runtime (Norton 2026-11-17): the player's medal cabinet.
//
// The cabinet belongs to the player, not to a city (Norton: 跟玩家・跨存檔): one profile, kept
// apart from the saves - Electron's SQLite (GET/PUT /api/player-profile/medals, server.js), the web
// build's IndexedDB settings store (game-storage.js). Each medal remembers which city earned it.
//
// The rules live in medal-definitions.js. This file builds their snapshot from the live city,
// records the moments a snapshot cannot see afterwards (an event held, a forum story run - the
// hooks call noteMedal*), judges at every month's turn and after a city loads, and draws the
// cabinet. The attract-mode showcase never earns anything.
(function () {
  'use strict';

  const MEDAL_PROFILE_API = '/api/player-profile/medals';
  const MEDAL_DIALOG_ID = 'medal-cabinet-dialog';
  const MEDAL_SAVE_DELAY_MS = 800;
  const MEDAL_ABSURD_LOG_LIMIT = 60;

  const medalRuntime = {
    profile: createEmptyMedalProfile(),
    loaded: false,
    loading: null,
    saveTimer: null,
    pendingEvaluation: false,
  };

  function medalLanguage() {
    return typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'zhHant';
  }
  const L = (zhHant, en, ja) => ({ zhHant, en, ja });
  const say = (text) => getMedalText(text, medalLanguage());

  function storageRequest(url, options) {
    return globalThis.HeungShingStorage
      ? globalThis.HeungShingStorage.request(url, options) : fetch(url, options);
  }

  function isMedalTrackingPaused() {
    if (typeof city === 'undefined' || !city) return true;
    if (typeof isAttractModeActive === 'function' && isAttractModeActive()) return true;
    if (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) return true;
    return false;
  }

  function medalStamp() {
    return {
      at: new Date().toISOString(),
      city: String(city?.name || ''),
      year: Math.floor(Number(city?.year) || 0),
      month: Math.floor(Number(city?.month) || 0),
    };
  }

  // ── Profile storage ────────────────────────────────────────────────────────

  function loadMedalProfile() {
    if (medalRuntime.loaded) return Promise.resolve(medalRuntime.profile);
    if (medalRuntime.loading) return medalRuntime.loading;
    medalRuntime.loading = (async () => {
      try {
        const response = await storageRequest(MEDAL_PROFILE_API);
        if (!response?.ok) throw new Error(`HTTP ${response?.status}`);
        const body = await response.json();
        // anything noted before the load finished is merged over the stored profile
        const stored = normalizeMedalProfile(body?.data);
        const notedBeforeLoad = Object.keys(medalRuntime.profile.facts).length > 0;
        mergeMedalProfile(stored, medalRuntime.profile);
        medalRuntime.profile = stored;
        medalRuntime.loaded = true;
        if (notedBeforeLoad) scheduleMedalProfileSave();
      } catch (error) {
        // Not loaded means nothing is judged or written: a save now would overwrite the stored
        // cabinet with this session's near-empty one. The next month's turn tries again.
        console.warn('[medals] profile load failed; will retry at the next month', error);
      }
      medalRuntime.loading = null;
      updateMedalKpi();
      if (medalRuntime.loaded && medalRuntime.pendingEvaluation) runMedalEvaluation();
      return medalRuntime.profile;
    })();
    return medalRuntime.loading;
  }

  function mergeMedalProfile(target, source) {
    ['earned', 'facts'].forEach((field) => {
      Object.entries(source[field] || {}).forEach(([key, stamp]) => { if (!target[field][key]) target[field][key] = stamp; });
    });
    Object.entries(source.parts || {}).forEach(([id, parts]) => {
      Object.entries(parts).forEach(([partId, stamp]) => {
        if (!target.parts[id]?.[partId]) (target.parts[id] ||= {})[partId] = stamp;
      });
    });
  }

  function scheduleMedalProfileSave() {
    if (!medalRuntime.loaded) return;
    clearTimeout(medalRuntime.saveTimer);
    medalRuntime.saveTimer = setTimeout(async () => {
      try {
        await storageRequest(MEDAL_PROFILE_API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: medalRuntime.profile }),
        });
      } catch (error) {
        console.warn('[medals] profile save failed', error);
      }
    }, MEDAL_SAVE_DELAY_MS);
  }

  // ── Moments the snapshot cannot see later ─────────────────────────────────

  function noteMedalFact(key) {
    if (isMedalTrackingPaused() || medalRuntime.profile.facts[key]) return;
    medalRuntime.profile.facts[key] = medalStamp();
    scheduleMedalProfileSave();
  }

  // B12: the city's absurd events, by game year (kept with the city - a year belongs to one city)
  function noteMedalAbsurdEvent(id) {
    if (isMedalTrackingPaused()) return;
    if (!city.medalLog || typeof city.medalLog !== 'object') city.medalLog = { absurd: [] };
    if (!Array.isArray(city.medalLog.absurd)) city.medalLog.absurd = [];
    const year = Math.floor(Number(city.year) || 0);
    if (city.medalLog.absurd.some((entry) => entry.id === id && entry.year === year)) return;
    city.medalLog.absurd.push({ id: String(id).slice(0, 60), year });
    city.medalLog.absurd = city.medalLog.absurd.slice(-MEDAL_ABSURD_LOG_LIMIT);
  }

  // council-voting.js (one-off resolutions) and council-effects.js (each 幻彩Fing show)
  function noteMedalResolutionOutcome(resolutionId, outcome) {
    if (isMedalTrackingPaused() || !resolutionId) return;
    const definition = typeof getCouncilResolutionDefinition === 'function' ? getCouncilResolutionDefinition(resolutionId) : null;
    const major = MEDAL_MAJOR_EVENT_IDS.includes(resolutionId);
    if (outcome !== 'typhoon_cancelled' && outcome !== 'scheduled') {
      noteMedalFact(`held:${resolutionId}`);
      if (major && city.weather?.typhoonActive) noteMedalFact('typhoonEvent');
    }
    if (major && isMedalFailedOutcome(outcome)) {
      noteMedalFact(`failed:${resolutionId}`);
      noteMedalFact('majorEventFailed');
    }
    if (isMedalAbsurdResolution(definition, outcome)) noteMedalAbsurdEvent(`resolution:${resolutionId}`);
  }

  // council-voting.js, as an act passes
  function noteMedalPolicyEnacted(policyId) {
    if (!MEDAL_ABSURD_POLICY_IDS.includes(policyId)) return;
    noteMedalFact(`policy:${policyId}`);
    noteMedalAbsurdEvent(`policy:${policyId}`);
  }

  // newspaper.js, once a forum story has actually run
  function noteMedalForumStory(storyId) {
    if (!MEDAL_ABSURD_FORUM_IDS.includes(storyId)) return;
    noteMedalFact(`forum:${storyId}`);
    noteMedalAbsurdEvent(`forum:${storyId}`);
  }

  // transport-expansion.js settleTransportMonth: each mode's riders for the month just closed
  function noteMedalTransitMonth(modes) {
    Object.entries(modes || {}).forEach(([mode, passengers]) => {
      if (Number(passengers) > 0) noteMedalFact(`transit:${mode}`);
    });
  }

  // ── Snapshot of the city being played ─────────────────────────────────────

  function collectMedalSnapshot() {
    const buildings = {};
    let highDensityResidents = 0;
    let scienceParkJobs = 0;
    let gradeAOffices = 0;
    const records = typeof buildingData !== 'undefined' && buildingData ? Object.values(buildingData) : [];
    const districtDensity = 1 + (typeof getDistrictProfileEffect === 'function' ? getDistrictProfileEffect('density') : 0);
    records.forEach((record) => {
      if (!record?.type) return;
      buildings[record.type] = (buildings[record.type] || 0) + 1;
      if (record.type === 'residential' && typeof DENSITY_HIGH !== 'undefined' && record.density === DENSITY_HIGH) {
        const level = typeof POP_PER_LEVEL !== 'undefined' ? POP_PER_LEVEL[record.level] : 0;
        highDensityResidents += Number(record.population ?? level ?? 0) || 0;
      }
      if (record.type === 'commercial' && (record.commercialTier === 'H' || record.commercialTier === 'UH')) gradeAOffices++;
      if (record.type === 'industrial' && typeof isScienceParkIndustrialRecord === 'function' && isScienceParkIndustrialRecord(record)) {
        buildings.science_park = (buildings.science_park || 0) + 1;
        if (typeof getBuildingJobCapacity === 'function') scienceParkJobs += getBuildingJobCapacity(record);
      }
    });
    if (typeof getTyphoonShelterFloatingRestaurants === 'function') {
      const floating = getTyphoonShelterFloatingRestaurants().length;
      if (floating) buildings.floating_restaurant = floating;
    }

    const policies = { ...(city.activePolicies || {}) };
    const transportState = typeof isTransportExpansionActive === 'function' && isTransportExpansionActive()
      && typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
    const transit = { ...(transportState?.lastModeTotals || {}) };
    const transitRevenue = Number(transportState?.lastFinancials?.revenue) || 0;
    const transitRiders = Object.values(transit).reduce((sum, riders) => sum + (Number(riders) || 0), 0);
    let ferryPiers = 0;
    try {
      ferryPiers = transportState && typeof getFerryState === 'function' ? (getFerryState().piers || []).length : 0;
    } catch { /* no ferries */ }

    let regionConnections = 0;
    try {
      const connections = typeof detectRegionConnections === 'function' ? detectRegionConnections() : [];
      regionConnections = Array.isArray(connections) ? connections.length : 0;
    } catch { /* a map without edges */ }
    // 區外交通 (docs/region-transit-design.md): lines off the map, last month's riders at their
    // 區外站 by mode and destination, and the cross-district commuters they carried
    let offMapLines = 0;
    const offMap = {};
    try {
      const summary = typeof getRegionTransitSummary === 'function' ? getRegionTransitSummary() : null;
      offMapLines = summary?.lines || 0;
      Object.entries(summary?.byModeDestination || {}).forEach(([key, riders]) => {
        const [mode, destination] = key.split(':');
        (offMap[mode] ||= {})[destination] = riders;
      });
    } catch { /* no lines off the map */ }
    const offMapShare = Math.max(0, Math.min(1, Number(city.regionFlows?.transitShare) || 0));

    // What older saves already did before medals existed: approved one-offs are held events, and
    // the council's history still has the outcomes of the last fifty.
    const council = city.council || {};
    const approvedResolutions = {};
    Object.entries(council.resolutionStates || {}).forEach(([id, state]) => {
      approvedResolutions[id] = Number(state?.timesApproved) || 0;
    });
    const failedMajorEvents = new Set();
    const heldFacts = {};
    const outcomes = [];
    (council.resolutionHistory || []).forEach((entry) => {
      if (entry?.outcome) outcomes.push([entry.resolutionId, entry.outcome]);
      (entry?.results || []).forEach((result) => outcomes.push([entry.resolutionId, result?.outcome]));
    });
    (council.activePrograms || []).forEach((program) => {
      (program?.results || []).forEach((result) => outcomes.push([program.resolutionId, result?.outcome]));
    });
    outcomes.forEach(([id, outcome]) => {
      if (!MEDAL_MAJOR_EVENT_IDS.includes(id) || !outcome) return;
      if (outcome !== 'typhoon_cancelled' && outcome !== 'scheduled') heldFacts[`held:${id}`] = true;
      if (isMedalFailedOutcome(outcome)) failedMajorEvents.add(id);
    });

    const absurdByYear = {};
    (city.medalLog?.absurd || []).forEach((entry) => {
      (absurdByYear[entry.year] ||= []).push(entry.id);
    });

    return {
      population: Number(city.population) || 0,
      happiness: Number(city.happiness) || 0,
      ridicule: Number(city.cityRidicule) || 0,
      buildings,
      policies,
      transit,
      transitRevenue,
      transitRiders,
      ferryPiers,
      regionConnections,
      offMapLines,
      offMap,
      offMapShare,
      commercialTax: Number(city.lastBudgetSnapshot?.income?.commercialTax) || 0,
      commercialCount: Number(city.commercialCount) || 0,
      industrialCount: Number(city.industrialCount) || 0,
      unemploymentRate: Number(city.unemploymentRate) || 0,
      gradeAOffices,
      surplusStreak: Math.max(0, Math.floor(Number(city.medalLog?.surplusStreak) || 0)),
      highDensityResidents: Math.round(highDensityResidents * districtDensity),
      scienceParkJobs,
      governmentRealizedPnl: Number(city.stockMarket?.governmentPortfolio?.realizedPnl) || 0,
      nightMarketRunning: !!policies.nightBazaarWeekend
        && (typeof countNightBazaarGroundTiles !== 'function' || countNightBazaarGroundTiles() > 0),
      approvedResolutions,
      failedMajorEvents: [...failedMajorEvents],
      facts: heldFacts,
      absurdByYear,
    };
  }

  // ── Judging ───────────────────────────────────────────────────────────────

  function runMedalEvaluation() {
    if (isMedalTrackingPaused()) return [];
    if (!medalRuntime.loaded) {
      medalRuntime.pendingEvaluation = true;
      loadMedalProfile();
      return [];
    }
    medalRuntime.pendingEvaluation = false;
    let result;
    try {
      result = evaluateMedals(collectMedalSnapshot(), medalRuntime.profile, medalStamp());
    } catch (error) {
      console.error('[medals] evaluation failed', error);
      return [];
    }
    if (result.newlyEarned.length || result.newParts.length) scheduleMedalProfileSave();
    result.newlyEarned.forEach(announceMedal);
    if (result.newlyEarned.length || result.newParts.length) refreshMedalCabinet();
    return result.newlyEarned;
  }

  function announceMedal(id) {
    const def = MEDAL_DEFS_BY_ID[id];
    if (!def || typeof showToast !== 'function') return;
    const prefix = def.tier === 'black'
      ? say(L('🖤 獲得黑紫荊勳章', '🖤 Black Bauhinia awarded', '🖤 黒紫荊勲章を獲得'))
      : say(L('🏵 獲得洋紫荊勳章', '🏵 Bauhinia Medal awarded', '🏵 洋紫荊勲章を獲得'));
    showToast(`${prefix}・《${say(def.name)}》`, 'medal');
    if (id === 'C01') announceBlackBauhiniaNews();
  }

  // C.3's news flash, as a forum story
  function announceBlackBauhiniaNews() {
    if (typeof addForumPost !== 'function') return;
    const language = medalLanguage();
    const copy = {
      zhHant: {
        headline: '【香城快訊】香城榮獲「荒謬之都」黑紫荊殊榮！',
        body: '政府表示，恥笑指數登頂再次證明本市作為國際笑話中心的領先地位。',
        comment: '恭喜呀，頒個勳章畀自己恥笑自己，終於做到世界第一。',
      },
      en: {
        headline: 'Heung Shing wins the Black Bauhinia as the "City of Absurdity"!',
        body: 'The government says topping the ridicule index proves the city\'s lead as an international joke centre.',
        comment: 'Congratulations on awarding yourselves a medal for laughing at yourselves. World number one at last.',
      },
      ja: {
        headline: '【香城速報】香城が「不条理の都」黒紫荊勲章を受賞！',
        body: '政府は、嘲笑度の頂点到達が国際ジョークセンターとしての本市の地位を改めて証明したと発表した。',
        comment: 'おめでとう。自分を笑う自分に勲章を出して、ついに世界一だ。',
      },
    }[language] || null;
    const text = copy || {
      headline: '【香城快訊】香城榮獲「荒謬之都」黑紫荊殊榮！',
      body: '政府表示，恥笑指數登頂再次證明本市作為國際笑話中心的領先地位。',
      comment: '恭喜呀，頒個勳章畀自己恥笑自己，終於做到世界第一。',
    };
    addForumPost({
      headline: text.headline,
      body: [text.body],
      source: 'local',
      social: { likes: '8,964', laughs: '19,970', angry: '1,212', commentCount: '3,456', shares: '6,174',
        comments: [{ author: language === 'en' ? 'Resident' : language === 'ja' ? '住民' : '街坊', text: text.comment }] },
    }, { id: `medal-black-bauhinia-${city.year}-${city.month}`, category: '城中熱話', author: language === 'en' ? 'Heung Shing Express' : language === 'ja' ? '香城速報' : '香城快訊' });
  }

  // A19: months in a row with a surplus, counted at each month's turn only (with the city)
  function updateMedalSurplusStreak() {
    if (isMedalTrackingPaused()) return;
    if (!city.medalLog || typeof city.medalLog !== 'object') city.medalLog = { absurd: [] };
    const net = Number(city.monthlyIncome) - Number(city.monthlyExpenses);
    const streak = Math.max(0, Math.floor(Number(city.medalLog.surplusStreak) || 0));
    city.medalLog.surplusStreak = Number.isFinite(net) && net > 0 ? streak + 1 : 0;
  }

  function onMedalMonthTurned() {
    updateMedalSurplusStreak();
    runMedalEvaluation();
  }

  // save.js, once a city has loaded
  function onMedalCityLoaded() {
    if (!city.medalLog || typeof city.medalLog !== 'object') city.medalLog = { absurd: [] };
    runMedalEvaluation();
  }

  // ── Cabinet ───────────────────────────────────────────────────────────────

  const MEDAL_TIER_LABELS = {
    bronze: L('銅紫荊', 'Bronze', '銅紫荊'),
    silver: L('銀紫荊', 'Silver', '銀紫荊'),
    gold: L('金紫荊', 'Gold', '金紫荊'),
    black: L('黑紫荊', 'Black', '黒紫荊'),
    memorial: L('隱藏紀念', 'Memorial', '隠し記念'),
    grand: L('香城大紫荊', 'Grand Bauhinia', '香城大紫荊'),
  };

  const cabinetView = { series: 'all', filter: 'all', query: '', sort: 'catalogue', selected: null, detailOpen: false };
  let cabinetReturnFocus = null;

  function escapeMedalHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  const htmlText = (text) => escapeMedalHtml(say(text));
  const concealedMedal = (def) => def.hidden && !medalRuntime.profile.earned[def.id];
  const medalName = (def) => concealedMedal(def) ? say(L('未揭曉的榮譽', 'An undiscovered honour', 'まだ見ぬ栄誉')) : say(def.name);
  const medalTier = (def) => concealedMedal(def) ? say(L('隱藏勳章', 'Hidden medal', '隠し勲章'))
    : def.tier ? say(MEDAL_TIER_LABELS[def.tier]) : say(L('洋紫荊', 'Bauhinia', '洋紫荊'));
  const medalEmblem = (def) => `<span class="medal-emblem">${renderBauhiniaMedalSvg(def.tier, concealedMedal(def))}</span>`;

  function medalStatus(def) {
    if (medalRuntime.profile.earned[def.id]) return say(L('已取得', 'Awarded', '獲得済み'));
    if (concealedMedal(def)) return say(L('等待你發掘', 'Waiting to be discovered', '発見を待っています'));
    if (def.status === 'blocked') return say(L('即將推出', 'Coming soon', '近日公開'));
    if (def.status === 'locked') return say(L('門檻待定', 'Criteria pending', '基準未定'));
    return say(L('未取得', 'Not yet earned', '未獲得'));
  }

  function medalPartsProgress(def) {
    const total = def.parts?.length || 0;
    const done = (def.parts || []).filter((part) => medalRuntime.profile.parts[def.id]?.[part.id]).length;
    return { total, done };
  }

  function renderMedalCard(def) {
    const earned = medalRuntime.profile.earned[def.id];
    const hidden = concealedMedal(def);
    const { total, done } = medalPartsProgress(def);
    const progress = !earned && !hidden && def.status === 'active' && total;
    const status = progress ? say(L(`${done} / ${total} 項條件`, `${done} / ${total} objectives`, `${done} / ${total} 条件`)) : medalStatus(def);
    return `<button type="button" class="medal-card${earned ? ' is-earned' : ''}${def.status !== 'active' && !earned ? ' is-unavailable' : ''}"
      data-medal-id="${def.id}" aria-pressed="${cabinetView.selected === def.id}" aria-controls="medal-cabinet-detail">
      <span class="mc-card-id">${def.id}</span>${earned ? '<span class="mc-earned-mark" aria-hidden="true">✓</span>' : ''}
      ${medalEmblem(def)}<span class="medal-name">${escapeMedalHtml(medalName(def))}</span>
      <span class="mc-card-tier">${escapeMedalHtml(medalTier(def))}</span>
      <span class="mc-card-status">${escapeMedalHtml(status)}</span>
      ${progress ? `<span class="mc-card-progress" aria-hidden="true" style="--progress:${done / total * 100}%"><i></i></span>` : ''}
    </button>`;
  }

  function matchingMedals() {
    const query = cabinetView.query.trim().toLocaleLowerCase();
    const matches = MEDAL_DEFS.filter((def) => {
      const earned = !!medalRuntime.profile.earned[def.id];
      if (cabinetView.series !== 'all' && def.series !== cabinetView.series) return false;
      if (cabinetView.filter === 'earned' && !earned || cabinetView.filter === 'unearned' && earned) return false;
      // Secret names, criteria and tiers must not be discoverable through search.
      const searchable = concealedMedal(def) ? `${def.id} ${medalName(def)} ${medalTier(def)}` : `${def.id} ${say(def.name)} ${say(def.desc)} ${medalTier(def)}`;
      return !query || searchable.toLocaleLowerCase().includes(query);
    });
    if (cabinetView.sort === 'recent') matches.sort((a, b) => String(medalRuntime.profile.earned[b.id]?.at || '').localeCompare(String(medalRuntime.profile.earned[a.id]?.at || '')));
    if (cabinetView.sort === 'progress') matches.sort((a, b) => {
      const score = (def) => {
        if (medalRuntime.profile.earned[def.id] || concealedMedal(def) || def.status !== 'active') return -1;
        const { done, total } = medalPartsProgress(def);
        return total ? done / total : 0;
      };
      return score(b) - score(a);
    });
    return matches;
  }

  function renderMedalDetail(def) {
    if (!def) return `<p class="mc-empty">${htmlText(L('選取一枚勳章，查看它的故事。', 'Choose a medal to explore its story.', '勲章を選んで詳細を確認。'))}</p>`;
    const earned = medalRuntime.profile.earned[def.id];
    const hidden = concealedMedal(def);
    const { done, total } = medalPartsProgress(def);
    const parts = !hidden && def.parts && def.status === 'active' ? `<ul class="medal-parts">${def.parts.map((part) => {
      const stamp = medalRuntime.profile.parts[def.id]?.[part.id];
      return `<li class="${stamp ? 'is-done' : ''}"><span class="mc-part-check" aria-label="${htmlText(stamp ? L('已完成', 'Complete', '完了') : L('未完成', 'Incomplete', '未完了'))}">${stamp ? '✓' : '−'}</span><span>${htmlText(part.name)}${stamp ? `<span class="mc-part-city">${escapeMedalHtml(stamp.city || '—')} · ${stamp.year}.${String(stamp.month).padStart(2, '0')}</span>` : ''}</span></li>`;
    }).join('')}</ul>` : '';
    const date = earned ? say(L(`${earned.year} 年 ${earned.month} 月獲頒`, `Awarded ${earned.month}/${earned.year}`, `${earned.year}年${earned.month}月に授与`)) : '';
    return `<div class="mc-detail-top"><button type="button" class="mc-detail-back" data-medal-back>‹ ${htmlText(L('返回收藏', 'Collection', 'コレクションへ'))}</button><span>${htmlText(L('勳章檔案', 'MEDAL RECORD', '勲章記録'))}</span><span>${def.id}</span></div>
      <div class="mc-detail-art${earned ? '' : ' is-unearned'}">${medalEmblem(def)}</div>
      <div class="mc-detail-tier">${escapeMedalHtml(medalTier(def))}</div>
      <h2 class="mc-detail-name" id="medal-cabinet-detail-title" tabindex="-1">${escapeMedalHtml(medalName(def))}</h2>
      <div class="mc-status-pill${earned ? ' is-earned' : ''}">${earned ? '✓ ' : ''}${escapeMedalHtml(medalStatus(def))}</div>
      <section class="mc-detail-section"><h3>${htmlText(L('授勳條件', 'OBJECTIVES', '授与条件'))}</h3>
        <p class="mc-description">${htmlText(hidden ? L('每座城市都藏着驚喜。繼續探索，讓這份榮譽自己揭曉。', 'Every city holds a surprise. Keep exploring to uncover this honour.', '街には驚きが隠れています。探索を続け、この栄誉を見つけましょう。') : def.desc)}</p>
        ${parts}${!hidden && total ? `<p class="mc-detail-note">${htmlText(L(`已完成 ${done} / ${total} 項；各項可跨城市累積。`, `${done} / ${total} complete; objectives accumulate across cities.`, `${done} / ${total} 完了。条件は都市をまたいで累積します。`))}${def.live ? `<br>${htmlText(L('所有項目完成後，亦須符合上述城市條件。', 'The city conditions above must also be met.', '上記の都市条件も満たす必要があります。'))}` : ''}</p>` : ''}
        ${!hidden && def.tierDraft ? `<p class="mc-detail-note">${htmlText(L('勳章等級暫按原草案編定。', 'Medal grade follows the original draft.', '等級は原案に基づく暫定です。'))}</p>` : ''}
      </section>
      ${earned ? `<section class="mc-detail-section"><h3>${htmlText(L('授勳紀錄', 'AWARD RECORD', '受賞記録'))}</h3><p class="mc-earned-city">${escapeMedalHtml(earned.city || '—')}</p><p class="mc-earned-date">${escapeMedalHtml(date)}</p>${def.quote ? `<p class="mc-detail-note">${htmlText(def.quote)}</p>` : ''}</section>` : ''}`;
  }

  function renderMedalResults({ resetScroll = false } = {}) {
    const dialog = document.getElementById(MEDAL_DIALOG_ID);
    const matches = matchingMedals();
    if (!matches.some((def) => def.id === cabinetView.selected)) cabinetView.selected = matches[0]?.id || null;
    const scroll = dialog.querySelector('.mc-scroll');
    const scrollTop = resetScroll ? 0 : scroll.scrollTop;
    dialog.querySelector('.medal-grid').innerHTML = matches.length ? matches.map(renderMedalCard).join('')
      : `<p class="mc-empty">${htmlText(L('暫時沒有符合的勳章。試試其他分類或關鍵字。', 'No medals match. Try a different category or search.', '該当する勲章がありません。分類や検索語を変えてみてください。'))}</p>`;
    scroll.scrollTop = scrollTop;
    const title = cabinetView.series === 'all' ? L('全部勳章', 'All medals', 'すべての勲章') : MEDAL_SERIES.find((s) => s.id === cabinetView.series).title;
    dialog.querySelector('[data-medal-gallery-title]').textContent = say(title);
    dialog.querySelector('[data-medal-result-count]').textContent = say(L(`${matches.length} 枚`, `${matches.length} medals`, `${matches.length} 個`));
    dialog.querySelectorAll('[data-medal-series]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.medalSeries === cabinetView.series)));
    dialog.querySelectorAll('[data-medal-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.medalFilter === cabinetView.filter)));
    dialog.querySelector('.mc-layout').classList.toggle('is-detail-open', cabinetView.detailOpen && !!cabinetView.selected);
    dialog.querySelector('.mc-detail').innerHTML = renderMedalDetail(MEDAL_DEFS_BY_ID[cabinetView.selected]);
  }

  function renderMedalCabinet() {
    const dialog = document.getElementById(MEDAL_DIALOG_ID);
    if (!dialog) return;
    const { earned, total } = getMedalCompletion(medalRuntime.profile);
    const percent = Math.round(earned / total * 100);
    const active = document.activeElement;
    const focusKey = active?.dataset?.medalId;
    const focusControl = ['medalSeries', 'medalFilter', 'medalSort', 'medalBack'].find((key) => active?.dataset && key in active.dataset);
    const focusValue = focusControl ? active.dataset[focusControl] : null;
    const scrollTop = dialog.querySelector('.mc-scroll')?.scrollTop || 0;
    const detailScroll = dialog.querySelector('.mc-detail')?.scrollTop || 0;
    const searchFocused = active?.matches('[data-medal-search]');
    const selection = searchFocused ? [active.selectionStart, active.selectionEnd] : null;
    dialog.querySelector('[data-medal-title]').textContent = say(L('洋紫荊勳章', 'Bauhinia Medals', '洋紫荊勲章'));
    dialog.querySelector('[data-medal-subtitle]').textContent = say(L('城市會變，你的成就長存。', 'Every city changes. Your achievements endure.', '街は変わっても、功績は残る。'));
    dialog.querySelector('[data-medal-completion]').innerHTML = `<div class="mc-completion-label"><strong>${medalRuntime.loaded ? earned : '—'}</strong><span>/ ${total}</span><small>${medalRuntime.loaded ? percent + '%' : '—'}</small></div><div class="mc-progress" role="progressbar" aria-label="${htmlText(L('收藏進度', 'Collection progress', 'コレクション進捗'))}" aria-valuenow="${earned}" aria-valuemin="0" aria-valuemax="${total}"><span style="--progress:${percent}%"></span></div>`;
    dialog.querySelector('[data-medal-close]').setAttribute('aria-label', say(L('關閉勳章櫃', 'Close medal cabinet', '勲章コレクションを閉じる')));
    const series = [{ id: 'all', title: L('全部勳章', 'All medals', 'すべての勲章'), icon: '▦' }, ...MEDAL_SERIES.map((s, i) => ({ ...s, icon: ['◇', '✧', '♛'][i] }))];
    dialog.querySelector('[data-medal-body]').innerHTML = `<div class="mc-layout${cabinetView.detailOpen ? ' is-detail-open' : ''}">
      <nav class="mc-nav" aria-label="${htmlText(L('勳章系列', 'Medal series', '勲章シリーズ'))}"><p class="mc-nav-label">${htmlText(L('收藏分類', 'COLLECTIONS', 'コレクション'))}</p>
        ${series.map((s) => {
          const defs = MEDAL_DEFS.filter((def) => s.id === 'all' || def.series === s.id);
          const count = defs.filter((def) => medalRuntime.profile.earned[def.id]).length;
          return `<button type="button" class="mc-series" data-medal-series="${s.id}" aria-pressed="${cabinetView.series === s.id}"><span class="mc-series-icon" aria-hidden="true">${s.icon}</span><span>${htmlText(s.title)}</span><span class="mc-series-count">${count}/${defs.length}</span></button>`;
        }).join('')}
        <p class="mc-nav-note">${htmlText(L('一枚勳章，<br>一段香城故事。', 'A medal for every<br>Heung Shing story.', '勲章の一つひとつに、<br>香城の物語。')).replace(/&lt;br&gt;/g, '<br>')}</p>
      </nav>
      <section class="mc-gallery" aria-labelledby="medal-gallery-title"><div class="mc-gallery-heading"><h2 id="medal-gallery-title" data-medal-gallery-title></h2><span class="mc-result-count" data-medal-result-count role="status"></span></div>
        ${!medalRuntime.loaded ? `<div class="mc-load-notice" role="status">${medalRuntime.loading ? htmlText(L('正在讀取你的收藏…', 'Loading your collection…', 'コレクションを読み込み中…')) : `${htmlText(L('暫時無法讀取收藏。', 'Collection could not be loaded.', 'コレクションを読み込めません。'))}<button type="button" class="mc-retry" data-medal-retry>${htmlText(L('重試', 'Retry', '再試行'))}</button>`}</div>` : ''}
        <div class="mc-controls"><div class="mc-filters" role="group" aria-label="${htmlText(L('取得狀態', 'Award status', '獲得状態'))}">
          ${[['all', L('全部', 'All', 'すべて')], ['earned', L('已取得', 'Awarded', '獲得済み')], ['unearned', L('未取得', 'Unearned', '未獲得')]].map(([id, label]) => `<button type="button" class="mc-filter" data-medal-filter="${id}" aria-pressed="${cabinetView.filter === id}">${htmlText(label)}</button>`).join('')}
        </div><input type="search" class="mc-search" data-medal-search placeholder="${htmlText(L('搜尋勳章…', 'Search medals…', '勲章を検索…'))}" aria-label="${htmlText(L('搜尋勳章', 'Search medals', '勲章を検索'))}" value="${escapeMedalHtml(cabinetView.query)}">
        <select class="mc-sort" data-medal-sort aria-label="${htmlText(L('勳章排序', 'Sort medals', '勲章の並べ替え'))}">${[['catalogue', L('編號排序', 'Catalogue order', '番号順')], ['recent', L('最近取得', 'Recently awarded', '獲得が新しい順')], ['progress', L('條件完成度', 'Objective progress', '条件の達成度')]].map(([id, label]) => `<option value="${id}"${cabinetView.sort === id ? ' selected' : ''}>${htmlText(label)}</option>`).join('')}</select></div>
        <div class="mc-scroll"><div class="medal-grid"></div></div>
      </section>
      <aside class="mc-detail" id="medal-cabinet-detail" aria-label="${htmlText(L('勳章詳情', 'Medal details', '勲章の詳細'))}" tabindex="0"></aside>
    </div>`;
    dialog.querySelector('[data-medal-footer]').innerHTML = `<span>${htmlText(L('勳章跟隨玩家 · 所有城市共同累積', 'Your honours · Shared across all your cities', 'プレイヤーの栄誉 · すべての都市で累積'))}</span><span class="mc-footer-shortcut"><kbd>ESC</kbd>${htmlText(L('返回城市', 'Return to city', '街に戻る'))}</span>`;
    renderMedalResults();
    dialog.querySelector('.mc-scroll').scrollTop = scrollTop;
    dialog.querySelector('.mc-detail').scrollTop = detailScroll;
    if (searchFocused) {
      const input = dialog.querySelector('[data-medal-search]');
      input.focus({ preventScroll: true });
      input.setSelectionRange(...selection);
    } else if (focusKey) dialog.querySelector(`[data-medal-id="${focusKey}"]`)?.focus({ preventScroll: true });
    else if (focusControl) [...dialog.querySelectorAll('button, select')].find((el) => el.dataset[focusControl] === focusValue)?.focus({ preventScroll: true });
  }

  // the top bar's count (index.html #topbar-medals): a dash until the cabinet has loaded
  function updateMedalKpi() {
    const el = typeof document !== 'undefined' ? document.getElementById('topbar-medals') : null;
    if (!el) return;
    if (!medalRuntime.loaded) { el.textContent = '🏵 —'; return; }
    const { earned, total } = getMedalCompletion(medalRuntime.profile);
    el.textContent = `🏵 ${earned}／${total}`;
  }

  function refreshMedalCabinet() {
    updateMedalKpi();
    const dialog = typeof document !== 'undefined' ? document.getElementById(MEDAL_DIALOG_ID) : null;
    if (dialog && dialog.style.display !== 'none') renderMedalCabinet();
  }

  function closeMedalCabinet() {
    document.getElementById(MEDAL_DIALOG_ID).style.display = 'none';
    cabinetReturnFocus?.focus({ preventScroll: true });
  }

  function ensureMedalCabinetDialog() {
    let dialog = document.getElementById(MEDAL_DIALOG_ID);
    if (dialog) return dialog;
    dialog = document.createElement('div');
    dialog.id = MEDAL_DIALOG_ID;
    dialog.className = 'sim-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'medal-cabinet-title');
    dialog.innerHTML = `<div class="dialog-overlay"></div><div class="dialog-box">
      <header class="mc-header"><div class="mc-seal">${renderBauhiniaMedalSvg('gold')}</div><div class="mc-heading"><div class="mc-eyebrow">HEUNG SHING · HONOURS</div><h1 id="medal-cabinet-title" data-medal-title></h1><p class="mc-subtitle" data-medal-subtitle></p></div><div class="mc-completion" data-medal-completion></div><button class="mc-close" type="button" data-medal-close>×</button></header>
      <div class="dialog-body" data-medal-body></div><footer class="mc-footer" data-medal-footer></footer></div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('[data-medal-close]').addEventListener('click', closeMedalCabinet);
    dialog.querySelector('.dialog-overlay').addEventListener('click', closeMedalCabinet);
    dialog.addEventListener('click', (event) => {
      const target = event.target.closest('button');
      if (!target) return;
      if (target.hasAttribute('data-medal-retry')) { openMedalCabinet(); return; }
      if (target.dataset.medalSeries) cabinetView.series = target.dataset.medalSeries;
      else if (target.dataset.medalFilter) cabinetView.filter = target.dataset.medalFilter;
      else if (target.dataset.medalId) {
        cabinetView.selected = target.dataset.medalId;
        cabinetView.detailOpen = true;
        dialog.querySelectorAll('[data-medal-id]').forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.medalId === cabinetView.selected)));
        dialog.querySelector('.mc-detail').innerHTML = renderMedalDetail(MEDAL_DEFS_BY_ID[cabinetView.selected]);
        dialog.querySelector('.mc-detail').scrollTop = 0;
        dialog.querySelector('.mc-layout').classList.add('is-detail-open');
        if (matchMedia('(max-width: 760px)').matches) dialog.querySelector('[data-medal-back]').focus();
        return;
      } else if (target.hasAttribute('data-medal-back')) {
        cabinetView.detailOpen = false;
        dialog.querySelector('.mc-layout').classList.remove('is-detail-open');
        dialog.querySelector(`[data-medal-id="${cabinetView.selected}"]`)?.focus();
        return;
      } else return;
      renderMedalResults({ resetScroll: true });
    });
    dialog.addEventListener('input', (event) => {
      if (!event.target.matches('[data-medal-search]')) return;
      cabinetView.query = event.target.value;
      renderMedalResults({ resetScroll: true });
    });
    dialog.addEventListener('change', (event) => {
      if (!event.target.matches('[data-medal-sort]')) return;
      cabinetView.sort = event.target.value;
      renderMedalResults({ resetScroll: true });
    });
    dialog.addEventListener('keydown', (event) => {
      event.stopPropagation(); // Modal shortcuts must not reach the city/map keyboard controls.
      if (event.key === 'Escape') { event.preventDefault(); closeMedalCabinet(); }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button, input, select, [tabindex="0"]')].filter((el) => !el.disabled && el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    dialog.addEventListener('keyup', (event) => event.stopPropagation());
    return dialog;
  }

  async function openMedalCabinet() {
    const dialog = ensureMedalCabinetDialog();
    if (dialog.style.display !== 'flex') {
      cabinetReturnFocus = document.activeElement;
      cabinetView.detailOpen = false;
    }
    dialog.style.display = 'flex';
    // Start loading before rendering so the initial view announces its loading state.
    const loading = loadMedalProfile();
    renderMedalCabinet();
    dialog.querySelector('[data-medal-close]').focus({ preventScroll: true });
    await loading;
    runMedalEvaluation();
    renderMedalCabinet();
  }

  if (typeof onGameClockEvent === 'function') onGameClockEvent('gameclock:month', onMedalMonthTurned);
  loadMedalProfile();

  Object.assign(globalThis, {
    loadMedalProfile, runMedalEvaluation, collectMedalSnapshot, onMedalCityLoaded, openMedalCabinet, updateMedalKpi,
    noteMedalFact, noteMedalAbsurdEvent, noteMedalResolutionOutcome, noteMedalPolicyEnacted,
    noteMedalForumStory, noteMedalTransitMonth,
    getMedalProfile: () => medalRuntime.profile,
  });
})();
