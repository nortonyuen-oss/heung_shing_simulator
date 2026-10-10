# 建築模型 Footprint 尺寸盤點

更新日期：2026-09-28

## 換算原則

- 地圖每格設定為 20m；方形 N×N footprint 的設定邊長是 N×20m，因此 3×3 = 60×60m、4×4 = 80×80m。若你所指的是整個方形 lot 的角對角線，則分別約為 84.9m、113.1m。
- 遊戲以 PNG 的可見輪廓寬度自動縮放到 footprint 的等角投影寬度；可見總寬本身不能獨立證明底盤尺寸。
- 「底盤估算」取 alpha 輪廓最前端往上約 alpha 寬度 1/4 的橫截面，按程式的 lot-fit 縮放比換算成地面邊長。只有 2D 透明 PNG，沒有 3D mesh 或建築底盤 metadata，故為圖像估算，信心欄不是測量精度保證。
- 底盤估算低於登記尺寸不一定表示 footprint 錯誤：塔樓、退縮、庭園、平台或外圍空地可能是設計的一部分。需要改 footprint 前，應目視確認底座邊界及遊戲內預覽。

## 總結

- 建築來源圖片：133 張；有 footprint 登記：133 張；未登記：0 張。
- 底盤橫截面估算比例偏離設定 lot 超過門檻（小於 80% 或大於 108%）：0 張，請見下方逐項表格。
- 「底盤比率」是估算橫截面寬度 ÷ alpha 可見總寬度；runtime 會把總寬 fit 到 lot，所以相同比率可跨不同原始 PNG 畫布比較。

## 逐項清單

| 模型檔案 | 分類 | 已設定佔地（換算地面邊長） | 底盤估算邊長（信心） | 底盤比率 | 原圖 / 可見輪廓 |
|---|---|---|---:|---:|---|
| Models/airPort/12x12/airport12-01.png | landmark, legacy save | 12x12 (240x240m); 6x6 (120x120m); 8x8 (160x160m) | 12x12: 約239x239m (較高); 6x6: 約119x119m (較高); 8x8: 約159x159m (較高) | 100% | 2048x1024; alpha 1571x815 |
| Models/busDepot/busDepot3_LL_fixed.png | transport | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1024x553 |
| Models/busDepot/busDepot3_LR_fixed.png | transport | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1024x553 |
| Models/busDepot/busDepot3_UL_fixed.png | transport | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1024x506 |
| Models/busDepot/busDepot3_UR_fixed.png | transport | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1024x506 |
| Models/commercial/1x1/commercialBuilding1-01-L.png | commercial | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 972x989 |
| Models/commercial/1x1/commercialBuilding1-02-M.png | commercial | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 700x876 |
| Models/commercial/1x1/commercialBuilding1-03-L.png | commercial | 1x1 (20x20m) | 1x1: 約19x19m (較高) | 96% | 1024x1024; alpha 714x922 |
| Models/commercial/1x1/commercialBuilding1-04-M.png | commercial | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 998x573 |
| Models/commercial/1x1/commercialBuilding1-05-L.png | commercial | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1536x1536; alpha 1314x768 |
| Models/commercial/2x2/commercialBuilding2-02-H.png | commercial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1009x598 |
| Models/commercial/2x2/commercialBuilding2-03-M.png | commercial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 958x878 |
| Models/commercial/2x2/commercialBuilding2-04-M.png | commercial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1011x686 |
| Models/commercial/2x2/commercialBuilding2-05-L.png | commercial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1005x822 |
| Models/commercial/2x2/commercialBuilding2-06-L.png | commercial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 866x996 |
| Models/commercial/3x3/commercialBuilding3-01-H.png | commercial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 943x964 |
| Models/commercial/3x3/commercialBuilding3-03-M.png | commercial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 984x806 |
| Models/commercial/3x3/commercialBuilding3-04-H.png | commercial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 992x866 |
| Models/commercial/3x3/commercialBuilding3-05-UH.png | commercial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 999x967 |
| Models/commercial/3x3/commercialBuilding3-07-M.png | commercial | 3x3 (60x60m) | 3x3: 約58x58m (較高) | 96% | 1024x1024; alpha 991x859 |
| Models/commercial/3x3/commercialBuilding3-08-H.png | commercial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 945x1014 |
| Models/commercial/3x3/commercialBuilding3-09-M.png | commercial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 984x869 |
| Models/commercial/3x3/commercialBuilding3-10-M.png | commercial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1003x813 |
| Models/commercial/3x3/commercialBuilding3-11-H.png | commercial | 3x3 (60x60m) | 3x3: 約59x59m (較高) | 99% | 1024x1024; alpha 1024x965 |
| Models/commercial/3x3/commercialBuilding3-12-M.png | commercial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 988x735 |
| Models/commercial/3x3/commercialBuilding3-13-H.png | commercial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 988x653 |
| Models/commercial/4x4/commercialBuilding4-01-H.png | commercial | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 954x763 |
| Models/commercial/4x4/commercialBuilding4-02-H.png | commercial | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1005x774 |
| Models/commercial/4x4/commercialBuilding4-03-L.png | commercial | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 991x676 |
| Models/commercial/4x4/commercialBuilding4-04-L.png | commercial | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1004x641 |
| Models/commercial/5x5/commercialBuilding5-01-UH.png | commercial | 5x5 (100x100m) | 5x5: 約100x100m (較高) | 100% | 1024x1200; alpha 984x986 |
| Models/containerPort/4x4/containerPort4-LL.png | transport | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1536x1536; alpha 1324x673 |
| Models/containerPort/4x4/containerPort4-LR.png | transport | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1536x1536; alpha 1324x673 |
| Models/containerPort/4x4/containerPort4-UL.png | transport | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1536x1536; alpha 1309x788 |
| Models/containerPort/4x4/containerPort4-UR.png | transport | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1536x1536; alpha 1309x788 |
| Models/government/2x2/fireStation2-01.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x726 |
| Models/government/2x2/firestation2-02.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1016x834 |
| Models/government/2x2/legislativeCouncil2-01.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1023x814 |
| Models/government/2x2/legislativeCouncil2-02.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 987x586 |
| Models/government/2x2/library2-01.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1013x582 |
| Models/government/2x2/policeStation2-01.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 998x705 |
| Models/government/2x2/policeStation2-02.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x602 |
| Models/government/2x2/primarySchool2-01.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1010x789 |
| Models/government/2x2/secondarySchool2-01.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x780 |
| Models/government/2x2/secondarySchool2-02.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x780 |
| Models/government/3x3/college3-01.png | civic | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 99% | 1024x1024; alpha 699x365 |
| Models/government/3x3/college3-02.png | civic | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 99% | 1024x1024; alpha 699x373 |
| Models/government/3x3/college3-03.png | civic | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 708x401 |
| Models/government/3x3/college3-04.png | civic | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1009x656 |
| Models/government/4x4/hospital4.png | civic | 4x4 (80x80m) | 4x4: 約79x79m (較高) | 99% | 1024x1024; alpha 1024x692 |
| Models/government/4x4/stockExchange4-01.png | civic | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1024x678 |
| Models/government/4x4/university4-01.png | civic | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1013x727 |
| Models/government/4x4/university4-02.png | civic | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1006x639 |
| Models/industrial/1x1/industrialBuilding1-01.png | industrial | 1x1 (20x20m) | 1x1: 約19x19m (較高) | 97% | 1024x1024; alpha 877x990 |
| Models/industrial/1x1/industrialBuilding1-02.png | industrial | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 935x875 |
| Models/industrial/2x2/industrialBuilding2-01.png | industrial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 988x860 |
| Models/industrial/2x2/industrialBuilding2-02.png | industrial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1006x824 |
| Models/industrial/2x2/industrialBuilding2-03.png | industrial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 99% | 1024x1024; alpha 1010x780 |
| Models/industrial/2x2/industrialBuilding2-04.png | industrial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 990x853 |
| Models/industrial/2x2/industrialBuilding2-05.png | industrial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 983x794 |
| Models/industrial/2x2/industrialBuilding2-06.png | industrial | 2x2 (40x40m) | 2x2: 約39x39m (較高) | 97% | 1024x1024; alpha 1017x726 |
| Models/industrial/2x2/industrialBuilding2-07.png | industrial | 2x2 (40x40m) | 2x2: 約39x39m (較高) | 99% | 1024x1024; alpha 988x797 |
| Models/industrial/2x2/sciencePark2-01.png | industrial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1015x663 |
| Models/industrial/2x2/sciencePark2-02.png | industrial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 994x790 |
| Models/industrial/2x2/sciencePark2-04.png | industrial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x729 |
| Models/industrial/2x2/sicencePark2-03.png | industrial | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1023x514 |
| Models/industrial/3x3/industrialBuilding3-01.png | industrial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1023x668 |
| Models/industrial/3x3/industrialBuilding3-02.png | industrial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1013x544 |
| Models/industrial/3x3/sciencePark3-01.png | industrial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1006x647 |
| Models/industrial/3x3/sciencePark3-02.png | industrial | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1024x638 |
| Models/parks/park1x1/park1-01.png | park | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 790x501 |
| Models/parks/park1x1/park1-02.png | park | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 986x630 |
| Models/parks/park1x1/park1-03.png | park | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 888x598 |
| Models/parks/park1x1/park1-04.png | park | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 1004x693 |
| Models/parks/park2x2/park2-02.png | park | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 998x577 |
| Models/parks/park2x2/park2-03-highScore.png | park | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1006x530 |
| Models/parks/park2x2/sportField3-02.png | civic | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1536x1536; alpha 1291x725 |
| Models/parks/park3x3/park3-01.png | park | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 983x528 |
| Models/parks/park3x3/sportField3-01.png | civic | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1012x660 |
| Models/parks/park3x3/swimmingPool3-01.png | park | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1200; alpha 998x522 |
| Models/parks/park4x4/victoriaPark4-01.png | park | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1009x535 |
| Models/powerStation/coalPowerPlant.png | power | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 807x660 |
| Models/powerStation/nuclearPower4x4.png | power | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1016x726 |
| Models/powerStation/solarPowerPlant.png | power | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 807x573 |
| Models/residential/house1x1/house1-01-L-LD.png | residential | 1x1 (20x20m) | 1x1: 約19x19m (較高) | 95% | 1024x1024; alpha 936x652 |
| Models/residential/house1x1/house1-02-L-LD.png | residential | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 99% | 1024x1024; alpha 989x763 |
| Models/residential/house1x1/house1-03-L-LD.png | residential | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 870x683 |
| Models/residential/house1x1/house1-05-H-LD.png | residential | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 1024x827 |
| Models/residential/house1x1/house1-06-H-LD.png | residential | 1x1 (20x20m) | 1x1: 約20x20m (較高) | 100% | 1024x1024; alpha 1024x694 |
| Models/residential/house2x2/residential2-01-M-HD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1200; alpha 533x969 |
| Models/residential/house2x2/residential2-02-M-HD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1200; alpha 581x966 |
| Models/residential/house2x2/residential2-03-UH-LD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 994x650 |
| Models/residential/house2x2/residential2-04-L-MD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x981 |
| Models/residential/house2x2/residential2-05-L-MD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 988x961 |
| Models/residential/house2x2/residential2-06-M-MD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x930 |
| Models/residential/house2x2/residential2-07-M-MD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 988x891 |
| Models/residential/house2x2/residential2-09-UH-MD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1022x807 |
| Models/residential/house2x2/residential2-10-H-MD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1200; alpha 784x964 |
| Models/residential/house2x2/residential2-11-H-MD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x922 |
| Models/residential/house2x2/residential2-12-UH-LD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x586 |
| Models/residential/house2x2/residential2-13-UH-LD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1024x761 |
| Models/residential/house2x2/residential2-14-UH-LD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1019x577 |
| Models/residential/house2x2/residential2-15-H-HD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1200; alpha 542x1018 |
| Models/residential/house2x2/residential2-16-H-HD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1200; alpha 597x965 |
| Models/residential/house2x2/residential2-17-H-HD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1200; alpha 560x995 |
| Models/residential/house2x2/residential2-18-H-HD.png | residential | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1200; alpha 545x1045 |
| Models/residential/house3x3/residential3-01-L-MD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1024x854 |
| Models/residential/house3x3/residential3-02-L-MD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1007x902 |
| Models/residential/house3x3/residential3-03-H-MD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1024x854 |
| Models/residential/house3x3/residential3-04-H-MD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1024x979 |
| Models/residential/house3x3/residential3-05-UH-LD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 1024x597 |
| Models/residential/house3x3/residential3-06-L-MD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 986x742 |
| Models/residential/house3x3/residential3-07-M-MD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1200; alpha 986x818 |
| Models/residential/house3x3/residential3-08-M-MD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1200; alpha 984x839 |
| Models/residential/house3x3/residential3-12-H-MD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1200; alpha 860x1105 |
| Models/residential/house3x3/residential3-14-M-MD.png | residential | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1200; alpha 983x875 |
| Models/residential/house4x4/residential4-01-M-MD.png | residential | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1004x802 |
| Models/residential/house4x4/residential4-02-M-MD.png | residential | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1024x919 |
| Models/residential/house5x5/residential5-01-H-MD.png | residential | 5x5 (100x100m) | 5x5: 約99x99m (較高) | 99% | 1024x1024; alpha 988x693 |
| Models/residential/house5x5/residential5-02-H-MD.png | residential | 5x5 (100x100m) | 5x5: 約98x98m (較高) | 98% | 1024x1024; alpha 1014x702 |
| Models/residential/house5x5/residential5-03-L-HD.png | residential | 5x5 (100x100m) | 5x5: 約100x100m (較高) | 100% | 1024x1200; alpha 1000x623 |
| Models/specialSites/2x2/murrayHouse2-01.png | landmark | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 1019x582 |
| Models/specialSites/2x2/spaceMuseum2-01.png | landmark | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1536x1536; alpha 1306x653 |
| Models/specialSites/2x2/tample2-01.png | landmark | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 982x672 |
| Models/specialSites/2x2/tample2-02.png | landmark | 2x2 (40x40m) | 2x2: 約40x40m (較高) | 100% | 1024x1024; alpha 982x560 |
| Models/specialSites/3x3/buddha3-01.png | landmark | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1536x1536; alpha 1291x869 |
| Models/specialSites/3x3/church3-01.png | landmark | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1536x1536; alpha 1318x905 |
| Models/specialSites/3x3/hungHomColiseum3-01_fixed.png | landmark | 3x3 (60x60m) | 3x3: 約60x60m (較高) | 100% | 1024x1024; alpha 988x609 |
| Models/specialSites/3x3/tample3-01.png | landmark | 3x3 (60x60m) | 3x3: 約59x59m (較高) | 99% | 1024x1024; alpha 1004x581 |
| Models/specialSites/4x4/culturalCentre4-01.png | landmark | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1200; alpha 1010x563 |
| Models/specialSites/4x4/exhibitionCentre4-01.png | landmark | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1011x655 |
| Models/specialSites/4x4/footballStadium4-02.png | landmark | 4x4 (80x80m) | 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 1007x593 |
| Models/specialSites/4x4/oceanPark4-01.png | landmark, legacy save | 8x8 (160x160m); 4x4 (80x80m) | 8x8: 約160x160m (較高); 4x4: 約80x80m (較高) | 100% | 1024x1024; alpha 991x622 |

## 未登記模型

- 無

## 判讀

- 登記尺寸是建築可放置及碰撞使用的正式格數；底盤估算只能指出值得複核的圖像，不能自動改變建築 footprint。
- 舊存檔相容設定（例如舊版機場／海洋公園）會與同一張 source PNG 分別列出，因為它們在遊戲中代表不同的佔地 footprint。
