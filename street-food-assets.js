// 平日小食墟 runtime asset roster: cart/furniture/people/lighting file paths, their display scale
// and ground anchor, read once from the prepared manifests (data/street-food-geometry.json,
// data/street-food-people.json, data/street-food-lighting.json). street-food-sprites.js turns
// this into Phaser textures and sprites; street-food-market.js (pure, no fetch) only ever sees the
// id lists this module hands it.
//
// 檯凳 (furniture) ids, matching scripts/prepare-street-food-assets.js's FURNITURE_IDS - carts are
// everything else in the geometry manifest.
const STREET_FOOD_FURNITURE_IDS = Object.freeze([
  'roundTableCream', 'roundTableMint', 'foldingStoolRed', 'foldingStoolGreen', 'roundTableFolded', 'foldingStoolsPacked',
]);

let streetFoodAssets = null;
let streetFoodAssetsPromise = null;

async function fetchStreetFoodJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

/** Resolves once the three manifests are read; safe to call repeatedly (cached). */
function loadStreetFoodAssets() {
  if (streetFoodAssets) return Promise.resolve(streetFoodAssets);
  if (streetFoodAssetsPromise) return streetFoodAssetsPromise;
  streetFoodAssetsPromise = Promise.all([
    fetchStreetFoodJson('data/street-food-geometry.json'),
    fetchStreetFoodJson('data/street-food-people.json'),
    fetchStreetFoodJson('data/street-food-lighting.json'),
  ]).then(([geometry, people, lighting]) => {
    const carts = new Map();
    const furniture = new Map();
    for (const asset of geometry.assets) {
      const entry = {
        id: asset.id,
        path: asset.outputPath,
        size: asset.outputSize,
        groundAnchor: asset.groundAnchor,
        scale: asset.display.scale,
        longLine: asset.display.longLine ?? null,
        mirrorPath: asset.mirror?.outputPath ?? null,
        mirrorGroundAnchor: asset.mirror?.groundAnchor ?? null,
      };
      (STREET_FOOD_FURNITURE_IDS.includes(asset.id) ? furniture : carts).set(asset.id, entry);
    }
    const peopleById = new Map(people.people.map((p) => [p.id, {
      id: p.id,
      role: p.role,
      path: p.outputPath,
      size: p.size,
      heightM: p.heightM,
      figureHeightPx: p.figureHeightPx,
      footAnchor: p.footAnchor,
      seatAnchor: p.seatAnchor ?? null,
    }]));
    // keyed "state:dir" - state is 'day', 'night' (bulbs lit) or 'glow' (lit, over its baked ground
    // pool - what the game draws by night), dir is 'down'/'up' (the two ground-slope diagonals
    // scripts/prepare-street-food-lighting.js mirrors, matching Models/streetFoodLighting).
    const lighting_ = {};
    for (const asset of lighting.assets) {
      lighting_[`${asset.state}:${asset.mirrored ? 'up' : 'down'}`] = {
        path: asset.outputPath,
        size: asset.outputSize,
        groundAnchors: asset.groundAnchors,
        poleTops: asset.poleTops,
        scale: asset.display?.scale ?? null,
        spanM: asset.display?.spanM ?? null,
      };
    }
    streetFoodAssets = { carts, furniture, people: peopleById, lighting: lighting_ };
    return streetFoodAssets;
  }).catch((error) => {
    streetFoodAssetsPromise = null; // let a later call retry instead of caching the failure
    throw error;
  });
  return streetFoodAssetsPromise;
}

function getStreetFoodAssets() { return streetFoodAssets; }
function getStreetFoodCartIds() { return streetFoodAssets ? [...streetFoodAssets.carts.keys()] : []; }
function getStreetFoodCart(id) { return streetFoodAssets?.carts.get(id) ?? null; }
function getStreetFoodFurniture(id) { return streetFoodAssets?.furniture.get(id) ?? null; }
function getStreetFoodPerson(id) { return streetFoodAssets?.people.get(id) ?? null; }
function getStreetFoodPeopleByRole(role) {
  if (!streetFoodAssets) return [];
  return [...streetFoodAssets.people.values()].filter((p) => p.role === role).map((p) => p.id);
}
/** @param {'day'|'night'|'glow'} state @param {'down'|'up'} dir the screen diagonal its pole line runs on */
function getStreetFoodLighting(state, dir) { return streetFoodAssets?.lighting[`${state}:${dir}`] ?? null; }

/** Every file path this module currently knows about, for a bulk preload. */
function getAllStreetFoodTexturePaths() {
  if (!streetFoodAssets) return [];
  const paths = [];
  streetFoodAssets.carts.forEach((entry) => { paths.push(entry.path); if (entry.mirrorPath) paths.push(entry.mirrorPath); });
  streetFoodAssets.furniture.forEach((entry) => paths.push(entry.path));
  streetFoodAssets.people.forEach((entry) => paths.push(entry.path));
  Object.values(streetFoodAssets.lighting).forEach((entry) => paths.push(entry.path));
  return paths;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  STREET_FOOD_FURNITURE_IDS,
  loadStreetFoodAssets, getStreetFoodAssets,
  getStreetFoodCartIds, getStreetFoodCart, getStreetFoodFurniture, getStreetFoodPerson,
  getStreetFoodPeopleByRole, getStreetFoodLighting, getAllStreetFoodTexturePaths,
};
