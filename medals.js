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
    if (result.newlyEarned.length) refreshMedalCabinet();
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

  function ensureMedalCabinetStyles() {
    if (document.getElementById('medal-cabinet-styles')) return;
    const style = document.createElement('style');
    style.id = 'medal-cabinet-styles';
    style.textContent = `
      .toast.toast-medal { background: #7a2357; }
      /* the game's dialogs set pre-wrap and Courier for their plain-text bodies; this one is laid out */
      #${MEDAL_DIALOG_ID} .dialog-body { white-space: normal; font-family: Arial, sans-serif; line-height: 1.4; }
      #${MEDAL_DIALOG_ID} .medal-summary { margin: 0 0 4px; font-size: 13px; color: #3a4148; }
      #${MEDAL_DIALOG_ID} .medal-series-title { margin: 14px 0 8px; font-size: 14px; font-weight: 700; color: #1e5cb3; }
      #${MEDAL_DIALOG_ID} .medal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
      #${MEDAL_DIALOG_ID} .medal-card { display: flex; gap: 10px; padding: 8px; border-radius: 6px;
        background: #f4f7fa; border: 1px solid #c3ccd6; color: #1e2427; }
      #${MEDAL_DIALOG_ID} .medal-card.is-earned { border-color: #b0407a; background: #f6e3ee; }
      #${MEDAL_DIALOG_ID} .medal-card.is-unavailable { opacity: 0.55; }
      #${MEDAL_DIALOG_ID} .medal-emblem { flex: 0 0 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
        font-size: 20px; color: #fff; background: var(--medal-colour, #b0407a);
        box-shadow: inset 0 0 0 3px rgba(255,255,255,0.35); filter: grayscale(1) brightness(0.7); }
      #${MEDAL_DIALOG_ID} .medal-card.is-earned .medal-emblem { filter: none; }
      #${MEDAL_DIALOG_ID} .medal-text { min-width: 0; font-size: 12px; line-height: 1.4; }
      #${MEDAL_DIALOG_ID} .medal-name { font-size: 13px; font-weight: 700; }
      #${MEDAL_DIALOG_ID} .medal-meta { color: #5b6570; }
      #${MEDAL_DIALOG_ID} .medal-parts { margin: 3px 0; padding: 0; list-style: none; color: #5b6570; }
      #${MEDAL_DIALOG_ID} .medal-parts li.is-done { color: #8e1b5b; font-weight: 700; }
    `;
    document.head.appendChild(style);
  }

  const MEDAL_TIER_COLOURS = {
    bronze: '#a8683a', silver: '#8e959e', gold: '#c9a227', black: '#2a1830',
    memorial: '#9a7cc0', grand: '#8e1b5b',
  };

  function escapeMedalHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function renderMedalCard(def) {
    const profile = medalRuntime.profile;
    const earned = profile.earned[def.id];
    const unavailable = def.status !== 'active';
    const concealed = def.hidden && !earned;
    const tier = def.tier ? say(MEDAL_TIER_LABELS[def.tier]) : say(L('洋紫荊', 'Bauhinia', '洋紫荊'));
    const tierNote = def.tierDraft && def.tier ? say(L('（草案）', ' (draft)', '（草案）')) : '';
    let status;
    if (earned) {
      status = say(L(`${earned.city || '—'}・${earned.year} 年 ${earned.month} 月取得`, `Earned in ${earned.city || '—'}, ${earned.month}/${earned.year}`, `${earned.city || '—'}・${earned.year}年${earned.month}月に獲得`));
    } else if (def.status === 'blocked') {
      status = say(L('即將推出', 'Coming soon', '近日公開'));
    } else if (def.status === 'locked') {
      status = say(L('門檻待定', 'Threshold to be decided', '基準未定'));
    } else status = say(L('未取得', 'Not yet earned', '未獲得'));
    const parts = !concealed && def.parts && def.status === 'active'
      ? `<ul class="medal-parts">${def.parts.map((part) => {
        const done = !!profile.parts[def.id]?.[part.id];
        return `<li class="${done ? 'is-done' : ''}">${done ? '✓' : '·'} ${escapeMedalHtml(say(part.name))}</li>`;
      }).join('')}</ul>` : '';
    const quote = earned && def.quote ? `<div class="medal-meta">${escapeMedalHtml(say(def.quote))}</div>` : '';
    return `
      <div class="medal-card${earned ? ' is-earned' : ''}${unavailable && !earned ? ' is-unavailable' : ''}" data-medal-id="${def.id}">
        <div class="medal-emblem" style="--medal-colour:${MEDAL_TIER_COLOURS[def.tier] || '#b0407a'}">${concealed ? '?' : '✿'}</div>
        <div class="medal-text">
          <div class="medal-name">${escapeMedalHtml(concealed ? '？？？' : say(def.name))}</div>
          <div class="medal-meta">${def.id}・${escapeMedalHtml(tier + tierNote)}</div>
          <div>${escapeMedalHtml(concealed ? say(L('隱藏勳章', 'Hidden medal', '隠し勲章')) : say(def.desc))}</div>
          ${parts}${quote}
          <div class="medal-meta">${escapeMedalHtml(status)}</div>
        </div>
      </div>`;
  }

  function renderMedalCabinet() {
    const dialog = document.getElementById(MEDAL_DIALOG_ID);
    if (!dialog) return;
    const { earned, total } = getMedalCompletion(medalRuntime.profile);
    dialog.querySelector('[data-medal-title]').textContent = say(L('洋紫荊勳章', 'Bauhinia Medals', '洋紫荊勲章'));
    const body = dialog.querySelector('[data-medal-body]');
    body.innerHTML = `
      <p class="medal-summary">${escapeMedalHtml(say(L(
        `已取得 ${earned}／${total}。勳章跟玩家，所有城市存檔累積計算。`,
        `${earned} of ${total} earned. Medals belong to you and build up across all your cities.`,
        `${earned}／${total} 獲得。勲章はプレイヤーに属し、すべての都市で累積します。`,
      )))}</p>
      ${MEDAL_SERIES.map((series) => `
        <div class="medal-series-title">${escapeMedalHtml(say(series.title))}</div>
        <div class="medal-grid">${MEDAL_DEFS.filter((def) => def.series === series.id).map(renderMedalCard).join('')}</div>
      `).join('')}`;
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

  function ensureMedalCabinetDialog() {
    let dialog = document.getElementById(MEDAL_DIALOG_ID);
    if (dialog) return dialog;
    ensureMedalCabinetStyles();
    dialog = document.createElement('div');
    dialog.id = MEDAL_DIALOG_ID;
    dialog.className = 'sim-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-box" style="max-width:760px">
        <div class="dialog-title-bar">
          <span data-medal-title></span>
          <button class="dialog-close-btn" type="button" data-medal-close>✕</button>
        </div>
        <div class="dialog-body" data-medal-body style="max-height:70vh;overflow:auto"></div>
      </div>`;
    document.body.appendChild(dialog);
    const close = () => { dialog.style.display = 'none'; };
    dialog.querySelector('[data-medal-close]').addEventListener('click', close);
    dialog.querySelector('.dialog-overlay').addEventListener('click', close);
    return dialog;
  }

  async function openMedalCabinet() {
    ensureMedalCabinetStyles();
    const dialog = ensureMedalCabinetDialog();
    dialog.style.display = 'flex';
    renderMedalCabinet();
    await loadMedalProfile();
    runMedalEvaluation();
    renderMedalCabinet();
  }

  if (typeof document !== 'undefined') ensureMedalCabinetStyles();
  if (typeof onGameClockEvent === 'function') onGameClockEvent('gameclock:month', onMedalMonthTurned);
  loadMedalProfile();

  Object.assign(globalThis, {
    loadMedalProfile, runMedalEvaluation, collectMedalSnapshot, onMedalCityLoaded, openMedalCabinet, updateMedalKpi,
    noteMedalFact, noteMedalAbsurdEvent, noteMedalResolutionOutcome, noteMedalPolicyEnacted,
    noteMedalForumStory, noteMedalTransitMonth,
    getMedalProfile: () => medalRuntime.profile,
  });
})();
