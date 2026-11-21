// 香城 1999 shell (docs/site-redesign-spec.md §5): the top bar, the left nav (a bar along the bottom on a
// phone) and the footer, the same on every page. Load it deferred before i18n.js: it builds the shell
// before DOMContentLoaded, so i18n.js translates the data-i18n keys in it with the rest of the page.
(function () {
  const body = document.body;
  const main = document.querySelector('body > main');
  if (!body || !main) return;
  const page = body.dataset.page || 'home';
  const onHome = page === 'home';
  const home = (hash) => (onHome ? hash : `index.html${hash}`);
  // the old one-page site's anchors, still in shared links: the moved ones go to their pages
  if (onHome) {
    const moved = { '#changelog': 'changelog.html', '#gallery': 'gallery.html', '#nightlife': 'gallery.html', '#trailer': 'gallery.html' };
    const renamed = { '#requirements': '#downloads', '#browser-play': '#downloads', '#stats': '#news', '#manual': '#downloads' };
    if (moved[location.hash]) {
      location.replace(moved[location.hash]);
      return;
    }
    if (renamed[location.hash]) {
      history.replaceState(null, '', renamed[location.hash]);
      document.addEventListener('DOMContentLoaded', () => document.querySelector(location.hash)?.scrollIntoView());
    }
  }
  const PLAY_URL = 'https://heung-shing-play.nortonyuen.workers.dev';
  const GITHUB = 'https://github.com/nortonyuen-oss/heung_shing_simulator';

  const NAV = [
    { key: 'shell.home', href: onHome ? '#top' : 'index.html', icon: '⌂', section: 'top', pages: ['home'] },
    { key: 'shell.campaign', href: home('#campaign'), icon: '⚓', section: 'campaign' },
    { key: 'shell.features', href: home('#features'), icon: '★', section: 'features', pages: ['gallery'] },
    { key: 'shell.downloads', href: home('#downloads'), icon: '⬇', section: 'downloads' },
    { key: 'shell.guide', href: 'guide.html', icon: '✎', pages: ['guide'] },
    { key: 'shell.community', href: home('#community'), icon: '✉', section: 'community', pages: ['news', 'feedback', 'member', 'ads'],
      children: [['news', 'nav.news'], ['feedback', 'nav.feedback'], ['member', 'nav.member'], ['ads', 'nav.ads']] },
  ];
  const MORE = [['changelog', 'shell.releases'], ['gallery', 'shell.gallery'], ['copyright', 'nav.copyright']];

  const element = (tag, attributes = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attributes).forEach(([name, value]) => {
      if (value === true) node.setAttribute(name, '');
      else if (value != null && value !== false) node.setAttribute(name, value);
    });
    children.forEach((child) => node.append(child));
    return node;
  };
  const label = (key) => element('span', { 'data-i18n': key }, [key]);
  const LANGUAGES = [['zh-HK', '中文（香港）'], ['zh-TW', '中文（台灣）'], ['en', 'English'], ['ja', '日本語']];
  function languageSelect() {
    const select = element('select', { class: 'hs-lang-select', 'data-i18n-attr': 'aria-label:shell.langLabel' },
      LANGUAGES.map(([value, name]) => element('option', { value }, [name])));
    select.addEventListener('change', () => { if (typeof setSiteLanguage === 'function') setSiteLanguage(select.value); });
    document.addEventListener('sitelanguagechange', (event) => { select.value = event.detail?.language || select.value; });
    return select;
  }
  const here = (item) => (item.pages || []).includes(page);
  const navLink = (item, withIcon = true) => element('a', {
    href: item.href, 'data-section': item.section, class: here(item) ? 'is-here' : null, 'aria-current': here(item) ? 'page' : null,
  }, [...(withIcon ? [element('span', { class: 'ic', 'aria-hidden': 'true' }, [item.icon])] : []), label(item.key)]);
  const pageLink = ([name, key]) => element('a', { href: `${name}.html`, 'aria-current': page === name ? 'page' : null }, [label(key)]);

  // the top bar: the brand, the languages and the big red play button
  const top = element('header', { class: 'hs-top', role: 'banner' }, [
    element('a', { class: 'hs-skip', href: '#top', 'data-i18n': 'shell.skip' }, ['shell.skip']),
    element('a', { class: 'hs-brand', href: 'index.html' }, [
      element('img', { src: 'assets/site/icon.webp', alt: '', width: '40', height: '40' }),
      element('span', {}, [element('b', { 'data-i18n': 'hero.title' }, ['香城模擬器']), element('small', {}, ['HEUNG SHING SIMULATOR'])]),
    ]),
    element('span', { class: 'hs-top-spacer' }),
    element('div', { class: 'lang-switcher', 'data-language-switcher': true, 'data-i18n-attr': 'aria-label:shell.langLabel', role: 'group' }),
    // a phone has no room for four buttons: one compact picker instead
    languageSelect(),
    element('a', { class: 'hs-btn is-play', href: PLAY_URL, rel: 'noopener', 'data-web-play-link': true, 'data-web-copy': 'play' }, ['即刻玩']),
  ]);

  // the left nav: six places, the community's four pages under it, the two new pages below
  const nav = element('nav', { class: 'hs-nav', 'data-i18n-attr': 'aria-label:shell.menu' }, [
    element('p', { class: 'hs-nav-label', 'aria-hidden': 'true' }, ['LOGBOOK']),
  ]);
  NAV.forEach((item) => {
    nav.append(navLink(item));
    if (item.children) nav.append(element('div', { class: 'hs-sub' }, item.children.map(pageLink)));
  });
  nav.append(element('div', { class: 'hs-sub' }, MORE.map(pageLink)));
  nav.append(element('p', { class: 'hs-nav-badge', 'data-i18n': 'shell.badgeView' }, ['Best viewed 1024×768']));

  // the phone's bar along the bottom: the same six places
  const bottom = element('nav', { class: 'hs-bottom-nav', 'data-i18n-attr': 'aria-label:shell.menu' },
    NAV.map((item) => navLink(item)));

  const layout = element('div', { class: 'hs-layout' });
  main.before(top, layout);
  main.classList.add('hs-main');
  if (!main.id) main.id = 'top';
  layout.append(nav, main);

  const footer = element('footer', { class: 'hs-footer' }, [
    element('div', { class: 'hs-footer-links' }, [
      ...MORE.map(pageLink),
      element('a', { href: 'guide.html' }, [label('shell.guide')]),
      element('a', { href: GITHUB, rel: 'noopener' }, ['GitHub']),
      element('a', { href: 'https://heungshingsimulator.blogspot.com/', rel: 'noopener' }, [label('footer.blog')]),
    ]),
    element('div', { class: 'lang-switcher hs-footer-langs', 'data-language-switcher': true, 'data-i18n-attr': 'aria-label:shell.langLabel', role: 'group' }),
    element('div', { class: 'hs-badges', 'aria-hidden': 'true' }, [
      element('span', { class: 'hs-badge is-maroon', 'data-i18n': 'shell.badgePresents' }, ['香城市政規劃局 Presents']),
      element('span', { class: 'hs-badge', 'data-i18n': 'shell.badgeView' }, ['Best viewed 1024×768']),
      element('span', { class: 'hs-badge' }, ['HTML 4.0 · Netscape OK']),
      element('span', { class: 'hs-badge is-maroon', 'data-i18n': 'shell.badgeMade' }, ['Made in Heung Shing']),
    ]),
    element('small', { 'data-i18n': 'footer.tagline' }, ['香城模擬器 · 免費遊玩，歡迎分享官方連結']),
  ]);
  layout.after(bottom, footer);
  body.classList.add('hs');

  // on the home page the nav follows the section being read
  if (!onHome || !('IntersectionObserver' in window)) return;
  const links = [...document.querySelectorAll('.hs-nav a[data-section], .hs-bottom-nav a[data-section]')];
  const observer = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      const id = entry.target.dataset.navSection;
      links.forEach((link) => link.classList.toggle('is-here', link.dataset.section === id));
    });
  }, { rootMargin: '-35% 0px -60% 0px' });
  ['top', 'news', 'campaign', 'features', 'downloads', 'community'].forEach((id) => {
    const section = id === 'top' ? document.querySelector('.hs-hero') : document.getElementById(id);
    if (!section) return;
    section.dataset.navSection = id === 'news' ? 'top' : id;
    observer.observe(section);
  });
})();
