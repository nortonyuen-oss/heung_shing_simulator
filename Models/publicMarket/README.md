# 香港街市（遊戲佔地 2×2）

## v3 美術修訂

`pm_market3x3_style_v3.png` 按遊戲現有圖書館、小學及魚市場統一美術，補回牆柱、窗框、檔口、綠化及配件的整體立體光影；沿用 v2 的 3×3 用地與公園／落貨區配置，再將重繪基準點對回 1:2 投影。v2 保留作幾何底稿。

v3 已以 `public_market_2x2` 接入遊戲。建造選單：公共服務 → 政府與經濟 → 街市，佔2×2格，造價$3,200，每月維護$80，可重複興建並存讀檔；已有日間／夜間貼圖。2026-10-18 按試玩回饋縮為 2×2；現有 3×3 街市讀檔時使用新尺寸，在原錨點重建。下方 60×60 米資料為原始設計稿，遊戲現縮至 40×40 米。

[前後並排對照](../../scripts/source-art/publicMarket/style-v3/comparison.png)／[原稿、完整 prompt 及驗證說明](../../scripts/source-art/publicMarket/style-v3/README.md)。

## 格線建構版 v2

本版按使用者要求，先畫超幼灰色 1:2 菱形格線，再佈局及建立固定座標建築。最終輪廓由數學投影決定，內建 imagegen 只供應正面、側面、屋頂及地台的平面材質，沒有把整張生成畫當作幾何準確成品。

- `pm_market3x3_grid_v2.png`：1600×1400 透明 PNG，保留外露的超幼灰色格線。
- `pm_market3x3_clean_v2.png`：同一模型，隱藏參考格線。
- `pm_market3x3_grid_v2.svg`：與 PNG 同一套精確投影，材質全部嵌入，可獨立檢視。

全場 **60×60米＝3,600平方米＝3×3格**，包含前方公園及右側落貨區。兩層街市佔地約 42×36米；地下魚肉菜檔，上層乾貨及熟食中心。公園有三棵樹、長凳、燈柱及通往入口的空間。落貨區有貨物捲閘、黃線落貨位、平台、貨箱及手唧車。人物及車輛未烘焙進模型。

投影：`screenX = 200 + 10×(x+y)`；`screenY = 800 + 5×(x−y) − 20×z`。X/Y/Z 以米計。地面兩軸斜率 **±0.5**，正方形地盤的闊：高 **2:1**，垂直方向保持直立。屋頂、樓層及主牆面使用同一投影。細節材質含繪畫紋理，不代表施工圖或精確室內間隔。

- [四階段預覽](../../scripts/source-art/publicMarket/grid-v2/stages.png)
- [灰色底格](../../scripts/source-art/publicMarket/grid-v2/01-grid.png)
- [用地佈局](../../scripts/source-art/publicMarket/grid-v2/02-layout.png)
- [建築幾何底稿](../../scripts/source-art/publicMarket/grid-v2/03-construction-guide.png)
- [地盤及屋頂邊線核對](../../scripts/source-art/publicMarket/grid-v2/05-geometry-audit.png)
- [原始材質及完整 prompts](../../scripts/source-art/publicMarket/grid-v2/README.md)
- [幾何、錨點及檔案 hash](../../data/public-market-geometry.json)
- [成品 PNG 輪廓獨立量度](../../scripts/source-art/publicMarket/grid-v2/raster-edge-audit.json)：兩條可見地盤邊線約 +0.500004／−0.499994。

重建：`node scripts/public-market-grid.js`，再執行 `node scripts/build-public-market-asset.js`。檢查相同輸出及原稿完整性：`node scripts/build-public-market-asset.js --check`。依賴專案既有 `sharp` 及 `Models/trees/tree02.png`／`tree08.png`。尚未接入遊戲，只有一個視角及日間素材。
