'use strict';

// 市長登記 and 市長日 (Norton 2026-11-20): before 《玩轉18區》 the player gives the mayor a name, a
// birthday and a face from Heung Shing's people (大航海時代4's opening); the mayor then speaks with
// them, and the birthday's month is a night of fireworks over every city.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const campaign = require('../campaign-chapters.js');
const fireworks = require('../festival-fireworks.js');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function councilOfficials() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${read('council-definitions.js')};this.DEFS = COUNCIL_OFFICIAL_DEFS;`, context);
  return context.DEFS;
}

test('mayor: a whole record is kept, anything else is not', () => {
  const { normalizeCampaignMayor } = campaign;
  assert.deepEqual(normalizeCampaignMayor({ name: '  陳   大文 ', birthMonth: 3, birthDay: 14, portrait: 'chanHoNam' }),
    { name: '陳 大文', birthMonth: 3, birthDay: 14, portrait: 'chanHoNam' });
  assert.equal(normalizeCampaignMayor({ name: '一二三四五六七八九十甲乙丙丁', birthMonth: 1, birthDay: 1 }).name, '一二三四五六七八九十甲乙');
  assert.equal(normalizeCampaignMayor({ name: 'a\u0000b\nc', birthMonth: 1, birthDay: 1 }).name, 'ab c');
  assert.equal(normalizeCampaignMayor({ name: 'Leap', birthMonth: 2, birthDay: 29 }).birthDay, 29);
  assert.equal(normalizeCampaignMayor({ name: 'x', birthMonth: 1, birthDay: 1, portrait: '../evil.png' }).portrait, 'mayor');
  [null, 'x', {}, { name: '   ', birthMonth: 1, birthDay: 1 }, { name: 'x', birthMonth: 4, birthDay: 31 },
    { name: 'x', birthMonth: 13, birthDay: 1 }, { name: 'x', birthMonth: 2, birthDay: 30 }, { name: 'x', birthMonth: 6, birthDay: 0 }]
    .forEach((raw) => assert.equal(normalizeCampaignMayor(raw), null, JSON.stringify(raw)));
});

test('mayor: the player profile keeps the mayor, and starts without one', () => {
  assert.equal(campaign.createEmptyCampaignProfile().mayor, null);
  const mayor = { name: 'Norton', birthMonth: 11, birthDay: 20, portrait: 'official:police_head' };
  assert.deepEqual(campaign.normalizeCampaignProfile({ mayor }).mayor, mayor);
  assert.equal(campaign.normalizeCampaignProfile({ mayor: { name: '', birthMonth: 1, birthDay: 1 } }).mayor, null);
  assert.equal(campaign.normalizeCampaignProfile({ prologueSeen: true }).mayor, null, 'a profile from before the 市長登記');
});

test('mayor: every face of Heung Shing but Her Majesty, each picture once', () => {
  const officials = councilOfficials();
  const faces = campaign.getCampaignMayorFaces(officials);
  // Norton's six mayors first (2026-11-21), named the exam board's way; the default mayor among the speakers
  assert.deepEqual(faces.slice(0, 6).map((face) => face.id), ['mayorLook1', 'mayorLook2', 'mayorLook3', 'mayorLook4', 'mayorLook5', 'mayorLook6']);
  const names = faces.slice(0, 6).map((face) => face.name.zhHant);
  assert.deepEqual(names, ['陳一心', '李幼羚', '張思賢', '黃念慈', '何向華', '林英秀']);
  // every given name from the HKEAA's list for the Chinese writing paper
  const examList = ['英秀', '一心', '幼羚', '家寶', '念慈', '思賢', '有容', '向華', '修端', '允行'];
  names.forEach((name) => assert.ok(examList.includes(name.slice(1)), name));
  assert.equal(faces[6].id, 'mayor', 'the default mayor first among the speakers');
  assert.ok(!faces.some((face) => face.id === 'queen' || /queen/i.test(face.portrait)));
  assert.equal(new Set(faces.map((face) => face.portrait)).size, faces.length);
  assert.equal(new Set(faces.map((face) => face.id)).size, faces.length);
  const speakersWithFaces = Object.entries(campaign.CAMPAIGN_SPEAKERS).filter(([id, s]) => s.portrait && id !== 'queen');
  speakersWithFaces.forEach(([, speaker]) => assert.ok(faces.some((face) => face.portrait === speaker.portrait), speaker.portrait));
  officials.forEach((official) => assert.ok(faces.some((face) => face.portrait === official.portrait), official.id));
  assert.ok(faces.some((face) => face.id === 'official:police_head'));
  faces.forEach((face) => {
    assert.ok(fs.existsSync(path.join(ROOT, face.portrait)), face.portrait);
    assert.equal(campaign.normalizeCampaignMayor({ name: 'x', birthMonth: 1, birthDay: 1, portrait: face.id }).portrait, face.id, face.id);
    assert.ok(face.name || face.nameKey, `${face.id} has a name`);
  });
  assert.ok(faces.length >= 30, `${faces.length} faces`);
});

test('mayor: the mayor speaks with the player\'s name and face, and is asked for before the chapters', () => {
  const runtime = read('campaign.js');
  assert.match(runtime, /const mayor = id === 'mayor' \? runtime\.profile\.mayor : null;\s*if \(!mayor\) return speaker;\s*return \{ \.\.\.speaker, name: mayor\.name, portrait: getMayorFace\(mayor\.portrait\)\?\.portrait \|\| speaker\.portrait \};/);
  assert.ok(runtime.includes('const speaker = getSpeaker(id);'), 'renderSpeaker goes through getSpeaker');
  assert.ok(runtime.includes("if (runtime.loaded && !runtime.profile.mayor && !(await openCampaignMayorPanel({ first: true }))) return;"));
  assert.ok(runtime.includes('stored.mayor = stored.mayor || runtime.profile.mayor;'));
  assert.ok(runtime.includes("else if (action === 'mayor') openCampaignMayorPanel().then(renderCampaignSelect);"));
  // shown over the attract-mode title screen, as the cut-scene is (v6.0.1's bug)
  assert.match(read('index.html'), /body\.attract-live > [^{]*:not\(#campaign-mayor\)[^{]*\{/);
});

test('市長日: the birthday month\'s evening, 20:00 to 20:30, called off by the weather', () => {
  const { getMayorDayState } = fireworks;
  const mayor = { name: 'x', birthMonth: 3, birthDay: 14 };
  assert.deepEqual(getMayorDayState({ month: 3, minuteOfDay: 20 * 60, mayor }), { finale: false, cancelled: false });
  assert.deepEqual(getMayorDayState({ month: 3, minuteOfDay: 20 * 60 + 26, mayor }), { finale: true, cancelled: false });
  assert.equal(getMayorDayState({ month: 3, minuteOfDay: 20 * 60 + 30, mayor }), null);
  assert.equal(getMayorDayState({ month: 3, minuteOfDay: 19 * 60 + 59, mayor }), null);
  assert.equal(getMayorDayState({ month: 4, minuteOfDay: 20 * 60, mayor }), null);
  assert.equal(getMayorDayState({ month: 3, minuteOfDay: 20 * 60, mayor: null }), null, 'no mayor registered');
  assert.equal(getMayorDayState({ month: 3, minuteOfDay: 20 * 60, mayor, weather: { typhoonStage: 'signal8' } }).cancelled, true);
  assert.equal(getMayorDayState({ month: 3, minuteOfDay: 20 * 60, mayor, weather: { rainWarning: 'black' } }).cancelled, true);
  assert.ok(read('main.js').includes("if (typeof updateMayorDay === 'function') updateMayorDay(this, time);"));
  const i18n = read('i18n.js');
  assert.equal((i18n.match(/'festival\.notice\.mayorDay': '(?:[^'\\]|\\.)*\{name\}/g) || []).length, 3, 'the notice names the mayor in all three languages');
  assert.equal((i18n.match(/'festival\.toast\.cancelled\.mayorDay':/g) || []).length, 3);
});

// 2026-11-21 (Norton: 市政官員部分，市長名稱和圖片還沒有 hook up with 遊戲玩家設定的市長): the council's 行政長官
// is the player's registered mayor - in the council window, its bills, the newspaper and the fortunes.
test('mayor: the council\'s chief executive is the registered mayor', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${read('council-definitions.js')};this.D = COUNCIL_OFFICIAL_DEFS; this.portrait = getCouncilOfficialPortrait; this.name = getCouncilPlayerMayorName;`, context);
  const chief = context.D.find((d) => d.id === 'chief_executive');
  const treasury = context.D.find((d) => d.id === 'treasury_head');
  assert.equal(context.portrait(chief), 'UI/officials/chiefExecutive.PNG', 'no mayor registered: the default');
  assert.equal(context.name(chief), null);
  context.getPlayerMayor = () => ({ name: '陳一心', portrait: 'UI/campaign/portraits/mayorLook1.webp' });
  assert.equal(context.portrait(chief), 'UI/campaign/portraits/mayorLook1.webp');
  assert.equal(context.name(chief), '陳一心');
  assert.equal(context.portrait(treasury), treasury.portrait, 'only the chief executive');
  assert.equal(context.name(treasury), null);
  const ui = read('council-ui.js');
  assert.ok(ui.includes('city.council?.customNames?.[official.id] || getCouncilPlayerMayorName(official) || t(official.nameKey)'), 'a name given in the council still wins');
  assert.ok(!/\.src = (official|mover)\??\.portrait/.test(ui), 'every council portrait goes through getCouncilOfficialPortrait');
  assert.ok(read('newspaper.js').includes('portraitImg.src = getCouncilOfficialPortrait(official);'));
  assert.ok(read('campaign.js').includes('getPlayerMayor: () => {'));
});
