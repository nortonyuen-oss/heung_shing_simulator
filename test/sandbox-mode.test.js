// 造景模式 (2026-11-22) and the story's renamed characters.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('造景模式: the new-city switch gives $10 億 to the city and the company and opens everything', () => {
  const html = source('index.html');
  assert.match(html, /<input id="newgame-sandbox" type="checkbox" role="switch" \/>/);
  const landing = source('landing-screen.js');
  assert.match(landing, /sandbox: document\.getElementById\('newgame-sandbox'\)\?\.checked === true,/);
  assert.match(landing, /const SANDBOX_FUNDS = 1000000000;/);
  assert.match(landing, /city\.budget = SANDBOX_FUNDS;/);
  assert.match(landing, /transport\.company\.cash = SANDBOX_FUNDS;/);
  assert.match(landing, /getMetroState\(\)\.unlocked = true;/);
  assert.match(landing, /getLightRailState\(\)\.approved = true;/);
  // the transport company always comes with it
  assert.match(landing, /setExpansionEnabled\('transport', options\.transportExpansion === true \|\| options\.sandbox === true,/);
});

test('造景模式: every building opens (a city-wide limit still holds), the council meets, and no medals', () => {
  assert.match(source('city-state.js'), /if \(city\.sandbox\) \{\s*return rule\.maxCount && getBuildingCount\(type\) >= rule\.maxCount/);
  assert.match(source('city-state.js'), /  sandbox: false,/);
  assert.match(source('city-state.js'), /city\.sandbox = false;/);
  assert.match(source('tools.js'), /if \(city\.sandbox && \(buildingType === 'legislative_council' \|\| buildingType === 'stock_exchange'\)\)/);
  assert.match(source('hud.js'), /hasBuildingType\('legislative_council'\) \|\| !!city\.sandbox;/);
  assert.match(source('medals.js'), /if \(city\.sandbox\) return true;/);
  for (const key of ['landing.sandbox', 'landing.sandboxNote', 'toast.sandboxStarted']) {
    assert.equal(source('i18n.js').match(new RegExp(`'${key.replace('.', '\\.')}':`, 'g'))?.length, 3, `${key} in three languages`);
  }
});

test('the characters Norton renamed (2026-11-22), in three languages', () => {
  const { CAMPAIGN_SPEAKERS } = require('../campaign-chapters.js');
  const names = {
    resident: '如花', tram: '叉燒炳', anchor: '東方升', education: '姐姐', villager: '廈村祥叔', factory: '李彩華',
    worker: '雞泡', reporter: '李雅君', stallOwner: '火雞姐', minibus: '雪雪B', scientist: '達聞西', playboy: '渣男Jason',
    goddess: '女神Claire', footballCommentator: '荷蘭叻', taiOGranny: '大澳貞姨', volunteer: 'Chill 姐', producer: '生抽王',
    singh: 'Singh 哥',
  };
  for (const [id, name] of Object.entries(names)) {
    const speaker = CAMPAIGN_SPEAKERS[id];
    assert.equal(speaker.name.zhHant, name, id);
    assert.ok(speaker.name.en && speaker.name.ja, `${id} in English and Japanese`);
  }
  assert.doesNotMatch(source('campaign-chapters.js'), /T\('曾Sir/);
});
