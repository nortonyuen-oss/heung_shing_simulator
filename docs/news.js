(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const { request, populateNicknameSuggestions, randomNickname, newRequestKey, imageUrl } = window.ForumCommon || {};
    if (!request) return;
    const phrase = (key, params) => siteT(`news.${key}`, params);
    const list = document.querySelector('[data-news-list]');
    const status = document.querySelector('[data-news-status]');
    const previous = document.querySelector('[data-news-previous]');
    const next = document.querySelector('[data-news-next]');
    if (!list || !status) return;
    const threads = new Map();
    let rows = [], page = 1, hasNext = false, sequence = 0, state = 'loading';

    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = String(text);
      if (className) element.className = className;
      return element;
    }
    function errorKey(error) {
      return ['notConfigured', 'limited', 'invalid', 'unauthorized'].includes(error.message) ? error.message : 'error';
    }
    function field(labelKey, name, value) {
      const label = node('label');
      const input = node('input');
      input.name = name; input.value = value; input.maxLength = 40; input.autocomplete = 'off';
      if (name === 'nickname') {
        const datalistId = 'news-nickname-suggestions';
        input.setAttribute('list', datalistId);
        let datalist = document.getElementById(datalistId);
        if (!datalist) {
          datalist = node('datalist');
          datalist.id = datalistId;
          document.body.append(datalist);
        }
        populateNicknameSuggestions(datalist);
        const randomButton = node('button', siteT('feedback.randomNickname'), 'feedback-secondary');
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
      document.querySelector('[data-news-page]').textContent = `${phrase('page')} ${page}`;
      list.setAttribute('aria-busy', String(state === 'loading'));
      list.replaceChildren();
      for (const item of rows) {
        const article = node('article', undefined, 'news-card');
        article.id = `news-${item.id}`;
        if (item.image_key) {
          const image = node('img');
          image.src = imageUrl(item.image_key);
          image.alt = '';
          image.loading = 'lazy';
          article.append(image);
        }
        article.append(node('h2', item.headline || phrase('untitled')));
        for (const paragraph of String(item.body || '').split('\n').filter(Boolean)) {
          article.append(node('p', paragraph, 'news-paragraph'));
        }
        const detail = node('details');
        const summary = node('summary', `${phrase('readComments')} · ${Number(item.comments) || 0} ${phrase('comments')}`);
        detail.append(summary);
        const thread = threads.get(item.id) || { open: false, loaded: false, loading: false, error: '', rows: [], page: 0, hasNext: false, nickname: '', details: '', sending: false, key: '', signature: '', notice: '' };
        threads.set(item.id, thread);
        detail.open = thread.open;
        for (const comment of thread.rows) {
          const row = node('div', undefined, 'news-comment');
          const date = new Date(comment.created_at);
          const formatted = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(SITE_INTL_LOCALE[siteCurrentLanguage]);
          row.append(node('p', `${comment.nickname || phrase('anonymous')}${formatted ? ' · ' + formatted : ''}`, 'news-comment-meta'));
          row.append(node('div', comment.body || '', 'news-comment-body'));
          detail.append(row);
        }
        if (thread.loading) detail.append(node('p', phrase('loading'), 'news-comment-meta'));
        if (thread.error) detail.append(node('p', phrase(thread.error), 'news-comment-meta'));
        if ((thread.error || thread.hasNext) && !thread.loading) {
          const more = node('button', phrase(thread.error ? 'retry' : 'moreComments'), 'feedback-secondary');
          more.type = 'button';
          more.addEventListener('click', () => loadComments(item.id));
          detail.append(more);
        }
        const form = node('form', undefined, 'news-comment-form');
        const nickname = field('nickname', 'nickname', thread.nickname);
        const textLabel = node('label');
        const textarea = node('textarea');
        textarea.name = 'details'; textarea.value = thread.details; textarea.rows = 3; textarea.required = true; textarea.maxLength = 1500;
        textLabel.append(node('span', phrase('writeComment')), textarea);
        const button = node('button', phrase(thread.sending ? 'sending' : 'sendComment'), 'feedback-secondary');
        button.type = 'submit';
        const notice = node('p', thread.notice ? phrase(thread.notice) : '', 'news-comment-meta');
        notice.setAttribute('role', 'status');
        for (const input of [nickname.input, textarea]) {
          input.id = `news-${input.name}-${item.id}`;
          input.disabled = thread.sending;
          input.addEventListener('input', () => { thread[input.name] = input.value; thread.notice = ''; notice.textContent = ''; });
        }
        button.disabled = thread.sending;
        form.append(nickname.label, textLabel, button, notice);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (thread.sending || !form.reportValidity()) return;
          if (!thread.details.trim()) { thread.notice = 'required'; render(); return; }
          const signature = JSON.stringify([thread.nickname.trim(), thread.details.trim()]);
          if (signature !== thread.signature) { thread.key = newRequestKey(); thread.signature = signature; }
          thread.sending = true; thread.notice = 'sending'; render();
          try {
            await request(`/news/${item.id}/comments`, { nickname: thread.nickname.trim(), body: thread.details.trim(), requestKey: thread.key });
            thread.details = ''; thread.key = ''; thread.signature = ''; thread.notice = 'commentSent';
            item.comments = Number(item.comments || 0) + 1;
            thread.rows = []; thread.page = 0; thread.loaded = false; thread.hasNext = false;
            await loadComments(item.id);
          } catch (error) { thread.notice = errorKey(error) === 'error' ? 'sendError' : errorKey(error); }
          finally { thread.sending = false; render(); }
        });
        detail.append(form);
        detail.addEventListener('toggle', () => {
          if (!detail.isConnected) return;
          thread.open = detail.open;
          if (detail.open && !thread.loaded && !thread.loading && !thread.error && item.comments > 0) loadComments(item.id);
        });
        article.append(detail);
        list.append(article);
      }
    }

    async function loadComments(newsId) {
      const thread = threads.get(newsId);
      if (!thread || thread.loading) return;
      thread.loading = true; thread.error = ''; render();
      try {
        const result = await request(`/news/${newsId}/comments?page=${thread.page + 1}`);
        if (threads.get(newsId) !== thread) return;
        if (!Array.isArray(result.items)) throw new Error('error');
        thread.rows.push(...result.items); thread.page++; thread.loaded = true; thread.hasNext = !!result.hasNext;
      } catch (error) { thread.error = errorKey(error); }
      finally { thread.loading = false; if (threads.get(newsId) === thread) render(); }
    }

    async function loadList() {
      const current = ++sequence;
      state = 'loading'; render();
      try {
        const result = await request(`/news?page=${page}`);
        if (current !== sequence) return;
        if (!Array.isArray(result.items)) throw new Error('error');
        rows = result.items; hasNext = !!result.hasNext; state = 'ready';
      } catch (error) { if (current === sequence) state = errorKey(error); }
      if (current === sequence) render();
    }

    previous?.addEventListener('click', () => { if (page > 1) { page--; loadList(); } });
    next?.addEventListener('click', () => { if (hasNext) { page++; loadList(); } });
    document.addEventListener('sitelanguagechange', render);
    loadList();
  });
}());
