'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');
const stories = require('../lovers-stories');
const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const beforeEnding = stories.LOVERS_STORY_DEFS.filter((def) => !def.ending);
const all = (overrides = {}) => ({
  buildings: ['ocean_park', 'cultural_center', 'park_small', 'murray_house', 'seafood_restaurant', 'gold_coast_hotel'],
  population: 20000, commercialCount: 20, cityAttractiveness: 70, pollution: 15,
  promenadeTiles: 8, ferryRiders: 100, metroRiders: 200, month: 9,
  weather: { condition: 'clear', temperatureC: 26, rainfallMm: 0, windKph: 10, rainWarning: 'none', typhoonActive: false, typhoonStage: 'none' },
  ...overrides,
});
const seenAll = () => ({ seen: Object.fromEntries(beforeEnding.map((def, i) => [def.id, 100 + i])) });
const ids = (snapshot, state = { seen: {} }) => stories.getEligibleLoversStories(snapshot, state).map((def) => def.id);

test('ten distinct everyday scenes precede the farewell; duplicate Peak crops are one story', async () => {
  assert.equal(stories.LOVERS_STORY_DEFS.length, 11);
  assert.equal(beforeEnding.length, 10);
  assert.equal(new Set(stories.LOVERS_STORY_DEFS.map((def) => def.id)).size, 11);
  assert.equal(stories.LOVERS_STORY_DEFS.filter((def) => def.id === 'peak').length, 1);
  for (const def of stories.LOVERS_STORY_DEFS) {
    for (const lang of ['zhHant', 'en', 'ja']) for (const field of ['headline', 'body', 'comment']) assert(def[field][lang], `${def.id}/${lang}/${field}`);
    const full = await sharp(path.join(ROOT, def.image)).metadata();
    const thumb = await sharp(path.join(ROOT, 'UI/news/thumbs', path.basename(def.image))).metadata();
    assert.equal(full.format, 'webp'); assert(full.width <= 1280);
    assert.equal(thumb.format, 'webp'); assert.equal(thumb.width, 180); assert.equal(thumb.height, 125);
  }
});

test('scenes require existing facilities and can all occur in one city, without exclusive district gates', () => {
  assert.deepEqual(ids(all({ buildings: [], population: 0, commercialCount: 0, promenadeTiles: 0, ferryRiders: 0, metroRiders: 0 })), []);
  assert.deepEqual(ids(all()).sort(), beforeEnding.map((def) => def.id).sort());
  assert(!ids(all({ buildings: ['cultural_center'] })).includes('ocean-park'));
  assert(!ids(all({ buildings: ['seafood_restaurant'] })).includes('crab-dinner'));
  assert(!ids(all({ buildings: ['seafood_restaurant'] })).includes('stanley'));
  assert(!ids(all({ commercialCount: 9 })).includes('cinema'));
  assert(!ids(all({ cityAttractiveness: 59 })).includes('peak'));
  assert(!ids(all({ promenadeTiles: 5 })).includes('birthday'));
  assert(!ids(all({ ferryRiders: 0 })).includes('sai-kung'));
});

test('swimming needs a warm fair-weather summer; starry views need clear skies', () => {
  assert(ids(all()).includes('beach'));
  assert(!ids(all({ month: 1 })).includes('beach'));
  assert(!ids(all({ ferryRiders: 0 })).includes('beach'));
  for (const change of [{ condition: 'showers' }, { condition: 'fog' }, { temperatureC: 23 }, { temperatureC: 34 }, { windKph: 32 }]) {
    assert(!ids(all({ weather: { ...all().weather, ...change } })).includes('beach'), JSON.stringify(change));
  }
  assert(!ids(all({ month: 5 })).includes('gold-coast'));
  assert(!ids(all({ pollution: 45 })).includes('peak'));
  assert(!ids(all({ weather: { ...all().weather, condition: 'cloudy' } })).includes('gold-coast'));
  const rainy = ids(all({ weather: { ...all().weather, condition: 'showers', rainfallMm: 10 } }));
  assert(rainy.includes('gallery') && rainy.includes('cinema') && rainy.includes('crab-dinner'));
  assert(!rainy.includes('birthday') && !rainy.includes('stanley'));
  for (const change of [{ typhoonActive: true }, { typhoonStage: 'signal8' }, { rainWarning: 'red' }, { rainWarning: 'black' }]) {
    assert.deepEqual(ids(all({ weather: { ...all().weather, ...change } })), []);
  }
});

test('farewell stays locked if even one of the ten stories has not actually been recorded', () => {
  const state = seenAll();
  assert.deepEqual(ids(all(), state), ['farewell']);
  assert.deepEqual(ids(all({ metroRiders: 0 }), state), []);
  for (const def of beforeEnding) {
    const missing = seenAll(); delete missing.seen[def.id];
    assert(!ids(all(), missing).includes('farewell'), `missing ${def.id}`);
  }
  assert(!ids(all()).includes('farewell'), 'eligible scenes are not the same as published scenes');
  state.seen.farewell = 120;
  assert.deepEqual(ids(all(), state), [], 'the ending closes the entire diary');
});

test('completion requires all ten earlier publications and a valid final farewell date', () => {
  const state = seenAll();
  assert.equal(stories.isLoversStoryComplete(state), false);
  state.seen.farewell = 120;
  assert.equal(stories.isLoversStoryComplete(state), true);
  for (const def of beforeEnding) {
    const missing = JSON.parse(JSON.stringify(state)); delete missing.seen[def.id];
    assert.equal(stories.isLoversStoryComplete(missing), false, `missing ${def.id}`);
  }
  assert.equal(stories.isLoversStoryComplete({ seen: { farewell: 120 } }), false);
  assert.equal(stories.isLoversStoryComplete({ seen: { ...state.seen, farewell: 105 } }), false, 'farewell cannot precede another story');
  assert.equal(stories.isLoversStoryComplete({ seen: { ...state.seen, farewell: '120' } }), false);
  assert.equal(stories.isLoversStoryComplete(null), false);
});

test('random selection has a real quiet-month chance and a three-month gap; selection alone never records delivery', () => {
  const state = { seen: { gallery: 100 } };
  const original = JSON.stringify(state);
  assert.equal(stories.pickLoversStory(all(), state, 103, () => 0.9), null);
  assert.equal(stories.pickLoversStory(all(), state, 102, () => { throw Error('cooldown should not roll'); }), null);
  const selected = stories.pickLoversStory(all(), state, 103, () => 0);
  assert(selected && selected.id !== 'gallery' && selected.id !== 'farewell');
  assert.equal(JSON.stringify(state), original);
  assert.equal(stories.pickLoversStory(all(), state, -1, () => 0), null);
});

test('state sanitization migrates existing Ocean Park posts and ignores forged keys and invalid dates', () => {
  const state = stories.normalizeLoversStoryState({ seen: { gallery: 50, unknown: 60, peak: -1, cinema: '70', birthday: Infinity } }, [
    { image: 'UI/news/oceanParkMemories.webp', year: 2000, month: 8 },
  ]);
  assert.deepEqual(state.seen, { 'ocean-park': 24007, gallery: 50 });
  const saved = stories.normalizeLoversStoryState(JSON.parse(JSON.stringify(state)), []);
  assert.deepEqual(saved, state, 'history pruning and JSON reload cannot reset the diary');
});

function runtime(language = 'zhHant', rawCity) {
  const ctx = vm.createContext({
    console, language,
    city: rawCity || { name: '測試城', year: 2000, month: 9, population: 20000, commercialCount: 20, cityAttractiveness: 70, pollution: 15,
      happiness: 0.6, monthlyIncome: 100, monthlyExpenses: 50, activePolicies: {}, council: { customNames: {} },
      weather: all().weather, promenade: { tiles: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`1:${i}`, 0])) }, forumPosts: [], lastForumMonthIndex: -1 },
    hasBuildingType: (type) => all().buildings.includes(type),
    getCurrentLanguage: () => language,
    getCouncilNewsOfficialDisplayName: () => '測試官員', getDefaultCityName: () => '香城', tMonth: String,
    getTransportExpansionState: () => ({ lastModeTotals: { ferry: 100, metro: 200 } }),
    normalizeForumImagePath: (value) => value,
    getCityMonthIndex: (year = ctx.city.year, month = ctx.city.month) => year * 12 + month - 1,
    queueCityChangeAutosave: () => { ctx.autosaves = (ctx.autosaves || 0) + 1; },
  });
  vm.runInContext(source('lovers-stories.js'), ctx);
  vm.runInContext(source('newspaper.js'), ctx);
  vm.runInContext('maybeAnnounceCaacaantengAd = () => null; Math.random = () => 0;', ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const advance = () => { const index = run('getCityMonthIndex()') + 1; ctx.city.year = Math.floor(index / 12); ctx.city.month = index % 12 + 1; };
  return { ctx, run, advance };
}

test('monthly delivery publishes each story once, saves every delivery and ends only after all ten', () => {
  const { ctx, run, advance } = runtime();
  const delivered = [];
  for (let i = 0; i < 150; i++) {
    const post = run('generateMonthlyForumPost()');
    if (post?.id.startsWith('lovers-')) {
      const id = post.id.slice(7);
      assert(!delivered.includes(id), id);
      if (id === 'farewell') assert.equal(delivered.length, 10);
      delivered.push(id);
      assert.equal(post.body.length, 1, 'no unrelated official joke is appended');
      assert(post.image && post.social.comments.length === 2);
      assert.equal(post.officialId, '');
      if (id === 'farewell') assert.equal(post.social.laughs, '0');
      if (delivered.length > 1) {
        const dates = Object.values(ctx.city.loversStories.seen).sort((a, b) => a - b);
        assert(dates[dates.length - 1] - dates[dates.length - 2] >= 3);
      }
    }
    // Even after old forum rows are gone, city-level stamps remain.
    if (i % 7 === 0) ctx.city.forumPosts = [];
    if (i === 25) ctx.city = JSON.parse(JSON.stringify(ctx.city));
    advance();
  }
  assert.equal(delivered.length, 11);
  assert.equal(delivered.at(-1), 'farewell');
  assert.equal(Object.keys(ctx.city.loversStories.seen).length, 11);
  assert(ctx.autosaves >= 11);
});

test('failed publication does not consume a scene or its cooldown', () => {
  const { ctx, run, advance } = runtime();
  run('addForumPost = () => null');
  run('generateMonthlyForumPost()');
  assert.equal(Object.keys(ctx.city.loversStories.seen).length, 0);
  advance();
  assert(run('buildLoversForumTopic(getCityMonthIndex(), "zhHant")'));
});

test('all three languages retain their own story text, including the farewell', () => {
  for (const language of ['zhHant', 'en', 'ja']) {
    const { ctx, run } = runtime(language);
    ctx.city.loversStories = seenAll();
    const post = run('generateMonthlyForumPost()');
    assert.equal(post.id, 'lovers-farewell');
    assert.equal(post.headline, stories.LOVERS_STORY_DEFS.at(-1).headline[language]);
    assert.equal(post.body[0], stories.LOVERS_STORY_DEFS.at(-1).body[language]);
    assert.equal(post.social.laughs, '0');
  }
});

test('new cities reset the diary; saved progress is normalized before selection; original boards stay out of runtime packages', () => {
  const city = source('city-state.js');
  assert.match(city, /loversStories: \{ seen: \{\} \}/);
  assert.match(city, /city\.loversStories = \{ seen: \{\} \};/);
  assert.match(city, /city\.loversStories = normalizeLoversStoryState\(city\.loversStories, city\.forumPosts\)/);
  const scripts = [...source('index.html').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert(scripts.indexOf('lovers-stories.js') < scripts.indexOf('city-state.js'));
  assert(JSON.parse(source('package.json')).build.files.includes('!UI/storyBoardGraphics/**'));
  assert.match(source('scripts/build-web.js'), /logical\.startsWith\('UI\/storyBoardGraphics\/'\)/);
});
