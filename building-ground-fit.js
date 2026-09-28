// Fitting a building model to its lot by the model's own ground corners.
//
// The default fit (main.js getSpriteFootprintMetadata) scales a model so its whole visible width
// spans the footprint diamond and pins its lowest pixel to the diamond's front corner. That is
// right only when the widest thing in the picture is the lot itself. A shop sign, flagpole or pier
// sticking out past the lot makes the model too small and shifts it sideways, and a front corner
// that is not centred under the lot (art drawn a little off 45°) pushes it over the kerb.
//
// A model can instead carry its ground corners - the left, front and right points where its lot
// meets the ground, in source-PNG pixels (BUILDING_GROUND_CORNERS in constants.js, calibrated with
// building-ground-calibrator.js). The left-to-right span then sets the scale and the lot's centre
// line and front corner set the anchor, so nothing outside the lot moves the building.
//
// detectBuildingGroundCorners proposes the corners from the alpha channel: the lowest opaque pixel
// of each column traces the lot's two front edges (an inverted V); the longest straight run each
// way from the front corner at a plausible isometric slope ends at that side's corner. Anything
// hanging beyond the lot sits above that line and ends the run.

const BUILDING_GROUND_FIT_DEFAULTS = Object.freeze({
  alphaThreshold: 16,
  minSlope: 0.3,   // 2:1 isometric is 0.5; art drawn off-angle strays either way
  maxSlope: 0.75,
  slopeStep: 0.005,
});

// alpha: Uint8Array/Uint8ClampedArray of width*height alpha values, or RGBA data with `channels: 4`.
function detectBuildingGroundCorners(alpha, width, height, options = {}) {
  const { alphaThreshold, minSlope, maxSlope, slopeStep } = { ...BUILDING_GROUND_FIT_DEFAULTS, ...options };
  const channels = options.channels ?? 1;
  const offset = channels === 4 ? 3 : 0;
  if (!alpha || !(width > 0) || !(height > 0)) return null;

  // Lowest opaque pixel per column (-1: empty column).
  const low = new Int32Array(width).fill(-1);
  let minX = width;
  let maxX = -1;
  for (let x = 0; x < width; x++) {
    for (let y = height - 1; y >= 0; y--) {
      if (alpha[(y * width + x) * channels + offset] > alphaThreshold) {
        low[x] = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        break;
      }
    }
  }
  if (maxX < minX) return null;
  const spanWidth = maxX - minX + 1;

  // Rough front: the lowest point of the profile. Only used to split the columns into the two
  // sides; the real front corner is where the two edge lines meet, which also covers a lot whose
  // tip is clipped by the canvas or a building with a chamfered corner (a flat bottom).
  let lowestY = -1;
  for (let x = minX; x <= maxX; x++) lowestY = Math.max(lowestY, low[x]);
  let lowestXTotal = 0;
  let lowestXCount = 0;
  for (let x = minX; x <= maxX; x++) {
    if (low[x] >= lowestY - 1) { lowestXTotal += x; lowestXCount++; }
  }
  const splitX = lowestXTotal / lowestXCount;

  const tolerance = Math.max(2, spanWidth * 0.006);
  const maxGap = Math.max(3, Math.round(spanWidth * 0.02));

  // One side's edge: the straight line y = a + slope * d (d = distance outward from splitX, y
  // rising as d grows) whose inlier columns form the longest run, gaps of a lamp post or planter
  // allowed. Candidate lines come from the most common intercepts at each slope.
  function side(direction) {
    const columns = [];
    for (let x = Math.round(splitX); x >= minX && x <= maxX; x += direction) {
      if (low[x] >= 0) columns.push([Math.abs(x - splitX), low[x], x]);
    }
    let best = null;
    for (let slope = minSlope; slope <= maxSlope + 1e-9; slope += slopeStep) {
      const bins = new Map();
      columns.forEach(([d, y]) => {
        const bin = Math.round((y + slope * d) / tolerance);
        bins.set(bin, (bins.get(bin) || 0) + 1);
      });
      const candidates = [...bins.entries()].sort((p, q) => q[1] - p[1]).slice(0, 3);
      candidates.forEach(([bin]) => {
        // Refine the intercept to the mean of the columns near this bin.
        let total = 0;
        let count = 0;
        columns.forEach(([d, y]) => {
          const a = y + slope * d;
          if (Math.abs(a - bin * tolerance) <= tolerance) { total += a; count++; }
        });
        const intercept = total / count;
        let runStart = null;
        let runEnd = null;
        let gap = 0;
        let bestRun = null;
        columns.forEach(([d, y]) => {
          if (Math.abs(y - (intercept - slope * d)) <= tolerance) {
            if (runStart === null) runStart = d;
            runEnd = d;
            gap = 0;
          } else if (runStart !== null && ++gap > maxGap) {
            if (!bestRun || runEnd - runStart > bestRun.end - bestRun.start) bestRun = { start: runStart, end: runEnd };
            runStart = null;
            gap = 0;
          }
        });
        if (runStart !== null && (!bestRun || runEnd - runStart > bestRun.end - bestRun.start)) bestRun = { start: runStart, end: runEnd };
        if (!bestRun) return;
        const length = bestRun.end - bestRun.start;
        // Longest straight edge wins; on a near tie the slope nearer 2:1.
        if (!best || length > best.length + 1
          || (Math.abs(length - best.length) <= 1 && Math.abs(slope - 0.5) < Math.abs(best.slope - 0.5))) {
          best = { slope, intercept, length, outer: bestRun.end };
        }
      });
    }
    return best;
  }

  const left = side(-1);
  const right = side(1);
  if (!left || !right) return null;
  // Edge lines in distance-from-splitX terms: y = a - s*d. Where they meet is the front corner.
  // left: d = splitX - x, right: d = x - splitX.
  // aL - sL*(splitX - x) = aR - sR*(x - splitX)  =>  x = splitX + (aR - aL) / (sL + sR)
  const frontX = splitX + (right.intercept - left.intercept) / (left.slope + right.slope);
  const frontY = left.intercept - left.slope * (splitX - frontX);
  const leftX = splitX - left.outer;
  const rightX = splitX + right.outer;
  const point = (edge, x, d) => [round1(x), round1(edge.intercept - edge.slope * d)];
  // A side whose straight edge is short means the profile is not a lot edge at all
  // (a tower standing on nothing, a round base): no confident answer.
  const minLength = spanWidth * 0.2;
  const confident = left.length >= minLength && right.length >= minLength
    && leftX < frontX && rightX > frontX;
  return {
    left: point(left, leftX, left.outer),
    front: [round1(frontX), round1(frontY)],
    right: point(right, rightX, right.outer),
    slopes: [round3(left.slope), round3(right.slope)],
    visibleWidth: spanWidth,
    confident,
  };
}

// Sprite origin (in the same pixel space as the corners) and scale that place the lot's left and
// right corners on the footprint diamond's left and right corners and its front corner on the
// diamond's front row. The origin sits on the lot's centre line, so a front corner drawn a little
// off-centre does not drag the whole building over one kerb.
function fitBuildingToGroundCorners(corners, footprintScreenWidth) {
  const left = corners?.left;
  const right = corners?.right;
  const front = corners?.front;
  if (!left || !right || !front) return null;
  const groundWidth = right[0] - left[0];
  if (!(groundWidth > 1) || !(footprintScreenWidth > 0)) return null;
  return {
    originX: (left[0] + right[0]) / 2,
    originY: front[1],
    scale: footprintScreenWidth / groundWidth,
  };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectBuildingGroundCorners, fitBuildingToGroundCorners, BUILDING_GROUND_FIT_DEFAULTS };
}
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { detectBuildingGroundCorners, fitBuildingToGroundCorners });
}
