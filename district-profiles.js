// 地區特色 (docs/district-profiles-design.md): a city founded on a Hong Kong district map carries
// that district's profile - a step from -2 to +2 on each axis, plus a height cap - which the
// simulation adds on top of its own numbers, the way policies and council effects do. The city
// stores only the district id (city.districtProfileId), so retuning this table reaches existing
// cities too. Generated maps, the player's own maps and older saves have no profile: all 0.

// What one step is worth. Kept modest, about one policy's worth, until play-testing says more.
const DISTRICT_PROFILE_STEP_EFFECTS = Object.freeze({
  demandR: 0.04,          // demand, -1..1
  demandC: 0.04,
  demandI: 0.04,
  taxR: 0.10,             // share of that tax
  taxC: 0.10,
  taxI: 0.10,
  traffic: 0.03,          // traffic index, 0..1; positive is more congestion
  tourism: 5,             // tourism appeal points, 0..100
  tourismCapacity: 0.10,  // share of visitor capacity, from the same tourism step
  wealth: 0.05,           // land value the wealth districts read, 0..1
  density: 0.10,          // share of residents per building
  jobs: 0.10,             // share of commercial and industrial jobs
  cost: 0.15,             // share of the zoning fee (land price); positive is dearer
  environment: 3,         // attractiveness points
  pollution: -0.15,       // share of industrial pollution, from the same environment step
});

const DISTRICT_PROFILE_AXES = Object.freeze([
  'demandR', 'demandC', 'demandI', 'taxR', 'taxC', 'taxI', 'traffic', 'tourism',
  'wealth', 'density', 'jobs', 'cost', 'environment',
]);

// Axes where a positive step costs the player rather than helps.
const DISTRICT_PROFILE_COST_AXES = Object.freeze(['traffic', 'cost']);

const DISTRICT_HEIGHT_CAP_DENSITY = Object.freeze({ high: DENSITY_HIGH, medium: DENSITY_MED, low: DENSITY_LOW });
const DISTRICT_HEIGHT_CAP_SCORE = Object.freeze({ high: 0, medium: -1, low: -2 });

// One row per map in hk-district-maps.js (docs/district-profiles-design.md §3). Omitted axes are 0.
const DISTRICT_PROFILES = Object.freeze({
  'victoria-harbour': { demandR: -1, demandC: 2, demandI: -2, taxC: 2, traffic: 2, tourism: 2, wealth: 1, jobs: 1, cost: 2, environment: -1, heightCap: 'high' },
  aberdeen: { tourism: 1, wealth: 1, cost: 1, environment: 1, heightCap: 'high' },
  'central-western': { demandC: 2, demandI: -2, taxC: 2, traffic: 1, tourism: 1, wealth: 1, jobs: 1, cost: 2, heightCap: 'high' },
  eastern: { demandR: 1, demandC: 1, demandI: -1, traffic: 1, density: 1, heightCap: 'high' },
  'sai-kung': { demandI: -2, traffic: 1, tourism: 2, wealth: 1, environment: 2, heightCap: 'medium' },
  stanley: { demandC: -1, demandI: -2, traffic: -1, tourism: 1, wealth: 2, cost: 1, environment: 2, heightCap: 'medium' },
  'wan-chai': { demandC: 1, demandI: -1, taxC: 1, traffic: 2, tourism: 1, density: 1, cost: 1, heightCap: 'high' },
  'yau-tsim-mong': { demandC: 2, demandI: -1, taxC: 1, traffic: 2, tourism: 2, density: 1, cost: 1, environment: -1, heightCap: 'high' },
  'sham-shui-po': { demandR: 1, demandC: 1, taxR: -1, traffic: 1, wealth: -2, density: 2, cost: -1, environment: -1, heightCap: 'high' },
  'kowloon-city': { demandR: 1, demandC: 1, heightCap: 'high' },
  'kwun-tong': { demandC: 1, demandI: 1, traffic: 2, wealth: -1, density: 1, jobs: 2, environment: -1, heightCap: 'high' },
  'tseung-kwan-o': { demandR: 2, demandC: -1, traffic: 1, density: 1, heightCap: 'high' },
  'tsuen-wan': { demandR: 1, demandC: 1, demandI: 1, traffic: 1, environment: -1, heightCap: 'high' },
  'sha-tin': { demandR: 2, demandI: -1, taxC: -1, environment: 1, heightCap: 'high' },
  'tai-po': { demandR: 1, demandC: -1, traffic: -1, environment: 1, heightCap: 'high' },
  'sheung-shui': { demandR: 1, demandC: 1, traffic: 1, wealth: -1, cost: -1, heightCap: 'high' },
  'yuen-long': { demandR: 1, demandC: -1, traffic: 1, cost: -2, heightCap: 'medium' },
  'tin-shui-wai': { demandR: 2, demandC: -1, demandI: -1, wealth: -2, jobs: -1, cost: -2, environment: 1, heightCap: 'high' },
  lantau: { demandI: -1, traffic: -1, tourism: 2, cost: 1, environment: 2, heightCap: 'medium' },
  lamma: { demandC: -1, demandI: -2, traffic: -2, tourism: 1, environment: 2, heightCap: 'low' },
  'tuen-mun': { demandR: 1, demandI: 1, traffic: 1, wealth: -1, cost: -1, environment: -1, heightCap: 'high' },
  'tsing-yi': { demandI: 2, taxI: 1, traffic: 1, wealth: -1, jobs: 1, environment: -2, heightCap: 'high' },
  'clear-water-bay': { demandC: -1, demandI: -1, tourism: 1, wealth: 1, cost: 1, environment: 2, heightCap: 'medium' },
});

function getDistrictProfile(districtId) {
  return DISTRICT_PROFILES[districtId] ?? null;
}

function getCityDistrictProfile() {
  return typeof city !== 'undefined' ? getDistrictProfile(city.districtProfileId) : null;
}

function getDistrictProfileStep(axis, profile = getCityDistrictProfile()) {
  return Math.max(-2, Math.min(2, Math.round(Number(profile?.[axis]) || 0)));
}

// The effect the city's district adds to `key` (a DISTRICT_PROFILE_STEP_EFFECTS name): an amount
// for additive keys, a share for the multiplying ones (use 1 + effect). 0 when there is no profile.
function getDistrictProfileEffect(key, profile = getCityDistrictProfile()) {
  const axis = key === 'tourismCapacity' ? 'tourism' : key === 'pollution' ? 'environment' : key;
  const step = getDistrictProfileStep(axis, profile);
  return step ? step * (DISTRICT_PROFILE_STEP_EFFECTS[key] ?? 0) : 0;
}

// Highest zone density the district allows (its height cap); DENSITY_HIGH without a profile.
function getDistrictMaxZoneDensity(profile = getCityDistrictProfile()) {
  return DISTRICT_HEIGHT_CAP_DENSITY[profile?.heightCap] ?? DENSITY_HIGH;
}

function getDistrictZoningCost(baseCost, profile = getCityDistrictProfile()) {
  return Math.round(baseCost * (1 + getDistrictProfileEffect('cost', profile)));
}

// A new or loaded city may sit under a lower cap than the densities picked for the last one.
function applyDistrictZoneDensityCap() {
  if (typeof selectedZoneDensity === 'undefined') return;
  const maxDensity = getDistrictMaxZoneDensity();
  Object.keys(selectedZoneDensity).forEach((zone) => {
    selectedZoneDensity[zone] = Math.min(selectedZoneDensity[zone] ?? DENSITY_LOW, maxDensity);
  });
  if (typeof updateZoneDensityBadges === 'function') updateZoneDensityBadges();
}

// Advantages count +1 a step, costs -1 a step, a height cap -1 (medium) or -2 (low). Every
// district sits between 0 and +2 (docs §4; guarded by a test).
function getDistrictProfileScore(profile) {
  if (!profile) return 0;
  const steps = DISTRICT_PROFILE_AXES.reduce((sum, axis) => {
    const step = getDistrictProfileStep(axis, profile);
    return sum + (DISTRICT_PROFILE_COST_AXES.includes(axis) ? -step : step);
  }, 0);
  return steps + (DISTRICT_HEIGHT_CAP_SCORE[profile.heightCap] ?? 0);
}

// Difficulty, 1 (easiest) to 5 stars. Flat land to build on sets the base - a district that is
// mostly hillside or sea is hard whatever its profile - and the profile moves it a star: score 0
// is one harder, +2 one easier. flatPercent is measureTerrainStats(terrain).flat.
function getDistrictDifficulty(profile, flatPercent) {
  const flat = Number(flatPercent) || 0;
  const terrainStars = flat >= 60 ? 1 : flat >= 45 ? 2 : flat >= 30 ? 3 : flat >= 18 ? 4 : 5;
  const profileShift = 1 - Math.max(0, Math.min(2, getDistrictProfileScore(profile)));
  return Math.max(1, Math.min(5, terrainStars + profileShift));
}

// The profile as player-facing traits: advantages and costs, strongest first, each with its
// step (for ▲▲ / ▼ marks). Labels are i18n keys district.trait.<axis>.
function describeDistrictProfile(profile) {
  const pros = [];
  const cons = [];
  if (!profile) return { pros, cons, heightCap: 'high' };
  DISTRICT_PROFILE_AXES.forEach((axis) => {
    const step = getDistrictProfileStep(axis, profile);
    if (!step) return;
    const good = DISTRICT_PROFILE_COST_AXES.includes(axis) ? step < 0 : step > 0;
    (good ? pros : cons).push({ axis, step });
  });
  const byStrength = (a, b) => Math.abs(b.step) - Math.abs(a.step);
  return { pros: pros.sort(byStrength), cons: cons.sort(byStrength), heightCap: profile.heightCap ?? 'high' };
}

function getDistrictDifficultyForId(districtId) {
  const terrain = typeof getHkDistrictTerrainData === 'function' ? getHkDistrictTerrainData(districtId) : null;
  const flat = terrain && typeof measureTerrainStats === 'function' ? measureTerrainStats(terrain).flat : 50;
  return getDistrictDifficulty(getDistrictProfile(districtId), flat);
}

function formatDistrictDifficulty(stars) {
  const count = Math.max(1, Math.min(5, Number(stars) || 1));
  return `${t('district.difficulty')} ${'★'.repeat(count)}${'☆'.repeat(5 - count)}`;
}

// Advantage (green) and cost (amber) chips, e.g. 「商業需求 ▲▲」「交通擠塞 ▲▲」. The marks show which
// way the quantity moves, so a cheaper land price reads 「地價 ▼▼」 among the advantages.
function renderDistrictTraits(container, profile) {
  if (!container) return;
  container.innerHTML = '';
  const { pros, cons, heightCap } = describeDistrictProfile(profile);
  const chip = (text, kind) => {
    const element = document.createElement('span');
    element.className = `district-trait is-${kind}`;
    element.textContent = text;
    container.appendChild(element);
  };
  const marks = (step) => (step > 0 ? '▲' : '▼').repeat(Math.abs(step));
  pros.forEach(({ axis, step }) => chip(`${t(`district.trait.${axis}`)} ${marks(step)}`, 'pro'));
  cons.forEach(({ axis, step }) => chip(`${t(`district.trait.${axis}`)} ${marks(step)}`, 'con'));
  if (heightCap !== 'high') chip(t(`district.heightCap.${heightCap}`), 'con');
}

// 「更多訊息」 panel: the city's district, its difficulty and traits; hidden without a profile.
function updateDistrictProfilePanel() {
  const section = document.getElementById('budget-district');
  if (!section) return;
  const districtId = typeof city !== 'undefined' ? city.districtProfileId : '';
  const profile = getDistrictProfile(districtId);
  section.hidden = !profile;
  if (!profile) return;
  const info = typeof HK_DISTRICT_INFO !== 'undefined' ? HK_DISTRICT_INFO[districtId] : null;
  const name = info?.names?.[currentLanguage] ?? info?.names?.en ?? districtId;
  const title = document.getElementById('budget-district-name');
  const stars = document.getElementById('budget-district-difficulty');
  if (title) title.textContent = `${t('district.sectionTitle')}：${name}`;
  if (stars) stars.textContent = formatDistrictDifficulty(getDistrictDifficultyForId(districtId));
  renderDistrictTraits(document.getElementById('budget-district-traits'), profile);
}

if (typeof document !== 'undefined') {
  document.addEventListener('languagechange', () => updateDistrictProfilePanel());
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DISTRICT_PROFILES,
    DISTRICT_PROFILE_AXES,
    getDistrictProfileScore,
    getDistrictDifficulty,
    getDistrictProfileEffect,
    describeDistrictProfile,
  };
}
