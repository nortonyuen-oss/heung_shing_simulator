# 香港屋邨籃球場 v2

目前版本為 `bc_estateFullCourt_v2.png`，由未變形原圖以單一整體仿射變換校正，保住直線及垂直線。地面前兩邊的實際斜率約 +0.5000／−0.5002。模型、PNG邊界及可重現輸出檢查已通過。

v2 已原位替換遊戲的 `Models/parks/park2x2/sportField3-02.png`；沿用 `sports_ground_2x2` 貼圖鍵及2×2佔格，現有城市的球場座標不變。舊圖備份在 `scripts/source-art/civic-asset-replacements/2026-10-18/originals/`。

v1 因局部非線性校正把鐵網橫樑、地磚及場線拉彎，已撤回；v1 PNG／ZIP只保留為歷史記錄，不應使用。原v1校正程式已停用，標準 `node scripts/prepare-basketball-court.js` 改為輸出v2。

精確設計草圖是2×2格、40×40米地盤及28×15米球場；生成原圖本身有少量比例及位置誤差。v2不扭曲原圖來強行匹配每個角落，因此不宣稱模型每個位置都精確達到草圖尺寸。詳見 `scripts/source-art/basketballCourt/v2/README.md` 及 `data/basketball-court-geometry-v2.json`。

以下為已撤回v1的歷史說明：

歷史模型：`bc_estateFullCourt_v1.png`，1600×1400 RGBA，透明底。

傳統紅綠硬地全場、深綠鐵網、入口、兩座籃架、四支照明燈、四張長凳、兩個樹池及垃圾桶。配合已接受的街市 v3 及現有學校模型的材質與色調。

地面投影軸為 ±0.5，即地盤菱形高:闊=1:2。球場設計28×15米，連四邊2米緩衝的淨地面32×19米。地盤左／前／右／後角像素為 (240,800)、(800,1080)、(1360,800)、(800,520)。繪圖基準與校正數據在 `data/basketball-court-geometry.json`。

這是遊戲用繪製式2D資產。地盤、球場外框與中線按格線校正；鐵網、燈柱、籃架及細小場線保留生成繪畫細節，並非施工圖。未接入遊戲運行邏輯。

原圖、完整提示詞、格線、佈局、建設草圖及流程預覽見 `scripts/source-art/basketballCourt/v1/`。
