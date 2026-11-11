# 手機版（觸控介面）工作計劃

規格：`Heung_Shing_Mobile_UI_Spec_v1.0.md`（檔名 v1.0，內文為 **v1.1**；基線 `v5.5.0` / `cfddb80`）。本計劃以 **v5.5.1** 為基線，分支 `feature/mobile-ui`。規格定義「做乜、點驗收」，本文件定義「做嘅次序同進度」。

## 已確認決定（2026-11-11）

| # | 決定 |
|---|---|
| 1 | 自動切換跟規格：主要指標為**觸控（`pointer: coarse`）且 CSS 寬度 < 1100** → 觸控介面，其餘桌面；另有手動「自動／桌面／觸控」覆蓋（純看寬度會令窄視窗桌面玩家被誤切） |
| 2 | 首版**橫向**完整建造；直向只做載入、存檔、查詢、管理，不鎖方向 |
| 3 | 設計稿由開發方做 HTML/CSS 靜態稿，經 Norton 審批後才寫功能 |
| 4 | 先以「觸控介面（Beta）」手動啟用；真機驗收且無 P0 後才預設自動 |
| 5 | 版本號：minor（暫擬 5.6.0），發布時按 `release-update-checklist.md` 決定 |
| 6 | 走馬燈（含 5.5.1 嘅 💬 香城討論區入口同廣告）**只放「更多」**（紅點提示新帖），地圖上完全唔顯示 |
| 7 | **唔設**常駐 R/C/I 條；R/C/I 需求同五格發展指數放「管理 › 概覽」，點頂欄「資金」直達 |
| 8 | 橫向底部 5 入口（建造／交通／圖層／管理／更多）**預設收起**，底部中間一條收放條（可點區 176×44px）；開面板後自動收起，收放條顯示目前分頁；直向維持常駐底欄 |
| 9 | 四向微調鍵 138×138px，預設展開、可收合 |
| 10 | 手勢**跟規格**：單指拖動＝平移；雙指＝縮放＋平移；tap ≤ 300ms＝選取；**不需要長按**（建造草稿靠「點兩點＋確認」）。曾考慮「單指長按才拖動」，已撤回（規格亦提醒長按不應係唯一入口） |

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

## Phase B0 — 設計稿（審批關卡）🟡 待最終審批

- [x] 17 個橫向畫面＋4 個直向畫面＋現況對照：`scripts/mobile-ui-mockups/index.html`（用 Chrome 直接開；不屬遊戲代碼、不上線）
- [x] 第一輪回饋已套用：走馬燈移出地圖、R/C/I 移入管理概覽（畫面 11b）、橫向底欄收起＋收放條（畫面 2／2b）、手勢跟規格（決定 6–10）
- [ ] **Norton 最終審批**（其餘畫面有冇要改）
- [ ] 凍結稿（Phase B 功能按凍結稿實作）

## Phase A — 輸入安全（規模 M，可與 B0 並行）

- [ ] `ui-profile.js`：自動／桌面／觸控、偏好存設定（非城市資料）、`data-ui-profile` 根屬性、profile 變更事件
- [ ] `index.html` viewport meta（`viewport-fit=cover`）；僅 canvas 設 `touch-action: none`
- [ ] `map-input-controller.js`：狀態機（idle／tapCandidate／pan／pinch／uiCaptured）、pointerId 追蹤、tap 閾值 8px／300ms、單指拖＝平移、雙指＝縮放＋平移（決定 10，無長按）、`pointercancel`／失焦／旋轉／切換模式只取消不提交
- [ ] Phaser 增加 touch pointers；舊 handler（`main.js:1072–1238`）忽略已被接管嘅觸控
- [ ] 接管 `tool-menu.js:60` 全域 `pointerup` 提交（道路／分區／軌道／隧道／避風塘）→ 有 owner／transaction；觸控 `pointerdown` 零寫入
- [ ] 雙指縮放：DOM→canvas 座標、`getWorldPoint` 錨點、抽出 `onMapViewChanged()`（`setMapZoom` `main.js:1645`）；0.4–3、誤差 ≤ 2px
- [ ] 面板／滑桿／視窗拖曳／小地圖唔穿透去地圖
- [ ] 決定遺留 `house` 工具路徑（無按鈕）係移除定保留
- [ ] 測試：`map-input-controller.test.js`、`ui-profile.test.js`、Chromium touch smoke（844×390）；案例 M01–M05、M12、M17

**Gate**：縮放／取消／面板操作零城市變化；桌面操作無回歸；`npm test` 全過。

## Phase B — 可建造原型（規模 L，依賴 B0 凍結）

- [ ] `tool-actions.js`、`build-session.js`：`preview`（只讀）／`commit`（重新驗證）／`cancel`；同 id 只提交一次；`applyToolAt` 回傳標準化
- [ ] `placement-previews.js` 接受 tile／plan，唔使偽造 pointer
- [ ] 先支援：P 單點放置建築（32 個）、`road`、`zone-*`、`bulldoze`、`inspect`
- [ ] `mobile-ui.js`＋scoped CSS（`[data-ui-profile="touch"]`）：頂欄、底部 5 入口、側欄、建造庫（兩層）、確認列、四向微調、context 控制
- [ ] 主選單／讀檔／匯入匯出入口放大；直向基本導航＋橫向提示
- [ ] 測試：`build-session.test.js`；案例 M06、M07、M11、M13、M19–M21、M23

**Gate**：真機完成「新城市 → 起路 → 分區 → 建築 → 存檔 → 重開」；預覽時地圖可用區 ≥ 60%；無 P0。

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
