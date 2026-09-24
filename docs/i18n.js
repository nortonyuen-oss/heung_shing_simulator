// Public-site translations (separate from the in-game i18n.js). Four
// languages: Hong Kong Traditional Chinese (source language, the default),
// Taiwan Traditional Chinese, English, Japanese.
const SITE_LANGUAGES = ["zh-HK", "zh-TW", "en", "ja"];
const SITE_LANGUAGE_LABELS = {
  "zh-HK": "中文（香港）",
  "zh-TW": "中文（台灣）",
  en: "English",
  ja: "日本語",
};
const SITE_LANGUAGE_STORAGE_KEY = "heungShingSite.language";
const SITE_DEFAULT_LANGUAGE = "zh-HK";

const SITE_INTL_LOCALE = {
  "zh-HK": "zh-Hant-HK",
  "zh-TW": "zh-Hant-TW",
  en: "en-US",
  ja: "ja-JP",
};

function detectSiteLanguage() {
  try {
    const stored = window.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY);
    if (stored && SITE_LANGUAGES.includes(stored)) return stored;
  } catch {
    // localStorage unavailable (privacy mode etc.) - fall through to browser detection
  }
  const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || ""];
  for (const raw of browserLanguages) {
    const lower = String(raw).toLowerCase();
    if (lower.startsWith("ja")) return "ja";
    if (lower.startsWith("zh")) {
      if (lower.includes("tw") || lower.includes("hant-tw")) return "zh-TW";
      return "zh-HK";
    }
    if (lower.startsWith("en")) return "en";
  }
  return SITE_DEFAULT_LANGUAGE;
}

// ── Gallery captions ─────────────────────────────────────────────────────────
const SITE_GALLERY = {
  "zh-HK": [
    { title: "一座有香港氣息嘅城市", alt: "白天嘅香城市中心：都會大學、生產力促進局、海濱馬路同住宅商廈", caption: "由公共屋邨到玻璃幕牆商廈，大學、生產力局、海濱馬路都係原創像素模型；街上小巴、的士靠左行車，城市會隨土地價值自己重建。" },
    { title: "康文署嘅一日", alt: "運動場、室內體育館、大球場、海洋公園同教堂喺日光下並排", caption: "運動場、室內體育館、大球場、海洋公園、教堂：地標同康樂設施逐個解鎖，城市越大選擇越多。" },
    { title: "海濱住宅有自己嘅節奏", alt: "低密度海濱屋苑、跨海橋同廟宇", caption: "低密度海濱屋苑、跨海橋、廟宇同公園並排；分區密度由你決定，樓宇會隨需求同土地價值自己升級或者重建。" },
    { title: "山邊小鎮", alt: "山坡地形上嘅住宅同秋色樹林", caption: "自訂地形：山丘、坡地同樹林都係地圖一部分，屋苑順住山勢起，每個城市都唔同樣。" },
    { title: "黃昏嘅海面會閃", alt: "日落前嘅海面反光同海濱商廈", caption: "海面有流動反光，日落前後最靚；海濱地價高，商廈同豪宅自然向水邊靠攏。" },
    { title: "由高空睇一座港口城市", alt: "縮到最細嘅城市全景：貨櫃碼頭、機場、跨海橋同市中心", caption: "縮到最細睇成個城市：貨櫃碼頭、機場跑道、跨海橋同高密度市中心一眼睇晒。" },
    { title: "玫瑰園國際機場", alt: "客機喺跑道上，旁邊係東涌雙語分區路牌", caption: "機場正式運作：客機沿彎曲航線降落、滑行入閘再起飛；「東涌」路牌係你自己改嘅雙語分區名。" },
    { title: "貨櫃碼頭夜間照常運作", alt: "夜晚嘅貨櫃碼頭：橋吊亮燈，貨船泊岸同離港", caption: "貨船由公海駛入、平行泊岸、交換貨櫃再鳴笛離開；碼頭同橋吊夜晚有燈，工業區嘅作息同住宅唔同。" },
    { title: "經營自己嘅巴士公司", alt: "運輸營運模式：車隊清單同兩個即時追蹤鏡頭", caption: "巴士 DLC：起車廠、開路線、買車，睇每架車嘅載客率同收入，仲有即時追蹤鏡頭跟住架車行。" },
    { title: "香城夜色，由街燈開始", alt: "傍晚七點幾嘅住宅區，街燈已亮，窗燈逐棟填滿，天上有星", caption: "日落後街燈一齊亮起，然後窗燈逐棟填滿；住宅、商業、工業各有自己嘅開燈比例，醫院警局通宵全開。" },
    { title: "夜晚嘅香城天際線", alt: "夜晚縮細睇嘅城市：密集燈火、機場同海港", caption: "133 個模型全部有預先烘焙嘅夜景貼圖，成個城市入夜都唔會拖慢；深夜逐棟熄燈，凌晨最暗。" },
    { title: "夜訪天壇大佛", alt: "深夜嘅天壇大佛亮燈，旁邊係霓虹商業街", caption: "地標入夜全開燈到凌晨一點：天壇大佛、霓虹商業街同旁邊嘅住宅區各有各嘅夜晚。" },
    { title: "凌晨嘅海洋公園同大球場", alt: "凌晨十二點半嘅海洋公園、大球場同體育館，泛光燈亮住", caption: "大型康樂設施夜晚有泛光燈；凌晨過後樓宇燈火慢慢熄，一半樓只剩街燈。" },
    { title: "落雨嘅晚上", alt: "雨夜嘅海港：霧氣、碼頭同城市燈光", caption: "天氣跟日夜循環行：雨、霧、暴雨警告同颱風訊號逐級升降，一場風打足一日到一日半。" },
    { title: "雲層飄過城市", alt: "下午嘅城市全景，雲影飄過屋頂", caption: "放大到一定倍率會見到雲影飄過屋頂；天色、霧同雨效果可以喺檢視選單開關。" },
    { title: "市政會議唔只係一個選單", alt: "市政會議視窗：邀請足球明星表演賽嘅特別議案，顯示費用同議員取態", caption: "特別議案按「幾多個月收入」定價，十位官員議員逐個表態；通過後有實際效果同後續新聞。" },
    { title: "香城討論區", alt: "香城討論區帖文：新春求籤結果報章", caption: "城中大小事都有花生友討論：新春求籤、交通、股市、旅遊熱話，仲有配圖報章同市民留言。" },
    { title: "幻彩fing香城", alt: "討論區新聞帖：無人機表演中途墜毀", caption: "議會通過嘅活動會真正發生：每三個月一場無人機表演；出咗事都會上新聞、上討論區畀人鬧。" },
    { title: "分區、overlay 同小地圖", alt: "住宅區域 overlay 小地圖，標住各個自訂分區名", caption: "住宅、商業、工業、電力、污染、地價等 overlay，加上你自己命名嘅雙語分區，一張小地圖睇晒全城。" },
  ],
  "zh-TW": [
    { title: "一座有香港氣息的城市", alt: "白天的香城市中心：都會大學、生產力促進局、海濱馬路與住宅商廈", caption: "從公共住宅到玻璃帷幕商廈，大學、生產力局、海濱馬路都是原創像素模型；街上小巴、計程車靠左行駛，城市會隨土地價值自行重建。" },
    { title: "康文署的一天", alt: "運動場、室內體育館、大球場、海洋公園與教堂在日光下並排", caption: "運動場、室內體育館、大球場、海洋公園、教堂：地標與康樂設施逐一解鎖，城市越大選擇越多。" },
    { title: "海濱住宅有自己的節奏", alt: "低密度海濱社區、跨海橋與廟宇", caption: "低密度海濱社區、跨海橋、廟宇與公園並排；分區密度由你決定，建築會隨需求與土地價值自行升級或重建。" },
    { title: "山邊小鎮", alt: "山坡地形上的住宅與秋色樹林", caption: "自訂地形：山丘、坡地與樹林都是地圖的一部分，社區順著山勢興建，每座城市都不一樣。" },
    { title: "黃昏的海面會閃", alt: "日落前的海面反光與海濱商廈", caption: "海面有流動反光，日落前後最美；海濱地價高，商廈與豪宅自然往水邊靠攏。" },
    { title: "從高空看一座港口城市", alt: "縮到最小的城市全景：貨櫃碼頭、機場、跨海橋與市中心", caption: "縮到最小看整座城市：貨櫃碼頭、機場跑道、跨海橋與高密度市中心一目了然。" },
    { title: "玫瑰園國際機場", alt: "客機在跑道上，旁邊是東涌雙語分區路牌", caption: "機場正式運作：客機沿曲線航路降落、滑行入閘再起飛；「東涌」路牌是你自己取的雙語分區名。" },
    { title: "貨櫃碼頭夜間照常運作", alt: "夜晚的貨櫃碼頭：橋式起重機亮燈，貨船泊岸與離港", caption: "貨船由外海駛入、平行靠泊、交換貨櫃再鳴笛離開；碼頭與起重機夜晚有燈，工業區的作息與住宅不同。" },
    { title: "經營自己的公車公司", alt: "運輸營運模式：車隊清單與兩個即時追蹤鏡頭", caption: "公車 DLC：蓋車廠、開路線、買車，看每輛車的載客率與收入，還有即時追蹤鏡頭跟著車跑。" },
    { title: "香城夜色，從路燈開始", alt: "傍晚七點多的住宅區，路燈已亮，窗燈逐棟填滿，天上有星", caption: "日落後路燈一起亮起，然後窗燈逐棟填滿；住宅、商業、工業各有自己的開燈比例，醫院警局整夜全開。" },
    { title: "夜晚的香城天際線", alt: "夜晚縮小看的城市：密集燈火、機場與海港", caption: "133 個模型全部有預先烘焙的夜景貼圖，整座城市入夜也不會變慢；深夜逐棟熄燈，凌晨最暗。" },
    { title: "夜訪天壇大佛", alt: "深夜的天壇大佛亮燈，旁邊是霓虹商業街", caption: "地標入夜全開燈到凌晨一點：天壇大佛、霓虹商業街與旁邊的住宅區各有各的夜晚。" },
    { title: "凌晨的海洋公園與大球場", alt: "凌晨十二點半的海洋公園、大球場與體育館，泛光燈亮著", caption: "大型康樂設施夜晚有泛光燈；凌晨過後建築燈火慢慢熄滅，一半的樓只剩路燈。" },
    { title: "下雨的晚上", alt: "雨夜的海港：霧氣、碼頭與城市燈光", caption: "天氣依日夜循環運行：雨、霧、暴雨警告與颱風訊號逐級升降，一場風持續一日到一日半。" },
    { title: "雲層飄過城市", alt: "下午的城市全景，雲影飄過屋頂", caption: "放大到一定倍率會看到雲影飄過屋頂；天色、霧與雨效果可以在檢視選單開關。" },
    { title: "市政會議不只是一個選單", alt: "市政會議視窗：邀請足球明星表演賽的特別議案，顯示費用與議員立場", caption: "特別議案按「幾個月收入」定價，十位官員議員逐一表態；通過後有實際效果與後續新聞。" },
    { title: "香城討論區", alt: "香城討論區貼文：新春求籤結果報紙", caption: "城裡大小事都有網友討論：新春求籤、交通、股市、觀光話題，還有配圖報紙與市民留言。" },
    { title: "幻彩fing香城", alt: "討論區新聞貼：無人機表演中途墜毀", caption: "議會通過的活動會真正發生：每三個月一場無人機表演；出了事也會上新聞、上討論區被罵。" },
    { title: "分區、overlay 與小地圖", alt: "住宅區域 overlay 小地圖，標示各個自訂分區名", caption: "住宅、商業、工業、電力、污染、地價等 overlay，加上你自己命名的雙語分區，一張小地圖看遍全城。" },
  ],
  en: [
    { title: "A city that feels like Hong Kong", alt: "Downtown Heung Shing by day: the Metropolitan University, the Productivity Council, a waterfront road, housing and office towers", caption: "From public housing estates to glass office towers, the university, the Productivity Council and the waterfront road are all original pixel models; minibuses and taxis drive on the left, and the city redevelops itself as land values move." },
    { title: "A day out with the LCSD", alt: "Sports grounds, an indoor coliseum, a stadium, Ocean Park and a church side by side in daylight", caption: "Sports grounds, an indoor coliseum, the stadium, Ocean Park, a church: landmarks and leisure facilities unlock one by one, and the bigger the city the more you get to choose." },
    { title: "Waterfront living has its own pace", alt: "Low-density waterfront housing, a cross-harbour bridge and a temple", caption: "Low-rise waterfront estates, a bridge over the water, a temple and parks side by side; you set the zoning density, and buildings upgrade or redevelop on their own with demand and land value." },
    { title: "A town on the hillside", alt: "Housing on sloping terrain among autumn-coloured trees", caption: "Custom terrain: hills, slopes and woods are part of the map, estates climb the hillside, and no two cities look alike." },
    { title: "The sea sparkles at dusk", alt: "Sunlight glinting on the sea before sunset, waterfront office towers beyond", caption: "The water shimmers, at its best around sunset; waterfront land is expensive, so offices and upmarket housing gravitate to the shore." },
    { title: "A port city from above", alt: "The whole city zoomed right out: container port, airport, bridge and downtown", caption: "Zoom all the way out and take in the whole city: the container port, the airport runway, the bridge and the high-density centre in one view." },
    { title: "Rose Garden International Airport", alt: "An airliner on the runway beside the bilingual Tung Chung district sign", caption: "The airport in operation: aircraft land along curved approaches, taxi to a gate and take off again. The Tung Chung sign is a bilingual district name you chose yourself." },
    { title: "The container port works through the night", alt: "The container port at night: cranes lit, ships berthing and departing", caption: "Cargo vessels sail in from open water, berth parallel to the quay, exchange containers and sound their horn as they leave; the port and its cranes are lit at night, and industry keeps different hours from housing." },
    { title: "Run your own bus company", alt: "Transport mode: the fleet list and two live tracking cameras", caption: "The bus expansion: build a depot, open routes, buy buses, watch each vehicle's load factor and takings, and follow any bus with a live tracking camera." },
    { title: "Night begins with the street lamps", alt: "A residential district just after seven in the evening: street lamps on, windows filling in one building at a time, stars overhead", caption: "After sunset the street lamps come on together, then the windows fill in building by building; homes, offices and industry each keep their own share lit, and hospitals and police stations stay lit all night." },
    { title: "The Heung Shing skyline at night", alt: "The city zoomed out at night: dense lights, the airport and the harbour", caption: "All 133 models ship pre-baked night textures, so the whole city lights up without slowing down; in the small hours buildings go dark one by one and the night is at its deepest." },
    { title: "The Big Buddha after dark", alt: "The Big Buddha lit up late at night beside a neon commercial street", caption: "Landmarks stay fully lit until one in the morning: the Buddha, the neon shopping street and the housing next door each have their own kind of night." },
    { title: "Ocean Park and the stadium after midnight", alt: "Ocean Park, the stadium and the coliseum at half past midnight under floodlights", caption: "Big leisure facilities are floodlit at night; after midnight the towers wind down until half of them show nothing but street lamps." },
    { title: "A rainy night", alt: "The harbour on a rainy night: mist, the port and the city lights", caption: "Weather runs on the day/night cycle: rain, mist, rainstorm warnings and typhoon signals climb and fall step by step, and a storm lasts a day to a day and a half." },
    { title: "Clouds over the city", alt: "The city in the afternoon with cloud shadows drifting over the rooftops", caption: "Zoom in far enough and cloud shadows drift across the rooftops; sky, mist and rain effects can all be toggled from the View menu." },
    { title: "A council, not just a menu", alt: "The council window: a special resolution to invite a football star for an exhibition match, showing its cost and each member's stance", caption: "Special resolutions are priced in months of income and ten officials take a stance one by one; a passed motion has real effects and its own follow-up news." },
    { title: "The Heung Shing Forum", alt: "A forum post with the newspaper report of the New Year fortune-drawing", caption: "Everything in town gets discussed: the New Year fortune draw, traffic, the stock market, tourism, with illustrated newspaper pages and citizens' comments." },
    { title: "The drone show that went wrong", alt: "A forum news post: a drone crashed mid-show", caption: "What the council passes really happens: a drone light show every three months, and when it goes wrong it makes the news and the forum." },
    { title: "Districts, overlays and the minimap", alt: "The residential overlay minimap with custom district names", caption: "Residential, commercial, industrial, power, pollution and land-value overlays, plus the bilingual districts you named yourself, on one minimap of the whole city." },
  ],
  ja: [
    { title: "香港の空気をまとった街", alt: "昼間の香城中心部：都会大学、生産力促進局、海沿いの道路、住宅とオフィスビル", caption: "公営住宅からガラス張りのオフィスビルまで、大学も生産力促進局も海沿いの道路もオリジナルのピクセルモデル。ミニバスやタクシーは左側通行で、街は地価に合わせて自ら建て替わります。" },
    { title: "康文署の一日", alt: "運動場、室内競技場、スタジアム、オーシャンパーク、教会が昼の光の中に並ぶ", caption: "運動場、室内競技場、スタジアム、オーシャンパーク、教会。ランドマークとレジャー施設は一つずつ解放され、街が大きいほど選択肢が増えます。" },
    { title: "海辺の住宅には独自のリズム", alt: "低密度の海辺の住宅地、海を渡る橋、寺院", caption: "低層の海辺の団地、海を渡る橋、寺院と公園が並びます。区画の密度は自分で決め、建物は需要と地価に応じて自ら建て替わります。" },
    { title: "山あいの町", alt: "傾斜地に建つ住宅と秋色の木々", caption: "カスタム地形：丘や斜面や林もマップの一部。団地は山肌に沿って建ち、同じ街は二つとありません。" },
    { title: "夕暮れの海がきらめく", alt: "日没前の海面の反射と海辺のオフィスビル", caption: "海面はゆらめく反射を見せ、日没前後がいちばん美しい。海辺の地価は高く、オフィスや高級住宅は自然と水辺に集まります。" },
    { title: "上空から見る港湾都市", alt: "最大まで引いた街の全景：コンテナ港、空港、橋、中心部", caption: "最大まで引いて街全体を眺める。コンテナ港、空港の滑走路、橋、高密度の中心部が一目で分かります。" },
    { title: "ローズガーデン国際空港", alt: "滑走路上の旅客機と、その脇のバイリンガル地区標識「東涌」", caption: "空港が稼働中：旅客機は曲線の進入路で着陸し、ゲートへ滑走してまた離陸。「東涌」の標識は自分で付けたバイリンガルの地区名です。" },
    { title: "コンテナ港は夜も動く", alt: "夜のコンテナ港：クレーンが灯り、貨物船が接岸・出港", caption: "貨物船は外洋から入り、岸壁に平行に接岸してコンテナを積み替え、汽笛を鳴らして去ります。港とクレーンは夜も灯り、工業地区は住宅とは違う時間で動きます。" },
    { title: "自分のバス会社を経営", alt: "交通モード：車両一覧と2つのライブ追跡カメラ", caption: "バス拡張：車庫を建て、路線を開き、車両を買い、各車の乗車率と収入を確認。ライブ追跡カメラでどのバスでも追いかけられます。" },
    { title: "夜は街灯から始まる", alt: "夜7時過ぎの住宅地。街灯はすでに点き、窓の灯りが一棟ずつ増え、空には星", caption: "日没後、街灯はいっせいに点き、窓の灯りは一棟ずつ増えていきます。住宅・商業・工業はそれぞれ点灯する割合が違い、病院と警察は一晩中点いたまま。" },
    { title: "夜の香城スカイライン", alt: "夜に引いて見た街：密集する灯り、空港、港", caption: "133種すべてのモデルが焼き込み済みの夜景テクスチャを持ち、街全体が灯っても重くなりません。深夜には一棟ずつ消灯し、未明がいちばん暗くなります。" },
    { title: "夜の天壇大仏", alt: "深夜にライトアップされた天壇大仏と、隣のネオン街", caption: "ランドマークは午前1時まで全点灯。大仏、ネオンの商店街、隣の住宅地にはそれぞれの夜があります。" },
    { title: "深夜のオーシャンパークとスタジアム", alt: "午前0時半のオーシャンパーク、スタジアム、競技場。投光器が灯る", caption: "大型レジャー施設は夜間に投光器で照らされます。深夜を過ぎると建物の灯りは徐々に消え、半分は街灯だけになります。" },
    { title: "雨の夜", alt: "雨の夜の港：霧、埠頭、街の灯り", caption: "天気は昼夜サイクルに合わせて動きます。雨、霧、豪雨警報、台風シグナルは段階的に上下し、嵐は1日から1日半続きます。" },
    { title: "街を流れる雲", alt: "午後の街の全景。雲の影が屋根の上を流れる", caption: "十分に拡大すると雲の影が屋根の上を流れます。空、霧、雨の効果は表示メニューで切り替えられます。" },
    { title: "議会は単なるメニューではない", alt: "議会ウィンドウ：サッカースターを招くエキシビションマッチの特別決議。費用と各議員の立場を表示", caption: "特別決議は「月収の何か月分」で価格が決まり、10人の議員が一人ずつ態度を示します。可決された動議は実際に効果を持ち、続報のニュースになります。" },
    { title: "香城フォーラム", alt: "フォーラムの投稿：新春おみくじの結果を伝える新聞", caption: "街のあらゆることが話題になります。新春のおみくじ、交通、株式市場、観光。図版付きの新聞紙面と市民のコメントも。" },
    { title: "失敗したドローンショー", alt: "フォーラムのニュース投稿：ショーの途中でドローンが墜落", caption: "議会で可決されたことは本当に起こります。3か月ごとのドローンショー、そして失敗すればニュースとフォーラムで叩かれます。" },
    { title: "地区、オーバーレイ、ミニマップ", alt: "自分で名付けた地区名が入った住宅オーバーレイのミニマップ", caption: "住宅・商業・工業・電力・汚染・地価などのオーバーレイと、自分で名付けたバイリンガルの地区。ミニマップ一枚で街全体を見渡せます。" },
  ],
};

// ── Manual table (special building unlock spec) ─────────────────────────────
const SITE_MANUAL_ROWS = {
  "zh-HK": [
    ["社區廟宇", "人口 3,000", "最多 4 座"],
    ["教堂", "人口 5,000", "最多 2 座"],
    ["立法會", "人口 10,000", "最多 1 座；達標後才出現"],
    ["大佛", "人口 12,000", "最多 1 座"],
    ["大型廟宇", "人口 12,000；吸引力 35", "最多 1 座"],
    ["太空館", "人口 15,000；「科研發展法」生效", "最多 1 座"],
    ["貨櫃碼頭", "人口 15,000；4×4 footprint 貼住連續四格水邊，或沙灘後方緊接海水", "不限數量"],
    ["文化中心", "人口 20,000", "最多 1 座"],
    ["會展中心／紅磡體育館", "人口 30,000", "各最多 1 座"],
    ["海洋公園", "立法會；人口 35,000；月收入 $6,000；月盈餘 $1,000；經濟 50；支付 $10,000 提案並獲批", "批准前隱藏；8×8；建造費 $22,000"],
    ["城超聯主場", "人口 40,000", "最多 1 座"],
    ["股票交易所", "立法會；人口 50,000；「股票交易所法案」生效", "最多 1 座；達標後才出現"],
    ["美利樓", "城市吸引力 60", "最多 1 座"],
    ["玫瑰園國際機場", "立法會；人口 80,000；月收入 $12,000；月盈餘 $2,000；經濟 65；支付 $25,000 提案並獲批", "批准前隱藏；12×12；建造費 $150,000"],
  ],
  "zh-TW": [
    ["社區廟宇", "人口 3,000", "最多 4 座"],
    ["教堂", "人口 5,000", "最多 2 座"],
    ["立法會", "人口 10,000", "最多 1 座；達標後才出現"],
    ["大佛", "人口 12,000", "最多 1 座"],
    ["大型廟宇", "人口 12,000；吸引力 35", "最多 1 座"],
    ["太空館", "人口 15,000；「科研發展法」生效", "最多 1 座"],
    ["貨櫃碼頭", "人口 15,000；4×4 footprint 緊貼連續四格水邊，或沙灘後方緊接海水", "不限數量"],
    ["文化中心", "人口 20,000", "最多 1 座"],
    ["會展中心／紅磡體育館", "人口 30,000", "各最多 1 座"],
    ["海洋公園", "立法會；人口 35,000；月收入 $6,000；月盈餘 $1,000；經濟 50；支付 $10,000 提案並獲通過", "批准前隱藏；8×8；建造費 $22,000"],
    ["城超聯主場", "人口 40,000", "最多 1 座"],
    ["證券交易所", "立法會；人口 50,000；「證券交易所法案」生效", "最多 1 座；達標後才出現"],
    ["美利樓", "城市吸引力 60", "最多 1 座"],
    ["玫瑰園國際機場", "立法會；人口 80,000；月收入 $12,000；月盈餘 $2,000；經濟 65；支付 $25,000 提案並獲通過", "批准前隱藏；12×12；建造費 $150,000"],
  ],
  en: [
    ["Community Temple", "Population 3,000", "Max 4"],
    ["Church", "Population 5,000", "Max 2"],
    ["Legislative Council", "Population 10,000", "Max 1; appears once reached"],
    ["Big Buddha", "Population 12,000", "Max 1"],
    ["Grand Temple", "Population 12,000; Attractiveness 35", "Max 1"],
    ["Space Museum", "Population 15,000; “Science Development Act” in effect", "Max 1"],
    ["Container Port", "Population 15,000; a 4×4 footprint touching four contiguous waterfront tiles, or a beach with open water directly behind it", "Unlimited"],
    ["Cultural Centre", "Population 20,000", "Max 1"],
    ["Convention Centre / Hung Hom Coliseum", "Population 30,000", "Max 1 each"],
    ["Ocean Park", "Legislative Council built; population 35,000; monthly income $6,000; monthly surplus $1,000; economy 50; pay $10,000 to submit a proposal and have it approved", "Hidden until approved; 8×8; build cost $22,000"],
    ["Football Stadium", "Population 40,000", "Max 1"],
    ["Stock Exchange", "Legislative Council built; population 50,000; “Stock Exchange Act” in effect", "Max 1; appears once reached"],
    ["Murray House", "City attractiveness 60", "Max 1"],
    ["Rose Garden International Airport", "Legislative Council built; population 80,000; monthly income $12,000; monthly surplus $2,000; economy 65; pay $25,000 to submit a proposal and have it approved", "Hidden until approved; 12×12; build cost $150,000"],
  ],
  ja: [
    ["地域寺院", "人口 3,000", "最大 4 棟"],
    ["教会", "人口 5,000", "最大 2 棟"],
    ["立法会", "人口 10,000", "最大 1 棟；条件達成後に出現"],
    ["大仏", "人口 12,000", "最大 1 棟"],
    ["大型寺院", "人口 12,000；魅力度 35", "最大 1 棟"],
    ["宇宙博物館", "人口 15,000；「科学研究発展法」施行中", "最大 1 棟"],
    ["コンテナ港", "人口 15,000；4×4 フットプリントが連続4マスの水辺に接している、またはビーチの背後がすぐ海であること", "上限なし"],
    ["文化センター", "人口 20,000", "最大 1 棟"],
    ["コンベンションセンター／紅磡コロシアム", "人口 30,000", "各最大 1 棟"],
    ["オーシャンパーク", "立法会建設済み；人口 35,000；月収 $6,000；月間黒字 $1,000；経済指数 50；$10,000 を支払い議案を提出し可決", "承認前は非表示；8×8；建設費 $22,000"],
    ["サッカースタジアム", "人口 40,000", "最大 1 棟"],
    ["証券取引所", "立法会建設済み；人口 50,000；「証券取引所法」施行中", "最大 1 棟；条件達成後に出現"],
    ["マレーハウス", "都市魅力度 60", "最大 1 棟"],
    ["ローズガーデン国際空港", "立法会建設済み；人口 80,000；月収 $12,000；月間黒字 $2,000；経済指数 65；$25,000 を支払い議案を提出し可決", "承認前は非表示；12×12；建設費 $150,000"],
  ],
};

const SITE_MANUAL_NOTES = {
  "zh-HK": [
    { label: "科學園", text: "高等教育至少 0.80，並只會使用 2×2 或以上工業 footprint；科研發展法會提高出現機率。" },
    { label: "出現比例", text: "公共／大眾房屋（L）喺中高密度區為大宗，最高質素地段都仲有五成；私樓（M）為次要，豪宅／甲級寫字樓（H）為真正少數，最高質素地段封頂約一成半。" },
    { label: "UH 富豪住宅", text: "只限低密度嘅 3×3 莊園地段，並要求高地價、景觀、環境、健康、經濟及低污染，最高質素區間基本權重 3%。" },
    { label: "UH 世界級摩天大樓", text: "只限高密度商業，城市必須同時有股票交易所及機場，代表匯豐總行、中銀大廈呢類全城獨有地標，並無數量上限。" },
    { label: "低密度規劃永久鎖定", text: "一幅地一經劃為低密度住宅，就永遠唔可以再改做中／高密度，保持村屋、別墅嘅低層風貌。" },
    { text: "H／UH 按個別地段評估，不屬於全城一次性解鎖。" },
  ],
  "zh-TW": [
    { label: "科學園", text: "高等教育指數至少 0.80，並只會使用 2×2 或以上工業 footprint；科研發展法會提高出現機率。" },
    { label: "出現比例", text: "公共／大眾住宅（L）在中高密度區佔大多數，最高品質地段仍有五成；私人住宅（M）為次要，豪宅／甲級寫字樓（H）是真正的少數，最高品質地段封頂約一成半。" },
    { label: "UH 頂級豪宅", text: "只限低密度的 3×3 莊園地段，並要求高地價、景觀、環境、健康、經濟及低污染，最高品質區間基本權重 3%。" },
    { label: "UH 世界級摩天大樓", text: "只限高密度商業區，城市必須同時擁有證券交易所及機場，代表匯豐總行、中銀大廈這類全城獨有地標，並無數量上限。" },
    { label: "低密度規劃永久鎖定", text: "一塊地一旦劃為低密度住宅，就永遠不能再改為中／高密度，保持透天厝、別墅的低層風貌。" },
    { text: "H／UH 依個別地段評估，不屬於全城一次性解鎖。" },
  ],
  en: [
    { label: "Science Park", text: "Higher-education index at least 0.80, and only spawns on a 2×2 or larger industrial footprint; the Science Development Act increases the odds." },
    { label: "Appearance ratio", text: "Public/mass housing (L) is the majority in medium/high-density areas - still fifty percent even on the highest-quality plots. Private housing (M) is the solid second tier; premium housing/Grade-A offices (H) are a genuine minority, capped at roughly fifteen percent even on the best plots." },
    { label: "UH luxury estates", text: "Only possible on a low-density 3×3 estate-lot site, requiring high land value, scenery, environment, health, economy and low pollution - base weight 3% in the top quality band." },
    { label: "UH world-class skyscrapers", text: "Only possible in high-density commercial zones; the city must have both a stock exchange and an airport. These represent one-of-a-kind city landmarks (HSBC HQ, Bank of China Tower) with no cap on count." },
    { label: "Permanent low-density lock", text: "Once a plot is zoned low-density residential, it can never be rezoned medium/high density again, preserving the low-rise character of village houses and villas." },
    { text: "H/UH are evaluated per plot rather than unlocked citywide all at once." },
  ],
  ja: [
    { label: "サイエンスパーク", text: "高等教育指数が0.80以上、かつ工業建築のフットプリントが2×2以上でのみ出現。「科学研究発展法」で出現率が上昇します。" },
    { label: "出現比率", text: "公共・大衆住宅（L）は中高密度エリアで多数派となり、最高品質の土地でも5割を維持します。民間住宅（M）はその次に多く、高級住宅／甲級オフィス（H）は真の少数派で、最高品質の土地でも約1割5分が上限です。" },
    { label: "UH 高級邸宅", text: "低密度の 3×3 邸宅区画でのみ出現可能。高い地価・景観・環境・健康・経済指数と低い汚染度が必要で、最高品質帯での基本ウェイトは3%です。" },
    { label: "UH 世界クラスの超高層ビル", text: "高密度商業地区でのみ出現可能で、都市に証券取引所と空港の両方が必要です。匯豐（HSBC）本店ビルや中銀大廈のような唯一無二のランドマークを表しており、棟数に上限はありません。" },
    { label: "低密度計画の永久ロック", text: "一度低密度住宅として区画指定された土地は、二度と中密度・高密度に変更できません。村家や別荘の低層な街並みを維持します。" },
    { text: "H／UH は区画ごとに個別評価され、都市全体で一斉に解禁される仕組みではありません。" },
  ],
};

// ── Feature list (bottom strip) ──────────────────────────────────────────────
const SITE_FEATURE_LIST = {
  "zh-HK": ["日夜循環：一個顯示日就係遊戲入面一個月","133 個模型全部有預先烘焙嘅夜景燈光","天氣、暴雨警告同颱風跟日夜時鐘行","獨立經營嘅香城巴士公司","貨櫃碼頭、貨船航線同玫瑰園國際機場","立法會特別議案按月收入定價","香城討論區、報章同選用嘅雲端 AI 新聞","本機存檔、完全免費、無內購"],
  "zh-TW": ["日夜循環：一個顯示日就是遊戲裡的一個月","133 個模型全部有預先烘焙的夜景燈光","天氣、暴雨警告與颱風依日夜時鐘運行","獨立經營的公車公司","貨櫃碼頭、貨船航線與玫瑰園國際機場","立法會特別議案按月收入定價","香城討論區、報紙與選用的雲端 AI 新聞","本機存檔、完全免費、無內購"],
  en: ["Day/night cycle: one displayed day is one game month","Pre-baked night lighting on all 133 models","Weather, rainstorm warnings and typhoons on the sky clock","A standalone, player-run bus company","Container port, cargo shipping and Rose Garden International Airport","Council resolutions priced in months of income","The Heung Shing Forum, newspapers and optional cloud AI news","Local saves, completely free, no in-app purchases"],
  ja: ["昼夜サイクル：表示上の1日がゲーム内の1か月","133種すべてのモデルに焼き込み済みの夜景照明","天気・豪雨警報・台風は昼夜の時計で進行","独立経営のバス会社","コンテナ港、貨物船の航路、ローズガーデン国際空港","月収の何か月分かで価格が決まる議会決議","香城フォーラム、新聞、任意のクラウド AI ニュース","ローカルセーブ、完全無料、アプリ内課金なし"],
};

// ── Changelog ─────────────────────────────────────────────────────────────────
const SITE_CHANGELOG = {
  "zh-HK": [
    { version: "v4.14.0", date: "2026-09-24", dateLabel: "2026年9月24日", title: "香城討論區", items: [
      "官網「官方新聞」頁變成真正嘅香城討論區：4 個分類 tab（城市發展／城中熱話／交通台／吹水台）同遊戲入面一致，官方新聞同街坊自己開嘅帖一齊出現（官方新聞有「官方」標籤），加咗開新帖表單——唔再淨係得留言，大家可以直接開新話題。",
      "帖同新聞而家可以俾 emoji 回應：👍Like／😂笑／😡憎／↗分享／新增🤡小丑，經版主批准之後會同步落遊戲嘅討論區顯示。呢啲反應用返鬆啲嘅獨立額度，唔會同文字留言爭嗰個嚴格嘅每分鐘限額。",
      "宣傳2-零速傳播右邊個街坊廣告牌，由清單式改做面板底部嘅走馬燈，視覺對齊返遊戲入面走馬燈嘅風格。",
      "首頁下載次數改做淨係顯示一個總數，唔再分版本、分封包類型咁細分。",
    ] },
    { version: "v4.13.1", date: "2026-09-23", dateLabel: "2026年9月23日", title: "香城大小事 有你參與", items: [
      "官方新聞而家會連相同全文一齊出現喺【香城討論區】，唔再係得每條留言各自變成一個獨立帖；留言會變成嗰篇新聞底下嘅回覆，同真正嘅新聞＋留言關係一樣。",
      "修正官方新聞留言／討論區帖同步落遊戲之後日期打錯：之前用緊現實世界嘅日期（例如 2026 年），但每個城市自己有獨立嘅模擬年曆（可以去到 3000 幾年），依家改用返城市自己嘅模擬年月，唔會再因為日期太「舊」而排到去討論區最底、見唔到。",
    ] },
    { version: "v4.13.0", date: "2026-09-23", dateLabel: "2026年9月23日", title: "香城大小事 有你參與", items: [
      "官方新聞：官網新增【香城官方新聞】，可以貼新聞相同內文，大家隨時留言。留言經版主批准之後，會變成遊戲入面【香城討論區】嘅帖。",
      "宣傳2-零速傳播（前稱香城廣告街）：大家可以喺官網申請落一句 120 字內嘅廣告，經版主批准之後，就會加入遊戲新聞走馬燈，同原有嘅宣傳語一齊輪流播放。",
      "版主審批：所有經官網入嚟嘅內容（討論區帖、回覆、新聞留言、廣告）而家都要版主喺 docs/moderate.html 登入批准，先可以入到遊戲，避免遊戲畀低俗或者攻擊性言論污染。",
      "官網所有暱稱欄加咗「隨機」掣，一撳就用返同遊戲 NPC 一樣嘅命名法幫你揀個名。",
      "以上內容全部經網絡攞取，連唔到或者攞唔到就靜默降級，遊戲照常用返原本資料，唔會卡住或者出錯。",
    ] },
    { version: "v4.12.0", date: "2026-09-20", dateLabel: "2026年9月20日", title: "各就各位", items: [
      "行車天橋護欄：每條橋面、每段斜道兩邊而家都有護欄，跟住路面斜度起伏，兩端接口對得正；深度排序保證企喺橋上嘅燈柱同駛過嘅車，一定夾喺遠、近兩條護欄之間，唔會著咗喺護欄前面或後面唔啱次序。",
      "修正樹木同雜物「企錯格」：之前每棵樹、每件雜物其實畫喺自己格斜前方嗰一格——要拆要撳返斜後方先拆得走；前後遮擋次序又跟住嗰個錯位計，於是前一格嘅樓宇反而遮住咗畫面上企喺佢前面嘅樹。而家樹同雜物企返自己格中心，同樓宇、燈柱、車一樣按地圖前後排序，四個地圖方向都驗證過。",
      "種樹掣以前用緊「野生森林」嘅規則，唔畀貼路或者已劃區嘅地種樹——建成區入面幾乎冇位種得落，又冇任何提示。而家人工種植可以喺路邊同空置嘅劃區地種（起樓會自動清走嗰棵樹），種唔到嘅位加咗綠／紅格指引，同解釋原因嘅提示。",
      "上斜路貼圖重新繪製：舊圖每上一格升高約 15px，同地形實際嘅 13px 唔夾，令爬斜嘅馬路每格拼口都有段差同錯位嘅路肩，甚至凸出嘅擋土牆尾巴。四款斜路貼圖已經對齊地形重畫。",
      "交通燈同路燈嘅柱身喺縮圖時唔再有鋸齒（改用 2 的次方畫布烘焙令 Phaser 起到 mipmap），並重新校準大小；夜晚開場畫面嘅「載入遊戲素材中」進度條唔再周期性閃爍；官網「左軚」用詞改正為「右軚」；轉地圖方向後海面唔再有雜物殘留。",
    ] },
    { version: "v4.11.0", date: "2026-09-20", dateLabel: "2026年9月20日", title: "明明綠燈 轉眼變為紅燈", items: [
      "路口交通燈：每個 T 字同十字路口自動喺前一格、司機左邊（香港右軚、靠左行車）放燈柱，面向來車。燈序跟香港：紅 → 紅黃 → 綠 → 黃 → 紅，十字兩相位各綠 8 秒、T 字直路 10 秒支路 5 秒，行人綠公仔喺對面綠燈時亮、最後 3 秒閃。車輛喺路口前約 8 米停紅燈排隊（巴士停得更後），黃燈太近就衝過；路線巴士同雪糕車一樣聽燈。夜晚著燈嘅鏡片有光暈，跟「建築燈光」開關。",
      "路燈：跟路政署街燈慣例——直路 30 米交錯排列（兩邊輪流）、彎位外側一支、橋面同斜路都有，路口交由交通燈柱。夜晚換上烘焙嘅高壓鈉燈貼圖（橙色鏡片、光錐同路面光池），日出熄燈，同「建築燈光」開關一齊關；全部由路網自動推導，唔佔存檔。",
      "Mac 幀率提升三倍：Phaser 每個 render batch 用 gl.bufferSubData 寫入同一個 vertex buffer，喺 macOS 嘅 ANGLE→Metal 上每次都要等 GPU 讀完上一次；改成重新分配上傳之後，旺角由 13 fps 去到 45 fps（zoom 2 時 56）。另外每 7.5 日一次嘅模擬 pulse 由一次過 270 毫秒改成分幾幀逐步跑、巴士公司每小時對每個站掃全城建築（每幾秒卡 0.5 秒）改用網格快取、夜景貼圖每 0.1 秒全城重算改成記住每座下次轉變嘅時間。",
      "修正：夜晚嘅樹變成古怪嘅紅色（夜間物件色調計錯，超出目標色）；release 版巴士站只有一半大、視窗改變大小後燈柱偏移；建築燈光預設永遠用烘焙貼圖，Phaser 即時光源只留喺測試模式；release pipeline 令所有半透明像素變白變亮（AA 邊緣淺色 fringe、橙色路燈光池變黃）——每個 raw buffer 聲明 straight alpha 後全部重新編碼。",
    ] },
    { version: "v4.10.1", date: "2026-09-19", dateLabel: "2026年9月19日", title: "先敬羅衣", items: [
      "修正畫面「閃下閃下」：飄過城市嘅雲比整個視窗仲大，但一出生就係最終透明度、消失時一幀冇咗，驟雨天每 0.7 秒就有一團大雲直接彈出嚟。而家每片雲喺生命期頭尾各約 18%（六至八秒）慢慢淡入淡出。",
      "安裝檔唔再夾埋官網留言板嘅後台源碼；並以 release 安裝檔實測確認開場展示城市隨 app 一齊發佈、唔會出現喺載入清單、亦無法被覆寫。",
    ] },
    { version: "v4.10.0", date: "2026-09-17", dateLabel: "2026年9月17日", title: "先敬羅衣", items: [
      "開場畫面換上一座真正嘅香城：主選單後面即時渲染太子——海港、貨櫃碼頭、路上行駛嘅車，日夜燈光跟你本地時間，天氣跟香港天文台實時觀測（離線就用遊戲自己嘅天氣），鏡頭慢慢漂移。只渲染唔模擬：日曆凍結、唔會自動存檔、唔會有新聞或通知，亦唔會碰你任何存檔。機器食力嘅話會自動先關建築燈、再固定鏡頭、最後退回靜態夜景；設定選單可以整個關掉。未載入前嘅靜態封面亦換成最新嘅夜景天際線。",
      "修正開新城市時殘留上一座城市嘅巴士站、車輛同天氣：以前只重設資料冇清 sprite，由展示城市或者返回主選單後開新城市會見到一地巴士站。載入冇連結手動存檔槽嘅 autosave 時，如果剛好有一個同名手動存檔，會自動認領佢，返回主選單唔會再多出一個重複城市。",
      "夜景燈光每幀成本減半：release 版所有建築本來都用 bake 貼圖，但每幀仍逐座重新判斷；而家記住結論直接跳過（旺角 34 萬人口夜晚 30 fps，同日間一樣）。開發模式亦預設用同 release 一樣嘅 bake 貼圖。",
      "官網：新增免登入嘅「香城連儂牆」留言板（Cloudflare 後台，每分鐘一則、每小時五則），玩家手冊併入遊戲指南並加入 17 張遊戲截圖，首頁背景換成最新夜景。",
    ] },
    { version: "v4.9.0", date: "2026-09-14", dateLabel: "2026年9月14日", title: "香城夜色", items: [
      "黃昏開燈過渡：每個模型多一套「半亮」貼圖（共 532 張夜景貼圖）。日落後換圖一刻全城只有路燈，然後每棟樓喺自己嘅時間 路燈→半亮→全亮，最遲兩個幾鐘全部到位；23:00 熄燈亦改為逐級落。深夜真正變暗：由 23:00 開始加深，00:30～04:30 最暗，05:30 前回返。",
      "時鐘唔再跟幀率走：之前用 Phaser 平滑幀時間，視窗唔喺 focus 或讀檔後幀率未回復時時鐘會慢行再「自己加速」；而家用真實幀時間，任何幀率都係準確 1×，讀檔重設速度時 topbar 按鈕亦會同步。夜晚讀檔會先預載夜景貼圖、即刻著燈；夜晚新建或重建嘅樓下一個 tick 即刻套夜景。雪糕車 23:00～06:00 收工。",
      "全新 19 張遊戲截圖同四語說明，GitHub README 同本網站嘅遊戲介紹按現時版本重寫。",
    ] },
    { version: "v4.8.0", date: "2026-09-13", dateLabel: "2026年9月13日", title: "日月如梭", items: [
      "一個顯示日就係一個日曆月：之前天空同日曆各自行，一個顯示日走 108～180 個日曆日，法案未到黃昏就到期、一架巴士日出到中午已經做完一個月。而家日曆由日夜時鐘推算，月份用真實長度（2 月 28／29 日、格里曆閏年），一年剛好 96 分鐘真實時間。議會法案改為按「幾多個月收入」定價（N 值減半、月收入下限 $2,000），巴士班次、保養、故障、乘客累積全部改用顯示時間；幻彩詠香城每三個月喺當月晚上 8 時開一場 30 分鐘，八號或以上風球取消。",
      "每棟樓有自己嘅夜晚：每個模型多 bake 一套「只有路燈」貼圖（133 個模型、399 張）。入夜住宅七成、商業五成、工業三成開高峰燈，其餘直接深夜燈，地標全開；23:00～01:00 高峰樓逐棟轉深夜燈；01:00～03:00 一半樓逐棟熄剩路燈，05:30～06:00 早起人士陸續開返燈。醫院、警局、消防局、救護站通宵全開。",
    ] },
    { version: "v4.7.0", date: "2026-09-12", dateLabel: "2026年9月12日", title: "風雨有時", items: [
      "天氣跟日夜循環行：之前一個顯示日走 108～180 個日曆日，天氣每 1～2 個日曆日就換，日出到日落之間轉 60～180 次。而家每種天氣持續 5～11 個顯示小時、四成機會延續，一日轉兩三次；暫停時天氣凍結，速度同日夜一齊快慢。",
      "颱風有頭有尾：季內每 4～6 個顯示日一個，打 18～36 個顯示小時，訊號 1→3→8→9→10→8→3→1 逐級升落，唔會喺 8 號 9 號之間抖。暴雨警告即時升級、雨明顯減弱先降級，唔會一個鐘內紅黃紅黑咁跳。",
      "全部固定建築入夜著燈：新增 58 個校正模型（政府設施、地標、發電廠、貨櫃碼頭、巴士車廠、公園、工業 3x3），已 bake 夜景模型由 70 個增加到 133 個。修正咗固定建築之前一直冇用過 bake 圖嘅問題；機場、核電廠、碼頭嘅閃燈以輕量物件保留。",
    ] },
    { version: "v4.6.3", date: "2026-09-10", dateLabel: "2026年9月10日", title: "萬家燈火", items: [
      "修正重建過嘅地皮會攞錯夜景貼圖（重要，建議 v4.6.0～v4.6.2 用家更新）：夜景貼圖同燈光校正都靠 sprite 記住嘅模型檔名去查，但呢個名只喺樓宇第一次起嗰陣寫入；地皮重建換咗模型之後冇更新，入夜就攞咗另一楝樓嘅貼圖。同一個資料夾嘅貼圖尺寸唔一定一樣，所以會畫大一倍或者細一半，地皮剩低嘅位露出草地；街燈同窗口亦會擺到第二楝樓嘅位置。現已改為以存檔記錄為準，重建時同步更新。",
      "夜燈顏色跟返建築類別：住宅暖黃、辦公室冷白、工業琥珀、服務設施淡藍，唔再一律暖黃。街燈維持暖鈉黃。",
      "新增 18 個已校正夜景模型（商業 3x3 補齊、4x4 四個、5x5、首個工業 1x1）。已 bake 嘅夜景模型由 54 個增加到 70 個，共 140 張貼圖。",
    ] },
    { version: "v4.6.2", date: "2026-09-08", dateLabel: "2026年9月8日", title: "萬家燈火", items: [
      "新增 14 個已校正夜景模型：住宅 4x4 兩款、住宅 5x5 三款、商業 1x1 五款、商業 2x2 四款。已 bake 嘅夜景模型由 40 個增加到 54 個，每個兩張（普通夜晚／深夜），共 108 張貼圖。",
      "商業模型嘅燈色跟校正時揀嘅類別行——辦公室冷白、工業暖黃、服務設施淡藍，唔係一刀切。街燈照舊只焗光暈完全落喺模型範圍內嗰啲。",
      "未校正嘅模型維持原本嘅即時光暈路徑，行為不變；現有城市存檔完全兼容。",
    ] },
    { version: "v4.6.1", date: "2026-08-30", dateLabel: "2026年8月30日", title: "萬家燈火", items: [
      "修正建築模型錯位（重要，建議所有 v4.6.0 用家更新）：夜景貼圖被誤當成建築模型列出，令每個模型重複三次。模型編號係按目錄次序編排，而存檔入面每楝建築就係靠呢個編號認返自己張圖——house2x2 由 17 個模型變成 51 個、第一格更加變咗夜景貼圖，令現有城市嘅建築靜靜咁換晒模型。現已喺伺服器同用戶端兩邊過濾走衍生嘅夜景貼圖，並加入回歸測試。更新後建築會恢復正確模型。",
    ] },
    { version: "v4.6.0", date: "2026-08-30", dateLabel: "2026年8月30日", title: "萬家燈火", items: [
      "夜景貼圖：40 個已校正嘅建築模型各焗兩張夜景貼圖（普通夜晚／深夜），入夜自動換圖。亮起嘅係原圖本身嗰啲窗——用校正格做遮罩去照亮真實窗戶，唔係喺上面畫方格，所以窗框、露台、玻璃質感全部保留，窗邊仲有柔和暖色光暈。",
      "兩層夜色：深夜嘅樓宇立面更暗、亮燈窗戶疏落好多，成個城市會隨住夜深靜落嚟。夜色本身亦由一層拆成地面層（只蓋地形同道路）同大氣層（薄薄一層蓋全部），令亮窗唔會俾夜幕壓成灰色。整體夜晚暗度 0.45。",
      "效能：同一個密集夜景 render 由 165 毫秒跌到 12 毫秒。街燈焗入貼圖，但只焗光暈完全落喺模型範圍內嗰啲。未校正嘅模型維持原本嘅即時光暈，並加入以鏡頭距離排序嘅 LOD。燈光校正資料改用檔名做 key，唔會再因為新增／刪除模型檔而錯位。",
    ] },
    { version: "v4.5.0", date: "2026-08-30", dateLabel: "2026年8月30日", title: "輕舟已過", items: [
      "建築貼圖優化：一般建築模型由 1024² 焗細到 512²，機場、大會堂、貨櫃碼頭等大型地標保留 1024²。GPU 貼圖記憶體約減 62%（約 680 MB → 260 MB），城市存檔載入由約 3.5 秒縮到約 1.7 秒，正常縮放下畫質肉眼分唔到。原始 PNG 母檔保留。",
      "夜間建築燈光開關：View 選單新增「夜間建築燈光（亮燈窗戶／街燈）」，獨立於「動態光影」。關咗即刻清走現有光暈、之後每幀零成本，適合弱機或人口幾十萬嘅巨型城市。設定會記住，繁中／英／日界面齊備。",
      "資產管線：發佈資產上限預設由 1024 改為 512，加入按資料夾嘅地標例外；發佈驗證器改為逐項記錄解析度。現有存檔完全兼容，唔需要遷移。",
    ] },
    { version: "v4.4.0", date: "2026-08-29", dateLabel: "2026年8月29日", title: "華燈初上", items: [
      "遊戲時鐘日夜循環：天空顏色同方向性太陽光影而家跟遊戲時間行（顯示 8x 速度下約一分鐘一日），並根據香港天文台 2026 年逐日日出、日落同曙暮光數據轉換；天光、黃昏、入黑、深夜各有其色。可喺 View 選單開關「動態光影」。",
      "夜幕、星空、月亮：入黑後有紫藍色夜幕；晴天先見得到星空；月亮會跟月相變化，喺天空由東行到西。",
      "時段交通：環境車流跟一日時段起伏——上下班繁忙時段最多車，深夜街上最冷清。",
      "夜間車燈：19 款車全部有兩頭燈兩尾燈，天黑或落大雨時漸漸著起，跟返每張四方向圖逐一校正嘅位置，轉彎唔會再飄。",
      "巴士車廂燈：雙層巴士上下層各有一條車廂燈管，夜晚透過車窗透出暖白光。",
      "效能：車燈只喺夜晚／暴雨先計算，白天零成本；每格光暗強度每幀只計一次。",
    ] },
    { version: "v4.3.1", date: "2026-08-25", dateLabel: "2026年8月25日", title: "漁火閃閃", items: [
      "修正巴士 DLC 完全開唔到局嘅經濟問題：巴士公司啟動資金由 $600 提高到 $6,000，而家足夠支付一座 $4,000 車廠、建立路線，再買兩部標準雙層巴士，仲有 $1,440 營運資金。",
      "舊版已成立巴士公司嘅存檔會在載入時一次過自動補發 $5,400 差額；重開遊戲、重複載入或開關 DLC 都唔會重複入帳。",
    ] },
    { version: "v4.3.0", date: "2026-08-23", dateLabel: "2026年8月23日", title: "漁火閃閃", items: [
      "海面流動效果：開放水域（大海／湖）嘅水面而家會有動態波浪紋理，跟住風速（颱風信號做保底）分五級變化——風平浪靜嗰陣輕輕晃動，8號風球以上會變到波濤洶湧、紋理明顯加大加快，可以喺 View 選單獨立開關「海面流動效果」。",
      "夕陽波光粼粼：晴天、太陽循環行到接近日落嗰段時間，水面會出返一啲白熱金邊嘅閃光點，當中幾粒特別亮嘅「主角」閃光仲帶十字光芒，好似陽光喺水面反光咁閃閃生光。",
      "落雨漣漪：落雨嗰陣開放水域會不時泛起橢圓形（跟返地圖 2:1 等角比例）嘅漣漪圈，密度同雨勢一齊遞增——小雨疏落，黑雨／8號風球會密到成片水面都係漣漪。",
      "新增香港18區自動命名系統：巴士站冇自訂名就會自動跟返所屬地區改名（仲會揀方向／碼頭等字尾），亦可以隨時手動重新命名；小地圖「住宅」總覽而家都會標返實際地區名。",
      "修正運輸車廠一直淨係第一個接駁到路嘅先算「啟用」嘅bug，同一個地形編輯bug：將水陸交界泥地嘅鄰居畫做水之後，個廢棄車／貨櫃堆會攤喺水面唔識消失，而家會跟住一齊清走。",
    ] },
    { version: "v4.2.0", date: "2026-08-23", dateLabel: "2026年8月23日", title: "霧鎖香城", items: [
      "新增動態光影：晴天會出現方向性太陽光影，跟住一個獨立於遊戲曆嘅真實時間循環，慢慢由東面金黃色移到頭頂中性光，再到西面橙紅色夕陽，可以喺 View 選單隨時開關。",
      "全天氣雲層系統：由以前淨係陰天先有雲，改成所有天氣都會飄雲，密度同顏色跟住天氣分五級——晴天最少最淡、陰天中等、落雨轉厚、黑色暴雨／8號風球以上就會變做深灰色烏雲；雲層會自己飄動，zoom 入超過1.2倍會逐漸散去，好似穿過雲層咁清晰返，zoom 出返就會再現。",
      "交通效能同顯示範圍優化：重寫傳送／交通／船隻視覺嘅每幀掃描邏輯，大幅減少計算量；環境車輛而家 zoom 1x 就開始出現（舊版要 1.4x）；修正高倍數 zoom（2x 以上）環境車輛會完全消失嘅 bug。",
      "速度掣重新編號：舊有 0.15x／0.5x／1x／2x 四檔改做 1x／2x／4x／8x 顯示，數字更加直覺；新開／載入城市預設維持返原有節奏（即係舊嘅 0.15x 檔）。",
      "清理咗約 53MB 從未被實際使用嘅美術素材（重複貼圖、舊地形殘留圖等），減低安裝檔大細。",
    ] },
    { version: "v4.1.0", date: "2026-08-23", dateLabel: "2026年8月23日", title: "青山綠水", items: [
      "新增荒地廢棄物場景：大片平坦草地會長出一嚿嚿石仔地（dirt），石仔地上有一成機會出現廢棄車輛或貨櫃堆，尺寸按遊戲入面真實車輛模型校準，隨機偏移擺位；石仔地淨係生廢棄物，唔會再長樹。",
      "廢棄物行為同樹木一樣識自我修復：地起咗建築、劃咗地帶或者鋪咗馬路，廢棄物會自動喺下個模擬循環消失；推土機掣可以即時清走廢棄物，同時保留返地下石仔地。",
      "全套地形貼圖換上新一套「自然系」風格（草地、沙灘、河道、山坡、馬路等），並修正山坡貼圖同路面高度唔啱嘅樓梯級問題。",
      "巴士站恢復入站減速/離站加速動畫、改為容許單邊擺放並支援沿途順道載客、收車資有 TTD 式浮動 \"+$\" 提示；車輛追蹤視窗重新設計做側邊圖示分頁。",
      "修正巴士同背景車流互相疊埋嘅視覺問題；優化城市污染同財政預算計算效能，大城市長期運行更流暢。",
    ] },
    { version: "v4.0.0", date: "2026-08-20", dateLabel: "2026年8月20日", title: "香城巴士公司", items: [
      "全新「運輸營運」模式：撳左上角「建設指引 CITY GUIDE」個 header，即可喺城市建設同經營巴士公司之間切換——同一個地圖、同一個時鐘，但工具同介面會換成路線、車隊、需求、車廠、財務、公司六個獨立可拖曳視窗，由頂部工具列逐個開關。",
      "巴士公司有自己一套獨立資金（開業獲發 $600 啟動資金），同市政府庫房完全分開；巴士要響車廠逐架購買（兩種車型 $210～$280），有 12 個泊位上限，行駛耐咗要定期返廠保養，連續三個月虧損會自動暫停所有路線。",
      "巴士改用真實逐架模擬：每架車按實際路線行駛、上落客、賺車資即時入帳，唔再係舊有嘅公式估算；巴士站會即時顯示候車人數，撳任何一架行緊嘅巴士就會開返一個獨立追蹤視窗，實時鏡頭跟實架車。",
      "路線經營表現會為附近地區帶嚟四樣實際效果：紓緩交通擠塞、提升商業區地價、增加工業區勞動力需求、提升 H 級或以下住宅嘅快樂指數（豪宅 UH 唔受惠）。",
      "修正城市資金列「更多資訊」展開後撳唔返收起嘅問題（個掣展開後會郁位，令第二下撳唔中）；縮放控制搬去城市畫面右上方，唔再同旋轉／靜音掣逼埋一堆；增加背景車流嘅隨機車輛數量，令大城市睇落更加繁忙。",
    ] },
    { version: "v3.14.0", date: "2026-08-15", dateLabel: "2026年8月15日", title: "時空重置", items: [
      "全新時間系統：日曆由以前「約7.5日一個模擬周期」改成一日一日咁行，速度檔位改為 暫停／0.15x／0.5x／1x／2x（原本淨係1x/2x/4x/暫停），新開/載入城市預設1x。1x保持返同以前一樣嘅節奏（一個月約20秒、一年約4分鐘），重型城市模擬（經濟、人口增長、股市等）維持每個月4次唔變，只有天氣（同颱風）改為每日更新，令風球呢類短時間事件睇落唔再一嚟就過。",
      "慢速唔再拖慢架車：以前揀0.15x/0.5x連馬路上啲車、船、飛機都會跟住慢到似定格，而家車速固定唔會跌穿正常1x（淨係2x先會加快），慢速淨係影響時間流逝快慢，唔會影響交通畫面觀感。",
      "新增巴士站路邊裝飾：直路兩邊都可以擺放巴士站牌連簷篷（$20），四個方向自動貼返正確嗰邊路肩。",
      "修正巴士站遮擋順序：其中兩個方向入站一刻會被巴士站簷篷蓋住半架車、行前少少先返正常嘅問題，而家四個方向都按路面規則穩定顯示——貼近行車線嗰邊巴士站企定喺前，另一邊就車企喺前。",
    ] },
    { version: "v3.13.0", date: "2026-08-09", dateLabel: "2026年8月9日", title: "官員專訪", items: [
      "新增十位官員議員嘅「人物專訪」金句：行政長官、財政司司長、警署署長、天文台台長、康樂及文化事務署署長，以及自由市場派、民主派、商界、宗教界、旅遊界議員，各有一句專屬性格quote，三語言（中／英／日）齊全。",
      "「Profile feature」掣改咗做即時彈出效果：撳落去個人資料卡入面「核心理念」個quote box會即刻換成呢句人物專訪金句（換色highlight），6秒後自動變返原本嗰句。",
      "修復咗「人物專訪」掣一直冇反應嘅Bug：原來撳落去淨係將句子塞入一個成個遊戲都冇讀嘅內部陣列，冇AI新聞就乜嘢都唔會顯示，難怪一直好似壞咗咁。",
    ] },
    { version: "v3.12.0", date: "2026-08-09", dateLabel: "2026年8月9日", title: "宣傳2", items: [
      "新增「住宅財富分區」制度：全地圖劃成 16×16 網格，按附近已建成住宅嘅平均地價分類做平民區／中產區／富人區／富豪區域四級，每級有固定嘅 L/M/H/UH 出現機率（富豪區域 UH 70%／H 30%，平民區 M 40%／L 60% 等），完全取代舊有嘅逐格質素分帶同UH「只限低密度」規則。",
      "富豪區域加入額外門檻：除咗地價要達標，附近仲要有大型旗艦公園（維多利亞公園級別）、海邊，或者地標建築（廟宇、教堂、博物館、體育館等）先會解鎖；反過來，附近有工業區、發電廠、貨櫃碼頭或者機場嘅地方，就算地價幾高都會封頂喺中產區，唔會出現富人區同富豪區域。",
      "新增建築「密度款式」（LD/MD/HD 低/中/高層樓身），同財富分區獨立疊加：低密度住宅區主要出現LD／MD款、高密度區主要出現MD／HD款，HD款式喺低密度區保證唔會出現。",
      "修正Electron桌面版入面「幫建築物改名」冇反應嘅Bug：`window.prompt()` 喺Electron入面根本冇實現，撳落去乜嘢都唔會彈；改用返APP自家嘅彈窗（同「另存新城市」用緊嗰個一樣），連帶修埋「生成新地形」同「儲存地形預設」入面同一個問題。",
      "新聞跑馬燈加入10款懷舊香城式廣告（時倉迷你昌、得城女傭、Why Me Me等），同城市新聞穿插出現，每3條就有1條係廣告。",
    ] },
    { version: "v3.11.0", date: "2026-08-09", dateLabel: "2026年8月9日", title: "大時代", items: [
      "新增「金融管理局」政府股票交易：股票交易所建成、庫房儲備超過1000萬後解鎖，可以動用庫房資金直接喺交易所買賣任何上市股票，交易會影響即市股價（買升賣跌），收0.25%手續費，單一股票持股上限15%，唔可以晒冷全城股市。",
      "股市牛熊循環重新平衡：熊市由之前間唔中出現嘅短暫插曲，變成同牛市、橫行市況鼎足而立嘅真實週期；上市公司基本因素會隨市況上落，長遠恒指同每隻股票嘅合理值都封咗頂同底，唔會玩耐咗變到天文數字。",
      "政府入市護盤、大手掃貨、賺大錢或者蝕大本都會上報紙頭條，新增兩張新聞插圖（股市造好／官員蝕錢）配合報導。",
      "重新盤點全城住宅同商業建築嘅出現機率：修復咗UH豪宅嘅2x2「別墅」款式喺低密度住宅區永遠唔會出現嘅漏洞（而家會同3x3「大宅」款式一齊有機會出現）、大幅提高 4x4／5x5 住宅同商業大廈嘅出現率、將幾款過高過大嘅2x2 H級洋樓調低出現機率，等佢哋唔會成為街景嘅絕對主流。",
      "新增「低密度屋苑活化」：如果一整個 3x3 街區嘅村屋通通達到UH豪宅嘅嚴格門檻（地價、景觀、環境、健康、經濟指數樣樣達標），有機會一次過重建做一座UH豪宅大宅。",
    ] },
    { version: "v3.10.0", date: "2026-08-08", dateLabel: "2026年8月8日", title: "廟街煲仔飯", items: [
      "大城市模擬效能優化：重整成熟城市嘅住宅/商業/工業模擬熱路徑，autosave 改為背景執行，減少大城市長期遊玩嘅卡頓。",
      "補完 300 個一直漏咗嘅日文翻譯：立法會系統（十位官員議員嘅人物設定、政策取態、台詞）、報紙「號外」彈窗、股票交易所視窗、颱風信號同天氣狀態列等，之前呢啲喺日文版一直靜靜雞 fallback 顯示緊英文，而家加埋自動測試防止未來再漏。",
      "修正 `?performance=1` 效能測試模式會自動彈出面板嘅問題：而家背景繼續收集數據，但面板要手動撳先會顯示。",
      "官網加入四語言支援（中文香港／中文台灣／英文／日文）同全新遊戲指南頁，詳細講解分區密度、經濟稅收、立法會、天氣颱風、特殊建築解鎖同交通系統。",
      "官網截圖全面更新：加入機場運作、街道車流、香城討論區、立法會議案審議、城市改名、以及廟街風格傳統地攤建築群夜景等新截圖。",
    ] },
    { version: "v3.9.0", date: "2026-08-08", dateLabel: "2026年8月8日", title: "好岸居", items: [
      "重新設計住宅同商業建築嘅出現機率，向香港真實嘅房屋政策睇齊：公共/大眾房屋（L）喺中高密度區成為大宗，私樓（M）為次要，豪宅／甲級寫字樓（H）變返真正嘅少數。",
      "新增「低密度規劃永久鎖定」：一幅地一經劃為低密度住宅，就永遠唔可以再改做中／高密度，就算推倒重來都好，保持低密度區嘅村屋／別墅風格。",
      "修正低密度 3x3 莊園後門，加入「大地皮優先掃描」令 5x5 住宅大廈唔會再被四周細屋搶晒地。",
      "商業區加入兩款全新街市場景模型（女人街／廟街風）同一款分層商場大廈模型，並同步重整商業機率分佈。",
    ] },
    { version: "v3.8.1", date: "2026-08-08", dateLabel: "2026年8月8日", title: "衝上雲霄 穩定性更新", items: [
      "重新校正貨櫃船四個泊位位置（ll/lr/ul/ur）：上一版飛機彎曲航線嘅改動意外一併帶入咗一次校準漂移，令泊位偏離咗 v3.7.2 已驗證嘅位置。",
      "修復「自動更換老化發電廠」設定冇套用到核電廠：發電廠更換成本同顯示名稱查詢一直得燃煤同太陽能兩種，令核電廠壽命到咗都只會荒廢，唔會自動更換。",
    ] },
    { version: "v3.8.0", date: "2026-08-02", dateLabel: "2026年8月2日", title: "衝上雲霄", items: [
      "加入完整機場客機活動：兩間航空公司四方向飛機會沿彎曲航線進場、降落、滑行泊位、離閘再起飛，並配上升降聲效。",
      "每個機場設六個校準閘口，平均同時有三至四架客機；跑道一次只容許一架飛機使用，旋轉地圖後航線仍然準確貼合機場。",
      "八號風球或以上暫停新航班同客機離閘，已泊位飛機會留喺機場；已經升降中嘅航班會安全完成目前航段。",
      "八號風球或以上巴士同小巴即時停駛並從路面消失，的士、私家車、貨車同客貨車則繼續行駛。",
      "重新校準貨櫃船泊位，並把飛機／船舶航線改為隨遊戲發佈嘅固定 metadata；下載網站亦換上新 icon。",
    ] },
    { version: "v3.7.2", date: "2026-08-02", dateLabel: "2026年8月2日", title: "貨櫃碼頭！穩定性更新", items: [
      "修復大城市長時間遊玩容易卡頓嘅問題：住宅嘅樹木同景觀分數改為每個遊戲月先重新計算一次並共用結果，唔再每個 tick 都重新掃描全地圖。",
      "加入畫面當機／無回應自動復原：桌面版一旦偵測到遊戲畫面當機或者卡住超過幾秒，會彈窗提供重新載入，唔使再強制退出。",
      "電力短缺改為透過住宅／商業／工業需求影響城市發展，唔再直接觸發地皮衰落或者扣減快樂指數。",
      "隱藏效能測試面板加入關閉掣，唔使再重複五連撳先關到。",
    ] },
    { version: "v3.7.0", date: "2026-08-01", dateLabel: "2026年8月1日", title: "貨櫃碼頭！", items: [
      "加入四方向貨櫃船活動：由畫面外沿海路進港、平行靠泊、交換貨物並鳴笛，再沿航線離港。",
      "按四款碼頭視角逐一校正船舶中心、碼頭中心、離岸距離及圖層關係，停泊位置不再因旋轉方向偏移。",
      "靠泊前最後三格及離港後最初三格保持與岸邊平行，外海航線則按真實連通水域繞行。",
      "加入 route cache、畫面範圍判斷及模型延遲載入，避免重複尋路，離開畫面嘅碼頭幾乎不增加運算負擔。",
      "加入可選顏色嘅中英文城市名牌，並擴大建築、樹木及 overlay 嘅 viewport culling，改善大型城市效能。",
    ] },
    { version: "v3.6.0", date: "2026-07-26", dateLabel: "2026年7月26日", title: "車公靈籤", items: [
      "加入18支香城原創七言籤文，上、中、下籤各六支；每年正月由官員到廟宇代表全城求籤。",
      "籤運會按經濟、股災及疫情輕微調整，並避開最近三年籤號；結果和當時城市狀況會存檔，重新載入不會重抽。",
      "每支籤均有完整籤文、政府解釋、廟祝祥叔解釋及三則灰色幽默市民回應，只刊登討論區與 ticker，不彈阻擋式號外。",
      "加入「活化工廈」政策，以工業需求、收入及減污染換取工業區附近嚴重交通壓力。",
      "加入須先通過科研發展法的「強國製造20XX」，以及搭雞棚、公帑補助與科研得獎的延遲新聞。",
      "討論區各欄改為最新新聞置頂並最多顯示15條，另加入罕見的杏壇中學實驗室爆炸事件。",
    ] },
    { version: "v3.5.0", date: "2026-07-26", dateLabel: "2026年7月26日", title: "夢幻雪糕車", items: [
      "天晴或多雲時，雪糕車會隨機探訪小學、中學、專上學院、大學，以及真正具遊客吸引力的景點。",
      "雪糕車由目前縮放畫面之外駛入，沿道路前往目標，按香港左側行車方向選擇建築物同一邊的行人路路邊。",
      "進站及離站改用向前斜切的曲線，自然靠近路邊、播放雪糕車音樂，再匯入行車線並駛出目前畫面。",
      "雪糕車音樂會與其他城市背景聲混音，並跟隨環境音量、鏡頭距離與遊戲暫停狀態。",
      "存檔會一併記錄地圖中心位置、縮放比例及旋轉方向，重新載入後不再重設視角；舊存檔仍可正常使用。",
      "取消一般人口增加的重複通知，特殊建築解鎖等重要提示不受影響。",
    ] },
    { version: "v3.4.0", date: "2026-07-26", dateLabel: "2026年7月26日", title: "可視交通車流、香港左側行車與山路橋面更新", items: [
      "加入十九款巴士、私家車、小巴、的士、貨車及客貨車，共七十六張方向貼圖；各車種按實際長短使用獨立城市比例。",
      "車流按可視範圍交通量加權生成，採用香港左側行車、分離雙向行車線、路口曲線轉彎及前後車安全距離。",
      "車輛可連續駛過高地道路、普通斜坡、山脊、橋斜坡及橋面；上坡會減速，落斜坡及旋轉視角時仍保持正確高度與方向。",
      "只有放大至指定比例先延遲載入車輛，縮小或離開畫面即清走；離屏道路不建立或渲染車流。",
      "加入地形 viewport culling、分批生成、有限路段轉移、貼圖逐批載入及 depth 批次更新，改善大型城市載入與移動畫面時的效能。",
      "交通只屬即時視覺層，不修改城市經濟、交通地圖或存檔格式，舊城市可直接載入。",
    ] },
    { version: "v3.3.0", date: "2026-07-22", dateLabel: "2026年7月22日", title: "大型項目、城市新聞與特殊建築解鎖更新", items: [
      "海洋公園改為 8×8 議會項目，按人口、收入、盈餘及經濟指數審批；機場與大型項目保留舊存檔 footprint fallback。",
      "新增機場批准、海洋公園活動及股災討論區圖片與新聞；八號或以上風球會按颱風名稱及天文台台長產生避風與水浸帖文。",
      "名人訪問、演唱會、企鵝保育、教堂及大學新聞改為要求相關建築真正存在。",
      "重新啟用科學園模型並保留兩階段安全載入；改善工業區模型分類及貼圖失敗保護。",
      "修正貨櫃碼頭沙灘海岸、重複岸邊及旋轉方向；海邊格改用索引，避免大型城市旋轉時掃描數千萬次。",
      "加入完整特殊建築解鎖手冊、遊戲內說明及議員風格首次解鎖走馬燈。",
    ] },
    { version: "v3.2.0", date: "2026-07-19", dateLabel: "2026年7月19日", title: "全新城市天際線、住宅商業分級與「我愛玫瑰園計劃」", items: [
      "住宅及商業模型加入 L／M／H／UH 分級，按地價、景觀、環境、經濟、健康及城市設施形成更有層次嘅社區與商業核心。",
      "富豪住宅只會出現喺合資格低密度住宅區；世界級摩天大樓只會出現喺具備股票交易所、機場與優質營商環境嘅高密度商業區。",
      "新機場以 12×12「我愛玫瑰園計劃」登場，必須通過人口、財政、經濟條件及議會審批先會解鎖建造。",
      "公共服務、康文設施及地標選單重新分類；大學、社區學院、警察局與消防局模型按順序循環，增加地圖多樣性。",
      "全面更新 isometric anchor、貨櫃碼頭 4×4 模型及 lossless WebP 發佈管線，改善縮放鋸齒、貼圖穩定性與桌面版容量。",
    ] },
    { version: "v3.1.8", date: "2026-07-15", dateLabel: "2026年7月15日", title: "修正語言切換後城市地形高度大面積變形", items: [
      "內建城市地形預覽而家只會回傳預覽資料，不會再將台北等預覽高度寫入正在遊玩嘅城市。",
      "進入遊戲後切換英文、繁體中文或日文，不再背景刷新已隱藏嘅 landing screen 地形預覽。",
      "加入地形預覽隔離回歸測試，確保新遊戲仍正常建立高度，而預覽永遠不會污染正式地圖。",
    ] },
    { version: "v3.1.7", date: "2026-07-14", dateLabel: "2026年7月14日", title: "修正法案結果新聞圖片並清理失效模型載入", items: [
      "法案通過三個月後嘅效果新聞，已改用封裝內實際存在嘅 <code>UI/news/*.webp</code> 圖片，彈窗顯示前亦會統一路徑，修正 DMG 與 EXE 版圖片失效。",
      "移除啟動時對 78 個已刪除 <code>Models/PNG/buildingTiles_*.png</code> 模型嘅載入要求，以及相關未再使用嘅舊放置與目錄程式，避免 console 不斷出現 404。",
      "清除已失效嘅商業建築 fallback 檔名，並檢查所有啟動與 fallback 模型路徑均有對應檔案。",
    ] },
    { version: "v3.1.3", date: "2026-07-12", dateLabel: "2026年7月12日", title: "修正討論區圖片失效並降低發帖頻率", items: [
      "颱風、暴雨、學術排名、過氣歌星、免費雪糕、幻彩 fing 香城等 15 張討論區「特別事件」圖片，之前仍然指向遷移前嘅舊 .png 路徑（實際檔案已改用 .webp），全部顯示失效。已修正返所有路徑，連建立帖文時嘅圖片驗證都改用同一套邏輯，唔會再靜靜地擋走已修正嘅路徑。",
      "討論區之前每個遊戲月份都會發一則新帖，即使冇任何特別事件都照發，日子長咗會頗為煩擾亦拖慢遊戲。而家淨係當真係有事發生（颱風、新政策、數據觸及門檻、季節性話題等）先會即月發帖；如果冇，就最多每 3 個月先補一則閒聊帖。",
    ] },
    { version: "v3.1.2", date: "2026-07-12", dateLabel: "2026年7月12日", title: "AI 新聞加入三振自動停用機制", items: [
      "當 AI 新聞服務暫時不可用（例如額度用盡）時，討論區之前會不斷重試每一篇未生成留言嘅帖文，短時間內連環發出大量請求，連累圖片同音效一齊載入唔到。",
      "而家走馬燈新聞、立法會角色新聞同討論區留言共用同一個「三振」機制：連續失敗 3 次就會自動停用成個 AI 新聞服務，並彈出提示，唔會再各自無限重試拖慢成個遊戲。",
      "去設定入面重新開啟 AI 新聞會即時進行一次測試生成，同樣受三振機制保護——再連續失敗 3 次會再次自動停用。",
    ] },
    { version: "v3.1.1", date: "2026-07-12", dateLabel: "2026年7月12日", title: "修正討論區新聞圖片失效", items: [
      "v3.1.0 入面討論區同新聞彈窗嘅圖片會 404——已補回缺少嘅圖片檔案，全部應該正常顯示返。",
    ] },
    { version: "v3.1.0", date: "2026-07-12", dateLabel: "2026年7月12日", title: "立法會議事廳重新設計與香城討論區 AI 留言", items: [
      "法案與條例由一條長清單改做可摺疊分類：財政經濟、公共安全與交通、環境與城市規劃、教育與科研、社會福利、管治改革，另加獨立嘅特別決議（一次性撥款）分類。",
      "每條法案同決議顯示動議官員或議員嘅頭像；議事廳畫面用返實景相做背景，動議進入表決會顯示進度階段。",
      "官員專業意見同議員立場由直排列表改做左右交替嘅辯論式卡片。",
      "香城討論區留言支援 AI 生成：網民 2-3 條、官員 1-2 條，並修正令留言一直生成唔到嘅 token 截斷問題，加入自動避開唔穩定 model 嘅備援機制。",
      "音樂音量同新增嘅都市背景音量會記住上次設定；天氣視覺效果開關維持預設開啟。",
      "頂欄選單重新分類，檢視同設定分流，移除同頂欄重複嘅速度掣。",
    ] },
    { version: "v3.0.0", date: "2026-07-11", dateLabel: "2026年7月11日", title: "立法會議會系統、AI 人物新聞與颱風信號天氣重製", items: [
      "加入立法會：十位有名有姓嘅官員議員，會按稅率、治安、污染、醫療等真實城市數據作出回應，人物可改名。",
      "AI 新聞新增「人物新聞」：官員議員政策回應、隨時可請嘅人物專訪，同天文台長嘅颱風信號公告，AI 版本以外一律有規則版 fallback。",
      "颱風改用西北太平洋真實命名清單（中日文對照），信號按實際模擬風速升跌，呈現 1→3→8→(9→10)→8→3→1 嘅真實進程；暴雨警告按天文台雨量門檻分黃紅黑三級。",
      "頂部新增天氣狀態列（溫度、濕度、信號徽章），加入落雨粒子同閃電雷聲效果，效果強度隨風雨同步變化；設定可關閉視覺效果，照顧配置較舊嘅電腦。",
      "立法會建成同股票交易所開市、八號或以上風球會彈出報紙式「號外」頭版。",
      "加入香港式地區環境白噪音：越 zoom 入商業商住區越聽到都市白噪音，zoom 入純住宅區就轉返寧靜住宅氛圍，天氣仲會疊加落雨或打風音效。",
    ] },
    { version: "v2.0.0", date: "2026-07-10", dateLabel: "2026年7月10日", title: "雲端 AI 分區新聞與城市生活模擬", items: [
      "加入選用 Ollama Cloud AI 新聞，以香港本地編採語氣把城市實況寫成「香城快訊」。",
      "加入天氣、暴雨、颱風階段與市民活動，並連動交通、經濟及新聞內容。",
      "新增玩家命名嘅香港式雙語分區路牌；每區交通、教育、醫療、污染、地價及人口會影響地區新聞。",
      "API key 不會放入 GitHub 或安裝檔；玩家安裝後自行輸入一次，並由系統安全儲存。",
      "路牌改名、放置、拆除與顯示設定加入安全自動存檔，存檔格式升至第 12 版。",
    ] },
    { version: "v1.1.0", date: "2026-06-08", dateLabel: "2026年6月8日", title: "交通指數系統與資訊地圖整合", items: [
      "加入交通指數模擬及交通 Overlay 地圖。",
      "高擠塞會降低住宅與商業需求，並影響城市發展評分。",
      "市政局將所有 Overlay 整合到資訊地圖視窗。",
    ] },
    { version: "v1.0.5", date: "2026-06-06", dateLabel: "2026年6月6日", title: "Windows 自動更新第一版", items: [
      "加入 Windows 桌面版自動檢查更新、背景下載與重開套用更新流程。",
      "macOS 未簽章前先提供新版提示，並可直接開啟下載頁手動更新。",
      "Release 會一併上傳 Windows updater metadata，包括 <code>latest.yml</code> 與 setup blockmap。",
      "入口網站下載統計改為只計公開下載檔，不計 updater metadata。",
    ] },
    { version: "v1.0.4", date: "2026-06-06", dateLabel: "2026年6月6日", title: "醫療系統、讀檔修正與大型建築顯示改善", items: [
      "加入醫院、健康指標、預期壽命、醫療覆蓋與健康地圖第一版。",
      "加入疫情、醫療容量與衛生政策初版，包括禁煙及學童保健計劃。",
      "修正城市讀檔等待流程，避免入口網站或遊戲場景未 ready 時載入失敗。",
      "改用深度區段 fallback 處理地貌、道路、建築與效果排序，改善大型 4x4 建築被地面蓋住的問題。",
    ] },
    { version: "v1.0.3", date: "2026-06-06", dateLabel: "2026年6月6日", title: "桌面安裝包同步", items: [
      "分開提供 macOS Apple Silicon 與 macOS Intel DMG。",
      "同步 Windows 安裝版及免安裝版下載連結。",
      "更新發佈流程文件，方便之後一包式更新遊戲、網站與 installers。",
    ] },
  ],
};

// Populate zh-TW / en / ja changelog arrays via a translation table keyed by
// version, so the (much longer) zh-HK array above stays the single source of
// truth for structure/order and each language only needs to supply its own
// title/items text.
const SITE_CHANGELOG_TRANSLATIONS = {
  "zh-TW": {
    "v4.14.0": { title: "香城討論區", items: [
      "官網「官方新聞」頁變成真正的香城討論區：4 個分類 tab（城市發展／城中熱話／交通台／吹水台）與遊戲中一致，官方新聞與街坊自己開的貼文一起出現（官方新聞有「官方」標籤），新增開新貼文表單——不再只能留言，大家可以直接開新話題。",
      "貼文與新聞現在可以獲得 emoji 回應：👍讚／😂笑／😡怒／↗分享／新增🤡小丑，經版主核准後會同步到遊戲的討論區顯示。這些反應使用較寬鬆的獨立額度，不會與文字留言搶用同一個嚴格的每分鐘限額。",
      "宣傳2-零速傳播右側的街坊廣告牌，由清單式改為面板底部的跑馬燈，視覺對齊遊戲中跑馬燈的風格。",
      "首頁下載次數改為只顯示一個總數，不再依版本、封包類型細分。",
    ] },
    "v4.13.1": { title: "香城大小事 有你參與", items: [
      "官方新聞現在會連照片與全文一起出現在【香城討論區】，不再是每則留言各自變成一則獨立貼文；留言會變成該篇新聞下方的回覆，與真正的新聞＋留言關係一致。",
      "修正官方新聞留言／討論區貼文同步進遊戲後日期打錯：先前使用現實世界的日期（例如 2026 年），但每座城市有自己獨立的模擬年曆（可能已經到 3000 多年），現在改用城市自己的模擬年月，不會再因為日期太「舊」而被排到討論區最底、看不到。",
    ] },
    "v4.13.0": { title: "香城大小事 有你參與", items: [
      "官方新聞：官網新增【香城官方新聞】，可以貼新聞相片與內文，大家隨時留言。留言經版主核准後，會變成遊戲中【香城討論區】的貼文。",
      "宣傳2-零速傳播（前稱香城廣告街）：大家可以在官網申請一則 120 字以內的廣告，經版主核准後，就會加入遊戲的新聞跑馬燈，與原有的宣傳詞一起輪流播放。",
      "版主審核：所有經官網送出的內容（討論區貼文、回覆、新聞留言、廣告）現在都要版主在 docs/moderate.html 登入核准，才能進入遊戲，避免遊戲被低俗或攻擊性言論污染。",
      "官網所有暱稱欄位新增「隨機」按鈕，按一下就用遊戲 NPC 同款的命名方式幫你選個名字。",
      "以上內容全部經網路取得，連不上或取不到就會靜默降級，遊戲照常使用原本資料，不會卡住或出錯。",
    ] },
    "v4.12.0": { title: "各就各位", items: [
      "行車天橋護欄：每條橋面、每段坡道兩側現在都有護欄，隨路面坡度起伏，兩端接口對得正；深度排序確保站在橋上的燈桿與駛過的車輛，一定夾在遠、近兩側護欄之間，不會出現前後順序錯亂。",
      "修正樹木與雜物「站錯格」：先前每棵樹、每件雜物其實畫在自己格子斜前方那一格——要拆得先點選斜後方那格；前後遮擋順序又依這個錯位計算，於是前一格的建築反而遮住了畫面上站在它前方的樹。現在樹木與雜物站回自己格子中心，與建築、燈桿、車輛一樣依地圖前後排序，四個地圖方向都已驗證。",
      "種樹按鈕先前套用「野生森林」的規則，不准在貼路或已劃區的地種樹——建成區內幾乎無處可種，也沒有任何提示。現在人工種植可以在路邊與空置的劃區地種植（蓋房子會自動清除該樹），種不了的位置加上綠／紅格指引，以及說明原因的提示。",
      "上坡道路貼圖重新繪製：舊圖每上一格升高約 15px，與地形實際的 13px 不吻合，導致爬坡道路每格接縫都有段差與錯位的路肩，甚至突出的擋土牆尾端。四款坡道貼圖已對齊地形重畫。",
      "號誌燈與路燈的燈桿在縮小檢視時不再出現鋸齒（改用 2 的冪次畫布烘焙，讓 Phaser 產生 mipmap），並重新校準大小；夜晚開場畫面的「載入遊戲素材中」進度條不再週期性閃爍；官網「左駕」用詞更正為「右駕」；旋轉地圖方向後海面不再殘留雜物。",
    ] },
    "v4.11.0": { title: "明明綠燈 轉眼變為紅燈", items: [
      "路口號誌：每個 T 字與十字路口自動在前一格、駕駛人左側（香港右駕、靠左行駛）設置燈桿，面向來車。燈序依香港：紅 → 紅黃 → 綠 → 黃 → 紅，十字兩相位各綠 8 秒、T 字幹道 10 秒支路 5 秒，行人小綠人在對向綠燈時亮起、最後 3 秒閃爍。車輛在路口前約 8 公尺停紅燈排隊（巴士停得更後），黃燈太近就直接通過；路線巴士與冰淇淋車同樣遵守號誌。夜晚亮起的燈面有光暈，隨「建築燈光」開關。",
      "路燈：依路政署街燈慣例——直路 30 公尺交錯排列（兩側輪流）、彎道外側一支、橋面與坡道都有，路口交給號誌桿。夜晚換上烘焙的高壓鈉燈貼圖（橙色燈面、光錐與路面光池），日出熄燈，隨「建築燈光」開關一起關閉；全部由路網自動推導，不佔存檔。",
      "Mac 幀率提升三倍：Phaser 每個 render batch 以 gl.bufferSubData 寫入同一個 vertex buffer，在 macOS 的 ANGLE→Metal 上每次都得等 GPU 讀完上一次；改為重新配置上傳後，旺角由 13 fps 提升到 45 fps（zoom 2 時 56）。另外每 7.5 天一次的模擬 pulse 由一次 270 毫秒改為分數幀逐步執行、巴士公司每小時對每站掃描全城建築（每幾秒卡 0.5 秒）改用網格快取、夜景貼圖每 0.1 秒全城重算改為記住每棟下次變化的時間。",
      "修正：夜晚的樹木變成詭異的紅色（夜間物件色調計算超出目標色）；release 版公車站只有一半大、視窗改變大小後燈桿偏移；建築燈光預設永遠使用烘焙貼圖，Phaser 即時光源只保留在測試模式；release pipeline 讓所有半透明像素變白變亮（AA 邊緣淺色 fringe、橙色路燈光池變黃）——每個 raw buffer 宣告 straight alpha 後全部重新編碼。",
    ] },
    "v4.10.1": { title: "先敬羅衣", items: [
      "修正畫面「一閃一閃」：飄過城市的雲比整個視窗還大，但一出生就是最終透明度、消失時一幀就不見，陣雨天每 0.7 秒就有一團大雲直接彈出來。現在每片雲在生命期頭尾各約 18%（六至八秒）慢慢淡入淡出。",
      "安裝檔不再夾帶官網留言板的後端原始碼；並以 release 安裝檔實測確認開場展示城市隨 app 一起發佈、不會出現在載入清單、也無法被覆寫。",
    ] },
    "v4.10.0": { title: "先敬羅衣", items: [
      "開場畫面換上一座真正的香城：主選單後面即時渲染太子——海港、貨櫃碼頭、路上行駛的車，日夜燈光跟隨你的本地時間，天氣跟隨香港天文台即時觀測（離線則用遊戲自己的天氣），鏡頭緩緩漂移。只渲染不模擬：日曆凍結、不會自動存檔、不會有新聞或通知，也不會碰你任何存檔。機器吃力時會自動先關建築燈、再固定鏡頭、最後退回靜態夜景；設定選單可以整個關閉。載入前的靜態封面也換成最新的夜景天際線。",
      "修正開新城市時殘留上一座城市的公車站、車輛與天氣：以前只重設資料沒有清 sprite，從展示城市或返回主選單後開新城市會看到滿地公車站。載入沒有連結手動存檔槽的 autosave 時，如果剛好有一個同名手動存檔，會自動認領它，返回主選單不會再多出一個重複城市。",
      "夜景燈光每幀成本減半：release 版所有建築本來就用烘焙貼圖，但每幀仍逐棟重新判斷；現在記住結論直接跳過（旺角 34 萬人口夜晚 30 fps，與日間相同）。開發模式也預設使用與 release 相同的烘焙貼圖。",
      "官網：新增免登入的「香城連儂牆」留言板（Cloudflare 後端，每分鐘一則、每小時五則），玩家手冊併入遊戲指南並加入 17 張遊戲截圖，首頁背景換成最新夜景。",
    ] },
    "v4.9.0": { title: "香城夜色", items: [
      "黃昏開燈過渡：每個模型多一套「半亮」貼圖（共 532 張夜景貼圖）。日落後換圖一刻全城只有路燈，然後每棟樓在自己的時間 路燈→半亮→全亮，最遲兩個多小時全部到位；23:00 熄燈也改為逐級下降。深夜真正變暗：由 23:00 開始加深，00:30～04:30 最暗，05:30 前回復。",
      "時鐘不再跟幀率走：之前用 Phaser 平滑幀時間，視窗不在 focus 或讀檔後幀率未回復時時鐘會慢行再「自行加速」；現在用真實幀時間，任何幀率都是準確 1×，讀檔重設速度時 topbar 按鈕也會同步。夜晚讀檔會先預載夜景貼圖、立即亮燈；夜晚新建或重建的樓下一個 tick 立即套用夜景。冰淇淋車 23:00～06:00 收工。",
      "全新 19 張遊戲截圖與四語說明，GitHub README 與本網站的遊戲介紹按現行版本重寫。",
    ] },
    "v4.8.0": { title: "日月如梭", items: [
      "一個顯示日就是一個日曆月：之前天空與日曆各自運行，一個顯示日經過 108～180 個日曆日，法案未到黃昏就到期、一輛公車日出到中午已經跑完一個月。現在日曆由日夜時鐘推算，月份使用真實長度（2 月 28／29 日、格里曆閏年），一年剛好 96 分鐘真實時間。議會法案改為按「幾個月收入」定價（N 值減半、月收入下限 $2,000），公車班次、保養、故障、乘客累積全部改用顯示時間；幻彩詠香城每三個月在當月晚上 8 時舉行一場 30 分鐘，八號或以上風球取消。",
      "每棟樓有自己的夜晚：每個模型多烘焙一套「只有路燈」貼圖（133 個模型、399 張）。入夜住宅七成、商業五成、工業三成開高峰燈，其餘直接深夜燈，地標全開；23:00～01:00 高峰樓逐棟轉深夜燈；01:00～03:00 一半的樓逐棟熄到只剩路燈，05:30～06:00 早起的人陸續開燈。醫院、警局、消防局、救護站整夜全開。",
    ] },
    "v4.7.0": { title: "風雨有時", items: [
      "天氣依日夜循環運行：之前一個顯示日經過 108～180 個日曆日，天氣每 1～2 個日曆日就換，日出到日落之間變化 60～180 次。現在每種天氣持續 5～11 個顯示小時、四成機率延續，一日變化兩三次；暫停時天氣凍結，速度與日夜同步。",
      "颱風有始有終：季內每 4～6 個顯示日一個，持續 18～36 個顯示小時，訊號 1→3→8→9→10→8→3→1 逐級升降，不會在 8 號 9 號之間抖動。暴雨警告即時升級、雨明顯減弱才降級，不會一小時內紅黃紅黑地跳。",
      "所有固定建築入夜亮燈：新增 58 個校正模型（政府設施、地標、發電廠、貨櫃碼頭、巴士車廠、公園、工業 3x3），已烘焙夜景模型由 70 個增加到 133 個。修正了固定建築先前從未使用烘焙貼圖的問題；機場、核電廠、碼頭的閃燈以輕量物件保留。",
    ] },
    "v4.6.3": { title: "萬家燈火", items: [
      "修正重建過的地皮會取錯夜景貼圖（重要，建議 v4.6.0～v4.6.2 使用者更新）：夜景貼圖與燈光校正都靠 sprite 記住的模型檔名查找，但這個名稱只在建築第一次興建時寫入；地皮重建換了模型之後沒有更新，入夜就取到另一棟樓的貼圖。同一個資料夾的貼圖尺寸不一定相同，因此會畫大一倍或小一半，地皮剩下的位置露出草地；路燈與窗戶也會擺到另一棟樓的位置。現已改為以存檔記錄為準，重建時同步更新。",
      "夜燈顏色依建築類別而定：住宅暖黃、辦公室冷白、工業琥珀、服務設施淡藍，不再一律暖黃。路燈維持暖鈉黃。",
      "新增 18 個已校正夜景模型（商業 3x3 補齊、4x4 四個、5x5、首個工業 1x1）。已烘焙的夜景模型由 54 個增加到 70 個，共 140 張貼圖。",
    ] },
    "v4.6.2": { title: "萬家燈火", items: [
      "新增 14 個已校正夜景模型：住宅 4x4 兩款、住宅 5x5 三款、商業 1x1 五款、商業 2x2 四款。已烘焙的夜景模型由 40 個增加到 54 個，每個兩張（普通夜晚／深夜），共 108 張貼圖。",
      "商業模型的燈色依校正時選擇的類別而定——辦公室冷白、工業暖黃、服務設施淡藍，並非一刀切。路燈同樣只烘焙光暈完全落在模型範圍內的那些。",
      "未校正的模型維持原本的即時光暈路徑，行為不變；現有城市存檔完全相容。",
    ] },
    "v4.6.1": { title: "萬家燈火", items: [
      "修正建築模型錯位（重要，建議所有 v4.6.0 使用者更新）：夜景貼圖被誤當成建築模型列出，令每個模型重複三次。模型編號是按目錄順序編排，而存檔裡每棟建築就是靠這個編號找回自己的圖——house2x2 由 17 個模型變成 51 個、第一格更變成夜景貼圖，導致現有城市的建築悄悄換掉模型。現已在伺服器與用戶端兩邊過濾掉衍生的夜景貼圖，並加入回歸測試。更新後建築會恢復正確模型。",
    ] },
    "v4.6.0": { title: "萬家燈火", items: [
      "夜景貼圖：40 個已校正的建築模型各烘焙兩張夜景貼圖（一般夜晚／深夜），入夜自動換圖。亮起的是原圖本身那些窗——用校正格當遮罩去照亮真實窗戶，而非在上面畫方格，所以窗框、陽台、玻璃質感全部保留，窗邊還有柔和暖色光暈。",
      "兩層夜色：深夜的樓宇立面更暗、亮燈窗戶疏落許多，整座城市會隨著夜深靜下來。夜色本身也由一層拆成地面層（只覆蓋地形與道路）與大氣層（薄薄一層覆蓋全部），讓亮窗不會被夜幕壓成灰色。整體夜晚暗度 0.45。",
      "效能：同一個密集夜景 render 由 165 毫秒降到 12 毫秒。路燈烘焙進貼圖，但只烘焙光暈完全落在模型範圍內的那些。未校正的模型維持原本的即時光暈，並加入以鏡頭距離排序的 LOD。燈光校正資料改用檔名當 key，不會再因為新增／刪除模型檔而錯位。",
    ] },
    "v4.5.0": { title: "輕舟已過", items: [
      "建築貼圖最佳化：一般建築模型由 1024² 縮到 512²，機場、大會堂、貨櫃碼頭等大型地標保留 1024²。GPU 貼圖記憶體約減 62%（約 680 MB → 260 MB），城市存檔載入由約 3.5 秒縮到約 1.7 秒，正常縮放下畫質看不出差異。原始 PNG 母檔保留。",
      "夜間建築燈光開關：View 選單新增「夜間建築燈光（亮燈窗戶／街燈）」，獨立於「動態光影」。關閉後立即清除現有光暈、之後每幀零成本，適合較弱的機器或人口數十萬的巨型城市。設定會記住，繁中／英／日介面齊備。",
      "資產管線：發佈資產上限預設由 1024 改為 512，加入依資料夾的地標例外；發佈驗證器改為逐項記錄解析度。現有存檔完全相容，無需遷移。",
    ] },
    "v4.4.0": { title: "華燈初上", items: [
      "遊戲時鐘日夜循環：天空顏色與方向性太陽光影現在跟隨遊戲時間（顯示 8x 速度下約一分鐘一日），並依香港天文台 2026 年逐日日出、日落與曙暮光資料變換；天亮、黃昏、入夜、深夜各有其色。可在 View 選單開關「動態光影」。",
      "夜幕、星空、月亮：入夜後出現紫藍色夜幕；晴天才看得到星空；月亮會依月相變化，在天空由東移到西。",
      "時段交通：環境車流隨一日時段起伏——上下班尖峰時段車最多，深夜街上最冷清。",
      "夜間車燈：19 款車全部有兩頭燈兩尾燈，天黑或下大雨時漸漸亮起，依每張四方向圖逐一校正的位置，轉彎不再飄移。",
      "公車車廂燈：雙層公車上下層各有一條車廂燈管，夜間透過車窗透出暖白光。",
      "效能：車燈只在夜間／暴雨時才計算，白天零成本；每格明暗強度每幀只計一次。",
    ] },
    "v4.3.1": { title: "漁火閃閃", items: [
      "修正公車 DLC 完全無法開局的經濟問題：公車公司啟動資金由 $600 提高至 $6,000，現在足以支付一座 $4,000 車廠、建立路線，再購買兩輛標準雙層公車，並留有 $1,440 營運資金。",
      "舊版已成立公車公司的存檔會在載入時一次性自動補發 $5,400 差額，重新開啟遊戲、重複載入或開關 DLC 都不會重複入帳。",
    ] },
    "v4.3.0": { title: "漁火閃閃", items: [
      "海面流動效果：開放水域（大海／湖泊）的水面現在會有動態波浪紋理，隨風速（颱風信號做為下限）分五級變化——風平浪靜時輕輕晃動，8號颱風以上會變得波濤洶湧、紋理明顯加大加快，可在 View 選單獨立開關「海面流動效果」。",
      "夕陽波光粼粼：晴天、太陽循環接近日落的那段時間，水面會浮現白熱金邊的閃光點，當中幾顆特別亮的「主角」閃光還帶十字光芒，彷彿陽光在水面反射般閃閃發光。",
      "下雨漣漪：下雨時開放水域會不時泛起橢圓形（依地圖 2:1 等角比例）的漣漪圈，密度隨雨勢一起遞增——小雨稀疏，黑雨／8號颱風會密到整片水面都是漣漪。",
      "新增香港18區自動命名系統：巴士站沒有自訂名稱就會自動依所屬地區命名（還會選方向／碼頭等字尾），也可以隨時手動重新命名；小地圖「住宅」總覽現在也會標示實際地區名。",
      "修正運輸車廠一直只有第一個接上路的才算「啟用」的 bug，以及一個地形編輯 bug：把水陸交界泥地的鄰居畫成水之後，那堆廢棄車／貨櫃堆會留在水面上不會消失，現在會一併清除。",
    ] },
    "v4.2.0": { title: "霧鎖香城", items: [
      "新增動態光影：晴天會出現方向性太陽光影，隨一個獨立於遊戲曆的真實時間循環，緩緩由東面金黃色移到頭頂中性光，再到西面橙紅色夕陽，可在 View 選單隨時開關。",
      "全天氣雲層系統：由以前只有陰天才有雲，改成所有天氣都會飄雲，密度和顏色隨天氣分五級——晴天最少最淡、陰天中等、下雨轉厚、黑色暴雨／8號颱風以上就會變成深灰色烏雲；雲層會自己飄動，zoom 入超過1.2倍會逐漸散去，彷彿穿過雲層般清晰，zoom 出後又會重現。",
      "交通效能和顯示範圍優化：重寫傳輸／交通／船隻視覺的每幀掃描邏輯，大幅減少計算量；環境車輛現在 zoom 1x 就會開始出現（舊版需要 1.4x）；修正高倍數 zoom（2x 以上）環境車輛會完全消失的 bug。",
      "速度鈕重新編號：舊有 0.15x／0.5x／1x／2x 四檔改為 1x／2x／4x／8x 顯示，數字更加直覺；新建／載入城市預設維持原有節奏（即舊的 0.15x 檔）。",
      "清理約 53MB 從未實際使用的美術素材（重複貼圖、舊地形殘留圖等），降低安裝檔大小。",
    ] },
    "v4.1.0": { title: "青山綠水", items: [
      "新增荒地廢棄物場景：大片平坦草地會長出一塊塊碎石地（dirt），碎石地上有一成機率出現廢棄車輛或貨櫃堆，尺寸依遊戲內真實車輛模型校準，隨機偏移擺放；碎石地只會出現廢棄物，不會再長樹。",
      "廢棄物行為和樹木一樣會自我修復：地上蓋了建築、劃了地帶或鋪了馬路，廢棄物會在下一次模擬循環自動消失；推土機鈕可以即時清除廢棄物，同時保留地下的碎石地。",
      "整套地形貼圖換成新一套「自然系」風格（草地、沙灘、河道、山坡、馬路等），並修正山坡貼圖和路面高度不合的階梯狀問題。",
      "公車站恢復進站減速/離站加速動畫、改為允許單邊擺放並支援沿途順道載客、收到車資會有 TTD 式浮動 \"+$\" 提示；車輛追蹤視窗重新設計成側邊圖示分頁。",
      "修正公車和背景車流互相重疊的視覺問題；優化城市污染和財政預算計算效能，大城市長期運行更流暢。",
    ] },
    "v4.0.0": { title: "香城公車公司", items: [
      "全新「運輸營運」模式：點左上角「建設指引 CITY GUIDE」的 header，即可在城市建設和經營公車公司之間切換——同一張地圖、同一個時鐘，但工具和介面會換成路線、車隊、需求、車廠、財務、公司六個獨立可拖曳視窗，由頂部工具列逐一開關。",
      "公車公司有自己一套獨立資金（開業獲發 $600 啟動資金），和市政府庫房完全分開；公車要在車廠逐輛購買（兩種車型 $210～$280），有 12 個車位上限，行駛久了要定期回廠保養，連續三個月虧損會自動暫停所有路線。",
      "公車改用真實逐輛模擬：每輛車依實際路線行駛、上下客、賺取車資即時入帳，不再是舊有的公式估算；公車站會即時顯示候車人數，點任何一輛行駛中的公車就會開啟一個獨立追蹤視窗，即時鏡頭跟著這輛車。",
      "路線經營表現會為附近地區帶來四項實際效果：紓緩交通壅塞、提升商業區地價、增加工業區勞動力需求、提升 H 級或以下住宅的快樂指數（頂級豪宅 UH 不受惠）。",
      "修正城市資金列「更多資訊」展開後點不回去的問題（該按鈕展開後位置會移動，導致第二次點擊落空）；縮放控制移到城市畫面右上方，不再和旋轉／靜音鈕擠在一起；增加背景車流的隨機車輛數量，讓大城市看起來更加繁忙。",
    ] },
    "v3.14.0": { title: "時空重置", items: [
      "全新時間系統：日曆由以前「約7.5天一個模擬週期」改成一天一天這樣走，速度檔位改為 暫停／0.15x／0.5x／1x／2x（原本只有1x/2x/4x/暫停），新開/載入城市預設1x。1x保持和以前一樣的節奏（一個月約20秒、一年約4分鐘），重型城市模擬（經濟、人口增長、股市等）維持每個月4次不變，只有天氣（和颱風）改為每天更新，讓風球這類短時間事件看起來不再一下就過。",
      "慢速不再拖慢車輛：以前選0.15x/0.5x連馬路上的車、船、飛機都會跟著慢到像定格，現在車速固定不會跌破正常1x（只有2x才會加快），慢速只影響時間流逝快慢，不影響交通畫面觀感。",
      "新增巴士站路邊裝飾：直路兩邊都可以擺放巴士站牌連遮雨棚（$20），四個方向自動貼到正確那邊路肩。",
      "修正巴士站遮擋順序：其中兩個方向進站一刻會被巴士站遮雨棚蓋住半台車、往前一點才恢復正常的問題，現在四個方向都按路面規則穩定顯示——靠近行車線那邊巴士站固定在前，另一邊就車在前。",
    ] },
    "v3.13.0": { title: "官員專訪", items: [
      "新增十位官員議員的「人物專訪」金句：行政長官、財政司司長、警署署長、天文台台長、康樂及文化事務署署長，以及自由市場派、民主派、商界、宗教界、旅遊界議員，各有一句專屬性格quote，三語言（中／英／日）齊全。",
      "「Profile feature」鈕改成即時彈出效果：按下去個人資料卡裡「核心理念」的quote box會立刻換成這句人物專訪金句（換色highlight），6秒後自動變回原本那句。",
      "修復了「人物專訪」鈕一直沒反應的Bug：原來按下去只是把句子塞進一個整個遊戲都沒讀取的內部陣列，沒開AI新聞就什麼都不會顯示，難怪一直好像壞掉了一樣。",
    ] },
    "v3.12.0": { title: "宣傳2", items: [
      "新增「住宅財富分區」制度：全地圖劃成 16×16 網格，按附近已建成住宅的平均地價分類做平民區／中產區／富人區／富豪區域四級，每級有固定的 L/M/H/UH 出現機率（富豪區域 UH 70%／H 30%，平民區 M 40%／L 60% 等），完全取代舊有的逐格質素分帶和UH「只限低密度」規則。",
      "富豪區域加入額外門檻：除了地價要達標，附近還要有大型旗艦公園（維多利亞公園級別）、海邊，或者地標建築（廟宇、教堂、博物館、體育館等）才會解鎖；反過來，附近有工業區、發電廠、貨櫃碼頭或者機場的地方，就算地價再高都會封頂在中產區，不會出現富人區和富豪區域。",
      "新增建築「密度款式」（LD/MD/HD 低/中/高層樓身），和財富分區獨立疊加：低密度住宅區主要出現LD／MD款、高密度區主要出現MD／HD款，HD款式在低密度區保證不會出現。",
      "修正Electron桌面版裡「幫建築物改名」沒反應的Bug：`window.prompt()` 在Electron裡根本沒有實作，按下去什麼都不會彈出來；改用APP自家的彈窗（和「另存新城市」用的一樣），連帶修好「生成新地形」和「儲存地形預設」裡同一個問題。",
      "新聞跑馬燈加入10款懷舊香城式廣告（時倉迷你昌、得城女傭、Why Me Me等），和城市新聞穿插出現，每3則就有1則是廣告。",
    ] },
    "v3.11.0": { title: "大時代", items: [
      "新增「金融管理局」政府股票交易：證券交易所建成、國庫儲備超過1000萬後解鎖，可直接動用國庫資金在交易所買賣任何上市股票，交易會影響即市股價（買進推升、賣出壓低），收取0.25%手續費，單一股票持股上限15%，無法囊括全城股市。",
      "股市牛熊循環重新調整：熊市由過去偶爾出現的短暫插曲，變成與牛市、橫盤市況三足鼎立的真實週期；上市公司基本面會隨市況起伏，長期而言恆指與每檔股票的合理價值都設有上下限，不會隨遊戲時間拉長變成天文數字。",
      "政府入市護盤、大量買進、獲利或虧損都會登上報紙頭條，新增兩張新聞插圖（股市大好／官員虧損）搭配報導。",
      "重新盤點全城住宅和商業建築的出現機率：修復了UH豪宅的2x2「別墅」款式在低密度住宅區永遠不會出現的漏洞（現在會和3x3「大宅」款式一起有機會出現）、大幅提高 4x4／5x5 住宅和商業大樓的出現率，並將幾款過高過大的2x2 H級洋樓調低出現機率，避免成為街景的絕對主流。",
      "新增「低密度社區活化」：若整個 3x3 街區的透天厝全部達到UH豪宅的嚴格門檻（地價、景觀、環境、健康、經濟指數皆達標），有機會一次重建成一座UH豪宅大宅。",
    ] },
    "v3.10.0": { title: "廟街煲仔飯", items: [
      "大城市模擬效能優化：重整成熟城市的住宅/商業/工業模擬熱路徑，autosave 改為背景執行，減少大城市長期遊玩的卡頓。",
      "補齊 300 個一直缺少的日文翻譯：立法會系統（十位官員議員的人物設定、政策立場、台詞）、報紙「號外」彈出視窗、證券交易所視窗、颱風信號和天氣狀態列等，之前這些在日文版一直悄悄回退顯示英文，現在加上自動測試防止未來再有遺漏。",
      "修正 `?performance=1` 效能測試模式會自動彈出面板的問題：現在背景會繼續收集數據，但面板要手動點擊才會顯示。",
      "官網加入四種語言支援（中文香港／中文台灣／英文／日文）和全新遊戲指南頁，詳細說明分區密度、經濟稅收、立法會、天氣颱風、特殊建築解鎖和交通系統。",
      "官網截圖全面更新：加入機場運作、街道車流、香城討論區、立法會議案審議、城市改名、以及廟街風格傳統攤販建築群夜景等新截圖。",
    ] },
    "v3.9.0": { title: "好岸居", items: [
      "重新設計住宅和商業建築的出現機率，向香港真實的房屋政策看齊：公共/大眾住宅（L）在中高密度區成為大多數，私人住宅（M）為次要，豪宅／甲級寫字樓（H）變回真正的少數。",
      "新增「低密度規劃永久鎖定」：一塊地一旦劃為低密度住宅，就永遠不能再改為中／高密度，就算拆除重建也一樣，保持低密度區的透天厝／別墅風格。",
      "修正低密度 3x3 莊園後門，加入「大地塊優先掃描」讓 5x5 住宅大廈不會再被周圍小屋搶光空地。",
      "商業區加入兩款全新市集場景模型（傳統市場風格）和一款複合式商場大廈模型，並同步調整商業機率分佈。",
    ] },
    "v3.8.1": { title: "衝上雲霄 穩定性更新", items: [
      "重新校正貨櫃船四個泊位位置（ll/lr/ul/ur）：上一版飛機曲線航線的改動意外一併帶入了一次校準漂移，讓泊位偏離了 v3.7.2 已驗證的位置。",
      "修復「自動更換老化發電廠」設定沒有套用到核能發電廠：發電廠更換成本和顯示名稱查詢一直只有燃煤和太陽能兩種，導致核能電廠壽命到了只會荒廢，不會自動更換。",
    ] },
    "v3.8.0": { title: "衝上雲霄", items: [
      "加入完整機場客機活動：兩間航空公司四方向飛機會沿曲線航線進場、降落、滑行至停機位、離開閘口再起飛，並配上升降音效。",
      "每座機場設六個校準閘口，平均同時有三至四架客機；跑道一次只容許一架飛機使用，旋轉地圖後航線仍然準確貼合機場。",
      "八號風球或以上時暫停新航班和客機離開閘口，已停靠飛機會留在機場；已經升降中的航班會安全完成目前航段。",
      "八號風球或以上時公車和小巴立即停駛並從路面消失，計程車、私家車、貨車和客貨車則繼續行駛。",
      "重新校準貨櫃船泊位，並把飛機／船舶航線改為隨遊戲發佈的固定 metadata；下載網站也換上新圖示。",
    ] },
    "v3.7.2": { title: "貨櫃碼頭！穩定性更新", items: [
      "修復大城市長時間遊玩容易卡頓的問題：住宅的樹木和景觀分數改為每個遊戲月才重新計算一次並共用結果，不再每個 tick 都重新掃描全地圖。",
      "加入畫面當機／無回應自動復原：桌面版一旦偵測到遊戲畫面當機或卡住超過幾秒，會彈出視窗提供重新載入，不用再強制退出。",
      "電力短缺改為透過住宅／商業／工業需求影響城市發展，不再直接觸發地皮衰落或扣減快樂指數。",
      "隱藏效能測試面板加入關閉鈕，不用再重複連按五下才關得到。",
    ] },
    "v3.7.0": { title: "貨櫃碼頭！", items: [
      "加入四方向貨櫃船活動：從畫面外沿海路進港、平行靠泊、交換貨物並鳴笛，再沿航線離港。",
      "依四款碼頭視角逐一校正船舶中心、碼頭中心、離岸距離及圖層關係，停泊位置不再因旋轉方向偏移。",
      "靠泊前最後三格及離港後最初三格保持與岸邊平行，外海航線則依真實連通水域繞行。",
      "加入 route cache、畫面範圍判斷及模型延遲載入，避免重複尋路，離開畫面的碼頭幾乎不增加運算負擔。",
      "加入可選顏色的中英文城市名牌，並擴大建築、樹木及 overlay 的 viewport culling，改善大型城市效能。",
    ] },
    "v3.6.0": { title: "車公靈籤", items: [
      "加入18支香城原創七言籤文，上、中、下籤各六支；每年正月由官員到廟宇代表全城求籤。",
      "籤運會依經濟、股災及疫情輕微調整，並避開最近三年籤號；結果和當時城市狀況會存檔，重新載入不會重抽。",
      "每支籤均有完整籤文、政府解釋、廟祝解釋及三則黑色幽默市民回應，只刊登於討論區與跑馬燈，不會跳出阻擋式號外。",
      "加入「活化工廠大廈」政策，以工業需求、收入及減污染換取工業區附近嚴重交通壓力。",
      "加入須先通過科研發展法的「強國製造20XX」，以及搭建臨時舞台、公帑補助與科研得獎的延遲新聞。",
      "討論區各欄改為最新新聞置頂並最多顯示15則，另加入罕見的中學實驗室爆炸事件。",
    ] },
    "v3.5.0": { title: "夢幻冰淇淋車", items: [
      "天晴或多雲時，冰淇淋車會隨機造訪國小、國中、專科院校、大學，以及真正具觀光吸引力的景點。",
      "冰淇淋車從目前縮放畫面之外駛入，沿道路前往目標，依香港靠左行車方向選擇建築物同一側的人行道路邊。",
      "進站及離站改用向前斜切的曲線，自然靠近路邊、播放冰淇淋車音樂，再匯入車道並駛出目前畫面。",
      "冰淇淋車音樂會與其他城市背景聲混音，並跟隨環境音量、鏡頭距離與遊戲暫停狀態。",
      "存檔會一併記錄地圖中心位置、縮放比例及旋轉方向，重新載入後不再重設視角；舊存檔仍可正常使用。",
      "取消一般人口增加的重複通知，特殊建築解鎖等重要提示不受影響。",
    ] },
    "v3.4.0": { title: "可視交通車流、香港靠左行車與山路橋面更新", items: [
      "加入十九款公車、私家車、小巴、計程車、貨車及客貨車，共七十六張方向貼圖；各車種依實際長短使用獨立城市比例。",
      "車流依可視範圍交通量加權生成，採用香港靠左行車、分離雙向車道、路口曲線轉彎及前後車安全距離。",
      "車輛可連續駛過高地道路、一般斜坡、山脊、橋梁斜坡及橋面；上坡會減速，下坡及旋轉視角時仍保持正確高度與方向。",
      "只有放大至指定比例才會延遲載入車輛，縮小或離開畫面即清除；畫面外道路不建立或渲染車流。",
      "加入地形 viewport culling、分批生成、有限路段轉移、貼圖逐批載入及 depth 批次更新，改善大型城市載入與移動畫面時的效能。",
      "交通只屬即時視覺層，不會修改城市經濟、交通地圖或存檔格式，舊城市可直接載入。",
    ] },
    "v3.3.0": { title: "大型項目、城市新聞與特殊建築解鎖更新", items: [
      "海洋公園改為 8×8 議會項目，依人口、收入、盈餘及經濟指數審批；機場與大型項目保留舊存檔 footprint fallback。",
      "新增機場批准、海洋公園活動及股災討論區圖片與新聞；八號或以上風球會依颱風名稱及天文台台長產生避風與淹水貼文。",
      "名人訪問、演唱會、企鵝保育、教堂及大學新聞改為要求相關建築真正存在。",
      "重新啟用科學園模型並保留兩階段安全載入；改善工業區模型分類及貼圖失敗保護。",
      "修正貨櫃碼頭沙灘海岸、重複岸邊及旋轉方向；海邊格改用索引，避免大型城市旋轉時掃描數千萬次。",
      "加入完整特殊建築解鎖手冊、遊戲內說明及議員風格首次解鎖跑馬燈。",
    ] },
    "v3.2.0": { title: "全新城市天際線、住宅商業分級與「玫瑰園計畫」", items: [
      "住宅及商業模型加入 L／M／H／UH 分級，依地價、景觀、環境、經濟、健康及城市設施形成更有層次的社區與商業核心。",
      "豪宅只會出現在合格的低密度住宅區；世界級摩天大樓只會出現在具備證券交易所、機場與優質營商環境的高密度商業區。",
      "新機場以 12×12「玫瑰園計畫」登場，必須通過人口、財政、經濟條件及議會審批才會解鎖建造。",
      "公共服務、康樂文化設施及地標選單重新分類；大學、社區學院、警察局與消防局模型依順序循環，增加地圖多樣性。",
      "全面更新 isometric anchor、貨櫃碼頭 4×4 模型及 lossless WebP 發佈管線，改善縮放鋸齒、貼圖穩定性與桌面版容量。",
    ] },
    "v3.1.8": { title: "修正語言切換後城市地形高度大面積變形", items: [
      "內建城市地形預覽現在只會回傳預覽資料，不會再將台北等預覽高度寫入正在遊玩的城市。",
      "進入遊戲後切換英文、繁體中文或日文，不再於背景刷新已隱藏的 landing screen 地形預覽。",
      "加入地形預覽隔離回歸測試，確保新遊戲仍正常建立高度，而預覽永遠不會污染正式地圖。",
    ] },
    "v3.1.7": { title: "修正法案結果新聞圖片並清理失效模型載入", items: [
      "法案通過三個月後的效果新聞，已改用封裝內實際存在的 <code>UI/news/*.webp</code> 圖片，彈出視窗顯示前也會統一路徑，修正 DMG 與 EXE 版圖片失效。",
      "移除啟動時對 78 個已刪除 <code>Models/PNG/buildingTiles_*.png</code> 模型的載入要求，以及相關已不再使用的舊放置與目錄程式，避免主控台不斷出現 404。",
      "清除已失效的商業建築 fallback 檔名，並檢查所有啟動與 fallback 模型路徑均有對應檔案。",
    ] },
    "v3.1.3": { title: "修正討論區圖片失效並降低發文頻率", items: [
      "颱風、暴雨、學術排名、過氣歌星、免費冰淇淋、絢麗霓虹香城等 15 張討論區「特別事件」圖片，之前仍然指向遷移前的舊 .png 路徑（實際檔案已改用 .webp），全部顯示失效。已修正所有路徑，連建立貼文時的圖片驗證都改用同一套邏輯，不會再靜靜地擋掉已修正的路徑。",
      "討論區之前每個遊戲月份都會發一則新貼文，即使沒有任何特別事件也照發，時間久了會相當煩擾也拖慢遊戲。現在只有真的發生事情（颱風、新政策、數據觸及門檻、季節性話題等）才會於當月發文；若沒有，最多每 3 個月才補一則閒聊貼文。",
    ] },
    "v3.1.2": { title: "AI 新聞加入三振自動停用機制", items: [
      "當 AI 新聞服務暫時無法使用（例如額度用盡）時，討論區之前會不斷重試每一篇未生成留言的貼文，短時間內連環發出大量請求，連累圖片和音效一起載入不了。",
      "現在跑馬燈新聞、立法會角色新聞和討論區留言共用同一個「三振」機制：連續失敗 3 次就會自動停用整個 AI 新聞服務，並彈出提示，不會再各自無限重試拖慢整個遊戲。",
      "到設定裡重新開啟 AI 新聞會立即進行一次測試生成，同樣受三振機制保護——再連續失敗 3 次會再次自動停用。",
    ] },
    "v3.1.1": { title: "修正討論區新聞圖片失效", items: [
      "v3.1.0 中討論區和新聞彈出視窗的圖片會出現 404——已補回缺少的圖片檔案，全部應能正常顯示。",
    ] },
    "v3.1.0": { title: "立法會議事廳重新設計與香城討論區 AI 留言", items: [
      "法案與條例由一長串清單改為可摺疊分類：財政經濟、公共安全與交通、環境與城市規劃、教育與科研、社會福利、治理改革，另加獨立的特別決議（一次性撥款）分類。",
      "每條法案和決議顯示提案官員或議員的頭像；議事廳畫面改用實景照片做背景，動議進入表決會顯示進度階段。",
      "官員專業意見和議員立場由直排清單改為左右交替的辯論式卡片。",
      "香城討論區留言支援 AI 生成：網友 2-3 則、官員 1-2 則，並修正導致留言一直生成不出來的 token 截斷問題，加入自動避開不穩定模型的備援機制。",
      "音樂音量和新增的都市背景音量會記住上次設定；天氣視覺效果開關維持預設開啟。",
      "頂欄選單重新分類，檢視和設定分流，移除與頂欄重複的速度按鈕。",
    ] },
    "v3.0.0": { title: "立法會議會系統、AI 人物新聞與颱風信號天氣重製", items: [
      "加入立法會：十位有名有姓的官員議員，會依稅率、治安、污染、醫療等真實城市數據做出回應，人物可改名。",
      "AI 新聞新增「人物新聞」：官員議員政策回應、隨時可邀請的人物專訪，以及天文台長的颱風信號公告，AI 版本以外一律有規則版 fallback。",
      "颱風改用西北太平洋真實命名清單（中日文對照），信號依實際模擬風速升跌，呈現 1→3→8→(9→10)→8→3→1 的真實進程；暴雨警告依天文台雨量門檻分黃紅黑三級。",
      "頂部新增天氣狀態列（溫度、濕度、信號徽章），加入落雨粒子和閃電雷聲效果，效果強度隨風雨同步變化；設定可關閉視覺效果，照顧配置較舊的電腦。",
      "立法會建成及證券交易所開市、八號或以上風球會彈出報紙式「號外」頭版。",
      "加入香港式地區環境白噪音：越縮放進商業商住區越能聽到都市白噪音，縮放進純住宅區就轉回寧靜住宅氛圍，天氣還會疊加落雨或颱風音效。",
    ] },
    "v2.0.0": { title: "雲端 AI 分區新聞與城市生活模擬", items: [
      "加入選用 Ollama Cloud AI 新聞，以香港在地編採語氣把城市實況寫成「香城快訊」。",
      "加入天氣、暴雨、颱風階段與市民活動，並連動交通、經濟及新聞內容。",
      "新增玩家命名的香港式雙語分區路牌；每區交通、教育、醫療、污染、地價及人口會影響地區新聞。",
      "API key 不會放入 GitHub 或安裝檔；玩家安裝後自行輸入一次，並由系統安全儲存。",
      "路牌改名、放置、拆除與顯示設定加入安全自動存檔，存檔格式升至第 12 版。",
    ] },
    "v1.1.0": { title: "交通指數系統與資訊地圖整合", items: [
      "加入交通指數模擬及交通 Overlay 地圖。",
      "高擁塞會降低住宅與商業需求，並影響城市發展評分。",
      "市政局將所有 Overlay 整合到資訊地圖視窗。",
    ] },
    "v1.0.5": { title: "Windows 自動更新第一版", items: [
      "加入 Windows 桌面版自動檢查更新、背景下載與重新開啟套用更新流程。",
      "macOS 未簽章前先提供新版提示，並可直接開啟下載頁手動更新。",
      "Release 會一併上傳 Windows updater metadata，包括 <code>latest.yml</code> 與 setup blockmap。",
      "入口網站下載統計改為只計公開下載檔，不計 updater metadata。",
    ] },
    "v1.0.4": { title: "醫療系統、讀檔修正與大型建築顯示改善", items: [
      "加入醫院、健康指標、預期壽命、醫療覆蓋與健康地圖第一版。",
      "加入疫情、醫療容量與衛生政策初版，包括禁菸及學童保健計畫。",
      "修正城市讀檔等待流程，避免入口網站或遊戲場景未就緒時載入失敗。",
      "改用深度區段 fallback 處理地貌、道路、建築與效果排序，改善大型 4x4 建築被地面蓋住的問題。",
    ] },
    "v1.0.3": { title: "桌面安裝包同步", items: [
      "分開提供 macOS Apple Silicon 與 macOS Intel DMG。",
      "同步 Windows 安裝版及免安裝版下載連結。",
      "更新發佈流程文件，方便之後一次性更新遊戲、網站與安裝程式。",
    ] },
  },
  en: {
    "v4.14.0": { title: "Heung Shing Forum", items: [
      "The site's Official News page is now a real Heung Shing Forum: the same 4 category tabs the game uses (City Development / City Buzz / Transport / Off-topic), official news and citizen posts shown together (news badged Official), and a new compose form — no longer just comments, anyone can start a new topic.",
      "Posts and news can now get emoji reactions: 👍 Like / 😂 Laugh / 😡 Angry / ↗ Share / a new 🤡 Clown, synced into the game's forum once the moderator approves them. Reactions draw from their own looser budget, so they never compete with text comments' strict per-minute limit.",
      "Promo 2 – Zero-Speed Spread's community ad board is now a scrolling marquee at the bottom of the panel instead of a list, styled to match the in-game ticker.",
      "The homepage's download count now shows a single total instead of splitting it by version and package type.",
    ] },
    "v4.13.1": { title: "The City Talks Back", items: [
      "Official News now shows up in the Heung Shing Forum as a full post — photo and body text included — instead of turning each comment into its own standalone post. Comments now attach as replies under that article's post, the way a real article and its comments relate.",
      "Fixed synced news comments and forum posts getting the wrong date: they were stamped with the real-world date (e.g. 2026), but every city runs its own simulated calendar (which can reach the year 3000s), so a real-world date sorted as ancient history and sank to the bottom of the forum, out of view. They're now stamped with the city's own simulated date instead.",
    ] },
    "v4.13.0": { title: "The City Talks Back", items: [
      "Official News: the site now has an Official News page where stories go up with a photo and body text, and anyone can comment. Approved comments turn into posts in the game's Heung Shing Forum.",
      "Promo 2 – Zero-Speed Spread (formerly Advertisement Street): anyone can submit a 120-character ad on the site; once the moderator approves it, it joins the in-game news ticker alongside the existing promo lines.",
      "Moderator approval: everything submitted through the website (forum posts, replies, news comments, ads) now needs the moderator to sign in at docs/moderate.html and approve it before it reaches the game, keeping the game free of vulgar or abusive content.",
      "Every nickname field on the site now has a Random button that fills in a name using the same pool the in-game NPCs draw from.",
      "All of the above is fetched over the network and degrades silently when it can't be reached — the game just falls back to its built-in content, with no hang and no error.",
    ] },
    "v4.12.0": { title: "Everything in Its Place", items: [
      "Bridge parapets: every deck and ramp now carries a barrier along both long edges, following the road's slope and meeting cleanly at both ends. Depth sorting bounds whatever stands on the deck - a lamp post, a passing car - between the near and far barrier, so nothing draws in front of the wrong one.",
      "Fixed trees and roadside debris standing on the wrong tile: each one was actually drawn a full tile diagonally in front of the one it belonged to, so removing it meant clicking the tile behind instead, and a house on the next tile could draw over a tree that visually stood in front of it. Both now stand on the centre of their own tile and sort with the buildings, lamps and traffic around them, checked in all four map rotations.",
      "The tree tool used the wild forest's own rule, which keeps trees off anything touching a road or a zoned lot - in a built-up city there was almost nowhere left to plant, with no explanation why. A planted tree may now stand beside a road and on an empty zoned lot (a building growing there still clears it), and the tool shows a green/red placement guide and a toast explaining a refusal.",
      "Redrew the climbing road tiles: the old art rose about 15px per tile against the terrain's actual 13px step, so an uphill road showed a jog and a stray kerb overhang at every seam. All four slope tiles now rise exactly with the terrain.",
      "Signal poles and lamp posts no longer alias when the view is zoomed out (their bakes are now power-of-two canvases Phaser can mipmap), and their on-screen size was recalibrated; the title screen's loading bar no longer flickers after dark; the site's Cantonese driving-side wording is corrected; and rotating the map no longer leaves stray debris floating over the sea.",
    ] },
    "v4.11.0": { title: "Green One Moment, Red the Next", items: [
      "Junction traffic signals: every T and cross junction gets a pole on the tile before it, on the driver's left for Hong Kong's left-hand traffic, facing the oncoming lane. The sequence is Hong Kong's - red, red+amber, green, amber, red - with two stages (8 s green each at a cross, 10 s through / 5 s side at a T) and a green man on the crossing arms that flashes for its last 3 s. Vehicles stop and queue about 8 m short of the junction (buses further back), drive through if amber catches them close, and company buses and the ice-cream van obey too. Lit lamps glow at night, tied to the building-lights toggle.",
      "Street lamps: laid out to Highways Department practice - a 30 m staggered arrangement along straights, one on the outside of every bend, on bridges and slopes too, with junctions left to the signal poles. After dark they swap to baked high-pressure-sodium textures (orange lantern, light cone and a pool on the road), off again at dawn and with the building-lights toggle; all derived from the road map, nothing saved.",
      "Three times the frame rate on Mac: Phaser uploads every render batch with gl.bufferSubData into one reused vertex buffer, and Chromium's ANGLE-over-Metal waits for the GPU to finish reading it each time; uploading into a fresh allocation instead takes Mong Kok from 13 to 45 fps (56 at zoom 2). The once-per-7.5-days simulation pulse is spread over frames instead of one 270 ms stall, the bus company's hourly per-stop walk over every building (a half-second hitch every few seconds) is a grid cache, and the night-texture sync remembers when each building next changes instead of re-resolving the city ten times a second.",
      "Fixes: trees turning a garbled red at night (the object tint overshot its target colour); bus stops drawn at half size in release builds; signal poles drifting after a window resize; building lights always wear their baked art, with Phaser's live glows kept to test mode; and the release pipeline brightening every semi-transparent pixel (pale fringes on edges, orange lamp pools rendering yellow) - every raw buffer now declares straight alpha and all art was re-encoded.",
    ] },
    "v4.10.1": { title: "Dressed to Impress", items: [
      "Fixes the picture appearing to flicker: each drifting cloud is larger than the viewport, yet it was born at its full alpha and removed in a single frame, so under showers a screen-sized pale blob popped in every 0.7 seconds. Every cloud now eases in over the first 18% of its lifespan (six to eight seconds) and out over the last.",
      "The installer no longer carries the website message board's backend source, and the release installer was verified to ship the title-screen showcase city inside the app, keep it out of the load list and leave it impossible to overwrite.",
    ] },
    "v4.10.0": { title: "Dressed to Impress", items: [
      "The title screen now shows a real Heung Shing: Prince Edward is rendered live behind the menu - harbour, container port, traffic on the roads - with day and night following your local time, the weather following the Hong Kong Observatory's current readings (the game's own weather when offline) and a slowly drifting camera. It renders but never simulates: the calendar is frozen, nothing autosaves, no news or notices appear and none of your saves are touched. On a struggling machine it drops the building lights first, then holds the camera, and only then falls back to the static artwork; the Settings menu can switch it off entirely. The static cover shown before it loads is the current night skyline.",
      "Fixes a new city inheriting the previous city's bus stops, vehicles and weather: only the data was reset, never the sprites, so a new city started after the showcase or after Return to Main Menu was littered with bus stops. Loading an autosave that has no manual slot now adopts the one manual save with the same city name, so returning to the menu no longer mints a duplicate city.",
      "The per-frame night-lighting cost is halved: every building in a release build already wears baked night art, yet each was re-examined every frame; the answer is now remembered (Mong Kok, 340k people, holds 30 fps at night, the same as by day). Development launches default to the same baked art as a release.",
      "Website: a sign-in-free message board, the Heung Shing Lennon Wall (Cloudflare backend, one note a minute and five an hour), the player manual folded into the game guide with seventeen gameplay screenshots, and the homepage hero updated to the current night skyline.",
    ] },
    "v4.9.0": { title: "Heung Shing After Dark", items: [
      "A dusk ramp: every model gains a fourth, half-lit baked texture (532 night textures in all). At the swap after sunset the whole city shows street lamps only, then each building climbs lamps to half-lit to fully lit at its own minutes, everyone lit within about two and a half hours; the 23:00 fade steps down the same way. The small hours are darker for real: the night deepens from 23:00, is darkest 00:30-04:30 and eases back before 05:30.",
      "The clock no longer follows the frame rate: it used Phaser's smoothed frame time, which is clamped while the window is unfocused or the frame rate is recovering after a load, so the clock crawled and then \"sped up\" on its own; it now uses real frame time and is an exact 1x at any frame rate, and the topbar buttons follow the speed reset on load. A city loaded after dark pre-fetches its night art and is lit at once; a building built or redeveloped after dark is dressed on the next tick. The ice cream van clocks off from 23:00 to 06:00.",
      "Nineteen new gameplay screenshots with captions in four languages, and the game descriptions on GitHub and on this site rewritten for the current version.",
    ] },
    "v4.8.0": { title: "Time Flies", items: [
      "A displayed day is now a calendar month. The sky and the calendar used to run apart, so one displayed day swept 108-180 calendar days: council bills came due before dusk and a bus completed a month of service by noon. The calendar is now derived from the day/night clock, with real month lengths (February 28 or 29, Gregorian leap years), so a year is exactly 96 real minutes. Council resolutions are priced as months of income (halved, floored at $2,000 a month); bus timetables, maintenance, breakdowns and commuter accrual all run on displayed time; the drone show is every three months at 20:00, thirty minutes each, cancelled under a Signal 8 or higher.",
      "Every building keeps its own hours after dark. Each model gains a third baked texture with the street lamps and no lit windows (133 models, 399 textures). At dusk 70% of homes, 50% of offices and 30% of industry show the evening-peak texture and the rest the deep one, landmarks stay lit; between 23:00 and 01:00 the peak buildings drop to deep one at a time; from 01:00 to 03:00 half the city goes to street lamps only, and early risers switch a few windows back on between 05:30 and 06:00. Hospitals, police, fire and ambulance stations stay fully lit all night.",
    ] },
    "v4.7.0": { title: "Weather in Its Season", items: [
      "Weather now runs on the day/night clock. The calendar advances 108-180 days per displayed day, so calendar-day weather changed 60-180 times between sunrise and sunset. A condition now holds 5-11 displayed hours and persists 40% of the time, so a day sees two or three changes; pausing freezes the weather and the speed buttons scale it with the sky.",
      "Typhoons have a beginning and an end: one every 4-6 displayed days in season, lasting 18-36 displayed hours, with the signal stepping 1-3-8-9-10-8-3-1 and never chattering between 8 and 9. Rainstorm warnings are raised at once and lowered only once the rain has clearly eased, instead of flipping red/amber/red/black within an hour.",
      "Every fixed building lights up after dark: 58 newly calibrated models - services, landmarks, power plants, the container port and bus depot in all orientations, the parks, and the last industrial 3x3s - take baked night models from 70 to 133. Fixes fixed buildings never actually using their baked art; the airport's, nuclear plant's and port's beacons keep blinking through a lightweight beacon-only object.",
    ] },
    "v4.6.3": { title: "A City of Lit Windows", items: [
      "Fixed a redeveloped lot showing the wrong night texture (important - recommended for v4.6.0 through v4.6.2). Both the night texture and the light profile are looked up by the model filename the sprite remembers, and that was written once, when the building first went up; a lot that later redeveloped into a different model kept the old name. Packaged textures in one folder are not a uniform size, so the wrong one drawn at this model's scale rendered the building at double or half size with bare lot showing around it, and street lamps and windows landed where the other model's calibration had them. The saved record is authoritative now, and the swap keeps the sprite in step.",
      "Lit windows take their colour from the building's class - warm for homes, cool white for offices, amber for industry, pale blue for services - instead of one fixed warm tone. Street lamps stay warm sodium.",
      "18 more calibrated night models: the commercial 3x3 roster completed, all four 4x4, the 5x5, and the first industrial 1x1. Baked night models go from 54 to 70, 140 textures in total.",
    ] },
    "v4.6.2": { title: "A City of Lit Windows", items: [
      "14 newly calibrated night models: two 4x4 residentials, three 5x5 residentials, five 1x1 commercials and four 2x2 commercials. Baked night models go from 40 to 54, two textures each (evening and deep night), 108 in total.",
      "Commercial models take their light colour from the class picked during calibration - cool white for offices, warm amber for industrial, pale blue for services - rather than one colour for everything. Street lamps are still baked only when the whole pool fits inside the model's silhouette.",
      "Uncalibrated models keep the live glow path unchanged, and existing city saves stay fully compatible.",
    ] },
    "v4.6.1": { title: "A City of Lit Windows", items: [
      "Fixed buildings resolving to the wrong model (important - recommended for every v4.6.0 user). Baked night textures were being listed as models, so each one appeared three times. Model keys are assigned by discovery order, and every saved building resolves its art by that key: house2x2 went from 17 models to 51 with a night texture at the first slot, so an existing city silently swapped its buildings. Night variants are now filtered out on both the server and the client, with a regression test. Updating restores the correct models.",
    ] },
    "v4.6.0": { title: "A City of Lit Windows", items: [
      "Baked night textures: each of the 40 calibrated building models now ships two night variants (evening and deep night) that swap in automatically after dark. What lights up is the artwork's own windows - the calibrated grid is used as a mask to brighten the real glass rather than to paint rectangles over it, so frames, balconies and glazing all survive, with a soft warm halo around each lit window.",
      "Two tiers of night: deep night darkens facades further and lights far fewer windows, so the city visibly settles down in the small hours. Night itself is now two passes - a ground pass over terrain and roads only, and a thin atmosphere pass over everything - so a lit window is no longer crushed to grey by the night overlay. Overall night darkness is 0.45.",
      "Performance: the same dense night view renders in 12ms instead of 165ms. Street lamps are baked in, but only those whose glow falls entirely inside the model. Uncalibrated models keep the previous live glow, now with a camera-distance LOD. Light calibration data is keyed by filename, so it can no longer drift when model files are added or removed.",
    ] },
    "v4.5.0": { title: "The Light Boat Sails Clear", items: [
      "Building texture optimisation: ordinary building models drop from 1024² to 512², while large landmarks (airport, cultural centre, container port, and the like) stay at 1024². GPU texture memory falls by about 62% (roughly 680 MB to 260 MB) and a city save now loads in about 1.7s instead of 3.5s, with no visible quality loss at normal zoom. The original PNG masters are kept.",
      "Night building-lights toggle: a new 'Night building lights (lit windows / lamps)' entry in the View menu, independent of 'Dynamic lighting'. Turning it off clears the existing glow immediately and costs nothing per frame afterwards - handy for weaker machines or a city of several hundred thousand people. The setting is remembered; available in Traditional Chinese, English and Japanese.",
      "Asset pipeline: the release-asset dimension cap defaults to 512 instead of 1024, with a per-folder landmark exception; the release verifier now records each entry's resolution. Existing saves are fully compatible - no migration needed.",
    ] },
    "v4.4.0": { title: "As the City Lights Come On", items: [
      "Game-clock day/night cycle: sky colour and directional sunlight now follow in-game time (about one minute per day at the 8x display speed), driven by the Hong Kong Observatory's per-day sunrise, sunset and twilight data for 2026. Daylight, dusk, nightfall and deep night each get their own palette. Toggle it from the View menu ('Dynamic lighting').",
      "Night sky, stars and moon: a violet-blue night overlay after dark; stars visible only on clear nights; a moon that changes phase and tracks east to west across the sky.",
      "Time-of-day traffic: ambient traffic rises and falls over the day - heaviest at the morning and evening commute, sparsest late at night.",
      "Night vehicle lamps: all 19 vehicle models now carry two headlamps and two tail lamps that fade in after dark or in heavy rain, each pinned to a position calibrated against its own four-view art so they no longer drift through turns.",
      "Bus interior lights: double-deckers get one fluorescent tube per deck, glowing warm-white through the windows at night.",
      "Performance: the lamps cost nothing in daylight - they're only computed at night or in a rainstorm - and the per-tile light strength is calculated once per frame, not once per vehicle.",
    ] },
    "v4.3.1": { title: "Glimmering Fishing Lights", items: [
      "Fixed the Bus DLC's blocked opening economy: company start-up capital rises from $600 to $6,000, enough to build the required $4,000 depot, create a route, buy two standard double-deckers, and retain $1,440 in working capital.",
      "Existing saves with an already-founded bus company automatically receive the $5,400 difference once on load. Restarting, loading repeatedly, or toggling the DLC cannot apply the correction twice.",
    ] },
    "v4.3.0": { title: "Glimmering Fishing Lights", items: [
      "Added ambient sea-surface flow: open water (ocean/lakes) now shows a moving wave texture that scales through five tiers with wind speed (typhoon signal as a floor) - a gentle ripple in calm weather, building to visibly rough, fast-moving waves at Signal 8 and above. Toggle it independently from the View menu ('Sea surface flow effect').",
      "Added sunset glitter: on clear days, as the sun's cycle nears sunset, the water surface picks up small white-hot, gold-rimmed glints - a few brighter 'hero' sparkles even carry a thin cross-shaped flare - like real sunlight catching ripples.",
      "Added rain ripples: while it's raining, open water periodically shows expanding oval ripples (matching the map's 2:1 isometric proportions), with density scaling up with rain intensity - light under a shower, dense enough to cover the water under a black rainstorm or Signal 8+.",
      "Added a Hong Kong 18-district auto-naming system: bus stops without a custom name are automatically named after their district (with a direction/pier-style suffix), and can still be renamed manually at any time; the minimap's residential overview now labels the real district names too.",
      "Fixed a bug where only the first connected transport depot was ever treated as 'active' - every connected depot now activates correctly. Also fixed a terrain-editing bug where painting a bare-land debris tile's neighbour to water left the abandoned vehicle/container pile stranded on the water instead of disappearing with it.",
    ] },
    "v4.2.0": { title: "Mist-Locked City", items: [
      "Added dynamic lighting: on clear weather, a direction-aware sun tint sweeps across the sky on a real-time cycle decoupled from the compressed in-game calendar - slowly moving from a golden east at sunrise, through neutral overhead light, to an orange sunset in the west. Toggle it anytime from the View menu.",
      "All-weather cloud cover: clouds used to only appear on cloudy days - now they drift across the sky in every weather condition, with density and tint scaling across five tiers (clear is lightest, cloudy is moderate, rain thickens it, and black rainstorm/severe typhoon signals turn it into a dark grey overcast deck). Clouds drift on their own, and fade out smoothly above 1.2x zoom - like descending through the cloud layer - reappearing as you zoom back out.",
      "Traffic performance and visibility range improvements: rewrote the per-frame scan logic behind transport/traffic/vessel visuals to cut computation significantly; ambient traffic now starts appearing at 1x zoom instead of 1.4x; fixed a bug where ambient traffic vanished entirely at high zoom (above 2x).",
      "Speed buttons relabeled: the old 0.15x/0.5x/1x/2x tiers now display as 1x/2x/4x/8x for more intuitive numbers; new and loaded cities still default to the same pacing as before (the tier now labeled 1x).",
      "Removed roughly 53MB of art assets that were never actually referenced by the app (duplicate textures, leftover terrain art, etc.), shrinking install size.",
    ] },
    "v4.1.0": { title: "Green Hills, Clear Waters", items: [
      "Added a derelict bare-land scene: large flat grass regions now grow patches of dirt, and dirt tiles have a 10% chance of spawning an abandoned vehicle or shipping-container pile, sized to match the game's real vehicle models and randomly offset within the tile. Dirt only grows debris - it never grows trees.",
      "Debris now self-heals just like trees: once its tile gets built on, rezoned, or paved over, the debris vanishes automatically on the next simulation tick; the bulldozer tool also clears debris instantly while leaving the dirt patch underneath intact.",
      "Replaced the entire terrain tileset with a new 'natural' art style (grass, beach, river, hills, roads, etc.), and fixed a hill-tile height mismatch that produced a visible staircase seam on slopes.",
      "Restored bus-stop deceleration/acceleration animation, bus stops can now be placed on a single side of the road and buses opportunistically pick up riders at any stop along their route, and fares now show a TTD-style floating \"+$\" popup; redesigned the vehicle tracker window into a collapsed side-tab layout (passengers/condition/route).",
      "Fixed buses visually overlapping ambient traffic; optimized pollution and budget calculations for smoother long-running large cities.",
    ] },
    "v4.0.0": { title: "The Heung Shing Bus Company", items: [
      "New Transport Mode: click the CITY GUIDE header in the top-left to switch between city building and running your own bus company - same map, same clock, but the toolset and interface swap to six independent, draggable windows (Routes, Fleet, Demand, Depot, Finances, Company), each toggled from the topbar.",
      "The bus company keeps its own treasury (founded with $600 in start-up capital), fully separate from city hall's budget. Buses are bought individually at a depot (two classes, $210-$280), each depot holds only 12 vehicles, buses need periodic servicing the longer they run, and three consecutive losing months auto-suspends every route.",
      "Buses now run a real per-vehicle simulation: each bus actually drives its route, picks up and drops off riders, and earns fares credited in real time - no more formula estimates. Bus stops show live waiting-passenger counts, and clicking any moving bus opens its own live tracking window with a real camera following it.",
      "A well-run route delivers four real effects to the surrounding area: eases traffic congestion, raises commercial land value, boosts industrial labour demand, and raises happiness for residents of wealth tier H and below (the wealthiest UH households don't ride the bus).",
      "Fixed the city funds strip's MORE toggle appearing to get stuck open (the button itself shifted position when expanded, so a second click missed it); moved the zoom control to the top-right of the city view instead of crowding the rotate/mute buttons; and raised the ambient traffic vehicle count so busy cities read as busier.",
    ] },
    "v3.14.0": { title: "Space-Time Reset", items: [
      "New clock system: the calendar used to advance roughly every 7.5 days per simulation tick, and now advances one day at a time. Speed presets are now Pause/0.15x/0.5x/1x/2x (was 1x/2x/4x/Pause), always defaulting to 1x on a new or loaded city. 1x keeps the same pacing as before (~20 real seconds/game month, ~4 real minutes/game year); the heavy city simulation (economy, population growth, stock market, etc.) still runs about four times a month, unchanged - only weather (and typhoons) now update daily, so short-lived events like a signal 8 no longer blow through in a single blink.",
      "Slow-motion no longer slows down traffic: picking 0.15x/0.5x used to make every car, ship, and plane on the road crawl to a near-stop along with the clock. Vehicle speed is now floored at normal (1x) regardless of clock speed - only 2x actually speeds vehicles up - so slow-motion only changes how fast time passes, not how traffic looks.",
      "Added a bus-stop roadside decoration: place a shelter with a route sign ($20) on either side of a straight road, with the artwork automatically matching the correct shoulder for each of the four orientations.",
      "Fixed bus-stop depth-sort order: two of the four orientations used to have the shelter roof cover half the bus right as it arrived, only fixing itself once the bus rolled forward. All four orientations now render consistently per the road's own left-hand-traffic rule - the shoulder nearest the driving lane always stays in front of the vehicle, the far shoulder always stays behind it.",
    ] },
    "v3.13.0": { title: "Official Interviews", items: [
      "Added a signature interview quote for all ten officials/councillors: the Chief Executive, Financial Secretary, Police Commissioner, Observatory Director, Head of Leisure and Cultural Services, and the Free-Market, Democratic, Business, Religious, and Tourism councillors - each with their own personality quote, fully translated into Chinese, English, and Japanese.",
      "The \"Profile feature\" button now gives an immediate visual payoff: clicking it swaps the \"core belief\" quote box on the official's profile card to their interview quote (with a color highlight), then reverts after 6 seconds.",
      "Fixed a long-standing bug where the \"Profile feature\" button did nothing: it turned out to only push text into an internal array nothing in the game ever read, so unless AI news happened to be configured, clicking it had zero visible effect - no wonder it always seemed broken.",
    ] },
    "v3.12.0": { title: "Promo 2", items: [
      "Added a residential wealth-district system: the whole map is divided into a 16×16 grid, with each cell classified into Working-Class / Middle-Class / Wealthy / Ultra-Rich based on the average land value of nearby built housing, each tier carrying fixed L/M/H/UH spawn odds (Ultra-Rich is 70% UH / 30% H, Working-Class is 40% M / 60% L, etc.) - replacing the old per-tile quality-band system and the \"UH only at low density\" rule entirely.",
      "Ultra-Rich districts now need more than just land value: a nearby flagship park (Victoria Park-tier), a waterfront edge, or a landmark (temple, church, museum, stadium, etc.) is required to unlock. Conversely, proximity to industry, any power plant, the container port, or the airport caps a district at Middle-Class no matter how high land value climbs - no Wealthy or Ultra-Rich there.",
      "Added building \"massing\" variants (LD/MD/HD - low/medium/high-rise silhouettes), superimposed independently on top of wealth tier: low-density zones lean toward LD/MD art, high-density zones toward MD/HD, with HD guaranteed to never appear in a low-density zone.",
      "Fixed a bug where renaming buildings did nothing in the Electron desktop build: window.prompt() isn't implemented by Electron at all, so it silently did nothing. Switched to the app's own dialog (the same one \"Save As\" already uses), and fixed the same issue in \"Generate New Terrain\" and \"Save Terrain Preset.\"",
      "The news ticker now mixes in 10 nostalgic Heung Shing-style parody ads alongside city news, with roughly 1 in 3 ticker items being an ad.",
    ] },
    "v3.11.0": { title: "The Great Times", items: [
      "Added Monetary Authority government stock trading: unlocked once a Stock Exchange is built and the treasury exceeds $10M, letting you trade any listed stock directly from city funds. Trades move the live price (buying lifts it, selling depresses it), carry a 0.25% fee, and are capped at 15% ownership per stock so no single position can corner the market.",
      "Rebalanced the bull/bear market cycle: bear markets go from a rare, brief blip to a real phase on equal footing with bull and range markets. Company fundamentals now move with the cycle too, and both the HSI and every stock's fair value are bounded long-term so extended play sessions no longer drift toward astronomical numbers.",
      "Government market rescues, large buys, and big trading profits or losses now make front-page news, with two new illustrated news images (market rally / government trading loss).",
      "Rebalanced spawn odds for residential and commercial buildings citywide: fixed a bug where the 2x2 \"villa\" UH mansion models could never appear in low-density zones (they now spawn alongside the existing 3x3 \"estate\" variant), substantially raised how often 4x4/5x5 towers appear, and toned down a handful of oversized 2x2 H-tier towers so they no longer dominate the skyline.",
      "Added low-density estate redevelopment: when every house in a full 3x3 block of low-density village houses independently clears the strict UH mansion bar, the whole block now has a chance to redevelop into a single UH mansion estate in one go.",
    ] },
    "v3.10.0": { title: "Temple Street Claypot Rice", items: [
      "Mature-city simulation performance work: reworked the residential/commercial/industrial simulation hot paths, and moved autosaves to run in the background - both cut stutter in cities that have been played for a long time.",
      "Backfilled 300 long-missing Japanese translations: the entire Legislative Council system (member profiles, policy positions, stat-driven remarks), newspaper \"extra edition\" popups, the Stock Exchange window, typhoon signal news and the weather bar, and a handful of policies/buildings/tools - these had all been silently falling back to English in the Japanese build. Added a regression test so a future gap like this fails CI instead of shipping quietly.",
      "Fixed the performance test mode (`?performance=1`) popping its panel open automatically - it now collects data silently in the background, and the panel only opens on a deliberate click.",
      "Added four-language support to the website (Hong Kong Chinese / Taiwan Chinese / English / Japanese) and a brand-new in-depth Game Guide page covering zoning density, the economy, the Legislative Council, weather/typhoons, special-building unlocks and transport.",
      "Refreshed the website's screenshot gallery with new shots of the airport in action, street traffic, the Heung Shing Forum, a Legislative Council resolution debate, city renaming, and a night-time street market scene in the Temple Street style.",
    ] },
    "v3.9.0": { title: "Good Home", items: [
      "Redesigned residential and commercial building spawn odds to match Hong Kong's real housing policy: public/mass housing (L) becomes the majority in medium/high-density areas, private housing (M) is secondary, and luxury/Grade-A office (H) becomes a genuine minority again.",
      "Added a permanent low-density planning lock: once a plot is zoned low-density residential, it can never be rezoned medium/high density again, even after demolishing and rebuilding - preserving the village-house/villa character of low-density districts.",
      "Fixed the low-density 3x3 estate-lot exception, and added a large-lot priority scan so 5x5 residential towers no longer get starved out by smaller buildings around them.",
      "Added two brand-new street-market scene models (wet-market style) and one mixed-retail tower model to the commercial zone, alongside a matching rebalance of commercial spawn odds.",
    ] },
    "v3.8.1": { title: "Skyfall - Stability Update", items: [
      "Recalibrated all four container-ship berth positions (ll/lr/ul/ur): the previous version's aircraft flight-curve rework had unintentionally bundled in a calibration drift, moving berths away from the verified v3.7.2 positions.",
      "Fixed “Auto-replace aged power plants” not applying to nuclear plants: the replacement-cost and display-name lookups only recognised coal and solar, so nuclear plants were always abandoned at end of life instead of being replaced.",
    ] },
    "v3.8.0": { title: "Skyfall", items: [
      "Added complete airport aircraft activity: two airlines' four-direction aircraft approach, land, taxi to their gate, depart and take off along curved flight paths, with landing/takeoff sound effects.",
      "Each airport has six calibrated gates, averaging three to four concurrent aircraft; the runway allows only one aircraft movement at a time, and routes still align precisely with the airport after rotating the map.",
      "Signal 8 or above suspends new flights and gate departures - parked aircraft stay at the airport, while flights already in motion safely complete their current leg.",
      "Signal 8 or above immediately halts and removes buses/minibuses from the roads, while taxis, cars, trucks and vans keep running.",
      "Recalibrated container-ship berths, and moved aircraft/vessel routes to fixed metadata shipped with the game; the download site also got a new icon.",
    ] },
    "v3.7.2": { title: "Container Port! - Stability Update", items: [
      "Fixed a stutter issue in large cities over long play sessions: residential tree/scenery scores are now recomputed once per game month and shared, instead of rescanning the whole map every tick.",
      "Added crash/hang auto-recovery: if the desktop app detects the game view has crashed or frozen for more than a few seconds, it now offers to reload instead of requiring a force-quit.",
      "Power shortages now affect city growth through residential/commercial/industrial demand instead of directly triggering land decline or cutting happiness.",
      "Added a close button to the hidden performance test panel, instead of needing the five-click gesture again to dismiss it.",
    ] },
    "v3.7.0": { title: "Container Port!", items: [
      "Added four-direction container-ship activity: ships enter port from off-screen along the coastline, berth in parallel, exchange cargo with a horn blast, then depart along their route.",
      "Calibrated ship centre, berth centre, offshore distance and layering individually for all four dock orientations - berthing position no longer drifts with map rotation.",
      "The final three tiles before berthing and first three tiles after departing stay parallel to the shore; open-sea routes follow real connected waterways.",
      "Added a route cache, on-screen visibility checks and deferred model loading to avoid repeated pathfinding, so off-screen ports add almost no computation cost.",
      "Added optional-colour bilingual city nameplates, and expanded viewport culling for buildings, trees and overlays to improve large-city performance.",
    ] },
    "v3.6.0": { title: "Che Kung Fortune Sticks", items: [
      "Added 18 original seven-character Heung Shing fortune sticks - six each of upper, middle and lower fortune; every Lunar New Year an official visits the temple to draw on the city's behalf.",
      "The draw is lightly weighted by economy, stock crashes and epidemics, and avoids the last three years' results; the outcome and city conditions at the time are saved, so reloading won't redraw.",
      "Each stick comes with full fortune text, an official government interpretation, the temple keeper's folksy take, and three deadpan-humour citizen reactions - posted to the forum and ticker only, no blocking pop-up.",
      "Added the “Industrial Building Revitalisation” policy, trading industrial demand, income and reduced pollution for heavier traffic near industrial zones.",
      "Added “National Manufacturing 20XX” (requires the Science Development Act first), plus delayed news about temporary stage rigs, public subsidies and research awards.",
      "Forum sections now pin the latest news and cap at 15 posts each; added a rare secondary-school lab explosion event.",
    ] },
    "v3.5.0": { title: "Dreamy Ice Cream Truck", items: [
      "On clear or cloudy days, ice cream trucks randomly visit primary schools, secondary schools, tertiary colleges, universities, and genuinely tourist-attracting landmarks.",
      "Trucks drive in from outside the current zoomed view, follow roads to their target, and pick the pavement on the same side as the building per Hong Kong's left-hand traffic.",
      "Arrival and departure now use a forward-leaning curve that naturally hugs the kerb, plays the truck's jingle, then merges back into traffic and exits the current view.",
      "Truck jingle audio mixes with other city ambience and follows ambient volume, camera distance and the game's pause state.",
      "Saves now record map centre, zoom level and rotation, so reloading no longer resets the camera; old saves still load fine.",
      "Removed repetitive population-growth toast notifications; important alerts like special-building unlocks are unaffected.",
    ] },
    "v3.4.0": { title: "Visible Traffic, Hong Kong Left-Hand Driving & Hill/Bridge Road Update", items: [
      "Added 19 vehicle models across buses, cars, minibuses, taxis, trucks and vans - 76 direction sprites in total, each sized to its real-world proportions.",
      "Traffic density is weighted by visible-area load, using Hong Kong left-hand driving, separated bidirectional lanes, curved intersection turns and safe following distance.",
      "Vehicles drive continuously across elevated roads, ordinary slopes, ridgelines, bridge ramps and bridge decks - slowing uphill, and keeping correct height/heading downhill or while rotating the camera.",
      "Vehicles only load once zoomed past a threshold, and clear out when zoomed out or off-screen; off-screen roads never build or render traffic.",
      "Added terrain viewport culling, batched spawning, bounded segment transfers, staggered texture loading and batched depth updates to improve performance when loading or panning large cities.",
      "Traffic is a purely visual layer - it doesn't change city economics, the traffic map or the save format, so old cities load unchanged.",
    ] },
    "v3.3.0": { title: "Major Projects, City News & Special-Building Unlock Update", items: [
      "Ocean Park is now an 8×8 council project gated by population, income, surplus and economy index; the airport and other major projects keep a footprint fallback for old saves.",
      "Added forum images/news for airport approval, Ocean Park events and stock crashes; Signal 8 or above now generates storm-shelter and flooding posts named after the typhoon and the Observatory director.",
      "Celebrity visits, concerts, penguin conservation, church and university news now require the relevant building to actually exist.",
      "Re-enabled the Science Park model with a two-stage safe-load path; improved industrial model categorisation and texture-failure protection.",
      "Fixed container-port beach coastlines, duplicate shorelines and rotation direction; shoreline tiles now use an index instead of scanning tens of millions of cells on rotation in large cities.",
      "Added a complete special-building unlock manual, in-game help and a member-styled first-unlock ticker announcement.",
    ] },
    "v3.2.0": { title: "New City Skyline, Residential/Commercial Tiers & the Rose Garden Project", items: [
      "Residential and commercial models gained L/M/H/UH tiers, forming more layered neighbourhoods and commercial cores based on land value, scenery, environment, economy, health and city amenities.",
      "Luxury housing only appears in qualifying low-density residential zones; world-class skyscrapers only appear in high-density commercial zones with a stock exchange, airport and strong business environment.",
      "The new airport arrives as a 12×12 “Rose Garden Project”, unlocked only after passing population, fiscal and economic conditions plus council approval.",
      "Reorganised public service, leisure/culture and landmark menus; university, community college, police and fire station models now cycle in sequence for map variety.",
      "Overhauled isometric anchors, the 4×4 container-port model and the lossless WebP release pipeline, improving zoom aliasing, texture stability and desktop package size.",
    ] },
    "v3.1.8": { title: "Fixed Widespread Terrain-Height Corruption After Switching Language", items: [
      "The built-in city-terrain preview now only returns preview data, instead of writing preview heights (e.g. Taipei's) into the city actually being played.",
      "Switching between English, Traditional Chinese or Japanese after entering the game no longer refreshes the hidden landing-screen terrain preview in the background.",
      "Added a terrain-preview isolation regression test to guarantee new games still build heights normally while the preview can never contaminate the live map.",
    ] },
    "v3.1.7": { title: "Fixed Bill-Outcome News Images and Cleaned Up Dead Model Loads", items: [
      "News about a bill's effect three months after passage now uses the <code>UI/news/*.webp</code> images that actually exist in the package, with a unified path before the popup shows - fixing broken images in the DMG and EXE builds.",
      "Removed the startup load request for 78 deleted <code>Models/PNG/buildingTiles_*.png</code> models and related unused legacy placement/catalogue code, stopping the console from filling with 404s.",
      "Cleaned up dead commercial-building fallback filenames and verified every startup and fallback model path has a matching file.",
    ] },
    "v3.1.3": { title: "Fixed Broken Forum Images and Reduced Post Frequency", items: [
      "15 forum “special event” images (typhoons, rainstorms, academic rankings, has-been pop stars, free ice cream, Heung Shing light shows, etc.) still pointed at the old pre-migration .png paths (files had since moved to .webp) and all showed broken. Fixed every path, and post-creation image validation now uses the same logic, so it can no longer silently block an already-fixed path.",
      "The forum used to post something new every game month even with nothing going on, which grew tedious and slowed the game over time. Now it only posts within the month when something genuinely happened (typhoon, new policy, a stat crossing a threshold, seasonal topics, etc.); otherwise it tops up with a chit-chat post at most every 3 months.",
    ] },
    "v3.1.2": { title: "AI News Gained a Three-Strikes Auto-Disable Safeguard", items: [
      "When the AI news service was temporarily unavailable (e.g. quota exhausted), the forum used to keep retrying every post with no generated comment yet, firing off a burst of requests in a short time and dragging down image/audio loading with it.",
      "Ticker news, Legislative Council character news and forum comments now share one “three strikes” mechanism: three consecutive failures auto-disables the whole AI news service and shows a notice, instead of each retrying forever and slowing down the whole game.",
      "Re-enabling AI news in Settings immediately runs a test generation, also protected by the same three-strikes rule - three more consecutive failures disables it again.",
    ] },
    "v3.1.1": { title: "Fixed Broken Forum News Images", items: [
      "Images in the forum and news popups 404'd in v3.1.0 - the missing image files have been restored and should all display correctly now.",
    ] },
    "v3.1.0": { title: "Redesigned Legislative Chamber and AI-Generated Heung Shing Forum Comments", items: [
      "Bills and ordinances moved from one long list to collapsible categories: Fiscal & Economic, Public Safety & Transport, Environment & Urban Planning, Education & Research, Social Welfare, Governance Reform, plus a separate Special Resolutions (one-off funding) category.",
      "Every bill and resolution now shows the sponsoring official or member's portrait; the chamber view uses a real-photo background, and motions show a progress stage once they reach a vote.",
      "Official expert opinions and member positions moved from a plain vertical list to alternating left/right debate-style cards.",
      "Heung Shing forum comments now support AI generation - 2-3 from netizens, 1-2 from officials - fixing a token-truncation bug that kept comments from generating, with an automatic fallback that avoids unstable models.",
      "Music volume and the new ambient city-noise volume now remember their last setting; the weather visual-effects toggle still defaults to on.",
      "Reorganised the top-bar menu, splitting view and settings, and removed the speed button that duplicated the top bar.",
    ] },
    "v3.0.0": { title: "Legislative Council System, AI Character News & Typhoon Signal Weather Rebuild", items: [
      "Added the Legislative Council: ten named officials and members who react to real city data like tax rate, public safety, pollution and healthcare, and can be renamed.",
      "AI news gained “character news”: policy reactions from officials and members, on-demand character interviews, and typhoon-signal announcements from the Observatory director - every AI feature has a rule-based fallback.",
      "Typhoons now use a real Northwest Pacific naming list (Chinese/Japanese side by side), with signals rising and falling based on simulated wind speed through a realistic 1→3→8→(9→10)→8→3→1 progression; rainstorm warnings follow the Observatory's rainfall thresholds across amber/red/black tiers.",
      "Added a weather status bar up top (temperature, humidity, signal badge), plus rain particles and thunder/lightning effects that scale with wind and rain intensity; visual effects can be disabled in Settings for older hardware.",
      "The Legislative Council opening and the Stock Exchange's first trading day, plus Signal 8 or above, now trigger a newspaper-style “extra edition” front page popup.",
      "Added Hong Kong-style ambient district soundscape: zooming into commercial/mixed-use areas brings up urban white noise, zooming into pure residential areas returns to a quiet residential mood, and weather layers in rain or storm sound effects.",
    ] },
    "v2.0.0": { title: "Cloud AI District News and City Life Simulation", items: [
      "Added optional Ollama Cloud AI news, writing city events as “Heung Shing Express” bulletins in a local Hong Kong editorial voice.",
      "Added weather, rainstorm and typhoon stages plus citizen activity, tied into traffic, the economy and news content.",
      "Added player-named Hong Kong-style bilingual district signage; each district's traffic, education, healthcare, pollution, land value and population now feed local news.",
      "The API key is never bundled with GitHub or the installer - players enter it once after installing, and it's stored securely by the system.",
      "Sign renaming, placement, removal and display settings gained safe autosave; save format bumped to version 12.",
    ] },
    "v1.1.0": { title: "Traffic Index System and Info-Map Integration", items: [
      "Added traffic index simulation and a traffic overlay map.",
      "Heavy congestion now lowers residential and commercial demand and affects the city development score.",
      "The City Hall menu now bundles every overlay into a single info-map window.",
    ] },
    "v1.0.5": { title: "First Windows Auto-Update Release", items: [
      "Added automatic update checks, background downloads and a restart-to-apply flow for the Windows desktop build.",
      "Unsigned macOS builds now show an update notice and can open the download page directly for a manual update.",
      "Releases now also upload Windows updater metadata, including <code>latest.yml</code> and the setup blockmap.",
      "The site's download stats now only count public download files, excluding updater metadata.",
    ] },
    "v1.0.4": { title: "Healthcare System, Load Fix & Better Large-Building Rendering", items: [
      "Added hospitals, a health index, life expectancy, healthcare coverage and a first version of the health overlay map.",
      "Added an initial epidemic system, healthcare capacity and public-health policies, including a smoking ban and a school health programme.",
      "Fixed the city-load wait flow to prevent load failures when the landing site or game scene wasn't ready yet.",
      "Switched to depth-band fallbacks for terrain, roads, buildings and effect ordering, fixing large 4x4 buildings getting hidden under the ground layer.",
    ] },
    "v1.0.3": { title: "Desktop Installer Sync", items: [
      "Now offers separate macOS Apple Silicon and macOS Intel DMGs.",
      "Synced Windows installer and portable download links.",
      "Updated the release process docs to support a single combined update of the game, website and installers going forward.",
    ] },
  },
  ja: {
    "v4.14.0": { title: "香城討論区", items: [
      "サイトの公式ニュースページが本物の香城討論区になりました：ゲームと同じ4つのカテゴリータブ（都市開発／街の話題／交通板／雑談板）、公式ニュースと市民の投稿が一緒に表示され（公式ニュースには「公式」バッジ）、新規投稿フォームを追加——コメントだけでなく、誰でも新しい話題を始められます。",
      "投稿とニュースに絵文字リアクションが付けられるようになりました：👍いいね／😂笑い／😡怒り／↗シェア／新しい🤡ピエロ。モデレーターが承認するとゲームのフォーラムに同期されます。リアクションは独自のゆるい上限を使うため、コメントの厳しい毎分制限とは競合しません。",
      "プロモ2・ゼロ速拡散の市民広告掲示板が、リスト形式からパネル下部のスクロールティッカーに変わり、ゲーム内ティッカーのスタイルに合わせました。",
      "トップページのダウンロード数はバージョンやパッケージ種別で分けず、合計1つだけ表示するようになりました。",
    ] },
    "v4.13.1": { title: "香城のニュースはみんなで作る", items: [
      "公式ニュースが写真と本文つきの投稿として【香城討論区】に表示されるようになりました。以前はコメント1件ごとに別々の投稿になっていましたが、今はその記事の投稿にコメントが返信として紐づきます。",
      "ニュースコメントやフォーラム投稿がゲームに反映されたあと日付がずれる不具合を修正：これまで現実の日付（例：2026年）を使っていましたが、各都市は独自のシミュレーション暦（3000年代まで進むことも）を持つため、現実の日付が古すぎる扱いになりフォーラムの一番下に埋もれて見えなくなっていました。今後は都市自身のシミュレーション年月を使用します。",
    ] },
    "v4.13.0": { title: "香城のニュースはみんなで作る", items: [
      "公式ニュース：サイトに【香城公式ニュース】ページを新設。写真付きの記事を掲載でき、誰でもコメントできます。承認されたコメントはゲーム内【香城討論区】の投稿になります。",
      "プロモ2・ゼロ速拡散（旧・香城広告通り）：サイトから120文字以内の広告を投稿でき、モデレーターの承認後にゲーム内のニュースティッカーへ既存の宣伝文句と一緒に加わります。",
      "モデレーター承認：サイト経由の投稿（フォーラム投稿、返信、ニュースコメント、広告）はすべて、モデレーターが docs/moderate.html でログインして承認するまでゲームに反映されなくなりました。低俗・攻撃的な投稿からゲームを守ります。",
      "サイトのニックネーム欄すべてに「ランダム」ボタンを追加。ゲーム内NPCと同じ名前プールから一つ選んでくれます。",
      "以上はすべてネットワーク経由で取得し、接続できない場合は静かに元のデータへフォールバックします。ゲームが止まったりエラーになったりすることはありません。",
    ] },
    "v4.12.0": { title: "すべてがあるべき場所へ", items: [
      "高架橋の護欄（ガードレール）：すべての橋桁とスロープの両端に、路面の傾斜に沿って護欄が付きました。両端の継ぎ目もぴったり合います。奥行きの並び替えも見直し、橋の上に立つ街灯や通行する車は必ず手前と奥の護欄の間に収まり、順序が入れ替わることはありません。",
      "木や放置ゴミが「隣のマスに立っていた」問題を修正：これまでは実際には自分のマスから斜め手前に1マスずれた位置に描かれており、撤去するには斜め奥のマスをクリックする必要がありました。奥行きの並びも同じズレで計算されていたため、手前のマスの建物が、画面上では手前に立って見える木を覆い隠すことがありました。現在は木もゴミも自分のマスの中心に立ち、建物・街灯・車と同じ基準で前後関係が決まります。4方向すべてで確認済みです。",
      "植樹ボタンは野生の森と同じ規則を使っていたため、道路や区画済みの土地に接するマスには植えられず、市街地ではほとんど植える場所がない上に理由の説明もありませんでした。植えた木は道路脇や空いている区画済みの土地にも植えられるようになり（そこに建物が建てば自動的に撤去されます）、植えられない場所には緑／赤のガイド表示と理由を伝えるトーストが出ます。",
      "坂道タイルを地形に合わせて描き直しました：従来の絵は1マスにつき約15px上昇していましたが、実際の地形は13px刻みのため、上り坂の道路は継ぎ目ごとに段差やずれた縁石が生じていました。4種類の坂道タイルすべてを地形と正確に一致するよう再構成しています。",
      "信号柱と街灯柱は縮小表示でのジャギーが解消されました（Phaserがミップマップを生成できるよう2の累乗のキャンバスで焼き直し）。画面上の大きさも再調整。タイトル画面の「ゲーム素材を読み込み中」バーが日没後に点滅しなくなり、公式サイトの香港の通行方向に関する表記も修正、地図を回転させても瓦礫が海上に取り残されなくなりました。",
    ] },
    "v4.11.0": { title: "青だった信号が、瞬く間に赤に", items: [
      "交差点の信号機：T字・十字路の手前のマスに、香港の左側通行に合わせてドライバーの左側へ自動で柱を立て、対向車に向けます。順序は香港式（赤→赤黄→青→黄→赤）で、十字路は各8秒、T字は本線10秒・支線5秒の2相。歩行者の青は対向が青の間に点き、最後の3秒は点滅。車は交差点の約8m手前で赤信号に停まって並び（バスはさらに後ろ）、黄色で近すぎれば通過。路線バスとアイスクリーム車も従います。夜は点灯レンズが光り、「建物の明かり」設定と連動。",
      "街灯：路政署の街灯設計に従い、直線は30m千鳥配置、カーブは外側に1本、橋やスロープにも設置し、交差点は信号柱に任せます。夜は焼き込んだ高圧ナトリウム灯テクスチャ（橙色のレンズ、光の円錐、路面の光溜まり）に切り替わり、夜明けに消灯、「建物の明かり」と一緒にオフ。すべて道路網から自動生成され、セーブには含まれません。",
      "Macのフレームレートが3倍に：Phaserは描画バッチごとにgl.bufferSubDataで同じ頂点バッファへ書き込み、macOSのANGLE→MetalではGPUの読み終わりを毎回待っていました。新規確保へのアップロードに変えると旺角が13fpsから45fps（ズーム2で56）に。7.5日ごとのシミュレーションパルスは一度の270msから複数フレームに分散、バス会社の毎時・全停留所×全建物走査（数秒ごとの0.5秒停止）はグリッドキャッシュに、夜景テクスチャの0.1秒ごとの全建物再計算は各建物の次の変化時刻を記憶する方式に。",
      "修正：夜に木が奇妙な赤色になる（夜間の物体ティントが目標色を超えていた）、リリース版でバス停が半分の大きさ、ウィンドウサイズ変更後に信号柱がずれる、建物の明かりは常に焼き込みテクスチャを使い、Phaserのライブ光源はテストモード限定に、リリースパイプラインが半透明ピクセルを白く明るくしていた問題（縁の淡いフリンジ、橙色の街灯光溜まりが黄色に）——全rawバッファでストレートアルファを宣言し全アートを再エンコード。",
    ] },
    "v4.10.1": { title: "まずは装いから", items: [
      "画面がちらつく問題を修正：街の上を流れる雲は画面より大きいのに、生まれた瞬間から最終的な不透明度で、消えるときも1フレームで消えていたため、にわか雨の日は0.7秒ごとに画面大の淡い塊が現れていました。各雲は寿命の最初と最後の約18%（6～8秒）でゆっくりフェードイン・アウトするようになりました。",
      "インストーラーにウェブサイト掲示板のバックエンドのソースが含まれなくなりました。またリリース版インストーラーで、タイトル画面のショーケース都市がアプリに同梱され、ロード一覧に現れず、上書きもできないことを確認しました。",
    ] },
    "v4.10.0": { title: "まずは装いから", items: [
      "タイトル画面が本物の香城になりました。メニューの背後で太子をリアルタイム描画——港、コンテナ埠頭、道路を走る車——昼夜はお使いの現地時間に、天気は香港天文台の最新観測に追従（オフライン時はゲーム内の天気）、カメラはゆっくり漂います。描画のみでシミュレーションは行いません：暦は止まり、自動保存も、ニュースや通知も、セーブデータへの影響も一切ありません。負荷が高い環境では建物の灯り→カメラ固定→静止画の順に自動で軽量化し、設定メニューで丸ごと無効化もできます。読み込み前の静止画も最新の夜景スカイラインに。",
      "新しい街に前の街のバス停・車両・天気が残る不具合を修正：データだけリセットされスプライトは残っていたため、ショーケースやメインメニュー復帰後に新しい街を始めるとバス停だらけになっていました。手動スロットに紐づかない自動保存を読み込んだ際、同名の手動保存が1つだけあればそれを引き継ぎ、メニューに戻っても重複した街が増えなくなりました。",
      "夜景ライティングの毎フレームコストを半減：リリース版の建物はすべて焼き込み済みなのに毎フレーム判定し直していたのを記憶するように（人口34万の旺角が夜も昼と同じ30fps）。開発モードもリリースと同じ焼き込みテクスチャが既定に。",
      "ウェブサイト：ログイン不要の掲示板「香城レノンウォール」（Cloudflare バックエンド、1分に1件・1時間に5件）、プレイヤーマニュアルをゲームガイドに統合しゲーム画面17枚を追加、トップページの背景を最新の夜景に更新。",
    ] },
    "v4.9.0": { title: "香城の夜", items: [
      "夕暮れの点灯が段階的に：各モデルに「半点灯」の焼き込みテクスチャを追加（夜景テクスチャ計532枚）。日没後の切り替え時は街全体が街灯だけになり、その後は建物ごとに街灯→半点灯→全点灯へと進み、遅くとも2時間半ほどで出揃います。23時の消灯も同様に段階的に。深夜は本当に暗くなります：23時から深まり、0時半～4時半が最も暗く、5時半前に戻ります。",
      "時計がフレームレートに左右されなくなりました。従来は Phaser の平滑化されたフレーム時間を使っており、ウィンドウが非アクティブの間やロード後にフレームレートが回復するまでは時計が遅れ、その後「勝手に速く」なっていました。現在は実時間を使い、どのフレームレートでも正確な1倍速。ロード時の速度リセットにツールバーのボタンも追従します。夜間にロードした街は夜景テクスチャを先読みして即座に点灯し、夜間に建った・建て替わった建物は次のティックで夜景になります。アイスクリームカーは23時～6時は休業です。",
      "新しいゲーム画面19枚と4言語のキャプション。GitHub と本サイトのゲーム紹介を現行バージョンに合わせて書き直しました。",
    ] },
    "v4.8.0": { title: "光陰矢の如し", items: [
      "表示上の1日が暦の1か月になりました。これまで空と暦は別々に進み、表示上の1日で暦は108～180日も進んでいたため、議会の法案は夕方前に期限を迎え、バスは正午までに1か月分の運行を終えていました。現在は暦を昼夜サイクルから算出し、月の長さは実際どおり（2月は28日または29日、グレゴリオ暦の閏年）で、1年はちょうど実時間96分です。議会の決議は「月収の何か月分」で価格が決まり（係数は半分、月収の下限は$2,000）、バスのダイヤ・整備・故障・乗客の蓄積はすべて表示時間で進みます。ドローンショーは3か月ごとに20時から30分間、シグナル8以上で中止です。",
      "夜の建物がそれぞれの生活リズムを持つようになりました。各モデルに街灯だけで窓の灯りがない3枚目の焼き込みテクスチャを追加（133種・399枚）。日没後は住宅の7割、商業の5割、工業の3割がピークの灯りを見せ、残りは深夜の灯りに、ランドマークは全点灯。23時～1時にピークの建物が1棟ずつ深夜の灯りへ落ち、1時～3時に街の半分が街灯だけになり、5時半～6時には早起きの窓が少しずつ灯ります。病院・警察・消防・救急は一晩中点灯したままです。",
    ] },
    "v4.7.0": { title: "風雨に時あり", items: [
      "天気が昼夜サイクルに合わせて動くようになりました。暦は表示上の1日に108～180日進むため、暦基準の天気は日の出から日没までに60～180回も変わっていました。現在は各天気が表示時間で5～11時間続き、4割の確率で継続するので、1日に2～3回の変化に。ポーズ中は天気も止まり、速度ボタンで空と一緒に早送りされます。",
      "台風に始まりと終わりができました。シーズン中は表示上4～6日に1つ、18～36時間続き、シグナルは1→3→8→9→10→8→3→1と段階的に上下し、8号と9号の間で揺れません。豪雨警報は即時に引き上げ、雨が明らかに弱まってから引き下げるため、1時間の中で赤・黄・赤・黒と揺れることはなくなりました。",
      "すべての固定建物が夜に灯ります。新たに校正した58種（公共施設、ランドマーク、発電所、コンテナ港とバス車庫の全方向、公園、残りの工業3x3）で、焼き込み済み夜景モデルは70種から133種に。固定建物が焼き込み済みの絵を一度も使っていなかった不具合を修正し、空港・原発・港の点滅灯は軽量な専用オブジェクトで維持されます。",
    ] },
    "v4.6.3": { title: "万家の灯", items: [
      "再開発された区画が誤った夜景テクスチャを表示する不具合を修正（重要。v4.6.0～v4.6.2 の方は更新を推奨）：夜景テクスチャも照明プロファイルも、スプライトが覚えているモデルのファイル名で参照します。この名前は建物が最初に建った時に一度だけ書き込まれるため、区画が別のモデルへ再開発されても更新されず、夜になると別の建物のテクスチャを掴んでいました。同じフォルダでもテクスチャの寸法は一定ではないので、建物が倍または半分の大きさで描かれ、区画の余った部分に地面が見えていました。街灯や窓も別の建物の校正位置に出ていました。現在はセーブ側の記録を正とし、再開発時にスプライト側も同期します。",
      "窓の灯りの色が建物の区分に従うようになりました。住宅は暖色、オフィスは冷たい白、工業は琥珀、サービス施設は淡い青。街灯は従来どおり暖かいナトリウム色です。",
      "校正済みの夜景モデルを18種追加（商業3x3を全て、4x4を4種、5x5、そして最初の工業1x1）。焼き込み済みは54種から70種、テクスチャは計140枚になりました。",
    ] },
    "v4.6.2": { title: "万家の灯", items: [
      "新たに校正した夜景モデルを14種追加：住宅4x4が2種、住宅5x5が3種、商業1x1が5種、商業2x2が4種。焼き込み済みの夜景モデルは40種から54種になり、各2枚（通常の夜／深夜）で計108枚のテクスチャになりました。",
      "商業モデルの灯りの色は校正時に選んだ区分に従います——オフィスは冷たい白、工業は暖かい琥珀、サービス施設は淡い青。街灯は従来どおり、光の輪がモデルの輪郭に完全に収まるものだけを焼き込みます。",
      "未校正のモデルは従来のリアルタイム光暈のまま動作は変わりません。既存の都市セーブとの互換性も保たれます。",
    ] },
    "v4.6.1": { title: "万家の灯", items: [
      "建物モデルの取り違えを修正（重要。v4.6.0 をお使いの方はすべて更新を推奨）：夜景テクスチャがモデルとして一覧に載ってしまい、各モデルが3回重複していました。モデルのキーは一覧順で割り当てられ、セーブ内の各建物はそのキーで自分の絵を参照するため、house2x2 は17個から51個に増え、先頭が夜景テクスチャになり、既存の都市の建物が知らないうちに別のモデルへ入れ替わっていました。サーバー側とクライアント側の両方で派生した夜景テクスチャを除外し、回帰テストを追加。更新すると正しいモデルに戻ります。",
    ] },
    "v4.6.0": { title: "万家の灯", items: [
      "夜景テクスチャ：校正済みの建物モデル40種それぞれに2枚の夜景テクスチャ（通常の夜／深夜）を焼き込み、日没後に自動で切り替わります。光るのは元の絵にある窓そのもの——校正グリッドをマスクとして実際のガラスを明るくする方式なので、窓枠・バルコニー・ガラスの質感がすべて残り、窓の周りには柔らかな暖色のハローが付きます。",
      "二段階の夜：深夜には外壁がさらに暗くなり、点灯した窓の数もぐっと減るため、街が夜更けとともに静まっていく様子が見えます。夜の暗さ自体も、地形と道路だけを覆う地面パスと、全体を薄く覆う大気パスの二層に分割。点灯した窓が夜のオーバーレイで灰色に潰れなくなりました。全体の夜の暗さは 0.45。",
      "パフォーマンス：同じ高密度の夜景で render が 165ms から 12ms に短縮。街灯もテクスチャに焼き込みますが、光が完全にモデル内に収まるものだけです。未校正のモデルは従来のリアルタイム光を維持し、カメラ距離順の LOD を追加。照明校正データはファイル名をキーにしたため、モデルファイルの追加・削除でずれることがなくなりました。",
    ] },
    "v4.5.0": { title: "軽舟すでに過ぐ", items: [
      "建物テクスチャの最適化：通常の建物モデルを 1024² から 512² に縮小し、空港・文化センター・コンテナターミナルなどの大型ランドマークは 1024² のまま維持。GPU テクスチャメモリが約 62%（約 680 MB → 260 MB）減り、都市セーブの読み込みが約 3.5 秒から約 1.7 秒に短縮。通常のズームでは画質の違いは分からない。元の PNG マスターは保持。",
      "夜間の建物ライトのトグル：View メニューに「夜間の建物の明かり（点灯した窓／街灯）」を追加。「動的ライティング」とは独立。オフにすると既存の光がすぐに消え、以降はフレームごとのコストがゼロ。非力なマシンや人口数十万の巨大都市に有効。設定は記憶され、繁体字中国語・英語・日本語に対応。",
      "アセットパイプライン：リリースアセットの寸法上限を既定で 1024 から 512 に変更し、フォルダ単位のランドマーク例外を追加。リリース検証ツールは各エントリの解像度を記録するように。既存のセーブは完全互換で移行は不要。",
    ] },
    "v4.4.0": { title: "街の灯がともる頃", items: [
      "ゲーム内時計による昼夜サイクル：空の色と指向性のある太陽光が、ゲーム内時間（8x 表示速度で約1分＝1日）に連動するようになった。香港天文台の 2026 年の日ごとの日の出・日の入り・薄明データに基づき、昼・夕暮れ・日没・深夜でそれぞれ色合いが変わる。View メニューから「動的ライティング」としてオン・オフ可能。",
      "夜空・星・月：日没後は青紫色の夜のオーバーレイがかかり、晴れた夜にだけ星が見える。月は月相に応じて満ち欠けし、空を東から西へ移動する。",
      "時間帯別の交通量：環境車両の交通量が一日の時間帯に応じて増減する——朝夕の通勤時間帯が最も多く、深夜は最もまばら。",
      "夜間の車両ライト：19 車種すべてに2つのヘッドライトと2つのテールライトが付き、日没後や大雨のときに徐々に点灯する。各車種の4方向スプライトに合わせて個別に位置を調整済みで、カーブでもずれなくなった。",
      "バスの車内灯：2階建てバスの上下各デッキに蛍光灯が1本ずつ入り、夜間に窓越しに暖かい白色光を放つ。",
      "パフォーマンス：ライトは夜間や雨天時のみ計算され、日中のコストはゼロ。タイルごとの光量は車両ごとではなく1フレームに1回だけ計算する。",
    ] },
    "v4.3.1": { title: "漁火きらめく", items: [
      "バス DLC で開業できなかった資金バランスを修正：創業資金を $600 から $6,000 に増額し、必須の $4,000 の車庫を建設し、路線を作成して標準型2階建てバスを2台購入しても、$1,440 の運転資金が残るようになった。",
      "既にバス会社を設立済みの旧バージョンのセーブには、読み込み時に $5,400 の差額を1度だけ自動支給。再起動、繰り返し読み込み、DLC の切り替えで重複計上されることはない。",
    ] },
    "v4.3.0": { title: "漁火きらめく", items: [
      "海面の流動エフェクトを追加：外洋・湖などの開けた水域に動く波のテクスチャが加わり、風速（台風シグナルを下限として）に応じて5段階で変化する——凪の日は穏やかに揺れ、8号シグナル以上では明らかに荒く速い波になる。View メニューから「海面流動効果」として個別にオン・オフ可能。",
      "夕焼けの波光きらめきを追加：晴天時、太陽の周期が夕暮れに近づくと、水面に白熱した金縁の輝きが浮かぶ。特に明るい「主役」級の輝きには十字のフレアも付き、本物の夕日が波間で反射しているように見える。",
      "雨の波紋を追加：雨天時、開けた水域に楕円形（地図の 2:1 アイソメトリック比率に合わせた形）の波紋が時折広がり、雨脚が強いほど密度が増す——小雨ではまばら、大雨警報（黒）／8号シグナル以上では水面いっぱいに波紋が広がる。",
      "香港18区にちなんだ自動命名システムを追加：名前を設定していないバス停には、所属する地区名に方角や「埠頭」などの接尾語を付けた名前が自動的に付き、いつでも手動で改名もできる。ミニマップの「住宅」概観にも実際の地区名が表示されるようになった。",
      "接続済みの運輸車庫が最初の1つしか「稼働」扱いにならなかったバグを修正——接続済みの車庫はすべて正しく稼働するようになった。あわせて、荒れ地の廃棄物タイルの隣接マスを水に変更した際、放置車両／コンテナの山が水面に取り残されたまま消えなかった地形編集のバグも修正。",
    ] },
    "v4.2.0": { title: "霧鎖の街", items: [
      "ダイナミックライティングを追加：晴天時に方向性のある太陽光が、圧縮されたゲーム内暦から独立したリアルタイムの周期でゆっくり移動——東からの黄金色の朝日、頭上の中立光、西への橙色の夕日へと変化する。View メニューからいつでもオン・オフ可能。",
      "全天候の雲システム：これまで曇りの日にしか出なかった雲が、すべての天候で流れるように。密度と色は5段階で天候に応じて変化——晴天が最も薄く、曇りは中程度、雨で厚くなり、大雨警報（黒）や強い台風シグナル以上ではダークグレーの分厚い雲に。雲は自ら漂い、ズーム1.2倍を超えると雲層を抜けるように徐々に消え、ズームアウトすると再び現れる。",
      "交通のパフォーマンスと表示範囲を改善：交通機関／一般車両／船舶ビジュアルの毎フレームスキャン処理を書き直し、計算量を大幅削減。一般交通は 1.4倍ではなく 1倍ズームから表示されるように。高倍率ズーム（2倍以上）で一般交通が完全に消えてしまうバグを修正。",
      "速度ボタンの表示を変更：従来の 0.15x／0.5x／1x／2x を 1x／2x／4x／8x として表示、より直感的な数値に。新規／読み込み時のデフォルト速度は従来どおり（現在「1x」と表示される速度）。",
      "実際には使用されていなかった約53MBのアートアセット（重複テクスチャ、旧地形素材の残骸など）を削除し、インストールサイズを削減。",
    ] },
    "v4.1.0": { title: "青山緑水", items: [
      "新しい荒れ地の廃棄物シーン：広い平らな草地に土のパッチ（dirt）が自然に発生し、土タイルには10%の確率で放棄車両やコンテナの山が出現。サイズはゲーム内の実際の車両モデルに合わせて調整され、タイル内でランダムにずれて配置される。土タイルは廃棄物のみで、木は生えない。",
      "廃棄物は樹木と同じく自己修復する：その土地に建物が建つ、ゾーニングされる、道路が敷かれると、次のシミュレーションで自動的に消える。ブルドーザーで即座に撤去することもでき、その際は下の土パッチはそのまま残る。",
      "地形テクスチャ一式を新しい「ナチュラル系」スタイルに刷新（草地、ビーチ、川、丘、道路など）。丘タイルの高さが道路の高さと合わずに階段状の継ぎ目が見えていた問題も修正。",
      "バス停の減速・加速アニメーションを復活、バス停を道路の片側だけに設置できるようになり、経路上の未登録バス停でも乗客を拾うように。運賃獲得時にTTD風の浮遊「+$」表示が追加。車両追跡ウィンドウは側面アイコンタブ（乗客／状態／路線）にまとめて再設計。",
      "バスと背景交通が視覚的に重なる問題を修正。汚染と財政予算の計算を最適化し、大都市を長時間プレイしてもスムーズに。",
    ] },
    "v4.0.0": { title: "香城バス会社", items: [
      "新機能「運輸経営」モード：左上の「建設ガイド CITY GUIDE」ヘッダーをクリックすると、都市建設と自分のバス会社経営を切り替えられます——同じマップ、同じ時計のまま、ツールとUIが路線・車両・需要・車庫・財務・会社の6つの独立したドラッグ可能なウィンドウに切り替わり、それぞれ上部ツールバーから開閉できます。",
      "バス会社は独自の資金（設立時に創業資金$600を獲得）を持ち、市の予算とは完全に分離。バスは車庫で1台ずつ購入し（2車種、$210～$280）、各車庫の収容台数は12台まで、走行を重ねると定期整備が必要になり、3ヶ月連続赤字になると全路線が自動的に運休します。",
      "バスは実際に1台ずつシミュレーションされるようになりました：各車両が実際の路線を走行し、乗客を乗降させ、運賃はリアルタイムで計上されます——もう数式による推定ではありません。バス停には待機乗客数がリアルタイムで表示され、運行中のバスをクリックすると実際のカメラが追跡する専用ウィンドウが開きます。",
      "路線をうまく運営すると、周辺地域に4つの実際の効果をもたらします：渋滞緩和、商業地区の地価上昇、工業地区の労働需要増加、そして最富裕層（UH）を除く H 級以下の住民の幸福度上昇。",
      "市の資金バーの「もっと見る」ボタンを展開後に閉じられないように見える問題を修正（展開時にボタン自体の位置がずれ、2回目のクリックが外れていました）。ズームコントロールを回転／ミュートボタンと重ならないよう都市画面の右上に移動。背景交通の車両数を増やし、大都市がより賑やかに見えるようにしました。",
    ] },
    "v3.14.0": { title: "時空重置", items: [
      "新しいクロックシステム：暦は従来「シミュレーション1ティックにつき約7.5日」進んでいましたが、1日ずつ進むようになりました。速度プリセットは 一時停止／0.15x／0.5x／1x／2x（従来は1x/2x/4x/一時停止）となり、新規都市・ロード時は常に1xから開始します。1xは従来と同じペース（ゲーム内1ヶ月が現実約20秒、1年が現実約4分）を維持し、重い都市シミュレーション（経済、人口増加、株式市場など）は従来通り月4回のまま変わりません。天気（台風含む）のみ毎日更新されるようになり、シグナル8のような短時間のイベントも一瞬で終わらず見えるようになりました。",
      "スロー速度でも車両は遅くならない：以前は0.15x/0.5xを選ぶと道路上の車・船・飛行機までクロックと一緒にほぼ停止するほど遅くなっていましたが、車両の速度は常に通常（1x）を下回らなくなりました（2xのときだけ実際に速くなります）。スロー速度は時間の経過速度だけに影響し、交通の見た目には影響しません。",
      "バス停の道端装飾を追加：直線道路の両側にシェルターと路線標識（$20）を設置可能。4方向それぞれ正しい路肩に自動で合わせて表示されます。",
      "バス停の重なり順を修正：4方向のうち2方向でバスが到着した瞬間に屋根がバスの前半分を覆い、少し前進してから元に戻るという不具合を修正。現在は4方向すべてで、走行車線側の路肩にあるバス停は常に手前に、反対側の路肩は常に奥に安定して表示されます。",
    ] },
    "v3.13.0": { title: "官員專訪", items: [
      "行政長官・財政司司長・警察署長・天文台長・レジャー文化サービス局長、そして自由市場派・民主派・ビジネス界・宗教界・観光業界の議員、計10名の官僚・議員に専属のインタビュー名言を追加。それぞれ個性豊かな一言を、中国語・英語・日本語の3言語で用意しました。",
      "「Profile feature」ボタンが即座に反映されるように改善：クリックすると、プロフィールカードの「信条」欄が本人のインタビュー名言に切り替わり（色付きハイライト表示）、6秒後に元の表示へ自動的に戻ります。",
      "「Profile feature」ボタンを押しても何も起きなかった長年のバグを修正：実際にはゲーム内のどこからも参照されない内部配列にテキストを追加するだけの処理で、AIニュースを設定していない限り見た目上の変化が一切なかったことが判明しました。道理でずっと壊れているように見えたわけです。",
    ] },
    "v3.12.0": { title: "宣傳2", items: [
      "「住宅富裕層エリア」制度を追加：マップ全体を16×16のグリッドに分割し、近隣の既存住宅の平均地価から庶民街／中流住宅街／富裕層住宅街／超富裕層エリアの4段階に分類。各段階に固定のL/M/H/UH出現確率を設定（超富裕層エリアはUH70%／H30%、庶民街はM40%／L60%など）、旧来のタイル単位の品質バンド制度と「UHは低密度限定」ルールを完全に置き換えました。",
      "超富裕層エリアにはさらに条件を追加：地価に加えて、近くに大型フラッグシップ公園（ビクトリアパーク級）、海岸線、またはランドマーク（寺院・教会・博物館・スタジアムなど）が必要に。逆に近くに工業施設・発電所・コンテナ港・空港があると、地価がどれだけ高くても中流住宅街止まりとなり、富裕層/超富裕層エリアにはなりません。",
      "建築の「階層タイプ」（LD/MD/HD 低層/中層/高層）を追加。富裕層エリアとは独立して重ね合わせで決定：低密度区画はLD/MD系のデザインを中心に、高密度区画はMD/HD系を中心に出現し、HDは低密度区画では絶対に出現しません。",
      "Electronデスクトップ版で建物の名前変更が反応しなかったバグを修正：window.prompt()はElectronで実装されておらず、押しても何も起きませんでした。「名前を付けて保存」と同じアプリ内蔵ダイアログに切り替え、「新しい地形を生成」と「地形プリセットを保存」でも同じ問題を修正。",
      "ニュース跑馬燈（テロップ）に懐かしい香城風パロディ広告10種類を追加。都市ニュースと交互に表示され、およそ3件に1件が広告になります。",
    ] },
    "v3.11.0": { title: "大時代", items: [
      "「金融管理局」による政府の株式取引を追加：証券取引所を建設し、国庫が1,000万ドルを超えると解禁。市の資金で上場銘柄を直接売買でき、取引は現在値を動かし（買いは上昇、売りは下落）、手数料0.25%、1銘柄あたり保有比率上限15%で一社独占はできません。",
      "強気・弱気相場サイクルを再調整：弱気相場はこれまでの稀な一時的な下落から、強気・レンジ相場と並ぶ本格的な局面へ。上場企業のファンダメンタルズも相場サイクルに連動するようになり、恒生指数と各銘柄の適正価値には長期的な上限・下限を設定、長時間プレイしても天文学的な数値まで発散しなくなりました。",
      "政府による市場介入、大口買い、大きな利益・損失はすべて号外の一面ニュースに。新しいニュース挿絵2枚（株式市場好調／政府の取引損失）も追加。",
      "住宅・商業建築の出現確率を全面的に見直し：UH高級住宅の2x2「ヴィラ」モデルが低密度住宅区で永久に出現しないバグを修正（既存の3x3「邸宅」モデルと並んで出現するように）、4x4／5x5タワーの出現率を大幅に引き上げ、一部の過大な2x2 Hランクタワーの出現率を下げてスカイラインを占有しないよう調整。",
      "「低密度住宅地の再開発」を追加：低密度村家からなる3x3区画の全建物が個別にUH高級住宅の厳しい基準（地価・景観・環境・健康・経済指数）を満たすと、その区画全体が一度にUH高級住宅の邸宅へ再開発されるチャンスが発生。",
    ] },
    "v3.10.0": { title: "廟街の土鍋ご飯", items: [
      "大都市シミュレーションのパフォーマンス改善：成熟した都市の住宅・商業・工業シミュレーションのホットパスを再構築し、オートセーブをバックグラウンド実行に変更。長時間プレイした大都市でのカクつきを軽減しました。",
      "長らく欠落していた日本語訳300件を補完：立法会システム全体（議員のプロフィール、政策スタンス、都市統計に応じたコメント）、新聞の「号外」ポップアップ、証券取引所ウィンドウ、台風シグナルのニュース、天気バー、いくつかの政策・建築・ツールなど——これらは日本語版で静かに英語表示にフォールバックしていました。今後同様の欠落があればCIで検出できるよう回帰テストも追加しました。",
      "パフォーマンステストモード（`?performance=1`）でパネルが自動的に開いてしまう問題を修正：現在はバックグラウンドで静かにデータ収集を行い、パネルは意図的にクリックした場合のみ開きます。",
      "公式サイトに4言語対応（中文香港／中文台灣／英語／日本語）と、区画密度・経済・立法会・天気/台風・特殊建築の解禁・交通システムを詳しく解説する新しい「ゲームガイド」ページを追加しました。",
      "公式サイトのスクリーンショットギャラリーを刷新：空港の稼働、街の交通、香城フォーラム、立法会の決議審議、都市の改名、廟街風の夜の市場の街並みなど新しい画像を追加しました。",
    ] },
    "v3.9.0": { title: "好岸居", items: [
      "住宅・商業建築の出現確率を香港の実際の住宅政策に合わせて再設計。公共・大衆住宅（L）は中高密度エリアで多数派となり、民間住宅（M）は次点、高級住宅／甲級オフィス（H）は本来の少数派に戻りました。",
      "「低密度計画の永久ロック」を追加：一度低密度住宅として区画指定された土地は、取り壊して建て直しても二度と中密度・高密度に変更できなくなり、低密度エリアの村家・別荘らしい街並みを維持します。",
      "低密度3x3邸宅の抜け道を修正し、「大区画優先スキャン」を追加。5x5住宅タワーが周囲の小さな建物に区画を奪われなくなりました。",
      "商業地区に新しい市場シーンモデル2種（下町の市場風）と複合商業タワーモデル1種を追加し、商業出現確率も同時に調整しました。",
    ] },
    "v3.8.1": { title: "衝上雲霄（フライハイ） 安定性アップデート", items: [
      "コンテナ船の4つの係留位置（ll/lr/ul/ur）を再校正：前バージョンの航空機曲線飛行経路の改修で意図せず係留位置の校正がずれてしまい、v3.7.2で検証済みの位置から外れていた問題を修正。",
      "「老朽発電所の自動更新」設定が原子力発電所に適用されない不具合を修正：更新コストと表示名の判定が石炭と太陽光の2種類にしか対応しておらず、原子力発電所は寿命が尽きても放棄されるだけで自動更新されませんでした。",
    ] },
    "v3.8.0": { title: "衝上雲霄（フライハイ）", items: [
      "空港の航空機アクティビティを本格実装：2社の航空会社の4方向機が曲線飛行経路で進入・着陸・タキシング・搭乗ゲート離脱・離陸まで行い、離着陸の効果音も追加。",
      "各空港に校正済みゲートを6つ設置。平均で同時に3〜4機が稼働し、滑走路は同時に1機のみ使用可能。マップを回転させても経路は空港に正確に一致します。",
      "シグナル8号以上で新規便とゲート出発を停止。駐機中の機体は空港に留まり、既に飛行中の便は現在の区間を安全に完了します。",
      "シグナル8号以上でバス・ミニバスは即座に運行停止し道路から消え、タクシー・自家用車・トラック・バンは運行を継続します。",
      "コンテナ船の係留位置を再校正し、航空機・船舶の経路をゲーム配布物に含まれる固定メタデータ方式に変更。ダウンロードサイトのアイコンも刷新しました。",
    ] },
    "v3.7.2": { title: "コンテナ港！安定性アップデート", items: [
      "大都市を長時間プレイするとカクつく問題を修正：住宅の樹木・景観スコアをゲーム月ごとに1回だけ再計算して共有する方式に変更し、毎ティック全マップを再スキャンしないようにしました。",
      "画面のクラッシュ・応答なしからの自動復旧を追加：デスクトップ版がゲーム画面のクラッシュや数秒以上のフリーズを検知すると、強制終了せずに再読み込みを提案するようになりました。",
      "電力不足は住宅／商業／工業の需要を通じて都市発展に影響するようになり、土地の衰退や幸福度の直接的な低下を引き起こさなくなりました。",
      "非表示のパフォーマンステストパネルに閉じるボタンを追加し、5回連続クリックせずに閉じられるようになりました。",
    ] },
    "v3.7.0": { title: "コンテナ港！", items: [
      "4方向のコンテナ船アクティビティを追加：画面外から海路で入港し、平行に係留、貨物を交換して汽笛を鳴らし、航路に沿って出港します。",
      "4種類の埠頭アングルごとに船体中心・埠頭中心・沖合距離・レイヤー関係を個別に校正し、マップ回転による係留位置のズレをなくしました。",
      "係留前の最後の3マスと出港後最初の3マスは岸と平行を保ち、外洋航路は実際に繋がった水域に沿って迂回します。",
      "経路キャッシュ・画面内判定・モデル遅延読み込みを追加し、重複した経路探索を回避。画面外の港はほぼ計算負荷を増やしません。",
      "色を選べる中英バイリンガル都市ネームプレートを追加し、建物・樹木・オーバーレイのビューポートカリングを拡大して大都市のパフォーマンスを改善しました。",
    ] },
    "v3.6.0": { title: "車公おみくじ", items: [
      "香城オリジナルの七言おみくじ18本を追加（大吉・中吉・凶各6本）。毎年旧正月に官僚が代表して寺院でおみくじを引きます。",
      "結果は経済・株価暴落・疫病の状況で軽く重み付けされ、直近3年の番号を避けます。結果と当時の都市状況はセーブデータに記録され、再読み込みで引き直されません。",
      "各おみくじには本文・政府の解説・寺男による解説・市民のシニカルな反応3件が付属し、フォーラムとティッカーのみに掲載され、ブロッキングな号外は表示されません。",
      "「工業ビル再活性化」政策を追加。工業需要・収入・汚染削減と引き換えに工業地区周辺の深刻な交通渋滞を招きます。",
      "科学研究発展法の可決が前提の「強国製造20XX」、および仮設ステージ設営・公的補助・研究受賞に関する遅延ニュースを追加。",
      "フォーラムの各カテゴリで最新ニュースが上部に固定され、表示は最大15件に。まれに発生する中学校実験室爆発イベントも追加しました。",
    ] },
    "v3.5.0": { title: "夢のアイスクリームカー", items: [
      "晴れまたは曇りの日、アイスクリームカーが小学校・中学校・専門学校・大学、および実際に観光客を集める観光地をランダムに巡回します。",
      "現在ズーム表示されている画面の外から進入し、道路沿いに目的地へ向かい、香港式の左側通行に従って建物と同じ側の歩道端を選びます。",
      "進入・退出時は前方に傾いたカーブで自然に路肩へ寄り、アイスクリームカーの音楽を再生してから車線に合流し、現在の画面外へ出て行きます。",
      "アイスクリームカーの音楽は他の都市環境音とミックスされ、環境音量・カメラ距離・ゲームの一時停止状態に追従します。",
      "セーブデータにマップ中心位置・ズーム倍率・回転方向が記録され、再読み込み後に視点がリセットされなくなりました。旧セーブデータも引き続き使用可能です。",
      "通常の人口増加に関する重複通知を廃止。特殊建築の解禁など重要な通知は引き続き表示されます。",
    ] },
    "v3.4.0": { title: "可視化された交通・香港式左側通行・山道と橋のアップデート", items: [
      "バス・自家用車・ミニバス・タクシー・トラック・バンなど19種類、方向別スプライト計76枚を追加。各車種は実際の全長比に応じた都市スケールで表示されます。",
      "交通量は可視範囲内の交通負荷に応じて重み付けして生成され、香港式左側通行、分離された対面通行レーン、交差点でのカーブ旋回、車間安全距離を採用しています。",
      "車両は高架道路・通常の坂・尾根・橋の坂・橋面を連続して走行可能。上り坂では減速し、下り坂やカメラ回転時も正しい高さと向きを維持します。",
      "一定のズーム倍率まで拡大した時のみ車両が遅延読み込みされ、縮小または画面外に出ると消去。画面外の道路は交通を生成・描画しません。",
      "地形のビューポートカリング、バッチ生成、区間転送の制限、段階的なテクスチャ読み込み、深度のバッチ更新を追加し、大都市の読み込みとパン操作時のパフォーマンスを改善しました。",
      "交通はあくまで視覚レイヤーであり、都市経済・交通マップ・セーブフォーマットには影響しません。旧都市データもそのまま読み込めます。",
    ] },
    "v3.3.0": { title: "大型プロジェクト、都市ニュース、特殊建築解禁のアップデート", items: [
      "オーシャンパークは人口・収入・黒字・経済指数で審査される8×8の議会プロジェクトに変更。空港などの大型プロジェクトは旧セーブデータ向けのフットプリントフォールバックを維持します。",
      "空港承認・オーシャンパークのイベント・株価暴落に関するフォーラム画像とニュースを追加。シグナル8号以上では台風名と天文台長にちなんだ避難・浸水投稿が生成されます。",
      "著名人訪問・コンサート・ペンギン保護・教会・大学に関するニュースは、該当する建物が実際に存在することを条件とするようになりました。",
      "サイエンスパークのモデルを2段階の安全な読み込みで再有効化。工業地区モデルの分類とテクスチャ読み込み失敗時の保護を改善しました。",
      "コンテナ港のビーチ海岸線・重複した岸辺・回転方向を修正。海岸マスをインデックス化し、大都市での回転時に数千万回スキャンする問題を回避しました。",
      "特殊建築解禁の完全なマニュアル、ゲーム内ヘルプ、議員スタイルの初回解禁ティッカー通知を追加しました。",
    ] },
    "v3.2.0": { title: "新しい都市スカイライン、住宅・商業のグレード分け、「ローズガーデン計画」", items: [
      "住宅・商業モデルにL／M／H／UHのグレードを追加。地価・景観・環境・経済・健康・都市施設に応じて、より階層的な住宅街と商業中心地を形成します。",
      "高級住宅は条件を満たした低密度住宅区にのみ出現。世界クラスの超高層ビルは証券取引所・空港・良好なビジネス環境を備えた高密度商業区にのみ出現します。",
      "新空港は12×12の「ローズガーデン計画」として登場。人口・財政・経済条件をクリアし議会の承認を得て初めて建設が解禁されます。",
      "公共サービス・レジャー文化施設・ランドマークのメニューを再分類。大学・コミュニティカレッジ・警察署・消防署のモデルが順番に切り替わり、マップに多様性が生まれます。",
      "アイソメトリックアンカー、コンテナ港4×4モデル、ロスレスWebPリリースパイプラインを全面刷新し、ズーム時のジャギー・テクスチャ安定性・デスクトップ版の容量を改善しました。",
    ] },
    "v3.1.8": { title: "言語切り替え後に都市の地形高度が大規模に崩れる不具合を修正", items: [
      "内蔵の都市地形プレビューはプレビュー用データのみを返すようになり、台北など他都市のプレビュー高度がプレイ中の都市に書き込まれることがなくなりました。",
      "ゲーム開始後に英語・繁体字中国語・日本語を切り替えても、非表示になったランディング画面の地形プレビューがバックグラウンドで更新されなくなりました。",
      "地形プレビューの分離を検証する回帰テストを追加し、新規ゲームは正常に高度を生成しつつ、プレビューが本番マップを汚染しないことを保証しました。",
    ] },
    "v3.1.7": { title: "法案結果ニュース画像の修正と無効なモデル読み込みの整理", items: [
      "法案可決3ヶ月後の効果ニュースは、パッケージ内に実在する <code>UI/news/*.webp</code> 画像を使用するよう変更。ポップアップ表示前にパスを統一し、DMG版・EXE版での画像切れを修正しました。",
      "起動時に読み込もうとしていた既に削除済みの <code>Models/PNG/buildingTiles_*.png</code> モデル78個の読み込み要求と、関連する未使用の旧配置・カタログコードを削除し、コンソールに404が延々と出続ける問題を解消しました。",
      "無効になっていた商業建築のフォールバックファイル名を整理し、起動時・フォールバック時のすべてのモデルパスに対応ファイルが存在することを確認しました。",
    ] },
    "v3.1.3": { title: "フォーラム画像切れの修正と投稿頻度の低減", items: [
      "台風・暴風雨・学術ランキング・過去の人気歌手・無料アイスクリーム・香城の光のショーなど、フォーラムの「特別イベント」画像15枚が、移行前の古い.pngパスを指したままになっていた（実ファイルは既に.webpへ移行済み）ため、すべて表示が壊れていました。全パスを修正し、投稿作成時の画像検証も同じロジックを使うようにしたことで、修正済みのパスを誤ってブロックしなくなりました。",
      "以前はフォーラムが毎ゲーム月、特別な出来事が無くても新規投稿していたため、長時間プレイすると煩わしく、ゲームの動作も遅くなっていました。現在は本当に何か起きた場合（台風・新政策・数値が閾値に達した・季節の話題など）のみ当月中に投稿し、何もなければ最長3ヶ月ごとに雑談投稿を1件補うだけになりました。",
    ] },
    "v3.1.2": { title: "AIニュースに3回連続失敗での自動停止機能を追加", items: [
      "AIニュースサービスが一時的に利用不可（クォータ超過など）になると、フォーラムはコメント未生成の投稿すべてに対して延々とリトライを続け、短時間に大量のリクエストが集中して画像や効果音の読み込みまで巻き込んで失敗させていました。",
      "ティッカーニュース・立法会キャラクターニュース・フォーラムコメントは同じ「3回失敗」機構を共有するようになり、3回連続で失敗するとAIニュースサービス全体を自動停止して通知を表示。それぞれが無限にリトライしてゲーム全体を遅くすることがなくなりました。",
      "設定画面でAIニュースを再度有効にすると即座にテスト生成を実行し、同様に3回失敗ルールで保護されます。再び3回連続失敗すると再度自動停止します。",
    ] },
    "v3.1.1": { title: "フォーラムニュース画像切れの修正", items: [
      "v3.1.0ではフォーラムとニュースポップアップの画像が404になっていました。不足していた画像ファイルを補い、正常に表示されるようになりました。",
    ] },
    "v3.1.0": { title: "立法会議事堂の再設計と香城フォーラムのAIコメント", items: [
      "法案・条例が長い一覧から折りたたみ式カテゴリに変更：財政経済、公共安全と交通、環境と都市計画、教育と科学研究、社会福祉、統治改革、そして単発予算の特別決議を独立カテゴリとして追加。",
      "各法案・決議に提案した官僚または議員の肖像が表示されるように。議事堂画面は実写背景を使用し、動議が採決に入ると進行状況が表示されます。",
      "官僚の専門的意見と議員の立場表示を、縦一列のリストから左右交互のディベート風カードに変更しました。",
      "香城フォーラムのコメントがAI生成に対応：市民2〜3件、官僚1〜2件。コメントが生成され続けなかったトークン切り捨ての不具合を修正し、不安定なモデルを自動回避するフォールバック機構を追加しました。",
      "音楽音量と新しく追加された都市環境音量が前回の設定を記憶するように。天候の視覚効果はデフォルトでオンのままです。",
      "トップバーのメニューを再分類し、表示設定と一般設定を分離。トップバーと重複していた速度ボタンを削除しました。",
    ] },
    "v3.0.0": { title: "立法会システム、AIキャラクターニュース、台風シグナル天候の刷新", items: [
      "立法会を追加：実名を持つ官僚・議員10名が、税率・治安・汚染・医療などの実際の都市データに応じて反応します。キャラクター名は変更可能です。",
      "AIニュースに「キャラクターニュース」を追加：官僚・議員の政策への反応、いつでも依頼できるインタビュー、天文台長による台風シグナル発表。AI以外にもすべてルールベースのフォールバックを用意しました。",
      "台風は北西太平洋の実際の命名リスト（中日対訳）を使用。シグナルは実際にシミュレートされた風速に応じて1→3→8→（9→10）→8→3→1という現実的な進行で上下します。暴風雨警報は天文台の降雨量基準に基づき黄・赤・黒の3段階に分かれます。",
      "画面上部に天候ステータスバー（気温・湿度・シグナルバッジ）を追加し、雨粒のパーティクルや雷鳴・稲光の効果を追加。効果の強さは風雨と連動します。設定で視覚効果をオフにでき、古い環境のPCにも配慮しました。",
      "立法会の完成や証券取引所の初取引日、シグナル8号以上の発生時に、新聞風の「号外」トップページがポップアップするようになりました。",
      "香港式の地域環境ホワイトノイズを追加：商業・複合エリアにズームインするほど都市の環境音が聞こえ、純粋な住宅エリアにズームインすると静かな住宅の雰囲気に戻ります。天候によって雨や台風の音も重なります。",
    ] },
    "v2.0.0": { title: "クラウドAI地区ニュースと都市生活シミュレーション", items: [
      "Ollama Cloud を使ったオプションのAIニュースを追加。香港ローカルの編集口調で都市の実況を「香城快報」として執筆します。",
      "天候・暴風雨・台風の段階と市民のアクティビティを追加し、交通・経済・ニュース内容と連動させました。",
      "プレイヤーが命名できる香港式バイリンガル地区標識を追加。各地区の交通・教育・医療・汚染・地価・人口が地域ニュースに影響します。",
      "APIキーはGitHubやインストーラーに含まれません。プレイヤーがインストール後に一度入力し、システムが安全に保存します。",
      "標識の改名・設置・撤去・表示設定に安全なオートセーブを追加。セーブフォーマットはバージョン12に更新されました。",
    ] },
    "v1.1.0": { title: "交通指数システムと情報マップの統合", items: [
      "交通指数シミュレーションと交通オーバーレイマップを追加しました。",
      "高い渋滞度は住宅・商業需要を低下させ、都市発展スコアにも影響します。",
      "市役所メニューがすべてのオーバーレイを情報マップウィンドウに統合しました。",
    ] },
    "v1.0.5": { title: "Windows自動アップデート初版", items: [
      "Windowsデスクトップ版に自動アップデートチェック、バックグラウンドダウンロード、再起動して適用するフローを追加しました。",
      "未署名のmacOS版では新バージョンの通知を表示し、ダウンロードページを直接開いて手動更新できるようにしました。",
      "リリースにはWindowsアップデーター用メタデータ（<code>latest.yml</code>とセットアップのblockmap）も同時にアップロードされます。",
      "サイトのダウンロード統計は公開ダウンロードファイルのみをカウントし、アップデーターのメタデータは除外するようになりました。",
    ] },
    "v1.0.4": { title: "医療システム、読み込み修正、大型建築の表示改善", items: [
      "病院・健康指数・平均寿命・医療カバー率・健康マップの初版を追加しました。",
      "疫病・医療キャパシティ・公衆衛生政策の初版を追加（禁煙政策や児童健康プログラムなど）。",
      "都市の読み込み待機フローを修正し、ランディングサイトやゲームシーンの準備が整う前の読み込み失敗を防止しました。",
      "地形・道路・建物・エフェクトの深度帯フォールバック方式に変更し、大型の4x4建築が地面に隠れてしまう問題を改善しました。",
    ] },
    "v1.0.3": { title: "デスクトップインストーラーの同期", items: [
      "macOS Apple Silicon版とmacOS Intel版のDMGを別々に提供するようになりました。",
      "Windowsのインストーラー版・ポータブル版のダウンロードリンクを同期しました。",
      "リリースプロセスのドキュメントを更新し、今後ゲーム・サイト・インストーラーを一括更新しやすくしました。",
    ] },
  },
};

function buildLocalizedChangelog(lang) {
  const base = SITE_CHANGELOG["zh-HK"];
  if (lang === "zh-HK") return base;
  const overrides = SITE_CHANGELOG_TRANSLATIONS[lang] || {};
  return base.map((entry) => {
    const override = overrides[entry.version];
    return override
      ? { ...entry, title: override.title, items: override.items }
      : entry;
  });
}

// ── Static UI text ───────────────────────────────────────────────────────────
const SITE_TEXT = {
  "zh-HK": {
    meta: {
      title: "香城模擬器 | The City of Heung Shing",
      description: "免費下載《香城模擬器》：一款向 SimCity 2000 致敬、以香港城市生活為靈感嘅城市建設遊戲。免費遊玩，分享及再利用請參閱版權條款。",
      ogDescription: "由街道、天氣到議會、股市同公共交通，一齊建設屬於你嘅香城。遊戲免費下載；歡迎分享官方連結，其他用途請參閱版權條款。",
    },
    nav: { home: "首頁", trailer: "預告片", gallery: "玩法與截圖", downloads: "免費下載", requirements: "配置要求", guide: "遊戲指南", stats: "統計", changelog: "版本", github: "GitHub" },
    hero: {
      eyebrowPrefix: "香城模擬器",
      title: "香城模擬器",
      versionBadge: "v4.14.0 — 【香城討論區】",
      versionDesc: "官網嘅官方新聞頁變成真正嘅香城討論區：官方新聞同街坊自己開嘅帖一齊出現，可以開新帖、留言，仲可以俾 emoji 回應；經版主批准之後會出現喺遊戲入面。",
      lede: "一款向 SimCity 2000 致敬、以香港城市生活為靈感嘅城市建設遊戲。起街道、規劃社區、經營自己嘅香城巴士公司、處理議會同天氣，再睇住一座有性格嘅香城慢慢成長。",
      freeLabel: "完全免費 · macOS + Windows · 本機存檔",
      downloadBtn: "【免費下載】",
      latestBtn: "最新版本",
      guideBtn: "睇遊戲指南",
      shareNote: "歡迎免費遊玩，同朋友分享官方連結、截圖同介紹。影片、素材同遊戲再散布嘅使用範圍，請參閱版權條款。",
    },
    sharing: {
      eyebrow: "Made to be shared",
      title: "一份想同大家分享嘅城市遊戲",
      desc: "香城模擬器係一個免費嘅個人創作，希望將香港街道、城市治理同老派城市模擬嘅樂趣放埋一齊。有興趣就下載嚟玩，唔需要付費。",
      downloadLink: "揀你嘅版本，免費開始建城 →",
      ariaLabel: "分享及出處說明",
      creditLabel: "分享時請註明",
      creditText: "《香城模擬器 / The City of Heung Shing》",
      creditDesc: "分享官方連結、截圖同介紹時，請保留作品名稱及原始連結。影片、素材再利用同安裝包散布另依版權條款。",
    },
    trailer: {
      eyebrow: "Trailer",
      title: "先睇預告片",
      intro: "香城模擬器嘅 YouTube 預告片，由 Diablock Channel 製作：先睇畫面，再免費下載。",
      frameTitle: "香城模擬器預告片",
      watch: "在 YouTube 觀看 ↗",
    },
    gallery: {
      eyebrow: "Gameplay & Screenshots",
      title: "一張圖，一段香城故事",
      intro: "唔只係睇畫面：每張截圖都同相關玩法放埋一齊。撳任何圖片就可以放大，慢慢睇城市細節。",
      openImage: "放大截圖",
      closeImage: "關閉",
    },
    stats: {
      latestVersion: "最新版本",
      totalDownloads: "總下載次數",
      totalViews: "入口瀏覽",
      loading: "載入中",
      publishedSuffix: "發布",
      downloadsUnit: "次下載",
      notAvailable: "暫未提供",
      viewsNotAvailable: "瀏覽次數暫未提供",
      viewsAlt: "入口瀏覽次數",
    },
    requirements: {
      eyebrow: "System Requirements",
      title: "硬體配置要求",
      intro: "遊戲以 Electron 桌面程式運行，用 WebGL 硬體加速渲染。城市越大、夜晚越多燈，對顯示卡嘅要求越高。",
      headers: ["項目", "最低配置", "建議配置"],
      rows: [
        ["作業系統", "macOS 12 Monterey 或以上；Windows 10（64 位元）或以上", "macOS 14 Sonoma 或以上；Windows 11"],
        ["處理器", "64 位元雙核心（2018 年或之後嘅 Intel／AMD）", "四核心或以上（Intel Core i5 第 10 代／AMD Ryzen 5 或更新）；Apple Silicon M1 或以上"],
        ["記憶體", "4 GB", "8 GB 或以上"],
        ["顯示卡", "支援 WebGL 2 硬體加速嘅 GPU（Intel UHD 620／Iris Plus 或同級以上），並已安裝正常驅動程式", "Apple Silicon 內建 GPU，或獨立顯示卡（GeForce GTX 1050／Radeon RX 560 或以上）"],
        ["儲存空間", "1 GB 可用空間（安裝檔約 340–370 MB，安裝後約 600 MB）", "2 GB 可用空間（預留存檔同自動更新）"],
        ["顯示器", "1280 × 800（遊戲視窗最細 1024 × 700）", "1920 × 1080 或以上"],
        ["網絡", "唔需要——遊戲完全離線可玩", "選用：開場畫面嘅天文台實時天氣、AI 新聞（自備 Ollama）、自動檢查更新"],
        ["輸入裝置", "滑鼠（滾輪縮放）同鍵盤", "同上"],
      ],
      notes: [
        "參考數據（Intel Core i5-8279U＋Iris Plus 655 內建顯示卡，1440 × 872）：10 萬人口城市日間 58 fps、夜晚 43 fps；34 萬人口城市約 30 fps。",
        "虛擬機、遠端桌面或以 Safe Mode 開機時通常冇硬體加速，會退回軟件渲染（1–2 fps），唔建議喺呢啲環境遊玩。",
        "安裝檔尚未簽章：macOS Gatekeeper 或 Windows SmartScreen 可能會喺第一次開啟時要求確認。",
      ],
    },
    downloads: {
      eyebrow: "Downloads",
      title: "選擇你的平台",
      intro: "遊戲本體免費下載。揀返你部電腦嘅版本，就可以開始建立自己嘅香城。",
      cards: [
        { platform: "macOS", title: "Mac Apple Silicon", desc: "適合 M1、M2、M3、M4 或更新的 Mac。下載 DMG 後拖入「應用程式」即可安裝。", btn: "下載 ARM64 DMG" },
        { platform: "macOS", title: "Mac Intel", desc: "適合 Intel CPU 的 Mac。下載 DMG 後拖入「應用程式」即可安裝。", btn: "下載 Intel DMG" },
        { platform: "Windows", title: "Windows 安裝版", desc: "推薦大部分玩家使用。安裝後會加入一般應用程式捷徑。", btn: "下載安裝版 EXE" },
        { platform: "Windows", title: "Windows 免安裝版", desc: "不用安裝，下載後直接執行。適合快速試玩。", btn: "下載免安裝版 EXE" },
      ],
      notice: "AI 新聞屬選用功能。安裝後請在「設定 → AI 新聞」貼上你自己嘅 Ollama API key；遊戲及安裝檔不包含任何開發者密鑰。未設定 AI 亦可照常使用模擬新聞。現時安裝檔尚未完成簽章，macOS Gatekeeper 或 Windows SmartScreen 可能會在第一次開啟時要求確認。",
    },
    manual: {
      intro: "除資金、空地及 footprint 外，以下建築需要額外城市條件。首次達標時，遊戲走馬燈及香城討論區會發出一次解鎖通知。",
      tableHeaders: ["建築", "解鎖條件", "上限／選單行為"],
      notesTitle: "分區自然生成",
      sourceLink: "閱讀完整數值規格",
    },
    changelog: { eyebrow: "Release Notes", title: "版本變更說明" },
    features: {
      title: "建設、治理、迭代",
      desc: "劃設住宅、商業與工業區，興建道路、公園、公共設施與發電廠；再起貨櫃碼頭、機場同自己嘅巴士公司，令城市真正運作起嚟。一個顯示日就係遊戲入面一個月：日出日落、天氣、颱風同議會法案全部跟同一個時鐘行，入夜之後每棟樓都有自己嘅開燈習慣。放置雙語路牌建立分區，再由討論區、報章同 AI 新聞講返你座城市嘅故事。",
    },
    footer: { tagline: "香城模擬器 · 免費遊玩，歡迎分享官方連結", releaseInfo: "版本資訊", blog: "開發blog" },
  },
  "zh-TW": {
    meta: {
      title: "香城模擬器 | The City of Heung Shing",
      description: "免費下載《香城模擬器》：一款向 SimCity 2000 致敬、以香港城市生活為靈感的城市建設遊戲。免費遊玩，分享與再利用請參閱版權條款。",
      ogDescription: "從街道、天氣到議會、股市與公共運輸，一起建設屬於你的香城。遊戲免費下載；歡迎分享官方連結，其他用途請參閱版權條款。",
    },
    nav: { home: "首頁", trailer: "預告片", gallery: "玩法與截圖", downloads: "免費下載", requirements: "配置要求", guide: "遊戲指南", stats: "統計", changelog: "版本", github: "GitHub" },
    hero: {
      eyebrowPrefix: "香城模擬器",
      title: "香城模擬器",
      versionBadge: "v4.14.0 — 【香城討論區】",
      versionDesc: "官網的官方新聞頁變成真正的香城討論區：官方新聞與街坊自己開的貼文一起出現，可以開新貼文、留言，還能給予 emoji 回應；經版主核准後會出現在遊戲中。",
      lede: "一款向 SimCity 2000 致敬、以香港城市生活為靈感的城市建設遊戲。興建街道、規劃社區、經營自己的香城公車公司、處理議會與天氣，看著一座有個性的香城慢慢成長。",
      freeLabel: "完全免費 · macOS + Windows · 本機存檔",
      downloadBtn: "【免費下載】",
      latestBtn: "最新版本",
      guideBtn: "查看遊戲指南",
      shareNote: "歡迎免費遊玩，與朋友分享官方連結、截圖與介紹。影片、素材與遊戲再散布的使用範圍，請參閱版權條款。",
    },
    sharing: {
      eyebrow: "Made to be shared",
      title: "一款想和大家分享的城市遊戲",
      desc: "香城模擬器是一個免費的個人創作，希望把香港街道、城市治理與經典城市模擬的樂趣放在一起。有興趣就下載來玩，不需要付費。",
      downloadLink: "選擇你的版本，免費開始建城 →",
      ariaLabel: "分享與出處說明",
      creditLabel: "分享時請註明",
      creditText: "《香城模擬器 / The City of Heung Shing》",
      creditDesc: "分享官方連結、截圖與介紹時，請保留作品名稱及原始連結。影片、素材再利用與安裝包散布另依版權條款。",
    },
    trailer: {
      eyebrow: "Trailer",
      title: "先看預告片",
      intro: "香城模擬器的 YouTube 預告片，由 Diablock Channel 製作：先看畫面，再免費下載。",
      frameTitle: "香城模擬器預告片",
      watch: "在 YouTube 觀看 ↗",
    },
    gallery: {
      eyebrow: "Gameplay & Screenshots",
      title: "一張圖，一段香城故事",
      intro: "不只是看畫面：每張截圖都和相關玩法放在一起。點擊任何圖片即可放大，慢慢欣賞城市細節。",
      openImage: "放大截圖",
      closeImage: "關閉",
    },
    stats: {
      latestVersion: "最新版本",
      totalDownloads: "總下載次數",
      totalViews: "網站瀏覽次數",
      loading: "載入中",
      publishedSuffix: "發布",
      downloadsUnit: "次下載",
      notAvailable: "暫無資料",
      viewsNotAvailable: "瀏覽次數暫無資料",
      viewsAlt: "網站瀏覽次數",
    },
    requirements: {
      eyebrow: "System Requirements",
      title: "硬體配置需求",
      intro: "遊戲以 Electron 桌面程式運行，使用 WebGL 硬體加速渲染。城市越大、夜晚燈光越多，對顯示卡的要求越高。",
      headers: ["項目", "最低配置", "建議配置"],
      rows: [
        ["作業系統", "macOS 12 Monterey 或以上；Windows 10（64 位元）或以上", "macOS 14 Sonoma 或以上；Windows 11"],
        ["處理器", "64 位元雙核心（2018 年或之後的 Intel／AMD）", "四核心或以上（Intel Core i5 第 10 代／AMD Ryzen 5 或更新）；Apple Silicon M1 或以上"],
        ["記憶體", "4 GB", "8 GB 或以上"],
        ["顯示卡", "支援 WebGL 2 硬體加速的 GPU（Intel UHD 620／Iris Plus 或同級以上），並已安裝正常驅動程式", "Apple Silicon 內建 GPU，或獨立顯示卡（GeForce GTX 1050／Radeon RX 560 或以上）"],
        ["儲存空間", "1 GB 可用空間（安裝檔約 340–370 MB，安裝後約 600 MB）", "2 GB 可用空間（預留存檔與自動更新）"],
        ["顯示器", "1280 × 800（遊戲視窗最小 1024 × 700）", "1920 × 1080 或以上"],
        ["網路", "不需要——遊戲完全離線可玩", "選用：開場畫面的天文台即時天氣、AI 新聞（自備 Ollama）、自動檢查更新"],
        ["輸入裝置", "滑鼠（滾輪縮放）與鍵盤", "同上"],
      ],
      notes: [
        "參考數據（Intel Core i5-8279U＋Iris Plus 655 內建顯示卡，1440 × 872）：10 萬人口城市日間 58 fps、夜晚 43 fps；34 萬人口城市約 30 fps。",
        "虛擬機、遠端桌面或以安全模式開機時通常沒有硬體加速，會退回軟體渲染（1–2 fps），不建議在這些環境遊玩。",
        "安裝檔尚未簽章：macOS Gatekeeper 或 Windows SmartScreen 可能會在第一次開啟時要求確認。",
      ],
    },
    downloads: {
      eyebrow: "Downloads",
      title: "選擇你的平台",
      intro: "遊戲本體免費下載。選擇適合你電腦的版本，就可以開始建立自己的香城。",
      cards: [
        { platform: "macOS", title: "Mac Apple Silicon", desc: "適合 M1、M2、M3、M4 或更新的 Mac。下載 DMG 後拖曳到「應用程式」即可安裝。", btn: "下載 ARM64 DMG" },
        { platform: "macOS", title: "Mac Intel", desc: "適合 Intel CPU 的 Mac。下載 DMG 後拖曳到「應用程式」即可安裝。", btn: "下載 Intel DMG" },
        { platform: "Windows", title: "Windows 安裝版", desc: "推薦大多數玩家使用。安裝後會加入一般應用程式捷徑。", btn: "下載安裝版 EXE" },
        { platform: "Windows", title: "Windows 免安裝版", desc: "不用安裝，下載後直接執行。適合快速試玩。", btn: "下載免安裝版 EXE" },
      ],
      notice: "AI 新聞屬選用功能。安裝後請在「設定 → AI 新聞」貼上你自己的 Ollama API key；遊戲及安裝檔不包含任何開發者金鑰。未設定 AI 也可照常使用模擬新聞。目前安裝檔尚未完成簽章，macOS Gatekeeper 或 Windows SmartScreen 可能會在第一次開啟時要求確認。",
    },
    manual: {
      intro: "除資金、空地及 footprint 外，以下建築需要額外城市條件。首次達標時，遊戲跑馬燈及香城討論區會發出一次解鎖通知。",
      tableHeaders: ["建築", "解鎖條件", "上限／選單行為"],
      notesTitle: "分區自然生成",
      sourceLink: "閱讀完整數值規格",
    },
    changelog: { eyebrow: "Release Notes", title: "版本更新說明" },
    features: {
      title: "建設、治理、迭代",
      desc: "劃設住宅、商業與工業區，興建道路、公園、公共設施與發電廠；再蓋貨櫃碼頭、機場與自己的公車公司，讓城市真正運作起來。一個顯示日就是遊戲裡的一個月：日出日落、天氣、颱風與議會法案全部依同一個時鐘運行，入夜之後每棟樓都有自己的開燈習慣。放置雙語路牌建立分區，再由討論區、報紙與 AI 新聞說出你這座城市的故事。",
    },
    footer: { tagline: "香城模擬器 · 免費遊玩，歡迎分享官方連結", releaseInfo: "版本資訊", blog: "開發部落格" },
  },
  en: {
    meta: {
      title: "The City of Heung Shing | 香城模擬器",
      description: "Download The City of Heung Shing for free: a city-building game inspired by Hong Kong life and made in tribute to SimCity 2000. Free to play; sharing and reuse are subject to the license.",
      ogDescription: "Build your own Heung Shing through streets, weather, council politics, markets and public transport. Free to download; see the license for sharing and reuse.",
    },
    nav: { home: "Home", trailer: "Trailer", gallery: "Gameplay & Screenshots", downloads: "Free Download", requirements: "Requirements", guide: "Game Guide", stats: "Stats", changelog: "Changelog", github: "GitHub" },
    hero: {
      eyebrowPrefix: "The City of Heung Shing",
      title: "The City of Heung Shing",
      versionBadge: "v4.14.0 — Heung Shing Forum",
      versionDesc: "The site's news page is now a real Heung Shing Forum: official news and citizen posts show up together, anyone can start a post or comment, and posts can get emoji reactions. Everything reaches the game once the moderator approves it.",
      lede: "A city-building game inspired by Hong Kong life and made in tribute to SimCity 2000. Build streets, shape neighbourhoods, run your own Heung Shing Bus Company, navigate council politics and weather, then watch a city with real personality grow.",
      freeLabel: "Completely free · macOS + Windows · Local saves",
      downloadBtn: "【Free Download】",
      latestBtn: "Latest release",
      guideBtn: "Read the game guide",
      shareNote: "Play for free and share official links, screenshots and city stories. See the copyright terms for videos, asset reuse and game redistribution.",
    },
    sharing: {
      eyebrow: "Made to be shared",
      title: "A city game made for everyone to enjoy",
      desc: "The City of Heung Shing is a free personal project that brings together Hong Kong streets, civic life and the joy of classic city simulation. If it sounds interesting, download it and play—there is nothing to buy.",
      downloadLink: "Choose your build and start for free →",
      ariaLabel: "Sharing and attribution information",
      creditLabel: "Please credit",
      creditText: "The City of Heung Shing / 香城模擬器",
      creditDesc: "Credit the game and include its official link when sharing screenshots and articles. Videos, asset reuse and installer redistribution are subject to the copyright terms.",
    },
    trailer: {
      eyebrow: "Trailer",
      title: "Watch the trailer",
      intro: "The City of Heung Shing trailer on YouTube, made by Diablock Channel: see it in motion, then download for free.",
      frameTitle: "The City of Heung Shing trailer",
      watch: "Watch on YouTube ↗",
    },
    gallery: {
      eyebrow: "Gameplay & Screenshots",
      title: "Every screenshot tells a city story",
      intro: "More than a gallery: every image sits beside the feature it explains. Select any screenshot to open it at full size and explore the details.",
      openImage: "Enlarge screenshot",
      closeImage: "Close",
    },
    stats: {
      latestVersion: "Latest version",
      totalDownloads: "Total downloads",
      totalViews: "Page views",
      loading: "Loading",
      publishedSuffix: "",
      publishedPrefix: "Published ",
      downloadsUnit: "downloads",
      notAvailable: "Not available yet",
      viewsNotAvailable: "View count unavailable",
      viewsAlt: "Page view count",
    },
    requirements: {
      eyebrow: "System Requirements",
      title: "System requirements",
      intro: "The game is an Electron desktop app rendered with hardware-accelerated WebGL. The bigger the city and the more lights after dark, the more it asks of the graphics chip.",
      headers: ["", "Minimum", "Recommended"],
      rows: [
        ["OS", "macOS 12 Monterey or later; Windows 10 (64-bit) or later", "macOS 14 Sonoma or later; Windows 11"],
        ["Processor", "64-bit dual-core (Intel/AMD from 2018 on)", "Quad-core or better (10th-gen Intel Core i5 / AMD Ryzen 5 or newer); Apple Silicon M1 or later"],
        ["Memory", "4 GB", "8 GB or more"],
        ["Graphics", "A GPU with hardware-accelerated WebGL 2 (Intel UHD 620 / Iris Plus or equivalent) and a working driver", "Apple Silicon integrated GPU, or a discrete card (GeForce GTX 1050 / Radeon RX 560 or better)"],
        ["Storage", "1 GB free (installer 340–370 MB, about 600 MB installed)", "2 GB free (room for saves and updates)"],
        ["Display", "1280 × 800 (the window is at least 1024 × 700)", "1920 × 1080 or larger"],
        ["Network", "Not required — the game plays fully offline", "Optional: live Observatory weather on the title screen, AI news (your own Ollama), update checks"],
        ["Input", "Mouse with scroll wheel (zoom) and keyboard", "Same"],
      ],
      notes: [
        "Reference (Intel Core i5-8279U with integrated Iris Plus 655, 1440 × 872): a 100k-population city runs at 58 fps by day and 43 fps at night; a 340k city at about 30 fps.",
        "Virtual machines, remote desktop and Safe Mode boots usually have no hardware acceleration and fall back to software rendering at 1–2 fps; playing there is not recommended.",
        "The installers are not code-signed yet: macOS Gatekeeper or Windows SmartScreen may ask you to confirm on first launch.",
      ],
    },
    downloads: {
      eyebrow: "Downloads",
      title: "Choose your platform",
      intro: "The full game is free to download. Pick the build for your computer and start creating your own Heung Shing.",
      cards: [
        { platform: "macOS", title: "Mac Apple Silicon", desc: "For M1, M2, M3, M4 or newer Macs. Download the DMG and drag it into Applications to install.", btn: "Download ARM64 DMG" },
        { platform: "macOS", title: "Mac Intel", desc: "For Intel-based Macs. Download the DMG and drag it into Applications to install.", btn: "Download Intel DMG" },
        { platform: "Windows", title: "Windows Installer", desc: "Recommended for most players. Adds a standard shortcut after installing.", btn: "Download Setup EXE" },
        { platform: "Windows", title: "Windows Portable", desc: "No installation needed - download and run directly. Great for a quick trial.", btn: "Download Portable EXE" },
      ],
      notice: "AI news is an optional feature. After installing, paste your own Ollama API key under Settings → AI News; the game and installer never bundle any developer key. The game works fine with simulated news if you skip AI setup. Installers aren't code-signed yet, so macOS Gatekeeper or Windows SmartScreen may prompt for confirmation the first time you open them.",
    },
    manual: {
      intro: "Beyond funds, empty space and footprint, the buildings below need extra city conditions. The first time a condition is met, the in-game ticker and the Heung Shing Forum post a one-time unlock notice.",
      tableHeaders: ["Building", "Unlock condition", "Cap / menu behaviour"],
      notesTitle: "Zone auto-generation",
      sourceLink: "Read the full numeric spec",
    },
    changelog: { eyebrow: "Release Notes", title: "Release Notes" },
    features: {
      title: "Build, govern, iterate",
      desc: "Zone residential, commercial and industrial land, build roads, parks, public services and power plants, then a container port, an airport and your own bus company to make the city actually run. One displayed day is one game month: sunrise and sunset, weather, typhoons and council bills all keep the same clock, and after dark every building keeps its own lighting habits. Place bilingual signs to define districts, and let the forum, the newspapers and optional AI news tell your city's story.",
    },
    footer: { tagline: "The City of Heung Shing · Free to play · Share official links", releaseInfo: "Release info", blog: "Dev blog" },
  },
  ja: {
    meta: {
      title: "香城模擬器 | The City of Heung Shing",
      description: "『香城模擬器』を無料ダウンロード。香港の都市生活から着想を得た、SimCity 2000へのオマージュとなる都市建設ゲームです。共有・再利用については利用条件をご確認ください。",
      ogDescription: "道路、天候、議会、株式市場、公共交通を通じて自分だけの香城を建設。無料でダウンロードでき、共有・再利用については利用条件をご確認ください。",
    },
    nav: { home: "ホーム", trailer: "予告編", gallery: "ゲーム内容と画像", downloads: "無料ダウンロード", requirements: "動作環境", guide: "ゲームガイド", stats: "統計", changelog: "更新履歴", github: "GitHub" },
    hero: {
      eyebrowPrefix: "香城模擬器",
      title: "香城模擬器",
      versionBadge: "v4.14.0 — 香城討論区",
      versionDesc: "サイトのニュースページが本物の香城討論区になりました：公式ニュースと市民の投稿が一緒に表示され、誰でも投稿やコメントができ、絵文字リアクションも可能です。モデレーターの承認後にゲームへ反映されます。",
      lede: "香港の都市生活から着想を得た、SimCity 2000へのオマージュとなる都市建設ゲーム。道路を築き、地区を計画し、自分だけの香城バス会社を経営し、議会や天候に向き合いながら、個性ある香城の成長を見守ります。",
      freeLabel: "完全無料 · macOS + Windows · ローカルセーブ",
      downloadBtn: "【無料ダウンロード】",
      latestBtn: "最新リリース",
      guideBtn: "ゲームガイドを見る",
      shareNote: "無料プレイや公式リンク、スクリーンショット、紹介記事の共有を歓迎します。動画、素材の再利用、ゲームの再配布については著作権と利用条件をご確認ください。",
    },
    sharing: {
      eyebrow: "Made to be shared",
      title: "みなさんと共有したい都市ゲーム",
      desc: "香城模擬器は、香港の街路、都市運営、クラシックな都市シミュレーションの楽しさを一つにした無料の個人制作ゲームです。興味があれば、料金不要ですぐに遊べます。",
      downloadLink: "バージョンを選んで無料で都市づくりを始める →",
      ariaLabel: "共有と出典表記について",
      creditLabel: "共有時のクレジット",
      creditText: "『香城模擬器 / The City of Heung Shing』",
      creditDesc: "公式リンク、スクリーンショット、紹介記事には作品名と公式リンクを明記してください。動画、素材の再利用、インストーラーの配布には利用条件が適用されます。",
    },
    trailer: {
      eyebrow: "Trailer",
      title: "まずは予告編を",
      intro: "Diablock Channel 制作の香城模擬器 YouTube 予告編：動く街を見てから、無料でダウンロード。",
      frameTitle: "香城模擬器 予告編",
      watch: "YouTube で見る ↗",
    },
    gallery: {
      eyebrow: "Gameplay & Screenshots",
      title: "一枚の画像、一つの香城物語",
      intro: "単なるギャラリーではありません。各画像を関連するゲーム内容と並べました。画像を選択すると拡大し、都市の細部まで確認できます。",
      openImage: "画像を拡大",
      closeImage: "閉じる",
    },
    stats: {
      latestVersion: "最新バージョン",
      totalDownloads: "総ダウンロード数",
      totalViews: "サイト閲覧数",
      loading: "読み込み中",
      publishedSuffix: "公開",
      downloadsUnit: "回ダウンロード",
      notAvailable: "現在利用できません",
      viewsNotAvailable: "閲覧数は現在取得できません",
      viewsAlt: "サイト閲覧数",
    },
    requirements: {
      eyebrow: "System Requirements",
      title: "動作環境",
      intro: "ゲームは Electron 製デスクトップアプリで、WebGL のハードウェアアクセラレーションで描画します。街が大きく、夜の灯りが多いほど GPU への負荷が上がります。",
      headers: ["項目", "最低環境", "推奨環境"],
      rows: [
        ["OS", "macOS 12 Monterey 以降／Windows 10（64bit）以降", "macOS 14 Sonoma 以降／Windows 11"],
        ["CPU", "64bit デュアルコア（2018 年以降の Intel／AMD）", "クアッドコア以上（第 10 世代 Intel Core i5／AMD Ryzen 5 以降）、Apple Silicon M1 以降"],
        ["メモリ", "4 GB", "8 GB 以上"],
        ["GPU", "WebGL 2 のハードウェアアクセラレーションに対応した GPU（Intel UHD 620／Iris Plus 相当以上）と正常なドライバー", "Apple Silicon 内蔵 GPU、または外部 GPU（GeForce GTX 1050／Radeon RX 560 以上）"],
        ["ストレージ", "空き 1 GB（インストーラー約 340～370 MB、インストール後約 600 MB）", "空き 2 GB（セーブデータと自動更新の余裕）"],
        ["ディスプレイ", "1280 × 800（ウィンドウ最小 1024 × 700）", "1920 × 1080 以上"],
        ["ネットワーク", "不要——完全オフラインでプレイ可能", "任意：タイトル画面の天文台リアルタイム天気、AI ニュース（各自の Ollama）、更新チェック"],
        ["入力", "マウス（ホイールでズーム）とキーボード", "同上"],
      ],
      notes: [
        "参考値（Intel Core i5-8279U＋内蔵 Iris Plus 655、1440 × 872）：人口 10 万の街は昼 58 fps・夜 43 fps、人口 34 万の街は約 30 fps。",
        "仮想マシン、リモートデスクトップ、セーフモード起動ではハードウェアアクセラレーションが効かず、ソフトウェア描画（1～2 fps）になるため推奨しません。",
        "インストーラーは未署名です。macOS の Gatekeeper や Windows の SmartScreen が初回起動時に確認を求めることがあります。",
      ],
    },
    downloads: {
      eyebrow: "Downloads",
      title: "プラットフォームを選択",
      intro: "ゲーム本編は無料でダウンロードできます。お使いのコンピューターに合うバージョンを選び、自分だけの香城を作り始めましょう。",
      cards: [
        { platform: "macOS", title: "Mac Apple Silicon", desc: "M1、M2、M3、M4以降のMacに対応。DMGをダウンロードして「アプリケーション」にドラッグすればインストール完了です。", btn: "ARM64 DMG をダウンロード" },
        { platform: "macOS", title: "Mac Intel", desc: "Intel搭載Macに対応。DMGをダウンロードして「アプリケーション」にドラッグすればインストール完了です。", btn: "Intel DMG をダウンロード" },
        { platform: "Windows", title: "Windows インストーラー版", desc: "ほとんどのプレイヤーにおすすめ。インストール後、通常のショートカットが追加されます。", btn: "インストーラー EXE をダウンロード" },
        { platform: "Windows", title: "Windows ポータブル版", desc: "インストール不要、ダウンロード後すぐ実行できます。お試しプレイに最適です。", btn: "ポータブル EXE をダウンロード" },
      ],
      notice: "AIニュースはオプション機能です。インストール後、「設定 → AIニュース」でご自身のOllama APIキーを貼り付けてください。ゲームおよびインストーラーには開発者のキーは一切含まれていません。AIを設定しなくてもシミュレーテッドニュースは通常通り利用できます。現在インストーラーはコード署名が未完了のため、初回起動時にmacOS GatekeeperやWindows SmartScreenが確認を求める場合があります。",
    },
    manual: {
      intro: "資金・空き地・フットプリントに加え、以下の建築には追加の都市条件が必要です。条件を初めて満たすと、ゲーム内ティッカーと香城フォーラムに解禁通知が一度だけ表示されます。",
      tableHeaders: ["建築", "解禁条件", "上限／メニューの挙動"],
      notesTitle: "区画の自然発生",
      sourceLink: "詳細な数値仕様を読む",
    },
    changelog: { eyebrow: "Release Notes", title: "更新履歴" },
    features: {
      title: "建設・統治・改善を繰り返す",
      desc: "住宅・商業・工業地区を区画し、道路・公園・公共施設・発電所を建設。さらにコンテナ港、空港、自分のバス会社を作って街を本当に動かします。表示上の1日がゲーム内の1か月：日の出と日没、天気、台風、議会の法案はすべて同じ時計で進み、日が暮れれば建物ごとに灯りの習慣があります。バイリンガルの標識で地区を定め、フォーラムと新聞、任意の AI ニュースがあなたの街の物語を語ります。",
    },
    footer: { tagline: "香城模擬器 · 無料プレイ・公式リンク共有歓迎", releaseInfo: "リリース情報", blog: "開発ブログ" },
  },
};

const SITE_COPYRIGHT = {
  "zh-HK": {
    "title": "版權與使用條款",
    "metaTitle": "版權與使用條款 | 香城模擬器",
    "intro": "免費遊玩，歡迎介紹香城。分享作品、影片同素材之前，請先了解各自嘅使用範圍。",
    "version": "授權條款 v1.0 · 2026-09-15",
    "owner": "由 nortonyuen-oss（香城模擬器開發者）就依法享有或有權授權嘅部分保留權利。",
    "full": "閱讀正式授權全文（繁體中文）",
    "notices": "第三方來源與限制",
    "contact": "授權及權利查詢",
    "playTitle": "免費遊玩與個人備份",
    "play": "你可以喺自己控制嘅裝置安裝、遊玩同備份合法取得嘅遊戲，亦可分享自己嘅城市存檔。免費遊玩唔等於開源，公開原始碼亦唔代表可以重製或出售。",
    "shareTitle": "截圖、攻略與實況",
    "share": "歡迎分享官方連結、截圖、攻略、評論同遊玩影片。就開發者有權授權嘅部分，容許影片或實況透過廣告、訂閱或觀眾贊助營利。請註明「香城模擬器／The City of Heung Shing」並附官方連結。",
    "musicTitle": "錄影前請留意音樂",
    "music": "目前背景音樂由 Suno 免費方案產生，本遊戲授權唔包含呢啲音軌嘅商用或影片／直播營利權。製作營利內容時請關閉背景音樂；保留嘅音效亦要符合各自權利範圍。自行錄音唔會自動取得當中旋律、廣播或表演嘅權利。",
    "reservedTitle": "需要另外授權嘅用途",
    "reserved": "重新上傳安裝包、架設鏡像、改作或移植遊戲、重新包裝、轉售、商店上架同抽取自有素材另用，需要另外授權。法定權利、GitHub 平台內嘅既有權利，同第三方原授權容許嘅行為不受影響。",
    "thirdTitle": "第三方素材與 AI",
    "third": "套件依各自授權使用；Kenney 原始道路素材採 CC0。部分模型由 OpenAI 工具產生，唔代表全部 AI 圖像都有排他著作權。地景紀錄亦含 Unsplash 材質。天文台日月出沒資料來源須保留，年曆、警告圖示同 Google Earth 海岸線嘅具體使用範圍仍待核實；本頁唔授予呢啲內容額外商用權。",
    "softwareTitle": "軟體與資料來源",
    "software": "遊戲使用 Express、electron-updater、Electron、Phaser 等元件；electron-builder 同 sharp 用於建置。詳細版本、原授權與尚待補齊嘅通知，請參閱第三方聲明。第三方授權原文優先於呢頁摘要。",
    "versionsTitle": "適用版本與既有許可",
    "versions": "新條款適用於 2026-09-15 起發布並包含條款嘅原始碼版本及發行包，唔會追溯撤銷舊版已有效授予嘅權利。呢次更新係授權資訊發布，唔會自動更改之前嘅下載安裝包。",
    "authority": "本頁係使用摘要；繁體中文 LICENSE 全文為正式條款。第三方權利與依法不能排除嘅使用權仍然保留。"
  },
  "zh-TW": {
    "title": "版權與使用條款",
    "metaTitle": "版權與使用條款 | 香城模擬器",
    "intro": "免費遊玩，歡迎介紹香城。分享作品、影片與素材之前，請先了解各自的使用範圍。",
    "version": "授權條款 v1.0 · 2026-09-15",
    "owner": "由 nortonyuen-oss（香城模擬器開發者）就依法享有或有權授權的部分保留權利。",
    "full": "閱讀正式授權全文（繁體中文）",
    "notices": "第三方來源與限制",
    "contact": "授權及權利查詢",
    "playTitle": "免費遊玩與個人備份",
    "play": "你可以在自己控制的裝置安裝、遊玩與備份合法取得的遊戲，也可分享自己的城市存檔。免費遊玩不等於開源，公開原始碼也不代表可以重製或出售。",
    "shareTitle": "截圖、攻略與實況",
    "share": "歡迎分享官方連結、截圖、攻略、評論與遊玩影片。就開發者有權授權的部分，允許影片或實況透過廣告、訂閱或觀眾贊助營利。請註明「香城模擬器／The City of Heung Shing」並附官方連結。",
    "musicTitle": "錄影前請留意音樂",
    "music": "目前背景音樂由 Suno 免費方案產生，本遊戲授權不包含這些音軌的商用或影片／直播營利權。製作營利內容時請關閉背景音樂；保留的音效也要符合各自權利範圍。自行錄音不會自動取得其中旋律、廣播或表演的權利。",
    "reservedTitle": "需要另外授權的用途",
    "reserved": "重新上傳安裝包、架設鏡像、改作或移植遊戲、重新包裝、轉售、商店上架與抽取自有素材另用，需要另外授權。法定權利、GitHub 平台內的既有權利，以及第三方原授權允許的行為不受影響。",
    "thirdTitle": "第三方素材與 AI",
    "third": "套件依各自授權使用；Kenney 原始道路素材採 CC0。部分模型由 OpenAI 工具產生，不代表全部 AI 圖像都有排他著作權。地景紀錄也含 Unsplash 材質。天文台日月出沒資料來源須保留，年曆、警告圖示與 Google Earth 海岸線的具體使用範圍仍待核實；本頁不授予這些內容額外商用權。",
    "softwareTitle": "軟體與資料來源",
    "software": "遊戲使用 Express、electron-updater、Electron、Phaser 等元件；electron-builder 與 sharp 用於建置。詳細版本、原授權與尚待補齊的通知，請參閱第三方聲明。第三方授權原文優先於本頁摘要。",
    "versionsTitle": "適用版本與既有許可",
    "versions": "新條款適用於 2026-09-15 起發布並包含條款的原始碼版本及發行包，不會追溯撤銷舊版已有效授予的權利。這次更新是授權資訊發布，不會自動更改之前的下載安裝包。",
    "authority": "本頁是使用摘要；繁體中文 LICENSE 全文為正式條款。第三方權利與依法不能排除的使用權仍然保留。"
  },
  "en": {
    "title": "Copyright & usage",
    "metaTitle": "Copyright & usage | The City of Heung Shing",
    "intro": "Free to play, and welcome to share your city stories. Check the permissions for the game, videos and individual assets before reusing them.",
    "version": "License v1.0 · 15 September 2026",
    "owner": "Rights reserved by nortonyuen-oss, the game developer, only for material the developer owns or is authorized to license.",
    "full": "Read the full license (Traditional Chinese)",
    "notices": "Third-party sources & restrictions",
    "contact": "Licensing & rights enquiries",
    "playTitle": "Free play & personal backups",
    "play": "You may install, play and back up a lawfully obtained copy on devices you control, and share your own city saves. Free play and publicly visible source code do not grant an open-source license or permission to reproduce or sell the game.",
    "shareTitle": "Screenshots, guides & streams",
    "share": "Share official links, screenshots, guides, commentary and gameplay videos. For content the developer can license, videos and streams may earn advertising, subscription or viewer-support revenue. Credit The City of Heung Shing / 香城模擬器 and include the official link.",
    "musicTitle": "Check the audio before recording",
    "music": "The current background tracks were generated with Suno’s free plan. This game license does not grant commercial or monetized video/streaming rights to those tracks. Turn off the background music for monetized content and check the rights to any remaining audio. Recording a sound yourself does not automatically clear an underlying melody, broadcast or performance.",
    "reservedTitle": "Uses requiring separate permission",
    "reserved": "Reuploading installers, hosting mirrors, derivative games, ports, repackaging, resale, store listings and extracting proprietary assets for other uses require separate permission. Statutory rights, existing rights within GitHub and permissions under the original third-party licenses remain unaffected.",
    "thirdTitle": "Third-party assets & AI",
    "third": "Software retains its own licenses; the original Kenney road assets use CC0. Some models were generated with OpenAI tools; exclusive copyright is not claimed for every AI image. Landscape records also identify an Unsplash material. HKO sun/moon data needs source attribution. The exact permissions for almanac data, warning icons and Google Earth coastline sources remain under review; this page grants no additional commercial rights to them.",
    "softwareTitle": "Software & data credits",
    "software": "The game uses Express, electron-updater, Electron and Phaser; electron-builder and sharp are build tools. See the third-party notices for versions, original licenses and outstanding notice gaps. Original third-party terms take precedence over this summary.",
    "versionsTitle": "Versions & existing permissions",
    "versions": "These terms apply to source revisions and distributions published from 15 September 2026 that include them. They do not retroactively revoke valid permissions for older versions. Publishing this information does not change previously released installers.",
    "authority": "This page is a summary. The complete Traditional Chinese LICENSE is authoritative. Third-party rights and rights that cannot legally be excluded remain intact."
  },
  "ja": {
    "title": "著作権と利用条件",
    "metaTitle": "著作権と利用条件 | 香城模擬器",
    "intro": "無料で遊び、街の物語を紹介できます。ゲーム、動画、個別素材を利用する前に、それぞれの許可範囲をご確認ください。",
    "version": "ライセンス v1.0 · 2026年9月15日",
    "owner": "開発者 nortonyuen-oss が保有する、または許諾する権限を持つ部分に限り、権利を留保します。",
    "full": "正式なライセンス全文（繁体字中国語）",
    "notices": "第三者の出典と利用制限",
    "contact": "ライセンス・権利に関するお問い合わせ",
    "playTitle": "無料プレイと個人用バックアップ",
    "play": "適法に入手したゲームを、自分が管理する端末でインストール、プレイ、バックアップし、自分の都市セーブデータを共有できます。無料配布やソースコードの公開は、オープンソースの許諾や複製・販売の許可を意味しません。",
    "shareTitle": "スクリーンショット・攻略・配信",
    "share": "公式リンク、スクリーンショット、攻略、レビュー、プレイ動画の共有を歓迎します。開発者が許諾できる部分については、広告、定期購読、視聴者の支援による動画・配信の収益化も可能です。「The City of Heung Shing / 香城模擬器」と公式リンクを明記してください。",
    "musicTitle": "録画前に音声をご確認ください",
    "music": "現在のBGMはSunoの無料プランで生成されています。本ゲームの許諾には、これらの音源の商用利用や動画・配信の収益化権は含まれません。収益化する場合はBGMをオフにし、残る効果音などの権利も確認してください。自分で録音しても、含まれる楽曲、放送、実演の権利まで取得できるわけではありません。",
    "reservedTitle": "別途許可が必要な利用",
    "reserved": "インストーラーの再アップロード、ミラー配布、派生ゲーム、移植、再パッケージ、転売、ストアへの掲載、独自素材の抽出・転用には別途許可が必要です。法令上の権利、GitHub内の既存の権利、第三者の原ライセンスによる許可は制限しません。",
    "thirdTitle": "第三者素材とAI",
    "third": "各ソフトウェアには独自のライセンスが適用され、Kenneyの元の道路素材はCC0です。一部のモデルにはOpenAIの生成ツールを使用していますが、すべてのAI画像に排他的著作権があるとは主張しません。地形の記録にはUnsplash素材も含まれます。香港天文台の日月出没データには出典表示が必要です。年鑑、警報図示、Google Earth由来の海岸線の利用範囲は確認中で、本ページは追加の商用利用権を付与しません。",
    "softwareTitle": "ソフトウェアとデータの出典",
    "software": "ゲームはExpress、electron-updater、Electron、Phaserなどを使用し、electron-builderとsharpはビルド用です。バージョン、原ライセンス、未確認の通知については第三者声明をご覧ください。第三者の原文条件が本概要に優先します。",
    "versionsTitle": "適用バージョンと既存の許可",
    "versions": "本条件は2026年9月15日以降に公開され、本条件を含むソースコードの版および配布物に適用されます。旧版について有効に付与された許可を遡って取り消しません。この情報公開で、既存のインストーラーが変更されることはありません。",
    "authority": "本ページは概要です。繁体字中国語のLICENSE全文が正式な条項です。第三者の権利および法令上排除できない権利は留保されます。"
  }
};

for (const [language, content] of Object.entries(SITE_COPYRIGHT)) {
  SITE_TEXT[language].copyright = content;
  SITE_TEXT[language].nav.copyright = content.title;
}

const SITE_FEEDBACK = {
  "zh-HK": {
    "title": "香城連儂牆",
    "metaTitle": "香城連儂牆 | 香城模擬器",
    "intro": "下載或者遊玩時遇到問題？有新點子、感想想分享？喺呢度留言，同其他市民一齊改善香城。",
    "newPost": "寫低你嘅問題或意見",
    "publicNote": "毋須登入，寫好就可以貼上牆。留言同回覆會公開顯示；暱稱由留言者自行填寫。",
    "nickname": "暱稱（選填，毋須註冊）",
    "nicknameHint": "可以喺清單度揀個名，或者自己打都得。",
    "randomNickname": "隨機",
    "type": "留言類別",
    "bug": "問題回報",
    "question": "玩法疑問",
    "suggestion": "功能建議",
    "comment": "一般留言",
    "subject": "標題",
    "version": "遊戲版本（選填）",
    "platform": "作業系統",
    "other": "其他／不適用",
    "details": "內容",
    "detailsHelp": "回報問題時，請寫低發生咗乜事、重現步驟同預期結果。",
    "send": "貼上留言",
    "sending": "正在貼上…",
    "sent": "留言已經貼上牆，多謝你嘅聲音！",
    "sendError": "暫時貼唔到留言，請稍後重試。",
    "required": "請填寫標題同內容。",
    "invalid": "內容格式唔啱或者太長，請檢查後再試。",
    "limited": "留言太密啦：每分鐘最多一則、每小時最多五則，請等一陣再試。",
    "notConfigured": "留言後台尚未接駁，暫時未能讀取或發表留言。",
    "listTitle": "大家嘅留言",
    "filter": "處理狀態",
    "all": "全部",
    "open": "處理中",
    "closed": "已關閉",
    "refresh": "重新整理",
    "loading": "正在讀取留言…",
    "loaded": "展開每張 memo 可以讀全文同回覆，亦可以直接留低回覆。",
    "empty": "暫時未有符合篩選嘅留言。歡迎貼上第一張 memo。",
    "error": "暫時讀唔到留言，請稍後重試。",
    "page": "頁",
    "previous": "上一頁",
    "next": "下一頁",
    "readThread": "內容與回覆",
    "replies": "則回覆",
    "moreReplies": "載入更多回覆",
    "retry": "重試",
    "writeReply": "寫回覆",
    "sendReply": "貼上回覆",
    "replySent": "回覆已經貼上。",
    "anonymous": "匿名市民",
    "untitled": "未命名留言",
    "noBody": "未填寫內容。",
    "afterPost": "直接喺牆上留言、回覆，毋須登入。按「重新整理」睇最新留言。",
    "privacy": "請互相尊重，唔好貼密碼或私人資料。留言會公開儲存，管理者可以移除不適當內容。"
  },
  "zh-TW": {
    "title": "香城連儂牆",
    "metaTitle": "香城連儂牆 | 香城模擬器",
    "intro": "下載或遊玩時遇到問題？有新點子、感想想分享？在這裡留言，和其他市民一起改善香城。",
    "newPost": "寫下你的問題或意見",
    "publicNote": "不必登入，寫好就能貼上牆。留言與回覆會公開顯示；暱稱由留言者自行填寫。",
    "nickname": "暱稱（選填，不必註冊）",
    "nicknameHint": "可以在清單中選一個名字，或直接自己輸入。",
    "randomNickname": "隨機",
    "type": "留言類別",
    "bug": "問題回報",
    "question": "玩法疑問",
    "suggestion": "功能建議",
    "comment": "一般留言",
    "subject": "標題",
    "version": "遊戲版本（選填）",
    "platform": "作業系統",
    "other": "其他／不適用",
    "details": "內容",
    "detailsHelp": "回報問題時，請寫下發生的情況、重現步驟與預期結果。",
    "send": "貼上留言",
    "sending": "正在貼上…",
    "sent": "留言已經貼上牆，謝謝你的聲音！",
    "sendError": "暫時無法貼上留言，請稍後重試。",
    "required": "請填寫標題與內容。",
    "invalid": "內容格式不正確或太長，請檢查後再試。",
    "limited": "留言太頻繁了：每分鐘最多一則、每小時最多五則，請稍後再試。",
    "notConfigured": "留言後台尚未連接，暫時無法讀取或發表留言。",
    "listTitle": "大家的留言",
    "filter": "處理狀態",
    "all": "全部",
    "open": "處理中",
    "closed": "已關閉",
    "refresh": "重新整理",
    "loading": "正在讀取留言…",
    "loaded": "展開每張便利貼可以閱讀全文與回覆，也可以直接留下回覆。",
    "empty": "目前沒有符合篩選的留言。歡迎貼上第一張便利貼。",
    "error": "暫時無法讀取留言，請稍後重試。",
    "page": "頁",
    "previous": "上一頁",
    "next": "下一頁",
    "readThread": "內容與回覆",
    "replies": "則回覆",
    "moreReplies": "載入更多回覆",
    "retry": "重試",
    "writeReply": "寫回覆",
    "sendReply": "貼上回覆",
    "replySent": "回覆已經貼上。",
    "anonymous": "匿名市民",
    "untitled": "未命名留言",
    "noBody": "未填寫內容。",
    "afterPost": "直接在牆上留言、回覆，不必登入。按「重新整理」查看最新留言。",
    "privacy": "請互相尊重，不要貼上密碼或私人資料。留言會公開儲存，管理者可以移除不適當內容。"
  },
  "en": {
    "title": "Heung Shing Lennon Wall",
    "metaTitle": "Heung Shing Lennon Wall | The City of Heung Shing",
    "intro": "Trouble downloading or playing? Have an idea or a city story to share? Leave a message and help improve Heung Shing.",
    "newPost": "Write a question or comment",
    "publicNote": "No sign-in needed: write your note and stick it on the wall. Posts and replies are public; the nickname is whatever you choose to write.",
    "nickname": "Nickname (optional, no account needed)",
    "nicknameHint": "Pick a name from the list, or just type your own.",
    "randomNickname": "Random",
    "type": "Type",
    "bug": "Bug report",
    "question": "Gameplay question",
    "suggestion": "Feature suggestion",
    "comment": "General comment",
    "subject": "Title",
    "version": "Game version (optional)",
    "platform": "Operating system",
    "other": "Other / not applicable",
    "details": "Message",
    "detailsHelp": "For a bug, describe what happened, how to reproduce it and what you expected.",
    "send": "Stick it on the wall",
    "sending": "Posting…",
    "sent": "Your note is on the wall. Thank you for your voice!",
    "sendError": "Your note could not be posted right now. Please try again later.",
    "required": "Please enter a title and message.",
    "invalid": "The message is malformed or too long. Please check it and try again.",
    "limited": "Too many notes in a short time: one per minute and five per hour. Please wait and try again.",
    "notConfigured": "The message board backend is not connected yet, so notes cannot be read or posted.",
    "listTitle": "Community messages",
    "filter": "Status",
    "all": "All",
    "open": "Open",
    "closed": "Closed",
    "refresh": "Refresh",
    "loading": "Loading messages…",
    "loaded": "Expand a memo to read the full message and replies, or to leave a reply of your own.",
    "empty": "No messages match this filter yet. Be the first to leave a memo.",
    "error": "Messages could not be loaded. Please try again later.",
    "page": "Page",
    "previous": "Previous",
    "next": "Next",
    "readThread": "Message & replies",
    "replies": "replies",
    "moreReplies": "Load more replies",
    "retry": "Retry",
    "writeReply": "Write a reply",
    "sendReply": "Post reply",
    "replySent": "Your reply is on the wall.",
    "anonymous": "Anonymous citizen",
    "untitled": "Untitled message",
    "noBody": "No message body.",
    "afterPost": "Post and reply right here, no sign-in required. Select Refresh to load the latest messages.",
    "privacy": "Be respectful, and do not post passwords or personal information. Messages are stored publicly; the maintainer may remove inappropriate content."
  },
  "ja": {
    "title": "香城レノンウォール",
    "metaTitle": "香城レノンウォール | 香城模擬器",
    "intro": "ダウンロードやプレイで困っていますか？アイデアや感想も歓迎します。街のみなさんと一緒に香城をより良くしましょう。",
    "newPost": "質問・コメントを書く",
    "publicNote": "ログイン不要。書いたらそのまま壁に貼れます。投稿と返信は公開され、ニックネームは自由に記入できます。",
    "nickname": "ニックネーム（任意・登録不要）",
    "nicknameHint": "リストから名前を選ぶか、自分で入力してもOKです。",
    "randomNickname": "ランダム",
    "type": "種類",
    "bug": "不具合報告",
    "question": "遊び方の質問",
    "suggestion": "機能の提案",
    "comment": "一般のコメント",
    "subject": "タイトル",
    "version": "ゲームのバージョン（任意）",
    "platform": "OS",
    "other": "その他／該当なし",
    "details": "内容",
    "detailsHelp": "不具合の場合は、起きたこと、再現手順、期待した結果をご記入ください。",
    "send": "壁に貼る",
    "sending": "投稿中…",
    "sent": "付箋を壁に貼りました。ご意見ありがとうございます！",
    "sendError": "現在投稿できません。しばらくしてからもう一度お試しください。",
    "required": "タイトルと内容をご記入ください。",
    "invalid": "内容の形式が正しくないか、長すぎます。確認してもう一度お試しください。",
    "limited": "短時間に投稿が多すぎます。1分に1件、1時間に5件までです。少し待ってからもう一度お試しください。",
    "notConfigured": "掲示板のバックエンドが未接続のため、現在は閲覧・投稿できません。",
    "listTitle": "みなさんの投稿",
    "filter": "状態",
    "all": "すべて",
    "open": "対応中",
    "closed": "終了",
    "refresh": "更新",
    "loading": "投稿を読み込み中…",
    "loaded": "付箋を展開すると本文と返信を読めます。そのまま返信も書けます。",
    "empty": "この条件に一致する投稿はまだありません。最初の付箋を貼ってみませんか。",
    "error": "投稿を読み込めませんでした。後でもう一度お試しください。",
    "page": "ページ",
    "previous": "前へ",
    "next": "次へ",
    "readThread": "本文と返信",
    "replies": "件の返信",
    "moreReplies": "返信をさらに読み込む",
    "retry": "再試行",
    "writeReply": "返信を書く",
    "sendReply": "返信を貼る",
    "replySent": "返信を貼りました。",
    "anonymous": "匿名の市民",
    "untitled": "無題の投稿",
    "noBody": "本文はありません。",
    "afterPost": "ログイン不要で、この壁にそのまま投稿・返信できます。「更新」で最新の投稿を読み込めます。",
    "privacy": "互いを尊重し、パスワードや個人情報は投稿しないでください。投稿は公開で保存され、管理者が不適切な内容を削除することがあります。"
  }
};

const SITE_MEMO_WALL = {
  "zh-HK": {
    "wallTitle": "香城連儂牆",
    "wallIntro": "行過、停低，留低你嘅聲音。一張 memo，一齊寫出香城嘅日常。",
    "writeMemo": "貼一張 memo",
    "wallCaption": "每一張，都係香城嘅一把聲音。"
  },
  "zh-TW": {
    "wallTitle": "香城連儂牆",
    "wallIntro": "路過、停下，留下你的聲音。一張便利貼，一起寫下香城的日常。",
    "writeMemo": "貼一張便利貼",
    "wallCaption": "每一張，都是香城的一個聲音。"
  },
  "en": {
    "wallTitle": "Heung Shing Lennon Wall",
    "wallIntro": "Slow down. Leave a little of your day here. One note at a time, we make this city our own.",
    "writeMemo": "Leave a memo",
    "wallCaption": "A little piece of paper. A voice in our city."
  },
  "ja": {
    "wallTitle": "香城レノンウォール",
    "wallIntro": "立ち止まって、あなたの声を残そう。一枚の付箋から、香城の日常を一緒につづろう。",
    "writeMemo": "付箋を貼る",
    "wallCaption": "一枚一枚が、この街の声。"
  }
};

for (const [language, content] of Object.entries(SITE_FEEDBACK)) {
  Object.assign(content, SITE_MEMO_WALL[language]);
  SITE_TEXT[language].feedback = content;
  SITE_TEXT[language].nav.feedback = content.title;
}

// ── news.html: 官方新聞（相＋回應） ───────────────────────────────────────────
const SITE_NEWS = {
  "zh-HK": {
    "title": "香城討論區",
    "metaTitle": "香城討論區 | 香城模擬器",
    "eyebrow": "HEUNG SHING FORUM",
    "intro": "官方新聞同街坊自己開嘅帖一齊喺度出現，揀個分類睇睇，或者開個新帖同大家傾偈。",
    "forumNote": "留言、開帖同回應嘅 emoji，經版主批准之後，會喺遊戲入面嘅【香城討論區】出現。",
    "official": "官方",
    "categoryAll": "全部",
    "categoryCity": "城市發展",
    "categoryBuzz": "城中熱話",
    "categoryTransport": "交通台",
    "categoryChat": "吹水台",
    "newPostTitle": "開新帖",
    "category": "分類",
    "sendPost": "開帖",
    "postSent": "帖已經開咗，多謝你嘅分享！",
    "postRequired": "請填寫標題同內容。",
    "loading": "正在讀取…",
    "loaded": "展開回應可以睇晒同留低你自己嘅睇法。",
    "empty": "呢個分類暫時未有帖，你可以開第一個。",
    "error": "暫時讀唔到，請稍後重試。",
    "notConfigured": "討論區後台尚未接駁，暫時未能讀取。",
    "limited": "太密啦：每分鐘最多一次、每小時最多五次，請等一陣再試。",
    "invalid": "內容格式唔啱或者太長，請檢查後再試。",
    "unauthorized": "暫時未能讀取，請稍後重試。",
    "page": "頁",
    "untitled": "未命名帖",
    "readComments": "回應",
    "comments": "則回應",
    "anonymous": "匿名市民",
    "retry": "重試",
    "moreComments": "載入更多回應",
    "nickname": "暱稱（選填，毋須註冊）",
    "writeComment": "寫回應",
    "sending": "正在貼上…",
    "sendComment": "貼上回應",
    "required": "請填寫回應內容。",
    "commentSent": "回應已經貼上，多謝分享你嘅睇法！",
    "sendError": "暫時貼唔到，請稍後重試。",
    "headline": "標題",
    "body": "內文",
    "reactionLike": "Like",
    "reactionLaugh": "笑",
    "reactionAngry": "憎",
    "reactionShare": "分享",
    "reactionClown": "小丑",
    "reactionError": "呢下撳唔到，請稍後再試。",
    "noscript": "請啟用 JavaScript 以讀取及使用討論區。"
  },
  "zh-TW": {
    "title": "香城討論區",
    "metaTitle": "香城討論區 | 香城模擬器",
    "eyebrow": "HEUNG SHING FORUM",
    "intro": "官方新聞與街坊自己開的貼文一起出現在這裡，選個分類看看，或是開一則新貼文和大家聊聊。",
    "forumNote": "留言、開貼與回應的表情符號，經版主核准後，會出現在遊戲中的【香城討論區】。",
    "official": "官方",
    "categoryAll": "全部",
    "categoryCity": "城市發展",
    "categoryBuzz": "城中熱話",
    "categoryTransport": "交通台",
    "categoryChat": "吹水台",
    "newPostTitle": "開新貼文",
    "category": "分類",
    "sendPost": "發布",
    "postSent": "貼文已發布，謝謝你的分享！",
    "postRequired": "請填寫標題與內容。",
    "loading": "正在讀取…",
    "loaded": "展開回應可以看到全部留言，也能留下你的看法。",
    "empty": "此分類目前尚無貼文，歡迎開第一則。",
    "error": "暫時無法讀取，請稍後重試。",
    "notConfigured": "討論區後台尚未連接，暫時無法讀取。",
    "limited": "太頻繁了：每分鐘最多一次、每小時最多五次，請稍後再試。",
    "invalid": "內容格式不正確或太長，請檢查後再試。",
    "unauthorized": "暫時無法讀取，請稍後重試。",
    "page": "頁",
    "untitled": "未命名貼文",
    "readComments": "回應",
    "comments": "則回應",
    "anonymous": "匿名市民",
    "retry": "重試",
    "moreComments": "載入更多回應",
    "nickname": "暱稱（選填，不必註冊）",
    "writeComment": "寫回應",
    "sending": "正在貼上…",
    "sendComment": "貼上回應",
    "required": "請填寫回應內容。",
    "commentSent": "回應已經貼上，謝謝你的分享！",
    "sendError": "暫時無法貼上，請稍後重試。",
    "headline": "標題",
    "body": "內文",
    "reactionLike": "讚",
    "reactionLaugh": "笑",
    "reactionAngry": "怒",
    "reactionShare": "分享",
    "reactionClown": "小丑",
    "reactionError": "這個動作暫時無法完成，請稍後再試。",
    "noscript": "請啟用 JavaScript 以讀取及使用討論區。"
  },
  "en": {
    "title": "Heung Shing Forum",
    "metaTitle": "Heung Shing Forum | The City of Heung Shing",
    "eyebrow": "HEUNG SHING FORUM",
    "intro": "Official news and posts from fellow citizens show up together here. Pick a category to browse, or start a post of your own.",
    "forumNote": "Comments, new posts and emoji reactions all reach the game's Heung Shing Forum once the moderator approves them.",
    "official": "Official",
    "categoryAll": "All",
    "categoryCity": "City Development",
    "categoryBuzz": "City Buzz",
    "categoryTransport": "Transport",
    "categoryChat": "Off-topic",
    "newPostTitle": "Start a post",
    "category": "Category",
    "sendPost": "Post",
    "postSent": "Your post is up. Thanks for sharing!",
    "postRequired": "Please write a headline and a body.",
    "loading": "Loading…",
    "loaded": "Expand a story's replies to read them all, or to leave one of your own.",
    "empty": "Nothing in this category yet. Be the first to post.",
    "error": "Could not be loaded. Please try again later.",
    "notConfigured": "The forum backend is not connected yet, so nothing can be read right now.",
    "limited": "Too many in a short time: one per minute and five per hour. Please wait and try again.",
    "invalid": "The content is malformed or too long. Please check it and try again.",
    "unauthorized": "Could not load this right now. Please try again later.",
    "page": "Page",
    "untitled": "Untitled post",
    "readComments": "Replies",
    "comments": "replies",
    "anonymous": "Anonymous citizen",
    "retry": "Retry",
    "moreComments": "Load more replies",
    "nickname": "Nickname (optional, no account needed)",
    "writeComment": "Write a reply",
    "sending": "Posting…",
    "sendComment": "Post reply",
    "required": "Please write a reply first.",
    "commentSent": "Your reply is posted. Thanks for weighing in!",
    "sendError": "Could not be posted right now. Please try again later.",
    "headline": "Headline",
    "body": "Body",
    "reactionLike": "Like",
    "reactionLaugh": "Laugh",
    "reactionAngry": "Angry",
    "reactionShare": "Share",
    "reactionClown": "Clown",
    "reactionError": "That didn't go through. Please try again later.",
    "noscript": "Enable JavaScript to read and use the forum."
  },
  "ja": {
    "title": "香城討論区",
    "metaTitle": "香城討論区 | 香城模擬器",
    "eyebrow": "HEUNG SHING FORUM",
    "intro": "公式ニュースと市民の投稿がここに一緒に表示されます。カテゴリーを選んで見るか、新しい投稿を始めましょう。",
    "forumNote": "コメント、新規投稿、絵文字リアクションはすべて、モデレーターの承認後にゲーム内の香城討論区に反映されます。",
    "official": "公式",
    "categoryAll": "すべて",
    "categoryCity": "都市開発",
    "categoryBuzz": "街の話題",
    "categoryTransport": "交通板",
    "categoryChat": "雑談板",
    "newPostTitle": "新しい投稿",
    "category": "カテゴリー",
    "sendPost": "投稿する",
    "postSent": "投稿しました。シェアありがとうございます！",
    "postRequired": "見出しと本文を入力してください。",
    "loading": "読み込み中…",
    "loaded": "返信を開いて全部読んだり、自分の意見を残したりできます。",
    "empty": "このカテゴリーにはまだ投稿がありません。最初の1件を投稿してみましょう。",
    "error": "読み込めませんでした。しばらくして再度お試しください。",
    "notConfigured": "フォーラムの裏側がまだ接続されていないため、現在読み込めません。",
    "limited": "投稿の間隔が短すぎます：1分に1件、1時間に5件までです。しばらくしてから再度お試しください。",
    "invalid": "内容の形式が正しくないか長すぎます。確認してもう一度お試しください。",
    "unauthorized": "読み込めませんでした。しばらくして再度お試しください。",
    "page": "ページ",
    "untitled": "無題の投稿",
    "readComments": "返信",
    "comments": "件の返信",
    "anonymous": "匿名の市民",
    "retry": "再試行",
    "moreComments": "返信をさらに読み込む",
    "nickname": "ニックネーム（任意・登録不要）",
    "writeComment": "返信を書く",
    "sending": "投稿中…",
    "sendComment": "返信を投稿",
    "required": "返信内容を入力してください。",
    "commentSent": "返信を投稿しました。ご意見ありがとうございます！",
    "sendError": "投稿できませんでした。しばらくして再度お試しください。",
    "headline": "見出し",
    "body": "本文",
    "reactionLike": "いいね",
    "reactionLaugh": "笑い",
    "reactionAngry": "怒り",
    "reactionShare": "シェア",
    "reactionClown": "ピエロ",
    "reactionError": "反応を送れませんでした。しばらくして再度お試しください。",
    "noscript": "フォーラムを利用するには JavaScript を有効にしてください。"
  }
};
for (const [language, content] of Object.entries(SITE_NEWS)) {
  SITE_TEXT[language].news = content;
  SITE_TEXT[language].nav.news = content.title;
}

// ── ads.html: 宣傳2-零速傳播（前稱香城廣告街）────────────────────────────────
const SITE_ADS = {
  "zh-HK": {
    "title": "宣傳2-零速傳播",
    "metaTitle": "宣傳2-零速傳播 | 香城模擬器",
    "eyebrow": "PROMO 2 · ZERO-SPEED SPREAD",
    "intro": "落一則廣告，等版主批准之後，就會喺遊戲入面嘅新聞走馬燈度出現，同其他香城品牌一齊輪流播放。",
    "newAd": "落一則廣告",
    "publicNote": "毋須登入。廣告會即刻喺呢頁見到；批准後先會喺遊戲入面播放。",
    "text": "廣告內容（一句就夠）",
    "textHelp": "走馬燈得一行位，盡量精簡；最多 120 字。",
    "send": "貼上宣傳2",
    "listTitle": "街坊廣告牌",
    "tickerAriaLabel": "街坊廣告走馬燈",
    "noscript": "請啟用 JavaScript 以讀取及提交廣告。",
    "loading": "正在讀取廣告…",
    "loaded": "以下係街坊貼咗嘅廣告，未必每則都獲批准入遊戲。",
    "empty": "暫時未有廣告，你可以貼第一則。",
    "error": "暫時讀唔到廣告，請稍後重試。",
    "notConfigured": "宣傳2後台尚未接駁，暫時未能讀取或提交。",
    "limited": "貼得太密啦：每分鐘最多一則、每小時最多五則，請等一陣再試。",
    "invalid": "內容格式唔啱或者太長，請檢查後再試。",
    "required": "請填寫廣告內容。",
    "sending": "正在貼上…",
    "sent": "廣告已經貼上，多謝支持宣傳2！",
    "sendError": "暫時貼唔到廣告，請稍後重試。"
  },
  "zh-TW": {
    "title": "宣傳2-零速傳播",
    "metaTitle": "宣傳2-零速傳播 | 香城模擬器",
    "eyebrow": "PROMO 2 · ZERO-SPEED SPREAD",
    "intro": "投一則廣告，經版主核准後，就會出現在遊戲的新聞跑馬燈，與其他香城品牌輪流播放。",
    "newAd": "投一則廣告",
    "publicNote": "不必登入。廣告會立即在此頁顯示；核准後才會在遊戲中播放。",
    "text": "廣告內容（一句就夠）",
    "textHelp": "跑馬燈只有一行空間，請盡量精簡；最多 120 字。",
    "send": "貼上宣傳2",
    "listTitle": "街坊廣告牌",
    "tickerAriaLabel": "街坊廣告跑馬燈",
    "noscript": "請啟用 JavaScript 以讀取及提交廣告。",
    "loading": "正在讀取廣告…",
    "loaded": "以下是街坊貼出的廣告，不一定每則都會核准進入遊戲。",
    "empty": "目前尚無廣告，歡迎貼出第一則。",
    "error": "暫時無法讀取廣告，請稍後重試。",
    "notConfigured": "宣傳2後台尚未連接，暫時無法讀取或提交。",
    "limited": "投放太頻繁了：每分鐘最多一則、每小時最多五則，請稍後再試。",
    "invalid": "內容格式不正確或太長，請檢查後再試。",
    "required": "請填寫廣告內容。",
    "sending": "正在貼上…",
    "sent": "廣告已經貼上，謝謝支持宣傳2！",
    "sendError": "暫時無法貼上廣告，請稍後重試。"
  },
  "en": {
    "title": "Promo 2 – Zero-Speed Spread",
    "metaTitle": "Promo 2 – Zero-Speed Spread | The City of Heung Shing",
    "eyebrow": "PROMO 2 · ZERO-SPEED SPREAD",
    "intro": "Submit an ad, and once the moderator approves it, it'll rotate through the in-game news ticker alongside the other Heung Shing brands.",
    "newAd": "Submit an ad",
    "publicNote": "No sign-in needed. Your ad shows on this page right away; it only reaches the game once approved.",
    "text": "Ad copy (one line is enough)",
    "textHelp": "The ticker only has room for one line — keep it short. 120 characters max.",
    "send": "Post to Promo 2",
    "listTitle": "Community ad board",
    "tickerAriaLabel": "Community ad ticker",
    "noscript": "Enable JavaScript to read and submit ads.",
    "loading": "Loading ads…",
    "loaded": "These are the ads the community has posted — not all of them are approved for the game yet.",
    "empty": "No ads yet. Be the first to post one.",
    "error": "Ads could not be loaded. Please try again later.",
    "notConfigured": "The Promo 2 backend is not connected yet, so ads cannot be read or posted.",
    "limited": "Too many ads in a short time: one per minute and five per hour. Please wait and try again.",
    "invalid": "The ad is malformed or too long. Please check it and try again.",
    "required": "Please write your ad copy.",
    "sending": "Posting…",
    "sent": "Your ad is posted. Thanks for supporting Promo 2!",
    "sendError": "Your ad could not be posted right now. Please try again later."
  },
  "ja": {
    "title": "プロモ2・ゼロ速拡散",
    "metaTitle": "プロモ2・ゼロ速拡散 | 香城模擬器",
    "eyebrow": "PROMO 2 · ZERO-SPEED SPREAD",
    "intro": "広告を投稿すると、モデレーターの承認後にゲーム内のニュースティッカーで他の香城ブランドと一緒に流れます。",
    "newAd": "広告を投稿する",
    "publicNote": "ログイン不要。広告はこのページにすぐ表示されます。ゲームに反映されるのは承認後です。",
    "text": "広告文（一言でOK）",
    "textHelp": "ティッカーは1行分のスペースしかないので簡潔に。最大120文字。",
    "send": "プロモ2に投稿",
    "listTitle": "市民の広告掲示板",
    "tickerAriaLabel": "市民広告のティッカー",
    "noscript": "広告の閲覧・投稿には JavaScript を有効にしてください。",
    "loading": "広告を読み込み中…",
    "loaded": "以下は市民が投稿した広告です。すべてがゲームに承認されているとは限りません。",
    "empty": "まだ広告はありません。最初の1件を投稿してみましょう。",
    "error": "広告を読み込めませんでした。しばらくして再度お試しください。",
    "notConfigured": "プロモ2の裏側がまだ接続されていないため、現在読み込みや投稿ができません。",
    "limited": "投稿の間隔が短すぎます：1分に1件、1時間に5件までです。しばらくしてから再度お試しください。",
    "invalid": "内容の形式が正しくないか長すぎます。確認してもう一度お試しください。",
    "required": "広告内容を入力してください。",
    "sending": "投稿中…",
    "sent": "広告を投稿しました。プロモ2へのご協力ありがとうございます！",
    "sendError": "現在広告を投稿できません。しばらくして再度お試しください。"
  }
};
for (const [language, content] of Object.entries(SITE_ADS)) {
  SITE_TEXT[language].ads = content;
  SITE_TEXT[language].nav.ads = content.title;
}

// ── moderate.html: 版主專區（唔喺導覽列出現，冇 nav.moderate） ──────────────
const SITE_MODERATE = {
  "zh-HK": {
    "title": "版主專區",
    "eyebrow": "MODERATOR",
    "intro": "批准／隱藏討論區內容，發佈官方新聞。呢頁唔會喺導覽列出現，密碼由 Cloudflare Worker secret 管理。",
    "loginTitle": "版主登入",
    "password": "密碼",
    "login": "登入",
    "logout": "登出",
    "loggingIn": "登入緊…",
    "loggedIn": "已登入。",
    "wrongPassword": "密碼唔啱，請再試。",
    "limited": "登入嘗試太多次，請一個鐘之後再試。",
    "sessionExpired": "登入已經過期，請重新登入。",
    "publishTitle": "發佈新聞",
    "newsImage": "新聞相（選填，jpg／png／webp，5MB 內）",
    "publish": "發佈",
    "publishing": "發佈緊…",
    "published": "新聞已經發佈！",
    "publishError": "暫時發佈唔到，請檢查相片格式／大小同登入狀態，再試一次。",
    "required": "請填寫標題同內文。",
    "queuePosts": "待批准：討論區 post",
    "queueComments": "待批准：討論區回覆",
    "queueNewsComments": "待批准：新聞回應",
    "queueAds": "待批准：宣傳2",
    "loading": "載入緊…",
    "queueEmpty": "暫時冇待批准項目。",
    "queueError": "暫時讀唔到，請稍後重試。",
    "approve": "批准入遊戲",
    "hide": "隱藏",
    "noscript": "請啟用 JavaScript 以使用版主專區。"
  },
  "zh-TW": {
    "title": "版主專區",
    "eyebrow": "MODERATOR",
    "intro": "核准／隱藏討論區內容，發布官方新聞。此頁不會出現在導覽列，密碼由 Cloudflare Worker secret 管理。",
    "loginTitle": "版主登入",
    "password": "密碼",
    "login": "登入",
    "logout": "登出",
    "loggingIn": "登入中…",
    "loggedIn": "已登入。",
    "wrongPassword": "密碼不正確，請再試一次。",
    "limited": "登入嘗試次數過多，請一小時後再試。",
    "sessionExpired": "登入已過期，請重新登入。",
    "publishTitle": "發布新聞",
    "newsImage": "新聞相片（選填，jpg／png／webp，5MB 以內）",
    "publish": "發布",
    "publishing": "發布中…",
    "published": "新聞已經發布！",
    "publishError": "暫時無法發布，請檢查圖片格式／大小與登入狀態後再試一次。",
    "required": "請填寫標題與內文。",
    "queuePosts": "待核准：討論區貼文",
    "queueComments": "待核准：討論區回覆",
    "queueNewsComments": "待核准：新聞回應",
    "queueAds": "待核准：宣傳2",
    "loading": "載入中…",
    "queueEmpty": "目前沒有待核准項目。",
    "queueError": "暫時無法讀取，請稍後重試。",
    "approve": "核准進入遊戲",
    "hide": "隱藏",
    "noscript": "請啟用 JavaScript 以使用版主專區。"
  },
  "en": {
    "title": "Moderator",
    "eyebrow": "MODERATOR",
    "intro": "Approve or hide community content, and publish official news. This page is not linked from the navigation; the password is managed as a Cloudflare Worker secret.",
    "loginTitle": "Moderator sign-in",
    "password": "Password",
    "login": "Sign in",
    "logout": "Sign out",
    "loggingIn": "Signing in…",
    "loggedIn": "Signed in.",
    "wrongPassword": "That password is not correct. Please try again.",
    "limited": "Too many sign-in attempts. Please try again in an hour.",
    "sessionExpired": "Your session expired. Please sign in again.",
    "publishTitle": "Publish news",
    "newsImage": "News photo (optional, jpg/png/webp, up to 5MB)",
    "publish": "Publish",
    "publishing": "Publishing…",
    "published": "The story is live!",
    "publishError": "Could not publish right now — check the photo's format/size and that you're still signed in, then try again.",
    "required": "Please fill in a headline and a story.",
    "queuePosts": "Pending: forum posts",
    "queueComments": "Pending: forum replies",
    "queueNewsComments": "Pending: news replies",
    "queueAds": "Pending: Promo 2",
    "loading": "Loading…",
    "queueEmpty": "Nothing pending right now.",
    "queueError": "Could not load this. Please try again later.",
    "approve": "Approve for the game",
    "hide": "Hide",
    "noscript": "Enable JavaScript to use the moderator dashboard."
  },
  "ja": {
    "title": "モデレーター専用ページ",
    "eyebrow": "MODERATOR",
    "intro": "コミュニティの投稿を承認・非表示にし、公式ニュースを公開します。このページはナビゲーションに表示されません。パスワードは Cloudflare Worker のシークレットとして管理されています。",
    "loginTitle": "モデレーターログイン",
    "password": "パスワード",
    "login": "ログイン",
    "logout": "ログアウト",
    "loggingIn": "ログイン中…",
    "loggedIn": "ログイン済みです。",
    "wrongPassword": "パスワードが正しくありません。もう一度お試しください。",
    "limited": "ログイン試行回数が多すぎます。1時間後に再度お試しください。",
    "sessionExpired": "セッションの有効期限が切れました。再度ログインしてください。",
    "publishTitle": "ニュースを公開",
    "newsImage": "ニュース写真（任意・jpg／png／webp・5MBまで）",
    "publish": "公開する",
    "publishing": "公開中…",
    "published": "ニュースを公開しました！",
    "publishError": "現在公開できません。画像の形式・サイズとログイン状態を確認して、もう一度お試しください。",
    "required": "見出しと本文を入力してください。",
    "queuePosts": "承認待ち：フォーラム投稿",
    "queueComments": "承認待ち：フォーラム返信",
    "queueNewsComments": "承認待ち：ニュースへの返信",
    "queueAds": "承認待ち：プロモ2",
    "loading": "読み込み中…",
    "queueEmpty": "現在、承認待ちの項目はありません。",
    "queueError": "読み込めませんでした。しばらくして再度お試しください。",
    "approve": "ゲームに承認",
    "hide": "非表示にする",
    "noscript": "モデレーター専用ページの利用には JavaScript を有効にしてください。"
  }
};
for (const [language, content] of Object.entries(SITE_MODERATE)) {
  SITE_TEXT[language].moderate = content;
}

// ── member.html: 香城街坊福利會（additive — 唔登記一樣可以自由用討論區）───────────
const SITE_MEMBER = {
  "zh-HK": {
    "title": "香城街坊福利會",
    "metaTitle": "香城街坊福利會 | 香城模擬器",
    "eyebrow": "NEIGHBOURHOOD ASSOCIATION",
    "intro": "唔登記一樣可以自由喺【香城討論區】發帖、留言、俾 emoji 回應——登記淨係俾你一個固定嘅街坊身份，日後福利會再加福利都係喺呢個身份上面加。",
    "joinTitle": "登記 / 登入",
    "registerTab": "登記",
    "loginTab": "登入",
    "username": "街坊名（2-24 字，中英文數字都得）",
    "password": "密碼（最少 8 個字）",
    "confirmPassword": "確認密碼",
    "noEmailNote": "冇用 email 註冊，忘記密碼冇得重設，記得自己記低。",
    "registerSubmit": "登記做街坊",
    "loginSubmit": "登入",
    "noscript": "請啟用 JavaScript 以登記或登入。",
    "cardTitle": "街坊帳戶",
    "cardNote": "日後福利會嘅新功能會喺呢度出現。",
    "logout": "登出",
    "memberSince": "加入日期：",
    "registering": "登記緊…",
    "loggingIn": "登入緊…",
    "passwordMismatch": "兩次密碼唔一致。",
    "wrongCredentials": "街坊名或者密碼唔啱，請再試。",
    "conflict": "呢個街坊名有人用咗，請換一個。",
    "invalid": "格式唔啱，請檢查後再試。",
    "limited": "太密啦，請等一陣再試。",
    "notConfigured": "後台尚未接駁，暫時未能登記或登入。",
    "registerError": "暫時登記唔到，請稍後重試。",
    "loginError": "暫時登入唔到，請稍後重試。"
  },
  "zh-TW": {
    "title": "香城街坊福利會",
    "metaTitle": "香城街坊福利會 | 香城模擬器",
    "eyebrow": "NEIGHBOURHOOD ASSOCIATION",
    "intro": "不註冊一樣可以自由在【香城討論區】發文、留言、給予 emoji 回應——註冊只是給你一個固定的街坊身份，日後福利會再加福利都是在這個身份上面加。",
    "joinTitle": "註冊 / 登入",
    "registerTab": "註冊",
    "loginTab": "登入",
    "username": "街坊名（2-24 字，中英文數字都可以）",
    "password": "密碼（最少 8 個字）",
    "confirmPassword": "確認密碼",
    "noEmailNote": "沒有使用 email 註冊，忘記密碼無法重設，請自行記住。",
    "registerSubmit": "註冊做街坊",
    "loginSubmit": "登入",
    "noscript": "請啟用 JavaScript 以註冊或登入。",
    "cardTitle": "街坊帳戶",
    "cardNote": "日後福利會的新功能會出現在這裡。",
    "logout": "登出",
    "memberSince": "加入於",
    "registering": "註冊中…",
    "loggingIn": "登入中…",
    "passwordMismatch": "兩次密碼不一致。",
    "wrongCredentials": "街坊名或密碼不正確，請再試一次。",
    "conflict": "這個街坊名已經有人使用，請換一個。",
    "invalid": "格式不正確，請檢查後再試。",
    "limited": "太頻繁了，請稍後再試。",
    "notConfigured": "後台尚未連接，暫時無法註冊或登入。",
    "registerError": "暫時無法註冊，請稍後重試。",
    "loginError": "暫時無法登入，請稍後重試。"
  },
  "en": {
    "title": "Heung Shing Neighbourhood Association",
    "metaTitle": "Neighbourhood Association | The City of Heung Shing",
    "eyebrow": "NEIGHBOURHOOD ASSOCIATION",
    "intro": "You don't need to join to post, comment or react in the Heung Shing Forum — joining just gives you a fixed neighbour identity that future Association perks will build on.",
    "joinTitle": "Join / Sign in",
    "registerTab": "Join",
    "loginTab": "Sign in",
    "username": "Neighbour name (2-24 characters, any script)",
    "password": "Password (8+ characters)",
    "confirmPassword": "Confirm password",
    "noEmailNote": "No email is used to register, so a forgotten password can't be reset — keep it somewhere safe.",
    "registerSubmit": "Join the Association",
    "loginSubmit": "Sign in",
    "noscript": "Enable JavaScript to join or sign in.",
    "cardTitle": "Your account",
    "cardNote": "Future Association features will appear here.",
    "logout": "Sign out",
    "memberSince": "Member since",
    "registering": "Joining…",
    "loggingIn": "Signing in…",
    "passwordMismatch": "The two passwords don't match.",
    "wrongCredentials": "That neighbour name or password isn't right. Please try again.",
    "conflict": "That neighbour name is already taken. Please pick another.",
    "invalid": "That's not a valid format. Please check it and try again.",
    "limited": "Too many attempts in a short time. Please wait and try again.",
    "notConfigured": "The backend is not connected yet, so you can't join or sign in right now.",
    "registerError": "Could not join right now. Please try again later.",
    "loginError": "Could not sign in right now. Please try again later."
  },
  "ja": {
    "title": "香城街坊福利会",
    "metaTitle": "香城街坊福利会 | 香城模擬器",
    "eyebrow": "NEIGHBOURHOOD ASSOCIATION",
    "intro": "登録しなくても【香城討論区】で自由に投稿・コメント・絵文字リアクションができます——登録すると固定の街坊（隣人）アイデンティティが手に入り、今後の福利会の特典はこの上に追加されていきます。",
    "joinTitle": "登録 / ログイン",
    "registerTab": "登録",
    "loginTab": "ログイン",
    "username": "街坊名（2〜24文字、言語は問いません）",
    "password": "パスワード（8文字以上）",
    "confirmPassword": "パスワード確認",
    "noEmailNote": "メールアドレスは使用していないため、パスワードを忘れても再設定できません。大切に保管してください。",
    "registerSubmit": "街坊として登録",
    "loginSubmit": "ログイン",
    "noscript": "登録・ログインには JavaScript を有効にしてください。",
    "cardTitle": "街坊アカウント",
    "cardNote": "今後の福利会の新機能はここに表示されます。",
    "logout": "ログアウト",
    "memberSince": "登録日：",
    "registering": "登録中…",
    "loggingIn": "ログイン中…",
    "passwordMismatch": "パスワードが一致しません。",
    "wrongCredentials": "街坊名またはパスワードが正しくありません。もう一度お試しください。",
    "conflict": "その街坊名はすでに使われています。別の名前をお試しください。",
    "invalid": "形式が正しくありません。確認してもう一度お試しください。",
    "limited": "試行回数が多すぎます。しばらくして再度お試しください。",
    "notConfigured": "裏側がまだ接続されていないため、現在登録・ログインできません。",
    "registerError": "現在登録できません。しばらくして再度お試しください。",
    "loginError": "現在ログインできません。しばらくして再度お試しください。"
  }
};
for (const [language, content] of Object.entries(SITE_MEMBER)) {
  SITE_TEXT[language].member = content;
  SITE_TEXT[language].nav.member = content.title;
}

// ── Full game guide page content ─────────────────────────────────────────────
// Structured as sections of typed blocks so guide.html can render it
// generically: { type: 'p' }, { type: 'ul', items }, { type: 'table', head, rows }.
const SITE_GUIDE = {
  "zh-HK": {
    metaTitle: "遊戲指南 | 香城模擬器",
    metaDescription: "香城模擬器完整遊戲規則指南：分區密度、經濟稅收、立法會、天氣颱風、特殊建築解鎖同交通系統一次睇晒。",
    pageTitle: "遊戲指南",
    pageIntro: "呢頁詳細講解香城模擬器嘅所有核心機制——由分區起樓到立法會投票，由股市炒賣到八號風球。想快速查建築解鎖數值，可以直接跳到",
    pageIntroManualLink: "特殊建築解鎖規格",
    pageIntroSuffix: "。",
    toc: "目錄",
    sections: [
      {
        id: "zoning",
        title: "一、分區基礎",
        blocks: [
          { type: "p", text: "香城分三種分區：住宅（Residential）、商業（Commercial）、工業（Industrial）。喺空地上用分區工具塗色，就會將嗰格地劃為對應用途；起樓、加人口、加就業全部由遊戲自動喺已劃分區度自然生成，玩家唔使逐座手動起。" },
          { type: "h3", text: "密度：低／中／高" },
          { type: "p", text: "每種分區劃地嗰陣都要揀密度，密度會影響三樣嘢——起樓成本、發展速度，同每座樓最終容納幾多人／幾多間舖：" },
          { type: "table", head: ["密度", "劃地成本倍數", "發展速度倍數", "人口／規模倍數"], rows: [
            ["低密度", "×1.0", "×1.0（最快起）", "×1.0"],
            ["中密度", "×1.5", "×0.65", "×2.5"],
            ["高密度", "×2.5", "×0.40（最慢起）", "×6.0"],
          ] },
          { type: "p", text: "留意密度愈高，起樓速度反而愈慢——但一旦起成，一座樓可以容納嘅人口／規模會大幅拋離低密度。呢個設計令高密度區起樓有種「慢慢等,起成就係地標」嘅感覺。" },
          { type: "h3", text: "低密度規劃永久鎖定" },
          { type: "p", text: "呢個係 v3.9.0 新增嘅規則：一幅地一經玩家劃為低密度住宅，就會被永久記錄低密度身份——之後無論你點樣剷平重劃、轉做其他用途，呢幅地都唔可以再改劃做中／高密度住宅。呢個限制淨係單向生效（低密度唔可以升，但中密度同高密度之間冇呢個限制），亦唔影響商業或工業分區。" },
          { type: "p", text: "設計原因：低密度住宅刻意只用 1×1 嘅村屋、祠堂、別墅呢類建築（唔會好似中高密度咁起返成座屋邨），永久鎖定就係要保證呢啲低層社區永遠唔會被起樓起到變返屋邨。" },
          { type: "h3", text: "自然合併大 footprint" },
          { type: "p", text: "分區起樓唔一定係 1×1。當條件夾埋（密度、地皮質素、附近有冇同類建築），幾格相鄰嘅同區地皮有機會自然合併成 2×2、3×3，甚至 4×4／5×5 嘅大型建築——呢個係遊戲自動判斷，唔使玩家手動操作。" },
        ],
      },
      {
        id: "growth",
        title: "二、城市發展與建築等級",
        blocks: [
          { type: "p", text: "每個遊戲 tick，未起樓嘅已劃分區地皮都有機會按需求自動起樓；已經起咗嘅樓亦會按情況升級（1→2→3 級）或者衰落。" },
          { type: "h3", text: "需求（Demand）點計" },
          { type: "p", text: "住宅、商業、工業各自有一條 -1 至 +1 嘅需求線，數值愈高、起樓／升級機會愈大：" },
          { type: "ul", items: [
            "住宅需求：主要睇「就業拉力」（附近職位夠唔夠住嘅人做），會被失業率、疫情、醫院爆滿、交通擠塞（大於四成先計）、電力短缺同高於 9% 嘅稅率拖低；快樂指數、綠化公園同修路政策會加分。",
            "商業需求：睇「消費缺口」（住咗幾多人但舖頭夠唔夠），加埋高學歷勞動力供過於求、人口規模、教育水平、法治指數，同小商戶／外資／旅遊推廣等政策加分；股票交易所存在仲會額外加分。",
            "工業需求：分傳統工業同科學園兩條軌，分別睇低學歷、高學歷勞動力供過於求，會被污染拖低，被科研發展、活化工廈、強國製造等政策加分。",
          ] },
          { type: "h3", text: "起樓機率" },
          { type: "p", text: "每格空置已劃分區地皮，每 tick 嘅起樓機率大約係：需求 × 基礎起樓率(0.4) × 供電倍數 × 密度發展倍數 × 地皮質素倍數。冇電嘅地皮發展會慢好多；地皮質素（受地價、景觀、環境等影響）愈高，發展愈快。起樓仲需要附近有路（大約 3 格範圍內）先得。" },
          { type: "h3", text: "升級同衰落" },
          { type: "p", text: "已經起咗嘅樓可以由 1 級升到 3 級，升級機率同上面類似，但商業升級主要睇地皮質素（唔一定要商業需求好），住宅同工業就仲需要有返一定需求先會升級。" },
          { type: "p", text: "相反，冇連接道路，或者所屬分區需求跌到好低（低於 -0.5）嘅樓，就有機會衰落甚至消失。呢個評估係每個遊戲月先做一次（唔係每 tick），並且每個月最多影響有限數量嘅建築，避免一次停電就整個城市「清袋」。" },
          { type: "h3", text: "L／M／H／UH 財富等級" },
          { type: "p", text: "住宅同商業建築各自有四級「財富」外觀：L（大眾／公共）、M（一般私人）、H（高級）、UH（頂級地標）。邊格地起邊個等級，睇嗰格地嘅「綜合質素」（地價、景觀、環境、經濟、健康等加權），質素愈高，抽中 M／H 嘅機會愈大，但 L 喺任何質素區間都維持大宗——即使地皮質素滿分，都仲有一半機會出 L，向香港以公共／大眾房屋為主嘅真實房屋分佈睇齊。" },
          { type: "p", text: "UH 級極度罕見：住宅 UH 淨係喺低密度嘅特殊 3×3 莊園地皮先有機會出現（代表歐式大宅），商業 UH 就淨係高密度、同時附近有股票交易所同機場先解鎖（代表匯豐總行、中銀大廈呢類全城獨一無二嘅地標，冇數量上限，但條件極難齊集）。" },
        ],
      },
      {
        id: "economy",
        title: "三、經濟：稅收、預算、貸款、股市",
        blocks: [
          { type: "h3", text: "稅率同收入" },
          { type: "p", text: "稅率可以喺 4% 至 20% 之間調整，預設 9%。每個住宅居民、每座商業／工業建築都會按稅率貢獻月收入，稅率愈高抽得愈多，但都會拖低住宅需求同快樂指數，要自己搵平衡。" },
          { type: "h3", text: "部門撥款" },
          { type: "p", text: "道路、警察、消防、公園四個部門各自有 50% 至 150% 嘅撥款滑桿，直接影響嗰個部門嘅維修／服務開支，同埋間接影響治安、消防覆蓋等城市指標。" },
          { type: "h3", text: "貸款同信貸評級" },
          { type: "p", text: "資金唔夠可以借貸款，有三種固定方案（$5,000／36 個月／8% 年利率、$10,000／48 個月／10%、$25,000／60 個月／12%），每月自動還款，還清會自動消失。信貸評級 A／B／C／D 按總負債同月收入嘅比例計算，評級會影響玩家對城市財政狀況嘅判斷。" },
          { type: "p", text: "如果預算跌穿 $0，城市會被標記為「破產」狀態並彈出警告，但呢個淨係狀態提示，唔係遊戲直接結束——預算返回正數就會自動解除。" },
          { type: "h3", text: "股票交易所" },
          { type: "p", text: "起咗股票交易所（見下面特殊建築表）先會有運作中嘅股市：35 隻股票入面 10 隻組成「恒生指數」，任何時候得 20 隻上市，表現最差嘅非指數股會定期被非上市股頂替。股市有牛市／橫行／熊市三種週期，會隨機轉換；股價受城市表現（快樂、法治、商業需求、污染、盈餘）影響，仲有機會股災——一次過全部股票跌 3 至 5 成，之後維持一段熊市先慢慢恢復。" },
        ],
      },
      {
        id: "council",
        title: "四、立法會與政策",
        blocks: [
          { type: "p", text: "人口達 10,000 就可以起立法會，之後就會有十位有名有姓嘅官員議員：行政長官（主持，唔投票）、四位無投票權嘅部門首長（財政、警務、天文台、文化），同五位有投票權嘅議員（民主、自由、商界、旅遊、宗教派系）。" },
          { type: "h3", text: "法案同決議" },
          { type: "p", text: "法案／條例係長期生效嘅政策，每月有固定開支，部份要人口達標先解鎖；決議就係一次性項目（例如撥款、活動），要預先畀一筆錢，仲有冷卻時間唔可以連續提出。" },
          { type: "p", text: "有兩條決議特別重要：「海洋公園發展計劃」（要人口 35,000、月收入 $6,000、月盈餘 $1,000、經濟指數 50 先可以支付 $10,000 提出）同「我愛玫瑰園計劃」（人口 80,000、月收入 $12,000、月盈餘 $2,000、經濟指數 65，支付 $25,000）——分別解鎖海洋公園同機場嘅建造權，呢兩條決議一旦議會通過就實會成功（唔似其他決議仲要再抽一次成功率）。" },
          { type: "h3", text: "點樣投票" },
          { type: "p", text: "五位議員嘅立場由議題取態、城市迫切需要、財政壓力、對行政長官嘅信任，同同其他官員嘅關係綜合計算，唔係隨機。動議要拎到至少 3 票先算通過議會，之後仲要玩家以行政長官身份做最後嘅批准／否決——否決一條已經通過嘅動議，會扣減所有投贊成票議員對你嘅信任。" },
        ],
      },
      {
        id: "environment",
        title: "五、地價、污染、環境、健康、教育",
        blocks: [
          { type: "p", text: "呢幾個指標互相牽連，一齊決定地皮質素同市民生活水平：" },
          { type: "ul", items: [
            "地價：受警力／消防覆蓋、供電、公園、樹木、景觀加分，被污染同煤廠／機場／碼頭呢類滋擾設施拖低。",
            "污染：燃煤電廠、工業建築係主要來源（核電廠污染極低），成熟樹木可以減最多兩成半污染，落雨都會沖走部份污染。",
            "健康指數：睇醫院覆蓋、污染程度、公園康樂、供電、治安、教育水平綜合評估，醫院使用率過高會扣分；預期壽命同健康指數直接掛鈎。",
            "疫情：人口密度、污染、醫療容量壓力會提高爆發風險，各種醫療／衛生政策可以降低風險同加快康復。",
            "教育：分基礎（小學中學＋圖書館覆蓋）同高等（社區學院＋大學覆蓋）兩條獨立指數，會慢慢向覆蓋率決定嘅目標值靠近。",
          ] },
        ],
      },
      {
        id: "weather",
        title: "六、天氣同颱風信號",
        blocks: [
          { type: "p", text: "香城嘅天氣系統參照真實天文台做法：颱風淨係喺 4 月至 11 月形成，用真實西北太平洋命名清單（中日對照），風力由弱到強再減弱，形成自然嘅信號升跌曲線。" },
          { type: "table", head: ["信號", "大約風速門檻"], rows: [
            ["一號戒備信號", "≥30 km/h"],
            ["三號強風信號", "≥41 km/h"],
            ["八號烈風或暴風信號", "≥63 km/h"],
            ["九號烈風或暴風風力增強信號", "風力仍在增強、預計會達 10 號"],
            ["十號颶風信號", "≥118 km/h"],
          ] },
          { type: "p", text: "八號或以上信號生效嗰陣：巴士同小巴會即時停駛從路面消失（的士、私家車、貨車、客貨車照常行駛）；整體車速下降；機場停止新航班（已經喺半空嘅航班會安全完成當前航段，泊咗喺閘口嘅飛機會留喺原地）；貨櫃碼頭嘅船隻運作同樣暫停；畫面會變暗，配合落雨／打雷效果。" },
          { type: "p", text: "另外仲有獨立於颱風嘅暴雨警告（黃色 ≥30mm/小時、紅色 ≥50mm、黑色 ≥70mm），同埋跟住季節轉變嘅天氣（夏天炎熱多驟雨、冬天涼爽清朗、換季溫和）。" },
        ],
      },
      {
        id: "population",
        title: "七、人口、快樂指數、失業率",
        blocks: [
          { type: "p", text: "快樂指數由供電覆蓋、消防／警力覆蓋、公園覆蓋、樹木景觀、道路撥款、各種政策、法治、健康指數同地標嘅快樂加成組成，再減去稅率過高、污染、失業、疫情同「城市黑點」（負面話題）嘅扣分。" },
          { type: "p", text: "失業率 = 1 − 總職位容量 ÷ 勞動人口（勞動人口約為總人口六成）。職位由商業、科學園同一般工業建築提供；高學歷勞動力另外獨立計算「高學歷失業率」，睇佢哋搵唔搵到商業或科學園職位。" },
          { type: "p", text: "犯罪率主要睇警力覆蓋：有覆蓋嘅地方基本犯罪率好低，冇覆蓋就明顯偏高，仲會被失業率進一步推高；廟宇教堂呢類「社區關懷」建築可以輕微降低犯罪率。" },
        ],
      },
      {
        id: "landmarks",
        title: "八、特殊建築解鎖規格",
        blocks: [
          { type: "p", text: SITE_TEXT["zh-HK"].manual.intro },
          { type: "table", head: SITE_TEXT["zh-HK"].manual.tableHeaders, rows: SITE_MANUAL_ROWS["zh-HK"] },
          { type: "h3", text: SITE_TEXT["zh-HK"].manual.notesTitle },
          { type: "ul", items: SITE_MANUAL_NOTES["zh-HK"] },
          { type: "link", href: "user-manual.md", text: SITE_TEXT["zh-HK"].manual.sourceLink },
        ],
      },
      {
        id: "transport",
        title: "九、交通、巴士公司、機場與貨櫃碼頭",
        blocks: [
          { type: "p", text: "道路每格 $10，橋樑每格 $75，維修開支跟返道路部門撥款滑桿浮動。交通壓力會按住宅／商業／工業嘅密度同建築規模產生，沿路網擴散，塞車情況會拖低快樂指數同商業／住宅需求。" },
          { type: "p", text: "小巴、的士、私家車同貨車依然純粹係背景視覺車流，唔使玩家安排路線；巴士就已經改為玩家親自經營嘅獨立公司——詳見下面。呢類背景車流喺八號風球或以上會即時停駛。" },
          { type: "h3", text: "巴士公司：獨立經營模式" },
          { type: "p", text: "人口達 3,000 就解鎖「運輸營運」模式：撳左上角「建設指引 CITY GUIDE」個 header 就可以喺城市建設同巴士公司經營之間切換——同一個地圖、同一個時鐘，但工具同介面會完全換成巴士公司專用嘅路線、車隊、需求、車廠、財務同公司六個獨立可拖曳視窗，逐個喺頂部工具列開關。" },
          { type: "p", text: "巴士公司有自己一套獨立資金（開業獲發 $6,000 啟動資金），同市政府庫房完全分開：市政府嘅稅收、貸款、部門撥款一律唔會影響巴士公司，巴士公司蝕本都唔會拖冧市政府財政。連續三個月虧損，公司所有路線會自動暫停，等你調整車隊或者路線先再重開。" },
          { type: "p", text: "巴士要響車廠逐架購買（兩種車型 $210～$280），每個車廠得 12 個泊位；行駛耐咗要定期返廠保養，車齡同狀態會影響載客表現同故障機會。撳任何一架行緊嘅巴士，會開返一個獨立追蹤視窗，實時鏡頭跟實架車，睇到即時位置、載客量同盈虧；撳巴士站就會顯示嗰度嘅候車人數。" },
          { type: "p", text: "路線做得好（覆蓋密集、載客率高）會為附近地區帶嚟四樣實際效果：紓緩交通擠塞、提升商業區地價、增加工業區勞動力需求，同提升 H 級或以下住宅嘅快樂指數——豪宅級（UH）唔受惠，佢哋唔搭巴士。" },
          { type: "p", text: "機場（12×12，經「我愛玫瑰園計劃」解鎖）同貨櫃碼頭（4×4，人口 15,000 解鎖）依然係視覺化模擬：飛機沿固定校準航線降落、滑行去閘口、再起飛，一次大約 3 至 4 架同時運作；船隻就沿岸邊校準路線入港靠泊、交換貨物、鳴笛離港。機場、貨櫃碼頭同巴士公司三者喺八號風球或以上都會暫停運作。" },
        ],
      },
      {
        id: "ai-news",
        title: "十、AI 新聞與模擬新聞",
        blocks: [
          { type: "p", text: "香城討論區同新聞走馬燈一律由真實城市數據自動生成故事——揀邊區（玩家自訂分區優先）、邊個主題（天氣／交通／經濟／教育／醫療／環境／治安／社區，按當前最緊急嘅城市狀況自動揀）、邊個地標、邊個角色，同具體數字（例如交通擠塞百分比、失業率），呢個「故事種子」全部真實、AI 開唔開都一樣。" },
          { type: "p", text: "AI 新聞係選用功能：開咗之後，AI 負責將呢啲真實數據改寫成自然流暢嘅廣東話標題／報道／市民留言——AI 唔會創作事實或者決定結果，淨係負責「寫得靚啲」。冇開 AI 就用內建嘅範本文字，一樣每月按真實城市數據生成新聞，淨係冇 AI 潤色。設定入面貼一次你自己嘅 Ollama Cloud API key 就可以啟用，key 唔會出現喺 GitHub 或者安裝檔入面。" },
        ],
      },
      {
        id: "save",
        title: "十一、存檔系統",
        blocks: [
          { type: "p", text: "遊戲用本機 SQLite 資料庫存檔，唔使雲端。除咗手動存檔（Ctrl+S 或選單），遊戲會喺以下情況自動幫你存檔：每次踏入遊戲新年（12 月跳到 1 月）、每次立法會投票／決議結果出爐、放置或者改名分區路牌、討論區有新聞事件、調整稅率或者部門撥款之後——所以絕大部分情況你都唔使刻意記得手動存檔。" },
        ],
      },
      {
        id: "districts",
        title: "十二、雙語路牌與分區命名",
        blocks: [
          { type: "p", text: "每個路牌 $250，全城最多放 16 個，每個覆蓋周圍一大片範圍（約 36 格半徑）。路牌有中英文雙語名（中文最多 30 字，英文最多 48 字），放咗之後，範圍入面嘅新聞、討論區帖文都會用返你改嘅地區名，唔會再淨係講「東北／東南／西北／西南」。城市本身都可以改中英文名同揀名牌顏色。" },
        ],
      },
      {
        id: "ui",
        title: "十三、頂欄介面",
        blocks: [
          { type: "p", text: "頂欄由左至右大致包括：雙語城市名牌、日期同時間、預算與月度收支、人口、快樂指數星級、教育／科研佔比、住宅／商業／工業需求條、目前最緊急嘅城市快訊（有活躍警告會顯示 ⚠）、天氣狀態（氣溫濕度、信號徽章，撳落去可以睇天氣圖例）、稅率、預算／立法會／股市快速開啟掣，同小地圖。" },
        ],
      },
    ],
  },
  "zh-TW": {
    metaTitle: "遊戲指南 | 香城模擬器",
    metaDescription: "香城模擬器完整遊戲規則指南：分區密度、經濟稅收、立法會、天氣颱風、特殊建築解鎖和交通系統一次看懂。",
    pageTitle: "遊戲指南",
    pageIntro: "這頁詳細說明香城模擬器的所有核心機制——從分區蓋房到立法會投票，從股市操作到八號風球。想快速查建築解鎖數值，可以直接跳到",
    pageIntroManualLink: "特殊建築解鎖規格",
    pageIntroSuffix: "。",
    toc: "目錄",
    sections: [
      {
        id: "zoning",
        title: "一、分區基礎",
        blocks: [
          { type: "p", text: "香城分三種分區：住宅（Residential）、商業（Commercial）、工業（Industrial）。在空地上用分區工具塗色，就會將那格地劃為對應用途；蓋房、增加人口、增加就業全部由遊戲自動在已劃分區裡自然生成，玩家不需要一棟一棟手動蓋。" },
          { type: "h3", text: "密度：低／中／高" },
          { type: "p", text: "每種分區劃地時都要選擇密度，密度會影響三件事——劃地成本、發展速度，以及每棟建築最終容納多少人口／規模：" },
          { type: "table", head: ["密度", "劃地成本倍數", "發展速度倍數", "人口／規模倍數"], rows: [
            ["低密度", "×1.0", "×1.0（最快發展）", "×1.0"],
            ["中密度", "×1.5", "×0.65", "×2.5"],
            ["高密度", "×2.5", "×0.40（最慢發展）", "×6.0"],
          ] },
          { type: "p", text: "注意密度越高，發展速度反而越慢——但一旦蓋成，一棟建築能容納的人口／規模會大幅超越低密度。這個設計讓高密度區蓋房有種「慢慢等，蓋成就是地標」的感覺。" },
          { type: "h3", text: "低密度規劃永久鎖定" },
          { type: "p", text: "這是 v3.9.0 新增的規則：一塊地一旦被玩家劃為低密度住宅，就會被永久記錄低密度身分——之後無論你怎麼剷平重劃、改為其他用途，這塊地都不能再改劃為中／高密度住宅。這個限制只單向生效（低密度不能升級，但中密度和高密度之間沒有這個限制），也不影響商業或工業分區。" },
          { type: "p", text: "設計原因：低密度住宅刻意只使用 1×1 的透天厝、宗祠、別墅這類建築（不會像中高密度那樣蓋成整棟大樓），永久鎖定就是要保證這些低層社區永遠不會被改建成大樓。" },
          { type: "h3", text: "自然合併大 footprint" },
          { type: "p", text: "分區蓋房不一定是 1×1。當條件配合（密度、地皮品質、附近有無同類建築），幾塊相鄰的同區地皮有機會自然合併成 2×2、3×3，甚至 4×4／5×5 的大型建築——這是遊戲自動判斷，玩家不需要手動操作。" },
        ],
      },
      {
        id: "growth",
        title: "二、城市發展與建築等級",
        blocks: [
          { type: "p", text: "每個遊戲 tick，尚未蓋房的已劃分區地皮都有機會依需求自動蓋房；已經蓋好的建築也會依情況升級（1→2→3 級）或衰退。" },
          { type: "h3", text: "需求（Demand）怎麼算" },
          { type: "p", text: "住宅、商業、工業各自有一條 -1 到 +1 的需求線，數值越高，蓋房／升級機會越大：" },
          { type: "ul", items: [
            "住宅需求：主要看「就業拉力」（附近職缺夠不夠住在這裡的人做），會被失業率、疫情、醫院爆滿、交通壅塞（超過四成才計入）、電力短缺和高於 9% 的稅率拉低；快樂指數、綠化公園和道路修繕政策會加分。",
            "商業需求：看「消費缺口」（住了多少人但商店夠不夠），加上高學歷勞動力供過於求、人口規模、教育水準、法治指數，以及小商戶／外資／觀光推廣等政策加分；證券交易所存在還會額外加分。",
            "工業需求：分傳統工業和科學園兩條軌道，分別看低學歷、高學歷勞動力供過於求，會被污染拉低，被科研發展、工業大樓活化、強國製造等政策加分。",
          ] },
          { type: "h3", text: "蓋房機率" },
          { type: "p", text: "每格空置的已劃分區地皮，每 tick 的蓋房機率大約是：需求 × 基礎蓋房率(0.4) × 供電倍數 × 密度發展倍數 × 地皮品質倍數。沒電的地皮發展會慢很多；地皮品質（受地價、景觀、環境等影響）越高，發展越快。蓋房還需要附近有路（大約 3 格範圍內）才行。" },
          { type: "h3", text: "升級與衰退" },
          { type: "p", text: "已經蓋好的建築可以從 1 級升到 3 級，升級機率跟上面類似，但商業升級主要看地皮品質（不一定要商業需求好），住宅和工業則還需要有一定需求才會升級。" },
          { type: "p", text: "相反，沒有連接道路，或所屬分區需求跌到很低（低於 -0.5）的建築，就有機會衰退甚至消失。這個評估是每個遊戲月才做一次（不是每 tick），並且每個月最多影響有限數量的建築，避免一次停電就把整個城市「清空」。" },
          { type: "h3", text: "L／M／H／UH 財富等級" },
          { type: "p", text: "住宅和商業建築各自有四級「財富」外觀：L（大眾／公共）、M（一般私人）、H（高級）、UH（頂級地標）。哪塊地蓋哪個等級，取決於那塊地的「綜合品質」（地價、景觀、環境、經濟、健康等加權），品質越高，抽中 M／H 的機會越大，但 L 在任何品質區間都維持多數——即使地皮品質滿分，仍有一半機會出現 L，向香港以公共／大眾住宅為主的真實住宅分佈看齊。" },
          { type: "p", text: "UH 級極度罕見：住宅 UH 只在低密度的特殊 3×3 莊園地皮才有機會出現（代表歐式大宅），商業 UH 則只有高密度、同時附近有證券交易所和機場才會解鎖（代表匯豐總行、中銀大廈這類全城獨一無二的地標，沒有數量上限，但條件極難齊全）。" },
        ],
      },
      {
        id: "economy",
        title: "三、經濟：稅收、預算、貸款、股市",
        blocks: [
          { type: "h3", text: "稅率與收入" },
          { type: "p", text: "稅率可以在 4% 到 20% 之間調整，預設 9%。每個住宅居民、每棟商業／工業建築都會依稅率貢獻月收入，稅率越高徵得越多，但也會拉低住宅需求和快樂指數，要自己拿捏平衡。" },
          { type: "h3", text: "部門撥款" },
          { type: "p", text: "道路、警察、消防、公園四個部門各自有 50% 到 150% 的撥款滑桿，直接影響該部門的維護／服務支出，也間接影響治安、消防覆蓋等城市指標。" },
          { type: "h3", text: "貸款與信用評等" },
          { type: "p", text: "資金不夠可以貸款，有三種固定方案（$5,000／36 個月／年利率 8%、$10,000／48 個月／10%、$25,000／60 個月／12%），每月自動還款，還清會自動消失。信用評等 A／B／C／D 依總負債與月收入的比例計算，評等會影響玩家對城市財政狀況的判斷。" },
          { type: "p", text: "如果預算跌破 $0，城市會被標記為「破產」狀態並跳出警告，但這只是狀態提示，不是遊戲直接結束——預算回到正數就會自動解除。" },
          { type: "h3", text: "證券交易所" },
          { type: "p", text: "蓋了證券交易所（見下方特殊建築表）才會有運作中的股市：35 檔股票中 10 檔組成「恒生指數」，任何時候只有 20 檔上市，表現最差的非指數股會定期被未上市股取代。股市有多頭／盤整／空頭三種週期，會隨機轉換；股價受城市表現（快樂度、法治、商業需求、污染、盈餘）影響，還有機會發生股災——一次性所有股票下跌 3 到 5 成，之後維持一段空頭期才慢慢恢復。" },
        ],
      },
      {
        id: "council",
        title: "四、立法會與政策",
        blocks: [
          { type: "p", text: "人口達到 10,000 就可以蓋立法會，之後就會有十位有名有姓的官員議員：行政長官（主席，不投票）、四位無投票權的部門首長（財政、警務、天文台、文化），以及五位有投票權的議員（民主、自由、商界、旅遊、宗教派系）。" },
          { type: "h3", text: "法案與決議" },
          { type: "p", text: "法案／條例是長期生效的政策，每月有固定支出，部分要人口達標才會解鎖；決議則是一次性項目（例如撥款、活動），要預先支付一筆費用，還有冷卻時間不能連續提出。" },
          { type: "p", text: "有兩項決議特別重要：「海洋公園發展計畫」（要人口 35,000、月收入 $6,000、月盈餘 $1,000、經濟指數 50 才能支付 $10,000 提出）和「玫瑰園計畫」（人口 80,000、月收入 $12,000、月盈餘 $2,000、經濟指數 65，支付 $25,000）——分別解鎖海洋公園和機場的建造權，這兩項決議一旦議會通過就一定會成功（不像其他決議還要再抽一次成功率）。" },
          { type: "h3", text: "如何投票" },
          { type: "p", text: "五位議員的立場由議題傾向、城市迫切需求、財政壓力、對行政長官的信任，和與其他官員的關係綜合計算，不是隨機。動議要拿到至少 3 票才算通過議會，之後還要玩家以行政長官身分做最後的批准／否決——否決一項已經通過的動議，會扣減所有投贊成票議員對你的信任。" },
        ],
      },
      {
        id: "environment",
        title: "五、地價、污染、環境、健康、教育",
        blocks: [
          { type: "p", text: "這幾個指標互相牽連，一起決定地皮品質和市民生活水準：" },
          { type: "ul", items: [
            "地價：受警力／消防覆蓋、供電、公園、樹木、景觀加分，被污染以及燃煤電廠／機場／港口這類干擾設施拉低。",
            "污染：燃煤電廠、工業建築是主要來源（核能電廠污染極低），成熟樹木可以減少最多兩成五污染，降雨也會沖掉部分污染。",
            "健康指數：依醫院覆蓋、污染程度、公園休閒、供電、治安、教育水準綜合評估，醫院使用率過高會扣分；平均壽命與健康指數直接掛鉤。",
            "疫情：人口密度、污染、醫療容量壓力會提高爆發風險，各種醫療／衛生政策可以降低風險和加快恢復。",
            "教育：分基礎（國小國中＋圖書館覆蓋）和高等（社區學院＋大學覆蓋）兩條獨立指數，會慢慢向覆蓋率決定的目標值靠近。",
          ] },
        ],
      },
      {
        id: "weather",
        title: "六、天氣與颱風信號",
        blocks: [
          { type: "p", text: "香城的天氣系統參照真實天文台做法：颱風只在 4 月到 11 月形成，使用真實西北太平洋命名清單（中日對照），風力由弱到強再減弱，形成自然的信號升降曲線。" },
          { type: "table", head: ["信號", "大約風速門檻"], rows: [
            ["一號戒備信號", "≥30 km/h"],
            ["三號強風信號", "≥41 km/h"],
            ["八號烈風或暴風信號", "≥63 km/h"],
            ["九號烈風或暴風風力增強信號", "風力仍在增強、預計會達 10 號"],
            ["十號颶風信號", "≥118 km/h"],
          ] },
          { type: "p", text: "八號或以上信號生效時：公車和小巴會立即停駛從路面消失（計程車、私家車、貨車、客貨車照常行駛）；整體車速下降；機場停止新航班（已經在半空的航班會安全完成當前航段，停在閘口的飛機會留在原地）；貨櫃碼頭的船隻運作同樣暫停；畫面會變暗，配合降雨／打雷效果。" },
          { type: "p", text: "另外還有獨立於颱風的暴雨警告（黃色 ≥30mm/小時、紅色 ≥50mm、黑色 ≥70mm），以及跟著季節變化的天氣（夏天炎熱多陣雨、冬天涼爽晴朗、換季溫和）。" },
        ],
      },
      {
        id: "population",
        title: "七、人口、快樂指數、失業率",
        blocks: [
          { type: "p", text: "快樂指數由供電覆蓋、消防／警力覆蓋、公園覆蓋、樹木景觀、道路撥款、各種政策、法治、健康指數和地標的快樂加成組成，再減去稅率過高、污染、失業、疫情和「城市負面話題」的扣分。" },
          { type: "p", text: "失業率 = 1 − 總職缺容量 ÷ 勞動人口（勞動人口約為總人口六成）。職缺由商業、科學園和一般工業建築提供；高學歷勞動力另外獨立計算「高學歷失業率」，看他們找不找得到商業或科學園職缺。" },
          { type: "p", text: "犯罪率主要看警力覆蓋：有覆蓋的地方基本犯罪率很低，沒覆蓋就明顯偏高，還會被失業率進一步推高；廟宇教堂這類「社區關懷」建築可以輕微降低犯罪率。" },
        ],
      },
      {
        id: "landmarks",
        title: "八、特殊建築解鎖規格",
        blocks: [
          { type: "p", text: SITE_TEXT["zh-TW"].manual.intro },
          { type: "table", head: SITE_TEXT["zh-TW"].manual.tableHeaders, rows: SITE_MANUAL_ROWS["zh-TW"] },
          { type: "h3", text: SITE_TEXT["zh-TW"].manual.notesTitle },
          { type: "ul", items: SITE_MANUAL_NOTES["zh-TW"] },
          { type: "link", href: "user-manual.md", text: SITE_TEXT["zh-TW"].manual.sourceLink },
        ],
      },
      {
        id: "transport",
        title: "九、交通、公車公司、機場與貨櫃碼頭",
        blocks: [
          { type: "p", text: "道路每格 $10，橋樑每格 $75，維修支出跟著道路部門撥款滑桿浮動。交通壓力會依住宅／商業／工業的密度和建築規模產生，沿路網擴散，塞車情況會拉低快樂指數和商業／住宅需求。" },
          { type: "p", text: "小巴、計程車、私家車和貨車依然純粹是背景視覺車流，不需要玩家安排路線；公車則已經改為玩家親自經營的獨立公司——詳見下面。這類背景車流在八號風球或以上會立即停駛。" },
          { type: "h3", text: "公車公司：獨立經營模式" },
          { type: "p", text: "人口達 3,000 就解鎖「運輸營運」模式：點左上角「建設指引 CITY GUIDE」的 header 就可以在城市建設和公車公司經營之間切換——同一張地圖、同一個時鐘，但工具和介面會完全換成公車公司專用的路線、車隊、需求、車廠、財務和公司六個獨立可拖曳視窗，逐一從頂部工具列開關。" },
          { type: "p", text: "公車公司有自己一套獨立資金（開業獲發 $6,000 啟動資金），和市政府庫房完全分開：市政府的稅收、貸款、部門撥款一律不會影響公車公司，公車公司虧損也不會拖垮市政府財政。連續三個月虧損，公司所有路線會自動暫停，需要調整車隊或路線才能重開。" },
          { type: "p", text: "公車要在車廠逐輛購買（兩種車型 $210～$280），每個車廠只有 12 個車位；行駛久了要定期回廠保養，車齡和狀態會影響載客表現和故障機率。點任何一輛行駛中的公車，會開啟一個獨立追蹤視窗，即時鏡頭跟著這輛車，看得到即時位置、載客量和盈虧；點公車站就會顯示該站的候車人數。" },
          { type: "p", text: "路線經營得好（覆蓋密集、載客率高）會為附近地區帶來四項實際效果：紓緩交通壅塞、提升商業區地價、增加工業區勞動力需求，以及提升 H 級或以下住宅的快樂指數——頂級豪宅（UH）不受惠，他們不搭公車。" },
          { type: "p", text: "機場（12×12，經「玫瑰園計畫」解鎖）和貨櫃碼頭（4×4，人口 15,000 解鎖）依然是視覺化模擬：飛機沿固定校正航線降落、滑行至閘口、再起飛，一次大約 3 到 4 架同時運作；船隻則沿岸邊校正路線入港靠泊、交換貨物、鳴笛離港。機場、貨櫃碼頭和公車公司三者在八號風球或以上都會暫停運作。" },
        ],
      },
      {
        id: "ai-news",
        title: "十、AI 新聞與模擬新聞",
        blocks: [
          { type: "p", text: "香城討論區和新聞跑馬燈一律由真實城市數據自動生成故事——選哪一區（玩家自訂分區優先）、什麼主題（天氣／交通／經濟／教育／醫療／環境／治安／社區，依當前最迫切的城市狀況自動選擇）、哪個地標、哪個角色，以及具體數字（例如交通壅塞百分比、失業率），這個「故事種子」全部真實，AI 開不開都一樣。" },
          { type: "p", text: "AI 新聞是選用功能：開啟後，AI 負責將這些真實數據改寫成自然流暢的中文標題／報導／市民留言——AI 不會創造事實或決定結果，只負責「寫得更好」。沒開 AI 就用內建的範本文字，一樣每月依真實城市數據生成新聞，只是沒有 AI 潤飾。到設定裡貼上一次你自己的 Ollama Cloud API key 就可以啟用，key 不會出現在 GitHub 或安裝檔裡。" },
        ],
      },
      {
        id: "save",
        title: "十一、存檔系統",
        blocks: [
          { type: "p", text: "遊戲使用本機 SQLite 資料庫存檔，不需要雲端。除了手動存檔（Ctrl+S 或選單），遊戲會在以下情況自動幫你存檔：每次進入遊戲新年（12 月跳到 1 月）、每次立法會投票／決議結果出爐、放置或改名分區路牌、討論區有新聞事件、調整稅率或部門撥款之後——所以絕大部分情況你都不需要刻意記得手動存檔。" },
        ],
      },
      {
        id: "districts",
        title: "十二、雙語路牌與分區命名",
        blocks: [
          { type: "p", text: "每個路牌 $250，全城最多放置 16 個，每個覆蓋周圍一大片範圍（約 36 格半徑）。路牌有中英文雙語名（中文最多 30 字，英文最多 48 字），放置後，範圍內的新聞、討論區貼文都會使用你改的地區名，不會再只講「東北／東南／西北／西南」。城市本身也可以改中英文名和選擇名牌顏色。" },
        ],
      },
      {
        id: "ui",
        title: "十三、頂欄介面",
        blocks: [
          { type: "p", text: "頂欄由左至右大致包括：雙語城市名牌、日期與時間、預算與月度收支、人口、快樂指數星級、教育／科研佔比、住宅／商業／工業需求條、目前最迫切的城市快訊（有活躍警告會顯示 ⚠）、天氣狀態（氣溫濕度、信號徽章，點下去可以看天氣圖例）、稅率、預算／立法會／股市快速開啟鈕，以及小地圖。" },
        ],
      },
    ],
  },
  en: {
    metaTitle: "Game Guide | The City of Heung Shing",
    metaDescription: "A complete rules guide for The City of Heung Shing: zoning density, taxes and economy, the Legislative Council, typhoon weather, special-building unlocks and the transport system, all in one place.",
    pageTitle: "Game Guide",
    pageIntro: "This page walks through every core mechanic in The City of Heung Shing - from zoning and construction to Legislative Council votes, from the stock market to Typhoon Signal No. 8. For a quick lookup of building unlock numbers, jump straight to",
    pageIntroManualLink: "Special Building Unlock Specs",
    pageIntroSuffix: ".",
    toc: "Contents",
    sections: [
      {
        id: "zoning",
        title: "1. Zoning Basics",
        blocks: [
          { type: "p", text: "Heung Shing has three zone types: Residential, Commercial and Industrial. Painting the zoning tool over empty land assigns that tile to a use; buildings, population and jobs all spawn automatically within zoned land as the game runs - you never place individual buildings by hand." },
          { type: "h3", text: "Density: Low / Medium / High" },
          { type: "p", text: "Every zone is painted at a chosen density, which affects three things: the cost to zone, how fast it develops, and how many people/how much scale each finished building eventually holds:" },
          { type: "table", head: ["Density", "Zoning cost multiplier", "Growth-speed multiplier", "Population/scale multiplier"], rows: [
            ["Low", "×1.0", "×1.0 (fastest to grow)", "×1.0"],
            ["Medium", "×1.5", "×0.65", "×2.5"],
            ["High", "×2.5", "×0.40 (slowest to grow)", "×6.0"],
          ] },
          { type: "p", text: "Note that higher density actually grows more slowly - but once a high-density building finally appears, it holds far more people/scale than a low-density one ever could. That gives high-density zones a “slow build-up, then a landmark” feel." },
          { type: "h3", text: "Permanent Low-Density Planning Lock" },
          { type: "p", text: "This is a new rule as of v3.9.0: the first time a tile is zoned low-density residential, it's permanently recorded as low-density land - no matter how you later bulldoze, re-zone or repurpose it, that tile can never be rezoned medium/high-density residential again. The restriction is one-directional (low density can never be raised, but there's no such restriction between medium and high), and it doesn't affect commercial or industrial zoning." },
          { type: "p", text: "Why: low-density residential is deliberately limited to 1×1 buildings - village houses, ancestral halls, villas - rather than the towers that fill in medium/high density. The permanent lock guarantees those low-rise neighbourhoods can never later be redeveloped into a housing estate." },
          { type: "h3", text: "Buildings Merging Into Larger Footprints" },
          { type: "p", text: "New buildings aren't always 1×1. When conditions line up (density, land quality, nearby buildings of the same type), several adjacent same-zone tiles can naturally merge into a 2×2, 3×3, or even a 4×4/5×5 building - this happens automatically; no player action is needed." },
        ],
      },
      {
        id: "growth",
        title: "2. City Growth and Building Levels",
        blocks: [
          { type: "p", text: "Every simulation tick, empty zoned tiles have a chance to spawn a new building based on demand; existing buildings likewise have a chance to upgrade (level 1→2→3) or decline depending on conditions." },
          { type: "h3", text: "How Demand Is Calculated" },
          { type: "p", text: "Residential, commercial and industrial each track a demand value from -1 to +1 - the higher it is, the better the odds of growth or upgrades:" },
          { type: "ul", items: [
            "Residential demand: driven mainly by “employment pull” (are there enough nearby jobs for residents), pulled down by unemployment, epidemics, hospital overcapacity, heavy traffic (only above ~40% congestion), power shortages and a tax rate above 9%; boosted by happiness, green-park policy and road-repair policy.",
            "Commercial demand: driven by the “consumption gap” (residents vs. shop capacity), plus a surplus of highly-educated workers, population scale, education level, rule of law, and policies like small-business support, foreign investment incentives and tourism promotion; a working stock exchange adds a further bonus.",
            "Industrial demand: split into a traditional track and a science-park track, driven by a surplus of low-/high-education workers respectively, pulled down by pollution, and boosted by science-development, industrial-building-revitalisation and manufacturing policies.",
          ] },
          { type: "h3", text: "The Growth Roll" },
          { type: "p", text: "For each empty zoned tile, the per-tick spawn chance is roughly: demand × a base growth rate (0.4) × a power-supply multiplier × the density growth multiplier × a land-quality multiplier. Unpowered land develops much more slowly; higher land quality (driven by land value, scenery, environment, etc.) grows faster. Growth also requires a road within roughly 3 tiles." },
          { type: "h3", text: "Upgrades and Decline" },
          { type: "p", text: "Existing buildings can level up from 1 to 3. The roll is similar to spawning, but commercial upgrades are driven mainly by land quality (not necessarily strong commercial demand), while residential and industrial still need reasonably positive demand to level up." },
          { type: "p", text: "Conversely, a building with no road access, or whose zone's demand has fallen very low (below -0.5), can decline and eventually disappear. This check only runs once per game month (not every tick), and is capped to a limited number of buildings per month, so a single power outage can never wipe out the whole city at once." },
          { type: "h3", text: "L/M/H/UH Wealth Tiers" },
          { type: "p", text: "Residential and commercial buildings each come in four “wealth” tiers: L (mass/public), M (ordinary private), H (premium), and UH (top-tier landmark). Which tier spawns on a given plot depends on that plot's overall “quality” score (a weighted mix of land value, scenery, environment, economy, health, etc.) - the higher the quality, the better the odds of M/H, but L stays the majority across every quality band. Even on a plot with maximum quality, there's still roughly a 50% chance of L, matching Hong Kong's real housing mix, which is dominated by public/mass housing." },
          { type: "p", text: "UH is extremely rare: residential UH can only appear on a special low-density 3×3 estate-lot site (representing a European-style mansion); commercial UH is only unlocked in high-density zones with both a stock exchange and an airport nearby (representing one-of-a-kind city landmarks like HSBC HQ or the Bank of China Tower - uncapped in count, but its conditions are extremely hard to meet all at once)." },
        ],
      },
      {
        id: "economy",
        title: "3. Economy: Taxes, Budget, Loans, Stock Market",
        blocks: [
          { type: "h3", text: "Tax Rate and Income" },
          { type: "p", text: "The tax rate can be set anywhere from 4% to 20%, defaulting to 9%. Every resident and every commercial/industrial building contributes monthly income scaled to the tax rate - a higher rate collects more, but also drags down residential demand and happiness, so it's a balancing act." },
          { type: "h3", text: "Department Funding" },
          { type: "p", text: "Roads, police, fire and parks each have their own funding slider from 50% to 150%, directly scaling that department's upkeep/service spending and indirectly affecting city stats like public safety and fire coverage." },
          { type: "h3", text: "Loans and Credit Rating" },
          { type: "p", text: "Short on cash? Take out a loan - three fixed options exist ($5,000 over 36 months at 8% APR, $10,000 over 48 months at 10%, $25,000 over 60 months at 12%), auto-repaid monthly and cleared automatically once paid off. Credit rating (A/B/C/D) is calculated from the ratio of total debt to monthly income, and shapes how sound the city's finances look." },
          { type: "p", text: "If the budget drops below $0, the city is flagged “bankrupt” and shows a warning - but this is just a status indicator, not an instant game-over; it clears automatically once the budget returns positive." },
          { type: "h3", text: "Stock Exchange" },
          { type: "p", text: "A working stock market only exists once the Stock Exchange building is built (see the special-buildings table below): 10 of 35 catalogued companies form the Hang Seng-style Index, with only 20 stocks listed at any time - the worst-performing non-index stock periodically gets swapped for one that isn't yet listed. The market cycles through bull/range/bear regimes at random; prices are driven by overall city performance (happiness, rule of law, commercial demand, pollution, treasury surplus), and crashes can occur - dropping every listed stock 30-50% at once, followed by an extended bear period before it slowly recovers." },
        ],
      },
      {
        id: "council",
        title: "4. The Legislative Council and Policies",
        blocks: [
          { type: "p", text: "Once population reaches 10,000, you can build the Legislative Council, unlocking ten named officials and members: the Chief Executive (chair, non-voting), four non-voting department heads (Treasury, Police, Observatory, Culture), and five voting councillors (representing Democracy, Liberty, Business, Tourism and Religion factions)." },
          { type: "h3", text: "Bills and Resolutions" },
          { type: "p", text: "Bills/ordinances are standing policies with an ongoing monthly cost, some gated behind a population threshold; resolutions are one-off items (funding, events) that cost an upfront payment and have a cooldown before they can be proposed again." },
          { type: "p", text: "Two resolutions matter more than most: the “Ocean Park Development Project” (requires population 35,000, monthly income $6,000, monthly surplus $1,000, economy index 50, and a $10,000 payment to submit) and the “I Love Rose Garden Project” (population 80,000, income $12,000, surplus $2,000, economy index 65, a $25,000 payment) - these unlock the right to build Ocean Park and the Airport respectively. Both are guaranteed to succeed once approved by council, unlike ordinary event-style resolutions which still roll for a success chance afterward." },
          { type: "h3", text: "How Voting Works" },
          { type: "p", text: "Each councillor's stance is computed deterministically from their ideology on the issue, how urgently the city currently needs it, fiscal pressure relative to the budget, their trust in the Chief Executive, and their relationship with the sponsoring official(s) - never random. A motion needs at least 3 “yes” votes to pass the council, after which the player, as Chief Executive, makes the final approve/veto call - vetoing a passed motion costs trust with every councillor who voted for it." },
        ],
      },
      {
        id: "environment",
        title: "5. Land Value, Pollution, Environment, Health, Education",
        blocks: [
          { type: "p", text: "These stats are deeply interlinked and together determine land quality and quality of life:" },
          { type: "ul", items: [
            "Land value: boosted by police/fire coverage, power, parks, trees and scenery; pulled down by pollution and nuisance facilities like coal plants, the airport or the container port.",
            "Pollution: coal plants and industrial buildings are the main sources (nuclear power pollutes almost nothing); mature trees cut up to about a quarter of total pollution, and rainfall washes some of it away too.",
            "Health index: a combined assessment of hospital coverage, pollution level, park/recreation access, power, public safety and education level, with a penalty once hospital utilisation runs too high; life expectancy is tied directly to the health index.",
            "Epidemics: population density, pollution and strained healthcare capacity raise outbreak risk; various healthcare/public-health policies reduce that risk and speed up recovery.",
            "Education: tracked as two independent indices - basic (primary/secondary schools plus library coverage) and higher (community colleges plus universities) - each gradually drifting toward a target set by local coverage.",
          ] },
        ],
      },
      {
        id: "weather",
        title: "6. Weather and Typhoon Signals",
        blocks: [
          { type: "p", text: "Heung Shing's weather system follows real Hong Kong Observatory practice: typhoons only form between April and November, drawing from a real Northwest Pacific naming list (with Chinese/Japanese translations), with wind strength rising to a peak and then falling away, producing a natural signal-rise-and-fall arc." },
          { type: "table", head: ["Signal", "Approximate wind threshold"], rows: [
            ["Standby Signal No. 1", "≥30 km/h"],
            ["Strong Wind Signal No. 3", "≥41 km/h"],
            ["Gale or Storm Signal No. 8", "≥63 km/h"],
            ["Increasing Gale or Storm Signal No. 9", "still strengthening, expected to reach No. 10"],
            ["Hurricane Signal No. 10", "≥118 km/h"],
          ] },
          { type: "p", text: "Once Signal 8 or above is in effect: buses and minibuses stop immediately and vanish from the roads (taxis, cars, trucks and vans keep running); overall traffic speed drops; the airport stops new flights (planes already airborne safely complete their current leg, and those parked at a gate stay put); container-port vessel operations similarly pause; the screen darkens, paired with rain/thunder effects." },
          { type: "p", text: "There's also a rainstorm warning system independent of typhoons (Amber ≥30mm/hr, Red ≥50mm, Black ≥70mm), plus seasonal weather that shifts through the year (hot and shower-heavy in summer, cool and clear in winter, mild in the shoulder seasons)." },
        ],
      },
      {
        id: "population",
        title: "7. Population, Happiness, Unemployment",
        blocks: [
          { type: "p", text: "Happiness combines power coverage, fire/police coverage, park coverage, trees/scenery, road funding, various policies, rule of law, the health index and landmark happiness bonuses - minus penalties for too-high tax, pollution, unemployment, epidemics and negative city “viral” moments." },
          { type: "p", text: "Unemployment rate = 1 − total job capacity ÷ labour force (labour force is roughly 60% of total population). Jobs come from commercial, science-park and ordinary industrial buildings; highly-educated workers track a separate “higher-education unemployment rate” based on whether they can find commercial or science-park jobs specifically." },
          { type: "p", text: "Crime rate is driven mainly by police coverage: covered areas have a low base crime rate, uncovered ones a noticeably higher one, further amplified by unemployment; “community support” buildings like temples and churches slightly reduce crime." },
        ],
      },
      {
        id: "landmarks",
        title: "8. Special Building Unlock Specs",
        blocks: [
          { type: "p", text: SITE_TEXT["en"].manual.intro },
          { type: "table", head: SITE_TEXT["en"].manual.tableHeaders, rows: SITE_MANUAL_ROWS["en"] },
          { type: "h3", text: SITE_TEXT["en"].manual.notesTitle },
          { type: "ul", items: SITE_MANUAL_NOTES["en"] },
          { type: "link", href: "user-manual.md", text: SITE_TEXT["en"].manual.sourceLink },
        ],
      },
      {
        id: "transport",
        title: "9. Transport, the Bus Company, Airport and Container Port",
        blocks: [
          { type: "p", text: "Roads cost $10/tile, bridges $75/tile, and upkeep spending scales with the road department's funding slider. Traffic load builds up based on the density and scale of residential/commercial/industrial buildings, spreads along the road network, and congestion drags down happiness and commercial/residential demand." },
          { type: "p", text: "Minibuses, taxis, private cars and trucks are still purely ambient background traffic that the player never routes. Buses, however, are now run as the player's own company - see below. This ambient traffic is grounded immediately at Typhoon Signal 8 or above." },
          { type: "h3", text: "The Bus Company: a standalone operation" },
          { type: "p", text: "Reaching population 3,000 unlocks Transport Mode: click the CITY GUIDE header in the top-left to switch between city building and running the bus company - same map, same clock, but the toolset and interface swap entirely to six independent, draggable Transport Company windows (Routes, Fleet, Demand, Depot, Finances, Company), each toggled from its own icon in the topbar." },
          { type: "p", text: "The bus company keeps its own treasury (founded with $6,000 in start-up capital), fully separate from city hall's budget - city taxes, loans and department funding never touch it, and a losing bus company never drags down the city's own finances. Three consecutive losing months auto-suspends every route until the fleet or routes are adjusted." },
          { type: "p", text: "Buses are bought individually at a depot (two classes, $210-$280), and each depot holds only 12 vehicles. A bus needs periodic servicing the longer it runs - age and condition affect ridership and breakdown risk. Clicking any moving bus opens its own live tracking window with a real camera following the vehicle, showing its position, passenger load and profit; clicking a bus stop shows how many passengers are waiting there." },
          { type: "p", text: "A well-run route (dense coverage, high ridership) delivers four real effects to the surrounding area: eases traffic congestion, raises commercial land value, boosts industrial labour demand, and raises happiness for residents of wealth tier H and below - the wealthiest (UH) households don't ride the bus." },
          { type: "p", text: "The Airport (12×12, unlocked via the “I Love Rose Garden Project”) and the Container Port (4×4, unlocked at population 15,000) remain visual simulations: aircraft follow a fixed, calibrated flight path to land, taxi to a gate and take off again, with roughly 3-4 aircraft active at once; vessels similarly follow a calibrated coastal route to berth, exchange cargo, sound their horn and depart. The airport, container port and bus company all pause operations at Signal 8 or above." },
        ],
      },
      {
        id: "ai-news",
        title: "10. AI News and Simulated News",
        blocks: [
          { type: "p", text: "The Heung Shing Forum and news ticker always generate stories from real city data first - picking a district (player-named districts take priority), a topic desk (weather/transport/economy/education/health/environment/public-safety/community, auto-chosen from whatever's currently most urgent), a landmark, a character archetype, and concrete numbers (e.g. traffic congestion percentage, unemployment rate). This “story seed” is identical whether or not AI is turned on." },
          { type: "p", text: "AI news is optional: once enabled, the AI's only job is to phrase that real data into a natural-language headline/article/citizen comment - it never invents facts or decides outcomes, it just writes it better. Without AI, the same monthly, data-driven news still generates from built-in templates, just without AI-authored prose. Paste your own Ollama Cloud API key once under Settings to enable it; the key is never bundled with GitHub or the installer." },
        ],
      },
      {
        id: "save",
        title: "11. Save System",
        blocks: [
          { type: "p", text: "The game saves to a local SQLite database - no cloud required. Beyond manual saves (Ctrl+S or the menu), the game autosaves whenever: the in-game calendar rolls into a new year (December → January), a council vote/resolution result comes in, a district sign is placed or renamed, a forum news event fires, or you adjust the tax rate or department funding - so in practice you rarely need to remember to save manually." },
        ],
      },
      {
        id: "districts",
        title: "12. Bilingual Signage and District Naming",
        blocks: [
          { type: "p", text: "Each district sign costs $250, with a citywide cap of 16, and each one covers a wide surrounding radius (roughly 36 tiles). Signs carry a bilingual name (up to 30 Chinese characters, 48 English characters) - once placed, news and forum posts within that radius use your chosen district name instead of the generic “Northeast/Southeast/Northwest/Southwest” fallback. The city itself can also be given a bilingual name and a chosen nameplate colour." },
        ],
      },
      {
        id: "ui",
        title: "13. Top Bar Overview",
        blocks: [
          { type: "p", text: "From left to right, the top bar roughly shows: the bilingual city nameplate, date and time, budget and monthly income/expenses, population, a happiness star rating, education/science-industry share, residential/commercial/industrial demand bars, the most urgent current city headline (with a ⚠ icon when there's an active warning), a weather chip (temperature, humidity, signal badge - click for the weather legend), the tax rate, quick-open buttons for budget/council/stock market, and a minimap." },
        ],
      },
    ],
  },
  ja: {
    metaTitle: "ゲームガイド | 香城模擬器",
    metaDescription: "香城模擬器の完全ルールガイド：区画の密度、経済・税制、立法会、台風天候、特殊建築の解禁、交通システムをこのページで一挙解説。",
    pageTitle: "ゲームガイド",
    pageIntro: "このページでは香城模擬器のすべての基本システムを解説します——区画・建設から立法会の投票、株式市場から台風シグナル8号まで。建築の解禁数値をすぐに調べたい場合は",
    pageIntroManualLink: "特殊建築の解禁条件",
    pageIntroSuffix: "をご覧ください。",
    toc: "目次",
    sections: [
      {
        id: "zoning",
        title: "1. 区画の基本",
        blocks: [
          { type: "p", text: "香城には3種類の区画があります：住宅（Residential）、商業（Commercial）、工業（Industrial）。空き地に区画ツールで色を塗ると、そのマスが該当する用途に指定されます。建物・人口・雇用はすべて区画指定された土地の上でゲームが自動的に生成し、プレイヤーが1棟ずつ手動で建てる必要はありません。" },
          { type: "h3", text: "密度：低・中・高" },
          { type: "p", text: "区画指定の際には密度を選びます。密度は3つの要素に影響します——区画コスト、発展速度、そして最終的に各建物が収容する人口・規模です。" },
          { type: "table", head: ["密度", "区画コスト倍率", "発展速度倍率", "人口・規模倍率"], rows: [
            ["低密度", "×1.0", "×1.0（最も速く発展）", "×1.0"],
            ["中密度", "×1.5", "×0.65", "×2.5"],
            ["高密度", "×2.5", "×0.40（最も遅く発展）", "×6.0"],
          ] },
          { type: "p", text: "密度が高いほど発展速度はかえって遅くなる点に注意してください。しかし一度建物が完成すれば、その収容人口・規模は低密度をはるかに上回ります。この設計により、高密度区画には「じっくり待って、完成すればランドマークになる」という感覚があります。" },
          { type: "h3", text: "低密度計画の永久ロック" },
          { type: "p", text: "v3.9.0で追加された新ルールです：一度低密度住宅として区画指定された土地は、永久に「低密度」として記録されます——その後どのように取り壊し・再区画・用途変更をしても、その土地を中密度・高密度住宅に変更することは二度とできません。この制限は一方向のみ有効（低密度から引き上げることはできないが、中密度と高密度の間にはこの制限はない）で、商業区画・工業区画には影響しません。" },
          { type: "p", text: "理由：低密度住宅はあえて1×1の村家・祠堂・別荘といった建物のみに限定されており（中高密度のようなタワー型の集合住宅にはなりません）、永久ロックによってこれらの低層な街並みが後からタワーマンションに建て替えられることのないよう保証しています。" },
          { type: "h3", text: "大きなフットプリントへの自然な統合" },
          { type: "p", text: "新しい建物は常に1×1とは限りません。条件（密度・土地の質・周辺の同種建物の有無）が揃うと、隣接する複数の同一区画マスが自然に2×2、3×3、さらには4×4／5×5の大型建築へと統合されることがあります——これはゲームが自動的に判定するもので、プレイヤーの操作は不要です。" },
        ],
      },
      {
        id: "growth",
        title: "2. 都市の発展と建物のレベル",
        blocks: [
          { type: "p", text: "シミュレーションの各ティックごとに、まだ建物のない区画指定済みマスは需要に応じて新規建設が発生する可能性があり、既存の建物も条件に応じてレベルアップ（1→2→3）または衰退する可能性があります。" },
          { type: "h3", text: "需要（Demand）の計算方法" },
          { type: "p", text: "住宅・商業・工業はそれぞれ -1 から +1 の需要値を持ち、値が高いほど発展・レベルアップの確率が上がります。" },
          { type: "ul", items: [
            "住宅需要：主に「雇用の吸引力」（近隣に住民向けの十分な雇用があるか）で決まり、失業率・疫病・病院の過負荷・交通渋滞（混雑率約40%超で影響）・電力不足・9%を超える税率によって押し下げられます。幸福度、緑化公園政策、道路修繕政策はプラスに働きます。",
            "商業需要：「消費のギャップ」（住民数に対して店舗が十分か）で決まり、高学歴労働力の供給過剰、人口規模、教育水準、法治指数、そして中小企業支援・海外投資誘致・観光振興などの政策がプラスに働きます。稼働中の証券取引所があればさらにボーナスが加わります。",
            "工業需要：従来型工業とサイエンスパークの2系統に分かれ、それぞれ低学歴・高学歴労働力の供給過剰で決まります。汚染によって押し下げられ、科学研究発展・工業ビル再活性化・製造業振興などの政策で押し上げられます。",
          ] },
          { type: "h3", text: "発展の判定" },
          { type: "p", text: "空いている区画指定済みマスでは、各ティックの建設確率はおおよそ「需要 × 基礎発展率（0.4）× 電力供給倍率 × 密度発展倍率 × 土地品質倍率」で決まります。電力のない土地は発展が大幅に遅くなり、土地品質（地価・景観・環境などに影響される）が高いほど早く発展します。発展には近く（おおよそ3マス以内）に道路があることも必要です。" },
          { type: "h3", text: "レベルアップと衰退" },
          { type: "p", text: "既存の建物は1から3レベルまで成長できます。判定方法は新規建設と似ていますが、商業のレベルアップは主に土地品質で決まり（商業需要自体が高い必要は必ずしもありません）、住宅と工業はレベルアップにある程度の需要が必要です。" },
          { type: "p", text: "逆に、道路に接続していない、または所属区画の需要が非常に低い（-0.5未満）建物は衰退し、最終的に消滅することがあります。この判定はティックごとではなくゲーム月に1回のみ実行され、1ヶ月あたりに影響を受ける建物数にも上限があるため、一度の停電で都市全体が壊滅することはありません。" },
          { type: "h3", text: "L／M／H／UH 富裕度グレード" },
          { type: "p", text: "住宅・商業建築にはそれぞれ4段階の「富裕度」グレードがあります：L（大衆・公共）、M（一般民間）、H（高級）、UH（最上級ランドマーク）。どの区画にどのグレードが建つかは、その土地の「総合品質」スコア（地価・景観・環境・経済・健康などの加重平均）によって決まります。品質が高いほどM／Hが出やすくなりますが、Lはどの品質帯でも多数派を維持します——土地品質が満点であっても、Lが出る確率はなお約5割あり、公共・大衆住宅が主流である香港の実際の住宅事情に合わせています。" },
          { type: "p", text: "UHグレードは極めてまれです。住宅UHは低密度の特殊な3×3邸宅区画（ヨーロッパ風の大邸宅を表現）でのみ出現可能。商業UHは高密度で、かつ証券取引所と空港の両方が近くにある場合のみ解禁されます（匯豐（HSBC）本店ビルや中銀大廈のような、都市に一つしかないランドマークを表しており、棟数に上限はありませんが、条件を同時に満たすのは極めて困難です）。" },
        ],
      },
      {
        id: "economy",
        title: "3. 経済：税制、予算、ローン、株式市場",
        blocks: [
          { type: "h3", text: "税率と収入" },
          { type: "p", text: "税率は4%から20%の範囲で調整でき、デフォルトは9%です。すべての住民、すべての商業・工業建築が税率に応じて月収に貢献します。税率が高いほど徴収額は増えますが、住宅需要と幸福度を押し下げるため、バランスを取る必要があります。" },
          { type: "h3", text: "部門予算" },
          { type: "p", text: "道路・警察・消防・公園の4部門にはそれぞれ50%から150%の予算スライダーがあり、その部門の維持・サービス支出に直接影響するほか、治安や消防カバー率などの都市指標にも間接的に影響します。" },
          { type: "h3", text: "ローンと信用格付け" },
          { type: "p", text: "資金が足りない場合はローンを組めます。固定の3プランがあります（$5,000／36ヶ月／年利8%、$10,000／48ヶ月／10%、$25,000／60ヶ月／12%）。毎月自動返済され、完済すると自動的に消滅します。信用格付け（A／B／C／D）は総負債と月収の比率で計算され、都市の財政状態を測る指標になります。" },
          { type: "p", text: "予算が$0を下回ると、都市は「財政破綻」状態としてマークされ警告が表示されますが、これは状態表示に過ぎず即座にゲームオーバーになるわけではありません。予算がプラスに戻れば自動的に解除されます。" },
          { type: "h3", text: "証券取引所" },
          { type: "p", text: "証券取引所（下記の特殊建築表を参照）を建設して初めて株式市場が稼働します：カタログ上の35社のうち10社が「ハンセン指数」を構成し、常時上場しているのは20銘柄のみです。パフォーマンスが最も悪い非指数銘柄は定期的に未上場銘柄と入れ替わります。市場は強気・レンジ・弱気の3局面をランダムに循環し、株価は都市のパフォーマンス（幸福度・法治・商業需要・汚染・財政黒字）の影響を受けます。暴落が発生することもあり、上場銘柄が一斉に3〜5割下落した後、しばらく弱気相場が続いてから徐々に回復します。" },
        ],
      },
      {
        id: "council",
        title: "4. 立法会と政策",
        blocks: [
          { type: "p", text: "人口が10,000に達すると立法会を建設でき、実名を持つ官僚・議員10人が登場します：行政長官（議長、投票権なし）、投票権のない4人の部門トップ（財政・警務・天文台・文化）、そして投票権を持つ5人の議員（民主派・自由派・商界・観光業界・宗教団体）です。" },
          { type: "h3", text: "法案と決議" },
          { type: "p", text: "法案・条例は継続的に効力を持つ政策で毎月固定の支出があり、一部は人口条件を満たさないと解禁されません。決議は一回限りの案件（補助金・イベントなど）で、事前に費用を支払う必要があり、連続して提案できないクールダウン期間があります。" },
          { type: "p", text: "特に重要な決議が2つあります：「オーシャンパーク発展計画」（人口35,000、月収$6,000、月間黒字$1,000、経済指数50を満たし、$10,000を支払って提出）と「ローズガーデン計画」（人口80,000、月収$12,000、月間黒字$2,000、経済指数65、$25,000を支払う）です。それぞれオーシャンパークと空港の建設権を解禁します。この2つの決議は議会で可決されれば必ず成功します（他の決議のように可決後に改めて成功率の判定があるわけではありません）。" },
          { type: "h3", text: "投票の仕組み" },
          { type: "p", text: "5人の議員の立場は、議題に対するイデオロギー、都市が現在どれだけ切実にそれを必要としているか、予算に対する財政的プレッシャー、行政長官への信頼度、提案した官僚との関係性から総合的に計算されます（ランダムではありません）。動議は少なくとも3票の賛成を得れば議会を通過し、その後プレイヤーが行政長官として最終的な承認・拒否権を行使します——可決された動議を拒否すると、賛成票を投じたすべての議員からの信頼を失います。" },
        ],
      },
      {
        id: "environment",
        title: "5. 地価、汚染、環境、健康、教育",
        blocks: [
          { type: "p", text: "これらの指標は互いに密接に関連し合い、土地の品質と市民の生活水準を決定します。" },
          { type: "ul", items: [
            "地価：警察・消防のカバー率、電力、公園、樹木、景観によってプラスされ、汚染や石炭発電所・空港・港湾といった迷惑施設によってマイナスされます。",
            "汚染：石炭発電所と工業建築が主な発生源です（原子力発電はほぼ汚染しません）。成熟した樹木は汚染を最大約4分の1削減でき、降雨も一部を洗い流します。",
            "健康指数：病院のカバー率、汚染度、公園・レクリエーション、電力、治安、教育水準を総合的に評価します。病院の利用率が高すぎるとマイナス評価になり、平均寿命は健康指数に直結します。",
            "疫病：人口密度、汚染、医療キャパシティの逼迫が発生リスクを高めます。各種医療・公衆衛生政策はリスクを下げ、回復を早めます。",
            "教育：基礎教育（小中学校＋図書館のカバー率）と高等教育（コミュニティカレッジ＋大学のカバー率）という2つの独立した指数があり、それぞれカバー率が決める目標値に向かって徐々に近づいていきます。",
          ] },
        ],
      },
      {
        id: "weather",
        title: "6. 天候と台風シグナル",
        blocks: [
          { type: "p", text: "香城の天候システムは実際の香港天文台の運用方式を参考にしています：台風は4月から11月にのみ発生し、実際の北西太平洋命名リスト（中日対訳）を使用します。風力は最大値に向けて上昇した後に低下し、自然なシグナルの上昇・下降カーブを描きます。" },
          { type: "table", head: ["シグナル", "おおよその風速基準"], rows: [
            ["1号（戒備信号）", "≥30 km/h"],
            ["3号（強風信号）", "≥41 km/h"],
            ["8号（烈風または暴風信号）", "≥63 km/h"],
            ["9号（烈風または暴風・風力増強信号）", "風力が引き続き増強中で10号到達が見込まれる"],
            ["10号（ハリケーン信号）", "≥118 km/h"],
          ] },
          { type: "p", text: "シグナル8号以上が発令されると：バス・ミニバスは即座に運行を停止し道路から姿を消します（タクシー・自家用車・トラック・バンは通常通り運行）。全体的な走行速度が低下します。空港は新規便を停止します（すでに上空にいる便は現在の区間を安全に完了し、ゲートに駐機中の機体はその場に留まります）。コンテナ港の船舶運航も同様に一時停止します。画面が暗くなり、雨や雷の演出が加わります。" },
          { type: "p", text: "台風とは独立した暴風雨警報もあります（黄色 ≥30mm/時、赤色 ≥50mm、黒色 ≥70mm）。また季節に応じて天候が変化します（夏は高温で驟雨が多く、冬は涼しく晴天が多く、季節の変わり目は穏やかです）。" },
        ],
      },
      {
        id: "population",
        title: "7. 人口、幸福度、失業率",
        blocks: [
          { type: "p", text: "幸福度は、電力カバー率、消防・警察カバー率、公園カバー率、樹木・景観、道路予算、各種政策、法治、健康指数、ランドマークによる幸福度ボーナスを合算し、そこから税率過多、汚染、失業、疫病、都市の「炎上」的な負の話題によるマイナス分を差し引いて算出されます。" },
          { type: "p", text: "失業率 = 1 − 総雇用キャパシティ ÷ 労働力人口（労働力人口はおおよそ総人口の6割）。雇用は商業建築、サイエンスパーク、一般工業建築から提供されます。高学歴労働者については、商業またはサイエンスパークの雇用を見つけられているかを基準に「高学歴失業率」が別途計算されます。" },
          { type: "p", text: "犯罪率は主に警察のカバー率で決まります：カバーされているエリアは基礎犯罪率が低く、カバーされていないエリアは明らかに高くなり、失業率によってさらに増幅されます。寺院や教会などの「地域支援」建築は犯罪率をわずかに下げます。" },
        ],
      },
      {
        id: "landmarks",
        title: "8. 特殊建築の解禁条件一覧",
        blocks: [
          { type: "p", text: SITE_TEXT["ja"].manual.intro },
          { type: "table", head: SITE_TEXT["ja"].manual.tableHeaders, rows: SITE_MANUAL_ROWS["ja"] },
          { type: "h3", text: SITE_TEXT["ja"].manual.notesTitle },
          { type: "ul", items: SITE_MANUAL_NOTES["ja"] },
          { type: "link", href: "user-manual.md", text: SITE_TEXT["ja"].manual.sourceLink },
        ],
      },
      {
        id: "transport",
        title: "9. 交通、バス会社、空港、コンテナ港",
        blocks: [
          { type: "p", text: "道路は1マス$10、橋は1マス$75で、維持費は道路部門の予算スライダーに応じて変動します。交通負荷は住宅・商業・工業の密度と建物規模に応じて発生し、道路網に沿って広がります。渋滞は幸福度と商業・住宅需要を押し下げます。" },
          { type: "p", text: "ミニバス・タクシー・自家用車・トラックは引き続き純粋な背景の視覚的交通で、プレイヤーが経路を指定する必要はありません。一方バスは、プレイヤー自身が経営する独立した会社に変わりました——詳細は以下参照。この背景交通は台風シグナル8号以上では即座に運行停止となります。" },
          { type: "h3", text: "バス会社：独立経営モード" },
          { type: "p", text: "人口3,000で「運輸経営」モードが解禁されます。左上の「建設ガイド CITY GUIDE」ヘッダーをクリックすると、都市建設とバス会社経営を切り替えられます——同じマップ、同じ時計のまま、ツールとUIがバス会社専用の6つの独立したドラッグ可能なウィンドウ（路線・車両・需要・車庫・財務・会社）に完全に切り替わり、それぞれ上部ツールバーのアイコンから開閉できます。" },
          { type: "p", text: "バス会社は独自の資金（設立時に創業資金$6,000を獲得）を持ち、市の予算とは完全に分離されています。市の税収・借入・部門予算はバス会社に一切影響せず、バス会社が赤字でも市の財政を圧迫することはありません。3ヶ月連続赤字になると全路線が自動的に運休し、車両や路線を調整するまで再開しません。" },
          { type: "p", text: "バスは車庫で1台ずつ購入し（2車種、$210～$280）、各車庫の収容台数は12台までです。走行を重ねると定期整備が必要になり、車齢と状態が乗車実績と故障リスクに影響します。運行中のバスをクリックすると、実際のカメラが車両を追跡する専用の追跡ウィンドウが開き、位置・乗客数・収支を確認できます。バス停をクリックするとその停留所の待機乗客数が表示されます。" },
          { type: "p", text: "路線をうまく運営する（密なカバー範囲、高い乗車率）と、周辺地域に4つの実際の効果をもたらします：渋滞緩和、商業地区の地価上昇、工業地区の労働需要増加、そして富裕層（UH）を除く H 級以下の住民の幸福度上昇です——最富裕層（UH）はバスを利用しません。" },
          { type: "p", text: "空港（12×12、「ローズガーデン計画」で解禁）とコンテナ港（4×4、人口15,000で解禁）は引き続きビジュアルシミュレーションです：航空機は固定の校正済み飛行経路に沿って着陸し、ゲートまでタキシングし、再び離陸します。同時に稼働するのはおおよそ3〜4機です。船舶も同様に、校正済みの沿岸経路に沿って入港・係留し、貨物を交換し、汽笛を鳴らして出港します。空港・コンテナ港・バス会社の3つはいずれもシグナル8号以上では運航を停止します。" },
        ],
      },
      {
        id: "ai-news",
        title: "10. AIニュースとシミュレーテッドニュース",
        blocks: [
          { type: "p", text: "香城フォーラムとニュースティッカーは、常に実際の都市データから記事の元となる情報を自動生成します——地区の選定（プレイヤーが命名した地区を優先）、トピック（天気／交通／経済／教育／医療／環境／治安／地域社会から、現在最も切実な都市状況に応じて自動選択）、ランドマーク、キャラクターの類型、そして具体的な数値（交通渋滞率、失業率など）です。この「記事のもと」はAIのオン・オフに関わらず同一です。" },
          { type: "p", text: "AIニュースはオプション機能です：有効にすると、AIの役割はこの実データを自然な文章の見出し／記事／市民コメントに書き起こすことのみで、事実を創作したり結果を決定したりすることはありません——あくまで「文章として整える」役割です。AIを無効にしていても、毎月同じ実データに基づいたニュースが内蔵テンプレートから生成され続けます。違いはAIによる文章の彩りがあるかどうかだけです。設定画面でご自身のOllama Cloud APIキーを一度貼り付ければ有効化でき、キーがGitHubやインストーラーに含まれることはありません。" },
        ],
      },
      {
        id: "save",
        title: "11. セーブシステム",
        blocks: [
          { type: "p", text: "ゲームはローカルのSQLiteデータベースにセーブされ、クラウドは不要です。手動セーブ（Ctrl+Sまたはメニュー）に加えて、以下のタイミングで自動セーブされます：ゲーム内カレンダーが新年を迎えたとき（12月→1月）、立法会の投票・決議の結果が出たとき、地区標識を設置・改名したとき、フォーラムにニュースイベントが発生したとき、税率や部門予算を調整したとき。そのため、ほとんどの場合手動セーブを意識する必要はありません。" },
        ],
      },
      {
        id: "districts",
        title: "12. バイリンガル標識と地区の命名",
        blocks: [
          { type: "p", text: "地区標識は1つ$250、都市全体で最大16個まで設置でき、それぞれ周囲の広い範囲（半径約36マス）をカバーします。標識にはバイリンガルの名前（中国語名は最大30文字、英語名は最大48文字）を付けられます。設置後は、その範囲内のニュースやフォーラム投稿があなたが付けた地区名を使用するようになり、単に「北東／南東／北西／南西」とだけ表示されることはなくなります。都市自体にもバイリンガルの名前とネームプレートの色を設定できます。" },
        ],
      },
      {
        id: "ui",
        title: "13. トップバーの見方",
        blocks: [
          { type: "p", text: "トップバーは左から順に、おおよそ以下を表示します：バイリンガルの都市ネームプレート、日付と時刻、予算と月間収支、人口、幸福度の星評価、教育／サイエンス産業の比率、住宅・商業・工業の需要バー、現在最も切実な都市速報（アクティブな警告がある場合は⚠アイコン表示）、天候チップ（気温・湿度・シグナルバッジ、クリックで天候凡例を表示）、税率、予算／立法会／株式市場へのクイックアクセスボタン、そしてミニマップです。" },
        ],
      },
    ],
  },
};

// Gameplay screenshots placed inside the guide. `at` is the block index the figure is inserted at
// ("end" appends); captions are per language so every language keeps the same block count.
const SITE_GUIDE_FIGURES = {
  zoning: [{ at: 1, src: "assets/gameplay/minimap.webp", caption: {
    "zh-HK": "分區 overlay 同小地圖：住宅、商業、工業分區喺地圖上一目了然，劃地時揀好密度就交畀城市自己發展。",
    "zh-TW": "分區 overlay 與小地圖：住宅、商業、工業分區在地圖上一目了然，劃地時選好密度就交給城市自己發展。",
    "en": "Zone overlay and minimap: residential, commercial and industrial zones at a glance — pick a density, then let the city grow into it.",
    "ja": "区画オーバーレイとミニマップ：住宅・商業・工業の区画が一目でわかる。密度を選んだら、あとは街の成長に任せよう。" } }],
  growth: [
    { at: 1, src: "assets/gameplay/hillside.webp", caption: {
      "zh-HK": "山邊嘅低密度住宅：只會起 1×1 村屋、別墅同宗祠，永遠唔會變成大樓。",
      "zh-TW": "山邊的低密度住宅：只會蓋 1×1 的透天厝、別墅與宗祠，永遠不會變成大樓。",
      "en": "Low-density housing on the hillside: only 1×1 village houses, villas and ancestral halls ever appear here.",
      "ja": "山あいの低密度住宅：1×1 の村屋・別荘・祠堂だけが建ち、高層化することはない。" } },
    { at: "end", src: "assets/gameplay/newWaterfront.webp", caption: {
      "zh-HK": "海濱住宅區慢慢升級：地價、景觀同服務覆蓋到位，建築等級就會一級級升上去。",
      "zh-TW": "海濱住宅區慢慢升級：地價、景觀與服務覆蓋到位，建築等級就會一級級提升。",
      "en": "A waterfront district levelling up: once land value, views and services are in place, buildings climb the grades one step at a time.",
      "ja": "海辺の住宅区が少しずつ成長：地価・眺望・公共サービスが揃うと、建物のグレードが段階的に上がる。" } },
  ],
  economy: [{ at: 1, src: "assets/gameplay/containerPort.webp", caption: {
    "zh-HK": "貨櫃碼頭同工業區夜晚照常運作：工業同商業稅係城市收入嘅骨幹。",
    "zh-TW": "貨櫃碼頭與工業區夜間照常運作：工業與商業稅是城市收入的骨幹。",
    "en": "The container port and industrial zones keep working through the night — industrial and commercial tax are the backbone of city income.",
    "ja": "夜も稼働するコンテナ港と工業区：工業税と商業税が都市収入の柱になる。" } }],
  council: [{ at: 1, src: "assets/gameplay/legislativeCouncil.webp", caption: {
    "zh-HK": "立法會會議：議員有自己嘅立場同派系，法案通過與否會直接改變城市規則。",
    "zh-TW": "立法會會議：議員有自己的立場與派系，法案通過與否會直接改變城市規則。",
    "en": "A Legislative Council session: councillors have their own stances and factions, and whether a bill passes changes the city's rules.",
    "ja": "立法会の審議：議員にはそれぞれ立場と派閥があり、法案の可否が都市のルールを直接変える。" } }],
  environment: [{ at: 1, src: "assets/gameplay/sparklingWaterfront.webp", caption: {
    "zh-HK": "黃昏嘅海面：臨海、公園同景觀會推高地價；工業同交通就會帶嚟污染。",
    "zh-TW": "黃昏的海面：臨海、公園與景觀會推高地價；工業與交通則會帶來污染。",
    "en": "The harbour at dusk: waterfront, parks and views push land value up, while industry and traffic bring pollution.",
    "ja": "夕暮れの海：水辺・公園・眺望は地価を押し上げ、工業と交通は汚染をもたらす。" } }],
  weather: [
    { at: 1, src: "assets/gameplay/rainyNight.webp", caption: {
      "zh-HK": "落雨嘅晚上：天氣系統會影響交通、建築同市民心情。",
      "zh-TW": "下雨的晚上：天氣系統會影響交通、建築與市民心情。",
      "en": "A rainy night: the weather system affects traffic, buildings and how citizens feel.",
      "ja": "雨の夜：天候システムは交通・建物・市民の気分に影響する。" } },
    { at: "end", src: "assets/gameplay/cloudy.webp", caption: {
      "zh-HK": "雲層飄過城市：颱風季前後，留意天文台嘅風球信號。",
      "zh-TW": "雲層飄過城市：颱風季前後，留意天文台的風球信號。",
      "en": "Clouds drifting over the city: around typhoon season, keep an eye on the Observatory's signals.",
      "ja": "街の上を流れる雲：台風シーズンには天文台のシグナルに注意。" } },
  ],
  population: [{ at: 1, src: "assets/gameplay/citySence.webp", caption: {
    "zh-HK": "一座有香港氣息嘅城市：人口、快樂指數同失業率互相牽動，決定城市會唔會繼續增長。",
    "zh-TW": "一座有香港氣息的城市：人口、快樂指數與失業率互相牽動，決定城市會不會繼續成長。",
    "en": "A city with a Hong Kong feel: population, happiness and unemployment pull on each other and decide whether the city keeps growing.",
    "ja": "香港らしい街並み：人口・幸福度・失業率が互いに影響し、都市が成長し続けるかを決める。" } }],
  landmarks: [
    { at: 1, src: "assets/gameplay/buddhaAtNight.webp", caption: {
      "zh-HK": "夜訪大佛：人口達 12,000 就可以起，係最早解鎖嘅大型地標之一。",
      "zh-TW": "夜訪大佛：人口達 12,000 即可興建，是最早解鎖的大型地標之一。",
      "en": "The Big Buddha at night: unlocked at 12,000 population, one of the earliest large landmarks.",
      "ja": "夜の大仏：人口 12,000 で解禁される、最も早い大型ランドマークのひとつ。" } },
    { at: "end", src: "assets/gameplay/sportAndAttraction.webp", caption: {
      "zh-HK": "凌晨嘅海洋公園同大球場：兩者都要立法會決議或人口門檻先可以起。",
      "zh-TW": "凌晨的海洋公園與大球場：兩者都需要立法會決議或人口門檻才能興建。",
      "en": "Ocean Park and the stadium after midnight: both need a council resolution or a population threshold before they can be built.",
      "ja": "深夜の海洋公園とスタジアム：どちらも立法会の決議か人口条件を満たさないと建てられない。" } },
  ],
  transport: [
    { at: 1, src: "assets/gameplay/busTycoon.webp", caption: {
      "zh-HK": "經營自己嘅香城巴士公司：起車廠、開路線、買巴士，睇住班次同收入。",
      "zh-TW": "經營自己的香城巴士公司：蓋車廠、開路線、買巴士，看著班次與收入。",
      "en": "Running your own Heung Shing bus company: build a depot, open routes, buy buses and watch the timetable and takings.",
      "ja": "自分の香城バス会社を経営：車庫を建て、路線を開き、バスを買って、ダイヤと収入を見守る。" } },
    { at: "end", src: "assets/gameplay/airport.webp", caption: {
      "zh-HK": "玫瑰園國際機場：城市最大型嘅建設，需要立法會決議同穩定財政先可以動工。",
      "zh-TW": "玫瑰園國際機場：城市最大型的建設，需要立法會決議與穩定財政才能動工。",
      "en": "Rose Garden International Airport: the city's largest project, needing a council resolution and healthy finances before work can start.",
      "ja": "ローズガーデン国際空港：都市最大の建設事業で、立法会の決議と健全な財政が着工の条件。" } },
  ],
  "ai-news": [
    { at: 1, src: "assets/gameplay/news.webp", caption: {
      "zh-HK": "新聞頻道：城市大事會即時變成新聞報道，接駁 AI 後文字會更貼近當下城市狀況。",
      "zh-TW": "新聞頻道：城市大事會即時變成新聞報導，接上 AI 後文字會更貼近當下城市狀況。",
      "en": "The news channel: city events become news reports on the spot; with AI connected, the writing tracks the city's current state more closely.",
      "ja": "ニュースチャンネル：都市の出来事がその場でニュースになる。AI を接続すると、文章が今の都市の状況により沿ったものになる。" } },
    { at: "end", src: "assets/gameplay/heungShingForum.webp", caption: {
      "zh-HK": "香城討論區：市民留言、解鎖通知同議會消息都會喺度出現。",
      "zh-TW": "香城討論區：市民留言、解鎖通知與議會消息都會在這裡出現。",
      "en": "The Heung Shing Forum: citizen posts, unlock notices and council news all surface here.",
      "ja": "香城フォーラム：市民の投稿、解禁通知、議会のニュースがここに集まる。" } },
  ],
  districts: [{ at: 1, src: "assets/gameplay/nightSkyline.webp", caption: {
    "zh-HK": "夜晚嘅香城天際線：地圖上嘅雙語路牌標示每個分區嘅名字，可以隨時改名。",
    "zh-TW": "夜晚的香城天際線：地圖上的雙語路牌標示每個分區的名字，可以隨時改名。",
    "en": "The Heung Shing skyline at night: bilingual signs on the map mark every district's name, and you can rename them at any time.",
    "ja": "夜の香城スカイライン：地図上のバイリンガル標識が各地区の名前を示し、いつでも改名できる。" } }],
  ui: [{ at: 1, src: "assets/gameplay/nightSence.webp", caption: {
    "zh-HK": "頂欄一眼睇晒日期、時間、天氣、資金同人口；左邊係建設指引，右下係城市指標。",
    "zh-TW": "頂欄一眼看完日期、時間、天氣、資金與人口；左邊是建設指引，右下是城市指標。",
    "en": "The top bar shows date, time, weather, funds and population at a glance; the build guide sits on the left and city indicators bottom right.",
    "ja": "上部バーで日付・時刻・天気・資金・人口が一目でわかる。左は建設ガイド、右下は都市の指標。" } }],
};

for (const [language, guide] of Object.entries(SITE_GUIDE)) {
  for (const section of guide.sections) {
    const figures = SITE_GUIDE_FIGURES[section.id] || [];
    // Insert from the end first so earlier indices stay valid.
    for (const figure of [...figures].reverse()) {
      const block = { type: "figure", src: figure.src, caption: figure.caption[language] };
      if (figure.at === "end") section.blocks.push(block); else section.blocks.splice(figure.at, 0, block);
    }
  }
}

// ── Engine: lookup, rendering, language switching ───────────────────────────
let siteCurrentLanguage = SITE_DEFAULT_LANGUAGE;

function siteT(path) {
  const parts = path.split(".");
  let node = SITE_TEXT[siteCurrentLanguage];
  for (const part of parts) {
    if (node == null) return path;
    node = node[part];
  }
  return node == null ? path : node;
}

function setSiteLanguage(lang) {
  if (!SITE_LANGUAGES.includes(lang)) return;
  siteCurrentLanguage = lang;
  try {
    window.localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore - localStorage may be unavailable
  }
  applySiteLanguage();
}

function applyStaticText() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = siteT(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const [attr, key] = el.dataset.i18nAttr.split(":");
    el.setAttribute(attr, siteT(key));
  });
}

const SITE_GALLERY_SOURCES = [
  "assets/gameplay/citySence.webp",
  "assets/gameplay/sportAndAttraction.webp",
  "assets/gameplay/newWaterfront.webp",
  "assets/gameplay/hillside.webp",
  "assets/gameplay/sparklingWaterfront.webp",
  "assets/gameplay/waterfront.webp",
  "assets/gameplay/airport.webp",
  "assets/gameplay/containerPort.webp",
  "assets/gameplay/busTycoon.webp",
  "assets/gameplay/nightSence2.webp",
  "assets/gameplay/nightSkyline.webp",
  "assets/gameplay/buddhaAtNight.webp",
  "assets/gameplay/nightSence.webp",
  "assets/gameplay/rainyNight.webp",
  "assets/gameplay/cloudy.webp",
  "assets/gameplay/legislativeCouncil.webp",
  "assets/gameplay/heungShingForum.webp",
  "assets/gameplay/news.webp",
  "assets/gameplay/minimap.webp",
];

function getLocalizedGalleryItems() {
  const items = SITE_GALLERY[siteCurrentLanguage] || SITE_GALLERY[SITE_DEFAULT_LANGUAGE];
  return items.map((item, index) => ({ ...item, src: SITE_GALLERY_SOURCES[index] }));
}

function renderGalleryItems() {
  const grid = document.querySelector("[data-render='gallery']");
  if (!grid) return;
  grid.innerHTML = "";
  const items = getLocalizedGalleryItems();
  items.forEach((item, index) => {
    const figure = document.createElement("figure");
    figure.className = "gallery-item";

    const zoomButton = document.createElement("button");
    zoomButton.type = "button";
    zoomButton.className = "gallery-zoom";
    zoomButton.dataset.galleryOpen = "";
    zoomButton.dataset.gallerySrc = item.src;
    zoomButton.dataset.galleryTitle = item.title;
    zoomButton.dataset.galleryCaption = item.caption;
    zoomButton.dataset.galleryAlt = item.alt;
    zoomButton.setAttribute("aria-label", `${siteT("gallery.openImage")}：${item.title}`);

    const img = document.createElement("img");
    img.src = item.src;
    img.alt = item.alt;
    img.loading = "lazy";
    img.decoding = "async";

    const zoomHint = document.createElement("span");
    zoomHint.className = "gallery-zoom-hint";
    zoomHint.setAttribute("aria-hidden", "true");
    zoomHint.textContent = `＋ ${siteT("gallery.openImage")}`;

    const caption = document.createElement("figcaption");
    const number = document.createElement("span");
    number.className = "gallery-number";
    number.textContent = `${String(index + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
    const title = document.createElement("h3");
    title.textContent = item.title;
    const description = document.createElement("p");
    description.textContent = item.caption;

    zoomButton.append(img, zoomHint);
    caption.append(number, title, description);
    figure.append(zoomButton, caption);
    grid.appendChild(figure);
  });
}

function renderDownloadCards() {
  const cards = document.querySelectorAll("[data-render='download-card']");
  if (!cards.length) return;
  const localized = SITE_TEXT[siteCurrentLanguage].downloads.cards;
  cards.forEach((card, index) => {
    const info = localized[index];
    if (!info) return;
    card.querySelector("[data-field='platform']").textContent = info.platform;
    card.querySelector("[data-field='title']").textContent = info.title;
    card.querySelector("[data-field='desc']").textContent = info.desc;
    card.querySelector("[data-field='btn']").textContent = info.btn;
  });
}

function renderRequirements() {
  const tbody = document.querySelector("[data-render='requirements-table']");
  const notes = document.querySelector("[data-render='requirements-notes']");
  if (!tbody && !notes) return;
  const text = SITE_TEXT[siteCurrentLanguage]?.requirements || SITE_TEXT[SITE_DEFAULT_LANGUAGE].requirements;
  if (tbody) {
    const thead = tbody.closest("table")?.querySelector("thead tr");
    if (thead) {
      thead.innerHTML = "";
      text.headers.forEach((label) => {
        const th = document.createElement("th");
        th.textContent = label;
        thead.appendChild(th);
      });
    }
    tbody.innerHTML = "";
    text.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
  if (notes) {
    notes.innerHTML = "";
    text.notes.forEach((note) => {
      const li = document.createElement("li");
      li.textContent = note;
      notes.appendChild(li);
    });
  }
}

function renderFeatureList() {
  const container = document.querySelector("[data-render='feature-list']");
  if (!container) return;
  const items = SITE_FEATURE_LIST[siteCurrentLanguage] || SITE_FEATURE_LIST[SITE_DEFAULT_LANGUAGE];
  container.innerHTML = "";
  items.forEach((text) => {
    const span = document.createElement("span");
    span.textContent = text;
    container.appendChild(span);
  });
}

function renderChangelog() {
  const list = document.querySelector("[data-render='changelog']");
  if (!list) return;
  const releases = buildLocalizedChangelog(siteCurrentLanguage);
  list.innerHTML = "";
  releases.forEach((release, index) => {
    const article = document.createElement("article");
    article.className = index === 0 ? "release-card current-release" : "release-card";

    const meta = document.createElement("div");
    meta.className = "release-meta";
    const span = document.createElement("span");
    span.textContent = release.version;
    const time = document.createElement("time");
    time.setAttribute("datetime", release.date);
    time.textContent = release.dateLabel;
    meta.append(span, time);

    const h3 = document.createElement("h3");
    h3.textContent = release.title;

    const ul = document.createElement("ul");
    release.items.forEach((itemHtml) => {
      const li = document.createElement("li");
      li.innerHTML = itemHtml;
      ul.appendChild(li);
    });

    article.append(meta, h3, ul);
    list.appendChild(article);
  });
}

function renderLanguageSwitcher() {
  document.querySelectorAll("[data-language-switcher]").forEach((container) => {
    container.innerHTML = "";
    SITE_LANGUAGES.forEach((lang) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lang-btn" + (lang === siteCurrentLanguage ? " active" : "");
      button.textContent = SITE_LANGUAGE_LABELS[lang];
      button.setAttribute("aria-pressed", String(lang === siteCurrentLanguage));
      button.addEventListener("click", () => setSiteLanguage(lang));
      container.appendChild(button);
    });
  });
}

function applyMetaTags() {
  const text = SITE_TEXT[siteCurrentLanguage];
  const pageKey = document.body?.dataset.page;
  const pageText = ["copyright", "feedback", "news", "ads", "member"].includes(pageKey) ? text[pageKey] : null;
  const meta = pageText
    ? { title: pageText.metaTitle, description: pageText.intro, ogDescription: pageText.intro }
    : text.meta;
  document.title = meta.title;
  document.documentElement.lang = siteCurrentLanguage === "zh-HK" ? "zh-Hant-HK"
    : siteCurrentLanguage === "zh-TW" ? "zh-Hant-TW"
    : siteCurrentLanguage;
  const descTag = document.querySelector('meta[name="description"]');
  if (descTag) descTag.setAttribute("content", meta.description);
  const ogTitleTag = document.querySelector('meta[property="og:title"]');
  if (ogTitleTag) ogTitleTag.setAttribute("content", meta.title);
  const ogDescTag = document.querySelector('meta[property="og:description"]');
  if (ogDescTag) ogDescTag.setAttribute("content", meta.ogDescription);
}

function renderGuidePage() {
  const bodyEl = document.querySelector("[data-render='guide-body']");
  if (!bodyEl) return;
  const guide = SITE_GUIDE[siteCurrentLanguage] || SITE_GUIDE[SITE_DEFAULT_LANGUAGE];
  document.title = guide.metaTitle;
  const descTag = document.querySelector('meta[name="description"]');
  if (descTag) descTag.setAttribute("content", guide.metaDescription);

  const titleEl = document.querySelector("[data-render='guide-title']");
  if (titleEl) titleEl.textContent = guide.pageTitle;

  const introEl = document.querySelector("[data-render='guide-intro']");
  if (introEl) {
    introEl.innerHTML = "";
    introEl.appendChild(document.createTextNode(guide.pageIntro + " "));
    const link = document.createElement("a");
    link.href = "#landmarks";
    link.textContent = guide.pageIntroManualLink;
    introEl.appendChild(link);
    introEl.appendChild(document.createTextNode(guide.pageIntroSuffix));
  }

  const tocEl = document.querySelector("[data-render='guide-toc']");
  if (tocEl) tocEl.innerHTML = "";
  bodyEl.innerHTML = "";

  guide.sections.forEach((section) => {
    if (tocEl) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${section.id}`;
      a.textContent = section.title;
      li.appendChild(a);
      tocEl.appendChild(li);
    }
    if (!bodyEl) return;
    const sectionEl = document.createElement("section");
    sectionEl.id = section.id;
    sectionEl.className = "guide-section";
    const h2 = document.createElement("h2");
    h2.textContent = section.title;
    sectionEl.appendChild(h2);
    section.blocks.forEach((block) => {
      if (block.type === "p") {
        const p = document.createElement("p");
        p.textContent = block.text;
        sectionEl.appendChild(p);
      } else if (block.type === "h3") {
        const h3 = document.createElement("h3");
        h3.textContent = block.text;
        sectionEl.appendChild(h3);
      } else if (block.type === "ul") {
        const ul = document.createElement("ul");
        block.items.forEach((item) => {
          const li = document.createElement("li");
          if (item && typeof item === "object") {
            if (item.label) {
              const strong = document.createElement("strong");
              strong.textContent = `${item.label}：`;
              li.appendChild(strong);
            }
            li.appendChild(document.createTextNode(item.text));
          } else {
            li.textContent = item;
          }
          ul.appendChild(li);
        });
        sectionEl.appendChild(ul);
      } else if (block.type === "figure") {
        const figure = document.createElement("figure");
        figure.className = "guide-figure";
        const img = document.createElement("img");
        img.src = block.src;
        img.alt = block.caption;
        img.loading = "lazy";
        img.decoding = "async";
        img.width = 1600;
        img.height = 900;
        const caption = document.createElement("figcaption");
        caption.textContent = block.caption;
        figure.append(img, caption);
        sectionEl.appendChild(figure);
      } else if (block.type === "link") {
        const p = document.createElement("p");
        p.className = "guide-link";
        const a = document.createElement("a");
        a.href = block.href;
        a.textContent = block.text;
        p.appendChild(a);
        sectionEl.appendChild(p);
      } else if (block.type === "table") {
        const wrap = document.createElement("div");
        wrap.className = "manual-table-wrap";
        const table = document.createElement("table");
        table.className = "manual-table";
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        block.head.forEach((label) => {
          const th = document.createElement("th");
          th.textContent = label;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        const tbody = document.createElement("tbody");
        block.rows.forEach((row) => {
          const tr = document.createElement("tr");
          row.forEach((cell) => {
            const td = document.createElement("td");
            td.textContent = cell;
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.append(thead, tbody);
        wrap.appendChild(table);
        sectionEl.appendChild(wrap);
      }
    });
    bodyEl.appendChild(sectionEl);
  });

  const tocLabel = document.querySelector("[data-render='guide-toc-label']");
  if (tocLabel) tocLabel.textContent = guide.toc;
}

function applySiteLanguage() {
  applyMetaTags();
  applyStaticText();
  renderGalleryItems();
  renderDownloadCards();
  renderRequirements();
  renderFeatureList();
  renderChangelog();
  renderGuidePage();
  renderLanguageSwitcher();
  document.dispatchEvent(new CustomEvent("sitelanguagechange", { detail: { language: siteCurrentLanguage } }));
}

document.addEventListener("DOMContentLoaded", () => {
  siteCurrentLanguage = detectSiteLanguage();
  applySiteLanguage();
});
