# 端午素材校正（2026-10-11）

此目錄係校正版；原圖保留喺 `../original/DragonBoat/`。

已處理六色龍舟各自嘅 NW／SW 視角，共 12 張，以及觀眾看台、兩款頒獎台同大會台。
全部輸出係透明 RGBA PNG，畫布長寬各自為 2 嘅次方，物件底部置中並保留邊界。
龍舟全部為 **2048 × 1024**；看台、大會台及頒獎台 2 為 **1024 × 2048**，頒獎台 1 為 **2048 × 2048**。
畫布留白唔會拉伸物件；現有工具遇到內容略大過較細畫布時，會先做等比縮小。

## 參照同方法

取點記錄：`../dragon-boat-measurements.json`（原圖像素座標）。
重建參數：`../isometric-correction.json` 嘅 `DragonBoat/` entries。

龍舟用船身中段船舷同橫向座板；看台同頒獎台用平台、欄杆及台面直邊。
唔用翹起嘅龍頭尾、斜槳、波浪、棚頂布料下垂或樓梯斜面。
原圖有船舷弧度及局部繪畫偏差，所以此校正對齊選定嘅結構基準，唔會拉直所有曲線。

先垂直 skew 平衡兩個地面軸，再縮放 Y 至斜率 ±0.5（2:1）。
工具將兩步合併成一次取樣，保留垂直線方向，避免多次取樣模糊：

```text
d = 1 / (down + up)
c = (up - down) / (2 * (down + up))
X = x
Y = d*y + c*(x - cx)
```

其中 `down` 係向右下嘅正斜率，`up` 係向右上斜率嘅絕對值。
等同先 skew `k = (up - down) / 2`，再做 Y 縮放 `d`。

| 場地素材 | 原 down | 原 up | 校正後 |
|---|---:|---:|---|
| viewersStage | 0.444 | 0.373 | ±0.5 |
| championStand1 | 0.284 | 0.701 | ±0.5 |
| championStand2 | 0.371 | 0.584 | ±0.5 |
| ceremonyStage | 0.628 | 0.317 | ±0.5 |

## 重建

喺專案根目錄執行（使用現有避風塘校正工具）：

```sh
.venv/bin/python -B scripts/source-art/typhoonShelter/tools/correct.py \
  scripts/source-art/festivals/isometric-correction.json \
  scripts/source-art/festivals/original \
  scripts/source-art/festivals \
  DragonBoat/blackDragonNW.png DragonBoat/blackDragonSW.png \
  DragonBoat/blueDragonNW.png DragonBoat/blueDragonSW.png \
  DragonBoat/greenDragonNW.png DragonBoat/greenDragonSW.png \
  DragonBoat/purpleDragonNW.png DragonBoat/purpleDragonSW.png \
  DragonBoat/redDragonNW.png DragonBoat/redDragonSW.png \
  DragonBoat/yellowDragonNW.png DragonBoat/yellowDragonSW.png \
  DragonBoat/viewersStage.png DragonBoat/championStand1.png \
  DragonBoat/championStand2.png DragonBoat/ceremonyStage.png
```

前後對照圖：`../previews/dragon-boats-before-after.webp`、`../previews/dragon-boat-stages-before-after.webp`。
已註冊至 `festival-assets.js` 並接入 `festival-dragon-boat.js`；遊戲素材由 bake 產生鏡像及 power-of-two 材質。水線／台面結構量度記錄見 `data/dragon-boat-geometry.json`，以每格 20 米縮放。

重建定位及獨立浮標：`.venv/bin/python -B scripts/prepare-dragon-boat-assets.py`；重建遊戲素材：`npm run bake:festivals`；更新安裝包素材：`npm run prepare:release-assets`。

## 觀眾來源圖命名

以下四張新人物圖按既有英文 camelCase 檔名方式統一，`spectators` 表示觀賽市民，`Back`／`Front` 表示主要側後方／側前方視角，數字表示款式。呢個視角標記唔係地圖 NW／SW，亦唔代表水平鏡像。

| 新檔名 | 原檔名 |
| --- | --- |
| `spectatorsBack1.png` | `熱情應援人群3D剪影.png` |
| `spectatorsFront1.png` | `熱情歡呼的七人家庭觀眾群.png` |
| `spectatorsBack2.png` | `ChatGPT 圖像 2026年10月11日 下午03_25_50-1.png` |
| `spectatorsFront2.png` | `ChatGPT 圖像 2026年10月11日 下午03_25_51-2.png` |

四張原始人物圖已保留喺 `../original/DragonBoat/`。`node scripts/prepare-dragon-boat-crowds.js` 清理 alpha ≤ 20 嘅淡影殘留，等比縮放並放入 1024 × 1024 透明畫布；唔扭曲人物。成人頭頂至腳底取點及七人腳底中心記錄喺 `data/dragon-boat-crowd-geometry.json`，設計成人身高為 1.7 米。人物圖冇可靠矩形地面基準，保留原圖投影，未聲稱嚴格兩軸校正。

遊戲貼圖係四款各有 `_m` 鏡像，共八張 512 × 512，由既有 festival bake 流程產生。重新 bake：`node scripts/bake-festival-textures.js --only dbspectatorsBack1,dbspectatorsFront1,dbspectatorsBack2,dbspectatorsFront2`。鏡像保留腳底 anchor，同一套尺寸參考，按岸線朝海方向揀側前／側後視角。
