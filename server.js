// City Builder - Express + SQLite backend
// Run: npm install && node server.js
// Then open http://localhost:3000

const express = require('express');
const path = require('path');
const fs = require('fs');
const { openGameDatabase } = require('./db');
const { generateOllamaNews, generateOllamaCouncilNews, generateOllamaForumComments, getOllamaStatus } = require('./ai-news-provider');
const {
  createEncryptedFileAiNewsSettingsStore,
  normalizeAiNewsConfig,
} = require('./ai-news-settings-store');

const DEFAULT_PORT = process.env.PORT || 3000;
const STATIC_ASSET_CACHE_MAX_AGE = '1h';
const APP_VERSION = require('./package.json').version;

function createMemoryAiNewsCredentialStore() {
  let apiKey = String(process.env.OLLAMA_API_KEY || '').trim();
  let config = null;
  return {
    persistent: false,
    get() { return apiKey; },
    set(value) { apiKey = String(value || '').trim(); },
    clear() { apiKey = ''; },
    getConfig() { return normalizeAiNewsConfig(config || {}); },
    hasConfig() { return !!config; },
    setConfig(value) { config = normalizeAiNewsConfig(value); },
  };
}

function sendStoreError(res, error, routeLabel) {
  console.error(`[${routeLabel}]`, error.message);
  const status = error?.code === 'INVALID_PAYLOAD' ? 400 : 500;
  res.status(status).json({ error: error.message });
}

function createGameApp(options = {}) {
  const app = express();
  const rootDir = options.rootDir || __dirname;
  const modelManifestPath = path.join(rootDir, 'Models', 'model-assets.json');
  let modelAssetManifest = { formatVersion: 1, version: 'development', entries: {} };
  try {
    if (fs.existsSync(modelManifestPath)) {
      const parsed = JSON.parse(fs.readFileSync(modelManifestPath, 'utf8'));
      if (parsed?.entries && typeof parsed.entries === 'object') modelAssetManifest = parsed;
    }
  } catch (error) {
    console.error('[model asset manifest]', error.message);
  }
  const store = openGameDatabase(options.dbPath);
  const settingsDir = path.dirname(store.path);
  const aiNewsCredentialStore = options.aiNewsCredentialStore || createEncryptedFileAiNewsSettingsStore({
    filePath: path.join(settingsDir, 'ai-news-settings.enc'),
    keyPath: path.join(settingsDir, 'ai-news-settings.key'),
  });

  // Middleware
  app.use(express.json({ limit: '25mb' }));
  // Packaged builds contain WebP models only. Keep logical PNG URLs working as
  // a defence-in-depth fallback for old saves or a missed hard-coded path.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let logicalPath;
    try {
      logicalPath = decodeURIComponent(req.path).replace(/^\/+/, '');
    } catch {
      return next();
    }
    const entry = modelAssetManifest.entries?.[logicalPath];
    if (!entry?.packagedPath) return next();
    const packagedPath = path.resolve(rootDir, entry.packagedPath);
    if (!packagedPath.startsWith(path.resolve(rootDir, 'Models') + path.sep)) return next();
    return res.sendFile(packagedPath, {
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  });
  app.use(express.static(rootDir, {
    maxAge: STATIC_ASSET_CACHE_MAX_AGE,
    setHeaders(res, filePath) {
      const extension = path.extname(filePath).toLowerCase();
      const isModelAsset = filePath.split(path.sep).includes('Models');
      // Source files are not fingerprinted, so always revalidate code and markup.
      // Model art is also edited in place under stable filenames; conditional
      // revalidation prevents an updated sprite being hidden by the one-hour
      // media cache while still allowing an efficient 304 for unchanged files.
      if (isModelAsset || ['.html', '.js', '.css', '.json'].includes(extension)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
  })); // serve index.html + JS/CSS/assets

  // Keep renderer-visible version labels tied to the same package metadata used
  // by electron-builder for DMG/EXE names and native application metadata.
  app.get('/api/app-info', (_req, res) => {
    res.json({ version: APP_VERSION });
  });

  app.get('/api/model-assets', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.json(modelAssetManifest);
  });

  // Model folder discovery
  // Returns a JSON array of image filenames for a given model folder.
  // Only whitelisted folder names are allowed (no path traversal).
  app.get('/api/models/*', (req, res) => {
  const ALLOWED = [
    // Current folder structure
    'residential/house1x1',
    'residential/house2x2',
    'residential/house3x3',
    'residential/house4x4',
    'residential/house5x5',
    'commercial/1x1',
    'commercial/2x2',
    'commercial/3x3',
    'commercial/4x4',
    'commercial/5x5',
    'industrial/1x1',
    'industrial/2x2',
    'industrial/3x3',
    'parks/park1x1',
    'parks/park2x2',
    'parks/park3x3',
  ];
  const folderName = req.params[0];
  if (!ALLOWED.includes(folderName)) {
    return res.status(400).json({ error: 'Unknown folder' });
  }
  const logicalPrefix = `Models/${folderName}/`;
  const packagedLogicalFiles = Object.keys(modelAssetManifest.entries ?? {})
    .filter((logicalPath) => logicalPath.startsWith(logicalPrefix))
    .map((logicalPath) => logicalPath.slice(logicalPrefix.length))
    .filter((fileName) => fileName && !fileName.includes('/'))
    .sort((a, b) => a.localeCompare(b));
  if (packagedLogicalFiles.length > 0) return res.json(packagedLogicalFiles);
  const folderPath = path.join(rootDir, 'Models', ...folderName.split('/'));
  try {
    const files = fs.readdirSync(folderPath)
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b));
    res.json(files);
  } catch {
    res.json([]);
  }
  });

// REST API

// Local AI bridge. The renderer never connects to Ollama directly, which keeps
// the same-origin API working in browsers and packaged Electron builds.
  app.get('/api/ai-news/status', async (req, res) => {
  const provider = req.query.provider === 'local' ? 'local' : 'cloud';
  if (provider === 'local') {
    return res.status(410).json({
      available: false,
      provider: 'local',
      disabled: true,
      models: [],
      recommendedModel: '',
      error: 'Local AI generation is disabled',
    });
  }
  const apiKey = aiNewsCredentialStore.get();
  const status = await getOllamaStatus({ provider, apiKey });
  res.status(status.available ? 200 : 503).json({
    ...status,
    hasApiKey: !!apiKey,
    credentialStorage: aiNewsCredentialStore.persistent ? 'encrypted' : 'memory',
  });
  });

  app.get('/api/ai-news/settings', (req, res) => {
  try {
    res.json({
      config: aiNewsCredentialStore.getConfig(),
      configured: aiNewsCredentialStore.hasConfig(),
      hasApiKey: !!aiNewsCredentialStore.get(),
      credentialStorage: aiNewsCredentialStore.persistent ? 'encrypted' : 'memory',
    });
  } catch (error) {
    console.error('[GET /api/ai-news/settings]', error.message);
    res.status(500).json({ error: 'Could not read AI news settings' });
  }
  });

  app.put('/api/ai-news/settings', (req, res) => {
  try {
    const config = normalizeAiNewsConfig(req.body);
    aiNewsCredentialStore.setConfig(config);
    res.json({
      ok: true,
      config,
      credentialStorage: aiNewsCredentialStore.persistent ? 'encrypted' : 'memory',
    });
  } catch (error) {
    console.error('[PUT /api/ai-news/settings]', error.message);
    res.status(500).json({ error: 'Could not store AI news settings' });
  }
  });

  app.post('/api/ai-news/credentials', (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  if (apiKey.length < 10 || apiKey.length > 512) {
    return res.status(400).json({ error: 'Invalid Ollama API key' });
  }
  try {
    aiNewsCredentialStore.set(apiKey);
    res.json({
      ok: true,
      hasApiKey: true,
      credentialStorage: aiNewsCredentialStore.persistent ? 'encrypted' : 'memory',
    });
  } catch (error) {
    console.error('[POST /api/ai-news/credentials]', error.message);
    res.status(500).json({ error: 'Could not store Ollama API key' });
  }
  });

  app.delete('/api/ai-news/credentials', (req, res) => {
  try {
    aiNewsCredentialStore.clear();
    res.json({ ok: true, hasApiKey: false });
  } catch (error) {
    console.error('[DELETE /api/ai-news/credentials]', error.message);
    res.status(500).json({ error: 'Could not remove Ollama API key' });
  }
  });

  app.post('/api/ai-news/generate', async (req, res) => {
  const requestController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) requestController.abort();
  });
  try {
    if (req.body?.provider !== 'cloud') {
      return res.status(410).json({
        error: 'Local AI generation is disabled',
        code: 'LOCAL_AI_DISABLED',
      });
    }
    const apiKey = aiNewsCredentialStore.get();
    const generate = req.body?.storyKind === 'council_character'
      ? generateOllamaCouncilNews
      : req.body?.storyKind === 'forum_comments' ? generateOllamaForumComments : generateOllamaNews;
    const result = await generate(req.body, {
      apiKey,
      signal: requestController.signal,
    });
    res.json(result);
  } catch (error) {
    if (error.code === 'REQUEST_ABORTED' || res.destroyed) return;
    const unavailable = ['OLLAMA_UNAVAILABLE', 'OLLAMA_TIMEOUT', 'CLOUD_API_KEY_REQUIRED'].includes(error.code);
    const notFound = error.code === 'MODEL_NOT_FOUND';
    const unauthorized = error.code === 'CLOUD_AUTH_ERROR';
    console.error('[POST /api/ai-news/generate]', error.message);
    res.status(unauthorized ? 401 : unavailable ? 503 : notFound ? 400 : 502).json({
      error: error.message,
      code: error.code || 'AI_NEWS_ERROR',
    });
  }
  });

// GET /api/saves - list all saves (metadata only, no full JSON blob)
  app.get('/api/saves', (req, res) => {
  try {
    res.json(store.listSaves());
  } catch (e) {
    console.error('[GET /api/saves]', e.message);
    res.status(500).json({ error: e.message });
  }
  });

// GET /api/saves/:id - fetch full save data for loading
  app.get('/api/saves/:id', (req, res) => {
  try {
    const row = store.getSave(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Save not found' });
    res.json(row);
  } catch (e) {
    console.error('[GET /api/saves/:id]', e.message);
    res.status(500).json({ error: e.message });
  }
  });

// POST /api/saves/autosave - create or replace the dedicated autosave slot
  app.post('/api/saves/autosave', (req, res) => {
  try {
    const row = store.upsertAutosave(req.body);
    res.json(row);
  } catch (e) {
    sendStoreError(res, e, 'POST /api/saves/autosave');
  }
  });

// POST /api/saves - create a new manual save slot
  app.post('/api/saves', (req, res) => {
  try {
    const row = store.createSave(req.body);
    res.status(201).json(row);
  } catch (e) {
    sendStoreError(res, e, 'POST /api/saves');
  }
  });

// PUT /api/saves/:id - overwrite an existing save slot
  app.put('/api/saves/:id', (req, res) => {
  try {
    const row = store.updateSave(Number(req.params.id), req.body);
    if (!row) return res.status(404).json({ error: 'Save not found' });
    res.json(row);
  } catch (e) {
    sendStoreError(res, e, 'PUT /api/saves/:id');
  }
  });

// DELETE /api/saves/:id - delete a save slot
  app.delete('/api/saves/:id', (req, res) => {
  try {
    store.deleteSave(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/saves/:id]', e.message);
    res.status(500).json({ error: e.message });
  }
  });

// GET /api/terrains - list terrain presets (metadata only)
  app.get('/api/terrains', (req, res) => {
  try {
    res.json(store.listTerrainPresets());
  } catch (e) {
    console.error('[GET /api/terrains]', e.message);
    res.status(500).json({ error: e.message });
  }
  });

// GET /api/terrains/:id - fetch full terrain payload
  app.get('/api/terrains/:id', (req, res) => {
  try {
    const row = store.getTerrainPreset(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Terrain preset not found' });
    res.json(row);
  } catch (e) {
    console.error('[GET /api/terrains/:id]', e.message);
    res.status(500).json({ error: e.message });
  }
  });

// POST /api/terrains - create a terrain preset
  app.post('/api/terrains', (req, res) => {
  try {
    const row = store.createTerrainPreset(req.body);
    res.status(201).json(row);
  } catch (e) {
    sendStoreError(res, e, 'POST /api/terrains');
  }
  });

// PUT /api/terrains/:id - update a terrain preset
  app.put('/api/terrains/:id', (req, res) => {
  try {
    const row = store.updateTerrainPreset(Number(req.params.id), req.body);
    if (!row) return res.status(404).json({ error: 'Terrain preset not found' });
    res.json(row);
  } catch (e) {
    sendStoreError(res, e, 'PUT /api/terrains/:id');
  }
  });

// DELETE /api/terrains/:id - delete a terrain preset
  app.delete('/api/terrains/:id', (req, res) => {
  try {
    store.deleteTerrainPreset(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/terrains/:id]', e.message);
    res.status(500).json({ error: e.message });
  }
  });

  // Keep body-parser failures machine-readable for the renderer and avoid
  // Express's default HTML error page (and development stack trace).
  app.use((error, _req, res, next) => {
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large' });
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'Request body must contain valid JSON' });
    }
    return next(error);
  });

  return { app, store };
}

function startGameServer(options = {}) {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? '127.0.0.1';
  const { app, store } = createGameApp(options);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const resolvedPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        app,
        server,
        store,
        port: resolvedPort,
        url: `http://127.0.0.1:${resolvedPort}`,
        close() {
          return new Promise((closeResolve, closeReject) => {
            server.close((err) => {
              try {
                store.close();
              } catch (e) {
                if (!err) err = e;
              }

              if (err) closeReject(err);
              else closeResolve();
            });
          });
        },
      });
    });

    server.on('error', reject);
  });
}

if (require.main === module) {
  startGameServer({ port: DEFAULT_PORT })
    .then(({ port, store }) => {
      console.log(`\nCity Builder running at http://localhost:${port}`);
      console.log(`SQLite saves: ${store.path}\n`);
    })
    .catch((err) => {
      console.error('[server]', err);
      process.exit(1);
    });
}

module.exports = {
  createGameApp,
  createMemoryAiNewsCredentialStore,
  startGameServer,
};
