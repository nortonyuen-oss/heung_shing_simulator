# 街坊小食墟人物：24 人

使用內建 imagegen，四張原始素材表均保留透明背景。生成時參考既有車仔材質、龍舟觀眾人物比例及摺凳座位高度。

| 素材表 | 人數 | 圖片 | 完整 prompt |
|---|---:|---|---|
| 檔主 | 4 | [hawkers.png](hawkers.png) | [設定](hawkers-prompt.md) |
| 站立食客 | 8 | [standing-diners.png](standing-diners.png) | [設定](standing-diners-prompt.md) |
| 坐食客 | 6 | [seated-diners.png](seated-diners.png) | [設定](seated-diners-prompt.md) |
| 路人 | 6 | [passersby.png](passersby.png) | [設定](passersby-prompt.md) |

四位檔主按身形、年齡與服裝區分：豐滿阿姐圍裙、白背心大肚腩阿叔、花衫阿婆、瘦削後生仔。站立食客首排是一家四口，次排是情侶與老夫妻；坐姿包括兩個背向角度，方便圍檯配置。路人是自然跨步姿勢。

已拆成 [24 個獨立 PNG](../../../../Models/streetFoodPeople/README.md)。拆件按 alpha≥128 的主要人物輪廓排序，再在鄰近人物間留白取矩形，保留矩形內完整原始 RGBA 像素並補透明邊。原圖排版非完全等距，未按固定格線截斷人物。

[people-plan.json](people-plan.json) 記錄人物種類、建議身高、來源排列及近似坐點；[street-food-people.json](../../../../data/street-food-people.json) 記錄每人來源矩形、獨立檔案、腳點及座點。全部為靜態姿勢；場景身高、座點與遮擋仍需實際配置校位。
