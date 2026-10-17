const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const state = { live: true, enabled: true, tier: 'standard', cached: true, rect: { x: 0, y: 0, width: 1000, height: 1000 } };
  const context = vm.createContext({
    simPaused: false,
    isFestivalGameplayLive: () => state.live,
    isFestivalEnabled: id => { assert.equal(id, 'lunarNewYear'); return state.enabled; },
    getFestivalTier: id => { assert.equal(id, 'lunarNewYear'); return state.tier; },
    getTrafficCameraRect: () => state.rect,
    TRAFFIC_VISUAL_CONFIG: { zoomMin: 1 },
    localStorage: { getItem: () => null },
  });
  vm.runInContext(fs.readFileSync('audio.js', 'utf8'), context);
  const created = [];
  const scene = {
    cameras: { main: { zoom: 1 } },
    cache: { audio: { exists: () => state.cached } },
    sound: {
      locked: false,
      getAll: key => created.filter(sound => sound.key === key && !sound.destroyed),
      add(key, options = {}) {
        const sound = {
          key, options, volume: 0, playCount: 0, isPlaying: false, isPaused: false,
          play() { this.playCount++; this.isPlaying = true; this.isPaused = false; },
          pause() { this.isPlaying = false; this.isPaused = true; },
          resume() { this.isPlaying = true; this.isPaused = false; },
          stop() { this.isPlaying = false; this.isPaused = false; },
          destroy() { this.destroyed = true; },
          setVolume(value) { this.volume = value; },
        };
        created.push(sound);
        return sound;
      },
    },
  };
  context.scene = scene;
  return {
    context, state, scene, created,
    update(sources = [{ id: 'troupe', x: 500, y: 500 }]) {
      context.sources = sources;
      vm.runInContext('updateLionDanceAudio(scene, sources)', context);
    },
    stop() { vm.runInContext('stopLionDanceAudio(scene)', context); },
  };
}

test('lion parade registers the existing Chinese percussion file on an independent channel', () => {
  const { context } = setup();
  const track = vm.runInContext("SFX_TRACKS.find(track => track.key === 'lny_lion_drums')", context);
  assert.equal(track.file, 'Sounds/hk_chinesedrums.mp3');
  assert.ok(fs.existsSync(track.file));
  assert.equal(vm.runInContext("SFX_TRACKS.filter(track => track.key.startsWith('db_')).length", context), 4);
});

test('moving troupes share one loop whose volume follows the nearest troupe', () => {
  const { scene, created, update } = setup();
  update([{ id: 'west', x: 100, y: 500 }]);
  const sound = created[0];
  assert.equal(sound.key, 'lny_lion_drums');
  assert.equal(sound.options.loop, true);
  assert.equal(sound.volume, .275);
  update([{ id: 'west', x: 100, y: 500 }, { id: 'east', x: 500, y: 500 }]);
  assert.equal(created.length, 1);
  assert.equal(sound.volume, .55);
  update([{ id: 'east', x: 10000, y: 500 }]);
  assert.equal(sound.volume, 0);
  update([{ id: 'east', x: 500, y: 500 }]);
  assert.equal(sound.volume, .55);
  assert.equal(scene.lionDanceAudio.sound, sound);
  assert.equal(sound.playCount, 1);
});

test('ambient mix and camera zoom control lion percussion independently of music volume', () => {
  const { context, scene, created, update } = setup();
  update();
  const sound = created[0];
  vm.runInContext('setStoredMusicVolume(0); setStoredAmbientVolume(.4)', context);
  update();
  assert.ok(Math.abs(sound.volume - .22) < 1e-12);
  scene.cameras.main.zoom = .75;
  update();
  assert.ok(Math.abs(sound.volume - .11) < 1e-12);
  scene.cameras.main.zoom = .5;
  update();
  assert.equal(sound.volume, 0);
  scene.cameras.main.zoom = 1;
  vm.runInContext('setStoredAmbientVolume(0)', context);
  update();
  assert.equal(sound.volume, 0);
  assert.equal(sound.playCount, 1);
});

test('simulation pause resumes the same recording without restarting or adding loops', () => {
  const { context, scene, created, update } = setup();
  context.simPaused = true;
  update();
  assert.equal(created.length, 0);
  context.simPaused = false;
  update();
  const sound = created[0];
  context.simPaused = true;
  update();
  assert.equal(sound.isPaused, true);
  update();
  assert.equal(created.length, 1);
  context.simPaused = false;
  update();
  assert.equal(sound.isPlaying, true);
  assert.equal(sound.isPaused, false);
  assert.equal(sound.playCount, 1);
  assert.equal(scene.lionDanceAudio.sound, sound);
});

test('locked sound and missing cache defer playback until ready', () => {
  const { state, scene, created, update } = setup();
  scene.sound.locked = true;
  update();
  assert.equal(created.length, 0);
  scene.sound.locked = false;
  state.cached = false;
  update();
  assert.equal(created.length, 0);
  state.cached = true;
  update();
  assert.equal(created.length, 1);
  assert.equal(created[0].isPlaying, true);
});

test('empty or invalid sources, hidden scenes and disabled gameplay dispose percussion', () => {
  const { state, scene, created, update } = setup();
  const cancel = action => {
    update();
    const sound = created.at(-1);
    assert.equal(sound.destroyed, undefined);
    const reset = action();
    assert.equal(scene.lionDanceAudio, null);
    assert.equal(sound.destroyed, true);
    reset?.();
  };
  cancel(() => { update([]); });
  cancel(() => { update([{ x: NaN, y: 500 }, { x: 500 }]); });
  cancel(() => { scene.scene = { isVisible: () => false }; update(); return () => { scene.scene = { isVisible: () => true }; }; });
  cancel(() => { state.live = false; update(); return () => { state.live = true; }; });
  cancel(() => { state.enabled = false; update(); return () => { state.enabled = true; }; });
  cancel(() => { state.tier = 'skip'; update(); return () => { state.tier = 'standard'; }; });
});

test('lost handles and duplicate loops recover without affecting Dragon Boat audio', () => {
  const { scene, created, update, stop } = setup();
  const dragon = scene.sound.add('db_opening', { loop: true });
  dragon.play();
  update();
  const sound = scene.lionDanceAudio.sound;
  const duplicate = scene.sound.add('lny_lion_drums', { loop: true });
  duplicate.play();
  scene.lionDanceAudio = null;
  sound.pause();
  update();
  assert.equal(scene.lionDanceAudio.sound, sound);
  assert.equal(sound.playCount, 1);
  assert.equal(duplicate.destroyed, true);
  assert.equal(scene.sound.getAll('lny_lion_drums').length, 1);
  stop();
  assert.equal(scene.lionDanceAudio, null);
  assert.equal(sound.destroyed, true);
  assert.equal(dragon.isPlaying, true);
  assert.equal(dragon.destroyed, undefined);
  assert.equal(created.filter(item => !item.destroyed).length, 1);
});
