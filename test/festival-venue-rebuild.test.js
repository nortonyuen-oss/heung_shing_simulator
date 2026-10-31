'use strict';

// Festivals rebuilt for new art (Norton 2026-10-31): 六四 on the six-module Victoria Park (參考歷史上
// 維園64晚上既航空圖 - the pitches packed edge to edge) and the 盂蘭勝會 on the new estate court
// (籃球場改了asset，盂蘭節的舞台等要重建).
const test = require('node:test');
const assert = require('node:assert/strict');
const venues = require('../festival-venues');

const { layoutJune4, pickJune4Park, JUNE4_VENUES, layoutFestival, FESTIVAL_BUILDING_SPOTS } = venues;
const park = (id, textureKey) => ({ id, textureKey });

test('六四 is held on the best Victoria module a city has: the pitches of module05 first, any module at all', () => {
  const all = ['park_flagship_victoria', 'park_flagship_victoria_module02', 'park_flagship_victoria_module03',
    'park_flagship_victoria_module04', 'park_flagship_victoria_module05', 'park_flagship_victoria_module06'];
  all.forEach((key) => assert.ok(JUNE4_VENUES[key], `${key} has a vigil ground`));
  assert.equal(pickJune4Park(all.map((key, i) => park(`${i}:0`, key))).textureKey, 'park_flagship_victoria_module05');
  assert.equal(pickJune4Park([park('1:1', 'park_flagship_victoria_module04'), park('2:2', 'park_flagship_victoria_module03')]).textureKey, 'park_flagship_victoria_module03');
  // a city with one Victoria Park - module01, the boat garden - still keeps the vigil
  const lone = layoutJune4({ parks: [park('20:20', 'park_flagship_victoria')], minute: 21 * 60, population: 50000, seed: 's' });
  assert.ok(lone.some((p) => p.partId === 'june4Pillar'));
  assert.ok(lone.filter((p) => /june4Sit|june4Candles/.test(p.partId)).length > 5);
  assert.deepEqual(layoutJune4({ parks: [park('1:1', 'park_large')], minute: 21 * 60, seed: 's' }), [], 'no Victoria Park, no vigil');
});

test('六四 on module05 packs all three pitches in a big city, and keeps the pillar clear', () => {
  const placements = layoutJune4({ parks: [park('28:20', 'park_flagship_victoria_module05')], minute: 21 * 60, population: 300000, seed: 's' });
  const fields = new Set(placements.map((p) => p.id.split(':')[1]).filter((k) => /^\d$/.test(k)));
  assert.deepEqual([...fields].sort(), ['0', '1', '2'], 'people on every pitch');
  const pillar = placements.find((p) => p.partId === 'june4Pillar').point;
  const crowd = placements.filter((p) => /june4Sit/.test(p.partId));
  assert.ok(crowd.every((p) => Math.hypot(p.point[0] - pillar[0], (p.point[1] - pillar[1]) * 2) > 12), 'no one sits on the pillar');
});

test('盂蘭勝會 on the estate court: the stage across one end, stools inside the fence, fire and effigies out on the apron', () => {
  assert.ok(FESTIVAL_BUILDING_SPOTS.sports_ground_2x2.areas.apron);
  const out = layoutFestival('yulan', {
    minute: 20 * 60 + 30, seed: 's', kerbSlots: [], eventGrounds: [],
    courts: [{ id: '50:50', textureKey: 'sports_ground_2x2', district: 'd' }], sportsGrounds: [],
  });
  const of = (part) => out.filter((p) => p.partId === part);
  const stage = of('yulanStage')[0];
  assert.equal(stage.mirrored, true, 'turned to face down the court');
  assert.equal(stage.lengthM, 16, 'across the 18 m end, not the 24 m it stands on an event ground');
  const { court, apron } = FESTIVAL_BUILDING_SPOTS.sports_ground_2x2.areas;
  const inside = (area, [x, y]) => {
    const [L, T, R] = [area.left, area.top, area.right];
    const ux = T[0] - L[0], uy = T[1] - L[1], vx = R[0] - T[0], vy = R[1] - T[1];
    const det = ux * vy - uy * vx;
    const u = ((x - L[0]) * vy - (y - L[1]) * vx) / det, v = (ux * (y - L[1]) - uy * (x - L[0])) / det;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  };
  ['yulanStage', 'yulanStools', 'yulanShrine', 'yulanAltar'].forEach((part) => of(part).forEach((p) => assert.ok(inside(court, p.point), `${part} inside the fence`)));
  ['yulanFurnace', 'yulanHorse', 'yulanBoat', 'yulanHouse', 'lnyInfoBooth'].forEach((part) => of(part).forEach((p) => assert.ok(inside(apron, p.point), `${part} out on the apron`)));
  assert.ok(of('dbspectatorsBack1').length + of('dbspectatorsBack2').length <= 6, 'an audience that leaves the stools showing');
});
