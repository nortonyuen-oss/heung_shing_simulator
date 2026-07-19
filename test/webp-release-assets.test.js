const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const { startGameServer } = require('../server');

const ROOT = path.resolve(__dirname, '..');
const STAGED_MODELS = path.join(ROOT, '.data', 'package-assets', 'Models');
const STAGED_MANIFEST = path.join(STAGED_MODELS, 'model-assets.json');
const HAS_STAGED_ASSETS = fs.existsSync(STAGED_MANIFEST);
let packagedServer = null;
let packagedRoot = null;

before(async () => {
  if (!HAS_STAGED_ASSETS) return;
  packagedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'city-builder-webp-test-'));
  fs.cpSync(STAGED_MODELS, path.join(packagedRoot, 'Models'), { recursive: true });
  packagedServer = await startGameServer({
    port: 0,
    rootDir: packagedRoot,
    dbPath: path.join(packagedRoot, 'test.sqlite'),
  });
});

after(async () => {
  if (packagedServer) await packagedServer.close();
  if (packagedRoot) fs.rmSync(packagedRoot, { recursive: true, force: true });
});

test('all Electron release commands prepare and verify staged WebP assets', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const command of ['dist', 'dist:mac', 'dist:win']) {
    assert.match(pkg.scripts[command], /prepare:release-assets/);
    assert.match(pkg.scripts[command], /verify:release-assets/);
  }
  assert.ok(pkg.build.files.includes('!Models/**'), 'source Models directory must be excluded');
  const stagedFileSet = pkg.build.files.find((entry) => typeof entry === 'object' && entry.to === 'Models');
  assert.equal(stagedFileSet?.from, '.data/package-assets/Models');
});

test('release conversion preserves source edges and restores power-of-two mipmaps', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'prepare-release-assets.js'), 'utf8');
  const decodeIndex = source.indexOf('const decoded = await sharp');
  const resizeIndex = source.indexOf('pipeline = pipeline.resize(', decodeIndex);
  const paddingIndex = source.indexOf('getPowerOfTwoPadding(', resizeIndex);
  const extendIndex = source.indexOf('.extend({', paddingIndex);
  const encodeIndex = source.indexOf('.webp({', extendIndex);
  assert.ok(decodeIndex >= 0);
  assert.ok(resizeIndex > decodeIndex, 'optional alpha-safe resize must follow source decoding');
  assert.ok(paddingIndex > resizeIndex, 'power-of-two padding must follow resize and trim');
  assert.ok(extendIndex > paddingIndex, 'transparent padding must be applied before encoding');
  assert.ok(encodeIndex > extendIndex, 'WebP encoding must run after power-of-two padding');
  assert.match(source, /const SETTINGS_VERSION = 5/);
  assert.doesNotMatch(source, /defringeWhiteMatteRgba/);
  assert.match(source, /defringe: 'none-source-preserved'/);
  assert.match(source, /lossless: true/);
  assert.match(source, /mipmapLayout: 'power-of-two-bottom-center'/);
  assert.doesNotMatch(source, /quality: QUALITY/);
});

test('Phaser model literals are routed through the model asset resolver', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const directModelLoads = main.split('\n').filter((line) => (
    line.includes('.load.image(') && line.includes('Models/')
  ));
  assert.ok(directModelLoads.length > 0);
  directModelLoads.forEach((line) => assert.match(line, /resolveModelAssetPath\(/));
  assert.match(main, /await loadModelAssetManifest\(\);[\s\S]*new Phaser\.Game\(config\)/);
  assert.match(main, /const ZONE_TEXTURE_BUDGET_BYTES = 192 \* 1024 \* 1024/);
  assert.match(main, /mipmapMultiplier[\s\S]*4 \/ 3/);
  assert.doesNotMatch(main, /function startDeferredZoneModelLoading/);
});

test('logical PNG URLs and physical WebP URLs both serve WebP in packaged mode', {
  skip: !HAS_STAGED_ASSETS,
}, async () => {
  const manifestResponse = await fetch(`${packagedServer.url}/api/model-assets`);
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  const entry = Object.values(manifest.entries).find((candidate) => (
    candidate.logicalPath.startsWith('Models/commercial/')
  ));
  assert.ok(entry, 'commercial staged asset is required for packaged smoke test');

  for (const requestPath of [entry.logicalPath, entry.packagedPath]) {
    const response = await fetch(`${packagedServer.url}/${encodeURI(requestPath)}`);
    assert.equal(response.status, 200, requestPath);
    assert.match(response.headers.get('content-type') || '', /^image\/webp\b/, requestPath);
    assert.ok((await response.arrayBuffer()).byteLength > 0, requestPath);
  }

  const relativeFolder = path.posix.dirname(entry.logicalPath).replace(/^Models\//, '');
  const discoveryResponse = await fetch(`${packagedServer.url}/api/models/${relativeFolder}`);
  assert.equal(discoveryResponse.status, 200);
  assert.ok((await discoveryResponse.json()).includes(path.posix.basename(entry.logicalPath)));
});

test('save loading verifies textures before replacing the active city', () => {
  const source = fs.readFileSync(path.join(ROOT, 'save.js'), 'utf8');
  const ensureStart = source.indexOf('async function ensureSaveBuildingTextures');
  const loadStart = source.indexOf('async function loadSaveById', ensureStart);
  const ensureSource = source.slice(ensureStart, loadStart);
  assert.match(ensureSource, /for \(let attempt = 0; attempt < 3; attempt\+\+\)/);
  assert.match(ensureSource, /throw new Error\(`Could not load/);
  assert.match(source, /await ensureSaveBuildingTextures\(readyScene, save\);[\s\S]*applySaveData\(readyScene, save\)/);
});
