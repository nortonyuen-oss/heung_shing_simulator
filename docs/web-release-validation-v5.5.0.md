# v5.5.0 發布驗收記錄

版本主題：【香城最大模擬器 正式上線！】；資料格式 15，支援可攜匯入 14／15。

## 本機驗證

2026-11-09，macOS 15.7.5、Chrome 156、Firefox 153.0 及真實 Safari 18.6；使用沒有遊戲 Node API 的純靜態 HTTP 伺服器。

- `npm test`：1,224 項通過，0 失敗；包含 IndexedDB 實際資料往返、單一寫入者、版本備份、可攜存檔驗證、桌面 SQLite 往返及 SQLite 統計去重／每日上限。
- `npm run check:legal`：通過。
- Chrome：新城儲存、重新載入、讀取、實際下載及透過檔案選擇器重複匯入新槽通過；沒有 `/api/saves`／`/api/terrains` 請求，沒有遺失素材或未捕捉錯誤。
- 最終受控網絡測試：伺服器端全域限制 20 Mbps、回應延遲 100 ms，計算所有實際回應 body（包括 service worker 的請求）。主選單完整 ready 16.992 秒；新城市可遊玩 17.697 秒／25.09 MiB；背景必要請求完成後共 29.70 MiB，低於 40 MiB 預算。
- 同版本暖啟動：伺服器總傳輸 0.0686 MiB（約 70 KiB），圖片及音樂 body 重傳為 0；道路選擇縮圖亦改用內容 hash。較早頁面 target 的 CDP 11.72 MiB 僅是部分觀測，不能代替包含 service worker 的總量。
- 主選單「5 秒完整 ready」的目標未達；新城市「25 秒可玩」目標已達。以上是本機受控測試，正式 CDN、裝置及大型城市載入時間仍會不同。
- 主選單及暫停大城市各停留 30 分鐘：頁面 CDP 無額外模型／音樂下載及錯誤；版本檢查屬少量控制請求，不宣稱整個瀏覽器零請求。暖重開、離線重開及 IDB 城市保留通過。
- Safari 18.6：實際 IndexedDB 儲存、重開及下載 `.heungshing` 檔通過；原生下載權限亦透過真實 Safari 驗證。
- Safari 18.6：經 `File`／`DataTransfer` 及實際匯入介面載入桌面匯出的城市通過；點擊啟動後 AudioContext 為 `running`、按需載入的 `music_0` 正常播放。原生選檔的 WebDriver 指令曾停頓，原生檔案選擇另由 Chrome／Firefox 驗證，沒有把該自動化停頓當作 Safari 原生選檔通過。
- Firefox 153.0：建立、儲存、重開、實際下載及選檔匯入通過。驗收期間修正對話框下 IndexedDB 交易與操作 Promise 的完成順序。
- `node scripts/smoke-web-safety.js`：以真實 Chrome／service worker 驗證等待更新提示、不強制重載、第二分頁阻止啟用、確認後切換及原城市保留；實際 IndexedDB quota 重試只清素材 cache、交易中止沒有部分寫入、IDB 不可用時明確標示暫存。此檢查亦納入 CI。
- 大城市：載入既有展示城市 fixture，1,935 幢建築、347,865 人口；日夜建築、港口及公園畫面驗證正常。
- 隔離統計端點：停留標題頁 11 秒不計；前景城市滿 10 秒後一次事件；同分頁 reload 後不重複。事件只有 `eventType`、`eventId`、`gameVersion`，沒有城市或身份資料。測試沒有向正式統計增加人次。
- 官網：四語、由發布 metadata 取得的 Play／下載連結、GitHub API 不可用時的入口，以及統計失敗的舊值／無資料顯示通過。官網讀取不會增加遊玩人次。
- Electron 實際 renderer：獨立 user-data profile 匯入網頁下載檔、SQLite 儲存及原生下載再次匯出的完整城市比對通過；沒有 renderer exception，未使用現有玩家 profile。
- 主選單匯入按鈕：修正白色背景遮住文字；英語雙行、中文中英雙語及日文日英雙語均以實際 DOM、原生點擊及截圖驗證。現有 i18n／載入及道路顯示相關檢查通過。

## 候選 CI

[候選建置 42641410871](https://github.com/nortonyuen-oss/heung_shing_simulator/actions/runs/42641410871)（`1e7d98d`）全部通過：完整測試、共用模型、macOS arm64／x64、Windows 及網頁瀏覽器 smoke。此 run 沒有發布。其後驗收修正由正式 tag workflow 再完整測試及建置；新流程另加入真實 Windows Edge 存檔及下載門檻。

首次正式候選的四款桌面包均已產出；網頁 smoke 發現測試的 async predicate 提早結束，匯入尚未完成就離線重開。已改為在 Node 端等待實際的兩個已提交存檔槽，並以刻意延遲 `File.text()` 2 秒的完整流程驗證通過。此修正會納入尚未建立公開 Release 的 v5.5.0 候選。

Cloudflare 隔離項目已實測 A → B → A 及 IndexedDB 原城市保留。首次 assets-only 項目曾回 404；加入僅處理未命中路徑的入口後正常，切回純靜態亦正常。正式設定採靜態優先（`run_worker_first: false`），已有素材仍由 Cloudflare 直接提供，未命中才回 404；線上驗證會等待正確 commit 傳播，不接受舊版即報成功。未在正式網址部署佔位頁。

## 發布設定

- 穩定遊戲 origin：`https://heung-shing-play.nortonyuen.workers.dev`。瀏覽器存檔屬於此 origin；本次不更換域名。
- 官方網站：`https://nortonyuen-oss.github.io/heung_shing_simulator/`。
- 統計服務：`https://heung-shing-statistics.nortonyuen.workers.dev`；D1 已建立並套用 migration；部署不重設累計。
- GitHub Actions `CLOUDFLARE_API_TOKEN` 已由帳戶持有人設定；不把 token 複製到原始碼或前端。
- GitHub Pages environment 已允許 `v*.*.*` tag 發布。
- CI 以同一份準備好的模型供應三組桌面及網頁建置；只有所有建置成功的 tag 才進入發布。

## 發布門檻及限制

本記錄不是已發布聲明。候選 CI、正式 tag、產出 commit／hash、正式網址 smoke check，以及後續效能與跨平台檢查結果會隨驗收更新。

第一版為桌面瀏覽器操作介面；沒有帳戶／雲端存檔。清除網站資料、無痕模式或換瀏覽器不會自動保留城市，玩家須下載備份並在另一裝置匯入。網頁不提供桌面版的 AI、即時海域及內嵌遠端論壇功能。macOS 沿用現有未簽署安裝包政策。
