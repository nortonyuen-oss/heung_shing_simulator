# 授權盤點報告

日期：2026-09-15。盤點基準：工作樹版本 4.9.0、起始 Git HEAD `2677733`、`package-lock.json` v3、Git 追蹤資源、目前本機安裝套件及官方條款。

## 1. 核心判斷

套件結構初步容許採專有遊戲授權。**這不等於目前全部內容已可商業發行。** 最主要缺口是 Suno 免費方案音樂的用途限制、Google 海岸線資料集未識別、天文台出版物衍生資料與部分素材的來源確認。

開發者已選擇保留程式及原創素材商業權利；已陳述背景音樂來自 Suno 免費方案、模型由 OpenAI 產生、天氣圖示參考天文台、海岸線來自 Google 開放數據、其他聲音自行錄製。這些陳述已記入登記表，但不能代替第三方合約或逐檔證據。

## 2. 套件與執行環境

| 元件 | 實際鎖定版本 | 授權／處理 |
| --- | --- | --- |
| express | 4.22.2 | MIT，正式依賴；隨副本保留版權及完整許可文字 |
| electron-updater | 6.8.9 | MIT，正式依賴；連同傳遞依賴保留標示 |
| electron | 39.8.10 | MIT；雖列 devDependencies，執行環境會隨桌面版散布；不能漏掉 Chromium、Node.js 與其他內含元件的通知 |
| electron-builder | 26.8.1 | MIT，建置工具；另核對安裝程式使用或帶入的元件 |
| sharp | 0.34.5 | Apache-2.0，建置用；其跨平台原生依賴另有 LGPL-3.0-or-later 等複合授權 |
| Phaser | 3.60.0 | `index.html` 從 jsDelivr 載入，未列入 lockfile；框架為 MIT，需追蹤精確發行檔與內嵌第三方程式 |
| SQLite | 隨 Node／Electron 執行環境 | `db.js` 使用 `node:sqlite`，不是另裝 npm sqlite 套件；隨執行環境追蹤其實際授權通知 |
| Ollama Cloud／雲端模型 | 使用者選用 | 原始碼顯示透過服務呼叫，README 說明未封裝模型；呼叫服務與散布模型權重的義務不同 |

Phaser 官方列為 MIT；公開原始碼但無開源授權，不代表授予概括使用權，惟 GitHub 平台條款仍可能容許檢視與平台內 fork。[Phaser 授權](https://phaser.io/download/license)、[GitHub 授權說明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。

lockfile 共 **408 筆套件路徑紀錄**，含重複路徑版本及跨平台可選套件，不等於安裝包內有 408 套程式。其中 **84 筆未標記 dev**，其授權宣告為 MIT、ISC、BSD-3-Clause、Python-2.0、BlueOak-1.0.0。

| lockfile 授權宣告 | 筆數 |
| --- | ---: |
| MIT | 310 |
| ISC | 39 |
| Apache-2.0 | 18 |
| LGPL-3.0-or-later | 10 |
| BlueOak-1.0.0 | 8 |
| BSD-2-Clause | 7 |
| BSD-3-Clause | 6 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| Python-2.0 | 1 |
| WTFPL OR ISC | 1 |
| WTFPL | 1 |
| 0BSD | 1 |
| (MIT OR CC0-1.0) | 1 |
| (WTFPL OR MIT) | 1 |

14 筆含 LGPL 宣告的紀錄都標為 dev，屬 sharp 相關原生建置依賴。圖片經工具處理，一般不會因此變成 LGPL；如果把該工具／函式庫或其受保護程式散布出去，則須另行履行相應義務。`dev` 標記不是最終證據，仍要檢查每個安裝包。[GNU 工具與輸出說明](https://www.gnu.org/licenses/gpl-faq.en.html#CanIUseGPLToolsForNF)。

本機抽查 Windows 與 macOS arm64 的 `app.asar`，內部版本其實都是 **3.7.2**：未見 sharp／`@img`，各有 81 筆名稱符合 LICENSE／NOTICE／COPYING 的路徑，根層未見遊戲授權通知。這只能佐證舊包，**不能證明 4.9.0 或未來安裝包已合規**。本機 Electron 39.8.10 的 `dist/LICENSE` 及 `dist/LICENSES.chromium.html` 存在；Windows 舊包也存在相應檔案。

`npm-runtime-notices.txt` 彙整已安裝正式依賴的根層授權文件；cookie-signature 的許可在 Readme 內。lazy-val 只有 package metadata 的 MIT 宣告，未附完整授權檔／README 許可段落，仍要從精確上游版本補原文。套件自身文件中藏於子目錄的附加元件，與 CDN bundle 內嵌庫，仍需發行檔審查。

## 3. 媒體與資料範圍

目前 Git 追蹤 **613 個媒體檔案**：Models 352、Music 9、Sounds 9、UI 99、build 3、docs 53、Kenney 62、newRoadTiles 26。計數含母檔、縮圖、格式變體及未載入素材，不是 613 個獨立作品；舊 `docs/asset-inventory.md` 的 145 是不同時間與範圍，不能拿來當本次全素材總數。

### A. Suno 音樂：先處理商用與再授權缺口

查核時生效條款為 2026-09-03 版：Free／Basic 輸出限個人非商業用途；商用須取得符合方案配額及官方管道的 permitted Download，Remix 另有限制。免費遊戲不等於必然符合「個人」使用，更不能據此概括允許遊戲散布、廣告、付費版、贊助宣傳或玩家營利實況。[Suno 條款](https://suno.com/terms)。

新 FAQ 表示下載規則涵蓋舊曲庫，付費訂閱者下載的歌曲帶有商用權。因此不採用「升級絕不可能授權舊曲」的過時概括說法，也不把「已升級」直接當成目前 repository 九個檔案已獲授權。逐曲核對是否為自己的非 Remix 輸出、適用方案、官方商用下載資格、下載紀錄及遊戲內散布／玩家影片用途；帳戶紀錄不明時取得 Suno 對指定歌曲和用途的書面確認。[Suno 2026 年變更 FAQ](https://help.suno.com/en/articles/13614785)。

方案：取得足夠許可後保留歌曲；或以明確可商用且允許遊戲與影片用途的委製／自製音樂替換。未清除前不將這九首列入商業發行白名單。不替使用者訂閱、不擅自刪除歌曲；本次只完成盤點與規範設計。

### B. OpenAI 模型：使用權與排他保護分開

個人服務條款在法律容許範圍內把 OpenAI 對輸出的權利轉予使用者，但輸出可能不獨特，第三方輸出與他人輸出不在該轉讓內；輸入參考素材也須有權使用。不能承諾每張 AI 圖都能以著作權排除他人使用。保存人工編排、修圖及程式整合紀錄；避免把 AI 產出描述為完全人工繪製。若實際用 API／企業服務，應查該帳戶的相應合約。[OpenAI 個人服務條款](https://openai.com/policies/row-terms-of-use/)。

### C. 天文台資料與圖示：三種來源分開

1. 日月出沒 CSV：已找到 DATA.GOV.HK 對應資料集。平台條款容許符合條件的商業與非商業利用，包含來源與權利人標示等義務；不是 CC0。[日出資料集](https://data.gov.hk/en-data/dataset/hk-hko-rss-times-of-sunrise-suntransit-sunset)、[月出資料集](https://data.gov.hk/en-data/dataset/hk-hko-rss-times-of-moonrise-moontransit-moonset)、[使用條款](https://data.gov.hk/tc/terms-and-conditions)。
2. 曙暮光：同步腳本硬編碼年曆表格並做插值。出版物商業用途條件要求事前書面授權，不能用 CSV 開放條款直接涵蓋年曆；需核對實際出版物條款、取得許可或改用獨立天文計算。計算採用的演算法／程式也要有可用授權。[天文台出版物商業使用條件](https://www.hko.gov.hk/en/publica/commercialuse.htm)。
3. 警告圖示：「參考」尚不足以分辨獨立設計、改作或複製。官方另有資料、圖像及氣象產品的權利聲明，不應把網站所有圖片當成開放資料；應對照實際圖源查明。[天文台氣象資料公告](https://www.hko.gov.hk/en/metinfo/copyright-notice.html)。

### D. Google Earth 海岸線：工具引入不等於開放授權

開發者其後確認記憶中的來源是 Google Earth，由 Codex 引入。檢查檔案及 Git 歷史（`926ff4c`、`7fb1310`）仍未找到原始網址或圖層識別，所以無法確認是否為 Google 本身內容、使用者匯入資料或其他資料集。

Google Earth 有獨立服務條款，限制複製、再散布及以其內容建立產品，並有特定許可例外；官方使用指引也限制 Google Earth 內容的商業／宣傳用途。不能把「Codex 自己用的」視為有權商用，也不能只補 Google 署名便認定已解決。若後續證據顯示實際為 Earth Engine 的第三方資料集，應改查該資料集的供應者條款；Google Earth 與 Earth Engine 不是相同產品。[Google Earth 條款](https://www.google.com/help/terms_maps-earth/)、[官方地理內容使用指引](https://about.google/brand-resource-center/products-and-services/geo-guidelines/)、[Earth Engine 資料目錄](https://developers.google.com/earth-engine/datasets)。

可考慮以 Natural Earth 公共領域資料重新建立遮罩，保存來源版本與生成腳本。其 1:10m 海岸線適合先評估世界／城市概略輪廓，**10m 指一千萬分之一比例尺，不是 10 公尺解析度**；小島、港口與填海地貌需另驗證適用性，不保證能直接替代現有細節。本次尚未替換地圖。[Natural Earth 使用條款](https://www.naturalearthdata.com/about/terms-of-use/)、[海岸線資料](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-coastline/)。

### E. Kenney、Unsplash、自錄聲音與其他內容

- Kenney Isometric Roads 官方為 CC0，可用於商業與非商業內容；原始 CC0 素材不因整合進本遊戲而成為開發者獨占。需要比對本地修改與原始檔，不憑目錄名認定每張都來自上游。[Kenney 原始產品頁](https://kenney.nl/assets/isometric-roads)、[CC0 說明](https://creativecommons.org/publicdomain/zero/1.0/)。
- `Models/landscape/natural/manifest.json` 出現 Unsplash 材質名稱。Unsplash 通常允許商業利用，但有獨立圖片販售與競爭服務等限制，仍須核對精確照片及適用版本；實際輸出是否用了該材質要由 assignments 追溯。[Unsplash 授權](https://unsplash.com/license)。
- 自錄聲音可有自己的錄音權利，但錄到既有旋律、廣播、他人表演等可能涉及額外權利；冰淇淋車音樂是明確值得追溯的例子。
- `Models/aircraft` 的 cathy／UO 命名、地標、人物新聞圖與遊戲中的文化引用要逐項確認；僅憑檔名不判定侵權或授權已清除。
- CSS 有字型名稱，但未找到被 Git 追蹤的字型檔或 Google Fonts 載入設定。系統字型引用不等於隨遊戲分發字型；將來加入字型檔需另登記。

## 4. 既有網站承諾

盤點時的 `docs/index.html` 及 `docs/i18n.js` 四種語言已有免費分享、註明出處即可等文字。此次發布已區分「分享官方連結」「分享影片」「重新散布安裝包」，但不主張加一份 LICENSE 就撤回過去依法有效授予的權利。歷史頁面可由 Git 記錄追溯；新規範只適用於包含條款的新原始碼版本及發行包。

## 5. 審查邊界

已檢查原始碼引用、檔名、metadata、套件授權及兩個舊安裝包；未逐張進行視覺相似性鑑定、逐首音樂／音效的權利比對，也未取得帳戶收據、Google 原始資料集或私人委外文件。未重建並驗證當前 4.9.0 所有平台安裝包。因此這份報告是有證據的盤點與方案，不能當作無侵權保證。
