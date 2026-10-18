# 排檔雙柱燈串 v1

新製兩支舊式鍍鋅鐵柱、獨立石屎座、微垂電線及八粒裸燈泡；透明 PNG，沒有檔口、人物或檯凳黏在同一張圖。

| 檔案 | 方向／狀態 |
|---|---|
| `sf_stringLights_down.png` | 柱腳連線向右下，日間熄燈 |
| `sf_stringLights_up.png` | 柱腳連線向右上，日間熄燈 |
| `sf_stringLights_down__lit.png` | 向右下，暖白亮燈 |
| `sf_stringLights_up__lit.png` | 向右上，暖白亮燈 |

四張同為 1854×1492，使用同一組接地錨點。兩個斜向由水平鏡像取得，不是另建的四個三維視角。石屎座上的小邊線仍有繪畫近似。

日間圖以兩個石屎座的估計地面中心校正：連線斜率 +0.5，鏡像為 −0.5；兩支柱的投影高度統一。夜間圖由校正版交予 imagegen 編修，只改燈光，再縮放回同一畫布；人工取點的對位殘差小於 3 px。這是可重用的材質初版，不保證日夜繪畫每一個像素都完全相同。

日間及夜間皆保留 alpha；夜間清除 alpha≤1 的底噪，保留透明光暈。亮燈 PNG 只包括燈泡及局部光暈，場景地面、食客及車仔的照明須在接入遊戲時另行處理。尚未接入遊戲，實際米制尺度與場景光照仍待配置。

- [日夜／雙斜向預覽](../../scripts/source-art/streetFood/lighting-v1/preview.png)
- [原稿及完整 prompts](../../scripts/source-art/streetFood/lighting-v1/README.md)
- [取點](../../scripts/source-art/streetFood/lighting-v1/calibration.json)
- [錨點、hash、對位檢查](../../data/street-food-lighting.json)

重建：`node scripts/prepare-street-food-lighting.js`；驗證：`node scripts/prepare-street-food-lighting.js --check`。
