const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function loadPlacer(innerHeight) {
  const source = fs.readFileSync(path.join(ROOT, 'tool-menu.js'), 'utf8');
  const start = source.indexOf('function placePopupBesideTrigger(');
  const end = source.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0, 'placePopupBesideTrigger exists');
  const context = vm.createContext({ window: { innerHeight } });
  vm.runInContext(source.slice(start, end), context);
  return context.placePopupBesideTrigger;
}

function popup(height) {
  return { style: {}, getBoundingClientRect: () => ({ height }) };
}

test('a picker opened low on a short window moves up so its last item (維園) shows', () => {
  const place = loadPlacer(700);
  const picker = popup(360);
  place(picker, { top: 560, right: 450 });
  assert.equal(picker.style.top, `${700 - 360 - 8}px`);
  assert.equal(picker.style.left, '458px');
  assert.equal(picker.style.overflowY, '');
});

test('a picker with room stays level with its button', () => {
  const place = loadPlacer(1000);
  const picker = popup(360);
  place(picker, { top: 200, right: 450 });
  assert.equal(picker.style.top, '200px');
});

test('a picker taller than the window scrolls instead of running off it', () => {
  const place = loadPlacer(400);
  const picker = popup(600);
  place(picker, { top: 300, right: 450 });
  assert.equal(picker.style.top, '8px');
  assert.equal(picker.style.maxHeight, `${400 - 16}px`);
  assert.equal(picker.style.overflowY, 'auto');
});

test('every picker beside the tool menu is placed by the shared helper', () => {
  const source = fs.readFileSync(path.join(ROOT, 'tool-menu.js'), 'utf8');
  assert.doesNotMatch(source, /\.style\.top = `\$\{(triggerBounds|bounds)\.top\}px`/, 'no popup is pinned to its button top unclamped');
  assert.equal(source.match(/placePopupBesideTrigger\((picker|densityMenu),/g).length, 4);
});
