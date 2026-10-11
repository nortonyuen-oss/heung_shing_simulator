// 發現 UFO (docs/festival-dlc-design.md §4.7): now and then, on a clear night, a saucer with a waving
// alien drifts in over the city, circles a landmark with its beam down while a knot of residents
// looks up, then hops and zips away. The city's forum carries the story, the ticker runs it, and
// visitors come to look for a couple of months.
//
// Like the other festivals nothing about it is saved but the record: whether a month has a sighting
// is a fixed roll of the city and the month (getScheduledUfoSighting), where the saucer is comes
// from the clock (getUfoPhase), and city.festivals.ufo keeps only when the last one came (the
// cooldown) and how many have. The saucer is drawn every frame (updateUfo) - it moves - from six
// frames of the one render played in turn, all at one scale.

const UFO_SIGHTING = Object.freeze({
  chance: 0.06,               // a month, once the cooldown has passed: about one every year and a half
  cooldownMonths: 12,
  earliestMinute: 20 * 60,    // it arrives between 20:00 ...
  latestMinute: 25 * 60,      // ... and 01:00 (past midnight counts on), and is gone before 04:00
  arriveMinutes: 20,
  hoverMinutes: 100,
  leaveMinutes: 14,
  altitudeM: 45,
  loopMinutes: 16,            // one circle round the landmark
  loopRadiusPx: 70,
  frameMs: 150,
  tourism: 2,                 // 「UFO 熱」
  effectMonths: 2,
});
const UFO_FRAME_PARTS = Object.freeze(['ufo1', 'ufo2', 'ufo3', 'ufo4', 'ufo5', 'ufo6']);
const UFO_PX_PER_METRE = 5;

let ufoForced = null;      // { monthIndex, startMinute }: a test-mode summons (not saved)
let ufoRuntime = null;     // the sighting being drawn: { key, sighting, target, sprites, ... }

// A minute of the month's sky-day, with the small hours after midnight counted on from 24:00.
function getUfoSkyMinute(minuteOfDay) {
  const m = Number(minuteOfDay) || 0;
  return m < 6 * 60 ? m + 24 * 60 : m;
}

function getUfoRoll(text) {
  if (typeof hashCouncilEffectSeed === 'function') return hashCouncilEffectSeed(text);
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

/**
 * The sighting a month has, if any: a fixed roll of the city and month, after the cooldown.
 * @returns {{ startMinute: number }|null} startMinute on the sky-day clock (getUfoSkyMinute)
 */
function getScheduledUfoSighting({ cityName, year, month, monthIndex, lastMonthIndex }) {
  if (Number(lastMonthIndex) >= 0 && monthIndex - lastMonthIndex < UFO_SIGHTING.cooldownMonths) return null;
  const seed = `ufo:${cityName || 'heung-shing'}:${year}:${month}`;
  if (getUfoRoll(`${seed}:month`) >= UFO_SIGHTING.chance) return null;
  const span = UFO_SIGHTING.latestMinute - UFO_SIGHTING.earliestMinute;
  return { startMinute: UFO_SIGHTING.earliestMinute + Math.floor(getUfoRoll(`${seed}:time`) * span) };
}

/** Where a sighting stands at a minute: { phase: 'arrive'|'hover'|'leave', t: 0..1, elapsed } or null. */
function getUfoPhase(sighting, minuteOfDay) {
  if (!sighting) return null;
  const elapsed = getUfoSkyMinute(minuteOfDay) - sighting.startMinute;
  const { arriveMinutes: a, hoverMinutes: h, leaveMinutes: l } = UFO_SIGHTING;
  if (elapsed < 0 || elapsed >= a + h + l) return null;
  if (elapsed < a) return { phase: 'arrive', t: elapsed / a, elapsed };
  if (elapsed < a + h) return { phase: 'hover', t: (elapsed - a) / h, elapsed };
  return { phase: 'leave', t: (elapsed - a - h) / l, elapsed };
}

function isUfoWeatherClear(weather = typeof city !== 'undefined' ? city?.weather : null) {
  if (!weather) return true;
  if (weather.typhoonStage && weather.typhoonStage !== 'none') return false;
  if (weather.rainWarning && weather.rainWarning !== 'none') return false;
  return !['showers', 'heavyRain'].includes(weather.condition);
}

/** Test mode (校正工具 → 節慶 → 召喚 UFO): a sighting starting now, whatever the hour and weather. */
function summonUfo() {
  if (typeof city === 'undefined' || typeof getCityMonthIndex !== 'function') return false;
  const minute = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : 20 * 60;
  ufoForced = { monthIndex: getCityMonthIndex(), startMinute: getUfoSkyMinute(minute) };
  return true;
}

// ── Where it goes ─────────────────────────────────────────────────────────────

// The landmark it circles: a Victoria Park's square, else a big mall's forecourt, else the
// promenade, else the middle of the map - one of them, by the month's roll.
function pickUfoTarget(seed) {
  const ctx = typeof getFestivalVenueContext === 'function' ? getFestivalVenueContext() : {};
  const pick = (list) => list[Math.floor(getUfoRoll(`${seed}:target`) * list.length)];
  const parks = (ctx.parks || []).filter((p) => FESTIVAL_BUILDING_SPOTS[p.textureKey]?.spots?.centre);
  if (parks.length) {
    const park = pick(parks);
    return { mode: 'building', buildingId: park.id, point: FESTIVAL_BUILDING_SPOTS[park.textureKey].spots.centre };
  }
  const malls = (ctx.malls || []).filter((m) => FESTIVAL_BUILDING_SPOTS[m.modelKey]?.spots?.door);
  if (malls.length) {
    const mall = pick(malls);
    return { mode: 'building', buildingId: mall.id, point: FESTIVAL_BUILDING_SPOTS[mall.modelKey].spots.door };
  }
  if (ctx.promenadeTiles?.length) {
    const [row, col] = pick(ctx.promenadeTiles);
    return { mode: 'tile', row, col };
  }
  const row = Math.floor((typeof mapData !== 'undefined' ? mapData.length : 2) / 2);
  const col = Math.floor((typeof mapData !== 'undefined' ? mapData[0].length : 2) / 2);
  return { mode: 'tile', row, col };
}

// The map tile under a target (for the camera and the district name).
function getUfoTargetTile(target) {
  if (target.mode === 'tile') return [target.row, target.col];
  return typeof getFestivalPlacementTile === 'function' ? getFestivalPlacementTile(target) : null;
}

function getUfoDistrictName(target) {
  const tile = getUfoTargetTile(target);
  const district = tile && typeof getDistrictNameForTile === 'function' ? getDistrictNameForTile(Math.round(tile[0]), Math.round(tile[1])) : null;
  const zh = typeof getCurrentLanguage === 'function' && getCurrentLanguage() === 'en' ? district?.en : district?.zh;
  return zh || (typeof city !== 'undefined' ? city.name : '') || '香城';
}

// ── The news ──────────────────────────────────────────────────────────────────

function postUfoForumStory(target, sightings) {
  if (typeof addForumPost !== 'function') return null;
  const place = getUfoDistrictName(target);
  const again = sightings > 1;
  const headline = again
    ? `【又嚟！】彩燈UFO第${sightings}次現身${place}上空　外星人再度揮手　市民：佢記得我哋`
    : `【多區目擊】香城上空驚現彩燈UFO！閃燈飛碟盤旋${place}　外星人疑舉手打招呼`;
  const year = Math.floor(Number(city.year) || 0);
  const month = Math.floor(Number(city.month) || 1);
  if (typeof addCityNews === 'function') addCityNews(headline);
  return addForumPost({
    headline,
    image: 'UI/news/ufoSighting.webp',
    body: [
      `今晚${place}一帶有大批市民目擊一架不明飛行物，機身閃住紅綠黃彩燈，喺上空低飛盤旋，底部射出藍白色光柱，維持咗大約個半鐘先急速飛走。`,
      '多名目擊者話透過透明機艙見到一個綠色人形生物向地面揮手，有人仲話對方擺咗個「V」字手勢。',
      '香城天文學會發言人表示：「目前未能確定來源，但從市民提供嘅影像所見，並非常見飛行器。建議市民保持冷靜，如再發現請即拍攝記錄。」',
      again ? `呢架飛碟已經係第${sightings}次喺香城出現，有旅遊團即晚加開「UFO 觀星團」。` : '消息傳出後，不少市民即晚帶埋相機上天台等「第二次接觸」。',
    ],
    source: 'local',
    social: {
      likes: 8800,
      laughs: 4200,
      angry: 120,
      commentCount: 6400,
      shares: 5300,
      comments: [
        { author: '香城居民 A', text: '我真係親眼見到！佢喺我屋邨上空停咗幾秒，仲向我哋揮手！👽✨' },
        { author: '大埔鄉民', text: '今晚8點幾，大埔都見到！以為係直升機，點知無聲，仲有七彩燈！' },
        { author: '天文迷', text: '唔似飛機亦唔似無人機，移動方式好特別。希望有人拍到更清晰嘅片！' },
        { author: '好奇BB', text: '外星人好可愛呀！香城終於都有UFO！👽💚🌈' },
      ],
    },
  }, {
    id: `ufo-${year}-${month}`,
    category: '城中熱話',
    author: '香城目擊直擊台',
    outcome: 'ufo_sighting',
    year,
    month,
  });
}

/** The ticker's line while a saucer is up, and for the rest of its month (hud-ticker.js). */
function getUfoTickerNews() {
  if (!ufoRuntime?.announced || typeof t !== 'function') return null;
  if (typeof getCityMonthIndex === 'function' && getCityMonthIndex() !== ufoRuntime.monthIndex) return null;
  const variants = ['ufo.ticker.0', 'ufo.ticker.1', 'ufo.ticker.2', 'ufo.ticker.3'];
  ufoRuntime.tickerTurn = (ufoRuntime.tickerTurn || 0) + 1;
  return t(variants[ufoRuntime.tickerTurn % variants.length], { place: getUfoDistrictName(ufoRuntime.target) });
}

// Once a sighting begins (not in the title showcase): the record, the visitors, the story, the
// notice. A summoned one counts like any other.
function announceUfoSighting(scene, runtime) {
  const state = typeof getCityFestivalState === 'function' ? getCityFestivalState() : null;
  if (!state) return;
  state.ufo.lastMonthIndex = runtime.monthIndex;
  state.ufo.sightings = Math.max(0, Number(state.ufo.sightings) || 0) + 1;
  const year = Math.floor(Number(city.year) || 0);
  if (typeof recordFestivalHistory === 'function') recordFestivalHistory({ id: 'ufo', year, outcome: 'held' });
  if (typeof addCouncilTemporaryEffect === 'function') {
    addCouncilTemporaryEffect(`festival:ufo:${year}:${city.month}`, UFO_SIGHTING.effectMonths, { tourism: UFO_SIGHTING.tourism });
  }
  postUfoForumStory(runtime.target, state.ufo.sightings);
  const tile = getUfoTargetTile(runtime.target);
  if (typeof showFestivalNotice === 'function') {
    showFestivalNotice(t('festival.notice.ufo', { place: getUfoDistrictName(runtime.target) }), tile && typeof centerCameraOnTile === 'function'
      ? () => centerCameraOnTile(scene, Math.round(tile[0]), Math.round(tile[1])) : null);
  }
  runtime.announced = true;
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function getUfoTextureFiles() {
  const files = [];
  [...UFO_FRAME_PARTS, 'ufoBeam', 'ufoWitnesses'].forEach((id) => files.push(getFestivalTexturePath(id)));
  return files;
}

function clearUfo(scene) {
  if (!ufoRuntime) return;
  Object.values(ufoRuntime.sprites || {}).forEach((sprite) => sprite?.destroy());
  getUfoTextureFiles().forEach((file) => {
    const key = getFestivalSceneTextureKey(file);
    if (scene?.textures?.exists(key) && !scene.festivalTextureKeys?.has(key)) scene.textures.remove(key);
  });
  ufoRuntime = null;
}

function makeUfoSprite(scene, partId) {
  const sprite = scene.add.image(0, 0, getFestivalSceneTextureKey(getFestivalTexturePath(partId)));
  if (scene.worldMask) sprite.setMask(scene.worldMask);
  return sprite;
}

// Scale and origin of a baked part on its (possibly staged) texture: the anchor, or its middle.
function fitUfoSprite(sprite, partId, { scale = null, middle = false, top = false } = {}) {
  const meta = festivalTextureMeta?.[getFestivalTextureKey(partId)];
  if (!meta) return 1;
  const frame = sprite.frame;
  const mapping = typeof getModelTexturePixelMapping === 'function'
    ? getModelTexturePixelMapping(meta.file, { width: frame.width, height: frame.height })
    : { resize: 1, offsetX: 0, offsetY: 0 };
  const y = top ? meta.top : middle ? (meta.top + meta.anchor.y) / 2 : meta.anchor.y;
  sprite.setOrigin((meta.anchor.x * mapping.resize + mapping.offsetX) / frame.width, (y * mapping.resize + mapping.offsetY) / frame.height);
  const k = scale ?? getFestivalSpriteScale(meta, FESTIVAL_PARTS_BY_ID[partId], mapping.resize);
  return { k, resize: mapping.resize, meta };
}

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInQuad = (x) => x * x;

// The saucer's place this frame, relative to the point over the landmark at its height.
function getUfoOffset(phase, now) {
  const r = UFO_SIGHTING.loopRadiusPx;
  const loop = (elapsed) => {
    const angle = (elapsed / UFO_SIGHTING.loopMinutes) * Math.PI * 2;
    return { x: r * Math.cos(angle), y: r * 0.45 * Math.sin(angle) };
  };
  const bob = 7 * Math.sin(now / 420);
  if (phase.phase === 'arrive') {
    const k = easeOutCubic(phase.t);
    const end = loop(UFO_SIGHTING.arriveMinutes);
    // in from high on the left, weaving a little
    return { x: -900 * (1 - k) + end.x * k, y: -520 * (1 - k) + end.y * k + bob + 30 * Math.sin(phase.t * 9) * (1 - k), sx: 1, sy: 1, alpha: Math.min(1, phase.t * 4) };
  }
  if (phase.phase === 'hover') {
    const p = loop(phase.elapsed);
    return { x: p.x, y: p.y + bob, sx: 1, sy: 1, alpha: 1 };
  }
  // leave: a hop (squash, then up), then off to the upper right, smaller and fading
  const p = loop(UFO_SIGHTING.arriveMinutes + UFO_SIGHTING.hoverMinutes);
  if (phase.t < 0.3) {
    const h = phase.t / 0.3;
    const squash = Math.sin(h * Math.PI);
    return { x: p.x, y: p.y - 40 * Math.sin(h * Math.PI / 2) + bob, sx: 1 + 0.12 * squash, sy: 1 - 0.12 * squash, alpha: 1 };
  }
  const k = easeInQuad((phase.t - 0.3) / 0.7);
  return { x: p.x + 1500 * k, y: p.y - 40 - 900 * k, sx: 1 - 0.6 * k, sy: 1 - 0.6 * k, alpha: 1 - Math.max(0, (k - 0.7) / 0.3) };
}

function drawUfo(scene, runtime, phase, now) {
  const at = getFestivalPlacementPoint(scene, runtime.target);
  if (!at) return;
  const { sprites } = runtime;
  const altitude = UFO_SIGHTING.altitudeM * UFO_PX_PER_METRE;
  const off = getUfoOffset(phase, now);
  // the saucer: frames played back and forth, so the alien's wave runs smoothly
  const step = Math.floor(now / UFO_SIGHTING.frameMs) % (UFO_FRAME_PARTS.length * 2 - 2);
  const frameIndex = step < UFO_FRAME_PARTS.length ? step : UFO_FRAME_PARTS.length * 2 - 2 - step;
  const framePart = UFO_FRAME_PARTS[frameIndex];
  const frameKey = getFestivalSceneTextureKey(getFestivalTexturePath(framePart));
  if (sprites.ufo.texture.key !== frameKey) sprites.ufo.setTexture(frameKey);
  // all frames at the first frame's scale: they are one render, no frame may jump in size
  if (!runtime.ufoScale) runtime.ufoScale = fitUfoSprite(sprites.ufo, UFO_FRAME_PARTS[0], { middle: true }).k;
  fitUfoSprite(sprites.ufo, framePart, { scale: runtime.ufoScale, middle: true });
  const ux = at.x + off.x;
  const uy = at.y - altitude + off.y;
  sprites.ufo.setPosition(ux, uy);
  sprites.ufo.setScale(runtime.ufoScale * off.sx, runtime.ufoScale * off.sy);
  sprites.ufo.setRotation(0.05 * Math.sin(now / 650));
  sprites.ufo.setAlpha(off.alpha);
  sprites.ufo.setDepth(getWorldDepth('effect', at.y) + 2);
  sprites.ufo.setVisible(true);

  // the beam: from under the saucer to the ground below it, while it circles (fading in and out)
  const beamOn = phase.phase === 'hover' ? Math.min(1, phase.t * 12, (1 - phase.t) * 12) : 0;
  if (beamOn > 0.01) {
    const groundY = at.y + off.y;
    const topY = uy + 28;
    const fit = fitUfoSprite(sprites.beam, 'ufoBeam', { top: true });
    const lengthPx = Math.max(1, groundY - topY);
    const ky = lengthPx / ((fit.meta.anchor.y - fit.meta.top) * fit.resize);
    const kx = 70 / ((fit.meta.right - fit.meta.left) * fit.resize);
    sprites.beam.setScale(kx, ky);
    sprites.beam.setPosition(ux, topY);
    sprites.beam.setAlpha(beamOn * (0.55 + 0.15 * Math.sin(now / 260)));
    sprites.beam.setDepth(getWorldDepth('effect', at.y) + 1);
    sprites.beam.setVisible(true);
  } else {
    sprites.beam.setVisible(false);
  }

  // the residents looking up: from the circling to the getaway
  const crowd = phase.phase === 'hover' || (phase.phase === 'leave' && phase.t < 0.8);
  if (crowd) {
    const fit = fitUfoSprite(sprites.witnesses, 'ufoWitnesses');
    sprites.witnesses.setScale(fit.k);
    // beside the beam, looking up at it (not lost in its light)
    sprites.witnesses.setPosition(at.x + 46, at.y + 22);
    sprites.witnesses.setDepth(at.depth + 0.02);
    if (typeof applyNightPropTint === 'function') applyNightPropTint(scene, sprites.witnesses);
    sprites.witnesses.setVisible(true);
  } else {
    sprites.witnesses.setVisible(false);
  }
}

// Every frame (main.js): is there a sighting now, and where is the saucer.
function updateUfo(scene, time) {
  if (!scene || typeof city === 'undefined' || typeof getCityMonthIndex !== 'function') return;
  const monthIndex = getCityMonthIndex();
  const live = typeof isFestivalGameplayLive === 'function' ? isFestivalGameplayLive() : true;
  const minute = typeof getGameTimeOfDayMinutes === 'function' ? getGameTimeOfDayMinutes() : 0;
  // which sighting this month has: a summoned one, or the month's own roll (worked out once a month)
  let sighting = null;
  let key = '';
  if (ufoForced && ufoForced.monthIndex === monthIndex) {
    sighting = { startMinute: ufoForced.startMinute };
    key = `forced:${monthIndex}:${ufoForced.startMinute}`;
  } else if (isFestivalEnabled('ufo') && live) {
    if (scene.ufoScheduleMonth !== monthIndex) {
      scene.ufoScheduleMonth = monthIndex;
      const state = getCityFestivalState();
      const already = state?.ufo?.lastMonthIndex === monthIndex;
      scene.ufoSchedule = getScheduledUfoSighting({
        cityName: city.name, year: city.year, month: city.month, monthIndex,
        // a sighting already had this month (a reload mid-sighting) is drawn on, not rolled again
        lastMonthIndex: already ? -1 : state?.ufo?.lastMonthIndex,
      });
    }
    sighting = scene.ufoSchedule;
    key = sighting ? `month:${monthIndex}` : '';
  }
  const phase = getUfoPhase(sighting, minute);
  // a summoned one shows even with the UFO switched off (a test needs it to)
  if (!phase || !(key.startsWith('forced:') || isFestivalEnabled('ufo'))) {
    if (ufoRuntime && !ufoRuntime.finished) {
      // gone: keep the record of an announced one for the ticker until its month ends
      const done = ufoRuntime;
      clearUfo(scene);
      if (done.announced) ufoRuntime = { key: done.key, monthIndex: done.monthIndex, target: done.target, announced: true, sprites: {}, finished: true };
    }
    if (ufoRuntime?.finished && ufoRuntime.monthIndex !== monthIndex) ufoRuntime = null;
    return;
  }
  if (!ufoRuntime || ufoRuntime.key !== key || ufoRuntime.finished) {
    clearUfo(scene);
    // the weather is looked at as it begins: a wet or stormy night has no visitor
    if (key.startsWith('month:') && !isUfoWeatherClear()) { scene.ufoSchedule = null; return; }
    ufoRuntime = { key, monthIndex, sighting, target: pickUfoTarget(`ufo:${city.name}:${monthIndex}`), sprites: {}, loading: true };
    const runtime = ufoRuntime;
    const already = getCityFestivalState()?.ufo?.lastMonthIndex === monthIndex && key.startsWith('month:');
    loadFestivalTextureMeta().then(() => loadFestivalTextures(scene, getUfoTextureFiles())).then(() => {
      if (ufoRuntime !== runtime) return;
      runtime.sprites = {
        beam: makeUfoSprite(scene, 'ufoBeam').setBlendMode(Phaser.BlendModes.ADD),
        witnesses: makeUfoSprite(scene, 'ufoWitnesses'),
        ufo: makeUfoSprite(scene, UFO_FRAME_PARTS[0]),
      };
      runtime.loading = false;
      if (live && !already) announceUfoSighting(scene, runtime);
      else runtime.announced = already;
    });
    return;
  }
  if (ufoRuntime.loading) return;
  drawUfo(scene, ufoRuntime, phase, time);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UFO_SIGHTING, getScheduledUfoSighting, getUfoPhase, getUfoSkyMinute, getUfoOffset, isUfoWeatherClear };
}
