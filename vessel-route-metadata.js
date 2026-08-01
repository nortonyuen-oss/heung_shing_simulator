// Immutable calibration data captured with the visual route calibrator.
//
// Coordinates are logical isometric-world tiles, not screen pixels:
//   alongFromQuayCenterTiles: positive clockwise along the quay from its
//                             outward normal (n:+col, e:+row, s:-col, w:-row)
//   normalFromQuayTiles:      positive from the land edge out toward water
//
// Keeping these values in a script-loaded metadata object avoids fetches and
// lets vessel-visuals cache the fully resolved absolute berth with its route.

const VESSEL_ROUTE_METADATA_VALUE = Object.freeze({
  schemaVersion: 1,
  calibrationId: 'vessel-berth-2026-08-01-v4',
  berthAnchorsByVisualVariant: Object.freeze({
    ll: Object.freeze({
      alongFromQuayCenterTiles: 0.8507,
      normalFromQuayTiles: 0.2660,
    }),
    lr: Object.freeze({
      alongFromQuayCenterTiles: -0.7073,
      normalFromQuayTiles: 0.1424,
    }),
    ul: Object.freeze({
      alongFromQuayCenterTiles: 0.8755,
      normalFromQuayTiles: 1.8942,
    }),
    ur: Object.freeze({
      alongFromQuayCenterTiles: -1.0684,
      normalFromQuayTiles: 1.8398,
    }),
  }),
  depthRulesByVisualVariant: Object.freeze({
    // LL and LR both sit close enough to the quay that ordinary world-Y
    // sorting can tuck the vessel below the large harbor artwork. Keep only
    // their near-berth three-tile legs in front; UL/UR retain world sorting.
    ll: Object.freeze({
      nearBerthMode: 'front-of-port',
      portDepthOffset: 1,
    }),
    lr: Object.freeze({
      nearBerthMode: 'front-of-port',
      portDepthOffset: 1,
    }),
  }),
  parallelApproach: Object.freeze({
    // Keep only the final three inbound tiles (and the same first three
    // outbound tiles) parallel to the quay at berth clearance. Farther out,
    // the route may cross the quay's infinite normal plane to get around the
    // real coastline; treating that plane as a whole-map wall can make an
    // otherwise valid harbor completely unreachable.
    legTiles: 3.0,
    // Quadratic approach control keeps the curve outside the berth normal
    // while making its final tangent parallel to the quay.
    curveTangentLeadTiles: 0.35,
    curveSamples: 6,
  }),
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VESSEL_ROUTE_METADATA_VALUE;
}

if (typeof globalThis !== 'undefined') {
  globalThis.VESSEL_ROUTE_METADATA = VESSEL_ROUTE_METADATA_VALUE;
}
