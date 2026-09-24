(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const { request, newRequestKey, getMemberToken } = window.ForumCommon || {};
    if (!request) return;
    const phrase = (key, params) => siteT(`ads.${key}`, params);
    const form = document.querySelector('[data-ads-form]');
    const composeGate = document.querySelector('[data-ads-compose-gate]');
    const status = document.querySelector('[data-ads-status]');
    const formStatus = document.querySelector('[data-ads-form-status]');
    const ticker = document.getElementById('ads-ticker');
    const tickerTrack = document.getElementById('ads-ticker-track');
    const tickerInner = document.getElementById('ads-ticker-inner');
    if (!form || !status || !ticker || !tickerTrack || !tickerInner) return;
    const loggedIn = !!getMemberToken();
    form.hidden = !loggedIn;
    if (composeGate) composeGate.hidden = loggedIn;

    let rows = [], sequence = 0, state = 'loading';
    let sending = false, submissionKey = '', submissionSignature = '', formMessage = '';

    function errorKey(error) {
      return ['notConfigured', 'limited', 'invalid', 'unauthorized'].includes(error.message) ? error.message : 'error';
    }

    function renderStatus() {
      status.textContent = phrase(state === 'ready' ? (rows.length ? 'loaded' : 'empty') : state);
      form.querySelector('[type=submit]').disabled = sending;
      formStatus.textContent = formMessage ? phrase(formMessage) : '';
    }

    // A marquee has no pagination UI to show progress in, so it just fills in whatever text is
    // available — loading/error/empty states show as the one static (non-scrolling) line.
    function renderTicker() {
      if (state !== 'ready' || !rows.length) {
        ticker.dataset.empty = 'true';
        tickerInner.textContent = phrase(state === 'ready' ? 'empty' : state);
        return;
      }
      delete ticker.dataset.empty;
      const line = rows.map((item) => item.nickname ? `${item.ad_text} · ${item.nickname}` : item.ad_text).join('   |   ');
      tickerInner.textContent = `${line}   |   ${line}`;
      const seconds = Math.max(20, Math.min(120, Math.round(line.length * 0.14)));
      tickerTrack.style.animationDuration = `${seconds}s`;
    }

    function render() { renderStatus(); renderTicker(); }

    // No pagination UI for a marquee — fetch enough pages up front (capped) so there's plenty of
    // content to loop through, instead of a "load more" the viewer would never see a reason to click.
    async function loadList() {
      const current = ++sequence;
      state = 'loading'; render();
      try {
        const collected = [];
        let page = 1, hasNext = true;
        while (hasNext && page <= 3 && collected.length < 60) {
          const result = await request(`/ads?page=${page}`);
          if (!Array.isArray(result.items)) throw new Error('error');
          collected.push(...result.items);
          hasNext = !!result.hasNext;
          page++;
        }
        if (current !== sequence) return;
        rows = collected; state = 'ready';
      } catch (error) { if (current === sequence) state = errorKey(error); }
      if (current === sequence) render();
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (sending || !form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      const adText = String(values.adText || '').trim();
      if (!adText) { formMessage = 'required'; render(); return; }
      const signature = JSON.stringify([adText]);
      if (signature !== submissionSignature) { submissionKey = newRequestKey(); submissionSignature = signature; }
      sending = true; formMessage = 'sending';
      for (const element of form.elements) element.disabled = true;
      render();
      try {
        await request('/ads', { adText, requestKey: submissionKey }, { token: getMemberToken() });
        form.reset(); submissionKey = ''; submissionSignature = ''; formMessage = 'sent';
        await loadList();
      } catch (error) { formMessage = errorKey(error) === 'error' ? 'sendError' : errorKey(error); }
      finally { sending = false; for (const element of form.elements) element.disabled = false; render(); }
    });
    form.addEventListener('input', () => { if (!sending) { formMessage = ''; formStatus.textContent = ''; } });
    document.addEventListener('sitelanguagechange', render);
    loadList();
  });
}());
