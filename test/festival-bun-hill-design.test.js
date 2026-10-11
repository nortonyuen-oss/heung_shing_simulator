const test=require('node:test'),assert=require('node:assert/strict');
const {BUN_HILL_LAYOUTS,getBunHillCrowdSlots,getBunHillDesignPhase,simulateBunHillDesignContest,getBunHillDesignContestFrame,rankBunHillDesignResults}=require('../festival-bun-hill');
test('bun-hill land requirements use 20m tiles with separate tower, crowd and exit space',()=>{
 for(const layout of Object.values(BUN_HILL_LAYOUTS)){
  assert.equal(layout.widthM,layout.cols*20);assert.equal(layout.depthM,layout.rows*20);
  const [x,y]=layout.tower,[cx,cy,cw,ch]=layout.core;
  assert.ok(x-4>=cx&&x+4<=cx+cw&&y-4>=cy&&y+4<=cy+ch);
  for(const [a,b,w,h] of layout.crowds){
   assert.ok(a>=6&&b>=6&&a+w<=layout.widthM-6&&b+h<=layout.depthM-6);
   assert.ok(a+w<=cx||a>=cx+cw||b+h<=cy||b>=cy+ch);
  }
  assert.equal(layout.crowds.length,3);
  assert.equal(getBunHillCrowdSlots(layout).length,layout.crowdGroups*3);
  assert.ok(layout.crowdGroups>=4&&layout.crowdGroups<=5);
  for(const slot of getBunHillCrowdSlots(layout)){
   const [a,b,w,h]=layout.crowds[slot.cluster];
   assert.ok(slot.x-2.5>=a&&slot.x+2.5<=a+w&&slot.y-2>=b&&slot.y+2<=b+h);
  }
  assert.equal(new Set(getBunHillCrowdSlots(layout).map(p=>p.cluster)).size,3);
  const slots=getBunHillCrowdSlots(layout);
  assert.deepEqual(getBunHillCrowdSlots(layout),slots,'crowds do not reshuffle during playback');
  for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++)
   assert.ok(Math.abs(slots[i].x-slots[j].x)>=5||Math.abs(slots[i].y-slots[j].y)>=4,'full spectator groups do not overlap');
  for(const cluster of [0,1,2])assert.equal(new Set(slots.filter(p=>p.cluster===cluster).map(p=>p.variant)).size,2);
  for(const path of layout.fences)for(const [a,b] of path){assert.ok(a>=6&&a<=layout.widthM-6&&b>=6&&b<layout.crowds[0][1]);}
 }
 assert.equal(BUN_HILL_LAYOUTS.compact.relay,false);assert.equal(BUN_HILL_LAYOUTS.standard.relay,true);
});
test('the programme crosses midnight monotonically and skips compact relay',()=>{
 assert.equal(getBunHillDesignPhase(719).id,'idle');assert.equal(getBunHillDesignPhase(720).id,'setup');
 assert.equal(getBunHillDesignPhase(1079).id,'countdown');assert.equal(getBunHillDesignPhase(1080).id,'individual');
 assert.equal(getBunHillDesignPhase(1095).id,'scoring');assert.equal(getBunHillDesignPhase(1100).id,'relay');
 assert.equal(getBunHillDesignPhase(1100,'compact').id,'scoring');assert.equal(getBunHillDesignPhase(1200).id,'closed');
});
test('fixed contest events and replay frames agree on picking, return deadlines and awards',()=>{
 const contest=simulateBunHillDesignContest('香城:2026'),before=JSON.stringify(contest);
 assert.deepEqual(simulateBunHillDesignContest('香城:2026'),contest);
 assert.notDeepEqual(simulateBunHillDesignContest('香城:2027'),contest);
 for(const i of [0,1,2]){const team=contest.contestants.filter(p=>p.towerIndex===i);assert.equal(team.length,4);assert.equal(team.filter(p=>p.gender==='female').length,1);assert.equal(new Set(team.map(p=>p.strategy)).size,3);}
 assert.equal(contest.contestants.length,12);assert.equal(contest.contestants.filter(c=>c.gender==='female').length,3);
 assert.equal(new Set(contest.contestants.map(c=>c.sector)).size,12);
 assert.ok(contest.results.some(c=>!c.valid),'sample covers overdue return');
 for(const seconds of [0,20,60,119,120,160,180,60,180]){
  const frame=getBunHillDesignContestFrame(contest,seconds);
  for(const p of frame.contestants){const c=contest.contestants.find(c=>c.id===p.id);
   const picked=c.events.filter(e=>e.at<=seconds);
   assert.equal(p.buns,picked.length);assert.equal(p.rawScore,picked.reduce((n,e)=>n+e.points,0));
   assert.ok(p.heightM>=0&&p.heightM<=14);
   if(seconds===180){assert.equal(p.dq,!c.valid);assert.equal(p.score,c.valid?p.rawScore:0);assert.equal(p.buns,contest.results.find(r=>r.id===p.id).buns);}
  }
 }
 assert.equal(getBunHillDesignContestFrame(contest,119).lastMinute,false);
 assert.equal(getBunHillDesignContestFrame(contest,120).lastMinute,true);
 assert.deepEqual(getBunHillDesignContestFrame(contest,180).awards,contest.awards);
 assert.equal(JSON.stringify(contest),before,'scrubbing does not mutate results');
 const winners=[...contest.awards.men,...contest.awards.women,contest.awards.mostBuns];assert.ok(winners.every(w=>w.valid));
});
test('ties use qualifying rank and the quantity award excludes invalid results',()=>{
 const results=[{id:'late',gender:'male',valid:false,score:999,buns:500,qualifyingRank:1},
  {id:'second',gender:'male',valid:true,score:100,buns:30,qualifyingRank:3},
  {id:'first',gender:'male',valid:true,score:100,buns:25,qualifyingRank:2},
  {id:'female',gender:'female',valid:true,score:80,buns:40,qualifyingRank:4}];
 const awards=rankBunHillDesignResults(results);assert.equal(awards.men[0].id,'first');
 assert.equal(awards.women[0].id,'female');assert.equal(awards.mostBuns.id,'female');
 assert.equal(rankBunHillDesignResults([]).mostBuns,null);
});
