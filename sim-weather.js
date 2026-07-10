// Lightweight fictional weather simulation. AI/news layers consume this state,
// while the core game remains deterministic enough to run without a service.

const WEATHER_TYPHOON_MONTHS = new Set([5, 6, 7, 8, 9, 10, 11]);

function weatherClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickWeightedWeather(options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = Math.random() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.value;
  }
  return options[options.length - 1].value;
}

function getSeasonalWeatherProfile(month) {
  if (month >= 6 && month <= 9) {
    return {
      baseTemperature: 29,
      conditions: [
        { value: 'hot', weight: 28 },
        { value: 'showers', weight: 27 },
        { value: 'heavyRain', weight: 14 },
        { value: 'cloudy', weight: 18 },
        { value: 'clear', weight: 13 },
      ],
    };
  }
  if (month === 12 || month <= 2) {
    return {
      baseTemperature: 17,
      conditions: [
        { value: 'cool', weight: 35 },
        { value: 'clear', weight: 30 },
        { value: 'cloudy', weight: 25 },
        { value: 'windy', weight: 10 },
      ],
    };
  }
  return {
    baseTemperature: 24,
    conditions: [
      { value: 'clear', weight: 30 },
      { value: 'cloudy', weight: 28 },
      { value: 'showers', weight: 22 },
      { value: 'windy', weight: 12 },
      { value: 'heavyRain', weight: 8 },
    ],
  };
}

function setTyphoonStage(stage, ticksLeft, strength) {
  city.weather.typhoonStage = stage;
  city.weather.typhoonTicksLeft = ticksLeft;
  city.weather.typhoonStrength = weatherClamp(strength, 0, 1);
}

function updateTyphoonState() {
  const weather = city.weather;
  if (weather.typhoonStage === 'none') {
    if (WEATHER_TYPHOON_MONTHS.has(city.month) && Math.random() < 0.035) {
      setTyphoonStage('approaching', 1 + Math.floor(Math.random() * 2), 0.35 + Math.random() * 0.35);
    }
    return;
  }

  weather.typhoonTicksLeft = Math.max(0, weather.typhoonTicksLeft - 1);
  if (weather.typhoonTicksLeft > 0) return;

  if (weather.typhoonStage === 'approaching') {
    setTyphoonStage('signal3', 1, weather.typhoonStrength + 0.08);
  } else if (weather.typhoonStage === 'signal3') {
    if (weather.typhoonStrength >= 0.58 || Math.random() < 0.38) {
      setTyphoonStage('signal8', 1, Math.max(0.68, weather.typhoonStrength + 0.16));
    } else {
      setTyphoonStage('departing', 1, weather.typhoonStrength * 0.7);
    }
  } else if (weather.typhoonStage === 'signal8') {
    setTyphoonStage('departing', 1, weather.typhoonStrength * 0.72);
  } else if (weather.typhoonStage === 'departing') {
    setTyphoonStage('recovery', 1, weather.typhoonStrength * 0.35);
  } else {
    setTyphoonStage('none', 0, 0);
  }
}

function applyWeatherReadings() {
  const weather = city.weather;
  const profile = getSeasonalWeatherProfile(city.month);

  if (weather.conditionTicksLeft <= 0) {
    weather.condition = pickWeightedWeather(profile.conditions);
    weather.conditionTicksLeft = 1 + Math.floor(Math.random() * 2);
  } else {
    weather.conditionTicksLeft--;
  }

  let temperature = profile.baseTemperature + (Math.random() * 5 - 2.5);
  let rainfall = 0;
  let wind = 7 + Math.random() * 15;

  if (weather.condition === 'hot') temperature += 4;
  if (weather.condition === 'cool') temperature -= 5;
  if (weather.condition === 'showers') rainfall = 4 + Math.random() * 18;
  if (weather.condition === 'heavyRain') rainfall = 28 + Math.random() * 65;
  if (weather.condition === 'windy') wind += 22;

  const stage = weather.typhoonStage;
  if (stage === 'approaching') {
    weather.condition = 'windy';
    wind = Math.max(wind, 35 + weather.typhoonStrength * 25);
    rainfall = Math.max(rainfall, 8 + weather.typhoonStrength * 18);
  } else if (stage === 'signal3') {
    weather.condition = 'heavyRain';
    wind = 55 + weather.typhoonStrength * 30;
    rainfall = 35 + weather.typhoonStrength * 45;
  } else if (stage === 'signal8') {
    weather.condition = 'heavyRain';
    wind = 90 + weather.typhoonStrength * 55;
    rainfall = 70 + weather.typhoonStrength * 75;
  } else if (stage === 'departing') {
    weather.condition = 'showers';
    wind = 30 + weather.typhoonStrength * 25;
    rainfall = 15 + weather.typhoonStrength * 30;
  }

  weather.temperatureC = Math.round(temperature);
  weather.rainfallMm = Math.round(rainfall);
  weather.windKph = Math.round(wind);
}

function updateWeatherSimulation() {
  if (!city.weather) normalizeCityFinanceState();
  updateTyphoonState();
  applyWeatherReadings();
}

function getWeatherTrafficMultiplier() {
  const weather = city.weather;
  if (!weather) return 1;
  if (weather.typhoonStage === 'signal8') return 0.72;
  if (weather.condition === 'heavyRain') return 1.28;
  if (weather.condition === 'showers' || weather.condition === 'windy') return 1.1;
  return 1;
}

function getWeatherPollutionMultiplier() {
  const rainfall = Number(city.weather?.rainfallMm ?? 0);
  if (rainfall >= 60) return 0.72;
  if (rainfall >= 20) return 0.84;
  if (rainfall > 0) return 0.94;
  return 1;
}

function getUrgentWeatherNews() {
  const weather = city.weather;
  if (!weather) return null;
  const cityName = city.name || getDefaultCityName();
  if (weather.typhoonStage === 'signal8') {
    return t('news.weather.typhoon8', { city: cityName, wind: String(weather.windKph) });
  }
  if (weather.typhoonStage === 'signal3') {
    return t('news.weather.typhoon3', { city: cityName });
  }
  if (weather.rainfallMm >= 80) {
    return t('news.weather.rainstorm', { city: cityName, rain: String(weather.rainfallMm) });
  }
  return null;
}

function buildWeatherTickerCandidates() {
  const weather = city.weather;
  if (!weather) return [];
  const cityName = city.name || getDefaultCityName();
  const shared = {
    city: cityName,
    temp: String(weather.temperatureC),
    rain: String(weather.rainfallMm),
    wind: String(weather.windKph),
  };

  if (weather.typhoonStage === 'approaching') {
    return [{ id: 'weather-typhoon-approaching', weight: 11, text: t('news.weather.typhoonApproaching', shared) }];
  }
  if (weather.typhoonStage === 'departing' || weather.typhoonStage === 'recovery') {
    return [{ id: 'weather-typhoon-recovery', weight: 10, text: t('news.weather.typhoonRecovery', shared) }];
  }
  if (weather.condition === 'heavyRain') {
    return [{ id: 'weather-heavy-rain', weight: 9, text: t('news.weather.heavyRain', shared) }];
  }
  if (weather.condition === 'hot') {
    return [{ id: 'weather-hot', weight: 7, text: t('news.weather.hot', shared) }];
  }
  if (weather.condition === 'cool') {
    return [{ id: 'weather-cool', weight: 6, text: t('news.weather.cool', shared) }];
  }
  return [{ id: `weather-${weather.condition}`, weight: 4, text: t('news.weather.general', shared) }];
}
