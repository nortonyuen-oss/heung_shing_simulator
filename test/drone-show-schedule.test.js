const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const effects = fs.readFileSync(path.join(ROOT, 'council-effects.js'), 'utf8');

// Slice the scheduling constants and the due-check out of council-effects.js.
function createScheduleContext() {
  const start = effects.indexOf('const DRONE_SHOW_INTERVAL_MONTHS');
  const end = effects.indexOf('\n}\n', effects.indexOf('function isDroneShowDue(')) + 3;
  const context = vm.createContext({ Math });
  vm.runInContext(effects.slice(start, end), context);
  return context;
}

test('幻彩fing香城 shows come every three calendar months, at 20:00 on that month\'s sky-day, for thirty displayed minutes', () => {
  const context = createScheduleContext();
  assert.equal(vm.runInContext('DRONE_SHOW_INTERVAL_MONTHS', context), 3);
  assert.equal(vm.runInContext('DRONE_SHOW_START_MINUTE', context), 20 * 60);
  assert.equal(vm.runInContext('DRONE_SHOW_DURATION_MINUTES', context), 30);

  const due = (program, monthIndex, minute) => vm.runInContext(
    `isDroneShowDue(${JSON.stringify(program)}, ${monthIndex}, ${minute})`, context,
  );
  const program = { type: 'quarterly_drone_show', remainingShows: 4, nextShowMonthIndex: 103, lastTriggeredMonthIndex: -1 };
  // not yet its month
  assert.equal(due(program, 102, 21 * 60), false);
  // its month, but morning / afternoon
  assert.equal(due(program, 103, 6 * 60), false);
  assert.equal(due(program, 103, 19 * 60 + 59), false);
  // 20:00 that evening
  assert.equal(due(program, 103, 20 * 60), true);
  assert.equal(due(program, 103, 22 * 60), true);
  // already fired this month
  assert.equal(due({ ...program, lastTriggeredMonthIndex: 103 }, 103, 21 * 60), false);
  // a month missed entirely fires at the next evening
  assert.equal(due(program, 105, 20 * 60), true);
  assert.equal(due(program, 105, 8 * 60), false);
  // finished programmes never fire
  assert.equal(due({ ...program, remainingShows: 0 }, 103, 21 * 60), false);
  assert.equal(due({ ...program, type: 'other' }, 103, 21 * 60), false);
});

test('approval schedules the first show three months out and each show three months after the last', () => {
  assert.match(effects, /nextShowMonthIndex: now \+ DRONE_SHOW_INTERVAL_MONTHS/);
  assert.match(effects, /program\.nextShowMonthIndex = monthIndex \+ DRONE_SHOW_INTERVAL_MONTHS/);
  // the monthly tick no longer fires shows; the sky clock does
  const monthly = effects.slice(effects.indexOf('function updateCouncilTimedSystems('));
  assert.doesNotMatch(monthly, /triggerQuarterlyDroneShow\(/);
  assert.match(effects, /onGameClockEvent\('gameclock:time', updateDroneShowClock\)/);
  // the overlay is held for the show's displayed duration, not a real-time timeout
  assert.match(effects, /endsAtEnvironmentMinutes = now \+ DRONE_SHOW_DURATION_MINUTES/);
  assert.doesNotMatch(effects, /setTimeout\(\(\) => overlay\.classList\.remove/);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /#drone-show-overlay\.is-live \{ opacity: 1; \}/);
  assert.doesNotMatch(html, /drone-show-sky 5s/);
});

test('a No. 8 signal at show time cancels the evening: no fireworks, no modifiers, a lost slot', () => {
  const effects = fs.readFileSync(path.join(ROOT, 'council-effects.js'), 'utf8');
  // the outcome check puts the typhoon test before everything else
  const outcomeFn = effects.slice(effects.indexOf('function getDroneShowOutcome('), effects.indexOf('function getDroneShowFailureModifiers('));
  assert.match(outcomeFn, /if \(isDroneShowCancelledByTyphoon\(\)\) return \{ outcome: 'typhoon_cancelled', readiness \};/);
  const cancel = effects.slice(effects.indexOf('function isDroneShowCancelledByTyphoon('), effects.indexOf('function getDroneShowOutcome('));
  assert.match(cancel, /\['signal8', 'signal9', 'signal10'\]\.includes\(city\.weather\?\.typhoonStage\)/);
  // a rainstorm warning still crashes the drones rather than cancelling
  assert.match(outcomeFn, /\['red', 'black'\]\.includes\(city\.weather\?\.rainWarning\)/);
  // the trigger skips the show and the temporary effect on cancellation
  const trigger = effects.slice(effects.indexOf('function triggerQuarterlyDroneShow('), effects.indexOf('function completeFinishedDroneShowProgrammes('));
  assert.match(trigger, /if \(result\.outcome === 'typhoon_cancelled'\) \{[\s\S]*?\} else \{[\s\S]*?addCouncilTemporaryEffect[\s\S]*?startDroneShow\(result\.outcome\);/);
  assert.match(trigger, /program\.remainingShows--;/);

  // the summary counts a cancellation as neither success nor failure
  const start = effects.indexOf('function summarizeDroneShowProgramme(');
  const end = effects.indexOf('\n}\n', start) + 3;
  const context = vm.createContext({});
  vm.runInContext(effects.slice(start, end), context);
  const summary = vm.runInContext(`summarizeDroneShowProgramme(${JSON.stringify({ results: [
    { outcome: 'success' }, { outcome: 'typhoon_cancelled' }, { outcome: 'success' }, { outcome: 'noise_complaints' },
  ] })})`, context);
  assert.equal(summary.showCount, 4);
  assert.equal(summary.successCount, 2);
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.cancelledCount, 1);
  assert.equal(summary.outcome, 'noise_complaints');
  const allCancelled = vm.runInContext(`summarizeDroneShowProgramme(${JSON.stringify({ results: [
    { outcome: 'typhoon_cancelled' }, { outcome: 'typhoon_cancelled' },
  ] })})`, context);
  assert.equal(allCancelled.outcome, 'typhoon_cancelled');
  assert.equal(allCancelled.failureCount, 0);

  // and the sky is no longer tinted by the overlay
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const overlayCss = html.slice(html.indexOf('#drone-show-overlay {'), html.indexOf('.firework-burst {'));
  assert.match(overlayCss, /background: transparent;/);
  assert.doesNotMatch(overlayCss, /linear-gradient/);
});
