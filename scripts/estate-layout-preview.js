#!/usr/bin/env node
// 公屋／居屋屋邨規劃 (docs/public-housing-estate-plan.md): the layout a zoned site gets, as text, from the
// game's own planner (housing-estates.js).
//
//   node scripts/estate-layout-preview.js 10x6 [public|hos] [2|3]   one site: W (along the front road) x D (depth)
//   node scripts/estate-layout-preview.js --table [public|hos] [2|3] every site from 3x3 to 12x10
//
// The front road runs along row 0. Blocks are A座, B座... (no I, K, M, O, P, S), o = a 2x2 low block (公屋),
// 8 = the 8x8 安泰邨 estate art, M = 街市, K = 社區中心, S = 球場, P = 3x3 park, p = 2x2 park,
// . = a 1x1 休憩處／遊樂場.
'use strict';

const { planHousingEstate } = require('../housing-estates.js');

const BLOCK_LABELS = 'ABCDEFGHJLNQRTUVWXYZ';
const MARK = { low: 'o', estate8: '8', market: 'M', centre: 'K', sports: 'S', park3: 'P', park2: 'p', park1: '.' };

function render(plan) {
  const grid = Array.from({ length: plan.D }, () => Array(plan.W).fill('?'));
  let block = 0;
  plan.items.forEach((it) => {
    const label = it.kind === 'block' ? BLOCK_LABELS[block++] ?? '#' : MARK[it.kind];
    for (let r = 0; r < it.size; r++) for (let c = 0; c < it.size; c++) grid[it.row + r][it.col + c] = label;
  });
  return [`${'═'.repeat(plan.W * 2 - 1)} 前路`, ...grid.map((line) => line.join(' '))].join('\n');
}

function stats(plan) {
  const blocks = plan.items.filter((it) => it.kind === 'block' || it.kind === 'estate8').length;
  const lowBlocks = plan.items.filter((it) => it.kind === 'low').length;
  const facilities = plan.items.filter((it) => ['market', 'centre', 'sports'].includes(it.kind)).map((it) => it.kind);
  return { blocks, lowBlocks, facilities, perPerson: plan.population ? (plan.parks * 400) / plan.population : 0 };
}

function describe(plan) {
  const { blocks, lowBlocks, facilities, perPerson } = stats(plan);
  const names = { market: '街市', centre: '社區中心', sports: '球場' };
  return `${plan.W}x${plan.D} ${plan.type === 'hos' ? '居屋' : '公屋'}（${plan.density === 3 ? '高' : '中'}密度）：`
    + `${blocks} 座${plan.blockSize}x${plan.blockSize}${lowBlocks ? ` + ${lowBlocks} 座矮座` : ''}，約 ${plan.population.toLocaleString()} 人；`
    + `設施 ${facilities.map((f) => names[f]).join('、') || '—'}；休憩用地 ${plan.parks} 格（每人 ${perPerson.toFixed(1)} m²）`;
}

function table(type, density) {
  const widths = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const lines = [`D\\W ${widths.map((w) => String(w).padStart(11)).join('')}`];
  for (let D = 3; D <= 10; D++) {
    lines.push(`${String(D).padStart(3)} ${widths.map((W) => {
      const plan = planHousingEstate(W, D, type, density);
      if (plan.items.some((it) => it.kind === 'estate8')) return '8x8 邨'.padStart(10);
      const { blocks, lowBlocks, facilities, perPerson } = stats(plan);
      const f = facilities.map((k) => ({ market: 'M', centre: 'K', sports: 'S' }[k])).join('');
      return `${blocks}${lowBlocks ? `+${lowBlocks}` : ''}${f ? ` ${f}` : ''} ${perPerson.toFixed(1)}`.padStart(11);
    }).join('')}`);
  }
  return lines.join('\n');
}

module.exports = { render, describe, table, stats };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--table') {
    console.log(table(args[1] || 'public', Number(args[2] || 2)));
  } else {
    const [W, D] = String(args[0] || '10x6').split('x').map(Number);
    const plan = planHousingEstate(W, D, args[1] || 'public', Number(args[2] || 2));
    console.log(describe(plan));
    console.log(render(plan));
  }
}
