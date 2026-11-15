(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-crypto') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeungShingWorldEntry = api;
})(globalThis, function (cryptoApi) {
  'use strict';
  function createWorldUrl({ name, startYear, id = `world-${cryptoApi.worldUuid()}` }, base = location.href) {
    if (!/^world-[a-zA-Z0-9_-]{1,90}$/.test(id)) throw new Error('Invalid new world ID');
    const url = new URL('/world/index.html', base);
    url.searchParams.set('new', id); url.searchParams.set('name', String(name || '香港全境').trim().slice(0, 30));
    url.searchParams.set('year', String(startYear)); return url.href;
  }
  function parseWorldLaunch(search, nowYear = new Date().getFullYear()) {
    const params = new URLSearchParams(search), fresh = params.get('new'), slot = fresh || params.get('slot');
    if (slot && !/^[a-zA-Z0-9_-]{1,100}$/.test(slot)) throw new Error('世界存檔代號無效。');
    if (fresh && !/^world-[a-zA-Z0-9_-]{1,90}$/.test(fresh)) throw new Error('新世界代號無效。');
    const year = Number(params.get('year'));
    return { slot, fresh: !!fresh, name: (params.get('name') || '香港全境').trim().slice(0, 30) || '香港全境',
      startYear: Number.isSafeInteger(year) && year >= 1850 && year <= 9999 ? year : nowYear };
  }
  async function showWorldSaves() {
    const response = await HeungShingStorage.worldRequest('/api/world-saves'), rows = await response.json();
    if (!response.ok) throw new Error(rows.error || '未能讀取世界存檔。');
    const dialog = document.getElementById('world-save-list'), list = document.getElementById('world-save-list-items'); list.replaceChildren();
    for (const row of rows) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'setup-button';
      button.textContent = `${row.city.name} · $${Number(row.city.budget).toLocaleString()}`;
      button.onclick = async () => { const url = new URL('/world/index.html', location.href); url.searchParams.set('slot', row.id); try { await enterWorld(url.href); } catch (error) { showToast(error.message, 'danger'); } };
      list.appendChild(button);
    }
    if (!rows.length) list.textContent = t('landing.worldEmpty');
    dialog.showModal();
  }
  function setupWorldMenu() {
    document.getElementById('btn-world-saves')?.addEventListener('click', () => showWorldSaves().catch(error => showToast(error.message, 'danger')));
    document.getElementById('world-save-list-close')?.addEventListener('click', () => document.getElementById('world-save-list').close());
  }
  async function enterWorld(url) { await HeungShingStorage.releaseForNavigation(); location.assign(url); }
  return { createWorldUrl, parseWorldLaunch, showWorldSaves, setupWorldMenu, enterWorld };
});
