const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'ui-profile.js'), 'utf8');

function loadUiProfile({ search = '', stored = null, coarse = false, width = 1280, storageThrows = false } = {}) {
  const metas = [];
  const events = [];
  const writes = [];
  const context = {
    URLSearchParams,
    location: { search },
    innerWidth: width,
    matchMedia: () => ({ matches: coarse }),
    localStorage: {
      getItem() {
        if (storageThrows) throw new Error('blocked');
        return stored;
      },
      setItem(key, value) {
        if (storageThrows) throw new Error('blocked');
        writes.push([key, value]);
      },
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    document: {
      documentElement: { dataset: {} },
      head: {
        querySelector: () => metas[0] || null,
        appendChild: (meta) => { metas.push(meta); },
      },
      createElement: () => ({
        name: '',
        content: '',
        attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; },
        remove() { metas.splice(0); },
      }),
      dispatchEvent: (event) => { events.push(event); },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    context,
    metas,
    events,
    writes,
    profile: () => vm.runInContext('getUiProfile()', context),
    preference: () => vm.runInContext('getUiProfilePreference()', context),
    set: (mode) => vm.runInContext(`setUiProfilePreference(${JSON.stringify(mode)})`, context),
    resolve: (input) => vm.runInContext(`resolveUiProfile(${JSON.stringify(input)})`, context),
  };
}

test('explicit preferences always win over device detection', () => {
  const { resolve } = loadUiProfile();
  assert.equal(resolve({ preference: 'desktop', primaryPointerCoarse: true, viewportWidth: 390, autoEnabled: true }), 'desktop');
  assert.equal(resolve({ preference: 'touch', primaryPointerCoarse: false, viewportWidth: 2560, autoEnabled: false }), 'touch');
});

test('auto picks touch only for a coarse primary pointer narrower than 1100px', () => {
  const { resolve } = loadUiProfile();
  assert.equal(resolve({ preference: 'auto', primaryPointerCoarse: true, viewportWidth: 844, autoEnabled: true }), 'touch');
  assert.equal(resolve({ preference: 'auto', primaryPointerCoarse: true, viewportWidth: 1099, autoEnabled: true }), 'touch');
  assert.equal(resolve({ preference: 'auto', primaryPointerCoarse: true, viewportWidth: 1100, autoEnabled: true }), 'desktop');
  // a narrow desktop window must not flip a mouse user into the phone UI
  assert.equal(resolve({ preference: 'auto', primaryPointerCoarse: false, viewportWidth: 600, autoEnabled: true }), 'desktop');
  // An explicit gate override remains supported for diagnostics.
  assert.equal(resolve({ preference: 'auto', primaryPointerCoarse: true, viewportWidth: 844, autoEnabled: false }), 'desktop');
});

test('a phone automatically gets touch with a device-width viewport', () => {
  const page = loadUiProfile({ coarse: true, width: 844 });
  assert.equal(page.preference(), 'auto');
  assert.equal(page.profile(), 'touch');
  assert.equal(page.context.document.documentElement.dataset.uiProfile, 'touch');
  assert.equal(page.metas.length, 1);
  assert.match(page.metas[0].content, /width=device-width/);
});

test('automatic mode keeps mouse desktops and wide touch displays on desktop', () => {
  assert.equal(loadUiProfile({ coarse: false, width: 600 }).profile(), 'desktop');
  assert.equal(loadUiProfile({ coarse: true, width: 1100 }).profile(), 'desktop');
  assert.equal(loadUiProfile({ coarse: true, width: 1280 }).metas.length, 0);
});

test('a saved touch preference applies the profile attribute and a device-width viewport', () => {
  const page = loadUiProfile({ stored: 'touch' });
  assert.equal(page.profile(), 'touch');
  assert.equal(page.context.document.documentElement.dataset.uiProfile, 'touch');
  assert.equal(page.metas.length, 1);
  assert.equal(page.metas[0].name, 'viewport');
  assert.match(page.metas[0].content, /width=device-width/);
  assert.match(page.metas[0].content, /viewport-fit=cover/);
  assert.doesNotMatch(page.metas[0].content, /user-scalable/, 'zoom must stay available to the browser');
});

test('?ui= beats the saved preference for this load only, and unknown values are ignored', () => {
  const override = loadUiProfile({ search: '?ui=desktop', stored: 'touch' });
  assert.equal(override.profile(), 'desktop');
  assert.equal(override.writes.length, 0, 'the URL override is not saved');
  assert.equal(loadUiProfile({ search: '?ui=bogus', stored: 'touch' }).profile(), 'touch');
  assert.equal(loadUiProfile({ stored: 'bogus' }).preference(), 'auto');
});

test('changing the preference persists it, switches the viewport and announces a real change once', () => {
  const page = loadUiProfile();
  assert.equal(page.set('touch'), 'touch');
  assert.deepEqual(page.writes, [['heung-shing.ui-profile.v1', 'touch']]);
  assert.equal(page.metas.length, 1);
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0].type, 'uiprofilechange');
  assert.equal(page.events[0].detail.profile, 'touch');
  assert.equal(page.events[0].detail.previous, 'desktop');

  page.set('touch');
  assert.equal(page.events.length, 1, 'same profile again: no change event');
  assert.equal(page.metas.length, 1, 'no duplicate viewport meta');

  page.set('desktop');
  assert.equal(page.profile(), 'desktop');
  assert.equal(page.metas.length, 0);
  assert.equal(page.events.length, 2);
  assert.equal(page.context.document.documentElement.dataset.uiProfile, 'desktop');
});

test('an invalid preference is rejected without side effects', () => {
  const page = loadUiProfile();
  assert.equal(page.set('hologram'), 'desktop');
  assert.equal(page.writes.length, 0);
  assert.equal(page.events.length, 0);
});

test('blocked storage never stops the page: the choice applies to this session', () => {
  const page = loadUiProfile({ storageThrows: true });
  assert.equal(page.profile(), 'desktop');
  assert.equal(page.set('touch'), 'touch');
  assert.equal(page.profile(), 'touch');
});

test('rotating or resizing does not re-resolve the profile', () => {
  const page = loadUiProfile({ coarse: true, width: 844 });
  page.context.innerWidth = 390;
  assert.equal(page.profile(), 'touch');
  page.context.innerWidth = 2000;
  assert.equal(page.profile(), 'touch');
});
