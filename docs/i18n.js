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
    { alt: "城市頂部天氣狀態列，顯示溫度、濕度同暴雨警告徽章", caption: "即時天氣狀態列：溫度、濕度、風球同暴雨警告一目了然，天色仲會隨天氣變暗。" },
    { alt: "香城討論區視窗，顯示颱風同暴雨相關熱話帖文", caption: "香城討論區：城中大小事都有花生友即時討論，颱風、股市、旅遊熱話一應俱全。" },
    { alt: "立法會特別議案討論畫面，顯示議員支持或保留立場", caption: "立法會議事廳：提出特別議案、睇晒每位議員嘅取態，仲可以即場拍板批准。" },
    { alt: "股票交易所視窗，顯示恒生指數同企業股票報價", caption: "股票交易所：恒生指數、企業股票報價，同法案生效狀態即時連動。" },
    { alt: "玫瑰園國際機場，多架客機同時喺停機坪同跑道運作", caption: "機場正式投入運作：客機沿彎曲航線降落、滑行入閘再起飛，一個機場最多三四架同時繁忙。" },
    { alt: "住宅街道車流，小巴沿路駛過屋苑同商店", caption: "真實車流：小巴、巴士、的士沿香港左側行車方向穿梭大街小巷。" },
    { alt: "夜景街道，密集霓虹招牌同街市攤檔", caption: "建築款式愈嚟愈多元，由霓虹招牌到街市大牌檔，城市面貌隨遊戲進度豐富起嚟。" },
    { alt: "城市入面嘅將軍澳雙語分區路牌", caption: "自訂雙語分區路牌，為你城市每一區起中英文名。" },
    { alt: "分區命名對話框", caption: "隨時改名、隨時重劃，分區數據會即時反映落地區新聞入面。" },
    { alt: "重新命名城市對話框，可以設定中英文城市名同揀名牌顏色", caption: "城市可以隨時改中英文名，仲可以揀返個靚色名牌。" },
    { alt: "AI 新聞設定視窗，連接 Ollama 雲端", caption: "免費連接 Ollama Cloud，貼上一次 API key 就可以啟用 AI 新聞標題。" },
  ],
  "zh-TW": [
    { alt: "城市頂部天氣狀態列，顯示溫度、濕度和暴雨警告徽章", caption: "即時天氣狀態列：溫度、濕度、風球和暴雨警告一目了然，天色還會隨天氣變暗。" },
    { alt: "香城討論區視窗，顯示颱風和暴雨相關熱門貼文", caption: "香城討論區：城裡大小事都有網友即時討論，颱風、股市、觀光話題應有盡有。" },
    { alt: "立法會特別議案討論畫面，顯示議員支持或保留立場", caption: "立法會議事廳：提出特別議案、看清楚每位議員的態度，還能當場拍板核准。" },
    { alt: "股票交易所視窗，顯示恒生指數和企業股票報價", caption: "股票交易所：恒生指數、企業股票報價，和法案生效狀態即時連動。" },
    { alt: "玫瑰園國際機場，多架客機同時在停機坪和跑道運作", caption: "機場正式啟用：客機沿曲線航路降落、滑行入閘再起飛，一座機場最多三四架同時繁忙運作。" },
    { alt: "住宅街道車流，小巴沿路駛過社區和商店", caption: "真實車流：小巴、公車、計程車依香港靠左行車方向穿梭大街小巷。" },
    { alt: "夜景街道，密集霓虹招牌和市集攤位", caption: "建築款式越來越多元，從霓虹招牌到市集大牌檔，城市面貌隨遊戲進度日益豐富。" },
    { alt: "城市裡的將軍澳雙語分區路牌", caption: "自訂雙語分區路牌，為你的城市每一區取中英文名。" },
    { alt: "分區命名對話框", caption: "隨時改名、隨時重劃，分區數據會即時反映在地區新聞裡。" },
    { alt: "重新命名城市對話框，可以設定中英文城市名並選擇名牌顏色", caption: "城市可以隨時改中英文名稱，還能挑選喜歡的名牌顏色。" },
    { alt: "AI 新聞設定視窗，連接 Ollama 雲端", caption: "免費連接 Ollama Cloud，貼上一次 API key 就可以啟用 AI 新聞標題。" },
  ],
  en: [
    { alt: "Weather status bar at the top of the city, showing temperature, humidity and rainstorm warning badges", caption: "Live weather status bar: temperature, humidity, typhoon signal and rainstorm warnings at a glance, with the sky darkening to match." },
    { alt: "Heung Shing Forum window showing typhoon and rainstorm trending posts", caption: "Heung Shing Forum: netizens discuss everything from typhoons to the stock market to tourism, live." },
    { alt: "Legislative Council special resolution debate screen showing member support and reservations", caption: "Legislative Council chamber: propose special resolutions, see exactly where every member stands, and approve on the spot." },
    { alt: "Stock exchange window showing the Hang Seng Index and listed company quotes", caption: "Stock Exchange: the Hang Seng Index and listed company quotes update live alongside bill outcomes." },
    { alt: "Rose Garden International Airport with several aircraft active on the apron and runway at once", caption: "The airport in full swing: aircraft land along curved flight paths, taxi to a gate and take off again, with three or four active at once." },
    { alt: "Residential street traffic, a minibus driving past housing estates and shops", caption: "Real traffic: minibuses, buses and taxis weave through the streets, driving on the left, Hong Kong-style." },
    { alt: "Night-time street scene with dense neon signage and market stalls", caption: "Building variety keeps growing - from neon-lit shopfronts to open-air markets, the cityscape gets richer as you play." },
    { alt: "Bilingual district signage for Tseung Kwan O in the city", caption: "Custom bilingual district signage - give every district in your city an English and Chinese name." },
    { alt: "District naming dialog", caption: "Rename or redraw districts any time; district data feeds straight into local news." },
    { alt: "Rename City dialog for setting a bilingual city name and nameplate colour", caption: "Rename your city in Chinese and English any time, and pick a nameplate colour to match." },
    { alt: "AI news setup window connecting to Ollama Cloud", caption: "Connect Ollama Cloud for free - paste an API key once to enable AI-written news headlines." },
  ],
  ja: [
    { alt: "都市上部の天気ステータスバー。気温、湿度、暴風雨警報バッジを表示", caption: "リアルタイム天気バー：気温、湿度、台風シグナル、暴風雨警報がひと目でわかり、空も天候に合わせて暗くなります。" },
    { alt: "台風・暴風雨関連の話題を表示する香城フォーラムウィンドウ", caption: "香城フォーラム：台風から株式市場、観光話題まで、都市のあらゆる出来事をユーザーがリアルタイムで語り合います。" },
    { alt: "議員の賛成・保留の立場を示す立法会の特別決議審議画面", caption: "立法会議事堂：特別決議を提出し、各議員の立場を一目で確認、その場で承認できます。" },
    { alt: "ハンセン指数と上場企業の株価を表示する証券取引所ウィンドウ", caption: "証券取引所：ハンセン指数と上場企業の株価が、法案の可決結果と連動してリアルタイムに変動します。" },
    { alt: "複数の航空機がエプロンと滑走路で同時に稼働するローズガーデン国際空港", caption: "空港がフル稼働：航空機は曲線飛行経路で着陸し、ゲートへタキシングして再び離陸。1つの空港で同時に3〜4機が稼働します。" },
    { alt: "住宅街を走るミニバスなど、街路の交通の様子", caption: "リアルな交通：ミニバス、バス、タクシーが香港式の左側通行で街中を行き交います。" },
    { alt: "ネオン看板や市場の屋台が密集する夜の街並み", caption: "建物のバリエーションが続々増加中——ネオン輝く店先から屋台の市場まで、プレイが進むほど街並みが豊かになります。" },
    { alt: "都市内の将軍澳（バイリンガル地区標識）", caption: "カスタムバイリンガル地区標識 - 都市内の各地区に英語と中国語の名前を付けられます。" },
    { alt: "地区名変更ダイアログ", caption: "いつでも改名・区画変更可能。地区データはそのまま地域ニュースに反映されます。" },
    { alt: "バイリンガルの都市名とネームプレートの色を設定する都市名変更ダイアログ", caption: "都市の中英文名称はいつでも変更可能。お気に入りの色のネームプレートも選べます。" },
    { alt: "Ollama Cloud に接続する AI ニュース設定ウィンドウ", caption: "Ollama Cloud に無料接続 - API キーを一度貼り付けるだけで AI 生成ニュース見出しが有効になります。" },
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
  "zh-HK": ["本機存檔系統", "電力與發電廠管理", "經典城市 overlay", "財政與政策系統", "選用雲端 AI 人物新聞", "立法會與十位官員議員", "真實颱風信號與天氣效果", "zoom 連動環境白噪音"],
  "zh-TW": ["本機存檔系統", "電力與發電廠管理", "經典城市 overlay", "財政與政策系統", "選用雲端 AI 人物新聞", "立法會與十位官員議員", "真實颱風信號與天氣效果", "縮放連動環境白噪音"],
  en: ["Local save system", "Power grid and plant management", "Classic city overlays", "Fiscal and policy system", "Optional cloud AI character news", "Legislative Council with ten officials", "Realistic typhoon signals and weather effects", "Zoom-linked ambient soundscape"],
  ja: ["ローカルセーブシステム", "電力網・発電所管理", "クラシックな都市オーバーレイ", "財政・政策システム", "オプションのクラウド AI キャラクターニュース", "10人の議員による立法会", "本格的な台風シグナルと天候演出", "ズーム連動の環境サウンド"],
};

// ── Changelog ─────────────────────────────────────────────────────────────────
const SITE_CHANGELOG = {
  "zh-HK": [
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
      description: "下載香城模擬器 v3.9.0「好岸居」：住宅同商業建築機率全面重整，貼近香港真實房屋政策，加入低密度規劃永久鎖定。",
      ogDescription: "v3.9.0 好岸居：公共/私人房屋分佈重新平衡，低密度地永久鎖定唔會被起返屋邨，5x5 大廈同全新街市場景登場。",
    },
    nav: { gallery: "截圖", downloads: "下載", manual: "玩家手冊", guide: "遊戲指南", stats: "統計", changelog: "版本", github: "GitHub" },
    hero: {
      eyebrowPrefix: "香城模擬器",
      title: "香城模擬器",
      lede: "一款向 SimCity 2000 致敬的城市建設遊戲。v3.10.0「廟街煲仔飯」大城市效能全面提升，補完 300 個日文翻譯漏洞，官網加入四語言支援同全新遊戲指南頁。",
      downloadBtn: "下載遊戲",
      latestBtn: "最新版本",
      guideBtn: "睇遊戲指南",
    },
    gallery: { eyebrow: "Screenshots", title: "遊戲截圖" },
    stats: {
      latestVersion: "最新版本",
      latestDownloads: "最新版本下載",
      allDownloads: "全部版本下載",
      totalViews: "入口瀏覽",
      loading: "載入中",
      publishedSuffix: "發布",
      downloadsUnit: "次下載",
      notAvailable: "暫未提供",
      downloadCountNotAvailable: "下載數暫時讀不到",
      viewsNotAvailable: "瀏覽次數暫未提供",
      viewsAlt: "入口瀏覽次數",
    },
    downloads: {
      eyebrow: "Downloads",
      title: "選擇你的平台",
      cards: [
        { platform: "macOS", title: "Mac Apple Silicon", desc: "適合 M1、M2、M3、M4 或更新的 Mac。下載 DMG 後拖入「應用程式」即可安裝。", btn: "下載 ARM64 DMG" },
        { platform: "macOS", title: "Mac Intel", desc: "適合 Intel CPU 的 Mac。下載 DMG 後拖入「應用程式」即可安裝。", btn: "下載 Intel DMG" },
        { platform: "Windows", title: "Windows 安裝版", desc: "推薦大部分玩家使用。安裝後會加入一般應用程式捷徑。", btn: "下載安裝版 EXE" },
        { platform: "Windows", title: "Windows 免安裝版", desc: "不用安裝，下載後直接執行。適合快速試玩或分享給朋友。", btn: "下載免安裝版 EXE" },
      ],
      notice: "AI 新聞屬選用功能。安裝後請在「設定 → AI 新聞」貼上你自己嘅 Ollama API key；遊戲及安裝檔不包含任何開發者密鑰。未設定 AI 亦可照常使用模擬新聞。現時安裝檔尚未完成簽章，macOS Gatekeeper 或 Windows SmartScreen 可能會在第一次開啟時要求確認。",
    },
    manual: {
      eyebrow: "User Manual",
      title: "特殊建築解鎖規格",
      intro: "除資金、空地及 footprint 外，以下建築需要額外城市條件。首次達標時，遊戲走馬燈及香城討論區會發出一次解鎖通知。",
      tableHeaders: ["建築", "解鎖條件", "上限／選單行為"],
      notesTitle: "分區自然生成",
      sourceLink: "閱讀完整數值規格",
      guideLink: "睇完整遊戲規則指南 →",
    },
    changelog: { eyebrow: "Release Notes", title: "版本變更說明" },
    features: {
      title: "建設、治理、迭代",
      desc: "劃設住宅、商業與工業區，興建道路、公園、公共設施與發電廠。放置雙語路牌建立分區，觀察地區交通、醫療、教育與污染，再由 AI 或模擬新聞報道城市變化。",
    },
    footer: { releaseInfo: "版本資訊", blog: "開發blog" },
  },
  "zh-TW": {
    meta: {
      title: "香城模擬器 | The City of Heung Shing",
      description: "下載香城模擬器 v3.9.0「好岸居」：住宅和商業建築機率全面調整，貼近香港真實住宅政策，加入低密度規劃永久鎖定。",
      ogDescription: "v3.9.0 好岸居：公共/私人住宅分佈重新平衡，低密度地永久鎖定不會被改建成大樓，5x5 大廈和全新市場場景登場。",
    },
    nav: { gallery: "截圖", downloads: "下載", manual: "玩家手冊", guide: "遊戲指南", stats: "統計", changelog: "版本", github: "GitHub" },
    hero: {
      eyebrowPrefix: "香城模擬器",
      title: "香城模擬器",
      lede: "一款向 SimCity 2000 致敬的城市建設遊戲。v3.10.0「廟街煲仔飯」大城市效能全面提升，補齊 300 個日文翻譯缺口，官網加入四種語言支援和全新遊戲指南頁。",
      downloadBtn: "下載遊戲",
      latestBtn: "最新版本",
      guideBtn: "查看遊戲指南",
    },
    gallery: { eyebrow: "Screenshots", title: "遊戲截圖" },
    stats: {
      latestVersion: "最新版本",
      latestDownloads: "最新版本下載次數",
      allDownloads: "全部版本下載次數",
      totalViews: "網站瀏覽次數",
      loading: "載入中",
      publishedSuffix: "發布",
      downloadsUnit: "次下載",
      notAvailable: "暫無資料",
      downloadCountNotAvailable: "下載次數暫時無法讀取",
      viewsNotAvailable: "瀏覽次數暫無資料",
      viewsAlt: "網站瀏覽次數",
    },
    downloads: {
      eyebrow: "Downloads",
      title: "選擇你的平台",
      cards: [
        { platform: "macOS", title: "Mac Apple Silicon", desc: "適合 M1、M2、M3、M4 或更新的 Mac。下載 DMG 後拖曳到「應用程式」即可安裝。", btn: "下載 ARM64 DMG" },
        { platform: "macOS", title: "Mac Intel", desc: "適合 Intel CPU 的 Mac。下載 DMG 後拖曳到「應用程式」即可安裝。", btn: "下載 Intel DMG" },
        { platform: "Windows", title: "Windows 安裝版", desc: "推薦大多數玩家使用。安裝後會加入一般應用程式捷徑。", btn: "下載安裝版 EXE" },
        { platform: "Windows", title: "Windows 免安裝版", desc: "不用安裝，下載後直接執行。適合快速試玩或分享給朋友。", btn: "下載免安裝版 EXE" },
      ],
      notice: "AI 新聞屬選用功能。安裝後請在「設定 → AI 新聞」貼上你自己的 Ollama API key；遊戲及安裝檔不包含任何開發者金鑰。未設定 AI 也可照常使用模擬新聞。目前安裝檔尚未完成簽章，macOS Gatekeeper 或 Windows SmartScreen 可能會在第一次開啟時要求確認。",
    },
    manual: {
      eyebrow: "User Manual",
      title: "特殊建築解鎖規格",
      intro: "除資金、空地及 footprint 外，以下建築需要額外城市條件。首次達標時，遊戲跑馬燈及香城討論區會發出一次解鎖通知。",
      tableHeaders: ["建築", "解鎖條件", "上限／選單行為"],
      notesTitle: "分區自然生成",
      sourceLink: "閱讀完整數值規格",
      guideLink: "查看完整遊戲規則指南 →",
    },
    changelog: { eyebrow: "Release Notes", title: "版本更新說明" },
    features: {
      title: "建設、治理、迭代",
      desc: "劃設住宅、商業與工業區，興建道路、公園、公共設施與發電廠。放置雙語路牌建立分區，觀察地區交通、醫療、教育與污染，再由 AI 或模擬新聞報導城市變化。",
    },
    footer: { releaseInfo: "版本資訊", blog: "開發部落格" },
  },
  en: {
    meta: {
      title: "The City of Heung Shing | 香城模擬器",
      description: "Download The City of Heung Shing v3.9.0 “Good Home”: a full rebalance of residential/commercial building odds to match Hong Kong's real housing policy, plus a permanent low-density planning lock.",
      ogDescription: "v3.9.0 Good Home: rebalanced public/private housing distribution, a permanent low-density lock so it can never be rebuilt into towers, 5x5 towers and new street-market scenes.",
    },
    nav: { gallery: "Screenshots", downloads: "Download", manual: "Manual", guide: "Game Guide", stats: "Stats", changelog: "Changelog", github: "GitHub" },
    hero: {
      eyebrowPrefix: "The City of Heung Shing",
      title: "The City of Heung Shing",
      lede: "A city-builder that pays tribute to SimCity 2000. v3.10.0 “Temple Street Claypot Rice” brings major performance improvements for large cities, completes 300 missing Japanese translations, and adds four-language support plus a brand-new game guide page to the website.",
      downloadBtn: "Download",
      latestBtn: "Latest release",
      guideBtn: "Read the game guide",
    },
    gallery: { eyebrow: "Screenshots", title: "Screenshots" },
    stats: {
      latestVersion: "Latest version",
      latestDownloads: "Latest version downloads",
      allDownloads: "All-time downloads",
      totalViews: "Page views",
      loading: "Loading",
      publishedSuffix: "",
      publishedPrefix: "Published ",
      downloadsUnit: "downloads",
      notAvailable: "Not available yet",
      downloadCountNotAvailable: "Download count unavailable",
      viewsNotAvailable: "View count unavailable",
      viewsAlt: "Page view count",
    },
    downloads: {
      eyebrow: "Downloads",
      title: "Choose your platform",
      cards: [
        { platform: "macOS", title: "Mac Apple Silicon", desc: "For M1, M2, M3, M4 or newer Macs. Download the DMG and drag it into Applications to install.", btn: "Download ARM64 DMG" },
        { platform: "macOS", title: "Mac Intel", desc: "For Intel-based Macs. Download the DMG and drag it into Applications to install.", btn: "Download Intel DMG" },
        { platform: "Windows", title: "Windows Installer", desc: "Recommended for most players. Adds a standard shortcut after installing.", btn: "Download Setup EXE" },
        { platform: "Windows", title: "Windows Portable", desc: "No installation needed - download and run directly. Great for a quick trial or sharing with friends.", btn: "Download Portable EXE" },
      ],
      notice: "AI news is an optional feature. After installing, paste your own Ollama API key under Settings → AI News; the game and installer never bundle any developer key. The game works fine with simulated news if you skip AI setup. Installers aren't code-signed yet, so macOS Gatekeeper or Windows SmartScreen may prompt for confirmation the first time you open them.",
    },
    manual: {
      eyebrow: "User Manual",
      title: "Special Building Unlock Specs",
      intro: "Beyond funds, empty space and footprint, the buildings below need extra city conditions. The first time a condition is met, the in-game ticker and the Heung Shing Forum post a one-time unlock notice.",
      tableHeaders: ["Building", "Unlock condition", "Cap / menu behaviour"],
      notesTitle: "Zone auto-generation",
      sourceLink: "Read the full numeric spec",
      guideLink: "Read the full game guide →",
    },
    changelog: { eyebrow: "Release Notes", title: "Release Notes" },
    features: {
      title: "Build, govern, iterate",
      desc: "Zone residential, commercial and industrial land, build roads, parks, public services and power plants. Place bilingual district signs to define neighbourhoods, watch local traffic, healthcare, education and pollution, then read about it all in AI-written or simulated news.",
    },
    footer: { releaseInfo: "Release info", blog: "Dev blog" },
  },
  ja: {
    meta: {
      title: "香城模擬器 | The City of Heung Shing",
      description: "香城模擬器 v3.9.0「好岸居」をダウンロード：住宅・商業建築の出現確率を香港の実際の住宅政策に合わせて全面調整し、低密度計画の永久ロックを追加。",
      ogDescription: "v3.9.0 好岸居：公共・民間住宅の分布を再調整。低密度地は永久ロックされタワーに建て替えられなくなり、5x5タワーと新しい市場シーンも登場。",
    },
    nav: { gallery: "スクリーンショット", downloads: "ダウンロード", manual: "プレイヤーマニュアル", guide: "ゲームガイド", stats: "統計", changelog: "更新履歴", github: "GitHub" },
    hero: {
      eyebrowPrefix: "香城模擬器",
      title: "香城模擬器",
      lede: "SimCity 2000 に敬意を表した都市builderゲーム。v3.10.0「廟街の土鍋ご飯」で大都市のパフォーマンスを大幅改善し、300件の日本語翻訳漏れを補完。公式サイトには4言語対応と新しいゲームガイドページも追加されました。",
      downloadBtn: "ダウンロード",
      latestBtn: "最新リリース",
      guideBtn: "ゲームガイドを見る",
    },
    gallery: { eyebrow: "Screenshots", title: "スクリーンショット" },
    stats: {
      latestVersion: "最新バージョン",
      latestDownloads: "最新版のダウンロード数",
      allDownloads: "累計ダウンロード数",
      totalViews: "サイト閲覧数",
      loading: "読み込み中",
      publishedSuffix: "公開",
      downloadsUnit: "回ダウンロード",
      notAvailable: "現在利用できません",
      downloadCountNotAvailable: "ダウンロード数を取得できません",
      viewsNotAvailable: "閲覧数は現在取得できません",
      viewsAlt: "サイト閲覧数",
    },
    downloads: {
      eyebrow: "Downloads",
      title: "プラットフォームを選択",
      cards: [
        { platform: "macOS", title: "Mac Apple Silicon", desc: "M1、M2、M3、M4以降のMacに対応。DMGをダウンロードして「アプリケーション」にドラッグすればインストール完了です。", btn: "ARM64 DMG をダウンロード" },
        { platform: "macOS", title: "Mac Intel", desc: "Intel搭載Macに対応。DMGをダウンロードして「アプリケーション」にドラッグすればインストール完了です。", btn: "Intel DMG をダウンロード" },
        { platform: "Windows", title: "Windows インストーラー版", desc: "ほとんどのプレイヤーにおすすめ。インストール後、通常のショートカットが追加されます。", btn: "インストーラー EXE をダウンロード" },
        { platform: "Windows", title: "Windows ポータブル版", desc: "インストール不要、ダウンロード後すぐ実行できます。お試しプレイや友人との共有に最適です。", btn: "ポータブル EXE をダウンロード" },
      ],
      notice: "AIニュースはオプション機能です。インストール後、「設定 → AIニュース」でご自身のOllama APIキーを貼り付けてください。ゲームおよびインストーラーには開発者のキーは一切含まれていません。AIを設定しなくてもシミュレーテッドニュースは通常通り利用できます。現在インストーラーはコード署名が未完了のため、初回起動時にmacOS GatekeeperやWindows SmartScreenが確認を求める場合があります。",
    },
    manual: {
      eyebrow: "User Manual",
      title: "特殊建築の解禁条件",
      intro: "資金・空き地・フットプリントに加え、以下の建築には追加の都市条件が必要です。条件を初めて満たすと、ゲーム内ティッカーと香城フォーラムに解禁通知が一度だけ表示されます。",
      tableHeaders: ["建築", "解禁条件", "上限／メニューの挙動"],
      notesTitle: "区画の自然発生",
      sourceLink: "詳細な数値仕様を読む",
      guideLink: "完全なゲームガイドを見る →",
    },
    changelog: { eyebrow: "Release Notes", title: "更新履歴" },
    features: {
      title: "建設・統治・改善を繰り返す",
      desc: "住宅・商業・工業地区を区画し、道路・公園・公共施設・発電所を建設。バイリンガルの地区標識で街区を定義し、地域の交通・医療・教育・汚染状況を観察しながら、AIまたはシミュレーテッドニュースで都市の変化を追いましょう。",
    },
    footer: { releaseInfo: "リリース情報", blog: "開発ブログ" },
  },
};

// ── Full game guide page content ─────────────────────────────────────────────
// Structured as sections of typed blocks so guide.html can render it
// generically: { type: 'p' }, { type: 'ul', items }, { type: 'table', head, rows }.
const SITE_GUIDE = {
  "zh-HK": {
    metaTitle: "遊戲指南 | 香城模擬器",
    metaDescription: "香城模擬器完整遊戲規則指南：分區密度、經濟稅收、立法會、天氣颱風、特殊建築解鎖同交通系統一次睇晒。",
    pageTitle: "遊戲指南",
    pageIntro: "呢頁詳細講解香城模擬器嘅所有核心機制——由分區起樓到立法會投票，由股市炒賣到八號風球。想快速查建築解鎖數值，可以睇返首頁嘅",
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
          { type: "p", text: "以下建築喺資金、空地同 footprint 之外，仲需要達到額外城市條件先可以起（表格同首頁「玩家手冊」一致，呢度作為完整版收錄）：" },
          { type: "table", head: ["建築", "解鎖條件", "上限"], rows: [
            ["社區廟宇", "人口 3,000", "最多 4 座"],
            ["教堂", "人口 5,000", "最多 2 座"],
            ["立法會", "人口 10,000", "最多 1 座"],
            ["大佛", "人口 12,000", "最多 1 座"],
            ["大型廟宇", "人口 12,000；城市吸引力 35", "最多 1 座"],
            ["太空館", "人口 15,000；「科研發展法」生效", "最多 1 座"],
            ["貨櫃碼頭", "人口 15,000；4×4 footprint 貼住連續四格水邊", "不限數量"],
            ["文化中心", "人口 20,000", "最多 1 座"],
            ["會展中心／紅磡體育館", "人口 30,000", "各最多 1 座"],
            ["海洋公園", "立法會；人口 35,000；月收入 $6,000；月盈餘 $1,000；經濟 50；決議獲批", "最多 1 座"],
            ["城超聯主場", "人口 40,000", "最多 1 座"],
            ["股票交易所", "立法會；人口 50,000；「股票交易所法案」生效", "最多 1 座"],
            ["美利樓", "城市吸引力 60", "最多 1 座"],
            ["玫瑰園國際機場", "立法會；人口 80,000；月收入 $12,000；月盈餘 $2,000；經濟 65；決議獲批", "最多 1 座"],
          ] },
          { type: "p", text: "首次達標嗰陣，遊戲走馬燈同香城討論區都會刊登一次解鎖通知。" },
        ],
      },
      {
        id: "transport",
        title: "九、交通、機場與貨櫃碼頭",
        blocks: [
          { type: "p", text: "道路每格 $10，橋樑每格 $75，維修開支跟返道路部門撥款滑桿浮動。交通壓力會按住宅／商業／工業嘅密度同建築規模產生，沿路網擴散，塞車情況會拖低快樂指數同商業／住宅需求。" },
          { type: "p", text: "巴士小巴純粹係背景視覺車流，唔使玩家安排路線，八號風球或以上會即時停駛。" },
          { type: "p", text: "機場（12×12，經「我愛玫瑰園計劃」解鎖）同貨櫃碼頭（4×4，人口 15,000 解鎖）都係視覺化模擬：飛機沿固定校準航線降落、滑行去閘口、再起飛，一次大約 3 至 4 架同時運作；船隻就沿岸邊校準路線入港靠泊、交換貨物、鳴笛離港。兩者喺八號風球或以上都會暫停運作。" },
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
    pageIntro: "這頁詳細說明香城模擬器的所有核心機制——從分區蓋房到立法會投票，從股市操作到八號風球。想快速查建築解鎖數值，可以看首頁的",
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
          { type: "p", text: "以下建築除了資金、空地和 footprint 之外，還需要達到額外城市條件才能興建（表格與首頁「玩家手冊」一致，這裡收錄完整版）：" },
          { type: "table", head: ["建築", "解鎖條件", "上限"], rows: [
            ["社區廟宇", "人口 3,000", "最多 4 座"],
            ["教堂", "人口 5,000", "最多 2 座"],
            ["立法會", "人口 10,000", "最多 1 座"],
            ["大佛", "人口 12,000", "最多 1 座"],
            ["大型廟宇", "人口 12,000；城市吸引力 35", "最多 1 座"],
            ["太空館", "人口 15,000；「科研發展法」生效", "最多 1 座"],
            ["貨櫃碼頭", "人口 15,000；4×4 footprint 緊貼連續四格水邊", "不限數量"],
            ["文化中心", "人口 20,000", "最多 1 座"],
            ["會展中心／紅磡體育館", "人口 30,000", "各最多 1 座"],
            ["海洋公園", "立法會；人口 35,000；月收入 $6,000；月盈餘 $1,000；經濟 50；決議獲通過", "最多 1 座"],
            ["城超聯主場", "人口 40,000", "最多 1 座"],
            ["證券交易所", "立法會；人口 50,000；「證券交易所法案」生效", "最多 1 座"],
            ["美利樓", "城市吸引力 60", "最多 1 座"],
            ["玫瑰園國際機場", "立法會；人口 80,000；月收入 $12,000；月盈餘 $2,000；經濟 65；決議獲通過", "最多 1 座"],
          ] },
          { type: "p", text: "第一次達標時，遊戲跑馬燈和香城討論區都會刊登一次解鎖通知。" },
        ],
      },
      {
        id: "transport",
        title: "九、交通、機場與貨櫃碼頭",
        blocks: [
          { type: "p", text: "道路每格 $10，橋樑每格 $75，維修支出跟著道路部門撥款滑桿浮動。交通壓力會依住宅／商業／工業的密度和建築規模產生，沿路網擴散，塞車情況會拉低快樂指數和商業／住宅需求。" },
          { type: "p", text: "公車小巴純粹是背景視覺車流，不需要玩家安排路線，八號風球或以上會立即停駛。" },
          { type: "p", text: "機場（12×12，經「玫瑰園計畫」解鎖）和貨櫃碼頭（4×4，人口 15,000 解鎖）都是視覺化模擬：飛機沿固定校正航線降落、滑行至閘口、再起飛，一次大約 3 到 4 架同時運作；船隻則沿岸邊校正路線入港靠泊、交換貨物、鳴笛離港。兩者在八號風球或以上都會暫停運作。" },
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
    pageIntro: "This page walks through every core mechanic in The City of Heung Shing - from zoning and construction to Legislative Council votes, from the stock market to Typhoon Signal No. 8. For a quick lookup of building unlock numbers, see the homepage's",
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
          { type: "p", text: "Beyond funds, empty space and footprint, the buildings below need extra city conditions to unlock (this table matches the homepage's “User Manual” section, reproduced here in full):" },
          { type: "table", head: ["Building", "Unlock condition", "Cap"], rows: [
            ["Community Temple", "Population 3,000", "Max 4"],
            ["Church", "Population 5,000", "Max 2"],
            ["Legislative Council", "Population 10,000", "Max 1"],
            ["Big Buddha", "Population 12,000", "Max 1"],
            ["Grand Temple", "Population 12,000; attractiveness 35", "Max 1"],
            ["Space Museum", "Population 15,000; “Science Development Act” in effect", "Max 1"],
            ["Container Port", "Population 15,000; 4×4 footprint touching four contiguous waterfront tiles", "Unlimited"],
            ["Cultural Centre", "Population 20,000", "Max 1"],
            ["Convention Centre / Hung Hom Coliseum", "Population 30,000", "Max 1 each"],
            ["Ocean Park", "Legislative Council; population 35,000; monthly income $6,000; monthly surplus $1,000; economy 50; resolution approved", "Max 1"],
            ["Football Stadium", "Population 40,000", "Max 1"],
            ["Stock Exchange", "Legislative Council; population 50,000; “Stock Exchange Act” in effect", "Max 1"],
            ["Murray House", "City attractiveness 60", "Max 1"],
            ["Rose Garden International Airport", "Legislative Council; population 80,000; monthly income $12,000; monthly surplus $2,000; economy 65; resolution approved", "Max 1"],
          ] },
          { type: "p", text: "The first time a condition is met, the in-game ticker and the Heung Shing Forum both post a one-time unlock notice." },
        ],
      },
      {
        id: "transport",
        title: "9. Transport, Airport and Container Port",
        blocks: [
          { type: "p", text: "Roads cost $10/tile, bridges $75/tile, and upkeep spending scales with the road department's funding slider. Traffic load builds up based on the density and scale of residential/commercial/industrial buildings, spreads along the road network, and congestion drags down happiness and commercial/residential demand." },
          { type: "p", text: "Buses and minibuses are purely ambient background traffic - the player never routes them - and they're grounded immediately at Typhoon Signal 8 or above." },
          { type: "p", text: "Both the Airport (12×12, unlocked via the “I Love Rose Garden Project”) and the Container Port (4×4, unlocked at population 15,000) are visual simulations: aircraft follow a fixed, calibrated flight path to land, taxi to a gate and take off again, with roughly 3-4 aircraft active at once; vessels similarly follow a calibrated coastal route to berth, exchange cargo, sound their horn and depart. Both pause operations at Signal 8 or above." },
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
    pageIntro: "このページでは香城模擬器のすべての基本システムを解説します——区画・建設から立法会の投票、株式市場から台風シグナル8号まで。建築の解禁数値をすぐに調べたい場合はトップページの",
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
          { type: "p", text: "以下の建築は、資金・空き地・フットプリントに加えて、追加の都市条件を満たさないと建設できません（このテーブルはトップページの「プレイヤーマニュアル」セクションと同一内容を全件掲載したものです）。" },
          { type: "table", head: ["建築", "解禁条件", "上限"], rows: [
            ["地域寺院", "人口 3,000", "最大 4 棟"],
            ["教会", "人口 5,000", "最大 2 棟"],
            ["立法会", "人口 10,000", "最大 1 棟"],
            ["大仏", "人口 12,000", "最大 1 棟"],
            ["大型寺院", "人口 12,000；魅力度 35", "最大 1 棟"],
            ["宇宙博物館", "人口 15,000；「科学研究発展法」施行中", "最大 1 棟"],
            ["コンテナ港", "人口 15,000；4×4フットプリントが連続4マスの水辺に接している", "上限なし"],
            ["文化センター", "人口 20,000", "最大 1 棟"],
            ["コンベンションセンター／紅磡コロシアム", "人口 30,000", "各最大 1 棟"],
            ["オーシャンパーク", "立法会；人口 35,000；月収 $6,000；月間黒字 $1,000；経済指数 50；決議可決", "最大 1 棟"],
            ["サッカースタジアム", "人口 40,000", "最大 1 棟"],
            ["証券取引所", "立法会；人口 50,000；「証券取引所法」施行中", "最大 1 棟"],
            ["マレーハウス", "都市魅力度 60", "最大 1 棟"],
            ["ローズガーデン国際空港", "立法会；人口 80,000；月収 $12,000；月間黒字 $2,000；経済指数 65；決議可決", "最大 1 棟"],
          ] },
          { type: "p", text: "条件を初めて満たした時点で、ゲーム内ティッカーと香城フォーラムの両方に解禁通知が一度だけ表示されます。" },
        ],
      },
      {
        id: "transport",
        title: "9. 交通、空港、コンテナ港",
        blocks: [
          { type: "p", text: "道路は1マス$10、橋は1マス$75で、維持費は道路部門の予算スライダーに応じて変動します。交通負荷は住宅・商業・工業の密度と建物規模に応じて発生し、道路網に沿って広がります。渋滞は幸福度と商業・住宅需要を押し下げます。" },
          { type: "p", text: "バス・ミニバスは純粋な背景の視覚的交通であり、プレイヤーが経路を指定する必要はありません。台風シグナル8号以上では即座に運行停止となります。" },
          { type: "p", text: "空港（12×12、「ローズガーデン計画」で解禁）とコンテナ港（4×4、人口15,000で解禁）はいずれもビジュアルシミュレーションです：航空機は固定の校正済み飛行経路に沿って着陸し、ゲートまでタキシングし、再び離陸します。同時に稼働するのはおおよそ3〜4機です。船舶も同様に、校正済みの沿岸経路に沿って入港・係留し、貨物を交換し、汽笛を鳴らして出港します。両者ともシグナル8号以上では運航を停止します。" },
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
  "assets/weatherSystem.png",
  "assets/heungShingForum.png",
  "assets/councilDiscussion.png",
  "assets/stockMarket.png",
  "assets/airport.png",
  "assets/traffic.png",
  "assets/newCityBuildings.png",
  "assets/nameYourDistrict.png",
  "assets/nameYourDistrict2.png",
  "assets/changeDistrictName.png",
  "assets/connectWithFreeAPIKey.png",
];

function getLocalizedGalleryItems() {
  const items = SITE_GALLERY[siteCurrentLanguage] || SITE_GALLERY[SITE_DEFAULT_LANGUAGE];
  return items.map((item, index) => ({ ...item, src: SITE_GALLERY_SOURCES[index] }));
}

function renderGalleryItems() {
  const grid = document.querySelector("[data-render='gallery']");
  if (!grid) return;
  grid.innerHTML = "";
  getLocalizedGalleryItems().forEach((item) => {
    const figure = document.createElement("figure");
    figure.className = "gallery-item";
    const img = document.createElement("img");
    img.src = item.src;
    img.alt = item.alt;
    img.loading = "lazy";
    const caption = document.createElement("figcaption");
    caption.textContent = item.caption;
    figure.append(img, caption);
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

function renderManualTable() {
  const tbody = document.querySelector("[data-render='manual-table']");
  if (!tbody) return;
  const rows = SITE_MANUAL_ROWS[siteCurrentLanguage] || SITE_MANUAL_ROWS[SITE_DEFAULT_LANGUAGE];
  const headers = SITE_TEXT[siteCurrentLanguage].manual.tableHeaders;
  const thead = tbody.closest("table")?.querySelector("thead tr");
  if (thead) {
    thead.innerHTML = "";
    headers.forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label;
      thead.appendChild(th);
    });
  }
  tbody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderManualNotes() {
  const list = document.querySelector("[data-render='manual-notes']");
  if (!list) return;
  const notes = SITE_MANUAL_NOTES[siteCurrentLanguage] || SITE_MANUAL_NOTES[SITE_DEFAULT_LANGUAGE];
  list.innerHTML = "";
  notes.forEach((note) => {
    const li = document.createElement("li");
    if (note.label) {
      const strong = document.createElement("strong");
      strong.textContent = `${note.label}：`;
      li.appendChild(strong);
    }
    li.appendChild(document.createTextNode(note.text));
    list.appendChild(li);
  });
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
  const meta = SITE_TEXT[siteCurrentLanguage].meta;
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
    link.href = "index.html#manual";
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
        block.items.forEach((itemText) => {
          const li = document.createElement("li");
          li.textContent = itemText;
          ul.appendChild(li);
        });
        sectionEl.appendChild(ul);
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
  renderManualTable();
  renderManualNotes();
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
