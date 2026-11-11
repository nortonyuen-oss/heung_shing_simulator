// Platform controls, local backups, and a single optional play-start event.
(function (root) {
  'use strict';
  const web = root.HEUNG_SHING_CONFIG?.platform === 'web';
  const messages = {
    en: { export: 'Download City…', import: 'Import City…', downloaded: 'Download started. Please check your browser downloads.',
      failed: 'Could not save. Download your city as a backup.', invalid: 'Could not import this city. Check the file and game version.',
      backup: 'Cities are saved in this browser. Download a backup before clearing site data or changing devices. Private browsing may remove saves.',
      memory: 'Browser storage is unavailable. Progress is temporary: download your city before closing.',
      locked: 'Another game tab has write access. Close it, then reload this tab to play.',
      confirm: 'Import as a new saved city? Your current city will be saved first.', imported: 'City imported. Load it now?',
      idle: 'Start or load your city before downloading.', update: 'A new game version is ready. Save your city and reload to update?',
      saved: 'Saved in this browser.', community: 'Official community', clear: 'Clear downloaded assets',
      network: 'AI news and live coastal reports are not available in this browser release.' },
    hk: { export: '下載城市存檔…', import: '匯入城市存檔…', downloaded: '已開始下載存檔，請確認瀏覽器下載紀錄。',
      failed: '未能儲存，請下載城市存檔備份。', invalid: '匯入失敗，請檢查存檔同遊戲版本。',
      backup: '城市存喺呢個瀏覽器。清除網站資料或換機前，請下載備份；無痕模式可能唔會保留存檔。',
      memory: '瀏覽器儲存暫時用唔到，進度只係暫存。關閉前請下載城市存檔。',
      locked: '另一個遊戲分頁正喺度儲存。請關閉嗰個分頁，再重新載入呢頁遊玩。',
      confirm: '匯入成為新存檔？會先儲存你目前嘅城市。', imported: '已匯入城市，即刻載入？',
      idle: '請先開新城市或載入城市，再下載存檔。', update: '有新版本。儲存城市並重新載入更新？',
      saved: '已儲存到呢個瀏覽器。', community: '官方討論區', clear: '清除已下載素材',
      network: '呢個網頁版本暫未提供 AI 新聞同即時海域報告。' },
    tw: { export: '下載城市存檔…', import: '匯入城市存檔…', downloaded: '已開始下載存檔，請確認瀏覽器下載紀錄。',
      failed: '無法儲存，請下載城市存檔備份。', invalid: '匯入失敗，請檢查存檔與遊戲版本。',
      backup: '城市儲存在這個瀏覽器。清除網站資料或更換裝置前，請下載備份；無痕模式可能不會保留存檔。',
      memory: '瀏覽器儲存無法使用，進度只是暫存。關閉前請下載城市存檔。',
      locked: '另一個遊戲分頁具有寫入權。請先關閉該分頁，再重新載入本頁遊玩。',
      confirm: '匯入為新存檔？將先儲存目前的城市。', imported: '已匯入城市，立即載入？',
      idle: '請先建立或載入城市，再下載存檔。', update: '有新版本。儲存城市並重新載入更新？',
      saved: '已儲存到這個瀏覽器。', community: '官方討論區', clear: '清除已下載素材',
      network: '此網頁版本暫未提供 AI 新聞與即時海域報告。' },
    ja: { export: '都市セーブをダウンロード…', import: '都市セーブを読み込む…', downloaded: 'ダウンロードを開始しました。ブラウザーの履歴をご確認ください。',
      failed: '保存できません。都市をダウンロードしてバックアップしてください。', invalid: '読み込みに失敗しました。ファイルとゲームのバージョンをご確認ください。',
      backup: '都市はこのブラウザーに保存されます。サイトデータの削除や端末の変更前にバックアップしてください。プライベートモードでは保存が消えることがあります。',
      memory: 'ブラウザーに保存できません。進行状況は一時的です。閉じる前に都市をダウンロードしてください。',
      locked: '別のゲームタブが書き込み中です。そのタブを閉じて、このページを再読み込みしてください。',
      confirm: '新しいセーブとして読み込みますか？現在の都市を先に保存します。', imported: '都市を読み込みました。今すぐ開きますか？',
      idle: '都市を開始または読み込んでからダウンロードしてください。', update: '新しいバージョンがあります。保存して更新しますか？',
      saved: 'このブラウザーに保存しました。', community: '公式コミュニティ', clear: '素材キャッシュを削除',
      network: 'このブラウザー版ではAIニュースとリアルタイム海域情報は利用できません。' },
  };
  function text(key) {
    const language = typeof currentLanguage === 'undefined' ? 'en' : currentLanguage;
    const locale = language === 'ja' ? 'ja' : language === 'zhHant'
      ? (/^zh-(hk|mo)/i.test(navigator.language) ? 'hk' : 'tw') : 'en';
    return messages[locale][key] || messages.en[key];
  }
  root.platformText = text;
  Object.assign(messages.en, { original: 'Download original backup' });
  Object.assign(messages.hk, { original: '下載轉換前原檔' });
  Object.assign(messages.tw, { original: '下載轉換前原檔' });
  Object.assign(messages.ja, { original: '変換前のバックアップを保存' });
  const playing = () => typeof gameReady !== 'undefined' && gameReady && typeof activeScene !== 'undefined'
    && activeScene && document.getElementById('landing-screen')?.style.display === 'none'
    && !(typeof isTerrainCreatorMode !== 'undefined' && isTerrainCreatorMode)
    && !(typeof isAttractModeActive === 'function' && isAttractModeActive());
  root.exportCurrentCity = async function () {
    if (!playing()) { showToast(text('idle'), 'warning'); return; }
    try {
      const snapshot = HeungShingPortableSave.make(buildSavePayload(), appVersion);
      HeungShingPortableSave.download(snapshot);
      showToast(text('downloaded'), 'info');
    } catch (error) { console.error('[Export]', error); showToast(text('failed'), 'danger'); }
  };
  root.exportSavedCity = async function (id, backup = false) {
    try {
      await waitForPendingSaves();
      const response = await requestGameStorage(`/api/saves/${id}${backup ? '/backup' : ''}`);
      if (!response.ok) throw new Error('Save not found');
      const row = await response.json();
      const payload = Object.fromEntries(['city_name', 'population', 'year', 'month', 'budget', 'save_data'].map(key => [key, row[key]]));
      HeungShingPortableSave.download(HeungShingPortableSave.make(payload, appVersion));
      showToast(text('downloaded'), 'info');
    } catch (error) { console.error('[Export slot]', error); showToast(text('failed'), 'danger'); }
  };
  root.chooseCityImport = function () {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.heungshing,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > HeungShingPortableSave.MAX_BYTES) throw new Error('Save too large');
        const envelope = HeungShingPortableSave.parse(await file.text(), decodeSaveDataForLoad, MAP_WIDTH, MAP_HEIGHT);
        if (playing()) {
          if (!confirm(text('confirm'))) return;
          if (!await saveGame()) throw new Error('Could not save current city');
        }
        const response = await requestGameStorage('/api/saves', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope.payload) });
        if (!response.ok) throw new Error('Could not store imported city');
        const row = await response.json();
        if (confirm(`${envelope.payload.city_name}\n${text('imported')}`)) {
          const loaded = await loadSaveById(row.id, activeScene);
          if (loaded) hideLandingScreen();
        } else openSaveListModal();
      } catch (error) { console.error('[Import]', error); showToast(text('invalid'), 'danger'); }
    });
    input.click();
  };
  function updateLabels() {
    document.querySelectorAll('[data-platform-label]').forEach(node => { node.textContent = text(node.dataset.platformLabel); });
  }
  updateLabels();
  root.setInterval(updateLabels, 1000);
  const saveList = document.getElementById('save-list-items');
  if (saveList) new MutationObserver(() => {
    saveList.querySelectorAll('.save-list-actions').forEach(actions => {
      if (actions.querySelector('[data-export-slot]')) return;
      const id = Number(actions.querySelector('[data-id]')?.dataset.id);
      const button = document.createElement('button'); button.className = 'save-list-load-btn';
      button.dataset.exportSlot = String(id); button.textContent = text('export');
      button.addEventListener('click', () => root.exportSavedCity(id)); actions.appendChild(button);
    });
  }).observe(saveList, { childList: true, subtree: true });
  document.getElementById('btn-import-city')?.addEventListener('click', root.chooseCityImport);
  if (!web) return;
  const config = root.HEUNG_SHING_CONFIG;
  const note = document.createElement('p'); note.className = 'platform-storage-note';
  note.style.cssText = 'font-size:12px;line-height:1.5;padding:8px;max-width:640px;margin:8px auto;color:#d7e6e1';
  const landing = document.getElementById('landing-load-status'); landing?.parentElement.appendChild(note);
  root.HeungShingStorage.initialize().then(() => {
    const refresh = () => { note.textContent = text(HeungShingStorage.memoryOnly ? 'memory' : !HeungShingStorage.writable ? 'locked' : 'backup'); };
    refresh(); root.setInterval(refresh, 1000);
    if (!HeungShingStorage.writable) {
      document.querySelectorAll('#btn-new-game, #btn-terrain-creator').forEach(button => { button.disabled = true; });
      if (typeof setGameWorldVisible === 'function') setGameWorldVisible(false);
    }
  });
  document.querySelector('[data-menu-action="open-ai-news-settings"]')?.setAttribute('hidden', '');
  let elapsed = 0, retries = 0, sending = false, counted = false, warnedLock = false;
  const sessionKey = 'heung-shing.play-session.v1';
  // Plain HTTP Wi-Fi previews have storage but may lack secure-context-only randomUUID.
  // Optional counting must never stop the save timer or the rest of the platform setup.
  let eventId = root.crypto?.randomUUID?.() || null;
  try {
    const stored = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    if (stored?.eventId) { eventId = stored.eventId; counted = stored.counted === true; }
    sessionStorage.setItem(sessionKey, JSON.stringify({ eventId, counted }));
  } catch { /* Memory-only session counting. */ }
  const eligibleHost = !['localhost', '127.0.0.1'].includes(location.hostname);
  root.setInterval(async () => {
    if (playing() && !HeungShingStorage.writable) {
      if (typeof setGameSpeed === 'function') setGameSpeed(GAME_SPEEDS.PAUSED);
      if (!warnedLock) { showToast(text('locked'), 'warning'); warnedLock = true; }
      return;
    }
    if (!playing() || document.visibilityState !== 'visible' || (typeof simPaused !== 'undefined' && simPaused)) return;
    elapsed += 1;
    if (eventId && !counted && !sending && elapsed >= 10 && config.statisticsEnabled === true && eligibleHost && !root.HEUNG_SHING_SMOKE_TEST && retries < 2) {
      sending = true; retries += 1;
      try {
        const response = await fetch(`${config.statisticsUrl}/v1/play`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: 'play_start', eventId, gameVersion: config.gameVersion }), signal: AbortSignal.timeout(5000) });
        if (response.ok) { counted = true; try { sessionStorage.setItem(sessionKey, JSON.stringify({ eventId, counted })); } catch {} }
      } catch { /* Telemetry never blocks gameplay. */ }
      sending = false;
    }
    if (elapsed % 60 === 0 && HeungShingStorage.writable) saveGame(true);
  }, 1000);
  const settings = document.querySelector('[data-menu="settings"] .menu-dropdown');
  if (settings && root.caches) {
    const clear = document.createElement('button'); clear.className = 'menu-drop-item'; clear.dataset.platformLabel = 'clear'; clear.textContent = text('clear');
    clear.addEventListener('click', async () => {
      for (const key of await caches.keys()) if (key.startsWith('hs-assets-')) await caches.delete(key);
    }); settings.appendChild(clear);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('web-service-worker.js').then(registration => {
    let applyingUpdate = false;
    let offeredWorker = null;
    const offer = () => {
      if (!registration.waiting || offeredWorker === registration.waiting) return;
      offeredWorker = registration.waiting;
      const button = document.createElement('button'); button.textContent = text('update');
      button.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9999;max-width:360px;padding:12px';
      button.addEventListener('click', async () => {
        if (playing() && !await saveGame()) { showToast(text('failed'), 'danger'); return; }
        if (!confirm(text('update'))) return;
        applyingUpdate = true;
        registration.waiting.postMessage({ type: 'ACTIVATE' });
      }); document.body.appendChild(button);
    };
    offer(); registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) offer();
      });
    });
    root.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {});
    }, 15 * 60 * 1000);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (applyingUpdate) location.reload(); });
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'CLOSE_OTHER_TABS') alert(text('locked'));
    });
  }).catch(error => console.warn('[Offline cache]', error.message));
})(globalThis);
