const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const db=require('../festival-dragon-boat');
function setup(){
 const run={year:3029,month:6,status:'running',seed:'audio',course:{id:'coast',distanceM:270,row:10,col:10,dir:'e',sea:'s'},teams:[]};
 const c=vm.createContext({...db,city:{year:3029,month:6,weather:{},festivals:{dragonBoat:run}},simPaused:false,minute:480,enabled:true,live:true,
  isFestivalGameplayLive:()=>c.live,isFestivalEnabled:()=>c.enabled,getFestivalTier:()=> 'standard',getGameTimeOfDayMinutes:()=>c.minute,
  getTrafficCameraRect:()=>({x:0,y:0,width:1000,height:1000}),TRAFFIC_VISUAL_CONFIG:{zoomMin:1},
  getFestivalPlacementPoint:()=>({x:500,y:500}),localStorage:{getItem:()=>null}});
 vm.runInContext(fs.readFileSync('audio.js','utf8'),c);
 const created=[];const scene={cameras:{main:{zoom:1}},cache:{audio:{exists:()=>true}},sound:{locked:false,getAll(key){return created.filter(s=>s.key===key&&!s.destroyed);},add(key){
  const s={key,isPlaying:false,isPaused:false,volume:0,playCount:0,play(){this.playCount++;this.isPlaying=true;},pause(){this.isPlaying=false;this.isPaused=true;},resume(){this.isPlaying=true;this.isPaused=false;},setVolume(v){this.volume=v;},stop(){this.isPlaying=false;},destroy(){this.destroyed=true;}};created.push(s);return s;
 }}};
 c.scene=scene;return {c,scene,run,created,update:()=>vm.runInContext('updateDragonBoatAudio(scene)',c)};
}
test('opening, pre-start, racing and clearance follow normal and delayed rounds',()=>{
 const {c,run}=setup();c.run=run;
 const plan=(m)=>Array.from(vm.runInContext(`dragonBoatAudioPlan(run,${m})`,c));
 assert.deepEqual(plan(479),[]);assert.deepEqual(plan(480),['opening']);assert.deepEqual(plan(539),['opening']);
 for(const start of [540,660,900]){
  assert.deepEqual(plan(start),start===540?['cheers']:['music','cheers']);assert.deepEqual(plan(start+14.9),start===540?['cheers']:['music','cheers']);
  assert.deepEqual(plan(start+15),['music','paddles']);assert.deepEqual(plan(start+45),['music']);assert.deepEqual(plan(start+50),['music']);
 }
 assert.deepEqual(plan(620),['music']);run.status='held';assert.deepEqual(plan(960),['music']);assert.deepEqual(plan(1079),['music']);assert.deepEqual(plan(1080),[]);run.status='running';
 run.delayed=true;assert.deepEqual(plan(540),[]);assert.deepEqual(plan(660),['cheers']);
 run.status='cancelled';assert.deepEqual(plan(675),[]);
});
test('phase transitions dispose old audio, reuse channels and pause/resume without restarting',()=>{
 const {c,scene,created,update}=setup();update();const opening=created[0];update();assert.equal(created.length,1);
 c.simPaused=true;update();assert.equal(opening.isPaused,true);c.simPaused=false;update();assert.equal(opening.isPlaying,true);
 c.minute=540;update();assert.equal(opening.destroyed,true);assert.equal(created.at(-1).key,'db_cheers');
 c.minute=555;update();assert.equal(created.at(-2).key,'db_music');assert.equal(created.at(-1).key,'db_paddles');
 vm.runInContext('setStoredAmbientVolume(0)',c);update();assert.equal(created.at(-1).volume,0);
 const music=scene.dragonBoatAudio.sounds.music;c.minute=600;update();assert.equal(scene.dragonBoatAudio.sounds.music,music);c.minute=660;update();assert.equal(scene.dragonBoatAudio.sounds.music,music);c.city.festivals.dragonBoat.status='held';c.minute=1020;update();assert.equal(scene.dragonBoatAudio.sounds.music,music);c.minute=1080;update();assert.equal(scene.dragonBoatAudio,null);assert.ok(created.every(s=>s.destroyed));
});
test('zoom, camera distance, sound unlock and activity cancellation control audibility',()=>{
 const {c,scene,run,created,update}=setup();scene.sound.locked=true;update();assert.equal(created.length,0);
 scene.sound.locked=false;update();assert.ok(created[0].volume>0);
 scene.cameras.main.zoom=.5;update();assert.equal(created[0].volume,0);scene.cameras.main.zoom=1;
 c.getFestivalPlacementPoint=()=>({x:10000,y:10000});update();assert.equal(created[0].volume,0);
 c.city.weather={rainWarning:'red'};update();assert.equal(scene.dragonBoatAudio,null);
 c.city.weather={};update();run.status='cancelled';update();assert.equal(scene.dragonBoatAudio,null);
 run.status='running';update();scene.scene={isVisible:()=>false};update();assert.equal(scene.dragonBoatAudio,null);
 scene.scene={isVisible:()=>true};update();c.live=false;update();assert.equal(scene.dragonBoatAudio,null);
 c.live=true;update();c.enabled=false;update();assert.equal(scene.dragonBoatAudio,null);
 c.enabled=true;update();c.city.year++;update();assert.equal(scene.dragonBoatAudio,null);
});
test('all four event audio assets are registered and available',()=>{
 const {c}=setup(),tracks=vm.runInContext("SFX_TRACKS.filter(t=>t.key.startsWith('db_'))",c);
 assert.equal(tracks.length,4);for(const t of tracks)assert.ok(fs.existsSync(t.file));
});
test('an already playing or paused music track is reused and overlapping copies are removed',()=>{
 const {c,scene,created,update}=setup();c.minute=600;update();const music=scene.dragonBoatAudio.sounds.music;
 assert.equal(music.volume,.42);assert.equal(music.playCount,1);
 const duplicate=scene.sound.add('db_music');duplicate.play();
 for(let i=0;i<20;i++){c.minute=600+i;update();}
 assert.equal(duplicate.destroyed,true);assert.equal(music.playCount,1);assert.equal(scene.sound.getAll('db_music').length,1);
 // Recover an existing paused track even if its scene-side handle has been lost.
 music.pause();delete scene.dragonBoatAudio.sounds.music;c.simPaused=true;update();
 assert.equal(scene.dragonBoatAudio.sounds.music,music);assert.equal(scene.sound.getAll('db_music').length,1);
 c.simPaused=false;update();assert.equal(music.isPlaying,true);assert.equal(music.playCount,1);
 c.minute=1080;update();assert.equal(scene.sound.getAll('db_music').length,0);
});
test('original music output is 30 percent without changing saved slider values or event volume',()=>{
 const {c,created,update}=setup();
 c.document={getElementById:()=>({value:.8})};
 let musicVolume,titleVolume;
 c.musicStub={setVolume(v){musicVolume=v;}};c.titleStub={set volume(v){titleVolume=v;}};
 vm.runInContext('setStoredMusicVolume(.8);activeMusic=musicStub;titleLoadingAudio=titleStub;applyStoredMusicVolume()',c);
 assert.equal(musicVolume,.24);assert.equal(titleVolume,.24);assert.equal(vm.runInContext('getStoredMusicVolume()',c),.8);
 assert.equal(vm.runInContext('getMusicOutputVolume(1)',c),.3);update();assert.equal(created[0].volume,.55);
});
