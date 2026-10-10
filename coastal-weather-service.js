const COASTAL_WEATHER_URL = 'https://data.weather.gov.hk/openData/json/sccw_json_datagov_uc.json';

function validCoastalReport(report) {
  return !!report && Number.isFinite(Date.parse(report.updateTime))
    && Array.isArray(report.weatherForecast?.data) && report.weatherForecast.data.length > 0
    && report.weatherForecast.data.every(row => typeof row.locationName === 'string' && typeof row.windInfo === 'string');
}

function createCoastalWeatherService(fetchImpl = fetch) {
  let cached = null;
  let pending = null;
  return {
    refresh() {
      if (pending) return pending;
      pending = (async () => {
        try {
          const response = await fetchImpl(COASTAL_WEATHER_URL, { signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error(`HKO HTTP ${response.status}`);
          const report = await response.json();
          if (!validCoastalReport(report)) throw new Error('Invalid coastal weather report');
          cached = { report, fetchedAt: Date.now(), stale: false };
          return cached;
        } catch (error) {
          if (cached) return { ...cached, stale: true };
          throw error;
        } finally {
          pending = null;
        }
      })();
      return pending;
    },
  };
}

module.exports = { COASTAL_WEATHER_URL, validCoastalReport, createCoastalWeatherService };
