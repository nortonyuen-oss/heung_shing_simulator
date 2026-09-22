(function () {
  'use strict';
  const TYPES = ['bug', 'question', 'suggestion', 'comment'];
  // Same public-exam-Chinese-writing-paper name pool the in-game NPC forum uses
  // (newspaper.js's getExamForumCitizenName) — duplicated here because the website
  // has no shared build step with the game code, just a nickname suggestion list.
  const NICKNAME_GIVEN_NAMES = ['英秀', '一心', '幼羚', '家寶', '念慈', '思賢', '有容', '向華', '修端', '允行'];
  const NICKNAME_SURNAMES = ['陳', '李', '黃', '張', '梁', '林', '劉', '何', '鄭', '周', '羅', '許'];
  function memoColor(value, random = Math.random) {
    return Number.isInteger(value) && value >= 0 && value < 6 ? value : Math.floor(random() * 6);
  }
  function randomNickname(random = Math.random) {
    const surname = NICKNAME_SURNAMES[Math.floor(random() * NICKNAME_SURNAMES.length)];
    const given = NICKNAME_GIVEN_NAMES[Math.floor(random() * NICKNAME_GIVEN_NAMES.length)];
    return surname + given;
  }
  function payload(values, requestKey) {
    return {
      type: TYPES.includes(values.type) ? values.type : 'comment',
      title: String(values.title || '').trim(), details: String(values.details || '').trim(),
      nickname: String(values.nickname || '').trim(), version: String(values.version || '').trim(),
      platform: String(values.platform || '').trim(), requestKey,
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { memoColor, payload, randomNickname };
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('[data-feedback-form]');
    if (!form) return;
    const api = String(window.FEEDBACK_API_URL || '').replace(/\/$/, '');
    const phrase = key => siteT(`feedback.${key}`);
    const list = document.querySelector('[data-feedback-list]');
    const status = document.querySelector('[data-feedback-status]');
    const formStatus = document.querySelector('[data-feedback-form-status]');
    const filter = document.querySelector('[data-feedback-filter]');
    const previous = document.querySelector('[data-feedback-previous]');
    const next = document.querySelector('[data-feedback-next]');
    const refresh = document.querySelector('[data-feedback-refresh]');
    const submit = form.querySelector('[type=submit]');
    const nicknameSuggestions = document.getElementById('nickname-suggestions');
    if (nicknameSuggestions) {
      for (const surname of NICKNAME_SURNAMES) {
        for (const given of NICKNAME_GIVEN_NAMES) {
          const option = document.createElement('option');
          option.value = surname + given;
          nicknameSuggestions.append(option);
        }
      }
    }
    document.querySelector('[data-random-nickname]')?.addEventListener('click', () => {
      const input = form.querySelector('[name=nickname]');
      input.value = randomNickname();
      input.focus();
    });
    const threads = new Map(), colors = new Map();
    let rows = [], page = 1, hasNext = false, sequence = 0, state = 'loading';
    let sending = false, submissionKey = '', submissionSignature = '', formMessage = '';
    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = String(text);
      if (className) element.className = className;
      return element;
    }
    function authorAndDate(item) {
      const date = new Date(item.created_at);
      const formatted = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(SITE_INTL_LOCALE[siteCurrentLanguage]);
      return `${item.nickname || phrase('anonymous')}${formatted ? ' · ' + formatted : ''}`;
    }
    async function request(path, body) {
      if (!api) throw new Error('notConfigured');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(api + path, {
          method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store',
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined, signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 429 ? 'limited' : (response.status === 400 || response.status === 413 ? 'invalid' : 'error'));
        return await response.json();
      } finally { clearTimeout(timeout); }
    }
    function collection(result) {
      if (!result || !Array.isArray(result.items) || typeof result.hasNext !== 'boolean') throw new Error('error');
      return result;
    }
    function errorKey(error) { return ['notConfigured', 'limited', 'invalid'].includes(error.message) ? error.message : 'error'; }
    function field(labelKey, name, value, multiline = false) {
      const label = node('label');
      const input = node(multiline ? 'textarea' : 'input');
      input.name = name; input.value = value;
      input.maxLength = multiline ? 6000 : 40;
      if (multiline) { input.rows = 3; input.required = true; }
      if (name === 'nickname') {
        const randomButton = node('button', phrase('randomNickname'), 'feedback-secondary');
        randomButton.type = 'button';
        randomButton.addEventListener('click', () => {
          input.value = randomNickname();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        });
        const row = node('span', undefined, 'nickname-row');
        row.append(input, randomButton);
        label.append(node('span', phrase(labelKey)), row);
        return { label, input };
      }
      label.append(node('span', phrase(labelKey)), input);
      return { label, input };
    }
    function render() {
      status.textContent = phrase(state === 'ready' ? (rows.length ? 'loaded' : 'empty') : state);
      previous.disabled = state === 'loading' || page === 1;
      next.disabled = state === 'loading' || !hasNext;
      refresh.disabled = state === 'loading' || !api;
      submit.disabled = sending || !api;
      submit.textContent = phrase(sending ? 'sending' : 'send');
      formStatus.textContent = formMessage ? phrase(formMessage) : (!api ? phrase('notConfigured') : '');
      document.querySelector('[data-feedback-page]').textContent = `${phrase('page')} ${page}`;
      list.setAttribute('aria-busy', String(state === 'loading'));
      // Keep keyboard focus and typed reply drafts through background reads/language changes.
      const active = list.contains(document.activeElement) ? document.activeElement : null;
      const focusId = active?.id, selection = active?.selectionStart;
      list.replaceChildren();
      for (const item of rows) {
        const card = node('article', undefined, 'feedback-card');
        card.id = `memo-${item.number}`;
        const kind = TYPES.includes(item.type) ? item.type : 'comment';
        card.dataset.memoType = kind;
        if (!colors.has(item.number)) colors.set(item.number, memoColor(item.color));
        card.dataset.memoColor = String(colors.get(item.number));
        const stamp = node('div', undefined, 'memo-stamp');
        stamp.append(node('span', phrase(kind)), node('span', `#${item.number}`));
        const heading = node('h3', item.title || phrase('untitled'));
        const message = String(item.body || '');
        const excerpt = node('p', message.slice(0, 240) + (message.length > 240 ? '…' : ''), 'memo-excerpt');
        const meta = node('p', authorAndDate(item), 'feedback-meta');
        meta.append(' · ', node('span', phrase(item.state === 'closed' ? 'closed' : 'open'), 'feedback-badge'));
        const detail = node('details');
        const summary = node('summary', `${phrase('readThread')} · ${Number(item.comments) || 0} ${phrase('replies')}`);
        summary.id = `thread-${item.number}`;
        detail.append(summary, node('div', message || phrase('noBody'), 'feedback-message'));
        if (item.version || item.platform) detail.append(node('p', [item.version, item.platform].filter(Boolean).join(' · '), 'feedback-meta'));
        const thread = threads.get(item.number) || { open: false, loaded: false, loading: false, error: '', rows: [], page: 0, hasNext: false, nickname: '', details: '', sending: false, key: '', signature: '', notice: '' };
        threads.set(item.number, thread);
        detail.open = thread.open;
        for (const comment of thread.rows) {
          const reply = node('div', undefined, 'feedback-reply');
          reply.append(node('p', authorAndDate(comment), 'feedback-meta'), node('div', comment.body || phrase('noBody'), 'feedback-message'));
          detail.append(reply);
        }
        if (thread.loading) detail.append(node('p', phrase('loading'), 'feedback-meta'));
        if (thread.error) detail.append(node('p', phrase(thread.error), 'feedback-meta'));
        if ((thread.error || thread.hasNext) && !thread.loading) {
          const more = node('button', phrase(thread.error ? 'retry' : 'moreReplies'), 'feedback-secondary');
          more.type = 'button'; more.id = `more-${item.number}`;
          more.addEventListener('click', () => loadComments(item.number));
          detail.append(more);
        }
        const replyForm = node('form', undefined, 'memo-reply-form');
        const nickname = field('nickname', 'nickname', thread.nickname);
        nickname.input.setAttribute('list', 'nickname-suggestions');
        const text = field('writeReply', 'details', thread.details, true);
        const button = node('button', phrase(thread.sending ? 'sending' : 'sendReply'), 'feedback-secondary');
        button.type = 'submit'; button.id = `reply-submit-${item.number}`;
        const notice = node('p', thread.notice ? phrase(thread.notice) : '', 'feedback-meta'); notice.setAttribute('role', 'status');
        for (const { input } of [nickname, text]) {
          input.id = `reply-${input.name}-${item.number}`; input.disabled = thread.sending;
          input.addEventListener('input', () => { thread[input.name] = input.value; thread.notice = ''; notice.textContent = ''; });
        }
        button.disabled = thread.sending || !api;
        replyForm.append(nickname.label, text.label, button, notice);
        replyForm.addEventListener('submit', async event => {
          event.preventDefault();
          if (thread.sending || !replyForm.reportValidity()) return;
          if (!thread.details.trim()) { thread.notice = 'required'; render(); return; }
          const signature = JSON.stringify([thread.nickname.trim(), thread.details.trim()]);
          if (signature !== thread.signature) { thread.key = crypto.randomUUID(); thread.signature = signature; }
          thread.sending = true; thread.notice = 'sending'; render();
          try {
            const result = await request(`/messages/${item.number}/replies`, { nickname: thread.nickname.trim(), details: thread.details.trim(), requestKey: thread.key });
            if (!Number.isSafeInteger(result.item?.id)) throw new Error('error');
            thread.details = ''; thread.key = ''; thread.signature = ''; thread.notice = 'replySent';
            item.comments = Number(item.comments || 0) + 1;
            thread.rows = []; thread.page = 0; thread.loaded = false; thread.hasNext = false;
            await loadComments(item.number);
          } catch (error) { thread.notice = errorKey(error) === 'error' ? 'sendError' : errorKey(error); }
          finally { thread.sending = false; render(); }
        });
        detail.append(replyForm);
        detail.addEventListener('toggle', () => {
          if (!detail.isConnected) return;
          thread.open = detail.open;
          if (detail.open && !thread.loaded && !thread.loading && !thread.error && item.comments > 0) loadComments(item.number);
        });
        card.append(stamp, heading, excerpt, meta, detail); list.append(card);
      }
      if (focusId) {
        const restored = document.getElementById(focusId);
        restored?.focus({ preventScroll: true });
        if (typeof selection === 'number' && restored?.setSelectionRange) restored.setSelectionRange(selection, selection);
      }
    }
    async function loadComments(number) {
      const thread = threads.get(number);
      if (!thread || thread.loading) return;
      thread.loading = true; thread.error = ''; render();
      try {
        const result = collection(await request(`/messages/${number}/replies?page=${thread.page + 1}`));
        if (threads.get(number) !== thread) return;
        thread.rows.push(...result.items); thread.page++; thread.loaded = true; thread.hasNext = result.hasNext;
      } catch (error) { thread.error = errorKey(error); }
      finally { thread.loading = false; if (threads.get(number) === thread) render(); }
    }
    async function loadList() {
      const current = ++sequence;
      state = api ? 'loading' : 'notConfigured'; rows = []; hasNext = false; render();
      if (!api) return;
      try {
        const result = collection(await request(`/messages?state=${filter.value}&page=${page}`));
        if (current !== sequence) return;
        rows = result.items.filter(item => Number.isSafeInteger(item?.number) && item.number > 0);
        hasNext = result.hasNext; state = 'ready';
      } catch (error) { if (current === sequence) state = errorKey(error); }
      if (current === sequence) render();
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (sending || !form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      if (!values.title.trim() || !values.details.trim()) { formMessage = 'required'; render(); return; }
      const signature = JSON.stringify(payload(values, ''));
      if (signature !== submissionSignature) { submissionKey = crypto.randomUUID(); submissionSignature = signature; }
      sending = true; formMessage = 'sending';
      for (const element of form.elements) element.disabled = true;
      render();
      try {
        const result = await request('/messages', payload(values, submissionKey));
        if (!Number.isSafeInteger(result.item?.number)) throw new Error('error');
        form.reset(); submissionKey = ''; submissionSignature = ''; formMessage = 'sent';
        filter.value = 'all'; page = 1;
        await loadList();
        document.getElementById(`memo-${result.item.number}`)?.scrollIntoView({ block: 'center' });
      } catch (error) { formMessage = errorKey(error) === 'error' ? 'sendError' : errorKey(error); }
      finally { sending = false; for (const element of form.elements) element.disabled = false; render(); }
    });
    form.addEventListener('input', () => { if (!sending) { formMessage = ''; formStatus.textContent = ''; } });
    filter.addEventListener('change', () => { page = 1; loadList(); });
    previous.addEventListener('click', () => { if (page > 1) { page--; loadList(); } });
    next.addEventListener('click', () => { if (hasNext) { page++; loadList(); } });
    refresh.addEventListener('click', () => { for (const thread of threads.values()) { thread.loaded = false; thread.page = 0; thread.rows = []; thread.error = ''; } loadList(); });
    document.addEventListener('sitelanguagechange', render);
    loadList();
  });
}());
