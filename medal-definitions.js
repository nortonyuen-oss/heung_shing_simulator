// 香城洋紫荊勳章 (Norton 2026-11-17, 《玩轉18區》劇本 v1.2 APPENDIX C): the 36 traceable medals.
//
// Pure data and rules - no DOM, no game globals - so the tests can run every rule against a
// snapshot (medals.js builds the snapshot from the live city and owns storage and the UI).
//
// Ids are the script's own numbers (A01-A19, B01-B14, C01, D01, E01) so every entry traces back
// to the script. Status:
//   active  - judged now, from systems the game already has
//   locked  - a threshold still to be set; never awarded (none at present: A15-A19's numbers were
//             set 2026-11-17 against the real saves, docs/medals-design.md §5)
//   blocked - needs a system the game does not have yet (shown as 即將推出)
// Tiers on the A series are the script's 「原草案」 grades (tierDraft) - not final. The B series
// has no grade in the script and shows as a plain 洋紫荊 (tier null).
//
// A medal is earned when every one of its `parts` has been recorded (parts accumulate across
// saves, as C.7 跨存檔原則 asks) and its `live` rule holds for the city being played.
// Thresholds follow C.7: 「大於／超過」 is >, 「至少／達」 is >=.
(function (root) {
  'use strict';

  const MEDAL_SCHEMA_VERSION = 1;

  // B02 東方之珠's tourist landmarks (待確認): the landmarks that already lift a district to 富豪區
  // (constants.js WEALTH_DISTRICT_ULTRA_RICH_LANDMARK_TYPES), plus the hotel and the 海鮮舫.
  const MEDAL_TOURISM_LANDMARK_TYPES = Object.freeze([
    'exhibition_center', 'cultural_center', 'space_museum', 'buddha_statue', 'heritage_temple',
    'grand_temple', 'heritage_church', 'indoor_coliseum', 'murray_house', 'ocean_park',
    'football_stadium', 'yacht_club', 'gold_coast_hotel', 'floating_restaurant', 'walled_city_park',
    'wetland_park', 'racecourse',
  ]);
  // B10 世界十大港口's waterfront tourist landmarks (待確認).
  const MEDAL_WATERFRONT_LANDMARK_TYPES = Object.freeze([
    'yacht_club', 'gold_coast_hotel', 'floating_restaurant', 'ocean_park',
  ]);
  // The council's major events (盛事): A07, B13 and B14 read their outcomes.
  const MEDAL_MAJOR_EVENT_IDS = Object.freeze([
    'tourEverywhere', 'menaConcert', 'muiKinKwokMatch', 'leagueMatchday', 'fantasyFingHeungShing',
  ]);
  // Outcomes that are not a held-and-failed event.
  const MEDAL_NOT_FAILED_OUTCOMES = Object.freeze(['success', 'scheduled', 'typhoon_cancelled']);
  // B12 國際笑話中心's 荒謬事件 (待確認): the black bauhinia's four, the satirical acts, any council
  // resolution of absurdity 2+ once it has run, and any resolution that failed.
  const MEDAL_ABSURD_POLICY_IDS = Object.freeze(['busSeatbeltMandate', 'arcticPenguinReserve', 'strongCountryManufacturing']);
  const MEDAL_ABSURD_FORUM_IDS = Object.freeze(['kirinCouncillor', 'labExplosion']);
  const MEDAL_ABSURD_EVENT_TARGET = 5;
  // A15-A19 (Norton 2026-11-17: 跟你提，按照遊戲現在的邏輯), calibrated on his saves - see
  // docs/medals-design.md §5 for the figures they were set against.
  const MEDAL_TRANSIT_CITY_MIN_POPULATION = 50000;
  const MEDAL_TRANSIT_CITY_RIDER_SHARE = 0.15;
  const MEDAL_SMALL_BUSINESS_TAX = 1000;
  const MEDAL_INDUSTRY_LEADER = Object.freeze({ commercial: 150, industrial: 40, unemploymentBelow: 0.08 });
  const MEDAL_FINANCIAL_CENTRE = Object.freeze({ gradeAOffices: 8, commercialTax: 10000 });
  const MEDAL_SURPLUS_STREAK_MONTHS = 12;
  // 公屋／居屋 residents (housing-types.js)
  const MEDAL_PUBLIC_HOUSING_RESIDENTS = 50000;
  const MEDAL_AIRPORT_ROUTES = 5;
  // E01: the districts of 《玩轉18區》 (campaign-chapters.js), a star in each
  const MEDAL_CAMPAIGN_DISTRICTS = 18;
  const MEDAL_HOS_RESIDENTS = 20000;
  // A12 (Norton 2026-11-17: 製作一個合理的投資獲利): the script's $2,000,000 was a coin flip after ten
  // game years of buying crashes with $10M; $1,000,000 is the game's own bar for a notable trading
  // profit (STOCK_GOV_NEWS_MIN_NOTABLE_AMOUNT) - about one good crash bought and sold.
  const MEDAL_INVESTMENT_PROFIT = 1000000;

  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const built = (s, type) => num(s.buildings?.[type]) > 0;
  const fact = (s, key) => !!s.facts?.[key];
  const policy = (s, id) => !!s.policies?.[id];
  const carried = (s, mode) => num(s.transit?.[mode]) > 0;
  const distinctBuilt = (s, types) => types.filter((type) => built(s, type)).length;
  const eventHeld = (s, id) => fact(s, `held:${id}`) || num(s.approvedResolutions?.[id]) > 0 && id !== 'fantasyFingHeungShing';
  const fourModes = (s) => ['bus', 'ferry', 'metro', 'tram'].every((mode) => carried(s, mode));

  function isMedalAbsurdResolution(definition, outcome) {
    if (!definition) return false;
    if (outcome && !MEDAL_NOT_FAILED_OUTCOMES.includes(outcome)) return true;
    return num(definition.absurdity) >= 2 && outcome !== 'typhoon_cancelled';
  }

  function isMedalFailedOutcome(outcome) {
    return !!outcome && !MEDAL_NOT_FAILED_OUTCOMES.includes(outcome);
  }

  const T = (zhHant, en, ja) => Object.freeze({ zhHant, en, ja });

  const MEDAL_SERIES = Object.freeze([
    { id: 'A', title: T('早期核心系列', 'Core series', '初期コアシリーズ') },
    { id: 'B', title: T('精選系列', 'Selected series', '精選シリーズ') },
    { id: 'S', title: T('特殊榮譽', 'Special honours', '特別栄誉') },
  ]);

  const MEDAL_DEFS = Object.freeze([
    {
      id: 'A01', series: 'A', tier: 'bronze', tierDraft: true, status: 'active',
      name: T('首任行政長官', 'First Chief Executive', '初代行政長官'),
      desc: T('城市人口超過 3,000 人', 'City population above 3,000', '都市人口が3,000人を超える'),
      live: (s) => num(s.population) > 3000,
    },
    {
      id: 'A02', series: 'A', tier: 'bronze', tierDraft: true, status: 'active',
      name: T('首屆立法局議員', 'First Legislative Councillor', '初代立法局議員'),
      desc: T('建成立法會', 'Build the Legislative Council', '立法会を建設する'),
      live: (s) => built(s, 'legislative_council'),
    },
    {
      id: 'A03', series: 'A', tier: 'silver', tierDraft: true, status: 'active',
      name: T('超級聯繫人', 'Super-Connector', 'スーパーコネクター'),
      desc: T('區外連線、貨櫃碼頭、機場（可跨存檔累積）', 'A region connection, a container port and an airport (may accumulate across saves)', '区外連絡道路・コンテナ港・空港（セーブ間で累積可）'),
      parts: [
        { id: 'region', name: T('區外連線', 'Region connection', '区外連絡道路'), check: (s) => num(s.regionConnections) > 0 || num(s.offMapLines) > 0 },
        { id: 'port', name: T('貨櫃碼頭', 'Container port', 'コンテナ港'), check: (s) => built(s, 'container_port') },
        { id: 'airport', name: T('機場', 'Airport', '空港'), check: (s) => built(s, 'airport') },
      ],
    },
    {
      id: 'A04', series: 'A', tier: 'silver', tierDraft: true, status: 'active',
      name: T('八萬五建屋計劃', 'The 85,000 Homes Plan', '八万五千戸住宅計画'),
      desc: T('高密度住宅居民超過 85,000 人', 'More than 85,000 residents in high-density housing', '高密度住宅の住民が85,000人を超える'),
      live: (s) => num(s.highDensityResidents) > 85000,
    },
    {
      id: 'A05', series: 'A', tier: 'gold', tierDraft: true, status: 'active',
      name: T('由治及興', 'From Order to Prosperity', '治から興へ'),
      desc: T('城市常住人口達 300,000 人', 'City population of 300,000', '都市人口が300,000人に達する'),
      live: (s) => num(s.population) >= 300000,
    },
    {
      id: 'A06', series: 'A', tier: 'gold', tierDraft: true, status: 'active',
      name: T('雞棚之都', 'Chicken-Coop Valley', '鶏小屋の都'),
      desc: T('科學園、科研發展法、強國製造同時運作，科學園職位達 10,000', 'A science park, the Science Development Act and Strong Country Manufacturing in force, with 10,000 science-park jobs', 'サイエンスパーク・科学開発法・強国製造を実施し、科学園の雇用が10,000に達する'),
      live: (s) => built(s, 'science_park') && policy(s, 'scienceDevelopment')
        && policy(s, 'strongCountryManufacturing') && num(s.scienceParkJobs) >= 10000,
    },
    {
      id: 'A07', series: 'A', tier: null, tierDraft: true, status: 'active',
      name: T('盛事之都', 'City of Mega Events', 'メガイベントの都'),
      desc: T('完成全部八項指定盛事及設施（可跨存檔累積）', 'Complete all eight designated events and venues (may accumulate across saves)', '指定の8つのイベントと施設をすべて達成（セーブ間で累積可）'),
      parts: [
        { id: 'menaConcert', name: T('邀請咩拿訪港', 'Mena visits the city', 'メナ来港'), check: (s) => eventHeld(s, 'menaConcert') },
        { id: 'muiKinKwok', name: T('邀請梅建國訪港', 'Mui Kin-kwok visits the city', '梅建国来港'), check: (s) => eventHeld(s, 'muiKinKwokMatch') },
        { id: 'league', name: T('舉辦城超聯', 'Hold a City Super League match', '城超リーグ開催'), check: (s) => eventHeld(s, 'leagueMatchday') },
        { id: 'stadium', name: T('建立大球場', 'Build the stadium', '大球場を建設'), check: (s) => built(s, 'football_stadium') },
        { id: 'coliseum', name: T('建立紅館', 'Build the Coliseum', '紅館を建設'), check: (s) => built(s, 'indoor_coliseum') },
        { id: 'tourEverywhere', name: T('舉辦無處不旅遊', 'Hold Tourism Everywhere', '無処不旅遊を開催'), check: (s) => eventHeld(s, 'tourEverywhere') },
        { id: 'nightBazaar', name: T('舉辦香城夜繽週', 'Hold the Night Bazaar', '香城夜繽週を開催'), check: (s) => !!s.nightMarketRunning },
        { id: 'fing', name: T('舉辦過幻彩Fing香城', 'Hold Fantasy Fing Heung Shing', '幻彩Fing香城を開催'), check: (s) => fact(s, 'held:fantasyFingHeungShing') },
      ],
    },
    {
      id: 'A08', series: 'A', tier: 'gold', tierDraft: true, status: 'active',
      name: T('民主之父', 'Father of Democracy', '民主の父'),
      desc: T('區議會直選法案及立法會直選法案同時生效', 'District Council and Legislative Council direct-election acts both in force', '区議会・立法会の直接選挙法がともに施行中'),
      live: (s) => policy(s, 'districtCouncilElection') && policy(s, 'legislativeCouncilElection'),
    },
    {
      id: 'A09', series: 'A', tier: 'bronze', tierDraft: true, status: 'active',
      name: T('香巴服務 日日進步', 'Heung Bus: Better Every Day', '香巴サービス 日々進歩'),
      desc: T('開辦首條有乘客嘅巴士路線', 'Run your first bus route that carries passengers', '乗客を運ぶ初のバス路線を運行する'),
      live: (s) => fact(s, 'transit:bus') || carried(s, 'bus'),
    },
    {
      id: 'A10', series: 'A', tier: 'bronze', tierDraft: true, status: 'active',
      name: T('屯馬開通真的很興奮', 'So Excited the Line Is Open', '屯馬線開通、本当に興奮'),
      desc: T('開辦首條有乘客嘅鐵路（地鐵或輕鐵）', 'Run your first railway (metro or light rail) that carries passengers', '乗客を運ぶ初の鉄道（地下鉄またはライトレール）'),
      live: (s) => fact(s, 'transit:metro') || fact(s, 'transit:lightRail') || carried(s, 'metro') || carried(s, 'lightRail'),
    },
    {
      id: 'A11', series: 'A', tier: 'gold', tierDraft: true, status: 'active',
      name: T('香城運輸大亨', 'Heung Shing Transport Tycoon', '香城交通王'),
      desc: T('巴士、渡輪、地鐵、雙層電車同月有乘客，公共交通月票務收入超過 $10,000', 'Buses, ferries, metro and trams all carry passengers in one month, with fare revenue above $10,000', 'バス・フェリー・地下鉄・トラムが同じ月に乗客を運び、月の運賃収入が$10,000を超える'),
      live: (s) => fourModes(s) && num(s.transitRevenue) > 10000,
    },
    {
      id: 'A12', series: 'A', tier: 'gold', tierDraft: true, status: 'active',
      name: T('追擊索螺絲', 'Chasing Soros', 'ソロス追撃'),
      desc: T('有股票交易所，政府投資累計已實現獲利超過 $1,000,000', 'A stock exchange, and the government portfolio\'s realised profit above $1,000,000', '証券取引所があり、政府投資の実現益が累計$1,000,000を超える'),
      live: (s) => built(s, 'stock_exchange') && num(s.governmentRealizedPnl) > MEDAL_INVESTMENT_PROFIT,
    },
    {
      id: 'A13', series: 'A', tier: 'silver', tierDraft: true, status: 'active',
      name: T('香港的眼淚', 'Tears of Hong Kong', '香港の涙'),
      desc: T('復育皇后碼頭、美利樓、珍寶海鮮舫、車仔檔（可跨存檔累積）', 'Restore Queen\'s Pier, Murray House, the Jumbo and the cart-noodle stalls (may accumulate across saves)', '皇后埠頭・美利楼・ジャンボ・車仔麺屋台を復元する（セーブ間で累積可）'),
      // Norton 2026-11-17: the game's ferry pier is 皇后碼頭; the 車仔檔 are the night bazaar's carts
      parts: [
        { id: 'queensPier', name: T('皇后碼頭（渡輪碼頭）', 'Queen\'s Pier (a ferry pier)', '皇后埠頭（フェリー埠頭）'), check: (s) => num(s.ferryPiers) > 0 },
        { id: 'murrayHouse', name: T('美利樓', 'Murray House', '美利楼'), check: (s) => built(s, 'murray_house') },
        { id: 'jumbo', name: T('珍寶海鮮舫', 'The Jumbo floating restaurant', 'ジャンボ海上レストラン'), check: (s) => built(s, 'floating_restaurant') },
        { id: 'cartStalls', name: T('車仔檔（香城夜繽週夜市）', 'Cart stalls (the Night Bazaar)', '車仔麺屋台（香城夜繽週）'), check: (s) => !!s.nightMarketRunning },
      ],
    },
    {
      id: 'A14', series: 'A', tier: null, tierDraft: true, status: 'active',
      name: T('交通大臣', 'Minister of Transport', '交通大臣'),
      desc: T('巴士、渡輪、地鐵、雙層電車同月有乘客', 'Buses, ferries, metro and trams all carry passengers in one month', 'バス・フェリー・地下鉄・トラムが同じ月に乗客を運ぶ'),
      live: fourModes,
    },
    {
      id: 'A15', series: 'A', tier: null, tierDraft: true, status: 'active',
      name: T('真正的大眾運輸之都', 'A True Transit City', '真の公共交通都市'),
      desc: T('人口至少 50,000，一個月公共交通乘客人次達人口 15%', 'Population of at least 50,000, with public transport riders in a month equal to 15% of it', '人口50,000人以上で、1か月の公共交通利用者数が人口の15%に達する'),
      live: (s) => num(s.population) >= MEDAL_TRANSIT_CITY_MIN_POPULATION
        && num(s.transitRiders) >= num(s.population) * MEDAL_TRANSIT_CITY_RIDER_SHARE,
    },
    {
      id: 'A16', series: 'A', tier: null, tierDraft: true, status: 'active',
      name: T('小商業時代', 'Age of Small Business', '小商業時代'),
      desc: T('每月商業稅收首次達 $1,000', 'Monthly commercial tax reaches $1,000', '月の商業税収が初めて$1,000に達する'),
      live: (s) => num(s.commercialTax) >= MEDAL_SMALL_BUSINESS_TAX,
    },
    {
      id: 'A17', series: 'A', tier: null, tierDraft: true, status: 'active',
      name: T('工商業翹楚', 'Leader of Industry and Commerce', '商工業の雄'),
      desc: T('商業建築至少 150 座、工業建築至少 40 座、有貨櫃碼頭，失業率低於 8%', 'At least 150 commercial and 40 industrial buildings, a container port, and unemployment below 8%', '商業建築150棟以上・工業建築40棟以上・コンテナ港があり、失業率8%未満'),
      live: (s) => num(s.commercialCount) >= MEDAL_INDUSTRY_LEADER.commercial
        && num(s.industrialCount) >= MEDAL_INDUSTRY_LEADER.industrial
        && built(s, 'container_port') && num(s.unemploymentRate) < MEDAL_INDUSTRY_LEADER.unemploymentBelow,
    },
    {
      id: 'A18', series: 'A', tier: null, tierDraft: true, status: 'active',
      name: T('金融中心', 'Financial Centre', '金融センター'),
      desc: T('甲級寫字樓（H／UH 商業）至少 8 座，每月商業稅收達 $10,000', 'At least 8 grade-A office towers (H/UH commercial) and monthly commercial tax of $10,000', 'Aグレードオフィス（H／UH商業）8棟以上、月の商業税収$10,000'),
      live: (s) => num(s.gradeAOffices) >= MEDAL_FINANCIAL_CENTRE.gradeAOffices
        && num(s.commercialTax) >= MEDAL_FINANCIAL_CENTRE.commercialTax,
    },
    {
      id: 'A19', series: 'A', tier: null, tierDraft: true, status: 'active',
      name: T('香城財政司', 'Financial Secretary of Heung Shing', '香城財政官'),
      desc: T('連續 12 個月財政盈餘', 'A budget surplus for 12 months running', '12か月連続で財政黒字'),
      live: (s) => num(s.surplusStreak) >= MEDAL_SURPLUS_STREAK_MONTHS,
    },
    {
      id: 'B01', series: 'B', tier: null, status: 'active',
      name: T('獅子山下', 'Below the Lion Rock', '獅子山の下'),
      desc: T('人口至少 10,000，居民滿意度高於 70%', 'Population of at least 10,000 with happiness above 70%', '人口10,000人以上で、満足度が70%を超える'),
      live: (s) => num(s.population) >= 10000 && num(s.happiness) > 0.70,
    },
    {
      id: 'B02', series: 'B', tier: null, status: 'active',
      name: T('東方之珠', 'Pearl of the Orient', '東洋の真珠'),
      desc: T('人口至少 100,000，並有 5 種不同旅遊地標', 'Population of at least 100,000 and 5 different tourist landmarks', '人口100,000人以上で、5種類の観光ランドマーク'),
      live: (s) => num(s.population) >= 100000 && distinctBuilt(s, MEDAL_TOURISM_LANDMARK_TYPES) >= 5,
    },
    {
      id: 'B03', series: 'B', tier: null, status: 'active',
      name: T('公屋之父', 'Father of Public Housing', '公営住宅の父'),
      desc: T('公共房屋住戶人口至少 50,000', 'At least 50,000 public-housing residents', '公営住宅の住民が50,000人以上'),
      live: (s) => num(s.publicHousingResidents) >= MEDAL_PUBLIC_HOUSING_RESIDENTS,
    },
    {
      id: 'B04', series: 'B', tier: null, status: 'active',
      name: T('居者有其屋', 'Home Ownership Scheme', '居者有其屋'),
      desc: T('居屋居住人口至少 20,000', 'At least 20,000 Home Ownership Scheme residents', '居屋（分譲公営住宅）の住民が20,000人以上'),
      live: (s) => num(s.hosResidents) >= MEDAL_HOS_RESIDENTS,
    },
    {
      id: 'B05', series: 'B', tier: null, status: 'active',
      name: T('成碟青瓜過大海', 'A Plate of Cucumbers Across the Sea', '皿のキュウリ、海を渡る'),
      desc: T('開辦首條有乘客嘅渡輪航線', 'Run your first ferry route that carries passengers', '乗客を運ぶ初のフェリー航路を運航する'),
      live: (s) => fact(s, 'transit:ferry') || carried(s, 'ferry'),
    },
    {
      id: 'B06', series: 'B', tier: null, status: 'active',
      name: T('下一站天后', 'Next Stop: Tin Hau', '次は天后'),
      desc: T('開辦首條有乘客嘅雙層電車路線', 'Run your first tram route that carries passengers', '乗客を運ぶ初の二階建てトラム路線を運行する'),
      live: (s) => fact(s, 'transit:tram') || carried(s, 'tram'),
    },
    {
      id: 'B07', series: 'B', tier: null, status: 'active',
      name: T('衝上雲霄', 'Triumph in the Skies', '衝上雲霄'),
      desc: T('建成機場並開通至少 5 條國際航線', 'An airport with at least 5 international routes', '空港を建設し、国際線を5路線以上開設する'),
      // routes with passengers on them (airport-routes.js)
      live: (s) => built(s, 'airport') && num(s.airportRoutes) >= MEDAL_AIRPORT_ROUTES,
    },
    {
      id: 'B08', series: 'B', tier: null, status: 'active',
      name: T('亞洲國際都會', 'Asia\'s World City', 'アジアの国際都市'),
      desc: T('機場、貨櫃碼頭、金融中心、國際酒店、會展中心（可跨存檔累積）', 'An airport, a container port, a financial centre, an international hotel and a convention centre (may accumulate across saves)', '空港・コンテナ港・金融センター・国際ホテル・コンベンションセンター（セーブ間で累積可）'),
      parts: [
        { id: 'airport', name: T('機場', 'Airport', '空港'), check: (s) => built(s, 'airport') },
        { id: 'port', name: T('貨櫃碼頭', 'Container port', 'コンテナ港'), check: (s) => built(s, 'container_port') },
        { id: 'finance', name: T('金融中心（股票交易所）', 'Financial centre (stock exchange)', '金融センター（証券取引所）'), check: (s) => built(s, 'stock_exchange') },
        { id: 'hotel', name: T('國際酒店（黃金海岸酒店）', 'International hotel (Gold Coast Hotel)', '国際ホテル（ゴールドコーストホテル）'), check: (s) => built(s, 'gold_coast_hotel') },
        { id: 'convention', name: T('會展中心', 'Convention centre', 'コンベンションセンター'), check: (s) => built(s, 'exhibition_center') },
      ],
    },
    {
      id: 'B09', series: 'B', tier: null, status: 'active',
      name: T('媽媽咪呀，好好味㗎～', 'Mamma Mia, So Tasty!', 'ママミーア、おいしい～'),
      desc: T('大排檔夜市、海鮮酒家、海鮮舫同時營運', 'A dai pai dong night market, a seafood restaurant and a floating restaurant all open', '屋台ナイトマーケット・海鮮酒家・海上レストランがそろって営業'),
      live: (s) => !!s.nightMarketRunning && built(s, 'seafood_restaurant') && built(s, 'floating_restaurant'),
    },
    {
      id: 'B10', series: 'B', tier: null, status: 'active',
      name: T('世界十大港口', 'One of the World\'s Top Ten Ports', '世界十大港'),
      desc: T('至少 2 種海濱旅遊地標', 'At least 2 kinds of waterfront tourist landmark', '海辺の観光ランドマークが2種類以上'),
      live: (s) => distinctBuilt(s, MEDAL_WATERFRONT_LANDMARK_TYPES) >= 2,
    },
    {
      id: 'B11', series: 'B', tier: null, status: 'active',
      name: T('市民的笑容', 'The Citizens\' Smiles', '市民の笑顔'),
      desc: T('城市恥笑度高於 80', 'City ridicule above 80', '都市の嘲笑度が80を超える'),
      live: (s) => num(s.ridicule) > 80,
    },
    {
      id: 'B12', series: 'B', tier: null, status: 'active',
      name: T('國際笑話中心', 'International Joke Centre', '国際ジョークセンター'),
      desc: T('同一個遊戲年度內有 5 宗不同荒謬事件', 'Five different absurd events in one game year', '同じゲーム年に異なる不条理事件が5件'),
      live: (s) => Object.values(s.absurdByYear || {}).some((ids) => new Set(ids).size >= MEDAL_ABSURD_EVENT_TARGET),
    },
    {
      id: 'B13', series: 'B', tier: null, status: 'active',
      name: T('盛事變喪事', 'Mega Event, Mega Mess', '祭りが葬式に'),
      desc: T('一場大型盛事被判定失敗', 'A major event officially fails', '大型イベントが失敗と判定される'),
      live: (s) => fact(s, 'majorEventFailed') || (s.failedMajorEvents || []).length > 0,
    },
    {
      id: 'B14', series: 'B', tier: null, status: 'active',
      name: T('有危就有機', 'Crisis Is Opportunity', '危機は好機'),
      desc: T('颱風期間舉辦大型旅遊盛事', 'Hold a major tourism event during a typhoon', '台風の最中に大型観光イベントを開催する'),
      live: (s) => fact(s, 'typhoonEvent'),
    },
    {
      id: 'C01', series: 'S', tier: 'black', status: 'active', hidden: true,
      name: T('荒謬之都', 'City of Absurdity', '不条理の都'),
      desc: T('觸發四宗指定荒謬事件，恥笑度達 100', 'Trigger the four named absurd events and reach ridicule 100', '指定の不条理事件4件を起こし、嘲笑度100に達する'),
      parts: [
        { id: 'kirin', name: T('麒麟撞議員', 'Kirin knocks over a councillor', '麒麟が議員に衝突'), check: (s) => fact(s, 'forum:kirinCouncillor') },
        { id: 'fingFailed', name: T('Fing香城失敗', 'Fing Heung Shing fails', 'Fing香城失敗'), check: (s) => fact(s, 'failed:fantasyFingHeungShing') || (s.failedMajorEvents || []).includes('fantasyFingHeungShing') },
        { id: 'seatbelt', name: T('巴士安全帶法案', 'Bus Seatbelt Act', 'バスシートベルト法'), check: (s) => fact(s, 'policy:busSeatbeltMandate') || policy(s, 'busSeatbeltMandate') },
        { id: 'penguin', name: T('北極企鵝保育區', 'Arctic Penguin Reserve', '北極ペンギン保護区'), check: (s) => fact(s, 'policy:arcticPenguinReserve') || policy(s, 'arcticPenguinReserve') },
      ],
      live: (s) => num(s.ridicule) >= 100,
    },
    {
      id: 'D01', series: 'S', tier: 'memorial', status: 'active', hidden: true,
      name: T('Claire的回憶', 'Claire\'s Memories', 'クレアの思い出'),
      desc: T('完成情侶相簿全部生活故事，見證最後的告別', 'Complete the lovers’ photo diary, including the final farewell', '恋人たちのアルバムを別れの最終章まで見届ける'),
      quote: T('「星星之所以美麗，是因為有一朵看不見的花。」', '"The stars are beautiful because of a flower that cannot be seen."', '「星が美しいのは、見えない花が一輪あるからだ。」'),
      live: (s) => fact(s, 'loversStoryComplete'),
      stampFact: 'loversStoryComplete',
    },
    {
      id: 'E01', series: 'S', tier: 'grand', status: 'active',
      name: T('香城大紫荊勳章・九龍皇帝', 'Grand Bauhinia · King of Kowloon', '香城大紫荊勲章・九龍皇帝'),
      desc: T('《玩轉18區》十八區各取得至少一星', 'At least one star in each of the 18 districts of the campaign', '「玩転18区」の18区すべてで星を1つ以上獲得'),
      // the player's chapters with a star (the campaign profile, across saves as the medals are)
      live: (s) => num(s.campaignChaptersStarred) >= MEDAL_CAMPAIGN_DISTRICTS,
    },
  ]);

  const MEDAL_DEFS_BY_ID = Object.freeze(Object.fromEntries(MEDAL_DEFS.map((def) => [def.id, def])));

  function createEmptyMedalProfile() {
    return { schemaVersion: MEDAL_SCHEMA_VERSION, earned: {}, parts: {}, facts: {} };
  }

  // A stored profile, cleaned: unknown medal ids and parts are dropped, stamps are kept short.
  function normalizeMedalProfile(raw) {
    const profile = createEmptyMedalProfile();
    if (!raw || typeof raw !== 'object') return profile;
    const cleanStamp = (stamp) => {
      if (!stamp || typeof stamp !== 'object') return null;
      return {
        at: String(stamp.at || '').slice(0, 40),
        city: Array.from(String(stamp.city || '')).slice(0, 60).join(''),
        year: Math.floor(num(stamp.year)),
        month: Math.floor(num(stamp.month)),
      };
    };
    Object.entries(raw.earned || {}).forEach(([id, stamp]) => {
      if (MEDAL_DEFS_BY_ID[id] && cleanStamp(stamp)) profile.earned[id] = cleanStamp(stamp);
    });
    Object.entries(raw.parts || {}).forEach(([id, parts]) => {
      const def = MEDAL_DEFS_BY_ID[id];
      if (!def?.parts || !parts || typeof parts !== 'object') return;
      const valid = new Set(def.parts.map((part) => part.id));
      Object.entries(parts).forEach(([partId, stamp]) => {
        if (!valid.has(partId) || !cleanStamp(stamp)) return;
        (profile.parts[id] ||= {})[partId] = cleanStamp(stamp);
      });
    });
    Object.entries(raw.facts || {}).forEach(([key, stamp]) => {
      if (/^[a-zA-Z]+:?[a-zA-Z]*$/.test(key) && key.length <= 60 && cleanStamp(stamp)) profile.facts[key] = cleanStamp(stamp);
    });
    return profile;
  }

  // Records the snapshot's new parts and medals into the profile (in place). The snapshot's facts
  // are the profile's own (medals.js passes them in). Returns what changed.
  function evaluateMedals(snapshot, profile, stamp) {
    const newlyEarned = [];
    const newParts = [];
    const s = { ...snapshot, facts: { ...(profile.facts || {}), ...(snapshot.facts || {}) } };
    MEDAL_DEFS.forEach((def) => {
      if (def.status !== 'active' || profile.earned[def.id]) return;
      let partsDone = true;
      (def.parts || []).forEach((part) => {
        if (profile.parts[def.id]?.[part.id]) return;
        if (part.check(s)) {
          (profile.parts[def.id] ||= {})[part.id] = { ...stamp };
          newParts.push({ medalId: def.id, partId: part.id });
        } else partsDone = false;
      });
      if (!partsDone) return;
      if (def.live && !def.live(s)) return;
      // Event honours retain the city/date of completion if profile loading finishes later.
      const eventStamp = def.stampFact ? s.facts?.[def.stampFact] : null;
      profile.earned[def.id] = { ...(eventStamp && typeof eventStamp === 'object' ? eventStamp : stamp) };
      newlyEarned.push(def.id);
    });
    return { newlyEarned, newParts };
  }

  // Earned / all 36 (C.4: the hidden memorial counts toward 100%, the denominator is the full list).
  function getMedalCompletion(profile) {
    const earned = MEDAL_DEFS.filter((def) => profile?.earned?.[def.id]).length;
    return { earned, total: MEDAL_DEFS.length };
  }

  function getMedalText(text, language) {
    if (!text) return '';
    return text[language] || text.zhHant || text.en || '';
  }

  const api = {
    MEDAL_SCHEMA_VERSION, MEDAL_DEFS, MEDAL_DEFS_BY_ID, MEDAL_SERIES,
    MEDAL_TOURISM_LANDMARK_TYPES, MEDAL_WATERFRONT_LANDMARK_TYPES, MEDAL_MAJOR_EVENT_IDS,
    MEDAL_ABSURD_POLICY_IDS, MEDAL_ABSURD_FORUM_IDS, MEDAL_ABSURD_EVENT_TARGET, MEDAL_INVESTMENT_PROFIT,
    MEDAL_SURPLUS_STREAK_MONTHS,
    isMedalAbsurdResolution, isMedalFailedOutcome,
    createEmptyMedalProfile, normalizeMedalProfile, evaluateMedals, getMedalCompletion, getMedalText,
  };
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
