// Roadside furniture position calibrator (test-mode dev tool): an instance of
// street-prop-calibrator.js over the props street-furniture.js keeps on the scene. One nudge per
// prop kind and view (`bin_sw`, `postbox_se`, ...) and one overall size multiplier. Paste the
// copied JSON into constants.js (STREET_FURNITURE_ANCHOR_OFFSETS / STREET_FURNITURE_SCALE).

const STREET_FURNITURE_CALIBRATION_FACINGS = Object.keys(STREET_FURNITURE_KINDS)
  .flatMap((kind) => ['sw', 'se'].map((view) => `${kind}_${view}`));

const streetFurnitureCalibrator = createStreetPropCalibrator({
  id: 'street-furniture',
  title: '路邊設施位置微調',
  facings: STREET_FURNITURE_CALIBRATION_FACINGS,
  facingLabels: Object.fromEntries(STREET_FURNITURE_CALIBRATION_FACINGS.map((facing) => {
    const [kind, view] = facing.split('_');
    return [facing, `${STREET_FURNITURE_KINDS[kind]?.label ?? kind}・${view === 'sw' ? '面向左下' : '面向右下'}`];
  })),
  facingOf: (sprite) => sprite.streetFurnitureFacing,
  sprites: (scene) => scene?.streetFurnitureSprites,
  shippedOffsets: () => STREET_FURNITURE_ANCHOR_OFFSETS,
  shippedScale: () => STREET_FURNITURE_SCALE,
  refresh: (scene) => { if (typeof refreshAllStreetFurnitureSprites === 'function') refreshAllStreetFurnitureSprites(scene); },
  note: 'Paste into constants.js: STREET_FURNITURE_ANCHOR_OFFSETS (dx/dy are screen pixels from the geometric foot, per kind_view, recorded at the default North view) and STREET_FURNITURE_SCALE (a multiplier on every kind\'s real height).',
  scaleStep: 0.05,
  minScale: 0.2,
  maxScale: 5,
  panelLeftPx: 700,
});

function getStreetFurnitureCalibrationOffset(facing) {
  return streetFurnitureCalibrator.getOffset(facing);
}

function getStreetFurnitureCalibrationScale() {
  return streetFurnitureCalibrator.getScale();
}

function isStreetFurnitureCalibrationActive() {
  return streetFurnitureCalibrator.isActive();
}

function makeStreetFurnitureSpriteDraggable(scene, sprite) {
  return streetFurnitureCalibrator.makeSpriteDraggable(scene, sprite);
}

function toggleStreetFurnitureCalibrator(scene) {
  return streetFurnitureCalibrator.toggle(scene);
}

function teardownStreetFurnitureCalibrator() {
  return streetFurnitureCalibrator.teardown();
}

const streetFurnitureCalibratorTestApi = {
  calibrator: streetFurnitureCalibrator,
  STREET_FURNITURE_CALIBRATION_FACINGS,
  getStreetFurnitureCalibrationOffset,
  getStreetFurnitureCalibrationScale,
  toggleStreetFurnitureCalibrator,
};

if (typeof module !== 'undefined' && module.exports) module.exports = streetFurnitureCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleStreetFurnitureCalibrator,
    teardownStreetFurnitureCalibrator,
    getStreetFurnitureCalibrationOffset,
    getStreetFurnitureCalibrationScale,
    isStreetFurnitureCalibrationActive,
    makeStreetFurnitureSpriteDraggable,
  });
}
