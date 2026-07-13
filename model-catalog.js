const EFFECTIVE_PIXEL_ALPHA_THRESHOLD = 20;
const MODEL_METADATA_CACHE_KEY = 'citybuilder:modelMetadata:v4';
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

// ── Residential ──────────────────────────────────────────────────────────────
// preferredFiles = actual disk filenames used as fallback when the API
// is unreachable AND as rank-priority order for model selection.
const HOUSE_MODEL_SETS = {
  house: {
    label: '1x1',
    folder: 'Models/residential/house1x1/',
    apiFolder: 'residential/house1x1',
    defaultFile: 'house1-01.png',
    preferredFiles: [
      'house1-01.png',
      'house1-02.png',
      'house1-03.png',
      'house1-05-highScore.png',
      'house1-06-highScore.png',
    ],
    footprintCols: 1,
    footprintRows: 1,
  },
  house2x2: {
    label: '2x2',
    folder: 'Models/residential/house2x2/',
    apiFolder: 'residential/house2x2',
    defaultFile: 'residential2-04.png',
    preferredFiles: [
      'residential2-04.png',
      'residential2-05.png',
      'residential2-06.png',
      'residential2-07.png',
      'residential2-09.png',
      'residential2-03-highScore.png',
      'residential2-11-highScore.png',
      'residential2-12-highScore.png',
      'residential2-13-highScore.png',
      'residential2-14-highScore.png',
    ],
    footprintCols: 2,
    footprintRows: 2,
  },
  house3x3: {
    label: '3x3',
    folder: 'Models/residential/house3x3/',
    apiFolder: 'residential/house3x3',
    defaultFile: 'residential3-01.png',
    preferredFiles: [
      'residential3-01.png',
      'residential3-02.png',
      'residential3-03.png',
      'residential3-04-highScore.png',
      'residential3-05-highScore.png',
      'residential3-06.png',
    ],
    footprintCols: 3,
    footprintRows: 3,
  },
  house4x4: {
    label: '4x4',
    folder: 'Models/residential/house4x4/',
    apiFolder: 'residential/house4x4',
    anchorMode: 'effective-bottom-to-map-bottom',
    alphaThreshold: EFFECTIVE_PIXEL_ALPHA_THRESHOLD,
    defaultFile: 'residential4-01.png',
    preferredFiles: [
      'residential4-01.png',
      'residential4-02.png',
    ],
    footprintCols: 4,
    footprintRows: 4,
  },
  house5x5: {
    label: '5x5',
    folder: 'Models/residential/house5x5/',
    apiFolder: 'residential/house5x5',
    anchorMode: 'effective-bottom-to-map-bottom',
    alphaThreshold: EFFECTIVE_PIXEL_ALPHA_THRESHOLD,
    defaultFile: 'residential5-01.png',
    preferredFiles: [
      'residential5-01.png',
      'residential5-02.png',
    ],
    footprintCols: 5,
    footprintRows: 5,
  },
};

// ── Commercial ───────────────────────────────────────────────────────────────
// fallbackSourceFiles = actual disk names; preferredFiles = canonical slot names.
// fileAliases maps disk → canonical so highScore detection (/highScore/i)
// works on canonical names.
const COMMERCIAL_BUILDING_MODEL_SETS = [
  {
    keyPrefix: 'commercial_building_1x1',
    folder: 'Models/commercial/1x1/',
    apiFolder: 'commercial/1x1',
    fallbackSourceFiles: [
      'commercialBuilding1-01.png',
      'commercialBuilding1-03.png',
    ],
    preferredFiles: [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding1-01.png',
      'commercialBuilding1-03.png',
    ], [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
    ]),
    footprintCols: 1,
    footprintRows: 1,
  },
  {
    keyPrefix: 'commercial_building_2x2',
    folder: 'Models/commercial/2x2/',
    apiFolder: 'commercial/2x2',
    fallbackSourceFiles: [
      'commercialBuilding2-02.png',
      'commercialBuilding2-03.png',
      'commercialBuilding2-04.png',
      'commercialBuilding2-05.png',
      'commercialBuilding2-06.png',
    ],
    preferredFiles: [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding2-02.png',
      'commercialBuilding2-03.png',
      'commercialBuilding2-04.png',
      'commercialBuilding2-05.png',
      'commercialBuilding2-06.png',
    ], [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
    ]),
    footprintCols: 2,
    footprintRows: 2,
  },
  {
    keyPrefix: 'commercial_building_3x3',
    folder: 'Models/commercial/3x3/',
    apiFolder: 'commercial/3x3',
    fallbackSourceFiles: [
      'commercialBuilding3-03.png',
      'commercialBuilding3-04.png',
      'commercialBuilding3-07.png',
      'commercialBuilding3-09.png',
      'commercialBuilding3-10.png',
      'commercialBuilding3-11.png',
      'commercialBuilding3-01-highScore.png',
      'commercialBuilding3-05-highScore.png',
      'commercialBuilding3-08-highScore.png',
    ],
    preferredFiles: [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
      'commercialBuilding06.png',
      'commercialBuilding01-highScore.png',
      'commercialBuilding02-highScore.png',
      'commercialBuilding03-highScore.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding3-03.png',
      'commercialBuilding3-04.png',
      'commercialBuilding3-07.png',
      'commercialBuilding3-09.png',
      'commercialBuilding3-10.png',
      'commercialBuilding3-11.png',
      'commercialBuilding3-01-highScore.png',
      'commercialBuilding3-05-highScore.png',
      'commercialBuilding3-08-highScore.png',
    ], [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
      'commercialBuilding06.png',
      'commercialBuilding01-highScore.png',
      'commercialBuilding02-highScore.png',
      'commercialBuilding03-highScore.png',
    ]),
    footprintCols: 3,
    footprintRows: 3,
  },
  {
    keyPrefix: 'commercial_building_4x4',
    folder: 'Models/commercial/4x4/',
    apiFolder: 'commercial/4x4',
    fallbackSourceFiles: [
      'commercialBuilding4-01-highScore.png',
      'commercialBuilding4-02-highScore.png',
    ],
    preferredFiles: [
      'commercialBuilding01-highScore.png',
      'commercialBuilding02-highScore.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding4-01-highScore.png',
      'commercialBuilding4-02-highScore.png',
    ], [
      'commercialBuilding01-highScore.png',
      'commercialBuilding02-highScore.png',
    ]),
    footprintCols: 4,
    footprintRows: 4,
  },
];

// ── Industrial ───────────────────────────────────────────────────────────────
// Note: 'sicencePark2-03.png' (typo in filename) is aliased to
// 'sciencePark03.png' so that /sciencepark/i detection still works.
// 'industrialBuilding2-.png' (malformed name) is excluded.
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
      'sciencePark01.png',
      'sciencePark02.png',
      'sciencePark03.png',
      'sciencePark04.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'industrialBuilding2-01.png',
      'industrialBuilding2-02.png',
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
];
