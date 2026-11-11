#!/usr/bin/env node
// Produce a static-only game with immutable, content-addressed resources.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'release', process.env.WEB_BUILD_DIRECTORY || 'web');
if (!OUT.startsWith(path.join(ROOT, 'release') + path.sep)) throw new Error('Web output must be inside release/');
const STAGED = path.join(ROOT, '.data/package-assets/Models');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (entry.name.startsWith('.')) return [];
  const full = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
function output(name, data) {
  const target = path.join(OUT, name);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data);
}
async function main() {
  if (!fs.existsSync(path.join(STAGED, 'model-assets.json'))) throw new Error('Run npm run prepare:release-assets first');
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const pkg = require('../package.json');
  const previous = path.join(ROOT, '.data/previous-web/web');
  const retention = { version: pkg.version, assets: {} };
  if (fs.existsSync(path.join(previous, 'asset-retention.json'))) {
    const history = JSON.parse(fs.readFileSync(path.join(previous, 'asset-retention.json'), 'utf8'));
    const cutoff = Date.now() - 30 * 86400000;
    for (const [name, record] of Object.entries(history.assets)) {
      if (!/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) throw new Error('Invalid historical asset path');
      if (Date.parse(record.lastUsedAt) >= cutoff || record.versions?.includes(history.version)) {
        output(name, fs.readFileSync(path.join(previous, name)));
        retention.assets[name] = record;
      }
    }
  }
  const config = { platform: 'web', gameVersion: pkg.version, releaseTheme: pkg.releaseTheme,
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    statisticsUrl: process.env.WEB_STATISTICS_URL || 'https://heung-shing-statistics.nortonyuen.workers.dev',
    statisticsEnabled: process.env.WEB_STATISTICS_ENABLED === 'true',
    builtAt: new Date().toISOString() };
  const resources = {};
  const models = JSON.parse(fs.readFileSync(path.join(STAGED, 'model-assets.json'), 'utf8'));
  async function add(logical, file, optimize = false) {
    let data = fs.readFileSync(file), extension = path.extname(file).toLowerCase();
    if (optimize && /\.(png|jpg|jpeg)$/i.test(file)) {
      data = await sharp(data).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      extension = '.webp';
    }
    const name = `assets/${hash(data)}${extension}`;
    if (!fs.existsSync(path.join(OUT, name))) output(name, data);
    resources[logical] = name;
    return name;
  }
  for (const [logical, entry] of Object.entries(models.entries)) {
    const file = path.join(ROOT, '.data/package-assets', entry.packagedPath);
    if (!fs.existsSync(file)) throw new Error(`Missing staged model ${entry.packagedPath}`);
    const originalPackagedPath = entry.packagedPath;
    const immutable = await add(logical, file);
    resources[originalPackagedPath] = immutable;
    entry.packagedPath = immutable; entry.hash = path.basename(immutable).split('.')[0];
  }
  await add('build/icon.png', path.join(ROOT, 'build/icon.png'));
  const directories = ['UI', 'Music', 'Sounds', 'data', 'newRoadTiles', 'kenney_isometric-roads'];
  for (const dir of directories) for (const file of walk(path.join(ROOT, dir))) {
    const logical = path.relative(ROOT, file).split(path.sep).join('/');
    if (!/\.(png|webp|jpe?g|m4a|mp3|wav|ogg|json)$/i.test(file)) continue;
    await add(logical, file, dir === 'UI');
    if (['newRoadTiles', 'kenney_isometric-roads'].includes(dir)) output(logical, fs.readFileSync(file));
  }
  const folderLists = new Map();
  for (const logical of Object.keys(models.entries)) {
    if (/__night(half|deep|lamps|christmas)?\.[^.]+$/.test(logical)) continue;
    const folder = path.posix.dirname(logical).replace(/^Models\//, '');
    if (!folderLists.has(folder)) folderLists.set(folder, []);
    folderLists.get(folder).push(path.posix.basename(logical));
  }
  for (const [folder, files] of folderLists) output(`data/model-lists/${folder}.json`, JSON.stringify(files.sort((a, b) => a.localeCompare(b))));
  output('data/web-model-assets.json', JSON.stringify(models));
  const appInfo = { version: pkg.version, releaseTheme: pkg.releaseTheme, releaseThemes: pkg.releaseThemes, ...config, saveDataVersion: 15 };
  output('data/app-info.json', JSON.stringify(appInfo));
  const astronomy = require('../data/hko-astronomy-2026.json');
  for (const row of astronomy.records) {
    const data = { sourceVersion: astronomy.sourceVersion, referenceYear: astronomy.sourceYear,
      timezone: astronomy.timezone, latitude: astronomy.latitude, longitude: astronomy.longitude,
      month: row.month, day: row.day, sunriseMinutes: row.sunrise, solarTransitMinutes: row.solarTransit,
      sunsetMinutes: row.sunset, moonriseMinutes: row.moonrise, moonTransitMinutes: row.moonTransit,
      moonsetMinutes: row.moonset, moonPhase: row.moonPhase, civilTwilightMinutes: row.civilTwilight,
      nauticalTwilightMinutes: row.nauticalTwilight, astronomicalTwilightMinutes: row.astronomicalTwilight };
    output(`data/astronomy/${row.month}-${row.day}.json`, JSON.stringify(data));
  }
  // Static JSON endpoints use immutable URLs too, while keeping renderer paths simple.
  for (const file of walk(path.join(OUT, 'data'))) {
    const logical = path.relative(OUT, file).split(path.sep).join('/');
    await add(logical, file);
  }
  const resourceSource = `globalThis.HEUNG_SHING_RESOURCES=${JSON.stringify(resources)};\n`
    + `function resolveBundledAssetPath(value){if(typeof value!=='string')return value;let key=value.split('?')[0].replace(/^\\/+/, '');try{const url=new URL(value,location.href);if(url.origin!==location.origin)return value;key=decodeURIComponent(url.pathname.replace(/^\\/+/,''));}catch{}return HEUNG_SHING_RESOURCES[key]||(/^assets\\/[a-f0-9]{64}\\./.test(key)?key:value);}\n`
    + `function fetchBundledResource(value,options){return fetch(resolveBundledAssetPath(value),options);}\n`
    + `const originalPhaserFileLoad=Phaser.Loader.File.prototype.load;Phaser.Loader.File.prototype.load=function(){this.url=resolveBundledAssetPath(this.url);this.src=resolveBundledAssetPath(this.src);return originalPhaserFileLoad.call(this);};\n`;
  const resourceScript = `assets/${hash(resourceSource)}.js`; output(resourceScript, resourceSource);
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const immutableStyles = [];
  for (const [, stylesheet] of html.matchAll(/<link rel="stylesheet" href="([^"?]+)[^"]*">/g)) {
    if (/^https?:/.test(stylesheet) || stylesheet.includes('..')) throw new Error(`Unexpected stylesheet ${stylesheet}`);
    const target = await add(stylesheet, path.join(ROOT, stylesheet));
    immutableStyles.push(target);
    html = html.replace(`href="${stylesheet}"`, `href="${target}"`);
  }
  const scripts = [...html.matchAll(/<script src="([^"?]+)[^"]*"><\/script>/g)].map(match => match[1]);
  const immutableScripts = [];
  for (const script of scripts) {
    let source;
    if (script.startsWith('https://cdn.jsdelivr.net/npm/phaser@3.60.0/')) source = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'));
    else {
      if (/^https?:/.test(script) || script.includes('..')) throw new Error(`Unexpected script ${script}`);
      source = script === 'platform-config.js' ? `globalThis.HEUNG_SHING_CONFIG=Object.freeze(${JSON.stringify(config)});`
        : fs.readFileSync(path.join(ROOT, script), 'utf8');
      source = String(source).replace(/(?<![\w.])fetch\(/g, 'fetchBundledResource(');
      // Literal UI/media references also occur in DOM attributes, CSS, and HTMLAudio.
      // Forum images are the exception: their logical path is stored in saves and
      // validated by normalizeForumImagePath, so it is resolved at display time
      // (resolveForumImageSrc) rather than baked into the script as a hashed name.
      source = source.replace(/(['"])((?:UI|Music|Sounds|data|newRoadTiles|kenney_isometric-roads)\/[^'"\r\n]+)\1/g,
        (match, quote, logical) => resources[logical] && !logical.startsWith('UI/news/') ? `${quote}${resources[logical]}${quote}` : match);
    }
    const target = `assets/${hash(source)}.js`; output(target, source); immutableScripts.push(target);
    html = html.replace(`src="${script}"`, `src="${target}"`);
    if (script === 'platform-config.js') html = html.replace(`<script src="${target}">`, `<script src="${resourceScript}"></script>\n  <script src="${target}">`);
  }
  html = html.replace(/(['"])((?:UI|Music|Sounds|data|build|newRoadTiles|kenney_isometric-roads)\/[^'"\r\n]+)\1/g,
    (match, quote, logical) => resources[logical] ? `${quote}${resources[logical]}${quote}` : match);
  output('index.html', html);
  const catalog = Object.entries(resources).filter(([logical]) => logical === 'data/web-model-assets.json'
    || logical.startsWith('data/model-lists/')).map(([, immutable]) => immutable);
  const shell = ['index.html', resourceScript, ...immutableScripts, ...immutableStyles, ...catalog];
  const worker = fs.readFileSync(path.join(ROOT, 'web-service-worker.js'), 'utf8')
    .replace('__BUILD_ID__', `${pkg.version}-${config.commitSha.slice(0, 12)}`)
    .replace('/*__SHELL__*/[]', JSON.stringify(shell));
  output('web-service-worker.js', worker);
  output('_redirects', '/index.html / 200\n');
  output('_headers', '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/web-service-worker.js\n  Cache-Control: no-cache\n/data/*\n  Cache-Control: no-cache\n');
  output('LICENSE', fs.readFileSync(path.join(ROOT, 'LICENSE')));
  output('THIRD_PARTY_NOTICES.md', fs.readFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md')));
  const phaserLicense = path.join(path.dirname(require.resolve('phaser/package.json')), 'LICENSE.md');
  output('vendor-licenses/phaser-LICENSE.md', fs.readFileSync(phaserLicense));
  const files = walk(OUT);
  for (const file of files.filter(file => path.dirname(file) === path.join(OUT, 'assets'))) {
    const name = path.relative(OUT, file).split(path.sep).join('/');
    if (!retention.assets[name]) retention.assets[name] = { lastUsedAt: config.builtAt, versions: [pkg.version] };
  }
  const currentAssets = new Set([...Object.values(resources), ...immutableScripts, ...immutableStyles, resourceScript]);
  for (const name of currentAssets) retention.assets[name] = { lastUsedAt: config.builtAt,
    versions: [...new Set([...(retention.assets[name]?.versions || []), pkg.version])] };
  output('asset-retention.json', JSON.stringify(retention));
  const report = { ...appInfo, assetManifestHash: hash(JSON.stringify(models)), files: files.length,
    totalBytes: files.reduce((total, file) => total + fs.statSync(file).size, 0),
    largestBytes: Math.max(...files.map(file => fs.statSync(file).size)) };
  output('build-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ version: pkg.version, files: report.files, MiB: +(report.totalBytes / 1048576).toFixed(1), statisticsEnabled: config.statisticsEnabled }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
