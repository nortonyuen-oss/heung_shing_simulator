'use strict';

// 公屋／居屋屋邨 (docs/public-housing-estate-plan.md; Norton, 2026-11-24). A 公屋區 or 居屋區 dragged on
// the map is one estate, planned whole as the Housing Authority plans one:
// - rows of blocks a tile apart, a garden strip or the estate's core between the rows;
// - the open space Hong Kong's planning standard asks for;
// - a community centre, a market and a ball court once there are blocks enough;
// - every tile left over a park, so no 1x1 gap a block can never fill.
// The blocks then open one by one (分期入伙), every one of the estate's single design (同邨同款).
// Zones from before, outside any estate, still grow tile by tile; a gap there that no block can ever
// fill turns into a sitting-out area after six months (空格綠化).

// ── The plan (pure: scripts/estate-layout-preview.js prints it, test/housing-estates.test.js checks it) ──

const HOUSING_ESTATE_DENSITY_POP = Object.freeze({ 1: 1.0, 2: 2.5, 3: 6.0 }); // constants.js DENSITY_POP_MUL
const HOUSING_ESTATE_OPEN_SPACE = Object.freeze({ public: 0.20, hos: 0.15 });
// HKPSG: 1 m² of local open space a person; a 20 m tile is 400 m²
const HOUSING_ESTATE_PEOPLE_PER_PARK_TILE = 400;
// the blocks an estate must be planned with for each facility (§3.4)
const HOUSING_ESTATE_FACILITY_BLOCKS = Object.freeze({
  public: Object.freeze({ market: 6, centre: 4, sports: 8, secondCentre: 16 }),
  hos: Object.freeze({ market: Infinity, centre: 6, sports: 8, secondCentre: Infinity }),
});
// its landscaping, a tile of park at a time, charged with the zoning
const HOUSING_ESTATE_LANDSCAPING_PER_TILE = 100;
const HOUSING_ESTATE_BLOCK_LETTERS = 'ABCDEFGHJLNQRTUVWXYZ';
const HOUSING_ESTATE_HOME_KINDS = Object.freeze(['block', 'low', 'estate8']);
const HOUSING_ESTATE_FACILITY_KINDS = Object.freeze(['market', 'centre', 'sports']);
const HOUSING_ESTATE_PARK_KINDS = Object.freeze(['park3', 'park2', 'park1']);

function housingEstateBlockPopulation(size, density) {
  return 30 * size * size * (HOUSING_ESTATE_DENSITY_POP[density] ?? HOUSING_ESTATE_DENSITY_POP[2]);
}

// §3.2 The depth, front first: T a row of blocks (t deep), G1 a garden strip, S2 a 2-deep service strip,
// C3/C4 the estate's core. Past the table: [T, G1] and the rest again.
function housingEstateDepthBands(D, t) {
  const table = t === 3
    ? { 1: ['G1'], 2: ['S2'], 3: ['T'], 4: ['T', 'G1'], 5: ['T', 'S2'], 6: ['T', 'T'], 7: ['T', 'G1', 'T'],
      8: ['T', 'S2', 'T'], 9: ['T', 'C3', 'T'], 10: ['T', 'C4', 'T'] }
    : { 1: ['G1'], 2: ['S2'], 3: ['T3'], 4: ['T'], 5: ['T', 'G1'], 6: ['T', 'S2'], 7: ['T', 'T3'], 8: ['T', 'T'],
      9: ['T', 'G1', 'T'], 10: ['T', 'S2', 'T'], 11: ['T', 'C3', 'T'], 12: ['T', 'C4', 'T'] };
  const last = t === 3 ? 10 : 12;
  if (D <= 0) return [];
  const names = D <= last ? table[D] : ['T', 'G1', ...housingEstateDepthBands(D - (t + 1), t).map((band) => band.name)];
  return names.map((name) => {
    if (name === 'T') return { name, kind: 'T', depth: t };
    if (name === 'T3') return { name, kind: 'T', depth: 3 };
    return { name, kind: name[0], depth: Number(name.slice(1)) };
  });
}

// §3.1 Along a row: blocks t wide, a tile apart (樓距); what is left widens the middle gap into a
// courtyard. When exactly a block's width is left, two blocks stand together (相連) and the row gains one.
function housingEstateBlockColumns(L, t) {
  let n = Math.floor((L + 1) / (t + 1));
  if (n === 0) return [];
  let slack = L - (n * (t + 1) - 1);
  let pairAt = -1;
  if (slack === t) { n += 1; slack = 0; pairAt = Math.floor((n - 1) / 2); }
  const gaps = Array(Math.max(0, n - 1)).fill(1);
  if (pairAt >= 0) gaps[pairAt - (pairAt > 0 ? 1 : 0)] = 0;
  if (n >= 2 && slack) {
    const mid = Math.floor((n - 2) / 2);
    const gap = gaps.findIndex((g, i) => i >= mid && g > 0);
    gaps[gap >= 0 ? gap : mid] += slack;
  }
  const cols = [];
  let col = 0; // (a lone block keeps its slack together on one side: room for a 2x2)
  for (let i = 0; i < n; i++) { cols.push(col); col += t + (gaps[i] ?? 0); }
  return cols;
}

// The whole plan of a W x D site (W along the front road, row 0 at the road), as items
// { kind, row, col, size, variant? }. 居屋 tries its 4x4 courts and its 3x3 block; the 3x3 wins only
// with a quarter more residents (§3.6). An 8x8 公屋 site is the 安泰邨 estate art whole (§9, Norton).
// options.facilityBlocks: the blocks the facilities are counted by - a terrace of a hillside estate
// counts the whole estate's, or none (planHousingEstateSite); left out, the site's own.
function planHousingEstate(W, D, type = 'public', density = 2, options = {}) {
  if (type === 'public' && W === 8 && D === 8) {
    return { W, D, type, density, blockSize: 8, planned: 1,
      items: [{ kind: 'estate8', row: 0, col: 0, size: 8 }], population: housingEstateBlockPopulation(8, density), parks: 0 };
  }
  if (type !== 'hos' || D < 4 || W < 4) return planHousingEstateWith(W, D, type, density, 3, options);
  const four = planHousingEstateWith(W, D, type, density, 4, options);
  const three = planHousingEstateWith(W, D, type, density, 3, options);
  return three.population > 1.25 * four.population ? three : four;
}

function planHousingEstateWith(W, D, type, density, t, options = {}) {
  const items = [];
  let row = 0;
  for (const band of housingEstateDepthBands(D, t)) {
    if (band.kind === 'T') housingEstateBlockColumns(W, band.depth).forEach((col) => items.push({ kind: 'block', row, col, size: band.depth }));
    else if (band.kind === 'S' && type === 'public') housingEstateBlockColumns(W, 2).forEach((col) => items.push({ kind: 'low', row, col, size: 2 }));
    row += band.depth;
  }
  const grid = Array.from({ length: D }, () => Array(W).fill(null));
  const stamp = () => {
    grid.forEach((line) => line.fill(null));
    items.forEach((it) => { for (let r = 0; r < it.size; r++) for (let c = 0; c < it.size; c++) grid[it.row + r][it.col + c] = it; });
  };
  stamp();
  const blocks = () => items.filter((it) => it.kind === 'block');
  const people = () => items.reduce((sum, it) => sum + (it.kind === 'block' || it.kind === 'low' ? housingEstateBlockPopulation(it.size, density) : 0), 0);
  const free = () => grid.reduce((sum, line) => sum + line.filter((cell) => !cell).length, 0);
  const cy = (D - 1) / 2;
  const cx = (W - 1) / 2;
  const fromCentre = (it) => Math.hypot(it.row + it.size / 2 - 0.5 - cy, it.col + it.size / 2 - 0.5 - cx);
  const remove = (it) => { items.splice(items.indexOf(it), 1); stamp(); };

  // §3.3 Open space, once there are three blocks: the land not built on for homes (parks and the
  // facilities) a share of the site, and the parks HKPSG's square metre a person (to the nearest tile);
  // short of either, the block nearest the middle makes way for the central park
  const planned = blocks().length;
  const ratio = HOUSING_ESTATE_OPEN_SPACE[type] ?? HOUSING_ESTATE_OPEN_SPACE.public;
  const facilityTiles = () => items.filter((it) => HOUSING_ESTATE_FACILITY_KINDS.includes(it.kind)).reduce((sum, it) => sum + it.size * it.size, 0);
  const ensureOpenSpace = () => {
    if (planned < 3) return;
    while (free() + facilityTiles() < Math.ceil(ratio * W * D) || free() < Math.round(people() / HOUSING_ESTATE_PEOPLE_PER_PARK_TILE)) {
      const block = blocks().sort((a, b) => fromCentre(a) - fromCentre(b))[0];
      if (!block) break;
      remove(block);
    }
  };
  ensureOpenSpace();

  // §3.4, §3.5 The facilities, each on the free 2x2 that scores lowest; with none, the block that
  // scores lowest makes way (but never for a ball court)
  const rule = HOUSING_ESTATE_FACILITY_BLOCKS[type] ?? HOUSING_ESTATE_FACILITY_BLOCKS.public;
  const spots = (size) => {
    const out = [];
    for (let r = 0; r + size <= D; r++) for (let c = 0; c + size <= W; c++) {
      let clear = true;
      for (let i = 0; i < size && clear; i++) for (let j = 0; j < size; j++) if (grid[r + i][c + j]) { clear = false; break; }
      if (clear) out.push({ row: r, col: c, size });
    }
    return out;
  };
  const place = (kind, score, mayClear) => {
    for (let tries = 0; tries < 3; tries++) {
      const spot = spots(2).sort((a, b) => score(a) - score(b))[0];
      if (spot) { items.push({ kind, ...spot }); stamp(); return true; }
      if (!mayClear) return false;
      const block = blocks().sort((a, b) => score(a) - score(b))[0];
      if (!block) return false;
      remove(block);
    }
    return false;
  };
  const frontScore = (s) => s.row * 10 + Math.abs(s.col + 0.5 - cx);
  const centreScore = (s) => Math.hypot(s.row + 0.5 - cy, s.col + 0.5 - cx);
  const backScore = (s) => -s.row * 10 + Math.abs(s.col + 0.5 - cx);
  const counted = options.facilityBlocks ?? planned;
  if (counted >= rule.market) place('market', frontScore, true);
  if (counted >= rule.centre) place('centre', centreScore, true);
  if (counted >= rule.secondCentre) place('centre', centreScore, true);
  if (counted >= rule.sports) place('sports', backScore, false);
  // (the facilities are not open space: what they took is made up again)
  ensureOpenSpace();

  // §3.7 The parks: a 3x3 nearest the middle, every free 2x2 - a basketball court first, as every estate
  // has (Norton, 2026-11-24: 籃球場比雕像廣場更似香港屋邨), then gardens and courts in turn - and each tile
  // left a 1x1 by where it is
  const park3 = spots(3).sort((a, b) => Math.hypot(a.row + 1 - cy, a.col + 1 - cx) - Math.hypot(b.row + 1 - cy, b.col + 1 - cx))[0];
  if (park3) { items.push({ kind: 'park3', ...park3, variant: 'large_park' }); stamp(); }
  let park2;
  let courts = 0;
  while ((park2 = spots(2)[0])) {
    items.push({ kind: 'park2', ...park2, variant: courts % 2 ? 'palm_court' : 'basketball_court' });
    courts += 1;
    stamp();
  }
  const isHome = (r, c) => grid[r]?.[c] && (grid[r][c].kind === 'block' || grid[r][c].kind === 'low');
  for (let r = 0; r < D; r++) for (let c = 0; c < W; c++) {
    if (grid[r][c]) continue;
    const byHome = isHome(r - 1, c) || isHome(r + 1, c) || isHome(r, c - 1) || isHome(r, c + 1);
    const variant = r === 0 ? 'plaza_square' : byHome ? ((r + c) % 2 ? 'garden_plaza' : 'playground') : 'open_ground';
    items.push({ kind: 'park1', row: r, col: c, size: 1, variant });
  }
  stamp();
  const parks = items.filter((it) => HOUSING_ESTATE_PARK_KINDS.includes(it.kind)).reduce((sum, it) => sum + it.size * it.size, 0);
  return { W, D, type, density, blockSize: t, planned, items, population: people(), parks };
}

// ── Where a plan lies on the map ────────────────────────────────────────────────────────────────

// The side of a rectangle { row, col, rows, cols } with the most road beside it ('n', 's', 'w', 'e'),
// the longer side on a tie (and with no road at all).
function housingEstateFront(rect, isRoad) {
  const count = { n: 0, s: 0, w: 0, e: 0 };
  for (let c = rect.col; c < rect.col + rect.cols; c++) {
    if (isRoad(rect.row - 1, c)) count.n += 1;
    if (isRoad(rect.row + rect.rows, c)) count.s += 1;
  }
  for (let r = rect.row; r < rect.row + rect.rows; r++) {
    if (isRoad(r, rect.col - 1)) count.w += 1;
    if (isRoad(r, rect.col + rect.cols)) count.e += 1;
  }
  const longer = rect.cols >= rect.rows ? ['s', 'n', 'e', 'w'] : ['e', 'w', 's', 'n'];
  return longer.reduce((best, side) => (count[side] > count[best] ? side : best), longer[0]);
}

// The site's size along its front (W) and its depth (D)
function housingEstateFrame(rect, front) {
  return front === 'n' || front === 's' ? { W: rect.cols, D: rect.rows } : { W: rect.rows, D: rect.cols };
}

// A plan item's top-left tile on the map
function housingEstateItemToMap(rect, front, item) {
  const s = item.size;
  if (front === 'n') return { row: rect.row + item.row, col: rect.col + item.col };
  if (front === 's') return { row: rect.row + rect.rows - item.row - s, col: rect.col + item.col };
  if (front === 'w') return { row: rect.row + item.col, col: rect.col + item.row };
  return { row: rect.row + item.col, col: rect.col + rect.cols - item.row - s };
}

// The largest all-true rectangle in a grid of booleans (rows x cols), or null
function largestTrueRectangle(cells) {
  const rows = cells.length;
  const cols = rows ? cells[0].length : 0;
  const heights = Array(cols).fill(0);
  let best = null;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights[c] = cells[r][c] ? heights[c] + 1 : 0;
    const stack = [];
    for (let c = 0; c <= cols; c++) {
      const h = c < cols ? heights[c] : 0;
      let start = c;
      while (stack.length && stack[stack.length - 1].h >= h) {
        const top = stack.pop();
        const area = top.h * (c - top.start);
        if (top.h > 0 && (!best || area > best.rows * best.cols)) best = { row: r - top.h + 1, col: top.start, rows: top.h, cols: c - top.start };
        start = top.start;
      }
      stack.push({ start, h });
    }
  }
  return best;
}

// Free tiles of a rectangle cut into rectangles, largest first, until none are left. With heightOf, each
// rectangle keeps to one height: a hillside site comes apart into its level terraces (平台).
function splitIntoRectangles(rect, isFree, heightOf = null) {
  const heights = new Set();
  for (let r = 0; r < rect.rows; r++) for (let c = 0; c < rect.cols; c++) {
    if (isFree(rect.row + r, rect.col + c)) heights.add(heightOf ? heightOf(rect.row + r, rect.col + c) : 0);
  }
  const parts = [];
  heights.forEach((height) => {
    const cells = Array.from({ length: rect.rows }, (_, r) => Array.from({ length: rect.cols }, (_, c) => !!isFree(rect.row + r, rect.col + c)
      && (!heightOf || heightOf(rect.row + r, rect.col + c) === height)));
    for (;;) {
      const part = largestTrueRectangle(cells);
      if (!part) break;
      for (let r = part.row; r < part.row + part.rows; r++) for (let c = part.col; c < part.col + part.cols; c++) cells[r][c] = false;
      parts.push({ row: rect.row + part.row, col: rect.col + part.col, rows: part.rows, cols: part.cols });
    }
  });
  return parts.sort((a, b) => b.rows * b.cols - a.rows * a.cols);
}

// Every part of a site planned and laid on the map: slots { kind, row, col, size, variant?, label? }.
// On a hillside each terrace is planned on its own, and the facilities are the whole estate's - counted
// by all its blocks, on its largest terrace.
function planHousingEstateSite(rect, type, density, isFree, isRoad, heightOf = null) {
  const slots = [];
  let planned = 0;
  const parts = splitIntoRectangles(rect, isFree, heightOf).map((part) => {
    const front = housingEstateFront(part, isRoad);
    return { part, front, ...housingEstateFrame(part, front) };
  });
  const total = parts.length > 1
    ? parts.reduce((sum, { W, D }) => sum + planHousingEstate(W, D, type, density, { facilityBlocks: 0 }).planned, 0)
    : null;
  parts.forEach(({ part, front, W, D }, index) => {
    const plan = planHousingEstate(W, D, type, density, total === null ? {} : { facilityBlocks: index === 0 ? total : 0 });
    planned += plan.planned;
    plan.items.forEach((item) => slots.push({ ...item, ...housingEstateItemToMap(part, front, item) }));
  });
  // A座, B座 ... front to back across the parts
  slots.filter((slot) => slot.kind === 'block' || slot.kind === 'estate8').forEach((slot, i) => {
    slot.label = HOUSING_ESTATE_BLOCK_LETTERS[i] ?? String(i + 1);
  });
  return { slots, planned, ...summarizeHousingEstateSlots(slots, density) };
}

function summarizeHousingEstateSlots(slots, density) {
  const homes = slots.filter((slot) => HOUSING_ESTATE_HOME_KINDS.includes(slot.kind));
  return {
    blocks: slots.filter((slot) => slot.kind === 'block' || slot.kind === 'estate8').length,
    lowBlocks: slots.filter((slot) => slot.kind === 'low').length,
    population: homes.reduce((sum, slot) => sum + housingEstateBlockPopulation(slot.size, density), 0),
    parks: slots.filter((slot) => HOUSING_ESTATE_PARK_KINDS.includes(slot.kind)).reduce((sum, slot) => sum + slot.size * slot.size, 0),
    facilities: slots.filter((slot) => HOUSING_ESTATE_FACILITY_KINDS.includes(slot.kind)).map((slot) => slot.kind),
  };
}

// ── The estates in a city: city.housingEstates = { id: estate } ───────────────────────────────

const HOUSING_ESTATE_NAME_CHARS = Object.freeze([
  ['安', 'On'], ['富', 'Fu'], ['華', 'Wah'], ['興', 'Hing'], ['德', 'Tak'], ['和', 'Wo'], ['樂', 'Lok'], ['康', 'Hong'],
  ['泰', 'Tai'], ['祥', 'Cheung'], ['順', 'Shun'], ['美', 'Mei'], ['麗', 'Lai'], ['景', 'King'], ['翠', 'Chui'],
  ['雅', 'Nga'], ['怡', 'Yi'], ['福', 'Fuk'], ['盛', 'Shing'], ['明', 'Ming'],
]);

let housingEstateIndexCache = null;

function getHousingEstates() {
  if (typeof city === 'undefined' || !city) return {};
  if (!city.housingEstates || typeof city.housingEstates !== 'object' || Array.isArray(city.housingEstates)) city.housingEstates = {};
  return city.housingEstates;
}

function invalidateHousingEstateIndex() {
  housingEstateIndexCache = null;
}

// 'row:col' -> { estate, slot } for every tile of every estate
function getHousingEstateIndex() {
  const estates = getHousingEstates();
  if (housingEstateIndexCache?.source === estates) return housingEstateIndexCache.index;
  const index = new Map();
  Object.values(estates).forEach((estate) => {
    (estate.slots || []).forEach((slot) => {
      for (let r = 0; r < slot.size; r++) for (let c = 0; c < slot.size; c++) index.set(`${slot.row + r}:${slot.col + c}`, { estate, slot });
    });
  });
  housingEstateIndexCache = { source: estates, index };
  return index;
}

function getHousingEstateAt(row, col) {
  return getHousingEstateIndex().get(`${row}:${col}`) ?? null;
}

function isHousingEstateTile(row, col) {
  return getHousingEstateIndex().has(`${row}:${col}`);
}

function normalizeHousingEstates(raw, width = Infinity, height = Infinity) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.entries(raw).forEach(([id, estate]) => {
    if (!estate || typeof estate !== 'object' || (estate.type !== 'public' && estate.type !== 'hos')) return;
    const slots = (Array.isArray(estate.slots) ? estate.slots : []).filter((slot) => slot
      && [...HOUSING_ESTATE_HOME_KINDS, ...HOUSING_ESTATE_FACILITY_KINDS, ...HOUSING_ESTATE_PARK_KINDS].includes(slot.kind)
      && Number.isInteger(slot.row) && Number.isInteger(slot.col) && Number.isInteger(slot.size) && slot.size > 0
      && slot.row >= 0 && slot.col >= 0 && slot.row + slot.size <= height && slot.col + slot.size <= width);
    if (!slots.length) return;
    out[id] = {
      id,
      type: estate.type,
      name: String(estate.name || ''),
      nameEn: String(estate.nameEn || ''),
      density: [1, 2, 3].includes(estate.density) ? estate.density : 2,
      models: estate.models && typeof estate.models === 'object' ? { ...estate.models } : {},
      slots: slots.map((slot) => ({ kind: slot.kind, row: slot.row, col: slot.col, size: slot.size,
        ...(slot.variant ? { variant: String(slot.variant) } : {}), ...(slot.label ? { label: String(slot.label) } : {}) })),
      greenSlopes: (Array.isArray(estate.greenSlopes) ? estate.greenSlopes : []).filter((id) => /^\d+:\d+$/.test(id)),
      landscaped: estate.landscaped === true,
      landscapingDue: Math.max(0, Math.round(Number(estate.landscapingDue) || 0)),
    };
  });
  return out;
}

// 同邨同款 (§3.10): one design for every block of an estate, and estates in turn taking the design
// fewest have - not by year (Norton, 2026-11-24: few cities reach the 1990s, and with the art there is a
// city by era would be all one design)
const HOUSING_ESTATE_DESIGNS = Object.freeze({
  public: Object.freeze(['residential3-02-L-MD', 'residential3-01-L-MD', 'residential3-06-L-MD']), // 和諧式, Y型, 舊長型
  hos: Object.freeze(['residential3-07-M-MD', 'residential3-08-M-MD']), // 安泰苑, 十字型 (4x4 courts)
});

function chooseHousingEstateModels(type, usedDesigns = [], seed = 0) {
  const designs = HOUSING_ESTATE_DESIGNS[type === 'hos' ? 'hos' : 'public'];
  const count = (design) => usedDesigns.filter((used) => used === design).length;
  const fewest = Math.min(...designs.map(count));
  const candidates = designs.filter((design) => count(design) === fewest);
  const design = candidates[Math.abs(seed) % candidates.length];
  if (type === 'hos') return { block4: design, block3: 'residential3-14-M-MD' };
  return { block3: design, low: 'residential2-04-L-MD', estate8: 'residential5-03-L-HD' };
}

function housingEstateModelFor(estate, slot) {
  if (slot.kind === 'estate8') return estate.models?.estate8 ?? 'residential5-03-L-HD';
  if (slot.kind === 'low') return estate.models?.low ?? null;
  return slot.size === 4 ? estate.models?.block4 ?? null : estate.models?.block3 ?? null;
}

function nameHousingEstate(type, seed) {
  const a = HOUSING_ESTATE_NAME_CHARS[seed % HOUSING_ESTATE_NAME_CHARS.length];
  const b = HOUSING_ESTATE_NAME_CHARS[Math.floor(seed / HOUSING_ESTATE_NAME_CHARS.length + 7) % HOUSING_ESTATE_NAME_CHARS.length];
  const pair = a === b ? [a, HOUSING_ESTATE_NAME_CHARS[(seed + 3) % HOUSING_ESTATE_NAME_CHARS.length]] : [a, b];
  return {
    name: `${pair[0][0]}${pair[1][0]}${type === 'hos' ? '苑' : '邨'}`,
    nameEn: `${pair[0][1]} ${pair[1][1]} ${type === 'hos' ? 'Court' : 'Estate'}`,
  };
}

function housingEstateDisplayName(estate) {
  const lang = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'zhHant';
  return lang === 'en' && estate.nameEn ? estate.nameEn : estate.name;
}

// ── Planning a site on the map ──────────────────────────────────────────────────────────────────

function isHousingEstateRoadTile(row, col) {
  if (typeof isInsideMap === 'function' && !isInsideMap(row, col)) return false;
  return typeof isRoadAccessTile === 'function' ? isRoadAccessTile(row, col) : mapData[row]?.[col] === ROAD;
}

// A tile a new estate may take: zoned this type, empty, not another estate's
function isHousingEstateFreeTile(scene, row, col, type) {
  if (typeof isInsideMap === 'function' && !isInsideMap(row, col)) return false;
  if (zoneMap[row]?.[col] !== ZONE_RES || getHousingZoneType(row, col) !== type) return false;
  if (scene?.buildingSprites?.has(getTileId(row, col))) return false;
  if (typeof canPlaceBuilding === 'function' && !canPlaceBuilding(row, col)) return false;
  return !isHousingEstateTile(row, col);
}

// The zone tool's drag, before it is let go: what it would zone, as one estate (§7)
function previewHousingEstateRect(r1, c1, r2, c2, type, density) {
  const rect = { row: Math.min(r1, r2), col: Math.min(c1, c2), rows: Math.abs(r2 - r1) + 1, cols: Math.abs(c2 - c1) + 1 };
  const isFree = (row, col) => {
    if (typeof isInsideMap === 'function' && !isInsideMap(row, col)) return false;
    if ([WATER, BEACH, ROAD].includes(mapData[row]?.[col])) return false;
    if (typeof canPlaceBuilding === 'function' && !canPlaceBuilding(row, col)) return false;
    if (typeof activeScene !== 'undefined' && activeScene?.buildingSprites?.has(getTileId(row, col))) return false;
    return !isHousingEstateTile(row, col);
  };
  return { rect, ...planHousingEstateSite(rect, type, density, isFree, isHousingEstateRoadTile, getTileHeight) };
}

function describeHousingEstatePlan(plan, type, cols, rows) {
  const typeName = t(`estate.type.${type}`);
  if (!plan.blocks && !plan.lowBlocks) return t('estate.summaryNoBlocks', { type: typeName, size: `${cols}x${rows}` });
  const facilities = plan.facilities.length
    ? plan.facilities.map((kind) => t(`estate.facility.${kind}`)).join('、')
    : t('estate.facilities.none');
  const perPerson = plan.population ? (plan.parks * 400) / plan.population : 0;
  return t('estate.summary', {
    type: typeName, size: `${cols}x${rows}`, blocks: plan.blocks + plan.lowBlocks,
    population: Math.round(plan.population).toLocaleString(), facilities, parks: plan.parks, perPerson: perPerson.toFixed(1),
    landscaping: (plan.parks * HOUSING_ESTATE_LANDSCAPING_PER_TILE).toLocaleString(),
  });
}

// One tile more either way: does it make room for another block? (§7)
function housingEstateGrowHint(r1, c1, r2, c2, type, density, blocks) {
  const tries = [[r1, c1, r2, c2 + 1], [r1, c1, r2 + 1, c2]];
  for (const [a, b, c, d] of tries) {
    const plan = previewHousingEstateRect(a, b, c, d, type, density);
    if (plan.blocks + plan.lowBlocks > blocks) return t('estate.growHint', { size: `${d - b + 1}x${c - a + 1}` });
  }
  return '';
}

function housingEstateSummaryForRect(r1, c1, r2, c2, type, density) {
  const plan = previewHousingEstateRect(r1, c1, r2, c2, type, density);
  const cols = Math.abs(c2 - c1) + 1;
  const rows = Math.abs(r2 - r1) + 1;
  const hint = housingEstateGrowHint(Math.min(r1, r2), Math.min(c1, c2), Math.max(r1, r2), Math.max(c1, c2), type, density, plan.blocks + plan.lowBlocks);
  return { plan, text: describeHousingEstatePlan(plan, type, cols, rows), hint };
}

// The slope tiles of a site (a terrace's edge: nothing may be built there), to be planted
function housingEstateSlopeTiles(rect) {
  const out = [];
  if (typeof isSlopeTile !== 'function') return out;
  for (let r = rect.row; r < rect.row + rect.rows; r++) for (let c = rect.col; c < rect.col + rect.cols; c++) {
    if ((typeof isInsideMap !== 'function' || isInsideMap(r, c)) && isSlopeTile(r, c) && mapData[r][c] !== ROAD) out.push(`${r}:${c}`);
  }
  return out;
}

// After the zone tool zones a 公屋 or 居屋 rectangle: the tiles it took become one planned estate.
function createHousingEstateFromZoning(scene, r1, c1, r2, c2, type) {
  if (type !== 'public' && type !== 'hos') return null;
  const rect = { row: Math.min(r1, r2), col: Math.min(c1, c2), rows: Math.abs(r2 - r1) + 1, cols: Math.abs(c2 - c1) + 1 };
  const density = Math.max(2, zoneDensityMap[rect.row]?.[rect.col] ?? 2);
  const site = planHousingEstateSite(rect, type, density, (row, col) => isHousingEstateFreeTile(scene, row, col, type), isHousingEstateRoadTile, getTileHeight);
  if (!site.slots.length) return null;
  const estates = getHousingEstates();
  const seq = Object.keys(estates).reduce((max, id) => Math.max(max, Number(id.replace(/^estate-/, '')) || 0), 0) + 1;
  const id = `estate-${seq}`;
  const used = Object.values(estates).filter((other) => other.type === type)
    .map((other) => (type === 'hos' ? other.models?.block4 : other.models?.block3)).filter(Boolean);
  const estate = {
    id, type, ...nameHousingEstate(type, seq * 7 + rect.row + rect.col), density,
    models: chooseHousingEstateModels(type, used, seq),
    slots: site.slots,
    // 斜坡綠化: the slopes between its terraces, planted with trees with its landscaping
    greenSlopes: housingEstateSlopeTiles(rect),
    landscaped: false,
    landscapingDue: 0,
  };
  // 園景 with the zoning (§9.1): what the treasury cannot pay now is paid when the first block opens
  const landscaping = site.parks * HOUSING_ESTATE_LANDSCAPING_PER_TILE;
  const paid = landscaping > 0 && typeof spendBudget === 'function' && spendBudget(landscaping);
  estate.landscapingDue = paid ? 0 : landscaping;
  estates[id] = estate;
  invalidateHousingEstateIndex();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  if (typeof showToast === 'function') {
    showToast(t(paid || !landscaping ? 'estate.toast.planned' : 'estate.toast.plannedDue', {
      name: housingEstateDisplayName(estate), blocks: site.blocks + site.lowBlocks,
      facilities: site.facilities.length ? site.facilities.map((kind) => t(`estate.facility.${kind}`)).join('、') : t('estate.facilities.none'),
      cost: landscaping.toLocaleString(),
    }), 'info');
  }
  return estate;
}

// ── Growth: one block at a time (分期入伙) ─────────────────────────────────────────────────────────

// One of an estate's planned blocks, exactly: the only building its land takes (sim-growth.js)
function isHousingEstateHomeSlotAt(row, col, cols, rows) {
  const hit = getHousingEstateAt(row, col);
  return !!hit && HOUSING_ESTATE_HOME_KINDS.includes(hit.slot.kind)
    && hit.slot.row === row && hit.slot.col === col && hit.slot.size === cols && hit.slot.size === rows;
}

function isHousingEstateSlotBuilt(slot) {
  const record = buildingData[getTileId(slot.row, slot.col)];
  if (!record) return false;
  if (HOUSING_ESTATE_HOME_KINDS.includes(slot.kind)) return record.type === 'residential';
  if (slot.kind === 'market') return record.type === 'public_market';
  if (slot.kind === 'centre') return record.type === 'community_centre';
  if (slot.kind === 'sports') return record.type === 'sports_ground_small';
  return true;
}

function getHousingEstateProgress(estate) {
  const homes = estate.slots.filter((slot) => HOUSING_ESTATE_HOME_KINDS.includes(slot.kind));
  const built = homes.filter(isHousingEstateSlotBuilt);
  const population = built.reduce((sum, slot) => sum + (Number(buildingData[getTileId(slot.row, slot.col)]?.population) || 0), 0);
  return { total: homes.length, built: built.length, population };
}

// The next block to open: front rows first, as the plan lists them
function nextHousingEstateHomeSlot(scene, estate) {
  for (const slot of estate.slots) {
    if (!HOUSING_ESTATE_HOME_KINDS.includes(slot.kind) || isHousingEstateSlotBuilt(slot)) continue;
    if (canPlaceZoneBuildingFootprint(scene, slot.row, slot.col, ZONE_RES, slot.size, slot.size)) return slot;
  }
  return null;
}

function openHousingEstateBlock(scene, estate, slot) {
  const ok = spawnZoneBuilding(scene, slot.row, slot.col, ZONE_RES, 1, Math.max(2, zoneDensityMap[slot.row]?.[slot.col] ?? estate.density), {
    forceFootprint: slot.size,
    forceModelFile: housingEstateModelFor(estate, slot),
  });
  if (ok && !estate.landscaped) landscapeHousingEstate(scene, estate);
  return ok;
}

// The estate's parks, and grass on the facilities' lots, when its first block opens (§6.4)
function landscapeHousingEstate(scene, estate) {
  if (estate.landscapingDue > 0) {
    if (typeof spendBudget !== 'function' || !spendBudget(estate.landscapingDue)) return false;
    estate.landscapingDue = 0;
  }
  const option = (id) => (typeof PARK_OPTIONS !== 'undefined' ? PARK_OPTIONS.find((entry) => entry.id === id) : null);
  estate.slots.forEach((slot) => {
    if (slot.variant === 'basketball_court') {
      // the estate's basketball court (the 2x2 sports ground's art is 香港屋邨籃球場)
      const court = typeof SPORT_GROUND_OPTIONS !== 'undefined' ? SPORT_GROUND_OPTIONS.find((entry) => entry.id === 'sports_ground_small') : null;
      if (court && canPlaceBuildingFootprint(slot.row, slot.col, 2, 2)) placeSportsGround(scene, slot.row, slot.col, court, { free: true, refresh: false });
    } else if (HOUSING_ESTATE_PARK_KINDS.includes(slot.kind)) {
      const park = option(slot.variant) ?? option(slot.size === 3 ? 'large_park' : slot.size === 2 ? 'palm_court' : 'open_ground');
      if (park && canPlaceBuildingFootprint(slot.row, slot.col, slot.size, slot.size)) placePark(scene, slot.row, slot.col, park, { free: true, refresh: false });
    } else if (HOUSING_ESTATE_FACILITY_KINDS.includes(slot.kind) && !isHousingEstateSlotBuilt(slot)) {
      layHousingEstateReservedLawn(scene, slot);
    }
  });
  (estate.greenSlopes || []).forEach((id) => {
    const [row, col] = id.split(':').map(Number);
    if (typeof placeTree === 'function' && typeof canPlantTreeAt === 'function' && canPlantTreeAt(scene, row, col)) {
      placeTree(scene, row, col, { planted: true, spend: false });
    }
  });
  estate.landscaped = true;
  if (typeof refreshInfrastructureEffects === 'function') refreshInfrastructureEffects(scene);
  if (typeof showToast === 'function') showToast(t('estate.toast.firstBlock', { name: housingEstateDisplayName(estate) }), 'info');
  return true;
}

// A facility's lot until it is built: grass, marked as the lot it is kept for
function layHousingEstateReservedLawn(scene, slot) {
  const lawn = typeof PARK_OPTIONS !== 'undefined' ? PARK_OPTIONS.find((entry) => entry.id === 'open_ground') : null;
  if (!lawn) return;
  for (let r = 0; r < slot.size; r++) for (let c = 0; c < slot.size; c++) {
    const row = slot.row + r;
    const col = slot.col + c;
    if (!canPlaceBuildingFootprint(row, col, 1, 1)) continue;
    if (placePark(scene, row, col, lawn, { free: true, refresh: false })) buildingData[getTileId(row, col)].estateReserved = slot.kind;
  }
}

// Each growth pulse (sim-growth.js): every estate with a block still to open may open one, as a
// residential zone grows - with demand, road access and power. Monthly, 空格綠化 for zones outside estates.
function growHousingEstates(scene, random = Math.random) {
  const estates = Object.values(getHousingEstates());
  const demand = Number(city.demandR) || 0;
  const cityPower = city.powerRatio ?? 1;
  estates.forEach((estate) => {
    if (!estate.landscaped && getHousingEstateProgress(estate).built > 0) landscapeHousingEstate(scene, estate);
    if (demand <= 0) return;
    const slot = nextHousingEstateHomeSlot(scene, estate);
    if (!slot) return;
    if (typeof isWorldGameActive === 'function' && isWorldGameActive() && !shouldRenderWorldTile(slot.row, slot.col)) return;
    if (!housingEstateHasRoad(estate)) return;
    const powered = !!powerMap[slot.row]?.[slot.col];
    const powerMul = powered ? Math.max(0.06, Math.min(1, 0.08 + cityPower * 0.92)) : 0.03;
    const density = zoneDensityMap[slot.row]?.[slot.col] ?? estate.density;
    const chance = Math.min(0.85, demand * GROW_CHANCE_BASE * powerMul * (DENSITY_GROW_MUL[density] ?? 1) * 3);
    if (random() < chance) openHousingEstateBlock(scene, estate, slot);
  });
  if (city.tick % TICKS_PER_MONTH === 0) {
    fillHousingZoneGaps(scene);
    pruneHousingEstates();
  }
}

// The estate's land reaches a road: its own paths carry the residents to the blocks inside
function housingEstateHasRoad(estate) {
  let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity;
  estate.slots.forEach((slot) => {
    top = Math.min(top, slot.row); left = Math.min(left, slot.col);
    bottom = Math.max(bottom, slot.row + slot.size); right = Math.max(right, slot.col + slot.size);
  });
  return top < Infinity && hasRoadNearFootprint(top, left, right - left, bottom - top);
}

// An estate none of whose land is still zoned for it, and with no block standing, is gone
function pruneHousingEstates() {
  const estates = getHousingEstates();
  let changed = false;
  Object.values(estates).forEach((estate) => {
    const homes = estate.slots.filter((slot) => HOUSING_ESTATE_HOME_KINDS.includes(slot.kind));
    if (homes.some(isHousingEstateSlotBuilt)) return;
    const zoned = homes.some((slot) => zoneMap[slot.row]?.[slot.col] === ZONE_RES && getHousingZoneType(slot.row, slot.col) === estate.type);
    if (zoned) return;
    delete estates[estate.id];
    changed = true;
  });
  if (changed) invalidateHousingEstateIndex();
}

// ── 空格綠化 (Norton, 2026-11-24): a 公屋／居屋 tile outside any estate that no block of its type can
// ever cover, empty six months, becomes a sitting-out area ─────────────────────────────────────────

const HOUSING_GAP_MONTHS = 6;

// The lot sizes a housing type has art for (house model sets, whether or not their art is loaded)
function housingTypeLotSizes(type) {
  if (typeof houseModelSets === 'undefined' || !houseModelSets) return [];
  const sizes = new Set();
  Object.values(houseModelSets).forEach((models) => (models || []).forEach((model) => {
    if (!model.legacy && (model.housingType ?? 'private') === type && model.footprintCols === model.footprintRows) sizes.add(model.footprintCols);
  }));
  return [...sizes].filter((size) => size <= 4).sort((a, b) => a - b);
}

// Could any block of this type ever stand over the tile, as the land lies now?
function canHousingBlockCover(scene, row, col, sizes) {
  for (const size of sizes) {
    for (let r = row - size + 1; r <= row; r++) for (let c = col - size + 1; c <= col; c++) {
      if (canPlaceZoneBuildingFootprint(scene, r, c, ZONE_RES, size, size)) return true;
    }
  }
  return false;
}

function fillHousingZoneGaps(scene) {
  if (!city.housingGapMonths || typeof city.housingGapMonths !== 'object') city.housingGapMonths = {};
  const months = city.housingGapMonths;
  const sizes = { public: housingTypeLotSizes('public'), hos: housingTypeLotSizes('hos') };
  if (!sizes.public.length && !sizes.hos.length) return 0;
  const seen = new Set();
  let filled = 0;
  Object.keys(getHousingZones()).forEach((id) => {
    const [row, col] = id.split(':').map(Number);
    const type = getHousingZoneType(row, col);
    if (type === 'private' || !sizes[type].length || isHousingEstateTile(row, col)) return;
    if (scene.buildingSprites.has(id) || (typeof canPlaceBuilding === 'function' && !canPlaceBuilding(row, col))) return;
    if (canHousingBlockCover(scene, row, col, sizes[type])) return;
    seen.add(id);
    months[id] = (months[id] || 0) + 1;
    if (months[id] < HOUSING_GAP_MONTHS) return;
    const variant = (row + col) % 3 === 0 ? 'playground' : (row + col) % 3 === 1 ? 'garden_plaza' : 'open_ground';
    const park = typeof PARK_OPTIONS !== 'undefined' ? PARK_OPTIONS.find((entry) => entry.id === variant) : null;
    if (park && placePark(scene, row, col, park, { free: true, refresh: false })) filled += 1;
  });
  Object.keys(months).forEach((id) => { if (!seen.has(id)) delete months[id]; });
  if (filled && typeof refreshInfrastructureEffects === 'function') refreshInfrastructureEffects(scene);
  return filled;
}

// ── The estate's facilities, built by the player when it is half lived in (§6.4) ────────────────

const HOUSING_ESTATE_FACILITY_BUILDINGS = Object.freeze({ market: 'public_market', centre: 'community_centre', sports: 'sports_ground_small' });

function housingEstateFacilityReady(estate) {
  const { total, built } = getHousingEstateProgress(estate);
  return { ready: total > 0 && built >= Math.ceil(total / 2), need: Math.ceil(total / 2) };
}

function housingEstateFacilityCost(kind) {
  return Number(INFRA_COSTS[HOUSING_ESTATE_FACILITY_BUILDINGS[kind]]) || 0;
}

function buildHousingEstateFacility(estateId, slotIndex) {
  const scene = typeof activeScene !== 'undefined' ? activeScene : null;
  const estate = getHousingEstates()[estateId];
  const slot = estate?.slots?.[slotIndex];
  if (!scene || !slot || !HOUSING_ESTATE_FACILITY_KINDS.includes(slot.kind) || isHousingEstateSlotBuilt(slot)) return false;
  if (!housingEstateFacilityReady(estate).ready) return false;
  const type = HOUSING_ESTATE_FACILITY_BUILDINGS[slot.kind];
  const lock = typeof getInfraPlacementLock === 'function' ? getInfraPlacementLock(type) : { unlocked: true };
  if (lock && lock.unlocked === false) {
    showToast(typeof describeSpecialBuildingLockReason === 'function' ? describeSpecialBuildingLockReason(lock) : t('estate.toast.facilityLocked'), 'warning');
    return false;
  }
  if (city.budget < housingEstateFacilityCost(slot.kind)) {
    showToast(t('toast.notEnoughFunds'), 'warning');
    return false;
  }
  // the grass kept on its lot comes up first
  for (let r = 0; r < slot.size; r++) for (let c = 0; c < slot.size; c++) {
    const record = buildingData[getTileId(slot.row + r, slot.col + c)];
    if (record?.estateReserved) removeBuilding(scene, slot.row + r, slot.col + c);
  }
  const ok = slot.kind === 'sports'
    ? placeSportsGround(scene, slot.row, slot.col, SPORT_GROUND_OPTIONS.find((option) => option.id === 'sports_ground_small'))
    : placeInfraBuilding(scene, slot.row, slot.col, type);
  if (!ok) layHousingEstateReservedLawn(scene, slot);
  else showToast(t('estate.toast.facilityBuilt', { name: housingEstateDisplayName(estate), facility: t(`estate.facility.${slot.kind}`) }), 'success');
  if (typeof refreshInfrastructureEffects === 'function') refreshInfrastructureEffects(scene);
  if (typeof refreshInspectPanelLanguage === 'function') refreshInspectPanelLanguage();
  return ok;
}

// The estate's section of the inspect panel (inspect-panel.js)
function buildHousingEstateInspectHtml(row, col) {
  const hit = getHousingEstateAt(row, col);
  if (!hit) return '';
  const { estate } = hit;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const progress = getHousingEstateProgress(estate);
  const parks = estate.slots.filter((slot) => HOUSING_ESTATE_PARK_KINDS.includes(slot.kind)).reduce((sum, slot) => sum + slot.size * slot.size, 0);
  const perPerson = progress.population ? (parks * 400) / progress.population : 0;
  const readiness = housingEstateFacilityReady(estate);
  const facilities = estate.slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => HOUSING_ESTATE_FACILITY_KINDS.includes(slot.kind)).map(({ slot, index }) => {
    const name = t(`estate.facility.${slot.kind}`);
    if (isHousingEstateSlotBuilt(slot)) return `<div class="insp-row insp-ok">${escape(t('estate.inspect.facilityBuilt', { facility: name }))}</div>`;
    if (!readiness.ready) return `<div class="insp-row insp-muted">${escape(t('estate.inspect.facilityWaiting', { facility: name, need: readiness.need }))}</div>`;
    return `<button class="insp-action-btn" type="button" onclick="buildHousingEstateFacility('${escape(estate.id)}', ${index})">${escape(t('estate.inspect.facilityBuild', { facility: name, cost: housingEstateFacilityCost(slot.kind).toLocaleString() }))}</button>`;
  }).join('');
  const label = hit.slot.label ? ` · ${escape(t('estate.inspect.block', { label: hit.slot.label }))}` : '';
  return `
    <div class="insp-section">
      <div class="insp-zone-name">🏘 ${escape(housingEstateDisplayName(estate))}（${escape(t(`estate.type.${estate.type}`))}）${label}</div>
      <div class="insp-row insp-muted">${escape(t('estate.inspect.blocks', { built: progress.built, total: progress.total, population: progress.population.toLocaleString() }))}</div>
      <div class="insp-row insp-muted">${escape(t('estate.inspect.openSpace', { parks, perPerson: perPerson.toFixed(1) }))}</div>
      ${estate.landscapingDue > 0 ? `<div class="insp-row insp-warn">${escape(t('estate.inspect.landscapingDue', { cost: estate.landscapingDue.toLocaleString() }))}</div>` : ''}
      ${facilities}
    </div>`;
}

// ── The drag preview (placement-previews.js): each block, facility and park the drag would plan ──

function drawHousingEstatePlanPreview(scene, g, r1, c1, r2, c2, type, density) {
  const { plan, text, hint } = housingEstateSummaryForRect(r1, c1, r2, c2, type, density);
  const colors = { block: 0xffffff, low: 0xe8e2d0, estate8: 0xffffff, market: 0xffa040, centre: 0xff7a7a, sports: 0x7ab8ff, park3: 0x4fcf6a, park2: 0x4fcf6a, park1: 0x4fcf6a };
  plan.slots.forEach((slot) => {
    const isHome = HOUSING_ESTATE_HOME_KINDS.includes(slot.kind);
    const corners = [
      getTileFaceVertices(slot.row, slot.col, scene.offsetX, scene.offsetY, TILE_WIDTH / 2, TILE_HEIGHT / 2),
      getTileFaceVertices(slot.row, slot.col + slot.size - 1, scene.offsetX, scene.offsetY, TILE_WIDTH / 2, TILE_HEIGHT / 2),
      getTileFaceVertices(slot.row + slot.size - 1, slot.col + slot.size - 1, scene.offsetX, scene.offsetY, TILE_WIDTH / 2, TILE_HEIGHT / 2),
      getTileFaceVertices(slot.row + slot.size - 1, slot.col, scene.offsetX, scene.offsetY, TILE_WIDTH / 2, TILE_HEIGHT / 2),
    ].flat();
    let north = corners[0], east = corners[0], south = corners[0], west = corners[0];
    corners.forEach((pt) => {
      if (pt.y < north.y) north = pt;
      if (pt.x > east.x) east = pt;
      if (pt.y > south.y) south = pt;
      if (pt.x < west.x) west = pt;
    });
    g.fillStyle(colors[slot.kind] ?? 0xffffff, isHome ? 0.28 : 0.32);
    g.lineStyle(isHome ? 2 : 1, colors[slot.kind] ?? 0xffffff, isHome ? 0.95 : 0.6);
    g.beginPath();
    g.moveTo(north.x, north.y); g.lineTo(east.x, east.y); g.lineTo(south.x, south.y); g.lineTo(west.x, west.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  });
  if (typeof showUnderseaTunnelPreviewLabel === 'function') {
    // (over the middle of the site, so it stays on screen whichever corner the drag began at)
    showUnderseaTunnelPreviewLabel(scene, Math.round((r1 + r2) / 2), Math.round((c1 + c2) / 2), hint ? `${text}\n${hint}` : text, plan.blocks + plan.lowBlocks > 0);
  }
}

// ── 第一次揀公屋／居屋: the one-time tip (§7) ──────────────────────────────────────────────────────

const HOUSING_ESTATE_TIP_KEY = 'citybuilder.housingEstateTip.v1';

function showHousingEstateTipOnce() {
  if (typeof document === 'undefined') return false;
  try { if (localStorage.getItem(HOUSING_ESTATE_TIP_KEY)) return false; } catch { /* storage blocked: show it */ }
  try { localStorage.setItem(HOUSING_ESTATE_TIP_KEY, '1'); } catch { /* shown once this session at least */ }
  let dialog = document.getElementById('housing-estate-tip-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'housing-estate-tip-dialog';
    dialog.className = 'sim-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = `
      <div class="dialog-overlay" data-estate-tip-close></div>
      <div class="dialog-box" style="max-width:460px; width:92vw">
        <div class="dialog-title-bar"><span data-estate-tip-title></span><button class="dialog-close-btn" type="button" data-estate-tip-close>✕</button></div>
        <div class="dialog-body"><ol data-estate-tip-body style="margin:0; padding-left:20px; line-height:1.55"></ol></div>
        <div class="dialog-footer"><button class="dialog-ok-btn" type="button" data-estate-tip-close></button></div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll('[data-estate-tip-close]').forEach((el) => el.addEventListener('click', () => { dialog.style.display = 'none'; }));
  }
  dialog.querySelector('[data-estate-tip-title]').textContent = t('estate.tip.title');
  const body = dialog.querySelector('[data-estate-tip-body]');
  body.innerHTML = '';
  ['one', 'two', 'three', 'four'].forEach((key) => {
    const item = document.createElement('li');
    item.textContent = t(`estate.tip.${key}`);
    body.appendChild(item);
  });
  dialog.querySelector('.dialog-ok-btn').textContent = t('estate.tip.ok');
  dialog.style.display = 'flex';
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HOUSING_ESTATE_FACILITY_BLOCKS,
    HOUSING_ESTATE_LANDSCAPING_PER_TILE,
    housingEstateBlockPopulation,
    housingEstateDepthBands,
    housingEstateBlockColumns,
    planHousingEstate,
    housingEstateFront,
    housingEstateFrame,
    housingEstateItemToMap,
    largestTrueRectangle,
    splitIntoRectangles,
    planHousingEstateSite,
    summarizeHousingEstateSlots,
    normalizeHousingEstates,
    HOUSING_ESTATE_DESIGNS,
    chooseHousingEstateModels,
    nameHousingEstate,
  };
}
