const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { CHRISTMAS_WALL_ASSETS, normalizeChristmasWalls, christmasWallInverse, compositeChristmasWall } = require('../christmas-wall');
const c = [[0,0],[1,0],[1,1],[0,1]];
test('46 curtain-wall assets exist; invalid input is rejected and four walls is the limit', () => {
  assert.equal(CHRISTMAS_WALL_ASSETS.length,46);
  CHRISTMAS_WALL_ASSETS.forEach(p => assert.ok(fs.existsSync(p)));
  assert.equal(normalizeChristmasWalls(Array(6).fill({asset:CHRISTMAS_WALL_ASSETS[0],c})).length,4);
  assert.equal(normalizeChristmasWalls([{asset:'../../other.png',c}]).length,0);
  assert.equal(normalizeChristmasWalls([{asset:CHRISTMAS_WALL_ASSETS[0],c:[[NaN,0]]}]).length,0);
});
test('perspective mapping matches all four corners and singular walls draw nothing', () => {
  const quad=[[.1,.2],[.8,.1],[.7,.9],[.2,.7]], h=christmasWallInverse(quad);
  quad.forEach(([x,y],i) => {
    const d=h[6]*x+h[7]*y+1;
    assert.ok(Math.abs((h[0]*x+h[1]*y+h[2])/d-c[i][0])<1e-8);
    assert.ok(Math.abs((h[3]*x+h[4]*y+h[5])/d-c[i][1])<1e-8);
  });
  assert.equal(christmasWallInverse(Array(4).fill([0,0])),null);
});
test('composition preserves facade through transparent art and keeps building alpha', () => {
  const base=new Uint8ClampedArray([10,20,30,255,10,20,30,0]);
  compositeChristmasWall(base,2,1,new Uint8Array([250,100,50,255,0,0,0,0]),2,1,c);
  assert.deepEqual([...base],[250,100,50,255,10,20,30,0]);
});
test('seasonal night art is commercial-only, December-only and falls back when missing', () => {
  const ctx=vm.createContext({console, city:{month:12}, modelAssetManifest:{entries:{'Models/tower__night.png':{},'Models/tower__nightchristmas.png':{}}}});
  vm.runInContext(fs.readFileSync('day-night-lighting.js','utf8'),ctx);
  const run=s=>vm.runInContext(s,ctx);
  assert.equal(run("getSeasonalBuildingNightVariant('tower',{type:'commercial'},'lamps')"),'christmas');
  assert.equal(run("getSeasonalBuildingNightVariant('tower',{type:'residential'},'deep')"),'deep');
  assert.equal(run("getSeasonalBuildingNightVariant('tower',{type:'commercial'},'night',11)"),'night');
  assert.equal(run("getSeasonalBuildingNightVariant('unknown',{type:'commercial'},'night')"),'night');
});
test('calibration retains wall data through migration and JS export', () => {
  const ctx=vm.createContext({console});
  vm.runInContext(fs.readFileSync('christmas-wall.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('building-light-calibrator.js','utf8'),ctx);
  const data=JSON.stringify({class:'off',panels:[],lamps:[],christmasWalls:[{asset:CHRISTMAS_WALL_ASSETS[0],c}]});
  assert.equal(vm.runInContext(`migrateBuildingLightCalibrationData(${data}).christmasWalls.length`,ctx),1);
  assert.match(vm.runInContext(`buildingLightCalibrationProfileLiteral(migrateBuildingLightCalibrationData(${data}),2)`,ctx),/christmasWalls.*BuildingDeco1/);
});
