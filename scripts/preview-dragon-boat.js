// Run through drive-electron.js with DRIVE_USER_DATA pointing to an isolated profile.
// Synthetic shoreline: clear vegetation through the normal tree API before replacing terrain.
const path = require('node:path');
module.exports = async ({ evaluate, waitFor, sleep, screenshot, consoleLines }) => {
  if (!process.env.DRIVE_USER_DATA) throw new Error('Set DRIVE_USER_DATA to an isolated test profile.');
  await waitFor('typeof activeScene !== "undefined" && gameReady');
  await evaluate('startNewGame("龍舟測試城")');
  await evaluate(`(() => {
    stopSimTimer(); simPaused = true; city.month = 1;
    for (let r = 99; r < 114; r++) for (let c = 90; c < 125; c++) {
      removeTree(activeScene, r, c);
      removeDebris(activeScene, r, c);
      mapData[r][c] = r <= 100 ? GROUND : WATER;
      heightMap[r][c] = 0;
      refreshTileSprite(activeScene, r, c);
    }
    city.promenade = { version: 1, tiles: Object.fromEntries(Array.from({ length: 22 }, (_, i) => ['100:' + (96 + i), 0])) };
    syncPromenadeSprites(activeScene); syncPromenadeProps(activeScene);
    previewDragonBoatFestival(); city.timeOfDayMinutes = 930;
    centerCameraOnTile(activeScene, 103, 103); activeScene.cameras.main.setZoom(1.5);
  })()`);
  await waitFor('activeScene.dragonBoatSprites?.size > 0');
  await sleep(1000);
  const report = await evaluate(`(() => {
    updateHUD(); updateTopbarGameTime();
    return {
      treesOnWater: treeMap.reduce((n, row, r) => n + row.filter((tree, c) => tree && mapData[r][c] === WATER).length, 0),
      boats: [...activeScene.dragonBoatSprites.keys()].filter(id => id.includes('db-team')).length,
      status: city.festivals.dragonBoat.status,
    };
  })()`);
  if (report.treesOnWater !== 0 || report.boats !== 6) throw new Error(JSON.stringify(report));
  await sleep(300);
  await screenshot(path.resolve(__dirname, '../.data/dragon-boat-preview.png'));
  const errors = consoleLines.filter(line => line.includes('EXCEPTION'));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(report);
};
