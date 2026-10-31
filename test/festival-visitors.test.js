'use strict';

// 年宵 at the 20 m tile (Norton 2026-10-31): stalls sized to it, Victoria Park's fair on the module with the
// three big pitches only, and people browsing the aisles (花市現在沒有市民，應該要加返啲人行花市).
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickFestivalVisitorSpots, festivalVisitorToGround, festivalVisitorToScreen } = require('../festival-visitors.js');
const { layoutLunarNewYear } = require('../festival-venues.js');

test('ground metres and screen pixels round-trip: a 20 m tile is 100 x 50 px', () => {
  const g = festivalVisitorToGround(130, 77);
  const back = festivalVisitorToScreen(g.c, g.r);
  assert.ok(Math.abs(back.x - 130) < 1e-9 && Math.abs(back.y - 77) < 1e-9);
  assert.deepEqual(festivalVisitorToGround(50, 25), { c: 20, r: 0 }, 'one tile along +col');
});

test('visitors stand in the aisles: off the stalls, within the market, the same for a window, reshuffled after', () => {
  // two back-to-back rows of 2 x 2 m booths with a 4 m aisle between them
  const stalls = [];
  for (let k = 0; k < 8; k++) [0, 6].forEach((r) => stalls.push({ c: k * 2, r, radius: Math.SQRT2 }));
  const market = { key: 'm', stalls };
  const spots = pickFestivalVisitorSpots(market, 7);
  assert.ok(spots.length > 3);
  spots.forEach((s) => {
    stalls.forEach((st) => assert.ok(Math.hypot(s.c - st.c, s.r - st.r) > st.radius, 'not on a stall'));
    assert.ok(s.c >= -1.5 && s.c <= 15.5 && s.r >= -1.5 && s.r <= 7.5, 'within the market, not on the lawn');
  });
  assert.deepEqual(pickFestivalVisitorSpots(market, 7), spots, 'stable within a window (reload/rotate-safe)');
  assert.notDeepEqual(pickFestivalVisitorSpots(market, 8), spots, 'a new crowd a few minutes on');
  assert.ok(spots.length <= Math.round(stalls.length * 1.3), 'capped by the market\'s size');
  assert.deepEqual(pickFestivalVisitorSpots(market, 7, () => false), [], 'a ground test can rule spots out');
});

test('年宵 stalls carry their real size, and only module05 holds Victoria Park\'s fair', () => {
  const out = layoutLunarNewYear({
    tier: 'standard', seed: 's', soldShare: 1, phase: 'peak',
    parks: [{ id: '1:1', textureKey: 'park_flagship_victoria_module05' }, { id: '1:5', textureKey: 'park_flagship_victoria_module06' }],
    courts: [{ id: '5:5', textureKey: 'sports_ground_2x2' }],
    eventGrounds: [{ id: 'eventGround:9:9', tiles: [[9, 9], [9, 10], [10, 9], [10, 10]] }],
  });
  const stalls = out.filter((p) => p.stall);
  assert.ok(stalls.length > 50);
  stalls.forEach((p) => {
    assert.ok(p.footprintM?.width > 0 && p.footprintM?.depth > 0, `${p.id}: a footprint`);
    assert.ok(p.maxHeightM > 0 && p.maxHeightM <= 3, `${p.id}: a real canopy height, ${p.maxHeightM} m`);
  });
  assert.ok(!stalls.some((p) => p.buildingId === '1:5'), 'module06: no fair');
  assert.ok(stalls.some((p) => p.buildingId === '1:1') && stalls.some((p) => p.mode === 'tile') && stalls.some((p) => p.buildingId === '5:5'));
});
