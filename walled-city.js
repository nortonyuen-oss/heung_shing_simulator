// 九龍城寨文化園區 (docs/campaign-p4-design.md §5, §14): the walled city rebuilt as a heritage park -
// a theme park, a history exhibition and a film base, where nobody lives. It draws visitors and sells
// them tickets, and costs its upkeep (SPECIAL_BUILDING_EFFECTS).
//
// Its visitors a month go by the tourism appeal, once a road reaches it; only half are let in while no
// fire station covers it (消防容量), and fewer while a film shoots (封街). The films: from its panel the
// player starts one, paying a subsidy; it shoots for WALLED_CITY_TUNING.filmMonths months, and at the
// wrap takes its box office - by the appeal then and the film's own luck - of which the city keeps a
// share. For some months after, the film draws tourists (the tourism appeal, council-effects.js).
//
// Saved: city.walledCity = { shooting: { titleIndex, startMonthIndex, endMonthIndex } | null, started,
// made, films: [{ titleIndex, monthIndex, gross, levy }] (12 at most), buzzUntil }.
const WALLED_CITY_TUNING = Object.freeze({
  footprint: 4,                // 4 x 4 for Norton's art (a park built on the 6 x 6 stand-in keeps its lot)
  baseVisitors: 6000,          // 〔暫定〕 a month at tourism appeal 0 ...
  visitorsPerAppeal: 200,      // ... and more for each point (appeal 60: 18,000)
  ticket: 0.25,                // $ the park's takings a visitor
  roadReach: 2,                // a road within this many tiles of the lot
  noFireCapacity: 0.5,         // the share let in while no fire station covers the lot
  shootCapacity: 0.7,          // and while a film shoots (the alleys closed)
  filmCost: 8000,              // 〔暫定〕 $ the subsidy a film
  filmMonths: 3,
  grossBase: 20000,            // 〔暫定〕 $ a film's box office at appeal 0 ...
  grossPerAppeal: 1200,        // ... and more for each point (appeal 70: 104,000 at even luck)
  luckMin: 0.6,                // each film's own luck, a flop to a hit
  luckMax: 1.4,
  levy: 0.2,                   // the city's share of the box office (venue and film fund)
  buzzMonths: 6,               // months a wrapped film draws tourists
  buzzAppeal: 3,               // tourism appeal while it does
  filmHistory: 12,
});

const walledCityT = (zhHant, en, ja) => Object.freeze({ zhHant, en, ja });

// The park's films, in order; after the last, 《城寨宇宙 N》.
const WALLED_CITY_FILMS = Object.freeze([
  walledCityT('九龍城寨之圍揪', 'Twilight of the Walled-In', '九龍城砦之囲揪'),
  walledCityT('寨城風雲', 'Storm Over the Walled Town', '寨城風雲'),
  walledCityT('龍津道追擊', 'Chase Down Lung Tsun Road', '龍津道チェイス'),
  walledCityT('光明街一號', 'No. 1 Kwong Ming Street', '光明街一号'),
  walledCityT('城寨大牌檔', 'The Walled City Food Stall', '城砦屋台'),
  walledCityT('天台上的寨', 'Rooftops of the Walled City', '屋上の城砦'),
  walledCityT('古大樂又再跑', 'Koo Dai-lok Runs Again', '古大楽また走る'),
  walledCityT('城寨宇宙：重生', 'Walled City Universe: Reborn', '城砦ユニバース：リボーン'),
]);

function walledCityClamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function walledCityUiT(key, fallback, vars = {}) {
  const fill = (text) => String(text).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (typeof t !== 'function') return fill(fallback);
  const out = t(key, vars);
  return out && out !== key ? out : fill(fallback);
}

function walledCitySay(text) {
  if (!text || typeof text !== 'object') return String(text || '');
  const lang = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : (typeof currentLanguage !== 'undefined' ? currentLanguage : 'zhHant');
  return text[lang] || text.zhHant || text.en || '';
}

// ── Pure ───────────────────────────────────────────────────────────────────────────────────────────

// A film's title by its place in the park's run (0 the first): { zhHant, en, ja }.
function getWalledCityFilmTitle(index) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  if (i < WALLED_CITY_FILMS.length) return WALLED_CITY_FILMS[i];
  const n = i - WALLED_CITY_FILMS.length + 2;
  return walledCityT(`城寨宇宙 ${n}`, `Walled City Universe ${n}`, `城砦ユニバース ${n}`);
}

// The park's visitors a month: by the appeal, none without a road, half without fire cover, fewer
// while a film shoots.
function getWalledCityVisitors(appeal, { road = true, fireCover = true, shooting = false } = {}, tuning = WALLED_CITY_TUNING) {
  if (!road) return 0;
  const base = tuning.baseVisitors + tuning.visitorsPerAppeal * walledCityClamp(appeal, 0, 100);
  return Math.round(base * (fireCover ? 1 : tuning.noFireCapacity) * (shooting ? tuning.shootCapacity : 1));
}

// A film's own luck, the same every time for the same film started the same month: luckMin-luckMax.
function getWalledCityFilmLuck(titleIndex, startMonthIndex, tuning = WALLED_CITY_TUNING) {
  let hash = 2166136261;
  String(`walled-city-film:${Math.floor(Number(titleIndex) || 0)}:${Math.floor(Number(startMonthIndex) || 0)}`).split('').forEach((ch) => {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return tuning.luckMin + ((hash >>> 0) / 4294967296) * (tuning.luckMax - tuning.luckMin);
}

// A film's box office and the city's share of it.
function computeWalledCityFilmGross(appeal, luck = 1, tuning = WALLED_CITY_TUNING) {
  const gross = Math.round((tuning.grossBase + tuning.grossPerAppeal * walledCityClamp(appeal, 0, 100)) * Math.max(0, Number(luck) || 0));
  return { gross, levy: Math.round(gross * tuning.levy) };
}

// The film tourism a month: the appeal while the last film's buzz lasts.
function getWalledCityBuzzAppeal(state, monthIndex, tuning = WALLED_CITY_TUNING) {
  return Number(state?.buzzUntil) > Number(monthIndex) ? tuning.buzzAppeal : 0;
}

function normalizeWalledCityState(raw, tuning = WALLED_CITY_TUNING) {
  const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));
  const shooting = raw?.shooting && typeof raw.shooting === 'object' && Number.isFinite(Number(raw.shooting.endMonthIndex))
    ? { titleIndex: whole(raw.shooting.titleIndex), startMonthIndex: Math.floor(Number(raw.shooting.startMonthIndex) || 0), endMonthIndex: Math.floor(Number(raw.shooting.endMonthIndex)) }
    : null;
  const films = (Array.isArray(raw?.films) ? raw.films : [])
    .filter((film) => film && typeof film === 'object')
    .map((film) => ({ titleIndex: whole(film.titleIndex), monthIndex: Math.floor(Number(film.monthIndex) || 0), gross: whole(film.gross), levy: whole(film.levy) }))
    .slice(-tuning.filmHistory);
  const made = Math.max(whole(raw?.made), films.length);
  return { shooting, started: Math.max(whole(raw?.started), made + (shooting ? 1 : 0)), made, films, buzzUntil: Math.floor(Number(raw?.buzzUntil) || 0) };
}

// ── In the game ────────────────────────────────────────────────────────────────────────────────────

function walledCityMonthIndex() {
  return typeof getCityMonthIndex === 'function' ? getCityMonthIndex() : 0;
}

function getWalledCityRecord() {
  return normalizeWalledCityState(typeof city === 'undefined' ? null : city.walledCity);
}

function saveWalledCityRecord(state) {
  if (typeof city !== 'undefined') city.walledCity = state;
  invalidateWalledCityState();
}

function findWalledCityPark() {
  if (typeof buildingData === 'undefined' || !buildingData) return null;
  const entry = Object.entries(buildingData).find(([, record]) => record?.type === 'walled_city_park');
  if (!entry) return null;
  const [id, record] = entry;
  const [row, col] = id.split(':').map(Number);
  return { id, row, col, rows: record.footprintRows || WALLED_CITY_TUNING.footprint, cols: record.footprintCols || WALLED_CITY_TUNING.footprint };
}

function walledCityLotGap(lot, row, col) {
  const gap = (value, from, size) => Math.max(from - value, value - (from + size - 1), 0);
  return Math.max(gap(row, lot.row, lot.rows), gap(col, lot.col, lot.cols));
}

function walledCityHasRoad(lot) {
  const reach = WALLED_CITY_TUNING.roadReach;
  const road = (r, c) => (typeof isRoadTile === 'function' ? isRoadTile(r, c) : mapData?.[r]?.[c] === ROAD);
  for (let r = lot.row - reach; r < lot.row + lot.rows + reach; r++) {
    for (let c = lot.col - reach; c < lot.col + lot.cols + reach; c++) {
      if (walledCityLotGap(lot, r, c) > 0 && (typeof isInsideMap !== 'function' || isInsideMap(r, c)) && road(r, c)) return true;
    }
  }
  return false;
}

function walledCityHasFireCover(lot) {
  if (typeof serviceMap === 'undefined' || !serviceMap) return false;
  for (let r = lot.row; r < lot.row + lot.rows; r++) {
    for (let c = lot.col; c < lot.col + lot.cols; c++) if (serviceMap.get(`${r}:${c}`)?.fire) return true;
  }
  return false;
}

let walledCityStateCache = null;

function invalidateWalledCityState() {
  walledCityStateCache = null;
}

// The park this pulse: { lot, road, fireCover, shooting, visitors, takings, buzz, started, made, films }.
function getWalledCityState() {
  const tick = typeof city === 'undefined' ? 0 : city.tick;
  const count = typeof buildingData === 'undefined' || !buildingData ? 0 : Object.keys(buildingData).length;
  const roads = typeof roadTileCount === 'number' ? roadTileCount : 0;
  if (walledCityStateCache && walledCityStateCache.tick === tick && walledCityStateCache.count === count
    && walledCityStateCache.roads === roads) return walledCityStateCache.state;
  const record = getWalledCityRecord();
  const lot = findWalledCityPark();
  const road = !!lot && walledCityHasRoad(lot);
  const fireCover = !!lot && walledCityHasFireCover(lot);
  const shooting = lot ? record.shooting : null;
  const appeal = typeof city === 'undefined' ? 0 : city.tourismAppeal;
  const visitors = lot ? getWalledCityVisitors(appeal, { road, fireCover, shooting: !!shooting }) : 0;
  const state = {
    lot, road, fireCover, shooting, visitors,
    takings: Math.round(visitors * WALLED_CITY_TUNING.ticket),
    buzz: getWalledCityBuzzAppeal(record, walledCityMonthIndex()),
    started: record.started, made: record.made, films: record.films,
  };
  walledCityStateCache = { tick, count, roads, state };
  return state;
}

// Its visitors (council-effects.js), its ticket takings (city-state.js computeLandmarkFinancials) and
// the film tourism (the tourism appeal).
function getWalledCityMonthlyVisitors() {
  return getWalledCityState().visitors;
}

function getWalledCityMonthlyTakings() {
  return getWalledCityState().takings;
}

function getWalledCityFilmBuzz() {
  return getWalledCityState().buzz;
}

// Why a film may not start now, as a sentence; null when it may.
function whyNotWalledCityFilm() {
  const state = getWalledCityState();
  if (!state.lot) return walledCityUiT('walledCity.noPark', '要先起九龍城寨文化園區。');
  if (state.shooting) return walledCityUiT('walledCity.busy', '園區拍緊戲，一次拍一部。');
  if (typeof city !== 'undefined' && Number(city.budget) < WALLED_CITY_TUNING.filmCost) return walledCityUiT('walledCity.noFunds', '庫房唔夠錢補貼拍戲。');
  return null;
}

// The player starts the next film at the park.
function startWalledCityFilm() {
  const why = whyNotWalledCityFilm();
  if (why) {
    if (typeof showToast === 'function') showToast(why, 'warning');
    return false;
  }
  const cost = WALLED_CITY_TUNING.filmCost;
  if (typeof spendBudget === 'function') { if (!spendBudget(cost)) return false; } else city.budget -= cost;
  const record = getWalledCityRecord();
  const start = walledCityMonthIndex();
  record.shooting = { titleIndex: record.started, startMonthIndex: start, endMonthIndex: start + WALLED_CITY_TUNING.filmMonths };
  record.started += 1;
  saveWalledCityRecord(record);
  if (typeof showToast === 'function') {
    showToast(walledCityUiT('walledCity.started', '🎬《{title}》喺城寨園區開鏡，拍 {months} 個月（補貼 ${cost}）', {
      title: walledCitySay(getWalledCityFilmTitle(record.shooting.titleIndex)), months: WALLED_CITY_TUNING.filmMonths, cost: cost.toLocaleString(),
    }), 'success');
  }
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  refreshWalledCityInspect();
  return true;
}

// The month ends: a film whose shoot is over wraps and takes its box office; one whose park is gone
// is dropped.
function settleWalledCityMonth() {
  if (typeof city === 'undefined') return;
  invalidateWalledCityState();
  const record = getWalledCityRecord();
  if (!record.shooting) return;
  const monthIndex = walledCityMonthIndex();
  if (!findWalledCityPark()) {
    record.shooting = null;
    saveWalledCityRecord(record);
    return;
  }
  if (monthIndex < record.shooting.endMonthIndex) return;
  const { titleIndex, startMonthIndex } = record.shooting;
  const { gross, levy } = computeWalledCityFilmGross(city.tourismAppeal, getWalledCityFilmLuck(titleIndex, startMonthIndex));
  city.budget = (Number(city.budget) || 0) + levy;
  record.films = [...record.films, { titleIndex, monthIndex, gross, levy }].slice(-WALLED_CITY_TUNING.filmHistory);
  record.made += 1;
  record.shooting = null;
  record.buzzUntil = monthIndex + WALLED_CITY_TUNING.buzzMonths;
  saveWalledCityRecord(record);
  if (typeof showToast === 'function') {
    showToast(walledCityUiT('walledCity.wrapped', '🎬《{title}》殺青上映，票房 ${gross}，政府分帳 ${levy}', {
      title: walledCitySay(getWalledCityFilmTitle(titleIndex)), gross: gross.toLocaleString(), levy: levy.toLocaleString(),
    }), 'success');
  }
}

if (typeof onGameClockEvent === 'function') onGameClockEvent('gameclock:month', settleWalledCityMonth);

function refreshWalledCityInspect() {
  if (typeof showInspectPanel === 'function' && typeof activeScene !== 'undefined' && activeScene && typeof lastInspectTile !== 'undefined' && lastInspectTile) {
    showInspectPanel(activeScene, lastInspectTile.row, lastInspectTile.col);
  }
}

function buildWalledCityInspectHtml() {
  const state = getWalledCityState();
  if (!state.lot) return '';
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString();
  const monthIndex = walledCityMonthIndex();
  const rows = [];
  if (!state.road) rows.push(`<div class="insp-row insp-warn">${walledCityUiT('walledCity.noRoad', '未有路接到園區：冇遊客入到嚟。')}</div>`);
  else rows.push(`<div class="insp-row insp-ok">${walledCityUiT('walledCity.visitors', '每月遊客 {visitors} 人 · 門票收入 ${takings}', { visitors: fmt(state.visitors), takings: fmt(state.takings) })}</div>`);
  rows.push(`<div class="insp-row ${state.fireCover ? 'insp-muted' : 'insp-warn'}">${state.fireCover
    ? walledCityUiT('walledCity.fireOk', '🚒 有消防局覆蓋，全面開放')
    : walledCityUiT('walledCity.fireNo', '🚒 未有消防局覆蓋：消防處只准一半人流')}</div>`);
  if (state.shooting) {
    rows.push(`<div class="insp-row insp-ok">${walledCityUiT('walledCity.shooting', '🎬 拍緊《{title}》，仲有 {months} 個月殺青（封街，遊客少三成）', {
      title: walledCitySay(getWalledCityFilmTitle(state.shooting.titleIndex)), months: Math.max(1, state.shooting.endMonthIndex - monthIndex),
    })}</div>`);
  }
  rows.push(`<div class="insp-row insp-muted">${walledCityUiT('walledCity.made', '拍完 {made} 部戲', { made: state.made })}${state.buzz
    ? ` · ${walledCityUiT('walledCity.buzz', '電影熱潮：旅遊吸引力 +{appeal}', { appeal: state.buzz })}` : ''}</div>`);
  const last = state.films.at(-1);
  if (last) {
    rows.push(`<div class="insp-row insp-muted">${walledCityUiT('walledCity.lastFilm', '上一部《{title}》票房 ${gross}，政府分帳 ${levy}', {
      title: walledCitySay(getWalledCityFilmTitle(last.titleIndex)), gross: fmt(last.gross), levy: fmt(last.levy),
    })}</div>`);
  }
  const blocked = whyNotWalledCityFilm();
  if (blocked && !state.shooting) rows.push(`<div class="insp-row insp-warn">${blocked}</div>`);
  rows.push(`<button class="insp-action-btn" type="button" onclick="startWalledCityFilm()" ${blocked ? 'disabled' : ''}>${walledCityUiT('walledCity.start', '🎬 開拍新戲（補貼 ${cost}，拍 {months} 個月）', {
    cost: fmt(WALLED_CITY_TUNING.filmCost), months: WALLED_CITY_TUNING.filmMonths,
  })}</button>`);
  return `<div class="insp-section">${rows.join('')}</div>`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  WALLED_CITY_TUNING, WALLED_CITY_FILMS, getWalledCityFilmTitle, getWalledCityVisitors, getWalledCityFilmLuck,
  computeWalledCityFilmGross, getWalledCityBuzzAppeal, normalizeWalledCityState,
};
