const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const load = (globals) => {
  const context = vm.createContext({ ...globals });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'memory-budget.js'), 'utf8'), context);
  return (expr) => vm.runInContext(expr, context);
};

test('a phone in a browser is the low-memory profile; the Electron app keeps its own budgets', () => {
  const phone = load({ HEUNG_SHING_CONFIG: { platform: 'web' }, matchMedia: () => ({ matches: true }), navigator: { userAgent: 'Android' } });
  assert.equal(phone('getMemoryProfile()'), 'low');
  assert.equal(phone("getMemoryBudgetBytes('nightTextures')"), 64 * 1048576);
  const laptop = load({ HEUNG_SHING_CONFIG: { platform: 'web' }, matchMedia: () => ({ matches: false }), navigator: { userAgent: 'Macintosh', deviceMemory: 8 } });
  assert.equal(laptop('getMemoryProfile()'), 'web');
  const small = load({ HEUNG_SHING_CONFIG: { platform: 'web' }, matchMedia: () => ({ matches: false }), navigator: { userAgent: 'X11', deviceMemory: 4 } });
  assert.equal(small('getMemoryProfile()'), 'low', 'a computer saying it has 4 GB or less');
  const desktop = load({ HEUNG_SHING_CONFIG: { platform: 'desktop' } });
  assert.equal(desktop('getMemoryProfile()'), 'desktop');
  assert.equal(desktop("getMemoryBudgetBytes('nightTextures')"), 640 * 1048576);
});

test('a texture is counted by the picture it holds: four bytes a pixel, a third more with mipmaps', () => {
  const run = load({ HEUNG_SHING_CONFIG: { platform: 'desktop' } });
  const bytes = (tex) => run(`estimateTextureBytes(${JSON.stringify(tex)})`);
  assert.equal(bytes({ source: [{ width: 512, height: 256 }] }), 512 * 256 * 4 * 4 / 3);
  assert.equal(bytes({ source: [{ width: 500, height: 256 }] }), 500 * 256 * 4, 'no mipmaps off a power of two');
  // a phone's night art: drawn at 1024x512, held at half that
  assert.equal(bytes({ source: [{ width: 1024, height: 512, image: { width: 512, height: 256 } }] }), 512 * 256 * 4 * 4 / 3);
});

test('the release check budget is the 500 MB Norton set, and the check is wired into the release steps', () => {
  const { MEMORY_BUDGET_MB } = require('../memory-budget.js');
  assert.equal(MEMORY_BUDGET_MB.check.total, 500);
  assert.ok(MEMORY_BUDGET_MB.check.textures + MEMORY_BUDGET_MB.check.heap >= MEMORY_BUDGET_MB.check.total);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['test:memory'], 'node scripts/check-memory-budget.js');
  const checklist = fs.readFileSync(path.join(ROOT, 'docs/release-update-checklist.md'), 'utf8');
  assert.match(checklist, /npm run test:memory/);
});

test('a phone wears two night variants, not four; the night art for what is on screen only', () => {
  const source = fs.readFileSync(path.join(ROOT, 'day-night-lighting.js'), 'utf8');
  const start = source.indexOf('function resolveBuildingNightVariantForDevice(');
  const body = source.slice(start, source.indexOf('\n}\n', start) + 3);
  const run = (profile) => {
    const context = vm.createContext({ getMemoryProfile: () => profile });
    vm.runInContext(body, context);
    return (v) => vm.runInContext(`resolveBuildingNightVariantForDevice(${JSON.stringify(v)})`, context);
  };
  const phone = run('low');
  assert.deepEqual(['night', 'half', 'deep', 'lamps', 'christmas'].map(phone), ['night', 'night', 'deep', 'deep', 'christmas']);
  const pc = run('desktop');
  assert.deepEqual(['night', 'half', 'deep', 'lamps'].map(pc), ['night', 'half', 'deep', 'lamps']);
  assert.match(source, /if \(wantNight && onScreenOnly && sprite\.visible === false\)/, 'off-screen buildings wait for their night art');
  assert.match(source, /trimBuildingNightTextures\(scene\);/, 'the night art is trimmed to its budget');
});
