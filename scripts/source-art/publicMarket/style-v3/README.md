# 街市 v3：與現有模型統一美術

使用者認為 grid-v2 比例正確，但整體構圖與遊戲現有模型不一致。本版沿用九格用地、兩層街市、前方公園及右側落貨區，以現有圖書館、小學及魚市場作直接美術參考，重繪整體光影、窗框厚度、牆柱、植栽、長凳、貨箱及屋頂設備。

內建 imagegen 編修，非 CLI；輸入第一張為 v2 精確幾何，其他三張只供美術風格參考。完整 prompt：[prompt.md](prompt.md)。原稿：[style-source.png](style-source.png)。

生成工具在重繪時改變了取景及角度，因此原稿不直接作最終幾何。依 [registration.json](registration.json) 的地台、屋頂及牆腳基準點，用分片仿射網格對回既有投影，保留完整重繪的立體光影。所有主要建築邊線均為網格邊，沒有翻折三角形。部分被樹遮擋的牆腳為估計取點，個別繪畫細節不代表精確三維重建。

成品：[pm_market3x3_style_v3.png](../../../../Models/publicMarket/pm_market3x3_style_v3.png)，1600×1400 透明 PNG。沒有覆蓋 v2，也未接入 runtime。

- [前後及現有圖書館並排對照](comparison.png)：各圖等寬展示，用於比較美術，並非同尺場景配置。
- [基準點、hash、獨立 PNG 輪廓量度](../../../../data/public-market-style-v3.json)
- 重建：`node scripts/prepare-public-market-style.js`
- 驗證：`node scripts/prepare-public-market-style.js --check`

成品 PNG 的透明輪廓獨立擬合：兩條地盤邊線約 +0.50019／−0.50083；後方兩條屋頂邊線約 −0.49997／+0.50005。原始生成檔保持不變，四邊透明安全範圍通過檢查。這些驗證針對主要投影輪廓；美術風格仍以與既有模型並排觀察為準。

風格參考檔案：`Models/government/2x2/library2-01.png`、`Models/government/2x2/primarySchool2-01.png`、`Models/specialSites/1x1/fishMarket1-02_day.png`。沒有把參考圖中的旗幟、名稱、車輛或建築搬進街市。
