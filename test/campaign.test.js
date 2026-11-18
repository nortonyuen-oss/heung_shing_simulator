'use strict';

// 《玩轉18區》 campaign (Norton 2026-11-17; docs/campaign-levels-design.md): the chapters, chapter
// 01's tutorial and stars, the month's judging and the player's progress across saves.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const campaign = require('../campaign-chapters.js');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');
const ch01 = campaign.CAMPAIGN_CHAPTER_SPECS.ch01;

// a city that meets every first-star objective of chapter 01
const starOneCity = () => ({
  buildings: { fire_station: 1, power_plant_solar: 1 },
  transit: {},
  powerPlants: 1, powerRatio: 1,
  residentialCount: 40, commercialCount: 8, industrialCount: 6, unemploymentRate: 0.05,
  population: 3000, monthlyNet: 250, loanBalance: 0, happiness: 0.62,
});

test('the 18 chapters, in order, each on a district map the game has; chapter 01 is playable', () => {
  assert.equal(campaign.CAMPAIGN_CHAPTERS.length, 18);
  campaign.CAMPAIGN_CHAPTERS.forEach((chapter, i) => {
    assert.equal(chapter.id, `ch${String(i + 1).padStart(2, '0')}`);
    assert.equal(chapter.number, i + 1);
    ['zhHant', 'en', 'ja'].forEach((lang) => {
      assert.ok(chapter.district[lang] && chapter.title[lang], `${chapter.id} in ${lang}`);
    });
  });
  const maps = source('hk-district-maps.js');
  new Set(campaign.CAMPAIGN_CHAPTERS.map((chapter) => chapter.mapId)).forEach((id) => {
    assert.ok(maps.includes(`{"id":"${id}","centre"`), `${id} is a district map`);
  });
  assert.equal(campaign.CAMPAIGN_CHAPTERS_BY_ID.ch01.title.zhHant, '新任市長上場');
  assert.equal(campaign.CAMPAIGN_CHAPTERS_BY_ID.ch18.title.zhHant, '東方之珠：維多利亞港中心');
  assert.deepEqual(campaign.CAMPAIGN_CHAPTERS.filter((chapter) => campaign.isCampaignChapterPlayable(chapter.id)).map((chapter) => chapter.id), ['ch01']);
});

test('every line of the story and every objective reads in three languages, by a known speaker', () => {
  const prologue = campaign.CAMPAIGN_PROLOGUE;
  const lines = [...prologue.opening, ...prologue.letter, prologue.departure, ...prologue.arrival,
    ...prologue.replies.flatMap((reply) => [{ speaker: 'mayor', text: reply.text }, { speaker: 'queen', text: reply.answer }]),
    { speaker: 'mayor', text: prologue.ask }, ...ch01.intro, ...ch01.outro, ...ch01.failure,
    ...ch01.events.flatMap((event) => event.lines), ...ch01.tutorial];
  lines.forEach((line) => {
    const text = line.card || line.text;
    ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(text[lang], `${JSON.stringify(text.zhHant)} in ${lang}`));
    if (!line.card) assert.ok(campaign.CAMPAIGN_SPEAKERS[line.speaker], `speaker ${line.speaker}`);
  });
  assert.ok(prologue.letter.every((line) => line.speaker === 'queen'), 'Her Majesty reads the letter out');
  assert.equal(prologue.replies.length, 4, 'the four replies of 《你確定唔係詐騙電郵？》');
  ch01.stars.forEach((star) => star.objectives.forEach((objective) => {
    assert.ok(objective.label.zhHant && objective.label.en && objective.label.ja, objective.id);
  }));
  Object.values(campaign.CAMPAIGN_SPEAKERS).forEach((speaker) => {
    if (speaker.portrait) assert.ok(fs.existsSync(path.join(ROOT, speaker.portrait)), speaker.portrait);
  });
});

test('chapter 01 star one: power, R/C/I with jobs, 3,000 people, a surplus with no loans, 50% and a fire station', () => {
  const star = (snapshot) => campaign.evaluateCampaignStar(ch01, 0, snapshot);
  assert.equal(star(starOneCity()).done, true);
  const without = (patch) => star({ ...starOneCity(), ...patch }).done;
  assert.equal(without({ population: 2999 }), false);
  assert.equal(without({ powerRatio: 0.9 }), false, 'every building powered');
  assert.equal(without({ powerPlants: 0 }), false);
  assert.equal(without({ industrialCount: 0 }), false);
  assert.equal(without({ unemploymentRate: 0.15 }), false);
  assert.equal(without({ monthlyNet: 0 }), false);
  assert.equal(without({ loanBalance: 500 }), false, 'a loan is not a surplus');
  assert.equal(without({ happiness: 0.49 }), false);
  assert.equal(without({ buildings: { power_plant_solar: 1 } }), false, 'a fire station');
  const items = star({ ...starOneCity(), population: 2140 }).items;
  assert.equal(items.find((item) => item.id === 'population').progress, '2,140 / 3,000');
  assert.equal(items.find((item) => item.id === 'population').done, false);
});

test('the month\'s turn: stars come in order, star one has 12 months, the mid-chapter event fires once', () => {
  const run = campaign.createCampaignRun('ch01', 100, { roadTiles: 0, powerLines: 0 });
  assert.equal(run.deadlineMonthIndex, 112);
  let result = campaign.advanceCampaignRun(run, ch01, { population: 1600, demandR: 0.7 }, 105);
  assert.deepEqual(result.events.map((event) => event.id), ['landRush']);
  result = campaign.advanceCampaignRun(run, ch01, { population: 1600, demandR: 0.7 }, 106);
  assert.deepEqual(result.events, [], 'once');
  assert.equal(campaign.getCampaignMonthsLeft(run, 110), 2);

  // star two is met too, but only after star one; star three is not
  const big = { ...starOneCity(), population: 12000, unemploymentRate: 0.05, transit: { bus: 300 },
    buildings: { fire_station: 1, power_plant_solar: 1, police_station: 1, hospital: 1, park_small: 2 } };
  result = campaign.advanceCampaignRun(run, ch01, big, 112);
  assert.deepEqual(result.newStars, [1, 2], 'met on the deadline month counts');
  assert.equal(run.stars, 2);
  assert.equal(run.failed, false);
  assert.equal(campaign.getCampaignMonthsLeft(run, 120), null, 'no limit after star one');

  const late = campaign.createCampaignRun('ch01', 100);
  result = campaign.advanceCampaignRun(late, ch01, { population: 10 }, 111);
  assert.equal(result.failedNow, false);
  result = campaign.advanceCampaignRun(late, ch01, { population: 10 }, 112);
  assert.equal(result.failedNow, true, 'twelve months without star one');
  result = campaign.advanceCampaignRun(late, ch01, starOneCity(), 113);
  assert.deepEqual(result.newStars, [], 'a failed run waits for the player\'s choice');
  late.freePlay = true;
  assert.deepEqual(campaign.advanceCampaignRun(late, ch01, starOneCity(), 114).newStars, [], 'free building earns no stars');
});

test('教學: each step is done by doing it, from where the city stood; the budget step waits for 明白; it can be skipped', () => {
  const run = campaign.createCampaignRun('ch01', 0, { roadTiles: 12, powerLines: 3 });
  assert.deepEqual(run.tutorial.base, { roadTiles: 12, powerLines: 3 });
  assert.equal(campaign.getCampaignTutorialStep(run, ch01).id, 'road');
  let result = campaign.advanceCampaignTutorial(run, ch01, { roadTiles: 16 });
  assert.deepEqual(result.completed, [], 'roads already there do not count');
  result = campaign.advanceCampaignTutorial(run, ch01, { roadTiles: 17, powerPlants: 1, powerLines: 3 });
  assert.deepEqual(result.completed, ['road', 'plant']);
  result = campaign.advanceCampaignTutorial(run, ch01, { roadTiles: 17, powerPlants: 1, powerLines: 4,
    zoneTiles: { res: 6, com: 2, ind: 2 }, buildings: { fire_station: 1 } });
  assert.deepEqual(result.completed, ['lines', 'homes', 'jobs', 'fire']);
  assert.equal(campaign.getCampaignTutorialStep(run, ch01).id, 'budget');
  assert.equal(result.finished, false, 'the last step is read, not built');
  assert.equal(campaign.acknowledgeCampaignTutorialStep(run, ch01), true);
  assert.equal(run.tutorial.done, true);
  assert.equal(campaign.getCampaignTutorialStep(run, ch01), null);

  const skipper = campaign.createCampaignRun('ch01', 0);
  campaign.skipCampaignTutorial(skipper);
  assert.equal(campaign.getCampaignTutorialStep(skipper, ch01), null);
  ch01.tutorial.forEach((step) => assert.ok(step.highlight.length, `${step.id} lights the guide`));
  const html = source('index.html');
  ch01.tutorial.flatMap((step) => step.highlight).forEach((selector) => {
    const attr = selector.match(/^\[(data-tool(?:-category)?)="([a-z-]+)"\]$/);
    if (attr) assert.ok(html.includes(`${attr[1]}="${attr[2]}"`), `${selector} is on the page`);
    else assert.ok(html.includes(`id="${selector.slice(1)}"`), `${selector} is on the page`);
  });
});

test('a stored run is cleaned; the player\'s best stars only go up; chapters open in order', () => {
  assert.equal(campaign.normalizeCampaignRun(null), null);
  assert.equal(campaign.normalizeCampaignRun({ chapterId: 'ch99' }), null);
  const run = campaign.normalizeCampaignRun({ chapterId: 'ch01', startMonthIndex: 50, stars: 9, eventsShown: { landRush: true, 'bad id!': true },
    tutorial: { step: 3, base: { roadTiles: 4 } } });
  assert.equal(run.stars, 3);
  assert.equal(run.deadlineMonthIndex, 62);
  assert.deepEqual(Object.keys(run.eventsShown), ['landRush']);
  assert.equal(run.tutorial.step, 3);

  const profile = campaign.createEmptyCampaignProfile();
  assert.equal(campaign.isCampaignChapterUnlocked(profile, 'ch01'), true);
  assert.equal(campaign.isCampaignChapterUnlocked(profile, 'ch02'), false);
  const won = { chapterId: 'ch01', stars: 1, startMonthIndex: 100, starMonthIndex: { 1: 117 } };
  assert.equal(campaign.recordCampaignStars(profile, won, { at: '2026-11-17', city: '北區' }), true);
  assert.equal(profile.chapters.ch01.monthsToFirstStar, 17);
  assert.equal(campaign.isCampaignChapterUnlocked(profile, 'ch02'), true);
  assert.equal(campaign.recordCampaignStars(profile, { ...won, stars: 1 }, { at: 'later' }), false, 'no lower or equal overwrite');
  assert.equal(campaign.recordCampaignStars(profile, { ...won, stars: 3, starMonthIndex: { 1: 140 } }, { at: 'later', city: 'B' }), true);
  assert.deepEqual(profile.chapters.ch01, { stars: 3, firstStarAt: '2026-11-17', city: '北區', monthsToFirstStar: 17 });
  const cleaned = campaign.normalizeCampaignProfile({ prologueSeen: 1, chapters: { ch01: { stars: 7 }, ch02: { stars: 0 }, zz: { stars: 1 } } });
  assert.deepEqual(Object.keys(cleaned.chapters), ['ch01']);
  assert.equal(cleaned.chapters.ch01.stars, 3);
  assert.equal(cleaned.prologueSeen, true);
});

function loadRuntime({ stored = null } = {}) {
  const requests = [];
  const timers = [];
  const clock = {};
  const context = vm.createContext({
    console: { warn() {}, error() {}, info() {}, log() {} },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
    Promise, JSON, Object, Array, Number, String, Math, Set, Date, Error,
    onGameClockEvent: (name, fn) => { clock[name] = fn; },
    HeungShingStorage: {
      request: async (url, options = {}) => {
        requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
        if ((options.method || 'GET') === 'GET') return { ok: true, json: async () => ({ data: stored }) };
        return { ok: true, json: async () => ({ ok: true }) };
      },
    },
    // what buildCampaignSnapshot reads from the city itself (the rest comes from the medal snapshot)
    city: { name: '北區', year: 1900, month: 5, campaign: null, residentialCount: 40, powerRatio: 1,
      monthlyIncome: 1000, monthlyExpenses: 750, loans: [], trafficIndex: 0.2, demandR: 0.1 },
    getCityMonthIndex: () => context.monthIndex,
    monthIndex: 110,
    snapshot: starOneCity(),
    collectMedalSnapshot: () => ({ ...context.snapshot }),
    toasts: [],
    showToast(message, type) { context.toasts.push({ message, type }); },
    posts: [],
    addForumPost(article, meta) { context.posts.push({ article, meta }); },
    getCurrentLanguage: () => 'zhHant',
  });
  context.globalThis = context;
  vm.runInContext(source('campaign-chapters.js'), context);
  vm.runInContext(source('campaign.js'), context);
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };
  return { context, requests, clock, timers, flush };
}

test('runtime: a run on the city earns its star at the month\'s turn and the player\'s profile keeps it', async () => {
  const { context, requests, clock, timers, flush } = loadRuntime({ stored: { prologueSeen: true, chapters: {} } });
  await flush();
  assert.equal(requests[0].url, '/api/player-profile/campaign');
  context.city.campaign = vm.runInContext("createCampaignRun('ch01', 100)", context);
  clock['gameclock:month']();
  assert.equal(context.city.campaign.stars, 1);
  assert.equal(context.getCampaignProfile().chapters.ch01.stars, 1);
  assert.ok(context.toasts.some((toast) => toast.message.includes('一星')), 'a star toast');
  assert.ok(context.toasts.some((toast) => toast.message.includes('第 2 章')), 'the next chapter unlocked');
  assert.equal(context.posts[0]?.meta.id, 'campaign-ch01-star1', 'the government news and the forum\'s jokes');
  timers.splice(0).forEach((fn) => fn());
  await flush();
  const put = requests.find((request) => request.method === 'PUT');
  assert.equal(put.url, '/api/player-profile/campaign');
  assert.equal(put.body.data.chapters.ch01.stars, 1);
  assert.equal(put.body.data.prologueSeen, true, 'what was stored is kept');

  context.city.campaign = null;
  clock['gameclock:month']();
  assert.equal(context.toasts.filter((toast) => toast.message.includes('一星')).length, 1, 'a city that is no run is not judged');
});

test('序幕: Her Majesty reads the letter out over the desk picture, the player answers, she replies', () => {
  const { context } = loadRuntime();
  const scene = context.getCampaignPrologueScene();
  assert.ok(scene[0].card, 'it opens on a title card');
  assert.equal(scene.filter((line) => line.speaker === 'queen').length, campaign.CAMPAIGN_PROLOGUE.letter.length);
  const ask = scene.find((line) => Array.isArray(line.choices));
  assert.equal(ask.speaker, 'mayor');
  assert.equal(ask.choices.length, 4);
  ask.choices.forEach((choice) => assert.equal(choice.lines.map((line) => line.speaker).join(','), 'mayor,queen'));
  assert.ok(scene[scene.length - 1].card, 'and sets off for North District');
  assert.ok(fs.existsSync(path.join(ROOT, campaign.CAMPAIGN_PROLOGUE.backdrop)), 'the desk picture ships (WebP, as UI/news packs)');
  assert.match(campaign.CAMPAIGN_PROLOGUE.backdrop, /\.webp$/);
});

test('wiring: scripts, the title-screen button, the menu, the city\'s field, loading and the server', () => {
  const html = source('index.html');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  const at = (name) => scripts.indexOf(name);
  assert.ok(at('medals.js') > 0);
  assert.equal(at('campaign-chapters.js'), at('medals.js') + 1, 'after medals: the month\'s surplus streak is counted first');
  assert.equal(at('campaign.js'), at('campaign-chapters.js') + 1);
  assert.ok(at('campaign.js') < at('landing-screen.js') || at('landing-screen.js') > 0);
  assert.match(html, /<button id="btn-campaign" class="landing-btn primary" data-i18n-html="landing\.campaign">/);
  assert.match(html, /data-menu-action="open-campaign" data-i18n="menu\.campaign"/);
  assert.match(source('topbar.js'), /case 'open-campaign':\s+if \(typeof openCampaignSelect === 'function'\) openCampaignSelect\(\);/);
  const i18n = source('i18n.js');
  ['landing.campaign', 'menu.campaign'].forEach((key) => {
    assert.equal(i18n.match(new RegExp(`'${key.replace('.', '\\.')}'`, 'g'))?.length, 3, `${key} in en, zh, ja`);
  });
  assert.equal(source('city-state.js').match(/campaign: null,|city\.campaign = null;/g)?.length, 2, 'new city and reset');
  assert.match(source('save.js'), /if \(typeof onCampaignCityLoaded === 'function'\) onCampaignCityLoaded\(\);/);
  const server = source('server.js');
  assert.match(server, /app\.post\('\/api\/dev\/campaign-start\/:chapter'/);
  assert.match(server, /if \(!options\.allowDevExports\) return res\.status\(404\)[\s\S]{0,400}campaign-start|campaign-start[\s\S]{0,200}if \(!options\.allowDevExports\)/);
  assert.match(source('campaign.js'), /format: CAMPAIGN_START_FILE_FORMAT/);
});
