// Pedestrian railing position calibrator (test-mode dev tool): an instance of
// street-prop-calibrator.js over the railing runs pedestrian-railings.js keeps on the scene.
// Paste the copied JSON into constants.js (PEDESTRIAN_RAILING_ANCHOR_OFFSETS /
// PEDESTRIAN_RAILING_SCALE). Facings are the screen kerb a run stands on. Scale changes a
// run's length as well as its height, so it stops covering half a tile when it strays far
// from 25/440.

const pedestrianRailingCalibrator = createStreetPropCalibrator({
  id: 'pedestrian-railing',
  title: '行人路欄杆位置微調',
  facings: ['ne', 'se', 'sw', 'nw'],
  facingLabels: { ne: 'NE 邊（遠、NW–SE 路）', se: 'SE 邊（近、SW–NE 路）', sw: 'SW 邊（近、NW–SE 路）', nw: 'NW 邊（遠、SW–NE 路）' },
  facingOf: (sprite) => sprite.pedestrianRailingFacing,
  sprites: (scene) => scene?.pedestrianRailingSprites,
  shippedOffsets: () => PEDESTRIAN_RAILING_ANCHOR_OFFSETS,
  shippedScale: () => PEDESTRIAN_RAILING_SCALE,
  refresh: (scene) => { if (typeof refreshAllPedestrianRailingSprites === 'function') refreshAllPedestrianRailingSprites(scene); },
  note: 'Paste into constants.js: PEDESTRIAN_RAILING_ANCHOR_OFFSETS (dx/dy are screen pixels from the run midpoint on the kerb, recorded at the default North view) and PEDESTRIAN_RAILING_SCALE.',
  extraRecord: () => ({ logicalInset: { ...PEDESTRIAN_RAILING_LOGICAL_INSET } }),
  scaleStep: 0.001,
  panelLeftPx: 700,
});

function getPedestrianRailingCalibrationOffset(facing) {
  return pedestrianRailingCalibrator.getOffset(facing);
}

function getPedestrianRailingCalibrationScale() {
  return pedestrianRailingCalibrator.getScale();
}

function isPedestrianRailingCalibrationActive() {
  return pedestrianRailingCalibrator.isActive();
}

function makePedestrianRailingSpriteDraggable(scene, sprite) {
  return pedestrianRailingCalibrator.makeSpriteDraggable(scene, sprite);
}

function togglePedestrianRailingCalibrator(scene) {
  return pedestrianRailingCalibrator.toggle(scene);
}

function teardownPedestrianRailingCalibrator() {
  return pedestrianRailingCalibrator.teardown();
}

const pedestrianRailingCalibratorTestApi = {
  calibrator: pedestrianRailingCalibrator,
  getPedestrianRailingCalibrationOffset,
  getPedestrianRailingCalibrationScale,
  isPedestrianRailingCalibrationActive,
  togglePedestrianRailingCalibrator,
};

if (typeof module !== 'undefined' && module.exports) module.exports = pedestrianRailingCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    togglePedestrianRailingCalibrator,
    teardownPedestrianRailingCalibrator,
    getPedestrianRailingCalibrationOffset,
    getPedestrianRailingCalibrationScale,
    isPedestrianRailingCalibrationActive,
    makePedestrianRailingSpriteDraggable,
  });
}
