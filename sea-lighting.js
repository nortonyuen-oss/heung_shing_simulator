// Night lighting for the sea assets (避風塘：漁船、舢舨、浮台、海鮮舫、浮標…) - 漁火閃閃.
//
// Same idea as the building night bake (scripts/bake-night-textures.js): the light is baked into a
// night variant of the texture, so a lit boat at night is one setTexture and no extra objects.
// The difference is that these models have no window grids. A sea light profile is:
//   lamps - point lights: a hot core with a bloom, a pool that lights the deck/hull art around it,
//           and optionally (reflect) a rippling streak on the water below the hull - the 漁火.
//   areas - free-form lit regions (a cabin, a shop counter, a lit sign): the art under the polygon
//           is brightened and pushed toward the light colour, keeping the drawn detail.
// The whole texture is dimmed toward a cool night tint first, exactly as the building bake does.
//
// This file is the single implementation, shared by scripts/bake-typhoon-shelter-textures.js
// (node, sharp raw buffers) and sea-light-calibrator.js (browser, canvas ImageData), so the
// calibrator's preview is the baked result, not an approximation.
//
// Coordinates are fractions of the part's baked day texture (Models/typhoonShelter/ts_<id>.png);
// lamp r is a fraction of its width. A mirrored texture uses the same profile with x -> 1 - x.

const SEA_LIGHT_SCHEMA_VERSION = 1;

// Keep in step with scripts/bake-night-textures.js (DIM / DIM_TINT) so boats and buildings sit
// under the same night.
const SEA_LIGHT_DIM = 0.55;
const SEA_LIGHT_DIM_TINT = Object.freeze([0x8f, 0x99, 0xb0]);
const SEA_LIGHT_AREA_BOOST = 3.0;
const SEA_LIGHT_AREA_WARM_MIX = 0.7;
const SEA_LIGHT_POOL_GAIN = 1.4;
const SEA_LIGHT_HEAD_CORE = 0.08;   // core radius, in r
const SEA_LIGHT_HEAD_BLOOM = 0.42;  // bloom radius, in r
const SEA_LIGHT_REFLECT_LENGTH = 2.6; // streak length below the waterline, in r
const SEA_LIGHT_REFLECT_PERIOD = 0.11; // ripple band spacing, in r

const SEA_LIGHT_COLORS = Object.freeze({
  fishing: Object.freeze({ label: '漁燈 (冷白)', rgb: Object.freeze([228, 244, 255]) }),
  warm: Object.freeze({ label: '艙燈 (暖黃)', rgb: Object.freeze([255, 196, 120]) }),
  lantern: Object.freeze({ label: '燈籠 (紅)', rgb: Object.freeze([255, 74, 40]) }),
  sodium: Object.freeze({ label: '碼頭燈 (鈉黃)', rgb: Object.freeze([255, 158, 48]) }),
  white: Object.freeze({ label: '白燈', rgb: Object.freeze([255, 250, 236]) }),
  navRed: Object.freeze({ label: '航行燈 紅', rgb: Object.freeze([255, 44, 30]) }),
  navGreen: Object.freeze({ label: '航行燈 綠', rgb: Object.freeze([70, 255, 130]) }),
  neon: Object.freeze({ label: '霓虹 (金)', rgb: Object.freeze([255, 214, 90]) }),
});
const SEA_LIGHT_DEFAULT_COLOR = 'warm';

function seaLightClamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
function seaLightRound(v) { return Math.round((Number(v) || 0) * 1000) / 1000; }
function seaLightColorKey(key) { return SEA_LIGHT_COLORS[key] ? key : SEA_LIGHT_DEFAULT_COLOR; }

// Accepts anything a calibrator or JSON file may hold and returns a clean profile.
function normalizeSeaLightProfile(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const lamps = (Array.isArray(src.lamps) ? src.lamps : []).map((l) => ({
    x: seaLightRound(seaLightClamp01(l?.x)),
    y: seaLightRound(seaLightClamp01(l?.y)),
    r: seaLightRound(Math.max(0.01, Math.min(0.6, Number(l?.r) || 0.06))),
    color: seaLightColorKey(l?.color),
    reflect: l?.reflect !== false,
  }));
  const areas = (Array.isArray(src.areas) ? src.areas : []).map((a) => ({
    c: (Array.isArray(a?.c) && a.c.length >= 3 ? a.c : [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]])
      .map((pt) => [seaLightRound(seaLightClamp01(pt?.[0])), seaLightRound(seaLightClamp01(pt?.[1]))]),
    color: seaLightColorKey(a?.color),
    strength: seaLightRound(Math.max(0.1, Math.min(1, Number(a?.strength) || 0.85))),
  }));
  return { lamps, areas };
}

function isSeaLightProfileEmpty(profile) {
  return !profile || (!(profile.lamps || []).length && !(profile.areas || []).length);
}

function mirrorSeaLightProfile(profile) {
  const p = normalizeSeaLightProfile(profile);
  return {
    lamps: p.lamps.map((l) => ({ ...l, x: seaLightRound(1 - l.x) })),
    areas: p.areas.map((a) => ({ ...a, c: a.c.map((pt) => [seaLightRound(1 - pt[0]), pt[1]]) })),
  };
}

// Small deterministic hash so the twinkle frame differs per lamp but bakes identically every run.
function seaLightHash(i, salt) {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

// Coverage of a polygon at pixel centre (px, py): 1 inside, fading to 0 over `feather` px outside.
function seaLightPolygonCoverage(pts, px, py, feather) {
  let inside = false;
  let minD2 = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    const ex = xj - xi;
    const ey = yj - yi;
    const len2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((px - xi) * ex + (py - yi) * ey) / len2));
    const dx = px - (xi + t * ex);
    const dy = py - (yi + t * ey);
    const d2 = dx * dx + dy * dy;
    if (d2 < minD2) minD2 = d2;
  }
  const d = Math.sqrt(minD2);
  if (inside) return d >= feather ? 1 : 0.5 + 0.5 * (d / feather);
  return d >= feather ? 0 : 0.5 - 0.5 * (d / feather);
}

// The lowest solid pixel of column x at or below y0 - where a lamp's reflection meets the water.
function seaLightWaterline(alpha, W, H, x, y0) {
  const cx = Math.max(0, Math.min(W - 1, Math.round(x)));
  let last = -1;
  for (let y = Math.max(0, Math.round(y0)); y < H; y++) {
    if (alpha[y * W + cx] >= 128) last = y;
  }
  return last;
}

/**
 * Bake one night frame.
 * @param {Uint8Array|Uint8ClampedArray|Buffer} day straight-alpha RGBA, W*H*4
 * @param {object} profile normalised sea light profile (fractions of W/H)
 * @param {{ frame?: number, dim?: number }} [opts] frame 0/1 - the twinkle pair
 * @returns {Uint8ClampedArray} straight-alpha RGBA
 */
function renderSeaNightPixels(day, W, H, profile, opts = {}) {
  const p = normalizeSeaLightProfile(profile);
  const frame = opts.frame === 1 ? 1 : 0;
  const dim = Number.isFinite(opts.dim) ? opts.dim : SEA_LIGHT_DIM;
  const N = W * H;
  const alpha = new Uint8Array(N);
  for (let i = 0; i < N; i++) alpha[i] = day[i * 4 + 3];

  // Area mask (inside the silhouette only) and its colour per pixel.
  const areaM = new Float32Array(N);
  const areaRGB = new Float32Array(N * 3);
  p.areas.forEach((a) => {
    const pts = a.c.map((pt) => [pt[0] * W, pt[1] * H]);
    const xs = pts.map((pt) => pt[0]);
    const ys = pts.map((pt) => pt[1]);
    const feather = Math.max(1, W * 0.004);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - feather));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs) + feather));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - feather));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys) + feather));
    const rgb = SEA_LIGHT_COLORS[a.color].rgb;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (!alpha[i]) continue;
        const m = seaLightPolygonCoverage(pts, x + 0.5, y + 0.5, feather) * a.strength;
        if (m <= areaM[i]) continue;
        areaM[i] = m;
        areaRGB[i * 3] = rgb[0]; areaRGB[i * 3 + 1] = rgb[1]; areaRGB[i * 3 + 2] = rgb[2];
      }
    }
  });

  // Lamp light: `pool` brightens the art (inside the silhouette), `emit` is light in its own
  // right (heads and water reflections) and may extend past the silhouette onto the water.
  const pool = new Float32Array(N * 3);
  const emit = new Float32Array(N * 3);
  p.lamps.forEach((l, li) => {
    const rgb = SEA_LIGHT_COLORS[l.color].rgb.map((c) => c / 255);
    const flicker = frame === 0 ? 1 : 0.78 + 0.22 * seaLightHash(li, 3);
    const hx = l.x * W;
    const hy = l.y * H;
    const r = Math.max(2, l.r * W);
    const core = Math.max(0.9, r * SEA_LIGHT_HEAD_CORE);
    const bloom = Math.max(2, r * SEA_LIGHT_HEAD_BLOOM);
    const px = hx;
    const py = hy + r * 0.2;
    const x0 = Math.max(0, Math.floor(hx - r - 1));
    const x1 = Math.min(W - 1, Math.ceil(hx + r + 1));
    const y0 = Math.max(0, Math.floor(hy - r - 1));
    const y1 = Math.min(H - 1, Math.ceil(hy + r + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const ex = (x - px) / r;
        const ey = (y - py) / (r * 0.75);
        const d2 = ex * ex + ey * ey;
        if (d2 < 1 && alpha[i]) {
          const f = (1 - d2) * (1 - d2) * flicker;
          for (let c = 0; c < 3; c++) pool[i * 3 + c] = Math.max(pool[i * 3 + c], f * rgb[c]);
        }
        const dx = x - hx;
        const dy = y - hy;
        const q = dx * dx + dy * dy;
        const g = (Math.exp(-q / (core * core)) + 0.6 * Math.exp(-q / (bloom * bloom))) * flicker;
        if (g > 0.003) {
          for (let c = 0; c < 3; c++) {
            // the core runs toward white, the bloom keeps the lamp's hue
            const hot = Math.exp(-q / (core * core));
            const col = rgb[c] + (1 - rgb[c]) * hot * 0.8;
            emit[i * 3 + c] = 1 - (1 - emit[i * 3 + c]) * (1 - Math.min(1, g * col));
          }
        }
      }
    }
    if (!l.reflect) return;
    // 漁火 on the water: rippling bands below the waterline under the lamp, widening and fading.
    const wl = seaLightWaterline(alpha, W, H, hx, hy);
    if (wl < 0) return;
    const len = r * SEA_LIGHT_REFLECT_LENGTH;
    const period = Math.max(3, r * SEA_LIGHT_REFLECT_PERIOD);
    const phase = frame * Math.PI + seaLightHash(li, 11) * Math.PI * 2;
    for (let y = wl + 1; y <= Math.min(H - 1, Math.ceil(wl + len)); y++) {
      const t = (y - wl) / len;
      // uneven ripple bands over a faint continuous glow, so it reads as water, not a ladder
      const k = y - wl;
      const wobble = 0.35 * Math.sin(k * 0.21 + phase * 0.7);
      const band = 0.5 + 0.5 * Math.cos((k / period) * Math.PI * 2 * (1 + wobble * 0.3) + phase);
      const bandA = (0.22 + 0.78 * band * band) * (1 - t) ** 1.4 * 0.8 * flicker;
      if (bandA < 0.01) continue;
      const half = r * (0.16 + 0.42 * t) * (0.75 + 0.5 * band);
      const shift = Math.sin(k * 0.37 + phase) * r * 0.08 * t;
      const xa = Math.max(0, Math.floor(hx + shift - half));
      const xb = Math.min(W - 1, Math.ceil(hx + shift + half));
      for (let x = xa; x <= xb; x++) {
        const i = y * W + x;
        if (alpha[i] >= 128) continue; // only on water, never over another part of the hull
        const u = Math.abs(x - hx - shift) / half;
        const a = bandA * Math.max(0, 1 - u * u) ** 1.5;
        for (let c = 0; c < 3; c++) {
          const col = rgb[c] + (1 - rgb[c]) * 0.35;
          emit[i * 3 + c] = 1 - (1 - emit[i * 3 + c]) * (1 - a * col);
        }
      }
    }
  });

  const out = new Uint8ClampedArray(N * 4);
  const keep = 1 - dim;
  const tint0 = (SEA_LIGHT_DIM_TINT[0] / 255) * dim;
  const tint1 = (SEA_LIGHT_DIM_TINT[1] / 255) * dim;
  const tint2 = (SEA_LIGHT_DIM_TINT[2] / 255) * dim;
  const tints = [tint0, tint1, tint2];
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const e0 = emit[i * 3];
    const e1 = emit[i * 3 + 1];
    const e2 = emit[i * 3 + 2];
    const eA = e0 > e1 ? (e0 > e2 ? e0 : e2) : (e1 > e2 ? e1 : e2);
    const a = alpha[i] / 255;
    if (a === 0 && eA === 0) continue; // clear water stays clear (the common case)
    const A = a + eA * (1 - a);
    for (let c = 0; c < 3; c++) {
      let v = 0;
      if (a > 0) {
        const d = day[o + c];
        v = d * keep + d * tints[c];
        const m = areaM[i];
        if (m > 0) {
          const boosted = Math.min(255, d * SEA_LIGHT_AREA_BOOST);
          const lit = boosted * (1 - SEA_LIGHT_AREA_WARM_MIX) + areaRGB[i * 3 + c] * SEA_LIGHT_AREA_WARM_MIX;
          v = v * (1 - m) + lit * m;
        }
        const pl = pool[i * 3 + c];
        if (pl > 0) v = Math.min(255, v * (1 + SEA_LIGHT_POOL_GAIN * pl));
      }
      // Emitted light is screened over the (premultiplied) art; past the silhouette it becomes
      // semi-transparent light of its own, so a halo or a reflection sits on the water.
      const base = (v / 255) * a;
      const e = c === 0 ? e0 : c === 1 ? e1 : e2;
      const P = base + e * (1 - base);
      out[o + c] = Math.round(Math.min(1, P / A) * 255);
    }
    out[o + 3] = Math.round(A * 255);
  }
  return out;
}

const seaLightingApi = {
  SEA_LIGHT_SCHEMA_VERSION,
  SEA_LIGHT_COLORS,
  SEA_LIGHT_DEFAULT_COLOR,
  SEA_LIGHT_DIM,
  normalizeSeaLightProfile,
  isSeaLightProfileEmpty,
  mirrorSeaLightProfile,
  renderSeaNightPixels,
};

if (typeof module !== 'undefined' && module.exports) module.exports = seaLightingApi;
if (typeof globalThis !== 'undefined') Object.assign(globalThis, seaLightingApi);
