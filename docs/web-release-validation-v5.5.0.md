# v5.5.0 發布驗收記錄

版本主題：【香城最大模擬器 正式上線！】；資料格式 15，支援可攜匯入 14／15。

## 本機驗證

2026-11-09，macOS，Chrome 及真實 Safari 18.6；使用沒有遊戲 Node API 的純靜態 HTTP 伺服器。

- `npm test`：1,223 項通過，0 失敗；包含 IndexedDB 實際資料往返、交易失敗、單一寫入者、版本備份、可攜存檔驗證及 SQLite 統計去重／每日上限。
- `npm run check:legal`：通過。
- Chrome：新城儲存、重新載入、讀取、實際下載及透過檔案選擇器重複匯入新槽通過；沒有 `/api/saves`／`/api/terrains` 請求，沒有遺失素材或未捕捉錯誤。
- Chrome 冷啟動實測約 11.72 MiB；完成儲存、重開、下載及匯入合計約 11.93 MiB，CDP `encodedDataLength` 計算實際傳輸量。此為本機網絡結果，正式 CDN 及受控網速結果另行記錄。
- Safari 18.6：實際 IndexedDB 儲存、重開及下載 `.heungshing` 檔通過；原生下載權限亦透過真實 Safari 驗證。
- 官網：四語、由發布 metadata 取得的 Play／下載連結、GitHub API 不可用時的入口，以及統計失敗的舊值／無資料顯示通過。官網讀取不會增加遊玩人次。

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
