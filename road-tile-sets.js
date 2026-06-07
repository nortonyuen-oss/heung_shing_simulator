const ROAD_TILE_SET_DEFAULT_ID = 'classic';

const ROAD_TILE_LOGICAL_FILES = {
  road_straight_h: 'roadNS.png',
  road_straight_v: 'roadEW.png',
  road_cross: 'crossroad.png',
  road_corner_ne: 'roadES.png',
  road_corner_nw: 'roadNE.png',
  road_corner_se: 'roadSW.png',
  road_corner_sw: 'roadNW.png',
  road_t_n: 'crossroadNES.png',
  road_t_e: 'crossroadESW.png',
  road_t_s: 'crossroadNSW.png',
  road_t_w: 'crossroadNEW.png',
  road_hill_n: 'roadHillE.png',
  road_hill_e: 'roadHillS.png',
  road_hill_s: 'roadHillW.png',
  road_hill_w: 'roadHillN.png',
  road_hill2_n: 'roadHill2E.png',
  road_hill2_e: 'roadHill2S.png',
  road_hill2_s: 'roadHill2W.png',
  road_hill2_w: 'roadHill2N.png',
  road_end_n: 'endW.png',
  road_end_e: 'endN.png',
  road_end_s: 'endE.png',
  road_end_w: 'endS.png',
  road_isolated: 'road.png',
  road_bridge_h: 'bridgeNS_iso21_shoulders_top.png',
  road_bridge_v: 'bridgeEW_iso21_shoulders_top.png',
};

const NEW_ROAD_TILE_LOGICAL_FILES = {
  road_straight_h: 'roadNS_fixed.png',
  road_straight_v: 'roadEW_fixed.png',
  road_cross: 'crossRoad_fixed.png',
  road_corner_ne: 'roadES_fixed.png',
  road_corner_nw: 'roadNE_fixed.png',
  road_corner_se: 'roadSW_fixed.png',
  road_corner_sw: 'roadNW_fixed.png',
  road_t_n: 'crossroadNES_fixed.png',
  road_t_e: 'crossroadESW_fixed.png',
  road_t_s: 'crossroadNSW_fixed.png',
  road_t_w: 'crossroadNEW_fixed.png',
  road_hill_n: 'roadHillE_fixed.png',
  road_hill_e: 'roadHillS_fixed.png',
  road_hill_s: 'roadHillW_fixed.png',
  road_hill_w: 'roadHillN_fixed.png',
  road_hill2_n: 'roadHill2E_fixed.png',
  road_hill2_e: 'roadHill2S_fixed.png',
  road_hill2_s: 'roadHill2W_fixed.png',
  road_hill2_w: 'roadHill2N_fixed.png',
  road_end_n: 'endW_fixed.png',
  road_end_e: 'endN_fixed.png',
  road_end_s: 'endE_fixed.png',
  road_end_w: 'endS_fixed.png',
  road_isolated: 'road_fixed.png',
  road_bridge_h: 'bridgeNS_iso21_shoulders_top_fixed.png',
  road_bridge_v: 'bridgeEW_iso21_shoulders_top_fixed.png',
};

const ROAD_TILE_SETS = [
  {
    id: 'classic',
    texturePrefix: 'roads_classic',
    folder: 'kenney_isometric-roads/png/',
    labelKey: 'roadTileSet.classic',
    descriptionKey: 'roadTileSet.classicDesc',
    canvasWidth: 100,
    canvasHeight: 65,
    renderScale: 1,
    bridgeRampMode: 'hill2',
    files: ROAD_TILE_LOGICAL_FILES,
  },
  {
    id: 'newRoadTiles',
    texturePrefix: 'roads_new',
    folder: 'newRoadTiles/',
    labelKey: 'roadTileSet.new',
    descriptionKey: 'roadTileSet.newDesc',
    canvasWidth: 160,
    canvasHeight: 80,
    renderScale: 1,
    bridgeRampMode: 'hill2',
    files: NEW_ROAD_TILE_LOGICAL_FILES,
  },
];

let currentRoadTileSetId = ROAD_TILE_SET_DEFAULT_ID;

function getRoadTileSets() {
  return ROAD_TILE_SETS;
}

function getRoadTileSet(id = currentRoadTileSetId) {
  return ROAD_TILE_SETS.find((set) => set.id === id) ?? ROAD_TILE_SETS[0];
}

function normalizeRoadTileSetId(id) {
  return getRoadTileSet(id).id;
}

function setCurrentRoadTileSetId(id) {
  currentRoadTileSetId = normalizeRoadTileSetId(id);
  return currentRoadTileSetId;
}

function getCurrentRoadTileSetId() {
  return currentRoadTileSetId;
}

function isRoadTileLogicalKey(logicalKey) {
  return Object.prototype.hasOwnProperty.call(ROAD_TILE_LOGICAL_FILES, logicalKey);
}

function getRoadTileTextureKey(logicalKey, tileSetId = currentRoadTileSetId) {
  if (!isRoadTileLogicalKey(logicalKey)) return logicalKey;
  const set = getRoadTileSet(tileSetId);
  return `${set.texturePrefix}_${logicalKey}`;
}

function getRoadTileAssetPath(logicalKey, tileSetId = currentRoadTileSetId) {
  if (!isRoadTileLogicalKey(logicalKey)) return null;
  const set = getRoadTileSet(tileSetId);
  const file = set.files?.[logicalKey] ?? ROAD_TILE_LOGICAL_FILES[logicalKey];
  return `${set.folder}${file}`;
}

function getRoadTileSetBridgeRampMode(tileSetId = currentRoadTileSetId) {
  return getRoadTileSet(tileSetId).bridgeRampMode ?? 'hill2';
}

function getRoadTilePreviewAssets(tileSetId = currentRoadTileSetId) {
  return [
    getRoadTileAssetPath('road_straight_h', tileSetId),
    getRoadTileAssetPath('road_cross', tileSetId),
    getRoadTileAssetPath('road_bridge_h', tileSetId),
  ].filter(Boolean);
}
