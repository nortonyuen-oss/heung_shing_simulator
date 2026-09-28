// Roadside furniture position calibrator (test-mode dev tool): an instance of
// street-prop-calibrator.js over the props street-furniture.js keeps on the scene. One nudge per
// prop kind and kerb edge (`bin_ne`, `postbox_sw`, ...) and one size per kind, adjusted through the
// last-dragged prop. Paste the copied JSON into constants.js (STREET_FURNITURE_ANCHOR_OFFSETS /
// STREET_FURNITURE_KIND_SCALES).

// One nudge per kind and kerb edge: the two sides of a road are calibrated separately.
const STREET_FURNITURE_EDGE_LABELS = Object.freeze({ ne: '右上邊（遠）', nw: '左上邊（遠）', se: '右下邊（近）', sw: '左下邊（近）' });
const STREET_FURNITURE_CALIBRATION_FACINGS = Object.keys(STREET_FURNITURE_KINDS)
  .flatMap((kind) => ['ne', 'nw', 'se', 'sw'].map((edge) => `${kind}_${edge}`));

const streetFurnitureCalibrator = createStreetPropCalibrator({
  id: 'street-furniture',
  title: '路邊設施位置微調',
  facings: STREET_FURNITURE_CALIBRATION_FACINGS,
  facingLabels: Object.fromEntries(STREET_FURNITURE_CALIBRATION_FACINGS.map((facing) => {
    const [kind, edge] = facing.split('_');
    return [facing, `${STREET_FURNITURE_KINDS[kind]?.label ?? kind}・${STREET_FURNITURE_EDGE_LABELS[edge] ?? edge}`];
  })),
  facingOf: (sprite) => sprite.streetFurnitureFacing,
  sprites: (scene) => scene?.streetFurnitureSprites,
  shippedOffsets: () => STREET_FURNITURE_ANCHOR_OFFSETS,
  shippedScale: (kind) => STREET_FURNITURE_KIND_SCALES[kind] ?? 1,
  scaleGroupOf: (facing) => facing.split('_')[0],
  scaleGroupLabels: Object.fromEntries(Object.entries(STREET_FURNITURE_KINDS).map(([kind, spec]) => [kind, spec.label])),
  refresh: (scene) => { if (typeof refreshAllStreetFurnitureSprites === 'function') refreshAllStreetFurnitureSprites(scene); },
  note: 'Paste into constants.js: STREET_FURNITURE_ANCHOR_OFFSETS (dx/dy are screen pixels from the geometric foot, per kind and kerb edge (kind_ne, kind_sw...), recorded at the default North view) and STREET_FURNITURE_KIND_SCALES (per-kind multipliers on each kind\'s real height).',
  scaleStep: 0.05,
  minScale: 0.2,
  maxScale: 5,
  panelLeftPx: 700,
});

function getStreetFurnitureCalibrationOffset(facing) {
  return streetFurnitureCalibrator.getOffset(facing);
}

function getStreetFurnitureCalibrationScale(kind) {
  return streetFurnitureCalibrator.getScale(kind);
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
