# 《玩轉18區》美術債 · ChatGPT prompts

2026-11-21 整理。用法：

- 每個 prompt 開一個新對話貼入 ChatGPT（圖片生成），**附上指定嘅參考圖**，風格會夾好多。
- 建築同船：要**透明背景 PNG**。出唔到透明都唔緊要，我可以清背景，但唔好有陰影投落背景。
- 出完將圖或者分享連結（chatgpt.com/s/…）交俾我，我負責校正、裁切同接入遊戲。
- 參考圖喺 repo 入面，路徑寫喺每項。

優先次序：A（地圖上長期見到）→ B（頭像，按出場次數）→ C（插圖，可選）。

已完成：市長六款樣貌（陳一心、李幼羚、張思賢、黃念慈、何向華、林英秀，名字用考評局中文寫作卷指定名單）、B1 旅遊署代表、B2 Captain Cool。

2026-11-21 第二批已完成：A1 沙田馬場（6×12，切開兩個 6×6 半邊加鏡像，`racecourse.js`）、A2 濕地公園、A3 社區中心、A4 啟德郵輪（日間）、B3 碼頭主任，另加第 14 章結尾插圖（郵輪碼頭開幕同賭船，`UI/campaign/events/cruiseTerminalOpening.webp`）。仲欠：A1 夜間、A4 夜間、A5、B12–B17、C1–C2（B4–B11、B18、B19 喺同日第三、四批完成）。

---

## 共用風格段落

以下三段喺各 prompt 入面已經包含，唔使另外貼。列出嚟方便你自己改。

**建築（STYLE-BUILDING）**
> Isometric game asset for a Hong Kong city-building game, strict 2:1 isometric projection (ground edges at exactly 26.565°, vertical lines perfectly vertical, no perspective, no vanishing points), seen from the south with the lot's front corner at the bottom centre. Highly detailed painted pixel-art style like the attached reference, warm daylight from the upper left, muted realistic materials (concrete, glass, tiles, greenery), small people and vehicles for scale. The whole square lot is drawn as a flat paved base plate that fills the image edge to edge. Transparent background (PNG with alpha), no drop shadow outside the lot, no text, no letters, no logos, no watermark.

**頭像（STYLE-PORTRAIT）**
> Square 1:1 character portrait, 1024×1024, chest-up, three-quarter view, vibrant Hong Kong anime/manga illustration with bold clean ink outlines, rich saturated colours and an expressive comic caricature, like the attached reference portraits. Background: a softly blurred Hong Kong location tied to the character's job. No text, no letters, no name tags, no logos, no watermark.

**插圖（STYLE-SCENE）**
> 16:9 landscape illustration, 1600×900, vibrant Hong Kong anime illustration with clean outlines, cinematic lighting and lively crowds, in the same style as the attached reference board. Recognisably Hong Kong streets, signs and buildings, but no readable text, no captions, no logos, no watermark.

---

## A. 建築同船（最優先）

### ~~A1. 沙田馬場~~（2026-11-21 完成：6×12，`racecourse.js`；夜間版未有）

- 地盤：建議 6×6（遊戲一格 20 米，馬場要壓縮）；你覺得 4×4 比例啱都得，話我知。
- 附參考圖：`scripts/source-art/walledCity/walledCityPark4-01-source.png`（風格）
- 交付：透明 PNG，約 1500px 闊；日間一張，夜間一張（可選）。

```
Isometric game asset for a Hong Kong city-building game, strict 2:1 isometric projection (ground edges at exactly 26.565°, vertical lines perfectly vertical, no perspective), front corner of the lot at the bottom centre. Highly detailed painted pixel-art style like the attached reference, warm daylight, muted realistic materials, transparent background (PNG with alpha), no text, no logos, no watermark.

Subject: the Sha Tin Racecourse in Hong Kong, compressed to fit one square lot. A green turf oval race track with white running rails wraps around an inner lawn with a small lake, a long multi-tier grandstand along the back edge with a big blank video screen, a parade ring with a few racehorses and jockeys in colourful silks, a horse lined up at the starting gate, spectators on the stands, a few palm trees and the paved lot edges. The square lot is a flat base plate filling the image edge to edge. Daytime race day atmosphere.
```

夜間版（同一個對話入面接住出）：

```
Same image, same composition and camera, at night during a floodlit evening race: tall floodlights on, the track brightly lit, warm lights in the grandstand windows, the sky not visible (transparent background). Keep every building and the lot outline in exactly the same place.
```

### ~~A2. 濕地公園~~（2026-11-21 完成：4×4）

- 地盤：4×4
- 附參考圖：`scripts/source-art/walledCity/walledCityPark4-01-source.png`
- 交付：透明 PNG，約 1200px 闊

```
Isometric game asset for a Hong Kong city-building game, strict 2:1 isometric projection (ground edges at exactly 26.565°, vertical lines perfectly vertical, no perspective), front corner of the lot at the bottom centre. Highly detailed painted pixel-art style like the attached reference, warm daylight, muted realistic natural colours, transparent background (PNG with alpha), no text, no logos, no watermark.

Subject: the Hong Kong Wetland Park in Tin Shui Wai, on one square lot. A low curved visitor centre with a sloping grass-covered roof at the back, wooden boardwalks winding over shallow ponds, reed beds and mangroves, a small wooden bird hide, white egrets and herons in the water, a few visitors with cameras on the boardwalk, families walking. The square lot is a flat base plate filling the image edge to edge, its edges paved in grey stone.
```

### ~~A3. 社區中心~~（2026-11-21 完成）

- 地盤：2×2
- 附參考圖：`Models/government/2x2/library2-01.png`（而家頂住用嘅圖書館，風格同比例參考）
- 交付：透明 PNG，約 800px 闊

```
Isometric game asset for a Hong Kong city-building game, strict 2:1 isometric projection (ground edges at exactly 26.565°, vertical lines perfectly vertical, no perspective), front corner of the lot at the bottom centre. Highly detailed painted pixel-art style like the attached reference, warm daylight, muted realistic materials, transparent background (PNG with alpha), no text, no logos, no watermark.

Subject: a Hong Kong government community centre (社區中心) from the 1980s on one small square lot: a 4-storey concrete civic building with cream mosaic tiles and horizontal window bands, a covered entrance with a ramp, a multi-purpose hall with high windows on one side, a small fenced courtyard with benches where elderly residents sit and children play, a noticeboard without readable text, potted plants. The square lot is a flat paved base plate filling the image edge to edge.
```

### ~~A4. 啟德郵輪~~（2026-11-21 完成日間版；夜間版未有）

- 雙視圖，好似 `Models/vessels/starFerry_dualView.png`（請附上）
- 左邊：船頭向畫面右下；右邊：船頭向畫面右上
- 長 : 闊 : 水面以上高度 ≈ 8 : 1 : 1.5；每個視圖船身大約 1,600px 長
- 唔好有字（會鏡像）；日間一張、夜間一張

```
Two isometric views of the same modern cruise ship side by side on one transparent canvas (PNG with alpha), exactly like the attached Star Ferry dual-view sheet. Strict 2:1 isometric projection, no perspective. Left view: the bow points to the lower right. Right view: the bow points to the upper right. The ship is long and slender: length : beam : height above the waterline about 8 : 1 : 1.5. White hull with a deep navy waterline band, many decks of balcony cabins, rows of lifeboats, a pool deck with blue pools and sun loungers, a single funnel in deep green and gold, radar mast. Highly detailed painted pixel-art style, warm daylight. The hull is cut at the waterline (no water drawn). No text, no names, no logos, no flags with letters, no watermark.
```

夜間版：

```
Same sheet, same two views in exactly the same position and size, at night: hundreds of warm cabin windows and deck lights on, string lights along the upper decks, pool decks glowing blue, navigation lights red and green. Transparent background, no water drawn.
```

### A5. 郵輪碼頭夜景（可選）

- 附上兩張現有日間圖：`scripts/source-art/cruiseTerminal/cruiseTerminal6-02-sea-source.png`、`cruiseTerminal6-02-land-source.png`
- 每張分開一個對話，交付時要同日間圖**構圖完全一樣**

```
Redraw the attached image at night with exactly the same composition, camera, size and outline - only the lighting changes. Night time: warm interior lights glowing through all the terminal's glass walls, the roof garden softly lit with small lamps, street lamps and floodlights on the quay, the coaches and taxis with headlights on, the boarding bridges lit inside. Keep the transparent background. No text, no watermark.
```

---

## B. 角色頭像（按出場次數）

全部附上 2–3 張現有頭像做風格參考，例如 `UI/campaign/portraits/scientist.webp`、`foodie.webp`、`tram.png`。交付 1024×1024 方形。

### ~~B1. 旅遊署代表~~（2026-11-21 完成：改用康文署官員頭像）

```
Square 1:1 character portrait, 1024×1024, chest-up, three-quarter view, vibrant Hong Kong anime/manga illustration with bold clean ink outlines, rich saturated colours and an expressive comic caricature, like the attached reference portraits. No text, no name tags, no logos, no watermark.

Character: the Hong Kong Tourism Board representative, an upbeat woman in her thirties with a neat bob haircut, a bright teal blazer with a bauhinia flower brooch, holding a tablet showing a rising visitor chart, beaming a salesperson's smile. Background: softly blurred Victoria Harbour with the Star Ferry and the skyline at golden hour.
```

### ~~B2. 航空署代表~~（2026-11-21 完成：Captain Cool，`UI/campaign/portraits/aviation.webp`）

```
[Same style paragraph as B1]

Character: a Civil Aviation Department officer, a calm middle-aged man in a navy uniform with a high-visibility vest over it and an airport ID badge, holding a clipboard, a headset around his neck. Background: softly blurred airport apron at Chek Lap Kok with a jet taxiing and the control tower.
```

### ~~B3. 碼頭主任~~（2026-11-21 完成）

```
[Same style paragraph as B1]

Character: a container terminal port master, a weathered tough man in his fifties with a grey crew cut, orange high-visibility vest and white hard hat, holding a walkie-talkie, squinting with authority. Background: softly blurred Kwai Tsing container terminal with giant gantry cranes and stacked colourful containers at dusk.
```

### ~~B4. 教育署代表~~（2026-11-21 完成）

```
[Same style paragraph as B1]

Character: an Education Bureau representative, a strict but kind woman in her forties with glasses on a chain, a cardigan over a blouse, holding a stack of school reports and a red pen. Background: softly blurred Hong Kong secondary school classroom with a blackboard and uniformed students.
```

### ~~B5. 工廠老闆~~（2026-11-21 完成）

```
[Same style paragraph as B1]

Character: an old-school Hong Kong factory owner, a stout man in his sixties with slicked-back grey hair, a short-sleeved shirt with a pen in the pocket, a gold watch, arms crossed, sceptical frown. Background: softly blurred industrial building corridor in Kwun Tong with goods lifts and cardboard boxes.
```

### ~~B6. 工人代表~~（2026-11-21 完成）

```
[Same style paragraph as B1]

Character: a workers' representative, a lean determined man in his forties with rolled-up sleeves, a faded union T-shirt and a towel over his shoulder, raising one hand to make a point. Background: softly blurred factory floor turning into a modern office lobby.
```

### ~~B7. 記者~~（2026-11-21 完成）

```
[Same style paragraph as B1]

Character: a young investigative reporter, a sharp woman in her twenties with a short ponytail, a press badge on a lanyard, holding out a microphone and a phone recording, eyebrows raised mid-question. Background: softly blurred Legislative Council chamber corridor with camera flashes.
```

### ~~B8. 夜市老闆~~（2026-11-21 完成：煲仔飯老闆娘；另加廟街算命嘅 So師傅，兩個都喺第 17 章「一晚三個油尖旺」出場）

```
[Same style paragraph as B1]

Character: a Temple Street night market claypot rice (煲仔飯) stall owner, a cheerful plump man in his fifties with a white vest and an apron, holding a sizzling claypot with a cloth, steam rising. Background: softly blurred Temple Street night market with neon and red lanterns.
```

### ~~B9. 青年義工~~（2026-11-21 完成）

```
[Same style paragraph as B1]

Character: a youth volunteer, an energetic university student in a bright volunteer vest over a hoodie, carrying a box of food parcels, warm smile. Background: softly blurred Sham Shui Po street with old tenement buildings and street stalls.
```

### ~~B10. 製片人~~（2026-11-21 完成）

```
[Same style paragraph as B1]

Character: a Hong Kong film producer, a flamboyant man in his fifties with tinted sunglasses on his head, a leather jacket and a scarf, holding a megaphone and a clapperboard (no writing on it). Background: softly blurred film set inside a recreated Kowloon Walled City alley with film lights.
```

### ~~B11. 新聞主播~~（2026-11-21 完成，取代新聞圖裁切）

```
[Same style paragraph as B1]

Character: a TV news anchor, a polished woman in her thirties with sleek hair and a tailored blazer, sitting at a news desk with a serious-but-friendly expression, holding a sheaf of papers. Background: softly blurred news studio with a big screen showing the Hong Kong skyline.
```

### B12–B17. 借用議會圖嘅官員（1–2 句，可遲啲）

每個用 B1 嘅風格段落，再換角色描述：

- **工商署代表**：`a Commerce Bureau official, a polished businessman in a pinstripe suit with a silver tie, holding a glossy brochure of grade-A office towers. Background: Kowloon East office towers.`
- **金融署代表**：`a Financial Services official, a sharp woman in a dark suit with a pearl necklace, glancing at a stock ticker on her phone. Background: Central's skyscrapers with a red-and-green stock board.`
- **文化署代表**：`a Culture Bureau official, an artsy man with round glasses, a mandarin-collar jacket and a programme booklet. Background: West Kowloon arts district and the harbourfront at dusk.`
- **環境署代表**：`an Environment Bureau official, an outdoorsy woman in a green fleece with a reusable bottle and binoculars. Background: green hills and a wetland with egrets.`
- **議員甲**：`a reform-minded legislator, a young man in a simple suit holding a thick folder of open-data printouts, earnest expression. Background: Legislative Council chamber.`
- **議員乙**：`a cautious veteran legislator, an older woman in a tailored qipao-style jacket holding a procedure manual, measured expression. Background: Legislative Council chamber.`

### ~~B18. 離島地區代表人物~~（2026-11-21 完成：大澳阿婆，第 10 章開場同纜車事件各一句）

其他 17 區都有一個代表人物，離島冇。建議兩個選擇，你揀一個，或者話我知你心目中嘅人物：

- **大澳阿婆**：`a sun-tanned grandmother from Tai O in a wide straw hat, selling shrimp paste and salted fish from a wooden stall, laughing. Background: Tai O stilt houses over the water.`
- **東涌機場地勤**：`a young airport ground crew member in ear defenders and a high-vis vest, waving marshalling wands. Background: Chek Lap Kok runway with a plane landing.`

### ~~B19. 神童標名牌修正~~（2026-11-21 完成：換咗新頭像，冇名牌）

附上 `UI/storyBoardGraphics/NPC/horseRacer.png`（或者現有 `UI/campaign/portraits/commentator.webp`）：

```
Edit the attached image: change only the text on the name plate so that it reads 神童標 in bold traditional Chinese. Keep everything else exactly the same.
```

---

## C. 插圖（可選，冇都照玩得）

全部附上 `UI/campaign/events/singerBirthday.webp` 做風格參考。交付 1600×900。

每個 prompt 開頭貼：

```
16:9 landscape illustration, 1600×900, vibrant Hong Kong anime illustration with clean outlines, cinematic lighting and lively crowds, in the same style as the attached reference board. Recognisably Hong Kong, but no readable text, no captions, no logos, no watermark.
```

再接以下場景（一行一張）。

### C1. 章節結尾（11 張）

| 章 | 場景 |
|---|---|
| 01 北區 | `Scene: a brand-new North District town at sunrise - fresh roads, power lines and the first housing blocks rising from farmland, a red-and-cream bus arriving, residents cheering under new street lights.` |
| 02 大埔 | `Scene: Tai Po at golden hour - families boarding buses, a clinic and shops open, the Tai Po waterfront park with kites, Tolo Harbour behind.` |
| 03 西貢 | `Scene: Sai Kung waterfront on Tuen Ng - dragon boats racing to the finish beside a crowded promenade, yachts moored in the bay, drums and splashing paddles.` |
| 05 黃大仙 | `Scene: Wong Tai Sin Temple at dusk - worshippers with incense and fortune sticks, while a new bus terminus and clinic glow at the foot of Lion Rock.` |
| 06 沙田 | `Scene: Sha Tin new town - pupils in uniforms walking to school past Shing Mun River, a boy (Jayden) celebrating a Band 1 school place while his mum hugs him, the racecourse in the distance.` |
| 08 元朗 | `Scene: Yuen Long at sunset - new public housing estates beside green paddy fields and fish ponds, egrets flying, a light rail tram crossing.` |
| 09 荃灣 | `Scene: Tsuen Wan bustling with trades - factories turned into creative studios, a science lab, busy shops and offices, the Tsing Ma Bridge behind.` |
| 10 離島 | `Scene: Chek Lap Kok airport at sunset - a plane taking off over the sea, the terminal's curved roof, the Tian Tan Buddha on the hills of Lantau.` |
| 11 葵青 | `Scene: Kwai Tsing container terminal at night - gantry cranes lifting colourful containers, trucks lining up, a huge container ship under floodlights.` |
| 13 觀塘 | `Scene: Kowloon East from the elevated Kwun Tong Line - new office towers beside old industrial buildings, a rail fan photographing the view from the train window.` |
| 15 深水埗 | `Scene: Sham Shui Po under Lion Rock - old tenements repaired with new paint and scaffolding coming down, residents and a youth volunteer sharing food, warm evening light.` |

### C2. 中段事件（19 張）

| 事件 | 場景 |
|---|---|
| 01 地皮熱 | `Scene: a city planning office in chaos - a secretary cat pointing at a map covered in residential zones while the treasurer holds his head, traffic jams outside the window.` |
| 02 攞你命3000 | `Scene: a science park lab demo - a ridiculous multi-armed household robot cooking, blow-drying hair and filing taxes at once while a nerdy scientist proudly presents it and reporters gasp.` |
| 03 海旁迫爆 | `Scene: Tuen Ng in Sai Kung - dragon boats ready on the water but spectators crammed on a broken, unfinished waterfront path, people squeezing past each other.` |
| 04 珍寶海鮮舫復活 | `Scene: the Jumbo floating restaurant relit in Aberdeen Harbour at night, a sampan ferrying excited diners, a foodie woman raising a lobster.` |
| 05 黃大仙求籤 | `Scene: Wong Tai Sin Temple - people shaking fortune-stick cylinders, a fortune teller reading a stick, a young man looking confused at his fortune slip.` |
| 06 神童標旁述 | `Scene: Sha Tin racecourse race day - a flamboyant commentator shouting into a microphone in the commentary box while horses thunder past and a punter tears up his betting slip.` |
| 07 輕鐵平交口 | `Scene: a Tuen Mun light rail level crossing - a light rail train, a double-decker bus and cars meeting at the crossing, a bus fan ecstatically taking photos.` |
| 07 夜歸安全 | `Scene: a dark Tuen Mun street at night - a worker walking home nervously, a police officer on patrol with a torch, a new street lamp being switched on.` |
| 08 大盆菜 | `Scene: a walled village poon choi banquet in Yuen Long - long tables of big basins of food, villagers feasting, a packed bus squeezing past the village road.` |
| 09 曾Sir又唔記得咗 | `Scene: a science lab mishap - harmless smoke from a bench experiment, a sheepish absent-minded tutor scratching his head, an engineer with a safety checklist.` |
| 10 昂坪纜車 | `Scene: the Tian Tan Buddha on Lantau with a cable car line gliding up the green hills, tourists pointing, a confused resident holding a T-shirt.` |
| 11 貨櫃車大遷徙 | `Scene: container trucks rumbling past a residential tower at 3am, a resident at the window holding a glass of water with ripples.` |
| 12 同志，下一站有落 | `Scene: inside an old-style MTR train with vintage white interior and round grab poles, a passenger speaking into a pole like an intercom while others stare.` |
| 13 改建工廈 | `Scene: Kwun Tong - a gleaming new office tower beside an industrial building being converted, a worker holding his toolbox looking lost on the pavement.` |
| 15 拆定修 | `Scene: Sham Shui Po - a developer with a model of luxury towers facing old tenement residents holding their belongings, a social worker in between.` |
| 16 盛事與塞車 | `Scene: a mega event in Wan Chai - fireworks and a stage by the harbour while the cross-harbour tunnel traffic jam stretches behind, a commuter making a bitter smile.` |
| 17 一晚三個油尖旺 | `Scene: Yau Tsim Mong on one night - huge queues at an MTR station, crowds at Tsim Sha Tsui ferry pier, a claypot rice stall sold out, theatre-goers stuck in traffic.` |
| 18 恒指高、人工低 | `Scene: Central - a giant stock index board at a record high in green, a tycoon toasting with champagne, a worker checking a thin pay slip, a barber in his tiny salon.` |
| 18 議會有聲音 | `Scene: the Legislative Council chamber - two legislators debating with documents, a reporter raising a microphone from the press gallery, the mayor listening.` |
