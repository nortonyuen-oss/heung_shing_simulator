# Title screen attract mode 設計計劃

狀態：計劃（未實作）。第一步（靜態夜景背景 `UI/backgroundTitle.webp`）已於 2026-09-16 完成，作為本計劃嘅 placeholder 同回退方案。
目標：開遊戲時，title 選單後面播放一座真實嘅香城——用遊戲引擎即時渲染一個內置嘅展示城市，有日夜燈光、車流、船同飛機，鏡頭慢慢漂移；但**唔行城市模擬**，唔會有任何副作用。

## 1. 原則

1. **只渲染、唔模擬**。「活」嘅感覺嚟自日夜光線同交通視覺，唔係嚟自經濟 tick。模擬暫停可以一次過消除 autosave、新聞、議會、toast 呢類副作用，亦大幅減少 CPU。
2. **展示城市係唯讀資產**，唔係玩家存檔。佢喺 app bundle 入面，唔會出現喺「載入存檔」清單，唔可能被 overwrite 或刪除。
3. **永遠有回退**。任何一步失敗（資產缺失、載入超時、格式過期、玩家關閉功能）都靜靜哋停留喺靜態夜景，選單照常可用。
4. **唔延遲選單可用時間**。展示城市喺 asset 載完之後先開始載入，玩家隨時可以㩒 New City／Load Save 打斷。

## 2. 現況（實作時嘅落點）

| 事項 | 位置 | 對本計劃嘅意義 |
|---|---|---|
| Landing overlay 同背景 | `index.html` `#landing-screen`（CSS background `UI/backgroundTitle.webp`，`::before` 漸層、`::after` 底欄） | 即時畫面要喺 overlay 下面透出：背景改為透明 / crossfade |
| Asset 預載進度 | `main.js` `setupPreloadProgressUi()`；`scene.load.once('complete')` | attract 載入嘅觸發點 |
| Scene 建立完成 | `main.js` `create()` 尾段：`this.scene.setVisible(false); gameReady = true; setupLandingScreen()` | 有註解「Do not render or update the 65,536-tile Phaser world invisibly behind it」——呢個係之前為性能刻意嘅決定，本計劃要有意識地推翻，並用開關同量度守住 |
| 世界顯示／隱藏 | `main.js` `setGameWorldVisible(visible)` | attract 開始時 `true`，並要維持 viewport culling |
| 載入存檔 | `save.js` `loadSaveById(id, scene)` → `fetch(API_BASE/id)` → `decodeSaveDataForLoad` → `ensureSaveBuildingTextures` / `ensureSaveNightTextures` → `beginNewCitySaveSession()` → `applySaveData()` → `showToast(welcomeBack)` | attract 需要一個「由 bundled JSON 載入」嘅同路徑變體，跳過 session／toast |
| 世界重建 | `save.js` `applySaveData()` 開頭 `clearTrafficVisuals`…`clearBuildings`、`resetGameState()`；`landing-screen.js` `rebuildFreshMapSession()` | 玩家揀 New City／Load Save 時，attract 城市會被正常路徑整個替換——teardown 幾乎免費，只需先解除 attract 狀態 |
| 時鐘 | `game-clock.js` `updateGameClock(scene, dt)`：`advanceGameTimeOfDay()`（天色）→ `advanceCalendarForEnvironmentMinutes()`（日曆 → `onCalendarDayAdvanced` → `runDailySystems` / pulse 日 `runLegacyCitySimulationPulse`） | **關鍵 hook**：attract 模式下只行前半（天色），跳過日曆推進，模擬就完全唔會 tick |
| 時間狀態 | `city.environmentMinutes`（`getEnvironmentMinutes()`）；8 分鐘真實時間 = 1 遊戲日 | 真實時間同步只需設定 `city.environmentMinutes` |
| 視點 | `save.js` `captureCurrentViewpoint` / `restoreSavedViewpoint`（zoom、centerRow/Col、rotation） | 展示城市嘅 zoom 同構圖直接由 export 時嘅視點決定 |
| Autosave | `main.js` `triggerAutosave()`（年增觸發）、`save.js` `scheduleAnnualAutosave` / `cityChangeAutosaveTimer` | 模擬唔 tick 就唔會年增；另外 `cityChangeAutosaveTimer` 要確保 attract 載入唔會排程 |
| 音效 | `main.js` `playTitleLoadingAudio` / `stopTitleLoadingAudio`；`startAmbientSoundscape` 喺 `create()` 已啟動；`enterGameplayAudioMode()` 喺 `hideLandingScreen()` | attract 期間保留 title 音樂，環境音維持靜音 |
| 設定持久化先例 | `main.js` `BUILDING_LIGHTS_SETTING_KEY`（localStorage） | attract 開關用同一套 |
| 存檔格式 | `save.js` `COMPACT_SAVE_VERSION`、RLE 地圖編碼 | bundled JSON 用同一格式，經同一 `decodeSaveDataForLoad` 載入，格式升級時同玩家存檔一齊被 migrate |

## 3. 設計

### 3.1 展示城市資產

- 檔案：`UI/attract-city.json`（compact save 格式，同 DB 入面 `save_data` 一樣）。預期數百 KB；如超過 1 MB 改用 `.json.gz` 並喺載入時解壓。
- 產生方法：新增 dev-only 指令（例如 debug console `exportAttractCity()`，或 View menu 隱藏項目），喺遊戲中對準構圖、zoom 同時間後執行，內容 = `buildSavePayload()` + 當時視點，寫到 `UI/attract-city.json`（Electron main process 負責寫檔，只喺非 packaged 環境開放）。
- 唔入 `db.js`、唔出現喺存檔清單、唔可以由遊戲內覆寫。
- 城市名稱／市長等 identity 由 JSON 帶入，但 attract 模式唔會顯示 HUD，所以無所謂。
- 測試：`test/attract-city.test.js` 讀 `UI/attract-city.json`，經 `decodeSaveDataForLoad` 解碼成功、版本等於 `COMPACT_SAVE_VERSION`、地圖尺寸正確。格式升級時呢個測試會提醒重新 export。

### 3.2 狀態機

```
boot ──assets complete──▶ attractLoading ──ok──▶ attractRunning
  │                            │  fail/timeout(8s)          │ user picks New/Map Editor/Load
  │                            ▼                            ▼
  └────────────────────▶ staticFallback            leaveAttract() → 原有路徑
```

- `attractLoading`：`fetch('UI/attract-city.json')` → decode → `ensureSaveBuildingTextures` / `ensureSaveNightTextures` → `applySaveData` → `restoreSavedViewpoint` → `setGameWorldVisible(true)`。全程受 `loadRequestGeneration` 保護（同 `loadSaveById` 一樣），玩家中途㩒按鈕即作廢。
- `attractRunning`：`attractMode = true`；時鐘只推進天色；鏡頭漂移；title 音樂繼續。
- `leaveAttract()`：`attractMode = false`、停鏡頭漂移、`setGameWorldVisible(false)`（或直接由下一個 load / rebuild 替換）、恢復 `city.environmentMinutes` 唔重要（會被新城市覆蓋）。New City 走 `rebuildFreshMapSession`，Load Save 走 `loadSaveById`，Map Editor 走 `startTerrainCreatorMode`——三條路徑本身已經重建世界。

### 3.3 只渲染唔模擬——要 gate 嘅清單

以一個全域 `attractMode` 旗標（`main.js`）逐點檢查：

| 系統 | 處理 |
|---|---|
| 日曆／模擬 | `updateGameClock`：attract 時 return 於 `advanceGameTimeOfDay` 之後，唔呼叫 `advanceCalendarForEnvironmentMinutes` |
| 交通／船／飛機視覺 | 照行（呢啲係「活」嘅來源），但確認佢哋唔依賴 pulse |
| Autosave | `triggerAutosave` 同 `scheduleAnnualAutosave` 加 `if (attractMode) return`；attract 載入唔呼叫 `beginNewCitySaveSession`，`currentSaveId` 保持 null |
| AI／模擬新聞、走馬燈 | 新聞產生器同 `startTicker()` 只喺 `hideLandingScreen()` 之後啟動，維持現狀；加 guard 確保 attract 載入唔觸發「歡迎回來」等 toast（`showToast` 喺 attract 時直接丟棄） |
| 議會、事件、颱風 | 由 pulse 驅動，模擬唔 tick 自然唔會發生；颱風／天氣 FX 若有獨立 timer 要檢查 |
| 音效 | 保留 title 音樂；`updateAmbientSoundscape` 喺 attract 時 no-op |
| HUD／小地圖 | 被 overlay 遮住；`updateHUD()` 喺 attract 時可跳過以慳 DOM 更新 |
| 輸入 | overlay 已攔截 pointer；確認鍵盤快捷鍵（空白鍵暫停、縮放）喺 attract 時忽略 |
| 性能里程碑 | `recordVisualRoutePerformanceMilestone` 加 `attractVisible`，方便日後量度 |

### 3.4 鏡頭漂移

- 以 export 視點為中心，沿一個慢速閉合路徑（橢圓，半徑約 6–10 格，周期約 90 秒）移動 `camera.scrollX/Y`；zoom 固定或極慢呼吸（±3%）。
- 每幀更新後呼叫 `updateTerrainViewportCulling`、`invalidateTrafficVisualView` 等（參考 `restoreSavedViewpoint` 嘅清單），保持 culling 正確。
- 玩家離開 attract 時停止。

### 3.5 真實時間同步

- attract 開始時設定 `city.environmentMinutes` 令遊戲時刻 = 本地時間（`new Date()` 嘅 時:分），之後以正常速度推進（8 分鐘一日，所以坐喺選單幾分鐘會見到天色變）。
- 可選：每次 attract 開始都同步，令朝早開遊戲見日出、夜晚見夜景。

### 3.6 由靜態圖過渡到即時畫面

- `#landing-screen` 保留 `UI/backgroundTitle.webp` 作初始背景；attract 就緒後加 class `attract-live`，background 以 CSS transition 淡出（約 1.2 秒）露出 canvas；`::before` 漸層保留以保證選單可讀。
- 若 attract 失敗，唔加 class，畫面同今日一樣。

### 3.7 開關與自動降級

- 設定：`citybuilder.attractMode.v1`（localStorage，預設 `true`），View／設定選單加「開場即時背景」開關。
- `ELECTRON_PERFORMANCE_MODE=1` 時強制關閉。
- 自動降級：attract 載入超過 8 秒，或首 5 秒平均 FPS 低於 30，即 `leaveAttract()` 回到靜態圖，並記錄一次（下次啟動仍會再試，唔會永久關閉，除非玩家自己關）。

## 4. 分階段實作

| 階段 | 內容 | 預估 |
|---|---|---|
| A | `attractMode` 旗標 + 時鐘 hook + gate 清單（3.3）+ `leaveAttract()`；用一個現有玩家存檔臨時測試 | 半日 |
| B | export 指令 + `UI/attract-city.json` + 格式測試（3.1） | 2–3 小時（另加你揀構圖嘅時間） |
| C | 載入流程 + crossfade + 三條離開路徑驗證（3.2、3.6） | 半日 |
| D | 鏡頭漂移 + 真實時間同步（3.4、3.5） | 2–3 小時 |
| E | 開關、自動降級、性能量度（3.7）；Windows 同 Intel Mac 實機試 | 半日 |

每個階段獨立 commit；A–C 之後已經可以 ship，D、E 係打磨。

## 5. 測試

- 單元：時鐘喺 attract 模式下推進天色但唔推進日曆（`game-clock.js` 已有 vm 測試模式可仿效）；`triggerAutosave`／`showToast` 喺 attract 時無動作；bundled JSON 可解碼。
- 整合（headless Electron + CDP，已有 `scripts` 以外嘅截圖流程可重用）：啟動 → 等 `attractRunning` → 截圖 → 㩒 Load Save 載入另一存檔 → 確認 `attractMode === false`、`currentSaveId` 正確、無多餘 toast。
- 性能：記錄 attract 期間 FPS 同 `gameReady → attractVisible` 時間，寫入現有 `recordVisualRoutePerformanceMilestone`。

## 6. 風險與回退

- **性能**（最大）：大城市 + 夜燈渲染。回退：3.7 嘅開關同自動降級；展示城市刻意揀中等規模（例如 2–3 萬人口）而唔係最大存檔。
- **副作用漏網**：任何模擬相關 timer 未 gate。回退：階段 A 用 grep 全面搜 `setInterval`／`setTimeout`／`onGameClockEvent` 逐個確認，並喺整合測試檢查 DB 無新寫入。
- **存檔格式升級後 JSON 過期**：測試會 fail 提醒重新 export；載入失敗亦只係回到靜態圖。
- **安裝包體積**：+數百 KB，可接受。

## 7. 待你決定

1. 展示城市用邊個存檔／構圖？（建議：有海港、機場同高密度天際線嘅中等城市，同官網夜景一致）
2. 真實時間同步要唔要？定係固定夜晚（配合【香城夜色】主題）？
3. 鏡頭要漂移定固定？（漂移更活，但 culling 更新有少少 CPU）
4. 開關放 View menu 定設定頁？
