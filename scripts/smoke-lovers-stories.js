#!/usr/bin/env node
'use strict';
// Actual forum markup, styles, delivery and rendering with a disposable city/profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.data/lovers-story-review');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[0]).join('\n');
const markup = html.slice(html.indexOf('<div id="newspaper-dialog"'), html.indexOf('<!-- ── Weather legend'));
const state = fs.readFileSync(path.join(ROOT, 'city-state.js'), 'utf8');
const imageFunctions = state.slice(state.indexOf('function normalizeForumImagePath'), state.indexOf('\nfunction normalizeCityFinanceState'));
const fixture = `<!doctype html><html><head><meta charset="utf-8">${styles}<link rel="stylesheet" href="mobile-ui.css"><link rel="stylesheet" href="medal-cabinet.css"><style>body{background:#263c4a}</style></head><body>${markup}
<script src="i18n.js"></script><script src="lovers-stories.js"></script><script>${imageFunctions}
const fixtureBuildings=new Set(['ocean_park','cultural_center','park_small','murray_house','seafood_restaurant','gold_coast_hotel']);
window.hasBuildingType=type=>fixtureBuildings.has(type);
window.getCouncilNewsOfficialDisplayName=()=> '測試官員';
window.getTransportExpansionState=()=>({lastModeTotals:{ferry:100,metro:200}});
window.getCityMonthIndex=(year=city.year,month=city.month)=>year*12+month-1;
window.setTextContent=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
window.showDialog=id=>{document.getElementById(id).style.display='flex';};
window.fixtureMedalProfile=null;window.fixtureToasts=[];window.showToast=message=>fixtureToasts.push(message);
window.HeungShingStorage={request:async(url,options={})=>{if(url!=='/api/player-profile/medals')return fetch(url,options);if(options.method==='PUT')fixtureMedalProfile=JSON.parse(options.body).data;return {ok:true,json:async()=>({data:fixtureMedalProfile})};}};
window.resetStory=id=>{window.city={name:'測試城',year:2000,month:9,population:20000,commercialCount:20,cityAttractiveness:70,pollution:15,happiness:.6,monthlyIncome:100,monthlyExpenses:50,activePolicies:{},council:{customNames:{}},weather:{condition:'clear',temperatureC:26,rainfallMm:0,windKph:10,rainWarning:'none',typhoonActive:false,typhoonStage:'none'},promenade:{tiles:Object.fromEntries(Array.from({length:8},(_,i)=>['1:'+i,0]))},forumPosts:[],lastForumMonthIndex:-1,loversStories:{seen:Object.fromEntries(LOVERS_STORY_DEFS.filter(d=>!d.ending&&d.id!==id).map(d=>[d.id,23900]))}};};
</script><script src="newspaper.js"></script><script src="medal-art.js"></script><script src="medal-definitions.js"></script><script src="medals.js"></script><script>maybeAnnounceCaacaantengAd=()=>null;requestForumAiComments=()=>{};Math.random=()=>0;document.querySelectorAll('[data-close-dialog]').forEach(button=>button.onclick=()=>{document.getElementById(button.dataset.closeDialog).style.display='none';});</script></body></html>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const errors = [], requests = [];
  await context.route('http://lovers.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: fixture });
    if (url.pathname === '/api/app-info') return route.fulfill({ json: require('../package.json') });
    const file = path.resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
    return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  try {
    await page.goto('http://lovers.test/');
    await page.evaluate(async () => { resetStory('ocean-park'); await loadMedalProfile(); setLanguage('zhHant'); await openMedalCabinet(); });
    assert.equal(await page.evaluate(() => !!getMedalProfile().earned.D01), false);
    assert.doesNotMatch(await page.locator('[data-medal-id="D01"]').textContent(), /Claire|最後.*告別|星星/);
    await page.locator('[data-medal-search]').fill('Claire');
    assert.equal(await page.locator('[data-medal-id]').count(), 0, 'the hidden name cannot be found before completion');
    await page.locator('[data-medal-search]').fill('');
    await page.locator('[data-medal-close]').click();
    for (const language of ['zhHant', 'en', 'ja']) {
      await page.evaluate((lang) => setLanguage(lang), language);
      const ids = await page.evaluate(() => LOVERS_STORY_DEFS.map((def) => def.id));
      for (const id of ids) {
        const post = await page.evaluate((id) => { resetStory(id); const post=generateMonthlyForumPost(); showResolutionNewspaper(post,post.id); return post; }, id);
        assert.equal(post.id, `lovers-${id}`);
        if (language === 'zhHant' && id !== 'farewell') assert.equal(await page.evaluate(() => !!getMedalProfile().earned.D01), false, 'all prelude photos alone do not award the memorial');
        await page.waitForFunction(() => { const img=document.getElementById('forum-post-image');return img.complete&&img.naturalWidth>0; });
        assert.equal(await page.locator('#newspaper-headline').textContent(), post.headline);
        assert.equal(await page.locator('#newspaper-body p').first().textContent(), post.body[0]);
        if (language === 'zhHant' && ['gallery', 'farewell'].includes(id)) await page.screenshot({ path: path.join(OUT, `${id}-news.png`) });
        await page.evaluate(() => { document.getElementById('newspaper-dialog').style.display='none';showDialog('forum-history-dialog');renderForumHistory(); });
        await page.waitForFunction(() => { const img=document.querySelector('.forum-thread-thumb');return img.complete&&img.naturalWidth>0; });
        assert.equal(await page.locator('.forum-thread-thumb').evaluate((img) => img.naturalWidth), 180);
        assert.match(await page.locator('.forum-thread-thumb').getAttribute('src'), /UI\/news\/thumbs\//);
        await page.evaluate(() => { document.getElementById('forum-history-dialog').style.display='none'; });
        if (id === 'farewell') {
          assert.equal(await page.evaluate(() => !!getMedalProfile().earned.D01), true, 'publishing the final story immediately earns the hidden medal');
          await page.evaluate(() => openMedalCabinet());
          await page.locator('[data-medal-id="D01"]').click();
          const revealed = await page.evaluate(() => ({ name: getMedalText(MEDAL_DEFS_BY_ID.D01.name,getCurrentLanguage()), quote: getMedalText(MEDAL_DEFS_BY_ID.D01.quote,getCurrentLanguage()) }));
          assert.match(await page.locator('.mc-detail').textContent(), new RegExp(revealed.name));
          assert((await page.locator('.mc-detail').textContent()).includes(revealed.quote));
          const detail = await page.locator('.mc-detail').evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const body = el.closest('.dialog-body');
            const bounds = body.getBoundingClientRect();
            return { inView: rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1, bodyScroll: body.scrollTop };
          });
          assert(detail.inView && detail.bodyScroll === 0, 'selecting the last-row medal must keep its detail panel on screen');
          if (language === 'zhHant') await page.screenshot({ path: path.join(OUT, 'claire-medal.png') });
          await page.locator('[data-medal-close]').click();
        }
      }
    }
    await page.setViewportSize({ width: 393, height: 852 });
    await page.evaluate(() => { document.documentElement.dataset.uiProfile='touch';setLanguage('zhHant');resetStory('farewell');const post=generateMonthlyForumPost();showResolutionNewspaper(post,post.id); });
    await page.waitForFunction(() => document.getElementById('forum-post-image').complete);
    const overflow = await page.locator('#newspaper-dialog .dialog-box').evaluate((el) => ({ width: el.scrollWidth-el.clientWidth, right: el.getBoundingClientRect().right }));
    assert(overflow.width <= 1 && overflow.right <= 393, 'mobile article fits horizontally');
    await page.screenshot({ path: path.join(OUT, 'farewell-mobile.png') });
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => fixtureToasts.filter(message=>message.includes('Claire')).length), 1, 'the player earns the memorial only once across new city fixtures');
    await page.waitForFunction(() => !!fixtureMedalProfile?.earned?.D01);
    assert(!requests.some((url) => url.includes('storyBoardGraphics/')), 'production UI only requests optimized illustrations');
    console.log('PASS: all 11 stories render in three languages; final publication unlocks D01 once, keeps it hidden until complete, reveals its quote and saves it; images, thumbnails and mobile display load without browser errors.');
    console.log(`Previews: ${OUT}`);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode=1; });
