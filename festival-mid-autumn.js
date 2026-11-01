// 中秋 on the map (docs/festival-dlc-design.md §4.5): the fire dragon's loop and its march, the fire
// at the 煲蠟 tins, and the full moon. The placements themselves are festival-venues.js
// layoutMidAutumn's; this works out the map side of its context and moves what moves.
//
// The loop: a block of 10 to 24 road tiles round (a rectangle of road, all on one level, no bridge or
// highway) with the most homes on its kerbs, older ones counting more - Tai Hang's streets. Worked
// out again only when the roads or the buildings change. The dragon walks its centre line round and
// round while it is out, at a walking pace on the traffic's visual clock, as the lion dance does;
// its picture is the one facing the way it goes (the down-right or up-right render, or the mirror of
// either), changed at each corner.

const FIRE_DRAGON_TILE_M = 20;
const FIRE_DRAGON_SPEED_MPS = 1.4;
const FIRE_DRAGON_LOOP_TILES = Object.freeze([10, 24]);
const FIRE_DRAGON_MIN_HOMES = 3;
// the feet line's middle is this share of the dragon's drawn width above its picture's bottom centre
// (both renders, measured on the squared sheets)
const FIRE_DRAGON_FEET_LIFT = 0.21;
const FIRE_DRAGON_GLOWS = 3;
const MID_AUTUMN_CANDLE_GLOW_SCALE = 1.6;

function fireDragonHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

/**
 * The block the dragon goes round, or null.
 * @param {{ roadTiles: Array<{ row, col, height }>, homeAgeAt: (row, col) => number|null }} map
 *   homeAgeAt gives a home's age at a tile, null where there is none
 * @returns {{ id: string, tiles: Array<{ row, col }>, score: number }|null} tiles in walking order
 */
function findFireDragonLoop({ roadTiles = [], homeAgeAt = () => null } = {}) {
  const road = new Map(roadTiles.map((t) => [`${t.row}:${t.col}`, t.height || 0]));
  const isRoad = (r, c) => road.has(`${r}:${c}`);
  const [minTiles, maxTiles] = FIRE_DRAGON_LOOP_TILES;
  let best = null;
  roadTiles.forEach(({ row, col, height = 0 }) => {
    for (let w = 2; w <= maxTiles / 2 - 2; w++) {
      for (let h = 2; h <= maxTiles / 2 - w; h++) {
        if (2 * (w + h) < minTiles) continue;
        const tiles = [];
        for (let c = col; c <= col + w; c++) tiles.push({ row, col: c });
        for (let r = row + 1; r <= row + h; r++) tiles.push({ row: r, col: col + w });
        for (let c = col + w - 1; c >= col; c--) tiles.push({ row: row + h, col: c });
        for (let r = row + h - 1; r > row; r--) tiles.push({ row: r, col });
        if (!tiles.every((t) => road.get(`${t.row}:${t.col}`) === height)) continue;
        // a block, not a square of plain road: something stands inside it
        let inside = 0;
        for (let r = row + 1; r < row + h; r++) for (let c = col + 1; c < col + w; c++) if (!isRoad(r, c)) inside += 1;
        if (!inside) continue;
        // the homes on its kerbs, both sides, each counted once; an old one counts more
        const seen = new Set();
        let homes = 0;
        let score = 0;
        tiles.forEach((t) => [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
          const key = `${t.row + dr}:${t.col + dc}`;
          if (seen.has(key) || isRoad(t.row + dr, t.col + dc)) return;
          seen.add(key);
          const age = homeAgeAt(t.row + dr, t.col + dc);
          if (age == null) return;
          homes += 1;
          score += 1 + Math.min(2, (Number(age) || 0) / 120);
        }));
        if (homes < FIRE_DRAGON_MIN_HOMES) continue;
        if (!best || score > best.score + 1e-9) best = { id: `${row}:${col}:${w}x${h}`, tiles, score };
      }
    }
  });
  return best;
}

/** Where the dragon's middle is after `seconds` of marching, and which way it heads (map units). */
function getFireDragonPose(loop, seconds, seed = '') {
  const n = loop.tiles.length;
  const lengthM = n * FIRE_DRAGON_TILE_M;
  const start = fireDragonHash(`${seed}:${loop.id}:start`) * lengthM;
  const d = (((Math.max(0, Number(seconds) || 0) * FIRE_DRAGON_SPEED_MPS + start) % lengthM) + lengthM) % lengthM;
  const i = Math.floor(d / FIRE_DRAGON_TILE_M) % n;
  const u = (d - i * FIRE_DRAGON_TILE_M) / FIRE_DRAGON_TILE_M;
  const a = loop.tiles[i];
  const b = loop.tiles[(i + 1) % n];
  return { row: a.row + (b.row - a.row) * u, col: a.col + (b.col - a.col) * u, dRow: b.row - a.row, dCol: b.col - a.col };
}

/** Which picture shows a heading on screen: the down-right render or the up-right, and mirrored for leftward. */
function getFireDragonView(dx, dy) {
  return { partId: dy > 0 ? 'maFireDragonSE' : 'maFireDragonNE', mirrored: dx < 0 };
}

// ── The map side of the layout ────────────────────────────────────────────────

function isFireDragonRoadTile(row, col) {
  if (typeof mapData === 'undefined' || typeof ROAD === 'undefined' || mapData[row]?.[col] !== ROAD) return false;
  if (typeof isBridgeTile === 'function' && isBridgeTile(row, col)) return false;
  if (typeof isHighwayTile === 'function' && isHighwayTile(row, col)) return false;
  if (typeof isHighway === 'function' && isHighway(row, col)) return false;
  return true;
}

let midAutumnMapCache = null; // { key, loop }

function getMidAutumnLayoutExtras(scene) {
  const extras = { dragonLoop: null, isRoad: isFireDragonRoadTile,
    dragonWeatherBad: typeof lionDanceWeatherBad === 'function' && typeof city !== 'undefined' && lionDanceWeatherBad(city.weather || {}) };
  if (typeof mapData === 'undefined') return extras;
  const roadTiles = [];
  let signature = 2166136261;
  for (let row = 0; row < mapData.length; row++) for (let col = 0; col < mapData[row].length; col++) {
    if (!isFireDragonRoadTile(row, col)) continue;
    const height = typeof heightMap === 'undefined' ? 0 : heightMap[row]?.[col] || 0;
    roadTiles.push({ row, col, height });
    signature = Math.imul(signature ^ (row * 65537 + col * 17 + height), 16777619) >>> 0;
  }
  const buildings = typeof buildingData !== 'undefined' ? Object.keys(buildingData).length : 0;
  const key = `${roadTiles.length}:${signature}:${buildings}`;
  if (midAutumnMapCache?.key !== key) {
    // a home's age at a tile: the building over any tile of its footprint
    const homeAgeAt = (row, col) => {
      const sprite = scene?.buildingSprites?.get(typeof getTileId === 'function' ? getTileId(row, col) : `${row}:${col}`);
      const id = sprite && Number.isInteger(sprite.mapRow) ? `${sprite.mapRow}:${sprite.mapCol}` : `${row}:${col}`;
      const record = typeof buildingData !== 'undefined' ? buildingData[id] : null;
      return record?.type === 'residential' ? Number(record.age) || 0 : null;
    };
    midAutumnMapCache = { key, loop: findFireDragonLoop({ roadTiles, homeAgeAt }) };
  }
  extras.dragonLoop = midAutumnMapCache.loop;
  return extras;
}

// ── 中秋月: a full moon on the night, whatever the almanac's sample day says ─────

let midAutumnMoonKey = '';
let midAutumnMoonOn = false;

function isMidAutumnFullMoonDay() {
  if (typeof city === 'undefined' || typeof getFestivalsInMonth !== 'function') return false;
  const key = `${city.year}:${city.month}`;
  if (key !== midAutumnMoonKey) {
    midAutumnMoonKey = key;
    midAutumnMoonOn = getFestivalsInMonth(city.year, city.month).includes('midAutumn');
  }
  return midAutumnMoonOn;
}

/** The sky's astronomy for the day with the moon made full: up at sunset, down at sunrise. */
function applyMidAutumnFullMoon(astronomy, on = isMidAutumnFullMoonDay()) {
  if (!on) return astronomy;
  const sunset = Number(astronomy.sunsetMinutes) || 18 * 60;
  const sunrise = Number(astronomy.sunriseMinutes) || 6 * 60;
  const rise = sunset - 5;
  const set = sunrise + 5;
  return { ...astronomy, moonPhase: 0.5, moonriseMinutes: rise, moonsetMinutes: set,
    moonTransitMinutes: Math.round(((rise + set + 1440) / 2) % 1440) };
}

// ── Each frame ────────────────────────────────────────────────────────────────

function isFireDragonOut(scene) {
  if (scene?.scene?.isVisible?.() === false) return false;
  if (typeof isFestivalGameplayLive === 'function' && !isFestivalGameplayLive()) return false;
  if (typeof city !== 'undefined' && typeof lionDanceWeatherBad === 'function' && lionDanceWeatherBad(city.weather || {})) return false;
  return true;
}

function makeMidAutumnGlow(scene) {
  if (typeof ensureYulanTextures !== 'function' || typeof makeYulanLight !== 'function') return null;
  ensureYulanTextures(scene);
  return makeYulanLight(scene, YULAN_FIRE_GLOW_KEY, typeof Phaser !== 'undefined' ? Phaser.BlendModes.ADD : 1);
}

function clearMidAutumnGlows(scene) {
  scene?.midAutumnGlows?.forEach((list) => list.forEach((s) => s?.destroy?.()));
  if (scene) scene.midAutumnGlows = new Map();
}

function updateMidAutumn(scene, time) {
  if (!scene) return;
  const mine = [];
  scene.festivalSprites?.forEach((sprite, id) => { if (sprite.festivalPlacement?.festival === 'midAutumn') mine.push([id, sprite]); });
  if (!mine.length) {
    scene.fireDragonLastUpdateAt = null;
    if (scene.midAutumnGlows?.size) clearMidAutumnGlows(scene);
    return;
  }
  // the march clock: frame time at the traffic's visual speed, standing still while paused
  const previous = scene.fireDragonLastUpdateAt;
  scene.fireDragonLastUpdateAt = time;
  const out = isFireDragonOut(scene);
  const paused = typeof isGamePaused === 'function' ? isGamePaused() : typeof simPaused !== 'undefined' && simPaused;
  const speed = paused ? 0 : typeof getVehicleVisualSpeedMultiplier === 'function' ? getVehicleVisualSpeedMultiplier() : 1;
  if (out && Number.isFinite(previous)) scene.fireDragonElapsedMs = (scene.fireDragonElapsedMs || 0) + Math.min(250, Math.max(0, time - previous)) * Math.max(0, speed);
  const seconds = (scene.fireDragonElapsedMs || 0) / 1000;
  if (!scene.midAutumnGlows) scene.midAutumnGlows = new Map();
  const dark = !!scene.festivalLit;
  const flicker = typeof yulanFlicker === 'function' ? yulanFlicker : () => 0.8;
  const seen = new Set();
  const glowsFor = (id, count) => {
    seen.add(id);
    let list = scene.midAutumnGlows.get(id);
    if (!list) {
      list = Array.from({ length: count }, () => makeMidAutumnGlow(scene)).filter(Boolean);
      scene.midAutumnGlows.set(id, list);
    }
    return list;
  };
  mine.forEach(([id, sprite]) => {
    const p = sprite.festivalPlacement;
    if (p.fireDragon) {
      const pose = getFireDragonPose(p.fireDragon.loop, seconds, p.fireDragon.seed);
      const here = isoToScreen(pose.col, pose.row);
      const ahead = isoToScreen(pose.col + pose.dCol * 0.1, pose.row + pose.dRow * 0.1);
      const view = getFireDragonView(ahead.x - here.x, ahead.y - here.y);
      const shown = out && view.partId === p.partId;
      const glows = glowsFor(id, FIRE_DRAGON_GLOWS);
      // drawn width: lengthM along a map axis at 2.5 px a metre across the screen
      const widthPx = (FESTIVAL_PARTS_BY_ID?.[p.partId]?.lengthM || 26) * 2.5;
      if (shown) {
        p.row = pose.row;
        p.col = pose.col;
        p.mirrored = view.mirrored;
        // stand the feet line's middle, not the picture's bottom, on the road's centre line
        if (typeof positionFestivalSprite === 'function' && positionFestivalSprite(scene, sprite) !== false) sprite.y += FIRE_DRAGON_FEET_LIFT * widthPx;
      }
      sprite.setAlpha(shown ? 1 : 0);
      // the incense's warm light on the road under it, along its feet line (slope 0.5 the way it heads)
      const sx = Math.sign(ahead.x - here.x) || 1;
      const sy = Math.sign(ahead.y - here.y) || 1;
      glows.forEach((glow, i) => {
        const on = shown && dark && sprite.visible;
        glow.setVisible(on);
        if (!on) return;
        const t = ((i / (glows.length - 1 || 1)) * 2 - 1) * 0.4 * widthPx;
        glow.setPosition(sprite.x + t * sx, sprite.y - FIRE_DRAGON_FEET_LIFT * widthPx + t * 0.5 * sy);
        glow.setScale((widthPx * 0.45) / 256 * (0.95 + 0.08 * flicker(time, i * 3.1)));
        glow.setAlpha(Math.min(1, 0.4 * flicker(time, i * 1.7 + 2)));
        glow.setDepth(sprite.depth + 0.002);
      });
      return;
    }
    if (!p.fire) return;
    // 煲蠟: a small flickering fire glow at the tin
    const [glow] = glowsFor(id, 1);
    if (!glow) return;
    const on = dark && sprite.visible && sprite.festivalDrawable !== false;
    glow.setVisible(on);
    if (!on) return;
    const size = Math.max(6, sprite.displayHeight) * MID_AUTUMN_CANDLE_GLOW_SCALE;
    const k = flicker(time, (sprite.festivalSeed || 0) * 1.7);
    glow.setPosition(sprite.x, sprite.y - sprite.displayHeight * 0.3);
    glow.setScale(size / 256 * (0.92 + 0.12 * k));
    glow.setAlpha(Math.min(1, 0.6 * k));
    glow.setDepth(sprite.depth + 0.002);
  });
  scene.midAutumnGlows.forEach((list, id) => {
    if (seen.has(id)) return;
    list.forEach((s) => s?.destroy?.());
    scene.midAutumnGlows.delete(id);
  });
}

// ── The news ──────────────────────────────────────────────────────────────────

const MID_AUTUMN_NEWS_IMAGE = 'UI/news/midAutumnLiveBlooper.webp';

// Once a year, the first evening the lantern fair is lit: the TV's live report from the fair, and
// its presenter's slip of the tongue.
function maybePostMidAutumnStory(scene, placements) {
  if (typeof addForumPost !== 'function' || typeof city === 'undefined') return;
  const year = Math.floor(Number(city.year) || 0);
  const id = `midAutumn-${year}`;
  if ((city.forumPosts || []).some((p) => p.id === id)) return;
  if (!scene?.festivalLit || !placements.some((p) => p.festival === 'midAutumn' && String(p.id).startsWith('midAutumn:park:'))) return;
  const dragon = placements.some((p) => p.festival === 'midAutumn' && p.fireDragon);
  const cityName = String(city.name || '').trim() || '香城';
  const headline = `【中秋直播】${cityName}電視台綵燈會現場口誤　女主持一本正經：「食燈籠、玩月餅！」`;
  if (typeof addCityNews === 'function') addCityNews(headline);
  addForumPost({
    headline,
    image: MID_AUTUMN_NEWS_IMAGE,
    body: [
      `中秋夜${cityName}電視台喺公園綵燈會做直播，女主持手揸燈籠、企喺月餅攤前面，對住鏡頭講出：「今晚大家記得食燈籠、玩月餅！」全場靜咗兩秒先爆笑。`,
      '主持即場改口：「係玩燈籠、食月餅！」攝影師笑到部機都震埋。片段十分鐘內喺網上轉發過萬次，有網民即刻將佢剪成洗腦歌。',
      dragon ? '綵燈會以外，舊區街坊今晚照舊舞火龍，香火繞住街口一圈又一圈，沿路居民開窗睇熱鬧。' : '公園入面賞月人潮到夜深未散，有街坊帶埋柚子同楊桃燈席地而坐。',
      '電視台事後回應：「主持人應節表演，祝大家中秋快樂。」',
    ],
    source: 'local',
    social: {
      likes: 3500, laughs: 2600, angry: 15, commentCount: 1264, shares: 1900,
      comments: [
        { author: '月餅控', text: '食燈籠我未試過，玩月餅就細個成日玩，咬晒個蛋黃出嚟先食皮。' },
        { author: '電視迷', text: '今年最佳直播，冇得頂。明年請返佢！' },
        { author: '大坑街坊', text: '火龍經過我樓下，香到成晚都聞到。' },
      ],
    },
  }, { id, category: '城中熱話', author: '香城日報', outcome: 'midAutumn', year, month: Math.floor(Number(city.month) || 9) });
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  FIRE_DRAGON_TILE_M, FIRE_DRAGON_SPEED_MPS, FIRE_DRAGON_LOOP_TILES, FIRE_DRAGON_FEET_LIFT,
  findFireDragonLoop, getFireDragonPose, getFireDragonView, applyMidAutumnFullMoon,
  getMidAutumnLayoutExtras, updateMidAutumn, maybePostMidAutumnStory, MID_AUTUMN_NEWS_IMAGE,
};
