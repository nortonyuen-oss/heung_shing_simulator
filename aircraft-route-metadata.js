// Immutable calibration data captured with the airport-route-calibrator.
//
// Coordinates are logical isometric-world tiles, relative to the airport's
// anchor (top-left) tile.
//
// Unlike the container port (four harbor_ll/lr/ul/ur art variants swapped per
// rotation, see HARBOR_MODELS in constants.js), the airport has only one
// static sprite - it never redraws to face a different way when the map
// rotates. So these points are only visually correct at the exact map
// rotation they were captured at (calibratedMapRotation); aircraft-visuals.js
// deliberately projects them through that fixed rotation rather than the
// live one, so the flight path stays glued to the painted runway no matter
// which way the player has the camera turned.
//
// `direction` was chosen in the calibrator (click a marker to cycle it) and
// is only actually used at runtime for the parked phase at each gate - the
// runway/airborne points derive their on-screen facing from the direction of
// travel instead, since that's more accurate for a moving plane than any
// single fixed value.
//
// Landing is one continuous curve through 3 points - L0 (approachSpawn, the
// point the plane appears at), L1 (approachCurve, where the curve visibly
// passes through - see buildAircraftCurvePoints in aircraft-visuals.js, it
// converts this into the raw Bezier control point under the hood, so
// dragging this point in the calibrator is where the curve actually goes,
// same as a familiar tool like MS Paint's curve), L2 (landStart, touchdown)
// - followed by the ground roll to L3 (landEnd). Takeoff mirrors it: ground
// roll from T0 (takeoffStart) to T1 (liftoff), then the T1->T2
// (departCurve)->T3 (departureDespawn) climb-out curve. L1/T2 are placed
// here at the exact midpoint of their curve's endpoints, which is a no-op
// (the leg still renders perfectly straight) until dragged off that line in
// the calibrator - gate4/5/6 are similarly placeholder positions,
// interpolated between the calibrated gate1-3, pending their own
// calibration pass.
//
// Keeping these values in a script-loaded metadata object avoids fetches and
// lets aircraft-visuals cache the fully resolved track relative to whichever
// airport is actually placed.

const AIRCRAFT_ROUTE_METADATA_VALUE = Object.freeze({
  schemaVersion: 1,
  calibrationId: 'aircraft-route-2026-08-02-v11',
  calibratedMapRotation: 3,
  footprintCols: 12,
  footprintRows: 12,
  pointsByKey: Object.freeze({
    approachSpawn: Object.freeze({ dRow: -12.2391, dCol: 7.3641, direction: 'se' }),
    approachCurve: Object.freeze({ dRow: -4.9788, dCol: 5.2030, direction: 'se' }),
    landStart: Object.freeze({ dRow: 3.2436, dCol: 4.0545, direction: 'se' }),
    landEnd: Object.freeze({ dRow: 9.2422, dCol: 4.1480, direction: 'se' }),
    gate1: Object.freeze({ dRow: 3.9752, dCol: 7.4541, direction: 'ne' }),
    gate2: Object.freeze({ dRow: 7.4274, dCol: 7.3241, direction: 'ne' }),
    gate3: Object.freeze({ dRow: 0.7760, dCol: 7.3678, direction: 'ne' }),
    gate4: Object.freeze({ dRow: 2.7845, dCol: 7.4776, direction: 'ne' }),
    gate5: Object.freeze({ dRow: 6.2909, dCol: 7.4462, direction: 'ne' }),
    gate6: Object.freeze({ dRow: 8.4493, dCol: 7.5592, direction: 'ne' }),
    takeoffStart: Object.freeze({ dRow: 0.3425, dCol: 4.0429, direction: 'se' }),
    liftoff: Object.freeze({ dRow: 6.8811, dCol: 4.0499, direction: 'se' }),
    departCurve: Object.freeze({ dRow: 12.4344, dCol: 5.4486, direction: 'se' }),
    departureDespawn: Object.freeze({ dRow: 15.1857, dCol: 9.4722, direction: 'se' }),
  }),
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIRCRAFT_ROUTE_METADATA_VALUE;
}

if (typeof globalThis !== 'undefined') {
  globalThis.AIRCRAFT_ROUTE_METADATA = AIRCRAFT_ROUTE_METADATA_VALUE;
}
