// 避風塘 Phase 4: 打風回港與避風壓力 - see docs/typhoon-shelter-phase4-design.md.
//
// One storm record for the whole city (city.typhoonShelters.storm), stepped once an environment
// hour by the weather clock (sim-weather.js advanceWeatherClock). It keeps only times and the
// visiting boats' berths; where every boat is still follows from the clock (typhoon-shelter-fleet.js),
// so pausing, speeding up, the camera and save/load all agree.
//
// Times are kept as intervals that are only ever opened and closed, never moved: a boat's day is
// read off them afresh every frame, so moving one after the fact would send a boat that already
// sailed back to its berth (or out to sea) in a single frame.
//   holds     [{ from, until, shelterFrom }]  三號／黑雨 and up: no one sails; until = the minute
//                                             it had been safe for two hours (null while open)
//   standbys  [{ from, until }]               一號: the far boats stay in, the rest come in early
//   visitors  [{ id, shelterId, slot, model, startAt, leaveAt, damaged }]

const TYPHOON_SHELTER_STORM = Object.freeze({
  safeMinutesToResume: 120,
  // 外來避風船: (base + perBerth x the city's berths) x the storm's factor, once per storm
  visitorBase: 10,
  visitorPerBerth: 0.2,
  stormFactor: Object.freeze({ signal1: 0, signal3: 0.5, signal8: 1, signal9: 1.3, signal10: 1.6 }),
  visitorArriveDelay: 60,   // after the recall: the shelter's own boats come in first
  visitorArriveSpan: 180,
  visitorMinGap: 4,         // minutes between two visitors on one shelter's routes (~2 tiles)
  visitorLeaveDelay: 30,
  visitorLeaveSpan: 360,
  visitorGoneAfter: 300,    // minutes after leaving a visitor is surely past the drawn sea
  // 損傷: per hour at 八號 and up, severity x (1 - protection/100)^2
  severity: Object.freeze({ signal8: 1, signal9: 1.6, signal10: 2.4 }),
  repairPerDamage: 0.02,
  repairCap: 0.25,
  boatDamagePerDamage: 0.03,
  boatDamageCap: 0.3,
  repairDaysMin: 1,
  repairDaysMax: 3,
  workshopRepairDays: 0.5,       // with a floating workshop in the shelter: half the days laid up
  workshopRepairBill: 0.7,       // and 30% off the repairs
});
const TYPHOON_SHELTER_STORM_DAY = 24 * 60;

function tsStormHash(...parts) {
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

// 'clear' | 'standby' (一號) | 'recall' (三號 or 黑雨) | 'shelter' (八號 and up)
function classifyTyphoonShelterWeather(weather) {
  if (!weather) return 'clear';
  const stage = weather.typhoonStage;
  if (stage === 'signal8' || stage === 'signal9' || stage === 'signal10') return 'shelter';
  if (stage === 'signal3' || weather.rainWarning === 'black') return 'recall';
  if (stage === 'signal1') return 'standby';
  return 'clear';
}

// The highest signal a storm will reach, from the peak wind fixed when it formed: its wind is
// 16 + peak x shape, so the strongest hour blows at about peak + 16 (sim-weather.js).
function predictTyphoonShelterPeakStage(peakWindKph) {
  const w = (Number(peakWindKph) || 0) + 16;
  if (w >= 118) return 'signal10';
  if (w >= 95) return 'signal9';
  if (w >= 63) return 'signal8';
  if (w >= 41) return 'signal3';
  return 'signal1';
}

function typhoonShelterVisitorDemand(peakStage, totalBerths) {
  const S = TYPHOON_SHELTER_STORM;
  return Math.round((S.visitorBase + S.visitorPerBerth * Math.max(0, totalBerths)) * (S.stormFactor[peakStage] || 0));
}

const TYPHOON_SHELTER_VISITOR_MODELS = Object.freeze({
  2: Object.freeze(['fishingBoat1', 'fishingBoat3', 'fishingBoat4']),
  1: Object.freeze(['sanpan1', 'sanpan3', 'sanpan5']),
});

/**
 * Share `demand` visiting boats out over the shelters' free berths, all at once.
 * shelters: [{ id, protection, free: [{ key, size, routeLength }] }] - free berths deepest first.
 * Returns { visitors, turnedAway }. Shares follow each shelter's free berths; the remainder goes to
 * the better protected. A shelter's visitors set out one after another, the deepest berth first,
 * so none passes another on the way in.
 */
function allocateTyphoonShelterVisitors(demand, shelters, { seed = 0, from = 0, nextId = 1 } = {}) {
  const S = TYPHOON_SHELTER_STORM;
  const totalFree = shelters.reduce((s, sh) => s + sh.free.length, 0);
  const take = Math.max(0, Math.min(demand, totalFree));
  const shares = shelters.map((sh) => (totalFree ? Math.floor((take * sh.free.length) / totalFree) : 0));
  let left = take - shares.reduce((a, b) => a + b, 0);
  [...shelters.keys()].sort((a, b) => (shelters[b].protection - shelters[a].protection) || String(shelters[a].id).localeCompare(String(shelters[b].id)))
    .forEach((i) => { if (left > 0 && shares[i] < shelters[i].free.length) { shares[i] += 1; left -= 1; } });
  const visitors = [];
  let id = nextId;
  shelters.forEach((sh, i) => {
    const chosen = sh.free.slice(0, shares[i]);
    const gap = Math.max(S.visitorMinGap, S.visitorArriveSpan / Math.max(1, chosen.length));
    chosen.forEach((slot, k) => {
      const models = TYPHOON_SHELTER_VISITOR_MODELS[slot.size >= 2 ? 2 : 1];
      visitors.push({
        id,
        shelterId: sh.id,
        slot: slot.key,
        model: models[Math.floor(tsStormHash(seed, 'visitor', id) * models.length)],
        startAt: Math.round(from + S.visitorArriveDelay + k * gap),
        leaveAt: null,
        damaged: false,
      });
      id += 1;
    });
  });
  return { visitors, turnedAway: Math.max(0, demand - take), nextId: id };
}

/**
 * Where a visiting boat is at `env`: { mode, distance } - 'away' (not yet in sight), 'in' (sailing
 * in), 'moored', 'out' (leaving) or 'gone'; distance in tiles from its berth along its route.
 */
function typhoonShelterVisitorState(visitor, routeLength, env) {
  const speed = typeof TYPHOON_SHELTER_FLEET !== 'undefined' ? TYPHOON_SHELTER_FLEET.speedTilesPerMinute : 0.5;
  if (!(routeLength > 0) || env < visitor.startAt) return { mode: 'away', distance: routeLength || 0 };
  const sailed = (env - visitor.startAt) * speed;
  if (sailed < routeLength) return { mode: 'in', distance: routeLength - sailed };
  if (visitor.leaveAt == null || env < visitor.leaveAt) return { mode: 'moored', distance: 0 };
  const out = (env - visitor.leaveAt) * speed;
  return out < routeLength ? { mode: 'out', distance: out } : { mode: 'gone', distance: routeLength };
}

function createTyphoonShelterStorm() {
  return { holds: [], standbys: [], visitors: [], nextVisitorId: 1, turnedAway: 0, demand: 0, allocatedFor: null, damage: {}, lastHour: null, report: null };
}

const openInterval = (list) => list.find((i) => i.until == null) || null;

// The storm's phase for the panel: 'clear' | 'standby' | 'recall' | 'shelter' | 'waiting' (signals
// down, not yet two safe hours) | 'recovery' (visitors still leaving).
function getTyphoonShelterStormPhase(storm, weather, env) {
  if (!storm) return 'clear';
  const hold = openInterval(storm.holds || []);
  const now = classifyTyphoonShelterWeather(weather);
  if (hold) return now === 'shelter' ? 'shelter' : now === 'recall' ? 'recall' : 'waiting';
  if (openInterval(storm.standbys || [])) return 'standby';
  if ((storm.visitors || []).some((v) => v.leaveAt == null || env < v.leaveAt + TYPHOON_SHELTER_STORM.visitorGoneAfter)) return 'recovery';
  return 'clear';
}

// Works and fleet changes wait while boats shelter or visitors are still in (`env`: now).
function isTyphoonShelterStormFreeze(storm, env = typeof getTyphoonShelterFleetClock === 'function' ? getTyphoonShelterFleetClock() : Infinity) {
  if (!storm) return false;
  return !!openInterval(storm.holds || [])
    || (storm.visitors || []).some((v) => v.leaveAt == null || env < v.leaveAt + TYPHOON_SHELTER_STORM.visitorGoneAfter);
}

/**
 * One environment hour of the storm. Pure: returns { storm, events } and changes nothing passed in.
 * ctx: { weather, minute, shelters: [{ id, name, protection, worksValue, boats: [id], free: [...] }],
 *        totalBerths, seed }
 * events: { type: 'recall' | 'visitors' | 'turnedAway' | 'resume' | 'settled', ... }
 */
function stepTyphoonShelterStorm(storm, { weather, minute, shelters = [], totalBerths = 0, seed = 0 }) {
  const S = TYPHOON_SHELTER_STORM;
  const events = [];
  const now = classifyTyphoonShelterWeather(weather);
  if (!storm && now === 'clear') return { storm: null, events };
  const s = storm
    ? { ...storm, holds: storm.holds.map((h) => ({ ...h })), standbys: storm.standbys.map((w) => ({ ...w })),
      visitors: storm.visitors.map((v) => ({ ...v })), damage: { ...storm.damage } }
    : createTyphoonShelterStorm();
  if (s.lastHour === minute) return { storm: s, events };
  s.lastHour = minute;

  // 一號: open a standby when it goes up, close it when the signals come down altogether
  const standby = openInterval(s.standbys);
  if (now === 'standby' && !standby) s.standbys.push({ from: minute, until: null });
  if (now === 'clear' && standby) standby.until = minute;

  // 三號 / 黑雨 and up: hold everyone in
  let hold = openInterval(s.holds);
  if (now === 'recall' || now === 'shelter') {
    if (!hold) {
      hold = { from: minute, until: null, shelterFrom: null, safeSince: null };
      s.holds.push(hold);
      events.push({ type: 'recall' });
    }
    hold.safeSince = null;
  } else if (hold) {
    if (hold.safeSince == null) hold.safeSince = minute;
    if (minute - hold.safeSince >= S.safeMinutesToResume) {
      hold.until = minute;
      events.push({ type: 'resume' });
      // the visitors go home over the next hours, the nearest the entrance first
      const staying = s.visitors.filter((v) => v.leaveAt == null);
      const gap = S.visitorLeaveSpan / Math.max(1, staying.length);
      staying.forEach((v, k) => { v.leaveAt = Math.round(minute + S.visitorLeaveDelay + (staying.length - 1 - k) * gap); });
      // settle the damage once
      const report = settleTyphoonShelterStormDamage(s, shelters, minute, seed);
      s.report = report;
      s.damage = {};
      events.push({ type: 'settled', report });
    }
  }

  // 外來避風船: once per typhoon, when the recall goes out
  const typhoonKey = weather?.typhoonActive ? `${weather.typhoonName || ''}|${weather.typhoonPeakWindKph || 0}` : null;
  if (hold && hold.until == null && typhoonKey && s.allocatedFor !== typhoonKey) {
    s.allocatedFor = typhoonKey;
    const taken = new Set(s.visitors.filter((v) => v.leaveAt == null || minute < v.leaveAt + S.visitorGoneAfter).map((v) => `${v.shelterId}|${v.slot}`));
    const open = shelters.map((sh) => ({ ...sh, free: sh.free.filter((slot) => !taken.has(`${sh.id}|${slot.key}`)) }));
    const demand = typhoonShelterVisitorDemand(predictTyphoonShelterPeakStage(weather.typhoonPeakWindKph), totalBerths);
    const out = allocateTyphoonShelterVisitors(demand, open, { seed: `${seed}|${typhoonKey}`, from: minute, nextId: s.nextVisitorId });
    s.visitors.push(...out.visitors);
    s.nextVisitorId = out.nextId;
    s.demand = demand;
    s.turnedAway = out.turnedAway;
    if (demand > 0) events.push({ type: 'visitors', demand, allotted: out.visitors.length, turnedAway: out.turnedAway });
  }

  // 八號 and up: the entrances close to anyone not yet on the way in; the shelters take the storm
  if (now === 'shelter' && hold) {
    if (hold.shelterFrom == null) {
      hold.shelterFrom = minute;
      const late = s.visitors.filter((v) => v.leaveAt == null && v.startAt > minute);
      if (late.length) {
        s.visitors = s.visitors.filter((v) => !late.includes(v));
        s.turnedAway += late.length;
        events.push({ type: 'turnedAway', count: late.length });
      }
    }
    const sev = S.severity[weather.typhoonStage] || 1;
    shelters.forEach((sh) => {
      const exposure = (1 - Math.max(0, Math.min(100, sh.protection || 0)) / 100) ** 2;
      s.damage[sh.id] = (s.damage[sh.id] || 0) + sev * exposure;
    });
  }

  // tidy up: intervals that can no longer touch a boat's day (yesterday and before), visitors well
  // gone; nothing left -> no storm
  const keepFrom = (Math.floor(minute / TYPHOON_SHELTER_STORM_DAY) - 1) * TYPHOON_SHELTER_STORM_DAY;
  s.holds = s.holds.filter((h) => h.until == null || h.until >= keepFrom);
  s.standbys = s.standbys.filter((w) => w.until == null || w.until >= keepFrom);
  s.visitors = s.visitors.filter((v) => v.leaveAt == null || minute < v.leaveAt + S.visitorGoneAfter);
  if (!s.holds.length && !s.standbys.length && !s.visitors.length && now === 'clear') return { storm: null, events };
  return { storm: s, events };
}

/**
 * The bill for a storm, per shelter: { [id]: { damage, repair, damagedBoats: [id], damagedVisitors } }
 * plus total. Local boats picked here are laid up (repairUntil) by the caller.
 */
function settleTyphoonShelterStormDamage(storm, shelters, minute, seed = 0) {
  const S = TYPHOON_SHELTER_STORM;
  const report = { total: 0, shelters: {} };
  shelters.forEach((sh) => {
    const damage = storm.damage[sh.id] || 0;
    if (!(damage > 0)) return;
    const repair = Math.round((sh.worksValue || 0) * Math.min(S.repairCap, S.repairPerDamage * damage) * (sh.workshop ? S.workshopRepairBill : 1));
    const visitors = storm.visitors.filter((v) => v.shelterId === sh.id && v.startAt <= minute);
    const hulls = [...(sh.boats || []).map((id) => ({ local: true, id })), ...visitors.map((v) => ({ local: false, id: v.id }))];
    const count = Math.round(hulls.length * Math.min(S.boatDamageCap, S.boatDamagePerDamage * damage));
    const hit = [...hulls].sort((a, b) => tsStormHash(seed, 'hit', minute, a.local, a.id) - tsStormHash(seed, 'hit', minute, b.local, b.id)).slice(0, count);
    const damagedBoats = hit.filter((h) => h.local).map((h) => ({
      id: h.id,
      repairUntil: minute + TYPHOON_SHELTER_STORM_DAY * (sh.workshop ? S.workshopRepairDays : 1)
        * (S.repairDaysMin + Math.floor(tsStormHash(seed, 'days', minute, h.id) * (S.repairDaysMax - S.repairDaysMin + 1))),
    }));
    hit.filter((h) => !h.local).forEach((h) => { const v = storm.visitors.find((x) => x.id === h.id); if (v) v.damaged = true; });
    report.shelters[sh.id] = { damage: Math.round(damage * 100) / 100, repair, damagedBoats, damagedVisitors: hit.length - damagedBoats.length };
    report.total += repair;
  });
  return report;
}

function normalizeTyphoonShelterStorm(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v) => (Number.isFinite(v) ? v : null);
  const interval = (i) => (i && Number.isFinite(i.from) ? { ...i, from: i.from, until: num(i.until) } : null);
  const holds = (Array.isArray(raw.holds) ? raw.holds : []).map(interval).filter(Boolean)
    .map((h) => ({ from: h.from, until: h.until, shelterFrom: num(h.shelterFrom), safeSince: num(h.safeSince) }));
  const standbys = (Array.isArray(raw.standbys) ? raw.standbys : []).map(interval).filter(Boolean)
    .map((w) => ({ from: w.from, until: w.until }));
  const models = [...TYPHOON_SHELTER_VISITOR_MODELS[1], ...TYPHOON_SHELTER_VISITOR_MODELS[2]];
  const visitors = (Array.isArray(raw.visitors) ? raw.visitors : [])
    .filter((v) => Number.isInteger(v?.id) && typeof v.shelterId === 'string' && typeof v.slot === 'string'
      && models.includes(v.model) && Number.isFinite(v.startAt))
    .map((v) => ({ id: v.id, shelterId: v.shelterId, slot: v.slot, model: v.model, startAt: v.startAt, leaveAt: num(v.leaveAt), damaged: !!v.damaged }));
  const damage = Object.fromEntries(Object.entries(raw.damage && typeof raw.damage === 'object' ? raw.damage : {})
    .filter(([, v]) => Number.isFinite(v) && v >= 0));
  if (!holds.length && !standbys.length && !visitors.length) return null;
  return {
    holds,
    standbys,
    visitors,
    nextVisitorId: Math.max(Number(raw.nextVisitorId) || 1, ...visitors.map((v) => v.id + 1), 1),
    turnedAway: Math.max(0, Math.round(Number(raw.turnedAway) || 0)),
    demand: Math.max(0, Math.round(Number(raw.demand) || 0)),
    allocatedFor: typeof raw.allocatedFor === 'string' ? raw.allocatedFor : null,
    damage,
    lastHour: num(raw.lastHour),
    report: raw.report && typeof raw.report === 'object' ? raw.report : null,
  };
}

// ---------------------------------------------------------------------------
// the game: stepping, money, news
// ---------------------------------------------------------------------------

function getTyphoonShelterStorm() {
  return typeof city !== 'undefined' ? city.typhoonShelters?.storm || null : null;
}

// What the step needs to know about each built shelter.
function buildTyphoonShelterStormShelters() {
  const state = getTyphoonShelterState();
  const analyses = getTyphoonShelterAnalyses();
  let totalBerths = 0;
  const shelters = state.shelters.filter((p) => p.works?.approved && p.status === 'operational').map((plan) => {
    const analysis = analyses.get(plan.id);
    if (!analysis) return null;
    const summary = typeof typhoonShelterWorkSummaries !== 'undefined' ? typhoonShelterWorkSummaries.get(plan.id) : null;
    totalBerths += summary?.berths?.total || 0;
    const geometry = getTyphoonShelterFleetGeometry(plan, analysis);
    const occupied = new Set((plan.fleet?.boats || []).map((b) => b.slot));
    const free = geometry.slots
      .map((slot) => ({ key: slot.key, size: slot.size, routeLength: geometry.routeBySlot.get(slot.key)?.length || 0 }))
      .filter((slot) => slot.routeLength > 0 && !occupied.has(slot.key))
      .sort((a, b) => b.routeLength - a.routeLength);
    const worksValue = (plan.works?.items || []).filter((i) => i.state === 'done')
      .reduce((sum, i) => sum + (TYPHOON_SHELTER_WORK_KINDS[i.kind]?.cost || 0), 0);
    return {
      id: plan.id, name: plan.name, protection: analysis.protection?.score || 0, worksValue,
      // a floating workshop (Phase 5, typhoon-shelter-fishery.js) mends the boats sooner and cheaper
      workshop: (plan.works?.items || []).some((i) => i.kind === 'workshop' && i.state === 'done'),
      boats: (plan.fleet?.boats || []).map((b) => b.id), free,
    };
  }).filter(Boolean);
  return { shelters, totalBerths };
}

function tsStormT(key, fallback, vars) {
  return typeof tsT === 'function' ? tsT(key, fallback, vars) : fallback;
}

// Called by the weather clock once each environment hour, after the weather has been updated.
// `envMinute` is on the weather's clock; the storm keeps its times on the fleet's (sky) clock,
// which runs GAME_DAY_START_MINUTES ahead (getTyphoonShelterFleetClock), so they line up with the
// boats' departure times.
function advanceTyphoonShelterStormHour(weather, envMinute) {
  const minute = envMinute + (typeof GAME_DAY_START_MINUTES === 'number' ? GAME_DAY_START_MINUTES : 6 * 60);
  if (typeof getTyphoonShelterState !== 'function' || typeof city === 'undefined') return;
  const state = getTyphoonShelterState();
  if (!state.storm && classifyTyphoonShelterWeather(weather) === 'clear') return;
  if (!state.shelters.some((p) => p.works?.approved)) {
    if (state.storm) city.typhoonShelters = { ...state, storm: null };
    return;
  }
  const { shelters, totalBerths } = buildTyphoonShelterStormShelters();
  const seed = state.shelters.reduce((s, p) => s + (Number(p.seed) || 0), 0);
  const { storm, events } = stepTyphoonShelterStorm(state.storm, { weather, minute, shelters, totalBerths, seed });
  let plans = state.shelters;
  events.forEach((e) => {
    if (e.type === 'visitors') {
      announceTyphoonShelterStorm(e.turnedAway > 0
        ? tsStormT('typhoonShelter.storm.newsShort', `各避風塘召回漁船，${e.demand} 艘外來船要求入塘避風，避風位不足，${e.turnedAway} 艘要轉往其他港口。`, { demand: e.demand, turnedAway: e.turnedAway })
        : tsStormT('typhoonShelter.storm.newsRecall', `各避風塘召回漁船，預計有 ${e.demand} 艘外來船入塘避風。`, { demand: e.demand }), e.turnedAway > 0 ? 'warning' : 'info');
    } else if (e.type === 'turnedAway') {
      announceTyphoonShelterStorm(tsStormT('typhoonShelter.storm.newsLate', `八號風球生效，避風塘入口關閉，${e.count} 艘未及入塘的船要轉往其他港口。`, { count: e.count }), 'warning');
    } else if (e.type === 'settled') {
      const report = e.report;
      const laidUp = new Map();
      Object.values(report.shelters).forEach((r) => r.damagedBoats.forEach((b) => laidUp.set(b.id, b.repairUntil)));
      plans = plans.map((plan) => {
        const r = report.shelters[plan.id];
        if (!r?.damagedBoats.length || !plan.fleet) return plan;
        const hit = new Map(r.damagedBoats.map((b) => [b.id, b.repairUntil]));
        return { ...plan, fleet: { ...plan.fleet, boats: plan.fleet.boats.map((b) => (hit.has(b.id) ? { ...b, repairUntil: hit.get(b.id) } : b)) } };
      });
      const boatsHit = Object.values(report.shelters).reduce((s, r) => s + r.damagedBoats.length + r.damagedVisitors, 0);
      if (report.total > 0) {
        // a storm's repair bill is not optional: it is paid even into the red
        city.budget -= report.total;
        if (typeof updateHUD === 'function') updateHUD();
        announceTyphoonShelterStorm(tsStormT('typhoonShelter.storm.newsDamage', `颱風過後：避風塘修復費 $${report.total.toLocaleString()}，${boatsHit} 艘船受損。`, { cost: report.total.toLocaleString(), boats: boatsHit }), 'warning');
      } else {
        announceTyphoonShelterStorm(tsStormT('typhoonShelter.storm.newsSafe', '颱風過後，各避風塘安然無恙，漁船陸續復航。'), 'success');
      }
    }
  });
  city.typhoonShelters = typeof rememberNormalizedCityStateObject === 'function'
    ? rememberNormalizedCityStateObject({ ...state, shelters: plans, storm })
    : { ...state, shelters: plans, storm };
  if (events.length && typeof typhoonShelterDom !== 'undefined' && typhoonShelterDom && !typhoonShelterDom.panel.hidden
    && typeof renderTyphoonShelterPanel === 'function') renderTyphoonShelterPanel();
}

// A toast, which the HUD also files in the city news (hud.js showToast).
function announceTyphoonShelterStorm(text, tone = 'info') {
  if (typeof showToast === 'function') showToast(text, tone);
  else if (typeof addCityNews === 'function') addCityNews(text);
}

const typhoonShelterStormApi = {
  TYPHOON_SHELTER_STORM,
  classifyTyphoonShelterWeather,
  predictTyphoonShelterPeakStage,
  typhoonShelterVisitorDemand,
  allocateTyphoonShelterVisitors,
  typhoonShelterVisitorState,
  createTyphoonShelterStorm,
  getTyphoonShelterStormPhase,
  isTyphoonShelterStormFreeze,
  stepTyphoonShelterStorm,
  settleTyphoonShelterStormDamage,
  normalizeTyphoonShelterStorm,
  getTyphoonShelterStorm,
  advanceTyphoonShelterStormHour,
};

if (typeof module !== 'undefined' && module.exports) module.exports = typhoonShelterStormApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, typhoonShelterStormApi);
