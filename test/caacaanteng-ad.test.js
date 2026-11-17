const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

function runtime(language = 'zhHant') {
  const context = vm.createContext({
    city: { year: 2000, month: 10, tick: 0, forumPosts: [], lastForumMonthIndex: 99999 },
    navigator: { language },
    localStorage: { getItem: () => null },
    document: { addEventListener() {}, getElementById: () => null },
    normalizeForumImagePath: (value) => value,
    tMonth: String,
    getCityMonthIndex: (year = context.city.year, month = context.city.month) => year * 12 + month - 1,
  });
  vm.runInContext(source('i18n.js'), context);
  vm.runInContext(`currentLanguage = ${JSON.stringify(language)}`, context);
  vm.runInContext(source('newspaper.js'), context);
  return { context, run: (code) => vm.runInContext(code, context) };
}

test('the advert posts immediately, repeats after six game months across years and survives reload', () => {
  const { context, run } = runtime();
  assert.ok(run('maybeAnnounceCaacaantengAd()'));
  const firstMonth = context.city.lastCaacaantengAdMonthIndex;
  for (let offset = 0; offset < 6; offset++) {
    assert.equal(run(`maybeAnnounceCaacaantengAd(${firstMonth + offset})`), null);
  }
  // Saves copy city as JSON. Starting another session must retain the cooldown.
  context.city = JSON.parse(JSON.stringify(context.city));
  context.city.year = 2001;
  context.city.month = 4;
  assert.ok(run('maybeAnnounceCaacaantengAd()'));
  assert.equal(context.city.forumPosts.length, 2);
  assert.notEqual(context.city.forumPosts[0].id, context.city.forumPosts[1].id);
  assert.equal(run('maybeAnnounceCaacaantengAd()'), null);
  assert.equal(run(`maybeAnnounceCaacaantengAd(${firstMonth})`), null);
});

test('skipping months posts once and pruning forum history does not reset the schedule', () => {
  const { context, run } = runtime();
  run('maybeAnnounceCaacaantengAd(100)');
  context.city.forumPosts = [];
  assert.equal(run('maybeAnnounceCaacaantengAd(105)'), null);
  assert.ok(run('maybeAnnounceCaacaantengAd(130)'));
  assert.equal(context.city.forumPosts.length, 1);
  assert.equal(run('maybeAnnounceCaacaantengAd(135)'), null);
  assert.ok(run('maybeAnnounceCaacaantengAd(136)'));
});

test('monthly ad delivery runs even when regular forum news is already handled', () => {
  const { context, run } = runtime();
  assert.equal(run('generateMonthlyForumPost()'), null);
  assert.equal(context.city.forumPosts.length, 1);
  assert.equal(context.city.forumPosts[0].image, 'UI/news/caacaanteng.webp');
  context.city.month += 6;
  run('generateMonthlyForumPost()');
  assert.equal(context.city.forumPosts.length, 2);
});

test('new and loaded city startup delivers the ad without duplicating it', () => {
  const { context, run } = runtime();
  vm.runInContext(source('hud-ticker.js'), context);
  run('startTicker(); startTicker()');
  assert.equal(context.city.forumPosts.filter((post) => post.image === 'UI/news/caacaanteng.webp').length, 1);
});

test('all game languages include the illustration, five simulated neighbours and the requested website', () => {
  for (const language of ['zhHant', 'en', 'ja']) {
    const { run } = runtime(language);
    const post = run('maybeAnnounceCaacaantengAd()');
    assert.equal(post.social.comments.length, 5);
    assert.equal(post.social.commentCount, 5);
    assert.match(post.body.join(' '), /caacaanteng\.com/);
    assert.doesNotMatch(JSON.stringify(post), /forum\.caacaanteng\./);
    assert.equal(run('getForumAdWebsite(city.forumPosts[0])'), 'https://caacaanteng.com/');
    assert.equal(run('getForumAdWebsite({image: "https://example.com/untrusted.webp", url: "javascript:alert(1)"})'), '');
    if (language === 'zhHant') {
      assert.equal(run('t("news.ad.caacaanteng")'), '【香城聯盟】 香城茶餐廳 - 凍飲唔使加三蚊～ 快啲黎試下做茶記老闆啦！');
    }
  }
  for (const name of ['UI/news/caacaanteng.webp', 'UI/news/thumbs/caacaanteng.webp']) {
    assert.ok(fs.existsSync(path.join(ROOT, name)), name);
  }
});

test('both the linked picture and text use the requested website and a separate tab', () => {
  const { context, run } = runtime();
  context.document.createElement = (tagName) => ({ tagName, children: [], appendChild(child) { this.children.push(child); } });
  context.picture = { classList: { add() {} } };
  run('maybeAnnounceCaacaantengAd()');
  const pictureLink = run('createForumAdLink(city.forumPosts[0], picture)');
  const textLink = run('createForumAdLink(city.forumPosts[0])');
  assert.equal(pictureLink.children[0], context.picture);
  assert.equal(textLink.textContent, 'caacaanteng.com');
  for (const link of [pictureLink, textLink]) {
    assert.equal(link.href, 'https://caacaanteng.com/');
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
});

test('ticker selection and clicking the tea cafe advert open the correct site', () => {
  const { context, run } = runtime();
  context.openCaacaantengAd = () => { context.opened = true; };
  vm.runInContext(source('hud-ticker.js'), context);
  run('tickerCycleCount = 3; Math.random = () => 0.9999');
  const headline = run('pickTickerNewsHeadline()');
  assert.equal(headline.id, 'ad-caacaanteng');
  context.headline = headline;
  run('currentTickerHeadline = headline; handleTickerClick()');
  assert.equal(context.opened, true);
});
