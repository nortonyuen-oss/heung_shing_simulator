const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

for (const [name, paths] of [['POSIX', path.posix], ['Windows', path.win32]]) {
  test(`desktop verifier lists and reads nested ASAR files on ${name}`, () => {
    // Use ASAR's actual directory traversal, including its platform separator.
    // This catches errors hidden by testing only one-level paths such as world/index.html.
    const file = path.join(path.dirname(require.resolve('@electron/asar')), 'filesystem.js');
    const module = { exports: {} }, localRequire = createRequire(file);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module, exports: module.exports,
      require: name => name === 'path' ? paths : localRequire(name),
    }, { filename: file });
    const archive = new module.exports.Filesystem(paths.resolve('fixture'));
    archive.setHeader({ files: {
      world: { files: { 'index.html': { size: 10, offset: '0' } } },
      data: { files: { 'world-terrain': { files: {
        'manifest.json': { size: 20, offset: '10' },
        packs: { files: { 'p-0-0.bin': { size: 30, offset: '30' } } },
      } } } },
    } }, 0);
    const context = vm.createContext({ path: paths, archive: 'fixture.asar', asar: {
      listPackage: () => archive.listFiles(),
      extractFile: (_archive, name) => archive.getFile(name),
    } });
    const verifier = fs.readFileSync(path.join(__dirname, '../scripts/verify-world-package.js'), 'utf8');
    const declarations = verifier.split('\n').filter(line => line.startsWith('const files = ') || line.startsWith('const read = '));
    assert.equal(declarations.length, 2);
    vm.runInContext(`${declarations.join('\n')}\nglobalThis.entries=files;globalThis.readFile=read;`, context);
    assert(context.entries.has('world/index.html'));
    assert(context.entries.has('data/world-terrain/manifest.json'));
    assert(context.entries.has('data/world-terrain/packs/p-0-0.bin'));
    assert.equal(context.readFile('world/index.html').size, 10);
    assert.equal(context.readFile('data/world-terrain/manifest.json').size, 20);
    assert.equal(context.readFile('data/world-terrain/packs/p-0-0.bin').size, 30);
  });
}
