// Bridge parapet position calibrator (test-mode dev tool): an instance of
// street-prop-calibrator.js over the barrier segments bridge-parapets.js keeps on the scene.
// Paste the copied JSON into constants.js (BRIDGE_PARAPET_ANCHOR_OFFSETS / BRIDGE_PARAPET_SCALE).
// Facings are the screen edge the segment stands on. Scale changes the segment's length as
// well as its height, so a segment stops spanning its tile edge when it strays far from the
// baked fit (50 px per edge at 0.08).

const bridgeParapetCalibrator = createStreetPropCalibrator({
  id: 'bridge-parapet',
  title: '天橋護欄位置微調',
  facings: ['ne', 'se', 'sw', 'nw'],
  facingLabels: { ne: 'NE 邊（遠、NW–SE 橋）', se: 'SE 邊（近、SW–NE 橋）', sw: 'SW 邊（近、NW–SE 橋）', nw: 'NW 邊（遠、SW–NE 橋）' },
  facingOf: (sprite) => sprite.bridgeParapetFacing,
  sprites: (scene) => scene?.bridgeParapetSprites,
  shippedOffsets: () => BRIDGE_PARAPET_ANCHOR_OFFSETS,
  shippedScale: () => BRIDGE_PARAPET_SCALE,
  refresh: (scene) => { if (typeof refreshAllBridgeParapetSprites === 'function') refreshAllBridgeParapetSprites(scene); },
  note: 'Paste into constants.js: BRIDGE_PARAPET_ANCHOR_OFFSETS (dx/dy are screen pixels from the edge midpoint on the deck, recorded at the default North view) and BRIDGE_PARAPET_SCALE.',
  panelLeftPx: 700,
});

function getBridgeParapetCalibrationOffset(facing) {
  return bridgeParapetCalibrator.getOffset(facing);
}

function getBridgeParapetCalibrationScale() {
  return bridgeParapetCalibrator.getScale();
}

function isBridgeParapetCalibrationActive() {
  return bridgeParapetCalibrator.isActive();
}

function isBridgeParapetPickerActive() {
  return bridgeParapetCalibrator.isPickerActive();
}

function makeBridgeParapetSpriteDraggable(scene, sprite) {
  return bridgeParapetCalibrator.makeSpriteDraggable(scene, sprite);
}

function toggleBridgeParapetCalibrator(scene) {
  return bridgeParapetCalibrator.toggle(scene);
}

function teardownBridgeParapetCalibrator() {
  return bridgeParapetCalibrator.teardown();
}

const bridgeParapetCalibratorTestApi = {
  calibrator: bridgeParapetCalibrator,
  getBridgeParapetCalibrationOffset,
  getBridgeParapetCalibrationScale,
  isBridgeParapetCalibrationActive,
  isBridgeParapetPickerActive,
  toggleBridgeParapetCalibrator,
  makeBridgeParapetSpriteDraggable,
};

if (typeof module !== 'undefined' && module.exports) module.exports = bridgeParapetCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleBridgeParapetCalibrator,
    teardownBridgeParapetCalibrator,
    getBridgeParapetCalibrationOffset,
    getBridgeParapetCalibrationScale,
    isBridgeParapetPickerActive,
    isBridgeParapetCalibrationActive,
    makeBridgeParapetSpriteDraggable,
  });
}
