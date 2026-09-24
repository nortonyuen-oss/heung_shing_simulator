(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const TOKEN_KEY = 'heung-shing-member-token';

  document.addEventListener('DOMContentLoaded', () => {
    const { request } = window.ForumCommon || {};
    if (!request) return;
    const phrase = (key, params) => siteT(`member.${key}`, params);

    const guestSection = document.querySelector('[data-member-guest]');
    const cardSection = document.querySelector('[data-member-card]');
    const tabs = document.querySelector('[data-member-tabs]');
    const registerForm = document.querySelector('[data-member-register-form]');
    const registerStatus = document.querySelector('[data-member-register-status]');
    const loginForm = document.querySelector('[data-member-login-form]');
    const loginStatus = document.querySelector('[data-member-login-status]');
    const cardUsername = document.querySelector('[data-member-username]');
    const cardSince = document.querySelector('[data-member-since]');
    const logoutButton = document.querySelector('[data-member-logout]');
    if (!guestSection || !cardSection || !registerForm || !loginForm) return;

    function getToken() {
      try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
    }
    function setToken(token) {
      try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode etc — login just won't persist across reloads */ }
    }

    function errorKey(error) {
      return ['notConfigured', 'limited', 'invalid', 'unauthorized', 'conflict'].includes(error.message) ? error.message : 'error';
    }

    let currentMember = null; // { username, createdAt } while logged in, so a language change can
                               // re-render the localized date without re-fetching /members/me.
    function showCard(username, createdAt) {
      currentMember = { username, createdAt };
      guestSection.hidden = true;
      cardSection.hidden = false;
      cardUsername.textContent = username;
      const date = new Date(createdAt);
      cardSince.textContent = Number.isNaN(date.getTime())
        ? ''
        : `${phrase('memberSince')} ${date.toLocaleDateString(SITE_INTL_LOCALE[siteCurrentLanguage])}`;
    }
    function showGuest(message) {
      currentMember = null;
      setToken('');
      cardSection.hidden = true;
      guestSection.hidden = false;
      if (message) { registerStatus.textContent = ''; loginStatus.textContent = phrase(message); }
    }

    tabs?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-member-tab]');
      if (!button) return;
      tabs.querySelectorAll('[data-member-tab]').forEach((el) => el.classList.toggle('is-active', el === button));
      const showRegister = button.dataset.memberTab === 'register';
      registerForm.hidden = !showRegister;
      loginForm.hidden = showRegister;
      registerStatus.textContent = '';
      loginStatus.textContent = '';
    });

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(registerForm));
      const username = String(values.username || '').trim();
      const password = String(values.password || '');
      const confirmPassword = String(values.confirmPassword || '');
      if (password !== confirmPassword) { registerStatus.textContent = phrase('passwordMismatch'); return; }
      registerForm.querySelector('[type=submit]').disabled = true;
      registerStatus.textContent = phrase('registering');
      try {
        const result = await request('/members/register', { username, password });
        setToken(result.token);
        registerForm.reset();
        showCard(result.username, new Date().toISOString());
      } catch (error) {
        registerStatus.textContent = phrase(errorKey(error) === 'error' ? 'registerError' : errorKey(error));
      } finally {
        registerForm.querySelector('[type=submit]').disabled = false;
      }
    });

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(loginForm));
      const username = String(values.username || '').trim();
      const password = String(values.password || '');
      loginForm.querySelector('[type=submit]').disabled = true;
      loginStatus.textContent = phrase('loggingIn');
      try {
        const result = await request('/members/login', { username, password });
        setToken(result.token);
        loginForm.reset();
        const me = await request('/members/me', undefined, { token: result.token });
        showCard(me.username, me.createdAt);
      } catch (error) {
        loginStatus.textContent = phrase(errorKey(error) === 'error' ? 'loginError' : errorKey(error) === 'unauthorized' ? 'wrongCredentials' : errorKey(error));
      } finally {
        loginForm.querySelector('[type=submit]').disabled = false;
      }
    });

    logoutButton?.addEventListener('click', () => showGuest());

    document.addEventListener('sitelanguagechange', () => {
      if (currentMember) showCard(currentMember.username, currentMember.createdAt);
    });

    const existingToken = getToken();
    if (existingToken) {
      request('/members/me', undefined, { token: existingToken })
        .then((me) => showCard(me.username, me.createdAt))
        .catch(() => showGuest());
    }
  });
}());
