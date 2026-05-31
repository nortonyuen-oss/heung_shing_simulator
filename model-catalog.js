const EFFECTIVE_PIXEL_ALPHA_THRESHOLD = 20;
const MODEL_METADATA_CACHE_KEY = 'citybuilder:modelMetadata:v3';
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
    defaultFile: 'house1-01_fixed.png',
    preferredFiles: [
      'house1-01_fixed.png',
      'house1-02_fixed.png',
      'house1-03_fixed.png',
      'house1-06_fixed.png',
      'house1-04-highScore_fixed.png',
      'house1-05-highScore_fixed.png',
    ],
    footprintCols: 1,
    footprintRows: 1,
  },
  house2x2: {
    label: '2x2',
    folder: 'Models/residential/house2x2/',
    apiFolder: 'residential/house2x2',
    defaultFile: 'residential2-02_fixed.png',
    preferredFiles: [
      'residential2-02_fixed.png',
      'residential2-04_fixed.png',
      'residential2-05_fixed.png',
      'residential2-06_fixed.png',
      'residential2-07_fixed.png',
      'residential2-08_fixed.png',
      'residential2-09_fixed.png',
      'residential2-03-highScore_fixed.png',
      'residential2-10-highScore_fixed.png',
      'residential2-11-highScore_fixed.png',
      'residential2-12-highScore_fixed.png',
      'residential2-13-highScore_fixed.png',
    ],
    footprintCols: 2,
    footprintRows: 2,
  },
  house3x3: {
    label: '3x3',
    folder: 'Models/residential/house3x3/',
    apiFolder: 'residential/house3x3',
    defaultFile: 'residential3-01_fixed.png',
    preferredFiles: [
      'residential3-01_fixed.png',
      'residential3-02_fixed.png',
      'residential3-03_fixed.png',
      'residential3-04-highScore_fixed.png',
      'residential3-05-highScore_fixed.png',
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
    defaultFile: 'residential4-01_fixed.png',
    preferredFiles: [
      'residential4-01_fixed.png',
      'residential4-02_fixed.png',
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
    defaultFile: 'residential5-01_fixed.png',
    preferredFiles: [
      'residential5-01_fixed.png',
      'residential5-02_fixed.png',
    ],
    footprintCols: 5,
    footprintRows: 5,
  },
};

// Legacy fallback: house1x4 no longer exists in new assets.
// Kept so old save files that reference it don't crash at load time.
const HOUSE_MODEL_SETS_LEGACY = {
  house1x4: {
    label: '1x4',
    folder: 'Models/residential/house1x4/',
    apiFolder: 'residential/house1x4',
    defaultFile: 'longPublicHousing.png',
    preferredFiles: ['longPublicHousing.png'],
    footprintCols: 4,
    footprintRows: 1,
  },
};

// ── Commercial ───────────────────────────────────────────────────────────────
// fallbackSourceFiles = actual disk names; preferredFiles = canonical slot names.
// fileAliases maps disk → canonical so highScore detection (/highScore/i)
// works on canonical names even though disk files use _fixed suffix.
const COMMERCIAL_BUILDING_MODEL_SETS = [
  {
    keyPrefix: 'commercial_building_1x1',
    folder: 'Models/commercial/1x1/',
    apiFolder: 'commercial/1x1',
    fallbackSourceFiles: [
      'commercialBuilding1-01_fixed.png',
      'commercialBuilding1-02_fixed.png',
      'commercialBuilding1-03_fixed.png',
      'commercialBuilding1-04_fixed.png',
    ],
    preferredFiles: [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding1-01_fixed.png',
      'commercialBuilding1-02_fixed.png',
      'commercialBuilding1-03_fixed.png',
      'commercialBuilding1-04_fixed.png',
    ], [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
    ]),
    footprintCols: 1,
    footprintRows: 1,
  },
  {
    keyPrefix: 'commercial_building_2x2',
    folder: 'Models/commercial/2x2/',
    apiFolder: 'commercial/2x2',
    fallbackSourceFiles: [
      'commercialBuilding2-01_fixed.png',
      'commercialBuilding2-02_fixed.png',
      'commercialBuilding2-03_fixed.png',
      'commercialBuilding2-04_fixed.png',
      'commercialBuilding2-05_fixed.png',
      'commercialBuilding2-06_fixed.png',
      'commercialBuilding2-07_fixed.png',
    ],
    preferredFiles: [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
      'commercialBuilding06.png',
      'commercialBuilding07.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding2-01_fixed.png',
      'commercialBuilding2-02_fixed.png',
      'commercialBuilding2-03_fixed.png',
      'commercialBuilding2-04_fixed.png',
      'commercialBuilding2-05_fixed.png',
      'commercialBuilding2-06_fixed.png',
      'commercialBuilding2-07_fixed.png',
    ], [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
      'commercialBuilding06.png',
      'commercialBuilding07.png',
    ]),
    footprintCols: 2,
    footprintRows: 2,
  },
  {
    keyPrefix: 'commercial_building_3x3',
    folder: 'Models/commercial/3x3/',
    apiFolder: 'commercial/3x3',
    fallbackSourceFiles: [
      'commercialBuilding3-02_fixed.png',
      'commercialBuilding3-03_fixed.png',
      'commercialBuilding3-04_fixed.png',
      'commercialBuilding3-07_fixed.png',
      'commercialBuilding3-09_fixed.png',
      'commercialBuilding3-10_fixed.png',
      'commercialBuilding3-11_fixed.png',
      'commercialBuilding3-01-highScore_fixed.png',
      'commercialBuilding3-05-highScore_fixed.png',
      'commercialBuilding3-06-highScore_fixed.png',
      'commercialBuilding3-08-highScore_fixed.png',
    ],
    preferredFiles: [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
      'commercialBuilding06.png',
      'commercialBuilding07.png',
      'commercialBuilding01-highScore.png',
      'commercialBuilding02-highScore.png',
      'commercialBuilding03-highScore.png',
      'commercialBuilding04-highScore.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding3-02_fixed.png',
      'commercialBuilding3-03_fixed.png',
      'commercialBuilding3-04_fixed.png',
      'commercialBuilding3-07_fixed.png',
      'commercialBuilding3-09_fixed.png',
      'commercialBuilding3-10_fixed.png',
      'commercialBuilding3-11_fixed.png',
      'commercialBuilding3-01-highScore_fixed.png',
      'commercialBuilding3-05-highScore_fixed.png',
      'commercialBuilding3-06-highScore_fixed.png',
      'commercialBuilding3-08-highScore_fixed.png',
    ], [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
      'commercialBuilding06.png',
      'commercialBuilding07.png',
      'commercialBuilding01-highScore.png',
      'commercialBuilding02-highScore.png',
      'commercialBuilding03-highScore.png',
      'commercialBuilding04-highScore.png',
    ]),
    footprintCols: 3,
    footprintRows: 3,
  },
  {
    keyPrefix: 'commercial_building_4x4',
    folder: 'Models/commercial/4x4/',
    apiFolder: 'commercial/4x4',
    fallbackSourceFiles: [
      'commercialBuilding4-01-highScore_fixed.png',
      'commercialBuilding4-02-highScore_fixed.png',
    ],
    preferredFiles: [
      'commercialBuilding01-highScore.png',
      'commercialBuilding02-highScore.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding4-01-highScore_fixed.png',
      'commercialBuilding4-02-highScore_fixed.png',
    ], [
      'commercialBuilding01-highScore.png',
      'commercialBuilding02-highScore.png',
    ]),
    footprintCols: 4,
    footprintRows: 4,
  },
];

// ── Industrial ───────────────────────────────────────────────────────────────
// Note: 'sicencePark2-03_fixed.png' (typo in filename) is aliased to
// 'sciencePark03.png' so that /sciencepark/i detection still works.
// 'industrialBuilding2-_fixed.png' (malformed name) is excluded.
const INDUSTRIAL_BUILDING_MODEL_SETS = [
  {
    keyPrefix: 'industrial_building_1x1',
    folder: 'Models/industrial/1x1/',
    apiFolder: 'industrial/1x1',
    fallbackSourceFiles: [
      'industrialBuilding1-01_fixed.png',
      'industrialBuilding1-02_fixed.png',
    ],
    preferredFiles: [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'industrialBuilding1-01_fixed.png',
      'industrialBuilding1-02_fixed.png',
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
      'industrialBuilding2-01_fixed.png',
      'industrialBuilding2-02_fixed.png',
      'industrialBuilding2-04_fixed.png',
      'industrialBuilding2-05_fixed.png',
      'sciencePark2-01_fixed.png',
      'sciencePark2-02_fixed.png',
      'sicencePark2-03_fixed.png',
      'sciencePark2-04_fixed.png',
    ],
    preferredFiles: [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'industrialBuilding03.png',
      'industrialBuilding04.png',
      'sciencePark01.png',
      'sciencePark02.png',
      'sciencePark03.png',
      'sciencePark04.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'industrialBuilding2-01_fixed.png',
      'industrialBuilding2-02_fixed.png',
      'industrialBuilding2-04_fixed.png',
      'industrialBuilding2-05_fixed.png',
      'sciencePark2-01_fixed.png',
      'sciencePark2-02_fixed.png',
      'sicencePark2-03_fixed.png',
      'sciencePark2-04_fixed.png',
    ], [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'industrialBuilding03.png',
      'industrialBuilding04.png',
      'sciencePark01.png',
      'sciencePark02.png',
      'sciencePark03.png',
      'sciencePark04.png',
    ]),
    disabledFiles: ['industrialBuilding2-_fixed.png'],
    footprintCols: 2,
    footprintRows: 2,
  },
  {
    keyPrefix: 'industrial_building_3x3',
    folder: 'Models/industrial/3x3/',
    apiFolder: 'industrial/3x3',
    fallbackSourceFiles: [
      'industrialBuilding3-01_fixed.png',
      'industrialBuilding3-02_fixed.png',
      'sciencePark3-01_fixed.png',
      'sciencePark3-02_fixed.png',
    ],
    preferredFiles: [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'sciencePark01.png',
      'sciencePark02.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'industrialBuilding3-01_fixed.png',
      'industrialBuilding3-02_fixed.png',
      'sciencePark3-01_fixed.png',
      'sciencePark3-02_fixed.png',
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

const BUILDING_KEYS = Array.from({ length: 78 }, (_, index) => (
  `building_${String(index).padStart(3, '0')}`
));

const TREE_SPECIES = [
  { id: 'tree',        shortKey: 'tree_short',        tallKey: 'tree_tall',        hillWeight: 1 },
  { id: 'treeAlt',     shortKey: 'tree_alt_short',    tallKey: 'tree_alt_tall',    hillWeight: 1 },
  { id: 'conifer',     shortKey: 'conifer_short',     tallKey: 'conifer_tall',     hillWeight: 4 },
  { id: 'coniferAlt',  shortKey: 'conifer_alt_short', tallKey: 'conifer_alt_tall', hillWeight: 4 },
];

const MUSIC_TRACKS = [
  {
    key: 'music_0',
    title: 'Heart Sutra RnB Vocal Guide Loop',
    file: 'Music/heart_sutra_rnb_vocal_guide_loop.wav',
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
