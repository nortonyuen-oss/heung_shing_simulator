# Phase 2：世界增量儲存與建設

分支：`codex/world-chunk-streaming`。沿用 [v1.0 規格](world-chunk-streaming-spec-v1.0.md) 的 256×256 試驗區域，建立可操作、可保存的建設流程。Phase 1 的 64×64 Storage／32×32 Render／最多九塊高細節限制繼續保留。

## 操作

```sh
npm run prepare:world-terrain
npm start
```

開啟 `http://localhost:3000/world/preview.html`。本機服務使用 SQLite；以純靜態伺服器開啟時使用 IndexedDB。亦可用 `?storage=browser` 明確測試瀏覽器儲存，或用 `?storage=desktop` 驗證本機服務存在。

- 選工具後點地圖預覽，再按「確定建設」，確認前不扣款。
- 道路、路軌、橋樑及分區可點選起點及終點；橋樑第一步先選陸地起點，再選對岸終點。
- 建築提供既有公共街市（2×2）及維園地段（4×4）。斜坡上可先用整平工具準備地段。
- 整平／升高／降低地形會一併處理必要的相鄰坡度；遇到既有建設或影響試驗區外時拒絕整筆操作。
- 挖掘水域後可用橋樑跨過；地面路軌需同高度陸地。
- 修改後自動儲存，亦可按「儲存」或 Ctrl/Cmd+S。右上角顯示儲存狀態。
- 「載入」會先保護未儲存修改。「上一版」可回復上一次成功儲存的資料；被回復的版本會保留成新備份。
- 「匯出備份」包含所有區域的修改、道路、分區及實體，與目前九個顯示區塊無關。「匯入備份」會開新存檔，不覆蓋原本的世界。

試驗資金為 $100,000。這一階段提供建設及持久化驗證，尚未接入正式城市人口、生長、解鎖、收支或運行中的車輛模擬。主遊戲的 256×256 城市功能與原有存檔保持獨立。

## 資料所有權

`WorldDeltaStore` 是玩家建設的唯一資料來源。建築、橋樑、路軌有固定實體 ID、絕對世界座標及 Owner Storage Chunk。所有佔地格都有資料索引，不用 `buildingSprites.has()` 判斷建築是否存在。

跨 Storage Chunk 的實體只保存一份主記錄，所有受影響區塊保存同一 ID 的引用。建造或拆除在一個資料 transaction 中驗證所有引用與碰撞，然後一次公布；驗證失敗不改地圖、不扣錢。從非錨點佔地格拆除也會移除整個實體。

顯示層以世界實體 ID 去重。Render Chunk 的空間索引包含模型足跡與 overhang ghost reference；錨點在高細節範圍外、但模型仍伸入附近畫面時，可以保留一個顯示物件。區塊離開畫面後只銷毀顯示物件，資料及未儲存增量繼續保留。

道路、分區與模型按資料 revision 增量更新；保留仍需要的 Sprite，銷毀離開範圍的 Sprite。地形修改只令受影響的 Render Chunks 及其 1 tile halo 重新掛載，不重建全部九塊。

`WorldDataAccess` 把玩家修改覆蓋在唯讀 Base Terrain 上，永不寫回原始資料快取。當地形改回 Base 值時會移除該格的 Delta。地形整理及相鄰取樣仍使用一致世界座標。

## 存檔格式與後端

新世界格式為 `heung-shing-world-state`、`schemaVersion: 2`；匯出外層為 `heung-shing-world-save`、`formatVersion: 1`。它與舊城市 v14/v15 schema 分開，不會把舊城 Row:Col 索引移到全港座標。

每份世界存檔包含 world ID、Base Terrain 版本、世界尺寸、64 格 Storage Chunk 尺度、建設 revision、試驗城市 metadata／資金，以及：

- 各區塊的地形差異、道路、分區、實體引用及 revision；
- 所有實體的唯一主記錄與跨區路網格序列；
- 建設儲存時的相機位置、旋轉及縮放。

Base Terrain、Render Chunk 快取與 Phaser 物件不進入存檔。

| 後端 | 新資料 | 一致性 |
|---|---|---|
| SQLite | `world_saves`、`world_chunks`、`world_entities`、`world_save_backups` | 單一 `BEGIN IMMEDIATE` transaction 更新 metadata、所有 Dirty Chunks、實體及上一版備份 |
| IndexedDB | 既有 `heung-shing-game` DB 由 v1 加法升至 v2，新增 `worldSaves`、`worldChunks`、`worldEntities`、`worldBackups` | 同一 readwrite transaction；按 save ID 索引讀取相關記錄；沿用既有 writer lease／Web Lock |

新 SQLite 表不修改舊 `game_saves`。IndexedDB 原本六個 store 不刪除、不搬動；有專門測試由 v1 升級後舊 v14 城市仍然完整。

寫入只傳送 Dirty Chunks 及 Dirty Entities；持久層保留完整前一版備份供還原。schema、Base Terrain 版本、世界尺寸、實體 ID、足跡、跨區引用及道路／路軌連通序列均會驗證。錯誤或不支援的備份先拒絕，再保留目前世界。

世界備份採 20MiB 檔案上限，超限會明確報錯。現有城市匯出格式與大小限制不變；世界備份要從世界試驗入口匯入。

## 失敗與同時寫入

- backend storage revision 與本地建設 revision 分開。兩個視窗競爭同一存檔時，舊 revision 寫入回報 409，避免覆蓋新資料。
- 儲存只確認該 immutable checkpoint 的 revision。送出期間新增的修改仍然 Dirty，之後再儲存。
- SQLite 寫入失敗或 IndexedDB quota error 都會整筆回退，避免只有半個跨區建築被保存。
- 儲存失敗不清除 Dirty 狀態；使用者可重試或匯出包含畫面外建設的完整備份。
- 瀏覽器只有暫存記憶體 fallback 時，不會假裝成功永久儲存。
- 關閉尚有 Dirty 修改的頁面會顯示瀏覽器離開提示。畫面卸載仍可繼續，因為未儲存資料由獨立世界資料層保留。

## 驗證

```sh
npm run test:world
npm run smoke:world
npm run smoke:world:construction
npm test
```

`test:world` 包含資料／顯示生命週期、跨 32／64 邊界的 2×2／4×4 建築、長道路／橋樑／路軌、Base 不可變、非錨點拆除、版本衝突、儲存中的新修改、SQLite 故障注入、IndexedDB quota 故障注入、舊瀏覽器 DB 升級及還原備份。

`smoke:world:construction` 分別用真實 Chromium 測 IndexedDB 及本機 SQLite API。在真實地形上整地、以滑鼠選點建街市，建造四種實體、分區及道路，移開畫面、重新載入、返回，確認唯一主記錄與顯示物件；再走完整匯出、非錨點拆除、還原上一版及匯入新存檔。全程高細節掛載不超過九塊。

測試使用獨立 Chrome context 與臨時 SQLite，不開啟玩家原有資料庫。報告、備份及畫面在 `test-results/world-construction/`。

## 後續界線

Phase 3 再接 Local Minimap／World Overview 及全港導航。正式城市主選單、完整交通運行、城市經濟聚合與發佈資產整合仍按規格後續階段處理。實體 iPhone Safari 與長時間壓力測試尚未驗證，本輪 Chromium touch／桌面驗證不代表完成這些平台測試。
