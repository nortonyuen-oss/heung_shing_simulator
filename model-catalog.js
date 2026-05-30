const EFFECTIVE_PIXEL_ALPHA_THRESHOLD = 20;
const MODEL_METADATA_CACHE_KEY = 'citybuilder:modelMetadata:v2';
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

const HOUSE_MODEL_SETS = {
  house: {
    label: '1x1',
    folder: 'Models/residential/house1x1/',
    apiFolder: 'residential/house1x1',
    defaultFile: 'dingHouse.png',
    preferredFiles: [
      'dingHouse.png',
      'ciTang.png',
      'ciTang2.png',
    ],
    footprintCols: 1,
    footprintRows: 1,
  },
  house2x2: {
    label: '2x2',
    folder: 'Models/residential/house2x2/',
    apiFolder: 'residential/house2x2',
    defaultFile: 'publicHousing2.png',
    preferredFiles: [
      'publicHousing2.png',
      'publicHousing3.png',
      'publicHousing1.png',
      'publicHousing5.png',
    ],
    footprintCols: 2,
    footprintRows: 2,
  },
  house3x3: {
    label: '3x3',
    folder: 'Models/residential/house3x3/',
    apiFolder: 'residential/house3x3',
    defaultFile: 'publicHousing4.png',
    preferredFiles: [
      'publicHousing4.png',
      'privateHousing1.png',
      'privateHousing2.png',
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
    defaultFile: 'privateHousing3.png',
    preferredFiles: [
      'privateHousing3.png',
      'privateHousing4.png',
    ],
    footprintCols: 4,
    footprintRows: 4,
  },
  house1x4: {
    label: '1x4',
    folder: 'Models/residential/house1x4/',
    apiFolder: 'residential/house1x4',
    defaultFile: 'longPublicHousing.png',
    preferredFiles: [
      'longPublicHousing.png',
    ],
    footprintCols: 4,
    footprintRows: 1,
  },
};

const COMMERCIAL_BUILDING_MODEL_SETS = [
  {
    keyPrefix: 'commercial_building_1x1',
    folder: 'Models/commercialBuildings/1x1/',
    apiFolder: 'commercialBuildings/1x1',
    fallbackSourceFiles: [
      'commercialBuilding09.png',
      'commercialBuilding10.png',
      'commercialBuilding1-01_fixed.png',
    ],
    preferredFiles: [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding09.png',
      'commercialBuilding10.png',
      'commercialBuilding1-01_fixed.png',
    ], [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
    ]),
    footprintCols: 1,
    footprintRows: 1,
  },
  {
    keyPrefix: 'commercial_building_2x2',
    folder: 'Models/commercialBuildings/2x2/',
    apiFolder: 'commercialBuildings/2x2',
    fallbackSourceFiles: [
      'commercialBuilding2-01_fixed.png',
      'commercialBuilding2-02_fixed.png',
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
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding2-01_fixed.png',
      'commercialBuilding2-02_fixed.png',
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
    ]),
    footprintCols: 2,
    footprintRows: 2,
  },
  {
    keyPrefix: 'commercial_building_3x3',
    folder: 'Models/commercialBuildings/3x3/',
    apiFolder: 'commercialBuildings/3x3',
    fallbackSourceFiles: [
      'commercialBuilding3-01_fixed.png',
      'commercialBuilding3-02_fixed.png',
      'commercialBuilding3-03_fixed.png',
      'commercialBuilding3-04_fixed.png',
      'commercialBuilding3-05_fixed.png',
    ],
    preferredFiles: [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding3-01_fixed.png',
      'commercialBuilding3-02_fixed.png',
      'commercialBuilding3-03_fixed.png',
      'commercialBuilding3-04_fixed.png',
      'commercialBuilding3-05_fixed.png',
    ], [
      'commercialBuilding01.png',
      'commercialBuilding02.png',
      'commercialBuilding03.png',
      'commercialBuilding04.png',
      'commercialBuilding05.png',
    ]),
    footprintCols: 3,
    footprintRows: 3,
  },
  {
    keyPrefix: 'commercial_building_4x4',
    folder: 'Models/commercialBuildings/4x4/',
    apiFolder: 'commercialBuildings/4x4',
    fallbackSourceFiles: [
      'commercialBuilding4-01_fixed.png',
    ],
    preferredFiles: [
      'commercialBuilding01.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'commercialBuilding4-01_fixed.png',
    ], [
      'commercialBuilding01.png',
    ]),
    footprintCols: 4,
    footprintRows: 4,
  },
];

const INDUSTRIAL_BUILDING_MODEL_SETS = [
  {
    keyPrefix: 'industrial_building_1x1',
    folder: 'Models/industrialBuildings/1x1/',
    apiFolder: 'industrialBuildings/1x1',
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
    folder: 'Models/industrialBuildings/2x2/',
    apiFolder: 'industrialBuildings/2x2',
    fallbackSourceFiles: [
      'industrialBuilding2-01_fixed.png',
      'industrialBuilding2-02_fixed.png',
      'industrialBuilding2-03_fixed.png',
      'industrialBuilding2-04_fixed.png',
      'industrialBuilding2-05_fixed.png',
      'sciencePark2-01_fixed.png',
      'sciencePark2-02_fixed.png',
    ],
    preferredFiles: [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'industrialBuilding03.png',
      'industrialBuilding04.png',
      'industrialBuilding05.png',
      'industrialBuilding06.png',
      'industrialBuilding07.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'industrialBuilding2-01_fixed.png',
      'industrialBuilding2-02_fixed.png',
      'industrialBuilding2-03_fixed.png',
      'industrialBuilding2-04_fixed.png',
      'industrialBuilding2-05_fixed.png',
      'sciencePark2-01_fixed.png',
      'sciencePark2-02_fixed.png',
    ], [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'industrialBuilding03.png',
      'industrialBuilding04.png',
      'industrialBuilding05.png',
      'industrialBuilding06.png',
      'industrialBuilding07.png',
    ]),
    footprintCols: 2,
    footprintRows: 2,
  },
  {
    keyPrefix: 'industrial_building_3x3',
    folder: 'Models/industrialBuildings/3x3/',
    apiFolder: 'industrialBuildings/3x3',
    fallbackSourceFiles: [
      'industrialBuilding3-01_fixed.png',
      'industrialBuilding3-02_fixed.png',
      'sciencePark3-01_fixed.png',
    ],
    preferredFiles: [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'industrialBuilding03.png',
    ],
    fileAliases: buildSequentialFileAliases([
      'industrialBuilding3-01_fixed.png',
      'industrialBuilding3-02_fixed.png',
      'sciencePark3-01_fixed.png',
    ], [
      'industrialBuilding01.png',
      'industrialBuilding02.png',
      'industrialBuilding03.png',
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
