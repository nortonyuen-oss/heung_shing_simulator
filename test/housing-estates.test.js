// 公屋／居屋屋邨 (housing-estates.js, docs/public-housing-estate-plan.md; Norton, 2026-11-24): a zoned site
// planned whole - blocks, facilities and parks - with no tile a block can never fill.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const estates = require('../housing-estates.js');
const { planHousingEstate } = estates;

const covered = (plan) => {
  const grid = Array.from({ length: plan.D }, () => Array(plan.W).fill(0));
  plan.items.forEach((it) => {
    for (let r = 0; r < it.size; r++) for (let c = 0; c < it.size; c++) grid[it.row + r][it.col + c] += 1;
  });
  return grid.flat();
};

test('every site from 1x1 to 14x14 is planned to the last tile, nothing twice, nothing left over', () => {
  for (const type of ['public', 'hos']) for (const density of [2, 3]) {
    for (let W = 1; W <= 14; W++) for (let D = 1; D <= 14; D++) {
      const counts = covered(planHousingEstate(W, D, type, density));
      assert.ok(counts.every((n) => n === 1), `${type} ${density} ${W}x${D}`);
    }
  }
});

test('an estate of three blocks or more keeps its open space: a fifth of the site off homes, and HKPSG 1 m² a person', () => {
  for (const type of ['public', 'hos']) for (const density of [2, 3]) {
    for (let W = 3; W <= 14; W++) for (let D = 3; D <= 14; D++) {
      const plan = planHousingEstate(W, D, type, density);
      if (plan.planned < 3) continue;
      const facilityTiles = plan.items.filter((it) => ['market', 'centre', 'sports'].includes(it.kind)).reduce((s, it) => s + it.size * it.size, 0);
      const ratio = type === 'hos' ? 0.15 : 0.20;
      assert.ok(plan.parks + facilityTiles >= Math.ceil(ratio * W * D), `${type} ${density} ${W}x${D}: land off homes`);
      assert.ok(plan.parks >= Math.round(plan.population / 400), `${type} ${density} ${W}x${D}: ${plan.parks} park tiles for ${plan.population}`);
    }
  }
});

test('rows of blocks a tile apart; a block\'s width left over pairs two; slack widens the middle courtyard', () => {
  assert.deepEqual(estates.housingEstateBlockColumns(3, 3), [0]);
  assert.deepEqual(estates.housingEstateBlockColumns(6, 3), [0, 3]);
  assert.deepEqual(estates.housingEstateBlockColumns(7, 3), [0, 4]);
  assert.deepEqual(estates.housingEstateBlockColumns(10, 3), [0, 3, 7], 'a pair, a gap, a block');
  assert.deepEqual(estates.housingEstateBlockColumns(11, 3), [0, 4, 8]);
  assert.deepEqual(estates.housingEstateBlockColumns(9, 3), [0, 6], 'two left over: the middle gap 3 wide');
  assert.deepEqual(estates.housingEstateDepthBands(7, 3).map((b) => b.name), ['T', 'G1', 'T']);
  assert.deepEqual(estates.housingEstateDepthBands(14, 3).map((b) => b.name), ['T', 'G1', 'T', 'C4', 'T']);
});

test('the facilities by blocks planned: 10x6 public has a market on the road and a community centre, an HOS court no market', () => {
  const tenBySix = planHousingEstate(10, 6, 'public', 2);
  const market = tenBySix.items.find((it) => it.kind === 'market');
  assert.equal(market.row, 0, 'the market faces the road');
  assert.ok(tenBySix.items.some((it) => it.kind === 'centre'));
  assert.equal(tenBySix.items.filter((it) => it.kind === 'block').length, 4);
  const hos = planHousingEstate(12, 10, 'hos', 2);
  assert.ok(!hos.items.some((it) => it.kind === 'market'));
  assert.equal(planHousingEstate(6, 6, 'public', 2).items.filter((it) => it.kind === 'block').length, 3);
  // 居屋 takes its 3x3 block where it houses a quarter more, else its 4x4 courts
  assert.equal(planHousingEstate(6, 6, 'hos', 2).blockSize, 3);
  assert.equal(planHousingEstate(9, 9, 'hos', 2).blockSize, 4);
});

test('an estate\'s 2x2 parks start with a basketball court, never the statue plaza (Norton, 2026-11-24)', () => {
  const plan = planHousingEstate(10, 6, 'public', 2);
  const courts = plan.items.filter((it) => it.kind === 'park2').map((it) => it.variant);
  assert.equal(courts[0], 'basketball_court');
  assert.ok(courts.every((v) => v === 'basketball_court' || v === 'palm_court'), courts.join());
  for (let W = 3; W <= 14; W++) for (let D = 3; D <= 14; D++) {
    assert.ok(!planHousingEstate(W, D, 'public', 2).items.some((it) => it.variant === 'premium_plaza'), `${W}x${D}`);
  }
  assert.match(source('housing-estates.js'), /placeSportsGround\(scene, slot\.row, slot\.col, court, \{ free: true, refresh: false \}\)/);
  assert.match(source('tools.js'), /function placeSportsGround\(scene, row, col, option, options = \{\}\) \{/);
});

test('an 8x8 public site is the 安泰邨 estate art whole (Norton\'s pick)', () => {
  const plan = planHousingEstate(8, 8, 'public', 2);
  assert.deepEqual(plan.items.map((it) => [it.kind, it.size]), [['estate8', 8]]);
  assert.notEqual(planHousingEstate(8, 8, 'hos', 2).items[0].kind, 'estate8');
});

test('the front is the side with the most road; the plan turns to face it and stays inside the site', () => {
  const rect = { row: 10, col: 20, rows: 6, cols: 10 };
  const roadSouth = (r) => r === 16;
  assert.equal(estates.housingEstateFront(rect, roadSouth), 's');
  assert.equal(estates.housingEstateFront(rect, (r, c) => c === 19), 'w');
  for (const front of ['n', 's', 'w', 'e']) {
    const { W, D } = estates.housingEstateFrame(rect, front);
    const plan = planHousingEstate(W, D, 'public', 2);
    const tiles = new Set();
    plan.items.forEach((it) => {
      const at = estates.housingEstateItemToMap(rect, front, it);
      for (let r = 0; r < it.size; r++) for (let c = 0; c < it.size; c++) {
        assert.ok(at.row + r >= 10 && at.row + r < 16 && at.col + c >= 20 && at.col + c < 30, front);
        tiles.add(`${at.row + r}:${at.col + c}`);
      }
      if (it.kind === 'market') {
        const touches = { n: at.row === 10, s: at.row + it.size === 16, w: at.col === 20, e: at.col + it.size === 30 }[front];
        assert.ok(touches, `the market on the ${front} road`);
      }
    });
    assert.equal(tiles.size, 60, `${front}: every tile once`);
  }
});

test('a site with things in the way is cut into rectangles, every free tile planned', () => {
  const blocked = new Set(['2:2', '2:3', '3:2', '3:3', '0:9']);
  const rect = { row: 0, col: 0, rows: 8, cols: 10 };
  const free = (r, c) => !blocked.has(`${r}:${c}`);
  const parts = estates.splitIntoRectangles(rect, free);
  const tiles = new Set();
  parts.forEach((p) => { for (let r = p.row; r < p.row + p.rows; r++) for (let c = p.col; c < p.col + p.cols; c++) tiles.add(`${r}:${c}`); });
  assert.equal(tiles.size, 80 - blocked.size);
  const site = estates.planHousingEstateSite(rect, 'public', 2, free, () => false);
  const planned = new Set();
  site.slots.forEach((s) => { for (let r = 0; r < s.size; r++) for (let c = 0; c < s.size; c++) planned.add(`${s.row + r}:${s.col + c}`); });
  assert.equal(planned.size, 80 - blocked.size);
  assert.ok([...blocked].every((id) => !planned.has(id)));
  // A座, B座 ... across the parts
  assert.deepEqual(site.slots.filter((s) => s.kind === 'block').map((s) => s.label), 'ABCDEFGHJLNQRTUVWXYZ'.slice(0, site.blocks).split(''));
});

test('a hillside site comes apart into level terraces: no block across two heights, one set of facilities (Norton, 2026-11-24)', () => {
  // rows 0-5 at one height, row 6 the slope (nothing built there), rows 7-12 a level higher
  const rect = { row: 0, col: 0, rows: 13, cols: 10 };
  const heightOf = (r) => (r >= 6 ? 1 : 0);
  const free = (r) => r !== 6;
  const site = estates.planHousingEstateSite(rect, 'public', 2, free, (r) => r === -1, heightOf);
  site.slots.forEach((slot) => {
    const heights = new Set();
    for (let r = 0; r < slot.size; r++) heights.add(heightOf(slot.row + r));
    assert.equal(heights.size, 1, `${slot.kind} at ${slot.row}:${slot.col} stands on one level`);
    assert.ok(slot.row + slot.size <= 6 || slot.row >= 7, 'nothing on the slope');
  });
  assert.equal(site.blocks, 9, 'the terrace with the facilities 4 blocks, the other 5');
  assert.equal(site.facilities.filter((f) => f === 'market').length, 1, 'one market for the estate');
  assert.equal(site.facilities.filter((f) => f === 'centre').length, 1, 'one community centre');
  assert.ok(site.facilities.includes('sports'), 'eight blocks between them: a ball court');
  // a cliff with no slope tile between: still no block across it
  const cliff = estates.planHousingEstateSite({ row: 0, col: 0, rows: 12, cols: 10 }, 'public', 2, () => true, () => false, heightOf);
  cliff.slots.forEach((slot) => {
    const heights = new Set();
    for (let r = 0; r < slot.size; r++) heights.add(heightOf(slot.row + r));
    assert.equal(heights.size, 1, `${slot.kind} at ${slot.row}`);
  });
  // the slopes inside the site are planted with the landscaping
  assert.match(source('housing-estates.js'), /greenSlopes: housingEstateSlopeTiles\(rect\),/);
  assert.match(source('housing-estates.js'), /placeTree\(scene, row, col, \{ planted: true, spend: false \}\);/);
});

test('同邨同款: one design an estate, estates in turn on the design fewest have, never by year; saves keep only what makes sense', () => {
  // (Norton, 2026-11-24: 唔好分年份 - few cities reach the 1990s, and by era a city would be all one design)
  const used = [];
  for (let i = 0; i < 6; i++) used.push(estates.chooseHousingEstateModels('public', used, i).block3);
  assert.deepEqual([...new Set(used.slice(0, 3))].sort(), [...estates.HOUSING_ESTATE_DESIGNS.public].sort(), 'the first three estates, three designs');
  assert.deepEqual([...new Set(used)].length, 3);
  assert.ok(estates.HOUSING_ESTATE_DESIGNS.public.every((d) => used.filter((u) => u === d).length === 2), 'six estates, two of each');
  const courts = [];
  for (let i = 0; i < 4; i++) courts.push(estates.chooseHousingEstateModels('hos', courts, i).block4);
  assert.equal(courts.filter((d) => d === 'residential3-07-M-MD').length, 2);
  assert.equal(estates.chooseHousingEstateModels('hos', []).block3, 'residential3-14-M-MD');
  assert.doesNotMatch(source('housing-estates.js'), /city\.year/);
  const kept = estates.normalizeHousingEstates({
    good: { type: 'public', slots: [{ kind: 'block', row: 1, col: 1, size: 3, label: 'A' }], density: 2 },
    badType: { type: 'private', slots: [{ kind: 'block', row: 1, col: 1, size: 3 }] },
    offMap: { type: 'hos', slots: [{ kind: 'block', row: 98, col: 1, size: 3 }] },
  }, 100, 100);
  assert.deepEqual(Object.keys(kept), ['good']);
  assert.equal(estates.nameHousingEstate('public', 5).name.endsWith('邨'), true);
  assert.equal(estates.nameHousingEstate('hos', 5).name.endsWith('苑'), true);
});

test('第 1 章 has private homes only (Norton, 2026-11-24)', () => {
  const types = require('../housing-types.js');
  assert.equal(types.isHousingTypeAvailable('public', { chapterId: 'ch01' }), false);
  assert.equal(types.isHousingTypeAvailable('hos', { chapterId: 'ch01' }), false);
  assert.equal(types.isHousingTypeAvailable('private', { chapterId: 'ch01' }), true);
  assert.equal(types.isHousingTypeAvailable('public', { chapterId: 'ch02' }), true);
  assert.equal(types.isHousingTypeAvailable('public', null), true);
  // the zone tool, the desktop menu and the phone list all go by it
  assert.match(source('tools.js'), /housingType = zoneType === ZONE_RES && typeof getAvailableHousingType === 'function' \? getAvailableHousingType\(housingType\)/);
  assert.match(source('tool-menu.js'), /if \(typeof isHousingTypeAvailable === 'function' && !isHousingTypeAvailable\(type\)\) \{\s*btn\.disabled = true;/);
  assert.match(source('mobile-ui.js'), /!isHousingTypeAvailable\(type\) \? ' disabled' : ''/);
});

test('the game plans on zoning, grows a block at a time in the estate\'s design, and keeps other growth off its land', () => {
  assert.match(source('main.js'), /if \(housingType !== 'private'\) createHousingEstateFromZoning\(scene, r1, c1, r2, c2, housingType\);/);
  assert.match(source('tool-actions.js'), /createHousingEstateFromZoning\(scene, draft\.start\.row, draft\.start\.col, draft\.end\.row, draft\.end\.col, housingType\);/);
  const growth = source('sim-growth.js');
  assert.match(growth, /if \(typeof growHousingEstates === 'function'\) step\('housingEstates', \(\) => growHousingEstates\(scene\)\);/);
  assert.match(growth, /if \(isEstateLotHeld\(id\) \|\| inHousingEstate\) return;/);
  assert.match(growth, /if \(!estateSlot && typeof isHousingEstateTile === 'function' && isHousingEstateTile\(rr, cc\)\) return false;/);
  assert.match(growth, /override\.forceModelFile = housingEstateModelFor\(hit\.estate, hit\.slot\);/);
  assert.match(growth, /const model = getForcedHouseModel\(setKey, footprintSize, optionsOverride\.forceModelFile\)/);
  assert.match(source('tools.js'), /if \(!options\.free && !spendBudget\(quote\.cost\)\) \{/);
  assert.match(source('inspect-panel.js'), /html \+= buildHousingEstateInspectHtml\(row, col\);/);
  assert.match(source('save.js'), /city\.housingEstates = normalizeHousingEstates\(city\.housingEstates, MAP_WIDTH, MAP_HEIGHT\);/);
  assert.match(source('city-state.js'), /housingEstates: \{\},\s*housingGapMonths: \{\},/);
  assert.match(source('index.html'), /<script src="housing-types\.js"><\/script>\s*<script src="housing-estates\.js"><\/script>/);
});

test('the strings in three languages, and chapter 5 tells how an estate is planned', () => {
  const i18n = source('i18n.js');
  for (const key of ['estate.summary', 'estate.growHint', 'estate.toast.planned', 'estate.toast.plannedDue', 'estate.toast.firstBlock',
    'estate.inspect.blocks', 'estate.inspect.openSpace', 'estate.inspect.facilityBuild', 'estate.inspect.facilityWaiting',
    'estate.tip.title', 'estate.tip.one', 'estate.tip.four', 'estate.tip.ok', 'zone.housingLockedChapter']) {
    assert.equal(i18n.match(new RegExp(`'${key.replace(/\./g, '\\.')}':`, 'g'))?.length, 3, key);
  }
  const { CAMPAIGN_CHAPTER_SPECS } = require('../campaign-chapters.js');
  const lines = CAMPAIGN_CHAPTER_SPECS.ch05.intro.filter((line) => line.speaker === 'secretary').map((line) => line.text.zhHant);
  assert.ok(lines.some((text) => text.includes('房委會起屋邨，係成個邨一齊規劃')));
});

test('the design\'s tables are the planner\'s own', () => {
  const preview = require('../scripts/estate-layout-preview.js');
  const doc = source('docs/public-housing-estate-plan.md');
  for (const [type, density] of [['public', 2], ['public', 3], ['hos', 2]]) {
    assert.ok(doc.includes(preview.table(type, density)), `${type} ${density}`);
  }
});

test('a 公屋邨 of three blocks or more has one 冬菇亭, at the front, its lamps lit at night (Norton, 2026-11-28)', () => {
  let withPavilion = 0;
  for (let W = 3; W <= 14; W++) for (let D = 3; D <= 14; D++) {
    const plan = planHousingEstate(W, D, 'public', 2);
    const pavilions = plan.items.filter((it) => it.variant === 'food_pavilion');
    assert.ok(pavilions.length <= 1, `${W}x${D}: one at most`);
    if (plan.planned < 3) assert.equal(pavilions.length, 0, `${W}x${D}: none under three blocks`);
    if (!pavilions.length) continue;
    withPavilion += 1;
    const [p] = pavilions;
    assert.equal(p.kind, 'park1');
    // the 1x1 open space nearest the front's middle
    const score = (it) => it.row * 10 + Math.abs(it.col + 0.5 - (W - 1) / 2);
    const best = Math.min(...plan.items.filter((it) => it.kind === 'park1').map(score));
    assert.equal(score(p), best, `${W}x${D}`);
    assert.ok(!planHousingEstate(W, D, 'hos', 2).items.some((it) => it.variant === 'food_pavilion'), `${W}x${D}: not 居屋`);
  }
  assert.ok(withPavilion > 20, `most public estates have one (${withPavilion})`);
  // its art: a power of two, 512 square; an estate option, kept out of the park menus; three lamps
  const png = fs.readFileSync(path.join(ROOT, 'Models/parks/park1x1/foodPavilion1-01.png'));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [512, 512]);
  assert.match(source('constants.js'), /park_small_food_pavilion: \{[\s\S]*?path: 'Models\/parks\/park1x1\/foodPavilion1-01\.png'/);
  assert.match(source('main.js'), /id: 'food_pavilion',[\s\S]*?estateOnly: true/);
  assert.match(source('tool-actions.js'), /PARK_OPTIONS\.filter\(\(opt\) => !opt\.estateOnly\)/);
  const lighting = source('building-lighting.js');
  const profile = lighting.slice(lighting.indexOf('park_small_food_pavilion:'), lighting.indexOf('park_small_playground:'));
  assert.equal((profile.match(/\{ x: /g) || []).length, 3);
  assert.match(profile, /sourcePixels: true/);
});
