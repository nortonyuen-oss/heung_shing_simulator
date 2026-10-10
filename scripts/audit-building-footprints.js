#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs', 'building-footprint-audit.md');
const TILE_METRES = 20;
const SOURCE_ROOTS = [
  'residential', 'commercial', 'industrial', 'government', 'parks',
  'powerStation', 'specialSites', 'airPort', 'containerPort', 'busDepot',
];

function evaluateValues(fileName, expression) {
  const source = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
  const context = vm.createContext({});
  return vm.runInContext(`${source}\n;(${expression})`, context, { filename: fileName });
}

function walkImages(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkImages(fullPath);
    return /\.png$/i.test(entry.name) ? [fullPath] : [];
  });
}

function relativeAsset(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function addRegistration(registrations, model, category) {
  if (!model?.path || !model.footprintCols || !model.footprintRows) return;
  const assetPath = model.path.replaceAll('\\', '/');
  const footprints = registrations.get(assetPath) ?? new Map();
  const footprint = `${model.footprintCols}x${model.footprintRows}`;
  const categories = footprints.get(footprint) ?? new Set();
  categories.add(category);
  footprints.set(footprint, categories);
  registrations.set(assetPath, footprints);
}

function flattenModels(value) {
  if (Array.isArray(value)) return value.flatMap(flattenModels);
  if (!value || typeof value !== 'object') return [];
  if (value.path) return [value];
  return Object.values(value).flatMap(flattenModels);
}

function collectRegistrations() {
  const registrations = new Map();
  const constants = evaluateValues('constants.js', `({
    POWER_PLANT_MODELS, SERVICE_BUILDING_MODELS, SERVICE_BUILDING_MODEL_VARIANTS,
    SPECIAL_BUILDING_MODELS, SPECIAL_BUILDING_MODEL_VARIANTS, HARBOR_MODELS,
    PARK_MODELS, BUS_DEPOT_MODELS, LEGACY_AIRPORT_MODEL,
    LEGACY_AIRPORT_8X8_MODEL, LEGACY_OCEAN_PARK_MODEL,
  })`);
  [
    ['power', constants.POWER_PLANT_MODELS],
    ['civic', constants.SERVICE_BUILDING_MODELS],
    ['civic', constants.SERVICE_BUILDING_MODEL_VARIANTS],
    ['landmark', constants.SPECIAL_BUILDING_MODELS],
    ['landmark', constants.SPECIAL_BUILDING_MODEL_VARIANTS],
    ['transport', constants.HARBOR_MODELS],
    ['park', constants.PARK_MODELS],
    ['transport', constants.BUS_DEPOT_MODELS],
    ['legacy save', [constants.LEGACY_AIRPORT_MODEL, constants.LEGACY_AIRPORT_8X8_MODEL,
      constants.LEGACY_OCEAN_PARK_MODEL]],
  ].forEach(([category, models]) => {
    flattenModels(models).forEach((model) => addRegistration(registrations, model, category));
  });

  const catalog = evaluateValues('model-catalog.js', `({
    HOUSE_MODEL_SETS, COMMERCIAL_BUILDING_MODEL_SETS, INDUSTRIAL_BUILDING_MODEL_SETS,
  })`);
  const zoneSets = [
    ...Object.values(catalog.HOUSE_MODEL_SETS).map((config) => ['residential', config]),
    ...catalog.COMMERCIAL_BUILDING_MODEL_SETS.map((config) => ['commercial', config]),
    ...catalog.INDUSTRIAL_BUILDING_MODEL_SETS.map((config) => ['industrial', config]),
  ];
  zoneSets.forEach(([category, config]) => {
    const directory = path.join(ROOT, config.folder);
    const disabled = new Set((config.disabledFiles ?? []).map((file) => file.toLowerCase()));
    walkImages(directory).forEach((filePath) => {
      if (disabled.has(path.basename(filePath).toLowerCase())) return;
      addRegistration(registrations, {
        path: relativeAsset(filePath),
        footprintCols: config.footprintCols,
        footprintRows: config.footprintRows,
      }, category);
    });
  });
  return registrations;
}

function escapeTable(value) {
  return String(value).replaceAll('|', '\\|');
}

function formatFootprint(footprint) {
  const [cols, rows] = footprint.split('x').map(Number);
  return `${footprint} (${cols * TILE_METRES}x${rows * TILE_METRES}m)`;
}

function baseEstimate(record, registration) {
  if (!registration) return { text: '未登記', ratio: null, confidence: '不適用' };
  const [cols, rows] = registration.split('x').map(Number);
  const ratio = record.baseSpan / record.alphaWidth;
  const widthMetres = Math.round(cols * TILE_METRES * ratio);
  const depthMetres = Math.round(rows * TILE_METRES * ratio);
  const coverage = record.baseCoverage;
  let confidence = '低';
  if (coverage >= 0.55 && ratio >= 0.75 && ratio <= 1.08) confidence = '中';
  if (coverage >= 0.8 && ratio >= 0.9 && ratio <= 1.04) confidence = '較高';
  return {
    text: `約${widthMetres}x${depthMetres}m`,
    ratio,
    confidence,
  };
}

async function inspectImage(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= 20) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) return null;

  const alphaWidth = maxX - minX + 1;
  const bottomY = maxY;
  const targetY = Math.round(bottomY - alphaWidth / 4);
  const radius = Math.max(1, Math.round(alphaWidth * 0.012));
  let bestSpan = 0;
  let bestCoverage = 0;
  for (let y = Math.max(0, targetY - radius); y <= Math.min(info.height - 1, targetY + radius); y++) {
    let rowMin = info.width;
    let rowMax = -1;
    let count = 0;
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= 20) continue;
      rowMin = Math.min(rowMin, x);
      rowMax = Math.max(rowMax, x);
      count++;
    }
    const span = rowMax >= rowMin ? rowMax - rowMin + 1 : 0;
    if (span > bestSpan) {
      bestSpan = span;
      bestCoverage = span ? count / span : 0;
    }
  }
  return {
    canvas: `${info.width}x${info.height}`,
    alphaBounds: `${alphaWidth}x${maxY - minY + 1}`,
    alphaWidth,
    baseSpan: bestSpan,
    baseCoverage: bestCoverage,
  };
}

async function main() {
  const registrations = collectRegistrations();
  const sourceFiles = SOURCE_ROOTS.flatMap((root) => walkImages(path.join(ROOT, 'Models', root)));
  const paths = new Set(sourceFiles.map(relativeAsset));
  registrations.forEach((_, assetPath) => paths.add(assetPath));

  const rows = [];
  for (const assetPath of [...paths].sort((a, b) => a.localeCompare(b))) {
    const absolutePath = path.join(ROOT, assetPath);
    const image = fs.existsSync(absolutePath) ? await inspectImage(absolutePath) : null;
    const footprints = registrations.get(assetPath);
    const sourceCategory = assetPath.split('/')[1];
    const registrationsForPath = footprints ? [...footprints.entries()] : [];
    const categoryNames = new Set(registrationsForPath.flatMap(([, categories]) => [...categories]));
    const category = categoryNames.size
      ? [...categoryNames].join(', ')
      : `${sourceCategory} (未登記)`;
    let assigned = registrationsForPath.map(([footprint]) => footprint);
    if (assigned.length === 0) {
      const folderSize = assetPath.match(/(?:^|\/)([1-9]\d*)x([1-9]\d*)(?:\/|$)/);
      if (folderSize) assigned = [`${folderSize[1]}x${folderSize[2]}?`];
    }
    const estimateText = registrationsForPath.map(([footprint]) => {
      const estimate = image ? baseEstimate(image, footprint) : null;
      return `${footprint}: ${estimate?.text ?? '圖像讀取失敗'} (${estimate?.confidence ?? '低'})`;
    }).join('; ') || '無 footprint 設定';
    const ratioText = image && registrationsForPath.length
      ? `${(image.baseSpan / image.alphaWidth * 100).toFixed(0)}%`
      : 'N/A';
    rows.push({
      assetPath,
      category,
      assigned: assigned.map((footprint) => footprint.includes('?') ? footprint : formatFootprint(footprint)).join('; ') || '未設定',
      estimateText,
      ratioText,
      imageText: image ? `${image.canvas}; alpha ${image.alphaBounds}` : '缺圖',
      status: footprints ? '已登記' : '未登記',
      ratio: image && registrationsForPath.length ? image.baseSpan / image.alphaWidth : null,
    });
  }

  const registeredCount = rows.filter((row) => row.status === '已登記').length;
  const unregistered = rows.filter((row) => row.status === '未登記');
  const potentialOutliers = rows.filter((row) => row.ratio !== null && (row.ratio < 0.8 || row.ratio > 1.08));
  const lines = [
    '# 建築模型 Footprint 尺寸盤點',
    '',
    `更新日期：${new Date().toISOString().slice(0, 10)}`,
    '',
    '## 換算原則',
    '',
    '- 地圖每格設定為 20m；方形 N×N footprint 的設定邊長是 N×20m，因此 3×3 = 60×60m、4×4 = 80×80m。若你所指的是整個方形 lot 的角對角線，則分別約為 84.9m、113.1m。',
    '- 遊戲以 PNG 的可見輪廓寬度自動縮放到 footprint 的等角投影寬度；可見總寬本身不能獨立證明底盤尺寸。',
    '- 「底盤估算」取 alpha 輪廓最前端往上約 alpha 寬度 1/4 的橫截面，按程式的 lot-fit 縮放比換算成地面邊長。只有 2D 透明 PNG，沒有 3D mesh 或建築底盤 metadata，故為圖像估算，信心欄不是測量精度保證。',
    '- 底盤估算低於登記尺寸不一定表示 footprint 錯誤：塔樓、退縮、庭園、平台或外圍空地可能是設計的一部分。需要改 footprint 前，應目視確認底座邊界及遊戲內預覽。',
    '',
    '## 總結',
    '',
    `- 建築來源圖片：${rows.length} 張；有 footprint 登記：${registeredCount} 張；未登記：${unregistered.length} 張。`,
    `- 底盤橫截面估算比例偏離設定 lot 超過門檻（小於 80% 或大於 108%）：${potentialOutliers.length} 張，請見下方逐項表格。`,
    '- 「底盤比率」是估算橫截面寬度 ÷ alpha 可見總寬度；runtime 會把總寬 fit 到 lot，所以相同比率可跨不同原始 PNG 畫布比較。',
    '',
    '## 逐項清單',
    '',
    '| 模型檔案 | 分類 | 已設定佔地（換算地面邊長） | 底盤估算邊長（信心） | 底盤比率 | 原圖 / 可見輪廓 |',
    '|---|---|---|---:|---:|---|',
    ...rows.map((row) => `| ${row.assetPath} | ${escapeTable(row.category)} | ${row.assigned} | ${row.estimateText} | ${row.ratioText} | ${row.imageText} |`),
    '',
    '## 未登記模型',
    '',
    ...(unregistered.length ? unregistered.map((row) => `- ${row.assetPath}（${row.assigned}）`) : ['- 無']),
    '',
    '## 判讀',
    '',
    '- 登記尺寸是建築可放置及碰撞使用的正式格數；底盤估算只能指出值得複核的圖像，不能自動改變建築 footprint。',
    '- 舊存檔相容設定（例如舊版機場／海洋公園）會與同一張 source PNG 分別列出，因為它們在遊戲中代表不同的佔地 footprint。',
    '',
  ];
  fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)} with ${rows.length} images (${registeredCount} registered, ${unregistered.length} unregistered).`);
  console.log(`Potential visual footprint outliers: ${potentialOutliers.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});