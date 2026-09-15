(function () {
  'use strict';
  const REPO = 'nortonyuen-oss/heung_shing_simulator';
  const LABEL = 'website-feedback';
  const API = `https://api.github.com/repos/${REPO}`;
  const WEB = `https://github.com/${REPO}/issues`;
  const TEMPLATE = 'website-feedback.md';
  const TYPES = ['bug', 'question', 'suggestion', 'comment'];

  function issueUrl(number) {
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid issue number');
    return `${WEB}/${number}`;
  }

  function listUrl(state = 'all', page = 1) {
    if (!['all', 'open', 'closed'].includes(state)) throw new Error('Invalid state');
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('Invalid page');
    const url = new URL(`${API}/issues`);
    url.search = new URLSearchParams({ labels: LABEL, state, sort: 'created', direction: 'desc', per_page: '20', page: String(page) });
    return url.href;
  }

  function preparePost({ type, title, version, platform, details }) {
    const kind = TYPES.includes(type) ? type : 'comment';
    const subject = `[${kind}] ${String(title || '').trim().slice(0, 120)}`;
    const body = [
      '## 類別 / Type', kind, '',
      '## 遊戲版本 / Game version', String(version || '').trim() || '—', '',
      '## 作業系統 / Platform', String(platform || '').trim() || '—', '',
      '## 內容 / Details', String(details || '').trim(), '',
      '---', 'Submitted via https://nortonyuen-oss.github.io/heung_shing_simulator/feedback.html',
    ].join('\n');
    const url = new URL(`${WEB}/new`);
    // Labels come from the repository template. Ordinary visitors cannot use
    // GitHub's labels query parameter without repository write permissions.
    url.search = new URLSearchParams({ template: TEMPLATE, title: subject, body });
    const copyRequired = url.href.length > 7000;
    if (copyRequired) url.searchParams.delete('body');
    return { url: url.href, body, copyRequired };
  }

  function publicIssues(items) {
    if (!Array.isArray(items)) throw new Error('Invalid API response');
    return items.filter(item => item && !item.pull_request && Number.isSafeInteger(item.number) && item.number > 0);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { issueUrl, listUrl, preparePost, publicIssues };
  }
  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('[data-feedback-form]');
    if (!form) return;
    const t = key => siteT(`feedback.${key}`);
    const list = document.querySelector('[data-feedback-list]');
    const status = document.querySelector('[data-feedback-status]');
    const filter = document.querySelector('[data-feedback-filter]');
    const previous = document.querySelector('[data-feedback-previous]');
    const next = document.querySelector('[data-feedback-next]');
    const refresh = document.querySelector('[data-feedback-refresh]');
    const composer = document.querySelector('[data-feedback-preview]');
    const draft = document.querySelector('[data-feedback-draft]');
    const publish = document.querySelector('[data-feedback-publish]');
    const copyStatus = document.querySelector('[data-feedback-copy-status]');
    let rows = [], page = 1, hasNext = false, sequence = 0, state = 'loading', prepared = null;
    const threads = new Map();

    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = String(text);
      if (className) element.className = className;
      return element;
    }

    function externalLink(url, text) {
      const link = node('a', text);
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    }

    function authorAndDate(item) {
      const author = typeof item.user?.login === 'string' ? item.user.login : t('unknownAuthor');
      const date = new Date(item.created_at);
      const formatted = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(SITE_INTL_LOCALE[siteCurrentLanguage]);
      return `${author}${formatted ? ' · ' + formatted : ''}`;
    }

    async function readApi(url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/vnd.github+json' },
          credentials: 'omit', signal: controller.signal,
        });
        if (!response.ok) {
          const error = new Error('GitHub API unavailable');
          error.limited = response.status === 403 || response.status === 429;
          throw error;
        }
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid API response');
        return { data, hasNext: /rel="next"/.test(response.headers.get('link') || '') };
      } finally { clearTimeout(timeout); }
    }

    function renderComposer() {
      if (!prepared) return;
      document.querySelector('[data-feedback-handoff]').textContent = t(prepared.copyRequired ? 'longPost' : 'handoff');
      publish.textContent = t(prepared.copyRequired ? 'openAndPaste' : 'publish');
      publish.href = prepared.url;
      draft.value = prepared.body;
    }

    function render() {
      status.textContent = t(state === 'ready' ? (rows.length ? 'loaded' : 'empty') : state);
      previous.disabled = state === 'loading' || page === 1;
      next.disabled = state === 'loading' || !hasNext;
      refresh.disabled = state === 'loading';
      document.querySelector('[data-feedback-page]').textContent = `${t('page')} ${page}`;
      list.setAttribute('aria-busy', String(state === 'loading'));
      list.replaceChildren();
      for (const item of rows) {
        const card = node('article', undefined, 'feedback-card');
        const heading = node('h3');
        heading.appendChild(externalLink(issueUrl(item.number), `#${item.number} ${item.title || t('untitled')}`));
        const meta = node('p', authorAndDate(item), 'feedback-meta');
        const badge = node('span', t(item.state === 'closed' ? 'closed' : 'open'), 'feedback-badge');
        meta.append(' · ', badge);
        const detail = node('details');
        const summary = node('summary', `${t('readThread')} · ${Number(item.comments) || 0} ${t('replies')}`);
        const body = node('div', item.body || t('noBody'), 'feedback-message');
        detail.append(summary, body);
        const thread = threads.get(item.number) || { open: false, loaded: false, loading: false, error: '', rows: [], page: 0, hasNext: false };
        threads.set(item.number, thread);
        detail.open = thread.open;
        for (const comment of thread.rows) {
          const reply = node('div', undefined, 'feedback-reply');
          reply.append(node('p', authorAndDate(comment), 'feedback-meta'), node('div', comment.body || t('noBody'), 'feedback-message'));
          detail.appendChild(reply);
        }
        if (thread.loading) detail.appendChild(node('p', t('loading'), 'feedback-meta'));
        if (thread.error) {
          detail.appendChild(node('p', t(thread.error), 'feedback-meta'));
          const retry = node('button', t('retry'), 'feedback-secondary');
          retry.type = 'button';
          retry.addEventListener('click', () => loadComments(item.number));
          detail.appendChild(retry);
        }
        if (thread.hasNext && !thread.loading && !thread.error) {
          const more = node('button', t('moreReplies'), 'feedback-secondary');
          more.type = 'button';
          more.addEventListener('click', () => loadComments(item.number));
          detail.appendChild(more);
        }
        const replyLink = externalLink(`${issueUrl(item.number)}#new_comment_field`, t('reply'));
        replyLink.className = 'feedback-thread-link';
        detail.appendChild(replyLink);
        detail.addEventListener('toggle', () => {
          // Ignore toggle events from elements replaced during a refresh.
          if (!detail.isConnected) return;
          thread.open = detail.open;
          if (detail.open && !thread.loaded && !thread.loading && !thread.error && item.comments > 0) loadComments(item.number);
        });
        card.append(heading, meta, detail);
        list.appendChild(card);
      }
      renderComposer();
    }

    async function loadComments(number) {
      const thread = threads.get(number);
      if (!thread || thread.loading) return;
      thread.loading = true;
      thread.error = '';
      render();
      try {
        const result = await readApi(`${API}/issues/${number}/comments?per_page=20&page=${thread.page + 1}`);
        if (threads.get(number) !== thread) return;
        thread.rows.push(...result.data.filter(item => item && typeof item === 'object'));
        thread.page++;
        thread.loaded = true;
        thread.hasNext = result.hasNext;
      } catch (error) {
        if (threads.get(number) !== thread) return;
        thread.error = error.limited ? 'limited' : 'error';
      } finally {
        thread.loading = false;
        if (threads.get(number) === thread) render();
      }
    }

    async function loadList() {
      const request = ++sequence;
      state = 'loading';
      rows = [];
      hasNext = false;
      render();
      try {
        const result = await readApi(listUrl(filter.value, page));
        if (request !== sequence) return;
        rows = publicIssues(result.data);
        hasNext = result.hasNext;
        state = 'ready';
      } catch (error) {
        if (request !== sequence) return;
        state = error.limited ? 'limited' : 'error';
      }
      if (request === sequence) render();
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      if (!values.title.trim() || !values.details.trim()) {
        document.querySelector('[data-feedback-form-status]').textContent = t('required');
        return;
      }
      document.querySelector('[data-feedback-form-status]').textContent = '';
      prepared = preparePost(values);
      composer.hidden = false;
      copyStatus.textContent = '';
      renderComposer();
      publish.focus();
    });
    form.addEventListener('input', () => {
      prepared = null;
      composer.hidden = true;
      copyStatus.textContent = '';
    });
    document.querySelector('[data-feedback-copy]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(draft.value); copyStatus.textContent = t('copied'); }
      catch { draft.focus(); draft.select(); copyStatus.textContent = t('copyManually'); }
    });
    filter.addEventListener('change', () => { page = 1; threads.clear(); loadList(); });
    previous.addEventListener('click', () => { if (page > 1) { page--; threads.clear(); loadList(); } });
    next.addEventListener('click', () => { if (hasNext) { page++; threads.clear(); loadList(); } });
    refresh.addEventListener('click', () => { threads.clear(); loadList(); });
    document.addEventListener('sitelanguagechange', () => { copyStatus.textContent = ''; render(); });
    loadList();
  });
}());
