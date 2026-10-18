# 香港小食車仔：1:2 等角校正版

18 件透明 PNG：12 款車仔、6 件檯凳配件。這個目錄是校正後的模型；原始生成圖保留在 `scripts/source-art/streetFood/`。

| 類別 | 模型 |
|---|---|
| 車仔 | `sf_curryFishball.png`、`sf_friedSnacks.png`、`sf_roastChestnut.png`、`sf_cartNoodles.png`、`sf_cheungFun.png`、`sf_beefOffal.png`、`sf_stinkyTofu.png`、`sf_eggWaffle.png`、`sf_pickledSnacks.png`、`sf_fishSoupFauxFin.png`、`sf_friedIntestines.png`、`sf_sugarcaneJuice.png` |
| 檯凳 | `sf_roundTableCream.png`、`sf_roundTableMint.png`、`sf_foldingStoolRed.png`、`sf_foldingStoolGreen.png`、`sf_roundTableFolded.png`、`sf_foldingStoolsPacked.png` |

標準：地面菱形高：闊 **1:2**，可見地面軸斜率 **+0.5／−0.5**。以檯面直邊及木箱基線取點；生成圖上下框架原本不平行時分段校正，垂直方向保持不變。水平圓檯面擬合為闊：高 2:1 橢圓。原圖內部細節的繪畫誤差不視為可復原的三維量測。

摺合圓檯已直立，只能從可見摺腳橫桿量度一組軸線；另一組深度軸被遮擋。摺凳收納組亦有重疊，兩件的取點信心較低，已在 metadata 與檢視頁標記。

### 方向、顯示比例與接地點（2026-10-18）

12 款車仔各多一張 `sf_<id>_m.png`：原圖水平鏡像（`sharp().flop()`，同 `Models/streetFoodLighting` 雙柱燈串用法一致），接地點隨之鏡到 `outputSize[0]-1-x`，供車仔在場地兩側對著場內開口擺放，不必靠逐款重畫四向。檯凳本身左右對稱，不出鏡像版。

Norton 確認呢批圖本身比例無變形，每件只用**一個**均勻 scale（唔可以 X、Y 分開縮，否則等角斜率會走樣）。基準係一格 20m 嘅地面比率：TILE_WIDTH 100px ÷（20m×2 條地面邊）= **2.5px/m**（`FESTIVAL_PX_PER_METRE_ALONG`）。車仔量**檯面長邊**（紅線）：檯面兩條邊線各自沿一條地面軸線，由交匯嘅前角量到該線遠端，取較長嗰邊（呢條管線校正時 X 從不縮放，所以本身就係地面長度），對應 **2.3m**。第一版錯咗量「兩條線合計嘅 X 跨度」（即長邊＋短邊），成架車細咗約 30%（Norton：「你邏輯都有些少問題」，影埋欄杆比對先發現）。按長邊 2.3m，前輪到檯面高度落喺 0.64–1.04m（平均約 0.8m），同 Norton 估嘅 0.8–0.9m 吻合。糖炒栗子車嘅兩條取點線係爐身短段，唔係檯面邊，所以用返同一張原圖、同一個 zoom 嘅魚蛋車同煎釀三寶嘅平均比例。更早之前用檯面高度 0.85m ×「誇張」嘅 5px/m 去夾，成架車大咗約 3 倍（Norton：「起碼大左1倍」）。人物用同一套真實比例：身高 × 真實垂直比率 2.5 × cos30/cos45 ≈ **3.06px/m**，以人形本身頭頂到腳嘅像素（`figureHeightPx`）計，坐低嘅人按企高 0.75。圓檯 **1.0m** 直徑、摺凳 **0.32m**、摺合圓檯 **0.25m** 闊，本身已經係地面比率。見 [12 款車仔：紅線 2.3m、綠線人高](../../scripts/source-art/streetFood/previews/street-food-carts-scale-check.jpg)。每件記低 `groundAnchor`（最低 alpha≥128 嗰 5 行嘅 x 平均）同 `display.scale`，喺 `data/street-food-geometry.json`。

仍待：夜間、收檔變體及遊戲登記（`street-food-assets.js`／`street-food-market.js`／`street-food-sprites.js`，見 [docs/street-food-market-design.md](../../docs/street-food-market-design.md)）。

- [車仔總覽](../../scripts/source-art/streetFood/previews/street-food-carts-isometric.png)
- [車仔基準線](../../scripts/source-art/streetFood/previews/street-food-carts-calibration.png)
- [檯凳基準線](../../scripts/source-art/streetFood/previews/street-food-furniture-isometric.png)
- [原圖／校正版互動比較](../../scripts/source-art/streetFood/previews/isometric-review.html)
- [原圖取點](../../scripts/source-art/streetFood/isometric-calibration.json)
- [校正 metadata、驗證值、顯示比例、接地點、原圖 hash](../../data/street-food-geometry.json)

重建：`node scripts/prepare-street-food-assets.js`。只驗證重建結果及原圖完整性：`node scripts/prepare-street-food-assets.js --check`。數值與透明通道測試：`node --test test/street-food-projection.test.js test/street-food-assets.test.js`。
