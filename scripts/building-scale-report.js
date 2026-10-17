#!/usr/bin/env node
// Summarise the 建築比例量度 survey (data/building-scale-survey.json, written by the test-mode tool
// in building-scale-survey.js): every measured model sorted by the tile size its art implies, the
// spread, and the building models under Models/ not measured yet.
//
//   node scripts/building-scale-report.js [--json] [survey.json]
//
// tileM is what one 100 px tile would measure if the art were a true 2:1 projection; vsPeople is the
// model's px a metre of height over the people's 5. Reference points from the 2026-10-17 checks: the
// people and street props draw ~12 m tiles (5 px a metre), roads and vehicles ~15 m, the gameplay
// unit is 20 m.
const fs = require('node:fs');
const path = require('node:path');
const { summarizeBuildingScaleSurvey } = require('../building-scale-survey.js');

const ROOT = path.resolve(__dirname, '..');
// Folders whose PNGs are building models (night bakes and other __ variants left out).
const BUILDING_MODEL_DIRS = ['residential', 'commercial', 'industrial', 'government', 'specialSites', 'parks'];

function listBuildingModelPaths(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.png') && !entry.name.includes('__')) out.push(path.relative(root, full).split(path.sep).join('/'));
    });
  };
  BUILDING_MODEL_DIRS.forEach((dir) => walk(path.join(root, 'Models', dir)));
  return out.sort();
}

function buildBuildingScaleReport(survey, modelPaths) {
  const measurements = survey?.measurements || {};
  const summary = summarizeBuildingScaleSurvey(measurements);
  const unmeasured = modelPaths.filter((p) => !measurements[p]);
  return { ...summary, total: new Set([...modelPaths, ...Object.keys(measurements)]).size, unmeasured };
}

function formatBuildingScaleReport(report) {
  const lines = [];
  const n = (v, d = 1) => (v == null ? '—' : v.toFixed(d));
  lines.push(`建築比例量度：已量 ${report.count} / ${report.total} 個模型`);
  if (report.count) {
    lines.push(`一格米數 中位數 ${n(report.median)} m，10–90% ${n(report.p10)}–${n(report.p90)} m`);
    lines.push('參考：人物 ≈ 12 m、路面車輛 ≈ 15 m、玩法單位 20 m');
    lines.push('');
    report.buckets.forEach((b) => lines.push(`  ${b.label.padEnd(8)} ${'█'.repeat(b.count)} ${b.count}`));
    lines.push('');
    lines.push('  一格(m)  相對人物  佔地   模型');
    report.rows.forEach((r) => {
      lines.push(`  ${n(r.tileM).padStart(6)}  ${n(r.vsPeople, 2).padStart(7)}×  ${String((r.footprint || []).join('×')).padEnd(5)} ${r.path}`);
    });
  }
  if (report.unmeasured.length) {
    lines.push('');
    lines.push(`未量度（${report.unmeasured.length}）：`);
    report.unmeasured.forEach((p) => lines.push(`  ${p}`));
  }
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) || path.join(ROOT, 'data/building-scale-survey.json');
  const survey = JSON.parse(fs.readFileSync(file, 'utf8'));
  const report = buildBuildingScaleReport(survey, listBuildingModelPaths());
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatBuildingScaleReport(report));
}

module.exports = { listBuildingModelPaths, buildBuildingScaleReport, formatBuildingScaleReport, BUILDING_MODEL_DIRS };
