(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const { request, populateNicknameSuggestions, randomNickname, newRequestKey } = window.ForumCommon || {};
    if (!request) return;
    const phrase = (key, params) => siteT(`ads.${key}`, params);
    const form = document.querySelector('[data-ads-form]');
    const list = document.querySelector('[data-ads-list]');
    const status = document.querySelector('[data-ads-status]');
    const formStatus = document.querySelector('[data-ads-form-status]');
    const previous = document.querySelector('[data-ads-previous]');
    const next = document.querySelector('[data-ads-next]');
    if (!form || !list || !status) return;
    populateNicknameSuggestions(document.getElementById('ads-nickname-suggestions'));
    form.querySelector('[data-random-nickname]')?.addEventListener('click', () => {
      const input = form.querySelector('[name=nickname]');
      input.value = randomNickname();
      input.focus();
    });

    let rows = [], page = 1, hasNext = false, sequence = 0, state = 'loading';
    let sending = false, submissionKey = '', submissionSignature = '', formMessage = '';

    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = String(text);
      if (className) element.className = className;
      return element;
    }
    function errorKey(error) {
      return ['notConfigured', 'limited', 'invalid'].includes(error.message) ? error.message : 'error';
    }

    function render() {
      status.textContent = phrase(state === 'ready' ? (rows.length ? 'loaded' : 'empty') : state);
      previous.disabled = state === 'loading' || page === 1;
      next.disabled = state === 'loading' || !hasNext;
      form.querySelector('[type=submit]').disabled = sending;
      formStatus.textContent = formMessage ? phrase(formMessage) : '';
      document.querySelector('[data-ads-page]').textContent = `${siteT('feedback.page')} ${page}`;
      list.setAttribute('aria-busy', String(state === 'loading'));
      list.replaceChildren();
      for (const item of rows) {
        const card = node('article', undefined, 'ad-card');
        const date = new Date(item.created_at);
        const formatted = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(SITE_INTL_LOCALE[siteCurrentLanguage]);
        card.append(node('p', item.ad_text, 'ad-text'));
        card.append(node('p', `${item.nickname || siteT('feedback.anonymous')}${formatted ? ' · ' + formatted : ''}`, 'ad-meta'));
        list.append(card);
      }
    }

    async function loadList() {
      const current = ++sequence;
      state = 'loading'; render();
      try {
        const result = await request(`/ads?page=${page}`);
        if (current !== sequence) return;
        if (!Array.isArray(result.items)) throw new Error('error');
        rows = result.items; hasNext = !!result.hasNext; state = 'ready';
      } catch (error) { if (current === sequence) state = errorKey(error); }
      if (current === sequence) render();
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (sending || !form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      const adText = String(values.adText || '').trim(), nickname = String(values.nickname || '').trim();
      if (!adText) { formMessage = 'required'; render(); return; }
      const signature = JSON.stringify([nickname, adText]);
      if (signature !== submissionSignature) { submissionKey = newRequestKey(); submissionSignature = signature; }
      sending = true; formMessage = 'sending';
      for (const element of form.elements) element.disabled = true;
      render();
      try {
        await request('/ads', { nickname, adText, requestKey: submissionKey });
        form.reset(); submissionKey = ''; submissionSignature = ''; formMessage = 'sent';
        page = 1;
        await loadList();
      } catch (error) { formMessage = errorKey(error) === 'error' ? 'sendError' : errorKey(error); }
      finally { sending = false; for (const element of form.elements) element.disabled = false; render(); }
    });
    form.addEventListener('input', () => { if (!sending) { formMessage = ''; formStatus.textContent = ''; } });
    previous?.addEventListener('click', () => { if (page > 1) { page--; loadList(); } });
    next?.addEventListener('click', () => { if (hasNext) { page++; loadList(); } });
    document.addEventListener('sitelanguagechange', render);
    loadList();
  });
}());
