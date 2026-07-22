const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

test('manual and in-game help document every special build gate', () => {
  const manual = source('docs/user-manual.md');
  const website = source('docs/index.html');
  const i18n = source('i18n.js');
  const required = [
    '社區廟宇', '教堂', '立法會', '大佛', '大型廟宇', '太空館', '貨櫃碼頭',
    '文化中心', '會展中心', '紅磡體育館', '海洋公園', '城超聯主場',
    '股票交易所', '美利樓', '玫瑰園國際機場', '科學園', 'UH 富豪住宅',
    'UH 世界級摩天大樓',
  ];
  required.forEach((label) => assert.match(manual, new RegExp(label)));
  assert.match(website, /id="manual"/);
  assert.match(website, /user-manual\.md/);
  assert.match(i18n, /'dialog\.unlockRules'/);
  assert.match(i18n, /人口 80,000[\s\S]*月收入 \$12,000[\s\S]*月盈餘 \$2,000[\s\S]*經濟 65/);
});

test('discrete infrastructure and science unlocks announce once per save', () => {
  const cityState = source('city-state.js');
  const start = cityState.indexOf('function checkSpecialBuildingUnlockNotices(');
  const end = cityState.indexOf('\nfunction isPolicyAvailable(', start);
  assert.ok(start >= 0 && end > start);

  const announcements = [];
  const context = vm.createContext({
    city: { population: 9999, scienceParkUnlocked: false, acknowledgedLandmarkUnlocks: [] },
    buildingData: {},
    SPECIAL_BUILDING_UNLOCKS: {},
    hasBuildingType: (type) => Object.values(context.buildingData).some((record) => record.type === type),
    isSpecialBuildingUnlocked: () => false,
    isPolicyActive: (id) => id === 'stockExchangeAct' && context.stockActActive,
    isScienceParkIndustrialRecord: (record) => record?.sciencePark === true,
    announceLandmarkUnlockNotice: (type, reason) => announcements.push({ type, reason }),
    stockActActive: false,
  });
  vm.runInContext(cityState.slice(start, end), context);

  vm.runInContext('checkSpecialBuildingUnlockNotices()', context);
  assert.deepEqual(announcements, []);

  context.city.population = 10000;
  vm.runInContext('checkSpecialBuildingUnlockNotices()', context);
  assert.deepEqual(announcements, [{ type: 'legislative_council', reason: 'population' }]);

  context.buildingData['1:1'] = { type: 'legislative_council' };
  context.city.population = 50000;
  context.stockActActive = true;
  vm.runInContext('checkSpecialBuildingUnlockNotices()', context);
  assert.equal(announcements.at(-1).type, 'stock_exchange');

  context.city.scienceParkUnlocked = true;
  vm.runInContext('checkSpecialBuildingUnlockNotices()', context);
  assert.equal(announcements.at(-1).type, 'science_park');
  assert.equal(announcements.at(-1).reason, 'education');

  vm.runInContext('checkSpecialBuildingUnlockNotices()', context);
  assert.equal(announcements.length, 3, 'acknowledged unlocks must not repeat');
});

test('unlock ticker copy names a speaker and matches the forum voice', () => {
  const newspaper = source('newspaper.js');
  const i18n = source('i18n.js');
  assert.match(newspaper, /BUILDING_UNLOCK_SPEAKER_IDS/);
  const speakerMap = newspaper.slice(
    newspaper.indexOf('const BUILDING_UNLOCK_SPEAKER_IDS'),
    newspaper.indexOf('\n});', newspaper.indexOf('const BUILDING_UNLOCK_SPEAKER_IDS')) + 4,
  );
  assert.doesNotMatch(speakerMap, /'(?:chief_executive|treasury_head|police_head|observatory_head|culture_head)'/);
  assert.match(newspaper, /news\.urgent\.buildingUnlocked\.\$\{announcementReason\}/);
  assert.match(i18n, /\{speaker\}表示：「人口終於夠數/);
  assert.match(i18n, /政府唔好又話研究三年先/);
  assert.match(i18n, /議會夠票舉手通過/);
  assert.match(i18n, /討論區花生友未見動工/);
});
