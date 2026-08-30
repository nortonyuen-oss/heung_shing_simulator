const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openGameDatabase } = require('../db');

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blstore-'));
  return { path: path.join(dir, 'test.sqlite'), dir };
}

test('building_light_profiles store: put / get / delete / replace, survives reopen', () => {
  const { path: dbPath } = tmpDb();
  let store = openGameDatabase(dbPath);

  assert.deepEqual(store.getBuildingLightProfiles(), {});

  const profile = { class: 'res', panels: [{ c: [[0, 0], [1, 0], [1, 1], [0, 1]], rows: 4, cols: 3 }], lamps: [], beacons: [] };
  store.putBuildingLightProfile('house2x2_4', profile);
  store.putBuildingLightProfile('hospital_4x4', { class: 'svc', service: true, panels: [], lamps: [{ x: 0.5, y: 0.9, r: 0.1 }] });
  assert.deepEqual(store.getBuildingLightProfiles().house2x2_4, profile);

  // upsert
  store.putBuildingLightProfile('house2x2_4', { ...profile, class: 'off' });
  assert.equal(store.getBuildingLightProfiles().house2x2_4.class, 'off');

  store.deleteBuildingLightProfile('hospital_4x4');
  assert.equal(store.getBuildingLightProfiles().hospital_4x4, undefined);

  // survives a reopen - this is the "won't vanish on game reset" guarantee
  store.close();
  store = openGameDatabase(dbPath);
  assert.equal(store.getBuildingLightProfiles().house2x2_4.class, 'off');

  // bulk replace (import)
  store.replaceBuildingLightProfiles({ a: { class: 'off' }, b: { class: 'res' } });
  assert.deepEqual(Object.keys(store.getBuildingLightProfiles()).sort(), ['a', 'b']);

  assert.throws(() => store.putBuildingLightProfile('', { class: 'off' }), /sprite_key/);
  store.close();
});

test('building_light_profiles is a separate table from game_saves', () => {
  const { path: dbPath } = tmpDb();
  const store = openGameDatabase(dbPath);
  store.putBuildingLightProfile('x', { class: 'off' });
  // creating and deleting a save must not touch the calibration store
  const save = store.createSave({ city_name: 'T', save_data: { v: 1 } });
  store.deleteSave(save.id);
  assert.equal(store.getBuildingLightProfiles().x.class, 'off');
  store.close();
});
