# Models 資產盤點

更新日期：2026-07-19

## 總覽

- 遊戲 PNG 模型：144
- 已由登記表、模型目錄或動態 key 使用：141
- 尚未接入玩法：3
- 非遊戲生成檔：24 個 `.DS_Store`、2 個 `process_log.csv`、2 個 `settings.json`

| 分類 | PNG 數量 | 狀態 |
|---|---:|---|
| airport | 1 | 新建機場 12×12；舊存檔支援 6×6、8×8 fallback |
| commercial | 23 | 1×1 至 5×5 已接入 |
| containerPort | 4 | 四個海岸方向已接入 |
| government | 21 | 18 張已接入，3 張保留作新玩法 |
| industrial | 17 | 1×1 至 3×3 已接入 |
| parks | 11 | 公園、泳池、運動場及旗艦公園已接入 |
| powerStation | 3 | 燃煤、太陽能、核電已接入 |
| residential | 37 | 1×1 至 5×5 已接入 |
| specialSites | 12 | 地標及同尺寸隨機變種已接入 |
| trees | 15 | 由 `TREE_SPECIES` 動態 key 載入 |

## 本輪更新檢查

- 144 張模型全部可解碼，並且全部具有透明通道。
- 固定 registry、住宅／商業／工業 catalog 與目前檔名完全吻合，沒有失效引用。
- 已移除顯示異常的 `commercialBuilding1-02-M.png`、`commercialBuilding4-03-L.png` 及 `commercialBuilding4-04-L.png`；舊存檔會按相同 footprint fallback 到現有模型。
- 打包管線會由 PNG 母檔自動產生 144 張 WebP；使用嚴格單次 defringe，145.0 MiB 降至 25.1 MiB，避免重複處理破壞反鋸齒及植物細節。
- manifest hash 已納入模型路徑及 metadata cache；同名換圖不會沿用舊貼圖或透明邊界資料。
- 建築會裁走全透明畫布，樹木保留原畫布；WebP anchor 審計最大偏差為 0.00px。
- 遊戲啟動只預載每個 footprint／tier 的代表模型，其餘按需載入並受 192 MiB soft LRU budget 管理。
- 以 manifest 尺寸估算，zone texture 啟動解碼量由全載入約 216.8 MiB 降至約 74.0 MiB（減少 65.9%）。
- `/Models/` 圖片改為每次重載時條件式重新驗證，避免一小時媒體快取遮蔽最新貼圖。
- 貨櫃碼頭四方向已使用 4×4 footprint；機場新建尺寸為 12×12，舊存檔保留 6×6／8×8 fallback。

## 尚未接入及建議用途

- `Models/government/1x1/policeStation1.png`：低成本 1×1 社區警崗，覆蓋較小。
- `Models/government/1x1/schoolHall1.png`：1×1 幼稚園、社區會堂或成人教育中心。
- `Models/government/3x3/fireStation3-01-Photoroom.png`：3×3 區域消防總局，較高建造費及覆蓋半徑。

這三款沒有直接混入現有隨機變種，因為 footprint 不同；隨機建造時改變佔地會令預覽與實際碰撞範圍不一致。

## 非遊戲檔案

`.DS_Store`、`process_log.csv` 與 `settings.json` 不應由遊戲載入或納入模型登記。它們目前保留作來源追溯，日後可在確認不再需要資產處理紀錄後統一清理。
