/* The build replaces the identifier and minimal shell. Cities live only in IndexedDB. */
const BUILD = '__BUILD_ID__';
const SHELL = /*__SHELL__*/[];
const SHELL_CACHE = `hs-shell-${BUILD}`;
const ASSET_CACHE = 'hs-assets-v1';
const MAX_ASSET_BYTES = 200 * 1024 * 1024;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  // Activation waits for old clients, or an explicit single-tab saved update.
  event.waitUntil((async () => {
    await self.clients.claim();
    const keys = (await caches.keys()).filter(key => key.startsWith('hs-shell-'));
    for (const key of keys.slice(0, -2)) if (key !== SHELL_CACHE) await caches.delete(key);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE') event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (tabs.length <= 1) await self.skipWaiting();
    else event.source?.postMessage({ type: 'CLOSE_OTHER_TABS' });
  })());
});
let trimQueue = Promise.resolve();
let writesSinceTrim = 0;
async function trim(cache) {
  let size = 0;
  const keys = await cache.keys();
  const rows = [];
  for (const key of keys) {
    const response = await cache.match(key);
    const bytes = Number(response.headers.get('Content-Length')) || (await response.clone().arrayBuffer()).byteLength;
    rows.push({ key, bytes }); size += bytes;
  }
  const estimate = await self.navigator.storage?.estimate?.();
  const limit = Math.min(MAX_ASSET_BYTES, estimate?.quota ? Math.floor(estimate.quota * 0.15) : MAX_ASSET_BYTES);
  for (const row of rows) {
    if (size <= limit) break;
    await cache.delete(row.key); size -= row.bytes;
  }
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(SHELL_CACHE)).match('index.html')));
    return;
  }
  if (!url.pathname.includes('/assets/')) return;
  event.respondWith((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const core = await shell.match(event.request);
    if (core) return core;
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(cache.put(event.request, copy).then(() => {
        if (++writesSinceTrim % 25 === 0) trimQueue = trimQueue.then(() => trim(cache)).catch(() => {});
        return trimQueue;
      }).catch(() => {}));
    }
    return response;
  })());
});
