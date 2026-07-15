function setupLandingScreen() {
  const screen    = document.getElementById('landing-screen');
  const menu      = document.getElementById('landing-menu');
  const nameForm  = document.getElementById('landing-name-form');
  const terrainForm = document.getElementById('landing-terrain-form');
  const btnNew    = document.getElementById('btn-new-game');
  const btnTerrainCreator = document.getElementById('btn-terrain-creator');
  const btnCont   = document.getElementById('btn-continue');
  const btnStart  = document.getElementById('btn-start-city');
  const btnBack   = document.getElementById('btn-back');
  const btnGenerateTerrain = document.getElementById('btn-generate-terrain');
  const btnTerrainBack = document.getElementById('btn-terrain-back');
  const nameInput = document.getElementById('city-name-input');
  const terrainProfileSelect = document.getElementById('terrain-profile-select');
  const terrainSourceSelect = document.getElementById('newgame-terrain-source');
  const terrainPresetSelect = document.getElementById('newgame-terrain-preset');
  const roadTileSetSelect = document.getElementById('newgame-road-tile-set');
  const terrainPresetTitle = document.getElementById('newgame-terrain-presets-title');
  const terrainPreviewList = document.getElementById('newgame-terrain-preview-list');
  const terrainEmptyHint = document.getElementById('newgame-terrain-empty-hint');
  if (!screen) return;
  let selectedTerrainPresetId = '';
  const terrainPresetDataCache = new Map();

  function setLandingState(state) {
    if (menu) menu.style.display = state === 'menu' ? 'grid' : 'none';
    if (nameForm) nameForm.style.display = state === 'name' ? 'block' : 'none';
    if (terrainForm) terrainForm.style.display = state === 'terrain' ? 'block' : 'none';
  }

  function populateTerrainProfileSelect() {
    if (!terrainProfileSelect) return;
    terrainProfileSelect.innerHTML = '';
    TERRAIN_PROFILE_OPTIONS.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.key;
      option.textContent = t(profile.titleKey);
      terrainProfileSelect.appendChild(option);
    });
  }

  function drawTerrainPreview(canvas, terrainData) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !terrainData?.mapData) return;

    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const image = ctx.createImageData(size, size);
    const mapRows = terrainData.mapData;
    const heightRows = terrainData.heightMap ?? [];

    function getColor(tile, height) {
      if (tile === WATER) return [68, 136, 198];
      if (tile === BEACH) return [224, 206, 142];
      if (tile === DIRT) return [155, 120, 82];
      if (tile === HILL) {
        const shade = 105 + Math.min(80, Math.max(0, height) * 13);
        return [78, shade, 72];
      }
      return [95, 160, 92];
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = Math.floor((y / size) * MAP_HEIGHT);
        const col = Math.floor((x / size) * MAP_WIDTH);
        const tile = Number((mapRows[row] ?? [])[col]) || GROUND;
        const h = Number((heightRows[row] ?? [])[col]) || 0;
        const [r, g, b] = getColor(tile, h);
        const idx = (y * size + x) * 4;
        image.data[idx] = r;
        image.data[idx + 1] = g;
        image.data[idx + 2] = b;
        image.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function setSelectedTerrainPreset(id) {
    selectedTerrainPresetId = id ? String(id) : '';
    if (terrainPresetSelect) {
      terrainPresetSelect.value = selectedTerrainPresetId;
    }
    if (!terrainPreviewList) return;
    terrainPreviewList.querySelectorAll('.terrain-preset-card').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.presetId === selectedTerrainPresetId);
    });
  }

  async function refreshTerrainPresetOptions() {
    if (!terrainPresetSelect || !terrainEmptyHint || !terrainPreviewList) return;
    const usePreset = terrainSourceSelect?.value === 'preset';

    setPresetSelectLoading(terrainPresetSelect);
    terrainPreviewList.innerHTML = `<div class="terrain-preset-loading">${t('landing.terrainPresetLoading')}</div>`;
    terrainEmptyHint.style.display = 'none';
    if (terrainPresetTitle) terrainPresetTitle.style.display = 'none';

    try {
      let savedPresets = [];
      try {
        savedPresets = await listTerrainPresets();
      } catch (error) {
        console.warn('[TerrainPreset List]', error);
      }

      const builtInPresets = listBuiltInCityTerrainPresets();
      const presets = [...builtInPresets, ...savedPresets];

      terrainPresetSelect.innerHTML = '';
      terrainPreviewList.innerHTML = '';

      if (presets.length === 0) {
        terrainPresetSelect.style.display = 'none';
        terrainPreviewList.style.display = 'none';
        terrainEmptyHint.style.display = usePreset ? 'block' : 'none';
        if (terrainPresetTitle) terrainPresetTitle.style.display = 'none';
        return;
      }

      terrainPreviewList.style.display = 'grid';
      if (terrainPresetTitle) terrainPresetTitle.style.display = 'block';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = t('landing.terrainPresetSelect');
      terrainPresetSelect.appendChild(placeholder);

      const scenarioGroup = document.createElement('optgroup');
      scenarioGroup.label = t('landing.cityScenarioGroup');
      terrainPresetSelect.appendChild(scenarioGroup);

      const savedGroup = document.createElement('optgroup');
      savedGroup.label = t('landing.savedTerrainGroup');
      terrainPresetSelect.appendChild(savedGroup);

      presets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = String(preset.id);
        option.textContent = createTerrainPresetOptionLabel(preset);
        if (preset.isBuiltInScenario) scenarioGroup.appendChild(option);
        else savedGroup.appendChild(option);

        const card = document.createElement('div');
        card.className = 'terrain-preset-card';
        card.dataset.presetId = String(preset.id);

        const thumb = document.createElement('canvas');
        thumb.className = 'terrain-preset-thumb';
        card.appendChild(thumb);

        const name = document.createElement('div');
        name.className = 'terrain-preset-name';
        name.textContent = preset.name;
        card.appendChild(name);

        const meta = document.createElement('div');
        meta.className = 'terrain-preset-meta';
        meta.textContent = preset.isBuiltInScenario
          ? `${t(`terrain.profile.${preset.profile_type}`)} · ${t('landing.cityScenarioLabel')}`
          : t(`terrain.profile.${preset.profile_type}`);
        card.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'terrain-preset-actions';

        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'terrain-preset-btn';
        selectBtn.textContent = t('landing.terrainSelect');
        actions.appendChild(selectBtn);

        let deleteBtn = null;
        if (!preset.isBuiltInScenario) {
          deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'terrain-preset-btn delete';
          deleteBtn.textContent = t('landing.terrainDelete');
          actions.appendChild(deleteBtn);
        }

        card.appendChild(actions);

        const selectCard = () => setSelectedTerrainPreset(preset.id);
        card.addEventListener('click', selectCard);
        selectBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          selectCard();
        });

        if (deleteBtn) {
          deleteBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (!window.confirm(t('landing.terrainDeleteConfirm'))) return;
            try {
              await deleteTerrainPresetById(preset.id);
              terrainPresetDataCache.delete(String(preset.id));
              if (selectedTerrainPresetId === String(preset.id)) {
                selectedTerrainPresetId = '';
              }
              showToast(t('toast.terrainPresetDeleted'), 'info');
              refreshTerrainPresetOptions();
            } catch (error) {
              console.error('[TerrainPreset Delete]', error);
              showToast(t('toast.terrainPresetDeleteFailed'), 'danger');
            }
          });
        }

        terrainPreviewList.appendChild(card);

        const cached = terrainPresetDataCache.get(String(preset.id));
        if (cached) {
          drawTerrainPreview(thumb, cached);
        } else if (preset.terrain_data?.mapData) {
          terrainPresetDataCache.set(String(preset.id), preset.terrain_data);
          drawTerrainPreview(thumb, preset.terrain_data);
        } else {
          getTerrainPresetById(preset.id)
            .then((full) => {
              if (!full?.terrain_data) return;
              terrainPresetDataCache.set(String(preset.id), full.terrain_data);
              drawTerrainPreview(thumb, full.terrain_data);
            })
            .catch(() => {
              thumb.replaceWith(document.createTextNode(t('landing.terrainPreviewFailed')));
            });
        }
      });

      if (!presets.some((preset) => String(preset.id) === selectedTerrainPresetId)) {
        selectedTerrainPresetId = String(presets[0].id);
      }
      setSelectedTerrainPreset(selectedTerrainPresetId);
      updateTerrainSourceVisibility();
    } catch {
      terrainPresetSelect.innerHTML = '';
      terrainPresetSelect.style.display = 'none';
      terrainPreviewList.innerHTML = '';
      terrainPreviewList.style.display = 'none';
      if (terrainPresetTitle) terrainPresetTitle.style.display = 'none';
      terrainEmptyHint.style.display = 'block';
    }
  }

  function updateTerrainSourceVisibility() {
    if (!terrainSourceSelect || !terrainPresetSelect || !terrainEmptyHint || !terrainPreviewList) return;
    const usePreset = terrainSourceSelect.value === 'preset';
    terrainPresetSelect.style.display = 'none';
    terrainPreviewList.style.display = usePreset ? 'grid' : 'none';
    if (terrainPresetTitle) terrainPresetTitle.style.display = usePreset ? 'block' : 'none';
    if (!usePreset) {
      terrainEmptyHint.style.display = 'none';
    }
  }

  // "Load Saved Game" always visible — opens the save-list modal
  if (btnCont) btnCont.style.display = 'block';

  // Pre-fetch saves immediately so the player sees live feedback instead of
  // a blank button while the server wakes up.
  prefetchSaveStatus();
  populateTerrainProfileSelect();
  if (typeof populateRoadTileSetSelect === 'function') populateRoadTileSetSelect(roadTileSetSelect);
  updateTerrainSourceVisibility();
  document.addEventListener('languagechange', () => {
    // The landing screen stays mounted after gameplay begins. Rebuilding its
    // hidden terrain previews is unnecessary and used to let preview generation
    // race with (and overwrite) the active city's elevation state.
    if (screen.style.display === 'none') return;
    populateTerrainProfileSelect();
    if (typeof populateRoadTileSetSelect === 'function') populateRoadTileSetSelect(roadTileSetSelect);
    refreshTerrainPresetOptions();
  });

  btnNew.addEventListener('click', () => {
    setLandingState('name');
    nameInput.value = getDefaultCityName();
    if (typeof populateRoadTileSetSelect === 'function') populateRoadTileSetSelect(roadTileSetSelect);
    nameInput.focus();
    nameInput.select();
    refreshTerrainPresetOptions();
  });

  btnTerrainCreator?.addEventListener('click', () => {
    setLandingState('terrain');
  });

  btnCont.addEventListener('click', () => {
    openSaveListModal();
  });

  btnStart.addEventListener('click', () => {
    const name = nameInput.value.trim() || getDefaultCityName();
    startNewGame(name);
  });

  btnGenerateTerrain?.addEventListener('click', () => {
    const profile = terrainProfileSelect?.value || 'island';
    startTerrainCreatorMode(profile, createSeed());
  });

  btnBack.addEventListener('click', () => {
    setLandingState('menu');
  });

  btnTerrainBack?.addEventListener('click', () => {
    setLandingState('menu');
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const name = nameInput.value.trim() || getDefaultCityName();
      startNewGame(name);
    }
  });

  terrainSourceSelect?.addEventListener('change', () => {
    updateTerrainSourceVisibility();
    if (terrainSourceSelect.value === 'preset') {
      refreshTerrainPresetOptions();
    }
  });

  terrainPresetSelect?.addEventListener('change', () => {
    setSelectedTerrainPreset(terrainPresetSelect.value);
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
}

function hideLandingScreen() {
  const screen = document.getElementById('landing-screen');
  if (screen) screen.style.display = 'none';

  if (typeof enterGameplayAudioMode === 'function') enterGameplayAudioMode();

  // Start ticker only once the game session actually begins (not at page load).
  // startTicker() is re-entrant-safe: it clears any existing timer before restarting.
  if (typeof startTicker === 'function') startTicker();
}

function copyTerrainToWorld(mapRows, heightRows) {
  mapData = createFilledMap(GROUND);
  heightMap = createFilledMap(0);
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

  flattenMapBorder(mapData, heightMap, 3);
}

function rebuildFreshMapSession(cityName) {
  clearAllOverlays(activeScene);
  clearBuildings(activeScene);
  resetGameState();
  if (!isTerrainCreatorMode) {
    generateInitialTrees(activeScene);
    rebuildTreeSprites(activeScene);
  }
  city.name = cityName || getDefaultCityName();
  refreshAllTiles(activeScene);
  updateHUD();
}

function startTerrainCreatorMode(profileType, seedText) {
  if (!gameReady || !activeScene) return;

  stopSimTimer();
  simPaused = true;
  isTerrainCreatorMode = true;
  activeTerrainProfileType = profileType;
  currentSeed = seedText || createSeed();
  mapData = generateTerrainMapByProfile(profileType, currentSeed);
  rebuildFreshMapSession(getDefaultCityName());
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
  let presetName = fallbackName;
  try {
    const entered = window.prompt(t('prompt.terrainPresetName'), fallbackName);
    if (entered === null) return;
    presetName = entered.trim() || fallbackName;
  } catch {
    presetName = `${fallbackName}-${Date.now().toString().slice(-6)}`;
  }

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

async function startNewGame(cityName) {
  if (!gameReady) return;

  const terrainSourceSelect = document.getElementById('newgame-terrain-source');
  const terrainPresetSelect = document.getElementById('newgame-terrain-preset');
  const roadTileSetSelect = document.getElementById('newgame-road-tile-set');
  const source = terrainSourceSelect?.value || 'random';

  stopSimTimer();
  isTerrainCreatorMode = false;
  activeTerrainProfileType = 'custom';
  setTerrainEditorUiActive(false);

  if (source === 'preset') {
    const selectedId = (terrainPresetSelect?.value || '').trim();
    if (!selectedId) {
      showToast(t('landing.terrainPresetRequired'), 'warning');
      return;
    }

    try {
      let terrain = null;
      if (selectedId.startsWith('builtin:')) {
        terrain = getBuiltInCityTerrainData(selectedId);
      } else {
        const row = await getTerrainPresetById(selectedId);
        terrain = row?.terrain_data;
      }

      if (!terrain?.mapData || !terrain?.heightMap) {
        throw new Error(`Missing terrain data for preset ${selectedId}`);
      }

      copyTerrainToWorld(terrain.mapData, terrain.heightMap);
      currentSeed = terrain?.seed || createSeed();
      currentTerrainMetadata = {
        generatorVersion: terrain?.generatorVersion ?? 2,
        profileType: terrain?.profileType ?? 'custom',
        seed: currentSeed,
        features: terrain?.features ?? [],
      };
    } catch (error) {
      console.error('[TerrainPreset Load]', error);
      showToast(t('toast.terrainPresetLoadFailed'), 'danger');
      return;
    }
  } else {
    currentSeed = createSeed();
    mapData = generateTerrainMap(currentSeed);
  }

  if (typeof setRoadTileSet === 'function') {
    setRoadTileSet(roadTileSetSelect?.value || ROAD_TILE_SET_DEFAULT_ID, { refresh: false });
  }

  if (typeof currentSaveId !== 'undefined') currentSaveId = null;

  rebuildFreshMapSession(cityName || getDefaultCityName());
  simPaused = false;
  simSpeedMul = simSpeedMul || 1;
  startSimTimer();
  hideLandingScreen();
}

async function renameCityPrompt() {
  const newName = await showTextPromptDialog(t('prompt.cityName'), city.name || getDefaultCityName());
  if (newName !== null && newName.trim()) {
    city.name = newName.trim().slice(0, 30);
    updateHUD();
  }
}
