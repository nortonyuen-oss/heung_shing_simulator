# 全部素材像素覆量及20m比例建議

日期：2026-10-17。精確掃描1465張圖檔；149張地盤母圖有逐款人工參照審閱。

**本表取代前輪純目視格數建議。** 像素可重現；米數依賴明列的樓層／人物／門／球場／地標情境，並非精確建築測繪。

地盤中68張的參照名義比例相差超過25%。單一格數不能修正同圖內的比例矛盾；有些差異也可能來自參考類型／尺寸假設，故保留原線供審閱。

[帶量度線的可搜尋報告](world-scale-measured.html) · [全部1465檔CSV](world-scale-measured.csv) · [完整像素、參照與來源JSON](world-scale-measured.json)

「理想格數」是假定整張圖等比縮放、沿用目前runtime地面縮放寬時的方形地盤邊長，不是實際地盤長闊的獨立測繪。取整只作主參考情境建議，衝突／歧義項目不能直接套用。

區間採參照米數範圍及每端像素取點誤差的保守界限，並非統計信賴區間。alpha自動貼合可能包含招牌／樹冠等，凡沒有地面角校準者已在完整報告標記。

## 本輪修訂重點

| 素材 | 原圖量度與明示假設 | 推算及建議 |
|---|---|---|
| 圖書館 library2-01 | 兩層82px，假設合計8m；門扇33px，假設2.1m | 樓層推算約3.03格、門推算1.97格；建議以3×3重校樓體，門口須一併重製，不能只放大整圖。 |
| 金蛋 sicencePark2-03 | 三個成人分別29／29／30px，假設1.7m | 三尺約1.78–1.84格；先保留2×2，本體約92%地盤。這是人高假設，非實景金蛋外尺寸。 |
| 科學園 sciencePark2-01／2-04 | 完整樓層分別100px跨兩層、196px跨四層；工業層高4.2m | 理想約2.61／2.69格，候選3×3；人／門比例衝突需局部修圖。 |
| sciencePark2-02 | 原圖標示INNOVATION RESIDENCE；179px跨三層住宅，假設每層3m | 約1.53格，保留2×2、縮本體補地台；不應套普通工廈層高。 |
| sciencePark3-01／3-02 | 各跨四層135／128px，假設合計16.8m | 約3.83／4.11格，候選4×4；入口與樓層仍有明顯名義差異。 |
| 醫院 | 102px跨四層，假設合計16m；圖內成人19px，假設1.7m | 主樓約5.54格，候選6×6；人物尺約3.16格，不能整圖同時校好。 |
| 小學／中學 | 各跨四層205／134px，假設合計14.4m | 約2.17／3.37格；採3×3／4×4地盤時，本體約72%／84%。本次重數完整層距，取代舊七層跨度結果。 |
| 港口四方向 | 單箱／拖架箱頂邊與箱高交叉量度；20／40呎分類仍為情境 | 四方向約5.8–6.1格，候選6×6；前輪8×8並非量度結果。 |
| 足球場連看台 | 白線長向244px對105m、短向163px對68m | 兩軸約10.83／10.50格，候選11×11；外牆入口尺度不同，需重製看台和入口。 |
| 泳池／維園網球模組 | 泳池25／50m用途不明；網球兩軸124／92px不符23.77:10.97 | 均不能由單一格數修正；須先定池型及重畫場線。維園另一張是兩個並排半場，已撤回完整籃球場假設。 |
| 煤電／核電／機場 | 煤電工人與門支持約1.0–1.1格本體；核電無可信門尺；機場跑道長寬情境嚴重不符 | 先前16×16、40×40、210×80是設計預留，不能當現圖精確量度。核電與機場暫不給可直接套用的格數。 |

「參照衝突」是固定名義假設下超過25%的差異，並不表示已證明真實建築尺寸矛盾；尤其小人物取點誤差大，仍須看各尺完整區間。

## 逐款地盤結果

| 素材 | 主尺：原圖px／假設m | 理想格數（低／中／高） | 建議 | 判讀 |
|---|---|---|---|---|
| [airport12-01.png](../Models/airPort/12x12/airport12-01.png) | 744px／3800/3800/3800m | 198.46／200.60／202.78 | 主設計情境需等比方形約200.6格，但其他參照不符；無單一建議格數，須拆件 | 參照衝突 |
| [busDepot3_LL_fixed.png](../Models/busDepot/busDepot3_LL_fixed.png) | 52px／5.5/6/6.5m | 2.35／2.95／3.78 | 3×3（主參考情境） | 多參照情境相近 |
| [busDepot3_LR_fixed.png](../Models/busDepot/busDepot3_LR_fixed.png) | 52px／5.5/6/6.5m | 2.35／2.95／3.78 | 3×3（主參考情境） | 多參照情境相近 |
| [busDepot3_UL_fixed.png](../Models/busDepot/busDepot3_UL_fixed.png) | 無可辨實尺 | — | 無足夠獨立實尺；不可由PNG唯一推導格數 | 參照不明 |
| [busDepot3_UR_fixed.png](../Models/busDepot/busDepot3_UR_fixed.png) | 無可辨實尺 | — | 無足夠獨立實尺；不可由PNG唯一推導格數 | 參照不明 |
| [commercialBuilding1-01-L.png](../Models/commercial/1x1/commercialBuilding1-01-L.png) | 217px／6.4/7/7.6m | 0.84／0.96／1.09 | 1×1（主參考情境）；圖像本體只約0.96格，補地景 | 多參照情境相近 |
| [commercialBuilding1-02-M.png](../Models/commercial/1x1/commercialBuilding1-02-M.png) | 261px／10.8/12/13.2m | 0.85／0.98／1.13 | 1×1（主參考情境）；圖像本體只約0.98格，補地景 | 多參照情境相近 |
| [commercialBuilding1-03-L.png](../Models/commercial/1x1/commercialBuilding1-03-L.png) | 329px／12.8/14/15.2m | 0.81／0.91／1.02 | 1×1（主參考情境）；圖像本體只約0.91格，補地景 | 多參照情境相近 |
| [commercialBuilding1-04-M.png](../Models/commercial/1x1/commercialBuilding1-04-M.png) | 96px／4.5/4.7/4.9m | 1.04／1.22／1.46 | 2×2（主參考情境）；本體約61.1%地盤 | 多參照情境相近 |
| [commercialBuilding1-05-L.png](../Models/commercial/1x1/commercialBuilding1-05-L.png) | 89px／2.6/2.8/3m | 0.88／1.03／1.22 | 1×1（主參考情境）；超出地盤3.3%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding2-02-H.png](../Models/commercial/2x2/commercialBuilding2-02-H.png) | 14px／1/1.1/1.2m | 1.54／2.43／4.63 | 3×3（主參考情境）；本體約80.9%地盤 | 多參照情境相近 |
| [commercialBuilding2-03-M.png](../Models/commercial/2x2/commercialBuilding2-03-M.png) | 266px／18/20/22m | 1.91／2.21／2.52 | 3×3（主參考情境）；本體約73.5%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding2-04-M.png](../Models/commercial/2x2/commercialBuilding2-04-M.png) | 19px／1/1.1/1.2m | 1.24／1.79／2.86 | 2×2（主參考情境）；本體約89.6%地盤 | 單參照推算 |
| [commercialBuilding2-05-L.png](../Models/commercial/2x2/commercialBuilding2-05-L.png) | 164px／10.8/12/13.2m | 1.91／2.25／2.64 | 3×3（主參考情境）；本體約75.1%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding2-06-L.png](../Models/commercial/2x2/commercialBuilding2-06-L.png) | 377px／25.2/28/30.8m | 1.73／1.97／2.23 | 2×2（主參考情境）；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding3-01-H.png](../Models/commercial/3x3/commercialBuilding3-01-H.png) | 314px／25.2/28/30.8m | 2.25／2.58／2.92 | 3×3（主參考情境）；本體約85.8%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding3-03-M.png](../Models/commercial/3x3/commercialBuilding3-03-M.png) | 253px／21.6/24/26.4m | 2.47／2.86／3.27 | 3×3（主參考情境）；本體約95.3%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding3-04-H.png](../Models/commercial/3x3/commercialBuilding3-04-H.png) | 174px／12.8/14/15.2m | 2.11／2.44／2.81 | 3×3（主參考情境）；本體約81.5%地盤 | 多參照情境相近 |
| [commercialBuilding3-05-UH.png](../Models/commercial/3x3/commercialBuilding3-05-UH.png) | 139px／18/20/22m | 3.69／4.40／5.22 | 5×5（主參考情境）；本體約88%地盤 | 多參照情境相近 |
| [commercialBuilding3-07-M.png](../Models/commercial/3x3/commercialBuilding3-07-M.png) | 186px／14.4/16/17.6m | 2.50／2.92／3.40 | 3×3（主參考情境）；本體約97.4%地盤；參照有歧義，未定案 | 參照有歧義 |
| [commercialBuilding3-08-H.png](../Models/commercial/3x3/commercialBuilding3-08-H.png) | 401px／43.2/48/52.8m | 3.04／3.46／3.91 | 4×4（主參考情境）；本體約86.6%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding3-09-M.png](../Models/commercial/3x3/commercialBuilding3-09-M.png) | 275px／36/40/44m | 3.81／4.38／5.00 | 5×5（主參考情境）；本體約87.6%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding3-10-M.png](../Models/commercial/3x3/commercialBuilding3-10-M.png) | 251px／21.6/24/26.4m | 2.54／2.93／3.36 | 3×3（主參考情境）；本體約97.8%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding3-11-H.png](../Models/commercial/3x3/commercialBuilding3-11-H.png) | 291px／21.6/24/26.4m | 2.42／2.78／3.16 | 3×3（主參考情境）；本體約92.5%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding3-12-M.png](../Models/commercial/3x3/commercialBuilding3-12-M.png) | 82px／8/9/10m | 2.63／3.32／4.20 | 4×4（主參考情境）；本體約83%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding3-13-H.png](../Models/commercial/3x3/commercialBuilding3-13-H.png) | 99px／9.6/10.5/11.4m | 2.66／3.21／3.88 | 3×3（主參考情境）；超出地盤6.9%，須在誤差範圍內微調 | 多參照情境相近 |
| [commercialBuilding4-01-H.png](../Models/commercial/4x4/commercialBuilding4-01-H.png) | 30px／3.6/4/4.4m | 2.63／3.90／6.43 | 4×4（主參考情境）；本體約97.4%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [commercialBuilding4-02-H.png](../Models/commercial/4x4/commercialBuilding4-02-H.png) | 184px／14.4/16/17.6m | 2.27／2.66／3.09 | 3×3（主參考情境）；本體約88.6%地盤；參照有歧義，未定案 | 參照有歧義 |
| [commercialBuilding4-03-L.png](../Models/commercial/4x4/commercialBuilding4-03-L.png) | 89px／6.4/7/7.6m | 1.96／2.38／2.92 | 3×3（主參考情境）；本體約79.5%地盤 | 多參照情境相近 |
| [commercialBuilding4-04-L.png](../Models/commercial/4x4/commercialBuilding4-04-L.png) | 89px／6.4/7/7.6m | 1.99／2.42／2.95 | 3×3（主參考情境）；本體約80.5%地盤 | 多參照情境相近 |
| [commercialBuilding5-01-UH.png](../Models/commercial/5x5/commercialBuilding5-01-UH.png) | 688px／315/315/315m | 13.48／13.79／14.12 | 14×14（主參考情境）；參照衝突，須分件／重製 | 參照衝突 |
| [containerPort4-LL.png](../Models/containerPort/4x4/containerPort4-LL.png) | 34px／6.058/6.058/6.058m | 4.77／5.90／7.71 | 6×6（主參考情境） | 多參照情境相近 |
| [containerPort4-LR.png](../Models/containerPort/4x4/containerPort4-LR.png) | 34px／6.058/6.058/6.058m | 4.77／5.90／7.71 | 6×6（主參考情境） | 多參照情境相近 |
| [containerPort4-UL.png](../Models/containerPort/4x4/containerPort4-UL.png) | 67px／12.192/12.192/12.192m | 5.32／5.96／6.76 | 6×6（主參考情境） | 多參照情境相近 |
| [containerPort4-UR.png](../Models/containerPort/4x4/containerPort4-UR.png) | 67px／12.192/12.192/12.192m | 5.32／5.96／6.76 | 6×6（主參考情境） | 多參照情境相近 |
| [fireStation2-01.png](../Models/government/2x2/fireStation2-01.png) | 74px／3.6/4/4.4m | 1.41／1.77／2.26 | 2×2（主參考情境）；本體約88.8%地盤 | 多參照情境相近 |
| [firestation2-02.png](../Models/government/2x2/firestation2-02.png) | 82px／4/4.5/5m | 1.38／1.71／2.10 | 2×2（主參考情境）；本體約85.3%地盤 | 多參照情境相近 |
| [legislativeCouncil2-01.png](../Models/government/2x2/legislativeCouncil2-01.png) | 63px／3.6/4/4.4m | 1.59／1.99／2.51 | 2×2（主參考情境） | 多參照情境相近 |
| [legislativeCouncil2-02.png](../Models/government/2x2/legislativeCouncil2-02.png) | 41px／3.6/4/4.4m | 2.22／2.95／4.03 | 3×3（主參考情境） | 多參照情境相近 |
| [library2-01.png](../Models/government/2x2/library2-01.png) | 82px／7.2/8/8.8m | 2.48／3.03／3.69 | 3×3（主參考情境）；超出地盤0.9%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [policeStation2-01.png](../Models/government/2x2/policeStation2-01.png) | 78px／3.6/4/4.4m | 1.28／1.57／1.92 | 2×2（主參考情境）；本體約78.3%地盤 | 多參照情境相近 |
| [policeStation2-02.png](../Models/government/2x2/policeStation2-02.png) | 55px／3.6/4/4.4m | 1.79／2.28／2.94 | 3×3（主參考情境）；本體約76%地盤 | 多參照情境相近 |
| [primarySchool2-01.png](../Models/government/2x2/primarySchool2-01.png) | 205px／13.2/14.4/15.6m | 1.90／2.17／2.47 | 3×3（主參考情境）；本體約72.4%地盤 | 多參照情境相近 |
| [secondarySchool2-01.png](../Models/government/2x2/secondarySchool2-01.png) | 134px／13.2/14.4/15.6m | 2.87／3.37／3.94 | 4×4（主參考情境）；本體約84.2%地盤 | 多參照情境相近 |
| [secondarySchool2-02.png](../Models/government/2x2/secondarySchool2-02.png) | 134px／13.2/14.4/15.6m | 2.87／3.37／3.94 | 4×4（主參考情境）；本體約84.2%地盤 | 多參照情境相近 |
| [college3-01.png](../Models/government/3x3/college3-01.png) | 20px／2/2.1/2.3m | 1.43／2.24／4.92 | 3×3（主參考情境）；本體約74.8%地盤 | 多參照情境相近 |
| [college3-02.png](../Models/government/3x3/college3-02.png) | 56px／7.2/8/8.8m | 2.40／3.05／3.92 | 3×3（主參考情境）；超出地盤1.8%，須在誤差範圍內微調 | 多參照情境相近 |
| [college3-03.png](../Models/government/3x3/college3-03.png) | 53px／7.2/8/8.8m | 2.56／3.27／4.23 | 4×4（主參考情境）；本體約81.7%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [college3-04.png](../Models/government/3x3/college3-04.png) | 168px／14.4/16/17.6m | 2.50／2.94／3.44 | 3×3（主參考情境）；參照衝突，須分件／重製 | 參照衝突 |
| [hospital4.png](../Models/government/4x4/hospital4.png) | 102px／14.4/16/17.6m | 4.54／5.54／6.76 | 6×6（主參考情境）；本體約92.4%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [stockExchange4-01.png](../Models/government/4x4/stockExchange4-01.png) | 17px／1.6/1.7/1.8m | 2.01／3.13／6.27 | 3×3（主參考情境）；超出地盤4.5%，須在誤差範圍內微調 | 多參照情境相近 |
| [university4-01.png](../Models/government/4x4/university4-01.png) | 44px／3.6/4/4.4m | 2.15／2.82／3.79 | 3×3（主參考情境）；本體約94%地盤 | 多參照情境相近 |
| [university4-02.png](../Models/government/4x4/university4-02.png) | 50px／7.2/8/8.8m | 3.82／4.93／6.45 | 5×5（主參考情境）；參照衝突，須分件／重製 | 參照衝突 |
| [industrialBuilding1-01.png](../Models/industrial/1x1/industrialBuilding1-01.png) | 189px／7.6/8.4/9.6m | 1.02／1.18／1.40 | 2×2（主參考情境）；本體約58.8%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [industrialBuilding1-02.png](../Models/industrial/1x1/industrialBuilding1-02.png) | 270px／15.2/16.8/19.2m | 1.56／1.78／2.10 | 2×2（主參考情境）；本體約88.9%地盤 | 多參照情境相近 |
| [industrialBuilding2-01.png](../Models/industrial/2x2/industrialBuilding2-01.png) | 226px／15.2/16.8/19.2m | 1.97／2.25／2.66 | 3×3（主參考情境）；本體約75%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [industrialBuilding2-02.png](../Models/industrial/2x2/industrialBuilding2-02.png) | 88px／7.6/8.4/9.6m | 2.39／2.94／3.79 | 3×3（主參考情境）；本體約98%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [industrialBuilding2-03.png](../Models/industrial/2x2/industrialBuilding2-03.png) | 172px／11.4/12.6/14.4m | 1.96／2.27／2.71 | 3×3（主參考情境）；本體約75.5%地盤 | 多參照情境相近 |
| [industrialBuilding2-04.png](../Models/industrial/2x2/industrialBuilding2-04.png) | 215px／19/21/24m | 2.55／2.95／3.53 | 3×3（主參考情境）；參照衝突，須分件／重製 | 參照衝突 |
| [industrialBuilding2-05.png](../Models/industrial/2x2/industrialBuilding2-05.png) | 226px／19/21/24m | 2.42／2.79／3.34 | 3×3（主參考情境）；本體約93.1%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [industrialBuilding2-06.png](../Models/industrial/2x2/industrialBuilding2-06.png) | 56px／3.5/4.5/5.5m | 1.70／2.50／3.56 | 3×3（主參考情境）；本體約83.3%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [industrialBuilding2-07.png](../Models/industrial/2x2/industrialBuilding2-07.png) | 98px／7.6/8.4/9.6m | 2.17／2.59／3.22 | 3×3（主參考情境）；本體約86.3%地盤 | 多參照情境相近 |
| [sciencePark2-01.png](../Models/industrial/2x2/sciencePark2-01.png) | 100px／7.6/8.4/9.6m | 2.19／2.61／3.24 | 3×3（主參考情境）；本體約87%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [sciencePark2-02.png](../Models/industrial/2x2/sciencePark2-02.png) | 179px／8.4/9/9.9m | 1.35／1.53／1.78 | 2×2（主參考情境）；本體約76.5%地盤 | 多參照情境相近 |
| [sciencePark2-04.png](../Models/industrial/2x2/sciencePark2-04.png) | 196px／15.2/16.8/19.2m | 2.31／2.69／3.23 | 3×3（主參考情境）；本體約89.5%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [sicencePark2-03.png](../Models/industrial/2x2/sicencePark2-03.png) | 29px／1.6/1.7/1.8m | 1.35／1.84／2.69 | 2×2（主參考情境）；本體約91.8%地盤 | 多參照情境相近 |
| [industrialBuilding3-01.png](../Models/industrial/3x3/industrialBuilding3-01.png) | 50px／3.5/4.5/5.5m | 1.82／2.82／4.30 | 3×3（主參考情境）；本體約93.9%地盤 | 單參照推算 |
| [industrialBuilding3-02.png](../Models/industrial/3x3/industrialBuilding3-02.png) | 39px／3.5/4.5/5.5m | 2.21／3.58／5.88 | 4×4（主參考情境）；本體約89.5%地盤 | 單參照推算 |
| [sciencePark3-01.png](../Models/industrial/3x3/sciencePark3-01.png) | 135px／15.2/16.8/19.2m | 3.23／3.83／4.73 | 4×4（主參考情境）；本體約95.8%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [sciencePark3-02.png](../Models/industrial/3x3/sciencePark3-02.png) | 128px／15.2/16.8/19.2m | 3.45／4.11／5.10 | 4×4（主參考情境）；超出地盤2.8%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [eventGround.png](../Models/parks/park1x1/eventGround.png) | 格網定義 | — | 1×1（20m格網定義） | 格網定義 |
| [park1-01.png](../Models/parks/park1x1/park1-01.png) | 60px／1.5/1.8/2.1m | 0.44／0.59／0.80 | 1×1（主參考情境）；圖像本體只約0.59格，補地景；參照衝突，須分件／重製 | 參照衝突 |
| [park1-02.png](../Models/parks/park1x1/park1-02.png) | 62px／1.5/1.8/2.1m | 0.53／0.72／0.96 | 1×1（主參考情境）；圖像本體只約0.72格，補地景 | 多參照情境相近 |
| [park1-03.png](../Models/parks/park1x1/park1-03.png) | 129px／1.5/1.8/2.1m | 0.24／0.31／0.39 | 1×1（主參考情境）；圖像本體只約0.31格，補地景 | 多參照情境相近 |
| [park1-04.png](../Models/parks/park1x1/park1-04.png) | 144px／1.5/1.8/2.1m | 0.25／0.31／0.39 | 1×1（主參考情境）；圖像本體只約0.31格，補地景 | 多參照情境相近 |
| [park2-02.png](../Models/parks/park2x2/park2-02.png) | 80px／1.5/1.8/2.1m | 0.42／0.56／0.73 | 1×1（主參考情境）；圖像本體只約0.56格，補地景；參照衝突，須分件／重製 | 參照衝突 |
| [park2-03-highScore.png](../Models/parks/park2x2/park2-03-highScore.png) | 53px／1.5/1.8/2.1m | 0.62／0.85／1.17 | 1×1（主參考情境）；圖像本體只約0.85格，補地景；參照衝突，須分件／重製 | 參照衝突 |
| [sportField3-02.png](../Models/parks/park2x2/sportField3-02.png) | 464px／28/28/28m | 1.88／1.95／2.02 | 2×2（主參考情境）；本體約97.4%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [park3-01.png](../Models/parks/park3x3/park3-01.png) | 33px／1.5/1.8/2.1m | 0.90／1.34／2.06 | 2×2（主參考情境）；本體約67%地盤 | 多參照情境相近 |
| [sportField3-01.png](../Models/parks/park3x3/sportField3-01.png) | 30px／3.05/3.05/3.05m | 2.48／3.14／4.28 | 3×3（主參考情境）；超出地盤4.7%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [swimmingPool3-01.png](../Models/parks/park3x3/swimmingPool3-01.png) | 228px／50/50/50m | 5.29／5.47／5.67 | 6×6（主參考情境）；本體約91.2%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [victoriaPark4-01.png](../Models/parks/park4x4/victoriaPark4-01.png) | 27px／1.5/1.8/2.1m | 1.08／1.68／2.79 | 2×2（主參考情境）；本體約84%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [victoriaPark4-module01.png](../Models/parks/park4x4/victoriaPark4-module01.png) | 27px／1.5/1.8/2.1m | 1.08／1.68／2.79 | 2×2（主參考情境）；本體約84%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [victoriaPark4-module02.png](../Models/parks/park4x4/victoriaPark4-module02.png) | 28px／1.5/1.8/2.1m | 1.05／1.62／2.65 | 2×2（主參考情境）；本體約81%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [victoriaPark4-module03.png](../Models/parks/park4x4/victoriaPark4-module03.png) | 17px／1.6/1.7/1.8m | 2.35／3.09／4.27 | 3×3（主參考情境）；超出地盤2.9%，須在誤差範圍內微調 | 多參照情境相近 |
| [victoriaPark4-module04.png](../Models/parks/park4x4/victoriaPark4-module04.png) | 124px／23.77/23.77/23.77m | 4.54／4.83／5.16 | 5×5（主參考情境）；本體約96.6%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [victoriaPark4-module05.png](../Models/parks/park4x4/victoriaPark4-module05.png) | 27px／3/3/3m | 2.16／2.80／3.98 | 3×3（主參考情境）；本體約93.3%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [victoriaPark4-module06.png](../Models/parks/park4x4/victoriaPark4-module06.png) | 30px／1.5/1.8/2.1m | 0.99／1.51／2.40 | 2×2（主參考情境）；本體約75.6%地盤；參照有歧義，未定案 | 參照有歧義 |
| [coalPowerPlant.png](../Models/powerStation/coalPowerPlant.png) | 39px／1.6/1.7/1.8m | 0.88／1.08／1.35 | 2×2（主參考情境）；本體約53.8%地盤 | 多參照情境相近 |
| [nuclearPower4x4.png](../Models/powerStation/nuclearPower4x4.png) | 180px／80/100/140m | 15.48／20.43／30.28 | 設計情境約20.43格；無獨立實尺，暫不定格數 | 參照有歧義 |
| [solarPowerPlant.png](../Models/powerStation/solarPowerPlant.png) | 154px／9/10.8/12.6m | 1.37／1.73／2.13 | 2×2（主參考情境）；本體約86.7%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [house1-01-L-LD.png](../Models/residential/house1x1/house1-01-L-LD.png) | 56px／2/2.1/2.3m | 0.89／1.07／1.37 | 1×1（主參考情境）；超出地盤6.9%，須在誤差範圍內微調；參照有歧義，未定案 | 參照有歧義 |
| [house1-02-L-LD.png](../Models/residential/house1x1/house1-02-L-LD.png) | 66px／2/2.1/2.3m | 0.88／1.03／1.28 | 1×1（主參考情境）；超出地盤3.1%，須在誤差範圍內微調；參照有歧義，未定案 | 參照有歧義 |
| [house1-03-L-LD.png](../Models/residential/house1x1/house1-03-L-LD.png) | 148px／5.6/6/6.4m | 0.96／1.08／1.22 | 2×2（主參考情境）；本體約54%地盤 | 多參照情境相近 |
| [house1-05-H-LD.png](../Models/residential/house1x1/house1-05-H-LD.png) | 212px／5.6/6/6.4m | 0.80／0.89／0.98 | 1×1（主參考情境）；圖像本體只約0.89格，補地景；參照衝突，須分件／重製 | 參照衝突 |
| [house1-06-H-LD.png](../Models/residential/house1x1/house1-06-H-LD.png) | 152px／5.6/6/6.4m | 1.10／1.24／1.39 | 2×2（主參考情境）；本體約61.9%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential2-01-M-HD.png](../Models/residential/house2x2/residential2-01-M-HD.png) | 484px／47.6/51/54.4m | 1.58／1.72／1.86 | 2×2（主參考情境）；本體約86%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential2-02-M-HD.png](../Models/residential/house2x2/residential2-02-M-HD.png) | 212px／28/30/32m | 2.26／2.52／2.79 | 3×3（主參考情境）；本體約83.9%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential2-03-UH-LD.png](../Models/residential/house2x2/residential2-03-UH-LD.png) | 189px／14/15/16m | 2.16／2.41／2.69 | 3×3（主參考情境）；本體約80.4%地盤 | 多參照情境相近 |
| [residential2-04-L-MD.png](../Models/residential/house2x2/residential2-04-L-MD.png) | 345px／16.8/18/19.2m | 1.49／1.64／1.79 | 2×2（主參考情境）；本體約81.8%地盤 | 多參照情境相近 |
| [residential2-05-L-MD.png](../Models/residential/house2x2/residential2-05-L-MD.png) | 387px／16.8/18/19.2m | 1.29／1.41／1.53 | 2×2（主參考情境）；本體約70.3%地盤 | 多參照情境相近 |
| [residential2-06-M-MD.png](../Models/residential/house2x2/residential2-06-M-MD.png) | 399px／28/30/32m | 2.16／2.36／2.57 | 3×3（主參考情境）；本體約78.6%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential2-07-M-MD.png](../Models/residential/house2x2/residential2-07-M-MD.png) | 270px／14/15/16m | 1.52／1.68／1.85 | 2×2（主參考情境）；本體約84%地盤 | 多參照情境相近 |
| [residential2-09-UH-MD.png](../Models/residential/house2x2/residential2-09-UH-MD.png) | 252px／14/15/16m | 1.69／1.86／2.05 | 2×2（主參考情境）；本體約93.2%地盤 | 多參照情境相近 |
| [residential2-10-H-MD.png](../Models/residential/house2x2/residential2-10-H-MD.png) | 276px／16.8/18/19.2m | 1.41／1.57／1.73 | 2×2（主參考情境）；本體約78.3%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential2-11-H-MD.png](../Models/residential/house2x2/residential2-11-H-MD.png) | 274px／14/15/16m | 1.56／1.72／1.89 | 2×2（主參考情境）；本體約85.8%地盤 | 多參照情境相近 |
| [residential2-12-UH-LD.png](../Models/residential/house2x2/residential2-12-UH-LD.png) | 52px／4.2/4.6/5m | 1.73／2.27／3.05 | 3×3（主參考情境）；本體約75.5%地盤；參照有歧義，未定案 | 參照有歧義 |
| [residential2-13-UH-LD.png](../Models/residential/house2x2/residential2-13-UH-LD.png) | 66px／4.2/4.6/5m | 1.42／1.78／2.29 | 2×2（主參考情境）；本體約89.2%地盤；參照有歧義，未定案 | 參照有歧義 |
| [residential2-14-UH-LD.png](../Models/residential/house2x2/residential2-14-UH-LD.png) | 50px／2.8/3/3.2m | 1.51／1.87／2.38 | 2×2（主參考情境）；本體約93.6%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential2-15-H-HD.png](../Models/residential/house2x2/residential2-15-H-HD.png) | 180px／16.8/18/19.2m | 1.47／1.66／1.87 | 2×2（主參考情境）；本體約83%地盤 | 單參照推算 |
| [residential2-16-H-HD.png](../Models/residential/house2x2/residential2-16-H-HD.png) | 268px／16.8/18/19.2m | 1.10／1.22／1.36 | 2×2（主參考情境）；本體約61.2%地盤 | 單參照推算 |
| [residential2-17-H-HD.png](../Models/residential/house2x2/residential2-17-H-HD.png) | 266px／14/15/16m | 0.87／0.96／1.07 | 1×1（主參考情境）；圖像本體只約0.96格，補地景 | 單參照推算 |
| [residential2-18-H-HD.png](../Models/residential/house2x2/residential2-18-H-HD.png) | 292px／28/30/32m | 1.55／1.71／1.89 | 2×2（主參考情境）；本體約85.7%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential3-01-L-MD.png](../Models/residential/house3x3/residential3-01-L-MD.png) | 279px／28/30/32m | 3.06／3.37／3.70 | 4×4（主參考情境）；本體約84.3%地盤 | 多參照情境相近 |
| [residential3-02-L-MD.png](../Models/residential/house3x3/residential3-02-L-MD.png) | 429px／44.8/48/51.2m | 3.15／3.45／3.77 | 4×4（主參考情境）；本體約86.3%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential3-03-H-MD.png](../Models/residential/house3x3/residential3-03-H-MD.png) | 234px／16.8/18/19.2m | 2.18／2.41／2.66 | 3×3（主參考情境）；本體約80.4%地盤 | 多參照情境相近 |
| [residential3-04-H-MD.png](../Models/residential/house3x3/residential3-04-H-MD.png) | 320px／28/30/32m | 2.68／2.94／3.22 | 3×3（主參考情境）；本體約98%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential3-05-UH-LD.png](../Models/residential/house3x3/residential3-05-UH-LD.png) | 147px／23.77/23.77/23.77m | 4.49／4.80／5.15 | 5×5（主參考情境）；本體約95.9%地盤 | 多參照情境相近 |
| [residential3-06-L-MD.png](../Models/residential/house3x3/residential3-06-L-MD.png) | 280px／28/30/32m | 2.94／3.23／3.55 | 4×4（主參考情境）；本體約80.9%地盤 | 多參照情境相近 |
| [residential3-07-M-MD.png](../Models/residential/house3x3/residential3-07-M-MD.png) | 184px／28/30/32m | 4.40／4.92／5.49 | 5×5（主參考情境）；參照衝突，須分件／重製 | 參照衝突 |
| [residential3-08-M-MD.png](../Models/residential/house3x3/residential3-08-M-MD.png) | 364px／39.2/42/44.8m | 3.16／3.48／3.81 | 4×4（主參考情境）；本體約86.9%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential3-12-H-MD.png](../Models/residential/house3x3/residential3-12-H-MD.png) | 255px／14/15/16m | 1.39／1.55／1.72 | 2×2（主參考情境）；本體約77.5%地盤 | 單參照推算 |
| [residential3-14-M-MD.png](../Models/residential/house3x3/residential3-14-M-MD.png) | 420px／39.2/42/44.8m | 2.74／3.01／3.29 | 3×3（主參考情境）；超出地盤0.3%，須在誤差範圍內微調 | 多參照情境相近 |
| [residential4-01-M-MD.png](../Models/residential/house4x4/residential4-01-M-MD.png) | 232px／22.4/24/25.6m | 2.85／3.18／3.54 | 3×3（主參考情境）；超出地盤6%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [residential4-02-M-MD.png](../Models/residential/house4x4/residential4-02-M-MD.png) | 248px／22.4/24/25.6m | 3.00／3.34／3.71 | 4×4（主參考情境）；本體約83.5%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential5-01-H-MD.png](../Models/residential/house5x5/residential5-01-H-MD.png) | 140px／19.6/21/22.4m | 3.95／4.53／5.21 | 5×5（主參考情境）；本體約90.7%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [residential5-02-H-MD.png](../Models/residential/house5x5/residential5-02-H-MD.png) | 162px／19.6/21/22.4m | 3.54／4.03／4.58 | 4×4（主參考情境）；超出地盤0.6%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [residential5-03-L-HD.png](../Models/residential/house5x5/residential5-03-L-HD.png) | 202px／25.2/27/28.8m | 3.64／4.09／4.59 | 4×4（主參考情境）；超出地盤2.3%，須在誤差範圍內微調 | 單參照推算 |
| [residential9-01-H-MD.png](../Models/residential/house9x9/residential9-01-H-MD.png) | 140px／19.6/21/22.4m | 3.71／4.26／4.90 | 4×4（主參考情境）；超出地盤6.5%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [residential9-02-H-MD.png](../Models/residential/house9x9/residential9-02-H-MD.png) | 162px／19.6/21/22.4m | 3.21／3.66／4.16 | 4×4（主參考情境）；本體約91.4%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [fishMarket1-01.png](../Models/specialSites/1x1/fishMarket1-01.png) | 48px／0.75/0.85/0.95m | 0.42／0.55／0.74 | 1×1（主參考情境）；圖像本體只約0.55格，補地景 | 多參照情境相近 |
| [fishMarket1-02.png](../Models/specialSites/1x1/fishMarket1-02.png) | 43px／0.75/0.85/0.95m | 0.45／0.60／0.83 | 1×1（主參考情境）；圖像本體只約0.6格，補地景；參照衝突，須分件／重製 | 參照衝突 |
| [seafoodRestaurant1-01.png](../Models/specialSites/1x1/seafoodRestaurant1-01.png) | 47px／0.7/0.75/0.8m | 0.35／0.50／0.81 | 1×1（主參考情境）；圖像本體只約0.5格，補地景；參照有歧義，未定案 | 參照有歧義 |
| [seafoodRestaurant1-02.png](../Models/specialSites/1x1/seafoodRestaurant1-02.png) | 38px／0.7/0.75/0.8m | 0.41／0.62／1.14 | 1×1（主參考情境）；圖像本體只約0.62格，補地景；參照有歧義，未定案 | 參照有歧義 |
| [yachtClub1-01.png](../Models/specialSites/1x1/yachtClub1-01.png) | 122px／3.2/3.5/3.8m | 0.75／0.88／1.02 | 1×1（主參考情境）；圖像本體只約0.88格，補地景；參照衝突，須分件／重製 | 參照衝突 |
| [fishLoadingBay2-01.png](../Models/specialSites/2x2/fishLoadingBay2-01.png) | 125px／6/7/9m | 1.15／1.43／1.97 | 2×2（主參考情境）；本體約71.6%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [murrayHouse2-01.png](../Models/specialSites/2x2/murrayHouse2-01.png) | 67px／3.5/4/4.5m | 1.42／1.86／2.46 | 2×2（主參考情境）；本體約93%地盤 | 單參照推算 |
| [spaceMuseum2-01.png](../Models/specialSites/2x2/spaceMuseum2-01.png) | 23px／2.1/2.4/2.7m | 2.71／4.17／7.20 | 4×4（主參考情境）；超出地盤4.3%，須在誤差範圍內微調 | 單參照推算 |
| [tample2-01.png](../Models/specialSites/2x2/tample2-01.png) | 83px／2.4/3/3.6m | 0.79／1.09／1.44 | 2×2（主參考情境）；本體約54.3%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [tample2-02.png](../Models/specialSites/2x2/tample2-02.png) | 46px／2.2/2.5/3m | 1.23／1.63／2.37 | 2×2（主參考情境）；本體約81.7%地盤 | 多參照情境相近 |
| [buddha3-01.png](../Models/specialSites/3x3/buddha3-01.png) | 370px／26.4/26.4/26.4m | 2.76／2.82／2.88 | 3×3（主參考情境）；本體約94%地盤；參照衝突，須分件／重製 | 參照衝突 |
| [church3-01.png](../Models/specialSites/3x3/church3-01.png) | 57px／2.8/3/3.6m | 1.74／2.12／2.96 | 2×2（主參考情境）；超出地盤6.2%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [hungHomColiseum3-01_fixed.png](../Models/specialSites/3x3/hungHomColiseum3-01_fixed.png) | 27px／2.1/2.4/2.7m | 1.81／2.69／4.30 | 3×3（主參考情境）；本體約89.6%地盤 | 多參照情境相近 |
| [tample3-01.png](../Models/specialSites/3x3/tample3-01.png) | 32px／2.5/3/3.5m | 1.92／2.88／4.48 | 3×3（主參考情境）；本體約96%地盤 | 單參照推算 |
| [culturalCentre4-01.png](../Models/specialSites/4x4/culturalCentre4-01.png) | 13px／1.6/1.7/1.8m | 2.91／4.04／6.18 | 4×4（主參考情境）；超出地盤1%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [exhibitionCentre4-01.png](../Models/specialSites/4x4/exhibitionCentre4-01.png) | 72px／10.8/12/13.2m | 4.18／5.16／6.38 | 5×5（主參考情境）；超出地盤3.2%，須在誤差範圍內微調；參照衝突，須分件／重製 | 參照衝突 |
| [footballStadium4-02.png](../Models/specialSites/4x4/footballStadium4-02.png) | 244px／105/105/105m | 10.49／10.83／11.20 | 11×11（主參考情境）；參照衝突，須分件／重製 | 參照衝突 |
| [goldCoastHotel4-01.png](../Models/specialSites/4x4/goldCoastHotel4-01.png) | 204px／21/22.4/23.8m | 3.07／3.40／3.76 | 4×4（主參考情境）；本體約85%地盤 | 多參照情境相近 |
| [oceanPark4-01.png](../Models/specialSites/4x4/oceanPark4-01.png) | 11px／1.6/1.7/1.8m | 3.24／4.69／7.80 | 5×5（主參考情境）；本體約93.8%地盤 | 多參照情境相近 |

## 尺度來源及限制

- 手動樓層／門口／人物尺：data/scale-measurements-*.json，完整報告可顯示每條原圖座標線。
- 公園球場標準：[ITF網球23.77×10.97m](https://www.itftennis.com/en/about-us/organisation/tennis-glossary/)、[FIBA籃球28×15m](https://www.venueguide.fiba.basketball/vanue-design)、[FIFA足球105×68m推薦](https://legal.fifa.com/innovation/stadium-guidelines/technical-guidelines/stadiums-guidelines/pitch-dimensions-and-surrounding-areas)。標準不代表插畫內場地必然符合；半場、短池及自訂球場已保留歧義。
- 地標情境：[天壇大佛本體26.4m](https://www.islands.gov.hk/en/explores-tai-o-tian-tan-buddha-statue.php)、[中銀塔315／367.4m](https://www.bochk.com/en/aboutus/corpprofile/boctower.html)。僅作地標還原目標，插畫可能非實景還原。
- [HKSTP官方金蛋資料](https://www.hkstp.org/en/rental/space/mice-venue/hong-kong-science-park-mice-venues)未提供可直接套用的外殼尺寸；本輪以圖內人高情境交叉核對，未冒稱有真實金蛋測繪。
- 太空館官方23m是[內部投影天幕](https://hk.space.museum/en/web/spm/about-us.html)，不能誤當外殼直徑。
- 道具既有metadata保留來源座標系；bake前、鏡像前座標不直接畫到另一張圖。配置heightM／lengthM全標為designAssumption，未冒充實測。
- 節慶已有坐地人物0.28–0.3m及人群整組6m等配置，是縮合美術設定；須按個人骨架重設。
- 日夜、鏡像、atlas及未獨立覆量的方向，有各自精確像素邊界／hash，但不能宣稱每張都獨立確定了真實米數。
- 本次只寫量度與報告；未更改任何遊戲圖片、runtime格數或存檔。
