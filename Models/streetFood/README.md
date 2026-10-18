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

Norton 確認呢批圖本身比例無變形，所以顯示比例唔係全部夾一個長度，而係逐款按自身結構量。中間行過幾個彎：先試過用檯面／木箱底線量得的櫃身高度做基準（0.65m，太矮）；跟手改用**成張貼圖嘅高度**（連埋手柄同疊高嘅貨）去夾 1.3m、再 1.95m，但呢個先係用錯咗嘅 reference——「車仔既高度」唔應該連手柄同貨一齊計，應該淨係「前輪到前檯面」（Norton 原話）。定案：車仔（`body-cage`）用檯面／木箱底線量得的櫃身高度（`fitBodyCage` 嘅 `targetDropAtFront`）對應 **0.85m**（Norton 原估 0.8–0.9m 既中位數）；糖炒栗子車無檯面／底線兩組軸線，用返同批（魚蛋、煎釀三寶）量得嘅櫃身高度像素。手柄、疊高嘅鍋具貨物可以高過 0.85m，唔計落「車仔高度」入面，好似話張檯幾高唔計檯面上面擺緊既嘢。見 [12 款車仔連鏡像，紅線 0.85m 對正檯面](../../scripts/source-art/streetFood/previews/street-food-carts-scale-check.jpg)。圓檯用檯面闊對應 **1.0m** 直徑；摺凳及摺凳收納組對應 **0.32m** 闊；摺合圓檯對應 **0.25m** 闊。全部换算用遊戲既有 `FESTIVAL_PX_PER_METRE_ALONG`（2.5）／`FESTIVAL_PX_PER_METRE_UP`（5）慣例，令車仔同遊戲入面其他人物／道具大細夾得上。每件都記低 `groundAnchor`（最低 alpha≥128 嗰 5 行嘅 x 平均，同 `street-food-people.json` 嘅 `footAnchor` 做法一致）同 `display.scale`，喺 `data/street-food-geometry.json`。

仍待：夜間、收檔變體及遊戲登記（`street-food-assets.js`／`street-food-market.js`／`street-food-sprites.js`，見 [docs/street-food-market-design.md](../../docs/street-food-market-design.md)）。

- [車仔總覽](../../scripts/source-art/streetFood/previews/street-food-carts-isometric.png)
- [車仔基準線](../../scripts/source-art/streetFood/previews/street-food-carts-calibration.png)
- [檯凳基準線](../../scripts/source-art/streetFood/previews/street-food-furniture-isometric.png)
- [原圖／校正版互動比較](../../scripts/source-art/streetFood/previews/isometric-review.html)
- [原圖取點](../../scripts/source-art/streetFood/isometric-calibration.json)
- [校正 metadata、驗證值、顯示比例、接地點、原圖 hash](../../data/street-food-geometry.json)

重建：`node scripts/prepare-street-food-assets.js`。只驗證重建結果及原圖完整性：`node scripts/prepare-street-food-assets.js --check`。數值與透明通道測試：`node --test test/street-food-projection.test.js test/street-food-assets.test.js`。
