// 《玩轉18區》 campaign (Norton 2026-11-17, 劇本 v1.2; docs/campaign-levels-design.md): the
// chapters, their story and their star rules.
//
// Pure data and rules - no DOM, no game globals - so the tests can run every chapter against a
// snapshot. campaign.js owns the runtime: starting a chapter, the month's judging, the panels.
//
// A chapter run lives on the city (city.campaign) and so saves with it. Star 1 must be met, all
// at once, within CAMPAIGN_DEADLINE_MONTHS of the start; stars 2 and 3 have no limit and follow
// in order. The player's best stars live in the player profile (key 'campaign'), across saves.
(function (root) {
  'use strict';

  const CAMPAIGN_SCHEMA_VERSION = 1;
  const CAMPAIGN_DEADLINE_MONTHS = 24;

  const T = (zhHant, en, ja) => Object.freeze({ zhHant, en, ja });
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const built = (s, type) => num(s.buildings?.[type]) > 0;
  const fmt = (value) => Math.round(num(value)).toLocaleString('en-US');
  const pct = (value) => `${Math.round(num(value) * 100)}%`;
  const money = (value) => `${num(value) < 0 ? '-' : '+'}$${fmt(Math.abs(num(value)))}`;

  // Who speaks. Portraits are the council's (UI/officials); the rest wait for art (a glyph until then).
  const CAMPAIGN_SPEAKERS = Object.freeze({
    mayor: { name: T('市長', 'Mayor', '市長'), portrait: 'UI/officials/chiefExecutive.PNG' },
    secretary: { name: T('市政秘書', 'Municipal Secretary', '市政秘書'), glyph: '📋' },
    treasurer: { name: T('財政官', 'Treasurer', '財政官'), portrait: 'UI/officials/headOfTreasury.PNG' },
    transport: { name: T('運輸署代表', 'Transport Department', '運輸署代表'), glyph: '🚌' },
    resident: { name: T('街坊', 'Resident', '住民'), glyph: '🧓' },
    queen: { name: T('女皇陛下', 'Her Majesty', '女王陛下'), glyph: '👑' },
  });

  // The 18 chapters (劇本 目錄). mapId is the district map (hk-district-maps.js) the chapter is
  // built on; only chapters with a spec below are playable yet.
  const CAMPAIGN_CHAPTERS = Object.freeze([
    { id: 'ch01', number: 1, mapId: 'sheung-shui', district: T('北區', 'North', '北区'), title: T('新任市長上場', 'A New Mayor Takes Office', '新任市長登場') },
    { id: 'ch02', number: 2, mapId: 'tai-po', district: T('大埔', 'Tai Po', '大埔'), title: T('安居樂業', 'Settled and Prospering', '安居楽業') },
    { id: 'ch03', number: 3, mapId: 'sai-kung', district: T('西貢', 'Sai Kung', '西貢'), title: T('東方遊艇天堂', 'Yacht Paradise of the East', '東洋のヨット天国') },
    { id: 'ch04', number: 4, mapId: 'aberdeen', district: T('南區', 'Southern', '南区'), title: T('南島奇蹟', 'The Southern Island Miracle', '南島の奇跡') },
    { id: 'ch05', number: 5, mapId: 'kowloon-city', district: T('黃大仙', 'Wong Tai Sin', '黄大仙'), title: T('有求必應', 'Every Wish Answered', '有求必応') },
    { id: 'ch06', number: 6, mapId: 'sha-tin', district: T('沙田', 'Sha Tin', '沙田'), title: T('望子成龍', 'High Hopes for the Children', '望子成竜') },
    { id: 'ch07', number: 7, mapId: 'tuen-mun', district: T('屯門', 'Tuen Mun', '屯門'), title: T('塞車塞到痴線', 'Gridlock Madness', '渋滞で頭がおかしくなる') },
    { id: 'ch08', number: 8, mapId: 'yuen-long', district: T('元朗', 'Yuen Long', '元朗'), title: T('魚米之鄉', 'Land of Fish and Rice', '魚米の郷') },
    { id: 'ch09', number: 9, mapId: 'tsuen-wan', district: T('荃灣', 'Tsuen Wan', '荃湾'), title: T('百業興旺', 'All Trades Thriving', '百業繁栄') },
    { id: 'ch10', number: 10, mapId: 'lantau', district: T('離島', 'Islands', '離島'), title: T('飛越香城', 'Flying Over Heung Shing', '香城を飛び越えて') },
    { id: 'ch11', number: 11, mapId: 'tsing-yi', district: T('葵青', 'Kwai Tsing', '葵青'), title: T('貨櫃碼頭24小時', 'The 24-Hour Container Port', '24時間コンテナ埠頭') },
    { id: 'ch12', number: 12, mapId: 'eastern', district: T('東區', 'Eastern', '東区'), title: T('叮叮遊港島', 'Ding Ding Around the Island', 'チンチンで港島めぐり') },
    { id: 'ch13', number: 13, mapId: 'kwun-tong', district: T('觀塘', 'Kwun Tong', '観塘'), title: T('觀塘老母', 'Kwun Tong, Seriously', '観塘老母') },
    { id: 'ch14', number: 14, mapId: 'kowloon-city', district: T('九龍城', 'Kowloon City', '九龍城'), title: T('啟德再起飛', 'Kai Tak Takes Off Again', '啓徳ふたたび飛ぶ') },
    { id: 'ch15', number: 15, mapId: 'sham-shui-po', district: T('深水埗', 'Sham Shui Po', '深水埗'), title: T('獅子山下', 'Below the Lion Rock', '獅子山の下') },
    { id: 'ch16', number: 16, mapId: 'wan-chai', district: T('灣仔', 'Wan Chai', '湾仔'), title: T('國際XX中心', 'International XX Centre', '国際XXセンター') },
    { id: 'ch17', number: 17, mapId: 'yau-tsim-mong', district: T('油尖旺', 'Yau Tsim Mong', '油尖旺'), title: T('我係 油尖旺 揸fit人', 'I Run Yau Tsim Mong', '油尖旺の仕切り役') },
    { id: 'ch18', number: 18, mapId: 'central-western', district: T('中西區', 'Central and Western', '中西区'), title: T('東方之珠：維多利亞港中心', 'Pearl of the Orient: Victoria Harbour', '東洋の真珠：ヴィクトリア・ハーバー') },
  ]);
  const CAMPAIGN_CHAPTERS_BY_ID = Object.freeze(Object.fromEntries(CAMPAIGN_CHAPTERS.map((chapter) => [chapter.id, chapter])));

  // PROLOGUE 00《女皇密令》: the letter, the four replies and the Crown's answers, the arrival.
  const CAMPAIGN_PROLOGUE = Object.freeze({
    from: T('HER MAJESTY\'S SECRET OFFICE／女皇陛下辦公室', 'HER MAJESTY\'S SECRET OFFICE', 'HER MAJESTY\'S SECRET OFFICE／女王陛下事務局'),
    subject: T('女皇密令：香城市長緊急任命通知', 'Secret Order: Urgent Appointment of the Mayor of Heung Shing', '女王密令：香城市長緊急任命通知'),
    letter: Object.freeze([
      T('致未來的香城市長：', 'To the future Mayor of Heung Shing:', '未来の香城市長へ'),
      T('本皇室現以最高機密等級通知閣下：經過極其嚴謹、無可奉告及絕對不容上訴之遴選程序，閣下已獲委任為香城市長，即日生效。',
        'The Crown informs you, at the highest level of secrecy, that after a most rigorous, undisclosable and entirely unappealable selection, you have been appointed Mayor of Heung Shing, with immediate effect.',
        '王室は最高機密をもって通知する。極めて厳正、詳細非公開、かつ一切の異議を認めない選考の結果、貴殿は本日付で香城市長に任命された。'),
      T('香城山川壯麗，百業待興，惟道路不通、庫房緊絀，市民對現屆政府之滿意程度……不宜在此透露。',
        'Heung Shing has fine hills and harbours and every trade waiting to grow - but its roads go nowhere, its treasury is thin, and the public\'s view of the present government is... best not set down here.',
        '香城の山河は壮麗にして百業は興隆を待つ。ただし道路は通じず、財政は逼迫し、現政府への市民の満足度は……ここには記さない。'),
      T('閣下須走遍十八區，先建民居、道路、工業與交通，再治理經濟、民生、文化、金融及城市制度。',
        'You shall travel all eighteen districts: first homes, roads, industry and transport; then the economy, people\'s livelihoods, culture, finance and the city\'s institutions.',
        '貴殿は十八区を巡り、まず住宅・道路・工業・交通を整え、次に経済・民生・文化・金融・都市制度を治めること。'),
      T('任命之有效期，以市民仍然願意給予閣下機會為準。', 'Your appointment lasts as long as the people are still willing to give you a chance.', '任期は、市民がなお貴殿に機会を与える限りとする。'),
      T('請謹記：政績不等於民望；繁華不等於安居；城市不只屬於政府。', 'Remember: achievements are not popularity; prosperity is not a home; a city does not belong to its government alone.', '心せよ。実績は民意にあらず、繁栄は安住にあらず、都市は政府だけのものにあらず。'),
      T('女皇陛下', 'Her Majesty', '女王陛下'),
      T('附註：旅費自付。保險、夜間加班及市民投訴處理費用恕不發還。', 'P.S. Travel at your own expense. Insurance, overtime and the handling of complaints will not be reimbursed.', '追伸：旅費は自己負担。保険、夜間残業、市民苦情処理の費用は払い戻さない。'),
    ]),
    replies: Object.freeze([
      { text: T('遵命！臣定必竭盡所能！', 'At once! I shall do my utmost!', '御意！全力を尽くします！'),
        answer: T('甚好。皇室對閣下寄予厚望，尤其係電費。', 'Very good. The Crown expects great things of you - especially the electricity bill.', 'よろしい。王室は貴殿に大いに期待している。特に電気代について。') },
      { text: T('市長幾錢人工？有冇雙糧？', 'What does a mayor earn? Is there a year-end bonus?', '市長の給料は？ボーナスは？'),
        answer: T('本職屬高度榮譽性質。薪酬由財政官在有錢時再議。', 'The post is a high honour. Pay will be discussed by the Treasurer when there is money.', '本職は極めて名誉ある職である。報酬は財政官が金のある時に改めて協議する。') },
      { text: T('你係咪釣魚電郵？', 'Is this a phishing email?', 'これってフィッシングメール？'),
        answer: T('本信已通過皇家最高級資安檢查。至於閣下點證實，係另一個問題。', 'This letter has passed the Crown\'s highest security check. How you would verify that is another matter.', '本状は王室最高レベルのセキュリティ審査を通過している。貴殿がそれをどう確かめるかは別の問題である。') },
      { text: T('我聽日要返工，唔做得唔得？', 'I have work tomorrow. Can I say no?', '明日は仕事なんですが、断れませんか？'),
        answer: T('任命已刊憲。祝閣下上任愉快。', 'The appointment has been gazetted. We wish you a pleasant start.', '任命は官報に掲載済みである。就任おめでとう。') },
    ]),
    arrival: Object.freeze([
      { speaker: 'secretary', text: T('市長，你終於到喇！我係你嘅市政秘書，負責向你解釋每一個……唔合理嘅政策。', 'Mayor, you\'re finally here! I\'m your Municipal Secretary - I explain every... unreasonable policy to you.', '市長、ようやく到着ですね！市政秘書です。あらゆる……不合理な政策をご説明する係です。') },
      { speaker: 'mayor', text: T('前任市長呢？', 'Where\'s the last mayor?', '前任の市長は？') },
      { speaker: 'secretary', text: T('辭職信搵唔到。總之呢度而家歸你管。', 'We can\'t find the resignation letter. Anyway, this is all yours now.', '辞表が見つかりません。とにかく、ここは今日からあなたの管轄です。') },
      { speaker: 'treasurer', text: T('庫房有幾多錢，我有份報告；但你唔好太大期望。', 'I have a report on what\'s in the treasury. Don\'t get your hopes up.', '金庫の残高は報告書にまとめてあります。期待はしないでください。') },
      { speaker: 'resident', text: T('喂，新市長，路燈幾時有？我唔係嚟睇皇室電影㗎。', 'Oi, new mayor - when do we get street lights? I didn\'t come for a royal film.', 'おい新市長、街灯はいつ付くんだ？王室映画を見に来たんじゃないぞ。') },
    ]),
  });

  // CHAPTER 01 北區《新任市長上場》 (docs/campaign-levels-design.md §4).
  const CH01 = Object.freeze({
    id: 'ch01',
    startFile: 'UI/campaign/ch01.json',
    // without a start file: a new city on the district map
    fresh: { cityName: T('北區', 'North District', '北区'), budget: 20000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'secretary', text: T('歡迎市長上任。好消息係：香城前途無限。', 'Welcome, Mayor. The good news: Heung Shing\'s future is boundless.', 'ようこそ市長。良い知らせです。香城の未来は無限です。') },
      { speaker: 'mayor', text: T('壞消息呢？', 'And the bad news?', '悪い知らせは？') },
      { speaker: 'secretary', text: T('暫時冇電、冇幾多人，仲有……政府錢唔多。', 'For now there\'s no power, hardly anyone lives here, and... the government hasn\'t much money.', '今のところ電気はなく、人もほとんどいません。それに……政府にはあまりお金がありません。') },
      { speaker: 'resident', text: T('市長，我唔求國際金融中心住，條街有燈先啦。', 'Mayor, I\'m not asking for an international financial centre. Just light up the street first.', '市長、国際金融センターなんて望まないよ。まずは通りに明かりをつけてくれ。') },
      { card: T('任務開始：北區《新任市長上場》', 'Mission start: North District - "A New Mayor Takes Office"', '任務開始：北区「新任市長登場」'),
        hint: T('建立供電、道路及住宅／商業／工業區，將常住人口提升至 3,000 並令收支轉正。', 'Bring in power, roads and residential, commercial and industrial zones; grow the population to 3,000 and balance the books.', '電力、道路、住宅・商業・工業区を整え、人口を3,000人にして収支を黒字にしよう。') },
    ]),
    // 教學 (Norton 2026-11-17: 記得第一關有教學): step by step, each done by doing it; the city
    // guide's buttons for the step glow (highlight: selectors). An `ack` step waits for 明白.
    tutorial: Object.freeze([
      { id: 'road', speaker: 'secretary', highlight: ['[data-tool-category="roads"]', '[data-tool="road"]'],
        text: T('第一步：起路。撳左邊「路政署」，揀道路，拖一條路將村屋同外面駁通。', 'Step 1: roads. Open Highways on the left, pick Road and drag one out to join the village to the rest of the map.', 'ステップ1：道路。左の「道路局」で道路を選び、村と外をつなぐ道路を引こう。'),
        done: (s, base) => num(s.roadTiles) >= num(base.roadTiles) + 5 },
      { id: 'plant', speaker: 'secretary', highlight: ['[data-tool-category="power"]', '[data-tool="power-coal"]', '[data-tool="power-solar"]'],
        text: T('第二步：起電廠。去「電力水務」起一座發電廠：燃煤電廠電多但污染大，太陽能電廠細啲但乾淨。', 'Step 2: a power plant. Open Utilities and build one: coal gives plenty of power but pollutes; solar is smaller but clean.', 'ステップ2：発電所。「電力水道」で発電所を建てよう。石炭は電力が多いが汚染も大きく、太陽光は小さいがクリーン。'),
        done: (s) => num(s.powerPlants) > 0 },
      { id: 'lines', speaker: 'secretary', highlight: ['[data-tool-category="power"]', '[data-tool="power-line"]'],
        text: T('第三步：拉電線。由電廠拉電線去你準備發展嘅地方，分區駁到電先會有人搬入嚟。', 'Step 3: power lines. Run lines from the plant to where you will build; zones fill only once they have power.', 'ステップ3：送電線。発電所から開発予定地へ送電線を引こう。電気が届いた区画にだけ人が来る。'),
        done: (s, base) => num(s.powerLines) > num(base.powerLines) },
      { id: 'homes', speaker: 'secretary', highlight: ['[data-tool-category="zones"]', '[data-tool="zone-res"]'],
        text: T('第四步：劃住宅區。去「城規會」揀住宅區（R），沿住道路劃地，市民就會搬入嚟。', 'Step 4: homes. Open Planning, pick Residential (R) and zone land along the road; people will move in.', 'ステップ4：住宅。「都市計画」で住宅区（R）を選び、道路沿いに区画しよう。住民が引っ越してくる。'),
        done: (s) => num(s.zoneTiles?.res) > 0 },
      { id: 'jobs', speaker: 'treasurer', highlight: ['[data-tool-category="zones"]', '[data-tool="zone-com"]', '[data-tool="zone-ind"]'],
        text: T('第五步：劃商業區（C）同工業區（I）。有舖頭同工廠，市民先有工返、政府先有稅收。工業區放遠少少，污染冇咁影響街坊。', 'Step 5: shops and industry. Zone Commercial (C) and Industrial (I): jobs for the people, taxes for the city. Keep industry a little away from homes.', 'ステップ5：商業区（C）と工業区（I）。働き口と税収のために。工業区は住宅から少し離そう。'),
        done: (s) => num(s.zoneTiles?.com) > 0 && num(s.zoneTiles?.ind) > 0 },
      { id: 'fire', speaker: 'resident', highlight: ['[data-tool-category="services"]', '[data-tool="fire-station"]'],
        text: T('第六步：去「公共設施」起一間消防局，我哋住得安心啲。', 'Step 6: open Civic and build a fire station, so we can sleep at night.', 'ステップ6：「公共施設」で消防署を建てて。安心して暮らせるように。'),
        done: (s) => built(s, 'fire_station') },
      { id: 'budget', speaker: 'treasurer', highlight: ['#topbar-income', '#topbar-expense'], ack: true,
        text: T('最後：睇住上面嘅「每月收入」同「每月支出」，收入要大過支出。錢唔夠可以加少少稅，但加得太多街坊會唔開心。', 'Last: watch Monthly Income and Monthly Expenses at the top - income must beat spending. Short of money? Raise taxes a little, but too much makes people unhappy.', '最後に：上の「月収入」と「月支出」を見て、収入が支出を上回るように。足りなければ少し増税してもいいが、上げすぎると住民の不満が募る。') },
    ]),
    stars: Object.freeze([
      {
        title: T('城市正式開張', 'Open for Business', '都市、正式開業'),
        objectives: Object.freeze([
          { id: 'power', label: T('有電：發電廠供電足夠', 'Power: a plant meets demand', '電力：発電所が需要を満たす'),
            check: (s) => num(s.powerPlants) > 0 && num(s.powerRatio) >= 1,
            progress: (s) => (num(s.powerPlants) > 0 ? pct(s.powerRatio) : '—') },
          { id: 'zones', label: T('住宅、商業、工業都有建築，失業率低於 15%', 'Homes, shops and industry built; unemployment under 15%', '住宅・商業・工業がそろい、失業率15%未満'),
            check: (s) => num(s.residentialCount) > 0 && num(s.commercialCount) > 0 && num(s.industrialCount) > 0 && num(s.unemploymentRate) < 0.15,
            progress: (s) => `R ${fmt(s.residentialCount)} · C ${fmt(s.commercialCount)} · I ${fmt(s.industrialCount)} · ${pct(s.unemploymentRate)}` },
          { id: 'population', label: T('常住人口達 3,000', 'Population of 3,000', '人口3,000人'),
            check: (s) => num(s.population) >= 3000,
            progress: (s) => `${fmt(s.population)} / 3,000` },
          { id: 'balance', label: T('每月收支正數，冇欠貸款', 'A monthly surplus, with no loans owing', '月の収支が黒字で、借入金なし'),
            check: (s) => num(s.monthlyNet) > 0 && num(s.loanBalance) <= 0,
            progress: (s) => (num(s.loanBalance) > 0 ? `${money(s.monthlyNet)} · -$${fmt(s.loanBalance)}` : money(s.monthlyNet)) },
          { id: 'services', label: T('滿意度達 50%，有消防局', 'Happiness of 50%, and a fire station', '満足度50%、消防署あり'),
            check: (s) => num(s.happiness) >= 0.5 && built(s, 'fire_station'),
            progress: (s) => `${pct(s.happiness)} · 🚒 ${fmt(s.buildings?.fire_station)}` },
        ]),
      },
      {
        title: T('小鎮有小鎮嘅幸福', 'A Small Town\'s Happiness', '小さな町の幸せ'),
        objectives: Object.freeze([
          { id: 'population', label: T('人口達 10,000', 'Population of 10,000', '人口10,000人'),
            check: (s) => num(s.population) >= 10000, progress: (s) => `${fmt(s.population)} / 10,000` },
          { id: 'jobs', label: T('失業率低於 8%', 'Unemployment under 8%', '失業率8%未満'),
            check: (s) => num(s.unemploymentRate) < 0.08, progress: (s) => pct(s.unemploymentRate) },
          { id: 'bus', label: T('至少一條有乘客嘅巴士線', 'A bus route that carries passengers', '乗客のいるバス路線'),
            check: (s) => num(s.transit?.bus) > 0, progress: (s) => fmt(s.transit?.bus) },
          { id: 'services', label: T('有警署、消防局、醫院同公園', 'A police station, fire station, hospital and park', '警察署・消防署・病院・公園'),
            check: (s) => built(s, 'police_station') && built(s, 'fire_station') && built(s, 'hospital') && (built(s, 'park_small') || built(s, 'park_large')),
            progress: (s) => ['police_station', 'fire_station', 'hospital'].filter((type) => built(s, type)).length + ((built(s, 'park_small') || built(s, 'park_large')) ? 1 : 0) + ' / 4' },
        ]),
      },
      {
        title: T('北區新市鎮', 'The North District New Town', '北区ニュータウン'),
        objectives: Object.freeze([
          { id: 'population', label: T('人口達 30,000', 'Population of 30,000', '人口30,000人'),
            check: (s) => num(s.population) >= 30000, progress: (s) => `${fmt(s.population)} / 30,000` },
          { id: 'surplus', label: T('連續 12 個月盈餘', 'A surplus 12 months running', '12か月連続の黒字'),
            check: (s) => num(s.surplusStreak) >= 12, progress: (s) => `${fmt(s.surplusStreak)} / 12` },
          { id: 'happiness', label: T('滿意度達 75%', 'Happiness of 75%', '満足度75%'),
            check: (s) => num(s.happiness) >= 0.75, progress: (s) => pct(s.happiness) },
          { id: 'traffic', label: T('交通擠塞指數不高於 40%', 'Traffic congestion at 40% or less', '交通渋滞指数40%以下'),
            check: (s) => num(s.trafficIndex) <= 0.4, progress: (s) => pct(s.trafficIndex) },
        ]),
      },
    ]),
    // 中段事件《有地就起？》: the game has no land sales, so a growing town with homes in demand
    events: Object.freeze([
      {
        id: 'landRush',
        when: (s) => num(s.population) >= 1500 && num(s.demandR) > 0.5,
        lines: Object.freeze([
          { speaker: 'secretary', text: T('市長，住宅需求好高！不如將啲地全部改劃住宅，人口即刻升。', 'Mayor, everyone wants homes! Rezone all the land as residential and the population will shoot up.', '市長、住宅需要が非常に高いです！土地をすべて住宅地にすれば人口はすぐ増えます。') },
          { speaker: 'treasurer', text: T('全部起屋冇工廠冇舖頭，個個都要出區返工。職住唔平衡，遲早塞爆。', 'All homes and no factories or shops, and everyone commutes out. Homes without jobs - the roads will choke sooner or later.', '家ばかりで工場も店もなければ、皆が区外へ通勤します。職住が不均衡なら、いずれ渋滞で詰まります。') },
          { card: T('有地就起？', 'Build on Every Plot?', '土地があれば建てる？'),
            hint: T('點規劃由你決定：住宅多人口升得快；保留工商用地，職住更平衡。', 'Your call: more homes grows the town faster; keeping land for shops and industry keeps homes and jobs in balance.', '判断は市長次第。住宅を増やせば人口は早く増え、商工業用地を残せば職住のバランスが良くなる。') },
        ]),
        forum: {
          headline: T('市長上任三個月已起咗兩條路！', 'The new mayor has built two roads in three months!', '市長、就任3か月で道路を2本建設！'),
          body: T('北區街坊對新路反應熱烈，亦有人追問何時有路燈。', 'North District residents welcomed the roads, though some asked when the street lights are coming.', '北区の住民は新しい道路を歓迎する一方、街灯はいつかと尋ねる声も。'),
          comment: T('笑死，之前嗰兩條仲未駁埋。', 'LOL, the two before that still don\'t join up.', '笑える。前の2本もまだつながってないのに。'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'secretary', text: T('恭喜市長，北區終於唔再係一張空白地圖！', 'Congratulations, Mayor - North District is no longer a blank map!', 'おめでとうございます、市長。北区はもう白紙の地図ではありません！') },
      { speaker: 'transport', text: T('下一步建議去大埔——當然，首先要有巴士去到。', 'We suggest Tai Po next - once there\'s a bus that goes there, of course.', '次は大埔をお勧めします。もちろん、まずはそこまで行くバスが必要ですが。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】北區新市鎮正式開張', '[Government News] North District new town opens', '【政府発表】北区ニュータウン正式開業'),
      body: T('市政秘書表示，新市鎮人口突破三千、收支轉正，整體發展「暢順」，政府會繼續「提升」及「優化」。', 'The Municipal Secretary said the new town has passed 3,000 people and balanced its books; development is "smooth", and the government will keep "enhancing" and "optimising".', '市政秘書は、ニュータウンの人口が3,000人を超え収支も黒字化し、発展は「順調」で、政府は今後も「向上」と「最適化」に努めると述べた。'),
      comments: Object.freeze([
        T('三千人都叫新市鎮？我屋企條村都多過呢個數。', 'Three thousand people is a new town? My village has more than that.', '3,000人でニュータウン？うちの村の方が多いぞ。'),
        T('路燈有咗，下一步可唔可以有巴士？', 'We have street lights now. Can we have a bus next?', '街灯はついた。次はバスをお願いできる？'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'secretary', text: T('市長，二十四個月過咗……女皇密令話，任命有效期以市民仍然願意畀機會為準。', 'Mayor, twenty-four months have passed... The Secret Order says the appointment lasts as long as the people still give you a chance.', '市長、24か月が過ぎました……女王の密令によれば、任期は市民がまだ機会を与えてくれる限りだそうです。') },
    ]),
  });

  const CAMPAIGN_CHAPTER_SPECS = Object.freeze({ ch01: CH01 });

  function isCampaignChapterPlayable(chapterId) {
    return !!CAMPAIGN_CHAPTER_SPECS[chapterId];
  }

  function createCampaignRun(chapterId, monthIndex, snapshot = null) {
    const start = Math.floor(num(monthIndex));
    const spec = CAMPAIGN_CHAPTER_SPECS[chapterId];
    return {
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      chapterId,
      startMonthIndex: start,
      deadlineMonthIndex: start + CAMPAIGN_DEADLINE_MONTHS,
      stars: 0,
      starMonthIndex: {},
      failed: false,
      freePlay: false,
      eventsShown: {},
      // where the city stood when the tutorial began: "build a road" means a new one
      tutorial: spec?.tutorial?.length
        ? { step: 0, done: false, skipped: false, base: { roadTiles: num(snapshot?.roadTiles), powerLines: num(snapshot?.powerLines) } }
        : null,
    };
  }

  // A stored run, cleaned (an older or hand-edited save cannot break the panel).
  function normalizeCampaignRun(raw) {
    if (!raw || typeof raw !== 'object' || !CAMPAIGN_CHAPTERS_BY_ID[raw.chapterId]) return null;
    const run = createCampaignRun(raw.chapterId, raw.startMonthIndex);
    run.deadlineMonthIndex = Number.isFinite(Number(raw.deadlineMonthIndex)) ? Math.floor(Number(raw.deadlineMonthIndex)) : run.deadlineMonthIndex;
    run.stars = Math.max(0, Math.min(3, Math.floor(num(raw.stars))));
    Object.entries(raw.starMonthIndex || {}).forEach(([star, monthIndex]) => {
      if (['1', '2', '3'].includes(star) && Number.isFinite(Number(monthIndex))) run.starMonthIndex[star] = Math.floor(Number(monthIndex));
    });
    run.failed = !!raw.failed;
    run.freePlay = !!raw.freePlay;
    Object.keys(raw.eventsShown || {}).forEach((id) => { if (/^[a-zA-Z0-9_-]{1,40}$/.test(id)) run.eventsShown[id] = true; });
    if (raw.tutorial && typeof raw.tutorial === 'object' && CAMPAIGN_CHAPTER_SPECS[run.chapterId]?.tutorial) {
      run.tutorial = {
        step: Math.max(0, Math.floor(num(raw.tutorial.step))),
        done: !!raw.tutorial.done,
        skipped: !!raw.tutorial.skipped,
        base: { roadTiles: num(raw.tutorial.base?.roadTiles), powerLines: num(raw.tutorial.base?.powerLines) },
      };
    } else run.tutorial = null;
    return run;
  }

  // ── 教學 ───────────────────────────────────────────────────────────────────

  function getCampaignTutorialStep(run, spec) {
    if (!run?.tutorial || run.tutorial.done || run.tutorial.skipped) return null;
    return spec?.tutorial?.[run.tutorial.step] || null;
  }

  // Moves on past every step already done (a step done out of order still counts once reached).
  // Returns the steps just completed and whether the tutorial is now finished.
  function advanceCampaignTutorial(run, spec, snapshot) {
    const completed = [];
    let step = getCampaignTutorialStep(run, spec);
    while (step && !step.ack) {
      let done = false;
      try { done = !!step.done(snapshot, run.tutorial.base); } catch { done = false; }
      if (!done) break;
      completed.push(step.id);
      run.tutorial.step += 1;
      step = getCampaignTutorialStep(run, spec);
    }
    if (run?.tutorial && !run.tutorial.done && run.tutorial.step >= (spec?.tutorial?.length || 0)) run.tutorial.done = true;
    return { completed, finished: !!run?.tutorial?.done && completed.length > 0 };
  }

  // 明白 on an ack step
  function acknowledgeCampaignTutorialStep(run, spec) {
    const step = getCampaignTutorialStep(run, spec);
    if (!step?.ack) return false;
    run.tutorial.step += 1;
    if (run.tutorial.step >= spec.tutorial.length) run.tutorial.done = true;
    return true;
  }

  function skipCampaignTutorial(run) {
    if (!run?.tutorial) return false;
    run.tutorial.skipped = true;
    return true;
  }

  // One star's objectives against the snapshot: each objective's state and progress text.
  function evaluateCampaignStar(spec, starIndex, snapshot) {
    const star = spec?.stars?.[starIndex];
    if (!star) return { done: false, items: [] };
    const items = star.objectives.map((objective) => {
      let done = false;
      let progress = '';
      try { done = !!objective.check(snapshot); } catch { done = false; }
      try { progress = objective.progress ? String(objective.progress(snapshot)) : ''; } catch { progress = ''; }
      return { id: objective.id, label: objective.label, done, progress };
    });
    return { done: items.length > 0 && items.every((item) => item.done), items };
  }

  // The month's turn for a run (in place): new stars (in order), the deadline, mid-chapter events.
  function advanceCampaignRun(run, spec, snapshot, monthIndex) {
    const result = { newStars: [], failedNow: false, events: [] };
    if (!run || !spec || run.freePlay) return result;
    if (run.failed) return result;
    while (run.stars < spec.stars.length) {
      if (!evaluateCampaignStar(spec, run.stars, snapshot).done) break;
      run.stars += 1;
      run.starMonthIndex[String(run.stars)] = Math.floor(num(monthIndex));
      result.newStars.push(run.stars);
    }
    if (run.stars === 0 && num(monthIndex) >= run.deadlineMonthIndex) {
      run.failed = true;
      result.failedNow = true;
      return result;
    }
    (spec.events || []).forEach((event) => {
      if (run.eventsShown[event.id]) return;
      let due = false;
      try { due = !!event.when(snapshot, run); } catch { due = false; }
      if (!due) return;
      run.eventsShown[event.id] = true;
      result.events.push(event);
    });
    return result;
  }

  function getCampaignMonthsLeft(run, monthIndex) {
    if (!run || run.stars > 0) return null;
    return Math.max(0, run.deadlineMonthIndex - Math.floor(num(monthIndex)));
  }

  // ── The player's progress (跨存檔) ─────────────────────────────────────────

  function createEmptyCampaignProfile() {
    return { schemaVersion: CAMPAIGN_SCHEMA_VERSION, prologueSeen: false, chapters: {} };
  }

  function normalizeCampaignProfile(raw) {
    const profile = createEmptyCampaignProfile();
    if (!raw || typeof raw !== 'object') return profile;
    profile.prologueSeen = !!raw.prologueSeen;
    Object.entries(raw.chapters || {}).forEach(([id, entry]) => {
      if (!CAMPAIGN_CHAPTERS_BY_ID[id] || !entry || typeof entry !== 'object') return;
      const stars = Math.max(0, Math.min(3, Math.floor(num(entry.stars))));
      if (!stars) return;
      profile.chapters[id] = {
        stars,
        firstStarAt: String(entry.firstStarAt || '').slice(0, 40),
        city: Array.from(String(entry.city || '')).slice(0, 60).join(''),
        monthsToFirstStar: Math.max(0, Math.floor(num(entry.monthsToFirstStar))),
      };
    });
    return profile;
  }

  // Keeps the best: stars only go up; the first star's date and time stay the first ones.
  function recordCampaignStars(profile, run, stamp) {
    if (!profile || !run || run.stars <= 0) return false;
    const previous = profile.chapters[run.chapterId];
    if (previous && previous.stars >= run.stars) return false;
    profile.chapters[run.chapterId] = {
      stars: run.stars,
      firstStarAt: previous?.firstStarAt || String(stamp?.at || ''),
      city: previous?.city || String(stamp?.city || ''),
      monthsToFirstStar: previous?.monthsToFirstStar
        ?? Math.max(0, num(run.starMonthIndex['1']) - num(run.startMonthIndex)),
    };
    return true;
  }

  // Chapter 01 is always open; each later chapter opens with a star in the one before.
  function isCampaignChapterUnlocked(profile, chapterId) {
    const chapter = CAMPAIGN_CHAPTERS_BY_ID[chapterId];
    if (!chapter) return false;
    if (chapter.number === 1) return true;
    const previous = CAMPAIGN_CHAPTERS[chapter.number - 2];
    return num(profile?.chapters?.[previous.id]?.stars) > 0;
  }

  function getCampaignText(text, language) {
    if (!text) return '';
    if (typeof text === 'string') return text;
    return text[language] || text.zhHant || text.en || '';
  }

  const api = {
    CAMPAIGN_SCHEMA_VERSION, CAMPAIGN_DEADLINE_MONTHS, CAMPAIGN_SPEAKERS, CAMPAIGN_CHAPTERS,
    CAMPAIGN_CHAPTERS_BY_ID, CAMPAIGN_PROLOGUE, CAMPAIGN_CHAPTER_SPECS,
    isCampaignChapterPlayable, createCampaignRun, normalizeCampaignRun, evaluateCampaignStar,
    advanceCampaignRun, getCampaignMonthsLeft, createEmptyCampaignProfile, normalizeCampaignProfile,
    getCampaignTutorialStep, advanceCampaignTutorial, acknowledgeCampaignTutorialStep, skipCampaignTutorial,
    recordCampaignStars, isCampaignChapterUnlocked, getCampaignText,
  };
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
