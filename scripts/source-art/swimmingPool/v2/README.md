# 泳池 v2 投影修正

使用內建 image_gen，幾何參考為 ../v1/geometry-crop.png。第一次雙參考嘗試保存在 render-rejected.png，未接入遊戲；最終 render-source.png 僅使用幾何底稿重繪，完整指令見 prompt.md。

準備腳本：`node scripts/prepare-swimming-pool-v2.js`，驗證加 `--check`。對全圖作一次相同仿射映射，沒有局部網格扭曲；牆柱垂直線及原始直線均保持直線。垂直／水平校正倍率之比 0.96065，舊版為約 0.7936。量度外框及四條水面邊線，詳見 ../../../../data/swimming-pool-geometry-v2.json。生成的前池邊仍有小量角度誤差（+0.529），不宣稱每個像素均完全貼底稿。

成品：Models/swimmingPool/sp_simple3x3_v2.png；遊戲仍用 Models/parks/park3x3/swimmingPool3-01.png 及 park_large_pool，維持 3×3 佔地。
