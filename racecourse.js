// 沙田馬場 (第 6 章): Norton's render (2026-11-21) on a 6x12 lot, built as two 6x6 halves that join -
// two buildingData records of type 'racecourse', each naming the other (racecoursePartner).
// Norton: 「馬場我想用6*12，把我給妳的你從中間剪開兩份6*6，然後在遊戲組合」, 「join要睇方向，唔好兩邊拼唔埋」,
// 「切開兩半之後都要做鏡像」.
//
// The art (scripts/source-art/artDebt/fit_racecourse.py) is the lot seen with its long side running
// up-right on screen; each half has a mirror for when it runs up-left. Whichever way the map is turned,
// the half nearer the viewer shows the front half's art and the other the back half's, plain or mirrored
// by the way the long side runs on screen - so the grandstand stays behind the track (as every building
// keeps its face to the viewer) and the two halves always meet. Each half carries half the racecourse's
// effects (constants.js SPECIAL_BUILDING_EFFECTS.racecourse).

const RACECOURSE_HALF_TILES = 6;
const RACECOURSE_ART = Object.freeze({
  front: 'racecourse_6x6a', back: 'racecourse_6x6b',
  frontMirror: 'racecourse_6x6a_m', backMirror: 'racecourse_6x6b_m',
});
let racecourseStamp = '';

// The 6x12 lot at this turn of the map: its long side running up-right on screen, as drawn.
function getRacecourseFootprint() {
  const from = isoToScreen(0, 0);
  const to = isoToScreen(1, 0);
  const colsRunUpRight = (to.x - from.x > 0) !== (to.y - from.y > 0);
  const long = RACECOURSE_HALF_TILES * 2;
  return colsRunUpRight
    ? { footprintCols: long, footprintRows: RACECOURSE_HALF_TILES }
    : { footprintCols: RACECOURSE_HALF_TILES, footprintRows: long };
}

// The two halves' anchor tiles of a lot placed at (row, col).
function getRacecourseHalves(row, col, footprintCols, footprintRows) {
  return footprintCols > footprintRows
    ? [[row, col], [row, col + RACECOURSE_HALF_TILES]]
    : [[row, col], [row + RACECOURSE_HALF_TILES, col]];
}

// The art each half shows now: [key for (rowA, colA), key for (rowB, colB)].
function getRacecourseHalfArt(rowA, colA, rowB, colB) {
  const a = getBuildingAnchor(rowA, colA, RACECOURSE_HALF_TILES, RACECOURSE_HALF_TILES);
  const b = getBuildingAnchor(rowB, colB, RACECOURSE_HALF_TILES, RACECOURSE_HALF_TILES);
  const aInFront = a.y > b.y;
  const front = aInFront ? a : b;
  const back = aInFront ? b : a;
  const asDrawn = front.x < back.x;
  const frontKey = asDrawn ? RACECOURSE_ART.front : RACECOURSE_ART.frontMirror;
  const backKey = asDrawn ? RACECOURSE_ART.back : RACECOURSE_ART.backMirror;
  return aInFront ? [frontKey, backKey] : [backKey, frontKey];
}

function whyNotRacecourse(row, col) {
  const { footprintCols, footprintRows } = getRacecourseFootprint();
  return canPlaceBuildingFootprint(row, col, footprintCols, footprintRows) ? '' : t('mobile.blocked');
}

function getRacecourseRecordOptions(key) {
  const model = getSpecialBuildingModelBySpriteKey(key);
  const opts = (typeof specialBuildingModelMetadata !== 'undefined' ? specialBuildingModelMetadata[key] : null) ?? model;
  return { model, opts };
}

// Both halves at once, on a lot the tool's quote has already found clear (tools.js placeInfraBuilding).
function placeRacecourse(scene, row, col) {
  const { footprintCols, footprintRows } = getRacecourseFootprint();
  const [[rowA, colA], [rowB, colB]] = getRacecourseHalves(row, col, footprintCols, footprintRows);
  const art = getRacecourseHalfArt(rowA, colA, rowB, colB);
  [[rowA, colA, art[0], getTileId(rowB, colB)], [rowB, colB, art[1], getTileId(rowA, colA)]].forEach(([r, c, key, partner]) => {
    const { model, opts } = getRacecourseRecordOptions(key);
    placeSpriteBuilding(scene, r, c, key, opts);
    buildingData[getTileId(r, c)] = {
      type: 'racecourse',
      level: 1,
      population: 0,
      age: 0,
      spriteKey: key,
      assetId: model.path,
      footprintCols: RACECOURSE_HALF_TILES,
      footprintRows: RACECOURSE_HALF_TILES,
      racecoursePartner: partner,
      originX: opts.originX,
      originY: opts.originY,
      scale: opts.scale,
      scaleX: opts.scaleX,
      scaleY: opts.scaleY,
      offsetX: opts.offsetX,
      offsetY: opts.offsetY,
      anchorMode: opts.anchorMode,
    };
  });
  racecourseStamp = '';
  return true;
}

// One half bulldozed takes the other with it (building-placement.js removeBuilding).
function removeRacecoursePartner(scene, partnerId, options = {}) {
  if (buildingData[partnerId]?.type !== 'racecourse') return;
  const [row, col] = partnerId.split(':').map(Number);
  removeBuilding(scene, row, col, options);
}

// Each frame: re-pick the halves' art when the map turns or a racecourse comes or goes.
function updateRacecourses(scene) {
  if (!scene?.buildingSprites || typeof buildingData === 'undefined') return;
  const count = typeof getBuildingCount === 'function' ? getBuildingCount('racecourse') : 0;
  const stamp = count ? `${mapRotation}|${count}` : '';
  if (stamp === racecourseStamp) return;
  racecourseStamp = stamp;
  if (count) refreshRacecourseSprites(scene);
}

function refreshRacecourseSprites(scene) {
  const seen = new Set();
  Object.entries(buildingData).forEach(([id, record]) => {
    if (record?.type !== 'racecourse' || seen.has(id)) return;
    const partnerId = record.racecoursePartner;
    const partner = buildingData[partnerId];
    seen.add(id);
    if (partner?.type !== 'racecourse') return;
    seen.add(partnerId);
    const [rowA, colA] = id.split(':').map(Number);
    const [rowB, colB] = partnerId.split(':').map(Number);
    const art = getRacecourseHalfArt(rowA, colA, rowB, colB);
    setRacecourseHalfArt(scene, id, record, art[0]);
    setRacecourseHalfArt(scene, partnerId, partner, art[1]);
  });
}

function setRacecourseHalfArt(scene, id, record, key) {
  if (record.spriteKey === key) return;
  const { model, opts } = getRacecourseRecordOptions(key);
  if (!model) return;
  const sprite = scene.buildingSprites.get(id);
  if (sprite && !scene.textures.exists(key)) {
    // the browser fetches building art on demand: turn this half once its art is in, its partner with it
    if (typeof requestZoneModelTexture === 'function' && typeof getFixedBuildingModelLoadPath === 'function') {
      requestZoneModelTexture(scene, { key, path: getFixedBuildingModelLoadPath(model) }, (loaded) => {
        if (loaded) refreshRacecourseSprites(scene);
      }, { sprite });
    }
    return;
  }
  Object.assign(record, {
    spriteKey: key, assetId: model.path,
    originX: opts.originX, originY: opts.originY, scale: opts.scale, scaleX: opts.scaleX, scaleY: opts.scaleY,
    offsetX: opts.offsetX, offsetY: opts.offsetY, anchorMode: opts.anchorMode,
  });
  if (!sprite) return;
  sprite.setTexture(key);
  sprite.__dayTextureKey = null;
  sprite.skipNightTint = false;
  if (typeof markBuildingNightArtDirty === 'function') markBuildingNightArtDirty(scene);
  sprite.setOrigin(opts.originX ?? 0.5, opts.originY ?? 1);
  if (opts.scaleX || opts.scaleY) sprite.setScale(opts.scaleX ?? opts.scale ?? 1, opts.scaleY ?? opts.scale ?? 1);
  else if (opts.scale) sprite.setScale(opts.scale);
  sprite.spriteOffsetX = opts.offsetX ?? 0;
  sprite.spriteOffsetY = opts.offsetY ?? 0;
  sprite.anchorMode = opts.anchorMode;
  if (typeof positionBuilding === 'function') positionBuilding(scene, sprite);
}

if (typeof module !== 'undefined') {
  module.exports = { getRacecourseFootprint, getRacecourseHalves, getRacecourseHalfArt, RACECOURSE_ART };
}
