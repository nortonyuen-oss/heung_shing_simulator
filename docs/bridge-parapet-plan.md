# 行車天橋護欄 設計備註

狀態：**已實作**（2026-09-20）。素材：`scripts/source-art/bridgeA.png`（沿螢幕 NW–SE、見 SW 面）、`bridgeB.png`（沿 SW–NE、見 SE 面），由 `Models/roadAssessories/` 搬入。

## 放喺邊

- 每一格橋面（`deck:row` / `deck:col`）同橋斜道（`ramp:*`）嘅**兩條長邊**各一段護欄；橋以外冇。
- 同交通燈、路燈一樣由地圖（`bridgeMap`）推導，唔存檔；起橋／拆橋後嘅 `refreshTileArea` 會排一次重建（`scheduleBridgeParapetRefresh`），全城重畫（`refreshAllTiles`）直接重建。
- 邊係地圖方向（n/e/s/w），轉地圖後先化成螢幕邊：n→NE、e→SE、s→SW、w→NW。NE／SW 邊用 NW–SE 軸嘅圖（`parapet_h`），SE／NW 邊用 SW–NE 軸嘅圖（`parapet_v`）。

## 貼圖（`scripts/bake-bridge-parapet-textures.js`）

原圖一段大約就係一格邊咁長，但高度係「20 m 長、4 m 高」，太厚重。烘焙時：
- 去走 AI 出圖嘅深色毛邊（alpha < 128 當透明）；
- 度出底線（最低實心像素，中間一半做最小二乘），確認係 2:1；
- **裁走兩端斜面**（延續落下一格嘅位置），沿底線拉長到 440 canvas px（= 一格邊 50 px 加每邊 1 px 重疊，scale 0.1136），高度壓成一半（`--height`，預設 0.5，約 1.3–1.5 m）；
- 斜道版本：保留斜道腳嗰一端嘅斜面（護欄喺度收尾），再沿垂直方向剪切 ±0.3（橋面升 15 px 攤喺 50 px 邊上），柱仍然垂直。
- 六張：`parapet_h`、`parapet_h_high_se`、`parapet_h_high_nw`、`parapet_v`、`parapet_v_high_ne`、`parapet_v_high_sw`，**512×512** 畫布（2 的次方——Phaser 只會為 power-of-two 貼圖起 mipmap，護欄由 440 px 縮到螢幕 50 px 冇 mipmap 就會鋸齒閃爍；release pipeline 本身會 pad 到 2 的次方，咁樣 dev 直接載 PNG 都一樣順），底線中點固定喺 (256, 280)（`BRIDGE_PARAPET_SOURCE_ANCHOR`），release pipeline 裁邊後由 `getPropTextureAnchor` 對返。`roadAssessories/` 已加入 `SMALL_PROP_PREFIXES`（stage 上限 256 px）。

## 定位同深度（`bridge-parapets.js`）

- 錨點 = 該邊中點，升高橋面高度（橋面 15 px、斜道中點 7.5 px，用車輛同路燈嘅 `getTrafficRoadSurface` 模型）。
- 深度：護欄係沿路一條長嘢，用邊中點一個 depth 會俾格兩端嘅燈柱／車穿過；所以遠邊（NW/NE）用**最遠嗰端**、近邊（SE/SW）用**最近嗰端**嘅 y − 升高做 depth（`bridgeParapetEdgeEnds`），格上所有燈柱同車都一定夾喺兩條護欄中間（斜道兩端都啱）。燈柱嘅 depth 亦同車一樣扣返路面升高。
- 夜晚同樹一樣跟地面色調變暗（`applyNightObjectTint`）；畫面外由視窗剔除隱藏。旺角：29 格橋 → 58 段。

## 校準（test mode）

效能面板「**天橋護欄位置微調**」= `street-prop-calibrator.js` 實例（`bridge-parapet-calibrator.js`）：拖任何一段記低該邊（NE/SE/SW/NW）嘅 dx/dy，方向鍵微調，`[` `]` 改 scale，「複製 JSON」貼入 `constants.js` 嘅 `BRIDGE_PARAPET_ANCHOR_OFFSETS` / `BRIDGE_PARAPET_SCALE`。注意 scale 同時改長度：離 0.1136（一格邊）太遠一段就唔夠一格邊長。2026-09-20 校準：scale 0.078（舊 650 px bake）→ 換算成 0.1152，offset ne (−6.6, 3.6)、se (−7.8, −2.5)、sw (5.1, −1.4)、nw (8.1, 2.9)。

## 未做

- 護欄高度（`--height`）同顏色純粹跟原圖，想矮啲／淡啲改參數重烘焙即可。
- 橋面兩端接落平路嗰格（斜道腳以外）冇護欄，同現實一樣。
