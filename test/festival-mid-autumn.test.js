const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { findFireDragonLoop, getFireDragonPose, getFireDragonView, applyMidAutumnFullMoon, FIRE_DRAGON_LOOP_TILES } = require('../festival-mid-autumn.js');
const { layoutMidAutumn, getMidAutumnPresence, MID_AUTUMN_TIMES } = require('../festival-venues.js');
const { FESTIVAL_PARTS, getFestivalTextureKey } = require('../festival-assets.js');
const { FESTIVAL_PROGRAMMES, getFestivalEffects, getFestivalPhase } = require('../festivals.js');

const ROOT = path.join(__dirname, '..');

// a grid of streets every 4 rows and 5 columns: blocks of 4 x 3 lots, homes in the ones given
function streetGrid(homeAt) {
  const roadTiles = [];
  for (let row = 0; row <= 12; row++) for (let col = 0; col <= 15; col++) {
    if (row % 4 === 0 || col % 5 === 0) roadTiles.push({ row, col, height: 0 });
  }
  return { roadTiles, homeAgeAt: (row, col) => (row % 4 && col % 5 ? homeAt(row, col) : null) };
}

test('the fire dragon goes round the block with the most (and oldest) homes on its kerbs', () => {
  const loop = findFireDragonLoop(streetGrid((row, col) => (row > 4 && row < 8 && col > 5 && col < 10 ? 300 : null)));
  assert.equal(loop.id, '4:5:5x4');
  assert.ok(loop.tiles.length >= FIRE_DRAGON_LOOP_TILES[0] && loop.tiles.length <= FIRE_DRAGON_LOOP_TILES[1]);
  // a closed walk, one tile at a time, every tile road
  loop.tiles.forEach((t, i) => {
    const next = loop.tiles[(i + 1) % loop.tiles.length];
    assert.equal(Math.abs(t.row - next.row) + Math.abs(t.col - next.col), 1);
    assert.ok(t.row % 4 === 0 || t.col % 5 === 0);
  });
  assert.equal(new Set(loop.tiles.map((t) => `${t.row}:${t.col}`)).size, loop.tiles.length);
  // no homes, or only plain road: nowhere to go
  assert.equal(findFireDragonLoop(streetGrid(() => null)), null);
  assert.equal(findFireDragonLoop({ roadTiles: [], homeAgeAt: () => 100 }), null);
});

test('the dragon walks the loop and shows the picture facing the way it goes', () => {
  const loop = findFireDragonLoop(streetGrid(() => 100));
  const keys = new Set(loop.tiles.map((t) => `${t.row}:${t.col}`));
  for (let s = 0; s < 400; s += 7) {
    const p = getFireDragonPose(loop, s, 'seed');
    // on the centre line between two loop tiles
    const a = `${Math.floor(p.row)}:${Math.floor(p.col)}`;
    const b = `${Math.ceil(p.row)}:${Math.ceil(p.col)}`;
    assert.ok(keys.has(a) && keys.has(b), `${s}: ${p.row},${p.col}`);
    assert.equal(Math.abs(p.dRow) + Math.abs(p.dCol), 1);
  }
  assert.deepEqual(getFireDragonView(10, 5), { partId: 'maFireDragonSE', mirrored: false });
  assert.deepEqual(getFireDragonView(-10, 5), { partId: 'maFireDragonSE', mirrored: true });
  assert.deepEqual(getFireDragonView(10, -5), { partId: 'maFireDragonNE', mirrored: false });
  assert.deepEqual(getFireDragonView(-10, -5), { partId: 'maFireDragonNE', mirrored: true });
});

test('中秋 through the night: lanterns all day, moon-gazers at dusk, the dragon at eight, 煲蠟 and police after midnight', () => {
  const loop = findFireDragonLoop(streetGrid(() => 100));
  const ctx = { parks: [{ id: '20:20', textureKey: 'park_flagship_victoria_module05' }], population: 100000, seed: 'test', tier: 'standard', dragonLoop: loop, isRoad: () => false };
  const at = (minute, extra = {}) => {
    const by = {};
    layoutMidAutumn({ ...ctx, minute, ...extra }).forEach((p) => { by[p.partId] = (by[p.partId] || 0) + 1; });
    return by;
  };
  const day = at(13 * 60);
  assert.equal(day.maJadeRabbitMoon, 1);
  assert.ok(day.maLanternPole > 0);
  assert.ok(!day.maViewerFather && !day.maFireDragonSE && !day.maCandleKids);
  const evening = at(20 * 60 + 30);
  const people = Object.entries(evening).filter(([id]) => id.startsWith('maViewer')).reduce((n, [, k]) => n + k, 0);
  assert.ok(people > 20, `moon-gazers: ${people}`);
  assert.ok(evening.maPicnic > 0);
  assert.equal(evening.maFireDragonSE, 1);
  assert.equal(evening.maFireDragonNE, 1);
  assert.ok(!evening.maPoliceMan && !evening.maCandleKids);
  // a stormy night: the dragon stays in
  assert.ok(!at(20 * 60 + 30, { dragonWeatherBad: true }).maFireDragonSE);
  const late = at(40);
  assert.ok(late.maCandleKids >= 2);
  assert.ok(late.maPoliceMan >= 1 && late.maPoliceWoman >= 1);
  assert.ok(!late.maViewerFather && !late.maPicnic && !late.maFireDragonSE);
  // 煲蠟 grows through the night
  assert.ok((at(22 * 60 + 30).maCandleKids || 0) < late.maCandleKids);
  // nothing at all without a Victoria Park or a block of homes
  assert.deepEqual(layoutMidAutumn({ ...ctx, parks: [], dragonLoop: null, minute: 20 * 60 }), []);
  // the dragon's loop alone is a venue: the route lanterns
  assert.ok(layoutMidAutumn({ ...ctx, parks: [], minute: 19 * 60 }).every((p) => p.partId === 'maLanternPole' && p.mode === 'tile'));
  assert.equal(getMidAutumnPresence(19 * 60 + 10, MID_AUTUMN_TIMES.viewers), 1);
});

test('中秋 programme, money and the full moon', () => {
  assert.ok(FESTIVAL_PROGRAMMES.midAutumn);
  assert.equal(getFestivalPhase('midAutumn', 13 * 60), 'setup');
  assert.equal(getFestivalPhase('midAutumn', 21 * 60), 'peak');
  assert.equal(getFestivalPhase('midAutumn', 2 * 60), 'peak');
  assert.equal(getFestivalPhase('midAutumn', 4 * 60), null);
  assert.deepEqual(getFestivalEffects('midAutumn', 'standard'), { attractiveness: 2, happiness: 0.02 });
  const sky = { sunriseMinutes: 370, sunsetMinutes: 1105, moonPhase: 0.12, moonriseMinutes: 600, moonsetMinutes: 1300 };
  assert.equal(applyMidAutumnFullMoon(sky, false), sky);
  const full = applyMidAutumnFullMoon(sky, true);
  assert.equal(full.moonPhase, 0.5);
  assert.ok(full.moonriseMinutes <= sky.sunsetMinutes && full.moonsetMinutes >= sky.sunriseMinutes);
});

test('every 中秋 part has its art and its baked textures', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/festival-textures.json'), 'utf8')).textures;
  const parts = FESTIVAL_PARTS.filter((p) => p.festival === 'midAutumn');
  assert.ok(parts.length >= 18);
  parts.forEach((p) => {
    assert.ok(fs.existsSync(path.join(ROOT, 'scripts/source-art/festivals', p.sheet)), p.sheet);
    const tex = meta[getFestivalTextureKey(p.id)];
    assert.ok(tex && fs.existsSync(path.join(ROOT, tex.file)), p.id);
    if (p.lit) assert.equal(tex.night?.length, 2, p.id);
  });
});

test('中秋 news: once a year, the first lit evening of the lantern fair, with its own picture', () => {
  const { maybePostMidAutumnStory, MID_AUTUMN_NEWS_IMAGE } = require('../festival-mid-autumn.js');
  const posts = [];
  global.city = { name: '香城', year: 2030, month: 9, forumPosts: [] };
  global.addForumPost = (article, meta) => { posts.push([article, meta]); global.city.forumPosts.push({ id: meta.id }); };
  try {
    const fair = [{ id: 'midAutumn:park:vp', festival: 'midAutumn' }, { id: 'midAutumn:dragon:x', festival: 'midAutumn', fireDragon: {} }];
    maybePostMidAutumnStory({ festivalLit: false }, fair);
    maybePostMidAutumnStory({ festivalLit: true }, [{ id: 'midAutumn:route:1:2:n', festival: 'midAutumn' }]);
    assert.equal(posts.length, 0, 'not by day, not without the fair');
    maybePostMidAutumnStory({ festivalLit: true }, fair);
    maybePostMidAutumnStory({ festivalLit: true }, fair);
    assert.equal(posts.length, 1);
    const [article, meta] = posts[0];
    assert.equal(meta.id, 'midAutumn-2030');
    assert.match(article.headline, /食燈籠、玩月餅/);
    assert.ok(article.body.some((line) => line.includes('火龍')));
    assert.equal(article.image, MID_AUTUMN_NEWS_IMAGE);
    for (const file of [MID_AUTUMN_NEWS_IMAGE, MID_AUTUMN_NEWS_IMAGE.replace('UI/news/', 'UI/news/thumbs/')]) {
      assert.ok(fs.existsSync(path.join(ROOT, file)), file);
    }
  } finally {
    delete global.city;
    delete global.addForumPost;
  }
});
