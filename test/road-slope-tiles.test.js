const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const TILE_DIR = path.join(ROOT, 'newRoadTiles');
const RISE = 13; // HEIGHT_STEP_PIXELS

// Ground diamond of a 160x80 tile: centre (80,40), half extents 50x25. Screen position of the
// slope-plane point (c, r) that is `rise` px above the ground.
const screenOf = (c, r, rise) => ({ x: 80 + (c - r) * 50, y: 40 + (c + r) * 25 - rise });

const SLOPES = [
  // high edge, straight tile whose profile the slope must continue, road axis, rise as f(c, r)
  { file: 'roadHillN_fixed.png', straight: 'roadNS_fixed.png', axis: 'c', rise: (c) => RISE * (c + 0.5) },
  { file: 'roadHillE_fixed.png', straight: 'roadEW_fixed.png', axis: 'r', rise: (c, r) => RISE * (r + 0.5) },
  { file: 'roadHillS_fixed.png', straight: 'roadNS_fixed.png', axis: 'c', rise: (c) => RISE * (0.5 - c) },
  { file: 'roadHillW_fixed.png', straight: 'roadEW_fixed.png', axis: 'r', rise: (c, r) => RISE * (0.5 - r) },
];

async function loadRaw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function pixelAt(img, x, y) {
  const px = Math.min(img.width - 1, Math.max(0, Math.round(x - 0.5)));
  const py = Math.min(img.height - 1, Math.max(0, Math.round(y - 0.5)));
  const o = (py * img.width + px) * 4;
  return Array.from(img.data.subarray(o, o + 4));
}

const colourDistance = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

// A slope tile drawn 13 px lower than its uphill neighbour must show, along the shared edge, the
// same road profile the straight tile shows: kerbs, yellow lines and asphalt in the same place.
// The shipped art rose ~15 px per tile, which put a jog at every seam of a climbing road.
test('each hill slope tile continues the straight tile profile at both its low and its high edge', async () => {
  for (const spec of SLOPES) {
    const slope = await loadRaw(path.join(TILE_DIR, spec.file));
    const straight = await loadRaw(path.join(TILE_DIR, spec.straight));
    for (const along of [-0.46, 0.46]) {
      let mismatches = 0;
      let samples = 0;
      for (let across = -0.44; across <= 0.44; across += 0.02) {
        const c = spec.axis === 'c' ? along : across;
        const r = spec.axis === 'c' ? across : along;
        const { x, y } = screenOf(c, r, spec.rise(c, r));
        const actual = pixelAt(slope, x, y);
        assert.equal(actual[3], 255, `${spec.file}: surface opaque at (${x.toFixed(1)}, ${y.toFixed(1)})`);
        // Sub-pixel resampling of a 1 px line can move it by a pixel: accept a match one pixel
        // either side across the road.
        const neighbours = [-0.02, 0, 0.02].map((d) => {
          const nc = spec.axis === 'c' ? c : c + d;
          const nr = spec.axis === 'c' ? r + d : r;
          return pixelAt(straight, screenOf(nc, nr, 0).x, screenOf(nc, nr, 0).y);
        });
        if (Math.min(...neighbours.map((n) => colourDistance(n, actual))) > 40) mismatches++;
        samples++;
      }
      assert.ok(mismatches <= samples * 0.1,
        `${spec.file} at along=${along}: ${mismatches}/${samples} samples differ from ${spec.straight}`);
    }
  }
});

test('hill slope tiles stay inside their 13 px prism (nothing above the raised edge)', async () => {
  for (const spec of SLOPES) {
    const slope = await loadRaw(path.join(TILE_DIR, spec.file));
    for (let y = 0; y < slope.height; y++) {
      for (let x = 0; x < slope.width; x++) {
        if (slope.data[(y * slope.width + x) * 4 + 3] < 32) continue;
        // Ground diamond top edge at this x, lifted by the full rise: nothing may be above it
        // except the 1 px overrun the builder gives the surface along the road (and its AA).
        const topY = 15 + Math.abs(x + 0.5 - 80) / 2 - RISE - 1.75;
        assert.ok(y + 0.5 >= topY, `${spec.file}: opaque pixel at (${x}, ${y}) is above the raised diamond`);
      }
    }
  }
});

test('the committed slope tiles are what scripts/build-road-slope-tiles.js produces', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'road-slope-tiles-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-road-slope-tiles.js'), '--out', outDir], { stdio: 'pipe' });
    for (const spec of SLOPES) {
      const built = await loadRaw(path.join(outDir, spec.file));
      const shipped = await loadRaw(path.join(TILE_DIR, spec.file));
      assert.ok(built.data.equals(shipped.data), `${spec.file} differs from the script output; re-run the script`);
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
