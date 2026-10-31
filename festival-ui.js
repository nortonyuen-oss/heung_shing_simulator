// 節慶年曆 window and the festival notices (docs/festival-dlc-design.md §1.4, §3.3).
//
// The window (Settings → 節慶年曆…) lists this year's festivals: the month each falls in, its
// switch and, for a government one, the funding tier and what it costs. A quiet festival (六四) is
// never listed. Notices: when a festival reaches its peak, once a year, a toast with 去睇 that takes
// the camera to it - never forced slow-motion (Norton: once a year every year gets tiresome).

const FESTIVAL_DIALOG_ID = 'festival-calendar-dialog';
const FESTIVAL_NOTICE_MS = 9000;
const festivalNoticesShown = new Set();

function festivalName(id) {
  return t(`festival.name.${id}`);
}

function escapeFestivalHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// ── Notices ───────────────────────────────────────────────────────────────────

// A toast with a 去睇 button (showToast's toasts carry text only and let clicks through).
function showFestivalNotice(message, onGo) {
  if (typeof isAttractModeActive === 'function' && isAttractModeActive()) return;
  const container = document.getElementById('toast-container');
  if (!container) return;
  if (typeof addCityNews === 'function') addCityNews(message);
  const toast = document.createElement('div');
  toast.className = 'toast toast-info festival-notice';
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);
  if (onGo) {
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'festival-notice-go';
    go.textContent = t('festival.notice.go');
    go.addEventListener('click', () => { onGo(); toast.remove(); });
    toast.appendChild(go);
  }
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fade');
    setTimeout(() => toast.remove(), 600);
  }, FESTIVAL_NOTICE_MS);
}

// The tile a placement stands on (a park's anchor tile for one inside a park).
function getFestivalPlacementTile(placement) {
  if (placement.mode === 'tile') return [placement.row, placement.col];
  const record = typeof buildingData !== 'undefined' ? buildingData[placement.buildingId] : null;
  const [row, col] = String(placement.buildingId).split(/[,:]/).map(Number);
  const cols = record?.footprintCols || 1;
  const rows = record?.footprintRows || 1;
  return Number.isFinite(row) && Number.isFinite(col) ? [row + (rows - 1) / 2, col + (cols - 1) / 2] : null;
}

// Once a year per festival, when its peak comes and it has something to see.
function maybeShowFestivalNotices(scene, active, placements) {
  active.forEach(({ id, phase }) => {
    if (phase !== 'peak' || isQuietFestival(id)) return;
    const key = `${city.name}|${id}|${city.year}`;
    if (festivalNoticesShown.has(key)) return;
    const mine = placements.filter((p) => p.festival === id);
    if (!mine.length) return;
    festivalNoticesShown.add(key);
    const tile = getFestivalPlacementTile(mine[0]);
    showFestivalNotice(t(`festival.notice.${id}`), tile && typeof centerCameraOnTile === 'function'
      ? () => centerCameraOnTile(scene, Math.round(tile[0]), Math.round(tile[1])) : null);
  });
}

// Called once a year when a government festival's month is settled (festival-sprites.js).
function onFestivalSettled(id, entry) {
  if (isQuietFestival(id) || typeof showToast !== 'function') return;
  if (entry.outcome === 'skipped' && getFestivalTier(id) !== 'skip') {
    showToast(t('festival.toast.unaffordable', { name: festivalName(id) }), 'warning');
  } else if (entry.outcome === 'noVenue') {
    showToast(t(`festival.toast.noVenue.${id}`), 'info');
  }
  if (document.getElementById(FESTIVAL_DIALOG_ID)?.style.display === 'flex') renderFestivalCalendar();
}

// ── 節慶年曆 window ────────────────────────────────────────────────────────────

function ensureFestivalCalendarDialog() {
  let dialog = document.getElementById(FESTIVAL_DIALOG_ID);
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = FESTIVAL_DIALOG_ID;
  dialog.className = 'sim-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.innerHTML = `
    <div class="dialog-overlay"></div>
    <div class="dialog-box" style="max-width:640px">
      <div class="dialog-title-bar">
        <span data-festival-title></span>
        <button class="dialog-close-btn" type="button" data-festival-close>✕</button>
      </div>
      <div class="dialog-body" data-festival-body></div>
    </div>`;
  document.body.appendChild(dialog);
  const close = () => { dialog.style.display = 'none'; };
  dialog.querySelector('[data-festival-close]').addEventListener('click', close);
  dialog.querySelector('.dialog-overlay').addEventListener('click', close);
  dialog.addEventListener('change', (event) => {
    const el = event.target;
    if (el.matches('[data-festival-master]')) setFestivalsEnabled(el.checked);
    else if (el.matches('[data-festival-enabled]')) setFestivalEnabled(el.dataset.festivalEnabled, el.checked);
    else if (el.matches('[data-festival-tier]')) setFestivalTier(el.dataset.festivalTier, el.value);
    else return;
    if (typeof updateSettingsMenu === 'function') updateSettingsMenu();
    renderFestivalCalendar();
  });
  return dialog;
}

function getFestivalMonthLabel(id, year) {
  if (FESTIVAL_DEFINITIONS_BY_ID[id]?.kind === 'random') return t('festival.calendar.random');
  const month = getFestivalMonth(id, year);
  return month ? t('festival.calendar.month', { month }) : '—';
}

function getFestivalStatusLabel(id, year) {
  if (FESTIVAL_DEFINITIONS_BY_ID[id]?.kind !== 'random' && !FESTIVAL_PROGRAMMES[id]) return t('festival.calendar.comingSoon');
  const entry = getFestivalHistoryEntry(id, year);
  return entry ? t(`festival.outcome.${entry.outcome}`) : '';
}

function renderFestivalCalendar() {
  const dialog = ensureFestivalCalendarDialog();
  const year = Math.trunc(Number(city?.year) || 0);
  const population = Number(city?.population) || 0;
  const masterOn = areFestivalsEnabled();
  dialog.querySelector('[data-festival-title]').textContent = t('festival.calendar.title', { year });
  const rows = FESTIVAL_SWITCHABLE_IDS.map((id) => {
    const on = isFestivalEnabled(id);
    const government = isGovernmentFestival(id);
    const tier = getFestivalTier(id);
    const tierCell = government
      ? `<select data-festival-tier="${id}" ${masterOn ? '' : 'disabled'}>${FESTIVAL_TIERS.map((value) => {
        const cost = getFestivalCost(id, value, population);
        const label = t(`festival.tier.${value}`) + (cost ? ` (${t('festival.calendar.cost', { cost: cost.toLocaleString() })})` : '');
        return `<option value="${value}" ${value === tier ? 'selected' : ''}>${escapeFestivalHtml(label)}</option>`;
      }).join('')}</select>`
      : `<span class="festival-calendar-muted">${FESTIVAL_DEFINITIONS_BY_ID[id]?.organiser === 'community' ? escapeFestivalHtml(t('festival.calendar.community')) : '—'}</span>`;
    return `<tr>
      <td>${escapeFestivalHtml(festivalName(id))}</td>
      <td>${escapeFestivalHtml(getFestivalMonthLabel(id, year))}</td>
      <td><input type="checkbox" data-festival-enabled="${id}" ${getCityFestivalState()?.festivals?.[id]?.enabled !== false ? 'checked' : ''} ${masterOn ? '' : 'disabled'} aria-label="${escapeFestivalHtml(festivalName(id))}"></td>
      <td>${tierCell}</td>
      <td class="festival-calendar-muted">${escapeFestivalHtml(on ? getFestivalStatusLabel(id, year) : t('festival.calendar.off'))}</td>
    </tr>`;
  }).join('');
  dialog.querySelector('[data-festival-body]').innerHTML = `
    <label class="festival-calendar-master">
      <input type="checkbox" data-festival-master ${masterOn ? 'checked' : ''}>
      <span>${escapeFestivalHtml(t('menu.festivals'))}</span>
    </label>
    <table class="festival-calendar-table">
      <thead><tr>
        <th>${escapeFestivalHtml(t('festival.calendar.festival'))}</th>
        <th>${escapeFestivalHtml(t('festival.calendar.when'))}</th>
        <th>${escapeFestivalHtml(t('festival.calendar.enabled'))}</th>
        <th>${escapeFestivalHtml(t('festival.calendar.tier'))}</th>
        <th>${escapeFestivalHtml(t('festival.calendar.thisYear'))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="festival-calendar-muted">${escapeFestivalHtml(t('festival.calendar.hint'))}</p>`;
}

function openFestivalCalendar() {
  renderFestivalCalendar();
  ensureFestivalCalendarDialog().style.display = 'flex';
}

// ── Test mode: 啟動 event ────────────────────────────────────────────────────
// Jump straight to a festival: its month this year at a given hour, a dry night, the festival on.
// Settled as held beforehand (cost 0, no effects), so a test never charges the treasury; the clock
// is left paused, and the camera goes to the festival once its things are laid out.
// The street-lion rehearsal runs at the slow clock speed so its march and drums can be watched.
// [festival, minute (or 'after'), label, what the camera looks at (a part id, or a regexp of one)]
const FESTIVAL_EVENT_TESTS = Object.freeze([
  ['christmas', 20 * 60, '聖誕夜', 'christmasTree'],
  ['lunarNewYear', 20 * 60, '年宵（晚）', 'lnyGate'],
  ['lunarNewYear', 'after', '開年舞獅', /lnyLion/],
  ['june4', 21 * 60, '六四燭光', 'june4Pillar'],
  ['yulan', 8 * 60, '盂蘭（派米）', 'yulanStage'],
  ['yulan', 20 * 60 + 30, '盂蘭（燒街衣）', /yulanBurner/],
  ['yulan', 22 * 60 + 40, '盂蘭（阿飄）', /yulanGhost/],
  ['yulan', 22 * 60 + 40, '盂蘭（郊外阿飄）', 'outskirts'],
  ['yulan', 23 * 60 + 45, '盂蘭（燒紙紮）', 'yulanHorse'],
  ['midAutumn', 20 * 60 + 30, '中秋（維園花燈）', 'maJadeRabbitMoon'],
  ['midAutumn', 21 * 60, '中秋（舞火龍）', /maFireDragon/],
  ['midAutumn', 40, '中秋（煲蠟、警員）', 'maCandleKids'],
]);

function startFestivalEventTest(id, minute, scene = typeof activeScene !== 'undefined' ? activeScene : null, focus = null) {
  if (!scene || typeof city === 'undefined') return false;
  if (typeof isVisualRouteCalibrationTestModeEnabled === 'function' && !isVisualRouteCalibrationTestModeEnabled()) return false;
  const after = minute === 'after';
  const streetLions = id === 'lunarNewYear' && (after || focus instanceof RegExp && focus.test('lnyLionRed'));
  // a jump may land in another festival's month too (June: 六四 and 端午): whatever settles in it is
  // given back once the camera has arrived, so a test never spends the city's money
  const budget = Number(city.budget) || 0;
  const month = getFestivalMonth(id, city.year);
  if (!month) return false;
  // 開年舞獅 is the morning of the month after
  city.month = after ? Math.min(12, month + 1) : month;
  const m = after ? 8 * 60 : minute;
  city.timeOfDayMinutes = m;
  if (typeof getEnvironmentMinutes === 'function') city.environmentMinutes = Math.floor(getEnvironmentMinutes() / 1440) * 1440 + ((m - 6 * 60 + 1440) % 1440);
  if (typeof resetGameClockAccumulator === 'function') resetGameClockAccumulator();
  city.weather = { ...city.weather, condition: 'clear', typhoonStage: 'none', rainWarning: 'none', rainfall: 0 };
  const state = getCityFestivalState();
  state.enabled = true;
  if (!isQuietFestival(id)) setFestivalEnabled(id, true);
  if (isGovernmentFestival(id)) {
    if (getFestivalTier(id) === 'skip') setFestivalTier(id, 'standard');
    if (getFestivalHistoryEntry(id, city.year)?.outcome !== 'held') recordFestivalHistory({ id, year: city.year, outcome: 'held', cost: 0 });
  }
  if (typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') setGameSpeed(GAME_SPEEDS.PAUSED);
  if (streetLions && typeof getLionDanceLayoutExtras === 'function') {
    const camera = scene.cameras.main;
    camera.setZoom(Math.max(2.4, camera.zoom));
    const extras = getLionDanceLayoutExtras(scene);
    if (!extras.lionRoutes.length) {
      const route = scene.lionDanceRouteMap?.routes?.[0];
      const point = route && getLionDanceWorldPoint(scene, getLionDanceRoutePoint(route, route.lengthM / 2));
      if (point) camera.centerOn(point.x, point.y - 10);
    }
    if (typeof setGameSpeed === 'function' && typeof GAME_SPEEDS !== 'undefined') setGameSpeed(GAME_SPEEDS.SLOW);
  }
  // lay it out now rather than at the next two-second pass
  scene.festivalActiveKey = '';
  scene.festivalNextUpdateAt = 0;
  if (typeof updateHUD === 'function') updateHUD();
  if (typeof updateTopbarGameTime === 'function') updateTopbarGameTime();
  let tries = 0;
  const wanted = (p) => p.festival === id && (!focus || (focus instanceof RegExp ? focus.test(p.partId) : p.partId === focus));
  // a street thing may be hidden behind a tall building nearer the viewer: the ones no nearer
  // building's picture covers first (test only: a walk over the buildings per candidate)
  const buildings = [...new Set(scene.buildingSprites?.values() || [])];
  const open = (sprite) => !buildings.some((b) => b.depth > sprite.depth && b.visible !== false
    && typeof b.getBounds === 'function' && b.getBounds().contains(sprite.x, sprite.y - 4));
  // 郊外阿飄: they walk on open land, not as festival placements - go to some (festival-yulan.js)
  if (focus === 'outskirts') {
    setTimeout(() => {
      if (typeof getYulanLayoutExtras === 'function') getYulanLayoutExtras(scene, {});
      const rural = (typeof yulanMapCache !== 'undefined' && yulanMapCache?.rural || []).filter((t) => t.open !== false);
      const t = rural[Math.floor(rural.length / 2)];
      city.budget = budget;
      if (!t) { if (typeof showToast === 'function') showToast('【測試】搵唔到郊外空地', 'warning'); return; }
      const camera = scene.cameras.main;
      camera.setZoom(2.2);
      centerCameraOnTile(scene, t.row, t.col);
    }, 300);
    return true;
  }
  const look = () => {
    // the sprite itself, once drawn (a point on a building's art is not its tile)
    const candidates = [...(scene.festivalSprites?.values() || [])].filter((x) => x.festivalDrawable && wanted(x.festivalPlacement));
    const sprite = candidates.slice(0, 80).find(open) || candidates[0];
    if (sprite) {
      city.budget = budget;
      const camera = scene.cameras.main;
      camera.setZoom(2.4);
      camera.centerOn(sprite.x, sprite.y - sprite.displayHeight / 2);
      scene.terrainViewportCacheKey = null;
    } else if (++tries < 24) setTimeout(look, 250);
    else if ((city.budget = budget) && typeof showToast === 'function') showToast(`【測試】${festivalName(id) || id}：搵唔到場地（維園、球場、海濱步道或住宅街）`, 'warning');
  };
  setTimeout(look, 300);
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('languagechange', () => {
    if (document.getElementById(FESTIVAL_DIALOG_ID)?.style.display === 'flex') renderFestivalCalendar();
  });
}
