// Tabloid-style "newspaper extra" popup for special milestone events (council built,
// stock exchange built, ...). Content is entirely rule/i18n-driven — no AI involved.

// Public-exam Chinese writing papers traditionally provide these given names
// when a candidate needs a fictional person, with surnames freely assignable.
const HKEAA_FORUM_GIVEN_NAMES = Object.freeze([
  '英秀', '一心', '幼羚', '家寶', '念慈', '思賢', '有容', '向華', '修端', '允行',
]);
const HKEAA_FORUM_SURNAMES = Object.freeze([
  '陳', '李', '黃', '張', '梁', '林', '劉', '何', '鄭', '周', '羅', '許',
]);
const forumAiCommentAttempts = new Set();
// Tracks which forum post (if any) is rendered in #newspaper-dialog right now, so a
// slower AI comment fetch that resolves after the dialog opened can still update it —
// otherwise the popup silently stays stuck showing zero AI comments.
let openForumPostId = '';

function getExamForumCitizenName(seed = '') {
  const source = String(seed);
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const value = hash >>> 0;
  return `${HKEAA_FORUM_SURNAMES[value % HKEAA_FORUM_SURNAMES.length]}${HKEAA_FORUM_GIVEN_NAMES[Math.floor(value / HKEAA_FORUM_SURNAMES.length) % HKEAA_FORUM_GIVEN_NAMES.length]}`;
}

function getForumCategoryLabel(category) {
  const keys = {
    '城市發展': 'forum.cityDevelopment',
    '城中熱話': 'forum.cityBuzz',
    '交通台': 'forum.transport',
    '吹水台': 'forum.chat',
  };
  return keys[category] ? t(keys[category]) : category;
}

function getForumAiLabel() {
  const language = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'en';
  return language === 'zhHant' ? 'AI 生成' : language === 'ja' ? 'AI生成' : 'AI generated';
}

function getForumOfficialBadgeLabel() {
  const language = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'en';
  return language === 'zhHant' ? '官方回應' : language === 'ja' ? '公式回答' : 'Official reply';
}

function renderForumComments(container, comments) {
  if (!container) return;
  container.replaceChildren(...(comments || []).map((comment) => {
    const row = document.createElement('div');
    row.className = 'forum-comment';
    const author = document.createElement('strong');
    author.textContent = comment.author || '香城街坊';
    row.appendChild(author);
    if (comment.official) {
      const officialBadge = document.createElement('span');
      officialBadge.className = 'forum-official-badge';
      officialBadge.textContent = getForumOfficialBadgeLabel();
      row.appendChild(officialBadge);
    }
    if (comment.ai) {
      const badge = document.createElement('span');
      badge.className = 'forum-ai-badge';
      badge.textContent = getForumAiLabel();
      row.appendChild(badge);
    }
    row.appendChild(document.createTextNode(comment.text));
    return row;
  }));
}

function refreshOpenForumViews(post) {
  if (!post) return;
  if (document.getElementById('forum-history-dialog')?.style.display === 'flex') {
    renderForumHistory(document.querySelector('#forum-history-nav .is-active[data-forum-filter]')?.dataset.forumFilter || 'all');
  }
  if (openForumPostId && openForumPostId === post.id && document.getElementById('newspaper-dialog')?.style.display === 'flex') {
    renderForumComments(document.getElementById('forum-comments'), post.social?.comments || []);
    const reactions = document.getElementById('forum-reactions');
    if (reactions) {
      const social = post.social || {};
      reactions.textContent = `👍 ${social.likes || 0}　😂 ${social.laughs || 0}　😡 ${social.angry || 0}　💬 ${social.commentCount || 0}　↗ ${social.shares || 0}`;
    }
  }
}

const NEWSPAPER_EVENT_DEFS = {
  council_built: {
    headlineKey: 'newspaper.council.headline',
    subheadKey: 'newspaper.council.subhead',
    bodyKeys: ['newspaper.council.body1', 'newspaper.council.body2'],
    quoteKey: 'newspaper.council.quote',
    portraitCaptionKey: 'newspaper.council.portraitCaption',
    portraitOfficialId: 'chief_executive',
  },
  stock_exchange_built: {
    headlineKey: 'newspaper.stockExchange.headline',
    subheadKey: 'newspaper.stockExchange.subhead',
    bodyKeys: ['newspaper.stockExchange.body1', 'newspaper.stockExchange.body2'],
    quoteKey: 'newspaper.stockExchange.quote',
    portraitCaptionKey: 'newspaper.stockExchange.portraitCaption',
    portraitOfficialId: 'treasury_head',
  },
};

function showNewspaperExtra(eventId, params = {}) {
  const def = NEWSPAPER_EVENT_DEFS[eventId];
  const dialog = document.getElementById('newspaper-dialog');
  if (!def || !dialog) return;
  openForumPostId = '';
  dialog.setAttribute('aria-label', t('newspaper.title'));
  const box = dialog.querySelector('.newspaper-box');
  box?.classList.remove('is-forum');
  const engagement = document.getElementById('forum-engagement');
  if (engagement) engagement.hidden = true;
  const forumImage = document.getElementById('forum-post-image');
  if (forumImage) forumImage.hidden = true;

  const cityName = city.name || getDefaultCityName();
  const textParams = { city: cityName, ...params };

  setTextContent('newspaper-masthead', t('newspaper.masthead', textParams));
  setTextContent('newspaper-ribbon', t('newspaper.ribbon.extra'));
  setTextContent('newspaper-date', `${tMonth(city.month)} ${city.year}`);
  setTextContent('newspaper-headline', t(def.headlineKey, textParams));
  setTextContent('newspaper-subhead', t(def.subheadKey, textParams));

  const body = document.getElementById('newspaper-body');
  if (body) {
    body.replaceChildren(...def.bodyKeys.map((key) => {
      const p = document.createElement('p');
      p.textContent = t(key, textParams);
      return p;
    }));
  }

  const quoteBlock = document.getElementById('newspaper-quote-block');
  const official = def.portraitOfficialId ? getCouncilOfficialDefinition(def.portraitOfficialId) : null;
  if (quoteBlock) {
    quoteBlock.hidden = !def.quoteKey;
    setTextContent('newspaper-quote', def.quoteKey ? t(def.quoteKey, textParams) : '');
    setTextContent('newspaper-quote-attribution', official ? getCouncilNewsOfficialDisplayName(official.id) : '');
  }

  const portraitWrap = document.getElementById('newspaper-portrait-wrap');
  const portraitImg = document.getElementById('newspaper-portrait');
  if (portraitWrap && portraitImg) {
    portraitWrap.hidden = !official;
    if (official) {
      portraitImg.src = official.portrait;
      portraitImg.alt = getCouncilNewsOfficialDisplayName(official.id);
      setTextContent('newspaper-portrait-caption', t(def.portraitCaptionKey, textParams));
    }
  }

  if (typeof showDialog === 'function') showDialog('newspaper-dialog');
}

function showResolutionNewspaper(article, postId = '') {
  const dialog = document.getElementById('newspaper-dialog');
  if (!dialog || !article) return;
  openForumPostId = postId || '';
  const cityName = city.name || getDefaultCityName();
  dialog.setAttribute('aria-label', `${t('forum.title')} · ${t('forum.hot')}`);
  const box = dialog.querySelector('.newspaper-box');
  box?.classList.add('is-forum');

  setTextContent('newspaper-masthead', t('forum.title'));
  setTextContent('newspaper-ribbon', `🔥 ${t('forum.hot')}`);
  setTextContent('newspaper-date', `${t('forum.cityTrending')} · ${tMonth(city.month)} ${city.year}`);
  setTextContent('newspaper-headline', article.headline || '');
  setTextContent('newspaper-subhead', article.subhead || '');
  const forumImage = document.getElementById('forum-post-image');
  if (forumImage) {
    forumImage.hidden = !article.image;
    forumImage.src = article.image || '';
    forumImage.alt = article.headline || '';
  }

  const body = document.getElementById('newspaper-body');
  if (body) {
    const paragraphs = Array.isArray(article.body) ? article.body : [article.body];
    body.replaceChildren(...paragraphs.filter(Boolean).map((text) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      return paragraph;
    }));
  }

  const speaker = article.quoteSpeakerId ? getCouncilOfficialDefinition(article.quoteSpeakerId) : null;
  const quoteBlock = document.getElementById('newspaper-quote-block');
  if (quoteBlock) {
    quoteBlock.hidden = !article.quote;
    setTextContent('newspaper-quote', article.quote || '');
    setTextContent('newspaper-quote-attribution', speaker ? getCouncilNewsOfficialDisplayName(speaker.id) : '');
  }

  const portraitWrap = document.getElementById('newspaper-portrait-wrap');
  const portraitImg = document.getElementById('newspaper-portrait');
  if (portraitWrap && portraitImg) {
    portraitWrap.hidden = !speaker;
    if (speaker) {
      portraitImg.src = speaker.portrait;
      portraitImg.alt = getCouncilNewsOfficialDisplayName(speaker.id);
      setTextContent('newspaper-portrait-caption', getCouncilNewsOfficialDisplayName(speaker.id));
    }
  }

  const engagement = document.getElementById('forum-engagement');
  const reactions = document.getElementById('forum-reactions');
  const comments = document.getElementById('forum-comments');
  if (engagement) engagement.hidden = false;
  if (reactions) {
    const social = article.social || {};
    reactions.textContent = `👍 ${social.likes || 0}　😂 ${social.laughs || 0}　😡 ${social.angry || 0}　💬 ${social.commentCount || 0}　↗ ${social.shares || 0}`;
  }
  renderForumComments(comments, article.social?.comments || []);

  if (typeof showDialog === 'function') showDialog('newspaper-dialog');
}

function addForumPost(article, metadata = {}) {
  if (!article?.headline) return null;
  if (!Array.isArray(city.forumPosts)) city.forumPosts = [];
  const id = String(metadata.id || `forum-${city.year}-${city.month}-${city.tick}-${city.forumPosts.length}`);
  const existing = city.forumPosts.find((post) => post.id === id);
  if (existing) return existing;
  const post = {
    id,
    category: metadata.category || (metadata.outcome && metadata.outcome !== 'success' ? '城中熱話' : '城市發展'),
    headline: article.headline,
    image: /^UI\/News\/[a-zA-Z0-9_.-]+\.png$/.test(String(article.image || metadata.image || '')) ? String(article.image || metadata.image) : '',
    body: (Array.isArray(article.body) ? article.body : [article.body]).filter(Boolean),
    author: metadata.author || (article.quoteSpeakerId ? getCouncilNewsOfficialDisplayName(article.quoteSpeakerId) : '香城街坊'),
    officialId: article.quoteSpeakerId || '',
    date: metadata.date || `${tMonth(metadata.month || city.month)} ${metadata.year || city.year}`,
    year: Number(metadata.year) || city.year,
    month: Number(metadata.month) || city.month,
    outcome: metadata.outcome || '',
    resolutionId: metadata.resolutionId || '',
    resolutionMonthIndex: Number.isFinite(Number(metadata.resolutionMonthIndex)) ? Number(metadata.resolutionMonthIndex) : -1,
    source: article.source === 'ai' ? 'ai' : 'local',
    social: article.social || {},
    aiCommentsStatus: '',
  };
  city.forumPosts.push(post);
  city.forumPosts = city.forumPosts.slice(-60);
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof window !== 'undefined') window.setTimeout(() => requestForumAiComments(post), 0);
  return post;
}

async function requestForumAiComments(post) {
  if (!post || post.aiCommentsStatus === 'complete' || forumAiCommentAttempts.has(post.id)) return false;
  if (typeof aiNewsRuntime === 'undefined' || !aiNewsRuntime.initialized
    || !aiNewsRuntime.status?.available || !getSelectedAiModel()) return false;
  forumAiCommentAttempts.add(post.id);
  try {
    const officials = getForumNamedOfficials();
    const response = await fetch('/api/ai-news/generate', {
      method: 'POST',
      priority: 'high',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: getAiNewsProvider(), model: getSelectedAiModel(),
        language: getCurrentLanguage(), storyKind: 'forum_comments',
        facts: {
          headline: post.headline,
          body: post.body,
          officialNames: officials.map((official) => official.name).slice(0, 3),
        },
      }),
    });
    const result = await response.json();
    const citizenComments = Array.isArray(result.citizenComments) ? result.citizenComments : [];
    const officialComments = Array.isArray(result.officialComments) ? result.officialComments : [];
    if (!response.ok || (citizenComments.length < 1 && officialComments.length < 1)) {
      forumAiCommentAttempts.delete(post.id);
      return false;
    }
    const newComments = [
      ...citizenComments.slice(0, 3).map((text, index) => ({
        author: getExamForumCitizenName(`${post.id}:ai:${index}`),
        text: String(text).slice(0, 180),
        ai: true,
      })),
      ...officialComments.slice(0, 2).map((entry) => {
        const official = officials.find((item) => item.name === entry?.officialName);
        return official ? {
          author: official.name,
          officialId: official.id,
          text: String(entry.text || '').slice(0, 180),
          ai: true,
          official: true,
        } : null;
      }).filter(Boolean),
    ];
    if (!newComments.length) {
      forumAiCommentAttempts.delete(post.id);
      return false;
    }
    if (!post.social || typeof post.social !== 'object') post.social = {};
    if (!Array.isArray(post.social.comments)) post.social.comments = [];
    post.social.comments = [...post.social.comments, ...newComments].slice(-8);
    post.aiCommentsStatus = 'complete';
    if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
    refreshOpenForumViews(post);
    return true;
  } catch (error) {
    forumAiCommentAttempts.delete(post.id);
    console.warn('[Forum AI comments]', error.message);
    return false;
  }
}

async function hydrateRecentForumAiComments() {
  // Newest first: if generation is slow or a post never gets picked up, it should be
  // an old thread nobody's looking at anymore, not the one just posted.
  const pending = (city.forumPosts || []).filter((post) => post.aiCommentsStatus !== 'complete').reverse();
  for (const post of pending) await requestForumAiComments(post);
}

function getForumDateFromMonthIndex(monthIndex) {
  const numeric = Number(monthIndex);
  if (!Number.isFinite(numeric) || numeric < 0) return { year: city.year, month: city.month };
  return { year: Math.floor(numeric / 12), month: (Math.floor(numeric) % 12) + 1 };
}

function syncResolutionHistoryToForum() {
  const history = city.council?.resolutionHistory;
  if (!Array.isArray(history)) return 0;
  let added = 0;
  history.forEach((record, index) => {
    if (!record?.resolutionId || !record.outcome && !record.summary?.outcome) return;
    // A newly approved three-month resolution already knows its eventual
    // deterministic result internally, but must not leak it into the forum
    // before the scheduled report month.
    if (record.reportDueMonthIndex != null && record.reportAnnounced !== true) return;
    const resultMonthIndex = Number(record.completedMonthIndex ?? record.reportDueMonthIndex ?? record.approvedMonthIndex);
    const existing = (city.forumPosts || []).find((post) =>
      post.id === record.forumPostId
      || (post.resolutionId === record.resolutionId && Number(post.resolutionMonthIndex) === resultMonthIndex));
    if (existing) {
      record.forumPostId = existing.id;
      return;
    }
    const outcome = record.summary?.outcome || record.outcome;
    const extra = record.summary
      ? { ...record.summary }
      : { refundCost: Number(record.refundCost) || 0 };
    let article = record.newspaper;
    if (!article && typeof buildCouncilResolutionNewsEvent === 'function' && typeof buildLocalResolutionArticle === 'function') {
      const event = buildCouncilResolutionNewsEvent(record.resolutionId, outcome, extra);
      if (event) article = buildLocalResolutionArticle(event);
    }
    if (!article?.headline) return;
    const date = getForumDateFromMonthIndex(resultMonthIndex);
    const post = addForumPost(article, {
      id: `resolution-history-${record.resolutionId}-${resultMonthIndex}-${index}`,
      category: outcome === 'success' ? '城市發展' : '城中熱話',
      outcome,
      resolutionId: record.resolutionId,
      resolutionMonthIndex: resultMonthIndex,
      year: date.year,
      month: date.month,
    });
    if (post) {
      record.forumPostId = post.id;
      added++;
    }
  });
  return added;
}

function getForumNamedOfficials() {
  const renamed = Object.keys(city.council?.customNames || {});
  const ids = [...renamed, ...(typeof COUNCIL_OFFICIAL_IDS !== 'undefined' ? COUNCIL_OFFICIAL_IDS : [])];
  return [...new Set(ids)].map((id) => ({ id, name: getCouncilNewsOfficialDisplayName(id) })).filter((item) => item.name);
}

function localizeForumTopicJapanese(topic, context) {
  const { chief, treasury, police, observatory, business, tourism, religion, official, cityName, pollution, crime, unemployment, net, higherEdu } = context;
  const stories = {
    'UI/News/sideNewsNewYearEvent.png': [`${business}、新春写真でセンター争い　獅子舞に議員が倒される`, `記念撮影は大混乱。掲示板では「政策より立ち位置が重要なのか」との声が相次いだ。`, '結局、一番きれいに写ったのは獅子だった。'],
    'UI/News/northPolePenguin.png': [`${tourism}、北極ペンギン保護区を実現`, '観光の新名所として期待される一方、交通費と運営費を心配する声も出ている。', '北極まで2ドル優待は使えますか。'],
    'UI/News/busSeatBeltAct.png': ['バスのシートベルトが外れず消防隊出動', `着席客だけ固定され、立っている客はそのままなのかと市民が疑問視。${police}は運用を検討するとした。`, '安全すぎて消防士がいないと降りられない。'],
    'UI/News/elderyCitizenBusFareSubsidary.png': ['高齢者、2ドル運賃でゲームジム巡り　財政当局は渋い顔', `高齢者は行動範囲が広がったと歓迎。${treasury}は利用増による公費負担を注視している。`, '2ドルで終点まで行けるなら、ゲーム課金より安い。'],
    'UI/News/chiefPoliceActingInFlim.png': [`${police}、政策PRに警察映画の前日譚を提案`, '掲示板では、改名されたどの政府高官が潜入捜査官役に向くかで盛り上がっている。', '公費で三部作だけはやめてほしい。'],
    'UI/News/fatherWithPrisoner.png': [`${religion}、更生支援で受刑者とゲーム`, 'ゲームを通じてストレスを減らし、信頼関係と再出発を支える取り組みとして好意的な反応が集まった。', 'ゲームに再挑戦があるなら、人生にもあっていい。'],
    'UI/News/academicUniversityRank.png': [`${chief}「香城大学は世界トップ100を維持」`, `高等教育指数は${higherEdu}。順位が雇用増につながるか学生と市民が議論している。`, '順位が上がっても学食の値段は上げないで。'],
    'UI/News/tooHotToShutDownAitCond.png': [`35°Cでも冷房拒否　${observatory}「扇風機で十分」`, '省エネの実演が暑さ我慢大会になっていないか、掲示板で疑問の声が上がった。', 'その扇風機を文化財に指定してほしい。'],
    'UI/News/typhoon.png': ['台風襲来、市民がカラオケ店に避難', `娯楽施設が臨時避難所のようになり、${observatory}は危険な外出を控えるよう呼びかけた。`, '外の風より店内の歌声の方が大きい。'],
    'UI/News/rainstorm.png': ['「大雨なのに黒色警報は退勤直前」市民が苦情', `交通が混乱し、警報のタイミングを巡って${observatory}への書き込みが殺到した。`, '出勤後に赤、退勤一秒前に黒。'],
    'UI/News/rainstorm02.png': ['豪雨で冠水、配車アプリにゴムボート項目', '道路冠水を受け、ボートの変動料金はタクシーより強気だと話題になった。', '運転手いわく、行き先は埠頭限定。'],
    'UI/News/sideNewsFreeIceCream.png': ['商業施設の無料アイスが品切れ　行列客が激怒', '配布開始直後に在庫が尽き、利用者は並んだ時間の損失を計算し始めた。', '一番冷たかったのは店員の視線。'],
    'UI/News/sideNewsSinger.png': ['往年の歌手、タクシー降車場所で口論　車載映像が拡散', '映像は急速に拡散。会話を一秒ずつ分析する一方、個人情報への配慮を求める声も出た。', '新曲より多くの人に聞かれてしまった。'],
    'UI/News/nightDroneShowSucceed.png': [`${business}「幻彩 fing 香城を365日開催すべき」`, `${observatory}は騒音、電気代、飛行経路を巡る議論に対し、毎日の飛行許可は約束しなかった。`, '毎日光る前に、隣の街へ飛ばないようにして。'],
    'UI/News/touringEverywhere.png': [`${chief}の「どこでも観光」、団地屋上の干し物まで観光地に`, '住民の日常が撮影対象となり、近隣住民はツアーの制限を求めている。', '干している物は住民のもの。観光地指定は誰のもの？'],
  };
  const translated = stories[topic.image];
  if (translated) return { ...topic, headline: translated[0], body: translated[1], comment: translated[2] };
  if (topic.category === '交通台') return { ...topic, headline: `${cityName}の渋滞、車内で夕食を始める市民も`, body: `交通混雑が続き、利用者は${official.name}に現地視察を求めている。`, comment: '今月は車より自分の足の方が長く走った。' };
  if (topic.category === '環境台') return { ...topic, headline: `灰色の空は天気か汚染フィルターか`, body: `汚染指数は${Math.round(pollution)}。${official.name}が最もタグ付けされた高官となった。`, comment: '写真にレトロ加工が要らなくなった。' };
  if (topic.category === '治安台') return { ...topic, headline: `市民作成の犯罪マップが拡散　${official.name}に投稿殺到`, body: `犯罪リスク${Math.round(crime * 100)}%を受け、巡回計画の公開を求める声が出ている。`, comment: '公式発表より地図の更新が速い。' };
  if (topic.category === '返工台') return { ...topic, headline: `求人スレッド急増　失業率${(unemployment * 100).toFixed(1)}%`, body: `${official.name}に雇用対策を求める投稿が相次いだ。`, comment: '仕事は見つからないが求人投稿は暗記した。' };
  if (topic.category === '財經台') return { ...topic, headline: `市の赤字を受け、${official.name}向け節約攻略スレ`, body: `今月の収支は$${Math.round(net).toLocaleString()}。まずドローン購入を止めようとの声も。`, comment: '第一歩は、妙な大型イベントを増やさないこと。' };
  return { ...topic, headline: `${cityName}人口${Number(city.population || 0).toLocaleString()}、人気茶餐廳を議論`, body: `${official.name}もタグ付けされ、都市データはミルクティーの甘さより重要だと回答した。`, comment: '返信は来たが、結局どの店が一番か答えていない。' };
}

function generateMonthlyForumPost(monthIndex = getCityMonthIndex()) {
  if (!city || Number(city.lastForumMonthIndex) >= monthIndex) return null;
  city.lastForumMonthIndex = monthIndex;
  const language = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'en';
  const zh = language === 'zhHant';
  const officials = getForumNamedOfficials();
  const renamedIds = new Set(Object.keys(city.council?.customNames || {}));
  const renamedOfficials = officials.filter((item) => renamedIds.has(item.id));
  const preferredOfficials = renamedOfficials.length ? renamedOfficials : officials;
  const official = preferredOfficials[Math.abs(monthIndex) % Math.max(1, preferredOfficials.length)] || { id: '', name: zh ? '市政府發言人' : 'City spokesperson' };
  const secondOfficial = preferredOfficials.find((item) => item.id !== official.id)
    || officials.find((item) => item.id !== official.id)
    || official;
  const cityName = city.name || getDefaultCityName();
  const traffic = Number(city.trafficIndex) || 0;
  const crime = Number(city.crimeRateIndex) || 0;
  const pollution = Number(city.pollution) || 0;
  const happiness = Number(city.happiness) || 0;
  const unemployment = Number(city.unemploymentRate) || 0;
  const net = Number(city.monthlyIncome || 0) - Number(city.monthlyExpenses || 0);
  const topics = [];
  const policyActive = (id) => typeof isPolicyActive === 'function' ? isPolicyActive(id) : city.activePolicies?.[id] === true;
  const officialName = (id, fallback) => {
    const found = officials.find((item) => item.id === id);
    return found?.name || fallback;
  };
  const chief = officialName('chief_executive', zh ? '行政長官' : 'Chief Executive');
  const treasury = officialName('treasury_head', zh ? '財政司司長' : 'Financial Secretary');
  const police = officialName('police_head', zh ? '警務署署長' : 'Police Chief');
  const observatory = officialName('observatory_head', zh ? '天文台台長' : 'Observatory Director');
  const business = officialName('councillor_business', zh ? '商界議員' : 'Business Councillor');
  const tourism = officialName('councillor_tourism', zh ? '旅遊界議員' : 'Tourism Councillor');
  const religion = officialName('councillor_religion', zh ? '宗教界議員' : 'Religious Councillor');
  const culture = officialName('culture_head', zh ? '康文署署長' : 'Culture Director');
  const forumStory = (category, headline, body, comment, image) => ({ category, headline, body, comment, image });

  if ([1, 2].includes(city.month)) topics.push(forumStory('城中熱話',
    zh ? `${business}賀歲合照再爭C位　旗袍議員被舞麒麟師傅意外撞跌` : `${business} battles for centre stage as councillor is knocked over by a dancing lion`,
    zh ? `賀歲活動合照期間場面混亂，${business}被網民追問爭位是否比城市政策更重要。` : `A chaotic Lunar New Year photo has users asking whether positioning mattered more than policy.`,
    zh ? '張相最清楚嗰個，始終係隻麒麟。' : 'The lion was still the clearest subject in the photo.', 'UI/News/sideNewsNewYearEvent.png'));
  if (policyActive('arcticPenguinReserve')) topics.push(forumStory('城市發展',
    zh ? `${tourism}成功爭取北極企鵝保育區　網民先問企鵝點樣返工` : `${tourism} secures an Arctic penguin reserve`,
    zh ? `保育區被形容為旅遊新亮點，預計提升城市吸引力，但交通與營運成本亦受到關注。` : `The reserve may boost tourism, though users are debating transport and operating costs.`,
    zh ? '北極有冇地鐵站？企鵝有冇兩蚊優惠？' : 'Does the Arctic have a metro station?', 'UI/News/northPolePenguin.png'));
  if (policyActive('busSeatbeltMandate')) topics.push(forumStory('交通台',
    zh ? '巴士乘客被安全帶卡住　消防員到場解困' : 'Bus passenger trapped by mandatory seat belt; firefighters called',
    zh ? `市民質疑座位乘客被綁實，但企位乘客反而沒有保障；${police}表示會研究執行情況。` : `Users question why seated passengers are restrained while standing passengers remain unprotected; ${police} promised a review.`,
    zh ? '安全到要消防員先可以落車。' : 'So safe that firefighters are needed to get off.', 'UI/News/busSeatBeltAct.png'));
  if (policyActive('elderlyTwoDollarFare')) topics.push(forumStory('交通台',
    zh ? '長者兩蚊搭巴士出門打口袋怪物　財政司睇住開支眉頭緊皺' : 'Elderly riders use $2 fare to tour game arenas as treasury watches costs',
    zh ? `長者表示優惠令生活圈大增，${treasury}則提醒乘車量上升會增加公共開支。` : `Older residents say the fare expanded their social lives, while ${treasury} warned of rising costs.`,
    zh ? '兩蚊由屋企打到總站，抵過買道具。' : 'Two dollars from home to the final arena.', 'UI/News/elderyCitizenBusFareSubsidary.png'));
  if (policyActive('publicSafety') && crime < 0.28) topics.push(forumStory('城中熱話',
    zh ? `${police}建議官員開拍警匪片《無X道前傳》宣傳施政` : `${police} proposes a crime-film prequel to promote government policy`,
    zh ? `構思被指將政府宣傳娛樂化，網民開始競猜哪位改名官員適合飾演臥底。` : `The proposal has users casting renamed officials as undercover officers.`,
    zh ? '最緊要唔好用公帑拍足三部曲。' : 'Just do not fund an entire trilogy.', 'UI/News/chiefPoliceActingInFlim.png'));
  if (policyActive('publicSafety') && religion && Math.abs(monthIndex) % 4 === 0) topics.push(forumStory('開心些牙',
    zh ? `${religion}陪伴更新人士打機　讓在囚人士輕鬆度日` : `${religion} plays video games with inmates in rehabilitation programme`,
    zh ? `計劃以遊戲協助減壓、建立關係及重整生活，部分網民大讚有人情味。` : `The programme uses games to reduce stress, build trust and support rehabilitation.`,
    zh ? '打機可以重來，人生都應該有再開一局嘅機會。' : 'Games allow restarts; people deserve another round too.', 'UI/News/fatherWithPrisoner.png'));
  if ((Number(city.educationHigherIndex) || 0) >= 0.72 && city.population >= 50000) topics.push(forumStory('城市發展',
    zh ? `${chief}指香城大學繼續榮登全球100大　投資教育有很好回報` : `${chief} says university remains in global top 100`,
    zh ? `高等教育指數升至 ${Math.round((Number(city.educationHigherIndex) || 0) * 100)}，學生與網民討論排名能否轉化成更多職位。` : `Higher education reached ${Math.round((Number(city.educationHigherIndex) || 0) * 100)}, prompting debate over jobs.`,
    zh ? '排名有升，canteen飯價可唔可以唔升？' : 'Can the ranking rise without canteen prices rising?', 'UI/News/academicUniversityRank.png'));
  if ((Number(city.weather?.temperatureC) || 0) >= 35) topics.push(forumStory('城中熱話',
    zh ? `35°C仍拒開冷氣　${observatory}：風扇好夠` : `At 35°C, ${observatory} still says a fan is enough`,
    zh ? `天文台辦公室錄得高溫，網民質疑節能示範是否已變成耐熱挑戰。` : `Users question whether an energy-saving example has become a heat endurance test.`,
    zh ? '建議將個風扇列入文化遺產。' : 'Please list that fan as cultural heritage.', 'UI/News/tooHotToShutDownAitCond.png'));
  if (['signal8', 'signal9', 'signal10'].includes(city.weather?.typhoonStage)) topics.push(forumStory('城中熱話',
    zh ? '颱風襲香城　市民紛紛躲到KTV暫避' : 'Residents shelter from typhoon in karaoke lounges',
    zh ? `風球生效期間，多區娛樂場所被市民當成臨時避風站，${observatory}提醒切勿冒險外出。` : `Karaoke lounges became improvised shelters as ${observatory} warned residents to stay safe.`,
    zh ? '出面風聲大，入面唱歌聲更大。' : 'The singing inside was louder than the wind outside.', 'UI/News/typhoon.png'));
  if (['red', 'black'].includes(city.weather?.rainWarning)) topics.push(forumStory('城中熱話',
    zh ? '市民投訴落雨咁大又唔掛黑雨　放工先嚟黑雨' : 'Residents ask why black rain warning arrived only after work',
    zh ? `暴雨期間交通受阻，討論區大量留言追問警告時間，${observatory}成為最多人點名官員。` : `Transport was disrupted as users questioned warning timing and tagged ${observatory}.`,
    zh ? '返到公司先紅雨，收工前一秒先黑雨。' : 'Red at the office, black one second before going home.', 'UI/News/rainstorm.png'));
  if (city.weather?.rainWarning === 'black' && Number(city.weather?.rainfallMm) >= 80) topics.push(forumStory('交通台',
    zh ? '香城暴雨水浸　市民發現call車app多了橡皮艇選項' : 'Ride-hailing app adds inflatable-boat option during flooding',
    zh ? `多區道路受水浸影響，網民笑稱橡皮艇動態收費比的士更進取。` : `Flooded roads prompted jokes that surge-priced boats now cost more than taxis.`,
    zh ? '司機話目的地只可以揀碼頭。' : 'The driver says destinations are limited to piers.', 'UI/News/rainstorm02.png'));
  if ([6, 7, 8, 9].includes(city.month) && Math.abs(monthIndex) % 3 === 0) topics.push(forumStory('吹水台',
    zh ? '商場promote雪糕派曬　排隊市民怒懟工作人員' : 'Shopping-centre ice cream giveaway runs out; queue turns angry',
    zh ? `免費雪糕在宣傳時段開始不久便派完，商場解釋數量有限，網民則開始計算排隊時間成本。` : `The free ice cream ran out early, prompting users to calculate the cost of queueing.`,
    zh ? '最凍唔係雪糕，係工作人員個眼神。' : 'The coldest thing was the staff member’s stare.', 'UI/News/sideNewsFreeIceCream.png'));
  if (Math.abs(monthIndex) % 7 === 0) topics.push(forumStory('吹水台',
    zh ? '過氣知名歌星搭的士爭落車地點　粗口對話被車cam全程錄影' : 'Former pop star’s taxi argument captured on dashcam',
    zh ? `片段上載後迅速流傳，網民逐秒分析雙方語氣，亦有人提醒不要公開乘客個人資料。` : `The clip went viral as users analysed every second while warning against exposing personal data.`,
    zh ? '成首新歌都冇呢段錄音咁多人聽。' : 'More people heard this than the singer’s latest song.', 'UI/News/sideNewsSinger.png'));
  if ((city.council?.activePrograms || []).some((program) => program.resolutionId === 'fantasyFingHeungShing')) topics.push(forumStory('城中熱話',
    zh ? `${business}要求《幻彩 fing 香城》全年365日上演　稱：「成功城市就要日日閃。」` : `${business} demands Fantasy fing Heung Shing run 365 days a year`,
    zh ? `建議在討論區引發噪音、電費及無人機航道爭議，${observatory}未有承諾每日批准飛行。` : `The proposal sparked debate over noise, power costs and flight paths; ${observatory} made no daily-flight commitment.`,
    zh ? '日日閃之前，可唔可以先確保唔好飛去隔離城？' : 'Before flashing daily, can we keep the drones in our own city?', 'UI/News/nightDroneShowSucceed.png'));
  if ((city.temporaryEffects || []).some((effect) => effect.sourceId === 'tourEverywhere')) topics.push(forumStory('城中熱話',
    zh ? `${chief}落實「無處不旅遊」　自由行到公屋天台參觀阿婆曬果皮被指擾民` : `${chief} sends tourists to public-housing rooftop under Tour Everywhere campaign`,
    zh ? `旅客把居民日常生活當成景點拍攝，文化部門呼籲尊重私人空間，附近街坊要求限制旅行團。` : `Residents objected after visitors treated daily rooftop life as an attraction.`,
    zh ? '果皮係阿婆嘅，景點係邊個批嘅？' : 'The peels belong to grandma—who approved the attraction?', 'UI/News/touringEverywhere.png'));
  if (traffic >= 0.62) topics.push({
    category: '交通台',
    headline: zh ? `${cityName}塞車塞到市民開始在車上食晚飯` : `${cityName} commuters begin eating dinner in traffic`,
    body: zh ? `繁忙時間交通指數持續高企，網民要求${official.name}親身乘車測試道路。` : `Rush-hour congestion remains high, and users want ${official.name} to test the roads in person.`,
    comment: zh ? '我架車今個月行得仲少過我對腳。' : 'My car travelled less than my feet this month.',
  });
  if (pollution >= 65) topics.push({
    category: '環境台',
    headline: zh ? `香城天空今日係灰色，網民問係天氣定污染濾鏡` : 'Residents ask whether the grey sky is weather or a pollution filter',
    body: zh ? `污染指數升至 ${Math.round(pollution)}，${official.name}成為討論區最多人 tag 的官員。` : `Pollution reached ${Math.round(pollution)}, making ${official.name} the forum's most-tagged official.`,
    comment: zh ? '影相已經唔使再加復古濾鏡。' : 'Photos no longer need a vintage filter.',
  });
  if (crime >= 0.38) topics.push({
    category: '治安台',
    headline: zh ? `街坊自製罪案地圖爆紅　${official.name}被瘋狂點名` : `Resident-made crime map goes viral as ${official.name} is repeatedly tagged`,
    body: zh ? `市民在香城討論區交換治安情報，要求政府公開巡邏安排。` : 'Forum users are exchanging safety reports and asking the government to publish patrol plans.',
    comment: zh ? '個地圖更新得快過官方公告。' : 'The map updates faster than official notices.',
  });
  if (unemployment >= 0.12) topics.push({
    category: '返工台',
    headline: zh ? `求職帖逼爆香城討論區　網民叫${official.name}落區請人` : `Job-search threads flood the forum as users call on ${official.name}`,
    body: zh ? `失業率升至 ${(unemployment * 100).toFixed(1)}%，商業及工業職位成為熱門討論。` : `Unemployment reached ${(unemployment * 100).toFixed(1)}%, putting commercial and industrial jobs in focus.`,
    comment: zh ? '份工未搵到，求職帖已經識背。' : 'No job yet, but I know every recruitment post by heart.',
  });
  if (net < 0) topics.push({
    category: '財經台',
    headline: zh ? `市府月月赤字　網民幫${official.name}開慳錢攻略帖` : `Forum opens a money-saving guide for ${official.name} amid city deficit`,
    body: zh ? `本月收支差額為 $${Math.round(net).toLocaleString()}，有人建議先停止購買無人機。` : `The monthly balance is $${Math.round(net).toLocaleString()}, prompting calls to stop buying drones.`,
    comment: zh ? '第一步：唔好再批奇怪大型活動。' : 'Step one: stop approving strange mega-events.',
  });
  if (happiness >= 0.78) topics.push({
    category: '開心些牙',
    headline: zh ? `${cityName}幸福度高企　街坊爭論係公園定低稅率功勞` : `${cityName} debates whether parks or low taxes deserve credit for high happiness`,
    body: zh ? `${official.name}表示歡迎市民繼續在討論區提供「有建設性又好笑」的意見。` : `${official.name} welcomed more “constructive and funny” suggestions from residents.`,
    comment: zh ? '最開心係今個月冇新奇怪議案。' : 'Best part: no strange new resolution this month.',
  });
  topics.push({
    category: '吹水台',
    headline: zh ? `${cityName}人口突破 ${Number(city.population || 0).toLocaleString()}　網民研究邊區茶餐廳最多` : `${cityName} reaches ${Number(city.population || 0).toLocaleString()} residents as users rank local cafés`,
    body: zh ? `${official.name}意外在帖文被 tag，回應指城市發展數據比奶茶甜度更值得關注。` : `${official.name} was unexpectedly tagged and said city data mattered more than drink sweetness.`,
    comment: zh ? '官員識回帖，但係未答邊間最好食。' : 'The official replied but still did not name the best café.',
  });
  const recentImages = new Set((city.forumPosts || []).slice(-12).map((post) => post.image).filter(Boolean));
  const freshImageTopics = topics.filter((candidate) => candidate.image && !recentImages.has(candidate.image));
  const candidateTopics = freshImageTopics.length ? freshImageTopics : topics;
  let topic = candidateTopics[Math.abs(monthIndex) % candidateTopics.length];
  if (language === 'ja') {
    topic = localizeForumTopicJapanese(topic, {
      chief, treasury, police, observatory, business, tourism, religion, culture,
      official, cityName, pollution, crime, unemployment, net,
      higherEdu: Math.round((Number(city.educationHigherIndex) || 0) * 100),
    });
  }
  const scale = 120 + (Math.abs(monthIndex * 97) % 1800);
  return addForumPost({
    headline: topic.headline,
    image: topic.image || '',
    body: [
      topic.body,
      language === 'zhHant'
        ? `${secondOfficial.name}回應指會「密切留意」，網民笑稱香城最穩定的公共服務，可能就是密切留意本身。`
        : language === 'ja'
          ? `${secondOfficial.name}は「注意深く見守る」と回答。掲示板では、香城で最も安定した公共サービスは「見守ること」そのものだと皮肉られた。`
          : `${secondOfficial.name} said the situation would be “closely monitored”; users joked that close monitoring may be the city’s most reliable public service.`,
    ],
    quoteSpeakerId: official.id,
    source: 'local',
    social: {
      likes: Math.round(scale * 1.1).toLocaleString(), laughs: Math.round(scale * 0.8).toLocaleString(),
      angry: Math.round(scale * 0.18).toLocaleString(), commentCount: Math.round(scale * 0.54).toLocaleString(),
      shares: Math.round(scale * 0.32).toLocaleString(),
      comments: [
        { author: getExamForumCitizenName(`${monthIndex}:resident`), text: topic.comment },
        { author: official.name, text: zh ? '已收到大家意見，相關部門會認真研究。' : language === 'ja' ? '皆さんの意見は受け取りました。担当部門で検討します。' : 'Your views have been noted for departmental review.' },
        { author: secondOfficial.name, text: zh ? '研究完成前會先成立小組研究點樣研究。' : language === 'ja' ? '検討開始前に、検討方法を検討する会議体を設置します。' : 'Before the review is complete, a group will study how the review should be studied.' },
      ],
    },
  }, { id: `monthly-forum-${monthIndex}`, category: topic.category, author: zh ? '香城熱話台' : language === 'ja' ? '香城トレンド' : 'Heung Shing Trending' });
}

function renderForumHistory(filter = 'all') {
  const list = document.getElementById('forum-history-list');
  const empty = document.getElementById('forum-history-empty');
  if (!list || !empty) return;
  const allPosts = (city.forumPosts || []).slice().reverse();
  const openPostIds = new Set([...list.querySelectorAll('.forum-thread[open][data-post-id]')].map((thread) => thread.dataset.postId));
  const posts = filter === 'all' ? allPosts : allPosts.filter((post) => post.category === filter);
  const nav = document.getElementById('forum-history-nav');
  nav?.querySelectorAll('[data-forum-filter]').forEach((button) => {
    const buttonFilter = button.dataset.forumFilter;
    const count = buttonFilter === 'all' ? allPosts.length : allPosts.filter((post) => post.category === buttonFilter).length;
    button.classList.toggle('is-active', buttonFilter === filter);
    button.setAttribute('aria-pressed', String(buttonFilter === filter));
    let countNode = button.querySelector('.forum-filter-count');
    if (!countNode) {
      countNode = document.createElement('span');
      countNode.className = 'forum-filter-count';
      button.appendChild(countNode);
    }
    countNode.textContent = `(${count})`;
  });
  empty.hidden = posts.length > 0;
  empty.textContent = filter === 'all'
    ? t('forum.empty')
    : t('forum.emptyCategory', { category: getForumCategoryLabel(filter) });
  list.replaceChildren(...posts.map((post) => {
    const thread = document.createElement('details');
    thread.className = 'forum-thread';
    thread.dataset.postId = post.id;
    thread.open = openPostIds.has(post.id);
    const summary = document.createElement('summary');
    if (post.image) summary.classList.add('has-image');
    const category = document.createElement('span'); category.className = 'forum-thread-category'; category.textContent = getForumCategoryLabel(post.category);
    const title = document.createElement('span'); title.className = 'forum-thread-title'; title.textContent = post.headline;
    const stats = document.createElement('span'); stats.className = 'forum-thread-stats'; stats.textContent = `💬 ${post.social?.commentCount || 0}　👁 ${post.social?.shares || 0}`;
    const meta = document.createElement('span'); meta.className = 'forum-thread-meta'; meta.textContent = `${post.author} · ${post.date}`;
    summary.appendChild(category);
    if (post.image) {
      const thumbnail = document.createElement('img');
      thumbnail.className = 'forum-thread-thumb';
      thumbnail.src = post.image;
      thumbnail.alt = '';
      thumbnail.loading = 'lazy';
      summary.appendChild(thumbnail);
    }
    summary.append(title, stats, meta);
    const content = document.createElement('div'); content.className = 'forum-thread-content';
    if (post.image) {
      const image = document.createElement('img');
      image.className = 'forum-thread-image';
      image.src = post.image;
      image.alt = post.headline;
      image.loading = 'lazy';
      content.appendChild(image);
    }
    (post.body || []).forEach((text) => { const p = document.createElement('p'); p.textContent = text; content.appendChild(p); });
    const reaction = document.createElement('div'); reaction.className = 'forum-reactions'; reaction.textContent = `👍 ${post.social?.likes || 0}　😂 ${post.social?.laughs || 0}　😡 ${post.social?.angry || 0}　↗ ${post.social?.shares || 0}`; content.appendChild(reaction);
    const commentsWrap = document.createElement('div'); commentsWrap.className = 'forum-comments';
    renderForumComments(commentsWrap, post.social?.comments || []);
    content.appendChild(commentsWrap);
    thread.append(summary, content);
    return thread;
  }));
}

function openForumHistory() {
  syncResolutionHistoryToForum();
  hydrateRecentForumAiComments();
  const nav = document.getElementById('forum-history-nav');
  if (nav && nav.dataset.ready !== 'true') {
    nav.dataset.ready = 'true';
    nav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-forum-filter]');
      if (!button) return;
      renderForumHistory(button.dataset.forumFilter || 'all');
    });
  }
  const activeFilter = nav?.querySelector('.is-active[data-forum-filter]')?.dataset.forumFilter || 'all';
  renderForumHistory(activeFilter);
  if (typeof showDialog === 'function') showDialog('forum-history-dialog');
}

function announceCouncilBuiltNewspaper() {
  showNewspaperExtra('council_built', { population: (city.population || 0).toLocaleString() });
}

function announceStockExchangeBuiltNewspaper() {
  const hsi = Math.round(Number(city.stockMarket?.hsi ?? HSI_BASE_LEVEL));
  showNewspaperExtra('stock_exchange_built', { hsi: hsi.toLocaleString() });
}
