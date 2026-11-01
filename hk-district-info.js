// Names and short introductions for the Hong Kong district maps, shown on the New City screen.
// The terrain itself is generated into hk-district-maps.js; this file is hand-written.
const HK_DISTRICT_INFO = {
  'victoria-harbour': {
    names: { zhHant: '維港兩岸', en: 'Victoria Harbour', ja: 'ヴィクトリア・ハーバー' },
    intro: {
      zhHant: '香港的心臟。中環、灣仔與尖沙咀隔着維港相望：南岸是背靠太平山的狹長填海平地，北岸是平坦的九龍半島。',
      en: 'The heart of Hong Kong. Central and Wan Chai face Tsim Sha Tsui across the harbour: a narrow reclaimed strip under Victoria Peak to the south, the flat Kowloon peninsula to the north.',
      ja: '香港の心臓部。中環・湾仔と尖沙咀がハーバーを挟んで向かい合う。南岸はヴィクトリア・ピークを背にした細長い埋立地、北岸は平坦な九龍半島。',
    },
  },
  aberdeen: {
    names: { zhHant: '香港仔·鴨脷洲', en: 'Aberdeen & Ap Lei Chau', ja: '香港仔・鴨脷洲' },
    intro: {
      zhHant: '港島南岸的漁港。香港仔避風塘夾在港島與鴨脷洲之間，背山面海，平地不多。',
      en: 'A fishing harbour on the south side of Hong Kong Island. The typhoon shelter lies between the island and Ap Lei Chau, with hills close behind and little flat land.',
      ja: '香港島南岸の漁港。香港島と鴨脷洲の間に避風塘があり、背後に山が迫り平地は少ない。',
    },
  },
  'central-western': {
    names: { zhHant: '中西區', en: 'Central and Western', ja: '中西区' },
    intro: {
      zhHant: '維港南岸的商業核心。由上環到金鐘是一條狹長的填海平地，背後就是太平山。',
      en: 'The business heart on the south shore of Victoria Harbour: a narrow strip of reclaimed flat land from Sheung Wan to Admiralty, with Victoria Peak rising straight behind it.',
      ja: 'ヴィクトリア・ハーバー南岸のビジネス中心地。上環から金鐘まで細長い埋立地が続き、すぐ背後にヴィクトリア・ピークがそびえる。',
    },
  },
  eastern: {
    names: { zhHant: '東區', en: 'Eastern', ja: '東区' },
    intro: {
      zhHant: '由北角到柴灣的港島東岸。沿海是一條長長的平地，南面是柏架山一帶的山脊。',
      en: 'The eastern shore of Hong Kong Island from North Point to Chai Wan: a long coastal strip of flat land below the ridges around Mount Parker.',
      ja: '北角から柴湾までの香港島東岸。海沿いに細長い平地が続き、南側には柏架山一帯の尾根がある。',
    },
  },
  'sai-kung': {
    names: { zhHant: '西貢', en: 'Sai Kung', ja: '西貢' },
    intro: {
      zhHant: '「香港後花園」。海灣曲折，小島星羅棋布，市中心平地細小，發展要因地制宜。',
      en: "Hong Kong's back garden: winding bays and scattered islands around a small town centre, where every flat plot counts.",
      ja: '「香港の裏庭」。入り組んだ湾と点在する島々に囲まれ、町の中心部の平地は小さい。',
    },
  },
  stanley: {
    names: { zhHant: '赤柱', en: 'Stanley', ja: '赤柱（スタンレー）' },
    intro: {
      zhHant: '港島南端的半島，三面環海，有沙灘和海灣，山多地少。',
      en: 'A peninsula at the southern tip of Hong Kong Island, with sea on three sides, beaches and bays, and more hill than flat land.',
      ja: '香港島南端の半島。三方を海に囲まれ、砂浜と入り江が多く、平地より山が多い。',
    },
  },
  'wan-chai': {
    names: { zhHant: '灣仔區', en: 'Wan Chai', ja: '湾仔区' },
    intro: {
      zhHant: '由灣仔到銅鑼灣的維港南岸。跑馬地谷地夾在群山之間，南面山坡陡峭。',
      en: 'The harbour front from Wan Chai to Causeway Bay. Happy Valley sits in a hollow between the hills, which climb steeply to the south.',
      ja: '湾仔から銅鑼湾までのハーバー南岸。ハッピーバレーの谷が山あいにあり、南側は急な斜面になる。',
    },
  },
  'yau-tsim-mong': {
    names: { zhHant: '油尖旺', en: 'Yau Tsim Mong', ja: '油尖旺' },
    intro: {
      zhHant: '九龍半島南端，幾乎全是平地。西面是西九龍填海區，最高處只有百多米。',
      en: 'The tip of the Kowloon peninsula and almost entirely flat, with the West Kowloon reclamation to the west. Nothing here rises much above 100 m.',
      ja: '九龍半島の南端で、ほぼ全域が平地。西側に西九龍の埋立地があり、最も高い所でも百数十メートルほど。',
    },
  },
  'sham-shui-po': {
    names: { zhHant: '深水埗', en: 'Sham Shui Po', ja: '深水埗' },
    intro: {
      zhHant: '九龍西北的密集舊區。北面是陡峭的山坡，西南是昂船洲與貨櫃碼頭一帶的海岸。',
      en: 'Dense old Kowloon in the north-west, with steep hillsides to the north and the Stonecutters Island and container port waterfront to the south-west.',
      ja: '九龍北西部の密集した旧市街。北側は急な山の斜面、南西側は昂船洲とコンテナ埠頭の海岸。',
    },
  },
  'kowloon-city': {
    names: { zhHant: '九龍城', en: 'Kowloon City', ja: '九龍城' },
    intro: {
      zhHant: '舊啟德機場的跑道伸入維港，兩旁是大片平地，北面靠山。',
      en: "The old Kai Tak airport runway reaches out into the harbour, flanked by wide flat land, with hills to the north.",
      ja: '旧啓徳空港の滑走路がハーバーに突き出し、両側に広い平地、北側には山が控える。',
    },
  },
  'kwun-tong': {
    names: { zhHant: '觀塘', en: 'Kwun Tong', ja: '観塘' },
    intro: {
      zhHant: '九龍東的工業及住宅區，與啟德跑道隔海相對。北面山坡陡峭，直上飛鵝山。',
      en: 'Industrial and residential East Kowloon, facing the Kai Tak runway across the water. The slopes behind climb steeply to Kowloon Peak.',
      ja: '九龍東部の工業・住宅地区で、啓徳の滑走路と海を挟んで向かい合う。北側の斜面は飛鵝山まで急に駆け上がる。',
    },
  },
  'tseung-kwan-o': {
    names: { zhHant: '將軍澳', en: 'Tseung Kwan O', ja: '将軍澳' },
    intro: {
      zhHant: '建在填海土地上的新市鎮。海灣深入內陸，兩旁是起伏的丘陵。',
      en: 'A new town built on reclaimed land at the head of a long, narrow bay, with rolling hills on either side.',
      ja: '埋立地に築かれたニュータウン。細長い湾が内陸まで入り込み、両側に丘陵が連なる。',
    },
  },
  'tsuen-wan': {
    names: { zhHant: '荃灣', en: 'Tsuen Wan', ja: '荃湾' },
    intro: {
      zhHant: '新界西南的新市鎮，面向藍巴勒海峽與青衣，背靠大帽山南面的山坡。',
      en: 'A new town in the south-west New Territories, facing Rambler Channel and Tsing Yi, backed by the southern slopes of Tai Mo Shan.',
      ja: '新界南西部のニュータウン。藍巴勒海峡と青衣に面し、背後に大帽山の南斜面が広がる。',
    },
  },
  'sha-tin': {
    names: { zhHant: '沙田', en: 'Sha Tin', ja: '沙田' },
    intro: {
      zhHant: '城門河貫穿谷地，兩岸平地建成新市鎮，四周群山環抱。',
      en: 'The Shing Mun River runs through a valley whose flat banks became a new town, ringed all round by hills.',
      ja: '城門河が谷を貫き、両岸の平地がニュータウンになった。周囲は山々に囲まれている。',
    },
  },
  'tai-po': {
    names: { zhHant: '大埔', en: 'Tai Po', ja: '大埔' },
    intro: {
      zhHant: '吐露港西岸的新市鎮，林村河谷地向內陸延伸，四周丘陵起伏。',
      en: 'A new town on the western shore of Tolo Harbour, where the Lam Tsuen valley runs inland between rolling hills.',
      ja: '吐露港西岸のニュータウン。林村河の谷が内陸へ延び、周囲に丘陵が広がる。',
    },
  },
  'sheung-shui': {
    names: { zhHant: '上水', en: 'Sheung Shui', ja: '上水' },
    intro: {
      zhHant: '新界北部的平原，地勢平坦開闊，適合大規模規劃。',
      en: 'Open, level plain in the northern New Territories: room for planning on a large scale.',
      ja: '新界北部の平野。地形は平らで開けており、大規模な計画に向く。',
    },
  },
  'yuen-long': {
    names: { zhHant: '元朗', en: 'Yuen Long', ja: '元朗' },
    intro: {
      zhHant: '元朗平原的中心，大片平地與魚塘，是全港最平坦的地方之一。',
      en: 'The heart of the Yuen Long plain, wide flat land and fish ponds: one of the flattest places in Hong Kong.',
      ja: '元朗平野の中心。広い平地と養魚池が広がる、香港でも最も平坦な場所の一つ。',
    },
  },
  'tin-shui-wai': {
    names: { zhHant: '天水圍', en: 'Tin Shui Wai', ja: '天水囲' },
    intro: {
      zhHant: '后海灣東岸的平原，西北面是濕地與紅樹林，地勢極為平坦。',
      en: 'Plain on the eastern shore of Deep Bay, with wetlands and mangroves to the north-west and barely a rise anywhere.',
      ja: '后海湾東岸の平野。北西には湿地とマングローブが広がり、起伏はほとんどない。',
    },
  },
  lantau: {
    names: { zhHant: '大嶼山', en: 'Lantau Island', ja: 'ランタオ島' },
    intro: {
      zhHant: '東涌灣畔的新市鎮背靠鳳凰山一帶的高山，山上是昂坪。全港最高的山地之一。',
      en: 'Tung Chung new town on Tung Chung Bay, backed by the high mountains around Lantau Peak, with Ngong Ping up on the heights.',
      ja: '東涌湾のニュータウンの背後に鳳凰山一帯の高い山々がそびえ、山上には昂坪がある。',
    },
  },
  lamma: {
    names: { zhHant: '南丫島', en: 'Lamma Island', ja: 'ラマ島' },
    intro: {
      zhHant: '港島西南的離島，海岸曲折，山丘起伏，只有小村落與漁港。',
      en: 'An outlying island south-west of Hong Kong Island: a ragged coast, rolling hills and nothing more than villages and fishing harbours.',
      ja: '香港島南西の離島。入り組んだ海岸と丘陵があり、小さな村と漁港だけがある。',
    },
  },
  'tuen-mun': {
    names: { zhHant: '屯門', en: 'Tuen Mun', ja: '屯門' },
    intro: {
      zhHant: '新界西部的新市鎮，屯門河谷向南通往青山灣，西面是青山。',
      en: 'A new town in the western New Territories, where the Tuen Mun valley runs south to Castle Peak Bay beneath Castle Peak.',
      ja: '新界西部のニュータウン。屯門の谷が南の青山湾へと続き、西側には青山がそびえる。',
    },
  },
  'tsing-yi': {
    names: { zhHant: '青衣', en: 'Tsing Yi', ja: '青衣' },
    intro: {
      zhHant: '藍巴勒海峽對岸的島嶼，中央是山，沿岸是工業區與屋邨。',
      en: 'An island across Rambler Channel, hilly in the middle, with industry and housing estates around its shores.',
      ja: '藍巴勒海峡の対岸にある島。中央は山で、沿岸に工業地区と団地が並ぶ。',
    },
  },
  'clear-water-bay': {
    names: { zhHant: '清水灣', en: 'Clear Water Bay', ja: 'クリアウォーターベイ' },
    intro: {
      zhHant: '九龍以東的半島，海灣、沙灘與丘陵交錯，平地稀少。',
      en: 'A peninsula east of Kowloon where bays, beaches and hills interlock and flat land is scarce.',
      ja: '九龍の東にある半島。湾と砂浜と丘陵が入り組み、平地は少ない。',
    },
  },
};
