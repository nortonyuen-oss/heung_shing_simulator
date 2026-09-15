# 第三方授權、來源與使用限制

更新：2026-09-15。適用於本 repository 所記錄的內容；個別發行版以該版實際附帶內容及通知為準。

遊戲的專有 [LICENSE](LICENSE) 僅涵蓋開發者有權授權的部分。第三方元件依自己的授權使用；公共領域內容不因加入本遊戲而成為開發者的專屬財產。以下來源說明不構成未取得權利的轉授權，也不表示所有素材已完成商業用途確認。

## 軟體元件

| 元件 | 本次記錄版本 | 授權／用途 |
| --- | --- | --- |
| Express | 4.22.2 | MIT；本機伺服器 |
| electron-updater | 6.8.9 | MIT；桌面更新 |
| Electron | 39.8.10 | MIT；桌面執行環境，內含元件另依其授權 |
| Phaser | 3.60.0 | MIT；由 CDN 載入的遊戲框架 |
| electron-builder | 26.8.1 | MIT；安裝包建置工具 |
| sharp | 0.34.5 | Apache-2.0；素材建置工具，原生依賴另有 LGPL 等條款 |

套件與傳遞依賴詳見 [套件清單](docs/licensing/dependencies.json) 及 [npm 授權原文盤點](docs/licensing/npm-runtime-notices.txt)。其中 lazy-val 1.0.5 的 metadata 宣告 MIT，但本機套件未附完整原文，已列為待補項目。這份 npm 盤點不包含 Electron 執行環境內部、Phaser bundle 內嵌元件或安裝器全部通知。

Electron 散布版的 `LICENSE`／`LICENSE.electron.txt` 與 `LICENSES.chromium.html` 應隨實際版本保留；不能只以「Electron 使用 MIT」替代其他內含元件通知。Phaser 授權資訊：<https://phaser.io/download/license>。第三方原文優先於本頁摘要。

選用的 Ollama Cloud AI 新聞功能受服務商條款約束；模型權重未包含在本專案的安裝包設計內，不因本遊戲授權取得模型或服務的使用權。

## 道路與地形：Kenney

部分基礎道路與地形取自 Kenney 的 Isometric Roads：<https://kenney.nl/assets/isometric-roads>。

上游採 CC0 1.0 Universal：<https://creativecommons.org/publicdomain/zero/1.0/>。本地對應目錄為 `kenney_isometric-roads/png/`；部分檔案有修改，其他道路組與混合材質的衍生關係仍在核對。原始 CC0 素材不受本遊戲自有素材的再利用限制；此處署名作來源致謝。

## 美術與 AI 輔助內容

模型由開發者使用 OpenAI 工具產生並整合。開發者僅就依法享有或獲授權的部分保留權利，不宣稱每項 AI 輸出都具有排他著作權，也不代表 OpenAI 背書。

`Models/landscape/natural/manifest.json` 另記錄名為 `gary-bendig-6GMq7AGxNbE-unsplash` 的材質與其他來源。其原圖、實際使用範圍及適用許可仍在核對；不將整組地景描述為完全自有素材。Unsplash 授權：<https://unsplash.com/license>。

其他 UI、新聞圖片、人物與現實地標的來源及權利依 [素材登記](docs/licensing/ASSET-RIGHTS.md) 分別記錄。

## 音樂與錄音

`Music/` 的九首背景音樂由開發者以 Suno 免費方案產生。Suno 免費方案的使用範圍有限；本專案目前不授予這些音軌的商業使用、獨立散布或影片／直播營利權。製作營利影片或直播時，請關閉這些背景音樂，並另行確認保留的音效或其他聲音是否適用。

Suno 於 2026-09-03 生效的條款將商用許可與符合方案及官方管道的下載連結。不能把目前檔案自動視為已取得該資格；逐曲權利仍待確認。參閱 <https://suno.com/terms> 及 <https://help.suno.com/en/articles/13614785>。

`Sounds/` 的九個音效由開發者自行錄製。錄音中若含他人的詞曲、廣播、表演或其他受保護內容，其權利仍歸相應權利人；自錄不等於取得全部底層內容權利。冰淇淋車旋律等內容須分別處理。

## 香港天文台

日出、日中天、日落、月出、月中天及月落的 2026 年參考資料來自香港特別行政區政府香港天文台，經 DATA.GOV.HK 開放資料提供。資料的知識產權由政府及／或相關權利人保留：

- [日出資料集](https://data.gov.hk/en-data/dataset/hk-hko-rss-times-of-sunrise-suntransit-sunset)
- [月出資料集](https://data.gov.hk/en-data/dataset/hk-hko-rss-times-of-moonrise-moontransit-moonset)
- [DATA.GOV.HK 使用條款及條件](https://data.gov.hk/tc/terms-and-conditions)

遊戲將資料轉為時間數值，並加入推算與模擬。內容不屬實時氣象或天文服務，不表示政府或天文台認可本遊戲。

曙暮光部分另參考《香港天文台年曆 2026》，並非上述 CSV 許可的自動延伸；出版物使用範圍仍待確認。警告圖示參考天文台，其具體圖源／改作範圍亦仍在核對。這些內容不獲本專案概括商用或素材再利用許可。出版物條件：<https://www.hko.gov.hk/en/publica/commercialuse.htm>。

## 海岸線

開發者記錄的來源為 Google Earth，由開發工具引入；現有檔案與 Git 歷史未保留可核實的原始圖層／資料集網址。因此目前不主張這些遮罩屬開放授權資料，也不授予其商業再利用權。Google Earth 條款：<https://www.google.com/help/terms_maps-earth/>。

## 權利查詢

本作品由獨立開發者製作；引用現實機構、地點或作品不代表合作或背書。若希望提出來源補充、權利問題或商業授權查詢，請聯絡 GitHub 帳號 `nortonyuen-oss`，入口：<https://github.com/nortonyuen-oss/heung_shing_simulator/issues>。
