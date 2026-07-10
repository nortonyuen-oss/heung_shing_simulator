const OLLAMA_LOCAL_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com';
const OLLAMA_STATUS_TIMEOUT_MS = 2000;
const OLLAMA_CLOUD_STATUS_TIMEOUT_MS = 8000;
const OLLAMA_GENERATE_TIMEOUT_MS = 55000;
const AI_NEWS_CACHE_LIMIT = 64;
const AI_NEWS_DEBUG_PREFIX = '香城快訊：';
const aiNewsCache = new Map();

function fetchWithTimeout(url, options = {}, timeoutMs = OLLAMA_STATUS_TIMEOUT_MS) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    });
}

function normalizeModelName(value) {
  const model = String(value || '').trim();
  return /^[a-zA-Z0-9_.:/-]{1,120}$/.test(model) ? model : '';
}

function chooseRecommendedModel(models, provider = 'local') {
  const names = models.map((model) => model.name);
  const preferred = provider === 'cloud'
    ? ['gpt-oss:20b', 'qwen3.5:397b', 'gpt-oss:120b']
    : ['qwen3:4b', 'qwen3:1.7b', 'llama3.2:3b', 'qwen2.5:3b', 'llama3.2:1b'];
  return preferred.find((name) => names.includes(name))
    || names.find((name) => /^qwen/i.test(name))
    || names[0]
    || '';
}

function getProviderConnection(provider, apiKey = '') {
  if (provider === 'cloud') {
    return {
      baseUrl: OLLAMA_CLOUD_BASE_URL,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      statusTimeoutMs: OLLAMA_CLOUD_STATUS_TIMEOUT_MS,
    };
  }
  return {
    baseUrl: OLLAMA_LOCAL_BASE_URL,
    headers: {},
    statusTimeoutMs: OLLAMA_STATUS_TIMEOUT_MS,
  };
}

async function getOllamaStatus(options = {}) {
  const provider = options.provider === 'cloud' ? 'cloud' : 'local';
  const apiKey = String(options.apiKey || '').trim();
  if (provider === 'cloud' && !apiKey) {
    return {
      available: false,
      provider,
      models: [],
      recommendedModel: '',
      needsApiKey: true,
      error: 'Ollama Cloud API key is required',
    };
  }

  const connection = getProviderConnection(provider, apiKey);
  try {
    if (provider === 'cloud') {
      const authResponse = await fetchWithTimeout(`${connection.baseUrl}/api/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...connection.headers },
        body: '{}',
      }, connection.statusTimeoutMs);
      if (!authResponse.ok) {
        const authError = new Error(`Ollama Cloud authentication HTTP ${authResponse.status}`);
        authError.code = 'CLOUD_AUTH_ERROR';
        throw authError;
      }
    }
    const response = await fetchWithTimeout(`${connection.baseUrl}/api/tags`, {
      headers: connection.headers,
    }, connection.statusTimeoutMs);
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const payload = await response.json();
    const models = (Array.isArray(payload.models) ? payload.models : [])
      .map((model) => ({
        name: normalizeModelName(model.name || model.model),
        size: Math.max(0, Number(model.size) || 0),
        parameterSize: String(model.details?.parameter_size || ''),
        family: String(model.details?.family || ''),
      }))
      .filter((model) => model.name);
    return {
      available: true,
      provider,
      models,
      recommendedModel: chooseRecommendedModel(models, provider),
      needsApiKey: false,
    };
  } catch (error) {
    return {
      available: false,
      provider,
      models: [],
      recommendedModel: '',
      needsApiKey: false,
      authError: error.code === 'CLOUD_AUTH_ERROR',
      error: error.name === 'AbortError' ? 'Ollama status timed out' : error.message,
    };
  }
}

function sanitizeFacts(rawFacts) {
  const facts = rawFacts && typeof rawFacts === 'object' ? rawFacts : {};
  const text = (value, max = 180) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const rawStory = facts.story && typeof facts.story === 'object' ? facts.story : null;
  const story = rawStory ? {
    desk: text(rawStory.desk, 40),
    deskLabel: text(rawStory.deskLabel, 40),
    district: text(rawStory.district, 60),
    districtEnglishName: text(rawStory.districtEnglishName, 80),
    districtKey: text(rawStory.districtKey, 10),
    location: text(rawStory.location, 60),
    locationType: text(rawStory.locationType, 50),
    actor: text(rawStory.actor, 60),
    angle: text(rawStory.angle, 100),
    event: text(rawStory.event, 360),
    districtBuildings: {
      residential: Math.max(0, Math.round(number(rawStory.districtBuildings?.residential))),
      commercial: Math.max(0, Math.round(number(rawStory.districtBuildings?.commercial))),
      industrial: Math.max(0, Math.round(number(rawStory.districtBuildings?.industrial))),
      civic: Math.max(0, Math.round(number(rawStory.districtBuildings?.civic))),
    },
    districtMetrics: {
      population: Math.max(0, Math.round(number(rawStory.districtMetrics?.population))),
      trafficPct: Math.max(0, Math.min(100, Math.round(number(rawStory.districtMetrics?.trafficPct)))),
      educationPct: Math.max(0, Math.min(100, Math.round(number(rawStory.districtMetrics?.educationPct)))),
      healthPct: Math.max(0, Math.min(100, Math.round(number(rawStory.districtMetrics?.healthPct)))),
      pollutionPct: Math.max(0, Math.min(100, Math.round(number(rawStory.districtMetrics?.pollutionPct)))),
      landValuePct: Math.max(0, Math.min(100, Math.round(number(rawStory.districtMetrics?.landValuePct)))),
      poweredPct: Math.max(0, Math.min(100, Math.round(number(rawStory.districtMetrics?.poweredPct)))),
      schools: Math.max(0, Math.round(number(rawStory.districtMetrics?.schools))),
      hospitals: Math.max(0, Math.round(number(rawStory.districtMetrics?.hospitals))),
      zonedTiles: Math.max(0, Math.round(number(rawStory.districtMetrics?.zonedTiles))),
    },
  } : null;
  return {
    city: text(facts.city, 60),
    date: text(facts.date, 30),
    population: Math.max(0, Math.round(number(facts.population))),
    budget: Math.round(number(facts.budget)),
    monthlyNet: Math.round(number(facts.monthlyNet)),
    happinessPct: Math.max(0, Math.min(100, Math.round(number(facts.happinessPct)))),
    unemploymentPct: Math.max(0, Math.min(100, Math.round(number(facts.unemploymentPct)))),
    pollution: Math.max(0, number(facts.pollution)),
    trafficPct: Math.max(0, Math.min(100, Math.round(number(facts.trafficPct)))),
    weather: text(facts.weather, 120),
    citizenActivity: text(facts.citizenActivity, 220),
    urgentEvent: text(facts.urgentEvent, 180),
    story,
    recentHeadlines: (Array.isArray(facts.recentHeadlines) ? facts.recentHeadlines : [])
      .slice(-8).map((headline) => text(headline, 220)).filter(Boolean),
    recentTopics: (Array.isArray(facts.recentTopics) ? facts.recentTopics : [])
      .slice(-8).map((topic) => ({
        desk: text(topic?.desk, 40),
        district: text(topic?.district, 60),
        location: text(topic?.location, 60),
        angle: text(topic?.angle, 100),
      })),
  };
}

function getPromptInstruction(language) {
  if (language === 'zhHant') {
    return '以香港本地新聞編採語氣，用自然繁體中文寫新聞跑馬燈，每條45至90個中文字。';
  }
  if (language === 'ja') {
    return '自然な日本語で都市ニュースの見出し候補を3本、各60文字から120文字で書いてください。';
  }
  return 'Write three natural city-news ticker headline candidates in English, each between 12 and 28 words.';
}

function buildAiNewsPrompt(language, facts) {
  return [
    'You are the district editor of a Hong Kong-inspired fictional city simulation.',
    getPromptInstruction(language),
    'The story object is authoritative. Name its district, location, actor and event naturally when supplied. For English output, prefer districtEnglishName when present.',
    'When districtMetrics is present, describe those local values as district conditions; do not relabel them as citywide averages.',
    'Use a Hong Kong local-news register such as 街坊、屋苑、街市、繁忙時間、巴士站、海旁、商戶、部門 where relevant.',
    'Do not invent proper nouns, statistics, direct quotations, infrastructure, causes, or outcomes not present in FACTS_JSON.',
    'Avoid generic openings such as 本市、據悉、有關方面. Do not reuse wording or angles from recentHeadlines and recentTopics.',
    'Give priority to urgentEvent, then the selected story, weather and citizenActivity.',
    'Create three materially different candidates for the same event: a people angle, a district angle and a service-impact angle.',
    `Do not include the debug prefix ${AI_NEWS_DEBUG_PREFIX}; the program adds it after selection.`,
    'Return JSON with exactly one field named headlines, containing an array of three strings.',
    `FACTS_JSON: ${JSON.stringify(facts)}`,
  ].join('\n');
}

function sanitizeHeadline(value) {
  return Array.from(String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim())
    .slice(0, 220)
    .join('');
}

function readHeadlineCandidates(responseText) {
  const source = String(responseText || '').trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    const values = Array.isArray(parsed.headlines) ? parsed.headlines : [parsed.headline];
    return [...new Set(values.map(sanitizeHeadline).filter(Boolean))].slice(0, 3);
  } catch {
    const fallback = sanitizeHeadline(source.replace(/^```(?:json)?|```$/gi, ''));
    return fallback ? [fallback] : [];
  }
}

function normalizeHeadlineForComparison(value) {
  return String(value || '')
    .replace(/^香城快訊\s*[:：]\s*/u, '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function getHeadlineBigrams(value) {
  const normalized = Array.from(normalizeHeadlineForComparison(value));
  if (normalized.length < 2) return new Set(normalized);
  const grams = new Set();
  for (let i = 0; i < normalized.length - 1; i++) grams.add(`${normalized[i]}${normalized[i + 1]}`);
  return grams;
}

function getHeadlineSimilarity(a, b) {
  const left = getHeadlineBigrams(a);
  const right = getHeadlineBigrams(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((gram) => { if (right.has(gram)) intersection++; });
  return intersection / Math.max(1, left.size + right.size - intersection);
}

function chooseLeastRepeatedHeadline(candidates, recentHeadlines) {
  return candidates.map((headline, index) => ({
    headline,
    index,
    repetition: recentHeadlines.reduce(
      (highest, recent) => Math.max(highest, getHeadlineSimilarity(headline, recent)),
      0,
    ),
  })).sort((a, b) => a.repetition - b.repetition || a.index - b.index)[0]?.headline || '';
}

function withAiNewsDebugPrefix(headline) {
  const clean = String(headline || '').replace(/^香城快訊\s*[:：]\s*/u, '').trim();
  return clean ? `${AI_NEWS_DEBUG_PREFIX}${clean}`.slice(0, 220) : '';
}

function rememberCache(key, value) {
  if (aiNewsCache.has(key)) aiNewsCache.delete(key);
  aiNewsCache.set(key, value);
  while (aiNewsCache.size > AI_NEWS_CACHE_LIMIT) {
    aiNewsCache.delete(aiNewsCache.keys().next().value);
  }
}

async function generateOllamaNews(input = {}, options = {}) {
  const language = ['en', 'zhHant', 'ja'].includes(input.language) ? input.language : 'en';
  const provider = input.provider === 'cloud' ? 'cloud' : 'local';
  const apiKey = provider === 'cloud' ? String(options.apiKey || '').trim() : '';
  const facts = sanitizeFacts(input.facts);
  const status = await getOllamaStatus({ provider, apiKey });
  if (!status.available) {
    const error = new Error(status.error || 'Ollama is unavailable');
    error.code = status.needsApiKey
      ? 'CLOUD_API_KEY_REQUIRED'
      : status.authError ? 'CLOUD_AUTH_ERROR' : 'OLLAMA_UNAVAILABLE';
    throw error;
  }

  const model = normalizeModelName(input.model) || status.recommendedModel;
  if (!model || !status.models.some((item) => item.name === model)) {
    const error = new Error('Selected Ollama model is not available');
    error.code = 'MODEL_NOT_FOUND';
    throw error;
  }

  const cacheKey = JSON.stringify({ provider, model, language, facts });
  const cached = aiNewsCache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  let response;
  const connection = getProviderConnection(provider, apiKey);
  try {
    const requestBody = {
      model,
      prompt: buildAiNewsPrompt(language, facts),
      stream: false,
      think: false,
      format: {
        type: 'object',
        properties: {
          headlines: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: { type: 'string' },
          },
        },
        required: ['headlines'],
      },
      options: {
        temperature: 0.55,
        num_ctx: 2048,
        num_predict: provider === 'cloud' ? 600 : 90,
      },
    };
    if (provider === 'cloud') requestBody.format = 'json';
    if (provider === 'local') requestBody.keep_alive = '30s';

    response = await fetchWithTimeout(`${connection.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...connection.headers },
      body: JSON.stringify(requestBody),
      signal: options.signal,
    }, OLLAMA_GENERATE_TIMEOUT_MS);
  } catch (error) {
    const wrapped = new Error(error.name === 'AbortError' ? 'Ollama generation timed out' : error.message);
    wrapped.code = options.signal?.aborted
      ? 'REQUEST_ABORTED'
      : error.name === 'AbortError' ? 'OLLAMA_TIMEOUT' : 'OLLAMA_UNAVAILABLE';
    throw wrapped;
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errorPayload = await response.json();
      detail = String(errorPayload.error || errorPayload.message || '').slice(0, 240);
    } catch {}
    const error = new Error(detail || `Ollama HTTP ${response.status}`);
    error.code = provider === 'cloud' && response.status === 401
      ? 'CLOUD_AUTH_ERROR'
      : provider === 'cloud' && response.status === 403
        ? 'CLOUD_ACCESS_DENIED'
        : 'OLLAMA_ERROR';
    throw error;
  }
  const payload = await response.json();
  if (payload.error) {
    const error = new Error(String(payload.error).slice(0, 240));
    error.code = 'OLLAMA_ERROR';
    throw error;
  }
  const candidates = readHeadlineCandidates(payload.response || payload.message?.content);
  const selected = chooseLeastRepeatedHeadline(candidates, facts.recentHeadlines);
  const headline = withAiNewsDebugPrefix(selected);
  if (!headline) {
    const responseFields = Object.keys(payload).slice(0, 12).join(', ');
    const error = new Error(`Ollama returned an empty headline (fields: ${responseFields || 'none'})`);
    error.code = 'EMPTY_RESPONSE';
    throw error;
  }

  const result = { headline, model, provider, candidateCount: candidates.length, cached: false };
  rememberCache(cacheKey, result);
  return result;
}

module.exports = {
  generateOllamaNews,
  getHeadlineSimilarity,
  getOllamaStatus,
  sanitizeFacts,
};
