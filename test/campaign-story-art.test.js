'use strict';

// 《玩轉18區》 story art (Norton, 2026-11-20): each chapter opens over its own scene, some stars and
// events over his Event boards, and his NPCs speak in the chapters (scripts/prepare-campaign-story-images.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const campaign = require('../campaign-chapters.js');

const ROOT = path.resolve(__dirname, '..');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const specs = Object.values(campaign.CAMPAIGN_CHAPTER_SPECS);

test('story art: all 18 chapters open over their own scene, written out whole for the web build', () => {
  const source = fs.readFileSync(path.join(ROOT, 'campaign-chapters.js'), 'utf8');
  campaign.CAMPAIGN_CHAPTERS.forEach((chapter) => {
    const scene = campaign.getCampaignChapterScene(chapter.id);
    assert.equal(scene, `UI/campaign/chapters/${chapter.id}.webp`);
    assert.ok(exists(scene), scene);
    assert.ok(source.includes(`'${scene}'`), `${scene} as a literal`);
  });
  assert.equal(campaign.getCampaignChapterScene('ch99'), '');
});

test('story art: the stars\' and events\' scenes are Norton\'s Event boards', () => {
  const scenes = specs.flatMap((spec) => [spec.outroScene, ...(spec.events || []).map((event) => event.scene)]).filter(Boolean);
  assert.deepEqual(
    Object.fromEntries(specs.filter((spec) => spec.outroScene).map((spec) => [spec.id, path.basename(spec.outroScene, '.webp')])),
    { ch04: 'southIslandLine', ch07: 'lightRail', ch12: 'tramway', ch16: 'firework02', ch17: 'firework1', ch18: '18DistrictCompleted' },
  );
  assert.equal(campaign.CAMPAIGN_CHAPTER_SPECS.ch12.events.find((event) => event.id === 'birthdayTram').scene, 'UI/campaign/events/singerBirthday.webp');
  scenes.forEach((scene) => assert.ok(exists(scene), scene));
  // the walled city waits for chapter 14
  assert.ok(exists('UI/campaign/events/kowloonWalledCity.webp'));
  const runtime = fs.readFileSync(path.join(ROOT, 'campaign.js'), 'utf8');
  assert.match(runtime, /playCampaignDialogue\(spec\.intro, \{ backdrop: getCampaignChapterScene\(chapterId\) \|\| false, reveal: true \}\)/);
  assert.match(runtime, /playCampaignDialogue\(spec\.outro, \{ backdrop: spec\.outroScene \|\| false, reveal: true \}\)/);
  assert.match(runtime, /playCampaignDialogue\(event\.lines, \{ backdrop: event\.scene \|\| false, reveal: true \}\)/);
});

test('story art: Norton\'s NPCs have their faces and lines', () => {
  const npcs = ['minibus', 'scientist', 'foodie', 'railFan', 'busFan', 'jaydenMum', 'jayden', 'police', 'uncleBus', 'villager',
    'commentator', 'chanHoNam', 'playboy', 'mkGirl', 'singh', 'goddess', 'bankGirl', 'tycoon', 'barber', 'filmStar'];
  const said = new Set(specs.flatMap((spec) => [...spec.intro, ...spec.outro, ...spec.failure, ...(spec.events || []).flatMap((event) => event.lines)])
    .map((line) => line.speaker).filter(Boolean));
  npcs.forEach((id) => {
    const speaker = campaign.CAMPAIGN_SPEAKERS[id];
    assert.ok(speaker, id);
    assert.equal(speaker.portrait, `UI/campaign/portraits/${id}.webp`);
    assert.ok(exists(speaker.portrait), speaker.portrait);
    ['zhHant', 'en', 'ja'].forEach((lang) => assert.ok(speaker.name[lang], `${id} in ${lang}`));
    // 古大樂 waits for chapter 14's film shoot
    if (id !== 'filmStar') assert.ok(said.has(id), `${id} speaks somewhere`);
  });
  assert.equal(campaign.CAMPAIGN_SPEAKERS.parent, undefined, 'Jayden\'s mum speaks for the parents now');
  const ch06 = campaign.CAMPAIGN_CHAPTER_SPECS.ch06;
  assert.deepEqual(ch06.intro.slice(0, 3).map((line) => line.speaker), ['jaydenMum', 'jayden', 'jaydenMum']);
  assert.equal(ch06.failure[0].speaker, 'jaydenMum');
  assert.ok(fs.readFileSync(path.join(ROOT, 'scripts/prepare-campaign-story-images.js'), 'utf8').includes("'UI/storyBoardGraphics'"));
});
