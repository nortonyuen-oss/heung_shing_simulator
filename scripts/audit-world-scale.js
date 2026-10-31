#!/usr/bin/env node
// Proposal/report only. Never imported by the game and never writes model art or runtime settings.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const proposal = JSON.parse(read('data/world-scale-review.json'));
const festival = require('../festival-assets.js');
const shelter = require('../typhoon-shelter-assets.js');
const placement = JSON.parse(read('data/typhoon-shelter-placement.json'));
const survey = JSON.parse(read('data/building-scale-survey.json')).measurements;

function walk(dir) {
  if (!fs.existsSync(path.join(ROOT, dir))) return [];
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(file) : /\.(png|webp)$/i.test(entry.name) ? [file] : [];
  });
}

function getRegistrations() {
  const context = vm.createContext({
    DEFAULT_BUILDING_ANCHOR_MODE: 'bottom', resolveModelAssetPath: (p) => p,
    getManifestZoneModelMetadata: () => null,
  });
  vm.runInContext(`${read('constants.js')}\n${read('model-catalog.js')}`, context);
  const assets = read('model-assets.js');
  const start = assets.indexOf('function sortModelFiles(');
  const end = assets.indexOf('function selectInitialZoneModelsForPreload(');
  if (start < 0 || end <= start) throw new Error('Cannot locate model catalog functions');
  vm.runInContext(assets.slice(start, end), context);
  return JSON.parse(JSON.stringify(vm.runInContext(`(() => {
    const out = [];
    for (const [key, config] of [
      ...Object.entries(HOUSE_MODEL_SETS),
      ...COMMERCIAL_BUILDING_MODEL_SETS.map(c => [c.keyPrefix, c]),
      ...INDUSTRIAL_BUILDING_MODEL_SETS.map(c => [c.keyPrefix, c]),
    ]) out.push(...createModelEntries(key, sortModelFiles(config.fallbackSourceFiles || config.preferredFiles, config), config));
    out.push(...Object.values(POWER_PLANT_MODELS),
      ...Object.keys(SERVICE_BUILDING_MODELS).flatMap(getServiceBuildingModelsWithLegacy),
      ...Object.keys(SPECIAL_BUILDING_MODELS).flatMap(getAllSpecialBuildingModels),
      ...Object.values(HARBOR_MODELS), ...Object.values(PARK_MODELS), ...Object.values(BUS_DEPOT_MODELS));
    return out.map(m => ({ path: m.logicalPath || m.path, cols: m.footprintCols, rows: m.footprintRows,
      legacy: !!m.legacy, key: m.key || m.spriteKey }));
  })()`, context)));
}

function baseName(file) {
  return path.basename(file).replace(/\.(png|webp)$/i, '').replace(/__.*$/, '')
    .replace(/_day(?=_m$|$)/, '').replace(/_m$/, '').replace(/^eventGround_edges\d+$/, 'eventGround');
}

const fixed = new Map();
for (const entry of proposal.lots) {
  if (entry.lot.length !== 2 || !entry.lot.every(n => Number.isInteger(n) && n > 0)) throw new Error('Invalid proposed lot');
  for (const file of entry.files) {
    if (fixed.has(file)) throw new Error(`Duplicate proposal: ${file}`);
    fixed.set(file, entry);
  }
}

const round = (n) => Number(n.toFixed(3));
const tiles = (n) => `${round(n / proposal.tileMetres)} 格`;
const metric = (m, label) => ({
  proposed: `${label} ${m}m（${tiles(m)}）`, metres: { [label === '長' ? 'length' : 'height']: m },
  confidence: '低', action: '按米重新校正', reason: '設計尺寸／既有米制標記，未由實物測繪；按地面軸2.5px/m及直立軸3.062px/m覆核。',
});

function objectAdvice(file) {
  const base = baseName(file);
  if (/buildingDeco/.test(file)) return { proposed: '跟宿主窗格，無獨立格數', confidence: '中', action: '跟建築重新烘焙', reason: '幕牆貼花不佔地，不可按整張PNG高度當建築高度。' };
  if (/bunHillClimbers/.test(file)) return { ...metric(1.7, '高'), action: '按人物骨架校正', reason: '動畫／atlas沿用同一人高；蹲坐、手臂、道具不當身高。atlas整張不作單一人物。' };
  if (/^ts_/.test(base)) {
    const part = shelter.TYPHOON_SHELTER_PARTS_BY_ID[base.slice(3)];
    const objectId = part?.sheet?.replace(/\.png$/, '') || base.slice(3).replace(/_[ab]$/, '');
    const size = shelter.getTyphoonShelterRealSize(objectId, placement.objects?.[objectId])
      || shelter.getTyphoonShelterRealSize(part?.id, placement.objects?.[part?.id]);
    if (size) return { ...metric(size.lengthM || size.heightM, size.lengthM ? '長' : '高'),
      confidence: '中', reason: '沿用目前有效米制尺寸（含placement覆寫）；長度已有2.5px/m基準，不能一律縮至61%。闊度及高度仍須由地面角與立面分開核對。' };
    return { proposed: '拼接面20m／半格10m；個別底角待覆量', confidence: '低', action: '跟海濱模組校正', reason: '地面填片、岸牆及邊石以實際模組端點定長；不可拿透明畫布寬度定米數。' };
  }
  if (/^fx_/.test(base)) {
    const part = festival.FESTIVAL_PARTS_BY_ID[base.slice(3)];
    if (part?.lengthM || part?.heightM) return { ...metric(part.lengthM || part.heightM, part.lengthM ? '長' : '高'),
      confidence: '中', reason: '沿用festival-assets既有設計米數；高度5px/m須改依3.062px/m的立面參考，地面長度另按2.5px/m。人群以個人非整群高度校正；幾何棚檔不得整圖等比縮放。' };
    return { proposed: '按單件底角／人物覆量；暫無可信格數', confidence: '低', action: '補米制尺寸', reason: '缺少可直接使用的尺寸標記，不用猜測值冒充量度。' };
  }
  if (/\/bunHill\//.test(file)) return { ...metric(/Stage/.test(base) ? 8 : /Sign/.test(base) ? 4 : 14, /Stage/.test(base) ? '長' : '高'), reason: '包山高14m、戲台長8m、牌樓高4m作設計起點；舊geometry的heightM可能由5px/m反推，需用人物與竹棚跨距重新核對。' };
  if (/\/streetFoodPeople\//.test(file)) return { ...metric(/Boy|Girl/.test(base) ? 1.3 : 1.7, '高'), action: '未接入；按骨架校正', reason: '新素材尚未接入。站立成人1.7m、兒童1.3m為設計參考；坐姿沿用人物四肢比例，不把坐姿輪廓拉成1.7m。' };
  if (/\/streetFood\//.test(file)) {
    if (/Stool/i.test(base)) return { ...metric(0.45, '高'), action: '未接入；量凳面高度', reason: '凳面高0.45m；摺疊款按同款凳的實體尺寸，不按摺起輪廓拉成坐凳。' };
    if (/Table/i.test(base)) return { ...metric(0.75, '高'), reason: '圓桌直徑約0.9m（0.045格）、桌面高0.75m；摺疊版沿用同一桌面直徑。' };
    return { ...metric(1.6, '長'), metres: { length: 1.6, width: 0.75, counterHeight: 0.9 }, proposed: '1.6×0.75m（0.08×0.0375格），檯高0.9m', action: '未接入；按車身底角校正', reason: '車身、車輪、爐具與人各自核對；現有新素材只做過投影校正，未完成米制校正。' };
  }
  if (/\/aircraft\//.test(file)) return { ...metric(38, '長'), proposed: '機長38m、翼展36m（1.9×1.8格）', metres: { length: 38, width: 36 }, reason: '暫以窄體客機設計尺寸；兩塗裝未確認具體機型。不可跟縮小機場按相對比例縮飛機；寬體機須獨立定型號及尺寸。' };
  if (/\/vessels\//.test(file)) return /cargoShip/.test(base)
    ? { ...metric(140, '長'), proposed: '船身140×22m（7×1.1格），水道另計', metres: { length: 140, width: 22 }, reason: '按圖中小型貨櫃船作支線船設計，非巨型遠洋船；20／40呎貨櫃是覆量基準，三個載貨狀態同船長。' }
    : { ...metric(/ferryPier/.test(base) ? 28 : 30, '長'), reason: '碼頭28m／渡輪30m作本地渡輪基準；雙視圖需分件，不當整張圖一艘船。' };
  if (/\/traffic\//.test(file)) {
    if (/lightPost/.test(file)) return metric(8, '高');
    const cat = file.split('/')[2];
    const m = ({ car: 4.6, taxi: 4.7, bus: 12, minibus: 7, truck: 7, van: 5, icecream: 5 })[cat];
    if (m) return { ...metric(m, '長'), reason: '依類型設定的初步實體長度，未確認車型規格；各視角按輪軸／車頭車尾校，不用alpha輪廓寬度直接當車長。' };
  }
  if (/\/busStop\//.test(file)) return { ...metric(6, '長'), proposed: '上蓋6×1.8m（0.3×0.09格），高2.6m；停車帶另計', metres: { length: 6, width: 1.8, height: 2.6 }, reason: '站牌頂高約3.5m；四方向同尺，巴士泊位約15m長，不需要整格車站建築。' };
  if (/\/trafficLight\//.test(file)) return metric(4.2, '高');
  if (/\/bareLand\//.test(file)) return /container/.test(base)
    ? { ...metric(6.058, '長'), reason: '暫以20呎箱長6.058m、闊2.438m、高2.591m作單箱基準；圖中長箱須判斷是否40呎（12.192m）。多箱堆疊不以整堆縮成一箱。' }
    : metric(/truck/i.test(base) ? 7 : /van/i.test(base) ? 5 : 4.6, '長');
  if (/\/trees\//.test(file)) {
    const id = Number(base.match(/\d+/)?.[0]);
    const heights = { 1: 16, 2: 10, 3: 14, 4: 9, 5: 9, 6: 12, 7: 14, 8: 9, 9: 10, 10: 7, 11: 9, 12: 14, 13: 8, 14: 12, 15: 10 };
    return { ...metric(heights[id] || 10, '高'), reason: '樹形設計高度，非樹種學測量；樹根到樹冠頂量高，樹冠闊度另量，不把樹冠投影當高度。' };
  }
  if (/\/roadAssessories\//.test(file)) {
    const sizes = [ [/phoneBooth/i, 2.3], [/newsstand|wontonStall/i, 2.2], [/parkingMeter/i, 1.5], [/Hydrant|hydrant/i, 0.9], [/postbox/i, 1.3], [/streetSign|路牌|街牌/i, 2.8], [/cabinet|Cabinet/i, 1.4], [/bollard/i, 0.9], [/railing|Railing|parapet/i, 1.1], [/bench/i, 0.85], [/bin|Bin/i, 1] ];
    const m = sizes.find(([re]) => re.test(base))?.[1];
    if (m) return { ...metric(m, '高'), reason: '單件設計高度；長凳長1.8m，普通欄杆段長2m，橋邊連續護欄按20m模組拼接。雙視圖先分件；pendingReview維持未接入狀態。' };
  }
  if (/landscape/.test(file) && /tree|conifer/i.test(base)) return metric(/Tall/.test(base) ? 12 : 7, '高');
  if (/landscape|newRoadTiles|kenney_isometric-roads/.test(file)) return { proposed: '1×1（20×20m）地面模組', lot: [1, 1], confidence: '中', action: '保留格數、重校內部尺寸', reason: '地面菱形固定100×50px；普通雙線路車道合計約7m，行人路另配；橋、坡及海岸方向變種沿用同尺。舊底板厚度不當地形海拔。_original160及Kenney僅列來源／備用，不視作全部在用。' };
  return { proposed: '待辨識；不自動賦予1×1', confidence: '低', action: '人工覆核', reason: '盤點保留此檔，不能因缺尺寸而漏列或偽造尺寸。' };
}

function buildRows() {
  const registrations = getRegistrations();
  const files = ['Models', 'newRoadTiles', 'kenney_isometric-roads'].flatMap(walk).sort();
  const missing = [...fixed.keys()].filter(name => !files.some(file => baseName(file) === name));
  if (missing.length) throw new Error(`Proposal references absent artwork: ${missing.join(', ')}`);
  return files.map(file => {
    const current = registrations.filter(m => m.path === file);
    const advice = fixed.get(baseName(file));
    return { path: file, category: file.startsWith('Models/') ? file.split('/')[1] : file.split('/')[0],
      base: baseName(file), current: current.map(m => `${m.cols}×${m.rows}${m.legacy ? '（舊）' : ''}`).join(' / ') || '非地盤素材／來源檔',
      ...(advice ? { proposed: `${advice.lot.join('×')}（${advice.lot.map(n => n * proposal.tileMetres).join('×')}m）`,
        lot: advice.lot, confidence: advice.confidence, action: advice.action, reason: advice.reason } : objectAdvice(file)),
      evidence: advice ? (survey[file] ? '既有量度＋設計假設' : '目視／用途估算；見備註') : '尺寸標記或類型設計估算；見備註',
      variant: /__|_m\.|_day|eventGround_edges/.test(file),
    };
  });
}

const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const csv = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;
function writeReports(rows) {
  const canonical = rows.filter(r => !r.variant);
  const lots = canonical.filter(r => fixed.has(r.base));
  const tally = Object.fromEntries([...new Set(rows.map(r => r.category))].map(cat => [cat, rows.filter(r => r.category === cat).length]));
  const summary = { date: proposal.date, tileMetres: proposal.tileMetres, count: rows.length, filesByCategory: tally, rows };
  fs.writeFileSync(path.join(ROOT, 'docs/world-scale-assets.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, 'docs/world-scale-assets.csv'), '\uFEFF' + [
    ['檔案', '分類', '目前格數', '建議格數／米數', '可信程度', '處理方式', '依據及限制'].map(csv).join(','),
    ...rows.map(r => [r.path, r.category, r.current, r.proposed, r.confidence, r.action, r.reason].map(csv).join(',')),
  ].join('\n') + '\n');
  const lines = [
    '# 全部地盤素材建議格數', '', `日期：${proposal.date}。1格＝20m；只作建議，未套用遊戲。`, '',
    '**此為第一輪目視設計草稿，已由 [原圖取點覆量報告](world-scale-measured.md) 取代；請以新報告的量度線、假設及衝突結果為準。**', '',
    `逐檔盤點 ${rows.length} 張世界素材，包含方向、鏡像、日夜及動畫衍生檔；下表列 ${lots.length} 張地盤母圖。`, '',
    '可信程度：高＝格網模組明確；中＝有既有量度或已知尺寸基準，但尚未完成多基準覆核；低＝目視／用途設計初稿，可能差一格以上。', '',
    '低可信格數是建議起點，不能當成已量度的實際尺寸。「保留地盤」亦不代表原圖本體已合比例。', '',
    '完整細物件及衍生檔見 [帶圖清單](world-scale-assets.html)、[CSV](world-scale-assets.csv)、[JSON](world-scale-assets.json)。方法及大型設施決策見 [審閱說明](world-scale-review.md)。', '',
  ];
  for (const cat of [...new Set(lots.map(r => r.category))]) {
    lines.push(`## ${cat}`, '', '| 素材 | 目前 | 建議 | 可信 | 處理及依據 |', '|---|---|---|---|---|');
    for (const r of lots.filter(r => r.category === cat)) lines.push(`| [${path.basename(r.path)}](../${r.path}) | ${r.current} | ${r.proposed} | ${r.confidence} | ${r.action}：${r.reason} |`);
    lines.push('');
  }
  lines.push('## 逐類盤點數量', '', '| 分類 | 圖檔數（含衍生檔） |', '|---|---:|');
  for (const [cat, count] of Object.entries(tally)) lines.push(`| ${cat} | ${count} |`);
  fs.writeFileSync(path.join(ROOT, 'docs/world-scale-proposals.md'), lines.join('\n') + '\n');
  const payload = JSON.stringify(rows).replaceAll('<', '\\u003c');
  fs.writeFileSync(path.join(ROOT, 'docs/world-scale-assets.html'), `<!doctype html><html lang="zh-HK"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>20m 世界素材比例建議</title>
<style>body{font:15px system-ui;background:#19262c;color:#e8efea;margin:24px}a{color:#9ed8bb}header{position:sticky;top:0;background:#19262cf5;padding:12px 0;z-index:2}input,select{font:inherit;padding:8px;margin:4px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}article{background:#26373f;border:1px solid #496067;border-radius:8px;padding:14px}img{width:100%;height:230px;object-fit:contain;background:#33464c}h2{font-size:15px;overflow-wrap:anywhere}p{line-height:1.6}.muted{color:#b7c9c6}b{color:#f2d69b}</style>
<header><h1>全部世界素材：1格＝20m</h1><p><b>此為第一輪目視草稿，請改看 <a href="world-scale-measured.html">最新原圖取點覆量報告</a>。</b></p><p>建議稿，未改遊戲。縮圖只供辨識，並非同尺展示；格數及可信程度以文字為準。</p><input id="q" aria-label="搜尋素材" placeholder="搜尋模型、設施或處理方式"><select id="cat" aria-label="分類"><option value="">全部分類</option>${Object.keys(tally).map(c => `<option>${escape(c)}</option>`).join('')}</select><label><input type="checkbox" id="derived">包含鏡像／日夜衍生檔</label><p id="count" class="muted"></p></header><main id="cards"></main>
<script>const rows=${payload};const q=document.querySelector('#q'),cat=document.querySelector('#cat'),derived=document.querySelector('#derived'),cards=document.querySelector('#cards');function show(){const query=q.value.toLowerCase();const selected=rows.filter(r=>(!cat.value||cat.value===r.category)&&(derived.checked||!r.variant)&&JSON.stringify(r).toLowerCase().includes(query));document.querySelector('#count').textContent=selected.length+' 張／完整盤點 '+rows.length+' 張';cards.replaceChildren();for(const r of selected){const a=document.createElement('article');const img=document.createElement('img');img.loading='lazy';img.src='../'+r.path;img.alt=r.base;a.append(img);const h=document.createElement('h2');h.textContent=r.path;a.append(h);for(const text of ['目前：'+r.current,'建議：'+r.proposed,'可信：'+r.confidence+'；'+r.action,r.reason]){const p=document.createElement('p');p.textContent=text;a.append(p)}const link=document.createElement('a');link.href='../'+r.path;link.textContent='查看原圖';a.append(link);cards.append(a)}}for(const el of [q,cat,derived])el.addEventListener('input',show);show();</script></html>`);
  console.log(JSON.stringify({ files: rows.length, lotMasters: lots.length, missingAdvice: rows.filter(r => r.action === '人工覆核').map(r => r.path), filesByCategory: tally }, null, 2));
}

if (require.main === module) writeReports(buildRows());
module.exports = { buildRows, baseName, objectAdvice, getRegistrations };
