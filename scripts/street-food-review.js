'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

/** Write an offline, interactive comparison of the source art and calibrated PNGs. */
async function writeStreetFoodReview({ root, previewDir, records }) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError('Street-food review needs at least one asset record.');
  }
  const directory = path.resolve(root, previewDir);
  const relativeUrl = (file) => path.relative(directory, path.resolve(root, file))
    .split(path.sep).map(encodeURIComponent).join('/');
  const payload = JSON.stringify(records.map((record) => ({
    ...record,
    sourceUrl: relativeUrl(record.sourcePath),
    outputUrl: relativeUrl(record.outputPath),
  }))).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="zh-HK">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>香港小食車仔 · 1:2 等角校正檢視</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,"PingFang HK","Noto Sans TC",sans-serif;background:#151917;color:#e9eee8;--muted:#aab7ad;--line:#3a493f;--accent:#c5e896}
*{box-sizing:border-box}body{margin:0;padding:24px;max-width:1800px;margin-inline:auto}h1{font-size:24px;letter-spacing:.03em;margin:0 0 7px}p{margin:0}.intro{color:var(--muted);font-size:14px;line-height:1.6}.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:22px 0 15px;padding:14px;background:#202820;border:1px solid var(--line);border-radius:12px}select,button{font:inherit;background:#2b382e;color:#f0f5ed;border:1px solid #52674f;border-radius:7px;padding:9px 12px}select{min-width:230px;max-width:100%;flex:1}button{cursor:pointer}button:hover{background:#3d4f37}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}label.control{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:14px}input[type=checkbox]{accent-color:#b6df80;width:16px;height:16px}input[type=range]{width:120px;accent-color:#b6df80}#zoom-value{min-width:38px;font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px}.meta{display:flex;flex-wrap:wrap;gap:7px 20px;font-size:14px;line-height:1.6;margin:0 2px 12px}.meta strong{color:var(--accent);font-weight:600}.note{color:var(--muted);font-size:14px;line-height:1.6;margin:0 2px 16px;min-height:22px}.comparison{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.panel{min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:#1d251f}.panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:12px 15px;border-bottom:1px solid var(--line)}.panel-head h2{font-size:16px;margin:0;font-weight:600}.dimensions{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}.viewport{position:relative;height:clamp(330px,48vw,610px);overflow:hidden;background-color:#242b26;background-image:linear-gradient(45deg,#303a32 25%,transparent 25%),linear-gradient(-45deg,#303a32 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#303a32 75%),linear-gradient(-45deg,transparent 75%,#303a32 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}canvas{display:block;width:100%;height:100%;touch-action:none}.panel-foot{padding:10px 14px;color:var(--muted);font-size:12px;line-height:1.65;min-height:55px;word-break:break-word}.status{margin-top:16px;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:#1c241e}.status-title{font-size:15px;font-weight:600;margin-bottom:10px}.legend{display:flex;flex-wrap:wrap;gap:7px 18px;font-size:13px;margin-bottom:12px}.legend-item{display:flex;align-items:center;gap:6px}.swatch{width:21px;height:3px;border-radius:2px}.validation{width:100%;border-collapse:collapse;font-size:13px;line-height:1.5}.validation td{border-top:1px solid #324035;padding:7px 4px;vertical-align:top}.validation td:first-child{color:var(--muted);width:50%}.validation td:last-child{font-variant-numeric:tabular-nums;word-break:break-word}.help{color:var(--muted);font-size:12px;margin-top:12px;line-height:1.7}#error{display:none;padding:15px;background:#59322c;border:1px solid #b66f62;border-radius:8px;margin-bottom:14px;white-space:pre-wrap}a{color:#d4eeae}details{margin-top:13px;font-size:12px;color:var(--muted)}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}code{font-family:ui-monospace,SFMono-Regular,monospace}.ok{color:#c5e896}.warning{color:#f1cf8b}@media(max-width:760px){body{padding:15px}h1{font-size:21px}.comparison{grid-template-columns:1fr}.viewport{height:420px}.toolbar{gap:10px}select{flex-basis:calc(100% - 120px)}.meta{display:block}.meta span{display:block}.panel-foot{min-height:0}}
</style>
</head>
<body>
<h1>香港小食車仔 · 1:2 等角校正</h1>
<p class="intro">以桌面或木箱基線對齊。網格每橫行 2 格、升降 1 格；兩邊使用同一像素比例，方便睇清楚角度同形狀嘅變化。</p>
<div class="toolbar">
  <button id="previous" type="button" aria-label="上一款">←</button>
  <select id="asset" aria-label="選擇素材"></select>
  <button id="next" type="button" aria-label="下一款">→</button>
  <label class="control"><input id="guides" type="checkbox" checked>基準線</label>
  <label class="control"><input id="grid" type="checkbox" checked>1:2 網格</label>
  <label class="control" for="zoom">縮放 <input id="zoom" type="range" min="50" max="250" value="100" step="5"></label>
  <span id="zoom-value">100%</span>
  <button id="fit" type="button">適合畫面</button>
</div>
<div id="error" role="alert"></div>
<div class="meta"><span>素材：<strong id="name"></strong></span><span>校正基準：<strong id="reference"></strong></span><span>判讀信心：<strong id="confidence"></strong></span></div>
<p class="note" id="note"></p>
<div class="comparison">
  <section class="panel"><div class="panel-head"><h2>原圖</h2><span class="dimensions" id="source-size"></span></div><div class="viewport" id="source-viewport"><canvas id="source-canvas" aria-label="原圖及基準線"></canvas></div><div class="panel-foot" id="source-lines"></div></section>
  <section class="panel"><div class="panel-head"><h2>1:2 校正版</h2><span class="dimensions" id="output-size"></span></div><div class="viewport" id="output-viewport"><canvas id="output-canvas" aria-label="校正版及基準線"></canvas></div><div class="panel-foot" id="output-lines"></div></section>
</div>
<div class="status"><div class="status-title">基準線及角度檢查</div><div class="legend" id="legend"></div><table class="validation"><tbody id="validation"></tbody></table><details><summary>素材路徑及完整檢查資料</summary><pre id="technical"></pre></details></div>
<p class="help">按 ← / → 換款；拖動畫面可同步移動兩張圖，雙擊或按「適合畫面」還原。基準線旁邊顯示斜率，1:2 兩軸應為 +0.5000 / −0.5000；直立物件會按可見橫桿檢查。</p>
<script id="asset-data" type="application/json">${payload}</script>
<script>
'use strict';
const records=JSON.parse(document.getElementById('asset-data').textContent);
const $=(id)=>document.getElementById(id);
const selector=$('asset'),zoom=$('zoom');
const sides=['source','output'];
let current=0,images={},loading=0,pan={x:0,y:0},drag=null;
const colors=['#ffdb72','#77e8d0','#f4a2df','#98baff'];
const confidenceNames={high:'高',medium:'中',low:'較低','medium-high':'中高','medium-low':'中低'};
const fieldNames={axes:'投影軸',axis:'軸',label:'項目',name:'名稱',reference:'校正基準',source:'原圖',output:'校正版',corrected:'校正版',positive:'正斜率軸',negative:'負斜率軸',slope:'斜率',sourceSlope:'原圖斜率',outputSlope:'校正版斜率',targetSlope:'目標斜率',actualSlope:'實測斜率',target:'目標',actual:'實測',error:'偏差',absoluteError:'絕對偏差',slopeError:'斜率偏差',angle:'角度',angleDegrees:'角度（度）',angleError:'角度偏差',pass:'通過',passed:'通過',ok:'符合',checks:'檢查',validation:'驗證',maxError:'最大偏差',maxPixelError:'最大像素偏差',tolerance:'容許偏差',unit:'單位',note:'備註',baseline:'基線',heldOut:'獨立驗證邊線',heldout:'獨立驗證邊線',referenceAxes:'基準軸',maxAxisError:'最大軸偏差',maxReferenceSlopeError:'基準斜率最大偏差',confidence:'判讀信心'};
records.forEach((record,index)=>{const option=document.createElement('option');option.value=index;option.textContent=(index+1)+' / '+records.length+'　'+record.label;selector.appendChild(option)});
function display(value){if(value==null)return'—';if(typeof value==='boolean')return value?'通過':'未通過';if(typeof value==='number')return Number.isInteger(value)?String(value):String(Number(value.toFixed(6)));if(typeof value==='object')return JSON.stringify(value);return String(value)}
function translated(key){return fieldNames[key]||key}
function validationRows(value,prefix='',rows=[]){
 if(value===null||typeof value!=='object'){rows.push([prefix||'檢查結果',display(value),typeof value==='boolean'?value:null]);return rows}
 if(Array.isArray(value)){value.forEach((item,index)=>{const label=item&&typeof item==='object'&&(item.label||item.name||item.axis);validationRows(item,prefix+(prefix?' · ':'')+(label||String(index+1)),rows)});return rows}
 Object.entries(value).forEach(([key,item])=>{if((key==='label'||key==='name'||key==='axis')&&prefix&&typeof item!=='object')return;validationRows(item,prefix+(prefix?' · ':'')+translated(key),rows)});return rows
}
function renderValidation(record){
 const table=$('validation');table.replaceChildren();const rows=validationRows(record.validation??'未提供額外檢查資料');
 rows.forEach(([name,value,result])=>{const row=document.createElement('tr'),key=document.createElement('td'),cell=document.createElement('td');key.textContent=name;cell.textContent=value;if(result!==null)cell.className=result?'ok':'warning';row.append(key,cell);table.appendChild(row)});
 $('technical').textContent='原圖：'+record.sourcePath+'\\n校正版：'+record.outputPath+'\\n\\n'+JSON.stringify(record.validation??{},null,2);
 const legend=$('legend');legend.replaceChildren();const seen=new Set();
 for(const side of sides)for(const [index,line]of(record.guideLines?.[side]||[]).entries()){const color=line.color||colors[index%colors.length],key=line.label+'|'+color;if(seen.has(key))continue;seen.add(key);const item=document.createElement('span'),swatch=document.createElement('span'),label=document.createElement('span');item.className='legend-item';swatch.className='swatch';swatch.style.backgroundColor=color;label.textContent=line.label||'基準線';item.append(swatch,label);legend.appendChild(item)}
}
function slopes(line){const points=line.points||[];if(points.length>2){const xs=points.map((p)=>p[0]),ys=points.map((p)=>p[1]);return'闊:高 ≈ '+((Math.max(...xs)-Math.min(...xs))/(Math.max(...ys)-Math.min(...ys))).toFixed(3)+':1'}const result=[];for(let index=1;index<points.length;index++){const a=points[index-1],b=points[index];if(!a||!b)continue;const dx=b[0]-a[0],dy=b[1]-a[1];result.push(Math.abs(dx)<1e-8?'垂直':(dy/dx>=0?'+':'−')+Math.abs(dy/dx).toFixed(4))}return result.join(' ／ ')}
function drawGrid(ctx,width,height){const spacing=48,base=height/2;ctx.save();ctx.strokeStyle='rgba(199,226,184,.19)';ctx.lineWidth=1;ctx.beginPath();for(let offset=-width-height;offset<width+height;offset+=spacing){ctx.moveTo(0,base+offset);ctx.lineTo(width,base+offset+width/2);ctx.moveTo(0,base+offset);ctx.lineTo(width,base+offset-width/2)}ctx.stroke();ctx.restore()}
function panelSize(side){const box=$(side+'-viewport').getBoundingClientRect();return{width:box.width,height:box.height}}
function contentSize(side,record){return side==='source'?[record.sourceCrop[2],record.sourceCrop[3]]:[images.output.naturalWidth,images.output.naturalHeight]}
function paint(){
 if(!images.source||!images.output)return;const record=records[current],dimensions=sides.map((side)=>contentSize(side,record)),viewports=sides.map(panelSize);
 const maximumWidth=Math.max(...dimensions.map((size)=>size[0])),maximumHeight=Math.max(...dimensions.map((size)=>size[1]));
 const commonScale=Math.min(...viewports.map((size)=>Math.min((size.width-46)/maximumWidth,(size.height-46)/maximumHeight)))*Number(zoom.value)/100;
 sides.forEach((side,sideIndex)=>{
  const canvas=$(side+'-canvas'),size=viewports[sideIndex],dpr=window.devicePixelRatio||1;canvas.width=Math.round(size.width*dpr);canvas.height=Math.round(size.height*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size.width,size.height);
  const [width,height]=dimensions[sideIndex],x=(size.width-width*commonScale)/2+pan.x,y=(size.height-height*commonScale)/2+pan.y;
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  if(side==='source'){const [left,top,cropWidth,cropHeight]=record.sourceCrop;ctx.drawImage(images.source,left,top,cropWidth,cropHeight,x,y,width*commonScale,height*commonScale)}else ctx.drawImage(images.output,x,y,width*commonScale,height*commonScale);
  ctx.restore();if($('grid').checked)drawGrid(ctx,size.width,size.height);
  const lines=record.guideLines?.[side]||[];
  if($('guides').checked)lines.forEach((line,index)=>{
   if(!Array.isArray(line.points)||line.points.length<2)return;const points=line.points.map((point)=>[x+point[0]*commonScale,y+point[1]*commonScale]),color=line.color||colors[index%colors.length];
   ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();points.forEach(([px,py],pointIndex)=>pointIndex?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.strokeStyle='rgba(9,17,11,.88)';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();
   points.forEach(([px,py],pointIndex)=>{if(points.length>2&&pointIndex%24!==0)return;ctx.beginPath();ctx.arc(px,py,3.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#132017';ctx.lineWidth=1;ctx.stroke()});
   const caption=(line.label||'基準線')+' '+slopes(line);ctx.font='600 12px system-ui,sans-serif';const textWidth=ctx.measureText(caption).width,labelX=Math.max(5,Math.min(size.width-textWidth-13,points[0][0]+8)),labelY=Math.max(22,Math.min(size.height-8,points[0][1]-10));ctx.fillStyle='rgba(10,19,12,.9)';ctx.fillRect(labelX-5,labelY-15,textWidth+10,21);ctx.fillStyle=color;ctx.fillText(caption,labelX,labelY);ctx.restore();
  });
  $(side+'-lines').textContent=lines.length?lines.map((line)=>(line.label||'基準線')+'：'+slopes(line)).join('　｜　'):'此物件以整體輪廓或配套物件作基準。';
 });
}
function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('讀唔到圖片：'+url+'\\n請保留 HTML 同素材原本嘅資料夾位置。'));image.src=url})}
async function selectAsset(index){
 current=(index+records.length)%records.length;selector.value=String(current);const record=records[current],ticket=++loading;images={};pan={x:0,y:0};zoom.value='100';$('zoom-value').textContent='100%';$('error').style.display='none';$('name').textContent=record.label;$('reference').textContent=display(record.reference);$('confidence').textContent=confidenceNames[record.confidence]||display(record.confidence);$('note').textContent=record.note||'';$('source-size').textContent=record.sourceCrop[2]+' × '+record.sourceCrop[3]+' px';$('output-size').textContent=(record.outputSize||[]).join(' × ')+' px';renderValidation(record);
 for(const side of sides){const canvas=$(side+'-canvas');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);$(side+'-lines').textContent='載入中…'}
 try{const loaded=await Promise.all([loadImage(record.sourceUrl),loadImage(record.outputUrl)]);if(ticket!==loading)return;images={source:loaded[0],output:loaded[1]};$('output-size').textContent=images.output.naturalWidth+' × '+images.output.naturalHeight+' px';paint();location.hash=encodeURIComponent(record.id)}catch(error){if(ticket!==loading)return;$('error').textContent=error.message;$('error').style.display='block'}
}
function fit(){pan={x:0,y:0};zoom.value='100';$('zoom-value').textContent='100%';paint()}
selector.addEventListener('change',()=>selectAsset(Number(selector.value)));$('previous').addEventListener('click',()=>selectAsset(current-1));$('next').addEventListener('click',()=>selectAsset(current+1));$('fit').addEventListener('click',fit);for(const name of ['guides','grid'])$(name).addEventListener('change',paint);zoom.addEventListener('input',()=>{$('zoom-value').textContent=zoom.value+'%';paint()});
document.addEventListener('keydown',(event)=>{if(['SELECT','INPUT','BUTTON'].includes(document.activeElement.tagName)||event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='ArrowLeft'){event.preventDefault();selectAsset(current-1)}if(event.key==='ArrowRight'){event.preventDefault();selectAsset(current+1)}});
for(const side of sides){const canvas=$(side+'-canvas');canvas.addEventListener('dblclick',fit);canvas.addEventListener('pointerdown',(event)=>{if(event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,panX:pan.x,panY:pan.y};canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing'});canvas.addEventListener('pointermove',(event)=>{if(!drag||drag.id!==event.pointerId)return;pan={x:drag.panX+event.clientX-drag.x,y:drag.panY+event.clientY-drag.y};paint()});const stop=(event)=>{if(drag?.id===event.pointerId){drag=null;canvas.style.cursor='grab'}};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.style.cursor='grab'}
new ResizeObserver(paint).observe(document.querySelector('.comparison'));
let requested='';try{requested=decodeURIComponent(location.hash.slice(1))}catch{}const initial=records.findIndex((record)=>record.id===requested);selectAsset(initial<0?0:initial);
</script>
</body>
</html>`;

  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, 'isometric-review.html');
  await fs.writeFile(destination, html, 'utf8');
  return destination;
}

module.exports = { writeStreetFoodReview };
