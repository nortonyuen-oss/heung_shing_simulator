const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');

function sliceFunction(name) {
  const start = mainSource.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable from main.js`);
  return mainSource.slice(start, mainSource.indexOf('\n}\n', start) + 3);
}

// A minimal Phaser-style loader: on/once/off/emit, the way LoaderPlugin drives its listeners.
function createLoader() {
  const listeners = { progress: [], complete: [] };
  return {
    on(event, fn) { listeners[event].push({ fn, once: false }); },
    once(event, fn) { listeners[event].push({ fn, once: true }); },
    off(event, fn) { listeners[event] = listeners[event].filter((l) => l.fn !== fn); },
    emit(event, ...args) {
      const current = listeners[event].slice();
      listeners[event] = listeners[event].filter((l) => !l.once);
      current.forEach((l) => l.fn(...args));
    },
    count: (event) => listeners[event].length,
  };
}

// The same loader later runs single-file passes on demand (zone textures, building night
// bakes, vehicle bundles...) and Phaser emits progress 0 at the start of every pass, so a
// listener left on after the boot preload made the title screen's bar flash 0% / 100%.
test('the landing progress bar follows the boot preload only, never the later on-demand passes', () => {
  const percent = { textContent: '' };
  const fill = { style: {} };
  const context = vm.createContext({
    document: { getElementById: (id) => ({ 'landing-preload-percent': percent, 'landing-preload-fill': fill })[id] ?? null },
    populateLoadingHintTicker() {},
    playTitleLoadingAudio() {},
    isTitleLoadingAudioPlaying: () => true,
  });
  vm.runInContext(sliceFunction('setupPreloadProgressUi') + sliceFunction('setPreloadProgressPercent'), context);
  const loader = createLoader();
  vm.runInContext('setupPreloadProgressUi', context)({ load: loader });
  assert.equal(percent.textContent, '0%');
  loader.emit('progress', 0.37);
  assert.equal(percent.textContent, '37%');
  loader.emit('complete');
  assert.equal(percent.textContent, '100%');
  assert.equal(loader.count('progress'), 0, 'the progress listener is detached once the preload completes');
  // A later on-demand pass: Phaser's start() emits progress 0, then 1 as its file lands.
  loader.emit('progress', 0);
  assert.equal(percent.textContent, '100%', 'the bar no longer flashes back to 0%');
  assert.equal(fill.style.width, '100%');
  loader.emit('progress', 1);
  loader.emit('complete');
  assert.equal(percent.textContent, '100%');
});
