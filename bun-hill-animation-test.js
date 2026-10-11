// In-game character animation preview. This does not start a city festival.
let bunHillAnimationTestSession=null;
function closeBunHillClimberAnimationTest() {
  const session=bunHillAnimationTestSession;
  if(!session)return;
  bunHillAnimationTestSession=null;session.closed=true;
  cancelAnimationFrame(session.raf);document.removeEventListener('keydown',session.keydown,true);
  session.root.remove();session.focusBefore?.focus?.();
}
function openBunHillClimberAnimationTest() {
  if(typeof isVisualRouteCalibrationTestModeEnabled!=='function'||!isVisualRouteCalibrationTestModeEnabled())return false;
  if(bunHillAnimationTestSession){bunHillAnimationTestSession.root.focus();return true;}
  const root=document.createElement('div');root.id='bun-hill-animation-test';
  root.style.cssText='position:fixed;inset:0;z-index:100005;background:#00101dc9;display:flex;align-items:center;justify-content:center;padding:20px;';
  root.innerHTML=`<style>#bun-hill-animation-test button,#bun-hill-animation-test select{background:#23394d;color:#edf6ff;border:1px solid #7893ad;border-radius:5px;padding:7px 12px;font:inherit;cursor:pointer}#bun-hill-animation-test button:disabled{opacity:.5;cursor:wait}#bun-hill-animation-test input{accent-color:#e0b875}#bun-hill-animation-test td{border-bottom:1px solid #314d65;padding:4px 6px}#bun-hill-animation-test th{text-align:left}</style><section role="dialog" aria-modal="true" aria-labelledby="bun-animation-title" tabindex="-1" style="width:min(960px,95vw);max-height:90vh;overflow:auto;border:1px solid #647e92;border-radius:12px;padding:20px;background:#102233;color:#e7edf5;font:14px/1.5 system-ui;">
  <div style="display:flex;align-items:center;justify-content:space-between"><strong id="bun-animation-title">搶包山選手動畫測試</strong><button data-action="close" aria-label="關閉選手動畫測試">關閉</button></div>
  <p>選手 1.7 米、包山示意 14 米。此預覽不扣款、不改城市時間、不啟動城市活動。</p>
  <div style="display:flex;gap:18px;flex-wrap:wrap"><canvas width="480" height="410" style="width:min(480px,100%);background:#0b1b28;border-radius:8px;" aria-label="搶包山選手動畫"></canvas><div style="flex:1;min-width:260px"><strong data-clock></strong><p data-status>載入人物素材…</p><table style="width:100%;font-size:12px;"><thead><tr><th>選手</th><th>動作</th><th>包数</th><th>分數</th></tr></thead><tbody></tbody></table></div></div>
  <input data-seek type="range" min="0" max="180" step="0.1" value="0" aria-label="比賽時間" style="width:100%;">
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button data-action="play" disabled>播放</button><button data-action="restart">重播</button><button data-action="rotate">旋轉視角</button><select data-speed aria-label="播放速度"><option value="3">3×（一分鐘睇完）</option><option value="1">1× 原速</option></select></div><p data-awards></p>
  <small>紅衫男／綠衫女，腰部錨點保持一致；上攀、取包及回程跟同一場賽事計分。實體包山、場地選址及完整節日排程另外接入。</small></section>`;
  const session={root,focusBefore:document.activeElement,closed:false,assets:null,contest:simulateBunHillDesignContest(`${typeof city==='undefined'?'香城':city.name}:${typeof city==='undefined'?2026:city.year}`),time:0,playing:false,rotation:0,raf:0,previous:performance.now()};
  bunHillAnimationTestSession=session;
  const q=selector=>root.querySelector(selector),poses={waiting:'待命',climbing:'上攀',collecting:'搶包',descending:'下降',grounded:'已落地'};
  const render=()=>{
    if(session.closed)return;
    const frame=getBunHillDesignContestFrame(session.contest,session.time);
    q('[data-seek]').value=session.time;q('[data-clock]').textContent=`餘下 ${Math.floor(frame.remaining/60)}:${String(Math.floor(frame.remaining%60)).padStart(2,'0')}`;
    if(session.assets){
      drawBunHillAnimatedContest(q('canvas').getContext('2d'),session.assets,session.contest,frame,session.rotation);
      q('[data-status]').textContent=frame.time===180?'已完賽；逾時者 DQ':frame.lastMinute?'最後一分鐘，留時間落地！':'選手各自上攀、搶包及回程';
    }
    q('tbody').innerHTML=frame.contestants.map(p=>`<tr style="color:${p.dq?'#ffa29a':'inherit'}"><td>${p.name}${p.gender==='female'?' ♀':''}</td><td>${p.dq?'逾時 DQ':poses[p.pose]}</td><td>${p.buns}</td><td>${p.score}</td></tr>`).join('');
    q('[data-awards]').textContent=frame.awards?`包山王：${frame.awards.men[0]?.name||'未產生'}　包山后：${frame.awards.women[0]?.name||'未產生'}　代代平安：${frame.awards.mostBuns?.name||'未產生'}`:'比賽未完成，未公布冠軍。';
    q('[data-action=play]').textContent=session.playing?'暫停':'播放';
  };
  const stop=()=>{session.playing=false;render();};
  q('[data-action=close]').onclick=closeBunHillClimberAnimationTest;
  q('[data-action=play]').onclick=()=>{if(!session.assets)return;if(session.time>=180)session.time=0;session.playing=!session.playing;session.previous=performance.now();render();};
  q('[data-action=restart]').onclick=()=>{session.time=0;stop();};
  q('[data-action=rotate]').onclick=()=>{session.rotation=(session.rotation+1)%4;render();};
  q('[data-seek]').oninput=event=>{session.time=Number(event.target.value);stop();};
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  session.keydown=event=>{
    if(session.closed)return;
    event.stopImmediatePropagation();
    if(!session.closed&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeBunHillClimberAnimationTest();}
    else if(event.key==='Tab'){
      const nodes=[...root.querySelectorAll('button:not(:disabled),input,select')],i=nodes.indexOf(document.activeElement);
      if((!event.shiftKey&&i===nodes.length-1)||(event.shiftKey&&i<=0)){event.preventDefault();nodes[event.shiftKey?nodes.length-1:0]?.focus();}
    }
  };
  document.addEventListener('keydown',session.keydown,true);document.body.appendChild(root);q('section').focus();
  loadBunHillClimberAnimationAssets().then(assets=>{if(session.closed)return;session.assets=assets;q('[data-action=play]').disabled=false;render();}).catch(error=>{if(!session.closed)q('[data-status]').textContent=error.message;});
  const tick=now=>{if(session.closed)return;if(session.playing){session.time=Math.min(180,session.time+(now-session.previous)/1000*Number(q('[data-speed]').value));if(session.time>=180)session.playing=false;render();}session.previous=now;session.raf=requestAnimationFrame(tick);};
  render();session.raf=requestAnimationFrame(tick);return true;
}
