# 全港 Chunk Streaming：Audit 與第一條地形流程

日期：2026-11-14。規格：[v1.0](world-chunk-streaming-spec-v1.0.md)。

分支：`codex/world-chunk-streaming`，起點 `49ed6dd`。

現況更新：[Phase 5 入口／效能／發佈驗收及原遊戲整合界線](world-streaming-phase5.md)。獨立世界頁是過渡實作；使用者要求後續融入原遊戲介面與玩法。

本文記錄 Phase 0 與 Phase 1。其後已在相同 `/world/preview.html` 接入 [Phase 2 建設與增量儲存](world-streaming-phase2.md)、[Phase 3 小地圖與全港導航](world-streaming-phase3.md) 及 [Phase 4 世界交通與聚合](world-streaming-phase4.md)。目前世界預覽已放開整個 3187×2400 範圍；下文的 256×256 限制是 Phase 1 歷史記錄。正式城市入口、模擬與 v14/v15 城市存檔繼續使用原有路徑。

開始工作時，`landing-screen.js`、`main.js`、`save.js` 已有未提交修改。這些修改完整保留，本輪沒有編輯或提交它們。未追蹤的新聞圖片及 `scripts/metro-train-demo/` 亦保留。

## 1. Audit 結果與 Adapter 邊界

對根目錄遊戲 JS 搜尋 `MAP_WIDTH`、`MAP_HEIGHT`、`mapData`、`heightMap`、`isInsideMap`、`getTileId`、`buildingSprites`：80 個檔案、1,217 個文字引用。這是耦合盤點，並非效能量測；其中不少引用只作邊界檢查。

| 類別 | 主要位置／函式 | 新模式處理方式 |
|---|---|---|
| 尺寸與投影 | `main.js`: `setMapDimensions`, `isoToScreen`, `screenToIso`, `updateMapMetrics`, `drawWorldMask` | 新 `WorldConfig` 與 `WorldModeAdapter` 持有自己的尺寸／旋轉；不暫改遊戲全域值 |
| 地形資料／生成 | `terrain-presets.js`: `decodeHkTerrainRow`, `ensureTerritoryChunkGenerated`; `terrain-generation.js`: `finishHkTerrain` | 全港離線整理一次，再切成不可變 Storage Chunks；執行時只讀取所需資料 |
| 地形圖塊外觀 | `tile-keys.js`: 水岸、高地、旋轉規則；`main.js`: 高度足點偏移 | 打包時從現有函式生成兼容 Adapter，保留同一份投影／圖塊規則來源 |
| 顯示物件 | `main.js`: `createTerrainTileSprite`, `ensureTileSprite`; `viewport-culling.js`; `render-performance.js` | 試驗用獨立 Renderer 擁有掛載／銷毀權；原有 culling 不會銷毀新路徑物件 |
| 建設 | `tools.js`, `tool-actions.js`, `terrain-editing.js`, `building-placement.js` | Phase 2 再經 World Delta／世界座標 Adapter 接入；本輪只讀 |
| 存檔 | `save.js`, `portable-save.js`, `db.js`, `game-storage.js` | 不更改現有 schema；Phase 2 另加版本化 Delta，再接 SQLite／IndexedDB 交易 |
| 小地圖／Overlay | `city-minimap.js`, `overlay-controls.js` | Phase 3 接 Overview／Local Cache；本輪 LOD 是獨立地形後備，不冒充完整 Minimap |
| 生長／經濟／服務 | `sim-growth.js:growZoneTile`, `sim-infrastructure.js:updatePowerGrid`, `simulation.js`, `sim-economy.js` | 仍有 `buildingSprites.has/get` 作實體判斷，接建築卸載之前必須改成資料索引 |
| 地面裝飾／樹木 | `trees.js`, `debris.js`, `street-furniture.js`, `street-lamps.js` 等 | 目前依賴已探索包圍盒／Sprite；地形試驗不啟動這些系統 |
| 交通／拓撲 | `transport-expansion.js`, `metro-surface.js`, `tram.js`, `ferry.js`, `undersea-tunnel.js`, `region-connections.js` | 後續保留世界座標路網，分開交通時間狀態與畫面物件，避免卸載停止交通 |

### 已辨認的衝突

1. 現有「香港全境」是 256×256 同步生成區域，沒有資料／顯示生命週期區分；它不直接轉成新的 32×32 Manager。
2. 現有 Sprite 是否存在會影響生長及供電判斷；直接銷毀原有城市建築會破壞玩法。因此先以獨立地形 Scene 驗證 Renderer。
3. 現有城市存檔編碼器拒絕未探索地形的 `0`，而探索區塊清單未持久化。本輪不把新模式接入這個快照格式；Delta／migration 是下一階段的明確工作。
4. 舊全域尺寸已被先前提交改為可變。本輪保留該行為，獨立 `WorldModeAdapter` 不依賴或修改它，亦不把舊城座標搬到全港座標。

## 2. 現在可以驗證的流程

```text
hk-terrain-tiles.js
  → 驗證 2,400 行 RLE（每行 3,187 格）
  → 全港一次 finishHkTerrain
  → 1,900 個 64×64 Storage Chunks
  → 130 個 256×256 HTTP Region Packs + SHA-256 index
  → 按需 TerrainProvider（byte LRU / 最多三個讀取）
  → 32×32 Render Chunk + 1 tile halo
  → 最多九個掛載／正在掛載／正在卸載的細節區塊
  → 分幀掛載、全世界足點深度排序、真正銷毀

預製四方向 LOD ──────────────────→ 讀取期間及高細節範圍外兜底
```

每格封裝三個 byte：原始 DTM 碼、整理後地形類型、整理後高度。原始 `W/B/a–i` 資料保留，不以整理後 `HILL` 取代原始高程資訊。全港原始碼值、輸入檔、Region Pack 均有 checksum；manifest 保留 HK1980 地理參考及來源版本。

`finishHkTerrain` 使用現有坡度／海岸規則，只在離線全圖執行。其連通區暫存改用 typed queue，避免全港海域形成數百萬個 `[row,col]` 物件；測試對照原函式驗證結果一致。切 Chunk 後不再獨立平滑，halo 直接讀取同一份相鄰世界資料。

第一個試驗區域：`col=1472,row=1632,width=256,height=256`，起點 `(1584,1760)`，含海岸、陸地及高地。所有 ID、取樣與相機位置保留絕對世界座標。

## 3. 顯示、快取與所有權

- `WorldChunkManager` 管理 wanted set、每次請求 token、狀態、重試及差量更新；同一中心區塊內移動不重新排 I/O。
- 快速跳轉後，過期讀取可以完成，但結果不得掛載。回到同一 ID 時也必須確認該記錄的身份。
- 目標工作配額為每幀 3ms。每個掛載／移除步驟檢查期限；這是排程目標，並非 GC、驅動或 OS 排程的硬性耗時保證。
- 先移除離開 wanted set 的物件，再掛新細節；即使計入部分掛載／移除，數量仍不超過九塊。期間 LOD 保持顯示。
- 地形使用原有圖像合成的小型 atlas；依全世界足點深度建立 Blitter 批次。沒有以 Chunk Container 排序，也沒有每格建立獨立 Image，或每個區塊配置大 RenderTexture。
- 草地、水面及山坡原圖高度為 58–80px，atlas 只在圖片上方補透明像素，保留既有底部錨點及高度偏移。
- 可視裁切只改顯示狀態，Chunk 卸載才真正銷毀批次及 Bob。Renderer 不負責刪除世界資料。
- Storage decoded cache：2MiB。Region Pack cache：1MiB。最多三個同時讀取。Render Chunk 的小型 halo 副本隨 Renderer job 釋放，另有 byte 診斷。
- 預設不預取。完整 RLE JS 不在試驗頁面的 script 清單內。
- 獨立四方向 LOD 圖像每張 1024 級別；即使無高細節區塊亦可顯示。底圖不靠遍歷運行中的 `mapData` 重畫。

## 4. 使用及重現

```sh
npm run prepare:world-terrain
npm start
```

開啟 `http://localhost:3000/world/preview.html`。拖曳／兩指縮放、滾輪、R 旋轉，或按跨區跳轉。Phase 1 是只讀入口；目前 Phase 2 已加入建設及獨立世界存檔，完整 Minimap 留待 Phase 3。

生成資產在 `data/world-terrain/`，已加入 gitignore。保留輸入檔與 Builder，無需提交約 23MB 的可重建二進位資料。Builder 只有在新資料全部成功後才替換舊輸出，拒絕覆蓋未識別的非地形目錄。

```sh
npm run test:world
npm run smoke:world
npm test
```

`smoke:world` 自行開啟臨時 localhost 伺服器及隔離的 Chrome context，不開啟玩家資料庫。報告及截圖在 `test-results/world-streaming/`。

Electron 基準使用獨立臨時設定檔：

```sh
DRIVE_USER_DATA=/private/tmp/heungshing-world-baseline \
DRIVE_PORT=9237 ELECTRON_PERFORMANCE_MODE=1 \
node scripts/drive-electron.js scripts/world-streaming-baseline.js
```

使用隨專案附帶的真實城市 `UI/attract-city.json`（1,935 個建築錨點）。其 SHA-256 為 `a3919790226aeaede7547df93027c3e454ac251a6c7c4de80d1125cfc36974d2`；開始時已另外備份到臨時目錄。原始範例及玩家存檔均不修改。

基準記錄舊模式的 Sprite 數、記憶體、GPU、相機及排除啟動載入後的新 rAF 取樣視窗。原始 profiler 的累積 frame ring 可能包含載入幀，不能當成穩態 FPS。新試驗未有建築／交通／模擬，兩個場景不同，不能以兩份數字宣稱倍速改善。

首次隔離 Electron 記錄使用 Intel Iris Plus 655／ANGLE Metal。舊城市的 120 個穩態取樣幀 p95 約 34.30ms、p99 約 50.20ms，持有 65,536 個地形物件。地形試驗在九塊高細節區域內持有 963 個 Blitter 批次，p95 約 16.71ms。這些數字僅供後續相同場景重測作起點；它們不構成兩種完整城市模式的效能比較。

## 5. 驗證與階段界線

| 驗收 | 本輪證據 |
|---|---|
| C01–C03 | 精確驗證 7,500 Render／1,900 Storage、19／51 格右邊界及 32 格底邊界 |
| C04 | 單元及真實 Chrome 跨界保留六塊、移除三塊、增加三塊；計入部分掛載仍不超過九塊 |
| C05 | 相鄰 Chunk halo 的水岸／高度取樣一致；全圖整理後切塊；四方向畫面截圖 |
| C06 | 過期 async 回傳及往返跳轉測試，不掛載過期結果 |
| C07 | 0.4x、2560×1600 超闊視窗超出九塊細節範圍，獨立 LOD 仍保持顯示 |
| C12 | 原有正反投影四方向、長方形世界、分數座標 round-trip；Chrome 四方向畫面 |
| C14 | 原有 1,303 項回歸測試通過；新路徑未接入舊城市儲存／模擬 |
| C15 | 單元 40 次及 Chrome 20 次跨區跳轉，物件會銷毀，掛載上限及 byte cache 維持；尚非長時間遊玩認證 |
| C16 | checksum／資料／manifest 錯誤拒絕；真實 404 保留 LOD 並可重試恢復 |
| C17 | 試驗初始頁不讀完整 RLE、不建立／掃描全港 Phaser 物件 |
| C18 | Chromium 手機尺寸下真實 touch events 的拖動、雙指縮放；未等同實體 iPhone Safari 驗證 |

新增 12 項單元測試；完整測試合共 1,315 項通過。Chrome／Electron 報告是本機實測記錄，未訂為正式裝置效能門檻。

### 下一階段

以下為 Phase 1 完成時的清單；Phase 2 現況見 [建設與增量儲存](world-streaming-phase2.md)。

1. Phase 2：World Delta Store、Dirty Storage Chunk、SQLite／IndexedDB 交易、完整匯出及版本／回退；先修復資料與 Sprite 的耦合，再接建設卸載。
2. Phase 3：獨立 Overview／Local Minimap 與全港導航。
3. 接入正式全境模式前驗證跨 Chunk 建築／路網／遠區狀態、故障時保住未儲存資料。
4. 實體 iPhone Safari、桌面 Safari 與長時間 p95/p99／GPU／記憶體測量留到相應階段；現有結果不代表完成整份規格。
5. 正式 Web／Electron 發佈接入時，將二進位 Region Packs、manifest／Adapter／LOD 的版本及不可變 URL 納入既有資產建置；開發試驗頁目前使用本機 Phaser 開發套件。
