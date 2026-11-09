const {chromium}=require(process.cwd()+'/node_modules/playwright-core');
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
let version=1,browser,server;
const files=Object.fromEntries(['game-storage.js','platform-ui.js'].map(n=>[n,fs.readFileSync(n,'utf8')]));
const worker=fs.readFileSync('web-service-worker.js','utf8');
const payload=name=>({city_name:name,population:1,year:1997,month:7,budget:100,save_data:{version:15,city:{name}}});
(async()=>{
 server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/web-service-worker.js'){res.setHeader('Content-Type','application/javascript');res.end(worker.replace('__BUILD_ID__','qa-'+version).replace('/*__SHELL__*/[]',JSON.stringify(['index.html'])));}
  else if(files[req.url.slice(1)]){res.setHeader('Content-Type','application/javascript');res.end(files[req.url.slice(1)]);}
  else{res.setHeader('Content-Type','text/html');res.end(`<html><body><div><div id="landing-load-status"></div></div><script>globalThis.HEUNG_SHING_CONFIG={platform:'web'};globalThis.qaVersion=${version};globalThis.currentLanguage='en';</script><script src="game-storage.js"></script><script src="platform-ui.js"></script></body></html>`)}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch(process.env.CI?{headless:true}:{channel:'chrome',headless:true});const ctx=await browser.newContext();const page=await ctx.newPage();
 await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction('HeungShingStorage.writable');
 const row=await page.evaluate(p=>HeungShingStorage.write(p),payload('Update survivor'));
 const second=await ctx.newPage();await second.goto(base);await second.waitForFunction('!!document.querySelector(".platform-storage-note")?.textContent');
 assert.equal(await second.evaluate('HeungShingStorage.writable'),false);
 version=2;await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update()});
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
 assert.equal(await page.evaluate('qaVersion'),1,'new worker cannot reload an active game');
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'A new game version is ready. Save your city and reload to update?'}).click();
 await page.waitForTimeout(1000);assert.equal(await page.evaluate('qaVersion'),1,'second tab blocks activation');
 await second.close();
 await page.getByRole('button',{name:'A new game version is ready. Save your city and reload to update?'}).click();
 await page.waitForFunction('qaVersion===2');
 assert.equal((await page.evaluate(id=>HeungShingStorage.get(id),row.id)).city_name,'Update survivor');
 console.log('Update: waiting prompt, no forced reload, other-tab block, accepted activation and city persistence passed.');
 await page.evaluate(async()=>{await(await caches.open('hs-assets-qa')).put('/asset',new Response('asset'));await(await caches.open('hs-shell-qa-keep')).put('/shell',new Response('shell'))});
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;let failed=false;IDBObjectStore.prototype.put=function(...args){if(this.name==='payloads'&&!failed){failed=true;throw new DOMException('quota','QuotaExceededError')}return original.apply(this,args)};globalThis.restorePut=()=>IDBObjectStore.prototype.put=original});
 const quota=await page.evaluate(async p=>{const r=await HeungShingStorage.request('/api/saves',{method:'POST',body:JSON.stringify(p)});restorePut();return {ok:r.ok,keys:await caches.keys()}},payload('Quota retry'));
 assert.equal(quota.ok,true);assert(!quota.keys.includes('hs-assets-qa'));assert(quota.keys.includes('hs-shell-qa-keep'));
 const before=await page.evaluate('HeungShingStorage.list().then(rows=>rows.length)');
 const aborted=await page.evaluate(async p=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='payloads'){this.transaction.abort();throw new DOMException('abort','AbortError')}return original.apply(this,args)};const r=await HeungShingStorage.request('/api/saves',{method:'POST',body:JSON.stringify(p)});IDBObjectStore.prototype.put=original;return r.ok},payload('Must not exist'));
 assert.equal(aborted,false);assert.equal(await page.evaluate('HeungShingStorage.list().then(rows=>rows.length)'),before);
 console.log('Storage: real IndexedDB quota retry clears only assets; transaction abort leaves no partial city.');
 const memory=await browser.newContext();await memory.addInitScript(()=>Object.defineProperty(globalThis,'indexedDB',{value:undefined}));const mp=await memory.newPage();await mp.goto(base);
 await mp.waitForFunction('HeungShingStorage.memoryOnly');assert.match(await mp.locator('.platform-storage-note').textContent(),/temporary/);
 const temporary=await mp.evaluate(p=>HeungShingStorage.write(p),payload('Temporary'));assert(temporary.id);
 console.log('Unavailable IndexedDB: temporary storage is explicitly labelled.');
 await browser.close();await new Promise(r=>server.close(r));
})().catch(async e=>{console.error(e);await browser?.close();server?.close();process.exitCode=1});
