// Build a compact, location-aware story seed from the simulated map. The AI
// edits this event into a headline; it does not invent the underlying event.

const NEWS_DISTRICT_PROFILES = {
  nw: { name: '青嶺區', roots: ['青嶺', '翠湖', '民安', '樂景'] },
  ne: { name: '東灣區', roots: ['東灣', '海怡', '康景', '朝陽'] },
  sw: { name: '南濱區', roots: ['南濱', '漁安', '海晴', '麗港'] },
  se: { name: '啟明區', roots: ['啟明', '德安', '都會', '彩雲'] },
};

const NEWS_DESK_PROFILES = {
  community: {
    label: '社區民生',
    actors: ['屋苑街坊', '區內居民', '地區義工'],
    types: ['residential', 'park_small', 'park_large', 'sports_ground_small', 'sports_ground_large'],
  },
  transport: {
    label: '交通消息',
    actors: ['繁忙時間上班族', '巴士乘客', '區內送貨司機'],
    types: ['commercial', 'industrial', 'residential'],
  },
  economy: {
    label: '地區經濟',
    actors: ['街市商戶', '小店東主', '區內求職者'],
    types: ['commercial', 'industrial', 'stock_exchange'],
  },
  education: {
    label: '教育校園',
    actors: ['學生家長', '區內教師', '放學學生'],
    types: ['primary_school', 'secondary_school', 'library', 'community_college', 'university'],
  },
  health: {
    label: '健康醫療',
    actors: ['覆診長者', '前線醫護', '照顧者'],
    types: ['hospital', 'residential'],
  },
  environment: {
    label: '環境社區',
    actors: ['晨運街坊', '公園使用者', '區內居民'],
    types: ['park_small', 'park_large', 'sports_ground_small', 'sports_ground_large', 'residential'],
  },
  publicSafety: {
    label: '治安消防',
    actors: ['夜更店員', '屋苑居民', '地區巡邏人員'],
    types: ['police_station', 'fire_station', 'commercial', 'residential'],
  },
  weather: {
    label: '天氣交通',
    actors: ['趕上班市民', '戶外工作人員', '沿岸居民'],
    types: ['commercial', 'residential', 'park_small', 'park_large'],
  },
};

const NEWS_LOCATION_SUFFIXES = {
  residential: ['邨', '苑', '花園'],
  commercial: ['街市', '商場', '商業中心'],
  industrial: ['工業中心', '工業邨', '創科園'],
  primary_school: ['小學', '學校'],
  secondary_school: ['中學', '書院'],
  library: ['公共圖書館'],
  community_college: ['社區書院'],
  university: ['大學'],
  hospital: ['醫院'],
  police_station: ['警署'],
  fire_station: ['消防局'],
  park_small: ['休憩公園', '街坊公園'],
  park_large: ['中央公園', '海濱公園'],
  sports_ground_small: ['運動場'],
  sports_ground_large: ['體育中心'],
  stock_exchange: ['金融中心'],
  legislative_council: ['市政議事廳'],
  power_plant_coal: ['發電廠'],
  power_plant_solar: ['太陽能場'],
  power_plant_nuclear: ['能源中心'],
};

function newsStableHash(value) {
  let hash = 2166136261;
  const source = String(value || '');
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getNewsDistrictKey(row, col) {
  if (typeof getDistrictKeyForTile === 'function') return getDistrictKeyForTile(row, col);
  const vertical = row < MAP_HEIGHT / 2 ? 'n' : 's';
  const horizontal = col < MAP_WIDTH / 2 ? 'w' : 'e';
  return `${vertical}${horizontal}`;
}

function getNewsDistrictProfile(districtKey) {
  const sign = typeof getDistrictSignByKey === 'function' ? getDistrictSignByKey(districtKey) : null;
  if (sign) {
    const root = String(sign.name).replace(/區$/u, '') || String(sign.name);
    return { name: sign.name, englishName: sign.englishName || '', roots: [root], custom: true };
  }
  return NEWS_DISTRICT_PROFILES[districtKey] || NEWS_DISTRICT_PROFILES.nw;
}

function listNewsLocations() {
  return Object.entries(buildingData).map(([id, record]) => {
    const [row, col] = id.split(':').map(Number);
    if (!Number.isFinite(row) || !Number.isFinite(col) || !record?.type) return null;
    return { id, row, col, record, districtKey: getNewsDistrictKey(row, col) };
  }).filter(Boolean);
}

function getNewsLocationName(location, district) {
  const customName = typeof location?.record?.customName === 'string'
    ? location.record.customName.trim()
    : '';
  if (customName) return customName.slice(0, 60);
  if (!location) return `${district.name}主要街道`;

  const roots = district.roots;
  const root = roots[newsStableHash(location.id) % roots.length];
  const suffixes = NEWS_LOCATION_SUFFIXES[location.record.type] || ['社區設施'];
  const suffix = suffixes[newsStableHash(`${location.id}:${location.record.type}`) % suffixes.length];
  return `${root}${suffix}`;
}

function chooseNewsDesk(recentHistory, locations) {
  if (city.weather?.typhoonStage !== 'none' || (city.weather?.rainfallMm ?? 0) >= 50) return 'weather';
  if ((city.epidemicSeverity ?? 0) >= 0.25 || (city.hospitalUtilization ?? 0) >= 0.85) return 'health';
  if ((city.trafficIndex ?? 0) >= 0.55) return 'transport';
  if ((city.pollution ?? 0) >= 65) return 'environment';
  if ((city.crimeRateIndex ?? 0) >= 0.55) return 'publicSafety';
  if ((city.unemploymentRate ?? 0) >= 0.1) return 'economy';

  const availableTypes = new Set(locations.map((location) => location.record.type));
  const fullRotation = ['community', 'transport', 'economy', 'education', 'health', 'environment', 'publicSafety'];
  const rotation = fullRotation.filter((desk) => (
    NEWS_DESK_PROFILES[desk].types.some((type) => availableTypes.has(type))
  ));
  if (!rotation.length) rotation.push('community');
  const recentDesks = new Set(recentHistory.slice(-2).map((item) => item.desk));
  const start = Math.abs(Math.floor(city.tick / Math.max(1, TICKS_PER_MONTH)) + recentHistory.length) % rotation.length;
  for (let offset = 0; offset < rotation.length; offset++) {
    const candidate = rotation[(start + offset) % rotation.length];
    if (!recentDesks.has(candidate)) return candidate;
  }
  return rotation[start];
}

function getNewsEventDetail(desk, metrics = {}) {
  const traffic = Number.isFinite(metrics.trafficPct) ? metrics.trafficPct : Math.round((city.trafficIndex ?? 0) * 100);
  const happiness = Math.round((city.happiness ?? 0) * 100);
  const unemployment = Math.round((city.unemploymentRate ?? 0) * 100);
  const pollution = Number.isFinite(metrics.pollutionPct) ? metrics.pollutionPct : Math.round(city.pollution ?? 0);
  const education = Number.isFinite(metrics.educationPct) ? metrics.educationPct : Math.round((city.educationAverageLevel ?? 0) * 100);
  const health = Number.isFinite(metrics.healthPct) ? metrics.healthPct : Math.round((city.healthIndex ?? 0.5) * 100);
  const landValue = Number.isFinite(metrics.landValuePct) ? metrics.landValuePct : 35;
  const crime = Math.round((city.crimeRateIndex ?? 0) * 100);
  const weather = city.weather ?? {};

  if (desk === 'weather') return {
    angle: weather.typhoonStage !== 'none' ? '風暴下的社區應變' : '雨勢與市民出行',
    event: `氣溫${weather.temperatureC ?? 24}度、雨量${weather.rainfallMm ?? 0}毫米、風速每小時${weather.windKph ?? 0}公里，市民調整出行安排`,
  };
  if (desk === 'transport') return {
    angle: traffic >= 55 ? '繁忙時間擠塞' : '地區接駁情況',
    event: `區內道路平均交通負荷為${traffic}%，通勤人士關注巴士站候車、路面擠塞與區內接駁`,
  };
  if (desk === 'economy') return {
    angle: unemployment >= 10 ? '地區就業壓力' : '地價與小店生意',
    event: `區內地價估值為${landValue}%，人口約${Math.round(metrics.population || 0)}，全市失業率為${unemployment}%，商戶留意人流、租值與消費變化`,
  };
  if (desk === 'education') return {
    angle: '校園與社區配套',
    event: `區內教育覆蓋為${education}%，共有${Math.round(metrics.schools || 0)}項學校或教育設施，家長關注校園與放學時段配套`,
  };
  if (desk === 'health') return {
    angle: (city.epidemicSeverity ?? 0) > 0 ? '疫情與醫療服務' : '地區健康服務',
    event: `區內健康指數為${health}%，共有${Math.round(metrics.hospitals || 0)}間醫院，全市醫院使用率為${Math.round((city.hospitalUtilization ?? 0) * 100)}%，居民關注長者與基層醫療服務`,
  };
  if (desk === 'environment') return {
    angle: pollution >= 65 ? '空氣污染與戶外活動' : '公園與街坊生活',
    event: `區內平均污染水平為${pollution}%，地價估值為${landValue}%，居民按空氣與天氣情況安排晨運、公園及戶外活動`,
  };
  if (desk === 'publicSafety') return {
    angle: crime >= 55 ? '夜間治安關注' : '社區巡邏與消防',
    event: `治安風險指數為${crime}，街坊關注屋苑、商舖及夜間街道的巡邏與消防服務`,
  };
  return {
    angle: happiness >= 70 ? '街坊日常與社區活力' : '民生配套與居民感受',
    event: `區內人口約${Math.round(metrics.population || 0)}、地價估值${landValue}%、供電覆蓋${Math.round(metrics.poweredPct || 0)}%，居民關注屋苑、街市、公園與日常配套`,
  };
}

function countDistrictBuildings(locations, districtKey) {
  const counts = { residential: 0, commercial: 0, industrial: 0, civic: 0 };
  locations.forEach((location) => {
    if (location.districtKey !== districtKey) return;
    const type = location.record.type;
    if (type === 'residential' || type === 'commercial' || type === 'industrial') counts[type]++;
    else counts.civic++;
  });
  return counts;
}

function buildCityNewsEvent(recentHistory = []) {
  const history = Array.isArray(recentHistory) ? recentHistory : [];
  const locations = listNewsLocations();
  const signedLocations = locations.filter((location) => String(location.districtKey).startsWith('sign:'));
  const newsLocations = signedLocations.length ? signedLocations : locations;
  const desk = chooseNewsDesk(history, newsLocations);
  const profile = NEWS_DESK_PROFILES[desk] || NEWS_DESK_PROFILES.community;
  const preferred = newsLocations.filter((location) => profile.types.includes(location.record.type));
  const pool = preferred.length ? preferred : newsLocations;
  const historySeed = history.map((item) => item.location).join('|');
  const location = pool.length
    ? pool[(newsStableHash(`${city.tick}:${desk}:${history.length}:${historySeed}`)) % pool.length]
    : null;
  const customDistrictKeys = typeof getDistrictSigns === 'function'
    ? getDistrictSigns().map((sign) => `sign:${sign.id}`)
    : [];
  const fallbackDistrictKeys = customDistrictKeys.length ? customDistrictKeys : ['nw', 'ne', 'sw', 'se'];
  const fallbackDistrictIndex = newsStableHash(`${city.tick}:${desk}`) % fallbackDistrictKeys.length;
  const districtKey = location?.districtKey || fallbackDistrictKeys[fallbackDistrictIndex];
  const district = getNewsDistrictProfile(districtKey);
  const districtMetrics = typeof getDistrictMetrics === 'function' ? getDistrictMetrics(districtKey) : {};
  const detail = getNewsEventDetail(desk, districtMetrics);
  const actor = profile.actors[newsStableHash(`${city.tick}:${districtKey}:${desk}`) % profile.actors.length];

  return {
    desk,
    deskLabel: profile.label,
    district: district.name,
    districtEnglishName: district.englishName || '',
    districtKey,
    location: getNewsLocationName(location, district),
    locationType: location?.record?.type || 'district',
    actor,
    angle: detail.angle,
    event: detail.event,
    districtBuildings: countDistrictBuildings(locations, districtKey),
    districtMetrics,
  };
}
