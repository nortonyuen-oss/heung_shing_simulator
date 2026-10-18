# 香港小食車仔：1:2 等角校正版

18 件透明 PNG：12 款車仔、6 件檯凳配件。這個目錄是校正後的模型；原始生成圖保留在 `scripts/source-art/streetFood/`。

| 類別 | 模型 |
|---|---|
| 車仔 | `sf_curryFishball.png`、`sf_friedSnacks.png`、`sf_roastChestnut.png`、`sf_cartNoodles.png`、`sf_cheungFun.png`、`sf_beefOffal.png`、`sf_stinkyTofu.png`、`sf_eggWaffle.png`、`sf_pickledSnacks.png`、`sf_fishSoupFauxFin.png`、`sf_friedIntestines.png`、`sf_sugarcaneJuice.png` |
| 檯凳 | `sf_roundTableCream.png`、`sf_roundTableMint.png`、`sf_foldingStoolRed.png`、`sf_foldingStoolGreen.png`、`sf_roundTableFolded.png`、`sf_foldingStoolsPacked.png` |

標準：地面菱形高：闊 **1:2**，可見地面軸斜率 **+0.5／−0.5**。以檯面直邊及木箱基線取點；生成圖上下框架原本不平行時分段校正，垂直方向保持不變。水平圓檯面擬合為闊：高 2:1 橢圓。原圖內部細節的繪畫誤差不視為可復原的三維量測。

摺合圓檯已直立，只能從可見摺腳橫桿量度一組軸線；另一組深度軸被遮擋。摺凳收納組亦有重疊，兩件的取點信心較低，已在 metadata 與檢視頁標記。

仍為單一方向；四向、夜間、收檔變體及遊戲登記屬後續工作。本次沒有按圖片畫布寬度強行統一實際米制大小。

- [車仔總覽](../../scripts/source-art/streetFood/previews/street-food-carts-isometric.png)
- [車仔基準線](../../scripts/source-art/streetFood/previews/street-food-carts-calibration.png)
- [檯凳基準線](../../scripts/source-art/streetFood/previews/street-food-furniture-isometric.png)
- [原圖／校正版互動比較](../../scripts/source-art/streetFood/previews/isometric-review.html)
- [原圖取點](../../scripts/source-art/streetFood/isometric-calibration.json)
- [校正 metadata、驗證值、原圖 hash](../../data/street-food-geometry.json)

重建：`node scripts/prepare-street-food-assets.js`。只驗證重建結果及原圖完整性：`node scripts/prepare-street-food-assets.js --check`。數值與透明通道測試：`node --test test/street-food-projection.test.js`。
