// 沙田馬場 (racecourse.js): a 6x12 lot drawn as two 6x6 halves that must join at every turn of the map.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const fnSource = (file, name) => {
  const text = source(file);
  const start = text.indexOf(`function ${name}(`);
  return text.slice(start, text.indexOf('\n}\n', start) + 3);
};

function setup() {
  const context = vm.createContext({ MAP_WIDTH: 64, MAP_HEIGHT: 64, TILE_WIDTH: 100, TILE_HEIGHT: 50, ORIGIN_X: 0, mapRotation: 0 });
  vm.runInContext([fnSource('main.js', 'isoToScreen'), fnSource('building-placement.js', 'getBuildingAnchor'), source('racecourse.js')].join('\n'), context);
  return context;
}
const screen = (c, row, col) => vm.runInContext(`isoToScreen(${col}, ${row})`, c);

test('the lot is laid with its long side running up-right on screen, at every turn of the map', () => {
  const c = setup();
  for (let rotation = 0; rotation < 4; rotation++) {
    c.mapRotation = rotation;
    const { footprintCols, footprintRows } = vm.runInContext('getRacecourseFootprint()', c);
    assert.deepEqual([footprintCols, footprintRows].sort((a, b) => a - b), [6, 12]);
    const step = footprintCols > footprintRows ? [0, 1] : [1, 0];
    const a = screen(c, 10, 10);
    const b = screen(c, 10 + step[0], 10 + step[1]);
    assert.ok((b.x - a.x) * (b.y - a.y) < 0, `rotation ${rotation}: the long side runs along a / diagonal`);
  }
});

test('the nearer half shows the front art, mirrored when the long side runs up-left - however it was built', () => {
  const c = setup();
  const art = vm.runInContext('RACECOURSE_ART', c);
  for (let built = 0; built < 4; built++) {
    c.mapRotation = built;
    const { footprintCols, footprintRows } = vm.runInContext('getRacecourseFootprint()', c);
    const halves = vm.runInContext(`getRacecourseHalves(20, 20, ${footprintCols}, ${footprintRows})`, c);
    for (let viewed = 0; viewed < 4; viewed++) {
      c.mapRotation = viewed;
      const [keyA, keyB] = vm.runInContext(`getRacecourseHalfArt(${halves[0]}, ${halves[1]})`, c);
      const anchorA = vm.runInContext(`getBuildingAnchor(${halves[0]}, 6, 6)`, c);
      const anchorB = vm.runInContext(`getBuildingAnchor(${halves[1]}, 6, 6)`, c);
      const [front, back, frontKey, backKey] = anchorA.y > anchorB.y ? [anchorA, anchorB, keyA, keyB] : [anchorB, anchorA, keyB, keyA];
      // the back half's corner is six tiles up the long side from the front half's
      assert.equal(Math.abs(back.x - front.x), 300);
      assert.equal(front.y - back.y, 150);
      const asDrawn = back.x > front.x;
      assert.equal(frontKey, asDrawn ? art.front : art.frontMirror, `built at ${built}, viewed at ${viewed}`);
      assert.equal(backKey, asDrawn ? art.back : art.backMirror, `built at ${built}, viewed at ${viewed}`);
    }
  }
});

test('the four halves join: one fit width, and the back corner six tiles up the long side in picture pixels', async () => {
  const sharp = require('sharp');
  const fit = async (file) => {
    const { data, info } = await sharp(path.join(ROOT, 'Models/specialSites/6x6', file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minX = Infinity; let maxX = -1; let low = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= 20) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); low = Math.max(low, y);
    }
    let sum = 0; let n = 0;
    for (let x = 0; x < info.width; x++) if (data[(low * info.width + x) * 4 + 3] > 20) { sum += x; n++; }
    return { width: maxX - minX + 1, cornerX: sum / n, cornerY: low, height: info.height, imageWidth: info.width };
  };
  for (const suffix of ['', '_m']) {
    const front = await fit(`racecourse6-01a${suffix}.png`);
    const back = await fit(`racecourse6-01b${suffix}.png`);
    assert.equal(front.width, back.width, `racecourse${suffix}: one scale for both halves`);
    // each is placed by its lowest row's middle on its lot's front corner, scaled by its fit width to 600 px:
    // the two pictures then line up where the back corner sits half a fit width along and a quarter up
    const s = 600 / front.width;
    // positions of each picture's top-left in the game, the front corner at (0, 0) and the back one at (+/-300, -150)
    const dir = suffix ? -1 : 1;
    const frontLeft = -front.cornerX * s;
    const backLeft = dir * 300 - back.cornerX * s;
    const frontTop = -front.cornerY * s;
    const backTop = -150 - back.cornerY * s;
    // the cut halves came from one picture: the same picture offsets the fit script recorded
    const offsets = JSON.parse(source('scripts/source-art/artDebt/racecourse-join.json'));
    const expect = offsets[suffix ? 'mirror' : 'plain'];
    assert.ok(Math.abs((backLeft - frontLeft) / s - expect.dx) <= 1.5, `racecourse${suffix}: x joins (${((backLeft - frontLeft) / s).toFixed(1)} vs ${expect.dx})`);
    assert.ok(Math.abs((backTop - frontTop) / s - expect.dy) <= 1.5, `racecourse${suffix}: y joins (${((backTop - frontTop) / s).toFixed(1)} vs ${expect.dy})`);
  }
});

test('wiring: the tool, its 6x12 quote, both halves bulldozed together, the art turned each frame', () => {
  const html = source('index.html');
  assert.ok(html.indexOf('src="racecourse.js"') > html.indexOf('src="cruise-terminal.js"'));
  assert.match(html, /data-tool="racecourse"/);
  assert.match(html, /data-tool="wetland-park"/);
  assert.match(source('tools.js'), /'racecourse':\s+'racecourse'/);
  assert.match(source('tools.js'), /buildingType === 'racecourse'\) \{\s*placeRacecourse\(scene, row, col\);/);
  assert.match(source('tools.js'), /\(\{ footprintCols, footprintRows \} = getRacecourseFootprint\(\)\);/);
  assert.match(source('main.js'), /landmarkType === 'racecourse' && typeof getRacecourseFootprint === 'function'\) return getRacecourseFootprint\(\);/);
  assert.match(source('main.js'), /updateRacecourses\(this\)/);
  assert.match(source('building-placement.js'), /removeRacecoursePartner\(scene, record\.racecoursePartner, options\)/);
  const constants = source('constants.js');
  assert.match(constants, /racecourse:\s+\{ unlockPopulation: 30000, maxCount: 1 \}/);
  assert.match(constants, /if \(buildingType === 'racecourse'\) return \[\.\.\.models, \.\.\.RACECOURSE_HALF_MODELS\];/);
  ['racecourse6-01a.png', 'racecourse6-01b.png', 'racecourse6-01a_m.png', 'racecourse6-01b_m.png'].forEach((file) => {
    assert.ok(fs.existsSync(path.join(ROOT, 'Models/specialSites/6x6', file)), file);
  });
  // chapters 6 and 8 ask for the real buildings now
  const chapters = source('campaign-chapters.js');
  assert.match(chapters, /check: \(s\) => built\(s, 'racecourse'\)/);
  assert.match(chapters, /check: \(s\) => built\(s, 'wetland_park'\)/);
  assert.doesNotMatch(chapters, /暫用大球場代替|暫用旗艦公園代替/);
});
