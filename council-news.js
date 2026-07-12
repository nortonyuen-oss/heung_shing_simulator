// Bridges council policy actions to the news feed. Rule-based facts and headlines are always
// authoritative (see docs/council-phase1-2-design.md §13.1); AI only rewords the same facts.

function getCouncilNewsCharacterIds(policyId) {
  const metadata = COUNCIL_POLICY_METADATA[policyId];
  return metadata ? metadata.leadOfficialIds.slice(0, 2) : [];
}

function getCouncilNewsOfficialDisplayName(officialId) {
  const official = getCouncilOfficialDefinition(officialId);
  if (!official) return officialId;
  return typeof getCouncilOfficialDisplayName === 'function'
    ? getCouncilOfficialDisplayName(official)
    : t(official.nameKey);
}

function buildCouncilPolicyNewsEvent(policyId, action) {
  const policy = getCouncilPolicyDefinition(policyId);
  if (!policy) return null;
  const characterIds = getCouncilNewsCharacterIds(policyId);
  const quoteSpeakerId = characterIds[0] || null;
  const advisorOpinion = quoteSpeakerId ? getCouncilPolicyAdvisorOpinion(policyId, quoteSpeakerId) : null;
  const policyTitle = t(policy.titleKey);
  const officialName = quoteSpeakerId ? getCouncilNewsOfficialDisplayName(quoteSpeakerId) : '';

  const facts = [t(`council.newsFact.${action === 'enact' ? 'enacted' : 'repealed'}`, { policy: policyTitle })];
  if (advisorOpinion) {
    facts.push(t(`council.newsFact.official${advisorOpinion.stance === 'support' ? 'Support' : 'Concern'}`, { official: officialName }));
  }

  const fallbackKind = advisorOpinion?.stance === 'support' ? 'support' : 'concern';
  return {
    id: `council-policy-${policyId}-${action}-${city.tick}`,
    storyKind: 'council_character',
    eventType: 'policy_news',
    year: city.year,
    month: city.month,
    tick: city.tick,
    absurdity: 0,
    characterIds,
    facts,
    quoteSpeakerId,
    gameplayOutcome: { policyId, action, cost: getCouncilPolicyEstimatedMonthlyCost(policyId) },
    fallbackHeadlineKey: quoteSpeakerId ? `council.news.${action === 'enact' ? 'enacted' : 'repealed'}.${fallbackKind}` : null,
    fallbackHeadlineParams: { official: officialName, policy: policyTitle },
    dedupeTags: [policyId, action],
  };
}

function getCouncilNewsFallbackText(event) {
  if (!event?.fallbackHeadlineKey) return '';
  return t(event.fallbackHeadlineKey, event.fallbackHeadlineParams || {});
}

function buildCouncilCharacterPayload(characterIds) {
  const relevantIds = new Set(characterIds);
  return characterIds.map((id) => {
    const official = getCouncilOfficialDefinition(id);
    if (!official) return null;
    const profile = typeof getCouncilProfileDefinition === 'function' ? getCouncilProfileDefinition(id) : null;
    const relationshipContext = Object.entries(city.council?.relationships?.[id] || {})
      .filter(([otherId]) => relevantIds.has(otherId) && otherId !== id)
      .map(([otherId, strength]) => ({
        otherId,
        strength: Math.max(-2, Math.min(2, Math.round((Number(strength) || 0) / 50))),
      }));
    return {
      id: official.id,
      displayName: getCouncilNewsOfficialDisplayName(official.id),
      nickname: profile ? t(profile.nicknameKey) : '',
      role: t(`council.role.${official.role}`),
      coreBelief: t(official.coreBeliefKey),
      tone: official.tone,
      personality: profile ? profile.personalityKeys.map((key) => t(key)) : [],
      quirk: profile ? t(profile.quirkKey) : '',
      speechStyle: profile ? t(profile.speechStyleKey) : official.tone,
      likes: official.likes.slice(0, 4),
      dislikes: official.dislikes.slice(0, 4),
      relationshipContext,
    };
  }).filter(Boolean);
}

function buildOfficialProfileNewsEvent(officialId) {
  const official = getCouncilOfficialDefinition(officialId);
  if (!official) return null;
  const officialName = getCouncilNewsOfficialDisplayName(officialId);
  const comment = typeof getCurrentCouncilComment === 'function' ? getCurrentCouncilComment(officialId) : null;

  const facts = [t('council.newsFact.profileIntro', { official: officialName, role: t(`council.role.${official.role}`) })];
  if (comment) {
    facts.push(t('council.newsFact.profileOpinion', { official: officialName, issue: t(`council.issue.${comment.issueId}`) }));
  }

  return {
    id: `council-profile-${officialId}-${city.tick}`,
    storyKind: 'council_character',
    eventType: 'official_profile',
    year: city.year,
    month: city.month,
    tick: city.tick,
    absurdity: 1,
    characterIds: [officialId],
    facts,
    quoteSpeakerId: officialId,
    gameplayOutcome: null,
    fallbackHeadlineKey: 'council.news.profileFallback',
    fallbackHeadlineParams: { official: officialName, belief: t(official.coreBeliefKey) },
    dedupeTags: [officialId, 'profile'],
  };
}

function announceCouncilPolicyNews(policyId, action) {
  const event = buildCouncilPolicyNewsEvent(policyId, action);
  if (!event) return;

  const fallbackText = getCouncilNewsFallbackText(event);
  if (fallbackText && typeof addCityNews === 'function') addCityNews(fallbackText);

  if (typeof requestCouncilCharacterNews === 'function') {
    requestCouncilCharacterNews(event).catch((error) => console.warn('[Council News]', error));
  }
}

function buildCouncilResolutionNewsEvent(resolutionId, outcome, extra = {}) {
  const definition = getCouncilResolutionDefinition(resolutionId);
  if (!definition) return null;
  const leadIds = (definition.leadOfficialIds || []).slice(0, 2);
  const renamedIds = Object.keys(city.council?.customNames || {})
    .filter((id) => COUNCIL_OFFICIAL_IDS.includes(id) && !leadIds.includes(id));
  const fallbackIds = COUNCIL_VOTING_OFFICIAL_IDS.filter((id) => !leadIds.includes(id));
  const characterIds = [...leadIds, renamedIds[0] || fallbackIds[0]].filter(Boolean).slice(0, 3);
  const title = t(definition.titleKey);
  const facts = getResolutionCanonicalFacts(resolutionId, outcome, extra);
  return {
    id: `council-resolution-${resolutionId}-${outcome}-${city.tick}`,
    storyKind: 'council_character', eventType: 'resolution_news',
    year: city.year, month: city.month, tick: city.tick,
    absurdity: definition.absurdity || 0, characterIds, facts,
    quoteSpeakerId: characterIds[0] || null,
    gameplayOutcome: { resolutionId, outcome, ...extra },
    fallbackHeadlineKey: 'council.news.resolutionFallback',
    fallbackHeadlineParams: { resolution: title, outcome: t(`council.outcome.${outcome}`) },
    dedupeTags: [resolutionId, outcome, String(extra.showNumber || '')],
  };
}

function getResolutionNewsLanguage() {
  return typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'en';
}

function getResolutionCanonicalFacts(resolutionId, outcome, extra = {}) {
  const zh = getResolutionNewsLanguage() === 'zhHant';
  const title = t(getCouncilResolutionDefinition(resolutionId)?.titleKey || '');
  if (resolutionId === 'muiKinKwokMatch' && outcome === 'bench_warmer_refund') {
    return zh
      ? [`${title}失敗。梅建國全程九十分鐘坐在後備席，最後四十秒才出場揮手離場。`, `購票市民要求回水，事件令城市被世界恥笑。退款成本為 $${Number(extra.refundCost || 0).toLocaleString()}。`]
      : [`${title} failed: Mui Kin-kwok sat on the bench for all 90 minutes and appeared only for the final 40 seconds to wave before leaving.`, `Ticket holders demanded refunds and the city became an international joke. Refund cost: $${Number(extra.refundCost || 0).toLocaleString()}.`];
  }
  if (resolutionId === 'aiAntiDrugGirlGroup' && outcome === 'glamourised_drugs_backfire') {
    return zh
      ? ['AI 禁毒女團的兩分鐘影片有一分三十秒是性感舞蹈及介紹毒品。', '女團沒有宣傳禁毒，效果反而鼓吹毒品，導致犯罪率及城市恥笑度上升。']
      : ['The AI anti-drug girl group devoted 90 seconds of its two-minute video to sexualised dancing and introducing drugs.', 'It failed to promote an anti-drug message and instead encouraged drug use, increasing crime and city ridicule.'];
  }
  const droneFailureFacts = {
    noise_complaints: zh ? '煙花及無人機表演引發大量噪音投訴，居民批評活動擾民。' : 'The fireworks and drone show drew widespread noise complaints from residents.',
    drone_crash: zh ? '表演期間有無人機失控墜毀，引發安全及擾民爭議。' : 'Drones lost control and crashed during the show, causing safety and nuisance concerns.',
    drones_wrong_city: zh ? '整批無人機飛到隔離城市完成表演，香城市民留在原地甚麼也看不到。' : 'The entire drone fleet flew to the neighbouring city and performed there, leaving local spectators with nothing to see.',
  };
  if (resolutionId === 'fantasyFingHeungShing') {
    const summary = zh
      ? `全年共舉行 ${Number(extra.showCount || 4)} 場，成功 ${Number(extra.successCount || 0)} 場、失敗 ${Number(extra.failureCount || 0)} 場。`
      : `${Number(extra.showCount || 4)} shows were held: ${Number(extra.successCount || 0)} succeeded and ${Number(extra.failureCount || 0)} failed.`;
    return [droneFailureFacts[outcome] || (zh ? '四場煙花表演順利完成，帶動旅遊及城市吸引力。' : 'All four fireworks shows were completed successfully, boosting tourism and attractiveness.'), summary];
  }
  return [zh
    ? `${title}結果已經揭曉：${outcome === 'success' ? '活動成功，為城市帶來正面效益。' : '活動失敗，市民要求主責官員交代。'}`
    : `${title} has concluded: the event ${outcome === 'success' ? 'succeeded and benefited the city' : 'failed, prompting demands for an explanation'}.`];
}

function buildLocalResolutionArticle(event) {
  const language = getResolutionNewsLanguage();
  const zh = language === 'zhHant';
  const { resolutionId, outcome, ...extra } = event.gameplayOutcome;
  const names = event.characterIds.map(getCouncilNewsOfficialDisplayName);
  const lead = names[0] || '';
  const partner = names[1] || lead;
  const critic = names[2] || partner;
  const title = t(getCouncilResolutionDefinition(resolutionId)?.titleKey || '');
  const success = outcome === 'success';
  let headline = zh ? `${lead}公布${title}${success ? '成功' : '失敗'}` : `${lead}: ${title} ${success ? 'succeeds' : 'fails'}`;
  let subhead = zh ? `${partner}交代活動結果　${critic}回應市民關注` : `${partner} explains the result as ${critic} responds to residents`;
  let quote = zh ? (success ? '結果證明城市有能力辦好大型活動。' : '我們會檢討事件，向市民清楚交代。') : (success ? 'The result shows our city can deliver a major event.' : 'We will review what happened and give residents a clear account.');

  if (resolutionId === 'muiKinKwokMatch' && outcome === 'bench_warmer_refund') {
    headline = zh ? `梅建國坐足九十分鐘　落場揮手四十秒即離場` : 'Mui Kin-kwok benched for 90 minutes, waves for 40 seconds and leaves';
    subhead = zh ? `市民要求回水　${lead}被追問誰批准合約` : `Fans demand refunds as ${lead} is pressed over the contract`;
    quote = zh ? '表演時間與市民期望有落差，我們會處理回水安排。' : 'The appearance fell short of expectations; we will handle refund arrangements.';
  } else if (resolutionId === 'menaConcert' && outcome === 'success') {
    headline = zh ? '韓國天團「咩拿」訪港　大批市民接機迫爆機場' : 'Korean supergroup Meena greeted by huge airport crowd';
    subhead = zh ? `${lead}親自迎接　被質疑利用公權追星` : `${lead} personally welcomes group amid questions over use of office`;
    quote = zh ? '親自接機是文化交流工作，並不是利用公權追星。' : 'The airport welcome was cultural work, not celebrity chasing with public office.';
  } else if (resolutionId === 'tourEverywhere') {
    headline = zh ? `${lead}落實「無處不旅遊」　旅行團參觀公屋天台曬果皮` : `${lead} sends tour groups to public-housing rooftop`;
    subhead = zh ? '居民批評日常生活被當景點　街坊要求停止擾民' : 'Residents say daily life has been turned into a tourist attraction';
    quote = zh ? '旅遊推廣不應影響居民生活，行程安排會作出調整。' : 'Tourism promotion should not disrupt residents, and routes will be adjusted.';
  } else if (resolutionId === 'aiAntiDrugGirlGroup' && outcome === 'glamourised_drugs_backfire') {
    headline = zh ? `禁毒女團性感介紹毒品九十秒　宣傳片被轟反向教育` : 'Anti-drug group spends 90 seconds glamorising drugs';
    subhead = zh ? `犯罪及恥笑度上升　${lead}否認政府刻意鼓吹毒品` : `Crime and ridicule rise as ${lead} denies promoting drug use`;
    quote = zh ? '影片完全偏離禁毒原意，相關內容會立即檢討。' : 'The video departed completely from its anti-drug purpose and will be reviewed immediately.';
  } else if (resolutionId === 'fantasyFingHeungShing' && outcome === 'drones_wrong_city') {
    headline = zh ? `全批無人機飛到隔離城市　香城市民留在原地望天` : 'Entire drone fleet performs over neighbouring city';
    subhead = zh ? `${lead}承認航道出錯　${critic}要求公開調查` : `${lead} admits route error as ${critic} demands an inquiry`;
  } else if (resolutionId === 'fantasyFingHeungShing' && outcome === 'drone_crash') {
    headline = zh ? `無人機表演中途墜毀　${lead}稱大部分零件已尋回` : `Drones crash during show; ${lead} says most parts recovered`;
    subhead = zh ? `${partner}承認事故擾民　安全安排受質疑` : `${partner} acknowledges nuisance as safety planning is questioned`;
  } else if (resolutionId === 'fantasyFingHeungShing' && outcome === 'noise_complaints') {
    headline = zh ? `幻彩 fing 香城變噪音災難　居民投訴表演擾民` : 'Fantasy fing Heung Shing becomes a noise nuisance';
    subhead = zh ? `${lead}承諾檢討　${critic}批評低估居民感受` : `${lead} promises review after ${critic} criticises poor planning`;
  }

  const facts = event.facts;
  const cityName = city.name || (typeof getDefaultCityName === 'function' ? getDefaultCityName() : '');
  const social = buildResolutionForumActivity(event, { lead, partner, critic });
  const article = {
    headline,
    subhead,
    body: [
      facts[0] || '',
      `${facts[1] || ''}${zh ? ` 主責官員${lead}與${partner}交代事件，${critic}亦要求政府回應事件對${cityName}的實際影響。` : ` ${lead} and ${partner} addressed the event, while ${critic} called for a response to its impact on ${cityName}.`}`,
    ],
    quote,
    quoteSpeakerId: event.quoteSpeakerId,
    social,
    source: 'local',
  };
  return language === 'ja'
    ? localizeResolutionArticleJapanese(article, event, { lead, partner, critic, title })
    : article;
}

function localizeResolutionArticleJapanese(article, event, names) {
  const { resolutionId, outcome, refundCost = 0, showCount = 4, successCount = 0, failureCount = 0 } = event.gameplayOutcome;
  const { lead, partner, critic, title } = names;
  const result = {
    ...article,
    headline: `${lead}、${title}の${outcome === 'success' ? '成功' : '失敗'}を発表`,
    subhead: `${partner}が結果を説明、${critic}は市民への説明を要求`,
    body: [`${title}の実施結果が発表された。`, `${lead}と${partner}が対応を説明し、${critic}は都市への影響を公開するよう求めた。`],
    quote: outcome === 'success' ? '大型イベントを実行できる都市の力を示しました。' : '結果を検証し、市民に説明します。',
  };
  if (resolutionId === 'muiKinKwokMatch' && outcome === 'bench_warmer_refund') Object.assign(result, {
    headline: '梅建国、90分ベンチ　最後の40秒だけ手を振って退場',
    subhead: `観客が返金要求　${lead}に契約責任を問う声`,
    body: [`梅建国は90分間ベンチに座り、最後の40秒だけ登場して手を振り、すぐに退場した。`, `観客は返金を要求し、市は世界の笑いものに。返金費用は$${Number(refundCost).toLocaleString()}。`],
  });
  else if (resolutionId === 'menaConcert' && outcome === 'success') Object.assign(result, {
    headline: '韓国人気グループ「Meena」到着、空港に大勢のファン',
    subhead: `${lead}が自ら出迎え、公職を使った推し活との疑い`,
    body: ['韓国の人気グループMeenaを大勢の市民が出迎えた。', `${lead}の空港出迎えについて、公務なのか個人的な推し活なのか議論が起きている。`],
  });
  else if (resolutionId === 'tourEverywhere') Object.assign(result, {
    headline: `${lead}の「どこでも観光」、団地屋上の干し物まで観光地に`,
    subhead: '住民の日常が見世物になったとして迷惑を訴える声',
    body: ['旅行団が団地屋上を訪れ、住民の干し物や日常生活を撮影した。', `${critic}は観光振興と私生活の境界を明確にするよう求めた。`],
  });
  else if (resolutionId === 'aiAntiDrugGirlGroup' && outcome === 'glamourised_drugs_backfire') Object.assign(result, {
    headline: '薬物防止AIガールズ、90秒にわたり薬物を美化',
    subhead: `犯罪と都市の嘲笑度が上昇　${lead}は意図的な宣伝を否定`,
    body: ['2分の動画のうち90秒がセクシーなダンスと薬物紹介に使われた。', '薬物防止のはずが使用を促す内容となり、犯罪率と都市の嘲笑度が上昇した。'],
  });
  else if (resolutionId === 'fantasyFingHeungShing') {
    const drone = {
      drones_wrong_city: ['ドローン全機が隣の街へ　香城市民は空を見るだけ', '飛行経路の誤りを認め、公開調査を求める声'],
      drone_crash: ['ドローンショー中に墜落　部品の大半は回収', '安全対策と住民への迷惑を巡り批判'],
      noise_complaints: ['「幻彩 fing 香城」が騒音問題に　住民から苦情', '当局は見直しを約束、市民感情を軽視したとの声'],
      success: ['4回の光のショーが成功　観光人気を押し上げ', '年間プログラムが無事終了'],
    }[outcome] || ['光のショー年間結果を発表', '市民が費用対効果を議論'];
    Object.assign(result, { headline: drone[0], subhead: drone[1], body: [`年間${showCount}回のうち成功${successCount}回、失敗${failureCount}回。`, `${lead}と${critic}が結果を巡って意見を交わした。`] });
  }
  return result;
}

function buildResolutionForumActivity(event, names) {
  const zh = getResolutionNewsLanguage() === 'zhHant';
  const { resolutionId, outcome } = event.gameplayOutcome;
  const ridicule = Math.max(0, Number(city.cityRidicule) || 0);
  const seed = typeof hashCouncilEffectSeed === 'function'
    ? hashCouncilEffectSeed(`${resolutionId}:${outcome}:${city.year}:${city.month}`)
    : 0.5;
  const failed = outcome !== 'success';
  const scale = 900 + Math.round(seed * 2400) + Math.round(ridicule * 85);
  const commentsByOutcome = {
    bench_warmer_refund: zh
      ? [['回水苦主', '我買飛唔係睇佢坐後備席。'], ['四十秒球迷', '揮手四十秒都夠膽叫表演賽。']]
      : [['Refund Please', 'I paid for a match, not a view of the bench.'], ['Forty-Second Fan', 'A 40-second wave is not an exhibition match.']],
    glamourised_drugs_backfire: zh
      ? [['家長關注組', '究竟呢條片係禁毒，定係毒品宣傳？'], ['影片剪接員', '兩分鐘有九十秒跳舞，禁毒訊息去咗邊？']]
      : [['Concerned Parent', 'Was this anti-drug education or a drug advertisement?'], ['Video Editor', 'Where was the anti-drug message in this two-minute video?']],
    noise_complaints: zh
      ? [['失眠街坊', '得五秒表演，但投訴電話打足成晚。'], ['海旁居民', '下次可唔可以先問吓附近居民？']]
      : [['Sleepless Resident', 'Five seconds of show, a whole night of complaints.'], ['Harbour Neighbour', 'Could residents be consulted next time?']],
    drone_crash: zh
      ? [['抬頭望天', '大部分零件搵得返，即係仲有啲未搵返？'], ['安全第一', '呢個解釋完全令人更加擔心。']]
      : [['Looking Up', 'Most parts recovered means some are still missing?'], ['Safety First', 'That explanation is not reassuring.']],
    drones_wrong_city: zh
      ? [['香城觀眾', '隔離城市免費睇，我哋畀錢望天。'], ['隔離城市居民', '多謝香城送表演過嚟。']]
      : [['Local Spectator', 'The neighbours watched for free while we stared at the sky.'], ['Neighbouring Resident', 'Thanks for sending us the show.']],
  };
  const comments = commentsByOutcome[outcome] || (zh
    ? [['香城街坊', failed ? '又要市民埋單，主責官員要交代。' : '今次效果唔錯，希望唔好超支。'], ['城市觀察員', `${names.critic}應該公開完整成效數據。`]]
    : [['City Resident', failed ? 'Residents are paying again; officials owe us an explanation.' : 'A good result—provided it stayed on budget.'], ['City Watcher', `${names.critic} should publish the full results.`]]);
  comments.push({
    author: names.critic,
    text: zh ? '我會在下次會議跟進事件，要求主責部門公開交代。' : 'I will follow this up at the next meeting and seek a full account.',
  });
  let namedComments = comments.map((comment, index) => {
    if (!Array.isArray(comment)) return comment;
    return {
      author: typeof getExamForumCitizenName === 'function'
        ? getExamForumCitizenName(`${resolutionId}:${outcome}:${city.year}:${city.month}:${index}`)
        : comment[0],
      text: comment[1],
    };
  });
  if (getResolutionNewsLanguage() === 'ja') {
    const japanese = {
      bench_warmer_refund: ['試合を見に来たのであって、ベンチを見に来たのではない。', '40秒手を振るだけで親善試合とは言えない。'],
      glamourised_drugs_backfire: ['これは薬物防止なのか、それとも薬物広告なのか。', '2分中90秒がダンス。防止メッセージはどこへ？'],
      noise_complaints: ['ショーは5秒、苦情電話は一晩中。', '次回は近隣住民にも先に聞いてほしい。'],
      drone_crash: ['「大部分を回収」は、まだ未回収があるということ？', '説明を聞いたら余計に不安になった。'],
      drones_wrong_city: ['隣の街は無料、こちらは料金を払って空を見る。', '香城からショーを送ってくれてありがとう。'],
    }[outcome] || [failed ? 'また市民負担。担当者は説明を。' : '今回は良い結果。予算超過がなければ。', `${names.critic}は全データを公開すべきだ。`];
    namedComments = namedComments.map((comment, index) => ({
      ...comment,
      text: index < japanese.length ? japanese[index] : '次回会議で追及し、担当部門に説明を求めます。',
    }));
  }
  return {
    likes: Math.round(scale * (failed ? 0.45 : 1.2)).toLocaleString(),
    laughs: Math.round(scale * (failed ? 1.5 + ridicule / 45 : 0.18)).toLocaleString(),
    angry: Math.round(scale * (failed ? 0.9 : 0.08)).toLocaleString(),
    commentCount: Math.round(scale * (failed ? 0.72 : 0.24)).toLocaleString(),
    shares: Math.round(scale * (failed ? 1.08 : 0.38)).toLocaleString(),
    comments: namedComments,
  };
}

function saveResolutionArticle(event, article) {
  const history = city.council?.resolutionHistory;
  if (!Array.isArray(history)) return;
  const record = [...history].reverse().find((item) => item.resolutionId === event.gameplayOutcome.resolutionId && !item.newspaper);
  if (record) record.newspaper = { ...article };
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
}

function getResolutionForumImage(resolutionId, outcome) {
  const images = {
    muiKinKwokMatch: 'UI/News/footballStarVisit.png',
    menaConcert: 'UI/News/koreanStarVisit.png',
    aiAntiDrugGirlGroup: 'UI/News/AIAntidrugCampagin.png',
    tourEverywhere: 'UI/News/touringEverywhere.png',
  };
  if (resolutionId === 'fantasyFingHeungShing') {
    return outcome === 'success' ? 'UI/News/nightDroneShowSucceed.png' : 'UI/News/nightDroneShowFailed.png';
  }
  return images[resolutionId] || '';
}

async function announceCouncilResolutionNews(resolutionId, outcome, extra = {}) {
  const event = buildCouncilResolutionNewsEvent(resolutionId, outcome, extra);
  if (!event) return;
  const fallback = buildLocalResolutionArticle(event);
  let article = fallback;
  if (typeof requestCouncilCharacterNews === 'function') {
    try {
      const generated = await Promise.race([
        requestCouncilCharacterNews(event, { addToTicker: false }),
        new Promise((resolve) => window.setTimeout(() => resolve(null), 4000)),
      ]);
      if (generated?.headline && generated?.body) {
        const newsLanguage = getResolutionNewsLanguage();
        const leadName = getCouncilNewsOfficialDisplayName(event.characterIds[0]);
        const partnerName = event.characterIds[1] ? getCouncilNewsOfficialDisplayName(event.characterIds[1]) : '';
        const criticName = event.characterIds[2] ? getCouncilNewsOfficialDisplayName(event.characterIds[2]) : '';
        let subhead = generated.subhead || fallback.subhead;
        let body = generated.body;
        const generatedText = `${generated.headline} ${subhead} ${body}`;
        if (leadName && !generatedText.includes(leadName)) {
          subhead = newsLanguage === 'zhHant'
            ? `${leadName}回應事件　${subhead}`
            : newsLanguage === 'ja' ? `${leadName}が事件に回答　${subhead}` : `${leadName} responds — ${subhead}`;
        }
        if (partnerName && !`${generated.headline} ${subhead} ${body}`.includes(partnerName)) {
          body += newsLanguage === 'zhHant'
            ? ` ${partnerName}亦有參與交代事件。`
            : newsLanguage === 'ja' ? ` ${partnerName}も結果について説明した。` : ` ${partnerName} also addressed the result.`;
        }
        if (criticName && !`${generated.headline} ${subhead} ${body}`.includes(criticName)) {
          body += newsLanguage === 'zhHant'
            ? ` ${criticName}表示會成立小組研究事件，網民則追問小組會否再成立另一個小組。`
            : newsLanguage === 'ja' ? ` ${criticName}は検討会の設置を表明。掲示板では、その検討会が別の検討会を作るのかと皮肉られた。` : ` ${criticName} proposed a review group, prompting users to ask whether it would create another review group.`;
        }
        article = {
          headline: generated.headline,
          subhead,
          body: [body],
          quote: generated.quote || fallback.quote,
          quoteSpeakerId: generated.quoteSpeakerId || fallback.quoteSpeakerId,
          social: fallback.social,
          source: 'ai',
        };
      }
    } catch (error) {
      console.warn('[Council Resolution Newspaper]', error);
    }
  }
  article.image = getResolutionForumImage(resolutionId, outcome);
  if (typeof addCityNews === 'function') addCityNews(article.headline);
  let forumPost = null;
  if (typeof addForumPost === 'function') {
    const history = city.council?.resolutionHistory || [];
    const historyRecord = [...history].reverse().find((item) =>
      item.resolutionId === resolutionId && !item.forumPostId);
    const resolutionMonthIndex = Number(historyRecord?.completedMonthIndex
      ?? historyRecord?.reportDueMonthIndex
      ?? historyRecord?.approvedMonthIndex);
    forumPost = addForumPost(article, {
      id: event.id,
      category: outcome === 'success' ? '城市發展' : '城中熱話',
      outcome,
      resolutionId,
      resolutionMonthIndex: Number.isFinite(resolutionMonthIndex) ? resolutionMonthIndex : -1,
    });
    if (historyRecord && forumPost) historyRecord.forumPostId = forumPost.id;
  }
  if (typeof showResolutionNewspaper === 'function') showResolutionNewspaper(article, forumPost?.id || '');
  saveResolutionArticle(event, article);
}

function announceOfficialProfileNews(officialId) {
  const event = buildOfficialProfileNewsEvent(officialId);
  if (!event) return;

  const fallbackText = getCouncilNewsFallbackText(event);
  if (fallbackText && typeof addCityNews === 'function') addCityNews(fallbackText);

  if (typeof requestCouncilCharacterNews === 'function') {
    requestCouncilCharacterNews(event).catch((error) => console.warn('[Council News]', error));
  }
}

// The Observatory Director is the in-world voice for typhoon signals — in reality
// signal decisions are objective/technical, but narratively this is her call to announce.
const TYPHOON_STAGE_FALLBACK_KEY = {
  signal1: 'council.news.typhoon.signal1',
  signal3: 'council.news.typhoon.signal3',
  signal8: 'council.news.typhoon.signal8',
  signal9: 'council.news.typhoon.signal9',
  signal10: 'council.news.typhoon.signal10',
  none: 'council.news.typhoon.cancelled',
};

function buildTyphoonSignalNewsEvent(name, stage, windKph) {
  if (!name) return null;
  const officialName = getCouncilNewsOfficialDisplayName('observatory_head');
  const displayName = typeof getTyphoonDisplayName === 'function' ? getTyphoonDisplayName(name) : name;
  const signalNumber = typeof TYPHOON_SIGNAL_NUMBER === 'object' ? (TYPHOON_SIGNAL_NUMBER[stage] || '') : '';
  const factKey = stage === 'none' ? 'council.newsFact.typhoonCancelled' : 'council.newsFact.typhoonSignal';
  const facts = [t(factKey, { name: displayName, signal: signalNumber, wind: String(windKph) })];
  return {
    id: `typhoon-${name}-${stage}-${city.tick}`,
    storyKind: 'council_character',
    eventType: 'typhoon_signal',
    year: city.year,
    month: city.month,
    tick: city.tick,
    absurdity: 0,
    characterIds: ['observatory_head'],
    facts,
    quoteSpeakerId: 'observatory_head',
    gameplayOutcome: null,
    fallbackHeadlineKey: TYPHOON_STAGE_FALLBACK_KEY[stage] || null,
    fallbackHeadlineParams: { official: officialName, name: displayName, signal: signalNumber, wind: String(windKph) },
    dedupeTags: ['typhoon', name, stage],
  };
}

function announceTyphoonSignalChange(name, stage, windKph) {
  const event = buildTyphoonSignalNewsEvent(name, stage, windKph);
  if (!event) return;

  const fallbackText = getCouncilNewsFallbackText(event);
  if (fallbackText && typeof addCityNews === 'function') addCityNews(fallbackText);

  if (typeof requestCouncilCharacterNews === 'function') {
    requestCouncilCharacterNews(event).catch((error) => console.warn('[Council News]', error));
  }
}
