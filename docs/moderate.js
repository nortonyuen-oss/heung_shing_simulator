(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const TOKEN_KEY = 'heung-shing-moderator-token';
  const QUEUE_LABELS = {
    posts: (item) => item.headline,
    comments: (item) => `${item.post_headline} — ${item.body}`,
    'news-comments': (item) => `${item.news_headline} — ${item.body}`,
    ads: (item) => item.ad_text,
  };

  document.addEventListener('DOMContentLoaded', () => {
    const { request } = window.ForumCommon || {};
    if (!request) return;
    const phrase = (key, params) => siteT(`moderate.${key}`, params);

    const loginSection = document.querySelector('[data-moderate-login]');
    const loginForm = document.querySelector('[data-moderate-login-form]');
    const loginStatus = document.querySelector('[data-moderate-login-status]');
    const dashboard = document.querySelector('[data-moderate-dashboard]');
    const dashboardStatus = document.querySelector('[data-moderate-status]');
    const logoutButton = document.querySelector('[data-moderate-logout]');
    const newsForm = document.querySelector('[data-moderate-news-form]');
    const newsStatus = document.querySelector('[data-moderate-news-status]');
    if (!loginForm || !dashboard) return;

    function getToken() {
      try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
    }
    function setToken(token) {
      try { token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode etc — session just won't persist across reload */ }
    }
    function showDashboard() {
      loginSection.hidden = true;
      dashboard.hidden = false;
      dashboardStatus.textContent = phrase('loggedIn');
      loadAllQueues();
    }
    function showLogin(message) {
      setToken('');
      dashboard.hidden = true;
      loginSection.hidden = false;
      loginStatus.textContent = message ? phrase(message) : '';
    }
    // Every authenticated call funnels through here so one place handles "the token stopped
    // working" (expired, or the moderator logged in elsewhere and this tab's session lapsed).
    async function adminRequest(path, body, method) {
      try {
        return await request(path, body, { token: getToken(), method });
      } catch (error) {
        if (error.message === 'unauthorized') { showLogin('sessionExpired'); }
        throw error;
      }
    }

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = new FormData(loginForm).get('password');
      loginStatus.textContent = phrase('loggingIn');
      loginForm.querySelector('[type=submit]').disabled = true;
      try {
        const result = await request('/admin/login', { password });
        setToken(result.token);
        loginForm.reset();
        showDashboard();
      } catch (error) {
        loginStatus.textContent = phrase(error.message === 'limited' ? 'limited' : 'wrongPassword');
      } finally {
        loginForm.querySelector('[type=submit]').disabled = false;
      }
    });
    logoutButton?.addEventListener('click', () => showLogin());

    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = String(text);
      if (className) element.className = className;
      return element;
    }

    async function loadQueue(resource) {
      const container = document.querySelector(`[data-moderate-queue="${resource}"]`);
      if (!container) return;
      container.replaceChildren(node('p', phrase('loading'), 'moderate-queue-status'));
      try {
        const result = await adminRequest(`/admin/queue/${resource}`);
        const items = Array.isArray(result.items) ? result.items : [];
        if (!items.length) { container.replaceChildren(node('p', phrase('queueEmpty'), 'moderate-queue-status')); return; }
        container.replaceChildren();
        for (const item of items) {
          const row = node('div', undefined, 'moderate-queue-item');
          row.append(node('p', QUEUE_LABELS[resource](item), 'moderate-queue-text'));
          const actions = node('div', undefined, 'moderate-queue-actions');
          const approve = node('button', phrase('approve'), 'feedback-secondary');
          approve.type = 'button';
          approve.addEventListener('click', () => act(resource, item.id, 'approve'));
          const hide = node('button', phrase('hide'), 'feedback-secondary');
          hide.type = 'button';
          hide.addEventListener('click', () => act(resource, item.id, 'hide'));
          actions.append(approve, hide);
          row.append(actions);
          container.append(row);
        }
      } catch (error) {
        if (error.message !== 'unauthorized') container.replaceChildren(node('p', phrase('queueError'), 'moderate-queue-status'));
      }
    }
    async function act(resource, id, action) {
      try {
        await adminRequest(`/admin/${resource}/${id}/${action}`, {}, 'POST');
        await loadQueue(resource);
      } catch { /* adminRequest already surfaced a session-expired login screen, or the row is
                    already gone — either way a stale queue entry disappears on the next reload */ }
    }
    function loadAllQueues() {
      for (const resource of Object.keys(QUEUE_LABELS)) loadQueue(resource);
    }

    newsForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(newsForm).entries());
      const headline = String(values.headline || '').trim(), body = String(values.body || '').trim();
      if (!headline || !body) { newsStatus.textContent = phrase('required'); return; }
      const fileInput = newsForm.querySelector('input[type=file]');
      const file = fileInput?.files?.[0];
      newsForm.querySelector('[type=submit]').disabled = true;
      newsStatus.textContent = phrase('publishing');
      try {
        let imageKey = '';
        if (file) {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('invalid');
          const api = String(window.FORUM_API_URL || '').replace(/\/$/, '');
          const response = await fetch(`${api}/admin/upload`, {
            method: 'POST', credentials: 'omit', cache: 'no-store',
            headers: { 'Content-Type': file.type, Authorization: `Bearer ${getToken()}` },
            body: file,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(response.status === 401 ? 'unauthorized' : 'invalid');
          imageKey = data.key || '';
        }
        await adminRequest('/admin/news', { headline, body, imageKey }, 'POST');
        newsForm.reset();
        newsStatus.textContent = phrase('published');
      } catch (error) {
        if (error.message === 'unauthorized') { newsStatus.textContent = ''; return; }
        newsStatus.textContent = phrase('publishError');
      } finally {
        newsForm.querySelector('[type=submit]').disabled = false;
      }
    });

    document.addEventListener('sitelanguagechange', () => { if (!dashboard.hidden) dashboardStatus.textContent = phrase('loggedIn'); });
    if (getToken()) showDashboard(); else showLogin();
  });
}());
