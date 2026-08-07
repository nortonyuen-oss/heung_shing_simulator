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
  calibrationId: 'vessel-berth-2026-08-07-v11',
  berthAnchorsByVisualVariant: Object.freeze({
    ll: Object.freeze({
      alongFromQuayCenterTiles: 0.5275,
      normalFromQuayTiles: 0.2061,
    }),
    lr: Object.freeze({
      alongFromQuayCenterTiles: -0.8838,
      normalFromQuayTiles: 0.1418,
    }),
    ul: Object.freeze({
      alongFromQuayCenterTiles: 0.7229,
      normalFromQuayTiles: 1.8481,
    }),
    ur: Object.freeze({
      alongFromQuayCenterTiles: -1.1282,
      normalFromQuayTiles: 1.8039,
    }),
  }),
  depthRulesByVisualVariant: Object.freeze({
    // LL and LR both sit close enough to the quay that ordinary world-Y
    // sorting can tuck the vessel below the large harbor artwork. Keep only
    // their near-berth three-tile legs in front; UL/UR retain world sorting.
    //
    // Tried adding UL here too on 2026-08-02 after its recalibration moved
    // it closer to the quay (thinking it had hit the same problem LL/LR
    // needed this for) - reverted, screenshots showed it made things WORSE,
    // not better. The port sprite is one flat image (pier + cranes +
    // container yard painted together, no per-element depth within it), so
    // "always render the ship in front of the whole port" can only be
    // globally right or wrong for a given berth's camera geometry - for UL
    // it made the ship draw over crane legs that are supposed to occlude
    // it from this angle, which reads as visually worse than the original
    // "sinks into the yard" issue it was meant to fix.
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
