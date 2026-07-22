const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function source(fileName) {
  return fs.readFileSync(path.join(ROOT, fileName), 'utf8');
}

function loadValue(fileName, expression) {
  const context = vm.createContext({});
  return vm.runInContext(`${source(fileName)}\n;(${expression})`, context, { filename: fileName });
}

test('the four new forum images ship as WebP with thumbnails while PNG stays out of releases', () => {
  const names = ['airportProjectApproved', 'oceanParkMemories', 'stockMarketShock', 'stockMarketShock2'];
  names.forEach((name) => {
    assert.ok(fs.existsSync(path.join(ROOT, 'UI', 'news', `${name}.webp`)), name);
    assert.ok(fs.existsSync(path.join(ROOT, 'UI', 'news', 'thumbs', `${name}.webp`)), `${name} thumbnail`);
  });
  const pkg = JSON.parse(source('package.json'));
  assert.ok(pkg.build.files.includes('UI/news/**/*.webp'));
  assert.ok(pkg.build.files.includes('!UI/news/**/*.png'));
});

test('celebrity and penguin proposals stay hidden until their linked buildings exist', () => {
  const resolutions = loadValue('council-definitions.js', `({
    mena: getCouncilResolutionDefinition('menaConcert'),
    mui: getCouncilResolutionDefinition('muiKinKwokMatch'),
  })`);
  const penguin = loadValue(
    'constants.js',
    "CITY_POLICY_DEFS.find((policy) => policy.id === 'arcticPenguinReserve')",
  );
  assert.deepEqual([...resolutions.mena.requiresBuildingTypes], ['airport', 'indoor_coliseum']);
  assert.deepEqual([...resolutions.mui.requiresBuildingTypes], ['airport', 'football_stadium']);
  assert.deepEqual([...penguin.requiresBuildingTypes], ['ocean_park']);
  assert.equal(resolutions.mena.hideUntilBuildingRequirements, true);
  assert.equal(resolutions.mui.hideUntilBuildingRequirements, true);
  assert.equal(penguin.hideUntilBuildingRequirements, true);

  const voting = source('council-voting.js');
  const ui = source('council-ui.js');
  assert.match(voting, /getCouncilMotionMissingBuilding\(definition\)/);
  assert.match(ui, /hideUntilBuildingRequirements[\s\S]*?getMissingCouncilBuildingRequirement\(definition\)/);
});

test('church and university forum stories require their actual buildings', () => {
  const newspaper = source('newspaper.js');
  assert.match(newspaper, /hasBuildingType\('heritage_church'\)[\s\S]*?fatherWithPrisoner\.webp/);
  assert.match(newspaper, /hasBuildingType\('university'\)[\s\S]*?academicUniversityRank\.webp/);
  assert.match(newspaper, /hasBuildingType\('ocean_park'\)[\s\S]*?oceanParkMemories\.webp/);
});

test('airport approval and every stock crash use their new forum images', () => {
  const councilNews = source('council-news.js');
  assert.match(councilNews, /roseGardenAirportProject:\s*'UI\/news\/airportProjectApproved\.webp'/);
  assert.match(councilNews, /我愛玫瑰園[\s\S]*?新機場正式解鎖/);

  const newspaper = source('newspaper.js');
  const start = newspaper.indexOf('function announceStockMarketCrash(');
  const end = newspaper.indexOf('\n// Fired once by checkSpecialBuildingUnlockNotices', start);
  const posts = [];
  const context = vm.createContext({
    city: { stockMarket: {}, year: 2000, month: 1 },
    HSI_BASE_LEVEL: 20000,
    getCurrentLanguage: () => 'zhHant',
    addForumPost: (article, metadata) => {
      const post = { ...article, ...metadata };
      posts.push(post);
      return post;
    },
  });
  vm.runInContext(newspaper.slice(start, end), context);
  context.crash = {
    openingHsi: 20000,
    closingHsi: 12000,
    severity: 0.4,
    monthsLeft: 4,
    startedYear: 2000,
    startedMonth: 1,
    trigger: 'market',
    newsVariant: 0,
  };
  vm.runInContext('announceStockMarketCrash(crash)', context);
  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map((post) => post.image), [
    'UI/news/stockMarketShock.webp',
    'UI/news/stockMarketShock2.webp',
  ]);
  assert.notEqual(posts[0].id, posts[1].id);
});

test('each typhoon reaching Signal 8 creates one KTV post and one flood post', () => {
  const newspaper = source('newspaper.js');
  const start = newspaper.indexOf('function announceSevereTyphoonForumNews(');
  const end = newspaper.indexOf('\nfunction renderForumHistory(', start);
  const posts = [];
  const context = vm.createContext({
    city: { year: 2001, month: 8 },
    getCurrentLanguage: () => 'zhHant',
    getTyphoonDisplayName: (name) => name,
    getCouncilNewsOfficialDisplayName: () => '陳天文',
    addForumPost: (article, metadata) => {
      const post = { ...article, ...metadata };
      posts.push(post);
      return post;
    },
  });
  vm.runInContext(newspaper.slice(start, end), context);
  vm.runInContext("announceSevereTyphoonForumNews('彩虹', 'signal8', 92)", context);

  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map((post) => post.image), ['UI/news/typhoon.webp', 'UI/news/rainstorm02.webp']);
  posts.forEach((post) => {
    const copy = `${post.headline} ${(post.body || []).join(' ')}`;
    assert.match(copy, /彩虹/);
    assert.match(copy, /陳天文/);
  });

  const weather = source('sim-weather.js');
  assert.match(weather, /firstSevereSignal[\s\S]*?!weather\.signal8ReachedThisStorm/);
  assert.match(weather, /firstSevereSignal && typeof announceSevereTyphoonForumNews/);
});
