const EFFECTIVE_PIXEL_ALPHA_THRESHOLD = 20;
// Bump whenever same-name model artwork is replaced. Alpha bounds and anchor
// metadata depend on the pixels, not only on the filename or canvas dimensions.
const MODEL_METADATA_CACHE_KEY = 'citybuilder:modelMetadata:v10';
const INITIAL_ZONE_MODELS_PER_FOOTPRINT = 1;

function buildSequentialFileAliases(sourceFileNames, canonicalFileNames) {
  const aliases = {};
  const safeSourceFileNames = (Array.isArray(sourceFileNames) ? sourceFileNames : [])
    .filter((fileName) => typeof fileName === 'string' && fileName.trim().length > 0);
  const safeCanonicalFileNames = (Array.isArray(canonicalFileNames) ? canonicalFileNames : [])
    .filter((fileName) => typeof fileName === 'string' && fileName.trim().length > 0);

  safeSourceFileNames.forEach((sourceFileName, index) => {
    aliases[sourceFileName] = safeCanonicalFileNames[index]
      ?? safeCanonicalFileNames[safeCanonicalFileNames.length - 1]
      ?? sourceFileName;
  });

  return aliases;
}

function getModelFileAlias(fileName, aliases = {}) {
  const direct = aliases[fileName];
  if (direct) return direct;
  const extension = String(fileName ?? '').match(/\.[^.]+$/)?.[0] ?? '';
  const baseName = String(fileName ?? '').replace(/\.[^.]+$/, '');
  const match = Object.entries(aliases).find(([source]) => source.replace(/\.[^.]+$/, '') === baseName);
  if (!match) return fileName;
  return match[1].replace(/\.[^.]+$/, extension);
}

function isDisabledModelFile(fileName, disabledFiles = []) {
  const baseName = String(fileName ?? '').replace(/\.[^.]+$/, '');
  return disabledFiles.some((disabled) => (
    disabled === fileName || String(disabled).replace(/\.[^.]+$/, '') === baseName
  ));
}

function isScienceParkModelFileName(fileName) {
  return /(?:sciencepark|sicencepark)/i.test(String(fileName ?? ''));
}

function isScienceParkModel(model) {
  return [model?.sourceFileName, model?.fileName, model?.logicalPath, model?.assetId]
    .some(isScienceParkModelFileName);
}

// ── Residential ──────────────────────────────────────────────────────────────
// preferredFiles = actual disk filenames used as fallback when the API
// is unreachable AND as rank-priority order for model selection.
const RESIDENTIAL_WEALTH_TIERS = Object.freeze(['L', 'M', 'H', 'UH']);

function getResidentialWealthTierFromFileName(fileName) {
  const match = String(fileName ?? '').match(/-(UH|H|M|L)\.(?:png|webp|jpe?g)$/i);
  return match ? match[1].toUpperCase() : null;
}

function getCommercialTierFromFileName(fileName) {
  const match = String(fileName ?? '').match(/-(UH|H|M|L)\.(?:png|webp|jpe?g)$/i);
  return match ? match[1].toUpperCase() : null;
}

const HOUSE_MODEL_SETS = {
  house: {
    label: '1x1',
    folder: 'Models/residential/house1x1/',
    apiFolder: 'residential/house1x1',
    modelKind: 'residential',
    defaultFile: 'house1-01-L.png',
    preferredFiles: [
      'house1-01-L.png',
      'house1-02-L.png',
      'house1-03-L.png',
      'house1-05-H.png',
      'house1-06-H.png',
    ],
    footprintCols: 1,
    footprintRows: 1,
  },
  house2x2: {
    label: '2x2',
    folder: 'Models/residential/house2x2/',
    apiFolder: 'residential/house2x2',
    modelKind: 'residential',
    defaultFile: 'residential2-04-L.png',
    preferredFiles: [
      'residential2-04-L.png',
      'residential2-05-L.png',
      'residential2-06-M.png',
      'residential2-07-M.png',
      'residential2-09-UH.png',
      'residential2-03-UH.png',
      'residential2-11-H.png',
      'residential2-12-UH.png',
      'residential2-13-UH.png',
      'residential2-14-UH.png',
      'residential2-01-M.png',
      'residential2-02-M.png',
      'residential2-15-H.png',
      'residential2-16-H.png',
      'residential2-17-H.png',
      'residential2-18-H.png',
      'residential2-10-H.png',
    ],
    footprintCols: 2,
    footprintRows: 2,
  },
  house3x3: {
    label: '3x3',
    folder: 'Models/residential/house3x3/',
    apiFolder: 'residential/house3x3',
    modelKind: 'residential',
    defaultFile: 'residential3-01-L.png',
    preferredFiles: [
      'residential3-01-L.png',
      'residential3-02-L.png',
      'residential3-03-H.png',
      'residential3-04-H.png',
      'residential3-05-UH.png',
      'residential3-06-L.png',
      'residential3-07-M.png',
      'residential3-08-M.png',
      'residential3-12-H.png',
      'residential3-14-M.png',
    ],
    footprintCols: 3,
    footprintRows: 3,
  },
  house4x4: {
    label: '4x4',
    folder: 'Models/residential/house4x4/',
    apiFolder: 'residential/house4x4',
    modelKind: 'residential',
    anchorMode: 'effective-bottom-to-map-bottom',
    alphaThreshold: EFFECTIVE_PIXEL_ALPHA_THRESHOLD,
    defaultFile: 'residential4-01-M.png',
    preferredFiles: [
      'residential4-01-M.png',
      'residential4-02-M.png',
    ],
    footprintCols: 4,
    footprintRows: 4,
  },
  house5x5: {
    label: '5x5',
    folder: 'Models/residential/house5x5/',
    apiFolder: 'residential/house5x5',
    modelKind: 'residential',
    anchorMode: 'effective-bottom-to-map-bottom',
    alphaThreshold: EFFECTIVE_PIXEL_ALPHA_THRESHOLD,
    defaultFile: 'residential5-01-H.png',
    preferredFiles: [
      'residential5-01-H.png',
      'residential5-02-H.png',
      'residential5-03-L.png',
    ],
    footprintCols: 5,
    footprintRows: 5,
  },
};

// ── Commercial ───────────────────────────────────────────────────────────────
// Commercial filenames carry their L/M/H/UH grade directly. preferredFiles
// preserves the historical slot order so older saves keep the same sprite key.
const COMMERCIAL_BUILDING_MODEL_SETS = [
  {
    keyPrefix: 'commercial_building_1x1',
    folder: 'Models/commercial/1x1/',
    apiFolder: 'commercial/1x1',
    modelKind: 'commercial',
    fallbackSourceFiles: [
      'commercialBuilding1-01-L.png',
      'commercialBuilding1-03-L.png',
      'commercialBuilding1-04-M.png',
      'commercialBuilding1-05-L.png',
    ],
    preferredFiles: [
      'commercialBuilding1-01-L.png',
      'commercialBuilding1-03-L.png',
      'commercialBuilding1-04-M.png',
      'commercialBuilding1-05-L.png',
    ],
    footprintCols: 1,
    footprintRows: 1,
  },
  {
    keyPrefix: 'commercial_building_2x2',
    folder: 'Models/commercial/2x2/',
    apiFolder: 'commercial/2x2',
    modelKind: 'commercial',
    fallbackSourceFiles: [
      'commercialBuilding2-02-H.png',
      'commercialBuilding2-03-M.png',
      'commercialBuilding2-04-M.png',
      'commercialBuilding2-05-L.png',
      'commercialBuilding2-06-L.png',
    ],
    preferredFiles: [
      'commercialBuilding2-02-H.png',
      'commercialBuilding2-03-M.png',
      'commercialBuilding2-04-M.png',
      'commercialBuilding2-05-L.png',
      'commercialBuilding2-06-L.png',
    ],
    footprintCols: 2,
    footprintRows: 2,
  },
  {
    keyPrefix: 'commercial_building_3x3',
    folder: 'Models/commercial/3x3/',
    apiFolder: 'commercial/3x3',
    modelKind: 'commercial',
    fallbackSourceFiles: [
      'commercialBuilding3-03-M.png',
      'commercialBuilding3-04-H.png',
      'commercialBuilding3-07-M.png',
      'commercialBuilding3-09-M.png',
      'commercialBuilding3-10-M.png',
      'commercialBuilding3-11-H.png',
      'commercialBuilding3-01-H.png',
      'commercialBuilding3-05-UH.png',
      'commercialBuilding3-08-H.png',
      'commercialBuilding3-12-M.png',
      'commercialBuilding3-13-H.png',
    ],
    preferredFiles: [
      'commercialBuilding3-03-M.png',
      'commercialBuilding3-04-H.png',
      'commercialBuilding3-07-M.png',
      'commercialBuilding3-09-M.png',
      'commercialBuilding3-10-M.png',
      'commercialBuilding3-11-H.png',
      'commercialBuilding3-01-H.png',
      'commercialBuilding3-05-UH.png',
      'commercialBuilding3-08-H.png',
      'commercialBuilding3-12-M.png',
      'commercialBuilding3-13-H.png',
    ],
    footprintCols: 3,
    footprintRows: 3,
  },
  {
    keyPrefix: 'commercial_building_4x4',
    folder: 'Models/commercial/4x4/',
    apiFolder: 'commercial/4x4',
    modelKind: 'commercial',
    fallbackSourceFiles: [
      'commercialBuilding4-01-H.png',
      'commercialBuilding4-02-H.png',
    ],
    preferredFiles: [
      'commercialBuilding4-01-H.png',
      'commercialBuilding4-02-H.png',
    ],
    footprintCols: 4,
    footprintRows: 4,
  },
  {
    keyPrefix: 'commercial_building_5x5',
    folder: 'Models/commercial/5x5/',
    apiFolder: 'commercial/5x5',
    modelKind: 'commercial',
    fallbackSourceFiles: ['commercialBuilding5-01-UH.png'],
    preferredFiles: ['commercialBuilding5-01-UH.png'],
    footprintCols: 5,
    footprintRows: 5,
  },
];

// ── Industrial ───────────────────────────────────────────────────────────────
// Note: 'sicencePark2-03.png' (typo in filename) is aliased to
// 'sciencePark03.png' so that /sciencepark/i detection still works.
// 'industrialBuilding2-.png' (malformed name) and sciencePark3-02 (retired
// after repeated display failures) are excluded in both PNG and WebP modes.
const INDUSTRIAL_BUILDING_MODEL_SETS = [
  {
    keyPrefix: 'industrial_building_1x1',
    folder: 'Models/industrial/1x1/',
    apiFolder: 'industrial/1x1',
    fallbackSourceFiles: [
      'industrialBuilding1-01.png',
      'industrialBuilding1-02.png',
    ],
    preferredFiles: [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'industrialBuilding1-01.png',
      'industrialBuilding1-02.png',
    ], [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
    ]),
    footprintCols: 1,
    footprintRows: 1,
  },
  {
    keyPrefix: 'industrial_building_2x2',
    folder: 'Models/industrial/2x2/',
    apiFolder: 'industrial/2x2',
    fallbackSourceFiles: [
      'industrialBuilding2-01.png',
      'industrialBuilding2-02.png',
      'industrialBuilding2-03.png',
      'industrialBuilding2-04.png',
      'industrialBuilding2-05.png',
      'industrialBuilding2-06.png',
      'industrialBuilding2-07.png',
      'sciencePark2-01.png',
      'sciencePark2-02.png',
      'sicencePark2-03.png',
      'sciencePark2-04.png',
    ],
    preferredFiles: [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'industrialBuilding03.png',
      'industrialBuilding04.png',
      'industrialBuilding05.png',
      'industrialBuilding06.png',
      'industrialBuilding07.png',
      'sciencePark01.png',
      'sciencePark02.png',
      'sciencePark03.png',
      'sciencePark04.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'industrialBuilding2-01.png',
      'industrialBuilding2-02.png',
      'industrialBuilding2-03.png',
      'industrialBuilding2-04.png',
      'industrialBuilding2-05.png',
      'industrialBuilding2-06.png',
      'industrialBuilding2-07.png',
      'sciencePark2-01.png',
      'sciencePark2-02.png',
      'sicencePark2-03.png',
      'sciencePark2-04.png',
    ], [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'industrialBuilding03.png',
      'industrialBuilding04.png',
      'industrialBuilding05.png',
      'industrialBuilding06.png',
      'industrialBuilding07.png',
      'sciencePark01.png',
      'sciencePark02.png',
      'sciencePark03.png',
      'sciencePark04.png',
    ]),
    disabledFiles: ['industrialBuilding2-.png'],
    footprintCols: 2,
    footprintRows: 2,
  },
  {
    keyPrefix: 'industrial_building_3x3',
    folder: 'Models/industrial/3x3/',
    apiFolder: 'industrial/3x3',
    fallbackSourceFiles: [
      'industrialBuilding3-01.png',
      'industrialBuilding3-02.png',
      'sciencePark3-01.png',
      'sciencePark3-02.png',
    ],
    preferredFiles: [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'sciencePark01.png',
      'sciencePark02.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'industrialBuilding3-01.png',
      'industrialBuilding3-02.png',
      'sciencePark3-01.png',
      'sciencePark3-02.png',
    ], [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'sciencePark01.png',
      'sciencePark02.png',
    ]),
    disabledFiles: ['sciencePark3-02.png'],
    footprintCols: 3,
    footprintRows: 3,
  },
];

const TREE_SPECIES = [
  { id: 'banyan',     shortKey: 'tree02', tallKey: 'tree01', hillWeight: 1 },
  { id: 'broadleaf',  shortKey: 'tree05', tallKey: 'tree03', hillWeight: 2 },
  { id: 'fruitTree',  shortKey: 'tree04', tallKey: 'tree04', hillWeight: 1 },
  { id: 'whiteBark',  shortKey: 'tree08', tallKey: 'tree07', hillWeight: 4 },
  { id: 'autumn',     shortKey: 'tree09', tallKey: 'tree09', hillWeight: 3 },
  { id: 'cherry',     shortKey: 'tree10', tallKey: 'tree10', hillWeight: 1 },
  { id: 'flameTr',    shortKey: 'tree12', tallKey: 'tree11', hillWeight: 2 },
  { id: 'jacaranda',  shortKey: 'tree14', tallKey: 'tree13', hillWeight: 1 },
  { id: 'palmLeaf',   shortKey: 'tree06', tallKey: 'tree06', hillWeight: 3 },
  { id: 'hillGreen',  shortKey: 'tree15', tallKey: 'tree15', hillWeight: 4 },
];

const MUSIC_TRACKS = [
  {
    key: 'music_title',
    title: 'Skyline Serenade (Sim City Theme)',
    file: 'Music/Skyline Serenade (Sim City Theme).mp3',
  },
  {
    key: 'music_0',
    title: 'Tactile City Nights',
    file: 'Music/Tactile City Nights.mp3',
  },
  {
    key: 'music_1',
    title: 'Concrete Symphony',
    file: 'Music/Concrete_Symphony.mp3',
  },
  {
    key: 'music_2',
    title: 'Concrete Symphony 2',
    file: 'Music/Concrete Symphony 2.mp3',
  },
  {
    key: 'music_3',
    title: 'Loopside Harbor',
    file: 'Music/Loopside Harbor.mp3',
  },
  {
    key: 'music_4',
    title: 'Loopside Harbor 2',
    file: 'Music/Loopside Harbor 2.mp3',
  },
  {
    key: 'music_5',
    title: 'Velvet Booth Loop',
    file: 'Music/Velvet Booth Loop.mp3',
  },
  {
    key: 'music_6',
    title: 'Velvet Booth Loop 2',
    file: 'Music/Velvet Booth Loop 2.mp3',
  },
  {
    key: 'music_7',
    title: 'City Pulse',
    file: 'Music/City Pulse.mp3',
  },
];
