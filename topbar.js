// ── Top Menu Bar ──────────────────────────────────────────────────────────────

function setupMenuBar() {
  const topBar = document.getElementById('top-bar');
  const menuBar = document.getElementById('menu-bar');
  const moreBtn = document.getElementById('topbar-more-btn');
  if (!topBar) return;

  // Block Phaser from seeing pointer events on the bar
  topBar.addEventListener('pointerdown', (e) => e.stopPropagation());
  topBar.addEventListener('click',       (e) => e.stopPropagation());

  if (moreBtn && menuBar) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !menuBar.classList.contains('is-open');
      closeAllMenus();
      menuBar.classList.toggle('is-open', willOpen);
      moreBtn.classList.toggle('is-open', willOpen);
    });
  }

  // ── Dropdown open/close ────────────────────────────────────────────────────
  topBar.querySelectorAll('.menu-item').forEach((item) => {
    item.querySelector('.menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuBar) menuBar.classList.add('is-open');
      if (moreBtn) moreBtn.classList.add('is-open');
      const wasOpen = item.classList.contains('is-open');
      closeAllMenus();
      if (menuBar) menuBar.classList.add('is-open');
      if (moreBtn) moreBtn.classList.add('is-open');
      if (!wasOpen) {
        item.classList.add('is-open');
        onMenuOpen(item.dataset.menu);
      }
    });
  });

  document.addEventListener('click', closeAllMenus);

  // ── Dropdown item actions ──────────────────────────────────────────────────
  topBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-menu-action]');
    if (!btn) return;
    e.stopPropagation();
    handleMenuAction(btn.dataset.menuAction, btn);
    // Close menus unless it's a slider or non-closing item
    if (!btn.classList.contains('menu-no-close')) closeAllMenus();
  });

  // ── Top-bar speed buttons ──────────────────────────────────────────────────
  topBar.querySelectorAll('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setSimSpeed(Number(btn.dataset.speed));
      updateSpeedButtons();
    });
  });

  // ── Volume slider (sync with jukebox) ─────────────────────────────────────
  const menuVol   = document.getElementById('menu-volume-slider');
  const jukeboxVol = document.getElementById('jukebox-volume');
  if (menuVol) {
    menuVol.addEventListener('input', () => {
      const value = Number(menuVol.value);
      if (jukeboxVol) jukeboxVol.value = value;
      if (typeof setStoredMusicVolume === 'function') setStoredMusicVolume(value);
      if (activeMusic) activeMusic.setVolume(value);
      if (titleLoadingAudio) titleLoadingAudio.volume = value;
    });
    menuVol.addEventListener('click', (e) => e.stopPropagation());
  }

  // ── City ambience volume slider ────────────────────────────────────────────
  const ambientVol = document.getElementById('menu-ambient-volume-slider');
  if (ambientVol) {
    if (typeof applyStoredAmbientVolume === 'function') applyStoredAmbientVolume();
    ambientVol.addEventListener('input', () => {
      if (typeof setStoredAmbientVolume === 'function') setStoredAmbientVolume(Number(ambientVol.value));
    });
    ambientVol.addEventListener('click', (e) => e.stopPropagation());
  }

  // ── Dialog close buttons ───────────────────────────────────────────────────
  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeDialog(btn.dataset.closeDialog);
    });
  });

  // Close dialogs on overlay click
  document.querySelectorAll('.dialog-overlay').forEach((overlay) => {
    overlay.addEventListener('click', () => {
      const dlg = overlay.closest('.sim-dialog');
      if (dlg) dlg.style.display = 'none';
    });
  });

  updateSettingsMenu();
  updateSoundMenu();
  updateViewMenu();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function closeAllMenus() {
  document.getElementById('menu-bar')?.classList.remove('is-open');
  document.getElementById('topbar-more-btn')?.classList.remove('is-open');
  document.querySelectorAll('.menu-item.is-open').forEach((item) => {
    item.classList.remove('is-open');
  });
}

function onMenuOpen(menuId) {
  if (menuId === 'news')     populateNewsMenu();
  if (menuId === 'settings') updateSettingsMenu();
  if (menuId === 'sound')    updateSoundMenu();
  if (menuId === 'view')     updateViewMenu();
}

// ── Action dispatcher ─────────────────────────────────────────────────────────

function handleMenuAction(action) {
  switch (action) {
    case 'save':
      if (typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode) saveTerrainPresetFromCurrentMap();
      else saveGame();
      break;
    case 'save-as':      saveAsGame();                      break;
    case 'load-game':    openSaveListModal();               break;
    case 'main-menu':    returnToMainMenu();                break;
    case 'toggle-auto-replace-plants':
      city.autoReplacePowerPlants = !city.autoReplacePowerPlants;
      updateSettingsMenu();
      break;
    case 'toggle-district-signs':
      if (typeof setDistrictSignsVisible === 'function') {
        setDistrictSignsVisible(!areDistrictSignsVisible());
      }
      if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
      updateViewMenu();
      break;
    case 'toggle-weather-effects':
      if (typeof setWeatherEffectsEnabled === 'function') {
        setWeatherEffectsEnabled(!isWeatherEffectsEnabled());
      }
      updateViewMenu();
      break;
    case 'open-ai-news-settings':
      if (typeof openAiNewsSettings === 'function') openAiNewsSettings();
      break;
    case 'open-forum-history':
      if (typeof openForumHistory === 'function') openForumHistory();
      break;
    case 'language-en':      setLanguage('en');      break;
    case 'language-zhHant':  setLanguage('zhHant');  break;
    case 'language-ja':      setLanguage('ja');      break;
    case 'open-road-tile-set':
      if (typeof openRoadTileSetWindow === 'function') openRoadTileSetWindow();
      break;
    case 'open-jukebox':  openJukebox(); break;
    case 'toggle-music': toggleMusic(); updateSoundMenu();  break;
    case 'fullscreen':   enterFullscreen(); break;
    case 'windowed':     exitFullscreen();  break;
    case 'show-help':    showDialog('help-dialog');         break;
    case 'show-about':   showDialog('about-dialog');        break;
  }
}

// ── Fullscreen ────────────────────────────────────────────────────────────────

function enterFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen)       el.requestFullscreen();
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  updateViewMenu();
}

function exitFullscreen() {
  if (document.exitFullscreen)       document.exitFullscreen();
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  updateViewMenu();
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function updateViewMenu() {
  const fs = isFullscreen();
  document.getElementById('menu-fullscreen-btn')?.classList.toggle('menu-checked',  fs);
  document.getElementById('menu-windowed-btn')  ?.classList.toggle('menu-checked', !fs);
  document.getElementById('menu-district-signs')
    ?.classList.toggle('menu-checked', typeof areDistrictSignsVisible !== 'function' || areDistrictSignsVisible());
  document.getElementById('menu-weather-effects')
    ?.classList.toggle('menu-checked', typeof isWeatherEffectsEnabled !== 'function' || isWeatherEffectsEnabled());
}

// Keep the checkmarks live as the user presses F11 or Esc
document.addEventListener('fullscreenchange',       updateViewMenu);
document.addEventListener('webkitfullscreenchange', updateViewMenu);

// ── Speed button highlight ────────────────────────────────────────────────────

function updateSpeedButtons() {
  const paused = !!simPaused;
  document.querySelectorAll('[data-speed]').forEach((btn) => {
    const s = Number(btn.dataset.speed);
    const active = paused ? s === 0 : (s === simSpeedMul && s !== 0);
    btn.classList.toggle('is-active', active);
  });
}

// ── News menu ─────────────────────────────────────────────────────────────────

function populateNewsMenu() {
  const dropdown = document.getElementById('menu-news-list');
  if (!dropdown) return;
  if (typeof syncResolutionHistoryToForum === 'function') syncResolutionHistoryToForum();

  if (typeof generateMonthlyForumPost === 'function' && !(city.forumPosts || []).length) {
    generateMonthlyForumPost();
  }
  const posts = (city.forumPosts || []).slice(-4).reverse();
  if (posts.length === 0) {
    dropdown.innerHTML = `<div class="menu-drop-empty">${t('menu.noNews')}</div>`;
    return;
  }
  dropdown.replaceChildren(...posts.map((post) => {
    const entry = document.createElement('div');
    entry.className = 'menu-news-entry';
    const date = document.createElement('span');
    date.className = 'menu-news-date';
    date.textContent = `${typeof getForumCategoryLabel === 'function' ? getForumCategoryLabel(post.category) : post.category} · ${post.date}`;
    const text = document.createElement('span');
    text.className = 'menu-news-text';
    text.textContent = post.headline;
    entry.append(date, text);
    return entry;
  }));
}

// ── Settings menu ─────────────────────────────────────────────────────────────

function updateSettingsMenu() {
  if (typeof updateRoadTileSetControls === 'function') updateRoadTileSetControls();
  document.getElementById('menu-auto-replace-plants')
    ?.classList.toggle('menu-checked', !!city.autoReplacePowerPlants);
  document.getElementById('menu-ai-news')
    ?.classList.toggle('menu-checked', typeof isAiNewsEnabled === 'function' && isAiNewsEnabled());
  ['en', 'zhHant', 'ja'].forEach((language) => {
    document.getElementById(`menu-lang-${language}`)
      ?.classList.toggle('menu-checked', getCurrentLanguage() === language);
  });
}

// ── Sound menu ────────────────────────────────────────────────────────────────

function updateSoundMenu() {
  const btn = document.getElementById('menu-music-btn');
  if (btn) btn.textContent = isMusicPlaying ? t('menu.musicOn') : t('menu.musicOff');
}

// ── File actions ──────────────────────────────────────────────────────────────

function returnToMainMenu() {
  // Auto-save current game, then go back to landing screen
  if (!isTerrainCreatorMode) {
    saveGame();   // async — fires in background; toast appears when done
  }
  isTerrainCreatorMode = false;
  if (typeof setTerrainEditorUiActive === 'function') setTerrainEditorUiActive(false);
  stopSimTimer();

  // Show landing screen in main-menu state
  const screen   = document.getElementById('landing-screen');
  const menuDiv  = document.getElementById('landing-menu');
  const nameForm = document.getElementById('landing-name-form');
  const terrainForm = document.getElementById('landing-terrain-form');
  if (screen)   screen.style.display   = 'flex';
  if (menuDiv)  menuDiv.style.display  = 'grid';
  if (nameForm) nameForm.style.display = 'none';
  if (terrainForm) terrainForm.style.display = 'none';
  if (typeof closeRoadTileSetWindow === 'function') closeRoadTileSetWindow();
}

// ── Dialog helpers ────────────────────────────────────────────────────────────

function showDialog(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeDialog(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

document.addEventListener('languagechange', () => {
  updateSettingsMenu();
  updateSoundMenu();
  populateNewsMenu();
  if (typeof updateHUD === 'function') updateHUD();
  if (typeof prefetchSaveStatus === 'function') prefetchSaveStatus();
  if (typeof updateTerrainToolUi === 'function') updateTerrainToolUi();
  if (typeof updateZoneDensityBadges === 'function') updateZoneDensityBadges();
  if (typeof updateParkToolUi === 'function') updateParkToolUi();
  if (typeof updateOverlayWindow === 'function') updateOverlayWindow();
  if (typeof refreshInspectPanelLanguage === 'function') refreshInspectPanelLanguage();
});
