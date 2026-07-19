
const TICKER_NEWS_FALLBACK_KEYS = [
  'news.fallback.1',
  'news.fallback.2',
  'news.fallback.3',
  'news.fallback.4',
  'news.fallback.5',
];

let tickerShowNextTip = null;
let lastTickerTopicId = '';
let tickerCycleCount = 0;
let tickerAdvanceTimer = null;
let tickerTransitionEndHandler = null;
let pendingLandmarkTickerNotices = [];

function toPercent(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric * 100)));
}

// Queued by announceLandmarkUnlockNotice() (newspaper.js) the moment a
// special building's unlock threshold is first crossed; drained one at a
// time by the urgent-news check below so it interrupts the normal cycle.
function queueLandmarkTickerNotice(text) {
  if (text) pendingLandmarkTickerNotices.push(text);
}

function getStockCrashTickerNews() {
  const crash = city.stockMarket?.crash;
  if (!crash?.active) return null;
  const opening = Math.max(1, Math.round(Number(crash.openingHsi) || HSI_BASE_LEVEL)).toLocaleString();
  const closing = Math.max(1, Math.round(Number(crash.closingHsi) || HSI_BASE_LEVEL)).toLocaleString();
  const percent = Math.round((Number(crash.severity) || 0) * 100);
  const months = Math.max(0, Math.floor(Number(crash.monthsLeft) || 0));
  const language = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'zhHant';
  const variant = (Math.max(0, Number(crash.newsVariant) || 0) + tickerCycleCount) % 5;

  if (language === 'en') {
    return [
      `MARKET CRASH: The HSI plunged from ${opening} at the open to ${closing} at the close. Investor Ding Hai calls it “only a technical correction.”`,
      `MARKET CRASH: Failed investors are reportedly queueing on the Stock Exchange rooftop “for some fresh air.” The index fell ${percent}%.`,
      `Panic selling grips the market as the HSI loses ${percent}% in one day; the bear phase may persist for another ${months} months.`,
      `Finance and technology shares lead a broad collapse. The HSI closes at ${closing}, down from ${opening}.`,
      `Brokers urge calm after a ${percent}% rout; forum users reply that calm is the only asset still not suspended.`,
    ][variant];
  }
  if (language === 'ja') {
    return [
      `【株価暴落】ハンセン指数は始値${opening}から終値${closing}へ急落。投資家の丁蟹氏は「単なるテクニカル調整」と強調。`,
      `【株価暴落】投資に失敗した人々が証券取引所の屋上で「涼む」ため列を作っている。指数は${percent}%下落。`,
      `パニック売りで指数は一日${percent}%下落。弱気相場はあと${months}か月続く可能性。`,
      `金融・ハイテク株が全面安を主導。指数は${opening}から${closing}で取引を終えた。`,
      `${percent}%の急落を受け証券会社は冷静な対応を呼びかけ。掲示板では「冷静さだけが取引停止になっていない」と皮肉。`,
    ][variant];
  }
  return [
    `【股災】恆指一天內從開市 ${opening} 點急跌至收市 ${closing} 點。股民丁蟹表示：「只是技術性調整，不要怕。」`,
    `【股災】投資失敗的人正在排隊上股票交易所天台乘涼；恆指單日暴跌 ${percent}%。`,
    `【金融風暴】恐慌性拋售席捲香城，恆指一日蒸發 ${percent}%，跌市或再持續約 ${months} 個月。`,
    `【港股收市】金融及科技股全線急挫，恆指由 ${opening} 點跌至 ${closing} 點，交易大堂一片死寂。`,
    `【市場消息】券商在 ${percent}% 暴跌後呼籲股民冷靜，網民回應：「而家唯一冇停牌嘅資產就係冷靜。」`,
  ][variant];
}

function getUrgentCityNews() {
  const cityName = city.name || getDefaultCityName();
  if (pendingLandmarkTickerNotices.length) return pendingLandmarkTickerNotices.shift();
  const weatherWarning = typeof getUrgentWeatherNews === 'function' ? getUrgentWeatherNews() : null;
  if (weatherWarning) return weatherWarning;
  const powerWarning = getPowerPlantTickerWarning();
  if (powerWarning) return powerWarning;
  const stockCrashWarning = getStockCrashTickerNews();
  if (stockCrashWarning) return stockCrashWarning;

  if (city.budget < 0 && Math.abs(city.monthlyIncome - city.monthlyExpenses) > 5000) {
    return t('news.urgent.deficit', {
      city: cityName,
      budget: formatMoney(city.budget),
    });
  }

  if ((city.crimeRateIndex ?? 0) >= 0.68) {
    return t('news.urgent.crime', { city: cityName });
  }

  if ((Number(city.pollution ?? 0) / 200) >= 0.72) {
    return t('news.urgent.pollution', { city: cityName });
  }

  const unemploymentPct = Math.round((city.unemploymentRate ?? 0) * 100);
  if (unemploymentPct >= 25) {
    return t('news.urgent.unemployment', { city: cityName, rate: String(unemploymentPct) });
  }

  return null;
}

function buildHongKongFinanceTickerItems(context) {
  const {
    cityName,
    hsi,
    hsiDelta,
    net,
    demandC,
    ruleOfLaw,
    actActive,
  } = context;

  const items = [];

  const deltaText = `${hsiDelta >= 0 ? '+' : ''}${hsiDelta.toLocaleString()}`;

  if (hsiDelta >= 180) {
    items.push({
      id: 'hk-close-rally',
      weight: 12,
      text: t('news.headline.hkCloseRally', {
        city: cityName,
        hsi: hsi.toLocaleString(),
        delta: deltaText,
      }),
    });
  } else if (hsiDelta <= -180) {
    items.push({
      id: 'hk-close-drop',
      weight: 12,
      text: t('news.headline.hkCloseDrop', {
        city: cityName,
        hsi: hsi.toLocaleString(),
        delta: deltaText,
      }),
    });
  } else {
    items.push({
      id: 'hk-close-range',
      weight: 8,
      text: t('news.headline.hkCloseRange', {
        city: cityName,
        hsi: hsi.toLocaleString(),
      }),
    });
  }

  if (demandC >= 0.35 && net > 0) {
    items.push({
      id: 'hk-risk-on',
      weight: 9,
      text: t('news.headline.hkFlowRiskOn', {
        city: cityName,
        demandC: `${Math.round(demandC * 100)}%`,
        net: formatMoney(net),
      }),
    });
  } else if (demandC <= -0.15 || net < 0) {
    items.push({
      id: 'hk-risk-off',
      weight: 9,
      text: t('news.headline.hkFlowRiskOff', {
        city: cityName,
        demandC: `${Math.round(demandC * 100)}%`,
        net: formatMoney(net),
      }),
    });
  }

  if (actActive) {
    items.push({
      id: 'hk-rule-law-premium',
      weight: 7,
      text: t('news.headline.hkRuleLawPremium', {
        city: cityName,
        ruleOfLaw: `${ruleOfLaw}%`,
      }),
    });
  }

  return items;
}

function buildTickerNewsCandidates() {
  const cityName = city.name || getDefaultCityName();
  const higherEdu = toPercent(city.educationHigherIndex);
  const basicEdu = toPercent(city.educationBasicIndex);
  const scienceShare = toPercent(city.scienceIndustryShare);
  const happiness = toPercent(city.happiness);
  const roadCoverage = toPercent(city.trafficCoverage);
  const pollution = toPercent(Number(city.pollution ?? 0) / 200);
  const crime = toPercent(city.crimeRateIndex);
  const population = Math.max(0, Number(city.population) || 0);
  const unemploymentPct = Math.round((city.unemploymentRate ?? 0) * 100);
  const highEduUnemploymentPct = Math.round((city.highEduUnemploymentRate ?? 0) * 100);
  const net = Number(city.monthlyIncome || 0) - Number(city.monthlyExpenses || 0);
  const demandR = Number(city.demandR || 0);
  const demandC = Number(city.demandC || 0);
  const demandI = Number(city.demandI || 0);
  const hsi = Number(city.stockMarket?.hsi || HSI_BASE_LEVEL);
  const prevHsi = Number(city.stockMarket?.prevHsi || hsi);
  const hsiDelta = hsi - prevHsi;
  const ruleOfLaw = Math.round((city.ruleOfLawIndex ?? 0) * 100);
  const actActive = isPolicyActive('stockExchangeAct');

  const items = [];

  if (typeof buildWeatherTickerCandidates === 'function') {
    items.push(...buildWeatherTickerCandidates());
  }
  if (typeof buildCitizenTickerCandidates === 'function') {
    items.push(...buildCitizenTickerCandidates());
  }
  if (typeof buildAiTickerCandidates === 'function') {
    items.push(...buildAiTickerCandidates());
  }

  if (higherEdu >= 80) {
    items.push({
      id: 'higher-edu-global100',
      weight: 10,
      text: t('news.headline.higherEduGlobal100', { city: cityName, higherEdu: String(higherEdu) }),
    });
  }

  if (basicEdu >= 75 && higherEdu >= 60) {
    items.push({
      id: 'education-ecosystem',
      weight: 8,
      text: t('news.headline.educationEcosystem', { city: cityName }),
    });
  }

  if (scienceShare >= 45) {
    items.push({
      id: 'science-economy',
      weight: 8,
      text: t('news.headline.scienceEconomy', { city: cityName, scienceShare: String(scienceShare) }),
    });
  }

  if (net >= 20000) {
    items.push({
      id: 'fiscal-surplus-strong',
      weight: 8,
      text: t('news.headline.fiscalSurplusStrong', { city: cityName, net: formatMoney(net) }),
    });
  } else if (net < 0) {
    items.push({
      id: 'fiscal-deficit',
      weight: 9,
      text: t('news.headline.fiscalDeficit', { city: cityName, net: formatMoney(net) }),
    });
  }

  if (happiness >= 78) {
    items.push({
      id: 'livability-award',
      weight: 7,
      text: t('news.headline.livabilityAward', { city: cityName, happiness: String(happiness) }),
    });
  } else if (happiness <= 45) {
    items.push({
      id: 'livability-pressure',
      weight: 9,
      text: t('news.headline.livabilityPressure', { city: cityName, happiness: String(happiness) }),
    });
  }

  if (roadCoverage >= 72) {
    items.push({
      id: 'transport-grid',
      weight: 6,
      text: t('news.headline.transportGrid', { city: cityName, roadCoverage: String(roadCoverage) }),
    });
  }

  if (population >= 100000) {
    items.push({
      id: 'population-100k',
      weight: 7,
      text: t('news.headline.population100k', { city: cityName, population: population.toLocaleString() }),
    });
  } else if (population >= 50000) {
    items.push({
      id: 'population-50k',
      weight: 5,
      text: t('news.headline.population50k', { city: cityName, population: population.toLocaleString() }),
    });
  }

  if (pollution >= 60) {
    items.push({
      id: 'pollution-watch',
      weight: 8,
      text: t('news.headline.pollutionWatch', { city: cityName, pollution: String(pollution) }),
    });
  } else if (pollution <= 28) {
    items.push({
      id: 'green-city',
      weight: 6,
      text: t('news.headline.greenCity', { city: cityName }),
    });
  }

  if (crime >= 55) {
    items.push({
      id: 'crime-watch',
      weight: 8,
      text: t('news.headline.crimeWatch', { city: cityName, crime: String(crime) }),
    });
  } else {
    items.push({
      id: 'crime-stable',
      weight: 4,
      text: t('news.headline.crimeStable', { city: cityName }),
    });
  }

  // Unemployment tiered news
  if (unemploymentPct >= 20) {
    items.push({
      id: 'unemployment-crisis',
      weight: 11,
      text: t('news.headline.unemploymentCrisis', { city: cityName, rate: String(unemploymentPct) }),
    });
  } else if (unemploymentPct >= 12) {
    items.push({
      id: 'unemployment-high',
      weight: 9,
      text: t('news.headline.unemploymentHigh', { city: cityName, rate: String(unemploymentPct) }),
    });
  } else if (unemploymentPct >= 6) {
    items.push({
      id: 'unemployment-moderate',
      weight: 6,
      text: t('news.headline.unemploymentModerate', { city: cityName, rate: String(unemploymentPct) }),
    });
  } else if (unemploymentPct <= 3 && population >= 5000) {
    items.push({
      id: 'unemployment-low',
      weight: 5,
      text: t('news.headline.unemploymentLow', { city: cityName, rate: String(unemploymentPct) }),
    });
  }

  // Structural (high-edu) unemployment
  if (highEduUnemploymentPct >= 30 && higherEdu >= 40) {
    items.push({
      id: 'high-edu-unemployment',
      weight: 8,
      text: t('news.headline.highEduUnemployment', {
        city: cityName,
        rate: String(highEduUnemploymentPct),
      }),
    });
  }

  if (demandR > 0.2 && demandC > 0 && demandI > 0) {
    items.push({
      id: 'growth-synced',
      weight: 6,
      text: t('news.headline.growthSynced', { city: cityName }),
    });
  } else if (demandR < -0.2) {
    items.push({
      id: 'housing-demand-cool',
      weight: 6,
      text: t('news.headline.housingDemandCool', { city: cityName }),
    });
  }

  if (population >= 10000 && !hasBuildingType('legislative_council')) {
    items.push({
      id: 'council-buildable',
      weight: 9,
      text: t('news.headline.councilBuildable', { city: cityName, population: population.toLocaleString() }),
    });
  }

  if (
    population >= 50000
    && isPolicyActive('stockExchangeAct')
    && hasBuildingType('legislative_council')
    && !hasBuildingType('stock_exchange')
  ) {
    items.push({
      id: 'stock-exchange-buildable',
      weight: 9,
      text: t('news.headline.stockExchangeBuildable', { city: cityName, population: population.toLocaleString() }),
    });
  }

  if (hasBuildingType('stock_exchange')) {
    items.push(...buildHongKongFinanceTickerItems({
      cityName,
      hsi,
      hsiDelta,
      net,
      demandC,
      ruleOfLaw,
      actActive,
    }));

    if (hsiDelta >= 120) {
      items.push({
        id: 'hsi-rally',
        weight: 9,
        text: t('news.headline.hsiRally', { city: cityName, hsi: hsi.toLocaleString(), delta: `+${hsiDelta.toLocaleString()}` }),
      });
    } else if (hsiDelta <= -120) {
      items.push({
        id: 'hsi-pullback',
        weight: 9,
        text: t('news.headline.hsiPullback', { city: cityName, hsi: hsi.toLocaleString(), delta: hsiDelta.toLocaleString() }),
      });
    } else {
      items.push({
        id: 'hsi-flat',
        weight: 5,
        text: t('news.headline.hsiFlat', { city: cityName, hsi: hsi.toLocaleString() }),
      });
    }
  }

  if (!items.length) {
    return TICKER_NEWS_FALLBACK_KEYS.map((key, index) => ({
      id: `fallback-${index}`,
      weight: 1,
      text: t(key, { city: cityName }),
    }));
  }

  return items;
}

function pickTickerNewsHeadline() {
  const urgent = getUrgentCityNews();
  if (urgent && tickerCycleCount % 2 === 0) {
    return { id: 'urgent', text: t('news.breakingPrefix', { headline: urgent }) };
  }

  const pendingAi = typeof takePendingAiTickerHeadline === 'function'
    ? takePendingAiTickerHeadline()
    : null;
  if (pendingAi) return pendingAi;

  const pool = buildTickerNewsCandidates();
  const weighted = [];
  pool.forEach((item) => {
    const repeats = Math.max(1, Math.min(12, Math.round(item.weight || 1)));
    for (let i = 0; i < repeats; i += 1) weighted.push(item);
  });

  if (!weighted.length) {
    const cityName = city.name || getDefaultCityName();
    const key = TICKER_NEWS_FALLBACK_KEYS[tickerCycleCount % TICKER_NEWS_FALLBACK_KEYS.length];
    return { id: 'fallback', text: t(key, { city: cityName }) };
  }

  let selected = weighted[Math.floor(Math.random() * weighted.length)];
  if (selected.id === lastTickerTopicId && weighted.length > 1) {
    selected = weighted.find((item) => item.id !== lastTickerTopicId) || selected;
  }
  return selected;
}

function startTicker() {
  const track = document.getElementById('tip-ticker-track');
  const inner = document.getElementById('tip-ticker-inner');
  if (!track || !inner) return;

  if (tickerAdvanceTimer) {
    clearTimeout(tickerAdvanceTimer);
    tickerAdvanceTimer = null;
  }

  if (tickerTransitionEndHandler) {
    inner.removeEventListener('transitionend', tickerTransitionEndHandler);
    tickerTransitionEndHandler = null;
  }

  const scheduleFallbackAdvance = (delayMs) => {
    if (tickerAdvanceTimer) clearTimeout(tickerAdvanceTimer);
    tickerAdvanceTimer = setTimeout(() => {
      if (tickerShowNextTip) tickerShowNextTip();
    }, Math.max(1200, Math.round(delayMs)));
  };

  function showNextTip() {
    tickerCycleCount += 1;
    const headline = pickTickerNewsHeadline();
    lastTickerTopicId = headline.id;
    const cityName = city.name || getDefaultCityName();
    const nextText = String(headline?.text || '').trim() || t('news.fallback.1', { city: cityName });
    inner.textContent = nextText;

    // Measure actual rendered width after setting content
    const trackW   = track.offsetWidth;
    const textW    = inner.scrollWidth;
    const SPEED    = 78;
    if (trackW <= 0 || textW <= 0) {
      inner.style.transition = 'none';
      inner.style.left = '0px';
      inner.style.transform = 'translate3d(0, -50%, 0)';
      scheduleFallbackAdvance(1200);
      return;
    }
    const duration = Math.max(6, (trackW + textW) / SPEED);

    // Snap to just off the right edge (no transition), then glide left
    inner.style.transition = 'none';
    inner.style.left = '0px';
    inner.style.transform = `translate3d(${trackW}px, -50%, 0)`;
    void inner.offsetWidth;                       // commit the starting position
    inner.style.transition = `transform ${duration}s linear`;
    inner.style.transform = `translate3d(-${textW}px, -50%, 0)`;

    // Fallback for cases where transitionend is skipped (tab hidden, style recalculation, etc.)
    scheduleFallbackAdvance((duration + 0.25) * 1000);
  }

  tickerShowNextTip = showNextTip;
  showNextTip();
  tickerTransitionEndHandler = (event) => {
    if (event && event.propertyName && event.propertyName !== 'transform') return;
    if (tickerAdvanceTimer) {
      clearTimeout(tickerAdvanceTimer);
      tickerAdvanceTimer = null;
    }
    showNextTip();
  };
  inner.addEventListener('transitionend', tickerTransitionEndHandler);
}

function getPowerPlantTickerWarning() {
  const cityName = city.name || getDefaultCityName();
  const plant = Object.values(buildingData).find((record) => POWER_PLANT_STATS[record.type] && isPowerPlantNearRetirement(record));
  if (plant) {
    const remaining = getPowerPlantRemainingMonths(plant);
    const label = plant.type === 'power_plant_coal' ? t('building.coalPlant') : t('building.solarPlant');
    return t('news.urgent.oldPlantStory', {
      city: cityName,
      plant: label,
      remaining: String(remaining),
    });
  }

  if ((city.totalPowerSupply ?? 0) < (city.totalPowerDemand ?? 0) && (city.totalPowerDemand ?? 0) > 0) {
    return t('news.urgent.blackoutStory', {
      city: cityName,
      supply: city.totalPowerSupply ?? 0,
      demand: city.totalPowerDemand ?? 0,
    });
  }

  return null;
}

document.addEventListener('languagechange', () => {
  updateStatusAlert();
  if (tickerShowNextTip) tickerShowNextTip();
});
