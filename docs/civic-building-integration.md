# 新泳池、籃球場及街市接入

用戶要求直接替換原本位置的泳池及運動球場貼圖，並將街市加入建造選單。

| 用途 | 已確認來源 | 遊戲使用路徑 | 貼圖鍵 | 佔格 |
| --- | --- | --- | --- | --- |
| 游泳池 | `Models/swimmingPool/sp_simple3x3_v2.png` | `Models/parks/park3x3/swimmingPool3-01.png` | `park_large_pool` | 3×3 |
| 籃球場 | `Models/basketballCourt/bc_estateFullCourt_v2.png` | `Models/parks/park2x2/sportField3-02.png` | `sports_ground_2x2` | 2×2 |
| 街市 | `Models/publicMarket/pm_market3x3_style_v3.png` | 同來源 | `public_market_2x2` | 2×2 |

泳池及球場檔案是確認來源的逐位元組副本。舊圖及原／新雜湊保存在 `scripts/source-art/civic-asset-replacements/2026-10-18/`。泳池及球場保留城市存檔座標、建築類型及佔格。街市於 2026-10-18 按試玩回饋改為 2×2；舊 `public_market_3x3` 在讀檔時轉成新模型，保持原錨點並釋出多出的五格。3×3運動中心並非本次2×2籃球場的替換對象。

街市使用普通固定建築流程，類型 `public_market`，工具 `public-market`。選單：公共服務 → 政府與經濟 → 街市；造價$3,200，每月維護$80，電力需求8，附近6格地價加成0.02。沒有地標人口門檻、議會決議或唯一建築限制。一般建造預覽、佔格／預算檢查、存讀檔、檢視、改名及拆除沿用現有流程。

三個模型均以地盤角點定位，接入時沒有加上局部扭曲。模型尺寸快取升至v12；替換貼圖另有URL版本，避免原檔名的快取沿用舊圖。球場的節慶範圍改為新鐵網內的球場連緩衝地面。泳池與球場舊夜間燈光座標已換成新模型位置，街市附店面及入口照明。

WebP及夜間派生貼圖重新產生於 `.data/package-assets/`，亦重建道路線條派生貼圖以維持整套發行資產完整。

回歸測試：`test/civic-building-assets.test.js` 覆蓋原路徑替換、貼圖鍵／佔格兼容、街市選單及預覽、建造扣款、阻擋佔用／資金不足、重複興建、舊縮放資料重算及正常維護／電力設定。另驗證地盤定位、節慶、運輸及發行資產。

2026-10-18 試玩修正驗證：全套 1,059 測試通過；資產驗證 1,324 張無損 WebP，錨點映射最大誤差 0px。私人測試城市確認舊街市存檔原錨點轉為 2×2、釋出五格，泳池及球場保持原位置。泳池 v2 由內建 image_gen 依幾何底稿重繪，四條水面邊另行量度（詳見 data/swimming-pool-geometry-v2.json），沒有局部網格扭曲。
