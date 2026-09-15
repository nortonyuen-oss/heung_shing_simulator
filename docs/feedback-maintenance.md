# 留言板管理

官網入口：`feedback.html`。留言及回覆儲存於本專案 GitHub Issues，官網只讀取標有 `website-feedback` 的公開紀錄。

## 玩家流程

1. 選類別、填標題／內容，可補遊戲版本及平台。
2. 官網整理內容，玩家到 GitHub 登入並確認提交；整理或複製不等於已發表。
3. 長文會提供完整文字供複製，避免 URL 過長截斷；截圖在 GitHub 提交時加入。
4. 官網可展開留言／回覆、切換處理狀態及翻頁。回覆在 GitHub 完成後，回來按重新整理。

## 開發者管理

- 用 GitHub Issues 回覆、關閉問題或重新開啟；官網跟隨 issue 的 open／closed 狀態，不把 closed 一律宣稱為已修復。
- `website-feedback` 標籤由 `.github/ISSUE_TEMPLATE/website-feedback.md` 自動加入；不要刪除該標籤或範本。
- 玩家用空白 issue 回報時，可由管理者補上該標籤，讓官網顯示。
- 可移除垃圾留言、鎖定討論，或按 GitHub 功能封鎖濫用者。請提醒玩家遮蔽個人資料及 API key。
- 官網每次讀取 20 筆，回覆按需載入及翻頁。匿名讀取受 GitHub API 配額影響，失敗時會顯示錯誤及 GitHub 直接連結；沒有背景輪詢。
- 官網不收集 GitHub 密碼／token、不寫入留言、不把私人憑證放進網頁，也不自行儲存填寫內容。帳號驗證及最後提交由 GitHub 完成。
- 公開留言以純文字呈現，避免執行留言中的 HTML；Markdown 圖片、附件與完整格式可到 GitHub 查看。

驗證：`node --test test/feedback-board.test.js test/docs-site-i18n.test.js`。新增翻譯時同步 `SITE_FEEDBACK` 四語文字。變更後由現有 GitHub Pages 流程部署 `docs/**`。
