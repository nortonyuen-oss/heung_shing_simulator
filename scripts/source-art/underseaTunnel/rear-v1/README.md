# 海底隧道：兩個背面角度

沿用 v1 已完成的雙管道隧道，使用**內建 imagegen**，分別製作兩個道路方向的反向視角。
主要參考為各軸正面成品、另一軸正面成品及原有雙行直路佈局。

- [NS 背面完整 prompt](prompt-NS-rear.md)：頂蓋在右下，洞口向左上，兩條引道向左上延伸。
- [EW 背面完整 prompt](prompt-EW-rear.md)：頂蓋在左下，洞口向右上，兩條引道向右上延伸。
- [NS 背面修訂 prompt](prompt-NS-rear-fix.md)：移除初稿遠端誤加的第二組洞口和燈，改回普通道路接駁端。

原稿保留為 `generated-NS-rear.png`、`generated-EW-rear.png`；NS 初稿另存
`generated-NS-rear-initial.png`，作為編修輸入記錄。這些檔案保留工具原始 bytes。
生成圖全透明像素可能保留背景 RGB，請以 alpha 合成檢視。

成品為 [tunnel_NS_rear_v1.png](../../../../Models/underseaTunnel/tunnel_NS_rear_v1.png)
及 [tunnel_EW_rear_v1.png](../../../../Models/underseaTunnel/tunnel_EW_rear_v1.png)。
兩款均是 1200×800 透明 PNG，兩格闊、三格長；地台三個底角配準到正面版本相同用地。
保留兩條獨立道路、中央分隔及原款混凝土頂蓋。洞口朝向遠方並被頂蓋遮住，近處看到背殼。

[四方向正面／背面同尺對照](four-views.png)
／[生成檔、參考正面及成品 hash、配準錨點、邊線量度](../../../../data/undersea-tunnel-rear-assets.json)。

重建與驗證：

```sh
node scripts/prepare-undersea-tunnel-rear-assets.js
node scripts/prepare-undersea-tunnel-rear-assets.js --check
```

檢查包含成品地台底邊斜率 ±0.5、16 px 全透明安全邊、尺寸、hash 及對照圖重建一致性。
原有正面素材亦已使用其既有 `--check` 通過驗證，成品 bytes 沒有更改。
仍屬美術素材，未接入建造選單、隧道路線或車流功能。
