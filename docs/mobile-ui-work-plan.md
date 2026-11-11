# 手機版（觸控介面）工作計劃

規格：`Heung_Shing_Mobile_UI_Spec_v1.0.md`（檔名 v1.0，內文為 **v1.1**；基線 `v5.5.0` / `cfddb80`）。本計劃以 **v5.5.1** 為基線，分支 `feature/mobile-ui`。規格定義「做乜、點驗收」，本文件定義「做嘅次序同進度」。

## 已確認決定（2026-11-11；2026-11-12 真機回饋修訂）

| # | 決定 |
|---|---|
| 1 | 自動切換跟規格：主要指標為**觸控（`pointer: coarse`）且 CSS 寬度 < 1100** → 觸控介面，其餘桌面；另有手動「自動／桌面／觸控」覆蓋（純看寬度會令窄視窗桌面玩家被誤切） |
| 2 | **直向及橫向均支援現有完整建造與管理功能**。2026-11-12 Norton 真機回饋要求直向維持日常手機操作邏輯；直向常駐底欄，建造確認列用兩行排版，保留相同預覽／微調／確認規則，不鎖方向 |
| 3 | 設計稿由開發方做 HTML/CSS 靜態稿，經 Norton 審批後才寫功能 |
| 4 | 先以「觸控介面（Beta）」手動啟用；真機驗收且無 P0 後才預設自動 |
| 5 | 版本號：minor（暫擬 5.6.0），發布時按 `release-update-checklist.md` 決定 |
| 6 | 走馬燈（含 5.5.1 嘅 💬 香城討論區入口同廣告）**只放「更多」**（紅點提示新帖），地圖上完全唔顯示 |
| 7 | **唔設**常駐 R/C/I 條；R/C/I 需求同五格發展指數放「管理 › 概覽」，點頂欄「資金」直達 |
| 8 | 橫向底部 5 入口（建造／交通／圖層／管理／更多）**預設收起**，底部中間一條收放條（可點區 176×44px）；開面板後自動收起，收放條顯示目前分頁；直向維持常駐底欄 |
| 9 | 四向微調鍵 138×138px，預設展開、可收合 |
| 10 | 手勢**跟規格**：單指拖動＝平移；雙指＝縮放＋平移；tap ≤ 300ms＝選取；**不需要長按**（建造草稿靠「點兩點＋確認」）。曾考慮「單指長按才拖動」，已撤回（規格亦提醒長按不應係唯一入口） |
| 11 | 2026-11-12 Norton 真機回饋：手機地圖移除「＋／－」縮放按鈕，使用雙指縮放；通知放頂部狀態列下方 4px，並避開安全邊界 |
| 12 | 2026-11-12 Norton 真機回饋：頂欄資金、人口及日期／天氣使用一致的兩行高度，標籤與數值分別對齊；完成當次修正及驗證後，先 commit 手機版分支再繼續 |

## 現況事實（影響工作量）

- `index.html` 無 viewport meta、無 `safe-area`／`dvh`；主輸入無 `pointercancel`／touch 處理；桌面操作為「右鍵拖曳平移、左鍵按下即生效」。
- 輸入提交分散：`main.js:1072–1245` 場景事件＋`tool-menu.js:60` 全域 `pointerup`。
- 60 個工具 ID、15+ 個浮動視窗；詳見 [mobile-tool-coverage.md](mobile-tool-coverage.md)。
- 現有桌面 UI 縮到 844×390：頂欄 179px（46%）、可見地圖約 25%，故不可「縮細桌面 UI」。
- 遊戲內介面語言只有 3 種（英／繁中／日），新字串三語齊備。
- 5.5.1 新增嘅 💬 香城討論區／走馬燈廣告：已決定只放「更多」（決定 6）。

## Phase 0 — 準備與決定 ✅（除簽核）

- [x] 開 `feature/mobile-ui` 分支（基線 5.5.1）
- [x] 工具覆蓋表：[mobile-tool-coverage.md](mobile-tool-coverage.md)（60 工具 × 互動類型 × Phase）
- [x] 視窗／面板 → 手機入口對照（同上第 3 節）
- [x] 桌面專屬輸入依賴盤點（同上第 2 節）
- [x] 5 個決定簽核
- [ ] 準備測試城市 fixtures：小城、大城（候選 347,865 人口）、交通＋夜景（記錄建築數、人口、交通量；Phase A 末前完成）

## Phase B0 — 設計稿（審批關卡）✅ 已凍結（2026-11-11）

- [x] 17 個橫向畫面＋4 個直向畫面＋現況對照：`scripts/mobile-ui-mockups/index.html`（用 Chrome 直接開；不屬遊戲代碼、不上線）
- [x] 第一輪回饋已套用：走馬燈移出地圖、R/C/I 移入管理概覽（畫面 11b）、橫向底欄收起＋收放條（畫面 2／2b）、手勢跟規格（決定 6–10）
- [x] **Norton 最終審批：已凍結（2026-11-11）**。Phase B 功能按凍結稿實作；之後如要改稿，須經 Norton 同意並更新本文件同設計稿（commit 標題 `docs: freeze mobile UI B0 mockups`）

**Gate 達成**：Phase B 可開始（待 Phase A 輸入安全完成後接駁）。

**2026-11-12 Norton 真機回饋修訂**：直向開放現有 Phase B 全部建造；右側面板背景貼齊螢幕邊緣，內容避開安全邊界，面板高度跟可見 viewport，底部收放條避開側欄。此修訂由 Norton 當次明確指示授權，已同步更新 B0 靜態稿嘅直向 P1／P5。

## Phase A — 輸入安全（規模 M，可與 B0 並行）✅ 實作完成，待你審閱

- [x] `ui-profile.js`：自動／桌面／觸控、偏好存設定（非城市資料）、`data-ui-profile` 根屬性、`uiprofilechange` 事件；載入時解析一次，旋轉／縮放視窗不重判。「自動」暫時等同桌面（`UI_PROFILE_AUTO_ENABLED=false`，Phase D 才開）；測試方法：`?ui=touch` 或 `setUiProfilePreference('touch')`
- [x] viewport meta（`viewport-fit=cover`）只在觸控 profile 動態加入，桌面 profile 保持原狀（避免今日用手機開遊戲嘅玩家被改動）；觸控 profile 下 `#game-container` 設 `touch-action: none`
- [x] `map-input-controller.js`：狀態機（idle／tapCandidate／pan／pinch／settling／uiCaptured）、pointerId 追蹤、tap 閾值 8px／300ms、單指拖＝平移、雙指＝縮放＋平移（決定 10，無長按）、三指重設基線、`pointercancel`／失焦／隱藏頁面／旋轉／切換 profile 只取消不提交；`setUiCaptured()` 供面板接管用
- [x] Phaser 唔再收到觸控：觸控 profile 下喺 `#game-container` capture 階段攔截 `touch*` 事件並 `preventDefault`（亦防瀏覽器補發滑鼠事件），所以工具、車輛追蹤、地區招牌等 Phaser 互動都唔會被手指觸發；滑鼠／觸控筆照舊
- [x] 提交所有權：`tool-menu.js` 全域 `pointerup` 忽略觸控 profile 下嘅手指放手；新增 `pointercancel` → `cancelPaintStroke()`（只清預覽同筆劃狀態，絕不提交；所有 profile 適用）。完整 owner／transaction 屬 Phase B 嘅 `build-session`
- [x] 雙指縮放：用 Phaser 3.60 鏡頭真實公式（`world = scroll + origin + (screen − origin)/zoom`）錨定；抽出 `onMapViewChanged()`（`setMapZoom` 行為不變）；每幀只更新一次；0.4–3
- [x] 面板／視窗拖曳唔穿透去地圖（煙霧測試驗證）
- [ ] 決定遺留 `house` 工具路徑（無按鈕）係移除定保留 — **留待 Phase B**（目前冇影響）
- [x] 測試：`test/ui-profile.test.js`（9）、`test/map-input-controller.test.js`（18）、`scripts/smoke-touch.js`（真實 Electron＋CDP 觸控，19 項）；覆蓋 M01–M05、M12、M17。844×390 版本留待 Phase B 觸控 UI 完成後再跑（現階段桌面 UI 會遮住地圖）

**實測結果**（真實 Phaser 鏡頭）：雙指縮放錨點誤差 0.00px（規格要求 ≤ 2px）；單指平移與手指位移一致；平移／縮放／輕點／`touchcancel`／面板上拖動，全部零城市變動（建路工具選取下亦然）；桌面滑鼠拖路照常。

**真機初步確認**（2026-11-11，iPhone Safari，同一 Wi-Fi 下用瀏覽器版 build 經 `?ui=touch` 開啟）：單指平移、雙指縮放手感正常。屬非正式檢查，Phase D 嗰個正式真機矩陣（iPhone／Android／iPad × Safari／Chrome）未開始；單點（tap）同拖到一半取消未測。

**發現（既有問題，未改）**：桌面滾輪縮放（`setMapZoom`）以 `scroll + screen/zoom` 計錨點，但 Phaser 鏡頭以畫面中心為原點縮放，所以每格滾輪錨點會偏離游標約 **75px**（1280px 寬、zoom 0.7→0.77 實測）。觸控縮放唔受影響（用正確公式）。是否修正桌面滾輪（會令滾輪縮放真正以游標為中心）— 待 Norton 決定，修正只需將 `setMapZoom` 改用 `mapCameraScrollForAnchor`。

**Gate**：縮放／取消／面板操作零城市變化 ✅；桌面操作無回歸 ✅；`npm test` 全過（commit 後確認）。

## Phase B — 可建造原型（規模 L，依賴 B0 凍結）— 原型已接駁，待真機驗收

- [x] `tool-actions.js`、`build-session.js`：`preview`（只讀）／`commit`（重新驗證）／`cancel`；草稿快照工具、密度、建築款式、起終點、城市 owner；同 id 只提交一次；位置／費用／拆除對象變動須重新審閱；`applyToolAt` 回傳 `{ ok, changed, cost }`
- [x] `placement-previews.js` 新增接收 tile／plan 嘅觸控預覽及 A/B 標記，唔使偽造 pointer；鏡頭縮放／視窗 resize 後重畫
- [x] 38 個 Phase B 工具入口：P 單點建築 32 個、`road`（含橋）、`zone-*`、`bulldoze`、`inspect`；密度及地區地價共用實際收費規則，解鎖見覆蓋表
- [x] `mobile-ui.js`＋`mobile-ui.css`（`[data-ui-profile="touch"]`）：44px 頂欄、底部 5 入口、側欄、兩層建造庫、確認列、138×138px 四向微調、A/B 切換、密度／框選控制；微調支援四個地圖方向
- [x] 主選單／讀檔／匯入匯出入口放大；直向與橫向均支援建造／查詢／管理／存檔，直向建造保留常駐底欄，取消／確認各佔一個完整按鈕位置；主選單、桌面設定及「更多」提供自動／桌面／觸控（Beta）切換，仍然 opt-in
- [x] `build-session.test.js`、`tool-actions.test.js` 及 `scripts/smoke-mobile-build.js`；Electron 及靜態網頁共用操作驗證腳本，輸出截圖至 `.data/mobile-phase-b/`；驗收細節見 [mobile-phase-b-validation.md](mobile-phase-b-validation.md)
- [x] 遺留 `house` 保留桌面路徑，觸控建造庫不暴露
- [ ] Norton 真機驗收；Phase 0 嘅大城／交通夜景 fixtures 仍待補齊

**範圍說明**：交通及圖層入口暫顯示後續觸控更新提示；「管理」先提供 R/C/I 同五項指數概覽，其他經營面板留 Phase C。拆除已支援一般建築／道路／樹木／分區，以及海鮮舫、渡輪碼頭（連航線摘要）、步道、海底隧道及未被路線使用嘅地鐵站；鐵路／電車拆除暫拒絕確認，待 Phase C 補齊整段路軌及路線影響摘要。一次範圍操作只經手機確認列確認，不再逐個碼頭／海鮮舫彈桌面 confirm。

**Gate（尚未簽核）**：自動化已完成「新城市 → 起路 → 分區 → 建築 → 存檔 → 重開」；真機及包含 safe-area 嘅可用地圖比例仍需正式驗收，不能以桌面模擬取代。B0 嘅 44px 頂欄＋44px context＋56px 確認列在 844×390 留下 63.1% 畫布高度；浮動微調另佔局部空間，須真機量度整體可用範圍 ≥ 60%。手機「＋／－」縮放按鈕已按 2026-11-12 回饋移除。

## Phase C — 完整經營（規模 XL）

- [ ] Phase C 22 個工具（見覆蓋表 §1.3）：地鐵／電車軌、海底隧道、避風塘、地形／電線／樹木／步道、右鍵特殊操作、路線編輯
- [ ] 交通面板（`transport-ui.js`）、車輛追蹤、財政、議會、股市、圖表、圖層／小地圖、資訊卡、設定、討論區／走馬燈／報紙／節慶通知
- [ ] 面板 host：單一主面板、返回堆疊、捲動／選項保留、無重複 id、reduced motion
- [ ] 所有 hover／長按／右鍵／Shift 依賴改明確按鈕；tooltip 改 ⓘ
- [ ] 無障礙（VoiceOver／TalkBack）、對比 4.5:1、三語長字串
- [ ] 覆蓋表 100%；未支援項目明確標示

**Gate**：M08–M10、M18、M22、M24 通過。

## Phase D — 發布驗收（規模 M）

- [ ] 真機矩陣：iPhone Safari、Android Chrome、iPad Safari＋桌面 Chrome／Firefox／Safari／Edge＋Electron
- [ ] 效能：中位 ≥ 30 fps（60 秒）、觸控到預覽 p95 ≤ 100ms、15 分鐘持續遊玩；先量度再決定畫質，不降模擬頻率
- [ ] 背景恢復（暫停並保留速度）、IndexedDB 寫入鎖重取、quota／唯讀提示、跨裝置匯出匯入、更新流程（M14–M16）
- [ ] CI：`build-installers.yml` web job 加手機 smoke
- [ ] 文檔：驗收記錄、`web-release-spec.md`、README、使用手冊／官網指南、三語 changelog
- [ ] 以「觸控介面（Beta）」發布；P0 = 0 後才預設自動

## 只有 Norton 做到嘅事

- B0 設計稿審批；Phase B／D 真機測試（iPhone、Android、iPad）。
