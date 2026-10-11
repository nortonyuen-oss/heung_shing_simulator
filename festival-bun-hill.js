// Pure programme prototype for the bun-hill design preview. No live city writes.
const BUN_HILL_DESIGN_VERSION = 1;
const BUN_HILL_LAYOUTS = Object.freeze({
  // User's sketch: centred rear stage, main tower behind two flanking display
  // towers, three audience clusters at the front. Local y=0 is the shore edge.
  standard: {widthM:80,depthM:60,cols:4,rows:3,tower:[40,27],stage:[40,10],stageFacing:[0,1],decor:[[20,37],[60,37]],signboards:[{point:[12,8],side:0},{point:[21,8],side:0},{point:[30,8],side:0},{point:[50,8],side:1},{point:[59,8],side:1},{point:[68,8],side:1}],crowdGroups:5,crowds:[[8,44,18,10],[31,44,18,10],[54,44,18,10]],core:[27,16,26,26],fences:[[[8,34],[8,8],[34,8]],[[46,8],[72,8],[72,34]]],relay:true},
  compact: {widthM:60,depthM:40,cols:3,rows:2,tower:[30,18],stage:[30,9],stageFacing:[0,1],decor:[[14,20],[46,20]],signboards:[{point:[12,8],side:0},{point:[20,8],side:0},{point:[8,14],side:0,axis:[0,1]},{point:[40,8],side:1},{point:[48,8],side:1},{point:[52,14],side:1,axis:[0,1]}],crowdGroups:4,crowds:[[6,25.5,13,8.5],[23.5,25.5,13,8.5],[41,25.5,13,8.5]],core:[22,13,16,12],fences:[[[8,18],[8,8],[24,8]],[[36,8],[52,8],[52,18]]],relay:false},
});
// Five by four metres per calibrated spectator group. Reserve complete groups,
// rather than squeezing a larger sprite into the smaller venue.
function getBunHillCrowdSlots(layout) {
  return layout.crowds.flatMap(([x,y,w,h],cluster)=>{
    const count=layout.crowdGroups,frontCount=count===5&&cluster===1?2:Math.ceil(count/2);
    const random=bunHillDesignRandom(`crowd:${layout.widthM}:${cluster}`);
    const shifts=[frontCount,count-frontCount].map(n=>
      (random()*2-1)*Math.min(1.5,(w-((n-1)*6+5))/2-.4));
    return Array.from({length:count},(_,i)=>{
      const back=i>=frontCount,n=back?count-frontCount:frontCount,column=back?i-frontCount:i;
      // Keep complete 5x4m groups apart, but stagger each cluster and vary the
      // depth within each row. Seeded offsets remain stable through playback.
      const dx=shifts[back?1:0]+(random()-.5)*.8;
      const yM=back?h-2-random()*(h>9?.8:.23):2+random()*(h>9?.8:.23);
      return {id:`crowd:${cluster}:${i}`,x:x+(w-(n-1)*6)/2+column*6+dx,y:y+yM,
        cluster,variant:1+(i+cluster)%2,target:cluster===1?layout.tower:layout.decor[cluster===0?0:1]};
    });
  });
}
const BUN_HILL_PHASES = Object.freeze([
  [720,'setup','搭台、點燈'],[780,'festival','清醮夜、戲棚表演'],[990,'registration','選手報到'],
  [1050,'opening','開幕及規則介紹'],[1078,'countdown','開賽倒數'],[1080,'individual','個人決賽'],
  [1095,'scoring','點算平安包'],[1100,'relay','接力邀請賽'],[1115,'awards','頒獎、公布賽果'],
  [1130,'leaving','觀眾散場'],[1140,'teardown','拆台'],[1200,'closed','收檔'],
]);
function getBunHillDesignPhase(environmentOffset,layout='standard') {
  let phase={id:'idle',label:'未開始',at:0};
  for(const [at,id,label] of BUN_HILL_PHASES) {
    if(environmentOffset<at)break;
    phase={id,label,at};
  }
  if(layout==='compact'&&phase.id==='relay')phase={...phase,id:'scoring',label:'點算及準備頒獎（小場地不設接力）'};
  return phase;
}
function bunHillDesignRandom(seed) {
  let state=2166136261;
  for(const ch of String(seed))state=Math.imul(state^ch.codePointAt(0),16777619)>>>0;
  return ()=>{
    state=(state+0x6d2b79f5)>>>0;let n=state;
    n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);
    return ((n^(n>>>14))>>>0)/4294967296;
  };
}
function rankBunHillDesignResults(results) {
  const valid=results.filter(r=>r.valid);
  const points=(a,b)=>b.score-a.score||a.qualifyingRank-b.qualifyingRank;
  const men=valid.filter(r=>r.gender==='male').sort(points);
  const women=valid.filter(r=>r.gender==='female').sort(points);
  const most=[...valid].sort((a,b)=>b.buns-a.buns||a.qualifyingRank-b.qualifyingRank)[0];
  return {men:men.slice(0,3),women:women.slice(0,1),mostBuns:most||null};
}
function simulateBunHillDesignContest(seed='香城:2026') {
  const strategies=['high','middle','quantity'];
  const contestants=Array.from({length:12},(_,i)=>{
    const rand=bunHillDesignRandom(`${seed}:entrant:${i}`);
    const strategy=strategies[i%3],gender=i>=9?'female':'male';
    const targetM={high:12,middle:8.5,quantity:4.5}[strategy]+rand()*.8;
    const climbSpeed=.20+rand()*.22;
    const arriveSec=targetM/climbSpeed;
    const descendSpeed=.8+rand()*.6;
    const returnDuration=targetM/descendSpeed;
    const risk=rand()<.12;
    const departSec=180-returnDuration-(risk?-2-rand()*5:4+rand()*15);
    const finishSec=departSec+returnDuration;
    const zone=strategy,points={high:9,middle:3,quantity:1}[zone];
    const cadence={high:1.5,middle:1.05,quantity:.7}[strategy]+rand()*.35;
    const events=[];
    let t=arriveSec+.5,index=0;
    while(t<Math.min(departSec,180)) {
      // Fatigue progressively slows picking. Each event is one visible pickup.
      events.push({at:t,zone,buns:1,points});
      t+=cadence*(1+index*.004);index++;
    }
    return {id:`entrant:${i+1}`,name:`${i+1} 號選手`,gender,strategy,targetM,arriveSec,departSec,finishSec,
      qualifyingRank:i+1,sector:i,towerIndex:(Math.floor(i/3)+i)%3,events,valid:finishSec<180};
  });
  const results=contestants.map(c=>({id:c.id,name:c.name,gender:c.gender,qualifyingRank:c.qualifyingRank,
    valid:c.valid,finishSec:c.finishSec,buns:c.events.length,rawScore:c.events.reduce((n,e)=>n+e.points,0),
    score:c.valid?c.events.reduce((n,e)=>n+e.points,0):0}));
  return {version:BUN_HILL_DESIGN_VERSION,seed,durationSec:180,towerHeightM:14,contestants,results,awards:rankBunHillDesignResults(results)};
}
function getBunHillDesignContestFrame(contest,seconds) {
  const time=Math.max(0,Math.min(contest.durationSec,Number(seconds)||0));
  return {time,remaining:contest.durationSec-time,lastMinute:time>=120&&time<180,
    contestants:contest.contestants.map(c=>{
      let pose,heightM;
      if(time===0){pose='waiting';heightM=0;}
      else if(time<c.arriveSec){pose='climbing';heightM=c.targetM*time/c.arriveSec;}
      else if(time<c.departSec){pose='collecting';heightM=c.targetM;}
      else if(time<c.finishSec){pose='descending';heightM=c.targetM*(1-(time-c.departSec)/(c.finishSec-c.departSec));}
      else{pose='grounded';heightM=0;}
      const picked=c.events.filter(e=>e.at<=time);
      const rawScore=picked.reduce((n,e)=>n+e.points,0);
      return {id:c.id,name:c.name,gender:c.gender,sector:c.sector,towerIndex:c.towerIndex,strategy:c.strategy,pose,heightM,
        buns:picked.length,rawScore,score:time===180&&!c.valid?0:rawScore,dq:time===180&&!c.valid,
        handPhase:(time%.8)/.8};
    }),awards:time===180?contest.awards:null};
}
if(typeof module!=='undefined'&&module.exports)module.exports={BUN_HILL_DESIGN_VERSION,BUN_HILL_LAYOUTS,BUN_HILL_PHASES,getBunHillCrowdSlots,
 getBunHillDesignPhase,simulateBunHillDesignContest,getBunHillDesignContestFrame,rankBunHillDesignResults};
