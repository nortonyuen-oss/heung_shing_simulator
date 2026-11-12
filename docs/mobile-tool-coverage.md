# 手機版 Phase 0：工具及視窗覆蓋表

來源：`index.html` 工具選單（`#tool-menu`，60 個唯一 `data-tool` ID）、`main.js` 輸入處理、`tool-menu.js`。基線：v5.5.1（`feature/mobile-ui`）。本表為規格 §10 要求的功能覆蓋清單；每項在 Phase B／C 完成時須補上「手機入口」同「驗收案例」。

「現有互動」由 `main.js:1072–1245` 同 `applyToolAt()`（`main.js:2097`）閱讀推斷；標「推斷」嘅項目 Phase B／C 實作前要以測試逐項確認。

## 1. 工具（60 個）

### 1.1 互動類型

| 代號 | 現有桌面互動 | 手機做法（Phase B/C 共通規則） |
|---|---|---|
| P 單點放置 | 左鍵按下即提交（`main.js:1083` → `applySelectedTool`），hover 顯示放置預覽 | 點格 → 預覽 → 微調／旋轉 → 確認 |
| D 拖曳提交 | `pointerdown` 記起點，`window` `pointerup`（`tool-menu.js:60`）提交 | 起點／終點（或兩角）草稿 → 確認 |
| T 逐格塗畫 | `pointermove` 逐格即時套用（`main.js:1178`） | 框選草稿 → 摘要 → 確認 |
| S 逐站點選 | 路線編輯模式下點地圖加站（`main.js:1076`） | 路線編輯模式；取消／pinch 不加站 |
| Q 查詢 | `pointerup` 觸發（`main.js:1103`） | 點選 → 資訊卡 |

### 1.2 Phase B（38 個）

**原型已接駁（2026-11-11）**：32 個 P 工具全部經 `mobile-ui.js` 兩層「建造 › 分類 › 工具」入口及 `tool-actions.js` 共用 adapter；放置位置／款式／成本進入 `build-session.js` 草稿，按確認先提交。類別沿用桌面分類（包含核電、遊艇會及酒店）；自動化檢查全部 32 個入口可到達。案例：M07（一次提交）、M11（取消）、M19（縮放保留草稿）、M21（資金／位置重新驗證）；真機驗收未完成。

**P 單點放置建築（32）** — 共用同一個 adapter：

| 分類 | 工具 ID（成本） |
|---|---|
| 海事處（5） | `fish-market`($3,200) `seafood-restaurant`($2,400) `fish-loading-bay`($1,500) `yacht-club`($16,000) `gold-coast-hotel`($45,000) |
| 電力水務（3） | `power-coal`($3,000) `power-solar`($6,000) `power-nuclear`($28,000) |
| 公共設施（12） | `fire-station`($1,000) `police-station`($800) `hospital`($7,200) `primary-school`($1,200) `secondary-school`($1,800) `community-college`($3,200) `university`($8,000) `public-market`($3,200) `legislative-council`($5,200) `stock-exchange`($9,800) `harbor`($12,000) `airport`($150,000) |
| 康文署（8） | `library`($1,600) `cultural-center`($9,000) `space-museum`($6,500) `heritage-temple`($2,600) `grand-temple`($6,200) `heritage-church`($3,200) `indoor-coliseum`($12,000) `football-stadium`($18,000) |
| 地標名勝（4） | `buddha-statue`($4,200) `murray-house`($1,800) `exhibition-center`($15,000) `ocean-park`($22,000) |

**其他（6）**：

| ID | 類型 | 備註／手機入口及驗收 |
|---|---|---|
| `road` | D | 建造 › 路政署 › 道路；點 A／B → 直線／橋草稿 → 確認；$10／格，橋按原有成本。M06、M07 |
| `zone-res` `zone-com` `zone-ind` | D | 建造 › 城規會；點兩角＋密度按鈕；共用 `getZonePlacementQuote`，按有效格／密度倍率／地區地價收費，跳過原有相同分區同低密度鎖定格。M06、M21 |
| `bulldoze` | T | 建造標題列 › 拆除；單格／框選＋建築／道路／設施／航線摘要；一般格 $5，特殊設施沿用原收費。碼頭／海鮮舫只確認一次；鐵路及電車拆除留 C，顯示未開放並拒絕確認。M11、M13 |
| `inspect` | Q | 建造標題列 › 查詢 → 點地圖資訊卡；直向亦可用。運輸模式嘅船／車追蹤留 C。M23 |

解鎖規則來源：`hud.js`、`tools.js` 及 `SPECIAL_BUILDING_UNLOCKS`，完整門檻列於下表。

**已核對嘅 Phase B 解鎖**（由 `getInfraPlacementLock`／`getSpecialBuildingUnlockState` 共用，手機顯示鎖定原因；確認時再驗證）：

| 工具 | 條件 |
|---|---|
| `power-coal`、`power-solar`、`power-nuclear`、`fire-station`、`police-station`、`hospital`、`primary-school`、`secondary-school`、`community-college`、`university`、`library`、`public-market` | 無人口／政策門檻；仍需合適位置及足夠資金 |
| `fish-market`、`seafood-restaurant`、`fish-loading-bay`、`yacht-club`、`gold-coast-hotel` | 無人口門檻；海事位置規則照舊，酒店另需附近遊艇會 |
| `legislative-council` | 人口 10,000，最多 1 棟 |
| `stock-exchange` | 人口 50,000、已有議會、`stockExchangeAct`，最多 1 棟 |
| `exhibition-center` | 人口 30,000，最多 1 棟 |
| `cultural-center` | 人口 20,000，最多 1 棟 |
| `space-museum` | 人口 15,000、`scienceDevelopment`，最多 1 棟 |
| `buddha-statue` | 人口 12,000，最多 1 棟 |
| `heritage-temple` | 人口 3,000，最多 4 棟 |
| `grand-temple` | 人口 12,000、吸引力 35，最多 1 棟 |
| `heritage-church` | 人口 5,000，最多 2 棟 |
| `indoor-coliseum` | 人口 30,000，最多 1 棟 |
| `football-stadium` | 人口 40,000，最多 1 棟 |
| `murray-house` | 吸引力 60，最多 1 棟 |
| `ocean-park` | `oceanParkDevelopmentProject` 議案獲批，最多 1 棟 |
| `airport` | `roseGardenAirportProject` 議案獲批，最多 1 棟 |
| `harbor` | 人口 15,000，並符合海岸線規則 |

### 1.3 Phase C（22 個；C1 已接駁 2 個，餘 20 個）

| ID | 類型 | 現有互動／依賴 | 手機方案 |
|---|---|---|---|
| `undersea-tunnel` | D | 兩岸拖曳；`placeUnderseaTunnel`（`undersea-tunnel.js:231`）；$30,000+ | 兩岸選點草稿，驗證後確認 |
| `metro-track` | D | 拖曳＋高度選單（`metro-surface.js:740`）；$500+/格 | 高度取草稿快照；成本顯示「待計算」 |
| `tram-track` | D | 沿路拖曳（`tram.js:304`）；$120 | 起終點草稿，保留道路依附規則 |
| `typhoon-shelter` | D | 水域框選；**Shift** 取消範圍；入口靠點擊（`main.js:1167`） | 加／減切換按鈕；多步規劃流程適配 |
| `dezone` | T | 逐格即時塗畫；免費 | 框選＋摘要 |
| `terrain` | T | 逐格塗畫；筆刷選單靠**長按**（`tool-menu.js:602`） | 明確筆刷選單按鈕；範圍草稿 |
| `power-line` | T | 逐格塗畫；$5 | 起終點／範圍草稿 |
| `tree` | T | 逐格塗畫（推斷）；$15 | 範圍草稿 |
| `promenade` | T | 逐格塗畫（推斷）；**右鍵**切換公眾碼頭（`main.js:1120–1125`）；$400 | 範圍草稿＋「碼頭」context 按鈕 |
| `park` | P | 選單選款式（`tool-menu.js:884`）；變體 `park-small`／`park-large` | 款式放工具選項 |
| `sports-ground` | P | 選單靠**長按**（`tool-menu.js:1064`） | 款式放工具選項 |
| `floating-restaurant` | P | **右鍵**轉向（`main.js:1111–1119`）；$20,000 | 「轉向」context 按鈕 |
| `bus-stop` | P | 直路兩側；$20／新增側 | **C1 已接駁**：A／B／兩側選擇、步行覆蓋、付款來源、預覽確認；沿用既有加建差額規則 |
| `district-sign` | P | 點擊放置；查詢時可改名；$250 | 放置確認；改名走資訊卡 |
| `bus-depot` | P | 3×3；$4,000；入口接路 | **C1 已接駁**：入口轉向、道路連接預覽、現有車廠免費轉向及車隊影響摘要；見 [驗證記錄](mobile-bus-validation.md) |
| `ferry-pier` | P | $2,500；拆除會連帶移除路線（`demolishFerryPierAt`） | 同 P；拆除摘要需提示 |
| `tram-stop` | P | $150 | 同 P |
| `metro-station` | P | 1×1 入口，鄰路；$15,000 | 同 P |
| `metro-surface-station` | P | 依高度；$8,000+ | 同 P＋高度選項 |
| `metro-line` | S | 逐站點選；$5,000 | 路線編輯模式 |
| `tram-line` | S | 逐站點選；$250 | 路線編輯模式 |
| `ferry-route` | S | 逐碼頭點選；$900 | 路線編輯模式 |

### 1.4 非工具項目

- `house`：`tool-menu.js`（116、261–266、541–585）仍有「房屋工具」長按選單代碼，但 `index.html` **已冇對應按鈕**，屬遺留路徑；Phase A 接管輸入時決定係移除定係保留。
- 巴士路線／班次、巴士公司：不在工具選單，走 `transport-ui.js` 面板（見第 3 節）。

## 2. 桌面專屬輸入依賴（必須有觸控替代）

| 依賴 | 位置 | 手機替代 |
|---|---|---|
| 右鍵拖曳＝平移（左鍵＝工具） | `main.js:1092`（按下）、`1187`（移動） | 單指平移 |
| 左鍵按下即生效 | `main.js:1083` | 預覽＋確認，`pointerdown` 零寫入 |
| `window` `pointerup` 一次過提交道路／分區／軌道／隧道／避風塘 | `tool-menu.js:60–110` | `build-session` 單一提交入口，owner＋pointerId |
| 逐格塗畫 | `main.js:1178` | 框選草稿 |
| hover 預覽／高亮（放置 guide、bus-stop、inspect） | `main.js:1198`（guide）、`1204`（inspect）、`1216`（bus-stop）、`shouldShowBuildingPlacementGuide`（`main.js:2088`） | 點選後顯示同一預覽 |
| 長按選單（分區密度、地形、運動場、遺留房屋） | `tool-menu.js:541–640`、`725–780`、`1064` | 明確按鈕，唔靠長按 |
| hover 展開工具分類 | `tool-menu.js:348`（`pointerenter`） | 點擊展開 |
| 右鍵特殊操作（浮動餐廳轉向、海濱步道碼頭） | `main.js:1111–1125` | context 按鈕 |
| Shift（避風塘切割範圍） | `main.js:1167` | 加／減切換 |
| 鍵盤：Space 暫停、熱鍵 | `main.js:1244`、`1688` | 頂欄暫停／速度鍵 |
| 滑鼠滾輪縮放 | `main.js:1238` | 雙指縮放（Phase A） |
| 拖曳視窗標題列 | `hud.js:519/570/635`、`main.js:1402`、`audio.js:222` 等 | 固定停靠面板，不要求拖動 |
| `title` tooltip／hover 說明 | 全域 | ⓘ 按鈕 |

另外：全專案 **冇** `pointercancel` 處理（只有視窗拖曳／小地圖有）、**冇** viewport meta、**冇** `safe-area-inset`／`dvh`，主頁僅 `touch-action: none` 用於小地圖（`index.html:2143, 2174`）。

## 3. 視窗／面板 → 手機入口

2026-11-12：下列原列 Phase C 嘅常用經營介面已按 Norton 指示提前接駁；實際驗證及未完成範圍見 [mobile-panels-validation.md](mobile-panels-validation.md)。地圖工具 Phase 分類不變。

| 現有 | 檔案 | 手機入口 | Phase |
|---|---|---|---|
| 城市名牌（改名）、日期／時間、天氣、KPI | `topbar.js`、`hud.js` | 頂部狀態列；改名放「更多」 | B |
| 速度鍵 | `topbar.js` | 頂欄 ⏸／速度 | B |
| 工具選單 | `tool-menu.js` | 建造庫（底部入口） | B |
| 地籍查詢、拆除推土 | `tool-menu.js` | 建造庫標題列快捷 | B |
| 建築／格子資訊 | `inspect-panel.js` | 資訊卡 | B |
| 主選單、讀檔、匯入 | `landing-screen.js`、`platform-ui.js` | 主選單（放大觸控尺寸） | B |
| 儲存失敗／唯讀提示 | `game-storage.js` | 對話框（含下載備份） | B |
| 財政視窗 | `hud.js` | 管理 › 財政 | 已接駁（其他介面批次） |
| 議會（政策、動議） | `council-ui.js` | 管理 › 議會與政策 | 已接駁（其他介面批次） |
| 股票交易所 | `hud.js`、`sim-economy.js` | 管理 › 股市 | 已接駁（其他介面批次） |
| 統計圖表 | `chart-window.js` | 管理 › 圖表 | 已接駁（其他介面批次） |
| 運輸公司（巴士／渡輪／地鐵／電車）、路線、站點、營運 | `transport-ui.js`、`ferry-ui.js`、`metro-ui.js`、`tram-ui.js` | 交通；原有管理及巴士選站已接駁，其他地圖建造仍待實作 | 部分接駁 |
| 車輛追蹤視窗（船／電車／列車） | `vehicle-tracker.js`、`transit-trackers.js` | 交通 › 追蹤；沿用同一相機及原視窗內容 | 已接駁，待真機驗收 |
| 圖層視窗、小地圖、地形小地圖 | `overlay-controls.js`、`city-minimap.js` | 圖層；11 個主題地圖已接駁，地形編輯小地圖仍待做 | 部分接駁 |
| 道路款式視窗 | `road-tile-set-window` | 更多 › 道路款式 | 已接駁（其他介面批次） |
| 唱機 | `audio.js` | 更多 › 音樂 | 已接駁（其他介面批次） |
| 說明、關於、AI 新聞設定、天氣圖例 | `help-dialog`、`about-dialog`、`ai-news-dialog`、`weather-legend-dialog` | 更多；放大對話框及控制尺寸 | 已接駁，待真機驗收 |
| 討論區、報紙、走馬燈（5.5.1 新增 💬 入口＋廣告） | `newspaper.js`、`hud-ticker.js` | 更多 › 討論區已接駁；紅點、報紙及通知整合仍待做；**走馬燈唔顯示於地圖** | 部分接駁 |
| 節慶通知（含「去睇」按鈕） | `festival-ui.js`、`#toast-container` | 通知列（位置待決定） | C |
| R/C/I 需求條、五格發展指數 | `hud.js` | 管理 › 概覽；點頂欄「資金」直達（**已決定**，不設常駐條） | B 已接駁 |
| 校正器（`*-calibrator.js`）、`tile-debug` | — | **不列入**（開發／桌面專用） | — |

## 4. 備註

- 工具總數以 `data-tool` 唯一 ID 計為 **60**（早前口頭講 89 係重複出現次數）。
- 此表隨 Phase B／C 更新；每完成一項，於「手機方案」欄補上實作檔案與測試案例（對應規格 M01–M24）。
