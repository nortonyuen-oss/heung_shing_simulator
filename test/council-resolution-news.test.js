'use strict';

// 議案 news and copy (Norton 2026-10-31: 修正所有議案既bug). An in-game sweep of every policy and
// resolution - preview, draft, vote, executive decision, then every outcome's article in three
// languages - found: the airport project's approval news threw (`lead is not defined`: article
// copy pasted into getResolutionCanonicalFacts), two outcomes with no council.outcome.* copy
// (pitch_invasion_chaos, typhoon_cancelled), and index.html's legislative.lawsSection label never
// defined. These keep each of those covered.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

function loadI18N() {
  const context = vm.createContext({
    console,
    document: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: { language: 'en' },
  });
  vm.runInContext(source('i18n.js'), context, { filename: 'i18n.js' });
  return vm.runInContext('I18N', context);
}

function loadCouncilNews(I18N) {
  const context = vm.createContext({
    console,
    language: 'zhHant',
    city: { name: '香城', year: 2026, month: 5, tick: 1, cityRidicule: 12, council: { customNames: {}, resolutionHistory: [] } },
  });
  vm.runInContext(`
    function t(key, params = {}) {
      const template = I18N[language]?.[key] ?? I18N.en[key] ?? key;
      return template.replace(/\\{(\\w+)\\}/g, (_, name) => params[name] ?? '');
    }
    function getCurrentLanguage() { return language; }
    function hashCouncilEffectSeed() { return 0.5; }
  `, context);
  context.I18N = I18N;
  vm.runInContext(source('council-definitions.js'), context, { filename: 'council-definitions.js' });
  vm.runInContext(`const COUNCIL_VOTING_OFFICIAL_IDS = COUNCIL_OFFICIAL_DEFS.filter((o) => o.role === 'councillor').map((o) => o.id);`, context);
  vm.runInContext(source('council-news.js'), context, { filename: 'council-news.js' });
  return context;
}

function possibleOutcomes(definition) {
  const outcomes = new Set(['success']);
  if (!definition.unlockBuildingType) outcomes.add(definition.failureOutcome || 'failure');
  if (definition.programmeType) ['noise_complaints', 'drone_crash', 'drones_wrong_city', 'typhoon_cancelled'].forEach((o) => outcomes.add(o));
  return [...outcomes];
}

test('every resolution outcome has council.outcome copy in all three languages', () => {
  const I18N = loadI18N();
  const context = loadCouncilNews(I18N);
  const defs = vm.runInContext('COUNCIL_RESOLUTION_DEFS', context);
  for (const definition of defs) for (const outcome of possibleOutcomes(definition)) {
    for (const language of ['en', 'zhHant', 'ja']) {
      assert.ok(I18N[language][`council.outcome.${outcome}`], `${language} council.outcome.${outcome} (${definition.id})`);
    }
  }
});

test('every resolution builds its news article for every outcome and language without throwing', () => {
  const context = loadCouncilNews(loadI18N());
  const defs = vm.runInContext('COUNCIL_RESOLUTION_DEFS', context);
  for (const language of ['zhHant', 'en', 'ja']) {
    context.language = language;
    for (const definition of defs) for (const outcome of possibleOutcomes(definition)) {
      context.args = [definition.id, outcome, { refundCost: 1234, showCount: 4, successCount: 2, failureCount: 1, cancelledCount: 1 }];
      const article = vm.runInContext('buildLocalResolutionArticle(buildCouncilResolutionNewsEvent(...args))', context);
      const text = [article.headline, article.subhead, ...article.body, article.quote].join(' ');
      assert.ok(article.headline && article.body.length, `${language} ${definition.id}:${outcome}`);
      assert.doesNotMatch(text, /undefined|NaN|council\.|resolution\./, `${language} ${definition.id}:${outcome}: ${text}`);
    }
  }
  context.language = 'zhHant';
  context.args = ['roseGardenAirportProject', 'success', {}];
  assert.match(vm.runInContext('buildLocalResolutionArticle(buildCouncilResolutionNewsEvent(...args)).headline', context), /新機場正式解鎖/);
  context.args = ['fantasyFingHeungShing', 'typhoon_cancelled', { showCount: 4, cancelledCount: 4 }];
  assert.doesNotMatch(vm.runInContext('buildLocalResolutionArticle(buildCouncilResolutionNewsEvent(...args)).headline', context), /失敗/, 'cancelled is not a failure');
});

test('every data-i18n key in index.html is defined in all three languages', () => {
  const I18N = loadI18N();
  const keys = new Set([...source('index.html').matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size > 100);
  for (const key of keys) for (const language of ['en', 'zhHant', 'ja']) assert.ok(I18N[language][key] !== undefined, `${language} ${key}`);
});
