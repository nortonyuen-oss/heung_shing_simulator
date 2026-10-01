const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// main.js is being split into topic files that index.html loads just before it. Tests that
// look up main.js code by name or pattern read them all as one source, so code can move
// between these files without its tests having to follow it.
const MAIN_SOURCE_FILES = [
  'trees.js',
  'main.js',
];

const mainSource = MAIN_SOURCE_FILES
  .map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'))
  .join('\n');

module.exports = { MAIN_SOURCE_FILES, mainSource };
