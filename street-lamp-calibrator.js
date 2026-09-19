// Street lamp position calibrator (test-mode dev tool): an instance of street-prop-calibrator.js
// over the posts street-lamps.js keeps on the scene. Paste the copied JSON into constants.js
// (STREET_LAMP_ANCHOR_OFFSETS / STREET_LAMP_SCALE). Facings are the arm direction on screen.

const streetLampCalibrator = createStreetPropCalibrator({
  id: 'street-lamp',
  title: '路燈位置微調',
  facings: ['nw', 'ne', 'sw', 'se'],
  facingLabels: { nw: '臂指 NW（企 SE 邊）', ne: '臂指 NE（企 SW 邊）', sw: '臂指 SW（企 NE 邊）', se: '臂指 SE（企 NW 邊）' },
  facingOf: (sprite) => sprite.streetLampFacing,
  sprites: (scene) => scene?.streetLampSprites,
  shippedOffsets: () => STREET_LAMP_ANCHOR_OFFSETS,
  shippedScale: () => STREET_LAMP_SCALE,
  refresh: (scene) => { if (typeof refreshAllStreetLampSprites === 'function') refreshAllStreetLampSprites(scene); },
  note: 'Paste into constants.js: STREET_LAMP_ANCHOR_OFFSETS (dx/dy are screen pixels from the geometric anchor, recorded at the default North view) and STREET_LAMP_SCALE.',
  extraRecord: () => ({ logicalInset: { ...STREET_LAMP_LOGICAL_INSET } }),
  panelLeftPx: 360,
});

function getStreetLampCalibrationOffset(facing) {
  return streetLampCalibrator.getOffset(facing);
}

function getStreetLampCalibrationScale() {
  return streetLampCalibrator.getScale();
}

function isStreetLampCalibrationActive() {
  return streetLampCalibrator.isActive();
}

function isStreetLampPickerActive() {
  return streetLampCalibrator.isPickerActive();
}

function makeStreetLampSpriteDraggable(scene, sprite) {
  return streetLampCalibrator.makeSpriteDraggable(scene, sprite);
}

function toggleStreetLampCalibrator(scene) {
  return streetLampCalibrator.toggle(scene);
}

function teardownStreetLampCalibrator() {
  return streetLampCalibrator.teardown();
}

const streetLampCalibratorTestApi = {
  calibrator: streetLampCalibrator,
  getStreetLampCalibrationOffset,
  getStreetLampCalibrationScale,
  isStreetLampCalibrationActive,
  isStreetLampPickerActive,
  toggleStreetLampCalibrator,
  makeStreetLampSpriteDraggable,
};

if (typeof module !== 'undefined' && module.exports) module.exports = streetLampCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleStreetLampCalibrator,
    teardownStreetLampCalibrator,
    getStreetLampCalibrationOffset,
    getStreetLampCalibrationScale,
    isStreetLampPickerActive,
    isStreetLampCalibrationActive,
    makeStreetLampSpriteDraggable,
  });
}
