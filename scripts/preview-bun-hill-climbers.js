// Isolated Electron verification: no user save or city is changed.
const fs=require('node:fs');
module.exports=async({evaluate,waitFor,bringToFront,screenshot,sleep,consoleLines})=>{
 await waitFor('typeof activeScene!=="undefined"&&gameReady');
 await evaluate('startNewGame("包山人物動畫測試城")');
 await evaluate(`(()=>{stopSimTimer();simPaused=true;hideLandingScreen();setVisualRouteCalibrationTestModeEnabled(true);return true;})()`);
 await waitFor('document.querySelector(".vrp-bun-climber-btn")');
 const before=await evaluate(`({budget:city.budget,month:city.month,time:city.timeOfDayMinutes,environment:city.environmentMinutes})`);
 await evaluate(`document.querySelector('.vrp-bun-climber-btn').click();true`);
 await waitFor('bunHillAnimationTestSession?.assets?.images.size===24');
 await bringToFront();
 const frames=[];
 for(const time of [0,20,70,170,180]){
  const state=await evaluate(`(()=>{
    const root=document.getElementById('bun-hill-animation-test'),seek=root.querySelector('[data-seek]');
    seek.value=${time};seek.dispatchEvent(new Event('input'));
    const frame=getBunHillDesignContestFrame(bunHillAnimationTestSession.contest,${time});
    return {time:${time},poses:[...new Set(frame.contestants.map(p=>p.pose))],rows:root.querySelectorAll('tbody tr').length};
  })()`);
  if(state.rows!==12)throw Error('missing athletes');frames.push(state);
  await sleep(200);
  await screenshot(`.data/bun-hill-design/climber-game-${time}.png`);
 }
 const checks=await evaluate(`(()=>{
   const root=document.getElementById('bun-hill-animation-test');
   const rows=()=>[...root.querySelectorAll('tbody tr')].map(r=>r.textContent);
   const final=rows();const seek=root.querySelector('[data-seek]');
   seek.value=20;seek.dispatchEvent(new Event('input'));seek.value=180;seek.dispatchEvent(new Event('input'));
   const same=JSON.stringify(rows())===JSON.stringify(final);
   for(let i=0;i<4;i++)root.querySelector('[data-action=rotate]').click();
   const rotationRestored=bunHillAnimationTestSession.rotation===0;
   seek.value=20;seek.dispatchEvent(new Event('input'));root.querySelector('[data-action=play]').click();
   return {same,rotationRestored,playing:bunHillAnimationTestSession.playing};
 })()`);
 await sleep(350);
 const moved=await evaluate('bunHillAnimationTestSession.time>20');
 await evaluate('closeBunHillClimberAnimationTest();true');
 const after=await evaluate(`({budget:city.budget,month:city.month,time:city.timeOfDayMinutes,environment:city.environmentMinutes})`);
 const closed=await evaluate('!document.getElementById("bun-hill-animation-test")&&bunHillAnimationTestSession===null');
 if(!checks.same||!checks.rotationRestored||!checks.playing||!moved||!closed||JSON.stringify(before)!==JSON.stringify(after))throw Error(JSON.stringify({checks,moved,closed,before,after}));
 const failures=consoleLines.filter(s=>s.includes('EXCEPTION'));if(failures.length)throw Error(failures.join('\n'));
 fs.writeFileSync('.data/bun-hill-design/climber-game-check.json',JSON.stringify({frames,checks,moved,closed,before,after},null,2));
 console.log(JSON.stringify({frames,checks,moved,closed,cityUnchanged:true}));
};
