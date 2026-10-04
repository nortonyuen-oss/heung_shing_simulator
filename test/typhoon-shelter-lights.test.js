const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
require('../typhoon-shelter-assets.js');
const {
  getTyphoonShelterRecordLight, updateTyphoonShelterLights, TYPHOON_SHELTER_LIGHT_ANCHORS,
  getTyphoonShelterSpriteTexturePoint,
} = require('../typhoon-shelter-sprites.js');

// applyNightObjectTint and applyNightPropTint (day-night-lighting.js), lifted out of the browser
// script as night-texture-scale.test.js does.
const source = fs.readFileSync(path.join(__dirname, '..', 'day-night-lighting.js'), 'utf8');
const lift = (name) => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\n}\n', start) + 3);
};
const NIGHT = 0x404870;
// eslint-disable-next-line no-new-func
const { applyNightObjectTint } = new Function(
  'NIGHT_OBJECT_TINT', 'NIGHT_BUILDING_DARKNESS_SHARE', 'NIGHT_BAKED_DEEP_SHARE', 'BUILDING_NIGHT_SWAP_AT',
  'BUILDING_BAKED_DIM', 'BUILDING_BAKED_TINT', 'applyNightBuildingTint',
  `${lift('applyNightObjectTint')}${lift('applyNightPropTint')}; return { applyNightObjectTint };`,
)(NIGHT, 0.5, 0.5, 0.3, 0.5, 0x808080, () => {});

const sprite = (visible = true) => ({
  visible, tint: null, x: 0, y: 0, active: true, alpha: 1,
  setTint(t) { this.tint = t; }, clearTint() { this.tint = null; },
  setVisible(v) { this.visible = v; }, setAlpha(a) { this.alpha = a; },
});

test('after dark the map clutter and the shelter works darken with the other props', () => {
  const debris = sprite();
  const offscreen = sprite(false);
  const works = sprite();
  const preview = sprite();
  preview.tint = 0x88ff88;
  const scene = {
    nightRawAlpha: 0.8,
    nightDeepDepth: 0,
    debrisSprites: new Map([['1:1', debris], ['1:2', offscreen]]),
    typhoonShelterObjects: new Map([['a', { sprite: works }], ['b', { sprite: preview, tint: 0x88ff88 }]]),
  };
  applyNightObjectTint(scene, 1);
  assert.equal(debris.tint, NIGHT);
  assert.equal(works.tint, NIGHT);
  assert.equal(offscreen.__nightTintDirty, 'prop', 'tinted when the viewport cull shows it');
  assert.equal(preview.tint, 0x88ff88, 'a preview keeps its own tint');
  // and back to full colour by day
  scene.nightRawAlpha = 0;
  applyNightObjectTint(scene, 0);
  assert.equal(debris.tint, null);
  assert.equal(works.tint, null);
});

test('the promenade lamps light with the street lamps; the entrance heads flash', () => {
  assert.equal(getTyphoonShelterRecordLight({ objectId: 'promenadeLamp' }), 'lamp');
  assert.equal(getTyphoonShelterRecordLight({ objectId: 'causeway2', light: 'beacon:green' }), 'beacon:green');
  assert.equal(getTyphoonShelterRecordLight({ objectId: 'quayDeck' }), null);
  const lamp = { light: 'lamp', drawable: true, sprite: sprite(), lightSprite: sprite(false) };
  const head = { light: 'beacon:red', drawable: true, sprite: sprite(), lightSprite: sprite(false), lightPhase: 0 };
  const hidden = { light: 'lamp', drawable: true, sprite: sprite(false), lightSprite: sprite(false) };
  const scene = { typhoonShelterLights: new Set([lamp, head, hidden]) };
  let lit = false;
  let strength = 0;
  globalThis.streetLampsShouldBeLit = () => lit;
  globalThis.getRuntimeBuildingLightStrength = () => strength;
  try {
    updateTyphoonShelterLights(scene, 600);
    assert.equal(lamp.lightSprite.visible, false, 'dark by day');
    assert.equal(head.lightSprite.visible, false);
    lit = true;
    strength = 1;
    updateTyphoonShelterLights(scene, 600); // a quarter of the way into its flash: full on
    assert.equal(lamp.lightSprite.visible, true);
    assert.equal(hidden.lightSprite.visible, false, 'only over a lamp that is drawn');
    assert.equal(head.lightSprite.visible, true);
    assert.ok(head.lightSprite.alpha > 0.95);
    updateTyphoonShelterLights(scene, 1800); // three quarters: off
    assert.ok(head.lightSprite.alpha < 0.1);
  } finally {
    delete globalThis.streetLampsShouldBeLit;
    delete globalThis.getRuntimeBuildingLightStrength;
  }
});

test('the beacon anchors sit on the lighthouse lanterns of the shipped art', async () => {
  for (const [partId, at] of Object.entries(TYPHOON_SHELTER_LIGHT_ANCHORS)) {
    for (const mirrored of [false, true]) {
      const file = path.join(__dirname, '..', 'Models', 'typhoonShelter', `ts_${partId}${mirrored ? '_m' : ''}.png`);
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const x = Math.round(mirrored ? info.width - at[0] : at[0]);
      const y = Math.round(at[1]);
      // the red glass within a few pixels of the anchor
      let red = 0;
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const i = ((y + dy) * info.width + x + dx) * 4;
          if (data[i] > 200 && data[i + 1] < 120 && data[i + 3] > 200) red += 1;
        }
      }
      assert.ok(red >= 8, `${partId}${mirrored ? ' (mirrored)' : ''}: ${red} red pixels at the anchor`);
    }
  }
});

test('on the staged (trimmed, resized) release copy the beacon lands on the lantern too', async (t) => {
  const root = path.join(__dirname, '..', '.data', 'package-assets', 'Models');
  const manifestFile = path.join(root, 'model-assets.json');
  if (!fs.existsSync(manifestFile)) { t.skip('no staged tree'); return; }
  // the manifest mapping from model-assets.js, as the game loads it
  const assets = fs.readFileSync(path.join(__dirname, '..', 'model-assets.js'), 'utf8');
  const take = (name) => {
    const start = assets.indexOf(`function ${name}(`);
    return assets.slice(start, assets.indexOf('\n}\n', start) + 3);
  };
  // eslint-disable-next-line no-new-func
  const api = new Function('modelAssetManifest', `${take('normalizeModelLogicalPath')}${take('getModelTexturePixelMapping')};
    return { normalizeModelLogicalPath, getModelTexturePixelMapping };`)(JSON.parse(fs.readFileSync(manifestFile, 'utf8')));
  Object.assign(globalThis, api, { modelAssetManifest: JSON.parse(fs.readFileSync(manifestFile, 'utf8')) });
  try {
    for (const [partId] of Object.entries(TYPHOON_SHELTER_LIGHT_ANCHORS)) {
      for (const mirrored of [false, true]) {
        const name = `ts_${partId}${mirrored ? '_m' : ''}`;
        const { data, info } = await sharp(path.join(root, 'typhoonShelter', `${name}.webp`))
          .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const scene = { textures: {
          get: () => ({ frames: { __BASE: { width: info.width, height: info.height } },
            get: () => ({ width: info.width, height: info.height }), getSourceImage: () => info }),
          exists: () => true,
        } };
        const choice = { partId, mirrored, texture: `Models/typhoonShelter/${name}.png` };
        const [x, y] = getTyphoonShelterSpriteTexturePoint(scene, choice, name, TYPHOON_SHELTER_LIGHT_ANCHORS[partId])
          .map(Math.round);
        let red = 0;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const i = ((y + dy) * info.width + x + dx) * 4;
            if (data[i] > 180 && data[i + 1] < 130 && data[i + 3] > 200) red += 1;
          }
        }
        assert.ok(red >= 4, `${name}: ${red} red pixels at (${x}, ${y}) of ${info.width}x${info.height}`);
      }
    }
  } finally {
    ['modelAssetManifest', 'normalizeModelLogicalPath', 'getModelTexturePixelMapping'].forEach((k) => delete globalThis[k]);
  }
});

test('boats and buoys ride the swell: a pixel or two, more on a rough sea and for a small hull', () => {
  const { getTyphoonShelterBob } = require('../typhoon-shelter-sprites.js');
  const peak = (opts) => {
    let dy = 0; let roll = 0;
    for (let t = 0; t < 6000; t += 20) {
      const b = getTyphoonShelterBob(t, 10, 10, 0, opts.lengthM);
      dy = Math.max(dy, Math.abs(b.dy)); roll = Math.max(roll, Math.abs(b.roll));
    }
    return { dy, roll };
  };
  globalThis.SEA_FLOW_TIER_CONFIG = { light: { tickMs: 260, ampScale: 1 }, extreme: { tickMs: 100, ampScale: 2 } };
  globalThis.SEA_FLOW_FRAME_COUNT = 8;
  let tier = 'light';
  globalThis.getSeaStateTier = () => tier;
  try {
    const boat = peak({ lengthM: 8 });
    assert.ok(boat.dy > 1 && boat.dy < 1.5, `heave ${boat.dy}`);
    assert.ok(boat.roll > 0.01 && boat.roll < 0.02, `roll ${boat.roll}`);
    assert.ok(peak({ lengthM: 2 }).dy > boat.dy, 'a buoy bobs more than a boat');
    assert.ok(peak({ lengthM: 20 }).dy < boat.dy, 'a big boat less');
    tier = 'extreme';
    assert.ok(peak({ lengthM: 8 }).dy > boat.dy * 1.8, 'a typhoon sea throws them about');
    tier = 'light';
    // the swell runs along the diagonals, as the sea shimmer does: one row on is one frame on
    const a = getTyphoonShelterBob(0, 10, 11, 0);
    const b = getTyphoonShelterBob(0, 11, 10, 0);
    assert.equal(a.dy, b.dy);
    assert.notEqual(getTyphoonShelterBob(0, 10, 10, 0).dy, a.dy);
    globalThis.isSeaFlowEnabled = () => false;
    assert.deepEqual(getTyphoonShelterBob(500, 10, 10, 0), { dy: 0, roll: 0 }, 'still with the sea animation off');
  } finally {
    ['SEA_FLOW_TIER_CONFIG', 'SEA_FLOW_FRAME_COUNT', 'getSeaStateTier', 'isSeaFlowEnabled'].forEach((k) => delete globalThis[k]);
  }
});
