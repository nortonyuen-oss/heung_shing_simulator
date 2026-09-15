# 香城連儂牆管理

官網入口：`feedback.html`（頁面名稱【香城連儂牆】）。留言及回覆儲存於 Cloudflare D1，由 `services/feedback` 嘅 Worker 提供 API；官網（GitHub Pages）只係靜態前端，透過 `feedback-config.js` 入面嘅公開 API 地址讀寫。玩家毋須登入。

## 架構

- 前端：`docs/feedback.html`、`feedback.js`、`feedback.css`、`feedback-config.js`。四語文案位於 `docs/i18n.js` 嘅 `SITE_FEEDBACK` 同 `SITE_MEMO_WALL`。
- 後端：`services/feedback/worker.mjs`（Cloudflare Worker）＋ D1 資料庫 `heung-shing-feedback`（schema 喺 `migrations/`）。
- 生產地址：`https://heung-shing-feedback.nortonyuen.workers.dev`；Cloudflare 帳號 `nortonyuen@gmail.com`，wrangler 憑證存於本機 `~/Library/Preferences/.wrangler/config/default.toml`。
- API：`GET /messages?state=all|open|closed&page=N`、`GET /messages/:n/replies?page=N`、`POST /messages`、`POST /messages/:n/replies`、`GET /health`。每頁 20 筆。
- 保護：只接受 `ALLOWED_ORIGINS`（`wrangler.jsonc`）嘅 Origin；請求體上限 32 KB；標題 120 字、內容 6000 字、暱稱 40 字。
- 寫入限制：同一 IP 每分鐘最多 1 次、每小時最多 5 次（留言同回覆一齊計），由 D1 嘅 `write_log` 精確計數；數值喺 `wrangler.jsonc` 嘅 `WRITES_PER_MINUTE`／`WRITES_PER_HOUR` 調整後 deploy 即生效。另有 Cloudflare rate-limit binding（10 次／分鐘，各節點分開計）做前置防洪。前端每次提交帶 `requestKey`，重送同一內容會直接回傳已儲存嘅紀錄，唔會重複貼上亦唔計入限制。
- 紙色（0–5）由後端喺建立時隨機分配並儲存，換語言、翻頁都唔會變。

## 玩家流程

1. 填暱稱（選填）、類別、標題、內容，可補遊戲版本及平台，按「貼上留言」即時貼上牆並捲到新卡片。
2. 展開任何一張 memo 可讀全文、回覆，並直接喺卡片內寫回覆。
3. 「處理狀態」篩選 open／closed；「重新整理」重新讀取。
4. 未接駁後台時（`FEEDBACK_API_URL` 為空）表格會停用並顯示提示；後端故障時顯示錯誤，冇背景輪詢。

## 開發者管理

喺 `services/feedback` 執行（首次先 `npm install`）：

- `npm run moderate -- list [open|closed]`：最近 40 張 memo 同回覆數。
- `npm run moderate -- show 12`：單張 memo 及全部回覆。
- `npm run moderate -- close 12` ／ `reopen 12`：標記已處理／重開。closed 仍然公開，只係篩選狀態唔同，唔代表已修復。
- `npm run moderate -- delete 12`：移除 memo 及其回覆；`delete-reply 5` 只刪一則回覆。
- `npm run tail`：即時睇 Worker 日誌。`wrangler d1 execute heung-shing-feedback --remote --command "..."` 可以直接落 SQL。

部署：

- `IP_SALT` 係 Worker secret（`npx wrangler secret put IP_SALT`，隨機字串即可）；本地 `wrangler dev` 用 `.dev.vars`（已 gitignore）提供。
- 改 `worker.mjs` 或 `wrangler.jsonc` 後 `npm run deploy`。新增 migration 檔後 `npm run migrate`（生產）；本地開發用 `wrangler d1 migrations apply heung-shing-feedback --local` 再 `npm run dev`。
- 本地測前端可以 `npx wrangler dev --var ALLOWED_ORIGINS:http://127.0.0.1:8765`，再另外用靜態伺服器開 `docs/`，並臨時將 `feedback-config.js` 指向 `http://127.0.0.1:8787`（唔好 commit）。
- 加新網域時更新 `wrangler.jsonc` 嘅 `ALLOWED_ORIGINS`（逗號分隔）再 deploy。

私隱與內容：

- 後端只儲存玩家填寫嘅文字、類別、時間同隨機 `requestKey`；唔設 cookie、唔用任何第三方追蹤。寫入限制只保存 IP 經 `IP_SALT` 加鹽嘅 SHA-256 雜湊，最多保留 1 小時就自動清走，資料庫入面冇原始 IP。
- 留言以純文字呈現，唔會執行留言入面嘅 HTML。
- Cloudflare Workers／D1 免費額度：每日 10 萬次請求、5 GB 儲存；留言板規模遠低於此。

驗證：`node --test test/feedback-board.test.js test/docs-site-i18n.test.js`（Worker 邏輯用 `node:sqlite` 模擬 D1 直接測試）。新增翻譯時同步 `SITE_FEEDBACK` 四語文字。變更 `docs/**` 後由現有 GitHub Pages 流程部署。
