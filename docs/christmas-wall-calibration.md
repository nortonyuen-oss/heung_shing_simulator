# 聖誕幕牆燈飾校正

在測試模式開啟原有「夜間建築燈光校正」，選商業類別及模型，再勾選「校正聖誕燈飾」。

- 46 款素材來自 `Models/festivals/Christmas/buildingDeco/BuildingDeco1.png` 至 `BuildingDeco46.png`，下方顯示所選款式。
- 按「＋燈飾」加入最多四塊，點燈飾編號可切換，拖綠色四角調整透視。方向鍵移動整塊，Shift 加大步幅。
- 舞台及效果預覽使用該模型現有的 `__nightdeep` 貼圖。沒有底圖時會提示先 bake。
- 按「套用」儲存；校正同原有燈光資料一起存入 SQLite，亦會包含在 JSON 和 JS 匯出。
- 執行 `npm run prepare:release-assets`，會讀取本機校正資料庫並生成 `__nightchristmas.webp`。可用 `CITY_DB_PATH` 指定另一資料庫。
- 遊戲月份為 12 月、進入原有夜景貼圖時段後，已校正的商業大樓整晚顯示聖誕貼圖；日間及其他月份使用原本貼圖。未校正或未 bake 的模型沿用原本夜景。

正式打包仍使用現有 release-assets 流程。修改校正後需要重新 bake，重新開啟遊戲載入新 manifest。

只按指定 JSON bake 聖誕貼圖，保留現有深夜底圖：

```sh
BAKE_PROFILE_JSON="/path/to/calibration.json" BAKE_CHRISTMAS_ONLY=1 node scripts/bake-night-textures.js
```

校正中的商業模型編號會依遊戲目錄排序解析為原始貼圖檔名。聖誕貼圖不會加入可建造模型清單。
