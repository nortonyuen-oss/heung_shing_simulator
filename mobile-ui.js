// Opt-in touch shell; the desktop DOM stays in place for live statistics and profile switching.
let mobileBuildSession = null;
let mobileUi = null;
let mobilePage = null;
let mobileCategory = null;
let mobileMode = 'inspect';
let mobileOwner = 0;
let mobileWorldMap = null;
let mobileNudgeOpen = true;
let mobileNative = null;
let mobilePanelHistory = [];
const mobilePageScroll = new Map();
const mobileDynamicPanels = new Map();
const MOBILE_PENDING_TRANSPORT_ACTIONS = new Set(['select-tool', 'ferry-new-route', 'metro-new-line', 'metro-new-station', 'metro-extend', 'tram-new-line', 'tram-new-stop', 'tram-track', 'tram-extend']);
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
  if (!TOUCH_SUPPORTED_TOOLS.includes(tool)) return;
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

async function mobilePromptDistrictNames() {
  const draft = mobileBuildSession.getState();
  if (draft?.tool !== 'district-sign') return;
  const world = mapData;
  const current = () => mapData === world && mobileBuildSession.getState()?.id === draft.id
    && mobileBuildSession.getState()?.owner === draft.owner;
  const count = getDistrictSigns().length + 1;
  const name = await showTextPromptDialog(t('districtSign.namePrompt'), draft.options.name || t('districtSign.defaultName', { count }));
  if (!current() || name === null || !trimDistrictName(name)) return;
  const englishName = await showTextPromptDialog(t('districtSign.englishNamePrompt'), draft.options.englishName || t('districtSign.defaultEnglishName', { count }), { maxLength: 48 });
  if (!current() || englishName === null || !trimDistrictEnglishName(englishName)) return;
  mobileBuildSession.setOptions({ name: trimDistrictName(name), englishName: trimDistrictEnglishName(englishName) });
}

function handleMobileMapTap({ x, y }) {
  if (!isTouchUiProfile() || !mobileGameVisible() || mobileModalOpen()) return;
  if (mobileWorldMap !== mapData) mobileInvalidateWorld();
  const world = mapCameraWorldPoint(activeScene.cameras.main, x, y);
  const tile = screenPointToTile(activeScene, world.x, world.y);
  if (!tile) return;
  if (isTransportRoutePicking()) {
    handleTransportRouteMapClick(tile.row, tile.col);
    return;
  }
  if (mobilePage) return;
  if (mobileMode === 'inspect') {
    mobileCancelBuild();
    const sign = areDistrictSignsVisible() && [...getDistrictSigns()].reverse().find((item) => {
      const sprite = activeScene.districtSignSprites?.get(item.id);
      return (item.row === tile.row && item.col === tile.col)
        || (sprite?.visible && Phaser.Geom.Rectangle.Contains(sprite.getBounds(), world.x, world.y));
    });
    if (sign) { editDistrictSign(activeScene, sign).catch((error) => console.warn('[Mobile district sign]', error)); return; }
    lastInspectTile = { ...tile };
    drawInspectHighlight(activeScene, tile.row, tile.col);
    showInspectPanel(activeScene, tile.row, tile.col);
    return;
  }
  const state = mobileBuildSession.getState();
  if (!state) return; // choosing a tool is explicit; dismissing a draft never arms a new one
  mobileBuildSession.select(tile, isTouchRangeDraft(state));
}

function mobileRenderDraft(draft) {
  if (!mobileUi) return;
  const building = !!draft;
  mobileUi.classList.toggle('is-building', building);
  mobileUi.classList.toggle('is-district-sign', draft?.tool === 'district-sign');
  document.getElementById('mobile-build-controls').hidden = !building;
  if (!draft) { clearTouchPlacementPreview(typeof activeScene === 'undefined' ? null : activeScene); return; }
  const plan = draft.plan;
  document.getElementById('mobile-build-name').textContent = mobileToolLabel(draft.tool);
  const status = document.getElementById('mobile-build-status');
  status.textContent = plan?.reason || (plan?.summary ? mobileText('summary', plan.summary)
    : plan ? mobileText('valid', { count: plan.tiles.length, skipped: plan.skipped || 0 }) : mobileText('tap'));
  if (draft.tool === 'bus-stop' && plan?.eligibleSides?.length && !plan.reason) {
    const catchment = getTransportStopCatchmentUnits({ id: 'mobile-preview', ...draft.start });
    status.textContent = mobileText('stopCoverage', { residents: Math.round(catchment.residents || 0), jobs: Math.round(catchment.destinationUnits || 0) });
  }
  if (draft.tool === 'bus-depot' && plan && !plan.reason) status.textContent = plan.vehicleCount
    ? mobileText(plan.connected ? 'depotInUseConnected' : 'depotInUseDisconnected', { buses: plan.vehicleCount, routes: plan.routeCount })
    : mobileText(plan.connected ? 'depotConnected' : 'depotDisconnected');
  if (draft.tool === 'dezone' && plan?.ok) status.textContent = mobileText('dezoneSummary', { count: plan.tiles.length, buildings: plan.keptBuildings });
  if (draft.tool === 'power-line' && plan?.ok) status.textContent = mobileText('powerLineSummary', { count: plan.tiles.length, skipped: plan.skipped, trees: plan.clearedTrees });
  if (draft.tool === 'district-sign' && plan?.ok) status.textContent = `${plan.name} · ${plan.englishName}`;
  if (plan?.option) document.getElementById('mobile-build-name').textContent = t(plan.option.titleKey);
  status.style.color = plan && !plan.ok ? '#8d1f1e' : '#374451';
  document.getElementById('mobile-build-cost').textContent = plan ? formatMoney(plan.cost) : '—';
  const busTool = TOUCH_BUS_TOOLS.includes(draft.tool);
  const funding = document.getElementById('mobile-build-funding');
  funding.hidden = !busTool;
  if (busTool) {
    const account = plan?.funding || getTransportConstructionFunds();
    funding.textContent = mobileText(account.payer === 'company' ? 'companyFunding' : 'cityFunding', { balance: formatMoney(account.balance) });
  }
  document.getElementById('mobile-stop-options').hidden = draft.tool !== 'bus-stop';
  document.getElementById('mobile-depot-options').hidden = draft.tool !== 'bus-depot';
  document.getElementById('mobile-district-options').hidden = draft.tool !== 'district-sign';
  const recreation = getTouchRecreationOptions(draft.tool);
  const recreationSelect = document.getElementById('mobile-recreation-select');
  recreationSelect.hidden = !recreation.length;
  if (recreation.length) recreationSelect.innerHTML = recreation.map((option) => `<option value="${option.id}" ${option.id === draft.options.variant ? 'selected' : ''}>${mobileEscape(t(option.titleKey))} · ${option.badge} · ${formatMoney(option.cost)}</option>`).join('');
  document.querySelectorAll('[data-mobile-stop-side]').forEach((button, index) => {
    button.setAttribute('aria-pressed', String(button.dataset.mobileStopSide === draft.options.stopSide));
    const side = plan?.eligibleSides?.[index];
    button.textContent = index === 2 ? mobileText('bothSides') : `${index ? 'B' : 'A'} ${side ? { ul: '↖', ur: '↗', ll: '↙', lr: '↘' }[getBusStopAnchorCorner(side)] : ''}`;
  });
  if (draft.tool === 'bus-depot') document.getElementById('mobile-depot-rotate').textContent = `${mobileText('rotateEntrance')} ${ { ul: '↖', ur: '↗', ll: '↙', lr: '↘' }[getBusDepotVisualCorner(draft.options.depotSide)] }`;
  const confirm = document.getElementById('mobile-confirm');
  confirm.textContent = mobileText(draft.tool === 'bulldoze' ? 'demolish' : draft.tool === 'dezone' ? 'confirmDezone' : 'confirm');
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
  endToggle.hidden = !isTouchRangeDraft(draft);
  if (activeScene) drawTouchPlacementPreview(activeScene, draft);
}

function mobileClosePanel() {
  mobileReleaseNative();
  mobilePanelHistory = [];
  mobilePage = null;
  document.getElementById('mobile-panel').hidden = true;
  mobileUi?.classList.remove('nav-open');
  document.getElementById('mobile-nav-toggle')?.setAttribute('aria-expanded', 'false');
}
function mobileOpenPage(page, category = null) {
  mobileRememberScroll();
  mobileReleaseNative();
  mobilePanelHistory = category ? [{ page, category: null }] : [];
  mobileCancelBuild();
  activeScene?.mapTouchInput?.controller.cancelAll('panel');
  document.getElementById('inspect-panel').style.display = 'none';
  mobilePage = page;
  mobileCategory = category;
  mobileUi.classList.remove('nav-open');
  document.getElementById('mobile-nav-toggle').setAttribute('aria-expanded', 'false');
  document.getElementById('mobile-nav-toggle').textContent = `${mobileText(page)} ⌃`;
  mobileRenderPage();
  document.getElementById('mobile-panel-body').scrollTop = mobilePageScroll.get(`${page}/${category || ''}`) || 0;
  mobileUpdateStatus();
}

// Move the existing window, including its listeners and form state. A marker
// returns it to exactly the same DOM position when the mobile panel closes.
function mobileNativeConfig(key) {
  if (mobileDynamicPanels.has(key)) return mobileDynamicPanels.get(key);
  const windows = {
    finance: { id: 'budget-detail', title: 'budget.label', page: 'manage', open: () => { updateHUD(); mobileHostNative('finance'); }, close: () => {} },
    budget: { id: 'budget-window', title: 'budget.windowTitle', page: 'manage', open: openBudgetWindow, close: closeBudgetWindow },
    council: { id: 'legislative-window', title: 'council.windowTitle', page: 'manage', open: openLegislativeWindow, close: closeLegislativeWindow },
    stocks: { id: 'stock-exchange-window', title: 'stockExchange.windowTitle', page: 'manage', open: openStockExchangeWindow, close: closeStockExchangeWindow },
    charts: { id: 'chart-window', title: 'chart.title', page: 'manage', open: openChartWindow, close: closeChartWindow },
    overlay: { id: 'overlay-window', title: OVERLAY_TITLES[activeOverlay] || 'toolCategory.maps', page: 'layers', open: openOverlayWindow, close: closeOverlayWindow },
    jukebox: { id: 'jukebox-window', title: 'jukebox.title', page: 'more', open: openJukebox, close: closeJukebox },
    roads: { id: 'road-tile-set-window', title: 'roadTileSet.windowTitle', page: 'more', open: openRoadTileSetWindow, close: closeRoadTileSetWindow },
  };
  if (key.startsWith('transport-')) {
    const id = key.slice('transport-'.length);
    if (!TRANSPORT_PANEL_IDS.includes(id)) return null;
    return { node: transportPanels.get(id)?.root, title: TRANSPORT_PANEL_META[id].labelKey, page: 'transport',
      open: () => openTransportPanel(id), close: () => closeTransportPanel(id) };
  }
  return windows[key];
}
function mobileRememberScroll() {
  if (mobilePage && !mobileNative) mobilePageScroll.set(`${mobilePage}/${mobileCategory || ''}`, document.getElementById('mobile-panel-body').scrollTop);
}
function mobileReleaseNative() {
  if (!mobileNative) return;
  const { node, marker, config, role } = mobileNative;
  mobileNative = null; // close callbacks may request another mobile navigation
  node.classList.remove('m-native');
  if (role === null) node.removeAttribute('role'); else node.setAttribute('role', role);
  marker.replaceWith(node);
  config.close();
  mobileSyncRoutePicker();
}
function mobileHostNative(key, dynamicConfig = null) {
  if (!mobileUi || !isTouchUiProfile() || !mobileGameVisible()) return;
  if (dynamicConfig) mobileDynamicPanels.set(key, dynamicConfig);
  const config = mobileNativeConfig(key);
  const node = config?.getNode?.() || config?.node || document.getElementById(config?.id);
  if (!node) return;
  if (mobileNative?.key === key) { mobileRenderPanelHeading(); return; }
  mobileRememberScroll();
  const previous = mobilePage ? { page: mobilePage, category: mobileCategory, native: mobileNative?.key,
    scroll: document.getElementById('mobile-panel-body').scrollTop } : { page: config.page, category: null };
  mobilePanelHistory.push(previous);
  mobileReleaseNative();
  mobileCancelBuild();
  activeScene?.mapTouchInput?.controller.cancelAll('panel');
  document.getElementById('inspect-panel').style.display = 'none';
  mobilePage = config.page;
  mobileCategory = null;
  const marker = document.createComment(`mobile:${key}`);
  node.before(marker);
  mobileNative = { key, config, node, marker, role: node.getAttribute('role') };
  node.classList.add('m-native');
  node.removeAttribute('role');
  document.getElementById('mobile-panel-body').replaceChildren(node);
  document.getElementById('mobile-panel-body').scrollTop = 0;
  mobileUi.classList.remove('nav-open');
  document.getElementById('mobile-nav-toggle').setAttribute('aria-expanded', 'false');
  document.getElementById('mobile-nav-toggle').textContent = `${mobileText(mobilePage)} ⌃`;
  document.getElementById('mobile-panel').hidden = false;
  mobileRenderPanelHeading();
  mobileRefreshNativeLayout();
  mobileUpdateStatus();
  document.getElementById('mobile-panel-back').focus({ preventScroll: true });
}
function mobileNativeClosed(key) {
  if (mobileNative?.key === key) mobileBack();
}
function mobileRequestNativeClose(key) {
  if (mobileNative?.key !== key) return false;
  mobileBack();
  return true;
}
function mobileShowNative(key) {
  if (key === 'council' && !isCouncilMeetingUnlocked()) { showToast(t('legislative.windowLocked'), 'warning'); return; }
  mobileNativeConfig(key)?.open();
}
function mobileBack() {
  const previous = mobilePanelHistory.pop();
  if (!previous) { mobileClosePanel(); return; }
  const history = [...mobilePanelHistory];
  mobileReleaseNative();
  mobilePage = null;
  if (previous.native) mobileShowNative(previous.native);
  else mobileOpenPage(previous.page, previous.category);
  mobilePanelHistory = history;
  document.getElementById('mobile-panel-body').scrollTop = previous.scroll || mobilePageScroll.get(`${previous.page}/${previous.category || ''}`) || 0;
  mobileRenderPanelHeading();
}
function mobileRenderPanelHeading() {
  document.getElementById('mobile-panel-title').textContent = mobileNative ? (mobileNative.config.getTitle?.() || t(mobileNative.key === 'overlay' ? OVERLAY_TITLES[activeOverlay] : mobileNative.config.title))
    : mobileCategory ? document.querySelector(`[data-tool-category="${mobileCategory}"] .tool-category-title`)?.textContent || mobileText(mobilePage)
      : mobileText(mobilePage === 'manage' ? 'overview' : mobilePage);
  document.getElementById('mobile-panel-back').hidden = !mobilePanelHistory.length;
  document.querySelectorAll('[data-mobile-page]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mobilePage === mobilePage)));
}
function mobileRefreshNativeLayout() {
  if (mobileNative?.key === 'charts') updateChartWindow(true);
  if (mobileNative?.key === 'overlay') { updateMiniMap(); resetMapView(); }
}
function mobileSyncRoutePicker() {
  if (!mobileUi) return;
  const picking = isTouchUiProfile() && mobileNative?.key === 'transport-routes' && isTransportRoutePicking();
  mobileUi.classList.toggle('is-picking-route', !!picking);
  const picker = document.getElementById('mobile-route-picker');
  picker.hidden = !picking;
  if (picking) document.getElementById('mobile-route-picker-status').textContent = mobileText('pickRouteStops', { count: transportUiState.editor.stopIds.length });
}
function mobileHostVehicleTracker(tracker) {
  if (!tracker) return;
  const { key, type, targetId } = tracker;
  mobileHostNative(`tracker:${key}`, {
    page: 'transport', getNode: () => vehicleTrackerManager.trackers.get(key)?.root,
    getTitle: () => vehicleTrackerManager.trackers.get(key)?.root.querySelector('[data-vehicle-tracker-title]')?.textContent,
    open: () => openVehicleTrackingWindow(type, targetId), close: () => closeVehicleTrackingWindow(key),
  });
}
function mobileAdaptTransportPanel(root) {
  if (!isTouchUiProfile()) return;
  root.querySelectorAll('[data-transport-action]').forEach((button) => {
    if (!mobileIsPendingTransportAction(button.dataset.transportAction, button.dataset.tool)) return;
    button.disabled = true;
    button.title = mobileText('futureTools');
  });
}
function mobileIsPendingTransportAction(action, tool) {
  return MOBILE_PENDING_TRANSPORT_ACTIONS.has(action) && !(action === 'select-tool' && TOUCH_BUS_TOOLS.includes(tool));
}
function mobileSetupOverlayGestures() {
  const viewport = document.getElementById('overlay-win-body');
  const pointers = new Map();
  const measure = () => {
    const points = [...pointers.values()];
    const [a, b = a] = points;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  viewport.addEventListener('pointerdown', (event) => {
    if (!isTouchUiProfile() || event.target.closest('button') || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!isTouchUiProfile() || !pointers.has(event.pointerId)) return;
    const before = measure();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = measure();
    mapViewPanX += after.x - before.x; mapViewPanY += after.y - before.y;
    if (before.distance > 0 && after.distance > 0) {
      const rect = viewport.getBoundingClientRect();
      _zoomAtPoint(after.x - rect.left, after.y - rect.top, after.distance / before.distance);
    } else _applyCanvasTransform();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => viewport.addEventListener(type, (event) => pointers.delete(event.pointerId)));
  document.addEventListener('uiprofilechange', () => pointers.clear());
}
function mobileRow(action, title, detail = '', icon = '', tail = '') {
  return `<button type="button" class="m-row" ${action}><span aria-hidden="true">${icon}</span><span class="m-row-text"><strong>${mobileEscape(title)}</strong>${detail ? `<small>${mobileEscape(detail)}</small>` : ''}</span><span class="m-cost">${mobileEscape(tail)}</span></button>`;
}
function mobileRenderPage() {
  if (!mobilePage) return;
  mobileRenderPanelHeading();
  if (mobileNative) return;
  const panel = document.getElementById('mobile-panel');
  const body = document.getElementById('mobile-panel-body');
  panel.hidden = false;
  if (mobilePage === 'build') {
    const categories = [...document.querySelectorAll('#tool-menu [data-tool-category]')]
      .filter((button) => ['roads', 'zones', 'power', 'services', 'parks', 'landmarks', 'terrain', 'marine', 'transport', 'maps'].includes(button.dataset.toolCategory));
    const intro = `<div class="m-shortcuts"><button type="button" data-mobile-tool="inspect">🔍 ${mobileText('inspect')}</button><button type="button" data-mobile-tool="bulldoze">🚜 ${mobileText('bulldoze')}</button></div>`;
    if (!mobileCategory) {
      body.innerHTML = intro + `<div class="m-categories">${categories.map((button) => `<button type="button" class="m-category" data-mobile-category="${button.dataset.toolCategory}"><span aria-hidden="true">${button.querySelector('.tool-category-icon').textContent}</span><strong>${mobileEscape(button.querySelector('.tool-category-title').textContent)}</strong></button>`).join('')}</div><p>${mobileText('toolInfo')}</p>`;
    } else {
      const tools = TOUCH_SUPPORTED_TOOLS.filter((tool) => tool !== 'inspect' && tool !== 'bulldoze' && (document.querySelector(`#tool-menu [data-tool="${tool}"]`)?.closest('[data-tool-panel]')?.dataset.toolPanel || getToolCategoryForTool(tool)) === mobileCategory);
      body.innerHTML = intro + `<div class="m-list">${tools.map((tool) => {
        const type = TOUCH_BUILDING_TYPES[tool];
        const lock = type ? getInfraPlacementLock(type) : { unlocked: true };
        const detail = lock.unlocked ? '' : describeSpecialBuildingLockReason(lock);
        const cost = type ? formatMoney(INFRA_COSTS[type]) : tool === 'road' ? `${formatMoney(COST_ROAD)} / ▧`
          : tool === 'bus-stop' ? formatMoney(COST_BUS_STOP) : tool === 'bus-depot' ? formatMoney(COST_BUS_DEPOT)
            : tool === 'dezone' ? t('toolRow.free') : tool === 'tree' ? formatMoney(COST_TREE)
              : tool === 'power-line' ? formatMoney(COST_POWER_LINE) : tool === 'district-sign' ? formatMoney(DISTRICT_SIGN_COST)
                : getTouchRecreationOptions(tool).length ? mobileText('chooseStyle') : '';
        return mobileRow(`data-mobile-tool="${tool}" ${!lock.unlocked ? 'aria-disabled="true"' : ''}`, mobileToolLabel(tool), detail, mobileToolIcon(tool), lock.unlocked ? cost : '🔒');
      }).join('')}</div><p>${mobileText('futureTools')}</p>`;
    }
  } else if (mobilePage === 'more') {
    const rows = [['save', 'save', '💾'], ['save-as', 'saveAs', '💾'], ['load-game', 'load', '📂'], ['export-save', 'export', '↗'], ['import-save', 'import', '↙'], ['main-menu', 'mainMenu', '🏠']];
    const dialogs = [['open-forum-history', 'menu.openForum', '💬'], ['open-festival-calendar', 'menu.festivalCalendar', '🗓️'], ['open-ai-news-settings', 'menu.aiNews', '📰'], ['show-help', 'menu.help', '❔'], ['show-about', 'menu.about', 'ℹ️']];
    updateSettingsMenu();
    body.innerHTML = `<h3>${mobileText('file')}</h3><div class="m-list">${rows.map(([action, key, icon]) => mobileRow(`data-mobile-menu="${action}"`, mobileText(key), '', icon)).join('')}${mobileRow('data-mobile-action="rename"', mobileText('rename'), '', '✏️')}</div>
      <h3>${mobileText('settings')}</h3><div class="m-list">${mobileRow('data-mobile-native="jukebox"', t('jukebox.title'), '', '🎵')}${mobileRow('data-mobile-native="roads"', t('roadTileSet.windowTitle'), '', '🛣️')}${dialogs.map(([action, key, icon]) => mobileRow(`data-mobile-dialog="${action}"`, document.querySelector(`[data-menu-action="${action}"]`)?.textContent || t(key), '', icon)).join('')}</div>
      <h3>${mobileText('display')}</h3><div class="m-list">${['district-signs', 'weather-effects', 'dynamic-lighting', 'building-lights', 'night-remote-darkness', 'sea-flow', 'vessel-wakes', 'shore-reflections', 'yulan-night-tint', 'auto-replace-plants', 'festivals', 'transport-expansion', 'attract-mode'].map((key) => {
        const source = document.getElementById(`menu-${key}`);
        return source ? mobileRow(`data-mobile-setting="toggle-${key}" aria-pressed="${source.classList.contains('menu-checked')}"`, source.textContent.trim(), '', source.classList.contains('menu-checked') ? '✓' : '○') : '';
      }).join('')}</div>
      <label>${mobileText('language')} <select data-mobile-language>${Object.entries(LANGUAGES).map(([key, label]) => `<option value="${key}" ${getCurrentLanguage() === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>${mobileText('profile')} ${mobileProfileSelect()}</label><p>${mobileText('beta')}</p>`;
  } else if (mobilePage === 'manage') {
    const windows = [['finance', 'budget.label', '💰'], ['budget', 'budget.windowTitle', '📋'], ['council', 'council.windowTitle', '🏛️'], ['stocks', 'stockExchange.windowTitle', '🏦'], ['charts', 'chart.title', '📈']];
    body.innerHTML = `<div class="m-list">${windows.map(([key, title, icon]) => mobileRow(`data-mobile-native="${key}" ${key === 'council' && !isCouncilMeetingUnlocked() ? 'aria-disabled="true"' : ''}`, t(title), key === 'council' && !isCouncilMeetingUnlocked() ? t('legislative.windowLocked') : '', icon)).join('')}</div><h3>${mobileText('demand')}</h3><div id="mobile-demand"></div><h3>${mobileText('indices')}</h3><div id="mobile-indices"></div>`;
    mobileUpdateOverview();
  } else if (mobilePage === 'layers') {
    body.innerHTML = `<div class="m-list">${Object.keys(OVERLAY_TITLES).map((key) => mobileRow(`data-mobile-overlay="${key}"`, t(OVERLAY_TITLES[key]), '', OVERLAY_ICONS[key])).join('')}</div>${mobileRow('data-mobile-action="weather"', t('topbar.currentWeather'), '', '🌦️')}`;
  } else if (mobilePage === 'transport') {
    body.innerHTML = `<div class="m-list">${TOUCH_BUS_TOOLS.map((tool) => mobileRow(`data-mobile-tool="${tool}"`, mobileToolLabel(tool), '', mobileToolIcon(tool), formatMoney(tool === 'bus-stop' ? COST_BUS_STOP : COST_BUS_DEPOT))).join('')}</div><h3>${mobileText('transportManagement')}</h3><div class="m-list">${TRANSPORT_PANEL_IDS.map((key) => mobileRow(`data-mobile-native="transport-${key}"`, t(TRANSPORT_PANEL_META[key].labelKey), '', TRANSPORT_PANEL_META[key].icon)).join('')}</div><p>${mobileText('transportInfo')}</p>`;
  }
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
      <span class="m-city"><span id="mobile-city-name"></span><small class="m-beta" data-mobile-text="betaBadge"></small></span>
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
    <div id="mobile-route-picker" hidden><span id="mobile-route-picker-status" role="status" aria-live="polite"></span><button type="button" id="mobile-route-picker-done" data-mobile-text="donePicking"></button></div>
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
        <select id="mobile-recreation-select" hidden data-mobile-aria="chooseStyle"></select>
        <span id="mobile-district-options" hidden><button type="button" id="mobile-district-names" data-mobile-text="signNames"></button></span>
        <span id="mobile-stop-options" hidden role="group" data-mobile-aria="stopSides"><button type="button" data-mobile-stop-side="first" data-mobile-aria="sideA"></button><button type="button" data-mobile-stop-side="second" data-mobile-aria="sideB"></button><button type="button" data-mobile-stop-side="both"></button></span>
        <span id="mobile-depot-options" hidden><button type="button" id="mobile-depot-rotate" data-mobile-aria="rotateEntrance"></button></span>
        <span id="mobile-density" hidden>${[[DENSITY_LOW,'low'],[DENSITY_MED,'medium'],[DENSITY_HIGH,'high']].map(([value,key]) => `<button type="button" data-mobile-density="${value}" aria-pressed="false" data-mobile-text="${key}"></button>`).join('')}</span>
        <span id="mobile-bulldoze-options" hidden><button type="button" data-mobile-range="false" data-mobile-text="single"></button><button type="button" data-mobile-range="true" data-mobile-text="range"></button></span>
        <span id="mobile-demolition-warning" hidden data-mobile-text="irreversible" style="font-size:12px;color:#8d1f1e"></span>
        <span id="mobile-build-step"></span>
      </div>
      <footer class="m-confirm"><div class="m-confirm-description"><strong id="mobile-build-name"></strong><span id="mobile-build-status" role="status" aria-live="polite"></span><small id="mobile-build-funding" hidden></small></div><span id="mobile-build-cost"></span><button type="button" id="mobile-cancel" data-mobile-text="cancel"></button><button type="button" id="mobile-confirm" class="m-primary" disabled></button></footer>
    </div>`;
  document.body.appendChild(mobileUi);
  const betaNotice = document.createElement('p');
  betaNotice.id = 'mobile-beta-notice';
  document.querySelector('.landing-tagline').after(betaNotice);
  mobileBuildSession = createBuildSession({
    preview: (draft) => previewTouchToolAction(activeScene, draft),
    commit: (draft, plan) => commitTouchToolAction(activeScene, draft, plan),
  }, { onChange: mobileRenderDraft });
  mobileWorldMap = mapData;
  // A UI touch cancels any canvas finger already down, preventing a lingering tap after a button.
  mobileUi.addEventListener('pointerdown', () => activeScene?.mapTouchInput?.controller.cancelAll('ui'), true);
  mobileUi.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.mobilePage) mobileOpenPage(button.dataset.mobilePage);
    else if (button.dataset.mobileCategory) mobileOpenPage('build', button.dataset.mobileCategory);
    else if (button.dataset.mobileTool) {
      const type = TOUCH_BUILDING_TYPES[button.dataset.mobileTool];
      if (type && !getInfraPlacementLock(type).unlocked) showToast(describeSpecialBuildingLockReason(getInfraPlacementLock(type)), 'warning');
      else mobileSelectTool(button.dataset.mobileTool);
    } else if (button.dataset.mobileNative) mobileShowNative(button.dataset.mobileNative);
    else if (button.dataset.mobileOverlay) {
      activeOverlay = button.dataset.mobileOverlay; invalidateOverlayCache(); openOverlayWindow();
    } else if (button.dataset.mobileSetting) {
      const scroll = document.getElementById('mobile-panel-body').scrollTop;
      handleMenuAction(button.dataset.mobileSetting); mobileRenderPage();
      document.getElementById('mobile-panel-body').scrollTop = scroll;
    } else if (button.dataset.mobileDialog) handleMenuAction(button.dataset.mobileDialog);
    else if (button.dataset.mobileAction === 'weather') { updateWeatherLegendDialog(); showDialog('weather-legend-dialog'); }
    else if (button.id === 'mobile-route-picker-done') {
      transportUiState.pickingStops = false; refreshTransportUi();
      mobileSyncRoutePicker();
      document.querySelector('[data-transport-action="pick-stops"]')?.focus({ preventScroll: true });
    } else if (button.dataset.mobileMenu) {
      mobileClosePanel(); mobileCancelBuild(); handleMenuAction(button.dataset.mobileMenu);
    } else if (button.dataset.mobileAction === 'rename') { mobileClosePanel(); renameCityPrompt(); }
    else if (button.id === 'mobile-district-names') mobilePromptDistrictNames().catch((error) => console.warn('[Mobile district draft]', error));
    else if (button.dataset.mobileStopSide) mobileBuildSession.setOptions({ stopSide: button.dataset.mobileStopSide });
    else if (button.id === 'mobile-depot-rotate') {
      const draft = mobileBuildSession.getState();
      const corner = getBusDepotVisualCorner(draft.options.depotSide);
      const next = BUS_DEPOT_CORNER_CYCLE_ORDER[(BUS_DEPOT_CORNER_CYCLE_ORDER.indexOf(corner) + 1) % BUS_DEPOT_CORNER_CYCLE_ORDER.length];
      mobileBuildSession.setOptions({ depotSide: getBusDepotRawSideForCorner(next) });
    } else if (button.dataset.mobileDensity) mobileBuildSession.setOptions({ density: Number(button.dataset.mobileDensity) });
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
    else if (button.id === 'mobile-panel-back') mobileBack();
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
      else if (result.ok) showToast(mobileText(draft.tool === 'bulldoze' ? 'demolished' : draft.tool === 'dezone' ? 'dezoned' : 'built'), 'info');
    }
  });
  mobileUi.addEventListener('change', (event) => {
    if (event.target.id === 'mobile-recreation-select') mobileBuildSession.setOptions({ variant: event.target.value });
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
    betaNotice.textContent = mobileText('betaNotice');
    mobileUi.querySelectorAll('[data-mobile-text]').forEach((el) => { el.textContent = mobileText(el.dataset.mobileText); });
    mobileUi.querySelectorAll('[data-mobile-aria]').forEach((el) => { el.setAttribute('aria-label', mobileText(el.dataset.mobileAria)); });
    document.getElementById('mobile-nav-toggle').textContent = `${mobileText(mobilePage || 'menu')} ⌃`;
    [profileSetting, desktopSetting].forEach((label) => { label.innerHTML = `${mobileText('profile')} ${mobileProfileSelect()}`; });
    mobileRenderDraft(mobileBuildSession.getState());
    mobileRenderPage();
    mobileUpdateStatus();
    mobileRefreshNativeLayout();
  };
  document.addEventListener('languagechange', translate);
  document.addEventListener('uiprofilechange', () => {
    cancelPaintStroke(); mobileInvalidateWorld(); mobileClosePanel(); translate(); mobileUpdateStatus();
  });
  document.addEventListener('heungshing:maptap', (event) => handleMobileMapTap(event.detail));
  document.addEventListener('heungshing:mapcancel', mobileCancelBuild);
  document.addEventListener('heungshing:citywillchange', () => { mobileClosePanel(); mobilePageScroll.clear(); mobileDynamicPanels.clear(); mobileInvalidateWorld(); });
  window.addEventListener('blur', mobileCancelBuild);
  window.addEventListener('orientationchange', mobileCancelBuild);
  document.addEventListener('visibilitychange', () => { if (document.hidden) mobileCancelBuild(); });
  const orientation = window.matchMedia('(orientation: portrait)');
  orientation.addEventListener('change', () => { mobileCancelBuild(); mobileUpdateStatus(); });
  translate();
  mobileSetupOverlayGestures();
  new ResizeObserver(mobileRefreshNativeLayout).observe(document.getElementById('mobile-panel-body'));
  mobileUi.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || mobileModalOpen()) return;
    event.stopPropagation(); mobileBack();
  });
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
  if (mobileNative) mobileRenderPanelHeading();
  mobileSyncRoutePicker();
  activeScene?.mapTouchInput?.controller.setUiCaptured(mobileModalOpen());
}

setupMobileUi();
