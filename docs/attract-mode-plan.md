# Title screen attract mode 設計計劃

狀態：**已實作**（2026-09-16，`attract-mode.js`）。靜態夜景 `UI/backgroundTitle.webp` 係載入前嘅 placeholder 同所有失敗情況嘅回退。

實作備註（同計劃唔同之處）：
- 速度：attract 用 `GAME_SPEEDS.SLOW`（頂欄標示嘅 1x，8 分鐘一日）；離開時還原之前速度。`GAME_SPEEDS.NORMAL` 嘅日夜倍率係 4，太快。
- `city.day` 係由 `environmentMinutes` 推導嘅顯示值，attract 期間仍會變；真正被凍結嘅係 `advanceCalendarDay`／`onCalendarDayAdvanced`（月、年、每日系統、pulse）。巴士公司時鐘（`advanceTransportClock`）照行，否則巴士唔會郁。
- HUD、工具選單等 DOM 層本身就喺 canvas 之上，以前靠不透明背景遮住；attract 期間用 `body.attract-live` 隱藏所有非 canvas／landing 嘅頂層元素。
- 地區路牌喺 attract 城市入面關閉（per-city 狀態，隨城市丟棄）。
- FPS watchdog（分級）：暖機 3 秒後抽樣 4 秒。<30 fps 而建築燈光開緊 → 只喺 attract 城市關燈（`isAttractLightsSuppressed`，唔改玩家設定）再抽樣；之後 <24 fps 固定鏡頭；<15 fps 先退回靜態圖。<5 fps 視為視窗被 throttle（失焦／被遮）而重新抽樣最多三次。
- 實測（2026-09-16/17，Intel Iris Plus 655，macOS 15.7，太子 34.7 萬人口，zoom 0.7）。**要分清 dev 同 release**：
  - 未 `npm run prepare:release-assets` 嘅 dev 啟動只有源 PNG，manifest 冇 baked 夜景貼圖 → 全部建築行 live glow（最慢路徑）：夜間開燈 17–20 fps，關燈 45–50。
  - Release／已 stage 嘅 dev 啟動（2026-09-17 起 dev 有 staged 樹就預設用；`ELECTRON_SOURCE_ASSETS=1` 先會讀源 PNG）：太子展示 1935/1935 baked，穩定後約 43 fps；旺角遊玩夜晚 30 fps（同日間 28 一樣，燈光幾乎免費），香港 43–58。
  - 結論：夜間燈光成本只存在於 dev 模式；release 嘅瓶頸係城市規模（sprite 數量）。zoom 0.7→1.1 只差 2 fps；鏡頭漂移約 1–2 fps。
  - `updateBuildingLights` 每幀對 baked 建築嘅 profile resolve 已 memo（4.3 → 2.4 ms／幀）；`syncBuildingNightTextures` 每次真正 walk 約 20 ms、每秒 3 次（1x），係下一個可優化位。
- 注意：Safe Mode 開機或由冇 GPU 嘅 sandbox 啟動嘅 Electron 會用 SwiftShader 軟件渲染（1–2 fps），唔代表真機；用 `app.getGPUFeatureStatus()` 或 `WEBGL_debug_renderer_info` 確認渲染器係 ANGLE Metal 先好量度。
- 展示城市 `UI/attract-city.json` 約 1.5 MB（太子，34.7 萬人口）；因為係本機 static 檔案，冇再 gzip。
- 重新 export：開發模式開遊戲 → 載入太子 → 對準構圖 → DevTools console 執行 `exportAttractCity()`。packaged build 嘅 server 唔開放呢個 route。
- 夜景貼圖：attract 載入前會將展示存檔嘅 `city.timeOfDayMinutes` 改成本地時間，令 `ensureSaveNightTextures` 喺 crossfade 前一次過預載該時刻嘅 baked 變體；否則（存檔係日間 export）會逐座 lazy load，天際線一座座慢慢着燈。
- 驗證：`test/attract-mode.test.js`（時鐘 gate、天文台映射、bundled 檔案可解碼、所有 gate 已接線）。
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
- 已用 v4.10.0 release DMG 驗證（2026-09-18）：`app.asar` 內有 `/UI/attract-city.json`；packaged app 以 asar 內嘅檔案啟動展示城市（1935/1935 baked）；`/api/dev/attract-city` 回 404；載入清單只來自玩家 DB。新玩家安裝後即有展示城市，而且冇途徑載入或覆寫佢。`services/**` 已由打包規則排除。
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

所有階段已於 2026-09-16 一次過完成並實機（開發模式）驗證三條離開路徑、toast／save 攔截、設定開關同天文台同步；真機 GPU 下嘅幀率仍待 Norton 實測。

## 5. 測試

- 單元：時鐘喺 attract 模式下推進天色但唔推進日曆（`game-clock.js` 已有 vm 測試模式可仿效）；`triggerAutosave`／`showToast` 喺 attract 時無動作；bundled JSON 可解碼。
- 整合（headless Electron + CDP，已有 `scripts` 以外嘅截圖流程可重用）：啟動 → 等 `attractRunning` → 截圖 → 㩒 Load Save 載入另一存檔 → 確認 `attractMode === false`、`currentSaveId` 正確、無多餘 toast。
- 性能：記錄 attract 期間 FPS 同 `gameReady → attractVisible` 時間，寫入現有 `recordVisualRoutePerformanceMilestone`。

## 6. 風險與回退

- **性能**（最大）：大城市 + 夜燈渲染。回退：3.7 嘅開關同自動降級；展示城市刻意揀中等規模（例如 2–3 萬人口）而唔係最大存檔。
- **副作用漏網**：任何模擬相關 timer 未 gate。回退：階段 A 用 grep 全面搜 `setInterval`／`setTimeout`／`onGameClockEvent` 逐個確認，並喺整合測試檢查 DB 無新寫入。
- **存檔格式升級後 JSON 過期**：測試會 fail 提醒重新 export；載入失敗亦只係回到靜態圖。
- **安裝包體積**：+數百 KB，可接受。

## 7. 已決定（2026-09-16）

1. **展示城市：太子（Prince Edward）**。構圖要見到海港同路上行駛嘅車。用該存檔嘅視點 export，實機截圖確認後再微調。
2. **真實時間同步：要**。天氣跟香港天文台實時觀測（`rhrread` 開放數據 API，有 CORS `*`，renderer 直接 fetch）；離線或失敗就用遊戲本身嘅季節性隨機天氣。
3. **鏡頭：慢速漂移，效能優先**（見 3.4 修訂）。
4. **開關放設定頁**。

### 3.4（修訂）鏡頭：慢速單軸漂移 + 節流 culling

- 沿等距地圖嘅其中一條軸慢速來回（約 5 px/s 世界座標，行程約 240 px，用 sine ease 折返），zoom 固定——固定 zoom 令 tile sprite 池穩定，係最大嘅慳位。
- viewport culling 同交通／船／飛機 view invalidation 每 400 ms 更新一次而唔係每幀；漂移咁慢，邊緣露出唔會被察覺。
- 自動降級：attract 首 5 秒平均 FPS < 40 → 停止漂移（固定鏡頭）；< 30 → 退回靜態圖。

### 3.8 天文台實時天氣

- 來源：`https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc`（觀測，含 `icon`、溫度、濕度、雨量）同 `dataType=warnsum`（暴雨／熱帶氣旋警告）。attract 開始時 fetch 一次，之後每 10 分鐘刷新；5 秒 timeout。
- 映射到 `city.weather.condition`：50–52／70–77 → `clear`（天文台氣溫 ≥ 31 → `hot`；≤ 15 → `cool`）；53–54、62–63 → `showers`；60–61、82–85 → `cloudy`；64–65 → `heavyRain`；80 → `windy`；90 → `hot`；92–93 → `cool`。溫度、濕度、雨量直接寫入讀數。
- 警告：`WRAIN` A/R/B → `rainWarning` amber/red/black；`WTCSGNL` TC1/TC3/TC8*/TC9/TC10 → `typhoonStage` signal1/3/8/9/10 並設 `typhoonActive`（只影響視覺同風速，模擬唔 tick）。
- 同步成功後，attract 模式下跳過 `advanceWeatherClock`（唔畀遊戲自己再 roll）；失敗則照常行季節性隨機。
- 所有天文台狀態只寫入 attract 城市嘅 `city.weather`，離開 attract 時隨城市一齊被替換，唔會滲入玩家存檔。
