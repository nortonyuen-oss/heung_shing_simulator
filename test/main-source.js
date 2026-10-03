const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// main.js is being split into topic files that index.html loads just before it. Tests that
// look up main.js code by name or pattern read them all as one source, so code can move
// between these files without its tests having to follow it.
const MAIN_SOURCE_FILES = [
  'trees.js',
  'debris.js',
  'bus-stops.js',
  'harbor.js',
  'bridges.js',
  'terrain-generation.js',
  'terrain-scenarios.js',
  'tile-keys.js',
  'weather-effects.js',
  'day-night-lighting.js',
  'audio.js',
  'model-assets.js',
  'model-metadata.js',
  'render-performance.js',
  'viewport-culling.js',
  'building-placement.js',
  'terrain-editing.js',
  'placement-previews.js',
  'main.js',
];

const mainSource = MAIN_SOURCE_FILES
  .map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'))
  .join('\n');

module.exports = { MAIN_SOURCE_FILES, mainSource };
