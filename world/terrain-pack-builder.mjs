#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { WORLD, chunkBounds } = require('./world-config.js');
const { WORLD_BUILDINGS } = require('./world-construction-catalog.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Legacy adapter function missing: ${name}`);
  const tail = source.slice(start + 1), next = /\n(?:async )?function \w+\(/.exec(tail);
  return source.slice(start, next ? start + 1 + next.index : source.length).trim();
}

export function decodeTerrainRows(rows, width, height) {
  if (!Array.isArray(rows) || rows.length !== height) throw new Error('Invalid terrain row count');
  const codes = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const pattern = /([WBa-i])(\d*)/gy;
    let col = 0, end = 0, match;
    while ((match = pattern.exec(rows[row]))) {
      const count = match[2] ? Number(match[2]) : 1;
      if (!Number.isSafeInteger(count) || count <= 0 || col + count > width) throw new Error(`Invalid terrain run ${row}:${col}`);
      const code = match[1] === 'W' ? 0 : match[1] === 'B' ? 1 : match[1].charCodeAt(0) - 95;
      codes.fill(code, row * width + col, row * width + col + count);
      col += count; end = pattern.lastIndex;
    }
    if (col !== width || end !== rows[row].length) throw new Error(`Incomplete terrain row ${row}: ${col}/${width}`);
  }
  return codes;
}

// Same connected-component result as terrain-generation.js, with bounded typed scratch
// buffers instead of millions of [row,col] arrays for the territory's largest water body.
function componentFinisher(width, height) {
  const queue = new Uint32Array(width * height);
  return function (terrain, heights, type, minSize, replacement) {
    const visited = new Uint8Array(width * height);
    for (let index = 0; index < visited.length; index++) {
      const row = Math.floor(index / width), col = index % width;
      if (visited[index] || terrain[row][col] !== type) continue;
      let head = 0, tail = 1; queue[0] = index; visited[index] = 1;
      while (head < tail) {
        const current = queue[head++], r = Math.floor(current / width), c = current % width;
        const visit = next => {
          if (visited[next]) return;
          const nr = Math.floor(next / width), nc = next % width;
          if (terrain[nr][nc] !== type) return;
          visited[next] = 1; queue[tail++] = next;
        };
        if (r > 0) visit(current - width);
        if (r + 1 < height) visit(current + width);
        if (c > 0) visit(current - 1);
        if (c + 1 < width) visit(current + 1);
      }
      if (tail < minSize) for (let i = 0; i < tail; i++) {
        const r = Math.floor(queue[i] / width), c = queue[i] % width;
        terrain[r][c] = replacement; heights[r][c] = 0;
      }
    }
  };
}

export function prepareTerrain(codes, width, height, terrainSource = fs.readFileSync(path.join(ROOT, 'terrain-generation.js'), 'utf8')) {
  const terrain = new Uint8Array(codes.length), elevations = new Uint8Array(codes.length);
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    terrain[i] = code === 0 ? 5 : code === 1 ? 4 : code === 2 ? 1 : 6;
    elevations[i] = code > 2 ? code - 2 : 0;
  }
  const rows = Array.from({ length: height }, (_, r) => terrain.subarray(r * width, (r + 1) * width));
  const heights = Array.from({ length: height }, (_, r) => elevations.subarray(r * width, (r + 1) * width));
  // Existing slope/topology rules remain the source of truth; run ONCE before cutting chunks.
  const finish = new Function('width', 'height', 'components', `
    const MAP_WIDTH=width, MAP_HEIGHT=height, GROUND=1, ROAD=2, DIRT=3, BEACH=4, WATER=5, HILL=6, MAX_TERRAIN_HEIGHT=8;
    const isInsideMap=(r,c)=>r>=0&&r<height&&c>=0&&c<width;
    const areOppositeDirs=(a,b)=>(a==='n'&&b==='s')||(a==='s'&&b==='n')||(a==='e'&&b==='w')||(a==='w'&&b==='e');
    ${terrainSource}
    removeTinyTerrainComponents=components;
    return finishHkTerrain;
  `)(width, height, componentFinisher(width, height));
  finish(rows, heights);
  return { terrain, elevations };
}

export function legacyAdapterSource(main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8'), keys = fs.readFileSync(path.join(ROOT, 'tile-keys.js'), 'utf8')) {
  const terrainFunctions = ['rotateTileKey', 'getBeachKey', 'getWaterKey', 'getHillKey', 'normalizeHillOpenEdges',
    'areOppositeDirs', 'getHillOpenEdges', 'getWaterPatternKey', 'getTerrainPatternKey', 'getShorelineKey',
    'getAdjacentEdges', 'getOpenEdges', 'getCornerPairSuffix', 'rotateCornerSuffixCCW', 'rotateCornerSuffix180',
    'isWaterDiagonalForCorner', 'isTerrainType', 'isOnMapEdge', 'getMixedCornerKey', 'getEdgePatternKey'];
  return `// Generated from main.js and tile-keys.js. Rebuild; do not edit this file.\n(function(root){
    const api=root.HeungShingWorld ||= {};
    api.createLegacyWorldProjection=function(world){
      const MAP_WIDTH=world.width,MAP_HEIGHT=world.height,TILE_WIDTH=100,TILE_HEIGHT=50,ORIGIN_X=MAP_HEIGHT*50;
      let mapRotation=0;
      ${extractFunction(main, 'isoToScreen')}
      ${extractFunction(main, 'screenToIso')}
      ${extractFunction(fs.readFileSync(path.join(ROOT, 'building-placement.js'), 'utf8'), 'getBuildingAnchor')}
      return {project:isoToScreen,unproject:screenToIso,buildingAnchor:getBuildingAnchor,setRotation(value){mapRotation=value;}};
    };
    api.createLegacyTerrainVisuals=function(world){
      const MAP_WIDTH=world.width,MAP_HEIGHT=world.height,WATER=5,BEACH=4,HEIGHT_STEP_PIXELS=13;
      let read,roadRead;
      const rows=new Map();
      const mapData=new Proxy({}, {get(_,row){
        if(!rows.has(row))rows.set(row,new Proxy({}, {get(_,col){return read(Number(col),Number(row)).terrainType;}}));
        return rows.get(row);
      }});
      const getTileHeight=(row,col)=>read(col,row).height;
      const isInsideMap=(row,col)=>row>=0&&row<MAP_HEIGHT&&col>=0&&col<MAP_WIDTH;
      const isHarborFrontageTile=()=>false,isTyphoonShelterQuayTileSafe=()=>false;
      const isBridgeTile=()=>false,getRoadCarriagewayBand=()=>null,getRoadEdgeExitSide=()=>null;
      const isRoadLikeTile=(row,col)=>roadRead(col,row);
      ${extractFunction(keys, 'getRoadSlopeKey')}
      ${extractFunction(main, 'isSlopeTile')}
      ${extractFunction(main, 'getSupportedRoadSlopeKey')}
      ${extractFunction(keys, 'getRoadKey')}
      ${terrainFunctions.map(name => extractFunction(keys, name)).join('\n')}
      ${['getElevationVisualOffset', 'getHillSlopeBaseHeight', 'getTerrainTileVisualOffset'].map(name => extractFunction(main, name)).join('\n')}
      function roadStyle(col,row,rotation,roads,terrain){
        roadRead=roads;read=terrain||(()=>({terrainType:1,height:0}));
        const key=rotateTileKey(getRoadKey(row,col),rotation);
        return {key,offset:getTerrainTileVisualOffset(row,col,key)};
      }
      return {describeRoadStyle:roadStyle,describeRoad(col,row,rotation,roads,terrain){return roadStyle(col,row,rotation,roads,terrain).key;},describe(col,row,rotation,sample){
        read=sample;
        const tile=read(col,row);
        const base=tile.terrainType===5?getWaterKey(row,col):tile.terrainType===4?getBeachKey(row,col):tile.height>0?getHillKey(row,col):'ground_full';
        const key=rotateTileKey(base,rotation),offset=getTerrainTileVisualOffset(row,col,key);
        return {key,offset,shade:key.startsWith('hill_')?tile.height:0};
      }};
    };
  })(globalThis);\n`;
}

async function createAtlas(out) {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const files = {};
  for (const match of main.matchAll(/this\.load\.image\('((?:ground|dirt|water|beach|hill)_[^']+)',\s*`\$\{roadPath\}([^`]+)`\)/g)) files[match[1]] = match[2];
  if (!files.ground_full || !files.water_full || !files.hill_edge_n) throw new Error('Terrain art registry changed');
  const cells = [], frames = {};
  for (const [key, file] of Object.entries(files)) {
    const input = path.join(ROOT, 'kenney_isometric-roads/png', file), info = await sharp(input).metadata();
    if (info.width !== 100 || info.height > 80) throw new Error(`Unexpected terrain art size ${file}`);
    // The existing art ranges from 58 to 80 pixels high. Pad ABOVE it so its original
    // origin(0.5,1) foot stays unchanged, including the taller south-facing hill pieces.
    const data = await sharp(input).ensureAlpha().extend({ top: 80 - info.height, bottom: 0, left: 0, right: 0,
      background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer();
    for (let shade = 0; shade <= (key.startsWith('hill_') || key === 'ground_full' ? 8 : 0); shade++) {
      const name = `${key}@${shade}`, pixels = Buffer.from(data), factor = Math.max(0, Math.round((1 - shade * 0.08) * 255)) / 255;
      for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(pixels[i + c] * factor);
      cells.push({ name, pixels });
    }
  }
  const columns = 10, width = columns * 100, height = Math.ceil(cells.length / columns) * 80;
  const layers = await Promise.all(cells.map(async (cell, index) => {
    const left = index % columns * 100, top = Math.floor(index / columns) * 80;
    frames[cell.name] = { frame: { x: left, y: top, w: 100, h: 80 }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 100, h: 80 }, sourceSize: { w: 100, h: 80 } };
    return { input: await sharp(cell.pixels, { raw: { width: 100, height: 80, channels: 4 } }).png().toBuffer(), left, top };
  }));
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toFile(path.join(out, 'terrain-atlas.png'));
  fs.writeFileSync(path.join(out, 'terrain-atlas.json'), JSON.stringify({ frames, meta: { image: 'terrain-atlas.png', size: { w: width, h: height }, scale: '1' } }));
  return { image: 'terrain-atlas.png', atlas: 'terrain-atlas.json', width, height, rgbaBytes: width * height * 4 };
}

async function createLod(out, name, region, terrain, elevations, world, projectionFactory) {
  const views = [];
  // Match the actual terrain art's top-face colours so the LOD/detail transition does not
  // turn the sea blue or lighten high hills. Keep the LOD independent of live map arrays.
  const palette = {};
  for (const [type, file] of [[1, 'grassWhole.png'], [4, 'beach.png'], [5, 'water.png']]) {
    const input = path.join(ROOT, 'kenney_isometric-roads/png', file), metadata = await sharp(input).metadata();
    const stats = await sharp(input).extract({ left: 45, top: metadata.height - 43, width: 10, height: 6 }).stats();
    palette[type] = stats.channels.slice(0, 3).map(channel => channel.mean);
  }
  for (let rotation = 0; rotation < 4; rotation++) {
    const projection = projectionFactory(world); projection.setRotation(rotation);
    const corners = [[region.col - .5, region.row - .5], [region.col + region.width - .5, region.row - .5],
      [region.col - .5, region.row + region.height - .5], [region.col + region.width - .5, region.row + region.height - .5]].map(([c, r]) => projection.project(c, r));
    const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y)) - 40;
    const worldWidth = Math.max(...corners.map(p => p.x)) - minX, worldHeight = Math.max(...corners.map(p => p.y)) - 40 - minY;
    const width = 1024, height = Math.max(1, Math.ceil(width * worldHeight / worldWidth));
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const point = projection.unproject(minX + (x + .5) / width * worldWidth, minY + (y + .5) / height * worldHeight + 40);
      const col = Math.round(point.x), row = Math.round(point.y);
      if (col < region.col || col >= region.col + region.width || row < region.row || row >= region.row + region.height) continue;
      const at = row * world.width + col, type = terrain[at], h = elevations[at];
      const base = palette[type === 6 ? 1 : type], shade = type === 6 ? Math.round((1 - h * .08) * 255) / 255 : 1;
      const color = base.map(channel => Math.round(channel * shade));
      const dest = (y * width + x) * 4;
      rgba[dest] = color[0]; rgba[dest + 1] = color[1]; rgba[dest + 2] = color[2]; rgba[dest + 3] = 255;
    }
    const url = `${name}-r${rotation}.webp`;
    await sharp(rgba, { raw: { width, height, channels: 4 } }).webp({ lossless: true }).toFile(path.join(out, url));
    views.push({ url, rotation, x: minX, y: minY, width: worldWidth, height: worldHeight, pixelWidth: width, pixelHeight: height });
  }
  return views;
}

export async function buildTerrainPacks({ source = path.join(ROOT, 'hk-terrain-tiles.js'), output = path.join(ROOT, 'data/world-terrain'), progress = () => {} } = {}) {
  const sourceText = fs.readFileSync(source, 'utf8'), context = vm.createContext({});
  vm.runInContext(`${sourceText}\nglobalThis.terrainSource=HK_TERRAIN_TILES;`, context);
  const input = context.terrainSource;
  if (input.width !== WORLD.width || input.height !== WORLD.height || input.tileMetres !== 20) throw new Error('Unexpected Hong Kong source dimensions');
  const world = { ...WORLD }, start = performance.now();
  progress('Validating all RLE rows');
  const codes = decodeTerrainRows(input.rows, world.width, world.height);
  progress('Finishing terrain globally before cutting chunks');
  const { terrain, elevations } = prepareTerrain(codes, world.width, world.height);
  const temporary = `${output}.building-${process.pid}`;
  if (fs.existsSync(temporary)) throw new Error(`Build directory already exists: ${temporary}`);
  fs.mkdirSync(path.join(temporary, 'packs'), { recursive: true });
  try {
    const manifest = { format: 'heung-shing-world-terrain', schemaVersion: 1, channels: 3,
      world, baseTerrainVersion: WORLD.baseTerrainVersion, sourceSha256: hash(sourceText), rawTerrainSha256: hash(codes),
      geography: { westE: input.westE, northN: input.northN, tileMetres: input.tileMetres },
      chunks: {}, packs: {}, trial: { col: 1472, row: 1632, width: 256, height: 256, startCol: 1584, startRow: 1760 } };
    progress('Packing 64x64 storage chunks into 256x256 HTTP regions');
    for (let py = 0; py < Math.ceil(world.height / 256); py++) for (let px = 0; px < Math.ceil(world.width / 256); px++) {
      const parts = [], packId = `p:${px}:${py}`;
      let offset = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        const bounds = chunkBounds(world, 's', px * 4 + dx, py * 4 + dy);
        if (!bounds) continue;
        const bytes = Buffer.alloc(bounds.width * bounds.height * 3);
        for (let r = 0; r < bounds.height; r++) for (let c = 0; c < bounds.width; c++) {
          const at = (bounds.row + r) * world.width + bounds.col + c, to = (r * bounds.width + c) * 3;
          bytes[to] = codes[at]; bytes[to + 1] = terrain[at]; bytes[to + 2] = elevations[at];
        }
        manifest.chunks[bounds.id] = { pack: packId, offset, length: bytes.length, width: bounds.width, height: bounds.height };
        offset += bytes.length; parts.push(bytes);
      }
      const data = Buffer.concat(parts), url = `packs/p-${px}-${py}.bin`;
      fs.writeFileSync(path.join(temporary, url), data);
      manifest.packs[packId] = { url, bytes: data.length, sha256: hash(data) };
    }
    progress('Building terrain atlas and independent four-direction LOD images');
    const adapterSource = legacyAdapterSource();
    const adapterContext = vm.createContext({}); vm.runInContext(adapterSource, adapterContext);
    const projectionFactory = adapterContext.HeungShingWorld.createLegacyWorldProjection;
    fs.writeFileSync(path.join(temporary, 'legacy-terrain-adapter.js'), adapterSource);
    manifest.adapterSha256 = hash(adapterSource);
    manifest.art = await createAtlas(temporary);
    fs.mkdirSync(path.join(temporary, 'buildings'));
    manifest.construction = {};
    for (const model of Object.values(WORLD_BUILDINGS)) {
      const url = `buildings/${model.id}.webp`;
      await sharp(path.join(ROOT, model.path)).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 90 }).toFile(path.join(temporary, url));
      manifest.construction[model.id] = { url };
    }
    manifest.lod = await createLod(temporary, 'overview', { col: 0, row: 0, width: world.width, height: world.height }, terrain, elevations, world, projectionFactory);
    manifest.trial.lod = await createLod(temporary, 'trial', manifest.trial, terrain, elevations, world, projectionFactory);
    fs.writeFileSync(path.join(temporary, 'manifest.json'), JSON.stringify(manifest));
    if (fs.existsSync(output)) {
      const existingManifest = path.join(output, 'manifest.json');
      if (!fs.existsSync(existingManifest) || JSON.parse(fs.readFileSync(existingManifest, 'utf8')).format !== manifest.format) throw new Error('Refusing to replace an unrecognised output directory');
      const backup = `${output}.previous-${process.pid}`;
      fs.renameSync(output, backup);
      try { fs.renameSync(temporary, output); } catch (error) { fs.renameSync(backup, output); throw error; }
      fs.rmSync(backup, { recursive: true });
    } else fs.renameSync(temporary, output);
    return { output, storageChunks: Object.keys(manifest.chunks).length, regionPacks: Object.keys(manifest.packs).length,
      terrainBytes: codes.length * 3, atlasBytes: manifest.art.rgbaBytes, elapsedMs: Math.round(performance.now() - start) };
  } catch (error) { fs.rmSync(temporary, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputAt = process.argv.indexOf('--output');
  buildTerrainPacks({ ...(outputAt >= 0 ? { output: path.resolve(process.argv[outputAt + 1]) } : {}), progress: message => process.stdout.write(`${message}\n`) })
    .then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => { console.error(error); process.exitCode = 1; });
}
