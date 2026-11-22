// 香城 1999 page parts (docs/site-redesign-spec.md §7): the queen's latest orders on the home page, the
// 18-district chart, the grouped release history, and the characters' name plates. They render from
// i18n.js (SITE_TEXT, buildLocalizedChangelog) and site-campaign.js, and re-render on every language switch.
(function () {
  const PEOPLE = {
    secretary: { zhHant: '金毛玲', en: 'Kam Mo-ling', ja: '金毛玲' },
    queen: { zhHant: '香城女皇', en: 'The Queen', ja: '香城女王' },
    aviation: { zhHant: 'Captain Cool', en: 'Captain Cool', ja: 'キャプテン・クール' },
    uncleBus: { zhHant: '巴士阿叔', en: 'Bus Uncle', ja: 'バスおじさん' },
    villager: { zhHant: '廈村祥叔', en: 'Uncle Cheung of Ha Tsuen', ja: '廈村の祥おじさん' },
    foodie: { zhHant: '為食 Viviane', en: 'Hungry Viviane', ja: '食いしん坊ビビアン' },
    tycoon: { zhHant: '李超人', en: 'Superman Li', ja: '李超人' },
  };
  const NEW_DAYS = 21;
  let chapterIndex = 0;

  const language = () => (typeof siteCurrentLanguage === 'string' ? siteCurrentLanguage : 'zh-HK');
  const pick = (text) => {
    const lang = language();
    return (lang === 'en' ? text.en : lang === 'ja' ? text.ja : text.zhHant) || text.zhHant;
  };
  const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
  const plain = (html) => {
    const node = document.createElement('div');
    node.innerHTML = html;
    return node.textContent.trim();
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const isNew = (date) => Number.isFinite(Date.parse(date)) && (Date.now() - Date.parse(date)) / 86400000 <= NEW_DAYS;

  function renderPeople() {
    document.querySelectorAll('[data-person]').forEach((node) => {
      const person = PEOPLE[node.dataset.person];
      if (person) node.textContent = pick(person);
    });
  }

  // ② the three latest releases, as the queen's orders
  function renderLatestOrders() {
    const list = document.querySelector('[data-render="latest-orders"]');
    if (!list || typeof buildLocalizedChangelog !== 'function') return;
    list.innerHTML = '';
    buildLocalizedChangelog(language()).slice(0, 3).forEach((release, index) => {
      const item = element('li');
      const time = element('time', null, release.dateLabel);
      time.dateTime = release.date;
      item.append(time, element('span', 'v', release.version), element('span', 't', release.title));
      if (index === 0 && isNew(release.date)) item.append(element('span', 'hs-new', 'NEW!'));
      const first = plain(release.items[0] || '');
      item.append(element('span', 'd', first.length > 78 ? `${first.slice(0, 76)}…` : first));
      list.append(item);
    });
  }

  // ③ the chart: a pin and a chip for every chapter, and the chosen chapter's board
  function renderCampaign() {
    const chart = document.querySelector('[data-render="campaign-chart"]');
    const chips = document.querySelector('[data-render="campaign-chips"]');
    const detail = document.querySelector('[data-render="campaign-chapter"]');
    if (!chart || typeof SITE_CAMPAIGN_CHAPTERS === 'undefined') return;
    chart.querySelectorAll('.hs-pin').forEach((pin) => pin.remove());
    if (chips) chips.innerHTML = '';
    SITE_CAMPAIGN_CHAPTERS.forEach((chapter, index) => {
      const name = `${fill(siteT('home.chapter'), { n: chapter.number })} · ${pick(chapter.district)}`;
      const pin = element('button', 'hs-pin', String(chapter.number));
      pin.type = 'button';
      pin.style.left = `${chapter.x}%`;
      pin.style.top = `${chapter.y}%`;
      pin.setAttribute('aria-label', name);
      pin.title = name;
      pin.addEventListener('click', () => selectChapter(index));
      chart.append(pin);
      if (chips) {
        const chip = element('button', 'hs-chip', String(chapter.number));
        chip.type = 'button';
        chip.setAttribute('aria-label', name);
        chip.append(element('span', null, pick(chapter.district)));
        chip.addEventListener('click', () => selectChapter(index));
        chips.append(chip);
      }
    });
    if (detail) selectChapter(chapterIndex);
  }

  function selectChapter(index) {
    chapterIndex = index;
    const chapter = SITE_CAMPAIGN_CHAPTERS[index];
    document.querySelectorAll('[data-render="campaign-chart"] .hs-pin, [data-render="campaign-chips"] .hs-chip').forEach((button, i) => {
      const on = i % SITE_CAMPAIGN_CHAPTERS.length === index;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    const detail = document.querySelector('[data-render="campaign-chapter"]');
    if (!detail || !chapter) return;
    detail.innerHTML = '';
    const art = element('div', 'hs-chapter-art');
    const image = element('img');
    image.src = chapter.board;
    image.alt = pick(chapter.title);
    image.loading = 'lazy';
    image.decoding = 'async';
    art.append(image, element('b', null, `${fill(siteT('home.chapter'), { n: chapter.number })} · ${pick(chapter.district)}`));
    detail.append(art, element('h3', null, `《${pick(chapter.title)}》`));
  }

  // the release history page: every version, grouped by its major number, the newest group open
  function renderReleaseHistory() {
    const root = document.querySelector('[data-render="release-history"]');
    if (!root || typeof buildLocalizedChangelog !== 'function') return;
    const releases = buildLocalizedChangelog(language());
    const groups = new Map();
    releases.forEach((release) => {
      const major = String(release.version).replace(/^v/, '').split('.')[0];
      if (!groups.has(major)) groups.set(major, []);
      groups.get(major).push(release);
    });
    root.innerHTML = '';
    [...groups.entries()].forEach(([major, list], groupIndex) => {
      const group = element('details', 'hs-group');
      group.open = groupIndex === 0;
      const summary = element('summary');
      summary.append(element('b', null, fill(siteT('changelogPage.group'), { major })),
        element('span', null, `${fill(siteT('changelogPage.count'), { n: list.length })} · ${list[list.length - 1].dateLabel} – ${list[0].dateLabel}`));
      const body = element('div', 'hs-releases');
      list.forEach((release) => {
        const latest = release === releases[0];
        const article = element('article', latest ? 'hs-release is-latest' : 'hs-release');
        article.id = release.version.replace(/\./g, '-');
        const header = element('header');
        const time = element('time', null, release.dateLabel);
        time.dateTime = release.date;
        header.append(element('span', 'v', release.version), time);
        if (latest) header.append(element('span', 'hs-new', siteT('changelogPage.latest')));
        const items = element('ul');
        release.items.forEach((html) => {
          const item = element('li');
          item.innerHTML = html; // the changelog's own markup (i18n.js), not visitor input
          items.append(item);
        });
        article.append(header, element('h3', null, release.title), items);
        body.append(article);
      });
      group.append(summary, body);
      root.append(group);
    });
    // a link to one version (changelog.html#v6-0-7) opens its group
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target) {
      target.closest('details').open = true;
      target.scrollIntoView();
    }
  }

  // ④ each comic panel opens its picture in the gallery's lightbox (site.js), captioned in this language
  function renderPanels() {
    document.querySelectorAll('.hs-panel[data-feature]').forEach((panel) => {
      const key = `home.features.${panel.dataset.feature}`;
      panel.dataset.galleryTitle = siteT(`${key}.title`);
      panel.dataset.galleryCaption = siteT(`${key}.text`);
      panel.dataset.galleryAlt = siteT(`${key}.title`);
      panel.setAttribute('aria-label', `${siteT('gallery.openImage')}：${siteT(`${key}.title`)}`);
    });
  }

  function renderAll() {
    renderPeople();
    renderPanels();
    renderLatestOrders();
    renderCampaign();
    renderReleaseHistory();
  }
  document.addEventListener('sitelanguagechange', renderAll);
})();
