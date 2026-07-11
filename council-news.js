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

function announceTyphoonBulletin(name, stage, windKph) {
  if (typeof showNewspaperExtra !== 'function' || !name) return;
  showNewspaperExtra('typhoon_signal8', {
    name: typeof getTyphoonDisplayName === 'function' ? getTyphoonDisplayName(name) : name,
    wind: String(windKph),
    signal: typeof TYPHOON_SIGNAL_NUMBER === 'object' ? (TYPHOON_SIGNAL_NUMBER[stage] || '8') : '8',
  });
}
