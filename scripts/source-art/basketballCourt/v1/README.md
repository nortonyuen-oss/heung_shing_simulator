# Basketball court v1 / 已撤回

**此版因非線性校正令直線彎曲，已撤回。** 下文只保留當時的流程紀錄，不代表通過整體幾何驗證。舊校正程式存於 `rejected-warp-script.txt`。目前請用 `../v2/README.md` 所述v2；標準 prepare 指令亦已改為輸出v2。

生成模式：內建 `image_gen`，依照確定性幾何草圖及現有遊戲美術參考生成，透明背景。完整提示詞見 [prompt.md](prompt.md)。原始輸出 [render-source.png](render-source.png) 保持原樣。

流程：超幼灰色2×2格線 → 28×15米球場與32×19米緩衝地面佈局 → 籃架／鐵網／燈柱草圖 → 遊戲風格生成 → 地面比例校正。[workflow.png](workflow.png) 展示四個階段；[preview.png](preview.png) 為淺色底展示圖。

最終透明底PNG：`Models/basketballCourt/bc_estateFullCourt_v1.png`。40×40米地盤，投影 `screenX=240+14*(x+y); screenY=800+7*(x-y)-28*z`。1:2 指地面菱形的高:闊，並非整幅含燈柱圖片的高:闊。

校正使用單調三次曲線映射螢幕X、平滑薄板樣條映射Y，保留原來垂直物件的固定X。控制地盤邊、球場邊及中線；幾何邊上加密抽樣誤差上限1像素。實際輸出PNG另量度地盤前兩邊斜率接近±0.5。燈柱與鐵網高度屬設計標稱值，細小弧線及繪畫細節不作逐像素尺寸保證。完整誤差、雜湊、基準點與名義尺寸見 `data/basketball-court-geometry.json`。

重建與校驗（專案根目錄，需Node及sharp）：

```sh
node scripts/basketball-court-guide.js
node scripts/prepare-basketball-court.js
node scripts/prepare-basketball-court.js --check
node scripts/preview-basketball-court.js
```

美術參考：已接受的 `Models/publicMarket/pm_market3x3_style_v3.png`、現有 `primarySchool2-01.png` 及 `sportField3-02.png`。沒有把參考模型的人物或旗幟畫入新資產。

球場尺寸參考：[FIBA Official Basketball Rules 2024](https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-v10a.pdf)、[FIBA Venue Guide](https://www.venueguide.fiba.basketball/vanue-design)。香港場地外觀研究：[香港電影服務統籌科場地資料](https://fpf.ccidahk.gov.hk/tc/location/detail.php?id=1846)；研究照片沒有直接拼貼入模型。
