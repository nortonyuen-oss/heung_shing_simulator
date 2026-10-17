const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { getFestivalSpriteScale, getFestivalGroundCenterOffsetY, getFestivalPlacementScales, getFestivalStallShape, getFestivalStallMeshBuffers } = require('../festival-sprites.js');
const { FESTIVAL_PARTS_BY_ID } = require('../festival-assets.js');
const { textures } = require('../data/festival-textures.json');
const { buildFestivalStallGeometry } = require('../festival-stall-geometry.js');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} versus ${expected}`);

test('uncalibrated props retain footprint envelope sizing', () => {
  const meta = textures.fx_lnyStallEmpty;
  const part = FESTIVAL_PARTS_BY_ID.lnyStallEmpty;
  for (const [width, depth] of [[4, 5], [3, 1.5], [4.5, 2], [5, 4]]) {
    for (const resize of [1, 0.5]) {
      const scale = getFestivalSpriteScale(meta, part, resize, null, { width, depth });
      close(scale * (meta.right - meta.left) * resize, (width + depth) * 2.5);
    }
  }
});

test('footprint overrides prefer calibrated ground span and retain explicit height overrides', () => {
  const meta = { anchor: { x: 200, y: 600 }, top: 100, left: 0, right: 400, groundSpanX: 320 };
  const part = { lengthM: 4 };
  const footprint = { width: 4, depth: 5 };
  close(getFestivalSpriteScale(meta, part, 0.5, null, footprint) * 160, 22.5);
  close(getFestivalSpriteScale(meta, part, 0.5, 3, footprint) * 250, 15);
});

test('ground centre offset preserves projected placement through source and release texture mappings', () => {
  const meta = textures.fx_lnyStallEmpty;
  const part = FESTIVAL_PARTS_BY_ID.lnyStallEmpty;
  const footprint = { width: 4, depth: 5 };
  for (const [resize, paddingY] of [[1, 0], [0.5, 23], [0.5, -17]]) {
    const scale = getFestivalSpriteScale(meta, part, resize, null, footprint);
    const mappedFront = meta.anchor.y * resize + paddingY;
    const mappedCentre = mappedFront - getFestivalGroundCenterOffsetY(footprint, scale);
    close((mappedFront - mappedCentre) * scale, 22.5 / 4);
  }
});

test('existing fairs, height-sized decorations and calibrated people retain their prior scales', () => {
  const booth = textures.fx_lnyStallEmpty;
  close(getFestivalSpriteScale(booth, FESTIVAL_PARTS_BY_ID.lnyStallEmpty, 1), 10 / (booth.right - booth.left));
  const meta = { anchor: { x: 100, y: 500 }, top: 100, left: 20, right: 420 };
  close(getFestivalSpriteScale(meta, { heightM: 15 }, 1), 75 / 400);
  close(getFestivalSpriteScale(meta, { lengthM: 16 }, 0.5), 40 / 200);
  close(getFestivalSpriteScale({ ...meta, personHeightPx: 200 }, { heightM: 1.7 }, 0.5), 8.5 / 100);
  close(getFestivalSpriteScale({ ...meta, personHeightPx: 200 }, { heightM: 1.7 }, 0.5, 1.7), 8.5 / 100);
  for (const invalid of [null, {}, { width: 4, depth: 0 }, { width: Infinity, depth: 5 }]) {
    close(getFestivalSpriteScale(booth, FESTIVAL_PARTS_BY_ID.lnyStallEmpty, 1, null, invalid), 10 / (booth.right - booth.left));
    assert.equal(getFestivalGroundCenterOffsetY(invalid, 0.1), 0);
  }
});

test('calibrated booth placements keep independent floor dimensions and uniform runtime scales', () => {
  for (const [partId, width, depth, maxHeightM] of [
    ['lnyStallBlossoms', 4, 5, 4], ['lnyStallLaisee', 3, 1.5, 3],
    ['lnyStallLaisee', 4.5, 2, 3], ['lnyStallSnacks', 5, 4, 4],
    ['lnyStallEmpty', 4, 5, 4], ['lnyStallEmpty', 3, 1.5, 3],
    ['lnyInfoBooth', 1.5, 1.5, 2.8],
  ]) {
    const meta = textures[`fx_${partId}`], part = FESTIVAL_PARTS_BY_ID[partId];
    const placement = { footprintM: { width, depth }, maxHeightM, anchorMode: 'ground-center' };
    for (const mirrored of [false, true]) {
      const shape = getFestivalStallShape(meta, placement, mirrored);
      assert.ok(shape);
      const { left, front, right } = shape.geometry.groundCorners;
      close((front.x-left.x)/2.5, width);
      close((right.x-front.x)/2.5, depth);
      close(shape.geometry.heightM,maxHeightM);
      for (const resize of [1, 0.5, 0.25]) {
        assert.deepEqual(getFestivalPlacementScales(meta,part,resize,placement),{scaleX:1,scaleY:1});
      }
    }
  }
});

test('release and independently padded night UV windows clip triangles without clamping artwork outside them', () => {
  const geometry = getFestivalStallShape(textures.fx_lnyStallBlossoms,
    { footprintM:{width:4,depth:5}, maxHeightM:4 },true).geometry;
  for(const mapping of [{resize:1,offsetX:0,offsetY:0},{resize:0.5,offsetX:-20,offsetY:-50},
    {resize:0.25,offsetX:11,offsetY:-17}]){
    const buffers=getFestivalStallMeshBuffers(geometry,mapping,256,512);
    assert.ok(buffers.indices.length > 0);
    for(const p of buffers.points){
      assert.ok(p.u>=0 && p.u<=1 && p.v>=0 && p.v<=1);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
  }
});

test('uncalibrated sprite positioning retains legacy ground centre and height behavior', () => {
  const draw = (placement, lit = false) => {
    const result = {};
    const sprite = {
      festivalPlacement: { partId: 'lnyStallEmpty', ...placement }, festivalSeed: 0,
      texture: { key: 'festival:fx_lnyStallEmpty' }, frame: { width: 512, height: 512 },
      setOrigin: (x, y) => { result.origin = [x, y]; }, setScale: (x, y) => { result.scale = x; result.scaleY = y; },
      setTexture(key) { this.texture.key = key; }, setPosition() {}, setDepth() {}, setVisible() {}, clearTint() {},
    };
    const context = vm.createContext({
      FESTIVAL_PARTS_BY_ID, getFestivalTextureKey: () => 'fx_lnyStallEmpty',
      getModelTexturePixelMapping: (file) => file.includes('__lit')
        ? { resize: 0.25, offsetX: 11, offsetY: -17 } : { resize: 0.5, offsetX: 7, offsetY: 23 },
      fixture: { fx_lnyStallEmpty: { ...textures.fx_lnyStallEmpty, stallCalibration: undefined } },
      sprite, scene: { festivalLit: lit, textures: { exists: () => true } },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../festival-sprites.js'), 'utf8'), context);
    vm.runInContext('festivalTextureMeta = fixture; getFestivalPlacementPoint = () => ({ x: 100, y: 200, depth: 5 }); positionFestivalSprite(scene, sprite);', context);
    return result;
  };
  const footprintM = { width: 4, depth: 5 };
  const front = draw({ footprintM });
  const centre = draw({ footprintM, anchorMode: 'ground-center' });
  close(front.scale, centre.scale);
  close(front.origin[0], centre.origin[0]);
  close((front.origin[1] - centre.origin[1]) * 512 * centre.scale, 22.5 / 4);
  const legacy = draw({});
  const noDimensions = draw({ anchorMode: 'ground-center' });
  assert.deepEqual(legacy, noDimensions);
  for (const lit of [false, true]) {
    const capped = draw({ footprintM, anchorMode: 'ground-center', maxHeightM: 1 }, lit);
    const resize = lit ? 0.25 : 0.5, paddingY = lit ? -17 : 23;
    close(capped.scale * (textures.fx_lnyStallEmpty.right - textures.fx_lnyStallEmpty.left) * resize, 22.5);
    assert.ok(capped.scaleY < capped.scale);
    close((capped.origin[1] * 512 - textures.fx_lnyStallEmpty.top * resize - paddingY) * capped.scaleY, 5);
    close((textures.fx_lnyStallEmpty.anchor.y * resize + paddingY - capped.origin[1] * 512) * capped.scaleY, 22.5 / 4);
  }
});


test('day and night calibrated meshes share floor geometry and use each frame pixel mapping', () => {
  const results=[];
  for(const lit of [false,true]){
    const result={};
    const sprite={
      festivalPlacement:{partId:'lnyStallBlossoms',footprintM:{width:4,depth:5},maxHeightM:4,mirrored:true,anchorMode:'ground-center'},
      festivalStallRenderMode:'mesh',festivalSeed:0,texture:{key:''},frame:{width:256,height:512},
      setTexture(key){this.texture.key=key;},clear(){},setSize(){},setOrtho(){},
      addVertices(vertices,uvs){result.vertices=vertices;result.uvs=uvs;},
      setScale(x,y){result.scale=[x,y];},setPosition(x,y){result.position=[x,y];},
      setDepth(){},setVisible(){},clearTint(){},
    };
    const context=vm.createContext({FESTIVAL_PARTS_BY_ID,buildFestivalStallGeometry,
      getFestivalTextureKey:()=> 'fx_lnyStallBlossoms_m',sprite,
      getModelTexturePixelMapping:(file)=>file.includes('__lit')?
        {resize:0.25,offsetX:11,offsetY:-17}:{resize:0.5,offsetX:0,offsetY:0},
      fixture:{fx_lnyStallBlossoms_m:textures.fx_lnyStallBlossoms_m},
      scene:{festivalLit:lit,textures:{exists:()=>true}},
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../festival-sprites.js'),'utf8'),context);
    vm.runInContext('festivalTextureMeta=fixture;getFestivalPlacementPoint=()=>({x:100,y:200,depth:5});positionFestivalSprite(scene,sprite);',context);
    assert.deepEqual(result.scale,[1,1]);
    assert.deepEqual(result.position,[100,200]);
    assert.ok(result.vertices.length>0);
    result.floor=sprite.festivalStallGeometry.groundCorners;
    results.push(result);
  }
  assert.deepEqual(results[0].floor,results[1].floor);
  assert.notDeepEqual(results[0].uvs,results[1].uvs);
});

test('Canvas booth caches have power-of-two dimensions, refreshed linear sampling and a finite lifecycle', () => {
  const created=[],removed=[];
  const context2d={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},transform(){},drawImage(){}};
  const scene={textures:{
    createCanvas(key,width,height){
      const texture={key,width,height,getContext:()=>context2d,
        refresh(){this.refreshed=true;},setFilter(filter){this.filter=filter;}};
      created.push(texture);return texture;
    },
    get:()=>({getSourceImage:()=>({})}),exists:()=>true,remove:(key)=>removed.push(key),
  }};
  const shape=getFestivalStallShape(textures.fx_lnyStallToys,
    {footprintM:{width:3,depth:1.5},maxHeightM:3},false);
  const mapping={resize:1,offsetX:0,offsetY:0};
  const frame={width:512,height:512};
  const buffers=getFestivalStallMeshBuffers(shape.geometry,mapping,frame.width,frame.height);
  const context=vm.createContext({scene,shape,mapping,frame,buffers});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../festival-sprites.js'),'utf8'),context);
  const first=vm.runInContext("getFestivalStallCanvasTexture(scene,'Models/day.png','day',shape,mapping,frame,buffers)",context);
  const same=vm.runInContext("getFestivalStallCanvasTexture(scene,'Models/day.png','day',shape,mapping,frame,buffers)",context);
  assert.equal(first.key,same.key);
  assert.equal(created.length,1,'repeated positioning must reuse the existing texture');
  vm.runInContext("getFestivalStallCanvasTexture(scene,'Models/night.png','night',shape,mapping,frame,buffers)",context);
  assert.equal(created.length,2,'day and night cache separate material pixels');
  for(const texture of created){
    assert.ok(Number.isInteger(Math.log2(texture.width)) && Number.isInteger(Math.log2(texture.height)));
    assert.equal(texture.refreshed,true);
    assert.equal(texture.filter,0,'sample refreshed base level instead of the initially blank mip levels');
  }
  vm.runInContext('unloadFestivalTextures(scene,[])',context);
  assert.equal(scene.festivalStallCanvasTextures.size,0);
  assert.equal(removed.length,2,'month-end cleanup releases the dynamic textures');
});
