# 幀率與順暢度筆記（2026-09-20）

量度環境：旺角（34.7 萬人口、2 439 格路、1 868 座建築 sprite），Intel Iris Plus 655、macOS、1440×872 canvas（dpr 1）、staged 貼圖。用 `scripts/drive-electron.js` 讀 `getVisualRoutePerformanceSnapshot` 同自己包住每幀函數計時。

## 結果

| 場景 | 之前 | 之後 |
|---|---|---|
| 日間 zoom 1，1× | 12–14 fps，幀 75–80 ms | **45 fps**，幀 23 ms |
| 夜晚 zoom 1，1× | 13–15 fps | **44 fps** |
| 夜晚 zoom 2 | 19 fps | 56 fps |
| 全城 zoom 0.4 | — | 36 fps |
| 2× 速度 | — | 58 fps |
| update（JS）每幀 | 9–15 ms，峰 200–540 ms | 2–4 ms，峰 ~115 ms |

## 四個發現（由大到細）

1. **ANGLE-over-Metal 嘅 `bufferSubData` stall（最大）。** Phaser 3.60 每個 render batch 用 `gl.bufferSubData` 寫入同一個 vertex buffer；Mac 上 Chromium 經 ANGLE→Metal，寫入一個 GPU 仍在讀嘅 buffer 會令 GPU process 等上一個 draw 完成——旺角每幀約 150 次上傳、每次 ~0.35 ms，JS 其實閒置。實驗：隱藏所有 sprite → 60 fps；只顯示 304 支路燈（總填充 0.7 MP）都要 24 ms；MSAA 關／geometry mask 清走都無分別；只要把該次上傳改成 `gl.bufferData`（driver 自己 stream 新分配）即 14 → 59 fps。修正：`main.js installVertexUploadShim` 喺 `create()` 安裝，只改寫「ARRAY_BUFFER、offset 0、typed-array view」呢一種呼叫（Phaser 3.60 只有 WebGLPipeline.flush 同 GameObjects.Shader 兩處，同一形狀）。
2. **`syncBuildingNightTextures` 每 100 ms 全城重算**（每幀平均 5.8 ms、峰 35 ms）：1× 速度下遊戲分鐘每 ~80 ms 跳一次，state key 幾乎每 tick 都變。修正：`getBuildingNightVariantWindow` 回傳「而家嘅 variant ＋ 下次改變嘅分鐘」，每座建築記住直到嗰刻先重算（新一晚 session 作廢）。
3. **巴士公司每小時嘅乘客累積同每次到站**都對每個站掃全部建築（`Object.entries(buildingData)`）：旺角每 ~5 秒一次 530 ms 卡頓。修正：建築按 5 格網格 bucket 一次、每站答案 memo，2 秒有效。另外每幀嘅維修步驟改用 1 秒快取嘅車廠 id。
4. **每 7.5 日一次嘅模擬 pulse 一次過跑 273 ms**（growth 153、transport 39、traffic 27、health 19）。修正：`simulation.js` 把 pulse 拆成 steps，`scheduleCitySimulationPulse` 排隊、`pumpCitySimulationPulse` 喺每幀用 6 ms 預算逐步跑（一步做完先計預算，完成後先 `city.tick++`、發 citypulse、更新 HUD）；zone growth 再拆成 `growth.tiles.n/12` 每 400 格一段；存檔前 `flushCitySimulationPulses()` 清空。`runLegacyCitySimulationPulse` 保留同步版俾測試同工具。

順帶：`updateBuildingLights` 嘅全城掃描改 4 次／秒（beacon 閃爍照每幀），交通燈燈柱換貼圖只掃視窗內。

## 仍然會見到嘅卡頓（下一步）

- `sim.growth.qualityContext` 一步 30–110 ms（land value map 等全圖計算）——可以快取或再拆。
- `sim.transport`（`updateTransportSimulation`）20–60 ms 一步。
- render 峰 90–140 ms：新建築／車輛貼圖首次上傳 GPU（lazy load）。可以預熱或分批上傳。
- 每日 `updateHUD` 5–7 ms。

## 量度方法

- `scripts/drive-electron.js`：`DRIVE_USER_DATA` 獨立 profile、`bringToFront()`（被遮住時 Phaser 暫停 loop）、`snapshot()`（分段傳，DevTools 回覆 >4 MB 會斷線）、`cdp()`。Driver 會設 `ELECTRON_NO_BACKGROUND_THROTTLING=1`。
- 長時間 await 嘅 promise 會被 DevTools 回收（"Promise was collected"）：結果放喺 `window` 再 poll。
- 隔離 GPU 成本：逐類 sprite `setVisible(false)`（camera 唔郁 culling 唔會還原）、包住 `gl.drawArrays`／`bufferSubData` 數次數。
