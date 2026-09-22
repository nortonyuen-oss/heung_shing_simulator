// Shared by news.js / ads.js / moderate.js — the three new pages talk to services/forum directly
// (same as feedback.js talks to services/feedback), never through the game's local proxy, which
// exists only for the Electron app. Kept as a real shared file (not copy-pasted per page) because
// unlike the website/game split, these three pages ship in the same static site with no build step
// standing between them — there's nothing stopping them from sharing one script tag.
(function () {
  'use strict';
  const NICKNAME_GIVEN_NAMES = ['英秀', '一心', '幼羚', '家寶', '念慈', '思賢', '有容', '向華', '修端', '允行'];
  const NICKNAME_SURNAMES = ['陳', '李', '黃', '張', '梁', '林', '劉', '何', '鄭', '周', '羅', '許'];

  function newRequestKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '');
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`.slice(0, 32);
  }

  async function request(path, body, options = {}) {
    const api = String(window.FORUM_API_URL || '').replace(/\/$/, '');
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

  function populateNicknameSuggestions(datalist) {
    if (!datalist || datalist.dataset.populated) return;
    datalist.dataset.populated = 'true';
    for (const surname of NICKNAME_SURNAMES) {
      for (const given of NICKNAME_GIVEN_NAMES) {
        const option = document.createElement('option');
        option.value = surname + given;
        datalist.append(option);
      }
    }
  }

  function randomNickname(random = Math.random) {
    const surname = NICKNAME_SURNAMES[Math.floor(random() * NICKNAME_SURNAMES.length)];
    const given = NICKNAME_GIVEN_NAMES[Math.floor(random() * NICKNAME_GIVEN_NAMES.length)];
    return surname + given;
  }

  function imageUrl(imageKey) {
    const api = String(window.FORUM_API_URL || '').replace(/\/$/, '');
    return imageKey ? `${api}/images/${imageKey}` : '';
  }

  window.ForumCommon = { request, populateNicknameSuggestions, randomNickname, newRequestKey, imageUrl };
}());
