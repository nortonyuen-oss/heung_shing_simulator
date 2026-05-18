// City Builder - Express + SQLite backend
// Run: npm install && node server.js
// Then open http://localhost:3000

const express = require('express');
const path = require('path');
const fs = require('fs');
const { openGameDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const store = openGameDatabase();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname))); // serve index.html + JS/CSS/assets

// Model folder discovery
// Returns a JSON array of image filenames for a given model folder.
// Only whitelisted folder names are allowed (no path traversal).
app.get('/api/models/:folder', (req, res) => {
  const ALLOWED = ['house', 'house2x2', 'house1x4'];
  const folderName = req.params.folder;
  if (!ALLOWED.includes(folderName)) {
    return res.status(400).json({ error: 'Unknown folder' });
  }
  const folderPath = path.join(__dirname, 'Models', folderName);
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

// POST /api/saves - create a new save slot
app.post('/api/saves', (req, res) => {
  try {
    const row = store.createSave(req.body);
    res.status(201).json(row);
  } catch (e) {
    console.error('[POST /api/saves]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/saves/:id - overwrite an existing save slot
app.put('/api/saves/:id', (req, res) => {
  try {
    const row = store.updateSave(Number(req.params.id), req.body);
    if (!row) return res.status(404).json({ error: 'Save not found' });
    res.json(row);
  } catch (e) {
    console.error('[PUT /api/saves/:id]', e.message);
    res.status(500).json({ error: e.message });
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
    console.error('[POST /api/terrains]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/terrains/:id - update a terrain preset
app.put('/api/terrains/:id', (req, res) => {
  try {
    const row = store.updateTerrainPreset(Number(req.params.id), req.body);
    if (!row) return res.status(404).json({ error: 'Terrain preset not found' });
    res.json(row);
  } catch (e) {
    console.error('[PUT /api/terrains/:id]', e.message);
    res.status(500).json({ error: e.message });
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

app.listen(PORT, () => {
  console.log(`\nCity Builder running at http://localhost:${PORT}`);
  console.log(`SQLite saves: ${store.path}\n`);
});
