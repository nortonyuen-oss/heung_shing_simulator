// Night art for the v6.0 renders (2026-11-22): traced window masks and lamps in the art's own pixels, and
// the cruise ship's lights and wake.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const bl = require('../building-lighting.js');

// the art each profile lights, by its key (community_centre_2x2 is a sprite key; the rest are file names)
const ART = {
  community_centre_2x2: 'Models/government/2x2/communityCentre2-01.png',
  'walledCityPark4-01': 'Models/specialSites/4x4/walledCityPark4-01.png',
  'wetlandPark4-01': 'Models/specialSites/4x4/wetlandPark4-01.png',
  'cruiseTerminal6-01': 'Models/specialSites/6x6/cruiseTerminal6-01.png',
  'cruiseTerminal6-01_m': 'Models/specialSites/6x6/cruiseTerminal6-01_m.png',
  'cruiseTerminal6-01_back': 'Models/specialSites/6x6/cruiseTerminal6-01_back.png',
  'cruiseTerminal6-01_back_m': 'Models/specialSites/6x6/cruiseTerminal6-01_back_m.png',
  'racecourse6-01a': 'Models/specialSites/6x6/racecourse6-01a.png',
  'racecourse6-01a_m': 'Models/specialSites/6x6/racecourse6-01a_m.png',
  'racecourse6-01b': 'Models/specialSites/6x6/racecourse6-01b.png',
  'racecourse6-01b_m': 'Models/specialSites/6x6/racecourse6-01b_m.png',
};

async function size(file) {
  const sharp = require('sharp');
  const meta = await sharp(path.join(ROOT, file)).metadata();
  return [meta.width, meta.height];
}

test('every v6.0 render has a night profile: a traced window mask the size of its art, lamps on the art', async () => {
  for (const [key, art] of Object.entries(ART)) {
    const profile = bl.BUILDING_LIGHT_HERO_PROFILES[key];
    assert.ok(profile, `${key} has a profile`);
    assert.equal(profile.sourcePixels, true, `${key} is in the art's own pixels`);
    assert.ok(profile.windowMask && fs.existsSync(path.join(ROOT, profile.windowMask)), `${key}: ${profile.windowMask}`);
    const [w, h] = await size(art);
    assert.deepEqual(await size(profile.windowMask), [w, h], `${key}: the mask matches its art`);
    assert.ok(profile.lamps.length > 0, `${key} has lamps`);
    profile.lamps.forEach((l) => assert.ok(l.x >= 0 && l.x < w && l.y >= 0 && l.y < h && l.r >= 8, `${key}: lamp ${JSON.stringify(l)} on the art`));
  }
  // the community centre lights its own windows now, not the library's it stood on
  assert.notEqual(bl.BUILDING_LIGHT_HERO_PROFILES.community_centre_2x2, bl.BUILDING_LIGHT_HERO_PROFILES.library_2x2);
});

test('a mirrored view is the drawn one flipped: its mask and its lamps', async () => {
  const sharp = require('sharp');
  for (const [mirror, drawn] of [['cruiseTerminal6-01', 'cruiseTerminal6-01_m'], ['racecourse6-01a_m', 'racecourse6-01a']]) {
    const a = await sharp(path.join(ROOT, bl.BUILDING_LIGHT_HERO_PROFILES[mirror].windowMask)).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(path.join(ROOT, bl.BUILDING_LIGHT_HERO_PROFILES[drawn].windowMask)).raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: c } = a.info;
    let same = true;
    for (let y = 0; y < h && same; y += 7) for (let x = 0; x < w; x += 5) {
      const i = (y * w + x) * c; const j = (y * w + (w - 1 - x)) * c;
      if (a.data[i + 3] !== b.data[j + 3]) { same = false; break; }
    }
    assert.ok(same, `${mirror} mask is ${drawn}'s flipped`);
    const width = a.info.width;
    bl.BUILDING_LIGHT_HERO_PROFILES[mirror].lamps.forEach((l, i) => {
      assert.equal(l.x, width - 1 - bl.BUILDING_LIGHT_HERO_PROFILES[drawn].lamps[i].x);
    });
  }
});

test('the live glow never reads art pixels as texture fractions: such a model shows the minimal glow', () => {
  const minimal = bl.BUILDING_LIGHT_MINIMAL_PROFILE;
  assert.equal(bl.resolveBuildingLightProfile({ type: 'wetland_park' }, 'wetland_park_4x4', 'wetlandPark4-01'), minimal);
  assert.equal(bl.resolveBuildingLightProfile({ type: 'community_centre' }, 'community_centre_2x2', null), minimal);
});

test('the bake maps art pixels onto the packaged texture and lights traced windows as wholes', () => {
  const bake = source('scripts/bake-night-textures.js');
  assert.match(bake, /resize: longest > max \? max \/ longest : 1,\s*offsetX: \(entry\.padding\?\.left \|\| 0\) - \(entry\.trim\?\.left \|\| 0\),/);
  assert.match(bake, /const profile = profiles\[slug\]\.sourcePixels \? stagedSourcePixelProfile\(profiles\[slug\], entry\) : profiles\[slug\];/);
  assert.match(bake, /const windowIds = profiles\[slug\]\.windowMask \? await stagedWindowIds\(profiles\[slug\], entry\) : null;/);
  // the game maps a source pixel the same way
  assert.match(source('model-assets.js'), /resize: longest > maxDimension \? maxDimension \/ longest : 1,\s*offsetX: entry\.padding\.left - entry\.trim\.left,/);
});

test('the cruise ship has its lights for every heading, darkens at night and leaves a wake', () => {
  for (const heading of ['SE', 'NE', 'SW', 'NW']) {
    assert.ok(fs.existsSync(path.join(ROOT, `Models/specialSites/cruiseShip/cruiseShip-${heading}_lit.png`)), heading);
  }
  const terminal = source('cruise-terminal.js');
  assert.match(terminal, /applyNightPropTint\(scene, rec\.sprite\)/);
  assert.match(terminal, /updateCruiseShipLights\(scene, rec, view, alpha\);/);
  assert.match(terminal, /trackVesselWake\(scene, rec, point\.c, point\.r, CRUISE_TUNING\.shipLengthTiles, rec\.sprite\.visible\);/);
  assert.match(terminal, /fitCruiseShipSprite\(rec\.lights, view, lit\.path\);/);
});
