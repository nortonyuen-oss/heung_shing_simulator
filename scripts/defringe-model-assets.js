#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
  PACKAGED_DEFRINGE_OPTIONS,
  defringeWhiteMatteRgba,
} = require('./lib/defringe-model');

const projectRoot = path.resolve(__dirname, '..');
const modelsRoot = path.join(projectRoot, 'Models');

function parseArgs(argv) {
  const options = { outputDir: '', match: '', limit: 0, minChanged: 1 };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--output-dir') options.outputDir = argv[++index] || '';
    else if (arg === '--match') options.match = argv[++index] || '';
    else if (arg === '--limit') options.limit = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--min-changed') options.minChanged = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function collectPngFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (/\.png$/i.test(entry.name)) files.push(fullPath);
    }
  }
  return files.sort();
}

function printHelp() {
  console.log(`Usage: node scripts/defringe-model-assets.js [options]

Default mode scans assets and prints a report without writing files.
The correction removes white RGB contamination from up to five translucent
edge pixels while preserving every pixel's alpha and the model silhouette.

Options:
  --output-dir <dir>  Write corrected PNG copies under this directory.
  --match <text>      Only scan relative paths containing this text.
  --limit <count>     Stop after this many matching files.
  --min-changed <n>   Only report/write files with at least n changed pixels.
  -h, --help          Show this help.

Example:
  npm run defringe:assets -- --match residential3 --output-dir .data/defringed`);
}

async function processFile(sourcePath, options) {
  const { data, info } = await sharp(sourcePath, { animated: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = defringeWhiteMatteRgba(
    data,
    info.width,
    info.height,
    PACKAGED_DEFRINGE_OPTIONS,
  );
  if (result.stats.changedPixels < options.minChanged) return null;

  const relativePath = path.relative(projectRoot, sourcePath);
  if (options.outputDir) {
    const outputRoot = path.resolve(projectRoot, options.outputDir);
    const targetPath = path.join(outputRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await sharp(result.data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).png().toFile(targetPath);
  }
  return { relativePath, ...result.stats };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  let files = collectPngFiles(modelsRoot);
  if (options.match) files = files.filter((file) => path.relative(projectRoot, file).includes(options.match));
  if (options.limit > 0) files = files.slice(0, options.limit);

  const reports = [];
  for (const file of files) {
    const report = await processFile(file, options);
    if (report) reports.push(report);
  }
  reports.sort((a, b) => b.changedPixels - a.changedPixels);

  reports.forEach((report) => {
    console.log([
      String(report.changedPixels).padStart(6),
      `${(report.changedRatio * 100).toFixed(1).padStart(5)}%`,
      `Δ${report.averageColorDelta.toFixed(1).padStart(5)}`,
      report.relativePath,
    ].join('  '));
  });
  console.log(`${options.outputDir ? 'Wrote' : 'Found'} ${reports.length} affected file(s) from ${files.length} scanned file(s).`);
  if (!options.outputDir) console.log('Dry run only. Pass --output-dir <dir> to write corrected copies.');
}

main().catch((error) => {
  console.error('Model defringe failed:', error.message);
  process.exitCode = 1;
});
