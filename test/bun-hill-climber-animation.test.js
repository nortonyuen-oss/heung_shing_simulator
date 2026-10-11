const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),sharp=require('sharp');
const metadata=require('../data/bun-hill-climbers.json');
const {simulateBunHillDesignContest,getBunHillDesignContestFrame}=require('../festival-bun-hill');
const {getBunHillClimberAnimationPose}=require('../bun-hill-climber-animation');
test('all 48 character frames keep clear margins, shared hip anchors and physical height',async()=>{
 assert.equal(Object.keys(metadata.frames).length,48);
 for(const frame of Object.values(metadata.frames)){
  const {data,info}=await sharp(frame.file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,256);assert.equal(info.height,256);assert.deepEqual(frame.anchor,[128,128]);
  assert.ok(frame.personHeightPx>127&&frame.personHeightPx<129);assert.equal(frame.heightM,1.7);
  const scale=1.7*5/frame.personHeightPx;assert.ok(Math.abs(frame.personHeightPx*scale-8.5)<1e-10);
  let count=0;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(data[(y*256+x)*4+3]>30){count++;assert.ok(x>=8&&x<248&&y>=8&&y<248,frame.file);}
  assert.ok(count>1000,frame.file);
 }
 const crosses=Object.values(metadata.frames).some(f=>f.sourceBounds[3]>256&&f.sourceBounds[1]<256);
 assert.ok(crosses,'the extraction includes feet across the original row boundary');
});
test('mirrors preserve pixels and transform foot anchors with the same canvas',async()=>{
 for(const [key,frame] of Object.entries(metadata.frames).filter(([,f])=>!f.mirrored)){
  const mirror=metadata.frames[key+'_m'];assert.equal(mirror.groundAnchor[0],256-frame.groundAnchor[0]);
  assert.equal(mirror.groundAnchor[1],frame.groundAnchor[1]);
  const [a,b]=await Promise.all([sharp(frame.file).raw().toBuffer(),sharp(mirror.file).raw().toBuffer()]);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++)for(let c=0;c<4;c++)assert.equal(a[(y*256+x)*4+c],b[(y*256+255-x)*4+c]);
 }
});
test('animation picks only available frames through return, replay and all view rotations',()=>{
 const contest=simulateBunHillDesignContest();
 for(const time of [0,.6,20,60,120,160,170,180])for(let rotation=0;rotation<4;rotation++){
  const frame=getBunHillDesignContestFrame(contest,time);
  for(const person of frame.contestants){
   const c=contest.contestants.find(c=>c.id===person.id),a=getBunHillClimberAnimationPose(person,time,rotation,c);
   assert.ok(metadata.frames[a.key]);assert.equal(a.onGround,['waiting','grounded'].includes(person.pose));
   assert.deepEqual(a,getBunHillClimberAnimationPose(person,time,rotation,c));
   if(person.pose==='descending')assert.equal(a.pose,'descend');
  }
 }
 const c=contest.contestants[0],event=c.events[5];
 const pickFrame=getBunHillDesignContestFrame(contest,event.at+.1).contestants[0];
 assert.equal(getBunHillClimberAnimationPose(pickFrame,event.at+.1,0,c).pose,'collect');
 const restFrame=getBunHillDesignContestFrame(contest,event.at+.4).contestants[0];
 assert.equal(getBunHillClimberAnimationPose(restFrame,event.at+.4,0,c).pose,'climbA');
 const climbing=getBunHillDesignContestFrame(contest,1).contestants[0];
 assert.notEqual(getBunHillClimberAnimationPose(climbing,1).pose,getBunHillClimberAnimationPose(climbing,1.55).pose);
});
test('atlas rects are unique, in bounds, power of two and match individual frames',async()=>{
 const {data,info}=await sharp(metadata.atlas.file).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,2048);assert.equal(info.height,2048);const rects=new Set();
 for(const f of Object.values(metadata.frames)){
  const [x,y,w,h]=f.rect;assert.ok(x+w<=2048&&y+h<=2048);assert.ok(!rects.has(f.rect.join(',')));rects.add(f.rect.join(','));
  const individual=await sharp(f.file).raw().toBuffer();
  for(let row=0;row<256;row++)assert.ok(data.subarray(((y+row)*2048+x)*4,((y+row)*2048+x+256)*4).equals(individual.subarray(row*256*4,(row+1)*256*4)));
 }
});
