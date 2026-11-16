(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-crypto') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeungShingWorldEntry = api;
})(globalThis, function (cryptoApi) {
  'use strict';
  function createWorldUrl({ name, startYear, roadTileSetId, transportExpansion, id = `world-${cryptoApi.worldUuid()}` }, base = location.href) {
    if (!/^world-[a-zA-Z0-9_-]{1,90}$/.test(id)) throw new Error('Invalid new world ID');
    const url = new URL('/?world=1', base);
    url.searchParams.set('new', id); url.searchParams.set('name', String(name || '香港全境').trim().slice(0, 30));
    url.searchParams.set('year', String(startYear));
    if (roadTileSetId) url.searchParams.set('roads', roadTileSetId);
    if (transportExpansion) url.searchParams.set('transport', '1');
    return url.href;
  }
  function parseWorldLaunch(search, nowYear = new Date().getFullYear()) {
    const params = new URLSearchParams(search), fresh = params.get('new'), slot = fresh || params.get('slot');
    if (slot && !/^[a-zA-Z0-9_-]{1,100}$/.test(slot)) throw new Error('世界存檔代號無效。');
    if (fresh && !/^world-[a-zA-Z0-9_-]{1,90}$/.test(fresh)) throw new Error('新世界代號無效。');
    const year = Number(params.get('year'));
    return { slot, fresh: !!fresh, name: (params.get('name') || '香港全境').trim().slice(0, 30) || '香港全境',
      startYear: Number.isSafeInteger(year) && year >= 1850 && year <= 9999 ? year : nowYear };
  }
  function hasPendingLaunch(search = globalThis.location?.search || '') {
    const params = new URLSearchParams(search);
    return params.get('world') === '1' && (params.has('slot') || params.has('new'));
  }
  async function enterWorld(url) {
    const params = new URL(url, location.href).search;
    const launch = parseWorldLaunch(params);
    if (!launch.slot) throw new Error('請選擇城市存檔。');
    return startWorldGame({ ...launch, roadTileSetId: new URLSearchParams(params).get('roads'), transportExpansion: new URLSearchParams(params).get('transport') === '1' });
  }
  async function resumeLaunch() {
    const params = new URLSearchParams(location.search);
    if (params.get('world') !== '1' || !params.has('slot') && !params.has('new')) return;
    return enterWorld(location.href);
  }
  return { createWorldUrl, parseWorldLaunch, hasPendingLaunch, enterWorld, resumeLaunch };
});
