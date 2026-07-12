const AI_NEWS_SETTINGS_KEY = 'citybuilder.aiNews.v2';
const AI_NEWS_LEGACY_SETTINGS_KEY = 'citybuilder.aiNews.v1';
const AI_NEWS_AUTOMATIC_COOLDOWN_MS = 60000;
const AI_NEWS_DEBUG_PREFIX = '香城快訊：';
// Circuit breaker shared by every AI request path (ticker, council character news,
// forum comments): 3 consecutive failures across any of them — the backend being
// down or rate-limited affects all of them the same way — turns AI News off rather
// than letting each feature keep retrying independently and hammering the backend.
// Re-enabling via Settings resets the counter and fires one test request.
const AI_NEWS_MAX_CONSECUTIVE_FAILURES = 3;
let aiNewsSettingsSaveQueue = Promise.resolve();

function hasLegacyAiNewsConfig() {
  try {
    return localStorage.getItem(AI_NEWS_SETTINGS_KEY) !== null
      || localStorage.getItem(AI_NEWS_LEGACY_SETTINGS_KEY) !== null;
  } catch {
    return false;
  }
}

const councilNewsRuntime = { pending: false };

const aiNewsRuntime = {
  config: loadAiNewsConfig(),
  hadClientConfig: hasLegacyAiNewsConfig(),
  status: null,
  initialized: false,
  pending: false,
  pendingSince: 0,
  pendingClock: null,
  pendingKind: '',
  abortController: null,
  nextRequestId: 0,
  activeRequestId: 0,
  nextAutomaticAt: 0,
  attemptedKey: '',
  cityEpoch: 0,
  lastError: '',
  testPreview: '',
  statusRequestId: 0,
  modelOptionsSignature: '',
  consecutiveFailures: 0,
};

function recordAiNewsSuccess() {
  aiNewsRuntime.consecutiveFailures = 0;
}

function recordAiNewsFailure() {
  if (aiNewsRuntime.config.enabled === false) return;
  aiNewsRuntime.consecutiveFailures = (aiNewsRuntime.consecutiveFailures || 0) + 1;
  if (aiNewsRuntime.consecutiveFailures < AI_NEWS_MAX_CONSECUTIVE_FAILURES) return;
  aiNewsRuntime.consecutiveFailures = 0;
  aiNewsRuntime.config.enabled = false;
  saveAiNewsConfig();
  renderAiNewsSettings();
  if (typeof updateSettingsMenu === 'function') updateSettingsMenu();
  if (typeof showToast === 'function') showToast(t('aiNews.autoDisabled'), 'warning');
}

function loadAiNewsConfig() {
  try {
    const current = JSON.parse(localStorage.getItem(AI_NEWS_SETTINGS_KEY) || 'null');
    if (current && typeof current === 'object') {
      const wasCloud = current.provider === 'cloud';
      return {
        enabled: wasCloud && typeof current.enabled === 'boolean' ? current.enabled : false,
        provider: 'cloud',
        models: {
          local: String(current.models?.local || ''),
          cloud: String(current.models?.cloud || ''),
        },
      };
    }

    const legacy = JSON.parse(localStorage.getItem(AI_NEWS_LEGACY_SETTINGS_KEY) || 'null');
    if (legacy && typeof legacy === 'object') {
      return {
        enabled: false,
        provider: 'cloud',
        models: { local: String(legacy.model || ''), cloud: '' },
      };
    }
  } catch (error) {
    console.warn('[AI News] Ignoring invalid settings', error);
  }
  // First-run default: prefer AI when a configured provider is available;
  // refreshAiNewsStatus resolves this sentinel to true or false. Explicit user
  // choices loaded above remain untouched.
  return { enabled: null, provider: 'cloud', models: { local: '', cloud: '' } };
}

function normalizeAiNewsClientConfig(value = {}) {
  return {
    enabled: value.enabled === true,
    provider: 'cloud',
    models: {
      local: '',
      cloud: String(value.models?.cloud || '').trim().slice(0, 120),
    },
  };
}

function saveAiNewsConfig() {
  const config = normalizeAiNewsClientConfig(aiNewsRuntime.config);
  aiNewsRuntime.config = config;
  aiNewsSettingsSaveQueue = aiNewsSettingsSaveQueue
    .catch(() => {})
    .then(async () => {
      const response = await fetch('/api/ai-news/settings', {
        method: 'PUT',
        priority: 'high',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error(`AI settings HTTP ${response.status}`);
      localStorage.removeItem(AI_NEWS_SETTINGS_KEY);
      localStorage.removeItem(AI_NEWS_LEGACY_SETTINGS_KEY);
    })
    .catch((error) => console.warn('[AI News settings]', error.message));
  return aiNewsSettingsSaveQueue;
}

async function hydrateAiNewsConfig() {
  try {
    const response = await fetch('/api/ai-news/settings', { cache: 'no-store', priority: 'high' });
    if (!response.ok) throw new Error(`AI settings HTTP ${response.status}`);
    const settings = await response.json();
    if (settings.configured) {
      aiNewsRuntime.config = normalizeAiNewsClientConfig(settings.config);
      localStorage.removeItem(AI_NEWS_SETTINGS_KEY);
      localStorage.removeItem(AI_NEWS_LEGACY_SETTINGS_KEY);
    } else if (aiNewsRuntime.hadClientConfig) {
      await saveAiNewsConfig();
    }
  } catch (error) {
    console.warn('[AI News settings]', error.message);
  }
}

function isAiNewsEnabled() {
  return aiNewsRuntime.config.enabled === true;
}

function getAiNewsProvider() {
  return 'cloud';
}

function getSelectedAiModel() {
  return aiNewsRuntime.config.models[getAiNewsProvider()] || '';
}

function setSelectedAiModel(model) {
  aiNewsRuntime.config.models[getAiNewsProvider()] = String(model || '');
}

function getAiNewsModelOptions() {
  return Array.isArray(aiNewsRuntime.status?.models) ? aiNewsRuntime.status.models : [];
}

function selectAvailableAiModel() {
  const models = getAiNewsModelOptions();
  if (
    !aiNewsRuntime.status?.available
    || aiNewsRuntime.status.provider !== getAiNewsProvider()
    || !models.length
  ) return;
  if (!models.some((model) => model.name === getSelectedAiModel())) {
    setSelectedAiModel(aiNewsRuntime.status.recommendedModel || models[0].name);
  }
}

async function refreshAiNewsStatus() {
  const provider = getAiNewsProvider();
  const requestId = ++aiNewsRuntime.statusRequestId;
  const previousStatus = aiNewsRuntime.status?.provider === provider ? aiNewsRuntime.status : null;
  aiNewsRuntime.status = {
    checking: true,
    available: !!previousStatus?.available,
    provider,
    models: previousStatus?.models || [],
    hasApiKey: previousStatus?.hasApiKey,
    credentialStorage: previousStatus?.credentialStorage,
  };
  renderAiNewsSettings();
  try {
    const response = await fetch(`/api/ai-news/status?provider=${encodeURIComponent(provider)}`, {
      cache: 'no-store',
      priority: 'high',
    });
    const status = await response.json();
    if (requestId !== aiNewsRuntime.statusRequestId || provider !== getAiNewsProvider()) return aiNewsRuntime.status;
    aiNewsRuntime.status = status;
  } catch (error) {
    if (requestId !== aiNewsRuntime.statusRequestId || provider !== getAiNewsProvider()) return aiNewsRuntime.status;
    aiNewsRuntime.status = { available: false, provider, models: [], error: error.message };
  }

  selectAvailableAiModel();
  if (aiNewsRuntime.config.enabled === null) {
    aiNewsRuntime.config.enabled = !!(aiNewsRuntime.status?.available && getSelectedAiModel());
  }
  saveAiNewsConfig();
  renderAiNewsSettings();
  if (typeof updateSettingsMenu === 'function') updateSettingsMenu();
  return aiNewsRuntime.status;
}

async function initializeAiNewsService() {
  if (aiNewsRuntime.initialized) return;
  aiNewsRuntime.initialized = true;
  await hydrateAiNewsConfig();
  await refreshAiNewsStatus();
  // Forum posts created while this status check was still in flight (e.g. right at
  // load) skip their first AI-comment attempt silently; retry them now that we know.
  if (typeof hydrateRecentForumAiComments === 'function') hydrateRecentForumAiComments();
}

function buildAiNewsFacts() {
  const weatherCandidate = typeof buildWeatherTickerCandidates === 'function'
    ? buildWeatherTickerCandidates()[0]
    : null;
  const digest = city.citizenActivityDigest;
  const urgentEvent = typeof getUrgentWeatherNews === 'function' ? getUrgentWeatherNews() : null;
  const recentHistory = Array.isArray(city.aiNews?.history) ? city.aiNews.history.slice(-12) : [];
  const story = typeof buildCityNewsEvent === 'function' ? buildCityNewsEvent(recentHistory) : null;
  return {
    city: city.name || getDefaultCityName(),
    date: `${tMonth(city.month)} ${city.year}`,
    population: city.population,
    budget: city.budget,
    monthlyNet: Number(city.monthlyIncome || 0) - Number(city.monthlyExpenses || 0),
    happinessPct: Math.round((city.happiness ?? 0) * 100),
    unemploymentPct: Math.round((city.unemploymentRate ?? 0) * 100),
    pollution: Number(city.pollution || 0),
    trafficPct: Math.round((city.trafficIndex ?? 0) * 100),
    weather: weatherCandidate?.text || '',
    citizenActivity: digest?.key ? t(digest.key, digest.params ?? {}) : '',
    urgentEvent: urgentEvent || '',
    story,
    recentHeadlines: recentHistory.slice(-8).map((item) => item.headline),
    recentTopics: recentHistory.slice(-8).map((item) => ({
      desk: item.desk,
      district: item.district,
      location: item.location,
      angle: item.angle,
    })),
  };
}

// Rewords a rule-decided CanonicalNewsEvent (council-news.js) into a news line via AI.
// The event's facts, characters and quoteSpeakerId are authoritative; a rule-based fallback
// line is always shown by the caller first, so failures here are silently non-fatal.
async function requestCouncilCharacterNews(event, options = {}) {
  if (!event || councilNewsRuntime.pending) return null;
  if (!aiNewsRuntime.initialized || !isAiNewsEnabled()) return null;
  if (!aiNewsRuntime.status?.available || !getSelectedAiModel()) return null;

  councilNewsRuntime.pending = true;
  try {
    const facts = {
      city: city.name || getDefaultCityName(),
      date: `${tMonth(city.month)} ${city.year}`,
      storyKind: event.storyKind,
      event: {
        eventType: event.eventType,
        absurdity: event.absurdity,
        facts: event.facts,
        quoteSpeakerId: event.quoteSpeakerId,
      },
      characters: typeof buildCouncilCharacterPayload === 'function'
        ? buildCouncilCharacterPayload(event.characterIds)
        : [],
    };
    const response = await fetch('/api/ai-news/generate', {
      method: 'POST',
      priority: 'high',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: getAiNewsProvider(),
        model: getSelectedAiModel(),
        language: getCurrentLanguage(),
        storyKind: event.storyKind,
        facts,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || `HTTP ${response.status}`);
      error.code = result.code;
      throw error;
    }
    recordAiNewsSuccess();
    const headline = withAiNewsDebugPrefix(result.headline).slice(0, 220);
    if (!headline) return null;
    const line = result.quote ? `${headline}「${result.quote}」` : headline;
    if (options.addToTicker !== false && typeof addCityNews === 'function') addCityNews(line);
    return result;
  } catch (error) {
    recordAiNewsFailure();
    console.warn('[Council News]', error.message);
    return null;
  } finally {
    councilNewsRuntime.pending = false;
  }
}

function withAiNewsDebugPrefix(headline) {
  const clean = String(headline || '').replace(/^香城快訊\s*[:：]\s*/u, '').trim();
  return clean ? `${AI_NEWS_DEBUG_PREFIX}${clean}` : '';
}

function getAiNewsRequestKey() {
  const language = getCurrentLanguage();
  const provider = getAiNewsProvider();
  const period = `${provider}-${getSelectedAiModel()}-${city.year}-${city.month}-${language}`;
  if (['signal8', 'signal9', 'signal10'].includes(city.weather?.typhoonStage)) return `typhoon-${period}-${city.weather.typhoonStage}`;
  if ((city.epidemicSeverity ?? 0) >= 0.45) return `epidemic-${period}`;
  if ((city.totalPowerDemand ?? 0) > 0 && (city.totalPowerSupply ?? 0) < (city.totalPowerDemand ?? 0)) {
    return `blackout-${period}`;
  }
  return `monthly-${period}`;
}

function startAiNewsPendingClock() {
  aiNewsRuntime.pendingSince = Date.now();
  if (aiNewsRuntime.pendingClock) clearInterval(aiNewsRuntime.pendingClock);
  aiNewsRuntime.pendingClock = setInterval(renderAiNewsSettings, 1000);
}

function stopAiNewsPendingClock() {
  if (aiNewsRuntime.pendingClock) clearInterval(aiNewsRuntime.pendingClock);
  aiNewsRuntime.pendingClock = null;
  aiNewsRuntime.pendingSince = 0;
}

function getAiNewsErrorMessage(code, fallback) {
  if (code === 'CLOUD_API_KEY_REQUIRED' || code === 'CLOUD_AUTH_ERROR') return t('aiNews.errorAuth');
  if (code === 'CLOUD_ACCESS_DENIED') return t('aiNews.errorAccess');
  if (code === 'OLLAMA_TIMEOUT') return t('aiNews.errorTimeout');
  if (code === 'MODEL_NOT_FOUND') return t('aiNews.errorModel');
  if (code === 'EMPTY_RESPONSE') return t('aiNews.errorEmpty');
  return t('aiNews.errorGeneric', { error: fallback || t('aiNews.testFailed') });
}

async function requestAiNewsGeneration(options = {}) {
  const previewOnly = !!options.previewOnly;
  const force = !!options.force;
  const automatic = !!options.automatic;
  if (!force && !isAiNewsEnabled()) return null;
  if (aiNewsRuntime.pending) return null;
  if (!aiNewsRuntime.status?.available || !getSelectedAiModel()) {
    aiNewsRuntime.lastError = aiNewsRuntime.status?.needsApiKey
      ? t('aiNews.errorAuth')
      : t('aiNews.statusUnavailable');
    renderAiNewsSettings();
    return null;
  }

  const requestKey = getAiNewsRequestKey();
  if (automatic && (
    requestKey === city.aiNews?.lastRequestKey
    || requestKey === aiNewsRuntime.attemptedKey
  )) return null;

  const requestId = ++aiNewsRuntime.nextRequestId;
  const controller = new AbortController();
  aiNewsRuntime.activeRequestId = requestId;
  aiNewsRuntime.abortController = controller;
  aiNewsRuntime.pending = true;
  aiNewsRuntime.pendingKind = previewOnly ? 'test' : 'automatic';
  aiNewsRuntime.lastError = '';
  if (previewOnly) aiNewsRuntime.testPreview = '';
  if (automatic) {
    aiNewsRuntime.attemptedKey = requestKey;
    aiNewsRuntime.nextAutomaticAt = Date.now() + AI_NEWS_AUTOMATIC_COOLDOWN_MS;
  }
  const requestEpoch = aiNewsRuntime.cityEpoch;
  startAiNewsPendingClock();
  renderAiNewsSettings();
  try {
    const facts = buildAiNewsFacts();
    const response = await fetch('/api/ai-news/generate', {
      method: 'POST',
      priority: 'high',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: getAiNewsProvider(),
        model: getSelectedAiModel(),
        language: getCurrentLanguage(),
        facts,
      }),
    });
    const result = await response.json();
    if (requestId !== aiNewsRuntime.activeRequestId) return null;
    if (!response.ok) {
      const error = new Error(result.error || `HTTP ${response.status}`);
      error.code = result.code;
      throw error;
    }
    if (requestEpoch !== aiNewsRuntime.cityEpoch) return null;

    if (previewOnly) {
      const headline = withAiNewsDebugPrefix(result.headline).slice(0, 220);
      aiNewsRuntime.testPreview = headline;
      city.aiNews = {
        ...(city.aiNews || {}),
        headline,
        model: result.model || getSelectedAiModel(),
        provider: result.provider || getAiNewsProvider(),
        language: getCurrentLanguage(),
        generatedAtTick: city.tick,
        pendingDisplay: true,
        history: Array.isArray(city.aiNews?.history) ? city.aiNews.history : [],
      };
    } else {
      const existingHistory = Array.isArray(city.aiNews?.history) ? city.aiNews.history : [];
      const headline = withAiNewsDebugPrefix(result.headline).slice(0, 220);
      const historyItem = {
        headline,
        desk: facts.story?.desk || '',
        district: facts.story?.district || '',
        location: facts.story?.location || '',
        angle: facts.story?.angle || '',
        tick: city.tick,
        year: city.year,
        month: city.month,
      };
      city.aiNews = {
        headline,
        model: result.model || getSelectedAiModel(),
        provider: result.provider || getAiNewsProvider(),
        language: getCurrentLanguage(),
        generatedAtTick: city.tick,
        lastRequestKey: requestKey,
        pendingDisplay: true,
        history: [...existingHistory, historyItem].filter((item) => item.headline).slice(-12),
      };
    }
    recordAiNewsSuccess();
    return result;
  } catch (error) {
    if (requestId !== aiNewsRuntime.activeRequestId || error.name === 'AbortError') return null;
    recordAiNewsFailure();
    aiNewsRuntime.lastError = getAiNewsErrorMessage(error.code, error.message);
    console.warn('[AI News]', error.message);
    if (options.notify && typeof showToast === 'function') showToast(aiNewsRuntime.lastError, 'warning');
    return null;
  } finally {
    if (requestId === aiNewsRuntime.activeRequestId) {
      aiNewsRuntime.pending = false;
      aiNewsRuntime.pendingKind = '';
      aiNewsRuntime.abortController = null;
      stopAiNewsPendingClock();
      renderAiNewsSettings();
    }
  }
}

function cancelAiNewsRequest() {
  if (aiNewsRuntime.abortController) aiNewsRuntime.abortController.abort();
  aiNewsRuntime.activeRequestId = ++aiNewsRuntime.nextRequestId;
  aiNewsRuntime.abortController = null;
  aiNewsRuntime.pending = false;
  aiNewsRuntime.pendingKind = '';
  stopAiNewsPendingClock();
  renderAiNewsSettings();
}

function resetAiNewsRuntime() {
  cancelAiNewsRequest();
  aiNewsRuntime.cityEpoch += 1;
  aiNewsRuntime.attemptedKey = '';
}

function queueAiNewsGeneration() {
  if (!aiNewsRuntime.initialized || !isAiNewsEnabled()) return;
  if (document.getElementById('ai-news-dialog')?.style.display === 'flex') return;
  if (Date.now() < aiNewsRuntime.nextAutomaticAt) return;
  requestAiNewsGeneration({ automatic: true }).catch((error) => console.warn('[AI News]', error));
}

function buildAiTickerCandidates() {
  const news = city.aiNews;
  if (
    !isAiNewsEnabled()
    || !news?.headline
    || news.language !== getCurrentLanguage()
    || (news.provider && news.provider !== getAiNewsProvider())
  ) return [];
  return [{
    id: `ai-${news.lastRequestKey || news.generatedAtTick}`,
    weight: 11,
    text: withAiNewsDebugPrefix(news.headline),
  }];
}

function takePendingAiTickerHeadline() {
  const news = city.aiNews;
  if (!news?.pendingDisplay || !news.headline || news.language !== getCurrentLanguage()) return null;
  news.pendingDisplay = false;
  return {
    id: `ai-priority-${news.generatedAtTick}-${news.model || 'cloud'}`,
    text: withAiNewsDebugPrefix(news.headline),
  };
}

function renderAiNewsSettings() {
  const providerSelect = document.getElementById('ai-news-provider');
  const keyRow = document.getElementById('ai-news-key-row');
  const keyInput = document.getElementById('ai-news-api-key');
  const keySave = document.getElementById('ai-news-key-save');
  const keyClear = document.getElementById('ai-news-key-clear');
  const enabled = document.getElementById('ai-news-enabled');
  const modelSelect = document.getElementById('ai-news-model');
  const statusText = document.getElementById('ai-news-status');
  const testButton = document.getElementById('ai-news-test');
  const preview = document.getElementById('ai-news-preview');
  if (!providerSelect || !enabled || !modelSelect || !statusText || !testButton) return;

  const provider = getAiNewsProvider();
  providerSelect.value = provider;
  providerSelect.disabled = true;
  enabled.checked = isAiNewsEnabled();
  if (keyRow) keyRow.hidden = provider !== 'cloud';
  if (keyInput) keyInput.disabled = aiNewsRuntime.pending;
  if (keySave) keySave.disabled = aiNewsRuntime.pending || !keyInput?.value.trim();
  if (keyClear) keyClear.disabled = aiNewsRuntime.pending || !aiNewsRuntime.status?.hasApiKey;

  const models = getAiNewsModelOptions();
  const modelOptionsSignature = `${provider}:${models.map((model) => `${model.name}:${model.parameterSize}`).join('|')}`;
  if (modelOptionsSignature !== aiNewsRuntime.modelOptionsSignature) {
    modelSelect.replaceChildren(...models.map((model) => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = model.parameterSize ? `${model.name} (${model.parameterSize})` : model.name;
      return option;
    }));
    if (!models.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = t('aiNews.noModels');
      modelSelect.appendChild(option);
    }
    aiNewsRuntime.modelOptionsSignature = modelOptionsSignature;
  }
  modelSelect.value = getSelectedAiModel();
  modelSelect.disabled = !aiNewsRuntime.status?.available;
  testButton.disabled = !aiNewsRuntime.status?.available || !getSelectedAiModel() || aiNewsRuntime.pending;

  if (aiNewsRuntime.pending) {
    const seconds = Math.max(0, Math.floor((Date.now() - aiNewsRuntime.pendingSince) / 1000));
    statusText.textContent = t('aiNews.statusGenerating', { seconds: String(seconds) });
    statusText.dataset.state = 'working';
  } else if (aiNewsRuntime.status?.checking) {
    statusText.textContent = t('aiNews.statusChecking');
    statusText.dataset.state = 'working';
  } else if (aiNewsRuntime.status?.needsApiKey) {
    statusText.textContent = t('aiNews.statusKeyRequired');
    statusText.dataset.state = 'error';
  } else if (aiNewsRuntime.status?.authError) {
    statusText.textContent = t('aiNews.statusAuthFailed');
    statusText.dataset.state = 'error';
  } else if (aiNewsRuntime.status?.available) {
    const storageKey = aiNewsRuntime.status.credentialStorage === 'encrypted'
      ? 'aiNews.statusReadySecure'
      : 'aiNews.statusReady';
    statusText.textContent = t(storageKey, { count: String(models.length) });
    statusText.dataset.state = 'ready';
  } else {
    statusText.textContent = t('aiNews.statusUnavailable');
    statusText.dataset.state = 'error';
  }

  if (preview) {
    if (aiNewsRuntime.pendingKind === 'test') {
      const seconds = Math.max(0, Math.floor((Date.now() - aiNewsRuntime.pendingSince) / 1000));
      preview.textContent = t('aiNews.statusGenerating', { seconds: String(seconds) });
    } else if (aiNewsRuntime.testPreview) {
      preview.textContent = aiNewsRuntime.testPreview;
    } else if (aiNewsRuntime.lastError) {
      preview.textContent = aiNewsRuntime.lastError;
    } else {
      preview.textContent = t('aiNews.previewEmpty');
    }
  }
}

async function saveAiNewsApiKey() {
  const input = document.getElementById('ai-news-api-key');
  const apiKey = input?.value.trim() || '';
  if (!apiKey) return;
  const response = await fetch('/api/ai-news/credentials', {
    method: 'POST',
    priority: 'high',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (input) input.value = '';
  if (!response.ok) {
    aiNewsRuntime.lastError = t('aiNews.errorStoreKey');
    renderAiNewsSettings();
    return;
  }
  aiNewsRuntime.config.enabled = true;
  saveAiNewsConfig();
  await refreshAiNewsStatus();
}

async function clearAiNewsApiKey() {
  await fetch('/api/ai-news/credentials', { method: 'DELETE', priority: 'high' });
  setSelectedAiModel('');
  saveAiNewsConfig();
  await refreshAiNewsStatus();
}

function setupAiNewsSettingsUi() {
  document.getElementById('ai-news-provider')?.addEventListener('change', (event) => {
    aiNewsRuntime.config.provider = 'cloud';
    aiNewsRuntime.attemptedKey = '';
    aiNewsRuntime.lastError = '';
    saveAiNewsConfig();
    refreshAiNewsStatus();
  });
  document.getElementById('ai-news-enabled')?.addEventListener('change', (event) => {
    aiNewsRuntime.config.enabled = !!event.target.checked;
    if (!aiNewsRuntime.config.enabled) {
      cancelAiNewsRequest();
    } else {
      aiNewsRuntime.consecutiveFailures = 0;
    }
    saveAiNewsConfig();
    renderAiNewsSettings();
    if (typeof updateSettingsMenu === 'function') updateSettingsMenu();
    if (aiNewsRuntime.config.enabled) {
      requestAiNewsGeneration({ force: true, previewOnly: true, notify: true });
    }
  });
  document.getElementById('ai-news-model')?.addEventListener('change', (event) => {
    const nextModel = event.target.value;
    cancelAiNewsRequest();
    setSelectedAiModel(nextModel);
    aiNewsRuntime.attemptedKey = '';
    aiNewsRuntime.testPreview = '';
    aiNewsRuntime.lastError = '';
    saveAiNewsConfig();
    renderAiNewsSettings();
  });
  document.getElementById('ai-news-api-key')?.addEventListener('input', renderAiNewsSettings);
  document.getElementById('ai-news-key-save')?.addEventListener('click', saveAiNewsApiKey);
  document.getElementById('ai-news-key-clear')?.addEventListener('click', clearAiNewsApiKey);
  document.getElementById('ai-news-refresh')?.addEventListener('click', refreshAiNewsStatus);
  document.getElementById('ai-news-test')?.addEventListener('click', async () => {
    await requestAiNewsGeneration({ force: true, previewOnly: true, notify: true });
    renderAiNewsSettings();
  });
  renderAiNewsSettings();
}

function openAiNewsSettings() {
  showDialog('ai-news-dialog');
  if (aiNewsRuntime.pendingKind === 'automatic') cancelAiNewsRequest();
  renderAiNewsSettings();
  refreshAiNewsStatus();
}

document.addEventListener('DOMContentLoaded', () => {
  setupAiNewsSettingsUi();
  initializeAiNewsService();
});

document.addEventListener('languagechange', () => {
  aiNewsRuntime.modelOptionsSignature = '';
  renderAiNewsSettings();
});
