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
    // P3 (chapters 06-18): the council's faces for now, else a glyph, until the campaign's own art
    commerce: { name: T('工商署代表', 'Commerce Bureau', '商工局代表'), portrait: 'UI/officials/councilMember-business.PNG', glyph: '🏢' },
    finance: { name: T('金融署代表', 'Financial Services', '金融局代表'), portrait: 'UI/officials/councilMember-business.PNG', glyph: '💹' },
    culture: { name: T('文化署代表', 'Culture Bureau', '文化局代表'), portrait: 'UI/officials/headOfLeisureAndCulturalService.PNG', glyph: '🎭' },
    environment: { name: T('環境署代表', 'Environment Bureau', '環境局代表'), portrait: 'UI/officials/headOfObservatory.PNG', glyph: '🌿' },
    councillorA: { name: T('議員甲', 'Councillor A', '議員甲'), portrait: 'UI/officials/councilMember-democracyParty.PNG', glyph: '🗳' },
    councillorB: { name: T('議員乙', 'Councillor B', '議員乙'), portrait: 'UI/officials/councilMamber-freedom.PNG', glyph: '🗳' },
    parent: { name: T('家長代表', 'Parents\' Rep', '保護者代表'), glyph: '👪' },
    education: { name: T('教育署代表', 'Education Bureau', '教育局代表'), glyph: '🎓' },
    villager: { name: T('村代表', 'Village Rep', '村の代表'), glyph: '🏮' },
    factory: { name: T('工廠老闆', 'Factory Owner', '工場主'), glyph: '🏭' },
    worker: { name: T('工人代表', 'Workers\' Rep', '労働者代表'), glyph: '👷' },
    reporter: { name: T('記者', 'Reporter', '記者'), glyph: '🎤' },
    stallOwner: { name: T('夜市老闆', 'Night-Market Stallholder', '夜市の店主'), glyph: '🍲' },
    commentator: { name: T('神童標', 'Wonder Boy Biu', '神童標'), glyph: '🐎' },
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
  // 龍舟場地教學 (Norton 2026-11-19: 龍舟既海濱，第一次建造需要特別教學，因為條件比較特殊 - 學第一關
  // 既教學，在右邊): the race's venue, step by step in the objectives panel, ticked off by the race's
  // own course search (festival-dragon-boat.js). The first chapter that asks for the race plays it;
  // the player's profile remembers it after (tutorialId). `look`: a button that shows the promenade,
  // the course on the water, or opens the festival calendar.
  const DRAGON_BOAT_TUTORIAL = Object.freeze([
    { id: 'promenade', speaker: 'engineer', highlight: ['[data-tool-category="parks"]', '[data-tool="promenade"]'],
      text: T('龍舟第一步：起海濱長廊。去左邊「康文署」揀海濱長廊，沿住海岸一格接一格起，最少連續 6 格，中間唔好斷（斜角接駁唔計）。',
        'Dragon Boat, step 1: a promenade. Open Leisure Services on the left, pick Waterfront Promenade and lay it tile by tile along the shore - at least 6 tiles in one piece, edge to edge (a corner touch does not join).',
        'ドラゴンボート ステップ1：遊歩道。左の「康文署」で海浜遊歩道を選び、海岸に沿って1マスずつ、途切れず6マス以上つなげよう（斜めのつながりは不可）。'),
      done: (s) => num(s.dragonBoatRun) >= 6 },
    { id: 'water', speaker: 'engineer', look: 'run', highlight: ['[data-tool-category="parks"]', '[data-tool="promenade"]'],
      text: T('第二步：龍舟要一條直賽道。長廊對出 1 至 5 格內，要有約 14 格長、4 格闊、同海岸平行嘅開放海面。海灣太窄、海岸太彎都唔得：揀一段直啲、出面海闊啲嘅海岸，再起長廊。',
        'Step 2: the race needs a straight course. Within 1 to 5 tiles of the promenade there must be open sea about 14 tiles long and 4 wide, parallel to the shore. A narrow bay or a winding shore will not do: pick a straighter stretch with wide water off it, and build the promenade there.',
        'ステップ2：レースにはまっすぐなコースが必要。遊歩道から1〜5マス以内に、長さ約14マス・幅4マスで海岸と平行な開けた海がいる。狭い湾や入り組んだ海岸は不可。まっすぐで沖の広い海岸に遊歩道を作ろう。'),
      done: (s) => !!s.dragonBoatWater },
    { id: 'clear', speaker: 'transport', look: 'run',
      text: T('第三步：賽道嗰片海要清空。龍舟賽道上唔可以有避風塘、渡輪航線或者貨櫃船航道，附近亦唔可以有橋。',
        'Step 3: keep the course water clear. No typhoon shelter, ferry route or shipping lane on the course, and no bridge near it.',
        'ステップ3：コースの海を空けておく。コース上に避難港・フェリー航路・コンテナ船航路は置けず、近くに橋もだめ。'),
      done: (s) => !!s.dragonBoatCourse },
    { id: 'festival', speaker: 'tourism', look: 'festival',
      text: T('第四步：喺「節慶日曆」確認香城龍舟邀請賽開咗，揀好預算。每年端午（五月）舉行。',
        'Step 4: in the festival calendar, check the Dragon Boat race is on and pick its budget. It is held every year at Tuen Ng (May).',
        'ステップ4：祭りカレンダーでドラゴンボートレースがオンになっているか確かめ、予算を選ぼう。毎年端午（5月）に開催。'),
      done: (s) => !!s.dragonBoatOn },
    { id: 'ready', speaker: 'secretary', look: 'course', ack: true,
      text: T('場地準備好喇！撳「睇賽道」睇吓龍舟會喺邊度扒。端午節一到，比賽就會喺你嘅長廊對出舉行。',
        'The venue is ready! Press "Show the course" to see where the boats will race. Come Tuen Ng, the race runs off your promenade.',
        '会場の準備完了！「コースを見る」でどこで漕ぐか確かめよう。端午になれば、あなたの遊歩道の沖でレースが始まる。') },
  ]);
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
    tutorial: DRAGON_BOAT_TUTORIAL,
    tutorialId: 'dragonBoat',
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
    // (played here only if 西貢 has not taught it: the profile's tutorials)
    tutorial: DRAGON_BOAT_TUTORIAL,
    tutorialId: 'dragonBoat',
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
          // 南港島綫接駁至金鐘方向: a metro line on off the map to 中環 or 灣仔, 金鐘 between them
          // (docs/region-transit-design.md phase 3)
          { id: 'region', label: T('南港島綫接駁金鐘方向（地鐵開出區外往中環或灣仔，有乘客）', 'The South Island line to Admiralty (a metro line off the map to Central or Wan Chai, with riders)', '南港島線を金鐘方面へ（区外の中環・湾仔へ向かう地下鉄に乗客）'),
            check: (s) => num(s.offMap?.metro?.['central-western']) + num(s.offMap?.metro?.['wan-chai']) > 0,
            progress: (s) => `🚇 ${fmt(num(s.offMap?.metro?.['central-western']) + num(s.offMap?.metro?.['wan-chai']))}` },
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
        hint: T('開辦五條有乘客嘅巴士線（三條跨區）、令輕鐵載客，降低擠塞同罪案。跨區：一條線開去區外站（起線時㩒地圖邊出區嘅路，揀元朗、天水圍等），或者車站喺兩個地區牌範圍內。', 'Run five bus routes with riders (three across districts), get the light rail carrying people, and bring down congestion and crime. Across districts: a route to an off-map stop (click a road leaving the map edge while picking stops, and choose Yuen Long, Tin Shui Wai...), or with stops in two district signs\' areas.', '乗客のいるバス路線を5本（うち3本は区をまたぐ）、ライトレールで乗客を運び、渋滞と犯罪を減らそう。区をまたぐ路線：区外の停留所へ向かう路線（停留所選択中にマップの端から出る道路をクリックし、元朗・天水囲などを選ぶ）、または2つの地区標識の範囲に停留所がある路線。') },
    ]),
    stars: Object.freeze([
      {
        title: T('屯門通車', 'Tuen Mun Gets Moving', '屯門、開通'),
        objectives: Object.freeze([
          busRoutesObjective(5),
          { id: 'crossDistrict', label: T('當中 3 條跨區（開去區外站，或者車站喺兩個地區牌範圍）', 'Three of them cross districts (to an off-map stop, or stops in two district signs\' areas)', 'うち3本が区をまたぐ（区外の停留所へ、または2つの地区標識の範囲に停留所）'),
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
          // 跨區公共交通分擔率 (docs/region-transit-design.md §6): the cross-district commuters the
          // lines off the map carried, of all of them
          { id: 'share', label: T('跨區公共交通分擔率達 30%', 'Public transport carries 30% of cross-district commuters', '地区をまたぐ通勤の公共交通分担率30%'),
            check: (s) => num(s.offMapShare) >= 0.3,
            progress: (s) => `${pct(s.offMapShare)} / 30%` },
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

  // ── P3 (chapters 06, 08, 09, 13, 16, 17, 18) ───────────────────────────────
  // docs/campaign-levels-design.md §4C. Every chapter starts from a built town on its district map
  // (UI/campaign/chNN.json; without it a new city), star 1 within 24 months. Numbers the script
  // marks 〔暫定〕 are scaled to what a town can grow to in that time.

  const streakObjective = (months) => ({
    id: 'surplusStreak', label: T(`連續 ${months} 個月財政盈餘`, `A surplus ${months} months running`, `${months}か月連続の黒字`),
    check: (s) => num(s.surplusStreak) >= months, progress: (s) => `${fmt(s.surplusStreak)} / ${months}`,
  });
  // monthly commercial and industrial tax against the chapter's start (base.taxCI)
  const taxGrowth = (s, base) => (num(base?.taxCI) > 0 ? num(s.taxCI) / num(base.taxCI) - 1 : 0);
  const taxGrowthObjective = (share) => ({
    id: 'taxGrowth', label: T(`工商稅收比開局增長 ${Math.round(share * 100)}%`, `Commercial and industrial tax up ${Math.round(share * 100)}% on the start`, `商工税収が開始時より${Math.round(share * 100)}%増`),
    check: (s, base) => num(base?.taxCI) > 0 && taxGrowth(s, base) >= share - 1e-9,
    progress: (s, base) => `${taxGrowth(s, base) >= 0 ? '+' : ''}${Math.round(taxGrowth(s, base) * 100)}% / +${Math.round(share * 100)}%`,
  });
  // the council's major events held since the chapter began (base.monthIndex)
  const majorEventsSince = (s, base) => (Array.isArray(s.majorEvents) ? s.majorEvents.filter((e) => num(e.monthIndex) >= num(base?.monthIndex)).length : 0);
  const majorEventsObjective = (count) => ({
    id: 'majorEvents', label: T(`開章後成功舉辦 ${count} 場盛事`, `${count} major events held since the chapter began`, `章の開始後に大型イベントを${count}回成功`),
    check: (s, base) => majorEventsSince(s, base) >= count, progress: (s, base) => `${fmt(majorEventsSince(s, base))} / ${count}`,
  });
  const servicesObjective = {
    id: 'services', label: T('有警署、消防局、醫院同學校', 'A police station, fire station, hospital and school', '警察署・消防署・病院・学校'),
    check: (s) => ['police_station', 'fire_station', 'hospital'].every((type) => built(s, type)) && (built(s, 'primary_school') || built(s, 'secondary_school')),
    progress: (s) => `${['police_station', 'fire_station', 'hospital'].filter((type) => built(s, type)).length + (built(s, 'primary_school') || built(s, 'secondary_school') ? 1 : 0)} / 4`,
  };
  // 三業均衡: homes, shops and industry each between a fifth and three-fifths of the buildings
  const sectorShares = (s) => {
    const r = num(s.residentialCount); const c = num(s.commercialCount); const i = num(s.industrialCount);
    const total = r + c + i;
    return total > 0 ? [r / total, c / total, i / total] : [0, 0, 0];
  };
  const balancedSectors = (s) => sectorShares(s).every((share) => share >= 0.15 && share <= 0.6);
  // 國際XX中心 (第 16 章): a title held while its real measure holds - not a button
  const CAMPAIGN_INTERNATIONAL_TITLES = Object.freeze([
    { id: 'finance', name: T('國際金融中心', 'International Financial Centre', '国際金融センター'), check: (s) => built(s, 'stock_exchange') && num(s.gradeAOffices) >= 3 },
    { id: 'tourism', name: T('國際旅遊中心', 'International Tourism Hub', '国際観光センター'), check: (s) => num(s.tourismAppeal) >= 75 },
    { id: 'convention', name: T('國際會展中心', 'International Convention Centre', '国際コンベンションセンター'), check: (s) => built(s, 'exhibition_center') && (s.majorEvents || []).length > 0 },
    { id: 'innovation', name: T('國際創科中心', 'International Innovation Hub', '国際イノベーションセンター'), check: (s) => num(s.scienceParkJobs) >= 300 },
    { id: 'culture', name: T('國際文化中心', 'International Cultural Hub', '国際文化センター'), check: (s) => built(s, 'cultural_center') && built(s, 'space_museum') },
    { id: 'shipping', name: T('國際航運中心', 'International Shipping Centre', '国際海運センター'), check: (s) => built(s, 'container_port') },
    { id: 'aviation', name: T('國際航空樞紐', 'International Aviation Hub', '国際航空ハブ'), check: (s) => built(s, 'airport') },
    { id: 'education', name: T('國際教育樞紐', 'International Education Hub', '国際教育ハブ'), check: (s) => built(s, 'university') && num(s.educationHigher) >= 0.4 },
  ]);
  const internationalTitles = (s) => CAMPAIGN_INTERNATIONAL_TITLES.filter((title) => { try { return !!title.check(s); } catch { return false; } });
  const titlesObjective = (count) => ({
    id: 'titles', label: T(`取得 ${count} 個「國際XX中心」稱號（要有實際成效）`, `${count} "International XX Centre" titles, each earned by results`, `「国際XXセンター」の称号を${count}つ（実績が必要）`),
    check: (s) => internationalTitles(s).length >= count,
    progress: (s) => `${internationalTitles(s).length} / ${count}`,
  });

  // CHAPTER 05 黃大仙《有求必應》 (P4, docs/campaign-p4-design.md §2): the estates, 公屋 and 居屋
  // beside private homes (housing-types.js), 黃大仙祠 (the grand temple) with a bus stop or station
  // beside it, and the services the estates lack at the start. On the 九龍城 map's north: 樂富,
  // 黃大仙, 新蒲崗 and 彩虹 under the hills (the map has no 慈雲山).
  const mixedCommunity = (s) => num(s.publicSectorShare) >= 0.3 - 1e-9 && num(s.publicSectorShare) <= 0.7 + 1e-9;
  const templeLinked = (s) => built(s, 'grand_temple') && !!s.templeTransit;
  // 服務覆蓋達標: the share of residential land each service reaches (campaign.js homeCover)
  const HOME_SERVICES = Object.freeze(['police', 'fire', 'health', 'school']);
  const HOME_SERVICE_ICONS = Object.freeze({ police: '🚓', fire: '🚒', health: '🏥', school: '🏫' });
  const CH05 = Object.freeze({
    id: 'ch05',
    startFile: 'UI/campaign/ch05.json',
    deadlineMonths: 24,
    fresh: { cityName: T('黃大仙', 'Wong Tai Sin', '黄大仙'), budget: 120000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'resident', text: T('黃大仙有求必應，咁可唔可以求到條巴士線？', 'Wong Tai Sin answers every prayer - so can I pray for a bus route?', '黄大仙は願いを何でも叶えてくれる。じゃあバス路線もお願いできる？') },
      { speaker: 'secretary', text: T('宗教活動有助提升城市文化及旅遊魅力。', 'Religious life adds to the city\'s culture and its appeal to visitors.', '宗教行事は都市の文化と観光の魅力を高めます。') },
      { speaker: 'treasurer', text: T('但公屋維修同消防都要錢。', 'But public-housing repairs and fire cover both cost money.', 'でも公営住宅の修繕も消防も金がかかる。') },
      { card: T('任務開始：黃大仙《有求必應》', 'Mission start: Wong Tai Sin - "Every Wish Answered"', '任務開始：黄大仙「有求必応」'),
        hint: T('人口達 60,000，公屋同居屋住戶佔三至七成（住宅分區揀「公屋區」或「居屋區」）；起黃大仙祠（大型廟宇），6 格內有巴士站或地鐵站；地鐵同巴士有乘客；警署、消防局、醫院同學校各覆蓋六成住宅，有兩個街市；滿意度 60%，每月收支正數。',
          'Reach 60,000 people with public and HOS housing at 30-70% of residents (zone residential land as Public Housing or HOS Housing); build Wong Tai Sin Temple (the grand temple) with a bus stop or metro station within 6 tiles; riders on the metro and buses; police, fire, hospital and school cover each reaching 60% of the homes, and two markets; happiness of 60% and a monthly surplus.',
          '人口60,000人、公営住宅と居屋の住民を3〜7割に（住宅区で「公営住宅区」か「居屋区」を選ぶ）。黄大仙祠（大型寺院）を建て、6マス以内にバス停か地下鉄駅を。地下鉄とバスに乗客。警察・消防・病院・学校がそれぞれ住宅の6割をカバー、市場2か所。満足度60%、月の収支を黒字に。') },
    ]),
    stars: Object.freeze([
      {
        title: T('萬家燈火', 'Ten Thousand Lit Windows', '万家の灯'),
        objectives: Object.freeze([
          { id: 'mixed', label: T('人口達 60,000，公屋及居屋住戶佔三至七成', '60,000 people, with public and HOS housing at 30-70% of residents', '人口60,000人、公営住宅と居屋の住民が3〜7割'),
            check: (s) => num(s.population) >= 60000 && mixedCommunity(s),
            progress: (s) => `${fmt(s.population)} / 60,000 · ${pct(s.publicSectorShare)}` },
          { id: 'temple', label: T('起黃大仙祠（大型廟宇），6 格內有載客嘅巴士站或地鐵站', 'Wong Tai Sin Temple (the grand temple), with a bus stop or metro station carrying riders within 6 tiles', '黄大仙祠（大型寺院）、6マス以内に乗客のいるバス停か地下鉄駅'),
            check: templeLinked, progress: (s) => `🏮 ${tick(built(s, 'grand_temple'))} · 🚏 ${tick(!!s.templeTransit)}` },
          { id: 'transit', label: T('地鐵同巴士有乘客', 'Riders on the metro and the buses', '地下鉄とバスに乗客'),
            check: (s) => num(s.transit?.metro) > 0 && num(s.transit?.bus) > 0,
            progress: (s) => `🚇 ${fmt(s.transit?.metro)} · 🚌 ${fmt(s.transit?.bus)}` },
          { id: 'services', label: T('警署、消防局、醫院同學校各覆蓋六成住宅，有兩個街市', 'Police, fire, hospital and school cover each reaching 60% of the homes, and two markets', '警察・消防・病院・学校がそれぞれ住宅の6割をカバー、市場2か所'),
            check: (s) => HOME_SERVICES.every((key) => num(s.homeCover?.[key]) >= 0.6 - 1e-9) && num(s.buildings?.public_market) >= 2,
            progress: (s) => `${HOME_SERVICES.map((key) => `${HOME_SERVICE_ICONS[key]} ${pct(s.homeCover?.[key])}`).join(' · ')} · 🛒 ${fmt(s.buildings?.public_market)} / 2` },
          balanceObjective(0.6),
        ]),
      },
      {
        title: T('新春頭炷香', 'The First Incense of the New Year', '新春の一番香'),
        objectives: Object.freeze([
          { id: 'firstIncense', label: T('黃大仙祠開咗之後舉辦一次新春', 'Hold Lunar New Year with Wong Tai Sin Temple standing', '黄大仙祠のある年に旧正月を開催'),
            check: (s, base) => built(s, 'grand_temple') && heldSince(s, base, 'lunarNewYear') > 0,
            progress: (s, base) => `🏮 ${tick(built(s, 'grand_temple'))} · 🧧 ${tick(heldSince(s, base, 'lunarNewYear') > 0)}` },
          { id: 'crowds', label: T('黃大仙祠有消防覆蓋，6 格內有載客嘅巴士站或地鐵站', 'Fire cover on Wong Tai Sin Temple, and a bus stop or station with riders within 6 tiles', '黄大仙祠に消防の守り、6マス以内に乗客のいるバス停か駅'),
            check: (s) => !!s.templeFireCover && templeLinked(s), progress: (s) => `🚒 ${tick(!!s.templeFireCover)} · 🚏 ${tick(templeLinked(s))}` },
          { id: 'estates', label: T('公屋住戶達 25,000 人，失業率低於 7%', '25,000 public-housing residents, and unemployment under 7%', '公営住宅の住民25,000人、失業率7%未満'),
            check: (s) => num(s.publicHousingResidents) >= 25000 && num(s.population) > 0 && num(s.unemploymentRate) < 0.07,
            progress: (s) => `${fmt(s.publicHousingResidents)} / 25,000 · ${pct(s.unemploymentRate)}` },
          { id: 'happiness', label: T('滿意度達 65%', 'Happiness of 65%', '満足度65%'),
            check: (s) => num(s.happiness) >= 0.65, progress: (s) => pct(s.happiness) },
        ]),
      },
      {
        title: T('有求必應', 'Every Wish Answered', '有求必応'),
        objectives: Object.freeze([
          { id: 'bigEstates', label: T('公屋住戶達 40,000 人，公屋及居屋住戶仍佔三至七成', '40,000 public-housing residents, with public and HOS housing still at 30-70%', '公営住宅の住民40,000人、公営住宅と居屋は3〜7割のまま'),
            check: (s) => num(s.publicHousingResidents) >= 40000 && mixedCommunity(s),
            progress: (s) => `${fmt(s.publicHousingResidents)} / 40,000 · ${pct(s.publicSectorShare)}` },
          { id: 'order', label: T('交通擠塞不高於 45%，罪案率低於 30%', 'Congestion at 45% or less and crime under 30%', '渋滞45%以下、犯罪率30%未満'),
            check: (s) => num(s.trafficIndex) <= 0.45 && num(s.crimeRate) < 0.3, progress: (s) => `🚗 ${pct(s.trafficIndex)} · 🚓 ${pct(s.crimeRate)}` },
          { id: 'heritage', label: T('黃大仙祠同至少一間傳統廟宇保留', 'Wong Tai Sin Temple and at least one traditional temple kept', '黄大仙祠と伝統寺院1つ以上を保存'),
            check: (s) => built(s, 'grand_temple') && built(s, 'heritage_temple'),
            progress: (s) => `🏮 ${tick(built(s, 'grand_temple'))} · ⛩ ${tick(built(s, 'heritage_temple'))}` },
          { id: 'content', label: T('滿意度達 75%', 'Happiness of 75%', '満足度75%'),
            check: (s) => num(s.happiness) >= 0.75, progress: (s) => pct(s.happiness) },
          { id: 'reserve', label: T('財政儲備達 $300,000', 'Reserves of $300,000', '財政準備金$300,000'),
            check: (s) => num(s.funds) >= 300000, progress: (s) => `$${fmt(s.funds)} / $300,000` },
        ]),
      },
    ]),
    // 中段事件《黃大仙話，今年條財政籤……》: the temple's first 求籤 - news and mood only, never a
    // prophecy; the year's fortune itself is the newspaper's (annual-fortunes-data.js)
    events: Object.freeze([
      {
        id: 'fortuneStick',
        when: (s) => built(s, 'grand_temple'),
        lines: Object.freeze([
          { speaker: 'anchor', text: T('黃大仙祠落成後首次求籤，解籤師傅話市長抽到嘅係「財政籤」。', 'At the new Wong Tai Sin Temple\'s first fortune-telling, the interpreter says the mayor drew the "budget stick".', '黄大仙祠の完成後初のおみくじ。解説師によると、市長が引いたのは「財政みくじ」。') },
          { speaker: 'resident', text: T('我抽到上上籤，點解仲塞車？', 'I drew the best stick of all - so why am I still stuck in traffic?', '大吉を引いたのに、なんでまだ渋滞してるの？') },
          { speaker: 'treasurer', text: T('籤文唔會計入預算。要盈餘，就要靠政策。', 'Fortune sticks do not go into the budget. A surplus comes from policy.', 'おみくじは予算に計上しません。黒字は政策で出すものです。') },
        ]),
        forum: {
          headline: T('黃大仙話，今年條財政籤……', 'Wong Tai Sin says this year\'s budget stick is...', '黄大仙いわく、今年の財政みくじは……'),
          body: T('黃大仙祠首次求籤，人龍排到地鐵站。解籤檔話財政籤「中平」，市民反應兩極。', 'The temple\'s first fortune-telling drew a queue to the metro station. The stall reads the budget stick as "middling"; residents are split.', '黄大仙祠初のおみくじに地下鉄駅まで行列。財政みくじは「中吉」と解かれ、市民の反応は二分。'),
          comment: T('市長抽唔抽到財政盈餘？', 'Can the mayor draw a budget surplus?', '市長は財政黒字を引き当てられる？'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'secretary', text: T('黃大仙求神拜佛之餘，公共服務都算跟得上。', 'Between the prayers and the incense, Wong Tai Sin\'s public services have kept up.', '黄大仙では神頼みの傍ら、公共サービスもどうにか追いつきました。') },
      { speaker: 'education', text: T('下一站沙田，家長最關心嘅係子女教育，同……放假去唔去馬場。', 'Next stop Sha Tin, where parents care most about their children\'s schooling - and... whether to go racing on their day off.', '次は沙田。保護者の一番の関心は子どもの教育、それと……休みに競馬場へ行くかどうか。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】黃大仙屋邨社區服務全面到位', '[Government News] Wong Tai Sin\'s estates now fully served', '【政府発表】黄大仙の団地、公共サービスが全面整備'),
      body: T('房屋署表示，區內公屋、居屋同私人住宅比例均衡；黃大仙祠交通接駁暢順，警署、消防局、醫院同街市已經投入服務。', 'The Housing Department says the district\'s mix of public, HOS and private homes is balanced; the temple is well linked, and the police and fire stations, hospital and market are all open.', '房屋署によると、区内の公営住宅・居屋・民間住宅のバランスは良好。黄大仙祠への交通も円滑で、警察署・消防署・病院・市場が稼働している。'),
      comments: Object.freeze([
        T('落樓就有街市，返工有地鐵，求籤有巴士。', 'A market downstairs, the metro to work, a bus to the temple.', '下に市場、通勤は地下鉄、お参りはバス。'),
        T('上上籤應驗咗。', 'The best stick came true after all.', '大吉、当たったな。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'resident', text: T('市長，求咗成兩年籤，條巴士線都未嚟……', 'Mayor, two years of prayers and still no bus route...', '市長、2年もお参りしたのに、バス路線はまだ来ない……') },
    ]),
  });

  // CHAPTER 06 沙田《望子成龍》: middle-income families, schools, and the ground-level East Rail.
  // The racecourse has no model yet: the big stadium stands in for it (〔暫代〕, until the art).
  const middleHomes = (s) => {
    const w = s.residentialByWealth || {};
    const total = num(w.L) + num(w.M) + num(w.H) + num(w.UH);
    return total > 0 ? (num(w.M) + num(w.H)) / total : 0;
  };
  const CH06 = Object.freeze({
    id: 'ch06',
    startFile: 'UI/campaign/ch06.json',
    deadlineMonths: 24,
    fresh: { cityName: T('沙田', 'Sha Tin', '沙田'), budget: 120000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'parent', text: T('我哋唔係要豪宅，只係想有學校、有公園、有車出市區。', 'We are not after mansions - just schools, parks and a train into town.', '豪邸なんて要らない。学校と公園と、都心へ出る電車があればいい。') },
      { speaker: 'engineer', text: T('東鐵地面路段可以救交通，但唔係起個站就算。', 'A ground-level East Rail can save the traffic - but a station alone will not.', '東鉄の地上区間なら交通を救える。でも駅をひとつ建てて終わりじゃない。') },
      { speaker: 'secretary', text: T('政府高度重視望子成龍嘅殷切期望。', 'The government takes the people\'s hopes for their children extremely seriously.', '政府は子どもに託す市民の切なる願いを極めて重視しております。') },
      { card: T('任務開始：沙田《望子成龍》', 'Mission start: Sha Tin - "High Hopes for the Children"', '任務開始：沙田「望子成竜」'),
        hint: T('人口達 35,000，大部分係中等收入家庭；中小學、醫院、公園齊備，教育指數達 60%；起地面東鐵（地面站、路軌、列車）載客，巴士接駁。', 'Reach 35,000 people, mostly middle-income families; schools, a hospital and parks, education at 60%; run the ground-level East Rail (surface stations, track, trains) with riders and buses feeding it.', '人口35,000人、多くは中所得の家庭に。小中学校・病院・公園をそろえ教育指数60%。地上の東鉄（地上駅・線路・列車）に乗客を、バスで接続しよう。') },
    ]),
    stars: Object.freeze([
      {
        title: T('學有所成', 'Schooled and Settled', '学びの実り'),
        objectives: Object.freeze([
          { id: 'families', label: T('人口達 35,000，中等及中高收入住宅佔六成或以上', '35,000 people, with middle- and upper-middle-income homes at 60% or more', '人口35,000人、中所得・中高所得の住宅が6割以上'),
            check: (s) => num(s.population) >= 35000 && middleHomes(s) >= 0.6,
            progress: (s) => `${fmt(s.population)} / 35,000 · ${pct(middleHomes(s))}` },
          { id: 'schools', label: T('有小學、中學、醫院同公園，教育指數達 60%', 'Primary and secondary schools, a hospital and a park; education at 60%', '小学校・中学校・病院・公園、教育指数60%'),
            check: (s) => ['primary_school', 'secondary_school', 'hospital'].every((type) => built(s, type)) && (built(s, 'park_small') || built(s, 'park_large')) && num(s.educationBasic) >= 0.6,
            progress: (s) => `${['primary_school', 'secondary_school', 'hospital'].filter((type) => built(s, type)).length + (built(s, 'park_small') || built(s, 'park_large') ? 1 : 0)} / 4 · ${pct(s.educationBasic)}` },
          { id: 'eastRail', label: T('地面東鐵有乘客，巴士接駁（巴士有乘客）', 'The ground-level East Rail carries riders, with buses feeding it', '地上の東鉄に乗客、バスが接続（バスに乗客）'),
            check: (s) => num(s.metroSurfaceRiders) > 0 && num(s.transit?.bus) > 0,
            progress: (s) => `🚆 ${fmt(s.metroSurfaceRiders)} · 🚌 ${fmt(s.transit?.bus)}` },
          balanceObjective(0.6),
        ]),
      },
      {
        title: T('馬照跑，舞照跳', 'The Horses Run, the Dancing Goes On', '競馬は続く、ダンスも続く'),
        objectives: Object.freeze([
          { id: 'racecourse', label: T('興建沙田馬場（暫用大球場代替，待美術）', 'Build the Sha Tin racecourse (the big stadium for now, until its art)', '沙田競馬場を建設（美術待ちの間は大スタジアムで代用）'),
            check: (s) => built(s, 'football_stadium'), progress: (s) => tick(built(s, 'football_stadium')) },
          { id: 'raceDayRail', label: T('地面東鐵每月載客 5,000 人次', 'The ground-level East Rail carries 5,000 riders a month', '地上の東鉄の月間乗客5,000人'),
            check: (s) => num(s.metroSurfaceRiders) >= 5000, progress: (s) => `${fmt(s.metroSurfaceRiders)} / 5,000` },
          busRoutesObjective(4),
          { id: 'happiness', label: T('滿意度達 70%', 'Happiness of 70%', '満足度70%'),
            check: (s) => num(s.happiness) >= 0.7, progress: (s) => pct(s.happiness) },
        ]),
      },
      {
        title: T('望子成龍', 'High Hopes Fulfilled', '望子成竜'),
        objectives: Object.freeze([
          { id: 'university', label: T('有大學，教育指數達 80%', 'A university, and education at 80%', '大学があり、教育指数80%'),
            check: (s) => built(s, 'university') && num(s.educationBasic) >= 0.8,
            progress: (s) => `🎓 ${tick(built(s, 'university'))} · ${pct(s.educationBasic)}` },
          { id: 'rail', label: T('地面東鐵每月載客 10,000 人次', 'The ground-level East Rail carries 10,000 riders a month', '地上の東鉄の月間乗客10,000人'),
            check: (s) => num(s.metroSurfaceRiders) >= 10000, progress: (s) => `${fmt(s.metroSurfaceRiders)} / 10,000` },
          { id: 'jobs', label: T('失業率低於 6%', 'Unemployment under 6%', '失業率6%未満'),
            check: (s) => num(s.population) > 0 && num(s.unemploymentRate) < 0.06, progress: (s) => pct(s.unemploymentRate) },
          { id: 'reserve', label: T('財政儲備達 $200,000', 'Reserves of $200,000', '財政準備金$200,000'),
            check: (s) => num(s.funds) >= 200000, progress: (s) => `$${fmt(s.funds)} / $200,000` },
        ]),
      },
    ]),
    // 中段事件《神童標之賽馬旁述》 (富貴逼人's 董驃 race calls as the flavour; no clip from the film)
    events: Object.freeze([
      {
        id: 'wonderBoyBiu',
        when: (s) => built(s, 'football_stadium'),
        lines: Object.freeze([
          { speaker: 'anchor', text: T('今日開鑼，本台邀請咗著名旁述員「神童標」為大家講馬。', 'Racing is back, and we have the famous commentator "Wonder Boy Biu" to call it for you.', '本日開幕。名実況「神童標」にレースを実況していただきます。') },
          { speaker: 'commentator', text: T('起步！一號領先，二號緊貼，三號……三號都喺度，總之大家都好努力！', 'And they are off! Number one leads, number two close behind, number three... number three is also there, anyway everyone is trying very hard!', 'スタート！1番が先頭、2番がぴったり、3番は……3番もいます、とにかく皆よく頑張っています！') },
          { speaker: 'resident', text: T('屌，又輸個馬鼻位！', 'Argh, lost by a nose again!', 'くそっ、また鼻差で負けた！') },
        ]),
        forum: {
          headline: T('神童標旁述爆紅：「聽落好似乜都講咗，又好似乜都冇講」', 'Wonder Boy Biu\'s commentary goes viral: "He said everything and nothing"', '神童標の実況が話題に「全部言ったようで何も言っていない」'),
          body: T('沙田馬場臨時場地首日開鑼，旁述員風格引起熱議。', 'The first race day at Sha Tin\'s stand-in course, and the commentary has everyone talking.', '沙田の仮設競馬場で初開催、実況のスタイルが話題に。'),
          comment: T('旁述員係咪同我睇緊同一場賽事？', 'Is the commentator watching the same race as me?', '実況の人、俺と同じレースを見てる？'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'education', text: T('沙田嘅下一代終於可以安心返學。', 'Sha Tin\'s next generation can finally go to school in peace.', '沙田の次の世代は、ようやく安心して学校に通えます。') },
      { speaker: 'transport', text: T('但屯門嗰邊……塞車塞到痴線。', 'But over in Tuen Mun... the traffic is driving people mad.', 'ですが屯門のほうは……渋滞で皆おかしくなりそうです。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】沙田新市鎮教育及交通配套全面完成', '[Government News] Sha Tin new town completes its schools and transport', '【政府発表】沙田ニュータウン、教育と交通の整備が完了'),
      body: T('教育署表示，區內學位充足；地面東鐵連接住宅同工作區，巴士接駁運作暢順。', 'The Education Bureau says there are school places for all; the ground-level East Rail links homes and work, with buses feeding it smoothly.', '教育局によると学校の定員は十分。地上の東鉄が住宅と職場を結び、バスの接続も円滑だという。'),
      comments: Object.freeze([
        T('學位夠，補習社都夠。', 'Enough school places - and enough tutoring centres.', '学校の定員も足りたし、塾も足りている。'),
        T('東鐵終於唔使企成程。', 'Finally a seat on the East Rail.', 'やっと東鉄で座れる。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'parent', text: T('市長，期限過咗，我個仔仲未有學校讀……', 'Mayor, time is up, and my son still has no school place...', '市長、期限が過ぎました。うちの子はまだ通う学校がありません……') },
    ]),
  });

  // CHAPTER 08 元朗《魚米之鄉》: estates and villages side by side, the light rail meeting the
  // 屯馬綫, and the wetland kept. The wetland park has no model yet: the flagship park stands in.
  const villagesKept = (s, base) => (num(base?.villageHouses) > 0 ? num(s.villageHouses) / num(base.villageHouses) : 1);
  const CH08 = Object.freeze({
    id: 'ch08',
    startFile: 'UI/campaign/ch08.json',
    deadlineMonths: 24,
    fresh: { cityName: T('元朗', 'Yuen Long', '元朗'), budget: 120000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'villager', text: T('呢度有圍村、有祠堂、有農田，唔係淨係起多幾幢樓。', 'There are walled villages, ancestral halls and farmland here - it is not just about more towers.', 'ここには囲村も祠堂も田んぼもある。ビルを増やせばいいってもんじゃない。') },
      { speaker: 'secretary', text: T('但人口又要增長，商業又要有，政府有KPI㗎。', 'But the population must grow and business must come - the government has KPIs.', 'でも人口も増やさないと、商業も要る。政府にはKPIがあるんです。') },
      { speaker: 'environment', text: T('濕地唔會因為KPI超標就識得搬屋。', 'A wetland does not move house because a KPI was beaten.', '湿地はKPIを超えたからといって引っ越してはくれない。') },
      { card: T('任務開始：元朗《魚米之鄉》', 'Mission start: Yuen Long - "Land of Fish and Rice"', '任務開始：元朗「魚米の郷」'),
        hint: T('人口達 45,000；輕鐵同地鐵（屯馬綫）要有一個轉車站（兩個站相距 3 格內，兩條綫都有乘客）；保留八成村屋同祠堂；開巴士線、行綠化公園政策，污染低於 40%。', 'Reach 45,000 people; the light rail and the metro (Tuen Ma line) need an interchange (stations within 3 tiles, both lines with riders); keep 80% of the village houses and the ancestral hall; run buses, pass the Green Parks policy, pollution under 40%.', '人口45,000人。ライトレールと地下鉄（屯馬線）の乗換駅を1つ（3マス以内の駅、両線に乗客）。村屋の8割と祠堂を残し、バスを走らせ、緑化公園政策で汚染40%未満に。') },
    ]),
    stars: Object.freeze([
      {
        title: T('新舊並存', 'Old and New Together', '新旧共存'),
        objectives: Object.freeze([
          { id: 'population', label: T('人口達 45,000，失業率低於 10%', 'Population of 45,000, unemployment under 10%', '人口45,000人、失業率10%未満'),
            check: (s) => num(s.population) >= 45000 && num(s.unemploymentRate) < 0.1,
            progress: (s) => `${fmt(s.population)} / 45,000 · ${pct(s.unemploymentRate)}` },
          { id: 'interchange', label: T('輕鐵—屯馬綫轉車站（兩站相距 3 格內，兩綫都有乘客）', 'A light rail - Tuen Ma line interchange (stations within 3 tiles, both lines with riders)', 'ライトレール・屯馬線の乗換駅（3マス以内、両線に乗客）'),
            check: (s) => num(s.lightRailMetroInterchanges) >= 1, progress: (s) => `${fmt(s.lightRailMetroInterchanges)} / 1` },
          { id: 'villages', label: T('保留八成村屋，有祠堂（傳統廟宇）', 'Keep 80% of the village houses, and an ancestral hall (a heritage temple)', '村屋の8割を残し、祠堂（伝統寺院）あり'),
            check: (s, base) => villagesKept(s, base) >= 0.8 && built(s, 'heritage_temple'),
            progress: (s, base) => `${pct(Math.min(1, villagesKept(s, base)))} · ⛩ ${tick(built(s, 'heritage_temple'))}` },
          { id: 'wetland', label: T('啟動濕地保育：通過綠化公園政策，污染低於 40%', 'Protect the wetland: the Green Parks policy, and pollution under 40%', '湿地保全：緑化公園政策を可決し、汚染40%未満'),
            check: (s) => policy(s, 'greenParks') && num(s.pollution) < 40,
            progress: (s) => `📜 ${tick(policy(s, 'greenParks'))} · ${fmt(s.pollution)}` },
          busRoutesObjective(3),
          balanceObjective(0.55),
        ]),
      },
      {
        title: T('圍村做節', 'Festival in the Walled Village', '囲村の祭り'),
        objectives: Object.freeze([
          { id: 'festival', label: T('開章後舉辦新春節慶（盆菜、點燈、舞獅）', 'Hold the Lunar New Year festival since the chapter began (poon choi, lanterns, lion dance)', '章の開始後に旧正月の祭り（盆菜・点灯・獅子舞）を開催'),
            check: (s, base) => heldSince(s, base, 'lunarNewYear') > 0, progress: (s, base) => tick(heldSince(s, base, 'lunarNewYear') > 0) },
          { id: 'wetlandPark', label: T('興建濕地公園（暫用旗艦公園代替，待美術）', 'Build the wetland park (a flagship park for now, until its art)', '湿地公園を建設（美術待ちの間は旗艦公園で代用）'),
            check: (s) => built(s, 'park_flagship'), progress: (s) => tick(built(s, 'park_flagship')) },
          { id: 'tourism', label: T('旅遊吸引力達 65', 'Tourism appeal of 65', '観光魅力度65'),
            check: (s) => num(s.tourismAppeal) >= 65, progress: (s) => `${fmt(s.tourismAppeal)} / 65` },
        ]),
      },
      {
        title: T('魚米之鄉', 'Land of Fish and Rice', '魚米の郷'),
        objectives: Object.freeze([
          { id: 'rail', label: T('每月載客：輕鐵 5,000、地鐵 5,000', 'Riders a month: light rail 5,000, metro 5,000', '月間乗客：ライトレール5,000・地下鉄5,000'),
            check: (s) => num(s.transit?.lightRail) >= 5000 && num(s.transit?.metro) >= 5000,
            progress: (s) => `🚈 ${fmt(s.transit?.lightRail)} · 🚇 ${fmt(s.transit?.metro)}` },
          { id: 'villages', label: T('保留八成村屋', 'Keep 80% of the village houses', '村屋の8割を残す'),
            check: (s, base) => villagesKept(s, base) >= 0.8, progress: (s, base) => pct(Math.min(1, villagesKept(s, base))) },
          { id: 'environment', label: T('污染低於 30%，滿意度達 70%', 'Pollution under 30%, happiness of 70%', '汚染30%未満、満足度70%'),
            check: (s) => num(s.pollution) < 30 && num(s.happiness) >= 0.7, progress: (s) => `${fmt(s.pollution)} · ${pct(s.happiness)}` },
          { id: 'tourism', label: T('旅遊吸引力達 75', 'Tourism appeal of 75', '観光魅力度75'),
            check: (s) => num(s.tourismAppeal) >= 75, progress: (s) => `${fmt(s.tourismAppeal)} / 75` },
        ]),
      },
    ]),
    // 中段事件《盆菜團圓，全村出動》
    events: Object.freeze([
      {
        id: 'poonChoi',
        when: (s, base) => heldSince(s, base, 'lunarNewYear') > 0 && built(s, 'heritage_temple'),
        lines: Object.freeze([
          { speaker: 'anchor', text: T('元朗圍村今日舉行大盆菜，全村出動，村路變得熱鬧非常。', 'The walled village holds its great poon choi feast today - the whole village is out, and the lanes are packed.', '元朗の囲村では今日、大盆菜の宴。村中総出で、村の道は大にぎわいです。') },
          { speaker: 'transport', text: T('巴士行車時間大增，市長可以加開特別班次。', 'Bus journey times are way up - the Mayor can add special services.', 'バスの所要時間が大幅に増えています。市長、臨時便を増発できます。') },
          { speaker: 'villager', text: T('食到飽，返程就迫到扁。', 'We ate our fill - and got squashed flat on the way home.', '腹いっぱい食べて、帰りはぎゅうぎゅう詰め。') },
        ]),
        forum: {
          headline: T('魚米之鄉起咗好多樓，魚喺邊、米喺邊？', 'The land of fish and rice has lots of towers - where are the fish and rice?', '魚米の郷にビルがたくさん、魚と米はどこ？'),
          body: T('圍村盆菜宴吸引大批市民，輕鐵同巴士全線爆滿。', 'The poon choi feast draws crowds; the light rail and the buses are full.', '囲村の盆菜宴に大勢の市民、ライトレールもバスも満員に。'),
          comment: T('圍村盆菜食到飽，返程輕鐵迫到扁。', 'Poon choi to bursting, then a squashed ride home on the light rail.', '盆菜で満腹、帰りのライトレールでぺちゃんこ。'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'environment', text: T('元朗有新屋邨，亦仲見到稻田同水鳥。', 'Yuen Long has new estates - and you can still see paddy fields and water birds.', '元朗には新しい団地があり、田んぼも水鳥もまだ見られます。') },
      { speaker: 'treasurer', text: T('下一區荃灣，考嘅係百業興旺——稅收終於有希望。', 'Next is Tsuen Wan, where every trade has to thrive - finally some hope for taxes.', '次は荃湾、試されるのは百業繁栄。ようやく税収に希望が出てきた。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】元朗輕鐵—屯馬綫轉乘樞紐啟用', '[Government News] Yuen Long light rail - Tuen Ma line interchange opens', '【政府発表】元朗のライトレール・屯馬線乗換駅が開業'),
      body: T('當局表示，圍村地景及濕地得到保留，新舊社區並存。', 'The authorities say the villages and the wetland have been kept, old and new side by side.', '当局によると、囲村の景観と湿地は保たれ、新旧の地域が共存しているという。'),
      comments: Object.freeze([
        T('轉車終於唔使行十分鐘。', 'Changing trains no longer takes a ten-minute walk.', '乗り換えにもう10分歩かなくていい。'),
        T('水鳥話佢哋都有份投票。', 'The water birds say they voted too.', '水鳥も投票したと言っている。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'villager', text: T('市長，期限過咗，起樓起到祖祠門口都未搞掂……', 'Mayor, time is up - the towers reached the ancestral hall\'s door and still nothing is done...', '市長、期限が過ぎました。ビルが祠堂の門前まで来て、まだ片付いていません……') },
    ]),
  });

  // CHAPTER 09 荃灣《百業興旺》: homes, shops and factories in balance; the 荃灣綫, the buses, and the
  // 荃灣—中環 ferry off the map (docs/region-transit-design.md phase 2).
  const ferryToCentral = (s) => num(s.offMap?.ferry?.['central-western']);
  const CH09 = Object.freeze({
    id: 'ch09',
    startFile: 'UI/campaign/ch09.json',
    deadlineMonths: 24,
    fresh: { cityName: T('荃灣', 'Tsuen Wan', '荃湾'), budget: 120000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'commerce', text: T('荃灣係百業興旺嘅好地方！', 'Tsuen Wan is a fine place for every trade to thrive!', '荃湾はあらゆる商売が栄える良い土地です！') },
      { speaker: 'factory', text: T('你開咗三間商場，咁我間廠仲有冇工人？', 'You opened three malls - so who is left to work in my factory?', 'モールを3つも開いたら、うちの工場の働き手はどうなる？') },
      { speaker: 'resident', text: T('成條街都係商場，返工都要出九龍。', 'The whole street is malls, and I still have to go to Kowloon for work.', '通りじゅうモールなのに、仕事は九龍まで行かないとない。') },
      { card: T('任務開始：荃灣《百業興旺》', 'Mission start: Tsuen Wan - "All Trades Thriving"', '任務開始：荃湾「百業繁栄」'),
        hint: T('住宅、商業、工業各佔一成半至六成；人口達 50,000；荃灣綫同巴士有乘客；復辦荃灣—中環渡輪（先起碼頭，再用渡輪航線工具撳碼頭同南邊地圖邊嘅海面），每月 500 人次；收支正數，公共服務齊備。', 'Homes, shops and industry each 15% to 60% of the buildings; 50,000 people; the Tsuen Wan line and the buses with riders; bring back the Tsuen Wan - Central ferry (a pier, then the ferry route tool on the pier and the sea at the south map edge), 500 riders a month; a surplus and the public services.', '住宅・商業・工業がそれぞれ15〜60%、人口50,000人。荃湾線とバスに乗客。荃湾〜中環フェリーを復活（埠頭を建て、航路ツールで埠頭と南のマップ端の海をクリック）、月500人。黒字で公共サービスも。') },
    ]),
    stars: Object.freeze([
      {
        title: T('百業均衡', 'Every Trade in Balance', '百業の均衡'),
        objectives: Object.freeze([
          { id: 'sectors', label: T('住宅、商業、工業各佔一成半至六成，失業率低於 10%', 'Homes, shops and industry each 15-60% of the buildings; unemployment under 10%', '住宅・商業・工業がそれぞれ15〜60%、失業率10%未満'),
            check: (s) => balancedSectors(s) && num(s.unemploymentRate) < 0.1,
            progress: (s) => `${sectorShares(s).map((share) => Math.round(share * 100)).join(' / ')}% · ${pct(s.unemploymentRate)}` },
          { id: 'population', label: T('人口達 50,000', 'Population of 50,000', '人口50,000人'),
            check: (s) => num(s.population) >= 50000, progress: (s) => `${fmt(s.population)} / 50,000` },
          { id: 'railBus', label: T('荃灣綫（地鐵）同巴士都有乘客', 'The Tsuen Wan line (metro) and the buses both carry riders', '荃湾線（地下鉄）とバスの両方に乗客'),
            check: (s) => num(s.transit?.metro) > 0 && num(s.transit?.bus) > 0, progress: (s) => `🚇 ${fmt(s.transit?.metro)} · 🚌 ${fmt(s.transit?.bus)}` },
          { id: 'ferry', label: T('荃灣—中環渡輪（區外航線）每月 500 人次', 'The Tsuen Wan - Central ferry (off the map) carries 500 riders a month', '荃湾〜中環フェリー（区外航路）の月間乗客500人'),
            check: (s) => ferryToCentral(s) >= 500, progress: (s) => `⛴ ${fmt(ferryToCentral(s))} / 500` },
          servicesObjective,
          { id: 'balance', label: T('政府每月收支正數', 'The government runs a monthly surplus', '政府の月収支が黒字'),
            check: (s) => num(s.monthlyNet) > 0, progress: (s) => money(s.monthlyNet) },
        ]),
      },
      {
        title: T('工業轉型', 'Industry Reinvented', '工業の転換'),
        objectives: Object.freeze([
          { id: 'revitalise', label: T('通過《工業大廈活化條例》，保留七成工業', 'The Industrial Building Revitalisation policy, keeping 70% of industry', '工業ビル活性化政策を可決し、工業の7割を維持'),
            check: (s, base) => policy(s, 'industrialBuildingRevitalization') && num(s.industrialCount) >= 0.7 * num(base?.industrialCount),
            progress: (s, base) => `📜 ${tick(policy(s, 'industrialBuildingRevitalization'))} · I ${fmt(s.industrialCount)} / ${fmt(Math.ceil(0.7 * num(base?.industrialCount)))}` },
          { id: 'sciencePark', label: T('有科學園，職位達 300', 'A Science Park with 300 jobs', 'サイエンスパークがあり雇用300人'),
            check: (s) => built(s, 'science_park') && num(s.scienceParkJobs) >= 300, progress: (s) => `${fmt(s.scienceParkJobs)} / 300` },
          taxGrowthObjective(0.2),
        ]),
      },
      {
        title: T('百業興旺', 'Every Trade Thriving', '百業繁栄'),
        objectives: Object.freeze([
          { id: 'sectors', label: T('三業均衡', 'Homes, shops and industry in balance', '三業の均衡'),
            check: (s) => balancedSectors(s), progress: (s) => `${sectorShares(s).map((share) => Math.round(share * 100)).join(' / ')}%` },
          { id: 'share', label: T('跨區公共交通分擔率達 40%（船、鐵、巴士）', 'Public transport carries 40% of cross-district commuters (ships, rail, buses)', '地区をまたぐ通勤の公共交通分担率40%（船・鉄道・バス）'),
            check: (s) => num(s.offMapShare) >= 0.4, progress: (s) => `${pct(s.offMapShare)} / 40%` },
          { id: 'reserve', label: T('財政儲備達 $200,000，滿意度達 70%', 'Reserves of $200,000, happiness of 70%', '財政準備金$200,000、満足度70%'),
            check: (s) => num(s.funds) >= 200000 && num(s.happiness) >= 0.7, progress: (s) => `$${fmt(s.funds)} · ${pct(s.happiness)}` },
        ]),
      },
    ]),
    // 中段事件《曾Sir又唔記得咗》 (逃學威龍 as the memory; staff safety taken seriously, no lab details)
    events: Object.freeze([
      {
        id: 'mrTsangForgot',
        when: (s) => built(s, 'science_park'),
        lines: Object.freeze([
          { speaker: 'anchor', text: T('本台消息：科學園一間實驗室發生意外，一名姓曾嘅導師疑因唔記得安全步驟引發事故，幸無人受傷。', 'News just in: an accident at a Science Park lab, apparently because a tutor named Tsang forgot a safety step. No one was hurt.', '速報です。サイエンスパークの実験室で事故。曾という講師が安全手順を忘れたためとみられ、けが人はいませんでした。') },
          { speaker: 'engineer', text: T('實驗室安全唔係講笑：要停工整改、加強安全教育。', 'Lab safety is no joke: stop work, put it right, train everyone properly.', '実験室の安全は冗談じゃない。作業を止めて是正し、安全教育を強化すべきだ。') },
          { speaker: 'treasurer', text: T('停工整改短期少啲產值；只做最低限度復修就慳錢，但風險仲喺度。', 'A stop to fix it costs output now; patching the minimum saves money, but the risk stays.', '是正のための操業停止は目先の生産を減らす。最低限の修理なら安上がりだが、リスクは残る。') },
          { card: T('曾Sir又唔記得咗', 'Mr Tsang Forgot Again', '曾先生、また忘れた'),
            hint: T('實驗室要有記性：科學園附近要有消防局；之後再有意外，代價會更大。', 'A lab needs a memory: keep a fire station near the Science Park - the next accident will cost more.', '実験室には記憶力が要る。サイエンスパークの近くに消防署を。次の事故はもっと高くつく。') },
        ]),
        forum: {
          headline: T('曾Sir，又話做實驗最緊要有記性？', 'Mr Tsang - didn\'t you say the key to experiments is a good memory?', '曾先生、実験で一番大事なのは記憶力じゃなかった？'),
          body: T('科學園實驗室意外，當局表示會檢討安全程序。', 'After the Science Park lab accident, the authorities say they will review safety procedures.', 'サイエンスパークの実験室事故を受け、当局は安全手順を見直すとしている。'),
          comment: T('攞你命3000係咪真係攞咗間實驗室？', 'Did the Lo Nei Meng 3000 finally take out a whole lab?', 'ローネイメン3000が本当に実験室ごと持っていった？'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'treasurer', text: T('荃灣終於唔係靠單一產業支撐。', 'Tsuen Wan no longer leans on a single trade.', '荃湾はもう一つの産業だけに頼っていない。') },
      { speaker: 'secretary', text: T('下一站飛上天——離島國際機場計劃啟動。', 'Next stop, the sky - the Islands airport plan begins.', '次は空へ。離島の国際空港計画が始動します。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】荃灣—中環渡輪復航，三業均衡發展', '[Government News] The Tsuen Wan - Central ferry is back, and every trade in balance', '【政府発表】荃湾〜中環フェリー復活、三業均衡の発展'),
      body: T('工商署表示，荃灣住宅、商業、工業比例合理，渡輪、地鐵同巴士接駁完善。', 'The Commerce Bureau says Tsuen Wan\'s homes, shops and industry are in sound proportion, with the ferry, metro and buses well linked.', '商工局によると、荃湾の住宅・商業・工業の比率は適正で、フェリー・地下鉄・バスの接続も整った。'),
      comments: Object.freeze([
        T('搭渡輪返中環，海風當冷氣。', 'Taking the ferry to Central - the sea breeze is my air-con.', 'フェリーで中環へ。海風がエアコン代わり。'),
        T('間廠仲喺度，商場都仲喺度，好。', 'The factory is still here, the malls are still here - good.', '工場もまだある、モールもある。いいね。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'factory', text: T('市長，期限過咗，成條街都係商場，我間廠都執埋……', 'Mayor, time is up - the street is all malls and my factory has shut too...', '市長、期限が過ぎました。通りはモールだらけで、うちの工場も閉じました……') },
    ]),
  });

  // CHAPTER 13 觀塘《觀塘老母》: the old factories reinvented, the elevated 觀塘綫, tax growth.
  const CH13 = Object.freeze({
    id: 'ch13',
    startFile: 'UI/campaign/ch13.json',
    deadlineMonths: 24,
    fresh: { cityName: T('觀塘', 'Kwun Tong', '観塘'), budget: 150000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'factory', text: T('以前廠房做貨，依家一半租咗做辦公室，另一半仲等緊人租。', 'The factory floors used to make goods; now half are offices and the other half wait for tenants.', '昔は工場で物を作っていた。今は半分がオフィス、残り半分は借り手待ちだ。') },
      { speaker: 'transport', text: T('九龍東交通問題屬於區域性、結構性、常態性……', 'Kowloon East\'s traffic problem is regional, structural and ongoing...', '九龍東の交通問題は地域的・構造的・恒常的なもので……') },
      { speaker: 'resident', text: T('即係幾時有得郁呀？', 'Meaning when does anything move?', 'で、いつになったら動くんだ？') },
      { speaker: 'secretary', text: T('本區發展計劃名稱已經批核：《觀塘老母》。', 'The district plan\'s name has been approved: "Kwun Tong, Seriously".', '本地区の開発計画名は承認済みです：「観塘老母」。') },
      { speaker: 'treasurer', text: T('個名夠響，但我想睇稅收升幾多。', 'Catchy name - but I want to see how far the taxes rise.', '名前は威勢がいいが、税収がどれだけ上がるか見せてほしい。') },
      { card: T('任務開始：觀塘《觀塘老母》', 'Mission start: Kwun Tong - "Kwun Tong, Seriously"', '任務開始：観塘「観塘老母」'),
        hint: T('人口達 80,000；高架地鐵（觀塘綫）有乘客；通過《工業大廈活化條例》但保留六成工業；海濱長廊連續 15 格；工商稅收比開局多兩成；連續 3 個月盈餘，擠塞不高於 50%。', 'Reach 80,000 people; the elevated metro (Kwun Tong line) with riders; the Industrial Building Revitalisation policy while keeping 60% of industry; a promenade of 15 tiles; commercial and industrial tax 20% above the start; three months of surplus, congestion at 50% or less.', '人口80,000人。高架の地下鉄（観塘線）に乗客。工業ビル活性化政策を可決しつつ工業の6割を維持。遊歩道15マス。商工税収を開始時より2割増、3か月連続黒字、渋滞50%以下。') },
    ]),
    stars: Object.freeze([
      {
        title: T('工業轉型大作戰', 'The Great Industrial Makeover', '工業転換大作戦'),
        objectives: Object.freeze([
          { id: 'population', label: T('人口達 80,000', 'Population of 80,000', '人口80,000人'),
            check: (s) => num(s.population) >= 80000, progress: (s) => `${fmt(s.population)} / 80,000` },
          { id: 'kwunTongLine', label: T('高架觀塘綫有乘客，巴士接駁', 'The elevated Kwun Tong line carries riders, with buses feeding it', '高架の観塘線に乗客、バスが接続'),
            check: (s) => num(s.metroElevatedRiders) > 0 && num(s.transit?.bus) > 0, progress: (s) => `🚇 ${fmt(s.metroElevatedRiders)} · 🚌 ${fmt(s.transit?.bus)}` },
          { id: 'revitalise', label: T('通過《工業大廈活化條例》，保留六成工業', 'The Industrial Building Revitalisation policy, keeping 60% of industry', '工業ビル活性化政策を可決し、工業の6割を維持'),
            check: (s, base) => policy(s, 'industrialBuildingRevitalization') && num(s.industrialCount) >= 0.6 * num(base?.industrialCount),
            progress: (s, base) => `📜 ${tick(policy(s, 'industrialBuildingRevitalization'))} · I ${fmt(s.industrialCount)} / ${fmt(Math.ceil(0.6 * num(base?.industrialCount)))}` },
          { id: 'waterfront', label: T('觀塘海濱長廊連續 15 格', 'A Kwun Tong promenade of 15 tiles in one piece', '観塘の遊歩道を15マス連続'),
            check: (s) => num(s.promenadeLongest) >= 15, progress: (s) => `${fmt(s.promenadeLongest)} / 15` },
          taxGrowthObjective(0.2),
          streakObjective(3),
          { id: 'traffic', label: T('交通擠塞指數不高於 50%', 'Traffic congestion at 50% or less', '交通渋滞指数50%以下'),
            check: (s) => num(s.trafficIndex) <= 0.5, progress: (s) => pct(s.trafficIndex) },
        ]),
      },
      {
        title: T('九龍東新核心', 'The New Heart of Kowloon East', '九龍東の新しい中心'),
        objectives: Object.freeze([
          taxGrowthObjective(0.35),
          { id: 'line', label: T('高架觀塘綫每月載客 10,000 人次', 'The elevated Kwun Tong line carries 10,000 riders a month', '高架の観塘線の月間乗客10,000人'),
            check: (s) => num(s.metroElevatedRiders) >= 10000, progress: (s) => `${fmt(s.metroElevatedRiders)} / 10,000` },
          { id: 'happiness', label: T('滿意度達 65%', 'Happiness of 65%', '満足度65%'),
            check: (s) => num(s.happiness) >= 0.65, progress: (s) => pct(s.happiness) },
        ]),
      },
      {
        title: T('百廠轉型，萬家安居', 'A Hundred Factories Reinvented, Ten Thousand Homes', '百の工場が転換し、万の家が安らぐ'),
        objectives: Object.freeze([
          taxGrowthObjective(0.5),
          { id: 'industry', label: T('保留六成工業，失業率低於 5%', 'Keep 60% of industry; unemployment under 5%', '工業の6割を維持、失業率5%未満'),
            check: (s, base) => num(s.industrialCount) >= 0.6 * num(base?.industrialCount) && num(s.unemploymentRate) < 0.05,
            progress: (s, base) => `I ${fmt(s.industrialCount)} / ${fmt(Math.ceil(0.6 * num(base?.industrialCount)))} · ${pct(s.unemploymentRate)}` },
          { id: 'reserve', label: T('財政儲備達 $300,000，滿意度達 70%', 'Reserves of $300,000, happiness of 70%', '財政準備金$300,000、満足度70%'),
            check: (s) => num(s.funds) >= 300000 && num(s.happiness) >= 0.7, progress: (s) => `$${fmt(s.funds)} · ${pct(s.happiness)}` },
        ]),
      },
    ]),
    // 中段主事件《改建工廈，改到無地方開工》
    events: Object.freeze([
      {
        id: 'nowhereToWork',
        when: (s) => policy(s, 'industrialBuildingRevitalization'),
        lines: Object.freeze([
          { speaker: 'worker', text: T('新辦公室好靚，但我間廠搬去邊？', 'The new offices are lovely - but where does my factory go?', '新しいオフィスは立派だ。でも俺の工場はどこへ行けばいい？') },
          { speaker: 'commerce', text: T('九龍東應該全面升級國際甲級商廈群。', 'Kowloon East should become a cluster of grade-A international offices.', '九龍東は国際的なAクラスオフィス街へ全面的に格上げすべきです。') },
          { speaker: 'treasurer', text: T('只做辦公室，租金未必永遠升；只做工廠，稅收亦未必追到。', 'Offices alone, the rents may not rise for ever; factories alone, the taxes may not keep up.', 'オフィスだけでは家賃が上がり続けるとは限らない。工場だけでは税収が追いつかない。') },
          { card: T('改建工廈，改到無地方開工', 'Converted Until There Is Nowhere Left to Work', '改装しすぎて働く場所がない'),
            hint: T('保留生產區、逐步活化，轉型平穩；快速重建商業區，短期收入高但工人冇工開、交通更塞。兩條路都可以過關，只要保留必要工業。', 'Keep a production area and convert step by step for a steady change; rebuild fast as offices for more money now, but workers lose jobs and traffic worsens. Either way passes, as long as the industry that matters stays.', '生産区を残して段階的に転換すれば穏やか。急いで商業区に建て替えれば目先の収入は多いが、失業と渋滞が増える。必要な工業を残せばどちらでも合格。') },
        ]),
        forum: {
          headline: T('【觀塘】市長視察新高架地鐵：「終於唔使喺觀塘道塞到觀塘老母」', '[Kwun Tong] The Mayor inspects the new elevated line: "No more being stuck on Kwun Tong Road forever"', '【観塘】市長が新高架線を視察「もう観塘道で延々と渋滞しなくて済む」'),
          body: T('工廈活化計劃展開，工人代表關注就業。', 'The factory conversion plan is under way; workers worry about their jobs.', '工業ビル活性化計画が始動、労働者側は雇用を懸念。'),
          comment: T('你先睇清楚，列車有冇去到觀塘站。', 'Check first whether the train actually reaches Kwun Tong station.', 'まず列車が本当に観塘駅まで行くか確かめて。'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'secretary', text: T('九龍東有新工、有新樓、有鐵路！', 'Kowloon East has new jobs, new buildings and a railway!', '九龍東に新しい仕事、新しいビル、そして鉄道が！') },
      { speaker: 'engineer', text: T('隔籬九龍城更難：要整返一座消失咗嘅城，仲要令遊客入得去、電影拍得到。', 'Kowloon City next door is harder: rebuild a vanished walled city that tourists can enter and films can shoot.', '隣の九龍城はもっと難しい。消えた城を再建し、観光客が入れて映画も撮れるようにしないと。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】觀塘工商稅收大幅增長', '[Government News] Kwun Tong business taxes rise sharply', '【政府発表】観塘の商工税収が大幅増'),
      body: T('財政官表示，工廈活化同高架鐵路帶動九龍東轉型，同時保留生產就業。', 'The Treasurer says the conversions and the elevated railway are changing Kowloon East while keeping production jobs.', '財政官によると、工業ビル活性化と高架鉄道が九龍東の転換を後押しし、生産部門の雇用も維持された。'),
      comments: Object.freeze([
        T('條高架鐵真係觀塘最偉大嘅發明。', 'That elevated railway is Kwun Tong\'s greatest invention.', 'あの高架鉄道は観塘最大の発明だ。'),
        T('升級咗做國際商業核心，我樓下茶餐廳升埋價。', 'Upgraded to an international business core - and my cha chaan teng downstairs upgraded its prices.', '国際ビジネスの中心に格上げされて、下の茶餐廳も値上げした。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'resident', text: T('市長，期限過咗，觀塘道仲係塞到觀塘老母……', 'Mayor, time is up, and Kwun Tong Road is still jammed solid...', '市長、期限が過ぎました。観塘道はまだ渋滞したままです……') },
    ]),
  });

  // CHAPTER 16 灣仔《國際XX中心》: the exhibition centre, the major events, titles earned by
  // results, the market and the government's investments - and the street that has to cross.
  // 金紫荊廣場 waits for its art.
  const CH16 = Object.freeze({
    id: 'ch16',
    startFile: 'UI/campaign/ch16.json',
    deadlineMonths: 24,
    fresh: { cityName: T('灣仔', 'Wan Chai', '湾仔'), budget: 200000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'secretary', text: T('市長，政府要打造國際金融中心、國際旅遊中心、國際創科中心、國際會展中心、國際文化中心……', 'Mayor, the government wants an international financial centre, tourism hub, innovation hub, convention centre, cultural hub...', '市長、政府は国際金融センター、国際観光センター、国際イノベーションセンター、国際コンベンションセンター、国際文化センターを……') },
      { speaker: 'mayor', text: T('咁香城本身係乜中心？', 'So what centre is Heung Shing itself?', 'じゃあ香城そのものは何のセンターなんだ？') },
      { speaker: 'secretary', text: T('國際中心嘅中心。', 'The centre of international centres.', '国際センターのセンターです。') },
      { speaker: 'treasurer', text: T('你哋搞中心之前，先話我知總預算幾多。', 'Before you build any centres, tell me the total budget.', 'センターを作る前に、総予算がいくらか教えてくれ。') },
      { speaker: 'resident', text: T('我只係想過條馬路咋。', 'I just want to cross the road.', '俺はただ道を渡りたいだけなんだ。') },
      { card: T('任務開始：灣仔《國際XX中心》', 'Mission start: Wan Chai - "International XX Centre"', '任務開始：湾仔「国際XXセンター」'),
        hint: T('會展中心營運；開章後喺議會通過並成功舉辦 3 場盛事（包括《幻彩fing香城》都算）；取得 2 個要有實際成效嘅「國際XX中心」稱號；政府投資（買入股票）有持倉；地鐵、巴士、電車、渡輪都有乘客；旅遊吸引力 80，連續 3 個月盈餘。', 'Run the exhibition centre; since the chapter began, pass and hold 3 major events in the council (Fantasy fing counts); earn 2 "International XX Centre" titles by results; hold government investments (shares); metro, buses, trams and ferries with riders; tourism 80 and three months of surplus.', 'コンベンションセンターを運営。章の開始後に議会で大型イベントを3回可決・成功（幻彩fingも含む）。実績のある「国際XXセンター」称号を2つ。政府投資（株式）を保有。地下鉄・バス・路面電車・フェリーに乗客。観光80、3か月連続黒字。') },
    ]),
    stars: Object.freeze([
      {
        title: T('盛事經濟啟動', 'The Mega-Event Economy Begins', 'イベント経済、始動'),
        objectives: Object.freeze([
          { id: 'convention', label: T('會議展覽中心營運中', 'The exhibition centre in operation', 'コンベンションセンターが稼働中'),
            check: (s) => built(s, 'exhibition_center'), progress: (s) => tick(built(s, 'exhibition_center')) },
          majorEventsObjective(3),
          titlesObjective(2),
          { id: 'investment', label: T('政府投資基金有持倉，恒指有市場', 'The government investment fund holds shares in a working market', '政府投資ファンドが株式を保有、市場が機能'),
            check: (s) => num(s.governmentHoldings) > 0 && num(s.hsi) > 0, progress: (s) => `📈 ${fmt(s.governmentHoldings)} · HSI ${fmt(s.hsi)}` },
          { id: 'transit', label: T('地鐵、巴士、電車、渡輪都有乘客', 'Metro, buses, trams and ferries all carry riders', '地下鉄・バス・路面電車・フェリーすべてに乗客'),
            check: (s) => ['metro', 'bus', 'tram', 'ferry'].every((mode) => num(s.transit?.[mode]) > 0),
            progress: (s) => `🚇${fmt(s.transit?.metro)} 🚌${fmt(s.transit?.bus)} 🚋${fmt(s.transit?.tram)} ⛴${fmt(s.transit?.ferry)}` },
          { id: 'tourism', label: T('旅遊吸引力達 80', 'Tourism appeal of 80', '観光魅力度80'),
            check: (s) => num(s.tourismAppeal) >= 80, progress: (s) => `${fmt(s.tourismAppeal)} / 80` },
          streakObjective(3),
        ]),
      },
      {
        title: T('盛事之都', 'City of Events', 'イベントの都'),
        objectives: Object.freeze([
          majorEventsObjective(6),
          titlesObjective(4),
          { id: 'reserve', label: T('財政儲備達 $300,000，滿意度達 65%', 'Reserves of $300,000, happiness of 65%', '財政準備金$300,000、満足度65%'),
            check: (s) => num(s.funds) >= 300000 && num(s.happiness) >= 0.65, progress: (s) => `$${fmt(s.funds)} · ${pct(s.happiness)}` },
        ]),
      },
      {
        title: T('國際XX中心之最', 'The Most International of Centres', '国際XXセンターの頂点'),
        objectives: Object.freeze([
          majorEventsObjective(10),
          titlesObjective(6),
          { id: 'tourism', label: T('旅遊吸引力達 85，滿意度達 70%', 'Tourism appeal of 85, happiness of 70%', '観光魅力度85、満足度70%'),
            check: (s) => num(s.tourismAppeal) >= 85 && num(s.happiness) >= 0.7, progress: (s) => `${fmt(s.tourismAppeal)} · ${pct(s.happiness)}` },
        ]),
      },
    ]),
    // 中段主事件《政府賺面子，街坊塞到爆》
    events: Object.freeze([
      {
        id: 'faceAndGridlock',
        when: (s, base) => majorEventsSince(s, base) >= 1 && num(s.trafficIndex) >= 0.45,
        lines: Object.freeze([
          { speaker: 'tourism', text: T('又一盛事！遊客數據非常鼓舞！', 'Another mega event! The visitor figures are most encouraging!', 'またもや大型イベント！観光客の数字は大変心強い！') },
          { speaker: 'transport', text: T('全線延誤，過海車隊排到後面。', 'Delays on every route; the cross-harbour fleet is queued back for miles.', '全線遅延、海底トンネル行きのバスは延々と列をなしています。') },
          { speaker: 'resident', text: T('盛事係啲乜？我返工都返唔到！', 'What mega event? I cannot even get to work!', '大型イベントって何だ？会社にも行けないぞ！') },
          { speaker: 'secretary', text: T('市民嘅笑容，係政府施政嘅責任。', 'The people\'s smiles are the government\'s responsibility.', '市民の笑顔こそ政府の責任です。') },
          { speaker: 'resident', text: T('我呢個係苦笑。', 'This is a bitter smile.', 'これは苦笑いだ。') },
        ]),
        forum: {
          headline: T('國際XX中心有六個，幾時有國際安居樂業中心？', 'Six international centres - when do we get an International Centre for Living in Peace?', '国際XXセンターが6つ、国際安居楽業センターはいつ？'),
          body: T('盛事撞正上下班時間，灣仔交通大擠塞。', 'A mega event at rush hour: Wan Chai gridlocked.', '大型イベントがラッシュと重なり、湾仔は大渋滞。'),
          comment: T('幻彩fing香城一晚fing晒半個庫房。', 'Fantasy fing Heung Shing flung away half the treasury in one night.', '幻彩fing香城、一晩で国庫の半分をfing。'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'tourism', text: T('盛事經濟，成功！', 'The mega-event economy - a success!', 'イベント経済、大成功！') },
      { speaker: 'treasurer', text: T('報表仲未出，唔好咁早講。', 'The accounts are not out yet. Do not speak too soon.', '決算はまだ出ていない。早まるな。') },
      { speaker: 'secretary', text: T('下一站油尖旺：要真係做到成座城市由朝到晚都有人。', 'Next, Yau Tsim Mong: a city truly busy from morning to night.', '次は油尖旺。本当に朝から晩まで人であふれる街に。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】灣仔盛事經濟取得佳績', '[Government News] Wan Chai\'s mega-event economy delivers', '【政府発表】湾仔のイベント経済が好成績'),
      body: T('政府宣布香城獲得多個「國際中心」稱號，並承諾改善盛事交通安排。', 'The government announces several "international centre" titles and promises better transport on event days.', '政府は香城が複数の「国際センター」称号を得たと発表、イベント時の交通改善を約束した。'),
      comments: Object.freeze([
        T('恒指升三千點，我人工升三十蚊。', 'The index is up three thousand points; my pay is up thirty dollars.', '指数は3000ポイント上昇、俺の給料は30ドル上昇。'),
        T('建議成立國際國際中心，專門管理其他國際中心。', 'Suggest an International International Centre to manage the other international centres.', '他の国際センターを管理する国際国際センターの設立を提案します。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'treasurer', text: T('市長，期限過咗，盛事辦咗，報表就……', 'Mayor, time is up. The events were held; as for the accounts...', '市長、期限が過ぎました。イベントは開いたが、決算のほうは……') },
    ]),
  });

  // CHAPTER 17 油尖旺《我係 油尖旺 揸fit人》: Mong Kok's shops, the night market, culture and the
  // Star Ferry. 半島酒店 and 西九 wait for their art; 理大 counts as the university.
  const CH17 = Object.freeze({
    id: 'ch17',
    startFile: 'UI/campaign/ch17.json',
    deadlineMonths: 24,
    fresh: { cityName: T('油尖旺', 'Yau Tsim Mong', '油尖旺'), budget: 200000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'secretary', text: T('歡迎市長成為油尖旺揸fit人。', 'Welcome, Mayor - you are now the boss of Yau Tsim Mong.', 'ようこそ市長、油尖旺の仕切り役に就任です。') },
      { speaker: 'resident', text: T('你邊個堂口㗎？', 'And which gang are you from?', 'あんた、どこの組の者だ？') },
      { speaker: 'treasurer', text: T('佢係財政司堂口，專收稅。', 'The Treasury gang. Taxes are his business.', '財政司組だ。税金の取り立て専門。') },
      { speaker: 'tourism', text: T('油尖旺要日日都係旅遊旺季！', 'Every day in Yau Tsim Mong must be peak tourist season!', '油尖旺は毎日が観光シーズンでなくては！') },
      { speaker: 'resident', text: T('即係我幾時先可以瞓覺？', 'So when do I get to sleep?', 'で、俺はいつ寝られるんだ？') },
      { card: T('任務開始：油尖旺《我係 油尖旺 揸fit人》', 'Mission start: Yau Tsim Mong - "I Run Yau Tsim Mong"', '任務開始：油尖旺「油尖旺の仕切り役」'),
        hint: T('人口達 90,000，真正有人住、有工返；商業稅收每月 $8,000；行香城夜繽週政策，罪案低於 20%；有文化中心、太空館同大學；天星小輪、地鐵、巴士有乘客；旅遊吸引力 80，連續 3 個月盈餘。', 'Reach 90,000 people with real homes and jobs; commercial tax of $8,000 a month; the Night Bazaar policy with crime under 20%; a cultural centre, the Space Museum and a university; the Star Ferry, metro and buses with riders; tourism 80 and three months of surplus.', '人口90,000人（本当の住民と雇用）。商業税収月$8,000。香城夜市政策で犯罪20%未満。文化センター・宇宙館・大学。スターフェリー・地下鉄・バスに乗客。観光80、3か月連続黒字。') },
    ]),
    stars: Object.freeze([
      {
        title: T('真正揸fit', 'Truly in Charge', '本当の仕切り役'),
        objectives: Object.freeze([
          { id: 'population', label: T('人口達 90,000，失業率低於 10%', 'Population of 90,000, unemployment under 10%', '人口90,000人、失業率10%未満'),
            check: (s) => num(s.population) >= 90000 && num(s.unemploymentRate) < 0.1,
            progress: (s) => `${fmt(s.population)} / 90,000 · ${pct(s.unemploymentRate)}` },
          { id: 'retail', label: T('旺角商圈：商業稅收每月 $8,000', 'Mong Kok\'s shops: commercial tax of $8,000 a month', '旺角の商圏：商業税収が月$8,000'),
            check: (s) => num(s.commercialTax) >= 8000, progress: (s) => `$${fmt(s.commercialTax)} / $8,000` },
          { id: 'nightMarket', label: T('廟街夜市：行香城夜繽週，罪案指數低於 20%', 'The Temple Street night market: the Night Bazaar policy, crime under 20%', '廟街夜市：香城夜市政策、犯罪指数20%未満'),
            check: (s) => policy(s, 'nightBazaarWeekend') && num(s.crimeRate) < 0.2,
            progress: (s) => `📜 ${tick(policy(s, 'nightBazaarWeekend'))} · ${pct(s.crimeRate)}` },
          { id: 'culture', label: T('有文化中心、太空館同大學（理大）', 'A cultural centre, the Space Museum and a university (PolyU)', '文化センター・宇宙館・大学（理工大）'),
            check: (s) => ['cultural_center', 'space_museum', 'university'].every((type) => built(s, type)),
            progress: (s) => `${['cultural_center', 'space_museum', 'university'].filter((type) => built(s, type)).length} / 3` },
          { id: 'transit', label: T('天星小輪、地鐵、巴士都有乘客', 'The Star Ferry, metro and buses all carry riders', 'スターフェリー・地下鉄・バスすべてに乗客'),
            check: (s) => ['ferry', 'metro', 'bus'].every((mode) => num(s.transit?.[mode]) > 0),
            progress: (s) => `⛴${fmt(s.transit?.ferry)} 🚇${fmt(s.transit?.metro)} 🚌${fmt(s.transit?.bus)}` },
          { id: 'tourism', label: T('旅遊吸引力達 80', 'Tourism appeal of 80', '観光魅力度80'),
            check: (s) => num(s.tourismAppeal) >= 80, progress: (s) => `${fmt(s.tourismAppeal)} / 80` },
          streakObjective(3),
        ]),
      },
      {
        title: T('九龍不夜城', 'Kowloon, the City That Never Sleeps', '眠らない九龍'),
        objectives: Object.freeze([
          { id: 'tourism', label: T('旅遊吸引力達 85', 'Tourism appeal of 85', '観光魅力度85'),
            check: (s) => num(s.tourismAppeal) >= 85, progress: (s) => `${fmt(s.tourismAppeal)} / 85` },
          { id: 'events', label: T('開章後舉辦一次節慶活動，罪案低於 15%', 'Hold a festival since the chapter began, with crime under 15%', '章の開始後に祭りを開催し、犯罪15%未満'),
            check: (s, base) => heldAnySince(s, base) && num(s.crimeRate) < 0.15,
            progress: (s, base) => `${tick(heldAnySince(s, base))} · ${pct(s.crimeRate)}` },
          { id: 'ferry', label: T('天星小輪每月載客 3,000 人次', 'The Star Ferry carries 3,000 riders a month', 'スターフェリーの月間乗客3,000人'),
            check: (s) => num(s.transit?.ferry) >= 3000, progress: (s) => `${fmt(s.transit?.ferry)} / 3,000` },
        ]),
      },
      {
        title: T('油尖旺真正揸fit人', 'The Real Boss of Yau Tsim Mong', '油尖旺の真の仕切り役'),
        objectives: Object.freeze([
          { id: 'tourism', label: T('旅遊吸引力達 90，滿意度達 70%', 'Tourism appeal of 90, happiness of 70%', '観光魅力度90、満足度70%'),
            check: (s) => num(s.tourismAppeal) >= 90 && num(s.happiness) >= 0.7, progress: (s) => `${fmt(s.tourismAppeal)} · ${pct(s.happiness)}` },
          { id: 'education', label: T('教育指數達 80%', 'Education at 80%', '教育指数80%'),
            check: (s) => num(s.educationBasic) >= 0.8, progress: (s) => pct(s.educationBasic) },
          { id: 'reserve', label: T('財政儲備達 $400,000', 'Reserves of $400,000', '財政準備金$400,000'),
            check: (s) => num(s.funds) >= 400000, progress: (s) => `$${fmt(s.funds)} / $400,000` },
        ]),
      },
    ]),
    // 中段主事件《一晚三個油尖旺》
    events: Object.freeze([
      {
        id: 'threeNights',
        when: (s) => policy(s, 'nightBazaarWeekend') && built(s, 'cultural_center') && num(s.transit?.ferry) > 0,
        lines: Object.freeze([
          { speaker: 'transport', text: T('地鐵站外排隊長龍，尖沙咀碼頭又有幾千人等船。', 'Queues outside the metro stations, and thousands waiting at the Tsim Sha Tsui pier.', '地下鉄の駅の外に長蛇の列、尖沙咀の埠頭でも数千人が船待ちです。') },
          { speaker: 'stallOwner', text: T('我煲仔飯賣晒，但全部客行唔到入嚟！', 'My claypot rice sold out - but none of the customers can get in!', '土鍋ご飯は完売したのに、客が誰も入って来られない！') },
          { speaker: 'culture', text: T('演出即將開場，但觀眾困喺路上。', 'The show is about to start, and the audience is stuck on the road.', 'まもなく開演なのに、観客が道で足止めされています。') },
          { card: T('一晚三個油尖旺', 'Three Yau Tsim Mongs in One Night', '一晩に三つの油尖旺'),
            hint: T('加開地鐵、小輪、巴士班次，或者設步行區；夜間人流同日間通勤要分開處理。', 'Add metro, ferry and bus services, or pedestrian zones; night crowds and day commuters need handling apart.', '地下鉄・フェリー・バスを増便するか、歩行者天国を。夜の人出と昼の通勤は分けて考えよう。') },
        ]),
        forum: {
          headline: T('政府話國際不夜城，我就連續三晚冇得瞓。', 'The government says city that never sleeps; I have not slept for three nights.', '政府は眠らない国際都市と言うが、俺は三晩眠れていない。'),
          body: T('西九演出、旅遊團同廟街夜市撞正同一晚，油尖旺人流爆滿。', 'A West Kowloon show, tour groups and the Temple Street night market on the same night: Yau Tsim Mong overflows.', '西九の公演、ツアー団体、廟街夜市が同じ夜に重なり、油尖旺は人であふれた。'),
          comment: T('油尖旺揸fit人，幫我揸住條地鐵月台先啦。', 'Boss of Yau Tsim Mong - start by sorting out the metro platform.', '油尖旺の仕切り役さん、まず地下鉄のホームを仕切ってよ。'),
        },
      },
    ]),
    outro: Object.freeze([
      { speaker: 'secretary', text: T('十七區完成，市長。你而家望到嘅，係最後一關。', 'Seventeen districts done, Mayor. What you see across the water is the last.', '17区完了です、市長。今見えているのが最後の章です。') },
      { speaker: 'treasurer', text: T('全城最貴嘅樓、最忙嘅交通、最多人睇住嘅政府。', 'The dearest property, the busiest traffic, and the most watched government in the city.', '街一番高い不動産、一番忙しい交通、一番注目される政府。') },
      { card: T('最終章解鎖：中西區《東方之珠：維多利亞港中心》', 'Final chapter unlocked: Central and Western - "Pearl of the Orient"', '最終章解放：中西区「東洋の真珠」') },
    ]),
    outroForum: {
      headline: T('【政府新聞】油尖旺日夜繁榮，旅遊及文化設施全面開放', '[Government News] Yau Tsim Mong thrives day and night; tourism and culture fully open', '【政府発表】油尖旺が昼夜繁栄、観光と文化施設が全面開放'),
      body: T('旅遊署表示，旺角、油麻地、尖沙咀各有特色，天星小輪客量理想。', 'The Tourism Board says Mong Kok, Yau Ma Tei and Tsim Sha Tsui each have their own character, and Star Ferry ridership is healthy.', '観光局によると、旺角・油麻地・尖沙咀はそれぞれ個性があり、スターフェリーの乗客も好調だという。'),
      comments: Object.freeze([
        T('半島酒店住唔起，廟街煲仔飯都越嚟越貴。', 'Cannot afford the Peninsula, and the claypot rice keeps getting dearer.', 'ペニンシュラには泊まれないし、廟街の土鍋ご飯もどんどん高くなる。'),
        T('西九藝術展好高深，展品係一張「正在施工」告示。', 'The West Kowloon art show is so deep - the exhibit is a "work in progress" sign.', '西九の美術展は深遠すぎる。展示品は「工事中」の看板。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'resident', text: T('市長，期限過咗，邊個先係揸fit人都未搞清楚……', 'Mayor, time is up, and nobody has worked out who is in charge...', '市長、期限が過ぎました。誰が仕切り役なのか、まだはっきりしません……') },
    ]),
  });

  // CHAPTER 18 中西區《東方之珠：維多利亞港中心》: the final order - the exchange and the grade-A
  // towers, the 西隧 with buses through it, every mode carrying riders, and a government that
  // answers: the elections, the ICAC and the Legislative Council, not a "+10 freedom" button.
  const CH18 = Object.freeze({
    id: 'ch18',
    startFile: 'UI/campaign/ch18.json',
    deadlineMonths: 24,
    fresh: { cityName: T('中西區', 'Central and Western', '中西区'), budget: 250000, transportExpansion: true },
    intro: Object.freeze([
      { speaker: 'finance', text: T('市長，香城要做世界級國際金融中心，就要有交易所、跨國企業同頂級甲級商廈。', 'Mayor, a world-class financial centre needs an exchange, multinationals and top grade-A towers.', '市長、世界的な国際金融センターには取引所、多国籍企業、最高級のAクラスオフィスが必要です。') },
      { speaker: 'transport', text: T('西區海底隧道同港鐵都要頂住跨海通勤。', 'The Western Harbour Tunnel and the MTR both have to carry the cross-harbour commute.', '西区海底トンネルとMTRの両方で、海を渡る通勤を支えなければ。') },
      { speaker: 'education', text: T('香港大學可以培養人才，但教育唔只係為金融公司供應員工。', 'The university can train talent - but education is not just a supply of staff for banks.', '香港大学は人材を育てられる。でも教育は金融会社に人を供給するためだけのものじゃない。') },
      { speaker: 'resident', text: T('樓就愈起愈高，市民講嘢有冇人聽？', 'The towers keep rising - but is anyone listening to the people?', 'ビルはどんどん高くなるが、市民の声を聞く人はいるのか？') },
      { speaker: 'queen', text: T('市長：你已經識得建城、運輸、收稅、保育、維持治安同照顧居民。最後，你要證明一座繁榮嘅城市，可以容納多種聲音，亦值得所有市民安居。', 'Mayor: you have learnt to build, to move people, to tax, to conserve, to keep order and to care for the people. Lastly, prove that a prosperous city can hold many voices, and is worth a home for every citizen.', '市長へ。あなたは街を築き、人を運び、税を集め、保全し、治安を守り、住民を世話することを学んだ。最後に、繁栄する都市が多くの声を受け入れ、すべての市民が安らげる場所たりうることを証明しなさい。') },
      { card: T('最終章：中西區《東方之珠：維多利亞港中心》', 'Final chapter: Central and Western - "Pearl of the Orient"', '最終章：中西区「東洋の真珠」'),
        hint: T('股票交易所同 5 座甲級寫字樓，政府投資有持倉；起西隧（海底隧道）有車流，至少一條巴士線行經隧道；地鐵、巴士、電車、渡輪都有乘客；行區議會選舉、立法會選舉同廉政公署，起立法會大樓；連續 3 個月盈餘，滿意度 60%。', 'A stock exchange and 5 grade-A office towers, with government investments held; build the Western Harbour Tunnel (an undersea tunnel) with traffic and at least one bus route through it; metro, buses, trams and ferries with riders; the District Council and Legislative Council elections and the ICAC, with the Legislative Council building; three months of surplus and happiness of 60%.', '株式取引所とAクラスオフィス5棟、政府投資を保有。西隧（海底トンネル）を建てて交通を通し、少なくとも1本のバス路線をトンネル経由に。地下鉄・バス・路面電車・フェリーに乗客。区議会選挙・立法会選挙・ICACと立法会ビル。3か月連続黒字、満足度60%。') },
    ]),
    stars: Object.freeze([
      {
        title: T('國際金融都會', 'International Financial City', '国際金融都市'),
        objectives: Object.freeze([
          { id: 'finance', label: T('股票交易所營運，甲級寫字樓 5 座', 'A working stock exchange and 5 grade-A office towers', '株式取引所が稼働、Aクラスオフィス5棟'),
            check: (s) => built(s, 'stock_exchange') && num(s.gradeAOffices) >= 5,
            progress: (s) => `🏦 ${tick(built(s, 'stock_exchange'))} · ${fmt(s.gradeAOffices)} / 5` },
          { id: 'investment', label: T('政府投資基金有持倉，連續 3 個月盈餘', 'The government investment fund holds shares; three months of surplus', '政府投資ファンドが株式を保有、3か月連続黒字'),
            check: (s) => num(s.governmentHoldings) > 0 && num(s.surplusStreak) >= 3,
            progress: (s) => `📈 ${fmt(s.governmentHoldings)} · ${fmt(s.surplusStreak)} / 3` },
          { id: 'tunnel', label: T('西區海底隧道有車流，至少一條過海巴士線行經隧道', 'The Western Harbour Tunnel with traffic, and a cross-harbour bus route through it', '西区海底トンネルに交通、トンネル経由の越境バス1路線以上'),
            check: (s) => num(s.underseaTunnels) > 0 && num(s.tunnelBusRoutes) >= 1,
            progress: (s) => `🚇 ${fmt(s.underseaTunnels)} · 🚌 ${fmt(s.tunnelBusRoutes)}` },
          { id: 'transit', label: T('地鐵、巴士、電車、渡輪（天星）都有乘客', 'Metro, buses, trams and ferries (the Star Ferry) all carry riders', '地下鉄・バス・路面電車・フェリー（スターフェリー）すべてに乗客'),
            check: (s) => ['metro', 'bus', 'tram', 'ferry'].every((mode) => num(s.transit?.[mode]) > 0),
            progress: (s) => `🚇${fmt(s.transit?.metro)} 🚌${fmt(s.transit?.bus)} 🚋${fmt(s.transit?.tram)} ⛴${fmt(s.transit?.ferry)}` },
          { id: 'reform', label: T('政治改革：區議會選舉、立法會選舉、廉政公署，有立法會大樓', 'Political reform: District Council and Legislative Council elections, the ICAC, and the Legislative Council building', '政治改革：区議会選挙・立法会選挙・ICAC、立法会ビル'),
            check: (s) => ['districtCouncilElection', 'legislativeCouncilElection', 'icac'].every((id) => policy(s, id)) && built(s, 'legislative_council'),
            progress: (s) => `${['districtCouncilElection', 'legislativeCouncilElection', 'icac'].filter((id) => policy(s, id)).length + (built(s, 'legislative_council') ? 1 : 0)} / 4` },
          { id: 'happiness', label: T('滿意度達 60%', 'Happiness of 60%', '満足度60%'),
            check: (s) => num(s.happiness) >= 0.6, progress: (s) => pct(s.happiness) },
        ]),
      },
      {
        title: T('亞洲國際都會', 'Asia\'s World City', 'アジアの国際都市'),
        objectives: Object.freeze([
          { id: 'university', label: T('香港大學（大學）營運，教育指數 80%', 'The university in operation, education at 80%', '大学（香港大学）が稼働、教育指数80%'),
            check: (s) => built(s, 'university') && num(s.educationBasic) >= 0.8, progress: (s) => `🎓 ${tick(built(s, 'university'))} · ${pct(s.educationBasic)}` },
          { id: 'tramFerry', label: T('每月載客：電車 5,000、渡輪 3,000', 'Riders a month: trams 5,000, ferries 3,000', '月間乗客：路面電車5,000・フェリー3,000'),
            check: (s) => num(s.transit?.tram) >= 5000 && num(s.transit?.ferry) >= 3000,
            progress: (s) => `🚋 ${fmt(s.transit?.tram)} · ⛴ ${fmt(s.transit?.ferry)}` },
          { id: 'happiness', label: T('滿意度達 70%，財政儲備 $400,000', 'Happiness of 70%, reserves of $400,000', '満足度70%、財政準備金$400,000'),
            check: (s) => num(s.happiness) >= 0.7 && num(s.funds) >= 400000, progress: (s) => `${pct(s.happiness)} · $${fmt(s.funds)}` },
        ]),
      },
      {
        title: T('東方之珠', 'Pearl of the Orient', '東洋の真珠'),
        objectives: Object.freeze([
          { id: 'fireworks', label: T('開章後舉辦維多利亞港煙花匯演', 'Hold the Victoria Harbour fireworks since the chapter began', '章の開始後にヴィクトリア・ハーバー花火大会を開催'),
            check: (s, base) => heldSince(s, base, 'fireworks') > 0, progress: (s, base) => tick(heldSince(s, base, 'fireworks') > 0) },
          majorEventsObjective(3),
          { id: 'happiness', label: T('滿意度達 80%，失業率低於 5%', 'Happiness of 80%, unemployment under 5%', '満足度80%、失業率5%未満'),
            check: (s) => num(s.happiness) >= 0.8 && num(s.unemploymentRate) < 0.05, progress: (s) => `${pct(s.happiness)} · ${pct(s.unemploymentRate)}` },
        ]),
      },
    ]),
    // 中段主事件 A《恒指高企，市民問自己份糧》 and B《議會有聲音》
    events: Object.freeze([
      {
        id: 'indexHighPayLow',
        when: (s) => built(s, 'stock_exchange') && num(s.governmentHoldings) > 0,
        lines: Object.freeze([
          { speaker: 'finance', text: T('恒指創歷史新高，國際投資者信心爆棚！', 'The index hits a record high - international investor confidence is bursting!', '指数は史上最高値、国際投資家の信頼は絶大です！') },
          { speaker: 'worker', text: T('我份糧呢？佢有冇跟住歷史新高？', 'And my pay? Did it hit a record high too?', '俺の給料は？それも史上最高になったのか？') },
          { speaker: 'treasurer', text: T('股票價格、企業盈利、政府稅收同家庭收入，係四張唔同嘅報表。', 'Share prices, company profits, government revenue and household income are four different reports.', '株価、企業収益、政府の税収、家計の収入は、四つの別々の報告書です。') },
        ]),
        forum: {
          headline: T('恒指升咗，樓下茶餐廳加價先係真實感受。', 'The index went up - what I actually feel is the cha chaan teng raising its prices.', '指数が上がった。実感するのは下の茶餐廳の値上げだけ。'),
          body: T('香城恒指創新高，市民關注工資同住屋負擔。', 'The Heung Shing index sets a record; people ask about wages and housing costs.', '香城指数が最高値、市民の関心は賃金と住居費に。'),
          comment: T('又話國際金融中心，點解行去碼頭都要兜三條天橋？', 'International financial centre, they say - so why does the walk to the pier take three footbridges?', '国際金融センターと言うなら、なぜ埠頭まで歩道橋を三つも渡るんだ？'),
        },
      },
      {
        id: 'councilHasVoices',
        when: (s) => ['districtCouncilElection', 'legislativeCouncilElection', 'icac'].some((id) => policy(s, id)),
        lines: Object.freeze([
          { speaker: 'secretary', text: T('市長，議會有不同意見，唔代表系統出咗Bug。', 'Mayor, different views in the council do not mean the system has a bug.', '市長、議会に異なる意見があるのは、システムのバグではありません。') },
          { speaker: 'councillorA', text: T('改革要保障所有市民參與，資料亦要公開。', 'Reform must let every citizen take part, and the information must be public.', '改革はすべての市民の参加を保障し、情報も公開すべきです。') },
          { speaker: 'councillorB', text: T('制度改動需要清楚程序、實施成本及過渡安排。', 'Changes to the system need clear procedure, costs and transition.', '制度の変更には明確な手続き、実施コスト、移行措置が必要です。') },
          { speaker: 'reporter', text: T('市民可唔可以問到完整數據，而唔係淨係聽新聞稿？', 'Can people get the full figures, not just the press release?', '市民は報道発表だけでなく、完全なデータを求められるのですか？') },
        ]),
      },
    ]),
    outro: Object.freeze([
      { speaker: 'queen', text: T('市長：香城十八區都有你嘅足跡。繁榮、自由、文化、交通同民生，原來可以共存。最後密令，完成。', 'Mayor: your footsteps are in all eighteen districts of Heung Shing. Prosperity, freedom, culture, transport and livelihoods can live together after all. The final order is fulfilled.', '市長へ。香城十八区すべてにあなたの足跡がある。繁栄も自由も文化も交通も暮らしも、共に在りうるのだ。最後の密令、完了。') },
      { speaker: 'secretary', text: T('市長，十八區一星全部完成！仲可以返去攞二星、三星。', 'Mayor, the first star in all eighteen districts! You can still go back for the second and third.', '市長、18区すべてで一つ目の星を達成！まだ二つ目、三つ目の星を取りに戻れます。') },
    ]),
    outroForum: {
      headline: T('【政府新聞】中西區成為國際金融都會，議會改革落實', '[Government News] Central and Western becomes an international financial city; council reforms in place', '【政府発表】中西区が国際金融都市に、議会改革も実施'),
      body: T('政府表示，交易所、西隧及各類公共交通運作暢順，選舉同廉政制度全面推行。', 'The government says the exchange, the Western Harbour Tunnel and public transport run smoothly, and the elections and anti-corruption system are fully in place.', '政府によると、取引所・西隧・各種公共交通は順調に運行し、選挙と汚職防止の制度も全面実施された。'),
      comments: Object.freeze([
        T('海旁好靚，但請記得幫居民交返電費呀。', 'The waterfront is lovely - but do help the residents with the electricity bill.', '海辺はきれいだけど、住民の電気代も忘れずに。'),
        T('維園年宵買咗盆桔，搭電車差啲成盆變咗桔汁。', 'Bought a kumquat tree at the Victoria Park fair; on the tram it nearly became kumquat juice.', 'ヴィクトリア公園の年市でキンカンの鉢を買ったら、路面電車でジュースになりかけた。'),
      ]),
    },
    failure: Object.freeze([
      { speaker: 'secretary', text: T('市長，期限過咗……女皇最後密令未完成，但你仲可以再試。', 'Mayor, time is up... Her Majesty\'s final order is not yet fulfilled, but you may try again.', '市長、期限が過ぎました……女王の最後の密令は未完了ですが、まだ挑戦できます。') },
    ]),
  });

  const CAMPAIGN_CHAPTER_SPECS = Object.freeze({
    ch01: CH01, ch02: CH02, ch03: CH03, ch04: CH04, ch05: CH05, ch06: CH06, ch07: CH07, ch08: CH08, ch09: CH09,
    ch12: CH12, ch13: CH13, ch16: CH16, ch17: CH17, ch18: CH18,
  });

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

  // Where the city stood when the chapter began, for objectives measured from there: the latest
  // festival years, and (P3) the village houses, the monthly commercial and industrial tax, the
  // industry and the month. Read from a snapshot, or from a stored base (the same names).
  function createCampaignRunBase(snapshot, monthIndex = 0) {
    return {
      festivalHeldYear: cleanYears(snapshot?.festivalHeldYear),
      festivalNoVenueYear: cleanYears(snapshot?.festivalNoVenueYear),
      villageHouses: Math.max(0, Math.floor(num(snapshot?.villageHouses))),
      taxCI: Math.max(0, num(snapshot?.taxCI)),
      industrialCount: Math.max(0, Math.floor(num(snapshot?.industrialCount))),
      // 舊樓 (P4 第 15 章): repairs made before the chapter began are not the chapter's
      buildingRepairs: Math.max(0, Math.floor(num(snapshot?.buildingRepairs))),
      monthIndex: Math.floor(num(snapshot?.monthIndex ?? monthIndex)),
    };
  }

  function createCampaignRun(chapterId, monthIndex, snapshot = null) {
    const start = Math.floor(num(monthIndex));
    const spec = CAMPAIGN_CHAPTER_SPECS[chapterId];
    return {
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      chapterId,
      startMonthIndex: start,
      deadlineMonthIndex: start + getCampaignDeadlineMonths(chapterId),
      base: createCampaignRunBase(snapshot, start),
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
    run.base = createCampaignRunBase(raw.base, run.startMonthIndex);
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
    // tutorials: the shared ones (a chapter's tutorialId) the player has been through
    return { schemaVersion: CAMPAIGN_SCHEMA_VERSION, prologueSeen: false, chapters: {}, tutorials: {} };
  }

  function normalizeCampaignProfile(raw) {
    const profile = createEmptyCampaignProfile();
    if (!raw || typeof raw !== 'object') return profile;
    profile.prologueSeen = !!raw.prologueSeen;
    Object.keys(raw.tutorials || {}).forEach((id) => { if (/^[a-zA-Z0-9_-]{1,40}$/.test(id) && raw.tutorials[id]) profile.tutorials[id] = true; });
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
