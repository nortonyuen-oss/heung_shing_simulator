#!/usr/bin/env node
// macOS-only acceptance against an explicitly enabled Safari WebDriver.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const session = JSON.parse(fs.readFileSync('/private/tmp/heung-shing-safari-session.json', 'utf8')).value.sessionId;
const base = `http://127.0.0.1:4174/session/${session}`;
async function command(route, data) {
  const response = await fetch(base + route, { method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(150000) });
  const result = await response.json();
  if (result.value?.error) throw Object.assign(new Error(result.value.message), { code: result.value.error });
  return result.value;
}
async function ready() {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    if (await command('/execute/sync', { script: 'return typeof gameReady !== "undefined" && gameReady;', args: [] })) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Safari game startup timed out');
}
(async () => {
  await command('/timeouts', { script: 120000, pageLoad: 120000, implicit: 0 });
  await command('/url', { url: 'http://127.0.0.1:4173/' });
  await ready();
  const result = await command('/execute/async', { args: [], script: `
    const done = arguments[arguments.length - 1];
    (async () => {
      await startNewGame('Safari驗收城市'); setGameSpeed(GAME_SPEEDS.PAUSED);
      const saved = await saveGame();
      const envelope = HeungShingPortableSave.make(buildSavePayload(), appVersion);
      const parsed = HeungShingPortableSave.parse(JSON.stringify(envelope), decodeSaveDataForLoad, MAP_WIDTH, MAP_HEIGHT);
      return { saved, city: parsed.payload.city_name, version: appVersion, rows: (await listSaves()).length };
    })().then(done, error => done({ error: error.message }));` });
  assert.equal(result.saved, true); assert.equal(result.city, 'Safari驗收城市'); assert(result.rows >= 1);
  const downloadStarted = Date.now();
  try {
    await command('/execute/async', { script: 'const done=arguments[arguments.length-1];exportCurrentCity().then(()=>done(true));', args: [] });
  } catch (error) { if (error.code !== 'unexpected alert open') throw error; }
  let download;
  for (let n = 0; n < 20; n++) {
    try {
      const prompt = await command('/alert/text');
      if (typeof prompt === 'string' && /下載|download/i.test(prompt)) await command('/alert/accept', {});
    } catch (error) { if (error.code !== 'no such alert') throw error; }
    download = fs.readdirSync(path.join(os.homedir(), 'Downloads')).filter(name => /^香城_Safari驗收城市_.*\.heungshing$/.test(name)
      && fs.statSync(path.join(os.homedir(), 'Downloads', name)).mtimeMs >= downloadStarted).sort().at(-1);
    if (download) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(download, 'Safari did not finish the native backup download');
  const downloaded = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Downloads', download), 'utf8'));
  assert.equal(downloaded.payload.city_name, 'Safari驗收城市');
  await command('/refresh', {}); await ready();
  const reopened = await command('/execute/async', { args: [], script: `
    const done=arguments[arguments.length-1];
    (async()=>{const rows=await listSaves();const row=rows.find(row=>row.city_name==='Safari驗收城市');
      const loaded=await loadSaveById(row.id,activeScene);if(loaded){hideLandingScreen();setGameSpeed(GAME_SPEEDS.PAUSED)}
      return {loaded,name:city.name};})().then(done,error=>done({error:error.message}));` });
  assert.equal(reopened.loaded, true); assert.equal(reopened.name, 'Safari驗收城市');
  const screenshot = await command('/screenshot');
  fs.writeFileSync('/private/tmp/heung-shing-safari-smoke.png', Buffer.from(screenshot, 'base64'));
  console.log(JSON.stringify({ browser: 'Safari', version: result.version, saved: result.saved,
    reopened: reopened.loaded, download: downloaded.format, backupFile: download }));
})().catch(error => { console.error(error); process.exitCode = 1; });
