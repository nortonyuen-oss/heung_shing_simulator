// Builds a reviewable site plan; this does not enable a live festival in the game.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.data/bun-hill-design');
fs.mkdirSync(out,{recursive:true});
const {BUN_HILL_LAYOUTS}=require('../festival-bun-hill');
const measuredParts=JSON.parse(fs.readFileSync(path.join(root,'data/bun-hill-geometry.json'),'utf8')).parts;
const climberMetadata=JSON.parse(fs.readFileSync(path.join(root,'data/bun-hill-climbers.json'),'utf8'));
const standard={...BUN_HILL_LAYOUTS.standard,w:80,d:60};
const compact={...BUN_HILL_LAYOUTS.compact,w:60,d:40};
function diagram(layout){
 const k=7,ox=56,oy=70,W=layout.w*k+112,H=layout.d*k+120;
 const rect=(x,y,w,h,color,stroke='none',alpha=1)=>`<rect x="${ox+x*k}" y="${oy+y*k}" width="${w*k}" height="${h*k}" fill="${color}" stroke="${stroke}" opacity="${alpha}"/>`;
 const label=(x,y,text,color='#e5eff9',size=13)=>`<text x="${ox+x*k}" y="${oy+y*k}" text-anchor="middle" font-family="sans-serif" font-size="${size}" fill="${color}">${text}</text>`;
 const object=(point,w,h,text,color)=>rect(point[0]-w/2,point[1]-h/2,w,h,color,'#c8dbea')+label(point[0],point[1]+.7,text,'#091826',12);
 let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${layout.w}乘${layout.d}米搶包山場地平面圖"><rect width="${W}" height="${H}" fill="#0c1926"/>`;
 s+=rect(0,-7,layout.w,7,'#123f58')+label(layout.w/2,-2.5,'海面：不放包山、舞台或觀眾','#8bd9ff');
 s+=rect(0,0,layout.w,layout.d,'#8a453d','#bbae96');
 const back=6;
 s+=rect(0,0,layout.w,6,'#356452')+rect(0,0,6,layout.d,'#356452')+rect(layout.w-6,0,6,layout.d,'#356452')+rect(0,layout.d-back,layout.w,back,'#356452');
 for(let x=0;x<=layout.w;x+=20)s+=`<path d="M ${ox+x*k} ${oy} V ${oy+layout.d*k}" stroke="#91adbf" opacity=".28"/>`;
 for(let y=0;y<=layout.d;y+=20)s+=`<path d="M ${ox} ${oy+y*k} H ${ox+layout.w*k}" stroke="#91adbf" opacity=".28"/>`;
 s+=rect(...layout.core,'#753f44','#f09785',.65)+label(layout.tower[0],layout.core[1]+2,'圍欄／競賽禁入區','#ffc2ad',11);
 layout.crowds.forEach(c=>{s+=rect(...c,'#4e6695','#a8b9ef')+label(c[0]+c[2]/2,c[1]+c[3]/2,'觀眾','#f2f4ff',11);});
 s+=object(layout.tower,...measuredParts.bunHill1.reserveM,'主塔','#ffc765')+label(layout.tower[0],layout.tower[1]+7,'包身約 5.5m','#ffe0a1',11);
 layout.decor.forEach((p,i)=>s+=object(p,...measuredParts['bunHill'+(i+2)].reserveM,'副塔','#c68d60'));
 s+=object(layout.stage,...measuredParts.bunHillStage.reserveM,'戲棚','#d9848a');
 s+=`<path d="M ${ox+layout.stage[0]*k} ${oy+(layout.stage[1]+3)*k} v ${4*k} l -4 -7 m 4 7 l 4 -7" stroke="#ffe6ad" fill="none" stroke-width="2"/>`;
 for(const path of layout.fences)s+=`<polyline points="${path.map(([x,y])=>`${ox+x*k},${oy+y*k}`).join(' ')}" stroke="#dfcaaa" fill="none" stroke-width="4"/>`;
 layout.signboards.forEach(b=>s+=object(b.point,...(b.axis?[4,8]:[8,4]),'花牌','#e2b691'));
 s+=label(layout.w/2,4,'海旁通行帶 6m','#baebcf',12)+label(layout.w/2,layout.d-2,'工作通道／後方保留帶','#baebcf',12);
 s+=label(3,layout.d/2,'出口','#baebcf',10)+label(layout.w-3,layout.d/2,'出口','#baebcf',10);
 s+=label(layout.w/2,layout.d+5,`${layout.w} × ${layout.d} 米 · ${layout.w/20} × ${layout.d/20} 格 · 每格 20m · 前沿三組觀眾`);
 return s+'</svg>';
}
const maps={standard:diagram(standard),compact:diagram(compact)};
for(const [name,svg] of Object.entries(maps))fs.writeFileSync(path.join(out,name+'.svg'),svg);
const assets=['bunHill1','bunHill2','bunHill3','bunHillStage','bunHillSignboard','bunHillClimbersSheet-v1'];
let inspection='';
const inspectionFile=path.join(out,'venue-inspection.json');
if(fs.existsSync(inspectionFile)){const data=JSON.parse(fs.readFileSync(inspectionFile,'utf8'));inspection=`太子：${data.promenadeTiles} 格海濱步道，標準及最小布局的初步地形合格候選均為 0。需另外預留岸上平坦空地；尚未執行細部通道及路燈避讓。`;}
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>海旁搶包山之夜｜設計預覽</title><style>
body{margin:0;background:#091521;color:#e7edf5;font:16px/1.6 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:28px 24px}h1{font-size:28px;margin:0}p{color:#b6c8d8}button,select{background:#23394d;color:#edf6ff;border:1px solid #7893ad;border-radius:6px;padding:8px 14px;margin:5px 8px 5px 0;font:inherit;cursor:pointer}button[aria-pressed=true]{background:#bd843c;color:#101a23}svg{width:100%;max-height:610px}section{background:#102233;border:1px solid #314d65;border-radius:12px;padding:18px;margin:18px 0}a{color:#93d5ff}.assets{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.assets img{width:100%;height:180px;object-fit:contain;background:#1d3040}.assets figcaption{font-size:13px;color:#c4d4e2}figure{margin:0}.tag{color:#ffc982}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:5px 7px;border-bottom:1px solid #314d65;text-align:left}small{color:#aac0d3}input[type=range]{width:100%;accent-color:#e0b875}.race{display:grid;grid-template-columns:1fr 1fr;gap:20px}canvas{width:100%;background:#0b1b28;border-radius:8px}.dq{color:#ffa29a}.clock{font-size:24px;color:#ffdc95;font-variant-numeric:tabular-nums}.awards{padding:10px;background:#213b35;color:#d7f3de}@media(max-width:750px){.race{grid-template-columns:1fr}}
</style><main><div class="tag">活動設計原型 · 尚未接入城市排程</div><h1>海旁搶包山之夜</h1><p>活動空地 × 海濱步道 · 一格 20m · 現場包身約 5.5m／欄杆 1.1m<br>先睇場地需求，再拖時間睇完整賽事。選手已使用拆幀校準後的人物動畫；包山仍以尺寸示意展示。</p>
<section><button id="standard" aria-pressed="true">標準：4×3 格</button><button id="compact" aria-pressed="false">最小：3×2 格</button><div id="map">${maps.standard}</div><small>綠色：保留通道　紅色：競賽禁入區　藍色：觀眾區　黃色：主塔；海濱步道接在廣場外側，不能借用水面或道路。</small><p id="description"></p></section>
<section><strong>節目時間線</strong><p><span id="programmeClock" class="clock"></span>　<span id="programmePhase"></span></p><input id="programme" type="range" min="720" max="1200" step="1" value="1085" aria-label="節目時間"><small>18:00 搭台 → 23:30 開幕 → 午夜個人賽 → 接力及頒獎 → 02:00 收檔。此游標不改變遊戲時間。</small></section>
<section><strong>午夜個人決賽</strong><p>12 位選手，9 男 3 女；高／中／低區為 9／3／1 分。三分鐘前雙腳着地才有有效成績。</p><div class="race"><div><canvas id="tower" width="480" height="410" aria-label="包山攀爬位置及繩索示意"></canvas><small>紅衫男選手／綠衫女選手，上攀 A/B、取包及下降採同一批校準素材；塔後選手會被塔身遮擋。包山是尺寸示意。</small></div><div><div class="clock" id="countdown"></div><p id="raceStatus"></p><table><thead><tr><th>選手</th><th>動作</th><th>包數</th><th>分數</th></tr></thead><tbody id="scoreboard"></tbody></table></div></div><input id="raceTime" type="range" min="0" max="180" step="0.1" value="60" aria-label="比賽秒數"><button id="play">播放完整賽事</button><select id="speed" aria-label="播放速度"><option value="3">3×（60 秒睇完）</option><option value="1">原速（180 秒）</option></select><button id="restart">重播同一場</button><div class="awards" id="awards"></div><p>同一場比賽使用固定事件時間線，拖動或重播都唔會重新抽冠軍。最後一分鐘會提醒回程；逾時仍在塔上會 DQ。</p></section>
<section><strong>香城討論區／走馬燈設計</strong><p>入夜：「香城海旁搶包山之夜今晚登場，午夜競逐包山王及包山后。」</p><p>開賽：「最後一分鐘！選手要留時間落返地面。」</p><p>完賽：按實際得分列出男女冠軍、代代平安獎；如有逾時，列明取消資格，不當成意外事故。</p><p>天氣取消：只刊取消及退款資訊，不生成冠軍。原有背景音樂維持 30%，節目音樂單一循環至散場。</p></section>
<section><strong>已有素材／仍欠素材</strong><div class="assets">${assets.map(a=>`<figure><img src="../../scripts/source-art/festivals/original/bunHill/${a}.png" alt="${a}"><figcaption>${a}（未校正原圖）</figcaption></figure>`).join('')}</div><p>正式入遊戲前：左右 skew → Y/X 2:1 → 校準米制底座及塔高 → 2 的 n 次方畫布與鏡像。花牌文字保持可讀；完整花牌掛於左右欄杆，各三塊；不當作可穿過的入口。已拆出 24 格戴安全帶的男女選手動作，加 24 格鏡像，校準 1.7 米比例與腰部錨點；五款包山／戲棚／花牌已完成 2:1 校準、米制幾何、1024×1024 畫布及鏡像；遊戲場地測試已用真實素材，這頁仍保留示意塔。可摘取包層仍待製作。三款塔不當成滿包／半空／空塔。</p></section>
<section><strong>太子場地量度</strong><p>${inspection||'未有本輪存檔量度。'}</p><small>以上是加入活動空地前的歷史量度，不能判定目前存檔。需重新檢查新建廣場及入口。</small></section><a href="../../docs/bun-hill-night-design.md">完整設計文件</a> · <a href="https://www.lcsd.gov.hk/tc/bun/schedule.html">康文署節目參考</a></main>
<script src="../../festival-bun-hill.js"></script><script src="../../bun-hill-climber-animation.js"></script><script>
const maps=${JSON.stringify(maps)};let layout='standard',contest=simulateBunHillDesignContest(),cursor=60,playing=false,previous=0;
const el=id=>document.getElementById(id),timeLabel=s=>Math.floor(s/60).toString().padStart(2,'0')+':'+Math.floor(s%60).toString().padStart(2,'0');
const poses={waiting:'待命',climbing:'上攀',collecting:'搶包',descending:'落地中',grounded:'已落地'};
let climberAssets=null;loadBunHillClimberAnimationAssets('../../',${JSON.stringify(climberMetadata)}).then(assets=>{climberAssets=assets;render();}).catch(error=>{el('raceStatus').textContent=error.message;});
function drawTower(frame){if(climberAssets)drawBunHillAnimatedContest(el('tower').getContext('2d'),climberAssets,contest,frame);}
function render(){const frame=getBunHillDesignContestFrame(contest,cursor);el('raceTime').value=cursor;el('countdown').textContent='餘下 '+timeLabel(frame.remaining);el('raceStatus').textContent=cursor===180?'裁判點算：有效得分與逾時判定':frame.lastMinute?'最後一分鐘！留時間返回地面。':'上攀、取包、回程由每位選手策略決定';
 el('scoreboard').innerHTML=frame.contestants.map(p=>'<tr class="'+(p.dq?'dq':'')+'"><td>'+p.name+(p.gender==='female'?' ♀':'')+'</td><td>'+(p.dq?'逾時 DQ':poses[p.pose])+'</td><td>'+p.buns+'</td><td>'+p.score+'</td></tr>').join('');
 el('awards').textContent=frame.awards?'包山王：'+(frame.awards.men[0]?.name||'未產生')+'　包山后：'+(frame.awards.women[0]?.name||'未產生')+'　代代平安：'+(frame.awards.mostBuns?.name||'未產生'):'比賽未完，未公布冠軍。';drawTower(frame);
 const offset=Number(el('programme').value),phase=getBunHillDesignPhase(offset,layout);el('programmeClock').textContent=timeLabel(((offset+360)%1440)*60);el('programmePhase').textContent=phase.label;
 el('description').textContent=layout==='standard'?'80×60m 活動空地：主塔＋兩座展示塔＋戲棚；保留三隊三棒接力。':'60×40m 活動空地：只設主塔與戲棚，較少觀眾；保留完整個人賽及出口，略過接力。';}
for(const id of ['standard','compact'])el(id).onclick=()=>{layout=id;el('map').innerHTML=maps[id];for(const other of ['standard','compact'])el(other).setAttribute('aria-pressed',String(other===id));render();};
el('raceTime').oninput=()=>{playing=false;el('play').textContent='播放完整賽事';cursor=Number(el('raceTime').value);el('programme').value=1080+cursor/12;render();};
el('programme').oninput=()=>{playing=false;el('play').textContent='播放完整賽事';cursor=Math.max(0,Math.min(180,(Number(el('programme').value)-1080)*12));render();};
el('play').onclick=()=>{if(cursor>=180)cursor=0;playing=!playing;el('play').textContent=playing?'暫停':'播放完整賽事';previous=performance.now();};
el('restart').onclick=()=>{playing=false;cursor=0;el('programme').value=1080;el('play').textContent='播放完整賽事';render();};
function tick(now){if(playing){cursor=Math.min(180,cursor+(now-previous)/1000*Number(el('speed').value));el('programme').value=1080+cursor/12;render();if(cursor===180){playing=false;el('play').textContent='播放完整賽事';}}previous=now;requestAnimationFrame(tick);}render();requestAnimationFrame(tick);
</script></html>`);
console.log(path.relative(root,path.join(out,'index.html')));
