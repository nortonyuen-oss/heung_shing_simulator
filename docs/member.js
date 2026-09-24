(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    const { request, getMemberToken, setMemberToken, imageUrl } = window.ForumCommon || {};
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
    const avatarImage = document.querySelector('[data-member-avatar]');
    const avatarInput = document.querySelector('[data-member-avatar-input]');
    const avatarStatus = document.querySelector('[data-member-avatar-status]');
    if (!guestSection || !cardSection || !registerForm || !loginForm) return;

    function errorKey(error) {
      return ['notConfigured', 'limited', 'invalid', 'unauthorized', 'conflict'].includes(error.message) ? error.message : 'error';
    }

    let currentMember = null; // { username, createdAt, avatarKey } while logged in, so a language
                               // change can re-render the localized date without re-fetching /members/me.
    function renderAvatar() {
      if (!avatarImage) return;
      const key = currentMember?.avatarKey;
      if (key && imageUrl) { avatarImage.src = imageUrl(key); avatarImage.hidden = false; }
      else { avatarImage.removeAttribute('src'); avatarImage.hidden = true; }
    }
    function showCard(username, createdAt, avatarKey) {
      currentMember = { username, createdAt, avatarKey: avatarKey || null };
      guestSection.hidden = true;
      cardSection.hidden = false;
      cardUsername.textContent = username;
      const date = new Date(createdAt);
      cardSince.textContent = Number.isNaN(date.getTime())
        ? ''
        : `${phrase('memberSince')} ${date.toLocaleDateString(SITE_INTL_LOCALE[siteCurrentLanguage])}`;
      renderAvatar();
    }
    function showGuest(message) {
      currentMember = null;
      setMemberToken('');
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
        setMemberToken(result.token);
        registerForm.reset();
        showCard(result.username, new Date().toISOString(), null);
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
        setMemberToken(result.token);
        loginForm.reset();
        const me = await request('/members/me', undefined, { token: result.token });
        showCard(me.username, me.createdAt, me.avatarKey);
      } catch (error) {
        loginStatus.textContent = phrase(errorKey(error) === 'error' ? 'loginError' : errorKey(error) === 'unauthorized' ? 'wrongCredentials' : errorKey(error));
      } finally {
        loginForm.querySelector('[type=submit]').disabled = false;
      }
    });

    logoutButton?.addEventListener('click', () => showGuest());

    // Avatar upload — same content-type allowlist as the server (services/forum/worker.mjs's
    // IMAGE_CONTENT_TYPES); the server re-checks regardless, this just avoids a doomed round trip.
    const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    avatarInput?.addEventListener('change', async () => {
      const file = avatarInput.files?.[0];
      avatarInput.value = '';
      if (!file || !currentMember) return;
      if (!AVATAR_TYPES.includes(file.type)) { if (avatarStatus) avatarStatus.textContent = phrase('avatarInvalidType'); return; }
      if (avatarStatus) avatarStatus.textContent = phrase('avatarUploading');
      try {
        // Raw binary body, not through ForumCommon.request() (which only ever sends JSON) — same
        // fetch shape as moderate.js's own image upload.
        const api = String(window.FORUM_API_URL || '').replace(/\/$/, '');
        if (!api) throw new Error('notConfigured');
        const response = await fetch(`${api}/members/me/avatar`, {
          method: 'POST', credentials: 'omit', cache: 'no-store',
          headers: { 'Content-Type': file.type, Authorization: `Bearer ${getMemberToken()}` },
          body: file,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const code = response.status === 429 ? 'limited' : response.status === 401 ? 'unauthorized'
            : response.status === 413 ? 'avatarTooLarge' : response.status === 400 ? 'avatarInvalidType' : 'error';
          throw new Error(code);
        }
        currentMember.avatarKey = data.avatarKey;
        renderAvatar();
        avatarStatus.textContent = phrase('avatarUploaded');
      } catch (error) {
        const key = error.message === 'avatarTooLarge' || error.message === 'avatarInvalidType' || error.message === 'limited' ? error.message : (errorKey(error) === 'error' ? 'avatarError' : errorKey(error));
        if (avatarStatus) avatarStatus.textContent = phrase(key);
      }
    });

    document.addEventListener('sitelanguagechange', () => {
      if (currentMember) showCard(currentMember.username, currentMember.createdAt, currentMember.avatarKey);
    });

    const existingToken = getMemberToken();
    if (existingToken) {
      request('/members/me', undefined, { token: existingToken })
        .then((me) => showCard(me.username, me.createdAt, me.avatarKey))
        .catch(() => showGuest());
    }
  });
}());
