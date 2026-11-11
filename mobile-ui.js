// Opt-in touch shell; the desktop DOM stays in place for live statistics and profile switching.
let mobileBuildSession = null;
let mobileUi = null;
let mobilePage = null;
let mobileCategory = null;
let mobileMode = 'inspect';
let mobileOwner = 0;
let mobileWorldMap = null;
let mobileNudgeOpen = true;
const mobileText = (key, values) => t(`mobile.${key}`, values);
const mobileEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function mobileIsPortrait() { return window.matchMedia('(orientation: portrait)').matches; }
function mobileGameVisible() {
  return typeof gameReady !== 'undefined' && gameReady && activeScene
    && getComputedStyle(document.getElementById('landing-screen')).display === 'none';
}
function mobileModalOpen() {
  return [...document.querySelectorAll('.sim-dialog')].some((el) => getComputedStyle(el).display !== 'none');
}
function mobileToolLabel(tool) {
  if (tool === 'inspect' || tool === 'bulldoze') return mobileText(tool);
  const button = document.querySelector(`#tool-menu [data-tool="${tool}"]`);
  const label = button?.querySelector('.tool-row-name, .tool-label, [data-i18n]');
  return label?.textContent.trim() || button?.getAttribute('title') || tool;
}
function mobileToolIcon(tool) {
  return document.querySelector(`#tool-menu [data-tool="${tool}"] .tool-row-icon`)?.textContent || (tool.startsWith('zone-') ? '🏘️' : tool === 'road' ? '🛣️' : '🏗️');
}
function mobileCancelBuild() {
  mobileBuildSession?.cancel();
  clearTouchPlacementPreview(typeof activeScene === 'undefined' ? null : activeScene);
}
function mobileInvalidateWorld() {
  mobileOwner++;
  mobileWorldMap = typeof mapData === 'undefined' ? null : mapData;
  mobileCancelBuild();
}
function mobileSelectTool(tool) {
  if (!TOUCH_PHASE_B_TOOLS.includes(tool)) return;
  mobileCancelBuild();
  mobileMode = tool;
  if (typeof isTransportModeActive !== 'undefined' && isTransportModeActive) setTransportModeActive(false);
  // The desktop selection has no ownership of the draft; this merely keeps profile switching tidy.
  selectedTool = tool;
  mobileClosePanel();
  document.getElementById('inspect-panel').style.display = 'none';
  if (tool === 'inspect') return;
  mobileBuildSession.begin(tool, getTouchToolOptions(tool), mobileOwner);
}

function handleMobileMapTap({ x, y }) {
  if (!isTouchUiProfile() || !mobileGameVisible() || mobileModalOpen()) return;
  if (mobileWorldMap !== mapData) mobileInvalidateWorld();
  const world = mapCameraWorldPoint(activeScene.cameras.main, x, y);
  const tile = screenPointToTile(activeScene, world.x, world.y);
  if (!tile) return;
  if (mobileMode === 'inspect') {
    mobileCancelBuild();
    lastInspectTile = { ...tile };
    drawInspectHighlight(activeScene, tile.row, tile.col);
    showInspectPanel(activeScene, tile.row, tile.col);
    return;
  }
  const state = mobileBuildSession.getState();
  if (!state) return; // choosing a tool is explicit; dismissing a draft never arms a new one
  const range = state.tool === 'road' || state.tool.startsWith('zone-') || (state.tool === 'bulldoze' && state.options.range);
  mobileBuildSession.select(tile, range);
}

function mobileRenderDraft(draft) {
  if (!mobileUi) return;
  const building = !!draft;
  mobileUi.classList.toggle('is-building', building);
  document.getElementById('mobile-build-controls').hidden = !building;
  if (!draft) { clearTouchPlacementPreview(typeof activeScene === 'undefined' ? null : activeScene); return; }
  const plan = draft.plan;
  document.getElementById('mobile-build-name').textContent = mobileToolLabel(draft.tool);
  const status = document.getElementById('mobile-build-status');
  status.textContent = plan?.reason || (plan?.summary ? mobileText('summary', plan.summary)
    : plan ? mobileText('valid', { count: plan.tiles.length, skipped: plan.skipped || 0 }) : mobileText('tap'));
  status.style.color = plan && !plan.ok ? '#8d1f1e' : '#374451';
  document.getElementById('mobile-build-cost').textContent = plan ? formatMoney(plan.cost) : '—';
  const confirm = document.getElementById('mobile-confirm');
  confirm.textContent = mobileText(draft.tool === 'bulldoze' ? 'demolish' : 'confirm');
  confirm.className = draft.tool === 'bulldoze' ? 'm-danger' : 'm-primary';
  confirm.disabled = !building || !draft.ready || !plan?.ok;
  document.getElementById('mobile-build-step').textContent = mobileText(!draft.start ? 'tapStart' : !draft.ready ? 'tapEnd' : 'ready');
  const isZone = draft.tool.startsWith('zone-');
  document.getElementById('mobile-density').hidden = !isZone;
  document.getElementById('mobile-bulldoze-options').hidden = draft.tool !== 'bulldoze';
  document.getElementById('mobile-demolition-warning').hidden = draft.tool !== 'bulldoze';
  document.querySelectorAll('[data-mobile-density]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.mobileDensity) === draft.options.density));
    button.disabled = Number(button.dataset.mobileDensity) > getDistrictMaxZoneDensity();
  });
  document.querySelectorAll('[data-mobile-range]').forEach((button) => {
    button.setAttribute('aria-pressed', String((button.dataset.mobileRange === 'true') === draft.options.range));
  });
  document.getElementById('mobile-nudge').hidden = !draft.start;
  document.getElementById('mobile-nudge-pad').hidden = !mobileNudgeOpen;
  const toggle = document.getElementById('mobile-nudge-toggle');
  toggle.textContent = mobileText(mobileNudgeOpen ? 'hideNudge' : 'showNudge');
  toggle.setAttribute('aria-expanded', String(mobileNudgeOpen));
  const endToggle = document.getElementById('mobile-end-toggle');
  endToggle.textContent = draft.activeEnd === 'end' ? 'B' : 'A';
  endToggle.setAttribute('aria-label', mobileText(draft.activeEnd === 'end' ? 'endB' : 'endA'));
  endToggle.hidden = !(draft.tool === 'road' || isZone || (draft.tool === 'bulldoze' && draft.options.range));
  if (activeScene) drawTouchPlacementPreview(activeScene, draft);
}

function mobileClosePanel() {
  mobilePage = null;
  document.getElementById('mobile-panel').hidden = true;
  mobileUi?.classList.remove('nav-open');
  document.getElementById('mobile-nav-toggle')?.setAttribute('aria-expanded', 'false');
}
function mobileOpenPage(page, category = null) {
  mobileCancelBuild();
  activeScene?.mapTouchInput?.controller.cancelAll('panel');
  document.getElementById('inspect-panel').style.display = 'none';
  mobilePage = page;
  mobileCategory = category;
  mobileUi.classList.remove('nav-open');
  document.getElementById('mobile-nav-toggle').setAttribute('aria-expanded', 'false');
  document.getElementById('mobile-nav-toggle').textContent = `${mobileText(page)} ⌃`;
  mobileRenderPage();
}
function mobileRow(action, title, detail = '', icon = '', tail = '') {
  return `<button type="button" class="m-row" ${action}><span aria-hidden="true">${icon}</span><span class="m-row-text"><strong>${mobileEscape(title)}</strong>${detail ? `<small>${mobileEscape(detail)}</small>` : ''}</span><span class="m-cost">${mobileEscape(tail)}</span></button>`;
}
function mobileRenderPage() {
  if (!mobilePage) return;
  const panel = document.getElementById('mobile-panel');
  const body = document.getElementById('mobile-panel-body');
  panel.hidden = false;
  document.getElementById('mobile-panel-title').textContent = mobileCategory
    ? document.querySelector(`[data-tool-category="${mobileCategory}"] .tool-category-title`)?.textContent || mobileText(mobilePage)
    : mobileText(mobilePage === 'manage' ? 'overview' : mobilePage);
  const back = document.getElementById('mobile-panel-back');
  back.hidden = !mobileCategory;
  document.querySelectorAll('[data-mobile-page]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mobilePage === mobilePage)));
  if (mobilePage === 'build') {
    const categories = [...document.querySelectorAll('#tool-menu [data-tool-category]')]
      .filter((button) => ['roads', 'zones', 'power', 'services', 'parks', 'landmarks', 'terrain', 'marine'].includes(button.dataset.toolCategory));
    const intro = `<div class="m-shortcuts"><button type="button" data-mobile-tool="inspect">🔍 ${mobileText('inspect')}</button><button type="button" data-mobile-tool="bulldoze">🚜 ${mobileText('bulldoze')}</button></div>`;
    if (!mobileCategory) {
      body.innerHTML = intro + `<div class="m-categories">${categories.map((button) => `<button type="button" class="m-category" data-mobile-category="${button.dataset.toolCategory}"><span aria-hidden="true">${button.querySelector('.tool-category-icon').textContent}</span><strong>${mobileEscape(button.querySelector('.tool-category-title').textContent)}</strong></button>`).join('')}</div><p>${mobileText('toolInfo')}</p>`;
    } else {
      const tools = TOUCH_PHASE_B_TOOLS.filter((tool) => tool !== 'inspect' && tool !== 'bulldoze' && (document.querySelector(`#tool-menu [data-tool="${tool}"]`)?.closest('[data-tool-panel]')?.dataset.toolPanel || getToolCategoryForTool(tool)) === mobileCategory);
      body.innerHTML = intro + `<div class="m-list">${tools.map((tool) => {
        const type = TOUCH_BUILDING_TYPES[tool];
        const lock = type ? getInfraPlacementLock(type) : { unlocked: true };
        const detail = lock.unlocked ? '' : describeSpecialBuildingLockReason(lock);
        const cost = type ? formatMoney(INFRA_COSTS[type]) : tool === 'road' ? `${formatMoney(COST_ROAD)} / ▧` : '';
        return mobileRow(`data-mobile-tool="${tool}" ${!lock.unlocked ? 'aria-disabled="true"' : ''}`, mobileToolLabel(tool), detail, mobileToolIcon(tool), lock.unlocked ? cost : '🔒');
      }).join('')}</div><p>${mobileText('futureTools')}</p>`;
    }
  } else if (mobilePage === 'more') {
    const rows = [['save', 'save', '💾'], ['save-as', 'saveAs', '💾'], ['load-game', 'load', '📂'], ['export-save', 'export', '↗'], ['import-save', 'import', '↙'], ['main-menu', 'mainMenu', '🏠']];
    body.innerHTML = `<div class="m-list">${rows.map(([action, key, icon]) => mobileRow(`data-mobile-menu="${action}"`, mobileText(key), '', icon)).join('')}${mobileRow('data-mobile-action="rename"', mobileText('rename'), '', '✏️')}</div>
      <label>${mobileText('language')} <select data-mobile-language>${Object.entries(LANGUAGES).map(([key, label]) => `<option value="${key}" ${getCurrentLanguage() === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>${mobileText('profile')} ${mobileProfileSelect()}</label><p>${mobileText('beta')}</p>`;
  } else if (mobilePage === 'manage') {
    body.innerHTML = `<h3>${mobileText('demand')}</h3><div id="mobile-demand"></div><h3>${mobileText('indices')}</h3><div id="mobile-indices"></div><p>${mobileText('phaseC')}</p>`;
    mobileUpdateOverview();
  } else body.innerHTML = `<p>${mobileText('phaseC')}</p>`;
  panel.querySelector('button:not([hidden])')?.focus({ preventScroll: true });
}

function mobileProfileSelect() {
  return `<select data-mobile-profile aria-label="${mobileText('profile')}">${['auto', 'desktop', 'touch'].map((mode) => `<option value="${mode}" ${getUiProfilePreference() === mode ? 'selected' : ''}>${mobileText(mode)}</option>`).join('')}</select>`;
}
function mobileUpdateOverview() {
  const demand = document.getElementById('mobile-demand');
  if (!demand) return;
  demand.innerHTML = ['R', 'C', 'I'].map((key) => `<div class="m-overview-row"><span>${key}</span><strong>${Math.round((city[`demand${key}`] || 0) * 100)}%</strong></div>`).join('');
  document.getElementById('mobile-indices').innerHTML = ['livability', 'economy', 'environment', 'transport', 'overall'].map((key) => `<div class="m-overview-row"><span>${mobileEscape(t(`status.index.${key}`))}</span><strong>${mobileEscape(document.getElementById(`hud-index-${key}`)?.textContent || '0')}</strong></div>`).join('');
}

function setupMobileUi() {
  mobileUi = document.createElement('div');
  mobileUi.id = 'mobile-ui';
  mobileUi.hidden = true;
  mobileUi.innerHTML = `
    <header class="m-top">
      <span class="m-city" id="mobile-city-name"></span>
      <button type="button" class="m-funds m-kpi" data-mobile-page="manage"><small data-mobile-text="funds"></small><strong id="mobile-funds"></strong></button>
      <span class="m-kpi"><small data-mobile-text="population"></small><strong id="mobile-population"></strong></span>
      <span class="m-kpi m-date"><small id="mobile-date"></small><strong id="mobile-weather"></strong></span>
      <button type="button" id="mobile-pause" data-mobile-aria="pause">⏸</button>
      <select id="mobile-speed" data-i18n-aria="topbar.simSpeed"><option value="0.15">1×</option><option value="0.5">2×</option><option value="1">4×</option><option value="2">8×</option></select>
    </header>
    <section class="m-panel" id="mobile-panel" hidden aria-labelledby="mobile-panel-title">
      <header class="m-panel-head"><button type="button" class="m-icon" id="mobile-panel-back" data-mobile-aria="back">‹</button><h2 id="mobile-panel-title"></h2><button type="button" class="m-icon" id="mobile-panel-close" data-mobile-aria="close">✕</button></header>
      <div class="m-panel-body" id="mobile-panel-body"></div>
    </section>
    <button type="button" class="m-nav-handle" id="mobile-nav-toggle" aria-controls="mobile-nav" aria-expanded="false"></button>
    <nav class="m-nav" id="mobile-nav" aria-label="${mobileText('menu')}">${[['build','🏗️'],['transport','🚌'],['layers','🗺️'],['manage','🏛️'],['more','☰']].map(([page, icon]) => `<button type="button" data-mobile-page="${page}" aria-pressed="false"><span aria-hidden="true">${icon}</span><span data-mobile-text="${page}"></span></button>`).join('')}</nav>
    <div id="mobile-build-controls" hidden>
      <div class="m-nudge" id="mobile-nudge" hidden>
        <button type="button" class="m-nudge-toggle" id="mobile-nudge-toggle" aria-controls="mobile-nudge-pad" aria-expanded="true"></button>
        <div class="m-nudge-pad" id="mobile-nudge-pad" role="group" data-mobile-aria="nudge">
          ${[['nw','↖'],['ne','↗'],['sw','↙'],['se','↘']].map(([key, arrow]) => `<button type="button" data-nudge="${key}" data-mobile-aria="${key}">${arrow}</button>`).join('')}
          <button type="button" class="m-end-toggle" id="mobile-end-toggle"></button>
        </div>
      </div>
      <div class="m-context">
        <span id="mobile-density" hidden>${[[DENSITY_LOW,'low'],[DENSITY_MED,'medium'],[DENSITY_HIGH,'high']].map(([value,key]) => `<button type="button" data-mobile-density="${value}" aria-pressed="false" data-mobile-text="${key}"></button>`).join('')}</span>
        <span id="mobile-bulldoze-options" hidden><button type="button" data-mobile-range="false" data-mobile-text="single"></button><button type="button" data-mobile-range="true" data-mobile-text="range"></button></span>
        <span id="mobile-demolition-warning" hidden data-mobile-text="irreversible" style="font-size:12px;color:#8d1f1e"></span>
        <span id="mobile-build-step"></span>
      </div>
      <footer class="m-confirm"><div class="m-confirm-description"><strong id="mobile-build-name"></strong><span id="mobile-build-status" role="status" aria-live="polite"></span></div><span id="mobile-build-cost"></span><button type="button" id="mobile-cancel" data-mobile-text="cancel"></button><button type="button" id="mobile-confirm" class="m-primary" disabled></button></footer>
    </div>`;
  document.body.appendChild(mobileUi);
  mobileBuildSession = createBuildSession({
    preview: (draft) => previewTouchToolAction(activeScene, draft),
    commit: (draft, plan) => commitTouchToolAction(activeScene, draft, plan),
  }, { onChange: mobileRenderDraft });
  mobileWorldMap = mapData;
  // A UI touch cancels any canvas finger already down, preventing a lingering tap after a button.
  mobileUi.addEventListener('pointerdown', () => activeScene?.mapTouchInput?.controller.cancelAll('ui'));
  mobileUi.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.mobilePage) mobileOpenPage(button.dataset.mobilePage);
    else if (button.dataset.mobileCategory) mobileOpenPage('build', button.dataset.mobileCategory);
    else if (button.dataset.mobileTool) {
      const type = TOUCH_BUILDING_TYPES[button.dataset.mobileTool];
      if (type && !getInfraPlacementLock(type).unlocked) showToast(describeSpecialBuildingLockReason(getInfraPlacementLock(type)), 'warning');
      else mobileSelectTool(button.dataset.mobileTool);
    } else if (button.dataset.mobileMenu) {
      mobileClosePanel(); mobileCancelBuild(); handleMenuAction(button.dataset.mobileMenu);
    } else if (button.dataset.mobileAction === 'rename') { mobileClosePanel(); renameCityPrompt(); }
    else if (button.dataset.mobileDensity) mobileBuildSession.setOptions({ density: Number(button.dataset.mobileDensity) });
    else if (button.dataset.mobileRange) {
      const draft = mobileBuildSession.getState();
      mobileBuildSession.begin(draft.tool, { ...draft.options, range: button.dataset.mobileRange === 'true' }, mobileOwner);
    } else if (button.dataset.nudge) {
      // Screen diagonal -> logical grid direction, accounting for map rotation.
      const { dr, dc } = touchNudgeDelta(button.dataset.nudge, mapRotation);
      mobileBuildSession.nudge(dr, dc);
    } else if (button.id === 'mobile-nav-toggle') {
      const open = mobileUi.classList.toggle('nav-open');
      button.setAttribute('aria-expanded', String(open));
      button.textContent = `${mobileText(open ? 'close' : mobilePage || 'menu')} ${open ? '⌄' : '⌃'}`;
    } else if (button.id === 'mobile-panel-close') mobileClosePanel();
    else if (button.id === 'mobile-panel-back') mobileOpenPage('build');
    else if (button.id === 'mobile-pause') { toggleSimPause(); mobileUpdateStatus(); }
    else if (button.id === 'mobile-cancel') mobileCancelBuild();
    else if (button.id === 'mobile-nudge-toggle') { mobileNudgeOpen = !mobileNudgeOpen; mobileRenderDraft(mobileBuildSession.getState()); }
    else if (button.id === 'mobile-end-toggle') {
      const draft = mobileBuildSession.getState();
      mobileBuildSession.setActiveEnd(draft.activeEnd === 'start' ? 'end' : 'start');
    } else if (button.id === 'mobile-confirm') {
      if (!mobileGameVisible() || mobileModalOpen()) return;
      if (mobileWorldMap !== mapData) { mobileInvalidateWorld(); return; }
      const draft = mobileBuildSession.getState();
      if (!draft) return;
      const result = mobileBuildSession.confirm(draft.id, mobileOwner);
      if (result.reason === 'changed') showToast(mobileText('changed'), 'warning');
      else if (result.ok) showToast(mobileText(draft.tool === 'bulldoze' ? 'demolished' : 'built'), 'info');
    }
  });
  mobileUi.addEventListener('change', (event) => {
    if (event.target.id === 'mobile-speed') setSimSpeed(Number(event.target.value));
    if (event.target.matches('[data-mobile-profile]')) setUiProfilePreference(event.target.value);
    if (event.target.matches('[data-mobile-language]')) setLanguage(event.target.value);
  });
  const profileSetting = document.createElement('label');
  profileSetting.className = 'ui-profile-setting';
  profileSetting.id = 'landing-ui-profile';
  document.getElementById('landing-menu').appendChild(profileSetting);
  // The same preference is reachable from the existing desktop Settings menu.
  const desktopSetting = document.createElement('label');
  desktopSetting.className = 'ui-profile-setting';
  desktopSetting.id = 'desktop-ui-profile';
  document.querySelector('[data-menu="settings"] .menu-dropdown')?.appendChild(desktopSetting);
  [profileSetting, desktopSetting].forEach((label) => label.addEventListener('change', (event) => {
    if (event.target.matches('[data-mobile-profile]')) setUiProfilePreference(event.target.value);
  }));
  const translate = () => {
    mobileUi.querySelectorAll('[data-mobile-text]').forEach((el) => { el.textContent = mobileText(el.dataset.mobileText); });
    mobileUi.querySelectorAll('[data-mobile-aria]').forEach((el) => { el.setAttribute('aria-label', mobileText(el.dataset.mobileAria)); });
    document.getElementById('mobile-nav-toggle').textContent = `${mobileText(mobilePage || 'menu')} ⌃`;
    [profileSetting, desktopSetting].forEach((label) => { label.innerHTML = `${mobileText('profile')} ${mobileProfileSelect()}`; });
    mobileRenderDraft(mobileBuildSession.getState());
    mobileRenderPage();
  };
  document.addEventListener('languagechange', translate);
  document.addEventListener('uiprofilechange', () => {
    cancelPaintStroke(); mobileInvalidateWorld(); mobileClosePanel(); translate(); mobileUpdateStatus();
  });
  document.addEventListener('heungshing:maptap', (event) => handleMobileMapTap(event.detail));
  document.addEventListener('heungshing:mapcancel', mobileCancelBuild);
  document.addEventListener('heungshing:citywillchange', mobileInvalidateWorld);
  window.addEventListener('blur', mobileCancelBuild);
  window.addEventListener('orientationchange', mobileCancelBuild);
  document.addEventListener('visibilitychange', () => { if (document.hidden) mobileCancelBuild(); });
  const orientation = window.matchMedia('(orientation: portrait)');
  orientation.addEventListener('change', () => { mobileCancelBuild(); mobileUpdateStatus(); });
  translate();
  setInterval(mobileUpdateStatus, 500);
}

function mobileUpdateStatus() {
  if (!mobileUi) return;
  const visible = isTouchUiProfile() && mobileGameVisible();
  mobileUi.hidden = !visible;
  if (!visible) { if (mobileBuildSession.getState()) mobileCancelBuild(); return; }
  if (mobileWorldMap !== mapData) mobileInvalidateWorld();
  const read = (id) => document.getElementById(id)?.textContent.trim() || '';
  document.getElementById('mobile-city-name').textContent = read('topbar-city-name-zh') || city.name;
  const compact = (value) => new Intl.NumberFormat(getCurrentLanguage() === 'zhHant' ? 'zh-Hant' : getCurrentLanguage(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  document.getElementById('mobile-funds').textContent = mobileIsPortrait() ? `$${compact(city.budget)}` : formatMoney(city.budget);
  document.getElementById('mobile-funds').parentElement.setAttribute('aria-label', `${mobileText('funds')} ${formatMoney(city.budget)}`);
  document.getElementById('mobile-population').textContent = mobileIsPortrait() ? compact(city.population || 0) : Number(city.population || 0).toLocaleString();
  document.getElementById('mobile-date').textContent = `${read('topbar-date-zh')} ${read('topbar-time')}`;
  document.getElementById('mobile-weather').textContent = `${read('topbar-weather-icon')} ${read('topbar-weather-temp')}`;
  document.getElementById('mobile-pause').textContent = simPaused ? '▶' : '⏸';
  document.getElementById('mobile-pause').setAttribute('aria-pressed', String(simPaused));
  document.getElementById('mobile-speed').value = String(simSpeedMul);
  if (mobilePage === 'manage') mobileUpdateOverview();
  activeScene?.mapTouchInput?.controller.setUiCaptured(mobileModalOpen());
}

setupMobileUi();
