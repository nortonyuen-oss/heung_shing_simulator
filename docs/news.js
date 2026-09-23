(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const CATEGORIES = ['城市發展', '城中熱話', '交通台', '吹水台'];
  const REACTIONS = [
    { key: 'like', emoji: '👍', label: 'reactionLike' },
    { key: 'laugh', emoji: '😂', label: 'reactionLaugh' },
    { key: 'angry', emoji: '😡', label: 'reactionAngry' },
    { key: 'share', emoji: '↗', label: 'reactionShare' },
    { key: 'clown', emoji: '🤡', label: 'reactionClown' },
  ];
  const REACTION_COLUMN = { like: 'likes', laugh: 'laughs', angry: 'angry', share: 'shares', clown: 'clowns' };

  document.addEventListener('DOMContentLoaded', () => {
    const { request, populateNicknameSuggestions, randomNickname, newRequestKey, imageUrl } = window.ForumCommon || {};
    if (!request) return;
    const phrase = (key, params) => siteT(`news.${key}`, params);
    const tabsNav = document.querySelector('[data-news-tabs]');
    const composeForm = document.querySelector('[data-news-compose-form]');
    const composeStatus = document.querySelector('[data-news-compose-status]');
    const list = document.querySelector('[data-news-list]');
    const status = document.querySelector('[data-news-status]');
    const previous = document.querySelector('[data-news-previous]');
    const next = document.querySelector('[data-news-next]');
    if (!list || !status || !composeForm) return;
    populateNicknameSuggestions(document.getElementById('news-compose-nickname-suggestions'));
    composeForm.querySelector('[data-random-nickname]')?.addEventListener('click', () => {
      const input = composeForm.querySelector('[name=nickname]');
      input.value = randomNickname();
      input.focus();
    });

    const threads = new Map();
    let activeCategory = 'all';
    let rows = [], page = 1, hasNext = false, sequence = 0, state = 'loading';
    let composeSending = false;

    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = String(text);
      if (className) element.className = className;
      return element;
    }
    function errorKey(error) {
      return ['notConfigured', 'limited', 'invalid', 'unauthorized'].includes(error.message) ? error.message : 'error';
    }
    function threadKey(item) { return `${item.kind}-${item.id}`; }
    function commentsRoute(item) { return item.kind === 'news' ? `/news/${item.id}/comments` : `/posts/${item.id}/comments`; }
    function reactRoute(item) { return item.kind === 'news' ? `/news/${item.id}/react` : `/posts/${item.id}/react`; }

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

    function renderTabs() {
      tabsNav?.querySelectorAll('[data-news-tab]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.newsTab === activeCategory);
      });
    }

    function renderReactions(item) {
      const bar = node('div', undefined, 'news-reactions');
      for (const reaction of REACTIONS) {
        const column = REACTION_COLUMN[reaction.key];
        const button = node('button', `${reaction.emoji} ${Number(item[column]) || 0}`, undefined);
        button.type = 'button';
        button.setAttribute('aria-label', phrase(reaction.label));
        button.addEventListener('click', async () => {
          if (button.disabled) return;
          bar.querySelectorAll('button').forEach((el) => { el.disabled = true; });
          try {
            const result = await request(reactRoute(item), { reaction: reaction.key });
            Object.assign(item, result.item);
            render();
          } catch (error) {
            bar.querySelectorAll('button').forEach((el) => { el.disabled = false; });
            const notice = node('p', phrase(errorKey(error) === 'error' ? 'reactionError' : errorKey(error)), 'news-comment-meta');
            bar.after(notice);
            setTimeout(() => notice.remove(), 4000);
          }
        });
        bar.append(button);
      }
      return bar;
    }

    function render() {
      renderTabs();
      status.textContent = phrase(state === 'ready' ? (rows.length ? 'loaded' : 'empty') : state);
      previous.disabled = state === 'loading' || page === 1;
      next.disabled = state === 'loading' || !hasNext;
      document.querySelector('[data-news-page]').textContent = `${phrase('page')} ${page}`;
      list.setAttribute('aria-busy', String(state === 'loading'));
      list.replaceChildren();
      for (const item of rows) {
        const article = node('article', undefined, 'news-card');
        article.id = `${item.kind}-${item.id}`;
        if (item.kind === 'news' && item.image_key) {
          const image = node('img');
          image.src = imageUrl(item.image_key);
          image.alt = '';
          image.loading = 'lazy';
          article.append(image);
        }
        const heading = node('div', undefined, 'news-card-heading');
        heading.append(node('h2', item.headline || phrase('untitled')));
        if (item.kind === 'news') heading.append(node('span', phrase('official'), 'news-official-badge'));
        article.append(heading);
        const created = new Date(item.created_at);
        const formatted = Number.isNaN(created.getTime()) ? '' : created.toLocaleDateString(SITE_INTL_LOCALE[siteCurrentLanguage]);
        const metaParts = [item.kind === 'post' ? (item.nickname || phrase('anonymous')) : '', formatted].filter(Boolean);
        article.append(node('p', metaParts.join(' · '), 'news-card-meta'));
        for (const paragraph of String(item.body || '').split('\n').filter(Boolean)) {
          article.append(node('p', paragraph, 'news-paragraph'));
        }
        article.append(renderReactions(item));

        const detail = node('details');
        const summary = node('summary', `${phrase('readComments')} · ${Number(item.comments) || 0} ${phrase('comments')}`);
        detail.append(summary);
        const key = threadKey(item);
        const thread = threads.get(key) || { open: false, loaded: false, loading: false, error: '', rows: [], page: 0, hasNext: false, nickname: '', details: '', sending: false, key: '', signature: '', notice: '' };
        threads.set(key, thread);
        detail.open = thread.open;
        for (const comment of thread.rows) {
          const row = node('div', undefined, 'news-comment');
          const commentDate = new Date(comment.created_at);
          const commentFormatted = Number.isNaN(commentDate.getTime()) ? '' : commentDate.toLocaleDateString(SITE_INTL_LOCALE[siteCurrentLanguage]);
          row.append(node('p', `${comment.nickname || phrase('anonymous')}${commentFormatted ? ' · ' + commentFormatted : ''}`, 'news-comment-meta'));
          row.append(node('div', comment.body || '', 'news-comment-body'));
          detail.append(row);
        }
        if (thread.loading) detail.append(node('p', phrase('loading'), 'news-comment-meta'));
        if (thread.error) detail.append(node('p', phrase(thread.error), 'news-comment-meta'));
        if ((thread.error || thread.hasNext) && !thread.loading) {
          const more = node('button', phrase(thread.error ? 'retry' : 'moreComments'), 'feedback-secondary');
          more.type = 'button';
          more.addEventListener('click', () => loadComments(item));
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
          input.id = `news-${input.name}-${key}`;
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
            await request(commentsRoute(item), { nickname: thread.nickname.trim(), body: thread.details.trim(), requestKey: thread.key });
            thread.details = ''; thread.key = ''; thread.signature = ''; thread.notice = 'commentSent';
            item.comments = Number(item.comments || 0) + 1;
            thread.rows = []; thread.page = 0; thread.loaded = false; thread.hasNext = false;
            await loadComments(item);
          } catch (error) { thread.notice = errorKey(error) === 'error' ? 'sendError' : errorKey(error); }
          finally { thread.sending = false; render(); }
        });
        detail.append(form);
        detail.addEventListener('toggle', () => {
          if (!detail.isConnected) return;
          thread.open = detail.open;
          if (detail.open && !thread.loaded && !thread.loading && !thread.error && item.comments > 0) loadComments(item);
        });
        article.append(detail);
        list.append(article);
      }
    }

    async function loadComments(item) {
      const key = threadKey(item);
      const thread = threads.get(key);
      if (!thread || thread.loading) return;
      thread.loading = true; thread.error = ''; render();
      try {
        const result = await request(`${commentsRoute(item)}?page=${thread.page + 1}`);
        if (threads.get(key) !== thread) return;
        if (!Array.isArray(result.items)) throw new Error('error');
        thread.rows.push(...result.items); thread.page++; thread.loaded = true; thread.hasNext = !!result.hasNext;
      } catch (error) { thread.error = errorKey(error); }
      finally { thread.loading = false; if (threads.get(key) === thread) render(); }
    }

    // News articles are moderator-authored and low-volume, so they're fetched in full on page 1
    // only and merged in with that page's posts; pages 2+ are pure post pagination. Fetching news
    // on every page would duplicate the same articles across pages instead of paging through them.
    async function loadList() {
      const current = ++sequence;
      state = 'loading'; render();
      try {
        const categoryParam = activeCategory === 'all' ? 'all' : activeCategory;
        const postsResult = await request(`/posts?category=${categoryParam}&page=${page}`);
        if (!Array.isArray(postsResult.items)) throw new Error('error');
        let newsItems = [];
        if (page === 1) {
          const newsResult = await request(`/news?category=${categoryParam}`);
          if (!Array.isArray(newsResult.items)) throw new Error('error');
          newsItems = newsResult.items.map((item) => ({ ...item, kind: 'news' }));
        }
        if (current !== sequence) return;
        const postItems = postsResult.items.map((item) => ({ ...item, kind: 'post' }));
        rows = [...newsItems, ...postItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        hasNext = !!postsResult.hasNext;
        state = 'ready';
      } catch (error) { if (current === sequence) state = errorKey(error); }
      if (current === sequence) render();
    }

    tabsNav?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-news-tab]');
      if (!button || button.dataset.newsTab === activeCategory) return;
      activeCategory = button.dataset.newsTab;
      page = 1;
      // A visitor composing from within a category tab most likely means to post there.
      const categorySelect = composeForm.querySelector('[name=category]');
      if (categorySelect && CATEGORIES.includes(activeCategory)) categorySelect.value = activeCategory;
      loadList();
    });

    composeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (composeSending || !composeForm.reportValidity()) return;
      const values = Object.fromEntries(new FormData(composeForm));
      const nickname = String(values.nickname || '').trim();
      const category = CATEGORIES.includes(values.category) ? values.category : '城中熱話';
      const headline = String(values.headline || '').trim();
      const body = String(values.body || '').trim();
      if (!headline || !body) { composeStatus.textContent = phrase('postRequired'); return; }
      composeSending = true;
      composeStatus.textContent = phrase('sending');
      for (const element of composeForm.elements) element.disabled = true;
      try {
        await request('/posts', { category, headline, body, nickname, requestKey: newRequestKey() });
        composeForm.reset();
        composeStatus.textContent = phrase('postSent');
        page = 1;
        await loadList();
      } catch (error) {
        composeStatus.textContent = phrase(errorKey(error) === 'error' ? 'sendError' : errorKey(error));
      } finally {
        composeSending = false;
        for (const element of composeForm.elements) element.disabled = false;
      }
    });
    composeForm.addEventListener('input', () => { if (!composeSending) composeStatus.textContent = ''; });

    previous?.addEventListener('click', () => { if (page > 1) { page--; loadList(); } });
    next?.addEventListener('click', () => { if (hasNext) { page++; loadList(); } });
    document.addEventListener('sitelanguagechange', render);
    loadList();
  });
}());
