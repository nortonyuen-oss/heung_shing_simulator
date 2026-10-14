// 盂蘭 at night (docs/festival-dlc-design.md §4.4): what the 燒街衣 and the 勝會 add over their
// sprites (festival-sprites.js draws the props themselves):
//   - fire: an orange pool of light under every burning bin and furnace, flickering, smoke rising;
//   - the paper horse, boat and house burned at the end of the night: lit orange, fading away;
//   - green (Norton 2026-10-14: 加綠光，增加詭異氣氛): a ghostly glow over the 孤魂之位, will-o'-the-wisps
//     drifting by the streets and the shrine after ten, and the deep night tinted a little green -
//     only in the 盂蘭 month, and the tint can be turned off (View → 盂蘭夜色).
// It also gives the layout what it needs from the map: the free kerb slots facing homes, with each
// one's district and age, and the districts of the courts and event grounds (cached per month).

const YULAN_FIRE_GLOW_KEY = 'fx_yulan_fire_glow';
const YULAN_GHOST_GLOW_KEY = 'fx_yulan_ghost_glow';
const YULAN_SMOKE_KEY = 'fx_yulan_smoke';
const YULAN_GHOST_TIME = Object.freeze([22 * 60, 28 * 60]);    // the wisps, and the green in the sky
const YULAN_MAX_WISPS = 20;
const YULAN_SMOKE_PER_FIRE = 2;
const YULAN_NIGHT_COLOUR = 0x020713;                           // day-night-lighting.js's overlay
const YULAN_GHOST_NIGHT_COLOUR = 0x03160f;                     // a little toward green
const YULAN_TINT_SETTING_KEY = 'citybuilder.yulanNightTint.v1';
let yulanTintEnabledCache = null;

function isYulanNightTintEnabled() {
  if (yulanTintEnabledCache !== null) return yulanTintEnabledCache;
  try {
    const raw = localStorage.getItem(YULAN_TINT_SETTING_KEY);
    yulanTintEnabledCache = raw === null ? true : JSON.parse(raw) !== false;
  } catch {
    yulanTintEnabledCache = true;
  }
  return yulanTintEnabledCache;
}

function setYulanNightTintEnabled(enabled) {
  yulanTintEnabledCache = !!enabled;
  try { localStorage.setItem(YULAN_TINT_SETTING_KEY, JSON.stringify(!!enabled)); } catch {}
}

// ── What the layout needs from the map ───────────────────────────────────────

let yulanMapCache = null; // { key, kerbSlots, districtOf }

// A residential building's record behind a tile (any tile of its footprint).
function getYulanHomeAt(scene, row, col) {
  const building = scene?.buildingSprites?.get(getTileId(row, col));
  if (!building) return null;
  const record = buildingData[getTileId(building.mapRow, building.mapCol)];
  return record?.type === 'residential' ? record : null;
}

/**
 * Free kerb slots facing homes: on a straight road tile (road on both sides along it), the pavement
 * on the side whose neighbour is a home, at either half; not where a street prop already stands.
 * @returns {Array<{ row, col, side, half, district, age }>}
 */
function computeYulanKerbSlots(scene) {
  if (typeof mapData === 'undefined' || typeof ROAD === 'undefined') return [];
  const taken = new Set();
  scene?.streetFurnitureSprites?.forEach((sprite) => {
    const p = sprite.streetFurniture;
    if (p) taken.add(`${p.row}:${p.col}:${p.side}:${p.half}`);
  });
  const step = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
  const isRoad = (r, c) => isInsideMap(r, c) && mapData[r][c] === ROAD && !(typeof isBridgeTile === 'function' && isBridgeTile(r, c));
  const slots = [];
  for (let r = 0; r < mapData.length; r++) {
    for (let c = 0; c < mapData[r].length; c++) {
      if (!isRoad(r, c)) continue;
      Object.entries(step).forEach(([side, [dr, dc]]) => {
        // only the pavement on the far side of the road at this rotation: a building on the near side
        // would hide everything on its pavement
        if (isoToScreen(c + dc, r + dr).y >= isoToScreen(c, r).y) return;
        const nr = r + dr;
        const nc = c + dc;
        // a pavement beside land (homes most of all; shops and the rest too), not the sea or more road
        if (!isInsideMap(nr, nc) || isRoad(nr, nc) || (typeof WATER !== 'undefined' && mapData[nr][nc] === WATER)) return;
        const along = side === 'n' || side === 's' ? ['e', 'w'] : ['n', 's'];
        if (!along.every((d) => isRoad(r + step[d][0], c + step[d][1]))) return; // a corner or a dead end
        const home = getYulanHomeAt(scene, nr, nc);
        const open = isYulanSlotOpen(scene, r, c, side);
        along.forEach((half) => {
          if (taken.has(`${r}:${c}:${side}:${half}`)) return;
          slots.push({
            row: r, col: c, side, half,
            district: typeof getDistrictKeyForTile === 'function' ? getDistrictKeyForTile(r, c) : 'all',
            age: home ? Number(home.age) || 0 : 0,
            home: !!home,
            open,
          });
        });
      });
    }
  }
  return slots;
}

// Whether a road tile's middle can be seen: no building standing in front of it (nearer the viewer,
// within four tiles) has a picture over that point. Most of a dense city's pavements are behind a
// tall block; the fires go where people can see them first.
function getYulanSlotPoint(scene, row, col, side) {
  const centre = getTileFaceGeometry(row, col, scene.offsetX, scene.offsetY).center;
  const [dr, dc] = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] }[side] || [0, 0];
  const a = isoToScreen(col, row);
  const b = isoToScreen(col + dc * 0.38, row + dr * 0.38); // the pavement, where the fire stands
  return { x: centre.x + b.x - a.x, y: centre.y + b.y - a.y };
}

// Whether a sprite's own pixels (not just its rectangle: a tower's corners are sky) cover a point.
function isYulanPointUnderSprite(scene, sprite, x, y) {
  if (typeof sprite.getBounds !== 'function' || !sprite.getBounds().contains(x, y)) return false;
  const frame = sprite.frame;
  if (!frame || typeof scene.textures?.getPixelAlpha !== 'function') return true;
  const lx = (x - sprite.x) / sprite.scaleX + sprite.displayOriginX;
  const ly = (y - sprite.y) / sprite.scaleY + sprite.displayOriginY;
  if (lx < 0 || ly < 0 || lx >= frame.width || ly >= frame.height) return false;
  const alpha = scene.textures.getPixelAlpha(Math.floor(lx), Math.floor(ly), sprite.texture.key, frame.name);
  return alpha == null ? true : alpha > 96;
}

function isYulanSlotOpen(scene, row, col, side) {
  const sprites = scene?.buildingSprites;
  if (!sprites || typeof getTileFaceGeometry !== 'function') return true;
  const at = getYulanSlotPoint(scene, row, col, side);
  const here = isoToScreen(col, row).y;
  const seen = new Set();
  for (let dr = -4; dr <= 4; dr++) {
    for (let dc = -4; dc <= 4; dc++) {
      const b = sprites.get(getTileId(row + dr, col + dc));
      if (!b || seen.has(b)) continue;
      seen.add(b);
      if (isoToScreen(col + dc, row + dr).y <= here) continue; // behind the road, not in front of it
      if (isYulanPointUnderSprite(scene, b, at.x, at.y - 6)) return false;
    }
  }
  return true;
}

// 燒街衣 where the player is looking (Norton 2026-10-14): zoomed in past 1x, about ten groups on the
// visible pavements in the view, none anywhere else. Groups still in view stay as the camera moves
// and new ones fill in; older homes come a little sooner.
const YULAN_VIEW_GROUPS = 10;
const YULAN_VIEW_MIN_ZOOM = 1;

function pickYulanViewStreets(scene, slots, seed) {
  const camera = scene?.cameras?.main;
  if (!camera || !(camera.zoom > YULAN_VIEW_MIN_ZOOM) || !camera.worldView) {
    if (scene) scene.yulanViewPick = [];
    return [];
  }
  const v = camera.worldView;
  const key = (s) => `${s.row}:${s.col}:${s.side}:${s.half}`;
  const inView = (s) => {
    const p = getYulanSlotPoint(scene, s.row, s.col, s.side);
    return p.x >= v.x + 20 && p.x <= v.right - 20 && p.y >= v.y + 40 && p.y <= v.bottom - 10;
  };
  const open = slots.filter((s) => s.open !== false && inView(s));
  const byKey = new Map(open.map((s) => [key(s), s]));
  const picked = (scene.yulanViewPick || []).map((k) => byKey.get(k)).filter(Boolean);
  // a tile apart at least, never two groups at one pavement
  const apart = (s) => picked.every((p) => Math.abs(p.row - s.row) + Math.abs(p.col - s.col) >= 2);
  const hash = typeof lnyHash === 'function' ? lnyHash : () => 0.5;
  open
    // homes first (older ones sooner), then the other pavements
    .map((s) => ({ s, roll: hash(`${seed}:yulan:${key(s)}`) * (s.home === false ? 1.5 : 1) * (1 - Math.min(0.5, (Number(s.age) || 0) / 800)) }))
    .sort((a, b) => a.roll - b.roll)
    .forEach(({ s }) => {
      if (picked.length < YULAN_VIEW_GROUPS && !picked.includes(s) && apart(s)) picked.push(s);
    });
  scene.yulanViewPick = picked.map(key);
  return picked;
}

/** The map side of the 盂蘭 layout context, worked out once a month (or when the city grows). */
function getYulanLayoutExtras(scene, ctx) {
  const monthIndex = typeof getCityMonthIndex === 'function' ? getCityMonthIndex() : 0;
  const count = typeof buildingData !== 'undefined' ? Object.keys(buildingData).length : 0;
  const rotation = typeof mapRotation === 'number' ? mapRotation : 0;
  const key = `${city.name}:${monthIndex}:${count}:${rotation}`;
  if (yulanMapCache?.key !== key) yulanMapCache = { key, kerbSlots: computeYulanKerbSlots(scene) };
  const districtOf = (id) => {
    const [r, c] = String(id).replace(/^eventGround:/, '').split(':').map(Number);
    return Number.isFinite(r) && typeof getDistrictKeyForTile === 'function' ? getDistrictKeyForTile(r, c) : null;
  };
  const withDistrict = (list) => (list || []).map((v) => ({ ...v, district: districtOf(v.id) }));
  return {
    kerbSlots: yulanMapCache.kerbSlots,
    viewStreets: pickYulanViewStreets(scene, yulanMapCache.kerbSlots, `${city.name}:${city.year}`),
    courts: withDistrict(ctx.courts),
    sportsGrounds: withDistrict(ctx.sportsGrounds),
    eventGrounds: withDistrict(ctx.eventGrounds),
  };
}

// ── Light textures (drawn first, then handed to Phaser so they get mipmaps) ───

function makeYulanGlowTexture(scene, key, size, draw) {
  if (scene.textures.exists(key)) return key;
  if (typeof document === 'undefined' || typeof scene.textures.addCanvas !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, size);
  scene.textures.addCanvas(key, canvas);
  return key;
}

function yulanBlob(ctx, x, y, rx, ry, stops) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  stops.forEach(([at, colour]) => g.addColorStop(at, colour));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function ensureYulanTextures(scene) {
  // fire: a pool on the ground (2:1, as the view), a warm halo above it
  makeYulanGlowTexture(scene, YULAN_FIRE_GLOW_KEY, 256, (ctx, s) => {
    ctx.globalCompositeOperation = 'lighter';
    yulanBlob(ctx, s / 2, s * 0.62, s * 0.48, s * 0.24, [[0, 'rgba(255,150,50,0.75)'], [0.45, 'rgba(240,110,30,0.3)'], [1, 'rgba(240,110,30,0)']]);
    yulanBlob(ctx, s / 2, s * 0.45, s * 0.22, s * 0.3, [[0, 'rgba(255,200,110,0.6)'], [1, 'rgba(255,160,60,0)']]);
  });
  // ghost light: a pale green core in a wide soft halo
  makeYulanGlowTexture(scene, YULAN_GHOST_GLOW_KEY, 128, (ctx, s) => {
    ctx.globalCompositeOperation = 'lighter';
    yulanBlob(ctx, s / 2, s / 2, s / 2, s / 2, [[0, 'rgba(170,255,200,0.95)'], [0.18, 'rgba(110,255,170,0.55)'], [0.55, 'rgba(60,220,140,0.15)'], [1, 'rgba(40,200,120,0)']]);
  });
  // smoke: a soft grey puff
  makeYulanGlowTexture(scene, YULAN_SMOKE_KEY, 64, (ctx, s) => {
    yulanBlob(ctx, s / 2, s / 2, s / 2, s / 2, [[0, 'rgba(150,145,140,0.7)'], [0.6, 'rgba(130,125,120,0.25)'], [1, 'rgba(120,115,110,0)']]);
  });
}

// ── Each frame ────────────────────────────────────────────────────────────────

function yulanFlicker(time, seed) {
  // an uneven flicker: three slow waves at unrelated rates
  return 0.75 + 0.12 * Math.sin(time / 97 + seed) + 0.08 * Math.sin(time / 41 + seed * 2.3) + 0.05 * Math.sin(time / 23 + seed * 5.1);
}

function makeYulanLight(scene, key, blend) {
  const sprite = scene.add.image(0, 0, key);
  if (scene.worldMask) sprite.setMask(scene.worldMask);
  if (blend) sprite.setBlendMode(blend);
  sprite.setVisible(false);
  return sprite;
}

function clearYulanLights(scene) {
  (scene?.yulanLights || new Map()).forEach((entry) => Object.values(entry).flat().forEach((s) => s?.destroy?.()));
  if (scene) scene.yulanLights = new Map();
  (scene?.yulanWisps || []).forEach((w) => w.sprite.destroy());
  if (scene) scene.yulanWisps = [];
  restoreYulanNightColour(scene);
}

function restoreYulanNightColour(scene) {
  if (scene?.yulanNightColour == null) return;
  scene.nightOverlay?.setFillStyle(YULAN_NIGHT_COLOUR, 1);
  scene.yulanNightColour = null;
}

function lerpYulanColour(a, b, t) {
  const ch = (shift) => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function updateYulan(scene, time) {
  if (!scene || typeof city === 'undefined') return;
  const sprites = scene.festivalSprites;
  const minute = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : 0;
  const sky = minute < 6 * 60 ? minute + 24 * 60 : minute;
  const mine = [];
  sprites?.forEach((sprite, id) => { if (sprite.festivalPlacement?.festival === 'yulan') mine.push([id, sprite]); });
  if (!mine.length) {
    if (scene.yulanLights?.size || scene.yulanWisps?.length || scene.yulanNightColour != null) clearYulanLights(scene);
    return;
  }
  ensureYulanTextures(scene);
  if (!scene.yulanLights) scene.yulanLights = new Map();
  const dark = !!scene.festivalLit;
  const add = typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 1;
  const seen = new Set();
  mine.forEach(([id, sprite]) => {
    const p = sprite.festivalPlacement;
    // a 阿飄 at the offerings: hovering a hand's breadth off the ground, bobbing, fading in and out
    if (p.floating && Number.isFinite(sprite.festivalBaseY)) {
      const t = time / 1000 + (sprite.festivalSeed || 0);
      sprite.y = sprite.festivalBaseY - 4 - 2.5 * Math.sin(t * 1.3);
      sprite.setAlpha(0.55 + 0.3 * Math.sin(t * 0.7));
      return;
    }
    if (!(p.fire || p.ghost || p.burning)) return;
    seen.add(id);
    let entry = scene.yulanLights.get(id);
    if (!entry) {
      entry = { glow: makeYulanLight(scene, p.ghost ? YULAN_GHOST_GLOW_KEY : YULAN_FIRE_GLOW_KEY, add), smoke: [] };
      if (!p.ghost) for (let i = 0; i < YULAN_SMOKE_PER_FIRE + (p.burning ? 2 : 0); i++) entry.smoke.push(makeYulanLight(scene, YULAN_SMOKE_KEY, null));
      scene.yulanLights.set(id, entry);
    }
    const shown = sprite.visible && sprite.festivalDrawable !== false && dark;
    const seed = (sprite.festivalSeed || 0) * 1.7;
    // the light reaches well past the bin: never smaller than a few metres of pavement
    const size = Math.max(14, sprite.displayHeight);
    if (p.ghost) {
      // a slow green breath over the shrine
      entry.glow.setVisible(shown);
      if (shown) {
        entry.glow.setPosition(sprite.x, sprite.y - size * 0.55);
        entry.glow.setScale((size * 2.2) / 128);
        entry.glow.setAlpha(0.45 + 0.25 * Math.sin(time / 900 + seed));
        entry.glow.setDepth(sprite.depth + 0.002);
      }
      return;
    }
    const k = yulanFlicker(time, seed) * (p.burning ? 1.8 : 1);
    entry.glow.setVisible(shown);
    if (shown) {
      entry.glow.setPosition(sprite.x, sprite.y - size * 0.1);
      entry.glow.setScale((size * 3.2 * (p.burning ? 1.6 : 1)) / 256 * (0.95 + 0.08 * k));
      entry.glow.setAlpha(Math.min(1, 0.55 * k));
      entry.glow.setDepth(sprite.depth + 0.002);
    }
    // smoke: puffs rising from the top, growing and fading, each on its own loop
    entry.smoke.forEach((puff, i) => {
      const period = 3200 + i * 700;
      const t = ((time + seed * 500 + i * period / entry.smoke.length) % period) / period;
      puff.setVisible(sprite.visible && sprite.festivalDrawable !== false);
      if (!puff.visible) return;
      puff.setPosition(sprite.x + Math.sin(t * 4 + seed) * 3 + t * 6, sprite.y - size * (0.85 + t * 1.6));
      puff.setScale((size * (0.25 + t * 0.6)) / 64);
      puff.setAlpha((1 - t) * (dark ? 0.35 : 0.5) * Math.min(1, t * 6));
      puff.setDepth(sprite.depth + 0.003);
    });
    // a burning effigy: lit orange and fading as it goes (YULAN_TIMES.burn)
    if (p.burning && typeof YULAN_TIMES !== 'undefined') {
      const burnT = Math.max(0, Math.min(1, (sky - YULAN_TIMES.burn[0]) / (YULAN_TIMES.burn[1] - YULAN_TIMES.burn[0])));
      sprite.setTint(lerpYulanColour(0xffffff, 0xff8a3a, Math.min(1, burnT * 2)));
      sprite.setAlpha(1 - burnT * 0.95);
    }
  });
  scene.yulanLights.forEach((entry, id) => {
    if (seen.has(id)) return;
    Object.values(entry).flat().forEach((s) => s?.destroy?.());
    scene.yulanLights.delete(id);
  });
  updateYulanWisps(scene, time, mine, sky, add);
  updateYulanNightColour(scene, sky);
}

// Will-o'-the-wisps after ten: a few pale green lights by the burning streets and the shrines,
// drifting slowly, breathing in and out. Fewer is eerier: at most YULAN_MAX_WISPS on the map.
function updateYulanWisps(scene, time, mine, sky, add) {
  const on = !!scene.festivalLit && sky >= YULAN_GHOST_TIME[0] && sky < YULAN_GHOST_TIME[1];
  if (!scene.yulanWisps) scene.yulanWisps = [];
  if (!on) {
    scene.yulanWisps.forEach((w) => w.sprite.destroy());
    scene.yulanWisps = [];
    return;
  }
  if (!scene.yulanWisps.length) {
    const homes = mine.filter(([, s]) => s.festivalPlacement.ghost || s.festivalPlacement.partId === 'yulanMat');
    homes.sort(([a], [b]) => (typeof lnyHash === 'function' ? lnyHash(`wisp:${a}`) - lnyHash(`wisp:${b}`) : 0));
    homes.slice(0, YULAN_MAX_WISPS).forEach(([id, s], i) => {
      scene.yulanWisps.push({ id, anchor: s, seed: i * 2.39, sprite: makeYulanLight(scene, YULAN_GHOST_GLOW_KEY, add) });
    });
  }
  scene.yulanWisps.forEach((w) => {
    const s = w.anchor;
    const shown = s.active !== false && s.visible;
    w.sprite.setVisible(shown);
    if (!shown) return;
    const t = time / 1000 + w.seed;
    w.sprite.setPosition(s.x + 22 * Math.sin(t * 0.31) + 9 * Math.sin(t * 0.83), s.y - 14 - 10 * (1 + Math.sin(t * 0.47)) + 4 * Math.sin(t * 1.3));
    w.sprite.setScale(0.12 + 0.03 * Math.sin(t * 0.7));
    // breathes in and out, now and then all but gone
    w.sprite.setAlpha(Math.max(0, 0.15 + 0.6 * Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1)));
    w.sprite.setDepth(getWorldDepth('effect', s.y));
  });
}

// The deep night of the 盂蘭 month, a little green (eased in over an hour; View → 盂蘭夜色).
function updateYulanNightColour(scene, sky) {
  if (!scene.nightOverlay) return;
  if (!isYulanNightTintEnabled() || sky < YULAN_GHOST_TIME[0] || sky >= YULAN_GHOST_TIME[1]) {
    restoreYulanNightColour(scene);
    return;
  }
  const t = Math.min(1, (sky - YULAN_GHOST_TIME[0]) / 60, (YULAN_GHOST_TIME[1] - sky) / 60);
  const colour = lerpYulanColour(YULAN_NIGHT_COLOUR, YULAN_GHOST_NIGHT_COLOUR, t);
  if (scene.yulanNightColour === colour) return;
  scene.nightOverlay.setFillStyle(colour, 1);
  scene.yulanNightColour = colour;
}

// ── The news ──────────────────────────────────────────────────────────────────

// Once a year, when the paper effigies are burned at a 勝會: a plain story, no jokes.
function maybePostYulanStory(scene, placements) {
  if (typeof addForumPost !== 'function' || typeof city === 'undefined') return;
  const year = Math.floor(Number(city.year) || 0);
  const id = `yulan-${year}`;
  if ((city.forumPosts || []).some((p) => p.id === id)) return;
  const effigy = placements.find((p) => p.festival === 'yulan' && p.burning);
  if (!effigy) return;
  const cityName = String(city.name || '').trim() || '香城';
  const headline = `【盂蘭勝會】${cityName}街坊送紙紮　神功戲前排留空　燒街衣火光通宵`;
  if (typeof addCityNews === 'function') addCityNews(headline);
  addForumPost({
    headline,
    body: [
      `農曆七月十四前後，${cityName}多個球場搭起竹棚舉行盂蘭勝會：經師誦經超度，神功戲棚夜夜開鑼，戲棚前排膠櫈照例留空，畀「好兄弟」先坐。`,
      '勝會朝早派平安米，街坊一早排隊；夜晚喺化寶爐前送走紙紮馬、船同大屋，火光沖天。',
      '舊區街頭亦有不少街坊燒街衣，擺白飯、豆腐同生果拜祭遊魂。消防處提醒市民用化寶桶，留意火種，燒完要淋熄。',
    ],
    source: 'local',
    social: {
      likes: 1600, laughs: 120, angry: 60, commentCount: 900, shares: 700,
      comments: [
        { author: '舊區街坊', text: '細個成日跟阿嫲燒街衣，而家自己帶仔女一齊拜。' },
        { author: '夜更司機', text: '收工經過球場，戲棚前排真係冇人坐，個個都識。' },
        { author: '潮州人', text: '派平安米排咗成個鐘，攞返屋企煲粥，保平安。' },
      ],
    },
  }, { id, category: '城中熱話', author: '香城社區台', outcome: 'yulan', year, month: Math.floor(Number(city.month) || 8) });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { yulanFlicker, lerpYulanColour, pickYulanViewStreets, YULAN_GHOST_TIME, YULAN_MAX_WISPS, YULAN_VIEW_GROUPS };
}
