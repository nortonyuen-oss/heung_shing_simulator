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
  const CAMPAIGN_DEADLINE_MONTHS = 12;

  const T = (zhHant, en, ja) => Object.freeze({ zhHant, en, ja });
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const built = (s, type) => num(s.buildings?.[type]) > 0;
  const fmt = (value) => Math.round(num(value)).toLocaleString('en-US');
  const pct = (value) => `${Math.round(num(value) * 100)}%`;
  const money = (value) => `${num(value) < 0 ? '-' : '+'}$${fmt(Math.abs(num(value)))}`;
  const policy = (s, id) => !!s.policies?.[id];
  // a festival held since the chapter began: a later year than the last one held before it
  const heldSince = (s, base, id) => num(s.festivalHeldYear?.[id]) - num(base?.festivalHeldYear?.[id]);
  const heldAnySince = (s, base) => Object.keys(s.festivalHeldYear || {}).some((id) => heldSince(s, base, id) > 0);
  const tick = (ok) => (ok ? '✓' : '—');

  // Who speaks. The mayor and treasurer are the council's portraits (UI/officials); the campaign's own
  // cast are 256 px headshots (UI/campaign/portraits) cut from Norton's harbour portraits in UI/officials
  // (香港港灣三人角色肖像, engineer.png; queen.png before Tower Bridge), so they share one style; a speaker
  // without art shows a glyph.
  const CAMPAIGN_SPEAKERS = Object.freeze({
    mayor: { name: T('市長', 'Mayor', '市長'), portrait: 'UI/officials/chiefExecutive.PNG' },
    secretary: { name: T('金毛玲', 'Kam Mo-ling', '金毛玲'), portrait: 'UI/campaign/portraits/secretary.png', glyph: '📋' },
    treasurer: { name: T('財政官', 'Treasurer', '財政官'), portrait: 'UI/officials/headOfTreasury.PNG' },
    transport: { name: T('署長', 'Commissioner', '署長'), portrait: 'UI/campaign/portraits/transport.png', glyph: '🚌' },
    resident: { name: T('街坊', 'Resident', '住民'), portrait: 'UI/campaign/portraits/resident.png', glyph: '🧓' },
    engineer: { name: T('工程師', 'Engineer', '技師'), portrait: 'UI/campaign/portraits/engineer.png', glyph: '🛠' },
    // 旅遊署代表 speaks with the council's tourism member's face until the campaign's own art
    tourism: { name: T('旅遊署代表', 'Tourism Board', '観光局代表'), portrait: 'UI/officials/councilMember-tourism.PNG', glyph: '🧳' },
    // for now (Norton 2026-11-19): the tram driver of the 黃又藍 news art, the host of the 中秋 live broadcast
    tram: { name: T('電車公司代表', 'Tramways', '電車会社代表'), portrait: 'UI/campaign/portraits/tram.png', glyph: '🚋' },
    anchor: { name: T('新聞主播', 'News Anchor', 'ニュースキャスター'), portrait: 'UI/campaign/portraits/anchor.png', glyph: '📺' },
    queen: { name: T('女皇陛下', 'Her Majesty', '女王陛下'), portrait: 'UI/campaign/portraits/queen.png', glyph: '👑' },
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

  // PROLOGUE 00《女皇密令》: a royal letter on the desk of the player's tong lau flat, read out by Her
  // Majesty herself; the player's reply and her answer; then the arrival. `backdrop` is the picture
  // behind the scene: the sealed letter on the desk, the 樂聲 fan, half a cup of iced lemon tea
  // (Norton's UI/news/phase0.png, as WebP like the other UI/news art).
  const CAMPAIGN_PROLOGUE = Object.freeze({
    backdrop: 'UI/news/phase0.webp',
    opening: Object.freeze([
      { card: T('序幕《女皇密令》', 'Prologue: The Secret Order', '序章《女王の密令》'),
        hint: T('一封蓋住皇家火漆嘅信，擺咗喺你唐樓書桌上……', 'A letter under a royal wax seal lies on the desk of your tong lau flat...', '王室の封蝋が押された手紙が、唐楼の机の上に置かれている……') },
    ]),
    letter: Object.freeze([
      { speaker: 'queen', text: T('未來的香城市長：本皇室現以最高機密等級通知閣下——經過極其嚴謹、無可奉告及絕對不容上訴之遴選程序，閣下已獲委任為香城市長，即日生效。',
        'Future Mayor of Heung Shing: the Crown informs you, at the highest level of secrecy, that after a most rigorous, undisclosable and entirely unappealable selection, you have been appointed Mayor of Heung Shing, with immediate effect.',
        '未来の香城市長よ。王室は最高機密をもって通知する――極めて厳正、詳細非公開、かつ一切の異議を認めない選考の結果、貴殿は本日付で香城市長に任命された。') },
      { speaker: 'queen', text: T('香城山川壯麗，百業待興，惟道路不通、庫房緊絀，市民對現屆政府之滿意程度……不宜在此透露。',
        'Heung Shing has fine hills and harbours and every trade waiting to grow - but its roads go nowhere, its treasury is thin, and the public\'s view of the present government is... best not said here.',
        '香城の山河は壮麗にして百業は興隆を待つ。ただし道路は通じず、財政は逼迫し、現政府への市民の満足度は……ここでは言わずにおこう。') },
      { speaker: 'queen', text: T('閣下須走遍十八區，先建民居、道路、工業與交通，再治理經濟、民生、文化、金融及城市制度。',
        'You shall travel all eighteen districts: first homes, roads, industry and transport; then the economy, people\'s livelihoods, culture, finance and the city\'s institutions.',
        '貴殿は十八区を巡り、まず住宅・道路・工業・交通を整え、次に経済・民生・文化・金融・都市制度を治めること。') },
      { speaker: 'queen', text: T('任命之有效期，以市民仍然願意給予閣下機會為準。', 'Your appointment lasts as long as the people are still willing to give you a chance.', '任期は、市民がなお貴殿に機会を与える限りとする。') },
      { speaker: 'queen', text: T('請謹記：政績不等於民望；繁華不等於安居；城市不只屬於政府。', 'Remember: achievements are not popularity; prosperity is not a home; a city does not belong to its government alone.', '心せよ。実績は民意にあらず、繁栄は安住にあらず、都市は政府だけのものにあらず。') },
      { speaker: 'queen', text: T('噢，還有——旅費自付。保險、夜間加班及市民投訴處理費用，恕不發還。', 'Oh, and one more thing - travel at your own expense. Insurance, overtime and the handling of complaints will not be reimbursed.', 'ああ、それと――旅費は自己負担。保険、夜間残業、市民苦情処理の費用は払い戻さない。') },
    ]),
    // The player picks a reply (said by the mayor) and Her Majesty answers it.
    ask: T('（點樣回覆女皇陛下？）', '(How do you answer Her Majesty?)', '（女王陛下にどう返事する？）'),
    replies: Object.freeze([
      { text: T('遵命！臣定必竭盡所能！', 'At once! I shall do my utmost!', '御意！全力を尽くします！'),
        answer: T('甚好。皇室對閣下寄予厚望，尤其係電費。', 'Very good. The Crown expects great things of you - especially the electricity bill.', 'よろしい。王室は貴殿に大いに期待している。特に電気代について。') },
      { text: T('市長幾錢人工？有冇雙糧？', 'What does a mayor earn? Is there a year-end bonus?', '市長の給料は？ボーナスは？'),
        answer: T('本職屬高度榮譽性質。薪酬由財政官在有錢時再議。', 'The post is a high honour. Pay will be discussed by the Treasurer when there is money.', '本職は極めて名誉ある職である。報酬は財政官が金のある時に改めて協議する。') },
      { text: T('你係咪詐騙信？', 'Is this a scam letter?', 'これって詐欺の手紙？'),
        answer: T('本信已通過皇家最高級資安檢查。至於閣下點證實，係另一個問題。', 'This letter has passed the Crown\'s highest security check. How you would verify that is another matter.', '本状は王室最高レベルのセキュリティ審査を通過している。貴殿がそれをどう確かめるかは別の問題である。') },
      { text: T('我聽日要返工，唔做得唔得？', 'I have work tomorrow. Can I say no?', '明日は仕事なんですが、断れませんか？'),
        answer: T('任命已刊憲。祝閣下上任愉快。', 'The appointment has been gazetted. We wish you a pleasant start.', '任命は官報に掲載済みである。就任おめでとう。') },
    ]),
    departure: Object.freeze({ card: T('出發去北區', 'Off to North District', '北区へ出発') }),
    arrival: Object.freeze([
      { speaker: 'secretary', text: T('市長，你終於到喇！我係你嘅秘書金毛玲，負責向你解釋每一個……唔合理嘅政策。', 'Mayor, you\'re finally here! I\'m Kam Mo-ling, your secretary - I explain every... unreasonable policy to you.', '市長、ようやく到着ですね！秘書の金毛玲です。あらゆる……不合理な政策をご説明する係です。') },
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
      body: T('市長秘書金毛玲表示，新市鎮人口突破三千、收支轉正，整體發展「暢順」，政府會繼續「提升」及「優化」。', 'The mayor\'s secretary, Kam Mo-ling, said the new town has passed 3,000 people and balanced its books; development is "smooth", and the government will keep "enhancing" and "optimising".', '市長秘書の金毛玲は、ニュータウンの人口が3,000人を超え収支も黒字化し、発展は「順調」で、政府は今後も「向上」と「最適化」に努めると述べた。'),
      comments: Object.freeze([
        T('三千人都叫新市鎮？我屋企條村都多過呢個數。', 'Three thousand people is a new town? My village has more than that.', '3,000人でニュータウン？うちの村の方が多いぞ。'),
        T('路燈有咗，下一步可唔可以有巴士？', 'We have street lights now. Can we have a bus next?', '街灯はついた。次はバスをお願いできる？'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'secretary', text: T('市長，十二個月過咗……女皇密令話，任命有效期以市民仍然願意畀機會為準。', 'Mayor, twelve months have passed... The Secret Order says the appointment lasts as long as the people still give you a chance.', '市長、12か月が過ぎました……女王の密令によれば、任期は市民がまだ機会を与えてくれる限りだそうです。') },
    ]),
  });

  // Shared objectives (P2 chapters).
  const busRoutesObjective = (count) => ({
    id: 'busRoutes', label: T(`至少 ${count} 條有乘客嘅巴士線`, `At least ${count} bus routes carrying passengers`, `乗客のいるバス路線が${count}本以上`),
    check: (s) => num(s.busRoutes) >= count, progress: (s) => `${fmt(s.busRoutes)} / ${count}`,
  });
  const balanceObjective = (happiness) => ({
    id: 'balance', label: T(`滿意度達 ${Math.round(happiness * 100)}%，每月收支正數`, `Happiness of ${Math.round(happiness * 100)}% and a monthly surplus`, `満足度${Math.round(happiness * 100)}%、月の収支が黒字`),
    check: (s) => num(s.happiness) >= happiness && num(s.monthlyNet) > 0,
    progress: (s) => `${pct(s.happiness)} · ${money(s.monthlyNet)}`,
  });
  const dragonBoatObjective = {
    id: 'dragonBoat', label: T('喺海濱長廊舉辦一次端午龍舟賽', 'Hold a Dragon Boat race on the promenade', '遊歩道で端午のドラゴンボートレースを開催'),
    check: (s, base) => heldSince(s, base, 'dragonBoat') > 0, progress: (s, base) => tick(heldSince(s, base, 'dragonBoat') > 0),
  };
  const ridersObjective = (id, mode, count, label) => ({
    id, label, check: (s) => num(s.transit?.[mode]) >= count,
    progress: (s) => (count > 1 ? `${fmt(s.transit?.[mode])} / ${fmt(count)}` : fmt(s.transit?.[mode])),
  });

  // CHAPTER 02 大埔《安居樂業》: buses that pay their way, and the services a new town asks for.
  const CH02 = Object.freeze({
    id: 'ch02',
    startFile: 'UI/campaign/ch02.json',
    fresh: { cityName: T('大埔', 'Tai Po', '大埔'), budget: 60000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'resident', text: T('買咗樓先知，原來返工要行四十分鐘！', 'Only after buying the flat did I find out it is a forty-minute walk to work!', 'マンションを買ってから気づいた。職場まで歩いて40分だなんて！') },
      { speaker: 'transport', text: T('當局高度關注巴士班次不足嘅問題。', 'The authorities are highly concerned about the shortage of bus services.', '当局はバスの便数不足を深く憂慮しております。') },
      { speaker: 'treasurer', text: T('加車唔係唔得，條線開完要有人搭、有錢維護。', 'More buses, fine - but a route needs riders, and money to keep it running.', '増便は構わないが、路線には乗客と維持費が要る。') },
      { card: T('任務開始：大埔《安居樂業》', 'Mission start: Tai Po - "Settling In"', '任務開始：大埔「安居楽業」'),
        hint: T('開辦三條有乘客、合計有盈餘嘅巴士線；人口達 8,000，警署、消防局、醫院、街市同公園齊備。', 'Run three bus routes with riders that make money between them; reach 8,000 people with police, fire, a hospital, a market and a park.', '乗客がいて合計で黒字のバス路線を3本。人口8,000人、警察署・消防署・病院・市場・公園をそろえよう。') },
    ]),
    stars: Object.freeze([
      {
        title: T('巴士到站', 'The Bus Is Here', 'バス到着'),
        objectives: Object.freeze([
          busRoutesObjective(3),
          { id: 'busNet', label: T('巴士線合計每月營運有盈餘', 'The bus routes make money between them each month', 'バス路線が合計で毎月黒字'),
            check: (s) => num(s.busRoutes) > 0 && num(s.busRoutesNet) > 0, progress: (s) => money(s.busRoutesNet) },
          { id: 'population', label: T('人口達 8,000，失業率低於 10%', 'Population of 8,000, unemployment under 10%', '人口8,000人、失業率10%未満'),
            check: (s) => num(s.population) >= 8000 && num(s.unemploymentRate) < 0.1,
            progress: (s) => `${fmt(s.population)} / 8,000 · ${pct(s.unemploymentRate)}` },
          { id: 'services', label: T('有警署、消防局、醫院、街市同公園', 'A police station, fire station, hospital, market and park', '警察署・消防署・病院・市場・公園'),
            check: (s) => ['police_station', 'fire_station', 'hospital', 'public_market'].every((type) => built(s, type)) && (built(s, 'park_small') || built(s, 'park_large')),
            progress: (s) => `${['police_station', 'fire_station', 'hospital', 'public_market'].filter((type) => built(s, type)).length + ((built(s, 'park_small') || built(s, 'park_large')) ? 1 : 0)} / 5` },
          { id: 'balance', label: T('政府每月收支正數', 'The government runs a monthly surplus', '政府の月収支が黒字'),
            check: (s) => num(s.monthlyNet) > 0, progress: (s) => money(s.monthlyNet) },
        ]),
      },
      {
        title: T('科技新市鎮', 'The Tech New Town', 'テクノロジー・ニュータウン'),
        objectives: Object.freeze([
          { id: 'sciencePark', label: T('有香城科學園，通過《科研發展法》', 'A Science Park, and the Science Development Act passed', 'サイエンスパークがあり、科学開発法を可決'),
            check: (s) => built(s, 'science_park') && policy(s, 'scienceDevelopment'),
            progress: (s) => `🔬 ${tick(built(s, 'science_park'))} · 📜 ${tick(policy(s, 'scienceDevelopment'))}` },
          { id: 'scienceJobs', label: T('科學園職位達 300', '300 jobs in the Science Park', 'サイエンスパークの雇用300人'),
            check: (s) => num(s.scienceParkJobs) >= 300, progress: (s) => `${fmt(s.scienceParkJobs)} / 300` },
          { id: 'school', label: T('有中學或者大學', 'A secondary school or a university', '中学校または大学'),
            check: (s) => built(s, 'secondary_school') || built(s, 'university'), progress: (s) => tick(built(s, 'secondary_school') || built(s, 'university')) },
          ridersObjective('busRiders', 'bus', 3000, T('巴士每月載客 3,000 人次', 'Buses carry 3,000 riders a month', 'バスの月間乗客3,000人')),
        ]),
      },
      {
        title: T('創科都要過生活', 'Tech Still Has to Live', 'テクノロジーにも暮らしがある'),
        objectives: Object.freeze([
          busRoutesObjective(5),
          { id: 'busNet', label: T('巴士線合計每月營運有盈餘', 'The bus routes make money between them each month', 'バス路線が合計で毎月黒字'),
            check: (s) => num(s.busRoutesNet) > 0, progress: (s) => money(s.busRoutesNet) },
          { id: 'happiness', label: T('滿意度達 75%', 'Happiness of 75%', '満足度75%'),
            check: (s) => num(s.happiness) >= 0.75, progress: (s) => pct(s.happiness) },
          { id: 'reserve', label: T('財政儲備達 $100,000', 'Reserves of $100,000', '財政準備金$100,000'),
            check: (s) => num(s.funds) >= 100000, progress: (s) => `$${fmt(s.funds)} / $100,000` },
        ]),
      },
    ]),
    // 中段事件《攞你命3000》 (國產凌凌漆 as an easter egg; story only, no weapons to make)
    events: Object.freeze([
      {
        id: 'loNeiMeng3000',
        when: (s) => built(s, 'science_park'),
        lines: Object.freeze([
          { speaker: 'anchor', text: T('本台消息：香城科學園今日發表劃時代多功能科研產品——「攞你命3000」。', 'News just in: the Heung Shing Science Park today unveiled an epoch-making multi-purpose research product - the "Lo Nei Meng 3000".', '速報です。香城サイエンスパークは本日、画期的な多機能研究製品「ローネイメン3000」を発表しました。') },
          { speaker: 'secretary', text: T('研發單位聲望大增。至於有冇實際商業效益……', 'The research team\'s prestige has soared. As for any actual commercial value...', '研究チームの評判はうなぎ上りです。実際の商業的価値については……') },
          { speaker: 'treasurer', text: T('……', '...', '……') },
          { card: T('攞你命3000', 'Lo Nei Meng 3000', 'ローネイメン3000'),
            hint: T('繼續資助高調嘅創新展示可以提升聲望，但開支會增加；優先科研應用同企業育成，增長慢啲但穩陣啲。', 'Funding flashy showcases lifts prestige but costs more; backing applied research and start-ups grows slower but steadier.', '派手な展示に資金を出せば評判は上がるが出費も増える。応用研究と企業育成を優先すれば、成長は遅いが堅実だ。') },
        ]),
        forum: {
          headline: T('唔係呀嘛，真係攞你命3000？', 'No way - an actual Lo Nei Meng 3000?', 'まさか、本当にローネイメン3000？'),
          body: T('香城科學園發表「劃時代」產品，網民熱議用途。', 'The Science Park unveils an "epoch-making" product, and the internet argues about what it is for.', 'サイエンスパークが「画期的」製品を発表、ネットでは用途をめぐり議論に。'),
          comment: T('條巴士都未準時，科學園已經研究到末日科技。', 'The buses still are not on time, and the Science Park is already on doomsday tech.', 'バスはまだ定時運行もできないのに、サイエンスパークはもう終末テクノロジー。'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'secretary', text: T('大埔居民終於有車搭、有工返、有地方睇醫生。', 'Tai Po finally has buses to ride, jobs to go to and a doctor to see.', '大埔の住民はついに、乗るバスも、働く場所も、診てもらう病院も手に入れました。') },
      { speaker: 'tourism', text: T('隔籬西貢有山有海，係時候打造東方遊艇天堂。', 'Sai Kung next door has hills and sea - time to build the yacht paradise of the East.', '隣の西貢には山も海もある。東洋のヨット天国を作る時だ。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】大埔巴士網絡全面投入服務', '[Government News] Tai Po bus network enters full service', '【政府発表】大埔バス網、全面運行開始'),
      body: T('運輸署表示，三條新巴士線客量理想並錄得營運盈餘，當局會繼續「密切留意」班次。', 'The Transport Department said the three new routes have healthy ridership and an operating surplus, and that it will continue to "closely monitor" frequencies.', '運輸署によると、新設3路線は乗客数も良好で営業黒字を計上。当局は引き続き運行本数を「注視」するという。'),
      comments: Object.freeze([
        T('排咗廿分鐘終於上到車，多謝政府。', 'Queued twenty minutes and finally got on. Thanks, government.', '20分並んでやっと乗れた。政府ありがとう。'),
        T('有盈餘？咁點解唔加班次？', 'A surplus? Then why not run more buses?', '黒字？ならなぜ増便しない？'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'secretary', text: T('市長，期限過咗，大埔街坊仲喺巴士站排緊隊……', 'Mayor, time is up, and Tai Po is still queuing at the bus stop...', '市長、期限が過ぎました。大埔の住民はまだバス停で並んでいます……') },
    ]),
  });

  // CHAPTER 03 西貢《東方遊艇天堂》: a promenade end to end, a shelter, and a Dragon Boat race.
  // 24 months, not 12 (Norton 2026-11-19): the race comes once a year, so the window holds two.
  const CH03 = Object.freeze({
    id: 'ch03',
    startFile: 'UI/campaign/ch03.json',
    deadlineMonths: 24,
    fresh: { cityName: T('西貢', 'Sai Kung', '西貢'), budget: 80000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'tourism', text: T('我哋計劃將香城建成東方遊艇天堂！', 'We plan to make Heung Shing the yacht paradise of the East!', '香城を東洋のヨット天国にする計画です！') },
      { speaker: 'resident', text: T('你幫我條海濱路駁通先啦，我由呢頭行到嗰頭要兜半個鐘。', 'Join up the waterfront path first - it takes me half an hour to walk round from one end to the other.', 'まず海沿いの道をつないでくれ。端から端まで30分も回り道だ。') },
      { speaker: 'secretary', text: T('行人路，原來都可以算旅遊建設。', 'So a footpath counts as tourism infrastructure.', '歩道も観光インフラに数えられるんですね。') },
      { card: T('任務開始：西貢《東方遊艇天堂》', 'Mission start: Sai Kung - "Yacht Paradise of the East"', '任務開始：西貢「東洋のヨット天国」'),
        hint: T('起一條連續嘅海濱長廊同一個有遊艇嘅避風塘，喺長廊舉辦一次龍舟賽，旅遊吸引力達 60。', 'Build a continuous promenade and a typhoon shelter with yachts, hold a Dragon Boat race on the promenade, and reach a tourism appeal of 60.', '連続した海浜遊歩道と、ヨットのいる避難港をつくり、遊歩道でドラゴンボートレースを開催。観光魅力度60を目指そう。') },
    ]),
    stars: Object.freeze([
      {
        title: T('海濱正式開放', 'The Waterfront Opens', '海浜、正式オープン'),
        objectives: Object.freeze([
          { id: 'promenade', label: T('連續海濱長廊達 15 格（300 米）', 'A continuous promenade of 15 tiles (300 m)', '連続した遊歩道15マス（300m）'),
            check: (s) => num(s.promenadeLongest) >= 15, progress: (s) => `${fmt(s.promenadeLongest)} / 15` },
          { id: 'shelter', label: T('避風塘運作中，有遊艇停泊', 'A working typhoon shelter with yachts moored', '稼働中の避難港にヨットが停泊'),
            check: (s) => num(s.typhoonShelters) > 0 && (num(s.yachts) > 0 || built(s, 'yacht_club')),
            progress: (s) => `⚓ ${fmt(s.typhoonShelters)} · ⛵ ${fmt(s.yachts)}` },
          dragonBoatObjective,
          { id: 'tourism', label: T('旅遊吸引力達 60', 'Tourism appeal of 60', '観光魅力度60'),
            check: (s) => num(s.tourismAppeal) >= 60, progress: (s) => `${fmt(s.tourismAppeal)} / 60` },
          balanceObjective(0.5),
        ]),
      },
      {
        title: T('遊艇與漁村', 'Yachts and Fishing Villages', 'ヨットと漁村'),
        objectives: Object.freeze([
          { id: 'yachtClub', label: T('有遊艇會，泊位有 5 艘遊艇', 'A yacht club, with 5 yachts moored', 'ヨットクラブがあり、ヨット5隻が停泊'),
            check: (s) => built(s, 'yacht_club') && num(s.yachts) >= 5, progress: (s) => `${tick(built(s, 'yacht_club'))} · ⛵ ${fmt(s.yachts)} / 5` },
          ridersObjective('ferry', 'ferry', 1, T('觀光航線（渡輪）有乘客', 'A sightseeing ferry route with passengers', '観光航路（フェリー）に乗客')),
          { id: 'tourism', label: T('旅遊吸引力達 70', 'Tourism appeal of 70', '観光魅力度70'),
            check: (s) => num(s.tourismAppeal) >= 70, progress: (s) => `${fmt(s.tourismAppeal)} / 70` },
        ]),
      },
      {
        title: T('海灣盛世', 'The Bay in Its Glory', '入り江の盛世'),
        objectives: Object.freeze([
          { id: 'tourism', label: T('旅遊吸引力達 80', 'Tourism appeal of 80', '観光魅力度80'),
            check: (s) => num(s.tourismAppeal) >= 80, progress: (s) => `${fmt(s.tourismAppeal)} / 80` },
          { id: 'environment', label: T('污染低於 30%', 'Pollution under 30%', '汚染30%未満'),
            check: (s) => num(s.pollution) < 0.3, progress: (s) => pct(s.pollution) },
          { id: 'traffic', label: T('交通擠塞指數不高於 40%', 'Traffic congestion at 40% or less', '交通渋滞指数40%以下'),
            check: (s) => num(s.trafficIndex) <= 0.4, progress: (s) => pct(s.trafficIndex) },
          balanceObjective(0.7),
        ]),
      },
    ]),
    // 中段事件《龍舟未開，海旁先迫爆》: the race's month came and there was no promenade to hold it on
    events: Object.freeze([
      {
        id: 'noPromenade',
        when: (s, run) => num(s.festivalNoVenueYear?.dragonBoat) > num(run?.base?.festivalNoVenueYear?.dragonBoat),
        lines: Object.freeze([
          { speaker: 'secretary', text: T('市長，端午到咗，但係海濱長廊未連成一線——遊客無法安全抵達觀賽區。', 'Mayor, Tuen Ng is here, but the promenade does not join up - visitors cannot safely reach the stands.', '市長、端午が来ましたが遊歩道がつながっていません。観客が安全に観覧席まで行けません。') },
          { speaker: 'tourism', text: T('龍舟要落水，觀眾都要有地方企。', 'The boats need water, and the crowds need somewhere to stand.', '龍舟には水面が、観客には立つ場所が要る。') },
          { card: T('龍舟未開，海旁先迫爆', 'No Race Yet, and the Waterfront Is Already Packed', 'レース前から海辺は大混雑'),
            hint: T('起好連續嘅海濱長廊，下年端午六艘龍舟就可以正式落水。', 'Finish a continuous promenade and six dragon boats can take to the water next Tuen Ng.', '連続した遊歩道を完成させれば、来年の端午には6艇のドラゴンボートが出走できる。') },
        ]),
        forum: {
          headline: T('東方遊艇天堂？我只見到岸上全部係欄杆。', 'Yacht paradise of the East? All I see on the shore is railings.', '東洋のヨット天国？岸には柵しか見えないぞ。'),
          body: T('西貢龍舟賽因場地問題延期，政府稱會「積極跟進」海濱長廊工程。', 'The Sai Kung Dragon Boat race is off over its venue; the government says it is "actively following up" the promenade works.', '西貢ドラゴンボートレースは会場問題で延期。政府は遊歩道工事を「積極的にフォロー」するとしている。'),
          comment: T('龍舟贏咗，觀眾輸喺條塞車路。', 'The boats won; the spectators lost on the jammed road.', 'ボートは勝ったが、観客は渋滞道路で負けた。'),
        },
      },
    ]),
    outro: Object.freeze([
      { card: T('海灣龍舟衝線', 'Dragon boats cross the line in the bay', '入り江でドラゴンボートがゴール') },
      { speaker: 'tourism', text: T('西貢識搞海，南區就要連漁港、海洋公園同地鐵一齊搞！', 'Sai Kung has the sea sorted - in Southern it is the fishing port, Ocean Park and the metro all together!', '西貢は海をものにした。南区は漁港、海洋公園、地下鉄をまとめてやるぞ！') },
    ]),
    outroForum: {
      headline: T('【政府新聞】西貢海濱長廊正式開放', '[Government News] Sai Kung promenade officially opens', '【政府発表】西貢海浜遊歩道が正式開放'),
      body: T('旅遊署表示，海濱長廊連接碼頭、村落同觀景點，龍舟賽圓滿舉行，「東方遊艇天堂」計劃邁出重要一步。', 'The Tourism Board said the promenade links the piers, villages and viewpoints, the Dragon Boat race went off well, and the "yacht paradise" plan has taken an important step.', '観光局によると、遊歩道は桟橋・村・展望地を結び、ドラゴンボートレースも成功。「ヨット天国」計画は重要な一歩を踏み出した。'),
      comments: Object.freeze([
        T('終於唔使兜半個鐘，多謝。', 'No more half-hour detour. Thanks.', 'もう30分の回り道は不要。ありがとう。'),
        T('遊艇天堂，我得睇冇得坐。', 'A yacht paradise I can look at but never board.', 'ヨット天国、見るだけで乗れない。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'secretary', text: T('市長，二十四個月過咗，海濱長廊仲係斷開幾截……', 'Mayor, twenty-four months on, the promenade is still in pieces...', '市長、24か月が過ぎましたが、遊歩道はまだ途切れ途切れです……') },
    ]),
  });

  // CHAPTER 04 南區《南島奇蹟》: the first metro with riders, the fishing port and Ocean Park.
  // Every chapter plays on its own 256x256 district map, never a made-up one (Norton 2026-11-19).
  // Star 1 should fit in about 24 months, and the metro (30,000) and Ocean Park (35,000) are out of
  // reach from bare land, so this one starts from a built 香港仔 and 黃竹坑 of about 15,000
  // (UI/campaign/ch04.json; left alone it levels off near 23,000). 24 months also covers the
  // yearly Dragon Boat race. Without the file: a new city on the bare map.
  const CH04 = Object.freeze({
    id: 'ch04',
    startFile: 'UI/campaign/ch04.json',
    deadlineMonths: 24,
    fresh: { cityName: T('南區', 'Southern', '南区'), budget: 100000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'tourism', text: T('政府正式提出《無處不旅遊》法案，並計劃成立北極企鵝保育基地！', 'The government is tabling the Tourism Everywhere Bill, and plans an Arctic penguin conservation base!', '政府は「どこでも観光」法案を正式に提出し、北極ペンギン保護基地の設立を計画しています！') },
      { speaker: 'resident', text: T('北極有企鵝㗎咩？', 'Are there penguins in the Arctic?', '北極にペンギンっていたっけ？') },
      { speaker: 'secretary', text: T('呢個屬於政策跨學科創新，細節容後公布。', 'This is cross-disciplinary policy innovation. Details to be announced.', 'これは政策の学際的イノベーションです。詳細は追って発表します。') },
      { speaker: 'engineer', text: T('你哋傾完企鵝未？黃竹坑交通仲塞緊。', 'Are you done with the penguins? Wong Chuk Hang is still jammed.', 'ペンギンの話は済んだ？黄竹坑はまだ渋滞してるよ。') },
      { card: T('任務開始：南區《南島奇蹟》', 'Mission start: Southern - "The Southern Island Miracle"', '任務開始：南区「南島の奇跡」'),
        hint: T('鋪設港島南線地鐵並載到乘客；漁港同工業區正常運作；興建海洋公園；喺海濱長廊舉辦一次龍舟賽。', 'Lay the South Island metro line and carry riders; keep the fishing port and industry working; build Ocean Park; hold a Dragon Boat race on the promenade.', '港島南線の地下鉄を敷いて乗客を運ぼう。漁港と工業地区を稼働させ、海洋公園を建て、遊歩道でドラゴンボートレースを開催しよう。') },
    ]),
    stars: Object.freeze([
      {
        title: T('南島有鐵', 'A Railway for the South', '南島に鉄道を'),
        objectives: Object.freeze([
          ridersObjective('metro', 'metro', 1, T('地鐵線有乘客上落車', 'A metro line with passengers getting on and off', '地下鉄路線で乗客が乗り降り')),
          { id: 'port', label: T('漁港（避風塘）運作中，工業有就業', 'A working fishing port (typhoon shelter) and industry with jobs', '稼働中の漁港（避難港）と雇用のある工業'),
            check: (s) => num(s.typhoonShelters) > 0 && num(s.industrialCount) > 0 && num(s.unemploymentRate) < 0.1,
            progress: (s) => `⚓ ${fmt(s.typhoonShelters)} · I ${fmt(s.industrialCount)} · ${pct(s.unemploymentRate)}` },
          { id: 'oceanPark', label: T('有海洋公園', 'Ocean Park', '海洋公園'),
            check: (s) => built(s, 'ocean_park'), progress: (s) => tick(built(s, 'ocean_park')) },
          dragonBoatObjective,
          balanceObjective(0.5),
        ]),
      },
      {
        title: T('珍寶歸航', 'The Jumbo Comes Home', 'ジャンボ、帰港'),
        objectives: Object.freeze([
          { id: 'jumbo', label: T('避風塘有海鮮舫', 'A floating restaurant in the shelter', '避難港に水上レストラン'),
            check: (s) => built(s, 'floating_restaurant'), progress: (s) => tick(built(s, 'floating_restaurant')) },
          { id: 'penguins', label: T('通過《北極企鵝保育區條例》', 'The Arctic Penguin Conservation Zone passed', '北極ペンギン保護区条例を可決'),
            check: (s) => policy(s, 'arcticPenguinReserve'), progress: (s) => tick(policy(s, 'arcticPenguinReserve')) },
          ridersObjective('metroRiders', 'metro', 5000, T('地鐵每月載客 5,000 人次', 'The metro carries 5,000 riders a month', '地下鉄の月間乗客5,000人')),
          { id: 'tourism', label: T('旅遊吸引力達 65', 'Tourism appeal of 65', '観光魅力度65'),
            check: (s) => num(s.tourismAppeal) >= 65, progress: (s) => `${fmt(s.tourismAppeal)} / 65` },
        ]),
      },
      {
        title: T('南島假期', 'Southern Holiday', '南島の休日'),
        objectives: Object.freeze([
          ridersObjective('metroRiders', 'metro', 10000, T('地鐵每月載客 10,000 人次', 'The metro carries 10,000 riders a month', '地下鉄の月間乗客10,000人')),
          { id: 'region', label: T('有區外連線（接駁金鐘方向）', 'A region connection (towards Admiralty)', '区外連絡（金鐘方面へ）'),
            check: (s) => num(s.regionConnections) > 0, progress: (s) => fmt(s.regionConnections) },
          { id: 'tourism', label: T('旅遊吸引力達 75', 'Tourism appeal of 75', '観光魅力度75'),
            check: (s) => num(s.tourismAppeal) >= 75, progress: (s) => `${fmt(s.tourismAppeal)} / 75` },
          { id: 'traffic', label: T('交通擠塞指數不高於 40%', 'Traffic congestion at 40% or less', '交通渋滞指数40%以下'),
            check: (s) => num(s.trafficIndex) <= 0.4, progress: (s) => pct(s.trafficIndex) },
        ]),
      },
    ]),
    // 中段事件《珍寶海鮮舫復活》: a shelter and a sightseeing ferry open the way to the Jumbo
    events: Object.freeze([
      {
        id: 'jumboReturns',
        when: (s) => num(s.typhoonShelters) > 0 && num(s.transit?.ferry) > 0 && !built(s, 'floating_restaurant'),
        lines: Object.freeze([
          { speaker: 'tourism', text: T('碼頭同觀光航線都有咗，珍寶海鮮舫可以重新開張！', 'With the piers and a sightseeing route running, the Jumbo can reopen!', '桟橋も観光航路もそろった。ジャンボ海鮮舫を再開できる！') },
          { speaker: 'treasurer', text: T('懷舊定宴會都好，海鮮舫要維修、要船費。', 'Nostalgic or banquet, a floating restaurant needs upkeep and boat fares.', '懐古でも宴会でも、水上レストランには維持費と船代がかかる。') },
          { card: T('珍寶海鮮舫復活', 'The Jumbo Returns', 'ジャンボ海鮮舫、復活'),
            hint: T('喺避風塘起返一艘海鮮舫，做返南區嘅海上地標。', 'Build a floating restaurant in the shelter - the South\'s landmark on the water again.', '避難港に水上レストランを建て、南区の海上ランドマークを取り戻そう。') },
        ]),
        forum: {
          headline: T('冇地鐵嘅時候，政府就話南區好浪漫。', 'Before the metro, the government called the South romantic.', '地下鉄がなかった頃、政府は南区をロマンチックだと言っていた。'),
          body: T('政府研究重建珍寶海鮮舫，旅遊署稱「懷舊與創新並重」。', 'The government studies rebuilding the Jumbo; the Tourism Board promises "nostalgia and innovation alike".', '政府はジャンボ海鮮舫の再建を検討。観光局は「懐古と革新の両立」を掲げる。'),
          comment: T('北極企鵝係咪等同熱帶冰川？', 'Are Arctic penguins like tropical glaciers?', '北極のペンギンって熱帯の氷河みたいなもの？'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'engineer', text: T('市長，第一條真正有乘客嘅地鐵開通喇。', 'Mayor, the first metro with real passengers is open.', '市長、本当に乗客を乗せる最初の地下鉄が開通しました。') },
      { speaker: 'secretary', text: T('下一站黃大仙。嗰邊要解決嘅問題，唔係旅客，而係市民。', 'Next stop Wong Tai Sin. The problem there is not tourists, it is residents.', '次は黄大仙。あちらで解決すべきは観光客ではなく、市民の問題です。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】港島南線正式通車', '[Government News] The South Island line opens', '【政府発表】港島南線が正式開業'),
      body: T('南區首條地鐵線投入服務，乘客可由海洋公園直達漁港；當局稱假日車流「有望改善」。', 'The South\'s first metro line enters service, Ocean Park to the fishing port; officials say holiday traffic "is expected to improve".', '南区初の地下鉄が運行開始。海洋公園から漁港まで直通となり、当局は休日の渋滞が「改善の見込み」とした。'),
      comments: Object.freeze([
        T('終於唔使坐旅遊巴入黃竹坑。', 'No more tour coaches into Wong Chuk Hang.', 'もう観光バスで黄竹坑に入らなくていい。'),
        T('企鵝呢？企鵝幾時到？', 'And the penguins? When do the penguins arrive?', 'ペンギンは？ペンギンはいつ来るの？'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'secretary', text: T('市長，二十四個月過咗，南區仲係靠旅遊巴……', 'Mayor, twenty-four months on, the South still runs on tour coaches...', '市長、24か月が過ぎましたが、南区はいまだに観光バス頼みです……') },
    ]),
  });

  // CHAPTER 07 屯門《塞車塞到痴線》: buses across districts, the light rail, the jams, night safety.
  // A new city on the bare 屯門 district map; the light rail opens at 15,000 people with the
  // council's funding, so star 1 gets 24 months.
  const CH07 = Object.freeze({
    id: 'ch07',
    startFile: 'UI/campaign/ch07.json',
    deadlineMonths: 24,
    fresh: { cityName: T('屯門', 'Tuen Mun', '屯門'), budget: 120000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'transport', text: T('屯門公路現時車流量較高，但整體交通情況仍然……', 'Traffic on Tuen Mun Road is currently heavy, but overall conditions remain...', '屯門公路の交通量は現在やや多めですが、全体としては依然……') },
      { speaker: 'resident', text: T('塞車塞到痴線呀！', 'This traffic is driving me mad!', '渋滞で頭がおかしくなりそうだ！') },
      { speaker: 'engineer', text: T('巴士唔夠，輕鐵都要建；仲要識得過馬路。', 'Not enough buses, so we build the light rail too - and it has to know how to cross a road.', 'バスが足りないならライトレールも作る。しかも道路を渡れるようにね。') },
      { card: T('任務開始：屯門《塞車塞到痴線》', 'Mission start: Tuen Mun - "Jammed Up"', '任務開始：屯門「渋滞で発狂寸前」'),
        hint: T('開辦五條有乘客嘅巴士線（三條跨區）、令輕鐵載客，降低擠塞同罪案。地區牌劃分地區：一條線嘅車站喺兩個地區牌範圍內就算跨區。', 'Run five bus routes with riders (three across districts), get the light rail carrying people, and bring down congestion and crime. District signs mark districts: a route with stops in two signs\' areas crosses districts.', '乗客のいるバス路線を5本（うち3本は区をまたぐ）、ライトレールで乗客を運び、渋滞と犯罪を減らそう。地区標識が地区を区切る。2つの標識の範囲に停留所がある路線が「区をまたぐ」。') },
    ]),
    stars: Object.freeze([
      {
        title: T('屯門通車', 'Tuen Mun Gets Moving', '屯門、開通'),
        objectives: Object.freeze([
          busRoutesObjective(5),
          { id: 'crossDistrict', label: T('當中 3 條跨區（車站喺兩個或以上地區牌範圍）', 'Three of them cross districts (stops in two or more district signs\' areas)', 'うち3本が区をまたぐ（2つ以上の地区標識の範囲に停留所）'),
            check: (s) => num(s.crossDistrictRoutes) >= 3, progress: (s) => `${fmt(s.crossDistrictRoutes)} / 3` },
          ridersObjective('lightRail', 'lightRail', 1, T('輕鐵有乘客', 'The light rail carries passengers', 'ライトレールに乗客')),
          { id: 'traffic', label: T('交通擠塞指數不高於 50%', 'Traffic congestion at 50% or less', '交通渋滞指数50%以下'),
            check: (s) => num(s.trafficIndex) <= 0.5, progress: (s) => pct(s.trafficIndex) },
          { id: 'safety', label: T('有警署，罪案指數低於 30%', 'A police station, and crime under 30%', '警察署があり、犯罪指数30%未満'),
            check: (s) => built(s, 'police_station') && num(s.crimeRate) < 0.3, progress: (s) => `🚓 ${fmt(s.buildings?.police_station)} · ${pct(s.crimeRate)}` },
          { id: 'balance', label: T('政府每月收支正數', 'The government runs a monthly surplus', '政府の月収支が黒字'),
            check: (s) => num(s.monthlyNet) > 0, progress: (s) => money(s.monthlyNet) },
        ]),
      },
      {
        title: T('叮叮唔係呢種叮叮', 'Not That Kind of Ding Ding', 'ディンディンちがい'),
        objectives: Object.freeze([
          ridersObjective('lightRailRiders', 'lightRail', 3000, T('輕鐵每月載客 3,000 人次', 'The light rail carries 3,000 riders a month', 'ライトレールの月間乗客3,000人')),
          ridersObjective('metro', 'metro', 1, T('地鐵（屯馬綫）有乘客，同輕鐵轉乘', 'The metro (Tuen Ma line) carries riders to change with the light rail', '地下鉄（屯馬線）に乗客、ライトレールと乗り換え')),
          { id: 'traffic', label: T('交通擠塞指數不高於 45%', 'Traffic congestion at 45% or less', '交通渋滞指数45%以下'),
            check: (s) => num(s.trafficIndex) <= 0.45, progress: (s) => pct(s.trafficIndex) },
        ]),
      },
      {
        title: T('新市鎮唔再困住', 'The New Town Breaks Free', 'ニュータウン、もう閉じ込められない'),
        objectives: Object.freeze([
          { id: 'share', label: T('公共交通每月載客達人口 30%', 'Public transport carries 30% of the population a month', '公共交通の月間乗客が人口の30%'),
            check: (s) => num(s.population) > 0 && num(s.transitRiders) >= num(s.population) * 0.3,
            progress: (s) => `${fmt(s.transitRiders)} / ${fmt(num(s.population) * 0.3)}` },
          { id: 'safety', label: T('罪案指數低於 20%', 'Crime under 20%', '犯罪指数20%未満'),
            check: (s) => num(s.crimeRate) < 0.2, progress: (s) => pct(s.crimeRate) },
          { id: 'landmarks', label: T('有黃金海岸酒店同遊艇會', 'The Gold Coast Hotel and a yacht club', 'ゴールドコーストホテルとヨットクラブ'),
            check: (s) => built(s, 'gold_coast_hotel') && built(s, 'yacht_club'),
            progress: (s) => `🏨 ${tick(built(s, 'gold_coast_hotel'))} · ⛵ ${tick(built(s, 'yacht_club'))}` },
          { id: 'surplus', label: T('連續 12 個月盈餘，滿意度達 70%', 'A surplus 12 months running, happiness of 70%', '12か月連続の黒字、満足度70%'),
            check: (s) => num(s.surplusStreak) >= 12 && num(s.happiness) >= 0.7,
            progress: (s) => `${fmt(s.surplusStreak)} / 12 · ${pct(s.happiness)}` },
        ]),
      },
    ]),
    events: Object.freeze([
      // 中段事件《輕鐵過路，汽車等一等》: the first light rail on the street
      {
        id: 'levelCrossing',
        when: (s) => num(s.transit?.lightRail) > 0,
        lines: Object.freeze([
          { speaker: 'engineer', text: T('第一個路面輕鐵平交口啟用喇。', 'The first street-level light rail crossing is open.', '最初の路面ライトレールの平面交差が開通しました。') },
          { speaker: 'transport', text: T('列車同汽車要輪流過，交通燈點排，要諗清楚。', 'Trains and cars take turns now - the signals need thinking through.', '列車と車が交互に通る。信号の組み方をよく考えないと。') },
          { card: T('輕鐵過路，汽車等一等', 'The Light Rail Crosses; Cars, Please Wait', 'ライトレール通過、車はしばし待て'),
            hint: T('留意平交口附近嘅車流：路面擠塞會拖慢巴士同輕鐵。', 'Watch the traffic round the crossings: jammed streets slow the buses and the light rail.', '平面交差付近の交通に注意。路面の渋滞はバスもライトレールも遅らせる。') },
        ]),
        forum: {
          headline: T('巴士等輕鐵，輕鐵等紅燈，紅燈等政府。', 'The bus waits for the light rail, the light rail for the red light, the red light for the government.', 'バスはライトレールを待ち、ライトレールは赤信号を待ち、赤信号は政府を待つ。'),
          body: T('屯門首個輕鐵平交口啟用，附近交通一度擠塞。', 'Tuen Mun\'s first light rail crossing opens, and the streets round it jam for a while.', '屯門初のライトレール平面交差が開通、周辺は一時渋滞した。'),
          comment: T('市長，我由屯門返工已經老咗三歲。', 'Mayor, commuting from Tuen Mun has aged me three years.', '市長、屯門から通勤するうちに3歳老けたよ。'),
        },
      },
      // 安全支線: night safety is the residents' safety, told plainly - no jokes, no forum post
      {
        id: 'nightSafety',
        when: (s) => num(s.crimeRate) >= 0.35,
        lines: Object.freeze([
          { speaker: 'resident', text: T('夜晚放工行返屋企，條路黑麻麻，唔係幾安全。', 'Walking home from work at night, the street is dark. It does not feel safe.', '夜、仕事帰りに歩くと道が真っ暗で、あまり安全じゃない。') },
          { speaker: 'secretary', text: T('市民嘅人身安全唔係講笑。要加警力、照明同社區支援。', 'People\'s safety is no joke. We need more police, better lighting and community support.', '市民の身の安全は冗談ではありません。警察力、照明、地域の支援を強化しましょう。') },
          { card: T('夜歸安全', 'Getting Home Safely at Night', '夜道の安全'),
            hint: T('加建警署、改善治安，令罪案指數降到 30% 以下。', 'Build police stations and improve safety to bring crime under 30%.', '警察署を増やして治安を改善し、犯罪指数を30%未満に下げよう。') },
        ]),
      },
    ]),
    outro: Object.freeze([
      { speaker: 'transport', text: T('屯門道路與鐵路系統初步達到可運作水平。', 'Tuen Mun\'s roads and railways have reached a preliminary operable level.', '屯門の道路と鉄道は、初歩的な運用水準に達しました。') },
      { speaker: 'resident', text: T('得喇，總之我今日趕到返工。', 'Fine - anyway, I made it to work on time today.', 'まあいいさ、とにかく今日は間に合った。') },
      { speaker: 'engineer', text: T('下一站元朗，輕鐵仲有好多路要行。', 'Next stop Yuen Long. The light rail has a long way still to go.', '次は元朗。ライトレールの道はまだ長い。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】屯門輕鐵正式通車', '[Government News] Tuen Mun light rail opens', '【政府発表】屯門ライトレールが正式開業'),
      body: T('運輸署表示，跨區巴士同輕鐵服務令屯門公路車流「有所紓緩」。', 'The Transport Department said cross-district buses and the light rail have "somewhat eased" Tuen Mun Road.', '運輸署によると、区をまたぐバスとライトレールで屯門公路の交通は「やや緩和」された。'),
      comments: Object.freeze([
        T('有所紓緩，即係由三粒鐘變兩粒半。', '"Somewhat eased" means three hours became two and a half.', '「やや緩和」とは、3時間が2時間半になったということ。'),
        T('輕鐵叮一聲，成條街停晒。', 'The light rail goes ding, and the whole street stops.', 'ライトレールがチンと鳴ると、通り全体が止まる。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'secretary', text: T('市長，期限過咗，屯門公路仲係塞……', 'Mayor, time is up, and Tuen Mun Road is still jammed...', '市長、期限が過ぎました。屯門公路はまだ渋滞しています……') },
    ]),
  });

  // CHAPTER 12 東區《叮叮遊港島》: the double-decker trams, the Island line and the buses together.
  // The Island line opens at 30,000 people with the council's funding, so (Norton 2026-11-19) the
  // chapter starts from a built 北角 of about 15,000 on the 東區 district map, with the main road
  // through to 柴灣 (UI/campaign/ch12.json; left alone it levels off near 23,000), and 24 months.
  const CH12 = Object.freeze({
    id: 'ch12',
    startFile: 'UI/campaign/ch12.json',
    deadlineMonths: 24,
    fresh: { cityName: T('東區', 'Eastern', '東区'), budget: 150000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'tram', text: T('叮叮行得慢，但好多街坊日日靠佢出入。', 'The ding ding is slow, but a lot of people rely on it every day.', 'ディンディンは遅いけれど、毎日頼りにしている住民が大勢いる。') },
      { speaker: 'resident', text: T('慢唔緊要，唔好拆咗佢呀。', 'Slow is fine. Just do not tear it out.', '遅くてもいい。撤去だけはしないでくれ。') },
      { speaker: 'engineer', text: T('注意：呢個係雙層電車，唔係屯門嗰種輕鐵。', 'Note: this is a double-decker tram, not the Tuen Mun light rail.', '注意：これは2階建ての路面電車で、屯門のライトレールとは別物です。') },
      { card: T('任務開始：東區《叮叮遊港島》', 'Mission start: Eastern - "Ding Ding Round the Island"', '任務開始：東区「ディンディンで港島めぐり」'),
        hint: T('鋪電車軌、設電車站同開線載客；港島綫同巴士都要有人搭；控制街道擠塞同罪案。', 'Lay tram track, build stops and run a line with riders; the Island line and the buses need riders too; keep the streets moving and safe.', '路面電車の軌道と停留所をつくって運行しよう。港島線とバスにも乗客を。街の渋滞と犯罪を抑えよう。') },
    ]),
    stars: Object.freeze([
      {
        title: T('叮叮正式營運', 'The Trams Are Running', 'ディンディン、営業開始'),
        objectives: Object.freeze([
          ridersObjective('tram', 'tram', 1, T('電車有乘客', 'The trams carry passengers', '路面電車に乗客')),
          { id: 'metroBus', label: T('港島綫同巴士都有乘客', 'The Island line and the buses both carry riders', '港島線とバスの両方に乗客'),
            check: (s) => num(s.transit?.metro) > 0 && num(s.transit?.bus) > 0,
            progress: (s) => `🚇 ${fmt(s.transit?.metro)} · 🚌 ${fmt(s.transit?.bus)}` },
          { id: 'jobs', label: T('住宅、商業、工業都有建築，失業率低於 8%', 'Homes, offices and industry built; unemployment under 8%', '住宅・商業・工業がそろい、失業率8%未満'),
            check: (s) => num(s.residentialCount) > 0 && num(s.commercialCount) > 0 && num(s.industrialCount) > 0 && num(s.unemploymentRate) < 0.08,
            progress: (s) => `R ${fmt(s.residentialCount)} · C ${fmt(s.commercialCount)} · I ${fmt(s.industrialCount)} · ${pct(s.unemploymentRate)}` },
          { id: 'streets', label: T('交通擠塞指數不高於 50%，罪案指數低於 30%', 'Congestion at 50% or less, crime under 30%', '交通渋滞指数50%以下、犯罪指数30%未満'),
            check: (s) => num(s.trafficIndex) <= 0.5 && num(s.crimeRate) < 0.3,
            progress: (s) => `${pct(s.trafficIndex)} · ${pct(s.crimeRate)}` },
          balanceObjective(0.55),
        ]),
      },
      {
        title: T('電車全車身廣告', 'Full-Body Tram Ads', '路面電車のラッピング広告'),
        objectives: Object.freeze([
          ridersObjective('tramRiders', 'tram', 5000, T('電車每月載客 5,000 人次', 'The trams carry 5,000 riders a month', '路面電車の月間乗客5,000人')),
          { id: 'festival', label: T('開章後舉辦一次節慶活動', 'Hold a festival since the chapter began', '章の開始後に祭りを1回開催'),
            check: (s, base) => heldAnySince(s, base), progress: (s, base) => tick(heldAnySince(s, base)) },
          { id: 'tourism', label: T('旅遊吸引力達 60', 'Tourism appeal of 60', '観光魅力度60'),
            check: (s) => num(s.tourismAppeal) >= 60, progress: (s) => `${fmt(s.tourismAppeal)} / 60` },
        ]),
      },
      {
        title: T('摘去鮮花，然後種出叮叮', 'Pick the Flowers, Then Grow the Ding Dings', '花を摘み、ディンディンを育てる'),
        objectives: Object.freeze([
          { id: 'network', label: T('每月載客：電車 10,000、港島綫 10,000、巴士 5,000', 'Riders a month: trams 10,000, Island line 10,000, buses 5,000', '月間乗客：路面電車10,000・港島線10,000・バス5,000'),
            check: (s) => num(s.transit?.tram) >= 10000 && num(s.transit?.metro) >= 10000 && num(s.transit?.bus) >= 5000,
            progress: (s) => `🚋 ${fmt(s.transit?.tram)} · 🚇 ${fmt(s.transit?.metro)} · 🚌 ${fmt(s.transit?.bus)}` },
          { id: 'market', label: T('保留街市', 'Keep a public market', '公設市場を残す'),
            check: (s) => built(s, 'public_market'), progress: (s) => tick(built(s, 'public_market')) },
          { id: 'tourism', label: T('旅遊吸引力達 70', 'Tourism appeal of 70', '観光魅力度70'),
            check: (s) => num(s.tourismAppeal) >= 70, progress: (s) => `${fmt(s.tourismAppeal)} / 70` },
          { id: 'happiness', label: T('滿意度達 70%', 'Happiness of 70%', '満足度70%'),
            check: (s) => num(s.happiness) >= 0.7, progress: (s) => pct(s.happiness) },
        ]),
      },
    ]),
    // 中段事件《同志，下一站有落》 (富貴再逼人): the old M-Train's ball handrails, taken for an intercom
    events: Object.freeze([
      {
        id: 'nextStopComrade',
        when: (s) => num(s.transit?.metro) >= 1000,
        lines: Object.freeze([
          { speaker: 'transport', text: T('舊式白頭 M-Train 投入服務，車廂有懷舊波波扶手。', 'The old white-fronted M-Trains are in service, with their nostalgic ball handrails.', '旧式の白い顔のMトレインが運行開始。車内には懐かしい玉付き手すり。') },
          { speaker: 'resident', text: T('（對住扶手）同志，下一站有落！', '(into the handrail) Comrade, next stop please!', '（手すりに向かって）同志、次で降ります！') },
          { speaker: 'secretary', text: T('……佢以為個扶手係對講機。', '...He thinks the handrail is an intercom.', '……手すりをインターホンだと思っているようです。') },
        ]),
        forum: {
          headline: T('政府推出懷舊波波扶手，乘客以為可以 call 車長。', 'Retro ball handrails return; passengers think they can call the driver.', '懐かしの玉付き手すり復活、乗客は運転士を呼べると勘違い。'),
          body: T('港鐵舊式列車重投服務，有乘客對住扶手講「同志，下一站有落」。', 'The old trains are back in service, and a passenger told a handrail "Comrade, next stop please".', '旧型車両が運行に復帰。手すりに「同志、次で降ります」と話しかける乗客も。'),
          comment: T('叮叮係情懷，趕返工係現實。', 'The trams are nostalgia; getting to work is reality.', 'ディンディンは郷愁、通勤は現実。'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'tram', text: T('叮叮一響，整條街就有晒港島味。', 'One ding ding, and the whole street tastes of the Island.', 'ディンディンと鳴れば、通り一面が港島の味になる。') },
      { speaker: 'transport', text: T('下一站觀塘——嗰邊有架高架地鐵，仲有好多工廠要變身。', 'Next stop Kwun Tong - an elevated metro, and a lot of factories waiting to change.', '次は観塘。高架の地下鉄があり、生まれ変わるべき工場がたくさんある。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】東區電車服務全面投入運作', '[Government News] Eastern tram service in full operation', '【政府発表】東区の路面電車が全面運行'),
      body: T('電車公司表示，雙層電車連接北角街市至筲箕灣，與港島綫及巴士形成完整網絡。', 'The tram company said the double-deckers link the North Point market to Shau Kei Wan, forming one network with the Island line and the buses.', '電車会社によると、2階建て電車は北角の市場から筲箕湾までを結び、港島線とバスとで一つの交通網になった。'),
      comments: Object.freeze([
        T('市長，可唔可以電車行快啲？', 'Mayor, can the trams go any faster?', '市長、路面電車をもう少し速くできない？'),
        T('$0.07 一程，平過我屋企部電飯煲嘅電費。', '$0.07 a ride - cheaper than running my rice cooker.', '1回$0.07、うちの炊飯器の電気代より安い。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'secretary', text: T('市長，期限過咗，叮叮仲未叮得起……', 'Mayor, time is up, and the trams still are not dinging...', '市長、期限が過ぎました。ディンディンはまだ鳴っていません……') },
    ]),
  });

  const CAMPAIGN_CHAPTER_SPECS = Object.freeze({ ch01: CH01, ch02: CH02, ch03: CH03, ch04: CH04, ch07: CH07, ch12: CH12 });

  function isCampaignChapterPlayable(chapterId) {
    return !!CAMPAIGN_CHAPTER_SPECS[chapterId];
  }

  // Star 1's window: CAMPAIGN_DEADLINE_MONTHS, or the chapter's own (a yearly festival needs longer).
  function getCampaignDeadlineMonths(chapterId) {
    const months = CAMPAIGN_CHAPTER_SPECS[chapterId]?.deadlineMonths;
    return Number.isFinite(months) && months > 0 ? Math.floor(months) : CAMPAIGN_DEADLINE_MONTHS;
  }

  // Years kept from the chapter's start, so "hold a festival" means one held since then.
  function cleanYears(raw) {
    const counts = {};
    Object.entries(raw && typeof raw === 'object' ? raw : {}).forEach(([id, value]) => {
      if (/^[a-zA-Z0-9_]{1,40}$/.test(id) && num(value) > 0) counts[id] = Math.floor(num(value));
    });
    return counts;
  }

  function createCampaignRunBase(snapshot) {
    return { festivalHeldYear: cleanYears(snapshot?.festivalHeldYear), festivalNoVenueYear: cleanYears(snapshot?.festivalNoVenueYear) };
  }

  function createCampaignRun(chapterId, monthIndex, snapshot = null) {
    const start = Math.floor(num(monthIndex));
    const spec = CAMPAIGN_CHAPTER_SPECS[chapterId];
    return {
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      chapterId,
      startMonthIndex: start,
      deadlineMonthIndex: start + getCampaignDeadlineMonths(chapterId),
      base: createCampaignRunBase(snapshot),
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
    run.base = createCampaignRunBase(raw.base);
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

  // One star's objectives against the snapshot (and where the run began): each objective's state
  // and progress text.
  function evaluateCampaignStar(spec, starIndex, snapshot, run = null) {
    const star = spec?.stars?.[starIndex];
    if (!star) return { done: false, items: [] };
    const base = run?.base || createCampaignRunBase(null);
    const items = star.objectives.map((objective) => {
      let done = false;
      let progress = '';
      try { done = !!objective.check(snapshot, base); } catch { done = false; }
      try { progress = objective.progress ? String(objective.progress(snapshot, base)) : ''; } catch { progress = ''; }
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
      if (!evaluateCampaignStar(spec, run.stars, snapshot, run).done) break;
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

  // Chapter 01 is always open; each later chapter opens with a star in the playable chapter before
  // it (chapters still to come are stepped over, so 04's star opens 07 while 05 and 06 wait). A
  // chapter already starred stays open when a chapter before it arrives later.
  function isCampaignChapterUnlocked(profile, chapterId) {
    const chapter = CAMPAIGN_CHAPTERS_BY_ID[chapterId];
    if (!chapter) return false;
    if (chapter.number === 1 || num(profile?.chapters?.[chapterId]?.stars) > 0) return true;
    const previous = CAMPAIGN_CHAPTERS.slice(0, chapter.number - 1).reverse().find((entry) => isCampaignChapterPlayable(entry.id));
    return !previous || num(profile?.chapters?.[previous.id]?.stars) > 0;
  }

  // The chapters a first star in `chapterId` opens: the next one (even if still to come) and,
  // past any still to come, the next playable one.
  function getCampaignChaptersUnlockedBy(chapterId) {
    const chapter = CAMPAIGN_CHAPTERS_BY_ID[chapterId];
    if (!chapter) return [];
    const next = CAMPAIGN_CHAPTERS[chapter.number];
    if (!next) return [];
    if (isCampaignChapterPlayable(next.id)) return [next];
    const playable = CAMPAIGN_CHAPTERS.slice(chapter.number).find((entry) => isCampaignChapterPlayable(entry.id));
    return playable ? [next, playable] : [next];
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
    getCampaignDeadlineMonths, getCampaignChaptersUnlockedBy,
    advanceCampaignRun, getCampaignMonthsLeft, createEmptyCampaignProfile, normalizeCampaignProfile,
    getCampaignTutorialStep, advanceCampaignTutorial, acknowledgeCampaignTutorialStep, skipCampaignTutorial,
    recordCampaignStars, isCampaignChapterUnlocked, getCampaignText,
  };
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
