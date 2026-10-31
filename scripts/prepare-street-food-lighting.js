#!/usr/bin/env node
'use strict';

// Asset-only preparation. No runtime registration. Original generated PNGs are preserved.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..');
const ART = 'scripts/source-art/streetFood/lighting-v1';
const OUT = 'Models/streetFoodLighting';
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const slope = ([a, b]) => (b[1] - a[1]) / (b[0] - a[0]);

// Real size (Norton 2026-10-31, the 20 m tile): the two galvanised poles stand 3 m, drawn at the
// tile's true vertical rate (2.5 px/m x cos30/cos45, as the carts and people are); the span
// between them then follows from the art itself (~7.8 m), since one uniform scale keeps it isometric.
const STRING_LIGHT_POLE_HEIGHT_M = 3.0;
const STREET_FOOD_PX_PER_METRE_ALONG = 2.5;
const STREET_FOOD_TRUE_PX_PER_METRE_UP = 2.5 * Math.cos(Math.PI / 6) / Math.cos(Math.PI / 4);
// By night the bulbs throw a warm pool on the ground under the wire, baked into its own texture the
// way scripts/bake-street-lamp-textures.js bakes the lamps' sodium pool (按照夜晚路燈發光方式):
// one setTexture when the city's lamps switch on, no extra sprites. Tungsten warm white, not
// sodium orange. Semi-axes in metres along the wire and across it.
const STRING_LIGHT_POOL = Object.freeze({ alongM: 5.5, acrossM: 3.2, alpha: 0.5, rgb: [255, 196, 118] });

function stringLightDisplay(record) {
  const scale = (STRING_LIGHT_POLE_HEIGHT_M * STREET_FOOD_TRUE_PX_PER_METRE_UP) / record.poleHeightPx;
  const spanM = (Math.abs(record.groundAnchors[1][0] - record.groundAnchors[0][0]) * scale) / STREET_FOOD_PX_PER_METRE_ALONG;
  return { scale, poleHeightM: STRING_LIGHT_POLE_HEIGHT_M, spanM: Number(spanM.toFixed(4)) };
}

// The lit art over a ground pool, on a canvas widened to hold the pool. Unmirrored (pole line +0.5).
async function bakeStringLightGlow(litPng, record) {
  const display = stringLightDisplay(record);
  const pxPerM = STREET_FOOD_PX_PER_METRE_ALONG / display.scale; // art px of screen x per ground metre
  const [[ax, ay], [bx, by]] = record.groundAnchors;
  const pool = STRING_LIGHT_POOL;
  const reachX = pxPerM * (pool.alongM + pool.acrossM), reachY = (pxPerM / 2) * (pool.alongM + pool.acrossM);
  const cx0 = (ax + bx) / 2, cy0 = (ay + by) / 2;
  const [w, h] = record.outputSize;
  const padX = Math.ceil(Math.max(0, reachX - cx0, cx0 + reachX - w)) + 16;
  const padBottom = Math.ceil(Math.max(0, cy0 + reachY - h)) + 16;
  const outW = w + padX * 2, outH = h + padBottom;
  const cx = cx0 + padX, cy = cy0;
  const raw = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    // screen offset -> ground metres along the wire (u, the +0.5 diagonal) and across it (v)
    const dx = (x - cx) / pxPerM, dy = (y - cy) / (pxPerM / 2);
    const u = (dx + dy) / 2, v = (dx - dy) / 2;
    const d = Math.hypot(u / pool.alongM, v / pool.acrossM);
    if (d >= 1) continue;
    const p = (y * outW + x) * 4;
    raw[p] = pool.rgb[0]; raw[p + 1] = pool.rgb[1]; raw[p + 2] = pool.rgb[2];
    raw[p + 3] = Math.round(255 * pool.alpha * Math.pow(1 - d, 1.6));
  }
  const png = await sharp(raw, { raw: { width: outW, height: outH, channels: 4 } })
    .composite([{ input: litPng, left: padX, top: 0 }]).png().toBuffer();
  const shift = ([x, y]) => [x + padX, y];
  return { png, record: { ...record, outputSize: [outW, outH], groundAnchors: record.groundAnchors.map(shift), poleTops: record.poleTops.map(shift), pool: { ...pool, rgb: [...pool.rgb] } } };
}
const line = ([a, b], x) => a[1] + (x - a[0]) * slope([a, b]);

async function calibrate(spec, config) {
  const bytes = fs.readFileSync(path.join(ROOT, spec.source));
  const { data, info: { width, height } } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const H = config.targetPoleHeightPx;
  const column = (x) => {
    const foot = line(spec.groundAnchors, x), top = line(spec.poleTops, x);
    const d = H / (foot - top);
    assert(d > 0 && Number.isFinite(d));
    return { d, offset: H + config.targetAxisSlope * (x - spec.groundAnchors[0][0]) - d * foot };
  };
  const map = ([x, y]) => { const c = column(x); return [x, c.d * y + c.offset]; };
  let minY = Infinity, maxY = -Infinity;
  for (let x = 0; x < width; x++) {
    minY = Math.min(minY, map([x, -1])[1]);
    maxY = Math.max(maxY, map([x, height])[1]);
  }
  const padding = 40, tx = padding, ty = padding - Math.floor(minY);
  const outW = width + padding * 2, outH = Math.ceil(maxY - minY) + padding * 2 + 2;
  const output = Buffer.alloc(outW * outH * 4);
  // Inverse per-column transform, premultiplied-alpha linear interpolation.
  for (let x = 0; x < width; x++) {
    const { d, offset } = column(x);
    for (let y = 0; y < outH; y++) {
      const sy = (y - ty - offset) / d, y0 = Math.floor(sy), f = sy - y0;
      let a = 0, r = 0, g = 0, b = 0;
      for (let k = 0; k < 2; k++) {
        const yy = y0 + k;
        if (yy < 0 || yy >= height) continue;
        const p = (yy * width + x) * 4, w = (k ? f : 1 - f) * data[p + 3];
        a += w; r += w * data[p]; g += w * data[p + 1]; b += w * data[p + 2];
      }
      const alpha = Math.round(a);
      if (!alpha) continue;
      const p = (y * outW + x + tx) * 4;
      output[p] = Math.round(r / a); output[p + 1] = Math.round(g / a); output[p + 2] = Math.round(b / a); output[p + 3] = alpha;
    }
  }
  const points = (list) => list.map((p) => { const q = map(p); return [q[0] + tx, q[1] + ty]; });
  const ground = points(spec.groundAnchors), tops = points(spec.poleTops);
  assert(Math.abs(slope(ground) - config.targetAxisSlope) < 1e-9);
  assert(Math.abs(slope(tops) - config.targetAxisSlope) < 1e-9);
  for (let i = 0; i < 2; i++) assert(Math.abs(ground[i][1] - tops[i][1] - H) < 1e-9);
  let borderMax = 0, transparent = 0;
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const alpha = output[(y * outW + x) * 4 + 3];
    if (!alpha) transparent++;
    if (x < 8 || y < 8 || x >= outW - 8 || y >= outH - 8) borderMax = Math.max(borderMax, alpha);
  }
  assert.equal(borderMax, 0);
  assert(transparent > 0);
  assert.equal(hash(fs.readFileSync(path.join(ROOT, spec.source))), hash(bytes));
  const png = await sharp(output, { raw: { width: outW, height: outH, channels: 4 } }).png().toBuffer();
  return { png, record: { source: spec.source, sourceSha256: hash(bytes), sourceSize: [width, height], outputSize: [outW, outH], groundAnchors: ground, poleTops: tops, groundAxisSlope: slope(ground), poleHeightPx: H, borderMaxAlpha: borderMax, transparentPercent: Number((100 * transparent / (outW * outH)).toFixed(2)) } };
}

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, ART, 'calibration.json')));
  const records = [], files = new Map();
  let day;
  for (const state of ['day', 'night']) {
    if (!config[state]) continue;
    let prepared;
    if (config[state].kind === 'registered-resize') {
      assert(day, 'The calibrated day image must exist before registering night');
      const bytes = fs.readFileSync(path.join(ROOT, config[state].source));
      const info = await sharp(bytes).metadata();
      const [w, h] = day.record.outputSize;
      assert(Math.abs(w / info.width - h / info.height) < 0.001, 'Night edit changed aspect ratio');
      const map = ([x, y]) => [(x + 0.5) * w / info.width - 0.5, (y + 0.5) * h / info.height - 0.5];
      const observedGround = config[state].observedGroundAnchors.map(map);
      const observedTops = config[state].observedPoleTops.map(map);
      const residuals = [...observedGround.map((p, i) => Math.hypot(p[0] - day.record.groundAnchors[i][0], p[1] - day.record.groundAnchors[i][1])), ...observedTops.map((p, i) => Math.hypot(p[0] - day.record.poleTops[i][0], p[1] - day.record.poleTops[i][1]))];
      const maximum = Math.max(...residuals);
      assert(maximum <= config[state].maxLandmarkResidualPx, `Night landmarks shifted by ${maximum}px`);
      const raw = await sharp(bytes).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
      // The generated night canvas has alpha=1 background dust. Remove only this
      // visually negligible noise; retain all meaningful translucent bulb halos.
      for (let p = 0; p < raw.length; p += 4) if (raw[p + 3] <= 1) raw.fill(0, p, p + 4);
      const png = await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
      let transparent = 0, borderMax = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const a = raw[(y * w + x) * 4 + 3];
        if (!a) transparent++;
        if (x < 8 || y < 8 || x >= w - 8 || y >= h - 8) borderMax = Math.max(borderMax, a);
      }
      assert.equal(borderMax, 0);
      assert(transparent > 0);
      prepared = { png, record: { ...day.record, source: config[state].source, sourceSha256: hash(bytes), sourceSize: [info.width, info.height], transparentPercent: Number((100 * transparent / (w * h)).toFixed(2)), registration: { method: 'Resize imagegen night edit to day canvas', observedGroundAnchors: observedGround, observedGroundAxisSlope: slope(observedGround), maxManualLandmarkResidualPx: maximum, pixelIdenticalGeometry: false } } };
      assert.equal(hash(fs.readFileSync(path.join(ROOT, config[state].source))), hash(bytes));
    } else prepared = await calibrate(config[state], config);
    if (state === 'day') day = prepared;
    const variants = [[state, prepared]];
    if (state === 'night') variants.push(['glow', await bakeStringLightGlow(prepared.png, prepared.record)]);
    for (const [variant, { png, record }] of variants) for (const mirrored of [false, true]) {
      const suffix = variant === 'night' ? '__lit' : variant === 'glow' ? '__glow' : '';
      const name = `sf_stringLights_${mirrored ? 'up' : 'down'}${suffix}.png`;
      const data = mirrored ? await sharp(png).flop().png().toBuffer() : png;
      const anchors = mirrored ? record.groundAnchors.map(([x, y]) => [record.outputSize[0] - 1 - x, y]) : record.groundAnchors;
      const tops = mirrored ? record.poleTops.map(([x, y]) => [record.outputSize[0] - 1 - x, y]) : record.poleTops;
      for (let i = 0; i < 2; i++) {
        assert.equal(anchors[i][0], tops[i][0]);
        assert(Math.abs(anchors[i][1] - tops[i][1] - config.targetPoleHeightPx) < 1e-9);
      }
      const registration = record.registration && { ...record.registration, observedGroundAnchors: mirrored ? record.registration.observedGroundAnchors.map(([x, y]) => [record.outputSize[0] - 1 - x, y]) : record.registration.observedGroundAnchors, observedGroundAxisSlope: record.registration.observedGroundAxisSlope * (mirrored ? -1 : 1) };
      const asset = { ...record, state: variant, mirrored, display: stringLightDisplay(record), outputPath: `${OUT}/${name}`, outputSha256: hash(data), groundAnchors: anchors, poleTops: tops, groundAxisSlope: slope(anchors), ...(registration ? { registration } : {}) };
      records.push(asset); files.set(asset.outputPath, data);
    }
  }
  const manifest = { version: 1, runtimeIntegrated: true, projection: 'Ground anchor line +/-0.5; two equal projected pole heights. Small block faces remain approximate.', sourceMeasurements: `${ART}/calibration.json`, assets: records };
  const target = path.join(ROOT, 'data/street-food-lighting.json');
  if (process.argv.includes('--check')) {
    assert.deepEqual(JSON.parse(fs.readFileSync(target)), manifest);
    for (const [file, bytes] of files) assert.equal(hash(fs.readFileSync(path.join(ROOT, file))), hash(bytes));
  } else {
    fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
    for (const [file, bytes] of files) fs.writeFileSync(path.join(ROOT, file), bytes);
    fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`${process.argv.includes('--check') ? 'Verified' : 'Prepared'} ${records.length} sprites; ground slopes +/-0.5, equal pole heights, transparent borders, unchanged sources.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
