# 中秋素材（原圖）

設計：[docs/festival-dlc-design.md §4.5](../../../../../docs/festival-dlc-design.md)。生成 prompt 同規矩：[prompts.md](prompts.md)。

呢度係原圖，未做等角校正，亦未烘焙。烘焙出嚟嘅 `fx_` 貼圖會放喺 `Models/festivals/`。

| 資料夾 | 內容 | 狀態 |
|---|---|---|
| `v2/` | 2026-10-31 按 prompts.md 重新生成：人物、煲蠟、警員、火龍、玉兔月亮燈飾 | **用呢批** |
| 根目錄 | 2026-10-11 第一批燈飾同擺設（midAutumn1–12）、第一版火龍 | 燈飾照用；火龍由 v2 取代 |
| `chibi-v1/` | 2026-10-31 第一次補畫，Q 版大頭 | 已取代，唔用，保留存檔 |

## v2（現用）

| 檔案 | 原檔名 | 內容 | 用途 | 核對 | 處理 |
|---|---|---|---|---|---|
| moonViewers | image-gen-1 | 6 人分格：指月爸爸、媽媽、婆婆、拎楊桃燈仔仔、拎兔仔燈囡囡、影月亮女仔 | 維園賞月、行花燈 | 1536×1024，冇裁切 | 原圖逐格切（`maViewer*`） |
| picnicFamily | image-gen-2 | 格仔蓆，一家四口坐低，月餅、柚子、茶、兔仔燈 | 公園草地賞月 | 蓆邊斜度 0.591／−0.585 | 校正 `{"down":0.591,"up":0.585}` → `MidAutumn/v2/`（`maPicnic`） |
| candleMeltingKids | image-gen-3 | 五個細路圍住鐵罐煲蠟，罐有火 | 公園煲蠟 | 1254×1254，冇裁切 | 原圖（`maCandleKids`），遊戲加火光閃爍 |
| candleMeltingTin | image-gen-4 | 淨鐵罐，蠟未點 | 暫時未用（煲蠟用細路組） | 罐底橢圓約 2.03:1，已合 | — |
| policePatrol | image-gen-5 | 警員兩名：男拎對講機向右下、女拎電筒向左下 | 凌晨巡查煲蠟 | 1536×1024，冇裁切 | 原圖切開（`maPoliceMan`、`maPoliceWoman`） |
| fireDragonSE | image-gen-6 | 火龍向右下，13 人加龍珠 | 舞火龍；鏡像得向左下 | 腳底線斜度 0.41（目標 0.5） | 校正 `{"d":1,"c":0.09}`，校正後 0.499（`maFireDragonSE`） |
| fireDragonNE | image-gen-7 | 火龍向右上，背面為主 | 舞火龍；鏡像得向左上 | 腳底線斜度 −0.46 | 校正 `{"d":1,"c":-0.04}`，校正後 −0.499（`maFireDragonNE`） |
| jadeRabbitMoon_night | image-gen-8 | 月亮玉兔大燈飾，亮燈 | 維園花燈中心（取代 midAutumn5） | 圓台約 2.5:1，略扁 | 唔校正：拉高 25% 會變形（`maJadeRabbitMoon`） |
| jadeRabbitMoon_day | image-gen-9 | 同一件，日間熄燈 | 暫時未用：燈飾日頭照亮（Norton 2026-10-31） | 同夜間版輪廓重疊 99.4%，相差 1 px | — |

## 第一批燈飾（照用）

| 檔案 | 內容 | 用途 | 處理 |
|---|---|---|---|
| midAutumn1 | 蓮花大燈 | 維園花燈（`maLotus`） | 原圖烘焙，已近 2:1 |
| midAutumn3 | 玉兔燈組 | 維園花燈（`maRabbitSet`） | 原圖烘焙 |
| midAutumn5 | 月亮玉兔大燈飾 | 已由 v2 jadeRabbitMoon 取代 | — |
| midAutumn8 | 兔仔燈（有轆） | 維園花燈（`maRabbitCart`） | 原圖烘焙 |
| midAutumn10 | 金魚燈 | 維園掛燈（未用：冇嘢掛） | 正面圖 |
| midAutumn4 | 燈籠柱 | 維園花燈場邊、火龍路線路邊（`maLanternPole`） | 原圖烘焙 |
| midAutumn2 | 賞月枱 | 公園賞月（`maMoonTable`，已烘焙未擺） | 原圖烘焙 |
| midAutumn7、9、11、12 | 楊桃燈（大細）、圓燈籠、宮燈 | 路邊掛燈 | 正面圖 |
| midAutumn6 | 火車燈籠 ×2 | 細路手提 | 拆開兩件 |
| fireDragonNW、fireDragonSW | 第一版火龍 | 已由 v2 取代 | — |

## 日間版

Norton 2026-10-31：日頭照亮。燈飾日夜都用亮燈原圖，夜晚由烘焙壓暗、留燈光；唔再需要日間熄燈版。
