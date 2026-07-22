# Models 資產盤點

更新日期：2026-07-22

## 總覽

- 遊戲 PNG 模型：145
- 已由登記表、模型目錄或動態 key 使用：142
- 尚未接入：3
- 非遊戲生成檔：24 個 `.DS_Store`、2 個 `process_log.csv`、2 個 `settings.json`

| 分類 | PNG 數量 | 狀態 |
|---|---:|---|
| airport | 1 | 新建機場 12×12；舊存檔支援 6×6、8×8 fallback |
| commercial | 23 | 1×1 至 5×5 已接入 |
| containerPort | 4 | 四個海岸方向已接入 |
| government | 21 | 18 張已接入，3 張保留作新玩法 |
| industrial | 17 | 1×1 至 3×3 全部投入發展 |
| parks | 11 | 公園、泳池、運動場及旗艦公園已接入 |
| powerStation | 3 | 燃煤、太陽能、核電已接入 |
| residential | 37 | 1×1 至 5×5 已接入 |
| specialSites | 13 | 地標、文化及宗教建築已接入 |
| trees | 15 | 由 `TREE_SPECIES` 動態 key 載入 |

## 本輪更新檢查

- 145 張模型全部可解碼，並且全部具有透明通道。
- 固定 registry、住宅／商業／工業 catalog 與目前檔名完全吻合，沒有失效引用。
- 本輪更新 `commercialBuilding1-05-L`、2×2 運動場、太空館、大佛及教堂；新增 3×3 大型廟宇。
- 貨櫃碼頭四方向由 `containerPort3-*` 整套替換成 `containerPort4-*`，registry 與 packaged manifest 已同步，舊檔不會留在 release stage。
- 本輪 10 張 PNG 以保守單次 defringe 修正半透明像素的白色 matte；alpha、輪廓及底部 anchor 不變。
- 已移除顯示異常的 `commercialBuilding1-02-M.png`、`commercialBuilding4-03-L.png` 及 `commercialBuilding4-04-L.png`；舊存檔會按相同 footprint fallback 到現有模型。
- 打包管線會由 PNG 母檔自動產生 145 張 lossless WebP；不會再次 defringe，所有可見 RGBA 像素維持一致，151.0 MiB 降至 95.5 MiB。
- manifest hash 已納入模型路徑及 metadata cache；同名換圖不會沿用舊貼圖或透明邊界資料。
- 建築裁走全透明畫布後會在頂部及左右補透明像素至最接近的 2 次方尺寸；樹木保留原畫布後同樣補位。145 張 WebP 全部恢復 Phaser mipmap，anchor 審計最大偏差為 0.00px。
- 遊戲啟動只預載每個 footprint／tier 的代表模型，其餘按需載入並受 192 MiB soft LRU budget 管理；預算已計入完整 mip chain 額外約三分之一的 GPU 記憶體。
- `/Models/` 圖片改為每次重載時條件式重新驗證，避免一小時媒體快取遮蔽最新貼圖。
- 貨櫃碼頭四方向已使用 4×4 footprint；機場新建尺寸為 12×12，舊存檔保留 6×6／8×8 fallback。
- 貨櫃碼頭建造時要求一條連續四格海岸，支援直接水岸及「沙灘後方為海水」兩種岸線；碼頭 frontage 會抑制普通草岸／沙岸貼圖，讓模型岸牆直接接上海面。
- 海洋公園新建尺寸改為 8×8，需先由議會通過【海洋公園發展計劃】；舊存檔保留原有 4×4 佔地並自動承認既有項目。

## 宗教建築

- 康樂及文化選單新增「宗教建築」：2×2 社區廟宇、3×3 大型廟宇及 3×3 教堂。
- 社區廟宇會按建造次序循環使用兩款 2×2 模型，確保所有廟宇資產都會出現。
- 社區廟宇最多 4 座；教堂最多 2 座；大型廟宇需人口 12,000、城市吸引力 35，最多 1 座。
- 宗教建築提供幸福感、鄰近地價及吸引力，並以有上限的社區支援效果輕微降低罪案及改善健康。

## 工業及科學園發展

- 傳統工業：1×1 共 2 張、2×2 共 7 張、3×3 共 2 張。
- 科學園：2×2 共 4 張、3×3 共 2 張投入使用；`sicencePark2-03` 雖保留舊檔名，catalog 會正確識別為科學園。
- 城市高等教育指數達 0.8 後解鎖科學園；高等教育水平及「科研發展」政策會提高新科學園出現與舊工業轉型機率。
- 開發模式 PNG 與 packaged WebP 現共用相同 alias 排序，模型 key 不會因副檔名不同而改變。
- 工業轉型採先載入、後替換；載入失敗會保留原工業建築，避免再次出現 Phaser missing texture。
- `sciencePark3-02.png` 已重新啟用；PNG 與 WebP 均固定對應 `industrial_building_3x3_3`，延遲載入成功後才會提交轉型。

## 尚未接入及建議用途

- `Models/government/1x1/policeStation1.png`：低成本 1×1 社區警崗，覆蓋較小。
- `Models/government/1x1/schoolHall1.png`：1×1 幼稚園、社區會堂或成人教育中心。
- `Models/government/3x3/fireStation3-01-Photoroom.png`：3×3 區域消防總局，較高建造費及覆蓋半徑。

這三款沒有直接混入現有隨機變種，因為 footprint 不同；隨機建造時改變佔地會令預覽與實際碰撞範圍不一致。

## 非遊戲檔案

`.DS_Store`、`process_log.csv` 與 `settings.json` 不應由遊戲載入或納入模型登記。它們目前保留作來源追溯，日後可在確認不再需要資產處理紀錄後統一清理。

## 討論區新聞圖片

- 新增 `airportProjectApproved`、`oceanParkMemories`、`stockMarketShock`、`stockMarketShock2` 四套新聞圖片。
- PNG 保留作新聞母檔但排除於 Electron package；遊戲及正式版只讀取最大 960×720 的 WebP 與 180×125 縮圖。
- 機場計劃通過、海洋公園半年活動及每次股災（兩則新聞）均使用各自的固定 WebP 圖片。
