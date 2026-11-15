#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),express=require('express'),{chromium}=require('playwright-core');
(async()=>{
 const app=express();app.use(express.static(path.resolve(__dirname,'../release/web')));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>typeof gameReady!=='undefined'&&gameReady,null,{timeout:150000});
  await page.click('#btn-new-game');await page.click('[data-source-id="hk-territory"]');await page.fill('#city-name-input','效能測試');
  const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  const frames=[];await page.exposeFunction('__profileFrame',delta=>frames.push(delta));await page.evaluate(()=>{let previous=performance.now();function sample(time){__profileFrame(time-previous);previous=time;requestAnimationFrame(sample);}requestAnimationFrame(sample);});
  await page.click('#btn-start-city');await new Promise(resolve=>setTimeout(resolve,8000));const {profile}=await cdp.send('Profiler.stop');
  const nodes=new Map(profile.nodes.map(node=>[node.id,node])),totals=new Map();(profile.samples||[]).forEach((id,index)=>{const node=nodes.get(id);const key=`${node.callFrame.functionName||'(anonymous)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber+1}`;totals.set(key,(totals.get(key)||0)+(profile.timeDeltas[index]||0));});
  const top=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,14).map(([fn,us])=>({fn,ms:Math.round(us/1000)}));
  fs.mkdirSync(path.resolve(__dirname,'../test-results/world-integration'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../test-results/world-integration/cpu-profile.json'),JSON.stringify(profile));
  const sorted=frames.sort((a,b)=>a-b);const report={top,frames:frames.length,p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)]};console.log(JSON.stringify(report,null,2));
  fs.writeFileSync(path.resolve(__dirname,'../test-results/world-integration/performance.json'),JSON.stringify(report,null,2));await context.close();
 }catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})();
