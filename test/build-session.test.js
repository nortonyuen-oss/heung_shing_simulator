const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../build-session.js'), 'utf8');

function setup() {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  let funds = 100, price = 10, site = 'empty', commits = 0;
  let session;
  const adapter = {
    preview(draft) { return { ok: funds >= price && site !== 'blocked', cost: price, signature: JSON.stringify([draft.start, draft.end, draft.options, price, site]), reason: 'unavailable' }; },
    commit() { commits++; funds -= price; return { ok: true, cost: price }; },
  };
  session = context.createBuildSession(adapter);
  return { session, adapter, funds: (value) => { if (value !== undefined) funds = value; return funds; }, price: (value) => { price = value; }, site: (value) => { site = value; }, commits: () => commits };
}

test('two map taps and preview adjustments never write to the city; confirmation consumes an id once (M06, M07)', () => {
  const { session, funds, commits } = setup();
  const draft = session.begin('road', {}, 'map-1');
  session.select({ row: 4, col: 5 }, true);
  assert.equal(session.getState().ready, false);
  assert.equal(session.confirm(draft.id, 'map-1').ok, false);
  session.select({ row: 4, col: 8 }, true);
  session.nudge(0, 1);
  assert.equal(commits(), 0);
  assert.equal(funds(), 100);
  assert.equal(session.confirm(draft.id, 'map-1').ok, true);
  assert.equal(session.confirm(draft.id, 'map-1').ok, false);
  assert.equal(commits(), 1);
  assert.equal(funds(), 90);
});

test('cancel, changing tools and replacing the city invalidate the old transaction (M11, M20)', () => {
  const { session, commits } = setup();
  let draft = session.begin('fire-station', {}, 1);
  session.select({ row: 2, col: 2 });
  assert.equal(session.confirm(draft.id, 2).ok, false, 'wrong city owner');
  session.cancel();
  assert.equal(session.confirm(draft.id, 1).ok, false);
  draft = session.begin('road', {}, 1);
  session.select({ row: 3, col: 3 });
  session.begin('zone-res', {}, 1);
  assert.equal(session.confirm(draft.id, 1).ok, false, 'tool change');
  assert.equal(commits(), 0);
});

test('the live budget and occupation are checked before any write (M21)', () => {
  const { session, funds, site, commits } = setup();
  const draft = session.begin('fire-station');
  session.select({ row: 5, col: 5 });
  funds(2);
  assert.equal(session.confirm(draft.id).ok, false);
  funds(100);
  site('blocked');
  assert.equal(session.confirm(draft.id).ok, false);
  assert.equal(commits(), 0);
});

test('a changed price or demolition target needs a new review, then can be confirmed', () => {
  const { session, price, site, commits } = setup();
  const draft = session.begin('bulldoze');
  session.select({ row: 5, col: 5 });
  price(20);
  assert.equal(session.confirm(draft.id).reason, 'changed');
  assert.equal(commits(), 0);
  site('new building');
  assert.equal(session.confirm(draft.id).reason, 'changed');
  assert.equal(session.confirm(draft.id).ok, true);
  assert.equal(commits(), 1);
});

test('density, model and coordinates are draft snapshots; consumers cannot mutate them', () => {
  const { session } = setup();
  const options = { density: 1, model: { spriteKey: 'fire' } };
  session.begin('zone-res', options);
  options.density = 3;
  const tile = { row: 5, col: 5 };
  session.select(tile);
  tile.row = 100;
  const state = session.getState();
  state.options.model.spriteKey = 'nuclear';
  state.start.row = -1;
  assert.equal(session.getState().options.density, 1);
  assert.equal(session.getState().options.model.spriteKey, 'fire');
  assert.equal(session.getState().start.row, 5);
});

test('a re-entrant confirmation from the writer cannot submit the same id again', () => {
  const { session, adapter } = setup();
  const draft = session.begin('road');
  session.select({ row: 0, col: 0 });
  let writes = 0;
  adapter.commit = () => { writes++; assert.equal(session.confirm(draft.id).ok, false); return { ok: true }; };
  assert.equal(session.confirm(draft.id).ok, true);
  assert.equal(writes, 1);
});

test('single placement nudge keeps both coordinates together and endpoint selection adjusts only A or B', () => {
  const { session } = setup();
  session.begin('hospital');
  session.select({ row: 4, col: 5 });
  session.nudge(-1, 0);
  assert.equal(session.getState().start.row, 3);
  assert.equal(session.getState().end.row, 3);
  session.begin('road');
  session.select({ row: 1, col: 1 }, true);
  session.select({ row: 1, col: 4 }, true);
  session.setActiveEnd('start');
  session.nudge(1, 0);
  assert.equal(session.getState().start.row, 2);
  assert.equal(session.getState().end.row, 1);
});

test('all four adjustment arrows follow their screen diagonal at every map rotation', () => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  for (let turn = 0; turn < 4; turn++) {
    for (const [direction, [sx, sy]] of Object.entries({ nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] })) {
      let { dr, dc } = context.touchNudgeDelta(direction, turn);
      for (let rotation = 0; rotation < turn; rotation++) [dr, dc] = [dc, -dr];
      assert.equal(Math.sign(dc - dr), sx, `${direction} at ${turn * 90}°, screen x`);
      assert.equal(Math.sign(dc + dr), sy, `${direction} at ${turn * 90}°, screen y`);
    }
  }
});
