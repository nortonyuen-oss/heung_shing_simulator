# 《香城模擬器》全港大地圖 Chunk Streaming 技術設計規格

**文件版本：** v1.0（設計提案；尚未實作）<br>
**日期：** 2026-11-14<br>
**目標平台：** Phaser 3 / Electron / Desktop Web / Mobile Safari<br>
**適用模式：** 新增「全港大世界」；保留既有 256×256 城市及存檔相容性<br>
**地圖來源：** 香港完整地形數據（現有 `hk-terrain-tiles.js`）<br>
**設計優先序：** 遊玩流暢 > 穩定存檔 > 無縫地形 > 最小侵入性改造

---

## 0. 給實作者的執行摘要（必讀）

本文件要求**建立真正的區塊資料／渲染生命週期**，而不只是將畫面外 Sprite 設成 `visible = false`。

1. 世界地形 **3187×2400 Tiles**，每格 **20m×20m**；它是完整世界座標，不是目前 256×256 城市地圖。
2. **資料儲存邏輯採 64×64 Storage Chunk**，**實際細節渲染採 32×32 Render Chunk**。兩者不可混淆。
3. 主鏡頭周圍預設且目標**僅 3×3＝9 個高細節 Render Chunks**；隨鏡頭中心切換，在移動方向卸載舊三列、載入新三列。
4. **9 個詳細區塊不保證覆蓋每個縮放與螢幕比例。** 超出範圍的可見地形由低解析度 LOD 底圖補足，不可留白；除非後續經效能測試批准，**不應擅自擴大高細節 Chunk 數量**。
5. Minimap **完全獨立於高細節 Chunk**，可顯示香港全境、當前位置、路網與鐵路資訊；沿用既有等距視覺語言與右下角互動方式。
6. 完整地形是**不可變 Base Terrain**；玩家建設、地形修改、路網及建築以獨立 **World Delta / Save State** 存儲。卸載顯示物件不會刪除遊戲資料。
7. 公車、地鐵、電車、渡輪、飛機、經濟統計等**不得以是否渲染作為是否存在的判斷**。
8. **先實作一條可運作的縱切路徑（vertical slice）**：選擇一個 256×256 地形區域驗證讀取、切換、建設、儲存、Minimap；通過測試後再啟動全港範圍。

> **不在本次工作範圍：** 重寫所有城市模擬規則、重製美術資產、全面更換 Phaser、立即實作全港即時人口逐格模擬。

---

## 1. 地圖規格與精確數據

| 項目 | 數值／規則 |
|---|---|
| 世界寬度（列 col） | 3187 tiles |
| 世界高度（行 row） | 2400 tiles |
| 全世界 Tiles | **7,648,800** |
| 地理解析度 | 20m / tile |
| 地圖矩形包絡尺寸 | 約 63.74km × 48.00km（不代表香港陸地面積） |
| Render Chunk | 32×32 tiles |
| Render Chunk 網格 | `ceil(3187/32)=100` 欄 × `ceil(2400/32)=75` 行 = **7,500 個** |
| Storage Chunk | 64×64 tiles |
| Storage Chunk 網格 | `ceil(3187/64)=50` 欄 × `ceil(2400/64)=38` 行 = **1,900 個** |
| 高細節活躍區域 | 3×3 Render Chunks = 9 個，最多覆蓋 **9,216 Tiles** |
| 以全圖 Tile 數計之佔比 | 9,216 / 7,648,800 ≈ **0.1205%** |
| 32px Chunk 最右一欄 | 實際只有 **19** tiles 寬（3187 mod 32 = 19） |
| 32px Chunk 最下方一行 | **32** tiles 高（2400 可被 32 整除） |
| 64px Chunk 最右一欄 | **51** tiles 寬（3187 mod 64 = 51） |
| 64px Chunk 最下方一行 | **32** tiles 高（2400 mod 64 = 32） |

> 表格中的「32px Chunk」指 **32 tiles**，與螢幕像素沒有關係。實作時一律使用 `CHUNK_RENDER_TILES = 32` 命名。

### 1.1 統一座標與鍵名

- 所有世界資料一律使用**整數世界 Tile 座標** `(col, row)`，左上角 `(0,0)`。
- `col ∈ [0,3186]`；`row ∈ [0,2399]`；行列順序必須與既有地形源吻合。
- 世界 Chunk ID：`r:<cx>:<cy>`（Render）及 `s:<sx>:<sy>`（Storage）。
- 計算 Render Chunk：`cx = floor(col/32)`、`cy = floor(row/32)`。
- 計算 Storage Chunk：`sx = floor(col/64)`、`sy = floor(row/64)`。
- Chunk 局部座標：`localCol = col - cx*32`、`localRow = row - cy*32`。
- 儲存**世界 Tile 座標**；不可將當前 Chunk 的局部座標寫入原有建築 ID、道路拓撲或路線資料，避免 Chunk 切換後重複／錯位。
- 如果既有模組使用 `(row,col)` 引數，必須在 Adapter 邊界明確轉換；不要暗中互換。

```js
const WORLD = Object.freeze({
  width: 3187,
  height: 2400,
  tileMetres: 20,
  storageChunkTiles: 64,
  renderChunkTiles: 32,
  detailRadiusChunks: 1, // (-1..1) => 3x3
});

const ceilDiv = (a, b) => Math.ceil(a / b);
const renderChunkCols = ceilDiv(WORLD.width, WORLD.renderChunkTiles); // 100
const renderChunkRows = ceilDiv(WORLD.height, WORLD.renderChunkTiles); // 75
const storageChunkCols = ceilDiv(WORLD.width, WORLD.storageChunkTiles); // 50
const storageChunkRows = ceilDiv(WORLD.height, WORLD.storageChunkTiles); // 38

function renderChunkBounds(cx, cy) {
  const col = cx * WORLD.renderChunkTiles;
  const row = cy * WORLD.renderChunkTiles;
  if (cx < 0 || cy < 0 || col >= WORLD.width || row >= WORLD.height) return null;
  return {
    col, row,
    width: Math.min(WORLD.renderChunkTiles, WORLD.width - col),
    height: Math.min(WORLD.renderChunkTiles, WORLD.height - row),
  };
}
```

### 1.2 現有地形源必須保留

已查閱 GitHub `nortonyuen-oss/heung_shing_simulator` 現行原始碼（2026-11-14）：

- `hk-terrain-tiles.js` 已聲明 `width: 3187`、`height: 2400`、`tileMetres: 20`；行資料採 **RLE run-length coding**（`W` 水、`B` 沙灘、`a`–`i` 不同地形高度）。
- `terrain-presets.js` 包含 `decodeHkTerrainRow()` 與地形整理流程，可作為離線轉換的參考；但其目前預設 `MAP_WIDTH` 等 256×256 邏輯，**不可直接當成全港動態解碼器**。
- `main.js` 目前有 `const MAP_WIDTH = 256`、`const MAP_HEIGHT = 256`、`TILE_WIDTH = 100`、`TILE_HEIGHT = 50`、`TILE_IMAGE_HEIGHT = 65`。**這是既有城市模式配置，不應直接全局替換成 3187×2400。**
- 原有 23 個香港地區地圖仍可維持 256×256，與「全港大世界」模式並存。

**規範：** 建立新 `WorldConfig / WorldTerrainProvider / WorldModeAdapter`。舊 `MAP_WIDTH` 及 `MAP_HEIGHT` 暫不修改語義；逐步將真正需要世界大小的程式改用 `world.width/height`。

---

## 2. 整體架構

```text
                          [ WORLD CONFIG / WORLD COORDINATES ]
                                          |
            +-----------------------------+--------------------------+
            |                             |                          |
  [Immutable HK Base Terrain]     [World Save / Delta]      [World Simulation]
   RLE -> offline preprocess      local authoritative       city-wide aggregates
   Storage Chunk 64x64            changes / transactions    transport routes/state
            |                             |                          |
            +-----------[World Data Access / Cache]---------+         |
                                     |                       |         |
                              [Chunk Manager]               |         |
                              32x32 / 3x3 active            |         |
                                     |                       |         |
                             [Phaser Renderer]               |         |
                            terrain / buildings             |         |
                            roads / props / effects          |         |
                                     |                       |         |
                          [Camera + Iso Transform]           |         |
                                     |                       |         |
                      [Low-detail World LOD / fallback]      |         |
                                     |                       |         |
                                     +----------[Minimap Service]------+
                                                cached overview
                                                + dynamic overlays
```

### 2.1 明確區分 4 個狀態

1. **Available on disk/network**：靜態資料可由 Electron 本地檔或 Web 靜態資產讀取。
2. **Decoded/cached**：區域資料已解碼到少量 TypedArray／物件記錄。
3. **Mounted for rendering**：Phaser 已有該 Render Chunk 的地形容器／靜態繪圖物件。
4. **Visible this frame**：物件當前有落在鏡頭與裁切範圍內。

不得把「隱藏」、「移出 Display List」、「銷毀 GameObject」、「釋放資料快取」視為同一個操作。每一種的記憶體與時序不同。

### 2.2 建議模組（新增而非覆寫）

```text
world/
  world-config.js            # world dimensions, modes, version, identifiers
  world-coordinates.js       # (col,row) -> chunk, iso transforms, rotation
  terrain-pack-builder.mjs   # build-time RLE -> packed terrain data
  world-terrain-provider.js  # static base terrain read/ decode / cache
  world-delta-store.js       # player edits, save snapshots, dirty chunks
  world-chunk-manager.js     # chunk scheduling/state machine
  world-chunk-renderer.js    # Phaser mount/unmount + depth integration
  world-lod.js               # terrain fallback / overview textures
  world-minimap.js           # world view drawing/click/rotation
  world-diagnostics.js       # instrumentation & dev overlay
```

實際目錄可依專案 Script 載入與模組組織方式調整；**不可為了引入 ES Modules 而同時大改所有舊 Script**。

---

## 3. Chunk 生命週期與 3×3 載入策略

### 3.1 狀態機

```text
UNLOADED -> REQUESTED -> DECODING -> READY -> MOUNTING -> ACTIVE
  ^              |           |         |        |          |
  |              +---- obsolete/cancelled -------------------+
  |                                                         |
  +---------------- EVICTED <- UNMOUNTING <- INACTIVE <-----+

ERROR -> retry with backoff or show low-detail fallback
```

- 每個 Chunk 以 `id + epoch/version` 標識請求；異步返回時必須重新確認該 Chunk 仍被需要。
- `setActiveChunks()` **差量更新**，不能每次鏡頭移動重建全部 9 個。
- 任何正在執行的建立／銷毀，須可分批處理；不能在一幀大量建立地形 Sprite。
- 同一 Chunk 不可並發解碼兩次、Mount 兩次，或 Destroy 兩次。
- 鏡頭快速拖動時，舊請求可以取消或標記過期；結果到達後不得突然顯示在舊位置。

### 3.2 必須維持「最多九個 Active 高細節 Render Chunks」

以鏡頭焦點所在的 Chunk `(cx,cy)` 為中心：

```text
(cx-1, cy-1)  (cx, cy-1)  (cx+1, cy-1)
(cx-1, cy  )  (cx, cy  )  (cx+1, cy  )
(cx-1, cy+1)  (cx, cy+1)  (cx+1, cy+1)
```

跨越一個 Chunk 邊界時：正常情況保留 6 個舊區塊、卸載 3 個、載入 3 個。接近世界邊緣時可少於 9 個，不應用越界空白區塊補齊。

**注意：** 主畫面的「3×3」應定義為**高細節 Render Chunk 數量**。低解析度世界底圖不計入此數量。若嚴格要求全部解碼資料也只保留 9 個，則取消預取；代價是跨邊界較易出現讀取停頓。建議第一版：**最多 9 個 Active，容許少量短暫 Prefetch（資料但不掛上 Phaser）**，並提供設定切換。

### 3.3 具體管理演算法（參考偽碼）

```js
function requiredDetailChunkIds(focusCol, focusRow) {
  const cx = Math.floor(focusCol / 32);
  const cy = Math.floor(focusRow / 32);
  const wanted = new Set();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if (renderChunkBounds(x, y)) wanted.add(`r:${x}:${y}`);
    }
  }
  return wanted;
}

async function refreshChunksFromCamera(camera) {
  // IMPORTANT: use the game's existing inverse isometric transform,
  // including mapRotation, camera scroll/zoom and scene offsets.
  const focusTile = cameraCentreToWorldTile(camera);
  const generation = ++chunkManager.generation;
  const wanted = requiredDetailChunkIds(focusTile.col, focusTile.row);

  chunkManager.wanted = wanted;
  chunkManager.cancelObsoleteRequests(wanted);
  chunkManager.scheduleUnloadsExcept(wanted);

  for (const id of wanted) {
    chunkManager.ensureScheduled(id, generation);
  }

  // Jobs are completed incrementally, under a measured per-frame budget.
  // Before mounting a completed async job:
  //   if (!chunkManager.wanted.has(id)) discard decoded result.
}
```

**觸發時機：** 只在 Camera 焦點變更所屬 Chunk、World Mode 切換、地圖重新載入，或必要的資料失效時更新 Wanted Set。**不需每幀發送 9 次 I/O。**

### 3.4 跨邊界顯示及延遲載入

- `ACTIVE` 地形完成前，使用 LOD 地形作為後備，避免露出黑格或透明洞。
- 新 Chunk 必須**先載入／建立，再顯示**；舊 Chunk 的移除不可使鏡頭覆蓋區域裸露。
- 如果 Active Chunk 僅以中心 Chunk 3×3 決定，鏡頭靠近中央 Chunk 邊緣、Zoom Out 或超寬桌面螢幕時，視野可能超出 9 個區塊。**不允許假設 3×3 一定涵蓋視野。**
- 第一版方案：**3×3 高細節 + 超出部分由地形 LOD 兜底**；有需要可在正式 Benchmark 後另設高階裝置的 5×5 模式，但**不是 v1.0 預設**。

### 3.5 排程與快取

- 優先順序：鏡頭中心 Chunk > 正在視野內 Chunk > 移動方向 Chunk > 其餘。
- Mount 工作分幀執行（先從每幀約 2–4ms 的工作配額測試，不視為保證值）。
- 限制同時解碼／讀取工作數目（起步 2–3）；同時掛載不宜大批連發。
- Cache 以**byte budget + LRU** 控制，不要單純以「保留 N 個 JS 物件」推算記憶體。
- 先做到**無重覆 I/O、無過時掛載、無錯誤時丟資料**，再談 Worker、預取與渲染花式優化。

---

## 4. 地形封裝、傳送與記憶體

### 4.1 原始地形：離線預處理，不在手機啟動時全圖展開

資料來源 `hk-terrain-tiles.js` 已包含全港 RLE 行資料。**建議新增 Build Step：**

```text
RLE terrain source (3187 x 2400)
      |
  Offline parse / validate / checksum
      |
  Immutable Base Terrain chunks (64x64)
      |
  Optional region packs (256x256 region index)
      |
  Static Web assets / Electron packaged assets
```

- Base Terrain 的碼值需保留原始水、沙、地形高度資訊，**不要將生成後的 `HILL` 當作唯一高程記錄**。
- 用 `Uint8Array`（如每 tile 地形型別及高度可在 0–255 表示）等 TypedArray，避免千萬個小 JS 物件。
- 原始地形地理參考與版本（`westE=799997.5`、`northN=848002.5`、`tileMetres=20`）保存於 manifest。
- **高度地形的坡度外觀**依現有渲染規則產生；需要跨 Chunk 邊界的相鄰高度資料時，以 `TerrainProvider` 查詢世界座標鄰居，或額外讀取 1 tile 邊界 Halo；不要獨立對每個 Chunk 執行會改變地形的平滑程序。
- 如果需離線修整地形，必須對**整個世界統一處理或確保跨區運算一致**，才切 Chunk；否則海岸及坡面容易出現接縫。

### 4.2 HTTP 傳送策略

不建議一開始生成 **7,500 個獨立 32×32 網路檔案**：GitHub Pages 靜態託管在大量請求與資產管理方面會增加成本。

**建議：**

- **64×64** 作邏輯儲存／可單獨尋址的區塊。
- **256×256** 作選用的 HTTP Region Pack，每包最多含 4×4 個 64×64 Storage Chunks；整張圖共有 `ceil(3187/256)×ceil(2400/256)=13×10=130` 個 Region Pack。
- Region Pack 內含偏移索引，讀取時只解碼需要的 64×64 Storage Chunk（但網路下載可能已取得整個壓縮包）。
- **若 Region Pack 導致切換時額外下載量過大，可改為單個 64×64 檔案或分區壓縮方案**；必須用實測檔案大小、HTTP 請求量及手機快取命中率決定。
- 若仍在 Web 初始頁面引入完整 `hk-terrain-tiles.js`，即使畫面只建立 3×3，**仍不等於真正做到隨區塊下載**。需確保新大世界模式按需獲取資產，不要把全部 RLE 塞進首屏 Bundle。

### 4.3 資料 vs 渲染成本

兩個 `Uint8Array` 全世界底圖層（各 1 byte/tile）理論原始位元組約 14.6MiB，**本身未必是最大負擔**；大量 JS 二維陣列、Phaser Sprite、Display List 操作、Canvas 全圖重繪與複雜建築才可能昂貴。

必須分開測量：

- 網路／磁碟載入 bytes；
- Decoded TypedArray bytes；
- Phaser GameObject 數量；
- GPU texture bytes；
- Chunk 建立／移除花費 ms；
- 實際每幀 render / update 時間。

**一個 32×32 Chunk 不應預設建立 1,024 個獨立地形 Sprite。** 優先嘗試 Chunk-based `RenderTexture`、Tilemap-compatible renderer 或靜態地形幾何合批；動態建築與高低差、海岸邊緣保留必要個別物件。方案需經現有等距高度／Depth 測試才選定。

---

## 5. Phaser 3、2:1 Isometric 與深度排序

### 5.1 只可有一套世界投影定義

現有 `main.js` 使用地形菱形 Tile `TILE_WIDTH=100`、`TILE_HEIGHT=50`、圖片高度 `65`。新大地圖必須**沿用原有 `isoToScreen`、反算 Tile 點選、`mapRotation` 與高度偏移規則**。

基本未旋轉地面投影的抽象關係：

```js
// Illustrative only; DO NOT directly replace the game's existing functions.
const screenX = originX + (col - row) * (TILE_WIDTH / 2);
const screenY = originY + (col + row) * (TILE_HEIGHT / 2)
              - heightLevel * HEIGHT_STEP_PIXELS;
```

- 所有 Render Chunks 需使用**同一個全世界 Origin**；不能每 Chunk 單獨以 (0,0) 重新定位。
- 地形圖片點位和實際足點（`TILE_IMAGE_HEIGHT`, `BUILDING_SURFACE_Y_OFFSET`）沿用原有規則，不要將模型隨意改中心錨點。
- 地圖四個旋轉方向都需能正確將 Camera Center 反算成世界 Tile。
- 避免超大世界座標造成的長距離 Canvas / GPU 精度問題；如必要採**鏡頭相對渲染原點**，但存檔座標仍保持世界整數座標。

### 5.2 Depth Sorting 不可依 Chunk ID 排序

按原有 Tile 深度／建築足點的**全世界座標**排序。跨 Chunk 的高樓、山坡、橋面、架空鐵路列車不能因 Container 的 Chunk 順序而互相遮擋錯誤。

對高樓與超出地面佔地的模型：

1. 以世界 Anchor Tile 指定資料擁有者（Owner Chunk）。
2. 為渲染建立 Screen-space Bounds／overhang。
3. 如 Anchor 在 3×3 外但模型畫面仍可見，透過輕量**跨 Chunk 空間索引／ghost reference**查詢需要的物件（避免重覆建立建築）。
4. 可見性與 Depth 按真實 Bounds 和世界座標決定，絕不可只用 Anchor 在不在九區塊內判斷。

### 5.3 不破壞現有優化

現行 `viewport-culling.js` 已實作 viewport sprite 啟停與批次 Display List 操作；`render-performance.js` 亦負責部分排序／效能優化。

新 Chunk Manager **應接在現有 culling 上游**：

```text
Chunk Manager: 決定哪些世界區域有可用高細節物件
Viewport Culling: 決定這些物件哪些目前進入可視範圍
Depth Sorting: 正確處理重疊物件的畫面順序
```

不要同時讓兩個系統任意銷毀同一個 Sprite；要有清楚所有權和生命週期。

---

## 6. 建設、存檔與跨 Chunk 實體

### 6.1 靜態地形 + 玩家增量修改

**Base Terrain 永遠不被存檔覆寫。** 玩家存檔儲存與 Base 不同之處，以及世界實體狀態。

```json
{
  "schemaVersion": 2,
  "worldId": "hong-kong-full-3187x2400-v1",
  "baseTerrainVersion": "hk-dtm-v1",
  "worldSize": {"width": 3187, "height": 2400},
  "chunkSize": 64,
  "chunkId": "s:25:18",
  "revision": 12,
  "terrainEdits": [
    {"col": 1634, "row": 1198, "terrainType": 1, "height": 0}
  ],
  "zones": [],
  "roads": [],
  "placedEntityAnchors": ["building:1234"]
}
```

以上只是 **schema 示意**，不應直接覆蓋舊存檔；最終欄位必須與現有 `save.js`、`db.js`、`game-storage.js` 配合。

- **Electron:** 使用現有 SQLite 儲存邊界，加入 world/chunk/delta 儲存機制。
- **Web / Mobile Safari:** 使用現有 `game-storage.js` IndexedDB 機制，注意容量、失敗恢復、寫入一致性。
- 變更建築／道路應將所涉 Storage Chunk 設為 Dirty。
- 卸載前未完成儲存的 Dirty Chunk **不可無提示地拋棄**；可先在記憶體保留 pending changes、執行受控 flush，失敗則阻止資料清理或提供明確錯誤。
- `schemaVersion`、`worldId`、`baseTerrainVersion` 均要驗證。
- 跨模式舊存檔應仍可載入 256×256 世界；不能把舊 Row:Col 索引直接當成全港座標而移動玩家城市。
- 提供備份與 migration rollback；完整匯出 `.heungshing` 時必須包含所有必要 World Delta，不可只匯出目前 Active Chunks。

### 6.2 跨 Chunk 建築與交通網絡

- 例如 4×4 建築跨過 Chunk 邊界，應只有**一個 Authoritative Entity ID**，以 Anchor 作所有者，其他 Chunk 保存空間索引 reference。
- 道路、地鐵／電車軌道、橋樑、隧道、供電及服務覆蓋跨區時，以**世界 Tile** 作拓撲節點，不要按 32×32 獨立生成不連通圖。
- 建設／拆除跨區物件時，用一個 transaction 更新全部受影響 Storage Chunk 的引用；不得發生只有一半道路被保存。
- 建設時改動的 Dirty Render Chunks 只重繪受影響部分（含必要周邊 1-tile Halo），不重建全部九格。

---

## 7. 全港模擬與交通：世界不能因卸載而停止

> **原則：** Render Chunk 是繪圖範圍，**不是世界是否存在的邊界**。

| 子系統 | 高細節 Active Chunk 內 | 高細節 Active Chunk 外 |
|---|---|---|
| 地形 | 高細節渲染 + 互動 | 保留 Base Terrain / Delta，LOD 顯示 |
| 建築 | 顯示 Sprite / 夜景燈效 | 保留實體資料及所屬區域聚合統計 |
| 道路／鐵路 | 可視化路面／軌道 | 世界拓撲持續可查詢 |
| 巴士／電車／地鐵 | 顯示位置、動畫、車輛 | 以時間與路線狀態推進，回鏡頭時補間顯示 |
| 財政／人口／需求 | UI 查詢現況 | 聚合／批次模擬，不需逐格逐幀更新 |
| 船舶／飛機 | 視野內顯示航跡 | 保存世界座標、時間、任務狀態 |

初期最保守的做法：**保留既有單城模擬引擎不變**，先讓全港地形可瀏覽、可建造、可存檔；再將跨區交通及全港經濟聚合引入。切勿在第一個 Chunk PR 就直接把全部 `simulation.js` 改成「全港每格每 tick」。

---

## 8. Minimap 設計（重要）

### 8.1 保留《香城》原有 UI 語言

已檢視 `city-minimap.js`：目前右下角 Minimap 以**等距菱形**呈現、跟隨 `mapRotation`、顯示鏡頭範圍、支援點擊／拖動跳轉；也繪製淡色地鐵路線。這套設計值得保留，而非直接改成全新風格 UI。

**保留：** 角落位置、展開／收起、拖曳視窗、淡色交通線、目前位置框、等距視覺及旋轉同步。

**改變：** 背景來源必須從「每次掃描所有 `mapData[row][col]`」改為**獨立 Map Overview / LOD 資源**。

### 8.2 兩層地圖模式

| 模式 | 建議內容 | 用途 |
|---|---|---|
| **Local Minimap（預設）** | 玩家附近 128–256 tiles 範圍，保留等距旋轉；從低解析度 Terrain Cache + 周邊城市 Delta 構圖 | 尋路、看道路／鐵路、拖曳移動 |
| **World Overview（展開）** | 整張 3187×2400 香港版圖；可用預計算正射或等距總覽；行政區、地標、交通線、相機位置 | 快速跳到其他地區、全港規劃 |

為避免手機記憶體壓力，**不要預先生成 1 pixel/tile 的全港等距原尺寸 Canvas**。3187×2400 的等距菱形投影可以形成寬數千 pixel 的畫布，再同時保留四個旋轉方向更不划算。

**建議：**

- Build-time 預製小尺寸 Overview，例如以容器尺寸和 DPR 決定的 512～1024 級別 WebP（不是 3187×2400 的實時 Canvas 逐格像素畫法）。
- 如需四個旋轉視角，可預製四個 Overview 變體／以同一地理底圖進行正確轉換，切忌直接旋轉圖片卻沒有同步修正點擊座標。
- City Overlay（道路／建築／鐵路／分區顏色）採獨立 Canvas Layer、Dirty Rect、區域 Cache 或稀疏世界索引。
- 只在玩家建設、地圖旋轉、縮放、切換模式、局部地圖中心跨過適當閾值時重畫底層；鏡頭框用輕量 Overlay 單獨更新。
- 不因未載入高細節 Render Chunk 而將遠處地形畫黑；Overview 應**永遠可顯示完整原始地形**。

### 8.3 Camera Viewport Overlay 與地圖點擊

- Minimap 顯示實際 Camera viewport 在世界地圖的投影；在等距模式應考慮**多邊形或旋轉後範圍**，不只假設螢幕矩形即 Tile 空間矩形。
- `worldToMinimap()` 與 `minimapToWorldTile()` 必須共用一套轉換矩陣，並且涵蓋四個 `mapRotation`。
- 點擊或拖曳 Minimap 跳遠時：**先立即移動相機、先顯示低 LOD、再異步載入新 3×3**；不可以同步 decode 完香港地圖才移動鏡頭。
- 顯示位置不得超出世界邊界，允許使用現有 Camera Bounds 體系。
- `city-minimap.js` 目前 `CITY_MINIMAP_REDRAW_MS = 2000`、直接全圖 loop；**在 3187×2400 世界不能沿用這條全圖 loop 每兩秒執行**。
- 現有 `cityMinimapWorldToFraction()` 與 `cityMinimapFractionToWorld()` 使用 256 尺度的 `MAP_WIDTH/HEIGHT`，全港模式必須改走世界模式 Adapter，避免位置錯誤。

---

## 9. 分階段實作與與舊系統整合

### Phase 0 — Audit（不可略過）

**目標：** 釐清現有耦合，確保不破壞玩法。

- 搜索所有 `MAP_WIDTH`、`MAP_HEIGHT`、`mapData[row][col]`、`heightMap`、`isInsideMap`、`getTileId` 的使用處。
- 分類：直接渲染／點擊、建設、存檔、Minimap、經濟、交通、地形生成。
- 確認現有 `viewport-culling.js` 及 `render-performance.js` 的物件所有權。
- 為 256×256 舊模式建立回歸測試基線，備份真實存檔。

**產出：** dependency audit、需 Adapter 的函式清單、基本 FPS/記憶體基線。

### Phase 1 — Static Terrain Vertical Slice

**目標：** 第一個能走得動的世界區域。

- 寫 RLE to chunk 的離線工具，驗證全部 3187×2400 行列、邊緣與 checksum。
- 用一個 256×256 試驗區域驗證 64 Storage + 32 Render + 3×3 Streaming。
- 只需要水／岸／陸地／高低地形；先不接建築或複雜模擬。
- 支援跨 Chunk 移動、快速跳轉、四方向旋轉、Zoom 0.4x LOD 兜底。

**驗收：** 不掉 Tile、不裂縫、不漏出未繪製背景，離開區域後 Phaser 細節 GameObjects 真正釋放。

### Phase 2 — Save Delta + Construction

- 建設、道路、地形修改、建築實體綁定世界座標。
- 加入 Dirty Chunk、受控儲存及完整匯出。
- 特別測試 32×32 邊界上 2×2／4×4 建築與長橋、鐵軌。
- 舊 256×256 存檔與地形選擇完全保留。

### Phase 3 — Minimap + World Navigation

- 右下角仍用原有 UI；底圖改 Overview Cache + Local Cache。
- 跳轉全港任意點；相機轉換與地理參考坐標一致。
- 地鐵線／道路／建築 Overlays 與世界資料層保持一致。

### Phase 4 — World-scale Transport / Simulation

- 全港道路／鐵路路網跨 Chunk 查詢。
- 區域人口／財政 aggregation；遠區交通時間推進。
- 不以 Chunk 卸載停止交通狀態。

### Phase 5 — Performance & Release

- iPhone Safari、Desktop Safari／Chrome、Electron 測試。
- 實測 32×32 vs 64×64 **Render**（如果 32×32 切換開銷過高，可調整，但不改存檔 schema 及世界座標）。
- 收集細節載入時間、p95 frame time、Total GameObjects、峰值 GPU memory（若可量測）、IndexedDB／SQLite 存檔延遲。

---

## 10. 必測情境（QA Acceptance Criteria）

| ID | 測試 | 通過標準 |
|---|---|---|
| C01 | 世界分區總量 | 32×32 得 100×75=7500；64×64 得 50×38=1900 |
| C02 | 右邊界 | 最右 Render Chunk 寬 19，無越界／污染 |
| C03 | 下邊界 | 最下 Render Chunk 高 32；最下 Storage Chunk 高 32 |
| C04 | 3×3 活躍數 | 正常位置 `active <= 9`；跨界保留 6 換 3，非全毀重建 |
| C05 | 地形無縫 | 水岸、山坡、橋底、山影高度跨邊界對得上 |
| C06 | 快速拖曳 | 舊 async 回傳不重新掛載過期 Chunk；無無限 Pending |
| C07 | Zoom 0.4x | 視野外的詳細 Chunk 區域由正確 LOD 覆蓋，不顯示黑格 |
| C08 | 建設跨 Chunk | 2×2 / 4×4 建築、道路／鐵軌跨區不重覆、不分裂 |
| C09 | Save / Reload | 在邊界建造、移開、重開存檔、返回後狀態完全一致 |
| C10 | Web 後台重啟 | IndexedDB persist、離線／失敗時不靜默丟失 Dirty Delta |
| C11 | Minimap | 全港 Overview 不依賴 Active Chunk，拖動能跳往任意區域 |
| C12 | 四方向旋轉 | 玩家點擊、建築、Minimap 位置與 camera 視域吻合 |
| C13 | 遠區交通 | 離開路段後車輛／路線狀態不被銷毀，返回時合理重建視覺 |
| C14 | 舊城存檔 | 舊 256×256 地圖載入及玩法沒有 regression |
| C15 | 長時間遊玩 | 連續跨區移動後物件數與記憶體回到穩定區間，無持續增長 |
| C16 | 失敗回退 | Asset 404、解碼異常、Quota Error：有 fallback/error 並保住存檔 |
| C17 | 全圖啟動成本 | 大世界不在首幀同步建立或遍歷 7,648,800 個 Phaser 物件 |
| C18 | 手機觸控 | 兩指縮放、拖動相機、Minimap 跳轉不造成控制衝突 |

> 性能通過標準應與相同裝置、相同鏡頭及場景的 baseline 比較；不要只看平均 FPS。重點是 **p95/p99 frame time、載入峰值及內存是否持續增長**。正式發布前再依裝置訂明最低可接受 FPS，避免沒有根據的保證。

---

## 11. Debug 顯示與日誌

新增可開關的 Developer Overlay（正式玩家預設隱藏）：

```text
WORLD: Hong Kong Full 3187x2400
Camera Tile: (1634, 1198) / Rotation 0 / Zoom 0.40
Focus Render Chunk: (51,37)
Detail Chunks: 9 active / 1 decoding / 0 error
Decoded Cache: ... MB   Render Objects: ...
Chunk Mount (p95): ... ms   Frame (p95): ... ms
Minimap: overview-cached / dirty-regions: 2
Save: pending-deltas: 0 / last-flush: ... ms
```

至少輸出以下事件及數據：

- `CHUNK_REQUEST`, `CHUNK_DECODED`, `CHUNK_MOUNTED`, `CHUNK_UNMOUNTED`, `CHUNK_REQUEST_OBSOLETE`, `CHUNK_ERROR`。
- 所有 `Chunk ID`、`World ID`、`generation`、處理耗時與 bytes。
- Cache hit / miss、Active GameObjects、具體錯誤原因。
- 不應常態用 `console.log` 每 tile 輸出，避免 Debug 本身拖垮 Safari。

---

## 12. 禁止事項與實作護欄

1. **禁止**把 `MAP_WIDTH=256` 直接全域改成 3187，然後假設所有 `createFilledMap()`／存檔／Sim 都可正常工作。
2. **禁止**以 `visible=false` 當作唯一 Chunk Unload。
3. **禁止**每幀重新掃描 7,648,800 Tiles 來製作 Minimap 或顯示地形。
4. **禁止**讓每個 Render Chunk 自己生成不同坡度／海岸平滑結果。
5. **禁止**用 Chunk ID 代替全局 Depth Sorting。
6. **禁止**因 Renderer 卸載而清掉未儲存玩家建設、交通工具的世界狀態。
7. **禁止**一次異步載入結果返回後，未核實 Wanted Set 就掛載舊 Chunk。
8. **禁止**未經批准將預設 3×3 變為 5×5／7×7 以掩蓋 LOD 問題。
9. **禁止**修改既有 256×256 城市存檔格式而沒有 migration／rollback。
10. **禁止**在第一階段同時重構 UI、美術、經濟、交通及地形生成器。

---

## 13. 給 Claude / 開發者的落地指示

> 依本規格，**先做 Audit + Phase 1，不要直接全量改寫**。請先列出現行程式涉及地圖尺寸、顯示與存檔的相依檔案，建立 `WorldConfig`、`TerrainProvider`、`ChunkManager` 的最小實作。
>
>
> 驗證 `3187×2400`、`64×64 Storage`、`32×32 Render`、`3×3 Active`、跨邊界資料一致性。保持既有 256×256 模式完全可用。Phase 1 通過全部基礎測試後，再接玩家建設與 Minimap。
>
>
> 如果現有架構與此文件衝突，**不得靜默改寫核心引擎**：請先標出衝突、提出 Adapter 或 Migration，再逐步實施。

### 短版完成定義（Definition of Done）

新「全港大世界」能由香港全地形資料進入任意位置，玩家移動時高細節區域依 32×32 分塊、以 3×3 視野範圍逐步更換；地形邊緣沒有裂縫；縮遠不會露出空白；右下 Minimap 仍維持《香城》的等距視覺並可跳轉全港；玩家在不同 Chunk 建造及儲存後可無損恢復；原本 256×256 城市模式不受影響。

---

### 原始碼對照（截至 2026-11-14）

- `main.js` — 256×256 世界常數、等距 Tile 幾何。
- `hk-terrain-tiles.js` — 3187×2400 香港全地形 RLE 基礎資料。
- `hk-district-maps.js` — 既有 256×256 香港地區地圖。
- `terrain-presets.js` — RLE Row 解碼／香港地形整理。
- `terrain-generation.js` — 坡度處理／地形生成輔助。
- `city-minimap.js` — 現有等距 Minimap、旋轉、導航及鐵路 Overlay。
- `viewport-culling.js` — 可視範圍 Sprite 啟停與 Display List 批次調整。
- `render-performance.js` — 渲染及排序效能優化。
- `city-state.js`, `map-utils.js` — 地圖層與 Tile ID。
- `save.js`, `db.js`, `game-storage.js` — 儲存與 Web IndexedDB 邊界。
- `map-sources.js` — 新遊戲的地圖來源清單。

**註：** 本文件是基於以上公開倉庫現況的架構提案，並非已完成的程式修改，也不是全倉庫逐行 Audit 報告。
