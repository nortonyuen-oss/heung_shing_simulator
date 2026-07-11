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
  },
  treasury_head: {
    nicknameKey: 'council.profile.treasury_head.nickname',
    personalityKeys: ['council.profile.treasury_head.personality1', 'council.profile.treasury_head.personality2'],
    quirkKey: 'council.profile.treasury_head.quirk',
    speechStyleKey: 'council.profile.treasury_head.speechStyle',
  },
  police_head: {
    nicknameKey: 'council.profile.police_head.nickname',
    personalityKeys: ['council.profile.police_head.personality1', 'council.profile.police_head.personality2'],
    quirkKey: 'council.profile.police_head.quirk',
    speechStyleKey: 'council.profile.police_head.speechStyle',
  },
  observatory_head: {
    nicknameKey: 'council.profile.observatory_head.nickname',
    personalityKeys: ['council.profile.observatory_head.personality1', 'council.profile.observatory_head.personality2'],
    quirkKey: 'council.profile.observatory_head.quirk',
    speechStyleKey: 'council.profile.observatory_head.speechStyle',
  },
  culture_head: {
    nicknameKey: 'council.profile.culture_head.nickname',
    personalityKeys: ['council.profile.culture_head.personality1', 'council.profile.culture_head.personality2'],
    quirkKey: 'council.profile.culture_head.quirk',
    speechStyleKey: 'council.profile.culture_head.speechStyle',
  },
  councillor_democracy: {
    nicknameKey: 'council.profile.councillor_democracy.nickname',
    personalityKeys: ['council.profile.councillor_democracy.personality1', 'council.profile.councillor_democracy.personality2'],
    quirkKey: 'council.profile.councillor_democracy.quirk',
    speechStyleKey: 'council.profile.councillor_democracy.speechStyle',
  },
  councillor_liberty: {
    nicknameKey: 'council.profile.councillor_liberty.nickname',
    personalityKeys: ['council.profile.councillor_liberty.personality1', 'council.profile.councillor_liberty.personality2'],
    quirkKey: 'council.profile.councillor_liberty.quirk',
    speechStyleKey: 'council.profile.councillor_liberty.speechStyle',
  },
  councillor_business: {
    nicknameKey: 'council.profile.councillor_business.nickname',
    personalityKeys: ['council.profile.councillor_business.personality1', 'council.profile.councillor_business.personality2'],
    quirkKey: 'council.profile.councillor_business.quirk',
    speechStyleKey: 'council.profile.councillor_business.speechStyle',
  },
  councillor_tourism: {
    nicknameKey: 'council.profile.councillor_tourism.nickname',
    personalityKeys: ['council.profile.councillor_tourism.personality1', 'council.profile.councillor_tourism.personality2'],
    quirkKey: 'council.profile.councillor_tourism.quirk',
    speechStyleKey: 'council.profile.councillor_tourism.speechStyle',
  },
  councillor_religion: {
    nicknameKey: 'council.profile.councillor_religion.nickname',
    personalityKeys: ['council.profile.councillor_religion.personality1', 'council.profile.councillor_religion.personality2'],
    quirkKey: 'council.profile.councillor_religion.quirk',
    speechStyleKey: 'council.profile.councillor_religion.speechStyle',
  },
});

function getCouncilProfileDefinition(officialId) {
  return COUNCIL_PROFILE_DEFS[officialId] || null;
}
