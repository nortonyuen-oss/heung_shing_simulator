# 籃球場 v2：直線修正版

v1 的局部非線性校正造成鐵網橫樑、地磚及場線彎曲，已撤回。v1 的外框斜率檢查只驗證少數地面邊，不能證明整個模型保持方正。

v2 直接取自未變形原圖 `../v1/render-source.png`，使用單一整體仿射變換（縮放、斜切及平移）。所有原本的直線保持直線，所有原本的螢幕垂直線保持垂直。不使用局部網格、曲線插值或控制點拉扯。沒有重新生成美術。

2×2格、40×40米地盤、28×15米球場仍是精確草圖的設計尺寸；原始生成圖跟草圖有少量位置與比例差異，v2 不會強行扭曲它來匹配每一點。此版修正直線及地面前兩個軸方向，不宣稱每個角落與道具都已達到精確尺寸。

模型：`Models/basketballCourt/bc_estateFullCourt_v2.png`。參數、原圖雜湊、實際地面斜率及直線保持檢查：`data/basketball-court-geometry-v2.json`。

```sh
node scripts/prepare-basketball-court-v2.js
node scripts/prepare-basketball-court-v2.js --check
node scripts/preview-basketball-court.js
```

原圖由內建 image_gen 生成，原始提示詞保存於 `../v1/prompt.md`。原圖不變；本次只修正後處理方法。
