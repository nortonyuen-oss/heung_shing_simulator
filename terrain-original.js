// 原創地形: procedural terrain shaped like Hong Kong's (docs/terrain-generator-v2-design.md).
// A landform sets where land and sea broadly lie; warped ridged noise raises the ridges;
// droplet erosion cuts the valleys and fills their floors; the sea is cut at the real water
// share for the landform; and land heights are rank-matched to the real Hong Kong height
// distribution, so a hillside map has as much steep ground as a real hillside window and the
// flat land falls where erosion left it - along the coast and in the valley floors. Pure: it
// never touches the live city.

// Measured from the 香港實景 windows of each landform (terrain-presets.js): the water share
// (10th, 50th, 90th percentile, in %) and how land splits across height levels 0-8.
const ORIGINAL_TERRAIN_TARGETS = Object.freeze({
  'hk-harbour': { water: [28, 41, 56], levels: [0.31, 0.171, 0.151, 0.137, 0.121, 0.069, 0.03, 0.008, 0.002] },
  'hk-peninsula': { water: [51, 66, 74], levels: [0.338, 0.207, 0.182, 0.138, 0.089, 0.034, 0.012, 0.001, 0] },
  'hk-islands': { water: [61, 73, 79], levels: [0.329, 0.228, 0.201, 0.134, 0.077, 0.025, 0.006, 0, 0] },
  'hk-valley': { water: [0, 4, 26], levels: [0.336, 0.132, 0.116, 0.12, 0.133, 0.099, 0.049, 0.013, 0.002] },
  'hk-hillside': { water: [0, 5, 22], levels: [0.138, 0.108, 0.119, 0.138, 0.176, 0.159, 0.099, 0.045, 0.019] },
  'hk-plain': { water: [0, 1, 22], levels: [0.609, 0.114, 0.077, 0.07, 0.066, 0.042, 0.018, 0.004, 0] },
});
const ORIGINAL_TERRAIN_LANDFORMS = Object.freeze(['hk-any', ...Object.keys(ORIGINAL_TERRAIN_TARGETS)]);

const ORIGINAL_TERRAIN_EROSION = Object.freeze({
  droplets: 24000,
  maxSteps: 32,
  radius: 2,
  inertia: 0.05,
  capacity: 4,
  minSlope: 0.01,
  erode: 0.3,
  deposit: 0.3,
  evaporate: 0.015,
  gravity: 4,
});

// Seeded 2D gradient noise in [-1, 1].
function createOriginalTerrainNoise(random) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = [1, -1, 1, -1, 1.414, -1.414, 0, 0];
  const gy = [1, 1, -1, -1, 0, 0, 1.414, -1.414];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const dot = (h, dx, dy) => gx[h & 7] * dx + gy[h & 7] * dy;
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const u = fade(xf);
    const v = fade(yf);
    const x1 = dot(aa, xf, yf) + u * (dot(ba, xf - 1, yf) - dot(aa, xf, yf));
    const x2 = dot(ab, xf, yf - 1) + u * (dot(bb, xf - 1, yf - 1) - dot(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) / 1.414;
  };
}

function originalTerrainFbm(noise, x, y, octaves) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * frequency + i * 17.3, y * frequency - i * 11.7) * amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return sum;
}

// Ridged multifractal: sharp crests that branch, each octave weighted by the one before so
// the detail gathers on the ridges and the valleys stay smooth.
function originalTerrainRidged(noise, x, y, octaves) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise(x * frequency + i * 31.1, y * frequency + i * 7.9));
    n *= n * weight;
    weight = Math.min(1, Math.max(0, n * 2));
    sum += n * amplitude;
    frequency *= 2.1;
    amplitude *= 0.5;
  }
  return sum;
}

// Where land and sea broadly lie, 0..1 (higher is land), for a landform. u, v in 0..1.
function createOriginalLandformShape(landform, random, noise) {
  const angle = random() * Math.PI * 2;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  // d: how far towards the seaward side (about -0.7..0.7); s: across it.
  const along = (u, v) => (u - 0.5) * ca + (v - 0.5) * sa;
  const across = (u, v) => -(u - 0.5) * sa + (v - 0.5) * ca;
  const wobble = (t, k) => originalTerrainFbm(noise, t * 2.3 + k, k * 1.7, 3) * 0.22;
  const gauss = (x, w) => Math.exp(-(x / w) * (x / w));

  if (landform === 'hk-harbour') {
    // Land around a sea inlet that comes in from one side and bends.
    const width = 0.1 + random() * 0.08;
    const reach = 0.15 + random() * 0.35;
    return (u, v) => {
      const d = along(u, v);
      const s = across(u, v) - wobble(d, 5);
      const widening = width * (1 + 2.2 * Math.max(0, d + 0.1));
      const inlet = gauss(s, widening) * Math.min(1, Math.max(0, (d + reach) / 0.25));
      const coves = originalTerrainFbm(noise, u * 2.4 + 31, v * 2.4 - 17, 3) * 0.3;
      return 0.6 - 0.42 * inlet - 0.45 * Math.max(0, d - 0.2) + coves;
    };
  }
  if (landform === 'hk-peninsula') {
    // A tongue of land from one side into the sea.
    const width = 0.16 + random() * 0.1;
    const length = 0.55 + random() * 0.35;
    return (u, v) => {
      const d = along(u, v);
      const s = across(u, v) - wobble(d, 9);
      const tongue = gauss(s, width) * Math.min(1, Math.max(0, (length - (d + 0.6)) / 0.3));
      const mainland = Math.max(0, -d - 0.35) * 1.5;
      return 0.2 + 0.55 * tongue + mainland;
    };
  }
  if (landform === 'hk-islands') {
    const islands = Array.from({ length: 3 + Math.floor(random() * 4) }, () => {
      const turn = random() * Math.PI;
      return {
        u: 0.12 + random() * 0.76,
        v: 0.12 + random() * 0.76,
        r: 0.07 + random() * 0.12,
        stretch: 1 + random() * 1.6,
        cos: Math.cos(turn),
        sin: Math.sin(turn),
      };
    });
    return (u, v) => 0.2 + islands.reduce((sum, island) => {
      const du = u - island.u;
      const dv = v - island.v;
      const a = (du * island.cos + dv * island.sin) / island.stretch;
      const b = -du * island.sin + dv * island.cos;
      return Math.max(sum, 0.6 * Math.exp(-Math.pow(Math.hypot(a, b) / island.r, 1.6)));
    }, 0);
  }
  if (landform === 'hk-valley') {
    // A broad valley floor across the map between hills, sometimes opening to the sea.
    const width = 0.13 + random() * 0.09;
    return (u, v) => {
      const d = along(u, v);
      const s = across(u, v) - wobble(d, 13);
      const floor = gauss(s, width);
      return 0.72 - 0.3 * floor - 0.55 * Math.max(0, d - 0.28);
    };
  }
  if (landform === 'hk-hillside') {
    // Ground rising away from one side.
    return (u, v) => 0.62 - 0.5 * along(u, v);
  }
  // hk-plain: a wide low plain with hills along one side.
  return (u, v) => 0.4 + 0.6 * Math.max(0, -along(u, v) - 0.2);
}

// Droplet hydraulic erosion on a Float32Array height field (heights roughly 0..1).
function erodeOriginalTerrain(heights, size, random, params = ORIGINAL_TERRAIN_EROSION) {
  const offsets = [];
  const weights = [];
  let weightSum = 0;
  for (let dy = -params.radius; dy <= params.radius; dy++) {
    for (let dx = -params.radius; dx <= params.radius; dx++) {
      const distance = Math.hypot(dx, dy);
      if (distance > params.radius) continue;
      const weight = 1 - distance / params.radius;
      offsets.push([dx, dy]);
      weights.push(weight);
      weightSum += weight;
    }
  }
  for (let i = 0; i < weights.length; i++) weights[i] /= weightSum;

  const limit = size - 2;
  for (let n = 0; n < params.droplets; n++) {
    let x = 1 + random() * (limit - 1);
    let y = 1 + random() * (limit - 1);
    let dirX = 0;
    let dirY = 0;
    let speed = 1;
    let water = 1;
    let sediment = 0;
    for (let step = 0; step < params.maxSteps; step++) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const fx = x - xi;
      const fy = y - yi;
      const i = yi * size + xi;
      const h00 = heights[i];
      const h10 = heights[i + 1];
      const h01 = heights[i + size];
      const h11 = heights[i + size + 1];
      const height = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
      const gradX = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
      const gradY = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      dirX = dirX * params.inertia - gradX * (1 - params.inertia);
      dirY = dirY * params.inertia - gradY * (1 - params.inertia);
      const length = Math.hypot(dirX, dirY);
      if (length === 0) break;
      dirX /= length;
      dirY /= length;
      x += dirX;
      y += dirY;
      if (x < 1 || y < 1 || x >= limit || y >= limit) break;

      const nxi = Math.floor(x);
      const nyi = Math.floor(y);
      const nfx = x - nxi;
      const nfy = y - nyi;
      const n = nyi * size + nxi;
      const newHeight = heights[n] * (1 - nfx) * (1 - nfy) + heights[n + 1] * nfx * (1 - nfy)
        + heights[n + size] * (1 - nfx) * nfy + heights[n + size + 1] * nfx * nfy;
      const deltaHeight = newHeight - height;
      const capacity = Math.max(-deltaHeight, params.minSlope) * speed * water * params.capacity;
      if (sediment > capacity || deltaHeight > 0) {
        // Deposit on the four corners of the cell left: fills pits and valley floors.
        const amount = deltaHeight > 0 ? Math.min(deltaHeight, sediment) : (sediment - capacity) * params.deposit;
        sediment -= amount;
        heights[i] += amount * (1 - fx) * (1 - fy);
        heights[i + 1] += amount * fx * (1 - fy);
        heights[i + size] += amount * (1 - fx) * fy;
        heights[i + size + 1] += amount * fx * fy;
      } else {
        const amount = Math.min((capacity - sediment) * params.erode, -deltaHeight);
        for (let k = 0; k < offsets.length; k++) {
          const ex = xi + offsets[k][0];
          const ey = yi + offsets[k][1];
          if (ex < 0 || ey < 0 || ex >= size || ey >= size) continue;
          const j = ey * size + ex;
          const take = Math.min(heights[j], amount * weights[k]);
          heights[j] -= take;
          sediment += take;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed + deltaHeight * params.gravity));
      water *= 1 - params.evaporate;
    }
  }
}

function generateOriginalTerrain(landform, seed) {
  const random = createRandom(`${seed}:original-terrain:${landform}`);
  const chosen = landform === 'hk-any' || !ORIGINAL_TERRAIN_TARGETS[landform]
    ? Object.keys(ORIGINAL_TERRAIN_TARGETS)[Math.floor(random() * Object.keys(ORIGINAL_TERRAIN_TARGETS).length)]
    : landform;
  const target = ORIGINAL_TERRAIN_TARGETS[chosen];
  const noise = createOriginalTerrainNoise(random);
  const shape = createOriginalLandformShape(chosen, random, noise);
  const size = MAP_WIDTH;
  const heights = new Float32Array(size * size);
  const offsetX = random() * 100;
  const offsetY = random() * 100;
  // Ridges about 1-1.5 km apart on a 5 km map; a warp bends them so they wander.
  const ridgeScale = 3.2 + random() * 1.2;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const u = col / (size - 1);
      const v = row / (size - 1);
      const wx = originalTerrainFbm(noise, u * 2 + offsetX, v * 2 + offsetY, 3) * 0.35;
      const wy = originalTerrainFbm(noise, u * 2 + offsetX + 40, v * 2 + offsetY - 40, 3) * 0.35;
      const ridges = originalTerrainRidged(noise, (u + wx) * ridgeScale + offsetX, (v + wy) * ridgeScale + offsetY, 5);
      // Bays and headlands at several scales: what makes a coast read as real
      const detail = originalTerrainFbm(noise, u * 6 + offsetY, v * 6 + offsetX, 5);
      const base = shape(u + wx * 0.6, v + wy * 0.6);
      heights[row * size + col] = base * 0.75 + ridges * 0.45 * Math.max(0.25, base) + detail * 0.1;
    }
  }
  erodeOriginalTerrain(heights, size, random);

  // Sea: cut at a water share drawn from the landform's real range, keeping only water that
  // reaches the map edge (the sea); hollows inland become low ground.
  // Drawn between the 10th and 90th percentile, skewed so its median is the real median:
  // a plain is nearly always dry, a harbour anywhere in its range.
  const [low, median, high] = target.water;
  const medianAt = high > low ? Math.min(0.95, Math.max(0.05, (median - low) / (high - low))) : 0.5;
  const skew = Math.log(medianAt) / Math.log(0.5);
  const waterShare = (low + Math.pow(random(), skew) * (high - low)) / 100;
  const sorted = Float32Array.from(heights).sort();
  const seaLevel = waterShare > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(waterShare * sorted.length))] : -Infinity;
  const sea = new Uint8Array(size * size);
  const queue = [];
  for (let i = 0; i < size; i++) {
    [i, (size - 1) * size + i, i * size, i * size + size - 1].forEach((index) => {
      if (!sea[index] && heights[index] < seaLevel) {
        sea[index] = 1;
        queue.push(index);
      }
    });
  }
  while (queue.length) {
    const index = queue.pop();
    const row = Math.floor(index / size);
    const col = index % size;
    [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].forEach(([r, c]) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      const j = r * size + c;
      if (!sea[j] && heights[j] < seaLevel) {
        sea[j] = 1;
        queue.push(j);
      }
    });
  }

  // Land heights: rank-matched to the real distribution, lowest land first.
  const land = [];
  for (let i = 0; i < heights.length; i++) if (!sea[i]) land.push(i);
  land.sort((a, b) => heights[a] - heights[b]);
  const levels = new Uint8Array(size * size);
  let cumulative = 0;
  let level = 0;
  let nextBreak = target.levels[0];
  land.forEach((index, rank) => {
    const share = (rank + 0.5) / land.length;
    while (share > nextBreak && level < target.levels.length - 1) {
      level++;
      cumulative = nextBreak;
      nextBreak = cumulative + target.levels[level];
    }
    levels[index] = level;
  });

  // Beaches: gently sloping level-0 shore, in stretches.
  const mapRows = createFilledMap(WATER);
  const heightRows = createFilledMap(0);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = row * size + col;
      if (sea[i]) continue;
      const lv = levels[i];
      const shore = (row > 0 && sea[i - size]) || (row < size - 1 && sea[i + size])
        || (col > 0 && sea[i - 1]) || (col < size - 1 && sea[i + 1]);
      const gentle = lv === 0 && shore && originalTerrainFbm(noise, col * 0.06 + 70, row * 0.06 - 70, 2) > 0.05;
      if (gentle) {
        mapRows[row][col] = BEACH;
        continue;
      }
      mapRows[row][col] = lv > 0 ? HILL : GROUND;
      heightRows[row][col] = lv;
    }
  }
  finishHkTerrain(mapRows, heightRows);

  return {
    version: 1,
    generatorVersion: 4,
    profileType: landform,
    seed,
    features: ['original-terrain', `original:${chosen}`],
    mapData: mapRows,
    heightMap: heightRows,
  };
}
