'use strict';

// 香城模擬器 for Android (android/README.md, 2026-11-21): a Trusted Web Activity on the browser version.
// Chrome opens it full screen only while the site vouches for the app's package and signing key, so
// the app, the site and the release must agree on both.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PACKAGE = 'io.github.nortonyuen_oss.heungshing';
const HOST = 'heung-shing-play.nortonyuen.workers.dev';

test('android: the app, its asset links and the site agree on the package, the key and the host', () => {
  const links = JSON.parse(read('android/assetlinks.json'));
  assert.equal(links.length, 1);
  assert.deepEqual(links[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(links[0].target.namespace, 'android_app');
  assert.equal(links[0].target.package_name, PACKAGE);
  assert.match(links[0].target.sha256_cert_fingerprints[0], /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  const gradle = read('android/twa/app/build.gradle');
  assert.ok(gradle.includes(`applicationId '${PACKAGE}'`));
  assert.ok(gradle.includes(`def twaHost = '${HOST}'`));
  // its version is the release's (6.0.5 -> 60005), read from package.json
  assert.ok(gradle.includes("rootProject.file('../../package.json')"));
  assert.ok(gradle.includes('versionCode major * 10000 + minor * 100 + patch'));
  // the key never sits in the repository
  assert.ok(gradle.includes("System.getenv('ANDROID_KEYSTORE')"));
  assert.ok(!fs.readdirSync(path.join(ROOT, 'android'), { recursive: true }).some((f) => /\.(jks|keystore|p12)$/i.test(String(f))));
  const manifest = read('android/twa/app/src/main/AndroidManifest.xml');
  ['DEFAULT_URL', 'DISPLAY_MODE', 'SPLASH_IMAGE_DRAWABLE', 'FILE_PROVIDER_AUTHORITY'].forEach((key) =>
    assert.ok(manifest.includes(`android.support.customtabs.trusted.${key}`), key));
  assert.ok(manifest.includes('android:autoVerify="true"'));
  // the site serves the statement from the Worker
  const worker = read('web-fallback.mjs');
  assert.ok(worker.includes("import assetLinks from './android/assetlinks.json';"));
  assert.ok(worker.includes("pathname === '/.well-known/assetlinks.json'"));
  assert.ok(read('scripts/verify-published-web.js').includes('/.well-known/assetlinks.json'));
});

test('android: the release builds, checks and ships the APK, and the site links it', () => {
  const ci = read('.github/workflows/build-installers.yml');
  assert.match(ci, /\n  android:\n[\s\S]*?\.\/gradlew assembleRelease[\s\S]*?apksigner" verify --print-certs/);
  assert.ok(ci.includes('needs: [build, web, edge, android]'));
  assert.ok(ci.includes('cp "$android_apk" "release-assets/The.City.of.Heung.Shing-${version}-android.apk"'));
  assert.ok(read('scripts/create-release-manifest.js').includes('mobileAssets: [`The.City.of.Heung.Shing-${version}-android.apk`]'));
  const page = read('docs/index.html');
  const version = require('../package.json').version;
  assert.ok(page.includes(`releases/latest/download/The.City.of.Heung.Shing-${version}-android.apk" data-download-link="android"`));
  assert.match(read('docs/site.js'), /android: \(asset\) => \/\^The\\\.City\\\.of\\\.Heung\\\.Shing-\[\\d\.\]\+-android\\\.apk\$\/i/);
  assert.ok(read('docs/web-play.js').includes('android: /-android\\.apk$/'));
  assert.ok(fs.statSync(path.join(ROOT, 'android/twa/gradlew')).mode & 0o111, 'gradlew is executable');
});
