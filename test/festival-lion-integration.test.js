const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { layoutLunarNewYear } = require('../festival-venues');
const { buildLionDanceRoutes } = require('../festival-lion-dance');
const { FESTIVAL_PARTS_BY_ID } = require('../festival-assets');
const { getFestivalSpriteScale, FESTIVAL_PX_PER_METRE_UP } = require('../festival-sprites');
const { textures } = require('../data/festival-textures.json');

test('the complete leader including its staff stays at 1.7 metres in either texture orientation', () => {
  for (const key of ['fx_lnyLionLeader', 'fx_lnyLionLeader_m']) {
    const meta = textures[key];
    for (const resize of [1, 0.5, 0.25]) {
      const scale = getFestivalSpriteScale(meta, FESTIVAL_PARTS_BY_ID.lnyLionLeader, resize, 1.7);
      const renderedHeight = (meta.anchor.y - meta.top) * resize * scale;
      assert.ok(Math.abs(renderedHeight / FESTIVAL_PX_PER_METRE_UP - 1.7) < 1e-9);
      assert.ok(Math.abs(renderedHeight - 8.5) < 1e-9);
    }
  }
});

test('New Year street troupes replace static mall and temple dancers while preserving incense', () => {
  const lionRoutes = buildLionDanceRoutes({ roadTiles: Array.from({ length: 7 }, (_, col) => ({ row: 10, col: 10 + col, height: 0 })) });
  const ctx = { lionRoutes, tier: 'standard', seed: 'integration',
    temples: [{ id: '2:2', textureKey: 'heritage_temple_2x2' }],
    malls: [{ id: '3:3', modelKey: 'commercialBuilding4-01-H.png' }] };
  for (const phase of ['open', 'peak', 'after']) {
    const placements = layoutLunarNewYear({ ...ctx, phase });
    const actors = placements.filter(p => p.lionDance);
    assert.equal(actors.length, 4);
    assert.ok(actors.every(p => p.mode === 'tile' && !p.buildingId));
    assert.deepEqual(placements.filter(p => p.buildingId).map(p => p.partId), phase === 'peak' ? ['templeIncenseBurner'] : []);
  }
  assert.ok(layoutLunarNewYear({ ...ctx, phase: 'setup' }).every(p => !p.lionDance));
});

const rendererSource = fs.readFileSync(require.resolve('../festival-sprites.js'), 'utf8');

for (const stop of ['clear', 'empty layout']) {
  test(`pending festival texture loading cannot recreate dancers after ${stop}`, async () => {
    let release, created = 0;
    const scene = { textures: { exists: () => true, remove() {} }, add: { image() { created++; return {}; } } };
    const context = vm.createContext({ scene, FESTIVAL_PARTS_BY_ID: { actor: { id: 'actor', mirror: false } },
      getFestivalTextureKey: () => 'actor', getFestivalTexturePath: () => 'Models/actor.png',
      defer: () => new Promise(resolve => { release = resolve; }) });
    vm.runInContext(rendererSource, context);
    vm.runInContext("getFestivalPlacementFiles=()=>['Models/actor.png'];loadFestivalTextures=defer;", context);
    const pending = vm.runInContext("syncFestivalSprites(scene,[{id:'lion',partId:'actor'}])", context);
    if (stop === 'clear') vm.runInContext('clearFestivalSprites(scene)', context);
    else await vm.runInContext('syncFestivalSprites(scene,[])', context);
    release(true);
    await pending;
    assert.equal(created, 0);
    assert.equal(scene.festivalSprites.size, 0);
  });
}

test('street actors sort continuously by ground feet within a single road tile', () => {
  const project = (col, row) => ({ x: (col - row) * 50, y: (col + row) * 25 });
  const context = vm.createContext({
    scene: { offsetX: 0, offsetY: 0 },
    isoToScreen: project,
    getTileFaceGeometry: (row, col) => ({ center: project(col, row) }),
    getBuildingAnchor: (row, col) => project(col, row),
    getBuildingSortDepth: y => y + 50,
  });
  vm.runInContext(rendererSource, context);
  const a = vm.runInContext("getFestivalPlacementPoint(scene,{mode:'tile',row:10.1,col:10.2,lionDance:{}})", context);
  const b = vm.runInContext("getFestivalPlacementPoint(scene,{mode:'tile',row:10.3,col:10.2,lionDance:{}})", context);
  assert.ok(b.depth > a.depth);
  assert.ok(Math.abs((b.depth - a.depth) - (b.y - a.y)) < 1e-8);
});
