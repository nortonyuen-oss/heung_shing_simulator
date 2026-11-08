const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tram = require('../tram.js');
Object.assign(global, tram);
const lines = require('../tram-lines.js');

const road = (tiles) => (row, col) => tiles.has(`${row}:${col}`);
const span = (r0, c0, r1, c1) => { const s = new Set(); for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) s.add(`${r}:${c}`); return s; };
const lay = (tracks, tiles, a, b) => {
  const plan = tram.planTramTrack(a, b, tracks, road(tiles));
  plan.removes.forEach(({ row, col, bit }) => { const k = `${row}:${col}`; tracks[k] &= ~bit; if (!tracks[k]) delete tracks[k]; });
  plan.adds.forEach(({ row, col, bit }) => { const k = `${row}:${col}`; tracks[k] = (tracks[k] || 0) | bit; });
  return tracks;
};
const stop = (row, col, axis = 'ns', band = false) => ({ row, col, axis, band });

test('a new tram line announces its opening once with the driver picture', () => {
  const posts = [];
  const state = {
    stops: [{ id: 's1', name: '西站', row: 1, col: 1 }, { id: 's2', name: '東站', row: 2, col: 1 }],
    lines: [
      { id: 'new', name: '叮叮綫', stopIds: ['s1', 's2'], newsPending: true },
      { id: 'old', name: '舊綫', stopIds: ['s1', 's2'] },
    ],
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'tram-lines.js'), 'utf8');
  const api = new Function('posts', 'state', `
    const city = { name: '香城' };
    function getTramState() { return state; }
    function addForumPost(article, meta) { posts.push({ ...article, ...meta }); }
    ${source}
    return { announceTramLineOpened, cancelTramLineDraft, setDraft: (draft) => { tramLineDraft = draft; } };
  `)(posts, state);
  api.setDraft({ lineId: 'new' });
  assert.equal(api.announceTramLineOpened(state.lines[0]), false);
  api.cancelTramLineDraft();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].image, 'UI/news/tramDriver.webp');
  assert.match(posts[0].body[0], /由「西站」開往「東站」/);
  assert.equal(api.announceTramLineOpened(state.lines[0]), false);
  assert.equal(api.announceTramLineOpened(state.lines[1]), false);
  assert.equal(posts.length, 1);
  const saved = tram.normalizeTramState({ stops: state.stops, lines: [{ ...state.lines[0], newsPending: true }, state.lines[1]] });
  assert.equal(saved.lines[0].newsPending, true);
  assert.equal(saved.lines[1].newsPending, undefined);
  for (const file of ['UI/news/tramDriver.webp', 'UI/news/thumbs/tramDriver.webp']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', file)), file);
  }
});

test('a line on a narrow road: out on the left-hand track, across and back on the other at each end', () => {
  const tiles = span(2, 5, 12, 5);
  const tracks = lay({}, tiles, { row: 12, col: 5 }, { row: 2, col: 5 });
  const geo = tram.buildTramTrackGeometry(tracks);
  const route = lines.buildTramLineRoute(geo, [stop(10, 5), stop(4, 5)]);
  assert.equal(route.code, undefined);
  assert.deepEqual(route.loops, [false, false]);
  assert.equal(route.calls.length, 2);
  assert.equal(route.calls[1].stop, 1);
  // closed: it ends where it starts
  assert.ok(Math.hypot(route.pts[0][0] - route.pts.at(-1)[0], route.pts[0][1] - route.pts.at(-1)[1]) < 1e-6);
  // north (out): the west track (keep left); south (back): the east one
  const out = lines.tramRoutePointAt(route, route.calls[1].at / 2);
  assert.ok(Math.abs(out.pos[0] - 5.38) < 1e-6 && out.heading[1] < 0, JSON.stringify(out));
  const back = lines.tramRoutePointAt(route, route.calls[1].at + (route.length - route.calls[1].at) / 2);
  assert.ok(Math.abs(back.pos[0] - 5.62) < 1e-6 && back.heading[1] > 0, JSON.stringify(back));
  assert.equal(out.traffic, true, 'in the lanes of a narrow road');
});

test('a terminus with a loop round a block is driven round it', () => {
  const tiles = new Set([...span(2, 5, 14, 5), ...span(2, 5, 2, 9), ...span(6, 5, 6, 9), ...span(2, 9, 6, 9)]);
  const tracks = {};
  lay(tracks, tiles, { row: 14, col: 5 }, { row: 2, col: 5 });
  lay(tracks, tiles, { row: 2, col: 5 }, { row: 2, col: 9 });   // the line's end carried on along the top
  lay(tracks, tiles, { row: 2, col: 9 }, { row: 6, col: 9 });   // down the far side
  lay(tracks, tiles, { row: 6, col: 9 }, { row: 6, col: 5 });   // back along the bottom into the line: a T
  const geo = tram.buildTramTrackGeometry(tracks);
  const route = lines.buildTramLineRoute(geo, [stop(12, 5), stop(8, 5)]);
  assert.equal(route.code, undefined);
  assert.deepEqual(route.loops, [false, true]);
  // round the block: it reaches the far side
  assert.ok(route.pts.some(([x]) => x > 9), 'goes round to column 9');
});

test('no track between two stops: no line', () => {
  const tiles = new Set([...span(2, 5, 6, 5), ...span(9, 5, 12, 5)]);
  const tracks = {};
  lay(tracks, tiles, { row: 6, col: 5 }, { row: 2, col: 5 });
  lay(tracks, tiles, { row: 12, col: 5 }, { row: 9, col: 5 });
  const route = lines.buildTramLineRoute(tram.buildTramTrackGeometry(tracks), [stop(10, 5), stop(4, 5)]);
  assert.equal(route.code, 'noWay');
});

test('a tram on its way: at its pace, stopping at each stop for its dwell, held when blocked or at a red light', () => {
  const tiles = span(2, 5, 12, 5);
  const tracks = lay({}, tiles, { row: 12, col: 5 }, { row: 2, col: 5 });
  const route = lines.buildTramLineRoute(tram.buildTramTrackGeometry(tracks), [stop(10, 5), stop(7, 5), stop(4, 5)]);
  const { TRAM_SERVICE } = lines;
  assert.equal(route.calls.length, 4, 'out 0, 1, 2; back 1');
  const v = { dist: 0.5, dwellLeft: 0, callIndex: lines.tramNextCallIndex(route, 0.5) };
  assert.equal(v.callIndex, 1);
  const moved = lines.stepTram(v, route, 1);
  assert.ok(Math.abs(moved - TRAM_SERVICE.speedFactor) < 1e-9);
  assert.equal(lines.stepTram(v, route, 1, { blocked: () => true }), 0, 'held behind the car ahead');
  assert.ok(Math.abs(lines.stepTram(v, route, 1, { limit: () => 0.1 }) - 0.1) < 1e-9, 'up to the stop line');
  // to the next stop: it stops there, calls, and waits out its dwell
  const calls = [];
  for (let k = 0; k < 20 && !calls.length; k++) lines.stepTram(v, route, 1, { onCall: (c) => calls.push(c) });
  assert.equal(calls[0].stop, 1);
  assert.equal(v.dist, route.calls[1].at);
  assert.equal(lines.stepTram(v, route, 1), 0, 'dwelling');
  // a whole round trip calls at every stop once
  const all = [];
  for (let k = 0; k < 400; k++) lines.stepTram(v, route, 0.5, { onCall: (c) => all.push(c.stop) });
  assert.deepEqual(all.slice(0, 4).sort(), [0, 1, 1, 2]);
});

test('a call: off at the end of the line, on up to the room, at the flat fare', () => {
  const { TRAM_SERVICE } = lines;
  const end = lines.tramCall({ aboard: 40, waiting: 10, arrivingAhead: 1, share: 1 });
  assert.equal(end.alighting, 40);
  assert.equal(end.boarding, 10);
  assert.ok(Math.abs(end.revenue - 10 * TRAM_SERVICE.fare) < 1e-9);
  const full = lines.tramCall({ aboard: TRAM_SERVICE.tramCapacity, waiting: 500, arrivingAhead: 4, share: 1 });
  assert.equal(full.boarding, full.alighting, 'only as many on as got off');
});

test('in the traffic: a tram as a car leg, and what holds it', () => {
  const leg = lines.tramAsTrafficLeg([5.38, 7.3], [0, -1]);
  assert.deepEqual(leg.current, { row: 7, col: 5 });
  assert.deepEqual(leg.next, { row: 6, col: 5 });
  assert.ok(Math.abs(leg.progress - 0.2) < 1e-9);
  assert.equal(lines.tramBlockedBy([5.38, 7.3], [0, -1], [5.5, 6.7], [0, -1], 0.9), true, 'a car ahead the same way');
  assert.equal(lines.tramBlockedBy([5.38, 7.3], [0, -1], [5.5, 6.7], [0, 1], 0.9), false, 'oncoming');
  assert.equal(lines.tramBlockedBy([5.38, 7.3], [0, -1], [5.5, 7.9], [0, -1], 0.9), false, 'behind');
});

test('a stop: on straight track; on a dual carriageway the band pair, whichever half is clicked', () => {
  const bandAt = (r, c) => (c === 5 || c === 6) ? { orientation: 'v', width: 2, index: c - 5 } : null;
  const ctx = (tracks, stopAt = () => null) => ({ tracks, bandAt, roadKeyAt: () => 'road_straight_v', stopAt });
  assert.deepEqual(lines.whyNotTramStopAt(4, 6, ctx({ '4:6': 1 })), { site: { row: 4, col: 5, axis: 'ns', band: true } });
  assert.equal(lines.whyNotTramStopAt(4, 6, ctx({ '4:6': 1 | 16 })).code, 'notStraight');
  assert.equal(lines.whyNotTramStopAt(4, 6, ctx({})).code, 'noTrack');
  assert.equal(lines.whyNotTramStopAt(4, 6, ctx({ '4:6': 1 }, (r) => r === 5)).code, 'tooClose');
});
