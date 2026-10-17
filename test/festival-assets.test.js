const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  FESTIVAL_PARTS, FESTIVAL_SOURCE_DIR, FESTIVAL_TEXTURE_DIR, getFestivalPartTextures, getFestivalParts,
  festivalLightStrength, renderFestivalNightPixels, applyFestivalSaturation,
} = require('../festival-assets.js');
const { FESTIVAL_DEFINITIONS_BY_ID } = require('../festivals.js');

const ROOT = path.resolve(__dirname, '..');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'festival-textures.json'), 'utf8'));
const STALL_CALIBRATIONS = require('../data/festival-stall-geometry.json').assets;
const PERFORMER_CALIBRATIONS = require('../data/festival-performer-geometry.json').assets;

// PNG width/height from the IHDR chunk, without decoding
function pngSize(file) {
  const buf = fs.readFileSync(file);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('every part belongs to a festival, has a corrected sheet and a real size', () => {
  const ids = new Set();
  FESTIVAL_PARTS.forEach((p) => {
    assert.ok(!ids.has(p.id), `${p.id} twice`);
    ids.add(p.id);
    assert.ok(FESTIVAL_DEFINITIONS_BY_ID[p.festival], `${p.id}: unknown festival ${p.festival}`);
    assert.ok(fs.existsSync(path.join(ROOT, FESTIVAL_SOURCE_DIR, p.sheet)), `${p.id}: no sheet ${p.sheet}`);
    assert.ok(p.heightM > 0 || p.lengthM > 0, `${p.id}: needs heightM or lengthM`);
    assert.ok(p.saturation > 0 && p.saturation <= 1, `${p.id}: saturation`);
  });
  assert.equal(getFestivalParts('christmas').length, 5);
});

test('the baked textures and their metadata match the parts table', () => {
  const expected = new Set();
  FESTIVAL_PARTS.forEach((p) => {
    getFestivalPartTextures(p).forEach((tex) => {
      const key = path.basename(tex.file, '.png');
      expected.add(key);
      const meta = META.textures[key];
      assert.ok(meta, `${key}: not baked (npm run bake:festivals)`);
      assert.equal(meta.part, p.id);
      assert.equal(meta.mirrored, tex.mirrored);
      const file = path.join(ROOT, tex.file);
      assert.ok(fs.existsSync(file), `${tex.file} missing`);
      const [w, h] = pngSize(file);
      assert.deepEqual([w, h], [meta.width, meta.height], `${key} size`);
      assert.ok(Number.isInteger(Math.log2(w)) && Number.isInteger(Math.log2(h)), `${key}: power-of-two canvas`);
      assert.ok(meta.anchor.x > 0 && meta.anchor.x < w && meta.anchor.y > meta.top && meta.anchor.y <= h, `${key} anchor`);
      assert.equal(!!meta.night, p.lit, `${key}: night frames iff lit`);
      (meta.night || []).forEach((night) => {
        assert.match(night, /__litb?\.png$/, 'night art is __lit*, never __night*');
        assert.deepEqual(pngSize(path.join(ROOT, night)), [w, h], `${night} must match its day texture`);
      });
    });
    if (p.mirror) {
      const a = META.textures[`fx_${p.id}`];
      const m = META.textures[`fx_${p.id}_m`];
      assert.equal(a.anchor.x + m.anchor.x, a.width, `${p.id}: the mirror's anchor is the mirrored anchor`);
    }
  });
  assert.deepEqual(Object.keys(META.textures).sort(), [...expected].sort(), 'no stale textures in the metadata');
  const onDisk = fs.readdirSync(path.join(ROOT, FESTIVAL_TEXTURE_DIR)).filter((f) => /^fx_.*\.png$/.test(f));
  const listed = new Set(Object.values(META.textures).flatMap((t) => [t.file, ...(t.night || [])]).map((f) => path.basename(f)));
  assert.deepEqual(onDisk.filter((f) => !listed.has(f)), [], 'no fx_ files the metadata does not know');
});

test('lights: bright warm or brilliant white pixels; cream walls, reds and greens are not', () => {
  assert.ok(festivalLightStrength(255, 220, 120) > 0.5, 'a warm fairy light');
  assert.ok(festivalLightStrength(255, 255, 250) > 0.5, 'a white bulb');
  assert.equal(festivalLightStrength(235, 225, 205), 0, 'cream wall');
  assert.equal(festivalLightStrength(230, 30, 40), 0, 'red ribbon');
  assert.equal(festivalLightStrength(40, 140, 60), 0, 'green garland');
  assert.equal(festivalLightStrength(120, 110, 90), 0, 'in shade');
});

test('lion performers stand on calibrated feet and the leader retains its full-figure size', () => {
  for (const [id, calibration] of Object.entries(PERFORMER_CALIBRATIONS)) {
    const original = META.textures[`fx_${id}`], mirror = META.textures[`fx_${id}_m`];
    assert.deepEqual(original.anchor, calibration.anchor);
    assert.equal(mirror.anchor.x, original.width - original.anchor.x);
    assert.equal(mirror.anchor.y, original.anchor.y);
    assert.deepEqual([original.width, original.height], [calibration.width, calibration.height]);
    if (calibration.personHeightPx) {
      assert.equal(original.personHeightPx, calibration.personHeightPx);
      assert.equal(mirror.personHeightPx, calibration.personHeightPx);
      assert.ok(calibration.personHeightPx < original.anchor.y - original.top,
        'the decorative pole must not count toward the leader person height');
    }
    if (calibration.heightReference === 'full-silhouette') {
      assert.equal(original.personHeightPx, undefined, 'the staff must count toward the complete leader size');
      assert.equal(mirror.personHeightPx, undefined);
    }
  }
});

test('every Lunar New Year booth has measured source landmarks in both texture orientations', () => {
  const stalls = FESTIVAL_PARTS.filter((p) => p.festival === 'lunarNewYear' && p.category === 'stall');
  assert.equal(stalls.length, 14);
  for (const part of stalls) {
    const calibration = STALL_CALIBRATIONS[part.id];
    assert.ok(calibration, `${part.id}: missing stall calibration`);
    for (const { file } of getFestivalPartTextures(part)) {
      const meta = META.textures[path.basename(file, '.png')];
      assert.deepEqual(meta.stallCalibration, calibration, `${file}: source landmarks must survive rebaking`);
      assert.deepEqual([calibration.width, calibration.height], [meta.width, meta.height]);
    }
    for (const side of ['left', 'front', 'right']) {
      const foot = calibration.feet[side], eave = calibration.eaves[side];
      for (const [x, y] of [foot, eave, calibration.roof.point]) {
        assert.ok(x > 0 && x < calibration.width && y > 0 && y < calibration.height);
      }
      assert.ok(eave[1] < foot[1], `${part.id}/${side}: eaves stand above their support`);
    }
  }
});

test('night art dims what is not lit, keeps the lights and the alpha; frame b twinkles some lights', () => {
  const W = 24;
  const H = 24;
  const day = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const light = i % 2 === 0;
    day.set(light ? [255, 230, 140, 255] : [200, 60, 50, 180], i * 4);
  }
  const a = renderFestivalNightPixels(day, W, H, { frame: 0 });
  const b = renderFestivalNightPixels(day, W, H, { frame: 1 });
  assert.deepEqual([...a.slice(0, 4)], [255, 230, 140, 255], 'a light stays full');
  assert.ok(a[4] < 120 && a[7] === 180, 'the red is dimmed, alpha kept');
  let twinkled = 0;
  for (let i = 0; i < W * H; i += 2) if (b[i * 4] < a[i * 4]) twinkled += 1;
  assert.ok(twinkled > 0 && twinkled < (W * H) / 2, `some, not all, lights twinkle (${twinkled})`);
});

test('saturation tones colour toward grey and leaves 1 alone', () => {
  const px = new Uint8Array([200, 40, 40, 255]);
  applyFestivalSaturation(px, 1);
  assert.deepEqual([...px], [200, 40, 40, 255]);
  applyFestivalSaturation(px, 0);
  assert.equal(px[0], px[1]);
  assert.equal(px[1], px[2]);
});
