#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const pkg = require('../package.json');
const deployments = JSON.parse(execFileSync('node', ['node_modules/wrangler/bin/wrangler.js', 'deployments', 'list', '--config', 'wrangler.web.jsonc', '--json'], { encoding: 'utf8' }));
const records = Array.isArray(deployments) ? deployments : deployments.deployments;
const deployed = records?.filter(record => record.id).sort((a, b) => String(b.created_on || b.created_at).localeCompare(String(a.created_on || a.created_at)))[0];
if (!deployed) throw new Error('Could not identify the verified web deployment');
const version = pkg.version;
const manifest = { available: true, version, releaseTheme: pkg.releaseTheme, releaseThemes: pkg.releaseThemes,
  commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  webDeploymentId: deployed.id, playUrl: 'https://heung-shing-play.nortonyuen.workers.dev',
  statisticsUrl: 'https://heung-shing-statistics.nortonyuen.workers.dev', saveDataVersion: 15,
  supportedSaveDataVersions: [14, 15], publishedAt: new Date().toISOString(),
  desktopAssets: [`The.City.of.Heung.Shing-${version}-arm64.dmg`, `The.City.of.Heung.Shing-${version}-x64.dmg`,
    `The.City.of.Heung.Shing.Setup.${version}.exe`, `The.City.of.Heung.Shing.${version}.exe`],
};
const reportPath = path.resolve('release/web/build-report.json');
if (fs.existsSync(reportPath)) manifest.assetManifestHash = JSON.parse(fs.readFileSync(reportPath, 'utf8')).assetManifestHash;
fs.mkdirSync('release', { recursive: true });
fs.writeFileSync('release/release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Recorded web deployment ${deployed.id} for v${version}.`);
