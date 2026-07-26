function clampCouncilNumber(value, min, max, fallback) {
  const numeric = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
}

function createDefaultCouncilRelationships() {
  const relationships = {};
  COUNCIL_OFFICIAL_IDS.forEach((sourceId) => {
    relationships[sourceId] = {};
    COUNCIL_OFFICIAL_IDS.forEach((targetId) => {
      if (sourceId === targetId) return;
      relationships[sourceId][targetId] = clampCouncilNumber(
        COUNCIL_INITIAL_RELATIONSHIPS[sourceId]?.[targetId],
        -100,
        100,
        0,
      );
    });
  });
  return relationships;
}

function createDefaultCouncilPolicyStates(activePolicies = {}) {
  return Object.fromEntries(CITY_POLICY_DEFS.map((policy) => [policy.id, {
    status: activePolicies[policy.id] ? 'active' : 'inactive',
    lastChangedTick: -1,
    cooldownUntilMonthIndex: -1,
    enactedYear: -1,
  }]));
}

function createDefaultCouncilState(activePolicies = {}) {
  return {
    schemaVersion: COUNCIL_SCHEMA_VERSION,
    customNames: {},
    trust: Object.fromEntries(COUNCIL_OFFICIAL_IDS.map((id) => [id, 50])),
    relationships: createDefaultCouncilRelationships(),
    policyStates: createDefaultCouncilPolicyStates(activePolicies),
    specialEventState: Object.fromEntries(COUNCIL_SPECIAL_EVENT_DEFS.map((event) => [event.id, {
      lastTriggeredTick: -1,
      triggerCount: 0,
    }])),
    activeSession: null,
    voteHistory: [],
    resolutionStates: Object.fromEntries(COUNCIL_RESOLUTION_IDS.map((id) => [id, {
      cooldownUntilMonthIndex: -1,
      timesApproved: 0,
    }])),
    activePrograms: [],
    resolutionHistory: [],
    policyNewsSchedules: [],
    forumEventState: {
      labExplosionLastMonthIndex: -1,
    },
    annualFortuneState: {
      lastDrawYear: -1,
      recentFortuneIds: [],
      history: [],
    },
    lastTimedMonthIndex: -1,
    recentCommentKeys: [],
    lastCommentTickByContext: {},
  };
}

function normalizeCouncilState(rawCouncil, activePolicies = {}) {
  const raw = rawCouncil && typeof rawCouncil === 'object' ? rawCouncil : {};
  const defaults = createDefaultCouncilState(activePolicies);
  const validPolicyStatuses = new Set(['inactive', 'draft', 'debating', 'active', 'repeal_draft']);
  const cleanShortText = (value, max) => Array.from(String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim())
    .slice(0, max).join('');

  const customNames = {};
  COUNCIL_OFFICIAL_IDS.forEach((id) => {
    const name = cleanShortText(raw.customNames?.[id], 30);
    if (name) customNames[id] = name;
  });

  const trust = {};
  COUNCIL_OFFICIAL_IDS.forEach((id) => {
    trust[id] = Math.round(clampCouncilNumber(raw.trust?.[id], 0, 100, defaults.trust[id]));
  });

  const relationships = createDefaultCouncilRelationships();
  COUNCIL_OFFICIAL_IDS.forEach((sourceId) => {
    COUNCIL_OFFICIAL_IDS.forEach((targetId) => {
      if (sourceId === targetId) return;
      relationships[sourceId][targetId] = Math.round(clampCouncilNumber(
        raw.relationships?.[sourceId]?.[targetId],
        -100,
        100,
        relationships[sourceId][targetId],
      ));
    });
  });

  const policyStates = {};
  CITY_POLICY_DEFS.forEach((policy) => {
    const saved = raw.policyStates?.[policy.id];
    const savedStatus = validPolicyStatuses.has(saved?.status) ? saved.status : 'inactive';
    const status = activePolicies[policy.id]
      ? (savedStatus === 'repeal_draft' || savedStatus === 'debating' ? savedStatus : 'active')
      : (savedStatus === 'active' || savedStatus === 'repeal_draft' ? 'inactive' : savedStatus);
    policyStates[policy.id] = {
      status,
      lastChangedTick: Math.floor(clampCouncilNumber(saved?.lastChangedTick, -1, Number.MAX_SAFE_INTEGER, -1)),
      cooldownUntilMonthIndex: Math.floor(clampCouncilNumber(saved?.cooldownUntilMonthIndex, -1, Number.MAX_SAFE_INTEGER, -1)),
      enactedYear: Math.floor(clampCouncilNumber(saved?.enactedYear, -1, 9999, -1)),
    };
  });

  const specialEventState = {};
  COUNCIL_SPECIAL_EVENT_DEFS.forEach((event) => {
    const saved = raw.specialEventState?.[event.id];
    specialEventState[event.id] = {
      lastTriggeredTick: Math.floor(clampCouncilNumber(saved?.lastTriggeredTick, -1, Number.MAX_SAFE_INTEGER, -1)),
      triggerCount: Math.floor(clampCouncilNumber(saved?.triggerCount, 0, Number.MAX_SAFE_INTEGER, 0)),
    };
  });

  const resolutionStates = {};
  COUNCIL_RESOLUTION_IDS.forEach((id) => {
    const saved = raw.resolutionStates?.[id];
    resolutionStates[id] = {
      cooldownUntilMonthIndex: Math.floor(clampCouncilNumber(saved?.cooldownUntilMonthIndex, -1, Number.MAX_SAFE_INTEGER, -1)),
      timesApproved: Math.floor(clampCouncilNumber(saved?.timesApproved, 0, Number.MAX_SAFE_INTEGER, 0)),
    };
  });

  const recentCommentKeys = (Array.isArray(raw.recentCommentKeys) ? raw.recentCommentKeys : [])
    .map((key) => cleanShortText(key, 120)).filter(Boolean).slice(-30);
  const lastCommentTickByContext = {};
  if (raw.lastCommentTickByContext && typeof raw.lastCommentTickByContext === 'object') {
    Object.entries(raw.lastCommentTickByContext).slice(0, 30).forEach(([context, tick]) => {
      const cleanContext = cleanShortText(context, 60);
      if (cleanContext) lastCommentTickByContext[cleanContext] = Math.floor(clampCouncilNumber(tick, -1, Number.MAX_SAFE_INTEGER, -1));
    });
  }

  const policyNewsSchedules = (Array.isArray(raw.policyNewsSchedules) ? raw.policyNewsSchedules : [])
    .filter((schedule) => schedule && typeof schedule === 'object' && schedule.policyId === 'strongCountryManufacturing')
    .slice(-12)
    .map((schedule, index) => ({
      id: cleanShortText(schedule.id || `strong-country-loaded-${index}`, 100),
      policyId: 'strongCountryManufacturing',
      enactedYear: Math.floor(clampCouncilNumber(schedule.enactedYear, 1900, 9999, 1900)),
      enactedMonthIndex: Math.floor(clampCouncilNumber(schedule.enactedMonthIndex, 0, Number.MAX_SAFE_INTEGER, 0)),
      abuseDueMonthIndex: Math.floor(clampCouncilNumber(schedule.abuseDueMonthIndex, 0, Number.MAX_SAFE_INTEGER, 0)),
      researchDueMonthIndex: Math.floor(clampCouncilNumber(schedule.researchDueMonthIndex, 0, Number.MAX_SAFE_INTEGER, 0)),
      abuseAnnounced: !!schedule.abuseAnnounced,
      researchAnnounced: !!schedule.researchAnnounced,
      researchCancelled: !!schedule.researchCancelled,
    }));
  const forumEventState = {
    labExplosionLastMonthIndex: Math.floor(clampCouncilNumber(
      raw.forumEventState?.labExplosionLastMonthIndex,
      -1,
      Number.MAX_SAFE_INTEGER,
      -1,
    )),
  };
  const fortuneIdPattern = /^heung-shing-\d{2}$/;
  const annualFortuneState = {
    lastDrawYear: Math.floor(clampCouncilNumber(
      raw.annualFortuneState?.lastDrawYear,
      -1,
      9999,
      -1,
    )),
    recentFortuneIds: (Array.isArray(raw.annualFortuneState?.recentFortuneIds)
      ? raw.annualFortuneState.recentFortuneIds
      : [])
      .map((id) => cleanShortText(id, 40))
      .filter((id) => fortuneIdPattern.test(id))
      .slice(-3),
    history: (Array.isArray(raw.annualFortuneState?.history)
      ? raw.annualFortuneState.history
      : [])
      .filter((record) => record && fortuneIdPattern.test(String(record.fortuneId || '')))
      .slice(-10)
      .map((record) => ({
        year: Math.floor(clampCouncilNumber(record.year, 0, 9999, 0)),
        fortuneId: cleanShortText(record.fortuneId, 40),
        grade: ['upper', 'middle', 'lower'].includes(record.grade) ? record.grade : 'middle',
        economyIndex: clampCouncilNumber(record.economyIndex, 0, 100, 50),
        stockCrashActive: !!record.stockCrashActive,
        epidemicSeverity: clampCouncilNumber(record.epidemicSeverity, 0, 1, 0),
        postId: cleanShortText(record.postId, 80),
      })),
  };

  return {
    schemaVersion: COUNCIL_SCHEMA_VERSION,
    customNames,
    trust,
    relationships,
    policyStates,
    specialEventState,
    activeSession: raw.activeSession && typeof raw.activeSession === 'object' ? raw.activeSession : null,
    voteHistory: (Array.isArray(raw.voteHistory) ? raw.voteHistory : []).filter((vote) => vote && typeof vote === 'object').slice(-50),
    resolutionStates,
    activePrograms: (Array.isArray(raw.activePrograms) ? raw.activePrograms : [])
      .filter((program) => program && typeof program === 'object' && COUNCIL_RESOLUTION_IDS.includes(program.resolutionId))
      .slice(-12),
    resolutionHistory: (Array.isArray(raw.resolutionHistory) ? raw.resolutionHistory : [])
      .filter((record) => record && typeof record === 'object' && COUNCIL_RESOLUTION_IDS.includes(record.resolutionId))
      .slice(-50),
    policyNewsSchedules,
    forumEventState,
    annualFortuneState,
    lastTimedMonthIndex: Math.floor(clampCouncilNumber(raw.lastTimedMonthIndex, -1, Number.MAX_SAFE_INTEGER, -1)),
    recentCommentKeys,
    lastCommentTickByContext,
  };
}
