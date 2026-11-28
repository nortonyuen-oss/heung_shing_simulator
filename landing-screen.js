function setupLandingScreen() {
  const screen    = document.getElementById('landing-screen');
  const menu      = document.getElementById('landing-menu');
  const setup     = document.getElementById('landing-setup');
  const btnNew    = document.getElementById('btn-new-game');
  // The Map Editor sits under 附加功能 on the New City screen, not on the title menu.
  const btnExtras = document.getElementById('btn-setup-extras');
  const extrasMenu = document.getElementById('setup-extras-menu');
  const btnCont   = document.getElementById('btn-continue');
  const btnStart  = document.getElementById('btn-start-city');
  const btnBack   = document.getElementById('btn-back');
  const nameInput = document.getElementById('city-name-input');
  const roadTileSetSelect = document.getElementById('newgame-road-tile-set');
  const startYearGroup = document.getElementById('newgame-start-year');
  const transportExpansionCheckbox = document.getElementById('newgame-transport-expansion');
  const setupTitle = document.getElementById('landing-setup-title');
  const setupSubtitle = document.getElementById('landing-setup-subtitle');
  const previewCanvas = document.getElementById('setup-preview-canvas');
  const previewName = document.getElementById('setup-preview-name');
  const previewStatus = document.getElementById('setup-preview-status');
  const previewStats = document.getElementById('setup-preview-stats');
  const districtList = document.getElementById('setup-district-list');
  const savedList = document.getElementById('setup-saved-list');
  const savedEmpty = document.getElementById('setup-saved-empty');
  const landformChips = document.getElementById('setup-landform-chips');
  const modeChips = document.getElementById('setup-generated-mode');
  const modeHint = document.getElementById('setup-generated-mode-hint');
  const seedInput = document.getElementById('setup-seed-input');
  const btnReroll = document.getElementById('setup-reroll');
  const overviewMap = document.getElementById('setup-overview-map');
  const overviewFrame = document.getElementById('setup-overview-frame');
  const overviewHover = document.getElementById('setup-overview-hover');
  const introThumb = document.getElementById('setup-intro-thumb');
  const introName = document.getElementById('setup-intro-name');
  const introMeta = document.getElementById('setup-intro-meta');
  const introBody = document.getElementById('setup-intro-body');
  const introDifficulty = document.getElementById('setup-intro-difficulty');
  const introTraits = document.getElementById('setup-intro-traits');
  if (!screen || !setup) return;
  const tabButtons = setup.querySelectorAll('[data-map-tab]');
  const tabPanels = setup.querySelectorAll('[data-map-panel]');

  let setupMode = 'newCity';
  let activeTab = 'district';
  let generatedLandform = GENERATED_MAP_DEFAULT_LANDFORM;
  let generatedMode = GENERATED_MAP_DEFAULT_MODE;
  let generatedSeed = createSeed();
  let selectedStartYear = String(CITY_DEFAULT_START_YEAR);
  let selectedSource = null;
  const rememberedSourceIds = { district: '', saved: '' };
  // Each pick bumps this, so a slow terrain load never paints over a newer pick.
  let previewToken = 0;


  function setExtrasOpen(open) {
    if (!extrasMenu) return;
    extrasMenu.hidden = !open;
    btnExtras?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function setLandingState(state) {
    setExtrasOpen(false);
    if (menu) menu.style.display = state === 'menu' ? 'grid' : 'none';
    setup.style.display = state === 'setup' ? 'flex' : 'none';
    screen.classList.toggle('is-setup', state === 'setup');
  }

  // Keeps data-i18n in step so applyTranslations() on a language change shows the same text.
  function setI18nText(element, key) {
    if (!element) return;
    element.dataset.i18n = key;
    element.textContent = t(key);
  }

  function setSetupMode(mode) {
    setupMode = mode;
    setup.dataset.mode = mode;
    const editor = mode === 'editor';
    setI18nText(setupTitle, editor ? 'landing.setupEditorTitle' : 'landing.setupNewTitle');
    setI18nText(setupSubtitle, editor ? 'landing.setupEditorSub' : 'landing.setupNewSub');
    setI18nText(btnStart, editor ? 'landing.startEditing' : 'landing.foundCity');
  }

  function renderChoiceChips(container, options, selectedValue, onPick) {
    if (!container) return;
    container.innerHTML = '';
    options.forEach((option) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'setup-chip';
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', option.value === selectedValue ? 'true' : 'false');
      chip.textContent = option.label;
      if (option.title) chip.title = option.title;
      chip.addEventListener('click', () => {
        container.querySelectorAll('.setup-chip').forEach((other) => {
          other.setAttribute('aria-checked', other === chip ? 'true' : 'false');
        });
        onPick(option.value);
      });
      container.appendChild(chip);
    });
  }

  // 開局年份: keeps the player's pick across a language change
  function renderStartYearChips() {
    if (typeof CITY_START_YEAR_OPTIONS === 'undefined') return;
    renderChoiceChips(startYearGroup, CITY_START_YEAR_OPTIONS.map((option) => ({
      value: String(option),
      label: option === 'now' ? t('landing.startYearNowChip') : String(option),
      title: option === 'now'
        ? t('landing.startYearNow', { year: resolveCityStartYear('now') })
        : t('landing.startYearOption', { year: option }),
    })), selectedStartYear, (value) => {
      selectedStartYear = value;
    });
  }

  // 香港實景 or 原創地形: the same landforms, sampled from real terrain or grown anew
  function renderModeChips() {
    renderChoiceChips(modeChips, GENERATED_MAP_MODES.map((mode) => ({
      value: mode,
      label: t(`landing.generatedMode.${mode}`),
    })), generatedMode, (value) => {
      generatedMode = value;
      if (modeHint) modeHint.textContent = t(`landing.generatedModeHint.${generatedMode}`);
      selectSource(createGeneratedMapSource(generatedLandform, generatedSeed, generatedMode));
    });
    if (modeHint) modeHint.textContent = t(`landing.generatedModeHint.${generatedMode}`);
  }

  function renderLandformChips() {
    renderChoiceChips(landformChips, GENERATED_MAP_LANDFORMS.map((landform) => ({
      value: landform,
      label: getMapSourceProfileLabel(landform),
    })), generatedLandform, (value) => {
      generatedLandform = value;
      selectSource(createGeneratedMapSource(generatedLandform, generatedSeed, generatedMode));
    });
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  function showPreviewStatus(text) {
    if (!previewStatus) return;
    previewStatus.textContent = text;
    previewStatus.hidden = !text;
  }

  function markSelectedCards() {
    // Cards, district chips and overview markers all carry the id of the map they pick.
    setup.querySelectorAll('[data-source-id]').forEach((element) => {
      const selected = element.dataset.sourceId === selectedSource?.id;
      element.setAttribute('aria-checked', selected ? 'true' : 'false');
      if (element.classList.contains('setup-map-card')) element.tabIndex = selected || !selectedSource ? 0 : -1;
    });
  }

  function placeOverviewFrame(frame, source) {
    const box = getDistrictOverviewBox(source);
    if (!frame) return;
    frame.hidden = !box;
    if (!box) return;
    frame.style.left = `${box.left}%`;
    frame.style.top = `${box.top}%`;
    frame.style.width = `${box.width}%`;
    frame.style.height = `${box.height}%`;
  }

  function showDistrictIntro(source) {
    placeOverviewFrame(overviewFrame, source);
    if (introName) introName.textContent = source?.name ?? '';
    if (introBody) introBody.textContent = source?.intro ?? '';
    if (introMeta) introMeta.textContent = source ? t('landing.districtPeak', { metres: source.peakMetres }) : '';
    if (introDifficulty) introDifficulty.textContent = '';
    if (typeof renderDistrictTraits === 'function') renderDistrictTraits(introTraits, getDistrictProfile(source?.districtId));
    introThumb?.getContext('2d')?.clearRect(0, 0, introThumb.width, introThumb.height);
  }

  // 香港全境 lives in the same chip list as the districts (renderDistrictPicker), so it shares
  // their visible UI (.setup-overview / .setup-district-intro) rather than .setup-preview, which
  // #landing-setup[data-tab="district"] hides outright - selectSource writing into previewName/
  // previewStats for this source was a no-op the player could never see, which was the whole
  // "按落去無反應" bug. getDistrictOverviewBox returns null for it (no single district box to
  // draw), so placeOverviewFrame below just hides the frame, same as it would for any source
  // outside every district's box.
  function showTerritoryIntro(source) {
    placeOverviewFrame(overviewFrame, source);
    if (introName) introName.textContent = source?.name ?? '';
    if (introBody) introBody.textContent = source ? t('landing.territoryIntro') : '';
    if (introMeta) introMeta.textContent = ''; // filled in once getTerrain() resolves with a size
    if (introDifficulty) introDifficulty.textContent = '';
    if (typeof renderDistrictTraits === 'function') renderDistrictTraits(introTraits, null);
    // No mapData exists yet to sample a pixel preview from (terrain streams in per chunk as the
    // player explores) - and nothing should be computed just for a thumbnail anyway, per Norton.
    // The overview map's own image is already loaded for the district picker above; reuse it
    // (centre-cropped to the thumb's square) instead of loading or rendering anything new.
    const ctx = introThumb?.getContext('2d');
    const overviewImg = overviewMap?.querySelector('img');
    if (ctx) {
      ctx.clearRect(0, 0, introThumb.width, introThumb.height);
      if (overviewImg?.complete && overviewImg.naturalWidth) {
        const side = Math.min(overviewImg.naturalWidth, overviewImg.naturalHeight);
        const sx = (overviewImg.naturalWidth - side) / 2;
        const sy = (overviewImg.naturalHeight - side) / 2;
        ctx.drawImage(overviewImg, sx, sy, side, side, 0, 0, introThumb.width, introThumb.height);
      }
    }
  }

  async function selectSource(source) {
    selectedSource = source;
    const worldMode = false;
    if (roadTileSetSelect) roadTileSetSelect.closest('.setup-row').hidden = worldMode;
    if (transportExpansionCheckbox) transportExpansionCheckbox.closest('.setup-switch').hidden = worldMode;
    if (source && rememberedSourceIds[source.kind] !== undefined) rememberedSourceIds[source.kind] = source.id;
    markSelectedCards();
    if (btnStart) btnStart.disabled = !source;
    const token = ++previewToken;

    previewCanvas?.closest('.setup-preview')?.classList.toggle('is-empty', !source);
    if (!source) {
      previewCanvas?.getContext('2d')?.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      if (previewName) previewName.textContent = '';
      if (previewStats) previewStats.textContent = '';
      showPreviewStatus('');
      return;
    }

    if (source.kind === 'district') showDistrictIntro(source);
    if (source.kind === 'territory') showTerritoryIntro(source);
    if (source.kind === 'territory') {
      // The world engine has its own immutable packs; selecting it must never load legacy RLE.
      if (introMeta) introMeta.textContent = t('landing.worldSize');
      showPreviewStatus(''); return;
    }
    if (previewName) {
      previewName.textContent = source.kind === 'generated'
        ? getMapSourceProfileLabel(source.profileType)
        : source.name;
    }
    showPreviewStatus(t('landing.mapGenerating'));
    // Generating takes a moment: let the status paint first.
    await nextPaint();
    if (token !== previewToken) return;

    let terrain = null;
    try {
      terrain = await source.getTerrain();
    } catch (error) {
      console.error('[MapSource Preview]', source.id, error);
    }
    if (token !== previewToken) return;
    // A chunked source (香港全境) has no mapData yet - terrain streams in per chunk as the
    // player explores (ensureTerritoryChunkGenerated), not up front, so there is nothing to
    // sample a preview image from. Show its real size and a placeholder instead of the normal
    // pixel preview, rather than treating "no mapData" here as a preview failure.
    if (terrain?.chunked) {
      previewCanvas?.getContext('2d')?.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      showPreviewStatus('');
      if (previewStats) {
        previewStats.textContent = t('landing.mapSize', getMapSourceSizeKm(terrain));
      }
      // previewStats lives on the (hidden, under this tab) .setup-preview figure - introMeta is
      // the visible equivalent on .setup-district-intro, set here rather than in
      // showTerritoryIntro because it needs this terrain descriptor's width/height.
      if (introMeta) introMeta.textContent = t('landing.mapSize', getMapSourceSizeKm(terrain));
      return;
    }
    if (!terrain?.mapData) {
      showPreviewStatus(t('landing.terrainPreviewFailed'));
      if (previewStats) previewStats.textContent = '';
      return;
    }

    drawMapSourcePreview(previewCanvas, terrain);
    // 香港實景: say which part of Hong Kong the window came from
    const nearInfo = terrain.nearDistrictId && typeof HK_DISTRICT_INFO !== 'undefined' ? HK_DISTRICT_INFO[terrain.nearDistrictId] : null;
    if (previewName && nearInfo) {
      const nearName = nearInfo.names?.[currentLanguage] ?? nearInfo.names?.en;
      previewName.textContent = `${getMapSourceProfileLabel(source.profileType)} · ${t('landing.nearDistrict', { name: nearName })}`;
    }
    if (previewStats) {
      previewStats.textContent = `${t('landing.mapStats', measureTerrainStats(terrain))} · ${t('landing.mapSize', getMapSourceSizeKm(terrain))}`;
    }
    if (source.kind === 'district') {
      drawMapSourcePreview(introThumb, terrain, 128);
      const stats = measureTerrainStats(terrain);
      if (introMeta) {
        introMeta.textContent = `${t('landing.districtPeak', { metres: source.peakMetres })} · ${t('landing.mapStats', stats)}`;
      }
      if (introDifficulty) {
        introDifficulty.textContent = formatDistrictDifficulty(getDistrictDifficulty(getDistrictProfile(source.districtId), stats.flat));
      }
    }
    showPreviewStatus('');
  }

  function createMapCard(source, onDelete = null) {
    const card = document.createElement('div');
    card.className = 'setup-map-card';
    card.setAttribute('role', 'radio');
    card.tabIndex = 0;
    card.dataset.sourceId = source.id;

    const thumb = document.createElement('canvas');
    thumb.width = 64;
    thumb.height = 64;
    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'setup-map-card-name';
    name.textContent = source.name;
    const meta = document.createElement('span');
    meta.className = 'setup-map-card-meta';
    meta.textContent = source.meta ?? getMapSourceProfileLabel(source.profileType);
    text.append(name, meta);
    card.append(thumb, text);

    card.addEventListener('click', () => selectSource(source));
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectSource(source);
    });

    if (onDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'setup-map-card-delete';
      deleteBtn.textContent = '✕';
      deleteBtn.title = t('landing.terrainDelete');
      deleteBtn.setAttribute('aria-label', `${t('landing.terrainDelete')} ${source.name}`);
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        onDelete();
      });
      card.appendChild(deleteBtn);
    }

    source.getTerrain()
      .then((terrain) => { if (terrain?.mapData) drawMapSourcePreview(thumb, terrain, 64); })
      .catch((error) => console.warn('[MapSource Thumb]', source.id, error));
    return card;
  }

  function pickRemembered(sources, kind) {
    return sources.find((source) => source.id === rememberedSourceIds[kind]) ?? sources[0] ?? null;
  }

  // 香港地區: a name chip per district on the right, and a marker at each district's centre on
  // the overview; hovering either outlines that district's square.
  function renderDistrictPicker() {
    // 香港全境 lives alongside the district chips rather than its own tab for now - it's a map
    // source like any other (same selectSource/confirmSetup path), just a much bigger one.
    // getDistrictOverviewBox(source) returns null for it (no .centre), so it naturally never
    // gets an overview-map marker below, only a chip in the list.
    const sources = [...listDistrictMapSources(), ...(setupMode === 'editor' ? [] : [createHkTerritoryMapSource()])];
    const showHover = (source) => placeOverviewFrame(overviewHover, source);
    const hideHover = () => { if (overviewHover) overviewHover.hidden = true; };

    if (districtList) {
      districtList.innerHTML = '';
      sources.forEach((source) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'setup-chip';
        chip.setAttribute('role', 'radio');
        chip.dataset.sourceId = source.id;
        chip.textContent = source.name;
        chip.addEventListener('click', () => selectSource(source));
        chip.addEventListener('mouseenter', () => showHover(source));
        chip.addEventListener('mouseleave', hideHover);
        districtList.appendChild(chip);
      });
    }

    if (overviewMap) {
      overviewMap.querySelectorAll('.setup-overview-marker').forEach((marker) => marker.remove());
      sources.forEach((source) => {
        const box = getDistrictOverviewBox(source);
        if (!box) return;
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'setup-overview-marker';
        marker.setAttribute('role', 'radio');
        marker.dataset.sourceId = source.id;
        marker.title = source.name;
        marker.setAttribute('aria-label', source.name);
        marker.style.left = `${box.x}%`;
        marker.style.top = `${box.y}%`;
        marker.addEventListener('click', () => selectSource(source));
        marker.addEventListener('mouseenter', () => showHover(source));
        marker.addEventListener('mouseleave', hideHover);
        overviewMap.appendChild(marker);
      });
    }

    hideHover();
    selectSource(pickRemembered(sources, 'district'));
  }

  async function refreshSavedCards() {
    if (!savedList) return;
    savedList.innerHTML = '';
    if (savedEmpty) savedEmpty.hidden = true;
    selectSource(null);
    const sources = await listSavedMapSources();
    if (activeTab !== 'saved') return;
    savedList.innerHTML = '';
    if (savedEmpty) savedEmpty.hidden = sources.length > 0;
    sources.forEach((source) => {
      savedList.appendChild(createMapCard(source, async () => {
        if (!window.confirm(t('landing.terrainDeleteConfirm'))) return;
        try {
          await source.remove();
          showToast(t('toast.terrainPresetDeleted'), 'info');
        } catch (error) {
          console.error('[TerrainPreset Delete]', error);
          showToast(t('toast.terrainPresetDeleteFailed'), 'danger');
        }
        refreshSavedCards();
      }));
    });
    selectSource(pickRemembered(sources, 'saved'));
  }

  function setActiveTab(tab) {
    activeTab = tab;
    tabButtons.forEach((button) => {
      button.setAttribute('aria-selected', button.dataset.mapTab === tab ? 'true' : 'false');
    });
    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.mapPanel !== tab;
    });
    setup.dataset.tab = tab;
    if (tab === 'district') {
      renderDistrictPicker();
    } else if (tab === 'saved') {
      refreshSavedCards();
    } else {
      // Same landform and seed: keep the terrain already generated rather than build it again.
      const id = `generated:${generatedMode}:${generatedLandform}:${generatedSeed}`;
      selectSource(selectedSource?.id === id ? selectedSource : createGeneratedMapSource(generatedLandform, generatedSeed, generatedMode));
    }
  }

  // Draws everything that holds translated text; the current picks stay as they are.
  function renderSetupScreen() {
    renderStartYearChips();
    renderModeChips();
    renderLandformChips();
    if (seedInput) seedInput.value = generatedSeed;
    setActiveTab(activeTab);
  }

  function openSetup(mode) {
    setExtrasOpen(false);
    setSetupMode(mode);
    setLandingState('setup');
    if (mode === 'newCity') {
      nameInput.value = getDefaultCityName();
      // Every new city starts on the default set, not whichever one the showcase or the last
      // city left current.
      if (typeof populateRoadTileSetSelect === 'function') populateRoadTileSetSelect(roadTileSetSelect);
      if (roadTileSetSelect) roadTileSetSelect.value = ROAD_TILE_SET_DEFAULT_ID;
    }
    renderSetupScreen();
    if (mode === 'newCity') {
      nameInput.focus();
      nameInput.select();
    }
  }

  function applySeedInput() {
    const typed = seedInput?.value.trim() ?? '';
    generatedSeed = typed || createSeed();
    if (seedInput) seedInput.value = generatedSeed;
    selectSource(createGeneratedMapSource(generatedLandform, generatedSeed, generatedMode));
  }

  async function confirmSetup() {
    const source = selectedSource;
    if (!source) {
      showToast(t('landing.mapRequired'), 'warning');
      return;
    }
    if (source.kind === 'territory') {
      try { await globalThis.HeungShingWorldEntry.enterWorld(globalThis.HeungShingWorldEntry.createWorldUrl({ name: nameInput.value.trim() || getDefaultCityName(), startYear: resolveCityStartYear(selectedStartYear), roadTileSetId: roadTileSetSelect?.value, transportExpansion: transportExpansionCheckbox?.checked, sandbox: document.getElementById('newgame-sandbox')?.checked === true })); }
      catch (error) { showToast(error.message, 'danger'); }
      return;
    }
    if (btnStart) btnStart.disabled = true;
    // showPreviewStatus below writes into .setup-preview, which the 香港地區 tab's own CSS hides
    // outright (same reason showTerritoryIntro exists) - every map source lives under that tab's
    // chip list, including 香港全境, so that status is never actually visible here. The button
    // itself is always visible regardless of tab; borrow it as the one loading indicator the
    // player can actually see, restored in `finally` either way.
    const btnStartOriginalText = btnStart?.textContent;
    if (btnStart) btnStart.textContent = t('landing.mapGenerating');
    try {
      const terrain = await source.getTerrain();
      // A chunked source (香港全境) has no mapData/heightMap yet - chunks generate lazily as the
      // player explores (terrain-presets.js's ensureTerritoryChunkGenerated), not up front.
      if (!terrain?.chunked && (!terrain?.mapData || !terrain?.heightMap)) {
        throw new Error(`Missing terrain data for map ${source.id}`);
      }
      // The expensive part of a chunked source (generating its starting chunk, 300-800ms) runs
      // inside startNewGame/startTerrainCreatorMode below, not getTerrain() above - show the
      // same brief status those already use for a slow terrain generate, so the UI doesn't look
      // frozen for that one chunk. await nextPaint() lets the status actually paint first.
      if (terrain?.chunked) {
        showPreviewStatus(t('landing.mapGenerating'));
        await nextPaint();
      }
      if (setupMode === 'editor') {
        startTerrainCreatorMode(source.profileType, terrain.seed || createSeed(), terrain);
      } else {
        await startNewGame(nameInput.value.trim() || getDefaultCityName(), {
          terrain,
          districtProfileId: source.kind === 'district' ? source.districtId : '',
          startYear: selectedStartYear,
          roadTileSetId: roadTileSetSelect?.value,
          transportExpansion: transportExpansionCheckbox?.checked === true,
          sandbox: document.getElementById('newgame-sandbox')?.checked === true,
        });
      }
    } catch (error) {
      console.error('[MapSource Load]', error);
      showToast(t('toast.terrainPresetLoadFailed'), 'danger');
    } finally {
      if (btnStart) btnStart.disabled = !selectedSource;
      if (btnStart && btnStartOriginalText !== undefined) btnStart.textContent = btnStartOriginalText;
    }
  }

  // "Load Saved Game" always visible — opens the save-list modal
  if (btnCont) btnCont.style.display = 'block';

  // Pre-fetch saves immediately so the player sees live feedback instead of
  // a blank button while the server wakes up.
  prefetchSaveStatus();
  if (typeof populateRoadTileSetSelect === 'function') populateRoadTileSetSelect(roadTileSetSelect);
  document.addEventListener('languagechange', () => {
    // The landing screen stays mounted after gameplay begins. Rebuilding its
    // hidden terrain previews is unnecessary and used to let preview generation
    // race with (and overwrite) the active city's elevation state.
    if (screen.style.display === 'none') return;
    if (setup.style.display === 'none') return;
    if (typeof populateRoadTileSetSelect === 'function') populateRoadTileSetSelect(roadTileSetSelect);
    renderSetupScreen();
  });

  btnNew.addEventListener('click', () => openSetup('newCity'));
  btnExtras?.addEventListener('click', () => setExtrasOpen(extrasMenu?.hidden !== false));
  extrasMenu?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-setup-extra]');
    if (!item || item.disabled) return;
    // the same screen in editor mode; a map the editor cannot open falls back to the first one
    if (item.dataset.setupExtra === 'editor') openSetup('editor');
  });
  document.addEventListener('click', (event) => {
    if (extrasMenu && !extrasMenu.hidden && !event.target.closest('.setup-extras')) setExtrasOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && extrasMenu && !extrasMenu.hidden) setExtrasOpen(false);
  });

  btnCont.addEventListener('click', () => {
    openSaveListModal();
  });

  btnStart.addEventListener('click', confirmSetup);
  btnBack.addEventListener('click', () => {
    // the editor is reached from New City's 附加功能, so it steps back there
    if (setupMode === 'editor') { openSetup('newCity'); return; }
    setLandingState('menu');
  });

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.mapTab));
  });

  btnReroll?.addEventListener('click', () => {
    generatedSeed = createSeed();
    if (seedInput) seedInput.value = generatedSeed;
    selectSource(createGeneratedMapSource(generatedLandform, generatedSeed, generatedMode));
  });
  seedInput?.addEventListener('change', applySeedInput);
  seedInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      seedInput.blur();
    }
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSetup();
  });

  setup.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setLandingState('menu');
  });

  // Keyboard shortcuts: Ctrl+S = save, Ctrl+O = load
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (isTerrainCreatorMode) saveTerrainPresetFromCurrentMap();
      else saveGame();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      if (isTerrainCreatorMode) return;
      openSaveListModal();
    }
    if (e.key === 'F11') {
      e.preventDefault();
      if (isFullscreen()) exitFullscreen();
      else enterFullscreen();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '4') {
      e.preventDefault();
      reloadHouse4x4Models();
    }
  });

  // Menu is wired; bring the showcase city up behind it (no-op when disabled or unavailable).
  if (typeof startAttractMode === 'function') {
    if (!globalThis.HeungShingWorldEntry?.hasPendingLaunch?.()) startAttractMode(typeof activeScene !== 'undefined' ? activeScene : null);
  }
}

function hideLandingScreen() {
  if (typeof leaveAttractMode === 'function') leaveAttractMode('play');
  const screen = document.getElementById('landing-screen');
  if (screen) screen.style.display = 'none';
  if (typeof setGameWorldVisible === 'function') setGameWorldVisible(true);
  if (typeof recordVisualRoutePerformanceMilestone === 'function') {
    recordVisualRoutePerformanceMilestone('gameplayVisible');
  }

  if (typeof enterGameplayAudioMode === 'function') enterGameplayAudioMode();

  // Start ticker only once the game session actually begins (not at page load).
  // startTicker() is re-entrant-safe: it clears any existing timer before restarting.
  if (typeof startCoastalWeatherSession === 'function' && !coastalSessionActive && !isTerrainCreatorMode) startCoastalWeatherSession();
  if (typeof startTicker === 'function') startTicker();
}

// 香港全境 and any future map this large stream their terrain/sprites in lazily rather than
// building the whole grid up front - see ensureTerritoryChunkGenerated (terrain-presets.js) and
// ensureTileSprite (main.js). Checked by area, not a per-source flag, so it applies uniformly
// regardless of why a map ended up this size.
const LAZY_WORLD_TILE_THRESHOLD = 256 * 256;
function isLazyWorldMap() {
  return MAP_WIDTH * MAP_HEIGHT > LAZY_WORLD_TILE_THRESHOLD;
}

// 香港全境: allocates mapData/heightMap at the chosen source's full size but leaves every cell
// at the typed array's zero default ("not generated yet" - 0 is never a real mapData value,
// GROUND..HILL are 1-6) instead of copying in a full terrain the source doesn't have yet.
// ensureTerritoryChunkGenerated fills cells in on demand as the player explores. Does NOT
// generate the starting chunk itself - resetGameState() (called via rebuildFreshMapSession,
// right after this in startNewGame/startTerrainCreatorMode) wipes treeMap/debrisMap/
// territoryGeneratedChunkIds back to empty, so generating a chunk before that runs is wasted
// work the very next line immediately throws away. generateTerritoryStartingChunk below does
// this instead, once the reset has actually happened.
function initializeChunkedTerritoryWorld(terrain) {
  mapData = createFilledTypedMap(Uint8Array, 0);
  heightMap = createFilledTypedMap(Uint8Array, 0);
  resetBridgeLayers();
}

function generateTerritoryStartingChunk(terrain) {
  const startRow = Number.isFinite(terrain?.startRow) ? terrain.startRow : Math.floor(MAP_HEIGHT / 2);
  const startCol = Number.isFinite(terrain?.startCol) ? terrain.startCol : Math.floor(MAP_WIDTH / 2);
  ensureTerritoryChunkGenerated(activeScene, startRow, startCol);
}

function copyTerrainToWorld(mapRows, heightRows) {
  mapData = createFilledTypedMap(Uint8Array, GROUND);
  heightMap = createFilledTypedMap(Uint8Array, 0);
  resetBridgeLayers();

  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      const tile = Number((mapRows?.[row] ?? [])[col]);
      const normalizedTile = Number.isFinite(tile) ? tile : GROUND;
      mapData[row][col] = [GROUND, ROAD, DIRT, BEACH, WATER, HILL].includes(normalizedTile)
        ? normalizedTile
        : GROUND;

      const h = Number((heightRows?.[row] ?? [])[col]);
      if (mapData[row][col] === HILL) {
        heightMap[row][col] = Number.isFinite(h)
          ? Math.max(1, Math.min(MAX_TERRAIN_HEIGHT, Math.round(h)))
          : 1;
      } else if (mapData[row][col] === ROAD) {
        heightMap[row][col] = Number.isFinite(h)
          ? Math.max(0, Math.min(MAX_TERRAIN_HEIGHT, Math.round(h)))
          : 0;
      } else {
        heightMap[row][col] = 0;
      }
    }
  }
}

function rebuildFreshMapSession(cityName) {
  if (typeof leaveAttractMode === 'function') leaveAttractMode('newCity');
  // The scene may still be showing another city — the title screen's showcase, or a game the
  // player just left — so clear everything a load clears, not only what a pristine scene needs:
  // vehicles, bus stops and the weather overlay all outlive resetGameState() otherwise.
  if (typeof closeAllVehicleTrackingWindows === 'function') closeAllVehicleTrackingWindows();
  if (typeof clearTrafficVisuals === 'function') clearTrafficVisuals(activeScene);
  if (typeof clearTransportVisuals === 'function') clearTransportVisuals(activeScene);
  if (typeof clearVesselVisuals === 'function') clearVesselVisuals(activeScene);
  if (typeof clearAircraftVisuals === 'function') clearAircraftVisuals(activeScene);
  clearAllOverlays(activeScene);
  clearBuildings(activeScene);
  resetGameState();
  // A lazy-world map (香港全境) generates trees/debris (data and sprites both) per chunk as it
  // streams in - ensureTerritoryChunkGenerated, including for the starting chunk, already called
  // by initializeChunkedTerritoryWorld before this runs. A full-map pass here would be the same
  // up-front cost the chunking exists to avoid, and would duplicate the starting chunk's sprites.
  if (!isTerrainCreatorMode && !isLazyWorldMap()) {
    generateInitialTrees(activeScene);
    rebuildTreeSprites(activeScene);
    generateInitialDebris(activeScene);
    rebuildDebrisSprites(activeScene);
  }
  if (typeof rebuildBusStopSprites === 'function') rebuildBusStopSprites(activeScene);
  if (typeof rebuildUnderseaTunnelSprites === 'function') rebuildUnderseaTunnelSprites(activeScene);
  if (typeof syncMetroStations === 'function') syncMetroStations(activeScene);
  city.name = cityName || getDefaultCityName();
  city.nameEn = '';
  city.plateColor = 0;
  refreshAllTiles(activeScene);
  if (typeof syncWeatherVisuals === 'function') syncWeatherVisuals();
  updateHUD();
}

// terrain: the map picked on the setup screen; without one a fresh map is generated.
function startTerrainCreatorMode(profileType, seedText, terrain = null) {
  if (typeof leaveAttractMode === 'function') leaveAttractMode('terrainCreator');
  if (!gameReady || !activeScene) return;

  stopSimTimer();
  simPaused = true;
  isTerrainCreatorMode = true;
  activeTerrainProfileType = profileType;
  currentSeed = seedText || createSeed();
  setMapDimensions(terrain?.width, terrain?.height);
  // See the matching comment in startNewGame - the scene's offsets, world mask and tile sprites
  // were all built for whichever map (and size) was previously loaded, not this one.
  applyMapSizeToScene(activeScene);
  if (terrain?.chunked) {
    currentTerrainMetadata = createTerrainMetadata(terrain, currentSeed);
    initializeChunkedTerritoryWorld(terrain);
  } else if (terrain?.mapData && terrain?.heightMap) {
    copyTerrainToWorld(terrain.mapData, terrain.heightMap);
    currentTerrainMetadata = createTerrainMetadata(terrain, currentSeed);
  } else {
    mapData = generateTerrainMapByProfile(profileType, currentSeed);
  }
  rebuildFreshMapSession(getDefaultCityName());
  if (terrain?.chunked) generateTerritoryStartingChunk(terrain);
  selectedTool = 'terrain';
  selectedTerrainType = 'raise';

  document.querySelectorAll('#tool-menu [data-tool]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tool === 'terrain');
  });
  updateTerrainToolUi();
  setTerrainEditorUiActive(true);

  hideLandingScreen();
  showToast(t('toast.terrainCreatorEntered'), 'info');
}

async function saveTerrainPresetFromCurrentMap() {
  if (!activeScene) {
    showToast(t('toast.gameNotReady'), 'warning');
    return;
  }

  if (!isTerrainCreatorMode) {
    showToast(t('toast.terrainCreatorOnlyTerrainTools'), 'warning');
    return;
  }

  const profileLabel = t(`terrain.profile.${activeTerrainProfileType}`);
  const fallbackName = profileLabel.startsWith('terrain.profile.')
    ? getDefaultCityName()
    : profileLabel;
  // window.prompt() is not implemented by Electron/Chromium (unlike
  // alert/confirm) - it returns null immediately with no dialog shown at
  // all, silently no-opping this whole feature. showTextPromptDialog is the
  // app's own in-page modal (already used for "Save As"), which actually works.
  const entered = await showTextPromptDialog(t('prompt.terrainPresetName'), fallbackName);
  if (entered === null) return;
  const presetName = entered.trim() || fallbackName;

  const payload = {
    name: presetName,
    profile_type: activeTerrainProfileType,
    seed: currentSeed,
    terrain_data: {
      version: 1,
      generatorVersion: currentTerrainMetadata?.generatorVersion ?? 2,
      profileType: activeTerrainProfileType,
      seed: currentSeed,
      features: currentTerrainMetadata?.features ?? [],
      mapData: mapData.map((row) => Array.from(row)),
      heightMap: heightMap.map((row) => Array.from(row)),
    },
  };

  try {
    await createTerrainPreset(payload);
    showToast(t('toast.terrainPresetSaved'), 'info');
  } catch (error) {
    console.error('[TerrainPreset Save]', error);
    showToast(t('toast.terrainPresetSaveFailed'), 'danger');
  }
}

function createTerrainMetadata(terrain, seed) {
  return {
    generatorVersion: terrain?.generatorVersion ?? 2,
    profileType: terrain?.profileType ?? 'custom',
    seed,
    features: terrain?.features ?? [],
  };
}

// options.terrain is the map picked on the setup screen (any map source); without one the
// city starts on freshly generated terrain, as the preview scripts rely on.
async function startNewGame(cityName, options = {}) {
  if (isWorldGameActive()) { if (!await globalThis.__worldGameHost.save(true)) return; await leaveWorldGame(); }
  if (globalThis.HEUNG_SHING_CONFIG?.platform === 'web' && !HeungShingStorage.writable) {
    showToast(platformText('locked'), 'warning'); return;
  }
  if (!gameReady) return;
  if (typeof closeBunHillMapEvent === 'function') closeBunHillMapEvent();
  const performanceStartedAt = globalThis.performance?.now?.() ?? Date.now();
  const terrain = options.terrain ?? null;
  const source = terrain ? 'map-source' : 'random';
  setMapDimensions(terrain?.width, terrain?.height);
  // The scene's offsets, world mask and tile sprites were all built for whichever map (and
  // whatever size) was previously loaded - create()'s own startup scene the first time, a
  // different city's map on every load after that. Must happen after setMapDimensions (it reads
  // the now-current MAP_WIDTH/MAP_HEIGHT) and before anything below reads mapData/heightMap.
  applyMapSizeToScene(activeScene);

  stopSimTimer();
  isTerrainCreatorMode = false;
  activeTerrainProfileType = 'custom';
  setTerrainEditorUiActive(false);

  if (terrain?.chunked) {
    currentSeed = terrain.seed || createSeed();
    currentTerrainMetadata = createTerrainMetadata(terrain, currentSeed);
    initializeChunkedTerritoryWorld(terrain);
  } else if (terrain?.mapData && terrain?.heightMap) {
    copyTerrainToWorld(terrain.mapData, terrain.heightMap);
    currentSeed = terrain.seed || createSeed();
    currentTerrainMetadata = createTerrainMetadata(terrain, currentSeed);
  } else {
    currentSeed = createSeed();
    mapData = generateTerrainMap(currentSeed);
  }

  if (typeof setRoadTileSet === 'function') {
    setRoadTileSet(options.roadTileSetId || ROAD_TILE_SET_DEFAULT_ID, { refresh: false });
  }

  if (typeof beginNewCitySaveSession === 'function') beginNewCitySaveSession();
  else if (typeof currentSaveId !== 'undefined') currentSaveId = null;

  rebuildFreshMapSession(cityName || getDefaultCityName());
  if (terrain?.chunked) generateTerritoryStartingChunk(terrain);
  city.districtProfileId = options.districtProfileId || '';
  city.regionNeighbours = typeof computeRegionNeighbours === 'function'
    ? computeRegionNeighbours({ districtId: city.districtProfileId, features: terrain?.features })
    : null;
  // 區外交通: where lines may run off the map (a 香港實景 window's sides only make sense now)
  city.regionDestinations = typeof computeRegionDestinations === 'function'
    ? computeRegionDestinations({ districtId: city.districtProfileId, features: terrain?.features })
    : null;
  if (typeof syncRegionConnectionSigns === 'function') syncRegionConnectionSigns();
  if (typeof applyDistrictZoneDensityCap === 'function') applyDistrictZoneDensityCap();
  if (typeof updateDistrictProfilePanel === 'function') updateDistrictProfilePanel();
  if (typeof resolveCityStartYear === 'function') {
    // (a 《玩轉18區》 chapter asks for its own year: campaign-chapters.js getCampaignChapterStartYear)
    city.year = Number.isInteger(options.exactStartYear) ? options.exactStartYear
      : resolveCityStartYear(options.startYear ?? CITY_DEFAULT_START_YEAR);
    updateHUD();
  }
  if (typeof setExpansionEnabled === 'function') {
    setExpansionEnabled('transport', options.transportExpansion === true || options.sandbox === true, {
      notify: false,
      autosave: false,
    });
  }
  if (options.sandbox === true) applySandboxMode();
  // New games always start at the default speed (speed is not persisted/carried
  // over) - GAME_SPEEDS.SLOW (0.15) is the tier the topbar now labels "1x".
  if (typeof clearFestivalSprites === 'function' && typeof activeScene !== 'undefined') clearFestivalSprites(activeScene);
  if (typeof resetGameClockAccumulator === 'function') resetGameClockAccumulator();
  if (typeof setGameSpeed === 'function') setGameSpeed(GAME_SPEEDS.SLOW);
  else {
    simPaused = false;
    simSpeedMul = 0.15;
  }
  startSimTimer();
  hideLandingScreen();
  centerNewCityOnLand(activeScene);
  const performanceDuration = (globalThis.performance?.now?.() ?? Date.now()) - performanceStartedAt;
  if (typeof recordVisualRoutePerformanceDuration === 'function') {
    recordVisualRoutePerformanceDuration(activeScene, 'load.newCity', performanceDuration);
  }
  if (typeof recordVisualRoutePerformanceOperation === 'function') {
    recordVisualRoutePerformanceOperation('new-city', performanceDuration, {
      source,
      population: Number(city.population) || 0,
    });
  }
}

// A new city opens with land in view. The camera starts on the map's middle, which on 維港兩岸 (the first
// map offered) is the harbour - a screen of sea, as if the city had no ground (Norton, 2026-11-22:
// 新遊戲開局沒有地面). So: the ground nearest the middle that is more than a stray tile, the coast and
// the water beside it in view.
function findNewCityLandTile() {
  const midRow = Math.floor(MAP_HEIGHT / 2);
  const midCol = Math.floor(MAP_WIDTH / 2);
  const ground = (row, col) => mapData[row]?.[col] === GROUND;
  const solid = (row, col) => ground(row, col) && ground(row - 1, col) && ground(row + 1, col) && ground(row, col - 1) && ground(row, col + 1);
  if (solid(midRow, midCol)) return null;
  let best = null;
  let bestDistance = Infinity;
  for (let row = 1; row < MAP_HEIGHT - 1; row++) {
    for (let col = 1; col < MAP_WIDTH - 1; col++) {
      const distance = (row - midRow) ** 2 + (col - midCol) ** 2;
      if (distance < bestDistance && solid(row, col)) { best = { row, col }; bestDistance = distance; }
    }
  }
  return best;
}

function centerNewCityOnLand(scene) {
  // (香港全境 streams its land in around where the player looks; it has its own start)
  if (!scene || (typeof isLazyWorldMap === 'function' && isLazyWorldMap()) || typeof centerCameraOnTile !== 'function') return;
  const tile = findNewCityLandTile();
  if (!tile) return;
  centerCameraOnTile(scene, tile.row, tile.col);
  if (typeof onMapViewChanged === 'function') onMapViewChanged(scene);
}

// 造景模式 (Norton 2026-11-22: 城市金錢10億，運輸公司資金都係10億，俾玩家自己鍾意起乜都可以): a city to build
// what you like in. Every building, the council, the metro and the light rail open at once; the medals
// are not earned in it (medals.js).
const SANDBOX_FUNDS = 1000000000;
function applySandboxMode() {
  city.sandbox = true;
  city.budget = SANDBOX_FUNDS;
  city.scienceParkUnlocked = true;
  const transport = typeof getTransportExpansionState === 'function' ? getTransportExpansionState() : null;
  if (transport) {
    transport.unlocked = true;
    if (!transport.company.foundedYear) transport.company.foundedYear = city.year;
    transport.company.cash = SANDBOX_FUNDS;
    if (typeof getMetroState === 'function') getMetroState().unlocked = true;
    if (typeof getLightRailState === 'function') getLightRailState().approved = true;
  }
  if (typeof updateHUD === 'function') updateHUD();
  if (typeof refreshTransportUi === 'function') refreshTransportUi();
  if (typeof showToast === 'function') showToast(t('toast.sandboxStarted'), 'info');
}

function showCityIdentityDialog(defaults = {}) {
  return new Promise((resolve) => {
    let dialog = document.getElementById('city-identity-dialog');
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.id = 'city-identity-dialog';
      dialog.className = 'sim-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.innerHTML = `
        <div class="dialog-overlay" data-identity-cancel></div>
        <form class="dialog-box" style="max-width:420px; width:92vw">
          <div class="dialog-title-bar">
            <span data-identity-title></span>
            <button class="dialog-close-btn" type="button" data-identity-cancel>✕</button>
          </div>
          <div class="dialog-body">
            <label class="city-identity-label" data-identity-label-zh></label>
            <input class="dialog-text-input city-identity-input-zh" type="text" maxlength="30" autocomplete="off" spellcheck="false" />
            <label class="city-identity-label" data-identity-label-en></label>
            <input class="dialog-text-input city-identity-input-en" type="text" maxlength="40" autocomplete="off" spellcheck="false" />
            <label class="city-identity-label" data-identity-label-color></label>
            <div class="plate-color-picker" data-identity-color-picker></div>
          </div>
          <div class="dialog-footer">
            <button class="dialog-cancel-btn" type="button" data-identity-cancel></button>
            <button class="dialog-ok-btn" type="submit"></button>
          </div>
        </form>
      `;
      document.body.appendChild(dialog);

      const picker = dialog.querySelector('[data-identity-color-picker]');
      const PLATE_SWATCH_BOX_PX = 40; // matches the fixed .plate-color-swatch size in CSS
      for (let i = 0; i < CITY_PLATE_COLOR_COUNT; i++) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'plate-color-swatch';
        swatch.dataset.colorIndex = String(i);
        const crop = getCityPlateCrop(i, PLATE_SWATCH_BOX_PX);
        swatch.style.backgroundSize = crop.backgroundSize;
        swatch.style.backgroundPosition = crop.backgroundPosition;
        picker.appendChild(swatch);
      }
    }

    const titleEl   = dialog.querySelector('[data-identity-title]');
    const labelZhEl  = dialog.querySelector('[data-identity-label-zh]');
    const labelEnEl  = dialog.querySelector('[data-identity-label-en]');
    const labelColorEl = dialog.querySelector('[data-identity-label-color]');
    const inputZhEl = dialog.querySelector('.city-identity-input-zh');
    const inputEnEl = dialog.querySelector('.city-identity-input-en');
    const picker    = dialog.querySelector('[data-identity-color-picker]');
    const okBtn      = dialog.querySelector('.dialog-ok-btn');
    const cancelBtn  = dialog.querySelector('.dialog-cancel-btn');
    const formEl     = dialog.querySelector('form');

    titleEl.textContent = t('tool.renameCity');
    labelZhEl.textContent = t('prompt.cityNameZh');
    labelEnEl.textContent = t('prompt.cityNameEn');
    labelColorEl.textContent = t('prompt.cityPlateColor');
    inputZhEl.value = defaults.nameZh || '';
    inputEnEl.value = defaults.nameEn || '';
    okBtn.textContent = t('dialog.ok');
    cancelBtn.textContent = t('dialog.cancel');

    let selectedColor = ((Number(defaults.plateColor) || 0) % CITY_PLATE_COLOR_COUNT + CITY_PLATE_COLOR_COUNT) % CITY_PLATE_COLOR_COUNT;
    const swatchEls = [...picker.querySelectorAll('.plate-color-swatch')];
    const paintSelection = () => {
      swatchEls.forEach((el) => {
        el.classList.toggle('is-selected', Number(el.dataset.colorIndex) === selectedColor);
      });
    };
    paintSelection();
    const onSwatchClick = (e) => {
      const btn = e.target.closest('.plate-color-swatch');
      if (!btn) return;
      selectedColor = Number(btn.dataset.colorIndex) || 0;
      paintSelection();
    };
    picker.addEventListener('click', onSwatchClick);

    let settled = false;
    const cleanup = () => {
      dialog.style.display = 'none';
      formEl.removeEventListener('submit', onSubmit);
      dialog.querySelectorAll('[data-identity-cancel]').forEach((el) => {
        el.removeEventListener('click', onCancel);
      });
      picker.removeEventListener('click', onSwatchClick);
      document.removeEventListener('keydown', onKeyDown);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      finish({
        nameZh: inputZhEl.value,
        nameEn: inputEnEl.value,
        plateColor: selectedColor,
      });
    };
    const onCancel = () => finish(null);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') finish(null);
    };

    formEl.addEventListener('submit', onSubmit);
    dialog.querySelectorAll('[data-identity-cancel]').forEach((el) => {
      el.addEventListener('click', onCancel);
    });
    document.addEventListener('keydown', onKeyDown);

    dialog.style.display = 'flex';
    window.setTimeout(() => {
      inputZhEl.focus();
      inputZhEl.select();
    }, 0);
  });
}

// 香港全境: a plain confirm, same singleton-DOM-element/Promise pattern as
// showCityIdentityDialog above, just OK/Cancel with no inputs. Resolves true/false.
function showTerritoryWarningDialog() {
  return new Promise((resolve) => {
    let dialog = document.getElementById('territory-warning-dialog');
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.id = 'territory-warning-dialog';
      dialog.className = 'sim-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.innerHTML = `
        <div class="dialog-overlay" data-territory-cancel></div>
        <form class="dialog-box" style="max-width:420px; width:92vw">
          <div class="dialog-title-bar">
            <span data-territory-title></span>
            <button class="dialog-close-btn" type="button" data-territory-cancel>✕</button>
          </div>
          <div class="dialog-body">
            <p data-territory-body style="margin:0 0 12px; line-height:1.5"></p>
          </div>
          <div class="dialog-footer">
            <button class="dialog-cancel-btn" type="button" data-territory-cancel></button>
            <button class="dialog-ok-btn" type="submit"></button>
          </div>
        </form>
      `;
      document.body.appendChild(dialog);
    }

    const titleEl = dialog.querySelector('[data-territory-title]');
    const bodyEl = dialog.querySelector('[data-territory-body]');
    const okBtn = dialog.querySelector('.dialog-ok-btn');
    const cancelBtn = dialog.querySelector('.dialog-cancel-btn');
    const formEl = dialog.querySelector('form');

    titleEl.textContent = t('landing.territoryWarningTitle');
    bodyEl.textContent = t('landing.territoryWarningBody');
    okBtn.textContent = t('landing.territoryWarningConfirm');
    cancelBtn.textContent = t('dialog.cancel');

    let settled = false;
    const cleanup = () => {
      dialog.style.display = 'none';
      formEl.removeEventListener('submit', onSubmit);
      dialog.querySelectorAll('[data-territory-cancel]').forEach((el) => {
        el.removeEventListener('click', onCancel);
      });
      document.removeEventListener('keydown', onKeyDown);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onSubmit = (e) => { e.preventDefault(); finish(true); };
    const onCancel = () => finish(false);
    const onKeyDown = (e) => { if (e.key === 'Escape') finish(false); };

    formEl.addEventListener('submit', onSubmit);
    dialog.querySelectorAll('[data-territory-cancel]').forEach((el) => {
      el.addEventListener('click', onCancel);
    });
    document.addEventListener('keydown', onKeyDown);

    dialog.style.display = 'flex';
  });
}

async function renameCityPrompt() {
  const result = await showCityIdentityDialog({
    nameZh: city.name || getDefaultCityName(),
    nameEn: city.nameEn || '',
    plateColor: city.plateColor || 0,
  });
  if (!result) return;
  const nameZh = result.nameZh.trim().slice(0, 30);
  if (!nameZh) return;
  city.name = nameZh;
  city.nameEn = result.nameEn.trim().slice(0, 40);
  city.plateColor = result.plateColor;
  updateHUD();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
}
