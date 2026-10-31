# 游泳池：3×3格簡約版

用戶選擇3×3格（60×60米）的簡約香港露天公眾泳池。

設計：一個50×25米主池（八泳線及旁邊水面緩衝）、一層37×9米更衣室兼入口、7×7米機房；其餘保留池邊通道、欄杆、照明、長凳、救生員高椅與小量樹池。尺寸是精確幾何草圖的設計值，並非每個生成像素的測量保證。

流程檔案：

- `01-grid.svg/png`：超幼灰色3×3地盤格線，地面兩軸±0.5。
- `02-layout.svg/png`：水面、池邊、附屬樓平面佈局。
- `03-construction-guide.svg/png`：確定性建設草圖。
- `layout.json`：米制尺寸、投影、地盤及主池角點。
- `render-source.png`：內建image_gen第一次輸出，保留原檔。
- `render-roof-corrected.png`：內建image_gen定點移除屋頂上誤放的長凳及救生員高椅後的原始輸出。
- `prompt.md`、`prompt-roof-correction.md`：兩次完整提示詞。
- `preview.png`：淺色底成品預覽；`workflow.png`：四階段流程。

美術參考為現有 `Models/publicMarket/pm_market3x3_style_v3.png` 及 `Models/basketballCourt/bc_estateFullCourt_v2.png`。使用內建工具，未使用CLI或外部API。沒有重用專案原有雙池泳池的構圖。

最終資產為 `Models/swimmingPool/sp_simple3x3_v1.png`。由修正後的原圖做**單一整體仿射變換**，不使用局部網格、非線性拉伸或薄板樣條。所有原本直線保持直線，原本垂直線保持垂直。輸出PNG另量度兩條前地盤邊斜率接近±0.5，透明邊界為0，原圖雜湊不變。精確草圖與生成圖仍有少量內部位置、比例及角度差異；沒有把每條屋頂、池邊及欄杆邊都宣稱為精確1:2。

重建與檢查（在專案根目錄，需Node及sharp）：

```sh
node scripts/swimming-pool-guide.js
node scripts/prepare-swimming-pool.js
node scripts/prepare-swimming-pool.js --check
node scripts/preview-swimming-pool.js
```

投影：`screenX=200+10*(x+y); screenY=800+5*(x-y)-20*z`。1:2描述地面菱形高:闊，並非含燈柱的整幅PNG高:闊。

尚未接入runtime。泳池尺寸研究保存在 `docs/swimming-pool-size-study.md`；本次用戶已選3×3格方案，取代研究中的4×4候選作為首款資產。
