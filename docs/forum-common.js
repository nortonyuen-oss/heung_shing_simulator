// Shared by news.js / ads.js / member.js / moderate.js, all of which talk to services/forum
// directly, never through the game's local proxy (that exists only for the Electron app) — and, for
// the member-token helpers and imageUrl() only, by feedback.js too (avatars live in forum's R2
// bucket even though feedback's own content lives in a separate service; see request()'s
// options.baseUrl for how feedback.js points its own writes at FEEDBACK_API_URL instead). Kept as a
// real shared file (not copy-pasted per page) because unlike the website/game split, these pages
// ship in the same static site with no build step standing between them — there's nothing stopping
// them from sharing one script tag.
(function () {
  'use strict';
  // 留言權: this is the one place the member bearer token is read/written from localStorage, shared
  // by member.js (which owns login/register/logout) and every page that now gates a write behind
  // login (news.js/ads.js/feedback.js) — previously each page kept its own private copy of this key.
  const MEMBER_TOKEN_KEY = 'heung-shing-member-token';

  function newRequestKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '');
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`.slice(0, 32);
  }

  function getMemberToken() {
    try { return localStorage.getItem(MEMBER_TOKEN_KEY) || ''; } catch { return ''; }
  }
  function setMemberToken(token) {
    try { token ? localStorage.setItem(MEMBER_TOKEN_KEY, token) : localStorage.removeItem(MEMBER_TOKEN_KEY); } catch { /* private mode etc — login just won't persist across reloads */ }
  }
  function clearMemberToken() { setMemberToken(''); }

  async function request(path, body, options = {}) {
    const api = String(options.baseUrl || window.FORUM_API_URL || '').replace(/\/$/, '');
    if (!api) throw new Error('notConfigured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      const response = await fetch(api + path, {
        method: options.method || (body ? 'POST' : 'GET'), credentials: 'omit', cache: 'no-store',
        headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = response.status === 429 ? 'limited' : response.status === 401 ? 'unauthorized'
          : (response.status === 400 || response.status === 413) ? 'invalid' : 'error';
        throw new Error(code);
      }
      return data;
    } finally { clearTimeout(timeout); }
  }

  function imageUrl(imageKey) {
    const api = String(window.FORUM_API_URL || '').replace(/\/$/, '');
    return imageKey ? `${api}/images/${imageKey}` : '';
  }

  window.ForumCommon = { request, newRequestKey, imageUrl, getMemberToken, setMemberToken, clearMemberToken };
}());
