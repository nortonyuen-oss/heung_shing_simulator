const MAX_BODY = 1024;
const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin,
    'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin', 'Cache-Control': 'no-store' },
});
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function body(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new Error('size');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let text = '', bytes = 0; const decoder = new TextDecoder();
  for (;;) {
    const chunk = await reader.read(); if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_BODY) { await reader.cancel(); throw new Error('size'); }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}
export default {
  async fetch(request, env, context) {
    const origin = request.headers.get('origin') || '';
    const readers = (env.READ_ORIGINS || '').split(',');
    const writers = (env.PLAY_ORIGINS || '').split(',');
    const url = new URL(request.url);
    if (!readers.includes(origin) && !writers.includes(origin)) return json({ error: 'origin' }, 403, 'null');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin',
    } });
    try {
      if (url.pathname === '/v1/stats' && request.method === 'GET') {
        const cache = globalThis.caches?.default;
        const key = new Request(`${url.origin}/cached-statistics?origin=${encodeURIComponent(origin)}`);
        const cached = cache && await cache.match(key);
        if (cached) return cached;
        const row = await env.DB.prepare('SELECT sessions, since, updated_at FROM play_totals WHERE id = 1').first();
        if (!row) throw new Error('not initialized');
        const day = new Date().toISOString().slice(0, 10);
        const daily = await env.DB.prepare('SELECT sessions FROM play_days WHERE day = ?').bind(day).first();
        const response = json({ webPlaySessions: row.sessions, since: row.since, updatedAt: row.updated_at,
          status: daily?.sessions >= 5000 ? 'limited' : 'available' }, 200, origin);
        response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
        if (cache) context.waitUntil(cache.put(key, response.clone()));
        return response;
      }
      if (url.pathname !== '/v1/play' || request.method !== 'POST') return json({ error: 'not found' }, 404, origin);
      if (!writers.includes(origin)) return json({ error: 'origin' }, 403, origin);
      if (env.PLAY_LIMIT && !(await env.PLAY_LIMIT.limit({ key: await digest(request.headers.get('cf-connecting-ip') || 'unknown') })).success) {
        return json({ error: 'rate limited' }, 429, origin);
      }
      const data = await body(request);
      if (!data || Object.keys(data).sort().join(',') !== 'eventId,eventType,gameVersion'
        || data.eventType !== 'play_start' || typeof data.eventId !== 'string'
        || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(data.eventId)
        || !(env.GAME_VERSIONS || '').split(',').includes(data.gameVersion)) return json({ error: 'invalid event' }, 400, origin);
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT OR IGNORE INTO play_events(event_hash, day, received_at, game_version) VALUES (?, ?, ?, ?)')
        .bind(await digest(data.eventId), now.slice(0, 10), now, data.gameVersion).run();
      return json({ accepted: true }, 200, origin);
    } catch (error) {
      return json({ error: error.message === 'size' ? 'body too large' : 'statistics unavailable' }, error.message === 'size' ? 413 : 503, origin);
    }
  },
  async scheduled(_event, env) {
    await env.DB.prepare("DELETE FROM play_events WHERE event_hash IN (SELECT event_hash FROM play_events WHERE received_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') LIMIT 5000)").run();
  },
};
