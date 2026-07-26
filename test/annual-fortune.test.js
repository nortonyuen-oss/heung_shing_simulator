const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function extractFunction(fileName, functionName) {
  const text = source(fileName);
  const start = text.indexOf(`function ${functionName}(`);
  assert.ok(start >= 0, `${functionName} must exist in ${fileName}`);
  const parameterStart = text.indexOf('(', start);
  let parameterDepth = 0;
  let parameterEnd = -1;
  for (let index = parameterStart; index < text.length; index++) {
    if (text[index] === '(') parameterDepth++;
    else if (text[index] === ')') {
      parameterDepth--;
      if (parameterDepth === 0) {
        parameterEnd = index;
        break;
      }
    }
  }
  const braceStart = text.indexOf('{', parameterEnd);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = braceStart; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth++;
    else if (character === '}') {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to extract ${functionName}`);
}

test('annual fortune database contains 18 original, structurally complete fortunes', () => {
  const database = JSON.parse(source('docs/content/annual-fortunes.json'));
  assert.equal(database.metadata.fortuneCount, 18);
  assert.equal(database.metadata.status, 'wired-runtime-source');
  assert.match(database.metadata.originality, /原創/);
  assert.deepEqual(
    Object.fromEntries(['upper', 'middle', 'lower'].map((grade) => [
      grade,
      database.fortunes.filter((fortune) => fortune.grade === grade).length,
    ])),
    { upper: 6, middle: 6, lower: 6 },
  );
  const responseTexts = [];
  database.fortunes.forEach((fortune) => {
    assert.match(fortune.id, /^heung-shing-\d{2}$/);
    assert.equal(fortune.poem.length, 4);
    fortune.poem.forEach((line) => assert.equal(Array.from(line).length, 7, `${fortune.id}: ${line}`));
    assert.equal(fortune.forumResponses.length, 3);
    fortune.forumResponses.forEach((response) => responseTexts.push(response.textZh));
    assert.ok(fortune.governmentInterpretation.textZh);
    assert.ok(fortune.templeKeeperInterpretation.textZh);
  });
  assert.equal(new Set(responseTexts).size, 54);
  assert.doesNotMatch(JSON.stringify(database), /ctc\.org|sourceUrl|現實籤文原文/i);
});

test('runtime fortune data stays in parity with its content source', () => {
  const context = vm.createContext({});
  vm.runInContext(source('annual-fortunes-data.js'), context);
  const runtime = vm.runInContext('ANNUAL_FORTUNE_DATABASE', context);
  const database = JSON.parse(source('docs/content/annual-fortunes.json'));
  assert.equal(runtime.metadata.contentVersion, database.metadata.contentVersion);
  assert.deepEqual(
    [...runtime.fortunes].map((fortune) => fortune.id),
    database.fortunes.map((fortune) => fortune.id),
  );
});

test('fortune weights correlate with economy, stock crash and epidemic stress', () => {
  const context = vm.createContext({});
  vm.runInContext(extractFunction('newspaper.js', 'getAnnualFortuneWeights'), context);
  const neutral = vm.runInContext('getAnnualFortuneWeights({ economyIndex: 50 })', context);
  const healthy = vm.runInContext('getAnnualFortuneWeights({ economyIndex: 80 })', context);
  const stressed = vm.runInContext(
    'getAnnualFortuneWeights({ economyIndex: 10, stockCrashActive: true, epidemicSeverity: 0.8 })',
    context,
  );
  assert.equal(neutral.upper, 0.36);
  assert.equal(neutral.lower, 0.18);
  assert.ok(healthy.upper > neutral.upper);
  assert.ok(healthy.lower < neutral.lower);
  assert.ok(stressed.upper < neutral.upper);
  assert.ok(stressed.lower > neutral.lower);
  assert.ok(Math.abs(stressed.upper + stressed.middle + stressed.lower - 1) < 1e-12);
  assert.ok(stressed.lower <= 0.30);
});

test('annual draw requires a temple, runs once in January and never opens an extra', () => {
  const posts = [];
  const ticker = [];
  const effects = [];
  let hasTemple = true;
  let popupCount = 0;
  const context = vm.createContext({
    city: {
      name: '香城',
      year: 2028,
      month: 2,
      epidemicSeverity: 0.7,
      stockMarket: { crash: { active: true } },
      council: {
        customNames: { culture_head: '文署長' },
        annualFortuneState: { lastDrawYear: -1, recentFortuneIds: [], history: [] },
      },
      lastForumMonthIndex: -1,
    },
    normalizeCityFinanceState: () => {},
    getCityMonthIndex: () => 24336,
    hasBuildingType: (type) => hasTemple && type === 'heritage_temple',
    getCityEconomyIndex: () => 10,
    hashCouncilEffectSeed: (seed) => seed.endsWith(':grade') ? 0.99 : 0.2,
    getCouncilOfficialDefinition: (id) => ({ id, nameKey: id }),
    getCouncilOfficialDisplayName: (definition) => (
      context.city.council.customNames[definition.id] || definition.id
    ),
    addCouncilTemporaryEffect: (...args) => effects.push(args),
    addCityNews: (headline) => ticker.push(headline),
    addForumPost: (article, metadata) => {
      const post = { ...article, ...metadata };
      posts.push(post);
      return post;
    },
    showResolutionNewspaper: () => { popupCount++; },
  });
  vm.runInContext(source('annual-fortunes-data.js'), context);
  vm.runInContext([
    extractFunction('newspaper.js', 'getAnnualFortuneWeights'),
    extractFunction('newspaper.js', 'selectAnnualFortune'),
    extractFunction('newspaper.js', 'getAnnualFortuneOfficialName'),
    extractFunction('newspaper.js', 'maybeAnnounceAnnualCityFortune'),
  ].join('\n'), context);

  assert.equal(vm.runInContext('maybeAnnounceAnnualCityFortune()', context), null);
  context.city.month = 1;
  hasTemple = false;
  assert.equal(vm.runInContext('maybeAnnounceAnnualCityFortune()', context), null);
  hasTemple = true;
  const post = vm.runInContext('maybeAnnounceAnnualCityFortune()', context);
  assert.equal(post.id, 'annual-fortune-2028');
  assert.equal(post.image, 'UI/news/lunarYearBadLuck.webp');
  assert.match(post.headline, /文署長/);
  assert.equal(post.social.comments.length, 3);
  assert.equal(ticker.length, 1);
  assert.equal(effects.length, 1);
  assert.equal(effects[0][2].tourism, 3);
  assert.equal(context.city.council.annualFortuneState.history.length, 1);
  assert.equal(context.city.council.annualFortuneState.recentFortuneIds.length, 1);
  assert.equal(vm.runInContext('maybeAnnounceAnnualCityFortune()', context), null);
  assert.equal(posts.length, 1);
  assert.equal(popupCount, 0);
});

test('old saves receive additive annual fortune state without a format bump', () => {
  const context = vm.createContext({
    COUNCIL_SCHEMA_VERSION: 2,
    CITY_POLICY_DEFS: [],
    COUNCIL_OFFICIAL_IDS: [],
    COUNCIL_INITIAL_RELATIONSHIPS: {},
    COUNCIL_SPECIAL_EVENT_DEFS: [],
    COUNCIL_RESOLUTION_IDS: [],
  });
  vm.runInContext(source('council-state.js'), context);
  const normalized = vm.runInContext('normalizeCouncilState({}, {})', context);
  assert.equal(normalized.annualFortuneState.lastDrawYear, -1);
  assert.deepEqual([...normalized.annualFortuneState.recentFortuneIds], []);
  assert.deepEqual([...normalized.annualFortuneState.history], []);
});

test('three annual fortune images and thumbnails are release-ready WebP assets', async () => {
  const names = ['lunarYearGoodLuck', 'lunarYearMediumLuck', 'lunarYearBadLuck'];
  for (const name of names) {
    const fullPath = path.join(ROOT, 'UI', 'news', `${name}.webp`);
    const thumbnailPath = path.join(ROOT, 'UI', 'news', 'thumbs', `${name}.webp`);
    assert.ok(fs.existsSync(fullPath), name);
    assert.ok(fs.existsSync(thumbnailPath), `${name} thumbnail`);
    const full = await sharp(fullPath).metadata();
    const thumbnail = await sharp(thumbnailPath).metadata();
    assert.deepEqual([full.width, full.height], [960, 720]);
    assert.deepEqual([thumbnail.width, thumbnail.height], [180, 125]);
  }
  const pkg = JSON.parse(source('package.json'));
  assert.ok(pkg.build.files.includes('UI/news/**/*.webp'));
  assert.ok(pkg.build.files.includes('!UI/news/**/*.png'));
});

test('annual fortune runs before generic monthly forum generation', () => {
  const effects = source('council-effects.js');
  const annualIndex = effects.indexOf('maybeAnnounceAnnualCityFortune(monthIndex)');
  const genericIndex = effects.indexOf('generateMonthlyForumPost(monthIndex)', annualIndex);
  assert.ok(annualIndex >= 0 && genericIndex > annualIndex);
  const annualFunction = extractFunction('newspaper.js', 'maybeAnnounceAnnualCityFortune');
  assert.doesNotMatch(annualFunction, /showResolutionNewspaper|showNewspaperExtra|showDialog/);
});
