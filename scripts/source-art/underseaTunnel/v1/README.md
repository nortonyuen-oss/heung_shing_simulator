# 雙管道海底隧道 v1：生成記錄

使用 **內建 imagegen**，不是 CLI/API 備用流程。
輸入為現有 `newRoadTiles` 的兩款直路及其兩格並行、三格長的拼接參考圖。
兩個方向分別生成，保留各自光影；NS 另外作一次邊緣／風格編修。

後續新增的兩個背面角度：[rear-v1 生成記錄](../rear-v1/README.md)／[四方向對照](../rear-v1/four-views.png)。

## 完整生成提示

- [NS：右下方向洞口](prompt-NS.md)
- [EW：左下方向洞口](prompt-EW.md)
- [NS：邊緣與風格編修](prompt-NS-cleanup.md)

## 檔案

- `road-pair-NS-reference.png`、`road-pair-EW-reference.png`：以現有道路圖精確排列的輸入參考。
- `generated-NS-initial.png`：NS 首次生成圖，亦為後續編修的輸入。
- `generated-NS.png`：NS 編修原稿，保持工具輸出的原始 bytes。
- `generated-EW.png`：EW 生成原稿，保持工具輸出的原始 bytes。
- [comparison.png](comparison.png)：左為現有並行直路，右為同尺配準後隧道；兩列分別為兩個道路方向。

最後成品位於 [Models/underseaTunnel](../../../../Models/underseaTunnel/README.md)。
配準方法、遊戲格線錨點及實作範圍以該 README 為準。
原稿的全透明像素仍可能帶有 RGB 背景色，應以 alpha 合成檢視；成品已在配準時處理這些像素。
