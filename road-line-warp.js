// Quad-corner image warping shared by road-line-calibrator.js (live preview) and
// scripts/bake-road-line-textures.js (the actual bake), so a placement's four independently
// draggable corners always land pixel-identically in both places - what you calibrate is
// exactly what gets baked.
//
// WHY FOUR FREE CORNERS, NOT ROTATE+SCALE
// A marking drawn with translate/rotate/scale only ever stays an axis-aligned rectangle turned
// in the screen plane - it never leans into the tile's own isometric perspective, so it reads as
// pasted flat above the road rather than painted on it (see the calibrator screenshot that
// prompted this: a box-junction bracket sitting square-on over a receding lane). Four
// independently draggable corners - the same interaction building-light-calibrator uses for a
// window panel - let you drag each corner onto the tile's actual ground-plane edges, however
// they sit after rotation/zoom.
//
// This is a plain projective (perspective) warp, not a triangle-mesh approximation: given the
// unit square (0,0)-(1,0)-(1,1)-(0,1) and where its four corners should land, Heckbert's closed-
// form ("Fundamentals of Texture Mapping and Image Warping", 1989) gives the exact projective
// map in one pass, with no diagonal seam the way splitting the quad into two affine triangles
// would. Rendering inverts it: for every destination pixel, solve the tiny 2x2 linear system
// back to a source (u, v) and bilinear-sample there - only pixels landing inside the unit square
// are actually painted, which is what clips the marking to the quad's own edges for free.
//
// Pure pixel-buffer math, no DOM/Node APIs: operates on any Uint8ClampedArray/Buffer/Uint8Array
// straight-RGBA byte layout (index = (y*width + x) * 4), so the same function warms a browser
// canvas's ImageData in road-line-calibrator.js and a sharp raw buffer in the bake script.

// Coefficients of the projective map from the unit square (0,0),(1,0),(1,1),(0,1) to
// `corners` = [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] (same order: top-left, top-right, bottom-right,
// bottom-left). Forward mapping (u,v in 0..1) -> (X,Y): X = (a*u+b*v+c)/(g*u+h*v+1),
// Y = (d*u+e*v+f)/(g*u+h*v+1) - a plain affine map (g=h=0) exactly when the quad is already a
// parallelogram (the common case for a flat tile with no manual skew).
function computeQuadWarpCoefficients(corners) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;

  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const denom = dx1 * dy2 - dx2 * dy1;
    if (denom) {
      g = (dx3 * dy2 - dx2 * dy3) / denom;
      h = (dx1 * dy3 - dx3 * dy1) / denom;
    }
  }
  return {
    a: x1 - x0 + g * x1,
    b: x3 - x0 + h * x3,
    c: x0,
    d: y1 - y0 + g * y1,
    e: y3 - y0 + h * y3,
    f: y0,
    g,
    h,
  };
}

// Inverse of the above at one destination point: (X, Y) -> {u, v} in the source's unit square,
// or null if the map is degenerate there (corners collapsed to a line/point). Callers still need
// to check 0<=u<=1 && 0<=v<=1 themselves - a point outside the quad inverts to a real (u,v) that
// simply falls outside the unit square.
function invertQuadWarpPoint(coef, x, y) {
  const A11 = coef.a - x * coef.g;
  const A12 = coef.b - x * coef.h;
  const B1 = x - coef.c;
  const A21 = coef.d - y * coef.g;
  const A22 = coef.e - y * coef.h;
  const B2 = y - coef.f;
  const det = A11 * A22 - A12 * A21;
  if (!det) return null;
  return {
    u: (B1 * A22 - A12 * B2) / det,
    v: (A11 * B2 - B1 * A21) / det,
  };
}

// Straight-alpha "source over destination" blend of one pixel into `dst` at byte offset `di`.
function blendPixelOver(dst, di, sr, sg, sb, sa) {
  if (sa <= 0) return;
  if (sa >= 255) {
    dst[di] = sr; dst[di + 1] = sg; dst[di + 2] = sb; dst[di + 3] = 255;
    return;
  }
  const srcA = sa / 255;
  const dstA = dst[di + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) { dst[di] = 0; dst[di + 1] = 0; dst[di + 2] = 0; dst[di + 3] = 0; return; }
  dst[di] = Math.round((sr * srcA + dst[di] * dstA * (1 - srcA)) / outA);
  dst[di + 1] = Math.round((sg * srcA + dst[di + 1] * dstA * (1 - srcA)) / outA);
  dst[di + 2] = Math.round((sb * srcA + dst[di + 2] * dstA * (1 - srcA)) / outA);
  dst[di + 3] = Math.round(outA * 255);
}

// Bilinear-samples `src` (straight RGBA, width x height) at fractional pixel coords (px, py);
// returns null outside the source's own bounds (nothing to blend there).
function sampleBilinear(src, srcWidth, srcHeight, px, py) {
  if (px < 0 || py < 0 || px > srcWidth - 1 || py > srcHeight - 1) return null;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(srcWidth - 1, x0 + 1);
  const y1 = Math.min(srcHeight - 1, y0 + 1);
  const fx = px - x0;
  const fy = py - y0;
  const idx = (x, y) => (y * srcWidth + x) * 4;
  const i00 = idx(x0, y0); const i10 = idx(x1, y0); const i01 = idx(x0, y1); const i11 = idx(x1, y1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const chan = (c) => lerp(
    lerp(src[i00 + c], src[i10 + c], fx),
    lerp(src[i01 + c], src[i11 + c], fx),
    fy,
  );
  return { r: chan(0), g: chan(1), b: chan(2), a: chan(3) };
}

// Warps `src` (straight RGBA, srcWidth x srcHeight) into the quad `corners` (four [x, y] points
// in `dst`'s own pixel space, top-left/top-right/bottom-right/bottom-left) and alpha-blends the
// result over `dst` (straight RGBA, dstWidth x dstHeight) in place. Only touches the corners'
// own bounding box intersected with the destination canvas, and only pixels landing inside the
// quad - everything else in `dst` is untouched.
//
// `opacity` (0..1, default 1) scales every sampled pixel's alpha before blending - a fresh AI-
// generated marking is typically flat, pure-white and full-alpha, which reads as a sticker
// pasted on top of the tile's own worn, semi-transparent paint; dialling it down lets some of
// the asphalt underneath show through, closer to how faded road paint actually looks.
function warpQuadImageOnto({
  src, srcWidth, srcHeight, dst, dstWidth, dstHeight, corners, opacity = 1,
}) {
  const coef = computeQuadWarpCoefficients(corners);
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(dstWidth - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(dstHeight - 1, Math.ceil(Math.max(...ys)));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const uv = invertQuadWarpPoint(coef, x + 0.5, y + 0.5);
      if (!uv || uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) continue;
      const sample = sampleBilinear(src, srcWidth, srcHeight, uv.u * (srcWidth - 1), uv.v * (srcHeight - 1));
      if (!sample) continue;
      blendPixelOver(dst, (y * dstWidth + x) * 4, sample.r, sample.g, sample.b, sample.a * opacity);
    }
  }
}

const roadLineWarpTestApi = {
  computeQuadWarpCoefficients,
  invertQuadWarpPoint,
  sampleBilinear,
  warpQuadImageOnto,
};

if (typeof module !== 'undefined' && module.exports) module.exports = roadLineWarpTestApi;

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    computeQuadWarpCoefficients,
    invertQuadWarpPoint,
    sampleBilinear,
    warpQuadImageOnto,
  });
}
