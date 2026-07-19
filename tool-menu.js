function setupToolMenu() {
  const menu = document.getElementById('tool-menu');
  if (!menu) return;

  const collapseBtn = document.getElementById('tool-menu-collapse');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.classList.toggle('is-collapsed');
      collapseBtn.textContent = menu.classList.contains('is-collapsed') ? '▶' : '◀';
      closeToolCategoryFlyouts();
      closeToolPopups();
    });
  }

  menu.addEventListener('pointerdown', (event) => event.stopPropagation());
  menu.addEventListener('pointerenter', cancelZoneDensityClose);
  menu.addEventListener('pointerenter', cancelParkPickerClose);
  menu.addEventListener('pointerleave', () => {
    scheduleZoneDensityClose();
    scheduleParkPickerClose();
  });

  // Speed controls
  const speedControls = document.getElementById('speed-controls');
  if (speedControls) {
    speedControls.addEventListener('pointerdown', (e) => e.stopPropagation());
    speedControls.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-speed]');
      if (!btn) return;
      const speed = Number(btn.dataset.speed);
      setSimSpeed(speed);
      speedControls.querySelectorAll('.speed-btn').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
    });
  }
  setupHouseToolMenu(menu);
  setupTerrainTool(menu);
  setupZoneDensityTools(menu);
  setupParkTool(menu);
  initSportsGroundToolMenu(menu);
  setupGroupedToolMenus(menu);

  window.addEventListener('pointerup', () => {
    const wasPainting = isPainting;
    // ── Zone rect-fill (BEFORE clearing state) ────────────────────────────────
    // Phaser defers its own pointerup event to the next update() frame, so the
    // window handler fires first.  We use this guaranteed-synchronous callback
    // to apply the rectangle fill while dragStartTile is still valid.
    if (isPainting && dragStartTile && isZoneTool() && activeScene) {
      const endTile = lastKnownTile ?? dragStartTile;
      fillZoneRect(activeScene, dragStartTile, endTile);
    }
    if (isPainting && dragStartTile && selectedTool === 'road' && activeScene) {
      const endTile = lastKnownTile ?? dragStartTile;
      commitRoadDrag(activeScene, dragStartTile, endTile);
    }
    if (activeScene?.zonePreviewGraphic)        activeScene.zonePreviewGraphic.clear();
    if (activeScene?.bridgePreviewGraphic)      activeScene.bridgePreviewGraphic.clear();
    if (activeScene?.buildingGuideGraphic)      activeScene.buildingGuideGraphic.clear();
    if (activeScene?.inspectHighlightGraphic)   activeScene.inspectHighlightGraphic.clear();

    // ── Clear paint state ─────────────────────────────────────────────────────
    isPainting     = false;
    lastEditedTile = null;
    dragStartTile  = null;
    lastPaintTile  = null;
    lastKnownTile  = null;
    clearHousePressTimer();
    clearTerrainPressTimer();
    Object.keys(zonePressTimers).forEach(clearZonePressTimer);
    if (wasPainting) closeToolPopups();
  });
  window.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#tool-menu') && !event.target.closest('#zone-density-menu') && !event.target.closest('#park-picker')) {
      closeToolCategoryFlyouts();
    }
    if (event.target.closest('#house-size-menu') || event.target.closest('[data-tool="house"]')) return;
    closeHouseSizeMenu();
    if (!event.target.closest('#terrain-picker') && !event.target.closest('[data-tool="terrain"]')) {
      closeTerrainPicker();
    }
    if (!event.target.closest('#zone-density-menu') && !event.target.closest('[data-zone-type]')) {
      closeZoneDensityMenu();
    }
    if (!event.target.closest('#park-picker') && !event.target.closest('[data-tool="park"]')) {
      closeParkPicker();
    }
    if (!event.target.closest('#sports-ground-picker') && !event.target.closest('[data-tool="sports-ground"]')) {
      closeSportsGroundPicker();
    }
  });

  menu.addEventListener('click', (event) => {
    const groupButton = event.target.closest('[data-tool-group]');
    if (groupButton) {
      toggleToolGroup(groupButton);
      return;
    }

    const categoryButton = event.target.closest('[data-tool-category]');
    if (categoryButton) {
      if (categoryButton.dataset.toolCategory === 'inspect') {
        selectedTool = 'inspect';
        menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
          toolButton.classList.toggle('is-active', toolButton.dataset.tool === 'inspect');
        });
        updateToolCategoryState(menu, selectedTool);
        closeToolCategoryFlyouts();
        closeToolPopups();
        return;
      }
      toggleToolCategory(categoryButton);
      closeZoneDensityMenu();
      if (categoryButton.dataset.toolCategory !== 'parks') closeParkPicker();
      return;
    }

    const overlayButton = event.target.closest('[data-overlay]');
    if (overlayButton) {
      if (isTerrainCreatorMode) return;
      toggleOverlayMap(overlayButton.dataset.overlay);
      closeToolCategoryFlyouts();
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (actionButton?.dataset.action === 'generate') {
      generateNewTerrain();
      closeToolCategoryFlyouts();
      return;
    }
    if (actionButton?.dataset.action === 'save-terrain') {
      saveTerrainPresetFromCurrentMap();
      closeToolCategoryFlyouts();
      return;
    }
    if (actionButton?.dataset.action === 'save') {
      saveGame();
      closeToolCategoryFlyouts();
      return;
    }
    if (actionButton?.dataset.action === 'rotate') {
      if (activeScene) rotateMap(activeScene, 1);
      closeToolCategoryFlyouts();
      return;
    }
    if (actionButton?.dataset.action === 'open-charts') {
      if (isTerrainCreatorMode) return;
      toggleChartWindow();
      closeToolCategoryFlyouts();
      return;
    }
    if (actionButton?.dataset.action === 'open-overlay-maps') {
      if (isTerrainCreatorMode) return;
      // Open the overlay window, defaulting to the last active overlay or 'pollution'
      const defaultOverlay = (typeof activeOverlay === 'string' && activeOverlay) ? activeOverlay : 'pollution';
      toggleOverlayMap(defaultOverlay);
      closeToolCategoryFlyouts();
      return;
    }
    if (actionButton?.dataset.action === 'open-council-meeting') {
      if (isTerrainCreatorMode || (typeof isCouncilMeetingUnlocked === 'function' && !isCouncilMeetingUnlocked())) return;
      openLegislativeWindow();
      closeToolCategoryFlyouts();
      return;
    }

    const parkShortcut = event.target.closest('[data-park-shortcut]');
    if (parkShortcut) {
      selectedParkId = parkShortcut.dataset.parkShortcut;
      selectedTool = 'park';
      updateParkToolUi();
      updateToolCategoryState(menu, selectedTool);
      closeToolPopups();
      return;
    }

    const button = event.target.closest('[data-tool]');
    if (!button) return;

    if (isTerrainCreatorMode && button.dataset.tool !== 'terrain') {
      showToast(t('toast.terrainCreatorOnlyTerrainTools'), 'warning');
      closeToolCategoryFlyouts();
      return;
    }

    // ── House tool ────────────────────────────────────────────────────────
    if (button.dataset.tool === 'house' && didLongPressHouse) {
      didLongPressHouse = false;
      return;
    }
    if (button.dataset.tool === 'house') {
      selectedTool = 'house';
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === button);
      });
      updateToolCategoryState(menu, selectedTool);
      updateHouseToolUi();
      toggleHouseSizeMenu(button);
      closeToolCategoryFlyouts();
      return;
    }

    // ── Terrain tool ──────────────────────────────────────────────────────
    if (button.dataset.tool === 'terrain' && didLongPressTerrain) {
      didLongPressTerrain = false;
      return;
    }
    if (button.dataset.tool === 'terrain') {
      selectedTool = 'terrain';
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === button);
      });
      updateToolCategoryState(menu, selectedTool);
      updateTerrainToolUi();
      toggleTerrainPicker(button);
      closeToolCategoryFlyouts();
      return;
    }

    // ── Zone tools ────────────────────────────────────────────────────────
    const zoneType = button.dataset.zoneType;
    if (zoneType) {
      selectedTool = button.dataset.tool;
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === button);
      });
      updateToolCategoryState(menu, selectedTool);
      updateZoneDensityBadges();
      openZoneDensityMenu(button.dataset.tool, button);
      return;
    }

    // ── Park tool ────────────────────────────────────────────────────────
    if (button.dataset.tool === 'park') {
      selectedTool = 'park';
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === button);
      });
      updateToolCategoryState(menu, selectedTool);
      openParkPicker(button);
      return;
    }

    // ── Landmark tools (population/policy gated) ───────────────────────────
    const landmarkBuildingType = LANDMARK_TOOL_BUILDING_TYPES[button.dataset.tool];
    if (landmarkBuildingType && typeof getSpecialBuildingUnlockState === 'function') {
      const state = getSpecialBuildingUnlockState(landmarkBuildingType);
      if (!state.unlocked) {
        showToast(describeSpecialBuildingLockReason(state), 'warning');
        closeToolCategoryFlyouts();
        return;
      }
    }

    selectedTool = button.dataset.tool;
    menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
      toolButton.classList.toggle('is-active', toolButton === button);
    });
    updateToolCategoryState(menu, selectedTool);
    updateHouseToolUi();
    closeToolPopups();

    // When switching away from inspect: clear the highlight and hide the tooltip.
    // When switching TO inspect: nothing to do — hover will show them naturally.
    if (selectedTool !== 'inspect') {
      lastInspectTile = null;
      if (activeScene?.inspectHighlightGraphic) activeScene.inspectHighlightGraphic.clear();
      const dbgEl = document.getElementById('tile-debug');
      if (dbgEl) dbgEl.style.display = 'none';
    }
  });

  menu.querySelectorAll('[data-tool-category]').forEach((categoryButton) => {
    categoryButton.addEventListener('pointerenter', () => {
      if (!document.querySelector('.tool-flyout.is-open')) return;
      if (categoryButton.dataset.toolCategory === 'inspect') {
        closeToolCategoryFlyouts();
        closeToolPopups();
        return;
      }
      const panel = document.querySelector(`.tool-flyout[data-tool-panel="${categoryButton.dataset.toolCategory}"]`);
      if (panel) openToolCategory(categoryButton, panel);
    });
  });

  setupJukebox();
  setupRotateCluster();
  setupTerrainMiniMapControls();
  initChartControls();
  updateLandmarkToolUi();
}

function getToolCategoryForTool(tool) {
  if (tool === 'inspect') return 'inspect';
  if (tool === 'terrain') return 'terrain';
  if (tool === 'road') return 'roads';
  if (tool === 'district-sign') return 'maps';
  if (tool === 'zone-res' || tool === 'zone-com' || tool === 'zone-ind' || tool === 'dezone') return 'zones';
  if (tool === 'power-line' || tool === 'power-coal' || tool === 'power-solar') return 'power';
  if (
    tool === 'fire-station'
    || tool === 'police-station'
    || tool === 'hospital'
    || tool === 'primary-school'
    || tool === 'secondary-school'
    || tool === 'community-college'
    || tool === 'university'
    || tool === 'legislative-council'
    || tool === 'stock-exchange'
    || tool === 'harbor'
    || tool === 'airport'
  ) return 'services';
  if (
    tool === 'park'
    || tool === 'sports-ground'
    || tool === 'tree'
    || tool === 'library'
    || tool === 'cultural-center'
    || tool === 'space-museum'
    || tool === 'indoor-coliseum'
    || tool === 'football-stadium'
  ) return 'parks';
  if (
    tool === 'exhibition-center'
    || tool === 'buddha-statue'
    || tool === 'heritage-temple'
    || tool === 'heritage-church'
    || tool === 'murray-house'
    || tool === 'ocean-park'
  ) return 'landmarks';
  if (tool === 'house') return 'buildings';
  return null;
}

function updateToolCategoryState(menu = document.getElementById('tool-menu'), tool = selectedTool) {
  if (!menu) return;
  clearPlacementGuides();
  const activeCategory = getToolCategoryForTool(tool);
  menu.querySelectorAll('[data-tool-category]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.toolCategory === activeCategory);
  });
  menu.querySelectorAll('.tool-flyout [data-tool]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tool === tool);
  });
  menu.querySelectorAll('[data-tool-group]').forEach((button) => {
    const items = menu.querySelector(`[data-tool-group-items="${button.dataset.toolGroup}"]`);
    const selectedPoolShortcut = tool === 'park' && selectedParkId === 'swimming_pool';
    const containsActiveTool = selectedPoolShortcut
      ? Boolean(items?.querySelector('[data-park-shortcut="swimming_pool"]'))
      : Boolean(items?.querySelector(`[data-tool="${tool}"]`));
    button.classList.toggle('has-active-tool', containsActiveTool);
  });
}

function clearPlacementGuides() {
  activeScene?.buildingGuideGraphic?.clear();
}

function toggleToolCategory(categoryButton) {
  const category = categoryButton?.dataset.toolCategory;
  const panel = category ? document.querySelector(`.tool-flyout[data-tool-panel="${category}"]`) : null;
  if (!panel) return;
  if (panel.classList.contains('is-open')) {
    closeToolCategoryFlyouts();
    return;
  }
  openToolCategory(categoryButton, panel);
}

function openToolCategory(categoryButton, panel) {
  closeToolCategoryFlyouts();
  positionToolFlyout(categoryButton, panel);
  categoryButton.classList.add('is-open');
  panel.classList.add('is-open');
}

function positionToolFlyout(categoryButton, panel) {
  const bounds = categoryButton.getBoundingClientRect();
  const menu = document.getElementById('tool-menu');
  const menuBounds = menu?.getBoundingClientRect();
  panel.style.maxHeight = '';
  panel.style.left = `${Math.round((menuBounds?.right ?? bounds.right) + 8)}px`;
  panel.style.top = `${Math.max(8, Math.min(bounds.top, window.innerHeight - 48))}px`;

  requestAnimationFrame(() => {
    const panelBounds = panel.getBoundingClientRect();
    const maxTop = Math.max(8, window.innerHeight - panelBounds.height - 8);
    const top = Math.max(8, Math.min(bounds.top, maxTop));
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${Math.max(120, window.innerHeight - top - 8)}px`;
  });
}

function closeToolCategoryFlyouts() {
  const menu = document.getElementById('tool-menu');
  menu?.querySelectorAll('[data-tool-category].is-open').forEach((button) => {
    button.classList.remove('is-open');
  });
  document.querySelectorAll('.tool-flyout.is-open').forEach((panel) => {
    panel.classList.remove('is-open');
  });
  closeToolGroups();
}

function setupGroupedToolMenus(menu) {
  menu.querySelectorAll('[data-tool-group]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
}

function toggleToolGroup(button) {
  const panel = button.closest('.tool-flyout');
  const items = panel?.querySelector(`[data-tool-group-items="${button.dataset.toolGroup}"]`);
  if (!panel || !items) return;
  const shouldOpen = items.hidden;
  closeToolGroups(panel);
  if (!shouldOpen) return;
  items.hidden = false;
  button.classList.add('is-open');
  button.setAttribute('aria-expanded', 'true');
  const category = panel.dataset.toolPanel;
  const categoryButton = document.querySelector(`[data-tool-category="${category}"]`);
  if (categoryButton) positionToolFlyout(categoryButton, panel);
  requestAnimationFrame(() => button.scrollIntoView({ block: 'nearest' }));
}

function closeToolGroups(root = document) {
  root.querySelectorAll('[data-tool-group].is-open').forEach((button) => {
    button.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  });
  root.querySelectorAll('[data-tool-group-items]').forEach((items) => {
    items.hidden = true;
  });
}

function setupHouseToolMenu(menu) {
  const houseButton = menu.querySelector('[data-tool="house"]');
  const sizeMenu = document.getElementById('house-size-menu');
  if (!houseButton || !sizeMenu) return;

  houseButton.addEventListener('pointerdown', () => {
    didLongPressHouse = false;
    clearHousePressTimer();
    housePressTimer = window.setTimeout(() => {
      didLongPressHouse = true;
      selectedTool = 'house';
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === houseButton);
      });
      updateToolCategoryState(menu, selectedTool);
      openHouseSizeMenu(houseButton);
      closeToolCategoryFlyouts();
    }, 450);
  });

  houseButton.addEventListener('pointerleave', clearHousePressTimer);

  sizeMenu.addEventListener('pointerdown', (event) => event.stopPropagation());
  sizeMenu.addEventListener('click', (event) => {
    const modelButton = event.target.closest('[data-house-model-index]');
    if (modelButton) {
      const setKey = modelButton.dataset.houseModelSet;
      const index = Number(modelButton.dataset.houseModelIndex);
      if (!setKey || Number.isNaN(index)) return;
      selectedHouseSet = setKey;
      selectedTool = 'house';
      setSelectedHouseIndex(setKey, index);
      updateHouseToolUi();
      openHouseSizeMenu();
      return;
    }

    const button = event.target.closest('[data-house-set]');
    if (!button) return;

    selectedHouseSet = button.dataset.houseSet;
    selectedTool = 'house';
    setSelectedHouseIndex(selectedHouseSet, getSelectedHouseIndex(selectedHouseSet));
    updateHouseToolUi();
    openHouseSizeMenu();
  });
}

function clearHousePressTimer() {
  if (!housePressTimer) return;
  window.clearTimeout(housePressTimer);
  housePressTimer = null;
}

// ── Terrain tool (single button + long-press popup) ───────────────────────────

function setupTerrainTool(menu) {
  const terrainButton = menu.querySelector('[data-tool="terrain"]');
  const picker = document.getElementById('terrain-picker');
  if (!terrainButton || !picker) return;

  terrainButton.addEventListener('pointerdown', () => {
    didLongPressTerrain = false;
    clearTerrainPressTimer();
    terrainPressTimer = window.setTimeout(() => {
      didLongPressTerrain = true;
      selectedTool = 'terrain';
      menu.querySelectorAll('[data-tool]').forEach((btn) => {
        btn.classList.toggle('is-active', btn === terrainButton);
      });
      updateToolCategoryState(menu, selectedTool);
      openTerrainPicker(terrainButton);
      closeToolCategoryFlyouts();
    }, 450);
  });

  terrainButton.addEventListener('pointerleave', clearTerrainPressTimer);

  picker.addEventListener('pointerdown', (e) => e.stopPropagation());
  picker.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-terrain-key]');
    if (!btn) return;
    selectedTerrainType = btn.dataset.terrainKey;
    selectedTool = 'terrain';
    closeTerrainPicker();
    updateTerrainToolUi();
    // Activate the terrain button
    menu.querySelectorAll('[data-tool]').forEach((b) => {
      b.classList.toggle('is-active', b === terrainButton);
    });
  });
}

function clearTerrainPressTimer() {
  if (!terrainPressTimer) return;
  window.clearTimeout(terrainPressTimer);
  terrainPressTimer = null;
}

function openTerrainPicker(triggerButton = document.querySelector('[data-tool="terrain"]')) {
  const picker = document.getElementById('terrain-picker');
  if (!picker) return;

  picker.innerHTML = '';
  TERRAIN_OPTIONS.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'popup-button';
    btn.type = 'button';
    btn.dataset.terrainKey = opt.key;
    btn.classList.toggle('is-active', opt.key === selectedTerrainType);
    const labelText = getTerrainLabel(opt);
    btn.title = labelText;

    const swatch = document.createElement('span');
    swatch.className = `swatch ${opt.swatchClass}`;
    swatch.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'popup-label';
    label.textContent = labelText;

    btn.append(swatch, label);
    picker.append(btn);
  });

  const triggerBounds = triggerButton?.getBoundingClientRect();
  if (triggerBounds) {
    picker.style.left = `${Math.round(triggerBounds.right + 8)}px`;
    picker.style.top = `${triggerBounds.top}px`;
  }

  picker.classList.add('is-open');
}

function closeTerrainPicker() {
  document.getElementById('terrain-picker')?.classList.remove('is-open');
}

function toggleTerrainPicker(triggerButton) {
  const picker = document.getElementById('terrain-picker');
  if (picker?.classList.contains('is-open')) closeTerrainPicker();
  else openTerrainPicker(triggerButton);
}

function updateTerrainToolUi() {
  const swatch = document.getElementById('terrain-tool-swatch');
  const badge  = document.getElementById('terrain-tool-badge');
  const opt = TERRAIN_OPTIONS.find((o) => o.key === selectedTerrainType) ?? TERRAIN_OPTIONS[0];

  if (swatch) {
    swatch.className = `swatch ${opt.swatchClass}`;
  }
  if (badge) {
    badge.textContent = opt.emoji;
  }

  const btn = document.querySelector('[data-tool="terrain"]');
  if (btn) {
    btn.title = t('tool.terrain', { terrain: getTerrainLabel(opt) });
    btn.setAttribute('aria-label', btn.title);
  }
}

function setTerrainEditorUiActive(active) {
  document.body?.classList.toggle('terrain-editor-mode', !!active);
  if (active) {
    closeOverlayWindow();
    closeToolPopups();
    closeToolCategoryFlyouts();
    document.getElementById('budget-detail')?.classList.remove('is-open');
    document.getElementById('budget-window')?.classList.remove('is-open');
    document.getElementById('inspect-panel')?.style.setProperty('display', 'none');
    selectedTool = 'terrain';
    updateToolCategoryState();
    updateTerrainToolUi();
    scheduleTerrainMiniMapUpdate();
  } else {
    if (terrainMiniMapRaf !== null) {
      cancelAnimationFrame(terrainMiniMapRaf);
      terrainMiniMapRaf = null;
    }
  }
}

// ── Zone density tools (Windows-style cascading submenu) ─────────────────────

let zoneDensityCloseTimer = null;

function setupZoneDensityTools(menu) {
  const densityMenu = document.getElementById('zone-density-menu');
  if (!densityMenu) return;

  menu.querySelectorAll('[data-tool-category]').forEach((button) => {
    button.addEventListener('pointerenter', () => {
      if (button.dataset.toolCategory !== 'zones') closeZoneDensityMenu();
    });
  });

  menu.querySelectorAll('.tool-flyout').forEach((panel) => {
    panel.addEventListener('pointerenter', cancelZoneDensityClose);
    panel.addEventListener('pointerleave', () => scheduleZoneDensityClose());
  });

  menu.querySelectorAll('.tool-row:not([data-zone-type])').forEach((button) => {
    button.addEventListener('pointerenter', closeZoneDensityMenu);
  });

  ['zone-res', 'zone-com', 'zone-ind'].forEach((toolKey) => {
    const btn = menu.querySelector(`[data-tool="${toolKey}"]`);
    if (!btn) return;

    btn.addEventListener('pointerenter', () => {
      cancelZoneDensityClose();
      openZoneDensityMenu(toolKey, btn);
    });

    btn.addEventListener('pointerleave', () => scheduleZoneDensityClose());
  });

  densityMenu.addEventListener('pointerenter', cancelZoneDensityClose);
  densityMenu.addEventListener('pointerleave', () => scheduleZoneDensityClose());
  densityMenu.addEventListener('pointerdown', (e) => e.stopPropagation());
  densityMenu.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-density]');
    if (!btn) return;
    const zoneType = densityMenu.dataset.currentZone; // 'res', 'com', or 'ind'
    const density  = Number(btn.dataset.density);
    if (zoneType) selectedZoneDensity[zoneType] = density;
    closeZoneDensityMenu();
    updateZoneDensityBadges();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeZoneDensityMenu();
  });
}

function clearZonePressTimer(toolKey) {
  if (!zonePressTimers[toolKey]) return;
  window.clearTimeout(zonePressTimers[toolKey]);
  zonePressTimers[toolKey] = null;
}

function openZoneDensityMenu(toolKey, triggerButton) {
  const densityMenu = document.getElementById('zone-density-menu');
  if (!densityMenu) return;
  cancelZoneDensityClose();

  // Determine zone letter and current density
  const zoneType = toolKey.replace('zone-', '');          // 'res', 'com', 'ind'
  const letter   = zoneType === 'res' ? 'R' : zoneType === 'com' ? 'C' : 'I';
  const colorKey = zoneType;
  const baseCost = zoneType === 'res' ? 50 : zoneType === 'com' ? 60 : 50;
  const currentDensity = selectedZoneDensity[zoneType] ?? 1;

  densityMenu.dataset.currentZone = zoneType;
  densityMenu.innerHTML = '';

  ZONE_DENSITY_OPTIONS.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'popup-button';
    btn.type = 'button';
    btn.dataset.density = opt.density;
    btn.classList.toggle('is-active', opt.density === currentDensity);

    const block = document.createElement('span');
    block.className = `zone-block ${colorKey}`;
    block.textContent = `${letter}${opt.density}`;

    const label = document.createElement('span');
    label.className = 'popup-label';
    label.textContent = t(opt.labelKey);

    const cost = document.createElement('span');
    cost.className = 'popup-cost';
    cost.textContent = `$${Math.round(baseCost * [1, 1.5, 2.5][opt.density - 1])}`;

    btn.append(block, label, cost);
    densityMenu.append(btn);
  });

  const bounds = triggerButton.getBoundingClientRect();
  densityMenu.style.left = `${Math.round(bounds.right + 8)}px`;
  densityMenu.style.top = `${bounds.top}px`;
  densityMenu.classList.add('is-open');
}

function closeZoneDensityMenu() {
  cancelZoneDensityClose();
  document.getElementById('zone-density-menu')?.classList.remove('is-open');
}

function scheduleZoneDensityClose(delay = 220) {
  cancelZoneDensityClose();
  zoneDensityCloseTimer = window.setTimeout(() => {
    zoneDensityCloseTimer = null;
    document.getElementById('zone-density-menu')?.classList.remove('is-open');
  }, delay);
}

function cancelZoneDensityClose() {
  if (!zoneDensityCloseTimer) return;
  window.clearTimeout(zoneDensityCloseTimer);
  zoneDensityCloseTimer = null;
}

function toggleZoneDensityMenu(toolKey, triggerButton) {
  const densityMenu = document.getElementById('zone-density-menu');
  const zoneType = toolKey.replace('zone-', '');
  if (densityMenu?.classList.contains('is-open') && densityMenu.dataset.currentZone === zoneType) {
    closeZoneDensityMenu();
  } else {
    openZoneDensityMenu(toolKey, triggerButton);
  }
}

function updateZoneDensityBadges() {
  const ZONE_COSTS = { res: COST_ZONE_RES, com: COST_ZONE_COM, ind: COST_ZONE_IND };
  ['res', 'com', 'ind'].forEach((type) => {
    const el = document.getElementById(`zone-${type}-badge`);
    const density = selectedZoneDensity[type] ?? 1;
    const letter = type === 'res' ? 'R' : type === 'com' ? 'C' : 'I';
    if (el) el.textContent = `${letter}${density}`;

    // Update button tooltip to reflect current density + cost
    const btn = document.querySelector(`[data-tool="zone-${type}"]`);
    if (btn) {
      const cost = Math.round((ZONE_COSTS[type] ?? 50) * (DENSITY_COST_MUL[density] ?? 1));
      const zone = getZoneLabel(type);
      const densityName = getDensityLabel(density);
      const title = t('tool.zone', { zone, density: densityName, cost });
      btn.title = title;
      btn.setAttribute('aria-label', t('tool.zoneAria', { zone, density: densityName }));
    }
  });
}

// ── Park tool (Windows-style cascading submenu) ───────────────────────────────

let parkPickerCloseTimer = null;

function setupParkTool(menu) {
  const parkButton = menu.querySelector('[data-tool="park"]');
  const picker = document.getElementById('park-picker');
  if (!parkButton || !picker) return;

  menu.querySelectorAll('[data-tool-category]').forEach((button) => {
    button.addEventListener('pointerenter', () => {
      if (button.dataset.toolCategory !== 'parks') closeParkPicker();
    });
  });

  menu.querySelectorAll('.tool-flyout').forEach((panel) => {
    panel.addEventListener('pointerenter', cancelParkPickerClose);
    panel.addEventListener('pointerleave', () => scheduleParkPickerClose());
  });

  menu.querySelectorAll('.tool-row:not([data-tool="park"])').forEach((button) => {
    button.addEventListener('pointerenter', closeParkPicker);
  });

  parkButton.addEventListener('pointerenter', () => {
    cancelParkPickerClose();
    openParkPicker(parkButton);
  });

  parkButton.addEventListener('pointerleave', () => scheduleParkPickerClose());

  picker.addEventListener('pointerenter', cancelParkPickerClose);
  picker.addEventListener('pointerleave', () => scheduleParkPickerClose());
  picker.addEventListener('pointerdown', (event) => event.stopPropagation());
  picker.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-park-id]');
    if (!btn) return;

    selectedParkId = btn.dataset.parkId;
    selectedTool = 'park';
    closeParkPicker();
    updateParkToolUi();
    menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
      toolButton.classList.toggle('is-active', toolButton === parkButton);
    });
    updateToolCategoryState(menu, selectedTool);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeParkPicker();
  });
}

function openParkPicker(triggerButton = document.querySelector('[data-tool="park"]')) {
  const picker = document.getElementById('park-picker');
  if (!picker) return;
  cancelParkPickerClose();

  picker.innerHTML = '';
  PARK_OPTIONS.filter((opt) => opt.id !== 'swimming_pool').forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'popup-button';
    btn.type = 'button';
    btn.dataset.parkId = opt.id;
    btn.classList.toggle('is-active', opt.id === selectedParkId);

    const icon = document.createElement('span');
    icon.className = 'park-popup-icon';
    icon.textContent = opt.icon;
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'popup-label';
    label.textContent = `${getParkLabel(opt)} ${opt.badge}`;

    const cost = document.createElement('span');
    cost.className = 'popup-cost';
    cost.textContent = `$${opt.cost}`;

    btn.append(icon, label, cost);
    picker.append(btn);
  });

  const bounds = triggerButton?.getBoundingClientRect();
  if (bounds) {
    picker.style.left = `${Math.round(bounds.right + 8)}px`;
    picker.style.top = `${bounds.top}px`;
  }
  picker.classList.add('is-open');
}

function closeParkPicker() {
  cancelParkPickerClose();
  document.getElementById('park-picker')?.classList.remove('is-open');
}

function scheduleParkPickerClose(delay = 220) {
  cancelParkPickerClose();
  parkPickerCloseTimer = window.setTimeout(() => {
    parkPickerCloseTimer = null;
    document.getElementById('park-picker')?.classList.remove('is-open');
  }, delay);
}

function cancelParkPickerClose() {
  if (!parkPickerCloseTimer) return;
  window.clearTimeout(parkPickerCloseTimer);
  parkPickerCloseTimer = null;
}

function getSelectedParkOption() {
  return PARK_OPTIONS.find((opt) => opt.id === selectedParkId) ?? PARK_OPTIONS[0];
}

function getParkOptionBySpriteKey(spriteKey) {
  return PARK_OPTIONS.find((opt) => opt.spriteKey === spriteKey)
    ?? PARK_OPTIONS.find((opt) => opt.spriteKey === 'park_small_open');
}

// ── Sports Ground picker ──────────────────────────────────────────────────────

let selectedSportsGroundId = 'sports_ground_small';
let sportsGroundPressTimer = null;

function getSelectedSportsGroundOption() {
  return SPORT_GROUND_OPTIONS.find((opt) => opt.id === selectedSportsGroundId) ?? SPORT_GROUND_OPTIONS[0];
}

function openSportsGroundPicker(triggerButton = document.querySelector('[data-tool="sports-ground"]')) {
  const picker = document.getElementById('sports-ground-picker');
  if (!picker) return;

  picker.innerHTML = '';
  SPORT_GROUND_OPTIONS.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'popup-button';
    btn.type = 'button';
    btn.dataset.sportId = opt.id;
    btn.classList.toggle('is-active', opt.id === selectedSportsGroundId);

    const icon = document.createElement('span');
    icon.className = 'park-popup-icon';
    icon.textContent = opt.icon;
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'popup-label';
    label.textContent = `${t(opt.titleKey)} ${opt.badge}`;

    const cost = document.createElement('span');
    cost.className = 'popup-cost';
    cost.textContent = `$${opt.cost}`;

    btn.append(icon, label, cost);
    picker.append(btn);
  });

  const bounds = triggerButton?.getBoundingClientRect();
  if (bounds) {
    picker.style.left = `${Math.round(bounds.right + 8)}px`;
    picker.style.top = `${bounds.top}px`;
  }
  picker.classList.add('is-open');
}

function closeSportsGroundPicker() {
  document.getElementById('sports-ground-picker')?.classList.remove('is-open');
}

function toggleSportsGroundPicker(triggerButton) {
  const picker = document.getElementById('sports-ground-picker');
  if (picker?.classList.contains('is-open')) closeSportsGroundPicker();
  else openSportsGroundPicker(triggerButton);
}

function updateSportsGroundToolUi() {
  const btn = document.querySelector('[data-tool="sports-ground"]');
  const badge = document.getElementById('sports-ground-tool-badge');
  const icon = document.getElementById('sports-ground-tool-icon');
  const opt = getSelectedSportsGroundOption();
  if (!btn || !opt) return;

  if (badge) badge.textContent = opt.badge;
  if (icon) icon.textContent = opt.icon;
  btn.title = t('tool.sportsGround', { name: t(opt.titleKey), badge: opt.badge, cost: opt.cost });
  btn.setAttribute('aria-label', btn.title);
}

function initSportsGroundToolMenu(menu) {
  const sgButton = menu.querySelector('[data-tool="sports-ground"]');
  if (!sgButton) return;

  const picker = document.getElementById('sports-ground-picker');
  if (!picker) return;

  sgButton.addEventListener('pointerdown', () => {
    sportsGroundPressTimer = window.setTimeout(() => {
      sportsGroundPressTimer = null;
      toggleSportsGroundPicker(sgButton);
    }, 350);
  });

  sgButton.addEventListener('pointerup', () => {
    if (sportsGroundPressTimer) {
      clearTimeout(sportsGroundPressTimer);
      sportsGroundPressTimer = null;
      selectedTool = 'sports-ground';
      closeSportsGroundPicker();
      updateSportsGroundToolUi();
      menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
        toolButton.classList.toggle('is-active', toolButton === sgButton);
      });
    }
  });

  sgButton.addEventListener('pointerleave', () => {
    if (!sportsGroundPressTimer) return;
    clearTimeout(sportsGroundPressTimer);
    sportsGroundPressTimer = null;
  });

  picker.addEventListener('pointerdown', (event) => event.stopPropagation());
  picker.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-sport-id]');
    if (!btn) return;
    selectedSportsGroundId = btn.dataset.sportId;
    selectedTool = 'sports-ground';
    closeSportsGroundPicker();
    updateSportsGroundToolUi();
    menu.querySelectorAll('[data-tool]').forEach((toolButton) => {
      toolButton.classList.toggle('is-active', toolButton === sgButton);
    });
  });
}

function updateParkToolUi() {
  const btn = document.querySelector('[data-tool="park"]');
  const badge = document.getElementById('park-tool-badge');
  const icon = document.getElementById('park-tool-icon');
  const opt = getSelectedParkOption();
  if (!btn || !opt) return;

  if (badge) badge.textContent = opt.badge;
  if (icon) icon.textContent = opt.icon;
  btn.title = t('tool.park', { name: getParkLabel(opt), badge: opt.badge, cost: opt.cost });
  btn.setAttribute('aria-label', btn.title);
}

// ── Landmark tools (population/policy gated) ──────────────────────────────

function describeSpecialBuildingLockReason(state) {
  if (state.reason === 'population') return t('toast.landmarkLocked.population', { count: state.threshold.toLocaleString() });
  if (state.reason === 'attractiveness') return t('toast.landmarkLocked.attractiveness', { value: state.threshold });
  if (state.reason === 'building') return t('toast.landmarkLocked.building', { building: t(`toolRow.${toCamelToolKey(state.requires)}`) });
  if (state.reason === 'policy') return t('toast.landmarkLocked.policy', { policy: t(`policy.${state.requires}.title`) });
  if (state.reason === 'resolution') return t('toast.landmarkLocked.resolution', { resolution: t(`resolution.${state.requires}.title`) });
  if (state.reason === 'maxCount') return t('toast.landmarkLocked.maxCount');
  return t('toast.landmarkLocked.generic');
}

function toCamelToolKey(buildingType) {
  return String(buildingType).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function updateLandmarkToolUi() {
  if (typeof getSpecialBuildingUnlockState !== 'function') return;
  Object.entries(LANDMARK_TOOL_BUILDING_TYPES).forEach(([tool, buildingType]) => {
    const row = document.querySelector(`.tool-row[data-tool="${tool}"]`);
    if (!row) return;
    const state = getSpecialBuildingUnlockState(buildingType);
    const rule = SPECIAL_BUILDING_UNLOCKS[buildingType];
    row.hidden = Boolean(rule?.hideUntilApproved && !state.unlocked);
    row.classList.toggle('is-locked', !state.unlocked);
    row.title = state.unlocked ? '' : describeSpecialBuildingLockReason(state);
  });
}

// ── Overlay map floating window ───────────────────────────────────────────────

const OVERLAY_TITLES = {
  pollution:   'overlay.pollution',
  crime:       'overlay.crime',
  fire:        'overlay.fire',
  population:  'overlay.population',
  landvalue:   'overlay.landvalue',
  education:   'overlay.education',
  health:      'overlay.health',
  electricity: 'overlay.electricity',
  power:       'overlay.power',
  traffic:     'overlay.traffic',
};
const OVERLAY_ICONS = {
  pollution: '🏭', crime: '🚔', fire: '🔥', population: '👥', landvalue: '💰', education: '🎓', health: '🏥', electricity: '🔌', power: '⚡', traffic: '🚦',
};
