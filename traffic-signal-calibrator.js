// Junction traffic-signal position calibrator (test-mode dev tool): an instance of
// street-prop-calibrator.js over the poles traffic-signals.js keeps on the scene. Paste the
// copied JSON into constants.js (TRAFFIC_SIGNAL_ANCHOR_OFFSETS / TRAFFIC_SIGNAL_SCALE).

const trafficSignalCalibrator = createStreetPropCalibrator({
  id: 'traffic-signal',
  title: '路口交通燈位置微調',
  facings: ['sw', 'se', 'nw', 'ne'],
  facingLabels: {
    sw: 'SW（來車向東北行）', se: 'SE（來車向西北行）', nw: 'NW（來車向東南行）', ne: 'NE（來車向西南行）',
  },
  facingOf: (sprite) => sprite.trafficSignalFacing,
  sprites: (scene) => scene?.trafficSignalSprites,
  shippedOffsets: () => TRAFFIC_SIGNAL_ANCHOR_OFFSETS,
  shippedScale: () => TRAFFIC_SIGNAL_SCALE,
  refresh: (scene) => { if (typeof refreshAllTrafficSignalSprites === 'function') refreshAllTrafficSignalSprites(scene); },
  note: 'Paste into constants.js: TRAFFIC_SIGNAL_ANCHOR_OFFSETS (dx/dy are screen pixels from the geometric anchor, recorded at the default North view) and TRAFFIC_SIGNAL_SCALE.',
  extraRecord: () => ({ logicalInset: { ...TRAFFIC_SIGNAL_LOGICAL_INSET } }),
});

// Read by traffic-signals.js: a facing dragged this session overrides the shipped constant.
function getTrafficSignalCalibrationOffset(facing) {
  return trafficSignalCalibrator.getOffset(facing);
}

function getTrafficSignalCalibrationScale() {
  return trafficSignalCalibrator.getScale();
}

function isTrafficSignalCalibrationActive() {
  return trafficSignalCalibrator.isActive();
}

function isTrafficSignalPickerActive() {
  return trafficSignalCalibrator.isPickerActive();
}

function makeTrafficSignalSpriteDraggable(scene, sprite) {
  return trafficSignalCalibrator.makeSpriteDraggable(scene, sprite);
}

function toggleTrafficSignalCalibrator(scene) {
  return trafficSignalCalibrator.toggle(scene);
}

function teardownTrafficSignalCalibrator() {
  return trafficSignalCalibrator.teardown();
}

const trafficSignalCalibratorTestApi = {
  calibrator: trafficSignalCalibrator,
  getTrafficSignalCalibrationOffset,
  getTrafficSignalCalibrationScale,
  isTrafficSignalCalibrationActive,
  isTrafficSignalPickerActive,
  setTrafficSignalPickerActive: (value) => trafficSignalCalibrator.setPickerActive(value),
  buildTrafficSignalCalibrationRecord: () => trafficSignalCalibrator.buildRecord(),
  toggleTrafficSignalCalibrator,
  makeTrafficSignalSpriteDraggable,
  nudgeTrafficSignalCalibration: (dx, dy) => trafficSignalCalibrator.nudge(dx, dy),
  adjustTrafficSignalCalibrationScale: (delta) => trafficSignalCalibrator.adjustScale(delta),
};

if (typeof module !== 'undefined' && module.exports) module.exports = trafficSignalCalibratorTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    toggleTrafficSignalCalibrator,
    teardownTrafficSignalCalibrator,
    getTrafficSignalCalibrationOffset,
    getTrafficSignalCalibrationScale,
    isTrafficSignalPickerActive,
    isTrafficSignalCalibrationActive,
    makeTrafficSignalSpriteDraggable,
  });
}
