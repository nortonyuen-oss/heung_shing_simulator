// The Map Editor left the title menu for 附加功能 (Extras) at the bottom right of the New City
// screen: the generators cover most players, so the editor is a tool you go looking for.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('the title menu has no Map Editor; New City\'s footer has 附加功能 with it', () => {
  const html = source('index.html');
  const menuStart = html.indexOf('<div class="landing-actions">');
  const menu = html.slice(menuStart, html.indexOf('</div>', menuStart));
  assert.ok(menu.includes('id="btn-new-game"'), 'the title menu is the one read');
  assert.doesNotMatch(menu, /btn-terrain-creator|Map Editor/);

  const footer = html.slice(html.indexOf('<footer class="setup-footer">'), html.indexOf('</footer>', html.indexOf('<footer class="setup-footer">')));
  assert.match(footer, /class="setup-extras" data-setup-only="newCity"/, 'only on New City, not inside the editor');
  assert.match(footer, /id="btn-setup-extras"[^>]*aria-haspopup="menu"/);
  assert.match(footer, /data-setup-extra="editor"/);
  assert.ok(footer.indexOf('setup-extras') < footer.indexOf('id="btn-start-city"'), 'beside Found City, at the bottom right');
});

test('附加功能 opens the editor on the same screen, and the editor\'s Back returns to New City', () => {
  const js = source('landing-screen.js');
  assert.match(js, /item\.dataset\.setupExtra === 'editor'\) openSetup\('editor'\)/);
  assert.match(js, /if \(setupMode === 'editor'\) \{ openSetup\('newCity'\); return; \}/);
  assert.doesNotMatch(js, /btn-terrain-creator/);
  assert.match(source('platform-ui.js'), /'#btn-new-game, \[data-setup-extra="editor"\]'/, 'a read-only web store still locks the editor out');
  assert.match(source('mobile-ui.css'), /\[data-ui-profile="touch"\] \.setup-extras \{ display: none; \}/, 'touch keeps the editor hidden');
});

test('附加功能 reads in three languages, and the empty My Maps note points there', () => {
  const i18n = source('i18n.js');
  for (const key of ['landing.extras', 'landing.extras.mapEditor', 'landing.extras.mapEditorHint']) {
    assert.equal(i18n.split(`'${key}':`).length - 1, 3, key);
  }
  assert.doesNotMatch(i18n, /'landing\.terrainCreator':/);
  assert.match(i18n, /'landing\.savedEmpty': '尚未有已儲存地圖。可在右下角「附加功能」→「地圖編輯器」製作/);
});
