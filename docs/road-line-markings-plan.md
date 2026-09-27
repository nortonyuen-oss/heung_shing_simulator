# 馬路劃線（road-line markings）接駁計劃

狀態：**已接駁去 main.js 並用真實 Electron app 驗證過**（2026-09-27）。之前呢套系統（`road-line-markings.js`／`road-line-variants.js`／`road-line-calibrator.js`／`scripts/bake-road-line-textures.js`）已經寫好、bake 咗 16 張圖，但 `main.js` 完全冇call 過 `applyRoadLineTexture`——即係話一直得個ologic，畫面上冇任何效果。今次做咗：(1) 決定邏輯由「whole-map cache」改寫做「per-tile 純函數」，(2) 真正接駁去 main.js（preload + 每次重畫 tile 都call），(3) 加咗三條新規則，(4) 新增 4 張 arrow 貼圖。

## 1. 三條規則（用戶 2026-09-27 直接指示）

跟 `getRoadLineVariantAt(row, col, ctx)`（`road-line-variants.js`）裏面嘅優先次序：

1. **巴士站（最高優先，override 晒其他）**：呢格有巴士站，就用返巴士站個 marking，唔理呢格本身仲符唔符合第 2、3 條規則。
2. **路口前一格（2026-09-27 按用戶手繪圖更新，取代舊嘅單箭嘴）**：黃格仔路口（`road_cross`／`road_t_*`）四邊嘅直路：
   - 雙線（band 格）：只有**駛入**路口嗰邊行車帶用 `dualLaneStop{N,S,E,W}`（兩條同向行車線，直行／轉彎箭嘴）；駛離嗰邊保持純色，`shared` 中線都唔出。
   - 單線（一來一回）：`singleCrossStop{N,S,E,W}`（停車線同箭嘴喺靠左嗰半）。一格夾喺兩個路口中間就揀地圖 north/south（或 east/west）先出現嗰個。
   - 命名：N/S/E/W 係呢格喺路口嘅邊一邊（`StopN` 喺路口北面，箭嘴向南）。幾何用 map frame，揀貼圖用畫面 frame（同斑馬線一樣，見 4b）。
3. **單線道斑馬線**：一格單線（唔係 band）直路,如果**沿住條路方向**兩邊各 3 格都係純直路（同方向、非 band、冇巴士站、唔係路口前一格），而且嗰 3 格入面冇另一條斑馬線，就顯示斑馬線（見 4a）。

優先次序：巴士站 > 路口前一格 > 斑馬線。

## 2. 純函數,唔係 whole-map cache（吸取咗 carriageway band 嘅教訓）

第一版 `road-line-variants.js`（未接駁之前）係成個地圖預先計一個 `Map<"row:col", variantId>`,recompute 一次過。但 `getRoadCarriagewayBand` 本身可以取決於 12 格以外嘅路——同今次道路擴闊個 refresh-radius bug（`docs/road-widening-plan.md`）一模一樣嘅陷阱。所以改寫做同 `getRoadCarriagewayBand` 一致嘅設計：**純粹一個 `(row, col)` 嘅函數,淨係睇附近幾格,每次要用就即時計,冇嘢要 invalidate**。

## 3. 巴士站 → 邊個 variant（先決條件：raw side 唔係診斷角）

`busStopMap`/`getBusStopSides(row,col)` 存嘅係 raw 方位字母（'n'/'e'/'s'/'w'，等於嗰個方向嘅交通），**唔係**對角標籤。要攞返啱嘅 `busStopNE`/`busStopSW`（v）或者 `busStopNW`/`busStopSE`（h），要行 `getBusStopVisualCorner(rawSide)`（main.js，已經處理咗 `mapRotation`）攞返 `ur`/`ul`/`lr`/`ll`，先同「呢格而家渲染緊嘅方向」（`getTileKey`，一樣已經 rotation-aware）夾埋睇：v 用 ur/ll，h 用 ul/lr。兩個 corner 都有 → `busStopBoth2`/`busStopBoth1`。

**順便補咗一個漏洞**：`setBusStopSides`/`removeBusStopsAt`（tools.js 嘅 none→left→right→both→none 循環、transport-expansion.js 嘅自動配對）本身淨係 refresh 巴士站自己個 sprite，從來冇叫路面果格重畫過——即係話擺咗巴士站,馬路劃線都唔會即時出現,要等第二次無關嘅重畫先會岩巧顯示。已經喺 `refreshBusStopSpriteAt` 入面加咗 `refreshTileSprite(scene,row,col)`。

## 4. （已取代）舊嘅單箭嘴 `arrow{North,South,East,West}`

已經由第 1 節第 2 條嘅 `dualLaneStop*` 取代，profile 同 bake 圖都刪咗。以下保留做紀錄，因為核實方向嘅方法仍然適用：

`ROAD_LINE_TILE_PROFILES` 已經有 `straight3`（v）／`straight`（h）呢兩個舊嘅校準實驗,入面各自淨係第一個 marking 就係一個乾淨嘅 `arrowStraight`（第二個 marking 係 merge/right 箭嘴,同呢次冇關）。新增 `arrowNorth`/`arrowSouth`（v）、`arrowEast`/`arrowWest`（h），直接攞呢兩組 corners，另一個方向就將 corners 循環移位 2 個位（等於將個 quad 360°/2=180° 反轉——一條直路自己嘅 quad 對住中心點有 2 摺對稱，所以唔使重新校準）。

**⚠️ 第一次估錯咗方向**：以為 `straight3`/`straight` 嘅 arrowStraight 係指住「順時針/主要」方向,實際落嚟 bake 好之後（160×80 底圖太細，肉眼睇唔到箭嘴指邊），改用 `road-line-warp.js` 嘅 `warpQuadImageOnto` 將同一組 corners 放大 10 倍畫落一張放大咗嘅底圖度先睇清楚——先發現全部 4 個都啱啱好倒轉咗（估做 north 嘅其實指南,估做 east 嘅其實指西）。已經對調返晒。**日後如果再加呢類方向性 marking,一定要用呢個「放大 10 倍畫落實際底圖」嘅方法核實方向,唔好淨係睇 160×80 嘅 bake 圖（太細肉眼睇唔出）,亦唔好淨係睇 marking 素材本身張相（唔知個 quad 點樣擺法）。**

## 4a. 斑馬線之間嘅間距（用戶 2026-09-27 追加）

原本規則下，一段長直路中間每一格都會出斑馬線（連續成排）。追加條件：斑馬線前後各 3 格要係純直路，**而且嗰 3 格入面唔可以有另一條斑馬線**。「純直路」＝同方向直路、單線（非 band）、冇巴士站。

咁樣就唔再係「睇隔籬幾格」嘅本地條件，而係成段直路嘅屬性：`isRoadLineZebraIndex(index, length)` 喺每段純直路入面每 4 格擺一條，前後頭尾最少留 3 格，剩餘嘅空位平均分返兩頭（置中）。例：7 格 → 第 3 格；10 格 → 第 4 格（得一條，唔會兩條貼埋）；11 格 → 第 3、7 格。

**Refresh 後果**：一段直路可以長過 ±12 格嘅 refresh 範圍，喺一頭加減路會令另一頭嘅斑馬線移位。`refreshRoadLineRunsLeaving`（main.js）喺每次矩形 refresh 之後，沿住所有穿出矩形邊界嘅直路一路行到盡頭，順手重畫。道理係：任何 layout 有變嘅直路，一定穿過個 refresh 咗嘅矩形。巴士站增減就用 `refreshRoadLineRunThrough` 重畫嗰一整段。用真 app 驗證過：延長、推土、喺長路中間加闊、加／減巴士站、旋轉之後，畫面上每格貼圖同純函數結果完全一致（0 mismatch）。

## 4b. 地圖旋轉：幾何用 map frame，貼圖用 rendered frame

`getTileKey` 會跟 `mapRotation` 轉：旋轉 90°/270° 時 `road_straight_v`/`_h` 會對調。第一版直接用呢個 rendered key 決定「沿路方向」，結果喺旋轉咗嘅城市（用戶個 save 係 `mapRotation = 3`）斑馬線變咗打橫檢查，箭嘴又 map 唔到方向，成個城市 0 格出現。而家 `getRoadLineVariantAt` 分開兩樣嘢：
- 幾何（沿路軸、隔籬係咪純直路／真路口）用 `baseRoadKeyAt`（`getBaseTileKey`，map frame，同 row/col delta 同一個 frame）。
- 揀邊張貼圖（`road_straight_v`/`_h` 嘅 bake、箭嘴喺畫面指邊）用 `roadKeyAt`（`getTileKey`），箭嘴方向先經 `rotateRoadLineDirection(band.direction, rotation)` 轉做畫面方向。

修正之後用戶個 save：196 格斑馬線、36 格箭嘴（之前 0/0）。**日後加任何靠鄰格判斷嘅規則，一定要喺 rotation ≠ 0 嘅城市都測一次。**

## 4c. 路面解像度：512×256（2026-09-27）

原本 `newRoadTiles/*_fixed.png` 係 160×80，bake 落去嘅字同斑馬線糊到睇唔清。試過 256×128（只係少少改善，「巴士站」都仲睇唔到）同 512×256（「BUS STOP」／「巴士站」睇得清，斑馬線、箭嘴好清楚），揀咗 512。

- **點解係 512 就夠**：Phaser 用 1× CSS pixel render（冇用 devicePixelRatio），最大 zoom 3×，一格路喺畫面最多 480px 闊。再高都唔會睇得出分別。
- **做法**：16 張普通路面 tile（直路、路口、彎、盡頭）由 `_original160/` 嘅原圖用 Lanczos 放大到 512×256，再重新 bake 所有 `__lines_*`。原圖備份喺 `newRoadTiles/_original160/`。
- **畫面尺寸唔變**：tile sprite 本來係原尺寸顯示（scale 1）。`getRoadTextureDisplayScale`（road-tile-sets.js）按 set 嘅 `canvasWidth` 計返個 scale（160/512），`applyTileTextureDisplayScale`（main.js）喺每個 setTexture 之後套用：tile 建立、`refreshTileSprite`、`refreshAllTiles`、橋面、橋 ramp（包括 canvas 生成嘅 ramp surface，佢跟 source 同尺寸、同 prefix）。
- **維持 160×80 嘅**：斜路（`roadHill*`、`roadHill2*`）同橋（`bridge*`）——冇劃線，而且斜路係 `scripts/build-road-slope-tiles.js` 由直路 tile 生成嘅（160×80 幾何寫死）。個 script 同 `test/road-slope-tiles.test.js` 而家按直路 tile 嘅實際尺寸換算座標去 sample，斜路 tile 已經重新生成（同舊版平均差 <1/255）。
- 真 app 驗證：成個城市所有 road sprite 顯示尺寸都係 160×80（0 例外），路口、斜路、橋冇錯位。

## 4d. 驗證（路口前一格）

- `test/road-line-variants.test.js`：雙線四邊、駛離／shared 唔出、單線四邊、T 字路口算、彎位唔算、一格夾兩路口、路口前一格唔算斑馬線嘅純直路、旋轉。
- 真 app：單線十字路四邊都係 `singleCrossStop*`；雙線十字路淨係駛入嗰邊有 `dualLaneStop*`，旋轉後都啱；用戶個 save（rotation 2）：641 格單線路口、33 格雙線路口、75 格斑馬線、118 格巴士站，畫面同規則 0 mismatch。

## 5. 已知限制／未做

- `parkingBay` 概念（`road-line-variants.js` 原本已經預留）依然未有玩法概念驅動,冇做。
- 呢一切都淨係 bake 咗喺 `newRoadTiles/`（"標線道路"套）,"經典"(Kenney) 套完全冇呢類貼圖——preload 會靜靜哋 404,`applyRoadLineTexture` 嘅 `scene.textures.exists()` 檢查會令佢優雅咁跌返做純色,唔會報錯。
- 校正時打錯咗嘅 `dualLaneN` 已經改做 `dualLaneStopN`，程式同校正工具資料庫（`road_line_profiles`）兩邊都改咗。
- 其他已 bake 但未有規則驅動：`parking`/`parking2`（v）、`parking3`/`parking4`（h），同埋早期試驗 `straight`/`straight4`（h）、`straight2`/`straight3`（v）。
- 未用到嘅劃線素材：`arrowMergeLeft`、`boxJunctionBracket_white`、`cornerBracket_white`、`giveWayTriangle`、`stopText_bilingual`、`zebraCrossing`（斑馬線用緊嘅係 `chevronCorridor_crossing`）。`boxJunctionCrosshatch_yellow.png` 已經唔喺 `roadLines/`（2026-09-27 發現），登記亦已經刪咗。

## 6. 驗證

- `test/road-line-variants.test.js`（12 個，純邏輯，涵蓋三條規則、優先次序、邊界情況）。
- 用真實 app（`buildRoadPath` 真拖拉、`setBusStopSides`/`removeBusStopsAt` 真呼叫）逐一驗證：巴士站兩邊各自 variant 正確、兩邊都有變 `busStopBoth2`、移除之後跌返做斑馬線（因為啱啱好喺長直路中間）；一條 2 線路一頭撞真路口,得返「行入路口」嗰條 lane 顯示箭嘴，方向啱，另一條 lane（駛離路口）冇箭嘴。
- 615 → 630 個既有測試全部通過（`npm test`）。
