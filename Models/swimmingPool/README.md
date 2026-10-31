# 現用版本：v2

`sp_simple3x3_v2.png` 已置換原遊戲泳池路徑。佔地維持 3×3，原錨點讀檔重算。按試玩回饋，使用幾何底稿重繪，再以單一全圖仿射作輕微投影校正，沒有局部扭曲。四條池邊另行量度，斜率約 +0.498、+0.529、−0.506、−0.493；生成細節仍有少量誤差。

[完整 prompt](../../scripts/source-art/swimmingPool/v2/prompt.md)；[幾何量度](../../data/swimming-pool-geometry-v2.json)。

以下為 v1 歷史資料：

# 香港簡約公眾游泳池 v1

主模型：[sp_simple3x3_v1.png](sp_simple3x3_v1.png)，1600×1400 RGBA透明底。設計用地3×3格，每格20米，即60×60米。

單一50×25米主池、低層更衣室兼入口及售票窗、小機房、池邊通道、救生員高椅、長凳、欄杆、照明與兩個樹池。色調與已選定的街市v3、籃球場v2配合。人物留作獨立圖層。

先製作精確的灰色1:2格線及佈局，再用內建image_gen生成。移除誤生成在屋頂的配件後，僅以單一整體仿射變換校正，直線與垂直線保持原狀。實際地盤前兩邊斜率約±0.5；原始生成圖的個別屋頂、池邊角度及內部尺寸未宣稱逐像素匹配精確草圖。

已原位替換遊戲的 `Models/parks/park3x3/swimmingPool3-01.png`；沿用 `park_large_pool` 貼圖鍵及3×3佔格，現有城市的建築座標不變。舊圖備份在 `scripts/source-art/civic-asset-replacements/2026-10-18/originals/`。

原圖、兩份提示詞、格線、佈局、建設草圖與預覽：`scripts/source-art/swimmingPool/v1/`。校正參數及檢查資料：`data/swimming-pool-geometry-v1.json`。
