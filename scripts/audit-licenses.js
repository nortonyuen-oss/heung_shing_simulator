#!/usr/bin/env node
'use strict';

// Evidence inventory only: metadata and file presence are not legal clearance.
// Manual decisions live in docs/licensing/ASSET-RIGHTS.md and are never rewritten.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'licensing');
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) {
  throw new Error('Usage: node scripts/audit-licenses.js [--check]');
}
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));
const lockBytes = read('package-lock.json');
const lock = JSON.parse(lockBytes);
const game = JSON.parse(read('package.json'));
const phaserUrl = read('index.html').toString('utf8')
  .match(/https:\/\/cdn\.jsdelivr\.net\/npm\/phaser@([^/"']+)\/dist\/phaser\.js/);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const notices = ['NPM RUNTIME NOTICE WORKING INVENTORY',
  'Generated from local installed packages and package-lock.json.',
  'Trailing whitespace is normalized below; SHA-256 values identify original source files.',
  'Not a complete distribution notice: excludes Electron runtime internals, CDN bundles,',
  'installer components and assets. Missing evidence is listed explicitly.', ''];
const packages = [];
const gaps = [];
for (const [packagePath, entry] of Object.entries(lock.packages).sort(([a], [b]) => compare(a, b))) {
  if (!packagePath) continue;
  const dir = path.resolve(root, packagePath);
  if (!dir.startsWith(root + path.sep)) throw new Error(`Unsafe package path: ${packagePath}`);
  const record = {
    path: packagePath,
    version: entry.version || null,
    declaredLicense: entry.license || 'UNKNOWN',
    dev: !!entry.dev,
    optional: !!entry.optional,
    integrity: entry.integrity || null,
    installedVersion: null,
    noticeFiles: [],
  };
  const packageJson = path.join(dir, 'package.json');
  if (fs.existsSync(packageJson)) {
    record.installedVersion = JSON.parse(fs.readFileSync(packageJson, 'utf8')).version;
    if (record.installedVersion === record.version) {
      record.noticeFiles = fs.readdirSync(dir).sort(compare)
        .filter(name => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(name))
        .filter(name => fs.statSync(path.join(dir, name)).isFile())
        .map(name => ({ path: `${packagePath}/${name}`, sha256: sha256(fs.readFileSync(path.join(dir, name))) }));
      // Some packages include the full license only in their README.
      if (!record.noticeFiles.length) {
        for (const name of fs.readdirSync(dir).sort(compare).filter(name => /^readme([.-]|$)/i.test(name))) {
          const file = path.join(dir, name);
          if (!fs.statSync(file).isFile()) continue;
          const bytes = fs.readFileSync(file);
          if (/Permission is hereby granted[\s\S]*THE SOFTWARE IS PROVIDED/i.test(bytes.toString('utf8'))) {
            record.noticeFiles.push({ path: `${packagePath}/${name}`, sha256: sha256(bytes), includesReadme: true });
          }
        }
      }
    }
  }
  packages.push(record);
  if (!record.dev) {
    notices.push(`\n${'='.repeat(72)}\n${packagePath} @ ${record.version}\nDeclared license: ${record.declaredLicense}\n`);
    if (record.installedVersion !== record.version || !record.noticeFiles.length) {
      const reason = record.installedVersion !== record.version ? 'NOT INSTALLED AT LOCKED VERSION' : 'NO COMPLETE ROOT LICENSE FOUND';
      gaps.push({ path: packagePath, reason });
      notices.push(`REQUIRES REVIEW: ${reason}. Obtain exact upstream license and notices.\n`);
    } else {
      for (const file of record.noticeFiles) {
        notices.push(`Source: ${file.path}\nSHA-256: ${file.sha256}\n\n${read(file.path).toString('utf8')}\n`);
      }
    }
  }
}

const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  .toString('utf8').split('\0').filter(Boolean).sort(compare);
const mediaPattern = /\.(png|webp|jpe?g|svg|gif|ico|icns|mp3|m4a|wav|ogg|woff2?|ttf|otf)$/i;
const dataFiles = new Set(['real-city-coastline-masks.js', 'data/hko-astronomy-2026.json',
  'Models/landscape/natural/manifest.json', 'docs/content/annual-fortunes.json']);
function category(file) {
  if (file.startsWith('Models/landscape/natural/')) return 'NATURAL';
  if (file.startsWith('UI/weatherSignals/')) return 'WEATHER';
  if (file === 'real-city-coastline-masks.js') return 'COAST';
  if (file.startsWith('data/hko-astronomy-')) return 'HKO-API+HKO-PDF';
  return ({ Music: 'MUSIC', Sounds: 'SOUND', Models: 'MODEL', UI: 'UI', build: 'UI',
    docs: file.startsWith('docs/content/') ? 'TEXT' : 'SITE',
    'kenney_isometric-roads': 'KENNEY', newRoadTiles: 'ROAD' })[file.split('/')[0]] || 'UNCLASSIFIED';
}
const assets = files.filter(file => mediaPattern.test(file) || dataFiles.has(file)).map(file => {
  const bytes = read(file);
  return { path: file, kind: mediaPattern.test(file) ? 'media' : 'data', bytes: bytes.length,
    sha256: sha256(bytes), rightsGroup: category(file) };
});
const licenseCounts = {};
for (const pkg of packages) licenseCounts[pkg.declaredLicense] = (licenseCounts[pkg.declaredLicense] || 0) + 1;
const result = {
  schemaVersion: 1,
  projectVersion: game.version,
  lockfileSha256: sha256(lockBytes),
  scope: 'Lockfile package paths, including platform alternatives; not an installer SBOM or legal approval.',
  packageCount: packages.length,
  nonDevPackageCount: packages.filter(pkg => !pkg.dev).length,
  mediaCount: assets.filter(asset => asset.kind === 'media').length,
  dataFileCount: assets.filter(asset => asset.kind === 'data').length,
  declaredLicenseCounts: licenseCounts,
  runtimeNoticeGaps: gaps,
  outsideLockfile: [
    { name: 'Phaser', version: phaserUrl ? phaserUrl[1] : null, url: phaserUrl ? phaserUrl[0] : null,
      evidence: 'index.html', status: 'CDN bundle and embedded notices require separate review; no URL match requires manual discovery' },
    { name: 'Electron runtime internals', status: 'Inspect matching Electron distribution LICENSE and LICENSES.chromium.html' },
    { name: 'Installer components', status: 'Inspect each actual platform artifact' },
  ],
  packages,
};
const csvCell = value => `"${String(value).replace(/"/g, '""')}"`;
const columns = ['path', 'kind', 'bytes', 'sha256', 'rightsGroup'];
const csv = [columns.map(csvCell).join(','), ...assets.map(asset => columns.map(key => csvCell(asset[key])).join(','))].join('\n') + '\n';
const outputs = new Map([
  ['dependencies.json', JSON.stringify(result, null, 2) + '\n'],
  ['assets.csv', csv],
  ['npm-runtime-notices.txt', notices.join('\n').replace(/[ \t]+$/gm, '').trimEnd() + '\n'],
]);
if (!check) fs.mkdirSync(out, { recursive: true });
let stale = false;
for (const [name, contents] of outputs) {
  const target = path.join(out, name);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== contents) {
      console.error(`Out of date: docs/licensing/${name}`);
      stale = true;
    }
  } else fs.writeFileSync(target, contents);
}
console.log(`${packages.length} package records; ${result.nonDevPackageCount} non-dev; ${result.mediaCount} media; ${result.dataFileCount} data files.`);
console.log(`${gaps.length} runtime notice gap(s). Inventory consistency is not license clearance.`);
if (stale) process.exitCode = 1;
