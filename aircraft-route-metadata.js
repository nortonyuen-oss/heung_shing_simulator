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
// four runway points derive their on-screen facing from the direction of
// travel instead, since that's more accurate for a moving plane than any
// single fixed value.
//
// Keeping these values in a script-loaded metadata object avoids fetches and
// lets aircraft-visuals cache the fully resolved track relative to whichever
// airport is actually placed.

const AIRCRAFT_ROUTE_METADATA_VALUE = Object.freeze({
  schemaVersion: 1,
  calibrationId: 'aircraft-route-2026-08-02-v7',
  calibratedMapRotation: 3,
  footprintCols: 12,
  footprintRows: 12,
  pointsByKey: Object.freeze({
    landStart: Object.freeze({ dRow: -3.3387, dCol: 6.0292, direction: 'se' }),
    landEnd: Object.freeze({ dRow: 9.4574, dCol: 4.1100, direction: 'se' }),
    gate1: Object.freeze({ dRow: 3.9752, dCol: 7.4541, direction: 'ne' }),
    gate2: Object.freeze({ dRow: 7.4274, dCol: 7.3241, direction: 'ne' }),
    gate3: Object.freeze({ dRow: 0.7760, dCol: 7.3678, direction: 'ne' }),
    takeoffStart: Object.freeze({ dRow: 0.6210, dCol: 4.0176, direction: 'se' }),
    liftoff: Object.freeze({ dRow: 9.6544, dCol: 7.1224, direction: 'se' }),
  }),
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIRCRAFT_ROUTE_METADATA_VALUE;
}

if (typeof globalThis !== 'undefined') {
  globalThis.AIRCRAFT_ROUTE_METADATA = AIRCRAFT_ROUTE_METADATA_VALUE;
}
