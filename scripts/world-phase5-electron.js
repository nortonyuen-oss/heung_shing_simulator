// Shared original-game host, driven with an isolated DRIVE_USER_DATA directory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({evaluate,waitFor,cdp,screenshot,consoleLines})=>{
 const out=path.resolve(__dirname,'../test-results/world-integration');fs.mkdirSync(out,{recursive:true});
 await waitFor('typeof gameReady!=="undefined"&&gameReady',180000);
 await evaluate(`document.getElementById('btn-new-game').click();document.querySelector('[data-source-id="hk-territory"]').click();document.getElementById('city-name-input').value='Electron 全境整合';document.getElementById('btn-start-city').click();true;`);
 const settled='globalThis.__worldGameHost?.ready && __worldGameHost.manager.snapshot().states.ACTIVE===__worldGameHost.manager.snapshot().wanted';await waitFor(settled,90000);
 assert.equal(await evaluate('HEUNG_SHING_CONFIG.platform'),'desktop');
 await evaluate(`(async()=>{setGameSpeed(GAME_SPEEDS.PAUSED);mapData[1200][1593]=GROUND;heightMap[1200][1593]=0;selectedTool='road';applyToolAt(activeScene,1200,1593);return saveGame();})()`);
 for(let i=0;i<16;i++){await evaluate(`(()=>{__worldGameHost.adapter.centreCamera(activeScene.cameras.main,${112+i*127%2800},${128+i%12*128});return true;})()`);await waitFor(settled,60000);}
 await evaluate('saveGame()');await cdp('Page.reload');await waitFor(settled,150000);assert.equal(await evaluate('mapData[1200][1593]'),2);
 const result=await evaluate('({city:city.name,maxMounted:__worldGameHost.manager.snapshot().maxMounted,cache:__worldGameHost.provider.snapshot(),frames:window.__frameErrors||[]})');
 assert(result.maxMounted<=9);assert.deepEqual(result.frames,[]);assert(!consoleLines.some(line=>line.startsWith('EXCEPTION:')));
 await screenshot(path.join(out,'electron.png'));fs.writeFileSync(path.join(out,'electron-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
};
