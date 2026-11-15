# Phase 5：入口接線、效能與發佈驗收

分支：`codex/world-chunk-streaming`。依照 [規格 Phase 5](world-chunk-streaming-spec-v1.0.md) 驗證全港引擎，並將「開新城市 → 香港全境」由舊逐區生成路徑改接新引擎。

**產品界線：** 使用者已明確要求全境最終融入原遊戲，而非獨立功能。本輪的 `/world/index.html`、世界工具列及世界存檔列表是過渡實作；不能將入口已接通視為原遊戲介面／玩法已完整整合。下一輪必須按本文末的整合清單落實。

## 入口與存檔

- 原有「開新城市」的「香港全境」直接進入新引擎，建立唯一世界 slot，保留城市名稱及起始年份。重載同一 URL 不會再開新 slot 或覆蓋其他世界。
- 揀選全境時不再呼叫舊 `getTerrain()`／`initializeChunkedTerritoryWorld()`。原城市主選單仍帶有支援舊隨機地形的 RLE 程式；新的世界文件不載入這份 RLE，也不啟動舊模擬。
- 暫時以「全港世界存檔」列出世界 slot；原本的城市存檔繼續可用。全境的舊道路款式／交通套件選項會隱藏，避免設定沒有作用。
- 編輯器暫不列出舊全境入口；世界引擎已有整地工具。原本地區及 256×256 編輯器流程保留。
- 正式世界入口是 `/world/index.html`；舊 `/world/preview.html` 保留轉址。素材失敗或 slot 不存在有可操作的錯誤、重試及返回主選單，不默默回到舊全境引擎。

## Safari／區域網絡

原生 Safari 測試發現跨文件跳轉時，舊 IndexedDB 連線／寫入 lease 可能未完成交接。現在主動等待儲存、釋放 writer 及關閉連線後才跳頁；pagehide 同步關閉連線，以一次性、同分頁的 session token 交接 fallback lease。bfcache 恢復會重新取得連線，複製分頁不會共享寫入權。

區域網絡 HTTP 沒有 secure-context `randomUUID`／`crypto.subtle` 時，UUID 仍使用 `getRandomValues`，SHA-256 使用本地實作；校驗不會被跳過。SHA padding 邊界與完整 196,608-byte pack 均與原生 digest 比對。

## 效能結果

測試是同一部 Mac、1280×900、Chrome headless；數字不能當作所有裝置 FPS 保證。GPU 真實峰值未能由此介面量測，報告保留 null，不把 JS heap 當成 GPU memory。

### 32／64 Render 比較

只比較地形，使用相同起點、zoom 0.8、相同跨區路徑。64 僅由獨立 benchmark query 啟用，停用建設及儲存；正式世界與所有存檔仍為 32 Render／64 Storage。

| 指標 | 32 Render | 64 Render |
|---|---:|---:|
| 穩定 rAF p95 | 16.7 ms | 16.7 ms |
| 區塊要求至顯示 p95 | 260.1 ms | 995.7 ms |
| 掛載 p95 | 33.7 ms | 134.3 ms |
| 該位置顯示物件 | 675 | 1,864 |
| 詳細地形 Tile | 9,216 | 36,864 |

因此保留 32。這項決定以載入成本及物件量為依據，沒有宣稱穩定 FPS 提高四倍。

### 大量建設與儲存

合成工作負載：48,000 格道路、24,064 格鐵軌、16,000 格分區、1,813 棟建築，加 16 個鐵路實體，共 1,829 個實體、64 班次；匯出約 10.0 MB。工作負載只放入獨立測試 DB，不注入玩家城市。

| 指標 | IndexedDB | SQLite API |
|---|---:|---:|
| 跨區次數／持續時間 | 269／120 秒以上 | 274／120 秒以上 |
| 初次完整保存 | 1,330.9 ms | 1,263.0 ms |
| metadata 保存 | 939.8 ms | 844.7 ms |
| 100 年（36,500 日）補算 | 22.3 ms | 24.7 ms |
| 初次 GC 後 heap | 39,393,931 bytes | 38,747,450 bytes |
| 結束 GC 後 heap | 46,856,486 bytes | 43,469,676 bytes |
| 詳細掛載峰值 | 9 | 9 |
| 結束診斷 frame p95／p99 | 16.68／25 ms | 16.68／20 ms |

快取上限持續保持：解碼 2 MiB、pack 1 MiB、局部地圖 4 MiB。補算及重載後 1,829 個實體、64 班次均保留。這是短時壓力驗收，並非數小時實機 soak 或真實玩家擠塞模型測試。

本輪亦將道路／分區顯示改為只查相交 Storage Chunks，避免每次跨區掃描全港所有已建道路；metadata checkpoint 不再先序列化整個世界。新增端到端載入及保存延遲診斷。

## 平台與失敗測試

- Chrome：新城市／續玩入口、IndexedDB／SQLite 壓力、四旋轉、cache／物件上限、儲存及重載。
- Safari 18.6（macOS）：原生 WebDriver、區域網絡 HTTP，主選單建立、建設／保存、24 次遠區跳轉、重載、返回主選單及續玩；同分頁重載後仍有寫入權。
- iPhone Safari：使用者透過同一 Wi-Fi 實機測試，修正輸入網址後回報「依家開到了，一切正常」。未提供 iOS 版本及逐項計時，與模擬器結果分開記錄。
- Electron 39.8.10：實際未簽署 macOS x64 安裝包，獨立 profile；主選單建立、建設／保存、40 次遠區／四旋轉及重載成功。ANGLE Metal／Intel Iris Plus 655，180-frame window p95 17.4 ms、p99 17.6 ms；小型城市 SQLite flush p95 6.6 ms。與 Chrome headless 工作負載不同，不能直接比較 FPS。
- Offline：世界 shell、Overview 及已訪問 pack 可從 Service Worker 回復；未快取遠區保留 LOD 及建設資料，恢復連線後重試成功。

## 發佈資產

網頁 build 現在打包世界 HTML、程式、Phaser、atlas、四方向 Overview、Local Cache、模型、道路／鐵軌及 130 個 binary packs。每個資源用內容雜湊位址，世界 page 不依賴 `node_modules` 或開發資料夾路徑。

Service Worker 的 shell 去重後包含世界程式及必要圖像，pack／local raster 按需快取。離線 navigation 分清城市與世界 shell。新 build 在暫存目錄完成後替換，保留近期舊內容雜湊資源，讓已開啟頁面可繼續載入自己的版本。

Phaser 改為桌面 runtime dependency，Electron 將原本 CDN Phaser 請求轉至安裝包內的本地副本。世界資料由 release prepare 建立及驗證，避免只在開發機存在。發佈輸出排除資料庫、開發憑證目錄及未完成的 world build 資料夾。

未簽署測試包：`release/world-phase5/mac/The City of Heung Shing.app`。實際 ASAR 已檢查世界腳本、Phaser、三種鐵軌素材、1,900 個 Storage Chunk 索引及 130 個 pack checksum；未上載、未簽署、未公開發佈。舊模型 pipeline 另有 1,850 張 lossless WebP 驗證，最大 anchor error 0 px。

```sh
npm run test:world
npm test
npm run prepare:release-assets
npm run verify:release-assets
npm run build:web
npm run verify:web
npm run verify:world-assets
WORLD_SOAK_SECONDS=120 npm run smoke:world:release
node scripts/smoke-world-offline.js
```

報告及截圖在 `test-results/world-phase5/`，生成資料及打包產物不納入 Git。未簽署／未公開發佈的本機驗收包不代表已上線。

完整單元／回歸套件 **1,355 項通過**；世界專項 **52 項通過**。主選單兩後端、32／64 比較、兩後端壓力、離線／LAN、原生 Safari、實際 Electron 包及使用者 iPhone 回報各有獨立紀錄。

## 下一輪必做：融入原遊戲

使用者的要求優先於將獨立世界頁當作最終產品。後續整合必須包括：

1. 原本 HUD、建設選單、地格檢查、小地圖與視窗操作共用；同一遊戲 Scene／host 選擇城市或全境資料來源，逐步移除過渡世界頁。
2. 原有「載入存檔／匯入／匯出」統一列出及派送城市與世界格式，取消獨立世界功能的使用體驗，保留現有世界 slot 及備份。
3. 原有建築目錄、道路款式、交通站點／乘客、生長、需求、財政及服務規則逐項接 World Data／Entity／Network Adapter；不能只把原遊戲嵌入另一頁或沿用簡化玩法當完成。
4. 全境只保留最多九塊詳細地形、世界實體與 Sprite 分離；不能為了重用 HUD 而重建 7,648,800 格陣列或保留另一套巨型地形 Scene。
5. 舊 256×256 城市、既有世界 v2、原有未提交修改與存檔 rollback 都要有回歸驗證。
