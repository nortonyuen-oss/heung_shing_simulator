const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TYPHOON_SHELTER_PARTS,
  TYPHOON_SHELTER_SOURCE_DIR,
  getTyphoonShelterPartTextures,
  getTyphoonShelterBoatHeadings,
  getTyphoonShelterMissingHeadings,
} = require('../typhoon-shelter-assets.js');
const {
  normalizeSeaLightProfile,
  mirrorSeaLightProfile,
  isSeaLightProfileEmpty,
  renderSeaNightPixels,
} = require('../sea-lighting.js');

const ROOT = path.resolve(__dirname, '..');
const pngSize = (file) => {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};
const isPow2 = (v) => v > 0 && (v & (v - 1)) === 0;

test('every part has a unique id and a crop inside its source sheet', () => {
  const ids = new Set();
  for (const p of TYPHOON_SHELTER_PARTS) {
    assert.ok(!ids.has(p.id), `duplicate part id ${p.id}`);
    ids.add(p.id);
    const sheet = path.join(ROOT, TYPHOON_SHELTER_SOURCE_DIR, p.sheet);
    assert.ok(fs.existsSync(sheet), `${p.id}: missing sheet ${p.sheet}`);
    const { width, height } = pngSize(sheet);
    const [x, y, w, h] = p.rect;
    assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height, `${p.id}: rect outside ${width}x${height}`);
  }
});

test('lettered restaurants are never mirrored; everything else is', () => {
  for (const p of TYPHOON_SHELTER_PARTS) {
    assert.equal(p.mirror, !p.id.startsWith('floatingRestaurant'), p.id);
  }
});

test('a bow-on and a stern-on render plus their mirrors give a boat all four headings', () => {
  const headings = getTyphoonShelterBoatHeadings('fishingBoat3');
  assert.deepEqual(headings.se, [{ id: 'fishingBoat3_a', mirrored: false }]);
  assert.deepEqual(headings.sw, [{ id: 'fishingBoat3_a', mirrored: true }]);
  assert.deepEqual(headings.nw, [{ id: 'fishingBoat3_b', mirrored: false }]);
  assert.deepEqual(headings.ne, [{ id: 'fishingBoat3_b', mirrored: true }]);
  assert.deepEqual(getTyphoonShelterMissingHeadings('fishingBoat3'), []);
  assert.deepEqual(getTyphoonShelterMissingHeadings('sanpan1'), ['nw', 'ne']);
});

test('every texture of every part is baked, on a power-of-two canvas', () => {
  for (const p of TYPHOON_SHELTER_PARTS) {
    for (const tex of getTyphoonShelterPartTextures(p)) {
      const file = path.join(ROOT, tex.file);
      assert.ok(fs.existsSync(file), `${tex.file} missing - run npm run bake:typhoon-shelter`);
      const { width, height } = pngSize(file);
      assert.ok(isPow2(width) && isPow2(height), `${tex.file} is ${width}x${height}`);
    }
  }
});

test('sea light profiles are clamped, defaulted and mirrored', () => {
  const p = normalizeSeaLightProfile({
    lamps: [{ x: 1.4, y: -1, r: 9, color: 'nope' }],
    areas: [{ c: [[0.1, 0.2], [0.3, 0.2], [0.3, 0.4]], strength: 3 }],
  });
  assert.deepEqual(p.lamps[0], { x: 1, y: 0, r: 0.6, color: 'warm', reflect: true });
  assert.equal(p.areas[0].strength, 1);
  assert.ok(isSeaLightProfileEmpty(normalizeSeaLightProfile({})));
  const m = mirrorSeaLightProfile({ lamps: [{ x: 0.2, y: 0.5, r: 0.1 }], areas: [{ c: [[0.1, 0.2], [0.3, 0.2], [0.3, 0.4]] }] });
  assert.equal(m.lamps[0].x, 0.8);
  assert.deepEqual(m.areas[0].c[0], [0.9, 0.2]);
});

// A 40x60 test card: an opaque grey hull in the middle (rows 10..39), clear water around it.
function hullCard() {
  const W = 40;
  const H = 60;
  const px = new Uint8Array(W * H * 4);
  for (let y = 10; y < 40; y++) {
    for (let x = 10; x < 30; x++) {
      const i = (y * W + x) * 4;
      px[i] = 160; px[i + 1] = 160; px[i + 2] = 160; px[i + 3] = 255;
    }
  }
  return { W, H, px };
}

test('night with no lights only dims the art and keeps its silhouette', () => {
  const { W, H, px } = hullCard();
  const out = renderSeaNightPixels(px, W, H, { lamps: [], areas: [] });
  for (let i = 0; i < W * H; i++) {
    assert.equal(out[i * 4 + 3], px[i * 4 + 3]);
    if (px[i * 4 + 3]) assert.ok(out[i * 4] < px[i * 4]);
  }
});

test('a reflecting lamp lights the water below the hull, and the two frames twinkle', () => {
  const { W, H, px } = hullCard();
  const profile = { lamps: [{ x: 0.5, y: 0.3, r: 0.4, color: 'fishing', reflect: true }], areas: [] };
  const a = renderSeaNightPixels(px, W, H, profile, { frame: 0 });
  const b = renderSeaNightPixels(px, W, H, profile, { frame: 1 });
  const waterBelow = (out) => {
    let sum = 0;
    for (let y = 40; y < H; y++) for (let x = 0; x < W; x++) sum += out[(y * W + x) * 4 + 3];
    return sum;
  };
  assert.ok(waterBelow(a) > 0, 'reflection drawn on the water');
  assert.notDeepEqual(Array.from(a), Array.from(b));
  // the hull stays fully opaque; nothing is drawn above the waterline outside the lamp's reach
  for (let y = 10; y < 40; y++) for (let x = 10; x < 30; x++) assert.equal(a[(y * W + x) * 4 + 3], 255);
  const off = renderSeaNightPixels(px, W, H, { lamps: [{ ...profile.lamps[0], reflect: false }], areas: [] });
  assert.ok(waterBelow(off) < waterBelow(a));
});

test('a lit area brightens the art under it toward the light colour', () => {
  const { W, H, px } = hullCard();
  const dark = renderSeaNightPixels(px, W, H, { lamps: [], areas: [] });
  const lit = renderSeaNightPixels(px, W, H, {
    lamps: [],
    areas: [{ c: [[0.3, 0.3], [0.7, 0.3], [0.7, 0.5], [0.3, 0.5]], color: 'lantern', strength: 1 }],
  });
  const i = (24 * W + 20) * 4;
  assert.ok(lit[i] > dark[i] + 40, 'red channel lifted');
  assert.ok(lit[i] > lit[i + 2], 'pushed toward the red lantern colour');
});

const {
  TYPHOON_SHELTER_BREAKWATER,
  getTyphoonShelterBreakwaterSegment,
  layoutTyphoonShelterBreakwater,
  getTyphoonShelterBreakwaterTileFit,
} = require('../typhoon-shelter-assets.js');

test('the breakwater kit is measured on the textures the bake writes', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'typhoon-shelter-textures.json'), 'utf8')).textures;
  for (const id of [...Object.keys(TYPHOON_SHELTER_BREAKWATER.segments), ...Object.keys(TYPHOON_SHELTER_BREAKWATER.heads)]) {
    const def = TYPHOON_SHELTER_BREAKWATER.segments[id] || TYPHOON_SHELTER_BREAKWATER.heads[id];
    assert.equal(meta[`ts_${id}`].width, def.width, id);
    assert.ok(meta[`ts_${id}_m`], `${id} needs its mirror for the other diagonal`);
  }
});

test('a section runs on its own diagonal and its mirror on the other', () => {
  assert.equal(getTyphoonShelterBreakwaterSegment('se').mirrored, false);
  assert.equal(getTyphoonShelterBreakwaterSegment('ne').mirrored, true);
  assert.equal(getTyphoonShelterBreakwaterSegment('ne').texture, 'Models/typhoonShelter/ts_causeway1_a_m.png');
  assert.equal(getTyphoonShelterBreakwaterSegment('ne', 'causeway1_b').mirrored, false);
  const m = getTyphoonShelterBreakwaterSegment('sw');
  assert.deepEqual(Object.keys(m.ends).sort(), ['ne', 'sw']);
  assert.equal(m.ends.sw[0], 512 - TYPHOON_SHELTER_BREAKWATER.segments.causeway1_a.ends.se[0]);
});

test('a straight run repeats one section a step apart along its diagonal, heads out past the ends', () => {
  const { pieces, ends } = layoutTyphoonShelterBreakwater({ legs: [{ dir: 'se', count: 4 }], start: 'causeway3_a', end: 'causeway2_a' });
  const segs = pieces.filter((p) => p.kind === 'segment');
  assert.equal(segs.length, 4);
  const step = TYPHOON_SHELTER_BREAKWATER.segments.causeway1_a.step;
  const byX = [...segs].sort((a, b) => a.x - b.x);
  byX.slice(1).forEach((p, i) => {
    assert.equal(p.x - byX[i].x, step);
    assert.equal(p.y - byX[i].y, step / 2);
  });
  // the run starts at the origin; it ends 3 steps plus one deck length along the diagonal
  const { nw, se } = TYPHOON_SHELTER_BREAKWATER.segments.causeway1_a.ends;
  assert.deepEqual(ends.end, [3 * step + se[0] - nw[0], 1.5 * step + se[1] - nw[1]]);
  // back-to-front: the head behind the start first, the head at the near end last
  assert.equal(pieces[0].id, 'causeway3_a');
  assert.equal(pieces[pieces.length - 1].id, 'causeway2_a');
  for (let i = 1; i < pieces.length; i++) assert.ok(pieces[i].center[1] >= pieces[i - 1].center[1]);
  // the end head's back face sits headGap out from the run's end
  const head = pieces[pieces.length - 1];
  const face = TYPHOON_SHELTER_BREAKWATER.heads.causeway2_a.faces.nw;
  const gap = TYPHOON_SHELTER_BREAKWATER.headGap;
  assert.deepEqual([head.x + face[0] * head.scale, head.y + face[1] * head.scale], [ends.end[0] + gap, ends.end[1] + gap / 2]);
});

test('a turn puts a head at the corner and leaves it on the new diagonal', () => {
  const { pieces } = layoutTyphoonShelterBreakwater({ legs: [{ dir: 'se', count: 2 }, { dir: 'ne', count: 2 }] });
  assert.deepEqual(pieces.map((p) => p.kind).filter((k) => k === 'head'), ['head']);
  const second = pieces.filter((p) => p.kind === 'segment' && p.mirrored);
  assert.equal(second.length, 2);
  assert.throws(() => layoutTyphoonShelterBreakwater({ legs: [{ dir: 'se', count: 2 }, { dir: 'nw', count: 1 }] }), /turn 90/);
  assert.throws(() => layoutTyphoonShelterBreakwater({ legs: [{ dir: 'se', count: 0 }] }), /at least one section/);
});

test('fitting the deck to the tile grid gives the sprite scale and the map length of a section', () => {
  const fit = getTyphoonShelterBreakwaterTileFit(100, 1);
  assert.equal(fit.scale, 50 / 48);
  assert.ok(Math.abs(fit.tilesPerSection - (170 * 50 / 48) / 50) < 1e-9);
});

const {
  TYPHOON_SHELTER_OBJECTS,
  getTyphoonShelterScreenFacing,
  getTyphoonShelterFootprint,
  pickTyphoonShelterTexture,
  mirrorTyphoonShelterGroundCorners,
  fitTyphoonShelterGround,
  proposeTyphoonShelterGroundCorners,
} = require('../typhoon-shelter-assets.js');

test('every part belongs to exactly one placeable object, with placement data', () => {
  const placement = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'typhoon-shelter-placement.json'), 'utf8'));
  const owner = new Map();
  for (const o of TYPHOON_SHELTER_OBJECTS) {
    for (const partId of Object.keys(o.parts)) {
      assert.ok(!owner.has(partId), `${partId} in ${owner.get(partId)} and ${o.id}`);
      owner.set(partId, o.id);
      const p = placement.parts[partId];
      assert.ok(p?.ground?.left && p.ground.front && p.ground.right, `${partId} has no ground corners`);
      assert.ok(['se', 'sw', 'nw', 'ne'].includes(p.facing), `${partId} facing`);
    }
  }
  assert.equal(owner.size, TYPHOON_SHELTER_PARTS.length);
});

test('a logical facing turns with the map, one screen diagonal per step', () => {
  assert.deepEqual(['n', 'e', 's', 'w'].map((f) => getTyphoonShelterScreenFacing(f, 0)), ['ne', 'se', 'sw', 'nw']);
  assert.equal(getTyphoonShelterScreenFacing('e', 1), 'sw');
  assert.equal(getTyphoonShelterScreenFacing('e', 3), 'ne');
});

test('footprints lie along the facing', () => {
  assert.deepEqual(getTyphoonShelterFootprint('fishingBoat3', 'e'), { cols: 2, rows: 1, depth: 2, width: 1 });
  assert.deepEqual(getTyphoonShelterFootprint('fishingBoat3', 'n'), { cols: 1, rows: 2, depth: 2, width: 1 });
  assert.deepEqual(getTyphoonShelterFootprint('fishingBoat3', 'n', { depth: 3 }), { cols: 1, rows: 3, depth: 3, width: 1 });
});

test('a boat with bow and stern renders shows the exact view from every side', () => {
  for (const f of ['se', 'sw', 'nw', 'ne']) assert.equal(pickTyphoonShelterTexture('fishingBoat3', f).match, 'exact', f);
  // the pier has only seaward-facing renders: from behind it falls back to the same diagonal
  assert.equal(pickTyphoonShelterTexture('pierSet1', 'nw').match, 'axis');
  // variant spreads equal candidates
  const a = pickTyphoonShelterTexture('pierSet1', 'se', { variant: 0 }).partId;
  const b = pickTyphoonShelterTexture('pierSet1', 'se', { variant: 1 }).partId;
  assert.notEqual(a, b);
});

test('ground fit contains the art in its footprint and centres it', () => {
  // art 200 px left-front, 100 front-right (2:1) into a 2x1 diamond (100 : 50): exact fit
  const corners = { left: [100, 300], front: [300, 400], right: [400, 350] };
  const diamond = { left: [0, 0], front: [100, 50], right: [150, 25] };
  const fit = fitTyphoonShelterGround(corners, diamond);
  assert.equal(fit.scale, 0.5);
  assert.deepEqual([fit.originX, fit.originY, fit.x, fit.y], [250, 325, 75, 12.5]);
  // the centre comes from the front corner, so a side corner found too high does not move it
  const skewed = fitTyphoonShelterGround({ left: [100, 280], front: [300, 400], right: [400, 330] }, diamond);
  assert.deepEqual([skewed.originX, skewed.originY], [250, 325]);
  // a beamier hull (200 : 150) is limited by its beam
  const beamy = fitTyphoonShelterGround({ left: [100, 300], front: [300, 400], right: [450, 325] }, diamond);
  assert.equal(beamy.scale, 50 / 150);
  const m = mirrorTyphoonShelterGroundCorners(corners, 512);
  assert.deepEqual(m, { left: [112, 350], front: [212, 400], right: [412, 300] });
});

test('the outline proposal ignores thin rigging below the hull', () => {
  const W = 60; const H = 40;
  const a = new Uint8Array(W * H);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 50; x++) a[y * W + x] = 255; // hull
  for (let y = 30; y < 38; y++) a[y * W + 55] = 255; // a rope hanging past it, 8 px tall
  const g = proposeTyphoonShelterGroundCorners(a, W, H, { channels: 1 });
  assert.deepEqual(g.left, [10, 29]);
  assert.deepEqual(g.right, [49, 29]);
});

const {
  TYPHOON_SHELTER_REAL_SIZES,
  getTyphoonShelterRealSize,
  measureTyphoonShelterArt,
  getTyphoonShelterTilesForMetres,
} = require('../typhoon-shelter-assets.js');

test('art is measured at 20 m a tile: 2.5 px per metre along an axis, 5 px per metre of height', () => {
  // ground 200 px along se, 60 along sw; art top 150 px above the ground centre
  const ground = { left: [100, 300], front: [300, 400], right: [360, 370] };
  const groundCentreY = 400 - (200 + 60) / 4;
  const byLength = measureTyphoonShelterArt(ground, { lengthM: 24 }, groundCentreY - 150);
  assert.equal(byLength.scale, (24 * 2.5) / 200);
  assert.deepEqual([byLength.seM, byLength.swM, byLength.heightM], [24, 7.2, 9]);
  const byHeight = measureTyphoonShelterArt(ground, { heightM: 3 }, groundCentreY - 150);
  assert.equal(byHeight.scale, (3 * 5) / 150);
  assert.equal(measureTyphoonShelterArt(ground, { heightM: 3 }), null, 'height needs the art top');
});

test('the footprint is the tiles an object really covers', () => {
  assert.deepEqual(getTyphoonShelterTilesForMetres(24, 7), { depth: 2, width: 1 });
  assert.deepEqual(getTyphoonShelterTilesForMetres(21, 7), { depth: 1, width: 1 }, 'a metre over still fits');
  assert.deepEqual(getTyphoonShelterTilesForMetres(76, 34), { depth: 4, width: 2 });
  assert.deepEqual(getTyphoonShelterTilesForMetres(0.6, 0.4), { depth: 1, width: 1 });
});

test('every object has a real size, and calibration overrides it', () => {
  for (const o of TYPHOON_SHELTER_OBJECTS) assert.ok(getTyphoonShelterRealSize(o.id), o.id);
  assert.deepEqual(getTyphoonShelterRealSize('fishingBoat3'), TYPHOON_SHELTER_REAL_SIZES.fishingBoat3);
  assert.deepEqual(getTyphoonShelterRealSize('fishingBoat3', { lengthM: 28 }), { lengthM: 28 });
});

test('a fixed real-size scale only positions the art', () => {
  const corners = { left: [100, 300], front: [300, 400], right: [400, 350] };
  const diamond = { left: [0, 0], front: [100, 50], right: [150, 25] };
  const fit = fitTyphoonShelterGround(corners, diamond, 0.3);
  assert.equal(fit.scale, 0.3);
  assert.deepEqual([fit.x, fit.y], [75, 12.5]);
});

test('art warp: x:y and shear about the front corner, verticals upright, undone exactly', () => {
  const a = require('../typhoon-shelter-assets.js');
  const front = [300, 900];
  const warp = a.normalizeTyphoonShelterWarp({ k: 0.8, s: -0.2 });
  assert.deepEqual(a.warpTyphoonShelterPoint(front, front, warp), front, 'the front corner stays put');
  const top = a.warpTyphoonShelterPoint([300, 500], front, warp);
  assert.equal(top[0], 300, 'a mast stays vertical');
  assert.equal(top[1], 900 - 0.8 * 400);
  // a hull line drawn at slope 0.9 comes out at 0.9 * 0.8 - 0.2 = 0.52
  const [x1, y1] = a.warpTyphoonShelterPoint([200, 810], front, warp);
  assert.ok(Math.abs((900 - y1) / (300 - x1) - 0.52) < 1e-9);
  const back = a.unwarpTyphoonShelterPoint(a.warpTyphoonShelterPoint([123, 456], front, warp), front, warp);
  assert.ok(Math.abs(back[0] - 123) < 1e-9 && Math.abs(back[1] - 456) < 1e-9);
  assert.ok(a.isTyphoonShelterWarpIdentity(undefined));
  assert.ok(a.isTyphoonShelterWarpIdentity({ k: 1, s: 0 }));
  assert.ok(!a.isTyphoonShelterWarpIdentity(warp));
  assert.deepEqual(a.normalizeTyphoonShelterWarp({ k: -3, s: 'x' }), { k: 1, s: 0, h: 0 });
});

test('art warp: left-right skew leans the top, mirrors flip both skews, canvas transform agrees', () => {
  const a = require('../typhoon-shelter-assets.js');
  const front = [300, 900];
  const lean = { h: 0.1 };
  assert.deepEqual(a.warpTyphoonShelterPoint([300, 500], front, lean), [340, 500], '+ leans the top right');
  assert.deepEqual(a.warpTyphoonShelterPoint(front, front, lean), front);
  assert.deepEqual(a.mirrorTyphoonShelterWarp({ k: 0.9, s: 0.2, h: 0.1 }), { k: 0.9, s: -0.2, h: -0.1 });
  const warp = { k: 0.85, s: -0.15, h: 0.12 };
  const box = a.getTyphoonShelterWarpCanvas(512, 1024, front, warp);
  const [A, B, C, D, E, F] = a.getTyphoonShelterWarpTransform(front, warp, box);
  [[0, 0], [512, 0], [0, 1024], [512, 1024], [123, 456]].forEach(([x, y]) => {
    const [X, Y] = a.warpTyphoonShelterPoint([x, y], front, warp);
    assert.ok(Math.abs(A * x + C * y + E - (X + box.dx)) < 1e-9 && Math.abs(B * x + D * y + F - (Y + box.dy)) < 1e-9);
    assert.ok(X + box.dx >= 0 && X + box.dx <= box.width && Y + box.dy >= 0 && Y + box.dy <= box.height, 'on the canvas');
    const back = a.unwarpTyphoonShelterPoint([X, Y], front, warp);
    assert.ok(Math.abs(back[0] - x) < 1e-9 && Math.abs(back[1] - y) < 1e-9);
  });
});

test('calibration keeps the facings judged by eye (verified objects) as the table has them', () => {
  const a = require('../typhoon-shelter-assets.js');
  const placement = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'typhoon-shelter-placement.json'), 'utf8'));
  a.TYPHOON_SHELTER_OBJECTS.filter((o) => o.verified).forEach((o) => {
    Object.entries(o.parts).forEach(([partId, facing]) => {
      const calibrated = placement.parts[partId]?.facing;
      if (facing && calibrated) assert.equal(calibrated, facing, `${partId}: calibrated ${calibrated}, judged ${facing}`);
    });
  });
});
