// A city's one-time lovers photo diary. Rules are pure; newspaper.js owns delivery.
(function (root) {
  'use strict';
  const text = (zhHant, en, ja) => ({ zhHant, en, ja });
  const built = (s, type) => s.buildings?.includes(type);
  const park = (s) => ['park', 'park_small', 'park_large', 'park_flagship'].some((type) => built(s, type));
  const waterfront = (s) => Number(s.promenadeTiles) >= 6;
  const calm = (s) => !s.weather?.typhoonActive && (!s.weather?.typhoonStage || s.weather.typhoonStage === 'none')
    && !['amber', 'red', 'black'].includes(s.weather?.rainWarning);
  const dry = (s) => calm(s) && !['showers', 'heavyRain', 'windy', 'fog'].includes(s.weather?.condition)
    && Number(s.weather?.rainfallMm || 0) < 1 && Number(s.weather?.windKph || 0) < 30;
  const mild = (s) => dry(s) && Number(s.weather?.temperatureC ?? 24) >= 14 && Number(s.weather?.temperatureC ?? 24) <= 30;
  const clearView = (s) => mild(s) && ['clear', 'cool', 'hot'].includes(s.weather?.condition || 'clear') && Number(s.pollution || 0) < 40;

  const LOVERS_STORY_INTERVAL_MONTHS = 3;
  const LOVERS_STORY_MONTHLY_CHANCE = 0.25;
  const LOVERS_STORY_DEFS = Object.freeze([
    {
      id: 'ocean-park', image: 'UI/news/oceanParkMemories.webp',
      eligible: (s) => built(s, 'ocean_park') && mild(s),
      headline: text('海洋公園小王子展覽　兩個人為約會相簿添一頁', 'A Little Prince day at Ocean Park adds a page to a shared photo diary', 'オーシャンパークの星の王子さま展　二人のアルバムに新しい一枚'),
      body: text('海洋公園開幕嘅小王子主題展覽吸引情侶打卡。兩人喺玫瑰花園影低合照，笑住約定，以後每次出遊都要留返一張相。', 'An Ocean Park couple leaves the Little Prince exhibition with a rose-garden portrait and a promise: keep a photo from every day out together.', '星の王子さま展を訪れた二人は、バラ園で記念写真を撮影。これからのデートも一枚ずつ残そうと約束しました。'),
      comment: text('小王子有一朵玫瑰，佢哋有一本慢慢儲嘅相簿。', 'One rose, and an album waiting to be filled.', '一輪のバラと、これから増えていくアルバム。'),
    },
    {
      id: 'gallery', image: 'UI/news/loversGallery.webp', source: '夕陽下的香城美術館漫步.png',
      eligible: (s) => built(s, 'cultural_center'),
      headline: text('文化中心美術展成約會新去處　情侶睇畫睇到日落', 'An art exhibition turns an ordinary date into a sunset memory', '文化センターの美術展　二人で夕暮れまで絵を眺める'),
      body: text('文化中心嘅美術展迎來一對熟面口。兩人挽住手慢慢行，講唔出畫作流派，卻一致覺得玻璃窗外嘅香城夕陽，值得留低多一陣。', 'At the cultural centre art exhibition, a familiar couple takes its time. Neither can name the painting styles, but both agree the sunset through the gallery windows is worth staying for.', '文化センターの美術展に、見覚えのある二人。画風の名前は分からなくても、窓の向こうの夕日が美しいことには意見が一致しました。'),
      comment: text('識唔識睇畫唔緊要，有人肯陪你慢慢睇就夠。', 'You do not need to understand every painting to enjoy looking together.', '絵の知識より、一緒にゆっくり見る時間。'),
    },
    {
      id: 'cinema', image: 'UI/news/loversCinema.webp', source: '戲院裡的鐵人狗狗之夜.png',
      eligible: (s) => Number(s.population) >= 10000 && Number(s.commercialCount) >= 10,
      headline: text('商場戲院上映《鐵人狗狗》　兩個人分一桶爆谷笑足全場', 'Iron Dog gives a couple a cinema night and one shared bucket of popcorn', '商店街の映画館で「アイアン・ドッグ」　二人でポップコーンを分け合う'),
      body: text('商業街逐漸熱鬧，商場戲院嘅晚場亦坐滿觀眾。兩人揀咗《鐵人狗狗》，明明帶住兩杯汽水，卻為最後一粒爆谷爭到笑出聲。', 'As the shopping district grows, its cinema fills for the evening screening of Iron Dog. Two drinks are enough; the last piece of shared popcorn still starts a laughing argument.', '商店街がにぎわい、映画館の夜の回も盛況。「アイアン・ドッグ」を見た二人は、最後のポップコーンをどちらが食べるかで笑い合いました。'),
      comment: text('套戲有冇續集唔知，爆谷一定要加碼。', 'No word on a sequel, but they will need more popcorn.', '続編より先に、ポップコーンのおかわりを。'),
    },
    {
      id: 'peak', image: 'UI/news/loversPeak.webp', source: '香城_山頂夜景_獨立16比9.png',
      eligible: (s) => park(s) && Number(s.cityAttractiveness) >= 60 && clearView(s),
      headline: text('香城夜景口碑升溫　情侶山頂合照寫低「下次再嚟」', 'A clear skyline gives two visitors a Peak memory to keep', '澄んだ夜景を山頂から　二人の写真に「また来よう」'),
      body: text('公園同城市景觀漸見成果，一對情侶趁天色清朗安排山頂小旅行。華燈初上，佢哋靠住欄杆影相，喺相簿角落寫低四個字：「下次再嚟」。', 'With parks and the city skyline drawing more visitors, a couple takes a clear-weather trip to the Peak. Beside the railings at dusk, they add a note to their photograph: come back together.', '公園と街並みの魅力が増す中、二人は晴れた日に山頂へ。明かりのともる街を背に撮った写真には、「また一緒に来よう」と書き添えられました。'),
      comment: text('張相影到夜景，亦影到佢哋眼入面嘅光。', 'The skyline was not the only thing lighting up the photograph.', '写真に輝いていたのは夜景だけではありませんでした。'),
    },
    {
      id: 'beach', image: 'UI/news/loversBeach.webp', source: '愉景灣泳灘嬉水時光.png',
      eligible: (s) => waterfront(s) && Number(s.ferryRiders) > 0 && [6, 7, 8, 9].includes(Number(s.month))
        && dry(s) && Number(s.weather?.temperatureC) >= 24 && Number(s.weather?.temperatureC) <= 33,
      headline: text('夏日小輪帶住人去放假　情侶愉景灣玩水笑到濕晒', 'A summer ferry outing ends in splashes at Discovery Bay', '夏のフェリーで愉景湾へ　水しぶきと笑顔の休日'),
      body: text('客運小輪有乘客、海濱亦添咗散步空間，兩人趁夏季好天去愉景灣小旅行。原本只諗住沿沙灘行下，最後互相潑水，連影相都笑到手震。', 'With passenger ferries running and a waterfront to start from, the couple takes a fair-weather summer trip to Discovery Bay. A quiet beach walk soon becomes a splash fight and a very shaky camera.', 'フェリーの乗客が増え、海辺の散歩道も整った街から、二人は夏の愉景湾へ。静かな砂浜散歩のはずが、水を掛け合って笑う一日になりました。'),
      comment: text('今日最濕唔係天氣，係笑到擰唔乾件衫。', 'The weather stayed dry. Their clothes did not.', '雨は降らなかったのに、服はびしょぬれ。'),
    },
    {
      id: 'sai-kung', image: 'UI/news/loversSaiKung.webp', source: '西貢海濱的甜蜜嬉笑時光.png',
      eligible: (s) => waterfront(s) && Number(s.ferryRiders) > 0 && mild(s),
      headline: text('海濱周末遊受歡迎　情侶西貢散步為一口雪糕笑不停', 'A Sai Kung waterfront stroll becomes an ice-cream memory', '西貢の海辺を散歩　ひと口のアイスで笑い合う二人'),
      body: text('客運渡輪同海濱步道帶起周末出遊風氣。兩人跟住去西貢行海旁，為咗邊個食最後一口雪糕拗咗一陣，最後決定一人一半，連船班都差啲唔記得睇。', 'Ferries and waterfront walks are inspiring weekend outings. In Sai Kung, the couple debates the last mouthful of ice cream, agrees to share, and nearly forgets to check the boat timetable.', 'フェリーと海辺の散歩道で、週末のお出かけが人気に。西貢を歩いた二人は、最後のひと口のアイスを分け合い、船の時間を見るのも忘れそうになりました。'),
      comment: text('雪糕可以一人一半，張合照就一人存一張。', 'Half an ice cream each, one copy of the photograph each.', 'アイスは半分ずつ、写真は一枚ずつ。'),
    },
    {
      id: 'stanley', image: 'UI/news/loversStanley.webp', source: '赤柱海邊浪漫海鮮約會.png',
      eligible: (s) => built(s, 'murray_house') && built(s, 'seafood_restaurant') && waterfront(s) && mild(s),
      headline: text('美利樓配海鮮酒家　情侶赤柱慢食慢行儲多一頁回憶', 'Murray House and a seafood date add a Stanley page to the album', '美利楼と海鮮料理　赤柱のデートがアルバムの一ページに'),
      body: text('美利樓同海鮮酒家齊備，海濱亦有地方慢慢行。兩人以赤柱海邊作今次約會背景，一邊食海鮮一邊傾下一次去邊，離開前仲特登影低窗外嘅海。', 'Murray House, a seafood restaurant and a waterfront make a leisurely date possible. Against the Stanley seafront, the couple shares a meal, discusses the next outing and saves a photograph of the view.', '美利楼、海鮮酒家、海辺の散歩道がそろい、のんびり過ごすデートに。二人は赤柱の海を眺め、食事をしながら次の行き先を話しました。'),
      comment: text('海鮮要趁熱食，開心嘅時候要記得影低。', 'Eat while it is warm; keep a picture while it is happy.', '料理は温かいうちに、幸せな時間は写真に。'),
    },
    {
      id: 'crab-dinner', image: 'UI/news/loversCrabDinner.webp', source: '五星蟹宴浪漫之夜.png',
      eligible: (s) => built(s, 'seafood_restaurant') && built(s, 'gold_coast_hotel'),
      headline: text('酒店蟹宴多咗張雙人枱　情侶笑言豪食一晚都值得', 'A hotel crab dinner becomes a special night for two', 'ホテルのかに料理で特別な夜　二人で一度のぜいたく'),
      body: text('黃金海岸酒店同海鮮酒家為城市增添晚飯選擇。兩人儲起一筆約會預算，揀咗晚蟹宴；餐桌相影到一半，已經有人忍唔住先拆蟹腳。', 'The Gold Coast Hotel and seafood restaurants bring a special dinner within reach. The couple saves up for a crab feast, though someone starts eating before the table photograph is finished.', 'ゴールドコーストホテルと海鮮酒家が街の外食を彩ります。二人は少しずつ貯めた予算でかに料理へ。写真を撮り終える前に、もう一人がかにの脚に手を伸ばしました。'),
      comment: text('浪漫可以講慢啲，隻蟹凍咗就唔好食。', 'The romantic speech can wait. The crab cannot.', 'ロマンチックな言葉は後で。かには冷める前に。'),
    },
    {
      id: 'birthday', image: 'UI/news/loversBirthday.webp', source: '浪漫生日海濱祝福.png',
      eligible: (s) => waterfront(s) && park(s) && mild(s),
      headline: text('海濱生日小驚喜　蛋糕、氣球同一個講唔完嘅願望', 'A waterfront birthday brings cake, balloons and a shared wish', '海辺の誕生日　ケーキと風船、二人で願うこれから'),
      body: text('公園同海濱步道成為街坊慶祝小日子嘅地方。兩人帶住蛋糕同禮物坐低，等夕陽慢慢落；生日願望冇公開，只聽到有人細聲講：「以後都一齊慶祝。」', 'Parks and the promenade give residents a place for small celebrations. The couple brings cake and presents for sunset. The wish stays private, except for a whispered hope of celebrating together again.', '公園と海辺の散歩道が、小さなお祝いの場所に。ケーキと贈り物を並べた二人は夕日を待ちました。願い事は秘密。ただ、「これからも一緒に」と聞こえました。'),
      comment: text('生日唔一定要好大陣仗，有人記得就已經好暖。', 'A birthday does not need a crowd, just someone who remembers.', '大勢でなくても、覚えていてくれる人がいれば。'),
    },
    {
      id: 'gold-coast', image: 'UI/news/loversGoldCoast.webp', source: '黃金海岸星夜絮語.png',
      eligible: (s) => built(s, 'gold_coast_hotel') && waterfront(s) && [9, 10, 11, 12].includes(Number(s.month)) && clearView(s),
      headline: text('秋夜天清海風輕　情侶黃金海岸坐到星星出齊', 'A clear autumn evening becomes a Gold Coast stargazing date', '秋の晴れた夜　ゴールドコーストで星を待つ二人'),
      body: text('黃金海岸酒店附近嘅海濱迎來清爽秋夜。兩人沿海邊行到夜深，坐喺沙灘講啲冇乜大不了嘅事；相片背後寫住：「原來乜都唔做，都可以記好耐。」', 'On a clear autumn evening near the Gold Coast Hotel, the couple walks the waterfront and stays to watch the stars. On the photograph: doing nothing together can still become a lasting memory.', 'ゴールドコーストホテル近くの海辺に、澄んだ秋の夜。星を待ちながら他愛のない話をした二人は、写真に「何もしない時間も、ずっと覚えていたい」と書きました。'),
      comment: text('唔係每段回憶都有節目，有時坐低傾偈已經夠。', 'Some memories need no programme, only time to talk.', '予定のない時間も、二人なら思い出に。'),
    },
    {
      id: 'farewell', image: 'UI/news/loversFarewell.webp', source: '尖東站的最後擁抱.png', ending: true,
      eligible: (s) => Number(s.metroRiders) > 0,
      headline: text('【情侶相簿・最後一頁】尖東站一個擁抱　兩個人各自往前行', 'The last page: one final embrace at East Tsim Sha Tsui', 'アルバムの最後のページ　尖東駅で最後の抱擁'),
      body: text('由海洋公園、山頂同美術館，到泳灘、海鮮晚飯同海濱生日，同一對情侶曾經留低好多開心合照。今次喺尖東站，佢哋決定分開；列車照常開出，最後一個擁抱之後，兩個人各自往前行。舊相冇刪，回憶亦冇因為告別而變得唔重要。', 'From Ocean Park, the Peak and the gallery to beach days, shared meals and a waterfront birthday, the same couple filled an album. At East Tsim Sha Tsui they decide to part. After one last embrace, the trains keep running and each goes forward alone. The photographs stay; saying goodbye does not erase what mattered.', 'オーシャンパーク、山頂、美術館、砂浜、食事、海辺の誕生日。同じ二人が重ねてきた写真の最後は、尖東駅での別れでした。最後に抱き合い、それぞれの道へ。別れても、あの日々の大切さまで消えるわけではありません。'),
      comment: text('睇住佢哋由第一張合照行到呢度。唔問邊個錯，只祝兩個人之後都過得好。', 'We have followed them since the first photograph. No blame, just a wish that both find their way.', '最初の写真から見守ってきました。誰も責めず、二人それぞれの幸せを願います。'),
    },
  ]);

  function normalizeLoversStoryState(raw, posts = []) {
    const seen = {};
    for (const def of LOVERS_STORY_DEFS) {
      const value = raw?.seen?.[def.id];
      if (Number.isSafeInteger(value) && value >= 0) seen[def.id] = value;
      // Older saves may already contain Ocean Park (or an imported diary post).
      for (const post of Array.isArray(posts) ? posts : []) {
        if (post?.image !== def.image) continue;
        if (!Number.isSafeInteger(post.year) || !Number.isInteger(post.month) || post.month < 1 || post.month > 12) continue;
        const month = post.year * 12 + post.month - 1;
        if (Number.isSafeInteger(month) && month >= 0) seen[def.id] = Math.max(seen[def.id] ?? -1, month);
      }
    }
    return { seen };
  }

  function getEligibleLoversStories(snapshot, state) {
    if (!calm(snapshot) || state.seen.farewell !== undefined) return [];
    return LOVERS_STORY_DEFS.filter((def) => state.seen[def.id] === undefined && def.eligible(snapshot)
      && (!def.ending || LOVERS_STORY_DEFS.every((other) => other.ending || state.seen[other.id] !== undefined)));
  }

  function isLoversStoryComplete(state) {
    const { seen } = normalizeLoversStoryState(state);
    return seen.farewell !== undefined && LOVERS_STORY_DEFS.every((def) =>
      seen[def.id] !== undefined && (def.ending || seen[def.id] < seen.farewell));
  }

  function pickLoversStory(snapshot, state, monthIndex, random = Math.random) {
    if (!Number.isSafeInteger(monthIndex) || monthIndex < 0) return null;
    const last = Math.max(-Infinity, ...Object.values(state.seen));
    if (monthIndex - last < LOVERS_STORY_INTERVAL_MONTHS) return null;
    const eligible = getEligibleLoversStories(snapshot, state);
    if (!eligible.length || random() >= LOVERS_STORY_MONTHLY_CHANCE) return null;
    return eligible[Math.min(eligible.length - 1, Math.floor(random() * eligible.length))];
  }

  const api = { LOVERS_STORY_DEFS, LOVERS_STORY_INTERVAL_MONTHS, LOVERS_STORY_MONTHLY_CHANCE, normalizeLoversStoryState, getEligibleLoversStories, isLoversStoryComplete, pickLoversStory };
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
