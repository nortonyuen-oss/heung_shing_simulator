# 先格線、後佈局、再建設

使用者指出先前自由生成圖並非 1:2 等角後，本版改用固定世界座標建立整個場地及建築。

1. `01-grid.svg`／PNG：超幼灰色 3×3格，外框菱形闊高比 2:1。
2. `02-layout.svg`／PNG：60×60米內分配兩層街市、前方公園及右側落貨區。
3. `03-construction-guide.svg`／PNG：屋頂、牆面、樓層、花槽及裝卸區都由同一數學投影建立。
4. `04-market.png`：將材質貼到固定幾何後的透明成品；與 `Models/publicMarket/pm_market3x3_grid_v2.png` 相同。
5. `05-geometry-audit.png`：在成品上標出精確地盤及主屋頂外框供核對。

`texture-atlas.png` 為內建 imagegen（非 CLI）製作的平面材質圖集：左上正面、右上側面、左下屋頂、右下鋪地。材質以固定仿射映射貼到屋頂、牆身及地台，不再讓生成器重畫建築輪廓。完整生成 prompt：[texture-atlas-prompt.md](texture-atlas-prompt.md)。圖集原檔保留不變。

`paint-study.png` 是曾以幾何底稿直接重繪的研究圖；生成工具仍改動了角度及取景，所以它**不是最終模型**。其 [prompt](paint-study-prompt.md) 留存供追溯。先前 `../v1/` 兩張自由生成圖同樣只保留作研究，不用作本版幾何基準。

三棵樹重用專案現成 `Models/trees/tree02.png`、`tree08.png`，以固定位置放入花槽。其餘配件由世界座標建構。樹冠屬有機輪廓，不用樹冠量度等角投影。

幾何基準：[grid-geometry.json](grid-geometry.json)。成品尺寸、世界座標投影、材質裁區、來源 hash 及輸出 hash：[public-market-geometry.json](../../../../data/public-market-geometry.json)。

本版沒有建立 runtime 行為、四向旋轉、夜間燈光或室內模擬。成品為 SVG 及透明 PNG 美術資產，並非可編輯的 Blender/FBX 三維網格。
