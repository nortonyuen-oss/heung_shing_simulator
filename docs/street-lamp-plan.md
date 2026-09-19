# 路燈（電燈柱）自動佈置 設計計劃

狀態：**已實作**（2026-09-19）。實作備註（同計劃唔同之處）：
- 原圖 sheet 搬到 `scripts/source-art/lightPost_sheet.png`。四格嘅臂向其實係：**上排臂向下傾＝指向鏡頭（左上 SW、右上 SE），下排臂向上＝背向鏡頭（左下 NW、右下 NE）**（等軸投影下水平臂指向鏡頭會喺螢幕上向下）。第一版當咗上排係 NW/NE，燈臂錯咗 90°，已改正。
- `scripts/bake-street-lamp-textures.js` 生成 `Models/traffic/lightPost/lightPost_{SW,SE,NW,NE}.png` 同 `__lit` 版（960×880 畫布、柱腳 (480,600) 自動偵測）；夜間係高壓鈉燈橙色（鏡片 #ffd696、光暈 #ffa848、光池 #ff9c3c），光錐／光池要夠強先透得過夜色 overlay（cone 0.42、pool 0.6）。
- 夜間換圖係全城一齊（`streetLampsLit` 狀態一變就全部 setTexture 一次，一日兩次），唔係逐支視窗內換——否則日間望到啲仲著緊嘅燈；畫面外嘅燈由視窗剔除隱藏。
- 實測旺角：1 473 支（直路 1 405、彎 68），同一畫面 A/B 幀率差異喺噪音內（20.2 vs 20.3 fps）。
- 同一時間改咗：建築燈光預設永遠用 baked 貼圖，冇 baked 嘅建築夜晚係暗嘅；只有 test mode 嘅「使用 Phaser 光源」先開返 live glow（`setLiveBuildingLightsEnabled`）。
- 靠近鏡頭嗰邊行人路（e／s 邊）嘅燈柱會被相鄰高樓遮住（同交通燈、巴士站一樣嘅深度慣例），視覺上密集區似單邊排列。
- 2026-09-20：橋面（`road_bridge_*`）、橋斜道／山坡（`road_hill_*`、`road_hill2_*`）都當直路放燈，燈柱腳用車輛嘅路面模型（`getTrafficRoadSurface`）沿軸插值升高——橋面 +15px、斜道由低端到高端漸升（`streetLampSurfaceLift`）。顏色再調成高壓鈉燈橙（鏡片 #ffd68c、光暈 #ff9e30、光池 #ec8226）。
- 「點解遊戲入面仲係黃色」：release pipeline 用 sharp 0.34 把 raw RGBA buffer 傳來傳去，resize 之後嘅 `info.premultiplied` 係 `true`（bytes 其實係 straight alpha），再當 raw input 餵返入去就會被多 unpremultiply 一次——所有半透明像素變白變亮（光池 (235,130,38) 變成 (255,224,65)，建築 AA 邊緣亦變亮）。修正：`prepare-release-assets.js`／`verify-release-assets.js`／`bake-night-textures.js` 每個 raw input 都聲明 `premultiplied: false`，SETTINGS_VERSION 6 全部重新編碼；`test/asset-pipeline-alpha.test.js` 守住。

原計劃如下。素材：`lightPost_sheet.png`（1254×1254 一張 2×2 sheet）。一格 = 20 m。

目標：路燈由路網自動生成（同交通燈一樣唔存檔、唔使玩家放），密度同排列跟香港路政署嘅街燈設計，夜晚會亮，開關跟 View 選單「建築燈光」，而且對效能幾乎零負擔。

## 1. 香港街燈設計（依據）

路政署《公共照明設計手冊》嘅慣例：
- **燈柱高度**：地區／街道 8 m 或 10 m；主幹道 12 m；快速公路 15 m。
- **間距**：約 3–3.5 倍柱高——8–10 m 柱即 **25–35 m**。
- **排列**：
  - **交錯排列（staggered）**：兩邊輪流，最常見於雙線雙程街道（旺角、深水埗嘅內街）；「間距」指相鄰兩支（分屬兩邊）嘅距離。
  - **單邊排列**：窄街或單程路。
  - **對稱／中央雙臂**：闊路、雙程分隔道路——遊戲只有一種路，唔適用。
- **彎位**：燈柱放喺彎嘅**外側**，照亮彎道。
- **路口**：路口本身係衝突區，會加燈；但遊戲嘅 T／十字路口已有交通燈柱，唔再加。

## 2. 佈置規則（地圖座標；同交通燈一樣用 `getRoadKey` 推導）

### 2.1 直路：30 m 交錯排列

一格 20 m 做唔到 30 m 整數間距，但燈柱喺格內嘅**沿路位置可以偏移**：

| 沿路座標 k（直路 v 用 row，直路 h 用 col）| 邊 | 格內沿路偏移 |
|---|---|---|
| k mod 3 = 0 | A 邊 | −0.25 格（後移 5 m） |
| k mod 3 = 1 | B 邊 | +0.25 格（前移 5 m） |
| k mod 3 = 2 | — | 冇燈 |

相鄰兩支距離 = 1.5 格 = **30 m**，同一邊 60 m——正正係香港 10 m 燈柱嘅標準交錯排列。每 3 格 2 支。
- 「A／B 邊」：`road_straight_v`（連 n、s）嘅兩邊係 e（螢幕 SE）同 w（NW）；`road_straight_h` 嘅係 n（NE）同 s（SW）。
- 燈柱企喺行人路，橫向離格中心 0.42 格（同交通燈嘅 `TRAFFIC_SIGNAL_LOGICAL_INSET.left`）。
- 可切換嘅備選：`period 2`（每格一支、兩邊輪流、相鄰 20 m）——更密、更「旺角」，數量多 50%。

### 2.2 彎路：外側一支

`road_corner_*` 每格一支，放喺彎嘅**外側角**（兩條連接臂嘅相反方向），離中心約 0.38 格（對角）。燈臂指向路面。

### 2.3 唔放燈嘅格

- T／十字路口（已有交通燈）、路尾、孤立路格；
- 橋、斜路（有自己嘅美術）；
- 交通燈前一格（approach tile）：燈仍然可以有，但如果規則落喺**靠近路口嗰半格、而且同交通燈同一邊**，就改放去遠離路口嗰半格（−0.25 ↔ +0.25 對調），避免兩支柱疊埋。

### 2.4 燈臂方向（螢幕空間）

燈臂永遠伸出馬路。邊嘅方向經 `rotateDirection` 轉成螢幕方向，再揀相反嘅臂：

| 燈柱所在邊（螢幕） | 用邊張圖 |
|---|---|
| NE 邊 | 臂指 SW（左下） |
| SE 邊 | 臂指 NW（左上） |
| SW 邊 | 臂指 NE（右上） |
| NW 邊 | 臂指 SE（右下） |

彎位外側係對角（例如 W），臂指向兩條連接臂之一（固定揀第一條），保證伸向路面。地圖旋轉後自動換圖，同交通燈一樣。

### 2.5 大小

香港 10 m 燈柱 vs 交通燈約 5–6 m（現時 20 px 高）→ 燈柱約 **40 px**（zoom 1），即 scale ≈ 0.07（原圖柱高約 560 px）。初值 0.07，用校準器微調。

## 3. 夜晚亮燈：烘焙夜間貼圖，零額外 sprite

同交通燈狀態貼圖一樣做法，但更簡單：每個方向兩張——`day` 同 `night`。`night` 由 script（`scripts/bake-street-lamp-night.js`）由日間圖生成：
- 燈頭鏡片提亮成暖白（約 #ffe2a8），加光暈；
- 由燈頭向下一個柔和、半透明嘅光錐；
- 柱腳附近路面一個橢圓光池（畫入貼圖下方透明位，超出柱腳）。
夜晚就係一次 `setTexture`；冇 additive sprite、冇 pool。光池同柱同一個深度，車經過時會壓住／被壓住，可以接受。

亮燈時機：跟車燈同一條夜／惡劣天氣曲線（`scene.trafficLightStrength`），強度 ≥ 0.35 亮、≤ 0.25 熄（有遲滯，唔會喺黃昏閃來閃去）；View 選單「建築燈光」關咗、或 attract 模式減燈 → 全部日間圖。換圖同交通燈共用嗰個 100 ms、只掃視窗內嘅 pass。

另外：而家 `building-lighting.js` 每座建築門口有一粒「街燈」光暈（未校準建築就係嗰啲白色圓圈）。有真燈柱之後可以考慮調細或者取消——留待你睇效果再決定。

## 4. 效能預算

旺角（最大城市）：直路 2104 格、彎 68、T 192、十字 24、橋 21。

| 項目 | 30 m 交錯（建議） | 20 m 交錯 |
|---|---|---|
| 燈柱數 | ≈ 1 470 | ≈ 2 170 |
| 貼圖 | 4 日 + 4 夜，≤256 px（`traffic/lightPost/` 加入細道具規則），約 1 MB GPU | 同左 |
| 每幀 | 0（靜態 Image；夜晚換圖 100 ms 一次、只限視窗內） | 同左 |
| 視窗剔除 | 加入 `updateSpriteViewportCulling`（同巴士站、交通燈同一個 Map 剔除機制），畫面外 `setVisible(false)` | 同左 |
| 重建 | 路網改動時同交通燈共用一次 debounce 重建（diff，只加減有變嘅燈） | 同左 |

比較：旺角而家樹 1 208、交通燈 634、建築 sprite 數千；display list 4 839 個 child。加 1 470 個靜態、大部分時間 invisible 嘅 Image，預期幀時間影響 < 0.2 ms（主要係 depth sort 同 culling 掃描）。

## 5. 校準器：改成通用「街道道具校準器」

交通燈校準器（`traffic-signal-calibrator.js`）嘅邏輯——按朝向拖曳、方向鍵微調、縮放、複製 JSON——燈柱一樣需要。計劃抽成 `street-prop-calibrator.js`：`createStreetPropCalibrator({ id, title, facings, labels, sprites(), shippedOffsets, shippedScale, refresh })`，交通燈同路燈各自實例化，performance panel 多一個掣「路燈位置微調」。輸出貼入 `constants.js` 嘅 `STREET_LAMP_ANCHOR_OFFSETS` / `STREET_LAMP_SCALE`。

## 6. 實作步驟

1. `scripts/bake-street-lamp-night.js`：切 sheet 成 4 張（自動偵測柱腳：最底一行不透明像素嘅中心），生成 `Models/traffic/lightPost/lightPost_{NW,NE,SW,NE}.png` 同 `__night` 版本，印出柱腳同燈頭座標；出 preview 俾你過目。
2. `street-lamps.js`：`computeStreetLampPlacements({ mapWidth, mapHeight, roadKeyAt, signalPlacements })` 純函數（規則 2.1–2.3）、`streetLampFacing`、sprite 重建／定位、夜間換圖；`constants.js` 加 `STREET_LAMP_*`。
3. 接線：`refreshTileArea` / `refreshAllTiles` / `positionAllTiles` / 視窗剔除 / preload / `index.html`。
4. `street-prop-calibrator.js` 重構 + 「路燈位置微調」掣。
5. 測試：佈置規則（30 m 交錯、彎外側、路口／橋／approach 迴避）、朝向與旋轉、夜間遲滯、貼圖存在、接線。
6. 旺角實測：數量、截圖（日／夜）、幀率 A/B。

## 7. 想你拍板

1. 密度：**30 m 交錯**（香港標準，旺角約 1 470 支）定 20 m（約 2 170 支）？
2. 夜晚：烘焙夜間貼圖（燈頭光暈 + 光錐 + 路面光池）可以嗎？光池要唔要？
3. 校準器抽成通用版（交通燈同路燈共用）OK？
