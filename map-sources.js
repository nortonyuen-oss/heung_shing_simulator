// Map sources for the New City / Map Editor screen: Hong Kong district maps, generated
// terrain and the player's saved maps. Every source hands over terrain data the same way
// (getTerrain), so the screen never needs to know where a map came from - and the preview
// drawing and land figures it shows for whichever one is picked.

// 隨機生成 offers the same landforms two ways: 香港實景 samples a real window of the territory
// (terrain-presets.js), 原創地形 grows a new one shaped like it (terrain-original.js). A
// completely flat map stays for the editor.
const GENERATED_MAP_LANDFORMS = [...Object.keys(HK_TERRAIN_LANDFORMS), 'flat'];
const GENERATED_MAP_DEFAULT_LANDFORM = 'hk-any';
const GENERATED_MAP_MODES = Object.freeze(['real', 'original']);
const GENERATED_MAP_DEFAULT_MODE = 'real';

const MAP_SOURCE_TILE_METRES = 20;
const MAP_SOURCE_PREVIEW_GRID_TILES = 50; // 1 km

function getMapSourceProfileLabel(profileType) {
  const key = `terrain.profile.${profileType}`;
  const label = t(key);
  return label === key ? profileType : label;
}

// At 20 m a tile a map is 5.12 km across: one Hong Kong district (hk-district-maps.js, text in
// hk-district-info.js). The older whole-city scenarios in terrain-presets.js squeezed a city
// into that and are not listed.
function listDistrictMapSources() {
  const maps = typeof HK_DISTRICT_MAPS !== 'undefined' ? HK_DISTRICT_MAPS : [];
  return maps.map((district) => {
    const info = HK_DISTRICT_INFO[district.id] ?? {};
    const localize = (texts) => texts?.[currentLanguage] ?? texts?.en ?? '';
    return {
      kind: 'district',
      id: `hk-district:${district.id}`,
      districtId: district.id,
      name: localize(info.names) || district.id,
      intro: localize(info.intro),
      peakMetres: district.peakMetres,
      // HK1980 Grid metres, for placing the district on HK_DISTRICT_OVERVIEW
      centre: { e: district.centre.e, n: district.centre.n },
      profileType: 'district',
      getTerrain: async () => getHkDistrictTerrainData(district.id),
    };
  });
}

// Where a district's 5.12 km square sits on the overview picture, in percent of its size.
function getDistrictOverviewBox(source) {
  const overview = typeof HK_DISTRICT_OVERVIEW !== 'undefined' ? HK_DISTRICT_OVERVIEW : null;
  if (!overview || !source?.centre) return null;
  const widthM = overview.eastE - overview.westE;
  const heightM = overview.northN - overview.southN;
  const sizeM = overview.mapTiles * overview.tileMetres;
  const x = ((source.centre.e - overview.westE) / widthM) * 100;
  const y = ((overview.northN - source.centre.n) / heightM) * 100;
  const w = (sizeM / widthM) * 100;
  const h = (sizeM / heightM) * 100;
  return { x, y, left: x - w / 2, top: y - h / 2, width: w, height: h };
}

// Generated terrain is pure (sampleHkTerrain and generateOriginalTerrain never touch the live
// city), so the preview can be built before anything is committed and the same data founds it.
function createGeneratedMapSource(profileType, seed, mode = GENERATED_MAP_DEFAULT_MODE) {
  const landform = GENERATED_MAP_LANDFORMS.includes(profileType) ? profileType : GENERATED_MAP_DEFAULT_LANDFORM;
  const sourceMode = GENERATED_MAP_MODES.includes(mode) ? mode : GENERATED_MAP_DEFAULT_MODE;
  let terrain = null;
  return {
    kind: 'generated',
    id: `generated:${sourceMode}:${landform}:${seed}`,
    name: getMapSourceProfileLabel(landform),
    profileType: landform,
    mode: sourceMode,
    seed,
    getTerrain: async () => {
      if (terrain) return terrain;
      if (landform !== 'flat' && sourceMode === 'real') await ensureHkTerrainSource();
      if (terrain) return terrain; // another caller may have completed during the shared read
      // The city may have switched to the territory while this source was downloading.
      // Legacy generators are synchronous and use global dimensions; scope them to
      // their own 256-tile map and restore the live world's geometry before yielding.
      const width = MAP_WIDTH, height = MAP_HEIGHT, resize = width !== 256 || height !== 256;
      if (resize) setMapDimensions(256,256);
      try {
        if (landform === 'flat') {
          terrain = { version: 1, generatorVersion: 4, profileType: 'flat', seed, features: ['flat'],
            mapData: createFilledMap(GROUND), heightMap: createFilledMap(0) };
        } else if (sourceMode === 'original') terrain = generateOriginalTerrain(landform, seed);
        else terrain = sampleHkTerrain(landform, seed);
      } finally {
        if (resize) setMapDimensions(width,height);
      }
      return terrain;
    },
  };
}

// 香港全境: the whole Hong Kong territory as one playable map, chunked (terrain-presets.js's
// ensureTerritoryChunkGenerated). getTerrain() returns a lightweight descriptor with no
// mapData/heightMap - there isn't one yet, chunks generate as the player explores - rather than
// the fully-realized terrain object every other source returns.
function createHkTerritoryMapSource() {
  return {
    kind: 'territory',
    id: 'hk-territory',
    name: t('landing.territoryName'),
    profileType: 'territory',
    getTerrain: async () => getHkFullTerritoryTerrainDescriptor(),
  };
}

async function listSavedMapSources() {
  let rows = [];
  try {
    rows = await listTerrainPresets();
  } catch (error) {
    console.warn('[MapSources Saved List]', error);
  }
  return (rows ?? []).map((row) => {
    const id = String(row.id);
    let terrain = row.terrain_data?.mapData ? row.terrain_data : null;
    return {
      kind: 'saved',
      id,
      name: row.name || getMapSourceProfileLabel(row.profile_type),
      profileType: row.profile_type || 'custom',
      getTerrain: async () => {
        if (!terrain) {
          const full = await getTerrainPresetById(id);
          terrain = full?.terrain_data ?? null;
        }
        return terrain;
      },
      remove: () => deleteTerrainPresetById(id),
    };
  });
}

function measureTerrainStats(terrain) {
  const rows = terrain?.mapData ?? [];
  let water = 0;
  let hill = 0;
  let total = 0;
  rows.forEach((row) => {
    for (let col = 0; col < row.length; col++) {
      const tile = Number(row[col]);
      total++;
      if (tile === WATER) water++;
      else if (tile === HILL) hill++;
    }
  });
  if (!total) return { flat: 0, hill: 0, water: 0 };
  const waterPct = Math.round((water / total) * 100);
  const hillPct = Math.round((hill / total) * 100);
  return { flat: Math.max(0, 100 - waterPct - hillPct), hill: hillPct, water: waterPct };
}

// terrain.width (set by sources that know their own size up front, e.g. the 香港全境 territory
// source) wins; every other existing source is always exactly MAP_WIDTH x MAP_HEIGHT at the
// moment it's generated, but the live globals can since have moved on to a different city's size
// by the time this preview runs (selectSource previews before setMapDimensions - Phase 0 - has
// committed to the picked source), so that fallback alone is not reliable either.
function getMapSourceSizeKm(terrain) {
  const width = Number(terrain?.width) || Number(terrain?.mapData?.[0]?.length) || MAP_WIDTH;
  const height = Number(terrain?.height) || Number(terrain?.mapData?.length) || MAP_HEIGHT;
  return {
    widthKm: (width * MAP_SOURCE_TILE_METRES) / 1000,
    heightKm: (height * MAP_SOURCE_TILE_METRES) / 1000,
  };
}

// Muted top-down relief: flat colours per tile type, hills tinted towards rock as they rise and
// lit from the north-west so ridges read at a glance, with faint 1 km grid lines on large previews.
// Reads the terrain's own mapData dimensions (like measureTerrainStats already does), not the
// live MAP_WIDTH/MAP_HEIGHT globals - same staleness reason as getMapSourceSizeKm above.
function drawMapSourcePreview(canvas, terrain, size = 256) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !terrain?.mapData) return;
  const mapRows = terrain.mapData;
  const heightRows = terrain.heightMap ?? [];
  const sourceHeight = mapRows.length;
  const sourceWidth = mapRows[0]?.length ?? 0;
  if (!sourceHeight || !sourceWidth) return;
  canvas.width = size;
  canvas.height = size;
  const image = ctx.createImageData(size, size);
  const tileAt = (row, col) => Number((mapRows[row] ?? [])[col]);
  const heightAt = (row, col) => Number((heightRows[row] ?? [])[col]) || 0;

  for (let y = 0; y < size; y++) {
    const row = Math.floor((y / size) * sourceHeight);
    for (let x = 0; x < size; x++) {
      const col = Math.floor((x / size) * sourceWidth);
      const tile = tileAt(row, col);
      const h = heightAt(row, col);
      let rgb;
      if (tile === WATER) {
        const shore = tileAt(row - 1, col) !== WATER || tileAt(row + 1, col) !== WATER
          || tileAt(row, col - 1) !== WATER || tileAt(row, col + 1) !== WATER;
        rgb = shore ? [104, 146, 170] : [82, 122, 150];
      } else if (tile === BEACH) {
        rgb = [214, 201, 160];
      } else if (tile === DIRT) {
        rgb = [156, 134, 100];
      } else {
        const rise = Math.min(1, Math.max(0, h) / MAX_TERRAIN_HEIGHT);
        rgb = [
          122 + (150 - 122) * rise,
          152 + (146 - 152) * rise,
          102 + (118 - 102) * rise,
        ];
        const lit = (h - heightAt(row - 1, col - 1)) * 14;
        rgb = rgb.map((channel) => channel + lit);
      }
      const idx = (y * size + x) * 4;
      image.data[idx] = Math.max(0, Math.min(255, rgb[0]));
      image.data[idx + 1] = Math.max(0, Math.min(255, rgb[1]));
      image.data[idx + 2] = Math.max(0, Math.min(255, rgb[2]));
      image.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  if (size >= 192) {
    const step = (MAP_SOURCE_PREVIEW_GRID_TILES / sourceWidth) * size;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let offset = step; offset < size - 1; offset += step) {
      const p = Math.round(offset) + 0.5;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
    }
    ctx.stroke();
  }
}
