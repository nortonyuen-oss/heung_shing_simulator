// 點唱機: shuffle (Norton v6.0.9: 手機版次次都單曲重播，我想隨機播放，而且會切歌).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
function loadAudio({ platform = 'web', stored = null } = {}) {
  const store = new Map(stored ? [['citybuilder.musicLoopMode', stored]] : []);
  const context = vm.createContext({
    globalThis: undefined, console, Math, Object, Array, Number, String,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    MUSIC_TRACKS: ['music_title', 'a', 'b', 'c', 'd', 'e'].map((key) => ({ key, file: `${key}.mp3`, title: key })),
    document: { getElementById: () => null, querySelectorAll: () => [] },
    updateMapNavigationControls() {},
  });
  context.globalThis = context;
  context.HEUNG_SHING_CONFIG = { platform };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf8'), context, { filename: 'audio.js' });
  return { context, store };
}

test('the browser version starts on shuffle, the desktop in order, and a choice is remembered', () => {
  assert.equal(vm.runInContext('musicLoopMode', loadAudio({ platform: 'web' }).context), 'shuffle');
  assert.equal(vm.runInContext('musicLoopMode', loadAudio({ platform: 'desktop' }).context), 'all');
  assert.equal(vm.runInContext('musicLoopMode', loadAudio({ platform: 'web', stored: 'one' }).context), 'one');
  const { context, store } = loadAudio();
  vm.runInContext("setMusicLoopMode('one')", context);
  assert.equal(store.get('citybuilder.musicLoopMode'), 'one');
  vm.runInContext("setMusicLoopMode('nonsense')", context);
  assert.equal(vm.runInContext('musicLoopMode', context), 'one');
});

test('shuffle plays every gameplay track once before repeating, never the title theme, and ⏮ goes back', () => {
  const { context } = loadAudio();
  vm.runInContext('activeTrackIndex = 1', context);
  const played = [];
  for (let i = 0; i < 4; i++) played.push(vm.runInContext('activeTrackIndex = stepMusicTrack(1)', context));
  assert.deepEqual([...played].sort(), [2, 3, 4, 5], 'the other four, each once');
  assert.ok(!played.includes(0), 'no title theme');
  assert.equal(vm.runInContext('stepMusicTrack(-1)', context), played[2], '⏮ returns to the one before');
  // in order, without shuffle
  vm.runInContext("setMusicLoopMode('all'); activeTrackIndex = 5", context);
  assert.equal(vm.runInContext('stepMusicTrack(1)', context), 0);
  assert.equal(vm.runInContext('stepMusicTrack(-1)', context), 4);
});
