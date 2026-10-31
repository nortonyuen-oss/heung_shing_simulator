#!/usr/bin/env node
// Read-only with respect to art/runtime: exact raster geometry + explicit, uncertain reference rulers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const sharp = require('sharp');
const { buildRows, getRegistrations } = require('./audit-world-scale.js');
const ROOT = path.resolve(__dirname, '..');
const UP = Math.sqrt(1.5) * 2.5;
const ALONG = 2.5;
const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const round = (n, places = 3) => Number(n.toFixed(places));
const names = ['residential', 'commercial', 'civic-industry', 'public-landmarks', 'vehicles'];
const records = names.flatMap(name => {
  const file = `data/scale-measurements-${name}.json`;
  if (!fs.existsSync(path.join(ROOT, file))) throw new Error(`Missing measurement batch: ${file}`);
  return readJSON(file).assets.map(asset => ({ ...asset, recordSource: file }));
});
const recordMap = new Map(records.map(record => [record.path, record]));
if (recordMap.size !== records.length) throw new Error('Duplicate manual measurement path');
const propMap = new Map(readJSON('data/scale-measurements-prop-metadata.json').assets.map(record => [record.path, record]));
const corners = vm.runInNewContext(`${fs.readFileSync(path.join(ROOT, 'constants.js'), 'utf8')}\n;BUILDING_GROUND_CORNERS`);
const CATEGORY_LABELS = {
  airPort: '機場', aircraft: '飛機', bareLand: '裸地 地底', busDepot: '巴士廠', busStop: '巴士站',
  commercial: '商業 商廈 摩天大樓', containerPort: '港口 貨櫃碼頭', festivals: '節慶 活動',
  government: '政府 公共設施', industrial: '工業 工廠 科學園', landscape: '地景 地形', parks: '公園 球場',
  powerStation: '電廠 發電站', residential: '住宅', roadAssessories: '道路配件', specialSites: '地標 特殊建築',
  streetFood: '街頭小食 攤檔', streetFoodPeople: '人物', traffic: '交通 車輛', trafficLight: '交通燈',
  trees: '樹木', typhoonShelter: '避風塘', vessels: '船隻', 'kenney_isometric-roads': 'Kenney 道路來源', newRoadTiles: '道路模組',
};
function assetLabel(item) {
  const names = [[/library/i, '圖書館'], [/sic?encePark2-03/i, '金蛋'], [/sci?encePark|sicencePark/i, '科學園'],
    [/hospital/i, '醫院'], [/primarySchool/i, '小學'], [/secondarySchool/i, '中學'], [/university/i, '大學'],
    [/coal/i, '煤電廠'], [/nuclear/i, '核電廠'], [/solar/i, '太陽能電廠'], [/stadium/i, '足球場'],
    [/pool/i, '泳池'], [/victoriaPark/i, '維多利亞公園'], [/bankOfChina/i, '中銀大廈']];
  return [...names.filter(([re]) => re.test(item.path)).map(([, name]) => name), CATEGORY_LABELS[item.category] || item.category].join(' · ');
}

function measureReference(ref, groundWidth) {
  const dx = ref.b[0] - ref.a[0];
  const dy = ref.b[1] - ref.a[1];
  const vertical = ref.axis === 'vertical';
  const span = Math.abs(vertical ? dy : dx);
  const error = (ref.pixelError ?? 4) * 2; // each endpoint may move; worst-case span error
  if (!(span > 0) || !ref.realM?.every(n => Number.isFinite(n) && n > 0)) throw new Error(`Invalid reference ${ref.id}`);
  if (vertical && Math.abs(dx) > 0.01) throw new Error(`Vertical reference moves sideways: ${ref.id}`);
  const factor = vertical ? UP : ALONG;
  const scales = [factor * ref.realM[0] / (span + error), factor * ref.realM[1] / span,
    span > error ? factor * ref.realM[2] / (span - error) : null];
  return { ...ref, sourceSpanPx: round(span), deltaPx: [round(dx), round(dy)],
    expectedSlope: vertical ? null : 0.5,
    observedSlope: vertical ? null : round(Math.abs(dy / dx)),
    projectionMismatch: !vertical && Math.abs(Math.abs(dy / dx) - 0.5) > 0.1,
    targetScreenScale: scales.map(n => n === null ? null : round(n, 6)),
    targetSquareLotTiles: groundWidth ? scales.map(n => n === null ? null : round(n * groundWidth / 100)) : null,
    caveat: '米數是假設或地標／場地設計情境；區間包含取點與參考尺寸範圍，並非統計信賴區間。',
  };
}

function pickRecommendation(rulers, record, current) {
  if (record?.definedLot) return { status: '格網定義', lot: record.definedLot, text: `${record.definedLot.join('×')}（20m格網定義）` };
  if (!rulers.length) return { status: record ? '參照不明' : '只有像素／來源配置', lot: null, text: '無足夠獨立實尺；不可由PNG唯一推導格數' };
  const primary = rulers.find(r => r.referenceRole === 'primary') || rulers[0];
  // Compare scale itself: small objects have no registered lot, but may still carry conflicting rulers.
  const scenarios = rulers.map(r => r.targetScreenScale?.[1] ?? r.targetSquareLotTiles?.[1]).filter(n => n > 0);
  const ratio = scenarios.length > 1 ? Math.max(...scenarios) / Math.min(...scenarios) : 1;
  const conflict = ratio > 1.25;
  const ambiguous = record?.status === 'ambiguous-reference';
  const scenarioOnly = rulers.every(r => r.scenarioOnly);
  const n = primary.targetSquareLotTiles?.[1];
  const nearest = n ? Math.max(1, Math.round(n)) : null;
  const lot = n ? Math.max(1, n / nearest > 1.075 ? Math.ceil(n) : nearest) : null;
  const originalSize = current.find(c => !c.legacy)?.cols;
  let text = lot ? `${lot}×${lot}（主參考情境）` : '按主參考設定米數，非地盤素材';
  if (lot && n < 1) text += `；圖像本體只約${round(n, 2)}格，補地景`;
  else if (lot && n > lot) text += `；超出地盤${round((n / lot - 1) * 100, 1)}%，須在誤差範圍內微調`;
  else if (lot && Math.abs(n / lot - 1) > 0.02) text += `；本體約${round(n / lot * 100, 1)}%地盤`;
  if (conflict) text += '；參照衝突，須分件／重製';
  else if (ambiguous) text += '；參照有歧義，未定案';
  else if (!originalSize && !lot) text += '；非地盤物件';
  if (scenarioOnly) text = n ? `設計情境約${round(n, 2)}格；無獨立實尺，暫不定格數` : '只有設計尺寸情境，未取得獨立實尺';
  if (primary.scenarioOnly && conflict) text = n ? `主設計情境需等比方形約${round(n, 2)}格，但其他參照不符；無單一建議格數，須拆件` : '設計尺寸情境與其他參照不符，須分開校正';
  return { status: conflict ? '參照衝突' : ambiguous ? '參照有歧義' : rulers.length > 1 ? '多參照情境相近' : '單參照推算',
    lot: lot && !scenarioOnly && !(primary.scenarioOnly && conflict) ? [lot, lot] : null,
    eligibleForDirectResize: !conflict && !ambiguous && !primary.scenarioOnly, text, primary: primary.id,
    referenceScaleRatio: round(ratio), range: primary.targetSquareLotTiles,
    requiredScaleVsCurrent: lot && originalSize ? round(n / originalSize, 4) : null,
    limitation: '整格數為主參照情境下的地盤建議；不是已證實的真實建築佔地。衝突時不得直接套用。' };
}

async function imageGeometry(file) {
  const bytes = fs.readFileSync(path.join(ROOT, file));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = -1, minY = info.height, maxY = -1, opaquePixels = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] <= 20) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); opaquePixels++;
  }
  return { sha256: hash, width: info.width, height: info.height, alphaThreshold: 20,
    bounds: opaquePixels ? { left: minX, top: minY, right: maxX, bottom: maxY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    opaquePixels, pixelGeometryPrecision: 'exact integer source pixels at alpha > 20; physical units not implied' };
}

async function buildMeasuredRows() {
  const inventory = buildRows();
  const registered = getRegistrations();
  const cacheFile = path.join(ROOT, '.data/scale-measurements/raster-cache.json');
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
  let next = 0;
  const out = new Array(inventory.length);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < inventory.length) {
      const index = next++;
      const item = inventory[index];
      const stat = fs.statSync(path.join(ROOT, item.path));
      const fingerprint = `${stat.size}:${stat.mtimeMs}`;
      let geometry = cache[item.path]?.fingerprint === fingerprint ? cache[item.path].geometry : null;
      if (!geometry) geometry = await imageGeometry(item.path);
      cache[item.path] = { fingerprint, geometry };
      let record = recordMap.get(item.path);
      if (record?.sourceSha256 && record.sourceSha256 !== geometry.sha256) throw new Error(`Artwork changed since manual measurement: ${item.path}`);
      let runtimeEquivalentOf = record?.runtimeEquivalentOf || null;
      if (runtimeEquivalentOf) {
        const twinHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, runtimeEquivalentOf))).digest('hex');
        if (twinHash !== geometry.sha256) throw new Error(`Runtime-equivalent art differs: ${item.path}`);
      }
      const ground = corners[item.path] || corners[runtimeEquivalentOf] || null;
      const groundWidth = ground ? ground.right[0] - ground.left[0] : geometry.bounds?.width;
      const current = registered.filter(r => r.path === (runtimeEquivalentOf || item.path));
      let inheritedFrom = record?.inheritedFrom || null;
      if (!record && item.variant) {
        const master = inventory.find(candidate => candidate.base === item.base && recordMap.has(candidate.path));
        if (master) { inheritedFrom = master.path; record = recordMap.get(master.path); }
      }
      const refs = record?.references || [];
      const rulers = [];
      if (!inheritedFrom) for (const ref of refs) {
        for (const p of [ref.a, ref.b]) if (!Array.isArray(p) || p[0] < 0 || p[1] < 0 || p[0] >= geometry.width || p[1] >= geometry.height) throw new Error(`Reference outside source: ${item.path} ${ref.id}`);
        if (ref.realM) rulers.push(measureReference(ref, current.length ? groundWidth : null));
      }
      out[index] = { path: item.path, category: item.category, label: assetLabel(item), base: item.base, variant: item.variant,
        geometry, ground: current.length ? { widthSourcePx: round(groundWidth), corners: ground,
          method: ground ? 'runtime-calibrated-ground-corners' : 'runtime-alpha-width-fit; not guaranteed physical ground edge',
          scaleAtZoom1: current.map(c => ({ key: c.key, lot: [c.cols, c.rows], legacy: c.legacy,
            sourcePixelScale: round(50 * (c.cols + c.rows) / groundWidth, 6) })) } : null,
        current: runtimeEquivalentOf ? `未獨立登記；相同像素母圖 ${current.map(c => `${c.cols}×${c.rows}`).join('/')}` : item.current,
        runtimeEquivalentOf, manual: record ? { ...record, references: undefined, inheritedFrom } : null,
        rulers, inheritedFrom, sourceCalibration: propMap.get(item.path) || null,
        recommendation: inheritedFrom ? { status: '沿用母圖；未獨立覆量', lot: null, text: `跟母圖 ${inheritedFrom}；不可直接重用鏡像座標` }
          : pickRecommendation(rulers, record, current),
        configuredSizeProposal: { text: item.proposed, caveat: '前輪配置／設計假設，沒有獨立實尺時不升格為量度結果。' },
      };
    }
  }));
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return out;
}

const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const csv = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;
function writeResults(rows) {
  const manualRows = rows.filter(r => r.manual && !r.inheritedFrom);
  const lotRows = manualRows.filter(r => r.ground);
  const summary = { date: '2026-10-17', tileMetres: 20, projection: { alongXPxPerM: ALONG, upPxPerM: UP },
    rasterFiles: rows.length, manuallyReviewedFiles: manualRows.length, lotFiles: lotRows.length,
    rulers: manualRows.reduce((n, r) => n + r.rulers.length, 0),
    lotConflicts: lotRows.filter(r => r.recommendation.status === '參照衝突').length,
    metadataFiles: rows.filter(r => r.sourceCalibration).length,
    noIndependentRulerFiles: rows.filter(r => !r.rulers.length && r.manual?.status !== 'defined-grid-module').length,
    caveat: '像素與hash精確；物理米數不是從2D插畫唯一解出的真值。參考尺寸均有明示假設／情境，所有檔案均有覆蓋狀態。' };
  fs.writeFileSync(path.join(ROOT, 'docs/world-scale-measured.json'), JSON.stringify({ summary, rows }, null, 2) + '\n');
  const columns = ['素材', '分類', '原圖', 'alpha可見寬高', '地面縮放寬px', '目前地盤', '主參照像素', '假設實尺m', '理想地盤格數低／中／高', '結論', '建議', 'SHA256'];
  fs.writeFileSync(path.join(ROOT, 'docs/world-scale-measured.csv'), '\uFEFF' + [columns.map(csv).join(','), ...rows.map(r => {
    const p = r.rulers.find(ref => ref.referenceRole === 'primary') || r.rulers[0];
    return [r.path, r.category, `${r.geometry.width}×${r.geometry.height}`, `${r.geometry.bounds?.width || 0}×${r.geometry.bounds?.height || 0}`,
      r.ground?.widthSourcePx, r.current, p?.sourceSpanPx, p?.realM?.join('/'), p?.targetSquareLotTiles?.join('/'), r.recommendation.status, r.recommendation.text, r.geometry.sha256].map(csv).join(',');
  })].join('\n') + '\n');
  const md = ['# 全部素材像素覆量及20m比例建議', '',
    `日期：2026-10-17。精確掃描${rows.length}張圖檔；${lotRows.length}張地盤母圖有逐款人工參照審閱。`, '',
    '**本表取代前輪純目視格數建議。** 像素可重現；米數依賴明列的樓層／人物／門／球場／地標情境，並非精確建築測繪。', '',
    `地盤中${summary.lotConflicts}張的參照名義比例相差超過25%。單一格數不能修正同圖內的比例矛盾；有些差異也可能來自參考類型／尺寸假設，故保留原線供審閱。`, '',
    '[帶量度線的可搜尋報告](world-scale-measured.html) · [全部1465檔CSV](world-scale-measured.csv) · [完整像素、參照與來源JSON](world-scale-measured.json)', '',
    '「理想格數」是假定整張圖等比縮放、沿用目前runtime地面縮放寬時的方形地盤邊長，不是實際地盤長闊的獨立測繪。取整只作主參考情境建議，衝突／歧義項目不能直接套用。', '',
    '區間採參照米數範圍及每端像素取點誤差的保守界限，並非統計信賴區間。alpha自動貼合可能包含招牌／樹冠等，凡沒有地面角校準者已在完整報告標記。', '',
    '## 本輪修訂重點', '',
    '| 素材 | 原圖量度與明示假設 | 推算及建議 |', '|---|---|---|',
    '| 圖書館 library2-01 | 兩層82px，假設合計8m；門扇33px，假設2.1m | 樓層推算約3.03格、門推算1.97格；建議以3×3重校樓體，門口須一併重製，不能只放大整圖。 |',
    '| 金蛋 sicencePark2-03 | 三個成人分別29／29／30px，假設1.7m | 三尺約1.78–1.84格；先保留2×2，本體約92%地盤。這是人高假設，非實景金蛋外尺寸。 |',
    '| 科學園 sciencePark2-01／2-04 | 完整樓層分別100px跨兩層、196px跨四層；工業層高4.2m | 理想約2.61／2.69格，候選3×3；人／門比例衝突需局部修圖。 |',
    '| sciencePark2-02 | 原圖標示INNOVATION RESIDENCE；179px跨三層住宅，假設每層3m | 約1.53格，保留2×2、縮本體補地台；不應套普通工廈層高。 |',
    '| sciencePark3-01／3-02 | 各跨四層135／128px，假設合計16.8m | 約3.83／4.11格，候選4×4；入口與樓層仍有明顯名義差異。 |',
    '| 醫院 | 102px跨四層，假設合計16m；圖內成人19px，假設1.7m | 主樓約5.54格，候選6×6；人物尺約3.16格，不能整圖同時校好。 |',
    '| 小學／中學 | 各跨四層205／134px，假設合計14.4m | 約2.17／3.37格；採3×3／4×4地盤時，本體約72%／84%。本次重數完整層距，取代舊七層跨度結果。 |',
    '| 港口四方向 | 單箱／拖架箱頂邊與箱高交叉量度；20／40呎分類仍為情境 | 四方向約5.8–6.1格，候選6×6；前輪8×8並非量度結果。 |',
    '| 足球場連看台 | 白線長向244px對105m、短向163px對68m | 兩軸約10.83／10.50格，候選11×11；外牆入口尺度不同，需重製看台和入口。 |',
    '| 泳池／維園網球模組 | 泳池25／50m用途不明；網球兩軸124／92px不符23.77:10.97 | 均不能由單一格數修正；須先定池型及重畫場線。維園另一張是兩個並排半場，已撤回完整籃球場假設。 |',
    '| 煤電／核電／機場 | 煤電工人與門支持約1.0–1.1格本體；核電無可信門尺；機場跑道長寬情境嚴重不符 | 先前16×16、40×40、210×80是設計預留，不能當現圖精確量度。核電與機場暫不給可直接套用的格數。 |', '',
    '「參照衝突」是固定名義假設下超過25%的差異，並不表示已證明真實建築尺寸矛盾；尤其小人物取點誤差大，仍須看各尺完整區間。', '',
    '## 逐款地盤結果', '', '| 素材 | 主尺：原圖px／假設m | 理想格數（低／中／高） | 建議 | 判讀 |', '|---|---|---|---|---|'];
  for (const r of lotRows) {
    const p = r.rulers.find(ref => ref.referenceRole === 'primary') || r.rulers[0];
    md.push(`| [${path.basename(r.path)}](../${r.path}) | ${p ? `${p.sourceSpanPx}px／${p.realM.join('/')}m` : r.manual.definedLot ? '格網定義' : '無可辨實尺'} | ${p?.targetSquareLotTiles?.map(n => n === null ? '無上界' : n.toFixed(2)).join('／') || '—'} | ${r.recommendation.text} | ${r.recommendation.status} |`);
  }
  md.push('', '## 尺度來源及限制', '',
    '- 手動樓層／門口／人物尺：data/scale-measurements-*.json，完整報告可顯示每條原圖座標線。',
    '- 公園球場標準：[ITF網球23.77×10.97m](https://www.itftennis.com/en/about-us/organisation/tennis-glossary/)、[FIBA籃球28×15m](https://www.venueguide.fiba.basketball/vanue-design)、[FIFA足球105×68m推薦](https://legal.fifa.com/innovation/stadium-guidelines/technical-guidelines/stadiums-guidelines/pitch-dimensions-and-surrounding-areas)。標準不代表插畫內場地必然符合；半場、短池及自訂球場已保留歧義。',
    '- 地標情境：[天壇大佛本體26.4m](https://www.islands.gov.hk/en/explores-tai-o-tian-tan-buddha-statue.php)、[中銀塔315／367.4m](https://www.bochk.com/en/aboutus/corpprofile/boctower.html)。僅作地標還原目標，插畫可能非實景還原。',
    '- [HKSTP官方金蛋資料](https://www.hkstp.org/en/rental/space/mice-venue/hong-kong-science-park-mice-venues)未提供可直接套用的外殼尺寸；本輪以圖內人高情境交叉核對，未冒稱有真實金蛋測繪。',
    '- 太空館官方23m是[內部投影天幕](https://hk.space.museum/en/web/spm/about-us.html)，不能誤當外殼直徑。',
    '- 道具既有metadata保留來源座標系；bake前、鏡像前座標不直接畫到另一張圖。配置heightM／lengthM全標為designAssumption，未冒充實測。',
    '- 節慶已有坐地人物0.28–0.3m及人群整組6m等配置，是縮合美術設定；須按個人骨架重設。',
    '- 日夜、鏡像、atlas及未獨立覆量的方向，有各自精確像素邊界／hash，但不能宣稱每張都獨立確定了真實米數。',
    '- 本次只寫量度與報告；未更改任何遊戲圖片、runtime格數或存檔。', '');
  fs.writeFileSync(path.join(ROOT, 'docs/world-scale-measured.md'), md.join('\n'));
  writeHTML(summary, rows);
  console.log(JSON.stringify(summary, null, 2));
}

function writeHTML(summary, rows) {
  const data = JSON.stringify(rows).replaceAll('<', '\\u003c');
  const cats = [...new Set(rows.map(r => r.category))];
  fs.writeFileSync(path.join(ROOT, 'docs/world-scale-measured.html'), `<!doctype html><html lang="zh-HK"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>20m素材像素覆量</title><style>
body{margin:20px;background:#17272d;color:#e1ece8;font:15px system-ui}a{color:#a5d9bd}h1{font-size:25px}header{max-width:1300px}input,select{padding:9px;font:inherit;margin:4px}main{display:grid;grid-template-columns:340px minmax(500px,1fr);gap:20px}aside{max-height:74vh;overflow:auto}button{display:block;width:100%;text-align:left;padding:11px;background:#263b43;color:#e7efec;border:1px solid #49656a;cursor:pointer}button small{display:block;color:#b9cfca;margin-top:5px}section{background:#22363e;padding:18px;min-width:0}figure{position:relative;margin:0;background:#13272f;max-width:1100px}figure img{display:block;width:100%;max-height:70vh;object-fit:contain}figure svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:9px;border:1px solid #4b656c;text-align:left}p,li{line-height:1.65}.warn{color:#ffd49d}.path{overflow-wrap:anywhere}@media(max-width:850px){main{display:block}aside{max-height:220px}table{font-size:11px}section{padding:8px}}</style>
<header><h1>全部素材覆量：1格＝20m</h1><p>精確像素掃描 ${summary.rasterFiles} 檔；地盤母圖人工審閱 ${summary.lotFiles} 張。<b>米數是假設／設計情境，並非由插畫唯一解出的真實尺寸。</b></p><p class="warn">${summary.lotConflicts}張地盤的參照名義比例差超過25%；衝突時不能直接套用單一格數。</p><input id="search" aria-label="搜尋" placeholder="搜尋圖書館、library、science、模型名"><select id="category" aria-label="分類"><option value="">全部分類</option>${cats.map(c => `<option>${escape(c)}</option>`).join('')}</select><label><input id="lots" type="checkbox" checked>只看地盤母圖</label><label><input id="conflicts" type="checkbox">只看參照衝突</label><p id="count"></p></header><main><aside id="list"></aside><section id="detail"></section></main>
<script>const rows=${data};const $=s=>document.querySelector(s);const ns='http://www.w3.org/2000/svg';const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};function show(r){const d=$('#detail');d.replaceChildren();d.append(el('h2',r.label+' · '+r.base),el('p',r.path));const f=el('figure'),img=el('img');img.src='../'+r.path;img.alt=r.base;const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+r.geometry.width+' '+r.geometry.height);svg.setAttribute('preserveAspectRatio','xMidYMid meet');img.style.aspectRatio=r.geometry.width+'/'+r.geometry.height;f.append(img,svg);d.append(f);for(const [i,ref]of r.rulers.entries()){const g=document.createElementNS(ns,'g'),line=document.createElementNS(ns,'line');for(const [k,v]of Object.entries({x1:ref.a[0],y1:ref.a[1],x2:ref.b[0],y2:ref.b[1],stroke:ref.referenceRole==='primary'?'#ffdf5b':'#3be5ea','stroke-width':3}))line.setAttribute(k,v);g.append(line);for(const pt of [ref.a,ref.b]){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',pt[0]);c.setAttribute('cy',pt[1]);c.setAttribute('r',5);c.setAttribute('fill','#ffdf5b');g.append(c)}const t=document.createElementNS(ns,'text');t.setAttribute('x',ref.a[0]+7);t.setAttribute('y',ref.a[1]-8);t.setAttribute('fill','white');t.setAttribute('stroke','#15262e');t.setAttribute('paint-order','stroke');t.setAttribute('stroke-width',3);t.setAttribute('font-size',19);t.textContent=(i+1)+': '+ref.id;g.append(t);svg.append(g)}d.append(el('p','像素：'+r.geometry.width+'×'+r.geometry.height+'；alpha可見範圍 '+JSON.stringify(r.geometry.bounds)));if(r.ground)d.append(el('p','目前：'+r.current+'；地面縮放寬 '+r.ground.widthSourcePx+'px；'+r.ground.method));d.append(el('p','判讀：'+r.recommendation.status),el('p','建議：'+r.recommendation.text));if(r.rulers.length){const table=el('table'),head=el('tr');for(const title of ['參照／原圖端點','像素／誤差','假設實尺m','理想方形地盤（格）'])head.append(el('th',title));table.append(head);for(const ref of r.rulers){const tr=el('tr');for(const text of [ref.meaning+' '+JSON.stringify(ref.a)+'→'+JSON.stringify(ref.b),ref.sourceSpanPx+'px；每端±'+ref.pixelError,ref.realM.join(' / '),(ref.targetSquareLotTiles||[]).map(n=>n===null?'無上界':n.toFixed(2)).join(' / ')||'非地盤物件'])tr.append(el('td',text));table.append(tr)}d.append(table)}for(const note of r.manual?.notes||[])d.append(el('p',note));if(r.inheritedFrom)d.append(el('p','母圖：'+r.inheritedFrom+'，未將其座標直接套入本張'));if(r.sourceCalibration){const details=el('details');details.append(el('summary','既有座標／配置來源（不等於獨立實尺）'));const pre=el('pre',JSON.stringify(r.sourceCalibration,null,2));pre.style.whiteSpace='pre-wrap';details.append(pre);d.append(details)}if(!r.manual)d.append(el('p','此檔只有精確像素邊界及既有配置；未獨立確認真實物理尺寸。前輪設計參考：'+r.configuredSizeProposal.text));const link=el('a','查看原圖');link.href='../'+r.path;d.append(link)}function filter(){const text=$('#search').value.toLowerCase(),cat=$('#category').value;const chosen=rows.filter(r=>(!cat||r.category===cat)&&(!$('#lots').checked||(r.ground&&r.manual&&!r.inheritedFrom))&&(!$('#conflicts').checked||r.recommendation.status==='參照衝突')&&JSON.stringify([r.path,r.label,r.manual?.notes,r.rulers.map(x=>x.meaning)]).toLowerCase().includes(text));$('#count').textContent=chosen.length+' 張（完整檔案'+rows.length+'）';$('#list').replaceChildren();for(const r of chosen){const b=el('button',r.label+' · '+r.base);b.append(el('small',r.recommendation.status));b.onclick=()=>show(r);$('#list').append(b)}if(chosen[0])show(chosen[0]);else $('#detail').replaceChildren(el('p','沒有符合的素材'))}for(const s of ['#search','#category','#lots','#conflicts'])$(s).addEventListener('input',filter);filter();</script></html>`);
}

if (require.main === module) buildMeasuredRows().then(writeResults).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { measureReference, pickRecommendation, imageGeometry, UP, ALONG };
