// 開局年份 (Norton, 2026-11-28): 第 1 章 starts in 1978, each chapter a year later, the story unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const campaign = require('../campaign-chapters.js');

test('each chapter its own start year, 1978 for the first and a year more each chapter', () => {
  const years = campaign.CAMPAIGN_CHAPTERS.map((chapter) => campaign.getCampaignChapterStartYear(chapter.id));
  assert.equal(years[0], 1978);
  years.forEach((year, i) => assert.equal(year, 1978 + i));
  assert.ok(years.at(-1) <= 1996);
  assert.equal(campaign.getCampaignChapterStartYear('nope'), null);
});

test('a prebuilt start moves whole: every date by the same years, counts and the original left alone', () => {
  const dir = path.join(__dirname, '..', 'UI', 'campaign');
  const files = fs.readdirSync(dir).filter((f) => /^ch\d\d\.json$/.test(f));
  assert.ok(files.length >= 10);
  for (const name of files) {
    const id = name.replace('.json', '');
    const save = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).save_data;
    const before = JSON.stringify(save);
    const delta = campaign.getCampaignChapterStartYear(id) - save.city.year;
    const moved = campaign.shiftCampaignSaveYears(save, delta);
    assert.equal(JSON.stringify(save), before, `${id}: the file's own save is not changed`);
    assert.equal(moved.city.year, campaign.getCampaignChapterStartYear(id), id);
    assert.equal(moved.city.month, save.city.month, `${id}: the month stays`);
    // every month index and year that was a date moved by the same amount
    const monthNow = (s) => s.city.year * 12 + s.city.month - 1;
    assert.equal(monthNow(moved) - monthNow(save), delta * 12);
    if (save.city.council?.lastTimedMonthIndex > 0) assert.equal(moved.city.council.lastTimedMonthIndex - save.city.council.lastTimedMonthIndex, delta * 12, id);
    if (save.city.lastForumMonthIndex > 0) assert.equal(moved.city.lastForumMonthIndex - save.city.lastForumMonthIndex, delta * 12, id);
    (save.city.festivals?.history || []).forEach((entry, i) => {
      assert.equal(moved.city.festivals.history[i].year - entry.year, delta);
      assert.equal(moved.city.festivals.history[i].cost, entry.cost, 'a cost is not a date');
    });
    (save.city.crimeHistory || []).forEach((entry, i) => {
      assert.equal(Number(moved.city.crimeHistory[i].label.slice(0, 4)) - Number(entry.label.slice(0, 4)), delta);
    });
    Object.entries(save.buildingData || {}).forEach(([key, record]) => {
      if (record.builtMonthIndex > 0) assert.equal(moved.buildingData[key].builtMonthIndex - record.builtMonthIndex, delta * 12);
    });
    // unset markers (-1) and counts stay
    assert.equal(moved.city.council?.forumEventState?.cooldownUntilMonthIndex, save.city.council?.forumEventState?.cooldownUntilMonthIndex);
    assert.equal(moved.city.environmentMinutes, save.city.environmentMinutes);
  }
});

test('a fresh chapter asks the new city for its year; old runs are not touched', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'campaign.js'), 'utf8');
  assert.match(src, /exactStartYear: getCampaignChapterStartYear\(chapter\.id\)/);
  assert.match(src, /shiftCampaignSaveYears\(raw, startYear - savedYear\)/);
  const landing = fs.readFileSync(path.join(__dirname, '..', 'landing-screen.js'), 'utf8');
  assert.match(landing, /Number\.isInteger\(options\.exactStartYear\) \? options\.exactStartYear/);
  assert.equal(campaign.shiftCampaignSaveYears({ city: { year: 1900 } }, 0).city.year, 1900);
});
