// "Performance layer" persona flavor for each official, ported from
// docs/council-phase1-2-design.md §3 (角色創作設定). Purely descriptive text used
// for AI news character payloads and profile features — never affects gameplay
// or voting math (those stay in council-definitions.js).

const COUNCIL_PROFILE_DEFS = Object.freeze({
  chief_executive: {
    nicknameKey: 'council.profile.chief_executive.nickname',
    personalityKeys: ['council.profile.chief_executive.personality1', 'council.profile.chief_executive.personality2'],
    quirkKey: 'council.profile.chief_executive.quirk',
    speechStyleKey: 'council.profile.chief_executive.speechStyle',
    quoteKey: 'council.profile.chief_executive.quote',
  },
  treasury_head: {
    nicknameKey: 'council.profile.treasury_head.nickname',
    personalityKeys: ['council.profile.treasury_head.personality1', 'council.profile.treasury_head.personality2'],
    quirkKey: 'council.profile.treasury_head.quirk',
    speechStyleKey: 'council.profile.treasury_head.speechStyle',
    quoteKey: 'council.profile.treasury_head.quote',
  },
  police_head: {
    nicknameKey: 'council.profile.police_head.nickname',
    personalityKeys: ['council.profile.police_head.personality1', 'council.profile.police_head.personality2'],
    quirkKey: 'council.profile.police_head.quirk',
    speechStyleKey: 'council.profile.police_head.speechStyle',
    quoteKey: 'council.profile.police_head.quote',
  },
  observatory_head: {
    nicknameKey: 'council.profile.observatory_head.nickname',
    personalityKeys: ['council.profile.observatory_head.personality1', 'council.profile.observatory_head.personality2'],
    quirkKey: 'council.profile.observatory_head.quirk',
    speechStyleKey: 'council.profile.observatory_head.speechStyle',
    quoteKey: 'council.profile.observatory_head.quote',
  },
  culture_head: {
    nicknameKey: 'council.profile.culture_head.nickname',
    personalityKeys: ['council.profile.culture_head.personality1', 'council.profile.culture_head.personality2'],
    quirkKey: 'council.profile.culture_head.quirk',
    speechStyleKey: 'council.profile.culture_head.speechStyle',
    quoteKey: 'council.profile.culture_head.quote',
  },
  councillor_democracy: {
    nicknameKey: 'council.profile.councillor_democracy.nickname',
    personalityKeys: ['council.profile.councillor_democracy.personality1', 'council.profile.councillor_democracy.personality2'],
    quirkKey: 'council.profile.councillor_democracy.quirk',
    speechStyleKey: 'council.profile.councillor_democracy.speechStyle',
    quoteKey: 'council.profile.councillor_democracy.quote',
  },
  councillor_liberty: {
    nicknameKey: 'council.profile.councillor_liberty.nickname',
    personalityKeys: ['council.profile.councillor_liberty.personality1', 'council.profile.councillor_liberty.personality2'],
    quirkKey: 'council.profile.councillor_liberty.quirk',
    speechStyleKey: 'council.profile.councillor_liberty.speechStyle',
    quoteKey: 'council.profile.councillor_liberty.quote',
  },
  councillor_business: {
    nicknameKey: 'council.profile.councillor_business.nickname',
    personalityKeys: ['council.profile.councillor_business.personality1', 'council.profile.councillor_business.personality2'],
    quirkKey: 'council.profile.councillor_business.quirk',
    speechStyleKey: 'council.profile.councillor_business.speechStyle',
    quoteKey: 'council.profile.councillor_business.quote',
  },
  councillor_tourism: {
    nicknameKey: 'council.profile.councillor_tourism.nickname',
    personalityKeys: ['council.profile.councillor_tourism.personality1', 'council.profile.councillor_tourism.personality2'],
    quirkKey: 'council.profile.councillor_tourism.quirk',
    speechStyleKey: 'council.profile.councillor_tourism.speechStyle',
    quoteKey: 'council.profile.councillor_tourism.quote',
  },
  councillor_religion: {
    nicknameKey: 'council.profile.councillor_religion.nickname',
    personalityKeys: ['council.profile.councillor_religion.personality1', 'council.profile.councillor_religion.personality2'],
    quirkKey: 'council.profile.councillor_religion.quirk',
    speechStyleKey: 'council.profile.councillor_religion.speechStyle',
    quoteKey: 'council.profile.councillor_religion.quote',
  },
});

function getCouncilProfileDefinition(officialId) {
  return COUNCIL_PROFILE_DEFS[officialId] || null;
}
