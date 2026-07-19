const DEFAULT_DEFRINGE_OPTIONS = Object.freeze({
  // Generated cut-outs commonly contain a 3-5 px white feather. Look through
  // the complete feather for an opaque colour instead of sampling its white
  // inner ring and mistaking that for part of the model.
  edgeRadius: 5,
  sampleRadius: 12,
  opaqueAlpha: 220,
  transparentAlpha: 3,
  minAlpha: 4,
  maxAlpha: 250,
  minLightnessDelta: 8,
  minDistanceImprovement: 14,
  pureWhiteThreshold: 246,
  pureWhiteNeighborLimit: 225,
  pureWhiteMaxAlpha: 250,
});

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function pixelOffset(width, x, y) {
  return (y * width + x) * 4;
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function colorLightness(color) {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

function hasTransparentNeighbor(data, width, height, x, y, options) {
  for (let dy = -options.edgeRadius; dy <= options.edgeRadius; dy++) {
    for (let dx = -options.edgeRadius; dx <= options.edgeRadius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      if (data[pixelOffset(width, xx, yy) + 3] <= options.transparentAlpha) return true;
    }
  }
  return false;
}

function findNearbyOpaqueColor(data, width, height, x, y, options) {
  for (let radius = 1; radius <= options.sampleRadius; radius++) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let weightTotal = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const offset = pixelOffset(width, xx, yy);
        const alpha = data[offset + 3];
        if (alpha < options.opaqueAlpha) continue;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const weight = (alpha / 255) / distance;
        red += data[offset] * weight;
        green += data[offset + 1] * weight;
        blue += data[offset + 2] * weight;
        weightTotal += weight;
      }
    }

    if (weightTotal > 0) {
      return [red / weightTotal, green / weightTotal, blue / weightTotal].map(clampByte);
    }
  }
  return null;
}

function recoverWhiteMatteColor(source, alpha) {
  const alphaRatio = alpha / 255;
  if (alphaRatio <= 0) return source.slice();
  const whiteContribution = 255 * (1 - alphaRatio);
  return source.map((channel) => clampByte((channel - whiteContribution) / alphaRatio));
}

function getDefringeReplacement(source, alpha, nearby, options) {
  const sourceLightness = colorLightness(source);
  const nearbyLightness = colorLightness(nearby);
  if (sourceLightness < nearbyLightness + options.minLightnessDelta) return null;

  const recovered = recoverWhiteMatteColor(source, alpha);
  const sourceDistance = colorDistance(source, nearby);
  const recoveredDistance = colorDistance(recovered, nearby);
  if (recoveredDistance + options.minDistanceImprovement < sourceDistance) return recovered;

  const sourceIsPureWhite = Math.min(...source) >= options.pureWhiteThreshold;
  if (
    sourceIsPureWhite
    && alpha <= options.pureWhiteMaxAlpha
    && nearbyLightness <= options.pureWhiteNeighborLimit
  ) {
    return nearby.slice();
  }
  return null;
}

function defringeWhiteMatteRgba(input, width, height, overrides = {}) {
  const options = { ...DEFAULT_DEFRINGE_OPTIONS, ...overrides };
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) {
    throw new TypeError('RGBA input must be a Buffer or Uint8Array.');
  }
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new TypeError('width and height must be positive integers.');
  }
  if (input.length !== width * height * 4) {
    throw new RangeError(`Expected ${width * height * 4} RGBA bytes, received ${input.length}.`);
  }

  const output = Buffer.from(input);
  let edgePixels = 0;
  let sampledPixels = 0;
  let changedPixels = 0;
  let totalColorDelta = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = pixelOffset(width, x, y);
      const alpha = input[offset + 3];
      if (alpha < options.minAlpha || alpha > options.maxAlpha) continue;
      if (!hasTransparentNeighbor(input, width, height, x, y, options)) continue;
      edgePixels++;

      const nearby = findNearbyOpaqueColor(input, width, height, x, y, options);
      if (!nearby) continue;
      sampledPixels++;
      const source = [input[offset], input[offset + 1], input[offset + 2]];
      const replacement = getDefringeReplacement(source, alpha, nearby, options);
      if (!replacement) continue;

      const delta = colorDistance(source, replacement);
      if (delta < 1) continue;
      output[offset] = replacement[0];
      output[offset + 1] = replacement[1];
      output[offset + 2] = replacement[2];
      // Alpha is deliberately preserved so silhouettes and anchors do not move.
      changedPixels++;
      totalColorDelta += delta;
    }
  }

  return {
    data: output,
    stats: {
      edgePixels,
      sampledPixels,
      changedPixels,
      averageColorDelta: changedPixels > 0 ? totalColorDelta / changedPixels : 0,
      changedRatio: edgePixels > 0 ? changedPixels / edgePixels : 0,
    },
  };
}

module.exports = {
  DEFAULT_DEFRINGE_OPTIONS,
  defringeWhiteMatteRgba,
  recoverWhiteMatteColor,
};
