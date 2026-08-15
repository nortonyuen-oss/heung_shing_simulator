# The City of Heung Shing v4.0.0-beta.1 — 【號外！香城巴士大亨】

呢個係公共交通擴充同大型城市效能修正嘅預覽版。建議先用副本存檔試玩，並回報巴士路線、道路重算、畫面流暢度同舊存檔兼容問題。

## Highlights

- 新增可選「公共交通擴充」：人口達 3,000 後可以建立雙向巴士線，揀選車站、設定路線名稱、顏色、票價及 1–8 架巴士，並查看班距、客量、載客率、可靠度同每月盈虧。
- 巴士營運正式接入城市模擬：包括車廠容量、路線自動尋路、道路改動後重算、斷線停駛、Signal 8 停駛、票務收入、營運成本、交通分流、幸福度、商業需求及地價正面加成。
- 舊城市預設不啟用擴充；交通資料使用獨立 schema 儲存。停用擴充時會保留路線資料但不產生效果或費用，重新啟用即可恢復。
- 修正大型城市持續低 FPS 嘅主要原因：樹木同建築物改用同一個 WebGL rendering pipeline，避免 depth-sorted 畫面反覆 flush shader batch。27 萬人口測試城市由約 36 FPS 提升至接近 60 FPS。
- 修正 profiler 自身拖慢畫面及混入舊 long-task 記錄嘅問題，效能樣本而家會由每次新 session 重新開始。
- 右下角加入音樂靜音、地圖縮放及即時倍率顯示；鍵盤方向鍵可以平滑移動地圖，輸入框或彈窗聚焦時不會誤觸。
- 修正部分存檔載入時建築模型缺失、巴士靠站卡住及幽靈車輛等問題。

## Beta Test Focus

- 建立、修改、暫停及刪除巴士線；拆路後斷線，再接通後恢復。
- 車站雙向月台補建、車廠容量、路線票價與車數平衡。
- 載入現有城市、關閉再重開公共交通擴充，以及手動／自動存檔 round-trip。
- 大型城市縮放、旋轉、方向鍵移動及長時間運行嘅畫面流暢度。

## Compatibility

- Compact save format 維持 version 15；公共交通資料使用獨立 `save_data.expansions.transport.schemaVersion: 1`。
- 舊存檔可以直接載入，而且預設不會啟用公共交通擴充。
- 呢個係 pre-release，唔會取代 v3.14.0 穩定版或自動推送畀只接收正式版更新嘅玩家。

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE
