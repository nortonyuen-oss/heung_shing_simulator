# 海底隧道雙管道出入口 v1

按現有 `newRoadTiles/roadNS_fixed.png`、`roadEW_fixed.png` 兩個直路方向製作。
每個出入口由**兩條並行直路**接入**兩個獨立洞口**，中央有混凝土分隔，
外側有擋土牆，洞內有暖色燈。保留灰色路面、白色虛線及黃色邊線的設計。
每條直路沿用兩車道配置，因此一個出入口共四車道；兩個管道可供日後分配一入一出。

| 素材 | 道路方向（畫面） | 洞口朝向（畫面） | 用地（列×欄） |
| --- | --- | --- | --- |
| [tunnel_NS_v1.png](tunnel_NS_v1.png) | 左上 ↔ 右下 | 右下 | 2×3 |
| [tunnel_EW_v1.png](tunnel_EW_v1.png) | 右上 ↔ 左下 | 左下 | 3×2 |
| [tunnel_NS_rear_v1.png](tunnel_NS_rear_v1.png) | 左上 ↔ 右下 | 左上（背向鏡頭） | 2×3 |
| [tunnel_EW_rear_v1.png](tunnel_EW_rear_v1.png) | 右上 ↔ 左下 | 右上（背向鏡頭） | 3×2 |

四款都是 **1200×800 透明 PNG**，用地為兩格闊、三格長，包含引道和有蓋洞口。
NS／EW 沿用原道路檔名；並非遊戲地圖旋轉後的固定地理方向。
目前完成美術素材，**尚未加入建造選單、海底路線或車流功能**。

[四方向正面／背面同尺對照](../../scripts/source-art/underseaTunnel/rear-v1/four-views.png)
／[背面生成原稿與完整 prompts](../../scripts/source-art/underseaTunnel/rear-v1/README.md)
／[背面配準及量度結果](../../data/undersea-tunnel-rear-assets.json)。

[現有道路與新隧道同尺對照](../../scripts/source-art/underseaTunnel/v1/comparison.png)
／[生成原稿及完整 prompts](../../scripts/source-art/underseaTunnel/v1/README.md)
／[尺寸、錨點、hash 及量度結果](../../data/undersea-tunnel-assets.json)。

## 投影及接駁資料

內建 imagegen 以現有道路作參考重繪；生成圖再依地台三個底角作整體仿射配準，
把地台邊線校回 2:1 投影，並統一兩款用地尺寸。沒有鏡像翻轉另一款代替生成，
也沒有更改原有道路素材。圖中的路面與建築細節是重繪美術，並非原道路像素的直接拼貼。

每格地面菱形 320×160 px，土層厚 48 px；在現有 100×50 遊戲格線中使用縮放 **0.3125**。
兩條地面軸向量為 `(160,80)`、`(-160,80)`。首格地面中心在 NS 素材是 `(480,200)`，
在 EW 素材是 `(660,200)`。完整座標見 JSON。

前方兩個道路端點的地面中心：

- NS：`(800,360)`、`(640,440)`，分別對應 `(col,row)=(2,0)`、`(2,1)`。
- EW：`(340,360)`、`(500,440)`，分別對應 `(col,row)=(0,2)`、`(1,2)`。

這些是地格接駁座標；日後接入遊戲仍需按重繪路面校準車道軌跡、洞口遮擋及下沉高度。
現時的檢查涵蓋地台外輪廓與透明安全邊，不代表每條虛線、牆邊都經獨立幾何校準。

重建及驗證：

```sh
node scripts/prepare-undersea-tunnel-assets.js
node scripts/prepare-undersea-tunnel-assets.js --check
node scripts/prepare-undersea-tunnel-rear-assets.js
node scripts/prepare-undersea-tunnel-rear-assets.js --check
```

檢查會重新量度成品 PNG 的兩條地台底邊（斜率應為 ±0.5），
檢查四邊至少 16 px 全透明，並比對成品、原稿和參考道路的 hash。
配準採用預乘 alpha 插值，保留生成透明度，將全透明像素 RGB 清零以免邊緣帶入背景色。

背面版本以對應正面素材為主要參考，另外生成反向模型；頂蓋和背殼在近處，
洞口朝遠處，因此原本洞口被有蓋結構遮住，兩條引道向遠方伸出。
背面地台三個底角對齊同軸正面的用地，並沿用相同縮放。
背面引道的道路接駁端改在 NS 的 `col=0`／EW 的 `row=0` 一端。
地台配準不代表所有內部道路高度及牆面已達到逐像素一致，接入遊戲時仍需校準。
