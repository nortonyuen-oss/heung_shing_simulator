// Water effects, each with its own View-menu switch:
//   船尾浪花 - the foam a moving boat leaves behind it (shelter boats, Star Ferries, container ships)
//   岸邊燈光倒影 - after dark, lit waterfront buildings throw rippling streaks of light onto the water
//
// Both are kept as cheap as the sea gets: one generated texture each (three frames, drawn once),
// one plain image per moving vessel or per lit waterfront edge, under the world mask the terrain
// and ships use (an unmasked sprite between them costs three draw calls - maskTyphoonShelterSprite),
// and every one of them at a single depth so they batch together:
//   - wakes on top of the terrain band: over the water tiles, under bridges and roads, and under
//     the ground night pass, so the foam darkens with the sea after dark;
//   - reflections just above the ground night passes (they are light) and below every object, in
//     additive blend - one more draw call for all of them.

const VESSEL_WAKES_SETTING_KEY = 'citybuilder.vesselWakes.v1';
const SHORE_REFLECTIONS_SETTING_KEY = 'citybuilder.shoreReflections.v1';

const WATER_EFFECT_FRAMES = 3;
const VESSEL_WAKE_TEXTURE_KEY = '__vessel_wake';
const SHORE_REFLECTION_TEXTURE_KEY = '__shore_reflection';
const METRES_PER_TILE = 20;

const VESSEL_WAKE = Object.freeze({
  // texture: in units of the vessel's length, stern at u = 0, the wake behind it to u = -tail
  tail: 2.4,
  halfAngle: 0.36,       // the Kelvin arms' spread (tan of ~20 degrees)
  pxPerUnit: 1.6,        // texture pixels per screen pixel of one tile, so it holds up at zoom 1.6
  minScale: 0.3,         // in tiles: a sampan's wake is still seen
  maxScale: 2.4,         // a container ship's is not twenty tiles long
  fadeMs: 700,           // in as a boat gets under way, out as it stops: steady in between
  stallMs: 600,
  sidewaysMs: 300,       // moving sideways to the hull for this long (a ferry off its berth) ends the wake          // a vessel not seen to move for this long has stopped (positions step a few frames apart)
  forgetMs: 3000,        // a vessel not drawn for this long (gone, culled) loses its wake sprite
  teleportTiles: 3,      // a jump this long in one frame (a new trip, a map edit) is not sailing
});

const SHORE_REFLECTION = Object.freeze({
  tickMs: 220,
  rebuildMs: 8000,       // the waterfront is re-read this often at night, and when it changes
  reachTiles: 3,         // a building this many tiles back from the water still reflects (a road, a promenade)
  minHeightPx: 98,       // about one and a half tile images: single-storey lots do not
  lengthOfHeight: 0.5,   // streak length as a share of the building's drawn height
  maxRunTiles: 6,
  alpha: 0.55,
  fadeIn: 0.25,          // night strength ramps over this much of the night curve past the night-art swap
  variantAlpha: Object.freeze({ half: 0.6, deep: 0.4, lamps: 0.18 }),
  colours: Object.freeze([
    [0.62, 0xffcf8a],    // warm windows
    [0.26, 0xdde8ff],    // cool white offices
    [0.06, 0xffe08a],    // gold signs
    [0.06, 0xff9a7a],    // red-pink neon
  ]),
});

// ── Settings ────────────────────────────────────────────────────────────────

const waterEffectSettingCache = new Map();

function readWaterEffectSetting(key) {
  if (waterEffectSettingCache.has(key)) return waterEffectSettingCache.get(key);
  let value = true;
  try {
    const raw = localStorage.getItem(key);
    value = raw === null ? true : JSON.parse(raw) !== false;
  } catch {}
  waterEffectSettingCache.set(key, value);
  return value;
}

function writeWaterEffectSetting(key, enabled) {
  waterEffectSettingCache.set(key, !!enabled);
  try { localStorage.setItem(key, JSON.stringify(!!enabled)); } catch {}
}

function isVesselWakesEnabled() { return readWaterEffectSetting(VESSEL_WAKES_SETTING_KEY); }
function isShoreReflectionsEnabled() { return readWaterEffectSetting(SHORE_REFLECTIONS_SETTING_KEY); }

function setVesselWakesEnabled(enabled) {
  writeWaterEffectSetting(VESSEL_WAKES_SETTING_KEY, enabled);
  const scene = typeof activeScene !== 'undefined' ? activeScene : null;
  if (!enabled && scene) clearVesselWakes(scene);
}

function setShoreReflectionsEnabled(enabled) {
  writeWaterEffectSetting(SHORE_REFLECTIONS_SETTING_KEY, enabled);
  const scene = typeof activeScene !== 'undefined' ? activeScene : null;
  if (!enabled && scene) clearShoreReflections(scene);
}

// ── Shared ──────────────────────────────────────────────────────────────────

function waterEffectRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function waterEffectHash(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The water surface under logical (col, row), where the boats float (getVesselWaterSurfacePoint).
function getWaterEffectSurfacePoint(scene, col, row) {
  const p = isoToScreen(col, row);
  return { x: p.x + scene.offsetX, y: p.y + scene.offsetY - BUILDING_SURFACE_Y_OFFSET - TILE_HEIGHT / 2 };
}

// A canvas of `frames` cells side by side, made a texture only once drawn (a canvas texture
// refreshed after creation keeps empty mipmaps and vanishes zoomed out), each cell a frame.
function addWaterEffectFrames(scene, key, cellW, cellH, draw) {
  if (scene.textures.exists(key)) return scene.textures.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = cellW * WATER_EFFECT_FRAMES;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d');
  for (let f = 0; f < WATER_EFFECT_FRAMES; f++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(f * cellW, 0, cellW, cellH);
    ctx.clip();
    ctx.translate(f * cellW, 0);
    draw(ctx, f);
    ctx.restore();
  }
  const texture = scene.textures.addCanvas(key, canvas);
  for (let f = 0; f < WATER_EFFECT_FRAMES; f++) texture.add(f, 0, f * cellW, 0, cellW, cellH);
  return texture;
}

// ── 船尾浪花: wakes ──────────────────────────────────────────────────────────

// The wake of a boat one tile long sailing toward screen bottom-right (+col at rotation 0), drawn
// straight onto the iso water plane: u along the heading, v across it, so a round dot of foam is an
// ellipse lying on the sea. Other headings are this one flipped (the projection is symmetric).
// Origin: the stern.
function getVesselWakeGeometry() {
  const k = VESSEL_WAKE.pxPerUnit;
  const ax = (TILE_WIDTH / 2) * k;
  const ay = (TILE_HEIGHT / 2) * k;
  const uMin = -VESSEL_WAKE.tail - 0.15;
  const uMax = 0.25;
  const vMax = 0.15 + VESSEL_WAKE.tail * VESSEL_WAKE.halfAngle + 0.15;
  // screen of (u, v): ((u - v) * ax, (u + v) * ay)
  const xs = [uMin - vMax, uMin + vMax, uMax - vMax, uMax + vMax].map((d) => d * ax);
  const ys = [uMin - vMax, uMin + vMax, uMax - vMax, uMax + vMax].map((d) => d * ay);
  const minX = Math.floor(Math.min(...xs));
  const minY = Math.floor(Math.min(...ys));
  const width = Math.ceil(Math.max(...xs)) - minX;
  const height = Math.ceil(Math.max(...ys)) - minY;
  return { ax, ay, originX: -minX, originY: -minY, width, height };
}

function ensureVesselWakeTexture(scene) {
  if (scene.textures.exists(VESSEL_WAKE_TEXTURE_KEY)) return true;
  if (typeof document === 'undefined') return false;
  const g = getVesselWakeGeometry();
  addWaterEffectFrames(scene, VESSEL_WAKE_TEXTURE_KEY, g.width, g.height, (ctx, frame) => {
    const rand = waterEffectRandom(0x5eaf0a); // the same foam in every frame: only the crests travel
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(g.originX, g.originY);
    ctx.transform(g.ax, g.ay, -g.ax, g.ay, 0, 0); // (u, v) -> screen
    const dot = (u, v, r, a) => {
      if (!(a > 0.004) || !(r > 0) || !Number.isFinite(u) || !Number.isFinite(v)) return;
      a = Math.min(1, a);
      const grad = ctx.createRadialGradient(u, v, 0, u, v, r);
      grad.addColorStop(0, `rgba(240, 250, 255, ${a})`);
      grad.addColorStop(0.55, `rgba(225, 242, 250, ${a * 0.45})`);
      grad.addColorStop(1, 'rgba(220, 240, 250, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(u, v, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const tail = VESSEL_WAKE.tail;
    // the churned water straight behind the stern: wide, bright, short-lived
    for (let i = 0; i < 150; i++) {
      const t = Math.pow(rand(), 1.6);              // bunched at the stern
      const u = -t * tail * 0.75;
      const spread = 0.06 + t * 0.22;
      const v = (rand() - 0.5) * 2 * spread;
      dot(u, v, 0.04 + t * 0.07 + rand() * 0.03, 0.38 * Math.pow(1 - t, 1.8) * (0.6 + rand() * 0.4));
    }
    // the two Kelvin arms, broken into crests
    for (const side of [-1, 1]) {
      for (let i = 0; i < 130; i++) {
        const t = Math.min(0.995, i / 130 + rand() * 0.008);
        const u = -t * tail;
        const crest = 0.6 + 0.4 * Math.sin(t * 34 - frame * (Math.PI * 2 / WATER_EFFECT_FRAMES) + side);
        const v = side * (0.1 + t * tail * VESSEL_WAKE.halfAngle) + (rand() - 0.5) * 0.04;
        dot(u, v, 0.03 + t * 0.04, 0.7 * Math.pow(1 - t, 1.1) * crest);
      }
    }
    // foam along the quarters, where the hull leaves the water
    for (let i = 0; i < 24; i++) {
      const side = i % 2 ? 1 : -1;
      dot(0.12 - rand() * 0.2, side * (0.1 + rand() * 0.04), 0.04, 0.35 * rand());
    }
  });
  return true;
}

function getVesselWakeStore(scene) {
  if (!scene.vesselWakes) scene.vesselWakes = new Map();
  return scene.vesselWakes;
}

// Called by each vessel as it is drawn (drawTyphoonShelterBoat, setVesselVisual): `owner` is the
// vessel's own record, (col, row) its centre on the map, lengthTiles its length. The wake trails
// along the map axis the hull is drawn on - `axis` ('r' or 'c', from the heading its art was
// picked by; without it, the larger of the two steps, as typhoonShelterPointAlong picks it) - so a
// boat on a slanting leg still trails straight off its stern, and the way it actually moves along
// that axis: a Star Ferry backing out trails the other way. Moving sideways (a ferry pulling off
// its berth) raises no wake.
function trackVesselWake(scene, owner, col, row, lengthTiles, visible = true, axis = null) {
  if (!scene || !owner || !isVesselWakesEnabled() || !Number.isFinite(col) || !Number.isFinite(row)) return;
  const store = getVesselWakeStore(scene);
  const now = scene.time?.now || 0;
  let wake = store.get(owner);
  if (!wake) {
    wake = { sprite: null, col, row, at: now, alpha: 0, target: 0, du: 0, dv: 0, seenAt: now };
    store.set(owner, wake);
  }
  const dt = Math.max(0, now - wake.at);
  const dc = col - wake.col;
  const dr = row - wake.row;
  const dist = Math.hypot(dc, dr);
  const paused = typeof isGamePaused === 'function' && isGamePaused();
  if (dist > VESSEL_WAKE.teleportTiles) {
    wake.alpha = 0;
    wake.target = 0;
    wake.movedAt = now;
  } else if (dist > 1e-5) {
    const onRows = axis ? axis === 'r' : Math.abs(dr) >= Math.abs(dc);
    const along = onRows ? dr : dc;
    wake.movedAt = now;
    if (Math.abs(along) < dist * 0.5) {
      // sideways to its hull: a ferry pulling off its berth raises no wake - but a turn at a corner
      // of its route is one frame of it, and dimming the wake for that read as flicker
      wake.sidewaysSince ??= now;
      if (now - wake.sidewaysSince > VESSEL_WAKE.sidewaysMs) wake.target = 0;
    } else {
      wake.sidewaysSince = null;
      wake.du = onRows ? 0 : Math.sign(along);
      wake.dv = onRows ? Math.sign(along) : 0;
      // under way: a steady wake (scaling it by the speed of each step made it pulse - the clock
      // moves the boats in uneven steps a few frames apart)
      wake.target = 1;
    }
  } else if (!paused && now - (wake.movedAt ?? now) > VESSEL_WAKE.stallMs) {
    wake.target = 0;
  }
  if (!paused) wake.alpha += (wake.target - wake.alpha) * Math.min(1, dt / VESSEL_WAKE.fadeMs);
  wake.col = col;
  wake.row = row;
  wake.at = now;
  wake.seenAt = now;
  wake.length = Math.max(0.1, Number(lengthTiles) || 1);
  wake.visible = visible;
}

function placeVesselWake(scene, wake) {
  const show = wake.visible && wake.alpha > 0.02 && (wake.du || wake.dv);
  if (!show) {
    if (wake.sprite?.visible) wake.sprite.setVisible(false);
    return;
  }
  if (wake.sprite && !wake.sprite.scene) wake.sprite = null; // destroyed with the world (a load)
  if (!wake.sprite) {
    if (!ensureVesselWakeTexture(scene)) return;
    const g = getVesselWakeGeometry();
    const sprite = scene.add.image(0, 0, VESSEL_WAKE_TEXTURE_KEY, 0);
    sprite.setOrigin(g.originX / g.width, g.originY / g.height);
    sprite.setDepth(getWorldDepth('road') - 1);
    if (scene.worldMask) sprite.setMask(scene.worldMask);
    wake.sprite = sprite;
  }
  const sprite = wake.sprite;
  // the stern, half a length back along the way it is going
  const sternCol = wake.col - wake.du * wake.length / 2;
  const sternRow = wake.row - wake.dv * wake.length / 2;
  const at = getWaterEffectSurfacePoint(scene, sternCol, sternRow);
  const ahead = getWaterEffectSurfacePoint(scene, sternCol + wake.du, sternRow + wake.dv);
  const mx = ahead.x - at.x;
  const my = ahead.y - at.y;
  const sx = mx < 0 ? -1 : 1;
  const sy = my < 0 ? -1 : 1;
  const scale = Math.max(VESSEL_WAKE.minScale, Math.min(VESSEL_WAKE.maxScale, wake.length)) / VESSEL_WAKE.pxPerUnit;
  sprite.setPosition(at.x, at.y);
  // the other headings are this art mirrored about the stern: by a negative scale, which turns
  // about the origin - Phaser's flipX/flipY mirror the frame within its own box instead, which put
  // every wake but the bottom-right one's off its boat
  sprite.setScale(scale * sx, scale * sy);
  sprite.setAlpha(Math.min(1, wake.alpha));
  sprite.setVisible(true);
}

// Once a frame, after every vessel has been drawn: place the wakes and drop the ones whose vessel
// has gone.
function updateVesselWakes(scene, time) {
  const store = scene?.vesselWakes;
  if (!store?.size) return;
  if (!isVesselWakesEnabled()) {
    clearVesselWakes(scene);
    return;
  }
  const now = scene.time?.now || time || 0;
  for (const [owner, wake] of store) {
    if (now - wake.seenAt > VESSEL_WAKE.forgetMs) {
      wake.sprite?.destroy();
      store.delete(owner);
      continue;
    }
    if (wake.seenAt !== now) wake.visible = false; // not drawn this frame: culled or hidden
    // one still frame: cycling the foam's frames read as flicker, not as water
    placeVesselWake(scene, wake);
  }
}

function clearVesselWakes(scene) {
  scene?.vesselWakes?.forEach((wake) => wake.sprite?.destroy());
  scene?.vesselWakes?.clear();
}

// ── 岸邊燈光倒影: reflections ────────────────────────────────────────────────

// A streak of reflected window light: a few soft columns of light, broken by the ripples into
// wavering dashes, brightest at the waterline and fading down, over a faint glow. Drawn pixel by
// pixel so every edge is soft (an additive streak with a hard side reads as a pane of glass).
// White - each streak is tinted its building's light.
const SHORE_REFLECTION_CELL = Object.freeze({ width: 48, height: 128 });

function drawShoreReflectionPixels(data, W, H, frame) {
  const rand = waterEffectRandom(0x7e11ec + frame * 104729);
  const count = 4 + Math.floor(rand() * 2);
  const columns = Array.from({ length: count }, (_, i) => ({
    x: W * (0.2 + 0.6 * (i + 0.2 + rand() * 0.6) / count),
    width: 0.9 + rand() * 1.3,
    gain: 0.55 + rand() * 0.45,
    phase: rand() * 10,
  }));
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const fall = Math.pow(1 - t, 1.3) * Math.min(1, (y + 1) / 3);
    const sway = (1 + t * 3.5);
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W * 0.3);
      let v = 0.1 * Math.exp(-dx * dx); // the glow
      for (const c of columns) {
        const cx = c.x + Math.sin(y * 0.23 + frame * 2.1 + c.phase) * sway;
        const d = (x - cx) / (c.width * (1 + t * 1.6));
        // ripples: the column breaks into dashes, more so further down
        const ripple = 0.5 + 0.5 * Math.sin(y * (0.9 - t * 0.35) + c.phase * 3 + frame * 1.7);
        const broken = ripple > 0.25 + t * 0.45 ? 1 : 0.15;
        v += c.gain * Math.exp(-d * d) * broken;
      }
      const a = Math.max(0, Math.min(1, v * fall));
      const i = (y * W + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
}

function ensureShoreReflectionTexture(scene) {
  if (scene.textures.exists(SHORE_REFLECTION_TEXTURE_KEY)) return true;
  if (typeof document === 'undefined') return false;
  const { width: W, height: H } = SHORE_REFLECTION_CELL;
  addWaterEffectFrames(scene, SHORE_REFLECTION_TEXTURE_KEY, W, H, (ctx, frame) => {
    const image = ctx.createImageData(W, H);
    drawShoreReflectionPixels(image.data, W, H, frame);
    ctx.putImageData(image, frame * W, 0); // putImageData ignores the transform
  });
  return true;
}

function pickShoreReflectionColour(seed) {
  let roll = waterEffectHash(seed);
  for (const [share, colour] of SHORE_REFLECTION.colours) {
    if (roll < share) return colour;
    roll -= share;
  }
  return SHORE_REFLECTION.colours[0][1];
}

// The screen-down step on the map (one tile straight down the screen), and which of the four
// neighbours lie in front of a tile (nearer the viewer) at the current rotation.
function getShoreReflectionAxes() {
  const o = isoToScreen(0, 0);
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const front = steps.filter(([dr, dc]) => isoToScreen(dc, dr).y > o.y);
  const down = [[1, 1], [1, -1], [-1, 1], [-1, -1]].find(([dr, dc]) => {
    const p = isoToScreen(dc, dr);
    return Math.abs(p.x - o.x) < 1e-6 && p.y > o.y;
  });
  return { front, down };
}

function isShoreReflectionWater(row, col) {
  return typeof isInsideMap === 'function' && isInsideMap(row, col) && mapData?.[row]?.[col] === WATER;
}

// Every waterfront edge a lit building would throw light across: from each tile of its front
// side, out over up to `reach` tiles of street or promenade, to the first tile of open water.
function collectShoreReflectionSites(scene) {
  const sites = [];
  const sprites = scene?.buildingSprites;
  if (!sprites?.size || typeof mapData === 'undefined') return sites;
  const { front, down } = getShoreReflectionAxes();
  if (!down) return sites;
  const bridges = scene.bridgeSprites;
  const seen = new Set();
  const edges = new Set();
  sprites.forEach((sprite) => {
    if (!sprite || seen.has(sprite) || !sprite.active) return;
    seen.add(sprite);
    if (!(sprite.displayHeight >= SHORE_REFLECTION.minHeightPx)) return;
    const rows = sprite.footprintRows || 1;
    const cols = sprite.footprintCols || 1;
    const r0 = sprite.mapRow;
    const c0 = sprite.mapCol;
    if (!Number.isFinite(r0) || !Number.isFinite(c0)) return;
    const inside = (r, c) => r >= r0 && r < r0 + rows && c >= c0 && c < c0 + cols;
    for (let r = r0; r < r0 + rows; r++) {
      for (let c = c0; c < c0 + cols; c++) {
        for (const [dr, dc] of front) {
          if (inside(r + dr, c + dc)) continue;
          for (let step = 1; step <= SHORE_REFLECTION.reachTiles; step++) {
            const wr = r + dr * step;
            const wc = c + dc * step;
            if (!isInsideMap(wr, wc)) break;
            const id = getTileId(wr, wc);
            if (isShoreReflectionWater(wr, wc)) {
              if (bridges?.has(id)) break;
              const lr = wr - dr;
              const lc = wc - dc;
              const edgeKey = `${lr},${lc}>${wr},${wc}`;
              if (edges.has(edgeKey)) break;
              edges.add(edgeKey);
              let run = 1;
              while (run < SHORE_REFLECTION.maxRunTiles) {
                const rr = wr + down[0] * run;
                const rc = wc + down[1] * run;
                if (!isShoreReflectionWater(rr, rc) || bridges?.has(getTileId(rr, rc))) break;
                run++;
              }
              sites.push({ sprite, row: lr, col: lc, waterRow: wr, waterCol: wc, run, seed: id * 31 + step });
              break;
            }
            // a building (another, or this one's far side) in the way: its light does not reach
            if (sprites.has(id)) break;
          }
        }
      }
    }
  });
  return sites;
}

function getShoreReflectionLight(sprite) {
  const key = typeof sprite?.texture?.key === 'string' ? sprite.texture.key : '';
  const prefix = typeof BUILDING_NIGHT_TEXTURE_PREFIX === 'string' ? BUILDING_NIGHT_TEXTURE_PREFIX : 'bl_night__';
  if (key.startsWith(prefix)) {
    for (const [variant, alpha] of Object.entries(SHORE_REFLECTION.variantAlpha)) {
      if (key.endsWith(`__${variant}`)) return alpha;
    }
    return 1;
  }
  // a development build without baked night art: the live glows stand in for it
  return sprite?.scene?.buildingLightsActive ? 0.7 : 0;
}

function getShoreReflectionStrength(scene) {
  if (typeof isBuildingLightsEnabled === 'function' && !isBuildingLightsEnabled()) return 0;
  const swapAt = typeof BUILDING_NIGHT_SWAP_AT === 'number' ? BUILDING_NIGHT_SWAP_AT : 0.3;
  const raw = Number(scene?.nightRawAlpha) || 0;
  return Math.max(0, Math.min(1, (raw - swapAt) / SHORE_REFLECTION.fadeIn));
}

function buildShoreReflections(scene, state, signature, now) {
  const sites = collectShoreReflectionSites(scene);
  const sitesKey = sites.map((t) => `${t.row},${t.col}>${t.waterRow},${t.waterCol}:${t.run}`).join('|');
  state.signature = signature;
  state.builtAt = now;
  if (sitesKey === state.sitesKey && state.sprites.every((s) => s.scene)) {
    state.sites = sites; // the same waterfront (its buildings may have been rebuilt)
    return;
  }
  state.sprites.forEach((s) => s.destroy());
  state.sprites = [];
  state.sites = sites;
  state.sitesKey = sitesKey;
  if (!state.sites.length || !ensureShoreReflectionTexture(scene)) return;
  const cell = SHORE_REFLECTION_CELL;
  const blend = typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 1;
  for (const site of state.sites) {
    const land = getWaterEffectSurfacePoint(scene, site.col, site.row);
    const water = getWaterEffectSurfacePoint(scene, site.waterCol, site.waterRow);
    const height = Math.max(TILE_HEIGHT * 0.6, Math.min(site.sprite.displayHeight * SHORE_REFLECTION.lengthOfHeight,
      (site.run + 0.5) * TILE_HEIGHT));
    const sprite = scene.add.image((land.x + water.x) / 2, (land.y + water.y) / 2, SHORE_REFLECTION_TEXTURE_KEY, 0);
    sprite.setOrigin(0.5, 0);
    sprite.setScale((TILE_WIDTH / 2) * 0.85 / cell.width, height / cell.height);
    sprite.setTint(pickShoreReflectionColour(site.seed));
    sprite.setBlendMode(blend);
    sprite.setDepth(getWorldDepth('object') - 0.25);
    if (scene.worldMask) sprite.setMask(scene.worldMask);
    sprite.setVisible(false);
    sprite.reflectionPhase = Math.floor(waterEffectHash(site.seed + 7) * WATER_EFFECT_FRAMES);
    state.sprites.push(sprite);
  }
}

// A few times a second: after dark, show the streaks of the waterfront buildings that are lit, in
// view, as bright as their windows; by day nothing runs past the first check.
function updateShoreReflections(scene, time) {
  if (!scene) return;
  const state = scene.shoreReflections || (scene.shoreReflections = { sites: [], sprites: [], signature: '', builtAt: -Infinity, nextAt: 0, shown: false, tick: 0 });
  if (time < state.nextAt) return;
  state.nextAt = time + SHORE_REFLECTION.tickMs;
  const strength = isShoreReflectionsEnabled() ? getShoreReflectionStrength(scene) : 0;
  if (strength <= 0) {
    if (state.shown) {
      state.sprites.forEach((s) => s.setVisible(false));
      state.shown = false;
    }
    return;
  }
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const signature = `${scene.buildingSprites?.size || 0}|${rotation}|${scene.bridgeSprites?.size || 0}`;
  if (signature !== state.signature || time - state.builtAt > SHORE_REFLECTION.rebuildMs
    || state.sprites.some((s, i) => !s.scene || !state.sites[i]?.sprite?.active)) {
    buildShoreReflections(scene, state, signature, time);
  }
  state.tick++;
  const camera = scene.cameras?.main;
  const view = camera?.worldView;
  const pad = TILE_WIDTH * 2;
  state.sprites.forEach((sprite, i) => {
    const site = state.sites[i];
    const inView = !view || (sprite.x > view.x - pad && sprite.x < view.right + pad
      && sprite.y > view.y - pad * 2 && sprite.y < view.bottom + pad);
    const light = inView ? getShoreReflectionLight(site.sprite) : 0;
    if (light <= 0) {
      if (sprite.visible) sprite.setVisible(false);
      return;
    }
    sprite.setAlpha(SHORE_REFLECTION.alpha * strength * light);
    sprite.setFrame((state.tick + sprite.reflectionPhase) % WATER_EFFECT_FRAMES);
    if (!sprite.visible) sprite.setVisible(true);
  });
  state.shown = true;
}

function clearShoreReflections(scene) {
  const state = scene?.shoreReflections;
  if (!state) return;
  state.sprites.forEach((s) => s.destroy());
  scene.shoreReflections = null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VESSEL_WAKE,
    SHORE_REFLECTION,
    getVesselWakeGeometry,
    getShoreReflectionAxes,
    collectShoreReflectionSites,
    getShoreReflectionLight,
    pickShoreReflectionColour,
    trackVesselWake,
  };
}
