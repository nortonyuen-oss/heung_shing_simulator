# 香港排檔雙柱燈串

使用內建 imagegen（非 CLI）生成一組雙柱燈串，再以校正版作為夜間編修目標。兩支帶石屎座的舊鐵柱、微垂電線、八粒暖白裸燈泡。原始生成 PNG 均保留。

- 日間原稿：`string-lights-day-source.png`
- 日間完整 prompt：[day-prompt.md](day-prompt.md)
- 夜間原稿：`string-lights-night-source.png`
- 夜間完整 prompt：[night-prompt.md](night-prompt.md)
- 校準與對位取點：[calibration.json](calibration.json)
- [四件成品與使用限制](../../../../Models/streetFoodLighting/README.md)
- [並排預覽](preview.png)

日間原稿未遵守指定斜向且兩支柱的投影高度不一。以柱頂及兩個石屎座地面中心建立逐欄垂直映射，校正柱腳連線為 +0.5，同時統一柱高，保留垂直線；另一斜向鏡像為 −0.5。小石屎座的兩向邊線未作完整三維重建。夜間編修保留主結構，工具輸出縮小至 1398×1125，整理時還原至日間 1854×1492；人工觀測的錨點對位誤差須小於 3 px。

這是遊戲美術演繹，不宣稱所有歷史排檔都使用獨立雙柱燈架。裸燈泡沿線懸掛參考上一輪核對的[大笪地照片](https://www.ourchinastory.com/images/content/hong-kong/2022/11/HollywoodRoadTatTaiDa3_x4.jpg)，照片並未複製到成品或下載包。

重建腳本：`scripts/prepare-street-food-lighting.js`。幾何及原圖完整性：`node scripts/prepare-street-food-lighting.js --check`。未接入 runtime，圖片上的光暈不會自動照亮遊戲場景。
