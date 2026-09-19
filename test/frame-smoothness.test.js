const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const sliceFunction = (src, name) => {
  const start = src.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `${name} must remain extractable`);
  return src.slice(start, src.indexOf('\n}\n', start) + 3);
};

// ── The vertex upload shim (main.js installVertexUploadShim) ─────────────────

test('the vertex upload shim turns Phaser\'s whole-batch bufferSubData into bufferData and nothing else', () => {
  const context = vm.createContext({ ArrayBuffer, Uint8Array, Float32Array });
  vm.runInContext(sliceFunction(source('main.js'), 'installVertexUploadShim'), context);
  const calls = [];
  const gl = {
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, DYNAMIC_DRAW: 35048,
    bufferSubData(...args) { calls.push(['bufferSubData', ...args]); },
    bufferData(...args) { calls.push(['bufferData', ...args]); },
  };
  const installed = vm.runInContext('installVertexUploadShim', context)({ gl });
  assert.equal(installed, true);
  assert.equal(gl.__vertexUploadShim, true);
  assert.equal(vm.runInContext('installVertexUploadShim', context)({ gl }), false, 'installs once per context');

  const bytes = new Uint8Array(64);
  const view = bytes.subarray(0, 24);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, view);
  assert.deepEqual(calls.at(-1), ['bufferData', gl.ARRAY_BUFFER, view, gl.DYNAMIC_DRAW], 'a whole-batch upload becomes a fresh bufferData');
  gl.bufferSubData(gl.ARRAY_BUFFER, 128, view);
  assert.equal(calls.at(-1)[0], 'bufferSubData', 'an upload at an offset is left alone');
  gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, view);
  assert.equal(calls.at(-1)[0], 'bufferSubData', 'index buffers are left alone');
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, view, 4, 8);
  assert.equal(calls.at(-1)[0], 'bufferSubData', 'the srcOffset/length overload is left alone');

  const main = source('main.js');
  const create = main.slice(main.indexOf('\nfunction create() {'));
  assert.ok(create.slice(0, 200).includes('installVertexUploadShim(this.game?.renderer)'), 'installed before the first frame renders');
});

// ── The spread-out simulation pulse (simulation.js) ──────────────────────────

function createPulseContext() {
  const sim = source('simulation.js');
  const context = vm.createContext({ performance, console });
  vm.runInContext(`
    var calls = [];
    var invalidateBuildingCountCache = () => calls.push('invalidate');
    var buildCitySimulationPulseSteps = (scene) => ['a', 'b', 'c', 'd'].map((section) => ({ section, action: () => { calls.push(section + ':' + scene.name); if (scene.slowMs) { const t = performance.now(); while (performance.now() - t < scene.slowMs) {} } } }));
    var recordVisualRoutePerformanceDuration = (scene, section, ms) => calls.push('profile:' + section);
    var isVisualRouteCalibrationTestModeEnabled = () => false;
  `, context);
  vm.runInContext(sim.slice(sim.indexOf('function isCitySimulationProfiling('), sim.indexOf('function updateEducationLevels(')), context);
  // Arrays cross the vm realm with a foreign prototype: read them back as plain JSON.
  return (expr) => JSON.parse(JSON.stringify(vm.runInContext(expr, context)) ?? 'null');
}

test('a scheduled pulse runs its steps in order across frames within the budget, then completes', () => {
  const run = createPulseContext();
  run(`var done = 0; scheduleCitySimulationPulse({ name: 'x' }, () => { done++; calls.push('complete'); })`);
  assert.equal(run('isCitySimulationPulsePending()'), true);
  // A zero budget means exactly one step per pump (the budget is checked after each step).
  assert.equal(run('pumpCitySimulationPulse(0)'), true, 'more to do');
  assert.deepEqual(run('calls.slice()'), ['invalidate', 'a:x']);
  assert.equal(run('done'), 0);
  assert.equal(run('pumpCitySimulationPulse(0)'), true);
  assert.equal(run('pumpCitySimulationPulse(0)'), true);
  assert.deepEqual(run('calls.slice(2)'), ['b:x', 'c:x']);
  assert.equal(run('pumpCitySimulationPulse(0)'), false, 'the last step finishes the pulse');
  assert.deepEqual(run('calls.slice(4)'), ['d:x', 'complete']);
  assert.equal(run('done'), 1);
  assert.equal(run('isCitySimulationPulsePending()'), false);
  assert.equal(run('pumpCitySimulationPulse(0)'), false, 'idle pump is a no-op');
  // A generous budget runs everything in one pump.
  run(`scheduleCitySimulationPulse({ name: 'y' }, () => calls.push('complete-y'))`);
  assert.equal(run('pumpCitySimulationPulse(1000)'), false);
  assert.deepEqual(run('calls.slice(6)'), ['invalidate', 'a:y', 'b:y', 'c:y', 'd:y', 'complete-y']);
});

test('pulses queue in order and flush drains them synchronously', () => {
  const run = createPulseContext();
  run(`scheduleCitySimulationPulse({ name: 'first' }, () => calls.push('done-first')); scheduleCitySimulationPulse({ name: 'second' }, () => calls.push('done-second'))`);
  run('flushCitySimulationPulses()');
  assert.deepEqual(run('calls.slice()'), ['invalidate', 'a:first', 'b:first', 'c:first', 'd:first', 'done-first', 'invalidate', 'a:second', 'b:second', 'c:second', 'd:second', 'done-second']);
  assert.equal(run('isCitySimulationPulsePending()'), false);
  // The synchronous runner still exists for tests and tools.
  run("calls.length = 0; runLegacyCitySimulationPulse({ name: 'sync' })");
  assert.deepEqual(run('calls.slice()'), ['invalidate', 'a:sync', 'b:sync', 'c:sync', 'd:sync']);
});

test('the calendar schedules the pulse, the frame loop pumps it, and a save flushes it first', () => {
  const clock = source('game-clock.js');
  const day = clock.slice(clock.indexOf('function onCalendarDayAdvanced('), clock.indexOf('function advanceCalendarForEnvironmentMinutes('));
  assert.ok(day.includes('scheduleCitySimulationPulse(scene, () => finishPulse(true))'), 'a pulse day schedules the pulse');
  assert.ok(day.includes('runLegacyCitySimulationPulse(scene);\n      finishPulse(false)'), 'without a scheduler it still runs synchronously');
  assert.match(day, /const finishPulse = \(refreshHud\) => \{\n\s*city\.tick\+\+;\n\s*emitGameClockEvent\('gameclock:citypulse'/, 'the tick and the event follow the last step');
  const main = source('main.js');
  const frame = main.slice(main.indexOf('\nfunction updateGameFrame('), main.indexOf('\nfunction addToRenderLayer('));
  assert.ok(frame.includes('pumpCitySimulationPulse()'), 'the frame loop pumps queued pulses');
  const save = source('save.js');
  const payload = save.slice(save.indexOf('function buildSavePayload('));
  assert.ok(payload.slice(0, 300).includes('flushCitySimulationPulses()'), 'a save never captures a half-run pulse');
});

test('zone growth exposes its own steps with the tile walk chunked, and the pulse list includes them', () => {
  const growth = source('sim-growth.js');
  assert.ok(growth.includes('function buildZoneGrowthSteps(scene)'));
  assert.match(growth, /const ZONE_GROWTH_TILES_PER_STEP = \d+;/);
  assert.ok(growth.includes('for (let index = from; index < to; index++) growZoneTile(scene, tiles[index], ctx);'), 'each chunk walks a slice of the zoned tiles');
  const sim = source('simulation.js');
  assert.ok(sim.includes('for (const growthStep of buildZoneGrowthSteps(scene)) step(growthStep.section, growthStep.action);'), 'the pulse spreads growth over its chunks');
});
