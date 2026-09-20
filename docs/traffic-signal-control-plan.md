# 路口交通燈：亮燈循環同控制車流 設計計劃

狀態：**已實作**（2026-09-19）。實作備註（同計劃唔同之處）：
- 巴士／雪糕車延伸：營運巴士實際行車進度同雪糕車入場、行路及離場都接入共用燈號查詢；營運巴士改用道路車流嘅速度倍率及步進，停燈時里程、到站及上落客亦同步停止。維修同乘客需求仍跟環境時鐘；路線班距為未計燈號嘅名義估算。
- 燈號查詢、路口登記（`scene.trafficSignalJunctions`）、時鐘同貼圖更新全部喺 `traffic-signals.js`；車輛停燈同跨腿排隊喺 `traffic-visuals.js`（`getTrafficSignalHoldProgress`、`buildTrafficLegBuckets.byTile`）。
- 狀態貼圖由 `scripts/bake-traffic-signal-states.js` 生成到 `Models/trafficLight/`（14 張），源圖搬到 `scripts/source-art/`；release pipeline 對 `trafficLight/` 上限 256px。2026-09-20 起輸出直接係 **256×256** 畫布（2 的次方先有 Phaser mipmap，dev 直接載 PNG 都唔會鋸齒）、柱腳 (128,256)；`TRAFFIC_SIGNAL_SCALE` 由 0.034 換算成 0.0797，`TRAFFIC_SIGNAL_LAMP_ANCHORS` 同 glow scale 亦按 256/600 換算。
- 綠公仔閃爍由「熄」開始（實心綠 → 熄 → 綠 …），最後一下係綠，之後對面轉黃就變紅公仔。
- 實測（旺角，216 個路口、634 支燈柱，dev 用 staged 貼圖）：燈號同貼圖對應正確；紅燈車停喺 progress 0.34、紅黃仍停、綠燈起步；同一畫面 A/B（燈號開／關）幀率差異喺量度噪音以內（20.6 vs 21.2 fps）。
- `scripts/drive-electron.js` 多咗 `bringToFront()`：視窗被遮住時 Phaser 會暫停 loop，截圖同量度前要先叫佢。
- 停車線（2026-09-19 改）：車輛錨點喺 approach leg progress 0.10（路口邊緣係 0.5，即路口前 8 m）；長車再後移——`trafficSignalStopProgressFor(headwayFactor)`：私家車 0.10、小巴約 0.06、巴士 0.02（approach 格中心），冇講明長度嘅（路線巴士、雪糕車）當巴士長度。
- 夜晚光暈（2026-09-19 加）：每支視窗內燈柱嘅著燈鏡片上加一粒 additive 小光暈（`TRAFFIC_SIGNAL_LAMP_ANCHORS`，由 bake script 印出鏡片中心），用一個共用 sprite pool 每次 visual pass 重新分配，pool 大細 = 畫面上著燈鏡片數。強度跟車燈嘅 `scene.trafficLightStrength`（夜／惡劣天氣），並跟 View 選單「建築燈光」開關同 attract 模式減燈一齊關閉。

原計劃如下。前置工作已完成：`traffic-signals.js` 由路網自動喺每個 T／十字路口前一格、司機左邊放一支燈柱（4 個朝向貼圖，`Models/trafficLight/`），位置同大小已用 test-mode 校準器定案（`constants.js` 嘅 `TRAFFIC_SIGNAL_*`）。

目標：燈柱要**真係亮燈**（紅／紅黃／綠／黃，行人紅公仔／綠公仔／閃綠），T 字同十字路口用唔同循環，而且**車流要聽燈**——紅燈喺停車線停低、排隊，綠燈先過。以香港路口燈號設計為藍本，但用最少遊戲資源做到。

## 1. 原則

1. **冇任何逐路口嘅狀態或計時器。** 全城共用一個「交通視覺時鐘」，每個路口嘅燈號係 `(時鐘 + 該路口固定偏移) mod 週期` 嘅純函數。查一次燈號係幾十個算術運算，唔使 update、唔使 tween、唔使 timer，畫面外嘅路口零成本。
2. **只換貼圖，唔加 sprite。** 每支燈柱仍然係一個 `Image`；亮燈狀態靠 `setTexture` 換一張預先烘焙嘅貼圖。冇額外燈泡 sprite、冇 blend mode、冇 particle。
3. **只影響視覺車流，唔改模擬。** 現有嘅車係「ambient traffic」（`traffic-visuals.js`，視窗內最多 44 架，冇經濟作用）。燈號控制佢哋幾時停、幾時行；城市模擬嘅交通負荷／擠塞數值完全唔變。
4. **同現有節奏一致。** 車同燈都跟 `getVehicleVisualSpeedMultiplier()`：暫停就全部凍結，快速就一齊加快；`SLOW` 都會保持 1×（同車一樣）。
5. **唔存檔。** 燈柱本身已經係由路網推導；燈號亦係時鐘推導。存檔格式零改動。

## 2. 現況（要接嘅位）

- 車行「腿」（leg）：`vehicle.current → vehicle.next`，`progress` 0 = 喺 current 格中心（帶車道偏移）、1 = 喺 next 格中心；格邊界大約喺 0.5。到達 next 先揀下一格（`chooseNextTrafficTile`，直行 0.65、左右轉各 0.175、唔會掉頭）。
- 排隊：只會同一條腿上嘅前車比較（`buildTrafficLegBuckets`／`trafficVehicleHasBlockingLeader`，車距 `minimumHeadwayTiles` 0.65）。巴士站停站係凍結喺 progress 1。
- 燈柱：`computeTrafficSignalPlacements` 每個 placement 都有 `{row, col, travel, junctionRow, junctionCol}`；`travel` 就係該腿由前一格駛入路口嘅方向，所以「呢架車受邊支燈管」= `vehicle.next` 係路口、`vehicle.current → vehicle.next` 嘅方向就係 `travel`。
- 貼圖：4 張 320×600 源圖，燈頭**全部燈都著晒**（紅黃綠、紅公仔綠公仔一齊亮）。從鏡頭睇：
  - `SW`：車燈頭正面（紅黃綠可見）＋行人燈正面（紅／綠公仔可見）
  - `SE`：車燈頭正面可見；行人燈係背面
  - `NW`：車燈頭係背面；行人燈正面可見
  - `NE`：全部背面，乜燈都睇唔到
  即係只有 SW、SE、NW 需要狀態貼圖；NE 永遠一張靜態圖。
- release pipeline（`scripts/prepare-release-assets.js`）逐張圖 resize／alpha-trim／pad，`getPropTextureAnchor` 已經識得將源圖腳點對返每張 trim 後嘅貼圖，所以換貼圖只需要重設 origin（現有 `positionTrafficSignalSprite` 已經係咁做）。

## 3. 燈號循環（香港式）

車輛燈序：**紅 → 紅＋黃 → 綠 → 黃 → 紅**（英式／香港式，有紅黃）。行人燈：**紅公仔 → 綠公仔 → 閃綠公仔 → 紅公仔**。

### 3.1 相位分組

- **十字路口**（`road_cross`）：兩組——`{n, s}` 同 `{e, w}`（螢幕上即係 NE–SW 向同 SE–NW 向）。
- **T 字路口**（`road_t_*`）：兩組——**直路**（兩條對開嘅臂）同**支路**（單獨一條臂）。例：`road_t_n` 有 n/e/w 臂 → 直路 `{e, w}`，支路 `{n}`。

冇轉向箭嘴／獨立右轉相位：而家嘅車係到達路口先決定轉向，做唔到「等右轉」；兩相位已經係香港細路口最常見嘅設計。

### 3.2 時間（視覺秒，速度 1×；全部放 `constants.js` 可調）

| 段落 | 十字 | T 字直路 | T 字支路 |
|---|---|---|---|
| 紅＋黃 | 2 | 2 | 2 |
| 綠 | 8 | 10 | 5 |
| 黃 | 3 | 3 | 3 |
| 全紅（intergreen） | 2 | 2 | 2 |

- 十字週期 = 2 × (2+8+3+2) = **30 秒**；T 字 = (2+10+3+2) + (2+5+3+2) = **29 秒**。
- 車過一格約 1.1 秒（`baseSpeedTilesPerSecond` 0.9），8 秒綠燈每條車道可以放 5–6 架車，睇落似真但唔會等到悶。真實香港 90–120 秒週期太長，遊戲入面唔啱用。
- 每個路口固定偏移：`(row × 7 + col × 11) × 1.3 秒 mod 週期`。沿同一條直路嘅相鄰路口偏移逐格遞增，自然形成類似「綠波」嘅效果，又保證全城唔會同一時間齊齊轉燈。（如果唔想要綠波，改成 hash 就得。）

### 3.3 行人燈

一支燈柱上嘅行人燈永遠同該燈柱嘅車燈相反：車燈紅（而對面組正綠燈）→ 綠公仔；對面組綠燈最後 3 秒 → 綠公仔 2 Hz 閃；其他時候（黃、全紅、紅黃、本組綠）→ 紅公仔。意思係「車停晒，人就過馬路」，同香港路口畫面一致。（遊戲冇行人 sprite，呢個純粹係視覺。）

### 3.4 狀態貼圖（烘焙）

由 4 張源圖用 `scripts/bake-traffic-signal-states.js`（sharp）生成，checked in 到 `Models/trafficLight/`，同其他 Models 一樣行 release pipeline：

| 朝向 | 需要嘅狀態 | 張數 |
|---|---|---|
| SW | 紅＋綠公仔、紅＋閃熄、紅＋紅公仔、紅黃＋紅公仔、綠＋紅公仔、黃＋紅公仔 | 6 |
| SE | 紅、紅黃、綠、黃 | 4 |
| NW | 紅公仔、綠公仔、閃熄 | 3 |
| NE | 靜態（背面） | 1 |

合共 14 張。「熄」嘅燈係由源圖偵測燈膽區域（色相：紅／琥珀／綠，高飽和），連光暈一齊調暗去飽和，變成未亮嘅深色鏡片；著嘅燈保留原圖。`prepare-release-assets.js` 加一條規則：`trafficLight/` 上限 256px（螢幕上最大都係 60px 左右），14 張合共 GPU 記憶體約 2 MB。

**先出 preview 俾你過目**先接落去；如果 script 效果唔理想，你可以自己出圖，命名跟同一套。

## 4. 車流控制

### 4.1 停車線

- 燈柱喺前一格中心向路口 0.40 格；停車線定喺腿嘅 `progress = 0.34`（車頭啱啱到燈柱前，`TRAFFIC_SIGNAL_STOP_PROGRESS`）。
- 每幀每架車：如果 `vehicle.next` 係有燈嘅路口（`scene.trafficSignalJunctions` Map 一次 lookup），計該臂嘅燈號：
  - **紅／紅黃**：`progress` 未過停車線 → 前進上限係停車線（停低）；已過停車線 → 照行（已入路口）。
  - **黃**：距離停車線仲有 ≥ 0.15 格 → 停；否則衝過去（同真人一樣）。
  - **綠**：照行。
- 車已經喺路口格（`vehicle.current` 係路口）永遠唔停，所以唔會塞死路口。
- 唔會有 gridlock：ambient 車離開視窗即消失、冇對頭優先權判斷。

### 4.2 排隊（跨腿）

而家只會同同一條腿嘅前車比較，紅燈排隊時第二架車喺 0.34 − 0.65 < 0，即係已經喺上一格嘅腿，唔會被擋。加一個由 `current` 格索引嘅 Map（同 `buildTrafficLegBuckets` 同一次 loop 建），車亦會睇「前面嗰格入面、由我嘅 next 出發」嘅車：距離 = `(1 − 我嘅 progress) + 前車 progress`，細過車距就停。成本 O(車數)，同時順便修正巴士站停站時同一問題。

### 4.3 例外

- **巴士公司路線巴士**（`transport-visuals.js`）位置由 `transport-expansion.js` 嘅時間表模擬推動，視覺層只係投影；第一期**唔停燈**，避免視覺同後台脫節跳位。日後可以喺後台模擬加「燈前等待」。
- **雪糕車事件**：唔停燈（佢有自己嘅泊車動畫）。
- 生成車輛時如果落喺紅燈腿停車線之後，照舊（機會細，而且只係一架車出現喺路口口）。

## 5. 效能預算

| 項目 | 成本 |
|---|---|
| 燈號查詢 | 純函數，~20 個算術運算；冇狀態 |
| 燈柱貼圖更新 | 每 100 ms 一次，只掃視窗內（`getTrafficCameraRect` 內）嘅燈柱；狀態冇變唔 touch。閃綠公仔亦係 100 ms 粒度 |
| 車輛 | 每架車每幀多一次 Map lookup ＋ 一次燈號查詢（只限 next 係路口嘅車）；跨腿排隊多一個 Map，O(車數) |
| 貼圖 | 14 張 ≤256×512，約 2 MB GPU；preload 多 10 張細圖 |
| 重建 | `rebuildTrafficSignalSprites` 順便建 `trafficSignalJunctions` Map（已經有 placements，零額外掃描） |
| 存檔／模擬 | 零改動 |

預期幀時間影響 < 0.1 ms。

## 6. 實作步驟

1. `scripts/bake-traffic-signal-states.js` → 生成 14 張狀態圖 ＋ preview 拼圖；你批准後 check in。`prepare-release-assets.js` 加 `trafficLight/` 256px 規則。
2. `traffic-signals.js`：`TRAFFIC_SIGNAL_TIMING` 常數、`getTrafficSignalPhase(junction, arm, clockMs)` 純函數（車燈＋行人燈）、`scene.trafficSignalJunctions`、`updateTrafficSignalVisuals(scene, time, delta)`（時鐘累積 ＋ 視窗內換貼圖）；`main.js` `update()` 接線。
3. `traffic-visuals.js`：停車線判斷 ＋ 跨腿排隊。
4. 校準器：狀態貼圖 origin 由 `getPropTextureAnchor` 逐張處理，校準器唔使改；加一個「凍結燈號」toggle 方便校對貼圖（可選）。
5. 測試：相位時間表（十字／T 字每個時刻嘅車燈＋行人燈）、停車決定（紅／黃／綠 × progress）、跨腿排隊、狀態圖存在、接線檢查。
6. 用 `scripts/drive-electron.js` 載入旺角截圖：紅燈前排隊、綠燈放行、行人燈相反；量度 fps 同未加燈前比較。

## 7. 未做／日後

- ~~夜晚燈膽光暈~~（已做，見上）；
- 巴士公司巴士停燈（要改後台模擬）；
- 燈號影響經濟模擬（例如路口通行能力）——而家嘅交通模擬係以負荷為本，冇路口概念，屬另一個設計題目。
