// 香城龍舟邀請賽. Pure geometry/results below; browser lifecycle at the end.
// Positions use map axes at 20 m/tile. Saved facts (weather/results/payment) never reroll on load.
const DB_COLOURS = Object.freeze(['red', 'green', 'blue', 'yellow', 'black', 'purple']);
const DB_STEPS = Object.freeze({ n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] });
const DB_TERMINAL = Object.freeze(['held', 'cancelled', 'noVenue', 'skipped']);
const DB_COLLISION_NEWS_IMAGE = 'UI/news/dragonBoatCollision.webp';
// Physical lengths match festival-assets.js; shoreside props never ride the swell.
function getDragonBoatFloatProfile(partId) {
  if (/^db(red|green|blue|yellow|black|purple)(NW|SW)$/.test(partId)) return { lengthM: 18, heave: 1, roll: 1 };
  const water = {
    dbrescueBoat: { lengthM: 7, heave: 1, roll: 1 },
    dbraceBuoy: { lengthM: 1.2, heave: 1, roll: 1 },
    dbstartMarker: { lengthM: 3, heave: 1, roll: 1 },
    dbgoalMarker: { lengthM: 4, heave: 1, roll: 1 },
    dbguardLine: { lengthM: 10, heave: .5, roll: 0 },
    dbpier: { lengthM: 8, heave: .55, roll: 0 },
  };
  return water[partId] || null;
}
function applyDragonBoatBobbing(sprite, time) {
  const p = sprite.festivalPlacement, profile = getDragonBoatFloatProfile(p.partId);
  if (!profile || typeof getTyphoonShelterBob !== 'function') return;
  const bob = getTyphoonShelterBob(time, p.row, p.col, dbHash(p.id), profile.lengthM, profile);
  // positionFestivalSprite resets the waterline anchor every frame: no accumulated drift.
  sprite.setPosition(sprite.x, sprite.y + bob.dy);
  sprite.setRotation(bob.roll);
}

function dbHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}
function dbPoint(course, along, across = 0) {
  const a = DB_STEPS[course.dir], n = DB_STEPS[course.sea];
  return { row: course.row + a[0] * along + n[0] * across, col: course.col + a[1] * along + n[1] * across };
}
function dbCourseValid(course, ctx) {
  if (!course || !DB_STEPS[course.dir] || !DB_STEPS[course.sea]) return false;
  const a = DB_STEPS[course.dir], n = DB_STEPS[course.sea];
  if (a[0]*n[0]+a[1]*n[1] !== 0 || ![200,270,500].includes(course.distanceM)) return false;
  // Whole hull + paddle envelope and an outside return corridor, sampled more finely than a tile.
  for (let s = -1; s <= course.distanceM / 20 + 1.01; s += .25) {
    for (let k = -.5; k <= 3.51; k += .25) {
      const p = dbPoint(course,s,k), r = Math.floor(p.row+.5), c = Math.floor(p.col+.5);
      if (!ctx.isSea(r,c) || ctx.isBlocked?.(r,c)) return false;
    }
  }
  return (course.venueTiles || []).length >= 6 && course.venueTiles.every(([r,c]) => ctx.hasPromenade(r,c));
}
// Exact cells checked by the validator: distinguish geometry from whole-tile reservation.
function dragonBoatCourseSpace(course) {
  if (!course || !DB_STEPS[course.dir] || !DB_STEPS[course.sea]) return null;
  const tiles = new Set();
  for (let s=-1;s<=course.distanceM/20+1.01;s+=.25) for(let k=-.5;k<=3.51;k+=.25) {
    const p=dbPoint(course,s,k);tiles.add(`${Math.floor(p.row+.5)}:${Math.floor(p.col+.5)}`);
  }
  const cells=[...tiles].map(k=>k.split(':').map(Number));
  const rows=cells.map(p=>p[0]),cols=cells.map(p=>p[1]);
  const minRow=Math.min(...rows),maxRow=Math.max(...rows),minCol=Math.min(...cols),maxCol=Math.max(...cols);
  const rowTiles=maxRow-minRow+1,colTiles=maxCol-minCol+1;
  return {raceLengthM:course.distanceM,bufferM:20,geometryLengthM:course.distanceM+40,geometryWidthM:80,
    minRow,maxRow,minCol,maxCol,rowTiles,colTiles,alongTiles:DB_STEPS[course.dir][0]?rowTiles:colTiles,
    acrossTiles:DB_STEPS[course.dir][0]?colTiles:rowTiles,tileCount:tiles.size,tiles:[...tiles]};
}
// The course (Norton, 2026-11-08: 要求太苛刻): a promenade run longer than five tiles, and room for the
// course anywhere in the sea off it within five tiles - parallel to that stretch of shore, its near
// lane 1 to 5 tiles out, slid along to wherever it fits (a stepped or jagged shore no longer rules a
// city out). The nearest to the shore wins (last year's course kept among those), then a stable order.
const DB_MAX_OFFSHORE_TILES = 5;
function selectDragonBoatCourse(ctx, preferred = '', distanceM = 270) {
  const runs = (ctx.runs || []).filter((run) => run.length >= 6);
  // (each sea cell asked once a search: the courses tried overlap, and the bridge check is slow)
  const cells = new Map();
  const open = (r, c) => {
    const k = r * 65536 + c;
    let v = cells.get(k);
    if (v === undefined) { v = !!ctx.isSea(r, c) && !ctx.isBlocked?.(r, c); cells.set(k, v); }
    return v;
  };
  const fast = { ...ctx, isSea: open, isBlocked: null };
  const distances = distanceM === 500 ? [500] : [270,200];
  // (the near lane, k -0.5, this far out: 1, 1.5 ... 5 tiles)
  const offsets = [];
  for (let off = 1.5; off <= DB_MAX_OFFSHORE_TILES + 0.5 + 1e-9; off += 0.5) offsets.push(off);
  // Bounded scan of each shoreline, including both ends; each shore tile its sea side and the ways along it.
  const anchors = [];
  for (const run of runs) {
    run.filter((_,i) => i % Math.max(1,Math.ceil(run.length/40)) === 0 || i === run.length-1).forEach(([r,c]) => {
      const sea = ctx.seaSideOf(r,c); if (!sea || ctx.isNearBridge?.(r,c)) return;
      (DB_STEPS[sea][0] ? ['e','w'] : ['n','s']).forEach((dir) => anchors.push({ r, c, sea, dir, run }));
    });
  }
  for (const distance of distances) {
    const len = distance / 20;
    // (where along the course its shore tile lies: the old place, two tiles before its end, first)
    const slides = [len - 2];
    for (let p = 0; p <= len + 1e-9; p += 2) if (Math.abs(p - (len - 2)) > 1e-9) slides.push(p);
    const make = ({ r, c, sea, dir, run }, off, start, plain) => {
      const n = DB_STEPS[sea], a = DB_STEPS[dir];
      return { id: plain ? `${r}:${c}:${sea}:${dir}:${distance}` : `${r}:${c}:${sea}:${dir}:${distance}:${off}:${start}`,
        row:r+n[0]*off-a[0]*start,col:c+n[1]*off-a[1]*start,dir,sea,distanceM:distance,
        venueTiles:run.slice(0,200), shoreRow:r,shoreCol:c };
    };
    // nearest the shore first: the first distance out that has a course anywhere along the shore
    for (const [oi, off] of offsets.entries()) {
      const candidates = [];
      for (const anchor of anchors) {
        slides.forEach((start, si) => {
          const course = make(anchor, off, start, oi === 0 && si === 0);
          if (dbCourseValid(course, fast)) candidates.push(course);
        });
      }
      if (!candidates.length) continue;
      candidates.sort((a,b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : a.id.localeCompare(b.id)));
      return candidates[0];
    }
  }
  return null;
}
function createDragonBoatTeams({ districtName='香城', companyName='', cityName='香城', seed='', happiness=.5, population=0 }) {
  const names=[`${districtName}街坊福利會`,'香城女神隊','李彩樺漁業聯會','漁民樂海鮮酒家','香城討論區毒L',`${companyName.trim() || cityName || '香城'}小輪職工會`];
  return DB_COLOURS.map((colour,i) => ({ id:`db-team-${i}`, name:names[i].slice(0,100),colour,
    strength: .45 + .35*dbMotionRandom(`${seed}:training:${i}`)+.1*Math.max(0,Math.min(1,happiness))+.1*Math.min(1,Math.log1p(Math.max(0,population))/15) }));
}
// Avalanche the old FNV hash: adjacent team IDs otherwise get almost identical draws.
function dbMotionRandom(text) {
  let h=Math.round(dbHash(text)*4294967296)>>>0;
  h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);
  return ((h^(h>>>16))>>>0)/4294967296;
}
function dbEase(u) {u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);}
function dragonBoatTrackPoint(entry,seconds) {
  const samples=entry.track;if(!samples?.length)return null;
  if(seconds<=0)return {alongM:0,acrossM:entry.lane*8};
  let lo=0,hi=samples.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(samples[mid][0]<=seconds)lo=mid;else hi=mid-1;}
  const a=samples[lo],b=samples[Math.min(lo+1,samples.length-1)],u=b[0]>a[0]?Math.max(0,Math.min(1,(seconds-a[0])/(b[0]-a[0]))):0;
  return {alongM:a[1]+(b[1]-a[1])*u,acrossM:a[2]+(b[2]-a[2])*u};
}
function dragonBoatRound(teams,seed,round,distanceM,lanes=null,version=2) {
  if(version===1)return teams.map((team,i)=>({teamId:team.id,lane:lanes?.[i]??i,
    seconds:distanceM/(3.1+team.strength+(.32*dbHash(`${seed}:${round}:${team.id}`)-.16)),
    surge:dbHash(`${seed}:surge:${round}:${team.id}`)})).sort((a,b)=>a.seconds-b.seconds||a.teamId.localeCompare(b.teamId));
  const random=(label,i='')=>dbMotionRandom(`${seed}:${round}:${label}:${i}`);
  const boats=teams.map((team,i)=>({teamId:team.id,lane:lanes?.[i]??i,seconds:0,distanceM,
    pace:1.65+3*team.strength+1.15*(random('form',i)-.5),reaction:.25+2.1*random('reaction',i),
    fatigue:.04+.22*random('fatigue',i),sprint:.04+.23*random('sprint',i),phase:random('phase',i)*Math.PI*2,
    control:.5+.5*random('control',i),along:0,across:(lanes?.[i]??i)*8,sideSpeed:0,slowUntil:0,incidents:[],samples:[[0,0,(lanes?.[i]??i)*8]]}));
  // An occasional steering lapse targets a neighbouring lane. Contact still requires
  // overlapping 18 m hulls; a faster boat already far ahead cannot be hit by script.
  const pairs=boats.flatMap((a,i)=>boats.slice(i+1).filter(b=>Math.abs(a.lane-b.lane)===1).map(b=>({a,b,gap:Math.abs(a.pace-b.pace)}))).sort((a,b)=>a.gap-b.gap);
  const pair=pairs[0],lapse=random('incident')<.36&&pair?{boat:random('culprit')<.5?pair.a:pair.b,other:random('culprit')<.5?pair.b:pair.a,start:10+12*random('lapse-time'),ended:false}:null;
  const contacted=new Set(),dt=.25;
  for(let step=1;step<=4000&&boats.some(b=>!b.seconds);step++){
    const time=step*dt;
    for(const b of boats){
      if(b.seconds)continue;
      const fraction=b.along/distanceM,rowing=Math.max(0,time-b.reaction),launch=dbEase(rowing/3.5);
      const cadence=1+.045*Math.sin(time*.85+b.phase)+.035*Math.sin(time*.23+b.phase*2);
      const effort=1-b.fatigue*fraction+b.sprint*dbEase((fraction-.72)/.28);
      const slowing=time<b.slowUntil?.27:1;
      let target=b.lane*8+(1.05+1.4*(1-b.control))*Math.sin(time*.14+b.phase)*dbEase(rowing/7);
      if(lapse?.boat===b&&!lapse.ended&&time>lapse.start){
        const u=time-lapse.start;target+=Math.sign(lapse.other.lane-b.lane)*10*dbEase(u/4)*(1-dbEase((u-8)/9));
      }
      b.sideSpeed=(b.sideSpeed+(target-b.across)*.38*dt)*.86;
      const previous=b.along;
      b.along+=Math.max(0,b.pace*launch*cadence*effort*slowing/(1+.10*Math.abs(b.sideSpeed)))*dt;
      b.across=Math.max(-3,Math.min(43,b.across+b.sideSpeed*dt));
      if(b.along>=distanceM){b.seconds=time-dt+dt*(distanceM-previous)/(b.along-previous);b.along=distanceM;}
    }
    for(let i=0;i<boats.length;i++)for(let j=i+1;j<boats.length;j++){
      const a=boats[i],b=boats[j],key=`${i}:${j}`;
      if(a.seconds||b.seconds||time<5||contacted.has(key)||Math.abs(a.along-b.along)>17||Math.abs(a.across-b.across)>2.8)continue;
      contacted.add(key);const sign=a.across<b.across?-1:1;
      a.sideSpeed=sign*1.4;b.sideSpeed=-sign*1.4;
      const hold=4+4*random('impact',key);a.slowUntil=time+hold;b.slowUntil=time+hold*.8;
      const place={seconds:time,alongM:(a.along+b.along)/2,acrossM:(a.across+b.across)/2};
      a.incidents.push({...place,otherTeamId:b.teamId});b.incidents.push({...place,otherTeamId:a.teamId});
      if(lapse&&(lapse.boat===a||lapse.boat===b))lapse.ended=true;
    }
    for(const b of boats)if(!b.seconds||b.samples.at(-1)[1]<distanceM)b.samples.push([b.seconds||time,b.along,b.across]);
  }
  return boats.map(b=>{
    if(!b.seconds)throw new Error('Dragon boat simulation failed to finish');
    const entry={teamId:b.teamId,lane:b.lane,seconds:b.seconds,distanceM,incidents:b.incidents,surge:random('surge',b.teamId)};
    // Derived positions stay out of save JSON: versioned seed + team snapshot restores them.
    Object.defineProperty(entry,'track',{value:b.samples,enumerable:false});return entry;
  }).sort((a,b)=>a.seconds-b.seconds||a.teamId.localeCompare(b.teamId));
}
function dragonBoatRanking(rounds,teams) {
  return teams.map((t) => ({ id:t.id, score:rounds.reduce((v,r) => v+6-r.findIndex(x=>x.teamId===t.id),0),
    seconds:rounds.reduce((v,r) => v+r.find(x=>x.teamId===t.id).seconds,0) })).sort((a,b)=>b.score-a.score||a.seconds-b.seconds||a.id.localeCompare(b.id));
}
function dragonBoatWeatherBad(weather={}) {
  return ['signal3','signal8','signal9','signal10'].includes(weather.typhoonStage) || ['red','black'].includes(weather.rainWarning);
}
function dragonBoatPhase(minute,delayed=false) {
  if (minute<360 || minute>=1080) return { kind:'off' };
  const rounds=delayed?[660,900]:[540,660,900];
  if (minute<480) return {kind:'setup'};
  for (let i=0;i<rounds.length;i++) if (minute>=rounds[i] && minute<rounds[i]+60) return {kind:'race',round:i,minute:minute-rounds[i]};
  return {kind:minute>=960?'awards':'waiting'};
}
// Monotone continuous motion: team surge changes the race, but never reverses the boat.
function dragonBoatProgress(t,entry,maxSeconds) {
  if(entry.track)return Math.max(0,Math.min(1,dragonBoatTrackPoint(entry,t*maxSeconds).alongM/entry.distanceM));
  const u=Math.max(0,Math.min(1,t*maxSeconds/entry.seconds));
  return u + .12*Math.sin(Math.PI*u)*(entry.surge-.5);
}
function dragonBoatPose(run,team,minute) {
  const c=run.course, phase=dragonBoatPhase(minute,run.delayed),L=c.distanceM/20;
  let lane=run.teams.indexOf(team),s=0,across=lane*.4,dir=c.dir;
  if (phase.kind==='race') {
    const round=run.rounds[phase.round],entry=round.find(e=>e.teamId===team.id);lane=entry.lane;across=lane*.4;
    const m=phase.minute;
    if (m<15) s=0;
    else if(m<50){
      const maxSeconds=Math.max(...round.map(e=>e.seconds)),elapsed=(m-15)/30*maxSeconds,finishMinute=15+30*entry.seconds/maxSeconds;
      const track=dragonBoatTrackPoint(entry,elapsed);
      s=elapsed<entry.seconds?L*dragonBoatProgress((m-15)/30,entry,maxSeconds):L+.55*dbEase((m-finishMinute)/5);
      if(track)across=track.acrossM/20+(lane*.4-track.acrossM/20)*dbEase((m-finishMinute)/5);
    }
    else {
      // Outer lanes depart first, with 0.6-minute separation. Boats return as a
      // convoy instead of merging onto the same point at the same instant.
      const t=m-50-(5-lane)*.6;
      if(t<0){s=L+.55;}
      else if(t<1){s=L+.55;across=lane*.4+(3-lane*.4)*t;dir=c.sea;}
      else if(t<5){s=L+.55+(1.45-(L+.55))*(t-1)/4;across=3;dir={n:'s',s:'n',e:'w',w:'e'}[c.dir];}
      else if(t<6){s=1.45;across=3+(lane*.4-3)*(t-5);dir={n:'s',s:'n',e:'w',w:'e'}[c.sea];}
      else if(t<7){s=1.45*(1-(t-6));across=lane*.4;dir={n:'s',s:'n',e:'w',w:'e'}[c.dir];}
      else {s=0;across=lane*.4;}
    }
  }
  // s is the forward-axis nose reference during racing; the return follows a
  // continuous hull-centre path, so changing the sprite heading cannot teleport it.
  const p=dbPoint(c,s-.45,across);
  return {...p,dir,lane,phase:phase.kind};
}
function normalizeDragonBoatRun(raw) {
  if (!raw || !Number.isInteger(raw.year) || !Number.isInteger(raw.month) || raw.month<1 || raw.month>12 || !['running',...DB_TERMINAL].includes(raw.status)) return null;
  const c=raw.course;
  const course=c && [c.row,c.col,c.shoreRow,c.shoreCol].every(Number.isFinite) && DB_STEPS[c.dir] && DB_STEPS[c.sea] && [200,270,500].includes(c.distanceM) ? {
    id:String(c.id||'').slice(0,60),row:c.row,col:c.col,shoreRow:c.shoreRow,shoreCol:c.shoreCol,dir:c.dir,sea:c.sea,distanceM:c.distanceM,
    venueTiles:(Array.isArray(c.venueTiles)?c.venueTiles:[]).filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isInteger)).slice(0,200)
  }:null;
  const teams=(Array.isArray(raw.teams)?raw.teams:[]).slice(0,6).map((t,i)=>({id:`db-team-${i}`,name:String(t.name||'').slice(0,100),colour:DB_COLOURS[i],strength:Math.max(.1,Math.min(1,Number(t.strength)||.5))}));
  if(['running','held'].includes(raw.status) && (!course||teams.length!==6||course.venueTiles.length<6)) return null;
  const seed=String(raw.seed||'').slice(0,120),delayed=!!raw.delayed;
  const motionVersion=raw.motionVersion===2?2:raw.motionVersion===1||Array.isArray(raw.rounds)?1:2;
  const count=delayed?1:2,rounds=course&&teams.length===6?Array.from({length:count},(_,i)=>dragonBoatRound(teams,seed,i,course.distanceM,null,motionVersion)):[];
  if(rounds.length){const rank=dragonBoatRanking(rounds,teams),slots=[2,3,1,4,0,5];rounds.push(dragonBoatRound(teams,seed,'final',course.distanceM,teams.map(t=>slots[rank.findIndex(x=>x.id===t.id)]),motionVersion));}
  return {year:raw.year,month:raw.month,status:raw.status,seed,course,teams,rounds,delayed,motionVersion,
    tier:['basic','standard','grand'].includes(raw.tier)?raw.tier:'standard',cost:Number.isFinite(Number(raw.cost))?Math.max(0,Number(raw.cost)):0,refund:Number.isFinite(Number(raw.refund))?Math.max(0,Number(raw.refund)):0,
    contactReports:[...new Set((Array.isArray(raw.contactReports)?raw.contactReports:[]).filter(s=>typeof s==='string').map(s=>s.slice(0,200)))].slice(-128),
    report:!!raw.report,effect:!!raw.effect,notified:!!raw.notified,reason:String(raw.reason||'').slice(0,120),lastMinute:Math.max(360,Math.min(1080,Number(raw.lastMinute)||360))};
}

// Browser integration. Static and moving sprites share the established festival positioning API.
let dragonBoatTickerTurn=0;
function getDragonBoatContext(scene) {
  const venue=getFestivalVenueContext(scene),blocked=new Set(typeof getFerryShelterTiles==='function'?getFerryShelterTiles():[]);
  const blockTrack=(points)=>{
    for(let i=1;i<(points||[]).length;i++){
      const a=points[i-1],b=points[i],ar=a.row??a[0],ac=a.col??a[1],br=b.row??b[0],bc=b.col??b[1];
      const steps=Math.ceil(Math.hypot(br-ar,bc-ac)*4);
      for(let k=0;k<=steps;k++){const t=steps?k/steps:0,r=Math.round(ar+(br-ar)*t),c=Math.round(ac+(bc-ac)*t);
        for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)blocked.add(`${r+dr}:${c+dc}`);}
    }
  };
  if(typeof getFerryState==='function')getFerryState().routes.forEach(r=>{const legs=getFerryRouteLegs(r);blockTrack(legs?.out?.points);blockTrack(legs?.back?.points);});
  if(typeof getVesselVisualState==='function')getVesselVisualState(scene)?.portStates?.forEach(p=>{blockTrack(p.route?.inboundTrack?.points);blockTrack(p.route?.outboundTrack?.points);});
  if(typeof typhoonShelterFleetCache!=='undefined')typhoonShelterFleetCache.forEach(g=>g.routeBySlot?.forEach(r=>blockTrack(r?.route)));
  const tiles=new Set(venue.promenadeTiles.map(([r,c])=>`${r}:${c}`));
  return {...venue,runs:orderFestivalPromenadeRuns(venue.promenadeTiles),hasPromenade:(r,c)=>tiles.has(`${r}:${c}`),
    isSea:(r,c)=>typeof isInsideMap==='function'&&isInsideMap(r,c)&&mapData[r][c]===WATER,
    isBlocked:(r,c)=>blocked.has(`${r}:${c}`)||(typeof isBridgeTile==='function'&&isBridgeTile(r,c))||(typeof isPromenadeNearBridge==='function'&&isPromenadeNearBridge(r,c))};
}
function dbWeatherReason() {
  const w=city.weather||{};
  return w.rainWarning==='black'?'黑色暴雨警告':w.rainWarning==='red'?'紅色暴雨警告':`${({signal3:'三號',signal8:'八號',signal9:'九號',signal10:'十號'})[w.typhoonStage]||''}風球`;
}
function dbRecord(run) {
  const final=run.rounds.at(-1),champion=run.status==='held'&&final?run.teams.find(t=>t.id===final[0].teamId).name:'';
  recordFestivalHistory({id:'dragonBoat',year:run.year,outcome:run.status==='running'?'held':run.status,cost:run.cost,income:run.refund,champion,distanceM:run.course?.distanceM||0});
}
function postDragonBoatReport(run) {
  if(run.report || typeof addForumPost!=='function')return;
  if(run.status==='skipped'&&run.reason==='唔辦')return;
  const final=run.rounds.at(-1),name=String(city.name||'香城'),venue=run.course?getDistrictNameForTile(run.course.shoreRow,run.course.shoreCol).zh:'海濱';
  let headline,body,image='',comments=[];
  if(run.status==='held'){
    const podium=final.slice(0,3).map(e=>run.teams.find(t=>t.id===e.teamId).name),gap=final[1].seconds-final[0].seconds;
    const rank=dragonBoatRanking(run.rounds.slice(0,-1),run.teams).findIndex(t=>t.id===final[0].teamId)+1;
    headline=rank>=4?`【爆冷捧盃】排位第${rank}照樣贏！${podium[0]}勇奪香城龍舟邀請賽`:
      gap<=.5?`【爭到最後】只差${gap.toFixed(3)}秒！${podium[0]}龍鼻先過線捧盃`:`【端午爭標】${podium[0]}勇奪${name}龍舟邀請賽　${podium[1]}、${podium[2]}分列亞季軍`;
    body=[`${name}龍舟邀請賽今日喺${venue}海濱對開海面完成。六隊沿${run.course.distanceM}米水道競渡，經過${run.rounds.length-1}輪排位同決賽，${podium[0]}以${final[0].seconds.toFixed(2)}秒率先衝線。`,
      ...final.map((e,i)=>`${i+1}. ${run.teams.find(t=>t.id===e.teamId).name}　${e.seconds.toFixed(2)}秒`),
      '本次香城龍舟邀請賽由薩利亞意式餐廳贊助。'];
    const contacts=run.rounds.flatMap((round,i)=>round.flatMap(e=>(e.incidents||[]).filter(event=>e.teamId<event.otherTeamId).map(event=>`${i===run.rounds.length-1?'決賽':'第'+(i+1)+'輪排位賽'}出現偏航相撞：${run.teams.find(t=>t.id===e.teamId).name}同${run.teams.find(t=>t.id===event.otherTeamId).name}相碰後減速及修正航向，完成時間已包含受阻。`)));
    body.splice(body.length-1,0,...contacts);
    if(contacts.length){headline=`【偏航相撞】${podium[0]}奪香城龍舟邀請賽冠軍　碰撞影響部分隊伍成績`;image=DB_COLLISION_NEWS_IMAGE;}
    comments=[{author:'食粽專員',text:'我負責食粽，佢哋負責爭氣。'},{author:'討論區網民',text:'毒L平時鬥打字，今次鬥扒船。'},{author:'食飯派',text:'薩利亞贊助？睇完龍舟就去食意粉。'}];
  }else{headline=`【${run.status==='noVenue'?'海旁未夠位':run.status==='skipped'?'籌辦費未落實':'未能完成'}】${name}龍舟邀請賽未能舉行`;
    body=[`本屆因${run.reason||'未有合格水道'}未能完成，唔會頒發城市盃。`,run.refund?`籌辦費已退回 $${run.refund.toLocaleString()}。`:'本屆安排已記入節慶年曆。'];}
  addForumPost({headline,body,image,source:'local',social:{comments}},{id:`festival-dragonBoat-${run.year}-${run.month}-report`,category:'城中熱話',author:'香城日報',outcome:`dragonBoat_${run.status}`,year:run.year,month:run.month});
  run.report=true;if(typeof addCityNews==='function')addCityNews(headline);
}
function finishDragonBoatRun(run,status,reason='') {
  if(run.status!=='running')return;
  run.status=status;run.reason=reason;
  if(status==='held'&&!run.effect){addCouncilTemporaryEffect(`festival:dragonBoat:${run.year}`,1,getFestivalEffects('dragonBoat',run.tier));run.effect=true;}
  if(status==='cancelled'){run.refund=Math.round(run.cost*(run.lastMinute<(run.delayed?660:540)?.5:.25));city.budget+=run.refund;}
  dbRecord(run);postDragonBoatReport(run);if(typeof queueCityChangeAutosave==='function')queueCityChangeAutosave();
}
function postDragonBoatContactNews(run,minute) {
  if(run.status!=='running'||typeof addForumPost!=='function')return;
  const starts=run.delayed?[660,900]:[540,660,900];
  run.contactReports ||= [];
  run.rounds.forEach((round,i)=>{
    if(minute<starts[i]+15)return;
    const elapsed=Math.min(Math.max(...round.map(e=>e.seconds)),(minute-starts[i]-15)/30*Math.max(...round.map(e=>e.seconds)));
    for(const entry of round)for(const event of entry.incidents||[]){
      if(event.seconds>elapsed)continue;
      const pair=[entry.teamId,event.otherTeamId].sort();
      const id=`festival-dragonBoat-${run.year}-${run.month}-contact-${i}-${pair.join('-')}-${Math.round(event.seconds*1000)}`;
      if(run.contactReports.includes(id))continue;
      const teams=pair.map(id=>run.teams.find(t=>t.id===id));if(teams.some(t=>!t))continue;
      const label=i===run.rounds.length-1?'決賽':`第${i+1}輪排位賽`;
      const headline=`【龍舟撞船】${teams[0].name}與${teams[1].name}在${label}偏航相撞`;
      addForumPost({headline,source:'local',image:DB_COLLISION_NEWS_IMAGE,body:[`${city.name||'香城'}龍舟邀請賽${label}進行至${event.seconds.toFixed(1)}秒，${teams[0].name}與${teams[1].name}在海濱對開賽道偏航相碰。`,'兩隊減速並修正航向後繼續競渡，碰撞受阻已反映在完成時間；名次以正式賽果為準。'],social:{comments:[{author:'海旁街坊',text:'睇龍舟都要睇埋航線，唔好淨係顧住衝！'}]}},
        {id,category:'城中熱話',author:'香城日報',outcome:'dragonBoat_collision',year:run.year,month:run.month});
      run.contactReports.push(id);
      if(typeof addCityNews==='function')addCityNews(headline);
      if(typeof queueCityChangeAutosave==='function')queueCityChangeAutosave();
    }
  });
}
function createCityDragonBoatRun(scene,minute,ctx) {
  const tier=getFestivalTier('dragonBoat'),year=city.year,month=city.month,seed=`${city.name}:${year}:dragonBoat`;
  const course=selectDragonBoatCourse(ctx,getCityFestivalState().venues.dragonBoat||'');
  const cost=getFestivalCost('dragonBoat',tier,city.population);
  const transport=typeof getTransportExpansionState==='function'?getTransportExpansionState().company:null;
  const raw={year,month,seed,course,tier,motionVersion:2,status:tier==='skip'?'skipped':!course?'noVenue':'running',cost:0,
    teams:createDragonBoatTeams({districtName:course?getDistrictNameForTile(course.shoreRow,course.shoreCol).zh:'香城',companyName:transport?.foundedYear?transport.name:'',cityName:city.name,seed,population:city.population,happiness:city.happiness}),
    delayed:dragonBoatWeatherBad(city.weather)&&minute<600,lastMinute:minute};
  if(raw.status==='running'){if(!spendBudget(cost)){raw.status='skipped';raw.reason='城市資金不足';}else raw.cost=cost;}
  if(tier==='skip')raw.reason='唔辦';else if(!course)raw.reason='欠合格直線水道及船隻通道';
  const run=normalizeDragonBoatRun(raw);getCityFestivalState().dragonBoat=run;if(run.status!=='running')dbRecord(run);
  if(run.status!=='running')postDragonBoatReport(run);
  if(run.delayed)showFestivalNotice('【天氣有變】龍舟賽延至上午10點再作安排');
  return run;
}
function dbView(scene,dir) {
  const [dr,dc]=DB_STEPS[dir],a=isoToScreen(0,0),b=isoToScreen(dc,dr);
  return {view:b.y<a.y?'NW':'SW',mirrored:b.x>a.x};
}
// Three 5 x 4 m groups line the sea edge of each 20 m shore cell. Centres are
// 7 m seaward, leaving the middle walkway clear and every footprint on land.
function dragonBoatSpectatorSlots(course,reserved,isAllowed,limit=Infinity) {
  const a=DB_STEPS[course.dir],n=DB_STEPS[course.sea],slots=[];
  for(const [row,col] of course.venueTiles){
    const along=(row-course.row)*a[0]+(col-course.col)*a[1];
    if(along<0||along>course.distanceM/20||reserved.has(`${row}:${col}`)||!isAllowed(row,col))continue;
    for(const offset of [-6,0,6]){if(slots.length>=limit)return slots;
      slots.push({row:row+n[0]*.35+a[0]*offset/20,col:col+n[1]*.35+a[1]*offset/20,shoreRow:row,shoreCol:col});}
  }
  return slots;
}
function dragonBoatCrowdPlacements(scene,run,minute,reserved) {
  if(minute<480||minute>=1020)return [];
  const now=scene.time?.now??Date.now(),key=`${run.year}:${run.month}:${run.course.id}:${run.tier}:${typeof mapRotation==='number'?mapRotation:0}`;
  if(scene.dragonBoatCrowdLayout?.key===key&&now<scene.dragonBoatCrowdLayout.next)return scene.dragonBoatCrowdLayout.items;
  const piers=typeof getPromenadePiers==='function'?getPromenadePiers().piers:new Set();
  const slots=dragonBoatSpectatorSlots(run.course,reserved,(r,c)=>isPromenadeTile(r,c)&&promenadeTileIsFree(r,c)&&!isPromenadeNearBridge(r,c)&&!piers.has(`${r}:${c}`)&&getPromenadeSeaSides(r,c).includes(run.course.sea));
  const [dr,dc]=DB_STEPS[run.course.sea],a=isoToScreen(0,0),b=isoToScreen(dc,dr),view=b.y<a.y?'Back':'Front';
  const items=slots.map((p,i)=>({id:`dragonBoat:crowd${i}`,partId:`dbspectators${view}${i%2+1}`,festival:'dragonBoat',mode:'tile',row:p.row,col:p.col,mirrored:b.x<a.x,crowd:true}));
  scene.dragonBoatCrowdLayout={key,next:now+2000,items};return items;
}
function dragonBoatPlacements(run,minute,scene) {
  if(!run.course||!['running','held'].includes(run.status)||minute>=1080)return [];
  const c=run.course,out=[];
  const add=(id,partId,row,col,extra={})=>out.push({id:`dragonBoat:${id}`,partId,festival:'dragonBoat',mode:'tile',row,col,...extra});
  const shore=c.venueTiles.slice().sort((a,b)=>Math.hypot(a[0]-c.shoreRow,a[1]-c.shoreCol)-Math.hypot(b[0]-c.shoreRow,b[1]-c.shoreCol));
  ['dbceremonyStage','dbchampionStand1',...Array(run.tier==='basic'?1:run.tier==='grand'?3:2).fill('dbviewersStage')].forEach((part,i)=>{const p=shore[i*2];if(p)add(`stand${i}`,part,...p,{alongDir:c.dir,align:'along'});});
  out.push(...dragonBoatCrowdPlacements(scene,run,minute,new Set(out.map(p=>`${p.row}:${p.col}`))));
  if(minute<1020){
    const end=c.distanceM/20;
    for(const side of [-.15,2.15])for(let s=0;s<=end;s+=1.5){const p=dbPoint(c,s,side);add(`buoy${side}:${s}`,'dbraceBuoy',p.row,p.col);}
    for(const s of [0,end])for(const side of [-.2,2.2]){const p=dbPoint(c,s,side);add(`marker${s}:${side}`,s?'dbgoalMarker':'dbstartMarker',p.row,p.col);}
    const rescue=dbPoint(c,end/2,3.35);add('rescue','dbrescueBoat',rescue.row,rescue.col,{alongDir:c.dir,align:'along'});
    const dock=dbPoint(c,-.65,3);add('dock','dbpier',dock.row,dock.col,{alongDir:c.dir,align:'along'});
    if(!run.delayed||minute>=600)run.teams.forEach(team=>{const p=dragonBoatPose(run,team,minute),v=dbView(scene,p.dir);add(team.id,`db${team.colour}${v.view}`,p.row,p.col,{mirrored:v.mirrored,teamId:team.id});});
  }
  return out;
}
function drawDragonBoatContacts(scene,run,minute) {
  const phase=dragonBoatPhase(minute,run.delayed),graphics=scene.dragonBoatContactGraphics;
  if(graphics)graphics.clear();
  if(phase.kind!=='race'||phase.minute<15||phase.minute>=45)return;
  const round=run.rounds[phase.round],elapsed=(phase.minute-15)/30*Math.max(...round.map(e=>e.seconds)),seen=new Set();
  for(const entry of round)for(const event of entry.incidents||[]){
    const age=elapsed-event.seconds,key=[entry.teamId,event.otherTeamId].sort().join(':');
    if(age<0||age>3||seen.has(key))continue;seen.add(key);
    if(!scene.dragonBoatContactGraphics){scene.dragonBoatContactGraphics=scene.add.graphics().setDepth(100000000);
      if(scene.worldMask)scene.dragonBoatContactGraphics.setMask(scene.worldMask);}
    const p=dbPoint(run.course,event.alongM/20,event.acrossM/20),at=getFestivalPlacementPoint(scene,{mode:'tile',row:p.row,col:p.col});
    const radius=10+age*6;scene.dragonBoatContactGraphics.lineStyle(2,0xffcf83,1-age/3);scene.dragonBoatContactGraphics.strokeEllipse(at.x,at.y,radius*2,radius);
  }
}
function clearDragonBoatSprites(scene) {
  if (typeof stopDragonBoatAudio === 'function') stopDragonBoatAudio(scene);
  scene.dragonBoatCrowdLayout=null;
  scene.dragonBoatToken=(scene.dragonBoatToken||0)+1;
  scene.dragonBoatContactGraphics?.destroy();scene.dragonBoatContactGraphics=null;
  scene.dragonBoatSprites?.forEach(s=>s.destroy());scene.dragonBoatSprites=new Map();
  scene.dragonBoatTextureKeys?.forEach(k=>{if(scene.textures.exists(k))scene.textures.remove(k);});scene.dragonBoatTextureKeys=new Set();scene.dragonBoatLoaded='';
}
async function loadDragonBoatSprites(scene,run) {
  const token=scene.dragonBoatToken=(scene.dragonBoatToken||0)+1;
  scene.dragonBoatContactGraphics?.destroy();scene.dragonBoatContactGraphics=null;
  const files=getFestivalParts('dragonBoat').flatMap(p=>getFestivalPartTextures(p).map(t=>t.file));
  await loadFestivalTextures(scene,files);
  if(scene.dragonBoatToken!==token){files.map(getFestivalSceneTextureKey).forEach(k=>{if(scene.textures.exists(k))scene.textures.remove(k);});return;}
  scene.dragonBoatTextureKeys=new Set(files.map(getFestivalSceneTextureKey));scene.dragonBoatLoaded=`${run.year}:${run.month}`;
}
function updateDragonBoat(scene,time) {
  if(typeof city==='undefined'||!scene)return;
  if(!isFestivalGameplayLive()){if(scene.dragonBoatLoaded||scene.dragonBoatLoading)clearDragonBoatSprites(scene);return;}
  const state=getCityFestivalState(),clock=getGameTimeOfDayMinutes(),minute=clock<360?clock+1440:clock,month=getFestivalMonth('dragonBoat',city.year);
  let run=state.dragonBoat;
  if(run?.status==='running'&&(run.year!==city.year||run.month!==city.month))finishDragonBoatRun(run,'held');
  if(!isFestivalEnabled('dragonBoat')||getFestivalTier('dragonBoat')==='skip'){
    if(run?.status==='running')finishDragonBoatRun(run,'cancelled','活動已關閉');
    if(scene.dragonBoatLoaded||scene.dragonBoatLoading)clearDragonBoatSprites(scene);return;
  }
  if(city.month!==month){if(scene.dragonBoatLoaded||scene.dragonBoatLoading)clearDragonBoatSprites(scene);return;}
  if(!festivalTextureMeta){loadFestivalTextureMeta();return;}
  if(!run||run.year!==city.year||run.month!==city.month){const ctx=getDragonBoatContext(scene);run=createCityDragonBoatRun(scene,minute,ctx);}
  if(run.status==='running'){
    run.lastMinute=minute;
    if(time>=(scene.dragonBoatValidateAt||0)){
      scene.dragonBoatValidateAt=time+2000;
      if(!dbCourseValid(run.course,getDragonBoatContext(scene)))finishDragonBoatRun(run,'cancelled','主會場或船隻通道已失效');
    }
    if(run.status==='running'&&dragonBoatWeatherBad(city.weather)){
      if(minute<540){if(!run.delayed){run.delayed=true;state.dragonBoat=run=normalizeDragonBoatRun(run);showFestivalNotice('【天氣有變】龍舟賽延至上午10點再作安排');}}
      else if((!run.delayed||minute>=600)&&minute<960)finishDragonBoatRun(run,'cancelled',dbWeatherReason());
    }
    postDragonBoatContactNews(run,minute);
    if(run.status==='running'&&minute>=960)finishDragonBoatRun(run,'held');
    run.lastMinute=minute;
    if(run.status==='running'&&minute>=900&&!run.notified){run.notified=true;showFestivalNotice('【香城龍舟邀請賽】六隊決賽開始！',()=>centerCameraOnTile(scene,run.course.shoreRow,run.course.shoreCol));}
  }
  if(run.status!=='running'&&!run.report)postDragonBoatReport(run);
  if(!['running','held'].includes(run.status)||minute>=1080){if(scene.dragonBoatLoaded||scene.dragonBoatLoading)clearDragonBoatSprites(scene);return;}
  const key=`${run.year}:${run.month}`;
  if(scene.dragonBoatLoaded!==key){if(!scene.dragonBoatLoading){scene.dragonBoatLoading=true;loadDragonBoatSprites(scene,run).catch(e=>console.warn('[dragonBoat]',e.message)).finally(()=>{scene.dragonBoatLoading=false;});}return;}
  if(!scene.dragonBoatSprites)scene.dragonBoatSprites=new Map();
  const wanted=dragonBoatPlacements(run,minute,scene),ids=new Set(wanted.map(p=>p.id));
  scene.dragonBoatSprites.forEach((s,id)=>{if(!ids.has(id)){s.destroy();scene.dragonBoatSprites.delete(id);}});
  wanted.forEach(p=>{
    let sprite=scene.dragonBoatSprites.get(p.id);
    if(!sprite){const key=getFestivalSceneTextureKey(getFestivalTexturePath(p.partId));if(!scene.textures.exists(key))return;
      sprite=scene.add.image(0,0,key);if(scene.worldMask)sprite.setMask(scene.worldMask);sprite.festivalSeed=0;
      if(p.teamId){sprite.setInteractive();sprite.on('pointerdown',()=>{const team=run.teams.find(t=>t.id===p.teamId);const phase=dragonBoatPhase(getGameTimeOfDayMinutes(),run.delayed),round=run.rounds[phase.round??run.rounds.length-1],entry=round.find(e=>e.teamId===team.id);showFestivalNotice(`${team.name}｜第${entry.lane+1}線道${run.status==='held'?`｜決賽第${round.indexOf(entry)+1}名 ${entry.seconds.toFixed(2)}秒`:''}`);});}
      scene.dragonBoatSprites.set(p.id,sprite);}
    sprite.festivalPlacement=p;if(positionFestivalSprite(scene,sprite))applyDragonBoatBobbing(sprite,time);
  });
  drawDragonBoatContacts(scene,run,minute);
  if(time>=(scene.dragonBoatCullAt||0)){scene.terrainViewportCacheKey=null;scene.dragonBoatCullAt=time+200;}
}
function getDragonBoatTickerNews() {
  const run=typeof city!=='undefined'?city.festivals?.dragonBoat:null;
  if(!run||run.year!==city.year||run.month!==city.month||!isFestivalEnabled('dragonBoat')||!['running','held'].includes(run.status)||(getGameTimeOfDayMinutes()<360||getGameTimeOfDayMinutes()>=1080))return null;
  const phase=dragonBoatPhase(getGameTimeOfDayMinutes(),run.delayed);
  const messages=[`【香城龍舟邀請賽】${run.course.distanceM}米海濱競渡，六隊爭標。`,
    '【香城龍舟邀請賽】綠色香城女神隊由女性鼓手領軍，鼓聲響起！',
    run.status==='held'?`【香城龍舟邀請賽】恭喜${run.teams.find(t=>t.id===run.rounds.at(-1)[0].teamId).name}奪冠！`:`【香城龍舟邀請賽】${phase.kind==='race'?'龍舟競渡進行中':'海旁看台等你嚟打氣'}。`,
    ['本次香城龍舟邀請賽由薩利亞意式餐廳贊助','【薩利亞意式餐廳】扒完龍舟，食返個意粉；睇完決賽，一齊開餐！'][Math.floor(dragonBoatTickerTurn/4)%2]];
  return messages[dragonBoatTickerTurn++%4];
}
function startDragonBoatEventTest(scene=typeof activeScene!=='undefined'?activeScene:null,minute=480) {
  if(!scene||!isFestivalGameplayLive()||!isVisualRouteCalibrationTestModeEnabled())return false;
  const ctx=getDragonBoatContext(scene);
  if(!selectDragonBoatCourse(ctx,getCityFestivalState().venues.dragonBoat||'')){
    showFestivalNotice('【龍舟測試】未有合格海濱步道及水道，請先安排場地。');return false;
  }
  stopSimTimer();clearDragonBoatSprites(scene);
  city.month=getFestivalMonth('dragonBoat',city.year);city.timeOfDayMinutes=minute;
  city.environmentMinutes=Math.floor(getEnvironmentMinutes()/1440)*1440+minute;resetGameClockAccumulator();
  city.weather={...city.weather,condition:'sunny',typhoonStage:'none',rainWarning:'none',rainfall:0};
  getCityFestivalState().enabled=true;setFestivalEnabled('dragonBoat',true);setFestivalTier('dragonBoat','standard');
  // Repeated debug launches should not charge the city's budget or create refunds.
  const budget=city.budget;let run;
  try{city.budget=Math.max(budget,getFestivalCost('dragonBoat','standard',city.population));run=createCityDragonBoatRun(scene,minute,ctx);}
  finally{city.budget=budget;}
  run.cost=0;
  const p=dbPoint(run.course,run.course.distanceM/40,1.2);
  setMapZoom(scene,1.1);centerCameraOnTile(scene,Math.round(p.row),Math.round(p.col));
  scene.sound.unlock();scene.sound.context?.resume()?.catch(()=>{});
  setSimSpeed(GAME_SPEEDS.SLOW);startSimTimer();updateSpeedButtons();updateHUD();updateTopbarGameTime();
  return true;
}
function previewDragonBoatFestival() {
  return startDragonBoatEventTest(typeof activeScene!=='undefined'?activeScene:null,905);
}
if(typeof module!=='undefined'&&module.exports)module.exports={DB_COLOURS,getDragonBoatFloatProfile,applyDragonBoatBobbing,dbPoint,dbCourseValid,dragonBoatCourseSpace,selectDragonBoatCourse,createDragonBoatTeams,dragonBoatRound,dragonBoatRanking,dragonBoatWeatherBad,dragonBoatPhase,dragonBoatProgress,dragonBoatTrackPoint,dragonBoatPose,dragonBoatSpectatorSlots,normalizeDragonBoatRun};
