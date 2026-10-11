const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function browser(){
 const tiles=[];for(let r=10;r<13;r++)for(let c=20;c<24;c++)tiles.push([r,c]);
 const ctx={eventGroundTiles:tiles,eventGrounds:[{id:'ground',tiles,height:0}],promenadeTiles:[[9,20],[9,21],[9,22],[9,23]],heightOf:()=>0,blocked:()=>false,seaSideOf:()=> 'n',isPier:()=>false,isNearBridge:()=>false};
 const scene={bunHillSprites:new Map(),textures:{exists:()=>false},time:{now:0}};
 const c=vm.createContext({console,scene,ctx,city:{name:'香城',year:2026,month:6,environmentMinutes:720,timeOfDayMinutes:1080,budget:10000,population:1000,weather:{}},simPaused:false,posts:[],effects:[],notices:[],draws:[],autosaves:0,
  isFestivalGameplayLive:()=>true,isVisualRouteCalibrationTestModeEnabled:()=>false});
 for(const f of ['festival-lunar-data.js','festival-calendar.js','festivals.js','festival-bun-hill.js','bun-hill-event.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
 vm.runInContext(`
 city.festivals=createFestivalState();
 getEnvironmentMinutes=()=>city.environmentMinutes;
 getBunHillMapVenueContext=()=>ctx;
 spendBudget=n=>{if(city.budget<n)return false;city.budget-=n;return true;};
 addForumPost=(p,m)=>posts.push({p,m});
 addCouncilTemporaryEffect=(...args)=>effects.push(args);
 showFestivalNotice=(s)=>notices.push(s);
 queueCityChangeAutosave=()=>autosaves++;
 loadBunHillEventTextures=()=>Promise.resolve({geometry:{parts:{}},climbers:{frames:{}},crowds:{}});
 drawBunHillMapEvent=s=>draws.push(s.offset);
 `,c);
 return c;
}
function update(c,offset,time=offset*10000){c.city.environmentMinutes=offset;vm.runInContext(`updateBunHillLiveEvent(scene,${time})`,c);}
test('live festival crosses midnight, reloads without billing twice and settles exactly once',async()=>{
 const c=browser();update(c,720);await Promise.resolve();const budget=c.city.budget;
 assert.equal(budget,8792);assert.equal(c.city.festivals.bunHill.status,'running');assert.equal(c.simPaused,false);
 update(c,1050);assert.equal(c.notices.length,1);update(c,1081);assert.equal(c.city.festivals.bunHill.year,2026);assert.equal(c.effects.length,0);
 vm.runInContext('closeBunHillMapEvent(scene);city.festivals=normalizeFestivalState(JSON.parse(JSON.stringify(city.festivals)))',c);
 update(c,1082);await Promise.resolve();assert.equal(c.city.budget,budget);assert.equal(c.notices.length,1);
 update(c,1095);update(c,1115);assert.equal(c.city.festivals.bunHill.status,'held');assert.equal(c.effects.length,1);assert.equal(c.posts.length,1);assert.match(c.posts[0].p.headline,/包山王/);
 assert.equal(c.posts[0].p.image,'UI/news/bunHillCompetition.webp');
 assert.ok(fs.existsSync(c.posts[0].p.image));assert.ok(fs.existsSync('UI/news/thumbs/bunHillCompetition.webp'));
 vm.runInContext('closeBunHillMapEvent(scene);city.festivals=normalizeFestivalState(JSON.parse(JSON.stringify(city.festivals)))',c);
 update(c,1116);await Promise.resolve();update(c,1200);assert.equal(c.city.budget,budget);assert.equal(c.effects.length,1);assert.equal(c.posts.length,1);assert.equal(c.scene.bunHillLiveSession,null);
 assert.equal(c.city.festivals.history.filter(e=>e.id==='bunHill').length,1);assert.equal(c.city.timeOfDayMinutes,1080,'live renderer does not override city clock');
});
test('bad weather and lost access cancel once, refund by race stage and publish no winners',()=>{
 for(const [offset,refund] of [[730,604],[1081,302]]){
  const c=browser();update(c,720);c.city.weather.rainWarning='red';update(c,offset);update(c,offset+1);
  assert.equal(c.city.festivals.bunHill.status,'cancelled');assert.equal(c.city.budget,8792+refund);assert.equal(c.posts.length,1);assert.equal(c.effects.length,0);assert.doesNotMatch(c.posts[0].p.headline,/包山王/);
  assert.equal(c.posts[0].p.image,'');
 }
 const c=browser();update(c,720);c.ctx.promenadeTiles=[];update(c,800);assert.equal(c.city.festivals.bunHill.status,'cancelled');
});
test('missing grounds can be completed before the race, but no venue and late starts are never charged',()=>{
 const c=browser(),ground=c.ctx.eventGrounds;c.ctx.eventGrounds=[];update(c,720);assert.equal(c.city.budget,10000);assert.equal(c.posts.length,0);
 c.ctx.eventGrounds=ground;update(c,800);assert.equal(c.city.festivals.bunHill.status,'running');assert.equal(c.city.budget,8792);
 const none=browser();none.ctx.eventGrounds=[];update(none,720);update(none,1081);update(none,1082);update(none,1095);assert.equal(none.posts.length,1);assert.equal(none.city.budget,10000);
 const late=browser();update(late,1081);assert.equal(late.city.festivals.bunHill.status,'skipped');assert.equal(late.city.budget,10000);
 const poor=browser();poor.city.budget=10;update(poor,720);assert.equal(poor.city.festivals.bunHill.status,'skipped');assert.equal(poor.city.budget,10);
});
test('jumping to another month cancels the old edition instead of awarding it',()=>{
 const c=browser();update(c,720);c.city.month=7;update(c,1440);assert.equal(c.city.festivals.bunHill.status,'cancelled');assert.equal(c.effects.length,0);assert.equal(c.posts.length,1);
});
test('calendar and save validation expose the event and reconstruct only valid venue snapshots',()=>{
 const {normalizeBunHillRun}=require('../bun-hill-event'),{getFestivalMonth}=require('../festival-calendar');
 assert.equal(getFestivalMonth('bunHill',2026),getFestivalMonth('dragonBoat',2026));
 assert.equal(normalizeBunHillRun({year:2026,month:6,base:0,status:'running',venue:{row:-1,col:0,orientation:0,layoutId:'standard',height:0}}),null);
 const c=browser();update(c,720);const saved=JSON.parse(JSON.stringify(c.city.festivals.bunHill));saved.venue.tiles=[[0,0]];saved.venue.exits=[];
 const clean=normalizeBunHillRun(saved);assert.equal(clean.venue.tiles.length,12);assert.equal(clean.venue.exits.length,4);assert.equal(clean.cost,1208);
});
