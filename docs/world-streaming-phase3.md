# Phase 3：小地圖與全港導航

分支：`codex/world-chunk-streaming`。依照 [規格第 8 節及 Phase 3](world-chunk-streaming-spec-v1.0.md)，世界預覽的導航及建設範圍由試驗區域擴展至整個 **3187×2400** 世界。

## 操作

```sh
npm run prepare:world-terrain
npm start
```

開啟 `/world/preview.html`。右下角預設顯示附近 256×256 格，按「全港總覽」展開完整香港版圖；按「附近」返回局部模式。兩種模式均支援點擊／拖動跳轉及方向鍵移動鏡頭，地圖旋轉跟隨主畫面。

按「收起／展開」控制面板，拖動標題改變位置。位置及收起狀態存在獨立 UI 設定。面板在手機螢幕上保持可操作；小地圖觸控導航會取消建設草稿，沒有建設副作用。

「起點」返回原有試驗區域附近；「跨區跳轉」在起點及遠區之間切換。其他地點可直接從全港總覽選擇。世界邊緣會限制目的座標，最右方不足 32／64 格的區塊仍使用實際尺寸。

主畫面隨跳轉立即移動，已有獨立全港 LOD 承接畫面，新位置的最多九個詳細 Render Chunks 異步掛載。沒有在瀏覽器載入原始全港 RLE，也沒有生成全港地形陣列。

## 底圖與記憶體

- 全港總覽使用四方向預製 1024×512 級 WebP，直接共用主畫面的 Overview 素材。
- 附近底圖由全港總覽兜底，再按需覆蓋預製 Local Cache。離線工具為 130 個 256×256 地理區域各輸出四方向 512×256 級 WebP；邊界區域保留實際尺寸。
- 每個局部視窗最多需要四張地理區域圖。解碼併發上限為二，保留的局部 bitmap 合計不超過 **4 MiB**（一般完整區域圖最多八張）。過期請求會取消，過期回傳和被淘汰 bitmap 會 `close()`。
- 不預載全港所有局部圖片。局部圖讀取失敗時保留 Overview，五秒後才容許重試。
- 本次生成的 520 張 Local Cache 檔案合計約 2.1 MiB 磁碟佔用；這不是執行時全部解碼的記憶體量。生成資料繼續在 gitignore 內，由 build 指令重建。

Canvas 分成地形、城市、鏡頭三層，最大各 1024×512，不使用原尺寸全港 Canvas。地形只在區域中心跨 32 格門檻、旋轉、尺寸、模式切換或局部圖完成讀取時重畫。城市圖層在建設 Delta 改變或地圖範圍改變時重畫；平移及縮放只更新輕量鏡頭層。

## 座標與城市圖層

`WorldMinimapTransform` 共用原有等距投影 Adapter，將預製圖 metadata 的投影座標、Tile 地面中心、點擊逆轉換及四個實際 Camera viewport 角點連到同一套轉換。跟隨 live zoom／camera origin，不依賴尚未更新的 Phaser `worldView`。拖動局部圖期間固定該次手勢的地圖範圍，避免鏡頭跟隨引致目標漂移。

城市圖層直接讀取獨立 `WorldDeltaStore`，包括地形修改、住宅／商業／工業分區、道路、建築、橋樑及淡色路軌。局部模式只查詢相交 Storage Chunk 的稀疏資料及實體引用；總覽只走訪已有 Delta，從不掃描 7,648,800 個原始 Tile。跨區實體按 ID 去重，遠處即使沒有 Sprite，標記仍可顯示及跳轉。

延續 Phase 2 的世界 schema、世界 ID、實體 ID 及絕對 Tile 座標，不搬動原本建設。沿用原有 world save slot 及 active slot 設定，所以舊試驗存檔可以直接在全港模式繼續。正式城市與舊城市匯入流程保持獨立。

## 驗證

```sh
npm run test:world
npm run smoke:world:navigation
npm run smoke:world
npm run smoke:world:construction
npm test
```

新增單元測試涵蓋真實矩形世界四旋轉正逆座標、局部／全港邊界、live Camera viewport、32 格門檻、卸載後的跨區實體索引、局部快取併發／記憶體／過期回傳／失敗冷卻。

導航 Chromium 測試以獨立瀏覽器資料庫驗證四方向遠區點擊、四個世界角落、短邊界區塊、刻意延遲資料時仍立即移動及顯示 LOD、試驗範圍外建設、卸載後總覽標記、保存及重載後返回同一實體、只更新鏡頭層、局部圖拖動、面板拖動及收起、手機觸控不觸發建設。報告及畫面：`test-results/world-navigation/`。

原有串流及建設 Chromium 測試繼續驗證最多九個詳細區塊、跨區保留六換三、快速跳轉、0.4x LOD、資料讀取失敗重試、手機平移／縮放，以及 IndexedDB／SQLite 建設、匯出、還原及匯入流程。測試不開啟玩家 profile 或正式資料庫。

本次驗證：`npm test` **1336 項通過**、`test:world` **33 項通過**，三組 Chromium smoke 全部通過。導航測試中高細節掛載峰值九塊、局部 bitmap 快取峰值受 4 MiB 上限約束，沒有 JavaScript page error。

## 下一階段

Phase 4 才引入跨區道路／鐵路拓撲查詢、遠區交通時間推進及區域人口／財政聚合。目前圖上的路軌／橋樑表示已保存的建設，未接運行中的地鐵線與車輛。行政區名稱及地標標註、主選單整合與發佈資產仍待後續接入。

本階段使用桌面 Chromium 及手機觸控模擬驗證；實體 iPhone Safari、Safari／Electron 與長時間壓力驗收留在 Phase 5。沒有將不同場景的 headless 數據當成 FPS 改善幅度。
