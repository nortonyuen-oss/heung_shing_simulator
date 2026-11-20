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
    { ch04: 'southIslandLine', ch07: 'lightRail', ch12: 'tramway', ch14: 'kowloonWalledCity', ch16: 'firework02', ch17: 'firework1', ch18: '18DistrictCompleted' },
  );
  assert.equal(campaign.CAMPAIGN_CHAPTER_SPECS.ch12.events.find((event) => event.id === 'birthdayTram').scene, 'UI/campaign/events/singerBirthday.webp');
  scenes.forEach((scene) => assert.ok(exists(scene), scene));
  // the walled city: chapter 14's star and its first film
  assert.equal(campaign.CAMPAIGN_CHAPTER_SPECS.ch14.events.find((event) => event.id === 'filmShoot').scene, 'UI/campaign/events/kowloonWalledCity.webp');
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
    assert.ok(said.has(id), `${id} speaks somewhere`);
  });
  assert.equal(campaign.CAMPAIGN_SPEAKERS.parent, undefined, 'Jayden\'s mum speaks for the parents now');
  const ch06 = campaign.CAMPAIGN_CHAPTER_SPECS.ch06;
  assert.deepEqual(ch06.intro.slice(0, 3).map((line) => line.speaker), ['jaydenMum', 'jayden', 'jaydenMum']);
  assert.equal(ch06.failure[0].speaker, 'jaydenMum');
  assert.ok(fs.readFileSync(path.join(ROOT, 'scripts/prepare-campaign-story-images.js'), 'utf8').includes("'UI/storyBoardGraphics'"));
});

// 2026-11-20: the web build rewrites UI/ paths in scripts to hashed names - all but UI/news/ (forum posts
// keep theirs logical) - so the prologue's letter was a 404 on the web (Norton: 啟動畫面見不到信封既圖).
test('story art: the prologue\'s letter is resolved for the web build, and kept above the dialogue band', () => {
  const prologue = campaign.CAMPAIGN_PROLOGUE;
  assert.equal(prologue.backdrop, 'UI/news/phase0.webp');
  assert.ok(exists(prologue.backdrop));
  assert.equal(prologue.backdropPosition, 'center bottom');
  const build = fs.readFileSync(path.join(ROOT, 'scripts/build-web.js'), 'utf8');
  assert.ok(build.includes("!logical.startsWith('UI/news/')"), 'the build leaves UI/news/ paths to display time');
  const runtime = fs.readFileSync(path.join(ROOT, 'campaign.js'), 'utf8');
  assert.match(runtime, /function campaignImageSrc\(path\) \{\s*return typeof resolveBundledAssetPath === 'function' \? resolveBundledAssetPath\(path\) : path;/);
  assert.ok(runtime.includes('url("${encodeURI(campaignImageSrc(image))}")'), 'the backdrop goes through campaignImageSrc');
  assert.ok(runtime.includes('src="${escapeHtml(campaignImageSrc(speaker.portrait))}"'), 'so do the portraits');
  assert.ok(runtime.includes('backdropPosition: CAMPAIGN_PROLOGUE.backdropPosition'));
});

// 2026-11-20 (Norton: 手機玩教學擋住主畫面): on the touch UI the panel docks under the ticker with the
// objectives folded, and the steps that point at the desktop's left toolbar or top bar say where
// the phone keeps them.
test('story art: the tutorial speaks to a phone, and lights the phone\'s own buttons', () => {
  const tutorials = [...new Set(specs.map((spec) => spec.tutorial).filter(Boolean))];
  const steps = tutorials.flat();
  const desktopOnly = /左邊|上面|on the left|at the top|左の|上の/;
  steps.filter((step) => Object.values(step.text).some((text) => desktopOnly.test(text))).forEach((step) => {
    assert.ok(step.touchText, `${step.id} has words for a phone`);
    ['zhHant', 'en', 'ja'].forEach((lang) => {
      assert.ok(step.touchText[lang], `${step.id} touchText in ${lang}`);
      assert.doesNotMatch(step.touchText[lang], desktopOnly, `${step.id} touchText in ${lang}`);
    });
  });
  assert.deepEqual(steps.filter((step) => step.touchText).map((step) => step.id), ['road', 'budget', 'promenade']);
  // what the touch highlight lights must exist in the touch UI
  const mobile = fs.readFileSync(path.join(ROOT, 'mobile-ui.js'), 'utf8');
  ['id="mobile-nav-toggle"', 'id="mobile-nav"', 'data-mobile-page="${page}"', "['build',", "['manage',",
    'data-mobile-category="${button.dataset.toolCategory}"', 'data-mobile-tool="${tool}"', 'data-mobile-native="${key}"', "['finance', 'budget.label'"]
    .forEach((needle) => assert.ok(mobile.includes(needle), needle));
  const runtime = fs.readFileSync(path.join(ROOT, 'campaign.js'), 'utf8');
  assert.ok(runtime.includes('setTutorialHighlight(touch ? touchTutorialHighlight(highlight) : highlight)'));
  assert.ok(runtime.includes('touch && step.touchText ? step.touchText : step.text'));
  assert.match(runtime, /#campaign-panel\.is-touch \{ top: calc\(var\(--mobile-top, 44px\) \+ var\(--mobile-ticker, 24px\)/);
});

// v6.0.3 on a phone held upright (Norton: 完成一個chapter，然後按不下去): the portrait layout's
// display: grid !important beat the inline display: none, so the box stayed up after its last line
// (any dialogue not ending on a card: the outros, the events, the failure), its listener gone and
// the game running again. The box is hidden by the hidden attribute too, and !important skips it.
test('story art: a dialogue box closes on a phone held upright', () => {
  const runtime = fs.readFileSync(path.join(ROOT, 'campaign.js'), 'utf8');
  assert.match(runtime, /function showDialogueBox\(box, shown\) \{\s*box\.hidden = !shown;\s*box\.style\.display = shown \? 'flex' : 'none';/);
  assert.doesNotMatch(runtime, /box\.style\.display = '(none|flex)'/, 'every show and hide goes through showDialogueBox');
  assert.ok(runtime.includes("box.removeEventListener('click', next);\n        showDialogueBox(box, false);"));
  assert.ok(runtime.includes('#campaign-dialogue[hidden] { display: none !important; }'));
  // every !important display rule on the box leaves a hidden box alone
  (runtime.match(/#campaign-dialogue[^{]*\{[^}]*display:\s*[a-z-]+\s*!important/g) || [])
    .filter((rule) => !rule.startsWith('#campaign-dialogue[hidden]'))
    .forEach((rule) => assert.match(rule, /:not\(\[hidden\]\)/, rule));
});

// 2026-11-21 (Norton: 手機版啲數字堆埋一齊): on a phone the chapter map's 18 pins pile up; the map
// becomes an overview of dots and the chapters a grid of buttons, the desktop unchanged.
test('story art: the chapter map on a phone is a grid of chapters under a map of dots', () => {
  const runtime = fs.readFileSync(path.join(ROOT, 'campaign.js'), 'utf8');
  assert.ok(runtime.includes('<div class="cs-grid" role="group"'));
  assert.ok(runtime.includes('class="cs-chip is-${state.key}'));
  assert.ok(runtime.includes('#campaign-select-dialog .cs-grid { display: none; }'), 'no grid on the desktop');
  assert.match(runtime, /@media \(max-width: 640px\), \(max-height: 520px\) \{\s*#campaign-select-dialog \.cs-map img/);
  assert.match(runtime, /#campaign-select-dialog \.cs-pin \{ width: 12px; height: 12px;[^}]*pointer-events: none;/);
  assert.ok(fs.readFileSync(path.join(ROOT, 'mobile-ui.css'), 'utf8').includes('button:not(.setup-overview-marker):not(.cs-pin)'),
    'the touch rule that makes dialog buttons 44px tall leaves the map dots alone');
});

// 2026-11-21 (Norton: 手機版查看唔到勳章，亦唔可以旋轉地圖): the desktop opens the medals from its top bar
// and turns the map from the minimap's corners - the touch UI hides both.
test('story art: a phone opens the medals and turns the map', () => {
  const mobile = fs.readFileSync(path.join(ROOT, 'mobile-ui.js'), 'utf8');
  assert.ok(mobile.includes('<button type="button" id="mobile-rotate-ccw"'));
  assert.ok(mobile.includes('<button type="button" id="mobile-rotate-cw"'));
  assert.ok(mobile.indexOf('class="m-rotate"') < mobile.indexOf('<section class="m-panel"'), 'an open panel covers the buttons');
  assert.ok(mobile.includes("rotateMap(activeScene, button.id === 'mobile-rotate-cw' ? 1 : -1)"));
  assert.ok(mobile.includes(`mobileRow('data-mobile-dialog="open-medal-cabinet"'`), 'in 管理');
  assert.ok(mobile.includes("['open-medal-cabinet', 'menu.medalCabinet', '🏵']"), 'in 更多');
  assert.ok(fs.readFileSync(path.join(ROOT, 'topbar.js'), 'utf8').includes("case 'open-medal-cabinet':"));
  const css = fs.readFileSync(path.join(ROOT, 'mobile-ui.css'), 'utf8');
  assert.match(css, /#mobile-ui:is\(\.is-building, \.is-picking-route\) \.m-rotate, \[data-ui-profile="touch"\] #mobile-ui:has\(#mobile-panel:not\(\[hidden\]\)\) \.m-rotate \{ display: none; \}/);
});
