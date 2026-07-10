// Simulate representative citizen cohorts instead of expensive individual agents.

function setCitizenDigest(key, params, topic, weight = 7) {
  city.citizenActivityDigest = { key, params, topic, weight, tick: city.tick };
}

function updateCitizenActivitySimulation() {
  const weather = city.weather ?? {};
  const cityName = city.name || getDefaultCityName();
  const population = Math.max(0, Number(city.population) || 0);
  const params = {
    city: cityName,
    population: population.toLocaleString(),
    rate: String(Math.round((city.unemploymentRate ?? 0) * 100)),
    temp: String(Math.round(weather.temperatureC ?? 24)),
  };

  if (weather.typhoonStage === 'signal8') {
    setCitizenDigest('news.citizen.sheltering', params, 'citizen-sheltering', 12);
  } else if (weather.condition === 'heavyRain') {
    setCitizenDigest('news.citizen.rainCommute', params, 'citizen-rain-commute', 10);
  } else if ((city.trafficIndex ?? 0) >= 0.55) {
    setCitizenDigest('news.citizen.busQueue', params, 'citizen-bus-queue', 9);
  } else if ((city.pollution ?? 0) >= 65) {
    setCitizenDigest('news.citizen.indoorExercise', params, 'citizen-indoor-exercise', 9);
  } else if ((city.unemploymentRate ?? 0) >= 0.12) {
    setCitizenDigest('news.citizen.jobFair', params, 'citizen-job-fair', 9);
  } else if (weather.condition === 'hot') {
    setCitizenDigest('news.citizen.heatBreak', params, 'citizen-heat-break', 7);
  } else if ((city.happiness ?? 0) >= 0.7 && population >= 1000) {
    setCitizenDigest('news.citizen.parkEvening', params, 'citizen-park-evening', 7);
  } else if (city.commercialCount > 0) {
    setCitizenDigest('news.citizen.marketStreet', params, 'citizen-market-street', 6);
  } else {
    setCitizenDigest('news.citizen.neighborhood', params, 'citizen-neighborhood', 4);
  }
}

function buildCitizenTickerCandidates() {
  const digest = city.citizenActivityDigest;
  if (!digest?.key) return [];
  return [{
    id: digest.topic || 'citizen-activity',
    weight: digest.weight || 6,
    text: t(digest.key, digest.params ?? {}),
  }];
}
